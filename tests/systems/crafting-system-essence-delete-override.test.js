/** THE ESSENCE DELETE IS AN OVERRIDE (issue 1371 r21-store4, the reviewer's round-7 finding 1). */

import assert from 'node:assert/strict';
import test from 'node:test';

import { createComponentEssenceOverride } from '../../src/systems/componentEssenceOverride.js';
import { resolvedComponentEssencesFor } from '../../src/systems/resolvedComponentEssences.js';
import { setSectionInheritance } from '../../src/systems/scopedDefinitions.js';
import { installFoundryEnv } from '../helpers/foundryEnv.js';

installFoundryEnv();

const { CraftingSystemManager } = await import('../../src/systems/CraftingSystemManager.js');

/** A recipe manager double with nothing to cascade into: this suite is about the COMPONENT half. */
function makeRecipeManager() {
  return {
    getRecipes: () => [],
    updateRecipe: async () => {},
    save: async () => {},
    notifyRecipesChanged: () => {},
    disableSignatureConflicts: async () => [],
  };
}

/**
 * The world after `1.32.0`: `ingot` carries `{fire: 3, earth: 2}` at WORLD scope, `sys` inherits
 * it, and the system's own row is the dormant one the election left behind.
 *
 * @param {boolean} [options.flagRefuses] whether the world-setting flag write is refused.
 * @param {object} [options.row] the system's own persisted essence map.
 */
function makeWorld({ flagRefuses = false, row = {} } = {}) {
  let corpus = {
    entities: [{ id: 'ingot' }],
    defaults: [{ id: 'ingot', essences: { fire: 3, earth: 2 } }],
    membership: [{ entityId: 'ingot', systemId: 'sys', inherit: {} }],
  };
  const componentScopeStore = { corpus: () => corpus };

  const manager = new CraftingSystemManager(makeRecipeManager(), { componentScopeStore });
  manager.initialized = true;
  manager.save = async () => {};
  manager.systems.set(
    'sys',
    manager._normalizeSystem({
      id: 'sys',
      name: 'Smithing',
      features: { essences: true },
      components: [{ id: 'ingot', name: 'Iron Ingot', essences: row }],
      essenceDefinitions: [
        { id: 'fire', name: 'Fire' },
        { id: 'earth', name: 'Earth' },
      ],
    })
  );

  const override = createComponentEssenceOverride({
    readComponentScope: () => corpus,
    readResolvedEssences: (systemId, componentId) =>
      resolvedComponentEssencesFor(manager, systemId, componentId),
    setEssenceInheritance: async (componentId, systemId, inherit) => {
      if (flagRefuses) return false;
      // A REAL replacement, not an in-place edit: the read union's memo keys on the corpus
      // OBJECT's identity, so a store that mutated in place would go on answering the pre-flip
      // union and the assertion below would pass for the wrong reason.
      corpus = {
        ...corpus,
        membership: corpus.membership.map((record) =>
          record.entityId === componentId && record.systemId === systemId
            ? setSectionInheritance(record, 'essences', inherit, corpus.defaults[0])
            : record
        ),
      };
      return true;
    },
    clearEssenceOverride: async () => true,
  });

  let flipped = [];
  const seam = {
    overrideInheritedEssences: async (systemId, componentIds) => {
      const cohort = await override.cohortFor(systemId, componentIds, { essences: {} });
      flipped = cohort.flipped;
      return cohort.writable;
    },
  };
  return {
    manager,
    seam,
    override,
    membership: () => corpus.membership[0],
    worldMap: () => corpus.defaults[0].essences,
    flipped: () => flipped,
    resolvedIngot: () =>
      manager.getComponentsForSystem('sys').find((component) => component.id === 'ingot')?.essences,
  };
}

test('1371 r21: the pre-fix world is the one this closes — an inheriting pair resolves the world map', () => {
  // The premise, asserted rather than assumed: without it every case below would be vacuous.
  const world = makeWorld();
  assert.deepEqual(world.resolvedIngot(), { fire: 3, earth: 2 }, 'the world map is what resolves');
  assert.deepEqual(
    world.manager.getSystem('sys').components[0].essences,
    {},
    'while the row the delete strips carries nothing at all'
  );
});

test('1371 r21: deleteEssence overrides the pair first, so the system stops resolving the essence', async () => {
  const world = makeWorld();

  assert.equal(await world.manager.deleteEssence('sys', 'fire', world.seam), true);

  assert.deepEqual(
    world.resolvedIngot(),
    { earth: 2 },
    'the deleted essence is gone from what the system RESOLVES — the dialog’s own claim'
  );
  assert.equal(
    world.membership().inherit.essences,
    false,
    'because the pair was flipped to override before the strip'
  );
  assert.deepEqual(
    world.worldMap(),
    { fire: 3, earth: 2 },
    'and the WORLD map is untouched, so every other system keeps it'
  );
});

test('1371 r21: the flipped row is seeded from what it RESOLVED, so the other essences survive', async () => {
  // The second data loss the flip alone would cause.
  const world = makeWorld();
  await world.manager.deleteEssence('sys', 'fire', world.seam);
  assert.deepEqual(
    world.manager.getSystem('sys').components[0].essences,
    { earth: 2 },
    'the persisted row now carries what the pair resolved, minus the deleted id'
  );
});

test('1371 r21: deleteEssences does the same for the whole set, in ONE cohort', async () => {
  const world = makeWorld();

  const result = await world.manager.deleteEssences('sys', ['fire', 'earth'], world.seam);

  assert.equal(result.deleted, 2);
  assert.deepEqual(world.resolvedIngot(), {}, 'the pair resolves neither essence afterwards');
  assert.equal(world.membership().inherit.essences, false);
  assert.deepEqual(world.flipped(), [{ componentId: 'ingot', seeded: true }], 'flipped ONCE');
});

test('1371 r21: a component the delete does not affect is not flipped', async () => {
  // The cascade's reach is the rows whose RESOLVED map carries a deleted id. Flipping a pair the
  // delete cannot touch would opt it out of every later world edit for nothing.
  const world = makeWorld();
  world.manager.getSystem('sys').essenceDefinitions.push({ id: 'water', name: 'Water' });

  await world.manager.deleteEssence('sys', 'water', world.seam);

  assert.deepEqual(world.flipped(), [], 'no pair resolved `water`, so no switch moved');
  assert.equal(world.membership().inherit.essences, undefined, 'the switch is where it was');
  assert.deepEqual(world.resolvedIngot(), { fire: 3, earth: 2 }, 'and the map is untouched');
});

test('1371 r21: a REFUSED flag write leaves the pair inheriting rather than half-stripping it', async () => {
  // Warned, not blocked: the definition still goes, because refusing the whole delete over one
  // setting refusal would leave a definition the GM asked to remove in place.
  const world = makeWorld({ flagRefuses: true });

  assert.equal(await world.manager.deleteEssence('sys', 'fire', world.seam), true);

  assert.equal(world.membership().inherit.essences, undefined, 'the switch did not move');
  assert.deepEqual(world.resolvedIngot(), { fire: 3, earth: 2 }, 'so the world map still shadows');
  assert.deepEqual(
    world.manager.getSystem('sys').essenceDefinitions.map((def) => def.id),
    ['earth'],
    'and the definition the GM asked to delete is gone all the same'
  );
});

test('1371 r21: with NO seam the cascade is exactly what it was, and the row is still stripped', async () => {
  // The honest degradation for a caller with no world-scope write path. The in-system row is what
  // this manager owns, and it is stripped whether or not anything can flip a switch.
  const world = makeWorld({ row: { fire: 3, earth: 2 } });

  await world.manager.deleteEssence('sys', 'fire');

  assert.deepEqual(
    world.manager.getSystem('sys').components[0].essences,
    { earth: 2 },
    'the persisted row is stripped, as it always was'
  );
  assert.equal(world.membership().inherit.essences, undefined, 'and no world setting was written');
});
