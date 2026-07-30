import { describe, expect, it } from "vitest";
import {
  COMPACT_EXPLORATION_FORMAT,
  DIVERSE_PREFIX_SIZE,
  ORDINAL_CARD_SHARD_COUNT,
  PAGE_SIZE,
  assertCompactExplorationCardOrdinal,
  compactExplorationCardShardPath,
  compactExplorationCardPathForOrdinal,
  compactExplorationManifestPath,
  compactExplorationMembershipPath,
  compactExplorationRankPath,
  decodeMembershipBitset,
  decodeOrdinalRankVector,
  encodeMembershipBitset,
  encodeOrdinalRankVector,
  membershipBitsetByteLength,
  membershipBitsetHas,
  ordinalCardShard,
  rerankExploration,
  type ExplorationCard,
  type ExplorationManifest,
  type ExplorationPage,
  type CompactExplorationCard,
} from "./exploration";
import { SAMPLE_CATALOG } from "./fixtures";
import { ALL_QUERIES, recommendationKey } from "./recommendation-index";
import type { Game, Scored } from "./types";

const baseGame = SAMPLE_CATALOG[0]!;

function game(id: string, overrides: Partial<Game> = {}): Game {
  return {
    ...baseGame,
    id,
    name: id,
    franchise: overrides.franchise,
    releaseDate: overrides.releaseDate ?? "2024-01-01T00:00:00.000Z",
    topTags: overrides.topTags ?? [],
    genres: overrides.genres,
  };
}

function scored(game: Game, score: number): Scored {
  return { game, score, terms: [], marginalSession: false };
}

describe("exploration contracts", () => {
  it("uses 24-card pages and a 96-entry diverse introduction", () => {
    expect(PAGE_SIZE).toBe(24);
    expect(DIVERSE_PREFIX_SIZE).toBe(96);
  });

  it("uses percent-free compact paths for real pipe-delimited query keys", () => {
    expect(COMPACT_EXPLORATION_FORMAT).toBe(1);
    expect(ORDINAL_CARD_SHARD_COUNT).toBe(896);
    const key = recommendationKey(ALL_QUERIES[0]!);

    expect(key).toContain("|");
    expect(compactExplorationManifestPath(key)).toBe(
      "exploration/queries/short_1_0_healing/manifest.json",
    );
    expect(compactExplorationRankPath(key)).toBe(
      "exploration/queries/short_1_0_healing/rank.u32le",
    );
    expect(compactExplorationMembershipPath(key, "new")).toBe(
      "exploration/queries/short_1_0_healing/new.bits",
    );
    const queryDirectories = ALL_QUERIES.map((query) => compactExplorationManifestPath(recommendationKey(query)).split("/")[2]!);
    expect(queryDirectories).toHaveLength(180);
    expect(new Set(queryDirectories)).toHaveLength(180);
    expect(queryDirectories.some((directory) => directory.includes("%"))).toBe(false);
    expect(compactExplorationCardShardPath(7)).toBe("exploration/cards/0007.json");
    expect(ordinalCardShard(0)).toBe(0);
    expect(ordinalCardShard(896)).toBe(0);
    expect(compactExplorationCardPathForOrdinal(1031)).toBe("exploration/cards/0135.json");
    expect(() => compactExplorationMembershipPath("q", "all")).toThrow("filtered view");
    expect(() => compactExplorationCardShardPath(896)).toThrow("card shard");
  });

  it("round-trips rank vectors in explicit little-endian Uint32 format", () => {
    const bytes = encodeOrdinalRankVector([0, 255, 256, 65_535], 70_000);

    expect(Array.from(bytes)).toEqual([
      0, 0, 0, 0,
      255, 0, 0, 0,
      0, 1, 0, 0,
      255, 255, 0, 0,
    ]);
    expect(decodeOrdinalRankVector(bytes, 4, 70_000)).toEqual([0, 255, 256, 65_535]);
  });

  it("rejects malformed rank vectors and out-of-range ordinals", () => {
    expect(() => encodeOrdinalRankVector([3], 3)).toThrow("ordinal");
    expect(() => encodeOrdinalRankVector([-1], 3)).toThrow("ordinal");
    expect(() => encodeOrdinalRankVector([1, 1], 3)).toThrow("duplicate");
    expect(() => decodeOrdinalRankVector(new Uint8Array([0, 0, 0]), 1, 3)).toThrow("byte length");
    expect(() => decodeOrdinalRankVector(new Uint8Array([3, 0, 0, 0]), 1, 3)).toThrow("ordinal");
    expect(() => decodeOrdinalRankVector(new Uint8Array([1, 0, 0, 0, 1, 0, 0, 0]), 2, 3)).toThrow("duplicate");
  });

  it("round-trips fixed-size membership bitsets and ignores invalid lookup ordinals", () => {
    const bits = encodeMembershipBitset([0, 2, 8, 9], 10);

    expect(membershipBitsetByteLength(10)).toBe(2);
    expect(Array.from(bits)).toEqual([0b00000101, 0b00000011]);
    expect(decodeMembershipBitset(bits, 10)).toEqual(bits);
    expect(membershipBitsetHas(bits, 0, 10)).toBe(true);
    expect(membershipBitsetHas(bits, 1, 10)).toBe(false);
    expect(membershipBitsetHas(bits, 9, 10)).toBe(true);
    expect(membershipBitsetHas(bits, -1, 10)).toBe(false);
    expect(membershipBitsetHas(bits, 10, 10)).toBe(false);
  });

  it("rejects malformed membership bitsets, bad ordinals, and nonzero padding", () => {
    expect(() => encodeMembershipBitset([10], 10)).toThrow("ordinal");
    expect(() => decodeMembershipBitset(new Uint8Array([0]), 10)).toThrow("byte length");
    expect(() => decodeMembershipBitset(new Uint8Array([0, 0b11111100]), 10)).toThrow("padding");
  });

  it("places a distinct near-peer ahead of a same-franchise sequel", () => {
    const differentFranchiseHighScore = game("different-franchise-high-score", {
      franchise: "Alpha",
      genres: ["action"],
      topTags: [{ tag: "combat", share: 1 }],
    });
    const sameFranchiseSequel = game("same-franchise-sequel", {
      franchise: "Alpha",
      genres: ["action"],
      topTags: [{ tag: "combat", share: 1 }],
    });
    const nextBestDistinctGame = game("next-best-distinct-game", {
      franchise: "Beta",
      genres: ["puzzle"],
      topTags: [{ tag: "logic", share: 1 }],
      releaseDate: "2014-01-01T00:00:00.000Z",
    });
    const games = [differentFranchiseHighScore, sameFranchiseSequel, nextBestDistinctGame];
    const scores = [
      scored(differentFranchiseHighScore, 1),
      scored(sameFranchiseSequel, 0.99),
      scored(nextBestDistinctGame, 0.98),
    ];

    expect(rerankExploration(games, scores)).toEqual([
      "different-franchise-high-score",
      "next-best-distinct-game",
      "same-franchise-sequel",
    ]);
  });

  it("separates near-peers from the same release era", () => {
    const recentA = game("recent-a", { releaseDate: "2024-01-01T00:00:00.000Z" });
    const recentB = game("recent-b", { releaseDate: "2023-01-01T00:00:00.000Z" });
    const classic = game("classic", { releaseDate: "2010-01-01T00:00:00.000Z" });

    expect(rerankExploration(
      [recentA, recentB, classic],
      [scored(recentA, 1), scored(recentB, 0.99), scored(classic, 0.98)],
    )).toEqual(["recent-a", "classic", "recent-b"]);
  });

  it("keeps entries after the diverse prefix in score then id order", () => {
    const anchors = Array.from({ length: DIVERSE_PREFIX_SIZE - 2 }, (_, index) =>
      game(`anchor-${String(index).padStart(3, "0")}`, { franchise: "Anchor" })
    );
    const overlapGame = game("overlap-game", { franchise: "Tail" });
    const finalPrefixGame = game("final-prefix-game", { franchise: "Tail" });
    const higherScoreTailGame = game("higher-score-tail-game", { franchise: "Tail" });
    const lowerScoreTailGame = game("lower-score-tail-game", { franchise: "Other" });
    const games = [...anchors, overlapGame, finalPrefixGame, higherScoreTailGame, lowerScoreTailGame];
    const scores = [
      ...anchors.map((entry, index) => scored(entry, 200 - index)),
      scored(overlapGame, 3),
      scored(finalPrefixGame, 2),
      scored(higherScoreTailGame, 1),
      scored(lowerScoreTailGame, 0.99),
    ];

    expect(rerankExploration(games, scores).slice(DIVERSE_PREFIX_SIZE)).toEqual([
      "higher-score-tail-game",
      "lower-score-tail-game",
    ]);
  });

  it("uses legacy locale ID ties for exact-score prefix selection and tail order", () => {
    const games = Array.from({ length: DIVERSE_PREFIX_SIZE + 2 }, (_, index) => game(
      index < DIVERSE_PREFIX_SIZE ? `game-${String(index).padStart(3, "0")}` : index === DIVERSE_PREFIX_SIZE ? "game-a" : "game-A",
      { franchise: `franchise-${index}`, releaseDate: "2024-01-01T00:00:00.000Z" },
    ));

    const ranked = rerankExploration(games, games.map((entry) => scored(entry, 1)));

    expect(ranked.slice(96)).toEqual(["game-a", "game-A"]);
  });

  it("uses locale rather than raw ASCII ID order for exact-score prefix ties", () => {
    const lowerCase = game("game-a", { franchise: "A", releaseDate: "2024-01-01T00:00:00.000Z" });
    const upperCase = game("game-A", { franchise: "B", releaseDate: "2024-01-01T00:00:00.000Z" });

    expect("game-A" < "game-a").toBe(true);
    expect("game-a".localeCompare("game-A")).toBeLessThan(0);
    expect(rerankExploration([upperCase, lowerCase], [scored(upperCase, 1), scored(lowerCase, 1)])).toEqual([
      "game-a",
      "game-A",
    ]);
  });

  it("selects the diverse prefix without repeatedly sorting every remaining game", () => {
    const games = Array.from({ length: DIVERSE_PREFIX_SIZE + 4 }, (_, index) =>
      game(`game-${String(index).padStart(3, "0")}`, {
        franchise: `franchise-${index}`,
        releaseDate: `${2000 + index}-01-01T00:00:00.000Z`,
      })
    );
    const scores = games.map((entry, index) => scored(entry, 200 - index));
    const originalSort = Array.prototype.sort;
    let sortCalls = 0;

    Array.prototype.sort = function <T>(this: T[], compareFn?: (a: T, b: T) => number): T[] {
      sortCalls += 1;
      return originalSort.call(this, compareFn);
    };

    try {
      expect(rerankExploration(games, scores)).toEqual(games.map((entry) => entry.id));
    } finally {
      Array.prototype.sort = originalSort;
    }

    expect(sortCalls).toBe(1);
  });

  it("keeps the static payload shapes compact and page-addressable", () => {
    const manifest: ExplorationManifest = {
      generatedAt: "2026-07-30T00:00:00.000Z",
      gameCount: 1,
      pageSize: PAGE_SIZE,
      views: { all: 1, new: 0, rising: 0, discovery: 0, classic: 0 },
    };
    const page: ExplorationPage = { ids: ["game-1"] };
    const card: ExplorationCard = {
      id: "game-1",
      name: "Game 1",
      releaseDate: "2026-01-01T00:00:00.000Z",
      players: { max: 4, online: true, localCoop: false },
      sessionShape: "match",
      coverUrl: "https://example.com/game.jpg",
      storeUrl: "https://example.com/game",
    };

    expect({ manifest, page, card }).toBeTruthy();
  });

  it("requires every compact card to carry a valid ordinal for its deterministic shard", () => {
    const card = {
      id: "game-7",
      name: "Game 7",
      releaseDate: "2026-01-01T00:00:00.000Z",
      players: { max: 4, online: true, localCoop: false },
      sessionShape: "match" as const,
      ordinal: 1031,
    } satisfies CompactExplorationCard;

    expect(compactExplorationCardPathForOrdinal(card.ordinal)).toBe("exploration/cards/0135.json");
    expect(() => assertCompactExplorationCardOrdinal({ ...card, ordinal: 10 }, 10)).toThrow("ordinal");
  });
});
