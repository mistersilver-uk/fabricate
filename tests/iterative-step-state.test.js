/** The persisted Iterative Step State: its closed key set, its bounded log, and its archive. */
import assert from 'node:assert/strict';
import { beforeEach, describe, it } from 'node:test';

import { CraftingRunManager } from '../src/systems/CraftingRunManager.js';
import {
  appendAttemptEntry,
  archiveRunTerms,
  createIterativeStepState,
  findAttemptEntry,
  ITERATIVE_ARCHIVE_LOG_LIMIT,
  ITERATIVE_LOG_LIMIT,
  readIterativeStepState,
} from '../src/systems/iterative/iterativeStepState.js';
import { iterativeTermsEntry } from '../src/systems/iterative/iterativeTerms.js';
import { resolveAttempt, resolveStartedWith } from '../src/systems/iterative/resolveAttempt.js';
import { snapshotRunTerms } from '../src/systems/runTerms.js';

import { action, cost, effect, library, state } from './helpers/iterativeAttemptFixtures.js';
import { FakeActor, setupRunManagerGlobals } from './helpers/run-manager-fakes.js';
import { scriptedRollDie } from './helpers/scriptedRollDie.js';

const STATE_KEYS = [
  'version',
  'counters',
  'attemptCount',
  'sessionCount',
  'startedWith',
  'log',
  'compacted',
  'labels',
  'toolBreakOwed',
  'terminal',
];
const NULLABLE = ['compacted', 'labels', 'toolBreakOwed', 'terminal'];

/** A 16-character Attempt id, as the facade mints one. */
const attemptIdOf = (n) => `attempt-${String(n).padStart(8, '0')}`;

/** Pays 1 heat-fuel and adds 1 ember; every other attempt counts a session. */
const STOKE = action({
  id: 'stoke',
  usesSession: false,
  costs: [cost('fuelCost', 'fuel', '1', false)],
  effects: [effect('warm', 'ember', 'add', '1')],
});

function runAttempts(count, start = createStarted()) {
  let current = start;
  const totals = { paid: 0, changed: 0, sessions: 0 };
  for (let n = 1; n <= count; n += 1) {
    const usesSession = n % 2 === 0;
    const resolved = resolveAttempt({
      state: current,
      action: { ...STOKE, usesSession },
      library: library({ step: { ...library().step, success: [] } }),
      check: null,
      rollDie: () => 1,
    });
    assert.equal(resolved.ok, true, JSON.stringify(resolved));
    totals.paid += resolved.entry.paid.reduce((sum, row) => sum + row.delta, 0);
    totals.changed += resolved.entry.changed.reduce((sum, row) => sum + row.delta, 0);
    if (resolved.entry.sessionNumber !== null) totals.sessions += 1;
    current = appendAttemptEntry(resolved.next, resolved.entry, attemptIdOf(n));
  }
  return { state: current, totals };
}

function createStarted() {
  const die = scriptedRollDie([], { fill: 1 });
  const started = resolveStartedWith({ library: library(), rollDie: die.rollDie });
  return createIterativeStepState(started);
}

const sumRows = (rows) => rows.reduce((sum, row) => sum + (row.total ?? row.delta), 0);

describe('createIterativeStepState', () => {
  it('writes the closed key set, a scripted start included', () => {
    const die = scriptedRollDie([3]);
    const lib = library({
      instances: [{ counterId: 'heat', start: 0, startFormula: '1d6', visible: true }],
    });
    const started = resolveStartedWith({ library: lib, rollDie: die.rollDie });
    const created = createIterativeStepState(started);
    assert.deepEqual(Object.keys(created), STATE_KEYS);
    assert.deepEqual(created.counters, [{ counterId: 'heat', value: 3 }]);
    assert.deepEqual(created.startedWith, [
      { counterId: 'heat', value: 3, formulaValue: 3, rolls: [3], clamped: false },
    ]);
    assert.equal(created.attemptCount, 0);
    for (const key of NULLABLE) assert.equal(created[key], null, key);
  });
});

describe('the attempt log', () => {
  it('stamps the Attempt id as requestId and keeps the newest entries oldest first', () => {
    const { state: held } = runAttempts(3);
    assert.deepEqual(
      held.log.map((entry) => [entry.attempt, entry.requestId]),
      [1, 2, 3].map((n) => [n, attemptIdOf(n)])
    );
    assert.deepEqual(Object.keys(held.log[0]), [
      'attempt',
      'sessionNumber',
      'actionId',
      'requestId',
      'check',
      'rolls',
      'paid',
      'changed',
    ]);
  });

  it('keeps 25 entries after 1000 attempts and folds the rest so the totals still add up', () => {
    const { state: held, totals } = runAttempts(1000);
    assert.equal(held.log.length, ITERATIVE_LOG_LIMIT);
    assert.equal(held.compacted.attempts, 975);
    assert.equal(held.log[0].attempt, 976);
    const logged = (key) => held.log.reduce((sum, entry) => sum + sumRows(entry[key]), 0);
    assert.equal(sumRows(held.compacted.paid) + logged('paid'), totals.paid);
    assert.equal(sumRows(held.compacted.changed) + logged('changed'), totals.changed);
    const loggedSessions = held.log.filter((entry) => entry.sessionNumber !== null).length;
    assert.equal(held.compacted.sessions + loggedSessions, totals.sessions);
    assert.deepEqual(
      held.compacted.paid.map((row) => row.counterId),
      ['fuel']
    );
  });

  it('grows by at most 256 bytes past its first fold, and stays under 8 KiB', () => {
    const bytes = (count) => Buffer.byteLength(JSON.stringify(runAttempts(count).state));
    const early = bytes(ITERATIVE_LOG_LIMIT + 1);
    const late = bytes(1000);
    assert.ok(late - early <= 256, `${late} - ${early}`);
    assert.ok(late < 8 * 1024, String(late));
  });

  it('finds an entry by its Attempt id on any step, with the end it caused', () => {
    const { state: first } = runAttempts(2);
    const ended = { ...first, terminal: { kind: 'success', attempt: 2, resultGroupId: null } };
    const run = { steps: [{ iterative: ended }, { iterative: runAttempts(1).state }] };
    assert.deepEqual(findAttemptEntry(run, attemptIdOf(2)), {
      attempt: ended.log[1],
      stepEnd: ended.terminal,
    });
    assert.equal(findAttemptEntry(run, attemptIdOf(1)).stepEnd, null);
    assert.equal(findAttemptEntry(run, 'never-taken'), null);
    assert.equal(findAttemptEntry(run, ''), null);
  });
});

describe('readIterativeStepState', () => {
  it('drops unknown keys and keeps a newer version verbatim as unsupported', () => {
    const read = readIterativeStepState({ ...state(), stray: true });
    assert.equal(read.supported, true);
    assert.deepEqual(Object.keys(read.state), STATE_KEYS);
    const future = { ...state(), version: 2, stray: true };
    assert.deepEqual(readIterativeStepState(future), { supported: false, state: future });
    assert.equal(readIterativeStepState(undefined), null);
  });
});

describe('the persisted flag', () => {
  let actor;
  let manager;
  beforeEach(() => {
    setupRunManagerGlobals(1000);
    actor = new FakeActor('Smith');
    globalThis.game.actors = [actor];
    manager = new CraftingRunManager();
  });

  const recipe = { id: 'recipe', craftingSystemId: 'system', getExecutionSteps: () => [{}] };

  async function persistedRun(extra = {}) {
    return manager.createRun(actor, recipe, [actor], 'gm', { lifecycleVersion: 1, ...extra });
  }

  it('keeps an explicit null for every nullable key across two rewrites', async () => {
    const run = await persistedRun();
    run.steps[0].iterative = {
      ...createStarted(),
      compacted: { attempts: 1, sessions: 0, paid: [], changed: [] },
      toolBreakOwed: { attempt: 1 },
      terminal: { kind: 'failure', attempt: 1, resultGroupId: null },
    };
    let current = await manager.updateRun(actor, run, { expectedRevision: 0 });
    for (let pass = 0; pass < 2; pass += 1) {
      current.steps[0].iterative = createStarted();
      current = await manager.updateRun(actor, current, { expectedRevision: current.runRevision });
    }
    const raw = actor.getFlag('fabricate', 'fabricate.craftingRuns').active[run.id].steps[0]
      .iterative;
    assert.deepEqual(Object.keys(raw), STATE_KEYS);
    for (const key of NULLABLE) {
      assert.ok(Object.hasOwn(raw, key) && raw[key] === null, key);
    }
  });

  it('completeRun trims each step state to 10, labels it once and drops the terms', async () => {
    const system = {
      resolutionMode: 'iterative',
      iterative: { ...library(), actions: [STOKE] },
    };
    const run = await persistedRun({
      termsSnapshot: { recipe: {}, craftingCheck: null, ...iterativeTermsEntry({}, system) },
    });
    run.steps[0].iterative = runAttempts(1000).state;
    const current = await manager.updateRun(actor, run, { expectedRevision: 0 });
    await manager.completeRun(actor, current, 'succeeded');
    const [archived] = manager.getRunHistory(actor);
    const held = archived.steps[0].iterative;
    assert.equal(archived.termsSnapshot, undefined);
    assert.equal(held.log.length, ITERATIVE_ARCHIVE_LOG_LIMIT);
    assert.equal(held.compacted.attempts, 990);
    assert.deepEqual(held.labels, {
      counters: [
        { id: 'ember', label: 'Label ember' },
        { id: 'fuel', label: 'Label fuel' },
      ],
      actions: [{ id: 'stoke', label: 'Work' }],
    });
  });

  it('never trims or labels an unsupported state at archive', () => {
    const future = { ...runAttempts(30).state, version: 2 };
    const run = {
      termsSnapshot: { iterative: { version: 1, counters: [], actions: [] } },
      steps: [{ iterative: structuredClone(future) }],
    };
    archiveRunTerms(run);
    assert.deepEqual(run.steps[0].iterative, future);
    assert.equal(run.termsSnapshot, undefined);
  });
});

describe('the terms snapshot', () => {
  const recipe = (stepActions) => ({
    toJSON: () => ({ id: 'recipe' }),
    iterative: { counters: [{ counterId: 'heat', start: 0, visible: true }], step: stepActions },
  });
  const system = (mode) => ({
    resolutionMode: mode,
    craftingCheck: null,
    iterative: {
      version: 1,
      counters: [
        { id: 'heat', label: 'Heat', limit: 'none' },
        { id: 'fuel', label: 'Fuel', limit: 'none' },
        { id: 'unused', label: 'Unused', limit: 'none' },
      ],
      actions: [action({ id: 'stoke', costs: [cost('c', 'fuel', '1')] }), action({ id: 'idle' })],
    },
  });

  it('carries iterative only for an iterative system', () => {
    const only = { actions: { mode: 'only', actionIds: ['stoke'] } };
    assert.equal(
      Object.hasOwn(snapshotRunTerms(recipe(only), system('simple')), 'iterative'),
      false
    );
    const terms = snapshotRunTerms(recipe(only), system('iterative'));
    assert.deepEqual(
      terms.iterative.counters.map((entry) => entry.id),
      ['heat', 'fuel']
    );
    assert.deepEqual(
      terms.iterative.actions.map((entry) => entry.id),
      ['stoke']
    );
    assert.equal(terms.iterative.version, 1);
  });

  it('reaches every action of a step that allows them all', () => {
    const all = { actions: { mode: 'all', actionIds: [] } };
    const terms = snapshotRunTerms(recipe(all), system('iterative'));
    assert.deepEqual(
      terms.iterative.actions.map((entry) => entry.id),
      ['stoke', 'idle']
    );
  });
});
