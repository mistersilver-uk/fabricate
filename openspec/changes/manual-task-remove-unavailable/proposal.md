# Manual Task Removal Returns to Available

## Summary

Manual-mode task removal should no longer mark the task as locally excluded. In manual composition, tasks are available only when explicitly included or force-added, so removing an included task should clear the manual include/force lists and let the task return to its normal addable or unavailable state.

## Goals

- In manual task composition, `excludeEnvironmentRecord('task', id)` removes `id` from `enabledTaskIds` and `forcedTaskIds` without adding it to `disabledTaskIds`.
- Preserve automatic task exclusion semantics: automatic task exclusion still writes `disabledTaskIds` and renders `Excluded`.
- Preserve hazard exclusion semantics in both composition modes.
- Update manual task UI copy so included-task removal says `Remove`, not `Exclude`.
- Keep removed manual tasks visible in `Available to add` according to their normal `candidate`, `notMatching`, or `libraryDisabled` classification.

## Out of Scope

- Renaming internal store callbacks such as `onExclude` / `excludeEnvironmentRecord`.
- Migrating persisted environments that already contain manual-mode `disabledTaskIds`.
- Changing automatic task composition or hazard composition behavior.
