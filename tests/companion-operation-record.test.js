import assert from 'node:assert/strict';
import test from 'node:test';

import {
  CompanionOperationRecordError,
  archiveCompanionOperationRecord,
  createCompanionOperationRecord,
  observeCompanionOperationRecord,
  sameCompanionOperationPlan,
} from '../src/systems/companionOperationRecord.js';

const OPERATION_ID = 'AbCdEfGhIjKlMn01';

function submission(overrides = {}) {
  return {
    operationId: OPERATION_ID,
    plan: {
      schemaVersion: 1,
      source: { namespace: 'fabricate-premium', occurrenceId: 'activity-1', kind: 'resolution' },
      decisions: [
        { decisionId: 'check', kind: 'roll', payload: { formula: '1d20', options: { bonus: 2 } } },
      ],
      effects: [
        {
          effectId: 'reward',
          kind: 'awardComponents',
          payload: { quantities: [1, 2], componentId: 'iron' },
          requiresDecisionIds: ['check'],
        },
      ],
      ...overrides,
    },
  };
}

function acceptedRecord() {
  return createCompanionOperationRecord(submission(), 100);
}

function activeRecord(state = 'pending') {
  const record = acceptedRecord();
  record.state = state;
  record.revision = 1;
  record.updatedAt = 90;
  record.decisionStates[0] = {
    decisionId: 'check',
    state: 'resolved',
    value: 0,
    evidence: { rollId: 'roll-1' },
  };
  record.effectStates[0] = {
    effectId: 'reward',
    phase: 'applying',
    evidence: { attempt: 1 },
    waiver: null,
  };
  return record;
}

function terminalRecord(state = 'completed') {
  const record = activeRecord(state);
  record.effectStates[0] = {
    effectId: 'reward',
    phase: state === 'completed' ? 'applied' : 'waived',
    evidence: { receipt: 'item-1' },
    waiver:
      state === 'completed'
        ? null
        : { userId: 'gm-1', at: 80, reason: 'Reward repaired outside Fabricate' },
  };
  record.outcome = { awarded: state === 'completed' ? 1 : 0 };
  return record;
}

function expectInvalid(value, code = 'INVALID_COMPANION_OPERATION_RECORD') {
  assert.throws(
    () => observeCompanionOperationRecord(value),
    (error) => error instanceof CompanionOperationRecordError && error.code === code
  );
}

test('creates the exact initial record and canonicalizes object keys without mutating input', () => {
  const input = submission();
  const original = structuredClone(input);
  const record = createCompanionOperationRecord(input, 100);

  assert.deepEqual(input, original);
  assert.deepEqual(record, {
    recordVersion: 1,
    operationId: OPERATION_ID,
    plan: {
      decisions: [
        {
          decisionId: 'check',
          kind: 'roll',
          payload: { formula: '1d20', options: { bonus: 2 } },
        },
      ],
      effects: [
        {
          effectId: 'reward',
          kind: 'awardComponents',
          payload: { componentId: 'iron', quantities: [1, 2] },
          requiresDecisionIds: ['check'],
        },
      ],
      schemaVersion: 1,
      source: { kind: 'resolution', namespace: 'fabricate-premium', occurrenceId: 'activity-1' },
    },
    state: 'accepted',
    revision: 0,
    decisionStates: [{ decisionId: 'check', state: 'pending', value: null, evidence: null }],
    effectStates: [{ effectId: 'reward', phase: 'pending', evidence: null, waiver: null }],
    outcome: null,
    acceptedAt: 100,
    updatedAt: 100,
    archive: { hiddenAt: null, hiddenBy: null },
  });
});

test('canonical comparison ignores object insertion order and retains array order', () => {
  const left = submission().plan;
  const right = submission({
    source: { kind: 'resolution', occurrenceId: 'activity-1', namespace: 'fabricate-premium' },
    decisions: [
      { payload: { options: { bonus: 2 }, formula: '1d20' }, kind: 'roll', decisionId: 'check' },
    ],
    effects: [
      {
        requiresDecisionIds: ['check'],
        payload: { componentId: 'iron', quantities: [1, 2] },
        kind: 'awardComponents',
        effectId: 'reward',
      },
    ],
  }).plan;

  assert.equal(sameCompanionOperationPlan(left, right), true);
  right.effects[0].payload.quantities.reverse();
  assert.equal(sameCompanionOperationPlan(left, right), false);
});

test('strict plan validation rejects unsupported values without invoking accessors', () => {
  let getterCalls = 0;
  const getterPayload = {};
  Object.defineProperty(getterPayload, 'secret', {
    enumerable: true,
    get() {
      getterCalls += 1;
      return 'no';
    },
  });
  const sparse = [];
  sparse[1] = 'gap';
  class CustomPayload {
    constructor() {
      this.value = 1;
    }
  }
  const cycle = {};
  cycle.self = cycle;
  const symbolPayload = { value: 1 };
  symbolPayload[Symbol('hidden')] = 2;
  const nonEnumerable = {};
  Object.defineProperty(nonEnumerable, 'hidden', { value: 1 });
  const dangerous = JSON.parse('{"__proto__":{"polluted":true}}');

  const invalidInputs = [
    { ...submission(), operationId: 'short' },
    { ...submission(), operationId: 'AbCdEfGhIjKlMn!1' },
    { ...submission(), extra: true },
    submission({ schemaVersion: 2 }),
    submission({ source: { namespace: ' ', occurrenceId: 'x', kind: 'y' } }),
    submission({ decisions: [{ decisionId: 'x', kind: 'k', payload: undefined }] }),
    submission({ decisions: [{ decisionId: 'x', kind: 'k', payload: Number.NaN }] }),
    submission({ decisions: [{ decisionId: 'x', kind: 'k', payload: 1n }] }),
    submission({ decisions: [{ decisionId: 'x', kind: 'k', payload: sparse }] }),
    submission({ decisions: [{ decisionId: 'x', kind: 'k', payload: new CustomPayload() }] }),
    submission({ decisions: [{ decisionId: 'x', kind: 'k', payload: cycle }] }),
    submission({ decisions: [{ decisionId: 'x', kind: 'k', payload: getterPayload }] }),
    submission({ decisions: [{ decisionId: 'x', kind: 'k', payload: symbolPayload }] }),
    submission({ decisions: [{ decisionId: 'x', kind: 'k', payload: nonEnumerable }] }),
    submission({ decisions: [{ decisionId: 'x', kind: 'k', payload: dangerous }] }),
    submission({
      decisions: [
        { decisionId: 'same', kind: 'k', payload: null },
        { decisionId: 'same', kind: 'k', payload: null },
      ],
    }),
    submission({
      effects: [
        { effectId: 'e', kind: 'k', payload: null, requiresDecisionIds: ['not-declared'] },
      ],
    }),
  ];

  for (const input of invalidInputs) {
    assert.throws(
      () => createCompanionOperationRecord(input, 100),
      (error) =>
        error instanceof CompanionOperationRecordError &&
        error.code === 'INVALID_COMPANION_OPERATION_SUBMISSION'
    );
  }
  assert.equal(getterCalls, 0);
  assert.equal(Object.prototype.polluted, undefined);
});

test('shared acyclic payload references are valid and detached', () => {
  const shared = { nested: { value: false } };
  const input = submission({
    decisions: [{ decisionId: 'a', kind: 'k', payload: shared }],
    effects: [
      { effectId: 'e', kind: 'k', payload: shared, requiresDecisionIds: ['a'] },
    ],
  });
  const record = createCompanionOperationRecord(input, 1);
  shared.nested.value = true;
  assert.equal(record.plan.decisions[0].payload.nested.value, false);
  assert.equal(record.plan.effects[0].payload.nested.value, false);
});

test('observes every state at its valid invariant boundary, including clock reversal', () => {
  const awaiting = activeRecord('awaitingDecision');
  awaiting.decisionStates[0] = {
    decisionId: 'check',
    state: 'pending',
    value: null,
    evidence: null,
  };
  awaiting.effectStates[0] = {
    effectId: 'reward',
    phase: 'pending',
    evidence: null,
    waiver: null,
  };

  const review = activeRecord('reviewRequired');
  review.effectStates[0].phase = 'reviewRequired';
  const failed = activeRecord('failed');
  failed.effectStates[0].phase = 'knownFailure';

  for (const record of [
    acceptedRecord(),
    activeRecord('pending'),
    awaiting,
    review,
    failed,
    terminalRecord('completed'),
    terminalRecord('completedWithOmissions'),
  ]) {
    assert.deepEqual(observeCompanionOperationRecord(record), record);
  }
});

test('record validation fails closed for each state, slot, revision and archive contradiction', () => {
  const contradictions = [];
  const add = (record, mutate) => {
    const candidate = structuredClone(record);
    mutate(candidate);
    contradictions.push(candidate);
  };

  add(acceptedRecord(), (record) => {
    record.extra = true;
  });
  add(acceptedRecord(), (record) => {
    record.recordVersion = 2;
  });
  add(acceptedRecord(), (record) => {
    record.revision = 1;
  });
  add(activeRecord(), (record) => {
    record.revision = -1;
  });
  add(activeRecord(), (record) => {
    record.revision = 1.5;
  });
  add(activeRecord(), (record) => {
    record.outcome = false;
  });
  add(activeRecord(), (record) => {
    record.decisionStates[0] = {
      decisionId: 'check',
      state: 'pending',
      value: 0,
      evidence: null,
    };
  });
  add(activeRecord(), (record) => {
    record.decisionStates[0].evidence = null;
  });
  add(activeRecord(), (record) => {
    record.effectStates[0] = {
      effectId: 'reward',
      phase: 'pending',
      evidence: { impossible: true },
      waiver: null,
    };
  });
  add(activeRecord(), (record) => {
    record.effectStates[0] = {
      effectId: 'reward',
      phase: 'applied',
      evidence: null,
      waiver: null,
    };
  });
  add(activeRecord(), (record) => {
    record.effectStates[0].waiver = { userId: 'gm', at: 1, reason: 'wrong phase' };
  });
  add(activeRecord(), (record) => {
    record.decisionStates[0] = {
      decisionId: 'check',
      state: 'pending',
      value: null,
      evidence: null,
    };
  });
  add(activeRecord('reviewRequired'), (record) => {
    record.effectStates[0].phase = 'applying';
  });
  add(activeRecord('failed'), (record) => {
    record.effectStates[0].phase = 'reviewRequired';
  });
  add(terminalRecord(), (record) => {
    record.outcome = null;
  });
  add(terminalRecord(), (record) => {
    record.effectStates[0].phase = 'pending';
    record.effectStates[0].evidence = null;
  });
  add(terminalRecord('completedWithOmissions'), (record) => {
    record.effectStates[0].waiver.reason = ' ';
  });
  add(activeRecord(), (record) => {
    record.archive.hiddenAt = 1;
  });
  add(activeRecord(), (record) => {
    record.archive = { hiddenAt: 1, hiddenBy: 'gm' };
  });
  add(activeRecord(), (record) => {
    record.decisionStates = [];
  });
  add(activeRecord(), (record) => {
    record.effectStates[0].effectId = 'different';
  });

  for (const record of contradictions) expectInvalid(record);
});

test('archive is terminal-only, writes visibility once and returns detached idempotent snapshots', () => {
  assert.throws(
    () => archiveCompanionOperationRecord(activeRecord(), { hiddenBy: 'gm-1', hiddenAt: 110 }),
    { code: 'COMPANION_OPERATION_NOT_TERMINAL' }
  );

  const terminal = terminalRecord();
  const archived = archiveCompanionOperationRecord(terminal, { hiddenBy: 'gm-1', hiddenAt: 90 });
  assert.equal(archived.revision, 2);
  assert.equal(archived.updatedAt, 90);
  assert.deepEqual(archived.archive, { hiddenAt: 90, hiddenBy: 'gm-1' });
  assert.deepEqual(terminal.archive, { hiddenAt: null, hiddenBy: null });

  const repeated = archiveCompanionOperationRecord(archived, {
    hiddenBy: 'different-gm',
    hiddenAt: 999,
  });
  assert.deepEqual(repeated, archived);
  repeated.outcome.awarded = 99;
  assert.equal(archived.outcome.awarded, 1);
});
