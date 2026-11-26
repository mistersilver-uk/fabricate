/**
 * The iterative cards against the authority (issue 3011, D-1 and D-9): each card the Journal
 * projects is drawn from a real run, then pressed through the real `takeAction` command in a
 * fresh world at the same state. An enabled card is never refused for a preflight reason, and a
 * disabled one is refused for exactly the reason its note states.
 */
import assert from 'node:assert/strict';
import { describe, test } from 'node:test';

import { ITERATIVE_ATTEMPT_REFUSALS } from '../../src/systems/iterative/preflightAttempt.js';
import { RunJournalBuilder } from '../../src/ui/presenters/RunJournalBuilder.js';
import { forgeLibrary, iterativeCommandWorld } from '../helpers/iterativeCommandWorld.js';
import { workpieceLocalize } from '../helpers/iterativeJournalListing.js';

const PREFLIGHT_REASONS = new Set(Object.values(ITERATIVE_ATTEMPT_REFUSALS));
const PLAYER = { id: 'player', isGM: false };

/** The forge library plus one action gated on heat and one whose cost names an untracked counter. */
function oracleLibrary() {
  const library = forgeLibrary();
  const [stoke] = library.actions;
  library.actions.push(
    {
      ...structuredClone(stoke),
      id: 'temper',
      label: 'Temper',
      availability: {
        combine: 'all',
        rules: [{ source: 'counter', counterId: 'heat', op: '>=', value: 2 }],
      },
    },
    {
      ...structuredClone(stoke),
      id: 'quench',
      label: 'Quench',
      costs: [{ id: 'water', counterId: 'water', amount: '1', needsEnough: true }],
    }
  );
  library.counters.push({ id: 'water', label: 'Water', limit: 'none' });
  return library;
}

async function startedWorld(options) {
  const world = iterativeCommandWorld({ library: oracleLibrary(), ...options });
  const started = await world.start();
  assert.equal(started.success, true, JSON.stringify(started));
  return world;
}

/** The run's model as the Journal draws it for the owning player. */
function drawn(world) {
  const builder = new RunJournalBuilder({
    craftingRunManager: world.manager,
    recipeManager: world.recipeManager,
    resolutionModeService: world.modes,
    recipeVisibility: world.visibility,
    getSystem: world.systems.getSystem,
    localize: workpieceLocalize,
    nowWorldTime: () => globalThis.game.time.worldTime,
  });
  return builder.buildListing({ actor: world.actor, viewer: PLAYER }).activeRuns[0];
}

describe('every card agrees with the authority', () => {
  for (const fuel of [6, 3]) {
    test(`fuel ${fuel}`, async () => {
      const { iterative, actions } = drawn(await startedWorld({ fuel }));
      assert.equal(actions.takeAction, true);
      assert.ok(iterative.cards.some((card) => card.enabled));
      const notes = new Set(iterative.cards.map((card) => card.note));
      for (const note of fuel === 3 ? ['cost', 'needs', 'setup', 'rolls'] : ['needs', 'setup']) {
        assert.ok(notes.has(note), `fuel ${fuel} draws a "${note}" card`);
      }
      for (const card of iterative.cards) {
        const world = await startedWorld({ fuel });
        const reply = await world.take(card.actionId);
        if (card.enabled) {
          assert.ok(
            reply.success === true || !PREFLIGHT_REASONS.has(reply.reason),
            `${card.actionId} is enabled but refused ${reply.reason}`
          );
        } else {
          assert.equal(reply.success, false, card.actionId);
          assert.equal(reply.reason, card.reason, `${card.actionId} states ${card.note}`);
        }
      }
    });
  }
});

/** Takes `actionId` as the owning player, or as an observer who owns nothing. */
function takeAs(world, actionId, user) {
  if (user === 'player') return world.take(actionId);
  const request = {
    requestId: `oracle-${actionId}`,
    sessionId: 'oracle',
    actorUuid: world.actor.uuid,
    runType: 'crafting',
    runId: world.runId,
    expectedRevision: world.revision(),
    action: 'takeAction',
    payload: { actionId, attemptId: `oracle-${actionId}` },
  };
  return world.service.handleRequest(request, user);
}

const pauseOf = (world) =>
  world.service.executeJournalRunCommand(
    {
      actorUuid: world.actor.uuid,
      runType: 'crafting',
      runId: world.runId,
      expectedRevision: world.revision(),
      action: 'pause',
      payload: {},
    },
    { interactive: false }
  );

describe('each run-level cause disables every card, and the authority refuses each', () => {
  const CAUSES = {
    'time gate': { options: { timeRequirement: { hours: 1 } } },
    paused: {
      options: { timeRequirement: { hours: 1 } },
      arrange: async (world) => assert.equal((await pauseOf(world)).success, true),
    },
    boundary: {
      arrange: async (world) => {
        for (let attempt = 0; attempt < 4; attempt += 1) await world.take('stoke');
        assert.equal(world.run().currentStepIndex, 1);
      },
    },
    'not owner': {
      arrange: (world) => Object.defineProperty(world.actor, 'isOwner', { value: false }),
      user: 'observer',
    },
  };
  for (const [cause, { options = {}, arrange, user = 'player' }] of Object.entries(CAUSES)) {
    test(cause, async () => {
      const world = await startedWorld(options);
      await arrange?.(world);
      const { iterative, actions } = drawn(world);
      assert.equal(actions.takeAction, false);
      assert.ok(iterative.cards.length > 0);
      for (const card of iterative.cards) {
        assert.equal(card.enabled, false, card.actionId);
        const reply = await takeAs(world, card.actionId, user);
        assert.equal(reply.success, false, `${card.actionId} is refused while ${cause}`);
      }
    });
  }
});
