import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { CatalogRecord, RawSources, SteamFetchInput } from "./model";
import { fixtureSources, runCommand, validateOutput } from "./index";
import { RECOMMENDATIONS_PATH } from "./recommendations";
import { runPipeline } from "./run";
import { fetchTwitch } from "./sources/twitch";
import { readEmittedCatalog } from "./test-helpers";

const execute = promisify(execFile);
const roots: string[] = [];
const asOf = "2026-07-28T12:00:00.000Z";

afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

function root(): string {
  const value = mkdtempSync(join(tmpdir(), "catalog-run-"));
  roots.push(value);
  cpSync(resolve("data/knowledge"), join(value, "data/knowledge"), { recursive: true });
  cpSync(resolve("data/raw/fixtures"), join(value, "data/raw/fixtures"), { recursive: true });
  mkdirSync(join(value, "src/playground/game-recommendation"), { recursive: true });
  return value;
}

function sources(staleSources: string[] = []): RawSources {
  return {
    igdb: {
      fetchedAt: asOf,
      source: "igdb",
      request: { test: true },
      responses: [{ id: 42 }],
      warnings: [],
      games: [
        { id: 42, name: "Fixture Game", first_release_date: 1_784_505_600, genres: [{ name: "Puzzle" }, { name: "Shooter" }, { name: "Music" }], themes: [{ name: "Party" }, { name: "Horror" }] },
        { id: 99, name: "Spectacle Fixture", first_release_date: 1_784_505_600, genres: [{ name: "Role-playing (RPG)" }], themes: [] },
      ],
      externalGames: [],
      unresolvedSteamAppIds: [],
    },
    twitch: {
      fetchedAt: asOf,
      source: "twitch",
      request: { test: true },
      responses: [{ id: "42" }],
      warnings: [],
      topGames: [{ categoryId: "42", igdbId: "42", name: "Fixture Game" }],
      streams: [{ categoryId: "42", igdbId: "42", viewers: 130, channels: 6 }],
      truncated: false,
    },
    steam: {
      fetchedAt: asOf,
      source: "steam",
      request: { test: true },
      responses: [],
      warnings: [],
      topSellerAppIds: [],
      apps: [],
      staleSources,
    },
    chzzk: {
      fetchedAt: asOf,
      source: "chzzk",
      request: { test: true },
      responses: [],
      warnings: [],
      categories: [],
      truncated: false,
    },
  };
}

function adapters(raw: RawSources, failures: Partial<Record<keyof RawSources, Error>> = {}) {
  return {
    twitch: async () => {
      if (failures.twitch) throw failures.twitch;
      return raw.twitch;
    },
    steam: async () => {
      if (failures.steam) throw failures.steam;
      return raw.steam;
    },
    igdb: async () => {
      if (failures.igdb) throw failures.igdb;
      return raw.igdb;
    },
    chzzk: async () => {
      if (failures.chzzk) throw failures.chzzk;
      return raw.chzzk;
    },
  };
}

function catalog(count: number): CatalogRecord {
  return {
    generatedAt: asOf,
    games: Array.from({ length: count }, (_, index) => ({
      id: `previous-${index}`,
      name: `Previous ${index}`,
      releaseDate: "2026-07-20T00:00:00.000Z",
      players: { max: "unknown", source: "unknown", online: false, localCoop: false },
      sessionShape: "run",
      genres: [],
      themes: [],
      viewerPlayable: { ok: false },
      vibes: { healing: 0.5, variety: 0.5, horror: 0.5, hardcore: 0.5, chatting: 0.5, spectacle: 0.5 },
      buzz: { twitchViewers: 0, twitchChannels: 0, viewerGrowth7d: null, isNewRelease: true, demandShare: 0, demandSources: { chzzk: false, twitch: true }, sourceStatus: { chzzk: "fresh", twitch: "fresh" } },
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
        asOf,
      },
      quality: {},
      topTags: [],
    })),
  };
}

const logger = { info: () => undefined, warn: () => undefined, error: () => undefined };

describe("live pipeline orchestration", () => {
  it("emits a fresh Chzzk snapshot and combines its mapped demand with Twitch", async () => {
    const destination = root();
    const base = sources();
    const raw = {
      ...base,
      igdb: {
        ...base.igdb,
        games: [
          { id: 42, name: "Fixture Game", first_release_date: 1_784_505_600, genres: [{ name: "Puzzle" }, { name: "Shooter" }], themes: [{ name: "Horror" }, { name: "Comedy" }] },
          { id: 43, name: "Second Fixture Game", first_release_date: 1_784_505_600, genres: [{ name: "Adventure" }], themes: [{ name: "Fantasy" }] },
        ],
      },
      twitch: {
        ...base.twitch,
        topGames: [
          { categoryId: "42", igdbId: "42", name: "Fixture Game" },
          { categoryId: "43", igdbId: "43", name: "Second Fixture Game" },
        ],
        streams: [
          { categoryId: "42", igdbId: "42", viewers: 40, channels: 2, coverage: 1 },
          { categoryId: "43", igdbId: "43", viewers: 60, channels: 3, coverage: 1 },
        ],
      },
      chzzk: {
        ...base.chzzk,
        categories: [
          { categoryId: "fixture", name: "Fixture Game", viewers: 80, channels: 2, coverage: 1 },
          { categoryId: "second", name: "Second Fixture Game", viewers: 20, channels: 1, coverage: 1 },
        ],
      },
    };

    await runPipeline({
      rootDir: destination,
      asOf,
      allowNetwork: true,
      logger,
      adapters: adapters(raw),
      config: { twitchClientId: "client", twitchClientSecret: "secret", twitchTopGameLimit: 1, twitchStreamPageLimit: 1, igdbRecentDays: 60, chzzkClientId: "chzzk-client", chzzkClientSecret: "chzzk-secret", chzzkPageLimit: 1, chzzkRetryLimit: 1 },
    });

    expect(JSON.parse(readFileSync(join(destination, "data/raw/chzzk/latest.json"), "utf8"))).toMatchObject(raw.chzzk);
    expect(readEmittedCatalog(destination).games.map((game) => ({ id: game.id, demandShare: game.buzz.demandShare }))).toEqual([
      { id: "42", demandShare: 0.64 },
      { id: "43", demandShare: 0.36 },
    ]);
  });

  it("continues with Twitch-only demand and a stale Chzzk marker when credentials are absent", async () => {
    const destination = root();
    const raw = sources();
    let chzzkCalled = false;

    const result = await runPipeline({
      rootDir: destination,
      asOf,
      allowNetwork: true,
      logger,
      adapters: { ...adapters(raw), chzzk: async () => { chzzkCalled = true; return raw.chzzk; } },
      config: { twitchClientId: "client", twitchClientSecret: "secret", twitchTopGameLimit: 1, twitchStreamPageLimit: 1, igdbRecentDays: 60, chzzkPageLimit: 1, chzzkRetryLimit: 1 },
    });

    expect(chzzkCalled).toBe(false);
    expect(result.staleSources).toContain("chzzk");
    expect(readEmittedCatalog(destination).games[0].buzz.demandShare).toBe(1);
    expect(readEmittedCatalog(destination).games[0].buzz).toMatchObject({
      sourceStatus: { chzzk: "disabled" },
      demandSources: { chzzk: false, twitch: true },
    });
  });

  it("uses an empty fresh Chzzk snapshot when its adapter rejects", async () => {
    const destination = root();
    const raw = sources();
    mkdirSync(join(destination, "data/raw/chzzk"), { recursive: true });
    writeFileSync(join(destination, "data/raw/chzzk/latest.json"), `${JSON.stringify({ ...raw.chzzk, categories: [{ categoryId: "stale", name: "Fixture Game", viewers: 999, channels: 9, coverage: 1 }] })}\n`);

    const result = await runPipeline({
      rootDir: destination,
      asOf,
      allowNetwork: true,
      logger,
      adapters: adapters(raw, { chzzk: new Error("offline") }),
      config: { twitchClientId: "client", twitchClientSecret: "secret", twitchTopGameLimit: 1, twitchStreamPageLimit: 1, igdbRecentDays: 60, chzzkClientId: "chzzk-client", chzzkClientSecret: "chzzk-secret", chzzkPageLimit: 1, chzzkRetryLimit: 1 },
    });

    expect(result.staleSources).toContain("chzzk");
    expect(readEmittedCatalog(destination).games[0].buzz.demandShare).toBe(1);
    expect(readEmittedCatalog(destination).games[0].buzz).toMatchObject({
      sourceStatus: { chzzk: "failed" },
      demandSources: { chzzk: false, twitch: true },
    });
    expect(JSON.parse(readFileSync(join(destination, "data/raw/chzzk/latest.json"), "utf8")).categories).toHaveLength(1);
  });

  it("reports a fresh Chzzk source separately from its zero-demand availability", async () => {
    const destination = root();
    const raw = sources();

    await runPipeline({
      rootDir: destination,
      asOf,
      allowNetwork: true,
      logger,
      adapters: adapters(raw),
      config: { twitchClientId: "client", twitchClientSecret: "secret", twitchTopGameLimit: 1, twitchStreamPageLimit: 1, igdbRecentDays: 60, chzzkClientId: "chzzk-client", chzzkClientSecret: "chzzk-secret", chzzkPageLimit: 1, chzzkRetryLimit: 2 },
    });

    expect(readEmittedCatalog(destination).games[0].buzz).toMatchObject({
      sourceStatus: { chzzk: "fresh" },
      demandSources: { chzzk: false, twitch: true },
    });
  });

  it("emits zero rather than NaN demand when neither platform has observed viewers", async () => {
    const destination = root();
    const base = sources();
    const raw = { ...base, twitch: { ...base.twitch, streams: [{ categoryId: "42", igdbId: "42", viewers: 0, channels: 0, coverage: 0 }] } };

    await runPipeline({
      rootDir: destination,
      asOf,
      allowNetwork: true,
      logger,
      adapters: adapters(raw),
      config: { twitchClientId: "client", twitchClientSecret: "secret", twitchTopGameLimit: 1, twitchStreamPageLimit: 1, igdbRecentDays: 60, chzzkClientId: "chzzk-client", chzzkClientSecret: "chzzk-secret", chzzkPageLimit: 1, chzzkRetryLimit: 2 },
    });

    const demandShare = readEmittedCatalog(destination).games[0].buzz.demandShare;
    expect(demandShare).toBe(0);
    expect(Number.isFinite(demandShare)).toBe(true);
  });

  it("passes the configured Chzzk retry limit to its adapter", async () => {
    const destination = root();
    const raw = sources();
    let retryLimit: number | undefined;

    await runPipeline({
      rootDir: destination,
      asOf,
      allowNetwork: true,
      logger,
      adapters: { ...adapters(raw), chzzk: async (input) => { retryLimit = input.retryLimit; return raw.chzzk; } },
      config: { twitchClientId: "client", twitchClientSecret: "secret", twitchTopGameLimit: 1, twitchStreamPageLimit: 1, igdbRecentDays: 60, chzzkClientId: "chzzk-client", chzzkClientSecret: "chzzk-secret", chzzkPageLimit: 1, chzzkRetryLimit: 2 },
    });

    expect(retryLimit).toBe(2);
  });

  it("runs a second Steam pass for an IGDB source-one mapping and emits its details", async () => {
    const destination = root();
    const base = sources();
    const steamInputs: SteamFetchInput[] = [];
    const initialSteam = {
      ...base.steam,
      responses: [{ top_sellers: { items: [{ id: 570 }] } }],
      topSellerAppIds: [570],
      apps: [{ appId: 570, tags: {}, positive: 1, negative: 0, owners: "", price: "0", discount: "0" }],
    };
    const detailSteam = {
      ...base.steam,
      responses: [{ appid: 730 }],
      topSellerAppIds: [570],
      apps: [{ appId: 730, tags: { Strategy: 100 }, positive: 90, negative: 10, owners: "", price: "0", discount: "0", categories: ["Multi-player"] }],
    };
    const twitch = {
      ...base.twitch,
      topGames: [
        ...base.twitch.topGames,
        { categoryId: "99", igdbId: "99", name: "Spectacle Fixture" },
      ],
      streams: [
        ...base.twitch.streams,
        { categoryId: "99", igdbId: "99", viewers: 0, channels: 0 },
      ],
    };
    const igdb = {
      ...base.igdb,
      games: [
        { id: 42, name: "Mapped Twitch Game", first_release_date: 1_784_505_600, genres: [{ name: "Puzzle" }, { name: "Shooter" }, { name: "Role-playing (RPG)" }], themes: [{ name: "Comedy" }, { name: "Horror" }] },
        { id: 99, name: "Spectacle Fixture", first_release_date: 1_784_505_600, genres: [{ name: "Role-playing (RPG)" }], themes: [] },
      ],
      externalGames: [{ game: 42, uid: "730", external_game_source: 1 }],
    };

    const result = await runPipeline({
      rootDir: destination,
      asOf,
      allowNetwork: true,
      logger,
      adapters: {
        twitch: async () => twitch,
        igdb: async () => igdb,
        steam: async (input) => {
          steamInputs.push(input);
          return steamInputs.length === 1 ? initialSteam : detailSteam;
        },
        chzzk: async () => base.chzzk,
      },
      config: { twitchClientId: "client", twitchClientSecret: "secret", twitchTopGameLimit: 1, twitchStreamPageLimit: 1, igdbRecentDays: 60, chzzkPageLimit: 1, chzzkRetryLimit: 1 },
    });

    expect(result).toMatchObject({ catalogUpdated: true, fetchedSources: ["twitch", "steam", "igdb"], staleSources: ["chzzk"] });
    expect(steamInputs).toEqual([
      expect.objectContaining({ steamAppIds: [] }),
      expect.objectContaining({ steamAppIds: [730], includeTopSellers: false }),
    ]);
    const emitted = readEmittedCatalog(destination);
    expect(emitted.games[0]).toMatchObject({
      steamAppId: 730,
      rating: 90,
      reviewCount: 100,
      streaming: {
        totalViewers: 130,
        channelCount: 6,
        medianViewersPerChannel: null,
        p75ViewersPerChannel: null,
        top10ViewerShare: null,
        viewerConcentration: null,
        growth7d: null,
        growth30d: null,
        growth90d: null,
        volatility30d: null,
        observedSnapshots: 1,
        coverage: 0,
        asOf,
      },
      quality: {
        steamPositive: 90,
        steamNegative: 10,
      },
      topTags: [{ tag: "Strategy", share: 1 }],
    });
    expect(emitted.games[0].quality).not.toHaveProperty("totalRating");
    expect(emitted.games[0].quality).not.toHaveProperty("totalRatingCount");
  });

  it("emits a catalog when one SteamSpy app uses its existing stale cache", async () => {
    const destination = root();

    const result = await runPipeline({
      rootDir: destination,
      asOf,
      allowNetwork: true,
      logger,
      adapters: adapters(sources(["steamspy:730"])),
      config: { twitchClientId: "client", twitchClientSecret: "secret", twitchTopGameLimit: 1, twitchStreamPageLimit: 1, igdbRecentDays: 60, chzzkPageLimit: 1, chzzkRetryLimit: 1 },
    });

    expect(result).toMatchObject({ catalogUpdated: true, historyUpdated: true, fetchedSources: ["twitch", "steam", "igdb"], staleSources: ["chzzk", "steamspy:730"] });
    expect(existsSync(join(destination, "src/playground/game-recommendation/catalog.json"))).toBe(true);
  });

  it("does not emit when IGDB has neither a live result nor a latest raw cache", async () => {
    const destination = root();
    const previous = catalog(1);
    writeFileSync(join(destination, "src/playground/game-recommendation/catalog.json"), `${JSON.stringify(previous)}\n`);

    await expect(runPipeline({
      rootDir: destination,
      asOf,
      allowNetwork: true,
      logger,
      adapters: adapters(sources(), { igdb: new Error("https://api.igdb.com/v4/games?token=secret") }),
      config: { twitchClientId: "client", twitchClientSecret: "secret", twitchTopGameLimit: 1, twitchStreamPageLimit: 1, igdbRecentDays: 60, chzzkPageLimit: 1, chzzkRetryLimit: 1 },
    })).rejects.toThrow("IGDB source failed and no latest raw cache is available");

    expect(JSON.parse(readFileSync(join(destination, "src/playground/game-recommendation/catalog.json"), "utf8"))).toEqual(previous);
  });

  it("uses a whole-source IGDB cache as stale data without claiming it was freshly fetched", async () => {
    const destination = root();
    mkdirSync(join(destination, "data/raw/igdb"), { recursive: true });
    writeFileSync(join(destination, "data/raw/igdb/latest.json"), `${JSON.stringify(sources().igdb)}\n`);

    const result = await runPipeline({
      rootDir: destination,
      asOf,
      allowNetwork: true,
      logger,
      adapters: adapters(sources(), { igdb: new Error("offline") }),
      config: { twitchClientId: "client", twitchClientSecret: "secret", twitchTopGameLimit: 1, twitchStreamPageLimit: 1, igdbRecentDays: 60, chzzkPageLimit: 1, chzzkRetryLimit: 1 },
    });

    expect(result).toMatchObject({ fetchedSources: ["twitch", "steam"], staleSources: ["igdb", "chzzk"], catalogUpdated: true });
  });

  it("keeps raw and history writes when the catalog decline guard rejects the emit", async () => {
    const destination = root();
    const previous = catalog(3);
    writeFileSync(join(destination, "src/playground/game-recommendation/catalog.json"), `${JSON.stringify(previous)}\n`);

    await expect(runPipeline({
      rootDir: destination,
      asOf,
      allowNetwork: true,
      logger,
      adapters: adapters(sources()),
      config: { twitchClientId: "client", twitchClientSecret: "secret", twitchTopGameLimit: 1, twitchStreamPageLimit: 1, igdbRecentDays: 60, chzzkPageLimit: 1, chzzkRetryLimit: 1 },
    })).rejects.toThrow("30%");

    expect(existsSync(join(destination, "data/raw/igdb/latest.json"))).toBe(true);
    expect(JSON.parse(readFileSync(join(destination, "data/history.json"), "utf8"))["42"]).toContainEqual({ date: "2026-07-28", twitchViewers: 130, twitchChannels: 6 });
    expect(JSON.parse(readFileSync(join(destination, "src/playground/game-recommendation/catalog.json"), "utf8"))).toEqual(previous);
  });

  it("writes fresh catalog and history on a successful live run without logging credentials", async () => {
    const destination = root();
    const messages: string[] = [];

    const result = await runPipeline({
      rootDir: destination,
      asOf,
      allowNetwork: true,
      logger: { info: (message: unknown) => messages.push(String(message)), warn: (message: unknown) => messages.push(String(message)), error: (message: unknown) => messages.push(String(message)) },
      adapters: adapters(sources()),
      config: { twitchClientId: "client-id", twitchClientSecret: "top-secret", twitchTopGameLimit: 1, twitchStreamPageLimit: 1, igdbRecentDays: 60, chzzkPageLimit: 1, chzzkRetryLimit: 1 },
    });

    expect(result).toMatchObject({ generatedAt: asOf, gameCount: 2, catalogUpdated: true, historyUpdated: true, staleSources: ["chzzk"] });
    expect(existsSync(join(destination, "src/playground/game-recommendation/catalog.json"))).toBe(true);
    expect(existsSync(join(destination, "data/history.json"))).toBe(true);
    expect(messages.join("\n")).not.toContain("top-secret");
  });

  it("keeps completed historical IGDB backfill games in the daily catalog", async () => {
    const destination = root();
    const historical = {
      fetchedAt: asOf,
      source: "igdb",
      request: { partitionStart: "1990-01-01", partitionEnd: "1991-01-01" },
      responses: [],
      warnings: [],
      games: [{ id: 99, name: "Historical Fixture Game", first_release_date: 631152000, genres: [{ name: "Strategy" }], themes: [{ name: "Thriller" }] }],
      externalGames: [],
      unresolvedSteamAppIds: [],
    };
    mkdirSync(join(destination, "data/raw/igdb/backfill"), { recursive: true });
    writeFileSync(join(destination, "data/raw/igdb/backfill/1990-01-01_1991-01-01.json"), `${JSON.stringify(historical)}\n`);

    const result = await runPipeline({
      rootDir: destination,
      asOf,
      allowNetwork: true,
      logger,
      adapters: adapters(sources()),
      config: { twitchClientId: "client", twitchClientSecret: "secret", twitchTopGameLimit: 1, twitchStreamPageLimit: 1, igdbRecentDays: 60, chzzkPageLimit: 1, chzzkRetryLimit: 1 },
    });

    expect(result).toMatchObject({ gameCount: 2, catalogUpdated: true });
    expect(readEmittedCatalog(destination).games.map((game) => game.id)).toEqual(["42", "99"]);
  });

  it("retains successful early pages as partial raw without replacing latest or manufacturing stale Twitch growth", async () => {
    const destination = root();
    const complete = sources().twitch;
    mkdirSync(join(destination, "data/raw/twitch"), { recursive: true });
    writeFileSync(join(destination, "data/raw/twitch/latest.json"), `${JSON.stringify(complete)}\n`);
    const existingHistory = {
      "42": [
        { date: "2026-07-21", twitchViewers: 65, twitchChannels: 3 },
        { date: "2026-07-28", twitchViewers: 260, twitchChannels: 12 },
      ],
    };
    mkdirSync(join(destination, "data"), { recursive: true });
    writeFileSync(join(destination, "data/history.json"), `${JSON.stringify(existingHistory)}\n`);
    const raw = sources();
    let streamPage = 0;
    const fetcher = vi.fn(async (url: string) => {
      if (url === "https://id.twitch.tv/oauth2/token") {
        return new Response(JSON.stringify({ access_token: "oauth-must-not-persist" }), { status: 200 });
      }
      if (url.startsWith("https://api.twitch.tv/helix/games/top")) {
        return new Response(JSON.stringify({
          data: [{ id: "42", name: "Fixture Game", igdb_id: "42" }],
          pagination: {},
        }), { status: 200 });
      }
      if (url.startsWith("https://api.twitch.tv/helix/games?")) {
        return new Response(JSON.stringify({
          data: [{ id: "42", name: "Fixture Game", igdb_id: "42" }],
        }), { status: 200 });
      }
      if (url.startsWith("https://api.twitch.tv/helix/streams?")) {
        streamPage += 1;
        if (streamPage === 1) {
          return new Response(JSON.stringify({
            data: [{ user_id: "streamer", viewer_count: 130 }],
            pagination: { cursor: "late-page" },
          }), { status: 200 });
        }
        return new Response("late Twitch page failed", { status: 400 });
      }
      throw new Error(`unexpected URL ${url}`);
    });
    const failingAdapters = { ...adapters(raw), twitch: fetchTwitch };

    const result = await runPipeline({
      rootDir: destination,
      asOf,
      allowNetwork: true,
      logger,
      adapters: failingAdapters,
      fetcher: fetcher as typeof fetch,
      config: {
        twitchClientId: "client-id",
        twitchClientSecret: "top-secret",
        twitchTopGameLimit: 1,
        twitchStreamPageLimit: 2,
        igdbRecentDays: 60, chzzkPageLimit: 1, chzzkRetryLimit: 1,
      },
    });

    expect(result).toMatchObject({
      fetchedSources: ["steam", "igdb"],
      staleSources: ["twitch", "chzzk"],
      historyUpdated: false,
    });
    expect(JSON.parse(readFileSync(join(destination, "data/history.json"), "utf8"))).toEqual(existingHistory);
    const emitted = readEmittedCatalog(destination);
    expect(emitted.games[0].buzz.viewerGrowth7d).toBe(4);
    expect(emitted.games[0].streaming).toMatchObject({
      growth7d: 4,
      growth30d: 4,
      growth90d: 4,
      volatility30d: null,
      observedSnapshots: 2,
    });
    expect(JSON.parse(readFileSync(join(destination, "data/raw/twitch/latest.json"), "utf8"))).toEqual(complete);

    const partialDirectory = join(destination, "data/raw/twitch/partial");
    const partialFiles = readdirSync(partialDirectory);
    expect(partialFiles).toHaveLength(1);
    const partialText = readFileSync(join(partialDirectory, partialFiles[0]), "utf8");
    const partial = JSON.parse(partialText);
    expect(partial).toMatchObject({
      source: "twitch",
      complete: false,
      responses: [
        {
          data: [{ id: "42", name: "Fixture Game", igdb_id: "42" }],
          pagination: {},
        },
        {
          data: [{ id: "42", name: "Fixture Game", igdb_id: "42" }],
        },
        {
          data: [{ user_id: "streamer", viewer_count: 130 }],
          pagination: { cursor: "late-page" },
        },
      ],
    });
    expect(partialText).not.toContain("top-secret");
    expect(partialText).not.toContain("Bearer");
    expect(partialText).not.toContain("oauth-must-not-persist");
  });
});

describe("pipeline CLI commands", () => {
  it("keeps Twitch box art when constructing raw fixture sources", () => {
    const raw = fixtureSources(resolve("."), asOf);

    expect(raw.twitch.topGames[0].boxArtUrl).toBe("https://static-cdn.jtvnw.net/ttv-boxart/Fixture-{width}x{height}.jpg");
  });

  it("runs fixture mode in-process without invoking the injected network fetcher", async () => {
    const destination = root();
    const fetcher = vi.fn(async () => {
      throw new Error("fixture mode attempted network access");
    });

    await runCommand("fixture", {
      rootDir: destination,
      env: { PIPELINE_AS_OF: asOf },
      logger,
      fetcher: fetcher as typeof fetch,
    });

    expect(fetcher).not.toHaveBeenCalled();
    expect(existsSync(join(destination, "src/playground/game-recommendation/catalog.json"))).toBe(true);
    const catalogText = readFileSync(join(destination, "src/playground/game-recommendation/catalog.json"), "utf8");
    const emitted = readEmittedCatalog(destination);
    const rated = emitted.games.find((game) => game.id === "77");
    const unrated = emitted.games.find((game) => game.id === "88");

    expect(rated).toMatchObject({
      quality: {
        igdbRating: 81,
        igdbRatingCount: 18,
        criticRating: 87,
        criticRatingCount: 12,
        totalRating: 77.0909090909091,
        totalRatingCount: 30,
      },
      rating: 81,
      reviewCount: 18,
    });
    expect(unrated).toMatchObject({
      quality: {
        steamPositive: 2000,
        steamNegative: 100,
      },
      rating: 95.23809523809523,
      reviewCount: 2100,
    });
    expect(catalogText).not.toContain("\"responses\"");
    expect(catalogText).not.toContain("\"request\"");
  });

  it("rejects a recommendation index emitted for a different catalog", async () => {
    const destination = root();
    await runCommand("fixture", { rootDir: destination, env: { PIPELINE_AS_OF: asOf }, logger });
    const path = join(destination, RECOMMENDATIONS_PATH);
    const index = JSON.parse(readFileSync(path, "utf8"));
    index.generatedAt = "2026-07-27T00:00:00.000Z";
    writeFileSync(path, JSON.stringify(index));

    expect(() => validateOutput(destination)).toThrow("generatedAt");
  });

  it("rejects a recommendation index whose game count differs from the catalog", async () => {
    const destination = root();
    await runCommand("fixture", { rootDir: destination, env: { PIPELINE_AS_OF: asOf }, logger });
    const path = join(destination, RECOMMENDATIONS_PATH);
    const index = JSON.parse(readFileSync(path, "utf8"));
    index.gameCount += 1;
    writeFileSync(path, JSON.stringify(index));

    expect(() => validateOutput(destination)).toThrow("gameCount");
  });

  it("rejects a recommendation index that names a game outside the catalog", async () => {
    const destination = root();
    await runCommand("fixture", { rootDir: destination, env: { PIPELINE_AS_OF: asOf }, logger });
    const path = join(destination, RECOMMENDATIONS_PATH);
    const index = JSON.parse(readFileSync(path, "utf8"));
    const pick = Object.values(index.recommendations).flatMap((recommendation: any) => recommendation.picks)[0];
    expect(pick).toBeDefined();
    pick.game.id = "outside-the-catalog";
    writeFileSync(path, JSON.stringify(index));

    expect(() => validateOutput(destination)).toThrow("outside catalog");
  });

  it("runs backfill mode in-process with explicit start and end boundaries", async () => {
    const destination = root();
    const messages: string[] = [];
    const fetcher = vi.fn(async (url: string) => {
      if (url === "https://id.twitch.tv/oauth2/token") return new Response(JSON.stringify({ access_token: "fixture-token" }), { status: 200 });
      if (url === "https://api.igdb.com/v4/games") return new Response(JSON.stringify([]), { status: 200 });
      throw new Error(`unexpected URL ${url}`);
    });

    await runCommand("backfill", {
      rootDir: destination,
      env: { PIPELINE_AS_OF: asOf, TWITCH_CLIENT_ID: "client-id", TWITCH_CLIENT_SECRET: "top-secret" },
      logger: { info: (message: unknown) => messages.push(String(message)), warn: () => undefined, error: () => undefined },
      fetcher: fetcher as typeof fetch,
    }, ["--start", "1990-01-01", "--end", "1991-01-01"]);

    const calls = fetcher.mock.calls as Array<[unknown, RequestInit?]>;

    expect(calls.map(([url, init]) => ({
      url: String(url),
      body: String(init?.body ?? ""),
    }))).toEqual(expect.arrayContaining([
      expect.objectContaining({ url: "https://id.twitch.tv/oauth2/token" }),
      expect.objectContaining({
        url: "https://api.igdb.com/v4/games",
        body: expect.stringContaining("where first_release_date >= 631152000 & first_release_date < 662688000"),
      }),
    ]));
    expect(messages).toContain('IGDB backfill result: {"completedPartitions":["1990-01-01/1991-01-01"],"fetchedGameCount":0,"remainingPartitions":[]}');
    expect(readFileSync(join(destination, "data/checkpoints/igdb.json"), "utf8")).not.toContain("top-secret");
  });

  it("rejects backfill mode when a required boundary is missing", async () => {
    await expect(runCommand("backfill", {
      rootDir: root(),
      env: { PIPELINE_AS_OF: asOf, TWITCH_CLIENT_ID: "client-id", TWITCH_CLIENT_SECRET: "top-secret" },
      logger,
      fetcher: vi.fn() as typeof fetch,
    }, ["--start", "1990-01-01"])).rejects.toThrow("backfill requires --start YYYY-MM-DD and --end YYYY-MM-DD");
  });

  it("rejects backfill mode when start is not before end", async () => {
    await expect(runCommand("backfill", {
      rootDir: root(),
      env: { PIPELINE_AS_OF: asOf, TWITCH_CLIENT_ID: "client-id", TWITCH_CLIENT_SECRET: "top-secret" },
      logger,
      fetcher: vi.fn() as typeof fetch,
    }, ["--start", "1991-01-01", "--end", "1990-01-01"])).rejects.toThrow("--start must be before --end: 1991-01-01 >= 1990-01-01");
  });

  it("exposes the backfill package script", () => {
    const pkg = JSON.parse(readFileSync(resolve("package.json"), "utf8")) as { scripts?: Record<string, string> };

    expect(pkg.scripts?.["pipeline:backfill"]).toBe("tsx scripts/pipeline/index.ts backfill");
  });

  it("keeps run, fixture, and validate distinct", async () => {
    const destination = root();
    const tsx = resolve("node_modules/.bin/tsx");
    const entry = resolve("scripts/pipeline/index.ts");

    await expect(execute(tsx, [entry, "run"], { cwd: destination })).rejects.toMatchObject({ stderr: expect.stringContaining("TWITCH_CLIENT_ID") });
    await expect(execute(tsx, [entry, "fixture"], { cwd: destination })).resolves.toMatchObject({ stdout: expect.stringContaining("catalog fixture emitted") });
    await expect(execute(tsx, [entry, "validate"], { cwd: destination })).resolves.toMatchObject({ stdout: expect.stringContaining("catalog valid") });
  });

  it("returns nonzero when data/history.json is invalid JSON", async () => {
    const destination = root();
    const tsx = resolve("node_modules/.bin/tsx");
    const entry = resolve("scripts/pipeline/index.ts");
    await execute(tsx, [entry, "fixture"], { cwd: destination });
    writeFileSync(join(destination, "data/history.json"), '{"42":');

    await expect(execute(tsx, [entry, "validate"], { cwd: destination })).rejects.toMatchObject({ stderr: expect.stringContaining("Unexpected end of JSON input") });
  });

  it("returns nonzero with a path for each malformed history structure", async () => {
    const destination = root();
    const tsx = resolve("node_modules/.bin/tsx");
    const entry = resolve("scripts/pipeline/index.ts");
    await execute(tsx, [entry, "fixture"], { cwd: destination });
    const cases = [
      { value: null, path: "data/history.json" },
      { value: { "not-a-game-id": [] }, path: 'data/history.json["not-a-game-id"]' },
      { value: { "42": {} }, path: 'data/history.json["42"]' },
      { value: { "42": [{ date: "2026-02-30", twitchViewers: 1, twitchChannels: 1 }] }, path: 'data/history.json["42"][0].date' },
      { value: { "42": [{ date: "2026-07-28", twitchViewers: -1, twitchChannels: 1 }] }, path: 'data/history.json["42"][0].twitchViewers' },
      { value: { "42": [{ date: "2026-07-28", twitchViewers: 1, twitchChannels: Number.NaN }] }, path: 'data/history.json["42"][0].twitchChannels' },
    ];

    for (const { value, path } of cases) {
      writeFileSync(join(destination, "data/history.json"), JSON.stringify(value));
      await expect(execute(tsx, [entry, "validate"], { cwd: destination })).rejects.toMatchObject({ stderr: expect.stringContaining(path) });
    }
  });
});
