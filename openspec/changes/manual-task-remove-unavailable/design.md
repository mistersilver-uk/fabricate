# Design: Manual Task Removal Returns to Available

## Store Behavior

`src/ui/svelte/stores/adminStore.js` keeps the existing `excludeEnvironmentRecord(kind, id)` action name for compatibility. The action becomes mode-aware only for manual tasks:

- `kind === 'task' && environmentDraft.compositionMode === 'manual'`: remove the ID from `enabledTaskIds` and `forcedTaskIds`; leave `disabledTaskIds` unchanged except for removing the same ID if it is already present.
- All other cases: preserve existing exclusion behavior by removing enabled/forced membership and adding the ID to `disabled*Ids`.

The composition view-model should then classify a removed manual task by the normal library/matching rules: matching enabled records become `candidate`, enabled non-matching records become `notMatching`, and library-disabled records become `libraryDisabled`. They should have `runtimeState === 'unavailable'`.

## UI Behavior

`CompositionList.svelte` and `RecordInspector.svelte` keep automatic task and hazard wording as `Exclude`. For included task rows in manual mode, list quick actions, list overflow menu actions, and selected-record inspector actions should present `Remove` / `Remove from environment` while still calling the existing `onExclude(kind, id)` callback.

Manual task `Available to add` should be driven by normal non-excluded states. It should not need special handling for `excluded` manual task rows after this change, though automatic tasks and hazards can still render excluded rows in their existing sections.

## Tests

Store tests cover manual task removal, automatic task exclusion, and manual hazard exclusion. Mounted component tests cover manual task removal copy and automatic/hazard excluded-section preservation. Source contract tests should be updated for the renamed user-facing copy, selected-record inspector copy, and the absence of excluded-task restoration semantics in manual task Available to add.
