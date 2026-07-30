# Task 4 report: neutral ranking and no platform-count UI

## Delivered

- Added `Game.buzz.demandShare` as the app-facing normalized combined-demand signal. It is the sole input to demand percentile distributions and demand scoring.
- Replaced raw Twitch viewer gates with named candidate-context demand percentile thresholds for ranking exceptions, rising, discovery, and exploration views.
- Kept Twitch streaming metrics for accessibility, concentration, stability, and growth calculations only.
- Replaced generated count/platform-specific reasons with neutral Korean copy.
- Removed viewer-count rendering from `ResultCard` and `ExplorationPanel`, and removed `twitchViewers` from compact exploration card artifacts and validation.
- Retained legacy reason kinds for persisted/debug artifact compatibility; no new recommendation emits `topOnTwitch`.

## Tests added or updated

- `score.test.ts`: a game with higher combined `demandShare` outranks one with a higher raw Twitch count.
- `ResultCard.test.tsx` and `ExplorationPanel.test.tsx`: assert no `N명 시청 중` platform-count UI is rendered.
- Updated slot, rank, and app test fixtures to specify demand shares where their intended ordering/slot behavior depends on demand.

## Verification

- `npm run test:game-recommendation` — 20 files, 245 tests passed.
- `npm run test:pipeline` — 16 files, 167 tests passed.
- `npm run typecheck` — both app and pipeline TypeScript checks passed.
- `git diff --check` — passed.

## Compatibility note

`demandShare` is optional in the app type so legacy local fixtures/artifacts remain readable; missing values are treated as zero, never derived from raw Twitch viewers. The pipeline's emitted `GameRecord` supplies the field.

## Fix round 1: persisted recommendation reasons

The pre-existing `src/playground/game-recommendation/recommendations.json` contains valid legacy `accessibility` reasons such as `채널당 시청자 14명`. `ResultCard` previously rendered these strings verbatim even after its metadata count was removed.

- Added display-time compatibility mapping for legacy `채널당 시청자 N명` and `현재 N명 시청 중` reason text. Parsed artifacts remain valid; the rendered copy is neutral.
- Added a focused `ResultCard` regression test using the exact persisted `채널당 시청자 14명` text and asserting the neutral `방송 참여가 활발함` replacement.
- Verification: `npm run test:game-recommendation -- --run src/ui/ResultCard.test.tsx` (16 passed), and `npm run typecheck` passed.
