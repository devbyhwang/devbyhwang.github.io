import { describe, expect, it } from "vitest";
import {
  DIVERSE_PREFIX_SIZE,
  PAGE_SIZE,
  rerankExploration,
  type ExplorationCard,
  type ExplorationManifest,
  type ExplorationPage,
} from "./exploration";
import { SAMPLE_CATALOG } from "./fixtures";
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
      twitchViewers: 10,
      coverUrl: "https://example.com/game.jpg",
      storeUrl: "https://example.com/game",
    };

    expect({ manifest, page, card }).toBeTruthy();
  });
});
