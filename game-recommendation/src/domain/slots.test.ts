import { describe, expect, it } from "vitest";
import { buildSlots } from "./slots";
import { rankGames } from "./rank";
import { SAMPLE_CATALOG } from "./fixtures";
import type { FilteredGame } from "./filter";
import type { Game } from "./types";

const wrap = (games: Game[]): FilteredGame[] =>
  games.map((game) => ({ game, marginalSession: false }));

const run = (games: Game[]) => {
  const candidates = wrap(games);
  const ranked = rankGames(candidates);
  return buildSlots({ safe: ranked, rising: ranked, newCandidates: candidates });
};

describe("buildSlots", () => {
  it("safe 슬롯을 최대 3개까지 점수 순으로 채운다", () => {
    const slots = run(SAMPLE_CATALOG);
    const safe = slots.filter((s) => s.slot === "safe");
    expect(safe.length).toBe(3);
    for (let i = 1; i < safe.length; i++) {
      expect(safe[i - 1].scored.score).toBeGreaterThanOrEqual(safe[i].scored.score);
    }
  });

  it("같은 프랜차이즈를 두 번 넣지 않는다", () => {
    const overcooked = SAMPLE_CATALOG.filter((g) => g.franchise === "Overcooked");
    expect(overcooked.length).toBe(2);
    const slots = run(SAMPLE_CATALOG);
    const franchises = slots
      .map((s) => s.scored.game.franchise)
      .filter((f): f is string => Boolean(f));
    expect(new Set(franchises).size).toBe(franchises.length);
  });

  it("rising 슬롯은 성장률 상위 1개를 넣는다", () => {
    // safe 3자리는 g24/g15/g16이 차지하고, 그다음 성장률 최고(2.6배)는 g10이다.
    const slots = run(SAMPLE_CATALOG);
    const rising = slots.filter((s) => s.slot === "rising");
    expect(rising.length).toBe(1);
    expect(rising[0].scored.game.id).toBe("g10");
    expect(rising[0].scored.game.buzz.viewerGrowth7d).not.toBeNull();
  });

  it("성장률이 전부 null이면 rising 슬롯을 비운다", () => {
    const noGrowth = SAMPLE_CATALOG.map((g) => ({
      ...g,
      buzz: { ...g.buzz, viewerGrowth7d: null },
    }));
    const slots = run(noGrowth);
    expect(slots.some((s) => s.slot === "rising")).toBe(false);
  });

  it("성장률에 볼륨 바닥을 적용한다", () => {
    const tiny: Game = {
      ...SAMPLE_CATALOG[0],
      id: "tiny",
      franchise: undefined,
      buzz: { twitchViewers: 40, twitchChannels: 6, viewerGrowth7d: 9.0, isNewRelease: false },
    };
    const slots = run([...SAMPLE_CATALOG, tiny]);
    const rising = slots.find((s) => s.slot === "rising");
    expect(rising?.scored.game.id).not.toBe("tiny");
  });

  it("1.2배 성장은 rising에서 제외하고 1.3배는 포함한다", () => {
    // 성장 배수 하한을 다시 1보다 크게 낮추면, 볼륨은 충분하지만 1.2배인 이 게임이
    // "지금 뜨는 중" 슬롯을 차지하게 된다.
    const base = SAMPLE_CATALOG.find((g) => g.id === "g16")!;
    const below: Game = {
      ...base,
      id: "below",
      franchise: undefined,
      releaseDate: "2020-01-01T00:00:00.000Z",
      rating: undefined,
      buzz: { ...base.buzz, viewerGrowth7d: 1.2, isNewRelease: false },
    };

    const safeFillers = ["safe-1", "safe-2", "safe-3"].map((id, index): Game => ({
      ...below,
      id,
      buzz: {
        ...below.buzz,
        twitchViewers: 10_000 - index * 1_000,
        twitchChannels: 10,
        viewerGrowth7d: null,
      },
    }));
    const at: Game = {
      ...below,
      id: "at",
      buzz: { ...below.buzz, viewerGrowth7d: 1.3 },
    };
    const slots = run([...safeFillers, below, at]);

    expect(slots.find((slot) => slot.slot === "rising")?.scored.game.id).toBe("at");
  });

  it("신작 슬롯은 채널 수가 적어도 후보가 된다", () => {
    // g27은 채널 2개라 랭킹(safe/rising)에서 빠지지만, 신작 + 리뷰 55개라 new 슬롯에는 올라야 한다
    const g27 = SAMPLE_CATALOG.find((g) => g.id === "g27")!;
    const others = SAMPLE_CATALOG.filter(
      (g) => g.vibes.horror >= 0.5 && !g.buzz.isNewRelease,
    );
    const slots = run([...others, g27]);
    const isNew = slots.filter((s) => s.slot === "new");
    expect(isNew.length).toBe(1);
    expect(isNew[0].scored.game.id).toBe("g27");
    expect(slots.filter((s) => s.slot === "safe").every((s) => s.scored.game.id !== "g27")).toBe(true);
  });

  it("리뷰가 부족한 신작은 new 슬롯에 넣지 않는다", () => {
    const flimsy: Game = {
      ...SAMPLE_CATALOG[0],
      id: "flimsy",
      franchise: undefined,
      rating: 100,
      reviewCount: 3,
      buzz: { twitchViewers: 100, twitchChannels: 6, viewerGrowth7d: null, isNewRelease: true },
    };
    const slots = run([flimsy]);
    expect(slots.some((s) => s.scored.game.id === "flimsy" && s.slot === "new")).toBe(false);
  });

  it("같은 게임이 두 슬롯에 중복되지 않는다", () => {
    const slots = run(SAMPLE_CATALOG);
    const ids = slots.map((s) => s.scored.game.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("safe → rising → new 순서로 반환한다", () => {
    const slots = run(SAMPLE_CATALOG);
    const order = slots.map((s) => s.slot);
    const rank = { safe: 0, rising: 1, new: 2 } as const;
    for (let i = 1; i < order.length; i++) {
      expect(rank[order[i]]).toBeGreaterThanOrEqual(rank[order[i - 1]]);
    }
  });

  it("후보가 하나도 없으면 빈 배열을 반환한다", () => {
    expect(buildSlots({ safe: [], rising: [], newCandidates: [] })).toEqual([]);
  });
});
