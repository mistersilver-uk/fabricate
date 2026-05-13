# Rich Gathering Environments Remaining Work

## Summary

The first rich gathering implementation slices have landed: reusable gathering tasks, hazards, per-system conditions and vocabularies, d100 drop rows, gathering rules, Manager V2 task/settings surfaces, player app shell evidence, and paused-game blockers are represented in current code and canonical specs.

This change now tracks only the remaining end-to-end work needed before rich gathering can be considered fully shippable.

## Remaining Goals

- Complete rich attempt evidence for condition source, reusable task ids, d100 roll/drop-row details, hazard outcome, node/stamina/attempt data, and chat ids where applicable.
- Add integration-safe hazard resolution hooks/API surfaces with isolated macro/table/provider failures.
- Create chat messages after accepted/persisted gathering lifecycle transitions.
- Fill any missing GM APIs for task libraries, hazard libraries, global condition updates, manual restock/recharge, stamina adjustment, and blind reveal/reset.
- Complete player gathering display and redaction for reusable task evidence, d100 rows, hazards, conditions, blockers, active runs, history, and logs.
- Finish screenshot and live pointer validation for Manager V2 and Player Gathering responsive states.

## Out of Scope

- Replanning already-landed Manager V2 task browser/editor/settings slices.
- Replacing existing routed/progressive gathering compatibility.
- Adding dependencies or changing Foundry compatibility metadata.
