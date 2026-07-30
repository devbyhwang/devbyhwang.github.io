import { describe, expect, it } from "vitest";
import {
  classifySessionShape,
  deriveIsNewRelease,
  deriveVibes,
  normalizePlayers,
  resolveViewerPlayable,
} from "./enrich";
import type { SessionRules, ViewerPlayableRules } from "./model";
import type { VibeWeights } from "./model";

const WEIGHTS = {
  genres: { Puzzle: { healing: 0.5 }, Shooter: { hardcore: 0.6 } },
  themes: { Horror: { horror: 1 }, Comedy: { variety: 0.5 }, Party: { variety: 0.5 } },
  tags: { Cozy: { healing: 1 } },
} satisfies VibeWeights;

const EMPTY = { genres: [], themes: [], tags: [] };

describe("deriveVibes", () => {
  it("returns all zeros when the game has no known terms", () => {
    expect(deriveVibes(EMPTY, WEIGHTS)).toEqual({
      healing: 0, variety: 0, horror: 0, hardcore: 0, chatting: 0, spectacle: 0,
    });
  });

  it("ignores terms absent from the vocabulary", () => {
    expect(deriveVibes({ ...EMPTY, genres: ["Unmapped"], themes: ["Alsomissing"] }, WEIGHTS).healing).toBe(0);
  });

  it("saturates on a single full-weight term", () => {
    expect(deriveVibes({ ...EMPTY, themes: ["Horror"] }, WEIGHTS).horror).toBe(1);
  });

  it("combines two weak terms without exceeding one", () => {
    expect(deriveVibes({ ...EMPTY, themes: ["Comedy", "Party"] }, WEIGHTS).variety).toBeCloseTo(0.75, 10);
  });

  it("attenuates tag contributions by share", () => {
    expect(deriveVibes({ ...EMPTY, tags: [{ name: "Cozy", share: 0.4 }] }, WEIGHTS).healing).toBeCloseTo(0.4, 10);
  });

  it("counts a repeated term only once", () => {
    expect(deriveVibes({ ...EMPTY, genres: ["Puzzle", "Puzzle"] }, WEIGHTS).healing).toBeCloseTo(0.5, 10);
  });

  it("combines across genres, themes and tags", () => {
    const result = deriveVibes(
      { genres: ["Puzzle"], themes: ["Comedy"], tags: [{ name: "Cozy", share: 0.5 }] },
      WEIGHTS,
    );
    expect(result.healing).toBeCloseTo(0.75, 10);
    expect(result.variety).toBeCloseTo(0.5, 10);
  });

  it("does not depend on other games in the catalog", () => {
    const alone = deriveVibes({ ...EMPTY, genres: ["Puzzle"] }, WEIGHTS);
    const again = deriveVibes({ ...EMPTY, genres: ["Puzzle"] }, WEIGHTS);
    expect(alone).toEqual(again);
  });

  it("rejects a tag share outside zero to one", () => {
    expect(() => deriveVibes({ ...EMPTY, tags: [{ name: "Cozy", share: -0.1 }] }, WEIGHTS)).toThrow(RangeError);
    expect(() => deriveVibes({ ...EMPTY, tags: [{ name: "Cozy", share: 1.1 }] }, WEIGHTS)).toThrow(RangeError);
  });
});

describe("session and viewer-playable enrichment", () => {
  const sessionRules: SessionRules = {
    rules: [
      { shape: "chapter", tagsAny: ["Story Rich"] },
      { shape: "openended", genresAny: ["Adventure"] },
    ],
    default: "run",
  };
  const viewerRules: ViewerPlayableRules = {
    games: { "119171": { ok: true, reason: "Among Us lobby" } },
    tags: { "Party Game": { ok: true, reason: "party participation" } },
  };

  it("returns the first case-insensitive session rule match", () => {
    expect(classifySessionShape({ genres: ["ADVENTURE"], tags: ["story rich"] }, sessionRules)).toBe("chapter");
    expect(classifySessionShape({ genres: ["Puzzle"], tags: [] }, sessionRules)).toBe("run");
  });

  it("prefers curated ids over tag heuristics and rejects unmatched games", () => {
    expect(resolveViewerPlayable("119171", ["Party Game"], viewerRules)).toEqual({ ok: true, reason: "Among Us lobby" });
    expect(resolveViewerPlayable("other", ["party game"], viewerRules)).toEqual({ ok: true, reason: "party participation" });
    expect(resolveViewerPlayable("other", ["Solo"], viewerRules)).toEqual({ ok: false });
  });
});

describe("player and release enrichment", () => {
  it("uses IGDB multiplayer, game modes, Steam categories, then unknown", () => {
    expect(normalizePlayers(
      { multiplayer_modes: [{ onlinecoopmax: 4, onlinemax: 8, offlinecoopmax: 2, offlinemax: 6 }], game_modes: ["Multiplayer"] },
      { categories: ["Multi-player"] },
    )).toEqual({ max: 8, source: "igdb_multiplayer", online: true, localCoop: true });
    expect(normalizePlayers({ multiplayer_modes: [{ onlinecoop: true }], game_modes: ["Multiplayer"] }, { categories: ["Multi-player"] }))
      .toEqual({ max: 2, source: "igdb_gamemodes", online: true, localCoop: false });
    expect(normalizePlayers({ game_modes: [] }, { categories: ["Multi-player"] }))
      .toEqual({ max: 2, source: "steam_categories", online: true, localCoop: false });
    expect(normalizePlayers({}, { categories: [] }))
      .toEqual({ max: "unknown", source: "unknown", online: false, localCoop: false });
  });

  it("derives four players from a real-shaped IGDB multiplayer payload", () => {
    expect(normalizePlayers(
      { multiplayer_modes: [{ onlinecoopmax: 4, onlinemax: 4 }] },
      { categories: [] },
    )).toEqual({ max: 4, source: "igdb_multiplayer", online: true, localCoop: false });
  });

  it("derives new-release status from the supplied catalog timestamp", () => {
    expect(deriveIsNewRelease("2026-06-28T00:00:00.000Z", "2026-07-28T00:00:00.000Z")).toBe(true);
    expect(deriveIsNewRelease("2026-06-27T00:00:00.000Z", "2026-07-28T00:00:00.000Z")).toBe(false);
    expect(deriveIsNewRelease("2026-07-29T00:00:00.000Z", "2026-07-28T00:00:00.000Z")).toBe(false);
  });
});
