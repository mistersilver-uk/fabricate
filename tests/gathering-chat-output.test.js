/**
 * Integration tests for GatheringEngine gathering result chat output:
 * the `_postGatheringChatMessage` resolver and the `_terminalStart` wiring.
 */
import test from 'node:test';
import assert from 'node:assert/strict';

import { GatheringEngine } from '../src/systems/GatheringEngine.js';

// ---------------------------------------------------------------------------
// Globals / harness
// ---------------------------------------------------------------------------

let chatCreated = [];
function resetChat({ throwOnCreate = false } = {}) {
  chatCreated = [];
  globalThis.ChatMessage = {
    create(data) {
      if (throwOnCreate) return Promise.reject(new Error('boom'));
      chatCreated.push(data);
      return Promise.resolve({ id: `msg-${chatCreated.length}` });
    },
    getSpeaker({ actor } = {}) { return { alias: actor?.name || 'Unknown' }; }
  };
}

globalThis.game = { user: { id: 'user-1' } };

const COMPONENTS = [
  { id: 'comp-herb', name: 'Herb', img: 'icons/herb.png' },
  { id: 'comp-sickle', name: 'Worn Sickle', img: 'icons/sickle.png' }
];

function buildEngine() {
  return new GatheringEngine({
    systemManager: { getItems: () => COMPONENTS }
  });
}

function buildSystem(chatOutputEnabled = true) {
  return { id: 'sys-1', features: { chatOutput: chatOutputEnabled } };
}

function buildArgs(overrides = {}) {
  return {
    actor: { name: 'Aria', uuid: 'Actor.aria' },
    system: buildSystem(true),
    task: { id: 'task-1', name: 'Forage Herbs' },
    status: 'succeeded',
    createdResults: [{ actorUuid: 'Actor.aria', itemUuid: 'Item.h1', quantity: 2 }],
    usedTools: [
      { componentId: 'comp-sickle', broken: true, itemRef: { itemUuid: 'Item.s1' } },
      { componentId: 'comp-herb', broken: false }
    ],
    checkResult: {
      items: [{ id: 'r1', componentId: 'comp-herb', itemUuid: 'Item.h1', quantity: 2 }],
      hazards: [{ name: 'Thornpatch', img: 'icons/thorn.png' }]
    },
    run: { economyEvidence: { stamina: { spent: 5 }, node: { remaining: 2 } } },
    ...overrides
  };
}

// ---------------------------------------------------------------------------

test('posts exactly one card with resolved component/hazard/tool/economy content', async () => {
  resetChat();
  const engine = buildEngine();

  await engine._postGatheringChatMessage(buildArgs());

  assert.equal(chatCreated.length, 1, 'one message posted');
  const { content, user, speaker } = chatCreated[0];
  assert.equal(user, 'user-1', 'posts as the current user');
  assert.equal(speaker.alias, 'Aria', 'speaker is the gathering actor');
  assert.ok(content.includes('2× Herb'), 'component name + quantity resolved via componentId join');
  assert.ok(content.includes('src="icons/herb.png"'), 'component image resolved');
  assert.ok(content.includes('Thornpatch'), 'hazard name');
  assert.ok(content.includes('src="icons/thorn.png"'), 'hazard image');
  assert.ok(content.includes('Worn Sickle'), 'broken tool resolved by componentId');
  assert.ok(!content.includes('comp-herb'), 'unbroken tool not listed');
  assert.ok(content.includes('FABRICATE.Chat.GatherStamina'), 'stamina label');
  assert.ok(content.includes('FABRICATE.Chat.GatherNodes'), 'nodes label');
});

test('does not post when chatOutput is disabled', async () => {
  resetChat();
  const engine = buildEngine();
  await engine._postGatheringChatMessage(buildArgs({ system: buildSystem(false) }));
  assert.equal(chatCreated.length, 0, 'no message when toggle off');
});

test('does not post when system is missing', async () => {
  resetChat();
  const engine = buildEngine();
  await engine._postGatheringChatMessage(buildArgs({ system: null }));
  assert.equal(chatCreated.length, 0, 'no message without a system');
});

test('does not reject when ChatMessage.create throws', async () => {
  resetChat({ throwOnCreate: true });
  const engine = buildEngine();
  await assert.doesNotReject(() => engine._postGatheringChatMessage(buildArgs()));
});

test('createdResults join recovers component name, not the raw uuid', async () => {
  resetChat();
  const engine = buildEngine();
  await engine._postGatheringChatMessage(buildArgs());
  const { content } = chatCreated[0];
  assert.ok(!content.includes('Item.h1'), 'raw item uuid not shown when component resolves');
});

test('_terminalStart skips chat output for opaque blind tasks', async () => {
  resetChat();
  const engine = buildEngine();
  await engine._terminalStart({
    viewer: { isGM: false },
    actor: { name: 'Aria' },
    system: buildSystem(true),
    environment: { id: 'env-1', selectionMode: 'blind' },
    task: { id: 'task-1', name: 'Forage Herbs' },
    status: 'succeeded',
    run: { id: 'run-1', status: 'succeeded', economyEvidence: { stamina: { spent: 5 } } },
    createdResults: [],
    usedCatalysts: [],
    usedTools: [],
    checkResult: { items: [], hazards: [] }
  });
  assert.equal(chatCreated.length, 0, 'blind task posts no chat card');
});

test('_terminalStart posts chat output for transparent tasks', async () => {
  resetChat();
  const engine = buildEngine();
  await engine._terminalStart({
    viewer: { isGM: true },
    actor: { name: 'Aria' },
    system: buildSystem(true),
    environment: { id: 'env-1', selectionMode: 'targeted' },
    task: { id: 'task-1', name: 'Forage Herbs' },
    status: 'succeeded',
    run: { id: 'run-1', status: 'succeeded', economyEvidence: { node: { remaining: 1 } } },
    createdResults: [{ actorUuid: 'Actor.aria', itemUuid: 'Item.h1', quantity: 1 }],
    usedCatalysts: [],
    usedTools: [],
    checkResult: { items: [{ componentId: 'comp-herb', itemUuid: 'Item.h1', quantity: 1 }], hazards: [] }
  });
  assert.equal(chatCreated.length, 1, 'transparent task posts one chat card');
  assert.ok(chatCreated[0].content.includes('Herb'), 'component resolved');
});
