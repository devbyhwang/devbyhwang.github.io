import type { ChzzkAlias, ChzzkCategoryStat, DemandShareEntry, IgdbGame, ResolvedChzzkStat } from "./model";

export const CHZZK_WEIGHT = 0.60;
export const TWITCH_WEIGHT = 0.40;

export function normalizeChzzkName(value: string): string {
  return value.normalize("NFKD").trim().toLowerCase().replace(/[\s\p{P}]+/gu, "");
}

function uniqueMatches(values: Iterable<string>): string | undefined {
  const matches = new Set(values);
  return matches.size === 1 ? matches.values().next().value : undefined;
}

export function resolveChzzkCategories(
  categories: ChzzkCategoryStat[],
  igdbGames: IgdbGame[],
  aliases: ChzzkAlias[],
  warnings: string[] = [],
): ResolvedChzzkStat[] {
  const aliasesByCategoryId = new Map<string, string[]>();
  const aliasesByName = new Map<string, string[]>();
  const igdbByName = new Map<string, string[]>();
  const add = (index: Map<string, string[]>, key: string, igdbId: string) => index.set(key, [...(index.get(key) ?? []), igdbId]);

  for (const alias of aliases) {
    for (const categoryId of alias.categoryIds ?? []) add(aliasesByCategoryId, categoryId, alias.igdbId);
    for (const name of alias.names ?? []) add(aliasesByName, normalizeChzzkName(name), alias.igdbId);
  }
  for (const game of igdbGames) add(igdbByName, normalizeChzzkName(game.name), String(game.id));

  return categories.flatMap((category) => {
    const name = normalizeChzzkName(category.name);
    const categoryMatches = aliasesByCategoryId.get(category.categoryId) ?? [];
    const categoryMatch = uniqueMatches(categoryMatches);
    const aliasMatches = aliasesByName.get(name) ?? [];
    const aliasMatch = uniqueMatches(aliasMatches);
    const igdbMatches = igdbByName.get(name) ?? [];
    const igdbMatch = uniqueMatches(igdbMatches);
    if (categoryMatches.length > 0) {
      if (categoryMatch) return [{ ...category, igdbId: categoryMatch }];
      warnings.push(`Chzzk category ${category.categoryId} (${category.name}) has an ambiguous category id match`);
      return [];
    }
    if (aliasMatches.length > 0) {
      if (aliasMatch) return [{ ...category, igdbId: aliasMatch }];
      warnings.push(`Chzzk category ${category.categoryId} (${category.name}) has an ambiguous alias name match`);
      return [];
    }
    if (igdbMatch) return [{ ...category, igdbId: igdbMatch }];
    warnings.push(igdbMatches.length > 1
      ? `Chzzk category ${category.categoryId} (${category.name}) has an ambiguous IGDB name match`
      : `Chzzk category ${category.categoryId} (${category.name}) could not be mapped to an IGDB game`);
    return [];
  });
}

function available(entries: DemandShareEntry[], source: "chzzk" | "twitch"): boolean {
  const total = entries.reduce((sum, entry) => sum + (entry[source]?.viewers ?? 0), 0);
  return total > 0 && entries.some((entry) => (entry[source]?.coverage ?? 0) > 0);
}

export function combineDemandShares(entries: DemandShareEntry[]): Map<string, number> {
  const active = (["chzzk", "twitch"] as const).filter((source) => available(entries, source));
  const weights = { chzzk: CHZZK_WEIGHT, twitch: TWITCH_WEIGHT };
  const totalWeight = active.reduce((sum, source) => sum + weights[source], 0);
  const totals = new Map(active.map((source) => [source, entries.reduce((sum, entry) => sum + (entry[source]?.viewers ?? 0), 0)]));
  return new Map(entries.map((entry) => [entry.igdbId, active.reduce((sum, source) => {
    const stat = entry[source];
    return sum + (stat && stat.coverage > 0 ? weights[source] * stat.viewers / (totals.get(source) ?? 1) : 0);
  }, 0) / totalWeight]));
}
