import { describe, it, before, after, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { resolve } from 'node:path';
import { createMountedComponentHarness } from '../helpers/svelte-component-harness.js';

const repoRoot = resolve(import.meta.dirname, '../..');

const harness = createMountedComponentHarness({
  repoRoot,
  tmpPrefix: 'fabricate-crafting-effect-',
  rawModules: ['src/ui/svelte/util/foundryBridge.js'],
  compiledModules: ['src/ui/svelte/apps/manager/CraftingEffectPanel.svelte'],
  componentPath: 'src/ui/svelte/apps/manager/CraftingEffectPanel.svelte'
});

function badgeFor(root, rowKey) {
  return root.querySelector(`[data-crafting-effect-row="${rowKey}"] .manager-crafting-effect-badge`);
}

before(() => harness.setup());
after(() => harness.teardown());
afterEach(() => harness.remount());

describe('CraftingEffectPanel (mounted)', () => {
  it('renders the four labelled rows and the summary strip', async () => {
    const root = await harness.mount({
      effect: { showAccess: true, showBooksScrolls: true, showLimitedUse: true, showLearningLimits: true },
      summary: 'Everything is shown.'
    });
    assert.equal(root.querySelectorAll('.manager-crafting-effect-row').length, 4);
    assert.equal(root.querySelector('[data-crafting-effect-summary] span').textContent, 'Everything is shown.');
  });

  it('reads Access and Books & Scrolls as Visible/Hidden per the effect flags', async () => {
    const root = await harness.mount({
      effect: { showAccess: true, showBooksScrolls: false, showLimitedUse: false, showLearningLimits: false },
      summary: 's'
    });
    const access = badgeFor(root, 'access');
    assert.equal(access.getAttribute('data-crafting-effect-state'), 'on');
    assert.equal(access.querySelector('span').textContent, 'Visible');

    const books = badgeFor(root, 'books-scrolls');
    assert.equal(books.getAttribute('data-crafting-effect-state'), 'off');
    assert.equal(books.querySelector('span').textContent, 'Hidden');
  });

  it('reads the control rows as Shown/Hidden per the effect flags', async () => {
    const root = await harness.mount({
      effect: { showAccess: false, showBooksScrolls: false, showLimitedUse: true, showLearningLimits: false },
      summary: 's'
    });
    const limited = badgeFor(root, 'limited-use');
    assert.equal(limited.getAttribute('data-crafting-effect-state'), 'on');
    assert.equal(limited.querySelector('span').textContent, 'Shown');

    const learning = badgeFor(root, 'learning-limits');
    assert.equal(learning.getAttribute('data-crafting-effect-state'), 'off');
    assert.equal(learning.querySelector('span').textContent, 'Hidden');
  });

  it('treats a missing effect shape as all-hidden', async () => {
    const root = await harness.mount({ effect: {}, summary: 'nothing' });
    const states = [...root.querySelectorAll('.manager-crafting-effect-badge')]
      .map(b => b.getAttribute('data-crafting-effect-state'));
    assert.deepEqual(states, ['off', 'off', 'off', 'off']);
  });
});
