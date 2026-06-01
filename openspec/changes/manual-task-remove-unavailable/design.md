# Design: Manual Composition Removal Returns to Available

## Store Behavior

`src/ui/svelte/stores/adminStore.js` keeps the existing `excludeEnvironmentRecord(kind, id)` action name for compatibility. The action becomes mode-aware for manual composition:

- `environmentDraft.compositionMode === 'manual'`: remove the ID from the matching `enabled*Ids` and `forced*Ids`; leave `disabled*Ids` unchanged except for removing the same ID if it is already present.
- All other cases: preserve existing exclusion behavior by removing enabled/forced membership and adding the ID to `disabled*Ids`.

The composition view-model should then classify a removed manual task or hazard by the normal library/matching rules: matching enabled records become `candidate`, enabled non-matching records become `notMatching`, and library-disabled records become `libraryDisabled`. They should have `runtimeState === 'unavailable'`.

## UI Behavior

`CompositionList.svelte` and `RecordInspector.svelte` keep automatic task and hazard wording as `Exclude`. For included task and hazard rows in manual mode, list quick actions, list overflow menu actions, and selected-record inspector actions should present `Remove` / `Remove from environment` while still calling the existing `onExclude(kind, id)` callback.

Manual `Available to add` should be driven by normal non-excluded states for both tasks and hazards. It should not need special handling for `excluded` manual rows after this change, though automatic tasks and hazards can still render excluded rows in their existing sections.

## Tests

Store tests cover manual task/hazard removal, automatic exclusion, and stale manual disabled IDs. Mounted component tests cover manual task/hazard removal copy, Available-to-add classification, and automatic excluded-section preservation. Source contract tests should be updated for the renamed user-facing copy, selected-record inspector copy, and the absence of excluded-record restoration semantics in manual Available to add.
