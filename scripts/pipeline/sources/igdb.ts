import type { HttpClient, IgdbExternalGame, IgdbFetchInput, IgdbGame, IgdbRawSnapshot } from "../model";

const OAUTH_URL = "https://id.twitch.tv/oauth2/token";
const GAMES_URL = "https://api.igdb.com/v4/games";
const EXTERNAL_GAMES_URL = "https://api.igdb.com/v4/external_games";
export const QUERY_LIMIT = 500;
const gameFields = [
  "id",
  "name",
  "first_release_date",
  "cover.image_id",
  "external_games.uid",
  "external_games.external_game_source",
  "game_type",
  "parent_game",
  "version_parent",
  "platforms.name",
  "collection.name",
  "franchise.name",
  "genres.name",
  "themes.name",
  "game_modes.name",
  "multiplayer_modes.*",
  "rating",
  "rating_count",
  "aggregated_rating",
  "aggregated_rating_count",
  "total_rating",
  "total_rating_count",
].join(",");

type OAuthResponse = { access_token: string };

function epochSeconds(iso: string): number {
  const value = Date.parse(iso);
  if (Number.isNaN(value)) throw new Error(`invalid asOf timestamp: ${iso}`);
  return Math.floor(value / 1_000);
}

function epochDay(value: string, label: "partitionStart" | "partitionEnd"): number {
  const iso = `${value}T00:00:00.000Z`;
  const date = new Date(iso);
  if (value !== date.toISOString().slice(0, 10)) throw new Error(`invalid ${label} date: ${value}`);
  return Math.floor(date.getTime() / 1_000);
}

function releaseDatePredicate(partitionStart: string, partitionEnd: string): string {
  const start = epochDay(partitionStart, "partitionStart");
  const end = epochDay(partitionEnd, "partitionEnd");
  if (start < 0) {
    const startYear = Number(partitionStart.slice(0, 4));
    const endYear = Number(partitionEnd.slice(0, 4));
    const endYearExclusive = partitionEnd.endsWith("-01-01") ? endYear : endYear + 1;
    return `release_dates.y >= ${startYear} & release_dates.y < ${endYearExclusive}`;
  }
  return `first_release_date >= ${start} & first_release_date < ${end}`;
}

async function token(input: IgdbFetchInput, http: HttpClient): Promise<string> {
  const body = new URLSearchParams({
    client_id: input.clientId,
    client_secret: input.clientSecret,
    grant_type: "client_credentials",
  }).toString();
  const response = await http.postJson<OAuthResponse>(OAUTH_URL, body, { "Content-Type": "application/x-www-form-urlencoded" });
  if (!response.access_token) throw new Error("IGDB OAuth response did not contain an access token");
  return response.access_token;
}

function headers(clientId: string, accessToken: string): Record<string, string> {
  return {
    "Client-ID": clientId,
    Authorization: `Bearer ${accessToken}`,
    Accept: "application/json",
  };
}

function asGames(value: unknown): IgdbGame[] {
  return Array.isArray(value) ? value as IgdbGame[] : [];
}

function asExternalGames(value: unknown): IgdbExternalGame[] {
  return Array.isArray(value) ? value as IgdbExternalGame[] : [];
}

function batches(values: number[]): number[][] {
  const result: number[][] = [];
  for (let index = 0; index < values.length; index += QUERY_LIMIT) {
    result.push(values.slice(index, index + QUERY_LIMIT));
  }
  return result;
}

async function requestGamesByIds(
  ids: number[],
  http: HttpClient,
  authHeaders: Record<string, string>,
  responses: unknown[],
  recordResponse?: IgdbFetchInput["recordResponse"],
): Promise<IgdbGame[]> {
  const games = new Map<number, IgdbGame>();
  for (const batch of batches(ids)) {
    const response = await http.postJson<unknown>(
      GAMES_URL,
      `fields ${gameFields}; where id = (${batch.join(",")}); limit ${batch.length};`,
      authHeaders,
    );
    await recordResponse?.(response);
    responses.push(response);
    for (const game of asGames(response)) games.set(game.id, game);
  }
  return [...games.values()];
}

async function requestRecentGames(
  recentStart: number,
  now: number,
  http: HttpClient,
  authHeaders: Record<string, string>,
  responses: unknown[],
  recordResponse?: IgdbFetchInput["recordResponse"],
): Promise<IgdbGame[]> {
  const games = new Map<number, IgdbGame>();
  for (let offset = 0; ; offset += QUERY_LIMIT) {
    const body = `fields ${gameFields}; where first_release_date >= ${recentStart} & first_release_date <= ${now} & rating_count >= 5; limit ${QUERY_LIMIT}; offset ${offset};`;
    const response = await http.postJson<unknown>(GAMES_URL, body, authHeaders);
    await recordResponse?.(response);
    responses.push(response);
    const page = asGames(response);
    for (const game of page) games.set(game.id, game);
    if (page.length < QUERY_LIMIT) break;
  }
  return [...games.values()];
}

async function requestPartitionGames(
  partitionStart: string,
  partitionEnd: string,
  offset: number,
  http: HttpClient,
  authHeaders: Record<string, string>,
  responses: unknown[],
  recordResponse?: IgdbFetchInput["recordResponse"],
): Promise<IgdbGame[]> {
  const body = `fields ${gameFields}; where ${releaseDatePredicate(partitionStart, partitionEnd)}; sort first_release_date asc, id asc; limit ${QUERY_LIMIT}; offset ${offset};`;
  const response = await http.postJson<unknown>(GAMES_URL, body, authHeaders);
  await recordResponse?.(response);
  responses.push(response);
  return asGames(response);
}

async function requestExternalGames(
  steamAppIds: number[],
  http: HttpClient,
  authHeaders: Record<string, string>,
  responses: unknown[],
  recordResponse?: IgdbFetchInput["recordResponse"],
): Promise<IgdbExternalGame[]> {
  const externalGames = new Map<string, IgdbExternalGame>();
  for (const batch of batches(steamAppIds)) {
    for (let offset = 0; ; offset += QUERY_LIMIT) {
      const response = await http.postJson<unknown>(
        EXTERNAL_GAMES_URL,
        `fields id,game,uid,external_game_source; where uid = (${batch.join(",")}) & external_game_source = 1; limit ${QUERY_LIMIT}; offset ${offset};`,
        authHeaders,
      );
      await recordResponse?.(response);
      responses.push(response);
      const page = asExternalGames(response).filter((game) => game.external_game_source === 1);
      for (const game of page) {
        const key = Number.isFinite(game.id) ? `id:${game.id}` : `mapping:${game.game}:${game.uid}:${game.external_game_source}`;
        externalGames.set(key, game);
      }
      if (page.length < QUERY_LIMIT) break;
    }
  }
  return [...externalGames.values()];
}

export async function fetchIgdb(input: IgdbFetchInput, http: HttpClient): Promise<IgdbRawSnapshot> {
  const accessToken = await token(input, http);
  const authHeaders = headers(input.clientId, accessToken);
  const responses: unknown[] = [];
  const warnings: string[] = [];

  if (input.partitionStart || input.partitionEnd) {
    if (!input.partitionStart || !input.partitionEnd) throw new Error("IGDB partition fetch requires both partitionStart and partitionEnd");
    const games = await requestPartitionGames(
      input.partitionStart,
      input.partitionEnd,
      input.offset ?? 0,
      http,
      authHeaders,
      responses,
      input.recordResponse,
    );
    return {
      fetchedAt: new Date().toISOString(),
      source: "igdb",
      request: {
        endpoints: [GAMES_URL],
        asOf: input.asOf,
        partitionStart: input.partitionStart,
        partitionEnd: input.partitionEnd,
        offset: input.offset ?? 0,
      },
      responses,
      warnings,
      games,
      externalGames: [],
      unresolvedSteamAppIds: [],
    };
  }

  const now = epochSeconds(input.asOf);
  const recentStart = now - input.recentDays * 86_400;

  const recentGames = await requestRecentGames(recentStart, now, http, authHeaders, responses, input.recordResponse);
  const gamesById = new Map(recentGames.map((game) => [game.id, game]));

  const topIds = [...new Set(input.topIgdbIds.map(Number).filter((id) => Number.isInteger(id) && id > 0))];
  if (topIds.length > 0) {
    for (const game of await requestGamesByIds(topIds, http, authHeaders, responses, input.recordResponse)) gamesById.set(game.id, game);
  }

  const steamAppIds = [...new Set(input.steamAppIds.filter((id) => Number.isInteger(id) && id > 0))];
  let externalGames: IgdbExternalGame[] = [];
  if (steamAppIds.length > 0) {
    externalGames = await requestExternalGames(steamAppIds, http, authHeaders, responses, input.recordResponse);
  }
  const mappedGameIds = [...new Set(externalGames.map((game) => game.game).filter(Number.isFinite))]
    .filter((gameId) => !gamesById.has(gameId));
  if (mappedGameIds.length > 0) {
    for (const game of await requestGamesByIds(mappedGameIds, http, authHeaders, responses, input.recordResponse)) gamesById.set(game.id, game);
  }
  const resolvedSteamIds = new Set(externalGames.map((game) => Number(game.uid)));
  const unresolvedSteamAppIds = steamAppIds.filter((appId) => !resolvedSteamIds.has(appId));
  if (unresolvedSteamAppIds.length > 0) warnings.push(`unresolved Steam app ids: ${unresolvedSteamAppIds.join(",")}`);

  return {
    fetchedAt: new Date().toISOString(),
    source: "igdb",
    request: { endpoints: [GAMES_URL, EXTERNAL_GAMES_URL], asOf: input.asOf, recentDays: input.recentDays, topIgdbIds: topIds, steamAppIds },
    responses,
    warnings,
    games: [...gamesById.values()],
    externalGames,
    unresolvedSteamAppIds,
  };
}
