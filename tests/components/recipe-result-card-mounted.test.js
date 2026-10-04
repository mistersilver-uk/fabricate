/**
 * `RecipeResultGroupCard` renders every result through `PickerRow` (issue 1516): the hooks the
 * retired row carried, keying by entry identity, the rolled-amount error and the Fixed | Rolled
 * round trip through the card's own `onChange`; and its `Result` adder and offered kinds (1773).
 */
import assert from 'node:assert/strict';
import { resolve } from 'node:path';
import { after, afterEach, before, describe, it } from 'node:test';

import { recipeResultKinds } from '../../src/ui/svelte/apps/manager/recipe/resultRows.js';
import { missingCensusHooks } from '../helpers/resultRowCensus.js';
import { seededRollClass, withRoll } from '../helpers/seededRoll.js';
import { chooseSelectOption, selectOptionValues } from '../helpers/select-control.js';
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

/** Every kind a recipe result set can offer: currency on with a unit, and knowledge observable. */
const ALL_KINDS = recipeResultKinds({
  componentOptions: COMPONENTS,
  currencyUnits: [{ id: 'gp', label: 'Gold' }],
  currencyEnabled: true,
  recipeOptions: [{ id: 'r-sword', name: 'Forge Sword' }],
  knowledgeObservable: true,
});

const ADDER = '[data-recipe-add="result-item"]';
const nameField = (row) => row.querySelector('[data-recipe-option-search]');

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

describe('RecipeResultGroupCard: the Result adder', () => {
  it('appends an empty component row when one kind is offered, and focuses its name field', async () => {
    const { target, groups } = await mountCard([
      { id: 'r1', componentId: 'cmp-herb', quantity: 1, quantityFormula: '1d4+1' },
    ]);
    const adder = target.querySelector(ADDER);
    assert.equal(adder.textContent.trim(), 'Result');
    assert.ok(!adder.hasAttribute('aria-haspopup'), 'one kind needs no menu');
    adder.click();
    await settle();
    await settle();
    const [kept, added] = groups.at(-1).results;
    assert.deepEqual(kept, {
      id: 'r1',
      componentId: 'cmp-herb',
      quantity: 1,
      quantityFormula: '1d4+1',
    });
    assert.ok(added.id, 'with an eager id');
    assert.deepEqual({ ...added, id: 'x' }, { id: 'x', componentId: null, quantity: 1 });
    assert.ok(
      target.ownerDocument.activeElement === nameField(rows(target)[1]),
      'the new row’s name field takes focus'
    );
  });

  it('a progressive stage appends unnamed too, and offers component alone', async () => {
    const { target, groups } = await mountCard([{ id: 's1', componentId: 'cmp-herb' }], {
      progressive: true,
      resultKinds: ALL_KINDS,
    });
    const adder = target.querySelector(ADDER);
    assert.equal(adder.textContent.trim(), 'Add result stage');
    adder.click();
    await settle();
    assert.deepEqual(
      groups.at(-1).results.map(({ componentId }) => componentId),
      ['cmp-herb', null]
    );
  });

  it('opens “Add a result” over every offered kind, and the chosen kind’s empty row takes focus', async () => {
    const { target, groups } = await mountCard([], { resultKinds: ALL_KINDS });
    const adder = target.querySelector(ADDER);
    assert.equal(adder.getAttribute('aria-haspopup'), 'menu');
    adder.click();
    await settle();
    const doc = target.ownerDocument;
    assert.equal(
      doc
        .querySelector(':scope .manager-recipe-result-menu .manager-action-menu-heading')
        .textContent.trim(),
      'Add a result'
    );
    const entries = [
      ...doc.querySelectorAll(':scope .manager-recipe-result-menu [role="menuitem"]'),
    ];
    assert.deepEqual(
      entries.map((entry) => [entry.getAttribute('data-recipe-add'), entry.textContent.trim()]),
      [
        ['result-component', 'Component'],
        ['result-currency', 'Currency'],
        ['result-knowledge', 'Recipe knowledge'],
      ]
    );
    entries[2].click();
    await settle();
    await settle();
    const [added] = groups.at(-1).results;
    assert.deepEqual(
      { ...added, id: 'x' },
      { id: 'x', kind: 'knowledge', recipeId: '', quantity: 1 }
    );
    const field = nameField(rows(target)[0]);
    assert.equal(field.getAttribute('aria-label'), 'Search recipes…');
    assert.ok(doc.activeElement === field, 'focus lands on the new row, not back on the trigger');
  });
});

describe('RecipeResultGroupCard: what a result row offers', () => {
  const KIND_TRIGGER = '.fabricate-select-trigger[data-recipe-option-kind]';

  it('a flat row offers the set’s kinds, and a stage component alone', async () => {
    const { target } = await mountCard([{ id: 'r1', componentId: 'cmp-herb', quantity: 1 }], {
      resultKinds: ALL_KINDS,
    });
    assert.deepEqual(selectOptionValues(target, KIND_TRIGGER), [
      'component',
      'currency',
      'knowledge',
    ]);
    harness.remount();
    const stage = await mountCard([{ id: 's1', componentId: 'cmp-herb' }], {
      progressive: true,
      resultKinds: ALL_KINDS,
    });
    assert.deepEqual(selectOptionValues(stage.target, KIND_TRIGGER), ['component']);
  });

  it('retyping a row writes its kind and clears the old value', async () => {
    const { target, groups } = await mountCard(
      [{ id: 'r1', componentId: 'cmp-herb', quantity: 3 }],
      {
        resultKinds: ALL_KINDS,
      }
    );
    chooseSelectOption(target, KIND_TRIGGER, 'currency');
    await settle();
    assert.deepEqual(groups.at(-1).results, [
      { id: 'r1', kind: 'currency', unit: '', quantity: 3 },
    ]);
  });

  it('draws an authored currency result read-only once the system’s currency is off', async () => {
    const off = recipeResultKinds({
      componentOptions: COMPONENTS,
      currencyUnits: [{ id: 'gp', label: 'Gold' }],
      currencyEnabled: false,
    });
    assert.deepEqual(off.kinds, ['component'], 'currency is no longer offered');
    const { target } = await mountCard([{ id: 'c1', kind: 'currency', unit: 'gp', quantity: 5 }], {
      resultKinds: off,
    });
    assert.ok(rows(target)[0].querySelector('[data-recipe-currency-readonly]'));
  });
});
