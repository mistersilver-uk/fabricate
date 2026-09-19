/**
 * The essence block: every `match.type === 'essence'` option in one ingredient set, funded jointly
 * from the stacks the component/tag groups left in the ledger (issue 917).
 */
import { getFabricateFlag } from '../config/flags.js';
import { clampAllocation, deliveredEssences, greedyAllocate } from '../utils/essenceAllocation.js';

import { itemKeyOf, seedRemaining as seedRemainingDefault } from './ingredientLedger.js';

/**
 * The essence resolver the selection paths use: the caller-supplied probe, or the flag-only default
 * that keeps the no-probe craftability and display path byte-for-byte.
 */
export function essenceResolverFor(resolveItemEssences) {
  return typeof resolveItemEssences === 'function'
    ? resolveItemEssences
    : (item) => getFabricateFlag(item, 'essences', {});
}

/** One essence requirement's membership of the set's essence block. */
export function essenceBlockMember(group, option) {
  return {
    group,
    option,
    groupId: group?.id ?? null,
    essenceId: String(option?.match?.essenceId || '').trim(),
    need: Math.max(0, Number(option?.match?.amount) || 0),
  };
}

/** Whether an essence requirement could be funded by any assignment of the untouched ledger. */
export function essenceMemberIsFundable(member, essence) {
  if (!member.essenceId || member.need <= 0) return true;
  if (!essence) return true;
  return (essence.ceiling.get(member.essenceId) ?? 0) >= member.need;
}

/** Whether `option` is an essence option this ledger could still fund. */
export function isFundableEssenceOption(option, group, essence) {
  if (option?.match?.type !== 'essence') return false;
  return essenceMemberIsFundable(essenceBlockMember(group, option), essence);
}

/** The needed essences one stack carries per unit, or null when it carries none of them. */
function neededPerUnit(essences, neededIds) {
  const perUnit = {};
  for (const essenceId of neededIds) {
    const amount = Number(essences?.[essenceId]) || 0;
    if (amount > 0) perUnit[essenceId] = amount;
  }
  return Object.keys(perUnit).length > 0 ? perUnit : null;
}

/**
 * The essence half of the pass index: the stacks that could ever fund this set's essence block, and
 * the ceiling each essence id can deliver from them.
 */
export function buildEssenceIndex(
  availableItems,
  essenceOptions,
  ctx,
  { seedRemaining = seedRemainingDefault } = {}
) {
  const essenceIds = new Set(essenceOptions.map((member) => member.essenceId).filter(Boolean));
  if (essenceOptions.length === 0) return null;

  const seeded = seedRemaining(availableItems);
  const resolveEssences = ctx?.resolveEssences;
  const carriers = [];
  const ceiling = new Map();
  const seen = new Set();

  for (const item of availableItems) {
    const itemKey = itemKeyOf(item);
    if (seen.has(itemKey)) continue;
    seen.add(itemKey);

    const essences = (resolveEssences ? resolveEssences(item) : null) || {};
    const perUnit = neededPerUnit(essences, essenceIds);
    if (!perUnit) continue;

    carriers.push({ itemKey, item, perUnit });
    const units = Number(seeded.get(itemKey) || 0);
    for (const [essenceId, amount] of Object.entries(perUnit)) {
      ceiling.set(essenceId, (ceiling.get(essenceId) ?? 0) + amount * units);
    }
  }

  return {
    carriers,
    ceiling,
    carrierKeys: contendedCarrierKeys(carriers, essenceOptions, ceiling),
  };
}

/** The carrier stacks a component/tag group can actually contend with the block for. */
function contendedCarrierKeys(carriers, essenceOptions, ceiling) {
  const liveIds = new Set(
    essenceOptions
      .filter((member) => essenceMemberIsFundable(member, { ceiling }))
      .map((member) => member.essenceId)
      .filter(Boolean)
  );
  return new Set(
    carriers
      .filter((carrier) => Object.keys(carrier.perUnit).some((id) => liveIds.has(id)))
      .map((carrier) => carrier.itemKey)
  );
}

/**
 * Resolve the set's essence block: the requirements this branch took, funded jointly from what the
 * component/tag groups left in `remaining`.
 */
export function resolveEssenceBlock(members, availableItems, remaining, ctx) {
  if (!Array.isArray(members) || members.length === 0) {
    return {
      ok: true,
      members: [],
      requirements: [],
      carriers: [],
      allocation: {},
      suggested: {},
      delivered: {},
      plan: [],
    };
  }

  const carriers = essenceCarriers(
    members,
    availableItems,
    remaining,
    ctx.resolveEssences,
    ctx.index
  );
  const availableUnits = Object.fromEntries(
    carriers.map((carrier) => [carrier.itemKey, carrier.ownedUnits])
  );
  // A ctx that arrives without a strategy still allocates: the default is applied here as well as
  // at the public entry point.
  const allocate = typeof ctx.allocate === 'function' ? ctx.allocate : greedyAllocate;
  const suggested = allocate(members, carriers, availableUnits);
  const allocation = ctx.essenceAllocation
    ? clampAllocation(ctx.essenceAllocation, availableUnits)
    : suggested;
  const delivered = deliveredEssences(allocation, carriers);
  const requirements = partitionBlock(members, carriers, delivered);

  return {
    ok: requirements.every((requirement) => requirement.satisfied),
    members,
    requirements,
    carriers,
    allocation,
    suggested,
    delivered,
    plan: essenceBlockPlan(members, carriers, allocation),
  };
}

/**
 * The stacks that can fund the block: every item `remaining` still holds units of that carries at
 * least one essence the block needs, deduped by item key.
 */
function essenceCarriers(members, availableItems, remaining, resolveEssences, index = null) {
  const neededIds = new Set(members.map((member) => member.essenceId).filter(Boolean));
  return index?.essence
    ? indexedEssenceCarriers(index.essence.carriers, remaining, neededIds)
    : scannedEssenceCarriers(availableItems, remaining, resolveEssences, neededIds);
}

/** Carriers read off the pass index (issue 1083), which re-reads only the ledger per terminal. */
function indexedEssenceCarriers(indexedCarriers, remaining, neededIds) {
  return indexedCarriers.flatMap((carrier) => {
    const ownedUnits = Number(remaining.get(carrier.itemKey) || 0);
    if (ownedUnits <= 0) return [];
    const perUnit = neededPerUnit(carrier.perUnit, neededIds);
    if (!perUnit) return [];
    return [{ itemKey: carrier.itemKey, item: carrier.item, perUnit, ownedUnits }];
  });
}

/** Carriers found by probing the held stacks, for a resolution running without a pass index. */
function scannedEssenceCarriers(availableItems, remaining, resolveEssences, neededIds) {
  const carriers = [];
  const seen = new Set();

  for (const item of availableItems) {
    const itemKey = itemKeyOf(item);
    if (seen.has(itemKey)) continue;
    seen.add(itemKey);

    const ownedUnits = Number(remaining.get(itemKey) || 0);
    if (ownedUnits <= 0) continue;

    const essences = (resolveEssences ? resolveEssences(item) : null) || {};
    const perUnit = neededPerUnit(essences, neededIds);
    if (!perUnit) continue;

    carriers.push({ itemKey, item, perUnit, ownedUnits });
  }

  return carriers;
}

/**
 * Attribute what the block delivered across its requirements, per essence id: the requirements
 * naming an id settle in author order, each taking `min(need, remaining delivered of that id)`.
 */
function partitionBlock(members, carriers, delivered) {
  const unassigned = new Map(Object.entries(delivered));
  const owned = new Map();
  for (const carrier of carriers) {
    for (const [essenceId, perUnit] of Object.entries(carrier.perUnit)) {
      owned.set(essenceId, (owned.get(essenceId) ?? 0) + perUnit * carrier.ownedUnits);
    }
  }

  return members.map((member) => {
    const { essenceId, need } = member;
    // A blank essence id or a non-positive amount is a runtime no-op, satisfied with nothing
    // consumed, exactly as the pre-block per-option builder treated it.
    const degenerate = !essenceId || need <= 0;
    const pool = unassigned.get(essenceId) ?? 0;
    const take = degenerate ? 0 : Math.min(need, pool);
    if (take > 0) unassigned.set(essenceId, pool - take);
    return {
      groupId: member.groupId,
      essenceId,
      need,
      delivered: take,
      owned: owned.get(essenceId) ?? 0,
      satisfied: degenerate || take >= need,
    };
  });
}

/**
 * The block's consumption plan: at most one entry per item key, whose `quantity` is the units the
 * allocation draws from that stack.
 */
function essenceBlockPlan(members, carriers, allocation) {
  const plan = [];
  for (const carrier of carriers) {
    const units = Number(allocation?.[carrier.itemKey]) || 0;
    if (units <= 0) continue;
    const funded = members.filter((member) => (Number(carrier.perUnit[member.essenceId]) || 0) > 0);
    if (funded.length === 0) continue;
    plan.push({
      item: carrier.item,
      quantity: units,
      // The first funded option, retained for the back-compat readers that key off
      // `entry.ingredient`.
      ingredient: funded[0].option,
      essenceGroupIds: funded.map((member) => member.groupId).filter(Boolean),
    });
  }
  return plan;
}

/**
 * Project a resolved block into the read-side pool model the crafting surfaces render: what each
 * requirement needed and got, what each carrier holds and contributes, and the allocation tying them.
 */
export function essencePoolFrom(block) {
  if (!block || block.members.length === 0) return null;
  return {
    requirements: block.requirements,
    carriers: block.carriers.map((carrier) => ({
      itemKey: carrier.itemKey,
      item: carrier.item,
      perUnit: carrier.perUnit,
      ownedUnits: carrier.ownedUnits,
      allocatedUnits: Number(block.allocation?.[carrier.itemKey]) || 0,
    })),
    allocation: block.allocation,
    suggested: block.suggested,
    totals: block.delivered,
  };
}
