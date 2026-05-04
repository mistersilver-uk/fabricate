# UI Integration Spec Delta

## Manager V2 Tags And Categories

### ADDED Requirements

#### Requirement: Manager V2 exposes system-level tags and categories authoring

Manager V2 MUST provide an enabled Tags & Categories page for every selected crafting system because recipe categories and item tags are baseline capabilities.

##### Scenario: GM opens the page

- **GIVEN** a crafting system is selected in Manager V2
- **WHEN** the GM activates Tags & Categories navigation
- **THEN** Manager V2 shows a real page instead of a disabled placeholder
- **AND** the page displays custom recipe categories, the implicit `General` category, and item tags

##### Scenario: GM edits category and tag vocabulary

- **GIVEN** the Tags & Categories page is open
- **WHEN** the GM adds or removes a custom category or item tag
- **THEN** the UI delegates to the admin store category/tag actions
- **AND** the reserved `General` category remains visible and non-removable

##### Scenario: GM reviews usage before removal

- **GIVEN** a custom category or item tag is referenced by recipes, components, or tag-placeholder ingredients
- **WHEN** the GM activates its remove control
- **THEN** Manager V2 shows localized impact warning copy and asks for explicit confirmation
- **AND** cancellation does not call the destructive store action

##### Scenario: GM filters vocabulary lists

- **GIVEN** the Tags & Categories page is open
- **WHEN** the GM searches by category or tag text
- **THEN** custom category and item-tag rows filter locally
- **AND** the implicit `General` category remains visible
- **AND** filtered-empty copy is distinct from true-empty copy

##### Scenario: No selected system is available

- **GIVEN** no crafting system is selected
- **WHEN** Manager V2 would otherwise render the Tags & Categories route
- **THEN** Manager V2 falls back to the systems route
- **AND** category and tag mutation callbacks are unavailable

##### Scenario: Page copy and controls are accessible

- **GIVEN** the Tags & Categories page is open
- **THEN** search and add inputs are labeled
- **AND** add and remove controls are keyboard reachable
- **AND** locked `General` behavior is visible to assistive technology
- **AND** compact Manager V2 widths do not create horizontal overflow
