import { GLOBAL_QUALITY_PRIOR, qualityStats } from "./metrics/quality";
import {
  classifySessionShape,
  deriveIsNewRelease,
  deriveRawVibes,
  normalizePlayers,
  normalizeVibes,
  resolveViewerPlayable,
} from "./enrich";
import type { GameRecord, IgdbGame, JoinedGame, KnowledgeAssets, RawSources, SteamApp, SteamTag } from "./model";

function appId(value: string): number | undefined {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : undefined;
}

function tagsFor(steam: SteamApp | undefined): SteamTag[] {
  if (!steam) return [];
  const entries = Object.entries(steam.tags)
    .filter(([, count]) => Number.isFinite(count) && count > 0)
    .sort(([leftName, left], [rightName, right]) => right - left || leftName.localeCompare(rightName));
  const largest = entries[0]?.[1];
  if (!largest) return [];
  return entries.map(([name, count]) => ({ name, share: count / largest }));
}

function steamCandidates(game: IgdbGame, raw: RawSources): number[] {
  const fromSnapshot = raw.igdb.externalGames
    .filter((external) => external.game === game.id && external.external_game_source === 1)
    .flatMap((external) => appId(external.uid) ?? []);
  const embedded = (game.external_games ?? [])
    .filter((external) => external.external_game_source === 1)
    .flatMap((external) => appId(external.uid) ?? []);
  return [...new Set([...fromSnapshot, ...embedded])];
}

function selectedSteam(game: IgdbGame, raw: RawSources): { steamAppId?: number; steam?: SteamApp } {
  const apps = new Map(raw.steam.apps.map((app) => [app.appId, app]));
  const candidates = steamCandidates(game, raw);
  const matched = candidates.find((candidate) => apps.has(candidate));
  const steamAppId = matched ?? candidates[0];
  return steamAppId === undefined ? {} : { steamAppId, steam: apps.get(steamAppId) };
}

/** Joins only on numeric IGDB id; source names never participate in identity. */
export function joinSources(raw: RawSources): JoinedGame[] {
  const twitchArt = new Map(raw.twitch.topGames.map((game) => [String(game.igdbId), game.boxArtUrl] as const));
  const twitchStats = new Map(raw.twitch.streams.map((stream) => [String(stream.igdbId), {
    viewers: stream.viewers,
    channels: stream.channels,
    ...(stream.medianViewersPerChannel === undefined ? {} : { medianViewersPerChannel: stream.medianViewersPerChannel }),
    ...(stream.p75ViewersPerChannel === undefined ? {} : { p75ViewersPerChannel: stream.p75ViewersPerChannel }),
    ...(stream.top10ViewerShare === undefined ? {} : { top10ViewerShare: stream.top10ViewerShare }),
    ...(stream.viewerConcentration === undefined ? {} : { viewerConcentration: stream.viewerConcentration }),
    ...(stream.coverage === undefined ? {} : { coverage: stream.coverage }),
  }]));
  const twitchFor = (igdbId: string) => {
    const boxArtUrl = twitchArt.get(igdbId);
    return {
      ...(twitchStats.get(igdbId) ?? { viewers: 0, channels: 0 }),
      ...(boxArtUrl ? { boxArtUrl } : {}),
    };
  };
  const seen = new Set<number>();
  const joined: JoinedGame[] = [];
  for (const igdb of raw.igdb.games) {
    if (seen.has(igdb.id)) continue;
    seen.add(igdb.id);
    const steam = selectedSteam(igdb, raw);
    joined.push({
      igdb,
      ...steam,
      twitch: twitchFor(String(igdb.id)),
      tags: tagsFor(steam.steam),
    });
  }
  return joined;
}

function releaseDate(igdb: IgdbGame): string | null {
  if (!Number.isFinite(igdb.first_release_date)) return null;
  return new Date((igdb.first_release_date as number) * 1000).toISOString();
}

function gameModeNames(game: IgdbGame): string[] {
  return (game.game_modes ?? []).flatMap((mode) => mode.name ? [mode.name] : []);
}

function positiveInteger(value: string): number | undefined {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed >= 0 ? parsed : undefined;
}

function twitchCoverUrl(value: string): string {
  return value.replace("{width}x{height}", "285x380");
}

function reviewFields(game: JoinedGame): Pick<GameRecord, "rating" | "reviewCount" | "discountPercent" | "quality"> {
  const steamReviews = game.steam ? game.steam.positive + game.steam.negative : 0;
  const quality = qualityStats(game.igdb, game.steam, GLOBAL_QUALITY_PRIOR);
  const rating = steamReviews > 0
    ? game.steam!.positive / steamReviews * 100
    : game.igdb.rating;
  const reviewCount = steamReviews > 0 ? steamReviews : game.igdb.rating_count;
  const discountPercent = game.steam ? positiveInteger(game.steam.discount) : undefined;
  return {
    ...(rating === undefined ? {} : { rating }),
    ...(reviewCount === undefined ? {} : { reviewCount }),
    ...(discountPercent === undefined ? {} : { discountPercent }),
    quality,
  };
}

/** Converts joined raw candidates to validated-shape records except for catalog-wide validation. */
export function enrichGames(
  joined: JoinedGame[],
  knowledge: KnowledgeAssets,
  generatedAt: string,
  demandShares: ReadonlyMap<string, number> = new Map(),
  sources: GameRecord["buzz"]["sources"] = { chzzk: false, twitch: true },
): GameRecord[] {
  const candidates = joined.flatMap((game) => {
    const date = releaseDate(game.igdb);
    if (!date) return [];
    const tagNames = game.tags.map((tag) => tag.name);
    const players = normalizePlayers(
      { multiplayer_modes: game.igdb.multiplayer_modes, game_modes: gameModeNames(game.igdb) },
      { categories: game.steam?.categories ?? [] },
    );
    const coverUrl = game.igdb.cover?.image_id
      ? `https://images.igdb.com/igdb/image/upload/t_cover_big/${game.igdb.cover.image_id}.jpg`
      : game.twitch.boxArtUrl
        ? twitchCoverUrl(game.twitch.boxArtUrl)
        : undefined;
    const record: GameRecord = {
      id: String(game.igdb.id),
      ...(game.steamAppId === undefined ? {} : { steamAppId: game.steamAppId, storeUrl: `https://store.steampowered.com/app/${game.steamAppId}/` }),
      name: game.igdb.name,
      ...(coverUrl ? { coverUrl } : {}),
      ...(game.igdb.franchise?.name ?? game.igdb.collection?.name ? { franchise: game.igdb.franchise?.name ?? game.igdb.collection?.name } : {}),
      releaseDate: date,
      players,
      sessionShape: classifySessionShape({ genres: (game.igdb.genres ?? []).flatMap((genre) => genre.name ? [genre.name] : []), tags: tagNames }, knowledge.sessionRules),
      viewerPlayable: resolveViewerPlayable(String(game.igdb.id), tagNames, knowledge.viewerPlayable),
      vibes: deriveRawVibes(game.tags, knowledge.tagVibes),
      buzz: {
        twitchViewers: game.twitch.viewers,
        twitchChannels: game.twitch.channels,
        viewerGrowth7d: null,
        isNewRelease: deriveIsNewRelease(date, generatedAt),
        demandShare: demandShares.get(String(game.igdb.id)) ?? 0,
        sources,
      },
      streaming: {
        totalViewers: game.twitch.viewers,
        channelCount: game.twitch.channels,
        medianViewersPerChannel: game.twitch.medianViewersPerChannel ?? null,
        p75ViewersPerChannel: game.twitch.p75ViewersPerChannel ?? null,
        top10ViewerShare: game.twitch.top10ViewerShare ?? null,
        viewerConcentration: game.twitch.viewerConcentration ?? null,
        growth7d: null,
        growth30d: null,
        growth90d: null,
        volatility30d: null,
        observedSnapshots: 0,
        coverage: game.twitch.coverage ?? 0,
        asOf: generatedAt,
      },
      topTags: game.tags.slice(0, 8).map(({ name, share }) => ({ tag: name, share })),
      ...reviewFields(game),
    };
    return [record];
  });
  const normalized = normalizeVibes(Object.fromEntries(candidates.map((game) => [game.id, game.vibes])));
  return candidates.map((game) => ({ ...game, vibes: normalized[game.id] }));
}
