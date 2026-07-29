import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { CatalogChunk, CatalogManifest, CatalogRecord, GameRecord } from "./model";

export function readEmittedGames(rootDir: string): GameRecord[] {
  const manifest = JSON.parse(readFileSync(join(rootDir, "src/playground/game-recommendation/catalog.json"), "utf8")) as CatalogManifest;
  const chunks = manifest.chunks.map((chunkPath) =>
    JSON.parse(readFileSync(join(rootDir, "src/playground/game-recommendation", chunkPath.slice(2)), "utf8")) as CatalogChunk);
  return chunks.flatMap((chunk) => chunk.games);
}

export function readEmittedCatalog(rootDir: string): CatalogRecord {
  const manifest = JSON.parse(readFileSync(join(rootDir, "src/playground/game-recommendation/catalog.json"), "utf8")) as CatalogManifest;
  return {
    generatedAt: manifest.generatedAt,
    games: readEmittedGames(rootDir),
  };
}
