/**
 * The **Pooled Holdings Consume** — taking a set of costs from what a SET of actors holds
 * between them, published to a companion module as `game.fabricate.consumePooledHoldings`
 * (issue 1342).
 *
 * It is the only member of the companion contract that REMOVES value. Every other writer gives:
 * `awardComponents` places, `creditCurrency` credits, `grantRecipeKnowledge` grants. That single
 * difference is what most of the reasoning below is about.
 *
 * ## Ids in, never names
 *
 * A cost arrives as `{type: 'component', systemId, componentId, quantity}` or
 * `{type: 'currency', unitId, amount}`. The READ member resolves a NAME against the crafting
 * systems' definition indexes and reports what it resolved; this one refuses to guess. Core's
 * own name matcher is case-SENSITIVE and deprecated (issue 540), and no `stable` promise is
 * going to be built on top of it when the act it authorises is a delete.
 *
 * ## Components FIRST, currency SECOND — and the delta's earlier draft had this backwards
 *
 * An earlier draft of the change ordered currency first, on the premise that a debited coin is
 * exactly recoverable where a deleted item is not. Both halves of that premise were checked
 * against Foundry's own source and both are false.
 *
 * - **A component CAN be restored exactly.** `item.toObject()` is captured BEFORE the delete and
 *   re-created with `{keepId: true, keepEmbeddedIds: true}`. On v14.365 the server backend does
 *   `if (!(operation.keepId && data._id)) data._id = await sublevel.createNewId()`, so the
 *   supplied `_id` is retained verbatim — and therefore the item's UUID — while
 *   `_generateEmbeddedDocumentIds(keepEmbeddedIds)` skips every embedded document that already
 *   carries an `_id`, so active effects keep theirs too. Flags, `system` data, `name`, `img`,
 *   `compendiumSource` and `duplicateSource` all survive, because none of them is a managed
 *   stat. `awardComponents` is lossy ONLY because it rebuilds from the component TEMPLATE, which
 *   is a different operation, and it is deliberately not reached for here.
 *
 *   **`_stats` is the accepted residue, and `createdTime` is part of it.** An earlier version of
 *   this comment claimed `createdTime` survived; it does not, and the two mechanisms that decide
 *   it agree. `DocumentStatsField.managedFields` lists `createdTime` as "ignored if they appear
 *   in creation or update data", and `_sanitizeType` strips it on the create the server performs
 *   with `sanitize: {deleteStats: true, user}`. `ServerDocumentMixin#_tagStats` then sets
 *   `createdTime` to now whenever the write IS a creation — which a `keepId` restore is. So
 *   `createdTime`, `modifiedTime` and `lastModifiedBy` are all refreshed. That is source-proven
 *   on v14.365 and strong inference on v13.350. It is residue rather than a defect: no companion
 *   answer, no uuid and no player-visible field depends on it.
 *
 *   One further residue on an UNLINKED token: a restore promotes an INHERITED item to a
 *   delta-managed record. The uuid, `_id`, effect ids, flags and system data are identical, so
 *   nothing a companion can observe changes, but the item stops tracking later edits to the base
 *   actor — only core's own `EmbeddedCollectionDelta#restoreDocuments` re-links it.
 * - **Currency is the unreliable half.** Under `spendStrategy: 'macro'` the `increment` macro is
 *   explicitly OPTIONAL, so a world can be perfectly valid and have published no way to hand
 *   coin back at all; under `pf2e` a give-back creates treasure Items; under `actorProperty` it
 *   lands in the unit's own denomination rather than the one that was debited.
 *
 * So the recoverable thing is taken first, the unrecoverable thing last, and a currency cost is
 * REFUSED UP FRONT — `creditNotConfigured`, having written nothing — in a world that publishes no
 * give-back, rather than taken and then discovered to be irreversible.
 *
 * ## Three phases
 *
 * 1. **A whole-call pre-check that writes nothing.** Every cost is resolved and priced against
 *    the pool. A single shortfall refuses the WHOLE call as `insufficient` with every ledger row
 *    reporting `attempted: false`, because a partly-paid downtime cost is worse than an unpaid
 *    one. The currency half of the pre-check asks the currency module's own debit for its
 *    world-configuration refusals with an EMPTY actor set (see {@link probeCurrencyRequest}), so
 *    the "can this world give coin back?" rule keeps exactly one home.
 * 2. **The component arm.** One batched `updateEmbeddedDocuments` and one batched
 *    `deleteEmbeddedDocuments` per actor, reductions before deletions.
 * 3. **The currency arm**, one `consumePooledCurrency` per currency cost.
 *
 * Any failure stops and gives back everything taken IN THIS CALL, newest first.
 *
 * ## Batching is for the write count and the atomicity, NOT for hook suppression
 *
 * `deleteEmbeddedDocuments('Item', ids)` fires one `deleteItem` hook PER DOCUMENT on both v13 and
 * v14; batching does not reduce that and nothing here claims it does. What batching buys is one
 * server round trip and one parent re-render per actor, and a much narrower intra-actor
 * partial-failure window. `foundry.documents.modifyBatch` is the real multi-parent transaction and
 * is **v14-only**, so it cannot be reached for while `module.json` declares `minimum: "13"`.
 *
 * ## Not idempotent, and no idempotency will be added
 *
 * Exactly `awardComponents`' stated position, for exactly its reason: there is no natural key for
 * Fabricate to absorb a repeat with. Taking three hides twice is legitimately six hides gone, and
 * nothing readable distinguishes a duplicated call from a second, intended one. That is WHY the
 * member declares a `callSite` and refuses `notElected` on every client but the elected
 * executor's — the election removes the steady-state multi-client duplication class and is not a
 * lease. Not double-consuming is the caller's own obligation.
 *
 * ## Two accepted costs of the restore
 *
 * A restore fires `createItem` per document — `noHook` gates only the PRE-hook — so Fabricate's
 * own `FragmentDiscoveryHook` and `RecipeItemLearningHook` can chatter on an undo. And a restored
 * document is a new JS object, so a third-party module holding an `Item` reference across the
 * take holds a stale one even though the UUID resolves.
 *
 * ## A Foundry-free leaf
 *
 * It reads no global and resolves no actor: the GM gate, the UUID resolution, the readiness
 * refusal and the resolved actor documents all arrive from the facade, and the crafting system,
 * the component, the actor's matching items and every currency collaborator arrive as SEAMS.
 */

import {
  COMPANION_OUTCOMES,
  POOLED_ACTORS_MAX,
  POOLED_COSTS_MAX,
  POOLED_COST_TYPES,
  POOLED_UNSERVED_COST_TYPES,
  gateCompanionCallSite,
  pooledHoldingsConsumeResult,
} from './companionContract.js';
import {
  consumePooledCurrency,
  creditWorldCurrency,
  readPooledCurrencyBalance,
} from './currencyAffordance.js';
import { stackQuantityUpdate } from './itemStackQuantity.js';
import { planFirstFitDrain, pooledItemOrder } from './pooledAllocation.js';

/** The two axes this member settles, read as symbols so a caller's `'components'` is refused. */
const { component: COMPONENT, currency: CURRENCY, tool: TOOL } = POOLED_COST_TYPES;

/**
 * The currency leg's refusals, mapped onto the tokens the CONSUME's own key table declares.
 *
 * Only three cross over, and the two that are renamed are renamed because this member's
 * vocabulary spells them differently: `invalidAmount` is the currency module's word for the
 * caller's own bad number, which is `invalidQuantity` here, and `unitNotFound` is already shared.
 * `insufficient` and `consumeFailed` are spelled identically in both vocabularies and so need no
 * row of their own; they are listed anyway, because an omitted identity mapping reads as an
 * oversight rather than as a decision.
 *
 * Everything the currency leg can answer that is NOT here — `ladderEmpty`, `ladderInvalid`,
 * `balanceNotConfigured` — has no token in `POOLED_HOLDINGS_CONSUME_MESSAGE_KEYS`, so it becomes
 * a CALL-level `consumeFailed` with every row reporting `notAttempted`. Minting a row token for
 * it would publish a word the contract does not declare, and borrowing `unitNotFound` for a
 * broken ladder would send a GM looking for a unit that is spelled perfectly well.
 */
const CURRENCY_LEG_ROW_OUTCOMES = Object.freeze({
  [COMPANION_OUTCOMES.invalidAmount]: COMPANION_OUTCOMES.invalidQuantity,
  [COMPANION_OUTCOMES.unitNotFound]: COMPANION_OUTCOMES.unitNotFound,
  [COMPANION_OUTCOMES.insufficient]: COMPANION_OUTCOMES.insufficient,
  [COMPANION_OUTCOMES.consumeFailed]: COMPANION_OUTCOMES.consumeFailed,
});

/**
 * Normalize a cost's `quantity`/`amount`, REFUSING rather than coercing.
 *
 * The same rule `normalizeAwardQuantity` applies to an award entry and `resolveCreditAmount`
 * applies to a credit, for the same reasons: a numeric string is accepted because a companion
 * reading an authored activity field legitimately holds one, `Number(true)` is `1` so a coerced
 * boolean would silently mean "one unit", and the SAFE-INTEGER floor is a correctness floor
 * rather than fussiness, because beyond it a stack's arithmetic stops being exact.
 *
 * A currency cost's amount is ALSO validated by the currency leg itself, which owns the refusal;
 * this normalization only decides what the answer ECHOES back as `requested`.
 *
 * @param {*} value the caller's `quantity` or `amount`
 * @returns {number|null} the whole positive number, or `null` when there is no usable one
 */
function normalizeCostQuantity(value) {
  const numeric =
    typeof value === 'number' || (typeof value === 'string' && value.trim() !== '')
      ? Number(value)
      : NaN;
  return Number.isSafeInteger(numeric) && numeric > 0 ? numeric : null;
}

/**
 * The resolved actor set, or `null` when the whole call must refuse `invalidActorUuids`.
 *
 * The facade's set-valued preamble has already refused an unresolvable, partly resolved or
 * repeated UUID list; this is the BOUND, the shape and the SET-ness, tested again at the boundary
 * that issues the writes. A member that DELETES does not delegate the question "is this a usable
 * set of actors?" to its caller, and the bound is what makes the work finite: every cost is
 * scanned across every actor.
 *
 * A `uuid` is required and not merely nice to have, on the READ floor's rule: `publish` echoes
 * the pool as `actor?.uuid` and the contract's `frozenActorUuids` FILTERS OUT anything that is
 * not a string, so an entry without one is silently dropped from the echo — leaving a caller
 * pooled over a set it cannot see, which is the exact harm the `noActor`/`invalidActorUuids`
 * split exists to prevent, on the member that deletes.
 *
 * Distinctness is by object IDENTITY and never by `id`, for the reason `gatePooledActorUuids`
 * records: a repeated document is counted twice by every consumer downstream, while an unlinked
 * token actor and its base actor are two different documents that legitimately share one `id`.
 *
 * @param {*} actors the already-resolved actor documents, in payment order
 * @returns {Array<object>|null}
 */
function validateActorPool(actors) {
  if (!Array.isArray(actors) || actors.length === 0 || actors.length > POOLED_ACTORS_MAX) {
    return null;
  }
  if (new Set(actors).size !== actors.length) return null;
  return actors.every((actor) => typeof actor?.uuid === 'string' && actor.uuid !== '')
    ? actors
    : null;
}

/**
 * The caller's `costs` list, or `null` when the whole call must refuse `invalidCosts`.
 *
 * An EMPTY list refuses rather than succeeding vacuously, on `awardComponents`' rule: an empty
 * ledger already means NOTHING WAS ATTEMPTED, so a vacuous success beside it would collide with
 * the one distinction the answer shape exists to draw. An entry that is not a plain object
 * refuses the whole call rather than one row, because it carries no `type` for a row to be about.
 *
 * @param {*} costs
 * @returns {Array<object>|null}
 */
function validateCostEntries(costs) {
  if (!Array.isArray(costs) || costs.length === 0 || costs.length > POOLED_COSTS_MAX) return null;
  const usable = (cost) => Boolean(cost) && typeof cost === 'object' && !Array.isArray(cost);
  return costs.every((cost) => usable(cost)) ? costs : null;
}

/**
 * The refusal a cost's declared axis earns, or `null` when this member serves it.
 *
 * `invalidCostType` names a string that names no axis at all — "you mistyped" — while
 * `costTypeUnsupported` names a DECLARED axis this member does not settle: `essence` and `tag`,
 * which no pooled member serves, and `tool`, because tool WEAR is out of scope rather than
 * because `tool` is not an axis.
 *
 * @param {*} type
 * @returns {string|null}
 */
function costTypeRefusal(type) {
  if (type === COMPONENT || type === CURRENCY) return null;
  if (type === TOOL || POOLED_UNSERVED_COST_TYPES.includes(type)) {
    return COMPANION_OUTCOMES.costTypeUnsupported;
  }
  return COMPANION_OUTCOMES.invalidCostType;
}

/**
 * This member's INTERNAL record of one cost, from which the contract builds one ledger row.
 *
 * `index`, `attempted`, the row's `consumed` and the call's are all DERIVED by
 * `pooledHoldingsConsumeResult` from this record and are deliberately absent here — deriving any
 * of them locally would be a second place for the published total to disagree with the lines
 * beneath it.
 *
 * `taken` is what the write actually moved and `outstanding` is whether it is STILL moved; the
 * published `takes` is one from the other, which is what lets a rolled-back row report `[]` while
 * a row whose give-back FAILED keeps its lines and so keeps a non-zero `consumed`.
 *
 * `raw` is the caller's quantity exactly as written, kept beside the normalized `requested`
 * because the currency leg owns its own amount rule and must see the caller's own value rather
 * than this module's reading of it. `requested` is what the answer ECHOES.
 *
 * @param {object} cost one caller cost
 * @returns {object}
 */
function startRow(cost) {
  const type = typeof cost.type === 'string' ? cost.type : null;
  const raw = type === CURRENCY ? cost.amount : cost.quantity;
  return {
    type,
    systemId: cost.systemId ?? null,
    componentId: cost.componentId ?? null,
    unitId: cost.unitId ?? null,
    requested: normalizeCostQuantity(raw),
    raw,
    outcome: costTypeRefusal(type),
    allocation: [],
    taken: [],
    takes: [],
    outstanding: false,
  };
}

// ---------------------------------------------------------------------------
// Phase 1a — planning the component costs. Nothing here writes or awaits.
// ---------------------------------------------------------------------------

/**
 * The candidate list one component cost drains, in the POOLED ORDER.
 *
 * The ORDER is `pooledItemOrder`'s and nothing else's, because first-fit means whoever comes
 * first pays first, so re-deriving the order here would let a read and a consume destroy
 * different documents. The MEMBERSHIP is the shipped `findComponentItems` resolver's, so what an
 * award stacks onto, what salvage consumes and what this takes can never disagree about which
 * items ARE a component.
 *
 * Membership is tested by object IDENTITY rather than by `id`, because two actors' items are not
 * guaranteed to have distinct ids and an id-keyed set would let one actor's stack stand in for
 * another's. An item the resolver returns that is not in the actor's own item list is therefore
 * dropped: this member drains the pool it can name, never a document it was handed.
 *
 * @param {Array<object>} actors
 * @param {object} component
 * @param {object} system
 * @param {object} seams
 * @returns {Array<object>}
 */
function matchedPooledOrder(actors, component, system, seams) {
  const matched = new Set();
  for (const actor of actors) {
    for (const item of seams.findComponentItems?.(actor, component, system) ?? []) {
      if (item) matched.add(item);
    }
  }
  return pooledItemOrder(actors).filter((item) => matched.has(item));
}

/**
 * Bucket one component row onto the plan for its (system, component) pair, or refuse it.
 *
 * The caller's own arguments are validated first, because they are the ones whose refusal points
 * at the call site; the crafting system is the GM's problem and is reported after — the ordering
 * `awardComponents` states.
 *
 * Buckets are keyed by SYSTEM AND COMPONENT because a component id is not unique across crafting
 * systems, and they exist at all because two costs naming the same component must not each plan
 * over the same stacks and take twice.
 *
 * @param {object} row
 * @param {Map<string, object>} buckets
 * @param {object} seams
 * @returns {string|null} the row's refusal, or `null`
 */
function bucketComponentRow(row, buckets, seams) {
  if (row.requested === null) return COMPANION_OUTCOMES.invalidQuantity;
  const system = seams.resolveSystem?.(row.systemId) || null;
  if (!system) return COMPANION_OUTCOMES.systemNotFound;
  const component = seams.resolveComponent?.(system, row.componentId) || null;
  if (!component) return COMPANION_OUTCOMES.componentNotFound;

  const key = JSON.stringify([system.id, component.id]);
  let bucket = buckets.get(key);
  if (!bucket) {
    bucket = { system, component, rows: [], total: 0, plan: null };
    buckets.set(key, bucket);
  }
  bucket.rows.push(row);
  bucket.total += row.requested;
  return null;
}

/**
 * Hand each row its share of the bucket's takes, in the caller's own row order.
 *
 * One take can be split across two rows and one row can span several takes, which is why this
 * walks a cursor over the take list rather than zipping the two: a bucket of two rows asking for
 * 3 and 2 is ONE drain of 5, and the ledger has to say which of those five units paid which cost.
 *
 * @param {Array<object>} takes the bucket's drain takes, in drain order
 * @param {Array<object>} rows the bucket's rows, in the caller's order
 */
function allocateRowTakes(takes, rows) {
  let index = 0;
  let used = 0;
  for (const row of rows) {
    let remaining = row.requested;
    while (remaining > 0 && index < takes.length) {
      const take = takes[index];
      const share = Math.min(take.quantity - used, remaining);
      row.allocation.push({ take, quantity: share });
      used += share;
      remaining -= share;
      if (used >= take.quantity) {
        index += 1;
        used = 0;
      }
    }
  }
}

/**
 * Plan every component cost against the pool — the half of the pre-check that never awaits.
 *
 * **No document is planned twice.** Bucketing settles the case where two costs name the SAME
 * component, but two DIFFERENT components can match one owned item too: a component in one
 * crafting system and a component in another can register the same source item uuid, and one item
 * can carry a durable role in several systems at once. So every document an earlier bucket takes
 * from is withdrawn from the candidate list the next bucket sees.
 *
 * Withdrawal is at DOCUMENT granularity, and it is conservative on purpose: first-fit leaves at
 * most one partially drained stack per bucket, and that stack's remainder is not offered on. So a
 * request a perfect allocator could have satisfied can be refused `insufficient`. That is the
 * right direction to be wrong in — the alternative is two plans draining one stack, which writes
 * the second reduction over the first and publishes a ledger claiming units that never left
 * anybody's sheet.
 *
 * @param {Array<object>} actors
 * @param {Array<object>} rows
 * @param {object} seams
 * @returns {Map<string, object>} the buckets, in first-encounter order
 */
function planComponentCosts(actors, rows, seams) {
  const buckets = new Map();
  for (const row of rows) {
    if (row.type !== COMPONENT || row.outcome) continue;
    row.outcome = bucketComponentRow(row, buckets, seams);
  }
  const claimed = new Set();
  for (const bucket of buckets.values()) {
    const candidates = matchedPooledOrder(actors, bucket.component, bucket.system, seams).filter(
      (item) => !claimed.has(item)
    );
    bucket.plan = planFirstFitDrain(candidates, bucket.total);
    if (!bucket.plan.satisfied) {
      for (const row of bucket.rows) row.outcome = COMPANION_OUTCOMES.insufficient;
      continue;
    }
    for (const take of bucket.plan.takes) claimed.add(take.item);
    allocateRowTakes(bucket.plan.takes, bucket.rows);
  }
  return buckets;
}

// ---------------------------------------------------------------------------
// Phase 1b — pricing the currency costs. Reads the pool; writes nothing.
// ---------------------------------------------------------------------------

/**
 * Ask the currency debit for every refusal it decides from WORLD CONFIGURATION and the caller's
 * own arguments, with an EMPTY actor set so that asking costs nothing.
 *
 * The gate this exists for is `creditNotConfigured` — a `macro` world with no `increment` macro
 * has published no way to hand coin back, so this member refuses to take any — and it has to be
 * asked BEFORE the component arm writes, because the acceptance is that such a world is refused
 * "having written nothing", not "having written and un-written".
 *
 * It is asked of `consumePooledCurrency` rather than re-derived here on purpose: that function is
 * the one home of the rule, and a second copy in this module would be a second thing to keep in
 * step on precisely the question a member that deletes may not be wrong about.
 *
 * **An empty pool provably cannot write.** `poolActorCoins([])` iterates nothing, so no
 * `readCoins` runs and no GM `balance` macro fires; it answers `available: 0` and never `null`;
 * and the debit reaches its spender only when `available >= requiredBase`, which a validated
 * amount makes strictly positive. So the ONE outcome an empty pool manufactures is
 * `insufficient`, and that is the one this ignores. Every other answer was decided before the
 * pool was consulted and is honoured verbatim.
 *
 * `baseUnitId` comes back with it because it is the key the rows are grouped by, and the empty
 * pool is exactly where it can be learned for free: `planned` carries it onto the `insufficient`
 * answer this ignores, so the group key costs no extra ladder resolution and — like
 * `requiredBase` — is the CURRENCY MODULE's own answer rather than a second derivation here.
 *
 * @param {object} row
 * @param {object} seams
 * @returns {Promise<{outcome: string|null, requiredBase: number|null, baseUnitId: string}>}
 */
async function probeCurrencyRequest(row, seams) {
  const request = { unitId: row.unitId, amount: row.raw };
  const probe = await consumePooledCurrency([], request, seams);
  const outcome = probe.outcome === COMPANION_OUTCOMES.insufficient ? null : probe.outcome;
  return { outcome, requiredBase: probe.requiredBase, baseUnitId: probe.baseUnitId };
}

/**
 * Record a currency leg refusal on its own row and answer the CALL-level refusal it earns.
 *
 * `creditNotConfigured` is the one that stays a CALL word: it is a GM configuration gap that no
 * per-cost line can describe, and the contract declares it call-level for exactly that reason.
 * Its row is left without a token of its own and publishes `notAttempted`, which is true — the
 * refusal is taken before any mechanism runs.
 *
 * @param {object} row
 * @param {string} outcome the currency leg's own token
 * @returns {string} the CALL-level refusal
 */
function refuseCurrencyRow(row, outcome) {
  row.outcome = CURRENCY_LEG_ROW_OUTCOMES[outcome] ?? null;
  if (row.outcome === COMPANION_OUTCOMES.insufficient) return COMPANION_OUTCOMES.insufficient;
  if (outcome === COMPANION_OUTCOMES.creditNotConfigured) {
    return COMPANION_OUTCOMES.creditNotConfigured;
  }
  return COMPANION_OUTCOMES.consumeFailed;
}

/**
 * Bucket one currency row onto the plan for its TERMINAL BASE UNIT, or answer its refusal.
 *
 * The currency analogue of {@link bucketComponentRow}, and it exists for that function's exact
 * reason: two costs that draw on ONE balance must not each be priced against the whole of it.
 * The component arm has always summed two costs naming one component before deciding; the
 * currency arm used to read the balance once per row and compare each row's own `requiredBase`
 * against the full total, so a pool of 3 gp answered "yes" twice to two 2 gp costs. The pre-check
 * then passed a call the pool could not cover, the first cost DEBITED, the second answered
 * `insufficient`, and the unwind credited the coin back — publishing `insufficient`, which the
 * contract declares a ZERO-MUTATION outcome and whose shipped string says "so nothing was taken",
 * after a real debit-and-credit round trip through the leg this module's own header calls the
 * unreliable half.
 *
 * The key is the TERMINAL BASE UNIT and not the caller's `unitId`, because two costs in different
 * denominations on one ladder branch — 2 gp and 30 sp — are two claims on the SAME coin. Grouping
 * by the caller's spelling would leave that case exactly as broken as the identical-unit one.
 *
 * `requiredBase` comes from the currency module's own answer rather than from an
 * `amount × baseValue` computed here, so this module performs NO denomination arithmetic and
 * cannot disagree with the leg that will do the spending.
 *
 * @param {object} row
 * @param {Map<string, object>} groups
 * @param {object} seams
 * @returns {Promise<string|null>} the CALL-level refusal, or `null`
 */
async function bucketCurrencyRow(row, groups, seams) {
  const probe = await probeCurrencyRequest(row, seams);
  if (probe.outcome) return refuseCurrencyRow(row, probe.outcome);
  if (!Number.isFinite(probe.requiredBase)) {
    row.outcome = COMPANION_OUTCOMES.insufficient;
    return COMPANION_OUTCOMES.insufficient;
  }

  const key = String(probe.baseUnitId ?? '');
  let group = groups.get(key);
  if (!group) {
    group = { unitId: row.unitId, rows: [], total: 0 };
    groups.set(key, group);
  }
  group.rows.push(row);
  group.total += probe.requiredBase;
  return null;
}

/**
 * Price one group of currency costs against the pool ONCE, refusing before anything is written.
 *
 * An UNREADABLE pool refuses rather than pricing itself at zero, and it refuses at CALL level as
 * `consumeFailed`: `balanceNotConfigured` is a token the READ member declares and this one does
 * not, because a read can report one unreadable cost and answer every other, where a take that
 * cannot see what a party is carrying must not take from them at all.
 *
 * A shortfall marks EVERY row in the group `insufficient`, on the component bucket's rule: the
 * costs are jointly unaffordable, and singling one out would name a cost that is individually
 * payable as the one the pool could not cover.
 *
 * The group's summed total is re-tested for safe-integer exactness. Beyond that bound the
 * arithmetic a coin count depends on stops being exact, and a total no pool could hold is a
 * shortfall rather than a validation error — the per-row amounts were each admitted by the
 * currency module's own rule.
 *
 * @param {Array<object>} actors
 * @param {object} group
 * @param {object} seams
 * @returns {Promise<string|null>} the CALL-level refusal, or `null`
 */
async function priceCurrencyGroup(actors, group, seams) {
  const pool = await readPooledCurrencyBalance(actors, { unitId: group.unitId }, seams);
  if (pool.outcome || pool.available === null) return COMPANION_OUTCOMES.consumeFailed;
  if (!Number.isSafeInteger(group.total) || pool.available < group.total) {
    for (const row of group.rows) row.outcome = COMPANION_OUTCOMES.insufficient;
    return COMPANION_OUTCOMES.insufficient;
  }
  return null;
}

/**
 * Price every currency cost, stopping at the first refusal.
 *
 * Two passes, because a group cannot be priced until every row that joins it is known. The first
 * pass writes nothing and reads no pool — {@link probeCurrencyRequest} asks with an EMPTY actor
 * set — so a request refused there still fires no GM `balance` macro.
 *
 * @param {Array<object>} actors
 * @param {Array<object>} rows
 * @param {object} seams
 * @returns {Promise<string|null>} the CALL-level refusal, or `null`
 */
async function priceCurrencyCosts(actors, rows, seams) {
  const groups = new Map();
  for (const row of rows) {
    if (row.type !== CURRENCY || row.outcome) continue;
    const refusal = await bucketCurrencyRow(row, groups, seams);
    if (refusal) return refusal;
  }
  for (const group of groups.values()) {
    const refusal = await priceCurrencyGroup(actors, group, seams);
    if (refusal) return refusal;
  }
  return null;
}

/**
 * The CALL-level refusal a pre-check row outcome earns.
 *
 * A shortfall is `insufficient` — the pool is short, stated as a refused act rather than as a
 * question answered no — and everything else is `consumeFailed`, with the row carrying the actual
 * reason. A call can never answer `componentNotFound` or `notAttempted`: the contract declares
 * those row-only, and "nothing was attempted" is a consequence rather than a reason.
 *
 * @param {Array<object>} rows
 * @returns {string|null}
 */
function precheckRefusal(rows) {
  const offender = rows.find((row) => row.outcome !== null);
  if (!offender) return null;
  return offender.outcome === COMPANION_OUTCOMES.insufficient
    ? COMPANION_OUTCOMES.insufficient
    : COMPANION_OUTCOMES.consumeFailed;
}

// ---------------------------------------------------------------------------
// Phase 2 — the component arm. Batched per actor, snapshot-backed.
// ---------------------------------------------------------------------------

/**
 * Call one embedded-document write on an actor, normalising an absent method, a resolved-nothing
 * write and a rejection into the same empty answer.
 *
 * A write is judged by its RETURN VALUE and never by whether it threw, exactly as
 * `awardComponents` judges its own. `deleteEmbeddedDocuments` resolves fewer documents than it
 * was given ids for when a `preDelete` hook refuses one, and `updateEmbeddedDocuments` answers
 * short for FOUR distinct reasons, not one: a `_preUpdate` refusal, a `preUpdate<Type>` hook
 * refusal, a throwing `updateSource`, and the empty-diff DROP — which is precisely what a
 * GM-authored stack-quantity path that is not in the item's data model produces. The caller
 * collapses all four into one answer deliberately: it compares answered ids against requested
 * ids and unwinds, so it never has to tell them apart.
 *
 * The `catch` is not defensive either. `collection.get(id, {strict: true})` THROWS for an id that
 * vanished between the plan and the write, and it rejects the WHOLE batch rather than shortening
 * it — a concurrently deleted stack is the ordinary way to reach this, and a rejection escaping
 * here would escape a member that publishes "never throws".
 *
 * @param {object} actor
 * @param {string} method
 * @param {Array<*>} payload
 * @param {object} [options]
 * @returns {Promise<Array<*>>}
 */
async function callActorWrite(actor, method, payload, options = {}) {
  if (typeof actor?.[method] !== 'function') return [];
  try {
    return (await actor[method]('Item', payload, options)) ?? [];
  } catch (error) {
    console.error(`Fabricate | A pooled holdings consume could not ${method}`, error);
    return [];
  }
}

/** The ids a write ANSWERED with, whether it answered documents or bare ids. */
function writtenIds(written) {
  return new Set(
    (Array.isArray(written) ? written : []).map((entry) =>
      typeof entry === 'string' ? entry : entry?.id
    )
  );
}

/**
 * Put every stack this call reduced back to what it held before.
 *
 * Base value in, base value out: the plan recorded each item's `available` BEFORE the take, and
 * that is what is written back, so the restore is exact rather than an increment that a
 * concurrent change could compound.
 *
 * @param {object} actor
 * @param {Array<object>} takes the takes whose reduction the write actually applied
 * @returns {Promise<boolean>}
 */
async function restoreStacks(actor, takes) {
  const updates = [];
  for (const take of takes) {
    const payload = stackQuantityUpdate(take.item, take.available);
    if (!payload) return false;
    updates.push({ _id: take.item?.id, ...payload });
  }
  const written = await callActorWrite(actor, 'updateEmbeddedDocuments', updates);
  return writtenIds(written).size === updates.length;
}

/**
 * Reduce every surviving stack in one actor's group, as ONE batched update.
 *
 * Reductions run BEFORE deletions within a group, which is the module's own components-first
 * argument applied one level down: a reduction's inverse is another reduction, while a deletion's
 * inverse is a re-creation that fires `createItem` hooks and invalidates every held reference. So
 * the cheaper-to-undo write goes first and the costlier one is never issued when the cheap one
 * already failed.
 *
 * The path is the AMBIENT stack-quantity path at each site, exactly as `_consumeComponentItems`
 * writes it: `planFirstFitDrain` reads through the ambient path too, and a captured path threaded
 * only into the write would pin the write to a path the plan did not necessarily read.
 *
 * @param {object} actor
 * @param {Array<object>} takes
 * @returns {Promise<{ok: boolean, undo: (() => Promise<boolean>)|null}>}
 */
async function reduceStacks(actor, takes) {
  if (takes.length === 0) return { ok: true, undo: null };
  const updates = [];
  for (const take of takes) {
    const payload = stackQuantityUpdate(take.item, take.remainingQuantity);
    // `null` means the configured path resolves an OBJECT on this item, so a numeric write there
    // would destroy structured data. The accessor warns and refuses; this refuses the group.
    if (!payload) return { ok: false, undo: null };
    updates.push({ _id: take.item?.id, ...payload });
  }
  const applied = writtenIds(await callActorWrite(actor, 'updateEmbeddedDocuments', updates));
  const written = takes.filter((take) => applied.has(take.item?.id));
  return {
    ok: written.length === takes.length,
    undo: written.length === 0 ? null : () => restoreStacks(actor, written),
  };
}

/**
 * Re-create every document this call deleted, with its own `_id`.
 *
 * `keepId: true` is what makes the restore exact rather than approximate: the v14.365 server
 * backend assigns a fresh id only when `!(operation.keepId && data._id)`, so the supplied `_id` —
 * and therefore the item's UUID — survives. `keepEmbeddedIds: true` is Foundry's own default and
 * is spelled anyway, because it is the clause that keeps the restored item's active effects on
 * their original ids and a default nobody spelled is a default nobody notices being changed.
 *
 * @param {object} actor
 * @param {Array<object>} payloads
 * @returns {Promise<boolean>}
 */
async function restoreItems(actor, payloads) {
  const created = await callActorWrite(actor, 'createEmbeddedDocuments', payloads, {
    keepId: true,
    keepEmbeddedIds: true,
  });
  return Array.isArray(created) && created.length === payloads.length;
}

/**
 * Delete every exhausted document in one actor's group, as ONE batched delete.
 *
 * **Nothing is deleted that cannot first be snapshotted.** An item with no `toObject` refuses the
 * whole group before the write, because a delete this member could not reverse is the one failure
 * that costs a player their inventory outright.
 *
 * The restore payload takes its `_id` from the live DOCUMENT rather than from the snapshot, and
 * covers only the ids the delete ANSWERED with. A blanket restore of everything requested would
 * collide with any document the delete refused — the server rejects a `keepId` create onto an id
 * the collection still holds — and turn a partial failure into a thrown one.
 *
 * @param {object} actor
 * @param {Array<object>} takes
 * @returns {Promise<{ok: boolean, undo: (() => Promise<boolean>)|null}>}
 */
async function deleteStacks(actor, takes) {
  if (takes.length === 0) return { ok: true, undo: null };
  const planned = [];
  for (const take of takes) {
    if (typeof take.item?.toObject !== 'function') return { ok: false, undo: null };
    planned.push({ id: take.item.id, data: { ...take.item.toObject(), _id: take.item.id } });
  }
  const ids = planned.map((entry) => entry.id);
  const removed = writtenIds(await callActorWrite(actor, 'deleteEmbeddedDocuments', ids));
  const gone = planned.filter((entry) => removed.has(entry.id)).map((entry) => entry.data);
  return {
    ok: gone.length === ids.length,
    undo: gone.length === 0 ? null : () => restoreItems(actor, gone),
  };
}

/**
 * Take one component bucket's whole plan, one batched pair of writes per actor.
 *
 * Every undo step is pushed the moment its write is known to have moved something, INCLUDING on
 * the failing step, so a partially applied batch is unwound rather than left behind.
 *
 * @param {object} bucket
 * @param {Array<object>} undo the call's undo stack
 * @returns {Promise<boolean>}
 */
async function takeComponentBucket(bucket, undo) {
  for (const group of bucket.plan.groups) {
    // A take with no owning document cannot be batched onto one, and `planFirstFitDrain` records
    // `parent: null` for exactly that item. Refusing is the only honest answer.
    if (!group.parent) return false;
    const reduced = await reduceStacks(group.parent, group.reductions);
    if (reduced.undo) undo.push({ rows: bucket.rows, run: reduced.undo });
    if (!reduced.ok) return false;
    const deleted = await deleteStacks(group.parent, group.deletions);
    if (deleted.undo) undo.push({ rows: bucket.rows, run: deleted.undo });
    if (!deleted.ok) return false;
  }
  return true;
}

/** One take line: WHICH document on WHICH actor paid, and how much. */
function allocationTakes(row) {
  return row.allocation.map(({ take, quantity }) => ({
    actorUuid: take.parent?.uuid ?? null,
    documentUuid: take.item?.uuid ?? null,
    quantity,
  }));
}

/**
 * The token one component bucket's rows publish — the component arm's
 * {@link currencyFailureRowOutcome}, and it is here for that function's stated reason.
 *
 * @param {boolean} ok whether the bucket's whole plan was taken
 * @param {boolean} moved whether ANY write in the bucket actually moved something
 * @returns {string}
 */
function componentRowOutcome(ok, moved) {
  if (ok) return COMPANION_OUTCOMES.consumed;
  return moved ? COMPANION_OUTCOMES.consumeFailed : COMPANION_OUTCOMES.notAttempted;
}

/**
 * Settle every component cost, stopping at the first bucket that fails.
 *
 * @param {Map<string, object>} buckets
 * @param {Array<object>} undo
 * @returns {Promise<boolean>}
 */
async function takeComponentCosts(buckets, undo) {
  for (const bucket of buckets.values()) {
    const depth = undo.length;
    const ok = await takeComponentBucket(bucket, undo);
    // A bucket that failed before it moved anything pushed no undo step, and its rows must not
    // claim units that are still on their owners' sheets — `outstanding` is what a write ACTUALLY
    // moved, never what the plan intended to move.
    const moved = ok || undo.length > depth;
    for (const row of bucket.rows) {
      row.taken = allocationTakes(row);
      row.outstanding = moved;
      // The SAME fact decides the row's token, because the contract DERIVES `attempted` from it
      // and `consumeFailed` means A WRITE WAS ISSUED. A bucket refused before its first write —
      // an object-valued stack-quantity path, or a take with no owning document — issued none, so
      // `consumeFailed` there would publish `attempted: true` beside `consumed: 0` and an empty
      // `takes`, which the four-way discrimination table reads as "writes went out and every one
      // was given back". `notAttempted` is the row word for what actually happened. The CALL
      // still answers `consumeFailed`: `callOutcome` needs only that no row says `consumed`.
      row.outcome = componentRowOutcome(ok, moved);
    }
    if (!ok) return false;
  }
  return true;
}

// ---------------------------------------------------------------------------
// Phase 3 — the currency arm.
// ---------------------------------------------------------------------------

/**
 * The take lines one currency settlement produced.
 *
 * **A currency take is denominated in the TERMINAL BASE UNIT while the row's `requested` echoes
 * the caller's own denomination**, so on a `gp -> sp -> cp` ladder a 2 gp cost reports
 * `requested: 2` beside `consumed: 200`. The two are deliberately not reconciled. Expressing a
 * payer's share back in the caller's unit would make it fractional — 150 cp is 1.5 gp, and a
 * three-way split of one unit does not sum back to one in floating point — and collapsing the
 * lines into a single whole-cost take would discard the per-actor attribution the ledger exists
 * to provide. A coin count is exact; a converted one is not.
 *
 * `documentUuid` is `null` on every line, because the spender never names a document: under
 * `actorProperty` and `macro` there is no item to name at all, and under `actorInventory` the
 * adapter settles coins without reporting which stacks moved.
 *
 * @param {Array<object>} ledger the currency leg's own per-actor ledger
 * @param {(row: object) => boolean} keep
 * @returns {Array<object>}
 */
function currencyTakes(ledger, keep) {
  return (Array.isArray(ledger) ? ledger : [])
    .filter((entry) => keep(entry))
    .map((entry) => ({ actorUuid: entry.actorUuid, documentUuid: null, quantity: entry.amount }));
}

/**
 * Give one settled currency cost back, through the world's published credit.
 *
 * `creditWorldCurrency` rather than a private give-back of this module's own, and in the TERMINAL
 * BASE UNIT the ledger recorded, so the amount returned is the amount debited without a
 * denomination conversion in between. Its mechanism is the resolved spender's `refund` — the same
 * one the currency leg uses for its own intra-call give-back, and the one the up-front
 * `creditNotConfigured` gate proved exists before any of this ran.
 *
 * @param {Array<object>} actors
 * @param {Array<object>} ledger
 * @param {string} callSite
 * @param {object} seams
 * @returns {Promise<boolean>}
 */
function currencyFailureRowOutcome(answer) {
  const mapped = CURRENCY_LEG_ROW_OUTCOMES[answer.outcome];
  if (mapped) return mapped;
  // `attempted` is DERIVED from this token by the contract and means A WRITE WAS ISSUED. An
  // unmapped failure the leg took without invoking anything — an unreadable pool, or a ladder
  // that broke between the pre-check and the settle — must not borrow `consumeFailed` and claim
  // a write that never happened. `wroteNothing` is the leg's own word for that, and it is `true`
  // for every refusal it takes before its first spend.
  return answer.wroteNothing === true
    ? COMPANION_OUTCOMES.notAttempted
    : COMPANION_OUTCOMES.consumeFailed;
}

async function giveBackCurrency(actors, ledger, callSite, seams) {
  let restoredEverything = true;
  for (const entry of ledger) {
    const actor = actors.find((candidate) => candidate?.uuid === entry.actorUuid) ?? null;
    const request = { unitId: entry.unitId, amount: entry.amount, callSite };
    const answer = await creditWorldCurrency(actor, request, seams);
    if (answer.outcome !== COMPANION_OUTCOMES.credited) restoredEverything = false;
  }
  return restoredEverything;
}

/**
 * Settle one currency cost.
 *
 * A failure the currency leg already gave back for is NOT re-given-back here: its own ledger
 * records `restored` per payer, so the lines this member publishes are exactly the ones whose
 * coin is genuinely still gone, and `wroteNothing` is what says whether anything is.
 *
 * @param {Array<object>} actors
 * @param {object} row
 * @param {string} callSite
 * @param {object} seams
 * @param {Array<object>} undo
 * @returns {Promise<boolean>}
 */
async function takeCurrencyRow(actors, row, callSite, seams, undo) {
  const request = { unitId: row.unitId, amount: row.raw };
  const answer = await consumePooledCurrency(actors, request, seams);
  const settled = (entry) => entry.settled === true;
  if (answer.outcome) {
    row.outcome = currencyFailureRowOutcome(answer);
    row.taken = currencyTakes(answer.ledger, (entry) => settled(entry) && entry.restored === false);
    // No undo step: the currency leg has already run its own give-back, so what is left here is
    // final. `outstanding` therefore comes from the lines rather than from an unwind that must
    // not run twice over the same coin.
    row.outstanding = row.taken.length > 0;
    return false;
  }
  row.outcome = COMPANION_OUTCOMES.consumed;
  row.taken = currencyTakes(answer.ledger, settled);
  const paid = (answer.ledger ?? []).filter((entry) => settled(entry));
  row.outstanding = paid.length > 0;
  if (paid.length > 0) {
    undo.push({ rows: [row], run: () => giveBackCurrency(actors, paid, callSite, seams) });
  }
  return true;
}

/**
 * Settle every currency cost, stopping at the first failure.
 *
 * @param {Array<object>} actors
 * @param {Array<object>} rows
 * @param {string} callSite
 * @param {object} seams
 * @param {Array<object>} undo
 * @returns {Promise<boolean>}
 */
async function takeCurrencyCosts(actors, rows, callSite, seams, undo) {
  for (const row of rows) {
    if (row.type !== CURRENCY) continue;
    if (!(await takeCurrencyRow(actors, row, callSite, seams, undo))) return false;
  }
  return true;
}

// ---------------------------------------------------------------------------
// Unwinding, and the published answer.
// ---------------------------------------------------------------------------

/**
 * Give back everything this call took, NEWEST FIRST.
 *
 * Reverse order is what makes the unwind the inverse of the take rather than merely its
 * counterpart: the last write is the one most likely to have half-applied, and undoing it before
 * an earlier one keeps each step's precondition the state that step itself created.
 *
 * Every covered row is cleared FIRST and a failing step then re-raises its own, so a row covered
 * by several steps reports outstanding lines when ANY of them failed rather than when the last
 * one happened to. That mark is the whole mechanism by which a failed give-back stays visible:
 * the answer shape carries no `wroteNothing` field, so an outstanding row keeps its take lines
 * and the published `consumed` is then exactly what is still missing, from exactly whom.
 *
 * A row whose whole bucket failed before the give-back reports its FULL planned allocation rather
 * than the part that was written, which over-states on the safe side. A caller deciding whether
 * to make a player whole again is better served by a number that cannot be too small.
 *
 * @param {Array<object>} undo
 * @returns {Promise<void>}
 */
async function unwind(undo) {
  for (const step of undo) {
    for (const row of step.rows) row.outstanding = false;
  }
  for (const step of undo.toReversed()) {
    let restored = false;
    try {
      restored = (await step.run()) === true;
    } catch (error) {
      console.error('Fabricate | A pooled holdings consume could not be given back', error);
    }
    if (restored) continue;
    for (const row of step.rows) row.outstanding = true;
  }
}

/**
 * The CALL-level outcome, derived from the rows alone.
 *
 * @param {Array<object>} rows
 * @returns {string}
 */
function callOutcome(rows) {
  if (rows.every((row) => row.outcome === COMPANION_OUTCOMES.consumed)) {
    return COMPANION_OUTCOMES.consumed;
  }
  if (rows.some((row) => row.outcome === COMPANION_OUTCOMES.insufficient)) {
    return COMPANION_OUTCOMES.insufficient;
  }
  return COMPANION_OUTCOMES.consumeFailed;
}

/**
 * Publish the ledger, giving every row that never got as far as a write the one outcome that
 * says so.
 *
 * `notAttempted` is a ROW word and never a call word — "nothing was attempted" is the consequence
 * of a reason, not a reason — so the offending row keeps its own token beside it.
 *
 * @param {string} outcome the CALL-level outcome
 * @param {Array<object>} actors
 * @param {Array<object>} rows
 * @returns {Readonly<object>}
 */
function publish(outcome, actors, rows) {
  for (const row of rows) {
    row.outcome ??= COMPANION_OUTCOMES.notAttempted;
    row.takes = row.outstanding ? row.taken : [];
  }
  return pooledHoldingsConsumeResult(outcome, null, {
    actorUuids: actors.map((actor) => actor?.uuid),
    ledger: rows,
  });
}

/**
 * Take a set of costs from what a set of actors holds between them — the behaviour published as
 * `game.fabricate.consumePooledHoldings` (issue 1342).
 *
 * The facade owns the GM gate, the UUID resolution, the readiness refusal and the `noActor` and
 * `invalidActorUuids` preamble; this leaf is handed the resolved actor documents in the order
 * they should pay, and the caller's order IS the allocation policy.
 *
 * **Costs are settled components-first and currency-second, but REPORTED in the caller's own
 * order**, because the ledger is index-addressed onto the request and a caller must be able to
 * map a row back onto the cost it wrote.
 *
 * **A shortfall anywhere refuses everywhere.** One cost the pool cannot cover refuses the whole
 * call as `insufficient` before anything is written, with every row reporting `attempted: false`.
 *
 * **Not idempotent** — see the module header. The `callSite` election removes the multi-client
 * duplication class and is not a lease; not double-consuming is the caller's obligation.
 *
 * @param {Array<object>|null} actors the already-resolved actor documents, in payment order
 * @param {object} request
 * @param {string} request.callSite one of `COMPANION_CALL_SITES`; required, no default
 * @param {Array<object>} request.costs the costs to take, as RESOLVED IDS — a component cost is
 *   `{type: 'component', systemId, componentId, quantity}` and a currency cost is
 *   `{type: 'currency', unitId, amount}`
 * @param {object} seams the injected collaborators, supplied by the facade
 * @param {() => boolean} seams.isElectedExecutor
 * @param {(systemId: string) => object|null} seams.resolveSystem
 * @param {(system: object, componentId: string) => object|null} seams.resolveComponent
 * @param {(actor: object, component: object, system: object) => Array<object>}
 *   seams.findComponentItems the PUBLISHED resolver, so what an award stacks onto and what this
 *   takes can never disagree
 * @param {() => object} [seams.getCurrencyConfig] read by the currency collaborators
 * @returns {Promise<Readonly<{success: boolean, actorUuids: ReadonlyArray<string>,
 *   consumed: number|null, ledger: ReadonlyArray<object>, outcome: string, message: string,
 *   messageData?: object}>>}
 */
export async function consumePooledHoldings(
  actors,
  { callSite = null, costs = null } = {},
  seams = {}
) {
  const refusal = gateCompanionCallSite({ callSite }, seams);
  if (refusal) return pooledHoldingsConsumeResult(refusal);

  const pool = validateActorPool(actors);
  if (!pool) {
    return pooledHoldingsConsumeResult(COMPANION_OUTCOMES.invalidActorUuids, {
      max: POOLED_ACTORS_MAX,
    });
  }

  const entries = validateCostEntries(costs);
  if (!entries) {
    return pooledHoldingsConsumeResult(COMPANION_OUTCOMES.invalidCosts, { max: POOLED_COSTS_MAX });
  }

  const rows = entries.map((cost) => startRow(cost));
  // The undo stack is the call's own and never module-scoped: a leaked one would hand a later
  // call the authority to put back documents it never took, on actors it was never given.
  const undo = [];
  try {
    const buckets = planComponentCosts(pool, rows, seams);
    const precheck = precheckRefusal(rows) ?? (await priceCurrencyCosts(pool, rows, seams));
    if (precheck) return publish(precheck, pool, rows);

    const took =
      (await takeComponentCosts(buckets, undo)) &&
      (await takeCurrencyCosts(pool, rows, callSite, seams, undo));
    if (!took) await unwind(undo);
    return publish(callOutcome(rows), pool, rows);
  } catch (error) {
    // The floor a `stable` member needs, and the asymmetry `readPooledHoldings` had already
    // closed for itself. `callActorWrite` and `unwind` carry the only other `try`s here, so every
    // OTHER seam is bare — `resolveSystem`, `resolveComponent`, `findComponentItems`,
    // `consumePooledCurrency`, `readPooledCurrencyBalance` — and optional chaining guards an
    // ABSENT method, never a throwing one. The shipped `findComponentItems` opens with
    // `const items = [...actor.items];`, which is a TypeError for any resolved document whose
    // `items` is not iterable; the crafting engine guards that same call with its own
    // `itemsIterable` test elsewhere, which is what says the case is real rather than defensive.
    //
    // It UNWINDS before publishing. A throw between two writes is exactly the state the undo
    // stack exists for, and a member that has already taken must not answer without giving back.
    console.error('Fabricate | Could not take pooled holdings from a set of actors', error);
    await unwind(undo);
    return publish(COMPANION_OUTCOMES.consumeFailed, pool, rows);
  }
}
