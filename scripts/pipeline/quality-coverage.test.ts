import { describe, expect, it } from "vitest";
import {
  MAX_EVIDENCE_SHARE, MIN_EVIDENCE_SHARE,
  assertEvidenceCoverage, formatEvidenceCoverage, measureEvidenceCoverage,
} from "./quality-coverage";
import type { GameRecord } from "./model";

function games(total: number, rated: number): GameRecord[] {
  return Array.from({ length: total }, (_, index) =>
    ({ quality: index < rated ? { totalRating: 70 } : {} }) as unknown as GameRecord);
}

describe("measureEvidenceCoverage", () => {
  it("counts games carrying a total rating", () => {
    expect(measureEvidenceCoverage(games(200, 50))).toEqual({ count: 50, share: 0.25 });
  });

  it("reports zero for an empty catalog", () => {
    expect(measureEvidenceCoverage([])).toEqual({ count: 0, share: 0 });
  });
});

describe("assertEvidenceCoverage", () => {
  const mid = (MIN_EVIDENCE_SHARE + MAX_EVIDENCE_SHARE) / 2;

  it("accepts coverage inside the band", () => {
    expect(() => assertEvidenceCoverage({ count: 1, share: mid })).not.toThrow();
  });

  it("rejects coverage below the floor", () => {
    expect(() => assertEvidenceCoverage({ count: 1, share: MIN_EVIDENCE_SHARE - 0.01 }))
      .toThrow(/below/);
  });

  it("rejects coverage above the ceiling", () => {
    expect(() => assertEvidenceCoverage({ count: 1, share: MAX_EVIDENCE_SHARE + 0.01 }))
      .toThrow(/above/);
  });
});

describe("formatEvidenceCoverage", () => {
  it("renders the count and percentage", () => {
    expect(formatEvidenceCoverage({ count: 1234, share: 0.5432 })).toMatch(/1,?234.*54\.3%/);
  });
});
