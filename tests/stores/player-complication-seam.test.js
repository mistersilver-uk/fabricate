/**
 * Issue 1286 — the PLAYER complication seam, end to end through the two player stores.
 *
 * The builders decide what a player may be told and attach it to the stage rows they
 * already publish; the stores carry that projection across the player's reorder, mark the
 * fired tense onto it from the salvage run record, and flatten it for the bulk queue. No
 * panel re-derives any of it, so this suite is where the seam's contract is pinned.
 *
 * ## Why the redaction cases run the REAL builders behind a GM viewer
 *
 * A store test that hand-builds stage rows can only prove the store adds nothing. The claim
 * worth proving is stronger and lives one module up: the audience filter is keyed on the
 * COMPLICATION'S `visibility` and never on the acting user's role. Driving `buildListing` /
 * `buildRecipeDetail` with `viewer: { isGM: true }` is what makes that testable — a GM is
 * the most permissive viewer the builders have, so a filter keyed on the role would open
 * here and nowhere else. It is not a hypothetical mistake: `publicComplications` carries the
 * same warning, because a GM salvaging on a player's behalf writes the record the player
 * then reads.
 */
import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { flushSync } from '../../node_modules/svelte/src/index-client.js';

import { createSvelteModuleCompiler } from '../helpers/compile-svelte-module.js';
import { authoredComplication } from '../helpers/complicationFixtures.js';
import { InventoryListingBuilder } from '../../src/systems/InventoryListingBuilder.js';
import { CraftingListingBuilder } from '../../src/systems/CraftingListingBuilder.js';
import { ResolutionModeService } from '../../src/systems/ResolutionModeService.js';

const GM = { isGM: true };
const ORDER_KEY = 'salvage:sys:ingot';
const repoRoot = resolve(import.meta.dirname, '../..');

let compiler;
let createInventoryStore;
let createCraftingStore;

const SHRAPNEL = authoredComplication();
const CURSE = authoredComplication({ id: 'gm1', name: 'Curse', visibility: 'gmOnly' });
const CAVE_IN = authoredComplication({
  id: 'x2',
  name: 'Cave-in',
  description: 'The seam gives.',
});

/**
 * One salvaged component whose progressive stage list names its yields FOUR times over
 * three distinct components, because every property under test needs a list with structure:
 *
 *   r1 -> Shard   (DC 5,  Shrapnel [visible] + Curse [gmOnly])
 *   r2 -> Filings (DC 3,  no complications)
 *   r3 -> Shard   (DC 5,  the SECOND occurrence of the same yield)
 *   r4 -> Dust    (no DC, so unreachable at any budget; carries Cave-in [visible])
 *
 * That gives a duplicated component (the forecast lands on both occurrences, a firing on
 * one), a complication-free stage and an unreachable stage — the last two being the two
 * distinct reasons a position number is skipped.
 */
function salvageSystem({
  shardComplications = [SHRAPNEL, CURSE],
  dustComplications = [CAVE_IN],
} = {}) {
  return {
    id: 'sys',
    name: 'Smithing',
    features: { salvage: true },
    salvageResolutionMode: 'progressive',
    salvageCraftingCheck: { progressive: { rollFormula: '1d20', awardMode: 'equal' } },
    components: [
      {
        id: 'ingot',
        name: 'Iron Ingot',
        img: 'icons/ingot.webp',
        salvage: {
          enabled: true,
          allowPlayerResultReorder: true,
          resultGroups: [
            {
              id: 'g1',
              results: [
                { id: 'r1', componentId: 'shard' },
                { id: 'r2', componentId: 'filings' },
                { id: 'r3', componentId: 'shard' },
                { id: 'r4', componentId: 'dust' },
              ],
            },
          ],
        },
      },
      {
        id: 'shard',
        name: 'Shard',
        img: 'icons/shard.webp',
        difficulty: 5,
        complications: shardComplications,
      },
      { id: 'filings', name: 'Filings', img: 'icons/filings.webp', difficulty: 3 },
      { id: 'dust', name: 'Dust', img: 'icons/dust.webp', complications: dustComplications },
    ],
  };
}

/** The owned-inventory listing the REAL builder produces for a GM viewer. */
function salvageListing(system) {
  const builder = new InventoryListingBuilder({
    recipeManager: { getRecipes: () => [], toolMatchesItem: () => false },
    craftingSystemManager: { getSystems: () => [system] },
    localize: (key) => key,
    nowWorldTime: () => 1000,
  });
  return builder.buildListing({
    craftingActor: {
      id: 'a1',
      name: 'Akra',
      img: 'icons/a1.webp',
      items: [{ name: 'Iron Ingot' }],
    },
    viewer: GM,
  });
}

/**
 * A loaded inventory store fed that real listing, with the salvaged row both INSPECTED and
 * QUEUED — so the single-item stage list and the bulk forecast are observable together and
 * cannot silently disagree about the same component's order.
 */
async function loadedSalvageStore({ system = salvageSystem(), orders = {} } = {}) {
  const listing = salvageListing(system);
  const row = listing.rows.find((entry) => entry.componentId === 'ingot');
  const services = {
    listInventoryForActor: async () => listing,
    getSelectedCraftingActorId: () => 'a1',
    getCraftingComponentSourceIds: () => [],
    getProgressiveResultOrder: () => orders,
    progressiveOrderRevertMessage: () => 'reverted',
    notify: () => {},
    setProgressiveResultOrder: async () => undefined,
    salvageComponent: async () => ({ success: true, results: [] }),
  };
  const store = createInventoryStore({ services });
  await store.load();
  flushSync();
  store.select(row.key);
  store.toggleBulkSelection(row.key);
  flushSync();
  return { store, services, stages: row.salvage.stages };
}

/** Every complication NAME the inspected stage list publishes, stage by stage. */
function stageComplicationNames(store) {
  return store.orderedSalvageStages.map((stage) =>
    (stage.complications ?? []).map((entry) => entry.name)
  );
}

/** `[stageId, complicationId, fired]` for every published complication, in stage order. */
function firedFlags(store) {
  return store.orderedSalvageStages.flatMap((stage) =>
    (stage.complications ?? []).map((entry) => [stage.id, entry.id, entry.fired])
  );
}

/**
 * Drive a salvage through the store against a run record.
 *
 * `firedComplications` is the run record's OWN narrowing — the four durable keys
 * `CraftingEngine.salvage` persists through `salvageRunComplicationRecords`, never the
 * seven-key chat projection — because that is what the store actually reads.
 */
async function salvageWith(store, services, firedComplications) {
  services.salvageComponent = async () => ({
    success: true,
    results: [],
    value: 12,
    salvageRun: {
      createdResults: [{ componentId: 'shard' }],
      checkResult: { data: { outcomeId: 'success' } },
      ...(firedComplications === null ? {} : { firedComplications }),
    },
  });
  await store.salvage('sys', 'ingot');
  flushSync();
}

/** One fired record in the run record's persisted shape. */
function firedRecord(resultId, complicationId, buckets = ['stageMissed']) {
  return { resultId, componentId: 'shard', complicationId, buckets };
}

/**
 * A loaded crafting store holding the REAL detail model for a GM viewer.
 *
 * Deliberately minimal beside the salvage fixture: the crafting half of this seam is
 * forecast-only, so all it has to show is that the projection reaches the store intact and
 * that nothing ever marks it fired.
 */
async function loadedCraftingStore(complications) {
  const system = {
    id: 'sys',
    name: 'Smithing',
    resolutionMode: 'progressive',
    craftingCheck: { simple: {}, routed: {}, progressive: { rollFormula: '2d6' } },
    components: [
      { id: 'blade', name: 'Blade', img: 'icons/blade.webp', difficulty: 3, complications },
      { id: 'hilt', name: 'Hilt', img: 'icons/hilt.webp', difficulty: 2 },
    ],
  };
  const resultGroups = [
    {
      id: 'g1',
      name: 'Stages',
      checkOutcomeIds: [],
      results: [
        { id: 'r1', componentId: 'blade' },
        { id: 'r2', componentId: 'hilt' },
      ],
    },
  ];
  const ingredientSets = [{ id: 'set-1', name: 'Set One' }];
  const recipe = {
    id: 'recipe-1',
    name: 'Sword',
    img: 'icons/sword.webp',
    craftingSystemId: 'sys',
    ingredientSets,
    resultGroups,
    getExecutionSteps: () => [{ id: 'step-1', name: 'Step 1', ingredientSets, resultGroups }],
  };
  const entries = [{ recipe, access: { reason: 'ok' } }];
  const craftingSystemManager = {
    getSystem: (id) => (id === system.id ? system : null),
    getRecipeItemDefinition: () => null,
  };
  const builder = new CraftingListingBuilder({
    recipeManager: {
      evaluateCraftability: () => ({ canCraft: true, satisfiableSet: { id: 'set-1' } }),
      getRecipe: (id) => (id === recipe.id ? recipe : null),
    },
    recipeVisibility: {
      getVisibleRecipes: () => entries,
      evaluateRecipeAccess: () => ({ reason: 'ok' }),
      isKnowledgeItemExhausted: () => false,
    },
    resolutionModeService: new ResolutionModeService(craftingSystemManager),
    craftingSystemManager,
    localize: (key) => key,
    nowWorldTime: () => 1000,
  });
  const craftingActor = { id: 'a1', items: [] };
  const store = createCraftingStore({
    services: {
      listCraftingForActor: async () => builder.buildListing({ craftingActor, viewer: GM }),
      hydrateCraftingRecipe: ({ recipeId }) =>
        builder.buildRecipeDetail({ recipeId, craftingActor, viewer: GM }),
      getSelectedCraftingActorId: () => 'a1',
      getCraftingComponentSourceIds: () => [],
      getFavouriteRecipeIds: () => [],
      getProgressiveResultOrder: () => ({}),
      notify: () => {},
    },
  });
  await store.load();
  flushSync();
  store.select('recipe-1');
  flushSync();
  return store;
}

describe('the player complication seam', () => {
  before(async () => {
    compiler = createSvelteModuleCompiler('fabricate-complication-seam-');
    // `loadWithClosure`, not `load` + a copy list: this suite loads BOTH player stores, so
    // a hand-maintained list would have to track two import graphs, and an omission in
    // either is reported as `cancelled` with `fail 0` rather than as a failure. The walker
    // copies what the modules actually import.
    ({ createInventoryStore } = await compiler.loadWithClosure(
      'src/ui/svelte/stores/inventoryStore.svelte.js'
    ));
    ({ createCraftingStore } = await compiler.loadWithClosure(
      'src/ui/svelte/stores/craftingStore.svelte.js'
    ));
  });

  after(() => compiler.cleanup());

  describe('the audience filter', () => {
    it('withholds a gmOnly complication from the salvage store even for a GM viewer', async () => {
      const { store } = await loadedSalvageStore();

      assert.deepEqual(
        stageComplicationNames(store),
        [['Shrapnel'], [], ['Shrapnel'], ['Cave-in']],
        'Curse is authored on the same component as Shrapnel, and is gmOnly'
      );
      assert.ok(
        !JSON.stringify(store.orderedSalvageStages).includes('Curse'),
        'nothing on the published rows names the gmOnly complication'
      );
      assert.deepEqual(
        store.bulkSalvageable[0].complications.map((entry) => entry.name),
        ['Shrapnel', 'Shrapnel'],
        'and the bulk forecast reads that same redacted projection'
      );
    });

    it("publishes none of a complication's GM-only fields", async () => {
      const { store } = await loadedSalvageStore();
      const published = JSON.stringify([
        store.orderedSalvageStages,
        store.bulkSalvageable[0].complications,
      ]);

      // `authoredComplication` populates all of these, so this is asserted against records
      // that genuinely have something to withhold.
      for (const secret of ['rollCondition', 'effectRoll', 'macroUuid', 'Macro.secret']) {
        assert.ok(!published.includes(secret), `${secret} must never reach a player surface`);
      }
      assert.ok(!published.includes('stageMissed'), 'nor the trigger clause itself');
    });

    it('withholds a gmOnly complication from the crafting store even for a GM viewer', async () => {
      const store = await loadedCraftingStore([SHRAPNEL, CURSE]);

      assert.deepEqual(
        store.orderedProgressiveStages.map((stage) =>
          (stage.complications ?? []).map((entry) => entry.name)
        ),
        [['Shrapnel'], []],
        'the crafting read-model redacts on the same rule the salvage one does'
      );
    });

    it('never marks a crafting stage fired: crafting is forecast-only', async () => {
      const store = await loadedCraftingStore([SHRAPNEL]);

      assert.deepEqual(
        store.orderedProgressiveStages.flatMap((stage) =>
          (stage.complications ?? []).map((entry) => entry.fired)
        ),
        [false],
        'the fired record lives on the salvage run; the immediate crafting path writes none'
      );
    });
  });

  describe('the fired tense', () => {
    it("marks the occurrence the record names and none of that component's others", async () => {
      const { store, services } = await loadedSalvageStore();

      await salvageWith(store, services, [firedRecord('r3', 'x1')]);

      assert.deepEqual(firedFlags(store), [
        ['r1', 'x1', false],
        ['r3', 'x1', true],
        ['r4', 'x2', false],
      ]);
    });

    it('marks BOTH occurrences when the resolution fired on both', async () => {
      const { store, services } = await loadedSalvageStore();

      // Shard is staged twice (r1 and r3) and a complication fires per RESULT ENTRY, so a
      // resolution in which both entries went wrong writes two records and badges two strips.
      await salvageWith(store, services, [firedRecord('r1', 'x1'), firedRecord('r3', 'x1')]);

      assert.deepEqual(firedFlags(store), [
        ['r1', 'x1', true],
        ['r3', 'x1', true],
        ['r4', 'x2', false],
      ]);
    });

    it('publishes the run record verbatim on the salvage result', async () => {
      const { store, services } = await loadedSalvageStore();
      const record = [firedRecord('r3', 'x1')];

      await salvageWith(store, services, record);

      // Verbatim: the redaction already happened at the WRITE, inside `CraftingEngine`,
      // because the container is an actor flag the owning player can read. Re-narrowing or
      // re-filtering it here would be a second copy of a rule that must live in one place.
      assert.deepEqual(store.salvageResult.firedComplications, record);
    });

    it('reads [] and never null under the runless invariant', async () => {
      const { store, services } = await loadedSalvageStore();

      services.salvageComponent = async () => ({ success: true, results: [], value: 9 });
      await store.salvage('sys', 'ingot');
      flushSync();

      assert.deepEqual(
        store.salvageResult.firedComplications,
        [],
        'no run record makes the same claim as a run that fired nothing, and needs no second flag'
      );
      assert.deepEqual(
        firedFlags(store).map(([, , fired]) => fired),
        [false, false, false],
        'so no strip claims fired'
      );
    });

    it('cannot surface a gmOnly complication even from an unredacted record', async () => {
      const { store, services } = await loadedSalvageStore();

      // A record naming the gmOnly complication — the leak this seam exists to prevent. It
      // matches no forecast entry, so it is dropped rather than rendered.
      await salvageWith(store, services, [firedRecord('r1', 'gm1')]);

      assert.deepEqual(stageComplicationNames(store), [
        ['Shrapnel'],
        [],
        ['Shrapnel'],
        ['Cave-in'],
      ]);
      assert.deepEqual(
        firedFlags(store).map(([, , fired]) => fired),
        [false, false, false],
        'marking only ever marks what the forecast already published'
      );
    });

    it('marks the reordered occurrence, because the mark lands after the reorder', async () => {
      const { store, services } = await loadedSalvageStore({
        orders: { [ORDER_KEY]: ['r3', 'r1'] },
      });

      assert.deepEqual(
        store.orderedSalvageStages.map((stage) => stage.id),
        ['r3', 'r1', 'r2', 'r4'],
        'the player put the second occurrence first'
      );

      await salvageWith(store, services, [firedRecord('r1', 'x1', ['full'])]);

      assert.deepEqual(firedFlags(store), [
        ['r3', 'x1', false],
        ['r1', 'x1', true],
        ['r4', 'x2', false],
      ]);
    });

    it('returns every strip to un-fired when the result is dismissed', async () => {
      const { store, services } = await loadedSalvageStore();

      await salvageWith(store, services, [firedRecord('r3', 'x1')]);
      assert.equal(firedFlags(store)[1][2], true);

      // The marks are held by the RESULT, not baked into the rows, so dropping the ribbon
      // returns the panel to its pre-roll tense in one move. The same read is scoped to the
      // acting `(systemId, componentId)`, which is what stops a result that outlives its
      // selection — `heldItem` deliberately pins the salvaged row — badging another
      // component's stages.
      store.resetSalvage();
      flushSync();

      assert.deepEqual(
        firedFlags(store).map(([, , fired]) => fired),
        [false, false, false]
      );
    });
  });

  describe('the bulk forecast', () => {
    it('numbers each row by its position among ALL stages, gaps included', async () => {
      const { store } = await loadedSalvageStore({ orders: { [ORDER_KEY]: ['r2', 'r3'] } });

      // Ordered: r2 (no complications), r3 (Shrapnel), r1 (Shrapnel), r4 (unreachable).
      // Position 1 is skipped because that stage authors nothing and position 4 because no
      // budget can reach it — both gaps are what make the number readable against the
      // ordered stage list on the single-item panel.
      assert.deepEqual(
        store.bulkSalvageable[0].complications.map((entry) => [entry.position, entry.resultId]),
        [
          [2, 'r3'],
          [3, 'r1'],
        ]
      );
    });

    it("carries the stage's own name and progressive DC", async () => {
      const { store } = await loadedSalvageStore();

      assert.deepEqual(store.bulkSalvageable[0].complications[0], {
        resultId: 'r1',
        position: 1,
        resultName: 'Shard',
        resultDifficulty: 5,
        id: 'x1',
        name: 'Shrapnel',
        description: 'Splinters fly.',
        severity: 'major',
      });
    });

    it("excludes a stage unreachable at any budget, on the yield preview's own rule", async () => {
      const { store } = await loadedSalvageStore();
      const entry = store.bulkSalvageable[0];

      assert.ok(
        !entry.complications.some((complication) => complication.resultId === 'r4'),
        'Dust has no authored difficulty, so no roll reaches it and nothing it carries fires'
      );
      assert.ok(
        !entry.yieldRows.some((yieldRow) => yieldRow.componentId === 'dust'),
        'and the yield preview omits that same stage, which is the rule being matched'
      );
    });

    it('orders the rows by position', async () => {
      const { store } = await loadedSalvageStore({
        orders: { [ORDER_KEY]: ['r4', 'r3', 'r2', 'r1'] },
      });

      // Ordered: r4 (unreachable, excluded), r3, r2, r1.
      const positions = store.bulkSalvageable[0].complications.map((entry) => entry.position);
      assert.deepEqual(positions, [2, 4]);
    });
  });

  describe('orderIsPlayers', () => {
    it('is FALSE when reorder is permitted and the player has not used it', async () => {
      const { store } = await loadedSalvageStore();
      const entry = store.bulkSalvageable[0];

      assert.equal(entry.allowsReorder, true, 'the permission is on');
      assert.equal(
        entry.orderIsPlayers,
        false,
        "a player who MAY reorder and has not is looking at the GM's order"
      );
    });

    it('is TRUE only once the stored order actually differs from the authored one', async () => {
      const { store } = await loadedSalvageStore({ orders: { [ORDER_KEY]: ['r2', 'r1'] } });

      assert.equal(store.bulkSalvageable[0].orderIsPlayers, true);
    });

    it('is FALSE for a stored order that reproduces the authored sequence', async () => {
      const { store } = await loadedSalvageStore({
        orders: { [ORDER_KEY]: ['r1', 'r2', 'r3', 'r4'] },
      });

      // A stored order EXISTS under the key — dragged away and back, or a GM re-authoring
      // the list into the order the player had already chosen. Presence is not difference.
      assert.equal(store.bulkSalvageable[0].orderIsPlayers, false);
    });

    it('is FALSE when the GM pinned the order, whatever is stored', async () => {
      const system = salvageSystem();
      system.components[0].salvage.allowPlayerResultReorder = false;
      const { store } = await loadedSalvageStore({
        system,
        orders: { [ORDER_KEY]: ['r3', 'r2', 'r1'] },
      });
      const entry = store.bulkSalvageable[0];

      assert.equal(entry.allowsReorder, false);
      assert.equal(entry.orderIsPlayers, false, "a pinned list is the GM's by construction");
      assert.deepEqual(
        entry.complications.map((complication) => complication.position),
        [1, 3],
        'and the forecast is numbered against the authored order it will actually run in'
      );
    });

    it("agrees with the inspected panel's own reset affordance", async () => {
      const { store } = await loadedSalvageStore();
      assert.equal(store.salvageOrderIsCustom, false);
      assert.equal(store.bulkSalvageable[0].orderIsPlayers, false);

      store.reorderSalvageStage(0, 1, '');
      flushSync();
      assert.equal(store.salvageOrderIsCustom, true);
      assert.equal(
        store.bulkSalvageable[0].orderIsPlayers,
        true,
        'one derivation, asked on two screens'
      );

      store.reorderSalvageStage(1, 0, '');
      flushSync();
      assert.equal(store.salvageOrderIsCustom, false);
      assert.equal(store.bulkSalvageable[0].orderIsPlayers, false);
    });
  });

  describe('a component authoring no complications', () => {
    const bare = () => salvageSystem({ shardComplications: [], dustComplications: [] });

    // DEEP equality, deliberately, and not `===`. The three modules in this chain each
    // return their input BY IDENTITY when they change nothing, and that contract is real
    // and is pinned directly on the pure modules in `progressive-stage-complications.test.js`.
    // It is simply not observable from OUT HERE: `listing` is `$state`, so Svelte hands
    // every reader a deep reactive proxy of the builder's objects rather than the objects.
    // An `assert.equal` here would therefore fail against a perfectly correct store, which
    // is why it is not the assertion — the claim this layer can honestly make is that the
    // published rows are byte-for-byte what the builder published.
    it('publishes the stage rows it published before this feature existed', async () => {
      const { store, stages } = await loadedSalvageStore({ system: bare() });

      assert.deepEqual(store.orderedSalvageStages, stages);
      assert.deepEqual(
        store.orderedSalvageStages.map((stage) => Object.keys(stage)),
        Array.from({ length: 4 }, () => [
          'id',
          'componentId',
          'name',
          'img',
          'difficulty',
          'threshold',
        ]),
        'no stage carries a complications key at all'
      );
      assert.deepEqual(store.bulkSalvageable[0].complications, []);
    });

    it('survives a resolution with nothing to mark', async () => {
      const { store, services, stages } = await loadedSalvageStore({ system: bare() });

      await salvageWith(store, services, []);

      assert.deepEqual(store.orderedSalvageStages, stages, 'unchanged by the resolution');
      assert.ok(
        store.orderedSalvageStages.every((stage) => !('complications' in stage)),
        'and a resolution that marked nothing did not invent the key either'
      );
      assert.deepEqual(store.salvageResult.firedComplications, []);
    });
  });

  describe("the bulk forecast's stored-order seam", () => {
    it('is wired in main.js, under the same edge the engine reads', () => {
      // `main.js` cannot be imported under `node --test` (it reaches Foundry globals at
      // module scope), so the composition is pinned against its source, as the complication
      // socket suite pins its own apply body. Left unwired, `BulkSalvageService` falls back
      // to `() => null` and its forecast silently reads the AUTHORED order while the run
      // reads the player's.
      const source = readFileSync(resolve(repoRoot, 'src/main.js'), 'utf8');
      const start = source.indexOf('_getBulkSalvageService() {');
      assert.ok(start !== -1, 'src/main.js should declare _getBulkSalvageService');
      const body = source.slice(start, source.indexOf('\n  }', start));

      assert.ok(
        /getPlayerResultOrder:\s*entry\s*=>\s*this\._readPlayerResultOrder\(entry\)/.test(body),
        'BulkSalvageService must be given the same result-order edge CraftingEngine has'
      );
    });
  });
});
