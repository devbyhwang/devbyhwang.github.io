import { describe, expect, it } from "vitest";
import { MIN_SCALE_OVERLAP, alignSteamRating, fitSteamScale, steamRatio } from "./steam-scale";

/** Steam ratios cluster high (60–100); IGDB ratings cluster mid (50–90). */
function pairs(count: number): Array<{ steam: number; igdb: number }> {
  return Array.from({ length: count }, (_, index) => ({
    steam: 60 + (40 * index) / count,
    igdb: 50 + (40 * index) / count,
  }));
}

describe("steamRatio", () => {
  it("returns the positive share as a percentage", () => {
    expect(steamRatio(75, 25)).toBe(75);
  });

  it("returns null when there are no reviews", () => {
    expect(steamRatio(0, 0)).toBeNull();
  });

  it("returns null for negative counts", () => {
    expect(steamRatio(-1, 5)).toBeNull();
  });
});

describe("fitSteamScale", () => {
  it("refuses to fit below the overlap floor", () => {
    expect(fitSteamScale(pairs(MIN_SCALE_OVERLAP - 1))).toBeNull();
  });

  it("fits at the overlap floor", () => {
    expect(fitSteamScale(pairs(MIN_SCALE_OVERLAP))).not.toBeNull();
  });
});

describe("alignSteamRating", () => {
  const scale = fitSteamScale(pairs(MIN_SCALE_OVERLAP))!;

  it("maps the median Steam ratio to the median IGDB rating", () => {
    const median = alignSteamRating(80, scale);
    expect(median).toBeGreaterThan(68);
    expect(median).toBeLessThan(72);
  });

  it("pulls high Steam ratios down onto the IGDB scale", () => {
    expect(alignSteamRating(97.4, scale)).toBeLessThan(97.4);
  });

  it("is monotone", () => {
    const samples = [61, 70, 80, 90, 99];
    const mapped = samples.map((ratio) => alignSteamRating(ratio, scale));
    expect(mapped).toEqual([...mapped].sort((a, b) => a - b));
  });

  it("clamps outside the fitted range", () => {
    expect(alignSteamRating(0, scale)).toBeGreaterThanOrEqual(0);
    expect(alignSteamRating(100, scale)).toBeLessThanOrEqual(100);
  });
});
