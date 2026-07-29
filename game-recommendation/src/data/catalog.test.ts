import { describe, expect, it, vi } from "vitest";
import * as catalogModule from "./catalog";
import type { Catalog, CatalogChunk, CatalogManifest } from "../domain/types";
import { loadCatalog } from "./catalog";

function validCatalog(): Catalog {
  return {
    generatedAt: "2026-07-28T00:00:00.000Z",
    games: [{
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
        asOf: "2026-07-28T00:00:00.000Z",
      },
      quality: {},
      topTags: [],
    }],
  };
}

function legacyCatalog() {
  return {
    generatedAt: "2026-07-28T00:00:00.000Z",
    games: [{
      id: "legacy",
      name: "Legacy",
      releaseDate: "2026-07-20T00:00:00.000Z",
      players: { max: "unknown", source: "unknown", online: false, localCoop: false },
      sessionShape: "run",
      viewerPlayable: { ok: false },
      vibes: { healing: 0.5, variety: 0.5, horror: 0.5, hardcore: 0.5, chatting: 0.5, spectacle: 0.5 },
      buzz: { twitchViewers: 12, twitchChannels: 3, viewerGrowth7d: -0.25, isNewRelease: true },
      topTags: [],
      rating: 90,
      reviewCount: 100,
    }],
  };
}

function manifestFor(chunks: CatalogChunk[]): CatalogManifest {
  return {
    generatedAt: "2026-07-28T00:00:00.000Z",
    gameCount: chunks.reduce((total, chunk) => total + chunk.games.length, 0),
    chunks: chunks.map((_chunk, index) => `./catalog/chunks/${index.toString().padStart(4, "0")}.json`),
  };
}

function responseMap(entries: Record<string, Response>) {
  return vi.fn(async (input: RequestInfo | URL) => {
    const key = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
    const response = entries[key];
    if (!response) throw new Error(`unexpected fetch: ${key}`);
    return response;
  });
}

describe("loadCatalog", () => {
  it("manifest와 chunk 응답을 합쳐 Catalog로 반환한다", async () => {
    const chunk = { generatedAt: "2026-07-28T00:00:00.000Z", games: validCatalog().games };
    const fetcher = responseMap({
      "./catalog.json": new Response(JSON.stringify(manifestFor([chunk])), { status: 200 }),
      "./catalog/chunks/0000.json": new Response(JSON.stringify(chunk), { status: 200 }),
    });

    await expect(loadCatalog(fetcher)).resolves.toEqual({
      generatedAt: "2026-07-28T00:00:00.000Z",
      games: validCatalog().games,
    });
    expect(fetcher).toHaveBeenCalledWith("./catalog.json");
    expect(fetcher).toHaveBeenCalledWith("./catalog/chunks/0000.json");
  });

  it("legacy single-file catalog도 계속 로드한다", async () => {
    const fetcher = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ generatedAt: "2026-07-28T00:00:00.000Z", games: [] }), {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
    );

    await expect(loadCatalog(fetcher)).resolves.toEqual({
      generatedAt: "2026-07-28T00:00:00.000Z",
      games: [],
    });
  });

  it("HTTP 오류를 숨기지 않는다", async () => {
    const fetcher = vi.fn().mockResolvedValue(new Response("down", { status: 503 }));

    await expect(loadCatalog(fetcher)).rejects.toThrow("catalog.json: 503");
  });

  it("generatedAt 또는 games가 없으면 거부한다", async () => {
    const fetcher = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ generatedAt: "bad", games: "not-array" }), { status: 200 }),
    );

    await expect(loadCatalog(fetcher)).rejects.toThrow("invalid Catalog");
  });

  it("malformed manifest errors include catalog.json context", async () => {
    const fetcher = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      generatedAt: "2026-07-28T00:00:00.000Z",
      gameCount: 1,
      chunks: ["/tmp/0000.json"],
    }), { status: 200 }));

    await expect(loadCatalog(fetcher)).rejects.toThrow("catalog.json: chunks[0]");
  });

  it("parseable하지만 ISO timestamp가 아닌 generatedAt을 거부한다", async () => {
    const fetcher = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ generatedAt: "July 28, 2026", games: [] }), { status: 200 }),
    );

    await expect(loadCatalog(fetcher)).rejects.toThrow("invalid Catalog");
  });

  it("파이프라인과 같은 game shape로 잘못된 players.max를 거부한다", async () => {
    const fetcher = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      generatedAt: "2026-07-28T00:00:00.000Z",
      games: [{
        id: "bad-players",
        name: "Bad Players",
        releaseDate: "2026-07-20T00:00:00.000Z",
        players: { max: 0, source: "unknown", online: false, localCoop: false },
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
          asOf: "2026-07-28T00:00:00.000Z",
        },
        quality: {},
        topTags: [],
      }],
    }), { status: 200 }));

    await expect(loadCatalog(fetcher)).rejects.toThrow("invalid Catalog");
  });

  it.each([
    ["generatedAt", (catalog: ReturnType<typeof validCatalog>) => { catalog.generatedAt = "2026-99-28T00:00:00.000Z"; }],
    ["releaseDate", (catalog: ReturnType<typeof validCatalog>) => { catalog.games[0].releaseDate = "2026-99-20T00:00:00.000Z"; }],
  ])("calendar-invalid %s is rejected by the browser-local validator", async (_field, mutate) => {
    const catalog = validCatalog();
    mutate(catalog);
    const fetcher = vi.fn().mockResolvedValue(new Response(JSON.stringify(catalog), { status: 200 }));

    await expect(loadCatalog(fetcher)).rejects.toThrow("invalid Catalog");
  });

  it("미래 출시작을 신작으로 표시한 카탈로그를 거부한다", async () => {
    const catalog = validCatalog();
    catalog.games[0].releaseDate = "2026-07-29T00:00:00.000Z";
    const invalid = vi.fn().mockResolvedValue(new Response(JSON.stringify(catalog), { status: 200 }));
    await expect(loadCatalog(invalid)).rejects.toThrow("invalid Catalog");

    catalog.games[0].buzz.isNewRelease = false;
    const valid = vi.fn().mockResolvedValue(new Response(JSON.stringify(catalog), { status: 200 }));
    await expect(loadCatalog(valid)).resolves.toEqual(catalog);
  });

  it("streaming.totalViewers가 없으면 거부한다", async () => {
    const catalog = validCatalog();
    delete (catalog.games[0].streaming as Partial<typeof catalog.games[0]["streaming"]>).totalViewers;
    const fetcher = vi.fn().mockResolvedValue(new Response(JSON.stringify(catalog), { status: 200 }));

    await expect(loadCatalog(fetcher)).rejects.toThrow("invalid Catalog");
  });

  it("음수 streaming.viewerConcentration을 거부한다", async () => {
    const catalog = validCatalog();
    catalog.games[0].streaming.viewerConcentration = -0.01;
    const fetcher = vi.fn().mockResolvedValue(new Response(JSON.stringify(catalog), { status: 200 }));

    await expect(loadCatalog(fetcher)).rejects.toThrow("invalid Catalog");
  });

  it("inactive historical game의 null 성장률과 0 관측치를 허용한다", async () => {
    const catalog = validCatalog();
    catalog.games[0].releaseDate = "2024-07-28T00:00:00.000Z";
    catalog.games[0].buzz.isNewRelease = false;
    catalog.games[0].streaming = {
      ...catalog.games[0].streaming,
      growth7d: null,
      growth30d: null,
      growth90d: null,
      volatility30d: null,
      observedSnapshots: 0,
    };
    const fetcher = vi.fn().mockResolvedValue(new Response(JSON.stringify(catalog), { status: 200 }));

    await expect(loadCatalog(fetcher)).resolves.toEqual(catalog);
  });

  it("감소를 나타내는 음수 growth 값을 허용한다", async () => {
    const catalog = validCatalog();
    catalog.games[0].buzz.viewerGrowth7d = -0.42;
    catalog.games[0].streaming.growth7d = -0.42;
    catalog.games[0].streaming.growth30d = -0.55;
    catalog.games[0].streaming.growth90d = -0.73;
    const fetcher = vi.fn().mockResolvedValue(new Response(JSON.stringify(catalog), { status: 200 }));

    await expect(loadCatalog(fetcher)).resolves.toEqual(catalog);
  });

  it("legacy catalog shape를 새 contract로 정규화해 로드한다", async () => {
    const fetcher = vi.fn().mockResolvedValue(new Response(JSON.stringify(legacyCatalog()), { status: 200 }));

    await expect(loadCatalog(fetcher)).resolves.toEqual({
      generatedAt: "2026-07-28T00:00:00.000Z",
      games: [{
        ...legacyCatalog().games[0],
        streaming: {
          totalViewers: 12,
          channelCount: 3,
          medianViewersPerChannel: null,
          p75ViewersPerChannel: null,
          top10ViewerShare: null,
          viewerConcentration: null,
          growth7d: -0.25,
          growth30d: null,
          growth90d: null,
          volatility30d: null,
          observedSnapshots: 0,
          coverage: 0,
          asOf: "2026-07-28T00:00:00.000Z",
        },
        quality: {},
      }],
    });
  });

  it("missing chunk를 exact chunk path와 함께 거부한다", async () => {
    const chunk = { generatedAt: "2026-07-28T00:00:00.000Z", games: validCatalog().games };
    const fetcher = responseMap({
      "./catalog.json": new Response(JSON.stringify(manifestFor([chunk])), { status: 200 }),
      "./catalog/chunks/0000.json": new Response("missing", { status: 404 }),
    });

    await expect(loadCatalog(fetcher)).rejects.toThrow("./catalog/chunks/0000.json: 404");
  });

  it("chunk 간 duplicate game id를 거부한다", async () => {
    const first = { generatedAt: "2026-07-28T00:00:00.000Z", games: validCatalog().games };
    const second = {
      generatedAt: "2026-07-28T00:00:00.000Z",
      games: [{ ...validCatalog().games[0], name: "Duplicate Id" }],
    };
    const fetcher = responseMap({
      "./catalog.json": new Response(JSON.stringify(manifestFor([first, second])), { status: 200 }),
      "./catalog/chunks/0000.json": new Response(JSON.stringify(first), { status: 200 }),
      "./catalog/chunks/0001.json": new Response(JSON.stringify(second), { status: 200 }),
    });

    await expect(loadCatalog(fetcher)).rejects.toThrow("./catalog/chunks/0001.json");
  });
});

describe("historical catalog manifest contracts", () => {
  it("중복 chunk 경로를 manifest validator가 거부한다", () => {
    const isCatalogManifest = (catalogModule as Record<string, unknown>).isCatalogManifest;

    expect(typeof isCatalogManifest).toBe("function");
    if (typeof isCatalogManifest !== "function") return;

    expect(isCatalogManifest({
      generatedAt: "2026-07-28T00:00:00.000Z",
      gameCount: 2,
      chunks: ["catalog-0001.json", "catalog-0001.json"],
    })).toBe(false);
  });

  it("unsafe chunk 경로를 manifest validator가 거부한다", () => {
    const isCatalogManifest = (catalogModule as Record<string, unknown>).isCatalogManifest;

    expect(typeof isCatalogManifest).toBe("function");
    if (typeof isCatalogManifest !== "function") return;

    expect(isCatalogManifest({
      generatedAt: "2026-07-28T00:00:00.000Z",
      gameCount: 1,
      chunks: ["/tmp/0000.json"],
    })).toBe(false);
    expect(isCatalogManifest({
      generatedAt: "2026-07-28T00:00:00.000Z",
      gameCount: 1,
      chunks: ["./evil/0000.json"],
    })).toBe(false);
  });

  it("manifest와 generatedAt이 다른 chunk를 browser validator가 거부한다", () => {
    const isCatalogChunk = (catalogModule as Record<string, unknown>).isCatalogChunk;

    expect(typeof isCatalogChunk).toBe("function");
    if (typeof isCatalogChunk !== "function") return;

    expect(isCatalogChunk({
      generatedAt: "2026-07-27T00:00:00.000Z",
      games: validCatalog().games,
    }, "2026-07-28T00:00:00.000Z")).toBe(false);
  });
});
