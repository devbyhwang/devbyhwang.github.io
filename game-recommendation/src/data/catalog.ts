import type { Catalog, CatalogChunk, CatalogManifest, Game, QualityStats, StreamingStats } from "../domain/types";

export async function loadCatalog(fetcher: typeof fetch = fetch): Promise<Catalog> {
  const response = await fetcher("./catalog.json");
  if (!response.ok) throw new Error(`catalog.json: ${response.status}`);
  const manifestOrCatalog = await response.json();
  const catalog = normalizeLegacyCatalog(manifestOrCatalog);
  if (isCatalog(catalog)) return catalog;
  if (!looksLikeManifest(manifestOrCatalog)) throw new Error("invalid Catalog");
  try {
    validateCatalogManifest(manifestOrCatalog);
  } catch (error) {
    throw new Error(`catalog.json: ${error instanceof Error ? error.message : String(error)}`);
  }

  const chunks = await Promise.all(manifestOrCatalog.chunks.map(async (path) => {
    const chunkResponse = await fetcher(path);
    if (!chunkResponse.ok) throw new Error(`${path}: ${chunkResponse.status}`);
    const chunk = normalizeLegacyCatalog(await chunkResponse.json());
    if (!isCatalogChunk(chunk, manifestOrCatalog.generatedAt)) throw new Error(`${path}: invalid Catalog chunk`);
    return { path, chunk };
  }));

  const ids = new Set<string>();
  const games = chunks.flatMap(({ chunk, path }) => chunk.games.map((game) => {
    if (ids.has(game.id)) throw new Error(`${path}: duplicate game id "${game.id}"`);
    ids.add(game.id);
    return game;
  }));
  if (games.length !== manifestOrCatalog.gameCount) {
    throw new Error(`catalog.json: gameCount ${manifestOrCatalog.gameCount} does not match loaded chunk total ${games.length}`);
  }
  return {
    generatedAt: manifestOrCatalog.generatedAt,
    games,
  };
}

export function isCatalogChunk(value: unknown, manifestGeneratedAt?: string): value is CatalogChunk {
  try {
    const catalog = record(value);
    const generatedAt = timestamp(catalog.generatedAt);
    if (manifestGeneratedAt !== undefined && generatedAt !== manifestGeneratedAt) return false;
    if (!Array.isArray(catalog.games)) return false;
    const ids = new Set<string>();
    return catalog.games.every((game) => isGame(game, generatedAt, ids));
  } catch {
    return false;
  }
}

export function isCatalogManifest(value: unknown): value is CatalogManifest {
  try {
    validateCatalogManifest(value);
    return true;
  } catch {
    return false;
  }
}

function isCatalog(value: unknown): value is Catalog {
  return isCatalogChunk(value);
}

function looksLikeManifest(value: unknown): value is Record<string, unknown> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) return false;
  const recordValue = value as Record<string, unknown>;
  return "chunks" in recordValue || "gameCount" in recordValue;
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

function catalogChunkPath(value: unknown, path: string): string {
  const chunkPath = text(value, true) ? value : null;
  if (chunkPath === null || !/^\.\/catalog\/chunks\/\d{4}\.json$/.test(chunkPath)) {
    throw new Error(`${path}: must be a relative catalog chunk path like ./catalog/chunks/0000.json`);
  }
  return chunkPath;
}

function number(value: unknown, minimum: number, maximum = Infinity): value is number {
  return typeof value === "number" && Number.isFinite(value) && value >= minimum && value <= maximum;
}

function integer(value: unknown, minimum: number, maximum = Infinity): value is number {
  return typeof value === "number" && Number.isInteger(value) && value >= minimum && value <= maximum;
}

function nullableNumber(value: unknown, minimum: number, maximum = Infinity): value is number | null {
  return value === null || number(value, minimum, maximum);
}

function optionalNumber(value: unknown, minimum: number, maximum = Infinity): value is number | undefined {
  return value === undefined || number(value, minimum, maximum);
}

function optionalInteger(value: unknown, minimum: number, maximum = Infinity): value is number | undefined {
  return value === undefined || integer(value, minimum, maximum);
}

function anyNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function nullableAnyNumber(value: unknown): value is number | null {
  return value === null || anyNumber(value);
}

function isStreaming(value: unknown): value is StreamingStats {
  const streaming = record(value);
  return integer(streaming.totalViewers, 0)
    && integer(streaming.channelCount, 0)
    && nullableNumber(streaming.medianViewersPerChannel, 0)
    && nullableNumber(streaming.p75ViewersPerChannel, 0)
    && nullableNumber(streaming.top10ViewerShare, 0, 1)
    && nullableNumber(streaming.viewerConcentration, 0, 1)
    && nullableAnyNumber(streaming.growth7d)
    && nullableAnyNumber(streaming.growth30d)
    && nullableAnyNumber(streaming.growth90d)
    && nullableNumber(streaming.volatility30d, 0)
    && integer(streaming.observedSnapshots, 0)
    && number(streaming.coverage, 0, 1)
    && text(streaming.asOf)
    && isIsoTimestamp(streaming.asOf);
}

function isQuality(value: unknown): value is QualityStats {
  const quality = record(value);
  return optionalNumber(quality.igdbRating, 0, 100)
    && optionalInteger(quality.igdbRatingCount, 0)
    && optionalNumber(quality.criticRating, 0, 100)
    && optionalInteger(quality.criticRatingCount, 0)
    && optionalNumber(quality.totalRating, 0, 100)
    && optionalInteger(quality.totalRatingCount, 0)
    && optionalInteger(quality.steamPositive, 0)
    && optionalInteger(quality.steamNegative, 0);
}

function isGame(value: unknown, generatedAt: string, ids: Set<string>): value is Game {
  const game = record(value);
  if (!text(game.id, true) || ids.has(game.id) || !text(game.name, true)) return false;
  ids.add(game.id);
  const releaseDate = timestamp(game.releaseDate);
  const players = record(game.players);
  if (players.max !== "unknown" && (!integer(players.max, 1))) return false;
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
    || (buzz.viewerGrowth7d !== null && !anyNumber(buzz.viewerGrowth7d))
    || typeof buzz.isNewRelease !== "boolean") return false;
  const releaseAge = (Date.parse(generatedAt) - Date.parse(releaseDate)) / (24 * 60 * 60 * 1000);
  if (buzz.isNewRelease !== (releaseAge >= 0 && releaseAge <= 30)) return false;
  if (!isStreaming(game.streaming) || !isQuality(game.quality)) return false;
  if (!Array.isArray(game.topTags) || game.topTags.length > 8 || !game.topTags.every((tag) => {
    const parsed = record(tag);
    return text(parsed.tag, true) && number(parsed.share, 0, 1);
  })) return false;
  if (game.steamAppId !== undefined && !integer(game.steamAppId, 1)) return false;
  if (game.discountPercent !== undefined && !number(game.discountPercent, 0, 100)) return false;
  if (game.rating !== undefined && !number(game.rating, 0, 100)) return false;
  return game.reviewCount === undefined || integer(game.reviewCount, 0);
}

function normalizeLegacyCatalog(value: unknown): unknown {
  if (value === null || typeof value !== "object" || Array.isArray(value)) return value;
  const catalog = value as Record<string, unknown>;
  const generatedAt = typeof catalog.generatedAt === "string" ? catalog.generatedAt : new Date(0).toISOString();
  if (!Array.isArray(catalog.games)) return value;
  return {
    ...catalog,
    games: catalog.games.map((game) => normalizeLegacyGame(game, generatedAt)),
  };
}

function validateCatalogManifest(value: unknown): asserts value is CatalogManifest {
  const manifest = record(value);
  timestamp(manifest.generatedAt);
  if (!integer(manifest.gameCount, 0)) throw new Error("gameCount: must be a non-negative integer");
  if (!Array.isArray(manifest.chunks)) throw new Error("chunks: must be an array");
  const seen = new Set<string>();
  manifest.chunks.forEach((chunk, index) => {
    const path = catalogChunkPath(chunk, `chunks[${index}]`);
    if (seen.has(path)) throw new Error(`chunks[${index}]: must be unique`);
    seen.add(path);
  });
}

function normalizeLegacyGame(value: unknown, generatedAt: string): unknown {
  if (value === null || typeof value !== "object" || Array.isArray(value)) return value;
  const game = value as Record<string, unknown>;
  const buzz = (game.buzz !== null && typeof game.buzz === "object" && !Array.isArray(game.buzz))
    ? game.buzz as Record<string, unknown>
    : {};
  const hasStreamingObject = game.streaming !== undefined;
  const legacyStreaming = (game.streaming !== null && typeof game.streaming === "object" && !Array.isArray(game.streaming))
    ? game.streaming as Record<string, unknown>
    : {};
  const hasQualityObject = game.quality !== undefined;
  const legacyQuality = (game.quality !== null && typeof game.quality === "object" && !Array.isArray(game.quality))
    ? game.quality as Record<string, unknown>
    : {};
  return {
    ...game,
    streaming: hasStreamingObject
      ? {
        ...legacyStreaming,
        medianViewersPerChannel: legacyStreaming.medianViewersPerChannel ?? null,
        p75ViewersPerChannel: legacyStreaming.p75ViewersPerChannel ?? null,
        top10ViewerShare: legacyStreaming.top10ViewerShare ?? null,
        viewerConcentration: legacyStreaming.viewerConcentration ?? null,
        growth30d: legacyStreaming.growth30d ?? null,
        growth90d: legacyStreaming.growth90d ?? null,
        volatility30d: legacyStreaming.volatility30d ?? null,
        observedSnapshots: legacyStreaming.observedSnapshots ?? 0,
        coverage: legacyStreaming.coverage ?? 0,
        asOf: legacyStreaming.asOf ?? generatedAt,
      }
      : {
        totalViewers: buzz.twitchViewers ?? 0,
        channelCount: buzz.twitchChannels ?? 0,
        medianViewersPerChannel: null,
        p75ViewersPerChannel: null,
        top10ViewerShare: null,
        viewerConcentration: null,
        growth7d: buzz.viewerGrowth7d ?? null,
        growth30d: null,
        growth90d: null,
        volatility30d: null,
        observedSnapshots: 0,
        coverage: 0,
        asOf: generatedAt,
      },
    quality: hasQualityObject ? legacyQuality : {},
  };
}
