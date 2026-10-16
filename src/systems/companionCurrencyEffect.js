/**
 * The `currencyCredit` companion effect kind (issue 1954): one subwrite `r<i>` per recipient,
 * written through the world strategy's own spender. `actorProperty` is proven by the marker and
 * the post-value on the returned `_source`, `actorInventory` only by the delta measured around
 * the write, and a `macro` credit by nothing, so an interrupted one is uncertain.
 */
import { getByPath } from '../utils/objectPath.js';

import { currencyStrategyReplayClass } from './CoinSpenders.js';
import {
  effectFailureOf,
  exactObject,
  markerUpdateFor,
  nonblank,
  postValuesOf,
  readRecipients,
  sourceCarries,
} from './companionEffectSupport.js';
import { prepareWorldCurrencyCredit } from './currencyAffordance.js';
import { buildCurrencyRefundUpdates } from './currencyProfile.js';

const settled = (status, intent, receipt, failure) => ({ status, intent, receipt, failure });
const uncertain = (intent, reason, detail = null) =>
  settled('uncertain', intent, null, effectFailureOf(reason, detail));
const knownFailure = (intent, reason, detail = null) =>
  settled('knownFailure', intent, null, effectFailureOf(reason, detail));
const messageOf = (error) => error?.message ?? String(error);

function intentOf(prepared, postValues = null) {
  const { unit, amount, baseValue, creditedBase, strategy } = prepared;
  return { unitId: unit.id, amount, baseValue, creditedBase, strategy, postValues };
}

function receiptOf(prepared, observedDelta = null) {
  return { credited: prepared.amount, creditedBase: prepared.creditedBase, observedDelta };
}

/** Run the spender's refund; a throw is uncertain, a provable no-write is a known failure. */
async function refundOnce(prepared, intent, ctx) {
  const { actor, unit, amount, spender } = prepared;
  try {
    const result = await spender.refund(actor, { unit, amount }, ctx);
    if (result?.wroteNothing === true) {
      return { answer: knownFailure(intent, 'writeRefused', result.message ?? null) };
    }
    return { result };
  } catch (error) {
    return { answer: uncertain(intent, 'writeThrew', messageOf(error)) };
  }
}

async function readBalance(prepared) {
  const { actor, unit, profile, spender } = prepared;
  try {
    const read = await spender.readCoins?.(actor, { profile, unit, units: profile.units });
    return read?.valid ? Number(read.copperValue) : null;
  } catch {
    return null;
  }
}

/** Whether the inventory spender can read the balance now; a pending read is not a refusal. */
function balanceReadable({ actor, unit, profile, spender }) {
  try {
    const read = spender.readCoins?.(actor, { profile, unit, units: profile.units });
    return typeof read?.then === 'function' || read?.valid === true;
  } catch {
    return false;
  }
}

/**
 * The checks a credit would fail at write time, made without writing: an `actorProperty` refund
 * must build and every path it writes must already be on `_source`, and an `actorInventory`
 * balance must be readable. Answers `{ reason, detail? }`, or `{ updates }` once they hold.
 */
export function creditPreconditions(prepared) {
  const { actor, unit, amount, profile, strategy } = prepared;
  if (strategy === 'actorInventory') {
    return balanceReadable(prepared) ? {} : { reason: 'balanceUnreadable' };
  }
  if (strategy !== 'actorProperty') return {};
  const planned = buildCurrencyRefundUpdates(actor, { unit: unit.id, amount }, profile.units);
  if (!planned.valid) return { reason: 'refundInvalid', detail: planned.message ?? null };
  const paths = Object.keys(planned.updates ?? {});
  if (paths.length === 0 || paths.some((path) => getByPath(actor._source, path) == null)) {
    return { reason: 'currencySourceMissing' };
  }
  return { updates: planned.updates };
}

/** Marker and value ride in one `actor.update`; the value path must already be on `_source`. */
async function creditActorProperty(prepared, { marker, beforeWrite }) {
  const { reason, detail = null, updates } = creditPreconditions(prepared);
  if (reason) return knownFailure(null, reason, detail);
  const intent = intentOf(prepared, postValuesOf(updates));
  if ((await beforeWrite(intent)) !== true) return settled('notAttempted', intent, null, null);
  const ctx = { ...prepared.ctx, markerUpdate: markerUpdateFor(marker) };
  const { answer, result } = await refundOnce(prepared, intent, ctx);
  if (answer) return answer;
  const written = postValuesOf(result?.updates ?? {});
  if (result?.valid !== true || !sourceCarries(result.document, marker, written)) {
    return uncertain(intent, 'receiptMismatch');
  }
  return settled('applied', intent, receiptOf(prepared), null);
}

/**
 * Applied only when the balance moved by exactly the credited base across the write. Zero or any
 * other delta is uncertain: a concurrent spend can mask or mimic a write.
 */
async function creditActorInventory(prepared, { beforeWrite }) {
  const intent = intentOf(prepared);
  if ((await beforeWrite(intent)) !== true) return settled('notAttempted', intent, null, null);
  const before = await readBalance(prepared);
  if (before === null) return knownFailure(intent, 'balanceUnreadable');
  const { answer, result } = await refundOnce(prepared, intent, prepared.ctx);
  if (answer) return answer;
  if (result?.thrown === true) return uncertain(intent, 'writeThrew', result.message ?? null);
  const after = await readBalance(prepared);
  if (after === null) return uncertain(intent, 'balanceUnreadable');
  const delta = after - before;
  if (delta !== prepared.creditedBase) return uncertain(intent, 'deltaMismatch', String(delta));
  return settled('applied', intent, receiptOf(prepared, delta), null);
}

/** Runs once under intent-then-receipt; anything but a clean success is uncertain. */
async function creditMacro(prepared, { beforeWrite }) {
  const intent = intentOf(prepared);
  if ((await beforeWrite(intent)) !== true) return settled('notAttempted', intent, null, null);
  const { answer, result } = await refundOnce(prepared, intent, prepared.ctx);
  if (answer) return answer;
  if (result?.valid !== true || result.thrown === true) {
    return uncertain(intent, 'macroIndeterminate', result?.message ?? null);
  }
  return settled('applied', intent, receiptOf(prepared), null);
}

const WRITERS = Object.freeze({
  actorProperty: creditActorProperty,
  actorInventory: creditActorInventory,
  macro: creditMacro,
});

function probeCredit(prepared, { intent }, marker) {
  const values = intent?.postValues;
  if (prepared.strategy !== 'actorProperty' || !Array.isArray(values)) {
    return { status: 'uncertain', receipt: null };
  }
  return sourceCarries(prepared.actor, marker, values)
    ? { status: 'applied', receipt: receiptOf(prepared) }
    : { status: 'uncertain', receipt: null };
}

/** Prepare every recipient's credit without writing, or answer the first refusal. */
function prepareCredits(payload, seams) {
  if (!exactObject(payload, ['recipients', 'unitId']) || !nonblank(payload.unitId)) {
    return { failure: effectFailureOf('invalidPayload') };
  }
  const read = readRecipients(payload, 'amount', { list: false });
  if (read.failure) return read;
  const credits = [];
  for (const { actorId, amount } of read.recipients) {
    const prepared = prepareWorldCurrencyCredit({ actorId, unitId: payload.unitId, amount }, seams);
    if (prepared.outcome) return { failure: effectFailureOf(prepared.outcome, actorId) };
    const { actor } = prepared;
    if (actor.isToken === true || !nonblank(actor.uuid)) {
      return { failure: effectFailureOf('actorNotFound', actorId) };
    }
    credits.push(prepared);
  }
  return { credits };
}

export function createCurrencyCreditKind(seams) {
  function plan(payload) {
    const prepared = prepareCredits(payload, seams);
    if (prepared.failure) return prepared;
    const { strategy, spender } = prepared.credits[0];
    const replayClass = currencyStrategyReplayClass(strategy);
    if (!replayClass || typeof spender?.refund !== 'function') {
      return { failure: effectFailureOf('creditNotConfigured', strategy ?? null) };
    }
    const write = WRITERS[strategy];
    const units = prepared.credits.map((credit, index) => ({
      subwriteId: `r${index}`,
      target: { actorUuid: credit.actor.uuid },
      write: (context) => write(credit, context),
      probe: (subwrite, marker) => probeCredit(credit, subwrite, marker),
      preconditions: () => creditPreconditions(credit),
    }));
    return { replayClass, units };
  }
  return Object.freeze({ plan });
}
