/**
 * The Pooled Holdings Consume: `game.fabricate.consumePooledHoldings` (issue 1342), taking costs
 * from what a set of actors holds between them; the only contract member that removes value.
 * Costs arrive as ids (`{type: 'component', systemId, componentId, quantity}` or
 * `{type: 'currency', unitId, amount}`), never names: core's name matcher is case-sensitive and
 * deprecated (issue 540).
 * Components first, currency second: a deleted item is restored exactly from its pre-delete
 * `toObject()` with `keepId` (only `_stats` is refreshed), while a currency give-back may not
 * exist (`macro` with no `increment`), creates treasure (`pf2e`) or lands in another
 * denomination (`actorProperty`). A world with no give-back is refused up front as
 * `creditNotConfigured`, having written nothing. Foundry's `keepId` restore and batched-write
 * facts are in `.agents/docs/foundry-and-architecture.md`.
 * Three phases: a whole-call pre-check that writes nothing (one shortfall refuses the whole call
 * as `insufficient`, every row `attempted: false`); the component arm, one batched update and
 * one batched delete per actor, reductions first; then one `consumePooledCurrency` per currency
 * cost. Any failure gives back everything this call took, newest first.
 * Not idempotent, as `awardComponents`: the caller owns not double-consuming, and the `callSite`
 * election is not a lease. A restore fires `createItem` hooks and leaves held `Item` references
 * stale. A Foundry-free leaf: the facade gates and resolves, everything else is a seam.
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
 * The currency leg's refusals mapped onto the consume's row tokens; identity rows are listed as
 * decisions. Anything unmapped (`ladderEmpty`, `ladderInvalid`, `balanceNotConfigured`) becomes a
 * call-level `consumeFailed` with every row `notAttempted`.
 */
const CURRENCY_LEG_ROW_OUTCOMES = Object.freeze({
  [COMPANION_OUTCOMES.invalidAmount]: COMPANION_OUTCOMES.invalidQuantity,
  [COMPANION_OUTCOMES.unitNotFound]: COMPANION_OUTCOMES.unitNotFound,
  [COMPANION_OUTCOMES.insufficient]: COMPANION_OUTCOMES.insufficient,
  [COMPANION_OUTCOMES.consumeFailed]: COMPANION_OUTCOMES.consumeFailed,
});

/**
 * A whole positive safe-integer quantity (a numeric string included) or `null`, refused never
 * coerced, as `normalizeAwardQuantity`; the currency leg validates its own amount, and this only
 * decides the echoed `requested`.
 */
function normalizeCostQuantity(value) {
  const numeric =
    typeof value === 'number' || (typeof value === 'string' && value.trim() !== '')
      ? Number(value)
      : NaN;
  return Number.isSafeInteger(numeric) && numeric > 0 ? numeric : null;
}

/**
 * The resolved pool, or `null` to refuse `invalidActorUuids`: bound, shape and set-ness are
 * re-tested at the boundary that writes. Each actor needs a `uuid`, since the echo drops a
 * non-string and would hide a payer; duplicates are by identity, as `gatePooledActorUuids`.
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

/** The `costs` list, or `null` to refuse `invalidCosts`: empty refuses, as does a non-object. */
function validateCostEntries(costs) {
  if (!Array.isArray(costs) || costs.length === 0 || costs.length > POOLED_COSTS_MAX) return null;
  const usable = (cost) => Boolean(cost) && typeof cost === 'object' && !Array.isArray(cost);
  return costs.every((cost) => usable(cost)) ? costs : null;
}

/** A cost axis's refusal, or `null`; `tool` wear is out of scope (`costTypeUnsupported`). */
function costTypeRefusal(type) {
  if (type === COMPONENT || type === CURRENCY) return null;
  if (type === TOOL || POOLED_UNSERVED_COST_TYPES.includes(type)) {
    return COMPANION_OUTCOMES.costTypeUnsupported;
  }
  return COMPANION_OUTCOMES.invalidCostType;
}

/**
 * The internal record of one cost; `index`, `attempted` and `consumed` are derived by the
 * contract. `taken` is what a write moved and `outstanding` whether it is still moved, so a
 * rolled-back row publishes `[]`. `raw` is the caller's value, which the currency leg validates.
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

// Phase 1a: planning the component costs. Nothing here writes or awaits.

/**
 * One component cost's candidates: the order is `pooledItemOrder`'s (first-fit, so a read and a
 * consume drain alike) and the membership `findComponentItems`', tested by identity so an item
 * outside the actors' own lists is dropped.
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
 * Bucket a component row by (system, component), or refuse it: caller arguments first, then the
 * system. Two costs naming one component share a bucket, so they never take the same stack twice.
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

/** Hand each row its share of the bucket's drain, by a cursor, since a take may span two rows. */
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
 * Plan every component cost; never awaits. Documents an earlier bucket takes from are withdrawn
 * from later ones, since components of different systems can match one item. Withdrawal is per
 * document and conservative: it may refuse what a perfect allocator could satisfy, but never
 * lets two plans drain one stack.
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

// Phase 1b: pricing the currency costs. Reads the pool; writes nothing.

/**
 * Ask `consumePooledCurrency`, the one home of the rule, for its configuration refusals with an
 * empty actor set, before any write; chiefly `creditNotConfigured`. An empty pool cannot write or
 * fire a `balance` macro and manufactures only `insufficient`, which is ignored. `requiredBase`
 * and `baseUnitId` are the currency module's own answers.
 */
async function probeCurrencyRequest(row, seams) {
  const request = { unitId: row.unitId, amount: row.raw };
  const probe = await consumePooledCurrency([], request, seams);
  const outcome = probe.outcome === COMPANION_OUTCOMES.insufficient ? null : probe.outcome;
  return { outcome, requiredBase: probe.requiredBase, baseUnitId: probe.baseUnitId };
}

/**
 * Record a currency refusal on its row and answer the call-level refusal; `creditNotConfigured`
 * stays call-level and its row publishes `notAttempted`.
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
 * Bucket a currency row by its terminal base unit, or refuse it: costs drawing on one balance are
 * priced jointly (2 gp and 30 sp are one coin), or the pre-check passes a call the pool cannot
 * cover and publishes `insufficient` after a real debit. No denomination arithmetic here.
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
 * Price one group once. An unreadable pool is a call-level `consumeFailed`, never zero; a
 * shortfall, or a total past the safe-integer bound, marks every row in the group `insufficient`.
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

/** Price every currency cost in two passes; the first reads no pool and fires no macro. */
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

/** The call-level pre-check refusal: `insufficient` for a shortfall, else `consumeFailed`. */
function precheckRefusal(rows) {
  const offender = rows.find((row) => row.outcome !== null);
  if (!offender) return null;
  return offender.outcome === COMPANION_OUTCOMES.insufficient
    ? COMPANION_OUTCOMES.insufficient
    : COMPANION_OUTCOMES.consumeFailed;
}

// Phase 2: the component arm, batched per actor and snapshot-backed.

/**
 * One embedded write, with an absent method, a short answer and a rejection all answered `[]`:
 * the caller compares answered ids against requested ones and unwinds. A vanished id rejects the
 * whole batch (see `.agents/docs/foundry-and-architecture.md`), and this member never throws.
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

/** Write back each reduced stack's pre-take `available`: exact, never an increment. */
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
 * Reduce one actor's stacks in one batched update, before any delete: a reduction is cheaper to
 * undo. The ambient stack-quantity path is used, as `planFirstFitDrain` read through it.
 */
async function reduceStacks(actor, takes) {
  if (takes.length === 0) return { ok: true, undo: null };
  const updates = [];
  for (const take of takes) {
    const payload = stackQuantityUpdate(take.item, take.remainingQuantity);
    // `null`: the path resolves an object here, so a numeric write would destroy it.
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
 * Re-create deleted documents with `keepId`, so `_id` and UUID survive; `keepEmbeddedIds` is the
 * default, spelled because it keeps active-effect ids.
 */
async function restoreItems(actor, payloads) {
  const created = await callActorWrite(actor, 'createEmbeddedDocuments', payloads, {
    keepId: true,
    keepEmbeddedIds: true,
  });
  return Array.isArray(created) && created.length === payloads.length;
}

/**
 * Delete one actor's exhausted stacks in one batch; an item with no `toObject` refuses the group
 * first. The restore covers only the ids the delete answered, since a `keepId` create onto a
 * still-held id is rejected.
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

/** Take one bucket's plan; each undo step is pushed once its write moved anything, even failing. */
async function takeComponentBucket(bucket, undo) {
  for (const group of bucket.plan.groups) {
    // `planFirstFitDrain` records `parent: null` for an item with no owning document.
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

/** One component row's take lines; `unitId` and `share` are answered empty for one shape. */
function allocationTakes(row) {
  return row.allocation.map(({ take, quantity }) => ({
    actorUuid: take.parent?.uuid ?? null,
    documentUuid: take.item?.uuid ?? null,
    quantity,
    unitId: null,
    share: [],
  }));
}

/** A component row's token: `notAttempted` unless some write in the bucket moved something. */
function componentRowOutcome(ok, moved) {
  if (ok) return COMPANION_OUTCOMES.consumed;
  return moved ? COMPANION_OUTCOMES.consumeFailed : COMPANION_OUTCOMES.notAttempted;
}

async function takeComponentCosts(buckets, undo) {
  for (const bucket of buckets.values()) {
    const depth = undo.length;
    const ok = await takeComponentBucket(bucket, undo);
    // `outstanding` is what a write actually moved, never what the plan intended.
    const moved = ok || undo.length > depth;
    for (const row of bucket.rows) {
      row.taken = allocationTakes(row);
      row.outstanding = moved;
      // The same fact picks the token: the contract derives `attempted` from it, so a bucket
      // refused before its first write is `notAttempted`; the call still answers `consumeFailed`.
      row.outcome = componentRowOutcome(ok, moved);
    }
    if (!ok) return false;
  }
  return true;
}

// Phase 3: the currency arm.

/**
 * One currency settlement's take lines. `quantity` is in the terminal base unit while `requested`
 * echoes the caller's denomination, deliberately unreconciled (a converted share is fractional);
 * `unitId` and `share` make it readable. `documentUuid` is always `null`: no spender names one.
 */
function currencyTakes(ledger, keep) {
  return (Array.isArray(ledger) ? ledger : [])
    .filter((entry) => keep(entry))
    .map((entry) => ({
      actorUuid: entry.actorUuid,
      documentUuid: null,
      quantity: entry.amount,
      unitId: entry.unitId,
      share: entry.share,
    }));
}

/**
 * A currency row's failure token. `attempted` derives from it, so a failure the leg took before
 * any spend (`wroteNothing`) is `notAttempted`, never `consumeFailed`.
 */
function currencyFailureRowOutcome(answer) {
  const mapped = CURRENCY_LEG_ROW_OUTCOMES[answer.outcome];
  if (mapped) return mapped;
  return answer.wroteNothing === true
    ? COMPANION_OUTCOMES.notAttempted
    : COMPANION_OUTCOMES.consumeFailed;
}

/** Give settled coin back through `creditWorldCurrency`, in the ledger's base unit. */
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
 * Settle one currency cost. A failure the leg already gave back for is not given back again; its
 * ledger's `restored` leaves only the coin still gone.
 */
async function takeCurrencyRow(actors, row, callSite, seams, undo) {
  const request = { unitId: row.unitId, amount: row.raw };
  const answer = await consumePooledCurrency(actors, request, seams);
  const settled = (entry) => entry.settled === true;
  if (answer.outcome) {
    row.outcome = currencyFailureRowOutcome(answer);
    row.taken = currencyTakes(answer.ledger, (entry) => settled(entry) && entry.restored === false);
    // No undo step: the leg already ran its own give-back.
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

async function takeCurrencyCosts(actors, rows, callSite, seams, undo) {
  for (const row of rows) {
    if (row.type !== CURRENCY) continue;
    if (!(await takeCurrencyRow(actors, row, callSite, seams, undo))) return false;
  }
  return true;
}

// Unwinding, and the published answer.

/**
 * Give back everything this call took, newest first. Covered rows are cleared, then a failing
 * step re-marks its own, so an outstanding row keeps its take lines and `consumed` publishes what
 * is still missing; a bucket that failed reports its full allocation, erring high.
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

/** The call-level outcome, derived from the rows alone. */
function callOutcome(rows) {
  if (rows.every((row) => row.outcome === COMPANION_OUTCOMES.consumed)) {
    return COMPANION_OUTCOMES.consumed;
  }
  if (rows.some((row) => row.outcome === COMPANION_OUTCOMES.insufficient)) {
    return COMPANION_OUTCOMES.insufficient;
  }
  return COMPANION_OUTCOMES.consumeFailed;
}

/** Publish the ledger; a row that never reached a write answers `notAttempted`. */
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
 * `game.fabricate.consumePooledHoldings`. The facade owns the GM gate, UUID resolution,
 * readiness and actor-set refusals; `actors` arrive in payment order, which is the allocation
 * policy. Settled components-first but reported in the caller's order; a shortfall anywhere
 * refuses everywhere before any write. `seams.findComponentItems` is the published resolver.
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
  // Per call, never module-scoped: a leaked stack could restore onto actors never given.
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
    // A `stable` member's floor: only `callActorWrite` and `unwind` catch, so any other seam can
    // throw (the shipped `findComponentItems` spreads `actor.items`). Unwind before publishing.
    console.error('Fabricate | Could not take pooled holdings from a set of actors', error);
    await unwind(undo);
    return publish(COMPANION_OUTCOMES.consumeFailed, pool, rows);
  }
}
