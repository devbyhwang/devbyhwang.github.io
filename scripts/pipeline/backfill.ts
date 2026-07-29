import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import type { BackfillOptions, BackfillResult, IgdbGame } from "./model";
import { createHttpClient, saveRaw } from "./http";
import { QUERY_LIMIT, fetchIgdb } from "./sources/igdb";

type PartitionStatus = "pending" | "complete";

type PartitionCheckpoint = {
  status: PartitionStatus;
  nextOffset: number;
  updatedAt: string;
};

type CheckpointFile = {
  version: 1;
  partitions: Record<string, PartitionCheckpoint>;
};

const CHECKPOINT_VERSION = 1;

function checkpointPath(rootDir: string): string {
  return resolve(rootDir, "data/checkpoints/igdb.json");
}

function parseDay(value: string, label: string): Date {
  const date = new Date(`${value}T00:00:00.000Z`);
  if (value !== date.toISOString().slice(0, 10)) throw new Error(`invalid ${label}: ${value}`);
  return date;
}

function isoTimestamp(value: string, label: string): string {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime()) || date.toISOString() !== value) throw new Error(`invalid ${label}: ${value}`);
  return value;
}

function partitionKey(start: string, end: string): string {
  return `${start}/${end}`;
}

function nextYear(date: Date): Date {
  return new Date(Date.UTC(date.getUTCFullYear() + 1, date.getUTCMonth(), date.getUTCDate()));
}

function compareDay(left: string, right: string): number {
  return parseDay(left, "partition boundary").getTime() - parseDay(right, "partition boundary").getTime();
}

function yearlyPartitions(start: string, end: string): Array<{ key: string; start: string; end: string }> {
  const partitions: Array<{ key: string; start: string; end: string }> = [];
  let cursor = parseDay(start, "partitionStart");
  const final = parseDay(end, "partitionEnd");
  if (cursor.getTime() >= final.getTime()) throw new Error(`partitionStart must be before partitionEnd: ${start} >= ${end}`);
  while (cursor.getTime() < final.getTime()) {
    const partitionStart = cursor.toISOString().slice(0, 10);
    const next = nextYear(cursor);
    const partitionEndDate = next.getTime() < final.getTime() ? next : final;
    const partitionEnd = partitionEndDate.toISOString().slice(0, 10);
    partitions.push({ key: partitionKey(partitionStart, partitionEnd), start: partitionStart, end: partitionEnd });
    cursor = partitionEndDate;
  }
  return partitions;
}

function validatePartition(key: string, value: PartitionCheckpoint): PartitionCheckpoint {
  const [start, end] = key.split("/");
  if (!start || !end) throw new Error(`invalid checkpoint partition key: ${key}`);
  if (compareDay(start, end) >= 0) throw new Error(`invalid checkpoint partition boundaries: ${key}`);
  if (value.status !== "pending" && value.status !== "complete") throw new Error(`invalid checkpoint partition status for ${key}`);
  if (!Number.isInteger(value.nextOffset) || value.nextOffset < 0) throw new Error(`invalid checkpoint nextOffset for ${key}`);
  isoTimestamp(value.updatedAt, `checkpoint updatedAt for ${key}`);
  return value;
}

function loadCheckpoint(rootDir: string): CheckpointFile {
  const path = checkpointPath(rootDir);
  if (!existsSync(path)) return { version: CHECKPOINT_VERSION, partitions: {} };
  const parsed = JSON.parse(readFileSync(path, "utf8")) as CheckpointFile;
  if (parsed.version !== CHECKPOINT_VERSION) throw new Error(`unsupported IGDB checkpoint version: ${String(parsed.version)}`);
  if (!parsed.partitions || typeof parsed.partitions !== "object" || Array.isArray(parsed.partitions)) {
    throw new Error("invalid IGDB checkpoint partitions");
  }
  return {
    version: CHECKPOINT_VERSION,
    partitions: Object.fromEntries(Object.entries(parsed.partitions).map(([key, value]) => [key, validatePartition(key, value)])),
  };
}

async function persistCheckpoint(rootDir: string, checkpoint: CheckpointFile): Promise<void> {
  await saveRaw(checkpointPath(rootDir), checkpoint);
}

function ensurePartitions(
  checkpoint: CheckpointFile,
  partitions: Array<{ key: string; start: string; end: string }>,
  asOf: string,
): boolean {
  let changed = false;
  for (const partition of partitions) {
    if (checkpoint.partitions[partition.key]) continue;
    checkpoint.partitions[partition.key] = { status: "pending", nextOffset: 0, updatedAt: asOf };
    changed = true;
  }
  return changed;
}

function validCatalogGames(games: IgdbGame[]): { ids: number[]; missingReleaseDates: number } {
  const ids: number[] = [];
  let missingReleaseDates = 0;
  for (const game of games) {
    if (!Number.isFinite(game.first_release_date)) {
      missingReleaseDates += 1;
      continue;
    }
    ids.push(game.id);
  }
  return { ids, missingReleaseDates };
}

function inPartition(game: IgdbGame, partitionStart: number, partitionEnd: number): boolean {
  if (!Number.isFinite(game.first_release_date)) return false;
  return (game.first_release_date as number) >= partitionStart && (game.first_release_date as number) < partitionEnd;
}

export async function runBackfill(options: BackfillOptions): Promise<BackfillResult> {
  const asOf = isoTimestamp(options.asOf, "backfill asOf");
  const partitions = yearlyPartitions(options.partitionStart, options.partitionEnd);
  const checkpoint = loadCheckpoint(options.rootDir);
  if (ensurePartitions(checkpoint, partitions, asOf)) await persistCheckpoint(options.rootDir, checkpoint);

  const seenGameIds = new Set<number>();
  let missingReleaseDates = 0;
  const http = createHttpClient(options.fetcher ?? fetch);

  for (const partition of partitions) {
    const state = checkpoint.partitions[partition.key];
    if (state.status === "complete") continue;
    const partitionStart = Math.floor(parseDay(partition.start, "partitionStart").getTime() / 1_000);
    const partitionEnd = Math.floor(parseDay(partition.end, "partitionEnd").getTime() / 1_000);

    let offset = state.nextOffset;
    while (true) {
      const snapshot = await fetchIgdb({
        clientId: options.clientId,
        clientSecret: options.clientSecret,
        asOf,
        recentDays: 0,
        topIgdbIds: [],
        steamAppIds: [],
        partitionStart: partition.start,
        partitionEnd: partition.end,
        offset,
        recordResponse: options.recordResponse,
      }, http);
      const rawGameCount = snapshot.games.length;
      const partitionGames = snapshot.games.filter((game) => inPartition(game, partitionStart, partitionEnd));
      await options.recordSnapshot?.({ ...snapshot, games: partitionGames });
      const { ids } = validCatalogGames(partitionGames);
      const { missingReleaseDates: missingForPage } = validCatalogGames(snapshot.games);
      missingReleaseDates += missingForPage;
      for (const id of ids) seenGameIds.add(id);

      const nextOffset = Math.max(state.nextOffset, offset + rawGameCount);
      if (rawGameCount < QUERY_LIMIT) {
        checkpoint.partitions[partition.key] = { status: "complete", nextOffset, updatedAt: asOf };
        await persistCheckpoint(options.rootDir, checkpoint);
        break;
      }

      checkpoint.partitions[partition.key] = { status: "pending", nextOffset, updatedAt: asOf };
      await persistCheckpoint(options.rootDir, checkpoint);
      offset = nextOffset;
    }
  }

  if (missingReleaseDates > 0) {
    console.warn(`excluded ${missingReleaseDates} IGDB games without first_release_date from the recommendation catalog`);
  }

  return {
    completedPartitions: partitions
      .map((partition) => partition.key)
      .filter((key) => checkpoint.partitions[key]?.status === "complete"),
    fetchedGameCount: seenGameIds.size,
    remainingPartitions: partitions
      .map((partition) => partition.key)
      .filter((key) => checkpoint.partitions[key]?.status !== "complete"),
  };
}
