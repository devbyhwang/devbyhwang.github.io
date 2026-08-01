/**
 * Steam 리뷰 백필 결과와 카탈로그를 대조해 겹침 크기와 커버리지를 잰다.
 * Task 5의 척도 정렬 경로(백분위 매핑 vs 분리 유지)를 이 숫자가 결정한다.
 *
 * 실행: npx tsx scripts/analyze-steam-overlap.ts
 */
import { readFileSync, readdirSync, existsSync } from "node:fs";
import { join } from "node:path";
import type { SteamSpyAllEntry } from "./pipeline/model";

const ROOT = process.cwd();
const ALL_DIR = join(ROOT, "data/raw/steam/all");
const CHUNKS = join(ROOT, "src/playground/game-recommendation/catalog/chunks");

if (!existsSync(ALL_DIR)) throw new Error(`${ALL_DIR} is missing — run npm run pipeline:steam-backfill first`);

const reviews = new Map<number, { positive: number; negative: number }>();
for (const file of readdirSync(ALL_DIR).filter((name) => name.endsWith(".json")).sort()) {
  const snapshot = JSON.parse(readFileSync(join(ALL_DIR, file), "utf8")) as { entries: SteamSpyAllEntry[] };
  for (const entry of snapshot.entries) reviews.set(entry.appId, { positive: entry.positive, negative: entry.negative });
}

let games = 0;
let withSteamAppId = 0;
let matched = 0;
let igdbRated = 0;
let overlap = 0;
let evidenceAfter = 0;
const pairs: Array<{ steam: number; igdb: number }> = [];

for (const file of readdirSync(CHUNKS).filter((name) => name.endsWith(".json")).sort()) {
  const parsed = JSON.parse(readFileSync(join(CHUNKS, file), "utf8")) as { games?: unknown[] } | unknown[];
  const chunk = (Array.isArray(parsed) ? parsed : parsed.games ?? []) as Array<{
    steamAppId?: number;
    quality?: { totalRating?: number; totalRatingCount?: number };
  }>;
  for (const game of chunk) {
    games += 1;
    const rated = game.quality?.totalRating != null;
    if (rated) igdbRated += 1;
    if (game.steamAppId == null) { if (rated) evidenceAfter += 1; continue; }
    withSteamAppId += 1;
    const review = reviews.get(game.steamAppId);
    if (!review) { if (rated) evidenceAfter += 1; continue; }
    const total = review.positive + review.negative;
    if (total <= 0) { if (rated) evidenceAfter += 1; continue; }
    matched += 1;
    evidenceAfter += 1;
    if (rated) {
      overlap += 1;
      pairs.push({ steam: (review.positive / total) * 100, igdb: game.quality!.totalRating! });
    }
  }
}

const pct = (n: number) => `${((100 * n) / games).toFixed(1)}%`;
const quantile = (values: number[], p: number) => values.slice().sort((a, b) => a - b)[Math.floor(values.length * p)];

console.log(`SteamSpy 수집 앱: ${reviews.size.toLocaleString()}`);
console.log(`카탈로그 게임:    ${games.toLocaleString()}`);
console.log(`  steamAppId 보유: ${withSteamAppId.toLocaleString()} (${pct(withSteamAppId)})`);
console.log(`  리뷰 매칭됨:     ${matched.toLocaleString()} (${pct(matched)})`);
console.log(`  IGDB 평점 보유:  ${igdbRated.toLocaleString()} (${pct(igdbRated)})`);
console.log(`\n근거 커버리지: ${pct(igdbRated)} → ${pct(evidenceAfter)}`);
console.log(`겹침(둘 다 보유): ${overlap.toLocaleString()}  → ${overlap >= 2000 ? "백분위 매핑 진행" : "겹침 부족: 분리 유지 경로"}`);

if (pairs.length > 0) {
  const steam = pairs.map((pair) => pair.steam);
  const igdb = pairs.map((pair) => pair.igdb);
  console.log(`\n겹침 집합 분포`);
  for (const p of [0.1, 0.5, 0.9]) {
    console.log(`  p${p * 100}: Steam ${quantile(steam, p)!.toFixed(1)} ↔ IGDB ${quantile(igdb, p)!.toFixed(1)}`);
  }
}
