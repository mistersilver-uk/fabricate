## ADDED Requirements

### Requirement: Manager V2 Gathering Settings Rules
Manager V2 SHALL provide Gathering Settings controls for the selected crafting system's d100 rules.

#### Scenario: Settings tab shows rule evidence
- **WHEN** a GM opens Manager V2 Gathering and selects Settings
- **THEN** the main panel shows the selected system's reward, hazard, and hazard outcome rule summary
- **AND** it does not render placeholder-only content

#### Scenario: Inspector edits rules
- **WHEN** the Settings tab is active
- **THEN** the right inspector shows a Rules card
- **AND** Rewards, Hazards, and Hazard Outcome controls are localized
- **AND** limit steppers appear only for `limitedDrops`
- **AND** changes call the admin-store gathering rules update action

#### Scenario: Duplicate environment-editor rule controls are absent
- **WHEN** the Manager V2 environment editor renders
- **THEN** per-environment hazard selection, per-environment hazard outcome, and per-task item selection controls are not shown as d100 rule controls
