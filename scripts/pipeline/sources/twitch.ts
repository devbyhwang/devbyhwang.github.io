import { summarizeStreams } from "../metrics/streaming";
import type { HttpClient, StreamObservation, TwitchFetchInput, TwitchRawSnapshot, TwitchStreamStat, TwitchTopGame } from "../model";

const OAUTH_URL = "https://id.twitch.tv/oauth2/token";
const HELIX_URL = "https://api.twitch.tv/helix";
const DEFAULT_STREAM_PAGE_LIMIT = 20;

type OAuthResponse = { access_token: string };
type TwitchGameResponse = {
  data?: Array<{ id?: string; name?: string; igdb_id?: string; box_art_url?: string }>;
  pagination?: { cursor?: string };
};
type TwitchStreamResponse = {
  data?: Array<{ user_id?: string; viewer_count?: number; language?: string; game_id?: string }>;
  pagination?: { cursor?: string };
};

async function token(input: TwitchFetchInput, http: HttpClient): Promise<string> {
  const body = new URLSearchParams({
    client_id: input.clientId,
    client_secret: input.clientSecret,
    grant_type: "client_credentials",
  }).toString();
  const response = await http.postJson<OAuthResponse>(OAUTH_URL, body, { "Content-Type": "application/x-www-form-urlencoded" });
  if (!response.access_token) throw new Error("Twitch OAuth response did not contain an access token");
  return response.access_token;
}

function headers(clientId: string, accessToken: string): Record<string, string> {
  return { "Client-Id": clientId, Authorization: `Bearer ${accessToken}` };
}

function query(path: string, params: Record<string, string | undefined>): string {
  const values = Object.entries(params).filter(([, value]) => value !== undefined) as Array<[string, string]>;
  return `${HELIX_URL}${path}?${new URLSearchParams(values).toString()}`;
}

function gamesByIgdbQuery(ids: string[]): string {
  const params = new URLSearchParams();
  for (const id of ids) params.append("igdb_id", id);
  return `${HELIX_URL}/games?${params.toString()}`;
}

function numericIgdbId(value: string | undefined): number | undefined {
  if (!value) return undefined;
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : undefined;
}

export async function fetchTwitch(input: TwitchFetchInput, http: HttpClient): Promise<TwitchRawSnapshot> {
  const accessToken = await token(input, http);
  const authHeaders = headers(input.clientId, accessToken);
  const responses: unknown[] = [];
  const warnings: string[] = [];
  const topByIgdbId = new Map<number, TwitchTopGame>();
  let cursor: string | undefined;

  while (topByIgdbId.size < input.topGameLimit || input.topGameLimit <= 0) {
    const page = await http.getJson<TwitchGameResponse>(query("/games/top", { first: "100", after: cursor }), authHeaders);
    await input.recordResponse?.(page);
    responses.push(page);
    for (const game of page.data ?? []) {
      const igdbId = numericIgdbId(game.igdb_id);
      if (game.id && game.name && igdbId !== undefined) {
        topByIgdbId.set(igdbId, {
          categoryId: game.id,
          name: game.name,
          igdbId,
          ...(game.box_art_url?.trim() ? { boxArtUrl: game.box_art_url } : {}),
        });
      } else if (game.id && game.name) {
        warnings.push(`Twitch category ${game.id} (${game.name}) is missing an IGDB id`);
      }
    }
    cursor = page.pagination?.cursor;
    if (!cursor || (input.topGameLimit > 0 && topByIgdbId.size >= input.topGameLimit)) break;
  }

  const topGames = [...topByIgdbId.values()].slice(0, Math.max(0, input.topGameLimit));
  for (let index = 0; index < topGames.length; index += 100) {
    const ids = topGames.slice(index, index + 100).map((game) => String(game.igdbId));
    const response = await http.getJson<TwitchGameResponse>(gamesByIgdbQuery(ids), authHeaders);
    await input.recordResponse?.(response);
    responses.push(response);
    const details = new Map((response.data ?? []).flatMap((game) => {
      const igdbId = numericIgdbId(game.igdb_id);
      return igdbId !== undefined && game.id
        ? [[igdbId, { categoryId: game.id, boxArtUrl: game.box_art_url }] as const]
        : [];
    }));
    for (const game of topGames) {
      const detail = details.get(Number(game.igdbId));
      if (!detail) continue;
      game.categoryId = detail.categoryId;
      if (detail.boxArtUrl?.trim()) game.boxArtUrl = detail.boxArtUrl;
    }
  }

  const streamPageLimit = input.streamPageLimit > 0 ? input.streamPageLimit : DEFAULT_STREAM_PAGE_LIMIT;
  const streams: TwitchStreamStat[] = [];
  const streamObservations: StreamObservation[] = [];
  let truncated = false;
  for (const game of topGames) {
    const observations: StreamObservation[] = [];
    let streamCursor: string | undefined;
    let pages = 0;
    do {
      const response = await http.getJson<TwitchStreamResponse>(query("/streams", { game_id: game.categoryId, first: "100", after: streamCursor }), authHeaders);
      await input.recordResponse?.(response);
      responses.push(response);
      observations.push(...(response.data ?? []).map((stream) => ({
        categoryId: game.categoryId,
        gameId: stream.game_id ?? game.categoryId,
        igdbId: game.igdbId,
        viewerCount: stream.viewer_count ?? 0,
        ...(stream.user_id ? { userId: stream.user_id } : {}),
        language: stream.language ?? "en",
      })));
      pages += 1;
      streamCursor = response.pagination?.cursor;
    } while (streamCursor && pages < streamPageLimit);
    if (streamCursor) {
      truncated = true;
      warnings.push(`Twitch stream pages truncated for category ${game.categoryId}`);
    }
    const summary = summarizeStreams(observations, streamCursor ? pages / (pages + 1) : 1);
    streamObservations.push(...observations);
    streams.push({
      categoryId: game.categoryId,
      igdbId: game.igdbId,
      viewers: summary.totalViewers,
      channels: summary.channelCount,
      medianViewersPerChannel: summary.medianViewersPerChannel,
      p75ViewersPerChannel: summary.p75ViewersPerChannel,
      top10ViewerShare: summary.top10ViewerShare,
      viewerConcentration: summary.viewerConcentration,
      coverage: summary.coverage,
    });
  }

  return {
    fetchedAt: new Date().toISOString(),
    source: "twitch",
    request: { endpoints: [`${HELIX_URL}/games/top`, `${HELIX_URL}/games`, `${HELIX_URL}/streams`], topGameLimit: input.topGameLimit, streamPageLimit },
    responses,
    warnings,
    topGames,
    streams,
    streamObservations,
    truncated,
  };
}
