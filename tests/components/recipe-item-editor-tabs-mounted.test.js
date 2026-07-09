import { describe, it, before, after, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { resolve } from 'node:path';
import { createMountedComponentHarness } from '../helpers/svelte-component-harness.js';

const repoRoot = resolve(import.meta.dirname, '../..');

const harness = createMountedComponentHarness({
  repoRoot,
  tmpPrefix: 'fabricate-recipe-item-tabs-',
  rawModules: ['src/ui/svelte/util/foundryBridge.js'],
  compiledModules: ['src/ui/svelte/apps/manager/recipe-item/RecipeItemEditorTabs.svelte'],
  componentPath: 'src/ui/svelte/apps/manager/recipe-item/RecipeItemEditorTabs.svelte'
});

before(() => harness.setup());
after(() => harness.teardown());
afterEach(() => harness.remount());

function tabButtons(root) {
  return [...root.querySelectorAll('[role="tab"]')];
}

describe('RecipeItemEditorTabs (mounted)', () => {
  it('renders the four editor tabs in order', async () => {
    const root = await harness.mount({ activeTab: 'overview' });
    const ids = tabButtons(root).map(b => b.getAttribute('data-recipe-item-tab-button'));
    assert.deepEqual(ids, ['overview', 'contents', 'limits', 'validation']);
  });

  it('marks the active tab selected with a roving tabindex', async () => {
    const root = await harness.mount({ activeTab: 'limits' });
    const buttons = tabButtons(root);
    const active = buttons.find(b => b.getAttribute('data-recipe-item-tab-button') === 'limits');
    assert.equal(active.getAttribute('aria-selected'), 'true');
    assert.equal(active.getAttribute('tabindex'), '0');
    const others = buttons.filter(b => b !== active);
    assert.ok(others.every(b => b.getAttribute('tabindex') === '-1'));
  });

  it('renders a neutral count badge on the Contents tab', async () => {
    const root = await harness.mount({ activeTab: 'overview', badges: { contents: 3 } });
    const badge = root.querySelector('[data-recipe-item-tab-badge="contents"]');
    assert.ok(badge, 'expected a contents badge');
    assert.equal(badge.textContent.trim(), '3');
    assert.equal(badge.getAttribute('data-badge-tone'), 'neutral');
    assert.ok(badge.classList.contains('is-neutral'));
  });

  it('omits the contents badge when the count is zero/empty', async () => {
    const root = await harness.mount({ activeTab: 'overview', badges: { contents: '' } });
    assert.equal(root.querySelector('[data-recipe-item-tab-badge="contents"]'), null);
  });

  it('renders a success check badge when validation passes', async () => {
    const root = await harness.mount({ activeTab: 'overview', badges: { validation: [{ label: '✓', tone: 'success' }] } });
    const badge = root.querySelector('[data-recipe-item-tab-badge="validation"]');
    assert.ok(badge);
    assert.equal(badge.textContent.trim(), '✓');
    assert.ok(badge.classList.contains('is-active'), 'success badge reuses the is-active chip tone');
    const button = root.querySelector('[data-recipe-item-tab-button="validation"]');
    assert.ok(!button.classList.contains('is-danger'));
  });

  it('turns the validation tab danger when the badge is a failing count', async () => {
    const root = await harness.mount({ activeTab: 'overview', badges: { validation: [{ label: '2', tone: 'danger' }] } });
    const badge = root.querySelector('[data-recipe-item-tab-badge="validation"]');
    assert.equal(badge.textContent.trim(), '2');
    assert.ok(badge.classList.contains('is-danger'));
    const button = root.querySelector('[data-recipe-item-tab-button="validation"]');
    assert.ok(button.classList.contains('is-danger'), 'the validation tab button carries the danger tone');
  });

  it('fires onSelect when a tab is clicked', async () => {
    const calls = [];
    const root = await harness.mount({ activeTab: 'overview', onSelect: (id) => calls.push(id) });
    root.querySelector('[data-recipe-item-tab-button="contents"]').click();
    assert.deepEqual(calls, ['contents']);
  });

  it('moves selection with arrow keys (wrapping)', async () => {
    const calls = [];
    const root = await harness.mount({ activeTab: 'overview', onSelect: (id) => calls.push(id) });
    const overview = root.querySelector('[data-recipe-item-tab-button="overview"]');
    overview.dispatchEvent(new globalThis.KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
    overview.dispatchEvent(new globalThis.KeyboardEvent('keydown', { key: 'ArrowLeft', bubbles: true }));
    assert.deepEqual(calls, ['contents', 'validation']);
  });
});
