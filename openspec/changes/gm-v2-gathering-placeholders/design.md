# Design

## Approach

`EnvironmentsBrowserView.svelte` currently owns `activeGatheringTab`, which means the root `CraftingSystemManagerV2Root.svelte` cannot know whether the right inspector should show selected-environment content or placeholder content.

This change makes the active gathering tab a controlled prop:

- `CraftingSystemManagerV2Root.svelte` owns `activeGatheringTab`.
- `EnvironmentsBrowserView.svelte` receives `activeGatheringTab` and `onSelectGatheringTab`.
- The browser keeps the existing top tab rendering and center-panel behavior.
- The root inspector uses `activeGatheringTab` when `currentView === 'environments'`.

## Inspector Behavior

- `environments`: preserve the existing selected-environment inspector, empty setup card, and select-environment fallback.
- `tasks`: show a placeholder inspector using the Tasks icon, title, and hint.
- `encounters`: show a Hazards placeholder inspector using a warning icon, title, and hint.
- `settings`: show a placeholder inspector using the Settings icon, title, and hint.

## State Reset

When the selected system changes, the gathering tab resets to `environments`, matching the existing browser reset behavior.

## Scroll Containment

The Environments tab's gathering panel must define bounded grid rows for its toolbar, environment list, and pagination footer. The environment list row uses `minmax(0, 1fr)` so `.manager-v2-table-scroll` receives a constrained height and can scroll internally instead of expanding to fit every environment row.

## Environment Browser Row Layout

Environment browser rows use a larger scene thumbnail at `120px x 68px`, with the identity grid reserving the same `120px` image column. The identity cell and thumbnail are centered within the row, and the row is positioned relatively with a stable minimum height around the larger image.

The actions column reserves only the visible edit, duplicate, and delete controls. Move up/down controls remain in the DOM as thin absolute overlay bands across the top and bottom of each row, with the arrow icon centered in each band. Each band is invisible by default and reveals only itself when that narrow band is hovered or keyboard-focused, preserving keyboard access without dedicating a permanent table column to reordering.

## Gathering Header Copy

The browser header follows the selected gathering section. Environments keeps the scene-linked browser copy, Tasks shows reusable task planning copy, Hazards replaces the previous Encounters wording, and Settings describes the system-level d100 rules managed in the right inspector.

## Compatibility

The change is presentation-only. It does not affect environment selection, draft editing, persistence, validation, runtime gathering flows, or player-facing gathering behavior.
