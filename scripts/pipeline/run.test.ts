import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { CatalogRecord, RawSources, SteamFetchInput } from "./model";
import { fixtureSources, runCommand } from "./index";
import { runPipeline } from "./run";
import { fetchTwitch } from "./sources/twitch";

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
      games: [{ id: 42, name: "Fixture Game", first_release_date: 1_784_505_600 }],
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
      viewerPlayable: { ok: false },
      vibes: { healing: 0.5, variety: 0.5, horror: 0.5, hardcore: 0.5, chatting: 0.5, spectacle: 0.5 },
      buzz: { twitchViewers: 0, twitchChannels: 0, viewerGrowth7d: null, isNewRelease: true },
      topTags: [],
    })),
  };
}

const logger = { info: () => undefined, warn: () => undefined, error: () => undefined };

describe("live pipeline orchestration", () => {
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
    const igdb = {
      ...base.igdb,
      games: [{ id: 42, name: "Mapped Twitch Game", first_release_date: 1_784_505_600 }],
      externalGames: [{ game: 42, uid: "730", external_game_source: 1 }],
    };

    const result = await runPipeline({
      rootDir: destination,
      asOf,
      allowNetwork: true,
      logger,
      adapters: {
        twitch: async () => base.twitch,
        igdb: async () => igdb,
        steam: async (input) => {
          steamInputs.push(input);
          return steamInputs.length === 1 ? initialSteam : detailSteam;
        },
      },
      config: { twitchClientId: "client", twitchClientSecret: "secret", twitchTopGameLimit: 1, twitchStreamPageLimit: 1, igdbRecentDays: 60 },
    });

    expect(result).toMatchObject({ catalogUpdated: true, fetchedSources: ["twitch", "steam", "igdb"], staleSources: [] });
    expect(steamInputs).toEqual([
      expect.objectContaining({ steamAppIds: [] }),
      expect.objectContaining({ steamAppIds: [730], includeTopSellers: false }),
    ]);
    const emitted = JSON.parse(readFileSync(join(destination, "src/playground/game-recommendation/catalog.json"), "utf8")) as CatalogRecord;
    expect(emitted.games[0]).toMatchObject({
      steamAppId: 730,
      rating: 90,
      reviewCount: 100,
      topTags: [{ tag: "Strategy", share: 1 }],
    });
  });

  it("emits a catalog when one SteamSpy app uses its existing stale cache", async () => {
    const destination = root();

    const result = await runPipeline({
      rootDir: destination,
      asOf,
      allowNetwork: true,
      logger,
      adapters: adapters(sources(["steamspy:730"])),
      config: { twitchClientId: "client", twitchClientSecret: "secret", twitchTopGameLimit: 1, twitchStreamPageLimit: 1, igdbRecentDays: 60 },
    });

    expect(result).toMatchObject({ catalogUpdated: true, historyUpdated: true, fetchedSources: ["twitch", "steam", "igdb"], staleSources: ["steamspy:730"] });
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
      config: { twitchClientId: "client", twitchClientSecret: "secret", twitchTopGameLimit: 1, twitchStreamPageLimit: 1, igdbRecentDays: 60 },
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
      config: { twitchClientId: "client", twitchClientSecret: "secret", twitchTopGameLimit: 1, twitchStreamPageLimit: 1, igdbRecentDays: 60 },
    });

    expect(result).toMatchObject({ fetchedSources: ["twitch", "steam"], staleSources: ["igdb"], catalogUpdated: true });
  });

  it("keeps raw and history writes when the catalog decline guard rejects the emit", async () => {
    const destination = root();
    const previous = catalog(2);
    writeFileSync(join(destination, "src/playground/game-recommendation/catalog.json"), `${JSON.stringify(previous)}\n`);

    await expect(runPipeline({
      rootDir: destination,
      asOf,
      allowNetwork: true,
      logger,
      adapters: adapters(sources()),
      config: { twitchClientId: "client", twitchClientSecret: "secret", twitchTopGameLimit: 1, twitchStreamPageLimit: 1, igdbRecentDays: 60 },
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
      config: { twitchClientId: "client-id", twitchClientSecret: "top-secret", twitchTopGameLimit: 1, twitchStreamPageLimit: 1, igdbRecentDays: 60 },
    });

    expect(result).toMatchObject({ generatedAt: asOf, gameCount: 1, catalogUpdated: true, historyUpdated: true, staleSources: [] });
    expect(existsSync(join(destination, "src/playground/game-recommendation/catalog.json"))).toBe(true);
    expect(existsSync(join(destination, "data/history.json"))).toBe(true);
    expect(messages.join("\n")).not.toContain("top-secret");
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
        igdbRecentDays: 60,
      },
    });

    expect(result).toMatchObject({
      fetchedSources: ["steam", "igdb"],
      staleSources: ["twitch"],
      historyUpdated: false,
    });
    expect(JSON.parse(readFileSync(join(destination, "data/history.json"), "utf8"))).toEqual(existingHistory);
    const emitted = JSON.parse(readFileSync(join(destination, "src/playground/game-recommendation/catalog.json"), "utf8")) as CatalogRecord;
    expect(emitted.games[0].buzz.viewerGrowth7d).toBeNull();
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
