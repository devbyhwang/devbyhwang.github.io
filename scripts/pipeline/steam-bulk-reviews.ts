import { existsSync, readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import type { SteamSpyAllEntry } from "./model";

function allDirectory(rootDir: string): string {
  return resolve(rootDir, "data", "raw", "steam", "all");
}

/**
 * Loads the SteamSpy bulk backfill (`data/raw/steam/all/*.json`, one snapshot per fetched
 * page) into an appId -> review-count map, keeping the last-seen entry per appId across
 * files sorted by filename. Unlike `scripts/analyze-steam-overlap.ts` (which this mirrors),
 * a missing directory returns an empty Map instead of throwing: this runs on every pipeline
 * invocation, including fixtures and fresh checkouts that never ran the backfill.
 */
export function loadSteamSpyBulkReviews(rootDir: string): Map<number, { positive: number; negative: number }> {
  const directory = allDirectory(rootDir);
  const reviews = new Map<number, { positive: number; negative: number }>();
  if (!existsSync(directory)) return reviews;

  for (const file of readdirSync(directory).filter((name) => name.endsWith(".json")).sort()) {
    const path = resolve(directory, file);
    const snapshot = JSON.parse(readFileSync(path, "utf8")) as { entries?: SteamSpyAllEntry[] };
    for (const entry of snapshot.entries ?? []) {
      if (!entry || typeof entry !== "object" || !Number.isInteger(entry.appId)) continue;
      reviews.set(entry.appId, { positive: entry.positive, negative: entry.negative });
    }
  }
  return reviews;
}
