/** The progressive salvage stage list forwards every edit to the view that owns it (issue 1522). */
import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';

import { createRawSnippet } from 'svelte';

import { componentCatalogue } from '../../src/ui/svelte/apps/manager/recipe/resultRows.js';
import {
  callRecorder,
  cardText,
  componentCardHarness,
} from '../helpers/componentEditViewModules.js';

const harness = componentCardHarness('ComponentSalvageStages');

const COMPONENTS = Object.freeze([
  { id: 'cmp-scrap', name: 'Scrap Metal', difficulty: 4 },
  {
    id: 'cmp-dust',
    name: 'Dust',
    complications: [
      { id: 'cx-1', name: 'Choking cloud', severity: 'minor', activities: { salvage: true } },
      { id: 'cx-2', name: 'Craft only', severity: 'minor', activities: { crafting: true } },
    ],
  },
]);
const STAGES = Object.freeze([
  { id: 'res-1', componentId: 'cmp-scrap', quantity: 1 },
  { id: 'res-2', componentId: 'cmp-dust', quantity: 1 },
]);
const GROUP = Object.freeze({ id: 'grp-1', name: '', results: STAGES });
const DC_CARD = createRawSnippet(() => ({ render: () => '<section data-test-dc-card></section>' }));

async function mountWith(overrides = {}) {
  const { calls, record } = callRecorder();
  const target = await harness.mount({
    text: cardText,
    stageGroup: GROUP,
    stages: STAGES,
    resultKinds: ['component'],
    catalogue: componentCatalogue(COMPONENTS),
    nameProps: { 'data-salvage-result-component': '' },
    componentOptions: COMPONENTS,
    componentName: (id) => COMPONENTS.find((option) => option.id === id)?.name || '',
    onAddStage: record('add'),
    onRemoveStage: record('remove'),
    onMoveStage: record('move'),
    onUpdateResult: record('update'),
    onOpenComponent: record('open'),
    ...overrides,
  });
  return { calls, target };
}

const stage = (target, n) => target.querySelector(`[data-salvage-stage="${n}"]`);

describe('ComponentSalvageStages', () => {
  before(() => harness.setup());
  after(() => harness.teardown());

  it('forwards add, remove, move, a cleared pick and both Edit links', async () => {
    const { calls, target } = await mountWith();
    target.querySelector(':scope .manager-salvage-stage-add [data-add-salvage-result]').click();
    stage(target, 2).querySelector('[data-remove-salvage-result]').click();
    stage(target, 1).querySelector('[data-sortable-move="down"]').click();
    stage(target, 1).querySelector('[data-recipe-option-clear]').click();
    stage(target, 1).querySelector('[data-salvage-result-edit]').click();
    target.querySelector('[data-salvage-stage-complications-edit="cmp-dust"]').click();

    assert.deepEqual(
      calls.map(([name, ...args]) =>
        name === 'update' ? [name, args[0], args[1].id] : [name, ...args]
      ),
      [
        ['add'],
        ['remove', 'res-2'],
        ['move', 0, 1],
        ['update', 'grp-1', 'res-1'],
        ['open', 'cmp-scrap'],
        ['open', 'cmp-dust'],
      ]
    );
    harness.remount();
  });

  it('draws each stage’s DC and only its yield’s salvage complications', async () => {
    const { target } = await mountWith();
    assert.equal(
      stage(target, 1).querySelector('[data-salvage-result-difficulty]').textContent,
      'DC 4'
    );
    assert.equal(
      stage(target, 2).querySelector('[data-salvage-result-difficulty]').textContent,
      'No difficulty'
    );
    const band = target.querySelectorAll('[data-salvage-stage-complication]');
    assert.equal(band.length, 1, 'the crafting-only complication is filtered out');
    assert.ok(!stage(target, 1).classList.contains('has-band'), 'a stage with no band draws none');
    assert.ok(stage(target, 2).classList.contains('has-band'), 'the stage with a band is marked');
    assert.ok(!target.querySelector('[data-test-dc-card]'), 'no DC card without the snippet');
    harness.remount();
  });

  it('puts the adder under the empty message, as the add-group control, and closes with the DC card', async () => {
    const { calls, target } = await mountWith({
      stageGroup: null,
      stages: [],
      difficultyCard: DC_CARD,
    });
    assert.match(target.textContent, /No results yet\./);
    const adder = target.querySelector('[data-add-salvage-result]');
    assert.ok(adder.hasAttribute('data-add-salvage-group'), 'with no group it adds the group');
    adder.click();
    assert.deepEqual(calls, [['add']]);
    const card = target.querySelector('[data-test-dc-card]');
    assert.ok(Boolean(card), 'the view’s DC card renders');
    assert.ok(
      adder.compareDocumentPosition(card) === globalThis.window.Node.DOCUMENT_POSITION_FOLLOWING,
      'after the adder, closing the list'
    );
    harness.remount();
  });

  it('holds every control while saving', async () => {
    const { calls, target } = await mountWith({ saving: true });
    assert.ok(!target.querySelector('[data-sortable-move]'), 'the list is not reorderable');
    const disabled = [
      '[data-remove-salvage-result]',
      '[data-salvage-result-edit]',
      '[data-salvage-stage-complications-edit]',
      '[data-add-salvage-result]',
    ].map((selector) => [selector, target.querySelector(selector).disabled]);
    assert.deepEqual(
      disabled,
      disabled.map(([selector]) => [selector, true])
    );
    target.querySelector('[data-remove-salvage-result]').click();
    assert.deepEqual(calls, []);
    harness.remount();
  });
});
