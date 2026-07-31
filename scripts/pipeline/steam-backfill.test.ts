import { mkdtemp, readFile, mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { runSteamBackfill } from "./steam-backfill";
import { STEAMSPY_PAGE_SIZE } from "./sources/steamspy-all";

const AS_OF = "2026-07-31T00:00:00.000Z";

async function root(): Promise<string> {
  return mkdtemp(join(tmpdir(), "steam-backfill-"));
}

function page(count: number, from: number): string {
  return JSON.stringify(Object.fromEntries(Array.from({ length: count }, (_, index) => {
    const appid = from + index + 1;
    return [String(appid), { appid, name: `Game ${appid}`, positive: 10, negative: 2 }];
  })));
}

/** Serves `full` complete pages, then one short page. */
function fetcher(full: number, failOn?: number): typeof fetch {
  return (async (url: string) => {
    const requested = Number(new URL(url).searchParams.get("page"));
    if (requested === failOn) return new Response("nope", { status: 500 });
    const count = requested < full ? STEAMSPY_PAGE_SIZE : 3;
    return new Response(page(count, requested * STEAMSPY_PAGE_SIZE), { status: 200 });
  }) as unknown as typeof fetch;
}

async function checkpoint(rootDir: string): Promise<Record<string, unknown>> {
  return JSON.parse(await readFile(join(rootDir, "data/checkpoints/steamspy.json"), "utf8"));
}

describe("runSteamBackfill", () => {
  it("paginates to the short page and records complete", async () => {
    const rootDir = await root();
    const result = await runSteamBackfill({ rootDir, asOf: AS_OF, fetcher: fetcher(2), requestIntervalMs: 0 });

    expect(result.status).toBe("complete");
    expect(result.fetchedPages).toBe(3);
    expect(result.fetchedApps).toBe(STEAMSPY_PAGE_SIZE * 2 + 3);
    expect(result.blocked).toBe(false);
    expect(await checkpoint(rootDir)).toMatchObject({ version: 1, status: "complete", nextPage: 3 });
  });

  it("writes one snapshot file per page", async () => {
    const rootDir = await root();
    await runSteamBackfill({ rootDir, asOf: AS_OF, fetcher: fetcher(1), requestIntervalMs: 0 });

    const snapshot = JSON.parse(await readFile(join(rootDir, "data/raw/steam/all/0000.json"), "utf8"));
    expect(snapshot.source).toBe("steamspy");
    expect(snapshot.fetchedAt).toBe(AS_OF);
    expect(snapshot.entries).toHaveLength(STEAMSPY_PAGE_SIZE);
    expect(snapshot.entries[0]).toEqual({ appId: 1, name: "Game 1", positive: 10, negative: 2 });
  });

  it("does not mark complete when a page is blocked", async () => {
    // Blocks on page 2, after pages 0 and 1 succeed, to exercise the
    // page-increment/checkpoint-persist loop across multiple successful
    // iterations before hitting the failure. This waits through http.ts's
    // real retry backoff (~7s), so it gets a per-test timeout override
    // instead of fake timers -- fake timers have nothing to pump until the
    // retry path registers a real timer, and by then the earlier pages'
    // real fs writes may not have settled, which can hang the run.
    const rootDir = await root();
    const result = await runSteamBackfill({ rootDir, asOf: AS_OF, fetcher: fetcher(5, 2), requestIntervalMs: 0 });

    expect(result.blocked).toBe(true);
    expect(result.status).toBe("pending");
    expect(result.nextPage).toBe(2);
    expect(await checkpoint(rootDir)).toMatchObject({ status: "pending", nextPage: 2 });
  }, 15000);

  it("resumes from the recorded page", async () => {
    const rootDir = await root();
    await mkdir(join(rootDir, "data/checkpoints"), { recursive: true });
    await writeFile(
      join(rootDir, "data/checkpoints/steamspy.json"),
      JSON.stringify({ version: 1, nextPage: 2, status: "pending", updatedAt: AS_OF }),
    );
    const requested: number[] = [];
    const base = fetcher(3);
    const spy = (async (url: string) => {
      requested.push(Number(new URL(url).searchParams.get("page")));
      return base(url as never);
    }) as unknown as typeof fetch;

    await runSteamBackfill({ rootDir, asOf: AS_OF, fetcher: spy, requestIntervalMs: 0 });

    expect(requested[0]).toBe(2);
  });

  it("does nothing when the checkpoint is already complete", async () => {
    const rootDir = await root();
    await mkdir(join(rootDir, "data/checkpoints"), { recursive: true });
    await writeFile(
      join(rootDir, "data/checkpoints/steamspy.json"),
      JSON.stringify({ version: 1, nextPage: 9, status: "complete", updatedAt: AS_OF }),
    );

    const result = await runSteamBackfill({
      rootDir, asOf: AS_OF, requestIntervalMs: 0,
      fetcher: (async () => { throw new Error("must not fetch"); }) as unknown as typeof fetch,
    });

    expect(result).toMatchObject({ status: "complete", fetchedPages: 0 });
  });

  it("stops at maxPages without claiming completion", async () => {
    const rootDir = await root();
    const result = await runSteamBackfill({ rootDir, asOf: AS_OF, fetcher: fetcher(10), requestIntervalMs: 0, maxPages: 2 });

    expect(result).toMatchObject({ fetchedPages: 2, status: "pending", nextPage: 2, blocked: false });
  });
});
