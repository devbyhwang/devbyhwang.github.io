import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { appendSnapshot, growth7d, makeDailySnapshot, readHistory, writeHistory } from "./history";
import type { CatalogRecord, History, JoinedGame, KnowledgeAssets, RawSources } from "./model";
import { runPipeline } from "./run";

const temporaryRoots: string[] = [];
const asOf = "2026-07-28T12:00:00.000Z";

afterEach(() => {
  for (const root of temporaryRoots.splice(0)) rmSync(root, { recursive: true, force: true });
});

function temporaryRoot(): string {
  const root = mkdtempSync(join(tmpdir(), "catalog-history-"));
  temporaryRoots.push(root);
  return root;
}

function joinedGame(id: number, viewers = 130, channels = 6): JoinedGame {
  return { igdb: { id, name: `Game ${id}` }, twitch: { viewers, channels }, tags: [] };
}

function rawSources(viewers = 130): RawSources {
  return {
    igdb: {
      fetchedAt: asOf,
      source: "igdb",
      request: {},
      responses: [],
      warnings: [],
      games: [{ id: 42, name: "Game 42", first_release_date: 1_784_505_600 }],
      externalGames: [],
      unresolvedSteamAppIds: [],
    },
    twitch: {
      fetchedAt: asOf,
      source: "twitch",
      request: {},
      responses: [],
      warnings: [],
      topGames: [{ categoryId: "42", igdbId: "42", name: "Game 42" }],
      streams: [{ categoryId: "42", igdbId: "42", viewers, channels: 6 }],
      truncated: false,
    },
    steam: {
      fetchedAt: asOf,
      source: "steam",
      request: {},
      responses: [],
      warnings: [],
      topSellerAppIds: [],
      apps: [],
      staleSources: [],
    },
  };
}

const knowledge: KnowledgeAssets = {
  tagVibes: {},
  sessionRules: { rules: [], default: "run" },
  viewerPlayable: { games: {}, tags: {} },
};

function catalogWith(count: number): CatalogRecord {
  return {
    generatedAt: asOf,
    games: Array.from({ length: count }, (_, index) => ({
      id: `previous-${index}`,
      name: `Previous ${index}`,
      releaseDate: "2026-07-20T00:00:00.000Z",
      players: { max: "unknown", source: "unknown", online: false, localCoop: false },
      sessionShape: "run",
      viewerPlayable: { ok: false },
      vibes: { healing: 0.5, variety: 0.5, horror: 0.5, hardcore: 0.5, chatting: 0.5, spectacle: 0.5 },
      buzz: { twitchViewers: 0, twitchChannels: 0, viewerGrowth7d: null, isNewRelease: true },
      topTags: [],
    })),
  };
}

describe("daily history", () => {
  it("adds snapshots to an empty history without inventing missing games", () => {
    expect(appendSnapshot({}, {
      "42": { date: "2026-07-28", twitchViewers: 130, twitchChannels: 6 },
    })).toEqual({
      "42": [{ date: "2026-07-28", twitchViewers: 130, twitchChannels: 6 }],
    });
  });

  it("replaces a game's same UTC-date snapshot and keeps games absent from this run", () => {
    const history: History = {
      "42": [{ date: "2026-07-28", twitchViewers: 100, twitchChannels: 5 }],
      "77": [{ date: "2026-07-27", twitchViewers: 80, twitchChannels: 4 }],
    };

    expect(appendSnapshot(history, {
      "42": { date: "2026-07-28", twitchViewers: 130, twitchChannels: 6 },
    })).toEqual({
      "42": [{ date: "2026-07-28", twitchViewers: 130, twitchChannels: 6 }],
      "77": [{ date: "2026-07-27", twitchViewers: 80, twitchChannels: 4 }],
    });
  });

  it("retains only the latest fourteen UTC days for each game", () => {
    const history: History = {
      "42": Array.from({ length: 14 }, (_, index) => ({
        date: `2026-07-${String(index + 1).padStart(2, "0")}`,
        twitchViewers: index + 1,
        twitchChannels: 1,
      })),
    };

    const next = appendSnapshot(history, {
      "42": { date: "2026-07-15", twitchViewers: 15, twitchChannels: 1 },
    });

    expect(next["42"].map((entry) => entry.date)).toEqual(Array.from(
      { length: 14 },
      (_, index) => `2026-07-${String(index + 2).padStart(2, "0")}`,
    ));
  });

  it("uses the UTC calendar date when making per-game snapshots", () => {
    expect(makeDailySnapshot([joinedGame(42), joinedGame(77, 0, 0)], asOf)).toEqual({
      "42": { date: "2026-07-28", twitchViewers: 130, twitchChannels: 6 },
      "77": { date: "2026-07-28", twitchViewers: 0, twitchChannels: 0 },
    });
  });

  it("writes and reads history atomically", () => {
    const root = temporaryRoot();
    const file = join(root, "data/history.json");
    const history: History = { "42": [{ date: "2026-07-28", twitchViewers: 130, twitchChannels: 6 }] };

    writeHistory(file, history);

    expect(readHistory(file)).toEqual(history);
    expect(existsSync(`${file}.tmp`)).toBe(false);
  });
});

describe("seven-day growth", () => {
  it("calculates growth only when the current and exact seven-days-prior snapshots exist", () => {
    const history: History = {
      "42": [
        { date: "2026-07-21", twitchViewers: 100, twitchChannels: 5 },
        { date: "2026-07-28", twitchViewers: 130, twitchChannels: 6 },
      ],
    };

    expect(growth7d(history, "42", asOf)).toBe(1.3);
    expect(growth7d(history, "missing", asOf)).toBeNull();
  });

  it("returns null for a zero baseline or a nearby-but-not-exact snapshot", () => {
    expect(growth7d({
      zero: [
        { date: "2026-07-21", twitchViewers: 0, twitchChannels: 5 },
        { date: "2026-07-28", twitchViewers: 130, twitchChannels: 6 },
      ],
      nearby: [
        { date: "2026-07-20", twitchViewers: 100, twitchChannels: 5 },
        { date: "2026-07-28", twitchViewers: 130, twitchChannels: 6 },
      ],
    }, "zero", asOf)).toBeNull();
    expect(growth7d({
      nearby: [
        { date: "2026-07-20", twitchViewers: 100, twitchChannels: 5 },
        { date: "2026-07-28", twitchViewers: 130, twitchChannels: 6 },
      ],
    }, "nearby", asOf)).toBeNull();
  });
});

describe("pipeline history ordering", () => {
  it("writes history before an emit guard failure and leaves the raw cache untouched", async () => {
    const root = temporaryRoot();
    const catalog = catalogWith(2);
    const rawCache = join(root, "data/raw/igdb/latest.json");
    mkdirSync(join(root, "data/raw/igdb"), { recursive: true });
    mkdirSync(join(root, "src/playground/game-recommendation"), { recursive: true });
    writeFileSync(join(root, "src/playground/game-recommendation/catalog.json"), `${JSON.stringify(catalog)}\n`, { encoding: "utf8", flag: "w" });
    writeFileSync(rawCache, '{"source":"igdb","complete":true}\n', { encoding: "utf8", flag: "w" });

    await expect(runPipeline({ raw: rawSources(), knowledge, rootDir: root, asOf, allowNetwork: false, logger: console })).rejects.toThrow("30%");

    expect(readHistory(join(root, "data/history.json"))["42"]).toContainEqual({ date: "2026-07-28", twitchViewers: 130, twitchChannels: 6 });
    expect(JSON.parse(readFileSync(join(root, "src/playground/game-recommendation/catalog.json"), "utf8"))).toEqual(catalog);
    expect(readFileSync(rawCache, "utf8")).toBe('{"source":"igdb","complete":true}\n');
  });

  it("injects the exact seven-day viewer multiplier into emitted games", async () => {
    const root = temporaryRoot();
    writeHistory(join(root, "data/history.json"), {
      "42": [{ date: "2026-07-21", twitchViewers: 100, twitchChannels: 5 }],
    });

    await runPipeline({ raw: rawSources(), knowledge, rootDir: root, asOf, allowNetwork: false, logger: console });

    const emitted = JSON.parse(readFileSync(join(root, "src/playground/game-recommendation/catalog.json"), "utf8")) as CatalogRecord;
    expect(emitted.games[0].buzz.viewerGrowth7d).toBe(1.3);
  });
});
