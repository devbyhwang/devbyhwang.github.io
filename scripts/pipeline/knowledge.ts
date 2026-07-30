import { readFileSync } from "node:fs";
import { join } from "node:path";
import type {
  KnowledgeAssets,
  ChzzkAlias,
  SessionRule,
  SessionRules,
  TagVibeMap,
  ViewerPlayable,
  ViewerPlayableRules,
} from "./model";

const VIBE_KEYS = new Set(["healing", "variety", "horror", "hardcore", "chatting", "spectacle"]);
const SESSION_SHAPES = new Set(["match", "run", "chapter", "openended"]);

function fail(path: string, field: string): never {
  throw new Error(`${path}: invalid ${field}`);
}

function object(value: unknown, path: string, field: string): Record<string, unknown> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) fail(path, field);
  return value as Record<string, unknown>;
}

function strings(value: unknown, path: string, field: string): string[] {
  if (!Array.isArray(value) || value.some((entry) => typeof entry !== "string")) fail(path, field);
  return value as string[];
}

function readJson(rootDir: string, name: string): { path: string; value: unknown } {
  const path = join(rootDir, "data", "knowledge", name);
  try {
    return { path, value: JSON.parse(readFileSync(path, "utf8")) };
  } catch (error) {
    if (error instanceof SyntaxError) fail(path, "JSON");
    throw error;
  }
}

function parseTagVibes(value: unknown, path: string): TagVibeMap {
  const result: TagVibeMap = {};
  for (const [tag, weights] of Object.entries(object(value, path, "root"))) {
    const parsed = object(weights, path, tag);
    result[tag] = {};
    for (const [vibe, weight] of Object.entries(parsed)) {
      if (!VIBE_KEYS.has(vibe)) fail(path, `${tag}.${vibe}`);
      if (typeof weight !== "number" || !Number.isFinite(weight)) fail(path, `${tag}.${vibe}`);
      result[tag][vibe as keyof typeof result[string]] = weight;
    }
  }
  return result;
}

function parseSessionRule(value: unknown, path: string, field: string): SessionRule {
  const rule = object(value, path, field);
  if (typeof rule.shape !== "string" || !SESSION_SHAPES.has(rule.shape)) fail(path, `${field}.shape`);
  const result: SessionRule = { shape: rule.shape as SessionRule["shape"] };
  for (const key of ["genresAny", "tagsAny", "tagsAll"] as const) {
    if (rule[key] !== undefined) result[key] = strings(rule[key], path, `${field}.${key}`);
  }
  return result;
}

function parseSessionRules(value: unknown, path: string): SessionRules {
  const source = object(value, path, "root");
  if (!Array.isArray(source.rules)) fail(path, "rules");
  if (typeof source.default !== "string" || !SESSION_SHAPES.has(source.default)) fail(path, "default");
  return {
    rules: source.rules.map((rule, index) => parseSessionRule(rule, path, `rules[${index}]`)),
    default: source.default as SessionRules["default"],
  };
}

function parseViewerPlayable(value: unknown, path: string, field: string): ViewerPlayable {
  const entry = object(value, path, field);
  if (typeof entry.ok !== "boolean") fail(path, `${field}.ok`);
  if (typeof entry.reason !== "string" || entry.reason.length === 0) fail(path, `${field}.reason`);
  return { ok: entry.ok, reason: entry.reason };
}

function parseViewerPlayableRules(value: unknown, path: string): ViewerPlayableRules {
  const source = object(value, path, "root");
  const result: ViewerPlayableRules = { games: {}, tags: {} };
  for (const kind of ["games", "tags"] as const) {
    for (const [key, entry] of Object.entries(object(source[kind], path, kind))) {
      result[kind][key] = parseViewerPlayable(entry, path, `${kind}.${key}`);
    }
  }
  return result;
}

function nonEmptyStrings(value: unknown, path: string, field: string): string[] {
  const result = strings(value, path, field);
  if (result.some((entry) => entry.trim().length === 0)) fail(path, field);
  return result;
}

function parseChzzkAliases(value: unknown, path: string): ChzzkAlias[] {
  if (!Array.isArray(value)) fail(path, "root");
  return value.map((entry, index) => {
    const alias = object(entry, path, `[${index}]`);
    if (typeof alias.igdbId !== "string" || !/^[1-9]\\d*$/.test(alias.igdbId)) fail(path, `[${index}].igdbId`);
    const result: ChzzkAlias = { igdbId: alias.igdbId };
    for (const key of ["categoryIds", "names"] as const) {
      if (alias[key] !== undefined) result[key] = nonEmptyStrings(alias[key], path, `[${index}].${key}`);
    }
    return result;
  });
}

export function loadKnowledge(rootDir: string): KnowledgeAssets {
  const tagVibes = readJson(rootDir, "tag-vibes.json");
  const sessionRules = readJson(rootDir, "session-shape.json");
  const viewerPlayable = readJson(rootDir, "viewer-playable.json");
  const chzzkAliases = readJson(rootDir, "chzzk-game-aliases.json");
  return {
    tagVibes: parseTagVibes(tagVibes.value, tagVibes.path),
    sessionRules: parseSessionRules(sessionRules.value, sessionRules.path),
    viewerPlayable: parseViewerPlayableRules(viewerPlayable.value, viewerPlayable.path),
    chzzkAliases: parseChzzkAliases(chzzkAliases.value, chzzkAliases.path),
  };
}
