import type { HttpClient } from "../model";

const STEAMSPY_ALL_URL = "https://steamspy.com/api.php?request=all&page=";

/** SteamSpy returns at most this many apps per `request=all` page. */
export const STEAMSPY_PAGE_SIZE = 1000;

export type SteamSpyAllEntry = {
  appId: number;
  name?: string;
  positive: number;
  negative: number;
};

/**
 * `blocked` is deliberately distinct from `end`. A failed request tells us
 * nothing about whether more pages exist, and treating it as the end would
 * silently freeze coverage at whatever happened to be fetched.
 */
export type SteamSpyPage = {
  page: number;
  entries: SteamSpyAllEntry[];
  outcome: "ok" | "end" | "blocked";
};

function entry(value: unknown): SteamSpyAllEntry | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;
  const appId = record.appid;
  const positive = record.positive;
  const negative = record.negative;
  if (!Number.isInteger(appId) || (appId as number) <= 0) return null;
  if (!Number.isInteger(positive) || (positive as number) < 0) return null;
  if (!Number.isInteger(negative) || (negative as number) < 0) return null;
  return {
    appId: appId as number,
    ...(typeof record.name === "string" && record.name ? { name: record.name } : {}),
    positive: positive as number,
    negative: negative as number,
  };
}

export async function fetchSteamSpyPage(page: number, http: HttpClient): Promise<SteamSpyPage> {
  if (!Number.isInteger(page) || page < 0) throw new Error(`invalid SteamSpy page: ${page}`);

  let payload: unknown;
  try {
    payload = await http.getJson<unknown>(`${STEAMSPY_ALL_URL}${page}`);
  } catch {
    return { page, entries: [], outcome: "blocked" };
  }
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    return { page, entries: [], outcome: "blocked" };
  }

  const values = Object.values(payload as Record<string, unknown>);
  const entries = values.flatMap((value) => {
    const parsed = entry(value);
    return parsed ? [parsed] : [];
  });
  // Short pages end pagination; entry-level rejects must not, or one malformed
  // record would truncate the backfill.
  return { page, entries, outcome: values.length < STEAMSPY_PAGE_SIZE ? "end" : "ok" };
}
