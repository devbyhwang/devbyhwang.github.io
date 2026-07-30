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
