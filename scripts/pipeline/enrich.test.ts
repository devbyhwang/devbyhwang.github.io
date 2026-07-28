import { describe, expect, it } from "vitest";
import {
  classifySessionShape,
  deriveIsNewRelease,
  deriveRawVibes,
  normalizePlayers,
  normalizeVibes,
  resolveViewerPlayable,
} from "./enrich";
import type { SessionRules, TagVibeMap, ViewerPlayableRules } from "./model";

describe("vibe enrichment", () => {
  it("normalizes tag scores with negative weights per axis", () => {
    const weights = {
      Cozy: { healing: 1 },
      Horror: { horror: 1, healing: -1 },
    } satisfies TagVibeMap;
    const raw = {
      a: deriveRawVibes([{ name: "Cozy", share: 1 }], weights),
      b: deriveRawVibes([{ name: "Horror", share: 1 }], weights),
    };

    const normalized = normalizeVibes(raw);

    expect(normalized.a.healing).toBe(1);
    expect(normalized.b.healing).toBe(0);
    expect(Object.values(normalized.a)).toHaveLength(6);
  });

  it("ignores unknown tags and rejects invalid tag shares", () => {
    const weights = { Cozy: { healing: 1 } } satisfies TagVibeMap;

    expect(deriveRawVibes([{ name: "Unknown", share: 0.7 }], weights)).toMatchObject({ healing: 0 });
    expect(() => deriveRawVibes([{ name: "Cozy", share: -0.1 }], weights)).toThrow(RangeError);
    expect(() => deriveRawVibes([{ name: "Cozy", share: 1.1 }], weights)).toThrow(RangeError);
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
