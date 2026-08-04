import { describe, expect, it } from "vitest";
import { measureSteamOverlap } from "./analyze-steam-overlap";

describe("measureSteamOverlap", () => {
  it("uses the preserved IGDB signal rather than a Steam-derived total rating for overlap", () => {
    const result = measureSteamOverlap(
      [
        // This game acquired totalRating solely from aligned Steam reviews.
        { steamAppId: 1, quality: { totalRating: 72, steamPositive: 90, steamNegative: 10 } },
        // This is a genuine common signal and must remain in the calibration pairs.
        { steamAppId: 2, quality: { igdbRating: 81, totalRating: 79, steamPositive: 80, steamNegative: 20 } },
        // Critic-only and total-only IGDB evidence use the same fitted value as production.
        { steamAppId: 3, quality: { criticRating: 87, totalRating: 82, steamPositive: 70, steamNegative: 30 } },
        { steamAppId: 4, quality: { igdbTotalRating: 76, totalRating: 75, steamPositive: 60, steamNegative: 40 } },
      ],
      new Map([
        [1, { positive: 90, negative: 10 }],
        [2, { positive: 80, negative: 20 }],
        [3, { positive: 70, negative: 30 }],
        [4, { positive: 60, negative: 40 }],
      ]),
    );

    expect(result.igdbRated).toBe(3);
    expect(result.matched).toBe(4);
    expect(result.overlap).toBe(3);
    expect(result.pairs).toEqual([
      { steam: 80, igdb: 79 },
      { steam: 70, igdb: 82 },
      { steam: 60, igdb: 75 },
    ]);
    expect(result.evidenceAfter).toBe(4);
  });
});
