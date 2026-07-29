import type { LengthBucket, SessionShape } from "./types";

/** opportunity = viewers / (channels + K). K가 소표본을 평균 쪽으로 수축시킨다. */
export const OPPORTUNITY_K = 10;

/** safe·rising 슬롯 후보의 최소 채널 수. new 슬롯에는 적용하지 않는다. */
export const MIN_CHANNELS_FOR_RANKING = 5;

export const W_DEMAND = 0.15;
export const W_ACCESSIBILITY = 0.15;
export const W_QUALITY = 0.20;
export const W_GROWTH = 0.15;
export const W_STABILITY = 0.15;
export const W_COMPETITION = 0.10;
export const W_CONFIDENCE = 0.10;

export const PENALTY_UNKNOWN_PLAYERS = 0.15;
export const PENALTY_MARGINAL_SESSION = 0.1;

export const VIBE_THRESHOLD_BASE = 0.5;
export const VIBE_THRESHOLD_RELAXED = 0.35;

/** 성장률 항의 볼륨 바닥. 34명 → 116명도 3.4배라 소규모는 잡음이다. */
export const MIN_VIEWERS_FOR_GROWTH = 500;

/** "지금 뜨는 중"으로 표시할 최소 7일 성장 배수 */
export const MIN_GROWTH_MULTIPLIER = 1.3;

/** 신작 슬롯의 평점 신뢰 하한 */
export const MIN_REVIEWS_FOR_NEW = 50;

export const SAFE_SLOT_COUNT = 3;
export const MIN_QUALITY_FLOOR = 0.70;
export const MIN_DISCOVERY_CONFIDENCE = 0.10;
export const MAX_DISCOVERY_CHANNELS = 5;
export const MAX_DISCOVERY_VIEWERS = 1_000;
export const MIN_GROWTH_CONFIDENCE = 0.45;

/**
 * "채널당 시청자 상위 N%" 문장을 근거로 쓰기 위한 opportunity 백분위 하한.
 * 이 아래는 사실 하위권이라, "상위 %"로 표현하면 나쁜 순위를 장점처럼 포장하게 된다.
 */
export const MIN_OPPORTUNITY_PCT_FOR_REASON = 0.6;

/** 하루를 밀리초로 환산 */
export const MS_PER_DAY = 86_400_000;

/** 백분율(0~1)을 퍼센트 표기로 환산하는 배율 */
export const PCT_SCALE = 100;

export type SessionFit = "ok" | "marginal" | "reject";

export const SESSION_FIT: Record<SessionShape, Record<LengthBucket, SessionFit>> = {
  match:     { short: "ok",       medium: "ok", long: "ok" },
  run:       { short: "marginal", medium: "ok", long: "ok" },
  chapter:   { short: "reject",   medium: "ok", long: "ok" },
  openended: { short: "marginal", medium: "ok", long: "ok" },
};
