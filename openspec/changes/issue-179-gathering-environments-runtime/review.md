# Delta Spec Review: Issue #179

## Result

Reviewed the delta spec against issue `#179`, the canonical OpenSpec references, and the final follow-up review feedback. Earlier drafts had blocking defects; this correction pass resolves the remaining conflicts in runtime misconfiguration handling, blind-environment UI deltas, and persistence scope.

## Checks

- The delta does not redefine harvesting as a new subsystem.
- The delta keeps `fabricate.gatheringEnvironments` as the world persistence boundary and avoids embedding environments in `CraftingSystem`.
- The delta explicitly covers the gaps named in the issue: settings, `features.gathering` normalization, runtime bootstrap, GM `Environments` tab, player gathering app, validation, and run persistence.
- Scene/token gating is now listable-but-not-attemptable, with attemptability metadata and blocked reasons instead of hidden listing behavior.
- The canonical `Actor.flags.fabricate.gatheringRuns` path and required persisted `GatheringRun` fields are now explicit, including the guard against double-prefixed helper writes.
- `lastGatheringActor` cleanup is now limited to unresolved or non-selectable actors.
- Gathering catalysts are now explicitly scoped to the acting actor only.
- Resume-time misconfiguration for timed runs now matches canonical misconfiguration-abort semantics: the active run is cleared so duplicate blocking does not stick, but no terminal history, results, or catalyst usage are written.
- Environment duplication now requires deep clones with fresh environment/task IDs and isolated cleanup semantics.
- The design now adds a dedicated gathering gate/check evaluator seam for `dnd5e`, `pf2e`, and `macro` providers instead of burying that logic in `GatheringEngine`.
- Blind-environment secrecy now applies across all player-facing labels and feedback surfaces, and the canonical `openspec/specs/ui-integration/spec.md` active/history task-name contract has been updated to include the blind-mode exception directly.
- GM admin planning now covers dirty-state confirmation, tab fallback when `Environments` disappears, responsive narrow-window behavior, and accessibility-oriented validation feedback.
- Persistence scope is now minimized to the canonical `GatheringRun` shape; blind generic labels are derived at render time instead of requiring extra stored snapshot fields.
- The runtime requirements preserve the canonical distinction between misconfiguration aborts and terminal player failures.
- The UI requirements preserve the canonical rule that the player gathering app is dedicated and not a reused crafting route.
- The design splits persistence, runtime execution, actor-run storage, and Foundry/Svelte edges into testable seams.
- The verification plan now requires dedicated runtime, component, accessibility, and integration coverage, plus `npm test` and `npm run build`, with `npm run test:foundry` reserved for runtime-sensitive scene/token, hook, and narrow-window validation.

## Follow-up Attention For Implementer

- Decide whether to split implementation into backend/runtime, GM admin UI, and player app PRs before coding; the plan now includes explicit stop points between those slices.
- Keep environment validation and gate/check evaluation in dedicated seams so the GM editor, player app, and runtime do not drift.
- Verify the actor-flag write path early, because any helper that expands to `fabricate.fabricate.gatheringRuns` will corrupt persistence.
- Treat blind-environment secrecy as a cross-surface audit item, not a single widget change.
- Keep resume-time misconfiguration handling aligned with canonical misconfiguration aborts: clear the active run, emit feedback, and stop there.
