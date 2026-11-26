/**
 * The iterative library's shell: its rail entries and counts, its routes and redirects, its header
 * and its route-exit guard, mounted through the root against the store double (issue 3009).
 */
import assert from 'node:assert/strict';
import { afterEach, before, it } from 'node:test';

import { flushSync, tick, unmount } from 'svelte';

import { shippedString, useShippedLocalization } from '../helpers/manager/managerLocalization.js';
import { createManagerMounts } from '../helpers/manager/managerMount.js';
import { createManagerQueries } from '../helpers/manager/managerQueries.js';

import {
  assertNoTitledIconButton,
  labCaseSelector,
  managerComponents,
  settle,
  settleBetweenTests,
  settleRouteExit,
  titledIconButtons,
} from './manager-mounted-shared.js';

let Component;
let mounted;
let target;
let store;

const queries = createManagerQueries(() => target);
const { craftingParent, craftingSubitem, managerTitle, switchScopeSystemTo } = queries;
const { mountManager } = createManagerMounts({
  queries,
  component: () => Component,
  adopt: (nextMounted, nextTarget) => {
    mounted = nextMounted;
    target = nextTarget;
  },
  adoptStore: (next) => {
    store = next;
  },
});

const counter = (id, label) => ({ id, label, limit: 'none' });
const LIBRARY = Object.freeze({
  version: 1,
  counters: [counter('heat', 'Heat'), counter('ember', 'Ember')],
  actions: [
    {
      id: 'stoke',
      label: 'Stoke',
      categories: [],
      usesSession: true,
      availability: { combine: 'all', rules: [] },
      costs: [],
      check: 'none',
      effects: [],
    },
  ],
});

/** The alchemy fixture switched to iterative mode, holding `library`, with one global entry. */
const iterative = (library = LIBRARY, extra = {}) => ({
  systemCraftingModes: {
    alchemy: { resolutionMode: 'iterative', visibilityMode: 'global', iterative: library },
  },
  ...extra,
});

const managerView = () => target.querySelector('.fabricate-manager').dataset.managerView;
const subitemIds = () =>
  [
    ...target.querySelector('#manager-crafting-submenu').querySelectorAll('.manager-nav-subitem'),
  ].map((button) => button.id.replace('manager-crafting-nav-', ''));
const countOf = (id) =>
  target.querySelector(`#manager-crafting-nav-${id} .manager-nav-count`)?.textContent.trim();
const press = async (selector) => {
  const control = target.querySelector(selector);
  assert.ok(Boolean(control), `${selector} is not on the page`);
  control.click();
  await settleRouteExit();
};

async function openCrafting(storeOptions, services = {}) {
  const calls = [];
  mountManager(calls, storeOptions, services);
  craftingParent().click();
  await settle();
  return calls;
}

async function openIterativeRoute(subitem, storeOptions = iterative(), services = {}) {
  const calls = await openCrafting(storeOptions, services);
  craftingSubitem(subitem).click();
  await settle();
  return calls;
}

/** Register this route's cases in `manager-mounted.test.js`'s one describe. */
export function registerIterativeCases() {
  before(async () => {
    ({ Component } = await managerComponents());
  });

  afterEach(async () => {
    const titled = titledIconButtons();
    if (mounted) {
      unmount(mounted);
      mounted = null;
    }
    target?.remove();
    target = null;
    await settleBetweenTests();
    assertNoTitledIconButton(titled);
  });

  it('offers neither Counters nor Actions in a system that is not iterative', async () => {
    await openCrafting({});
    const ids = subitemIds();
    assert.ok(ids.includes('recipes'), 'the Crafting group renders');
    assert.ok(!ids.includes('counters') && !ids.includes('actions'), ids.join(','));
  });

  it('lists Counters and Actions after Recipes with their own counts, outside the parent badge', async () => {
    await openCrafting(iterative());
    assert.deepEqual(subitemIds(), ['recipes', 'counters', 'actions', 'settings']);
    assert.equal(countOf('counters'), '2');
    assert.equal(countOf('actions'), '1');
    assert.equal(
      craftingParent().querySelector('.manager-nav-count')?.textContent.trim(),
      countOf('recipes'),
      'the Crafting badge is still the recipe total'
    );
  });

  it('opens Counters full width with its header, trail and rail highlight', async () => {
    useShippedLocalization();
    await openIterativeRoute('Counters');
    assert.equal(managerView(), 'iterative-counters');
    assert.ok(Boolean(target.querySelector(labCaseSelector('manager-iterative-rail'))));
    assert.ok(!target.querySelector('.manager-inspector'), 'the route draws no inspector');
    assert.equal(managerTitle(), shippedString('FABRICATE.Admin.Manager.Iterative.CountersTitle'));
    assert.ok(
      target
        .querySelector('.manager-page-subtitle, .manager-subtitle')
        .textContent.includes('Alchemy workpiece'),
      'the lede names the system'
    );
    const trail = target.querySelector('.manager-breadcrumbs').textContent;
    assert.ok(trail.includes('Crafting') && trail.includes('Counters'), trail);
    assert.equal(craftingSubitem('Counters').getAttribute('aria-current'), 'page');
  });

  it('adds a counter from the header, writing the whole library once', async () => {
    const calls = await openIterativeRoute('Counters');
    await press('[data-iterative-new-counter]');
    const writes = calls.filter(([name]) => name === 'updateSystem');
    assert.equal(writes.length, 1);
    const [, systemId, patch] = writes[0];
    assert.equal(systemId, 'alchemy');
    assert.deepEqual(
      patch.iterative.counters.map((entry) => entry.id),
      ['heat', 'ember', 'newCounter']
    );
    assert.equal(countOf('counters'), '3');
    const row = target.querySelector('[data-iterative-counter="newCounter"]');
    assert.equal(row.querySelector('.fabricate-sortable-list-body').hidden, false, 'it opens');
    assert.ok(
      document.activeElement === target.querySelector('[data-iterative-counter-name="newCounter"]'),
      'its Name has focus'
    );
  });

  it('clears a search that would hide the counter New counter adds', async () => {
    await openIterativeRoute('Counters');
    const search = target.querySelector(':scope [data-iterative-counters] .fabricate-search input');
    search.value = 'zzz';
    search.dispatchEvent(new Event('input', { bubbles: true }));
    await settle();
    await press('[data-iterative-new-counter]');
    assert.equal(search.value, '');
    assert.ok(target.querySelector('[data-iterative-counter="newCounter"]'), 'the new row shows');
  });

  it('deletes a counter only when the GM confirms, listing its uses', async () => {
    const answers = [false, true];
    const dialogs = [];
    const calls = await openIterativeRoute('Counters', iterative(), {
      confirmDialog: async (config) => {
        dialogs.push(config);
        return answers.shift();
      },
    });
    const writes = () => calls.filter(([name]) => name === 'updateSystem');
    await press('[data-iterative-counter="heat"] [data-iterative-counter-delete]');
    assert.equal(dialogs.length, 1, 'the GM is asked');
    assert.equal(writes().length, 0, 'Cancel keeps the counter');
    assert.equal(countOf('counters'), '2');
    await press('[data-iterative-counter="heat"] [data-iterative-counter-delete]');
    assert.equal(writes().length, 1);
    assert.deepEqual(
      writes()[0][2].iterative.counters.map((entry) => entry.id),
      ['ember']
    );
    assert.equal(countOf('counters'), '1');
    assert.ok(
      target.querySelector('[data-iterative-counters-status]').textContent.includes('Heat deleted.')
    );
  });

  it('opens Counters with the counter a Validation issue names', async () => {
    const issue = {
      kind: 'system',
      entityKind: 'counter',
      entityId: 'ember',
      entityName: 'Ember',
      severity: 'critical',
      blocks: 'enable',
      code: 'iterativeBoundsInverted',
      message: 'Min is above max.',
    };
    mountManager([], {
      ...iterative(),
      systemValidation: {
        issues: [issue],
        counts: { critical: 1, warning: 0, info: 0, blockers: 0 },
        blocksSystem: false,
      },
    });
    target.querySelector('[aria-label="Edit Alchemy"]').click();
    await settle();
    target.querySelector('[data-system-tab="validation"]').click();
    await settle();
    await press('[data-overview-link="counter"]');
    assert.equal(managerView(), 'iterative-counters');
    const row = target.querySelector('[data-iterative-counter="ember"]');
    assert.equal(row.querySelector('.fabricate-sortable-list-body').hidden, false, 'Ember is open');
    assert.equal(
      target.querySelector(':scope [data-iterative-counter="heat"] .fabricate-sortable-list-body')
        .hidden,
      true
    );
  });

  it('shows the routed crafting check editor for an iterative system', async () => {
    mountManager([], iterative());
    queries.navButton('Checks').click();
    await tick();
    flushSync();
    const panel = target.querySelector('[data-checks-panel="crafting"]');
    assert.ok(Boolean(panel), 'the crafting check panel renders');
    assert.ok(Boolean(panel.querySelector('[data-crafting-check-editor]')), 'the routed editor');
    assert.ok(!panel.querySelector('[data-simple-check-editor]'), 'not the simple editor');
  });

  it('refuses every write while the library was made by a newer version', async () => {
    const calls = await openIterativeRoute(
      'Counters',
      iterative({ version: 2, counters: [], actions: [] })
    );
    assert.equal(target.querySelector('[data-iterative-new-counter]').disabled, true);
    assert.ok(target.querySelector('[data-iterative-unsupported]'));
    await press('[data-iterative-new-counter]');
    assert.ok(calls.every(([name]) => !(name === 'updateSystem')));
  });

  it('disables New action, with its reason, while the system has no counters', async () => {
    useShippedLocalization();
    const calls = await openIterativeRoute(
      'Actions',
      iterative({ version: 1, counters: [], actions: [] })
    );
    const button = target.querySelector('[data-iterative-new-action]');
    assert.equal(button.disabled, true);
    assert.ok(
      button.outerHTML.includes(
        shippedString('FABRICATE.Admin.Manager.Iterative.NewActionNoCounters')
      )
    );
    await press('[data-iterative-new-action]');
    assert.equal(managerView(), 'iterative-actions');
    assert.ok(calls.every(([name]) => !(name === 'updateSystem')));
  });

  it('opens the action editor on a new draft with the recipe editor header shape', async () => {
    await openIterativeRoute('Actions');
    await press('[data-iterative-new-action]');
    assert.equal(managerView(), 'iterative-action-edit');
    assert.ok(target.querySelector('[data-iterative-action-heading]'), 'the identity heading');
    assert.equal(
      target.querySelector('[data-iterative-action-pill]').dataset.iterativeActionPill,
      'ready'
    );
    assert.ok(target.querySelector('[data-iterative-action-dirty]'), 'a new draft is Unsaved');
    assert.ok(!target.querySelector('[data-iterative-action-delete]'), 'no Delete on a new draft');
    assert.equal(target.querySelector('[data-iterative-action-duplicate]').disabled, true);
    assert.equal(target.querySelector('[data-iterative-action-save]').disabled, false);
    assert.equal(craftingSubitem('Actions').getAttribute('aria-current'), 'page');
    assert.ok(!target.querySelector('.manager-inspector'));
  });

  it('asks before leaving a dirty draft, and stays when the GM keeps editing', async () => {
    const calls = await openIterativeRoute(
      'Actions',
      iterative(LIBRARY, { confirmDiscardIterativeActionResult: 'cancel' })
    );
    await press('[data-iterative-new-action]');
    await press('[data-iterative-action-back]');
    assert.ok(calls.some(([name]) => name === 'confirmDiscardDirtyIterativeActionDraft'));
    assert.equal(managerView(), 'iterative-action-edit', 'Keep editing stays on the editor');
  });

  it('saves a dirty draft when the GM answers Save to the discard prompt', async () => {
    const calls = await openIterativeRoute(
      'Actions',
      iterative(LIBRARY, { confirmDiscardIterativeActionResult: 'save' })
    );
    await press('[data-iterative-new-action]');
    await press('[data-iterative-action-back]');
    const writes = calls.filter(([name]) => name === 'updateSystem');
    assert.equal(writes.length, 1, 'Save writes the draft once');
    assert.deepEqual(
      writes[0][2].iterative.actions.map((action) => action.id),
      ['stoke', 'action']
    );
    assert.equal(managerView(), 'iterative-actions');
    assert.equal(countOf('actions'), '2');
  });

  it('leaves a dirty draft behind when the GM discards it', async () => {
    const calls = await openIterativeRoute('Actions');
    await press('[data-iterative-new-action]');
    await press('[data-iterative-action-back]');
    assert.ok(calls.some(([name]) => name === 'confirmDiscardDirtyIterativeActionDraft'));
    assert.equal(managerView(), 'iterative-actions');
    assert.ok(
      calls.every(([name]) => !(name === 'updateSystem')),
      'discarding writes nothing'
    );
  });

  it('saves a new draft under an id minted from its label, then offers Delete and Duplicate', async () => {
    const calls = await openIterativeRoute('Actions');
    await press('[data-iterative-new-action]');
    await press('[data-iterative-action-save]');
    const patch = calls.find(([name]) => name === 'updateSystem')[2];
    assert.deepEqual(
      patch.iterative.actions.map((action) => action.id),
      ['stoke', 'action']
    );
    assert.ok(!target.querySelector('[data-iterative-action-dirty]'), 'saving clears Unsaved');
    assert.ok(target.querySelector('[data-iterative-action-delete]'));
    assert.equal(target.querySelector('[data-iterative-action-duplicate]').disabled, false);
    assert.equal(countOf('actions'), '2');
    await press('[data-iterative-action-back]');
    assert.equal(managerView(), 'iterative-actions', 'a saved draft leaves with no prompt');
    assert.ok(calls.every(([name]) => !(name === 'confirmDiscardDirtyIterativeActionDraft')));
  });

  it('returns to Actions when the action being edited is deleted', async () => {
    const calls = await openIterativeRoute('Actions', iterative(), {
      confirmDialog: async () => true,
    });
    await press('[data-iterative-new-action]');
    await press('[data-iterative-action-save]');
    await press('[data-iterative-action-delete]');
    assert.equal(managerView(), 'iterative-actions');
    const writes = calls.filter(([name]) => name === 'updateSystem');
    assert.deepEqual(
      writes.at(-1)[2].iterative.actions.map((action) => action.id),
      ['stoke']
    );
  });

  it('redirects Counters by the existing precedence when the GM moves to a system that is not iterative', async () => {
    await openIterativeRoute('Counters');
    flushSync();
    const view = await switchScopeSystemTo('smithing');
    assert.ok(!view.startsWith('iterative'), `still on ${view}`);
    assert.deepEqual(
      subitemIds().filter((id) => id === 'counters' || id === 'actions'),
      []
    );
  });

  it('discards a dirty action draft without a prompt when a republish makes the system not iterative', async () => {
    const calls = await openIterativeRoute('Actions');
    await press('[data-iterative-new-action]');
    const label = target.querySelector('[data-iterative-action-label]');
    label.value = 'Quench';
    label.dispatchEvent(new Event('input', { bubbles: true }));
    await settle();
    assert.ok(target.querySelector('[data-iterative-action-dirty]'), 'the draft is dirty');
    // Another client switches this system's mode, so the store republishes it.
    store.viewState.update((state) => ({
      ...state,
      selectedSystem: { ...state.selectedSystem, resolutionMode: 'simple' },
    }));
    await settle();
    assert.ok(!managerView().startsWith('iterative'), `still on ${managerView()}`);
    assert.ok(calls.every(([name]) => name !== 'confirmDiscardDirtyIterativeActionDraft'));
    assert.ok(calls.every(([name]) => name !== 'updateSystem'));
  });

  it('redirects an action editor whose action leaves the library to Actions', async () => {
    await openIterativeRoute('Actions');
    await press('[data-iterative-action="stoke"] .fabricate-list-row-open');
    assert.equal(managerView(), 'iterative-action-edit');
    await store.iterative.deleteAction('stoke');
    await settle();
    assert.equal(managerView(), 'iterative-actions');
  });

  it('draws the pill as Validation counts it: blocking for critical issues, Ready for a warning', async () => {
    const reads = {
      id: 'reads',
      label: 'Reads',
      categories: [],
      usesSession: true,
      availability: { combine: 'all', rules: [] },
      costs: [{ id: 'spend', counterId: 'gone', amount: '1', needsEnough: true }],
      check: 'none',
      effects: [],
    };
    const library = { ...LIBRARY, actions: [...LIBRARY.actions, reads] };
    await openIterativeRoute('Actions', iterative(library));
    await press('[data-iterative-action="reads"] .fabricate-list-row-open');
    const pill = () => target.querySelector('[data-iterative-action-pill]');
    assert.equal(pill().dataset.iterativeActionPill, 'blocking');
    assert.equal(pill().textContent.trim(), '1 blocking', 'an unknown counter blocks');
    // The recipe editor's chip: beside the title, at the header rung, with the table's tone and glyph.
    assert.ok(pill().parentElement.matches('[data-iterative-action-heading]'), 'beside the title');
    assert.ok(pill().matches('.is-header.is-danger'), pill().className);
    assert.ok(Boolean(pill().querySelector('.fa-circle-xmark')), 'the blocking glyph');
    const cost = target.querySelector('[data-iterative-amount="cost"]');
    cost.value = '2 +';
    cost.dispatchEvent(new Event('input', { bubbles: true }));
    await settle();
    assert.equal(pill().textContent.trim(), '2 blocking', 'a broken amount adds one');
    await press('[data-iterative-cost-remove="spend"]');
    await press('[data-iterative-add-effect]');
    const amount = target.querySelector(
      ':scope [data-iterative-effect] [data-iterative-amount="effect"]'
    );
    amount.value = '@check.value';
    amount.dispatchEvent(new Event('input', { bubbles: true }));
    await settle();
    assert.ok(target.querySelector('[data-issue-code="iterativeCheckFactWithoutCheck"]'));
    assert.equal(pill().dataset.iterativeActionPill, 'ready', 'a warning reads Ready');
    assert.ok(!target.querySelector('[data-iterative-blocking-notice]'));
  });

  it('mounts the editor for an existing action and judges the pill against the unsaved edit', async () => {
    const calls = await openIterativeRoute('Actions');
    await press('[data-iterative-action="stoke"] .fabricate-list-row-open');
    assert.equal(managerView(), 'iterative-action-edit');
    assert.ok(target.querySelector('[data-iterative-editor]'), 'the route mounts the editor');
    assert.equal(
      target.querySelector('[data-iterative-action-pill]').dataset.iterativeActionPill,
      'ready'
    );
    await press('[data-iterative-add-cost]');
    const amount = target.querySelector('[data-iterative-amount="cost"]');
    amount.value = '2 +';
    amount.dispatchEvent(new Event('input', { bubbles: true }));
    await settle();
    assert.equal(
      target.querySelector('[data-iterative-action-pill]').dataset.iterativeActionPill,
      'blocking'
    );
    assert.equal(
      target.querySelector('[data-iterative-blocking-notice]').dataset.issueCount,
      target.querySelector('[data-iterative-action-pill]').textContent.trim().split(' ', 1)[0]
    );
    assert.ok(
      calls.every(([name]) => name !== 'updateSystem'),
      'editing writes nothing'
    );
    assert.ok(target.querySelector('[data-iterative-action-dirty]'));
  });
}
