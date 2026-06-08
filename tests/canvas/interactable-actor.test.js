import test from 'node:test';
import assert from 'node:assert/strict';

import {
  resolveInteractableActor,
  isInteractableActor,
  pickGenericActorType,
  INTERACTABLE_ACTOR_NAME,
  INTERACTABLE_ACTOR_FLAG
} from '../../src/canvas/interactableActor.js';

function makeActor(overrides = {}) {
  return { id: 'a1', name: 'Some Actor', flags: {}, ...overrides };
}

test('isInteractableActor reads the flag', () => {
  assert.equal(isInteractableActor(makeActor()), false);
  assert.equal(isInteractableActor(makeActor({ flags: { fabricate: { [INTERACTABLE_ACTOR_FLAG]: true } } })), true);
  assert.equal(isInteractableActor(null), false);
});

test('returns the existing flagged actor without creating', async () => {
  const existing = makeActor({ id: 'backing', flags: { fabricate: { [INTERACTABLE_ACTOR_FLAG]: true } } });
  let created = 0;
  const result = await resolveInteractableActor({
    listActors: () => [makeActor(), existing, makeActor()],
    createActor: () => { created += 1; return makeActor({ id: 'new' }); },
    isGM: () => true,
    actorType: 'npc'
  });
  assert.equal(result, existing);
  assert.equal(created, 0);
});

test('creates exactly one flagged actor when none exists (GM)', async () => {
  const createdData = [];
  const result = await resolveInteractableActor({
    listActors: () => [makeActor(), makeActor()],
    createActor: (data) => { createdData.push(data); return makeActor({ id: 'created', ...data }); },
    isGM: () => true,
    actorType: 'character'
  });
  assert.equal(createdData.length, 1);
  assert.equal(createdData[0].name, INTERACTABLE_ACTOR_NAME);
  assert.equal(createdData[0].type, 'character');
  assert.equal(createdData[0].flags.fabricate[INTERACTABLE_ACTOR_FLAG], true);
  assert.equal(result.id, 'created');
});

test('non-GM cannot create the backing actor', async () => {
  let created = 0;
  const result = await resolveInteractableActor({
    listActors: () => [],
    createActor: () => { created += 1; return makeActor(); },
    isGM: () => false,
    actorType: 'npc'
  });
  assert.equal(result, null);
  assert.equal(created, 0);
});

test('non-GM still finds an existing backing actor', async () => {
  const existing = makeActor({ id: 'backing', flags: { fabricate: { [INTERACTABLE_ACTOR_FLAG]: true } } });
  const result = await resolveInteractableActor({
    listActors: () => [existing],
    createActor: () => makeActor(),
    isGM: () => false,
    actorType: 'npc'
  });
  assert.equal(result, existing);
});

test('pickGenericActorType prefers conventional generic types', () => {
  assert.equal(pickGenericActorType(['character', 'npc', 'vehicle']), 'npc');
  assert.equal(pickGenericActorType(['character', 'vehicle']), 'character');
  assert.equal(pickGenericActorType(['vehicle', 'group']), 'vehicle');
});

test('pickGenericActorType falls back to first non-base type', () => {
  assert.equal(pickGenericActorType(['base', 'creature']), 'creature');
  assert.equal(pickGenericActorType([]), null);
  assert.equal(pickGenericActorType(['base']), null);
});
