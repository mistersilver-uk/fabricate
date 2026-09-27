/**
 * The internal companion effect executor (issue 1954). No ingress invokes it yet: bootstrap does
 * not wire it, so no effect runs in this increment.
 *
 * It walks the stored record's effects in plan order under the held run claim. Per subwrite it
 * checks the claim, persists `applying` with the intent, checks the claim again, writes once,
 * and persists what the write proved. It never throws for an uncertain write, a lost claim or a
 * store answer other than `updated`: it returns a summary, so the run authority releases a claim
 * the stored evidence already guards. Only a lost claim after a recorded intent asks for recovery.
 */
import { createCompanionEffectKinds } from './companionEffectKinds.js';
import { effectFailureOf } from './companionEffectSupport.js';
import { createCompanionOperationStore } from './companionOperationStore.js';

const SETTLED_CHANGE = Object.freeze({
  applied: (result) => ({ type: 'applied', receipt: result.receipt }),
  knownFailure: (result) => ({ type: 'knownFailure', failure: result.failure }),
  uncertain: (result) => ({ type: 'uncertain', failure: result.failure }),
});

function summary(status, reason, where, recoveryRequired) {
  return {
    status,
    reason,
    effectId: where.effectId ?? null,
    subwriteId: where.subwriteId ?? null,
    recoveryRequired,
  };
}

function stopped(reason, where) {
  return summary('stopped', reason, where, false);
}

function effectIndex(record, effectId) {
  return record.plan.effects.findIndex((effect) => effect.effectId === effectId);
}

function effectState(record, effectId) {
  return record.effectStates[effectIndex(record, effectId)];
}

function subwritePhase(record, effectId, subwriteId) {
  const { evidence } = effectState(record, effectId);
  if (evidence === null) return 'pending';
  return evidence.subwrites.find((subwrite) => subwrite.subwriteId === subwriteId)?.phase ?? null;
}

function awaitsDecision(record, effect) {
  const pending = new Set(
    record.decisionStates.filter(({ state }) => state === 'pending').map((slot) => slot.decisionId)
  );
  return effect.requiresDecisionIds.some((decisionId) => pending.has(decisionId));
}

/** One run over one stored record; `record` always holds the last stored revision. */
class EffectRun {
  constructor({ store, heldClaim, kinds, record }) {
    this.store = store;
    this.heldClaim = heldClaim;
    this.kinds = kinds;
    this.record = record;
  }

  claimHeld() {
    return this.heldClaim.claimStillHeld();
  }

  /** Persist one change, adding the skeleton while the effect is still pending. */
  async persist(where, change, skeleton = null) {
    const pending = effectState(this.record, where.effectId).phase === 'pending';
    const answer = await this.store.transitionEffect(this.record.operationId, {
      effectId: where.effectId,
      subwriteId: where.subwriteId ?? null,
      expectedRevision: this.record.revision,
      change: pending && skeleton ? { ...change, skeleton } : change,
    });
    if (answer.status === 'updated') this.record = answer.record;
    return answer;
  }

  /** A record-only change, made under a proven claim. */
  async persistClaimed(where, change) {
    if (!(await this.claimHeld())) return stopped('claimLost', where);
    const answer = await this.persist(where, change);
    return answer.status === 'updated' ? null : stopped(answer.status, where);
  }

  async walk() {
    if (this.record.outcome !== null) return stopped('terminal', {});
    for (const effect of this.record.plan.effects) {
      const where = { effectId: effect.effectId };
      const { phase, evidence } = effectState(this.record, effect.effectId);
      if (phase === 'applied' || phase === 'waived') continue;
      if (phase === 'pending' && awaitsDecision(this.record, effect)) {
        return stopped('awaitingDecision', where);
      }
      const resumable =
        phase === 'applying' &&
        evidence !== null &&
        evidence.subwrites.every((subwrite) => subwrite.phase !== 'applying');
      if (phase !== 'pending' && !resumable) return stopped('effectNotApplied', where);
      const stop = await this.runEffect(effect);
      if (stop) return stop;
      if (effectState(this.record, effect.effectId).phase !== 'applied') {
        return stopped('effectNotApplied', where);
      }
    }
    return this.complete();
  }

  async complete() {
    if (this.record.effectStates.some(({ phase }) => phase !== 'applied')) {
      return stopped('effectNotApplied', {});
    }
    if (!(await this.claimHeld())) return stopped('claimLost', {});
    const answer = await this.store.complete(this.record.operationId, {
      expectedRevision: this.record.revision,
    });
    if (answer.status !== 'updated') return stopped(answer.status, {});
    this.record = answer.record;
    return summary('completed', null, {}, false);
  }

  async runEffect(effect) {
    const where = { effectId: effect.effectId };
    const { evidence } = effectState(this.record, effect.effectId);
    const kind = Object.hasOwn(this.kinds, effect.kind) ? this.kinds[effect.kind] : null;
    const planned = kind
      ? await kind.plan(effect.payload, evidence)
      : { failure: effectFailureOf('unknownKind', effect.kind) };
    if (planned.failure && evidence === null) {
      return (
        (await this.persistClaimed(where, { type: 'effectFailure', failure: planned.failure })) ??
        stopped('effectFailed', where)
      );
    }
    const drift = planned.failure ?? planDrift(planned, evidence);
    if (drift) return this.failPending(where, evidence, drift);
    const skeleton = {
      replayClass: planned.replayClass,
      subwrites: planned.units.map(({ subwriteId, target }) => ({ subwriteId, target })),
    };
    for (const unit of planned.units) {
      if (subwritePhase(this.record, effect.effectId, unit.subwriteId) !== 'pending') continue;
      const stop = await this.runSubwrite(
        { ...where, subwriteId: unit.subwriteId },
        unit,
        skeleton
      );
      if (stop) return stop;
    }
    return null;
  }

  /** A resumed effect that no longer plans settles its pending subwrites as known failures. */
  async failPending(where, evidence, failure) {
    for (const { subwriteId, phase } of evidence.subwrites) {
      if (phase !== 'pending') continue;
      const change = { type: 'knownFailure', failure };
      const stop = await this.persistClaimed({ ...where, subwriteId }, change);
      if (stop) return stop;
    }
    return stopped('effectNotApplied', where);
  }

  async runSubwrite(where, unit, skeleton) {
    if (!(await this.claimHeld())) return stopped('claimLost', where);
    let stop = null;
    const beforeWrite = async (intent) => {
      const answer = await this.persist(where, { type: 'applying', intent }, skeleton);
      if (answer.status !== 'updated') {
        stop = stopped(answer.status, where);
        return false;
      }
      if (!(await this.claimHeld())) {
        stop = summary('stopped', 'claimLost', where, true);
        return false;
      }
      return true;
    };
    const marker = { operationId: this.record.operationId, ...where };
    const result = await unit.write({ marker, beforeWrite });
    const toChange = Object.hasOwn(SETTLED_CHANGE, result?.status)
      ? SETTLED_CHANGE[result.status]
      : null;
    if (!toChange) return stop ?? stopped('notAttempted', where);
    const answer = await this.persist(where, toChange(result), skeleton);
    if (answer.status !== 'updated') return stopped('receiptUnrecorded', where);
    return result.status === 'uncertain' ? stopped('uncertain', where) : null;
  }
}

/** The failure a resumed effect's evidence and its fresh plan disagree by, or `null`. */
function planDrift(planned, evidence) {
  if (evidence === null) return null;
  if (planned.replayClass !== evidence.replayClass) {
    return effectFailureOf('planChanged', 'replayClass');
  }
  const ids = planned.units.map(({ subwriteId }) => subwriteId);
  const same =
    ids.length === evidence.subwrites.length &&
    evidence.subwrites.every(({ subwriteId }, index) => ids[index] === subwriteId);
  return same ? null : effectFailureOf('planChanged', 'subwrites');
}

function storeFor(createStore, heldClaim, clock) {
  try {
    return createStore({
      ledger: heldClaim.ledger,
      readAuthoritativeLedger: heldClaim.readAuthoritativeLedger,
      clock,
    });
  } catch {
    return null;
  }
}

/**
 * Create the executor, `async ({ record, heldClaim }) => summary`, where the summary is
 * `{ status: 'completed'|'stopped', reason, effectId, subwriteId, recoveryRequired }`.
 * `executor.probe({ record, effectId, subwriteId })` answers `applied` with a receipt or
 * `uncertain` for an applying subwrite, for later recovery; nothing here calls it.
 */
export function createCompanionOperationEffectExecutor(seams = {}) {
  const { createStore = createCompanionOperationStore, clock = Date.now } = seams;
  const kinds = createCompanionEffectKinds(seams);

  async function execute({ record, heldClaim }) {
    const store = storeFor(createStore, heldClaim, clock);
    if (!store) return stopped('storeUnavailable', {});
    return new EffectRun({ store, heldClaim, kinds, record }).walk();
  }

  async function probe({ record, effectId, subwriteId }) {
    const uncertain = { status: 'uncertain', receipt: null };
    const effect = record.plan.effects.find((entry) => entry.effectId === effectId);
    const subwrite = effectState(record, effectId)?.evidence?.subwrites.find(
      (entry) => entry.subwriteId === subwriteId
    );
    if (!effect || !subwrite?.intent || !Object.hasOwn(kinds, effect.kind)) return uncertain;
    const planned = await kinds[effect.kind].plan(effect.payload, null);
    const unit = planned.units?.find((entry) => entry.subwriteId === subwriteId);
    if (!unit) return uncertain;
    const marker = { operationId: record.operationId, effectId, subwriteId };
    return unit.probe(subwrite, marker);
  }

  execute.probe = probe;
  return Object.freeze(execute);
}
