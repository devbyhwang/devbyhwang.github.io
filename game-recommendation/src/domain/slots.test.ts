import { describe, expect, it } from "vitest";
import { buildSlots } from "./slots";
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
  topTags: overrides.topTags ?? [],
  rating: overrides.rating,
  reviewCount: overrides.reviewCount,
});

const wrap = (games: Game[], marginalSession = false): FilteredGame[] =>
  games.map((game) => ({ game, marginalSession }));

const run = (games: Game[], strictGames = games) => {
  const strictCandidates = wrap(strictGames);
  const strictRanked = rankGames(strictCandidates);
  return buildSlots({
    safe: rankGames(wrap(games)),
    rising: strictRanked,
    discoveryCandidates: strictCandidates,
    newCandidates: strictCandidates,
  });
};

describe("buildSlots", () => {
  it("fills safe with a diversity-reranked top three instead of stacking the same franchise", () => {
    const sequelA = makeGame("sequel-a", {
      franchise: "Shared",
      buzz: { twitchViewers: 18_000, twitchChannels: 150, viewerGrowth7d: 1.1, isNewRelease: false },
      streaming: {
        totalViewers: 18_000,
        channelCount: 150,
        medianViewersPerChannel: 95,
        p75ViewersPerChannel: 120,
        top10ViewerShare: 0.2,
        viewerConcentration: 0.18,
        growth7d: 1.1,
        growth30d: 1.08,
        growth90d: 1.05,
        volatility30d: 0.12,
        observedSnapshots: 90,
        coverage: 0.95,
        asOf: "2026-07-29T00:00:00.000Z",
      },
      quality: { totalRating: 90, totalRatingCount: 900 },
      rating: 90,
      reviewCount: 900,
      topTags: [{ tag: "party", share: 0.5 }, { tag: "co-op", share: 0.3 }],
    });
    const sequelB = makeGame("sequel-b", {
      franchise: "Shared",
      buzz: { twitchViewers: 17_500, twitchChannels: 145, viewerGrowth7d: 1.09, isNewRelease: false },
      streaming: {
        totalViewers: 17_500,
        channelCount: 145,
        medianViewersPerChannel: 93,
        p75ViewersPerChannel: 118,
        top10ViewerShare: 0.22,
        viewerConcentration: 0.2,
        growth7d: 1.09,
        growth30d: 1.07,
        growth90d: 1.04,
        volatility30d: 0.13,
        observedSnapshots: 90,
        coverage: 0.95,
        asOf: "2026-07-29T00:00:00.000Z",
      },
      quality: { totalRating: 89, totalRatingCount: 850 },
      rating: 89,
      reviewCount: 850,
      topTags: [{ tag: "party", share: 0.55 }, { tag: "co-op", share: 0.25 }],
    });
    const alternative = makeGame("alternative", {
      buzz: { twitchViewers: 16_000, twitchChannels: 120, viewerGrowth7d: 1.08, isNewRelease: false },
      streaming: {
        totalViewers: 16_000,
        channelCount: 120,
        medianViewersPerChannel: 90,
        p75ViewersPerChannel: 110,
        top10ViewerShare: 0.15,
        viewerConcentration: 0.12,
        growth7d: 1.08,
        growth30d: 1.07,
        growth90d: 1.05,
        volatility30d: 0.11,
        observedSnapshots: 90,
        coverage: 0.95,
        asOf: "2026-07-29T00:00:00.000Z",
      },
      quality: { totalRating: 88, totalRatingCount: 920 },
      rating: 88,
      reviewCount: 920,
      topTags: [{ tag: "deckbuilder", share: 0.5 }],
    });
    const anchor = makeGame("anchor", {
      buzz: { twitchViewers: 20_000, twitchChannels: 180, viewerGrowth7d: 1.1, isNewRelease: false },
      streaming: {
        totalViewers: 20_000,
        channelCount: 180,
        medianViewersPerChannel: 100,
        p75ViewersPerChannel: 135,
        top10ViewerShare: 0.14,
        viewerConcentration: 0.12,
        growth7d: 1.1,
        growth30d: 1.08,
        growth90d: 1.06,
        volatility30d: 0.1,
        observedSnapshots: 90,
        coverage: 0.98,
        asOf: "2026-07-29T00:00:00.000Z",
      },
      quality: { totalRating: 91, totalRatingCount: 1000 },
      rating: 91,
      reviewCount: 1000,
      topTags: [{ tag: "survival", share: 0.4 }],
    });

    const safeIds = run([anchor, sequelA, sequelB, alternative])
      .filter((slot) => slot.slot === "safe")
      .map((slot) => slot.scored.game.id);

    expect(safeIds).toEqual(["anchor", "sequel-a", "alternative"]);
  });

  it("uses multi-window growth confidence for the rising slot", () => {
    const safeFillers = ["safe-1", "safe-2", "safe-3"].map((id, index) => makeGame(id, {
      buzz: { twitchViewers: 20_000 - index * 1_000, twitchChannels: 160, viewerGrowth7d: 1.05, isNewRelease: false },
      streaming: {
        totalViewers: 20_000 - index * 1_000,
        channelCount: 160,
        medianViewersPerChannel: 90,
        p75ViewersPerChannel: 120,
        top10ViewerShare: 0.18,
        viewerConcentration: 0.16,
        growth7d: 1.05,
        growth30d: 1.04,
        growth90d: 1.02,
        volatility30d: 0.12,
        observedSnapshots: 90,
        coverage: 0.95,
        asOf: "2026-07-29T00:00:00.000Z",
      },
      quality: { totalRating: 88, totalRatingCount: 900 },
      rating: 88,
      reviewCount: 900,
    }));

    const spike = makeGame("spike", {
      buzz: { twitchViewers: 4_000, twitchChannels: 40, viewerGrowth7d: 2.2, isNewRelease: false },
      streaming: {
        totalViewers: 4_000,
        channelCount: 40,
        medianViewersPerChannel: 80,
        p75ViewersPerChannel: 140,
        top10ViewerShare: 0.8,
        viewerConcentration: 0.7,
        growth7d: 2.2,
        growth30d: 0.8,
        growth90d: 0.7,
        volatility30d: 0.75,
        observedSnapshots: 14,
        coverage: 0.3,
        asOf: "2026-07-29T00:00:00.000Z",
      },
      quality: { totalRating: 82, totalRatingCount: 120 },
      rating: 82,
      reviewCount: 120,
    });
    const consistent = makeGame("consistent", {
      buzz: { twitchViewers: 5_000, twitchChannels: 55, viewerGrowth7d: 1.45, isNewRelease: false },
      streaming: {
        totalViewers: 5_000,
        channelCount: 55,
        medianViewersPerChannel: 78,
        p75ViewersPerChannel: 105,
        top10ViewerShare: 0.25,
        viewerConcentration: 0.2,
        growth7d: 1.45,
        growth30d: 1.4,
        growth90d: 1.3,
        volatility30d: 0.16,
        observedSnapshots: 60,
        coverage: 0.9,
        asOf: "2026-07-29T00:00:00.000Z",
      },
      quality: { totalRating: 84, totalRatingCount: 400 },
      rating: 84,
      reviewCount: 400,
    });

    const rising = run([...safeFillers, spike, consistent]).find((slot) => slot.slot === "rising");

    expect(rising?.scored.game.id).toBe("consistent");
  });

  it("adds a discovery slot for a high-quality low-exposure historical game without surfacing it as safe", () => {
    const discovery = makeGame("discovery", {
      releaseDate: "2020-01-01T00:00:00.000Z",
      buzz: { twitchViewers: 120, twitchChannels: 2, viewerGrowth7d: null, isNewRelease: false, demandShare: 0.001 },
      streaming: {
        totalViewers: 120,
        channelCount: 2,
        medianViewersPerChannel: 35,
        p75ViewersPerChannel: 50,
        top10ViewerShare: 0.55,
        viewerConcentration: 0.45,
        growth7d: null,
        growth30d: null,
        growth90d: null,
        volatility30d: 0.18,
        observedSnapshots: 25,
        coverage: 0.7,
        asOf: "2026-07-29T00:00:00.000Z",
      },
      quality: { totalRating: 94, totalRatingCount: 1_500 },
      rating: 94,
      reviewCount: 1_500,
      topTags: [{ tag: "story rich", share: 0.4 }],
    });
    const safeGames = ["safe-1", "safe-2", "safe-3"].map((id, index) => makeGame(id, {
      buzz: { twitchViewers: 12_000 - index * 500, twitchChannels: 120, viewerGrowth7d: 1.1, isNewRelease: false, demandShare: 0.05 - index * 0.001 },
      streaming: {
        totalViewers: 12_000 - index * 500,
        channelCount: 120,
        medianViewersPerChannel: 85,
        p75ViewersPerChannel: 112,
        top10ViewerShare: 0.2,
        viewerConcentration: 0.16,
        growth7d: 1.1,
        growth30d: 1.08,
        growth90d: 1.05,
        volatility30d: 0.12,
        observedSnapshots: 90,
        coverage: 0.95,
        asOf: "2026-07-29T00:00:00.000Z",
      },
      quality: { totalRating: 86, totalRatingCount: 600 },
      rating: 86,
      reviewCount: 600,
    }));

    const slots = run([...safeGames, discovery]);

    expect(slots.some((slot) => slot.slot === "safe" && slot.scored.game.id === "discovery")).toBe(false);
    expect(slots.find((slot) => slot.slot === "discovery")?.scored.game.id).toBe("discovery");
  });

  it("allows discovery when combined demand share is in the lower candidate percentiles", () => {
    const lowViewers = makeGame("low-viewers", {
      buzz: { twitchViewers: 900, twitchChannels: 80, viewerGrowth7d: null, isNewRelease: false, demandShare: 0.001 },
      streaming: { ...baseGame.streaming, totalViewers: 900, channelCount: 80, coverage: 0.8, observedSnapshots: 40 },
      quality: { totalRating: 92, totalRatingCount: 800 }, rating: 92, reviewCount: 800,
    });
    const lowChannels = makeGame("low-channels", {
      buzz: { twitchViewers: 8_000, twitchChannels: 2, viewerGrowth7d: null, isNewRelease: false, demandShare: 0.001 },
      streaming: { ...baseGame.streaming, totalViewers: 8_000, channelCount: 2, coverage: 0.8, observedSnapshots: 40 },
      quality: { totalRating: 92, totalRatingCount: 800 }, rating: 92, reviewCount: 800,
    });
    const safeAnchor = makeGame("safe-anchor", {
      buzz: { twitchViewers: 12_000, twitchChannels: 120, viewerGrowth7d: 1.1, isNewRelease: false, demandShare: 0.05 },
      streaming: { ...baseGame.streaming, totalViewers: 12_000, channelCount: 120, coverage: 0.9, observedSnapshots: 60 },
      quality: { totalRating: 86, totalRatingCount: 600 }, rating: 86, reviewCount: 600,
    });
    const safeAnchors = [safeAnchor, { ...safeAnchor, id: "safe-anchor-2" }, { ...safeAnchor, id: "safe-anchor-3" }];

    expect(run([...safeAnchors, lowViewers]).find((slot) => slot.slot === "discovery")?.scored.game.id).toBe("low-viewers");
    expect(run([lowChannels]).find((slot) => slot.slot === "discovery")?.scored.game.id).toBe("low-channels");
  });

  it("returns slots in safe → rising → discovery → new order with no duplicate games", () => {
    const slots = run(SAMPLE_CATALOG);
    const ids = slots.map((slot) => slot.scored.game.id);
    const order = slots.map((slot) => slot.slot);
    const rank = { safe: 0, rising: 1, discovery: 2, new: 3 } as const;

    expect(new Set(ids).size).toBe(ids.length);
    for (let index = 1; index < order.length; index++) {
      expect(rank[order[index]]).toBeGreaterThanOrEqual(rank[order[index - 1]]);
    }
  });
});
