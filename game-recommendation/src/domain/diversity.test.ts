import { describe, expect, it } from "vitest";
import { rerankDiverse } from "./diversity";
import { SAMPLE_CATALOG } from "./fixtures";
import type { Game, Scored } from "./types";

const baseGame = SAMPLE_CATALOG[0]!;

const makeGame = (id: string, overrides: Partial<Game> = {}): Game => ({
  ...baseGame,
  id,
  name: overrides.name ?? id,
  franchise: overrides.franchise,
  players: { ...baseGame.players, ...overrides.players },
  vibes: { ...baseGame.vibes, ...overrides.vibes },
  buzz: { ...baseGame.buzz, ...overrides.buzz },
  streaming: { ...baseGame.streaming, ...overrides.streaming },
  quality: { ...baseGame.quality, ...overrides.quality },
  topTags: overrides.topTags ?? [],
  genres: overrides.genres,
});

const scored = (game: Game, score: number): Scored => ({
  game,
  score,
  terms: [
    { kind: "quality", raw: score, contribution: score * 0.2 },
    { kind: "confidence", raw: 0.8, contribution: 0.08 },
  ],
  marginalSession: false,
});

describe("rerankDiverse", () => {
  it("separates same-franchise candidates when a near-peer alternative exists", () => {
    const sequelA = scored(makeGame("sequel-a", {
      franchise: "Shared",
      topTags: [{ tag: "party", share: 0.5 }, { tag: "co-op", share: 0.3 }],
    }), 0.92);
    const sequelB = scored(makeGame("sequel-b", {
      franchise: "Shared",
      topTags: [{ tag: "party", share: 0.55 }, { tag: "co-op", share: 0.25 }],
    }), 0.9);
    const alternative = scored(makeGame("alternative", {
      topTags: [{ tag: "deckbuilder", share: 0.6 }],
      vibes: { ...baseGame.vibes, hardcore: 0.9, healing: 0 },
    }), 0.89);

    const reranked = rerankDiverse([sequelA, sequelB, alternative], 3);

    expect(reranked.map((entry) => entry.game.id)).toEqual([
      "sequel-a",
      "alternative",
      "sequel-b",
    ]);
  });

  it("breaks ties deterministically by id when redundancy penalties are equal", () => {
    const alpha = scored(makeGame("alpha", { topTags: [{ tag: "solo", share: 1 }] }), 0.8);
    const beta = scored(makeGame("beta", { topTags: [{ tag: "solo", share: 1 }] }), 0.8);

    const reranked = rerankDiverse([beta, alpha], 2);

    expect(reranked.map((entry) => entry.game.id)).toEqual(["alpha", "beta"]);
  });

  it("separates genre duplicates when a near-peer with another genre exists", () => {
    const actionA = scored(makeGame("action-a", { genres: [" Action "] }), 0.92);
    const actionB = scored(makeGame("action-b", { genres: ["action"] }), 0.90);
    const puzzle = scored(makeGame("puzzle", { genres: ["Puzzle"] }), 0.89);

    expect(rerankDiverse([actionA, actionB, puzzle], 3).map((entry) => entry.game.id))
      .toEqual(["action-a", "puzzle", "action-b"]);
  });
});
