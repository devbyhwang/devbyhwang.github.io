# Vibe Classification Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make all six vibe axes classify the real catalog by deriving vibes from IGDB genres and themes on an absolute scale, replacing a Steam-tag-only vocabulary that reaches 0.018% of games and a catalog-wide min-max normalization that maps "no data" to healing 0.872.

**Architecture:** IGDB genre and theme names are already fetched (`sources/igdb.ts:20-21`) and discarded at the join step. Preserve them on `GameRecord`, expand `data/knowledge/tag-vibes.json` from eight Steam tags to a three-section vocabulary covering 23 genres + 22 themes + the existing tags, and replace min-max normalization with a noisy-OR combination that is a pure function of one game's own terms. A distribution gate in the pipeline fails the build if any axis becomes dead or runaway.

**Tech Stack:** TypeScript, Node 20, vitest, tsx. No new dependencies. No new network calls.

## Global Constraints

- Vibe weights are constrained to `[0, 1]`. Negative weights are rejected by the knowledge loader. Copied verbatim from spec: *"Under an absolute scale a negative weight has no coherent meaning, and it was the trigger for the current failure."*
- `VIBE_THRESHOLD_BASE` (0.5) and `VIBE_THRESHOLD_RELAXED` (0.35) in `game-recommendation/src/domain/constants.ts` are reused unchanged. Do not edit them.
- No new fetching. All genre/theme data already exists in `data/raw/igdb/backfill`.
- Games with no genres, no themes, and no known tags score 0 on every axis and match no vibe. This is intentional and must not be "fixed" back to a passing default.
- Distribution gate bounds: each axis must reach **at least 0.1%** and **at most 60%** of the catalog at `VIBE_THRESHOLD_BASE`.
- The six vibe keys are exactly `healing`, `variety`, `horror`, `hardcore`, `chatting`, `spectacle`.
- Run pipeline tests with `npm run test:pipeline`. Run client tests with `npm run test:game-recommendation`. Run `npm run typecheck` before each commit.

---

## File Structure

| File | Responsibility | Change |
| --- | --- | --- |
| `data/knowledge/tag-vibes.json` | Vibe vocabulary | Restructure into `genres`/`themes`/`tags`; expand to 45+ terms |
| `scripts/pipeline/model.ts` | Pipeline types | `VibeWeightMap`/`VibeWeights` replace `TagVibeMap`; `GameRecord` gains `genres`, `themes` |
| `scripts/pipeline/knowledge.ts` | Knowledge asset loading + validation | Parse three sections; reject weights outside `[0, 1]` |
| `scripts/pipeline/enrich.ts` | Pure derivation helpers | `deriveVibes` (noisy-OR) replaces `deriveRawVibes`; delete `normalizeVibes` |
| `scripts/pipeline/join.ts` | Source join → `GameRecord` | Preserve genres/themes, call `deriveVibes`, drop `Erotic`, remove normalization pass |
| `scripts/pipeline/schema.ts` | Emitted catalog validation | Validate `genres`, `themes` |
| `scripts/pipeline/vibe-distribution.ts` | **New.** Distribution gate | Measure per-axis share; throw when degenerate |
| `scripts/pipeline/run.ts` | Pipeline orchestration | Call the gate before emitting |
| `scripts/analyze-vibe-distribution.ts` | **New.** Offline tuning tool | Apply the vocabulary to raw backfill and report per-axis shares |
| `game-recommendation/src/domain/filter.ts` | Client filtering | Comment only — record why absent data fails |

`game-recommendation/src/domain/types.ts` needs no change: `Game.genres?: string[]` already exists at line 100.

---

### Task 1: Vibe weight vocabulary and loader

**Files:**
- Modify: `data/knowledge/tag-vibes.json` (entire file)
- Modify: `scripts/pipeline/model.ts:10`, `scripts/pipeline/model.ts:23`
- Modify: `scripts/pipeline/knowledge.ts:8`, `:40-52`, `:112`, `:117`
- Test: `scripts/pipeline/knowledge.test.ts:38`, `:46-52`

**Interfaces:**
- Consumes: nothing from earlier tasks.
- Produces:
  - `export type VibeWeightMap = Record<string, Partial<Record<VibeKey, number>>>`
  - `export type VibeWeights = { genres: VibeWeightMap; themes: VibeWeightMap; tags: VibeWeightMap }`
  - `KnowledgeAssets.vibeWeights: VibeWeights` (replaces `tagVibes: TagVibeMap`)

- [ ] **Step 1: Write the failing tests**

Replace the `tagVibes` expectation in `scripts/pipeline/knowledge.test.ts:38` and the key-rejection test at `:46-52`, and add two range tests:

```typescript
      vibeWeights: {
        genres: expect.any(Object),
        themes: expect.any(Object),
        tags: { Cozy: { healing: expect.any(Number) } },
      },
```

```typescript
  it("rejects a tag vibe key outside the pipeline contract", async () => {
    const root = await knowledgeCopy();
    await changeAsset(root, "tag-vibes.json", (value) => {
      ((value.tags as Record<string, Record<string, number>>).Cozy).relaxing = 1;
    });

    expect(() => loadKnowledge(root)).toThrow(/tag-vibes\.json.*relaxing/);
  });

  it("rejects a negative vibe weight", async () => {
    const root = await knowledgeCopy();
    await changeAsset(root, "tag-vibes.json", (value) => {
      ((value.themes as Record<string, Record<string, number>>).Horror).healing = -1;
    });

    expect(() => loadKnowledge(root)).toThrow(/tag-vibes\.json.*Horror\.healing/);
  });

  it("rejects a vibe weight above one", async () => {
    const root = await knowledgeCopy();
    await changeAsset(root, "tag-vibes.json", (value) => {
      ((value.genres as Record<string, Record<string, number>>).Puzzle).healing = 1.5;
    });

    expect(() => loadKnowledge(root)).toThrow(/tag-vibes\.json.*Puzzle\.healing/);
  });
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run scripts/pipeline/knowledge.test.ts --root . --environment node`
Expected: FAIL — the loader still returns `tagVibes`, and `value.tags` / `value.themes` / `value.genres` are undefined.

- [ ] **Step 3: Rewrite the vocabulary file**

Replace the entire contents of `data/knowledge/tag-vibes.json`. Note the empty objects for `Indie`, `Erotic`, `Historical`, and `Non-fiction` — they are deliberately unweighted and must be present so the vocabulary documents that the decision was made.

```json
{
  "genres": {
    "Indie": {},
    "Adventure": { "spectacle": 0.3 },
    "Simulator": { "healing": 0.4 },
    "Strategy": { "hardcore": 0.4 },
    "Role-playing (RPG)": { "spectacle": 0.4 },
    "Puzzle": { "healing": 0.5, "chatting": 0.3 },
    "Arcade": { "variety": 0.4 },
    "Shooter": { "hardcore": 0.6, "spectacle": 0.3 },
    "Platform": { "hardcore": 0.3 },
    "Sport": { "variety": 0.3, "hardcore": 0.4 },
    "Visual Novel": { "healing": 0.3, "chatting": 0.5 },
    "Racing": { "hardcore": 0.3, "spectacle": 0.4 },
    "Point-and-click": { "healing": 0.3, "chatting": 0.4 },
    "Fighting": { "hardcore": 0.7, "spectacle": 0.4 },
    "Card & Board Game": { "variety": 0.4, "chatting": 0.6 },
    "Turn-based strategy (TBS)": { "hardcore": 0.4, "chatting": 0.3 },
    "Hack and slash/Beat 'em up": { "hardcore": 0.4, "spectacle": 0.5 },
    "Music": { "variety": 0.5, "spectacle": 0.4 },
    "Tactical": { "hardcore": 0.5 },
    "Real Time Strategy (RTS)": { "hardcore": 0.5 },
    "Quiz/Trivia": { "variety": 0.6, "chatting": 0.8 },
    "Pinball": { "variety": 0.3 },
    "MOBA": { "hardcore": 0.8, "spectacle": 0.4 }
  },
  "themes": {
    "Action": { "spectacle": 0.4 },
    "Fantasy": { "spectacle": 0.3 },
    "Science fiction": { "spectacle": 0.3 },
    "Horror": { "horror": 1 },
    "Comedy": { "variety": 0.7, "chatting": 0.5 },
    "Erotic": {},
    "Mystery": { "horror": 0.3, "spectacle": 0.3 },
    "Romance": { "healing": 0.4, "chatting": 0.3 },
    "Kids": { "healing": 0.6 },
    "Survival": { "horror": 0.3, "hardcore": 0.5 },
    "Historical": {},
    "Educational": { "healing": 0.3, "chatting": 0.4 },
    "Open world": { "variety": 0.4 },
    "Drama": { "spectacle": 0.4 },
    "Warfare": { "hardcore": 0.4, "spectacle": 0.3 },
    "Party": { "variety": 1, "chatting": 0.8 },
    "Sandbox": { "healing": 0.3, "variety": 0.5 },
    "Non-fiction": {},
    "Business": { "healing": 0.3, "hardcore": 0.3 },
    "Stealth": { "hardcore": 0.5 },
    "Thriller": { "horror": 0.5, "spectacle": 0.3 },
    "4X (explore, expand, exploit, and exterminate)": { "hardcore": 0.6 }
  },
  "tags": {
    "Cozy": { "healing": 1, "chatting": 0.2 },
    "Horror": { "horror": 1 },
    "Psychological Horror": { "horror": 0.8 },
    "Competitive": { "hardcore": 1, "spectacle": 0.3 },
    "Party Game": { "variety": 1, "chatting": 1 },
    "Roguelike": { "hardcore": 0.7, "variety": 0.3 },
    "Story Rich": { "spectacle": 0.7, "healing": 0.2 },
    "Funny": { "variety": 0.7, "chatting": 0.6 }
  }
}
```

The two negative healing weights that previously sat on `Horror` and `Psychological Horror` are gone.

- [ ] **Step 4: Update the pipeline types**

In `scripts/pipeline/model.ts`, replace line 10:

```typescript
export type VibeWeightMap = Record<string, Partial<Record<VibeKey, number>>>;
export type VibeWeights = {
  genres: VibeWeightMap;
  themes: VibeWeightMap;
  tags: VibeWeightMap;
};
```

and change line 23 inside `KnowledgeAssets` from `tagVibes: TagVibeMap;` to:

```typescript
  vibeWeights: VibeWeights;
```

- [ ] **Step 5: Update the loader**

In `scripts/pipeline/knowledge.ts`, change the import on line 8 from `TagVibeMap` to `VibeWeightMap, VibeWeights`, then replace `parseTagVibes` (lines 40-52) with:

```typescript
function parseVibeWeightMap(value: unknown, path: string, section: string): VibeWeightMap {
  const result: VibeWeightMap = {};
  for (const [term, weights] of Object.entries(object(value, path, section))) {
    const parsed = object(weights, path, `${section}.${term}`);
    result[term] = {};
    for (const [vibe, weight] of Object.entries(parsed)) {
      if (!VIBE_KEYS.has(vibe)) fail(path, `${section}.${term}.${vibe}`);
      if (typeof weight !== "number" || !Number.isFinite(weight) || weight < 0 || weight > 1) {
        fail(path, `${section}.${term}.${vibe}`);
      }
      result[term][vibe as keyof typeof result[string]] = weight;
    }
  }
  return result;
}

function parseVibeWeights(value: unknown, path: string): VibeWeights {
  const source = object(value, path, "root");
  return {
    genres: parseVibeWeightMap(source.genres, path, "genres"),
    themes: parseVibeWeightMap(source.themes, path, "themes"),
    tags: parseVibeWeightMap(source.tags, path, "tags"),
  };
}
```

Then in `loadKnowledge` change line 112's variable name and line 117:

```typescript
  const vibeWeights = readJson(rootDir, "tag-vibes.json");
```
```typescript
    vibeWeights: parseVibeWeights(vibeWeights.value, vibeWeights.path),
```

- [ ] **Step 6: Fix the two other `tagVibes` fixtures**

`scripts/pipeline/history.test.ts:84` — change `tagVibes: {},` to:

```typescript
  vibeWeights: { genres: {}, themes: {}, tags: {} },
```

`scripts/pipeline/join.test.ts:8` — change the `tagVibes: {` opening so the existing tag entries sit under `tags`:

```typescript
  vibeWeights: {
    genres: {},
    themes: {},
    tags: {
```

and close the extra brace at the end of that object literal.

- [ ] **Step 7: Run tests to verify they pass**

Run: `npx vitest run scripts/pipeline/knowledge.test.ts --root . --environment node`
Expected: PASS, 5 tests including the two new range tests.

Then run: `npm run typecheck:pipeline`
Expected: errors remain only in `enrich.ts` / `join.ts` / `enrich.test.ts`, which Tasks 2 and 3 fix. If any *other* file errors, fix it before committing.

- [ ] **Step 8: Commit**

```bash
git add data/knowledge/tag-vibes.json scripts/pipeline/model.ts scripts/pipeline/knowledge.ts scripts/pipeline/knowledge.test.ts scripts/pipeline/history.test.ts scripts/pipeline/join.test.ts
git commit -m "feat: expand vibe vocabulary to genres and themes"
```

---

### Task 2: Noisy-OR derivation on an absolute scale

**Files:**
- Modify: `scripts/pipeline/enrich.ts:1-11`, `:33-62`
- Test: `scripts/pipeline/enrich.test.ts:1-45`

**Interfaces:**
- Consumes: `VibeWeights`, `VibeWeightMap` from Task 1.
- Produces: `export function deriveVibes(input: { genres: string[]; themes: string[]; tags: SteamTag[] }, weights: VibeWeights): Record<VibeKey, number>`. `normalizeVibes` and `deriveRawVibes` no longer exist.

- [ ] **Step 1: Write the failing tests**

Replace the vibe portion of `scripts/pipeline/enrich.test.ts` (the imports on lines 5-10 and the tests using `deriveRawVibes`/`normalizeVibes`) with:

```typescript
import { deriveVibes } from "./enrich";
import type { VibeWeights } from "./model";

const WEIGHTS = {
  genres: { Puzzle: { healing: 0.5 }, Shooter: { hardcore: 0.6 } },
  themes: { Horror: { horror: 1 }, Comedy: { variety: 0.5 }, Party: { variety: 0.5 } },
  tags: { Cozy: { healing: 1 } },
} satisfies VibeWeights;

const EMPTY = { genres: [], themes: [], tags: [] };

describe("deriveVibes", () => {
  it("returns all zeros when the game has no known terms", () => {
    expect(deriveVibes(EMPTY, WEIGHTS)).toEqual({
      healing: 0, variety: 0, horror: 0, hardcore: 0, chatting: 0, spectacle: 0,
    });
  });

  it("ignores terms absent from the vocabulary", () => {
    expect(deriveVibes({ ...EMPTY, genres: ["Unmapped"], themes: ["Alsomissing"] }, WEIGHTS).healing).toBe(0);
  });

  it("saturates on a single full-weight term", () => {
    expect(deriveVibes({ ...EMPTY, themes: ["Horror"] }, WEIGHTS).horror).toBe(1);
  });

  it("combines two weak terms without exceeding one", () => {
    expect(deriveVibes({ ...EMPTY, themes: ["Comedy", "Party"] }, WEIGHTS).variety).toBeCloseTo(0.75, 10);
  });

  it("attenuates tag contributions by share", () => {
    expect(deriveVibes({ ...EMPTY, tags: [{ name: "Cozy", share: 0.4 }] }, WEIGHTS).healing).toBeCloseTo(0.4, 10);
  });

  it("counts a repeated term only once", () => {
    expect(deriveVibes({ ...EMPTY, genres: ["Puzzle", "Puzzle"] }, WEIGHTS).healing).toBeCloseTo(0.5, 10);
  });

  it("combines across genres, themes and tags", () => {
    const result = deriveVibes(
      { genres: ["Puzzle"], themes: ["Comedy"], tags: [{ name: "Cozy", share: 0.5 }] },
      WEIGHTS,
    );
    expect(result.healing).toBeCloseTo(0.75, 10);
    expect(result.variety).toBeCloseTo(0.5, 10);
  });

  it("does not depend on other games in the catalog", () => {
    const alone = deriveVibes({ ...EMPTY, genres: ["Puzzle"] }, WEIGHTS);
    const again = deriveVibes({ ...EMPTY, genres: ["Puzzle"] }, WEIGHTS);
    expect(alone).toEqual(again);
  });

  it("rejects a tag share outside zero to one", () => {
    expect(() => deriveVibes({ ...EMPTY, tags: [{ name: "Cozy", share: -0.1 }] }, WEIGHTS)).toThrow(RangeError);
    expect(() => deriveVibes({ ...EMPTY, tags: [{ name: "Cozy", share: 1.1 }] }, WEIGHTS)).toThrow(RangeError);
  });
});
```

`0.75` in the two-weak-terms case is `1 − (1 − 0.5)(1 − 0.5)`. `0.4` in the share case is `1 − (1 − 1 × 0.4)`.

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run scripts/pipeline/enrich.test.ts --root . --environment node`
Expected: FAIL — `deriveVibes` is not exported from `./enrich`.

- [ ] **Step 3: Replace the implementation**

In `scripts/pipeline/enrich.ts`, change the type import on line 5 from `TagVibeMap` to `VibeWeightMap, VibeWeights`, then replace both `deriveRawVibes` (lines 33-44) and `normalizeVibes` (lines 46-62) with:

```typescript
export function deriveVibes(
  input: { genres: string[]; themes: string[]; tags: SteamTag[] },
  weights: VibeWeights,
): Record<VibeKey, number> {
  const complement: Record<VibeKey, number> = { healing: 1, variety: 1, horror: 1, hardcore: 1, chatting: 1, spectacle: 1 };
  const applied = new Set<string>();

  const apply = (map: VibeWeightMap, section: string, name: string, share: number) => {
    const key = `${section}:${name}`;
    if (applied.has(key)) return;
    applied.add(key);
    const entry = map[name];
    if (!entry) return;
    for (const vibe of VIBE_KEYS) {
      const weight = entry[vibe] ?? 0;
      if (weight <= 0) continue;
      complement[vibe] *= 1 - weight * share;
    }
  };

  for (const name of input.genres) apply(weights.genres, "genre", name, 1);
  for (const name of input.themes) apply(weights.themes, "theme", name, 1);
  for (const tag of input.tags) {
    if (!Number.isFinite(tag.share) || tag.share < 0 || tag.share > 1) {
      throw new RangeError(`tag share must be between 0 and 1: ${tag.name}`);
    }
    apply(weights.tags, "tag", tag.name, tag.share);
  }

  const result = zeroVibes();
  for (const vibe of VIBE_KEYS) result[vibe] = 1 - complement[vibe];
  return result;
}
```

`zeroVibes` and `VIBE_KEYS` already exist at the top of the file (lines 11 and 25) — do not redefine them.

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run scripts/pipeline/enrich.test.ts --root . --environment node`
Expected: PASS, 9 `deriveVibes` tests plus the untouched session/player tests in that file.

- [ ] **Step 5: Commit**

```bash
git add scripts/pipeline/enrich.ts scripts/pipeline/enrich.test.ts
git commit -m "feat: derive vibes on an absolute noisy-OR scale"
```

---

### Task 3: Preserve genres and themes on the catalog record

**Files:**
- Modify: `scripts/pipeline/model.ts` (`GameRecord`, after `sessionShape`)
- Modify: `scripts/pipeline/join.ts:5-7`, `:124`, `:144-146`, `:176-177`
- Modify: `scripts/pipeline/schema.ts` (inside `validateGame`, after the `sessionShape` check at line 125)
- Test: `scripts/pipeline/join.test.ts`, `scripts/pipeline/schema.test.ts`

**Interfaces:**
- Consumes: `deriveVibes` from Task 2.
- Produces: `GameRecord.genres: string[]` and `GameRecord.themes: string[]`, both always present (possibly empty). Every emitted catalog game carries them.

- [ ] **Step 1: Write the failing tests**

Append to `scripts/pipeline/join.test.ts`:

```typescript
  it("preserves IGDB genres and themes on the record", () => {
    const records = joinGames(
      [joinedGame({ genres: [{ name: "Puzzle" }], themes: [{ name: "Comedy" }] })],
      KNOWLEDGE,
      GENERATED_AT,
    );

    expect(records[0].genres).toEqual(["Puzzle"]);
    expect(records[0].themes).toEqual(["Comedy"]);
  });

  it("emits empty arrays when IGDB supplies no genres or themes", () => {
    const records = joinGames([joinedGame({})], KNOWLEDGE, GENERATED_AT);

    expect(records[0].genres).toEqual([]);
    expect(records[0].themes).toEqual([]);
  });

  it("drops genre and theme entries with no name", () => {
    const records = joinGames(
      [joinedGame({ genres: [{ name: "Puzzle" }, {}], themes: [{}] })],
      KNOWLEDGE,
      GENERATED_AT,
    );

    expect(records[0].genres).toEqual(["Puzzle"]);
    expect(records[0].themes).toEqual([]);
  });
```

Use the file's existing helper for building a joined game — read the top of `join.test.ts` and match its shape rather than inventing `joinedGame`/`KNOWLEDGE`/`GENERATED_AT` names if they differ.

Append to `scripts/pipeline/schema.test.ts`'s table of invalid-field cases (it follows the `["description", mutate, "expected path"]` shape used at `emit.test.ts:95`):

```typescript
    ["a non-array genres field", (catalog) => { (catalog.games[0] as Record<string, unknown>).genres = "Puzzle"; }, "games[0].genres"],
    ["a non-string genre entry", (catalog) => { catalog.games[0].genres = [1]; }, "games[0].genres"],
    ["a missing themes field", (catalog) => { delete (catalog.games[0] as Partial<GameRecord>).themes; }, "games[0].themes"],
```

and add `genres: [], themes: [],` to the valid fixture game at `scripts/pipeline/schema.test.ts:16`.

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run scripts/pipeline/join.test.ts scripts/pipeline/schema.test.ts --root . --environment node`
Expected: FAIL — `records[0].genres` is `undefined`, and the schema accepts a missing `themes`.

- [ ] **Step 3: Add the fields to the type**

In `scripts/pipeline/model.ts`, inside `GameRecord`, add immediately after `sessionShape: SessionShape;`:

```typescript
  genres: string[];
  themes: string[];
```

- [ ] **Step 4: Populate them in the join**

In `scripts/pipeline/join.ts`, change the import on lines 5-7 from `deriveRawVibes` / `normalizeVibes` to `deriveVibes`. Then, just after `const tagNames = game.tags.map((tag) => tag.name);` (line 124), add:

```typescript
    const genreNames = (game.igdb.genres ?? []).flatMap((genre) => genre.name ? [genre.name] : []);
    const themeNames = (game.igdb.themes ?? []).flatMap((theme) => theme.name ? [theme.name] : []);
```

Replace the `sessionShape:` line (144) so it reuses `genreNames` instead of recomputing them, and replace the `vibes:` line (146):

```typescript
      sessionShape: classifySessionShape({ genres: genreNames, tags: tagNames }, knowledge.sessionRules),
      genres: genreNames,
      themes: themeNames,
      viewerPlayable: resolveViewerPlayable(String(game.igdb.id), tagNames, knowledge.viewerPlayable),
      vibes: deriveVibes({ genres: genreNames, themes: themeNames, tags: game.tags }, knowledge.vibeWeights),
```

Delete the normalization pass at lines 176-177 and return the candidates directly:

```typescript
  return candidates;
```

- [ ] **Step 5: Validate them in the schema**

In `scripts/pipeline/schema.ts`, inside `validateGame`, immediately after the `sessionShape` check (line 125), add:

```typescript
  for (const field of ["genres", "themes"] as const) {
    const value = game[field];
    if (!Array.isArray(value) || value.some((entry) => typeof entry !== "string" || entry.length === 0)) {
      fail(`${path}.${field}`, "must be an array of non-empty strings");
    }
  }
```

- [ ] **Step 6: Run tests to verify they pass**

Run: `npx vitest run scripts/pipeline/join.test.ts scripts/pipeline/schema.test.ts --root . --environment node`
Expected: PASS.

Then run: `npm run typecheck:pipeline`
Expected: clean. Every fixture that builds a `GameRecord` literal now needs `genres` and `themes`; add `genres: [], themes: [],` to each one the compiler flags (`emit.test.ts:21`, `emit.test.ts:74`, `history.test.ts:100`, `exploration.test.ts:13`, `recommendations.test.ts:19`, `run.test.ts:106`).

- [ ] **Step 7: Commit**

```bash
git add scripts/pipeline/model.ts scripts/pipeline/join.ts scripts/pipeline/schema.ts scripts/pipeline/join.test.ts scripts/pipeline/schema.test.ts scripts/pipeline/emit.test.ts scripts/pipeline/history.test.ts scripts/pipeline/exploration.test.ts scripts/pipeline/recommendations.test.ts scripts/pipeline/run.test.ts
git commit -m "feat: preserve IGDB genres and themes on catalog records"
```

---

### Task 4: Exclude adult-themed games

**Files:**
- Modify: `scripts/pipeline/join.ts` (near the top of the module, and inside the `flatMap` callback)
- Test: `scripts/pipeline/join.test.ts`

**Interfaces:**
- Consumes: `themeNames` from Task 3.
- Produces: `export const EXCLUDED_THEMES: ReadonlySet<string>` from `join.ts`.

Spec rationale to preserve in the code comment — this is a heuristic, not compliance. The IGDB `Erotic` theme is not a legal rating and does not correspond to 게임물관리위원회 청소년이용불가.

- [ ] **Step 1: Write the failing test**

Append to `scripts/pipeline/join.test.ts`:

```typescript
  it("drops games carrying the Erotic theme", () => {
    const records = joinGames(
      [
        joinedGame({ id: 1, themes: [{ name: "Erotic" }] }),
        joinedGame({ id: 2, themes: [{ name: "Comedy" }] }),
      ],
      KNOWLEDGE,
      GENERATED_AT,
    );

    expect(records.map((record) => record.id)).toEqual(["2"]);
  });
```

Match the existing helper's signature for setting an IGDB id.

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run scripts/pipeline/join.test.ts --root . --environment node -t "Erotic"`
Expected: FAIL — both records are returned.

- [ ] **Step 3: Implement the exclusion**

Near the top of `scripts/pipeline/join.ts`, after the imports:

```typescript
/**
 * 방송용 추천에서 제외할 IGDB 테마.
 *
 * Twitch·Chzzk 모두 방송 내 성적 콘텐츠를 금지하므로 성인용 게임은 "뭘 방송할까"의
 * 유효한 답이 아니다. 또한 청소년보호법의 청소년유해매체물은 본인확인 기반 연령
 * 인증을 요구하는데, 이 사이트는 백엔드·계정·세션이 없는 정적 배포라 인증을
 * 구현할 수 없다. 따라서 선택지는 제외 아니면 미검증 배포이지 게이트가 아니다.
 *
 * 이것은 휴리스틱이지 컴플라이언스가 아니다. IGDB Erotic 테마는 법적 등급이 아니며
 * 게임물관리위원회 청소년이용불가와 대응하지 않는다. 노출을 줄일 뿐이다.
 */
export const EXCLUDED_THEMES: ReadonlySet<string> = new Set(["Erotic"]);
```

Inside the `flatMap` callback, immediately after `themeNames` is computed (Task 3, Step 4):

```typescript
    if (themeNames.some((theme) => EXCLUDED_THEMES.has(theme))) return [];
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run scripts/pipeline/join.test.ts --root . --environment node`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add scripts/pipeline/join.ts scripts/pipeline/join.test.ts
git commit -m "feat: exclude adult-themed games from the catalog"
```

---

### Task 5: Vibe distribution gate

**Files:**
- Create: `scripts/pipeline/vibe-distribution.ts`
- Create: `scripts/pipeline/vibe-distribution.test.ts`
- Modify: `scripts/pipeline/run.ts:380` (before `emitCatalog`)

**Interfaces:**
- Consumes: `GameRecord` with populated `vibes` from Tasks 2-3.
- Produces:
  - `export const MIN_VIBE_SHARE = 0.001`, `export const MAX_VIBE_SHARE = 0.6`
  - `export type VibeDistribution = Record<VibeKey, { count: number; share: number }>`
  - `export function measureVibeDistribution(games: readonly GameRecord[]): VibeDistribution`
  - `export function assertVibeDistribution(distribution: VibeDistribution): void` — throws on a degenerate axis
  - `export function formatVibeDistribution(distribution: VibeDistribution): string`

- [ ] **Step 1: Write the failing tests**

Create `scripts/pipeline/vibe-distribution.test.ts`:

```typescript
import { describe, expect, it } from "vitest";
import { assertVibeDistribution, measureVibeDistribution, formatVibeDistribution } from "./vibe-distribution";
import type { GameRecord, VibeKey } from "./model";

const ALL: VibeKey[] = ["healing", "variety", "horror", "hardcore", "chatting", "spectacle"];

function games(count: number, atOrAbove: (index: number) => Partial<Record<VibeKey, number>>): GameRecord[] {
  return Array.from({ length: count }, (_, index) => {
    const vibes = Object.fromEntries(ALL.map((vibe) => [vibe, 0])) as Record<VibeKey, number>;
    Object.assign(vibes, atOrAbove(index));
    return { vibes } as unknown as GameRecord;
  });
}

/** 여섯 축 모두 20%씩 통과하는 균형 잡힌 카탈로그 */
function balanced(count: number): GameRecord[] {
  return games(count, (index) => ({ [ALL[index % ALL.length]!]: 0.9 }));
}

describe("measureVibeDistribution", () => {
  it("counts games at or above the base threshold", () => {
    const distribution = measureVibeDistribution(games(10, (index) => ({ horror: index < 3 ? 0.5 : 0.49 })));

    expect(distribution.horror).toEqual({ count: 3, share: 0.3 });
    expect(distribution.healing).toEqual({ count: 0, share: 0 });
  });

  it("reports zero share for an empty catalog", () => {
    expect(measureVibeDistribution([]).healing).toEqual({ count: 0, share: 0 });
  });
});

describe("assertVibeDistribution", () => {
  it("accepts a balanced catalog", () => {
    expect(() => assertVibeDistribution(measureVibeDistribution(balanced(6000)))).not.toThrow();
  });

  it("rejects a dead axis", () => {
    const catalog = balanced(6000).filter((game) => game.vibes.horror < 0.5);

    expect(() => assertVibeDistribution(measureVibeDistribution(catalog))).toThrow(/horror/);
  });

  it("rejects a runaway axis", () => {
    const catalog = games(6000, (index) => ({ healing: 0.9, [ALL[1 + (index % 5)]!]: 0.9 }));

    expect(() => assertVibeDistribution(measureVibeDistribution(catalog))).toThrow(/healing/);
  });

  it("names every failing axis at once", () => {
    const catalog = games(6000, () => ({ healing: 0.9 }));

    expect(() => assertVibeDistribution(measureVibeDistribution(catalog))).toThrow(/horror.*hardcore|hardcore.*horror/s);
  });
});

describe("formatVibeDistribution", () => {
  it("renders each axis with its count and percentage", () => {
    const text = formatVibeDistribution(measureVibeDistribution(balanced(600)));

    expect(text).toMatch(/healing\s+100\s+16\.7%/);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run scripts/pipeline/vibe-distribution.test.ts --root . --environment node`
Expected: FAIL — module `./vibe-distribution` not found.

- [ ] **Step 3: Implement the gate**

Create `scripts/pipeline/vibe-distribution.ts`:

```typescript
import { VIBE_THRESHOLD_BASE } from "../../game-recommendation/src/domain/constants";
import type { GameRecord, VibeKey } from "./model";

const VIBE_KEYS: VibeKey[] = ["healing", "variety", "horror", "hardcore", "chatting", "spectacle"];

/** 축 하나가 카탈로그의 이 비율에 못 미치면 사실상 죽은 축이다. */
export const MIN_VIBE_SHARE = 0.001;
/** 축 하나가 이 비율을 넘기면 조건을 거르지 못한다. */
export const MAX_VIBE_SHARE = 0.6;

export type VibeDistribution = Record<VibeKey, { count: number; share: number }>;

export function measureVibeDistribution(games: readonly GameRecord[]): VibeDistribution {
  const counts = Object.fromEntries(VIBE_KEYS.map((vibe) => [vibe, 0])) as Record<VibeKey, number>;
  for (const game of games) {
    for (const vibe of VIBE_KEYS) {
      if ((game.vibes[vibe] ?? 0) >= VIBE_THRESHOLD_BASE) counts[vibe] += 1;
    }
  }
  return Object.fromEntries(VIBE_KEYS.map((vibe) => [
    vibe,
    { count: counts[vibe], share: games.length === 0 ? 0 : counts[vibe] / games.length },
  ])) as VibeDistribution;
}

export function formatVibeDistribution(distribution: VibeDistribution): string {
  return VIBE_KEYS
    .map((vibe) => `${vibe.padEnd(10)} ${String(distribution[vibe].count).padStart(7)} ${(distribution[vibe].share * 100).toFixed(1)}%`)
    .join("\n");
}

/**
 * 분위기 분포가 퇴화하면 빌드를 세운다.
 *
 * 2026-07 사고: 어휘가 게임 50개에만 닿았고 전역 min-max 정규화가 "데이터 없음"을
 * healing 0.872로 번역해, healing이 99.997%를 통과시키고 나머지 다섯 축이 한 자릿수만
 * 통과시키는 상태가 조용히 배포됐다. safety.test.ts는 손으로 만든 픽스처 vibes를 쓰기
 * 때문에 내내 통과했다. 이 게이트는 실제 산출 카탈로그를 본다.
 */
export function assertVibeDistribution(distribution: VibeDistribution): void {
  const failures = VIBE_KEYS.flatMap((vibe) => {
    const { count, share } = distribution[vibe];
    if (share < MIN_VIBE_SHARE) {
      return [`${vibe}: ${count} games (${(share * 100).toFixed(3)}%) is below the ${(MIN_VIBE_SHARE * 100).toFixed(1)}% floor`];
    }
    if (share > MAX_VIBE_SHARE) {
      return [`${vibe}: ${count} games (${(share * 100).toFixed(1)}%) is above the ${(MAX_VIBE_SHARE * 100).toFixed(0)}% ceiling`];
    }
    return [];
  });
  if (failures.length > 0) throw new Error(`vibe distribution is degenerate:\n${failures.join("\n")}`);
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run scripts/pipeline/vibe-distribution.test.ts --root . --environment node`
Expected: PASS, 7 tests.

- [ ] **Step 5: Wire the gate into the pipeline**

In `scripts/pipeline/run.ts`, add to the imports:

```typescript
import { assertVibeDistribution, formatVibeDistribution, measureVibeDistribution } from "./vibe-distribution";
```

and immediately before line 380's `const emitted = emitCatalog(...)`:

```typescript
  const vibeDistribution = measureVibeDistribution(catalog.games);
  console.log(`vibe distribution:\n${formatVibeDistribution(vibeDistribution)}`);
  assertVibeDistribution(vibeDistribution);
```

The counts print on every run, not only on failure.

- [ ] **Step 6: Run the pipeline test suite**

Run: `npm run test:pipeline`
Expected: PASS. If `run.test.ts` fails because its fixture catalog now trips the gate, give that fixture's games vibes that clear every axis — the fixture exists to exercise orchestration, not distribution.

- [ ] **Step 7: Commit**

```bash
git add scripts/pipeline/vibe-distribution.ts scripts/pipeline/vibe-distribution.test.ts scripts/pipeline/run.ts scripts/pipeline/run.test.ts
git commit -m "feat: fail the build on a degenerate vibe distribution"
```

---

### Task 6: Measure the real distribution and tune the weights

The draft weights in Task 1 are a starting point. `Action` alone covers 108,439 games and `Adventure` 83,556, so `spectacle` is the axis most likely to breach the 60% ceiling. This task measures against the real backfill and adjusts until the gate passes — without running the network pipeline.

**Files:**
- Create: `scripts/analyze-vibe-distribution.ts`
- Modify: `data/knowledge/tag-vibes.json` (weights only, as the measurements require)

**Interfaces:**
- Consumes: `deriveVibes` (Task 2), `loadKnowledge` (Task 1), `measureVibeDistribution` / `formatVibeDistribution` / `assertVibeDistribution` (Task 5), `EXCLUDED_THEMES` (Task 4).
- Produces: a tuned vocabulary that satisfies the gate. No new runtime code paths.

- [ ] **Step 1: Write the analysis script**

Create `scripts/analyze-vibe-distribution.ts`:

```typescript
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

const names = (value: Array<{ name?: string }> | undefined): string[] =>
  (value ?? []).flatMap((entry) => (entry.name ? [entry.name] : []));

const weights = loadKnowledge(ROOT).vibeWeights;
const games: GameRecord[] = [];
let excluded = 0;
let unclassified = 0;

for (const file of readdirSync(BACKFILL).filter((name) => name.endsWith(".json")).sort()) {
  const parsed: unknown = JSON.parse(readFileSync(join(BACKFILL, file), "utf8"));
  const batch = Array.isArray(parsed) ? parsed : [];
  for (const game of batch as Array<{ id?: number; genres?: Array<{ name?: string }>; themes?: Array<{ name?: string }> }>) {
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
```

Steam tags are passed as `[]` because they exist for 50 games and cannot move any axis by a measurable share.

- [ ] **Step 2: Run it**

Run: `npx tsx scripts/analyze-vibe-distribution.ts`
Expected: a six-row table and a `gate:` verdict. The run reads 136MB across 608 files and takes a minute or two.

- [ ] **Step 3: Tune until the gate passes**

Edit weights in `data/knowledge/tag-vibes.json` and re-run Step 2 until it prints `gate: PASS`. Guidance:

- **If `spectacle` breaches the 60% ceiling** — most likely. Lower `Action` (theme) from 0.4 toward 0.25 and `Adventure` (genre) from 0.3 toward 0.2 so their pair no longer reaches 0.5. `1 − (1 − 0.25)(1 − 0.2) = 0.4`, below the threshold, which forces spectacle to require a genuinely spectacle-leaning term such as `Hack and slash/Beat 'em up` or `Drama`.
- **If an axis falls under the 0.1% floor** — raise the weight of its highest-count term until one term alone clears 0.5. Counts are in the spec's mapping tables.
- Keep every weight within `[0, 1]`; the loader rejects anything else.
- Do not touch `VIBE_THRESHOLD_BASE`.

Record the final six shares in the commit message so the numbers are recoverable later.

- [ ] **Step 4: Spot-check the result**

Confirm the mapping is sane, not merely in-range. Add a temporary log of ten random games per axis at or above 0.5 with their genres and themes, eyeball it, then remove the log. A `horror` list full of puzzle games means the weights are wrong even if the gate passes.

- [ ] **Step 5: Commit**

```bash
git add scripts/analyze-vibe-distribution.ts data/knowledge/tag-vibes.json
git commit -m "feat: tune vibe weights against the real catalog distribution"
```

---

### Task 7: Record the absent-data decision and refresh downstream tests

**Files:**
- Modify: `game-recommendation/src/domain/filter.ts:50-55`
- Modify: `game-recommendation/src/domain/fixtures.ts`
- Test: `game-recommendation/src/domain/exploration.test.ts`, `game-recommendation/src/domain/safety.test.ts`

**Interfaces:**
- Consumes: nothing new. `filter.ts` logic is unchanged — a game scoring 0 already fails `>= 0.5`.
- Produces: no new exports.

- [ ] **Step 1: Comment the filter**

In `game-recommendation/src/domain/filter.ts`, replace the `// ③ 분위기` comment above line 51 with:

```typescript
  // ③ 분위기 — 근거 없는 게임은 탈락시킨다.
  //
  // ①의 인원 필터는 "정보 없음"을 통과시키지만 분위기는 다르다. 분위기는 사용자가
  // 명시적으로 고른 조건이고, 근거 없는 게임을 통과시킨 것이 2026-07 사고의 본질이었다.
  // (전역 min-max 정규화가 "태그 없음"을 healing 0.872로 만들어 카탈로그의 99.997%가
  // 힐링 조건을 통과했다.) 장르·테마·태그가 하나도 없으면 여섯 축이 모두 0이므로 여기서
  // 걸러진다. 결과가 적을 때는 완화 사다리가 임계값을 0.35로 낮추는 것이 올바른 밸브이며,
  // 근거가 0인 게임은 어느 임계값에서도 통과하지 않는다. 기본 통과로 되돌리지 말 것.
```

- [ ] **Step 2: Run the client suite to see what genre data breaks**

Run: `npm run test:game-recommendation`
Expected: `exploration.test.ts` may fail. `rerankExploration` penalizes shared genres via `normalizedGenres` (`domain/exploration.ts:175`), which read an always-empty `genres` field until Task 3. Any test that asserted an exact exploration order was encoding genre-blind behaviour.

- [ ] **Step 3: Update the exploration expectations**

For each failing ordering assertion, work out the expected order under genre-aware diversity and assert that, rather than pasting in whatever the code now produces. Add one test that pins the new behaviour explicitly:

```typescript
  it("pushes back a candidate sharing a genre with an already-chosen game", () => {
    const shared = [
      { ...gameWith({ id: "a", genres: ["Puzzle"] }), score: 1 },
      { ...gameWith({ id: "b", genres: ["Puzzle"] }), score: 0.95 },
      { ...gameWith({ id: "c", genres: ["Shooter"] }), score: 0.9 },
    ];

    expect(rerankExploration(shared.map((entry) => entry.game), shared)).toEqual(["a", "c", "b"]);
  });
```

Match `gameWith` to the helper the file already uses for building games; if none exists, build the literals inline.

- [ ] **Step 4: Derive fixture vibes through the new path**

`domain/safety.test.ts` asserts picks respect the requested vibe, but its `SAMPLE_CATALOG` vibes are hand-written constants — which is why it passed while production was degenerate. In `game-recommendation/src/domain/fixtures.ts`, give each sample game realistic `genres` and `themes`, and set its `vibes` to the values `deriveVibes` produces for those terms under the shipped vocabulary. Compute them with the Task 6 script rather than by hand, and leave a comment on the fixture block:

```typescript
// vibes 값은 data/knowledge/tag-vibes.json의 어휘를 genres·themes에 적용한 결과다.
// 손으로 고치지 말 것 — 손으로 넣은 값이 2026-07 사고를 테스트에서 가렸다.
```

Keep the scenario coverage intact: `safety.test.ts:9` requires all six vibes to appear across the 12 scenarios, so the fixture catalog must still contain games that clear the threshold on each axis.

- [ ] **Step 5: Run both suites**

Run: `npm run test:game-recommendation && npm run test:pipeline`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add game-recommendation/src/domain/filter.ts game-recommendation/src/domain/fixtures.ts game-recommendation/src/domain/exploration.test.ts game-recommendation/src/domain/safety.test.ts
git commit -m "fix: derive fixture vibes and record the absent-data rule"
```

---

### Task 8: Regenerate artifacts and verify end to end

**Files:**
- Modify: `src/playground/game-recommendation/**` (generated)

**Interfaces:**
- Consumes: everything above.
- Produces: regenerated catalog chunks, recommendation index, and exploration artifacts.

Every game's `vibes` change, catalog records gain two fields, and `Erotic` games disappear, so all downstream artifacts must be rebuilt.

- [ ] **Step 1: Regenerate**

Run: `npm run pipeline`

If this needs IGDB/Twitch credentials that are unavailable locally, use the cached raw snapshots instead — `data/raw/` holds 152MB of them, including the full backfill. Check `scripts/pipeline/index.ts` for the offline entry point and prefer `npm run pipeline:validate` to confirm the emitted tree before trusting it.

Expected: the `vibe distribution:` table prints six axes, each between 0.1% and 60%.

- [ ] **Step 2: Verify the fix against the original symptom**

The failure was measured from `exploration/queries/*/manifest.json`. Re-measure the same way:

```bash
cd src/playground/game-recommendation/exploration/queries && \
  for d in medium_1_0_*; do printf "%-28s %s\n" "$d" "$(grep -m1 ordinalCount $d/manifest.json)"; done
```

Expected: six queries with `ordinalCount` values in the thousands-to-tens-of-thousands range. Before this change they were healing 278,312 and the other five between 5 and 11. If healing is still six figures or any other vibe is still single digits, the gate did not catch a real problem — stop and investigate rather than committing.

- [ ] **Step 3: Confirm no adult games survived**

```bash
node -e "
const fs=require('fs'),p='src/playground/game-recommendation/catalog/chunks';
let n=0,e=0;
for(const f of fs.readdirSync(p)){const a=JSON.parse(fs.readFileSync(p+'/'+f,'utf8'));
 for(const g of (Array.isArray(a)?a:a.games||[])){n++; if((g.themes||[]).includes('Erotic'))e++;}}
console.log('games',n,'erotic',e);
"
```

Expected: `erotic 0`, and `games` roughly 8,865 lower than the previous 278,319.

- [ ] **Step 4: Drive the app**

Run: `npm run build:game-recommendation && npm run dev`

Open `/playground/game-recommendation/`, select each of the six vibes in turn, and confirm every one returns a populated result set with a plausible mix. Previously five of six showed a handful of games and 힐링 showed everything. Check the browser network tab shows no catalog chunk requests — the exploration loader must still fetch only manifest, rank, bitsets, and card shards.

- [ ] **Step 5: Full verification**

Run: `npm run typecheck && npm test && npm run build`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/playground/game-recommendation data
git commit -m "chore: regenerate catalog with genre-derived vibes"
```

---

## Self-Review

**Spec coverage**

| Spec section | Task |
| --- | --- |
| 1. Preserve genres and themes | 3 |
| 1. Side effect — genre-aware exploration diversity | 7 (Steps 2-3) |
| 2. Expand the vocabulary | 1 |
| 2. Weights constrained to `[0, 1]` | 1 (Steps 1, 5) |
| 2. Draft mapping tables | 1 (Step 3), tuned in 6 |
| 3. Absolute scale via noisy-OR | 2 |
| 3. Delete `normalizeVibes` | 2 (Step 3) |
| 3. Thresholds reused unchanged | Global Constraints |
| 4. Absent data fails the vibe filter | 7 (Step 1) — no logic change needed, 0 < 0.5 |
| 5. Distribution gate | 5 |
| 5. Gate runs on real catalog, not fixtures | 5 (Step 5), 8 (Step 1) |
| 5. Emit per-axis counts every run | 5 (Step 5) |
| 6. Adult content exclusion | 4 |
| Testing — `enrich.test.ts` | 2 |
| Testing — `knowledge.test.ts` | 1 |
| Testing — `join.test.ts` | 3, 4 |
| Testing — `schema.test.ts` | 3 |
| Testing — distribution gate | 5 |
| Testing — `exploration.test.ts` | 7 |
| Testing — `safety.test.ts` fixtures | 7 (Step 4) |
| Migration — full re-run | 8 |
| Migration — client needs no change | Confirmed: `Game.genres?` exists at `domain/types.ts:100` |

No gaps.

**Type consistency**

`deriveVibes(input, weights)` — defined Task 2, used Tasks 3 and 6, same signature. `VibeWeights` with `genres`/`themes`/`tags` — defined Task 1, used Tasks 2 and 6. `KnowledgeAssets.vibeWeights` — renamed Task 1, read Tasks 3 and 6. `measureVibeDistribution` / `assertVibeDistribution` / `formatVibeDistribution` — defined Task 5, used Tasks 5 and 6. `EXCLUDED_THEMES` — defined Task 4, used Task 6. `GameRecord.genres` / `.themes` — added Task 3, validated Task 3, read Tasks 6 and 8.

**Known risk**

Task 6 may find that the draft weights cannot satisfy the gate without judgement calls no plan can pre-make. That task is deliberately a measure-adjust loop with a concrete tuning heuristic rather than a fixed edit.
