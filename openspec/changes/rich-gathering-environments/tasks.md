# Tasks

## Runtime

- [ ] Extend rich attempt evidence with condition source, reusable task ids, d100 roll/drop-row, hazard outcome, node/stamina/attempt state, and chat ids where applicable.
- [ ] Add hazard resolution hooks/API surfaces with integration error isolation.
- [ ] Add chat message creation after accepted/persisted gathering lifecycle transitions.
- [ ] Add or verify GM APIs for task library, hazard library, global condition update, manual restock/recharge, stamina adjustment, and blind reveal/reset.
- [ ] Preserve blind redaction across listings, start responses, active runs, history, chat, hazards, d100 drop rows, blockers, and provider diagnostics.

## UI And Validation

- [ ] Extend Player Gathering app display for reusable task evidence, conditions, d100 rows where safe, hazard/risk evidence, paused blockers, active runs, history, and chat/log links.
- [ ] Add unit coverage for definition-vs-placement ids, placement overrides, stale/deleted definitions, active run references, hazard selection, provider failure isolation, and redaction-safe history/chat evidence.
- [ ] Add live pointer validation where feasible for Manager V2 nav, task attach rows, menus, disabled controls, and manual GM controls.
- [ ] Capture Manager V2 and Player Gathering desktop/narrow screenshots for authoring, settings, paused, and blind states.
- [ ] Run `npm test`, `npm run build`, and the applicable Foundry smoke validation before implementation review.

## Review

- [ ] Run implementation review with reviewer, UX, and quality coverage.
- [ ] Run the docs/domain loop if public APIs, hooks, settings, JSDoc exports, or user workflows change.
