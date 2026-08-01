import type { GameRecord } from "./model";

/** Task 3에서 실측한 커버리지(34.6%)에서 아래위로 여유를 둔 값. 수집 실패와 조인 버그를 각각 잡는다. */
export const MIN_EVIDENCE_SHARE = 0.25;
export const MAX_EVIDENCE_SHARE = 0.45;

export type EvidenceCoverage = { count: number; share: number };

export function measureEvidenceCoverage(games: readonly GameRecord[]): EvidenceCoverage {
  const count = games.filter((game) => game.quality?.totalRating !== undefined).length;
  return { count, share: games.length === 0 ? 0 : count / games.length };
}

export function formatEvidenceCoverage(coverage: EvidenceCoverage): string {
  return `evidence coverage: ${coverage.count.toLocaleString("en-US")} games (${(coverage.share * 100).toFixed(1)}%)`;
}

/**
 * 근거 커버리지가 기대 범위를 벗어나면 빌드를 세운다.
 *
 * 하한: SteamSpy 수집이 조용히 실패해 커버리지가 백필 이전 수준으로 돌아가는 것을 잡는다.
 * 상한: 조인 버그가 엉뚱한 게임에 리뷰를 붙이는 것을 잡는다.
 */
export function assertEvidenceCoverage(coverage: EvidenceCoverage): void {
  if (coverage.share < MIN_EVIDENCE_SHARE) {
    throw new Error(`${formatEvidenceCoverage(coverage)} is below the ${(MIN_EVIDENCE_SHARE * 100).toFixed(0)}% floor`);
  }
  if (coverage.share > MAX_EVIDENCE_SHARE) {
    throw new Error(`${formatEvidenceCoverage(coverage)} is above the ${(MAX_EVIDENCE_SHARE * 100).toFixed(0)}% ceiling`);
  }
}
