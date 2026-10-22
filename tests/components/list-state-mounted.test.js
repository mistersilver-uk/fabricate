/**
 * Issue 2548 — `<ListState>`: a browse list's loading form, an `aria-busy` region holding a status
 * line over static skeleton rows, its error form, a danger `Notice`, and otherwise the list's own
 * body with nothing around it. Loading masks error, and error masks the body.
 */
import assert from 'node:assert/strict';
import { resolve } from 'node:path';
import { after, afterEach, before, describe, it } from 'node:test';

import { createRawSnippet } from '../../node_modules/svelte/src/index-client.js';
import { createMountedComponentHarness } from '../helpers/svelte-component-harness.js';

const repoRoot = resolve(import.meta.dirname, '../..');
const component = (name) => `src/ui/svelte/components/${name}.svelte`;

const harness = createMountedComponentHarness({
  repoRoot,
  tmpPrefix: 'fabricate-list-state-',
  compiledModules: ['Notice', 'ListState'].map(component),
  componentPath: component('ListState'),
  rootClass: 'fabricate fabricate-manager',
});

const snippet = (html) => createRawSnippet(() => ({ render: () => html }));
const body = () => snippet('<ul class="probe-body"><li>Alchemy</li></ul>');

const LABEL = 'Loading crafting systems…';
const TITLE = 'Could not load the gathering environments';
const DETAIL = '"fabricate.gatheringEnvironments" is not a registered game setting.';
const FOCUSABLE = 'button, a[href], input, select, textarea, [tabindex], [contenteditable]';

const regionOf = (target) => target.querySelector('.fabricate-list-state');
const skeletonRowsOf = (target) => [...target.querySelectorAll('.fabricate-list-state-row')];

describe('ListState (issue 2548)', () => {
  before(() => harness.setup());
  afterEach(() => harness.remount());
  after(() => harness.teardown());

  it('(a) draws loading as an aria-busy region holding a status line over three rows', async () => {
    const target = await harness.mount({ loading: true, loadingLabel: LABEL, children: body() });
    const region = regionOf(target);
    assert.ok(Boolean(region), 'the loading region renders');
    assert.equal(region.getAttribute('aria-busy'), 'true');
    const status = region.querySelector('p');
    assert.equal(status?.getAttribute('role'), 'status', 'the line is a status');
    assert.equal(status.textContent, LABEL);
    assert.equal(skeletonRowsOf(target).length, 3, 'three skeleton rows by default');
    assert.ok(!target.querySelector('.probe-body'), 'the body does not render while loading');
    assert.ok(!target.querySelector('.fab-notice'), 'no notice renders while loading');
  });

  it('(b) hides the skeleton rows from the accessibility tree and holds nothing focusable', async () => {
    const target = await harness.mount({ loading: true, loadingLabel: LABEL });
    const rows = skeletonRowsOf(target);
    assert.ok(rows.length > 0, 'the rows render');
    for (const row of rows) {
      assert.ok(Boolean(row.closest('[aria-hidden="true"]')), 'a row sits under aria-hidden');
    }
    const status = target.querySelector('[role="status"]');
    assert.ok(!status.closest('[aria-hidden="true"]'), 'the status line stays exposed');
    assert.equal(target.querySelectorAll(FOCUSABLE).length, 0, 'nothing in the form is focusable');
  });

  it('(c) masks the error while loading', async () => {
    const target = await harness.mount({
      loading: true,
      loadingLabel: LABEL,
      error: TITLE,
      errorDetail: DETAIL,
      children: body(),
    });
    assert.ok(Boolean(regionOf(target)), 'loading wins');
    assert.ok(!target.querySelector('.fab-notice'), 'the error does not render');
  });

  it('(d) draws an error as a non-blocking danger notice carrying its title and detail', async () => {
    const target = await harness.mount({ error: TITLE, errorDetail: DETAIL, children: body() });
    const notice = target.querySelector('.fab-notice');
    assert.ok(Boolean(notice), 'the error is a notice');
    assert.equal(notice.getAttribute('data-notice-tone'), 'danger');
    assert.equal(notice.getAttribute('role'), 'status');
    assert.equal(notice.getAttribute('aria-live'), 'polite');
    assert.equal(notice.querySelector('.fab-notice-title').textContent, TITLE);
    assert.equal(notice.querySelector('.fab-notice-detail').textContent, DETAIL);
    assert.ok(!target.querySelector('.manager-empty'), 'the error is not the empty panel');
    assert.ok(!target.querySelector('[aria-busy]'), 'no region is busy');
    assert.ok(!target.querySelector('.probe-body'), 'the body does not render on an error');
  });

  it('(e) renders the detail as text, never as markup', async () => {
    const target = await harness.mount({ error: TITLE, errorDetail: '<b>refused</b>\nretry' });
    const detail = target.querySelector('.fab-notice-detail');
    assert.equal(detail.textContent, '<b>refused</b>\nretry');
    assert.ok(!detail.querySelector('b'), 'no element is parsed out of the detail');
  });

  it('(f) renders the ready body with no element of its own around it', async () => {
    const target = await harness.mount({ error: '', errorDetail: DETAIL, children: body() });
    assert.equal(target.children.length, 1, 'one element in the mount');
    assert.ok(target.firstElementChild.matches('ul.probe-body'), 'and it is the body itself');
    assert.ok(!regionOf(target), 'no loading region');
    assert.ok(!target.querySelector('.fab-notice'), 'no notice');
  });

  it('(g) lands each hook only on its own state, a bare hook as presence, a value as written', async () => {
    const hooks = {
      loadingProps: { 'data-systems-loading': true, 'data-probe': 'loading' },
      errorProps: { 'data-environments-error': '', 'data-probe': 'error' },
    };
    const loading = await harness.mount({ ...hooks, loading: true, loadingLabel: LABEL });
    const region = regionOf(loading);
    assert.equal(region.getAttribute('data-systems-loading'), '');
    assert.equal(region.getAttribute('data-probe'), 'loading');
    assert.ok(!loading.querySelector('[data-environments-error]'), 'no error hook while loading');
    harness.remount();

    const failed = await harness.mount({ ...hooks, error: TITLE });
    const notice = failed.querySelector('.fab-notice');
    assert.equal(notice.getAttribute('data-environments-error'), '');
    assert.equal(notice.getAttribute('data-probe'), 'error');
    assert.ok(!failed.querySelector('[data-systems-loading]'), 'no loading hook on an error');
    harness.remount();

    const ready = await harness.mount({ ...hooks, children: body() });
    assert.ok(!ready.querySelector('[data-systems-loading], [data-environments-error]'));
  });

  it('(h) drops every key that is not a data-* hook, so no state can be overridden', async () => {
    const loading = await harness.mount({
      loading: true,
      loadingLabel: LABEL,
      loadingProps: { 'aria-busy': 'false', class: 'x', role: 'alert', 'data-off': false },
    });
    const region = regionOf(loading);
    assert.equal(region.getAttribute('aria-busy'), 'true', 'the region stays busy');
    assert.ok(!region.classList.contains('x'), 'the class is not overridden');
    assert.ok(!region.hasAttribute('role'), 'no role is added');
    assert.ok(!region.hasAttribute('data-off'), 'a false hook is absent');
    harness.remount();

    const failed = await harness.mount({
      error: TITLE,
      errorProps: {
        role: 'alert',
        'aria-live': 'assertive',
        class: 'x',
        tone: 'info',
        'data-notice-tone': 'info',
        'data-notice-probe': 'x',
      },
    });
    const notice = failed.querySelector('.fab-notice');
    assert.equal(notice.getAttribute('role'), 'status', 'the notice stays non-blocking');
    assert.equal(notice.getAttribute('aria-live'), 'polite');
    assert.equal(notice.getAttribute('data-notice-tone'), 'danger', 'its own tone hook');
    assert.ok(!notice.hasAttribute('data-notice-probe'), 'no data-notice-* key reaches the notice');
    assert.ok(!notice.hasAttribute('tone') && !notice.classList.contains('x'));
  });

  it('(i) draws 1 to 6 skeleton rows, and 3 for any other count', async () => {
    const cases = [
      [1, 1],
      [6, 6],
      [0, 3],
      [7, 3],
      [2.5, 3],
      ['4', 3],
      [NaN, 3],
      [undefined, 3],
    ];
    for (const [skeletonRows, expected] of cases) {
      const target = await harness.mount({ loading: true, loadingLabel: LABEL, skeletonRows });
      assert.equal(skeletonRowsOf(target).length, expected, `skeletonRows ${String(skeletonRows)}`);
      harness.remount();
    }
  });

  it('(j) draws dense rows only at the dense density, any other value reading default', async () => {
    const cases = [
      ['dense', true],
      ['default', false],
      ['compact', false],
      [undefined, false],
    ];
    for (const [density, dense] of cases) {
      const target = await harness.mount({ loading: true, loadingLabel: LABEL, density });
      const rows = skeletonRowsOf(target);
      assert.ok(rows.length > 0, `density ${String(density)} draws rows`);
      for (const row of rows) {
        assert.equal(row.classList.contains('is-dense'), dense, `density ${String(density)}`);
      }
      harness.remount();
    }
  });

  it('(k) moves between loading, error and ready within one mount', async () => {
    const readyWithNoForm = (target, when) => {
      assert.ok(Boolean(target.querySelector('.probe-body')), `${when}: the body renders`);
      assert.ok(!regionOf(target), `${when}: no loading region`);
      assert.ok(!target.querySelector('[aria-busy]'), `${when}: no region is busy`);
      assert.ok(!target.querySelector('.fab-notice'), `${when}: no notice`);
    };
    const target = await harness.mount({ loading: true, loadingLabel: LABEL, children: body() });
    assert.ok(Boolean(regionOf(target)), 'it mounts loading');
    readyWithNoForm(await harness.setProps({ loading: false }), 'loading cleared');

    await harness.setProps({ error: TITLE, errorDetail: DETAIL });
    assert.ok(Boolean(target.querySelector('.fab-notice')), 'an error replaces the body');
    assert.ok(!target.querySelector('.probe-body'), 'and the body leaves');
    readyWithNoForm(await harness.setProps({ error: '' }), 'error cleared');

    await harness.setProps({ loading: true });
    assert.equal(regionOf(target)?.getAttribute('aria-busy'), 'true', 'ready returns to loading');
    assert.ok(!target.querySelector('.probe-body'), 'and the body leaves again');
  });
});
