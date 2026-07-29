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
each supported query, it writes a compact ranking manifest containing ordered
game IDs and precomputed membership flags for the five views. Ranking IDs are
split into fixed-size page files, so the browser requests only the current
view's page.

Game-card data is emitted separately into deterministic hash shards keyed by
game ID. A card payload contains only fields used by the exploration card.
When a ranking page loads, the browser fetches only the required shards, joins
them to ranked IDs, and caches loaded shards and pages in memory. It never
loads catalog chunks or the full game-card set.

## Correctness

Every ranking manifest carries the full-catalog `generatedAt` and `gameCount`.
The pipeline and Pages artifact checks require these to match `catalog.json`.
Each ranking ID must exist in exactly one card shard. Pages validation checks
the expected query keys, page ordering, metadata match, and ID/card-shard
membership.

## Performance

The existing CDF percentile optimization is retained. Ranking page and card
shard creation occur during the daily pipeline, not in the browser. The app
loads a small query manifest plus 24 results initially; later pages are
requested on demand. DOM rendering stays bounded to the loaded page window;
the implementation uses explicit pagination rather than rendering an
unbounded list.

## Testing

- Pipeline tests verify complete rankings, exact first-page diversity behavior,
  view membership, deterministic page and card-shard emission, and referential
  integrity.
- Browser tests verify the initial 24-card request, `더 보기`, view reset, and
  absence of catalog chunk requests.
- Workflow tests require ranking/card artifacts and cross-artifact validation
  in refresh, backfill, and deployment.
- Production build and a built-artifact integrity check cover the full flow.
