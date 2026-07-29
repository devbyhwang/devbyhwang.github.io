import { ALL_QUERIES, recommendationKey, type RecommendationIndex } from "../../game-recommendation/src/domain/recommendation-index";
import { recommend } from "../../game-recommendation/src/domain/recommend";
import type { Recommendation } from "../../game-recommendation/src/domain/types";
import type { FileStore } from "./emit";
import type { CatalogRecord, GameRecord } from "./model";
import { validateCatalog } from "./schema";

export const RECOMMENDATIONS_PATH = "src/playground/game-recommendation/recommendations.json";

export function emitRecommendations(catalog: CatalogRecord, fs: FileStore): RecommendationIndex {
  const recommendations = Object.fromEntries(ALL_QUERIES.map((query) => [
    recommendationKey(query),
    recommend(catalog.games, query, catalog.generatedAt),
  ]));
  const index: RecommendationIndex = {
    generatedAt: catalog.generatedAt,
    gameCount: catalog.games.length,
    recommendations,
  };
  fs.writeAtomic(RECOMMENDATIONS_PATH, `${JSON.stringify(index, null, 2)}\n`);
  return index;
}

export function readRecommendations(fs: FileStore): RecommendationIndex | null {
  const contents = fs.read(RECOMMENDATIONS_PATH);
  if (contents === null) return null;
  let value: unknown;
  try {
    value = JSON.parse(contents);
  } catch {
    throw new Error(`${RECOMMENDATIONS_PATH}: invalid JSON`);
  }
  try {
    validateRecommendationIndex(value);
  } catch (error) {
    throw new Error(`${RECOMMENDATIONS_PATH}: ${error instanceof Error ? error.message : String(error)}`);
  }
  return value;
}

function validateRecommendationIndex(value: unknown): asserts value is RecommendationIndex {
  const index = object(value, "index");
  iso(index.generatedAt, "generatedAt");
  nonNegativeInteger(index.gameCount, "gameCount");
  const recommendations = object(index.recommendations, "recommendations");
  const expectedKeys = new Set(ALL_QUERIES.map(recommendationKey));
  for (const key of expectedKeys) {
    if (!(key in recommendations)) throw new Error(`missing recommendation: ${key}`);
  }
  for (const key of Object.keys(recommendations)) {
    if (!expectedKeys.has(key)) throw new Error(`unexpected recommendation: ${key}`);
  }
  for (const key of expectedKeys) validateRecommendation(recommendations[key], `recommendations.${key}`, index.generatedAt);
}

function validateRecommendation(value: unknown, path: string, generatedAt: string): asserts value is Recommendation {
  const recommendation = object(value, path);
  if (!Array.isArray(recommendation.picks)) throw new Error(`${path}.picks: must be an array`);
  recommendation.picks.forEach((pick, index) => {
    const parsed = object(pick, `${path}.picks[${index}]`);
    if (!oneOf(parsed.slot, ["safe", "rising", "discovery", "new"])) throw new Error(`${path}.picks[${index}].slot: invalid`);
    validateCatalog({ generatedAt, games: [parsed.game as GameRecord] });
    finite(parsed.score, `${path}.picks[${index}].score`);
    if (!Array.isArray(parsed.why) || !Array.isArray(parsed.terms)) throw new Error(`${path}.picks[${index}]: why and terms must be arrays`);
  });
  if (!Array.isArray(recommendation.relaxations) || recommendation.relaxations.some((value) => !oneOf(value, ["vibeThreshold", "sessionShape", "viewerPlayable"]))) {
    throw new Error(`${path}.relaxations: invalid`);
  }
  nonNegativeInteger(recommendation.candidateCount, `${path}.candidateCount`);
  if (recommendation.blockedBy !== null && !oneOf(recommendation.blockedBy, ["players", "vibe", "other"])) {
    throw new Error(`${path}.blockedBy: invalid`);
  }
}

function object(value: unknown, path: string): Record<string, unknown> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) throw new Error(`${path}: must be an object`);
  return value as Record<string, unknown>;
}

function iso(value: unknown, path: string): asserts value is string {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value) || new Date(value).toISOString() !== value) {
    throw new Error(`${path}: must be an ISO timestamp`);
  }
}

function oneOf(value: unknown, values: readonly string[]): boolean {
  return typeof value === "string" && values.includes(value);
}

function nonNegativeInteger(value: unknown, path: string): void {
  if (!Number.isInteger(value) || (value as number) < 0) throw new Error(`${path}: must be a non-negative integer`);
}

function finite(value: unknown, path: string): void {
  if (typeof value !== "number" || !Number.isFinite(value)) throw new Error(`${path}: must be a finite number`);
}
