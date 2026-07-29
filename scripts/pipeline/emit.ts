import { mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import type { CatalogManifest, CatalogRecord } from "./model";
import { validateCatalog, validateCatalogChunk, validateCatalogManifest } from "./schema";

const CATALOG_PATH = "src/playground/game-recommendation/catalog.json";
const CHUNK_SIZE = 500;

export type FileStore = {
  read(path: string): string | null;
  writeAtomic(path: string, contents: string): void;
  delete(path: string): void;
};

export type EmitResult = { catalogUpdated: boolean; gameCount: number };

/** Node-backed output with a same-directory temporary file followed by rename. */
export function createNodeFileStore(rootDir = process.cwd()): FileStore {
  return {
    read(path) {
      try {
        return readFileSync(resolve(rootDir, path), "utf8");
      } catch (error: unknown) {
        if (typeof error === "object" && error !== null && "code" in error && error.code === "ENOENT") return null;
        throw error;
      }
    },
    writeAtomic(path, contents) {
      const destination = resolve(rootDir, path);
      const temporary = `${destination}.tmp`;
      mkdirSync(dirname(destination), { recursive: true });
      writeFileSync(temporary, contents, "utf8");
      renameSync(temporary, destination);
    },
    delete(path) {
      rmSync(resolve(rootDir, path), { force: true });
    },
  };
}

export function readCatalog(fs: FileStore): CatalogManifest | null {
  const contents = fs.read(CATALOG_PATH);
  if (contents === null) return null;
  const parsed = parseJson(contents, CATALOG_PATH);
  if (hasGames(parsed)) {
    const legacyCatalog = normalizeLegacyCatalog(parsed);
    try {
      validateCatalog(legacyCatalog);
    } catch (error) {
      throw new Error(`${CATALOG_PATH}: ${error instanceof Error ? error.message : String(error)}`);
    }
    return {
      generatedAt: legacyCatalog.generatedAt,
      gameCount: legacyCatalog.games.length,
      chunks: [],
    };
  }
  try {
    validateCatalogManifest(parsed);
  } catch (error) {
    throw new Error(`${CATALOG_PATH}: ${error instanceof Error ? error.message : String(error)}`);
  }

  let gameCount = 0;
  for (const chunkPath of parsed.chunks) {
    const filePath = toPublicChunkPath(chunkPath);
    const chunkContents = fs.read(filePath);
    if (chunkContents === null) throw new Error(`${filePath}: missing`);
    const chunk = parseJson(chunkContents, filePath);
    try {
      validateCatalogChunk(chunk, parsed.generatedAt);
    } catch (error) {
      throw new Error(`${filePath}: ${error instanceof Error ? error.message : String(error)}`);
    }
    gameCount += chunk.games.length;
  }
  if (gameCount !== parsed.gameCount) {
    throw new Error(`${CATALOG_PATH}: gameCount ${parsed.gameCount} does not match chunk total ${gameCount}`);
  }
  return parsed;
}

export function emitCatalog(next: CatalogRecord, previous: CatalogManifest | null, fs: FileStore): EmitResult {
  validateCatalog(next);
  if (previous) {
    validateCatalogManifest(previous);
    if (next.games.length <= previous.gameCount * 0.7) {
      throw new Error(`catalog declined by 30% or more (${previous.gameCount} to ${next.games.length})`);
    }
  }

  const nextManifest: CatalogManifest = {
    generatedAt: next.generatedAt,
    gameCount: next.games.length,
    chunks: chunkPathsFor(next.games.length),
  };

  nextManifest.chunks.forEach((chunkPath, index) => {
    const chunk: CatalogRecord = {
      generatedAt: next.generatedAt,
      games: next.games.slice(index * CHUNK_SIZE, (index + 1) * CHUNK_SIZE),
    };
    fs.writeAtomic(toPublicChunkPath(chunkPath), `${JSON.stringify(chunk, null, 2)}\n`);
  });
  fs.writeAtomic(CATALOG_PATH, `${JSON.stringify(nextManifest, null, 2)}\n`);

  if (previous) {
    const activeChunks = new Set(nextManifest.chunks);
    previous.chunks
      .filter((chunkPath) => !activeChunks.has(chunkPath))
      .forEach((chunkPath) => fs.delete(toPublicChunkPath(chunkPath)));
  }
  return { catalogUpdated: true, gameCount: next.games.length };
}

function parseJson(contents: string, path: string): unknown {
  try {
    return JSON.parse(contents);
  } catch {
    throw new Error(`${path}: invalid JSON`);
  }
}

function hasGames(value: unknown): value is CatalogRecord {
  return value !== null && typeof value === "object" && !Array.isArray(value) && Array.isArray((value as { games?: unknown }).games);
}

function chunkPathsFor(gameCount: number): string[] {
  const chunkCount = Math.ceil(gameCount / CHUNK_SIZE);
  return Array.from({ length: chunkCount }, (_value, index) => `./catalog/chunks/${index.toString().padStart(4, "0")}.json`);
}

function toPublicChunkPath(chunkPath: string): string {
  if (!/^\.\/catalog\/chunks\/\d{4}\.json$/.test(chunkPath)) {
    throw new Error(`invalid catalog chunk path: ${chunkPath}`);
  }
  return `src/playground/game-recommendation/${chunkPath.slice(2)}`;
}

function normalizeLegacyCatalog(value: unknown): CatalogRecord {
  if (value === null || typeof value !== "object" || Array.isArray(value)) return value as CatalogRecord;
  const catalog = value as Record<string, unknown>;
  const generatedAt = typeof catalog.generatedAt === "string" ? catalog.generatedAt : new Date(0).toISOString();
  if (!Array.isArray(catalog.games)) return value as CatalogRecord;
  return {
    ...catalog,
    generatedAt,
    games: catalog.games.map((game) => normalizeLegacyGame(game, generatedAt)),
  } as CatalogRecord;
}

function normalizeLegacyGame(value: unknown, generatedAt: string) {
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
