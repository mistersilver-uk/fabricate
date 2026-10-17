/**
 * `ProgressiveStageList` (issue 2511), the ordered stage list the recipe and salvage editors share:
 * each caller's hooks land on the same elements, `disabled` is one switch, Edit renders only for a
 * resolved component, the band follows the activity filter and the adder is the list's footer.
 */
import assert from 'node:assert/strict';
import { resolve } from 'node:path';
import { after, afterEach, before, describe, it } from 'node:test';

import { createRawSnippet } from 'svelte';

import { componentCatalogue } from '../../src/ui/svelte/components/resultRows.js';
import {
  createMountedComponentHarness,
  RESULT_ROW_COMPILED_MODULES,
  RESULT_ROW_RAW_MODULES,
  SEARCHABLE_POPOVER_RAW_MODULES,
  SELECT_COMPILED_MODULES,
  TYPEAHEAD_RUNE_MODULES,
} from '../helpers/svelte-component-harness.js';

const LIST_PATH = 'src/ui/svelte/apps/manager/ProgressiveStageList.svelte';

const harness = createMountedComponentHarness({
  repoRoot: resolve(import.meta.dirname, '../..'),
  tmpPrefix: 'fabricate-progressive-stage-list-',
  rawModules: [
    ...SEARCHABLE_POPOVER_RAW_MODULES,
    ...RESULT_ROW_RAW_MODULES,
    'src/ui/model/complicationSummary.js',
  ],
  runeModules: TYPEAHEAD_RUNE_MODULES,
  compiledModules: [
    ...SELECT_COMPILED_MODULES,
    ...RESULT_ROW_COMPILED_MODULES,
    'src/ui/svelte/components/RowDisclosure.svelte',
    'src/ui/svelte/components/SortableList.svelte',
    'src/ui/svelte/apps/manager/ComplicationSummaryRow.svelte',
    'src/ui/svelte/apps/manager/StageComplicationList.svelte',
    LIST_PATH,
  ],
  componentPath: LIST_PATH,
});

const COMPONENTS = Object.freeze([
  {
    id: 'cmp-herb',
    name: 'Mountain Herb',
    difficulty: 12,
    complications: [{ id: 'cx-craft', name: 'Scorched', activities: { crafting: true } }],
  },
  {
    id: 'cmp-dust',
    name: 'Dust',
    complications: [{ id: 'cx-salvage', name: 'Choking cloud', activities: { salvage: true } }],
  },
]);
const STAGES = Object.freeze([
  { id: 'st-1', componentId: 'cmp-herb' },
  { id: 'st-2', componentId: 'cmp-dust' },
]);
const ADDER = createRawSnippet(() => ({
  render: () => '<button type="button" data-test-adder>Add</button>',
}));

/** The recipe card's wiring, overridable per test. */
const RECIPE = Object.freeze({
  activity: 'crafting',
  recipeItemHook: true,
  rowData: () => ({ 'data-recipe-result-row': '' }),
  removeData: () => ({ 'data-recipe-remove': 'result-item' }),
  difficultyDataAttr: 'data-recipe-result-difficulty',
  editDataAttr: 'data-recipe-result-edit',
});

/** The salvage editor's wiring. */
const SALVAGE = Object.freeze({
  activity: 'salvage',
  nameProps: { 'data-salvage-result-component': '' },
  rowData: (stage, index) => ({
    'data-salvage-result': stage.id,
    'data-salvage-stage': String(index + 1),
  }),
  removeData: () => ({ 'data-remove-salvage-result': '' }),
  difficultyDataAttr: 'data-salvage-result-difficulty',
  editDataAttr: 'data-salvage-result-edit',
});

async function mountList(wiring, extra = {}) {
  const calls = [];
  const record =
    (name) =>
    (...args) => {
      calls.push([name, ...args]);
    };
  const target = await harness.mount({
    items: STAGES,
    componentOptions: COMPONENTS,
    catalogue: componentCatalogue(COMPONENTS),
    itemLabel: (stage) => COMPONENTS.find((c) => c.id === stage.componentId)?.name || '',
    dcLabel: 'DC',
    dcUnsetLabel: 'No difficulty',
    editLabel: 'Edit',
    onOpenComponent: record('open'),
    onRemove: (stage) => record('remove')(stage.id),
    onReorder: record('move'),
    ...wiring,
    ...extra,
  });
  return { target, calls };
}

const rows = (target) => [
  ...target.querySelectorAll(':scope > ul > li.fabricate-sortable-list-row'),
];

before(() => harness.setup());
after(() => harness.teardown());
afterEach(() => harness.remount());

describe('ProgressiveStageList: each caller’s hooks', () => {
  it('RED: the recipe hooks land on the row, the picker, the delete, the DC and Edit', async () => {
    const { target } = await mountList(RECIPE);
    const root = target.firstElementChild;
    assert.ok(root.matches('ul.fabricate-sortable-list'), 'the root is the shared list’s own <ul>');
    const [first, second] = rows(target);
    assert.ok(first.matches('.manager-progressive-stage-row[data-recipe-result-row]'));
    assert.ok(first.querySelector('[data-recipe-option][data-recipe-result-item]'));
    assert.ok(
      first.querySelector('.fabricate-sortable-list-remove[data-recipe-remove="result-item"]')
    );
    const dc = first.querySelector('.manager-progressive-stage-dc');
    assert.equal(dc.getAttribute('data-recipe-result-difficulty'), '12');
    assert.equal(dc.textContent.trim(), 'DC 12');
    const edit = first.querySelector('.manager-progressive-stage-edit');
    assert.equal(edit.getAttribute('data-recipe-result-edit'), 'cmp-herb');
    assert.equal(edit.getAttribute('data-keyboard-focus'), 'true');
    assert.equal(
      second
        .querySelector('[data-recipe-result-difficulty]')
        .getAttribute('data-recipe-result-difficulty'),
      '',
      'a component with no difficulty reads unset'
    );
    assert.equal(
      second.querySelector('.manager-progressive-stage-dc').textContent.trim(),
      'No difficulty'
    );
    assert.ok(!target.querySelector('[data-salvage-result], [data-salvage-result-component]'));
  });

  it('RED: the salvage hooks land on the same elements, the stage numbered from 1', async () => {
    const { target, calls } = await mountList(SALVAGE);
    const [first, second] = rows(target);
    assert.equal(first.getAttribute('data-salvage-result'), 'st-1');
    assert.equal(second.getAttribute('data-salvage-stage'), '2');
    assert.ok(first.querySelector('[data-salvage-result-component]'));
    assert.ok(!first.querySelector('[data-recipe-result-item]'), 'the recipe hook is the recipe’s');
    assert.ok(first.querySelector('.fabricate-sortable-list-remove[data-remove-salvage-result]'));
    assert.equal(
      first
        .querySelector('.manager-progressive-stage-dc')
        .getAttribute('data-salvage-result-difficulty'),
      '12'
    );
    second
      .querySelector('.manager-progressive-stage-edit[data-salvage-result-edit="cmp-dust"]')
      .click();
    first.querySelector('[data-remove-salvage-result]').click();
    first.querySelector('[data-sortable-move="down"]').click();
    assert.deepEqual(calls, [
      ['open', 'cmp-dust'],
      ['remove', 'st-1'],
      ['move', 0, 1],
    ]);
  });
});

describe('ProgressiveStageList: disabled', () => {
  it('RED: blocks reorder, the picker, the delete and Edit', async () => {
    const { target } = await mountList(SALVAGE, { disabled: true });
    const [first] = rows(target);
    assert.ok(!first.querySelector('[data-sortable-grip], [data-sortable-move]'), 'no reorder');
    assert.ok(first.querySelector('[data-remove-salvage-result]').disabled, 'the delete');
    assert.ok(first.querySelector('.manager-progressive-stage-edit').disabled, 'Edit');
    const pickerControls = [
      ...first.querySelectorAll(':scope [data-recipe-option] :is(input, button)'),
    ].filter((control) => !control.closest('.manager-recipe-option-controls'));
    assert.ok(pickerControls.length > 0, 'the picker draws controls');
    assert.ok(
      pickerControls.every((control) => control.disabled),
      'every picker control'
    );
  });

  it('GUARD: enabled, every one of them is live', async () => {
    const { target } = await mountList(SALVAGE);
    const [first] = rows(target);
    assert.ok(first.querySelector('[data-sortable-grip]'));
    assert.ok(!first.querySelector('[data-remove-salvage-result]').disabled);
    assert.ok(!first.querySelector('.manager-progressive-stage-edit').disabled);
  });
});

describe('ProgressiveStageList: Edit, band and adder', () => {
  // Salvage used to draw a dead Edit link with an empty name here (issue 2511's one deviation).
  it('RED: hides Edit for a stage whose component resolves to no option', async () => {
    const { target } = await mountList(SALVAGE, {
      items: [{ id: 'st-gone', componentId: 'cmp-deleted' }],
    });
    const [row] = rows(target);
    assert.ok(!row.querySelector('.manager-progressive-stage-edit, [data-salvage-result-edit]'));
    assert.equal(
      row
        .querySelector('[data-salvage-result-difficulty]')
        .getAttribute('data-salvage-result-difficulty'),
      ''
    );
  });

  it('RED: has-band and the body follow the activity filter', async () => {
    for (const [wiring, banded] of [
      [RECIPE, 'cmp-herb'],
      [SALVAGE, 'cmp-dust'],
    ]) {
      const { target } = await mountList(wiring);
      for (const row of rows(target)) {
        const owner = row
          .querySelector('[data-stage-complications]')
          ?.getAttribute('data-stage-complications');
        const hasBand = row.classList.contains('has-band');
        assert.equal(hasBand, Boolean(owner), 'the band and the body agree');
        assert.equal(
          hasBand,
          row.querySelector('.manager-progressive-stage-edit').getAttribute(wiring.editDataAttr) ===
            banded
        );
      }
      harness.remount();
    }
  });

  it('RED: the adder is the list’s footer <li> with the caller’s class', async () => {
    const { target } = await mountList(RECIPE, {
      adder: ADDER,
      adderClass: 'manager-recipe-ingredient-set-add',
    });
    const footer = target.querySelector(':scope > ul > li:last-child');
    assert.ok(
      footer.matches('li.manager-recipe-ingredient-set-add:not(.fabricate-sortable-list-row)')
    );
    assert.ok(footer.querySelector('[data-test-adder]'));
  });

  it('GUARD: with no adder the list draws no footer', async () => {
    const { target } = await mountList(RECIPE);
    assert.equal(target.querySelectorAll(':scope > ul > li').length, STAGES.length);
  });
});
