import type { IgdbGame, QualityStats, SteamApp } from "../model";
import { alignSteamRating, steamRatio, type SteamScale } from "./steam-scale";

export type QualityPrior = {
  rating: number;
  count: number;
};

export const GLOBAL_QUALITY_PRIOR: QualityPrior = {
  rating: 70,
  count: 25,
};

type QualitySignal = {
  source: "user" | "critic" | "total" | "steam";
  rating?: number;
  count?: number;
  shrunk: number | null;
};

function clamp(value: number): number {
  return Math.min(100, Math.max(0, value));
}

function signal(
  source: QualitySignal["source"],
  rating: number | undefined,
  count: number | undefined,
  prior: QualityPrior,
): QualitySignal {
  return {
    source,
    ...(rating === undefined ? {} : { rating }),
    ...(count === undefined ? {} : { count }),
    shrunk: bayesianRating(rating, count, prior.rating, prior.count),
  };
}

function signalPriority(signalValue: QualitySignal): number {
  if (signalValue.source === "user") return 2;
  if (signalValue.source === "critic") return 1;
  if (signalValue.source === "steam") return 1;
  return 0;
}

function hasRating(signalValue: QualitySignal): boolean {
  return signalValue.rating !== undefined;
}

function selectedTotal(total: QualitySignal, user: QualitySignal, critic: QualitySignal, steam: QualitySignal): Pick<QualityStats, "totalRating" | "totalRatingCount"> {
  if (hasRating(total)) {
    return {
      ...(total.shrunk === null ? {} : { totalRating: total.shrunk }),
      ...(total.count === undefined ? {} : { totalRatingCount: total.count }),
    };
  }

  const candidates = [user, critic, steam].filter(hasRating).sort((left, right) => {
    const leftCount = left.count ?? -1;
    const rightCount = right.count ?? -1;
    if (rightCount !== leftCount) return rightCount - leftCount;

    const leftShrunk = left.shrunk ?? -1;
    const rightShrunk = right.shrunk ?? -1;
    if (rightShrunk !== leftShrunk) return rightShrunk - leftShrunk;

    return signalPriority(left) - signalPriority(right);
  });

  const fallback = candidates[0];
  return fallback
    ? {
        ...(fallback.shrunk === null ? {} : { totalRating: fallback.shrunk }),
        ...(total.count === undefined
          ? (fallback.count === undefined ? {} : { totalRatingCount: fallback.count })
          : { totalRatingCount: total.count }),
      }
    : (total.count === undefined ? {} : { totalRatingCount: total.count });
}

export function bayesianRating(
  value: number | undefined,
  count: number | undefined,
  prior: number,
  priorCount: number,
): number | null {
  if (!Number.isFinite(value) || !Number.isFinite(count)) return null;

  const reviews = Math.max(0, count as number);
  const numerator = clamp(value as number) * reviews + clamp(prior) * Math.max(0, priorCount);
  const denominator = reviews + Math.max(0, priorCount);

  if (denominator <= 0) return clamp(value as number);
  return clamp(numerator / denominator);
}

export function qualityStats(
  igdb: IgdbGame,
  steam: SteamApp | undefined,
  prior: QualityPrior = GLOBAL_QUALITY_PRIOR,
  scale?: SteamScale,
): QualityStats {
  const user = signal("user", igdb.rating, igdb.rating_count, prior);
  const critic = signal("critic", igdb.aggregated_rating, igdb.aggregated_rating_count, prior);
  const total = signal("total", igdb.total_rating, igdb.total_rating_count, prior);

  const ratio = steam && scale ? steamRatio(steam.positive, steam.negative) : null;
  const steamSignal = ratio === null || !scale
    ? signal("steam", undefined, undefined, prior)
    : signal("steam", alignSteamRating(ratio, scale), steam!.positive + steam!.negative, prior);

  return {
    ...(igdb.rating === undefined ? {} : { igdbRating: igdb.rating }),
    ...(igdb.rating_count === undefined ? {} : { igdbRatingCount: igdb.rating_count }),
    ...(igdb.aggregated_rating === undefined ? {} : { criticRating: igdb.aggregated_rating }),
    ...(igdb.aggregated_rating_count === undefined ? {} : { criticRatingCount: igdb.aggregated_rating_count }),
    ...selectedTotal(total, user, critic, steamSignal),
    ...(steam?.positive === undefined ? {} : { steamPositive: steam.positive }),
    ...(steam?.negative === undefined ? {} : { steamNegative: steam.negative }),
  };
}
