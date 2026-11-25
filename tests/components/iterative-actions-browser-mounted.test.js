/**
 * The Actions browser, mounted (issue 3009): rows and cards, the toggles and category filter that
 * combine, the pager, both empty states and the filtered one, and state that outlives the editor.
 */
import assert from 'node:assert/strict';
import { after, afterEach, before, describe, it } from 'node:test';

import { flushSync, mount, tick, unmount } from 'svelte';
import { SvelteMap } from 'svelte/reactivity';

import { createActionsBrowserState } from '../../src/ui/model/managerBrowserViewState.js';
import { chooseSelectOption } from '../helpers/select-control.js';

import { disposeManagerSuite, managerComponent } from './manager-mounted-shared.js';

const VIEW = 'src/ui/svelte/apps/manager/iterative/ActionsBrowserView.svelte';

const counter = (id, label) => ({ id, label, limit: 'none' });
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
const COUNTERS = [counter('heat', 'Heat'), counter('temper', 'Temper')];
const ACTIONS = [
  action('stoke', 'Stoke the forge', {
    description: 'Feed the fire.',
    categories: ['Fire'],
    effects: [{ id: 'warm' }],
  }),
  action('strike', 'Strike', {
    categories: ['Forging'],
    check: 'roll',
    costs: [
      { id: 'spend', counterId: 'heat', amount: '1' },
      { id: 'gone', counterId: 'missing', amount: '2' },
    ],
    effects: [{ id: 'a' }, { id: 'b' }],
  }),
  action('quench', 'Quench', { categories: ['Fire', 'Forging'] }),
  action('polish', 'Polish'),
];

/** A reactive stand-in for the shell's lifted `$state` object: reads track, writes notify. */
function liftedState() {
  const cells = new SvelteMap(Object.entries(createActionsBrowserState()));
  return new Proxy(
    {},
    {
      get: (_target, key) => cells.get(key),
      set: (_target, key, value) => {
        cells.set(key, value);
        return true;
      },
    }
  );
}

let View;
let mounted;
let target;
let calls;

function mountView(props = {}) {
  calls = { opened: [], created: 0 };
  target = document.createElement('div');
  target.className = 'fabricate-manager';
  document.body.appendChild(target);
  mounted = mount(View, {
    target,
    props: {
      actions: ACTIONS,
      counters: COUNTERS,
      blocking: new Map(),
      browserState: liftedState(),
      onOpen: (id) => {
        calls.opened.push(id);
      },
      onNew: () => {
        calls.created += 1;
      },
      ...props,
    },
  });
  flushSync();
  return target;
}

const settle = async () => {
  await tick();
  flushSync();
};
const rowIds = () =>
  [...target.querySelectorAll(':scope [data-iterative-action-list] > [data-iterative-action]')].map(
    (row) => row.dataset.iterativeAction
  );
const filter = (key) => target.querySelector(`[data-iterative-filter="${key}"]`);
async function press(key) {
  filter(key).click();
  await settle();
}

describe('the Actions browser (issue 3009)', () => {
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

  it('lists each action with its cost, check state and effect count, and opens one', async () => {
    mountView();
    assert.deepEqual(rowIds(), ['stoke', 'strike', 'quench', 'polish']);
    const strike = target.querySelector('[data-iterative-action="strike"]');
    assert.deepEqual(
      [...strike.querySelectorAll(':scope [data-iterative-action-costs] .manager-chip')].map(
        (chip) => chip.textContent.trim()
      ),
      ['Heat −1', 'missing −2']
    );
    assert.equal(
      strike.querySelector('[data-iterative-action-check]').dataset.iterativeActionCheck,
      'roll'
    );
    assert.equal(
      strike.querySelector('[data-iterative-action-effects]').textContent.trim(),
      '2 effects'
    );
    const stoke = target.querySelector('[data-iterative-action="stoke"]');
    assert.equal(
      stoke.querySelector('[data-iterative-action-check]').dataset.iterativeActionCheck,
      'none'
    );
    assert.equal(
      stoke.querySelector('[data-iterative-action-effects]').textContent.trim(),
      '1 effect'
    );
    assert.ok(
      target
        .querySelector('[data-iterative-action="polish"]')
        .textContent.includes('No description')
    );
    assert.equal(
      target.querySelector('[data-iterative-actions-count]').textContent.trim(),
      '4 of 4'
    );
    strike.querySelector('.fabricate-list-row-open').click();
    assert.deepEqual(calls.opened, ['strike']);
  });

  it('puts the dashed New action under the list and starts a new action from it', async () => {
    mountView();
    const footer = target.querySelector('[data-iterative-footer-new-action]');
    assert.ok(Boolean(footer));
    const list = target.querySelector('[data-iterative-action-list]');
    assert.ok(
      Boolean(list.compareDocumentPosition(footer) & 4),
      'the footer follows the list inside the scroll section'
    );
    footer.click();
    assert.equal(calls.created, 1);
  });

  it('switches to cards through the toggle, and a card opens its action', async () => {
    mountView();
    target.querySelector('[data-iterative-view-option="grid"]').click();
    await settle();
    assert.equal(
      target.querySelector('[data-iterative-action-list]').dataset.iterativeArrangement,
      'grid'
    );
    assert.ok(target.querySelector('[data-iterative-action-list]').classList.contains('is-grid'));
    const card = target.querySelector('[data-iterative-action="quench"]');
    assert.ok(card.classList.contains('is-card'));
    card.querySelector('.fabricate-list-row-open').click();
    assert.deepEqual(calls.opened, ['quench']);
  });

  it('says counters come first, and offers no button, when there are none', async () => {
    mountView({ actions: [], counters: [] });
    const empty = target.querySelector('[data-iterative-actions-empty="no-counters"]');
    assert.ok(Boolean(empty));
    assert.ok(empty.textContent.includes('this system has none. Add counters first.'));
    assert.ok(!empty.querySelector('button'), 'nothing to press until a counter exists');
    assert.ok(
      !target.querySelector('[data-iterative-footer-new-action]'),
      'no footer over an empty library'
    );
  });

  it('says what an action does, and enables New action, when there are counters but no actions', async () => {
    mountView({ actions: [] });
    const empty = target.querySelector('[data-iterative-actions-empty="no-actions"]');
    assert.ok(Boolean(empty));
    assert.ok(
      empty.textContent.includes(
        'What each action costs, whether it rolls the check, and what it changes.'
      )
    );
    const button = target.querySelector('[data-iterative-empty-new-action]');
    assert.equal(button.disabled, false);
    button.click();
    assert.equal(calls.created, 1);
  });

  it('disables the footer New action while the library has actions but no counters', async () => {
    mountView({ counters: [] });
    assert.equal(target.querySelector('[data-iterative-footer-new-action]').disabled, true);
  });

  it('narrows by Rolls check, No check and Has issues, each a pressed toggle', async () => {
    mountView({ blocking: new Map([['quench', 2]]), issues: new Map([['quench', 2]]) });
    await press('rollsCheck');
    assert.equal(filter('rollsCheck').getAttribute('aria-pressed'), 'true');
    assert.deepEqual(rowIds(), ['strike']);
    await press('rollsCheck');
    await press('noCheck');
    assert.deepEqual(rowIds(), ['stoke', 'quench', 'polish']);
    await press('hasIssues');
    assert.deepEqual(rowIds(), ['quench']);
    assert.equal(
      target.querySelector('[data-iterative-actions-count]').textContent.trim(),
      '1 of 4'
    );
  });

  it('combines the toggles with the category, and Clear filters resets them', async () => {
    mountView();
    await press('noCheck');
    chooseSelectOption(target, '[data-iterative-category]', 'Forging');
    await settle();
    assert.deepEqual(rowIds(), ['quench']);
    await press('rollsCheck');
    assert.equal(rowIds().length, 0, 'Rolls check and No check together match nothing');
    const clear = target.querySelector('[data-clear-filters="actions"]');
    assert.ok(Boolean(clear), 'the filtered-empty state offers Clear filters');
    clear.click();
    await settle();
    assert.deepEqual(rowIds(), ['stoke', 'strike', 'quench', 'polish']);
    assert.equal(filter('rollsCheck').getAttribute('aria-pressed'), 'false');
  });

  it('offers a No category choice and filters to the uncategorised', async () => {
    mountView();
    chooseSelectOption(target, '[data-iterative-category]', '__none');
    await settle();
    assert.deepEqual(rowIds(), ['polish']);
  });

  it('lists an action with only warnings under Has issues, with no blocking chip or danger row', async () => {
    mountView({ blocking: new Map(), issues: new Map([['stoke', 1]]) });
    await press('hasIssues');
    assert.deepEqual(rowIds(), ['stoke']);
    const row = target.querySelector('[data-iterative-action="stoke"]');
    assert.ok(!row.querySelector('[data-iterative-blocking-chip]'), 'a warning is not blocking');
    assert.ok(!row.hasAttribute('data-iterative-action-blocking'));
  });

  it('searches the label and description, and counts what it shows', async () => {
    mountView();
    const search = target.querySelector(':scope .fabricate-search input');
    search.value = 'fire';
    search.dispatchEvent(new Event('input', { bubbles: true }));
    await settle();
    assert.deepEqual(rowIds(), ['stoke'], 'the description "Feed the fire." matches');
    assert.equal(
      target.querySelector('[data-iterative-actions-count]').textContent.trim(),
      '1 of 4'
    );
    await press('noCheck');
    assert.deepEqual(rowIds(), ['stoke'], 'the search combines with a toggle');
  });

  it('draws the blocking chip with its count on an action Validation reports on', async () => {
    mountView({ blocking: new Map([['strike', 2]]) });
    const chip = target.querySelector(
      ':scope [data-iterative-action="strike"] [data-iterative-blocking-chip]'
    );
    assert.equal(chip.textContent.trim(), '2 blocking');
    assert.ok(
      !target.querySelector(':scope [data-iterative-action="stoke"] [data-iterative-blocking-chip]')
    );
    assert.ok(
      target
        .querySelector(':scope [data-iterative-action="strike"] .fabricate-list-row-open')
        .getAttribute('aria-label')
        .includes('2 blocking')
    );
  });

  it('pages the list, restores the first page on a filter, and changes the page size', async () => {
    const many = Array.from({ length: 13 }, (_unused, index) =>
      action(`a${index + 1}`, `Action ${index + 1}`)
    );
    mountView({ actions: many });
    assert.equal(rowIds().length, 10);
    target.querySelector('[data-pagination-next]').click();
    await settle();
    assert.deepEqual(rowIds(), ['a11', 'a12', 'a13']);
    await press('noCheck');
    assert.deepEqual(rowIds().slice(0, 2), ['a1', 'a2'], 'a filter restores the first page');
    await press('noCheck');
    target.querySelector('[data-pagination-size-option="25"]').click();
    await settle();
    assert.equal(rowIds().length, 13);
  });

  it('keeps its filters, page and arrangement across the editor round trip', async () => {
    const lifted = liftedState();
    mountView({ browserState: lifted });
    await press('rollsCheck');
    target.querySelector('[data-iterative-view-option="grid"]').click();
    await settle();
    unmount(mounted);
    target.remove();
    mountView({ browserState: lifted });
    assert.equal(filter('rollsCheck').getAttribute('aria-pressed'), 'true');
    assert.deepEqual(rowIds(), ['strike']);
    assert.equal(
      target.querySelector('[data-iterative-action-list]').dataset.iterativeArrangement,
      'grid'
    );
  });

  it('resets the filters when the GM moves to another system', async () => {
    const lifted = liftedState();
    mountView({ browserState: lifted, selectedSystemId: 'a' });
    await press('rollsCheck');
    unmount(mounted);
    target.remove();
    mountView({ browserState: lifted, selectedSystemId: 'b' });
    assert.equal(filter('rollsCheck').getAttribute('aria-pressed'), 'false');
  });

  it('renders a library newer than this build as a blocking Notice with no list', async () => {
    mountView({ unsupported: true, actions: [] });
    assert.ok(Boolean(target.querySelector('[data-iterative-unsupported-notice][role="alert"]')));
    assert.ok(!target.querySelector('[data-iterative-action-list]'));
  });
});
