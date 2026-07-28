import { deriveIsNewRelease } from "./enrich";
import type { CatalogRecord, GameRecord, SessionShape, VibeKey } from "./model";

const ISO_TIMESTAMP = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;
const VIBES: VibeKey[] = ["healing", "variety", "horror", "hardcore", "chatting", "spectacle"];
const PLAYER_SOURCES = new Set(["igdb_multiplayer", "igdb_gamemodes", "steam_categories", "unknown"]);
const SESSION_SHAPES = new Set<SessionShape>(["match", "run", "chapter", "openended"]);

function fail(path: string, message: string): never {
  throw new Error(`${path}: ${message}`);
}

function object(value: unknown, path: string): Record<string, unknown> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) fail(path, "must be an object");
  return value as Record<string, unknown>;
}

function string(value: unknown, path: string, nonEmpty = false): string {
  if (typeof value !== "string" || (nonEmpty && value.trim() === "")) fail(path, "must be a non-empty string");
  return value;
}

function iso(value: unknown, path: string): string {
  const timestamp = string(value, path);
  const date = new Date(timestamp);
  if (!ISO_TIMESTAMP.test(timestamp) || !Number.isFinite(date.getTime()) || date.toISOString() !== timestamp) fail(path, "must be an ISO timestamp");
  return timestamp;
}

function finite(value: unknown, path: string, min: number, max = Infinity): number {
  if (typeof value !== "number" || !Number.isFinite(value) || value < min || value > max) fail(path, `must be a number from ${min} to ${max}`);
  return value;
}

function bool(value: unknown, path: string): boolean {
  if (typeof value !== "boolean") fail(path, "must be a boolean");
  return value;
}

function validateGame(value: unknown, index: number, generatedAt: string, ids: Set<string>): asserts value is GameRecord {
  const path = `games[${index}]`;
  const game = object(value, path);
  const id = string(game.id, `${path}.id`, true);
  if (ids.has(id)) fail(`${path}.id`, "must be unique");
  ids.add(id);
  string(game.name, `${path}.name`, true);
  const releaseDate = iso(game.releaseDate, `${path}.releaseDate`);

  const players = object(game.players, `${path}.players`);
  if (players.max !== "unknown" && (!Number.isInteger(players.max) || (players.max as number) <= 0)) fail(`${path}.players.max`, "must be a positive integer or unknown");
  if (typeof players.source !== "string" || !PLAYER_SOURCES.has(players.source)) fail(`${path}.players.source`, "must be a PlayerSource");
  bool(players.online, `${path}.players.online`);
  bool(players.localCoop, `${path}.players.localCoop`);

  if (typeof game.sessionShape !== "string" || !SESSION_SHAPES.has(game.sessionShape as SessionShape)) fail(`${path}.sessionShape`, "must be a SessionShape");
  const viewerPlayable = object(game.viewerPlayable, `${path}.viewerPlayable`);
  bool(viewerPlayable.ok, `${path}.viewerPlayable.ok`);
  if (viewerPlayable.reason !== undefined) string(viewerPlayable.reason, `${path}.viewerPlayable.reason`, true);

  const vibes = object(game.vibes, `${path}.vibes`);
  if (Object.keys(vibes).length !== VIBES.length || VIBES.some((vibe) => !(vibe in vibes))) fail(`${path}.vibes`, "must contain exactly six vibe axes");
  for (const vibe of VIBES) finite(vibes[vibe], `${path}.vibes.${vibe}`, 0, 1);

  const buzz = object(game.buzz, `${path}.buzz`);
  finite(buzz.twitchViewers, `${path}.buzz.twitchViewers`, 0);
  finite(buzz.twitchChannels, `${path}.buzz.twitchChannels`, 0);
  if (buzz.viewerGrowth7d !== null) finite(buzz.viewerGrowth7d, `${path}.buzz.viewerGrowth7d`, Number.MIN_VALUE);
  const isNewRelease = bool(buzz.isNewRelease, `${path}.buzz.isNewRelease`);
  if (isNewRelease !== deriveIsNewRelease(releaseDate, generatedAt)) fail(`${path}.buzz.isNewRelease`, "must match generatedAt and releaseDate");

  if (!Array.isArray(game.topTags) || game.topTags.length > 8) fail(`${path}.topTags`, "must contain at most eight tags");
  game.topTags.forEach((tag, tagIndex) => {
    const parsed = object(tag, `${path}.topTags[${tagIndex}]`);
    string(parsed.tag, `${path}.topTags[${tagIndex}].tag`, true);
    finite(parsed.share, `${path}.topTags[${tagIndex}].share`, 0, 1);
  });
  if (game.steamAppId !== undefined && (typeof game.steamAppId !== "number" || !Number.isInteger(game.steamAppId) || game.steamAppId <= 0)) fail(`${path}.steamAppId`, "must be a positive integer");
  if (game.discountPercent !== undefined) finite(game.discountPercent, `${path}.discountPercent`, 0, 100);
  if (game.rating !== undefined) finite(game.rating, `${path}.rating`, 0, 100);
  if (game.reviewCount !== undefined && (typeof game.reviewCount !== "number" || !Number.isInteger(game.reviewCount) || game.reviewCount < 0)) fail(`${path}.reviewCount`, "must be a non-negative integer");
}

export function validateCatalog(value: unknown): asserts value is CatalogRecord {
  const catalog = object(value, "catalog");
  const generatedAt = iso(catalog.generatedAt, "generatedAt");
  if (!Array.isArray(catalog.games)) fail("games", "must be an array");
  const ids = new Set<string>();
  catalog.games.forEach((game, index) => validateGame(game, index, generatedAt, ids));
}
