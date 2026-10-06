/** The manager's title bar, extracted from the root into its own unit (issue 1777). */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { after, afterEach, before, describe, it } from 'node:test';

import { defineStructureContract } from '../helpers/structureContract.js';
import { createMountedComponentHarness } from '../helpers/svelte-component-harness.js';

const repoRoot = resolve(import.meta.dirname, '../..');
const lang = JSON.parse(readFileSync(resolve(repoRoot, 'lang/en.json'), 'utf8'));

const ROOT = 'src/ui/svelte/apps/manager/CraftingSystemManagerRoot.svelte';
const TITLE_BAR = 'src/ui/svelte/apps/manager/ManagerTitleBar.svelte';

/** Each node the title bar draws, addressed by its class or its hook, so a re-inline under either is seen. */
const TITLE_BAR_NODES = [
  { where: ['class', 'manager-titlebar'] },
  { where: ['data-manager-titlebar', true] },
  { where: ['class', 'manager-titlebar-badge'] },
  { where: ['data-manager-titlebar-premium', true] },
  { where: ['data-manager-titlebar-status', true] },
  { where: ['class', 'manager-titlebar-status-text'] },
];

describe('the title bar is drawn by ManagerTitleBar alone', () => {
  // V&A 3: the root renders no title-bar element; the same walk finds each one in the unit.
  defineStructureContract('the root renders ManagerTitleBar and none of its markup', ROOT, {
    renders: ['ManagerTitleBar'],
    rendersTimes: TITLE_BAR_NODES.map((locator) => [locator, 0]),
    spellsNo: ['manager-titlebar'],
    passesProps: [
      ['ManagerTitleBar', 'text'],
      ['ManagerTitleBar', 'premiumInstalled'],
      ['ManagerTitleBar', 'modeLabel'],
      ['ManagerTitleBar', 'outcomeTierCount'],
    ],
  });

  defineStructureContract('ManagerTitleBar draws each title-bar node once', TITLE_BAR, {
    rendersTimes: TITLE_BAR_NODES.map((locator) => [locator, 1]),
    requiresProp: ['text'],
  });
});

const harness = createMountedComponentHarness({
  repoRoot,
  tmpPrefix: 'fabricate-manager-title-bar-',
  compiledModules: [TITLE_BAR],
  componentPath: TITLE_BAR,
});

/** The shipped English copy, so a swapped key reads as a different word. */
function text(key, fallback) {
  const value = key.split('.').reduce((node, part) => node?.[part], lang);
  return typeof value === 'string' ? value : fallback;
}

const titleBarOf = (root) => root.querySelector('.manager-titlebar[data-manager-titlebar]');
const statusOf = (root) => root.querySelector('[data-manager-titlebar-status]');

describe('ManagerTitleBar', () => {
  before(() => harness.setup());
  after(() => harness.teardown());
  afterEach(() => harness.remount());

  it('draws the named strip alone when nothing is installed or selected', async () => {
    const root = await harness.mount({ text });
    const bar = titleBarOf(root);
    assert.ok(Boolean(bar), 'the strip renders with its class and hook');
    assert.equal(bar.parentElement, root, 'it is a direct child of the manager root');
    assert.equal(bar.getAttribute('aria-label'), 'Crafting manager');
    assert.ok(!root.querySelector('[data-manager-titlebar-premium]'), 'no premium mark');
    assert.ok(!statusOf(root), 'no status line without a selected system');
  });

  it('marks an installed companion with the shared PREMIUM span', async () => {
    const root = await harness.mount({ text, premiumInstalled: true });
    const badge = root.querySelector('[data-manager-titlebar-premium]');
    assert.equal(badge.tagName, 'SPAN', 'the mark is a bare span, not a Chip');
    assert.ok(badge.classList.contains('manager-titlebar-badge'), 'it rides the gold badge rule');
    assert.equal(badge.parentElement, titleBarOf(root));
    assert.equal(badge.textContent.trim(), 'PREMIUM');
    const status = 'Fabricate Premium is installed and connected';
    assert.equal(badge.getAttribute('aria-label'), status);
    assert.equal(badge.getAttribute('title'), status);
  });

  it('summarises the selected system as its resolution mode alone when it has no tiers', async () => {
    const root = await harness.mount({ text, modeLabel: 'Routed by check', outcomeTierCount: 0 });
    const status = statusOf(root);
    assert.ok(status.classList.contains('manager-titlebar-status'));
    assert.equal(status.getAttribute('aria-label'), 'Selected system resolution');
    assert.equal(status.getAttribute('title'), 'Routed by check');
    assert.equal(
      status.querySelector('.manager-titlebar-status-text').textContent,
      'Routed by check'
    );
    const icon = status.querySelector('i.manager-titlebar-status-icon');
    assert.ok(icon.classList.contains('fa-circle-info'), 'an information glyph, not a die');
    assert.equal(icon.getAttribute('aria-hidden'), 'true');
  });

  it('appends the outcome-tier count, singular and plural, to the mode', async () => {
    const root = await harness.mount({ text, modeLabel: 'Routed by check', outcomeTierCount: 1 });
    const read = () => statusOf(root).querySelector('.manager-titlebar-status-text').textContent;
    assert.equal(read(), 'Routed by check · 1 outcome tier');
    assert.equal(statusOf(root).getAttribute('title'), 'Routed by check · 1 outcome tier');
    await harness.setProps({ outcomeTierCount: 3 });
    assert.equal(read(), 'Routed by check · 3 outcome tiers');
  });

  it('draws the premium mark before the status line', async () => {
    const root = await harness.mount({
      text,
      premiumInstalled: true,
      modeLabel: 'Simple',
      outcomeTierCount: 0,
    });
    const children = [...titleBarOf(root).children];
    assert.deepEqual(
      children.map((child) => child.className),
      ['manager-titlebar-badge', 'manager-titlebar-status']
    );
  });
});
