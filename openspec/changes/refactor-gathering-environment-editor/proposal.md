# Refactor Gathering Environment Editor

## Summary

Refactor the manager-v2 gathering environment edit route so it follows the referenced editor design while preserving the existing Fabricate gathering contracts.

## Motivation

The current route is behaviorally wired but visually and structurally still resembles a generic legacy form stack. It hides scene linkage and progressive check controls behind `Advanced` tabs even though no advanced feature gate applies to this editor.

## Proposed Change

- Replace the environment-level tab strip with a compact details band that exposes identity, enabled state, selection mode, image, and scene linkage in one visible surface.
- Replace the task `Advanced` tab with explicit semantic task workflow tabs.
- Keep task authoring split across task list, selected task editor, and evidence/validation column.
- Preserve existing draft callbacks, validation selectors, dirty protection, and manager-v2 route behavior.

## Impact

- UI-only refactor for manager-v2 environment editing.
- No gathering data schema changes.
- No new persistence or validation path.
