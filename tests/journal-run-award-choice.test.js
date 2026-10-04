/**
 * Issue 1773 PR4: `chooseAward` through the Journal command service. The edge admits it with a
 * valid payload, authorizes it by actor ownership alone, refuses a settled choice and a
 * non-crafting run, and holds a run that owes a pick out of dismissal; the last tests drive the
 * real engine through the service, as the player and as the GM.
 */
import assert from 'node:assert/strict';
import test from 'node:test';

import { createJournalRunCommandService } from '../src/systems/journalRunCommands.js';
import { serializedOperationResult } from '../src/systems/journalRunReply.js';

import { coin, craftWithGroup, lore, pickGroup } from './helpers/choiceGroupWorld.js';

const USERS = new Map([
  ['player', { id: 'player', isGM: false }],
  ['other', { id: 'other', isGM: false }],
  ['gm', { id: 'gm', isGM: true }],
]);

const owed = (extra = {}) => ({
  choiceId: 'pick',
  awardStrategy: 'upTo',
  count: 2,
  alternatives: [{ id: 'coin' }],
  ...extra,
});

const terminalRun = (choice = owed(), extra = {}) => ({
  id: 'run-1',
  lifecycleVersion: 1,
  runRevision: 4,
  status: 'succeeded',
  steps: [{ pendingAwardChoices: [choice] }],
  ...extra,
});

/** The command service over stub operations; `sender` is the realm that sends, `gm` the elected GM. */
function service({
  run = terminalRun(),
  sender = 'gm',
  gm = 'gm',
  operations = null,
  dismissed = {},
} = {}) {
  const calls = [];
  const actor = {
    uuid: 'Actor.a',
    testUserPermission: (user, level) => level === 'OWNER' && user?.id === 'player',
  };
  const sent = [];
  let sequence = 0;
  const commands = createJournalRunCommandService({
    authority: {
      availability: () => ({ available: true, reason: null }),
      run: async (request, handler) => {
        sent.push(request.requestId);
        return handler({ createExecutionGrant: (binding) => binding });
      },
      consumeExecutionGrant: () => null,
    },
    currentUser: () => USERS.get(sender),
    activeGM: () => USERS.get(gm) ?? null,
    getUser: (id) => USERS.get(id) ?? null,
    resolveUuid: async (uuid) => (uuid === actor.uuid ? actor : null),
    emit: () => {},
    randomId: () => `random-${(sequence += 1)}`,
    timeoutMs: 20,
    getDismissals: () => dismissed,
    setDismissals: async (next) => Object.assign(dismissed, next),
    operations: operations ?? {
      crafting: {
        getRun: () => run,
        // The crafting source-owner check, which a settle must never consult.
        authorize: async () => false,
        chooseAward: async (args) => {
          calls.push(args);
          return { success: true, disposition: 'awarded', run };
        },
      },
      gathering: { getRun: () => ({ ...run, runType: 'gathering' }) },
    },
  });
  return { commands, calls, sent, dismissed };
}

const choose = (extra = {}) => ({
  actorUuid: 'Actor.a',
  runType: 'crafting',
  runId: 'run-1',
  expectedRevision: 4,
  action: 'chooseAward',
  payload: { choiceId: 'pick', picks: ['coin'] },
  ...extra,
});

test('1773 PR4: chooseAward is a mutating command, settled by the operation with its payload', async () => {
  const { commands, calls } = service();
  const reply = await commands.executeJournalRunCommand(choose());
  assert.equal(reply.success, true, reply.reason);
  assert.equal(reply.disposition, 'awarded');
  assert.equal(calls.length, 1, 'the crafting source-owner check was not consulted');
  assert.deepEqual(calls[0].payload, { choiceId: 'pick', picks: ['coin'] });
  assert.equal(calls[0].executionGrant.operation, 'chooseAward', 'its grant names the settle');
});

test('1773 PR4: a malformed chooseAward payload is refused as an invalid command', async () => {
  for (const payload of [
    {},
    { choiceId: 'pick' },
    { choiceId: '', picks: [] },
    { choiceId: 'pick', picks: [3] },
  ]) {
    const { commands, calls } = service();
    const reply = await commands.executeJournalRunCommand(choose({ payload }));
    assert.equal(reply.reason, 'invalid-command', JSON.stringify(payload));
    assert.equal(calls.length, 0);
  }
});

test('1773 PR4: only the actor owner or a GM may settle, and a GM settle reaches the same operation', async () => {
  const { commands, calls } = service();
  const nonOwner = await commands.handleRequest(
    { ...choose(), requestId: 'r1', sessionId: 's' },
    'other'
  );
  assert.equal(nonOwner.reason, 'owner-required');
  const owner = await commands.handleRequest(
    { ...choose(), requestId: 'r2', sessionId: 's' },
    'player'
  );
  assert.equal(owner.success, true);
  const gm = await commands.handleRequest({ ...choose(), requestId: 'r3', sessionId: 's' }, 'gm');
  assert.equal(gm.success, true);
  assert.equal(calls.length, 2);
});

test('1773 PR4: a gathering run cannot settle an award choice', async () => {
  const { commands, calls } = service();
  const reply = await commands.executeJournalRunCommand(choose({ runType: 'gathering' }));
  assert.equal(reply.reason, 'unsupported-operation');
  assert.equal(calls.length, 0);
});

test('1773 PR4: a settled choice is refused award-choice-settled unless it is the settle replaying', async () => {
  const settled = owed({ picks: ['coin'], settledAt: 9, outcome: 'awarded' });
  const journal = { status: 'committed', requestId: 'first-settle' };
  const { commands, calls } = service({
    run: terminalRun(settled, { awardChoiceJournal: journal }),
  });
  const fresh = await commands.executeJournalRunCommand(choose());
  assert.equal(fresh.reason, 'award-choice-settled');
  const replay = await commands.executeJournalRunCommand(choose({ requestId: 'first-settle' }));
  assert.equal(replay.success, true, 'the settle replaying its own request reaches the engine');
  assert.equal(calls.length, 1);
});

test('1773 PR4: with no GM connected the settle is refused active-gm-missing and nothing runs', async () => {
  const { commands, calls, sent } = service({ sender: 'player', gm: 'nobody' });
  const reply = await commands.executeJournalRunCommand(choose());
  assert.equal(reply.reason, 'active-gm-missing');
  assert.equal(calls.length, 0);
  assert.deepEqual(sent, []);
});

test('1773 PR4 hand-off 7: a resumed settle re-sends its persisted request id', async () => {
  const { commands, sent } = service();
  await commands.executeJournalRunCommand(choose({ requestId: 'persisted-settle' }));
  await commands.executeJournalRunCommand(choose());
  assert.equal(sent[0], 'persisted-settle');
  assert.match(sent[1], /^random-/, 'a fresh settle mints its own');
});

test('1773 PR4: a run owing a pick cannot be dismissed until it is settled or needs recovery', async () => {
  const target = { actorUuid: 'Actor.a', runType: 'crafting', runId: 'run-1' };
  const pending = service();
  assert.equal((await pending.commands.dismissJournalRun(target)).reason, 'award-choice-pending');
  assert.deepEqual(pending.dismissed, {}, 'nothing was hidden');
  const settled = owed({ picks: [], settledAt: 9, outcome: 'forfeited' });
  assert.equal(
    (await service({ run: terminalRun(settled) }).commands.dismissJournalRun(target)).success,
    true
  );
  const stuck = terminalRun(owed(), { awardChoiceJournal: { status: 'recoveryRequired' } });
  assert.equal((await service({ run: stuck }).commands.dismissJournalRun(target)).success, true);
});

test('1773 PR4: the reply names a pick the run still owes, and only then', () => {
  assert.equal(
    serializedOperationResult({ success: true, run: terminalRun() }).awardChoicePending,
    true
  );
  const settled = terminalRun(owed({ picks: ['coin'], settledAt: 1, outcome: 'awarded' }));
  assert.ok(!('awardChoicePending' in serializedOperationResult({ success: true, run: settled })));
});

test('1773 PR4: the stage that left a pick answers awardChoicePending through the reply', async () => {
  const { executed } = await craftWithGroup(pickGroup());
  assert.equal(executed.awardChoicePending, true, 'the engine names it');
  assert.equal(serializedOperationResult(executed).awardChoicePending, true, 'the reply keeps it');
  const none = pickGroup({ awardCount: undefined, awardCountFormula: '1d2-2' });
  const { executed: plain } = await craftWithGroup(none, { script: { '1d2-2': [0] } });
  assert.ok(!('awardChoicePending' in plain), 'a stage owing nothing says nothing');
});

/** The real engine behind the command service, the sender owning the crafter unless a GM. */
function realService(world, { senderId }) {
  const { engine, actor, manager } = world;
  const users = new Map([
    ['history-player', { id: 'history-player', isGM: false }],
    ['history-gm', { id: 'history-gm', isGM: true }],
  ]);
  actor.uuid ??= 'Actor.crafter';
  actor.testUserPermission = (user, level) => level === 'OWNER' && user?.id === 'history-player';
  let sequence = 0;
  return createJournalRunCommandService({
    authority: {
      availability: () => ({ available: true, reason: null }),
      run: async (_request, handler) => handler({ createExecutionGrant: (binding) => binding }),
      consumeExecutionGrant: () => null,
    },
    currentUser: () => users.get('history-gm'),
    activeGM: () => users.get('history-gm'),
    getUser: (id) => users.get(id) ?? null,
    resolveUuid: async () => actor,
    emit: () => {},
    randomId: () => `${senderId}-${(sequence += 1)}`,
    operations: {
      crafting: {
        getRun: ({ runId }) => manager().getRun(actor, runId),
        authorize: async () => false,
        chooseAward: ({ run, payload, executionGrant, requestId, expectedRevision }) =>
          engine.settleAwardChoice({
            actor,
            runId: run.id,
            expectedRevision,
            executionGrant,
            requestId,
            choiceId: payload.choiceId,
            picks: payload.picks,
          }),
      },
    },
  });
}

const settleThrough = (commands, world, picks, extra = {}) =>
  commands.handleRequest(
    {
      requestId: extra.requestId ?? `settle-${picks.join('-')}`,
      sessionId: 'session',
      actorUuid: world.actor.uuid,
      runType: 'crafting',
      runId: world.runId,
      expectedRevision: world.run().runRevision,
      action: 'chooseAward',
      payload: { choiceId: 'pick', picks },
    },
    extra.senderId ?? 'history-player'
  );

test('1773 PR4 V&A 12: the owner settles through the Journal, once, and the replay awards nothing', async () => {
  const { gp, learned, record, first, replay, tooMany, settledAgain } = await craftWithGroup(
    pickGroup(),
    {
      act: async (world) => {
        await world.execute();
        const commands = realService(world, { senderId: 'history-player' });
        const over = await settleThrough(commands, world, ['gem', 'coin', 'lore']);
        const answer = await settleThrough(commands, world, ['coin', 'lore']);
        const again = await commands.handleRequest(
          {
            requestId: 'settle-coin-lore',
            sessionId: 'session',
            actorUuid: world.actor.uuid,
            runType: 'crafting',
            runId: world.runId,
            expectedRevision: world.run().runRevision,
            action: 'chooseAward',
            payload: { choiceId: 'pick', picks: ['coin', 'lore'] },
          },
          'history-player'
        );
        return {
          tooMany: over,
          first: answer,
          replay: again,
          settledAgain: await settleThrough(commands, world, ['gem'], { requestId: 'later' }),
        };
      },
    }
  );
  assert.equal(tooMany.success, false, 'three picks against a ceiling of two');
  assert.match(tooMany.message, /Too many rewards/);
  assert.equal(first.success, true, first.message ?? first.reason);
  assert.equal(replay.success, true, 'the same request answers its committed outcome');
  assert.equal(settledAgain.reason, 'award-choice-settled');
  assert.equal(gp, 4, 'credited exactly once');
  assert.deepEqual(learned, ['historical-recipe']);
  assert.equal(record.awardChoiceJournal.status, 'committed');
  assert.deepEqual(record.steps[0].pendingAwardChoices[0].picks, ['coin', 'lore']);
});

test('1773 PR4 V&A 12: a GM settles a player run and the credit lands on the run actor', async () => {
  const group = pickGroup({
    awardStrategy: 'anyOne',
    awardCount: undefined,
    alternatives: [coin(), lore],
  });
  const { gp, two, settled } = await craftWithGroup(group, {
    act: async (world) => {
      await world.execute();
      const commands = realService(world, { senderId: 'history-gm' });
      const both = await settleThrough(commands, world, ['coin', 'lore'], {
        senderId: 'history-gm',
      });
      return {
        two: both,
        settled: await settleThrough(commands, world, ['coin'], { senderId: 'history-gm' }),
      };
    },
  });
  assert.equal(two.success, false, 'two picks under any one of');
  assert.equal(settled.success, true, settled.message ?? settled.reason);
  assert.equal(gp, 4, "the run actor's purse was credited");
});
