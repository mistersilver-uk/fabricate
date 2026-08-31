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
      events: [{ name: 'Thornpatch', img: 'icons/thorn.png' }]
    },
    run: { economyEvidence: { stamina: { spent: 5 }, node: { remaining: 2 } } },
    ...overrides
  };
}

// ---------------------------------------------------------------------------

test('posts exactly one card with resolved component/event/tool/economy content', async () => {
  resetChat();
  const engine = buildEngine();

  await engine._postGatheringChatMessage(buildArgs());

  assert.equal(chatCreated.length, 1, 'one message posted');
  const { content, speaker, ...rest } = chatCreated[0];
  // NO `user` KEY, AND ITS ABSENCE IS THE ASSERTION. `ChatMessage`'s author field is `author`,
  // there is no `user` -> `author` shim on this document, and `DocumentAuthorField` already
  // defaults to `game.user.id` -- so a `user` key was silently dropped on v14 and warned on v13
  // while the card was authored correctly anyway. Passing it asserted nothing and cost a
  // compatibility warning; this pins that it is not passed rather than that it is.
  assert.ok(!('user' in rest), 'no dead `user` key -- ChatMessage defaults `author` itself');
  assert.equal(speaker.alias, 'Aria', 'speaker is the gathering actor');
  assert.ok(content.includes('2× Herb'), 'component name + quantity resolved via componentId join');
  assert.ok(content.includes('src="icons/herb.png"'), 'component image resolved');
  assert.ok(content.includes('Thornpatch'), 'event name');
  assert.ok(content.includes('src="icons/thorn.png"'), 'event image');
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

// A blind attempt used to post NOTHING, which made a successful blind gather
// indistinguishable from nothing happening: the start response withholds
// `createdResults` by design, so the card is the player's only report. These two pin
// the replacement contract — the card is always posted; only the IDENTITY moves.
async function startBlind(engine, { revealedTaskIds = null } = {}) {
  if (revealedTaskIds) {
    engine.richState = { listRevealedTaskIds: () => revealedTaskIds };
  }
  return engine._terminalStart({
    viewer: { isGM: false },
    actor: { name: 'Aria' },
    system: buildSystem(true),
    environment: { id: 'env-1', selectionMode: 'blind' },
    task: { id: 'task-1', name: 'Forage Herbs' },
    status: 'succeeded',
    run: {
      id: 'run-1',
      status: 'succeeded',
      economyEvidence: { stamina: { spent: 5 }, node: { remaining: 2 } }
    },
    createdResults: [{ actorUuid: 'Actor.aria', componentId: 'comp-herb', quantity: 2 }],
    usedTools: [],
    checkResult: { items: [], events: [] }
  });
}

test('_terminalStart reports an unrevealed blind attempt under the generic label', async () => {
  resetChat();
  const engine = buildEngine();

  await startBlind(engine);

  assert.equal(chatCreated.length, 1, 'blind task still posts a chat card');
  const { content } = chatCreated[0];
  assert.ok(content.includes('2× Herb'), 'the haul the player actually received is named');
  assert.ok(!content.includes('Forage Herbs'), 'the drawn task is NOT named');
  assert.ok(
    content.includes('FABRICATE.Gathering.BlindTaskLabel'),
    'the generic blind label stands in for the task name'
  );
  assert.ok(
    !content.includes('FABRICATE.Chat.GatherNodes'),
    'the drawn task’s node count stays hidden — the in-memory run carries it unredacted'
  );
});

test('_terminalStart names a blind task the reveal policy has already disclosed', async () => {
  resetChat();
  const engine = buildEngine();

  await startBlind(engine, { revealedTaskIds: ['task-1'] });

  assert.equal(chatCreated.length, 1, 'one card posted');
  const { content } = chatCreated[0];
  assert.ok(content.includes('Forage Herbs'), 'a revealed task is named on its own card');
  assert.ok(
    !content.includes('FABRICATE.Gathering.BlindTaskLabel'),
    'the generic label is dropped once the task is revealed'
  );
  assert.ok(content.includes('FABRICATE.Chat.GatherNodes'), 'a revealed task reports its nodes');
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
    usedTools: [],
    checkResult: { items: [{ componentId: 'comp-herb', itemUuid: 'Item.h1', quantity: 1 }], events: [] }
  });
  assert.equal(chatCreated.length, 1, 'transparent task posts one chat card');
  assert.ok(chatCreated[0].content.includes('Herb'), 'component resolved');
});

// ---------------------------------------------------------------------------
// A d100 gather whose drop rows all miss reports SUCCESS (d100 status is decided by
// events, not by drops) and awards nothing. The card used to degrade to a bare
// "Gathering Successful" header, which is what a broken module looks like.
// ---------------------------------------------------------------------------

test('a succeeded attempt that awarded nothing posts an explicit empty-results card', async () => {
  resetChat();
  const engine = buildEngine();

  await engine._postGatheringChatMessage(
    buildArgs({ createdResults: [], checkResult: { items: [], events: [] }, usedTools: [] })
  );

  assert.equal(chatCreated.length, 1, 'a card is still posted');
  const { content } = chatCreated[0];
  assert.ok(content.includes('fabricate-gather-chat--empty'), 'the empty state modifier is used');
  assert.ok(content.includes('fabricate-gather-chat__empty'), 'the empty-state line is rendered');
  assert.ok(
    !/fabricate-gather-chat__item/.test(content),
    'no phantom result rows are rendered'
  );
});

test('an empty-results success still reports the economy it spent', async () => {
  resetChat();
  const engine = buildEngine();

  await engine._postGatheringChatMessage(
    buildArgs({ createdResults: [], checkResult: { items: [], events: [] }, usedTools: [] })
  );

  const { content } = chatCreated[0];
  // The sting of the original report: the node and stamina were spent for nothing. The
  // card has to keep showing that, or the player cannot tell the attempt cost them.
  assert.ok(content.includes('FABRICATE.Chat.GatherStamina'), 'stamina spent is still shown');
  assert.ok(content.includes('FABRICATE.Chat.GatherNodes'), 'nodes remaining is still shown');
});

test('a component-identified award renders its component, with no uuid to join on', async () => {
  resetChat();
  const engine = buildEngine();

  // Exactly the shape `plan` produces for an award whose document does not exist yet:
  // componentId, no itemUuid. Before this it fell through every lookup and rendered blank.
  await engine._postGatheringChatMessage(
    buildArgs({
      createdResults: [
        { actorUuid: 'Actor.aria', itemUuid: null, componentId: 'comp-herb', quantity: 4 },
      ],
      checkResult: { items: [], events: [] },
      usedTools: [],
    })
  );

  const { content } = chatCreated[0];
  assert.ok(content.includes('Herb'), 'the component name resolves from componentId alone');
  assert.ok(content.includes('4× Herb'), 'with its quantity');
  assert.ok(!content.includes('fabricate-gather-chat__empty'), 'this is NOT an empty award');
});

// ---------------------------------------------------------------------------
// The pooled `Nd100` roll is chat output too: `resolveD100Attempt` posts it via
// `toMessage`, publicly, with the flavour the engine hands it. It used to be built
// from `task.name` unconditionally, so the very first blind attempt broadcast the
// drawn task's real name to the whole table — the one place blind gathering spoke
// was the one place it leaked.
// ---------------------------------------------------------------------------

function buildD100Engine({ revealedTaskIds = null } = {}) {
  const calls = [];
  const engine = new GatheringEngine({ systemManager: { getItems: () => COMPONENTS } });
  engine.richState = {
    resolveD100Attempt(args) {
      calls.push(args);
      return Promise.resolve({ status: 'succeeded', items: [], events: [] });
    },
    ...(revealedTaskIds ? { listRevealedTaskIds: () => revealedTaskIds } : {})
  };
  return { engine, calls };
}

function d100Args(selectionMode) {
  return {
    viewer: { isGM: false },
    actor: { name: 'Aria' },
    system: buildSystem(true),
    environment: { id: 'env-1', selectionMode },
    task: { id: 'task-1', name: 'Forage Herbs' },
    interactive: false
  };
}

test('the pooled d100 roll does not name an unrevealed blind task', async () => {
  const { engine, calls } = buildD100Engine();

  await engine._resolveD100Outcome(d100Args('blind'));

  assert.equal(calls.length, 1, 'the resolver ran');
  assert.equal(calls[0].flavor, 'FABRICATE.Gathering.BlindTaskLabel — Gathering check');
});

test('the pooled d100 roll names a revealed blind task', async () => {
  const { engine, calls } = buildD100Engine({ revealedTaskIds: ['task-1'] });

  await engine._resolveD100Outcome(d100Args('blind'));

  assert.equal(calls[0].flavor, 'Forage Herbs — Gathering check');
});

test('the pooled d100 roll names the task in a transparent environment', async () => {
  const { engine, calls } = buildD100Engine();

  await engine._resolveD100Outcome(d100Args('targeted'));

  assert.equal(calls[0].flavor, 'Forage Herbs — Gathering check');
});
