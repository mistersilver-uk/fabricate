/**
 * The iterative library's shell: its rail entries and counts, its routes and redirects, its header
 * and its route-exit guard, mounted through the root against the store double (issue 3009).
 */
import assert from 'node:assert/strict';
import { afterEach, before, it } from 'node:test';
import { flushSync, unmount } from 'svelte';

import { createManagerMounts } from '../helpers/manager/managerMount.js';
import { createManagerQueries } from '../helpers/manager/managerQueries.js';
import { shippedString, useShippedLocalization } from '../helpers/manager/managerLocalization.js';
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

const queries = createManagerQueries(() => target);
const { craftingParent, craftingSubitem, managerTitle, switchScopeSystemTo } = queries;
const { mountManager } = createManagerMounts({
  queries,
  component: () => Component,
  adopt: (nextMounted, nextTarget) => {
    mounted = nextMounted;
    target = nextTarget;
  },
  adoptStore: () => {},
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
  Array.from(target.querySelectorAll('#manager-crafting-submenu .manager-nav-subitem')).map(
    (button) => button.id.replace('manager-crafting-nav-', '')
  );
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
    assert.ok(!ids.includes('counters') && !ids.includes('actions'), ids.join());
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
  });

  it('refuses every write while the library was made by a newer version', async () => {
    const calls = await openIterativeRoute(
      'Counters',
      iterative({ version: 2, counters: [], actions: [] })
    );
    assert.equal(target.querySelector('[data-iterative-new-counter]').disabled, true);
    assert.ok(target.querySelector('[data-iterative-unsupported]'));
    await press('[data-iterative-new-counter]');
    assert.ok(!calls.some(([name]) => name === 'updateSystem'));
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
    assert.ok(!calls.some(([name]) => name === 'updateSystem'));
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

  it('leaves a dirty draft behind when the GM discards it', async () => {
    const calls = await openIterativeRoute('Actions');
    await press('[data-iterative-new-action]');
    await press('[data-iterative-action-back]');
    assert.ok(calls.some(([name]) => name === 'confirmDiscardDirtyIterativeActionDraft'));
    assert.equal(managerView(), 'iterative-actions');
    assert.ok(!calls.some(([name]) => name === 'updateSystem'), 'discarding writes nothing');
  });

  it('saves a new draft under an id minted from its label, then offers Delete and Duplicate', async () => {
    const calls = await openIterativeRoute('Actions');
    await press('[data-iterative-new-action]');
    await press('[data-iterative-action-save]');
    const [, , patch] = calls.find(([name]) => name === 'updateSystem');
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
    assert.ok(!calls.some(([name]) => name === 'confirmDiscardDirtyIterativeActionDraft'));
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
}
