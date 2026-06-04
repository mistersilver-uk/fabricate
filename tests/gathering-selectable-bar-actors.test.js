import test from 'node:test';
import assert from 'node:assert/strict';

import { createGatheringSelectableActorsGetter } from '../src/gatheringBootstrapAdapters.js';
import { isGatheringActorSelectableByUser } from '../src/config/preferencesCleanup.js';

// Mirror main.js's player-character concept seam and the bar selection predicate.
// These are intentionally re-stated here (rather than importing module-private
// helpers from main.js) so the test routes through the SAME injected-dependency
// boundary used by tests/gathering-engine-listing.test.js, without touching
// game.actors / game.settings.
function isPlayerCharacterActor(actor) {
  return actor?.type === 'character';
}

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

function makeBarGetter(actors) {
  return createGatheringSelectableActorsGetter({
    getActors: () => actors,
    getCurrentUser: () => player,
    isSelectable: (actor, viewer) => isSelectableBarActor({ actor, viewer })
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
