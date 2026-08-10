# Blog Game Recommendation Redirect Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Preserve every blog-owned game-recommendation asset while redirecting the legacy public entry point to Mohaji and linking the Playground card directly to the external service.

**Architecture:** First neutralize the already-committed deletion stack with additive revert commits so the working tree returns to the pre-removal Git objects without rewriting history. Then replace only the public Eleventy entry point with a static progressive redirect and add an explicit `external` link contract to the shared Playground card renderer. Keep the legacy application, pipeline, data, workflows, and pinned source commit reachable and unchanged.

**Tech Stack:** Eleventy 3, Nunjucks, Vitest, Node.js, Git, GitHub Pages.

## Global Constraints

- The approved design is `docs/superpowers/specs/2026-08-10-blog-game-recommendation-redirect-design.md`.
- The exact redirect destination is `https://mohaji-ci1.pages.dev/`.
- Preserve `/playground/game-recommendation/` and `/playground/game-recommendation/index.html` as aliases for the same redirect document.
- Use `location.replace` only as progressive enhancement; meta refresh, canonical, and a visible fallback link are mandatory.
- Do not preserve legacy query strings or hashes.
- Only the Mohaji card opens a new tab and displays `↗`; internal Playground cards retain current same-tab behavior.
- Do not delete the blog repository, any tracked source/data/workflow file, GitHub Pages, or the redirect template.
- Do not force push, rebase, rewrite history, change repository visibility, or disable GitHub Pages.
- Keep `18257f9f75b3223386e87a5b8941fce0d9e7342b` reachable from HEAD.
- Preserve exactly 87 `data/raw/steam/all/*.json` pages and 608 `data/raw/igdb/backfill/*.json` pages.
- Do not add the user's existing untracked plans `docs/superpowers/plans/2026-07-30-chzzk-weighted-buzz.md` and `docs/superpowers/plans/2026-07-31-steam-review-backfill.md` to any commit.
- Do not push. Stop after showing the aggregate changed-file list and deletion checks.

---

### Task 1: Restore the deletion stack from Git objects

**Files:**
- Restore: every path deleted by `18aa25e2c839df941ac645cf413b68ea80425a32`
- Restore: redirect-related modifications changed again by `115108b9d73d77a57be75a1187cb92d72277275b`
- Preserve: `docs/superpowers/specs/2026-08-10-blog-game-recommendation-redirect-design.md`
- Preserve: the two user-owned untracked plan files named in Global Constraints

**Interfaces:**
- Consumes: exact committed trees from `115108b9d`, `18aa25e2c`, the `origin/main` merge base, and pinned commit `18257f9f7`
- Produces: an additive restoration commit with no deletion relative to `origin/main...HEAD`

- [ ] **Step 1: Record the starting state and exact comparison points**

Run:

```bash
git status --short --branch
git merge-base origin/main HEAD
git diff --diff-filter=D --name-only origin/main...HEAD | wc -l
git diff --diff-filter=D --name-only 18257f9f75b3223386e87a5b8941fce0d9e7342b...HEAD | wc -l
```

Expected: the branch is ahead, the two pre-existing user plan files are untracked, and thousands of deleted paths prove restoration is still required.

- [ ] **Step 2: Revert the URL-only follow-up and removal commit without rewriting history**

Run exactly in this order:

```bash
git revert --no-commit 115108b9d73d77a57be75a1187cb92d72277275b
git revert --no-commit 18aa25e2c839df941ac645cf413b68ea80425a32
```

Expected: Git restores the deleted files and pre-removal versions from committed objects. The redirect template and redirect test from the removal commit disappear at this intermediate baseline. Do not resolve a conflict by regenerating data; if either revert conflicts, stop and inspect the exact paths before continuing.

- [ ] **Step 3: Restore any remaining branch-point deletions mechanically**

Compute the merge base and inspect the remaining list:

```bash
base_sha="$(git merge-base origin/main HEAD)"
git diff --diff-filter=D --name-only -z origin/main...HEAD \
  | xargs -0 git checkout "$base_sha" --
```

Then restore the two pinned corpora from their authoritative commit regardless of branch-point contents:

```bash
git checkout 18257f9f75b3223386e87a5b8941fce0d9e7342b -- \
  data/raw/steam/all data/raw/igdb/backfill
```

Expected: all bytes come from Git objects; no raw page is manually generated. The task-specific `base_sha` variable is not a system option and is used only in this shell.

- [ ] **Step 4: Verify restoration before committing**

Run:

```bash
test "$(git diff --diff-filter=D --name-only origin/main -- | wc -l | tr -d ' ')" = "0"
test "$(find data/raw/steam/all -maxdepth 1 -name '*.json' | wc -l | tr -d ' ')" = "87"
test "$(find data/raw/igdb/backfill -maxdepth 1 -name '*.json' | wc -l | tr -d ' ')" = "608"
git merge-base --is-ancestor \
  18257f9f75b3223386e87a5b8941fce0d9e7342b HEAD
git diff --check
git status --short
```

Expected: deleted-file count is zero, corpus counts are 87 and 608, the pinned commit is still an ancestor, and only the intended restoration plus the two untracked user files are visible.

- [ ] **Step 5: Commit only the additive restoration**

Stage tracked restoration changes without adding untracked files:

```bash
git add -u
git commit -m "restore: preserve blog game recommendation assets"
```

Expected: the user-owned untracked plan files remain untracked and absent from the commit.

### Task 2: Define redirect and external-card behavior with failing tests

**Files:**
- Create: `scripts/blog-redirect.test.ts`
- Modify later: `src/playground/game-recommendation/index.njk`
- Modify later: `src/_data/studio.js`
- Modify later: `src/_includes/partials/playground-grid.njk`
- Modify later: `eleventy.config.js`
- Modify later: `package.json`

**Interfaces:**
- Consumes: built `_site/playground/game-recommendation/index.html` and `_site/playground/index.html`
- Produces: a build-output contract for redirect layers and per-link external behavior

- [ ] **Step 1: Write the redirect output test before implementation**

Create `scripts/blog-redirect.test.ts` with this complete contract:

```ts
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const destination = "https://mohaji-ci1.pages.dev/";
const legacyPath = "/playground/game-recommendation/";

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function cardAnchor(output: string, ariaLabel: string): string {
  const pattern = new RegExp(
    `<a\\b(?=[^>]*aria-label="${escapeRegExp(ariaLabel)}")[^>]*>[\\s\\S]*?</a>`,
  );
  const match = output.match(pattern);
  expect(match, `missing card anchor: ${ariaLabel}`).not.toBeNull();
  return match![0];
}

describe("retired game recommendation route", () => {
  it("builds a progressive redirect to the exact Mohaji root", () => {
    const output = readFileSync(
      resolve("_site/playground/game-recommendation/index.html"),
      "utf8",
    );

    expect(output).toContain(
      '<meta http-equiv="refresh" content="0; url=https://mohaji-ci1.pages.dev/">',
    );
    expect(output).toContain(`location.replace(${JSON.stringify(destination)})`);
    expect(output).toContain(`<link rel="canonical" href="${destination}">`);
    expect(output).toContain(`<a href="${destination}">Mohaji에서 열기</a>`);
    expect(output).not.toContain("location.search");
    expect(output).not.toContain("location.hash");
  });

  it("links only the Mohaji card externally in a new tab", () => {
    const output = readFileSync(resolve("_site/playground/index.html"), "utf8");
    const mohaji = cardAnchor(
      output,
      "오늘 뭐 켜지? · Mohaji 추천 시작 새 탭에서 열기",
    );
    const embercraft = cardAnchor(output, "Embercraft Fireplace Launch");

    expect(mohaji).toContain(`href="${destination}"`);
    expect(mohaji).toContain('target="_blank"');
    expect(mohaji).toContain('rel="noopener"');
    expect(mohaji).toContain("↗");

    expect(embercraft).toContain('href="/playground/embercraft/"');
    expect(embercraft).not.toContain('target="_blank"');
    expect(embercraft).not.toContain('rel="noopener"');
    expect(embercraft).not.toContain("↗");
    expect(output).not.toContain(`href="${legacyPath}"`);
  });
});
```

The helper scopes each assertion to one anchor by its unique accessible name;
do not assert target/rel against the whole page because the test must prove the
behavior is card-specific.

- [ ] **Step 2: Build the pre-implementation site**

Run:

```bash
npm ci
npm run build
```

Expected: the legacy React game recommendation app is built at `_site/playground/game-recommendation/index.html` and the commands exit 0.

- [ ] **Step 3: Run the focused test and verify RED**

Run:

```bash
npx vitest run scripts/blog-redirect.test.ts --root . --environment node
```

Expected: FAIL because the built legacy page has no meta refresh, `location.replace`, canonical link, or fallback, and the Mohaji card still points to the legacy internal URL.

- [ ] **Step 4: Commit the verified failing test**

```bash
git add scripts/blog-redirect.test.ts
git commit -m "test: specify Mohaji redirect handoff"
```

### Task 3: Implement the static redirect and explicit external link contract

**Files:**
- Create: `src/playground/game-recommendation/index.njk`
- Modify: `src/_data/studio.js`
- Modify: `src/_includes/partials/playground-grid.njk`
- Modify: `eleventy.config.js`
- Modify: `package.json`

**Interfaces:**
- Consumes: `launch.external?: boolean` in Playground link data
- Produces: one redirect document and conditional external-link markup

- [ ] **Step 1: Add the redirect document**

Create `src/playground/game-recommendation/index.njk` with a static Korean HTML document containing this exact head/body behavior:

```html
<!doctype html>
<html lang="ko">
  <head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <meta http-equiv="refresh" content="0; url=https://mohaji-ci1.pages.dev/">
    <script>location.replace("https://mohaji-ci1.pages.dev/")</script>
    <link rel="canonical" href="https://mohaji-ci1.pages.dev/">
    <title>Mohaji로 이동합니다</title>
  </head>
  <body>
    <p>게임 추천기는 <a href="https://mohaji-ci1.pages.dev/">Mohaji에서 열기</a>로 이동했습니다.</p>
  </body>
</html>
```

Do not read or append `location.search` or `location.hash`.

- [ ] **Step 2: Make Eleventy publish only the redirect entry point**

In `eleventy.config.js`, keep all existing demo passthrough behavior except the game-recommendation directory:

```js
getPlaygroundDemoDirectories().forEach((demoDirectory) => {
  if (demoDirectory === "game-recommendation") return;
  eleventyConfig.addPassthroughCopy({
    [`src/playground/${demoDirectory}`]: `playground/${demoDirectory}`,
  });
});
eleventyConfig.addPassthroughCopy({
  "src/playground/game-recommendation/index.njk":
    "playground/game-recommendation/index.html",
});
```

This prevents old catalog/chunk assets from being republished while preserving every source file in Git.

- [ ] **Step 3: Change only the Mohaji card data**

Update the game recommendation item in `src/_data/studio.js` to:

```js
{
  title: "오늘 뭐 켜지? · Mohaji",
  blurb: "방송 시간, 함께할 인원, 원하는 분위기를 고르면 지금 켜기 좋은 게임을 추천합니다.",
  links: [
    {
      label: "추천 시작",
      href: "https://mohaji-ci1.pages.dev/",
      external: true,
    },
  ],
},
```

Do not add `external` to internal Playground links.

- [ ] **Step 4: Render external behavior conditionally**

In `src/_includes/partials/playground-grid.njk`, make only `launch.external` links receive external attributes and accessible copy:

```njk
<a
  class="playground-card"
  href="{{ launch.href | url }}"
  aria-label="{{ item.title }} {{ launch.label }}{% if launch.external %} 새 탭에서 열기{% endif %}"
  {% if launch.external %}target="_blank" rel="noopener"{% endif %}
>
```

In the visible inline link text, render `{{ launch.label }} ↗` for external links and preserve `{{ launch.label }} →` for internal links. Do not infer external status from URL shape.

- [ ] **Step 5: Keep legacy sources/tests but remove the legacy app from the blog build**

Modify only scripts in `package.json`:

```json
"build": "npm run clean && npm run typecheck && ELEVENTY_ENV=production eleventy",
"pretest": "npm run build",
"test": "npm run test:game-recommendation && npm run test:pipeline && npm run test:blog-redirect",
"test:blog-redirect": "vitest run scripts/blog-redirect.test.ts --root . --environment node"
```

Keep `build:game-recommendation`, `test:game-recommendation`, `test:pipeline`, all pipeline commands, all dependencies, and all devDependencies intact. A package-lock rewrite is not expected because dependencies do not change.

- [ ] **Step 6: Rebuild and verify GREEN**

Run:

```bash
npm run build
npx vitest run scripts/blog-redirect.test.ts --root . --environment node
```

Expected: production build exits 0; both focused tests pass; the built legacy path is now the redirect document and internal cards remain same-tab.

- [ ] **Step 7: Commit the implementation**

```bash
git add \
  src/playground/game-recommendation/index.njk \
  src/_data/studio.js \
  src/_includes/partials/playground-grid.njk \
  eleventy.config.js package.json
git commit -m "feat: redirect blog game recommendations to Mohaji"
```

### Task 4: Full verification and push-stop handoff

**Files:**
- Verify: all tracked files
- Do not modify: remote branches, GitHub Pages settings, repository visibility, legacy history

**Interfaces:**
- Consumes: completed redirect implementation and additive restoration
- Produces: fresh test evidence and an exact pre-push changed-file list

- [ ] **Step 1: Run full local verification**

Run fresh commands:

```bash
npm test
npm run typecheck
npm run build
test -f _site/playground/game-recommendation/index.html
git diff --check
```

Expected: existing game-recommendation tests, pipeline tests, redirect tests, typecheck, and production build all exit 0.

- [ ] **Step 2: Verify exact target availability**

Run:

```bash
curl --fail --silent --show-error --location --max-time 20 \
  --output /dev/null \
  --write-out 'status=%{http_code} final=%{url_effective}\n' \
  https://mohaji-ci1.pages.dev/
```

Expected: `status=200 final=https://mohaji-ci1.pages.dev/`.

- [ ] **Step 3: Verify branch hygiene and pinned assets**

Run:

```bash
test "$(git diff --diff-filter=D --name-only origin/main...HEAD | wc -l | tr -d ' ')" = "0"
! git diff --summary origin/main...HEAD | rg '^ delete mode '
test "$(find data/raw/steam/all -maxdepth 1 -name '*.json' | wc -l | tr -d ' ')" = "87"
test "$(find data/raw/igdb/backfill -maxdepth 1 -name '*.json' | wc -l | tr -d ' ')" = "608"
git merge-base --is-ancestor \
  18257f9f75b3223386e87a5b8941fce0d9e7342b HEAD
git cat-file -e 18257f9f75b3223386e87a5b8941fce0d9e7342b^{commit}
```

Expected: no deleted files relative to the target branch, exact corpus counts, and reachable pinned commit.

- [ ] **Step 4: Show the aggregate changed-file list before push**

Run:

```bash
git diff --name-status origin/main...HEAD
git diff --stat origin/main...HEAD
git diff --diff-filter=D --name-only origin/main...HEAD
git status --short --branch
```

Group the output into redirect/runtime changes, tests/docs, restored assets, and pre-existing user-owned untracked files. Explicitly report that the deleted-file command produced no output. Do not push.

- [ ] **Step 5: Record the only post-deploy verification still pending**

After a separately approved push and successful GitHub Pages deployment, directly open both:

```text
https://devbyhwang.github.io/playground/game-recommendation/
https://devbyhwang.github.io/playground/game-recommendation/index.html
```

Confirm each ends at `https://mohaji-ci1.pages.dev/`. This step remains pending at the pre-push handoff and does not authorize push.
