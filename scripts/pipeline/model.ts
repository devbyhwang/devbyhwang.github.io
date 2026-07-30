import type { fetchIgdb } from "./sources/igdb";
import type { fetchSteam } from "./sources/steam";
import type { fetchTwitch } from "./sources/twitch";
import type { fetchChzzk } from "./sources/chzzk";

export type VibeKey = "healing" | "variety" | "horror" | "hardcore" | "chatting" | "spectacle";
export type SessionShape = "match" | "run" | "chapter" | "openended";
export type ViewerPlayable = { ok: boolean; reason?: string };
export type SteamTag = { name: string; share: number };
export type VibeWeightMap = Record<string, Partial<Record<VibeKey, number>>>;
export type VibeWeights = {
  genres: VibeWeightMap;
  themes: VibeWeightMap;
  tags: VibeWeightMap;
};
export type SessionRule = {
  shape: SessionShape;
  genresAny?: string[];
  tagsAny?: string[];
  tagsAll?: string[];
};
export type SessionRules = { rules: SessionRule[]; default: SessionShape };
export type ViewerPlayableRules = {
  games: Record<string, ViewerPlayable>;
  tags: Record<string, ViewerPlayable>;
};
export type KnowledgeAssets = {
  vibeWeights: VibeWeights;
  sessionRules: SessionRules;
  viewerPlayable: ViewerPlayableRules;
  chzzkAliases: ChzzkAlias[];
};

export type ChzzkAlias = {
  igdbId: string;
  categoryIds?: string[];
  names?: string[];
};

export type ResolvedChzzkStat = ChzzkCategoryStat & { igdbId: string };
export type ChzzkCategoryResolution = { stats: ResolvedChzzkStat[]; warnings: string[] };

export type DemandSourceStat = { viewers: number; coverage: number };
export type DemandShareEntry = {
  igdbId: string;
  chzzk?: DemandSourceStat;
  twitch?: DemandSourceStat;
};

export type ClassificationInput = { genres: string[]; tags: string[] };

export type StreamingStats = {
  totalViewers: number;
  channelCount: number;
  medianViewersPerChannel: number | null;
  p75ViewersPerChannel: number | null;
  top10ViewerShare: number | null;
  viewerConcentration: number | null;
  growth7d: number | null;
  growth30d: number | null;
  growth90d: number | null;
  volatility30d: number | null;
  observedSnapshots: number;
  coverage: number;
  asOf: string;
};

export type StreamingAggregate = {
  totalViewers: number;
  channelCount: number;
  medianViewersPerChannel: number;
  p75ViewersPerChannel: number;
  top10ViewerShare: number;
  viewerConcentration: number;
  coverage: number;
};

export type StreamingFeatures = {
  growth7d: number | null;
  growth30d: number | null;
  growth90d: number | null;
  volatility30d: number | null;
  observedSnapshots: number;
  confidence: number;
};

export type QualityStats = {
  igdbRating?: number;
  igdbRatingCount?: number;
  criticRating?: number;
  criticRatingCount?: number;
  totalRating?: number;
  totalRatingCount?: number;
  steamPositive?: number;
  steamNegative?: number;
};

export type GameRecord = {
  id: string;
  steamAppId?: number;
  name: string;
  nameKo?: string;
  franchise?: string;
  coverUrl?: string;
  storeUrl?: string;
  releaseDate: string;
  players: { max: number | "unknown"; source: "igdb_multiplayer" | "igdb_gamemodes" | "steam_categories" | "unknown"; online: boolean; localCoop: boolean };
  sessionShape: SessionShape;
  genres: string[];
  themes: string[];
  viewerPlayable: ViewerPlayable;
  vibes: Record<VibeKey, number>;
  buzz: {
    twitchViewers: number;
    twitchChannels: number;
    viewerGrowth7d: number | null;
    isNewRelease: boolean;
    demandShare: number;
    demandSources: { chzzk: boolean; twitch: boolean };
    sourceStatus: { chzzk: "fresh" | "disabled" | "failed"; twitch: "fresh" | "stale" };
  };
  streaming: StreamingStats;
  quality: QualityStats;
  topTags: { tag: string; share: number }[];
  discountPercent?: number;
  rating?: number;
  reviewCount?: number;
};

export type CatalogManifest = {
  generatedAt: string;
  gameCount: number;
  chunks: string[];
};

export type CatalogChunk = {
  generatedAt: string;
  games: GameRecord[];
};

export type CatalogRecord = CatalogChunk;

export type DailySnapshot = {
  date: string;
  twitchViewers: number;
  twitchChannels: number;
  coverage?: number;
};

export type History = Record<string, DailySnapshot[]>;
export type DailySnapshots = Record<string, DailySnapshot>;

export type RawSources = {
  igdb: IgdbRawSnapshot;
  twitch: TwitchRawSnapshot;
  steam: SteamRawSnapshot;
  chzzk: ChzzkRawSnapshot;
};

/** A numeric-IGDB join before knowledge-based catalog enrichment. */
export type JoinedGame = {
  igdb: IgdbGame;
  steamAppId?: number;
  steam?: SteamApp;
  twitch: {
    viewers: number;
    channels: number;
    medianViewersPerChannel?: number | null;
    p75ViewersPerChannel?: number | null;
    top10ViewerShare?: number | null;
    viewerConcentration?: number | null;
    coverage?: number;
    boxArtUrl?: string;
  };
  tags: SteamTag[];
};

export type HttpClient = {
  getJson<T>(url: string, headers?: Record<string, string>): Promise<T>;
  postJson<T>(url: string, body: string, headers?: Record<string, string>): Promise<T>;
  getJsonResponse?<T>(url: string, headers?: Record<string, string>): Promise<{ status: number; headers: Record<string, string>; data?: T }>;
};

export type RawResponseRecorder = (response: unknown) => Promise<void>;

export type IgdbFetchInput = {
  clientId: string;
  clientSecret: string;
  asOf: string;
  recentDays: number;
  topIgdbIds: string[];
  steamAppIds: number[];
  partitionStart?: string;
  partitionEnd?: string;
  offset?: number;
  recordResponse?: RawResponseRecorder;
};

export type TwitchFetchInput = {
  clientId: string;
  clientSecret: string;
  topGameLimit: number;
  streamPageLimit: number;
  recordResponse?: RawResponseRecorder;
};

export type ChzzkFetchInput = {
  clientId: string;
  clientSecret: string;
  pageLimit: number;
  retryLimit: number;
  recordResponse?: RawResponseRecorder;
};

export type SteamFetchInput = {
  steamAppIds: number[];
  /** Allows tests and callers with an alternate data root to keep cache writes isolated. */
  cachePath?: string;
  recordResponse?: RawResponseRecorder;
  featured?: { topSellerAppIds: number[]; response?: unknown };
  includeTopSellers?: boolean;
};

export type RawEnvelope = {
  fetchedAt: string;
  source: "igdb" | "twitch" | "steam" | "chzzk";
  request: Record<string, unknown>;
  responses: unknown[];
  warnings: string[];
};

export type IgdbGame = {
  id: number;
  name: string;
  first_release_date?: number;
  cover?: { image_id?: string };
  external_games?: Array<{ uid: string; external_game_source: number }>;
  game_type?: number;
  parent_game?: number;
  version_parent?: number;
  platforms?: Array<{ name?: string }>;
  collection?: { name?: string };
  franchise?: { name?: string };
  genres?: Array<{ name?: string }>;
  themes?: Array<{ name?: string }>;
  game_modes?: Array<{ name?: string }>;
  multiplayer_modes?: Array<{
    onlinecoop?: boolean;
    offlinecoop?: boolean;
    onlinecoopmax?: number;
    onlinemax?: number;
    offlinecoopmax?: number;
    offlinemax?: number;
  }>;
  rating?: number;
  rating_count?: number;
  aggregated_rating?: number;
  aggregated_rating_count?: number;
  total_rating?: number;
  total_rating_count?: number;
};

export type IgdbExternalGame = { id?: number; game: number; uid: string; external_game_source: number };

export type TwitchTopGame = { categoryId: string; name: string; igdbId: number | string; boxArtUrl?: string };
export type StreamObservation = {
  categoryId: string;
  gameId: string;
  igdbId: number | string;
  viewerCount: number;
  userId?: string;
  language?: string;
};
export type TwitchStreamStat = {
  categoryId: string;
  igdbId: number | string;
  viewers: number;
  channels: number;
  medianViewersPerChannel?: number;
  p75ViewersPerChannel?: number;
  top10ViewerShare?: number;
  viewerConcentration?: number;
  coverage?: number;
};

export type SteamApp = {
  appId: number;
  name?: string;
  tags: Record<string, number>;
  positive: number;
  negative: number;
  owners: string;
  price: string;
  discount: string;
  categories?: string[];
};

export type IgdbRawSnapshot = RawEnvelope & {
  source: "igdb";
  games: IgdbGame[];
  externalGames: IgdbExternalGame[];
  unresolvedSteamAppIds: number[];
};

export type TwitchRawSnapshot = RawEnvelope & {
  source: "twitch";
  topGames: TwitchTopGame[];
  streams: TwitchStreamStat[];
  streamObservations?: StreamObservation[];
  truncated: boolean;
};

export type ChzzkCategoryStat = {
  categoryId: string;
  name: string;
  viewers: number;
  channels: number;
  coverage: number;
};

export type ChzzkRawSnapshot = RawEnvelope & {
  source: "chzzk";
  categories: ChzzkCategoryStat[];
  truncated: boolean;
};

export type SteamRawSnapshot = RawEnvelope & {
  source: "steam";
  topSellerAppIds: number[];
  apps: SteamApp[];
  staleSources: string[];
};

export type PipelineLogger = Pick<Console, "info" | "warn" | "error">;

export type PipelineOptions = {
  rootDir: string;
  asOf?: string;
  fetcher?: typeof fetch;
  allowNetwork: boolean;
  logger: PipelineLogger;
  /** Fixture runs pass already-read raw snapshots and never contact a source. */
  raw?: RawSources;
  knowledge?: KnowledgeAssets;
  config?: SourceConfig;
  adapters?: SourceAdapters;
};

export type SourceConfig = {
  twitchClientId: string;
  twitchClientSecret: string;
  twitchTopGameLimit: number;
  twitchStreamPageLimit: number;
  igdbRecentDays: number;
  chzzkClientId?: string;
  chzzkClientSecret?: string;
  chzzkPageLimit: number;
  chzzkRetryLimit: number;
};

export type SourceAdapters = {
  igdb: typeof fetchIgdb;
  twitch: typeof fetchTwitch;
  steam: typeof fetchSteam;
  chzzk: typeof fetchChzzk;
};

export type PipelineResult = {
  generatedAt: string;
  fetchedSources: string[];
  staleSources: string[];
  gameCount: number;
  catalogUpdated: boolean;
  historyUpdated: boolean;
};

export type BackfillOptions = {
  rootDir: string;
  asOf: string;
  partitionStart: string;
  partitionEnd: string;
  clientId: string;
  clientSecret: string;
  fetcher?: typeof fetch;
  recordResponse?: RawResponseRecorder;
  recordSnapshot?: (snapshot: IgdbRawSnapshot) => Promise<void>;
};

export type BackfillResult = {
  completedPartitions: string[];
  fetchedGameCount: number;
  remainingPartitions: string[];
};
