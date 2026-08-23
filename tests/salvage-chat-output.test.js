/**
 * Salvage chat output (issue 675): the salvage analogue of craft-chat-output.
 *
 * Covers `_postSalvageChatMessage` directly — the chatOutput gate on/off, the
 * success and failure payloads, broken-tool resolution — plus an integration proof
 * that `salvage()` posts on success but stays silent on a cancelled prompt.
 *
 * The second half covers COMPONENT COMPLICATIONS on the salvage path (issue 1286), and it
 * covers them end-to-end through `salvage()` rather than through the poster alone. That is
 * deliberate: the disclosure guarantee being asserted is that a `gmOnly` complication
 * reaches no player-readable surface, and the salvage RUN RECORD — an actor flag the owning
 * player can read — is one of those surfaces and is written by `salvage()`, not by the
 * card. Asserting only the card would leave the durable half unasserted, which is the
 * failure mode the delta calls out by name.
 */
import test from 'node:test';
import assert from 'node:assert/strict';

import { CraftingEngine } from '../src/systems/CraftingEngine.js';
import { SalvageRunManager } from '../src/systems/SalvageRunManager.js';
import { authoredComplications } from '../src/utils/componentComplications.js';

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

// ---------------------------------------------------------------------------
// Component complications (issue 1286)
// ---------------------------------------------------------------------------

/**
 * Build the two complications every case below uses, through the REAL normalizer.
 *
 * Hand-written literals would drift from the persisted shape the moment a key moved, and
 * the whole redaction contract is keyed on one of those keys (`visibility`), so a fixture
 * that spelled it slightly wrong would silently make every assertion below vacuous.
 */
function complicationsFor({ visibility, when, name, description, severity = 'major' }) {
  return authoredComplications([
    {
      id: `cx-${name.toLowerCase().replaceAll(' ', '-')}`,
      name,
      description,
      severity,
      visibility,
      activities: { salvage: true, crafting: false, gathering: false },
      when,
    },
  ]).complications;
}

const TOLD = complicationsFor({
  visibility: 'visible',
  when: { stageAwarded: true },
  name: 'Shrapnel Burst',
  description: 'Splinters spray across the bench.',
});

const WITHHELD = complicationsFor({
  visibility: 'gmOnly',
  when: { stageMissed: true },
  name: 'Curse Of The Deep',
  description: 'The GM knows what this means.',
  severity: 'severe',
});

/** The raw `fired` entries `fireComplications` hands the poster, one per complication. */
function firedEntry(complication, componentId, resultId, buckets) {
  return { complication, componentId, resultId, buckets, complicationId: complication.id };
}

test('_postSalvageChatMessage: renders a visible complication and NEVER a gmOnly one', async () => {
  setupGame();
  resetChat();
  const engine = new CraftingEngine({});
  const system = systemWithChat(true);
  system.components.push({ id: 'ingot', name: 'Iron Ingot' }, { id: 'slag', name: 'Slag' });

  await engine._postSalvageChatMessage({
    success: true,
    actor: { name: 'Akra' },
    system,
    component,
    consumedQuantity: 1,
    results: [],
    usedTools: [],
    firedComplications: [
      firedEntry(TOLD[0], 'ingot', 'r-1', ['full']),
      firedEntry(WITHHELD[0], 'slag', 'r-2', ['halted']),
    ],
  });

  const content = chatCreated[0].content;
  assert.ok(content.includes('Shrapnel Burst'), 'the visible complication is on the card');
  assert.ok(content.includes('Iron Ingot'), 'named against the stage occurrence that fired it');
  // NEGATIVE CONTROL: the gmOnly complication reaches no player-readable surface. Both its
  // name and its prose are asserted absent, because either alone would leak the beat.
  assert.ok(!content.includes('Curse Of The Deep'), 'the gmOnly name is absent');
  assert.ok(!content.includes('The GM knows what this means.'), 'the gmOnly prose is absent');
  assert.ok(!content.includes('Slag'), 'and so is the component it fired against');
});

test('_postSalvageChatMessage: the chatOutput gate covers complications too', async () => {
  setupGame();
  resetChat();
  const engine = new CraftingEngine({});
  await engine._postSalvageChatMessage({
    success: true,
    actor: { name: 'Akra' },
    system: systemWithChat(false),
    component,
    consumedQuantity: 1,
    results: [],
    usedTools: [],
    firedComplications: [firedEntry(TOLD[0], 'ingot', 'r-1', ['full'])],
  });
  assert.equal(chatCreated.length, 0, 'no card at all, so no complications either');
});

test('_postSalvageChatMessage: a suppressed bulk row posts no complication card', async () => {
  setupGame();
  resetChat();
  const engine = new CraftingEngine({});
  await engine._postSalvageChatMessage({
    success: true,
    actor: { name: 'Akra' },
    system: systemWithChat(true),
    component,
    consumedQuantity: 1,
    results: [],
    usedTools: [],
    suppressed: true,
    firedComplications: [firedEntry(TOLD[0], 'ingot', 'r-1', ['full'])],
  });
  // A bulk run posts ONE aggregate card carrying every row's complications; a per-row card
  // here would be the stray the suppression exists to prevent.
  assert.equal(chatCreated.length, 0, 'suppressed means suppressed');
});

// ---------------------------------------------------------------------------
// End-to-end through salvage(): the card, the run record and the return
// ---------------------------------------------------------------------------

/** A minimal owned item the engine can consume. */
function stubItem(id, name) {
  return {
    id,
    uuid: `Item.${id}`,
    name,
    system: { quantity: 1 },
    flags: {},
    toObject: () => ({ id, name, type: 'loot', system: { quantity: 1 } }),
    async delete() {},
    async update() {},
  };
}

/** A minimal actor with a Fabricate flag store, so run records really round-trip. */
function stubActor(items) {
  const flags = {};
  return {
    id: 'actor-1',
    uuid: 'Actor.actor-1',
    name: 'Akra',
    system: {},
    items: {
      contents: items,
      find: (fn) => items.find(fn),
      [Symbol.iterator]: () => items[Symbol.iterator](),
    },
    flags: {},
    getFlag: (ns, key) => flags[ns]?.[key] ?? null,
    async setFlag(ns, key, value) {
      flags[ns] ||= {};
      flags[ns][key] = value;
    },
    createEmbeddedDocuments: async (_type, entries) =>
      entries.map((entry, index) => stubItem(`made-${index}`, entry.name || 'Made')),
  };
}

/**
 * Drive a two-stage progressive salvage whose budget covers the first stage only, with
 * whatever complications the caller hung on the two result components.
 *
 * `isGM: true` is not incidental. `visibility` is redacted on the AUDIENCE and never on the
 * acting user's role, so a GM salvaging on a player's behalf must write and post exactly
 * what a player would. Running every case below as a GM is what proves that: a role-keyed
 * filter would pass a player-run test and fail here.
 */
async function runProgressiveSalvage({ awardedComplications, missedComplications }) {
  resetChat();
  const items = [stubItem('src-item', 'Iron Ore')];
  const actor = stubActor(items);
  const salvageRunManager = new SalvageRunManager();
  const component = {
    id: 'comp-1',
    name: 'Iron Ore',
    salvage: {
      enabled: true,
      ingredientQuantity: 1,
      resultGroups: [
        {
          id: 'rg-1',
          name: 'Scraps',
          results: [
            { id: 'r-1', componentId: 'ingot', quantity: 1 },
            { id: 'r-2', componentId: 'slag', quantity: 1 },
          ],
        },
      ],
    },
  };
  const system = {
    id: 'sys-1',
    features: { salvage: true, chatOutput: true },
    salvageResolutionMode: 'progressive',
    salvageCraftingCheck: {
      enabled: true,
      macroUuid: null,
      outcomes: [],
      progressive: { awardMode: 'equal' },
      consumption: { consumeComponentOnFail: true, breakToolsOnFail: false },
    },
    components: [
      component,
      { id: 'ingot', name: 'Iron Ingot', difficulty: 2, complications: awardedComplications },
      { id: 'slag', name: 'Slag', difficulty: 5, complications: missedComplications },
    ],
    tools: [],
    craftingCheck: {},
  };

  globalThis.foundry = { utils: { randomID: () => `rid-${Math.floor(Date.now() % 1e6)}` } };
  globalThis.fromUuid = async (uuid) => (uuid === actor.uuid ? actor : null);
  globalThis.game = {
    i18n: { localize: (key) => key },
    // A GM is the acting user. See the docblock above.
    user: { id: 'user-1', isGM: true },
    time: { worldTime: 0 },
    fabricate: {
      getCraftingSystemManager: () => ({ getSystem: () => system }),
      getResolutionModeService: () => null,
      getSalvageRunManager: () => salvageRunManager,
    },
  };

  const engine = new CraftingEngine(
    {
      canCraft: () => ({
        canCraft: true,
        satisfiableSet: null,
        missing: { ingredients: [], essences: [], tools: [] },
      }),
      getToolsForSet: () => [],
      toolMatchesItem: () => false,
      ingredientMatchesItem: () => false,
    },
    null,
    { validateSalvage: () => ({ valid: true, errors: [] }) },
    null,
    salvageRunManager
  );
  // Budget 3 covers the difficulty-2 stage and stops at the difficulty-5 one.
  engine._runSalvageCraftingCheck = async () => ({
    success: true,
    outcome: null,
    value: 3,
    data: {},
  });

  const result = await engine.salvage(actor.uuid, system.id, component.id);
  return { result, actor, salvageRunManager, content: chatCreated[0]?.content ?? '' };
}

test('salvage(): a gmOnly complication reaches neither the card, the run record nor the return', async () => {
  const { result, actor, salvageRunManager, content } = await runProgressiveSalvage({
    awardedComplications: TOLD,
    missedComplications: WITHHELD,
  });

  assert.equal(result.success, true, 'the award is unaffected by any of this');

  // The card.
  assert.ok(content.includes('Shrapnel Burst'), 'the visible complication is on the card');
  assert.ok(!content.includes('Curse Of The Deep'), 'the gmOnly one is not');

  // The return read by the player view-model.
  assert.deepEqual(
    result.complications.map((entry) => [entry.complicationId, entry.name, entry.resultId]),
    [['cx-shrapnel-burst', 'Shrapnel Burst', 'r-1']],
    'exactly the visible firing, naming the occurrence that produced it'
  );
  assert.ok(
    result.complications.every((entry) => !('macroUuid' in entry) && !('when' in entry)),
    'and it carries neither the trigger nor the macro'
  );

  // The run record, read back out of the persisted history rather than off the return, so
  // this asserts what a reloading client would see rather than what the write intended.
  const [record] = salvageRunManager.getRunHistory(actor);
  assert.deepEqual(
    record.firedComplications,
    [
      {
        resultId: 'r-1',
        componentId: 'ingot',
        complicationId: 'cx-shrapnel-burst',
        buckets: ['full'],
      },
    ],
    'narrowed to the four durable keys, and only the visible firing'
  );
});

test('salvage(): a gmOnly-only component writes no complications anywhere', async () => {
  const { result, actor, salvageRunManager, content } = await runProgressiveSalvage({
    awardedComplications: WITHHELD,
    missedComplications: WITHHELD,
  });

  assert.equal(result.success, true);
  assert.ok(!content.includes('Curse Of The Deep'), 'nothing on the card');
  assert.ok(!content.includes('__section--complications'), 'not even an empty block');
  assert.ok(!('complications' in result), 'nothing on the return');
  const [record] = salvageRunManager.getRunHistory(actor);
  assert.ok(
    !('firedComplications' in record),
    'and no key on the run record: an empty list is not a written one'
  );
});

test('salvage(): a system authoring no complications writes an unchanged run record', async () => {
  const { result, actor, salvageRunManager, content } = await runProgressiveSalvage({
    awardedComplications: undefined,
    missedComplications: undefined,
  });

  assert.equal(result.success, true);
  assert.ok(!content.includes('__section--complications'), 'the card gains no section');
  assert.ok(!('complications' in result), 'the return gains no key');
  const [record] = salvageRunManager.getRunHistory(actor);
  assert.ok(!('firedComplications' in record), 'the record gains no key');
});
