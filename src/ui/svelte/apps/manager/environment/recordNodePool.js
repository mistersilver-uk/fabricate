/**
 * A task's per-environment resource-node pool, merged as `GatheringNodeService._mergeNodeConfigState`
 * merges it: the library config owns the capacity, and the environment's runtime entry contributes
 * only the live count, clamped to that capacity. Events have no nodes. Read by the rail's read-only
 * count and by a composition row's node Stepper, so the two cannot disagree (issue 1522).
 */
export function recordNodePool(kind, entry, environment) {
  const config = kind === 'task' ? entry?.record?.nodes || null : null;
  const runtime = environment?.nodeRuntime?.[entry?.id] || null;
  const max = Number(config?.max ?? runtime?.max ?? 0);
  const stored = Number(runtime?.current);
  const configured = Number(config?.current);
  let current = max;
  if (Number.isFinite(stored)) current = Number.isFinite(max) ? Math.min(stored, max) : stored;
  else if (Number.isFinite(configured)) current = configured;
  return {
    config,
    max,
    current: Math.max(0, current),
    hasNodes: kind === 'task' && Number.isFinite(max) && max > 0,
    // Permanently depletable: the runtime's restock is a no-op for it (issue 301).
    nonRegenerating: config?.respawn?.policy === 'nonRegenerating',
  };
}
