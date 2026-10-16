/**
 * A salvage result's rolled amount (issue 1516): the component save refuses a formula that fails
 * the amount floor, and a salvage refuses one the salvaging character's roll data breaks before
 * anything is consumed. A progressive salvage reads neither, because its award drops the formula.
 */
import assert from 'node:assert/strict';
import test from 'node:test';

import { CraftingSystemManager } from '../src/systems/CraftingSystemManager.js';
import { salvageResultAmountErrors, validateSalvage } from '../src/systems/rolledAmountResolver.js';

import { salvageProbe } from './helpers/craftPipelineProbe.js';
import { rollDataRollClass, seededRollClass, withRoll } from './helpers/seededRoll.js';

const { Roll: DATA_ROLL } = rollDataRollClass();

/** One salvage of a single ore that yields shards whose amount rolls `formula`, after `fixed`. */
function rolledSalvage(formula, rollData, fixed = []) {
  const world = salvageProbe({
    resultGroups: [
      {
        id: 'grp',
        name: 'Shards',
        results: [
          ...fixed,
          { id: 'res', componentId: 'shard', quantity: 1, quantityFormula: formula },
        ],
      },
    ],
  });
  world.actor.getRollData = () => rollData;
  return world;
}

const effects = (world) => world.journal.entries.map(([name]) => name);

test('1516: a salvage amount the character breaks is refused before anything is consumed', async () => {
  await withRoll(DATA_ROLL, async () => {
    const world = rolledSalvage('1d4 + @name', { name: 'Elf' });
    const result = await world.salvage();

    assert.equal(result.success, false);
    assert.equal(result.misconfigured, true, 'a refusal, never a rolled failure');
    assert.match(result.message, /cannot be rolled for this character/);
    assert.deepEqual(effects(world), ['returned'], 'no consumption, award or card');
    assert.equal(world.sourceItem.system.quantity, 3, 'the ore is all still there');
  });
});

test('1516: the same salvage consumes and awards the rolled amount for a character it reads', async () => {
  await withRoll(DATA_ROLL, async () => {
    const world = rolledSalvage('1d4 + @name', { name: 2 });
    const result = await world.salvage();

    assert.equal(result.success, true, result.message);
    assert.ok(effects(world).includes('item.update'), 'the ore is consumed');
    // The double rolls a die at its face, so `resolveRolledAmount` awards 4 + 2, on one card
    // carrying the one roll.
    const cards = world.journal.entries.filter(([name]) => name === 'chat.create');
    assert.equal(cards.length, 1);
    assert.equal(cards[0][1].rolls, 1);
    assert.match(cards[0][1].text, /6× Shard/);
  });
});

test('1516: a set mixing a fixed and a rolled amount awards both, or refuses whole', async () => {
  const fixed = [{ id: 'fixed', componentId: 'shard', quantity: 2 }];
  await withRoll(DATA_ROLL, async () => {
    const world = rolledSalvage('1d4 + @name', { name: 2 }, fixed);
    const result = await world.salvage();
    assert.equal(result.success, true, result.message);
    const [, card] = world.journal.entries.find(([name]) => name === 'chat.create');
    assert.match(card.text, /2× Shard 6× Shard/, 'the fixed two, then the rolled six');

    const refused = rolledSalvage('1d4 + @name', { name: 'Elf' }, fixed);
    assert.equal((await refused.salvage()).success, false);
    assert.deepEqual(effects(refused), ['returned'], 'the fixed result is not awarded alone');
    assert.equal(refused.sourceItem.system.quantity, 3);
  });
});

test('1516: a salvage refuses an unrollable or never-positive amount with nothing consumed', async () => {
  const { Roll } = seededRollClass({ maxima: { 0: 0 }, unparsable: ['max(, 2)'] });
  await withRoll(Roll, async () => {
    for (const formula of ['max(, 2)', '0']) {
      const world = rolledSalvage(formula, {});
      const result = await world.salvage();
      assert.equal(result.success, false, formula);
      assert.match(result.message, /Salvage result quantity formula/, formula);
      assert.deepEqual(effects(world), ['returned'], formula);
      assert.equal(world.sourceItem.system.quantity, 3, formula);
    }
  });
});

test('1516: a progressive salvage reads no formula, and a missing Roll reports nothing', () => {
  const component = {
    salvage: { resultGroups: [{ results: [{ quantityFormula: '1d4 + @name' }] }] },
  };
  const actor = { getRollData: () => ({ name: 'Elf' }) };
  const accepting = { validateSalvage: () => ({ valid: true, errors: [] }) };
  return withRoll(DATA_ROLL, () => {
    const routed = { component, system: { salvageResolutionMode: 'routed' }, actor };
    assert.equal(validateSalvage(routed, accepting).valid, false);
    const progressive = { ...routed, system: { salvageResolutionMode: 'progressive' } };
    assert.deepEqual(validateSalvage(progressive, accepting), { valid: true, errors: [] });
    assert.deepEqual(salvageResultAmountErrors(component.salvage, undefined), []);
  });
});

/** A real manager holding one component, with `salvageResolutionMode` as given. */
function managerWith(salvageResolutionMode) {
  Object.assign(globalThis, {
    foundry: { utils: { randomID: () => 'rid', deepClone: structuredClone } },
    game: {
      user: { id: 'gm', isGM: true },
      system: { id: 'generic' },
      actors: [],
      settings: { get: () => undefined, set: async () => {} },
    },
  });
  const manager = new CraftingSystemManager({ getRecipes: () => [], getRecipe: () => null });
  manager.initialized = true;
  let saves = 0;
  manager.save = async () => {
    saves += 1;
  };
  const off = { rollFormula: '1d20' };
  manager.systems.set(
    'sys1',
    manager._normalizeSystem({
      id: 'sys1',
      name: 'Salvage',
      features: { salvage: true },
      salvageResolutionMode,
      salvageCraftingCheck: { simple: off, routed: off, progressive: off },
      components: [
        { id: 'ore', name: 'Ore' },
        { id: 'shard', name: 'Shard' },
      ],
    })
  );
  return { manager, saves: () => saves };
}

const salvageWith = (quantityFormula) => ({
  enabled: true,
  resultGroups: [
    {
      id: 'grp',
      name: 'Shards',
      results: [{ id: 'res', componentId: 'shard', quantity: 2, quantityFormula }],
    },
  ],
});

const FLOOR_ROLL = seededRollClass({
  maxima: { '1d4+1': 5, 0: 0 },
  unparsable: ['max(, 2)'],
}).Roll;

test('1516: the component save refuses an unrollable or never-positive salvage amount', () =>
  withRoll(FLOOR_ROLL, async () => {
    const { manager, saves } = managerWith('simple');
    const before = structuredClone(manager.getSystem('sys1').components);
    for (const formula of ['max(, 2)', '0']) {
      await assert.rejects(
        manager.updateItem('sys1', 'ore', { salvage: salvageWith(formula) }),
        /Invalid salvage: Salvage result quantity formula/,
        formula
      );
    }
    assert.deepEqual(manager.getSystem('sys1').components, before, 'nothing was written');
    assert.equal(saves(), 0);

    const saved = await manager.updateItem('sys1', 'ore', { salvage: salvageWith('1d4+1') });
    assert.equal(saved.salvage.resultGroups[0].results[0].quantityFormula, '1d4+1');
    assert.equal(saves(), 1, 'the control: a rollable formula saves');
  }));

test('1516: a progressive salvage saves its formula unchecked, and an edit without salvage skips it', () =>
  withRoll(FLOOR_ROLL, async () => {
    const progressive = managerWith('progressive').manager;
    const staged = await progressive.updateItem('sys1', 'ore', { salvage: salvageWith('0') });
    assert.equal(staged.salvage.resultGroups[0].results[0].quantityFormula, '0');

    const { manager } = managerWith('simple');
    manager.getSystem('sys1').components[0].salvage = salvageWith('0');
    const renamed = await manager.updateItem('sys1', 'ore', { category: 'metal' });
    assert.equal(renamed.category, 'metal', 'an edit that sends no salvage is not refused by it');
  }));

test('1516: a disabled salvage is not floored, so the editor saves around an imported bad formula', () =>
  withRoll(FLOOR_ROLL, async () => {
    const { manager, saves } = managerWith('simple');
    const disabled = { ...salvageWith('max(, 2)'), enabled: false };
    manager.getSystem('sys1').components[0].salvage = disabled;
    const saved = await manager.updateItem('sys1', 'ore', { category: 'metal', salvage: disabled });
    assert.equal(saved.category, 'metal');
    assert.equal(saved.salvage.resultGroups[0].results[0].quantityFormula, 'max(, 2)');
    assert.equal(saves(), 1);
  }));
