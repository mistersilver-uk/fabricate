# Strip Blind Behaviour Configuration and Per-Environment Reveal Override

## Summary
Remove the Environment Editor's "Blind behaviour" card (selection strategy picker, Roll table UUID, Macro UUID) and its reveal-after-attempt override. Blind selection is always weighted random over the gated candidate pool, driven solely by the per-task **Weight** column on the Tasks tab. Reveal behaviour is set at the system level only — environments cannot diverge from the system default.

## Motivation
Per-task ordering in the Environment Editor was removed during the recent row redesign. That removal made the *First available* blind strategy meaningless (no GM-curatable order), and the *Roll table* / *Macro* strategies depend on Foundry-specific resolver hooks that aren't part of this project's intended workflow. With *Weighted random* the only strategy worth keeping, the strategy picker is a control with one valid position — UI noise without a knob.

The per-environment reveal override has a similar problem: it lets a single environment drift away from the system default, which is friction more than feature. The system Gathering Rules are the right (and only) home for reveal behaviour.

## Scope
- Remove `blindSelection.strategy`, `blindSelection.macroUuid`, `blindSelection.rollTableUuid` from the environment data model. Keep `blindSelection.weights`.
- Remove `environment.reveal` (the per-environment reveal override).
- Collapse engine blind selection to a single weighted-random implementation; delete the roll-table/macro resolver hooks.
- Remove the vestigial per-task `task.blindSelection` field (was never user-facing).
- Delete the "Blind behaviour" card from the Environment Editor Overview tab. Keep the Targeted / Blind toggle and the per-task Weight column on the Tasks tab.
- Silently migrate stored data: legacy `strategy` / `macroUuid` / `rollTableUuid` / `environment.reveal` fields are dropped on the next normalize pass; existing weights are preserved.
- System-level reveal config (`revealPolicy` / `revealScope` on Gathering Rules) and per-task `task.reveal` are unchanged.
