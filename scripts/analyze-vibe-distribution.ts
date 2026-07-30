/**
 * data/raw/igdb/backfill의 장르·테마에 어휘 사전을 적용해 축별 분포를 출력한다.
 * 네트워크를 타지 않으므로 가중치를 조정하며 반복 실행할 수 있다.
 *
 * 실행: npx tsx scripts/analyze-vibe-distribution.ts
 */
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { deriveVibes } from "./pipeline/enrich";
import { EXCLUDED_THEMES } from "./pipeline/join";
import { loadKnowledge } from "./pipeline/knowledge";
import {
  assertVibeDistribution,
  formatVibeDistribution,
  measureVibeDistribution,
} from "./pipeline/vibe-distribution";
import type { GameRecord } from "./pipeline/model";

const ROOT = process.cwd();
const BACKFILL = join(ROOT, "data", "raw", "igdb", "backfill");

type IgdbGameEntry = { id?: number; genres?: Array<{ name?: string }>; themes?: Array<{ name?: string }> };
type BackfillFile = { games?: IgdbGameEntry[] };

const names = (value: Array<{ name?: string }> | undefined): string[] =>
  (value ?? []).flatMap((entry) => (entry.name ? [entry.name] : []));

const weights = loadKnowledge(ROOT).vibeWeights;
const games: GameRecord[] = [];
let excluded = 0;
let unclassified = 0;

for (const file of readdirSync(BACKFILL).filter((name) => name.endsWith(".json")).sort()) {
  const parsed: unknown = JSON.parse(readFileSync(join(BACKFILL, file), "utf8"));
  // Backfill files are wrapper objects (`{ games: [...] }`), not bare arrays.
  const batch = Array.isArray(parsed) ? parsed : (parsed as BackfillFile).games ?? [];
  for (const game of batch as IgdbGameEntry[]) {
    if (!game || typeof game.id !== "number") continue;
    const genres = names(game.genres);
    const themes = names(game.themes);
    if (themes.some((theme) => EXCLUDED_THEMES.has(theme))) { excluded += 1; continue; }
    if (genres.length === 0 && themes.length === 0) unclassified += 1;
    games.push({ vibes: deriveVibes({ genres, themes, tags: [] }, weights) } as unknown as GameRecord);
  }
}

const distribution = measureVibeDistribution(games);
console.log(`games: ${games.length.toLocaleString()}  excluded(Erotic): ${excluded.toLocaleString()}  no genre/theme: ${unclassified.toLocaleString()}\n`);
console.log(formatVibeDistribution(distribution));

try {
  assertVibeDistribution(distribution);
  console.log("\ngate: PASS");
} catch (error) {
  console.log(`\ngate: FAIL\n${(error as Error).message}`);
  process.exitCode = 1;
}
