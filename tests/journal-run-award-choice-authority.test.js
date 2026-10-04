/**
 * Issue 1773 PR4: an interrupted or overlapping award settle through the REAL journal-run ledger
 * (`createJournalRunAuthority`), command service, engine and run manager. An interruption never
 * strands the run: reconcile or boot recovery discards a plan nothing applied, so a fresh request
 * settles it, and marks one that applied anything recovery-required, so it may be dismissed. A
 * settle refused before it plans answers a refusal and never puts the authority into recovery.
 */
import assert from 'node:assert/strict';
import test from 'node:test';

import { createJournalRunCommandService } from '../src/systems/journalRunCommands.js';
import { RunJournalBuilder } from '../src/ui/presenters/RunJournalBuilder.js';

import { craftWithGroup, interrupt, pickGroup } from './helpers/choiceGroupWorld.js';
import { sharedAuthorityWorld } from './helpers/sharedAuthorityWorld.js';

const GM = Object.freeze({ id: 'gm', isGM: true });
const USERS = new Map([
  ['gm', GM],
  ['player', { id: 'player', isGM: false }],
]);

/**
 * The real ledger wired the way `main.js` wires it, over the world `craftWithGroup` drives: the
 * engine consumes the ledger's grants, and reconciliation reconstructs through the run manager.
 * A grant the ledger never issued is the fixture's, so `world.settle` still stands in for a GM
 * tab that closed between two writes with no claim behind it.
 */
function ledgerWorld(world, ledger = sharedAuthorityWorld()) {
  const realm = () =>
    ledger.realm('gm', {
      reconstructExecutions: (scope) => world.manager().reconstructVersionedExecutions(scope),
    });
  let authority = realm();
  const fixtureGrants = world.engine.versionedRunAuthority.consumeExecutionGrant;
  world.engine.installVersionedRunAuthority({
    consumeExecutionGrant: (grant, expected) =>
      authority.consumeExecutionGrant(grant, expected) ?? fixtureGrants(grant, expected),
  });
  world.actor.testUserPermission = (user, level) => level === 'OWNER' && user?.id === 'player';
  let sequence = 0;
  const commands = () =>
    createJournalRunCommandService({
      authority,
      currentUser: () => GM,
      activeGM: () => GM,
      getUser: (id) => USERS.get(id) ?? null,
      resolveUuid: async () => world.actor,
      emit: () => {},
      randomId: () => `random-${(sequence += 1)}`,
      operations: {
        crafting: {
          getRun: ({ runId }) => world.manager().getRun(world.actor, runId),
          chooseAward: ({ run, payload, executionGrant, requestId, expectedRevision }) =>
            world.engine.settleAwardChoice({
              actor: world.actor,
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
  let service = commands();
  return {
    ledger,
    get authority() {
      return authority;
    },
    /** `chooseAward` of `picks` from the player's page in `sessionId`, under `requestId`. */
    settle: (picks, { requestId, sessionId = 'session-1' }) =>
      service.handleRequest(
        {
          requestId,
          sessionId,
          actorUuid: world.actor.uuid,
          runType: 'crafting',
          runId: world.runId,
          expectedRevision: world.run().runRevision,
          action: 'chooseAward',
          payload: { choiceId: 'pick', picks },
        },
        'player'
      ),
    dismiss: () =>
      service.dismissJournalRun({
        actorUuid: world.actor.uuid,
        runType: 'crafting',
        runId: world.runId,
      }),
    /** The claim the request `requestId` kept, released as the GM's reconcile does. */
    reconcile: (requestId) =>
      authority.reconcile({
        claimId: ledger.ledger.state.requests[requestId].claimId,
        disposition: 'reconciled',
      }),
    /** The GM's page reloaded: a new realm over the same ledger, before its boot recovery. */
    reload: () => {
      authority = realm();
      service = commands();
    },
  };
}

/** The run as the Journal projects it for the GM, with the engine's own claimability. */
function projected(world) {
  world.manager().invalidateCache(world.actor.id);
  const listing = new RunJournalBuilder({
    craftingRunManager: world.manager(),
    recipeManager: world.engine.recipeManager,
    getSystem: () => world.system,
    getResultItem: () => null,
    getComponent: () => null,
    getJournalActionAvailability: () => ({ available: true, reason: null }),
    getAwardChoiceClaimability: ({ run, actor }) =>
      world.engine.awardChoiceClaimability(run, actor),
  }).buildListing({ actor: world.actor, viewer: world.gm });
  return listing.activeRuns.find((run) => run.id === world.runId);
}

const atEffect = (effectId) => (transition) =>
  transition.type === 'effectApplying' && transition.effectId === effectId;

test('1773 PR4: a settle interrupted before it applied anything is reconciled into a fresh settle, from a reloaded page', async () => {
  const outcome = await craftWithGroup(pickGroup(), {
    act: async (world) => {
      await world.execute();
      const journalRun = ledgerWorld(world);
      const release = interrupt(world.manager, atEffect('award-choice'));
      const stopped = await journalRun.settle(['coin'], { requestId: 'settle-1' });
      release();
      const planned = world.run().awardChoiceJournal?.status;
      const blocked = await journalRun.settle(['coin'], { requestId: 'settle-blocked' });
      const reconciled = await journalRun.reconcile('settle-1');
      const discarded = world.run().awardChoiceJournal ?? null;
      const freed = projected(world);
      const collided = await journalRun.settle(['coin'], {
        requestId: 'settle-1',
        sessionId: 'session-2',
      });
      const fresh = await journalRun.settle(['coin'], {
        requestId: 'settle-2',
        sessionId: 'session-2',
      });
      return { stopped, planned, blocked, reconciled, discarded, freed, collided, fresh };
    },
  });
  const { stopped, planned, blocked, reconciled, discarded, freed, collided, fresh } = outcome;
  assert.equal(stopped.recoveryRequired, true, 'the interrupted settle holds the claim');
  assert.equal(planned, 'planned', 'its plan persisted before it stopped');
  assert.equal(
    blocked.reason,
    'claim-held',
    'the kept claim refuses every command until reconciled'
  );
  assert.equal(reconciled.success, true);
  assert.equal(discarded, null, 'the plan nothing applied is discarded');
  assert.equal(freed.awardChoiceBlocker, null, 'the run is freshly settleable');
  assert.equal(freed.actions.chooseAward, true);
  assert.equal(collided.reason, 'request-id-collision', 'the old request is never re-run');
  assert.equal(fresh.success, true, fresh.message ?? fresh.reason);
  assert.equal(outcome.gp, 4, 'credited once, by the fresh settle');
  assert.equal(outcome.record.steps[0].pendingAwardChoices[0].outcome, 'awarded');
});

test('1773 PR4: a settle interrupted after its award applied reconciles to dismissible recovery', async () => {
  const outcome = await craftWithGroup(pickGroup(), {
    act: async (world) => {
      await world.execute();
      const journalRun = ledgerWorld(world);
      const release = interrupt(world.manager, atEffect('settle-choice'));
      const stopped = await journalRun.settle(['coin'], { requestId: 'settle-1' });
      release();
      await journalRun.reconcile('settle-1');
      return { stopped, model: projected(world), dismissed: await journalRun.dismiss() };
    },
  });
  const { stopped, model, dismissed } = outcome;
  assert.equal(stopped.recoveryRequired, true);
  assert.equal(outcome.record.awardChoiceJournal.status, 'recoveryRequired');
  assert.equal(model.recoveryEvidence.required, true, 'its receipts read as recovery');
  assert.equal(model.actions.chooseAward, false);
  assert.equal(model.actions.dismiss, true, 'and the run may be dismissed');
  assert.equal(dismissed.success, true, dismissed.reason);
  assert.equal(outcome.gp, 4, 'the applied award stands, once');
});

test('1773 PR4: a GM page reloaded after an interrupted settle discards it at boot recovery', async () => {
  const outcome = await craftWithGroup(pickGroup(), {
    act: async (world) => {
      await world.execute();
      const journalRun = ledgerWorld(world);
      await journalRun.authority.bootstrapRecovery();
      // An engine-side stop with no claim behind it: the GM tab closed between two writes.
      const release = interrupt(world.manager, atEffect('settle-choice'));
      await assert.rejects(world.settle(['coin'], 'engine-settle'));
      release();
      const stopped = world.run().awardChoiceJournal.status;
      journalRun.reload();
      await journalRun.authority.bootstrapRecovery();
      return { stopped, model: projected(world) };
    },
  });
  assert.equal(outcome.stopped, 'planned', 'the award applied and the tab closed');
  assert.equal(outcome.record.awardChoiceJournal.status, 'recoveryRequired');
  assert.equal(
    outcome.model.actions.dismiss,
    true,
    'an applied award reads as dismissible recovery'
  );
  assert.equal(outcome.gp, 4);
});

test('1773 PR4: a reloaded GM page discards a plan nothing applied, and the pick settles fresh', async () => {
  const outcome = await craftWithGroup(pickGroup(), {
    act: async (world) => {
      await world.execute();
      const journalRun = ledgerWorld(world);
      await journalRun.authority.bootstrapRecovery();
      const release = interrupt(world.manager, atEffect('award-choice'));
      await assert.rejects(world.settle(['coin'], 'engine-settle'));
      release();
      journalRun.reload();
      await journalRun.authority.bootstrapRecovery();
      const discarded = world.run().awardChoiceJournal ?? null;
      return {
        discarded,
        fresh: await journalRun.settle(['coin'], { requestId: 'after-reload' }),
      };
    },
  });
  assert.equal(outcome.discarded, null);
  assert.equal(outcome.fresh.success, true, outcome.fresh.message ?? outcome.fresh.reason);
  assert.equal(outcome.gp, 4);
});

test('1773 PR4: a second settle while one is planned is refused, and the authority never enters recovery', async () => {
  const outcome = await craftWithGroup(pickGroup(), {
    act: async (world) => {
      await world.execute();
      const journalRun = ledgerWorld(world);
      await journalRun.authority.bootstrapRecovery();
      const release = interrupt(world.manager, atEffect('award-choice'));
      await assert.rejects(world.settle(['coin'], 'engine-settle'));
      release();
      const model = projected(world);
      const second = await journalRun.settle(['lore'], { requestId: 'second' });
      return {
        model,
        second,
        availability: journalRun.authority.availability(),
        request: journalRun.ledger.ledger.state.requests.second,
      };
    },
  });
  const { model, second, availability, request } = outcome;
  assert.equal(model.awardChoiceBlocker, 'executionInProgress', 'the face holds its confirm');
  assert.equal(model.actions.chooseAward, false);
  assert.equal(second.success, false);
  assert.match(second.message, /still in progress/);
  assert.equal(second.recoveryRequired, undefined);
  assert.equal(availability.available, true, 'every other command stays available');
  assert.equal(request.status, 'settled', 'the ledger settled the refusal');
  assert.equal(request.claimId, null, 'and released its claim');
  assert.equal(outcome.gp, 1, 'nothing was credited');
});

test('1773 PR4: a settle the executor refuses before planning answers a refusal, not recovery', async () => {
  const outcome = await craftWithGroup(pickGroup(), {
    act: async (world) => {
      const release = interrupt(world.manager, atEffect('post-chat'));
      await assert.rejects(world.execute());
      release();
      const journalRun = ledgerWorld(world);
      await journalRun.authority.bootstrapRecovery();
      const refused = await journalRun.settle(['coin'], { requestId: 'mid-stage' });
      return { refused, availability: journalRun.authority.availability() };
    },
  });
  assert.equal(outcome.refused.success, false);
  assert.match(outcome.refused.message, /execution in progress/);
  assert.equal(outcome.availability.available, true);
  assert.ok(!outcome.record.awardChoiceJournal, 'nothing was planned');
});
