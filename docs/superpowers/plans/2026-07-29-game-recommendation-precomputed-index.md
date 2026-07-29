# Game Recommendation Precomputed Index Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Render the game recommendation playground from a compact static index whose recommendations are calculated from the full catalog in the daily pipeline.

**Architecture:** A pure domain module defines the finite query set, stable keys, and index types. A pipeline emitter runs the existing `recommend` function for each key over the full catalog and atomically writes `recommendations.json`; the React app fetches and validates that single file, then selects a stored result on control changes.

**Tech Stack:** TypeScript, Vitest, React 18, Vite, Node.js filesystem APIs, GitHub Actions.

## Global Constraints

- The 278k-game manifest and 557 chunks remain the complete source catalog and stay validated and deployed.
- The browser must not request catalog chunks; initial page data is one `recommendations.json` request.
- Every stored recommendation is produced by the existing domain algorithm over the entire catalog.
- The daily refresh and manual backfill workflows must stage the new generated file.
- No server/API, database, or client-side full-catalog cache is added.

---

## File Structure

- `game-recommendation/src/domain/recommendation-index.ts`: shared finite-query enumeration, stable key function, and index types.
- `game-recommendation/src/domain/recommendation-index.test.ts`: query coverage and key uniqueness tests.
- `scripts/pipeline/recommendations.ts`: Node emitter/reader that materializes and validates the static index.
- `scripts/pipeline/recommendations.test.ts`: full-catalog calculation, atomic output, and invalid-index tests.
- `scripts/pipeline/run.ts`: invokes the emitter after a catalog is assembled.
- `scripts/pipeline/index.ts`: validates the persisted index as part of `pipeline:validate`.
- `game-recommendation/src/data/recommendations.ts`: browser loader and structural validator.
- `game-recommendation/src/data/recommendations.test.ts`: single-request and malformed-index tests.
- `game-recommendation/src/main.tsx`: loading/error boundary for the index.
- `game-recommendation/src/ui/App.tsx`: lookup precomputed results rather than call `recommend` against a catalog.
- `game-recommendation/src/ui/App.test.tsx`: UI selection tests using an injected index.
- The two catalog workflows, deploy workflow, and `scripts/pipeline/workflow.test.ts`: stage and verify the asset.

### Task 1: Define the shared index contract and query space

**Files:**
- Create: `game-recommendation/src/domain/recommendation-index.ts`
- Test: `game-recommendation/src/domain/recommendation-index.test.ts`

**Interfaces:**
- Consumes: `Query`, `Recommendation`, `VIBE_KEYS` from `./types`.
- Produces: `ALL_QUERIES: readonly Query[]`, `recommendationKey(query: Query): string`, and `RecommendationIndex` with `generatedAt`, `gameCount`, and `recommendations: Record<string, Recommendation>`.

- [ ] **Step 1: Write the failing test**

```ts
it("covers every UI query combination with unique stable keys", () => {
  expect(ALL_QUERIES).toHaveLength(3 * 5 * 2 * 6);
  expect(new Set(ALL_QUERIES.map(recommendationKey)).size).toBe(ALL_QUERIES.length);
  expect(recommendationKey({ length: "medium", players: 1, viewerParticipation: false, vibe: "healing" }))
    .toBe("medium|1|0|healing");
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run --config game-recommendation/vite.config.ts game-recommendation/src/domain/recommendation-index.test.ts`

Expected: FAIL because the module does not exist.

- [ ] **Step 3: Write the minimal implementation**

```ts
export const ALL_QUERIES = LENGTHS.flatMap((length) => PLAYERS.flatMap((players) =>
  PARTICIPATION.flatMap((viewerParticipation) => VIBE_KEYS.map((vibe) => ({ length, players, viewerParticipation, vibe }))),
));
export function recommendationKey({ length, players, viewerParticipation, vibe }: Query): string {
  return `${length}|${players}|${viewerParticipation ? 1 : 0}|${vibe}`;
}
```

Declare the index type beside this function; import only domain code so Node and browser can share it.

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run --config game-recommendation/vite.config.ts game-recommendation/src/domain/recommendation-index.test.ts`

Expected: PASS.

- [ ] **Step 5: Commit**

Run:
```bash
git add game-recommendation/src/domain/recommendation-index.ts game-recommendation/src/domain/recommendation-index.test.ts
git commit -m "feat: define recommendation index contract"
```

### Task 2: Emit and validate the full-catalog recommendation index

**Files:**
- Create: `scripts/pipeline/recommendations.ts`
- Test: `scripts/pipeline/recommendations.test.ts`
- Modify: `scripts/pipeline/run.ts`, `scripts/pipeline/index.ts`

**Interfaces:**
- Consumes: `CatalogRecord`, `FileStore` from `./emit`; the shared index contract; and `recommend(catalog.games, query, catalog.generatedAt)`.
- Produces: `emitRecommendations(catalog, fs): RecommendationIndex` and `readRecommendations(fs): RecommendationIndex | null` at `src/playground/game-recommendation/recommendations.json`.

- [ ] **Step 1: Write the failing tests**

```ts
it("writes one full-catalog recommendation for every query", () => {
  const index = emitRecommendations(catalogWith(2), fs);
  expect(Object.keys(index.recommendations)).toHaveLength(ALL_QUERIES.length);
  expect(index.gameCount).toBe(2);
  expect(JSON.parse(fs.read(RECOMMENDATIONS_PATH)!)).toEqual(index);
});
it("rejects an index missing a supported query", () => {
  expect(() => readRecommendations(fsMissingOneQuery)).toThrow("missing recommendation");
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run scripts/pipeline/recommendations.test.ts --root . --environment node`

Expected: FAIL because the emitter does not exist.

- [ ] **Step 3: Write the minimal implementation**

```ts
const recommendations = Object.fromEntries(ALL_QUERIES.map((query) => [
  recommendationKey(query),
  recommend(catalog.games, query, catalog.generatedAt),
]));
const index = { generatedAt: catalog.generatedAt, gameCount: catalog.games.length, recommendations };
fs.writeAtomic(RECOMMENDATIONS_PATH, `${JSON.stringify(index, null, 2)}\n`);
```

Validate ISO time, non-negative integer count, exactly the expected key set, and every stored result using existing game/result validation. Invoke the emitter after `emitCatalog` accepts the complete catalog, and make `validateOutput` read and validate the generated index.

- [ ] **Step 4: Run focused tests and typecheck**

Run: `npx vitest run scripts/pipeline/recommendations.test.ts scripts/pipeline/run.test.ts --root . --environment node && npm run typecheck:pipeline`

Expected: PASS.

- [ ] **Step 5: Commit**

Run:
```bash
git add scripts/pipeline/recommendations.ts scripts/pipeline/recommendations.test.ts scripts/pipeline/run.ts scripts/pipeline/index.ts
git commit -m "feat: emit full-catalog recommendation index"
```

### Task 3: Load the static index and render stored recommendations

**Files:**
- Create: `game-recommendation/src/data/recommendations.ts`
- Test: `game-recommendation/src/data/recommendations.test.ts`
- Modify: `game-recommendation/src/main.tsx`, `game-recommendation/src/ui/App.tsx`, `game-recommendation/src/ui/App.test.tsx`

**Interfaces:**
- Consumes: `RecommendationIndex`, `recommendationKey`, and `loadRecommendations(fetcher?: typeof fetch): Promise<RecommendationIndex>`.
- Produces: `App({ index }: { index: RecommendationIndex })`, selecting `index.recommendations[recommendationKey(query)]`.

- [ ] **Step 1: Write failing loader and UI tests**

```ts
it("requests only recommendations.json", async () => {
  await loadRecommendations(fetcher);
  expect(fetcher).toHaveBeenCalledTimes(1);
  expect(fetcher).toHaveBeenCalledWith("./recommendations.json");
});
it("uses the stored result for the changed query", async () => {
  render(<App index={indexWithDistinctMediumAndLongResults} />);
  await userEvent.click(screen.getByRole("button", { name: "4시간+" }));
  expect(screen.getByText("Long-only game")).toBeDefined();
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run --config game-recommendation/vite.config.ts game-recommendation/src/data/recommendations.test.ts game-recommendation/src/ui/App.test.tsx`

Expected: FAIL because the loader and `App.index` prop do not exist.

- [ ] **Step 3: Write the minimal implementation**

```tsx
loadRecommendations().then((index) => root.render(
  <StrictMode><App index={index} /></StrictMode>,
));
```

Replace `useMemo(recommend(...))` with keyed lookup; preserve notices, empty state, rank, cards, debug table, and footer. The loader validates all expected query keys and reports contextual `recommendations.json: ...` errors. Render a small Korean loading message before resolution and retain the existing retry error view.

- [ ] **Step 4: Run focused tests and typecheck**

Run: `npx vitest run --config game-recommendation/vite.config.ts game-recommendation/src/data/recommendations.test.ts game-recommendation/src/ui/App.test.tsx && npm run typecheck:game-recommendation`

Expected: PASS.

- [ ] **Step 5: Commit**

Run:
```bash
git add game-recommendation/src/data/recommendations.ts game-recommendation/src/data/recommendations.test.ts game-recommendation/src/main.tsx game-recommendation/src/ui/App.tsx game-recommendation/src/ui/App.test.tsx
git commit -m "feat: load precomputed game recommendations"
```

### Task 4: Publish the initial index and protect workflows

**Files:**
- Modify: `.github/workflows/catalog-refresh.yml`, `.github/workflows/catalog-backfill.yml`, `.github/workflows/deploy.yml`, `scripts/pipeline/workflow.test.ts`
- Create: `src/playground/game-recommendation/recommendations.json` by running the emitter against the committed catalog.

**Interfaces:**
- Consumes: pipeline-generated `recommendations.json` beside `catalog.json`.
- Produces: bot commits and Pages artifacts that contain the index.

- [ ] **Step 1: Write the failing workflow assertions**

```ts
expect(refresh).toContain("src/playground/game-recommendation/recommendations.json");
expect(backfill).toContain("src/playground/game-recommendation/recommendations.json");
expect(deploy).toContain("test -f _site/playground/game-recommendation/recommendations.json");
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run scripts/pipeline/workflow.test.ts --root . --environment node`

Expected: FAIL because workflows do not name the index.

- [ ] **Step 3: Update automation and generate the initial asset**

Add the index to both bot `git add` commands. Make deploy parse the index and require its `recommendations` object before upload. Run the same emitter through a targeted TSX command against the existing committed catalog; do not run a network refresh or change catalog chunks.

- [ ] **Step 4: Run workflow and static-asset checks**

Run: `npx vitest run scripts/pipeline/workflow.test.ts --root . --environment node && test -f src/playground/game-recommendation/recommendations.json && node -e 'const x=require("./src/playground/game-recommendation/recommendations.json"); if (!x.recommendations) process.exit(1)'`

Expected: PASS and a valid asset.

- [ ] **Step 5: Commit**

Run:
```bash
git add .github/workflows/catalog-refresh.yml .github/workflows/catalog-backfill.yml .github/workflows/deploy.yml scripts/pipeline/workflow.test.ts src/playground/game-recommendation/recommendations.json
git commit -m "ci: publish game recommendation index"
```

### Task 5: End-to-end verification

**Files:**
- Modify only if verification exposes a defect in the files above.

**Interfaces:**
- Consumes: generated index, pipeline validation, React build, and Pages artifact build.
- Produces: evidence that one browser file replaces the 557-chunk startup path.

- [ ] **Step 1: Run test suites**

Run: `npm run test:game-recommendation && npm run test:pipeline`

Expected: PASS.

- [ ] **Step 2: Run type checks and production build**

Run: `npm run typecheck && npm run build`

Expected: PASS and `_site/playground/game-recommendation/recommendations.json` exists.

- [ ] **Step 3: Verify index coverage in the built site**

Run: `node -e 'const fs=require("node:fs"); const x=JSON.parse(fs.readFileSync("_site/playground/game-recommendation/recommendations.json")); if (Object.keys(x.recommendations).length !== 180) process.exit(1)'`

Expected: exits 0.

- [ ] **Step 4: Inspect final scope**

Run: `git diff origin/main... --check && git status --short`

Expected: no whitespace errors; if verification needs a correction, commit only that correction with a precise `fix:` message.

