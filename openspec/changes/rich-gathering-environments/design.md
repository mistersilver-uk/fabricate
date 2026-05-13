# Design: Rich Gathering Remaining Work

## Runtime Boundaries

- Keep Foundry globals, hooks, settings, rolls, tables, macros, world time, and chat creation behind injected adapters.
- Keep Svelte stores as view-state composition and action facades; runtime resolution belongs in `src/systems/` collaborators.
- Preserve legacy routed/progressive gathering behavior while completing gathering-native d100 evidence and hazards.

## Remaining Runtime Flow

- Listing and start responses should include safe evidence for condition source, reusable task ids, d100 rows, hazards, stamina/node/attempt state, and blockers.
- Hazard hooks must isolate provider failures as GM diagnostics without producing player-visible reward or hazard side effects.
- Chat messages must be created only after state transitions are accepted and persisted enough to avoid announcing failed commits.
- Blind redaction must centralize hiding of task names, row identities, hazard internals, provider diagnostics, macro UUIDs, and expressions.

## Remaining UI Evidence

- Manager V2 screenshots should prove task/hazard/settings authoring, global condition inheritance, validation, and manual controls.
- Player Gathering screenshots should prove first visible state, paused blocker, blind redaction, active/history evidence, and narrow layout.
