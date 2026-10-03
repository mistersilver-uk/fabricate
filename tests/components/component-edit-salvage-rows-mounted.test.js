/**
 * Both salvage render sites in `ComponentEditView` draw the requirement row (issue 1516): the hooks
 * the retired rows carried, the Fixed | Rolled amount on a flat row, a stage's trailing DC and Edit,
 * the adder's raise-or-append rule, every control off while saving, and a typed formula surviving
 * save and remount through the real component save path. The dice double seeds the floor's maxima.
 */
import assert from 'node:assert/strict';
import { resolve } from 'node:path';
import { after, before, describe, it } from 'node:test';

import { CraftingSystemManager } from '../../src/systems/CraftingSystemManager.js';
import {
  COMPONENT_EDIT_VIEW_COMPILED_MODULES,
  COMPONENT_EDIT_VIEW_RAW_MODULES,
  COMPONENT_EDIT_VIEW_RUNE_MODULES,
} from '../helpers/componentEditViewModules.js';
import { missingCensusHooks } from '../helpers/resultRowCensus.js';
import { seededRollClass } from '../helpers/seededRoll.js';
import { selectOptionValues } from '../helpers/select-control.js';
import { createMountedComponentHarness } from '../helpers/svelte-component-harness.js';

const harness = createMountedComponentHarness({
  repoRoot: resolve(import.meta.dirname, '../..'),
  tmpPrefix: 'fabricate-component-edit-salvage-rows-',
  rawModules: COMPONENT_EDIT_VIEW_RAW_MODULES,
  runeModules: COMPONENT_EDIT_VIEW_RUNE_MODULES,
  compiledModules: [...COMPONENT_EDIT_VIEW_COMPILED_MODULES],
  componentPath: 'src/ui/svelte/apps/manager/ComponentEditView.svelte',
});

const COMPONENTS = Object.freeze([
  { id: 'cmp-scrap', name: 'Scrap Metal', img: 'icons/scrap.webp', difficulty: 4 },
  { id: 'cmp-dust', name: 'Dust', img: 'icons/dust.webp', difficulty: 9 },
]);

const results = (...extra) => [
  { id: 'res-1', componentId: 'cmp-scrap', quantity: 2, ...extra[0] },
  { id: 'res-2', componentId: 'cmp-dust', quantity: 1 },
];
const salvageOf = (rows) => ({
  enabled: true,
  resultGroups: [{ id: 'grp-1', name: 'Scraps', results: rows }],
});

const { Roll: SEEDED_ROLL } = seededRollClass({
  maxima: { '1d4+1': 5, 0: 0 },
  unparsable: ['max(, 2)'],
});

const settle = () => new Promise((done) => setTimeout(done, 0));

function props({ mode = 'simple', rows = results(), ...rest } = {}) {
  return {
    component: { id: 'comp-gear', name: 'Gear', salvage: salvageOf(rows) },
    componentOptions: COMPONENTS,
    showSalvage: true,
    salvageResolutionMode: mode,
    ...rest,
  };
}

const flatRows = (target) => [
  ...target.querySelectorAll('[data-recipe-option][data-salvage-result]'),
];
const stageRows = (target) => [
  ...target.querySelectorAll('.fabricate-sortable-list-row[data-salvage-result]'),
];

/** Choose `name` in the open component popover, which floats in the application root. */
function chooseOption(target, name) {
  const option = [...target.querySelectorAll('.manager-travel-option')].find((button) =>
    button.textContent.includes(name)
  );
  assert.ok(Boolean(option), `the popover offers ${name}`);
  option.click();
}

/** Turn `row` to Rolled and type `formula`, as a GM does. */
async function typeRolled(row, formula) {
  const radio = row.querySelector(':scope [data-recipe-option-amount-mode="rolled"] input');
  radio.checked = true;
  radio.dispatchEvent(new globalThis.window.Event('change', { bubbles: true }));
  await settle();
  const field = row.querySelector('[data-recipe-option-formula]');
  field.value = formula;
  field.dispatchEvent(new globalThis.window.Event('input', { bubbles: true }));
  await settle();
}

describe('ComponentEditView salvage rows are the requirement row (issue 1516)', () => {
  let previousRoll;
  before(async () => {
    await harness.setup();
    previousRoll = globalThis.Roll;
    Object.assign(globalThis, { Roll: SEEDED_ROLL });
  });
  after(() => {
    Object.assign(globalThis, { Roll: previousRoll });
    harness.teardown();
  });

  it('a flat row answers the retired row’s hooks, and its remove and stepper change the DOM', async () => {
    const target = await harness.mount(props());
    const rows = flatRows(target);
    assert.equal(rows.length, 2);
    for (const row of rows) assert.deepEqual(missingCensusHooks(row, 'salvageFlat'), []);

    rows[0].querySelector('[data-stepper-increment]').click();
    await settle();
    assert.equal(flatRows(target)[0].querySelector('[data-salvage-result-quantity]').value, '3');

    rows[1].querySelector('[data-remove-salvage-result]').click();
    await settle();
    assert.deepEqual(
      flatRows(target).map((row) => row.getAttribute('data-salvage-result')),
      ['res-1'],
      'the removed row leaves the list'
    );
    harness.remount();
  });

  it('a stage row answers the retired row’s hooks, and its remove changes the DOM', async () => {
    const target = await harness.mount(props({ mode: 'progressive' }));
    const rows = stageRows(target);
    assert.equal(rows.length, 2);
    for (const row of rows) assert.deepEqual(missingCensusHooks(row, 'salvageStage'), []);

    rows[1].querySelector('[data-remove-salvage-result]').click();
    await settle();
    assert.equal(stageRows(target).length, 1, 'the removed stage leaves the list');
    harness.remount();
  });

  it('a flat row offers the Component kind alone, no clear, and a Fixed | Rolled amount', async () => {
    const target = await harness.mount(props());
    const [row] = flatRows(target);
    const kind = '[data-salvage-result="res-1"] [data-recipe-option-kind]';
    assert.deepEqual(selectOptionValues(target, kind), ['component']);
    assert.ok(!row.querySelector('[data-recipe-option-clear]'), 'a flat row cannot clear its name');
    assert.ok(row.querySelector(':scope [data-recipe-option-amount-mode="fixed"] input').checked);
    assert.match(
      row.querySelector('.manager-recipe-option-remove').getAttribute('aria-label'),
      /Scrap Metal/,
      'the remove names its subject'
    );
    harness.remount();
  });

  it('a stage row keeps its clear, draws no amount or remove, and trails its DC and Edit', async () => {
    const target = await harness.mount(props({ mode: 'progressive' }));
    const [stage] = stageRows(target);
    const row = stage.querySelector('[data-recipe-option]');
    assert.ok(
      row.querySelector('[data-recipe-option-clear]'),
      'a stage swaps its component in place'
    );
    assert.ok(
      !row.querySelector(':scope [data-recipe-option-amount-mode], :scope [data-stepper-input]'),
      'a stage draws neither the toggle nor an amount'
    );
    assert.ok(!row.querySelector('.manager-recipe-option-remove'), 'the delete is the list’s own');
    const controls = row.querySelector('.manager-recipe-option-controls');
    assert.equal(controls.querySelector('[data-salvage-result-difficulty]').textContent, 'DC 4');
    assert.ok(controls.querySelector('[data-salvage-result-edit="cmp-scrap"]'));

    row.querySelector('[data-recipe-option-clear]').click();
    await settle();
    assert.ok(
      stageRows(target)[0].querySelector(
        ':scope [data-salvage-result-component] [data-recipe-option-search]'
      ),
      'the cleared stage searches again, in its place'
    );
    harness.remount();
  });

  it('marks an unrollable or never-positive amount invalid on its own row', async () => {
    for (const [formula, message] of [
      ['max(, 2)', /cannot be rolled/],
      ['0', /never award a positive amount/],
    ]) {
      const target = await harness.mount(props({ rows: results({ quantityFormula: formula }) }));
      const [invalid, valid] = flatRows(target);
      assert.equal(
        invalid.querySelector('[data-recipe-option-formula]').getAttribute('aria-invalid'),
        'true'
      );
      assert.match(invalid.querySelector('[data-recipe-option-invalid]').textContent, message);
      assert.ok(!valid.querySelector('[data-recipe-option-invalid]'), 'and on no other row');
      harness.remount();
    }
  });

  it('adding a produced component raises its fixed row, and appends beside a rolled one', async () => {
    const drafts = [];
    const target = await harness.mount(
      props({
        onDraftChange: (draft) => {
          drafts.push(draft);
        },
      })
    );
    const added = () => drafts.at(-1).updates.salvage.resultGroups[0].results;

    target.querySelector('[data-add-salvage-result]').click();
    await settle();
    chooseOption(target, 'Scrap Metal');
    await settle();
    assert.deepEqual(
      added().map(({ componentId, quantity }) => [componentId, quantity]),
      [
        ['cmp-scrap', 3],
        ['cmp-dust', 1],
      ]
    );

    await typeRolled(flatRows(target)[0], '1d4+1');
    target.querySelector('[data-add-salvage-result]').click();
    await settle();
    chooseOption(target, 'Scrap Metal');
    await settle();
    assert.deepEqual(
      added().map(({ componentId, quantity }) => [componentId, quantity]),
      [
        ['cmp-scrap', 3],
        ['cmp-dust', 1],
        ['cmp-scrap', 1],
      ],
      'a rolled row is not raised, so a fixed row of one is appended'
    );
    harness.remount();
  });

  it('opening Rolled with nothing typed leaves the draft clean', async () => {
    const dirty = [];
    const target = await harness.mount(
      props({
        onDirtyChange: (next) => {
          dirty.push(next);
        },
      })
    );
    const radio = flatRows(target)[0].querySelector(
      ':scope [data-recipe-option-amount-mode="rolled"] input'
    );
    radio.checked = true;
    radio.dispatchEvent(new globalThis.window.Event('change', { bubbles: true }));
    await settle();
    assert.ok(flatRows(target)[0].querySelector('[data-recipe-option-formula]'), 'Rolled is open');
    assert.ok(!dirty.includes(true), 'and nothing was staged');
    harness.remount();
  });

  it('Fixed stages the whole salvage with the formula key gone and the quantity kept', async () => {
    const drafts = [];
    const target = await harness.mount(
      props({
        rows: results({ quantityFormula: '1d4+1' }),
        onDraftChange: (draft) => {
          drafts.push(draft);
        },
      })
    );
    const radio = flatRows(target)[0].querySelector(
      ':scope [data-recipe-option-amount-mode="fixed"] input'
    );
    radio.checked = true;
    radio.dispatchEvent(new globalThis.window.Event('change', { bubbles: true }));
    await settle();
    const { salvage } = drafts.at(-1).updates;
    assert.equal(salvage.enabled, true, 'the update carries the whole salvage object');
    const [fixed] = salvage.resultGroups[0].results;
    assert.equal(Object.hasOwn(fixed, 'quantityFormula'), false);
    assert.equal(fixed.quantity, 2);
    harness.remount();
  });

  it('turns every salvage row control off while the editor saves', async () => {
    for (const mode of ['simple', 'progressive']) {
      const target = await harness.mount(props({ mode, saving: true }));
      const section = target.querySelector('[data-salvage-section]');
      const live = [
        ...section.querySelectorAll(
          ':scope [data-recipe-option] button, :scope [data-recipe-option] input, :scope [data-add-salvage-result]'
        ),
      ].filter((control) => !control.disabled);
      assert.deepEqual(
        live.map((control) => control.outerHTML.slice(0, 80)),
        [],
        `${mode}: every control is off`
      );
      harness.remount();
    }
  });

  it('a typed rolled amount survives save and remount, Rolled and with quantity unchanged', async () => {
    const previousGame = globalThis.game;
    Object.assign(globalThis, {
      game: { ...previousGame, user: { id: 'gm', isGM: true }, actors: [] },
      foundry: { utils: { randomID: () => 'rid', deepClone: structuredClone } },
    });
    try {
      const manager = new CraftingSystemManager({ getRecipes: () => [], getRecipe: () => null });
      manager.initialized = true;
      manager.save = async () => {};
      manager.systems.set(
        'sys1',
        manager._normalizeSystem({
          id: 'sys1',
          name: 'Salvage',
          features: { salvage: true },
          salvageResolutionMode: 'simple',
          components: [
            { id: 'comp-gear', name: 'Gear', salvage: salvageOf(results()) },
            ...COMPONENTS,
          ],
        })
      );
      const onSave = (id, updates) => manager.updateItem('sys1', id, updates).then(() => true);
      const target = await harness.mount(props({ onSave }));
      await typeRolled(flatRows(target)[0], '1d4+1');
      target
        .querySelector('#manager-component-edit-form')
        .dispatchEvent(new globalThis.window.Event('submit', { bubbles: true, cancelable: true }));
      await settle();
      const saved = manager.getSystem('sys1').components.find((entry) => entry.id === 'comp-gear');
      harness.remount();

      const reopened = await harness.mount(props({ rows: saved.salvage.resultGroups[0].results }));
      const [row] = flatRows(reopened);
      assert.ok(
        row.querySelector(':scope [data-recipe-option-amount-mode="rolled"] input').checked
      );
      assert.equal(row.querySelector('[data-recipe-option-formula]').value, '1d4+1');
      assert.equal(saved.salvage.resultGroups[0].results[0].quantity, 2, 'quantity is unchanged');
      harness.remount();
    } finally {
      Object.assign(globalThis, { game: previousGame });
    }
  });
});
