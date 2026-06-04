# Fix Gathering Tool Source Matching And Broken Variant

## Summary

Fix two independent defects that cause a player gathering task's "Required tools" panel
to mislabel tools the actor already owns:

1. A **working** tool the actor owns is reported as **Missing**.
2. A **broken** tool (the repair-stock broken form of a required tool) is reported as
   **Missing** instead of **Broken**.

Both defects trace to how Fabricate identifies an owned item as "the same thing" as a
configured component. Both items were created by dragging the crafting system's world
Item into the actor, so Foundry stamped `_stats.duplicateSource: "Item.<id>"` on the copy
(with `compendiumSource: null` and no `flags.core.sourceId`). The fix teaches the shared
source-reference matcher to honor `_stats.duplicateSource` and teaches gathering tool-state
classification to recognize a `replaceWith` broken-variant component as the broken form of
its tool.

## Motivation

### Root cause A — matching ignores `_stats.duplicateSource`

`getSourceUuid()` in `src/utils/sourceUuid.js` reads only `_stats.compendiumSource` and
`flags.core.sourceId` — the compendium-source chain. A Fabricate component stores its
world-item UUID in `sourceUuid` / `sourceItemUuid`. An item that was **duplicated** from
that world item (a drag-copy into the actor) carries the link only in
`_stats.duplicateSource`, which `getItemSourceReferences()` never consults. As a result
`itemMatchesComponentSource()` returns `false` and the owned working tool is reported as
**Missing**.

This matching path (`RecipeManager._catalystMatchesItem` → `itemMatchesComponentSource`)
is shared by gathering tools **and** crafting catalysts/components, so the same blind spot
silently weakens catalyst and ingredient recognition for duplicate-sourced inventory.

### Root cause B — `replaceWith` broken variant not recognized

A tool can define `onBreak: { mode: 'replaceWith', replacementComponentId }` (for example
a Mining Pick whose broken form is the separate `broken-tool-mining-pick` component). The
broken form is a **separate component**, not an item carrying the
`flags.fabricate.toolBroken` flag. `classifyGatheringToolStates()` in
`src/gatheringToolRuntime.js` only tiers a matched item to `damaged` when it carries the
`toolBroken` flag, so a held `replaceWith` broken variant falls through to `missing`. The
player sees "Missing" even though they are holding the broken tool waiting to be repaired.

Both root causes were confirmed against the code and the Mythwright bootstrap
`scripts/foundry/create-mythwright-dnd5e.js`.

### User-visible symptoms

- A working, owned required tool shows "Missing", so the player believes they must acquire
  a tool they already have.
- A broken required tool shows "Missing" instead of "Broken", hiding the fact that the
  player holds the broken form and only needs to repair it.

## Goals

- Recognize an owned item as a component/tool match when its only link to the source world
  item is `_stats.duplicateSource`, across every consumer of the shared source-reference
  matcher (gathering tools, crafting catalysts, ingredients/components).
- Display a held `replaceWith` broken-variant component as the **broken** state of its tool
  in the gathering "Required tools" panel, while leaving attempt validation unchanged so a
  broken tool still cannot satisfy an attempt.
- Rename the gathering tool-state label from "Damaged" to "Broken" so the panel copy matches
  the domain term used elsewhere.

## Non-Goals

- NOT matching items on `flags.fabricate.mythwrightId` or any pack-bookkeeping id. Canonical
  item identity remains the source-UUID chain; `mythwrightId` is import/seed bookkeeping, not
  a matching key.
- NOT making a broken tool satisfy a gathering attempt. The broken-variant recognition is
  display-only; `matchGatheringTools()` (attempt validation) is unchanged and the attempt
  stays blocked with `TOOL_BLOCKED`.
- NOT changing `getSourceUuid()` semantics. It remains the compendium-source resolver; the
  duplicate-source reference is added as an additional identity reference in
  `getItemSourceReferences()`, not folded into `getSourceUuid()`.
- NOT introducing a new broken-tool flag form or a new tool data field.

## Affected Specs

- `data-models` (source-reference matching for components/tools must also honor
  `_stats.duplicateSource`)
- `gathering-and-harvesting` (tool-state display recognizes a held `replaceWith`
  broken-variant component as broken while the attempt remains blocked)
