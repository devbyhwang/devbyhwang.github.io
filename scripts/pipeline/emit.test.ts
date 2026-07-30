import { describe, expect, it } from "vitest";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createNodeFileStore, emitCatalog, readCatalog, type FileStore } from "./emit";
import type { CatalogManifest, CatalogRecord } from "./model";
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
      buzz: { twitchViewers: 0, twitchChannels: 0, viewerGrowth7d: null, isNewRelease: true, demandShare: 0, sources: { chzzk: false, twitch: true } },
      streaming: {
        totalViewers: 0,
        channelCount: 0,
        medianViewersPerChannel: null,
        p75ViewersPerChannel: null,
        top10ViewerShare: null,
        viewerConcentration: null,
        growth7d: null,
        growth30d: null,
        growth90d: null,
        volatility30d: null,
        observedSnapshots: 0,
        coverage: 0,
        asOf: generatedAt,
      },
      quality: {},
      topTags: [{ tag: "Fixture", share: 1 }],
      rating: 50,
      reviewCount: 0,
    })),
  };
}

function memoryFileStore(seed: Record<string, string> = {}) {
  const files = new Map(Object.entries(seed));
  const writes: Array<{ path: string; contents: string }> = [];
  const deletes: string[] = [];
  const fs: FileStore = {
    read: (path) => files.get(path) ?? null,
    writeAtomic: (path, contents) => {
      writes.push({ path, contents });
      files.set(path, contents);
    },
    delete: (path) => {
      deletes.push(path);
      files.delete(path);
    },
  };
  return { fs, writes, deletes, files };
}

function legacyCatalog() {
  return {
    generatedAt,
    games: [{
      id: "legacy",
      name: "Legacy",
      releaseDate: "2026-07-20T00:00:00.000Z",
      players: { max: "unknown", source: "unknown", online: false, localCoop: false },
      sessionShape: "run",
      viewerPlayable: { ok: false },
      vibes: { healing: 0.5, variety: 0.5, horror: 0.5, hardcore: 0.5, chatting: 0.5, spectacle: 0.5 },
      buzz: { twitchViewers: 12, twitchChannels: 3, viewerGrowth7d: -0.25, isNewRelease: true, demandShare: 0, sources: { chzzk: false, twitch: true } },
      topTags: [],
      rating: 90,
      reviewCount: 100,
    }],
  };
}

describe("catalog schema", () => {
  it("rejects invalid nested fields with their catalog path", () => {
    const catalog = catalogWith(1);
    catalog.games[0].players.max = 0;
    expect(() => validateCatalog(catalog)).toThrow("games[0].players.max");
  });

  it.each([
    ["a non-finite growth value", (catalog: ReturnType<typeof catalogWith>) => { catalog.games[0].buzz.viewerGrowth7d = Number.POSITIVE_INFINITY; }, "games[0].buzz.viewerGrowth7d"],
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

  it("accepts negative growth values and null unobserved distribution metrics", () => {
    const catalog = catalogWith(1);
    catalog.games[0].buzz.viewerGrowth7d = -0.42;
    catalog.games[0].streaming.growth7d = -0.42;
    catalog.games[0].streaming.growth30d = -0.55;
    catalog.games[0].streaming.growth90d = -0.73;

    expect(() => validateCatalog(catalog)).not.toThrow();
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
    const previous: CatalogManifest = {
      generatedAt,
      gameCount: 100,
      chunks: ["./catalog/chunks/0000.json"],
    };
    const next = catalogWith(69);
    const { fs, writes, deletes } = memoryFileStore({ "src/playground/game-recommendation/catalog.json": JSON.stringify(previous) });

    expect(() => emitCatalog(next, previous, fs)).toThrow("30%");
    expect(JSON.parse(fs.read("src/playground/game-recommendation/catalog.json")!)).toEqual(previous);
    expect(writes).toEqual([]);
    expect(deletes).toEqual([]);
  });

  it("writes a manifest plus deterministic chunk files when the guard passes", () => {
    const previous: CatalogManifest = {
      generatedAt,
      gameCount: 510,
      chunks: ["./catalog/chunks/0000.json", "./catalog/chunks/0001.json"],
    };
    const next = catalogWith(501);
    const { fs, writes } = memoryFileStore({ "src/playground/game-recommendation/catalog.json": JSON.stringify(previous) });

    expect(emitCatalog(next, previous, fs)).toEqual({ catalogUpdated: true, gameCount: 501 });
    expect(writes.map((entry) => entry.path)).toEqual([
      "src/playground/game-recommendation/catalog/chunks/0000.json",
      "src/playground/game-recommendation/catalog/chunks/0001.json",
      "src/playground/game-recommendation/catalog.json",
    ]);
    expect(JSON.parse(fs.read("src/playground/game-recommendation/catalog.json")!)).toEqual({
      generatedAt,
      gameCount: 501,
      chunks: ["./catalog/chunks/0000.json", "./catalog/chunks/0001.json"],
    });
    expect(JSON.parse(fs.read("src/playground/game-recommendation/catalog/chunks/0000.json")!)).toEqual({
      generatedAt,
      games: next.games.slice(0, 500),
    });
    expect(JSON.parse(fs.read("src/playground/game-recommendation/catalog/chunks/0001.json")!)).toEqual({
      generatedAt,
      games: next.games.slice(500),
    });
    expect(readCatalog(fs)).toEqual({
      generatedAt,
      gameCount: 501,
      chunks: ["./catalog/chunks/0000.json", "./catalog/chunks/0001.json"],
    });
  });

  it("removes only stale chunk files listed by the previous manifest", () => {
    const previous: CatalogManifest = {
      generatedAt,
      gameCount: 1001,
      chunks: [
        "./catalog/chunks/0000.json",
        "./catalog/chunks/0001.json",
        "./catalog/chunks/0002.json",
      ],
    };
    const next = catalogWith(1000);
    const { fs, deletes, files } = memoryFileStore({
      "src/playground/game-recommendation/catalog.json": JSON.stringify(previous),
      "src/playground/game-recommendation/catalog/chunks/0000.json": "old-0",
      "src/playground/game-recommendation/catalog/chunks/0001.json": "old-1",
      "src/playground/game-recommendation/catalog/chunks/0002.json": "old-2",
      "src/playground/game-recommendation/catalog/chunks/9999.json": "stray",
    });

    emitCatalog(next, previous, fs);

    expect(deletes).toEqual(["src/playground/game-recommendation/catalog/chunks/0002.json"]);
    expect(files.get("src/playground/game-recommendation/catalog/chunks/9999.json")).toBe("stray");
  });

  it("allows a first catalog and rejects invalid persisted manifest JSON", () => {
    const next = catalogWith(1);
    const first = memoryFileStore();
    expect(emitCatalog(next, null, first.fs)).toEqual({ catalogUpdated: true, gameCount: 1 });

    const invalid = memoryFileStore({ "src/playground/game-recommendation/catalog.json": "not JSON" });
    expect(() => readCatalog(invalid.fs)).toThrow("src/playground/game-recommendation/catalog.json");
  });

  it("rejects a persisted manifest whose chunk counts do not match gameCount", () => {
    const persisted = memoryFileStore({
      "src/playground/game-recommendation/catalog.json": JSON.stringify({
        generatedAt,
        gameCount: 2,
        chunks: ["./catalog/chunks/0000.json"],
      }),
      "src/playground/game-recommendation/catalog/chunks/0000.json": JSON.stringify({
        generatedAt,
        games: catalogWith(1).games,
      }),
    });

    expect(() => readCatalog(persisted.fs)).toThrow("src/playground/game-recommendation/catalog.json");
  });

  it("rejects a persisted manifest with chunk paths outside the contract", () => {
    const persisted = memoryFileStore({
      "src/playground/game-recommendation/catalog.json": JSON.stringify({
        generatedAt,
        gameCount: 1,
        chunks: ["/tmp/0000.json"],
      }),
    });

    expect(() => readCatalog(persisted.fs)).toThrow("src/playground/game-recommendation/catalog.json: chunks[0]");
  });

  it("refuses stale deletion when a prior manifest path would collide by basename", () => {
    const previous: CatalogManifest = {
      generatedAt,
      gameCount: 1001,
      chunks: [
        "./catalog/chunks/0000.json",
        "./evil/0002.json",
      ],
    };
    const next = catalogWith(800);
    const { fs, deletes, writes, files } = memoryFileStore({
      "src/playground/game-recommendation/catalog.json": JSON.stringify(previous),
      "src/playground/game-recommendation/catalog/chunks/0000.json": "old-0",
      "src/playground/game-recommendation/catalog/chunks/0002.json": "must-stay",
    });

    expect(() => emitCatalog(next, previous, fs)).toThrow("chunks[1]");
    expect(deletes).toEqual([]);
    expect(writes).toEqual([]);
    expect(files.get("src/playground/game-recommendation/catalog/chunks/0002.json")).toBe("must-stay");
  });

  it("summarizes a legacy persisted catalog without streaming or quality for migration guards", () => {
    const { fs } = memoryFileStore({ "src/playground/game-recommendation/catalog.json": JSON.stringify(legacyCatalog()) });

    expect(readCatalog(fs)).toEqual({
      generatedAt,
      gameCount: 1,
      chunks: [],
    });
  });

  it("uses same-directory temporary files and leaves only atomic manifest and chunk destinations", () => {
    const root = mkdtempSync(join(tmpdir(), "catalog-emit-"));
    try {
      const next = catalogWith(1);
      emitCatalog(next, null, createNodeFileStore(root));

      expect(JSON.parse(readFileSync(join(root, "src/playground/game-recommendation/catalog.json"), "utf8"))).toEqual({
        generatedAt,
        gameCount: 1,
        chunks: ["./catalog/chunks/0000.json"],
      });
      expect(JSON.parse(readFileSync(join(root, "src/playground/game-recommendation/catalog/chunks/0000.json"), "utf8"))).toEqual(next);
      expect(existsSync(join(root, "src/playground/game-recommendation/catalog.json.tmp"))).toBe(false);
      expect(existsSync(join(root, "src/playground/game-recommendation/catalog/chunks/0000.json.tmp"))).toBe(false);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});
