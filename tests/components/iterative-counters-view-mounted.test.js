/**
 * The Counters screen, mounted over the real library section (issue 3009): live-applied edits, the
 * name rule, limits, search-gated reorder, and the delete confirmation.
 */
import assert from 'node:assert/strict';
import { after, afterEach, before, describe, it } from 'node:test';

import { flushSync, mount, tick, unmount } from 'svelte';
import { SvelteMap } from 'svelte/reactivity';
import { writable } from 'svelte/store';

import { confirmCounterDelete } from '../../src/ui/svelte/apps/manager/iterative/iterativeDeleteConfirm.js';
import { createIterativeLibrarySection } from '../../src/ui/svelte/stores/adminIterativeLibrarySection.js';

import { disposeManagerSuite, managerComponent } from './manager-mounted-shared.js';

const VIEW = 'src/ui/svelte/apps/manager/iterative/CountersView.svelte';

const counter = (id, label, extra = {}) => ({ id, label, limit: 'none', ...extra });
const action = (id, label, extra = {}) => ({
  id,
  label,
  categories: [],
  usesSession: true,
  availability: { combine: 'all', rules: [] },
  costs: [],
  check: 'none',
  effects: [],
  ...extra,
});
const LIBRARY = Object.freeze({
  version: 1,
  counters: [
    counter('iron', 'Iron', { limit: 'global', min: 0, max: 9, description: 'Raw ore.' }),
    counter('heat', 'Heat', { limit: 'perRecipe', min: 1, max: 5 }),
    counter('slag', 'Slag'),
  ],
  actions: [
    action('stoke', 'Stoke <b>hot</b>', {
      costs: [{ id: 'burn', counterId: 'heat', amount: '1', needsEnough: true }],
    }),
  ],
});
const RECIPES = [
  {
    id: 'r-shield',
    name: 'Shield & Rim',
    steps: [
      {
        name: 'Frame',
        iterative: { actions: { mode: 'all', actionIds: [] }, hiddenCounterIds: ['heat'] },
      },
    ],
  },
];

let View;
let mounted;
let target;
let harness;

function makeHarness({ iterative = LIBRARY, confirmed = true, ...extra } = {}) {
  const system = { id: 'sys', name: 'Ironworks', iterative: structuredClone(iterative) };
  const calls = { updates: [], dialogs: [], added: 0, nameFocused: 0 };
  const live = new SvelteMap([
    ['counters', structuredClone(system.iterative.counters)],
    ['expanded', ''],
  ]);
  const services = {
    notify: { error: () => {} },
    getCraftingSystemManager: () => ({
      getSystem: () => system,
      updateSystem: async (id, patch) => {
        calls.updates.push([id, structuredClone(patch)]);
        system.iterative = structuredClone(patch.iterative);
      },
    }),
  };
  const section = createIterativeLibrarySection({
    services,
    selectedSystemId: writable('sys'),
    refresh: async () => live.set('counters', structuredClone(system.iterative.counters)),
    confirmDiscardDirty: () => 'discard',
  });
  const text = (_key, fallback) => fallback;
  const confirmDialog = async (options) => {
    calls.dialogs.push(options);
    return confirmed ? options.yes.callback() : options.no.callback();
  };
  const props = {
    get counters() {
      return live.get('counters');
    },
    get expandedId() {
      return live.get('expanded');
    },
    actions: system.iterative.actions,
    recipes: RECIPES,
    systemName: 'Ironworks',
    text,
    onAdd: () => {
      calls.added += 1;
    },
    onUpdate: section.updateCounter,
    onReorder: section.reorderCounters,
    onExpand: (id) => live.set('expanded', id),
    onNameFocused: () => {
      calls.nameFocused += 1;
    },
    onDelete: async (row, uses) =>
      (await confirmCounterDelete({ confirmDialog, text, counter: row, uses })) &&
      (await section.deleteCounter(row.id)),
    ...extra,
  };
  return { calls, live, props, system };
}

async function settle() {
  for (let i = 0; i < 6; i += 1) await new Promise((resolve) => setImmediate(resolve));
  await tick();
  flushSync();
}

async function mountView(options = {}) {
  harness = makeHarness(options);
  target = document.createElement('div');
  target.className = 'fabricate-manager';
  document.body.appendChild(target);
  mounted = mount(View, { target, props: harness.props });
  await settle();
  return harness;
}

const rowOf = (id) => target.querySelector(`[data-iterative-counter="${id}"]`);
const rowIds = () =>
  [...target.querySelectorAll('[data-iterative-counter]')].map(
    (row) => row.dataset.iterativeCounter
  );
const boundsOf = (id) => rowOf(id).querySelectorAll('[data-iterative-counter-bound]');
const nameInput = (id) => target.querySelector(`[data-iterative-counter-name="${id}"]`);
const open = async (id) => {
  rowOf(id).querySelector('[data-sortable-disclosure]').click();
  await settle();
};

async function type(input, value, { commit = true } = {}) {
  input.value = value;
  input.dispatchEvent(new Event('input', { bubbles: true }));
  if (commit) input.dispatchEvent(new Event('change', { bubbles: true }));
  await settle();
}

describe('the Counters screen (issue 3009)', () => {
  before(async () => {
    View = await managerComponent(VIEW);
  });

  afterEach(async () => {
    if (mounted) unmount(mounted);
    mounted = null;
    target?.remove();
    target = null;
    await new Promise((resolve) => setImmediate(resolve));
  });

  after(disposeManagerSuite);

  it('lists the counters in persisted order with their limit and usage, and has no Save', async () => {
    await mountView();
    assert.deepEqual(rowIds(), ['iron', 'heat', 'slag']);
    assert.equal(
      rowOf('iron').querySelector('[data-iterative-counter-limit]').textContent.trim(),
      'Global 0 to 9'
    );
    assert.equal(
      rowOf('heat').querySelector('[data-iterative-counter-limit]').textContent.trim(),
      'Per recipe · default 1 to 5'
    );
    assert.equal(
      rowOf('heat').querySelector('[data-iterative-counter-usage]').textContent.trim(),
      '1 action · 1 step'
    );
    assert.equal(
      rowOf('slag').querySelector('[data-iterative-counter-usage]').textContent.trim(),
      'Not used yet'
    );
    assert.equal(
      target.querySelector('[data-iterative-counters-count]').textContent.trim(),
      '3 of 3'
    );
    assert.ok(!/save/i.test(target.textContent), 'edits apply as they are made');
  });

  it('shows a typed duplicate or empty name as a described Field error and writes nothing', async () => {
    const { calls } = await mountView();
    await open('heat');
    const input = nameInput('heat');
    await type(input, ' iron ');
    const error = target.querySelector('[data-iterative-name-error="duplicate"]');
    assert.ok(Boolean(error), 'the duplicate-name sentence is shown');
    assert.equal(input.getAttribute('aria-invalid'), 'true');
    assert.equal(input.getAttribute('aria-describedby'), error.querySelector('[id]').id);
    assert.ok(error.textContent.includes('Ironworks') && error.textContent.includes('iron'));
    await type(input, '');
    assert.ok(Boolean(target.querySelector('[data-iterative-name-error="empty"]')));
    assert.equal(calls.updates.length, 0, 'neither value is written');
  });

  it('writes a valid rename once, with the exact next library', async () => {
    const { calls } = await mountView();
    await open('heat');
    await type(nameInput('heat'), 'Fire');
    assert.equal(calls.updates.length, 1);
    const [systemId, patch] = calls.updates[0];
    assert.equal(systemId, 'sys');
    const expected = structuredClone(LIBRARY);
    expected.counters[1].label = 'Fire';
    assert.deepEqual(patch, { iterative: expected });
    assert.ok(!target.querySelector('[data-iterative-name-error]'));
    assert.equal(
      rowOf('heat').querySelector('.manager-iterative-counter-label').textContent,
      'Fire'
    );
  });

  it('writes a change of case alone to a counter’s own name, once', async () => {
    const { calls } = await mountView();
    await open('iron');
    await type(nameInput('iron'), 'IRON');
    assert.equal(calls.updates.length, 1);
    assert.equal(calls.updates[0][1].iterative.counters[0].label, 'IRON');
  });

  it('draws the Duplicate name chip on a persisted duplicate and opens its row', async () => {
    await mountView({
      iterative: {
        version: 1,
        counters: [counter('a', 'Heat'), counter('b', 'heat '), counter('c', 'Slag')],
        actions: [],
      },
    });
    const chips = target.querySelectorAll('[data-iterative-duplicate-chip]');
    assert.equal(chips.length, 2);
    assert.ok(!rowOf('c').querySelector('[data-iterative-duplicate-chip]'));
    assert.equal(rowOf('a').querySelector('.fabricate-sortable-list-body').hidden, false, 'opened');
    assert.ok(Boolean(target.querySelector('[data-iterative-name-error="duplicate"]')));
  });

  it('hides the steppers under No limit and keeps the stored bounds', async () => {
    const { calls } = await mountView();
    await open('iron');
    assert.equal(boundsOf('iron').length, 2);
    rowOf('iron').querySelector('[data-iterative-limit-option="none"]').click();
    await settle();
    assert.equal(calls.updates.length, 1);
    const written = calls.updates[0][1].iterative.counters[0];
    assert.equal(written.limit, 'none');
    assert.equal(written.min, 0);
    assert.equal(written.max, 9);
    assert.equal(boundsOf('iron').length, 0);
  });

  it('writes a Global min and max as each step is taken', async () => {
    const { calls } = await mountView();
    await open('iron');
    const [min, max] = boundsOf('iron');
    await type(min, '2', { commit: false });
    await type(max, '12', { commit: false });
    assert.equal(calls.updates.length, 2);
    assert.equal(calls.updates[0][1].iterative.counters[0].min, 2);
    assert.equal(calls.updates[1][1].iterative.counters[0].max, 12);
  });

  it('offers default steppers and a clear under Per recipe, and clearing drops the key', async () => {
    const { calls } = await mountView();
    await open('heat');
    assert.equal(boundsOf('heat').length, 2);
    target.querySelector('[data-iterative-counter-clear="min"]').click();
    await settle();
    const written = calls.updates[0][1].iterative.counters[1];
    assert.ok(!('min' in written), 'an unset bound is dropped, not stored as null');
    assert.equal(written.max, 5);
    assert.ok(!target.querySelector('[data-iterative-counter-clear="min"]'));
  });

  it('persists an inverted min and max and shows the error', async () => {
    const { calls } = await mountView();
    await open('iron');
    const [min] = boundsOf('iron');
    await type(min, '20', { commit: false });
    assert.equal(calls.updates[0][1].iterative.counters[0].min, 20);
    const error = target.querySelector('[data-iterative-bounds-error]');
    assert.equal(error.textContent.trim(), 'Min 20 is above max 9.');
    for (const stepper of boundsOf('iron')) {
      assert.equal(stepper.getAttribute('aria-invalid'), 'true');
      assert.equal(stepper.getAttribute('aria-describedby'), error.querySelector('[id]').id);
    }
  });

  it('draws the grip and rocker, and a rocker move writes the order and announces it', async () => {
    const { calls } = await mountView();
    assert.equal(target.querySelectorAll('[data-sortable-grip]').length, 3);
    rowOf('iron').querySelector('[data-sortable-move="down"]').click();
    await settle();
    assert.deepEqual(
      calls.updates[0][1].iterative.counters.map((entry) => entry.id),
      ['heat', 'iron', 'slag']
    );
    assert.deepEqual(rowIds(), ['heat', 'iron', 'slag']);
    assert.ok(
      target.querySelector('[data-sortable-list-status]').textContent.includes('Iron'),
      'the new position is announced'
    );
  });

  it('withholds the grip and rocker while a search is active', async () => {
    await mountView();
    const search = target.querySelector(':scope .fabricate-search input');
    await type(search, 'he', { commit: false });
    assert.deepEqual(rowIds(), ['heat']);
    assert.equal(target.querySelectorAll('[data-sortable-grip]').length, 0);
    assert.equal(target.querySelectorAll('[data-sortable-move]').length, 0);
    assert.equal(
      target.querySelector('[data-iterative-counters-count]').textContent.trim(),
      '1 of 3'
    );
  });

  it('shows the filtered-empty state and clears the search', async () => {
    await mountView();
    await type(target.querySelector(':scope .fabricate-search input'), 'zzz', { commit: false });
    assert.equal(rowIds().length, 0);
    target.querySelector('[data-clear-filters="counters"]').click();
    await settle();
    assert.equal(rowIds().length, 3);
  });

  it('offers New counter from the empty state', async () => {
    const { calls } = await mountView({ iterative: { version: 1, counters: [], actions: [] } });
    assert.ok(Boolean(target.querySelector('.manager-empty, [data-iterative-add-counter]')));
    target.querySelector('[data-iterative-add-counter]').click();
    assert.equal(calls.added, 1);
  });

  it('opens the added row and focuses its Name once', async () => {
    const { live, calls } = await mountView();
    live.set('expanded', 'slag');
    harness.props.focusNameId = 'slag';
    unmount(mounted);
    mounted = mount(View, { target, props: harness.props });
    await settle();
    assert.ok(document.activeElement === nameInput('slag'), 'Name has focus');
    assert.equal(calls.nameFocused, 1);
  });

  it('lists every use, escaped, in the confirmation and keeps the counter on Cancel', async () => {
    const { calls } = await mountView({ confirmed: false });
    rowOf('heat').querySelector('[data-iterative-counter-delete]').click();
    await settle();
    assert.equal(calls.dialogs.length, 1);
    const { title, content } = calls.dialogs[0];
    assert.equal(title, 'Delete Heat?');
    assert.ok(content.includes('Heat is used in 2 places:'), content);
    assert.ok(
      content.includes('<li>Stoke &lt;b&gt;hot&lt;/b&gt; · cost</li>'),
      'the action name is escaped, with how it uses the counter'
    );
    assert.deepEqual(
      [calls.dialogs[0].yes.label, calls.dialogs[0].no.label],
      ['Delete counter', 'Cancel']
    );
    assert.ok(content.includes('<li>Shield &amp; Rim › Frame</li>'), 'the step is named');
    assert.ok(!content.includes('<b>hot</b>'));
    assert.equal(calls.updates.length, 0);
    assert.deepEqual(rowIds(), ['iron', 'heat', 'slag']);
  });

  it('confirms an unused counter with no list, deletes it and announces it', async () => {
    const { calls } = await mountView();
    rowOf('slag').querySelector('[data-iterative-counter-delete]').click();
    await settle();
    const { content } = calls.dialogs[0];
    assert.ok(!content.includes('<ul>'), content);
    assert.ok(content.includes('Slag is not used'));
    assert.deepEqual(
      calls.updates[0][1].iterative.counters.map((entry) => entry.id),
      ['iron', 'heat']
    );
    assert.ok(
      target
        .querySelector('[data-iterative-counters-status]')
        .textContent.includes('Slag deleted.'),
      'announced through the screen’s live region'
    );
    assert.ok(
      document.activeElement === rowOf('heat').querySelector('[data-sortable-disclosure]'),
      'the last row hands focus to the row before it'
    );
  });

  it('hands focus to the next row after a delete', async () => {
    await mountView();
    rowOf('iron').querySelector('[data-iterative-counter-delete]').click();
    await settle();
    assert.ok(document.activeElement === rowOf('heat').querySelector('[data-sortable-disclosure]'));
  });

  it('announces deleting the last counter, and hands focus to the empty state’s adder', async () => {
    await mountView({
      iterative: { version: 1, counters: [counter('slag', 'Slag')], actions: [] },
    });
    rowOf('slag').querySelector('[data-iterative-counter-delete]').click();
    await settle();
    assert.ok(!target.querySelector('[data-iterative-counter-list]'), 'the list is gone');
    assert.ok(
      target
        .querySelector('[data-iterative-counters-status]')
        .textContent.includes('Slag deleted.'),
      'the announcement outlives the list'
    );
    assert.ok(document.activeElement === target.querySelector('[data-iterative-add-counter]'));
  });

  it('localizes the explainer’s example when there are no counters', async () => {
    harness = makeHarness({ iterative: { version: 1, counters: [], actions: [] } });
    target = document.createElement('div');
    target.className = 'fabricate-manager';
    document.body.appendChild(target);
    const text = (key, fallback) =>
      key === 'FABRICATE.Admin.Manager.Iterative.ExplainerExample' ? 'Hitze' : fallback;
    mounted = mount(View, { target, props: { ...harness.props, text } });
    await settle();
    assert.ok(target.querySelector('[data-iterative-explainer]').textContent.includes('Hitze'));
  });

  it('renders a library newer than this build as a blocking Notice with no list', async () => {
    await mountView({ unsupported: true, counters: [] });
    assert.ok(Boolean(target.querySelector('[data-iterative-unsupported-notice][role="alert"]')));
    assert.ok(!target.querySelector('[data-iterative-counter-list]'));
  });
});
