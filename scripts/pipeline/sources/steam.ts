import { readFile } from "node:fs/promises";
import type { HttpClient, SteamApp, SteamFetchInput, SteamRawSnapshot } from "../model";
import { saveRaw } from "../http";

const FEATURED_URL = "https://store.steampowered.com/api/featuredcategories/";
const STEAM_SPY_URL = "https://steamspy.com/api.php?request=appdetails&appid=";
const STORE_APPDETAILS_URL = "https://store.steampowered.com/api/appdetails";
const DEFAULT_CACHE_PATH = "data/raw/steam/latest.json";

type FeaturedResponse = { top_sellers?: { items?: Array<{ id?: number }> } };

function numberValue(value: unknown): number {
  const number = typeof value === "number" ? value : Number(value);
  return Number.isFinite(number) ? number : 0;
}

function steamApp(value: unknown, categories: string[] = []): SteamApp | null {
  if (!value || typeof value !== "object") return null;
  const record = value as Record<string, unknown>;
  const appId = numberValue(record.appid);
  if (appId <= 0) return null;
  const tagEntries = record.tags && typeof record.tags === "object" ? Object.entries(record.tags as Record<string, unknown>) : [];
  return {
    appId,
    name: typeof record.name === "string" ? record.name : undefined,
    tags: Object.fromEntries(tagEntries.map(([name, count]) => [name, numberValue(count)])),
    positive: numberValue(record.positive),
    negative: numberValue(record.negative),
    owners: typeof record.owners === "string" ? record.owners : "",
    price: typeof record.price === "string" ? record.price : String(numberValue(record.price)),
    discount: typeof record.discount === "string" ? record.discount : String(numberValue(record.discount)),
    categories,
  };
}

async function cachedSnapshot(path: string): Promise<{ responses: unknown[]; apps: SteamApp[] }> {
  try {
    const value = JSON.parse(await readFile(path, "utf8")) as { responses?: unknown[]; apps?: SteamApp[] };
    return {
      responses: Array.isArray(value.responses) ? value.responses : [],
      apps: Array.isArray(value.apps) ? value.apps : [],
    };
  } catch {
    return { responses: [], apps: [] };
  }
}

function cachedApp(responses: unknown[], appId: number): unknown | undefined {
  return responses.find((response) => steamApp(response)?.appId === appId);
}

function storeCategories(value: unknown, appId: number): string[] {
  if (!value || typeof value !== "object") return [];
  const entry = (value as Record<string, unknown>)[String(appId)];
  if (!entry || typeof entry !== "object") return [];
  const data = (entry as { success?: unknown; data?: unknown }).data;
  if ((entry as { success?: unknown }).success !== true || !data || typeof data !== "object") return [];
  const categories = (data as { categories?: unknown }).categories;
  if (!Array.isArray(categories)) return [];
  return categories.flatMap((category) => {
    if (!category || typeof category !== "object") return [];
    const description = (category as { description?: unknown }).description;
    return typeof description === "string" && description.trim() ? [description] : [];
  });
}

function storeUrl(appId: number): string {
  return `${STORE_APPDETAILS_URL}?${new URLSearchParams({
    appids: String(appId),
    filters: "categories",
    cc: "us",
    l: "english",
  }).toString()}`;
}

export async function fetchSteam(input: SteamFetchInput, http: HttpClient): Promise<SteamRawSnapshot> {
  const cachePath = input.cachePath ?? DEFAULT_CACHE_PATH;
  const cached = await cachedSnapshot(cachePath);
  const featured = input.featured
    ? input.featured.response as FeaturedResponse | undefined
    : await http.getJson<FeaturedResponse>(FEATURED_URL);
  if (!input.featured) await input.recordResponse?.(featured);
  const topSellerAppIds = input.featured?.topSellerAppIds
    ?? (featured?.top_sellers?.items ?? []).flatMap((item) => typeof item.id === "number" ? [item.id] : []);
  const appIds = [...new Set([
    ...(input.includeTopSellers === false ? [] : topSellerAppIds),
    ...input.steamAppIds,
  ])];
  const responses: unknown[] = input.featured ? [] : [featured];
  const warnings: string[] = [];
  const staleSources: string[] = [];
  const apps: SteamApp[] = [];

  for (const appId of appIds) {
    let app: SteamApp | null;
    try {
      const response = await http.getJson<unknown>(`${STEAM_SPY_URL}${appId}`);
      await input.recordResponse?.(response);
      app = steamApp(response);
      if (!app) throw new Error(`SteamSpy appdetails response for appid ${appId} is invalid`);
      responses.push(response);
    } catch (error) {
      const response = cachedApp(cached.responses, appId);
      if (!response) {
        warnings.push(`omitting SteamSpy appdetails for appid ${appId} after failure without cache`);
        continue;
      }
      app = steamApp(response);
      if (!app) {
        warnings.push(`omitting SteamSpy appdetails for appid ${appId} after invalid cache`);
        continue;
      }
      staleSources.push(`steamspy:${appId}`);
      warnings.push(`using stale SteamSpy cache for appid ${appId}`);
      responses.push(response);
    }
    let categories = cached.apps.find((candidate) => candidate.appId === appId)?.categories ?? [];
    try {
      const response = await http.getJson<unknown>(storeUrl(appId));
      await input.recordResponse?.(response);
      responses.push(response);
      categories = storeCategories(response, appId);
    } catch {
      if (categories.length > 0) {
        staleSources.push(`steamstore:${appId}`);
        warnings.push(`using stale Steam Store categories for appid ${appId}`);
      } else {
        warnings.push(`Steam Store categories unavailable for appid ${appId}`);
      }
    }
    apps.push({ ...app, categories });
  }

  const snapshot: SteamRawSnapshot = {
    fetchedAt: new Date().toISOString(),
    source: "steam",
    request: { endpoints: [FEATURED_URL, STEAM_SPY_URL, STORE_APPDETAILS_URL], steamAppIds: appIds },
    responses,
    warnings,
    topSellerAppIds,
    apps,
    staleSources,
  };
  await saveRaw(cachePath, snapshot);
  return snapshot;
}

export function mergeSteamSnapshots(primary: SteamRawSnapshot, details: SteamRawSnapshot): SteamRawSnapshot {
  const apps = new Map(primary.apps.map((app) => [app.appId, app]));
  for (const app of details.apps) apps.set(app.appId, app);
  const primaryIds = Array.isArray(primary.request.steamAppIds) ? primary.request.steamAppIds.filter((id): id is number => typeof id === "number") : [];
  const detailIds = Array.isArray(details.request.steamAppIds) ? details.request.steamAppIds.filter((id): id is number => typeof id === "number") : [];
  return {
    ...details,
    request: {
      ...details.request,
      steamAppIds: [...new Set([...primaryIds, ...detailIds])],
    },
    topSellerAppIds: primary.topSellerAppIds,
    responses: [...primary.responses, ...details.responses],
    warnings: [...primary.warnings, ...details.warnings],
    staleSources: [...new Set([...primary.staleSources, ...details.staleSources])],
    apps: [...apps.values()],
  };
}
