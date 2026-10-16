/**
 * The Journal's four run kinds in filter order, and which kind a projected run is. The store
 * filters by them and the kind filter draws and counts them, so both read this one list.
 */
export const RUN_KINDS = Object.freeze(['crafting', 'gathering', 'salvage', 'alchemy']);

/** A run's kind: alchemy is a crafting run's `activityKind`, the others its `runType`. */
export function runActivityKind(run) {
  return run?.activityKind ?? run?.runType ?? 'crafting';
}

/** How many of `runs` are of each kind, every kind present and zero when it has none. */
export function countRunsByKind(runs) {
  const counts = Object.fromEntries(RUN_KINDS.map((kind) => [kind, 0]));
  for (const run of Array.isArray(runs) ? runs : []) {
    const kind = runActivityKind(run);
    if (Object.hasOwn(counts, kind)) counts[kind] += 1;
  }
  return counts;
}
