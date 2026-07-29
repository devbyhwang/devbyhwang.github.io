import { describe, expect, it } from "vitest";
import { enrichGames, joinSources } from "./join";
import type { KnowledgeAssets } from "./model";

const generatedAt = "2026-07-28T00:00:00.000Z";

const knowledge: KnowledgeAssets = {
  tagVibes: {
    Strategy: { hardcore: 1 },
    Cozy: { healing: 1 },
    Horror: { horror: 1, healing: -1 },
  },
  sessionRules: { rules: [{ shape: "chapter", genresAny: ["Adventure"] }], default: "run" },
  viewerPlayable: { games: {}, tags: {} },
};

function raw(overrides: Record<string, unknown> = {}) {
  return {
    igdb: {
      fetchedAt: generatedAt,
      source: "igdb",
      request: {},
      responses: [],
      warnings: [],
      games: [],
      externalGames: [],
      unresolvedSteamAppIds: [],
    },
    twitch: {
      fetchedAt: generatedAt,
      source: "twitch",
      request: {},
      responses: [],
      warnings: [],
      topGames: [],
      streams: [],
      truncated: false,
    },
    steam: {
      fetchedAt: generatedAt,
      source: "steam",
      request: {},
      responses: [],
      warnings: [],
      topSellerAppIds: [],
      apps: [],
      staleSources: [],
    },
    ...overrides,
  } as Parameters<typeof joinSources>[0];
}

describe("numeric IGDB joins", () => {
  it("joins all sources by IGDB id even when source names differ", () => {
    const games = joinSources(raw({
      igdb: {
        ...raw().igdb,
        games: [{ id: 42, name: "Canonical Name", first_release_date: 1784505600, external_games: [{ external_game_source: 1, uid: "730" }] }],
      },
      twitch: {
        ...raw().twitch,
        topGames: [{ igdbId: "42", categoryId: "99", name: "Different Twitch Label", boxArtUrl: "https://static-cdn.jtvnw.net/ttv-boxart/Fixture-{width}x{height}.jpg" }],
        streams: [{ igdbId: "42", categoryId: "99", viewers: 1200, channels: 12 }],
      },
      steam: {
        ...raw().steam,
        apps: [{ appId: 730, name: "Different Steam Label", tags: { Strategy: 10, Cozy: 5 }, positive: 90, negative: 10, owners: "", price: "0", discount: "0" }],
      },
    }));

    expect(games).toHaveLength(1);
    expect(games[0]).toMatchObject({
      igdb: { id: 42, name: "Canonical Name" },
      steam: { appId: 730 },
      twitch: {
        viewers: 1200,
        channels: 12,
        boxArtUrl: "https://static-cdn.jtvnw.net/ttv-boxart/Fixture-{width}x{height}.jpg",
      },
    });
    expect(games[0].tags).toEqual([{ name: "Strategy", share: 1 }, { name: "Cozy", share: 0.5 }]);
  });

  it("keeps the first canonical IGDB record and prefers a fetched Steam source-1 mapping", () => {
    const games = joinSources(raw({
      igdb: {
        ...raw().igdb,
        games: [
          { id: 7, name: "First Canonical", first_release_date: 1784505600, external_games: [{ external_game_source: 2, uid: "999" }, { external_game_source: 1, uid: "999" }, { external_game_source: 1, uid: "730" }] },
          { id: 7, name: "Duplicate Must Not Win", first_release_date: 1784505600 },
        ],
        externalGames: [{ game: 7, external_game_source: 1, uid: "730" }],
      },
      steam: {
        ...raw().steam,
        apps: [{ appId: 730, tags: {}, positive: 0, negative: 0, owners: "", price: "0", discount: "0" }],
      },
    }));

    expect(games).toHaveLength(1);
    expect(games[0].igdb.name).toBe("First Canonical");
    expect(games[0].steam?.appId).toBe(730);
  });

  it("keeps IGDB recent and resolved Steam seller candidates without Twitch, but excludes unresolved Steam ids", () => {
    const games = joinSources(raw({
      igdb: {
        ...raw().igdb,
        games: [
          { id: 7, name: "IGDB recent", first_release_date: 1784505600 },
          { id: 88, name: "Steam seller", first_release_date: 1784505600 },
        ],
        externalGames: [{ game: 88, external_game_source: 1, uid: "730" }],
        unresolvedSteamAppIds: [999],
      },
      steam: {
        ...raw().steam,
        topSellerAppIds: [730, 999],
        apps: [
          { appId: 730, tags: {}, positive: 0, negative: 0, owners: "", price: "0", discount: "0" },
          { appId: 999, tags: {}, positive: 0, negative: 0, owners: "", price: "0", discount: "0" },
        ],
      },
    }));

    expect(games.map((game) => game.igdb.id)).toEqual([7, 88]);
    expect(games[0].twitch).toEqual({ viewers: 0, channels: 0 });
    expect(games[1].steam?.appId).toBe(730);
  });
});

describe("GameRecord enrichment", () => {
  it("uses Twitch box art when IGDB has no cover and keeps IGDB cover precedence", () => {
    const records = enrichGames(joinSources(raw({
      igdb: {
        ...raw().igdb,
        games: [
          { id: 42, name: "Twitch cover", first_release_date: 1784505600 },
          { id: 43, name: "IGDB cover", first_release_date: 1784505600, cover: { image_id: "igdb-cover" } },
        ],
      },
      twitch: {
        ...raw().twitch,
        topGames: [
          { igdbId: "42", categoryId: "42", name: "Twitch cover", boxArtUrl: "https://static-cdn.jtvnw.net/ttv-boxart/Fixture-{width}x{height}.jpg" },
          { igdbId: "43", categoryId: "43", name: "IGDB cover", boxArtUrl: "https://static-cdn.jtvnw.net/ttv-boxart/Should-not-win-{width}x{height}.jpg" },
        ],
      },
    })), knowledge, generatedAt);

    expect(records).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: "42", coverUrl: "https://static-cdn.jtvnw.net/ttv-boxart/Fixture-285x380.jpg" }),
      expect.objectContaining({ id: "43", coverUrl: "https://images.igdb.com/igdb/image/upload/t_cover_big/igdb-cover.jpg" }),
    ]));
  });

  it("uses release dates, Steam review data, top tags, and Task 3 enrichment rules", () => {
    const records = enrichGames(joinSources(raw({
      igdb: {
        ...raw().igdb,
        games: [
          {
            id: 42,
            name: "Canonical Name",
            first_release_date: 1784505600,
            cover: { image_id: "cover42" },
            genres: [{ name: "Adventure" }],
            multiplayer_modes: [{ onlinecoopmax: 4, onlinemax: 4 }],
            rating: 73,
            rating_count: 9,
            external_games: [{ external_game_source: 1, uid: "730" }],
          },
          { id: 43, name: "No date" },
        ],
      },
      twitch: { ...raw().twitch, streams: [{ igdbId: "42", categoryId: "99", viewers: 1200, channels: 12 }] },
      steam: {
        ...raw().steam,
        apps: [{ appId: 730, tags: { Strategy: 10, Cozy: 5, Horror: 1 }, positive: 90, negative: 10, owners: "", price: "0", discount: "15" }],
      },
    })), knowledge, generatedAt);

    expect(records).toHaveLength(1);
    expect(records[0]).toMatchObject({
      id: "42",
      steamAppId: 730,
      coverUrl: "https://images.igdb.com/igdb/image/upload/t_cover_big/cover42.jpg",
      storeUrl: "https://store.steampowered.com/app/730/",
      releaseDate: "2026-07-20T00:00:00.000Z",
      players: { max: 4, source: "igdb_multiplayer" },
      sessionShape: "chapter",
      viewerPlayable: { ok: false },
      buzz: { twitchViewers: 1200, twitchChannels: 12, viewerGrowth7d: null, isNewRelease: true },
      rating: 90,
      reviewCount: 100,
      discountPercent: 15,
    });
    expect(records[0].topTags).toEqual([
      { tag: "Strategy", share: 1 },
      { tag: "Cozy", share: 0.5 },
      { tag: "Horror", share: 0.1 },
    ]);
    expect(Object.entries(records[0].vibes)).toHaveLength(6);
  });

  it("passes Steam Store categories through to the player fallback", () => {
    const records = enrichGames(joinSources(raw({
      igdb: {
        ...raw().igdb,
        games: [{
          id: 42,
          name: "Steam category multiplayer",
          first_release_date: 1784505600,
          external_games: [{ external_game_source: 1, uid: "730" }],
        }],
      },
      steam: {
        ...raw().steam,
        apps: [{
          appId: 730,
          tags: {},
          categories: ["Multi-player"],
          positive: 0,
          negative: 0,
          owners: "",
          price: "0",
          discount: "0",
        }],
      },
    })), knowledge, generatedAt);

    expect(records[0].players).toEqual({
      max: 2,
      source: "steam_categories",
      online: true,
      localCoop: false,
    });
  });

  it("falls back to IGDB rating and rating count when Steam has no reviews", () => {
    const records = enrichGames(joinSources(raw({
      igdb: {
        ...raw().igdb,
        games: [{ id: 77, name: "IGDB reviews", first_release_date: 1784505600, rating: 81, rating_count: 18 }],
      },
    })), knowledge, generatedAt);

    expect(records[0]).toMatchObject({ rating: 81, reviewCount: 18 });
  });

  it("keeps legacy top-level IGDB-only rating fields on the raw user score while shrinking quality.totalRating", () => {
    const records = enrichGames(joinSources(raw({
      igdb: {
        ...raw().igdb,
        games: [{
          id: 77,
          name: "IGDB quality split",
          first_release_date: 1784505600,
          rating: 81,
          rating_count: 18,
          aggregated_rating: 87,
          aggregated_rating_count: 12,
          total_rating: 83,
          total_rating_count: 30,
        }],
      },
    })), knowledge, generatedAt);

    expect(records[0]).toMatchObject({
      rating: 81,
      reviewCount: 18,
      quality: {
        igdbRating: 81,
        igdbRatingCount: 18,
        criticRating: 87,
        criticRatingCount: 12,
        totalRating: 77.0909090909091,
        totalRatingCount: 30,
      },
    });
  });

  it("keeps only the eight highest SteamSpy tag shares", () => {
    const tags = Object.fromEntries(Array.from({ length: 9 }, (_, index) => [`Tag ${index + 1}`, 9 - index]));
    const records = enrichGames(joinSources(raw({
      igdb: {
        ...raw().igdb,
        games: [{ id: 42, name: "Many tags", first_release_date: 1784505600, external_games: [{ external_game_source: 1, uid: "730" }] }],
      },
      steam: { ...raw().steam, apps: [{ appId: 730, tags, positive: 0, negative: 0, owners: "", price: "0", discount: "0" }] },
    })), knowledge, generatedAt);

    expect(records[0].topTags).toHaveLength(8);
    expect(records[0].topTags.map((tag) => tag.tag)).toEqual(["Tag 1", "Tag 2", "Tag 3", "Tag 4", "Tag 5", "Tag 6", "Tag 7", "Tag 8"]);
  });
});
