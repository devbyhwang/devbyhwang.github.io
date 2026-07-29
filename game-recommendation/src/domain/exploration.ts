import type { Game, Scored, SessionShape } from "./types";

export const PAGE_SIZE = 24;
export const DIVERSE_PREFIX_SIZE = 96;

export type ExplorationView = "all" | "new" | "rising" | "discovery" | "classic";

export type ExplorationManifest = {
  generatedAt: string;
  gameCount: number;
  pageSize: number;
  views: Record<ExplorationView, number>;
};

export type ExplorationPage = {
  ids: string[];
};

export type ExplorationCard = {
  id: string;
  name: string;
  nameKo?: string;
  coverUrl?: string;
  storeUrl?: string;
  releaseDate: string;
  players: { max: number | "unknown"; online: boolean; localCoop: boolean };
  sessionShape: SessionShape;
  twitchViewers: number;
  discountPercent?: number;
};

function normalizedGenres(game: Game): Set<string> {
  return new Set((game.genres ?? []).map((genre) => genre.trim().toLowerCase()));
}

function releaseEra(game: Game): number | null {
  const year = new Date(game.releaseDate).getUTCFullYear();
  return Number.isFinite(year) ? Math.floor(year / 5) : null;
}

function overlap(candidate: Game, chosen: Game): number {
  let penalty = candidate.franchise && candidate.franchise === chosen.franchise ? 0.08 : 0;
  const candidateGenres = normalizedGenres(candidate);
  for (const genre of normalizedGenres(chosen)) if (candidateGenres.has(genre)) penalty += 0.06;

  const candidateTags = new Map(candidate.topTags.map((tag) => [tag.tag, tag.share]));
  penalty += chosen.topTags.reduce(
    (total, tag) => total + (candidateTags.has(tag.tag) ? Math.min(candidateTags.get(tag.tag)!, tag.share) * 0.04 : 0),
    0,
  );

  if (releaseEra(candidate) !== null && releaseEra(candidate) === releaseEra(chosen)) penalty += 0.04;
  return penalty;
}

function compareIds(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

function compareRank(a: { game: Game; score: number }, b: { game: Game; score: number }): number {
  return b.score - a.score || compareIds(a.game.id, b.game.id);
}

/**
 * Produces deterministic IDs for static exploration pages. The introduction is
 * greedily diversified; the remaining result set stays in normal rank order.
 */
export function rerankExploration(games: Game[], scored: Scored[]): string[] {
  const gamesById = new Map(games.map((game) => [game.id, game]));
  const ranked = scored
    .map((entry) => ({ game: gamesById.get(entry.game.id) ?? entry.game, score: entry.score }))
    .sort(compareRank);
  const remaining = [...ranked];
  const penalties = remaining.map(() => 0);
  const chosen: typeof ranked = [];

  while (remaining.length && chosen.length < DIVERSE_PREFIX_SIZE) {
    let selectedIndex = 0;
    let selectedUtility = -Infinity;

    for (let index = 0; index < remaining.length; index += 1) {
      const candidate = remaining[index]!;
      const utility = candidate.score - penalties[index]!;
      const selected = remaining[selectedIndex]!;

      if (utility > selectedUtility || (utility === selectedUtility && compareIds(candidate.game.id, selected.game.id) < 0)) {
        selectedIndex = index;
        selectedUtility = utility;
      }
    }

    const selected = remaining.splice(selectedIndex, 1)[0]!;
    penalties.splice(selectedIndex, 1);
    chosen.push(selected);

    for (let index = 0; index < remaining.length; index += 1) {
      penalties[index]! += overlap(remaining[index]!.game, selected.game);
    }
  }

  return [...chosen, ...remaining].map((entry) => entry.game.id);
}
