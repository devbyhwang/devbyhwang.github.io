import { afterEach, describe, expect, it, vi } from "vitest";
import {
  COMPACT_EXPLORATION_FORMAT,
  compactExplorationCardPathForOrdinal,
  encodeMembershipBitset,
  encodeOrdinalRankVector,
  membershipBitsetByteLength,
} from "../domain/exploration";
import { recommendationKey } from "../domain/recommendation-index";
import type { Query } from "../domain/types";

const query: Query = { length: "medium", players: 1, viewerParticipation: false, vibe: "healing" };
const generatedAt = "2026-07-28T00:00:00.000Z";
const key = recommendationKey(query);
const bytes = (value: Uint8Array) => new Response(value.buffer as ArrayBuffer, { status: 200 });
const response = (value: unknown) => new Response(JSON.stringify(value), { status: 200 });

function manifest(gameCount: number, rankCount = gameCount, views = { new: 0, rising: 0, discovery: 0, classic: 0 }) {
  return {
    format: COMPACT_EXPLORATION_FORMAT, generatedAt, gameCount, pageSize: 24,
    rank: { path: `exploration/queries/${encodeURIComponent(key)}/rank.u32le`, ordinalCount: rankCount, byteLength: rankCount * 4 },
    views: Object.fromEntries(Object.entries(views).map(([view, count]) => [view, {
      path: `exploration/queries/${encodeURIComponent(key)}/${view}.bits`, count, byteLength: membershipBitsetByteLength(gameCount),
    }])),
  };
}

function card(ordinal: number) {
  return { id: `game-${ordinal}`, name: `Game ${ordinal}`, ordinal, releaseDate: "2020-01-01T00:00:00.000Z", players: { max: 1, online: false, localCoop: false }, sessionShape: "run", twitchViewers: 1 };
}

afterEach(() => { vi.restoreAllMocks(); });

describe("compact exploration data", () => {
  it("loads initial rank vector and only the card shards for its 24 ordinals", async () => {
    const ordinals = Array.from({ length: 48 }, (_, index) => index);
    const fetcher = vi.fn(async (url: string) => {
      if (url.endsWith("manifest.json")) return response(manifest(48));
      if (url.endsWith("rank.u32le")) return bytes(encodeOrdinalRankVector(ordinals, 48));
      return response([card(Number(url.match(/cards\/(\d+)\.json$/)?.[1]))]);
    });
    const { loadExplorationPage } = await import("./exploration");
    const result = await loadExplorationPage(query, "all", 0, fetcher as typeof fetch);

    expect(result.cards).toHaveLength(24);
    expect(result.hasMore).toBe(true);
    const urls = fetcher.mock.calls.map(([url]) => url as string);
    expect(urls).toContain(`./exploration/queries/${encodeURIComponent(key)}/rank.u32le`);
    expect(urls).toContain(`./${compactExplorationCardPathForOrdinal(0)}`);
    expect(urls).not.toContain(expect.stringContaining("catalog/chunks"));
  });

  it("appends a later page without another rank request", async () => {
    const ordinals = Array.from({ length: 48 }, (_, index) => index);
    const fetcher = vi.fn(async (url: string) => {
      if (url.endsWith("manifest.json")) return response(manifest(48));
      if (url.endsWith("rank.u32le")) return bytes(encodeOrdinalRankVector(ordinals, 48));
      return response([card(Number(url.match(/cards\/(\d+)\.json$/)?.[1]))]);
    });
    const { loadExplorationPage } = await import("./exploration");
    await loadExplorationPage(query, "all", 0, fetcher as typeof fetch);
    const result = await loadExplorationPage(query, "all", 1, fetcher as typeof fetch);

    expect(result.cards).toHaveLength(24);
    expect(fetcher.mock.calls.filter(([url]) => (url as string).endsWith("rank.u32le"))).toHaveLength(1);
  });

  it("filters local rank ordinals with the selected view bitset", async () => {
    const ordinals = [0, 1, 2, 3];
    const fetcher = vi.fn(async (url: string) => {
      if (url.endsWith("manifest.json")) return response(manifest(4, 4, { new: 2, rising: 0, discovery: 0, classic: 0 }));
      if (url.endsWith("rank.u32le")) return bytes(encodeOrdinalRankVector(ordinals, 4));
      if (url.endsWith("new.bits")) return bytes(encodeMembershipBitset([1, 3], 4));
      return response([card(Number(url.match(/cards\/(\d+)\.json$/)?.[1]))]);
    });
    const { loadExplorationPage } = await import("./exploration");
    const result = await loadExplorationPage(query, "new", 0, fetcher as typeof fetch);
    expect(result.cards.map(({ ordinal }) => ordinal)).toEqual([1, 3]);
  });

  it("returns an empty result without requesting a bitset for a zero-result view", async () => {
    const fetcher = vi.fn(async (_url: string) => response(manifest(4)));
    const { loadExplorationPage } = await import("./exploration");
    const result = await loadExplorationPage(query, "new", 0, fetcher as typeof fetch);
    expect(result).toMatchObject({ cards: [], hasMore: false });
    expect(fetcher.mock.calls.map(([url]) => url)).not.toContain(expect.stringContaining("new.bits"));
  });

  it.each([
    ["rank vector", () => new Uint8Array([0, 0, 0])],
    ["membership bitset", () => new Uint8Array()],
  ])("rejects a malformed %s", async (_name, malformed) => {
    const fetcher = vi.fn(async (url: string) => {
      if (url.endsWith("manifest.json")) return response(manifest(1, 1, { new: 1, rising: 0, discovery: 0, classic: 0 }));
      if (url.endsWith("rank.u32le")) return bytes(malformed());
      if (url.endsWith("new.bits")) return bytes(malformed());
      return response([card(0)]);
    });
    const { loadExplorationPage } = await import("./exploration");
    await expect(loadExplorationPage(query, _name === "membership bitset" ? "new" : "all", 0, fetcher as typeof fetch)).rejects.toThrow();
  });

  it("rejects cards with an invalid ordinal", async () => {
    const fetcher = vi.fn(async (url: string) => {
      if (url.endsWith("manifest.json")) return response(manifest(1));
      if (url.endsWith("rank.u32le")) return bytes(encodeOrdinalRankVector([0], 1));
      return response([{ ...card(0), ordinal: 1 }]);
    });
    const { loadExplorationPage } = await import("./exploration");
    await expect(loadExplorationPage(query, "all", 0, fetcher as typeof fetch)).rejects.toThrow("ordinal");
  });
});
