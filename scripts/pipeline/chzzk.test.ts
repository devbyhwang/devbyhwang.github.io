import { describe, expect, it } from "vitest";
import { combineDemandShares, resolveChzzkCategories } from "./chzzk";
import type { ChzzkAlias, ChzzkCategoryStat, IgdbGame } from "./model";

const igdbGames: IgdbGame[] = [
  { id: 10, name: "First Game" },
  { id: 20, name: "Alias Game" },
  { id: 30, name: "Name Match: Deluxe!" },
];

function category(categoryId: string, name: string, viewers = 100, coverage = 1): ChzzkCategoryStat {
  return { categoryId, name, viewers, channels: 1, coverage };
}

describe("resolveChzzkCategories", () => {
  it("uses an explicit category id before alias and IGDB names", () => {
    const aliases: ChzzkAlias[] = [{ igdbId: "10", categoryIds: ["category-1"], names: ["Alias Game"] }];

    expect(resolveChzzkCategories([category("category-1", "Alias Game")], igdbGames, aliases))
      .toEqual([{ ...category("category-1", "Alias Game"), igdbId: "10" }]);
  });

  it("uses an alias name before a normalized IGDB name", () => {
    const aliases: ChzzkAlias[] = [{ igdbId: "20", names: ["Name Match Deluxe"] }];

    expect(resolveChzzkCategories([category("category-2", "Name Match: Deluxe!")], igdbGames, aliases))
      .toEqual([{ ...category("category-2", "Name Match: Deluxe!"), igdbId: "20" }]);
  });

  it("uses exactly one normalized IGDB name when no alias matches", () => {
    expect(resolveChzzkCategories([category("category-3", "  name match deluxe  ")], igdbGames, []))
      .toEqual([{ ...category("category-3", "  name match deluxe  "), igdbId: "30" }]);
  });

  it("excludes duplicate normalized IGDB names and unmapped categories with warnings", () => {
    const warnings: string[] = [];
    const games = [...igdbGames, { id: 40, name: "NAME MATCH DELUXE" }];

    expect(resolveChzzkCategories([
      category("duplicate", "Name Match Deluxe"),
      category("unknown", "Unknown Game"),
    ], games, [], warnings)).toEqual([]);
    expect(warnings).toEqual([
      "Chzzk category duplicate (Name Match Deluxe) has an ambiguous IGDB name match",
      "Chzzk category unknown (Unknown Game) could not be mapped to an IGDB game",
    ]);
  });

  it("does not fall through an ambiguous alias name to an IGDB name", () => {
    const warnings: string[] = [];
    const aliases: ChzzkAlias[] = [
      { igdbId: "10", names: ["Shared Alias"] },
      { igdbId: "20", names: ["shared alias"] },
    ];

    expect(resolveChzzkCategories([category("ambiguous-alias", "Shared Alias")], [
      ...igdbGames,
      { id: 50, name: "Shared Alias" },
    ], aliases, warnings)).toEqual([]);
    expect(warnings).toEqual(["Chzzk category ambiguous-alias (Shared Alias) has an ambiguous alias name match"]);
  });
});

describe("combineDemandShares", () => {
  it("combines normalized Chzzk and Twitch shares using their configured weights", () => {
    const shares = combineDemandShares([
      { igdbId: "10", chzzk: { viewers: 60, coverage: 1 }, twitch: { viewers: 10, coverage: 1 } },
      { igdbId: "20", chzzk: { viewers: 40, coverage: 1 }, twitch: { viewers: 90, coverage: 1 } },
    ]);

    expect(shares.get("10")).toBeCloseTo(0.60 * 0.60 + 0.40 * 0.10);
    expect(shares.get("20")).toBeCloseTo(0.60 * 0.40 + 0.40 * 0.90);
  });

  it("uses Twitch shares alone when Chzzk has no positive observed total", () => {
    const shares = combineDemandShares([
      { igdbId: "10", chzzk: { viewers: 0, coverage: 1 }, twitch: { viewers: 10, coverage: 1 } },
      { igdbId: "20", chzzk: { viewers: 0, coverage: 1 }, twitch: { viewers: 90, coverage: 1 } },
    ]);

    expect(shares.get("10")).toBeCloseTo(0.10);
    expect(shares.get("20")).toBeCloseTo(0.90);
  });
});
