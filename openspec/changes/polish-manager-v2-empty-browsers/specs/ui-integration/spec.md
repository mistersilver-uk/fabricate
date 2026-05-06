## MODIFIED Requirements

### Manager V2 Shell

Manager V2 right inspectors MUST show setup guidance instead of row-selection prompts when the current browser has no selectable rows.

#### Scenarios

- **Given** the Recipes browser is active for a selected system with zero recipes, **then** the right inspector shows recipe setup guidance and does not ask the GM to select a recipe.
- **Given** the Components browser is active for a selected system with zero components, **then** the right inspector shows component setup guidance and does not ask the GM to select a component.
- **Given** the Essences browser is active for a selected system with zero essence definitions, **then** the right inspector shows essence setup guidance and does not ask the GM to select an essence.
- **Given** a browser has rows but the current filters hide all visible rows, **then** the right inspector keeps normal selected-row or select-row behavior.
