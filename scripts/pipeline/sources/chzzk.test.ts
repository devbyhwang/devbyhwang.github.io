import { describe, expect, it, vi } from "vitest";
import { createHttpClient } from "../http";
import type { HttpClient } from "../model";
import { fetchChzzk } from "./chzzk";

function json(value: unknown, status = 200, headers?: HeadersInit): Response {
  return new Response(JSON.stringify(value), { status, headers: { "content-type": "application/json", ...headers } });
}

describe("Chzzk source", () => {
  it("aggregates GAME lives across cursor pages by category and distinct channel", async () => {
    const pages = [
      {
        content: {
          data: [
            { liveCategoryType: "GAME", liveCategoryValue: "100", liveCategory: "Game One", concurrentUserCount: 120, channelId: "a" },
            { liveCategoryType: "GAME", liveCategoryValue: "100", liveCategory: "Game One", concurrentUserCount: 80, channelId: "b" },
            { liveCategoryType: "TALK", liveCategoryValue: "200", liveCategory: "Talk", concurrentUserCount: 999, channelId: "ignored" },
          ],
          next: "second-page",
        },
      },
      {
        content: {
          data: [
            { liveCategoryType: "GAME", liveCategoryValue: "100", liveCategory: "Game One", concurrentUserCount: 50, channelId: "a" },
            { liveCategoryType: "GAME", liveCategoryValue: "300", liveCategory: "Game Two", concurrentUserCount: 20, channelId: "c" },
            { liveCategoryType: "GAME", liveCategoryValue: "", liveCategory: "Malformed", concurrentUserCount: 10, channelId: "bad" },
          ],
        },
      },
    ];
    let page = 0;
    const fetcher = vi.fn(async (_url: string, _init?: RequestInit) => json(pages[page++]));

    const snapshot = await fetchChzzk(
      { clientId: "client", clientSecret: "secret", pageLimit: 2 },
      createHttpClient(fetcher as typeof fetch),
    );

    expect(snapshot.categories).toEqual([
      { categoryId: "100", name: "Game One", viewers: 250, channels: 2, coverage: 1 },
      { categoryId: "300", name: "Game Two", viewers: 20, channels: 1, coverage: 1 },
    ]);
    expect(snapshot.truncated).toBe(false);
    expect(snapshot.responses).toEqual(pages);
    expect(fetcher.mock.calls.map(([url]) => url)).toEqual([
      "https://openapi.chzzk.naver.com/open/v1/lives?size=20",
      "https://openapi.chzzk.naver.com/open/v1/lives?size=20&next=second-page",
    ]);
    expect(fetcher.mock.calls[0][1]).toMatchObject({ headers: { "Client-Id": "client", "Client-Secret": "secret" } });
  });

  it("honors Retry-After through its status-aware HTTP path and marks an unvisited cursor as truncated", async () => {
    vi.useFakeTimers();
    const retryPage = {
      content: {
        data: [{ liveCategoryType: "GAME", liveCategoryValue: "100", liveCategory: "Game One", concurrentUserCount: 50, channelId: "a" }],
        next: "more",
      },
    };
    const getJsonResponse = vi.fn()
      .mockResolvedValueOnce({ status: 429, headers: { "retry-after": "3" } })
      .mockResolvedValueOnce({ status: 200, headers: {}, data: retryPage });
    const http = {
      getJson: vi.fn(async () => { throw new Error("adapter must use the status-aware HTTP method"); }),
      postJson: vi.fn(),
      getJsonResponse,
    } as HttpClient;

    const pending = fetchChzzk(
      { clientId: "client", clientSecret: "secret", pageLimit: 1 },
      http,
    );
    await vi.advanceTimersByTimeAsync(2_999);
    expect(getJsonResponse).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1);
    const snapshot = await pending;
    vi.useRealTimers();

    expect(getJsonResponse).toHaveBeenCalledTimes(2);
    expect(snapshot.categories).toEqual([
      { categoryId: "100", name: "Game One", viewers: 50, channels: 1, coverage: 0.5 },
    ]);
    expect(snapshot.truncated).toBe(true);
    expect(snapshot.responses).toEqual([retryPage]);
  });
});
