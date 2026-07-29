import { describe, expect, it } from "vitest";
import { ALL_QUERIES, recommendationKey } from "../../game-recommendation/src/domain/recommendation-index";
import { decodeMembershipBitset, decodeOrdinalRankVector, membershipBitsetHas } from "../../game-recommendation/src/domain/exploration";
import { ORDINAL_CARD_SHARD_COUNT } from "../../game-recommendation/src/domain/exploration";
import { emitExploration, explorationCardPath, explorationManifestPath, explorationMembershipPath, explorationRankPath, readExploration } from "./exploration";
import type { FileStore } from "./emit";
import type { CatalogRecord } from "./model";

const generatedAt = "2026-07-28T00:00:00.000Z";
function catalogWith(count: number): CatalogRecord { return { generatedAt, games: Array.from({ length: count }, (_, index) => ({
  id: `game-${index}`, name: `Game ${index}`, releaseDate: index % 3 === 0 ? "2019-01-01T00:00:00.000Z" : "2026-07-20T00:00:00.000Z",
  players: { max: "unknown", source: "unknown", online: false, localCoop: false }, sessionShape: "run", viewerPlayable: { ok: false },
  vibes: { healing: 0.5, variety: 0.5, horror: 0.5, hardcore: 0.5, chatting: 0.5, spectacle: 0.5 },
  buzz: { twitchViewers: index % 4 === 0 ? 500 : 10_000 - index, twitchChannels: index % 4 === 0 ? 2 : 10, viewerGrowth7d: index % 2 ? 1.5 : 0.5, isNewRelease: index % 3 !== 0 },
  streaming: { totalViewers: 10_000 - index, channelCount: 10, medianViewersPerChannel: 1_000, p75ViewersPerChannel: 1_200, top10ViewerShare: 1, viewerConcentration: 1, growth7d: index % 2 ? 1.5 : 0.5, growth30d: null, growth90d: null, volatility30d: null, observedSnapshots: 7, coverage: 1, asOf: generatedAt },
  quality: { totalRating: 80, totalRatingCount: 100 }, topTags: [],
})) }; }
function memoryFileStore() { const files = new Map<string, string>(); const bytes = new Map<string, Uint8Array>(); const fs: FileStore = { read: (path) => files.get(path) ?? null, writeAtomic: (path, contents) => { files.set(path, contents); }, readBytes: (path) => bytes.get(path) ?? null, writeAtomicBytes: (path, value) => { bytes.set(path, new Uint8Array(value)); }, delete: (path) => { files.delete(path); bytes.delete(path); } }; return { fs, files, bytes }; }

function equalScoreCatalog(): CatalogRecord {
  const catalog = catalogWith(98);
  catalog.games.forEach((game, index) => {
    game.id = index < 96 ? `game-${String(index).padStart(3, "0")}` : index === 96 ? "game-a" : "game-A";
    game.releaseDate = "2026-07-20T00:00:00.000Z";
    game.buzz = { twitchViewers: 1_000, twitchChannels: 10, viewerGrowth7d: 1, isNewRelease: true };
    game.streaming.growth7d = 1;
  });
  return catalog;
}

describe("compact exploration emission", () => {
  it("writes one rank vector and four membership bitsets per pipe-key query", () => {
    const { fs, files, bytes } = memoryFileStore(); const catalog = catalogWith(30); const query = ALL_QUERIES[0]!;
    const output = emitExploration(catalog, fs); const key = recommendationKey(query);
    expect(output.format).toBe(1); expect(output.pageSize).toBe(24); expect(key).toContain("|");
    const manifest = JSON.parse(files.get(explorationManifestPath(query))!);
    expect(manifest.rank.ordinalCount).toBe(30); expect(bytes.get(explorationRankPath(query))?.byteLength).toBe(120);
    expect(["new", "rising", "discovery", "classic"].map((view) => bytes.get(explorationMembershipPath(query, view as "new"))?.byteLength)).toEqual([4, 4, 4, 4]);
    const rank = decodeOrdinalRankVector(bytes.get(explorationRankPath(query))!, 30, 30);
    expect(rank.slice(24)).toHaveLength(6);
    expect(readExploration(fs)?.queries).toEqual(ALL_QUERIES.map(recommendationKey));
  });

  it("uses shared rank ordinals for cross-view membership and exact card shards", () => {
    const { fs, files, bytes } = memoryFileStore(); const catalog = catalogWith(30); const query = ALL_QUERIES[0]!;
    emitExploration(catalog, fs); const rank = decodeOrdinalRankVector(bytes.get(explorationRankPath(query))!, 30, 30);
    const newBits = decodeMembershipBitset(bytes.get(explorationMembershipPath(query, "new"))!, 30);
    const classicBits = decodeMembershipBitset(bytes.get(explorationMembershipPath(query, "classic"))!, 30);
    expect(rank.filter((ordinal) => membershipBitsetHas(newBits, ordinal, 30)).length).toBe(20);
    expect(rank.filter((ordinal) => membershipBitsetHas(classicBits, ordinal, 30)).length).toBe(10);
    const cards = Array.from({ length: ORDINAL_CARD_SHARD_COUNT }, (_, shard) => JSON.parse(files.get(explorationCardPath(shard))!)).flat();
    expect(cards.map((card: { ordinal: number }) => card.ordinal).sort((a: number, b: number) => a - b)).toEqual(Array.from({ length: 30 }, (_, ordinal) => ordinal));
  });

  it("rejects corrupt duplicate or out-of-range rank ordinals", () => {
    const { fs, bytes } = memoryFileStore(); const query = ALL_QUERIES[0]!; emitExploration(catalogWith(2), fs);
    bytes.set(explorationRankPath(query), new Uint8Array([0, 0, 0, 0, 0, 0, 0, 0]));
    expect(() => readExploration(fs)).toThrow("duplicate ordinal");
    bytes.set(explorationRankPath(query), new Uint8Array([2, 0, 0, 0, 1, 0, 0, 0]));
    expect(() => readExploration(fs)).toThrow("invalid ordinal");
  });

  it("fails closed for corrupt bitsets and card shards", () => {
    const { fs, files, bytes } = memoryFileStore(); const query = ALL_QUERIES[0]!; emitExploration(catalogWith(2), fs);
    bytes.set(explorationMembershipPath(query, "new"), new Uint8Array());
    expect(() => readExploration(fs)).toThrow("membership bitset byte length");
    emitExploration(catalogWith(2), fs);
    files.set(explorationCardPath(0), JSON.stringify([{
      id: "game-0", name: "Game 0", releaseDate: "2026-01-01T00:00:00.000Z", ordinal: 1,
      players: { max: "unknown", online: false, localCoop: false }, sessionShape: "run", twitchViewers: 10,
    }]));
    expect(() => readExploration(fs)).toThrow("wrong-shard");
  });

  it("rejects corrupt required card display fields and malformed optional fields", () => {
    const { fs, files } = memoryFileStore();
    emitExploration(catalogWith(2), fs);
    files.set(explorationCardPath(0), JSON.stringify([{
      id: "game-0", name: "Game 0", releaseDate: "2026-01-01T00:00:00.000Z", ordinal: 0,
      players: { max: "unknown", online: "false", localCoop: false }, sessionShape: "run", twitchViewers: 10,
      discountPercent: "50",
    }]));
    expect(() => readExploration(fs)).toThrow("invalid card");
  });

  it("rejects card fields outside the catalog contract", () => {
    const { fs, files } = memoryFileStore();
    const corruptions: Array<(card: Record<string, unknown>) => void> = [
      (card) => { card.releaseDate = "2026-01-01"; },
      (card) => { card.players = { max: 0, online: false, localCoop: false }; },
      (card) => { card.discountPercent = 101; },
    ];
    for (const corrupt of corruptions) {
      emitExploration(catalogWith(2), fs);
      const cards = JSON.parse(files.get(explorationCardPath(0))!) as Array<Record<string, unknown>>;
      corrupt(cards[0]!);
      files.set(explorationCardPath(0), JSON.stringify(cards));
      expect(() => readExploration(fs)).toThrow("invalid card");
    }
  });

  it("keeps the legacy locale tie-break after the diverse prefix", () => {
    const { fs, bytes } = memoryFileStore();
    const catalog = equalScoreCatalog();
    const query = ALL_QUERIES[0]!;
    emitExploration(catalog, fs);
    const ordinals = decodeOrdinalRankVector(bytes.get(explorationRankPath(query))!, 98, 98);
    expect(ordinals.slice(96).map((ordinal) => catalog.games[ordinal]!.id)).toEqual(["game-a", "game-A"]);
  });
});
