import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { IgdbRawSnapshot } from "./model";
import { runBackfill } from "./backfill";

const roots: string[] = [];
const asOf = "2026-07-28T12:00:00.000Z";

afterEach(() => {
  vi.restoreAllMocks();
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

function root(): string {
  const value = mkdtempSync(join(tmpdir(), "catalog-backfill-"));
  roots.push(value);
  return value;
}

function json(value: unknown, status = 200): Response {
  return new Response(JSON.stringify(value), { status, headers: { "content-type": "application/json" } });
}

function game(id: number, firstReleaseDate = 631_152_000) {
  return { id, name: `Game ${id}`, first_release_date: firstReleaseDate };
}

type FetchStep = unknown | Error;

function fetcher(steps: FetchStep[]) {
  let gameIndex = 0;
  const calls: Array<{ url: string; body: string }> = [];
  const mock = vi.fn(async (url: string, init?: RequestInit) => {
    const body = String(init?.body ?? "");
    calls.push({ url, body });
    if (url === "https://id.twitch.tv/oauth2/token") return json({ access_token: "fixture-igdb-token" });
    if (!url.endsWith("/games")) throw new Error(`unexpected URL ${url}`);
    const step = steps[gameIndex++];
    if (step instanceof Error) throw step;
    return json(step);
  });
  return { calls, mock };
}

function checkpoint(rootDir: string) {
  return JSON.parse(readFileSync(join(rootDir, "data/checkpoints/igdb.json"), "utf8")) as {
    version: number;
    partitions: Record<string, { status: string; nextOffset: number; updatedAt: string }>;
  };
}

function writeCheckpoint(rootDir: string, value: unknown): void {
  mkdirSync(join(rootDir, "data/checkpoints"), { recursive: true });
  writeFileSync(join(rootDir, "data/checkpoints/igdb.json"), `${JSON.stringify(value)}\n`, "utf8");
}

describe("IGDB backfill checkpoints", () => {
  it("starts a new yearly partition at offset zero", async () => {
    const destination = root();
    const network = fetcher([[]]);

    const result = await runBackfill({
      rootDir: destination,
      asOf,
      partitionStart: "1990-01-01",
      partitionEnd: "1991-01-01",
      clientId: "client",
      clientSecret: "secret",
      fetcher: network.mock as typeof fetch,
    });

    expect(network.calls.find((call) => call.url.endsWith("/games"))?.body).toContain("offset 0;");
    expect(checkpoint(destination)).toEqual({
      version: 1,
      partitions: {
        "1990-01-01/1991-01-01": {
          status: "complete",
          nextOffset: 0,
          updatedAt: asOf,
        },
      },
    });
    expect(result).toEqual({
      completedPartitions: ["1990-01-01/1991-01-01"],
      fetchedGameCount: 0,
      remainingPartitions: [],
    });
  });

  it("filters year-query candidates to the requested pre-1970 partition before persisting", async () => {
    const destination = root();
    const snapshots: IgdbRawSnapshot[] = [];
    const network = fetcher([[game(1, -631_152_000), game(2, -662_688_000)]]);

    const result = await runBackfill({
      rootDir: destination,
      asOf,
      partitionStart: "1950-01-01",
      partitionEnd: "1951-01-01",
      clientId: "client",
      clientSecret: "secret",
      fetcher: network.mock as typeof fetch,
      recordSnapshot: async (snapshot) => { snapshots.push(snapshot); },
    });

    expect(network.calls.find((call) => call.url.endsWith("/games"))?.body)
      .toContain("where release_dates.y = (1950)");
    expect(snapshots[0].games).toEqual([game(1, -631_152_000)]);
    expect(result.fetchedGameCount).toBe(1);
  });

  it("advances by raw candidate pages when a pre-1970 page has no in-range games", async () => {
    const destination = root();
    const network = fetcher([
      Array.from({ length: 500 }, (_, index) => game(index + 1, -662_688_000)),
      [game(501, -631_152_000)],
    ]);

    const result = await runBackfill({
      rootDir: destination,
      asOf,
      partitionStart: "1950-01-01",
      partitionEnd: "1951-01-01",
      clientId: "client",
      clientSecret: "secret",
      fetcher: network.mock as typeof fetch,
    });

    expect(network.calls.filter((call) => call.url.endsWith("/games")).map((call) => call.body))
      .toEqual([
        expect.stringContaining("offset 0;"),
        expect.stringContaining("offset 500;"),
      ]);
    expect(result.fetchedGameCount).toBe(1);
  });

  it("resumes a second invocation from the saved offset", async () => {
    const destination = root();
    writeCheckpoint(destination, {
      version: 1,
      partitions: {
        "1990-01-01/1991-01-01": { status: "pending", nextOffset: 500, updatedAt: "2026-07-28T00:00:00.000Z" },
      },
    });
    const network = fetcher([[]]);

    await runBackfill({
      rootDir: destination,
      asOf,
      partitionStart: "1990-01-01",
      partitionEnd: "1991-01-01",
      clientId: "client",
      clientSecret: "secret",
      fetcher: network.mock as typeof fetch,
    });

    expect(network.calls.find((call) => call.url.endsWith("/games"))?.body).toContain("offset 500;");
    expect(checkpoint(destination).partitions["1990-01-01/1991-01-01"]).toEqual({
      status: "complete",
      nextOffset: 500,
      updatedAt: asOf,
    });
  });

  it("skips a completed partition without making a network request", async () => {
    const destination = root();
    writeCheckpoint(destination, {
      version: 1,
      partitions: {
        "1990-01-01/1991-01-01": { status: "complete", nextOffset: 500, updatedAt: "2026-07-28T00:00:00.000Z" },
      },
    });

    const result = await runBackfill({
      rootDir: destination,
      asOf,
      partitionStart: "1990-01-01",
      partitionEnd: "1991-01-01",
      clientId: "client",
      clientSecret: "secret",
      fetcher: vi.fn() as typeof fetch,
    });

    expect(result).toEqual({
      completedPartitions: ["1990-01-01/1991-01-01"],
      fetchedGameCount: 0,
      remainingPartitions: [],
    });
  });

  it("keeps the checkpoint at the last successful offset when a later page fails", async () => {
    const destination = root();
    const network = fetcher([
      Array.from({ length: 500 }, (_, index) => game(index + 1)),
      new Error("IGDB page failed"),
    ]);

    await expect(runBackfill({
      rootDir: destination,
      asOf,
      partitionStart: "1990-01-01",
      partitionEnd: "1991-01-01",
      clientId: "client",
      clientSecret: "secret",
      fetcher: network.mock as typeof fetch,
    })).rejects.toThrow("IGDB page failed");

    expect(checkpoint(destination).partitions["1990-01-01/1991-01-01"]).toEqual({
      status: "pending",
      nextOffset: 500,
      updatedAt: asOf,
    });
  });

  it("de-duplicates game ids across adjacent yearly partitions", async () => {
    const destination = root();
    const network = fetcher([
      [game(1), game(2)],
      [game(2, 662_688_000), game(3, 662_688_000)],
    ]);

    const result = await runBackfill({
      rootDir: destination,
      asOf,
      partitionStart: "1990-01-01",
      partitionEnd: "1992-01-01",
      clientId: "client",
      clientSecret: "secret",
      fetcher: network.mock as typeof fetch,
    });

    expect(result).toEqual({
      completedPartitions: ["1990-01-01/1991-01-01", "1991-01-01/1992-01-01"],
      fetchedGameCount: 3,
      remainingPartitions: [],
    });
  });

  it("exposes each fetched snapshot so the CLI can persist catalog-ready games", async () => {
    const destination = root();
    const snapshots: IgdbRawSnapshot[] = [];

    await runBackfill({
      rootDir: destination,
      asOf,
      partitionStart: "1990-01-01",
      partitionEnd: "1991-01-01",
      clientId: "client",
      clientSecret: "secret",
      fetcher: fetcher([[game(1)]]).mock as typeof fetch,
      recordSnapshot: async (snapshot) => { snapshots.push(snapshot); },
    });

    expect(snapshots).toHaveLength(1);
    expect(snapshots[0].games).toEqual([game(1)]);
  });

  it("warns about games without release dates and excludes them from the recommendation catalog count", async () => {
    const destination = root();
    const network = fetcher([[{ id: 7, name: "Missing Date" }, game(8)]]);
    const warning = vi.spyOn(console, "warn").mockImplementation(() => undefined);

    const result = await runBackfill({
      rootDir: destination,
      asOf,
      partitionStart: "1990-01-01",
      partitionEnd: "1991-01-01",
      clientId: "client",
      clientSecret: "secret",
      fetcher: network.mock as typeof fetch,
    });

    expect(result.fetchedGameCount).toBe(1);
    expect(warning).toHaveBeenCalledWith("excluded 1 IGDB games without first_release_date from the recommendation catalog");
    expect(existsSync(join(destination, "data/checkpoints/igdb.json"))).toBe(true);
    expect(readFileSync(join(destination, "data/checkpoints/igdb.json"), "utf8")).not.toContain("secret");
  });

  it("resumes more than one query limit of same-day rows without shifting records across the checkpoint boundary", async () => {
    const destination = root();
    const collectedIds = new Set<number>();
    let invocation = 0;
    const network = vi.fn(async (url: string, init?: RequestInit) => {
      const body = String(init?.body ?? "");
      if (url === "https://id.twitch.tv/oauth2/token") return json({ access_token: "fixture-igdb-token" });
      if (!url.endsWith("/games")) throw new Error(`unexpected URL ${url}`);
      invocation += 1;
      if (invocation === 1) return json(Array.from({ length: 500 }, (_, index) => game(index + 1)));
      if (invocation === 2) throw new Error("checkpoint after first page");
      if (body.includes("sort first_release_date asc;")) return json([game(501)]);
      return json([game(500)]);
    });
    const recordResponse = vi.fn(async (response: unknown) => {
      for (const entry of Array.isArray(response) ? response : []) {
        if (entry && typeof entry === "object" && "id" in entry && Number.isInteger((entry as { id: unknown }).id)) {
          collectedIds.add((entry as { id: number }).id);
        }
      }
    });

    await expect(runBackfill({
      rootDir: destination,
      asOf,
      partitionStart: "1990-01-01",
      partitionEnd: "1991-01-01",
      clientId: "client",
      clientSecret: "secret",
      fetcher: network as typeof fetch,
      recordResponse,
    })).rejects.toThrow("checkpoint after first page");

    const resumed = await runBackfill({
      rootDir: destination,
      asOf,
      partitionStart: "1990-01-01",
      partitionEnd: "1991-01-01",
      clientId: "client",
      clientSecret: "secret",
      fetcher: network as typeof fetch,
      recordResponse,
    });

    expect(resumed).toEqual({
      completedPartitions: ["1990-01-01/1991-01-01"],
      fetchedGameCount: 1,
      remainingPartitions: [],
    });
    expect(collectedIds.size).toBe(501);
    expect(network.mock.calls
      .map((call) => String(call[1]?.body ?? ""))
      .filter((body) => body.includes("where first_release_date")))
      .toEqual(expect.arrayContaining([
        expect.stringContaining("sort first_release_date asc;"),
      ]));
  });
});
