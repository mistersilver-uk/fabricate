/** Every reply shape the Workbench banner classifies (issue 2574). */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import { serializedOperationResult } from '../../src/systems/journalRunReply.js';
import { versionedTransitionResult } from '../../src/systems/versionedCommandResults.js';
import {
  classifyBrewReply,
  isQuietDismissal,
} from '../../src/ui/svelte/stores/alchemyBrewBanner.js';

const localize = (key) => (key.startsWith('FABRICATE.') ? `worded:${key}` : key);
const read = (result, options = {}) =>
  classifyBrewReply(result, { localize, generic: 'Generic failure', ...options });

const run = (status) => ({
  id: 'run-1',
  status,
  runRevision: 2,
  currentStepIndex: status === 'inProgress' ? 0 : null,
});
const started = (status = 'inProgress', canExecuteImmediately = true) =>
  serializedOperationResult({
    ...versionedTransitionResult(run(status), { success: true, disposition: 'started' }),
    started: true,
    requiresExecution: status !== 'waitingTime',
    canExecuteImmediately,
  });
const executed = (outcome) => ({
  ...started(),
  ...serializedOperationResult(
    versionedTransitionResult(run(outcome.success ? 'succeeded' : 'failed'), outcome)
  ),
});

const cases = [
  ['a resolved brew', executed({ success: true, disposition: 'succeeded' }), 'success', ''],
  [
    'a resolved Tiered brew',
    executed({ success: true, disposition: 'succeeded' }),
    'tiered-tier',
    '',
    { tiered: true },
  ],
  ['an unresolved start', started('inProgress', false), 'started', ''],
  [
    'a success reply whose run is still in progress',
    { ...started(), disposition: null },
    'started',
    '',
  ],
  ['a start waiting on time', started('waitingTime', false), 'brewing', ''],
  [
    'the legacy timed start',
    { success: false, disposition: 'timed-start', message: 'raw' },
    'brewing',
    '',
  ],
  ['a failed check', executed({ success: false, disposition: 'failed' }), 'check-failed', ''],
  [
    'a failed check that created results',
    executed({ success: false, disposition: 'failed', createdResultUuids: ['Item.sludge'] }),
    'produced-on-failure',
    '',
  ],
  [
    'a legacy failure award',
    { success: false, disposition: 'produced-on-failure' },
    'produced-on-failure',
    '',
  ],
  [
    'a failed brew that awarded nothing',
    {
      success: false,
      results: null,
      message: 'FABRICATE.Alchemy.FailureResult',
      disposition: 'failed',
    },
    'check-failed',
    '',
  ],
  [
    'a fizzle',
    { success: false, disposition: 'no-match', runId: 'run-2', consumed: true },
    'no-match-fizzle',
    '',
  ],
  [
    'a dismissed roll after the start',
    { ...started(), success: false, cancelled: true, reason: 'roll-cancelled' },
    'interrupted',
    '',
  ],
  [
    'an execute refused after the start',
    { ...started(), success: false, reason: 'stale-run' },
    'interrupted',
    'worded:FABRICATE.App.Alchemy.Banner.Interrupted',
  ],
  [
    'an execute that failed after the start, naming nothing',
    { ...started(), success: false, reason: 'operation-failed' },
    'interrupted',
    'worded:FABRICATE.App.Alchemy.Banner.Interrupted',
  ],
  [
    'an authority refusal',
    { success: false, reason: 'stale-run' },
    'refused',
    'worded:FABRICATE.App.Journal.Reason.StaleRun',
  ],
  [
    'a facade refusal worded by a lang key',
    { success: false, disposition: 'error', message: 'FABRICATE.App.Alchemy.NoIngredients' },
    'refused',
    'worded:FABRICATE.App.Alchemy.NoIngredients',
  ],
  ['a reply naming nothing', { success: false }, 'refused', 'Generic failure'],
  ['no reply', null, 'refused', 'Generic failure'],
];

for (const [label, reply, status, notice, options] of cases) {
  test(`${label} reads ${status}`, () => {
    const { lastBrew, notice: raised } = read(reply, options);
    assert.equal(lastBrew.status, status);
    assert.equal(raised, notice);
  });
}

test('only a dismissal before anything was spent is quiet', () => {
  assert.equal(isQuietDismissal({ success: false, cancelled: true }), true);
  assert.equal(isQuietDismissal({ ...started(), success: false, cancelled: true }), false);
  assert.equal(isQuietDismissal(started()), false);
});

test('a discovery rides every banner but a fizzle and a refusal', () => {
  assert.equal(read(started(), { discovered: 'Elixir' }).lastBrew.discovered, 'Elixir');
  assert.equal(
    read({ success: false, disposition: 'no-match' }, { discovered: 'Elixir' }).lastBrew.discovered,
    null
  );
});

test('an unfunded brew reaches the banner as a refusal in player wording', () => {
  const en = JSON.parse(readFileSync(new URL('../../lang/en.json', import.meta.url), 'utf8'));
  const leaf = (key) => key.split('.').reduce((node, part) => node?.[part], en);
  const reply = {
    success: false,
    reason: 'alchemy-submission-unfunded',
    message: 'FABRICATE.App.Journal.Reason.AlchemySubmissionUnfunded',
  };
  for (const shape of [reply, { ...reply, message: null }]) {
    const { lastBrew, notice } = classifyBrewReply(shape, { localize: leaf, generic: 'Generic' });
    assert.equal(lastBrew.status, 'refused');
    assert.equal(
      lastBrew.message,
      'These ingredients cannot be combined as placed. Nothing was spent.'
    );
    assert.equal(notice, lastBrew.message);
  }
});

/** A started brew whose execute ran a check secret from the player: the reply names no outcome. */
const secretlyExecuted = (success) => {
  const ran = {
    id: 'run-1',
    status: success ? 'succeeded' : 'failed',
    runRevision: 4,
    currentStepIndex: null,
  };
  const { disposition: _spent, createdResultUuids: _stale, ...live } = started();
  return {
    ...live,
    ...serializedOperationResult(versionedTransitionResult(ran, { success }), { secret: true }),
  };
};

test('a secretly checked brew that passed reads success', () => {
  assert.deepEqual(
    [read(secretlyExecuted(true)).lastBrew.status, read(secretlyExecuted(true)).notice],
    ['success', '']
  );
});

test('a secretly checked brew that failed reads check-failed and raises nothing', () => {
  const { lastBrew, notice } = read(secretlyExecuted(false));
  assert.deepEqual([lastBrew.status, notice], ['check-failed', '']);
});
