import { describe, expect, it } from "vitest";
import { ALL_QUERIES } from "../../game-recommendation/src/domain/recommendation-index";
import type { CatalogRecord } from "./model";
import { emitRecommendations, readRecommendations, RECOMMENDATIONS_PATH } from "./recommendations";
import type { FileStore } from "./emit";

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
      buzz: { twitchViewers: 0, twitchChannels: 0, viewerGrowth7d: null, isNewRelease: true, demandShare: 0, sources: { chzzk: false, twitch: true } },
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
    })),
  };
}

function memoryFileStore(seed: Record<string, string> = {}) {
  const files = new Map(Object.entries(seed));
  const fs: FileStore = {
    read: (path) => files.get(path) ?? null,
    writeAtomic: (path, contents) => { files.set(path, contents); },
    delete: (path) => { files.delete(path); },
  };
  return { fs, files };
}

describe("recommendation index emission", () => {
  it("writes one full-catalog recommendation for every query", () => {
    const { fs } = memoryFileStore();

    const index = emitRecommendations(catalogWith(2), fs);

    expect(Object.keys(index.recommendations)).toHaveLength(ALL_QUERIES.length);
    expect(index.gameCount).toBe(2);
    expect(JSON.parse(fs.read(RECOMMENDATIONS_PATH)!)).toEqual(index);
    expect(readRecommendations(fs)).toEqual(index);
  });

  it("rejects an index missing a supported query", () => {
    const { fs, files } = memoryFileStore();
    const index = emitRecommendations(catalogWith(1), fs);
    delete index.recommendations[Object.keys(index.recommendations)[0]];
    files.set(RECOMMENDATIONS_PATH, JSON.stringify(index));

    expect(() => readRecommendations(fs)).toThrow("missing recommendation");
  });

  it.each([
    ["why", [{ kind: "demand" }], []],
    ["terms", [{ kind: "demand", text: "Demand" }], [{ kind: "demand", raw: 1 }]],
  ])("rejects malformed pick %s details", (_field, why, terms) => {
    const catalog = catalogWith(1);
    const { fs, files } = memoryFileStore();
    const index = emitRecommendations(catalog, fs);
    const recommendation = index.recommendations[Object.keys(index.recommendations)[0]];
    recommendation.picks = [{ slot: "safe", game: catalog.games[0], score: 1, why: why as never, terms: terms as never }];
    files.set(RECOMMENDATIONS_PATH, JSON.stringify(index));

    expect(() => readRecommendations(fs)).toThrow(_field);
  });
});
