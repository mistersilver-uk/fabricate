/** The rules editor's Salvage card forwards every salvage edit to the view that owns it (issue 1522). */
import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';

import { createRawSnippet } from 'svelte';

import {
  callRecorder,
  cardFormat,
  cardText,
  componentCardHarness,
} from '../helpers/componentEditViewModules.js';
import { chooseSelectOption, selectTriggerText } from '../helpers/select-control.js';
import { chooseSetCardAction } from '../helpers/setCardActions.js';

const harness = componentCardHarness('ComponentSalvageCard');

const COMPONENTS = Object.freeze([
  { id: 'cmp-scrap', name: 'Scrap Metal' },
  { id: 'cmp-dust', name: 'Dust' },
]);
const GROUPS = Object.freeze([
  {
    id: 'grp-1',
    name: 'Scraps',
    results: [{ id: 'res-1', componentId: 'cmp-scrap', quantity: 2 }],
  },
  { id: 'grp-2', name: '', results: [] },
]);
const DC_CARD = createRawSnippet(() => ({ render: () => '<section data-test-dc-card></section>' }));
const settle = () => new Promise((done) => setTimeout(done, 0));

async function mountWith(overrides = {}) {
  const { calls, record } = callRecorder();
  const target = await harness.mount({
    text: cardText,
    format: cardFormat,
    systemLabel: 'Smithing',
    salvageDraft: { enabled: true, outcomeRouting: {}, resultGroups: GROUPS },
    salvageResolutionMode: 'routed',
    salvageEnabled: true,
    salvageRouted: true,
    salvageShowChrome: true,
    salvageOutcomeNames: ['Success'],
    salvageRouteOptions: [
      { value: '', label: 'Unrouted' },
      { value: 'grp-1', label: 'Scraps' },
    ],
    salvageAdderOptions: COMPONENTS.map((option) => ({ id: option.id, label: option.name })),
    componentOptions: COMPONENTS,
    onSalvageChange: record('salvage'),
    onAddGroup: record('addGroup'),
    onRemoveGroup: record('removeGroup'),
    onUpdateGroup: record('updateGroup'),
    onAddResult: record('addResult'),
    onRemoveResult: record('removeResult'),
    onSetRoute: record('route'),
    onAddStage: record('addStage'),
    ...overrides,
  });
  return { calls, target };
}

describe('ComponentSalvageCard', () => {
  before(() => harness.setup());
  after(() => harness.teardown());

  it('draws every result set and result when two of them share an id (issue 2713)', async () => {
    const twins = [
      { id: 'dup', name: 'One', results: [{ id: 'res', componentId: 'cmp-scrap', quantity: 1 }] },
      {
        id: 'dup',
        name: 'Two',
        results: [
          { id: 'res', componentId: 'cmp-dust', quantity: 1 },
          { id: 'res', componentId: 'cmp-scrap', quantity: 1 },
        ],
      },
    ];
    const { target } = await mountWith({
      salvageDraft: { enabled: true, outcomeRouting: {}, resultGroups: twins },
    });
    assert.equal(target.querySelectorAll(':scope [data-salvage-group="dup"]').length, 2);
    assert.equal(
      target.querySelectorAll(':scope [data-salvage-group] [data-recipe-option-chosen]').length,
      3
    );
    harness.remount();
  });

  it('forwards the switch, every result-set edit and an outcome route', async () => {
    const { calls, target } = await mountWith();
    target.querySelector('[data-recipe-field="salvageEnabled"]').click();
    const name = target.querySelector(
      ':scope [data-salvage-group="grp-2"] [data-salvage-group-name]'
    );
    name.value = 'Dust';
    name.dispatchEvent(new globalThis.window.Event('input', { bubbles: true }));
    await chooseSetCardAction(
      target.querySelector(':scope [data-salvage-group="grp-2"]'),
      '[data-remove-salvage-group]'
    );
    target
      .querySelector(':scope [data-salvage-group="grp-1"] [data-remove-salvage-result]')
      .click();
    target.querySelector(':scope [data-salvage-group="grp-2"] [data-add-salvage-result]').click();
    await settle();
    [...target.querySelectorAll('.manager-travel-option')]
      .find((option) => option.textContent.includes('Dust'))
      .click();
    target.querySelector('button[data-add-salvage-group]').click();
    chooseSelectOption(target, '[data-salvage-route="Success"]', 'grp-1');

    assert.deepEqual(calls, [
      ['salvage', { enabled: false }],
      ['updateGroup', 'grp-2', { name: 'Dust' }],
      ['removeGroup', 'grp-2'],
      ['removeResult', 'grp-1', 'res-1'],
      ['addResult', 'grp-2', 'cmp-dust'],
      ['addGroup'],
      ['route', 'Success', 'grp-1'],
    ]);
    harness.remount();
  });

  it('shows a saved route on its outcome’s select', async () => {
    const { target } = await mountWith({
      salvageDraft: { enabled: true, outcomeRouting: { Success: 'grp-1' }, resultGroups: GROUPS },
    });
    assert.equal(selectTriggerText(target, '[data-salvage-route="Success"]'), 'Scraps');
    harness.remount();
  });

  // Issue 2513: the well is a routing overview, one neutral row per outcome.
  it('marks outcomes routed to one set "shared · 2", and gives unrouted ones no shared marker', async () => {
    const markers = (target, name) =>
      [
        ...target.querySelectorAll(
          `:scope [data-salvage-routing] [data-routing-overview-row="${name}"] .fabricate-routing-overview-marker`
        ),
      ].map((marker) => marker.textContent);
    const outcomes = ['Fine', 'Masterwork', 'Ruined', 'Botched'];
    const { target } = await mountWith({
      salvageOutcomeNames: outcomes,
      salvageDraft: {
        enabled: true,
        outcomeRouting: { Fine: 'grp-1', Masterwork: 'grp-1' },
        resultGroups: GROUPS,
      },
    });
    assert.deepEqual(markers(target, 'Fine'), ['shared · 2']);
    assert.deepEqual(markers(target, 'Masterwork'), ['shared · 2']);
    assert.deepEqual(markers(target, 'Ruined'), [], 'two unrouted outcomes share nothing');
    assert.deepEqual(markers(target, 'Botched'), []);
    assert.equal(selectTriggerText(target, '[data-salvage-route="Ruined"]'), 'Unrouted');
    assert.equal(
      target.querySelector('[data-validation-target="component-salvage-routing"]').dataset
        .salvageRoute,
      'Ruined',
      'the validation hook lands on the first unrouted outcome'
    );
    assert.ok(
      !target.querySelector(
        ':scope [data-salvage-routing] .fabricate-routing-overview-summary:not(:empty)'
      ),
      'no row carries a summary'
    );
    harness.remount();
  });

  it('holds the result-set controls while saving', async () => {
    const { target } = await mountWith({ saving: true });
    const name = target.querySelector(
      ':scope [data-salvage-group="grp-1"] [data-salvage-group-name]'
    );
    assert.ok(name.disabled, 'the set name is read-only');
    assert.ok(
      target.querySelector(':scope [data-salvage-group="grp-1"] [data-set-card-actions]').disabled,
      'the set’s kebab is inert'
    );
    assert.ok(target.querySelector('button[data-add-salvage-group]').disabled);
    assert.ok(target.querySelector('[data-salvage-route="Success"]').disabled);
    harness.remount();
  });

  it('hides Add result set at the simple cap, with its hint, and states the disabled notice', async () => {
    const { target } = await mountWith({
      salvageResolutionMode: 'simple',
      salvageRouted: false,
      salvageSimpleMode: true,
      salvageHideAddGroup: true,
      salvageEnabled: false,
      salvageShowChrome: false,
      salvageDisabledNotice: 'Salvage is disabled.',
    });
    assert.ok(!target.querySelector('button[data-add-salvage-group]'), 'no Add result set');
    assert.ok(Boolean(target.querySelector('[data-salvage-simple-hint]')), 'the cap hint shows');
    assert.equal(
      target.querySelector('[data-salvage-disabled-notice]').textContent,
      'Salvage is disabled.'
    );
    assert.ok(!target.querySelector('[data-salvage-routing]'), 'the routing chrome collapses');
    harness.remount();
  });

  it('draws the progressive body through the stage list and forwards the reorder policy', async () => {
    const { calls, target } = await mountWith({
      salvageResolutionMode: 'progressive',
      salvageRouted: false,
      salvageProgressive: true,
      salvageDraft: {
        enabled: true,
        outcomeRouting: {},
        resultGroups: [],
        allowPlayerResultReorder: true,
      },
      difficultyCard: DC_CARD,
    });
    assert.ok(Boolean(target.querySelector('[data-salvage-roll-budget]')), 'the budget callout');
    assert.ok(
      Boolean(target.querySelector(':scope [data-salvage-result-groups] [data-test-dc-card]')),
      'the view’s DC card closes the stage list'
    );
    target.querySelector('[data-recipe-field="salvageAllowPlayerResultReorder"]').click();
    target.querySelector(':scope [data-salvage-result-groups] [data-add-salvage-result]').click();
    assert.deepEqual(calls, [['salvage', { allowPlayerResultReorder: false }], ['addStage']]);
    harness.remount();
  });
});
