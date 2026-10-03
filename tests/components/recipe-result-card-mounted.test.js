/**
 * `RecipeResultGroupCard` renders every result through `PickerRow` (issue 1516): the hooks the
 * retired row carried, keying by entry identity, the result creators' shape, the rolled-amount
 * error and the Fixed | Rolled round trip through the card's own `onChange`.
 */
import assert from 'node:assert/strict';
import { resolve } from 'node:path';
import { after, afterEach, before, describe, it } from 'node:test';

import { toValue } from '../../src/ui/svelte/apps/manager/recipe/pickerRowKinds.js';
import { missingCensusHooks } from '../helpers/resultRowCensus.js';
import { seededRollClass, withRoll } from '../helpers/seededRoll.js';
import {
  createMountedComponentHarness,
  RESULT_ROW_COMPILED_MODULES,
  RESULT_ROW_RAW_MODULES,
  SEARCHABLE_POPOVER_RAW_MODULES,
  SELECT_COMPILED_MODULES,
  TYPEAHEAD_RUNE_MODULES,
} from '../helpers/svelte-component-harness.js';

const CARD_PATH = 'src/ui/svelte/apps/manager/recipe/RecipeResultGroupCard.svelte';

const harness = createMountedComponentHarness({
  repoRoot: resolve(import.meta.dirname, '../..'),
  tmpPrefix: 'fabricate-result-card-',
  rawModules: [
    ...SEARCHABLE_POPOVER_RAW_MODULES,
    ...RESULT_ROW_RAW_MODULES,
    'src/ui/model/complicationSummary.js',
  ],
  runeModules: TYPEAHEAD_RUNE_MODULES,
  compiledModules: [
    ...SELECT_COMPILED_MODULES,
    ...RESULT_ROW_COMPILED_MODULES,
    'src/ui/svelte/components/IconButton.svelte',
    'src/ui/svelte/components/RowDisclosure.svelte',
    'src/ui/svelte/components/SortableList.svelte',
    'src/ui/svelte/apps/manager/ComplicationSummaryRow.svelte',
    'src/ui/svelte/apps/manager/recipe/RecipeStageComplicationBand.svelte',
    'src/ui/svelte/apps/manager/recipe/RecipeRoutingAssignment.svelte',
    CARD_PATH,
  ],
  componentPath: CARD_PATH,
});

const COMPONENTS = Object.freeze([
  { id: 'cmp-herb', name: 'Mountain Herb', img: 'icons/herb.webp', difficulty: 12 },
  { id: 'cmp-water', name: 'Pure Water', img: 'icons/water.webp' },
]);

// Seeded answers for the amount floor: the maxima `evaluateSync({ maximize: true })` returns.
const { Roll: SEEDED_ROLL } = seededRollClass({
  maxima: { '1d4+1': 5, 0: 0 },
  unparsable: ['max(, 2)'],
});

const settle = () => new Promise((done) => setTimeout(done, 0));

/** Mount the card controlled: every emitted group is recorded and fed back as its `group`. */
async function mountCard(results, extra = {}) {
  const groups = [];
  const target = await harness.mount({
    group: { id: 'grp-1', name: 'Primary', results },
    componentOptions: COMPONENTS,
    onChange: async (next) => {
      groups.push(next);
      await harness.setProps({ group: next });
    },
    ...extra,
  });
  return { target, groups };
}

const rows = (target) => [...target.querySelectorAll('[data-recipe-result-item]')];
const radio = (row, mode) => row.querySelector(`[data-recipe-option-amount-mode="${mode}"] input`);

async function choose(input) {
  input.checked = true;
  input.dispatchEvent(new globalThis.window.Event('change', { bubbles: true }));
  await settle();
}

async function type(field, text) {
  field.focus();
  field.value = text;
  field.dispatchEvent(new globalThis.window.Event('input', { bubbles: true }));
  await settle();
}

async function pickResult(target, label) {
  target.querySelector('[data-recipe-add="result-item"]').click();
  await settle();
  [...document.querySelectorAll('.manager-travel-option')]
    .find((option) => option.textContent.includes(label))
    .click();
  await settle();
}

before(() => harness.setup());
after(() => harness.teardown());
afterEach(() => harness.remount());

describe('RecipeResultGroupCard: the retired row’s hooks', () => {
  it('a flat row answers every censused hook, and its remove and stepper change the DOM', async () => {
    const { target, groups } = await mountCard([
      { id: 'r1', componentId: 'cmp-herb', quantity: 2 },
      { id: 'r2', componentId: 'cmp-water', quantity: 1 },
    ]);
    for (const row of rows(target)) assert.deepEqual(missingCensusHooks(row, 'flat'), []);

    rows(target)[0].querySelector('[data-stepper-increment]').click();
    await settle();
    assert.equal(rows(target)[0].querySelector('[data-recipe-option-quantity]').value, '3');
    rows(target)[0].querySelector('[data-recipe-remove="result-item"]').click();
    await settle();
    assert.deepEqual(
      rows(target).map((row) =>
        row.querySelector('[data-recipe-option-chosen]').textContent.trim()
      ),
      ['Pure Water']
    );
    assert.deepEqual(groups.at(-1).results, [{ id: 'r2', componentId: 'cmp-water', quantity: 1 }]);
  });

  it('a progressive stage row answers every censused hook, and draws no amount or remove of its own', async () => {
    const opened = [];
    const { target } = await mountCard([{ id: 's1', componentId: 'cmp-herb' }], {
      progressive: true,
      onOpenComponent: (id) => {
        opened.push(id);
      },
    });
    const [row] = rows(target);
    assert.deepEqual(missingCensusHooks(row, 'stage'), []);
    assert.equal(row.querySelector('[data-recipe-result-difficulty]').textContent.trim(), 'DC 12');
    assert.ok(!row.querySelector('[data-stepper-input]'), 'a stage awards one');
    assert.ok(!row.querySelector('[data-recipe-option-amount-mode]'), 'and is never rolled');
    assert.ok(!row.querySelector('[data-recipe-remove]'), 'the list’s own delete trails it');
    row.querySelector('[data-recipe-result-edit]').click();
    assert.deepEqual(opened, ['cmp-herb']);
  });

  it('a progressive stage swaps its component in place, and its delete is named for it', async () => {
    const { target, groups } = await mountCard(
      [
        { id: 's1', componentId: 'cmp-herb' },
        { id: 's2', componentId: 'cmp-water' },
      ],
      { progressive: true }
    );
    const deletes = () => [
      ...target.querySelectorAll(
        ':scope [data-recipe-result-row] [data-recipe-remove="result-item"]'
      ),
    ];
    assert.deepEqual(
      deletes().map((button) => button.getAttribute('aria-label')),
      ['Remove Mountain Herb', 'Remove Pure Water']
    );

    rows(target)[0].querySelector('[data-recipe-option-clear]').click();
    await settle();
    await type(rows(target)[0].querySelector('[data-recipe-option-search]'), 'water');
    target.ownerDocument.querySelector('[data-recipe-option-suggestion="cmp-water"]').click();
    await settle();
    assert.deepEqual(
      groups.at(-1).results.map(({ id, componentId }) => [id, componentId]),
      [
        ['s1', 'cmp-water'],
        ['s2', 'cmp-water'],
      ],
      'the first stage keeps its id and its place in the order'
    );
    assert.equal(deletes()[0].getAttribute('aria-label'), 'Remove Pure Water');
  });
});

describe('RecipeResultGroupCard: Fixed | Rolled through the card', () => {
  it('Rolled opened and left empty forwards nothing; a typed formula, then Fixed, keeps quantity', async () => {
    const { target, groups } = await mountCard([
      { id: 'r1', componentId: 'cmp-herb', quantity: 3 },
    ]);
    await choose(radio(rows(target)[0], 'rolled'));
    assert.equal(groups.length, 0, 'the draft stays clean');

    await type(rows(target)[0].querySelector('[data-recipe-option-formula]'), '1d4+1');
    assert.deepEqual(groups.at(-1).results, [
      { id: 'r1', componentId: 'cmp-herb', quantity: 3, quantityFormula: '1d4+1' },
    ]);
    await choose(radio(rows(target)[0], 'fixed'));
    const [fixed] = groups.at(-1).results;
    assert.equal(Object.hasOwn(fixed, 'quantityFormula'), false, 'Fixed removes the key');
    assert.equal(fixed.quantity, 3);
  });

  it('keys rows by entry identity: removing the row above leaves the survivor’s toggle its own', async () => {
    const { target, groups } = await mountCard([
      { id: 'above', componentId: 'cmp-herb', quantity: 1 },
      { id: 'survivor', componentId: 'cmp-water', quantity: 5 },
    ]);
    // The row above holds a typed expression in its own state, then goes back to Fixed.
    await choose(radio(rows(target)[0], 'rolled'));
    await type(rows(target)[0].querySelector('[data-recipe-option-formula]'), '9d9');
    await choose(radio(rows(target)[0], 'fixed'));
    rows(target)[0].querySelector('[data-recipe-remove="result-item"]').click();
    await settle();
    const seen = groups.length;

    const [survivor] = rows(target);
    assert.ok(radio(survivor, 'fixed').checked, 'the survivor is still Fixed');
    await choose(radio(survivor, 'rolled'));
    assert.equal(groups.length, seen, 'nothing forwarded: no other row’s expression leaked in');
    assert.equal(survivor.querySelector('[data-recipe-option-formula]').value, '');
  });

  it('shows the floor’s error on an unrollable or never-positive formula, and none on a good one', () =>
    withRoll(SEEDED_ROLL, async () => {
      const { target } = await mountCard([
        { id: 'bad', componentId: 'cmp-herb', quantity: 1, quantityFormula: 'max(, 2)' },
        { id: 'zero', componentId: 'cmp-water', quantity: 1, quantityFormula: '0' },
        { id: 'good', componentId: 'cmp-herb', quantity: 1, quantityFormula: '1d4+1' },
      ]);
      const message = (row) =>
        row.querySelector('[data-recipe-option-invalid]')?.textContent.trim() ?? null;
      assert.deepEqual(rows(target).map(message), [
        'This expression cannot be rolled.',
        'This expression can never award a positive amount.',
        null,
      ]);
      const field = rows(target)[0].querySelector('[data-recipe-option-formula]');
      assert.equal(field.getAttribute('aria-invalid'), 'true');
    }));
});

describe('RecipeResultGroupCard: every result it creates names its component', () => {
  const assertResult = (item, componentId) => {
    assert.ok(Object.hasOwn(item, 'componentId'), 'componentId is written');
    assert.ok(item.id, 'with an eager id');
    assert.equal(toValue(item).id, componentId, 'and the adapters read it as a result');
  };

  it('a new flat item, and a second of a component whose row is rolled, append', async () => {
    const { target, groups } = await mountCard([
      { id: 'r1', componentId: 'cmp-herb', quantity: 1, quantityFormula: '1d4+1' },
    ]);
    await pickResult(target, 'Mountain Herb');
    assert.equal(groups.at(-1).results.length, 2, 'a rolled row is never bumped');
    assertResult(groups.at(-1).results[1], 'cmp-herb');
    assert.equal(groups.at(-1).results[1].quantity, 1);
    assert.deepEqual(groups.at(-1).results[0], {
      id: 'r1',
      componentId: 'cmp-herb',
      quantity: 1,
      quantityFormula: '1d4+1',
    });

    await pickResult(target, 'Pure Water');
    assertResult(groups.at(-1).results[2], 'cmp-water');
  });

  it('a progressive stage', async () => {
    const { target, groups } = await mountCard([{ id: 's1', componentId: 'cmp-herb' }], {
      progressive: true,
    });
    await pickResult(target, 'Pure Water');
    assertResult(groups.at(-1).results[1], 'cmp-water');
  });
});
