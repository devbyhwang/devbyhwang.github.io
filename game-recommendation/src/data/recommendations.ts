import { ALL_QUERIES, recommendationKey, type RecommendationIndex } from "../domain/recommendation-index";

export async function loadRecommendations(fetcher: typeof fetch = fetch): Promise<RecommendationIndex> {
  const response = await fetcher("./recommendations.json");
  if (!response.ok) throw new Error(`recommendations.json: ${response.status}`);

  const value: unknown = await response.json();
  try {
    validateRecommendationIndex(value);
  } catch (error) {
    throw new Error(`recommendations.json: ${error instanceof Error ? error.message : String(error)}`);
  }
  return value;
}

function validateRecommendationIndex(value: unknown): asserts value is RecommendationIndex {
  const index = object(value, "index");
  isoTimestamp(index.generatedAt, "generatedAt");
  nonNegativeInteger(index.gameCount, "gameCount");
  const recommendations = object(index.recommendations, "recommendations");
  const expectedKeys = new Set(ALL_QUERIES.map(recommendationKey));

  for (const key of expectedKeys) {
    if (!(key in recommendations)) throw new Error(`missing recommendation: ${key}`);
  }
  for (const key of Object.keys(recommendations)) {
    if (!expectedKeys.has(key)) throw new Error(`unexpected recommendation: ${key}`);
  }
  for (const key of expectedKeys) {
    validateRecommendation(recommendations[key], `recommendations.${key}`);
  }
}

function validateRecommendation(value: unknown, path: string): void {
  const recommendation = object(value, path);
  if (!Array.isArray(recommendation.picks)) throw new Error(`${path}.picks: must be an array`);
  if (!Array.isArray(recommendation.relaxations)
    || recommendation.relaxations.some((relaxation) => !oneOf(relaxation, ["vibeThreshold", "sessionShape", "viewerPlayable"]))) {
    throw new Error(`${path}.relaxations: invalid`);
  }
  nonNegativeInteger(recommendation.candidateCount, `${path}.candidateCount`);
  if (recommendation.blockedBy !== null && !oneOf(recommendation.blockedBy, ["players", "vibe", "other"])) {
    throw new Error(`${path}.blockedBy: invalid`);
  }
}

function oneOf(value: unknown, values: readonly string[]): boolean {
  return typeof value === "string" && values.includes(value);
}

function object(value: unknown, path: string): Record<string, unknown> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${path}: must be an object`);
  }
  return value as Record<string, unknown>;
}

function isoTimestamp(value: unknown, path: string): asserts value is string {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value)
    || !Number.isFinite(new Date(value).getTime()) || new Date(value).toISOString() !== value) {
    throw new Error(`${path}: must be an ISO timestamp`);
  }
}

function nonNegativeInteger(value: unknown, path: string): void {
  if (!Number.isInteger(value) || (value as number) < 0) {
    throw new Error(`${path}: must be a non-negative integer`);
  }
}
