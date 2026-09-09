import test from 'node:test';
import assert from 'node:assert/strict';

import {
  RUN_LIFECYCLE_VERSION,
  RunLifecycleError,
  applyPause,
  applyResume,
  getRunLifecycleContract,
} from '../src/systems/runLifecycleState.js';
import {
  RunExecutionJournalError,
  getCommittedExecutionOutcome,
  observeExecutionJournal,
  transitionExecutionJournal,
} from '../src/systems/runExecutionJournal.js';

const plan = {
  operationId: 'operation-1',
  requestId: 'request-1',
  baseRunRevision: 3,
  intent: { stageIndex: 1, secret: false },
  effects: [
    { effectId: 'consume', kind: 'consumeItems', planned: { itemUuid: 'Item.herb' } },
    { effectId: 'award', kind: 'awardItems', planned: { componentId: 'potion' } },
  ],
};

test('run lifecycle contract distinguishes legacy, current, and unsupported persisted records', () => {
  assert.equal(getRunLifecycleContract({}), 'legacy');
  assert.equal(getRunLifecycleContract({ lifecycleVersion: RUN_LIFECYCLE_VERSION }), 'current');
  assert.equal(getRunLifecycleContract({ lifecycleVersion: 2 }), 'unsupported');
  assert.equal(getRunLifecycleContract({ lifecycleVersion: null }), 'unsupported');
});

test('run lifecycle pause and resume preserve a zero-second remainder', () => {
  const run = {
    lifecycleVersion: 1,
    runRevision: 0,
    completionMode: 'manual',
    pausedDurationSeconds: 0,
  };
  applyPause(run, { now: 20, availableAt: 10, expectedRevision: 0 });
  assert.deepEqual(run.pauseState, { pausedAt: 20, remainingSeconds: 0 });

  const resumed = applyResume(run, { now: 35, expectedRevision: 1 });
  assert.equal(resumed.availableAt, 35);
  assert.equal(run.pausedDurationSeconds, 15);
  assert.equal(run.runRevision, 2);
});

test('execution journal enforces an applied prefix and one applying effect', () => {
  const planned = transitionExecutionJournal(null, { type: 'plan', plan });
  assert.deepEqual(planned, {
    ...plan,
    status: 'planned',
    effects: plan.effects.map((effect) => ({ ...effect, phase: 'planned' })),
  });

  const applying = transitionExecutionJournal(planned, {
    type: 'effectApplying',
    effectId: 'consume',
  });
  assert.equal(applying.effects[0].phase, 'applying');
  assert.throws(
    () =>
      transitionExecutionJournal(applying, {
        type: 'effectApplying',
        effectId: 'award',
      }),
    (error) =>
      error instanceof RunExecutionJournalError && error.code === 'INVALID_EFFECT_TRANSITION'
  );

  const applied = transitionExecutionJournal(applying, {
    type: 'effectApplied',
    effectId: 'consume',
    receipt: { itemUuid: 'Item.herb', quantity: 1 },
  });
  assert.deepEqual(applied.effects[0], {
    ...planned.effects[0],
    phase: 'applied',
    receipt: { itemUuid: 'Item.herb', quantity: 1 },
  });
  assert.equal(applied.effects[1].phase, 'planned');
});

test('execution journal commits only after every planned effect has an actual receipt', () => {
  let journal = transitionExecutionJournal(null, { type: 'plan', plan });
  journal = transitionExecutionJournal(journal, {
    type: 'effectApplying',
    effectId: 'consume',
  });
  journal = transitionExecutionJournal(journal, {
    type: 'effectApplied',
    effectId: 'consume',
    receipt: { quantity: 1 },
  });

  assert.throws(
    () => transitionExecutionJournal(journal, { type: 'commit', outcome: { status: 'success' } }),
    (error) => error instanceof RunExecutionJournalError && error.code === 'INCOMPLETE_EFFECTS'
  );

  journal = transitionExecutionJournal(journal, {
    type: 'effectApplying',
    effectId: 'award',
  });
  journal = transitionExecutionJournal(journal, {
    type: 'effectApplied',
    effectId: 'award',
    receipt: { itemUuid: 'Item.potion' },
  });
  journal = transitionExecutionJournal(journal, {
    type: 'commit',
    outcome: { status: 'success' },
  });

  assert.equal(journal.status, 'committed');
  assert.deepEqual(journal.outcome, { status: 'success' });
  assert.deepEqual(getCommittedExecutionOutcome(journal, 'request-1'), { status: 'success' });
  assert.equal(getCommittedExecutionOutcome(journal, 'another-request'), null);
  assert.throws(
    () => transitionExecutionJournal(journal, { type: 'effectApplying', effectId: 'award' }),
    (error) => error instanceof RunExecutionJournalError && error.code === 'JOURNAL_SETTLED'
  );

  const next = transitionExecutionJournal(journal, {
    type: 'plan',
    plan: {
      operationId: 'operation-2',
      requestId: 'request-2',
      baseRunRevision: 8,
      intent: { stageIndex: 2 },
      effects: [],
    },
  });
  assert.equal(next.requestId, 'request-2');
  assert.equal(next.status, 'planned');
});

test('observing a live applying effect does not mark failure, while reload reconstruction blocks replay', () => {
  let journal = transitionExecutionJournal(null, { type: 'plan', plan });
  journal = transitionExecutionJournal(journal, {
    type: 'effectApplying',
    effectId: 'consume',
  });

  const observed = observeExecutionJournal(journal);
  assert.equal(observed.status, 'planned');
  assert.equal(observed.effects[0].phase, 'applying');

  const reconstructed = transitionExecutionJournal(journal, { type: 'reconstructAfterReload' });
  assert.equal(reconstructed.status, 'recoveryRequired');
  assert.equal(reconstructed.effects[0].phase, 'applying');
  assert.throws(
    () => transitionExecutionJournal(reconstructed, { type: 'effectApplying', effectId: 'consume' }),
    (error) => error instanceof RunExecutionJournalError && error.code === 'JOURNAL_SETTLED'
  );
});

test('current-only lifecycle operations expose a stable lifecycle error', () => {
  const error = new RunLifecycleError('unsupported', 'UNSUPPORTED_LIFECYCLE_VERSION');
  assert.equal(error.name, 'RunLifecycleError');
  assert.equal(error.code, 'UNSUPPORTED_LIFECYCLE_VERSION');
});
