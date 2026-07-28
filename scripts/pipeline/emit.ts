import { mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import type { CatalogRecord } from "./model";
import { validateCatalog } from "./schema";

const CATALOG_PATH = "src/playground/game-recommendation/catalog.json";

export type FileStore = {
  read(path: string): string | null;
  writeAtomic(path: string, contents: string): void;
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
  };
}

export function readCatalog(fs: FileStore): CatalogRecord | null {
  const contents = fs.read(CATALOG_PATH);
  if (contents === null) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(contents);
  } catch {
    throw new Error(`${CATALOG_PATH}: invalid JSON`);
  }
  try {
    validateCatalog(parsed);
  } catch (error) {
    throw new Error(`${CATALOG_PATH}: ${error instanceof Error ? error.message : String(error)}`);
  }
  return parsed;
}

export function emitCatalog(next: CatalogRecord, previous: CatalogRecord | null, fs: FileStore): EmitResult {
  validateCatalog(next);
  if (previous) {
    validateCatalog(previous);
    if (next.games.length <= previous.games.length * 0.7) {
      throw new Error(`catalog declined by 30% or more (${previous.games.length} to ${next.games.length})`);
    }
  }
  fs.writeAtomic(CATALOG_PATH, `${JSON.stringify(next, null, 2)}\n`);
  return { catalogUpdated: true, gameCount: next.games.length };
}
