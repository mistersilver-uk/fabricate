# Design

## Storage
Rules live in the existing world `gatheringConfig` object under `systems[systemId].rules`:

- `rewardSelectionMode`: `highestRankedDrop | allDrops | limitedDrops`, default `highestRankedDrop`
- `rewardLimit`: positive integer, default `1`
- `hazardSelectionMode`: `highestRankedDrop | allDrops | limitedDrops`, default `allDrops`
- `hazardLimit`: positive integer, default `1`
- `hazardPolicy`: `successWithHazard | failureWithHazard`, default `successWithHazard`

Unknown modes fall back to defaults. Limits floor to positive integers. Missing system config still normalizes to `{ rules, tasks: [], hazards: [] }`.

## Runtime Semantics
System rules are authoritative for d100 reward and hazard selection. Legacy `task.itemSelectionMode`, `environment.hazardSelectionMode`, and `environment.hazardPolicy` remain readable as backwards-compatible data but do not control Manager V2 d100 resolution once system rules are present through rich gathering composition.

Selection order is authored rank: `dropRows` order for rewards and matched reusable hazard order for hazards.

- `highestRankedDrop`: select the first successful row.
- `allDrops`: select every successful row.
- `limitedDrops`: select the first `N` successful rows.
- `successWithHazard`: selected hazards are recorded and gathering succeeds.
- `failureWithHazard`: selected hazards make the attempt fail; selected reward rows remain check evidence and are not awarded by the engine failure path.

If no reward rows and no hazards are selected, the existing d100 attempt result remains `succeeded` with zero rewards.

## UI
The Gathering Settings tab uses the shared gathering browser header for context and keeps the center panel free of duplicated rule summaries. The right inspector renders a visually distinct Rules card using Manager V2 inspector-card, icon-row, select, and 34px icon-button patterns.

Controls:
- Rewards description with its select underneath and a conditional reward-limit stepper.
- Hazards description with its select underneath and a conditional hazard-limit stepper.
- Hazard Outcome description with its select underneath.

All labels and aria text are localized in `lang/en.json`.

## Tests
Focused tests cover store normalization/persistence, runtime rule precedence/limited selection, root wiring, real Settings tab rendering, conditional steppers, and absence of duplicate v2 environment-editor rule controls.
