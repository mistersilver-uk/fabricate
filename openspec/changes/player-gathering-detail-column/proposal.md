# Player Gathering App — Detail (Center) Column

## Summary

The Gathering tab in the unified Fabricate window now renders a 3-column layout with a working
left "Environments" column (`player-gathering-environments-column`). The **center column** is still
an inert placeholder (`GatheringView.svelte:82` — `<section ... aria-hidden="true">`); selecting an
environment only highlights its card.

This change fills the center column with the environment **detail panel**:

- **No environment selected** → a centered hint to choose an available environment from the left.
- **Environment selected** → a header (name → biome/region/danger info pips → description → a
  gathering-mode hint that differs for blind vs targeted sites), followed by a mode-aware
  task-attempt area.
- **Blind environments** → an "Attempt gathering" button (blind gather). When the effective
  `revealPolicy !== 'never'`, a "Discovered Tasks (x/y)" section lists the tasks the player has
  already discovered as paginated rows the player can attempt directly.
- **Targeted environments** → the task list shown prominently, with no "Discovered Tasks" heading.
- **Each task row** → a rounded image square (with a lock-icon overlay when the task is blocked,
  mirroring the locked-environment treatment), the name + description, any blocking info (required
  time of day / weather, or missing tools), a "Success chance" bar, and an "Attempt" button.

Three data/behaviour gaps block this today and are addressed by small, additive changes (decisions
confirmed with the user):

1. **Success chance** is not exposed in the listing. Added as a **static drop-rate approximation**
   (chance at least one enabled drop row drops), meaningful only for `resolutionMode === 'd100'`;
   `null` otherwise so the UI hides the bar.
2. **Blind discovered tasks** are not surfaced individually — `GatheringEngine` collapses a blind
   environment to a single opaque `blindGather` entry for non-GM viewers, and only a
   `discoveredTaskCount` is exposed (not the task list). Added: a `discoveredTasks` array of
   transparent, individually-attemptable task models for revealed tasks.
3. **Attempt action** is not reachable from the Svelte UI. The existing
   `game.fabricate.startGatheringAttempt` service is surfaced through the app's services bag and
   wired to the new Attempt buttons; a successful call re-fetches the listing.

## Goals

- Replace the center-column placeholder with `GatheringDetail.svelte`, driven by the selected
  environment from the existing left-column selection state.
- Header with environment name, info pips (biome/region/danger), description, and a gathering-mode
  hint.
- Blind: "Attempt gathering" + "Discovered Tasks (x/y)" paginated list (reveal ≠ never).
- Targeted: prominent paginated task list.
- Task rows with image (+ blocked lock overlay), name/description, blocked reasons, success-chance
  bar, and a wired Attempt button.
- **Engine additions** (additive, backward compatible): per-task `successChance` (d100-only static
  approximation) on transparent task models; a `discoveredTasks` array on blind environment
  listings populated from revealed task ids; `GatheringRichStateService.listRevealedTaskIds`.

## Out of Scope

- Right-column content (active runs, history, results) — placeholder unchanged.
- Result/run presentation after an attempt (handled by existing chat/run systems).
- Actor-accurate success odds (character/condition modifiers, skill-check thresholds, node/stamina
  effects). The bar is an intentional static drop-rate approximation.
- GM-facing editor changes.
- Live reactivity beyond fetch-on-mount/tab-open and re-fetch after an attempt.

## Decisions (confirmed with the user)

- **Success chance** = static drop-rate approximation `1 − ∏(1 − dropRate_i/100)` over enabled drop
  rows, d100-only; `null` (bar hidden) otherwise.
- **Blind discovered tasks** = full scope: surface each revealed task as an individual transparent,
  attemptable task model.
- **Attempt buttons** = wired to `game.fabricate.startGatheringAttempt({ environmentId, taskId })`
  (blind gather omits `taskId`), then re-fetch the listing.
- Success-chance represents "chance at least one drop rolls", not whole-attempt success; kept
  labeled "Success chance" per the brief.
