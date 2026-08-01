import { existsSync, readFileSync, readdirSync } from "node:fs";
import { rm } from "node:fs/promises";
import { resolve } from "node:path";
import { emitCatalog, createNodeFileStore, readCatalog } from "./emit";
import { assertVibeDistribution, formatVibeDistribution, measureVibeDistribution } from "./vibe-distribution";
import { emitExploration } from "./exploration";
import { emitRecommendations } from "./recommendations";
import { appendSnapshot, deriveStreamingFeatures, makeDailySnapshot, readHistory, writeHistory } from "./history";
import { enrichGames, joinSources } from "./join";
import { loadKnowledge } from "./knowledge";
import { combineDemandShares, resolveChzzkCategories } from "./chzzk";
import { GLOBAL_QUALITY_PRIOR, qualityStats } from "./metrics/quality";
import { fitSteamScale, steamRatio } from "./metrics/steam-scale";
import type { ChzzkRawSnapshot, DemandShareEntry, IgdbGame, IgdbRawSnapshot, JoinedGame, KnowledgeAssets, PipelineOptions, PipelineResult, RawResponseRecorder, RawSources, SourceAdapters, SourceConfig, SteamApp, SteamRawSnapshot, TwitchRawSnapshot } from "./model";
import { createHttpClient, saveRaw } from "./http";
import { fetchIgdb } from "./sources/igdb";
import { fetchSteam, mergeSteamSnapshots } from "./sources/steam";
import { fetchTwitch } from "./sources/twitch";
import { fetchChzzk } from "./sources/chzzk";
import { loadSteamSpyBulkReviews } from "./steam-bulk-reviews";

type SourceName = keyof RawSources;
type SourceSnapshot = IgdbRawSnapshot | TwitchRawSnapshot | SteamRawSnapshot | ChzzkRawSnapshot;

const defaultAdapters: SourceAdapters = { igdb: fetchIgdb, twitch: fetchTwitch, steam: fetchSteam, chzzk: fetchChzzk };

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

function emptyChzzkSnapshot(asOf: string, warning: string): ChzzkRawSnapshot {
  return {
    fetchedAt: asOf,
    source: "chzzk",
    request: { disabled: true },
    responses: [],
    warnings: [warning],
    categories: [],
    truncated: false,
  };
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
  sourceStatus: { chzzk: "fresh" | "disabled" | "failed"; twitch: "fresh" | "stale" };
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
  const chzzkEnabled = Boolean(config.chzzkClientId?.trim() && config.chzzkClientSecret?.trim());
  const chzzkPartial = chzzkEnabled ? createPartialRecorder(rootDir, "chzzk", asOf) : undefined;
  const [twitchResult, steamResult, chzzkResult] = await Promise.allSettled([
    adapters.twitch({
      clientId: config.twitchClientId,
      clientSecret: config.twitchClientSecret,
      topGameLimit: config.twitchTopGameLimit,
      streamPageLimit: config.twitchStreamPageLimit,
      recordResponse: twitchPartial.record,
    }, http),
    adapters.steam({ steamAppIds: [], cachePath: latestPath(rootDir, "steam"), recordResponse: steamPartial.record }, http),
    chzzkEnabled
      ? adapters.chzzk({
        clientId: config.chzzkClientId!,
        clientSecret: config.chzzkClientSecret!,
        pageLimit: config.chzzkPageLimit,
        retryLimit: config.chzzkRetryLimit,
        recordResponse: chzzkPartial!.record,
      }, http)
      : Promise.resolve(emptyChzzkSnapshot(asOf, "Chzzk credentials are unavailable")),
  ]);
  const twitch = await resolveSource("twitch", twitchResult, rootDir, logger, twitchPartial);
  const steam = await resolveSource("steam", steamResult, rootDir, logger, steamPartial);
  if (!twitch.snapshot) throw sourceFailure("twitch");
  if (!steam.snapshot) throw sourceFailure("steam");
  let chzzk: { snapshot: ChzzkRawSnapshot; fresh: boolean };
  if (chzzkEnabled && chzzkResult.status === "fulfilled") {
    await cacheFresh(rootDir, "chzzk", chzzkResult.value);
    await chzzkPartial!.discard();
    chzzk = { snapshot: chzzkResult.value, fresh: true };
  } else {
    if (chzzkEnabled) logger.warn("chzzk source failed; using an empty snapshot");
    chzzk = {
      snapshot: emptyChzzkSnapshot(asOf, chzzkEnabled ? "Chzzk source failed" : "Chzzk credentials are unavailable"),
      fresh: false,
    };
  }

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

  // Merge the SteamSpy bulk backfill in for review evidence only, after every use of live
  // Steam data for IGDB discovery above — merging earlier would balloon the IGDB fetch's
  // `steamAppIds` scope from ~50 live apps to the full 82,505-app bulk set. A live-fetched
  // entry always wins on collision; bulk-only apps get sparse defaults (no tags/price) since
  // only their positive/negative review counts feed the join step.
  const bulkReviews = loadSteamSpyBulkReviews(rootDir);
  const knownSteamAppIds = new Set(steamSnapshot.apps.map((app) => app.appId));
  const bulkOnlyApps: SteamApp[] = [...bulkReviews.entries()]
    .filter(([appId]) => !knownSteamAppIds.has(appId))
    .map(([appId, review]) => ({
      appId,
      tags: {},
      positive: review.positive,
      negative: review.negative,
      owners: "",
      price: "0",
      discount: "0",
    }));
  if (bulkOnlyApps.length > 0) {
    steamSnapshot = { ...steamSnapshot, apps: [...steamSnapshot.apps, ...bulkOnlyApps] };
  }

  const sourceResults = [
    ["twitch", twitch],
    ["steam", { snapshot: steamSnapshot, fresh: steamFresh }],
    ["igdb", igdb],
    ["chzzk", chzzk],
  ] as const;
  return {
    raw: { igdb: igdb.snapshot, twitch: twitch.snapshot, steam: steamSnapshot, chzzk: chzzk.snapshot },
    fetchedSources: sourceResults.flatMap(([source, result]) => result.fresh ? [source] : []),
    staleSources: [
      ...sourceResults.flatMap(([source, result]) => result.fresh ? [] : [source]),
      ...steamSnapshot.staleSources,
      ...(steamDetailsStale ? ["steam-details"] : []),
    ],
    sourceStatus: {
      chzzk: chzzk.fresh ? "fresh" : chzzkEnabled ? "failed" : "disabled",
      twitch: twitch.fresh ? "fresh" : "stale",
    },
  };
}

/**
 * IGDB 평점과 Steam 리뷰를 둘 다 가진 게임들에서 한 번만 척도를 맞춘다. 게임마다
 * 다시 맞추면 실행 내내 상대 순위가 흔들리고, 겹침이 부족하면(<2,000)
 * `fitSteamScale`이 `null`을 돌려줘 이후 join 단계가 Steam 신호 없이 진행된다.
 */
function fitJoinedSteamScale(joined: JoinedGame[]) {
  const pairs = joined.flatMap((game) => {
    if (!game.steam) return [];
    const ratio = steamRatio(game.steam.positive, game.steam.negative);
    if (ratio === null) return [];
    const igdbRating = qualityStats(game.igdb, undefined, GLOBAL_QUALITY_PRIOR).totalRating;
    return igdbRating === undefined ? [] : [{ steam: ratio, igdb: igdbRating }];
  });
  return fitSteamScale(pairs) ?? undefined;
}

function demandFor(raw: RawSources, aliases: KnowledgeAssets["chzzkAliases"]): {
  shares: Map<string, number>;
  demandSources: { chzzk: boolean; twitch: boolean };
  warnings: string[];
} {
  const resolution = resolveChzzkCategories(raw.chzzk.categories, raw.igdb.games, aliases);
  const chzzkByGame = new Map<string, { viewers: number; coverage: number }>();
  for (const stat of resolution.stats) {
    const existing = chzzkByGame.get(stat.igdbId) ?? { viewers: 0, coverage: 0 };
    chzzkByGame.set(stat.igdbId, { viewers: existing.viewers + stat.viewers, coverage: Math.max(existing.coverage, stat.coverage) });
  }
  const twitchByGame = new Map(raw.twitch.streams.map((stat) => [String(stat.igdbId), {
    viewers: stat.viewers,
    coverage: stat.coverage ?? 1,
  }]));
  const entries: DemandShareEntry[] = raw.igdb.games.map((game) => ({
    igdbId: String(game.id),
    ...(chzzkByGame.has(String(game.id)) ? { chzzk: chzzkByGame.get(String(game.id))! } : {}),
    ...(twitchByGame.has(String(game.id)) ? { twitch: twitchByGame.get(String(game.id))! } : {}),
  }));
  return {
    shares: combineDemandShares(entries),
    demandSources: {
      chzzk: [...chzzkByGame.values()].some((stat) => stat.viewers > 0 && stat.coverage > 0),
      twitch: [...twitchByGame.values()].some((stat) => stat.viewers > 0 && stat.coverage > 0),
    },
    warnings: resolution.warnings,
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
  let sourceStatus: { chzzk: "fresh" | "disabled" | "failed"; twitch: "fresh" | "stale" };
  if (options.raw) {
    raw = options.raw;
    fetchedSources = ["igdb", "twitch", "steam"];
    staleSources = [...raw.steam.staleSources];
    sourceStatus = { chzzk: "fresh", twitch: "fresh" };
  } else {
    if (!options.allowNetwork) throw new Error("network source fetching is disabled");
    if (!options.config) throw new Error("live pipeline source configuration is required");
    const fetched = await fetchAllSourcesWithStatus(options.config, options.adapters ?? defaultAdapters, rootDir, asOf, options.fetcher, options.logger);
    raw = fetched.raw;
    fetchedSources = fetched.fetchedSources;
    staleSources = fetched.staleSources;
    sourceStatus = fetched.sourceStatus;
  }
  raw = mergeBackfillGames(raw, rootDir);
  const demand = demandFor(raw, knowledge.chzzkAliases);
  if (demand.warnings.length > 0) {
    raw = { ...raw, chzzk: { ...raw.chzzk, warnings: [...raw.chzzk.warnings, ...demand.warnings] } };
    if (fetchedSources.includes("chzzk")) await cacheFresh(rootDir, "chzzk", raw.chzzk);
  }
  const joinedGames = joinSources(raw);
  const steamScale = fitJoinedSteamScale(joinedGames);
  const joined = steamScale ? joinedGames.map((game) => ({ ...game, steamScale })) : joinedGames;
  const historyPath = resolve(rootDir, "data/history.json");
  const twitchFresh = fetchedSources.includes("twitch");
  const currentHistory = readHistory(historyPath);
  const nextHistory = twitchFresh
    ? appendSnapshot(currentHistory, makeDailySnapshot(joined, asOf))
    : currentHistory;
  const historyForFeatures = twitchFresh ? nextHistory : currentHistory;
  if (twitchFresh) writeHistory(historyPath, nextHistory);

  const games = enrichGames(joined, knowledge, asOf, demand.shares, demand.demandSources, sourceStatus).map((game) => {
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
  const vibeDistribution = measureVibeDistribution(catalog.games);
  console.log(`vibe distribution:\n${formatVibeDistribution(vibeDistribution)}`);
  assertVibeDistribution(vibeDistribution);
  const emitted = emitCatalog(catalog, readCatalog(fileStore), fileStore);
  emitRecommendations(catalog, fileStore);
  emitExploration(catalog, fileStore);
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
