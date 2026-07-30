# Vibe Classification Redesign

## Problem

The vibe axis is one of four query dimensions and the primary "situation fit"
signal. It does not work. Measured against the built artifacts for
`medium / 1인 / 참여없음`:

| Vibe | Games passing |
| --- | ---: |
| healing | 278,312 (99.997%) |
| spectacle | 11 |
| horror | 7 |
| chatting | 6 |
| variety | 6 |
| hardcore | 5 |

Five of six vibes return single-digit result sets. The sixth passes the entire
catalog, so choosing "힐링" filters nothing.

### Root cause

Three defects compound:

1. **The vocabulary covers 50 games.** `data/knowledge/tag-vibes.json` holds
   eight Steam tags. Steam tags exist for 50 of 278,319 catalog games (0.018%),
   because `run.ts:224` and `sources/steam.ts:85-88` scope Steam enrichment to
   Steam top sellers plus already-fetched apps. Every other game derives
   `raw = 0` on all six axes.

2. **One weight is negative.** `Psychological Horror` carries `healing: -1`, so
   the catalog-wide minimum for the healing axis is negative. No other axis has
   a negative weight, so their minimums are 0.

3. **Normalization is catalog-wide min-max.** `normalizeVibes`
   (`enrich.ts:46-62`) computes `(raw − min) / (max − min)` per axis across the
   whole catalog. Combined with (1) and (2), a game with no tag data maps to
   `(0 − negative) / (max − negative)` = **0.8719958874180697** on healing and
   `0.0` on the other five.

The result: *"no data"* is translated into *"strongly healing"*.
`VIBE_THRESHOLD_BASE` is 0.5, so no-data games pass healing and fail everything
else. Sampling 2,319 games across five chunks spread through the catalog found
100% carrying that identical healing constant and 0 games above 0.5 on any
other axis.

### Why tests did not catch it

`domain/safety.test.ts` asserts that picks respect the requested vibe, but it
runs `recommend(SAMPLE_CATALOG, …)` against fixtures whose `vibes` values are
hand-written. The fixtures are well-formed, so the gate passes while production
data is degenerate. No check compares the *distribution* of the emitted catalog
against expectations.

## Solution

The data needed to classify the catalog is already fetched and already on disk.
`sources/igdb.ts:20-21` requests `genres.name` and `themes.name` for every game.
Measured across all 278,319 games in `data/raw/igdb/backfill`:

- genres present: 253,434 (91.1%)
- themes present: 175,728 (63.1%)
- at least one present: **260,695 (93.7%)**
- vocabulary size: **23 genres + 22 themes = 45 terms**

`join.ts:146` calls `deriveRawVibes(game.tags, …)` — Steam tags only — and the
emitted `GameRecord` has no `genres` field at all. The genre and theme data is
fetched, cached, and discarded at the join step.

Mapping 45 terms to six axes moves classification coverage from 0.018% to 93.7%.

### 1. Preserve genres and themes

Add `genres: string[]` and `themes: string[]` to `GameRecord` (`model.ts:105`
region), populate them in `join.ts` from the IGDB payload, and validate them in
`schema.ts`. No new fetching.

Both arrays are emitted into catalog chunks. Average occupancy is roughly two
genres and one theme per game drawn from a 45-term vocabulary, so the added
payload is a few MB against the current 348MB — acceptable.

**Side effect, intended:** `exploration.ts:175` `normalizedGenres(game)` already
reads `game.genres` for the diversity re-rank. That field is currently always
empty, so the genre component of exploration diversity is dead code today.
Preserving genres activates it. Exploration ordering will change; the
exploration tests must be updated to expect genre-aware diversification rather
than treating current output as golden.

### 2. Expand the vocabulary

Restructure `data/knowledge/tag-vibes.json` into three sources:

```json
{
  "genres": { "Puzzle": { "healing": 0.5, "chatting": 0.3 }, … },
  "themes": { "Horror": { "horror": 1.0 }, … },
  "tags":   { "Cozy":   { "healing": 1.0, "chatting": 0.2 }, … }
}
```

**Weights are constrained to `[0, 1]`.** Negative weights are rejected by the
knowledge loader (`knowledge.ts`). Under an absolute scale a negative weight has
no coherent meaning, and it was the trigger for the current failure.

The existing eight Steam tags move under `tags` unchanged except that
`Horror: { healing: -0.5 }` and `Psychological Horror: { healing: -1 }` drop
their negative healing terms.

#### Draft mapping — genres

| Genre | Games | healing | variety | horror | hardcore | chatting | spectacle |
| --- | ---: | --- | --- | --- | --- | --- | --- |
| Indie | 108,019 | — | — | — | — | — | — |
| Adventure | 83,556 | | | | | | 0.3 |
| Simulator | 48,123 | 0.4 | | | | | |
| Strategy | 40,590 | | | | 0.4 | | |
| Role-playing (RPG) | 36,872 | | | | | | 0.4 |
| Puzzle | 30,051 | 0.5 | | | | 0.3 | |
| Arcade | 26,450 | | 0.4 | | | | |
| Shooter | 26,161 | | | | 0.6 | | 0.3 |
| Platform | 20,541 | | | | 0.3 | | |
| Sport | 16,484 | | 0.3 | | 0.4 | | |
| Visual Novel | 13,443 | 0.3 | | | | 0.5 | |
| Racing | 11,987 | | | | 0.3 | | 0.4 |
| Point-and-click | 7,471 | 0.3 | | | | 0.4 | |
| Fighting | 6,549 | | | | 0.7 | | 0.4 |
| Card & Board Game | 5,894 | | 0.4 | | | 0.6 | |
| Turn-based strategy (TBS) | 4,847 | | | | 0.4 | 0.3 | |
| Hack and slash/Beat 'em up | 4,805 | | | | 0.4 | | 0.5 |
| Music | 4,428 | | 0.5 | | | | 0.4 |
| Tactical | 3,574 | | | | 0.5 | | |
| Real Time Strategy (RTS) | 2,932 | | | | 0.5 | | |
| Quiz/Trivia | 2,219 | | 0.6 | | | 0.8 | |
| Pinball | 814 | | 0.3 | | | | |
| MOBA | 192 | | | | 0.8 | | 0.4 |

`Indie` is deliberately unweighted: it describes funding, not feel, and it is
the single largest term at 108,019 games.

#### Draft mapping — themes

| Theme | Games | healing | variety | horror | hardcore | chatting | spectacle |
| --- | ---: | --- | --- | --- | --- | --- | --- |
| Action | 108,439 | | | | | | 0.4 |
| Fantasy | 26,623 | | | | | | 0.3 |
| Science fiction | 20,271 | | | | | | 0.3 |
| Horror | 16,171 | | | 1.0 | | | |
| Comedy | 12,014 | | 0.7 | | | 0.5 | |
| Erotic | 8,865 | — | — | — | — | — | — |
| Mystery | 6,993 | | | 0.3 | | | 0.3 |
| Romance | 6,147 | 0.4 | | | | 0.3 | |
| Kids | 6,144 | 0.6 | | | | | |
| Survival | 6,136 | | | 0.3 | 0.5 | | |
| Historical | 5,905 | — | — | — | — | — | — |
| Educational | 5,761 | 0.3 | | | | 0.4 | |
| Open world | 4,994 | | 0.4 | | | | |
| Drama | 4,776 | | | | | | 0.4 |
| Warfare | 4,662 | | | | 0.4 | | 0.3 |
| Party | 4,655 | | 1.0 | | | 0.8 | |
| Sandbox | 4,201 | 0.3 | 0.5 | | | | |
| Non-fiction | 2,824 | — | — | — | — | — | — |
| Business | 2,481 | 0.3 | | | 0.3 | | |
| Stealth | 2,279 | | | | 0.5 | | |
| Thriller | 2,202 | | | 0.5 | | | 0.3 |
| 4X | 707 | | | | 0.6 | | |

These weights are a starting point, not a result. Step 5 defines the gate they
must satisfy, and tuning against measured distributions is part of the work.

### 3. Absolute scale via noisy-OR

Delete `normalizeVibes`. Compute each axis directly:

```
raw[vibe] = 1 − Π over terms of (1 − weight[term][vibe] × share[term])
```

Genres and themes have no share, so `share = 1`. Steam tags keep their existing
`share` (tag count relative to the game's most-applied tag), which attenuates
weak tags.

Properties this buys:

- Output is always in `[0, 1]` with no clamping and no catalog-wide statistics.
- A single strong term (`Horror` 1.0) saturates the axis immediately.
- Several weak terms accumulate without overflow: `Comedy` 0.5 and `Party` 0.5
  give 0.75.
- A game's score depends only on that game. Adding or removing catalog entries
  cannot change an existing game's classification — the failure mode that
  min-max normalization created.

`VIBE_THRESHOLD_BASE` (0.5) and `VIBE_THRESHOLD_RELAXED` (0.35) are reused
unchanged. On this scale 0.5 means "one moderately strong term, or several weak
ones agreeing".

### 4. Absent data fails the vibe filter

Games with no genres, no themes, and no known tags score 0 on every axis and
therefore match no vibe. That is 6.3% of the catalog (17,624 games).

This deliberately departs from the convention at `filter.ts:38`, where unknown
player counts pass so as not to create silent eliminations. Vibe is different:
it is an attribute the user explicitly selected, and admitting unmatched games
is precisely the defect being fixed here. The relaxation ladder already lowers
the threshold to 0.35 when results are thin, which is the correct pressure
valve — a game with zero evidence stays out at either threshold.

Record this reasoning as a comment next to the filter so it is not "fixed" back.

### 5. Distribution gate

Add a validation step to the pipeline that fails the build when the emitted
catalog's vibe distribution is degenerate. For each of the six axes, count games
at or above `VIBE_THRESHOLD_BASE` and require:

- **at least 0.1%** of the catalog (catches a dead axis — today: five axes)
- **at most 60%** of the catalog (catches a runaway axis — today: healing)

The gate runs on the real emitted catalog, not on fixtures. This is the check
whose absence let the current state ship: `safety.test.ts` validated constraint
adherence against hand-written fixture vibes and passed throughout.

Emit the per-axis counts in the pipeline's output so the numbers are visible on
every run, not only on failure.

### 6. Adult content exclusion

`Erotic` covers 8,865 games (3.2%). Exclude games carrying that theme from the
catalog at the join step, before scoring or vibe derivation. This is a filter,
not a vibe weight — hence the empty row in the theme table.

Two independent reasons, either sufficient on its own:

**The product recommends games to stream.** Twitch and Chzzk both prohibit
sexual content in broadcasts. An adult game is therefore not a valid answer to
"what should I stream", regardless of any legal question.

**Age verification is not implementable here.** Korean 청소년보호법 requires
본인확인-backed age verification for 청소년유해매체물. This site is static
GitHub Pages with a client-side React bundle: no backend, no accounts, no
session. Real verification needs a server and a certified identity provider. A
self-declared "19세 이상입니까" button does not satisfy 본인확인. The available
options are therefore *exclude* or *ship unverified* — not *gate*.

**This is a heuristic, not compliance.** The IGDB `Erotic` theme is not a legal
rating and does not correspond to 게임물관리위원회 청소년이용불가. Games rated
19+ may lack the theme, and some themed games may be mild. This change reduces
exposure; it does not establish that the catalog is free of adult content. If
compliance becomes a requirement, it needs a real rating source (GRAC data, or
Steam's own adult flags) and its own spec.

This is scope-adjacent rather than strictly required by the vibe fix. It is
included because the identifying data lands here and the exclusion is a few
lines; it is isolated to one place if it needs to be removed.

## Out of Scope

Three follow-on projects, each needing its own spec:

1. **Score weight redesign.** `demandShare` is 0 for every game in the catalog,
   making `W_DEMAND` (0.15) a constant that ranks nothing. `accessibility`,
   `growth`, `stability`, and `competition` total 0.55 and derive from streaming
   data present for 99 games (0.036%). Separately, `score.ts:105-106` multiplies
   demand and growth by `stabilityRaw`, which is also its own 0.15 term, so
   stability's real influence is not visible in the weight table.

2. **Unified recommendation flow.** Merging the featured picks and the
   exploration list into one ordering with category quotas and badges — the
   request that started this investigation. It depends on vibes producing real
   candidate sets first; with five vibes returning six games, there is nothing
   to mix. Notes on the intended design are in this session's mockups under
   `.superpowers/brainstorm/`.

3. **Enrichment coverage.** Steam and Twitch enrichment reaches ~100 games by
   construction. Widening it is what would make the score weights meaningful.

## Testing

- `enrich.test.ts` — noisy-OR combination: single saturating term, multiple weak
  terms, empty input yielding all zeros, share attenuation for tags.
- `knowledge.test.ts` — the loader rejects negative weights and weights above 1;
  the three-section file shape parses.
- `join.test.ts` — genres and themes survive into `GameRecord`; `Erotic` games
  are dropped.
- `schema.test.ts` — the new fields are validated, and their absence fails.
- New distribution-gate test — a synthetic catalog with one runaway axis fails;
  one with a dead axis fails; a balanced one passes.
- `exploration.test.ts` — update expectations for genre-aware diversity, which
  activates for the first time with this change.
- `safety.test.ts` — unchanged in intent, but its fixtures should carry vibes
  derived through the new path rather than hand-set constants, so the gate
  tracks the real computation.

## Migration

Emitted catalog chunks gain two fields and lose `Erotic` games, and every game's
`vibes` values change. A full pipeline re-run regenerates chunks, the
recommendation index, and all exploration artifacts. There is precedent for
chunk-shape migration in `fix: migrate legacy catalog chunk buzz metadata`
(92a07ac9d); follow that approach if incremental migration is preferred over a
full re-run.

The client reads `vibes` through the same interface and needs no change.
