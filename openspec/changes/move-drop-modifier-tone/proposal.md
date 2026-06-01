## Summary

Move gathering environment task drop override modifier tone from the signed percentage input to the full drop override row card.

## Problem

The current task drop override inspector colors the percentage input for positive and negative adjustments. This makes the small input carry the whole state signal and leaves the row card visually neutral, unlike the task-editor modifier rows that use the whole row as the state surface.

## Scope

- Apply positive, negative, and zero tone classes at the task drop override row card level.
- Keep the percentage input neutral for all values while preserving focus, disabled, and percent-suffix behavior.
- Tighten the control row so Base, input, Effective, and clear are grouped together.
- Keep hazard override controls unchanged.

## Non-Goals

- No schema, persistence, runtime drop-rate calculation, toggle behavior, or localization changes.
- No changes to hazard override styling or behavior.
