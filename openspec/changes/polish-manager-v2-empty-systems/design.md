# Design

Manager V2 already routes no-system state to the systems browser and hides selected-system navigation. This change keeps that behavior and separates the inspector empty state by data availability.

## UI Behavior

- When `viewState.systems.length === 0`, the central systems library shows the existing no-systems empty state and Create system button.
- The inspector renders a setup card instead of the generic unselected-system empty state.
- The setup card uses localized copy, a compact icon header, a three-step ordered list, and lightweight documentation links.
- When one or more systems exist but none is selected, the existing "Select a system" inspector remains available as a fallback state.

## Styling

- Empty-state headings use a lighter weight and smaller scale than row or panel titles.
- Empty-state icons are larger, with the no-systems layer-group icon slightly larger than generic empty-state icons.
- The setup card follows Manager V2 flat styling: tokenized colors, restrained border, no gradients, no decorative art.

## Accessibility

- The setup panel has an accessible section label.
- Documentation links are keyboard-reachable anchors styled as Manager V2 buttons.
- Existing Create system button remains the primary action.
