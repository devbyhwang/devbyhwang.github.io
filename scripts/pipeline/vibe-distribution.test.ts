import { describe, expect, it } from "vitest";
import { assertVibeDistribution, measureVibeDistribution, formatVibeDistribution } from "./vibe-distribution";
import type { GameRecord, VibeKey } from "./model";

const ALL: VibeKey[] = ["healing", "variety", "horror", "hardcore", "chatting", "spectacle"];

function games(count: number, atOrAbove: (index: number) => Partial<Record<VibeKey, number>>): GameRecord[] {
  return Array.from({ length: count }, (_, index) => {
    const vibes = Object.fromEntries(ALL.map((vibe) => [vibe, 0])) as Record<VibeKey, number>;
    Object.assign(vibes, atOrAbove(index));
    return { vibes } as unknown as GameRecord;
  });
}

/** 여섯 축 모두 20%씩 통과하는 균형 잡힌 카탈로그 */
function balanced(count: number): GameRecord[] {
  return games(count, (index) => ({ [ALL[index % ALL.length]!]: 0.9 }));
}

describe("measureVibeDistribution", () => {
  it("counts games at or above the base threshold", () => {
    const distribution = measureVibeDistribution(games(10, (index) => ({ horror: index < 3 ? 0.5 : 0.49 })));

    expect(distribution.horror).toEqual({ count: 3, share: 0.3 });
    expect(distribution.healing).toEqual({ count: 0, share: 0 });
  });

  it("reports zero share for an empty catalog", () => {
    expect(measureVibeDistribution([]).healing).toEqual({ count: 0, share: 0 });
  });
});

describe("assertVibeDistribution", () => {
  it("accepts a balanced catalog", () => {
    expect(() => assertVibeDistribution(measureVibeDistribution(balanced(6000)))).not.toThrow();
  });

  it("rejects a dead axis", () => {
    const catalog = balanced(6000).filter((game) => game.vibes.horror < 0.5);

    expect(() => assertVibeDistribution(measureVibeDistribution(catalog))).toThrow(/horror/);
  });

  it("rejects a runaway axis", () => {
    const catalog = games(6000, (index) => ({ healing: 0.9, [ALL[1 + (index % 5)]!]: 0.9 }));

    expect(() => assertVibeDistribution(measureVibeDistribution(catalog))).toThrow(/healing/);
  });

  it("names every failing axis at once", () => {
    const catalog = games(6000, () => ({ healing: 0.9 }));

    expect(() => assertVibeDistribution(measureVibeDistribution(catalog))).toThrow(/horror.*hardcore|hardcore.*horror/s);
  });
});

describe("formatVibeDistribution", () => {
  it("renders each axis with its count and percentage", () => {
    const text = formatVibeDistribution(measureVibeDistribution(balanced(600)));

    expect(text).toMatch(/healing\s+100\s+16\.7%/);
  });
});
