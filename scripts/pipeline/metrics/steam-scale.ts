/** 백분위 매핑을 신뢰하려면 겹치는 게임이 이만큼은 있어야 한다. 그 아래는 잡음에 곡선을 맞추는 것이다. */
export const MIN_SCALE_OVERLAP = 2000;

/** 매핑을 저장할 백분위 격자의 칸 수. 101개면 1% 간격이다. */
const GRID = 101;

export type SteamScale = {
  quantiles: Array<{ steam: number; igdb: number }>;
};

export function steamRatio(positive: number, negative: number): number | null {
  if (!Number.isFinite(positive) || !Number.isFinite(negative)) return null;
  if (positive < 0 || negative < 0) return null;
  const total = positive + negative;
  if (total <= 0) return null;
  return (positive / total) * 100;
}

function quantile(sorted: readonly number[], p: number): number {
  if (sorted.length === 0) return 0;
  const position = p * (sorted.length - 1);
  const lower = Math.floor(position);
  const upper = Math.ceil(position);
  const weight = position - lower;
  return sorted[lower]! * (1 - weight) + sorted[upper]! * weight;
}

/**
 * Steam 긍정 비율과 IGDB 평점은 척도가 다르다 — Steam은 80~95%에 몰리고 IGDB는
 * p50이 72 근처다. 그대로 합치면 순위가 "품질"이 아니라 "어느 소스에 있느냐"로
 * 갈린다. 두 신호를 모두 가진 게임들에서 백분위끼리 대응시켜 단조 매핑을 만든다.
 */
export function fitSteamScale(pairs: ReadonlyArray<{ steam: number; igdb: number }>): SteamScale | null {
  if (pairs.length < MIN_SCALE_OVERLAP) return null;
  const steam = pairs.map((pair) => pair.steam).sort((a, b) => a - b);
  const igdb = pairs.map((pair) => pair.igdb).sort((a, b) => a - b);
  return {
    quantiles: Array.from({ length: GRID }, (_, index) => {
      const p = index / (GRID - 1);
      return { steam: quantile(steam, p), igdb: quantile(igdb, p) };
    }),
  };
}

export function alignSteamRating(ratio: number, scale: SteamScale): number {
  const points = scale.quantiles;
  const first = points[0]!;
  const last = points[points.length - 1]!;
  if (ratio <= first.steam) return clamp(first.igdb);
  if (ratio >= last.steam) return clamp(last.igdb);

  for (let index = 1; index < points.length; index += 1) {
    const lower = points[index - 1]!;
    const upper = points[index]!;
    if (ratio > upper.steam) continue;
    const span = upper.steam - lower.steam;
    const weight = span === 0 ? 0 : (ratio - lower.steam) / span;
    return clamp(lower.igdb + (upper.igdb - lower.igdb) * weight);
  }
  return clamp(last.igdb);
}

function clamp(value: number): number {
  return Math.min(100, Math.max(0, value));
}
