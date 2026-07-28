import { describe, expect, it } from "vitest";
import { recommend } from "./recommend";
import { SCENARIOS } from "./scenarios";
import { SAMPLE_CATALOG } from "./fixtures";
import { SESSION_FIT, VIBE_THRESHOLD_BASE, VIBE_THRESHOLD_RELAXED } from "./constants";

describe("사고율 게이트", () => {
  it("시나리오가 정확히 12개이고 6개 분위기를 모두 포함한다", () => {
    expect(SCENARIOS.length).toBe(12);
    expect(new Set(SCENARIOS.map((s) => s.query.vibe)).size).toBe(6);
  });

  it.each(SCENARIOS)("$name — 인원 조건을 어기지 않는다", ({ query }) => {
    const { picks } = recommend(SAMPLE_CATALOG, query);
    for (const p of picks) {
      if (p.game.players.max !== "unknown") {
        expect(p.game.players.max, p.game.name).toBeGreaterThanOrEqual(query.players);
      }
    }
  });

  it.each(SCENARIOS)("$name — 완화하지 않은 분위기 조건을 어기지 않는다", ({ query }) => {
    const { picks, relaxations } = recommend(SAMPLE_CATALOG, query);
    const threshold = relaxations.includes("vibeThreshold")
      ? VIBE_THRESHOLD_RELAXED
      : VIBE_THRESHOLD_BASE;
    for (const p of picks) {
      expect(p.game.vibes[query.vibe], p.game.name).toBeGreaterThanOrEqual(threshold);
    }
  });

  it.each(SCENARIOS)("$name — 완화하지 않은 세션 조건을 어기지 않는다", ({ query }) => {
    const { picks, relaxations } = recommend(SAMPLE_CATALOG, query);
    if (relaxations.includes("sessionShape")) return;
    for (const p of picks) {
      expect(SESSION_FIT[p.game.sessionShape][query.length], p.game.name).not.toBe("reject");
    }
  });

  it.each(SCENARIOS)("$name — 완화하지 않은 시청자 참여 조건을 어기지 않는다", ({ query }) => {
    const { picks, relaxations } = recommend(SAMPLE_CATALOG, query);
    if (!query.viewerParticipation || relaxations.includes("viewerPlayable")) return;
    for (const p of picks) expect(p.game.viewerPlayable.ok, p.game.name).toBe(true);
  });

  it.each(SCENARIOS)("$name — 중복 게임과 중복 프랜차이즈가 없다", ({ query }) => {
    const { picks } = recommend(SAMPLE_CATALOG, query);
    const ids = picks.map((p) => p.game.id);
    expect(new Set(ids).size).toBe(ids.length);
    const fr = picks.map((p) => p.game.franchise).filter(Boolean);
    expect(new Set(fr).size).toBe(fr.length);
  });

  it.each(SCENARIOS)("$name — 모든 결과에 근거가 붙는다", ({ query }) => {
    const { picks } = recommend(SAMPLE_CATALOG, query);
    for (const p of picks) expect(p.why.length).toBeGreaterThanOrEqual(1);
  });
});
