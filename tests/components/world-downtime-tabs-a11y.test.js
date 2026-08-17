/**
 * THE CORE-FALLBACK DOWNTIME TAB STRIP'S ARIA CONTRACT (issue 1208).
 *
 * Two defects found while reviewing the player rail (#1198) and fixed there, which also
 * existed in this already-merged Manager component:
 *
 *  1. The `role="tooltip"` spans were emitted INSIDE the `role="tablist"`. A tablist's only
 *     permitted owned role is `tab`, so axe-core's `aria-required-children` reports them and
 *     a screen reader deriving "tab N of M" from owned children can count the extra nodes.
 *  2. The roving `tabindex` was bound to `activeTabId` with no fallback, so an `activeTabId`
 *     naming no rendered tab made EVERY button `-1` and took the strip out of the Tab order.
 *
 * Defect 2 is driven directly here because no in-tree caller reaches it — which is precisely
 * why it needs a test rather than a reachability argument.
 */
import assert from 'node:assert/strict';
import { resolve } from 'node:path';
import { after, afterEach, before, describe, it } from 'node:test';

import { flushSync, tick } from 'svelte';

import { createMountedComponentHarness } from '../helpers/svelte-component-harness.js';

/** Settle the component after a dispatched DOM event, the way the mounted suites do. */
async function settle() {
  flushSync();
  await tick();
  flushSync();
}

const repoRoot = resolve(import.meta.dirname, '../..');

const harness = createMountedComponentHarness({
  repoRoot,
  tmpPrefix: 'fabricate-downtime-tabs-a11y-',
  rawModules: ['src/ui/svelte/util/foundryBridge.js'],
  compiledModules: ['src/ui/svelte/apps/manager/downtime/WorldDowntimeTabs.svelte'],
  componentPath: 'src/ui/svelte/apps/manager/downtime/WorldDowntimeTabs.svelte',
});

before(() => harness.setup());
after(() => harness.teardown());
afterEach(() => harness.remount());

const TABS = Object.freeze([
  {
    id: 'tracking',
    label: 'L.tracking',
    accessibleName: 'A.tracking',
    tooltip: 'T.tracking',
    icon: 'fas fa-chart-line',
  },
  {
    id: 'activities',
    label: 'L.activities',
    accessibleName: 'A.activities',
    tooltip: 'T.activities',
    icon: 'fas fa-list',
  },
  {
    id: 'factions',
    label: 'L.factions',
    accessibleName: 'A.factions',
    tooltip: 'T.factions',
    icon: 'fas fa-flag',
  },
  {
    id: 'settings',
    label: 'L.settings',
    accessibleName: 'A.settings',
    tooltip: 'T.settings',
    icon: 'fas fa-gear',
  },
]);

const tabStops = (root) =>
  [...root.querySelectorAll('[data-downtime-tab]')].map((tab) => tab.getAttribute('tabindex'));

const selections = (root) =>
  [...root.querySelectorAll('[data-downtime-tab]')].map((tab) => tab.getAttribute('aria-selected'));

describe('the Downtime tab strip keeps its ARIA contract', () => {
  it('emits every tooltip OUTSIDE the tablist, while each button still points at its own', async () => {
    const root = await harness.mount({ tabs: TABS, activeTabId: 'tracking', onSelect: () => {} });
    const tablist = root.querySelector('[data-downtime-tablist]');
    assert.ok(tablist, 'the strip renders a tablist');

    assert.equal(
      tablist.querySelectorAll('[role="tooltip"]').length,
      0,
      'a tablist may own only `tab`, so no tooltip may be inside it'
    );
    assert.equal(
      root.querySelectorAll('[role="tooltip"][data-downtime-tooltip]').length,
      TABS.length,
      'every tooltip is still rendered, as a sibling of the tablist'
    );
    assert.deepEqual(
      [...tablist.children].map((child) => child.getAttribute('role')),
      TABS.map(() => 'tab'),
      'the tablist owns tab buttons DIRECTLY, with no wrapper between'
    );

    // The association each button declares must survive the move: an IDREF resolves
    // document-wide, so the target only has to exist somewhere in the document.
    for (const tab of TABS) {
      const button = root.querySelector(`[data-downtime-tab="${tab.id}"]`);
      const describedBy = button.getAttribute('aria-describedby');
      assert.equal(describedBy, `world-downtime-tooltip-${tab.id}`);
      assert.ok(root.querySelector(`#${describedBy}`), `${describedBy} resolves to a real node`);
    }
  });

  it('gives the ACTIVE tab the only tab stop', async () => {
    const root = await harness.mount({ tabs: TABS, activeTabId: 'factions', onSelect: () => {} });
    assert.deepEqual(tabStops(root), ['-1', '-1', '0', '-1']);
    assert.deepEqual(selections(root), ['false', 'false', 'true', 'false']);
  });

  it('falls back to the FIRST tab when activeTabId names no rendered tab, and selects none', async () => {
    const root = await harness.mount({ tabs: TABS, activeTabId: 'nonesuch', onSelect: () => {} });

    assert.deepEqual(
      tabStops(root),
      ['0', '-1', '-1', '-1'],
      'the strip must stay reachable by Tab even when the active id matches nothing'
    );
    // Bound to `activeTabId`, NOT to the fallback: the APG fallback governs which button is
    // the tab stop, never which tab reports as selected. Announcing a selection the panel
    // does not show would be worse than announcing none.
    assert.deepEqual(selections(root), ['false', 'false', 'false', 'false']);
  });

  it('keeps a tab stop when there is exactly one tab', async () => {
    const single = await harness.mount({
      tabs: [TABS[0]],
      activeTabId: 'nonesuch',
      onSelect: () => {},
    });
    assert.deepEqual(tabStops(single), ['0']);
  });

  it('renders no tabs and no orphan tooltips when the tab list is empty', async () => {
    const none = await harness.mount({ tabs: [], activeTabId: 'nonesuch', onSelect: () => {} });
    assert.equal(none.querySelectorAll('[data-downtime-tab]').length, 0);
    assert.equal(
      none.querySelectorAll('[role="tooltip"]').length,
      0,
      'no tabs means no tooltips, rather than an orphan tooltip list'
    );
  });

  it('shows one tooltip on focus and on hover, and hides it again', async () => {
    const root = await harness.mount({ tabs: TABS, activeTabId: 'tracking', onSelect: () => {} });
    const shown = () =>
      [...root.querySelectorAll('[data-downtime-tooltip]')]
        .filter((tip) => tip.classList.contains('is-described'))
        .map((tip) => tip.getAttribute('data-downtime-tooltip'));

    assert.deepEqual(shown(), [], 'nothing is described before any interaction');

    const activities = root.querySelector('[data-downtime-tab="activities"]');
    activities.dispatchEvent(new globalThis.Event('focus', { bubbles: false }));
    await settle();
    assert.deepEqual(shown(), ['activities'], 'focus describes exactly its own tab');

    activities.dispatchEvent(new globalThis.Event('blur', { bubbles: false }));
    await settle();
    assert.deepEqual(shown(), [], 'blur clears it');

    const factions = root.querySelector('[data-downtime-tab="factions"]');
    factions.dispatchEvent(new globalThis.MouseEvent('mouseenter'));
    await settle();
    assert.deepEqual(shown(), ['factions'], 'hover describes exactly its own tab');

    factions.dispatchEvent(new globalThis.MouseEvent('mouseleave'));
    await settle();
    assert.deepEqual(shown(), [], 'mouseleave clears it');
  });
});
