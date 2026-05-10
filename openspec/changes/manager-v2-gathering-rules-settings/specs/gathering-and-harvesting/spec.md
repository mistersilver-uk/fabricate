## ADDED Requirements

### Requirement: System Gathering Rules
The module SHALL store d100 gathering rules per crafting system in `gatheringConfig.systems[systemId].rules`.

#### Scenario: Missing rules normalize safely
- **WHEN** a system has no `rules` object
- **THEN** rewards default to `highestRankedDrop`
- **AND** hazards default to `allDrops`
- **AND** hazard outcome defaults to `successWithHazard`
- **AND** limits default to `1`

#### Scenario: System rules select d100 rows
- **WHEN** a d100 gathering attempt resolves successful reward or hazard rows
- **THEN** `highestRankedDrop` selects the first successful row by authored order
- **AND** `allDrops` selects every successful row
- **AND** `limitedDrops` selects the first `N` successful rows by authored order

#### Scenario: Hazard policy controls attempt status
- **WHEN** selected hazards exist and `hazardPolicy` is `failureWithHazard`
- **THEN** the attempt fails and selected rewards are not awarded
- **WHEN** selected hazards exist and `hazardPolicy` is `successWithHazard`
- **THEN** the attempt succeeds and records selected hazards as evidence

#### Scenario: System rules override legacy fields
- **WHEN** legacy task or environment selection fields differ from system rules
- **THEN** runtime d100 resolution uses system rules

#### Scenario: Legacy rules remain compatible when system rules are missing
- **WHEN** an existing system has no `rules` object
- **THEN** runtime d100 resolution may read legacy task item selection and environment hazard selection fields
- **AND** creating or updating rules makes system rules authoritative

#### Scenario: Timed attempts snapshot rules
- **WHEN** a timed d100 attempt starts
- **THEN** the runtime snapshot stores the start-time rules
- **AND** later Gathering Settings changes do not change that run's completion behavior

## MODIFIED Requirements

### Requirement: Rich Gathering Libraries
Reusable d100 reward rows SHALL use `dropRows` as the canonical field name. `itemDrops` MAY be accepted as a legacy read alias during normalization.

### Requirement: Legacy Selection Fields Are Not Authoritative Once Rules Exist
Reusable task `itemSelectionMode`, environment `hazardSelectionMode`, and environment `hazardPolicy` SHALL be legacy compatibility fields for d100 gathering once `gatheringConfig.systems[systemId].rules` exists.
