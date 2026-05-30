# Gathering Environment Composition Editor

## Summary

The gathering environment editor (`src/ui/svelte/apps/manager/EnvironmentEditView.svelte`) is a placeholder: the previous inline editor was removed during the V2 redesign, and the screen now only shows an "under redesign" card. The manager root (`src/ui/svelte/apps/manager/CraftingSystemManagerRoot.svelte`) still routes `environment-edit` to this component and wires its draft lifecycle, so navigation works but no environment authoring is exposed.

This change rebuilds the editor as a **composition / wrapper editor** for a single environment (e.g. "Mines"). It does not author reusable tasks or hazards — those keep their standalone library editors (`gathering-task-edit` / `gathering-hazard-edit`). Instead it makes the gathering domain's four-layer model legible to GMs:

- **Library** — a reusable task/hazard is globally `enabled` / `disabled`.
- **Matching** — a record matches an environment by region / biome / weather / time / danger.
- **Composition** — the environment locally **includes** / **excludes** a matching record.
- **Runtime** — the computed result is **Available** / **Unavailable**.

The runtime composition + matching engine already exists (`composeEnvironment`, `_recordMatchesEnvironment`, `_environmentAllowsLibraryRecord` in `src/systems/GatheringRichStateService.js`) along with the environment's `enabled*Ids` / `disabled*Ids` ID lists and the adminStore draft lifecycle. This change adds a small schema extension and a complete Manager V2 editor surface on top of it.

## Goals

- Replace the `EnvironmentEditView` placeholder with an editor shell: header (breadcrumbs, title, description, status pills, Back/Delete/Save), a tabbed workspace (Overview / Tasks / Hazards / Validation), and an editor-owned right inspector rail.
- Overview tab: edit identity, environment context (region/biomes/danger/conditions summary), player-facing behaviour (targeted/blind), composition mode, scene link, and a computed runtime summary.
- Tasks and Hazards tabs: render automatic composition with Included / Excluded / Non-matching sections, render manual hazard composition with Included / Matching candidates / Excluded / Non-matching sections, and render manual task composition with only Included plus a single Available to add group ordered as matching addable/restorable tasks before non-matching and library-disabled tasks.
- Right inspector: contextual states for no-selection (environment summary), selected task, and selected hazard, each showing the four-layer evaluation and matching evidence.
- Validation tab: environment readiness checks, a player-facing runtime preview, and categorised issues.
- Add a minimal schema extension that disambiguates composition: an explicit per-environment `compositionMode` (`automatic` | `manual`), deterministic `taskOrder` / `hazardOrder`, and persisted `forcedTaskIds` / `forcedHazardIds` for manual force-inclusion.
- Enforce the behaviour rules: non-matching records stay separated from matching candidates except in the manual task layout's Available to add group; in manual mode a GM can force-add a non-matching enabled record, which is surfaced as force-included rather than silently treated as a normal match.

## Out of Scope (deferred to Phase 2)

- Per-record environment-local wrapper overrides: `localLabel`, `localDescription`, `localImage`, `dropChanceAdjustment`, `yieldAdjustment`, `attemptsPerNode`, `restockPolicy`, `staminaCost`, `timeCost`, `visibilityOverride`, `sceneAccessOverride`, and per-record `exclusionReason`.
- Task-scoped hazards (`scope: 'environment' | 'task'`, `taskId`) and hazard `severityOverride` / `outcomePolicyOverride` / `hazardChanceAdjustment`.
- Runtime resolution honoring any of the above overrides, and migration from ID lists to wrapper objects.
- Splitting `compositionMode` into separate task vs hazard modes.

Phase 1 renders the inspector "Environment overrides" section with disabled fields and a clear environment-local affordance so Phase 2 can wire it without restructuring.

## Out of Scope (permanent)

- Editing reusable task/hazard source records (owned by the standalone library editors).
- Changes to d100 resolution, hooks, or Foundry compatibility metadata.
