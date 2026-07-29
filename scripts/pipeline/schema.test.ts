import { describe, expect, it } from "vitest";
import type { CatalogRecord, GameRecord } from "./model";
import { validateCatalog } from "./schema";
import * as schemaModule from "./schema";

const generatedAt = "2026-07-28T00:00:00.000Z";

function validGame(): GameRecord {
  return {
    id: "valid",
    name: "Valid",
    releaseDate: "2026-07-20T00:00:00.000Z",
    players: { max: "unknown", source: "unknown", online: false, localCoop: false },
    sessionShape: "run",
    viewerPlayable: { ok: false },
    vibes: { healing: 0.5, variety: 0.5, horror: 0.5, hardcore: 0.5, chatting: 0.5, spectacle: 0.5 },
    buzz: { twitchViewers: 0, twitchChannels: 0, viewerGrowth7d: null, isNewRelease: true },
    streaming: {
      totalViewers: 0,
      channelCount: 0,
      medianViewersPerChannel: null,
      p75ViewersPerChannel: null,
      top10ViewerShare: null,
      viewerConcentration: null,
      growth7d: null,
      growth30d: null,
      growth90d: null,
      volatility30d: null,
      observedSnapshots: 0,
      coverage: 0,
      asOf: generatedAt,
    },
    quality: {},
    topTags: [],
    rating: 50,
    reviewCount: 0,
  };
}

function validCatalog(): CatalogRecord {
  return {
    generatedAt,
    games: [validGame()],
  };
}

describe("validateCatalog", () => {
  it("rejects a game without streaming.totalViewers", () => {
    const catalog = validCatalog();
    delete (catalog.games[0].streaming as Partial<typeof catalog.games[0]["streaming"]>).totalViewers;

    expect(() => validateCatalog(catalog)).toThrow("games[0].streaming.totalViewers");
  });

  it("rejects a negative streaming.viewerConcentration", () => {
    const catalog = validCatalog();
    catalog.games[0].streaming.viewerConcentration = -0.01;

    expect(() => validateCatalog(catalog)).toThrow("games[0].streaming.viewerConcentration");
  });

  it("rejects an invalid quality.totalRatingCount", () => {
    const catalog = validCatalog();
    catalog.games[0].quality.totalRatingCount = -1;

    expect(() => validateCatalog(catalog)).toThrow("games[0].quality.totalRatingCount");
  });

  it("accepts an inactive historical game with nullable growth and volatility", () => {
    const catalog = validCatalog();
    catalog.games[0] = {
      ...catalog.games[0],
      releaseDate: "2024-07-28T00:00:00.000Z",
      buzz: { twitchViewers: 0, twitchChannels: 0, viewerGrowth7d: null, isNewRelease: false },
      streaming: {
        ...catalog.games[0].streaming,
        growth7d: null,
        growth30d: null,
        growth90d: null,
        volatility30d: null,
        observedSnapshots: 0,
      },
    };

    expect(() => validateCatalog(catalog)).not.toThrow();
  });

  it("accepts negative historical growth values for decline", () => {
    const catalog = validCatalog();
    catalog.games[0].buzz.viewerGrowth7d = -0.42;
    catalog.games[0].streaming.growth7d = -0.42;
    catalog.games[0].streaming.growth30d = -0.55;
    catalog.games[0].streaming.growth90d = -0.73;

    expect(() => validateCatalog(catalog)).not.toThrow();
  });
});

describe("historical catalog chunk contracts", () => {
  it("rejects a manifest with duplicate chunk paths", () => {
    const validateCatalogManifest = (schemaModule as Record<string, unknown>).validateCatalogManifest;

    expect(typeof validateCatalogManifest).toBe("function");
    if (typeof validateCatalogManifest !== "function") return;

    expect(() => validateCatalogManifest({
      generatedAt,
      gameCount: 2,
      chunks: ["catalog-0001.json", "catalog-0001.json"],
    })).toThrow("chunks");
  });

  it("rejects a chunk whose generatedAt does not match the manifest", () => {
    const validateCatalogChunk = (schemaModule as Record<string, unknown>).validateCatalogChunk;

    expect(typeof validateCatalogChunk).toBe("function");
    if (typeof validateCatalogChunk !== "function") return;

    expect(() => validateCatalogChunk({
      generatedAt: "2026-07-27T00:00:00.000Z",
      games: [validGame()],
    }, generatedAt)).toThrow("generatedAt");
  });
});
