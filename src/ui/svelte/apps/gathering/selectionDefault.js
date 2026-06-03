// Pure default-selection decision for the player gathering Environments column.
//
// Extracted from GatheringView so the re-fetch "keep a still-valid selection"
// guard and the "all locked -> null" arm are unit-testable without a mount.
//
// Given the freshly fetched environment list and the caller's current
// selection, resolve the selection that should be applied after the load:
//   - preserve `selectedId` when it points at a non-locked env still present in
//     the list (do not clobber a deliberate user choice on re-fetch);
//   - otherwise default to the first env with `locked !== true` (its `.id`);
//   - otherwise `null` (empty list, or every env locked).
//
// A still-valid selection must be non-locked: a `selectedId` pointing at a
// now-locked or absent env falls through to the first selectable env.
export function resolveDefaultSelection(environments, selectedId) {
  const list = Array.isArray(environments) ? environments : [];
  const stillValid = selectedId !== null
    && list.some(environment => environment?.id === selectedId && environment?.locked !== true);
  if (stillValid) return selectedId;
  return list.find(environment => environment?.locked !== true)?.id ?? null;
}
