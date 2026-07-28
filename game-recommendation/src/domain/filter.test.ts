import { describe, expect, it } from "vitest";
import { baseOptions, filterGames } from "./filter";
import { SAMPLE_CATALOG } from "./fixtures";
import type { Query } from "./types";

const q = (over: Partial<Query> = {}): Query => ({
  length: "medium",
  players: 1,
  viewerParticipation: false,
  vibe: "healing",
  ...over,
});

describe("filterGames", () => {
  it("요청 인원을 감당 못 하는 게임을 제외한다", () => {
    const query = q({ players: 4, vibe: "variety" });
    const { passed } = filterGames(SAMPLE_CATALOG, query, baseOptions(query));
    for (const { game } of passed) {
      if (game.players.max !== "unknown") {
        expect(game.players.max).toBeGreaterThanOrEqual(4);
      }
    }
    expect(passed.length).toBeGreaterThan(0);
  });

  it("players가 unknown이면 탈락시키지 않는다", () => {
    const query = q({ players: 4, vibe: "variety" });
    const { passed } = filterGames(SAMPLE_CATALOG, query, baseOptions(query));
    expect(passed.some(({ game }) => game.players.max === "unknown")).toBe(true);
  });

  it("vibe 임계 미만을 제외한다", () => {
    const query = q({ vibe: "horror" });
    const { passed } = filterGames(SAMPLE_CATALOG, query, baseOptions(query));
    expect(passed.length).toBeGreaterThan(0);
    for (const { game } of passed) {
      expect(game.vibes.horror).toBeGreaterThanOrEqual(0.5);
    }
  });

  it("짧은 방송에서 chapter 게임을 탈락시킨다", () => {
    const query = q({ length: "short", vibe: "spectacle" });
    const { passed } = filterGames(SAMPLE_CATALOG, query, baseOptions(query));
    expect(passed.some(({ game }) => game.sessionShape === "chapter")).toBe(false);
  });

  it("짧은 방송의 run/openended는 통과시키되 marginal로 표시한다", () => {
    const query = q({ length: "short", vibe: "chatting" });
    const { passed } = filterGames(SAMPLE_CATALOG, query, baseOptions(query));
    const run = passed.find(({ game }) => game.sessionShape === "run");
    expect(run?.marginalSession).toBe(true);
    const match = passed.find(({ game }) => game.sessionShape === "match");
    if (match) expect(match.marginalSession).toBe(false);
  });

  it("allowRejectedSession이면 chapter도 통과하고 marginal이 된다", () => {
    const query = q({ length: "short", vibe: "spectacle" });
    const opts = { ...baseOptions(query), allowRejectedSession: true };
    const { passed } = filterGames(SAMPLE_CATALOG, query, opts);
    const chapter = passed.find(({ game }) => game.sessionShape === "chapter");
    expect(chapter?.marginalSession).toBe(true);
  });

  it("시청자 참여를 요청하면 viewerPlayable만 남는다", () => {
    const query = q({ viewerParticipation: true, vibe: "chatting" });
    const { passed } = filterGames(SAMPLE_CATALOG, query, baseOptions(query));
    expect(passed.length).toBeGreaterThan(0);
    for (const { game } of passed) expect(game.viewerPlayable.ok).toBe(true);
  });

  it("완화된 임계는 더 많은 후보를 통과시킨다", () => {
    // horror에는 [0.35, 0.5) 구간의 픽스처가 없어 완화해도 통과 수가 그대로일 수 있다.
    // hardcore는 g8(.40), g9(.42), g20(.35)이 그 구간에 있어 완화의 효과를 실제로 관측할 수 있다.
    const query = q({ vibe: "hardcore" });
    const strict = filterGames(SAMPLE_CATALOG, query, baseOptions(query));
    const loose = filterGames(SAMPLE_CATALOG, query, {
      ...baseOptions(query),
      vibeThreshold: 0.35,
    });
    expect(loose.passed.length).toBeGreaterThan(strict.passed.length);
    const strictIds = new Set(strict.passed.map(({ game }) => game.id));
    const looseIds = new Set(loose.passed.map(({ game }) => game.id));
    for (const id of strictIds) expect(looseIds.has(id)).toBe(true);
  });

  it("단계별 잔여 수를 기록한다", () => {
    const query = q({ vibe: "healing" });
    const { counts } = filterGames(SAMPLE_CATALOG, query, baseOptions(query));
    expect(counts.total).toBe(SAMPLE_CATALOG.length);
    expect(counts.players).toBeLessThanOrEqual(counts.total);
    expect(counts.vibe).toBeLessThanOrEqual(counts.viewerPlayable);
    expect(counts.session).toBeLessThanOrEqual(counts.vibe);
  });
});
