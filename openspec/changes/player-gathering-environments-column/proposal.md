# Player Gathering App — Environments Column

## Summary

The Gathering tab in the unified Fabricate window (`FabricateAppRoot.svelte`) is currently a
"Coming soon" placeholder — every tab renders `.fabricate-app-placeholder`. This change begins
the real player-facing gathering experience by introducing the **3-column layout** for the
gathering tab and fully building the **left "Environments" column**. The center and right
columns are intentionally empty placeholder containers this iteration; they are filled in by
later changes.

The Environments column lets a player see, at a glance, the gathering environments that exist for
their selected actor: the ones they can use (**available**) and the ones that are **locked**
(GM-disabled), shown as greyed-out teasers. Each environment renders as a card whose structure,
spacing, biome chips, and color theme mirror the GM environment editor
(`src/ui/svelte/apps/manager/`).

Two data gaps block this today and are addressed by small, additive engine changes:

1. `GatheringEngine._playerCandidateEnvironments` filters out `enabled === false` environments
   for non-GMs, so locked environments never reach the player listing.
2. The player environment-listing model (`_buildEnvironmentListing`) exposes neither the
   **system-level** `revealPolicy` (`never|onSuccess|onAttempt`, a `GatheringRules` field added by
   `gathering-blind-mode`; resolved by `GatheringEngine._resolveRevealPolicy` from the composed
   `environment.rules` — there is **no** environment-level reveal override, and any
   `environment.reveal` is intentionally discarded), nor any discovered/total task counts, nor
   biome display metadata (label/icon/color) — all required to render the blind
   `(discovered/total)` suffix and the colored biome chips.

## Goals

- **3-column gathering layout** with the center column slightly larger than the equal left/right
  columns, replacing the gathering-tab placeholder. Center + right are empty placeholders.
- **Environments column**: section title ("Environments") + hint text, then a scrollable list of
  environment cards.
- **Environment card** (mirrors GM editor look/feel):
  - Square environment image on the left; name to the right; biome tags beneath the name.
  - **Blind environments**: a mask icon + "Blind gathering" chip in the card's top-right.
  - For blind environments, the name carries a `(x/y)` suffix — `x` = discovered task count,
    `y` = the environment's total composed task pool (`composedTaskCount`, the blind-reveal
    denominator; distinct from the GM editor's runtime "available task count" metric) — shown
    **only** when the effective `revealPolicy !== 'never'`. Rendered with an accessible label
    (e.g. "x of y tasks discovered"), not bare glued text.
  - **Locked (disabled)** environments: greyed/desaturated with a lock indicator, non-interactive.
  - **Available** environments: selectable with a highlight-only `is-selected` state mirroring the
    GM row selection. No center-column wiring yet.
- **Engine additions** (additive, backward compatible): surface disabled environments as locked
  identity-only listings to all viewers in the player listing (players and GMs alike); add `locked`,
  `revealPolicy`, `composedTaskCount`, `discoveredTaskCount`, and `biomeTags` to each player
  environment listing.

## Out of Scope

- Center and right column content (task selection, gather action, results) — placeholders only.
- Starting gathering attempts from this UI, or any write/runtime behavior.
- Live reactivity to weather/condition/reveal changes beyond fetch-on-mount/tab-open (a refresh
  hook can follow later).
- GM-facing **editor** changes; the GM environment editor already shows disabled environments. (In
  the player listing itself, disabled environments are surfaced as locked identity-only listings to
  all viewers, GMs included.)
- Changing matching, composition, blind selection, or reveal **write** behavior (reveal counting
  here is read-only).

## Decisions (confirmed with the user)

- Surface `enabled === false` environments as `locked` identity-only listings to all viewers in the
  player listing (players and GMs alike).
- Center/right columns are empty placeholders this change.
- Available cards are selectable (highlight only); locked cards are non-interactive.
