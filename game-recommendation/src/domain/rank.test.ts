import { describe, expect, it } from "vitest";
import { rankGames } from "./rank";
import { SAMPLE_CATALOG } from "./fixtures";
import type { FilteredGame } from "./filter";
import type { Game } from "./types";

const baseGame = SAMPLE_CATALOG[0]!;

const makeGame = (id: string, overrides: Partial<Game> = {}): Game => ({
  ...baseGame,
  id,
  name: overrides.name ?? id,
  franchise: overrides.franchise,
  releaseDate: overrides.releaseDate ?? "2020-01-01T00:00:00.000Z",
  players: { ...baseGame.players, ...overrides.players },
  sessionShape: overrides.sessionShape ?? "run",
  viewerPlayable: overrides.viewerPlayable ?? { ok: false },
  vibes: { ...baseGame.vibes, ...overrides.vibes },
  buzz: { ...baseGame.buzz, ...overrides.buzz },
  streaming: { ...baseGame.streaming, ...overrides.streaming },
  quality: { ...baseGame.quality, ...overrides.quality },
  topTags: overrides.topTags ?? baseGame.topTags,
  rating: overrides.rating ?? baseGame.rating,
  reviewCount: overrides.reviewCount ?? baseGame.reviewCount,
  steamAppId: overrides.steamAppId ?? baseGame.steamAppId,
  coverUrl: overrides.coverUrl ?? baseGame.coverUrl,
  storeUrl: overrides.storeUrl ?? baseGame.storeUrl,
});

const wrap = (games: Game[], marginalSession = false): FilteredGame[] =>
  games.map((game) => ({ game, marginalSession }));

describe("rankGames", () => {
  it("prefers a stable evenly distributed category over a one-stream event spike", () => {
    const eventSpike = makeGame("event-spike", {
      buzz: {
        twitchViewers: 32_000,
        twitchChannels: 1,
        viewerGrowth7d: 2.4,
        isNewRelease: false,
      },
      streaming: {
        totalViewers: 32_000,
        channelCount: 1,
        medianViewersPerChannel: 32_000,
        p75ViewersPerChannel: 32_000,
        top10ViewerShare: 1,
        viewerConcentration: 1,
        growth7d: 2.4,
        growth30d: 0.7,
        growth90d: 0.5,
        volatility30d: 0.9,
        observedSnapshots: 7,
        coverage: 0.2,
        asOf: "2026-07-29T00:00:00.000Z",
      },
      quality: {
        totalRating: 81,
        totalRatingCount: 40,
      },
      rating: 81,
      reviewCount: 40,
      topTags: [{ tag: "event", share: 1 }],
    });

    const steady = makeGame("steady", {
      buzz: {
        twitchViewers: 12_000,
        twitchChannels: 140,
        viewerGrowth7d: 1.3,
        isNewRelease: false,
      },
      streaming: {
        totalViewers: 12_000,
        channelCount: 140,
        medianViewersPerChannel: 74,
        p75ViewersPerChannel: 120,
        top10ViewerShare: 0.18,
        viewerConcentration: 0.15,
        growth7d: 1.3,
        growth30d: 1.25,
        growth90d: 1.2,
        volatility30d: 0.12,
        observedSnapshots: 90,
        coverage: 0.96,
        asOf: "2026-07-29T00:00:00.000Z",
      },
      quality: {
        totalRating: 88,
        totalRatingCount: 900,
      },
      rating: 88,
      reviewCount: 900,
      topTags: [{ tag: "co-op", share: 0.5 }, { tag: "party", share: 0.3 }],
    });

    const baseline = makeGame("baseline", {
      buzz: {
        twitchViewers: 7_000,
        twitchChannels: 80,
        viewerGrowth7d: 1.05,
        isNewRelease: false,
      },
      streaming: {
        totalViewers: 7_000,
        channelCount: 80,
        medianViewersPerChannel: 55,
        p75ViewersPerChannel: 88,
        top10ViewerShare: 0.3,
        viewerConcentration: 0.28,
        growth7d: 1.05,
        growth30d: 1.02,
        growth90d: 1,
        volatility30d: 0.2,
        observedSnapshots: 60,
        coverage: 0.8,
        asOf: "2026-07-29T00:00:00.000Z",
      },
      quality: {
        totalRating: 84,
        totalRatingCount: 250,
      },
      rating: 84,
      reviewCount: 250,
      topTags: [{ tag: "roguelite", share: 0.6 }],
    });

    const ranked = rankGames(wrap([eventSpike, steady, baseline]));

    expect(ranked[0]?.game.id).toBe("steady");
    expect(ranked[ranked.length - 1]?.game.id).toBe("event-spike");
  });

  it("keeps unknown-player and marginal-session penalties separate from the weighted terms", () => {
    const game = makeGame("penalized", {
      players: { ...baseGame.players, max: "unknown", source: "unknown" },
      buzz: { twitchViewers: 2_000, twitchChannels: 20, viewerGrowth7d: 1.1, isNewRelease: false },
      streaming: {
        totalViewers: 2_000,
        channelCount: 20,
        medianViewersPerChannel: 60,
        p75ViewersPerChannel: 90,
        top10ViewerShare: 0.35,
        viewerConcentration: 0.3,
        growth7d: 1.1,
        growth30d: 1.1,
        growth90d: 1.05,
        volatility30d: 0.2,
        observedSnapshots: 30,
        coverage: 0.8,
        asOf: "2026-07-29T00:00:00.000Z",
      },
      quality: { totalRating: 83, totalRatingCount: 120 },
      rating: 83,
      reviewCount: 120,
    });

    const ranked = rankGames([{ game, marginalSession: true }]);
    const terms = ranked[0]!.terms.map((term) => term.kind);

    expect(terms).toEqual(expect.arrayContaining([
      "demand",
      "accessibility",
      "quality",
      "growth",
      "stability",
      "competition",
      "confidence",
      "unknownPlayerPenalty",
      "marginalSessionPenalty",
    ]));
  });

  it("filters out games under the safe-ranking channel floor", () => {
    const ranked = rankGames(wrap(SAMPLE_CATALOG));
    expect(ranked.some((scored) => scored.game.id === "g27")).toBe(false);
  });

  it("breaks tied scores deterministically by id when signals are otherwise identical", () => {
    const a = makeGame("a-tie", {
      buzz: {
        twitchViewers: 1_500,
        twitchChannels: 10,
        viewerGrowth7d: null,
        isNewRelease: false,
      },
      streaming: {
        totalViewers: 1_500,
        channelCount: 10,
        medianViewersPerChannel: null,
        p75ViewersPerChannel: null,
        top10ViewerShare: null,
        viewerConcentration: null,
        growth7d: null,
        growth30d: null,
        growth90d: null,
        volatility30d: null,
        observedSnapshots: 0,
        coverage: 0,
        asOf: "2026-07-29T00:00:00.000Z",
      },
      quality: {},
      rating: undefined,
      reviewCount: undefined,
      topTags: [],
    });
    const b = { ...a, id: "b-tie", name: "b-tie" };

    const ranked = rankGames(wrap([b, a]));

    expect(ranked.map((scored) => scored.game.id)).toEqual(["a-tie", "b-tie"]);
  });
});
