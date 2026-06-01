# Environment Inspector Evidence Table

## Summary

Refine the gathering environment editor's task/hazard right-inspector matching evidence table so the existing five-row table keeps individual value pills while reading as a compact inspector evidence list.

## Goals

- Keep one row each for biome, region, weather, time, and danger in the selected task/hazard inspector.
- Keep the evidence dimension name in a fixed left column.
- Keep the matching/not-matched value pills for that dimension in the right column.
- Remove the heavy inset/boxed table treatment in favor of clean full-width row separators.
- Make rows compact, evenly spaced, and readable at narrow manager widths without horizontal scrolling.
- Preserve the existing compact chip evidence variant used outside the inspector.

## Out of Scope

- Changing the composition table rows.
- Changing matching semantics or evidence state calculation.
- Changing the runtime/composition layer card.
- Changing inspector markup beyond a minimal class/data hook if CSS cannot express the refinement.
