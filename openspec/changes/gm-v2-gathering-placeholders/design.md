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
- `encounters`: show a placeholder inspector using the Encounters icon, title, and hint.
- `settings`: show a placeholder inspector using the Settings icon, title, and hint.

## State Reset

When the selected system changes, the gathering tab resets to `environments`, matching the existing browser reset behavior.

## Compatibility

The change is presentation-only. It does not affect environment selection, draft editing, persistence, validation, runtime gathering flows, or player-facing gathering behavior.
