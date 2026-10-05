/**
 * `RecipeResultGroupCard` renders every result through `PickerRow` (issue 1516): the hooks the
 * retired row carried, keying by entry identity, the rolled-amount error and the Fixed | Rolled
 * round trip through the card's own `onChange`; and its `Result` adder and offered kinds on a
 * recipe, and its component picker on a gathering task (1773).
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

/**
 * Mount the card controlled: every emitted group is recorded and fed back as its `group`. A recipe
 * card unless `extra` says otherwise; `surface: undefined` takes the card's own default.
 */
async function mountCard(results, extra = {}) {
  const groups = [];
  const target = await harness.mount({
    group: { id: 'grp-1', name: 'Primary', results },
    componentOptions: COMPONENTS,
    surface: 'recipe',
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
const KIND_TRIGGER = '.fabricate-select-trigger[data-recipe-option-kind]';
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
    assert.equal(adder.getAttribute('aria-label'), 'Add a result', 'its name keeps the verb');
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
    assert.equal(adder.getAttribute('aria-label'), 'Add result stage');
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
    assert.equal(adder.getAttribute('aria-label'), 'Add a result');
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
    assert.equal(field.getAttribute('aria-label'), 'Search recipes...');
    assert.ok(doc.activeElement === field, 'focus lands on the new row, not back on the trigger');
  });

  it('focuses the first stage of an empty progressive set, though the add moves the adder', async () => {
    const { target, groups } = await mountCard([], { progressive: true, resultKinds: ALL_KINDS });
    const sibling = target.querySelector(ADDER);
    assert.ok(
      !sibling.closest('.fabricate-sortable-list'),
      'with no stage, the adder is a sibling'
    );
    sibling.click();
    await settle();
    await settle();
    assert.equal(groups.at(-1).results.length, 1);
    assert.ok(
      target.querySelector(ADDER).closest('.fabricate-sortable-list'),
      'PRE-CONDITION: the add moved the adder into the list’s footer, a new instance'
    );
    assert.ok(
      target.ownerDocument.activeElement === nameField(rows(target)[0]),
      'the new stage’s name field takes focus, never the document'
    );
  });
});

describe('RecipeResultGroupCard: a gathering task’s component picker', () => {
  async function pickResult(target, label) {
    target.querySelector(ADDER).click();
    await settle();
    [...target.ownerDocument.querySelectorAll('.manager-travel-option')]
      .find((option) => option.textContent.includes(label))
      .click();
    await settle();
  }

  it('raises a fixed row already producing the pick, and appends beside a rolled one', async () => {
    const { target, groups } = await mountCard(
      [
        { id: 'r1', componentId: 'cmp-herb', quantity: 2 },
        { id: 'r2', componentId: 'cmp-water', quantity: 1, quantityFormula: '1d4+1' },
      ],
      { surface: undefined, resultKinds: ALL_KINDS }
    );
    assert.equal(target.querySelector(ADDER).textContent.trim(), 'Add item');
    for (const row of rows(target)) {
      assert.ok(!row.classList.contains('is-reward'), 'a gathering row is no reward row');
    }
    assert.deepEqual(selectOptionValues(target, KIND_TRIGGER), ['component'], 'nor offers one');

    await pickResult(target, 'Mountain Herb');
    assert.deepEqual(groups.at(-1).results[0], { id: 'r1', componentId: 'cmp-herb', quantity: 3 });
    assert.equal(groups.at(-1).results.length, 2, 'a fixed row is raised, not repeated');

    await pickResult(target, 'Pure Water');
    const added = groups.at(-1).results[2];
    assert.ok(added?.id, 'a rolled row is never raised, so the pick appends with an eager id');
    assert.deepEqual({ ...added, id: 'x' }, { id: 'x', componentId: 'cmp-water', quantity: 1 });
  });
});

describe('RecipeResultGroupCard: what a result row offers', () => {
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

  it('a retype keeps a typed roll between counted kinds, and resets an empty Rolled to Fixed', async () => {
    const { target, groups } = await mountCard(
      [
        { id: 'r1', componentId: 'cmp-herb', quantity: 2, quantityFormula: '1d4' },
        { id: 'r2', componentId: 'cmp-water', quantity: 1 },
      ],
      { resultKinds: ALL_KINDS }
    );
    const kindOf = (n) => `[data-recipe-result-item]:nth-child(${n}) ${KIND_TRIGGER}`;
    chooseSelectOption(target, kindOf(1), 'currency');
    await settle();
    assert.deepEqual(groups.at(-1).results[0], {
      id: 'r1',
      kind: 'currency',
      unit: '',
      quantity: 2,
      quantityFormula: '1d4',
    });
    assert.ok(radio(rows(target)[0], 'rolled').checked, 'the roll survives the retype');
    assert.equal(rows(target)[0].querySelector('[data-recipe-option-formula]').value, '1d4');

    // Rolled opened with nothing typed writes nothing, so only the amount's own state holds it.
    await choose(radio(rows(target)[1], 'rolled'));
    chooseSelectOption(target, kindOf(2), 'currency');
    await settle();
    assert.ok(
      radio(rows(target)[1], 'fixed').checked,
      'the new kind’s amount starts Fixed rather than on an empty Rolled the data never held'
    );
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

describe('RecipeResultGroupCard: a result choice group (issue 1773)', () => {
  const members = (target) => [...target.querySelectorAll('[data-recipe-result-member]')];
  const chooserRadio = (target, value) =>
    target.querySelector(`[data-recipe-group-chooser="${value}"] input`);
  const help = (target) => target.querySelector('[data-recipe-group-help]');
  const PLAYER_GROUP = Object.freeze({
    id: 'g1',
    alternatives: [
      { id: 'a', componentId: 'cmp-herb', quantity: 2 },
      { id: 'b', componentId: 'cmp-water', quantity: 1 },
    ],
  });

  const mountGroup = (group, extra = {}) =>
    mountCard([group], { resultKinds: ALL_KINDS, ...extra });

  it('converts a reward row in place: it keeps its id as the group, which opens on any one of, the player choosing', async () => {
    const { target, groups } = await mountGroup({ id: 'r1', componentId: 'cmp-herb', quantity: 2 });
    rows(target)[0].querySelector('.manager-recipe-or-trigger').click();
    await settle();
    const menu = target.ownerDocument.querySelector(':scope .manager-recipe-or-menu');
    assert.equal(
      menu.querySelector('.manager-action-menu-heading').textContent.trim(),
      'Add an alternative'
    );
    const entries = [...menu.querySelectorAll('[role="menuitem"]')];
    assert.deepEqual(
      entries.map((entry) => entry.textContent.trim()),
      ['Component', 'Currency', 'Recipe knowledge'],
      'the convert menu states the set’s subset'
    );
    entries[1].click();
    await settle();
    await settle();

    const [group] = groups.at(-1).results;
    assert.equal(group.id, 'r1');
    assert.deepEqual(new Set(Object.keys(group)), new Set(['alternatives', 'id']), 'no setting');
    const [first, added] = group.alternatives;
    assert.deepEqual({ ...first, id: 'x' }, { id: 'x', componentId: 'cmp-herb', quantity: 2 });
    assert.deepEqual({ ...added, id: 'y' }, { id: 'y', kind: 'currency', unit: '', quantity: 1 });
    assert.notEqual(first.id, added.id);

    assert.equal(rows(target).length, 0, 'the bare row became the box');
    assert.equal(members(target).length, 2);
    assert.ok(chooserRadio(target, 'playerChooses').checked);
    assert.ok(!target.querySelector('.manager-recipe-or-trigger'), 'no member converts again');
    assert.ok(!target.querySelector('[data-recipe-range-cell]'), 'no range without a roll');
    assert.ok(!target.querySelector('[data-recipe-group-count]'), 'no N under any one of');
    assert.ok(!target.querySelector('[data-recipe-group-repeats]'));
    assert.ok(
      target.ownerDocument.activeElement === nameField(members(target)[1]),
      'focus lands on the new alternative’s name field'
    );
    const head = target.querySelector('[data-recipe-group-header]');
    assert.equal(head.getAttribute('aria-describedby'), help(target).id);
    assert.equal(
      help(target).textContent.trim(),
      'The player picks one of these when the result is awarded.'
    );
  });

  it('a failed check’s reserved set converts on the same terms as any other set', async () => {
    const { target, groups } = await mountGroup(
      { id: 'f1', componentId: 'cmp-water', quantity: 1 },
      { reserved: true, staticLabel: 'On a failed check', hideRemove: true }
    );
    rows(target)[0].querySelector('.manager-recipe-or-trigger').click();
    await settle();
    target.ownerDocument.querySelector(':scope .manager-recipe-or-menu [role="menuitem"]').click();
    await settle();
    assert.equal(groups.at(-1).results[0].alternatives.length, 2);
    await choose(chooserRadio(target, 'rolled'));
    assert.equal(groups.at(-1).results[0].chooser, 'rolled');
    assert.ok(target.querySelector('[data-recipe-group-strategy]'), 'with the award strategy');
  });

  it('a gathering row and a progressive stage carry no convert control', async () => {
    const gathering = await mountGroup(
      { id: 'r1', componentId: 'cmp-herb', quantity: 2 },
      { surface: undefined }
    );
    assert.ok(!gathering.target.querySelector('.manager-recipe-or-trigger'));
    harness.remount();
    const stage = await mountGroup({ id: 's1', componentId: 'cmp-herb' }, { progressive: true });
    assert.ok(!stage.target.querySelector('.manager-recipe-or-trigger'));
  });

  it('states once per progressive set that a stage offers no choice, as a callout', async () => {
    const stage = await mountGroup({ id: 's1', componentId: 'cmp-herb' }, { progressive: true });
    const notes = stage.target.querySelectorAll('[data-recipe-progressive-note]');
    assert.equal(notes.length, 1);
    assert.match(notes[0].textContent, /every stage the roll affords/);
    harness.remount();
    const flat = await mountGroup({ id: 'r1', componentId: 'cmp-herb', quantity: 1 });
    assert.ok(!flat.target.querySelector('[data-recipe-progressive-note]'));
  });

  it('switches to rolled writing no ranges and no expression, and its rows gain range cells', async () => {
    const { target, groups } = await mountGroup(PLAYER_GROUP);
    await choose(chooserRadio(target, 'rolled'));
    assert.deepEqual(groups.at(-1).results[0], { ...PLAYER_GROUP, chooser: 'rolled' });
    assert.equal(target.querySelectorAll('[data-recipe-range-cell]').length, 2);
    assert.ok(target.querySelector('[data-recipe-group-selection]'), 'the selection line opens');
    const labels = [...members(target)[0].querySelectorAll('[data-recipe-range]')].map((input) =>
      input.closest('label').textContent.trim()
    );
    assert.deepEqual(labels, [
      'Lowest roll selecting Mountain Herb',
      'Highest roll selecting Mountain Herb',
    ]);
  });

  it('up to N by roll offers repeats, defaulting to unique; back to the player drops them', async () => {
    const { target, groups } = await mountGroup({ ...PLAYER_GROUP, chooser: 'rolled' });
    chooseSelectOption(target, '[data-recipe-group-strategy]', 'upTo');
    await settle();
    assert.deepEqual(groups.at(-1).results[0], {
      ...PLAYER_GROUP,
      chooser: 'rolled',
      awardStrategy: 'upTo',
      awardCount: 2,
    });
    const repeats = () => target.querySelector('[data-recipe-group-repeats]');
    assert.equal(repeats().getAttribute('data-recipe-group-repeats'), 'unique');
    repeats().click();
    await settle();
    assert.equal(groups.at(-1).results[0].withReplacement, true);
    assert.equal(repeats().getAttribute('data-recipe-group-repeats'), 'repeats');
    await type(target.querySelector('[data-recipe-group-selection]'), '1d20');
    assert.equal(groups.at(-1).results[0].selectionFormula, '1d20');
    assert.match(help(target).textContent, /the same one may come up twice/);

    await choose(chooserRadio(target, 'playerChooses'));
    assert.deepEqual(groups.at(-1).results[0], {
      ...PLAYER_GROUP,
      awardStrategy: 'upTo',
      awardCount: 2,
    });
    assert.ok(!repeats(), 'a player picking from a list they can see cannot repeat');
  });

  it('re-picking the current strategy keeps the rolled N and repeats, writing nothing', async () => {
    const { target, groups } = await mountGroup({
      ...PLAYER_GROUP,
      chooser: 'rolled',
      awardStrategy: 'upTo',
      awardCountFormula: '1d3',
      withReplacement: true,
    });
    chooseSelectOption(target, '[data-recipe-group-strategy]', 'upTo');
    await settle();
    assert.equal(groups.length, 0, 'the strategy already chosen is no edit');
    assert.equal(
      target.querySelector('[data-recipe-group-repeats]').getAttribute('data-recipe-group-repeats'),
      'repeats'
    );
  });

  it('holds a fixed N at two or more', async () => {
    const { target, groups } = await mountGroup({
      ...PLAYER_GROUP,
      awardStrategy: 'upTo',
      awardCount: 2,
    });
    const count = target.querySelector('[data-recipe-group-count]');
    assert.equal(count.getAttribute('min'), '2');
    assert.ok(count.parentElement.querySelector('[data-stepper-decrement]').disabled);
    await type(count, '1');
    assert.equal(groups.length, 0, 'a typed one is held at two, which writes nothing');
    await type(count, '3');
    assert.equal(groups.at(-1).results[0].awardCount, 3);
  });

  it('marks an overlap and a backwards range invalid, each with its reason on its own line', async () => {
    const { target } = await mountGroup({
      ...PLAYER_GROUP,
      chooser: 'rolled',
      selectionFormula: '1d20',
      alternatives: [
        { id: 'a', componentId: 'cmp-herb', quantity: 1, selectionRange: { from: 1, to: 10 } },
        { id: 'b', componentId: 'cmp-water', quantity: 1, selectionRange: { from: 8, to: 20 } },
      ],
    });
    const problem = (row) => row.querySelector('[data-recipe-range-problem]')?.textContent.trim();
    assert.deepEqual(members(target).map(problem), [
      'Its range overlaps the range of Pure Water.',
      'Its range overlaps the range of Mountain Herb.',
    ]);
    const low = members(target)[0].querySelector('[data-recipe-range="from"]');
    assert.equal(low.getAttribute('aria-invalid'), 'true');
    assert.equal(
      low.getAttribute('aria-describedby'),
      members(target)[0].querySelector('[data-recipe-range-problem]').id
    );

    await type(members(target)[1].querySelector('[data-recipe-range="from"]'), '25');
    assert.deepEqual(members(target).map(problem), [
      undefined,
      'Its lowest roll is above its highest.',
    ]);
  });

  it('removing down to one member unwraps it, dropping the group’s settings and its range', async () => {
    const { target, groups } = await mountGroup({
      id: 'g1',
      chooser: 'rolled',
      awardStrategy: 'upTo',
      awardCount: 2,
      withReplacement: true,
      selectionFormula: '1d20',
      alternatives: [
        { id: 'a', componentId: 'cmp-herb', quantity: 1, selectionRange: { from: 1, to: 10 } },
        { id: 'b', componentId: 'cmp-water', quantity: 3, selectionRange: { from: 11, to: 20 } },
      ],
    });
    members(target)[0].querySelector('[data-recipe-remove="result-alternative"]').click();
    await settle();
    assert.deepEqual(groups.at(-1).results, [{ id: 'b', componentId: 'cmp-water', quantity: 3 }]);
    assert.equal(rows(target).length, 1, 'a flat row again');
  });

  it('draws one `alt <kind>` adder per offered kind, appending an empty member that takes focus', async () => {
    const { target, groups } = await mountGroup(PLAYER_GROUP);
    const adders = [...target.querySelectorAll('[data-recipe-add^="alternative-"]')];
    assert.deepEqual(
      adders.map((adder) => [adder.getAttribute('data-recipe-add'), adder.textContent.trim()]),
      [
        ['alternative-component', 'alt component'],
        ['alternative-currency', 'alt currency'],
        ['alternative-knowledge', 'alt knowledge'],
      ]
    );
    adders[2].click();
    await settle();
    const added = groups.at(-1).results[0].alternatives[2];
    assert.deepEqual(
      { ...added, id: 'x' },
      { id: 'x', kind: 'knowledge', recipeId: '', quantity: 1 }
    );
    assert.ok(target.ownerDocument.activeElement === nameField(members(target)[2]));
  });
});
