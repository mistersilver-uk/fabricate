# Tasks

## OpenSpec And Review

- [x] Create proposal, design, tasks, and spec deltas before implementation.
- [x] Resolve routing: domain, UX, quality, reviewer, docs.
- [x] Plan-review locally against the routed concerns because subagent spawning
  was not explicitly requested in this session.

## Implementation

- [x] Update `CraftingSystemManager` source import resolution to verify
  canonical source UUIDs.
- [x] Fall back to the live dropped Item UUID when the canonical source no longer
  resolves.
- [x] Preserve the broken canonical UUID in `fallbackItemIds`.
- [x] Return fallback metadata from single, replace, folder, and pack import
  flows.
- [x] Surface localized single-item and bulk summary warnings in the manager UI.

## Tests

- [x] Add manager tests for resolvable canonical source behavior.
- [x] Add manager tests for broken canonical fallback on add, update, replace,
  and pack import.
- [x] Add UI drop callback tests for single warning and bulk summary warning.

## Validation Gates

- [x] Run `npm test`.
- [x] Run `npm run build`.

## Docs Loop

- [x] Promote accepted behavior into canonical specs if implementation matches
  the deltas.
- [x] Update API and crafting-system Jekyll docs for component import behavior.
