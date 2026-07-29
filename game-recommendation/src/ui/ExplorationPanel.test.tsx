import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { Query } from "../domain/types";

const query: Query = { length: "medium", players: 1, viewerParticipation: false, vibe: "healing" };
const generatedAt = "2026-07-28T00:00:00.000Z";

afterEach(() => { vi.restoreAllMocks(); });

describe("ExplorationPanel", () => {
  it("initially shows 24 cards and appends 24 more", async () => {
    const ids = Array.from({ length: 48 }, (_, index) => `game-${index}`);
    vi.stubGlobal("fetch", vi.fn(async (url: string) => {
      if (url.endsWith("manifest.json")) return new Response(JSON.stringify({ generatedAt, gameCount: 48, pageSize: 24, views: { all: 48, new: 0, rising: 0, discovery: 0, classic: 0 } }));
      const match = url.match(/\/all\/(\d+)\.json$/);
      if (match) return new Response(JSON.stringify({ ids: ids.slice(Number(match[1]) * 24, Number(match[1]) * 24 + 24) }));
      return new Response(JSON.stringify(ids.map((id) => ({ id, name: id, releaseDate: "2020-01-01T00:00:00.000Z", players: { max: 1, online: false, localCoop: false }, sessionShape: "run", twitchViewers: 1 }))));
    }));
    const { ExplorationPanel } = await import("./ExplorationPanel");

    render(<ExplorationPanel query={query} generatedAt={generatedAt} />);
    expect(await screen.findAllByRole("article")).toHaveLength(24);
    await userEvent.click(screen.getByRole("button", { name: "더 보기" }));
    expect(await screen.findAllByRole("article")).toHaveLength(48);
  });

  it("resets to the first page when the search conditions change", async () => {
    const ids = Array.from({ length: 48 }, (_, index) => `game-${index}`);
    vi.stubGlobal("fetch", vi.fn(async (url: string) => {
      if (url.endsWith("manifest.json")) return new Response(JSON.stringify({ generatedAt, gameCount: 48, pageSize: 24, views: { all: 48, new: 0, rising: 0, discovery: 0, classic: 0 } }));
      const match = url.match(/\/all\/(\d+)\.json$/);
      if (match) return new Response(JSON.stringify({ ids: ids.slice(Number(match[1]) * 24, Number(match[1]) * 24 + 24) }));
      return new Response(JSON.stringify(ids.map((id) => ({ id, name: id, releaseDate: "2020-01-01T00:00:00.000Z", players: { max: 1, online: false, localCoop: false }, sessionShape: "run", twitchViewers: 1 }))));
    }));
    const { ExplorationPanel } = await import("./ExplorationPanel");
    const { rerender } = render(<ExplorationPanel query={query} generatedAt={generatedAt} />);
    expect(await screen.findAllByRole("article")).toHaveLength(24);
    await userEvent.click(screen.getByRole("button", { name: "더 보기" }));
    expect(await screen.findAllByRole("article")).toHaveLength(48);

    rerender(<ExplorationPanel query={{ ...query, vibe: "horror" }} generatedAt={generatedAt} />);
    expect(await screen.findAllByRole("article")).toHaveLength(24);
  });
});
