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
