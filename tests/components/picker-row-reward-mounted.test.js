/**
 * A reward row (issue 1773): a named currency result opens its naming body, says plainly when it
 * is empty and stays complete without it; a knowledge result draws no amount and one help line;
 * neither appears on an ingredient row; and a currency result rolls its amount as a component does.
 * A knowledge row is read-only where learning is unobservable and says so where its recipe is gone,
 * and a pick on a row with no clear moves focus on rather than dropping it.
 */
import assert from 'node:assert/strict';
import { resolve } from 'node:path';
import { after, afterEach, before, describe, it } from 'node:test';

import { fromValue, toValue } from '../../src/ui/svelte/apps/manager/recipe/pickerRowKinds.js';
import {
  createMountedComponentHarness,
  RESULT_ROW_COMPILED_MODULES,
  RESULT_ROW_RAW_MODULES,
  SEARCHABLE_POPOVER_RAW_MODULES,
  SELECT_COMPILED_MODULES,
  TYPEAHEAD_RUNE_MODULES,
} from '../helpers/svelte-component-harness.js';

const ROW_PATH = 'src/ui/svelte/apps/manager/recipe/PickerRow.svelte';

const harness = createMountedComponentHarness({
  repoRoot: resolve(import.meta.dirname, '../..'),
  tmpPrefix: 'fabricate-picker-row-reward-',
  rawModules: [...SEARCHABLE_POPOVER_RAW_MODULES, ...RESULT_ROW_RAW_MODULES],
  runeModules: TYPEAHEAD_RUNE_MODULES,
  compiledModules: [...SELECT_COMPILED_MODULES, ...RESULT_ROW_COMPILED_MODULES],
  componentPath: ROW_PATH,
});

const CATALOGUE = Object.freeze({
  component: [{ id: 'c-pelt', label: 'Balehound Pelt', icon: 'fas fa-cube' }],
  currency: [{ id: 'gp', label: 'Gold', icon: 'fa-solid fa-coins' }],
  knowledge: [{ id: 'r-sword', label: 'Forge Sword', icon: 'fa-solid fa-book-open' }],
});
const RESULT_KINDS = Object.freeze(['component', 'currency', 'knowledge']);
const GOLD = Object.freeze({ id: 'res-gold', kind: 'currency', unit: 'gp', quantity: 25 });
const LORE = Object.freeze({ id: 'res-lore', kind: 'knowledge', recipeId: 'r-sword', quantity: 1 });

const BODY = '[data-recipe-reward-body]';
const settle = () => new Promise((done) => setTimeout(done, 0));

/** Mount a result row, controlled: each forwarded value is recorded and applied back. */
async function mountReward(entry, extra = {}) {
  const values = [];
  const target = await harness.mount({
    value: toValue(entry),
    kinds: RESULT_KINDS,
    catalogue: CATALOGUE,
    rollable: true,
    reward: true,
    removeHook: 'result-item',
    onChange: async (next) => {
      values.push(next);
      await harness.setProps({ value: next });
    },
    ...extra,
  });
  return { target, values };
}

async function type(field, text) {
  field.focus();
  field.value = text;
  field.dispatchEvent(new globalThis.window.Event('input', { bubbles: true }));
  await settle();
}

const closing = (target) => target.querySelector('[data-recipe-reward-closing]').textContent.trim();

before(() => harness.setup());
after(() => harness.teardown());
afterEach(() => harness.remount());

describe('PickerRow: the currency naming body', () => {
  it('opens on a named currency result, empty and saying so, and names the reward as typed', async () => {
    const { target, values } = await mountReward(GOLD);
    const body = target.querySelector(BODY);
    assert.ok(body, 'a named currency result opens the body');
    assert.equal(body.querySelector('[data-recipe-reward-label]').value, '');
    assert.equal(body.querySelector('[data-recipe-reward-reason]').value, '');
    assert.equal(closing(target), 'No description — the player just sees Gold.');
    assert.equal(values.length, 0, 'an empty body writes nothing: the row is complete');

    await type(body.querySelector('[data-recipe-reward-label]'), 'Wages');
    assert.equal(fromValue(GOLD, values.at(-1)).label, 'Wages');
    assert.equal(closing(target), 'The player sees: Wages');

    await type(target.querySelector('[data-recipe-reward-reason]'), 'Paid for the pelts');
    assert.deepEqual(fromValue(GOLD, values.at(-1)), {
      ...GOLD,
      label: 'Wages',
      reason: 'Paid for the pelts',
    });
    assert.equal(closing(target), 'The player sees: Wages · Paid for the pelts');

    await type(target.querySelector('[data-recipe-reward-label]'), '');
    assert.ok(!Object.hasOwn(fromValue(GOLD, values.at(-1)), 'label'), 'a blank label goes');
    assert.equal(closing(target), 'The player sees: Gold · Paid for the pelts');
  });

  it('opens on no ingredient row, no unnamed currency, and no component result', async () => {
    const ingredient = { quantity: 1, match: { type: 'currency', unit: 'gp', amount: 25 } };
    const { target: cost } = await mountReward(ingredient, {
      kinds: ['component', 'tags', 'essence', 'currency'],
      rollable: false,
      reward: false,
    });
    assert.ok(cost.querySelector('[data-recipe-option-chosen]'), 'the cost is named');
    assert.ok(!cost.querySelector(BODY), 'an ingredient row never opens the body');
    harness.remount();

    const { target: unnamed } = await mountReward({ ...GOLD, unit: '' });
    assert.ok(unnamed.querySelector('[data-recipe-option-search]'), 'still searching');
    assert.ok(!unnamed.querySelector(BODY), 'the body opens because a value is picked');
    harness.remount();

    const { target: pelt } = await mountReward({ id: 'r1', componentId: 'c-pelt', quantity: 1 });
    assert.ok(!pelt.querySelector(BODY), 'a component’s name is its label');
    assert.ok(!pelt.querySelector('[data-recipe-knowledge-hint]'));
  });
});

describe('PickerRow: a currency result rolls its amount', () => {
  it('Rolled writes the expression beside the amount, which the adapter stores on the result', async () => {
    const { target, values } = await mountReward(GOLD);
    const rolled = target.querySelector(':scope [data-recipe-option-amount-mode="rolled"] input');
    assert.ok(rolled, 'a currency result draws the Fixed | Rolled toggle');
    rolled.checked = true;
    rolled.dispatchEvent(new globalThis.window.Event('change', { bubbles: true }));
    await settle();
    await type(target.querySelector('[data-recipe-option-formula]'), '1d4');
    assert.deepEqual(fromValue(GOLD, values.at(-1)), { ...GOLD, quantityFormula: '1d4' });
  });

  it('drawn read-only once currency is off, a rolled amount reads as its expression', async () => {
    const { target } = await mountReward(
      { ...GOLD, quantityFormula: '2d6' },
      { readonlyKinds: ['currency'] }
    );
    const amount = target.querySelector('[data-recipe-currency-readonly-amount]');
    assert.equal(amount.textContent.trim(), '2d6');
    assert.ok(!target.querySelector('[data-recipe-option-amount-mode]'), 'and nothing toggles');
    assert.ok(target.querySelector('[data-recipe-reward-label]').disabled, 'nor is it renamed');
  });
});

describe('PickerRow: a knowledge result', () => {
  it('draws no amount, and its help line promises no name the player could not already see', async () => {
    const { target } = await mountReward(LORE);
    assert.equal(
      target.querySelector('.manager-recipe-option-chosen-name').textContent,
      'Forge Sword'
    );
    assert.ok(!target.querySelector('[data-stepper-input]'), 'a recipe is taught once');
    assert.ok(!target.querySelector('[data-recipe-option-amount-mode]'), 'and never rolled');
    assert.ok(!target.querySelector(BODY), 'it opens no naming body');
    assert.equal(
      target.querySelector('[data-recipe-knowledge-hint]').textContent.trim(),
      'Crafting this teaches the recipe. Players see its name in the results only if they can ' +
        'already see that recipe; otherwise they see “Unknown recipe”.'
    );
  });

  it('searches recipes, and says when there is none to teach', async () => {
    const { target } = await mountReward(
      { ...LORE, recipeId: '' },
      { catalogue: { ...CATALOGUE, knowledge: [] } }
    );
    const field = target.querySelector('[data-recipe-option-search]');
    assert.equal(field.placeholder, 'No recipes to teach');
    assert.equal(field.getAttribute('aria-label'), 'Search recipes...');
    assert.ok(
      target.querySelector('.manager-recipe-option-name-field[data-recipe-option-knowledge]'),
      'the field marks its kind'
    );
  });
});

describe('PickerRow: a knowledge result its system cannot honour', () => {
  it('draws read-only where learning is not observable, its help line giving way to why', async () => {
    const { target } = await mountReward(LORE, { readonlyKinds: ['knowledge'] });
    assert.equal(
      target.querySelector('[data-recipe-knowledge-readonly]').textContent.trim(),
      'Forge Sword',
      'the taught recipe stays visible'
    );
    assert.equal(
      target.querySelector('[data-recipe-knowledge-disabled]').textContent.trim(),
      'Learning off'
    );
    assert.ok(!target.querySelector('[data-recipe-option-search]'), 'nothing to re-point');
    const hint = target.querySelector('[data-recipe-knowledge-hint]');
    assert.equal(hint.dataset.recipeKnowledgeHint, 'learning-off');
    assert.equal(
      hint.textContent.trim(),
      'Players on this system never see learned recipes, so this row cannot be awarded until a ' +
        'visibility mode that reveals learned recipes is chosen.'
    );
  });

  it('names a taught recipe its system no longer holds as missing, beside the row’s remove', async () => {
    const { target } = await mountReward({ ...LORE, recipeId: 'r-gone' });
    const face = target.querySelector('[data-recipe-option-missing="r-gone"]');
    assert.equal(
      face?.querySelector('.manager-recipe-req-tag').textContent.trim(),
      'Missing recipe'
    );
    assert.ok(!target.querySelector('[data-recipe-option-search]'), 'never an unnamed search');
    assert.ok(target.querySelector('[data-recipe-remove="result-item"]'), 'and it can be removed');
  });
});

describe('PickerRow: what a reward row’s fields are described by', () => {
  it('describes the naming body’s fields by its closing line, and a knowledge field by its help', async () => {
    const { target } = await mountReward(GOLD);
    const closingLine = target.querySelector('[data-recipe-reward-closing]');
    for (const field of ['label', 'reason']) {
      const input = target.querySelector(`[data-recipe-reward-${field}]`);
      assert.equal(input.getAttribute('aria-describedby'), closingLine.id, field);
    }
    assert.ok(closingLine.id, 'the closing line carries an id');
    harness.remount();

    const { target: lore } = await mountReward({ ...LORE, recipeId: '' });
    const help = lore.querySelector('[data-recipe-knowledge-hint]');
    const search = lore.querySelector('[data-recipe-option-search]');
    assert.ok(help.id, 'the help line carries an id');
    assert.equal(search.getAttribute('aria-describedby'), help.id);
  });
});

describe('PickerRow: a pick on a row with no clear', () => {
  async function pick(entry, query) {
    const mounted = await mountReward(entry, { clearable: false });
    await type(mounted.target.querySelector('[data-recipe-option-search]'), query);
    const doc = mounted.target.ownerDocument;
    doc.querySelector('[data-recipe-option-suggestion]').click();
    await settle();
    await settle();
    return { ...mounted, active: doc.activeElement };
  }

  it('moves focus to the amount toggle, else the row’s next control, never the document', async () => {
    const { target, active } = await pick({ id: 'r1', componentId: null, quantity: 1 }, 'Bale');
    assert.ok(target.querySelector('[data-recipe-option-chosen]'), 'PRE-CONDITION: named');
    assert.ok(
      active === target.querySelector(':scope [data-recipe-option-amount-mode] input:checked'),
      'a component lands on its Fixed | Rolled toggle'
    );
    harness.remount();

    const lore = await pick({ ...LORE, recipeId: '' }, 'Forge');
    assert.ok(
      lore.active === lore.target.querySelector('[data-recipe-remove="result-item"]'),
      'a knowledge row, with no amount and no body, lands on its next control'
    );
  });
});
