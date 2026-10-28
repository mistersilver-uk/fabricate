/**
 * The recipe Overview's routing rows: one scope per step as `ResolutionModeService` reads it, and
 * each scope's rows for `RoutingOverview`, read from `buildRoutingModel`. Pure; the card supplies
 * the copy. Pinned by `tests/routing-overview-rows.test.js`.
 */
import { shownAmount, toValue } from '../../../components/pickerRowKinds.js';
import { uniqueRowKeys } from '../../../components/resultRows.js';

const asArray = (value) => (Array.isArray(value) ? value : []);

/**
 * The scopes the overview draws, each `{ stepId, name, sets, groups, borrowed }`: the recipe with
 * no steps, a collapsed chain's final step, else every step. `groups` are
 * `ResolutionModeService._allResultGroups`, so a step with none borrows the recipe's.
 */
export function routingScopes(recipe, { collapsed = false } = {}) {
  const steps = asArray(recipe?.steps);
  const recipeGroups = asArray(recipe?.resultGroups);
  if (steps.length === 0) {
    const sets = asArray(recipe?.ingredientSets);
    return [{ stepId: null, name: '', sets, groups: recipeGroups, borrowed: false }];
  }
  return (collapsed ? steps.slice(-1) : steps).map((step) => {
    const own = asArray(step?.resultGroups);
    const borrowed = own.length === 0 && recipeGroups.length > 0;
    return {
      stepId: step.id,
      name: step.name || '',
      sets: asArray(step.ingredientSets),
      groups: own.length > 0 ? own : recipeGroups,
      borrowed,
    };
  });
}

const DEFAULT_HOWS = new Set(['fallback', 'single', 'name']);

/** A source row's value and markers: "default" only for an inherited, non-empty route. */
function sourceRow(key, entry, groups, extra) {
  return {
    kind: 'source',
    key,
    entry,
    value: groups[entry.targets[0]]?.id ?? '',
    fallback: entry.targets.length > 0 && DEFAULT_HOWS.has(entry.how),
    shared: entry.sharedCount > 1 ? entry.sharedCount : 0,
    ...extra,
  };
}

/** The row for one system tier: a source, or blocked by the policy before the minimum. */
function tierRow(tier, { model, groups, offered }) {
  const key = `tier:${tier.id}`;
  if (!offered.has(tier.id)) return { kind: 'blocked', key, tier, blocked: 'policy' };
  const entry = model.sources.find((source) => source.id === tier.id);
  if (entry.blockedReason === 'below-minimum') {
    return { kind: 'blocked', key, tier, entry, blocked: 'below-minimum' };
  }
  const forcedFailure = tier.success !== true && model.minimum != null;
  return sourceRow(key, entry, groups, { tier, forcedFailure });
}

const bounded = (tier) => tier.start !== null && tier.end !== null;

/**
 * Bounded tiers best first by `start` in `direction`, each gap where its `from` sorts among them,
 * then the null-bound tiers; `sort` is stable, so equal starts keep authored order.
 */
function orderTierRows(rows, gaps, direction) {
  const sign = direction === 'under' ? 1 : -1;
  const ranked = [
    ...rows.filter((row) => bounded(row.tier)).map((row) => ({ at: row.tier.start, row })),
    ...gaps.map((gap) => ({ at: gap.from, row: { kind: 'gap', key: `gap:${gap.from}`, gap } })),
  ].sort((a, b) => sign * (a.at - b.at));
  return [...ranked.map(({ row }) => row), ...rows.filter((row) => !bounded(row.tier))];
}

/**
 * The rows one scope draws, each `{ kind: 'source' | 'blocked' | 'gap', key }`. Sets come in
 * authored order. Under `check` every system tier in `tierRows` has a row, ordered by
 * {@link orderTierRows}; a tier outside `offeredIds` is blocked `'policy'`, and a success tier the
 * model holds below the minimum `'below-minimum'`. A source row carries `entry` (the model
 * source), the effective target's id as `value`, `fallback`, `shared` (above 1, else 0) and, on a
 * tier, `forcedFailure`.
 */
export function overviewRows({
  provider,
  model,
  scope,
  tierRows = [],
  offeredIds = [],
  gaps = [],
  direction = 'over',
}) {
  const groups = asArray(scope?.groups);
  if (provider === 'ingredientSet') {
    const setKeys = uniqueRowKeys(model.sources);
    return model.sources.map((entry, index) =>
      sourceRow(`set:${entry.id ? setKeys[index] : `#${index}`}`, entry, groups, { index })
    );
  }
  if (provider !== 'check') return [];
  const context = { model, groups, offered: new Set(offeredIds) };
  const rows = asArray(tierRows).map((tier) => tierRow(tier, context));
  return orderTierRows(rows, asArray(gaps), direction);
}

/** Each requirement's first alternative with its amount: "Steel Ingot ×2 · Oak Haft ×1". */
export function setSummary(set, nameOf) {
  return asArray(set?.ingredientGroups)
    .map((group) => asArray(group?.options)[0])
    .filter(Boolean)
    .map((option) => {
      const value = toValue(option);
      return `${nameOf(value)} ×${shownAmount(value.quantity)}`;
    })
    .join(' · ');
}
