import { describe, expect, it, vi } from "vitest";
import { loadCatalog } from "./catalog";

function validCatalog() {
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
      topTags: [],
    }],
  };
}

describe("loadCatalog", () => {
  it("응답 JSON을 Catalog로 반환한다", async () => {
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
    expect(fetcher).toHaveBeenCalledWith("./catalog.json");
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
});
