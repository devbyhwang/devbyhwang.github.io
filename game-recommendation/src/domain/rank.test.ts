import { describe, expect, it } from "vitest";
import { opportunity, percentile, rankGames } from "./rank";
import { SAMPLE_CATALOG } from "./fixtures";
import type { FilteredGame } from "./filter";
import { VIBE_KEYS } from "./types";
import type { Game } from "./types";

const byId = (id: string): Game => SAMPLE_CATALOG.find((g) => g.id === id)!;
const wrap = (games: Game[], marginal = false): FilteredGame[] =>
  games.map((game) => ({ game, marginalSession: marginal }));

describe("opportunity", () => {
  it("viewers / (channels + 10)", () => {
    const g = { buzz: { twitchViewers: 1000, twitchChannels: 90 } } as Game;
    expect(opportunity(g)).toBeCloseTo(10);
  });

  it("채널 1개 이벤트 방송이 다수 채널 게임을 압도하지 못한다", () => {
    const solo = { buzz: { twitchViewers: 30000, twitchChannels: 1 } } as Game;
    const spread = { buzz: { twitchViewers: 30000, twitchChannels: 200 } } as Game;
    // 수축이 없으면 30000 대 150. 수축 후에도 solo가 크지만 비율이 크게 줄어든다.
    expect(opportunity(solo) / opportunity(spread)).toBeLessThan(25);
  });
});

describe("percentile", () => {
  it("최댓값은 1에 가깝고 최솟값은 0에 가깝다", () => {
    const vs = [1, 2, 3, 4, 5];
    expect(percentile(vs, 5)).toBeGreaterThan(percentile(vs, 1));
    expect(percentile(vs, 5)).toBeLessThanOrEqual(1);
    expect(percentile(vs, 1)).toBeGreaterThanOrEqual(0);
  });

  it("원소가 하나면 0.5", () => {
    expect(percentile([7], 7)).toBe(0.5);
  });

  it("동점은 같은 값을 받는다", () => {
    const vs = [1, 2, 2, 3];
    // n=4, less(<2)=1, equal(=2)=2 → (1 + 2/2) / 4 = 0.5
    expect(percentile(vs, 2)).toBeCloseTo(0.5);
  });
});

describe("rankGames", () => {
  it("점수 내림차순으로 정렬한다", () => {
    const scored = rankGames(wrap(SAMPLE_CATALOG));
    for (let i = 1; i < scored.length; i++) {
      expect(scored[i - 1].score).toBeGreaterThanOrEqual(scored[i].score);
    }
  });

  it("채널 수가 부족한 게임을 랭킹에서 제외한다", () => {
    const scored = rankGames(wrap(SAMPLE_CATALOG));
    expect(scored.some((s) => s.game.id === "g27")).toBe(false);
  });

  it("players unknown에 감점을 준다", () => {
    const a = byId("g26");                       // unknown
    const b = { ...byId("g26"), id: "clone", players: { ...a.players, max: 4, source: "igdb_multiplayer" as const } };
    const scored = rankGames(wrap([a, b]));
    const sa = scored.find((s) => s.game.id === "g26")!;
    const sb = scored.find((s) => s.game.id === "clone")!;
    expect(sa.score).toBeLessThan(sb.score);
  });

  it("marginal 세션에 감점을 준다", () => {
    const g = byId("g20");
    const scored = rankGames([
      { game: g, marginalSession: false },
      { game: { ...g, id: "m" }, marginalSession: true },
    ]);
    const normal = scored.find((s) => s.game.id === g.id)!;
    const marginal = scored.find((s) => s.game.id === "m")!;
    expect(marginal.score).toBeLessThan(normal.score);
  });

  it("각 결과에 opportunity와 topOnTwitch 항을 담는다", () => {
    const scored = rankGames(wrap(SAMPLE_CATALOG));
    const kinds = scored[0].terms.map((t) => t.kind);
    expect(kinds).toContain("opportunity");
    expect(kinds).toContain("topOnTwitch");
  });

  it("항 기여도의 합이 score와 일치한다", () => {
    const scored = rankGames(wrap(SAMPLE_CATALOG));
    for (const s of scored) {
      const sum = s.terms.reduce((acc, t) => acc + t.contribution, 0);
      expect(sum).toBeCloseTo(s.score, 6);
    }
  });

  it("vibe는 score에 전혀 기여하지 않는다 — 분위기는 필터링에만 쓰이고 랭킹은 인기로만 결정된다", () => {
    const g = byId("g5");
    const allZero = Object.fromEntries(VIBE_KEYS.map((k) => [k, 0])) as Game["vibes"];
    const allOne = Object.fromEntries(VIBE_KEYS.map((k) => [k, 1])) as Game["vibes"];
    const low = { ...g, id: "low-vibe", vibes: allZero };
    const high = { ...g, id: "high-vibe", vibes: allOne };
    const scored = rankGames(wrap([low, high]));
    const sLow = scored.find((s) => s.game.id === "low-vibe")!;
    const sHigh = scored.find((s) => s.game.id === "high-vibe")!;
    expect(sLow.score).toBeCloseTo(sHigh.score, 10);
  });

  it("시청자 수만으로 정렬한 1위와 결과 1위가 갈릴 수 있다", () => {
    // 채널이 많아 묻히는 게임(A)보다, 시청자는 적지만 채널이 적은 게임(B)이 이겨야 한다
    const a = { ...byId("g22"), id: "wide", buzz: { twitchViewers: 40000, twitchChannels: 1600, viewerGrowth7d: null, isNewRelease: false } };
    const b = { ...byId("g22"), id: "narrow", franchise: undefined, buzz: { twitchViewers: 9000, twitchChannels: 60, viewerGrowth7d: null, isNewRelease: false } };
    const scored = rankGames(wrap([a, b]));
    expect(scored[0].game.id).toBe("narrow");
  });
});
