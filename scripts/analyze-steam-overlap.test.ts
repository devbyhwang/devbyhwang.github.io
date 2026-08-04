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
      ],
      new Map([
        [1, { positive: 90, negative: 10 }],
        [2, { positive: 80, negative: 20 }],
      ]),
    );

    expect(result.igdbRated).toBe(1);
    expect(result.matched).toBe(2);
    expect(result.overlap).toBe(1);
    expect(result.pairs).toEqual([{ steam: 80, igdb: 81 }]);
    expect(result.evidenceAfter).toBe(2);
  });
});
