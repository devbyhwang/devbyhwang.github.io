import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { COMPACT_EXPLORATION_FORMAT, encodeMembershipBitset, encodeOrdinalRankVector, membershipBitsetByteLength } from "../domain/exploration";
import { recommendationKey } from "../domain/recommendation-index";
import type { Query } from "../domain/types";

const query: Query = { length: "medium", players: 1, viewerParticipation: false, vibe: "healing" };
const generatedAt = "2026-07-28T00:00:00.000Z";
const json = (value: unknown) => new Response(JSON.stringify(value));
const binary = (value: Uint8Array) => new Response(value.buffer as ArrayBuffer);

function compactFetch(gameCount: number, newOrdinals: number[] = []) {
  const ordinals = Array.from({ length: gameCount }, (_, ordinal) => ordinal);
  return vi.fn(async (url: string) => {
    const match = url.match(/exploration\/queries\/([^/]+)\//);
    const queryKey = match?.[1] ?? encodeURIComponent(recommendationKey(query));
    if (url.endsWith("manifest.json")) return json({
      format: COMPACT_EXPLORATION_FORMAT, generatedAt, gameCount, pageSize: 24,
      rank: { path: `exploration/queries/${queryKey}/rank.u32le`, ordinalCount: gameCount, byteLength: gameCount * 4 },
      views: Object.fromEntries(["new", "rising", "discovery", "classic"].map((view) => [view, {
        path: `exploration/queries/${queryKey}/${view}.bits`, count: view === "new" ? newOrdinals.length : 0, byteLength: membershipBitsetByteLength(gameCount),
      }])),
    });
    if (url.endsWith("rank.u32le")) return binary(encodeOrdinalRankVector(ordinals, gameCount));
    if (url.endsWith("new.bits")) return binary(encodeMembershipBitset(newOrdinals, gameCount));
    const ordinal = Number(url.match(/cards\/(\d+)\.json$/)?.[1]);
    return json([{ id: `game-${ordinal}`, name: `Game ${ordinal}`, ordinal, releaseDate: "2020-01-01T00:00:00.000Z", players: { max: 1, online: false, localCoop: false }, sessionShape: "run", twitchViewers: 1 }]);
  });
}

afterEach(() => { vi.restoreAllMocks(); });

describe("ExplorationPanel", () => {
  it("탐색 탭을 독립 섹션이나 제목 없이 임베드한다", async () => {
    vi.stubGlobal("fetch", compactFetch(24));
    const { ExplorationPanel } = await import("./ExplorationPanel");
    const { container } = render(<ExplorationPanel query={query} generatedAt={generatedAt} />);

    expect(screen.getByRole("tablist", { name: "탐색 방식" })).toBeDefined();
    expect(container.querySelector("section.exploration")).toBeNull();
    expect(screen.queryByRole("heading", { name: "더 많은 게임 찾아보기" })).toBeNull();
  });

  it("replaces the 24 cards when moving between pages without another rank request", async () => {
    const fetcher = compactFetch(48); vi.stubGlobal("fetch", fetcher);
    const { ExplorationPanel } = await import("./ExplorationPanel");
    render(<ExplorationPanel query={query} generatedAt={generatedAt} />);
    expect(await screen.findAllByRole("article")).toHaveLength(24);
    expect(screen.getByRole("heading", { name: "Game 0" })).toBeDefined();

    await userEvent.click(screen.getByRole("button", { name: "다음 페이지" }));
    expect(await screen.findAllByRole("article")).toHaveLength(24);
    expect(screen.getByRole("heading", { name: "Game 24" })).toBeDefined();
    expect(screen.queryByRole("heading", { name: "Game 0" })).toBeNull();
    expect(screen.getByRole("button", { name: "이전 페이지" })).toBeDefined();

    await userEvent.click(screen.getByRole("button", { name: "이전 페이지" }));
    expect(await screen.findByRole("heading", { name: "Game 0" })).toBeDefined();
    expect(screen.queryByRole("heading", { name: "Game 24" })).toBeNull();
    expect(fetcher.mock.calls.filter(([url]) => (url as string).endsWith("rank.u32le"))).toHaveLength(1);
  });

  it("resets to the first page when the search conditions change", async () => {
    vi.stubGlobal("fetch", compactFetch(48));
    const { ExplorationPanel } = await import("./ExplorationPanel");
    const { rerender } = render(<ExplorationPanel query={query} generatedAt={generatedAt} />);
    expect(await screen.findAllByRole("article")).toHaveLength(24);
    await userEvent.click(screen.getByRole("button", { name: "다음 페이지" }));
    expect(await screen.getByRole("heading", { name: "Game 24" })).toBeDefined();
    rerender(<ExplorationPanel query={{ ...query, vibe: "horror" }} generatedAt={generatedAt} />);
    expect(await screen.findAllByRole("article")).toHaveLength(24);
    expect(screen.getByRole("heading", { name: "Game 0" })).toBeDefined();
  });

  it("shows an empty state instead of an error for an empty tab", async () => {
    const fetcher = compactFetch(24); vi.stubGlobal("fetch", fetcher);
    const { ExplorationPanel } = await import("./ExplorationPanel");
    render(<ExplorationPanel query={query} generatedAt={generatedAt} />);
    expect(await screen.findAllByRole("article")).toHaveLength(24);
    await userEvent.click(screen.getByRole("tab", { name: "신작" }));
    expect(await screen.findByText("이 분류에는 조건에 맞는 게임이 없습니다.")).toBeDefined();
    expect(screen.queryByText("게임 목록을 불러오지 못했습니다.")).toBeNull();
    expect(fetcher.mock.calls.map(([url]) => url)).not.toContain(expect.stringContaining("new.bits"));
  });

  it("clears the previous tab count and pagination controls while a new tab is loading", async () => {
    let resolveBits: ((response: Response) => void) | undefined;
    const fetcher = compactFetch(48, [0]);
    fetcher.mockImplementation(async (url: string) => {
      if (url.endsWith("new.bits")) return new Promise<Response>((resolve) => { resolveBits = resolve; });
      const original = compactFetch(48, [0]);
      return original(url);
    });
    vi.stubGlobal("fetch", fetcher);
    const { ExplorationPanel } = await import("./ExplorationPanel");
    render(<ExplorationPanel query={query} generatedAt={generatedAt} />);
    expect(await screen.findByText("48개 결과")).toBeDefined();
    expect(screen.getByRole("button", { name: "다음 페이지" })).toBeDefined();

    await userEvent.click(screen.getByRole("tab", { name: "신작" }));
    expect(await screen.findByText("게임 목록을 불러오는 중입니다…")).toBeDefined();
    expect(screen.queryByText("48개 결과")).toBeNull();
    expect(screen.queryByRole("button", { name: "다음 페이지" })).toBeNull();

    resolveBits?.(binary(encodeMembershipBitset([0], 48)));
    expect(await screen.findByText("1개 결과")).toBeDefined();
  });
});
