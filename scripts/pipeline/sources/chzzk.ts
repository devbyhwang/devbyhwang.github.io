import type { ChzzkCategoryStat, ChzzkFetchInput, ChzzkRawSnapshot, HttpClient } from "../model";

const LIVES_URL = "https://openapi.chzzk.naver.com/open/v1/lives";
const PAGE_SIZE = 20;
const MAX_RATE_LIMIT_RETRIES = 3;

type ChzzkLive = {
  liveCategoryType?: string;
  liveCategoryValue?: string;
  liveCategory?: string;
  concurrentUserCount?: number;
  channelId?: string;
};

type ChzzkLivesResponse = {
  content?: {
    data?: ChzzkLive[];
    next?: string;
  };
};

type CategoryAggregate = ChzzkCategoryStat & { channelIds: Set<string> };

function requestUrl(cursor: string | undefined): string {
  const query = new URLSearchParams({ size: String(PAGE_SIZE) });
  if (cursor) query.set("next", cursor);
  return `${LIVES_URL}?${query.toString()}`;
}

function retryAfterMs(value: string | undefined): number {
  if (!value) return 1_000;
  const seconds = Number(value);
  if (Number.isFinite(seconds) && seconds >= 0) return seconds * 1_000;
  const date = Date.parse(value);
  return Number.isNaN(date) ? 1_000 : Math.max(0, date - Date.now());
}

async function requestPage(http: HttpClient, url: string, headers: Record<string, string>): Promise<ChzzkLivesResponse> {
  if (!http.getJsonResponse) return http.getJson<ChzzkLivesResponse>(url, headers);
  for (let attempt = 0; ; attempt += 1) {
    const response = await http.getJsonResponse<ChzzkLivesResponse>(url, headers);
    if (response.status >= 200 && response.status < 300 && response.data !== undefined) return response.data;
    if (response.status !== 429 || attempt >= MAX_RATE_LIMIT_RETRIES) {
      throw new Error(`${url}: ${response.status}`);
    }
    await new Promise<void>((resolve) => setTimeout(resolve, retryAfterMs(response.headers["retry-after"])));
  }
}

function validGame(live: ChzzkLive): live is Required<Pick<ChzzkLive, "liveCategoryValue" | "liveCategory" | "concurrentUserCount" | "channelId">> & ChzzkLive {
  return live.liveCategoryType === "GAME"
    && typeof live.liveCategoryValue === "string" && live.liveCategoryValue.length > 0
    && typeof live.liveCategory === "string" && live.liveCategory.length > 0
    && typeof live.concurrentUserCount === "number" && Number.isFinite(live.concurrentUserCount)
    && typeof live.channelId === "string" && live.channelId.length > 0;
}

export async function fetchChzzk(input: ChzzkFetchInput, http: HttpClient): Promise<ChzzkRawSnapshot> {
  const responses: unknown[] = [];
  const warnings: string[] = [];
  const categories = new Map<string, CategoryAggregate>();
  const headers = { "Client-Id": input.clientId, "Client-Secret": input.clientSecret };
  const pageLimit = Math.max(0, input.pageLimit);
  let cursor: string | undefined;
  let pages = 0;

  while (pages < pageLimit) {
    const page = await requestPage(http, requestUrl(cursor), headers);
    await input.recordResponse?.(page);
    responses.push(page);
    pages += 1;
    for (const live of page.content?.data ?? []) {
      if (!validGame(live)) continue;
      const category = categories.get(live.liveCategoryValue) ?? {
        categoryId: live.liveCategoryValue,
        name: live.liveCategory,
        viewers: 0,
        channels: 0,
        coverage: 1,
        channelIds: new Set<string>(),
      };
      category.viewers += live.concurrentUserCount;
      category.channelIds.add(live.channelId);
      category.channels = category.channelIds.size;
      categories.set(category.categoryId, category);
    }
    cursor = page.content?.next?.trim() || undefined;
    if (!cursor) break;
  }

  const truncated = cursor !== undefined;
  const coverage = truncated ? pages / (pages + 1) : 1;
  if (truncated) warnings.push("Chzzk live pages truncated");
  return {
    fetchedAt: new Date().toISOString(),
    source: "chzzk",
    request: { endpoint: LIVES_URL, pageLimit, pageSize: PAGE_SIZE },
    categories: [...categories.values()].map(({ channelIds: _channelIds, ...category }) => ({ ...category, coverage })),
    truncated,
    responses,
    warnings,
  };
}
