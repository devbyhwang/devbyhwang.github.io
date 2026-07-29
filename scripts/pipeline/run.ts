import { existsSync, readFileSync, readdirSync } from "node:fs";
import { rm } from "node:fs/promises";
import { resolve } from "node:path";
import { emitCatalog, createNodeFileStore, readCatalog } from "./emit";
import { emitRecommendations } from "./recommendations";
import { appendSnapshot, deriveStreamingFeatures, makeDailySnapshot, readHistory, writeHistory } from "./history";
import { enrichGames, joinSources } from "./join";
import { loadKnowledge } from "./knowledge";
import type { IgdbGame, IgdbRawSnapshot, PipelineOptions, PipelineResult, RawResponseRecorder, RawSources, SourceAdapters, SourceConfig, SteamRawSnapshot, TwitchRawSnapshot } from "./model";
import { createHttpClient, saveRaw } from "./http";
import { fetchIgdb } from "./sources/igdb";
import { fetchSteam, mergeSteamSnapshots } from "./sources/steam";
import { fetchTwitch } from "./sources/twitch";

type SourceName = keyof RawSources;
type SourceSnapshot = IgdbRawSnapshot | TwitchRawSnapshot | SteamRawSnapshot;

const defaultAdapters: SourceAdapters = { igdb: fetchIgdb, twitch: fetchTwitch, steam: fetchSteam };

function latestPath(rootDir: string, source: SourceName): string {
  return resolve(rootDir, "data", "raw", source, "latest.json");
}

function backfillDirectory(rootDir: string): string {
  return resolve(rootDir, "data", "raw", "igdb", "backfill");
}

function readBackfillGames(rootDir: string): IgdbGame[] {
  const directory = backfillDirectory(rootDir);
  if (!existsSync(directory)) return [];
  const games = new Map<number, IgdbGame>();
  for (const file of readdirSync(directory).filter((name) => name.endsWith(".json")).sort()) {
    const path = resolve(directory, file);
    const parsed = JSON.parse(readFileSync(path, "utf8")) as { source?: unknown; games?: unknown };
    if (parsed.source !== "igdb" || !Array.isArray(parsed.games)) throw new Error(`${path}: invalid IGDB backfill snapshot`);
    for (const game of parsed.games) {
      if (!game || typeof game !== "object" || !Number.isInteger((game as { id?: unknown }).id)) {
        throw new Error(`${path}: invalid IGDB backfill game`);
      }
      const value = game as IgdbGame;
      games.set(value.id, value);
    }
  }
  return [...games.values()];
}

function mergeBackfillGames(raw: RawSources, rootDir: string): RawSources {
  const historical = readBackfillGames(rootDir);
  if (historical.length === 0) return raw;
  const games = new Map(raw.igdb.games.map((game) => [game.id, game]));
  for (const game of historical) {
    if (!games.has(game.id)) games.set(game.id, game);
  }
  return { ...raw, igdb: { ...raw.igdb, games: [...games.values()] } };
}

function partialPath(rootDir: string, source: SourceName, asOf: string): string {
  const runId = asOf.replace(/[:.]/g, "-");
  return resolve(rootDir, "data", "raw", source, "partial", `${runId}.json`);
}

type PartialRecorder = {
  record: RawResponseRecorder;
  discard(): Promise<void>;
};

function createPartialRecorder(rootDir: string, source: SourceName, asOf: string): PartialRecorder {
  const path = partialPath(rootDir, source, asOf);
  const responses: unknown[] = [];
  return {
    async record(response) {
      responses.push(response);
      await saveRaw(path, {
        fetchedAt: asOf,
        source,
        complete: false,
        request: { runAt: asOf },
        responses,
        warnings: [],
      });
    },
    async discard() {
      await rm(path, { force: true });
    },
  };
}

function readLatest<T extends SourceSnapshot>(rootDir: string, source: SourceName): T | null {
  try {
    const value: unknown = JSON.parse(readFileSync(latestPath(rootDir, source), "utf8"));
    if (!value || typeof value !== "object" || (value as { source?: unknown }).source !== source) return null;
    return value as T;
  } catch {
    return null;
  }
}

function normalizedAsOf(value?: string): string {
  const date = value === undefined ? new Date() : new Date(value);
  if (!Number.isFinite(date.getTime())) throw new Error(`invalid PIPELINE_AS_OF timestamp: ${value ?? ""}`);
  return date.toISOString();
}

function sourceFailure(source: SourceName): Error {
  return new Error(`${source.toUpperCase()} source failed and no latest raw cache is available`);
}

function mappedSteamAppIds(snapshot: IgdbRawSnapshot): number[] {
  const values = [
    ...snapshot.externalGames
      .filter((external) => external.external_game_source === 1)
      .map((external) => external.uid),
    ...snapshot.games.flatMap((game) => (game.external_games ?? [])
      .filter((external) => external.external_game_source === 1)
      .map((external) => external.uid)),
  ];
  return [...new Set(values.flatMap((value) => {
    const parsed = Number(value);
    return Number.isInteger(parsed) && parsed > 0 ? [parsed] : [];
  }))];
}

async function cacheFresh(rootDir: string, source: SourceName, snapshot: SourceSnapshot): Promise<void> {
  await saveRaw(latestPath(rootDir, source), snapshot);
}

async function resolveSource<T extends SourceSnapshot>(
  source: SourceName,
  result: PromiseSettledResult<T>,
  rootDir: string,
  logger: PipelineOptions["logger"],
  partial: PartialRecorder,
): Promise<{ snapshot: T | null; fresh: boolean }> {
  if (result.status === "fulfilled") {
    await cacheFresh(rootDir, source, result.value);
    await partial.discard();
    return { snapshot: result.value, fresh: true };
  }
  const cached = readLatest<T>(rootDir, source);
  if (!cached) return { snapshot: null, fresh: false };
  logger.warn(`${source} source failed; using its latest raw cache`);
  return { snapshot: cached, fresh: false };
}

type FetchAllSourcesResult = {
  raw: RawSources;
  fetchedSources: string[];
  staleSources: string[];
};

async function fetchAllSourcesWithStatus(
  config: SourceConfig,
  adapters: SourceAdapters = defaultAdapters,
  rootDir = process.cwd(),
  asOf = new Date().toISOString(),
  fetcher: typeof fetch = fetch,
  logger: PipelineOptions["logger"] = console,
): Promise<FetchAllSourcesResult> {
  const http = createHttpClient(fetcher);
  const twitchPartial = createPartialRecorder(rootDir, "twitch", asOf);
  const steamPartial = createPartialRecorder(rootDir, "steam", asOf);
  const [twitchResult, steamResult] = await Promise.allSettled([
    adapters.twitch({
      clientId: config.twitchClientId,
      clientSecret: config.twitchClientSecret,
      topGameLimit: config.twitchTopGameLimit,
      streamPageLimit: config.twitchStreamPageLimit,
      recordResponse: twitchPartial.record,
    }, http),
    adapters.steam({ steamAppIds: [], cachePath: latestPath(rootDir, "steam"), recordResponse: steamPartial.record }, http),
  ]);
  const twitch = await resolveSource("twitch", twitchResult, rootDir, logger, twitchPartial);
  const steam = await resolveSource("steam", steamResult, rootDir, logger, steamPartial);
  if (!twitch.snapshot) throw sourceFailure("twitch");
  if (!steam.snapshot) throw sourceFailure("steam");

  const igdbPartial = createPartialRecorder(rootDir, "igdb", asOf);
  const [igdbResult] = await Promise.allSettled([
    adapters.igdb({
      clientId: config.twitchClientId,
      clientSecret: config.twitchClientSecret,
      asOf,
      recentDays: config.igdbRecentDays,
      topIgdbIds: twitch.snapshot.topGames.map((game) => String(game.igdbId)),
      steamAppIds: [...new Set([...steam.snapshot.topSellerAppIds, ...steam.snapshot.apps.map((app) => app.appId)])],
      recordResponse: igdbPartial.record,
    }, http),
  ]);
  const igdb = await resolveSource("igdb", igdbResult, rootDir, logger, igdbPartial);
  if (!igdb.snapshot) throw sourceFailure("igdb");

  let steamSnapshot = steam.snapshot;
  let steamFresh = steam.fresh;
  let steamDetailsStale = false;
  const missingSteamAppIds = mappedSteamAppIds(igdb.snapshot)
    .filter((appId) => !steamSnapshot.apps.some((app) => app.appId === appId));
  if (missingSteamAppIds.length > 0) {
    const [steamDetailsResult] = await Promise.allSettled([
      adapters.steam({
        steamAppIds: missingSteamAppIds,
        includeTopSellers: false,
        featured: {
          topSellerAppIds: steamSnapshot.topSellerAppIds,
          response: steamSnapshot.responses[0],
        },
        cachePath: latestPath(rootDir, "steam"),
        recordResponse: steamPartial.record,
      }, http),
    ]);
    if (steamDetailsResult.status === "fulfilled") {
      steamSnapshot = mergeSteamSnapshots(steamSnapshot, steamDetailsResult.value);
      steamFresh = true;
      await cacheFresh(rootDir, "steam", steamSnapshot);
      await steamPartial.discard();
    } else {
      steamDetailsStale = true;
      logger.warn("steam detail enrichment failed; keeping the initial Steam snapshot");
    }
  }

  const sourceResults = [
    ["twitch", twitch],
    ["steam", { snapshot: steamSnapshot, fresh: steamFresh }],
    ["igdb", igdb],
  ] as const;
  return {
    raw: { igdb: igdb.snapshot, twitch: twitch.snapshot, steam: steamSnapshot },
    fetchedSources: sourceResults.flatMap(([source, result]) => result.fresh ? [source] : []),
    staleSources: [
      ...sourceResults.flatMap(([source, result]) => result.fresh ? [] : [source]),
      ...steamSnapshot.staleSources,
      ...(steamDetailsStale ? ["steam-details"] : []),
    ],
  };
}

/** Fetches network sources in dependency order while isolating each source failure. */
export async function fetchAllSources(
  config: SourceConfig,
  adapters: SourceAdapters = defaultAdapters,
): Promise<RawSources> {
  return (await fetchAllSourcesWithStatus(config, adapters)).raw;
}

/** Runs source fetch, history snapshot, and guarded catalog emission in that fixed order. */
export async function runPipeline(options: PipelineOptions): Promise<PipelineResult> {
  const { rootDir } = options;
  const asOf = normalizedAsOf(options.asOf);
  const knowledge = options.knowledge ?? loadKnowledge(rootDir);
  let raw: RawSources;
  let fetchedSources: string[];
  let staleSources: string[];
  if (options.raw) {
    raw = options.raw;
    fetchedSources = ["igdb", "twitch", "steam"];
    staleSources = [...raw.steam.staleSources];
  } else {
    if (!options.allowNetwork) throw new Error("network source fetching is disabled");
    if (!options.config) throw new Error("live pipeline source configuration is required");
    const fetched = await fetchAllSourcesWithStatus(options.config, options.adapters ?? defaultAdapters, rootDir, asOf, options.fetcher, options.logger);
    raw = fetched.raw;
    fetchedSources = fetched.fetchedSources;
    staleSources = fetched.staleSources;
  }
  const joined = joinSources(mergeBackfillGames(raw, rootDir));
  const historyPath = resolve(rootDir, "data/history.json");
  const twitchFresh = fetchedSources.includes("twitch");
  const currentHistory = readHistory(historyPath);
  const nextHistory = twitchFresh
    ? appendSnapshot(currentHistory, makeDailySnapshot(joined, asOf))
    : currentHistory;
  const historyForFeatures = twitchFresh ? nextHistory : currentHistory;
  if (twitchFresh) writeHistory(historyPath, nextHistory);

  const games = enrichGames(joined, knowledge, asOf).map((game) => {
    const features = deriveStreamingFeatures(historyForFeatures, game.id, asOf);
    return {
      ...game,
      buzz: {
        ...game.buzz,
        viewerGrowth7d: features.growth7d,
      },
      streaming: {
        ...game.streaming,
        growth7d: features.growth7d,
        growth30d: features.growth30d,
        growth90d: features.growth90d,
        volatility30d: features.volatility30d,
        observedSnapshots: features.observedSnapshots,
        coverage: game.streaming.coverage,
        asOf,
      },
    };
  });
  const fileStore = createNodeFileStore(rootDir);
  const catalog = { generatedAt: asOf, games };
  const emitted = emitCatalog(catalog, readCatalog(fileStore), fileStore);
  emitRecommendations(catalog, fileStore);
  const result: PipelineResult = {
    generatedAt: asOf,
    fetchedSources,
    staleSources: [...new Set(staleSources)],
    gameCount: emitted.gameCount,
    catalogUpdated: emitted.catalogUpdated,
    historyUpdated: twitchFresh,
  };
  options.logger.info(`pipeline completed: ${JSON.stringify(result)}`);
  return result;
}
