/**
 * The recipe editor's one reading of result routing, mirroring `ResolutionModeService`: each
 * offered source with the groups it effectively awards, and the sources reaching each group.
 * Groups are addressed by index, because an id-less draft group is still a target.
 * Pinned against the engine by `tests/recipe-routing-model.test.js`.
 */
import {
  isFailKeyword,
  isMissKeyword,
  matchResultGroupsByName,
} from '../../../../../utils/routedOutcomeKeywords.js';

const asArray = (value) => (Array.isArray(value) ? value : []);
const listedTiers = (group) => asArray(group?.checkOutcomeIds);

const indexesWhere = (groups, predicate) =>
  groups.flatMap((group, index) => (predicate(group, index) ? [index] : []));

function source(base, targets, how, blockedReason = null) {
  return { ...base, targets, how, blockedReason, sharedCount: 0 };
}

/** `_routeByIngredientSet`: the set's `resultGroupId`, else its `resultMapping`, else group 0. */
function setSource(set, index, groups, setName) {
  const base = { id: set?.id ?? null, kind: 'ingredientSet', name: setName(set, index) };
  const mappedId = set?.resultGroupId || null;
  if (mappedId) {
    const targets = indexesWhere(groups, (group) => group?.id === mappedId);
    const blocked = targets.length > 0 ? null : 'missing-target';
    return source({ ...base, targetId: mappedId }, targets, 'explicit', blocked);
  }
  const mapping = asArray(set?.resultMapping);
  if (mapping.length > 0) {
    const targets = indexesWhere(groups, (group) => mapping.includes(group?.id));
    const blocked = targets.length > 0 ? null : 'missing-target';
    return source({ ...base, targetId: null }, targets, 'fallback', blocked);
  }
  const targets = groups.length > 0 ? [0] : [];
  const blocked = targets.length > 0 ? null : 'no-result-set';
  return source({ ...base, targetId: null }, targets, 'fallback', blocked);
}

/**
 * Whether a fixed check's minimum blocks a success tier, comparing `start` in the check's direction
 * as `checkRouting.minSuccessTierFailed` does. A forced failure skips that gate, so a failure tier
 * is never blocked, and a non-finite `start` never blocks.
 */
function belowMinimum(tier, start, minimum, direction) {
  if (tier.success !== true || !minimum || !Number.isFinite(start)) return false;
  return direction === 'under' ? start > minimum.start : start < minimum.start;
}

/** The groups a tier awards, or the reason it awards none (`_resolveRoutedByCheckResultGroups`). */
function tierRoute(tier, groups, { anyListed, minimum, direction, startOf }) {
  if (belowMinimum(tier, startOf(tier.id), minimum, direction)) return [[], null, 'below-minimum'];
  const listed = groups.findIndex((group) => listedTiers(group).includes(tier.id));
  if (listed !== -1) return [[listed], 'explicit', null];
  if (anyListed) return [[], null, 'unrouted-tier'];
  if (tier.success === false) return [[], null, 'failure-unassigned'];
  if (isFailKeyword(tier.name) || isMissKeyword(tier.name)) return [[], null, 'reserved-name'];
  if (groups.length === 1) return [[0], 'single', null];
  const [named] = matchResultGroupsByName(tier.name, groups, { firstOnly: true });
  return named ? [[groups.indexOf(named)], 'name', null] : [[], null, 'no-name-match'];
}

/** The minimum success tier among `rankedTiers`, located only with a finite raw `start`. */
function locateMinimum(rankedTiers, minSuccessOutcomeId) {
  if (!minSuccessOutcomeId) return null;
  const found = rankedTiers.find((tier) => tier?.id === minSuccessOutcomeId);
  return found && Number.isFinite(found.start) ? found : null;
}

function tierSources(tiers, groups, { minimum, rankedTiers, direction }) {
  const context = {
    anyListed: groups.some((group) => listedTiers(group).length > 0),
    minimum,
    direction,
    startOf: (id) => rankedTiers.find((tier) => tier?.id === id)?.start,
  };
  return tiers.map((tier) => {
    const [targets, how, blockedReason] = tierRoute(tier, groups, context);
    const base = { id: tier.id, kind: 'tier', name: tier.name };
    return source(
      { ...base, targetId: groups[targets[0]]?.id ?? null },
      targets,
      how,
      blockedReason
    );
  });
}

/** The groups that claim no offered source: the authoring claim the readiness warning reads. */
function unassignedIndexes(provider, sets, groups, tiers) {
  if (provider === 'check') {
    const offered = new Set(tiers.map((tier) => tier.id));
    return indexesWhere(groups, (group) => listedTiers(group).every((id) => !offered.has(id)));
  }
  if (provider !== 'ingredientSet') return [];
  const claimed = (group) =>
    sets.some((set) => set?.resultGroupId && set.resultGroupId === group?.id);
  return indexesWhere(groups, (group) => !claimed(group));
}

/**
 * `provider` is `'ingredientSet'`, `'check'` or `null`, and `tiers` the policy-offered
 * `{ id, name, success }` options. `minSuccessOutcomeId` blocks fixed success tiers below it,
 * reading `start` by id from `rankedTiers` (every system tier, defaulting to `tiers`) in the
 * check's `direction` (`'over'` or `'under'`); {@link routedMinimum} supplies both.
 *
 * - `sources`: one per set or offered tier, each `{ id, kind, name, targets, targetId, how,
 *   blockedReason, sharedCount }`. `targets` are group indexes, `how` is `explicit`, `fallback`,
 *   `single` or `name`, and a source awarding nothing has `how: null` or an empty `targets` with a
 *   `blockedReason`. A set's `targetId` is its claimed `resultGroupId` (even a dangling one) and
 *   null otherwise, and a tier's is its first target's id.
 * - `sharedCount`: the sources reaching the source's target, itself included, taking the largest
 *   across several targets and `0` with none. It is shared when above 1.
 * - `inbound`: each group's effective sources, parallel to `resultGroups`.
 * - `unreachable`: the non-`failure`-role groups no source reaches, defined only for a routed
 *   provider, so it is empty under `null`.
 * - `unassigned`: the groups that claim no offered source, failure-role ones included.
 * - `minimum`: the located minimum tier, or `null`.
 */
export function buildRoutingModel({
  provider = null,
  ingredientSets = [],
  resultGroups = [],
  tiers = [],
  rankedTiers = tiers,
  setName = () => '',
  minSuccessOutcomeId = null,
  direction = 'over',
} = {}) {
  const sets = asArray(ingredientSets);
  const groups = asArray(resultGroups);
  const offered = asArray(tiers).filter((tier) => typeof tier?.id === 'string' && tier.id);
  const ranked = asArray(rankedTiers);
  const minimum = provider === 'check' ? locateMinimum(ranked, minSuccessOutcomeId) : null;
  let sources = [];
  if (provider === 'ingredientSet') {
    sources = sets.map((set, index) => setSource(set, index, groups, setName));
  } else if (provider === 'check') {
    sources = tierSources(offered, groups, { minimum, rankedTiers: ranked, direction });
  }
  const inbound = groups.map(() => []);
  for (const entry of sources) for (const target of entry.targets) inbound[target].push(entry);
  for (const entry of sources) {
    entry.sharedCount = Math.max(0, ...entry.targets.map((target) => inbound[target].length));
  }
  const routed = provider === 'ingredientSet' || provider === 'check';
  return {
    sources,
    inbound,
    unreachable: routed
      ? indexesWhere(groups, (group, i) => group?.role !== 'failure' && inbound[i].length === 0)
      : [],
    unassigned: unassignedIndexes(provider, sets, groups, offered),
    minimum,
  };
}

/**
 * The minimum inputs {@link buildRoutingModel} takes for a recipe: its `minSuccessOutcomeId` under
 * `routedByCheck` only, as `_runRoutedCheck` gates it, and the check's direction, restating
 * `checkRouting.sumGrading` (pinned by `tests/recipe-routing-model.test.js`).
 */
export function routedMinimum({ resolutionMode, minSuccessOutcomeId, evaluation }) {
  const sum = (evaluation?.product ?? 'sum') === 'sum';
  return {
    minSuccessOutcomeId: resolutionMode === 'routedByCheck' ? (minSuccessOutcomeId ?? null) : null,
    direction: sum && evaluation?.direction === 'under' ? 'under' : 'over',
  };
}
