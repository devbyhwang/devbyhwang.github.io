import { describe, expect, it } from "vitest";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createNodeFileStore, emitCatalog, readCatalog, type FileStore } from "./emit";
import type { CatalogRecord } from "./model";
import { validateCatalog } from "./schema";

const generatedAt = "2026-07-28T00:00:00.000Z";

function catalogWith(count: number): CatalogRecord {
  return {
    generatedAt,
    games: Array.from({ length: count }, (_, index) => ({
      id: `game-${index}`,
      name: `Game ${index}`,
      releaseDate: "2026-07-20T00:00:00.000Z",
      players: { max: "unknown", source: "unknown", online: false, localCoop: false },
      sessionShape: "run",
      viewerPlayable: { ok: false },
      vibes: { healing: 0.5, variety: 0.5, horror: 0.5, hardcore: 0.5, chatting: 0.5, spectacle: 0.5 },
      buzz: { twitchViewers: 0, twitchChannels: 0, viewerGrowth7d: null, isNewRelease: true },
      topTags: [{ tag: "Fixture", share: 1 }],
      rating: 50,
      reviewCount: 0,
    })),
  };
}

function memoryFileStore(seed: Record<string, string> = {}) {
  const files = new Map(Object.entries(seed));
  const writes: Array<{ path: string; contents: string }> = [];
  const fs: FileStore = {
    read: (path) => files.get(path) ?? null,
    writeAtomic: (path, contents) => {
      writes.push({ path, contents });
      files.set(path, contents);
    },
  };
  return { fs, writes };
}

describe("catalog schema", () => {
  it("rejects invalid nested fields with their catalog path", () => {
    const catalog = catalogWith(1);
    catalog.games[0].players.max = 0;
    expect(() => validateCatalog(catalog)).toThrow("games[0].players.max");
  });

  it.each([
    ["a non-positive growth multiplier", (catalog: ReturnType<typeof catalogWith>) => { catalog.games[0].buzz.viewerGrowth7d = 0; }, "games[0].buzz.viewerGrowth7d"],
    ["an out-of-range rating", (catalog: ReturnType<typeof catalogWith>) => { catalog.games[0].rating = 101; }, "games[0].rating"],
    ["an out-of-range tag share", (catalog: ReturnType<typeof catalogWith>) => { catalog.games[0].topTags[0].share = 1.1; }, "games[0].topTags[0].share"],
    ["more than eight top tags", (catalog: ReturnType<typeof catalogWith>) => { catalog.games[0].topTags = Array.from({ length: 9 }, (_, index) => ({ tag: `Tag ${index}`, share: 1 })); }, "games[0].topTags"],
    ["a missing vibe axis", (catalog: ReturnType<typeof catalogWith>) => { delete (catalog.games[0].vibes as Partial<typeof catalog.games[0]["vibes"]>).spectacle; }, "games[0].vibes"],
    ["an out-of-range vibe axis", (catalog: ReturnType<typeof catalogWith>) => { catalog.games[0].vibes.spectacle = 1.1; }, "games[0].vibes.spectacle"],
  ])("rejects %s", (_label, mutate, path) => {
    const catalog = catalogWith(1);
    mutate(catalog);
    expect(() => validateCatalog(catalog)).toThrow(path);
  });

  it("rejects a new-release flag that disagrees with generatedAt", () => {
    const catalog = catalogWith(1);
    catalog.games[0].buzz.isNewRelease = false;
    expect(() => validateCatalog(catalog)).toThrow("games[0].buzz.isNewRelease");
  });

  it("does not permit a future release to claim new-release status", () => {
    const catalog = catalogWith(1);
    catalog.games[0].releaseDate = "2026-07-29T00:00:00.000Z";
    expect(() => validateCatalog(catalog)).toThrow("games[0].buzz.isNewRelease");

    catalog.games[0].buzz.isNewRelease = false;
    expect(() => validateCatalog(catalog)).not.toThrow();
  });

  it.each([
    ["generatedAt", (catalog: ReturnType<typeof catalogWith>) => { catalog.generatedAt = "2026-99-28T00:00:00.000Z"; }, "generatedAt"],
    ["releaseDate", (catalog: ReturnType<typeof catalogWith>) => { catalog.games[0].releaseDate = "2026-99-20T00:00:00.000Z"; }, "games[0].releaseDate"],
  ])("rejects calendar-invalid %s with its path", (_field, mutate, path) => {
    const catalog = catalogWith(1);
    mutate(catalog);
    expect(() => validateCatalog(catalog)).toThrow(path);
  });
});

describe("catalog emission", () => {
  it("does not replace the previous catalog when candidates shrink by 30 percent or more", () => {
    const previous = catalogWith(100);
    const next = catalogWith(69);
    const { fs } = memoryFileStore({ "src/playground/game-recommendation/catalog.json": JSON.stringify(previous) });

    expect(() => emitCatalog(next, previous, fs)).toThrow("30%");
    expect(JSON.parse(fs.read("src/playground/game-recommendation/catalog.json")!)).toEqual(previous);
  });

  it("validates, pretty-prints, and atomically replaces the catalog when the guard passes", () => {
    const previous = catalogWith(10);
    const next = catalogWith(8);
    const { fs, writes } = memoryFileStore({ "src/playground/game-recommendation/catalog.json": JSON.stringify(previous) });

    expect(emitCatalog(next, previous, fs)).toEqual({ catalogUpdated: true, gameCount: 8 });
    expect(writes).toEqual([{ path: "src/playground/game-recommendation/catalog.json", contents: `${JSON.stringify(next, null, 2)}\n` }]);
    expect(readCatalog(fs)).toEqual(next);
  });

  it("allows a first catalog and rejects invalid persisted catalog JSON", () => {
    const next = catalogWith(1);
    const first = memoryFileStore();
    expect(emitCatalog(next, null, first.fs)).toEqual({ catalogUpdated: true, gameCount: 1 });

    const invalid = memoryFileStore({ "src/playground/game-recommendation/catalog.json": "not JSON" });
    expect(() => readCatalog(invalid.fs)).toThrow("src/playground/game-recommendation/catalog.json");
  });

  it("uses a same-directory temporary file and leaves only the atomic catalog destination", () => {
    const root = mkdtempSync(join(tmpdir(), "catalog-emit-"));
    try {
      const next = catalogWith(1);
      emitCatalog(next, null, createNodeFileStore(root));

      expect(JSON.parse(readFileSync(join(root, "src/playground/game-recommendation/catalog.json"), "utf8"))).toEqual(next);
      expect(existsSync(join(root, "src/playground/game-recommendation/catalog.json.tmp"))).toBe(false);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});
