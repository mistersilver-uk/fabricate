/**
 * A salvage result's fixed-or-rolled amount through the real `createAdminStore` and the real
 * `CraftingSystemManager.updateItem` (issue 1516). Each edit is the payload the salvage row
 * forwards, merged by the row's own adapter (`fromValue`), and sent as the whole `salvage` object
 * the component editor sends. The dice double seeds the floor's maxima and the award's totals.
 */
import assert from 'node:assert/strict';
import { after, before, beforeEach, describe, it } from 'node:test';

import { get } from 'svelte/store';

import { CraftingEngine } from '../../src/systems/CraftingEngine.js';
import { CraftingSystemManager } from '../../src/systems/CraftingSystemManager.js';
import { resolveRolledAmount } from '../../src/systems/rolledAmountResolver.js';
import { fromValue, toValue } from '../../src/ui/svelte/apps/manager/recipe/pickerRowKinds.js';
import { createAdminStore } from '../../src/ui/svelte/stores/adminStore.js';
import { createServices } from '../helpers/adminStoreServices.js';
import { seededRollClass } from '../helpers/seededRoll.js';

const { Roll: SEEDED_ROLL } = seededRollClass({
  maxima: { '1d4+1': 5, 0: 0 },
  totals: { '1d4+1': 4 },
  unparsable: ['max(, 2)'],
});

const SYSTEM = Object.freeze({
  id: 'sys1',
  name: 'Salvage',
  features: { salvage: true },
  salvageResolutionMode: 'simple',
  salvageCraftingCheck: { simple: { rollFormula: '1d20' } },
  components: [
    {
      id: 'ore',
      name: 'Ore',
      salvage: {
        enabled: true,
        resultGroups: [
          {
            id: 'grp',
            name: 'Shards',
            results: [{ id: 'res', componentId: 'shard', quantity: 3 }],
          },
        ],
      },
    },
    { id: 'shard', name: 'Shard', difficulty: 1 },
  ],
});

/** The row's own edit: `toValue`, the forwarded change, and `fromValue` merging it back. */
const rowEdit = (result, change) => fromValue(result, { ...toValue(result), ...change });

let previous;
before(() => {
  previous = { foundry: globalThis.foundry, game: globalThis.game, Roll: globalThis.Roll };
  Object.assign(globalThis, { Roll: SEEDED_ROLL });
});
after(() => {
  Object.assign(globalThis, previous);
});

describe('a salvage result’s rolled amount through the admin store', () => {
  let manager;
  let store;
  let errors;
  let writes;

  async function loadStore(system) {
    manager = new CraftingSystemManager({ getRecipes: () => [], getRecipe: () => null });
    manager.initialized = true;
    manager.save = async () => {
      writes += 1;
    };
    manager.systems.set('sys1', manager._normalizeSystem(structuredClone(system)));
    store = createAdminStore(
      createServices(manager.getSystem('sys1'), [], [], {
        getCraftingSystemManager: () => manager,
        notify: {
          info: () => {},
          warn: () => {},
          error: (message) => {
            errors.push(message);
          },
        },
      })
    );
    await store.selectSystem('sys1');
  }

  beforeEach(async () => {
    Object.assign(globalThis, {
      foundry: { utils: { randomID: () => 'rid', deepClone: structuredClone } },
      game: {
        user: { id: 'gm', isGM: true },
        system: { id: 'generic' },
        actors: [],
        settings: { get: () => undefined, set: async () => {} },
      },
    });
    errors = [];
    writes = 0;
    await loadStore(SYSTEM);
  });

  const persisted = () =>
    structuredClone(manager.getSystem('sys1').components.find((entry) => entry.id === 'ore'));
  /** The editor's draft: the projected card's salvage, as `ComponentEditView` clones it. */
  const draftSalvage = () =>
    structuredClone(get(store.viewState).itemCards.find((card) => card.id === 'ore').salvage);
  /** The whole draft salvage with its one result replaced by the row's edit. */
  const editedSalvage = (change) => {
    const salvage = draftSalvage();
    const [group] = salvage.resultGroups;
    group.results = [rowEdit(group.results[0], change)];
    return salvage;
  };
  const savedResult = () => persisted().salvage.resultGroups[0].results[0];

  it(`'1d4+1' survives save → reload → unrelated edit → save byte for byte`, async () => {
    const salvage = editedSalvage({ quantityFormula: '1d4+1' });
    assert.equal(await store.updateComponent('ore', { salvage }), true);
    const saved = persisted();
    assert.equal(saved.salvage.resultGroups[0].results[0].quantityFormula, '1d4+1');

    // Reload: a fresh manager hydrates the persisted system, and a fresh store projects it.
    await loadStore({ ...SYSTEM, components: manager.getSystem('sys1').components });
    const updates = { category: 'metal', salvage: draftSalvage() };
    assert.equal(await store.updateComponent('ore', updates), true);
    assert.deepEqual(persisted(), { ...saved, category: 'metal' });
  });

  it('Rolled opened and left empty saves no formula key', async () => {
    const blank = editedSalvage({ quantityFormula: '' });
    assert.equal(Object.hasOwn(blank.resultGroups[0].results[0], 'quantityFormula'), false);
    assert.equal(await store.updateComponent('ore', { salvage: blank }), true);
    assert.equal(Object.hasOwn(savedResult(), 'quantityFormula'), false);
  });

  it('Rolled → Fixed removes the key and keeps quantity', async () => {
    await store.updateComponent('ore', { salvage: editedSalvage({ quantityFormula: '1d4+1' }) });
    const fixed = editedSalvage({ quantityFormula: undefined });
    assert.equal(Object.hasOwn(fixed.resultGroups[0].results[0], 'quantityFormula'), false);
    assert.equal(await store.updateComponent('ore', { salvage: fixed }), true);
    assert.equal(Object.hasOwn(savedResult(), 'quantityFormula'), false);
    assert.equal(savedResult().quantity, 3);
  });

  it('an unrollable or never-positive formula is refused and nothing is written', async () => {
    const before_ = persisted();
    for (const quantityFormula of ['max(, 2)', '0']) {
      const salvage = editedSalvage({ quantityFormula });
      assert.equal(await store.updateComponent('ore', { salvage }), false, quantityFormula);
    }
    assert.deepEqual(persisted(), before_, 'nothing was written');
    assert.equal(writes, 0);
    assert.equal(errors.length, 2, 'and each refusal told the GM');
    assert.match(errors[0], /Salvage result quantity formula cannot be rolled/);
  });

  it('a component bulk edit keeps the formula', async () => {
    await store.updateComponent('ore', { salvage: editedSalvage({ quantityFormula: '1d4+1' }) });
    const outcome = await store.applyComponentBulkEdit(['ore'], { category: 'metal' });
    assert.ok(outcome, 'the bulk edit applied');
    assert.equal(persisted().category, 'metal', 'the bulk edit landed');
    assert.equal(savedResult().quantityFormula, '1d4+1');
  });

  it('the saved payload awards a rolled amount, and a progressive stage still drops it', async () => {
    await store.updateComponent('ore', { salvage: editedSalvage({ quantityFormula: '1d4+1' }) });
    const component = persisted();
    const system = manager.getSystem('sys1');
    const engine = new CraftingEngine({}, null, null);

    const [group] = engine._resolveSalvageResultGroups(component, system, { success: true });
    const [awarded] = group.results;
    assert.equal(awarded.quantityFormula, '1d4+1', 'a simple salvage hands the formula on');
    const roll = await resolveRolledAmount(awarded, null, { Roll: SEEDED_ROLL });
    assert.deepEqual(
      { amount: roll.amount, rolled: roll.rolled },
      {
        amount: 4,
        rolled: { formula: '1d4+1', total: 4 },
      }
    );

    const progressive = {
      ...system,
      salvageResolutionMode: 'progressive',
      salvageCraftingCheck: { progressive: { rollFormula: '1d20', awardMode: 'equal' } },
    };
    const [stages] = engine._resolveSalvageResultGroups(component, progressive, { value: 5 });
    assert.equal(stages.results[0].quantityFormula, null, 'a progressive stage awards one');
  });
});
