import test from 'node:test';
import assert from 'node:assert/strict';

import { CraftingEngine } from '../src/systems/CraftingEngine.js';

globalThis.foundry = {
  utils: {
    getProperty: (object, path) =>
      String(path)
        .split('.')
        .reduce((value, key) => value?.[key], object),
    setProperty: () => {},
    deepClone: (value) => JSON.parse(JSON.stringify(value)),
  },
};
globalThis.ui = { notifications: { info: () => {}, warn: () => {}, error: () => {} } };

class BonusRoll {
  constructor(formula, data) {
    this.formula = formula;
    this.data = data;
    this.dice = [];
  }

  async evaluate() {
    if (this.formula === 'bad') throw new Error('bad bonus');
    const path = String(this.formula).replace(/^@/, '');
    const resolved = path.split('.').reduce((value, key) => value?.[key], this.data);
    this.total = Number.isFinite(Number(resolved)) ? Number(resolved) : Number(this.formula);
    if (!Number.isFinite(this.total)) this.total = 10;
    return this;
  }
}

globalThis.Roll = BonusRoll;

function actor(id, system = {}) {
  return { id, system, getRollData: () => system };
}

function contribution({
  id,
  label = id,
  expression,
  value,
  enabled = true,
  owner = actor(`${id}-owner`, { value }),
  matchedItem = { parent: owner },
  prerequisites = { enabled: false, ids: [], gateMode: 'bonus' },
  prerequisiteDefinitions = [],
} = {}) {
  return {
    contributionInput: {
      tool: {
        id,
        label,
        enabled,
        prerequisites,
        bonus: { enabled: true, expression: expression ?? '@value' },
      },
      matchedItem,
      primaryActor: owner,
      prerequisiteDefinitions,
    },
  };
}

function makeEngine() {
  return new CraftingEngine({});
}

test('crafting adds each distinct eligible Tool contribution once', async () => {
  const engine = makeEngine();
  const formula = await engine._appendToolCheckBonuses('1d20', [
    contribution({ id: 'hammer', label: 'Hammer [Tool]', value: 2 }),
    contribution({ id: 'saw', label: 'Saw', value: -2 }),
    contribution({ id: 'anvil', label: 'Anvil', value: 5 }),
    contribution({ id: 'hammer', label: 'Duplicate', value: 20 }),
  ]);

  assert.equal(formula, '1d20 + 2[Hammer Tool] - 2[Saw] + 5[Anvil]');
});

test('owned and virtual contributions evaluate against their already-bound actor', async () => {
  const engine = makeEngine();
  const owner = actor('owner', { bonus: 3 });
  const primary = actor('primary', { bonus: 9 });
  const owned = contribution({
    id: 'owned',
    expression: '@bonus',
    owner: primary,
    matchedItem: { parent: owner },
  });
  const virtual = contribution({
    id: 'virtual',
    expression: '@bonus',
    owner: primary,
    matchedItem: null,
  });

  assert.equal(
    await engine._appendToolCheckBonuses('1d20', [owned, virtual]),
    '1d20 + 3[owned] + 9[virtual]'
  );
});

test('bonus-only prerequisite failure and expression errors contribute zero without crashing', async () => {
  const engine = makeEngine();
  const untrained = actor('untrained', { rank: 0, value: 7 });
  const gated = contribution({
    id: 'gated',
    owner: untrained,
    prerequisites: { enabled: true, ids: ['trained'], gateMode: 'bonus' },
    prerequisiteDefinitions: [{ id: 'trained', path: 'rank', op: 'gte', value: 2 }],
  });
  const broken = contribution({ id: 'broken', expression: 'bad', value: 4 });

  assert.equal(await engine._appendToolCheckBonuses('1d20', [gated, broken]), '1d20');
});

test('disabled Tools contribute nothing', async () => {
  const engine = makeEngine();
  const formula = await engine._appendToolCheckBonuses('1d20', [
    contribution({ id: 'enabled', value: 2 }),
    contribution({ id: 'disabled', value: 6, enabled: false }),
  ]);

  assert.equal(formula, '1d20 + 2[enabled]');
});

test('step view merges recipe and step Tool ids without policy state', () => {
  const engine = makeEngine();
  const view = engine._buildStepRecipeView(
    { toolIds: ['recipe'], toolBonusModes: { recipe: 'never' } },
    { toolIds: ['step'], toolBonusModes: { step: 'highestOnly' } }
  );

  assert.deepEqual(view.toolIds, ['recipe', 'step']);
  assert.equal('toolBonusModes' in view, false);
});

test('simple, routed, progressive, and salvage runners append Tool terms to their formulas', async () => {
  const engine = makeEngine();
  const toolItems = [contribution({ id: 'bonus', value: 2 })];
  const seen = [];
  engine._appendToolCheckBonuses = async (formula, received) => {
    seen.push({ formula, received });
    return formula;
  };
  engine._resolveSimpleCheckDc = async () => 10;

  await engine._runSimpleCheck(
    { craftingCheck: { simple: { rollFormula: 'simple' } } },
    { name: 'Recipe' },
    null,
    actor('crafter'),
    { toolItems }
  );
  await engine._runRoutedCheck(
    {
      craftingCheck: {
        routed: {
          rollFormula: 'routed',
          type: 'relative',
          relativeOutcomes: [{ id: 'pass', name: 'Pass', dc: 0, success: true }],
        },
      },
    },
    { name: 'Recipe' },
    null,
    actor('crafter'),
    { toolItems }
  );
  await engine._runProgressiveCheck(
    { craftingCheck: { progressive: { rollFormula: 'progressive' } } },
    { name: 'Recipe' },
    actor('crafter'),
    { toolItems }
  );
  await engine._runSalvageSimpleCheck(
    { rollFormula: 'salvage' },
    { name: 'Component' },
    actor('salvager'),
    { toolItems }
  );

  assert.deepEqual(
    seen.map((entry) => entry.formula),
    ['simple', 'routed', 'progressive', 'salvage']
  );
  assert.ok(seen.every((entry) => entry.received === toolItems));
});
