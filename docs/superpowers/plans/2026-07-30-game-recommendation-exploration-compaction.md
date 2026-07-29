# Game Exploration Artifact Compaction Plan

**Goal:** Preserve unlimited, score-ordered exploration on GitHub Pages without
the 1.7 GiB / 409,830-file artifact produced by static 24-result JSON pages.

**Architecture:** Assign every catalog game a deterministic ordinal. For each
of the 180 query keys, publish one `Uint32` ordinal rank vector and four
membership bitsets (`new`, `rising`, `discovery`, `classic`). Publish compact
per-ordinal card shards. The browser loads the query vector once, selects 24
ordinals per UI page (filtering through a bitset for a tab), and lazily fetches
only the small card shards needed to render those cards.

## Task 1: Define compact exploration contracts

Create binary-format constants, manifest fields, ordinal/card-shard helpers,
and focused tests for endian-safe rank vectors, bitsets, and invalid shapes.

## Task 2: Emit and validate compact static artifacts

Replace page-file emission with per-query manifest/vector/bitsets and small
ordinal card shards. Preserve ranking and view semantics. Validate every
ordinal, bitset membership, catalog metadata, shard coverage, and expected
byte lengths. Generate no browser-sized catalog chunks.

## Task 3: Load compact exploration data in the browser

Replace page JSON loading with cached vector/bitset loading and local
24-result selection. Fetch only necessary card shards. Keep five tabs,
incremental `더 보기`, empty/retry states, and the prohibition on catalog
chunk requests.

## Task 4: Publish and validate compact Pages assets

Update refresh/backfill staging and deploy artifact verification for compact
files. Generate the initial artifact from the existing catalog without network
refresh. Measure file count and bytes; reject any artifact at or over 1 GiB.

## Task 5: End-to-end verification and review

Run full tests, typechecks, production build, built-artifact validation, and
diff checks. Independently review the complete branch before integration.
