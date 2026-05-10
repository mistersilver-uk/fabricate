# Design

## Current Context
`ManagerV2ColorPicker.svelte` currently renders `ManagerV2ColorPopover.svelte` inline under the trigger. The colour popover already has the right behavioral surface: preset buttons call `onChange({ colorToken, customColor })`, custom hex input calls `onChange({ colorToken, customColor })`, outside click and Escape dismissal are handled by the popover/dismiss action path, and CSS defines the compact 220px picker geometry.

The related Manager V2 icon pickers already use `computeIconPickerPopoverLayout` plus portal rendering to escape local containers while staying bounded to app panels. The biome colour picker should follow that pattern without broadening the shared helper contract.

## Implementation Plan
- Update `src/ui/svelte/components/ManagerV2ColorPicker.svelte`.
- Import the existing portal action and `computeIconPickerPopoverLayout`.
- Bind the colour picker root and trigger elements so layout can be computed from the trigger rectangle.
- Resolve the portal target with `pickerRoot.closest('.fabricate-manager-v2')`.
- Resolve the horizontal constraint panel with `pickerRoot.closest('.manager-v2-main')`.
- Compute layout on open, window resize, and scroll while open.
- Pass layout as inline style or equivalent presentation data to the portaled `ManagerV2ColorPopover`.
- Use `computeIconPickerPopoverLayout(triggerRect, viewport, { horizontalAlign: 'left', minWidth: 220, maxWidth: 220, minLeft, maxRight })`.
- Derive `minLeft` and `maxRight` from the nearest `.manager-v2-main` bounding rect when present; fall back to viewport margin behavior when absent.
- Apply the same portal/style pass-through to the combined biome pill colour-popover path in `EnvironmentsBrowserView.svelte`, because that path opens `ManagerV2ColorPopover` from the icon trigger rather than through the standalone colour trigger component.
- Preserve the current fallback behavior well enough that tests can mount the component outside a full Foundry ApplicationV2 shell.

## Behavior Boundaries
- Do not change `ManagerV2ColorPopover` preset values, labels, data attributes, or update payloads unless required only to accept positioning style/class input.
- Do not change biome data persistence or update payload wiring in `EnvironmentsBrowserView.svelte`; the direct colour-popover render may pass overlay placement props only.
- Do not change the shared layout helper default options. The colour picker supplies its own width and left-alignment options.
- Do not introduce document-level query coupling when a nearest-root lookup can be made from the component root.

## Visual And Interaction Acceptance
- First visible state: opening a biome colour picker from the Gathering Settings Biomes panel shows the preset grid and custom hex field.
- Alignment: the left edge aligns to the colour trigger unless constrained by the Manager V2 main panel edge.
- Clipping: the popover is not clipped by vocabulary pills, condition panels, or the `.manager-v2-main` scroll container.
- Scroll containment: the Manager V2 shell and main panel retain their existing overflow behavior.
- Visible controls: all eight preset buttons and the custom hex input remain visible inside a 220px popover.
- Responsive sizes: verify normal desktop Manager V2 width and a constrained/narrow Manager V2 width.
- Flip behavior: a trigger near the lower edge of the main panel places the popover above.
- Pointer hit-test: in a live browser or mounted DOM where feasible, clicking a preset inside the portaled popover updates the same biome colour payload and outside click still dismisses it.

## Affected Files For Implementation
- `src/ui/svelte/components/ManagerV2ColorPicker.svelte`
- `src/ui/svelte/components/ManagerV2ColorPopover.svelte` only if needed for style/class pass-through
- `tests/components/manager-v2-layout.test.js`
- `tests/components/manager-v2-mounted.test.js`

## Verification
- `node --test tests\components\manager-v2-layout.test.js`
- `node --test tests\components\manager-v2-mounted.test.js`
- `npm test`
- `npm run build`

For UI review, inspect the mounted Manager V2 Gathering Settings state using DOM placement and geometry assertions. Screenshot artifacts are optional follow-up evidence when a live Foundry/Vite browser session is available, but the required gate for this slice is automated mounted coverage that proves first visible state, shell portal placement, settings-panel escape, fixed width, lower-trigger above placement, preset payload behavior, and outside/Escape dismissal.

## Agent Roster
- Plan owner: `fabricate_orchestrator`.
- Plan review: `fabricate_ux_designer`, `fabricate_quality_engineer`.
- Implementation: `fabricate_implementer`.
- Post-implementation review: `fabricate_reviewer`, `fabricate_ux_designer`, `fabricate_quality_engineer`.
- Docs loop: not required unless implementation changes durable behavior or documented public API beyond this active design contract.

## Implementer Entry Criteria
- Use this change folder plus the active `manager-v2-gathering-condition-settings` design as the behavior source.
- Keep edits on a non-`main` branch.
- Do not change store callbacks, data normalization, localization keys, biome option records, or emitted payload shapes.
- Keep the implementation scoped to the colour picker overlay and the two named test files.
