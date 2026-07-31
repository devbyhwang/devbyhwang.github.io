import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { createHttpClient, saveRaw } from "./http";
import { fetchSteamSpyPage } from "./sources/steamspy-all";
import type { SteamSpyPage } from "./model";

const CHECKPOINT_VERSION = 1;
/** SteamSpy throttles `request=all`; one request per minute is the documented ceiling. */
const DEFAULT_REQUEST_INTERVAL_MS = 60_000;

type SteamCheckpoint = {
  version: typeof CHECKPOINT_VERSION;
  nextPage: number;
  status: "pending" | "complete";
  updatedAt: string;
};

export type SteamBackfillOptions = {
  rootDir: string;
  asOf: string;
  fetcher?: typeof fetch;
  requestIntervalMs?: number;
  maxPages?: number;
  recordPage?: (page: SteamSpyPage) => Promise<void>;
};

export type SteamBackfillResult = {
  fetchedPages: number;
  fetchedApps: number;
  nextPage: number;
  status: "complete" | "pending";
  blocked: boolean;
};

function checkpointPath(rootDir: string): string {
  return resolve(rootDir, "data/checkpoints/steamspy.json");
}

function snapshotPath(rootDir: string, page: number): string {
  return resolve(rootDir, "data/raw/steam/all", `${page.toString().padStart(4, "0")}.json`);
}

function loadCheckpoint(rootDir: string): SteamCheckpoint {
  const path = checkpointPath(rootDir);
  if (!existsSync(path)) {
    return { version: CHECKPOINT_VERSION, nextPage: 0, status: "pending", updatedAt: new Date(0).toISOString() };
  }
  const parsed = JSON.parse(readFileSync(path, "utf8")) as SteamCheckpoint;
  if (parsed.version !== CHECKPOINT_VERSION) throw new Error(`unsupported SteamSpy checkpoint version: ${String(parsed.version)}`);
  if (!Number.isInteger(parsed.nextPage) || parsed.nextPage < 0) throw new Error("invalid SteamSpy checkpoint nextPage");
  if (parsed.status !== "pending" && parsed.status !== "complete") throw new Error("invalid SteamSpy checkpoint status");
  return parsed;
}

async function persist(rootDir: string, checkpoint: SteamCheckpoint): Promise<void> {
  await saveRaw(checkpointPath(rootDir), checkpoint);
}

async function pause(ms: number): Promise<void> {
  if (ms > 0) await new Promise<void>((done) => setTimeout(done, ms));
}

export async function runSteamBackfill(options: SteamBackfillOptions): Promise<SteamBackfillResult> {
  const checkpoint = loadCheckpoint(options.rootDir);
  if (checkpoint.status === "complete") {
    return { fetchedPages: 0, fetchedApps: 0, nextPage: checkpoint.nextPage, status: "complete", blocked: false };
  }

  const http = createHttpClient(options.fetcher ?? fetch);
  const interval = options.requestIntervalMs ?? DEFAULT_REQUEST_INTERVAL_MS;
  let page = checkpoint.nextPage;
  let fetchedPages = 0;
  let fetchedApps = 0;

  while (options.maxPages === undefined || fetchedPages < options.maxPages) {
    if (fetchedPages > 0) await pause(interval);
    const result = await fetchSteamSpyPage(page, http);

    if (result.outcome === "blocked") {
      // Unknown whether more pages exist — leave the checkpoint pending so the
      // next run retries this page rather than freezing coverage here.
      await persist(options.rootDir, { version: CHECKPOINT_VERSION, nextPage: page, status: "pending", updatedAt: options.asOf });
      return { fetchedPages, fetchedApps, nextPage: page, status: "pending", blocked: true };
    }

    await saveRaw(snapshotPath(options.rootDir, page), {
      fetchedAt: options.asOf,
      source: "steamspy",
      request: { page },
      entries: result.entries,
    });
    await options.recordPage?.(result);
    fetchedPages += 1;
    fetchedApps += result.entries.length;
    page += 1;

    const status = result.outcome === "end" ? "complete" : "pending";
    await persist(options.rootDir, { version: CHECKPOINT_VERSION, nextPage: page, status, updatedAt: options.asOf });
    if (status === "complete") {
      return { fetchedPages, fetchedApps, nextPage: page, status: "complete", blocked: false };
    }
  }

  return { fetchedPages, fetchedApps, nextPage: page, status: "pending", blocked: false };
}
