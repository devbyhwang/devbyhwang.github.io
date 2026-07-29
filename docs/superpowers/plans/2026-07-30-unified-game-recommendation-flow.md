# Unified Game Recommendation Flow Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Present featured picks and tabbed full exploration as one continuous game recommendation result.

**Architecture:** `App` owns a single labelled recommendation-result region containing the existing featured cards followed immediately by `ExplorationPanel`. `ExplorationPanel` remains responsible for compact-data loading, tabs, states, and bounded page navigation, but becomes an embedded continuation rather than a standalone section with its own heading.

**Tech Stack:** React 18, TypeScript, Vitest, Testing Library, existing compact static exploration assets.

## Global Constraints

- Keep featured cards, recommendation reasons, ranks, special labels, and the existing relaxed-condition notice.
- Keep all five exploration tabs, 24-card page bound, loading/error/empty states, and previous/next navigation.
- Do not change recommendation-index, compact-exploration artifact, or catalog-chunk loading behavior.
- Remove the visible standalone `더 많은 게임 찾아보기` heading.

---

### Task 1: Embed tabbed exploration in the recommendation result flow

**Files:**
- Modify: `game-recommendation/src/ui/App.tsx`
- Modify: `game-recommendation/src/ui/App.test.tsx`
- Modify: `game-recommendation/src/ui/ExplorationPanel.tsx`
- Modify: `game-recommendation/src/ui/ExplorationPanel.test.tsx`
- Modify only if required by an obsolete standalone selector: `game-recommendation/src/ui/styles.css`

**Interfaces:**
- `App({ index })` produces one `section[aria-label="추천 결과"]` containing featured cards and `<ExplorationPanel>`.
- `ExplorationPanel({ query, generatedAt })` continues to provide tabs, result count, compact-data states, and bounded navigation without rendering a standalone heading or nested landmark.

- [ ] **Step 1: Write failing layout tests**

```tsx
render(<App index={index} />);
const result = screen.getByRole("region", { name: "추천 결과" });
expect(within(result).getAllByRole("article").length).toBeGreaterThan(0);
expect(within(result).getByRole("tablist", { name: "탐색 방식" })).toBeInTheDocument();
expect(screen.queryByRole("heading", { name: "더 많은 게임 찾아보기" })).not.toBeInTheDocument();
```

Add a focused `ExplorationPanel` assertion that its embedded root has no
`section` landmark or `더 많은 게임 찾아보기` heading while retaining the
`탐색 방식` tablist.

- [ ] **Step 2: Run tests to verify they fail**

Run:
`npx vitest run --config game-recommendation/vite.config.ts game-recommendation/src/ui/App.test.tsx game-recommendation/src/ui/ExplorationPanel.test.tsx`

Expected: FAIL because the featured cards and exploration panel do not share a
recommendation-result region and the standalone heading still exists.

- [ ] **Step 3: Implement the minimal unified layout**

In `App.tsx`, wrap the current featured-card/empty branch and
`<ExplorationPanel>` in one `<section className="recommendation-flow"
aria-label="추천 결과">`. Keep the panel immediately after featured cards.

```tsx
<section className="recommendation-flow" aria-label="추천 결과">
  {empty ? <div className="empty">...</div> : <div className="cards">...</div>}
  <ExplorationPanel query={query} generatedAt={index.generatedAt} />
</section>
```

In `ExplorationPanel.tsx`, replace its outer `<section aria-label="게임 더
찾아보기">` with `<div className="exploration">`, remove the `<h2>더 많은
게임 찾아보기</h2>`, and retain the result-count paragraph, tablist, states,
cards, and page navigation unchanged. Remove or adjust only CSS that solely
styles the deleted heading.

- [ ] **Step 4: Run tests to verify they pass**

Run:
`npx vitest run --config game-recommendation/vite.config.ts game-recommendation/src/ui/App.test.tsx game-recommendation/src/ui/ExplorationPanel.test.tsx && npm run typecheck:game-recommendation`

Expected: PASS; tabs follow featured recommendations in the shared result
region, the standalone heading is absent, and existing pagination remains
tested.

- [ ] **Step 5: Commit**

```bash
git add game-recommendation/src/ui/App.tsx game-recommendation/src/ui/App.test.tsx \
  game-recommendation/src/ui/ExplorationPanel.tsx game-recommendation/src/ui/ExplorationPanel.test.tsx \
  game-recommendation/src/ui/styles.css
git commit -m "feat: unify game recommendation exploration flow"
```

### Task 2: Verify the unchanged compact exploration integration

**Files:** No source changes expected.

- [ ] **Step 1: Run the full app test suite**

Run: `npm run test:game-recommendation`

Expected: PASS; compact path loading, no catalog chunks, five tabs, and 24-card
bounded page rendering remain covered.

- [ ] **Step 2: Build the production page**

Run: `npm run build`

Expected: PASS; the unified layout compiles and Eleventy copies the compact
exploration assets.

- [ ] **Step 3: Inspect change scope**

Run: `git diff --check && git status --short`

Expected: no whitespace errors and only Task 1 source/test/style changes.
