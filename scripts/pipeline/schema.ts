import { deriveIsNewRelease } from "./enrich";
import type {
  CatalogChunk,
  CatalogManifest,
  CatalogRecord,
  GameRecord,
  QualityStats,
  SessionShape,
  StreamingStats,
  VibeKey,
} from "./model";

const ISO_TIMESTAMP = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;
const CATALOG_CHUNK_PATH = /^\.\/catalog\/chunks\/\d{4}\.json$/;
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

function catalogChunkPath(value: unknown, path: string): string {
  const chunkPath = string(value, path, true);
  if (!CATALOG_CHUNK_PATH.test(chunkPath)) fail(path, "must be a relative catalog chunk path like ./catalog/chunks/0000.json");
  return chunkPath;
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

function integer(value: unknown, path: string, min: number, max = Infinity): number {
  if (typeof value !== "number" || !Number.isInteger(value) || value < min || value > max) fail(path, `must be an integer from ${min} to ${max}`);
  return value;
}

function bool(value: unknown, path: string): boolean {
  if (typeof value !== "boolean") fail(path, "must be a boolean");
  return value;
}

function nullableFinite(value: unknown, path: string, min: number, max = Infinity): number | null {
  if (value === null) return null;
  return finite(value, path, min, max);
}

function nullableAnyFinite(value: unknown, path: string): number | null {
  if (value === null) return null;
  return finite(value, path, -Infinity);
}

function optionalFinite(value: unknown, path: string, min: number, max = Infinity): number | undefined {
  if (value === undefined) return undefined;
  return finite(value, path, min, max);
}

function optionalInteger(value: unknown, path: string, min: number, max = Infinity): number | undefined {
  if (value === undefined) return undefined;
  return integer(value, path, min, max);
}

function validateStreaming(value: unknown, path: string): asserts value is StreamingStats {
  const streaming = object(value, path);
  integer(streaming.totalViewers, `${path}.totalViewers`, 0);
  integer(streaming.channelCount, `${path}.channelCount`, 0);
  nullableFinite(streaming.medianViewersPerChannel, `${path}.medianViewersPerChannel`, 0);
  nullableFinite(streaming.p75ViewersPerChannel, `${path}.p75ViewersPerChannel`, 0);
  nullableFinite(streaming.top10ViewerShare, `${path}.top10ViewerShare`, 0, 1);
  nullableFinite(streaming.viewerConcentration, `${path}.viewerConcentration`, 0, 1);
  nullableAnyFinite(streaming.growth7d, `${path}.growth7d`);
  nullableAnyFinite(streaming.growth30d, `${path}.growth30d`);
  nullableAnyFinite(streaming.growth90d, `${path}.growth90d`);
  nullableFinite(streaming.volatility30d, `${path}.volatility30d`, 0);
  integer(streaming.observedSnapshots, `${path}.observedSnapshots`, 0);
  finite(streaming.coverage, `${path}.coverage`, 0, 1);
  iso(streaming.asOf, `${path}.asOf`);
}

function validateQuality(value: unknown, path: string): asserts value is QualityStats {
  const quality = object(value, path);
  optionalFinite(quality.igdbRating, `${path}.igdbRating`, 0, 100);
  optionalInteger(quality.igdbRatingCount, `${path}.igdbRatingCount`, 0);
  optionalFinite(quality.criticRating, `${path}.criticRating`, 0, 100);
  optionalInteger(quality.criticRatingCount, `${path}.criticRatingCount`, 0);
  optionalFinite(quality.igdbTotalRating, `${path}.igdbTotalRating`, 0, 100);
  optionalInteger(quality.igdbTotalRatingCount, `${path}.igdbTotalRatingCount`, 0);
  optionalFinite(quality.totalRating, `${path}.totalRating`, 0, 100);
  optionalInteger(quality.totalRatingCount, `${path}.totalRatingCount`, 0);
  optionalInteger(quality.steamPositive, `${path}.steamPositive`, 0);
  optionalInteger(quality.steamNegative, `${path}.steamNegative`, 0);
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
  for (const field of ["genres", "themes"] as const) {
    const value = game[field];
    if (!Array.isArray(value) || value.some((entry) => typeof entry !== "string" || entry.length === 0)) {
      fail(`${path}.${field}`, "must be an array of non-empty strings");
    }
  }
  const viewerPlayable = object(game.viewerPlayable, `${path}.viewerPlayable`);
  bool(viewerPlayable.ok, `${path}.viewerPlayable.ok`);
  if (viewerPlayable.reason !== undefined) string(viewerPlayable.reason, `${path}.viewerPlayable.reason`, true);

  const vibes = object(game.vibes, `${path}.vibes`);
  if (Object.keys(vibes).length !== VIBES.length || VIBES.some((vibe) => !(vibe in vibes))) fail(`${path}.vibes`, "must contain exactly six vibe axes");
  for (const vibe of VIBES) finite(vibes[vibe], `${path}.vibes.${vibe}`, 0, 1);

  const buzz = object(game.buzz, `${path}.buzz`);
  finite(buzz.twitchViewers, `${path}.buzz.twitchViewers`, 0);
  finite(buzz.twitchChannels, `${path}.buzz.twitchChannels`, 0);
  if (buzz.viewerGrowth7d !== null) finite(buzz.viewerGrowth7d, `${path}.buzz.viewerGrowth7d`, -Infinity);
  finite(buzz.demandShare, `${path}.buzz.demandShare`, 0, 1);
  const demandSources = object(buzz.demandSources, `${path}.buzz.demandSources`);
  bool(demandSources.chzzk, `${path}.buzz.demandSources.chzzk`);
  bool(demandSources.twitch, `${path}.buzz.demandSources.twitch`);
  const sourceStatus = object(buzz.sourceStatus, `${path}.buzz.sourceStatus`);
  if (sourceStatus.chzzk !== "fresh" && sourceStatus.chzzk !== "disabled" && sourceStatus.chzzk !== "failed") fail(`${path}.buzz.sourceStatus.chzzk`, "must be a Chzzk source status");
  if (sourceStatus.twitch !== "fresh" && sourceStatus.twitch !== "stale") fail(`${path}.buzz.sourceStatus.twitch`, "must be a Twitch source status");
  const isNewRelease = bool(buzz.isNewRelease, `${path}.buzz.isNewRelease`);
  if (isNewRelease !== deriveIsNewRelease(releaseDate, generatedAt)) fail(`${path}.buzz.isNewRelease`, "must match generatedAt and releaseDate");
  validateStreaming(game.streaming, `${path}.streaming`);
  validateQuality(game.quality, `${path}.quality`);

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

export function validateCatalogChunk(value: unknown, manifestGeneratedAt?: string): asserts value is CatalogChunk {
  const chunk = object(value, "chunk");
  const generatedAt = iso(chunk.generatedAt, "generatedAt");
  if (manifestGeneratedAt !== undefined && generatedAt !== manifestGeneratedAt) fail("generatedAt", "must match manifest generatedAt");
  if (!Array.isArray(chunk.games)) fail("games", "must be an array");
  const ids = new Set<string>();
  chunk.games.forEach((game, index) => validateGame(game, index, generatedAt, ids));
}

export function validateCatalogManifest(value: unknown): asserts value is CatalogManifest {
  const manifest = object(value, "manifest");
  iso(manifest.generatedAt, "generatedAt");
  integer(manifest.gameCount, "gameCount", 0);
  if (!Array.isArray(manifest.chunks)) fail("chunks", "must be an array");
  const seen = new Set<string>();
  manifest.chunks.forEach((chunk, index) => {
    const path = catalogChunkPath(chunk, `chunks[${index}]`);
    if (seen.has(path)) fail(`chunks[${index}]`, "must be unique");
    seen.add(path);
  });
}

export function validateCatalog(value: unknown): asserts value is CatalogRecord {
  validateCatalogChunk(value);
}
