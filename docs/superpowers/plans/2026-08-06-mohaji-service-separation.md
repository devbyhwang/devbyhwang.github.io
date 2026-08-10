# Mohaji Service Separation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move the game recommendation app and its pipeline to `devbyhwang/mohaji`, publish generated data from R2, and leave the blog with a permanent redirect only.

**Architecture:** `mohaji` owns the React/Vite app and pipeline. Its daily workflow writes versioned catalog data to R2 and switches a small `current.json` manifest only after a complete upload. Cloudflare Pages deploys the app; the blog no longer builds, tests, or stores recommendation assets.

**Tech Stack:** TypeScript, React, Vite, Vitest, Node 22, GitHub Actions, Cloudflare Pages, Cloudflare R2, Wrangler.

## Global Constraints

- Do not migrate `data/raw/**`, `data/history.json`, `catalog/**`, or `exploration/**` from the blog repository into `mohaji`.
- Use `mohaji.pages.dev` as the production URL in this migration.
- The public R2 bucket exposes read-only `releases/<version>/` and `current.json`; credentials never reach browser code.
- A failed refresh must leave the old `current.json` unchanged.
- Retain only 90 days of Twitch observations for games observed with non-zero viewers or channels.
- The blog redirect is added only after the new service has a valid R2 catalog and a successful Pages deployment.
- Test every new behavior without network access; live R2 and Cloudflare checks are operational verification only.

---

## File Structure

### `devbyhwang/mohaji`

| Path | Responsibility |
| --- | --- |
| `src/**` | Latest standalone recommendation UI, migrated from `game-recommendation/src/**`. |
| `scripts/pipeline/**` | Latest sources, scoring, history, validation, and R2 publishing. |
| `scripts/pipeline/storage/r2.ts` | Versioned R2 read/write abstraction used only by the pipeline CLI. |
| `scripts/pipeline/storage/r2.test.ts` | Fake-client tests for upload ordering and manifest atomicity. |
| `scripts/pipeline/history.ts` | Sparse 90-day Twitch history. |
| `scripts/pipeline/publish.ts` | Collects emitted assets and publishes a version to R2. |
| `.github/workflows/catalog-refresh.yml` | Daily source fetch and R2 publish; no generated Git commit. |
| `.github/workflows/deploy.yml` | Test/build and Cloudflare Pages deployment. |
| `wrangler.toml` | Pages project name and public data base URL binding. |

### `devbyhwang/devbyhwang.github.io`

| Path | Responsibility |
| --- | --- |
| `src/playground/game-recommendation/index.njk` | Static 301-style redirect plus accessible fallback link to `https://mohaji.pages.dev/`. |
| `src/_data/studio.js` | Playground card points to the new service. |
| `.github/workflows/deploy.yml` | Blog-only verification and Pages build. |

---

### Task 1: Prepare the target repository and migrate current source code

**Files:**
- Modify in `devbyhwang/mohaji`: `package.json`, `package-lock.json`, `vite.config.ts`, `tsconfig.json`, `tsconfig.pipeline.json`, `README.md`
- Replace in `devbyhwang/mohaji`: `src/**`, `scripts/pipeline/**`, `data/knowledge/**`, `.env.example`
- Delete in `devbyhwang/mohaji`: tracked `public/catalog.json`, `data/history.json`, `data/raw/igdb/latest.json`, `data/raw/steam/latest.json`, `data/raw/twitch/latest.json`

**Interfaces:**
- Consumes: the latest blog-tree `game-recommendation/src/**`, `scripts/pipeline/**`, and `data/knowledge/**`.
- Produces: a standalone app where `src/` is the Vite root and pipeline scripts use `data/` only as local working state.

- [ ] **Step 1: Create a migration inventory test**

Create `scripts/migration-layout.test.ts` that asserts the standalone package has `src/main.tsx`, `scripts/pipeline/index.ts`, `data/knowledge/tag-vibes.json`, and does not track `public/catalog.json` or `data/history.json`.

```ts
expect(existsSync("src/main.tsx")).toBe(true);
expect(existsSync("scripts/pipeline/index.ts")).toBe(true);
expect(existsSync("data/knowledge/tag-vibes.json")).toBe(true);
expect(existsSync("public/catalog.json")).toBe(false);
expect(existsSync("data/history.json")).toBe(false);
```

- [ ] **Step 2: Run the inventory test to verify it fails**

Run: `npx vitest run scripts/migration-layout.test.ts --root . --environment node`

Expected: FAIL because the old target layout still tracks generated catalog and history files.

- [ ] **Step 3: Copy the current app and pipeline into the standalone layout**

Copy `game-recommendation/src/**` to target `src/**`; copy current `scripts/pipeline/**` and `data/knowledge/**`; update test paths that read `game-recommendation/src/...` to `src/...`. Set Vite `root: "."` and `build.outDir: "dist"`; remove all Eleventy output assumptions. Preserve all current source adapters, Steam review alignment, coverage gate, and exploration index code.

- [ ] **Step 4: Delete generated Git state and ignore it**

Remove the listed generated files and add these patterns to target `.gitignore`:

```gitignore
data/history.json
data/raw/*
!data/raw/fixtures/
!data/raw/fixtures/**
data/checkpoints/
dist/
.wrangler/
```

Keep fixture data under `data/raw/fixtures/` tracked.

- [ ] **Step 5: Verify the standalone baseline**

Run: `npm ci && npm run typecheck && npm test && npm run build && npx vitest run scripts/migration-layout.test.ts --root . --environment node`

Expected: all checks pass and `dist/` contains only the app shell/assets, not catalog data.

- [ ] **Step 6: Commit**

```bash
git add package.json package-lock.json vite.config.ts tsconfig.json tsconfig.pipeline.json src scripts data/knowledge .gitignore README.md
git add -u public data
git commit -m "feat: migrate mohaji recommendation service"
```

### Task 2: Make the UI load the active catalog from R2

**Files:**
- Create: `src/data/runtime-config.ts`, `src/data/runtime-config.test.ts`
- Modify: `src/data/catalog.ts`, `src/data/exploration.ts`, `src/main.tsx`, `.env.example`

**Interfaces:**
- Produces: `catalogUrl(path: string, baseUrl: string): string`, which resolves paths relative to the `baseUrl` from `current.json` and defaults to `./` for local fixtures.
- Consumes: R2 `current.json` with `{ version: string, baseUrl: string }`.

- [ ] **Step 1: Write failing URL-resolution tests**

```ts
expect(catalogUrl("catalog.json", "https://data.example/r/2026-08-06/")).toBe("https://data.example/r/2026-08-06/catalog.json");
expect(catalogUrl("./catalog/chunks/0000.json", "./")).toBe("./catalog/chunks/0000.json");
expect(resolveCurrent({ version: "v1", baseUrl: "https://data.example/r/v1/" })).toEqual("https://data.example/r/v1/");
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/data/runtime-config.test.ts`

Expected: FAIL because runtime catalog resolution does not exist.

- [ ] **Step 3: Implement runtime configuration**

Add `catalogUrl` with `new URL(path.replace(/^\.\//, ""), baseUrl).toString()` for absolute bases and unchanged relative paths for `./`. At startup fetch `${VITE_CATALOG_MANIFEST_URL}/current.json`, validate non-empty `version` and absolute `baseUrl`, then pass its `baseUrl` into catalog and exploration loaders. Render a Korean retryable error state if `current.json` or the catalog cannot be loaded. Configure `VITE_CATALOG_MANIFEST_URL` as a public Cloudflare Pages environment variable ending in `/`.

- [ ] **Step 4: Run focused UI tests**

Run: `npx vitest run src/data/runtime-config.test.ts src/data/catalog.test.ts src/data/exploration.test.ts`

Expected: PASS; fixture fetchers continue to use relative URLs.

- [ ] **Step 5: Commit**

```bash
git add src/data src/main.tsx .env.example
git commit -m "feat: load mohaji catalogs from R2"
```

### Task 3: Store sparse history and define R2 publication primitives

**Files:**
- Create: `scripts/pipeline/storage/r2.ts`, `scripts/pipeline/storage/r2.test.ts`, `scripts/pipeline/publish.ts`, `scripts/pipeline/publish.test.ts`
- Modify: `scripts/pipeline/history.ts`, `scripts/pipeline/history.test.ts`, `scripts/pipeline/model.ts`, `package.json`

**Interfaces:**
- Produces: the existing `appendSnapshot(history, snapshots): History` with sparse snapshots, plus `publishRelease(options): Promise<{ version: string }>`.
- `publishRelease` uploads all assets to `releases/<version>/`, then writes `current.json` last.

- [ ] **Step 1: Write failing sparse-history tests**

```ts
expect(makeDailySnapshot(joined)).toEqual({
  "42": { date: "2026-08-06", twitchViewers: 120, twitchChannels: 4, coverage: 1 },
});
expect(makeDailySnapshot([{ ...joined[0], twitch: { viewers: 0, channels: 0 } }])).toEqual({});
```

Also assert `appendSnapshot` preserves only the final 90 observations for a game.

- [ ] **Step 2: Run the history test to verify it fails**

Run: `npx vitest run scripts/pipeline/history.test.ts --root . --environment node`

Expected: FAIL because snapshots currently include zero-observation games.

- [ ] **Step 3: Implement sparse snapshots**

Filter `makeDailySnapshot` to games with `twitch.viewers > 0 || twitch.channels > 0`; keep the existing `slice(-90)` retention. Preserve the existing null growth behavior when a game is absent on the current day.

- [ ] **Step 4: Write failing atomic-publication tests**

Use a fake object client recording `put(key, body, contentType)`. Assert all `releases/v1/*` keys are written before exactly one final `current.json` write, and assert a failed asset upload rejects without writing `current.json`.

- [ ] **Step 5: Implement R2 publication**

Add `@aws-sdk/client-s3` and use its S3-compatible R2 client configured only from `R2_ENDPOINT`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, and `R2_BUCKET`. Upload JSON with `application/json` and binary exploration files with `application/octet-stream`; write `current.json` as `{ "version": version, "baseUrl": publicReleaseBaseUrl }` only after all uploads resolve.

- [ ] **Step 6: Verify**

Run: `npx vitest run scripts/pipeline/history.test.ts scripts/pipeline/storage/r2.test.ts scripts/pipeline/publish.test.ts --root . --environment node && npm run typecheck`

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add scripts/pipeline package.json package-lock.json
git commit -m "feat: publish sparse mohaji data to R2"
```

### Task 4: Replace target Actions with R2 refresh and Pages deployment

**Files:**
- Modify: `.github/workflows/catalog-refresh.yml`, `.github/workflows/deploy.yml`, `.github/workflows/ci.yml`, `README.md`
- Delete: target `.github/workflows` steps that stage or commit `data/**` and `public/catalog.json`
- Create: `wrangler.toml`

**Interfaces:**
- Catalog refresh requires secrets `TWITCH_CLIENT_ID`, `TWITCH_CLIENT_SECRET`, `CHZZK_CLIENT_ID`, `CHZZK_CLIENT_SECRET`, `R2_ENDPOINT`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET` and public variable `R2_PUBLIC_BASE_URL`.
- Pages deployment requires `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID` and uses `mohaji` as the project name.

- [ ] **Step 1: Write workflow contract tests**

Extend `scripts/pipeline/workflow.test.ts` to assert refresh contains `npm run pipeline:publish`, contains R2 variables, and does not contain `git add data/` or `git push`. Assert deploy runs `npm test`, `npm run build`, then `npx wrangler pages deploy dist --project-name mohaji`.

- [ ] **Step 2: Run the contract test to verify it fails**

Run: `npx vitest run scripts/pipeline/workflow.test.ts --root . --environment node`

Expected: FAIL because the existing workflow persists generated state to Git.

- [ ] **Step 3: Implement the workflows**

Keep the daily schedule and refresh concurrency group. Run the pipeline and its validation before `pipeline:publish`; never grant the refresh job `contents: write`. Use a separate `mohaji-pages-deploy` concurrency group, `contents: read`, and deploy the tested `dist/` through Wrangler. Add `wrangler.toml` with `name = "mohaji"`, `pages_build_output_dir = "dist"`, and no credentials.

- [ ] **Step 4: Verify workflow contracts and local build**

Run: `npx vitest run scripts/pipeline/workflow.test.ts --root . --environment node && npm test && npm run build`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add .github/workflows wrangler.toml scripts/pipeline/workflow.test.ts README.md
git commit -m "ci: refresh mohaji catalogs through R2"
```

### Task 5: Publish and verify the independent service

**Files:**
- No source changes expected; configure repository secrets and Cloudflare project/R2 bucket.

**Interfaces:**
- Consumes: Task 4 secrets and workflows.
- Produces: `https://mohaji.pages.dev/` with a R2-served, valid current catalog.

- [ ] **Step 1: Configure secrets and variables**

In `devbyhwang/mohaji`, add the exact Task 4 secret names. Set `R2_PUBLIC_BASE_URL` to the public bucket URL ending in `/`; configure Pages variable `VITE_CATALOG_MANIFEST_URL` with that same value. Do not store the access key in a repository variable or `.env` file.

- [ ] **Step 2: Trigger the target refresh workflow**

Run: `gh workflow run catalog-refresh.yml --repo devbyhwang/mohaji --ref main`

Expected: successful source fetch, validation, version upload, then one `current.json` update; no generated Git commit.

- [ ] **Step 3: Trigger Pages deployment**

Run: `gh workflow run deploy.yml --repo devbyhwang/mohaji --ref main`

Expected: tests, build, and `mohaji.pages.dev` deployment succeed.

- [ ] **Step 4: Perform service verification**

Run: `curl --fail https://mohaji.pages.dev/` and fetch `${R2_PUBLIC_BASE_URL}current.json`; load its `baseUrl/catalog.json`; run the catalog validator against the downloaded manifest; verify all six default vibe queries have at least one recommendation.

- [ ] **Step 5: Record operational result**

Add the workflow URLs and catalog version to `README.md` under a `## Operations` section, then commit:

```bash
git add README.md
git commit -m "docs: record mohaji production operations"
```

### Task 6: Redirect the blog and remove blog-owned recommendation data/actions

**Files:**
- Create: `src/playground/game-recommendation/index.njk`
- Modify: `src/_data/studio.js`, `.github/workflows/deploy.yml`, `README.md`, `src/playground/README.md`
- Delete: `.github/workflows/catalog-refresh.yml`, `.github/workflows/catalog-backfill.yml`, `game-recommendation/**`, `scripts/pipeline/**`, `data/history.json`, `data/raw/**`, `data/checkpoints/**`, `src/playground/game-recommendation/catalog.json`, `src/playground/game-recommendation/catalog/**`, `src/playground/game-recommendation/exploration/**`, `src/playground/game-recommendation/recommendations.json`

**Interfaces:**
- Produces: `/playground/game-recommendation/` redirects to `https://mohaji.pages.dev/` without a client-side dependency.

- [ ] **Step 1: Write the failing redirect template test**

Create `scripts/blog-redirect.test.ts` that reads the built `_site/playground/game-recommendation/index.html` and asserts a refresh meta tag and canonical link point exactly to `https://mohaji.pages.dev/`, plus a visible `<a>` fallback with the same URL.

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run scripts/blog-redirect.test.ts --root . --environment node`

Expected: FAIL because the current path contains the application rather than a redirect document.

- [ ] **Step 3: Implement the redirect and replace the Playground link**

Create a standalone template containing:

```html
<meta http-equiv="refresh" content="0; url=https://mohaji.pages.dev/">
<link rel="canonical" href="https://mohaji.pages.dev/">
<p>게임 추천기는 <a href="https://mohaji.pages.dev/">Mohaji에서 열기</a>로 이동했습니다.</p>
```

Update the studio entry to use `https://mohaji.pages.dev/` directly.

- [ ] **Step 4: Remove retired code, generated data, and Actions**

Delete the listed game application/data paths and refresh/backfill workflows. Remove pipeline test/typecheck/build commands and recommendation-artifact checks from `package.json` and the blog deploy workflow. Keep ordinary Eleventy build and blog tests intact.

- [ ] **Step 5: Verify the lean blog**

Run: `npm ci && npm test && npm run build && npx vitest run scripts/blog-redirect.test.ts --root . --environment node && du -sh _site`

Expected: all checks pass; `_site` has no catalog/exploration directories and is materially below the prior 576MB deployment size.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "refactor: move game recommendations to mohaji"
```

### Task 7: End-to-end migration review

**Files:**
- Modify only if verification reveals a defect.

- [ ] **Step 1: Compare deployment budgets**

Run `du -sh _site` in the blog and `du -sh dist` in `mohaji`; record both sizes in the migration PR description. Confirm neither repository tracks generated catalog/history/raw state.

- [ ] **Step 2: Verify redirect and service content**

Open the blog redirect URL and verify it reaches `https://mohaji.pages.dev/`. In Mohaji, load the active R2 catalog and complete one recommendation flow for each vibe: healing, variety, horror, hardcore, chatting, spectacle.

- [ ] **Step 3: Verify scheduled job safety**

Manually dispatch `catalog-refresh.yml` twice. Confirm the second run never exposes a partial catalog and that both runs leave the Git tree unchanged.

- [ ] **Step 4: Run final checks**

Run in both repositories: `npm run typecheck && npm test && npm run build` (use each repository's defined equivalents). Confirm every command exits 0.

- [ ] **Step 5: Request final code review before merge**

Review both migration diffs for credentials, R2 write ordering, deleted generated data, redirect correctness, and workflow permissions. Fix all Critical and Important findings, re-run Step 4, then merge the two repositories' changes.

## Self-Review

**Spec coverage:** Tasks 1–2 move the current app, Task 3 limits history and adds atomic R2 publishing, Task 4 replaces target Actions, Task 5 verifies public service, Task 6 creates the blog redirect and removes generated assets/actions, and Task 7 checks safety and deployment size.

**Placeholder scan:** The plan contains no TBD/TODO steps; external credentials are named explicitly and are only configured in Task 5.

**Type consistency:** `catalogUrl`, `appendSnapshot`, and `publishRelease` are defined before their workflows or UI consumers use them. `current.json` always supplies `version` and `baseUrl`.
