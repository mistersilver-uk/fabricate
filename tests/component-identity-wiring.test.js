/**
 * Production-wiring coverage for the per-system durable component identity
 * (`flags.fabricate.roles[systemId].componentId`) introduced by issue 556.
 *
 * These are List-A fail-on-main guards driven through REAL production entry points
 * (never a direct `resolveComponentForItem(..., systemId)` call): a `roles`-only
 * identity fixture with a conflicting `_stats.duplicateSource` that names a DIFFERENT
 * component. On `origin/main` (which cannot read `roles`) and on an UNTHREADED fix
 * (`systemId === undefined` ⇒ `roles[undefined]` absent) each such fixture buckets
 * under the `duplicateSource` component, so only genuinely threading the system id at
 * each call site turns them green — exactly the coverage rule the delta mandates.
 *
 * Plus A5 (per-system repair, no cross-clear) and B9 (restamp resilience).
 */

import test from 'node:test';
import assert from 'node:assert/strict';

import { getProperty, makeWorldItem } from './helpers/writeCapableItemFake.js';

globalThis.foundry = {
  utils: { randomID: () => `id-${Math.random().toString(36).slice(2)}`, getProperty },
};
globalThis.ui = { notifications: { info() {}, warn() {}, error() {} } };
globalThis.game = { user: { isGM: true, id: 'gm-user' }, actors: [], items: [], packs: [], fabricate: {} };
globalThis.fromUuid = async () => null;

const { CraftingSystemManager } = await import('../src/systems/CraftingSystemManager.js');
const { CraftingEngine } = await import('../src/systems/CraftingEngine.js');
const { RecipeManager } = await import('../src/systems/RecipeManager.js');
const { InventoryListingBuilder } = await import('../src/systems/InventoryListingBuilder.js');
const { createGatheringResultCreator } = await import('../src/gatheringResultCreation.js');
const { component, componentSet, roleItem } = await import('./helpers/componentIdentityFixtures.js');
const { toAlchemyRecords } = await import('./helpers/alchemySubmissionRecords.js');

function buildManager(systemsById) {
  const mgr = new CraftingSystemManager({ getRecipes: () => [], deleteRecipe: async () => {}, updateRecipe: async () => {} });
  mgr.initialized = true;
  mgr.save = async () => {};
  mgr.systems = new Map(Object.entries(systemsById));
  return mgr;
}

// The shared fail-on-main fixture: `item` carries roles → rolesComp, but its
// duplicateSource overlaps dupComp's source ref. Both components live in one system's
// set, with DISTINCT essences so attribution is observable.
function conflictingIdentityFixture({ quantity } = {}) {
  const rolesComp = component('comp-roles', { originItemUuid: 'Item.roles-src', essences: { fire: 2 } });
  const dupComp = component('comp-dup', { originItemUuid: 'Item.dup-src', essences: { ice: 3 } });
  const item = roleItem({
    uuid: 'Item.owned',
    duplicateSource: 'Item.dup-src', // raw-ref overlaps dupComp — main/unthreaded mis-bucket here
    roles: { sysA: { componentId: 'comp-roles' } },
    quantity,
  });
  return { rolesComp, dupComp, item, components: [rolesComp, dupComp] };
}

// ---------------------------------------------------------------------------
// A7 — essence USED-BY path: InventoryListingBuilder._buildSystemParticipations
// ---------------------------------------------------------------------------

test('A7 - used-by: _buildSystemParticipations threads system.id so a roles-only item buckets under its roles component, not its duplicateSource sibling', () => {
  const { rolesComp, item, components } = conflictingIdentityFixture({ quantity: 2 });
  const builder = new InventoryListingBuilder({
    recipeManager: { getRecipes: () => [] },
    craftingSystemManager: { getSystems: () => [] },
  });
  const system = { id: 'sysA', name: 'System A', components };
  const actor = { id: 'actor-1', name: 'Hero', items: [item] };

  const { participations } = builder._buildSystemParticipations(system, [actor]);
  assert.equal(participations.length, 1, 'the owned item resolves to exactly one component');
  assert.equal(participations[0].componentId, rolesComp.id, 'bucketed under the roles component');
});

// ---------------------------------------------------------------------------
// A8 — essence CRAFT-TIME path: CraftingEngine._buildEssenceContext (:2607)
// ---------------------------------------------------------------------------

test('A8 - craft-time: _buildEssenceContext threads recipe.craftingSystemId so essences attribute to the roles component', () => {
  const { item, components } = conflictingIdentityFixture();
  const engine = new CraftingEngine({ getRecipes: () => [] });
  globalThis.game.fabricate = {
    getCraftingSystemManager: () => ({
      getSystem: (id) => (id === 'sysA' ? { id: 'sysA', components } : null),
    }),
  };

  const { resolvedEssences } = engine._buildEssenceContext([{ item, quantity: 1 }], { craftingSystemId: 'sysA' });
  assert.equal(resolvedEssences.fire, 2, 'attributed to the roles component (fire)');
  assert.equal(resolvedEssences.ice, undefined, 'NOT the duplicateSource component (ice)');
});

// ---------------------------------------------------------------------------
// A9a — recipe-availability (alchemy): CraftingEngine._matchAlchemySignature (:1305)
// ---------------------------------------------------------------------------

test('A9a - recipe-availability: _matchAlchemySignature threads options.system.id so a roles-only item satisfies an essence-only set', () => {
  const { item, components } = conflictingIdentityFixture();
  const engine = new CraftingEngine({ getRecipes: () => [] });
  const validator = { computeSignature: () => [], expandIngredientToComponentIds: () => [] };
  const recipe = { enabled: true, ingredientSets: [{ id: 'set-1', essences: { fire: 2 }, ingredientGroups: [] }] };
  const system = { id: 'sysA', features: { essences: true } };

  const result = engine._matchAlchemySignature(
    toAlchemyRecords([item], components, system.id),
    [recipe],
    components,
    validator,
    { system }
  );
  assert.equal(result.matched, true, 'the roles component supplies the fire essence the set requires');
  assert.equal(result.ingredientSetId, 'set-1');
});

// ---------------------------------------------------------------------------
// A9b — recipe-availability: RecipeManager._accumulateEssences (:1278)
// ---------------------------------------------------------------------------

test('A9b - recipe-availability: _accumulateEssences threads recipe.craftingSystemId so essences attribute to the roles component', () => {
  const { item, components } = conflictingIdentityFixture({ quantity: 1 });
  const rm = new RecipeManager();
  globalThis.game.fabricate = {
    getCraftingSystemManager: () => ({
      getSystem: (id) => (id === 'sysA' ? { id: 'sysA', components } : null),
    }),
  };

  const accumulated = rm._accumulateEssences([item], { craftingSystemId: 'sysA' });
  assert.equal(accumulated.fire, 2, 'attributed to the roles component (fire)');
  assert.equal(accumulated.ice, undefined, 'NOT the duplicateSource component (ice)');
});

// ---------------------------------------------------------------------------
// A10 — gathering award STACK GUARD driven through the real award closure
// (createGatheringResultCreator.create → findStackableMatch at the call site).
// This is the surface #556 is named for; a direct 4-arg findStackableMatch unit
// test (A2) cannot see a regression at THIS call site, so it must be driven here.
// ---------------------------------------------------------------------------

test('A10 - award: a fresh award is NOT folded into an owned stack that resolves to a DIFFERENT component via a transitive duplicateSource', async () => {
  const awardComp = component('comp-award', { originItemUuid: 'Item.award-src' }); // no registeredItemUuid ⇒ bare-component source
  const otherComp = component('comp-other', { originItemUuid: 'Item.other-src' });
  const system = { id: 'sysA', components: [awardComp, otherComp] };
  const craftingSystemManager = { getSystem: (id) => (id === 'sysA' ? system : null) };

  // The owned candidate is a DIFFERENT component by durable identity, but its transitive
  // duplicateSource overlaps the award source's ref — the exact #556 false-positive shape.
  const candidate = roleItem({
    uuid: 'Item.owned',
    duplicateSource: 'Item.award-src',
    roles: { sysA: { componentId: 'comp-other' } },
    quantity: 5,
  });
  let stackedInto = false;
  candidate.update = async () => {
    stackedInto = true;
  };

  const createdDocs = [];
  const actor = {
    uuid: 'Actor.a',
    items: [candidate],
    async createEmbeddedDocuments(_type, data) {
      const made = data.map((d, i) => ({ ...d, id: `new-${i}`, uuid: `Actor.a.Item.new-${i}` }));
      createdDocs.push(...made);
      return made;
    },
  };

  const resultGroups = [{ results: [{ componentId: 'comp-award', quantity: 1 }] }];
  await createGatheringResultCreator(craftingSystemManager).create({ actor, system, resultGroups });

  assert.equal(stackedInto, false, 'the unrelated owned stack is NOT inflated');
  assert.equal(candidate.system.quantity, 5, 'the owned stack quantity is unchanged');
  assert.equal(createdDocs.length, 1, 'a new document is created for the award instead');
});

// ---------------------------------------------------------------------------
// A5 — per-system repair clears/writes only the map key (no cross-system clear)
// ---------------------------------------------------------------------------

test('A5 - repair writes roles[sysB].componentId for a source owned by system B only, and a non-owning system A pass never clears it (order-independent)', async () => {
  const compA = component('comp-a', { registeredItemUuid: 'Item.a-src', originItemUuid: 'Item.a-src' });
  const compB = component('comp-b', { registeredItemUuid: 'Item.b-src', originItemUuid: 'Item.b-src' });
  const sysA = componentSet('sysA', [compA]);
  const sysB = componentSet('sysB', [compB]);

  for (const order of [['sysA', 'sysB'], ['sysB', 'sysA']]) {
    const worldItem = makeWorldItem({ uuid: 'Item.b-src', name: 'B Source' });
    const ordered = Object.fromEntries(order.map((id) => [id, id === 'sysA' ? sysA : sysB]));
    const mgr = buildManager(ordered);
    globalThis.game = { user: { isGM: true, id: 'gm-user' }, actors: [], items: [worldItem], packs: [] };

    const summary = await mgr.repairItemData({ includeCompendiums: false });

    assert.equal(
      worldItem.getFlag('fabricate', 'fabricate.roles.sysB.componentId'),
      'comp-b',
      `sysB identity written as the per-system map key (order ${order.join(',')})`
    );
    assert.equal(
      worldItem.getFlag('fabricate', 'fabricate.roles.sysA.componentId'),
      undefined,
      `system A's null-owner pass never wrote or cleared a cross-system key (order ${order.join(',')})`
    );
    assert.ok(summary.stamped >= 1);
  }
  globalThis.game = { user: { isGM: true, id: 'gm-user' }, actors: [], items: [], packs: [] };
});

// ---------------------------------------------------------------------------
// A11a — a dotted system id is rejected LOUDLY at creation/import, never accepted
// as a booby-trapped durable-flag map key that silently degrades matching.
// ---------------------------------------------------------------------------

test('A11a - createSystem rejects a dotted system id with a clear error and accepts a randomID-shaped id', async () => {
  const mgr = buildManager({});
  globalThis.game = { user: { isGM: true, id: 'gm-user' }, actors: [], items: [], packs: [] };

  await assert.rejects(
    () => mgr.createSystem({ id: 'my.system', name: 'Dotted' }),
    /Invalid crafting system id "my\.system"/,
    'a dotted id is rejected, naming the offending id'
  );

  const ok = await mgr.createSystem({ id: 'abc123XYZ_-', name: 'Fine' });
  assert.equal(ok.id, 'abc123XYZ_-', 'a randomID-shaped id is accepted unchanged (never rewritten)');

  globalThis.game = { user: { isGM: true, id: 'gm-user' }, actors: [], items: [], packs: [] };
});

// ---------------------------------------------------------------------------
// B9 — restamp resilience (autoStampComponentSources)
// ---------------------------------------------------------------------------

test('B9 - autoStampComponentSources writes roles[sys].componentId, skips missing + locked sources, and is idempotent', async () => {
  const _registry = new Map();
  globalThis.fromUuid = async (uuid) => _registry.get(uuid) ?? null;
  globalThis.game = {
    user: { isGM: true, id: 'gm-user' },
    actors: [],
    items: [],
    packs: { get: (id) => (id === 'locked.pack' ? { locked: true } : { locked: false }) },
  };

  const worldSource = makeWorldItem({ uuid: 'Item.world-src', name: 'World Source' });
  const lockedSource = makeWorldItem({ uuid: 'Compendium.locked.pack.x', name: 'Locked Source', pack: 'locked.pack' });
  _registry.set('Item.world-src', worldSource);
  _registry.set('Compendium.locked.pack.x', lockedSource);

  const sysA = componentSet('sysA', [
    component('comp-world', { originItemUuid: 'Item.world-src' }),
    component('comp-locked', { originItemUuid: 'Compendium.locked.pack.x' }),
    component('comp-missing', { originItemUuid: 'Item.deleted' }),
  ]);
  const mgr = buildManager({ sysA });

  const summary = await mgr.autoStampComponentSources();
  assert.equal(summary.stamped, 1, 'only the writable world source is stamped');
  assert.equal(summary.skippedLocked, 1, 'the locked-pack source is skipped');
  assert.equal(summary.skippedMissing, 1, 'the unresolvable source is skipped without throwing');
  assert.equal(worldSource.getFlag('fabricate', 'fabricate.roles.sysA.componentId'), 'comp-world');
  assert.equal(lockedSource.getFlag('fabricate', 'fabricate.roles.sysA.componentId'), undefined);

  const second = await mgr.autoStampComponentSources();
  assert.equal(second.stamped, 0, 'a second run performs zero writes (idempotent)');

  globalThis.fromUuid = async () => null;
  globalThis.game = { user: { isGM: true, id: 'gm-user' }, actors: [], items: [], packs: [] };
});
