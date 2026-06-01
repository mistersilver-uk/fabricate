# Environment Blind Task Weight Layout

## Summary
Refine the Environment Editor task composition rows for blind environments so per-task weights are readable, show their calculated selection share, and no longer collide with the override column.

## Motivation
Blind task rows currently show the editable weight field only in blind mode, but the row grid leaves too little space once action buttons are present. The weight cell can overlap the override column, and GMs cannot see what each weight means as a percentage of the included task pool.

## Scope
- Keep the existing `blindSelection.weights` persistence and edit flow.
- Show each included blind task's calculated percentage beside its editable weight.
- Move task row actions into the three-dot overflow menu to free horizontal space.
- Preserve hazard row action and reorder behavior.
