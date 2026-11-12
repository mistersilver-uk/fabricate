import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';

import { createJournalRunReconciliation } from '../src/systems/journalRunReconciliation.js';
import { journalRunReasonMessage } from '../src/ui/svelte/util/journalRunReasons.js';

const lang = JSON.parse(readFileSync(new URL('../lang/en.json', import.meta.url), 'utf8'));
const localize = (key) => key.split('.').reduce((node, segment) => node?.[segment], lang) ?? key;

const actor = { id: 'actor-1', uuid: 'Actor.actor-1' };
const target = {
  actorUuid: actor.uuid,
  runType: 'salvage',
  runId: 'run-1',
  disposition: 'reconciled',
};

function harness({ activeGM = true, status = 'archived', resolveActor } = {}) {
  const calls = [];
  const manager = {
    async reconcileUncertainRun(...args) {
      calls.push(args);
      if (status instanceof Error) throw status;
      return { status };
    },
  };
  const service = createJournalRunReconciliation({
    isActiveGM: () => activeGM,
    currentUser: () => ({ id: 'gm-1', name: 'Game Master' }),
    resolveActor: resolveActor ?? (async (uuid) => (uuid === actor.uuid ? actor : null)),
    runManagers: { crafting: manager, salvage: manager },
  });
  return { calls, service };
}

describe('reconcileUncertainJournalRun', () => {
  it('forwards the disposition, note and acting GM to the run manager', async () => {
    const { calls, service } = harness();
    const result = await service.reconcileUncertainJournalRun({ ...target, note: 'counted' });
    assert.deepEqual(result, { success: true, disposition: 'reconciled' });
    assert.deepEqual(calls, [
      [
        actor,
        'run-1',
        { disposition: 'reconciled', userId: 'gm-1', userName: 'Game Master', note: 'counted' },
      ],
    ]);
  });

  it('fails closed by default and refuses any user but the active GM', async () => {
    const closed = createJournalRunReconciliation();
    assert.equal((await closed.reconcileUncertainJournalRun(target)).reason, 'active-gm-required');
    const { calls, service } = harness({ activeGM: false });
    assert.equal((await service.reconcileUncertainJournalRun(target)).reason, 'active-gm-required');
    assert.equal(calls.length, 0);
  });

  it('refuses each invalid request before writing, with a localized reason', async () => {
    const cases = [
      [{ ...target, disposition: 'refunded' }, {}, 'invalid-disposition'],
      [{ ...target, runType: 'gathering' }, {}, 'run-not-found'],
      [{ ...target, runId: '' }, {}, 'run-not-found'],
      [{ ...target, actorUuid: 'Actor.missing' }, {}, 'actor-not-found'],
      [target, { resolveActor: () => Promise.reject(new Error('bad uuid')) }, 'actor-not-found'],
      [target, { status: 'missing' }, 'run-not-found'],
      [target, { status: 'certain' }, 'run-not-uncertain'],
      [target, { status: 'invalid' }, 'invalid-disposition'],
      [target, { status: new Error('write failed') }, 'operation-failed'],
    ];
    const originalError = console.error;
    console.error = () => {};
    try {
      for (const [request, options, reason] of cases) {
        const result = await harness(options).service.reconcileUncertainJournalRun(request);
        assert.deepEqual(result, { success: false, reason }, JSON.stringify(request));
        const message = journalRunReasonMessage(reason, localize);
        assert.ok(message && !message.startsWith('FABRICATE.'), reason);
      }
    } finally {
      console.error = originalError;
    }
  });

  it('localizes the new reason to its own sentence', () => {
    assert.equal(
      journalRunReasonMessage('run-not-uncertain', localize),
      'This run has no uncertain effect to close.'
    );
  });
});
