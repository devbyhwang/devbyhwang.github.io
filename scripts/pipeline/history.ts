import { mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import type { DailySnapshot, DailySnapshots, History, JoinedGame } from "./model";

const HISTORY_DAYS = 14;

function fail(path: string, message: string): never {
  throw new Error(`${path}: ${message}`);
}

function entryPath(path: string, key: string): string {
  return `${path}[${JSON.stringify(key)}]`;
}

function isUtcDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00.000Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

/** Validates the persisted history contract for explicit operational checks. */
export function validateHistory(value: unknown, path = "history"): asserts value is History {
  if (value === null || typeof value !== "object" || Array.isArray(value)) fail(path, "must be an object");
  for (const [gameId, snapshots] of Object.entries(value)) {
    const gamePath = entryPath(path, gameId);
    if (!/^[1-9]\d*$/.test(gameId)) fail(gamePath, "game id must be a positive integer string");
    if (!Array.isArray(snapshots)) fail(gamePath, "must be an array");
    snapshots.forEach((snapshot, index) => {
      const snapshotPath = `${gamePath}[${index}]`;
      if (snapshot === null || typeof snapshot !== "object" || Array.isArray(snapshot)) fail(snapshotPath, "must be an object");
      const entry = snapshot as Record<string, unknown>;
      if (typeof entry.date !== "string" || !isUtcDate(entry.date)) fail(`${snapshotPath}.date`, "must be a UTC date");
      if (typeof entry.twitchViewers !== "number" || !Number.isFinite(entry.twitchViewers) || entry.twitchViewers < 0) {
        fail(`${snapshotPath}.twitchViewers`, "must be a non-negative finite number");
      }
      if (typeof entry.twitchChannels !== "number" || !Number.isFinite(entry.twitchChannels) || entry.twitchChannels < 0) {
        fail(`${snapshotPath}.twitchChannels`, "must be a non-negative finite number");
      }
    });
  }
}

function utcDate(asOf: string): string {
  const date = new Date(asOf);
  if (!Number.isFinite(date.getTime())) throw new Error(`invalid asOf timestamp: ${asOf}`);
  return date.toISOString().slice(0, 10);
}

function sevenDaysBefore(date: string): string {
  const value = new Date(`${date}T00:00:00.000Z`);
  value.setUTCDate(value.getUTCDate() - 7);
  return value.toISOString().slice(0, 10);
}

export function readHistory(file: string): History {
  try {
    return JSON.parse(readFileSync(file, "utf8")) as History;
  } catch (error: unknown) {
    if (typeof error === "object" && error !== null && "code" in error && error.code === "ENOENT") return {};
    throw error;
  }
}

export function appendSnapshot(history: History, snapshots: DailySnapshots): History {
  const next: History = Object.fromEntries(Object.entries(history).map(([id, entries]) => [id, [...entries]]));
  for (const [id, snapshot] of Object.entries(snapshots)) {
    next[id] = [...(next[id] ?? []).filter((entry) => entry.date !== snapshot.date), snapshot]
      .sort((left, right) => left.date.localeCompare(right.date))
      .slice(-HISTORY_DAYS);
  }
  return next;
}

export function growth7d(history: History, igdbId: string, asOf: string): number | null {
  const entries = history[igdbId];
  if (!entries) return null;
  const currentDate = utcDate(asOf);
  const current = entries.find((entry) => entry.date === currentDate);
  const baseline = entries.find((entry) => entry.date === sevenDaysBefore(currentDate));
  if (!current || !baseline || baseline.twitchViewers === 0) return null;
  return current.twitchViewers / baseline.twitchViewers;
}

export function makeDailySnapshot(joined: JoinedGame[], asOf: string): DailySnapshots {
  const date = utcDate(asOf);
  return Object.fromEntries(joined.map((game): [string, DailySnapshot] => [String(game.igdb.id), {
    date,
    twitchViewers: game.twitch.viewers,
    twitchChannels: game.twitch.channels,
  }]));
}

/** Writes through a same-directory temporary file so readers never observe partial JSON. */
export function writeHistory(file: string, history: History): void {
  mkdirSync(dirname(file), { recursive: true });
  const temporary = `${file}.tmp`;
  writeFileSync(temporary, `${JSON.stringify(history, null, 2)}\n`, "utf8");
  renameSync(temporary, file);
}
