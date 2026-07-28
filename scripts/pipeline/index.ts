import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { createNodeFileStore, readCatalog } from "./emit";
import { readHistory, validateHistory } from "./history";
import { loadKnowledge } from "./knowledge";
import type { IgdbExternalGame, IgdbGame, PipelineLogger, PipelineResult, RawSources, SourceConfig, SteamApp } from "./model";
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

export async function runCommand(
  command: string | undefined,
  options: { rootDir?: string; env?: NodeJS.ProcessEnv; logger?: PipelineLogger; fetcher?: typeof fetch } = {},
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
  throw new Error(`unsupported pipeline command: ${command ?? ""}`);
}

if (process.argv[1] && /scripts[\\/]pipeline[\\/]index\.ts$/.test(resolve(process.argv[1]))) {
  runCommand(process.argv[2]).catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  });
}
