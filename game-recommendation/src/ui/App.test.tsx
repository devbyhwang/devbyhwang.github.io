import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { App } from "./App";
import { recommend } from "../domain/recommend";
import { ALL_QUERIES, recommendationKey, type RecommendationIndex } from "../domain/recommendation-index";
import type { Catalog, Game, Recommendation } from "../domain/types";

type GameOptions = {
  players?: number;
  healing?: number;
  hardcore?: number;
  channels?: number;
  viewers?: number;
  growth?: number | null;
  growth30d?: number | null;
  growth90d?: number | null;
  coverage?: number;
  observedSnapshots?: number;
  volatility30d?: number | null;
  isNewRelease?: boolean;
};

function syntheticGame(id: string, options: GameOptions = {}): Game {
  const viewers = options.viewers ?? 1_000;
  const channels = options.channels ?? 10;
  const growth = options.growth ?? null;
  const growth30d = options.growth30d ?? growth;
  const growth90d = options.growth90d ?? growth;
  const coverage = options.coverage ?? (growth === null ? 0 : 0.95);
  const observedSnapshots = options.observedSnapshots ?? (growth === null ? 0 : 60);

  return {
    id,
    name: `Synthetic ${id}`,
    releaseDate: options.isNewRelease ? "2026-07-20T00:00:00.000Z" : "2020-01-01T00:00:00.000Z",
    players: {
      max: options.players ?? 1,
      source: "igdb_multiplayer",
      online: false,
      localCoop: false,
    },
    sessionShape: "match",
    viewerPlayable: { ok: false },
    vibes: {
      healing: options.healing ?? 0.8,
      variety: 0,
      horror: 0,
      hardcore: options.hardcore ?? 0,
      chatting: 0,
      spectacle: 0,
    },
    buzz: {
      twitchViewers: viewers,
      twitchChannels: channels,
      viewerGrowth7d: growth,
      isNewRelease: options.isNewRelease ?? false,
    },
    streaming: {
      totalViewers: viewers,
      channelCount: channels,
      medianViewersPerChannel: viewers / channels,
      p75ViewersPerChannel: viewers / Math.min(channels, 4),
      top10ViewerShare: Math.min(1, 10 / channels),
      viewerConcentration: Math.min(1, 1 / Math.sqrt(channels)),
      growth7d: growth,
      growth30d,
      growth90d,
      volatility30d: options.volatility30d ?? null,
      observedSnapshots,
      coverage,
      asOf: "2026-07-28T00:00:00.000Z",
    },
    quality: {
      totalRating: 90,
      totalRatingCount: 100,
      steamPositive: 90,
      steamNegative: 10,
    },
    topTags: [],
    rating: 90,
    reviewCount: 100,
  };
}

const dataset = (games: Game[], generatedAt = "2026-07-28T00:00:00.000Z"): Catalog => ({
  generatedAt,
  games,
});

function indexFromCatalog(catalog = dataset([])): RecommendationIndex {
  return {
    generatedAt: catalog.generatedAt,
    gameCount: catalog.games.length,
    recommendations: Object.fromEntries(ALL_QUERIES.map((query) => [
      recommendationKey(query),
      recommend(catalog.games, query, catalog.generatedAt),
    ])),
  };
}

function storedResult(game: Game): Recommendation {
  return {
    picks: [{ slot: "safe", game, score: 1, why: [], terms: [] }],
    relaxations: [],
    candidateCount: 1,
    blockedBy: null,
  };
}

function setSearch(search: string) {
  window.history.pushState({}, "", search === "" ? "/" : `/${search}`);
}
afterEach(() => setSearch(""));

describe("App", () => {
  it("헤더에 고정 문구와 현재 조건 요약을 보여준다", () => {
    render(<App index={indexFromCatalog()} />);
    expect(screen.getByText("그래서 이제 뭐함?")).toBeDefined();
    expect(screen.getByText("2~3시간 · 혼자 · 힐링")).toBeDefined();
  });

  it("조건을 바꾸면 요약도 바뀐다", async () => {
    render(<App index={indexFromCatalog()} />);
    await userEvent.click(screen.getByRole("button", { name: "4명" }));
    expect(screen.getByText("2~3시간 · 4명 · 힐링")).toBeDefined();
  });

  it("시청자 참여를 켜면 요약에 덧붙는다", async () => {
    render(<App index={indexFromCatalog()} />);
    await userEvent.click(screen.getByRole("button", { name: "시청자 참여 필요" }));
    expect(screen.getByText(/· 시청자 참여$/)).toBeDefined();
  });

  it("초기 상태에서 추천 카드를 보여준다", () => {
    render(<App index={indexFromCatalog(dataset([syntheticGame("initial")]))} />);
    expect(screen.getAllByRole("article").length).toBeGreaterThan(0);
  });

  it("safe 카드만 1/2/3 숫자 배지이고 rising/new 카드는 텍스트 배지다", () => {
    const catalog = [
      syntheticGame("safe-1", { viewers: 5_000 }),
      syntheticGame("safe-2", { viewers: 4_000 }),
      syntheticGame("safe-3", { viewers: 3_000 }),
      syntheticGame("rising", { viewers: 500, channels: 100, growth: 2, growth30d: 1.8, growth90d: 1.6, coverage: 0.95, observedSnapshots: 60, volatility30d: 1 }),
      syntheticGame("new", { channels: 2, isNewRelease: true }),
    ];

    render(<App index={indexFromCatalog(dataset(catalog))} />);

    const badges = screen.getAllByRole("article").map((card) => {
      const badge = card.querySelector(".badge-slot");
      expect(badge).not.toBeNull();
      return badge!.textContent;
    });
    expect(badges).toEqual(["1", "2", "3", "지금 뜨는 중", "신작"]);
  });

  it("분위기를 바꾸면 결과가 즉시 바뀐다", async () => {
    render(<App index={indexFromCatalog(dataset([
      syntheticGame("healing"),
      syntheticGame("hardcore", { healing: 0, hardcore: 1 }),
    ]))} />);
    const before = screen.getAllByRole("article").map((el) => el.textContent);
    await userEvent.click(screen.getByRole("button", { name: "빡겜" }));
    const after = screen.getAllByRole("article").map((el) => el.textContent);
    expect(after).not.toEqual(before);
  });

  it("완화가 일어나면 무엇을 완화했는지 알린다", async () => {
    render(<App index={indexFromCatalog(dataset([syntheticGame("relax", { players: 4, healing: 0.5 })]))} />);
    await userEvent.click(screen.getByRole("button", { name: "4명" }));
    await userEvent.click(screen.getByRole("button", { name: "시청자 참여 필요" }));
    await userEvent.click(screen.getByRole("button", { name: "힐링" }));
    await userEvent.click(screen.getByRole("button", { name: "~1.5시간" }));
    expect(screen.getByText(/완화했습니다/)).toBeDefined();
  });

  it("인원 단계에서 막히면 인원을 줄이라고 안내한다", async () => {
    render(<App index={indexFromCatalog(dataset([syntheticGame("players", { players: 1 })]))} />);
    await userEvent.click(screen.getByRole("button", { name: "5명+" }));
    expect(screen.queryAllByRole("article").length).toBe(0);
    expect(screen.getByText("조건에 맞는 게임이 없습니다")).toBeDefined();
    expect(screen.getByText(/요청하신 인원으로 함께 할 수 있는 게임이 없습니다/)).toBeDefined();
    expect(screen.getByText(/인원을 줄여보세요/)).toBeDefined();
  });

  it("분위기 단계에서 막히면 분위기를 바꾸라고 안내한다", () => {
    render(<App index={indexFromCatalog(dataset([syntheticGame("vibe", { players: 5, healing: 0.2 })]))} />);
    expect(screen.queryAllByRole("article").length).toBe(0);
    expect(screen.getByText(/분위기 기준을 낮춰봐도 해당하는 게임이 없습니다/)).toBeDefined();
    expect(screen.getByText(/분위기를 바꿔보세요/)).toBeDefined();
  });

  it("필터 통과 후 결과가 없으면 특정 조건을 지목하지 않는다", () => {
    render(<App index={indexFromCatalog(dataset([syntheticGame("other", { channels: 2 })]))} />);
    expect(screen.queryAllByRole("article").length).toBe(0);
    const emptyBody = screen.getByText(/조건을 조금 넓혀보세요/).closest(".empty-body");
    expect(emptyBody?.firstChild?.textContent).toBe(
      "조건에 맞는 게임은 있지만 현재 추천 기준으로 고를 수 없습니다.",
    );
    expect(emptyBody?.textContent).not.toMatch(/채널/);
    expect(emptyBody?.textContent).not.toMatch(/인원/);
    expect(emptyBody?.textContent).not.toMatch(/분위기/);
  });

  it("완화 기록이 있어도 결과가 없으면 완화 알림을 함께 띄우지 않는다", () => {
    const catalog = [syntheticGame("relaxed-empty", { healing: 0.4, channels: 2 })];
    render(<App index={indexFromCatalog(dataset(catalog))} />);
    expect(screen.queryAllByRole("article").length).toBe(0);
    expect(screen.getByText(/후보 1개/)).toBeDefined();
    expect(screen.queryByText(/완화했습니다/)).toBeNull();
  });

  it("?debug가 없으면 점수 표를 숨긴다", () => {
    const { container } = render(<App index={indexFromCatalog(dataset([syntheticGame("debug")]))} />);
    expect(container.querySelectorAll("table.debug").length).toBe(0);
  });

  it("?debug가 있으면 카드마다 점수 표를 펼친다", () => {
    setSearch("?debug");
    const { container } = render(<App index={indexFromCatalog(dataset([syntheticGame("debug")]))} />);
    const cards = screen.getAllByRole("article");
    expect(container.querySelectorAll("table.debug").length).toBe(cards.length);
  });

  it("카탈로그 생성 시각과 후보 수를 표시한다", () => {
    render(<App index={indexFromCatalog(dataset([]))} />);
    expect(screen.getByText(/카탈로그 생성 시각 2026\. 7\. 28\./)).toBeDefined();
    expect(screen.getByText(/후보 \d+개/)).toBeDefined();
  });

  it("신작 카드의 출시 경과는 시스템 시간이 아닌 수집 시각을 사용한다", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2027-07-28T00:00:00.000Z"));
    try {
      render(<App index={indexFromCatalog(dataset([syntheticGame("catalog-date", { channels: 2, isNewRelease: true })]))} />);

      expect(screen.getByText(/8일 전 출시/)).toBeDefined();
    } finally {
      vi.useRealTimers();
    }
  });

  it("uses the stored result for the changed query", async () => {
    const medium = syntheticGame("medium-only");
    const long = { ...syntheticGame("long-only"), name: "Long-only game" };
    const index = indexFromCatalog(dataset([medium, long]));
    index.recommendations["medium|1|0|healing"] = storedResult(medium);
    index.recommendations["long|1|0|healing"] = storedResult(long);

    render(<App index={index} />);
    expect(screen.getAllByText("Synthetic medium-only")).toHaveLength(2);
    await userEvent.click(screen.getByRole("button", { name: "4시간+" }));
    expect(screen.getAllByText("Long-only game")).toHaveLength(2);
  });
});
