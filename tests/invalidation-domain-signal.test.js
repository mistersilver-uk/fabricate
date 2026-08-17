/**
 * The scoped crafting-data change signal, END TO END (issue 1078 part B1, under #1070).
 *
 * ## Why every case starts at a real mutation
 *
 * This programme has shipped five guards that reported a property while observing nothing, and
 * the shape they all shared is that their entry point was DOWNSTREAM of publication: build a
 * payload, hand it to the routing function, count what it called. Such a guard passes with the
 * publish call deleted, because it never needed one.
 *
 * So every case below enters through something a GM or a replicating client actually does —
 * `updateRecipe`, a `save({put, domains})`, `handleFabricateSettingChange` — and exits through
 * the shipped `subscribeCraftingDataChange`, one subscription per store carrying the shipped
 * `STORE_DOMAINS[store]`. Deleting either half of a publisher takes a counter to zero.
 *
 * ## The fallback counter is asserted, not inferred
 *
 * "The journal did not reload" is true both when routing narrowed it out and when nothing was
 * emitted at all. Every narrowing case therefore also asserts the emission count and that the
 * broad-fallback counter did not move, so the narrowing is OBSERVED rather than inferred.
 */
import assert from 'node:assert/strict';
import { after, describe, it } from 'node:test';

import { SETTING_KEYS } from '../src/config/settings.js';

import { installCraftingDataBus } from './helpers/craftingDataChangeBus.js';
import {
  persistedRecipe,
  persistedSystem,
  Recipe,
  RecipeManager,
  remoteClient,
  REVISION_SCOPES,
  storedRecipes,
  SYS_A,
  SYS_B,
  twoSystemWorld,
  withRecipe,
  withSystem,
} from './helpers/scopedInvalidationWorld.js';

const { PerRecordCraftingDefinitionRepository } = await import(
  '../src/systems/PerRecordCraftingDefinitionRepository.js'
);

const { handleFabricateSettingChange, createRecipeRefreshCoalescer } = await import(
  '../src/config/settingChangeBridge.js'
);
const { CRAFTING_DATA_CHANGED_HOOK, craftingDataChange } = await import(
  '../src/systems/craftingDataChange.js'
);
const { INVALIDATION_DOMAINS } = await import('../src/systems/invalidationDomains.js');

const RECIPES_SETTING_KEY = `fabricate.${SETTING_KEYS.RECIPES}`;
const SYSTEMS_SETTING_KEY = `fabricate.${SETTING_KEYS.CRAFTING_SYSTEMS}`;

/** The scopes one emission carries, flattened for a readable assertion. */
const scopeSummary = (payload) =>
  payload.scopes.map((scope) => [scope.systemId, [...scope.domains]]);

/**
 * A world plus an attached bus, torn down after the case.
 *
 * @param {() => object} buildWorld
 * @returns {{world: object, bus: object}}
 */
function wiredWorld(buildWorld = twoSystemWorld) {
  const world = buildWorld();
  const bus = installCraftingDataBus();
  return { world, bus };
}

const openBuses = [];
after(() => {
  for (const bus of openBuses) bus.restore();
});

/** Register a bus for teardown and return it. */
function tracked(bus) {
  openBuses.push(bus);
  return bus;
}

describe('publisher 1 — a local recipe edit', () => {
  it('emits exactly ONE scoped signal per edit, from the real mutation', async () => {
    const { world, bus } = wiredWorld();
    tracked(bus);

    await world.recipeManager.updateRecipe('r-a1', { name: 'Renamed' }, { notify: false });

    assert.equal(
      bus.scopedEmissions().length,
      1,
      'one mutation, one scoped signal — delete the publish call in _notifyRecipesChanged and ' +
        'this is zero'
    );
    assert.equal(
      bus.emissionsOf('fabricate.recipesChanged').length,
      1,
      'and the published legacy hook still fires exactly once, unchanged'
    );
    assert.deepEqual(scopeSummary(bus.scopedEmissions()[0]), [[SYS_A, ['labelling']]]);
    assert.equal(bus.fallbackCount(), 0, 'nothing routed broadly');
  });

  it('routes a DESCRIPTION-ONLY edit away from the journal, from a warmed baseline', async () => {
    const { world, bus } = wiredWorld();
    tracked(bus);

    // WARM. A "must not reload" assertion against a cold fixture is `assert.equal(0, 0)` and
    // proves nothing, so the journal is made to reload first and the baseline is asserted.
    await world.recipeManager.updateRecipe('r-a1', { name: 'Warm' }, { notify: false });
    assert.ok(bus.reloads.journal > 0, 'the baseline: a labelling edit DOES reload the journal');
    const warmedJournal = bus.reloads.journal;
    bus.reset();

    await world.recipeManager.updateRecipe(
      'r-a1',
      { description: 'A longer story about this recipe.' },
      { notify: false }
    );

    assert.equal(bus.scopedEmissions().length, 1, 'the edit really did announce itself');
    assert.deepEqual(scopeSummary(bus.scopedEmissions()[0]), [[SYS_A, ['narrative']]]);
    assert.equal(
      bus.reloads.journal,
      0,
      `the journal reloaded ${warmedJournal} time(s) for a rename and must reload zero times ` +
        'for prose: RunJournalBuilder reads no description anywhere'
    );
    assert.deepEqual(bus.reloadedStores(), ['crafting', 'inventory', 'alchemy']);
    assert.equal(bus.fallbackCount(), 0, 'so the narrowing came from routing, not from a miss');
  });

  it('advances only the fact scopes the edited fields belong to', async () => {
    const { world, bus } = wiredWorld();
    tracked(bus);
    const before = {
      narrative: world.recipeManager.revision(REVISION_SCOPES.facts('narrative', SYS_A)),
      labelling: world.recipeManager.revision(REVISION_SCOPES.facts('labelling', SYS_A)),
      otherSystem: world.recipeManager.revision(REVISION_SCOPES.facts('narrative', SYS_B)),
    };

    await world.recipeManager.updateRecipe('r-a1', { description: 'Prose' }, { notify: false });

    assert.notEqual(
      world.recipeManager.revision(REVISION_SCOPES.facts('narrative', SYS_A)),
      before.narrative
    );
    assert.equal(
      world.recipeManager.revision(REVISION_SCOPES.facts('labelling', SYS_A)),
      before.labelling,
      'a consumer that reads only labels keeps its token across a prose edit'
    );
    assert.equal(
      world.recipeManager.revision(REVISION_SCOPES.facts('narrative', SYS_B)),
      before.otherSystem,
      'and system B is untouched'
    );
  });

  it('names BOTH systems when an edit moves a recipe between them', async () => {
    const { world, bus } = wiredWorld();
    tracked(bus);

    await world.recipeManager.updateRecipe(
      'r-a1',
      { craftingSystemId: SYS_B },
      { notify: false, allowIncomplete: true }
    );

    const [payload] = bus.scopedEmissions();
    assert.deepEqual(
      payload.scopes.map((scope) => scope.systemId).sort(),
      [SYS_A, SYS_B],
      'a consumer watching the system the recipe LEFT must also be told'
    );
  });
});

describe('publisher 2 — a local crafting-system mutation', () => {
  it('emits exactly ONE scoped signal, attributed from the fields the edit moved', async () => {
    const { world, bus } = wiredWorld();
    tracked(bus);

    await world.systemManager.updateSystem(SYS_A, { name: 'System A renamed' });

    assert.equal(
      bus.emissionsOf('fabricate.craftingSystemsChanged').length,
      1,
      'the premise: this mutation announces itself once'
    );
    assert.equal(bus.scopedEmissions().length, 1, 'and exactly one scoped signal rode with it');
    assert.deepEqual(scopeSummary(bus.scopedEmissions()[0]), [[SYS_A, ['labelling']]]);
    assert.deepEqual(bus.reloadedStores(), [
      'crafting',
      'inventory',
      'alchemy',
      'journal',
      'gathering',
    ]);
    assert.equal(bus.fallbackCount(), 0);
  });

  it('routes a system DESCRIPTION-ONLY edit away from the journal, from a warmed baseline', async () => {
    const { world, bus } = wiredWorld();
    tracked(bus);

    await world.systemManager.updateSystem(SYS_A, { name: 'Warm' });
    assert.ok(bus.reloads.journal > 0, 'the baseline: a rename DOES reload the journal');
    bus.reset();

    await world.systemManager.updateSystem(SYS_A, { description: 'How this system works.' });

    assert.equal(bus.scopedEmissions().length, 1);
    assert.deepEqual(scopeSummary(bus.scopedEmissions()[0]), [[SYS_A, ['narrative']]]);
    assert.deepEqual(bus.reloadedStores(), ['crafting', 'inventory', 'alchemy']);
    assert.equal(bus.fallbackCount(), 0);
  });

  it('keeps a save that deliberately does NOT announce silent, and carries its domains forward', async () => {
    // `save()` records and the NOTIFIER drains, which is what keeps the paths that save without
    // announcing (`options.notifySystems: false`, the singular component delete) as silent as
    // they were before this issue. A save that emitted directly would refresh the app on every
    // one of them.
    const { world, bus } = wiredWorld();
    tracked(bus);
    const system = world.systemManager.getSystem(SYS_A);

    await world.systemManager.save({ put: system, domains: [INVALIDATION_DOMAINS.LABELLING] });

    assert.equal(bus.scopedEmissions().length, 0, 'a save alone announces nothing');

    world.systemManager._notifySystemsChanged();

    assert.equal(bus.scopedEmissions().length, 1, 'and the next announcement carries it');
    assert.deepEqual(scopeSummary(bus.scopedEmissions()[0]), [[SYS_A, ['labelling']]]);
  });

  it('attributes a BATCH per record rather than unioning it across every system', async () => {
    const { world, bus } = wiredWorld();
    tracked(bus);
    const a = world.systemManager.getSystem(SYS_A);
    const b = world.systemManager.getSystem(SYS_B);

    await world.systemManager.save({
      batch: [a, b],
      domains: new Map([
        [SYS_A, [INVALIDATION_DOMAINS.COMPONENT_DEFINITIONS]],
        [SYS_B, [INVALIDATION_DOMAINS.LABELLING]],
      ]),
    });
    world.systemManager._notifySystemsChanged();

    assert.deepEqual(scopeSummary(bus.scopedEmissions()[0]), [
      [SYS_A, ['component-definitions']],
      [SYS_B, ['labelling']],
    ]);
  });

  it('treats a batch record the domains map does not name as EVERY domain', async () => {
    const { world, bus } = wiredWorld();
    tracked(bus);
    const a = world.systemManager.getSystem(SYS_A);
    const b = world.systemManager.getSystem(SYS_B);

    await world.systemManager.save({
      batch: [a, b],
      domains: { [SYS_A]: [INVALIDATION_DOMAINS.LABELLING] },
    });
    world.systemManager._notifySystemsChanged();

    const scopes = new Map(scopeSummary(bus.scopedEmissions()[0]));
    assert.deepEqual(scopes.get(SYS_A), ['labelling']);
    assert.equal(scopes.get(SYS_B).length, 7, 'silence means everything, never nothing');
  });
});

describe('publisher 3 — a replicated change on a remote-shaped client', () => {
  /**
   * Drive the bridge exactly as `main.js` drives it on a client that did not write.
   *
   * @param {object} world
   * @param {object} bus
   * @param {string} settingKey
   * @returns {boolean}
   */
  const replicate = (world, bus, settingKey) =>
    handleFabricateSettingChange(settingKey, {
      craftingSystemManager: world.systemManager,
      recipeManager: world.recipeManager,
      callAll: (name, payload) => bus.hooks.callAll(name, payload),
    });

  it('mints a scoped signal from the WHOLE-CORPUS reload delta', () => {
    const { world, bus } = wiredWorld();
    tracked(bus);
    world.write(
      null,
      withRecipe(world.env, 'r-a1', (recipe) => ({ ...recipe, description: 'Replicated prose' }))
    );

    assert.equal(replicate(world, bus, RECIPES_SETTING_KEY), true);

    assert.equal(bus.scopedEmissions().length, 1);
    assert.deepEqual(scopeSummary(bus.scopedEmissions()[0]), [[SYS_A, ['narrative']]]);
    assert.equal(
      bus.reloads.journal,
      0,
      'a player watching a GM edit prose narrows exactly as the GM does — before this, every ' +
        'replicated edit reloaded every store on every client'
    );
    assert.equal(bus.fallbackCount(), 0);
  });

  it('narrows a replicated SYSTEM edit to the fields the delta names', () => {
    const { world, bus } = wiredWorld();
    tracked(bus);
    world.write(
      withSystem(world.env, SYS_A, (system) => ({ ...system, name: 'Renamed remotely' })),
      null
    );

    assert.equal(replicate(world, bus, SYSTEMS_SETTING_KEY), true);

    assert.deepEqual(scopeSummary(bus.scopedEmissions()[0]), [[SYS_A, ['labelling']]]);
    assert.equal(bus.fallbackCount(), 0);
  });

  it('mints one on the PER-RECORD branch too, which never calls reload()', () => {
    // The branch #1211 turns on when it flips the Definition Storage Target off `singleArray`.
    // `applyReplicatedRecordChange` never touches `reload()`, so without a delta minted here
    // `consumeReloadDelta()` would answer `null` on every remote client and every replicated
    // edit would route through the broad fallback — this issue's player-side narrowing,
    // silently disabled by the very next issue in the programme.
    const documents = new Map();
    const repository = new PerRecordCraftingDefinitionRepository({
      keyPrefix: 'recipe.',
      hydrate: (raw) => Recipe.fromJSON(raw),
      serialize: (recipe) => recipe.toJSON(),
      scopeOf: (recipe) => recipe?.craftingSystemId ?? null,
      collection: () => documents.values(),
    });
    const held = persistedRecipe('r-a1', SYS_A, `${SYS_A}-c0`);
    documents.set('fabricate.recipe.r-a1', {
      key: 'fabricate.recipe.r-a1',
      value: JSON.stringify(held),
    });
    const recipeManager = new RecipeManager({ repository });
    recipeManager.reload();
    const bus = tracked(installCraftingDataBus());

    const replicatedDocument = {
      key: 'fabricate.recipe.r-a1',
      value: JSON.stringify({ ...held, description: 'Replicated per-record prose' }),
    };
    handleFabricateSettingChange('fabricate.recipe.r-a1', {
      recipeManager,
      operation: 'update',
      document: replicatedDocument,
      callAll: (name, payload) => bus.hooks.callAll(name, payload),
    });

    assert.equal(
      recipeManager.getRecipe('r-a1').description,
      'Replicated per-record prose',
      'the premise: the record really was applied'
    );
    assert.equal(bus.scopedEmissions().length, 1);
    assert.deepEqual(scopeSummary(bus.scopedEmissions()[0]), [[SYS_A, ['narrative']]]);
    assert.equal(bus.reloads.journal, 0, 'and the per-record branch narrows exactly as the other');
    assert.equal(bus.fallbackCount(), 0);
  });

  it('emits NOTHING when the replicated corpus is identical', () => {
    const { world, bus } = wiredWorld();
    tracked(bus);

    assert.equal(replicate(world, bus, RECIPES_SETTING_KEY), true);

    assert.equal(bus.scopedEmissions().length, 0, 'the writing client must not double-refresh');
    assert.deepEqual(bus.reloadedStores(), []);
  });
});

describe('the fail-safe: an unattributable change routes broadly', () => {
  it('runs reload -> delta -> emit -> FALLBACK for a pure corpus reordering', () => {
    // A reordering is the only production-reachable producer of an empty domain set, which
    // makes it the sole end-to-end proof that the fail-safe is wired at all. The assertion is
    // the routing CONSEQUENCE, not the delta shape — `reload-scoped-invalidation.test.js`
    // already pins `reordered === true` and has never been red.
    const { world, bus } = wiredWorld();
    tracked(bus);
    world.write(null, storedRecipes(world.env).toReversed());
    const baseline = bus.fallbackCount();

    handleFabricateSettingChange(RECIPES_SETTING_KEY, {
      recipeManager: world.recipeManager,
      callAll: (name, payload) => bus.hooks.callAll(name, payload),
    });

    const [payload] = bus.scopedEmissions();
    assert.deepEqual(payload.scopes, [], 'a reorder is attributable to no record and no domain');
    assert.deepEqual(
      bus.reloadedStores(),
      ['crafting', 'inventory', 'alchemy', 'journal', 'gathering'],
      'so EVERY store reloads, including the two the narrow path would have excluded'
    );
    assert.equal(
      bus.fallbackCount() - baseline,
      5,
      'and it went through the broad fallback once per subscriber, rather than matching a ' +
        'domain by accident'
    );
  });

  it('routes an unrecognised payload broadly rather than dropping it', () => {
    const { bus } = wiredWorld();
    tracked(bus);
    const baseline = bus.fallbackCount();

    bus.hooks.callAll(CRAFTING_DATA_CHANGED_HOOK, { legacy: true });

    assert.deepEqual(bus.reloadedStores(), [
      'crafting',
      'inventory',
      'alchemy',
      'journal',
      'gathering',
    ]);
    assert.equal(bus.fallbackCount() - baseline, 5);
  });

  it('routes a payload whose scopes are malformed broadly', () => {
    const { bus } = wiredWorld();
    tracked(bus);

    bus.hooks.callAll(CRAFTING_DATA_CHANGED_HOOK, {
      source: 'recipes',
      scopes: [{ systemId: SYS_A, domains: 'labelling' }],
    });

    assert.equal(bus.reloadedStores().length, 5, 'a string is not a domain array');
  });

  it('delivers a well-formed narrow payload WITHOUT touching the fallback counter', () => {
    const { bus } = wiredWorld();
    tracked(bus);
    const baseline = bus.fallbackCount();

    bus.hooks.callAll(
      CRAFTING_DATA_CHANGED_HOOK,
      craftingDataChange({
        source: 'recipes',
        scopes: [{ systemId: SYS_A, domains: [INVALIDATION_DOMAINS.NARRATIVE] }],
      })
    );

    assert.deepEqual(bus.reloadedStores(), ['crafting', 'inventory', 'alchemy']);
    assert.equal(bus.fallbackCount(), baseline, 'the counter is the control, so it must be inert');
  });
});

describe('batch and import stay bounded', () => {
  it('emits ONE scoped signal for a whole compendium import', async () => {
    const { world, bus } = wiredWorld();
    tracked(bus);

    // Imported DISABLED, because the fixture systems are alchemy systems and the enable-time
    // signature gate would otherwise refuse every import as a collision with the recipe that
    // already claims that component — which would leave nothing attributed and pass for the
    // wrong reason.
    const outcome = await world.recipeManager.importRecipes(
      [
        persistedRecipe('imp-1', SYS_A, `${SYS_A}-c0`, { enabled: false }),
        persistedRecipe('imp-2', SYS_A, `${SYS_A}-c1`, { enabled: false }),
        persistedRecipe('imp-3', SYS_B, `${SYS_B}-c0`, { enabled: false }),
      ],
      { overwrite: true }
    );

    assert.equal(outcome.imported, 3, 'the premise: all three really landed');
    assert.equal(bus.scopedEmissions().length, 1, 'three records, one invalidation boundary');
    assert.deepEqual(
      bus.scopedEmissions()[0].scopes.map((scope) => scope.systemId).sort(),
      [SYS_A, SYS_B]
    );
  });

  it('coalesces a per-record replication batch into one signal carrying EVERY record', () => {
    // The per-record branch mints one delta per record and the next mint replaces it, so a
    // coalescer that read the scopes at flush time would report the batch's LAST record alone.
    const bus = tracked(installCraftingDataBus());
    const refresh = createRecipeRefreshCoalescer({ schedule: () => {} });
    const applied = [];
    const recipeManager = {
      applyReplicatedRecordChange: ({ key }) => {
        applied.push(key);
        return true;
      },
      getRecipes: () => [],
      consumeReplicatedChangeScopes: () => [
        {
          systemId: String(applied.at(-1)).replace('fabricate.recipe.', ''),
          domains: [INVALIDATION_DOMAINS.LABELLING],
        },
      ],
    };

    refresh.open();
    for (const systemId of [SYS_A, SYS_B]) {
      handleFabricateSettingChange(`fabricate.recipe.${systemId}`, {
        recipeManager,
        recipeRefresh: refresh,
        callAll: (name, payload) => bus.hooks.callAll(name, payload),
      });
    }
    refresh.close();

    assert.equal(bus.scopedEmissions().length, 1, 'one signal for the whole bracket');
    assert.deepEqual(scopeSummary(bus.scopedEmissions()[0]), [
      [SYS_A, ['labelling']],
      [SYS_B, ['labelling']],
    ]);
  });
});

describe('two clients over one shared world converge', () => {
  it('narrows on the SECOND client exactly as it did on the first', async () => {
    // Two independent manager pairs over one settings seam, each with its own `Hooks` bus —
    // which is the property that makes the signal a `Hooks.callAll` rather than a module-local
    // emitter, since `globalThis.Hooks` is read at call time by every publisher.
    const systems = [persistedSystem(SYS_A, ['Iron Ore'])];
    const writer = remoteClient({
      systems,
      recipes: [persistedRecipe('r-a1', SYS_A, `${SYS_A}-c0`)],
    });
    // The reader's PRE-EDIT corpus is the writer's, byte for byte. Building it a second time
    // from the fixture would stamp fresh `metadata` timestamps, and the reader would then
    // attribute `labelling` as well as `narrative` — a fixture artefact that would have read
    // as the taxonomy failing to narrow.
    const preEdit = structuredClone(writer.env.settings.get(SETTING_KEYS.RECIPES));
    const writerBus = tracked(installCraftingDataBus());

    await writer.recipeManager.updateRecipe('r-a1', { description: 'Shared' }, { notify: false });
    assert.equal(writerBus.scopedEmissions().length, 1, 'the writer announced its own edit');
    assert.deepEqual(scopeSummary(writerBus.scopedEmissions()[0]), [[SYS_A, ['narrative']]]);
    const postEdit = structuredClone(writer.env.settings.get(SETTING_KEYS.RECIPES));
    writerBus.restore();

    // The reader hydrated from the world BEFORE the edit, then catches up through the bridge.
    const reader = remoteClient({ systems, recipes: preEdit });
    reader.write(null, postEdit);
    const readerBus = tracked(installCraftingDataBus());

    handleFabricateSettingChange(RECIPES_SETTING_KEY, {
      recipeManager: reader.recipeManager,
      callAll: (name, payload) => readerBus.hooks.callAll(name, payload),
    });

    assert.equal(readerBus.scopedEmissions().length, 1, 'exactly one signal on the reader too');
    assert.deepEqual(
      scopeSummary(readerBus.scopedEmissions()[0]),
      [[SYS_A, ['narrative']]],
      'CONVERGENCE: the reader derived the same narrow attribution from the replicated corpus'
    );
    assert.equal(reader.recipeManager.getRecipe('r-a1').description, 'Shared');
    assert.equal(readerBus.reloads.journal, 0);
    assert.equal(readerBus.fallbackCount(), 0);
  });
});
