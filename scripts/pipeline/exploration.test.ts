import { describe, expect, it } from "vitest";
import { ALL_QUERIES, recommendationKey } from "../../game-recommendation/src/domain/recommendation-index";
import {
  CARD_SHARD_COUNT,
  cardShardFor,
  emitExploration,
  explorationCardPath,
  explorationPagePath,
  readExploration,
  readExplorationCardShard,
  readExplorationPage,
} from "./exploration";
import type { FileStore } from "./emit";
import type { CatalogRecord } from "./model";

const generatedAt = "2026-07-28T00:00:00.000Z";

function catalogWith(count: number): CatalogRecord {
  return {
    generatedAt,
    games: Array.from({ length: count }, (_, index) => ({
      id: `game-${index}`,
      name: `Game ${index}`,
      releaseDate: "2026-07-20T00:00:00.000Z",
      players: { max: "unknown", source: "unknown", online: false, localCoop: false },
      sessionShape: "run",
      viewerPlayable: { ok: false },
      vibes: { healing: 0.5, variety: 0.5, horror: 0.5, hardcore: 0.5, chatting: 0.5, spectacle: 0.5 },
      buzz: { twitchViewers: 10_000 - index, twitchChannels: 10, viewerGrowth7d: index % 2 ? 1.5 : 0.5, isNewRelease: true },
      streaming: {
        totalViewers: 10_000 - index,
        channelCount: 10,
        medianViewersPerChannel: 1_000,
        p75ViewersPerChannel: 1_200,
        top10ViewerShare: 1,
        viewerConcentration: 1,
        growth7d: index % 2 ? 1.5 : 0.5,
        growth30d: null,
        growth90d: null,
        volatility30d: null,
        observedSnapshots: 7,
        coverage: 1,
        asOf: generatedAt,
      },
      quality: { totalRating: 80, totalRatingCount: 100 },
      topTags: [],
    })),
  };
}

function memoryFileStore() {
  const files = new Map<string, string>();
  const fs: FileStore = {
    read: (path) => files.get(path) ?? null,
    writeAtomic: (path, contents) => { files.set(path, contents); },
    delete: (path) => { files.delete(path); },
  };
  return { fs, files };
}

describe("exploration emission", () => {
  it("writes 24-ID pages for every query and view", () => {
    const { fs } = memoryFileStore();
    const query = ALL_QUERIES[0]!;

    const output = emitExploration(catalogWith(30), fs);

    expect(output.pageSize).toBe(24);
    expect(readExplorationPage(fs, query, "all", 0).ids).toHaveLength(24);
    expect(readExplorationPage(fs, query, "all", 1).ids).toHaveLength(6);
    expect(readExploration(fs)?.queries).toEqual(ALL_QUERIES.map(recommendationKey));
  });

  it("writes every referenced game once to its deterministic card shard", () => {
    const { fs } = memoryFileStore();
    const catalog = catalogWith(30);
    const query = ALL_QUERIES[0]!;

    emitExploration(catalog, fs);
    const page = readExplorationPage(fs, query, "all", 0);
    const cardOccurrences = page.ids.map((id) => {
      const cards = readExplorationCardShard(fs, id);
      return cards.filter((card) => card.id === id);
    });

    expect(cardOccurrences.every((cards) => cards.length === 1)).toBe(true);
    expect(new Set(Array.from({ length: CARD_SHARD_COUNT }, (_, index) => explorationCardPath(index))).size).toBe(CARD_SHARD_COUNT);
    expect(explorationPagePath(query, "all", 0)).toContain(recommendationKey(query));
  });

  it("rejects a page ID that cannot resolve to exactly one emitted card", () => {
    const { fs, files } = memoryFileStore();
    const query = ALL_QUERIES[0]!;
    emitExploration(catalogWith(1), fs);
    const path = explorationPagePath(query, "all", 0);
    files.set(path, JSON.stringify({ ids: ["outside-catalog"] }));

    expect(() => readExploration(fs)).toThrow("outside-catalog");
  });

  it("rejects a card ID replacement that preserves the shard and card count", () => {
    const { fs, files } = memoryFileStore();
    const catalog = catalogWith(30);
    emitExploration(catalog, fs);
    const shard = cardShardFor(catalog.games[0]!.id);
    const path = explorationCardPath(shard);
    const cards = JSON.parse(files.get(path)!) as Array<{ id: string }>;
    const original = cards.find((card) => card.id === catalog.games[0]!.id)!;
    const replacement = Array.from({ length: 10_000 }, (_, index) => `outside-catalog-${index}`)
      .find((id) => cardShardFor(id) === shard)!;
    original.id = replacement;
    files.set(path, JSON.stringify(cards));
    for (const [filePath, contents] of files) {
      if (filePath !== path) files.set(filePath, contents.split(`"${catalog.games[0]!.id}"`).join(`"${replacement}"`));
    }
    expect(() => readExploration(fs, new Set(catalog.games.map((game) => game.id)))).toThrow("outside-catalog");
  });

  it("rejects 30 result IDs split into 10-ID and 20-ID pages", () => {
    const { fs, files } = memoryFileStore();
    const query = ALL_QUERIES[0]!;
    emitExploration(catalogWith(30), fs);
    const first = readExplorationPage(fs, query, "all", 0).ids;
    const second = readExplorationPage(fs, query, "all", 1).ids;
    files.set(explorationPagePath(query, "all", 0), JSON.stringify({ ids: [...first.slice(0, 10)] }));
    files.set(explorationPagePath(query, "all", 1), JSON.stringify({ ids: [...first.slice(10), ...second] }));

    expect(() => readExploration(fs)).toThrow("page size");
  });
});
