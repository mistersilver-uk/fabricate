# Gathering Tools Page

## Summary

Adds a dedicated Manager V2 page where GMs author a per-system library of reusable tools. Tools previously had no authoring surface — earlier attempts to bolt them onto the environment editor or the standalone task editor were both removed. This change introduces a top-level `Tools` nav entry positioned directly under Essences (always visible when a system is selected, not gated by the gathering feature), a draft-and-save model, and the underlying `gatheringConfig.systems[id].tools[]` library shape. Tools are referenced by gathering tasks today; recipes and salvage will reference the same library in a future change, eventually subsuming the existing Catalyst concept.

## Goals

- Per-system library of reusable tools, each carrying the existing Tool data model fields plus library metadata (`id`, optional `label`, `enabled`).
- Browser + inline editor with summary chips for the requirement, breakage mode, and on-break action.
- Right-side inspector with selected-tool overview, requirement summary, breakage summary, on-break summary, and a usage card (rendered in a "Not linked" state until task references arrive in a later change).
- Draft + `Save changes` model parallel to the environment draft, with dirty tracking, confirm-discard on navigation away, and a concurrent-edit overwrite confirm on save.
- Backwards compatible: legacy `gatheringConfig` without a `tools` array on a system normalizes to `[]`.
- Composition seam (`__libraryTools` Map on the composed environment) ready for runtime task→tool resolution.
- Reference per-system library tools from gathering tasks via `task.toolIds: string[]`; the task editor gets a `Required Tools` section that searches the library and adds/removes references with click-to-add / chip-remove. Runtime engine consumption (start-attempt gate, breakage, on-break, policy override) ships in the follow-up `gathering-task-tools` change.
- Follow-up fix: tighten the Tools inspector component browser so the search icon sits inside the search input, the results area shows complete component cards before scrolling, and pagination reads as a full-width centered footer in the narrow inspector.

## Out of Scope

- Runtime engine consumption of `task.toolIds` (start-attempt gate, breakage, on-break, policy override). Documented as the next change.
- An in-app UI for clearing the `flags.fabricate.toolBroken` flag — GMs use Foundry's item flag editor for now.
- Cross-system shared tools.
- A real usage analytics surface — the Usage card is rendered in a "Not linked" state.
