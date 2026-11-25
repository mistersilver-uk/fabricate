/** The `takeAction` journal command: one Iterative Attempt per command, replay, and refusals. */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { createJournalCommandsForFabricate } from '../src/bootstrap/journalOperations.js';
import { CraftingEngine } from '../src/systems/CraftingEngine.js';
import { CraftingRunManager } from '../src/systems/CraftingRunManager.js';
import { settlePromptedCheck } from '../src/systems/journalCheckPrompt.js';

import { iterativeCommandWorld } from './helpers/iterativeCommandWorld.js';
import { sharedAuthorityWorld } from './helpers/sharedAuthorityWorld.js';

async function startedWorld(options = {}) {
  const world = iterativeCommandWorld(options);
  const started = await world.start();
  assert.equal(started.success, true, JSON.stringify(started));
  return world;
}

const heat = (world) => world.stepState().counters.find((row) => row.counterId === 'heat').value;

/** One raw request through the GM's handler, as a socket delivery would carry it. */
let raw = 0;
function request(world, action, payload, extra = {}) {
  raw += 1;
  return {
    requestId: `raw-${raw}`,
    sessionId: 'raw-session',
    actorUuid: world.actor.uuid,
    runType: 'crafting',
    runId: world.runId,
    expectedRevision: world.revision(),
    action,
    payload,
    ...extra,
  };
}

/** The run's flag before and after `act`, and what `act` answered. */
async function unchangedBy(world, act) {
  const before = world.flag();
  const reply = await act();
  assert.deepEqual(world.flag(), before, `the refusal ${reply?.reason} wrote nothing`);
  return reply;
}

describe('a non-terminal Iterative Attempt', () => {
  it('advances runRevision by exactly one per attempt and logs each attempt', async () => {
    const world = await startedWorld();
    for (let n = 1; n <= 3; n += 1) {
      const before = world.revision();
      const reply = await world.take('stoke', { attemptId: `stoke-${n}` });
      assert.equal(reply.success, true, JSON.stringify(reply));
      assert.equal(world.revision(), before + 1);
      assert.equal(reply.runRevision, before + 1);
      assert.deepEqual(reply.iterative, {
        attempt: world.stepState().log.at(-1),
        stepEnd: null,
        replayed: false,
      });
      assert.equal(reply.iterative.attempt.requestId, `stoke-${n}`);
    }
    assert.equal(world.stepState().log.length, 3);
    assert.equal(heat(world), 3);
    assert.equal(world.stepState().attemptCount, 3);
  });

  it('answers a replayed Attempt id from the log and changes nothing', async () => {
    const world = await startedWorld();
    await world.take('stoke', { attemptId: 'first' });
    const revision = world.revision();
    await world.take('stoke', { attemptId: 'second' });
    const replay = await unchangedBy(world, () =>
      world.take('stoke', { attemptId: 'first', expectedRevision: revision - 1 })
    );
    assert.equal(replay.success, true);
    assert.equal(replay.replayed, true);
    assert.deepEqual(replay.iterative, {
      attempt: world.stepState().log[0],
      stepEnd: null,
      replayed: true,
    });
  });

  it('refuses a replay while an execution journal is planned, changing nothing', async () => {
    const world = await startedWorld();
    await world.take('stoke', { attemptId: 'first' });
    await world.manager.updateExecutionJournal(
      world.actor,
      world.runId,
      {
        type: 'plan',
        plan: {
          operationId: 'op-open',
          requestId: 'req-open',
          baseRunRevision: world.revision(),
          intent: { stepIndex: 0 },
          effects: [{ effectId: 'open', kind: 'open', planned: null }],
        },
      },
      { expectedRevision: world.revision(), journal: 'executionJournal' }
    );
    const reply = await unchangedBy(world, () => world.take('stoke', { attemptId: 'first' }));
    assert.equal(reply.reason, 'recoveryRequired');
    const fresh = await unchangedBy(world, () => world.take('stoke', { attemptId: 'fresh' }));
    assert.equal(fresh.reason, 'recoveryRequired');
  });

  it('refuses a stale revision before any describe or roll', async () => {
    const world = await startedWorld();
    await world.take('rest');
    let described = 0;
    const describe = world.engine.describeIterativeAttemptCheck.bind(world.engine);
    world.engine.describeIterativeAttemptCheck = (args) => {
      described += 1;
      return describe(args);
    };
    const reply = await unchangedBy(world, () =>
      world.take('hammer', { expectedRevision: world.revision() - 1 })
    );
    assert.equal(reply.reason, 'stale-run');
    assert.equal(described, 0);
  });

  it('keeps only the newest 25 replayable after 30 attempts, across a new session', async () => {
    const world = await startedWorld();
    const revisions = [];
    for (let n = 1; n <= 30; n += 1) {
      revisions.push(world.revision());
      await world.take('rest', { attemptId: `rest-${String(n).padStart(2, '0')}` });
    }
    assert.equal(world.stepState().log.length, 25);
    assert.equal(world.stepState().compacted.attempts, 5);
    const replay = await world.take('rest', {
      attemptId: 'rest-28',
      expectedRevision: revisions[27],
    });
    assert.equal(replay.replayed, true);
    assert.equal(replay.iterative.attempt.attempt, 28);
    const folded = await unchangedBy(world, () =>
      world.take('rest', { attemptId: 'rest-01', expectedRevision: revisions[0] })
    );
    assert.equal(folded.reason, 'stale-run');
    const session = createJournalCommandsForFabricate(world.fabricate, world.authority);
    const again = await session.executeJournalRunCommand(
      request(
        world,
        'takeAction',
        { actionId: 'rest', attemptId: 'rest-28' },
        {
          expectedRevision: revisions[27],
        }
      ),
      { interactive: false }
    );
    assert.equal(again.replayed, true);
  });

  it('refuses a malformed takeAction as invalid-command and accepts a well-formed one', async () => {
    const world = await startedWorld();
    for (const payload of [
      { actionId: 'rest', attemptId: '' },
      { actionId: 'rest', attemptId: 'x'.repeat(65) },
      { actionId: 'rest' },
      { attemptId: 'no-action' },
    ]) {
      const reply = await unchangedBy(world, () =>
        world.service.handleRequest(request(world, 'takeAction', payload), 'gm')
      );
      assert.equal(reply.reason, 'invalid-command', JSON.stringify(payload));
    }
    const longest = await world.service.handleRequest(
      request(world, 'takeAction', { actionId: 'rest', attemptId: 'x'.repeat(64) }),
      'gm'
    );
    assert.equal(longest.success, true, JSON.stringify(longest));
  });
});

describe('a refused Iterative Attempt changes nothing', () => {
  const unreachable = (world) => {
    world.system.iterative.actions[2].availability.rules = [
      { source: 'counter', counterId: 'heat', op: '>=', value: 9 },
    ];
  };
  const cases = {
    'action-not-found': { act: (world) => world.take('nope') },
    'action-unavailable': { arrange: unreachable, act: (world) => world.take('rest') },
    'cost-unaffordable': { options: { fuel: 3 }, act: (world) => world.take('heave') },
    'step-time-pending': {
      options: { timeRequirement: { hours: 1 } },
      act: (world) => world.take('rest'),
    },
  };
  for (const [reason, { options = {}, arrange, act }] of Object.entries(cases)) {
    it(`refuses ${reason}`, async () => {
      const world = iterativeCommandWorld(options);
      arrange?.(world);
      assert.equal((await world.start()).success, true);
      const reply = await unchangedBy(world, () => act(world));
      assert.equal(reply.success, false);
      assert.equal(reply.reason, reason);
      assert.equal(Object.hasOwn(reply, 'check'), false);
      assert.equal(Object.hasOwn(reply, 'rollHandoff'), false);
    });
  }

  it('carries the resolver detail verbatim', async () => {
    const world = await startedWorld({ fuel: 3 });
    const reply = await world.take('heave');
    assert.deepEqual(reply.detail, { entryId: 'lift', counterId: 'fuel', amount: 5 });
  });

  it('resolves a matured timed step with nothing consumed again, resuming the run', async () => {
    const world = await startedWorld({ timeRequirement: { hours: 1 } });
    const before = world.revision();
    assert.equal((await world.take('rest')).reason, 'step-time-pending');
    assert.equal(world.revision(), before);
    globalThis.game.time.worldTime += 3600;
    const ores = world.actor.items.length;
    const reply = await world.take('stoke');
    assert.equal(reply.success, true, JSON.stringify(reply));
    assert.equal(world.actor.items.length, ores);
    assert.equal(world.run().status, 'inProgress');
    assert.equal(world.run().steps[0].status, 'inProgress');
  });
});

describe('a checked Iterative Attempt', () => {
  it('rolls the routed check for its action and promotes the step evidence to check', async () => {
    const world = await startedWorld();
    world.nextTotal = 15;
    const reply = await world.take('hammer');
    assert.equal(reply.success, true, JSON.stringify(reply));
    assert.deepEqual(reply.iterative.attempt.check, { success: true, outcomeId: 'hit', value: 15 });
    assert.equal(heat(world), 1);
    assert.deepEqual(world.run().steps[0].resolutionSnapshot, { kind: 'check', mode: 'iterative' });
    world.nextTotal = 3;
    const missed = await world.take('hammer');
    assert.deepEqual(missed.iterative.attempt.check, {
      success: false,
      outcomeId: 'miss',
      value: 3,
    });
    assert.equal(heat(world), 1, 'a failed check is an outcome, not a refusal');
  });

  it('refuses a roll leg for another action as check-mismatch and posts no roll', async () => {
    const world = await startedWorld();
    const described = await world.service.handleRequest(
      request(world, 'takeAction', { actionId: 'hammer', attemptId: 'leg' }),
      'gm'
    );
    assert.equal(described.checkRequired, true, JSON.stringify(described));
    const reply = await unchangedBy(world, () =>
      world.service.handleRequest(
        request(world, 'takeAction', {
          actionId: 'stoke',
          attemptId: 'leg',
          prepareToken: described.prepareToken,
          rollDecision: {},
        }),
        'gm'
      )
    );
    assert.equal(reply.reason, 'check-mismatch');
    assert.equal(Object.hasOwn(reply, 'rollHandoff'), false);
    assert.equal(Object.hasOwn(reply, 'check'), false);
  });

  it('releases a takeAction prepare token, and the prompt names what it releases', async () => {
    const world = await startedWorld();
    const first = await world.service.handleRequest(
      request(world, 'takeAction', { actionId: 'hammer', attemptId: 'held' }),
      'gm'
    );
    const release = () =>
      world.service.handleRequest(
        request(world, 'releaseCheck', {
          prepareToken: first.prepareToken,
          releases: 'takeAction',
        }),
        'gm'
      );
    assert.deepEqual(await release(), { success: true, cancelled: true });
    assert.equal((await release()).reason, 'prepare-token-invalid', 'a token releases once');
    const sent = [];
    await settlePromptedCheck(
      { action: 'takeAction', payload: { actionId: 'hammer' } },
      { prepareToken: 'token', promptDescriptor: {} },
      {
        sendCommand: async (command) => {
          sent.push(command);
        },
        promptCheck: async () => null,
      }
    );
    assert.deepEqual(sent[0].payload, { prepareToken: 'token', releases: 'takeAction' });
  });

  it('refuses stale-run when another manager moves the run at persist, posting no roll', async () => {
    const world = await startedWorld();
    const update = world.manager.updateRun.bind(world.manager);
    let bumped = false;
    world.manager.updateRun = async (actor, run, options) => {
      if (!bumped) {
        bumped = true;
        const other = new CraftingRunManager();
        const current = other.getActiveRun(actor, run.id);
        await other.updateRun(actor, current, { expectedRevision: current.runRevision });
      }
      return update(actor, run, options);
    };
    const reply = await world.take('hammer');
    world.manager.updateRun = update;
    assert.equal(bumped, true);
    assert.equal(reply.reason, 'stale-run', JSON.stringify(reply));
    assert.equal(Object.hasOwn(reply, 'check'), false);
    assert.equal(Object.hasOwn(reply, 'rollHandoff'), false);
    assert.equal(world.stepState().log.length, 0);
    assert.deepEqual(world.messages, []);
  });

  it('keeps a secret check GM-only and posts no player roll when it is then refused', async () => {
    const world = await startedWorld();
    world.visibility.getVisibleRecipes = ({ viewer }) =>
      viewer?.isGM ? [{ recipe: world.recipe }] : [];
    const described = await world.service.handleRequest(
      request(world, 'takeAction', { actionId: 'hammer', attemptId: 'secret' }),
      'player'
    );
    assert.equal(described.checkRequired, true, JSON.stringify(described));
    const update = world.manager.updateRun.bind(world.manager);
    world.manager.updateRun = async (actor, run, options) => {
      const other = new CraftingRunManager();
      const current = other.getActiveRun(actor, run.id);
      await other.updateRun(actor, current, { expectedRevision: current.runRevision });
      world.manager.updateRun = update;
      return update(actor, run, options);
    };
    const reply = await world.service.handleRequest(
      request(world, 'takeAction', {
        actionId: 'hammer',
        attemptId: 'secret',
        prepareToken: described.prepareToken,
        rollDecision: {},
      }),
      'player'
    );
    assert.equal(reply.success, false);
    assert.equal(world.messages.length, 1, 'only the GM roll posted at evaluation');
    assert.ok(world.messages[0].rolls?.length > 0, 'it is the roll message');
    assert.equal(Object.hasOwn(reply, 'rollHandoff'), false);
    assert.equal(world.stepState().log.length, 0);
  });
});

describe('two command services over one ledger', () => {
  it('refuse the second roll of one revision stale, before it consumes its token', async () => {
    const world = await startedWorld();
    const ledger = sharedAuthorityWorld();
    const consumed = [];
    const serviceOver = (label) => {
      const authority = ledger.realm('gm');
      const run = authority.run.bind(authority);
      authority.run = (claimed, handler) =>
        run(claimed, (helpers) =>
          handler({
            ...helpers,
            consumePrepareToken: (...args) => {
              consumed.push(label);
              return helpers.consumePrepareToken(...args);
            },
          })
        );
      const manager = new CraftingRunManager();
      const engine = new CraftingEngine(
        world.recipeManager,
        manager,
        world.modes,
        null,
        null,
        null,
        {
          getCraftingSystem: (id) => world.systems.getSystem(id),
          rollDie: world.die.rollDie,
        }
      );
      const fabricate = { ...world.fabricate, craftingEngine: engine, craftingRunManager: manager };
      return createJournalCommandsForFabricate(fabricate, authority);
    };
    const [a, b] = [serviceOver('a'), serviceOver('b')];
    const revision = world.revision();
    const leg = (attemptId, extra = {}) =>
      request(
        world,
        'takeAction',
        { actionId: 'hammer', attemptId, ...extra },
        {
          expectedRevision: revision,
        }
      );
    const describedA = await a.handleRequest(leg('a'), 'gm');
    const describedB = await b.handleRequest(leg('b'), 'gm');
    assert.equal(describedA.checkRequired, true, JSON.stringify(describedA));
    assert.equal(describedB.checkRequired, true, JSON.stringify(describedB));
    const rolled = (prepareToken) => ({ rollDecision: {}, prepareToken });
    const rollA = await a.handleRequest(leg('a', rolled(describedA.prepareToken)), 'gm');
    assert.equal(rollA.success, true, JSON.stringify(rollA));
    const messages = world.messages.length;
    const before = world.flag();
    const rollB = await b.handleRequest(leg('b', rolled(describedB.prepareToken)), 'gm');
    assert.equal(rollB.reason, 'stale-run');
    assert.deepEqual(world.flag(), before);
    assert.equal(world.messages.length, messages);
    assert.deepEqual(consumed, ['a']);
  });
});
