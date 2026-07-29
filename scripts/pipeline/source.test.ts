import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createHttpClient, saveRaw } from "./http";
import { fetchIgdb } from "./sources/igdb";
import { fetchSteam, mergeSteamSnapshots } from "./sources/steam";
import { fetchTwitch } from "./sources/twitch";

const temporaryPaths: string[] = [];

afterEach(async () => {
  await Promise.all(temporaryPaths.splice(0).map((path) => rm(path, { recursive: true, force: true })));
});

async function fixture(name: string): Promise<Record<string, any>> {
  return JSON.parse(await readFile(`data/raw/fixtures/${name}.json`, "utf8"));
}

async function temporaryPath(name: string): Promise<string> {
  const directory = await mkdtemp(join(tmpdir(), "catalog-source-"));
  temporaryPaths.push(directory);
  return join(directory, name);
}

function json(value: unknown, status = 200): Response {
  return new Response(JSON.stringify(value), { status, headers: { "content-type": "application/json" } });
}

describe("HTTP raw support", () => {
  it("retries a 429 response and returns the later JSON response", async () => {
    vi.useFakeTimers();
    const fetcher = vi.fn()
      .mockResolvedValueOnce(new Response("slow down", { status: 429 }))
      .mockResolvedValueOnce(json({ ok: true }));
    const pending = createHttpClient(fetcher).getJson<{ ok: boolean }>("https://fixture.test/retry");

    await vi.runAllTimersAsync();
    await expect(pending).resolves.toEqual({ ok: true });
    expect(fetcher).toHaveBeenCalledTimes(2);
    vi.useRealTimers();
  });

  it("includes URL, status, and a bounded response preview for non-retriable failures", async () => {
    const http = createHttpClient(vi.fn().mockResolvedValue(new Response("invalid request", { status: 400 })));

    await expect(http.getJson("https://fixture.test/bad")).rejects.toThrow("https://fixture.test/bad: 400: invalid request");
  });

  it("writes a complete raw JSON file through its atomic cache helper", async () => {
    const path = await temporaryPath("latest.json");

    await saveRaw(path, { fetchedAt: "2026-07-28T00:00:00.000Z", responses: [{ id: 1 }] });

    await expect(readFile(path, "utf8")).resolves.toBe('{"fetchedAt":"2026-07-28T00:00:00.000Z","responses":[{"id":1}]}\n');
  });
});

describe("Twitch source", () => {
  it("paginates top games and streams, de-duplicates stream users, excludes blank IGDB ids, and preserves non-auth raw bodies", async () => {
    const data = await fixture("twitch");
    let topPage = 0;
    let streamPage = 0;
    const fetcher = vi.fn(async (url: string) => {
      if (url === "https://id.twitch.tv/oauth2/token") return json(data.oauth);
      if (url.startsWith("https://api.twitch.tv/helix/games/top")) return json(data.topPages[topPage++]);
      if (url.startsWith("https://api.twitch.tv/helix/games?")) return json(data.gamesByIgdb);
      if (url.startsWith("https://api.twitch.tv/helix/streams?")) return json(data.streamPages[streamPage++]);
      throw new Error(`unexpected URL ${url}`);
    });

    const snapshot = await fetchTwitch(
      { clientId: "client", clientSecret: "secret", topGameLimit: 100, streamPageLimit: 20 },
      createHttpClient(fetcher as typeof fetch),
    );

    expect(snapshot.topGames).toEqual([
      {
        categoryId: "10",
        igdbId: 42,
        name: "Fixture Game",
        boxArtUrl: "https://static-cdn.jtvnw.net/ttv-boxart/Fixture-{width}x{height}.jpg",
      },
      { categoryId: "12", igdbId: 43, name: "Second Fixture Game" },
    ]);
    expect(snapshot.streams).toEqual([
      {
        categoryId: "10",
        igdbId: 42,
        viewers: 175,
        channels: 2,
        medianViewersPerChannel: 50,
        p75ViewersPerChannel: 75,
        top10ViewerShare: 1,
        viewerConcentration: (100 / 175) ** 2 + (50 / 175) ** 2 + (25 / 175) ** 2,
        coverage: 1,
      },
      {
        categoryId: "12",
        igdbId: 43,
        viewers: 0,
        channels: 0,
        medianViewersPerChannel: 0,
        p75ViewersPerChannel: 0,
        top10ViewerShare: 0,
        viewerConcentration: 0,
        coverage: 1,
      },
    ]);
    expect(snapshot.streamObservations).toEqual([
      { categoryId: "10", gameId: "10", igdbId: 42, language: "en", userId: "u1", viewerCount: 100 },
      { categoryId: "10", gameId: "10", igdbId: 42, language: "en", userId: "u2", viewerCount: 50 },
      { categoryId: "10", gameId: "10", igdbId: 42, language: "en", userId: "u1", viewerCount: 25 },
    ]);
    expect(snapshot.warnings).toContain("Twitch category 11 (No IGDB) is missing an IGDB id");
    expect(snapshot.responses).toContainEqual(data.topPages[0]);
    expect(snapshot.responses).toContainEqual(data.streamPages[1]);
    expect(JSON.stringify(snapshot)).not.toContain("fixture-twitch-token");
    expect(JSON.stringify(snapshot)).not.toContain("secret");
    expect(fetcher.mock.calls.map(([url]) => url)).toContain("https://api.twitch.tv/helix/games/top?first=100&after=next-top");
    expect(fetcher.mock.calls.map(([url]) => url)).toContain("https://api.twitch.tv/helix/games?igdb_id=42&igdb_id=43");
    expect(fetcher.mock.calls.map(([url]) => url)).toContain("https://api.twitch.tv/helix/streams?game_id=10&first=100&after=next-stream");
  });

  it("records reduced coverage instead of inventing zero-viewer tails when stream pagination truncates", async () => {
    const fetcher = vi.fn(async (url: string) => {
      if (url === "https://id.twitch.tv/oauth2/token") return json({ access_token: "fixture-token" });
      if (url.startsWith("https://api.twitch.tv/helix/games/top")) {
        return json({ data: [{ id: "10", name: "Fixture Game", igdb_id: "42" }], pagination: {} });
      }
      if (url.startsWith("https://api.twitch.tv/helix/games?")) {
        return json({ data: [{ id: "10", name: "Fixture Game", igdb_id: "42" }] });
      }
      if (url.startsWith("https://api.twitch.tv/helix/streams?")) {
        return json({
          data: [
            { user_id: "u1", viewer_count: 100, language: "ko", game_id: "10" },
            { user_id: "u2", viewer_count: 50, language: "en", game_id: "10" },
          ],
          pagination: { cursor: "more" },
        });
      }
      throw new Error(`unexpected URL ${url}`);
    });

    const snapshot = await fetchTwitch(
      { clientId: "client", clientSecret: "secret", topGameLimit: 1, streamPageLimit: 1 },
      createHttpClient(fetcher as typeof fetch),
    );

    expect(snapshot.truncated).toBe(true);
    expect(snapshot.streams).toEqual([{
      categoryId: "10",
      igdbId: 42,
      viewers: 150,
      channels: 2,
      medianViewersPerChannel: 75,
      p75ViewersPerChannel: 75,
      top10ViewerShare: 1,
      viewerConcentration: (100 / 150) ** 2 + (50 / 150) ** 2,
      coverage: 0.5,
    }]);
    expect(snapshot.streamObservations).toEqual([
      { categoryId: "10", gameId: "10", igdbId: 42, language: "ko", userId: "u1", viewerCount: 100 },
      { categoryId: "10", gameId: "10", igdbId: 42, language: "en", userId: "u2", viewerCount: 50 },
    ]);
    expect(snapshot.warnings).toContain("Twitch stream pages truncated for category 10");
  });

  it("splits more than 100 IGDB category IDs into repeated-parameter batches", async () => {
    const topGames = Array.from({ length: 101 }, (_, index) => ({
      id: `category-${index + 1}`,
      name: `Fixture ${index + 1}`,
      igdb_id: String(index + 1),
    }));
    const fetcher = vi.fn(async (url: string) => {
      if (url === "https://id.twitch.tv/oauth2/token") return json({ access_token: "fixture-token" });
      if (url.startsWith("https://api.twitch.tv/helix/games/top")) return json({ data: topGames, pagination: {} });
      if (url.startsWith("https://api.twitch.tv/helix/games?")) return json({ data: [] });
      if (url.startsWith("https://api.twitch.tv/helix/streams?")) return json({ data: [], pagination: {} });
      throw new Error(`unexpected URL ${url}`);
    });

    await fetchTwitch(
      { clientId: "client", clientSecret: "secret", topGameLimit: 101, streamPageLimit: 1 },
      createHttpClient(fetcher as typeof fetch),
    );

    const lookupBatches = fetcher.mock.calls
      .map(([url]) => String(url))
      .filter((url) => url.startsWith("https://api.twitch.tv/helix/games?"))
      .map((url) => new URL(url).searchParams.getAll("igdb_id"));
    expect(lookupBatches).toEqual([
      Array.from({ length: 100 }, (_, index) => String(index + 1)),
      ["101"],
    ]);
  });
});

describe("IGDB source", () => {
  it("unions recent and Twitch games, maps Steam source-one external ids, and preserves source bodies without credentials", async () => {
    const data = await fixture("igdb");
    let gamesRequest = 0;
    const posts: Array<{ url: string; body: string }> = [];
    const fetcher = vi.fn(async (url: string, init?: RequestInit) => {
      const body = String(init?.body ?? "");
      posts.push({ url, body });
      if (url === "https://id.twitch.tv/oauth2/token") return json(data.oauth);
      if (url.endsWith("/games")) {
        const response = [data.recentGames, data.topGames, data.steamMappedGames][gamesRequest++];
        return json(response);
      }
      if (url.endsWith("/external_games")) return json(data.externalGames);
      throw new Error(`unexpected URL ${url}`);
    });

    const snapshot = await fetchIgdb(
      {
        clientId: "client",
        clientSecret: "secret",
        asOf: "2026-07-28T00:00:00.000Z",
        recentDays: 60,
        topIgdbIds: ["42"],
        steamAppIds: [570, 730, 999],
      },
      createHttpClient(fetcher as typeof fetch),
    );

    expect(snapshot.games.map((game) => game.id)).toEqual([7, 77, 42, 88]);
    expect(snapshot.externalGames).toEqual([
      { game: 7, uid: "570", external_game_source: 1 },
      { game: 88, uid: "730", external_game_source: 1 },
    ]);
    expect(snapshot.unresolvedSteamAppIds).toEqual([999]);
    expect(posts.find((request) => request.url.endsWith("/games"))?.body).toContain("rating_count >= 5");
    expect(posts.find((request) => request.url.endsWith("/external_games"))?.body).toContain("where uid = (570,730,999)");
    expect(posts.filter((request) => request.url.endsWith("/games")).map((request) => request.body))
      .toEqual(expect.arrayContaining([expect.stringContaining("where id = (88)")]));
    expect(snapshot.responses).toContainEqual(data.externalGames);
    expect(snapshot.responses).toContainEqual(data.steamMappedGames);
    expect(JSON.stringify(snapshot)).not.toContain("fixture-igdb-token");
    expect(JSON.stringify(snapshot)).not.toContain("secret");
  });

  it("supports a full release-date window query without the recent-only rating filter", async () => {
    const page = [{ id: 42, name: "Historical Fixture", first_release_date: 631_152_000, game_type: 0, parent_game: 7 }];
    const recordResponse = vi.fn();
    const posts: Array<{ url: string; body: string }> = [];
    const fetcher = vi.fn(async (url: string, init?: RequestInit) => {
      const body = String(init?.body ?? "");
      posts.push({ url, body });
      if (url === "https://id.twitch.tv/oauth2/token") return json({ access_token: "fixture-token" });
      if (url.endsWith("/games")) return json(page);
      throw new Error(`unexpected URL ${url}`);
    });

    const snapshot = await fetchIgdb(
      {
        clientId: "client",
        clientSecret: "secret",
        asOf: "2026-07-28T00:00:00.000Z",
        recentDays: 60,
        topIgdbIds: [],
        steamAppIds: [],
        partitionStart: "1990-01-01",
        partitionEnd: "1991-01-01",
        offset: 500,
        recordResponse,
      },
      createHttpClient(fetcher as typeof fetch),
    );

    const body = posts.find((request) => request.url.endsWith("/games"))?.body ?? "";
    expect(body).toContain("where first_release_date >= 631152000 & first_release_date < 662688000");
    expect(body).toContain("sort first_release_date asc;");
    expect(body).not.toContain("sort first_release_date asc, id asc;");
    expect(body).toContain("limit 500; offset 500;");
    expect(body).not.toContain("rating_count >= 5");
    expect(body).toContain("game_type");
    expect(body).toContain("parent_game");
    expect(body).toContain("platforms.name");
    expect(snapshot.games).toEqual(page);
    expect(snapshot.externalGames).toEqual([]);
    expect(snapshot.unresolvedSteamAppIds).toEqual([]);
    expect(snapshot.responses).toEqual([page]);
    expect(recordResponse).toHaveBeenCalledWith(page);
    expect(JSON.stringify(snapshot)).not.toContain("fixture-token");
    expect(JSON.stringify(snapshot)).not.toContain("secret");
  });

  it("uses release-date years when querying pre-1970 historical releases", async () => {
    const posts: string[] = [];
    const fetcher = vi.fn(async (url: string, init?: RequestInit) => {
      if (url === "https://id.twitch.tv/oauth2/token") return json({ access_token: "fixture-token" });
      if (url.endsWith("/games")) {
        posts.push(String(init?.body ?? ""));
        return json([]);
      }
      throw new Error(`unexpected URL ${url}`);
    });

    await fetchIgdb(
      {
        clientId: "client",
        clientSecret: "secret",
        asOf: "2026-07-28T00:00:00.000Z",
        recentDays: 0,
        topIgdbIds: [],
        steamAppIds: [],
        partitionStart: "1950-01-01",
        partitionEnd: "1951-01-01",
      },
      createHttpClient(fetcher as typeof fetch),
    );

    expect(posts[0]).toContain("where release_dates.y = (1950)");
    expect(posts[0]).not.toMatch(/first_release_date\s+[<>]=?\s+-\d/);
  });

  it("batches 501 Twitch IGDB ids into predicates of at most 500 with explicit limits", async () => {
    const gamePosts: string[] = [];
    const fetcher = vi.fn(async (url: string, init?: RequestInit) => {
      if (url === "https://id.twitch.tv/oauth2/token") return json({ access_token: "fixture-token" });
      const body = String(init?.body ?? "");
      if (url.endsWith("/games")) {
        gamePosts.push(body);
        if (body.includes("where first_release_date")) return json([]);
        const ids = body.match(/where id = \(([^)]+)\)/)?.[1].split(",").map(Number) ?? [];
        return json(ids.map((id) => ({ id, name: `Game ${id}` })));
      }
      throw new Error(`unexpected URL ${url}`);
    });

    const snapshot = await fetchIgdb(
      {
        clientId: "client",
        clientSecret: "secret",
        asOf: "2026-07-28T00:00:00.000Z",
        recentDays: 60,
        topIgdbIds: Array.from({ length: 501 }, (_, index) => String(index + 1)),
        steamAppIds: [],
      },
      createHttpClient(fetcher as typeof fetch),
    );

    const idPosts = gamePosts.filter((body) => body.includes("where id ="));
    expect(idPosts).toHaveLength(2);
    expect(idPosts[0]).toContain("limit 500;");
    expect(idPosts[1]).toContain("limit 1;");
    expect(idPosts.every((body) => (body.match(/where id = \(([^)]+)\)/)?.[1].split(",").length ?? 0) <= 500)).toBe(true);
    expect(snapshot.games).toHaveLength(501);
  });

  it("keeps at least eleven Steam mappings with explicit external_games pagination", async () => {
    const externalPosts: string[] = [];
    const mappings = Array.from({ length: 11 }, (_, index) => ({
      id: 10_000 + index,
      game: 1_000 + index,
      uid: String(500 + index),
      external_game_source: 1,
    }));
    const fetcher = vi.fn(async (url: string, init?: RequestInit) => {
      if (url === "https://id.twitch.tv/oauth2/token") return json({ access_token: "fixture-token" });
      const body = String(init?.body ?? "");
      if (url.endsWith("/external_games")) {
        externalPosts.push(body);
        return json(mappings);
      }
      if (url.endsWith("/games")) {
        if (body.includes("where first_release_date")) return json([]);
        return json(mappings.map((mapping) => ({ id: mapping.game, name: `Game ${mapping.game}` })));
      }
      throw new Error(`unexpected URL ${url}`);
    });

    const snapshot = await fetchIgdb(
      {
        clientId: "client",
        clientSecret: "secret",
        asOf: "2026-07-28T00:00:00.000Z",
        recentDays: 60,
        topIgdbIds: [],
        steamAppIds: mappings.map((mapping) => Number(mapping.uid)),
      },
      createHttpClient(fetcher as typeof fetch),
    );

    expect(externalPosts).toHaveLength(1);
    expect(externalPosts[0]).toContain("fields id,game,uid,external_game_source;");
    expect(externalPosts[0]).toContain("limit 500;");
    expect(externalPosts[0]).toContain("offset 0;");
    expect(snapshot.externalGames).toHaveLength(11);
    expect(snapshot.games).toHaveLength(11);
  });

  it("pages recent results until a short page and de-duplicates numeric game ids", async () => {
    const recentPosts: string[] = [];
    const firstPage = Array.from({ length: 500 }, (_, index) => ({ id: index + 1, name: `Game ${index + 1}` }));
    const fetcher = vi.fn(async (url: string, init?: RequestInit) => {
      if (url === "https://id.twitch.tv/oauth2/token") return json({ access_token: "fixture-token" });
      const body = String(init?.body ?? "");
      if (url.endsWith("/games") && body.includes("where first_release_date")) {
        recentPosts.push(body);
        return json(recentPosts.length === 1 ? firstPage : [
          { id: 500, name: "Duplicate Game 500" },
          { id: 501, name: "Game 501" },
        ]);
      }
      throw new Error(`unexpected URL ${url}`);
    });

    const snapshot = await fetchIgdb(
      {
        clientId: "client",
        clientSecret: "secret",
        asOf: "2026-07-28T00:00:00.000Z",
        recentDays: 60,
        topIgdbIds: [],
        steamAppIds: [],
      },
      createHttpClient(fetcher as typeof fetch),
    );

    expect(recentPosts).toHaveLength(2);
    expect(recentPosts[0]).toContain("limit 500; offset 0;");
    expect(recentPosts[1]).toContain("limit 500; offset 500;");
    expect(snapshot.games).toHaveLength(501);
    expect(snapshot.games.find((game) => game.id === 500)?.name).toBe("Duplicate Game 500");
  });
});

describe("Steam source", () => {
  it("collects top sellers and requested apps, keeps SteamSpy bodies raw, and falls back to cache for a failed app", async () => {
    const data = await fixture("steam");
    const cachePath = await temporaryPath("steam/latest.json");
    await mkdir(join(cachePath, ".."), { recursive: true });
    await writeFile(cachePath, JSON.stringify({ responses: [data.featured, data.apps["570"], data.apps["730"]] }), "utf8");
    const fetcher = vi.fn(async (url: string) => {
      if (url === "https://store.steampowered.com/api/featuredcategories/") return json(data.featured);
      if (url.includes("appid=570")) return json(data.apps["570"]);
      if (url.includes("appid=730")) return new Response("down", { status: 400 });
      throw new Error(`unexpected URL ${url}`);
    });

    const snapshot = await fetchSteam({ steamAppIds: [730], cachePath }, createHttpClient(fetcher as typeof fetch));

    expect(snapshot.topSellerAppIds).toEqual([570, 730]);
    expect(snapshot.apps.map((app) => app.appId)).toEqual([570, 730]);
    expect(snapshot.staleSources).toEqual(["steamspy:730"]);
    expect(snapshot.responses).toContainEqual(data.apps["730"]);
    expect(JSON.parse(await readFile(cachePath, "utf8")).responses).toContainEqual(data.apps["570"]);
  });

  it("omits an uncached failed SteamSpy app without failing the remaining Steam source", async () => {
    const data = await fixture("steam");
    const cachePath = await temporaryPath("steam/latest.json");
    const fetcher = vi.fn(async (url: string) => {
      if (url === "https://store.steampowered.com/api/featuredcategories/") return json(data.featured);
      if (url.includes("appid=570")) return json(data.apps["570"]);
      if (url.includes("appid=730")) return new Response("down", { status: 400 });
      throw new Error(`unexpected URL ${url}`);
    });

    const snapshot = await fetchSteam({ steamAppIds: [730], cachePath }, createHttpClient(fetcher as typeof fetch));

    expect(snapshot.apps.map((app) => app.appId)).toEqual([570]);
    expect(snapshot.staleSources).toEqual([]);
    expect(snapshot.warnings).toContain("omitting SteamSpy appdetails for appid 730 after failure without cache");
  });

  it("collects Steam Store app-details categories with the injected fetcher", async () => {
    const data = await fixture("steam");
    const cachePath = await temporaryPath("steam/latest.json");
    const fetcher = vi.fn(async (url: string) => {
      if (url === "https://store.steampowered.com/api/featuredcategories/") {
        return json({ top_sellers: { items: [{ id: 570 }] } });
      }
      if (url.includes("steamspy.com") && url.includes("appid=570")) return json(data.apps["570"]);
      if (url.startsWith("https://store.steampowered.com/api/appdetails?")) {
        return json({
          "570": {
            success: true,
            data: {
              categories: [
                { id: 1, description: "Multi-player" },
                { id: 9, description: "Co-op" },
              ],
            },
          },
        });
      }
      throw new Error(`unexpected URL ${url}`);
    });

    const snapshot = await fetchSteam({ steamAppIds: [], cachePath }, createHttpClient(fetcher as typeof fetch));

    expect(snapshot.apps[0].categories).toEqual(["Multi-player", "Co-op"]);
    expect(snapshot.responses).toContainEqual(expect.objectContaining({ "570": expect.any(Object) }));
    expect(fetcher).toHaveBeenCalledWith(
      "https://store.steampowered.com/api/appdetails?appids=570&filters=categories&cc=us&l=english",
      expect.anything(),
    );
  });

  it("fetches only staged app details when the featured response is already available", async () => {
    const data = await fixture("steam");
    const cachePath = await temporaryPath("steam/latest.json");
    const fetcher = vi.fn(async (url: string) => {
      if (url.includes("steamspy.com") && url.includes("appid=730")) return json(data.apps["730"]);
      if (url === "https://store.steampowered.com/api/appdetails?appids=730&filters=categories&cc=us&l=english") {
        return json({ "730": { success: true, data: { categories: [{ id: 1, description: "Multi-player" }] } } });
      }
      throw new Error(`unexpected URL ${url}`);
    });

    const snapshot = await fetchSteam({
      steamAppIds: [730],
      includeTopSellers: false,
      featured: { topSellerAppIds: [570], response: data.featured },
      cachePath,
    }, createHttpClient(fetcher as typeof fetch));

    expect(fetcher.mock.calls.map(([url]) => String(url))).not.toContain("https://store.steampowered.com/api/featuredcategories/");
    expect(snapshot.apps.map((app) => app.appId)).toEqual([730]);
    expect(snapshot.apps[0].categories).toEqual(["Multi-player"]);
  });

  it("merges staged Steam details by app ID while retaining the primary snapshot", () => {
    const primary = {
      fetchedAt: "2026-07-28T00:00:00.000Z",
      source: "steam" as const,
      request: { steamAppIds: [570] },
      responses: [{ featured: true }],
      warnings: ["primary warning"],
      topSellerAppIds: [570],
      apps: [{ appId: 570, tags: {}, positive: 1, negative: 0, owners: "", price: "0", discount: "0" }],
      staleSources: ["steamspy:570"],
    };
    const details = {
      fetchedAt: "2026-07-28T00:05:00.000Z",
      source: "steam" as const,
      request: { steamAppIds: [730] },
      responses: [{ app: 730 }],
      warnings: ["detail warning"],
      topSellerAppIds: [],
      apps: [{ appId: 730, tags: { Strategy: 100 }, positive: 90, negative: 10, owners: "", price: "0", discount: "0" }],
      staleSources: ["steamstore:730"],
    };

    expect(mergeSteamSnapshots(primary, details)).toMatchObject({
      topSellerAppIds: [570],
      apps: [primary.apps[0], details.apps[0]],
      warnings: ["primary warning", "detail warning"],
      staleSources: ["steamspy:570", "steamstore:730"],
      responses: [primary.responses[0], details.responses[0]],
    });
  });
});
