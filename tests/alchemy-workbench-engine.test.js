/**
 * CraftingEngine.craftAlchemy — the player-workbench additions:
 *   - the tried-dead-end memory write on a fizzle (shape, gating, dedup);
 *   - the signature-key DRIFT guard (engine write == shared helper the store uses);
 *   - the discovery routing (a matched brew delegates to craft() as an alchemy
 *     attempt so learnRecipeOnCraft/consume/produce run, honouring `interactive`).
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
const { canonicalSignatureKey } = await import('../src/utils/alchemySignatureKey.js');

// ---------------------------------------------------------------------------
// FakeDocument flag store (doubly-nested, matching setFabricateFlag), per
// tests/alchemy-mode.test.js.
// ---------------------------------------------------------------------------

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
  constructor(flagsArg = {}) {
    this._flags = { fabricate: flagsArg };
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

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

function component(id, sourceUuid) {
  return { id, name: id, sourceItemUuid: sourceUuid, sourceUuid };
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

function system(alchemyCfg, components) {
  return {
    id: 'sys-a',
    resolutionMode: 'alchemy',
    alchemy: { learnOnCraft: true, consumeOnFail: false, ...alchemyCfg },
    components,
    features: {},
  };
}

function submissions(sourceUuid, count) {
  return Array.from({ length: count }, () => ({ uuid: sourceUuid, name: sourceUuid, sourceUuid }));
}

function setup(alchemyCfg, { recipes, components }) {
  const sys = system(alchemyCfg, components);
  game.fabricate.getCraftingSystemManager = () => ({ getSystem: (id) => (id === 'sys-a' ? sys : null) });
  const validator = new SignatureValidator({
    getSystem: () => sys,
    getRecipesForSystem: () => recipes,
    getComponentsForSystem: () => components,
  });
  const engine = new CraftingEngine({ getRecipes: () => recipes });
  return { engine, validator };
}

// ---------------------------------------------------------------------------
// Dead-end memory
// ---------------------------------------------------------------------------

test('a fizzle records the canonical dead-end key per system when showAttemptHistoryToPlayers is on', async () => {
  const components = [component('ash', 'Item.ash'), component('ember', 'Item.ember')];
  const { engine, validator } = setup(
    { showAttemptHistoryToPlayers: true },
    { recipes: [recipe('firebomb', [group('ember', 2)])], components }
  );
  const actor = new FakeActor({});
  const result = await engine.craftAlchemy(actor, [{ items: [] }], submissions('Item.ash', 2), {
    craftingSystemId: 'sys-a',
    signatureValidator: validator,
  });

  assert.equal(result.disposition, 'no-match');
  const stored = actor.getFlag('fabricate', 'fabricate.alchemyDeadEnds');
  assert.deepEqual(stored, { 'sys-a': ['ash:2'] });
});

test('NO dead-end is written when showAttemptHistoryToPlayers is off', async () => {
  const components = [component('ash', 'Item.ash'), component('ember', 'Item.ember')];
  const { engine, validator } = setup(
    { showAttemptHistoryToPlayers: false },
    { recipes: [recipe('firebomb', [group('ember', 2)])], components }
  );
  const actor = new FakeActor({});
  await engine.craftAlchemy(actor, [{ items: [] }], submissions('Item.ash', 2), {
    craftingSystemId: 'sys-a',
    signatureValidator: validator,
  });
  assert.equal(actor.getFlag('fabricate', 'fabricate.alchemyDeadEnds'), undefined);
});

test('re-brewing the same fizzle does not duplicate the dead-end key (append-only, deduped)', async () => {
  const components = [component('ash', 'Item.ash'), component('ember', 'Item.ember')];
  const { engine, validator } = setup(
    { showAttemptHistoryToPlayers: true },
    { recipes: [recipe('firebomb', [group('ember', 2)])], components }
  );
  const actor = new FakeActor({});
  const opts = { craftingSystemId: 'sys-a', signatureValidator: validator };
  await engine.craftAlchemy(actor, [{ items: [] }], submissions('Item.ash', 2), opts);
  await engine.craftAlchemy(actor, [{ items: [] }], submissions('Item.ash', 2), opts);
  assert.deepEqual(actor.getFlag('fabricate', 'fabricate.alchemyDeadEnds'), { 'sys-a': ['ash:2'] });
});

test('DRIFT guard: the engine dead-end write uses the SAME canonical key the store helper produces', async () => {
  const components = [component('ash', 'Item.ash'), component('quick', 'Item.quick'), component('ember', 'Item.ember')];
  const { engine, validator } = setup(
    { showAttemptHistoryToPlayers: true },
    { recipes: [recipe('firebomb', [group('ember', 2)])], components }
  );
  const actor = new FakeActor({});
  const submitted = [...submissions('Item.ash', 2), ...submissions('Item.quick', 1)];
  await engine.craftAlchemy(actor, [{ items: [] }], submitted, {
    craftingSystemId: 'sys-a',
    signatureValidator: validator,
  });
  const [written] = actor.getFlag('fabricate', 'fabricate.alchemyDeadEnds')['sys-a'];
  // The store's mode helper and the builder projection both route through
  // canonicalSignatureKey (proven in their own suites); asserting the engine
  // write equals it closes the three-way drift loop.
  assert.equal(written, canonicalSignatureKey({ ash: 2, quick: 1 }));
});

// ---------------------------------------------------------------------------
// Discovery routing
// ---------------------------------------------------------------------------

test('a matched brew delegates to craft() as an alchemy attempt, honouring `interactive`', async () => {
  const components = [component('ash', 'Item.ash')];
  const matched = recipe('smoke', [group('ash', 1)]);
  const { engine, validator } = setup({ showAttemptHistoryToPlayers: true }, { recipes: [matched], components });

  let captured = null;
  engine.craft = async (craftingActor, sources, chosenRecipe, ingredientSetId, options) => {
    captured = { chosenRecipe, ingredientSetId, options };
    return { success: true, results: [], message: '' };
  };

  const actor = new FakeActor({});
  const result = await engine.craftAlchemy(actor, [{ items: [] }], submissions('Item.ash', 1), {
    craftingSystemId: 'sys-a',
    signatureValidator: validator,
    interactive: true,
  });

  assert.equal(result.success, true);
  assert.equal(captured.chosenRecipe.id, 'smoke', 'the matched recipe is crafted');
  assert.equal(captured.ingredientSetId, 'smoke-set');
  assert.equal(captured.options.isAlchemyAttempt, true, 'flagged as an alchemy attempt so learnRecipeOnCraft runs');
  assert.equal(captured.options.interactive, true, 'interactive roll flows through on the matched path');
  // No dead-end is recorded on a match.
  assert.equal(actor.getFlag('fabricate', 'fabricate.alchemyDeadEnds'), undefined);
});
