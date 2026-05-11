# Design

## Data Shape

Reusable gathering task `dropRows` now normalize to:

- `dropRate`: integer drop chance from `0..100`.
- `quantity`: positive integer.
- `conditionModifiers.timeOfDay[]` and `conditionModifiers.weather[]`, each with `{ id, conditionId, value }`.

Modifier values are percentage-point adjustments. Runtime resolution adds matching weather and time modifiers to the base drop chance and clamps the final chance to `0..100`.

## UI

The edit route reuses the Manager V2 shell and right inspector. The main panel owns task identity, availability, and the drop-rule table. The right inspector edits the currently selected drop row and previews final chance for current conditions.

The central editor is split into a task identity card, a compact task availability card, and a drop rules section. Task availability controls whether the task can be attempted; per-drop condition modifiers remain scoped to individual drop rows. Gathering modifiers affect the d100 roll and are not part of final drop chance.

Drop rows can be resolved or unresolved. A resolved row shows component image/name/reference, chance, quantity, modifier chips, and row actions. An unresolved row shows a compact dashed drop zone plus a create/select affordance. Adding a row creates an unresolved disabled row and selects it so the right inspector can finish configuration; assigning or importing a component resolves and enables that row.

Modifier presentation uses the Manager V2 status palette: positive values use subtle success styling, negative values use subtle danger styling, and zero/unspecified values remain muted. The final chance preview shows current time/weather, base chance, matching modifier lines, and a clamped final chance.

The editor updates through `updateGatheringLibraryTask`, preserving the existing store save path. Item drops call `services.importSingleManagedItemFromDrop(data)` and write the returned component id into the selected row.

Task editor fields use the Manager V2 library immediate-save convention: field edits call the store update path directly and the Back to task library control returns to the browser. The table keeps chance and quantity inline for fast scan-and-tune edits, while the right inspector owns detailed component assignment, modifier editing, and final chance diagnostics.

Rendered validation should cover both a normal desktop manager window and a narrow manager width where the editor table stacks before columns become unreadable.

## Rules Notice

Gathering Rules remain in Gathering Settings. When multiple rows share the selected component and current reward rules are not `allDrops`, the editor shows a notice that drop resolution may award only one matching row.
