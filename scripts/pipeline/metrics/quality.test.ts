import { describe, expect, it } from "vitest";
import type { HttpClient, IgdbFetchInput, IgdbGame, SteamApp } from "../model";
import { fetchIgdb } from "../sources/igdb";
import { bayesianRating, qualityStats } from "./quality";

function game(overrides: Partial<IgdbGame> = {}): IgdbGame {
  return {
    id: 42,
    name: "Fixture Game",
    ...overrides,
  };
}

function steam(overrides: Partial<SteamApp> = {}): SteamApp {
  return {
    appId: 730,
    tags: {},
    positive: 0,
    negative: 0,
    owners: "",
    price: "0",
    discount: "0",
    ...overrides,
  };
}

describe("bayesianRating", () => {
  it("returns null when the value or count is missing", () => {
    expect(bayesianRating(undefined, 5, 70, 25)).toBeNull();
    expect(bayesianRating(95, undefined, 70, 25)).toBeNull();
  });

  it("shrinks small samples toward the prior and keeps large samples near the source", () => {
    expect(bayesianRating(100, 5, 70, 25)).toBeCloseTo(75, 6);
    expect(bayesianRating(95, 5_000, 70, 25)).toBeCloseTo(94.8756218905, 6);
  });

  it("bounds scores to the 0 to 100 range", () => {
    expect(bayesianRating(140, 5, 70, 0)).toBe(100);
    expect(bayesianRating(-25, 5, 70, 0)).toBe(0);
  });
});

describe("qualityStats", () => {
  it("prefers IGDB total rating without double-counting its user and critic components", () => {
    expect(qualityStats(
      game({
        rating: 81,
        rating_count: 18,
        aggregated_rating: 92,
        aggregated_rating_count: 44,
        total_rating: 88,
        total_rating_count: 50,
      }),
      steam({ positive: 900, negative: 100 }),
    )).toEqual({
      igdbRating: 81,
      igdbRatingCount: 18,
      criticRating: 92,
      criticRatingCount: 44,
      totalRating: 82,
      totalRatingCount: 50,
      steamPositive: 900,
      steamNegative: 100,
    });
  });

  it("falls back to the most information-rich IGDB component when total rating is missing", () => {
    expect(qualityStats(
      game({
        rating: 84,
        rating_count: 12,
        aggregated_rating: 91,
        aggregated_rating_count: 45,
      }),
      undefined,
    )).toEqual({
      igdbRating: 84,
      igdbRatingCount: 12,
      criticRating: 91,
      criticRatingCount: 45,
      totalRating: 83.5,
      totalRatingCount: 45,
    });
  });

  it("falls back to the user score when no critic or total score is available", () => {
    expect(qualityStats(
      game({
        rating: 79,
        rating_count: 7,
      }),
      undefined,
    )).toEqual({
      igdbRating: 79,
      igdbRatingCount: 7,
      totalRating: 71.96875,
      totalRatingCount: 7,
    });
  });

  it("does not let a count-only total block critic fallback and preserves the raw total count", () => {
    expect(qualityStats(
      game({
        rating: 84,
        rating_count: 12,
        aggregated_rating: 91,
        aggregated_rating_count: 45,
        total_rating_count: 200,
      }),
      undefined,
    )).toEqual({
      igdbRating: 84,
      igdbRatingCount: 12,
      criticRating: 91,
      criticRatingCount: 45,
      totalRating: 83.5,
      totalRatingCount: 200,
    });
  });

  it("preserves missing quality fields instead of manufacturing zeros", () => {
    expect(qualityStats(game(), undefined)).toEqual({});
  });
});

describe("IGDB quality field queries", () => {
  it("requests aggregated and total rating fields on game queries", async () => {
    const posts: Array<{ url: string; body: string }> = [];
    const http: HttpClient = {
      getJson: async () => {
        throw new Error("getJson not used");
      },
      postJson: async <T>(url: string, body: string) => {
        posts.push({ url, body });
        if (url === "https://id.twitch.tv/oauth2/token") return { access_token: "fixture-token" } as T;
        if (url.endsWith("/games")) return [] as T;
        if (url.endsWith("/external_games")) return [] as T;
        throw new Error(`unexpected URL ${url}`);
      },
    };

    const input: IgdbFetchInput = {
      clientId: "client",
      clientSecret: "secret",
      asOf: "2026-07-28T00:00:00.000Z",
      recentDays: 60,
      topIgdbIds: ["42"],
      steamAppIds: [],
    };

    await fetchIgdb(input, http);

    const gameBodies = posts.filter((request) => request.url.endsWith("/games")).map((request) => request.body);
    expect(gameBodies).toEqual(expect.arrayContaining([
      expect.stringContaining("aggregated_rating"),
      expect.stringContaining("aggregated_rating_count"),
      expect.stringContaining("total_rating"),
      expect.stringContaining("total_rating_count"),
    ]));
  });
});
