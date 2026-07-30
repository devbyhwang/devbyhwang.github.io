import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { appendSnapshot, deriveStreamingFeatures, makeDailySnapshot, readHistory, writeHistory } from "./history";
import type { CatalogRecord, History, JoinedGame, KnowledgeAssets, RawSources } from "./model";
import { runPipeline } from "./run";
import { readEmittedCatalog } from "./test-helpers";

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

function joinedGame(id: number, viewers = 130, channels = 6, coverage = 1): JoinedGame {
  return {
    igdb: { id, name: `Game ${id}` },
    twitch: {
      viewers,
      channels,
      medianViewersPerChannel: channels > 0 ? viewers / channels : 0,
      p75ViewersPerChannel: channels > 0 ? viewers / channels : 0,
      top10ViewerShare: channels > 0 ? 1 : 0,
      viewerConcentration: channels > 0 ? 1 / channels : 0,
      coverage,
    },
    tags: [],
  };
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
    chzzk: {
      fetchedAt: asOf,
      source: "chzzk",
      request: {},
      responses: [],
      warnings: [],
      categories: [],
      truncated: false,
    },
  };
}

const knowledge: KnowledgeAssets = {
  tagVibes: {},
  sessionRules: { rules: [], default: "run" },
  viewerPlayable: { games: {}, tags: {} },
  chzzkAliases: [],
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
      buzz: { twitchViewers: 0, twitchChannels: 0, viewerGrowth7d: null, isNewRelease: true, demandShare: 0, demandSources: { chzzk: false, twitch: true }, sourceStatus: { chzzk: "fresh", twitch: "fresh" } },
      streaming: {
        totalViewers: 0,
        channelCount: 0,
        medianViewersPerChannel: 0,
        p75ViewersPerChannel: 0,
        top10ViewerShare: 0,
        viewerConcentration: 0,
        growth7d: null,
        growth30d: null,
        growth90d: null,
        volatility30d: null,
        observedSnapshots: 0,
        coverage: 0,
        asOf,
      },
      quality: {
        totalRating: 0,
        totalRatingCount: 0,
        steamPositive: 0,
        steamNegative: 0,
      },
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

  it("retains only the latest ninety UTC days for each game", () => {
    const history: History = {
      "42": Array.from({ length: 90 }, (_, index) => {
        const value = new Date("2026-07-01T00:00:00.000Z");
        value.setUTCDate(value.getUTCDate() + index);
        return {
          date: value.toISOString().slice(0, 10),
          twitchViewers: index + 1,
          twitchChannels: 1,
          coverage: 1,
        };
      }),
    };

    const next = appendSnapshot(history, {
      "42": { date: "2026-09-29", twitchViewers: 91, twitchChannels: 1, coverage: 1 },
    });

    expect(next["42"].map((entry) => entry.date)).toEqual(Array.from(
      { length: 90 },
      (_, index) => {
        const value = new Date("2026-07-02T00:00:00.000Z");
        value.setUTCDate(value.getUTCDate() + index);
        return value.toISOString().slice(0, 10);
      },
    ));
  });

  it("uses the UTC calendar date when making per-game snapshots", () => {
    expect(makeDailySnapshot([joinedGame(42), joinedGame(77, 0, 0)], asOf)).toEqual({
      "42": { date: "2026-07-28", twitchViewers: 130, twitchChannels: 6, coverage: 1 },
      "77": { date: "2026-07-28", twitchViewers: 0, twitchChannels: 0, coverage: 1 },
    });
  });

  it("writes and reads history atomically", () => {
    const root = temporaryRoot();
    const file = join(root, "data/history.json");
    const history: History = { "42": [{ date: "2026-07-28", twitchViewers: 130, twitchChannels: 6, coverage: 1 }] };

    writeHistory(file, history);

    expect(readHistory(file)).toEqual(history);
    expect(existsSync(`${file}.tmp`)).toBe(false);
  });
});

describe("derived streaming features", () => {
  it("uses the closest valid seven-, thirty-, and ninety-day baselines", () => {
    const history: History = {
      "42": [
        { date: "2026-04-30", twitchViewers: 80, twitchChannels: 4, coverage: 0.9 },
        { date: "2026-06-28", twitchViewers: 100, twitchChannels: 5, coverage: 0.9 },
        { date: "2026-07-10", twitchViewers: 130, twitchChannels: 6, coverage: 0.9 },
        { date: "2026-07-22", twitchViewers: 120, twitchChannels: 6, coverage: 0.9 },
        { date: "2026-07-28", twitchViewers: 150, twitchChannels: 7, coverage: 0.75 },
      ],
    };

    const features = deriveStreamingFeatures(history, "42", asOf);
    expect(features.growth7d).toBe(1.25);
    expect(features.growth30d).toBe(1.5);
    expect(features.growth90d).toBe(1.875);
    expect(features.volatility30d).toBeCloseTo(0.12, 12);
    expect(features.observedSnapshots).toBe(5);
    expect(features.confidence).toBe(0.75);
  });

  it("returns null baselines, null volatility, and zero confidence when history is unavailable", () => {
    expect(deriveStreamingFeatures({
      zero: [
        { date: "2026-07-21", twitchViewers: 0, twitchChannels: 5, coverage: 1 },
        { date: "2026-07-28", twitchViewers: 130, twitchChannels: 6, coverage: 0.5 },
      ],
      sparse: [
        { date: "2026-07-28", twitchViewers: 130, twitchChannels: 6, coverage: 0.5 },
      ],
    }, "zero", asOf)).toEqual({
      growth7d: null,
      growth30d: null,
      growth90d: null,
      volatility30d: null,
      observedSnapshots: 2,
      confidence: 0.5,
    });
    expect(deriveStreamingFeatures({
      sparse: [
        { date: "2026-07-28", twitchViewers: 130, twitchChannels: 6, coverage: 0.5 },
      ],
    }, "sparse", asOf)).toEqual({
      growth7d: null,
      growth30d: null,
      growth90d: null,
      volatility30d: null,
      observedSnapshots: 1,
      confidence: 0.5,
    });
    expect(deriveStreamingFeatures({}, "missing", asOf)).toEqual({
      growth7d: null,
      growth30d: null,
      growth90d: null,
      volatility30d: null,
      observedSnapshots: 0,
      confidence: 0,
    });
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

    expect(readHistory(join(root, "data/history.json"))["42"]).toContainEqual({
      date: "2026-07-28",
      twitchViewers: 130,
      twitchChannels: 6,
    });
    expect(JSON.parse(readFileSync(join(root, "src/playground/game-recommendation/catalog.json"), "utf8"))).toEqual(catalog);
    expect(readFileSync(rawCache, "utf8")).toBe('{"source":"igdb","complete":true}\n');
  });

  it("injects the exact seven-day viewer multiplier into emitted games", async () => {
    const root = temporaryRoot();
    writeHistory(join(root, "data/history.json"), {
      "42": [{ date: "2026-07-21", twitchViewers: 100, twitchChannels: 5 }],
    });

    await runPipeline({ raw: rawSources(), knowledge, rootDir: root, asOf, allowNetwork: false, logger: console });

    const emitted = readEmittedCatalog(root);
    expect(emitted.games[0].buzz.viewerGrowth7d).toBe(1.3);
  });
});
