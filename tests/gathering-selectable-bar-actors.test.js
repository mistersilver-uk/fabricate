import test from 'node:test';
import assert from 'node:assert/strict';

import { createGatheringSelectableActorsGetter } from '../src/gatheringBootstrapAdapters.js';
import { isGatheringActorSelectableByUser } from '../src/config/preferencesCleanup.js';
import {
  createPlayerCharacterActorPredicate,
  isPlayerCharacterActor
} from '../src/config/playerCharacterTypes.js';

// This file used to RE-IMPLEMENT the player-character predicate locally, on the
// grounds that there was nothing importable in `main.js`. Issue 1024 destroyed that
// justification by extracting the concept into `src/config/playerCharacterTypes.js`,
// so both mirrors are gone: left alone, the local copy would have asserted the OLD
// hardcoded behaviour forever and the bar's PC narrowing would have lost all
// behavioural coverage.
//
// `isPlayerCharacterActor` is the settings-bound binding. Under `node --test` there is
// no `game`, so its reader degrades to `[]` and it resolves to `{'character'}` — which
// is exactly the un-configured world these cases model. The configured-`robot` case
// below uses `createPlayerCharacterActorPredicate` with an injected reader rather than
// installing a `game` global, so nothing leaks between test files.
function isSelectableBarActor({ actor, viewer }) {
  return isGatheringActorSelectableByUser(actor, viewer) && isPlayerCharacterActor(actor);
}

// Mirror of main.js#listSelectableActors's redaction mapping.
function redactActor(actor) {
  return {
    id: actor?.id ?? actor?.uuid ?? null,
    uuid: actor?.uuid ?? null,
    name: actor?.name ?? '',
    img: actor?.img ?? null
  };
}

const player = { id: 'player', isGM: false };
const gm = { id: 'gm', isGM: true };

const ownedPc = {
  id: 'pc-1', uuid: 'Actor.pc-1', name: 'Aria', img: 'icons/a.webp',
  type: 'character', isOwner: true,
  system: { secret: 'gm-only' }
};
const ownedNpc = {
  id: 'npc-1', uuid: 'Actor.npc-1', name: 'Goblin', img: null,
  type: 'npc', isOwner: true
};
const otherPc = {
  id: 'pc-2', uuid: 'Actor.pc-2', name: 'Borin', img: null,
  type: 'character', isOwner: false
};
// GoldenGamin's reported actor: a Fallout PC on the second player-character sheet.
const ownedRobot = {
  id: 'pc-3', uuid: 'Actor.pc-3', name: 'Robby', img: null,
  type: 'robot', isOwner: true
};

function makeBarGetter(actors, isPlayerCharacter = isPlayerCharacterActor) {
  return createGatheringSelectableActorsGetter({
    getActors: () => actors,
    getCurrentUser: () => player,
    isSelectable: (actor, viewer) =>
      isGatheringActorSelectableByUser(actor, viewer) && isPlayerCharacter(actor)
  });
}

test('the bar list narrows to owned player characters for a non-GM user', () => {
  const getter = makeBarGetter([ownedPc, ownedNpc, otherPc]);
  const selected = getter({ viewer: player });

  assert.deepEqual(selected.map((a) => a.id), ['pc-1'], 'only the owned PC is listed');
});

test('a GM sees all player characters but not non-player-character actors', () => {
  const getter = makeBarGetter([ownedPc, ownedNpc, otherPc]);
  const selected = getter({ viewer: gm });

  assert.deepEqual(selected.map((a) => a.id).sort(), ['pc-1', 'pc-2'], 'all PCs, no npc');
});

test('an owned `robot` is absent from the bar until the GM configures that actor type', () => {
  // Un-configured: the reported bug. `isSelectableBarActor` routes through the real
  // settings-bound predicate, which sees no `game` and resolves to {'character'}.
  const unconfigured = makeBarGetter([ownedPc, ownedRobot]);
  assert.deepEqual(
    unconfigured({ viewer: player }).map((a) => a.id),
    ['pc-1'],
    'the robot is invisible before configuration'
  );
  assert.equal(isSelectableBarActor({ actor: ownedRobot, viewer: player }), false);

  // Configured: the same actor now appears, with no change to the composition rule.
  const configured = makeBarGetter(
    [ownedPc, ownedRobot],
    createPlayerCharacterActorPredicate(() => ['robot'])
  );
  assert.deepEqual(
    configured({ viewer: player }).map((a) => a.id).sort(),
    ['pc-1', 'pc-3'],
    'a configured additional type joins the bar without displacing `character`'
  );
});

test('an owned non-PC stays attempt-authorized while absent from the bar list', () => {
  // Attempt authorization is the ownership predicate alone — and it passes.
  assert.equal(isGatheringActorSelectableByUser(ownedNpc, player), true, 'owned npc is attempt-authorized');
  // But it is excluded from the bar list (PC-narrowed).
  const getter = makeBarGetter([ownedPc, ownedNpc]);
  assert.deepEqual(getter({ viewer: player }).map((a) => a.id), ['pc-1'], 'owned npc absent from the bar list');
});

test('redacted records contain ONLY { id, uuid, name, img }', () => {
  const getter = makeBarGetter([ownedPc]);
  const records = getter({ viewer: gm }).map(redactActor);

  assert.equal(records.length, 1);
  assert.deepEqual(Object.keys(records[0]).sort(), ['id', 'img', 'name', 'uuid']);
  assert.deepEqual(records[0], { id: 'pc-1', uuid: 'Actor.pc-1', name: 'Aria', img: 'icons/a.webp' });
  // No leaked actor internals (e.g. the GM-only `system` field).
  assert.equal('system' in records[0], false, 'no actor internals leak');
});

// Mirror of main.js#listGatheringForActor's rememberedActorId default injection.
function injectRememberedActor(getSelected, options = {}) {
  return { rememberedActorId: getSelected() || null, ...options };
}

test('rememberedActorId defaults to the persisted selection', () => {
  const injected = injectRememberedActor(() => 'pc-1', {});
  assert.equal(injected.rememberedActorId, 'pc-1');
});

test('an explicit rememberedActorId overrides the persisted default', () => {
  const injected = injectRememberedActor(() => 'pc-1', { rememberedActorId: 'pc-2' });
  assert.equal(injected.rememberedActorId, 'pc-2', 'explicit option wins');
});

test('an empty persisted selection defaults rememberedActorId to null', () => {
  const injected = injectRememberedActor(() => '', {});
  assert.equal(injected.rememberedActorId, null);
});
