/**
 * The Pooled Holdings Read: `game.fabricate.readPooledHoldings` (issue 1342), what a set of
 * characters holds between them, so a companion never composes a sum Fabricate cannot promise.
 * Writes nothing and is not a reservation: a caller that must not overdraw reads the consume's
 * refusal. `null` means Fabricate cannot see and `0` that it can prove none, so a `macro` world
 * with no `balance` macro answers `null` for currency and blocks nothing else.
 * Components are counted through the published `findComponentItems` and `readStackQuantity`,
 * the matcher and reader the consume drains through; that matcher is case-sensitive and tiered
 * all-or-nothing. Cost names resolve through `definitionIndex`'s silent `findByName`, so they never
 * feed the issue 540 telemetry; `findComponentItems`' item-name fallback still reports, deduped
 * per session.
 * The facade owns GM, readiness, UUID resolution and the `noActor`/`invalidActorUuids` split;
 * this keeps a fail-closed floor. A Foundry-free leaf: everything arrives as a seam.
 */

import { classifyGatheringToolStates } from '../gatheringToolRuntime.js';
import { findById, findByName, getDefinitionIndex } from '../utils/definitionIndex.js';

import {
  COMPANION_OUTCOMES,
  POOLED_ACTORS_MAX,
  POOLED_COSTS_MAX,
  POOLED_COST_TYPES,
  POOLED_TOOL_STATES,
  POOLED_UNSERVED_COST_TYPES,
  pooledHoldingsReadResult,
} from './companionContract.js';
import { readPooledCurrencyBalance, resolveWorldCurrencyUnitByName } from './currencyAffordance.js';
import { readStackQuantity } from './itemStackQuantity.js';
import { pooledItemOrder } from './pooledAllocation.js';
import { resolvedComponentsFor, resolvedToolsFor } from './scopedEntityReads.js';

/**
 * The closed key set of one cost; a tool carries a quantity it cannot spend so one list serves
 * every axis. `{ type, name, quantity: undefined }` is well-formed with a refused quantity.
 */
const POOLED_COST_KEYS = Object.freeze(['type', 'name', 'quantity']);

/** A whole positive quantity (a numeric string included) or `null`; never rounded. */
function normalizePooledQuantity(value) {
  const numeric =
    typeof value === 'number' || (typeof value === 'string' && value.trim() !== '')
      ? Number(value)
      : NaN;
  return Number.isSafeInteger(numeric) && numeric > 0 ? numeric : null;
}

/** Own keys only: `key in entry` would admit a `quantity` inherited from a prototype. */
function isPooledCost(entry) {
  if (!entry || typeof entry !== 'object' || Array.isArray(entry)) return false;
  const keys = Object.keys(entry);
  return (
    keys.length === POOLED_COST_KEYS.length &&
    POOLED_COST_KEYS.every((key) => Object.hasOwn(entry, key))
  );
}

/** The `costs` list, or `null` to refuse `invalidCosts`: an empty list refuses. */
function validatePooledCosts(costs) {
  if (!Array.isArray(costs)) return null;
  if (costs.length === 0 || costs.length > POOLED_COSTS_MAX) return null;
  return costs.every(isPooledCost) ? costs : null;
}

/**
 * The pool, or `null` to refuse `invalidActorUuids`: a floor under the facade's gate. A repeated
 * document would double-count a stack, so distinctness is by identity, never `id` (an unlinked
 * token actor shares its base actor's `id` yet is another pool).
 */
function validatePooledActors(actors) {
  if (!Array.isArray(actors)) return null;
  if (actors.length === 0 || actors.length > POOLED_ACTORS_MAX) return null;
  if (new Set(actors).size !== actors.length) return null;
  return actors.every((actor) => typeof actor?.uuid === 'string' && actor.uuid !== '')
    ? actors
    : null;
}

/** One system's component definitions, as an array whatever the system carries. */
function systemComponents(system) {
  return resolvedComponentsFor(system);
}

/**
 * Resolve a name across every system, id tier before name tier; a name answering in two systems
 * is `ambiguous`, never silently first-matched, since the caller consumes by the returned id.
 * Case-insensitive against definitions, which cannot widen what matches on a sheet.
 */
function resolveNamedDefinition(systems, name, byId, byName) {
  if (!name) return { match: null, ambiguous: false };
  const gather = (lookup) => {
    const matches = [];
    for (const system of systems) {
      const definition = lookup(system);
      if (definition) matches.push({ system, definition });
    }
    return matches;
  };
  const byIdMatches = gather(byId);
  const matches = byIdMatches.length > 0 ? byIdMatches : gather(byName);
  return { match: matches[0] ?? null, ambiguous: matches.length > 1 };
}

/**
 * A component cost's definition, id first as `resolveCurrencyUnitByName`: a rename cannot redirect
 * a caller holding an id, and a read hands ids out that the consume takes back.
 */
function resolveNamedComponent(systems, name) {
  return resolveNamedDefinition(
    systems,
    name,
    (system) => findById(getDefinitionIndex(systemComponents(system)), name),
    (system) => findByName(getDefinitionIndex(systemComponents(system)), name, false)
  );
}

/** A tool's own name, else its linked component's: `RecipeManager.toolMatchesItem`'s fallback. */
function toolDisplayName(system, tool) {
  const own = typeof tool?.name === 'string' ? tool.name.trim() : '';
  if (own) return own;
  const linked = tool?.componentId
    ? findById(getDefinitionIndex(systemComponents(system)), tool.componentId)
    : null;
  return typeof linked?.name === 'string' ? linked.name.trim() : '';
}

/** Resolve a tool cost's name against every system's first-class Tool definitions. */
function resolveNamedTool(systems, name) {
  const wanted = name.toLowerCase();
  const tools = (system) => resolvedToolsFor(system);
  return resolveNamedDefinition(
    systems,
    name,
    (system) => tools(system).find((tool) => tool?.id === name),
    (system) => tools(system).find((tool) => toolDisplayName(system, tool).toLowerCase() === wanted)
  );
}

/** A component cost summed over the pool; `0` is a confident answer, unlike currency's `null`. */
function readComponentCost({ name }, { systems, actors, findComponentItems }) {
  const { match, ambiguous } = resolveNamedComponent(systems, name);
  if (!match) return { outcome: COMPANION_OUTCOMES.componentNotFound, ambiguous };
  const { system, definition } = match;
  let available = 0;
  for (const actor of actors) {
    for (const item of findComponentItems(actor, definition, system) || []) {
      available += readStackQuantity(item);
    }
  }
  return {
    systemId: system?.id ?? null,
    componentId: definition?.id ?? null,
    available,
    ambiguous,
    outcome: COMPANION_OUTCOMES.read,
  };
}

/**
 * A tool cost as a `state`, never an `available`: sufficiency is `present` alone. The classifier
 * sees the pool as one synthetic actor, and `presentTools: null` keeps a canvas station out.
 */
function readToolCost({ name }, { systems, actors, craftingSystemManager, classifyToolStates }) {
  const { match, ambiguous } = resolveNamedTool(systems, name);
  if (!match) return { outcome: COMPANION_OUTCOMES.toolNotFound, ambiguous };
  const { system, definition } = match;
  const systemId = system?.id ?? null;
  const classified = classifyToolStates({
    actor: { items: pooledItemOrder(actors) },
    system: { id: systemId },
    task: { id: definition?.id ?? null, craftingSystemId: systemId },
    tools: [definition],
    craftingSystemManager,
    presentTools: null,
  });
  const reported = classified?.[0]?.state;
  return {
    systemId,
    // A component-linked tool reports the component it links to; an item-sourced tool has none.
    componentId: definition?.componentId ?? null,
    state: POOLED_TOOL_STATES[reported] ?? POOLED_TOOL_STATES.missing,
    ambiguous,
    outcome: COMPANION_OUTCOMES.read,
  };
}

/**
 * A currency cost: the name resolves through `resolveWorldCurrencyUnitByName` (id first, additive,
 * `ambiguous` reads the first coin in ladder order) and the balance through
 * `readPooledCurrencyBalance`. A missing unit is `unitNotFound`; an empty or invalid ladder or an
 * unreadable actor is `balanceNotConfigured` (`available: null`, blocking nothing). The base-unit
 * balance is converted to the caller's unit and floored: copper against a gold `requested` would
 * err permissive.
 */
async function readCurrencyCost(
  { name },
  { actors, seams, readCurrencyBalance, resolveUnitByName }
) {
  const named = resolveUnitByName(name, seams);
  const ambiguous = named.ambiguous;
  const balance = await readCurrencyBalance(actors, { unitId: named.unit?.id ?? name }, seams);
  if (balance?.outcome === COMPANION_OUTCOMES.unitNotFound) {
    return { unitId: name || null, ambiguous, outcome: COMPANION_OUTCOMES.unitNotFound };
  }
  const unitId = balance?.unit?.id ?? (name || null);
  const baseValue = Number(balance?.baseValue) || 0;
  if (balance?.outcome || balance?.available === null || baseValue <= 0) {
    return { unitId, ambiguous, outcome: COMPANION_OUTCOMES.balanceNotConfigured };
  }
  return {
    unitId,
    ambiguous,
    available: Math.floor(balance.available / baseValue),
    outcome: COMPANION_OUTCOMES.read,
  };
}

/** The per-axis readers, keyed by the cost type each serves. */
const POOLED_COST_READERS = Object.freeze({
  [POOLED_COST_TYPES.component]: readComponentCost,
  [POOLED_COST_TYPES.tool]: readToolCost,
  [POOLED_COST_TYPES.currency]: readCurrencyCost,
});

/** A declared but unserved axis is `costTypeUnsupported`, anything else `invalidCostType`. */
function refuseCostType(type) {
  return POOLED_UNSERVED_COST_TYPES.includes(type)
    ? COMPANION_OUTCOMES.costTypeUnsupported
    : COMPANION_OUTCOMES.invalidCostType;
}

/**
 * Read one cost in one `try`; the loop accumulates, since one unanswerable axis must not cost the
 * others. `type` is judged before `quantity`.
 */
async function readPooledCost(entry, context) {
  const type = typeof entry?.type === 'string' ? entry.type : '';
  const name = typeof entry?.name === 'string' ? entry.name.trim() : '';
  const requested = normalizePooledQuantity(entry?.quantity);
  const record = { type: entry?.type ?? null, name: entry?.name ?? null, requested };
  try {
    const reader = Object.hasOwn(POOLED_COST_READERS, type) ? POOLED_COST_READERS[type] : null;
    if (!reader) return { ...record, outcome: refuseCostType(type) };
    if (requested === null) return { ...record, outcome: COMPANION_OUTCOMES.invalidQuantity };
    return { ...record, ...(await reader({ name, requested }, context)) };
  } catch (error) {
    console.error(`Fabricate | Could not read a pooled "${type}" cost`, error);
    return { ...record, outcome: COMPANION_OUTCOMES.readFailed };
  }
}

/**
 * `game.fabricate.readPooledHoldings`. Writes nothing and takes no `callSite`: N clients asking
 * one question is harmless. Answers `read` whenever it produced readings, each with its own
 * outcome; a call-level `readFailed` means the read could not run at all.
 */
export async function readPooledHoldings(
  actors,
  { costs = null } = {},
  {
    classifyToolStates = classifyGatheringToolStates,
    readCurrencyBalance = readPooledCurrencyBalance,
    resolveUnitByName = resolveWorldCurrencyUnitByName,
    ...seams
  } = {}
) {
  // The actor set first: an unaddressable request answers nothing at all.
  const pool = validatePooledActors(actors);
  if (!pool) {
    return pooledHoldingsReadResult(COMPANION_OUTCOMES.invalidActorUuids, {
      max: POOLED_ACTORS_MAX,
    });
  }

  const entries = validatePooledCosts(costs);
  if (!entries) {
    return pooledHoldingsReadResult(COMPANION_OUTCOMES.invalidCosts, { max: POOLED_COSTS_MAX });
  }

  try {
    const systems = seams.listSystems?.();
    const context = {
      systems: Array.isArray(systems) ? systems : [],
      actors: pool,
      seams,
      findComponentItems: seams.findComponentItems,
      craftingSystemManager: seams.craftingSystemManager,
      classifyToolStates,
      readCurrencyBalance,
      resolveUnitByName,
    };
    const readings = [];
    for (const entry of entries) readings.push(await readPooledCost(entry, context));
    return pooledHoldingsReadResult(COMPANION_OUTCOMES.read, null, {
      actorUuids: pool.map((actor) => actor.uuid),
      readings,
    });
  } catch (error) {
    // Reaching here means a crafting-system seam threw during setup.
    console.error('Fabricate | Could not read pooled holdings for a set of actors', error);
    return pooledHoldingsReadResult(COMPANION_OUTCOMES.readFailed);
  }
}
