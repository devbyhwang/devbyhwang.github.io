import {
  W_ACCESSIBILITY, W_COMPETITION, W_CONFIDENCE, W_DEMAND, W_GROWTH,
  W_QUALITY, W_STABILITY, PENALTY_MARGINAL_SESSION, PENALTY_UNKNOWN_PLAYERS,
} from "./constants";
import type { Game, Scored, ScoreTerm } from "./types";

const clamp = (n: number) => Math.max(0, Math.min(1, Number.isFinite(n) ? n : 0.5));
const value = (n: number | null | undefined, fallback = 0) =>
  n === null || n === undefined || !Number.isFinite(n) ? fallback : n;

export function percentile(values: number[], v: number): number {
  if (values.length <= 1) return 0.5;
  const less = values.filter((x) => x < v).length;
  const equal = values.filter((x) => x === v).length;
  return clamp((less + equal / 2) / values.length);
}

const demandShare = (game: Game) => Math.max(0, game.buzz.demandShare ?? 0);
const growthValue = (game: Game) => {
  const growth = [game.streaming.growth7d, game.streaming.growth30d, game.streaming.growth90d]
    .filter((x): x is number => x !== null && x !== undefined && x > 0);
  return growth.length ? growth.reduce((sum, x) => sum + Math.log(x), 0) / growth.length : 0;
};

export type PercentileDistribution = number[];
export type ScoreContext = {
  demand: PercentileDistribution;
  accessibility: PercentileDistribution;
  growth: PercentileDistribution;
};

export function createPercentileDistribution(values: number[]): PercentileDistribution {
  return [...values].sort((a, b) => a - b);
}

const lowerBound = (values: PercentileDistribution, value: number) => {
  let low = 0;
  let high = values.length;
  while (low < high) {
    const middle = Math.floor((low + high) / 2);
    if (values[middle]! < value) low = middle + 1;
    else high = middle;
  }
  return low;
};

const upperBound = (values: PercentileDistribution, value: number) => {
  let low = 0;
  let high = values.length;
  while (low < high) {
    const middle = Math.floor((low + high) / 2);
    if (values[middle]! <= value) low = middle + 1;
    else high = middle;
  }
  return low;
};

export function percentileFromDistribution(values: PercentileDistribution, value: number): number {
  if (values.length <= 1) return 0.5;
  const lower = lowerBound(values, value);
  const equal = upperBound(values, value) - lower;
  return clamp((lower + equal / 2) / values.length);
}

export function createScoreContext(population: Game[]): ScoreContext {
  return {
    demand: createPercentileDistribution(population.map(demandShare)),
    accessibility: createPercentileDistribution(population.map((g) =>
      Math.log1p(value(g.streaming.medianViewersPerChannel, g.buzz.twitchViewers / (g.buzz.twitchChannels + 10))),
    )),
    growth: createPercentileDistribution(population.map(growthValue)),
  };
}

export function demandPercentile(game: Game, context: ScoreContext): number {
  return percentileFromDistribution(context.demand, demandShare(game));
}

function quality(game: Game): { score: number; confidence: number } {
  const q = game.quality;
  const rating = value(q.totalRating ?? game.rating, 75) / 100;
  const count = value(q.totalRatingCount ?? game.reviewCount, 0);
  const shrink = count / (count + 50);
  return { score: clamp(0.75 + (rating - 0.75) * shrink), confidence: clamp(0.25 + 0.75 * (count / (count + 100))) };
}

export function scoreGame(game: Game, context: ScoreContext): Scored {
  const s = game.streaming;
  const rawDemand = demandPercentile(game, context);
  const median = s.medianViewersPerChannel;
  const accessibilityRaw = median !== null && median !== undefined
    ? percentileFromDistribution(context.accessibility, Math.log1p(median))
    : 0.5;
  const gameGrowth = [s.growth7d, s.growth30d, s.growth90d]
    .filter((x): x is number => x !== null && x !== undefined && x > 0);
  const rawGrowth = gameGrowth.length ? percentileFromDistribution(context.growth, growthValue(game)) : 0.5;
  const coverage = clamp(value(s.coverage, 0));
  const concentration = clamp(value(s.viewerConcentration ?? s.top10ViewerShare, 0.5));
  const volatility = clamp(value(s.volatility30d, 0.5));
  const stabilityRaw = clamp((1 - (concentration + volatility) / 2) * (0.5 + coverage / 2) + 0.5 * (1 - (0.5 + coverage / 2)));
  const competitionRaw = clamp(1 - concentration);
  const q = quality(game);
  const metadataConfidence = clamp((coverage + Math.min(1, s.observedSnapshots / 60) + (median !== null && median !== undefined ? 1 : 0)) / 3);
  const confidenceRaw = clamp((metadataConfidence + q.confidence) / 2);
  const demandRaw = rawDemand * stabilityRaw;
  const growthRaw = rawGrowth * stabilityRaw;
  const terms: ScoreTerm[] = [
    { kind: "demand", raw: demandRaw, contribution: W_DEMAND * demandRaw },
    { kind: "accessibility", raw: accessibilityRaw, contribution: W_ACCESSIBILITY * accessibilityRaw },
    { kind: "quality", raw: q.score, contribution: W_QUALITY * q.score },
    { kind: "growth", raw: growthRaw, contribution: W_GROWTH * growthRaw },
    { kind: "stability", raw: stabilityRaw, contribution: W_STABILITY * stabilityRaw },
    { kind: "competition", raw: competitionRaw, contribution: W_COMPETITION * competitionRaw },
    { kind: "confidence", raw: confidenceRaw, contribution: W_CONFIDENCE * confidenceRaw },
  ];
  if (game.players.max === "unknown") terms.push({ kind: "unknownPlayerPenalty", raw: 0, contribution: -PENALTY_UNKNOWN_PLAYERS });
  if (gameGrowth.length === 0) terms[3]!.raw = 0.5;
  const marginalSession = false;
  const score = terms.reduce((sum, term) => sum + term.contribution, 0);
  return { game, score, terms, marginalSession };
}

export function addPenalties(scored: Scored, marginalSession: boolean): Scored {
  const terms = [...scored.terms];
  if (scored.game.players.max === "unknown" && !terms.some((t) => t.kind === "unknownPlayerPenalty")) terms.push({ kind: "unknownPlayerPenalty", raw: 0, contribution: -PENALTY_UNKNOWN_PLAYERS });
  if (marginalSession) terms.push({ kind: "marginalSessionPenalty", raw: 0, contribution: -PENALTY_MARGINAL_SESSION });
  return { ...scored, marginalSession, terms, score: terms.reduce((sum, t) => sum + t.contribution, 0) };
}
