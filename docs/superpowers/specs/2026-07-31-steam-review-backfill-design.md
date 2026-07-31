# Steam Review Backfill Design

## Problem

The recommendation score cannot rank the catalog. Scoring all 269,454 games
produces only 12,750 distinct values, and **197,983 games (73.5%) share one
score, `0.288042`**. The top five modal scores cover 89.6% of the catalog, and
the 1st, 25th, and 50th percentiles are all `0.2880` — half the catalog is
exactly tied. Both sort comparators fall through to
`a.game.id.localeCompare(b.game.id)` (`rank.ts:16`, `exploration.ts:204`), so the
order of the bottom 73.5% is IGDB id alphabetical.

`0.288042` is the score of a game with no evaluative data and unknown player
count: quality 0.75 (the no-rating default), accessibility 0.5, stability 0.5,
competition 0.5, growth 0.5 × 0.5, demand ≈ 0.5 × 0.5, confidence 0.125, minus
the 0.15 unknown-players penalty.

### The score has almost nothing to read

| Signal | Coverage | Score term (weight) |
| --- | ---: | --- |
| `releaseDate` | 100% | unused |
| `genres` / `themes` | 93.5% | unused by scoring (vibes only) |
| `players.max` known | 19.5% | penalty −0.15 |
| `quality.totalRating` | 14.1% | quality (0.20) |
| `totalRatingCount ≥ 50` | 1.26% | quality confidence |
| `demandShare > 0` | 0.037% (99) | demand (0.15) |
| `coverage`, `medianViewersPerChannel` | 0.037% (99) | accessibility, stability, competition (0.40) |
| `growth7d` | **0%** | growth (0.15) |

Five of seven terms, totalling 0.55 of the weight, exist for 99 games. Rebalancing
weights cannot fix this: there is nothing to rebalance toward.

### This is a discovery problem, not just a ranking problem

231,518 games (86%) have no evaluative signal from any wired source. They cannot
be recommended on merit, because a good unknown game and an abandoned asset flip
are indistinguishable without data. That is an irreducible limit of the sources
currently in use — but the *size* of the invisible set is a function of which
sources are wired, not a constant.

**130,271 catalog games (48.3%) carry a `steamAppId`, and 107,627 of those have
no IGDB rating.** Steam review counts would move those games out of the
invisible set:

| | Unrankable games |
| --- | ---: |
| Today (IGDB ratings only) | 231,518 (86%) |
| With Steam reviews | **123,891 (46%)** |

This matters for the product goal — recommending new, fun, situation-appropriate
games to streamers — because "less known" and "no evidence" are different things.
Of the 11,885 games with at least ten ratings, only 80 have Twitch streaming
history: **11,805 are evaluated but unstreamed**, which is exactly the hidden-gem
pool. Widening the evidence base widens that pool; it does not dilute it.

### The data is already reachable

`sources/steam.ts:85-88` scopes Steam enrichment to Steam featured top sellers
plus already-fetched apps, so it reaches ~50 games. SteamSpy's bulk endpoint was
tested during design and returns what is needed:

```
GET https://steamspy.com/api.php?request=all&page=0
→ HTTP 200, 354,873 bytes, 1.96s, 1000 apps
  fields: appid, name, developer, publisher, score_rank, positive, negative,
          userscore, owners, average_forever, average_2weeks, median_forever,
          median_2weeks, price, initialprice, discount, ccu
```

Page 60 also returns 1000 apps, its first entry having 21 positive reviews — the
long tail is covered, not just popular titles. Page 100 returned HTTP 500 after
three rapid requests; whether that is the end of pagination or rate limiting is
unresolved and the implementation must distinguish the two.

`metrics/quality.ts:110-111` already writes `steamPositive` and `steamNegative`
into `QualityStats` when a Steam app is present, `schema.ts:106-107` validates
them, and they ship to the client. **No scoring code reads them.** `score.ts:81-82`
uses only `totalRating` / `totalRatingCount`, both IGDB-derived.

## Solution

Acquire Steam review counts for the catalog, fold them into the quality signal on
a scale comparable to IGDB ratings, and measure the resulting coverage. Ranking
and score weights are deliberately out of scope; they are designed against the
distribution this work produces.

### 1. Paginated SteamSpy backfill

Fetch `request=all&page=N` from page 0 upward, following the checkpoint and
resume pattern `backfill.ts` already uses for IGDB (`data/checkpoints/igdb.json`,
partition keys, `nextOffset`, `pending`/`complete` status).

- Checkpoint at `data/checkpoints/steamspy.json`, keyed by page number.
- Snapshots at `data/raw/steam/all/NNNN.json`, one file per page, alongside the
  existing `data/raw/steam/latest.json`.
- Expected volume: 60–100 pages at ~350KB, so 21–35MB.

**Termination.** A page that returns HTTP 500 or an empty object is retried with
exponential backoff. Only after the retries exhaust is the page treated as the
end of pagination, and the checkpoint records which of the two it concluded. A
run that ends early because of rate limiting must not mark the backfill complete
— that would silently freeze coverage at whatever was fetched.

**Rate limiting.** SteamSpy throttles the `all` endpoint. Space requests and back
off on 429/500 rather than issuing them as fast as the loop allows; the design
probe hit a 500 after three requests in quick succession.

### 2. Join on appid

SteamSpy returns `appid`; catalog records carry `steamAppId`. Join on that, which
reaches at most the 130,271 games holding one. Games SteamSpy does not track keep
whatever quality data they already had.

### 3. Scale alignment — the central risk

Steam reports positive and negative counts; IGDB reports a 0–100 rating. Their
distributions do not line up:

- Catalog IGDB ratings: p10 **65.5**, p50 **72.2**, p90 **80.3**
- Steam positive ratios concentrate between 80% and 95% (`Counter-Strike`:
  243,818 / 6,427 = 97.4%)

Writing `positive / (positive + negative) × 100` straight into `totalRating`
would rank Steam-only games systematically above IGDB-rated ones. The ordering
would then reflect **which source covers a game**, not how good it is — a subtler
version of the failure that made "no tag data" read as "strongly healing".

**Approach.** Fit a monotone mapping from the Steam ratio to the IGDB rating
scale using games that have both signals, then apply that mapping to Steam-only
games. Percentile matching over the overlap set is sufficient: the game at the
*n*th percentile of Steam ratio takes the rating at the *n*th percentile of the
IGDB distribution. This is a calibration between two populations of real
measurements, not an invention of data for games that have none.

Once mapped, Steam contributes through the machinery already present in
`metrics/quality.ts`: `signal(value, count, prior)` blends toward
`GLOBAL_QUALITY_PRIOR` by review count, and `selectedTotal` chooses the
`totalRating` / `totalRatingCount` pair. Steam becomes a fourth input beside
`user`, `critic`, and `total`, with `count = positive + negative`.

**Fallback if the overlap is too small.** The overlap size is unknown until the
backfill runs. If fewer than 2,000 games carry both an IGDB rating and Steam
reviews, percentile matching would be fitting a curve to noise. In that case, do
not merge: leave `totalRating` IGDB-only, keep `steamPositive` / `steamNegative`
as separate stored fields, and record in the spec's follow-up that the score
must treat them as a distinct term with its own scale. Measuring the overlap is
therefore a required step, and its result selects between the two paths.

### 4. Coverage gate

Mirror the vibe distribution gate added in the previous spec. After emitting the
catalog, count games carrying any usable quality signal and fail the build when
the share falls outside an expected band.

The floor guards against a silent fetch failure leaving coverage at today's
14.1%. The ceiling guards against a join bug attaching Steam data to games that
should not have it. Set the band from the first successful backfill's measured
value rather than guessing it now — the same measure-then-fix approach used for
the vibe weights. Print the coverage number on every run, not only on failure.

### 5. Deliverable

This spec ends with: Steam review data acquired and cached, folded into
`quality` on an aligned scale, coverage measured and gated. The expected outcome
is evidence coverage rising from 14.1% toward roughly 54%, and the tied-score
population shrinking substantially from 73.5% — but the actual numbers are an
output of this work, not a requirement of it.

## Out of Scope

- **Score weight redesign.** Ranking is designed against the distribution this
  spec produces, in the next spec. That includes the dead `demand` term, the
  0.55 of weight resting on 99 games, and `score.ts:105-106` multiplying demand
  and growth by `stabilityRaw` while `stability` is separately a 0.15 term.
- **Restricting the ranked set.** Whether games without evidence are excluded
  from ranking, tiered below it, or surfaced through an explicit "no rating
  information" serendipity slot is a ranking decision, and belongs with the
  score redesign.
- **Publishing weight.** `_site` is 563MB against the 1GB GitHub Pages limit,
  and 418MB of that is catalog chunks that no client code requests — nothing
  imports `data/catalog.ts`, and `main.tsx` loads only `recommendations.json`.
  Moving them out of `src/playground/` would cut the published site to roughly
  145MB. Real and cheap, but independent of this work.
- **Genre as a query dimension.** Adding it multiplies the 180 precomputed
  queries by 24. Feasible only once the ranked population is small; revisit
  after the score redesign.
- **`rising` slot.** It never fires because `growth7d` is null catalog-wide, but
  that is cold start, not a defect: growth is derived from accumulated history
  snapshots and `observedSnapshots` is currently 2. It resolves as history
  deepens.

## Testing

- SteamSpy page parsing — valid page, empty page, malformed JSON, a page whose
  entries lack `positive` / `negative`.
- Checkpoint resume — a run interrupted mid-pagination continues from the
  recorded page; a run that stopped on rate limiting does not report complete.
- Termination — retries exhaust before a page is declared the end; a 500
  followed by a successful retry continues pagination.
- Scale alignment — percentile mapping is monotone; a Steam ratio at the median
  of the overlap maps to the median IGDB rating; the fallback path triggers below
  the 2,000-game overlap threshold.
- Join — a SteamSpy appid with no matching catalog game is ignored; a catalog
  game with no `steamAppId` is untouched; `steamPositive` / `steamNegative` reach
  `QualityStats`.
- Coverage gate — a catalog below the floor fails, one above the ceiling fails,
  one inside passes; the count prints on success.
- No network in tests. Fixtures stand in for SteamSpy responses, following the
  pattern in `sources/steam.ts` tests.

## Migration

Every game gaining Steam-derived quality changes its `totalRating`,
`totalRatingCount`, and therefore its score, the recommendation index, and all
exploration artifacts. A full pipeline re-run regenerates them, as with the vibe
redesign.

The first backfill fetches every page from 0 and takes as long as SteamSpy's
rate limiting requires. Subsequent runs resume from the checkpoint. Because
review counts drift slowly, refreshing the full set on every pipeline run is
unnecessary; decide a refresh cadence when the first run's duration is known.
