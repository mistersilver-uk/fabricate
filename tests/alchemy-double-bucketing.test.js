/**
 * Regression for issue 572 — the alchemy submission DOUBLE-BUCKETING bug.
 *
 * A divergent-lineage owned item (durable identity `roles[sys].componentId = B`,
 * but a transitive `_stats.duplicateSource` pointing at component A's source) was
 * bucketed to B by the #558-fixed engine, yet to A by TWO other systemId-blind
 * sites — the workbench owned-components PALETTE
 * (`AlchemyListingBuilder._projectOwnedComponents`) and the submission COLLECTOR
 * (`resolveAlchemySubmissions`). The palette and collector therefore disagreed with
 * the engine.
 *
 * These tests drive the REAL palette projection and the REAL collector (NOT
 * hand-built submissions and NOT a hand-supplied `systemId`): the palette buckets
 * the divergent item, we feed the id the palette EMITTED into the collector exactly
 * as `Fabricate#submitAlchemyAttempt` does (see the source guard below), and the
 * collector's record flows into `craftAlchemy`. A fix that lands the collector but
 * leaves the palette systemId-blind (or the reverse) goes RED.
 *
 * Fixture invariant (LOAD-BEARING): the divergent item is `roles`-ONLY — no legacy
 * scalar `flags.fabricate.componentId`. With a scalar present,
 * `resolveComponentForItem(item, components, undefined)` would resolve B via the
 * legacy tier even systemId-blind, the divergence would vanish, and the test would
 * be vacuously green on the unfixed base. Omitting the scalar is what makes it RED.
 */

import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import assert from 'node:assert/strict';
import test from 'node:test';

import { roleItem } from './helpers/componentIdentityFixtures.js';

function getProperty(object, path) {
  if (!object || !path) return undefined;
  return String(path)
    .split('.')
    .reduce((value, key) => (value == null ? undefined : value[key]), object);
}

globalThis.foundry = {
  utils: { randomID: () => `id-${Math.random().toString(36).slice(2)}`, getProperty },
};
globalThis.game = { user: { isGM: true }, actors: [], fabricate: {} };
globalThis.ui = { notifications: { info: () => {}, warn: () => {}, error: () => {} } };

const { CraftingEngine } = await import('../src/systems/CraftingEngine.js');
const { SignatureValidator } = await import('../src/systems/SignatureValidator.js');
const { AlchemyListingBuilder } = await import('../src/systems/AlchemyListingBuilder.js');
const { resolveAlchemySubmissions } = await import('../src/utils/alchemySubmissions.js');
const { getItemSourceReferences } = await import('../src/utils/sourceUuid.js');

const SYS = 'alchemy-sys';

// Two distinct components; A's source ref is Item.A, B's is Item.B.
function component(id, name, sourceUuid) {
  return { id, name, registeredItemUuid: sourceUuid, originItemUuid: sourceUuid, aliasItemUuids: [] };
}

function group(componentId, quantity = 1) {
  return { id: `g-${componentId}`, options: [{ match: { type: 'component', componentId }, quantity }] };
}

function recipe(id, componentId) {
  return {
    id,
    name: id,
    enabled: true,
    craftingSystemId: SYS,
    ingredientSets: [{ id: `${id}-set`, ingredientGroups: [group(componentId)], essences: {} }],
  };
}

// The shared A/B world: component A and B in one system, plus a recipe requiring B
// and a distinct recipe requiring A, so a mis-bucketed submission credits the WRONG
// recipe (or none) rather than merely the wrong id.
function world() {
  const components = [component('cA', 'Alpha', 'Item.A'), component('cB', 'Beta', 'Item.B')];
  const recipes = [recipe('needs-B', 'cB'), recipe('needs-A', 'cA')];
  const system = { id: SYS, resolutionMode: 'alchemy', alchemy: { learnOnCraft: true, consumeOnFail: false }, components, features: { essences: false } };
  game.fabricate.getCraftingSystemManager = () => ({ getSystem: (id) => (id === SYS ? system : null) });
  game.fabricate.getRecipeManager = () => ({ getRecipes: () => recipes });
  const validator = new SignatureValidator({
    getSystem: () => system,
    getRecipesForSystem: () => recipes,
    getComponentsForSystem: () => components,
  });
  const engine = new CraftingEngine({ getRecipes: () => recipes });
  return { components, recipes, system, validator, engine };
}

// Drive the palette (site 1) then the collector (site 2) exactly as the facade does,
// feeding the id the palette EMITTED for `item` into the collector, then craftAlchemy.
async function paletteToBrew({ engine, validator, system, components }, item) {
  const source = { id: 'src', items: [item] };
  const palette = new AlchemyListingBuilder({})._projectOwnedComponents(components, [source], system);
  const row = palette.find((r) => r.held > 0);

  let captured = null;
  engine.craft = async (_crafter, _sources, chosenRecipe, ingredientSetId, options) => {
    captured = { chosenRecipe, ingredientSetId, options };
    return { success: true, results: [{}], message: '' };
  };

  const submitted = resolveAlchemySubmissions([source], components, row ? [row.componentId] : [], system.id);
  const result = await engine.craftAlchemy({ id: 'pc' }, [source], submitted, {
    craftingSystemId: system.id,
    signatureValidator: validator,
  });
  return { palette, row, submitted, result, captured };
}

test('a divergent roles-B / duplicateSource-A item is bucketed to B by the palette, collector, and engine alike (issue 572)', async () => {
  const w = world();
  // roles => cB, but a transitive duplicateSource still points at A's source. NO
  // legacy scalar componentId (the load-bearing fixture invariant).
  const item = roleItem({
    uuid: 'Actor.x.Item.owned-copy-of-A',
    duplicateSource: 'Item.A',
    roles: { [SYS]: { componentId: 'cB' } },
    quantity: 1,
    name: 'Restamped Draught',
  });
  assert.ok(
    getItemSourceReferences(item).includes('Item.A'),
    'non-vacuity: the item raw refs must genuinely overlap component A'
  );

  const { row, result, captured } = await paletteToBrew(w, item);

  // (a) the palette attributes the divergent item to B, not the duplicate-lineage A.
  assert.ok(row, 'the palette projects the owned divergent item');
  assert.equal(row.componentId, 'cB', 'palette buckets the divergent item to its durable component B, not A');

  // (b) the item is brewable — not dropped as "No ingredients submitted".
  assert.notEqual(result.message, 'No ingredients submitted', 'the divergent item is brewable through the real palette->collector path');
  assert.equal(result.success, true, 'the brew matched');

  // (c) craftAlchemy credits the B recipe, never the A recipe.
  assert.equal(captured.chosenRecipe.id, 'needs-B', 'the matched recipe is the one requiring B');
});

test('tier-union pin: a name-only submission is attributed and credited through palette->collector->craftAlchemy', async () => {
  const w = world();
  // No flags, no source refs; name equals component A's name.
  const item = { name: 'Alpha', system: { quantity: 1 } };

  const { row, result, captured } = await paletteToBrew(w, item);
  assert.ok(row, 'the palette projects the name-matched item');
  assert.equal(row.componentId, 'cA', 'the name-only item buckets to component A by the name tier');
  assert.equal(result.success, true, 'the name-only item is brewable');
  assert.equal(captured.chosenRecipe.id, 'needs-A', 'credited to component A');
});

test('tier-union pin: a bare-registeredItemUuid-only submission is attributed and credited through palette->collector->craftAlchemy', async () => {
  const w = world();
  // ONLY a bare top-level registeredItemUuid naming A's match uuid — no uuid,
  // compendium source, duplicateSource, roles, scalar, or name. Invisible to
  // getItemSourceReferences; only the bare-uuid supplement tier can attribute it.
  const item = { registeredItemUuid: 'Item.A', system: { quantity: 1 } };

  const { row, result, captured } = await paletteToBrew(w, item);
  assert.ok(row, 'the palette projects the bare-registeredItemUuid item');
  assert.equal(row.componentId, 'cA', 'the bare-registeredItemUuid item buckets to component A');
  assert.equal(result.success, true, 'the bare-registeredItemUuid item is brewable');
  assert.equal(captured.chosenRecipe.id, 'needs-A', 'credited to component A');
});

test('resolveAlchemySubmissions returns { item, componentId } records bucketed system-scoped (direct unit assertion)', () => {
  const { components } = world();
  const item = roleItem({
    uuid: 'Actor.x.Item.owned-copy-of-A',
    duplicateSource: 'Item.A',
    roles: { [SYS]: { componentId: 'cB' } },
    quantity: 1,
    name: 'Restamped Draught',
  });
  const source = { id: 'src', items: [item] };

  const submitted = resolveAlchemySubmissions([source], components, ['cB'], SYS);
  assert.equal(submitted.length, 1, 'the divergent item is dispensed for the B request (systemId-scoped)');
  assert.equal(submitted[0].componentId, 'cB', 'the record carries the bucket key it was dispensed from');
  assert.equal(submitted[0].item, item, 'the record carries the REAL owned item');
});

test('the facade threads craftingSystemId into the collector so the palette and collector agree (main.js seam guard)', () => {
  // Fabricate#submitAlchemyAttempt is not runtime-importable in the node test env
  // (src/main.js imports a .css asset), so this asserts the seam on source text —
  // the established pattern for src/main.js coverage in this repo. Without the
  // fourth `craftingSystemId` argument the collector is systemId-blind and drops a
  // B-bucketed placement the fixed palette emits (the naive-partial-fix regression).
  const __dirname = dirname(fileURLToPath(import.meta.url));
  const mainSource = readFileSync(resolve(__dirname, '../src/main.js'), 'utf8');
  assert.match(
    mainSource,
    /resolveAlchemySubmissions\(\s*sources,\s*components,\s*submittedComponentIds,\s*craftingSystemId\s*\)/,
    'submitAlchemyAttempt must pass craftingSystemId into resolveAlchemySubmissions'
  );
});
