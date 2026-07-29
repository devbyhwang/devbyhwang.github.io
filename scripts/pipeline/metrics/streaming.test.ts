import { describe, expect, it } from "vitest";
import { summarizeStreams } from "./streaming";

function observation(categoryId: string, igdbId: number, userId: string, viewerCount: number, language = "en"): {
  categoryId: string;
  gameId: string;
  igdbId: number;
  language: string;
  userId: string;
  viewerCount: number;
} {
  return { categoryId, gameId: categoryId, igdbId, language, userId, viewerCount };
}

describe("summarizeStreams", () => {
  it("distinguishes concentrated and distributed categories that share the same total viewers", () => {
    const whale = [
      observation("10", 42, "whale", 100_000),
      ...Array.from({ length: 99 }, (_, index) => observation("10", 42, `tail-${index + 1}`, 1)),
    ];
    const even = [
      ...Array.from({ length: 99 }, (_, index) => observation("11", 43, `even-${index + 1}`, 1_001)),
      observation("11", 43, "even-100", 1_000),
    ];

    const whaleSummary = summarizeStreams(whale, 1);
    const evenSummary = summarizeStreams(even, 1);

    expect(whaleSummary.totalViewers).toBe(100_099);
    expect(evenSummary.totalViewers).toBe(100_099);
    expect(whaleSummary.channelCount).toBe(100);
    expect(evenSummary.channelCount).toBe(100);
    expect(whaleSummary.medianViewersPerChannel).toBe(1);
    expect(evenSummary.medianViewersPerChannel).toBe(1_001);
    expect(whaleSummary.top10ViewerShare).toBeCloseTo(100_009 / 100_099, 12);
    expect(evenSummary.top10ViewerShare).toBeCloseTo(10_010 / 100_099, 12);
    expect(whaleSummary.viewerConcentration).toBeGreaterThan(evenSummary.viewerConcentration);
    expect(whaleSummary.coverage).toBe(1);
    expect(evenSummary.coverage).toBe(1);
  });

  it("uses deterministic midpoint interpolation for tied and even-sized viewer counts", () => {
    const tied = [
      observation("10", 42, "a", 5),
      observation("10", 42, "b", 5),
      observation("10", 42, "c", 15),
      observation("10", 42, "d", 15),
    ];

    const summary = summarizeStreams(tied, 1);

    expect(summary.totalViewers).toBe(40);
    expect(summary.channelCount).toBe(4);
    expect(summary.medianViewersPerChannel).toBe(10);
    expect(summary.p75ViewersPerChannel).toBe(15);
  });

  it("returns zero-valued statistics with full coverage for a verified empty category", () => {
    expect(summarizeStreams([], 1)).toEqual({
      totalViewers: 0,
      channelCount: 0,
      medianViewersPerChannel: 0,
      p75ViewersPerChannel: 0,
      top10ViewerShare: 0,
      viewerConcentration: 0,
      coverage: 1,
    });
  });

  it("keeps observed statistics intact while lowering coverage for truncated page sets", () => {
    const partial = [
      observation("10", 42, "a", 50),
      observation("10", 42, "b", 10),
      observation("10", 42, "c", 5),
    ];

    const summary = summarizeStreams(partial, 2 / 3);

    expect(summary.totalViewers).toBe(65);
    expect(summary.channelCount).toBe(3);
    expect(summary.medianViewersPerChannel).toBe(10);
    expect(summary.top10ViewerShare).toBe(1);
    expect(summary.viewerConcentration).toBeCloseTo((50 / 65) ** 2 + (10 / 65) ** 2 + (5 / 65) ** 2, 12);
    expect(summary.coverage).toBe(2 / 3);
  });
});
