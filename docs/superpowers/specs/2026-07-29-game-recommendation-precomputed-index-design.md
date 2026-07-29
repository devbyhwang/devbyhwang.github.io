# Game Recommendation Precomputed Index Design

## Goal

Make `/playground/game-recommendation/` render promptly on GitHub Pages while
preserving recommendations evaluated against the complete IGDB-backed catalog.

## Context

The catalog manifest currently names 557 chunk files containing 278,332 games
(about 347 MiB). The browser loader requests, validates, and merges every chunk
before React renders. This exhausts browser request or memory limits and can
leave the page apparently blank.

The full catalog, backfill process, and daily refresh workflow are already
working and remain the source of truth.

## Decision

Generate a compact, static recommendation index during the existing pipeline.
For every supported `Query` combination, run the existing recommendation
algorithm against every catalog game and store the resulting picks and summary
metadata. The browser loads this one file instead of the manifest and chunks.

This preserves full-catalog consideration: the pipeline computes each indexed
result from all 278k games. It does not require the browser to transfer or hold
the full dataset.

## Data Flow

1. The pipeline creates and validates the complete catalog as it does today.
2. After the catalog is available, a new emitter enumerates every valid query
   combination and calls the existing domain recommendation function with the
   full `catalog.games` collection.
3. It writes `recommendations.json` beside `catalog.json`, atomically, with the
   catalog generation timestamp and one record per query.
4. The refresh and backfill workflows stage the new output. The deployment
   workflow verifies that it exists and is valid in the Pages artifact.
5. The app fetches `recommendations.json` once, validates its shape, and renders
   the matching precomputed result. Changing a control only selects a different
   in-memory record; it makes no catalog chunk request.

## Generation Performance

The index generator must preserve the current recommendation results while
being practical for the complete catalog. In particular, it must not calculate
each game's percentile by scanning every candidate repeatedly.

For every filter population used by a recommendation attempt, the generator
builds sorted numeric distributions for demand, accessibility, and growth once.
Each game's percentile is then calculated with lower- and upper-bound binary
searches, preserving the current formula: `(strictlyLower + equal / 2) / N`.
The resulting score terms, score ordering, tie-breaking, and selected cards
must match the existing algorithm for the same input catalog.

This replaces repeated quadratic population scans with one sort per metric and
logarithmic lookups per game. It does not parallelize full-catalog calculations
or copy the catalog to workers, avoiding additional large-memory pressure.

## Index Contract

The file contains:

- `generatedAt`: the source catalog timestamp;
- `gameCount`: the full catalog size used for the calculation;
- `recommendations`: a map keyed by a stable serialization of every `Query`;
- each value is the existing recommendation result (`picks`, `candidateCount`,
  `relaxations`, and `blockedBy`) with full game details needed by `ResultCard`
  and `DebugPanel`.

The query-key function is shared by pipeline and browser code so all valid UI
queries address exactly one result. The validator rejects missing, duplicate,
or malformed records and rejects a generated-at mismatch where both artifacts
are compared by the pipeline.

## UI and Failure Behavior

The app initially shows a lightweight loading state, then renders after the
single index request succeeds. The current catalog-error message and retry
button remain the failure experience. No progressive background load of the
full catalog occurs.

`App` receives the precomputed index (or an injectable equivalent in tests) and
selects results by the current query. Existing rendering of notices, empty
states, ranks, result cards, debug tables, and footer metadata stays unchanged.

## Compatibility and Scope

The full manifest-plus-chunks catalog format remains supported by pipeline
validation and deployment verification. The old browser catalog loader may be
removed or narrowed only after callers are migrated; legacy output compatibility
is retained where currently required by pipeline code.

No new backend, server API, database, or client-side full-catalog cache is
introduced. The existing daily workflow remains the sole producer of public
data.

## Tests and Verification

- Pipeline tests prove the index covers every query combination, uses the full
  catalog, and writes atomically.
- Schema tests reject malformed index data and missing query entries.
- Browser data-loader tests prove one index request is made and catalog chunks
  are not requested.
- UI tests prove a changed query uses its precomputed result and preserves the
  existing empty, relaxed, debug, and rank states.
- Workflow/deploy tests require the new file to be staged and present in the
  Pages artifact.
- Run the relevant Vitest suites, TypeScript checks, and production build.
