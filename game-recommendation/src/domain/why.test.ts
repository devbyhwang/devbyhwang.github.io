import { describe, expect, it } from "vitest";
import { buildWhy } from "./why";
import { SAMPLE_CATALOG } from "./fixtures";
import type { Game, Query, Scored } from "./types";

const game = (id: string): Game => SAMPLE_CATALOG.find((g) => g.id === id)!;

const query: Query = {
  length: "medium",
  players: 4,
  viewerParticipation: false,
  vibe: "variety",
};

const scored = (g: Game, over: Partial<Scored> = {}): Scored => ({
  game: g,
  score: 0.7,
  terms: [
    { kind: "opportunity", raw: 0.97, contribution: 0.58 },
    { kind: "topOnTwitch", raw: 0.8, contribution: 0.32 },
  ],
  marginalSession: false,
  ...over,
});

describe("buildWhy", () => {
  it("safe 슬롯은 기여도 1위 항을 첫 문장으로 쓴다", () => {
    const why = buildWhy(scored(game("g5")), "safe", query);
    expect(why[0].kind).toBe("opportunity");
    expect(why[0].text).toContain("채널당");
  });

  it("최대 2개까지만 반환한다", () => {
    const why = buildWhy(scored(game("g5")), "safe", query);
    expect(why.length).toBeGreaterThanOrEqual(1);
    expect(why.length).toBeLessThanOrEqual(2);
  });

  it("여럿이 하는 요청이면 인원 정보를 근거에 넣는다", () => {
    const why = buildWhy(scored(game("g5")), "safe", query);
    expect(why.some((w) => w.kind === "playerFit")).toBe(true);
    expect(why.map((w) => w.text).join(" ")).toContain("4인");
  });

  it("혼자 하는 요청이면 인원 근거 대신 다음 순위 양수 항을 쓴다", () => {
    const g = game("g15");
    const why = buildWhy(scored(g), "safe", { ...query, players: 1, vibe: "hardcore" });
    expect(why.some((w) => w.kind === "playerFit")).toBe(false);
    // 세션 형태로 흘러내리지 않고 남은 양수 항(topOnTwitch)이 두 번째 문장이어야 한다
    expect(why).toHaveLength(2);
    expect(why[1].kind).toBe("topOnTwitch");
    expect(why[1].text).toBe(
      `현재 ${g.buzz.twitchViewers.toLocaleString("ko-KR")}명 시청 중`,
    );
  });

  it("rising 슬롯은 성장률을 첫 문장으로 강제한다", () => {
    const why = buildWhy(scored(game("g10")), "rising", query);
    expect(why[0].kind).toBe("growth");
    expect(why[0].text).toContain("배");
  });

  it("new 슬롯은 출시일과 평점을 첫 문장으로 강제한다", () => {
    const why = buildWhy(scored(game("g10")), "new", query);
    expect(why[0].kind).toBe("newRelease");
    expect(why[0].text).toContain("출시");
  });

  it.each([
    ["2026-06-28T00:00:00.000Z", "30일 전 출시"],
    ["2026-06-27T00:00:00.000Z", "31일 전 출시"],
    ["2026-07-29T00:00:00.000Z", "1일 후 출시 예정"],
  ])("카탈로그 시각 기준 출시 경과를 직접 표시한다: %s", (releaseDate, expected) => {
    const release = { ...game("g10"), releaseDate, rating: 95.238 };
    const why = buildWhy(scored(release), "new", query, "2026-07-28T00:00:00.000Z");
    expect(why[0].text).toContain(expected);
    expect(why[0].text).toContain("평점 95.2");
  });

  it("음수 기여 항은 근거로 쓰지 않는다", () => {
    // raw는 하한(0.6) 이상으로 둬야 opportunity 문장 자체가 만들어진다 — 이 테스트의 관심사는
    // playerFit(음수)이 아니라 opportunity(양수)가 선택되는지다.
    const s = scored(game("g26"), {
      terms: [
        { kind: "opportunity", raw: 0.75, contribution: 0.18 },
        { kind: "playerFit", raw: 0, contribution: -0.15 },
      ],
    });
    const why = buildWhy(s, "safe", query);
    expect(why.every((w) => w.text.length > 0)).toBe(true);
    expect(why[0].kind).toBe("opportunity");
  });

  it("문장으로 렌더 가능한 종류라도 음수 기여면 근거에서 제외한다", () => {
    // 모든 항이 음수다. contribution > 0 필터가 없으면 정렬 1위인 topOnTwitch가
    // 실제 문장으로 렌더되어 감점 항이 추천 이유로 둔갑한다.
    const g = game("g15");
    const s = scored(g, {
      terms: [
        { kind: "topOnTwitch", raw: 0.8, contribution: -0.12 },
        { kind: "opportunity", raw: 0.3, contribution: -0.4 },
      ],
    });
    const why = buildWhy(s, "safe", { ...query, players: 1, vibe: "hardcore" });

    expect(why.length).toBeGreaterThanOrEqual(1);
    expect(why.length).toBeLessThanOrEqual(2);
    expect(why.every((w) => w.text.trim().length > 0)).toBe(true);
    // 감점 항에서 나온 문장은 하나도 없어야 한다
    expect(why.some((w) => w.kind === "topOnTwitch")).toBe(false);
    expect(why.some((w) => w.kind === "opportunity")).toBe(false);
    const joined = why.map((w) => w.text).join(" ");
    expect(joined).not.toContain("시청 중");
    expect(joined).not.toContain("채널당");
    // 남는 근거는 세션 형태뿐이다
    expect(why[0].kind).toBe("sessionFit");
  });

  it("rising 슬롯인데 성장률이 없으면 growth 문장 없이도 근거를 만든다", () => {
    const g = game("g26"); // viewerGrowth7d === null
    expect(g.buzz.viewerGrowth7d).toBeNull();
    const why = buildWhy(scored(g), "rising", query);

    expect(why.length).toBeGreaterThanOrEqual(1);
    expect(why.length).toBeLessThanOrEqual(2);
    expect(why.every((w) => w.text.trim().length > 0)).toBe(true);
    expect(why.some((w) => w.kind === "growth")).toBe(false);
  });

  it("opportunity 백분위가 하한 미만이면 상위 % 문장을 만들지 않고 다음 항으로 넘어간다", () => {
    // opportunity가 기여도 1위지만 raw(=0.4)가 하위권이라 "상위 %" 문장은 거짓 자랑이 된다.
    // topOnTwitch(기여도 2위)가 대신 첫 문장이 되어야 한다.
    const g = game("g5");
    const s = scored(g, {
      terms: [
        { kind: "opportunity", raw: 0.4, contribution: 0.5 },
        { kind: "topOnTwitch", raw: 0.8, contribution: 0.2 },
      ],
    });
    const why = buildWhy(s, "safe", { ...query, players: 1 });
    expect(why.some((w) => w.kind === "opportunity")).toBe(false);
    expect(why[0].kind).toBe("topOnTwitch");
  });

  it("모든 문장이 비어 있지 않다", () => {
    for (const slot of ["safe", "rising", "new"] as const) {
      const why = buildWhy(scored(game("g10")), slot, query);
      expect(why.length).toBeGreaterThanOrEqual(1);
      for (const w of why) expect(w.text.trim().length).toBeGreaterThan(0);
    }
  });
});
