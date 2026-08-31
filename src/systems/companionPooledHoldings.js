/**
 * The **Pooled Holdings Read** — what a SET of characters holds between them, published to a
 * companion module as `game.fabricate.readPooledHoldings` (issue 1342).
 *
 * A companion settling a downtime activity asks about a PARTY, not an actor: a stage's
 * requirements name a component, a tool and an amount of coin, and the question is whether the
 * group can cover them between them. Every read Fabricate published before this one was
 * single-actor and single-axis, so a companion could only compose an answer by summing several
 * of them — and a sum a caller composes is a sum Fabricate cannot promise anything about.
 *
 * ## THIS MEMBER WRITES NOTHING, AND IT IS NOT A RESERVATION
 *
 * The answer is exact AT READ TIME and holds nothing. Nothing stops an item being sold, dropped
 * or consumed between this call and a `consumePooledHoldings` that follows it, so a caller that
 * must not overdraw calls the consume and reads ITS refusal rather than treating a `sufficient`
 * it read a moment ago as a lease. The contract's own factory says the same thing at
 * `pooledHoldingsReadResult`; it is repeated here so a reader who arrives at the behaviour first
 * meets the rule at the site rather than only in the vocabulary.
 *
 * ## `null` MEANS FABRICATE CANNOT SEE, `0` MEANS IT CAN PROVE NONE
 *
 * The shipped `creditCurrency` rule, reused rather than re-derived. A component nobody is
 * carrying reads a confident `0`; a `macro` world with no `balance` macro reads `null` for its
 * CURRENCY cost and answers every component and tool cost in the same request unchanged. That
 * placement is why `balanceNotConfigured` is a READING-level outcome and not a call-level one:
 * one unreadable axis blocks nothing.
 *
 * ## The read is built on the SAME matcher the consume writes through
 *
 * Component quantities come from the PUBLISHED `CraftingEngine.findComponentItems` — the matcher
 * salvage and bulk destroy already use — and are counted with `readStackQuantity`, the reader
 * the first-fit drain in `pooledAllocation.js` uses. A read on one matcher predicting a write on
 * another is precisely the gate that lies. Two consequences of that matcher are the caller's to
 * know rather than this module's to paper over: it is case-SENSITIVE on its name tier, and it is
 * TIERED ALL-OR-NOTHING, so an actor holding two durably-linked copies and three name-only
 * copies reads as holding two.
 *
 * ## The deprecated name tier's telemetry is not corrupted by a polling caller
 *
 * A cost's NAME is resolved against each crafting system's component and tool DEFINITIONS
 * through `definitionIndex`'s own maps ({@link findByName}), which is the silent primitive — it
 * never reaches `componentNameMatch`'s warn-once name-only reporter. That keeps the issue-540
 * telemetry, whose whole purpose is to measure live reliance on the name fallback so it can be
 * removed, free of a companion's own naming convention. The item-side name fallback INSIDE
 * `findComponentItems` still reports, exactly as it does for salvage, and it is deduped
 * per-session on `(systemId, definition, item name)`, so a companion polling every stage cannot
 * inflate it.
 *
 * ## Where this leaf's gates stop
 *
 * GM authority, actor resolution and readiness belong to the facade, which resolves the caller's
 * UUIDs and hands this function the RESOLVED actor documents — so there is no second resolver
 * here to disagree with the first. The facade's preamble owns the split between `noActor` (NOT
 * ONE supplied UUID addressed an actor) and `invalidActorUuids` (the request itself was wrong:
 * absent, empty, over-bound, non-string, or only PARTLY resolved), because it is the only layer
 * holding the raw list. This module keeps the fail-closed FLOOR — an actor list that is not a
 * bounded, non-empty list of addressable documents refuses `invalidActorUuids` and reads nothing
 * — on the rule the award leaf validates its own `awards` by.
 *
 * ## A Foundry-free leaf
 *
 * It reads no global, resolves no actor and constructs no document. The crafting systems, the
 * component matcher, the tool classifier and the pooled coin reader all arrive as seams.
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
 * The CLOSED key set of one cost entry, on `companionComponentAward`'s precedent.
 *
 * Closed rather than merely required, and the published refusal string is what closes it: the
 * shipped `Holdings.Read.InvalidCosts` tells a caller each entry names "exactly an axis, a name
 * and a quantity". A tool cost carries a quantity it cannot spend — a tool's `sufficient` is
 * `state === 'present'` and nothing else — and that uniformity is the price of a caller being
 * able to build one cost list for a stage without branching on the axis.
 *
 * The test is over `Object.keys`, so `{ type, name, quantity: undefined }` IS a well-formed
 * entry whose QUANTITY is then refused per reading: the caller named an axis and a subject and
 * gets an answer about them. `{ type, name }` alone is a malformed list and refuses the call.
 */
const POOLED_COST_KEYS = Object.freeze(['type', 'name', 'quantity']);

/**
 * Normalize one cost's `quantity`, REFUSING rather than coercing.
 *
 * A numeric string is accepted, because a companion reading an authored activity field
 * legitimately holds one. Everything else refuses: a fractional or negative quantity is a
 * different question from the one a caller believes it asked, and the shipped refusal string
 * says so — "it is never rounded, because a rounded quantity is a different quantity".
 *
 * @param {*} value the caller's `quantity`
 * @returns {number|null} the whole positive quantity, or `null` when there is no usable one
 */
function normalizePooledQuantity(value) {
  const numeric =
    typeof value === 'number' || (typeof value === 'string' && value.trim() !== '')
      ? Number(value)
      : NaN;
  return Number.isSafeInteger(numeric) && numeric > 0 ? numeric : null;
}

/**
 * Whether one entry is a well-formed cost entry (see {@link POOLED_COST_KEYS}).
 *
 * OWN keys on both sides. `key in entry` would admit an entry whose `quantity` lives on a
 * prototype while an unrecognised own key rode in beside it, which is precisely what a closed key
 * set is a claim about.
 *
 * @param {*} entry
 * @returns {boolean}
 */
function isPooledCost(entry) {
  if (!entry || typeof entry !== 'object' || Array.isArray(entry)) return false;
  const keys = Object.keys(entry);
  return (
    keys.length === POOLED_COST_KEYS.length &&
    POOLED_COST_KEYS.every((key) => Object.hasOwn(entry, key))
  );
}

/**
 * The caller's `costs` list, or `null` when the whole call must refuse `invalidCosts`.
 *
 * An EMPTY list refuses rather than succeeding vacuously: `readings: []` already means NOTHING
 * WAS ASKED, and a vacuous success beside it would collide with the one distinction the answer
 * shape exists to draw. The upper bound is one half of the product described on
 * {@link POOLED_COSTS_MAX} — every cost is scanned across every actor.
 *
 * @param {*} costs
 * @returns {Array<object>|null}
 */
function validatePooledCosts(costs) {
  if (!Array.isArray(costs)) return null;
  if (costs.length === 0 || costs.length > POOLED_COSTS_MAX) return null;
  return costs.every(isPooledCost) ? costs : null;
}

/**
 * The resolved actor set, or `null` when the whole call must refuse `invalidActorUuids`.
 *
 * A FLOOR, not the member's actor gate: the facade resolves the caller's UUIDs and owns the
 * `noActor`/`invalidActorUuids` split, because only it holds the raw list and can tell "not one
 * resolved" from "some resolved". What this can still see is a set that is absent, empty,
 * over-bound, carrying something that is not an addressable document, or NOT A SET AT ALL — and
 * each of those is the request being wrong rather than the world being empty.
 *
 * The distinctness half is the one with teeth here, because this member's error would be a
 * PERMISSIVE one. Every reading sums per entry — components flat-map each actor's items, coin is
 * summed per actor — so one document appearing twice reports a party holding one stack of ten as
 * holding twenty, and the consume the caller is about to make on the strength of that answer
 * cannot cover it. Erring permissive is the direction {@link readCurrencyCost} already refuses to
 * err in a paragraph below; this is the same rule about the pool rather than the denomination.
 *
 * By object IDENTITY and never by `id`: an unlinked token's synthetic actor and its base actor
 * are two genuinely different pools that share one `id`.
 *
 * @param {*} actors
 * @returns {Array<object>|null}
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
 * Resolve a NAME against every crafting system's definitions, reporting whether more than one
 * system answered.
 *
 * Cross-system by construction, and that is the delta's own departure from the companion API
 * spec's once-per-call `systemId`: a downtime stage's requirements are mixed-system, so each cost
 * resolves for itself. A name that answers in two systems is reported `ambiguous` rather than
 * silently first-matched, because the caller is about to consume by the id this read hands back
 * and a quietly chosen system is a quietly chosen set of documents.
 *
 * Case-INSENSITIVE, which is wider than `findComponentItems`' case-SENSITIVE item tier and
 * deliberately so: this hop resolves an authored requirement's spelling to a DEFINITION, and the
 * definition's own name is what the item tier then compares. Widening here cannot widen what
 * matches on a sheet.
 *
 * @param {Array<object>} systems every crafting system to consider, in the seam's order
 * @param {string} name the cost's name
 * @param {(system: object) => object|null|undefined} lookup how one system answers the name
 * @returns {{match: {system: object, definition: object}|null, ambiguous: boolean}}
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
 * Resolve a component cost's name against every system's component definitions, ID FIRST.
 *
 * The tier order is {@link resolveCurrencyUnitByName}'s, deliberately: an exact definition id
 * wins outright, and only a name that matched no id falls through to the folded name tier. Two
 * reasons, and they are the same two the coin axis states.
 *
 * A caller that already holds an id gets the answer it asked for whatever a world's display
 * names happen to say, so a rename cannot silently redirect a working caller. And a READ HANDS
 * IDS OUT — every reading echoes the `componentId` it resolved, and the consume takes ids only —
 * so a companion that caches a reading and later refreshes it would otherwise have to go back to
 * the weaker key it already replaced. A member that publishes an id and then refuses to accept
 * it is answering a different question on the way back in.
 *
 * A name that collides with another definition's id is decided by the id, for the same reason a
 * coin's is: an id is a durable handle and a name is display text somebody can retype.
 */
function resolveNamedComponent(systems, name) {
  return resolveNamedDefinition(
    systems,
    name,
    (system) => findById(getDefinitionIndex(systemComponents(system)), name),
    (system) => findByName(getDefinitionIndex(systemComponents(system)), name, false)
  );
}

/**
 * The name a TOOL is known by, which is the tool's own snapshot name or — for a
 * component-linked tool whose snapshot was never backfilled — its linked component's.
 *
 * The same expression `RecipeManager.toolMatchesItem` derives its own fallback name from, so a
 * tool this read can find is a tool that matcher can match.
 */
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

/**
 * Read a COMPONENT cost across the pool.
 *
 * The count is what the actors are carrying, summed through the published matcher and the
 * drain's own capacity reader. `0` is a confident answer here — the matcher ran on every actor
 * and nothing resolved — which is what makes it different from the `null` a currency cost
 * answers when the world cannot be read at all.
 */
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
 * Read a TOOL cost across the pool.
 *
 * Answers a `state` and NO `available`: a tool is a capability, not a quantity, and the contract
 * derives a tool reading's `sufficient` from `state === 'present'` alone — so a `damaged` tool
 * reads insufficient even though it is physically there, exactly as the shipped start-attempt
 * gate refuses one.
 *
 * The classifier is driven with the SYNTHETIC actor the multi-actor callers already build
 * (`RecipeManager.resolveToolStates`), whose items are the pooled order: the party is one
 * inventory for the purpose of "does anyone have a hammer".
 *
 * `presentTools` is `null`, so a virtually-present canvas Tool station never satisfies this read.
 * That is a scene-scoped affordance rather than something the party is holding, and this member
 * answers what they HOLD.
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
 * Read a CURRENCY cost across the pool.
 *
 * ## A cost's `name` means the same thing on all three axes
 *
 * The component and tool axes resolve a name against DEFINITION names, folded case-insensitively.
 * Currency used to be the odd one out: its `name` went straight through as a unit ID, and
 * `findCurrencyUnit` matches `unit.id` exactly and case-sensitively — so a caller authoring
 * requirements the way a person writes them ("gold", "gp", "Gold Pieces") got two axes that
 * resolved and a third that answered `unitNotFound` forever. Nothing about that was unsafe; the
 * refusal degrades to `available: null` and blocks nothing. It simply made the axis unusable by
 * any caller that did not already hold Fabricate's internal unit ids, which is every caller
 * outside Fabricate.
 *
 * {@link resolveWorldCurrencyUnitByName} closes it, and it lives in the currency module rather
 * than here because the coin ladder is that module's subject: this leaf must not grow a second
 * opinion about what names a coin. Resolution is ADDITIVE — an exact id still wins outright and
 * still behaves exactly as it did — and the RESOLVED id is what goes down to the balance read, so
 * a caller can consume by the `unitId` this reading hands back. An unresolved name is passed
 * through verbatim, so this hop can only ever add an answer, never take one away.
 *
 * A name that answers to two coins sets `ambiguous` and still reads the first in ladder order:
 * the component axis's rule, for the component axis's reason: a caller is liable to consume by the
 * id a read handed back, and a quietly chosen coin is a quietly chosen debit.
 *
 * ## The refusals, and the denomination
 *
 * The balance itself is delegated whole to {@link readPooledCurrencyBalance}, so nothing here
 * re-derives what a denomination means. Its refusals fold into two readings, because a caller can
 * do nothing different about most of them: a name the ladder answers to nowhere is
 * `unitNotFound`, while an empty ladder, an invalid one, and a pool one actor could not be read
 * from are all `balanceNotConfigured` — Fabricate cannot see, so the reading answers
 * `available: null` and BLOCKS NOTHING ELSE IN THE REQUEST.
 *
 * The balance arrives denominated in the ladder's TERMINAL BASE UNIT while the caller asked in
 * its own; `available` is converted back and FLOORED, because a pool holding three and a half
 * gold pieces cannot pay four. Converting is not optional: reporting copper against a `requested`
 * in gold would let the contract derive `sufficient` from two different denominations, and it
 * errs PERMISSIVE — the direction a gate must never err in.
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

/**
 * The outcome a cost whose `type` names no reader answers.
 *
 * Two refusals, and the difference is "not yet" against "you mistyped": a DECLARED axis this
 * member does not serve is `costTypeUnsupported`, while a string naming no axis at all is
 * `invalidCostType`. Collapsing them would send an author hunting for a spelling mistake that is
 * not there. The pooled READ serves all three declared axes, so `costTypeUnsupported` is reached
 * only by {@link POOLED_UNSERVED_COST_TYPES} — the axes this domain names and no pooled member
 * reads.
 */
function refuseCostType(type) {
  return POOLED_UNSERVED_COST_TYPES.includes(type)
    ? COMPANION_OUTCOMES.costTypeUnsupported
    : COMPANION_OUTCOMES.invalidCostType;
}

/**
 * Read ONE cost, with the WHOLE body inside one `try`.
 *
 * The loop this belongs to ACCUMULATES rather than aborting at the first refusal, on the rule the
 * award loop states and the reading-level `balanceNotConfigured` depends on: one axis Fabricate
 * cannot answer must not cost the caller the axes it can. A refusal here is one reading's
 * outcome, never the call's.
 *
 * `type` is decided before `quantity`, because a quantity is meaningless until the axis it counts
 * is known — an author told their cost names no axis should not first be told its quantity is
 * wrong.
 *
 * @param {object} entry one caller cost
 * @param {object} context the resolved systems, the pool and the seams
 * @returns {Promise<object>} this member's INTERNAL record of one reading
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
 * Read what a SET of actors holds — the behaviour published as
 * `game.fabricate.readPooledHoldings` (issue 1342).
 *
 * **Writes nothing, and takes no `callSite`.** The election gate exists to stop N clients each
 * applying a consequence Fabricate cannot reconcile; N clients answering the same question is
 * harmless, so requiring the declaration would be ceremony a caller could only get wrong.
 *
 * **The call answers `read` whenever it produced readings**, however those readings landed. A
 * component nobody carries, a name that resolves nowhere and a currency axis this world cannot
 * see are all ANSWERS, and each carries its own outcome and its own message key. `readFailed` at
 * call level means the read could not be performed at all.
 *
 * @param {Array<object>} actors the already-RESOLVED actor documents, in the caller's own order
 * @param {object} request
 * @param {Array<{type: string, name: string, quantity: number|string}>|null} [request.costs]
 * @param {object} seams the injected seams, supplied by the facade
 * @param {() => Array<object>} seams.listSystems every crafting system a name may resolve in
 * @param {(actor: object, component: object, system: object) => Array<object>}
 *   seams.findComponentItems the PUBLISHED matcher, so what a read counts and what a consume
 *   takes can never disagree
 * @param {object} seams.craftingSystemManager the tool matcher's source
 * @param {(params: object) => Array<object>} [seams.classifyToolStates] defaulted to the shipped
 *   display-state classifier
 * @param {(actors: Array<object>, request: object, seams: object) => Promise<object>}
 *   [seams.readCurrencyBalance] defaulted to the shipped pooled coin reader
 * @param {(name: string, seams: object) => {unit: object|null, ambiguous: boolean}}
 *   [seams.resolveUnitByName] defaulted to the shipped world coin-name resolver, so a currency
 *   cost names its coin the way a component cost names its component
 * @returns {Promise<Readonly<{success: boolean, actorUuids: ReadonlyArray<string>,
 *   readings: ReadonlyArray<object>, outcome: string, message: string, messageData?: object}>>}
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
  // The actor set is decided first, because a request Fabricate cannot address answers nothing
  // at all, where a malformed cost list is still a question about a known party.
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
    // The floor a `stable` member needs: every per-cost body is already wrapped, so reaching
    // here means the READ ITSELF could not be set up — a crafting-system seam that threw.
    console.error('Fabricate | Could not read pooled holdings for a set of actors', error);
    return pooledHoldingsReadResult(COMPANION_OUTCOMES.readFailed);
  }
}
