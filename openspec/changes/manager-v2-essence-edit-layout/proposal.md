# Manager V2 Essence Edit Layout

## Problem

The Manager V2 edit essence route still reads like an early functional form rather than the reference edit screen. The selected icon preview is smaller than the picker controls, the description sits below the full identity row instead of beside the icon column under Name, the effect-transfer source controls consume a separate card below the core fields, and the right inspector repeats basic information that is not useful while editing.

The Usage inspector also only shows a numeric component count. GMs need quick visual access to the components that contain the selected essence and a direct route to edit those components.

## Scope

In scope:

- Reflow `EssenceEditView` identity fields so the icon preview, icon picker, and clear button share a consistent control width, with Name and Description to the right.
- Move the effect-transfer source selector/drop target and selected source evidence into the space below the core identity fields when `features.effectTransfer === true`.
- Remove the Basic information inspector card from the essence inspector.
- Extend Usage with a compact scrollable grid of component images for components that contain the selected essence.
- Give each usage image a tooltip using the component name and route clicks to the existing component edit callback.
- Add focused tests for the display data, mounted behavior, and CSS layout contract.

Out of scope:

- Changing essence persistence semantics.
- Adding new component editor routes.
- Reworking the entire Manager V2 inspector tab model from the reference image.
- Adding dependencies.

## Acceptance Criteria

- The edit essence identity card matches the reference hierarchy more closely: large square selected icon/control column on the left, Name above Description on the right.
- The selected icon preview is the same width as the icon picker and clear icon controls.
- When effect transfer is enabled, the source drop zone/current selected source appears under the identity fields inside the edit form, not as a detached lower card.
- When effect transfer is disabled, no source selector/drop target/source evidence appears.
- The essence inspector no longer renders Basic information or the Essence ID card.
- Usage still shows component count and, when components use the essence, shows a scrollable image-only component grid.
- Usage thumbnails have `title`/accessible labels from component names and click through to `services.onEditComponent(componentId)`.
- Layout tests cover stable edit-route geometry and usage thumbnail sizing/scroll containment.

## Verification

- `npm test`
- `npm run build`
- Vite-first UI inspection if a live dev URL is available; otherwise focused mounted/CSS tests and screenshot-ready fixtures are acceptable for this slice.
