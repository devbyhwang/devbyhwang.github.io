import type {
  ClassificationInput,
  SessionRules,
  SteamTag,
  VibeWeightMap,
  VibeWeights,
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

export function deriveVibes(
  input: { genres: string[]; themes: string[]; tags: SteamTag[] },
  weights: VibeWeights,
): Record<VibeKey, number> {
  const complement: Record<VibeKey, number> = { healing: 1, variety: 1, horror: 1, hardcore: 1, chatting: 1, spectacle: 1 };
  const applied = new Set<string>();

  const apply = (map: VibeWeightMap, section: string, name: string, share: number) => {
    const key = `${section}:${name}`;
    if (applied.has(key)) return;
    applied.add(key);
    const entry = map[name];
    if (!entry) return;
    for (const vibe of VIBE_KEYS) {
      const weight = entry[vibe] ?? 0;
      if (weight <= 0) continue;
      complement[vibe] *= 1 - weight * share;
    }
  };

  for (const name of input.genres) apply(weights.genres, "genre", name, 1);
  for (const name of input.themes) apply(weights.themes, "theme", name, 1);
  for (const tag of input.tags) {
    if (!Number.isFinite(tag.share) || tag.share < 0 || tag.share > 1) {
      throw new RangeError(`tag share must be between 0 and 1: ${tag.name}`);
    }
    apply(weights.tags, "tag", tag.name, tag.share);
  }

  const result = zeroVibes();
  for (const vibe of VIBE_KEYS) result[vibe] = 1 - complement[vibe];
  return result;
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
