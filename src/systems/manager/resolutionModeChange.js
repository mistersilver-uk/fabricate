/**
 * The checks a resolution-mode change runs before its first write (`destructive-changes-and-
 * migrations` § Change Crafting System Resolution Mode): the active-run refusal for a change into
 * or out of `iterative`, and the crafting-check slot move. The run count is a check, not a lock: a
 * start whose `createRun` is still in flight is uncounted.
 */

const PASS_FAIL_CARRIED_FIELDS = Object.freeze([
  'dc',
  'thresholdMode',
  'tiers',
  'dcMode',
  'macroUuid',
  'checkBreakage',
  'evaluation',
  'offerSituationalBonus',
  'advantage',
]);

/**
 * `{ [systemId]: count }` over the active crafting runs of `actors` (world actors), read as
 * cached: it never calls `invalidateCache()`, which drops every write baseline. It does re-record
 * each actor's baseline, as every `getActiveRuns` reader does.
 */
export function activeRunCountsBySystem(runManager, actors) {
  const counts = new Map();
  for (const actor of actors ?? []) {
    for (const run of runManager?.getActiveRuns?.(actor) ?? []) {
      const systemId = run?.craftingSystemId;
      if (systemId) counts.set(String(systemId), (counts.get(String(systemId)) ?? 0) + 1);
    }
  }
  return Object.fromEntries(counts);
}

export function activeSystemRunCount(runManager, actors, systemId) {
  const counts = activeRunCountsBySystem(runManager, actors);
  return Object.hasOwn(counts, systemId) ? counts[systemId] : 0;
}

/**
 * `{ reason: 'modeChangeRunsActive', count, direction }` for a change into or out of `iterative`
 * while `count` runs are active, else `null`.
 */
export function modeChangeRunRefusal({ fromMode, toMode, count }) {
  if (fromMode === toMode || !(count > 0)) return null;
  if (fromMode !== 'iterative' && toMode !== 'iterative') return null;
  return {
    reason: 'modeChangeRunsActive',
    count,
    direction: toMode === 'iterative' ? 'into' : 'out',
  };
}

const RUNS_IN_PROGRESS = Object.freeze({
  into: { one: 'the crafting run in progress is', many: 'crafting runs in progress are' },
  out: { one: 'the workpiece in progress is', many: 'workpieces in progress are' },
});

/** The one sentence a run refusal shows, which the store notifies and Crafting Settings draws. */
export function modeChangeRunsMessage({ count, direction }) {
  const subject = RUNS_IN_PROGRESS[direction === 'into' ? 'into' : 'out'];
  const phrase = count === 1 ? subject.one : `the ${count} ${subject.many}`;
  return `Blocked until ${phrase} finished or cancelled.`;
}

/**
 * Refuse a mode change across `iterative` while `merged`'s system has an active run, throwing an
 * `Error` carrying the refusal's fields, then move the crafting-check slot in place. It must run
 * before the change's first write.
 */
export function prepareModeChange(merged, fromMode, toMode, { runManager, actors }) {
  const count = activeSystemRunCount(runManager, actors, merged?.id);
  const refusal = modeChangeRunRefusal({ fromMode, toMode, count });
  if (refusal) throw Object.assign(new Error(modeChangeRunsMessage(refusal)), refusal);
  reconcileCraftingCheckSlots(merged?.craftingCheck, fromMode, toMode);
}

/**
 * Move the pass/fail check config across the `routedByIngredients` boundary: `routed` to `simple`
 * into it, and `simple` to `routed` out of it into `routedByCheck` or `iterative`, which roll
 * `routed`. Only an unauthored destination is filled.
 */
function reconcileCraftingCheckSlots(check, fromMode, toMode) {
  if (!check || typeof check !== 'object') return;
  if (toMode === 'routedByIngredients' && fromMode !== 'routedByIngredients') {
    copyPassFailCheckFields(check.routed, check.simple);
  } else if (
    fromMode === 'routedByIngredients' &&
    (toMode === 'routedByCheck' || toMode === 'iterative')
  ) {
    copyPassFailCheckFields(check.simple, check.routed);
  }
}

/** Copy the formula and its carried fields from a slot with a `rollFormula` to one without. */
function copyPassFailCheckFields(source, destination) {
  if (!source || typeof source !== 'object' || !destination || typeof destination !== 'object') {
    return;
  }
  const sourceFormula = typeof source.rollFormula === 'string' ? source.rollFormula.trim() : '';
  if (sourceFormula.length === 0) return;
  const destFormula =
    typeof destination.rollFormula === 'string' ? destination.rollFormula.trim() : '';
  if (destFormula.length > 0) return;

  destination.rollFormula = source.rollFormula;
  for (const key of PASS_FAIL_CARRIED_FIELDS) {
    if (key in source) destination[key] = structuredClone(source[key]);
  }
}
