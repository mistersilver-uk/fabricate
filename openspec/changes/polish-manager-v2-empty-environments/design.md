# Design

Manager V2 already gates the Environments route to selected systems with `features.gathering === true`. This change keeps that route and store ownership intact, but makes the no-environment presentation match the existing no-systems polish.

## UI Behavior

- Loading, error, and filtered-empty states keep their current conditions and actions.
- When `environmentList.length === 0`, the central browser shows a lightweight empty state with the existing Create environment action.
- The empty copy explains that environments define gathering locations, scene linkage, tasks, and results.
- The inspector renders a setup card instead of the generic "Select an environment" prompt when there are no environments.
- When environments exist but none is selected, the existing "Select an environment" inspector remains the fallback.

## Styling

- Reuse `manager-v2-empty`, `manager-v2-setup-card`, `manager-v2-setup-list`, and `manager-v2-setup-links`.
- Add no broad layout or theme changes.

## Accessibility

- The setup card has a localized accessible section label.
- Documentation links are normal keyboard-reachable anchors.
- The Create environment button remains a standard button wired to the existing `createEnvironment` callback.
