/** The rules editor's Salvage card forwards every salvage edit to the view that owns it (issue 1522). */
import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';

import {
  callRecorder,
  cardFormat,
  cardText,
  componentCardHarness,
} from '../helpers/componentEditViewModules.js';
import { chooseSelectOption } from '../helpers/select-control.js';

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

  it('forwards the switch, every result-set edit and an outcome route', async () => {
    const { calls, target } = await mountWith();
    target.querySelector('[data-recipe-field="salvageEnabled"]').click();
    const name = target.querySelector(
      ':scope [data-salvage-group="grp-2"] [data-salvage-group-name]'
    );
    name.value = 'Dust';
    name.dispatchEvent(new globalThis.window.Event('input', { bubbles: true }));
    target.querySelector(':scope [data-salvage-group="grp-2"] [data-remove-salvage-group]').click();
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
    });
    assert.ok(Boolean(target.querySelector('[data-salvage-roll-budget]')), 'the budget callout');
    target.querySelector('[data-recipe-field="salvageAllowPlayerResultReorder"]').click();
    target.querySelector(':scope [data-salvage-result-groups] [data-add-salvage-result]').click();
    assert.deepEqual(calls, [['salvage', { allowPlayerResultReorder: false }], ['addStage']]);
    harness.remount();
  });
});
