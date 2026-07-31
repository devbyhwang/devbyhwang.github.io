import { describe, expect, it } from "vitest";
import { STEAMSPY_PAGE_SIZE, fetchSteamSpyPage } from "./steamspy-all";
import type { HttpClient } from "../model";

function body(count: number, from = 0): Record<string, unknown> {
  return Object.fromEntries(Array.from({ length: count }, (_, index) => {
    const appid = from + index + 1;
    return [String(appid), { appid, name: `Game ${appid}`, positive: appid * 2, negative: appid }];
  }));
}

function client(handler: (url: string) => Promise<unknown>): HttpClient {
  return {
    getJson: <T>(url: string) => handler(url) as Promise<T>,
    getJsonResponse: () => { throw new Error("unused"); },
    postJson: () => { throw new Error("unused"); },
  } as unknown as HttpClient;
}

describe("fetchSteamSpyPage", () => {
  it("requests the requested page number", async () => {
    const seen: string[] = [];
    await fetchSteamSpyPage(7, client(async (url) => { seen.push(url); return body(STEAMSPY_PAGE_SIZE); }));

    expect(seen).toEqual(["https://steamspy.com/api.php?request=all&page=7"]);
  });

  it("parses appid, positive and negative", async () => {
    const page = await fetchSteamSpyPage(0, client(async () => body(2)));

    expect(page.entries).toEqual([
      { appId: 1, name: "Game 1", positive: 2, negative: 1 },
      { appId: 2, name: "Game 2", positive: 4, negative: 2 },
    ]);
  });

  it("marks a full page as ok", async () => {
    const page = await fetchSteamSpyPage(0, client(async () => body(STEAMSPY_PAGE_SIZE)));

    expect(page.outcome).toBe("ok");
    expect(page.entries).toHaveLength(STEAMSPY_PAGE_SIZE);
  });

  it("marks a short page as the end", async () => {
    expect((await fetchSteamSpyPage(0, client(async () => body(12)))).outcome).toBe("end");
  });

  it("marks an empty page as the end", async () => {
    expect((await fetchSteamSpyPage(0, client(async () => ({})))).outcome).toBe("end");
  });

  it("marks a failed request as blocked rather than the end", async () => {
    const page = await fetchSteamSpyPage(0, client(async () => { throw new Error("steamspy: 500"); }));

    expect(page.outcome).toBe("blocked");
    expect(page.entries).toEqual([]);
  });

  it("skips entries without usable review counts", async () => {
    const page = await fetchSteamSpyPage(0, client(async () => ({
      "1": { appid: 1, positive: 5, negative: 1 },
      "2": { appid: 2 },
      "3": { appid: 3, positive: "x", negative: 1 },
      "4": { positive: 1, negative: 1 },
    })));

    expect(page.entries.map((entry) => entry.appId)).toEqual([1]);
  });

  it("rejects a non-object response", async () => {
    expect((await fetchSteamSpyPage(0, client(async () => [1, 2, 3]))).outcome).toBe("blocked");
  });
});
