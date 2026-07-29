import { describe, expect, it } from "vitest";
import { buildWhy } from "./why";
import { SAMPLE_CATALOG } from "./fixtures";
import type { Game, Query, Scored } from "./types";

const game = (id: string): Game => SAMPLE_CATALOG.find((entry) => entry.id === id)!;

const query: Query = {
  length: "medium",
  players: 4,
  viewerParticipation: false,
  vibe: "variety",
};

const scored = (g: Game, overrides: Partial<Scored> = {}): Scored => ({
  game: g,
  score: 0.78,
  terms: [
    { kind: "quality", raw: 0.88, contribution: 0.176 },
    { kind: "accessibility", raw: 0.82, contribution: 0.123 },
    { kind: "demand", raw: 0.7, contribution: 0.105 },
    { kind: "confidence", raw: 0.75, contribution: 0.075 },
  ],
  marginalSession: false,
  ...overrides,
});

describe("buildWhy", () => {
  it("uses the strongest renderable contribution for safe without unsupported percentile claims", () => {
    const why = buildWhy(scored(game("g5")), "safe", query);

    expect(why[0]?.kind).toBe("quality");
    expect(why[0]?.text).toContain("평점");
    expect(why[0]?.text).not.toContain("상위");
  });

  it("keeps multiplayer fit as the second reason when the query is for a group", () => {
    const why = buildWhy(scored(game("g5")), "safe", query);

    expect(why.some((part) => part.kind === "playerFit")).toBe(true);
  });

  it("falls through to the next positive score term when player fit does not apply", () => {
    const why = buildWhy(scored(game("g15")), "safe", { ...query, players: 1, vibe: "hardcore" });

    expect(why).toHaveLength(2);
    expect(why[1]?.kind).toBe("accessibility");
  });

  it("forces growth language first for the rising slot", () => {
    const why = buildWhy(scored(game("g10")), "rising", query);

    expect(why[0]?.kind).toBe("growth");
    expect(why[0]?.text).toContain("상승");
  });

  it("explains rising from the strongest available historical window", () => {
    const g = {
      ...game("g10"),
      buzz: { ...game("g10").buzz, viewerGrowth7d: null },
      streaming: { ...game("g10").streaming, growth7d: null, growth30d: 1.8, growth90d: 1.4 },
    };
    const why = buildWhy(scored(g), "rising", query);

    expect(why[0]?.text).toContain("30일");
    expect(why[0]?.text).toContain("1.8배");
  });

  it("uses streaming windows for a generic growth score explanation too", () => {
    const g = {
      ...game("g10"),
      buzz: { ...game("g10").buzz, viewerGrowth7d: 1.1 },
      streaming: { ...game("g10").streaming, growth7d: null, growth30d: 1.7, growth90d: 1.3 },
    };
    const why = buildWhy(scored(g, {
      terms: [{ kind: "growth", raw: 0.9, contribution: 0.135 }],
    }), "safe", { ...query, players: 1 });

    expect(why[0]?.kind).toBe("growth");
    expect(why[0]?.text).toContain("30일");
    expect(why[0]?.text).toContain("1.7배");
    expect(why[0]?.text).not.toContain("1.1배");
  });

  it("forces a discovery explanation first for the discovery slot", () => {
    const why = buildWhy(scored(game("g21")), "discovery", { ...query, players: 1, vibe: "chatting" });

    expect(why[0]?.kind).toBe("discovery");
    expect(why[0]?.text).toContain("발견");
  });

  it("keeps the release-date summary first for the new slot", () => {
    const why = buildWhy(scored(game("g10")), "new", query);

    expect(why[0]?.kind).toBe("newRelease");
    expect(why[0]?.text).toContain("출시");
  });

  it("ignores negative contributions when picking explanation terms", () => {
    const why = buildWhy(scored(game("g15"), {
      terms: [
        { kind: "demand", raw: 0.8, contribution: -0.12 },
        { kind: "quality", raw: 0.86, contribution: 0.172 },
      ],
    }), "safe", { ...query, players: 1, vibe: "hardcore" });

    expect(why[0]?.kind).toBe("quality");
    expect(why.some((part) => part.kind === "demand")).toBe(false);
  });

  it.each([
    ["2026-06-28T00:00:00.000Z", "30일 전 출시"],
    ["2026-06-27T00:00:00.000Z", "31일 전 출시"],
    ["2026-07-29T00:00:00.000Z", "1일 후 출시 예정"],
  ])("calculates release timing from the catalog timestamp: %s", (releaseDate, expected) => {
    const release = { ...game("g10"), releaseDate, rating: 95.238 };
    const why = buildWhy(scored(release), "new", query, "2026-07-28T00:00:00.000Z");

    expect(why[0]?.text).toContain(expected);
    expect(why[0]?.text).toContain("평점 95.2");
  });
});
