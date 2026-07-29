# Game Recommendation Exploration Design

## Goal

Let streamers explore every game matching a recommendation query, ordered by
recommendation quality without recreating the browser's full-catalog load.

## Product Behavior

Each query starts on the `전체 추천` view. It shows 24 cards at a time and a
`더 보기` control that loads the next page until no results remain. The result
count is displayed so the user can see the scope of the exploration.

The first 96 entries are diversity-reranked: recommendation score remains the
primary signal, but games similar to already shown games receive a novelty
penalty based on franchise, genre, tags, and release-era bucket. Entries after
that introduction are in the original strict recommendation-score order.

The view selector filters the same query result set into `전체 추천`, `신작`,
`지금 뜨는`, `숨은 게임`, and `클래식`. A view change resets pagination and
does not re-run recommendation scoring in the browser.

## Static Data Architecture

The pipeline remains the only process that evaluates the full catalog. For
each supported query, it writes one compact binary rank vector of catalog
ordinal IDs plus fixed-size membership bitsets for the four filtered views.
`전체 추천` consumes the vector directly; the other views scan the same vector
through their bitset. This preserves exact full-query ordering while avoiding
one static file for every 24-card browser page.

Game-card data is emitted separately into many small deterministic ordinal
shards. A card payload contains only fields used by the exploration card.
When a result page loads, the browser fetches the compact query vector plus
only the card shards needed for its 24 IDs, then caches them. It never loads
catalog chunks or the full game-card set.

## Correctness

Every ranking manifest carries the full-catalog `generatedAt` and `gameCount`.
The pipeline and Pages artifact checks require these to match `catalog.json`.
The query vector and each membership bitset carry exact expected byte lengths;
every ordinal resolves to exactly one card shard. Pages validation checks the
expected query keys, binary shape, metadata match, ordinal uniqueness, view
membership, and ID/card-shard membership.

## Performance

The existing CDF percentile optimization and linear-scan diversity selection
are retained. Query/card artifacts are created during the daily pipeline, not
in the browser. The app loads one compact query vector plus 24 results
initially; later result pages are assembled from the cached vector on demand.
DOM rendering stays bounded to the loaded page window; the implementation uses
explicit pagination rather than rendering an unbounded list. The target is a
small number of static files and a comfortably sub-1 GiB Pages artifact.

## Testing

- Pipeline tests verify complete binary rankings, exact first-page diversity
  behavior, bitset view membership, deterministic shard emission, and
  referential integrity.
- Browser tests verify the initial 24-card request, `더 보기`, view reset, and
  absence of catalog chunk requests.
- Workflow tests require ranking/card artifacts and cross-artifact validation
  in refresh, backfill, and deployment.
- Production build and a built-artifact integrity check cover the full flow.
