# Design: Fix Gathering Tool Source Matching And Broken Variant

This is a two-defect decision record. The defects are independent and the fixes are
independently testable, but they surface together in the player gathering "Required tools"
panel because both decide whether an owned item "is" a configured component/tool.

## Defect A — Duplicate-source as an additional item identity reference

### The matching chain today

Owned-item ↔ component matching runs through one shared chain:

- `getItemSourceReferences(item)` collects the UUIDs that identify an item instance and its
  canonical source: `[item.uuid, getSourceUuid(item)]`.
- `getComponentSourceReferences(component)` collects the component's claimed source UUIDs:
  `[sourceUuid, sourceItemUuid, ...fallbackItemIds]`.
- `itemMatchesComponentSource(item, component)` returns true when those two sets intersect.

`getSourceUuid(item)` resolves only the **compendium-source** chain:
`_stats.compendiumSource` (Foundry v12+) then `flags.core.sourceId` (legacy fallback).

### Why duplicate-source is missed

When a GM drags a **world** Item into an actor, Foundry records the origin as
`_stats.duplicateSource: "Item.<id>"` — not `compendiumSource` (which stays `null`) and not
`flags.core.sourceId`. A Fabricate component built from that same world item stores its UUID
in `sourceUuid` / `sourceItemUuid`. So the component claims `Item.<id>`, the owned copy only
records `Item.<id>` under `duplicateSource`, and the resolver never reads it. The sets do not
intersect and the item is reported as Missing.

### Decision: add it to `getItemSourceReferences`, not to `getSourceUuid`

`getSourceUuid()` has **compendium-source semantics**. It answers "which compendium document
was this copied from?" — a specific question used by recipe-item identity and other
compendium-aware code. `duplicateSource` answers a different question: "which world document
was this duplicated from?" Folding it into `getSourceUuid()` would overload that contract and
risk changing behavior in every caller of the compendium resolver.

Instead, add a focused helper and include it only in the item-instance reference list:

```js
// new helper, world-duplicate semantics, kept separate from getSourceUuid
getDuplicateSourceUuid(item) =
  item._stats?.duplicateSource
  || item.system?._stats?.duplicateSource
  || null;

// getItemSourceReferences now contributes three references:
//   [item.uuid, getSourceUuid(item), getDuplicateSourceUuid(item)]
```

This is the minimal, surgical change. `getSourceUuid()` is left untouched, so
compendium-source semantics and every recipe-item-identity caller are unchanged. Because the
fix lives in the shared `getItemSourceReferences()`, every consumer of
`itemMatchesComponentSource()` — gathering tools, crafting catalysts, and
ingredients/components — gains duplicate-source recognition for free, which is exactly the
breadth the defect demands (the working-tool symptom is one instance of a general matching
gap).

### Why `mythwrightId` is not the matching key

The Mythwright bootstrap stamps a `flags.fabricate.mythwrightId` on seeded items. It is
tempting to match on it, but it is **pack bookkeeping**: a stable id used by the seeding
script to find/update its own records on re-import. It is not present on arbitrary
GM-authored items, it is provider/import-specific, and matching on it would couple core
matching to one importer's conventions. The canonical, system-agnostic identity is the
**source-UUID chain** (live UUID, compendium source, and now world-duplicate source). The
fix stays on that chain.

## Defect B — Broken-variant recognition derived from `onBreak.replacementComponentId`

### The three on-break shapes

A tool's `onBreak.mode` is one of:

- `destroy` — the broken item is deleted; nothing to recognize.
- `flagBroken` — the same item gains `flags.fabricate.toolBroken === true`; already tiered
  to `damaged` by `classifyGatheringToolStates()` via `isToolBroken()`.
- `replaceWith` — the original is deleted and a **separate** `replacementComponentId`
  managed component is created on the actor. This broken form is a distinct component with
  its own source identity; it carries **no** `toolBroken` flag.

`classifyGatheringToolStates()` matches inventory against the tool's own component and tiers
a match to `damaged` only when the matched item carries the `toolBroken` flag. A held
`replaceWith` broken variant never matches the tool's own component (it is a different
component) and never carries the flag, so it falls through to `missing`.

### Decision: synthetic-component fallback, display-only

When a tool has **no** matching item under its own component and
`tool.onBreak.mode === 'replaceWith'` with a `replacementComponentId`, classify against a
synthetic `{ componentId: replacementComponentId }` using the same matcher. If the actor
holds the broken variant, set the tool's display state to `damaged` (rendered as "Broken").

Ordering: the working-item match is checked first, so an actor who holds **both** the working
tool and a spare broken variant is correctly shown `present` (working wins). The broken-variant
probe is a fallback only when no working item matched.

### Display-only vs attempt validation

This change touches **only** `classifyGatheringToolStates()`, which feeds the player-facing
"Required tools" panel. `matchGatheringTools()` (the attempt-validation gate) is **not**
changed: it already treats anything that is not a present, non-broken, matching working item
as missing, so an actor holding only the broken variant still fails the gate and the attempt
stays blocked with `TOOL_BLOCKED`. The display now explains *why* ("Broken", repairable)
instead of lying ("Missing", reacquire), without weakening the gate.

This mirrors the existing contract that `classifyGatheringToolStates()` is the display-tiering
layer that splits broken matches into a `damaged` tier instead of collapsing them into
`missing`, while `matchGatheringTools()` remains the authoritative attempt gate.

## Label: "Damaged" → "Broken"

The gathering tool-state label `FABRICATE.App.Gathering.Detail.ToolState.damaged` reads
"Damaged"; the hint already reads "This tool is broken." The domain term used across tool
breakage (`toolBroken`, `replaceWith` repair stock) is **broken**, so the label is renamed to
"Broken" for consistency. The internal state token stays `damaged` (no code-key churn); only
the displayed string changes. The hint is unchanged.

## Risks and mitigations

- **Over-broad matching from duplicate-source.** `duplicateSource` is a precise Foundry
  origin UUID, not a name or tag, so it cannot cause cross-item false positives beyond the
  exact world item a component already claims. Tests cover that an item with only
  `duplicateSource` matches, and that `getSourceUuid()` stays compendium-only.
- **Broken variant leaking into attempt success.** Mitigated by scoping the change to
  `classifyGatheringToolStates()`; a regression test asserts `matchGatheringTools()` still
  reports `missing` (attempt blocked) when only the broken variant is held.
- **Label drift.** The state token remains `damaged`; only the localized string changes, so
  no consumer that switches on the token is affected.
