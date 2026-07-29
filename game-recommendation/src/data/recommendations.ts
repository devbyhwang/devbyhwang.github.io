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
  recommendation.picks.forEach((pick, index) => validatePick(pick, `${path}.picks[${index}]`));
  if (!Array.isArray(recommendation.relaxations)
    || recommendation.relaxations.some((relaxation) => !oneOf(relaxation, ["vibeThreshold", "sessionShape", "viewerPlayable"]))) {
    throw new Error(`${path}.relaxations: invalid`);
  }
  nonNegativeInteger(recommendation.candidateCount, `${path}.candidateCount`);
  if (recommendation.blockedBy !== null && !oneOf(recommendation.blockedBy, ["players", "vibe", "other"])) {
    throw new Error(`${path}.blockedBy: invalid`);
  }
}

function validatePick(value: unknown, path: string): void {
  const pick = object(value, path);
  if (!oneOf(pick.slot, ["safe", "rising", "discovery", "new"])) throw new Error(`${path}.slot: invalid`);
  validateGame(pick.game, `${path}.game`);
  finiteNumber(pick.score, `${path}.score`);
  if (!Array.isArray(pick.why)) throw new Error(`${path}.why: must be an array`);
  pick.why.forEach((why, index) => {
    const part = object(why, `${path}.why[${index}]`);
    nonEmptyString(part.text, `${path}.why[${index}].text`);
  });
  if (!Array.isArray(pick.terms)) throw new Error(`${path}.terms: must be an array`);
  pick.terms.forEach((term, index) => {
    const scoreTerm = object(term, `${path}.terms[${index}]`);
    nonEmptyString(scoreTerm.kind, `${path}.terms[${index}].kind`);
    finiteNumber(scoreTerm.raw, `${path}.terms[${index}].raw`);
    finiteNumber(scoreTerm.contribution, `${path}.terms[${index}].contribution`);
  });
}

function validateGame(value: unknown, path: string): void {
  const game = object(value, path);
  nonEmptyString(game.id, `${path}.id`);
  nonEmptyString(game.name, `${path}.name`);
  optionalString(game.nameKo, `${path}.nameKo`);
  optionalString(game.coverUrl, `${path}.coverUrl`);
  optionalString(game.storeUrl, `${path}.storeUrl`);
  if (!oneOf(game.sessionShape, ["match", "run", "chapter", "openended"])) throw new Error(`${path}.sessionShape: invalid`);
  const players = object(game.players, `${path}.players`);
  if (players.max !== "unknown" && (!Number.isInteger(players.max) || (players.max as number) < 1)) {
    throw new Error(`${path}.players.max: invalid`);
  }
  const buzz = object(game.buzz, `${path}.buzz`);
  finiteNumber(buzz.twitchViewers, `${path}.buzz.twitchViewers`, 0);
  if (game.discountPercent !== undefined) finiteNumber(game.discountPercent, `${path}.discountPercent`, 0, 100);
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

function finiteNumber(value: unknown, path: string, minimum = -Infinity, maximum = Infinity): void {
  if (typeof value !== "number" || !Number.isFinite(value) || value < minimum || value > maximum) {
    throw new Error(`${path}: must be a finite number`);
  }
}

function nonEmptyString(value: unknown, path: string): void {
  if (typeof value !== "string" || value.trim() === "") throw new Error(`${path}: must be a non-empty string`);
}

function optionalString(value: unknown, path: string): void {
  if (value !== undefined && typeof value !== "string") throw new Error(`${path}: must be a string`);
}
