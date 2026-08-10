# Chzzk-weighted game buzz design

## Goal

Make the game-recommendation service reflect Korean live-streaming interest without
adding separate Chzzk UI.  Use a balanced, platform-normalized demand signal: 60%
Chzzk and 40% Twitch.

## Scope and decisions

- Use the official Chzzk Open API only, from the daily GitHub Actions pipeline.
- Store `CHZZK_CLIENT_ID` and `CHZZK_CLIENT_SECRET` exclusively as GitHub Actions
  secrets.  The static client never receives either credential.
- Fetch paginated live streams, keep `categoryType === "GAME"`, and aggregate
  `concurrentUserCount` and channel count by category.
- Do not show platform-specific Chzzk/Twitch counts in the app.  Existing
  Twitch-specific wording and score-term names become platform-neutral.
- Weighting is a checked-in configuration constant, initially `chzzk: 0.60` and
  `twitch: 0.40`, so future calibration is a one-line reviewed change.

## Data flow

1. `sources/chzzk.ts` sends the required official client credentials as request
   headers, fetches a bounded paginated live listing, applies retry/backoff for `429`, and
   emits a raw snapshot with completeness/coverage metadata and warnings.
2. A Chzzk category resolver maps the Korean category value to an IGDB id.  It first
   uses a reviewed `data/knowledge/chzzk-game-aliases.json` table (including category
   id where stable), then exact normalized matches against IGDB names.  Ambiguous or
   missing mappings are excluded and written as warnings; they never create a new
   game identity.
3. The join stage attaches Chzzk and Twitch aggregates independently to each IGDB
   game.  The raw snapshot is persisted under `data/raw/chzzk/latest.json` like the
   other sources.
4. For each successful platform, calculate its game share as its observed viewers
   divided by total observed game viewers.  The combined buzz share is the weighted
   mean over the platforms available for that run.  With both sources present, the
   exact calculation is `0.60 * chzzkShare + 0.40 * twitchShare`; if one source is
   unavailable, the remaining source is renormalized to 100%.  A source is not
   treated as available when it has no usable games or reports zero coverage.
5. Recommendation demand, "rising", and discovery thresholds consume the neutral
   combined buzz signal rather than a raw Twitch viewer count.  Platform-specific
   channel quality metrics remain Twitch-derived until an equivalent Chzzk metric is
   intentionally added.

## Compatibility and failure handling

- The catalog schema gains neutral buzz fields and source-status/coverage metadata;
  consumers migrate together.  It does not present a synthetic combined viewer
  count, because weighted shares are not viewer counts.
- A Chzzk request failure, rate limit exhaustion, missing credentials, or unresolved
  category mapping must not fail the catalog refresh when Twitch data is usable.
  The pipeline records the warning and uses Twitch at 100% for that run.
- Existing historical Twitch growth stays intact for this change.  Combined
  cross-platform growth is deliberately deferred until enough daily Chzzk history
  has accumulated; new source coverage must not manufacture a growth signal.

## Workflow

`catalog-refresh.yml` supplies Chzzk secrets and bounded page/throttle settings.
Its commit stage includes the Chzzk raw cache.  The backfill workflow remains IGDB
only and needs no Chzzk credential.

## Testing

- Unit-test pagination, game-only filtering, aggregation, 429 retry, and malformed
  API responses for the Chzzk adapter.
- Unit-test alias, normalized-name, ambiguous, and unmapped IGDB resolution.
- Unit-test the 60/40 calculation, single-source renormalization, zero-coverage
  handling, and deterministic score ordering.
- Update pipeline/workflow schema tests for the new raw source, secret-only
  configuration, failure fallback, catalog validation, and neutral recommendation
  terminology.
- Run pipeline and app type checks, focused tests, then the full test suite before
  merging.
