# Tasks

## OpenSpec And Review

- [ ] Run plan-review with `fabricate_domain_expert`, `fabricate_ux_designer`, and `fabricate_quality_engineer`.
- [ ] Revise `proposal.md`, `design.md`, and spec deltas until every plan reviewer approves.

## Defect A - Duplicate-source item identity

- [ ] In `src/utils/sourceUuid.js`, add `getDuplicateSourceUuid(item)` returning `item._stats?.duplicateSource || item.system?._stats?.duplicateSource || null`.
- [ ] Include `getDuplicateSourceUuid(item)` in `getItemSourceReferences(item)` alongside `item.uuid` and `getSourceUuid(item)`, deduplicated.
- [ ] Leave `getSourceUuid()` unchanged (compendium-source semantics: `_stats.compendiumSource` then `flags.core.sourceId`).
- [ ] Confirm `itemMatchesComponentSource()` and `getComponentSourceReferences()` need no change; the new reference flows through the shared matcher used by gathering tools and crafting catalysts/components.

## Defect B - `replaceWith` broken-variant tool state

- [ ] In `classifyGatheringToolStates()` (`src/gatheringToolRuntime.js`), when a tool has no matching working item and `tool.onBreak?.mode === 'replaceWith'` with a `replacementComponentId`, match a synthetic `{ componentId: replacementComponentId }` against inventory using the same matcher; when held, set the tool state to `damaged`.
- [ ] Keep working-item matching first so an actor holding both the working tool and a broken variant is classified `present`.
- [ ] Leave `matchGatheringTools()` (attempt validation) unchanged so a held broken variant still does not satisfy the attempt (`TOOL_BLOCKED`).

## Label

- [ ] In `lang/en.json`, rename `FABRICATE.App.Gathering.Detail.ToolState.damaged` from "Damaged" to "Broken"; leave the hint "This tool is broken." unchanged and leave the `present` / `missing` strings unchanged.

## Tests

Defect A — `tests/source-uuid-matching.test.js` / `tests/source-uuid-resolver.test.js`:
- [ ] An item carrying only `_stats.duplicateSource` matches a component via `sourceUuid` / `sourceItemUuid` through `itemMatchesComponentSource`.
- [ ] Discrete regression guard: `getSourceUuid()` returns `null` for a duplicate-source-only item (compendium-source contract stays separate).
- [ ] `getDuplicateSourceUuid` reads BOTH `item._stats.duplicateSource` and `item.system._stats.duplicateSource` (cover the second OR-branch).
- [ ] Negative: an item carrying only `flags.fabricate.mythwrightId` (no uuid / compendiumSource / duplicateSource overlap) does NOT match.
- [ ] Keep the existing exact-equality `getItemSourceReferences` assertion green (no `duplicateSource` → array unchanged, dedup/ordering preserved), and add a sibling positive case where `duplicateSource` IS present and appears as a third reference.

Defect B — `tests/gathering-tool-runtime.test.js` (use the injected `craftingSystemManager.catalystMatchesItem` seam):
- [ ] `classifyGatheringToolStates` returns `damaged` when only the `replaceWith` `replacementComponentId` item is held, `present` with the working item, and `missing` with neither.
- [ ] Precedence: actor holds BOTH the working tool component AND the distinct `replaceWith` replacement component → `present` (working wins over the broken-variant fallback).
- [ ] Negative `onBreak.mode` guard: with only the replacement component held, `onBreak.mode` of `destroy` and `flagBroken` classify as `missing`, NOT `damaged`.
- [ ] Guard: `replaceWith` with null/empty/missing `replacementComponentId` classifies as `missing`, does not throw, and does not false-match a synthetic undefined-`componentId` probe.
- [ ] Regression: the existing `toolBroken`-flag `damaged` path still works — an item matching the tool's OWN component AND flagged broken yields `damaged` via the flag path (additive, not masked by the new branch).
- [ ] `matchGatheringTools` still reports `missing` (attempt blocked) when only the broken variant is held.

## Validation Gates

- [ ] Run `npm test`.
- [ ] Run `npm run build`.

## Docs Loop

- [ ] Promote the approved spec deltas into the canonical `data-models` and `gathering-and-harvesting` specs after implementation if the design changes.
- [ ] Update JSDoc on `getDuplicateSourceUuid` / `getItemSourceReferences` and `classifyGatheringToolStates` to describe duplicate-source matching and broken-variant display tiering.
