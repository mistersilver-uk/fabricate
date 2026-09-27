import assert from 'node:assert/strict';
import test from 'node:test';

import {
  COMPANION_REPLAY_CLASSES,
  CompanionOperationRecordError,
  completeCompanionOperationRecord,
  createCompanionOperationRecord,
  deriveCompanionEffectPhase,
  hasInFlightCompanionEffect,
  observeCompanionOperationRecord,
  transitionCompanionOperationEffect,
} from '../src/systems/companionOperationRecord.js';
import {
  FAILURE,
  INTENT,
  RECEIPT,
  TARGET,
  evidenceOf,
  subwrite,
} from './helpers/companionEffectEvidence.js';

const OPERATION_ID = 'AbCdEfGhIjKlMn01';
const TRANSITION = 'INVALID_COMPANION_EFFECT_TRANSITION';
const SKELETON = {
  replayClass: 'structuredMarker',
  subwrites: ['r0.a0', 'r0.a1', 'r0.a2'].map((subwriteId) => ({ subwriteId, target: TARGET })),
};

function plan({ effects = ['award'], decisionBound = false } = {}) {
  return {
    schemaVersion: 1,
    source: { namespace: 'fabricate-premium', occurrenceId: 'activity-1', kind: 'resolution' },
    decisions: decisionBound ? [{ decisionId: 'check', kind: 'roll', payload: null }] : [],
    effects: effects.map((effectId) => ({
      effectId,
      kind: 'componentAward',
      payload: { systemId: 'sys' },
      requiresDecisionIds: decisionBound ? ['check'] : [],
    })),
  };
}

function accepted(options) {
  return createCompanionOperationRecord({ operationId: OPERATION_ID, plan: plan(options) }, 100);
}

/** A record at revision 1 whose first effect holds `evidence`, observed as valid or thrown. */
function withEvidence(evidence, { phase = deriveCompanionEffectPhase(evidence), effects } = {}) {
  const record = accepted({ effects });
  record.revision = 1;
  record.updatedAt = 110;
  record.effectStates[0] = { effectId: record.effectStates[0].effectId, phase, evidence, waiver: null };
  const next = { ...record, state: phaseState(record) };
  return next;
}

function phaseState(record) {
  const phases = record.effectStates.map(({ phase }) => phase);
  if (phases.includes('reviewRequired')) return 'reviewRequired';
  if (phases.includes('knownFailure')) return 'failed';
  return 'pending';
}

function step(record, change, { effectId = 'award', subwriteId = 'r0.a0', at = 200 } = {}) {
  return transitionCompanionOperationEffect(record, {
    effectId,
    subwriteId,
    expectedRevision: record.revision,
    at,
    change,
  });
}

function refuses(fn, code = TRANSITION) {
  assert.throws(fn, (error) => error instanceof CompanionOperationRecordError && error.code === code);
}

function invalidRecord(record) {
  refuses(() => observeCompanionOperationRecord(record), 'INVALID_COMPANION_OPERATION_RECORD');
}

test('the replay-class set is closed and each v1 subwrite phase has one valid pairing', () => {
  assert.deepEqual(COMPANION_REPLAY_CLASSES, [
    'structuredMarker',
    'structuredObserved',
    'idempotentKey',
    'opaqueMacro',
  ]);
  for (const replayClass of COMPANION_REPLAY_CLASSES) {
    const record = withEvidence(evidenceOf(['applied'], replayClass));
    assert.deepEqual(observeCompanionOperationRecord(record), record);
  }
  for (const phases of [['pending', 'applying'], ['applied'], ['knownFailure'], ['uncertain']]) {
    const record = withEvidence(evidenceOf(phases));
    assert.deepEqual(observeCompanionOperationRecord(record).effectStates[0], record.effectStates[0]);
  }
  const knownWithoutIntent = evidenceOf(['applied'], 'idempotentKey');
  knownWithoutIntent.subwrites[0] = subwrite('applied', 'r0.k0', {
    intent: null,
    receipt: { result: 'alreadyKnown' },
  });
  observeCompanionOperationRecord(withEvidence(knownWithoutIntent));
  const refusedBeforeIntent = evidenceOf(['knownFailure']);
  refusedBeforeIntent.subwrites[0].intent = null;
  observeCompanionOperationRecord(withEvidence(refusedBeforeIntent));
  const effectFailure = { evidenceVersion: 1, replayClass: null, failure: FAILURE, subwrites: [] };
  assert.equal(observeCompanionOperationRecord(withEvidence(effectFailure)).state, 'failed');
});

test('evidence that breaks its shape, pairing or phase fails closed', () => {
  const cases = [];
  const variant = (mutate, phases = ['applied'], replayClass = 'structuredMarker') => {
    const evidence = evidenceOf(phases, replayClass);
    mutate(evidence);
    cases.push(withEvidence(evidence, { phase: phaseOf(phases) }));
  };
  variant((evidence) => delete evidence.failure);
  variant((evidence) => (evidence.extra = true));
  variant((evidence) => (evidence.evidenceVersion = 2));
  variant((evidence) => (evidence.replayClass = 'marker'));
  variant((evidence) => (evidence.replayClass = null));
  variant((evidence) => (evidence.subwrites = []));
  variant((evidence) => (evidence.failure = FAILURE));
  variant((evidence) => delete evidence.subwrites[0].receipt);
  variant((evidence) => (evidence.subwrites[0].subwriteId = ' '));
  variant((evidence) => (evidence.subwrites[0].target = null));
  variant((evidence) => (evidence.subwrites[0].phase = 'done'));
  variant((evidence) => evidence.subwrites.push(structuredClone(evidence.subwrites[0])));
  variant((evidence) => (evidence.subwrites[0].receipt = null));
  variant((evidence) => (evidence.subwrites[0].failure = FAILURE));
  variant((evidence) => (evidence.subwrites[0].intent = null));
  variant(
    (evidence) => Object.assign(evidence.subwrites[0], { intent: null, receipt: { result: 'x' } }),
    ['applied'],
    'idempotentKey'
  );
  variant(
    (evidence) =>
      Object.assign(evidence.subwrites[0], { intent: null, receipt: { result: 'alreadyKnown' } }),
    ['applied'],
    'structuredMarker'
  );
  variant((evidence) => (evidence.subwrites[0].intent = INTENT), ['pending', 'applying']);
  variant((evidence) => (evidence.subwrites[1].intent = null), ['pending', 'applying']);
  variant((evidence) => (evidence.subwrites[1].receipt = RECEIPT), ['pending', 'applying']);
  variant((evidence) => (evidence.subwrites[0].failure = null), ['knownFailure']);
  variant((evidence) => (evidence.subwrites[0].receipt = RECEIPT), ['knownFailure']);
  variant((evidence) => (evidence.subwrites[0].intent = null), ['uncertain']);
  variant((evidence) => (evidence.subwrites[0].failure = null), ['uncertain']);
  variant((evidence) => (evidence.subwrites[0].intent = 'create'), ['uncertain']);
  cases.push(withEvidence(evidenceOf(['applied', 'pending']), { phase: 'applied' }));
  cases.push(withEvidence(evidenceOf(['uncertain']), { phase: 'knownFailure' }));

  const pendingWithEvidence = accepted();
  pendingWithEvidence.effectStates[0].evidence = evidenceOf(['pending']);
  cases.push(pendingWithEvidence);

  const twoApplying = withEvidence(evidenceOf(['applying']), { effects: ['award', 'coin'] });
  twoApplying.effectStates[1] = {
    effectId: 'coin',
    phase: 'applying',
    evidence: evidenceOf(['applying']),
    waiver: null,
  };
  cases.push(twoApplying);

  for (const record of cases) invalidRecord(record);
});

test('effect phase derivation follows the stated precedence', () => {
  const derive = (phases, failure = null) =>
    deriveCompanionEffectPhase({ ...evidenceOf(phases), failure });
  assert.equal(derive([], FAILURE), 'knownFailure');
  assert.equal(derive(['uncertain', 'knownFailure', 'pending']), 'reviewRequired');
  assert.equal(derive(['knownFailure', 'pending']), 'applying');
  assert.equal(derive(['applied', 'applying']), 'applying');
  assert.equal(derive(['applied', 'knownFailure']), 'knownFailure');
  assert.equal(derive(['applied', 'applied']), 'applied');
});

test('a partial award walks intent, receipt and known failure, keeping the record pending mid-run', () => {
  const start = accepted();
  const input = structuredClone(start);
  let record = step(start, { type: 'applying', intent: INTENT, skeleton: SKELETON });
  assert.deepEqual(start, input, 'the input record is not mutated');
  assert.equal(record.revision, 1);
  assert.equal(record.updatedAt, 200);
  assert.equal(record.acceptedAt, 100);
  assert.deepEqual(record.plan, start.plan);
  assert.equal(record.state, 'pending');
  assert.equal(record.effectStates[0].phase, 'applying');
  assert.deepEqual(
    record.effectStates[0].evidence.subwrites.map(({ phase }) => phase),
    ['applying', 'pending', 'pending']
  );
  assert.equal(hasInFlightCompanionEffect(record), true);

  record = step(record, { type: 'applied', receipt: RECEIPT }, { at: 201 });
  assert.equal(hasInFlightCompanionEffect(record), false, 'only pending subwrites remain');
  record = step(record, { type: 'applying', intent: INTENT }, { subwriteId: 'r0.a1' });
  record = step(record, { type: 'knownFailure', failure: FAILURE }, { subwriteId: 'r0.a1' });
  assert.equal(record.effectStates[0].phase, 'applying');
  assert.equal(record.state, 'pending', 'a failed subwrite with siblings pending is not failed yet');
  refuses(() => step(record, { type: 'knownFailure', failure: FAILURE }, { subwriteId: 'r0.a1' }));
  refuses(() =>
    step(record, { type: 'applying', intent: INTENT, skeleton: SKELETON }, { subwriteId: 'r0.a2' })
  );

  record = step(record, { type: 'applying', intent: INTENT }, { subwriteId: 'r0.a2' });
  record = step(record, { type: 'applied', receipt: RECEIPT }, { subwriteId: 'r0.a2', at: 250 });
  assert.equal(record.revision, 6);
  assert.equal(record.updatedAt, 250);
  assert.equal(record.effectStates[0].phase, 'knownFailure');
  assert.equal(record.state, 'failed');
  assert.deepEqual(
    record.effectStates[0].evidence.subwrites.map(({ subwriteId, phase }) => [subwriteId, phase]),
    [
      ['r0.a0', 'applied'],
      ['r0.a1', 'knownFailure'],
      ['r0.a2', 'applied'],
    ]
  );
  refuses(() => completeCompanionOperationRecord(record, { expectedRevision: 6, at: 300 }));
});

test('an uncertain subwrite rolls up to review and settled subwrites never change', () => {
  let record = step(accepted(), { type: 'applying', intent: INTENT, skeleton: SKELETON });
  const uncertain = step(record, { type: 'uncertain', failure: { detail: 'write threw' } });
  assert.equal(uncertain.effectStates[0].phase, 'reviewRequired');
  assert.equal(uncertain.state, 'reviewRequired');
  assert.equal(hasInFlightCompanionEffect(uncertain), false);

  record = step(record, { type: 'applied', receipt: RECEIPT });
  for (const change of [
    { type: 'applying', intent: INTENT },
    { type: 'applied', receipt: RECEIPT },
    { type: 'knownFailure', failure: FAILURE },
    { type: 'uncertain', failure: FAILURE },
  ]) {
    refuses(() => step(record, change));
  }
  refuses(() => step(uncertain, { type: 'applying', intent: INTENT }, { subwriteId: 'r0.a1' }));
});

test('refused transitions: ordering, skeleton, identity and change shape', () => {
  const pending = accepted({ effects: ['award', 'coin'] });
  const applying = step(pending, { type: 'applying', intent: INTENT, skeleton: SKELETON });
  const refusals = [
    () => step(pending, { type: 'applying', intent: INTENT }),
    () => step(applying, { type: 'applying', intent: INTENT, skeleton: SKELETON }),
    () => step(applying, { type: 'applying', intent: INTENT }, { subwriteId: 'r0.a1' }),
    () =>
      step(
        applying,
        { type: 'applying', intent: INTENT, skeleton: { ...SKELETON, subwrites: [] } },
        { effectId: 'coin' }
      ),
    () =>
      step(
        applying,
        { type: 'applying', intent: INTENT, skeleton: SKELETON },
        { effectId: 'coin' }
      ),
    () => step(pending, { type: 'applied', receipt: RECEIPT, skeleton: SKELETON }),
    () => step(pending, { type: 'uncertain', failure: FAILURE, skeleton: SKELETON }),
    () => step(applying, { type: 'uncertain', failure: FAILURE }, { subwriteId: 'r0.a1' }),
    () => step(applying, { type: 'effectFailure', failure: FAILURE }, { subwriteId: null }),
    () => step(pending, { type: 'effectFailure', failure: FAILURE }),
    () => step(applying, { type: 'waived', failure: FAILURE }),
    () => step(applying, { type: 'toString', failure: FAILURE }),
    () => step(applying, { type: 'applied', receipt: RECEIPT, extra: true }),
    () => step(applying, { type: 'applied' }),
    () => step(applying, { type: 'applied', receipt: null }),
    () => step(applying, { type: 'applied', receipt: RECEIPT }, { effectId: 'missing' }),
    () => step(applying, { type: 'applied', receipt: RECEIPT }, { subwriteId: 'r9.a9' }),
    () => step(applying, { type: 'applied', receipt: RECEIPT }, { at: Number.NaN }),
    () =>
      step(pending, {
        type: 'applying',
        intent: INTENT,
        skeleton: { replayClass: 'marker', subwrites: SKELETON.subwrites },
      }),
    () =>
      transitionCompanionOperationEffect(applying, {
        effectId: 'award',
        subwriteId: 'r0.a0',
        expectedRevision: 1,
        at: 1,
        change: { type: 'applied', receipt: RECEIPT },
        extra: true,
      }),
  ];
  for (const refusal of refusals) refuses(refusal);

  const legacy = withEvidence(null, { phase: 'applying', effects: ['award', 'coin'] });
  refuses(() =>
    step(legacy, { type: 'applying', intent: INTENT, skeleton: SKELETON }, { effectId: 'coin' })
  );

  const awaiting = accepted({ decisionBound: true });
  refuses(() => step(awaiting, { type: 'applying', intent: INTENT, skeleton: SKELETON }));
  refuses(() => step(awaiting, { type: 'effectFailure', failure: FAILURE }, { subwriteId: null }));
});

test('a moved revision is stale, and a terminal record cannot transition', () => {
  const record = step(accepted(), { type: 'applying', intent: INTENT, skeleton: SKELETON });
  refuses(
    () =>
      transitionCompanionOperationEffect(record, {
        effectId: 'award',
        subwriteId: 'r0.a0',
        expectedRevision: 0,
        at: 1,
        change: { type: 'applied', receipt: RECEIPT },
      }),
    'COMPANION_OPERATION_STALE_REVISION'
  );
  refuses(
    () => completeCompanionOperationRecord(record, { expectedRevision: 0, at: 1 }),
    'COMPANION_OPERATION_STALE_REVISION'
  );

  const single = {
    replayClass: 'structuredMarker',
    subwrites: [{ subwriteId: 'r0.a0', target: TARGET }],
  };
  let done = step(accepted(), { type: 'applying', intent: INTENT, skeleton: single });
  done = step(done, { type: 'applied', receipt: RECEIPT });
  const completed = completeCompanionOperationRecord(done, { expectedRevision: 2, at: 300 });
  assert.equal(completed.state, 'completed');
  assert.equal(completed.revision, 3);
  assert.equal(completed.updatedAt, 300);
  assert.deepEqual(completed.outcome, {
    schemaVersion: 1,
    effects: [
      {
        effectId: 'award',
        kind: 'componentAward',
        subwrites: [{ subwriteId: 'r0.a0', receipt: RECEIPT }],
      },
    ],
  });
  refuses(() => completeCompanionOperationRecord(completed, { expectedRevision: 3, at: 301 }));
  refuses(() => step(completed, { type: 'applied', receipt: RECEIPT }));
});

test('an already-known grant is applied from pending with no intent, only for an idempotent key', () => {
  const skeleton = { replayClass: 'idempotentKey', subwrites: [{ subwriteId: 'r0.k0', target: TARGET }] };
  const known = { type: 'applied', receipt: { result: 'alreadyKnown' }, skeleton };
  const record = step(accepted(), known, { subwriteId: 'r0.k0' });
  assert.equal(record.effectStates[0].phase, 'applied');
  assert.deepEqual(record.effectStates[0].evidence.subwrites[0], {
    failure: null,
    intent: null,
    phase: 'applied',
    receipt: { result: 'alreadyKnown' },
    subwriteId: 'r0.k0',
    target: TARGET,
  });

  refuses(() =>
    step(accepted(), { ...known, skeleton: { ...skeleton, replayClass: 'structuredMarker' } }, {
      subwriteId: 'r0.k0',
    })
  );
  refuses(() =>
    step(accepted(), { ...known, receipt: { result: 'granted' } }, { subwriteId: 'r0.k0' })
  );
});

test('a pre-flight refusal fails a pending effect whole, or one subwrite before its intent', () => {
  const failed = step(
    accepted(),
    { type: 'effectFailure', failure: { detail: 'unknown kind' } },
    { subwriteId: null }
  );
  assert.equal(failed.effectStates[0].phase, 'knownFailure');
  assert.deepEqual(failed.effectStates[0].evidence, {
    evidenceVersion: 1,
    failure: { detail: 'unknown kind' },
    replayClass: null,
    subwrites: [],
  });
  assert.equal(failed.state, 'failed');

  const refused = step(accepted(), { type: 'knownFailure', failure: FAILURE, skeleton: SKELETON });
  assert.equal(refused.effectStates[0].evidence.subwrites[0].intent, null);
  assert.equal(refused.effectStates[0].phase, 'applying');
});

test('in flight means a subwrite applying, or an applying effect with no readable evidence', () => {
  const legacy = withEvidence(null, { phase: 'applying' });
  assert.equal(hasInFlightCompanionEffect(observeCompanionOperationRecord(legacy)), true);
  assert.equal(hasInFlightCompanionEffect(accepted()), false);
  const between = withEvidence(evidenceOf(['applied', 'pending']));
  assert.equal(hasInFlightCompanionEffect(observeCompanionOperationRecord(between)), false);
  const resumed = step(between, { type: 'applying', intent: INTENT }, { subwriteId: 'r0.a1' });
  assert.equal(hasInFlightCompanionEffect(resumed), true);
});

function phaseOf(phases) {
  return deriveCompanionEffectPhase(evidenceOf(phases));
}
