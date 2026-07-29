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

const pct = (population: number[], raw: number) => percentile(population, raw);
const logCounts = (games: Game[], field: (g: Game) => number) =>
  games.map((g) => Math.log1p(Math.max(0, field(g))));

function quality(game: Game): { score: number; confidence: number } {
  const q = game.quality;
  const rating = value(q.totalRating ?? game.rating, 75) / 100;
  const count = value(q.totalRatingCount ?? game.reviewCount, 0);
  const shrink = count / (count + 50);
  return { score: clamp(0.75 + (rating - 0.75) * shrink), confidence: clamp(0.25 + 0.75 * (count / (count + 100))) };
}

export function scoreGame(game: Game, population: Game[]): Scored {
  const pop = population.length ? population : [game];
  const s = game.streaming;
  const rawDemand = pct(logCounts(pop, (g) => g.streaming.totalViewers || g.buzz.twitchViewers), Math.log1p(Math.max(0, s.totalViewers || game.buzz.twitchViewers)));
  const median = s.medianViewersPerChannel;
  const accessibilityRaw = median !== null && median !== undefined
    ? pct(pop.map((g) => Math.log1p(value(g.streaming.medianViewersPerChannel, g.buzz.twitchViewers / (g.buzz.twitchChannels + 10)))), Math.log1p(median))
    : 0.5;
  const growthValues = pop.map((g) => {
    const gs = [g.streaming.growth7d, g.streaming.growth30d, g.streaming.growth90d]
      .filter((x): x is number => x !== null && x !== undefined && x > 0);
    return gs.length ? gs.reduce((a, x) => a + Math.log(x), 0) / gs.length : 0;
  });
  const gameGrowth = [s.growth7d, s.growth30d, s.growth90d]
    .filter((x): x is number => x !== null && x !== undefined && x > 0);
  const rawGrowth = gameGrowth.length ? pct(growthValues, gameGrowth.reduce((a, x) => a + Math.log(x), 0) / gameGrowth.length) : 0.5;
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
