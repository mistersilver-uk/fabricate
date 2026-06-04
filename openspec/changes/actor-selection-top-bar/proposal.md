# Actor Selection Top Bar

## Summary

Add a horizontal **Actor selection top bar** that spans the content width above ALL tabs
(`Gathering`, `Crafting`, `Journal`, `Inventory`) in the unified Fabricate window.

- **Left**: a character-portrait + dropdown caret that opens a searchable popover listing the user's
  selectable **player characters** — the actor types a system designates as player characters. Players
  see owned player-character actors; the GM sees all of them. The current dnd5e/pf2e implementation of
  that concept is `actor.type === 'character'` (see "player-character concept" below).
- **Right**: tab-specific context. For the **Gathering** tab only, the bar shows the current
  time-of-day (icon + label) and the current region (the `region` string of the gathering tab's
  selected environment, with a neutral placeholder when none is selected).

This iteration **wires gathering for real**: selecting an actor in the bar re-filters the gathering
listing and persists the choice. The bar also renders above the `Crafting`, `Journal`, and
`Inventory` tabs, but those bodies stay placeholders for now.

Shell↔tab data flow (the shell owns the bar, the gathering tab owns the selected environment's
region) is solved with a single Svelte 5 runes store created in `_buildServices()` and hung off
`services.actorBar`. Both `FabricateAppRoot` and `GatheringView` already receive `services`.

## Motivation

Actor selection currently lives inside the gathering surface and is invisible to the other tabs, so
there is no shared, content-width place to choose "who am I acting as" across the unified window. As
crafting, journal, and inventory tabs come online they need the same actor context, and players need
the time-of-day / region cues that drive gathering without digging into a per-tab control.

A shared top bar also lets us tighten the **selection vocabulary**: the bar should list only **player
characters** — the actor types a system designates as player characters, owned for players, all for
the GM. That player-character filter must live in a new selector path, NOT in
`isGatheringActorSelectableByUser`, because that predicate also gates gathering **attempt
authorization** and must stay ownership-based (an owned `npc` may still legitimately make a gathering
attempt through other surfaces).

### The "player-character concept" and its current implementation

"Player character" is a **concept** in these specs: the actor types a system designates as player
characters. The bar list MUST narrow the ownership-selectable set by this concept. The **current
dnd5e/pf2e implementation** of the concept is the predicate `isPlayerCharacterActor(actor)` returning
`actor.type === 'character'`; `'character'` is not asserted as a universal truth across systems.

Systems whose player-character actor type differs from `'character'` are a **known limitation** of
this iteration: their player characters will not appear in the bar list. `isPlayerCharacterActor` is
the intended seam for future extension/configuration (e.g. a per-system PC-type set), so the concept
can be re-pointed without touching ownership or attempt-authorization code.

## Goals

- Render an `ActorSelectTopBar` above all four tabs, spanning the content width, in both themes,
  using only base `--fab-*` tokens.
- Left trigger: character portrait + caret opening a searchable popover (reusing the
  `IconPicker.svelte` popover pattern) listing selectable player characters filtered case-insensitively
  by name; `role="listbox"` of portrait + name options.
- Right context for the `Gathering` tab only: current weather icon/label + current time-of-day
  icon/label + current region label.
- Define the **player-character concept** via a new player-safe selector path: owned (player) / all
  (GM) actors that match the system's player-character type, implemented for dnd5e/pf2e by
  `isPlayerCharacterActor(actor)` → `actor.type === 'character'`. Do NOT modify
  `isGatheringActorSelectableByUser`.
- Persist the selected actor in the existing `LAST_GATHERING_ACTOR` client setting; the store seeds
  from it, falls back to the first selectable actor, and re-persists the fallback.
- Wire gathering: selecting an actor re-fetches and persists the gathering listing; the gathering
  fetch injects `rememberedActorId` (the persisted selection) into `listGatheringForActor`.
- Gathering view reports its selected environment's `region` to the bar; bar shows current
  weather and time-of-day from `getGatheringConditions`.
- Extract the weather and time-of-day icon maps out of `adminStore.js` into a shared util with no
  behavior change.

## Non-Goals

- No crafting / journal / inventory body changes — those tabs render the bar but keep placeholder
  bodies. Future crafting multi-source component selection is out of scope; the existing
  `LAST_CRAFTING_ACTOR` / `LAST_COMPONENT_SOURCES` settings already reserve that work.
- No change to `isGatheringActorSelectableByUser` or to gathering attempt authorization semantics.
- No change to weather presentation, stamina presentation, or the gathering detail/result surfaces.
- No new persistence keys; reuse `LAST_GATHERING_ACTOR`.
- No live reactivity beyond load-on-mount/tab-open, actor-change re-fetch, and region reporting.

### Known limitations

- The player-character concept is implemented only for systems whose PC actor type is `'character'`
  (dnd5e/pf2e). Systems with a different PC type are out of scope this iteration; their player
  characters will not appear in the bar list. `isPlayerCharacterActor` is the seam for a future
  per-system extension.
- Startup `cleanupStalePreferences` stays **ownership-based** (it clears `LAST_GATHERING_ACTOR` only
  when the stored id fails the ownership predicate). A persisted **owned non-PC** id is therefore not
  cleared at startup; converging it to a player character is the bar store's responsibility, not
  cleanup's (see `design.md`).

## Decisions (confirmed with the user)

- **Wire gathering this iteration**: actor selection re-filters and persists the gathering listing;
  other tabs show the bar only.
- **"Player character"** = owned (player) / all (GM) actors of the system's player-character type
  (concept), implemented for dnd5e/pf2e as `actor.type === 'character'`, via a NEW selector path, not
  the ownership-only gathering predicate. Other PC types are a known limitation.
- **"Current region"** = the `region` string of the gathering tab's currently selected environment;
  neutral placeholder when none selected.

## Affected Specs

- `ui-integration`
- `gathering-and-harvesting`
