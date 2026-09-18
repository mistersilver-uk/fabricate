/**
 * The best-case salvage yield projection (issue 1695): what one row's salvage config could return,
 * per mode, and the identity those rows aggregate under. A plain leaf and deliberately NOT a
 * `.svelte.js` — it holds no rune, so a suite consuming it needs no `runeModules` entry. Both the
 * inspected panel's own preview and the bulk queue's aggregate read it, which is why it belongs to
 * neither store.
 */

/**
 * The identity a yield row aggregates under. Component IDENTITY, never its display
 * name: two distinct components can legitimately share a name (and do — a ladder
 * yielding same-named results collapsed them into one row, hiding real components
 * from the preview). Falls back to a name-derived key ONLY when a projection carries
 * no id at all, which keeps such a row visible instead of merging it into the first
 * nameless one.
 */
export function yieldKeyOf(entry) {
  const componentId = entry?.componentId;
  if (typeof componentId === 'string' && componentId !== '') return componentId;
  return `name:${String(entry?.name ?? '')}`;
}

/** Best-case one-unit-per-row yield contribution of a SIMPLE salvage config. */
export function simpleYieldRows(salvage) {
  const results = Array.isArray(salvage?.results) ? salvage.results : [];
  const guaranteed = salvage?.checkUsable !== true;
  return results.map((result) => {
    const quantity = Number(result?.quantity) || 0;
    return {
      componentId: result?.componentId ?? null,
      name: String(result?.name ?? ''),
      img: result?.img ?? null,
      quantity,
      guaranteedQuantity: guaranteed ? quantity : 0,
    };
  });
}

/**
 * Best-case one-unit-per-row yield contribution of a ROUTED salvage config
 * (Divergence 2). `quantity` is the MAX over SUCCESS outcomes only — a
 * `success: false` tier, or a success tier with no `outcomeRouting` entry,
 * contributes 0. `guaranteedQuantity` is the MIN across every (success) outcome,
 * but ONLY when none of the authored outcomes is a failure tier and the mode is
 * not `fixed`; otherwise it is 0 for every component, because the roll can always
 * land on the failure tier (relative) or miss every authored range (fixed).
 */
export function routedYieldRows(salvage) {
  const outcomes = Array.isArray(salvage?.routedOutcomes) ? salvage.routedOutcomes : [];
  const successOutcomes = outcomes.filter((outcome) => outcome?.success === true);
  const hasFailureTier = outcomes.some((outcome) => outcome?.success !== true);
  const guaranteedEligible =
    outcomes.length > 0 && !hasFailureTier && salvage?.routedType !== 'fixed';

  const quantityFor = (outcome, key) =>
    (outcome?.results || [])
      .filter((result) => yieldKeyOf(result) === key)
      .reduce((sum, result) => sum + (Number(result?.quantity) || 0), 0);

  const byKey = new Map();
  for (const outcome of successOutcomes) {
    for (const result of outcome.results || []) {
      const key = yieldKeyOf(result);
      if (!byKey.has(key)) {
        byKey.set(key, {
          componentId: result?.componentId ?? null,
          name: String(result?.name ?? ''),
          img: result?.img ?? null,
          quantity: 0,
          guaranteedQuantity: 0,
        });
      }
    }
  }
  for (const [key, row] of byKey) {
    row.quantity = Math.max(0, ...successOutcomes.map((outcome) => quantityFor(outcome, key)));
    if (guaranteedEligible) {
      row.guaranteedQuantity = Math.min(
        ...successOutcomes.map((outcome) => quantityFor(outcome, key))
      );
    }
  }
  return [...byKey.values()];
}

/**
 * Best-case one-unit-per-row yield contribution of a PROGRESSIVE salvage config
 * (Divergence 3): 1 per stage, always POSSIBLE (never guaranteed), and a stage
 * whose `threshold === null` is OMITTED entirely — unreachable at any budget.
 */
export function progressiveYieldRows(salvage) {
  const stages = Array.isArray(salvage?.stages) ? salvage.stages : [];
  const byKey = new Map();
  for (const stage of stages) {
    if (stage?.threshold === null) continue;
    const key = yieldKeyOf(stage);
    const row = byKey.get(key) ?? {
      componentId: stage?.componentId ?? null,
      name: String(stage?.name ?? ''),
      img: stage?.img ?? null,
      quantity: 0,
      guaranteedQuantity: 0,
    };
    row.quantity += 1;
    byKey.set(key, row);
  }
  return [...byKey.values()];
}

/**
 * One row's best-case yield contribution, dispatched by mode, from the row's OWN
 * `salvage.results` / `routedOutcomes` / `stages` — NEVER `store.orderedSalvageStages`,
 * which is scoped to the inspected card only.
 */
export function yieldRowsFor(salvage) {
  if (salvage?.mode === 'simple') return simpleYieldRows(salvage);
  if (salvage?.mode === 'routed') return routedYieldRows(salvage);
  if (salvage?.mode === 'progressive') return progressiveYieldRows(salvage);
  return [];
}
