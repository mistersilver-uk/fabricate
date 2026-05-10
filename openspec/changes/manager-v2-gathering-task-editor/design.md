# Design

## Data Shape

Reusable gathering task `dropRows` now normalize to:

- `dropRate`: integer drop chance from `0..100`.
- `quantity`: positive integer.
- `conditionModifiers.timeOfDay[]` and `conditionModifiers.weather[]`, each with `{ id, conditionId, value }`.

Modifier values are percentage-point adjustments. Runtime resolution adds matching weather and time modifiers to the base drop chance and clamps the final chance to `0..100`.

## UI

The edit route reuses the Manager V2 shell and right inspector. The main panel owns task identity, availability, and the drop-rule table. The right inspector edits the currently selected drop row and previews final chance for current conditions.

The editor updates through `updateGatheringLibraryTask`, preserving the existing store save path. Item drops call `services.importSingleManagedItemFromDrop(data)` and write the returned component id into the selected row.

## Rules Notice

Gathering Rules remain in Gathering Settings. When multiple rows share the selected component and current reward rules are not `allDrops`, the editor shows a notice that drop resolution may award only one matching row.
