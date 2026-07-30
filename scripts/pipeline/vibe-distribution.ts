import { VIBE_THRESHOLD_BASE } from "../../game-recommendation/src/domain/constants";
import type { GameRecord, VibeKey } from "./model";

const VIBE_KEYS: VibeKey[] = ["healing", "variety", "horror", "hardcore", "chatting", "spectacle"];

/** 축 하나가 카탈로그의 이 비율에 못 미치면 사실상 죽은 축이다. */
export const MIN_VIBE_SHARE = 0.001;
/** 축 하나가 이 비율을 넘기면 조건을 거르지 못한다. */
export const MAX_VIBE_SHARE = 0.6;

export type VibeDistribution = Record<VibeKey, { count: number; share: number }>;

export function measureVibeDistribution(games: readonly GameRecord[]): VibeDistribution {
  const counts = Object.fromEntries(VIBE_KEYS.map((vibe) => [vibe, 0])) as Record<VibeKey, number>;
  for (const game of games) {
    for (const vibe of VIBE_KEYS) {
      if ((game.vibes[vibe] ?? 0) >= VIBE_THRESHOLD_BASE) counts[vibe] += 1;
    }
  }
  return Object.fromEntries(VIBE_KEYS.map((vibe) => [
    vibe,
    { count: counts[vibe], share: games.length === 0 ? 0 : counts[vibe] / games.length },
  ])) as VibeDistribution;
}

export function formatVibeDistribution(distribution: VibeDistribution): string {
  return VIBE_KEYS
    .map((vibe) => `${vibe.padEnd(10)} ${String(distribution[vibe].count).padStart(7)} ${(distribution[vibe].share * 100).toFixed(1)}%`)
    .join("\n");
}

/**
 * 분위기 분포가 퇴화하면 빌드를 세운다.
 *
 * 2026-07 사고: 어휘가 게임 50개에만 닿았고 전역 min-max 정규화가 "데이터 없음"을
 * healing 0.872로 번역해, healing이 99.997%를 통과시키고 나머지 다섯 축이 한 자릿수만
 * 통과시키는 상태가 조용히 배포됐다. safety.test.ts는 손으로 만든 픽스처 vibes를 쓰기
 * 때문에 내내 통과했다. 이 게이트는 실제 산출 카탈로그를 본다.
 */
export function assertVibeDistribution(distribution: VibeDistribution): void {
  const failures = VIBE_KEYS.flatMap((vibe) => {
    const { count, share } = distribution[vibe];
    if (share < MIN_VIBE_SHARE) {
      return [`${vibe}: ${count} games (${(share * 100).toFixed(3)}%) is below the ${(MIN_VIBE_SHARE * 100).toFixed(1)}% floor`];
    }
    if (share > MAX_VIBE_SHARE) {
      return [`${vibe}: ${count} games (${(share * 100).toFixed(1)}%) is above the ${(MAX_VIBE_SHARE * 100).toFixed(0)}% ceiling`];
    }
    return [];
  });
  if (failures.length > 0) throw new Error(`vibe distribution is degenerate:\n${failures.join("\n")}`);
}
