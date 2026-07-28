import type { Catalog } from "../domain/types";

export async function loadCatalog(fetcher: typeof fetch = fetch): Promise<Catalog> {
  const response = await fetcher("./catalog.json");
  if (!response.ok) throw new Error(`catalog.json: ${response.status}`);
  const catalog: unknown = await response.json();
  if (!isCatalog(catalog)) throw new Error("invalid Catalog");
  return catalog;
}

function isCatalog(value: unknown): value is Catalog {
  try {
    const catalog = record(value);
    const generatedAt = timestamp(catalog.generatedAt);
    if (!Array.isArray(catalog.games)) return false;
    const ids = new Set<string>();
    return catalog.games.every((game) => isGame(game, generatedAt, ids));
  } catch {
    return false;
  }
}

function isIsoTimestamp(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value)) return false;
  const date = new Date(value);
  return Number.isFinite(date.getTime()) && date.toISOString() === value;
}

function record(value: unknown): Record<string, unknown> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) throw new Error("not object");
  return value as Record<string, unknown>;
}

function text(value: unknown, nonEmpty = false): value is string {
  return typeof value === "string" && (!nonEmpty || value.trim() !== "");
}

function timestamp(value: unknown): string {
  if (!text(value) || !isIsoTimestamp(value)) throw new Error("not timestamp");
  return value;
}

function number(value: unknown, minimum: number, maximum = Infinity): value is number {
  return typeof value === "number" && Number.isFinite(value) && value >= minimum && value <= maximum;
}

function isGame(value: unknown, generatedAt: string, ids: Set<string>): boolean {
  const game = record(value);
  if (!text(game.id, true) || ids.has(game.id) || !text(game.name, true)) return false;
  ids.add(game.id);
  const releaseDate = timestamp(game.releaseDate);
  const players = record(game.players);
  if (players.max !== "unknown" && (!Number.isInteger(players.max) || (players.max as number) <= 0)) return false;
  if (typeof players.source !== "string" || !new Set(["igdb_multiplayer", "igdb_gamemodes", "steam_categories", "unknown"]).has(players.source)
    || typeof players.online !== "boolean" || typeof players.localCoop !== "boolean") return false;
  if (typeof game.sessionShape !== "string" || !new Set(["match", "run", "chapter", "openended"]).has(game.sessionShape)) return false;
  const viewerPlayable = record(game.viewerPlayable);
  if (typeof viewerPlayable.ok !== "boolean" || (viewerPlayable.reason !== undefined && !text(viewerPlayable.reason, true))) return false;
  const vibes = record(game.vibes);
  const vibeKeys = ["healing", "variety", "horror", "hardcore", "chatting", "spectacle"];
  if (Object.keys(vibes).length !== vibeKeys.length || vibeKeys.some((key) => !number(vibes[key], 0, 1))) return false;
  const buzz = record(game.buzz);
  if (!number(buzz.twitchViewers, 0) || !number(buzz.twitchChannels, 0)
    || (buzz.viewerGrowth7d !== null && !number(buzz.viewerGrowth7d, Number.MIN_VALUE))
    || typeof buzz.isNewRelease !== "boolean") return false;
  const releaseAge = (Date.parse(generatedAt) - Date.parse(releaseDate)) / (24 * 60 * 60 * 1000);
  if (buzz.isNewRelease !== (releaseAge >= 0 && releaseAge <= 30)) return false;
  if (!Array.isArray(game.topTags) || game.topTags.length > 8 || !game.topTags.every((tag) => {
    const parsed = record(tag);
    return text(parsed.tag, true) && number(parsed.share, 0, 1);
  })) return false;
  if (game.steamAppId !== undefined && (typeof game.steamAppId !== "number" || !Number.isInteger(game.steamAppId) || game.steamAppId <= 0)) return false;
  if (game.discountPercent !== undefined && !number(game.discountPercent, 0, 100)) return false;
  if (game.rating !== undefined && !number(game.rating, 0, 100)) return false;
  return game.reviewCount === undefined || (typeof game.reviewCount === "number" && Number.isInteger(game.reviewCount) && game.reviewCount >= 0);
}
