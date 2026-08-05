/**
 * `RecipeManager.canActivateRecipe` — the ONE predicate for "activation would refuse this"
 * (issue 1010), shared by the recipe browser's `Can't enable` pill, the bulk edit panel's
 * pre-flight count and the bulk write's own per-recipe gate.
 *
 * The suite is written as an EQUIVALENCE table rather than a list of expectations, because
 * the contract is not "these fixtures are invalid" — it is that the predicate and the write
 * agree. Every case therefore runs twice against two freshly built managers: once asking
 * `canActivateRecipe`, once actually attempting `updateRecipe(id, {enabled: true})`, and the
 * two answers are asserted equal. A hardcoded expectation is asserted as well, so a case
 * that stops exercising what it names (e.g. a fixture that quietly became valid) fails
 * instead of agreeing vacuously.
 *
 * The precondition matters: the equivalence is stated for a recipe with `enabled !== true`,
 * because `updateRecipe` only runs its activation gate on a TRANSITION into the enabled
 * state. An already-enabled recipe is covered by its own case, which pins the widened
 * predicate the row's `Incomplete` pill now reads.
 *
 * The alchemy signature-collision case is load-bearing and not decoration: without it the
 * suite passes against an implementation that hands the STORED (disabled) recipe to
 * `_validateRecipeForActivation` instead of a clone with `enabled: true`, because
 * `SignatureValidator.validateSystem` filters `recipes.filter((r) => r?.enabled)` and would
 * drop the candidate out of its own scan.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

let idSeq = 0;
const settingsStore = new Map();

// The system the fixtures belong to. Only the alchemy cases flip this — signature
// uniqueness is enforced for `alchemy` alone.
let resolutionMode = 'simple';
const systemComponents = [{ id: 'comp-a', name: 'Aqua Vitae', tags: [] }];

globalThis.foundry = {
  utils: {
    randomID: () => `rid-${++idSeq}`,
    getProperty: (object, path) =>
      String(path || '')
        .split('.')
        .reduce((value, key) => value?.[key], object),
  },
};

globalThis.game = {
  user: { isGM: true },
  actors: [],
  fabricate: {
    getCraftingSystemManager: () => ({
      getSystem: (id) =>
        id === 'sys-1' ? { id, resolutionMode, components: systemComponents } : null,
    }),
  },
  settings: {
    get: (_namespace, key) => settingsStore.get(key),
    set: async (_namespace, key, value) => {
      settingsStore.set(key, value);
      return value;
    },
  },
};

globalThis.ui = { notifications: { info() {}, warn() {}, error() {} } };

const { Recipe } = await import('../src/models/Recipe.js');
const { RecipeManager } = await import('../src/systems/RecipeManager.js');

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

/** A complete, craftable recipe: one ingredient set, one populated result group. */
function completeData(overrides = {}) {
  const id = overrides.id || 'r-main';
  return {
    id,
    name: overrides.name || 'Elixir of Focus',
    craftingSystemId: 'sys-1',
    enabled: false,
    ingredientSets: [
      {
        id: `${id}-set`,
        ingredientGroups: [
          {
            id: `${id}-grp`,
            name: 'Ingredients',
            options: [{ componentId: 'comp-a', quantity: 1 }],
          },
        ],
        essences: {},
      },
    ],
    resultGroups: [
      { id: `${id}-rg`, results: [{ id: `${id}-res`, itemUuid: 'Item.result', quantity: 1 }] },
    ],
    ...overrides,
  };
}

/** Structurally VALID but incomplete: no ingredient sets and no result groups. */
function shellData(overrides = {}) {
  return {
    id: 'r-main',
    name: 'Unfinished Draft',
    craftingSystemId: 'sys-1',
    enabled: false,
    ...overrides,
  };
}

/**
 * Structurally BROKEN: outcome routing points at a result group that does not exist, which
 * `_validate` reports with `requireComplete: false` too — so this recipe fails
 * `validateStructure()` and therefore reads `incomplete: false` on the browser row while
 * still being un-enableable. This is the class `enableBlocked` exists for.
 */
function brokenData(overrides = {}) {
  return completeData({ outcomeRouting: { success: 'no-such-result-group' }, ...overrides });
}

const CASES = [
  {
    name: 'a complete recipe',
    data: () => completeData(),
    peers: () => [],
    expectValid: true,
  },
  {
    name: 'an incomplete authoring shell',
    data: () => shellData(),
    peers: () => [],
    expectValid: false,
  },
  {
    name: 'a structurally broken recipe',
    data: () => brokenData(),
    peers: () => [],
    expectValid: false,
  },
  {
    name: 'an alchemy recipe colliding with an ENABLED peer',
    mode: 'alchemy',
    data: () => completeData(),
    // The peer shares `comp-a`, so the two ingredient signatures overlap.
    peers: () => [completeData({ id: 'r-peer', name: 'Tonic of Focus', enabled: true })],
    expectValid: false,
  },
  {
    name: 'an alchemy recipe whose only collider is DISABLED',
    mode: 'alchemy',
    data: () => completeData(),
    peers: () => [completeData({ id: 'r-peer', name: 'Tonic of Focus', enabled: false })],
    expectValid: true,
  },
];

function buildManager({ data, peers, mode = 'simple' }) {
  resolutionMode = mode;
  settingsStore.clear();
  const manager = new RecipeManager();
  manager.initialized = true;
  manager.recipes.set(data.id, new Recipe(data));
  for (const peer of peers) manager.recipes.set(peer.id, new Recipe(peer));
  manager.saveCount = 0;
  manager.save = async () => {
    manager.saveCount += 1;
  };
  return manager;
}

/** Does the real write accept the enable? The other half of the equivalence. */
async function writeAcceptsEnable(manager, recipeId) {
  try {
    await manager.updateRecipe(recipeId, { enabled: true }, { notify: false, emitChange: false });
    return true;
  } catch {
    return false;
  }
}

// ---------------------------------------------------------------------------

describe('RecipeManager.canActivateRecipe agrees with the write it gates', () => {
  for (const testCase of CASES) {
    it(`${testCase.name}: the predicate and updateRecipe give the same answer`, async () => {
      const data = testCase.data();
      const setup = { data, peers: testCase.peers(), mode: testCase.mode };

      const predicted = buildManager(setup).canActivateRecipe(data.id);
      assert.equal(
        predicted.valid,
        testCase.expectValid,
        `${testCase.name} should read ${testCase.expectValid ? 'enableable' : 'blocked'}`
      );

      // A second, untouched manager so the prediction cannot have influenced the write.
      const writer = buildManager(setup);
      assert.equal(
        await writeAcceptsEnable(writer, data.id),
        predicted.valid,
        'canActivateRecipe must answer exactly what the enable write does'
      );
    });
  }
});

describe('RecipeManager.canActivateRecipe', () => {
  it('evaluates a CLONE with enabled:true and writes nothing', () => {
    const data = completeData();
    const manager = buildManager({
      data,
      peers: [completeData({ id: 'r-peer', name: 'Tonic of Focus', enabled: true })],
      mode: 'alchemy',
    });
    const stored = manager.recipes.get(data.id);
    const before = JSON.stringify(stored.toJSON());

    const result = manager.canActivateRecipe(data.id);

    assert.equal(result.valid, false, 'the enabled peer collides with the candidate');
    assert.ok(
      result.errors.some((message) => message.includes('Overlapping signatures')),
      'the refusal is the signature collision, not some other blocker'
    );
    assert.ok(manager.recipes.get(data.id) === stored, 'the stored recipe is not replaced');
    assert.equal(stored.enabled, false, 'the stored recipe is still disabled');
    assert.equal(JSON.stringify(stored.toJSON()), before, 'nothing on the stored recipe changed');
    assert.equal(manager.saveCount, 0, 'a read-only predicate never persists');
  });

  it('accepts a recipe OBJECT as well as an id', () => {
    const data = brokenData();
    const manager = buildManager({ data, peers: [] });
    const stored = manager.recipes.get(data.id);

    assert.equal(manager.canActivateRecipe(stored).valid, false);
    assert.equal(manager.canActivateRecipe(data.id).valid, false);
  });

  it('reports an unknown id as INVALID rather than throwing', () => {
    const manager = buildManager({ data: completeData(), peers: [] });

    const result = manager.canActivateRecipe('no-such-recipe');

    assert.equal(result.valid, false);
    assert.equal(result.errors.length, 1);
    assert.ok(
      !result.errors[0].includes('no-such-recipe'),
      'the message stays id-free (issue 595)'
    );
    assert.equal(result.issues.length, 1, 'the structured issues mirror the errors');
  });

  it('reads an ALREADY-ENABLED broken recipe as blocked too, which is the widened Incomplete branch', () => {
    // `updateRecipe` runs its activation gate only on a transition INTO enabled, so this
    // recipe is un-refused by the write while still carrying the same blocker. The row pill
    // splits on `enabled`, not on the predicate, and this is the branch that proves it.
    const data = brokenData({ enabled: true });
    const manager = buildManager({ data, peers: [] });

    assert.equal(manager.canActivateRecipe(data.id).valid, false);
  });

  it('separates the completeness blocker from the structural one', () => {
    const shell = buildManager({ data: shellData(), peers: [] }).canActivateRecipe('r-main');
    const broken = buildManager({ data: brokenData(), peers: [] }).canActivateRecipe('r-main');

    assert.ok(
      shell.errors.some((message) => message.includes('ingredient set')),
      'the shell is refused for incompleteness'
    );
    assert.ok(
      broken.errors.some((message) => message.includes('Outcome routing')),
      'the broken recipe is refused for its dangling routing reference'
    );
  });
});
