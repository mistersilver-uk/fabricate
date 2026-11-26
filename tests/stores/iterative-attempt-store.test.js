/**
 * The Journal's Iterative Attempt store (issue 3011, D-3), compiled with the journal store it hangs
 * from so the shared busy key, the reloads and the transient entry are the real ones. Runs are
 * hand-built projections, so a case states exactly the state it needs; three cases at the end press
 * through the real command service of `iterativeCommandWorld`.
 */
import assert from 'node:assert/strict';
import { after, before, describe, mock, test } from 'node:test';

import { flushSync } from '../../node_modules/svelte/src/index-client.js';
import { RunJournalBuilder } from '../../src/ui/presenters/RunJournalBuilder.js';
import { createSvelteModuleCompiler } from '../helpers/compile-svelte-module.js';
import { forgeLibrary, iterativeCommandWorld } from '../helpers/iterativeCommandWorld.js';
import { workpieceLocalize } from '../helpers/iterativeJournalListing.js';

let compiler;
let createJournalStore;

before(async () => {
  compiler = createSvelteModuleCompiler('fabricate-iterative-attempt-');
  ({ createJournalStore } = await compiler.loadWithClosure(
    'src/ui/svelte/stores/journalStore.svelte.js'
  ));
});
after(() => compiler.cleanup());

const ACTOR = 'Actor.actor-1';
const keyOf = (id) => JSON.stringify([ACTOR, 'crafting', id]);

const card = (actionId, extra = {}) => ({
  actionId,
  name: actionId[0].toUpperCase() + actionId.slice(1),
  enabled: true,
  free: false,
  requirements: '',
  costEntries: {},
  effectIds: [],
  ...extra,
});

const check = (outcome, value, success) => ({
  text: `${outcome} · ${value}`,
  tone: success ? 'positive' : 'warning',
  private: false,
  outcome,
  value,
  success,
});
const NO_CHECK = {
  text: 'No check',
  tone: null,
  private: false,
  outcome: null,
  value: null,
  success: null,
};

const row = (attempt, requestId, extra = {}) => ({
  attempt,
  sessionNumber: attempt,
  requestId,
  actionId: 'stoke',
  action: 'Stoke',
  check: NO_CHECK,
  paid: [],
  changed: [],
  ...extra,
});

/** A run as the Journal lists it: only the fields the store reads. `rows` are newest first. */
function iterativeRun({
  id = 'run-1',
  revision = 4,
  rows = [],
  cards,
  status = 'inProgress',
  ...extra
} = {}) {
  const attempts = rows.length;
  return {
    id,
    key: keyOf(id),
    actorUuid: ACTOR,
    runType: 'crafting',
    lifecycleContract: 'current',
    status,
    runRevision: revision,
    derivedStatus: 'ready',
    names: { title: id, subtitle: '' },
    steps: [{}, {}],
    actions: { takeAction: true, beginStep: false },
    iterative: {
      redacted: false,
      focusStepIndex: 0,
      boundary: null,
      nextSession: attempts + 1,
      compactedCount: 0,
      startedWith: [{ counterId: 'heat', label: 'Heat', value: 0, text: 'Heat 0' }],
      counters: [
        { counterId: 'heat', label: 'Heat', value: 3, min: 0, max: null },
        { counterId: 'fuel', label: 'Fuel', value: 4, min: 0, max: 10 },
      ],
      counterLabels: { heat: 'Heat', fuel: 'Fuel' },
      cards: cards ?? [card('stoke'), card('hammer')],
      sessions: rows,
      routes: { tiers: [{ id: 'fine', name: 'Fine', yields: [] }] },
      progress: {
        stages: [
          { name: 'Forge 1', failure: [] },
          { name: 'Forge 2', failure: [], carriedIds: ['heat', 'fuel'] },
        ],
      },
      goal: null,
    },
    ...extra,
  };
}

const listingOf = (runs, history = []) => ({
  selectedActorId: 'actor-1',
  selectedActorUuid: ACTOR,
  counts: { active: runs.length, history: history.length },
  activeRuns: runs,
  history,
});

function counterIds() {
  let n = 0;
  return () => `attempt-${(n += 1)}`;
}

/** The journal store over scripted replies; `state.listing` is what the next load answers. */
async function setup({ runs = [iterativeRun()], history = [], replies = [], newAttemptId } = {}) {
  const calls = { command: [], list: 0, notify: [], order: [] };
  const state = { listing: listingOf(runs, history), hold: null, queue: [...replies] };
  const services = {
    localize: workpieceLocalize,
    notify: (message) => {
      calls.notify.push(message);
    },
    craftErrorMessage: () => 'Crafting failed.',
    getSelectedActorId: () => 'actor-1',
    getWorldTime: () => 0,
    listJournalForActor: async () => {
      calls.list += 1;
      calls.order.push('list');
      if (state.hold) await state.hold.promise;
      return state.listing;
    },
    executeJournalRunCommand: async (command) => {
      calls.command.push(command);
      calls.order.push(`command:${command.action}`);
      const next = state.queue.shift();
      if (typeof next === 'function') return next(command, state);
      if (next instanceof Error) throw next;
      return next;
    },
    newAttemptId: newAttemptId === false ? undefined : (newAttemptId ?? counterIds()),
  };
  const journal = createJournalStore({ services });
  await journal.load();
  flushSync();
  const run = () => journal.selectedRun;
  const press = async (actionId = 'stoke', target = run()) => {
    const settled = journal.iterative.takeAction(target, actionId);
    await settled;
    flushSync();
  };
  const notice = (target = run()) => journal.iterative.noticeFor(target);
  const hold = () => {
    let release;
    state.hold = { promise: new Promise((resolve) => (release = resolve)) };
    return () => {
      state.hold = null;
      release();
    };
  };
  const set = (...next) => {
    state.listing = listingOf(next);
  };
  return { journal, services, calls, state, run, press, notice, hold, set };
}

const commit = (extra = {}) => ({
  success: true,
  runRevision: 5,
  iterative: { attempt: { check: null, paid: [], changed: [] }, stepEnd: null, replayed: false },
  ...extra,
});

describe('the revision a press sends', () => {
  const cases = [
    ['7', 7],
    [undefined, 0],
    [-1, 0],
    [1.5, 0],
  ];
  for (const [given, sent] of cases) {
    test(`runRevision ${JSON.stringify(given)} sends ${sent}, read from the pressed object`, async () => {
      const run = iterativeRun({ revision: given });
      if (given === undefined) delete run.runRevision;
      const world = await setup({ runs: [run], replies: [commit()] });
      await world.press();
      assert.equal(world.calls.command[0].expectedRevision, sent);
    });
  }

  test('the command is the takeAction of the pressed card with a fresh attempt id', async () => {
    const world = await setup({ replies: [commit(), commit()] });
    await world.press('stoke');
    await world.press('hammer');
    assert.deepEqual(world.calls.command, [
      {
        actorUuid: ACTOR,
        runType: 'crafting',
        runId: 'run-1',
        action: 'takeAction',
        expectedRevision: 4,
        payload: { actionId: 'stoke', attemptId: 'attempt-1' },
      },
      {
        actorUuid: ACTOR,
        runType: 'crafting',
        runId: 'run-1',
        action: 'takeAction',
        expectedRevision: 4,
        payload: { actionId: 'hammer', attemptId: 'attempt-2' },
      },
    ]);
  });

  test('two presses of one card at a changed revision mint two ids', async () => {
    const world = await setup({ replies: [commit(), commit()] });
    await world.press();
    world.set(iterativeRun({ revision: 5 }));
    await world.journal.load(true);
    await world.press();
    const ids = world.calls.command.map((command) => command.payload.attemptId);
    assert.equal(new Set(ids).size, 2);
  });
});

describe('what a press needs to send anything', () => {
  test('a run that does not offer takeAction, a disabled card and an unknown card send nothing', async () => {
    const off = await setup({ runs: [iterativeRun({ actions: { takeAction: false } })] });
    await off.press();
    const disabled = await setup({
      runs: [iterativeRun({ cards: [card('stoke', { enabled: false })] })],
    });
    await disabled.press();
    const unknown = await setup();
    await unknown.press('missing');
    const legacy = await setup({ runs: [iterativeRun({ lifecycleContract: 'legacy' })] });
    await legacy.press();
    for (const world of [off, disabled, unknown, legacy]) {
      assert.equal(world.calls.command.length, 0);
      assert.equal(world.journal.busyRunKey, '');
    }
  });

  test('a press while busy sends nothing, and runCommand cannot run during a press', async () => {
    let release;
    const gate = new Promise((resolve) => (release = resolve));
    const world = await setup({ replies: [() => gate.then(() => commit())] });
    const first = world.journal.iterative.takeAction(world.run(), 'stoke');
    flushSync();
    assert.equal(world.journal.busyRunKey, keyOf('run-1'));
    assert.equal(world.journal.busyRunId, 'run-1');
    await world.journal.iterative.takeAction(world.run(), 'hammer');
    await world.journal.pause({ ...world.run(), actions: { pause: true } });
    await world.journal.cancel(world.run());
    assert.equal(world.calls.command.length, 1, 'only the first press was sent');
    release();
    await first;
    assert.equal(world.journal.busyRunKey, '');
  });

  test('a press during runCommand sends nothing', async () => {
    let release;
    const gate = new Promise((resolve) => (release = resolve));
    const world = await setup({
      runs: [iterativeRun({ actions: { takeAction: true, beginStep: true } })],
      replies: [() => gate.then(() => ({ success: true }))],
    });
    const begun = world.journal.beginStep(world.run());
    await world.journal.iterative.takeAction(world.run(), 'stoke');
    assert.deepEqual(
      world.calls.command.map((command) => command.action),
      ['beginStep']
    );
    release();
    await begun;
  });

  test('busy is the shared key, and is released after a call, even after a throw', async () => {
    const mute = mock.method(console, 'error', () => {});
    try {
      const world = await setup({ replies: [new Error('socket closed')] });
      await world.press();
      assert.equal(world.journal.busyRunKey, '');
      assert.equal(world.journal.busyRunId, '');
      assert.equal(world.journal.iterative.pressed, null);
    } finally {
      mute.mock.restore();
    }
  });

  test('busy and pressed are released even when settling the reply throws', async () => {
    const world = await setup({ replies: [{ success: false, reason: 'queue-timeout' }] });
    world.services.craftErrorMessage = () => {
      throw new Error('settling failed');
    };
    await assert.rejects(world.press(), /settling failed/);
    assert.equal(world.journal.busyRunKey, '');
    assert.equal(world.journal.iterative.pressed, null);
  });

  test('a deferred reload holds busy until it settles', async () => {
    const world = await setup({ replies: [commit()] });
    const release = world.hold();
    const pressing = world.journal.iterative.takeAction(world.run(), 'stoke');
    await new Promise((resolve) => setTimeout(resolve, 10));
    flushSync();
    assert.equal(world.journal.busyRunKey, keyOf('run-1'), 'the reply is in, the reload is not');
    assert.ok(world.journal.iterative.pressed);
    assert.equal(world.notice().kind, 'busy');
    release();
    await pressing;
    assert.equal(world.journal.busyRunKey, '');
    assert.equal(world.journal.iterative.pressed, null);
  });

  test('the pressed object carries its run, card, session and revision', async () => {
    let seen;
    const world = await setup({
      runs: [iterativeRun({ rows: [row(1, 'a')], revision: 6 })],
      replies: [
        () => {
          seen = world.journal.iterative.pressed;
          return commit();
        },
      ],
    });
    await world.press('hammer');
    assert.deepEqual(seen, {
      runKey: keyOf('run-1'),
      actionId: 'hammer',
      name: 'Hammer',
      free: false,
      sessionNumber: 2,
      runRevision: 6,
      attemptCount: 1,
    });
  });
});

describe('the replies', () => {
  for (const reply of [
    { success: false, cancelled: true },
    { success: true, cancelled: true },
  ]) {
    test(`a cancelled reply (success ${reply.success}) is silent`, async () => {
      const world = await setup({ replies: [reply] });
      const before = world.calls.list;
      await world.press();
      assert.equal(world.notice(), null);
      assert.equal(world.journal.iterative.pressed, null);
      assert.equal(world.journal.busyRunKey, '');
      assert.equal(
        world.calls.list,
        before,
        'a dismissed prompt changed nothing, so nothing is re-read'
      );
      assert.equal(world.calls.notify.length, 0);
    });
  }

  test('a committed press records its result from the reloaded entry, not from the reply', async () => {
    const world = await setup({
      replies: [
        (command, state) => {
          const entry = row(1, command.payload.attemptId, {
            action: 'Stoke',
            check: check('Hit', 14, true),
            changed: [{ counterId: 'heat', delta: 1, label: 'Heat +1' }],
          });
          state.listing = listingOf([iterativeRun({ revision: 5, rows: [entry] })]);
          return commit({
            iterative: {
              attempt: { check: { success: true, value: 99 }, hidden: 'qzx' },
              stepEnd: null,
            },
          });
        },
      ],
    });
    await world.press();
    const notice = world.notice();
    assert.equal(notice.kind, 'result');
    assert.equal(notice.reason, 'check-passed');
    assert.equal(notice.title, 'Session 1 · Stoke · Hit (14)');
    assert.equal(notice.detail, 'Saved. The workpiece below shows the new state.');
    assert.equal(notice.ledger.requestId, 'attempt-1');
    assert.ok(!JSON.stringify(notice).includes('99'), 'nothing is read from the raw reply');
    assert.equal(world.journal.commandError, null);
  });

  test('a failed check names the costs paid, and the failure effect only when one applied', async () => {
    const failed = (changed) => async () => {
      const world = await setup({
        replies: [
          (command, state) => {
            const entry = row(1, command.payload.attemptId, {
              check: check('Miss', 3, false),
              changed,
            });
            state.listing = listingOf([iterativeRun({ revision: 5, rows: [entry] })]);
            return commit({ iterative: { attempt: { check: { success: false } }, stepEnd: null } });
          },
        ],
      });
      await world.press();
      return world.notice();
    };
    const plain = await failed([])();
    assert.equal(plain.tone, 'warning');
    assert.equal(plain.reason, 'check-failed');
    assert.equal(plain.detail, 'The check failed. The costs were paid.');
    const effect = await failed([{ counterId: 'heat', delta: 1, label: 'Heat +1' }])();
    assert.equal(
      effect.detail,
      'The check failed. The costs were paid and the failure effect applied.'
    );
  });

  test('a secret reply reads "Rolled privately" in the ledger and never renders "undefined"', async () => {
    const world = await setup({
      replies: [
        (command, state) => {
          const entry = row(1, command.payload.attemptId, {
            check: { ...NO_CHECK, text: 'Rolled privately by the GM', private: true },
          });
          state.listing = listingOf([iterativeRun({ revision: 5, rows: [entry] })]);
          return commit({ secret: true, iterative: { attempt: { check: null }, stepEnd: null } });
        },
      ],
    });
    await world.press();
    const notice = world.notice();
    assert.equal(notice.reason, 'private');
    assert.ok(!JSON.stringify(notice).includes('undefined'));
    assert.equal(notice.title, 'Session 1 · Stoke');
  });

  test('a free action drops its session from the title and the busy notice', async () => {
    const world = await setup({
      runs: [iterativeRun({ cards: [card('rest', { free: true })] })],
      replies: [
        (command, state) => {
          const entry = row(1, command.payload.attemptId, { sessionNumber: null, action: 'Rest' });
          state.listing = listingOf([iterativeRun({ revision: 5, rows: [entry] })]);
          return commit();
        },
      ],
    });
    const pressing = world.journal.iterative.takeAction(world.run(), 'rest');
    assert.equal(world.notice().title, 'Working: Rest');
    await pressing;
    assert.equal(world.notice().title, 'Rest');
  });

  test('a stale reply is a stale notice with no command error and no retry', async () => {
    const world = await setup({ replies: [{ success: false, reason: 'stale-run' }] });
    await world.press();
    const notice = world.notice();
    assert.equal(notice.kind, 'stale');
    assert.equal(notice.reason, 'stale-run');
    assert.equal(notice.detail, 'Your Stoke wasn’t applied and nothing was spent. Choose again.');
    assert.equal(world.journal.commandError, null);
    const sent = world.calls.command.length;
    await world.journal.retryCommandError();
    assert.equal(world.calls.command.length, sent);
  });

  test('a refusal is a refusal notice with no command error and no retry, in words', async () => {
    const detail = { entryId: 'burn', counterId: 'fuel', amount: 5, value: 3 };
    const world = await setup({
      replies: [{ success: false, reason: 'cost-unaffordable', detail }],
    });
    await world.press();
    const notice = world.notice();
    assert.equal(notice.kind, 'refusal');
    assert.equal(notice.reason, 'cost-unaffordable');
    assert.equal(notice.title, 'Couldn’t take that action');
    assert.equal(
      notice.detail,
      'Needs 5 Fuel; the piece has 3. Nothing was spent and the session wasn’t counted.'
    );
    assert.equal(world.journal.commandError, null);
    assert.equal(world.calls.notify.length, 0);
    const sent = world.calls.command.length;
    await world.journal.retryCommandError();
    assert.equal(world.calls.command.length, sent);
  });

  test('a notice holds rendered copy only, never the reply’s detail', async () => {
    const detail = { counterId: 'qzxHidden', amount: 9, value: 7731, entryId: 'burn' };
    const world = await setup({
      replies: [{ success: false, reason: 'cost-unaffordable', detail }],
    });
    await world.press();
    const text = JSON.stringify(world.notice());
    assert.ok(!text.includes('qzxHidden') && !text.includes('7731'), text);
    assert.ok(
      !('detail' in new Object(world.notice()) && typeof world.notice().detail === 'object')
    );
  });

  test('queue-timeout is a refusal', async () => {
    const world = await setup({ replies: [{ success: false, reason: 'queue-timeout' }] });
    await world.press();
    assert.equal(world.notice().kind, 'refusal');
    assert.equal(world.notice().reason, 'queue-timeout');
    assert.equal(world.journal.iterative.pending, null);
  });

  test('a roll that cannot be rolled for its check is a check notice, and for an effect a refusal', async () => {
    const check = await setup({
      replies: [{ success: false, reason: 'roll-unavailable', message: 'The die is bad.' }],
    });
    await check.press();
    assert.equal(check.notice().kind, 'check');
    assert.equal(check.notice().reason, 'roll-unavailable');
    assert.equal(
      check.notice().detail,
      'The crafting check couldn’t be rolled, so nothing happened. The die is bad.'
    );
    const bare = await setup({ replies: [{ success: false, reason: 'roll-unavailable' }] });
    await bare.press();
    assert.match(bare.notice().detail, /Ask your GM to check the crafting check\.$/);
    const effect = await setup({
      runs: [iterativeRun({ cards: [card('stoke', { effectIds: ['warm'] })] })],
      replies: [{ success: false, reason: 'roll-unavailable', detail: { entryId: 'warm' } }],
    });
    await effect.press();
    assert.equal(effect.notice().kind, 'refusal');
    assert.match(effect.notice().detail, /^The dice for one of this action’s effects/);
  });

  test('a reply that is not an object is a refusal in the shipped generic words', async () => {
    const world = await setup({ replies: [null] });
    await world.press();
    assert.equal(world.notice().kind, 'refusal');
    assert.equal(world.notice().detail, 'Crafting failed.');
  });

  test('a new press and a selection clear the notice', async () => {
    const world = await setup({
      runs: [iterativeRun(), iterativeRun({ id: 'run-2' })],
      replies: [{ success: false, reason: 'stale-run' }, commit()],
    });
    await world.press();
    assert.equal(world.notice().kind, 'stale');
    world.journal.select('run-2');
    flushSync();
    assert.equal(
      world.notice(world.journal.listing.activeRuns[0]),
      null,
      'a selection clears every notice'
    );
    world.journal.select('run-1');
    flushSync();
    assert.equal(world.notice(), null);
  });

  test('a terminal run has no notice', async () => {
    const world = await setup({ replies: [{ success: false, reason: 'stale-run' }] });
    await world.press();
    assert.equal(world.notice({ ...world.run(), status: 'succeeded' }), null);
    assert.equal(world.notice({ id: 'x', key: 'x', iterative: null }), null);
  });
});

describe('an unanswered command', () => {
  for (const [name, reply, reason] of [
    ['a timeout', { success: false, reason: 'command-timeout' }, 'command-timeout'],
    ['a throw', new Error('socket closed'), 'thrown'],
  ]) {
    test(`${name} keeps pending and says the outcome is not known`, async () => {
      const mute = mock.method(console, 'error', () => {});
      try {
        const world = await setup({ replies: [reply] });
        await world.press();
        assert.deepEqual(
          { ...world.journal.iterative.pending },
          {
            runKey: keyOf('run-1'),
            actionId: 'stoke',
            name: 'Stoke',
            attemptId: 'attempt-1',
            attemptCount: 0,
            expectedRevision: 4,
            reason,
          }
        );
        const notice = world.notice();
        assert.equal(notice.kind, 'unanswered');
        assert.equal(notice.reason, reason);
        assert.equal(notice.title, 'No answer from the GM yet');
        assert.match(notice.detail, /^The GM did not answer in time\./);
        assert.ok(!/nothing was spent/i.test(notice.detail));
        assert.equal(world.journal.commandError, null);
      } finally {
        mute.mock.restore();
      }
    });
  }

  const timeout = { success: false, reason: 'command-timeout' };

  test('the same card at the same revision resends the same attempt id and revision', async () => {
    const world = await setup({ replies: [timeout, commit({ replayed: true })] });
    await world.press('stoke');
    await world.press('stoke');
    const [first, second] = world.calls.command;
    assert.equal(second.payload.attemptId, first.payload.attemptId);
    assert.equal(second.expectedRevision, first.expectedRevision);
    assert.equal(
      world.journal.iterative.pending,
      null,
      'a committed resend settles the pending press'
    );
  });

  test('another card, or a changed revision, mints a new id and replaces pending', async () => {
    const other = await setup({ replies: [timeout, timeout] });
    await other.press('stoke');
    await other.press('hammer');
    assert.notEqual(
      other.calls.command[1].payload.attemptId,
      other.calls.command[0].payload.attemptId
    );
    assert.equal(other.journal.iterative.pending.actionId, 'hammer');
    const moved = await setup({ replies: [timeout, timeout] });
    await moved.press('stoke');
    moved.set(iterativeRun({ revision: 4 + 1 }));
    await moved.journal.load(true);
    await moved.press('stoke');
    assert.notEqual(
      moved.calls.command[1].payload.attemptId,
      moved.calls.command[0].payload.attemptId
    );
    assert.equal(moved.calls.command[1].expectedRevision, 5);
  });

  test('a committed resend is replayed, and recorded once', async () => {
    const world = await setup({
      replies: [
        timeout,
        (command, state) => {
          state.listing = listingOf([
            iterativeRun({ revision: 5, rows: [row(1, command.payload.attemptId)] }),
          ]);
          return commit({
            replayed: true,
            iterative: { attempt: {}, stepEnd: null, replayed: true },
          });
        },
      ],
    });
    await world.press();
    await world.press();
    const notice = world.notice();
    assert.equal(notice.kind, 'result');
    assert.equal(notice.replayed, true);
    assert.equal(world.calls.command.length, 2);
    assert.equal(world.journal.iterative.pending, null);
  });

  for (const [name, reply, kind] of [
    ['queue-timeout', { success: false, reason: 'queue-timeout' }, 'refusal'],
    ['cost-unaffordable', { success: false, reason: 'cost-unaffordable' }, 'refusal'],
    ['an unrollable check', { success: false, reason: 'roll-unavailable' }, 'check'],
  ]) {
    test(`a timeout, then a resend refused by ${name}, clears pending and shows a ${kind} notice`, async () => {
      const world = await setup({ replies: [timeout, reply] });
      await world.press('stoke');
      await world.press('stoke');
      assert.equal(world.calls.command[1].payload.attemptId, 'attempt-1');
      assert.equal(world.journal.iterative.pending, null);
      assert.equal(world.notice().kind, kind);
    });
  }

  test('a resend from a run object at a new revision mints a new id at that revision', async () => {
    const world = await setup({ replies: [timeout, timeout] });
    await world.press('stoke');
    await world.press('stoke', iterativeRun({ revision: 5 }));
    const [first, second] = world.calls.command;
    assert.notEqual(second.payload.attemptId, first.payload.attemptId);
    assert.equal(second.expectedRevision, 5);
  });

  test('a load whose log holds the pending entry shows its result and clears pending', async () => {
    const world = await setup({ replies: [timeout] });
    await world.press();
    world.set(
      iterativeRun({ revision: 5, rows: [row(1, 'attempt-1', { check: check('Hit', 12, true) })] })
    );
    await world.journal.load(true);
    flushSync();
    assert.equal(world.journal.iterative.pending, null);
    const notice = world.notice();
    assert.equal(notice.kind, 'result');
    assert.equal(notice.title, 'Session 1 · Stoke · Hit (12)');
  });

  test('a load past the pending revision without the entry shows stale and clears pending', async () => {
    const world = await setup({ replies: [timeout] });
    await world.press();
    world.set(iterativeRun({ revision: 5, rows: [row(1, 'someone-else', { action: 'Hammer' })] }));
    await world.journal.load(true);
    flushSync();
    assert.equal(world.journal.iterative.pending, null);
    const notice = world.notice();
    assert.equal(notice.kind, 'stale');
    assert.equal(
      notice.detail,
      'Someone took Hammer in another window first. Your Stoke wasn’t applied and nothing was spent. Choose again.'
    );
  });

  test('a load at the same revision leaves pending held', async () => {
    const world = await setup({ replies: [timeout] });
    await world.press();
    await world.journal.load(true);
    assert.ok(world.journal.iterative.pending);
    assert.equal(world.notice().kind, 'unanswered');
  });

  test('an unlisted run clears pending, and its notice is null', async () => {
    const world = await setup({ replies: [timeout] });
    const pressed = world.run();
    await world.press();
    world.set(iterativeRun({ id: 'run-other' }));
    await world.journal.load(true);
    assert.equal(world.journal.iterative.pending, null);
    assert.equal(world.notice(pressed), null);
  });

  test('a run that moved to history clears pending', async () => {
    const world = await setup({ replies: [timeout] });
    await world.press();
    world.state.listing = listingOf([], [iterativeRun({ status: 'succeeded' })]);
    await world.journal.load(true);
    assert.equal(world.journal.iterative.pending, null);
  });

  test('a superseded id is never "(other window)"', async () => {
    const world = await setup({ replies: [timeout, timeout] });
    await world.press('stoke');
    await world.press('hammer');
    const lost = row(1, 'attempt-1');
    world.set(
      iterativeRun({ revision: 6, rows: [row(2, 'attempt-2', { action: 'Hammer' }), lost] })
    );
    await world.journal.load(true);
    for (const entry of [lost, row(2, 'attempt-2')]) {
      assert.equal(
        world.journal.iterative.isOtherWindow(world.run(), entry),
        false,
        entry.requestId
      );
    }
  });
});

describe('a step-ending reply', () => {
  const ended = { kind: 'success', resultGroupId: 'fine' };
  const endingReply = (extra = {}) =>
    commit({
      runRevision: 5,
      iterative: {
        attempt: {
          check: null,
          paid: [{ counterId: 'fuel', delta: -1 }],
          changed: [
            { counterId: 'heat', delta: 2 },
            { counterId: 'qzxHidden', delta: 7731 },
          ],
        },
        stepEnd: ended,
        replayed: false,
      },
      ...extra,
    });

  test('markResolved runs before the reload, and the run stays selected after it leaves activeRuns', async () => {
    const world = await setup({
      replies: [
        (_command, state) => {
          state.listing = listingOf([], [iterativeRun({ status: 'succeeded', rows: [] })]);
          return endingReply();
        },
      ],
    });
    const before = world.calls.list;
    await world.press();
    assert.equal(
      world.calls.order.slice(before).indexOf('command:takeAction') <
        world.calls.order.slice(before).lastIndexOf('list'),
      true
    );
    assert.equal(
      world.journal.commandResult?.runKey,
      keyOf('run-1'),
      'the transient entry is kept'
    );
    assert.equal(world.journal.selectedRunKey, keyOf('run-1'));
  });

  test('markResolved runs when the reply arrives, while the reload is still pending', async () => {
    const world = await setup({ replies: [endingReply()] });
    const release = world.hold();
    const pressing = world.journal.iterative.takeAction(world.run(), 'stoke');
    await new Promise((resolve) => setTimeout(resolve, 10));
    flushSync();
    assert.equal(world.journal.commandResult?.runKey, keyOf('run-1'));
    release();
    await pressing;
  });

  test('the verdict is frozen from the filtered pressed projection plus the entry’s deltas', async () => {
    const world = await setup({ replies: [endingReply()] });
    const pressed = world.run();
    await world.press();
    const verdict = world.journal.iterative.verdictFor(pressed);
    assert.equal(verdict.end, 'success');
    assert.equal(verdict.title, 'Forge 1 succeeded: Fine');
    assert.match(verdict.detail, /including Heat 5 and Fuel 3\./);
    assert.ok(
      !JSON.stringify(verdict).includes('qzx') && !JSON.stringify(verdict).includes('7731')
    );
  });

  test('later loads leave it unchanged, a selection of another run clears it, a fresh store has none', async () => {
    const world = await setup({
      runs: [iterativeRun(), iterativeRun({ id: 'run-2' })],
      replies: [endingReply()],
    });
    const pressed = world.run();
    await world.press();
    const frozen = world.journal.iterative.verdictFor(pressed);
    world.set(iterativeRun({ revision: 9 }), iterativeRun({ id: 'run-2' }));
    await world.journal.load(true);
    assert.deepEqual(world.journal.iterative.verdictFor(pressed), frozen);
    world.journal.select('run-2');
    flushSync();
    assert.equal(world.journal.iterative.verdictFor(pressed), null);
    const fresh = await setup();
    assert.equal(fresh.journal.iterative.verdictFor(pressed), null);
  });

  test('a failed step freezes a failed verdict', async () => {
    const world = await setup({
      replies: [
        endingReply({
          iterative: {
            attempt: { paid: [], changed: [] },
            stepEnd: { kind: 'failure', resultGroupId: null },
          },
        }),
      ],
    });
    const pressed = world.run();
    await world.press();
    assert.equal(world.journal.iterative.verdictFor(pressed).end, 'failure');
    assert.equal(world.journal.iterative.verdictFor(pressed).title, 'Forge 1 failed');
  });

  test('a press that ends no step marks nothing resolved and freezes nothing', async () => {
    const world = await setup({ replies: [commit()] });
    const pressed = world.run();
    await world.press();
    assert.equal(world.journal.iterative.verdictFor(pressed), null);
    assert.equal(world.journal.commandResult, null);
  });
});

describe('the revision guard', () => {
  test('a reload below the reply’s revision keeps the cards disabled until one fallback reload', async () => {
    let reloads = 0;
    const world = await setup({ replies: [commit({ runRevision: 9 })] });
    const base = world.calls.list;
    world.services.listJournalForActor = async () => {
      reloads += 1;
      world.calls.list += 1;
      if (reloads === 1) return listingOf([iterativeRun({ revision: 5 })]);
      return listingOf([iterativeRun({ revision: 9 })]);
    };
    const pressing = world.journal.iterative.takeAction(world.run(), 'stoke');
    await new Promise((resolve) => setTimeout(resolve, 10));
    await pressing;
    assert.equal(world.calls.list - base, 2, 'exactly one fallback reload');
    assert.equal(world.journal.busyRunKey, '');
    assert.equal(world.run().runRevision, 9);
  });

  test('a low, null or unlisted revision after the fallback still releases the cards', async () => {
    for (const next of [[iterativeRun({ revision: 5 })], [iterativeRun({ revision: null })], []]) {
      const world = await setup({ replies: [commit({ runRevision: 9 })] });
      world.services.listJournalForActor = async () => {
        world.calls.list += 1;
        return listingOf(next);
      };
      const base = world.calls.list;
      await world.journal.iterative.takeAction(world.run(), 'stoke');
      assert.equal(world.calls.list - base, 2, JSON.stringify(next.map((run) => run.runRevision)));
      assert.equal(world.journal.busyRunKey, '');
      assert.equal(world.journal.iterative.pressed, null);
    }
  });

  test('a reload that already holds the revision reloads once', async () => {
    const world = await setup({ replies: [commit({ runRevision: 5 })] });
    world.set(iterativeRun({ revision: 5 }));
    const base = world.calls.list;
    await world.press();
    assert.equal(world.calls.list - base, 1);
  });
});

describe('the attempt id', () => {
  const bad = [
    ['an absent service', undefined],
    ['a non-string id', 7],
    ['an empty id', ''],
    ['an over-64-character id', 'x'.repeat(65)],
  ];
  for (const [name, id] of bad) {
    test(`${name} sends nothing, records an error, releases busy and throws nothing`, async () => {
      const world = await setup({ newAttemptId: id === undefined ? false : () => id });
      await world.press();
      assert.equal(world.calls.command.length, 0);
      assert.equal(world.journal.busyRunKey, '');
      assert.equal(world.journal.commandError, null);
      const notice = world.notice();
      assert.equal(notice.kind, 'error');
      assert.equal(notice.reason, 'no-id-service');
      assert.equal(notice.detail, 'Crafting failed.');
    });
  }

  test('a 64-character id is allowed, and a throwing service is an error', async () => {
    const edge = await setup({ replies: [commit()], newAttemptId: () => 'y'.repeat(64) });
    await edge.press();
    assert.equal(edge.calls.command.length, 1);
    const throwing = await setup({
      newAttemptId: () => {
        throw new Error('no randomness');
      },
    });
    await throwing.press();
    assert.equal(throwing.calls.command.length, 0);
    assert.equal(throwing.notice().kind, 'error');
  });

  test('every minted id is recorded for the run, so a lost reply is not another window', async () => {
    const world = await setup({ replies: [commit(), commit()] });
    await world.press();
    await world.press('hammer');
    assert.deepEqual(
      world.calls.command.map((command) => command.payload.attemptId),
      ['attempt-1', 'attempt-2']
    );
  });
});

describe('resume', () => {
  const attempts = [row(2, 'b'), row(1, 'a')];

  test('a run first seen with attempts says it was picked up', async () => {
    const world = await setup({ runs: [iterativeRun({ rows: attempts })] });
    const notice = world.notice();
    assert.equal(notice.kind, 'resume');
    assert.equal(notice.title, 'Picked up where you left off');
    assert.equal(
      notice.detail,
      'This is the saved workpiece, read fresh when the window opened. Session 3 is next.'
    );
  });

  test('a run first seen with none says nothing', async () => {
    const world = await setup();
    assert.equal(world.notice(), null);
  });

  test('a run whose log was compacted away still counts as having attempts', async () => {
    const run = iterativeRun();
    run.iterative.compactedCount = 4;
    const world = await setup({ runs: [run] });
    assert.equal(world.notice().kind, 'resume');
  });

  test('a press replaces it, and a fresh store reads it again', async () => {
    const world = await setup({ runs: [iterativeRun({ rows: attempts })], replies: [commit()] });
    assert.equal(world.notice().kind, 'resume');
    await world.press();
    assert.equal(world.notice().kind, 'result');
    const fresh = await setup({ runs: [iterativeRun({ rows: attempts })] });
    assert.equal(fresh.notice().kind, 'resume');
  });

  test('a run that gains attempts after first sight is not a resume', async () => {
    const world = await setup();
    world.set(iterativeRun({ rows: [row(1, 'elsewhere')] }));
    await world.journal.load(true);
    assert.equal(world.notice(), null);
  });

  test('a boundary verdict outranks the resume, and a stale or refusal outranks the verdict', async () => {
    const boundary = iterativeRun({ rows: attempts });
    boundary.iterative.boundary = {
      verdict: {
        end: 'success',
        tone: 'success',
        icon: 'fas fa-flag-checkered',
        title: 'Forge 1 succeeded',
        detail: 'Next.',
        yields: [],
      },
    };
    const world = await setup({
      runs: [boundary],
      replies: [{ success: false, reason: 'queue-timeout' }],
    });
    assert.equal(world.notice().kind, 'verdict');
    assert.equal(world.notice().reason, 'success');
    await world.press();
    assert.equal(world.notice().kind, 'refusal');
  });
});

describe('"(other window)"', () => {
  const mark = (world, entry) => world.journal.iterative.isOtherWindow(world.run(), entry);

  test('an empty log marks nothing', async () => {
    const world = await setup();
    assert.equal(
      mark(world, row(1, 'x')),
      true,
      'a first entry after first sight with none known is foreign'
    );
    assert.equal(mark(world, row(0, 'x')), false);
  });

  test('entries from before the window opened are not foreign', async () => {
    const world = await setup({ runs: [iterativeRun({ rows: [row(2, 'b'), row(1, 'a')] })] });
    assert.equal(mark(world, row(2, 'b')), false);
    assert.equal(mark(world, row(1, 'a')), false);
  });

  test('a compacted tail is compared by attempt number, never by array length', async () => {
    const rows = [row(30, 'r30'), row(29, 'r29'), row(28, 'r28')];
    const run = iterativeRun({ rows });
    run.iterative.compactedCount = 27;
    const world = await setup({ runs: [run] });
    assert.equal(mark(world, row(30, 'r30')), false, 'three listed rows, thirty attempts');
    assert.equal(mark(world, row(31, 'r31')), true);
    assert.equal(mark(world, row(4, 'r4')), false);
  });

  test('two foreign entries are both marked, and are named by the stale notice, oldest first', async () => {
    const world = await setup({
      runs: [iterativeRun({ rows: [row(1, 'a')] })],
      replies: [{ success: false, reason: 'stale-run' }],
    });
    const pressed = world.run();
    const after = [
      row(3, 'f2', { action: 'Hammer' }),
      row(2, 'f1', { action: 'Rest' }),
      row(1, 'a'),
    ];
    world.state.queue = [
      (_command, state) => {
        state.listing = listingOf([iterativeRun({ revision: 6, rows: after })]);
        return { success: false, reason: 'stale-run' };
      },
    ];
    await world.journal.iterative.takeAction(pressed, 'stoke');
    flushSync();
    assert.equal(mark(world, after[0]), true);
    assert.equal(mark(world, after[1]), true);
    assert.equal(mark(world, after[2]), false);
    assert.match(world.notice().detail, /^Someone took Rest and Hammer in another window first\./);
  });

  test('a lost-reply entry of this window is its own, and a reopened window sees it as earlier', async () => {
    const world = await setup({ replies: [{ success: false, reason: 'command-timeout' }] });
    await world.press();
    const mine = row(1, 'attempt-1');
    world.set(iterativeRun({ revision: 5, rows: [mine] }));
    await world.journal.load(true);
    assert.equal(mark(world, mine), false, 'minted here');
    const reopened = await setup({ runs: [iterativeRun({ revision: 5, rows: [mine] })] });
    assert.equal(mark(reopened, mine), false, 'it predates the reopened window’s first sight');
  });

  test('the baseline is per step, so a later step’s own attempts are judged from its start', async () => {
    const world = await setup({ runs: [iterativeRun({ rows: [row(7, 'g')] })] });
    const second = (rows) => {
      const next = iterativeRun({ revision: 6, rows });
      next.iterative.focusStepIndex = 1;
      return next;
    };
    world.set(second([]));
    await world.journal.load(true);
    world.set(second([row(1, 'n1')]));
    await world.journal.load(true);
    assert.equal(
      mark(world, row(1, 'n1')),
      true,
      'step 2 is judged from its own start, not from 7'
    );
  });
});

describe('beginning a step', () => {
  const begin = () => iterativeRun({ actions: { takeAction: false, beginStep: true } });

  test('it wraps the journal command and a success says the step started', async () => {
    const world = await setup({ runs: [begin()], replies: [{ success: true }] });
    world.state.queue = [
      (_command, state) => {
        const started = iterativeRun({ revision: 7 });
        started.iterative.focusStepIndex = 1;
        started.iterative.startedWith = [
          { counterId: 'heat', label: 'Heat', value: 2, text: 'Heat 2' },
        ];
        state.listing = listingOf([started]);
        return { success: true };
      },
    ];
    const result = await world.journal.iterative.beginStep(world.run());
    flushSync();
    assert.equal(result.success, true);
    assert.deepEqual(
      world.calls.command.map((command) => command.action),
      ['beginStep']
    );
    const notice = world.notice();
    assert.equal(notice.kind, 'started');
    assert.equal(notice.title, 'Step 2 started');
    assert.equal(notice.detail, 'Its inputs were taken once, now. Step 2 starts with Heat 2.');
  });

  test('a refusal keeps the shipped error and retry, and says no step started', async () => {
    const world = await setup({
      runs: [begin()],
      replies: [{ success: false, reason: 'stale-run' }],
    });
    await world.journal.iterative.beginStep(world.run());
    assert.ok(world.journal.commandError, 'the shipped command error is raised');
    assert.equal(world.notice()?.kind ?? null, null);
    world.state.queue = [{ success: false, reason: 'stale-run' }];
    await world.journal.retryCommandError();
    assert.equal(world.calls.command.length, 2, 'the shipped retry resends it');
  });

  test('a begin settles like a press, whether it commits or is refused', async () => {
    const world = await setup({
      runs: [begin()],
      replies: [{ success: false, reason: 'stale-run' }, { success: true }],
    });
    await world.journal.iterative.beginStep(world.run());
    const first = world.journal.iterative.settled;
    assert.deepEqual({ ...first, serial: 0 }, { runKey: keyOf('run-1'), actionId: null, serial: 0 });
    await world.journal.iterative.beginStep(world.run());
    assert.equal(world.journal.iterative.settled.serial, first.serial + 1);
  });
});

describe('the focus after a reply', () => {
  test('goes to the pressed card, else begin, else the first enabled card, else the detail', async () => {
    const world = await setup();
    const base = iterativeRun({ cards: [card('a', { enabled: false }), card('b'), card('c')] });
    const focus = (run, id) => world.journal.iterative.focusTarget(run, id);
    assert.deepEqual(focus(base, 'c'), { kind: 'card', actionId: 'c' });
    assert.deepEqual(focus(base, 'a'), { kind: 'card', actionId: 'b' });
    const boundary = { ...base, actions: { beginStep: true } };
    assert.deepEqual(focus(boundary, 'a'), { kind: 'begin' });
    const none = iterativeRun({ cards: [card('a', { enabled: false })] });
    assert.deepEqual(focus(none, 'a'), { kind: 'detail' });
  });

  test('a settled press is announced with a serial the view can react to', async () => {
    const world = await setup({ replies: [commit(), commit()] });
    assert.equal(world.journal.iterative.settled, null);
    await world.press();
    const first = world.journal.iterative.settled;
    assert.equal(first.actionId, 'stoke');
    await world.press('hammer');
    assert.equal(world.journal.iterative.settled.serial, first.serial + 1);
  });
});

describe('the real command service', () => {
  const PLAYER = { id: 'player', isGM: false };

  /** The journal store over a started forge world, listing through the real builder. */
  async function worldJournal(options = {}) {
    const world = iterativeCommandWorld({
      library: options.library ?? forgeLibrary(),
      fuel: options.fuel,
    });
    const started = await world.start();
    assert.equal(started.success, true, JSON.stringify(started));
    const builder = new RunJournalBuilder({
      craftingRunManager: world.manager,
      recipeManager: world.recipeManager,
      resolutionModeService: world.modes,
      recipeVisibility: world.visibility,
      getSystem: world.systems.getSystem,
      localize: workpieceLocalize,
      nowWorldTime: () => globalThis.game.time.worldTime,
    });
    const calls = [];
    const services = {
      localize: workpieceLocalize,
      notify: () => {},
      craftErrorMessage: () => 'Crafting failed.',
      getSelectedActorId: () => world.actor.id,
      getWorldTime: () => 0,
      newAttemptId: counterIds(),
      listJournalForActor: async () => {
        world.manager.invalidateCache(world.actor.id);
        return builder.buildListing({ actor: world.actor, viewer: PLAYER });
      },
      executeJournalRunCommand: (command) => {
        calls.push(command);
        return world.service.executeJournalRunCommand(command, { interactive: false });
      },
    };
    const journal = createJournalStore({ services });
    await journal.load();
    flushSync();
    return { world, journal, calls };
  }

  test('a commit: the run advances by one and the ledger is read from the reloaded entry', async () => {
    const { world, journal } = await worldJournal();
    const before = world.revision();
    await journal.iterative.takeAction(journal.selectedRun, 'stoke');
    flushSync();
    assert.equal(world.revision(), before + 1);
    const notice = journal.iterative.noticeFor(journal.selectedRun);
    assert.equal(notice.kind, 'result');
    assert.equal(notice.reason, 'no-check');
    assert.equal(notice.title, 'Session 1 · Stoke');
    assert.equal(notice.ledger.requestId, 'attempt-1');
    assert.equal(notice.ledger.actionId, 'stoke');
    assert.deepEqual(
      notice.ledger.changed.map((chip) => chip.label),
      ['Heat +1']
    );
    assert.equal(journal.selectedRun.runRevision, world.revision(), 'the listing was reloaded');
    assert.equal(journal.busyRunKey, '');
  });

  test('a stale reply: nothing is applied and the other action is named', async () => {
    const { world, journal } = await worldJournal();
    const drawn = journal.selectedRun;
    await world.take('rest', { attemptId: 'other-window' });
    const flag = world.flag();
    await journal.iterative.takeAction(drawn, 'stoke');
    flushSync();
    assert.deepEqual(world.flag(), flag, 'the stale press wrote nothing');
    const notice = journal.iterative.noticeFor(journal.selectedRun);
    assert.equal(notice.kind, 'stale');
    assert.equal(
      notice.detail,
      'Someone took rest in another window first. Your Stoke wasn’t applied and nothing was spent. Choose again.'
    );
    assert.equal(journal.selectedRun.runRevision, world.revision(), 'the workpiece was reloaded');
    assert.equal(
      journal.iterative.isOtherWindow(
        journal.selectedRun,
        journal.selectedRun.iterative.sessions[0]
      ),
      true
    );
  });

  test('a refusal leaves the run unchanged and rolls nothing', async () => {
    const library = forgeLibrary();
    library.actions.push({
      ...structuredClone(library.actions[0]),
      id: 'forgeAhead',
      label: 'Forge ahead',
      check: 'roll',
      costs: [{ id: 'lift', counterId: 'fuel', amount: '5', needsEnough: true }],
    });
    const { world, journal, calls } = await worldJournal({ library, fuel: 3 });
    const drawn = JSON.parse(JSON.stringify(journal.selectedRun));
    const pressed = drawn.iterative.cards.find((entry) => entry.actionId === 'forgeAhead');
    assert.equal(pressed.enabled, false, 'the drawn state already says it cannot be afforded');
    pressed.enabled = true;
    const flag = world.flag();
    const messages = world.messages.length;
    let rolled = 0;
    const evaluate = globalThis.Roll.prototype.evaluate;
    globalThis.Roll.prototype.evaluate = function counted(...args) {
      rolled += 1;
      return evaluate.apply(this, args);
    };
    try {
      await journal.iterative.takeAction(drawn, 'forgeAhead');
    } finally {
      globalThis.Roll.prototype.evaluate = evaluate;
    }
    flushSync();
    assert.equal(rolled, 0, 'no check was rolled');
    assert.deepEqual(world.die.requested, [], 'no die was drawn');
    assert.equal(calls.length, 1, 'the press was sent');
    assert.deepEqual(world.flag(), flag, 'the run is unchanged');
    assert.equal(world.messages.length, messages, 'nothing was rolled or posted');
    const notice = journal.iterative.noticeFor(journal.selectedRun);
    assert.equal(notice.kind, 'refusal');
    assert.equal(notice.reason, 'cost-unaffordable');
    assert.equal(
      notice.detail,
      'Needs 5 Fuel; the piece has 3. Nothing was spent and the session wasn’t counted.'
    );
    assert.equal(journal.commandError, null);
  });
});
