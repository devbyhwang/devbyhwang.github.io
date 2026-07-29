import { mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import type { DailySnapshot, DailySnapshots, History, JoinedGame, StreamingFeatures } from "./model";

const HISTORY_DAYS = 90;

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
      if (entry.coverage !== undefined && (typeof entry.coverage !== "number" || !Number.isFinite(entry.coverage) || entry.coverage < 0 || entry.coverage > 1)) {
        fail(`${snapshotPath}.coverage`, "must be a number from 0 to 1");
      }
    });
  }
}

function utcDate(asOf: string): string {
  const date = new Date(asOf);
  if (!Number.isFinite(date.getTime())) throw new Error(`invalid asOf timestamp: ${asOf}`);
  return date.toISOString().slice(0, 10);
}

function addUtcDays(date: string, days: number): string {
  const value = new Date(`${date}T00:00:00.000Z`);
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
}

function daysBetween(left: string, right: string): number {
  const leftTime = new Date(`${left}T00:00:00.000Z`).getTime();
  const rightTime = new Date(`${right}T00:00:00.000Z`).getTime();
  return Math.round((leftTime - rightTime) / 86_400_000);
}

function midpointPercentile(sorted: number[], percentile: number): number {
  if (sorted.length === 0) return 0;
  if (sorted.length === 1) return sorted[0];
  const position = (sorted.length - 1) * percentile;
  const lower = Math.floor(position);
  const upper = Math.ceil(position);
  if (lower === upper) return sorted[lower];
  return (sorted[lower] + sorted[upper]) / 2;
}

function closestBaseline(entries: DailySnapshot[], currentDate: string, targetDays: number): DailySnapshot | null {
  const prior = entries.filter((entry) => entry.date < currentDate);
  if (prior.length === 0) return null;
  return prior.slice(1).reduce<DailySnapshot>((best, candidate) => {
    const bestDistance = Math.abs(daysBetween(currentDate, best.date) - targetDays);
    const candidateDistance = Math.abs(daysBetween(currentDate, candidate.date) - targetDays);
    if (candidateDistance !== bestDistance) return candidateDistance < bestDistance ? candidate : best;
    return candidate.date > best.date ? candidate : best;
  }, prior[0]);
}

function growthAgainst(entries: DailySnapshot[], current: DailySnapshot, targetDays: number): number | null {
  const baseline = closestBaseline(entries, current.date, targetDays);
  if (!baseline || baseline.twitchViewers === 0) return null;
  return current.twitchViewers / baseline.twitchViewers;
}

function volatility30d(entries: DailySnapshot[], currentDate: string): number | null {
  const windowStart = addUtcDays(currentDate, -30);
  const viewers = entries
    .filter((entry) => entry.date >= windowStart && entry.date <= currentDate)
    .map((entry) => entry.twitchViewers)
    .sort((left, right) => left - right);
  if (viewers.length < 3) return null;
  const median = midpointPercentile(viewers, 0.5);
  if (median === 0) return null;
  const deviations = viewers
    .map((value) => Math.abs(value - median))
    .sort((left, right) => left - right);
  return midpointPercentile(deviations, 0.5) / median;
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
  return deriveStreamingFeatures(history, igdbId, asOf).growth7d;
}

export function deriveStreamingFeatures(history: History, gameId: string, asOf: string): StreamingFeatures {
  const entries = history[gameId] ?? [];
  const currentDate = utcDate(asOf);
  const current = entries.find((entry) => entry.date === currentDate);
  const latest = current ?? entries.at(-1);
  const confidence = latest?.coverage ?? (latest ? 1 : 0);
  if (!current) {
    return {
      growth7d: null,
      growth30d: null,
      growth90d: null,
      volatility30d: null,
      observedSnapshots: entries.length,
      confidence,
    };
  }
  return {
    growth7d: growthAgainst(entries, current, 7),
    growth30d: growthAgainst(entries, current, 30),
    growth90d: growthAgainst(entries, current, 90),
    volatility30d: volatility30d(entries, currentDate),
    observedSnapshots: entries.length,
    confidence,
  };
}

export function makeDailySnapshot(joined: JoinedGame[], asOf: string): DailySnapshots {
  const date = utcDate(asOf);
  return Object.fromEntries(joined.map((game): [string, DailySnapshot] => [String(game.igdb.id), {
    date,
    twitchViewers: game.twitch.viewers,
    twitchChannels: game.twitch.channels,
    ...(game.twitch.coverage === undefined ? {} : { coverage: game.twitch.coverage }),
  }]));
}

/** Writes through a same-directory temporary file so readers never observe partial JSON. */
export function writeHistory(file: string, history: History): void {
  mkdirSync(dirname(file), { recursive: true });
  const temporary = `${file}.tmp`;
  writeFileSync(temporary, `${JSON.stringify(history, null, 2)}\n`, "utf8");
  renameSync(temporary, file);
}
