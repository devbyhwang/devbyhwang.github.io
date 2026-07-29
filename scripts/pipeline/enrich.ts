import type {
  ClassificationInput,
  SessionRules,
  SteamTag,
  TagVibeMap,
  VibeKey,
  ViewerPlayable,
  ViewerPlayableRules,
} from "./model";

const VIBE_KEYS: VibeKey[] = ["healing", "variety", "horror", "hardcore", "chatting", "spectacle"];

type IgdbMultiplayerMode = {
  offlinecoop?: boolean;
  onlinecoop?: boolean;
  onlinecoopmax?: number;
  onlinemax?: number;
  offlinecoopmax?: number;
  offlinemax?: number;
};
type IgdbGame = { multiplayer_modes?: IgdbMultiplayerMode[]; game_modes?: string[] };
type SteamGame = { categories: string[] };
type PlayerInfo = { max: number | "unknown"; source: "igdb_multiplayer" | "igdb_gamemodes" | "steam_categories" | "unknown"; online: boolean; localCoop: boolean };

function zeroVibes(): Record<VibeKey, number> {
  return { healing: 0, variety: 0, horror: 0, hardcore: 0, chatting: 0, spectacle: 0 };
}

function same(value: string, candidate: string): boolean {
  return value.localeCompare(candidate, undefined, { sensitivity: "accent" }) === 0;
}

export function deriveRawVibes(tags: SteamTag[], weights: TagVibeMap): Record<VibeKey, number> {
  const result = zeroVibes();
  for (const tag of tags) {
    if (!Number.isFinite(tag.share) || tag.share < 0 || tag.share > 1) {
      throw new RangeError(`tag share must be between 0 and 1: ${tag.name}`);
    }
    const tagWeights = weights[tag.name];
    if (!tagWeights) continue;
    for (const vibe of VIBE_KEYS) result[vibe] += tag.share * (tagWeights[vibe] ?? 0);
  }
  return result;
}

export function normalizeVibes(raw: Record<string, Record<VibeKey, number>>): Record<string, Record<VibeKey, number>> {
  const games = Object.entries(raw);
  const normalized: Record<string, Record<VibeKey, number>> = {};
  for (const [id] of games) normalized[id] = zeroVibes();
  for (const vibe of VIBE_KEYS) {
    let min = Number.POSITIVE_INFINITY;
    let max = Number.NEGATIVE_INFINITY;
    for (const [, values] of games) {
      min = Math.min(min, values[vibe]);
      max = Math.max(max, values[vibe]);
    }
    for (const [id, values] of games) {
      normalized[id][vibe] = min === max ? 0.5 : (values[vibe] - min) / (max - min);
    }
  }
  return normalized;
}

export function classifySessionShape(input: ClassificationInput, rules: SessionRules) {
  const genres = input.genres.map((genre) => genre.toLocaleLowerCase());
  const tags = input.tags.map((tag) => tag.toLocaleLowerCase());
  for (const rule of rules.rules) {
    const genresAny = rule.genresAny?.some((genre) => genres.includes(genre.toLocaleLowerCase())) ?? true;
    const tagsAny = rule.tagsAny?.some((tag) => tags.includes(tag.toLocaleLowerCase())) ?? true;
    const tagsAll = rule.tagsAll?.every((tag) => tags.includes(tag.toLocaleLowerCase())) ?? true;
    if (genresAny && tagsAny && tagsAll) return rule.shape;
  }
  return rules.default;
}

export function resolveViewerPlayable(igdbId: string, tags: string[], rules: ViewerPlayableRules): ViewerPlayable {
  if (rules.games[igdbId]) return { ...rules.games[igdbId] };
  for (const [tag, result] of Object.entries(rules.tags)) {
    if (tags.some((candidate) => same(candidate, tag))) return { ...result };
  }
  return { ok: false };
}

export function normalizePlayers(igdb: IgdbGame, steam: SteamGame): PlayerInfo {
  const modes = igdb.multiplayer_modes ?? [];
  const positive = (value: number | undefined): number => Number.isFinite(value) && value! > 0 ? value! : 0;
  const onlineMax = Math.max(0, ...modes.flatMap((mode) => [positive(mode.onlinecoopmax), positive(mode.onlinemax)]));
  const localMax = Math.max(0, ...modes.flatMap((mode) => [positive(mode.offlinecoopmax), positive(mode.offlinemax)]));
  const max = Math.max(onlineMax, localMax);
  if (max > 0) {
    return {
      max,
      source: "igdb_multiplayer",
      online: onlineMax > 0,
      localCoop: modes.some((mode) => positive(mode.offlinecoopmax) > 0),
    };
  }
  if (igdb.game_modes?.includes("Multiplayer")) {
    return { max: 2, source: "igdb_gamemodes", online: true, localCoop: false };
  }
  if (steam.categories.includes("Multi-player")) {
    return { max: 2, source: "steam_categories", online: true, localCoop: false };
  }
  return { max: "unknown", source: "unknown", online: false, localCoop: false };
}

export function deriveIsNewRelease(releaseDate: string, generatedAt: string): boolean {
  const ageDays = (Date.parse(generatedAt) - Date.parse(releaseDate)) / (24 * 60 * 60 * 1000);
  return ageDays >= 0 && ageDays <= 30;
}
