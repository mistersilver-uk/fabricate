/**
 * Issue 1288 — the blind-run relay's actor authorization must read the RELAYED
 * requester, and nothing about whoever is running the code.
 *
 * `applyGatheringBlindStart` re-runs a player's blind start on the ELECTED GM's client
 * with `viewer: requester` (the server-attested socket sender). Every gate the player
 * would have faced is therefore re-evaluated on a client whose ambient user is a GM — and
 * a GM is Foundry OWNER of every actor in the world. `Actor#isOwner` is defined as
 * `testUserPermission(game.user, 'OWNER')`, so an ownership predicate whose first
 * disjunct reads it short-circuits to `true` before the relayed requester is ever
 * consulted. The authorization was inert exactly where it ran: an authenticated player
 * could emit a blind start naming an `actorUuid` they did not own and the GM client would
 * start the attempt for it.
 *
 * These cases run the REAL production wiring from `main.js` — the same
 * `isGatheringActorSelectableByUser` predicate injected as `isActorSelectable` and the
 * same `createGatheringSelectableActorsGetter` composition — against a fixture actor whose
 * `isOwner` is derived from the installed ambient user the way Foundry derives it. A
 * fixture that hard-codes `isOwner: true` cannot see this defect at all.
 */
import assert from 'node:assert/strict';
import test from 'node:test';

import { isGatheringActorSelectableByUser } from '../src/config/preferencesCleanup.js';
import { createGatheringSelectableActorsGetter } from '../src/gatheringBootstrapAdapters.js';
import {
  BLIND_ENVIRONMENT_ID,
  BLIND_GM,
  BLIND_PLAYER,
  blindActor,
  makeBlindWorld,
} from './helpers/gathering-blind-runs.js';

/** An authenticated player who owns nothing — the relay's threat model. */
const INTRUDER = Object.freeze({ id: 'user-intruder', isGM: false });

/**
 * Run `body` with `user` installed as the ambient Foundry user, then restore.
 *
 * The ambient user is the ONLY thing that distinguishes the GM-side apply from the
 * player-side start these tests contrast, so it is installed explicitly rather than left
 * to a module-scoped global that would leak between cases.
 *
 * @param {object} user
 * @param {Function} body
 * @returns {Promise<*>}
 */
async function withAmbientUser(user, body) {
  const previous = globalThis.game;
  // A real roster, not just the ambient user: `getGatheringRunViewer` resolves a run's
  // OWNER out of `game.users`, and a one-entry stub would silently take the engine's
  // `isGM: false` fallback for every id but one — masking a mis-stamped owner.
  const roster = new Map([BLIND_GM, BLIND_PLAYER, INTRUDER].map((entry) => [entry.id, entry]));
  globalThis.game = { user, users: { get: (id) => roster.get(id) ?? null } };
  try {
    return await body();
  } finally {
    if (previous === undefined) delete globalThis.game;
    else globalThis.game = previous;
  }
}

/**
 * `src/main.js`'s two ambient identity seams for a run, verbatim.
 *
 * `new GatheringRunManager()` takes the default `getUserId`, which is `game.user.id`, and
 * the engine is injected with `getRunViewer: getGatheringRunViewer`. Both are supplied
 * here because the defect they combine to produce is invisible with either one stubbed.
 */
const PRODUCTION_RUN_IDENTITY = {
  getUserId: () => globalThis.game?.user?.id ?? null,
  getRunViewer: ({ run }) =>
    globalThis.game?.users?.get?.(run?.userId) ?? { id: run?.userId ?? null, isGM: false },
};

/**
 * The engine's two actor seams, wired exactly as `src/main.js` wires them: the predicate
 * verbatim, and the selectable-actor getter composed over the same predicate with the
 * ambient user as its viewer DEFAULT. Substituting a permissive stub here would test the
 * fixture rather than the shipped composition.
 *
 * @param {object} actor
 * @returns {{isActorSelectable: Function, getSelectableActors: Function}}
 */
function productionActorGates(actor) {
  return {
    isActorSelectable: ({ actor: candidate, viewer }) =>
      isGatheringActorSelectableByUser(candidate, viewer),
    getSelectableActors: createGatheringSelectableActorsGetter({
      getActors: () => [actor],
      getCurrentUser: () => globalThis.game?.user ?? null,
      isSelectable: isGatheringActorSelectableByUser,
    }),
  };
}

/** The GM-side body of the relay: `applyGatheringBlindStart`'s call, minus the Foundry edge. */
function relayedStart(world, viewer) {
  return world.engine.startAttempt({
    viewer,
    actor: world.actor,
    environmentId: BLIND_ENVIRONMENT_ID,
    interactive: false,
  });
}

test('a relayed blind start is refused for a requester who does not own the named actor', async () => {
  const actor = blindActor({ ownerIds: [BLIND_PLAYER.id] });
  const world = makeBlindWorld({ actor, ...productionActorGates(actor) });

  const result = await withAmbientUser(BLIND_GM, () => relayedStart(world, INTRUDER));

  assert.equal(
    result.accepted,
    false,
    'the requester owns nothing; the GM running the apply owns everything, and only the ' +
      'requester is the subject of the question'
  );
  assert.ok(
    !world.activeRun(),
    'a refused start must leave no waiting run on an actor the requester cannot act as'
  );
  assert.deepEqual(
    Object.keys(world.blindRecords()),
    [],
    'and no secret record, which is the state only a GM may write'
  );
});

test("the owning player's relayed blind start still starts, applied under a GM identity", async () => {
  const actor = blindActor({ ownerIds: [BLIND_PLAYER.id] });
  const world = makeBlindWorld({ actor, ...productionActorGates(actor) });

  const result = await withAmbientUser(BLIND_GM, () => relayedStart(world, BLIND_PLAYER));

  assert.equal(result.accepted, true, 'the relay must still work for the player it exists for');
  assert.equal(result.runStatus, 'waitingTime');
  assert.equal(result.taskId, null, 'and the run stays opaque to its non-GM requester');
});

test('a GM acting as themselves may still select any actor', async () => {
  // The `user.isGM` early return is deliberate and must survive the fix: what is
  // forbidden is a GM's AMBIENT identity standing in for a relayed requester, not a GM
  // legitimately gathering with an actor nobody owns.
  const actor = blindActor({ ownerIds: [] });
  const world = makeBlindWorld({ actor, ...productionActorGates(actor) });

  const result = await withAmbientUser(BLIND_GM, () => relayedStart(world, BLIND_GM));

  assert.equal(result.accepted, true, 'a GM selecting an unowned actor is not the defect');
});

test('an explicitly null viewer denies rather than throwing, on the path that defaults to one', async () => {
  // Dropping the `isOwner` disjunct made the second disjunct REACHABLE, and Foundry's
  // `testUserPermission` reads `user.isGM` as its first statement — so an unguarded call
  // throws for every actor whenever the viewer is null. That shape is representable:
  // `GatheringListingBuilder.listForActor` and `getTaskDropBreakdown` both default
  // `viewer = null`, and `createGatheringSelectableActorsGetter`'s own viewer default only
  // fires for `undefined`, so an explicit null travels all the way to the predicate.
  const actor = blindActor({ ownerIds: [BLIND_PLAYER.id] });
  const world = makeBlindWorld({ actor, ...productionActorGates(actor) });

  const listing = await withAmbientUser(BLIND_GM, () =>
    world.engine.listForActor({ viewer: null })
  );

  assert.ok(listing, 'the listing resolves; a security predicate that throws is an outage');
  assert.equal(
    listing.state,
    'NO_SELECTABLE_ACTORS',
    'and denies — an unidentified viewer may act as nobody, not as everybody'
  );
  assert.deepEqual(listing.selectableActors, [], 'no actor is offered to a null viewer');
  assert.ok(!listing.selectedActorId, 'and none is selected');
  assert.equal(isGatheringActorSelectableByUser(actor, null), false);
});

test('the ownership predicate reads the passed user only, whatever the ambient user owns', async () => {
  const actor = blindActor({ ownerIds: [BLIND_PLAYER.id] });

  await withAmbientUser(BLIND_GM, () => {
    // Proves the fixture is faithful: without this the cases below could pass simply
    // because the fixture never modelled the GM's world-wide ownership at all.
    assert.equal(actor.isOwner, true, 'Foundry reports a GM as OWNER of every actor');

    assert.equal(
      isGatheringActorSelectableByUser(actor, INTRUDER),
      false,
      'the ambient GM must not authorize a requester who owns nothing'
    );
    assert.equal(
      isGatheringActorSelectableByUser(actor, BLIND_PLAYER),
      true,
      'the real owner is still authorized'
    );
    assert.equal(
      isGatheringActorSelectableByUser(actor, BLIND_GM),
      true,
      'and a GM asking about themselves still is'
    );
    // `fromUuidSync` resolves a compendium uuid to a plain index entry with no
    // `testUserPermission` at all. "I cannot ask" is not "yes".
    assert.equal(
      isGatheringActorSelectableByUser({ id: 'index-entry' }, INTRUDER),
      false,
      'an actor whose permissions cannot be asked fails closed'
    );
  });

  await withAmbientUser(BLIND_PLAYER, () => {
    // The player-client path the predicate was always correct on: `isOwner` there IS
    // `testUserPermission(game.user, 'OWNER')`, so dropping it changed nothing.
    assert.equal(isGatheringActorSelectableByUser(actor, BLIND_PLAYER), true);
    assert.equal(isGatheringActorSelectableByUser(actor, INTRUDER), false);
  });
});

test('a relayed blind run is OWNED by its requester, so it is still blind at maturity', async () => {
  // The second instance of the same class (issue 1288). Authorization was not the only
  // thing on this path reading the ambient user: `GatheringRunManager.createRun` stamped
  // `userId` from `game.user`, which on the elected GM's client is the GM — for a run the
  // PLAYER requested. `getGatheringRunViewer` reads that field back at maturity, so the
  // run matured under a GM viewer, `_isOpaqueBlindTask` returned false, and the terminal
  // history written to the player's OWN actor flag named the drawn task in plain — for
  // every blind timed run in the game, since a player never has the permission to write
  // the blind store and so every one of them is relayed.
  const actor = blindActor({ ownerIds: [BLIND_PLAYER.id] });
  const world = makeBlindWorld({
    actor,
    ...productionActorGates(actor),
    ...PRODUCTION_RUN_IDENTITY,
  });

  const started = await withAmbientUser(BLIND_GM, () => relayedStart(world, BLIND_PLAYER));
  assert.equal(started.accepted, true, 'the relayed start is authorized');
  assert.equal(
    world.activeRun().userId,
    BLIND_PLAYER.id,
    'the run belongs to the requester, not to the GM client that applied the relay'
  );

  const matured = await withAmbientUser(BLIND_GM, () => world.mature());

  assert.equal(matured.completed.length, 1, 'the run still completes');
  const history = world.runManager.getRunHistory(actor)[0];
  assert.equal(history.taskId, 'blind', 'the terminal history stays opaque');
  assert.equal(
    JSON.stringify(history).includes('task-silver'),
    false,
    'and no part of the player-readable flag names the drawn task'
  );
});
