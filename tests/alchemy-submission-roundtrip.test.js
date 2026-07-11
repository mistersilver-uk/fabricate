/**
 * Regression guard for the P0 where `resolveAlchemySubmissions` stripped the
 * component linkage (issue 543 review round 1).
 *
 * These tests drive the REAL path the `submitAlchemyAttempt` facade runs —
 * `resolveAlchemySubmissions` (NOT hand-built submissions) -> `craftAlchemy`
 * (`_matchAlchemySignature` / `_submittedComponentMultiset`) — with a REALISTIC
 * owned item whose live `uuid` (`Actor.x.Item.y`) DIFFERS from its component
 * source reference (`Item.*`, carried in `_stats.duplicateSource`). The engine
 * resolves a submission to a component only by source-reference intersection, so
 * the pre-fix thin `{ uuid, sourceUuid: item.uuid }` submission never intersected
 * the component's source-ref chain: every brew fizzled and no dead-end key was
 * ever recorded. Existing suites masked this by making the owned uuid equal the
 * component source uuid; these do not.
 */

import test from 'node:test';
import assert from 'node:assert/strict';

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
const { resolveAlchemySubmissions } = await import('../src/utils/alchemySubmissions.js');

// FakeActor flag store, doubly-nested exactly as setFabricateFlag persists it.
function getPathValue(object, path) {
  return String(path)
    .split('.')
    .reduce((value, part) => (value == null || typeof value !== 'object' ? undefined : value[part]), object);
}
function setPathValue(object, path, value) {
  const parts = String(path).split('.');
  const last = parts.pop();
  let target = object;
  for (const part of parts) {
    if (!target[part] || typeof target[part] !== 'object') target[part] = {};
    target = target[part];
  }
  target[last] = value;
}
class FakeActor {
  constructor() {
    this._flags = { fabricate: {} };
    this.id = 'pc';
  }
  getFlag(scope, key) {
    return getPathValue(this._flags[scope], key);
  }
  async setFlag(scope, key, value) {
    if (!this._flags[scope]) this._flags[scope] = {};
    setPathValue(this._flags[scope], key, value);
  }
}

// A component sourced at a WORLD item uuid (Item.*), matched by an owned item that
// only carries the link in `_stats.duplicateSource` — the realistic drag-copy case.
function component(id, sourceUuid) {
  return { id, name: `${id}-comp`, sourceUuid, sourceItemUuid: sourceUuid };
}
function ownedItem(uuid, duplicateSource, quantity) {
  // NB: distinct `name` so ONLY source-ref matching can resolve it to a component.
  return { uuid, name: `owned-${uuid}`, system: { quantity }, _stats: { duplicateSource } };
}
function group(componentId, quantity = 1) {
  return { id: `g-${componentId}`, options: [{ match: { type: 'component', componentId }, quantity }] };
}
function recipe(id, groups) {
  return {
    id,
    name: id,
    enabled: true,
    craftingSystemId: 'sys-a',
    ingredientSets: [{ id: `${id}-set`, ingredientGroups: groups, essences: {} }],
  };
}
function setup(recipes, components, alchemyCfg = {}) {
  const sys = {
    id: 'sys-a',
    resolutionMode: 'alchemy',
    alchemy: { learnOnCraft: true, consumeOnFail: false, showAttemptHistoryToPlayers: true, ...alchemyCfg },
    components,
    features: {},
  };
  game.fabricate.getCraftingSystemManager = () => ({ getSystem: (id) => (id === 'sys-a' ? sys : null) });
  const validator = new SignatureValidator({
    getSystem: () => sys,
    getRecipesForSystem: () => recipes,
    getComponentsForSystem: () => components,
  });
  const engine = new CraftingEngine({ getRecipes: () => recipes });
  return { engine, validator };
}

test('a bench equal to a known concrete signature MATCHES (discovers) with a realistic drag-copied owned item', async () => {
  const components = [component('emberroot', 'Item.ember'), component('springwater', 'Item.spring')];
  const vigor = recipe('vigor', [group('emberroot', 1), group('springwater', 2)]);
  const { engine, validator } = setup([vigor], components);

  const actor = new FakeActor();
  // Owned uuids DIFFER from the component source refs (Actor.x.Item.* vs Item.*).
  const source = {
    items: [ownedItem('Actor.x.Item.e1', 'Item.ember', 4), ownedItem('Actor.x.Item.w1', 'Item.spring', 6)],
  };

  // The REAL resolution path (not hand-built submissions).
  const submitted = resolveAlchemySubmissions([source], components, ['emberroot', 'springwater', 'springwater']);
  assert.equal(submitted.length, 3, 'the bench resolved to three owned unit-submissions');

  let crafted = null;
  engine.craft = async (craftingActor, sources, chosenRecipe, ingredientSetId, options) => {
    crafted = { chosenRecipe, ingredientSetId, options };
    return { success: true, results: [{}], message: '' };
  };

  const result = await engine.craftAlchemy(actor, [source], submitted, {
    craftingSystemId: 'sys-a',
    signatureValidator: validator,
    interactive: true,
  });

  assert.equal(result.success, true, 'the brew matched instead of fizzling');
  assert.equal(crafted.chosenRecipe.id, 'vigor', 'the matched recipe is crafted (discover -> consume -> produce)');
  assert.equal(crafted.options.isAlchemyAttempt, true, 'flagged so learnRecipeOnCraft runs');
});

test('a genuine no-match records the dead-end key resolved from realistic owned items', async () => {
  const components = [component('emberroot', 'Item.ember'), component('springwater', 'Item.spring')];
  const vigor = recipe('vigor', [group('emberroot', 1), group('springwater', 2)]);
  const { engine, validator } = setup([vigor], components);

  const actor = new FakeActor();
  const source = { items: [ownedItem('Actor.x.Item.e1', 'Item.ember', 4)] };
  // Bench = emberroot x1 only -> matches no recipe (vigor also needs springwater x2).
  const submitted = resolveAlchemySubmissions([source], components, ['emberroot']);
  assert.equal(submitted.length, 1);

  const result = await engine.craftAlchemy(actor, [source], submitted, {
    craftingSystemId: 'sys-a',
    signatureValidator: validator,
  });

  assert.equal(result.disposition, 'no-match');
  // The multiset resolved from the realistic item's source refs -> a real key.
  assert.deepEqual(actor.getFlag('fabricate', 'fabricate.alchemyDeadEnds'), { 'sys-a': ['emberroot:1'] });
});
