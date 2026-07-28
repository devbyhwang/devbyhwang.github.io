import { describe, expect, it } from "vitest";
import { SAMPLE_CATALOG } from "./fixtures";
import { VIBE_KEYS } from "./types";

describe("SAMPLE_CATALOG", () => {
  it("id가 고유하다", () => {
    const ids = SAMPLE_CATALOG.map((g) => g.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("모든 vibe 축에 0.5 이상인 게임이 3개 이상 있다", () => {
    for (const k of VIBE_KEYS) {
      const n = SAMPLE_CATALOG.filter((g) => g.vibes[k] >= 0.5).length;
      expect(n, `vibe ${k} 후보 부족`).toBeGreaterThanOrEqual(3);
    }
  });

  it("모든 vibes 값이 0~1 범위다", () => {
    for (const g of SAMPLE_CATALOG) {
      for (const k of VIBE_KEYS) {
        expect(g.vibes[k]).toBeGreaterThanOrEqual(0);
        expect(g.vibes[k]).toBeLessThanOrEqual(1);
      }
    }
  });

  // 시청자 참여 게임이 부족하면 viewerParticipation 시나리오가 완화 사다리를
  // 끝까지 소진하고, 사고율 게이트의 시청자 참여 검사가 조기 반환으로 무력화된다.
  it("시청자 참여 가능 게임이 4개 이상이다", () => {
    const n = SAMPLE_CATALOG.filter((g) => g.viewerPlayable.ok).length;
    expect(n, "시청자 참여 후보 부족 — 사고율 게이트가 무력화된다").toBeGreaterThanOrEqual(4);
  });

  it("검증용 특수 케이스를 포함한다", () => {
    expect(SAMPLE_CATALOG.some((g) => g.players.max === "unknown")).toBe(true);
    expect(SAMPLE_CATALOG.some((g) => g.buzz.twitchChannels < 5)).toBe(true);
    expect(SAMPLE_CATALOG.some((g) => g.buzz.isNewRelease)).toBe(true);
    expect(SAMPLE_CATALOG.some((g) => g.viewerPlayable.ok)).toBe(true);
    const franchises = SAMPLE_CATALOG.map((g) => g.franchise).filter(Boolean);
    expect(new Set(franchises).size).toBeLessThan(franchises.length);
  });
});

describe("커버 이미지", () => {
  it("절반 이상의 게임이 커버를 갖는다", () => {
    const withCover = SAMPLE_CATALOG.filter((g) => g.coverUrl).length;
    expect(withCover).toBeGreaterThanOrEqual(SAMPLE_CATALOG.length / 2);
  });

  it("커버가 없는 게임도 최소 2개 있다 (대체판 렌더링 검증용)", () => {
    const without = SAMPLE_CATALOG.filter((g) => !g.coverUrl).length;
    expect(without).toBeGreaterThanOrEqual(2);
  });

  it("coverUrl이 있으면 steamAppId와 storeUrl도 있다", () => {
    for (const g of SAMPLE_CATALOG) {
      if (!g.coverUrl) continue;
      expect(g.steamAppId, g.name).toBeTypeOf("number");
      expect(g.storeUrl, g.name).toContain(String(g.steamAppId));
    }
  });

  it("coverUrl은 steamAppId에서 유도된다", () => {
    for (const g of SAMPLE_CATALOG) {
      if (!g.coverUrl) continue;
      expect(g.coverUrl).toBe(
        `https://cdn.cloudflare.steamstatic.com/steam/apps/${g.steamAppId}/library_600x900.jpg`,
      );
    }
  });
});
