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

// The tasks the player can see (and therefore select) for an environment:
// a blind site's revealed `discoveredTasks`, a targeted site's full `tasks`.
// Mirrors GatheringDetail's `activeTasks` derivation so the view's default
// task-selection and the right-column inspector agree on the list.
export function visibleTasksFor(environment) {
  if (!environment) return [];
  const list = environment.selectionMode === 'blind'
    ? environment.discoveredTasks
    : environment.tasks;
  return Array.isArray(list) ? list : [];
}

// Pure default task-selection for the right-column task inspector, the task
// analogue of resolveDefaultSelection:
//   - preserve `selectedTaskId` when a task with that id is still present (any
//     task — a deliberately-picked blocked task survives a re-fetch so the
//     player keeps viewing its requirements);
//   - otherwise default to the first attemptable task's `.id`;
//   - otherwise `null` (no tasks, or none currently attemptable).
export function resolveDefaultTaskSelection(tasks, selectedTaskId) {
  const list = Array.isArray(tasks) ? tasks : [];
  const stillValid = selectedTaskId !== null
    && selectedTaskId !== undefined
    && list.some(task => String(task?.id) === String(selectedTaskId));
  if (stillValid) return selectedTaskId;
  return list.find(task => task?.attemptable === true)?.id ?? null;
}
