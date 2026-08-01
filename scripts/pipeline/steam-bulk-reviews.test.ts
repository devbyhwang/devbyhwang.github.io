import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { loadSteamSpyBulkReviews } from "./steam-bulk-reviews";

const roots: string[] = [];

afterEach(() => {
  for (const value of roots.splice(0)) rmSync(value, { recursive: true, force: true });
});

function root(): string {
  const value = mkdtempSync(join(tmpdir(), "catalog-steam-bulk-"));
  roots.push(value);
  return value;
}

function allDirectory(rootDir: string): string {
  const directory = join(rootDir, "data", "raw", "steam", "all");
  mkdirSync(directory, { recursive: true });
  return directory;
}

describe("loadSteamSpyBulkReviews", () => {
  it("reads entries across multiple snapshot files", () => {
    const rootDir = root();
    const directory = allDirectory(rootDir);
    writeFileSync(join(directory, "0000.json"), JSON.stringify({ entries: [{ appId: 10, positive: 5, negative: 1 }] }));
    writeFileSync(join(directory, "0001.json"), JSON.stringify({ entries: [{ appId: 20, positive: 7, negative: 2 }] }));

    const reviews = loadSteamSpyBulkReviews(rootDir);

    expect(reviews).toEqual(new Map([
      [10, { positive: 5, negative: 1 }],
      [20, { positive: 7, negative: 2 }],
    ]));
  });

  it("keeps the last-seen entry when a later file duplicates an appId", () => {
    const rootDir = root();
    const directory = allDirectory(rootDir);
    writeFileSync(join(directory, "0000.json"), JSON.stringify({ entries: [{ appId: 10, positive: 5, negative: 1 }] }));
    writeFileSync(join(directory, "0001.json"), JSON.stringify({ entries: [{ appId: 10, positive: 50, negative: 10 }] }));

    const reviews = loadSteamSpyBulkReviews(rootDir);

    expect(reviews.get(10)).toEqual({ positive: 50, negative: 10 });
  });

  it("processes files in filename sort order regardless of directory listing order", () => {
    const rootDir = root();
    const directory = allDirectory(rootDir);
    // Write the numerically-later file first so a naive (non-sorted) read would pick the wrong "last" value.
    writeFileSync(join(directory, "0009.json"), JSON.stringify({ entries: [{ appId: 10, positive: 999, negative: 999 }] }));
    writeFileSync(join(directory, "0001.json"), JSON.stringify({ entries: [{ appId: 10, positive: 1, negative: 1 }] }));

    const reviews = loadSteamSpyBulkReviews(rootDir);

    expect(reviews.get(10)).toEqual({ positive: 999, negative: 999 });
  });

  it("returns an empty Map when the directory is missing", () => {
    const rootDir = root();

    const reviews = loadSteamSpyBulkReviews(rootDir);

    expect(reviews).toEqual(new Map());
  });

  it("ignores non-JSON files in the directory", () => {
    const rootDir = root();
    const directory = allDirectory(rootDir);
    writeFileSync(join(directory, "0000.json"), JSON.stringify({ entries: [{ appId: 10, positive: 5, negative: 1 }] }));
    writeFileSync(join(directory, "README.md"), "not json");

    const reviews = loadSteamSpyBulkReviews(rootDir);

    expect(reviews).toEqual(new Map([[10, { positive: 5, negative: 1 }]]));
  });

  it("leaves a malformed entry absent from the result instead of throwing", () => {
    const rootDir = root();
    const directory = allDirectory(rootDir);
    writeFileSync(join(directory, "0000.json"), JSON.stringify({
      entries: [{ appId: 10, positive: 5, negative: 1 }, { name: "no appId here" }, null],
    }));

    const reviews = loadSteamSpyBulkReviews(rootDir);

    expect(reviews).toEqual(new Map([[10, { positive: 5, negative: 1 }]]));
  });
});
