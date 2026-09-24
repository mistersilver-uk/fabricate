/**
 * The owner gate on `Fabricate#salvageComponents` / `#destroyComponents` (issue 859), driven
 * through the real facade class.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { BulkDestroyService } from '../src/systems/BulkDestroyService.js';
import { BulkSalvageService } from '../src/systems/BulkSalvageService.js';
import { readIdentityCounters, resetIdentityCounters } from '../src/utils/definitionIndex.js';
import {
  bulkComponent,
  bulkSystem,
  ownedItem,
  recordingSalvage,
} from './helpers/bulkSalvageFixtures.js';
import {
  createFabricateFacadeHarness,
  makeDeletableFacadeActor,
  makeFacadeActor,
} from './helpers/fabricateFacadeHarness.js';

// Behaviour, through the REAL facade (issue 1933).

const ORE = bulkComponent({ id: 'comp-ore', name: 'Iron Ore', img: 'icons/ore.webp' });
const SYSTEM = bulkSystem({ id: 'sys-a', components: [ORE] });

/** Stand up the facade over two actors, with a real `BulkSalvageService` behind it. */
function salvageHarness({ user, actors, selectedCraftingActorId = null }) {
  const { seam, calls } = recordingSalvage({ success: true, results: [] });
  const bulkSalvageService = new BulkSalvageService({
    salvage: seam,
    getCraftingSystem: (systemId) => (systemId === SYSTEM.id ? SYSTEM : null),
  });
  const harness = createFabricateFacadeHarness({
    user,
    actors,
    systems: [{ system: SYSTEM, recipes: [] }],
    selectedCraftingActorId,
    bulkSalvageService,
  });
  return { ...harness, salvageCalls: calls };
}

const target = (actorId) => ({ actorId, systemId: 'sys-a', componentId: 'comp-ore' });

describe('salvageComponents: an unresolvable actor is refused, never retargeted', () => {
  it("reports notPermitted for another player's actor and never calls the engine", async () => {
    const mine = makeFacadeActor('a-mine', { ownerUserIds: ['u1'] });
    const theirs = makeFacadeActor('a-theirs', { ownerUserIds: ['u2'] });
    const { facade, salvageCalls } = salvageHarness({
      user: { id: 'u1', isGM: false },
      actors: [mine, theirs],
    });

    const result = await facade.salvageComponents({
      targets: [target('a-mine'), target('a-theirs')],
      interactive: false,
    });

    assert.deepEqual(
      salvageCalls.map((call) => call.actorUuid),
      ['Actor.a-mine'],
      'the refused row never reached the engine'
    );
    assert.deepEqual(
      result.items.map((item) => item.outcome),
      ['succeeded', 'notPermitted']
    );
    assert.equal(result.counts.notPermitted, 1);
    assert.equal(result.counts.total, 2, 'the refusal is still counted as a row');
  });

  it('does NOT fall back to the persisted crafting actor for an unresolvable row', async () => {
    // The behavioural face of the source pin above.
    const owned = makeFacadeActor('a-owned', { ownerUserIds: ['u1'] });
    const foreign = makeFacadeActor('a-foreign', { ownerUserIds: ['u2'] });
    const { facade, salvageCalls } = salvageHarness({
      user: { id: 'u1', isGM: false },
      actors: [owned, foreign],
      selectedCraftingActorId: 'a-owned',
    });

    const result = await facade.salvageComponents({
      targets: [target('a-foreign')],
      interactive: false,
    });

    assert.deepEqual(salvageCalls, [], 'nothing was salvaged, from anyone');
    assert.equal(result.items[0].outcome, 'notPermitted');
    assert.equal(
      result.items[0].actorId,
      'a-foreign',
      'and the row still names what was asked for'
    );
  });

  it('refuses a row naming no actor at all when the run names none either', async () => {
    const owned = makeFacadeActor('a-owned', { ownerUserIds: ['u1'] });
    const { facade, salvageCalls } = salvageHarness({
      user: { id: 'u1', isGM: false },
      actors: [owned],
      selectedCraftingActorId: 'a-owned',
    });

    const result = await facade.salvageComponents({
      targets: [{ systemId: 'sys-a', componentId: 'comp-ore' }],
      interactive: false,
    });

    assert.deepEqual(salvageCalls, []);
    assert.equal(result.items[0].outcome, 'notPermitted');
  });

  it('uses the RUN-LEVEL actorId for a row that names none of its own', async () => {
    const owned = makeFacadeActor('a-owned', { ownerUserIds: ['u1'] });
    const { facade, salvageCalls } = salvageHarness({
      user: { id: 'u1', isGM: false },
      actors: [owned],
    });

    await facade.salvageComponents({
      actorId: 'a-owned',
      targets: [{ systemId: 'sys-a', componentId: 'comp-ore' }],
      interactive: false,
    });

    assert.deepEqual(
      salvageCalls.map((call) => call.actorUuid),
      ['Actor.a-owned']
    );
  });

  it("prefers the row's own actorId over the run-level one", async () => {
    const first = makeFacadeActor('a-1', { ownerUserIds: ['u1'] });
    const second = makeFacadeActor('a-2', { ownerUserIds: ['u1'] });
    const { facade, salvageCalls } = salvageHarness({
      user: { id: 'u1', isGM: false },
      actors: [first, second],
    });

    await facade.salvageComponents({
      actorId: 'a-1',
      targets: [target('a-2')],
      interactive: false,
    });

    assert.deepEqual(
      salvageCalls.map((call) => call.actorUuid),
      ['Actor.a-2']
    );
  });

  it('lets a GM act on any world actor', async () => {
    const theirs = makeFacadeActor('a-theirs', { ownerUserIds: ['u2'] });
    const { facade, salvageCalls } = salvageHarness({
      user: { id: 'gm', isGM: true },
      actors: [theirs],
    });

    await facade.salvageComponents({ targets: [target('a-theirs')], interactive: false });

    assert.deepEqual(
      salvageCalls.map((call) => call.actorUuid),
      ['Actor.a-theirs']
    );
  });

  it('refuses an actor that is not in game.actors at all', async () => {
    // `_resolveCraftingActor` resolves through `game.actors.get` — WORLD actors only — so
    // a compendium-backed actor and an unlinked token actor can never be targets.
    const owned = makeFacadeActor('a-owned', { ownerUserIds: ['u1'] });
    const { facade, salvageCalls } = salvageHarness({
      user: { id: 'u1', isGM: false },
      actors: [owned],
    });

    const result = await facade.salvageComponents({
      targets: [target('a-not-in-the-world')],
      interactive: false,
    });

    assert.deepEqual(salvageCalls, []);
    assert.equal(result.items[0].outcome, 'notPermitted');
  });

  it('never throws for a refused row, and preserves the caller order', async () => {
    const owned = makeFacadeActor('a-owned', { ownerUserIds: ['u1'] });
    const foreign = makeFacadeActor('a-foreign', { ownerUserIds: ['u2'] });
    const { facade } = salvageHarness({
      user: { id: 'u1', isGM: false },
      actors: [owned, foreign],
    });

    const result = await facade.salvageComponents({
      targets: [target('a-foreign'), target('a-owned'), target('a-foreign')],
      interactive: false,
    });

    assert.deepEqual(
      result.items.map((item) => item.outcome),
      ['notPermitted', 'succeeded', 'notPermitted']
    );
    assert.equal(
      result.items[0].name,
      'Iron Ore',
      'a refused row still READS as what was selected'
    );
    assert.equal(result.items[0].img, 'icons/ore.webp');
  });

  it('threads a progress listener through to the service, over the GATED queue', async () => {
    // The behavioural face of the forwarding pin above, through the real service.
    const mine = makeFacadeActor('a-mine', { ownerUserIds: ['u1'] });
    const theirs = makeFacadeActor('a-theirs', { ownerUserIds: ['u2'] });
    const { facade } = salvageHarness({
      user: { id: 'u1', isGM: false },
      actors: [mine, theirs],
    });
    const ticks = [];

    await facade.salvageComponents({
      targets: [target('a-mine'), target('a-theirs')],
      interactive: false,
      onProgress: (completed, total) => ticks.push([completed, total]),
    });

    assert.deepEqual(ticks, [[1, 1]], 'one tick for the one row that was permitted to run');
  });

  it('passes the service shape straight through when the prompt was dismissed', async () => {
    // Nothing ran, so there is no per-row story to tell — reporting refusals for a run
    // the player cancelled would invent one.
    const owned = makeFacadeActor('a-owned', { ownerUserIds: ['u1'] });
    const foreign = makeFacadeActor('a-foreign', { ownerUserIds: ['u2'] });
    const bulkSalvageService = {
      run: async () => ({ cancelled: true, items: [], counts: {}, posted: false }),
    };
    const { facade } = createFabricateFacadeHarness({
      user: { id: 'u1', isGM: false },
      actors: [owned, foreign],
      systems: [{ system: SYSTEM, recipes: [] }],
      bulkSalvageService,
    });

    const result = await facade.salvageComponents({
      targets: [target('a-owned'), target('a-foreign')],
    });

    assert.equal(result.cancelled, true);
    assert.deepEqual(result.items, []);
  });
});

describe('destroyComponents: the same gate, the same refusal', () => {
  /** Stand up the facade over a real `BulkDestroyService`. */
  function destroyHarness({ user, actors, documentsByActor }) {
    const bulkDestroyService = new BulkDestroyService({
      getCraftingSystem: (systemId) => (systemId === SYSTEM.id ? SYSTEM : null),
      findComponentItems: (actor) => documentsByActor[actor.id] ?? [],
      deleteItems: (actor, itemIds) => actor.deleteEmbeddedDocuments('Item', itemIds),
    });
    return createFabricateFacadeHarness({
      user,
      actors,
      systems: [{ system: SYSTEM, recipes: [] }],
      bulkDestroyService,
    });
  }

  it('never deletes from an actor the user does not own', async () => {
    const mineDocs = [ownedItem('i-mine', 'Iron Ore', 4)];
    const theirDocs = [ownedItem('i-theirs', 'Iron Ore', 9)];
    const mine = makeDeletableFacadeActor('a-mine', {
      ownerUserIds: ['u1'],
      documents: mineDocs,
    });
    const theirs = makeDeletableFacadeActor('a-theirs', {
      ownerUserIds: ['u2'],
      documents: theirDocs,
    });
    const { facade } = destroyHarness({
      user: { id: 'u1', isGM: false },
      actors: [mine, theirs],
      documentsByActor: { 'a-mine': mineDocs, 'a-theirs': theirDocs },
    });

    const result = await facade.destroyComponents({
      targets: [target('a-mine'), target('a-theirs')],
    });

    assert.deepEqual(mine.deletedIds, [{ type: 'Item', itemIds: ['i-mine'] }]);
    assert.deepEqual(theirs.deletedIds, [], 'nothing was submitted against the foreign actor');
    assert.deepEqual(
      result.items.map((item) => item.outcome),
      ['succeeded', 'notPermitted']
    );
    assert.equal(result.unitsDeleted, 4, 'and the foreign stack is not counted');
    assert.equal(theirs.heldDocuments.size, 1, 'their Iron Ore is still in their pack');
  });

  it('gives a refused destroy row the zeroed destroy shape, not the salvage one', async () => {
    // The two facades report different row shapes, and the panel renders unit counts off
    // the destroy one — a refusal carrying the salvage shape would render `undefined`.
    const foreign = makeDeletableFacadeActor('a-foreign', { ownerUserIds: ['u2'] });
    const { facade } = destroyHarness({
      user: { id: 'u1', isGM: false },
      actors: [foreign],
      documentsByActor: {},
    });

    const result = await facade.destroyComponents({ targets: [target('a-foreign')] });

    assert.deepEqual(result.items[0], {
      actorId: 'a-foreign',
      actorName: '',
      systemId: 'sys-a',
      componentId: 'comp-ore',
      name: 'Iron Ore',
      img: 'icons/ore.webp',
      outcome: 'notPermitted',
      skipReason: null,
      requested: 0,
      unitsDeleted: 0,
      documentsDeleted: 0,
      staleIds: 0,
      items: [],
      vetoed: [],
    });
  });

  it('does NOT fall back to the persisted crafting actor either', async () => {
    const ownedDocs = [ownedItem('i-owned', 'Iron Ore', 7)];
    const owned = makeDeletableFacadeActor('a-owned', {
      ownerUserIds: ['u1'],
      documents: ownedDocs,
    });
    const foreign = makeDeletableFacadeActor('a-foreign', { ownerUserIds: ['u2'] });
    const bulkDestroyService = new BulkDestroyService({
      getCraftingSystem: () => SYSTEM,
      findComponentItems: (actor) => (actor.id === 'a-owned' ? ownedDocs : []),
      deleteItems: (actor, itemIds) => actor.deleteEmbeddedDocuments('Item', itemIds),
    });
    const { facade } = createFabricateFacadeHarness({
      user: { id: 'u1', isGM: false },
      actors: [owned, foreign],
      systems: [{ system: SYSTEM, recipes: [] }],
      selectedCraftingActorId: 'a-owned',
      bulkDestroyService,
    });

    const result = await facade.destroyComponents({ targets: [target('a-foreign')] });

    assert.deepEqual(owned.deletedIds, [], "the persisted selection's items are untouched");
    assert.equal(result.items[0].outcome, 'notPermitted');
    assert.equal(result.unitsDeleted, 0);
  });

  it('threads a progress listener through to the destroy service too', async () => {
    const docs = [ownedItem('i-mine', 'Iron Ore', 4)];
    const mine = makeDeletableFacadeActor('a-mine', { ownerUserIds: ['u1'], documents: docs });
    const { facade } = destroyHarness({
      user: { id: 'u1', isGM: false },
      actors: [mine],
      documentsByActor: { 'a-mine': docs },
    });
    const ticks = [];

    await facade.destroyComponents({
      targets: [target('a-mine')],
      onProgress: (completed, total) => ticks.push([completed, total]),
    });

    assert.deepEqual(ticks, [[1, 1]]);
  });

  it('refuses before ready, rather than deleting from an uninitialized module', async () => {
    const owned = makeDeletableFacadeActor('a-owned', { ownerUserIds: ['u1'] });
    const { facade } = createFabricateFacadeHarness({
      user: { id: 'u1', isGM: false },
      actors: [owned],
      systems: [{ system: SYSTEM, recipes: [] }],
      ready: false,
      bulkDestroyService: { run: async () => ({ items: [] }) },
    });

    await assert.rejects(
      () => facade.destroyComponents({ targets: [target('a-owned')] }),
      /not initialized/
    );
    assert.deepEqual(owned.deletedIds, []);
  });
});

describe('_postBulkSalvageChatMessage: speaker -> visibility -> create, observed on the real poster', () => {
  /** A V13-shaped `ChatMessage` recording each step with what `chatData` held at that moment. */
  function recordingChatMessage() {
    const steps = [];
    globalThis.ChatMessage = {
      getSpeaker: ({ actor }) => {
        steps.push(['getSpeaker', actor.id]);
        return { actor: actor.id, alias: actor.name };
      },
      applyRollMode: (chatData, mode) => {
        steps.push(['visibility', mode, 'speaker' in chatData]);
        chatData.blind = mode === 'blindroll';
      },
      create: async (...args) => {
        steps.push(['create', args.length, { ...args[0] }]);
        return { id: 'message' };
      },
    };
    return steps;
  }

  it('builds the speaker onto chatData before visibility, and creates with author alone', async () => {
    const actor = makeFacadeActor('a-mine', { ownerUserIds: ['u1'] });
    const { facade } = createFabricateFacadeHarness({ user: { id: 'u1', isGM: false }, actors: [actor] });
    const steps = recordingChatMessage();

    await facade._postBulkSalvageChatMessage({
      content: '<p>card</p>',
      rollMode: 'blindroll',
      actorUuid: actor.uuid,
    });

    assert.deepEqual(
      steps.map(([step]) => step),
      ['getSpeaker', 'visibility', 'create']
    );
    assert.equal(steps[1][2], true, 'the speaker is on chatData when visibility is applied');
    const [, argumentCount, created] = steps[2];
    assert.equal(argumentCount, 1, 'visibility travels on the data, never as a create option');
    assert.equal(created.author, 'u1');
    assert.equal('user' in created, false, 'the discarded V14 `user` key is never written');
    assert.equal(created.blind, true, 'the created data carries the applied visibility');
  });

  it('builds an alias speaker without inferring one when no actor resolves', async () => {
    const { facade } = createFabricateFacadeHarness({ user: { id: 'u1', isGM: false } });
    const steps = recordingChatMessage();

    await facade._postBulkSalvageChatMessage({
      content: '<p>card</p>',
      rollMode: 'gmroll',
      actorNames: ['Ari', 'Bo'],
    });

    assert.deepEqual(
      steps.map(([step]) => step),
      ['visibility', 'create'],
      'getSpeaker() with no actor falls through to the controlled tokens, so it is never asked'
    );
    assert.equal(steps[1][2].speaker.alias, 'Ari, Bo');
  });
});

// The indexed component lookup (issue 1202)

/** Methods whose component lookup runs once per row, with what multiplies it. */
const INDEXED_LOOKUPS = [
  [
    '_buildNotPermittedRow',
    'once per bulk row, before the service is entered',
    (facade) => facade._buildNotPermittedRow(target('a-any')),
  ],
  [
    '_resolveJournalComponent',
    "wired as RunJournalBuilder's getComponent, called per result / requirement / consumed " +
      'ingredient / salvage identity inside a .map() over journal rows',
    (facade) => facade._resolveJournalComponent('sys-a', 'comp-ore'),
  ],
];

describe('issue 1202 — the multiplied component lookups stay index-backed', () => {
  const WIDE_SYSTEM = bulkSystem({
    id: 'sys-a',
    components: [
      ...Array.from({ length: 40 }, (_, index) => bulkComponent({ id: `filler-${index}` })),
      ORE,
    ],
  });

  for (const [name, multiplier, lookup] of INDEXED_LOOKUPS) {
    it(`${name} examines ONE indexed candidate per lookup, never a scan`, () => {
      const { facade } = createFabricateFacadeHarness({
        user: { id: 'gm', isGM: true },
        systems: [{ system: WIDE_SYSTEM, recipes: [] }],
      });
      lookup(facade);
      resetIdentityCounters();

      const answers = [lookup(facade), lookup(facade), lookup(facade)];

      assert.deepEqual(
        answers.map((answer) => answer?.name),
        ['Iron Ore', 'Iron Ore', 'Iron Ore']
      );
      const { candidatesExamined, indexBuilds } = readIdentityCounters();
      assert.equal(
        candidatesExamined,
        3,
        `${name} runs ${multiplier}, so a scan here is an additive rows x components term`
      );
      assert.equal(indexBuilds, 0, 'and the index built by the first lookup is retained');
    });
  }
});
