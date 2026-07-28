import { describe, expect, it, vi } from "vitest";
import { MIN_CHANNELS_FOR_RANKING } from "./constants";
import { recommend } from "./recommend";
import { SAMPLE_CATALOG } from "./fixtures";
import { VIBE_KEYS } from "./types";
import type { Game, Query } from "./types";

const q = (over: Partial<Query> = {}): Query => ({
  length: "medium",
  players: 1,
  viewerParticipation: false,
  vibe: "hardcore",
  ...over,
});

describe("recommend", () => {
  it("여유로운 조건에서는 완화 없이 safe 3개를 채운다", () => {
    const r = recommend(SAMPLE_CATALOG, q());
    expect(r.relaxations).toEqual([]);
    expect(r.picks.filter((p) => p.slot === "safe").length).toBe(3);
  });

  it("결과는 최대 5개다", () => {
    const r = recommend(SAMPLE_CATALOG, q());
    expect(r.picks.length).toBeLessThanOrEqual(5);
  });

  it("모든 pick에 근거가 1개 이상 붙는다", () => {
    const r = recommend(SAMPLE_CATALOG, q());
    for (const p of r.picks) {
      expect(p.why.length).toBeGreaterThanOrEqual(1);
      expect(p.why[0].text.trim().length).toBeGreaterThan(0);
    }
  });

  it("빡빡한 조건에서는 완화를 기록한다", () => {
    const r = recommend(SAMPLE_CATALOG, q({
      players: 4,
      vibe: "healing",
      viewerParticipation: true,
      length: "short",
    }));
    expect(r.relaxations.length).toBeGreaterThan(0);
  });

  it("완화 순서는 vibe → session → viewerPlayable 이다", () => {
    const r = recommend(SAMPLE_CATALOG, q({
      players: 4,
      vibe: "healing",
      viewerParticipation: true,
      length: "short",
    }));
    const order = ["vibeThreshold", "sessionShape", "viewerPlayable"];
    const idx = r.relaxations.map((x) => order.indexOf(x));
    for (let i = 1; i < idx.length; i++) {
      expect(idx[i]).toBeGreaterThan(idx[i - 1]);
    }
  });

  it("어떤 완화 단계에서도 인원 조건을 어기지 않는다", () => {
    for (const vibe of ["healing", "variety", "horror", "hardcore", "chatting", "spectacle"] as const) {
      const r = recommend(SAMPLE_CATALOG, q({ players: 4, vibe, viewerParticipation: true, length: "short" }));
      for (const p of r.picks) {
        if (p.game.players.max !== "unknown") {
          expect(p.game.players.max, `${vibe} / ${p.game.name}`).toBeGreaterThanOrEqual(4);
        }
      }
    }
  });

  it("시청자 참여를 완화하지 않았다면 결과가 전부 참여 가능하다", () => {
    // SAMPLE_CATALOG에는 viewerPlayable 게임이 2개뿐이라 safe 3칸을 못 채우고
    // 사다리가 항상 viewerPlayable까지 내려간다 → 단언이 한 번도 실행되지 않는다.
    // 완화 없이 safe가 차는 전용 카탈로그를 만들어 실제 경로를 태운다.
    const base = (id: string) => {
      const g = SAMPLE_CATALOG.find((x) => x.id === id);
      if (!g) throw new Error(`fixture ${id} 없음`);
      return g;
    };
    const withViewerPlayable = (g: Game, ok: boolean): Game => ({
      ...g,
      franchise: undefined,
      viewerPlayable: { ok },
    });

    // chatting >= VIBE_THRESHOLD_BASE, 채널 수 >= 랭킹 하한, medium 세션 적합.
    const catalog: Game[] = [
      withViewerPlayable(base("g20"), true), // Vampire Survivors, chatting 0.9
      withViewerPlayable(base("g21"), true), // Balatro, chatting 0.85
      withViewerPlayable(base("g23"), true), // PowerWash Simulator, chatting 0.9
      withViewerPlayable(base("g1"), false), // Stardew Valley, chatting 0.7 — 걸러져야 한다
    ];

    // 전제 조건: 필터가 실제로 배제할 대상이 카탈로그에 존재한다.
    expect(catalog.some((g) => !g.viewerPlayable.ok)).toBe(true);
    expect(catalog.filter((g) => g.viewerPlayable.ok).length).toBeGreaterThanOrEqual(3);

    const r = recommend(catalog, q({ vibe: "chatting", viewerParticipation: true }));

    expect(r.relaxations).not.toContain("viewerPlayable");
    expect(r.picks.filter((p) => p.slot === "safe").length).toBe(3);
    expect(r.picks.length).toBeGreaterThan(0);
    for (const p of r.picks) {
      expect(p.game.viewerPlayable.ok, p.game.name).toBe(true);
    }
  });

  it("아무 후보도 새로 들이지 못한 완화는 기록하지 않는다", () => {
    // SESSION_FIT은 short × chapter만 reject다. medium/long 길이에서는
    // allowRejectedSession이 어떤 게임도 추가로 통과시키지 못하는 보장된 공회전이므로,
    // 사다리가 그 칸에 도달하더라도 "방송 길이 조건을 완화했습니다"라고 기록해선 안 된다.
    for (const length of ["medium", "long"] as const) {
      for (const players of [1, 2, 3, 4, 5]) {
        for (const viewerParticipation of [false, true]) {
          for (const vibe of VIBE_KEYS) {
            const r = recommend(SAMPLE_CATALOG, { length, players, viewerParticipation, vibe });
            expect(
              r.relaxations,
              `length=${length} players=${players} vp=${viewerParticipation} vibe=${vibe}`,
            ).not.toContain("sessionShape");
          }
        }
      }
    }
  });

  it("뒤의 완화로 효과가 생긴 앞선 완화도 기록한다 (짧은 방송 × 빡겜, 시청자 참여 요구)", () => {
    // players=2, viewerParticipation=true, vibe=hardcore, length=short 조합에서는
    // vibeThreshold·sessionShape 완화 모두 viewerPlayable 요건에 막혀 아무것도 통과시키지 못하고,
    // viewerPlayable 완화가 처음으로 g8/g9를 들인다. vibeThreshold는 최종 후보에 실제로
    // 영향을 주므로 기록하고, sessionShape는 끝까지 영향을 주지 않으므로 기록하지 않는다.
    const r = recommend(SAMPLE_CATALOG, {
      length: "short",
      players: 2,
      viewerParticipation: true,
      vibe: "hardcore",
    });
    expect(r.relaxations).toContain("vibeThreshold");
    expect(r.relaxations).not.toContain("sessionShape");
    expect(r.relaxations).toContain("viewerPlayable");
    expect(r.candidateCount).toBeGreaterThan(0);
  });

  it("후속 완화로 효과가 생긴 분위기 완화를 결과에 포함한다", () => {
    const base = SAMPLE_CATALOG.find((g) => g.id === "g20")!;
    const game = (id: string, viewerPlayable: boolean, chatting: number): Game => ({
      ...base,
      id,
      franchise: undefined,
      vibes: { ...base.vibes, chatting },
      viewerPlayable: { ok: viewerPlayable },
      buzz: { ...base.buzz, twitchViewers: 1_000, twitchChannels: 20 },
    });
    const catalog = [
      game("strict-viewer", true, 0.8),
      game("weak-non-viewer", false, 0.4),
    ];

    const result = recommend(catalog, q({ vibe: "chatting", viewerParticipation: true }));

    expect(result.relaxations).toEqual(["vibeThreshold", "viewerPlayable"]);
    expect(result.candidateCount).toBe(2);
    expect(result.picks.map((pick) => pick.game.id)).toContain("weak-non-viewer");
    for (const pick of result.picks) {
      expect(pick.game.vibes.chatting, pick.game.name).toBeGreaterThanOrEqual(0.35);
    }
  });

  it("후보가 전혀 없어도 던지지 않고 빈 결과를 낸다", () => {
    const r = recommend([], q());
    expect(r.picks).toEqual([]);
    expect(r.candidateCount).toBe(0);
  });

  it("candidateCount는 최종 필터 통과 수다", () => {
    const r = recommend(SAMPLE_CATALOG, q());
    expect(r.candidateCount).toBeGreaterThan(0);
    expect(r.candidateCount).toBeLessThanOrEqual(SAMPLE_CATALOG.length);
  });

  it("완화로 safe에 들어온 게임은 rising이나 new에 넣지 않고 모든 슬롯의 인원 조건을 지킨다", () => {
    const base = SAMPLE_CATALOG.find((g) => g.id === "g16")!;
    const game = (
      id: string,
      viewers: number,
      channels: number,
      hardcore: number,
      growth: number,
      isNewRelease = false,
    ): Game => ({
      ...base,
      id,
      franchise: undefined,
      releaseDate: isNewRelease ? "2026-07-01T00:00:00.000Z" : "2020-01-01T00:00:00.000Z",
      players: { ...base.players, max: 2 },
      vibes: { ...base.vibes, hardcore },
      rating: isNewRelease ? 90 : undefined,
      reviewCount: isNewRelease ? 100 : undefined,
      buzz: { twitchViewers: viewers, twitchChannels: channels, viewerGrowth7d: growth, isNewRelease },
    });
    const relaxedOnly = game("relaxed-only", 50_000, 100, 0.4, 9);
    const relaxedNew = { ...game("relaxed-new", 800, 6, 0.4, 1, true), rating: 99 };
    const catalog = [
      game("strict-safe-1", 30_000, 100, 0.8, 1),
      game("strict-safe-2", 20_000, 100, 0.8, 1),
      game("strict-new", 900, 2, 0.8, 1, true),
      relaxedOnly,
      relaxedNew,
    ];

    const result = recommend(catalog, q({ players: 2 }));

    expect(result.relaxations).toContain("vibeThreshold");
    expect(result.picks.find((pick) => pick.slot === "safe")?.game.id).toBe("relaxed-only");
    expect(result.picks.find((pick) => pick.slot === "new")?.game.id).toBe("strict-new");
    expect(result.picks.filter((pick) => pick.slot !== "safe").map((pick) => pick.game.id)).not.toContain("relaxed-new");
    for (const pick of result.picks) {
      expect(pick.game.players.max).toBeGreaterThanOrEqual(2);
    }
  });

  it.each([
    ["2026-06-28T00:00:00.000Z", "30일 전 출시"],
    ["2026-06-27T00:00:00.000Z", "31일 전 출시"],
  ])("catalog 기준일로 신작 출시 경과를 계산한다: %s", (releaseDate, expected) => {
    const base = SAMPLE_CATALOG.find((g) => g.id === "g27")!;
    const catalog: Game[] = [{
      ...base,
      releaseDate,
      buzz: { ...base.buzz, isNewRelease: true },
    }];

    vi.useFakeTimers();
    vi.setSystemTime(new Date("2027-07-28T00:00:00.000Z"));
    try {
      const result = recommend(catalog, q({ vibe: "horror" }), "2026-07-28T00:00:00.000Z");

      expect(result.picks.find((pick) => pick.slot === "new")?.why[0].text).toContain(expected);
    } finally {
      vi.useRealTimers();
    }
  });
});

describe("blockedBy", () => {
  it("결과가 있으면 null이다", () => {
    const r = recommend(SAMPLE_CATALOG, q());
    expect(r.picks.length).toBeGreaterThan(0);
    expect(r.blockedBy).toBeNull();
  });

  it("인원 때문에 후보가 0이면 players를 가리킨다", () => {
    // pMax가 unknown인 게임은 설계상 인원 필터를 항상 통과하므로 제외한다.
    // 남은 게임의 최대 인원은 15라서 16명 요청은 인원 단계에서 전부 걸린다.
    const withoutUnknown = SAMPLE_CATALOG.filter((g) => g.players.max !== "unknown");
    const r = recommend(withoutUnknown, q({ players: 16 }));
    expect(r.picks).toEqual([]);
    expect(r.blockedBy).toBe("players");
  });

  it("분위기 때문에 후보가 0이면 vibe를 가리킨다", () => {
    const noHorror = SAMPLE_CATALOG.map((g) => ({
      ...g,
      vibes: { ...g.vibes, horror: 0 },
    }));
    const r = recommend(noHorror, q({ vibe: "horror" }));
    expect(r.picks).toEqual([]);
    expect(r.blockedBy).toBe("vibe");
  });

  it("필터는 통과했으나 랭킹에서 아무도 남지 않으면 other를 가리킨다", () => {
    // 인원·분위기 필터는 통과하지만 전원이 채널 수 하한(MIN_CHANNELS_FOR_RANKING)에
    // 미달해 랭킹에서 탈락하고, 신작 슬롯 자격도 없는 카탈로그.
    const unrankable: Game[] = SAMPLE_CATALOG
      .filter((g) => g.vibes.hardcore >= 0.5 && g.players.max !== "unknown")
      .map((g) => ({
        ...g,
        buzz: {
          ...g.buzz,
          twitchChannels: MIN_CHANNELS_FOR_RANKING - 1,
          isNewRelease: false,   // 신작 슬롯으로 새어나가지 않도록
        },
      }));

    // 전제 조건: 필터를 통과할 후보 자체는 존재한다.
    expect(unrankable.length).toBeGreaterThan(0);

    const r = recommend(unrankable, q());
    // 먼저 실제로 결과가 0인지 확인한 뒤에 원인을 단언한다.
    expect(r.picks).toEqual([]);
    expect(r.candidateCount).toBeGreaterThan(0);
    expect(r.blockedBy).toBe("other");
  });

  it("빈 카탈로그에서는 players를 가리킨다", () => {
    const r = recommend([], q());
    expect(r.blockedBy).toBe("players");
  });
});
