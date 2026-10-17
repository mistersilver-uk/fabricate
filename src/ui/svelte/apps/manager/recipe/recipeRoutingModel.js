/**
 * The recipe editor's one reading of result routing, mirroring `ResolutionModeService`: each
 * offered source with the groups it effectively awards, the sources reaching each group, and each
 * group's picker options. Groups are addressed by index, because an id-less draft group still needs
 * options. Pinned against the engine by `tests/recipe-routing-model.test.js`.
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
 * Whether a fixed check's minimum blocks `tier`, comparing `start` in the check's direction as
 * `checkRouting.minSuccessTierFailed` does. A minimum with no `start` (stale, or a relative check)
 * blocks nothing, and a tier with none is blocked, since no roll can match it.
 */
function belowMinimum(tier, minimum, direction) {
  const required = Number(minimum?.start);
  if (!Number.isFinite(required)) return false;
  const start = Number(tier.start);
  if (!Number.isFinite(start)) return true;
  return direction === 'under' ? start > required : start < required;
}

/** The groups a tier awards, or the reason it awards none (`_resolveRoutedByCheckResultGroups`). */
function tierRoute(tier, groups, { anyListed, minimum, direction }) {
  if (belowMinimum(tier, minimum, direction)) return [[], null, 'below-minimum'];
  const listed = groups.findIndex((group) => listedTiers(group).includes(tier.id));
  if (listed !== -1) return [[listed], 'explicit', null];
  if (anyListed) return [[], null, 'unrouted-tier'];
  if (tier.success === false) return [[], null, 'failure-unassigned'];
  if (isFailKeyword(tier.name) || isMissKeyword(tier.name)) return [[], null, 'reserved-name'];
  if (groups.length === 1) return [[0], 'single', null];
  const [named] = matchResultGroupsByName(tier.name, groups, { firstOnly: true });
  return named ? [[groups.indexOf(named)], 'name', null] : [[], null, 'no-name-match'];
}

function tierSources(tiers, groups, minSuccessOutcomeId, direction) {
  const context = {
    anyListed: groups.some((group) => listedTiers(group).length > 0),
    minimum: minSuccessOutcomeId ? tiers.find((tier) => tier.id === minSuccessOutcomeId) : null,
    direction,
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

/** Today's picker options for the group at `index`: a set or tier claimed by another is disabled. */
function optionsFor(index, { provider, sets, groups, tiers, setName }) {
  const group = groups[index];
  if (provider === 'ingredientSet') {
    return sets.map((set, i) => ({
      id: set?.id,
      name: setName(set, i),
      disabled: !!set?.resultGroupId && set.resultGroupId !== group?.id,
    }));
  }
  if (provider !== 'check') return [];
  const elsewhere = new Set(groups.flatMap((other, i) => (i === index ? [] : listedTiers(other))));
  return tiers.map((tier) => ({ id: tier.id, name: tier.name, disabled: elsewhere.has(tier.id) }));
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
 * `tiers` are the policy-offered `{ id, name, success, start? }` tiers, `start` read only under a
 * `minSuccessOutcomeId` in the fixed check's `direction`. Returns `sources`, `inbound` (each
 * group's effective sources), `unreachable` (non-failure groups no source reaches), `unassigned`
 * and `routingOptionsFor(index)`. A set's `targetId` is its claimed `resultGroupId`, else the id of
 * its first target.
 */
export function buildRoutingModel({
  provider = null,
  ingredientSets = [],
  resultGroups = [],
  tiers = [],
  setName = () => '',
  minSuccessOutcomeId = null,
  direction = 'over',
} = {}) {
  const sets = asArray(ingredientSets);
  const groups = asArray(resultGroups);
  const offered = asArray(tiers).filter((tier) => typeof tier?.id === 'string' && tier.id);
  let sources = [];
  if (provider === 'ingredientSet') {
    sources = sets.map((set, index) => setSource(set, index, groups, setName));
  } else if (provider === 'check') {
    sources = tierSources(offered, groups, minSuccessOutcomeId, direction);
  }
  const inbound = groups.map(() => []);
  for (const entry of sources) for (const target of entry.targets) inbound[target].push(entry);
  for (const entry of sources) {
    entry.sharedCount = Math.max(0, ...entry.targets.map((target) => inbound[target].length));
  }
  const routed = provider === 'ingredientSet' || provider === 'check';
  const scope = { provider, sets, groups, tiers: offered, setName };
  return {
    sources,
    inbound,
    unreachable: routed
      ? indexesWhere(groups, (group, i) => group?.role !== 'failure' && inbound[i].length === 0)
      : [],
    unassigned: unassignedIndexes(provider, sets, groups, offered),
    routingOptionsFor: (index) => optionsFor(index, scope),
  };
}
