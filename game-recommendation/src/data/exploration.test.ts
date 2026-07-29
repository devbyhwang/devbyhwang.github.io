import { afterEach, describe, expect, it, vi } from "vitest";
import type { Query } from "../domain/types";

const query: Query = { length: "medium", players: 1, viewerParticipation: false, vibe: "healing" };

const response = (value: unknown) => new Response(JSON.stringify(value), { status: 200 });

afterEach(() => { vi.restoreAllMocks(); });

describe("exploration data", () => {
  it("loads a 24-card page from exploration artifacts without catalog chunks", async () => {
    const ids = Array.from({ length: 24 }, (_, index) => `game-${index}`);
    const fetcher = vi.fn(async (url: string) => {
      if (url.endsWith("manifest.json")) return response({
        generatedAt: "2026-07-28T00:00:00.000Z", gameCount: 48, pageSize: 24,
        views: { all: 48, new: 0, rising: 0, discovery: 0, classic: 0 },
      });
      if (url.endsWith("/all/0.json")) return response({ ids });
      return response(ids.map((id) => ({
        id, name: id, releaseDate: "2020-01-01T00:00:00.000Z",
        players: { max: 1, online: false, localCoop: false }, sessionShape: "run", twitchViewers: 1,
      })));
    });

    const { loadExplorationPage } = await import("./exploration");
    const result = await loadExplorationPage(query, "all", 0, fetcher as typeof fetch);

    expect(result.cards).toHaveLength(24);
    expect(result.hasMore).toBe(true);
    expect(fetcher.mock.calls.map(([url]) => url)).not.toContain(expect.stringContaining("catalog/chunks"));
  });

  it("reuses successful manifest, page, and shard promises by URL", async () => {
    const fetcher = vi.fn(async (url: string) => {
      if (url.endsWith("manifest.json")) return response({
        generatedAt: "2026-07-28T00:00:00.000Z", gameCount: 1, pageSize: 24,
        views: { all: 1, new: 0, rising: 0, discovery: 0, classic: 0 },
      });
      if (url.endsWith("/all/0.json")) return response({ ids: ["game-1"] });
      return response([{ id: "game-1", name: "Game 1", releaseDate: "2020-01-01T00:00:00.000Z", players: { max: 1, online: false, localCoop: false }, sessionShape: "run", twitchViewers: 1 }]);
    });
    const { loadExplorationPage } = await import("./exploration");

    await Promise.all([
      loadExplorationPage(query, "all", 0, fetcher as typeof fetch),
      loadExplorationPage(query, "all", 0, fetcher as typeof fetch),
    ]);

    expect(fetcher).toHaveBeenCalledTimes(3);
  });

  it("does not request a nonexistent page for an empty view", async () => {
    const fetcher = vi.fn(async (_url: string) => response({
      generatedAt: "2026-07-28T00:00:00.000Z", gameCount: 1, pageSize: 24,
      views: { all: 1, new: 0, rising: 0, discovery: 0, classic: 0 },
    }));
    const { loadExplorationPage } = await import("./exploration");

    const result = await loadExplorationPage(query, "new", 0, fetcher as typeof fetch);

    expect(result).toMatchObject({ cards: [], hasMore: false });
    expect(fetcher.mock.calls.map(([url]) => url)).not.toContain(expect.stringContaining("/new/0.json"));
  });
});
