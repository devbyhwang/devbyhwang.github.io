# Game Recommendation Exploration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give streamers paginated, diverse, full-query game exploration without loading catalog chunks in the browser.

**Architecture:** The pipeline emits query ranking manifests and hash-sharded card payloads from the full catalog. The browser loads a query page and only needed card shards; the UI provides five views and explicit 24-card pagination.

**Tech Stack:** TypeScript, React 18, Vitest, Node filesystem APIs, GitHub Actions.

## Global Constraints

- The pipeline is the only evaluator of the 278k-game catalog.
- The browser must never load catalog chunks.
- Every query exposes all matches with 24 cards per page.
- The first 96 results use deterministic MMR-style diversity reranking; later results retain score order.
- Views: 전체 추천, 신작, 지금 뜨는, 숨은 게임, 클래식.
- Pipeline and Pages validate catalog metadata, query/view pages, and card membership.

---

### Task 1: Define exploration contracts and deterministic diversity reranking

**Files:** Create `game-recommendation/src/domain/exploration.ts`; test `game-recommendation/src/domain/exploration.test.ts`.

**Interfaces:** Export `ExplorationView`, `ExplorationManifest`, `ExplorationPage`, `ExplorationCard`, `PAGE_SIZE = 24`, `DIVERSE_PREFIX_SIZE = 96`, and `rerankExploration(games, scored): string[]`.

- [ ] **Step 1: Write failing test**

```ts
expect(PAGE_SIZE).toBe(24);
expect(rerankExploration(fixtureGames, fixtureScores).slice(0, 2))
  .toEqual(["different-franchise-high-score", "next-best-distinct-game"]);
```

- [ ] **Step 2: Run RED test**

Run: `npx vitest run --config game-recommendation/vite.config.ts game-recommendation/src/domain/exploration.test.ts`

Expected: FAIL because the module does not exist.

- [ ] **Step 3: Implement**

Greedily select the first 96 by score minus overlap penalties for franchise, genre, tags, and release-era bucket. Append later IDs in existing score and ID tie-break order.

- [ ] **Step 4: Run GREEN test**

Run: `npx vitest run --config game-recommendation/vite.config.ts game-recommendation/src/domain/exploration.test.ts`

- [ ] **Step 5: Commit**

```bash
git add game-recommendation/src/domain/exploration.ts game-recommendation/src/domain/exploration.test.ts
git commit -m "feat: define diverse game exploration ranking"
```

### Task 2: Emit complete static ranking pages and card shards

**Files:** Create `scripts/pipeline/exploration.ts`, `scripts/pipeline/exploration.test.ts`; modify `scripts/pipeline/run.ts`, `scripts/pipeline/index.ts`.

**Interfaces:** `emitExploration(catalog, fs)` writes each query/view's 24-ID pages and stable game-ID card shards. It validates timestamp/count equality, complete query/view/page coverage, no duplicate IDs, and every page ID resolves to one card.

- [ ] **Step 1: Write failing test**

```ts
const output = emitExploration(catalogWith(30), fs);
expect(output.pageSize).toBe(24);
expect(readPage(fs, query, "all", 0).ids).toHaveLength(24);
expect(readPage(fs, query, "all", 1).ids).toHaveLength(6);
```

- [ ] **Step 2: Run RED test**

Run: `npx vitest run scripts/pipeline/exploration.test.ts --root . --environment node`

- [ ] **Step 3: Implement**

Score/filter the full catalog per query, derive all five views, diversity-rerank only the first 96 default IDs, split views into 24-ID JSON pages, and emit minimal display card data into deterministic hash shards.

- [ ] **Step 4: Run GREEN tests**

Run: `npx vitest run scripts/pipeline/exploration.test.ts scripts/pipeline/run.test.ts --root . --environment node && npm run typecheck:pipeline`

- [ ] **Step 5: Commit**

```bash
git add scripts/pipeline/exploration.ts scripts/pipeline/exploration.test.ts scripts/pipeline/run.ts scripts/pipeline/index.ts
git commit -m "feat: emit paginated game exploration data"
```

### Task 3: Load exploration pages and render streamer browsing

**Files:** Create `game-recommendation/src/data/exploration.ts`, `game-recommendation/src/data/exploration.test.ts`, `game-recommendation/src/ui/ExplorationPanel.tsx`, `game-recommendation/src/ui/ExplorationPanel.test.tsx`; modify `App.tsx` and styles.

**Interfaces:** `loadExplorationPage(query, view, page)`, `loadCards(ids)`, and `ExplorationPanel({ query, generatedAt })`.

- [ ] **Step 1: Write failing test**

```tsx
render(<ExplorationPanel query={query} generatedAt={generatedAt} />);
expect(await screen.findAllByRole("article")).toHaveLength(24);
await userEvent.click(screen.getByRole("button", { name: "더 보기" }));
expect(await screen.findAllByRole("article")).toHaveLength(48);
```

- [ ] **Step 2: Run RED test**

Run: `npx vitest run --config game-recommendation/vite.config.ts game-recommendation/src/data/exploration.test.ts game-recommendation/src/ui/ExplorationPanel.test.tsx`

- [ ] **Step 3: Implement**

Cache successful manifest/page/shard promises by URL. Load 24 cards at a time, reset pages when views change, and render loading/empty/retry states without requesting catalog chunks.

- [ ] **Step 4: Run GREEN tests**

Run: `npx vitest run --config game-recommendation/vite.config.ts game-recommendation/src/data/exploration.test.ts game-recommendation/src/ui/ExplorationPanel.test.tsx && npm run typecheck:game-recommendation`

- [ ] **Step 5: Commit**

```bash
git add game-recommendation/src/data/exploration.ts game-recommendation/src/data/exploration.test.ts game-recommendation/src/ui/ExplorationPanel.tsx game-recommendation/src/ui/ExplorationPanel.test.tsx game-recommendation/src/ui/App.tsx game-recommendation/src/ui/styles.css
git commit -m "feat: browse paginated game recommendations"
```

### Task 4: Publish and verify exploration assets

**Files:** Modify both catalog workflows, deploy workflow, and workflow tests; create generated `src/playground/game-recommendation/exploration/` assets.

- [ ] **Step 1: Write failing workflow test**

```ts
expect(refresh).toContain("src/playground/game-recommendation/exploration");
expect(deploy).toContain("pageSize");
```

- [ ] **Step 2: Run RED test**

Run: `npx vitest run scripts/pipeline/workflow.test.ts --root . --environment node`

- [ ] **Step 3: Implement**

Stage exploration output; validate built manifest metadata, all query/view/pages, 24-ID page limits, and shard membership; generate initial assets from existing chunks without network refresh.

- [ ] **Step 4: Run GREEN checks**

Run: `npx vitest run scripts/pipeline/workflow.test.ts --root . --environment node && npm run pipeline:validate`

- [ ] **Step 5: Commit**

```bash
git add .github/workflows scripts/pipeline/workflow.test.ts src/playground/game-recommendation/exploration
git commit -m "ci: publish game exploration assets"
```

### Task 5: Verify end to end

- [ ] Run `npm test`, `npm run typecheck`, and `npm run build`.
- [ ] Assert the built exploration manifest has `pageSize === 24`.
- [ ] Run `git diff origin/main... --check` and inspect `git status --short`.
