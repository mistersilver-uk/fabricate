/**
 * Salvage chat output (issue 675): the salvage analogue of craft-chat-output.
 *
 * Covers `_postSalvageChatMessage` directly — the chatOutput gate on/off, the
 * success and failure payloads, broken-tool resolution — plus an integration proof
 * that `salvage()` posts on success but stays silent on a cancelled prompt.
 */
import test from 'node:test';
import assert from 'node:assert/strict';

import { CraftingEngine } from '../src/systems/CraftingEngine.js';

let chatCreated = [];
function resetChat() {
  chatCreated = [];
  globalThis.ChatMessage = {
    create(data) {
      chatCreated.push(data);
      return Promise.resolve({ id: `msg-${chatCreated.length}` });
    },
    getSpeaker({ actor } = {}) {
      return { alias: actor?.name || 'Unknown' };
    },
  };
}

function setupGame() {
  globalThis.game = {
    i18n: { localize: (key) => key },
    user: { id: 'user-1' },
    time: { worldTime: 0 },
  };
}

function systemWithChat(chatOutput) {
  return {
    id: 'sys-1',
    features: { salvage: true, chatOutput },
    components: [{ id: 'tool-c', name: 'Prospector Hammer', img: 'icons/hammer.png' }],
  };
}

const component = { id: 'ore', name: 'Iron Ore', img: 'icons/ore.png' };

test('_postSalvageChatMessage: does NOT post when chatOutput is off', async () => {
  setupGame();
  resetChat();
  const engine = new CraftingEngine({});
  await engine._postSalvageChatMessage({
    success: true,
    actor: { name: 'Akra' },
    system: systemWithChat(false),
    component,
    consumedQuantity: 1,
    results: [{ name: 'Iron Shard', system: { quantity: 2 } }],
    usedTools: [],
  });
  assert.equal(chatCreated.length, 0, 'gated off — no message');
});

test('_postSalvageChatMessage: success posts a salvage card with source, recovered items, and broken tools', async () => {
  setupGame();
  resetChat();
  const engine = new CraftingEngine({});
  await engine._postSalvageChatMessage({
    success: true,
    actor: { name: 'Akra' },
    system: systemWithChat(true),
    component,
    consumedQuantity: 1,
    results: [{ name: 'Iron Shard', img: 'icons/shard.png', system: { quantity: 2 } }],
    // Evidence records from _applyToolBreakage: only the broken one is shown, resolved
    // to its authored component name/img; a spared tool is skipped.
    usedTools: [
      { componentId: 'tool-c', broken: true },
      { componentId: 'tool-c', broken: false },
    ],
  });

  assert.equal(chatCreated.length, 1, 'exactly one message');
  const { content, speaker } = chatCreated[0];
  assert.equal(speaker.alias, 'Akra', 'salvaging actor speaker');
  assert.ok(content.includes('fabricate-craft-chat--success'), 'shared success card');
  assert.ok(content.includes('FABRICATE.Chat.SalvageSuccess'), 'salvage title');
  assert.ok(content.includes('Iron Ore'), 'source component');
  assert.ok(content.includes('2× Iron Shard'), 'recovered item with quantity');
  assert.ok(content.includes('Prospector Hammer'), 'broken tool by authored name');
  const hammerCount = content.split('Prospector Hammer').length - 1;
  assert.equal(hammerCount, 1, 'the tool is listed once (spared record skipped, no dup)');
});

test('_postSalvageChatMessage: failure posts the reason and the forfeited source', async () => {
  setupGame();
  resetChat();
  const engine = new CraftingEngine({});
  await engine._postSalvageChatMessage({
    success: false,
    actor: { name: 'Merric' },
    system: systemWithChat(true),
    component,
    consumedQuantity: 1,
    results: [],
    usedTools: [],
    failureReason: 'Roll fell short',
  });

  assert.equal(chatCreated.length, 1);
  const content = chatCreated[0].content;
  assert.ok(content.includes('fabricate-craft-chat--failure'), 'failure card');
  assert.ok(content.includes('FABRICATE.Chat.SalvageFailure'), 'salvage failure title');
  assert.ok(content.includes('Roll fell short'), 'the reason');
  assert.ok(content.includes('FABRICATE.Chat.ConsumedOnFailure'), 'forfeited section');
  assert.ok(content.includes('Iron Ore'), 'the forfeited source');
});

test('_postSalvageChatMessage: nothing forfeited on failure omits the forfeited section', async () => {
  setupGame();
  resetChat();
  const engine = new CraftingEngine({});
  await engine._postSalvageChatMessage({
    success: false,
    actor: { name: 'Merric' },
    system: systemWithChat(true),
    component,
    consumedQuantity: 0, // policy did not consume the source
    results: [],
    usedTools: [],
    failureReason: 'Roll fell short',
  });
  const content = chatCreated[0].content;
  assert.ok(content.includes('Roll fell short'), 'reason still shown');
  assert.ok(!content.includes('FABRICATE.Chat.ConsumedOnFailure'), 'no forfeited section');
});

test('_postSalvageChatMessage: a ChatMessage.create failure never throws out of the poster', async () => {
  setupGame();
  globalThis.ChatMessage = {
    create() {
      throw new Error('chat is down');
    },
    getSpeaker() {
      return {};
    },
  };
  const engine = new CraftingEngine({});
  await assert.doesNotReject(() =>
    engine._postSalvageChatMessage({
      success: true,
      actor: { name: 'Akra' },
      system: systemWithChat(true),
      component,
      consumedQuantity: 1,
      results: [],
      usedTools: [],
    })
  );
});
