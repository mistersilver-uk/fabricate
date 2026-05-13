# Gathering Tools Page

## Summary

Adds a dedicated Manager V2 page where GMs author a per-system library of reusable gathering tools. Tools previously had no authoring surface — earlier attempts to bolt them onto the environment editor or the standalone task editor were both removed. This change introduces a `Tools` submenu under Gathering, a draft-and-save model, and the underlying `gatheringConfig.systems[id].tools[]` library shape.

## Goals

- Per-system library of reusable tools, each carrying the existing Tool data model fields plus library metadata (`id`, optional `label`, `enabled`).
- Browser + inline editor with summary chips for the requirement, breakage mode, and on-break action.
- Right-side inspector with selected-tool overview, requirement summary, breakage summary, on-break summary, and a usage card (rendered in a "Not linked" state until task references arrive in a later change).
- Draft + `Save changes` model parallel to the environment draft, with dirty tracking, confirm-discard on navigation away, and a concurrent-edit overwrite confirm on save.
- Backwards compatible: legacy `gatheringConfig` without a `tools` array on a system normalizes to `[]`.
- Composition seam (`__libraryTools` Map on the composed environment) ready for the future task→tool reference change.

## Out of Scope

- Task-side wiring (referencing library tools from gathering tasks). Documented as the next change.
- An in-app UI for clearing the `flags.fabricate.toolBroken` flag — GMs use Foundry's item flag editor for now.
- Cross-system shared tools.
- A real usage analytics surface — the Usage card is rendered in a "Not linked" state.
