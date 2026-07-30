import type { ChzzkAlias, ChzzkCategoryResolution, ChzzkCategoryStat, DemandShareEntry, DemandSourceStat, IgdbGame } from "./model";

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
): ChzzkCategoryResolution {
  const warnings: string[] = [];
  const stats = [];
  const aliasesByCategoryId = new Map<string, string[]>();
  const aliasesByName = new Map<string, string[]>();
  const igdbByName = new Map<string, string[]>();
  const igdbIds = new Set(igdbGames.map((game) => String(game.id)));
  const add = (index: Map<string, string[]>, key: string, igdbId: string) => index.set(key, [...(index.get(key) ?? []), igdbId]);

  for (const alias of aliases) {
    for (const categoryId of alias.categoryIds ?? []) add(aliasesByCategoryId, categoryId, alias.igdbId);
    for (const name of alias.names ?? []) add(aliasesByName, normalizeChzzkName(name), alias.igdbId);
  }
  for (const game of igdbGames) add(igdbByName, normalizeChzzkName(game.name), String(game.id));

  for (const category of categories) {
    const name = normalizeChzzkName(category.name);
    const categoryMatches = aliasesByCategoryId.get(category.categoryId) ?? [];
    const categoryMatch = uniqueMatches(categoryMatches);
    const aliasMatches = aliasesByName.get(name) ?? [];
    const aliasMatch = uniqueMatches(aliasMatches);
    const igdbMatches = igdbByName.get(name) ?? [];
    const igdbMatch = uniqueMatches(igdbMatches);
    if (categoryMatches.length > 0) {
      if (categoryMatch && igdbIds.has(categoryMatch)) {
        stats.push({ ...category, igdbId: categoryMatch });
        continue;
      }
      warnings.push(categoryMatch
        ? `Chzzk category ${category.categoryId} (${category.name}) aliases missing IGDB id ${categoryMatch}`
        : `Chzzk category ${category.categoryId} (${category.name}) has an ambiguous category id match`);
      continue;
    }
    if (aliasMatches.length > 0) {
      if (aliasMatch && igdbIds.has(aliasMatch)) {
        stats.push({ ...category, igdbId: aliasMatch });
        continue;
      }
      warnings.push(aliasMatch
        ? `Chzzk category ${category.categoryId} (${category.name}) aliases missing IGDB id ${aliasMatch}`
        : `Chzzk category ${category.categoryId} (${category.name}) has an ambiguous alias name match`);
      continue;
    }
    if (igdbMatch) {
      stats.push({ ...category, igdbId: igdbMatch });
      continue;
    }
    warnings.push(igdbMatches.length > 1
      ? `Chzzk category ${category.categoryId} (${category.name}) has an ambiguous IGDB name match`
      : `Chzzk category ${category.categoryId} (${category.name}) could not be mapped to an IGDB game`);
  }
  return { stats, warnings };
}

function observedStats(entries: DemandShareEntry[], source: "chzzk" | "twitch"): DemandSourceStat[] {
  return entries.flatMap((entry) => {
    const stat = entry[source];
    return stat && stat.viewers > 0 && stat.coverage > 0 ? [stat] : [];
  });
}

export function combineDemandShares(entries: DemandShareEntry[]): Map<string, number> {
  const observed = new Map((["chzzk", "twitch"] as const).map((source) => [source, observedStats(entries, source)]));
  const active = (["chzzk", "twitch"] as const).filter((source) => (observed.get(source)?.length ?? 0) > 0);
  const weights = { chzzk: CHZZK_WEIGHT, twitch: TWITCH_WEIGHT };
  const totalWeight = active.reduce((sum, source) => sum + weights[source], 0);
  const totals = new Map(active.map((source) => [source, (observed.get(source) ?? []).reduce((sum, stat) => sum + stat.viewers, 0)]));
  return new Map(entries.map((entry) => [entry.igdbId, active.reduce((sum, source) => {
    const stat = entry[source];
    return sum + (stat && stat.viewers > 0 && stat.coverage > 0 ? weights[source] * stat.viewers / (totals.get(source) ?? 1) : 0);
  }, 0) / totalWeight]));
}
