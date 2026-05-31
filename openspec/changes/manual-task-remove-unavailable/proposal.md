# Manual Composition Removal Returns to Available

## Summary

Manual-mode task and hazard removal should no longer mark the record as locally excluded. In manual composition, records are available only when explicitly included or force-added, so removing an included task or hazard should clear the manual include/force lists and let the record return to its normal addable or unavailable state.

## Goals

- In manual composition, `excludeEnvironmentRecord(kind, id)` removes `id` from the matching `enabled*Ids` and `forced*Ids` lists without adding it to `disabled*Ids`.
- Preserve automatic exclusion semantics: automatic task/hazard exclusion still writes `disabled*Ids` and renders `Excluded`.
- Update manual task and hazard UI copy so included-record removal says `Remove`, not `Exclude`.
- Keep removed manual records visible in `Available to add` according to their normal `candidate`, `notMatching`, or `libraryDisabled` classification.

## Out of Scope

- Renaming internal store callbacks such as `onExclude` / `excludeEnvironmentRecord`.
- Renaming internal store callbacks such as `onExclude` / `excludeEnvironmentRecord`.
- Migrating persisted environments that already contain manual-mode `disabledTaskIds` or `disabledHazardIds`.
- Changing automatic composition behavior.
