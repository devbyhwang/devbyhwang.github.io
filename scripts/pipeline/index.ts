import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";
import { runBackfill } from "./backfill";
import { createNodeFileStore, readCatalog } from "./emit";
import { readHistory, validateHistory } from "./history";
import { saveRaw } from "./http";
import { loadKnowledge } from "./knowledge";
import type { IgdbExternalGame, IgdbGame, IgdbRawSnapshot, PipelineLogger, PipelineResult, RawResponseRecorder, RawSources, SourceConfig, SteamApp } from "./model";
import { runPipeline } from "./run";

const FIXTURE_AS_OF = "2026-07-28T00:00:00.000Z";

type IgdbFixture = {
  recentGames: IgdbGame[];
  topGames: IgdbGame[];
  steamMappedGames: IgdbGame[];
  externalGames: IgdbExternalGame[];
};
type TwitchFixture = {
  topPages: Array<{ data?: Array<{ id?: string; name?: string; igdb_id?: string; box_art_url?: string }> }>;
  gamesByIgdb?: { data?: Array<{ id?: string; name?: string; igdb_id?: string; box_art_url?: string }> };
  streamPages: Array<{ data?: Array<{ user_id?: string; viewer_count?: number }> }>;
};
type SteamFixtureApp = {
  appid: number;
  name?: string;
  tags?: Record<string, number>;
  positive?: number;
  negative?: number;
  owners?: string;
  price?: string;
  discount?: string;
};
type SteamFixture = { featured: { top_sellers?: { items?: Array<{ id?: number }> } }; apps: Record<string, SteamFixtureApp> };

function fixture<T>(rootDir: string, name: string): T {
  return JSON.parse(readFileSync(resolve(rootDir, "data/raw/fixtures", `${name}.json`), "utf8")) as T;
}

function steamApp(value: SteamFixtureApp): SteamApp {
  return {
    appId: value.appid,
    ...(value.name === undefined ? {} : { name: value.name }),
    tags: value.tags ?? {},
    positive: value.positive ?? 0,
    negative: value.negative ?? 0,
    owners: value.owners ?? "",
    price: value.price ?? "0",
    discount: value.discount ?? "0",
  };
}

export function fixtureSources(rootDir: string, asOf: string): RawSources {
  const igdb = fixture<IgdbFixture>(rootDir, "igdb");
  const twitch = fixture<TwitchFixture>(rootDir, "twitch");
  const steam = fixture<SteamFixture>(rootDir, "steam");
  const boxArtByIgdb = new Map((twitch.gamesByIgdb?.data ?? []).flatMap((game) => game.igdb_id && game.box_art_url
    ? [[game.igdb_id, game.box_art_url] as const]
    : []));
  const topGames = twitch.topPages.flatMap((page) => (page.data ?? []).flatMap((game) => {
    if (!game.id || !game.name || !game.igdb_id) return [];
    const boxArtUrl = game.box_art_url ?? boxArtByIgdb.get(game.igdb_id);
    return [{
      categoryId: game.id,
      name: game.name,
      igdbId: game.igdb_id,
      ...(boxArtUrl ? { boxArtUrl } : {}),
    }];
  }));
  const twitch42 = twitch.streamPages.slice(0, 2).flatMap((page) => page.data ?? []);
  const twitchViewers = twitch42.reduce((total, stream) => total + (stream.viewer_count ?? 0), 0);
  const twitchChannels = new Set(twitch42.flatMap((stream) => stream.user_id ? [stream.user_id] : [])).size;
  const apps = Object.values(steam.apps).map(steamApp);
  return {
    igdb: {
      fetchedAt: asOf,
      source: "igdb",
      request: { fixture: true },
      responses: [igdb.recentGames, igdb.topGames, igdb.steamMappedGames, igdb.externalGames],
      warnings: [],
      games: [...igdb.recentGames, ...igdb.topGames, ...igdb.steamMappedGames],
      externalGames: igdb.externalGames.filter((game) => game.external_game_source === 1),
      unresolvedSteamAppIds: [],
    },
    twitch: {
      fetchedAt: asOf,
      source: "twitch",
      request: { fixture: true },
      responses: [twitch.topPages, twitch.streamPages],
      warnings: [],
      topGames,
      streams: topGames.map((game) => game.igdbId === "42"
        ? { categoryId: game.categoryId, igdbId: game.igdbId, viewers: twitchViewers, channels: twitchChannels }
        : { categoryId: game.categoryId, igdbId: game.igdbId, viewers: 0, channels: 0 }),
      truncated: false,
    },
    steam: {
      fetchedAt: asOf,
      source: "steam",
      request: { fixture: true },
      responses: [steam.featured, ...apps],
      warnings: [],
      topSellerAppIds: (steam.featured.top_sellers?.items ?? []).flatMap((item) => item.id === undefined ? [] : [item.id]),
      apps,
      staleSources: [],
    },
  };
}

function required(env: NodeJS.ProcessEnv, name: "TWITCH_CLIENT_ID" | "TWITCH_CLIENT_SECRET"): string {
  const value = env[name]?.trim();
  if (!value) throw new Error(`${name} is required for the live pipeline run`);
  return value;
}

function positiveInteger(env: NodeJS.ProcessEnv, name: string, fallback: number): number {
  const value = env[name];
  if (value === undefined || value.trim() === "") return fallback;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) throw new Error(`${name} must be a positive integer`);
  return parsed;
}

export function sourceConfig(env: NodeJS.ProcessEnv = process.env): SourceConfig {
  return {
    twitchClientId: required(env, "TWITCH_CLIENT_ID"),
    twitchClientSecret: required(env, "TWITCH_CLIENT_SECRET"),
    twitchTopGameLimit: positiveInteger(env, "TWITCH_TOP_GAME_LIMIT", 1000),
    twitchStreamPageLimit: positiveInteger(env, "TWITCH_STREAM_PAGE_LIMIT", 20),
    igdbRecentDays: positiveInteger(env, "IGDB_RECENT_DAYS", 60),
  };
}

export function validateOutput(rootDir: string): void {
  const catalog = readCatalog(createNodeFileStore(rootDir));
  if (!catalog) throw new Error("src/playground/game-recommendation/catalog.json is missing");
  const historyPath = resolve(rootDir, "data/history.json");
  if (!existsSync(historyPath)) throw new Error("data/history.json is missing");
  validateHistory(readHistory(historyPath), historyPath);
  loadKnowledge(rootDir);
}

function backfillRawPath(rootDir: string, start: string, end: string): string {
  return resolve(rootDir, "data/raw/igdb/backfill", `${start}_${end}.json`);
}

type BackfillPersistence = {
  recordResponse: RawResponseRecorder;
  recordSnapshot: (snapshot: IgdbRawSnapshot) => Promise<void>;
};

type BackfillPartitionPersistence = {
  path: string;
  start: string;
  end: string;
  games: Map<number, IgdbGame>;
  responses: unknown[];
};

function createBackfillPersistence(rootDir: string, asOf: string): BackfillPersistence {
  const partitions = new Map<string, BackfillPartitionPersistence>();
  const pendingResponses: unknown[] = [];

  const loadPartition = (start: string, end: string): BackfillPartitionPersistence => {
    const key = `${start}/${end}`;
    const existing = partitions.get(key);
    if (existing) return existing;

    const partition = {
      path: backfillRawPath(rootDir, start, end),
      start,
      end,
      games: new Map<number, IgdbGame>(),
      responses: [] as unknown[],
    } satisfies BackfillPartitionPersistence;
    try {
      const previous = JSON.parse(readFileSync(partition.path, "utf8")) as { games?: unknown; responses?: unknown };
      if (Array.isArray(previous.games)) {
        for (const game of previous.games) {
          if (game && typeof game === "object" && Number.isInteger((game as { id?: unknown }).id)) {
            const value = game as IgdbGame;
            partition.games.set(value.id, value);
          }
        }
      }
      if (Array.isArray(previous.responses)) partition.responses.push(...previous.responses);
    } catch {
      // A missing or incomplete partition file is rebuilt from the checkpoint offset.
    }
    partitions.set(key, partition);
    return partition;
  };

  const persist = async (partition: BackfillPartitionPersistence): Promise<void> => {
    await saveRaw(partition.path, {
      fetchedAt: asOf,
      source: "igdb",
      request: { partitionStart: partition.start, partitionEnd: partition.end },
      responses: partition.responses,
      warnings: [],
      games: [...partition.games.values()],
      externalGames: [],
      unresolvedSteamAppIds: [],
    });
  };

  return {
    recordResponse: async (response) => {
      pendingResponses.push(response);
    },
    recordSnapshot: async (snapshot) => {
      const start = snapshot.request.partitionStart;
      const end = snapshot.request.partitionEnd;
      if (typeof start !== "string" || typeof end !== "string") {
        throw new Error("IGDB backfill snapshot is missing partition boundaries");
      }
      const partition = loadPartition(start, end);
      partition.responses.push(...pendingResponses.splice(0));
      for (const game of snapshot.games) partition.games.set(game.id, game);
      await persist(partition);
    },
  };
}

function parseBackfillBoundaries(args: string[]): { start: string; end: string } {
  const startIndex = args.indexOf("--start");
  const endIndex = args.indexOf("--end");
  const start = startIndex >= 0 ? args[startIndex + 1] : undefined;
  const end = endIndex >= 0 ? args[endIndex + 1] : undefined;
  if (!start || !end) {
    throw new Error("backfill requires --start YYYY-MM-DD and --end YYYY-MM-DD");
  }
  const startDate = new Date(`${start}T00:00:00.000Z`);
  const endDate = new Date(`${end}T00:00:00.000Z`);
  if (start !== startDate.toISOString().slice(0, 10)) throw new Error(`invalid --start date: ${start}`);
  if (end !== endDate.toISOString().slice(0, 10)) throw new Error(`invalid --end date: ${end}`);
  if (startDate.getTime() >= endDate.getTime()) throw new Error(`--start must be before --end: ${start} >= ${end}`);
  return { start, end };
}

export async function runCommand(
  command: string | undefined,
  options: { rootDir?: string; env?: NodeJS.ProcessEnv; logger?: PipelineLogger; fetcher?: typeof fetch } = {},
  args: string[] = [],
): Promise<PipelineResult | void> {
  const rootDir = options.rootDir ?? process.cwd();
  const env = options.env ?? process.env;
  const logger = options.logger ?? console;
  if (command === "run") {
    const result = await runPipeline({
      rootDir,
      asOf: env.PIPELINE_AS_OF,
      fetcher: options.fetcher,
      allowNetwork: true,
      logger,
      config: sourceConfig(env),
    });
    logger.info(`live pipeline result: ${JSON.stringify(result)}`);
    return result;
  }
  if (command === "fixture") {
    const asOf = env.PIPELINE_AS_OF ?? FIXTURE_AS_OF;
    const result = await runPipeline({
      rootDir,
      asOf,
      allowNetwork: false,
      logger,
      raw: fixtureSources(rootDir, asOf),
    });
    logger.info(`catalog fixture emitted: ${result.gameCount} games`);
    return result;
  }
  if (command === "validate") {
    validateOutput(rootDir);
    logger.info("catalog valid");
    return;
  }
  if (command === "backfill") {
    const { start, end } = parseBackfillBoundaries(args);
    const asOf = env.PIPELINE_AS_OF ?? new Date().toISOString();
    const persistence = createBackfillPersistence(rootDir, asOf);
    const result = await runBackfill({
      rootDir,
      asOf,
      partitionStart: start,
      partitionEnd: end,
      clientId: required(env, "TWITCH_CLIENT_ID"),
      clientSecret: required(env, "TWITCH_CLIENT_SECRET"),
      fetcher: options.fetcher,
      recordResponse: persistence.recordResponse,
      recordSnapshot: persistence.recordSnapshot,
    });
    logger.info(`IGDB backfill result: ${JSON.stringify(result)}`);
    return;
  }
  throw new Error(`unsupported pipeline command: ${command ?? ""}`);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  runCommand(process.argv[2], {}, process.argv.slice(3)).catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  });
}
