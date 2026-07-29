# 게임 추천 Playground 통합 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `devbyhwang.github.io`의 `/playground/game-recommendation/`에서 React 게임 추천 앱을 제공하고, 같은 저장소의 Actions가 catalog를 매일 갱신하도록 통합한다.

**Architecture:** 기존 React/Vite 소스를 `game-recommendation/`에 두고 Vite 출력은 `src/playground/game-recommendation/`에 생성한다. Eleventy는 기존 passthrough 규칙으로 이 디렉터리를 Pages 산출물에 복사한다. 기존 pipeline은 `scripts/pipeline/`과 루트 `data/`로 이동하며 catalog만 Playground 디렉터리에 기록한다.

**Tech Stack:** Eleventy 3, Node.js 22, React 18, Vite 5, TypeScript, Vitest, GitHub Actions, Twitch/IGDB/Steam APIs

## Global Constraints

- 공개 URL은 `/playground/game-recommendation/`으로 고정한다.
- 앱의 catalog 요청은 `./catalog.json` 상대 경로를 유지한다.
- API credentials는 GitHub Actions secrets에만 두고 저장소 파일에 기록하지 않는다.
- 데이터 갱신 workflow는 매일 `0 0 * * *` UTC에 실행한다.
- 데이터 커밋은 `data/history.json`, `data/raw/**`, `src/playground/game-recommendation/catalog.json`만 포함한다.
- Pages 배포는 기존 블로그 `deploy.yml`의 `push: main` 한 경로만 사용한다.

---

### Task 1: 통합 소스와 테스트 실행 기반 추가

**Files:**
- Create: `game-recommendation/index.html`
- Create: `game-recommendation/src/main.tsx`
- Create: `game-recommendation/src/domain/**`
- Create: `game-recommendation/src/data/**`
- Create: `game-recommendation/src/ui/**`
- Create: `game-recommendation/vite.config.ts`
- Create: `game-recommendation/tsconfig.json`
- Create: `tsconfig.game-recommendation-pipeline.json`
- Modify: `package.json`
- Modify: `package-lock.json`
- Test: `game-recommendation/src/**/*.test.ts`, `game-recommendation/src/**/*.test.tsx`

**Interfaces:**
- Produces a standalone Vite entry whose `index.html` loads `./assets/*` and whose React entry loads `./catalog.json`.
- Produces `npm run test:game-recommendation` and `npm run typecheck:game-recommendation` commands.

- [x] **Step 1: Copy the existing app tests and source into the new `game-recommendation/` root.** Preserve domain, catalog validation, UI, and safety tests; change only relative imports required by the new root.
- [x] **Step 2: Add the Vite config with `root: "game-recommendation"`, `base: "./"`, and output `src/playground/game-recommendation`.** Set `emptyOutDir: false` so the tracked `catalog.json` is not deleted; the build script removes only stale `index.html` and `assets/` first.
- [x] **Step 3: Add package scripts and dependencies.** Use the exact scripts:

  ```json
  "clean:game-recommendation": "rm -rf src/playground/game-recommendation/index.html src/playground/game-recommendation/assets",
  "build:game-recommendation": "npm run clean:game-recommendation && vite build --config game-recommendation/vite.config.ts",
  "test:game-recommendation": "vitest run --config game-recommendation/vite.config.ts",
  "test:pipeline": "vitest run scripts/pipeline --root . --environment node",
  "typecheck:game-recommendation": "tsc --noEmit -p game-recommendation/tsconfig.json",
  "test": "npm run test:game-recommendation && npm run test:pipeline",
  "typecheck": "npm run typecheck:game-recommendation && tsc --noEmit -p tsconfig.game-recommendation-pipeline.json"
  ```

  Add React, React DOM, Vite, Vitest, TypeScript, `@vitejs/plugin-react`, jsdom, and the matching React/Node type packages.
- [x] **Step 4: Run the new app tests and typecheck.**

  Run: `npm run test:game-recommendation && npm run typecheck:game-recommendation`

  Expected: all copied app tests pass and TypeScript exits 0.
- [x] **Step 5: Commit the standalone app port.**

  ```bash
  git add game-recommendation package.json package-lock.json tsconfig.game-recommendation-pipeline.json
  git commit -m "feat: add game recommendation playground app"
  ```

### Task 2: Move the catalog pipeline and data contract

**Files:**
- Create: `scripts/pipeline/**`
- Create: `data/knowledge/**`
- Create: `data/raw/fixtures/**`
- Create: `data/history.json`
- Create: `src/playground/game-recommendation/catalog.json`
- Modify: `scripts/pipeline/emit.ts`
- Modify: `scripts/pipeline/index.ts`
- Modify: `scripts/pipeline/*test.ts`
- Modify: `package.json`
- Modify: `tsconfig.game-recommendation-pipeline.json`

**Interfaces:**
- `npm run pipeline:fixture` emits `src/playground/game-recommendation/catalog.json`.
- `npm run pipeline:backfill -- --start YYYY-MM-DD --end YYYY-MM-DD` resumes yearly IGDB partitions from checkpoints.
- `npm run pipeline:validate` validates that catalog, history, and knowledge assets.
- `npm run pipeline` uses `TWITCH_CLIENT_ID`, `TWITCH_CLIENT_SECRET`, `TWITCH_TOP_GAME_LIMIT`, `TWITCH_STREAM_PAGE_LIMIT`, and `IGDB_RECENT_DAYS` from the environment.

- [x] **Step 1: Copy the pipeline implementation, tests, knowledge, fixtures, and validated live snapshot.** Keep raw caches under `data/raw/{igdb,steam,twitch}` and history under `data/history.json`.
- [x] **Step 2: Change the single catalog path constant from `public/catalog.json` to `src/playground/game-recommendation/catalog.json`.** Update validator messages and memory/file-store assertions in pipeline tests; do not change join, fallback, or 30% guard behavior.
- [x] **Step 3: Add root package scripts:**

  ```json
  "pipeline": "tsx scripts/pipeline/index.ts run",
  "pipeline:backfill": "tsx scripts/pipeline/index.ts backfill",
  "pipeline:fixture": "tsx scripts/pipeline/index.ts fixture",
  "pipeline:validate": "tsx scripts/pipeline/index.ts validate"
  ```

  Add `tsx` and the Node/TypeScript pipeline compiler settings.
- [x] **Step 4: Run the pipeline test and fixture cycle.** The live catalog is intentionally protected from replacement by the 30% guard, so fixture emit/validate was run in an isolated temporary root while the committed live catalog was validated in place.

  Run: `npm run test:game-recommendation && npm run typecheck && npm run pipeline:validate`; run `pipeline:fixture` in an isolated temporary root when a live catalog is present.

  Expected: tests, typechecks, fixture emit, and validation all pass; isolated fixture catalog contains four games and no credential strings.
- [x] **Step 5: Commit the pipeline and initial data.**

  ```bash
  git add scripts data src/playground/game-recommendation/catalog.json package.json package-lock.json tsconfig.game-recommendation-pipeline.json
  git commit -m "feat: integrate game recommendation catalog pipeline"
  ```

### Task 3: Integrate the app into Eleventy Playground

**Files:**
- Modify: `eleventy.config.js`
- Modify: `src/_data/studio.js`
- Modify: `package.json`
- Modify: `README.md`
- Modify: `src/playground/README.md`
- Modify: `.gitignore`

**Interfaces:**
- Existing Playground directory discovery sees `src/playground/game-recommendation` because tracked `catalog.json` is present.
- `npm run build` runs app typecheck, app Vite build, then Eleventy.
- Playground card links to `/playground/game-recommendation/` and uses no external preview asset.

- [x] **Step 1: Add the game recommendation card to `src/_data/studio.js`.** Use title `게임 추천기`, a Korean blurb describing the 2–3 hour / player / vibe recommendation flow, and link label `추천 시작`.
- [x] **Step 2: Update package build scripts so `npm run build` runs `npm run typecheck`, `npm run build:game-recommendation`, then the existing Eleventy command.** Preserve `npm run clean` and output `_site`.
- [x] **Step 3: Add generated artifact ignores for only `src/playground/game-recommendation/index.html` and `src/playground/game-recommendation/assets/`; keep `catalog.json` tracked.** Document the new build and pipeline commands in both README files.
- [x] **Step 4: Build and inspect the output.**

  Run: `npm run build`

  Expected: `_site/playground/game-recommendation/index.html`, hashed assets, and `catalog.json` exist; `_site/playground/index.html` contains the new card link.
- [x] **Step 5: Commit the Eleventy integration.**

  ```bash
  git add eleventy.config.js src/_data/studio.js package.json README.md src/playground/README.md .gitignore
  git commit -m "feat: expose game recommendation in playground"
  ```

### Task 4: Add the single-source daily refresh workflow

**Files:**
- Create: `.github/workflows/catalog-refresh.yml`
- Create: `.github/workflows/catalog-backfill.yml`
- Modify: `.github/workflows/deploy.yml`
- Modify: `README.md`

**Interfaces:**
- The refresh job writes only `data/history.json`, `data/raw`, `data/checkpoints`,
  `src/playground/game-recommendation/catalog.json`, and its chunk directory, then pushes to `main`.
- The backfill job accepts an explicit date range, persists yearly IGDB checkpoints, and serializes runs.
- The existing Pages deployment remains the only deploy workflow; no `workflow_run` trigger is added.

- [x] **Step 1: Add a workflow with `workflow_dispatch` and `schedule: cron: "0 0 * * *"`.** Use Node 22, `npm ci`, repository secrets for Twitch credentials, and repository variables with defaults `TWITCH_TOP_GAME_LIMIT=100`, `TWITCH_STREAM_PAGE_LIMIT=5`, `IGDB_RECENT_DAYS=60`.
- [x] **Step 2: Run `npm run pipeline`, validate successful output, preserve both exit codes, stage `data/history.json data/raw data/checkpoints src/playground/game-recommendation/catalog.json src/playground/game-recommendation/catalog/chunks`, commit only when changed, and push.** Add concurrency `game-recommendation-refresh` with `cancel-in-progress: false` to prevent overlapping daily refreshes.
- [x] **Step 3: Extend the existing deploy build job with `npm test`, `npm run typecheck`, `npm run build`, and a check for `_site/playground/game-recommendation/catalog.json`.
- [x] **Step 4: Validate workflow YAML text, run the local checks, and commit.**

- [x] **Step 5: Add the manual historical backfill workflow.** Require inclusive `start` and exclusive `end` dates, use Twitch secrets only, run `npm run pipeline:backfill` followed by validation, and commit the catalog plus checkpoint/raw outputs.

  ```bash
  npm test && npm run typecheck && npm run build && npm run pipeline:validate
  git diff --check
  git add .github/workflows/catalog-refresh.yml .github/workflows/deploy.yml README.md
  git commit -m "ci: refresh game recommendation catalog daily"
  ```

### Task 5: Final verification and handoff

**Files:**
- Modify: `docs/superpowers/specs/2026-07-29-game-recommendation-playground-integration-design.md`
- Modify: `docs/superpowers/plans/2026-07-29-game-recommendation-playground-integration.md`

- [x] **Step 1: Run the complete local verification.**

  ```bash
  npm test
  npm run typecheck
  npm run build
  # Run pipeline:fixture in an isolated temporary root when a live catalog is present.
  npm run pipeline:validate
  test -f _site/playground/game-recommendation/index.html
  test -f _site/playground/game-recommendation/catalog.json
  rg -F '/playground/game-recommendation/' _site/playground/index.html
  ```

- [x] **Step 2: Inspect the final diff for secrets and unrelated files.**

  ```bash
  git diff --check
  rg -n -i 'client[_-]?secret|access[_-]?token|authorization:|bearer ' data scripts game-recommendation src/playground/game-recommendation/catalog.json
  git status --short
  ```

  Expected: no credential-like values in actual data and only planned files changed.
- [x] **Step 3: Mark this plan complete, commit docs, and push the integration branch.**

  ```bash
  git add docs/superpowers/specs/2026-07-29-game-recommendation-playground-integration-design.md docs/superpowers/plans/2026-07-29-game-recommendation-playground-integration.md
  git commit -m "docs: plan game recommendation playground integration"
  git push -u origin agent/game-recommendation-playground
  ```

- [ ] **Step 4: Configure target repository secrets `TWITCH_CLIENT_ID` and `TWITCH_CLIENT_SECRET`, then run `Refresh game recommendation catalog` manually once after merge.** Confirm the data commit triggers exactly one existing Pages deploy.

## Execution status

Implementation and local verification are complete on `agent/game-recommendation-historical-catalog`.
The remaining steps require the target repository's Actions secrets and a merge to `main`.
