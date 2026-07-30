import { describe, expect, it } from "vitest";
import {
  W_ACCESSIBILITY,
  W_COMPETITION,
  W_CONFIDENCE,
  W_DEMAND,
  W_GROWTH,
  W_QUALITY,
  W_STABILITY,
} from "./constants";
import { SAMPLE_CATALOG } from "./fixtures";
import { createPercentileDistribution, createScoreContext, percentileFromDistribution, scoreGame } from "./score";
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

describe("scoreGame", () => {
  it("ranks combined demand share above a larger Twitch-only audience", () => {
    const higherCombinedDemand = makeGame("combined-demand", {
      buzz: { ...baseGame.buzz, twitchViewers: 500, twitchChannels: 20, demandShare: 0.08 },
      streaming: { ...baseGame.streaming, totalViewers: 500, medianViewersPerChannel: 50 },
    });
    const higherTwitchOnly = makeGame("twitch-only", {
      buzz: { ...baseGame.buzz, twitchViewers: 50_000, twitchChannels: 20, demandShare: 0.02 },
      streaming: { ...baseGame.streaming, totalViewers: 50_000, medianViewersPerChannel: 50 },
    });

    const context = createScoreContext([higherCombinedDemand, higherTwitchOnly]);

    expect(scoreGame(higherCombinedDemand, context).score).toBeGreaterThan(scoreGame(higherTwitchOnly, context).score);
  });

  it("uses lower and upper bounds to retain midpoint percentiles for tied values", () => {
    // This fails if either binary bound treats ties as wholly lower or wholly higher.
    const distribution = createPercentileDistribution([10, 20, 20, 20, 30]);

    expect(percentileFromDistribution(distribution, 10)).toBe(0.1);
    expect(percentileFromDistribution(distribution, 20)).toBe(0.5);
    expect(percentileFromDistribution(distribution, 30)).toBe(0.9);
  });

  it("scores a tied candidate identically from its precomputed population context", () => {
    // This fails if a cached distribution changes a tie's percentile or uses a different population.
    const tied = makeGame("tied", {
      buzz: { twitchViewers: 1_000, twitchChannels: 20, viewerGrowth7d: 1.1, isNewRelease: false },
      streaming: { ...baseGame.streaming, totalViewers: 1_000, medianViewersPerChannel: 50, growth7d: 1.1 },
    });
    const sameValue = { ...tied, id: "same-value", name: "same-value" };
    const lower = { ...tied, id: "lower", name: "lower", streaming: { ...tied.streaming, totalViewers: 500 } };
    const higher = { ...tied, id: "higher", name: "higher", streaming: { ...tied.streaming, totalViewers: 2_000 } };
    const population = [lower, tied, sameValue, higher];

    const scored = scoreGame(tied, createScoreContext(population));

    expect(scored.terms.find((term) => term.kind === "demand")?.raw).toBe(0.25);
  });

  it("uses score weights that total exactly 1.0", () => {
    expect(
      W_DEMAND +
      W_ACCESSIBILITY +
      W_QUALITY +
      W_GROWTH +
      W_STABILITY +
      W_COMPETITION +
      W_CONFIDENCE,
    ).toBe(1);
  });

  it("shrinks a five-review darling below a well-reviewed alternative", () => {
    const fiveReviews = makeGame("five-reviews", {
      buzz: { twitchViewers: 5_000, twitchChannels: 50, viewerGrowth7d: 1.1, isNewRelease: false },
      streaming: {
        totalViewers: 5_000,
        channelCount: 50,
        medianViewersPerChannel: 70,
        p75ViewersPerChannel: 110,
        top10ViewerShare: 0.22,
        viewerConcentration: 0.18,
        growth7d: 1.1,
        growth30d: 1.08,
        growth90d: 1.05,
        volatility30d: 0.14,
        observedSnapshots: 60,
        coverage: 0.9,
        asOf: "2026-07-29T00:00:00.000Z",
      },
      quality: { totalRating: 99, totalRatingCount: 5 },
      rating: 99,
      reviewCount: 5,
    });
    const wellReviewed = makeGame("well-reviewed", {
      buzz: { twitchViewers: 5_000, twitchChannels: 50, viewerGrowth7d: 1.1, isNewRelease: false },
      streaming: {
        totalViewers: 5_000,
        channelCount: 50,
        medianViewersPerChannel: 70,
        p75ViewersPerChannel: 110,
        top10ViewerShare: 0.22,
        viewerConcentration: 0.18,
        growth7d: 1.1,
        growth30d: 1.08,
        growth90d: 1.05,
        volatility30d: 0.14,
        observedSnapshots: 60,
        coverage: 0.9,
        asOf: "2026-07-29T00:00:00.000Z",
      },
      quality: { totalRating: 91, totalRatingCount: 1_200 },
      rating: 91,
      reviewCount: 1_200,
    });
    const baseline = makeGame("baseline", {
      buzz: { twitchViewers: 4_500, twitchChannels: 55, viewerGrowth7d: 1.05, isNewRelease: false },
      streaming: {
        totalViewers: 4_500,
        channelCount: 55,
        medianViewersPerChannel: 65,
        p75ViewersPerChannel: 100,
        top10ViewerShare: 0.28,
        viewerConcentration: 0.24,
        growth7d: 1.05,
        growth30d: 1.03,
        growth90d: 1,
        volatility30d: 0.18,
        observedSnapshots: 60,
        coverage: 0.85,
        asOf: "2026-07-29T00:00:00.000Z",
      },
      quality: { totalRating: 83, totalRatingCount: 400 },
      rating: 83,
      reviewCount: 400,
    });

    const population = [fiveReviews, wellReviewed, baseline];
    const context = createScoreContext(population);
    const flimsy = scoreGame(fiveReviews, context);
    const proven = scoreGame(wellReviewed, context);

    expect(proven.score).toBeGreaterThan(flimsy.score);
    expect(
      proven.terms.find((term) => term.kind === "quality")?.raw,
    ).toBeGreaterThan(
      flimsy.terms.find((term) => term.kind === "quality")?.raw ?? 0,
    );
  });

  it("shrinks sparse streaming metadata toward neutral and lowers confidence", () => {
    const rich = makeGame("rich", {
      buzz: { twitchViewers: 3_000, twitchChannels: 30, viewerGrowth7d: 1.25, isNewRelease: false },
      streaming: {
        totalViewers: 3_000,
        channelCount: 30,
        medianViewersPerChannel: 68,
        p75ViewersPerChannel: 90,
        top10ViewerShare: 0.3,
        viewerConcentration: 0.26,
        growth7d: 1.25,
        growth30d: 1.2,
        growth90d: 1.1,
        volatility30d: 0.16,
        observedSnapshots: 60,
        coverage: 0.92,
        asOf: "2026-07-29T00:00:00.000Z",
      },
      quality: { totalRating: 85, totalRatingCount: 500 },
      rating: 85,
      reviewCount: 500,
    });
    const sparse = makeGame("sparse", {
      buzz: { twitchViewers: 3_000, twitchChannels: 30, viewerGrowth7d: 1.25, isNewRelease: false },
      streaming: {
        totalViewers: 3_000,
        channelCount: 30,
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
    });
    const baseline = makeGame("baseline", {
      buzz: { twitchViewers: 2_500, twitchChannels: 26, viewerGrowth7d: 1.1, isNewRelease: false },
      streaming: {
        totalViewers: 2_500,
        channelCount: 26,
        medianViewersPerChannel: 62,
        p75ViewersPerChannel: 84,
        top10ViewerShare: 0.3,
        viewerConcentration: 0.25,
        growth7d: 1.1,
        growth30d: 1.08,
        growth90d: 1.02,
        volatility30d: 0.18,
        observedSnapshots: 60,
        coverage: 0.9,
        asOf: "2026-07-29T00:00:00.000Z",
      },
      quality: { totalRating: 82, totalRatingCount: 300 },
      rating: 82,
      reviewCount: 300,
    });

    const population = [rich, sparse, baseline];
    const context = createScoreContext(population);
    const richScore = scoreGame(rich, context);
    const sparseScore = scoreGame(sparse, context);
    const sparseConfidence = sparseScore.terms.find((term) => term.kind === "confidence")?.raw ?? 0;
    const sparseAccessibility = sparseScore.terms.find((term) => term.kind === "accessibility")?.raw ?? 0;

    expect(sparseConfidence).toBeLessThan(
      richScore.terms.find((term) => term.kind === "confidence")?.raw ?? 1,
    );
    expect(Math.abs(sparseAccessibility - 0.5)).toBeLessThan(0.21);
  });
});
