/** The Downtime route: the Core preview, the companion contract and the experimental gate. */

import { afterEach, before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { resolve } from 'node:path';
import { flushSync, mount, tick, unmount } from 'svelte';
import { get } from 'svelte/store';
import { createManagerExtensionsRegistry } from '../../src/ui/managerExtensions.js';
import { createPlayerExtensionsRegistry } from '../../src/ui/playerExtensions.js';
import { MANAGER_HOOKS } from '../../src/config/hooks.js';
import { shippedString, useShippedLocalization } from '../helpers/manager/managerLocalization.js';
import { downtimeProvider } from '../helpers/manager/managerStoreFake.js';
import {
  callsWithoutRouteScopedClear,
  createManagerQueries,
  settleDowntimeProvider,
} from '../helpers/manager/managerQueries.js';
import { createManagerMounts } from '../helpers/manager/managerMount.js';
import {
  managerComponents,
  settleBetweenTests,
  settleRouteExit,
  compareStrings,
} from './manager-mounted-shared.js';

let Component;
let mounted;
let target;
// The store the most recent `mountManager` built. Exposed so a case can drive a WORLD
// SETTING CHANGE the way production does — the real `adminStore` republishes `viewState`
// when a setting moves — rather than by remounting, which cannot reproduce a flag flipping
// under a GM who is already standing somewhere (issue 1257).
let mountedStore = null;

// The locators read `target` through a getter rather than a captured element.
const queries = createManagerQueries(() => target);
const {
  activeCompanionPanel,
  assertRailLockSurvivesPresses,
  assertRailLockedOpen,
  downtimeRailIds,
  downtimeTabIds,
  managerSubtitle,
  managerTitle,
  railBodyCollapsed,
  railToggleControl,
  worldNavItem,
} = queries;
const { mountDowntimeManager, mountManager } = createManagerMounts({
  queries,
  component: () => Component,
  adopt: (nextMounted, nextTarget) => {
    mounted = nextMounted;
    target = nextTarget;
  },
  adoptStore: (store) => {
    mountedStore = store;
  },
});

/** Register this route’s cases in `manager-mounted.test.js`’s one describe. */
export function registerDowntimeCases() {
  before(async () => {
    ({ Component } = await managerComponents());
  });

  afterEach(async () => {
    if (mounted) {
      unmount(mounted);
      mounted = null;
    }
    target?.remove();
    target = null;
    await settleBetweenTests();
  });


  it('opens the read-only World Downtime preview with accessible tabs and a secure CTA', async () => {
    const calls = [];
    const registry = createManagerExtensionsRegistry();
    const originalLocalize = globalThis.game.i18n.localize;
    const localized = new Map([
      ['FABRICATE.Admin.Manager.World.Downtime.Tablist', 'Localized downtime sections'],
      ['FABRICATE.Admin.Manager.World.Downtime.Brand', 'Localized Fabricate Premium'],
      ['FABRICATE.Admin.Manager.World.Downtime.Tabs.Tracking.Label', 'Localized tracking'],
      [
        'FABRICATE.Admin.Manager.World.Downtime.Tabs.Tracking.AccessibleName',
        'Open localized tracking preview',
      ],
      [
        'FABRICATE.Admin.Manager.World.Downtime.Tabs.Tracking.Tooltip',
        'Localized tracking tooltip',
      ],
    ]);
    globalThis.game.i18n.localize = (key) => localized.get(key) ?? originalLocalize(key);
    mountDowntimeManager(calls, {}, {}, { managerExtensions: registry });

    worldNavItem('downtime').click();
    await settleRouteExit();

    assert.equal(target.querySelector('.fabricate-manager').dataset.managerView, 'world-downtime');
    // world-downtime is a two-column route.
    assert.ok(
      !target.querySelector('.manager-inspector'),
      'world-downtime renders no inspector aside — the guard and the released CSS column stay in step'
    );
    assert.equal(
      target.querySelector('.manager-header .manager-subtitle').textContent.trim(),
      'Fabricate Premium · Your party-wide command board for every activity and shared project.',
      'the world-downtime subtitle branch survives beside the counted World Parties one'
    );
    assert.equal(worldNavItem('parties').getAttribute('aria-current'), null);
    assert.equal(worldNavItem('downtime').getAttribute('aria-current'), 'page');
    const tabs = Array.from(target.querySelectorAll('[data-downtime-tab]'));
    assert.deepEqual(
      tabs.map((tab) => tab.dataset.downtimeTab),
      ['tracking', 'activities', 'factions', 'settings']
    );
    assert.deepEqual(
      tabs.map((tab) => tab.getAttribute('tabindex')),
      ['0', '-1', '-1', '-1']
    );
    assert.equal(tabs[0].getAttribute('aria-selected'), 'true');
    assert.equal(tabs[0].getAttribute('aria-controls'), 'world-downtime-panel-tracking');
    assert.equal(tabs[0].getAttribute('aria-label'), 'Open localized tracking preview');
    assert.equal(
      target.querySelector('[data-downtime-tablist]').getAttribute('aria-label'),
      'Localized downtime sections'
    );
    assert.match(
      target.querySelector('.downtime-premium').textContent,
      /Localized Fabricate Premium/
    );
    assert.equal(tabs[0].getAttribute('aria-describedby'), 'world-downtime-tooltip-tracking');
    assert.equal(
      target.querySelector('#world-downtime-tooltip-tracking').textContent.trim(),
      'Localized tracking tooltip'
    );
    assert.equal(
      target.querySelectorAll('[role="tabpanel"][id^="world-downtime-panel-"]').length,
      4,
      'every tab owns a stable panel IDREF even while inactive'
    );
    assert.equal(
      target.querySelector('[data-downtime-connected-studio]')?.nextElementSibling,
      target.querySelector('[data-downtime-tablist]'),
      'the fallback keeps the prototype connected-studio card immediately above its tabs'
    );

    tabs[0].dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
    await tick();
    flushSync();
    const activitiesTab = target.querySelector('[data-downtime-tab="activities"]');
    assert.equal(document.activeElement, activitiesTab);
    assert.equal(activitiesTab.getAttribute('aria-selected'), 'true');

    activitiesTab.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowLeft', bubbles: true }));
    await tick();
    flushSync();
    assert.equal(document.activeElement, tabs[0]);
    assert.equal(tabs[0].getAttribute('aria-selected'), 'true');

    tabs[0].dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowLeft', bubbles: true }));
    await tick();
    flushSync();
    const settingsTab = target.querySelector('[data-downtime-tab="settings"]');
    assert.equal(document.activeElement, settingsTab);
    assert.equal(settingsTab.getAttribute('aria-selected'), 'true');

    settingsTab.dispatchEvent(new KeyboardEvent('keydown', { key: 'Home', bubbles: true }));
    await tick();
    flushSync();
    assert.equal(document.activeElement, tabs[0]);
    assert.equal(tabs[0].getAttribute('aria-selected'), 'true');

    tabs[0].dispatchEvent(new KeyboardEvent('keydown', { key: 'End', bubbles: true }));
    await tick();
    flushSync();
    assert.equal(document.activeElement, settingsTab);
    assert.equal(settingsTab.getAttribute('aria-selected'), 'true');
    assert.ok(target.querySelector('[data-downtime-panel="settings"]'));
    const cta = target.querySelector('.downtime-cta');
    assert.equal(cta.href, 'https://www.patreon.com/c/mistersilver');
    assert.equal(cta.target, '_blank');
    assert.equal(cta.rel, 'noopener noreferrer');
    assert.deepEqual(
      callsWithoutRouteScopedClear(calls),
      [],
      'the Core preview and tab interactions call no store write seam'
    );
    globalThis.game.i18n.localize = originalLocalize;
  });

  // The maintainer's own report was "all of the sub-tabs are missing".
  it('nests four locked Downtime previews in the rail and drives one navigation from either trigger', async () => {
    useShippedLocalization();
    const calls = [];
    mountDowntimeManager(calls, {}, {}, { managerExtensions: createManagerExtensionsRegistry() });

    assert.ok(
      !target.querySelector('[data-world-downtime-submenu]'),
      'the group stays collapsed until the route is entered, like the Travel group'
    );
    const parent = worldNavItem('downtime');
    assert.equal(
      parent.getAttribute('title'),
      'Unlock Downtime Studio with Fabricate Premium',
      'the rail entry carries the premium tooltip the design puts on it'
    );
    assert.equal(parent.getAttribute('aria-controls'), 'manager-downtime-submenu');
    assert.equal(parent.getAttribute('aria-expanded'), 'false');
    assert.equal(
      parent.querySelector('[data-world-nav-premium]').textContent.trim(),
      'PREMIUM',
      'the premium mark is a WORD, not an icon a sighted reader loses'
    );
    assert.ok(
      parent.querySelector('[data-world-nav-premium]').classList.contains('manager-nav-premium'),
      'the premium chip is a vehicle of its own (issue 1515), named by the collapsed-rail hide'
    );
    assert.ok(
      !parent.querySelector('[data-world-nav-premium]').classList.contains('manager-nav-count'),
      'and no longer borrows the record-count vehicle to inherit that hide'
    );

    parent.click();
    await settleRouteExit();

    assert.equal(parent.getAttribute('aria-expanded'), 'true');
    const subitems = Array.from(target.querySelectorAll('[data-world-downtime-item]'));
    assert.deepEqual(
      subitems.map((item) => item.dataset.worldDowntimeItem),
      ['tracking', 'activities', 'factions', 'settings']
    );
    assert.deepEqual(
      subitems.map((item) => item.id),
      [
        'manager-downtime-nav-tracking',
        'manager-downtime-nav-activities',
        'manager-downtime-nav-factions',
        'manager-downtime-nav-settings',
      ]
    );
    assert.deepEqual(
      subitems.map((item) => item.querySelector('.manager-nav-label').textContent.trim()),
      ['Tracking', 'Activities', 'Factions', 'Settings']
    );
    assert.deepEqual(
      subitems.map((item) => item.getAttribute('title')),
      [
        'Preview Downtime Tracking · Fabricate Premium',
        'Preview Downtime Activities · Fabricate Premium',
        'Preview Factions & Reputation · Fabricate Premium',
        'Preview Downtime Settings · Fabricate Premium',
      ]
    );
    assert.ok(
      subitems.every((item) => Boolean(item.querySelector('[data-world-downtime-lock] .fa-lock'))),
      'every child carries the premium padlock'
    );
    // CORE-FALLBACK IS UNTOUCHED by the provider-mode naming (issue 1213). Core's preview keeps
    // its tab strip, which is where its accessible names and keyboard-visible tooltips already
    // live, so the rail sub-item states no `aria-label` here and keeps its visible label as its
    // accessible name.
    assert.deepEqual(
      subitems.map((item) => item.getAttribute('aria-label')),
      [null, null, null, null],
      'no aria-label overrides the visible label in Core preview mode'
    );
    assert.ok(
      subitems.every((item) => item.tagName === 'BUTTON' && !item.disabled),
      'the padlock marks a premium preview on a WORKING control, never a disabled one'
    );
    assert.deepEqual(
      subitems.map((item) => item.getAttribute('aria-current')),
      ['true', null, null, null]
    );
    assert.equal(
      target.querySelectorAll('[aria-current="page"]').length,
      1,
      'the route is current once — the children mark themselves within the set, not as pages'
    );

    const callout = target.querySelector('[data-world-downtime-callout]');
    assert.match(callout.textContent, /PREMIUM PREVIEW/);
    assert.match(
      callout.textContent,
      /Open any Downtime page to preview how Fabricate Premium can help you run downtime\./
    );

    const unlock = target.querySelector('[data-downtime-unlock]');
    assert.equal(unlock.textContent.trim(), 'Unlock with Premium');
    assert.equal(unlock.href, 'https://www.patreon.com/c/mistersilver');
    assert.equal(unlock.target, '_blank');
    assert.equal(unlock.rel, 'noopener noreferrer');
    assert.equal(
      target.querySelector('.manager-header-actions').getAttribute('aria-label'),
      'Downtime actions',
      'un-suppressing the actions block for this route is what makes that label reachable'
    );

    // Trigger one: the rail child.
    target.querySelector('[data-world-downtime-item="factions"]').click();
    await settleRouteExit();
    assert.equal(
      target.querySelector('[data-downtime-tab="factions"]').getAttribute('aria-selected'),
      'true',
      'the panel strip follows the rail'
    );
    assert.equal(
      target.querySelector('[data-world-downtime-item="factions"]').getAttribute('aria-current'),
      'true'
    );
    assert.ok(Boolean(target.querySelector('[data-downtime-panel="factions"]:not([hidden])')));

    // Trigger two: the studio-card button, which must reach the same state.
    target.querySelector('[data-downtime-tab="settings"]').click();
    await settleRouteExit();
    assert.equal(
      target.querySelector('[data-world-downtime-item="settings"]').getAttribute('aria-current'),
      'true',
      'the rail follows the card — two triggers, one navigation'
    );
    assert.deepEqual(
      Array.from(target.querySelectorAll('[data-world-downtime-item]')).map((item) =>
        item.getAttribute('aria-current')
      ),
      [null, null, null, 'true']
    );
    assert.deepEqual(
      callsWithoutRouteScopedClear(calls),
      [],
      'the rail preview navigation calls no store write seam'
    );
  });

  it('titles the Downtime route after the preview on screen, in the header and the breadcrumb', async () => {
    useShippedLocalization();
    mountDowntimeManager([], {}, {}, { managerExtensions: createManagerExtensionsRegistry() });
    worldNavItem('downtime').click();
    await settleRouteExit();

    const title = () => target.querySelector('.manager-header .manager-title').textContent.trim();
    const subtitle = () =>
      target.querySelector('.manager-header .manager-subtitle').textContent.trim();
    const leafCrumb = () => target.querySelector('[data-breadcrumb-downtime-tab]');

    assert.equal(
      target.querySelector('[data-breadcrumb-world]').textContent.trim(),
      'World',
      'the crumb is Title Case: the rail micro-label is the string authored in caps, not this'
    );
    assert.equal(title(), 'Downtime tracking');
    assert.equal(
      subtitle(),
      'Fabricate Premium · Your party-wide command board for every activity and shared project.'
    );
    assert.equal(leafCrumb().textContent.trim(), 'Tracking');
    assert.equal(leafCrumb().dataset.breadcrumbDowntimeTab, 'tracking');

    for (const [tabId, expectedTitle, expectedCrumb] of [
      ['activities', 'Downtime activities', 'Activities'],
      ['factions', 'Factions & reputation', 'Factions'],
      ['settings', 'Downtime settings', 'Settings'],
    ]) {
      target.querySelector(`[data-world-downtime-item="${tabId}"]`).click();
      await settleRouteExit();
      assert.equal(title(), expectedTitle, `${tabId} retitles the page`);
      assert.equal(leafCrumb().textContent.trim(), expectedCrumb, `${tabId} retitles the crumb`);
      assert.equal(leafCrumb().dataset.breadcrumbDowntimeTab, tabId);
      assert.match(subtitle(), /^Fabricate Premium · /, `${tabId} keeps the branded subtitle`);
    }
    assert.equal(
      subtitle(),
      'Fabricate Premium · Set campaign-wide rules that keep every activity consistent.'
    );
  });

  it('renders every Downtime board row as thing, detail and reading, with its closing notes', async () => {
    useShippedLocalization();
    mountDowntimeManager([], {}, {}, { managerExtensions: createManagerExtensionsRegistry() });
    worldNavItem('downtime').click();
    await settleRouteExit();

    const panel = (tabId) => target.querySelector(`[data-downtime-panel="${tabId}"]`);
    const rowsOf = (tabId) =>
      Array.from(panel(tabId).querySelectorAll('[data-downtime-board-row]')).map((row) => [
        row.querySelector('.downtime-board-row-primary').textContent.trim(),
        row.querySelector('.downtime-board-row-secondary').textContent.trim(),
        row.querySelector('.downtime-board-row-value').textContent.trim(),
      ]);

    assert.deepEqual(rowsOf('tracking'), [
      ['Ilyra Vance', 'Master of Ravens', '60%'],
      ['Rebuild the Blackfeather Tavern', 'Shared project · 3 contributors', '17 / 42 days'],
      ['Player choice waiting', 'Work a Profession is ready to resolve', 'ACTION'],
    ]);
    assert.deepEqual(rowsOf('settings'), [
      ['World time drives progress', 'Calendar advances credit active work', 'ON'],
      ['Players may self-initiate', 'Assigned activities can begin in the player app', 'ON'],
      ['Solo activities per character', 'Separate limit for group projects', '1'],
    ]);
    // U+2212 MINUS SIGN, not a hyphen — the design's own codepoint for a negative standing.
    assert.equal(rowsOf('factions')[2][2], '−28');

    assert.ok(
      !panel('tracking').querySelector('[data-downtime-board-row] .fa-lock'),
      'a row shows its reading, not a padlock — the board locks once, in its PREVIEW badge'
    );
    assert.equal(
      panel('tracking').querySelectorAll('.downtime-board .fa-lock').length,
      1,
      'exactly one padlock on the board'
    );

    assert.equal(
      panel('tracking').querySelector('[data-downtime-board-subtitle]').textContent.trim(),
      'The Blackfeather Company · live campaign view'
    );
    assert.equal(
      panel('activities').querySelector('[data-downtime-board-subtitle]').textContent.trim(),
      'Reusable definitions · ready to assign',
      'the board subtitle is per tab, not a single shared line'
    );
    assert.match(
      panel('tracking').querySelector('[data-downtime-board-note]').textContent,
      /With Premium, this view responds to your players’ actions, advances with world time, grants rewards and stays connected to the rest of Fabricate\./
    );
    assert.equal(
      panel('tracking').querySelector('[data-downtime-cta-note]').textContent.trim(),
      'Subscribe to unlock Downtime Studio for your campaign and download Fabricate Premium.'
    );
    assert.equal(
      panel('tracking').querySelector('[data-downtime-benefits-note]').textContent.trim(),
      'Unlock this workflow with Fabricate Premium'
    );
    assert.match(
      panel('tracking').querySelector('.downtime-preview-note').textContent,
      /Its campaign controls unlock with Fabricate Premium\./,
      'the preview note keeps the sentence that says what unlocking gets you'
    );
    assert.equal(
      panel('factions').querySelector('.downtime-hero-copy h2').textContent.trim(),
      'Let downtime reshape the balance of power.'
    );
    assert.equal(
      panel('tracking').querySelector('.downtime-benefits article p').textContent.trim(),
      'See active, paused, pending and attention-needed work for every character at a glance.'
    );

    // The tint travels with the SLOT, not the glyph.
    assert.deepEqual(
      Array.from(panel('tracking').querySelectorAll('[data-downtime-board-row]')).map(
        (row) => row.dataset.downtimeBoardRow
      ),
      ['tag', 'ember', 'warning']
    );
    assert.deepEqual(
      Array.from(panel('activities').querySelectorAll('[data-downtime-board-row]')).map(
        (row) => row.dataset.downtimeBoardRow
      ),
      ['ember', 'tag', 'vitality']
    );
    assert.ok(
      Boolean(
        panel('tracking').querySelector('.downtime-board-row-icon.is-tint-ember .fa-house-chimney')
      ),
      'the tint class rides the tile wrapper so the glyph inherits it'
    );
    assert.ok(
      Boolean(
        panel('activities').querySelector(
          '.downtime-board-row-icon.is-tint-vitality .fa-house-chimney'
        )
      ),
      'the same glyph carries a different tint on another tab'
    );
    assert.deepEqual(
      Array.from(panel('settings').querySelectorAll('.downtime-feature-icon')).map((icon) =>
        Array.from(icon.classList).find((name) => name.startsWith('is-tint-'))
      ),
      ['is-tint-accent', 'is-tint-info', 'is-tint-warning', 'is-tint-vitality']
    );
  });

  it('updates an open Downtime host and cleans each companion mount exactly once', async () => {
    const registry = createManagerExtensionsRegistry();
    const cleanups = [];
    mountDowntimeManager([], {}, {}, { managerExtensions: registry });
    worldNavItem('downtime').click();
    await settleRouteExit();

    const extension = downtimeProvider({
      mount({ target: mountTarget, tabId }) {
        mountTarget.textContent = `Mounted ${tabId}`;
        return () => cleanups.push(tabId);
      },
    });
    const unregister = registry.publicApi.registerWorldNavProvider(extension);
    await tick();
    await tick();
    flushSync();
    assert.ok(target.textContent.includes('Companion tracking'), target.innerHTML);
    assert.match(
      target.querySelector('[data-downtime-extension-panel]').textContent,
      /Mounted tracking/
    );
    // `[data-world-downtime-lock]` on the RAIL, not `.downtime-tab-lock` on the strip.
    assert.ok(
      !target.querySelector('[data-world-downtime-lock]'),
      'an installed companion never inherits the Core fallback lock treatment'
    );

    target.querySelector('#manager-downtime-nav-activities').click();
    await tick();
    flushSync();
    assert.deepEqual(cleanups, ['tracking']);
    assert.match(
      target.querySelector('[data-downtime-extension-panel]').textContent,
      /Mounted activities/
    );

    const mountedPanel = target.querySelector('[data-downtime-extension-panel="activities"]');
    mountedPanel.focus();
    assert.equal(
      document.activeElement,
      mountedPanel,
      'the companion panel owns focus before removal'
    );
    unregister();
    await settleDowntimeProvider();
    assert.deepEqual(cleanups, ['tracking', 'activities']);
    assert.ok(target.querySelector('[data-downtime-panel="activities"]'));
    assert.equal(
      document.activeElement,
      target.querySelector('[data-downtime-tab="activities"]'),
      'provider removal returns a focused companion panel to its active Core tab'
    );
  });

  // The OTHER direction, and the one issue 1213 breaks (the test above covers deregister,
  // which still resolves because the `{#if coreFallback}` branch still renders the strip).
  it('recovers focus onto the companion panel when a provider registers under a focused Core tab', async () => {
    const registry = createManagerExtensionsRegistry();
    mountDowntimeManager([], {}, {}, { managerExtensions: registry });
    worldNavItem('downtime').click();
    await settleRouteExit();

    const coreTab = target.querySelector('[data-downtime-tab="tracking"]');
    coreTab.focus();
    assert.ok(
      document.activeElement === coreTab,
      'pre-condition: focus is inside the host, on the Core tab the swap is about to remove'
    );

    registry.publicApi.registerWorldNavProvider(downtimeProvider());
    await settleDowntimeProvider();
    await settleDowntimeProvider();

    const region = target.querySelector('#world-downtime-panel-tracking');
    assert.ok(Boolean(region), 'the companion panel region replaced the Core preview panel');
    assert.ok(
      document.activeElement === region,
      'focus lands on the named region, not on the document body'
    );
  });

  // Issue 1213, decision 3. Removing the strip strands a GM at a 56px rail.
  it('locks the rail open in provider mode only, and never writes the stored collapse preference', async () => {
    useShippedLocalization();
    const registry = createManagerExtensionsRegistry();
    const settingWrites = [];
    mountDowntimeManager(
      [],
      {},
      {
        getSetting: (key) => key === 'managerRailCollapsed',
        setSetting: (key, value) => settingWrites.push([key, value]),
      },
      { managerExtensions: registry }
    );

    const railWrites = () => settingWrites.filter(([key]) => key === 'managerRailCollapsed');

    assert.ok(railBodyCollapsed(), 'pre-condition: this GM stored a collapsed rail');

    // MODE-scoped, half one: a provider registered while the GM is elsewhere locks nothing.
    const unregister = registry.publicApi.registerWorldNavProvider(downtimeProvider());
    await settleDowntimeProvider();
    assert.ok(railBodyCollapsed(), 'a companion on another route leaves the rail alone');
    assert.equal(railToggleControl().disabled, false);

    worldNavItem('downtime').click();
    await settleRouteExit();

    assertRailLockedOpen(railWrites);
    await assertRailLockSurvivesPresses(railWrites);

    // MODE-scoped, half two: Core's fallback keeps its strip.
    unregister();
    await settleDowntimeProvider();
    assert.ok(railBodyCollapsed(), 'losing the companion returns the route to the stored collapse');
    assert.equal(railToggleControl().disabled, false);

    worldNavItem('parties').click();
    await settleRouteExit();
    assert.ok(railBodyCollapsed(), 'and the stored preference survived the whole visit');
    assert.deepEqual(railWrites(), []);
  });

  // THE SECOND RENDER SITE (issue 1213 review). `[data-manager-rail-toggle]` is written twice,
  // once per `{#if selectedSystem}` scope-card branch, and every mounted case above renders the
  // first: the store fixture always carries a selected system. Deleting the lock attributes
  // from the `{:else}` branch therefore survived the whole suite, leaving the same dead control
  // issue 1185 was about, one branch over — on a state this route explicitly supports and has
  // its own test for. `noSystems: true` is what renders that branch.
  it('locks the rail open on the companion route with no crafting system selected', async () => {
    useShippedLocalization();
    const registry = createManagerExtensionsRegistry();
    const settingWrites = [];
    registry.publicApi.registerWorldNavProvider(downtimeProvider({ ids: ['board'] }));
    mountDowntimeManager(
      [],
      { noSystems: true },
      {
        getSetting: (key) => key === 'managerRailCollapsed',
        setSetting: (key, value) => settingWrites.push([key, value]),
      },
      { managerExtensions: registry }
    );
    const railWrites = () => settingWrites.filter(([key]) => key === 'managerRailCollapsed');

    assert.ok(
      Boolean(target.querySelector('.manager-scope-card .manager-title')),
      'pre-condition: this is the no-system scope card, the branch the other cases never render'
    );
    assert.ok(railBodyCollapsed(), 'pre-condition: this GM stored a collapsed rail');

    worldNavItem('downtime').click();
    await settleRouteExit();

    assertRailLockedOpen(railWrites);
    await assertRailLockSurvivesPresses(railWrites);

    worldNavItem('parties').click();
    await settleRouteExit();
    assert.ok(railBodyCollapsed(), 'and leaving the route restores the stored collapse here too');
    assert.deepEqual(railWrites(), []);
  });

  // Issue 1213 — the one real cost of deleting the tab strip. Measured at a 1330x900 Manager the
  // Downtime sub-items render below the nav scrollport, so the route's first visible state
  // offered no visible screen switcher at all. They stay reachable by scrolling, so this is not
  // stranding; it is one scroll, and Core does it.
  it('scrolls the active Downtime sub-item into view on entering the companion route', async () => {
    const scrolled = [];
    const original = globalThis.Element.prototype.scrollIntoView;
    globalThis.Element.prototype.scrollIntoView = function record(options) {
      scrolled.push([this.id, options]);
    };
    try {
      const registry = createManagerExtensionsRegistry();
      registry.publicApi.registerWorldNavProvider(
        downtimeProvider({ prefix: 'Guild', ids: ['ledger', 'crew'] })
      );
      mountDowntimeManager([], {}, {}, { managerExtensions: registry });
      assert.deepEqual(scrolled, [], 'nothing is revealed while the GM is on another route');

      worldNavItem('downtime').click();
      await settleRouteExit();
      assert.deepEqual(
        scrolled,
        [['manager-downtime-nav-ledger', { block: 'nearest' }]],
        'entering the route reveals the active sub-item, by the smallest scroll that does it'
      );

      target.querySelector('#manager-downtime-nav-crew').click();
      await settleRouteExit();
      assert.deepEqual(
        scrolled.at(-1),
        ['manager-downtime-nav-crew', { block: 'nearest' }],
        'and switching screen follows the switcher'
      );
      // There was an assertion here that a further settle does not re-scroll.
    } finally {
      globalThis.Element.prototype.scrollIntoView = original;
    }
  });

  // Core's preview owns the top of its own panel, so it needs no reveal.
  it('does not scroll the rail on the Core preview route', async () => {
    const scrolled = [];
    const original = globalThis.Element.prototype.scrollIntoView;
    globalThis.Element.prototype.scrollIntoView = function record() {
      scrolled.push(this.id);
    };
    try {
      mountDowntimeManager([]);
      worldNavItem('downtime').click();
      await settleRouteExit();
      assert.deepEqual(scrolled, [], 'core-fallback keeps its strip at the top of the panel');
    } finally {
      globalThis.Element.prototype.scrollIntoView = original;
    }
  });

  // Issue 1185 — where the premium signal LIVES. In the free module the title bar's badge
  // slot is empty and the rail chip is the loud gold sell; once a companion registers, the
  // loud signal moves to the title bar and the rail chip steps down to a quiet marker, so
  // the same word is only ever shouted in one place.
  it('moves the premium signal to the title bar when a companion registers', async () => {
    useShippedLocalization();
    const registry = createManagerExtensionsRegistry();
    mountDowntimeManager([], {}, {}, { managerExtensions: registry });

    const titlebarPremium = () => target.querySelector('[data-manager-titlebar-premium]');
    const railChip = () => target.querySelector('[data-world-nav-premium]');
    const downtimeTitle = () => worldNavItem('downtime').getAttribute('title');

    assert.ok(!titlebarPremium(), 'the free module carries no premium badge in the title bar');
    assert.ok(
      !target.querySelector('[data-manager-titlebar-system]'),
      'and the crafting-system badge the rail already duplicates is gone from both states'
    );
    assert.equal(railChip().dataset.worldNavPremiumState, 'preview');
    assert.ok(
      !railChip().classList.contains('is-installed'),
      'the rail chip keeps its prominent treatment while Core is previewing the surface'
    );
    assert.equal(downtimeTitle(), 'Unlock Downtime Studio with Fabricate Premium');

    const unregister = registry.publicApi.registerWorldNavProvider(downtimeProvider());
    await settleDowntimeProvider();

    assert.equal(titlebarPremium().textContent.trim(), 'PREMIUM');
    assert.equal(
      titlebarPremium().getAttribute('aria-label'),
      'Fabricate Premium is installed and connected'
    );
    assert.equal(
      titlebarPremium().getAttribute('title'),
      'Fabricate Premium is installed and connected'
    );
    assert.ok(
      titlebarPremium().classList.contains('manager-titlebar-badge'),
      'the badge reuses the shared gold treatment rather than stating a second colour pair'
    );
    assert.equal(railChip().dataset.worldNavPremiumState, 'installed');
    assert.ok(railChip().classList.contains('is-installed'), 'and the rail chip mutes');
    assert.equal(
      railChip().textContent.trim(),
      'PREMIUM',
      'muted is not removed WHILE NOTHING ELSE CLAIMS THE TRACK — which is this case, because ' +
        'the shared factory declares no badge, so the rollup total is zero and suppressed. It ' +
        'is not a universal rule: a nonzero rollup REPLACES the chip outright (issue 1302), ' +
        'and AC-14 cell 1 pins that state'
    );
    assert.equal(
      downtimeTitle(),
      'Downtime Studio is unlocked by Fabricate Premium',
      'and the row stops offering to unlock what is already unlocked'
    );

    unregister();
    await settleDowntimeProvider();
    assert.ok(!titlebarPremium(), 'removing the companion takes the title-bar signal with it');
    assert.equal(railChip().dataset.worldNavPremiumState, 'preview');
    assert.equal(downtimeTitle(), 'Unlock Downtime Studio with Fabricate Premium');
  });

  // The badge is a claim about the MODULE.
  it('lights the title-bar premium badge for a surface Core does not host', async () => {
    useShippedLocalization();
    const registry = createManagerExtensionsRegistry();
    mountDowntimeManager([], {}, {}, { managerExtensions: registry });

    registry.publicApi.registerWorldNavProvider(downtimeProvider({ id: 'crew-quarters' }));
    await settleDowntimeProvider();

    assert.equal(
      target.querySelector('[data-manager-titlebar-premium]')?.textContent.trim(),
      'PREMIUM',
      'an unrecognised companion surface still proves the premium module is installed'
    );
    assert.equal(
      target.querySelector('[data-world-nav-premium]').dataset.worldNavPremiumState,
      'preview',
      'but Core still holds the Downtime route, so its rail chip keeps the upgrade sell'
    );
    assert.equal(
      worldNavItem('downtime').getAttribute('title'),
      'Unlock Downtime Studio with Fabricate Premium',
      'and the Downtime tooltip still describes the route it actually renders'
    );
  });

  // Issue 1198, maintainer decision A2. The badge reports the MODULE.
  it('lights the title-bar premium badge for a companion registered ONLY in the player registry', async () => {
    useShippedLocalization();
    const playerExtensions = createPlayerExtensionsRegistry({ emitHook: () => {} });
    mountDowntimeManager(
      [],
      {},
      {},
      { managerExtensions: createManagerExtensionsRegistry(), playerExtensions }
    );

    assert.ok(
      !target.querySelector('[data-manager-titlebar-premium]'),
      'the free module still carries no badge'
    );

    const unregister = playerExtensions.publicApi.registerPlayerNavProvider({
      apiVersion: 1,
      id: 'downtime',
      tabs: [{ id: 'board', label: 'Downtime board', icon: 'fas fa-clock' }],
      mount: () => undefined,
    });
    await settleDowntimeProvider();

    assert.equal(
      target.querySelector('[data-manager-titlebar-premium]')?.textContent.trim(),
      'PREMIUM',
      'a player-window-only companion still proves the premium module is installed'
    );
    assert.equal(
      target.querySelector('[data-world-nav-premium]').dataset.worldNavPremiumState,
      'preview',
      'but Core still holds the Downtime route, so its rail chip keeps the upgrade sell'
    );

    unregister();
    await settleDowntimeProvider();
    assert.ok(
      !target.querySelector('[data-manager-titlebar-premium]'),
      'and removing the only companion takes the badge with it'
    );
  });

  it('contains mount faults, rejects invalid cleanup returns, and recovers with replacement tabs', async () => {
    const registry = createManagerExtensionsRegistry();
    const errors = [];
    const originalError = console.error;
    console.error = (...args) => errors.push(args);
    try {
      mountDowntimeManager([], {}, {}, { managerExtensions: registry });
      worldNavItem('downtime').click();
      await settleRouteExit();

      const unregisterBroken = registry.publicApi.registerWorldNavProvider(
        downtimeProvider({
          prefix: 'Broken',
          mount({ target: mountTarget }) {
            mountTarget.textContent = 'partial broken content';
            throw new Error('mount exploded');
          },
        })
      );
      await settleDowntimeProvider();
      assert.ok(target.querySelector('[data-downtime-panel="tracking"]'));
      assert.ok(!target.textContent.includes('Broken tracking'));
      assert.ok(!target.textContent.includes('partial broken content'));

      unregisterBroken();
      const unregisterInvalid = registry.publicApi.registerWorldNavProvider(
        downtimeProvider({
          prefix: 'Invalid',
          mount({ target: mountTarget }) {
            mountTarget.textContent = 'partial invalid content';
            return { dispose: true };
          },
        })
      );
      await settleDowntimeProvider();
      assert.ok(target.querySelector('[data-downtime-panel="tracking"]'));
      assert.ok(!target.textContent.includes('Invalid tracking'));
      assert.ok(!target.textContent.includes('partial invalid content'));

      unregisterInvalid();
      registry.publicApi.registerWorldNavProvider(
        downtimeProvider({
          prefix: 'Recovered',
          coreFallback: true,
          mount({ target: mountTarget, tabId }) {
            mountTarget.textContent = `Recovered ${tabId}`;
          },
        })
      );
      await settleDowntimeProvider();
      assert.match(target.textContent, /Recovered tracking/);
      assert.match(target.textContent, /Recovered activities/);
      // Again the RAIL padlock: the strip one is unrenderable in provider mode.
      assert.ok(
        !target.querySelector('[data-world-downtime-lock]'),
        'a companion cannot opt into Core-only fallback behavior with coreFallback'
      );
      assert.equal(errors.length, 2);
      assert.match(errors[0][0], /provider mount failed/);
      assert.match(errors[1][0], /provider mount failed/);
    } finally {
      console.error = originalError;
    }
  });

  it('continues to fallback after a cleanup throws and reports the fault once', async () => {
    const registry = createManagerExtensionsRegistry();
    const errors = [];
    const originalError = console.error;
    console.error = (...args) => errors.push(args);
    try {
      mountDowntimeManager([], {}, {}, { managerExtensions: registry });
      worldNavItem('downtime').click();
      await settleRouteExit();
      const unregister = registry.publicApi.registerWorldNavProvider(
        downtimeProvider({
          mount: () => () => {
            throw new Error('cleanup exploded');
          },
        })
      );
      await settleDowntimeProvider();

      unregister();
      await settleDowntimeProvider();
      assert.ok(target.querySelector('[data-downtime-panel="tracking"]'));
      assert.equal(errors.length, 1, 'cleanup is attempted and reported exactly once');
      assert.match(errors[0][0], /provider cleanup failed/);
    } finally {
      console.error = originalError;
    }
  });

  it('runs companion cleanup while its target is connected on route exit and manager destruction', async () => {
    const registry = createManagerExtensionsRegistry();
    const cleanupConnections = [];
    registry.publicApi.registerWorldNavProvider(
      downtimeProvider({
        mount:
          ({ target: mountTarget }) =>
          () =>
            cleanupConnections.push(mountTarget.isConnected),
      })
    );
    mountDowntimeManager([], {}, {}, { managerExtensions: registry });
    worldNavItem('downtime').click();
    await settleRouteExit();

    worldNavItem('parties').click();
    await settleRouteExit();
    assert.deepEqual(cleanupConnections, [true], 'route exit cleans before removing the target');

    worldNavItem('downtime').click();
    await settleRouteExit();
    mounted.disposeDowntimeProviderBeforeRemoval();
    unmount(mounted);
    mounted = null;
    assert.deepEqual(
      cleanupConnections,
      [true, true],
      'manager destruction cleans exactly once while the target remains connected'
    );
  });

  it('renders a provider-declared tab set of any size in the rail, and renders no tab strip', async () => {
    const registry = createManagerExtensionsRegistry();
    registry.publicApi.registerWorldNavProvider(
      downtimeProvider({ prefix: 'Guild', ids: ['ledger', 'crew'] })
    );
    mountDowntimeManager([], {}, {}, { managerExtensions: registry });
    worldNavItem('downtime').click();
    await settleRouteExit();

    assert.deepEqual(
      downtimeRailIds(),
      ['ledger', 'crew'],
      'the rail renders the provider set, in the provider order'
    );
    // Issue 1213 — the strip is Core's preview navigation and is not rendered over a
    // companion's screens, so a provider's tab set is drawn EXACTLY ONCE.
    assert.deepEqual(
      downtimeTabIds(),
      [],
      'a companion navigates from the rail alone: no second rendering of its own tab list'
    );
    assert.ok(
      !target.querySelector('[data-downtime-tablist]'),
      'and no orphan tablist survives the strip'
    );
    const region = target.querySelector('#world-downtime-panel-ledger');
    assert.equal(region.getAttribute('role'), 'region', 'a tabpanel with no tablist is an orphan');
    assert.equal(
      region.getAttribute('tabindex'),
      '-1',
      'programmatically focusable for provider-swap recovery, but not a tab stop that scrolls nothing'
    );
    // WHERE EACH REQUIRED TAB FIELD LANDS.
    const railItem = target.querySelector('#manager-downtime-nav-ledger');
    assert.equal(
      railItem.getAttribute('aria-label'),
      'Open Guild ledger',
      'accessibleName names the rail sub-item, replacing its visible label'
    );
    assert.equal(
      railItem.getAttribute('title'),
      'Guild ledger tools',
      'and tooltip is that sub-item native tooltip'
    );
    // The REGION is named by the screen.
    // button would make the landmark inherit the button's whole accessible name and announce
    // "Open Guild ledger, region"; it points at the label span, which holds "Guild ledger".
    const labelSpan = railItem.querySelector('.manager-nav-label');
    assert.equal(labelSpan.id, 'manager-downtime-nav-label-ledger');
    assert.equal(
      region.getAttribute('aria-labelledby'),
      labelSpan.id,
      'the panel takes its name from the rail label, not from the rail button'
    );
    assert.notEqual(
      region.getAttribute('aria-labelledby'),
      railItem.id,
      'because the button name is an instruction and a landmark name is a screen'
    );
    assert.equal(
      labelSpan.textContent.trim(),
      'Guild ledger',
      'so the region resolves to the visible screen name'
    );
    assert.deepEqual(
      Array.from(target.querySelectorAll('[data-world-downtime-item] .manager-nav-label')).map(
        (label) => label.textContent.trim()
      ),
      ['Guild ledger', 'Guild crew'],
      'a companion label is already localized and is NOT run through Core lang resolution'
    );
    assert.equal(
      activeCompanionPanel().dataset.downtimeExtensionPanel,
      'ledger',
      'an initial tab the provider does not declare falls back to its first tab, not an empty panel'
    );
    assert.ok(
      !target.querySelector('[data-world-downtime-lock]'),
      'nothing is padlocked when a companion owns the surface'
    );
    assert.ok(
      !target.querySelector('[data-world-downtime-callout]'),
      'the premium rail note advertises CORE preview and must not sit under companion screens'
    );

    target.querySelector('#manager-downtime-nav-crew').click();
    await settleRouteExit();
    assert.equal(
      activeCompanionPanel().dataset.downtimeExtensionPanel,
      'crew',
      'the rail child still drives the provider tab it names'
    );
  });

  it('dresses the route in per-tab provider chrome and provider header actions', async () => {
    const registry = createManagerExtensionsRegistry();
    const selected = [];
    registry.publicApi.registerWorldNavProvider(
      downtimeProvider({
        prefix: 'Guild',
        ids: ['ledger', 'crew'],
        tab: (id) => ({
          title: `${id} title`,
          subtitle: `${id} subtitle`,
          breadcrumb: `${id} crumb`,
          actionsLabel: `${id} actions`,
          actions:
            id === 'ledger'
              ? [
                  {
                    id: 'post',
                    label: 'Post entry',
                    icon: 'fas fa-pen',
                    primary: true,
                    onSelect: (context) => selected.push(context),
                  },
                ]
              : [{ id: 'guide', label: 'Guild guide', href: 'https://example.test/guide' }],
        }),
      })
    );
    mountDowntimeManager([], {}, {}, { managerExtensions: registry });
    worldNavItem('downtime').click();
    await settleRouteExit();

    assert.equal(managerTitle(), 'ledger title');
    assert.equal(managerSubtitle(), 'ledger subtitle');
    assert.equal(
      target.querySelector('[data-breadcrumb-downtime-tab]').textContent.trim(),
      'ledger crumb',
      'the leaf crumb names the tab, so it belongs to whoever owns the tab'
    );
    assert.equal(
      target.querySelector('.manager-header-actions').getAttribute('aria-label'),
      'ledger actions'
    );
    assert.ok(
      !target.querySelector('[data-downtime-unlock]'),
      'the Unlock with Premium pill is Core copy about Core, never shown over companion screens'
    );

    const post = target.querySelector('[data-manager-header-action="post"]');
    assert.equal(post.tagName, 'BUTTON');
    assert.ok(post.classList.contains('is-primary'));
    assert.ok(Boolean(post.querySelector('.fa-pen')), 'an action renders its own icon');
    post.click();
    assert.equal(selected.length, 1, 'onSelect runs on click');
    assert.equal(selected[0].actionId, 'post');
    assert.equal(selected[0].tabId, 'ledger', 'an action is told which tab invoked it');

    target.querySelector('#manager-downtime-nav-crew').click();
    await settleDowntimeProvider();
    assert.equal(managerTitle(), 'crew title', 'chrome is per tab, and follows the rail item');
    assert.equal(managerSubtitle(), 'crew subtitle');
    const guide = target.querySelector('[data-manager-header-action="guide"]');
    assert.equal(guide.tagName, 'A');
    assert.equal(guide.getAttribute('href'), 'https://example.test/guide');
    assert.equal(guide.getAttribute('target'), '_blank');
    assert.equal(guide.getAttribute('rel'), 'noopener noreferrer');
    assert.ok(
      !target.querySelector('[data-manager-header-action="post"]'),
      'the previous tab actions are replaced, not accumulated'
    );
  });

  // The chrome fixture every runtime-channel case below drills into.
  const COMPANION_EDITOR_CHROME = Object.freeze({
    title: 'Marn the Quartermaster',
    subtitle: 'Crew member · two projects in flight',
    breadcrumb: 'Marn',
    actionsLabel: 'Crew member actions',
    image: 'icons/commodities/treasure/token-gold-gem.webp',
    status: { label: 'Unsaved' },
    actions: Object.freeze([
      {
        id: 'back',
        label: 'Back to crew',
        tone: 'ghost',
        icon: 'fas fa-arrow-left',
        onSelect: () => {},
      },
      { id: 'delete', label: 'Delete', tone: 'danger', icon: 'fas fa-trash', onSelect: () => {} },
      { id: 'save', label: 'Save', tone: 'primary', disabled: true, onSelect: () => {} },
    ]),
  });

  // The provider every runtime-channel case registers: two tabs.
  function chromeChannelProvider(mounts) {
    return downtimeProvider({
      prefix: 'Guild',
      ids: ['ledger', 'crew'],
      tab: (id) => ({
        title: `${id} title`,
        subtitle: `${id} subtitle`,
        breadcrumb: `${id} crumb`,
        actionsLabel: `${id} actions`,
        actions: [{ id: 'new', label: 'New entry', primary: true, onSelect: () => {} }],
      }),
      mount: ({ context }) => {
        mounts.push(context);
      },
    });
  }

  const headerAction = (id) => target.querySelector(`[data-manager-header-action="${id}"]`);

  it('dresses the route from a live companion, through Core’s own header primitives', async () => {
    const registry = createManagerExtensionsRegistry();
    const mounts = [];
    registry.publicApi.registerWorldNavProvider(chromeChannelProvider(mounts));
    mountDowntimeManager([], {}, {}, { managerExtensions: registry });
    worldNavItem('downtime').click();
    await settleRouteExit();
    assert.equal(mounts.length, 1);
    assert.equal(managerTitle(), 'ledger title', 'the registered chrome still lands first');
    assert.ok(
      !target.querySelector('[data-downtime-chrome-heading]'),
      'and a route with no runtime artwork keeps the plain heading it has always had'
    );

    // The companion drills into its own editor and dresses CORE'S header for it.
    assert.equal(mounts[0].setRouteChrome(COMPANION_EDITOR_CHROME), true);
    await settleDowntimeProvider();

    assert.equal(
      mounts.length,
      1,
      'THE WHOLE POINT: new chrome, same mount — the editor state the header describes survives'
    );
    assert.equal(managerTitle(), 'Marn the Quartermaster');
    assert.equal(managerSubtitle(), 'Crew member · two projects in flight');
    assert.equal(
      target.querySelector('.manager-header-actions').getAttribute('aria-label'),
      'Crew member actions'
    );

    // ARTWORK, through the recipe editor's own identity block rather than a companion-only one.
    const heading = target.querySelector('[data-downtime-chrome-heading]');
    assert.ok(Boolean(heading), 'a drill-down renders the identity heading Core editors render');
    assert.ok(
      heading.classList.contains('manager-recipe-edit-heading'),
      'and reuses the shipped class, so it cannot drift away from the editors it matches'
    );
    const medallion = heading.querySelector('[data-medallion]');
    assert.equal(medallion.dataset.medallion, 'image');
    assert.equal(
      medallion.querySelector('img').getAttribute('src'),
      'icons/commodities/treasure/token-gold-gem.webp'
    );

    // The staged-changes chip is the manager's ONE chip, in the tone every Core editor uses.
    const status = target.querySelector('[data-downtime-chrome-status]');
    assert.ok(status.classList.contains('manager-chip'), 'a lookalike would be a second chip');
    assert.ok(status.classList.contains('is-warning'));
    assert.ok(status.classList.contains('is-truncated'), 'and truncates like Core’s own');
    assert.equal(status.textContent.trim(), 'Unsaved');
    assert.equal(
      status.getAttribute('title'),
      'Unsaved',
      'Core renders the string it is given — localization stays the companion’s'
    );

    // Core's own Back / Delete / Save treatments, reachable through the seam at last.
    assert.ok(headerAction('back').classList.contains('is-ghost'));
    assert.ok(Boolean(headerAction('back').querySelector('.fa-arrow-left')));
    assert.ok(headerAction('delete').classList.contains('is-danger'));
    assert.ok(Boolean(headerAction('delete').querySelector('.fa-trash')));
    assert.ok(headerAction('save').classList.contains('is-primary'));
    assert.equal(headerAction('save').disabled, true, 'a Save that cannot save renders disabled');
    assert.ok(
      !headerAction('new'),
      'the tab’s registered actions are replaced by the drill-down’s, never accumulated'
    );

    // UNSETTING falls back to what the tab registered, with no second call and no remount.
    assert.equal(mounts[0].setRouteChrome(null), true);
    await settleDowntimeProvider();
    assert.equal(managerTitle(), 'ledger title');
    assert.equal(managerSubtitle(), 'ledger subtitle');
    assert.equal(
      target.querySelector('[data-breadcrumb-downtime-tab]').textContent.trim(),
      'ledger crumb'
    );
    assert.ok(!target.querySelector('[data-downtime-chrome-heading]'), 'the artwork goes with it');
    assert.ok(!target.querySelector('[data-downtime-chrome-status]'));
    assert.ok(Boolean(headerAction('new')), 'and the tab’s own actions come back');
    assert.equal(mounts.length, 1, 'unsetting is not a remount either');
  });

  it('scopes runtime chrome to the mount that stated it, and refuses a malformed update', async () => {
    useShippedLocalization();
    const registry = createManagerExtensionsRegistry();
    const mounts = [];
    registry.publicApi.registerWorldNavProvider(chromeChannelProvider(mounts));
    mountDowntimeManager([], {}, {}, { managerExtensions: registry });
    worldNavItem('downtime').click();
    await settleRouteExit();
    mounts[0].setRouteChrome(COMPANION_EDITOR_CHROME);
    await settleDowntimeProvider();
    assert.equal(managerTitle(), 'Marn the Quartermaster');

    // A tab switch ends the mount, so the chrome describing its editor ends with it. Arriving
    // on `crew` still wearing `Marn` would describe state the remount has already discarded.
    target.querySelector('#manager-downtime-nav-crew').click();
    await settleRouteExit();
    assert.equal(mounts.length, 2);
    assert.equal(managerTitle(), 'crew title');
    assert.ok(!target.querySelector('[data-downtime-chrome-heading]'));

    // …and the retired mount cannot repaint the screen the GM has moved on to.
    assert.equal(mounts[0].setRouteChrome({ title: 'Back from the dead' }), false);
    await settleDowntimeProvider();
    assert.equal(managerTitle(), 'crew title');

    // A malformed update is refused at the seam, with a message, changing nothing.
    assert.throws(
      () => mounts[1].setRouteChrome({ title: 'Crew', subtitel: 'oops' }),
      /does not accept "subtitel"/
    );
    assert.throws(
      () => mounts[1].setRouteChrome({ status: { label: 'Unsaved', tone: 'urgent' } }),
      /status tone must be one of/
    );
    await settleDowntimeProvider();
    assert.equal(managerTitle(), 'crew title', 'a refused update leaves the header as it was');
    assert.ok(!target.querySelector('[data-downtime-chrome-status]'));
    assert.equal(
      activeCompanionPanel().dataset.downtimeExtensionPanel,
      'crew',
      'and the surface is still mounted rather than faulted back to Core’s preview'
    );

    // Leaving the route ends the mount too, so Core's own preview never wears companion copy.
    mounts[1].setRouteChrome(COMPANION_EDITOR_CHROME);
    await settleDowntimeProvider();
    worldNavItem('parties').click();
    await settleRouteExit();
    // Asserted as the REFUSAL rather than as a header reading.
    assert.equal(
      mounts[1].setRouteChrome({ title: 'Still here' }),
      false,
      'leaving the route ends the mount, so its context can no longer write chrome at all'
    );
    worldNavItem('downtime').click();
    await settleRouteExit();
    assert.equal(managerTitle(), 'crew title', 'returning to the route starts from the tab again');
    assert.ok(!target.querySelector('[data-downtime-chrome-status]'));
  });

  it('hangs a drill-down under a tab crumb that takes the GM back up to it', async () => {
    // THE BREADCRUMB'S OWN HALF OF THE RE-ACTIVATION SEAM (issue 1322). The rail already offers
    // the click on the sub-item of the tab already on screen; a GM reading `... > Downtime >
    // Factions > Emberwatch` will press `Factions` for the same reason, and it is the same
    // question with the same answer. Core cannot pop the level itself — the drill-down is inside
    // the companion's target — so the crumb goes through the channel the rail goes through.
    const registry = createManagerExtensionsRegistry();
    const mounts = [];
    const events = [];
    registry.publicApi.registerWorldNavProvider(chromeChannelProvider(mounts));
    mountDowntimeManager([], {}, {}, { managerExtensions: registry });
    worldNavItem('downtime').click();
    await settleRouteExit();
    const stop = mounts[0].onRouteReselect(() => events.push('pop'));
    await settleDowntimeProvider();

    // ON THE TAB'S OWN SCREEN THERE IS NO LEAF AND NOTHING TO GO BACK TO, so the crumb is a
    // span even though a handler is registered: it names the screen the GM is already on.
    assert.equal(
      target.querySelector('[data-breadcrumb-downtime-tab]').tagName.toLowerCase(),
      'span'
    );
    assert.equal(target.querySelector('[data-breadcrumb-downtime-leaf]'), null);

    // DRILLED IN, it becomes a button — and pressing it reaches the companion's own handler.
    assert.equal(mounts[0].setRouteChrome(COMPANION_EDITOR_CHROME), true);
    await settleDowntimeProvider();
    const crumb = target.querySelector('[data-breadcrumb-downtime-tab]');
    assert.equal(crumb.tagName.toLowerCase(), 'button');
    crumb.click();
    await settleRouteExit();
    assert.deepEqual(events, ['pop'], 'the crumb does not reach the companion');
    assert.equal(mounts.length, 1, 'and it is a re-activation, not a remount');

    // AND IT IS NOT A ONE-SHOT, which is the property a crumb wired to a navigation would lose:
    crumb.click();
    await settleRouteExit();
    assert.deepEqual(events, ['pop', 'pop']);

    // WITH THE HANDLER GONE it falls back to a span rather than leaving a dead button behind.
    stop();
    await settleDowntimeProvider();
    assert.equal(
      target.querySelector('[data-breadcrumb-downtime-tab]').tagName.toLowerCase(),
      'span'
    );
  });

  it('roots a World route at World, and never under Crafting Systems', async () => {
    // TWO ROOTS, NOT ONE (issue 1322). `Crafting Systems` used to lead every trail in the
    // Manager, so a GM configuring their world read `Crafting Systems > World > Downtime > ...`
    const registry = createManagerExtensionsRegistry();
    const mounts = [];
    registry.publicApi.registerWorldNavProvider(chromeChannelProvider(mounts));
    mountDowntimeManager([], {}, {}, { managerExtensions: registry });
    worldNavItem('downtime').click();
    await settleRouteExit();

    const crumbs = () =>
      Array.from(target.querySelectorAll('.manager-breadcrumbs > *'))
        .filter((node) => node.tagName.toLowerCase() !== 'i')
        .map((node) => node.textContent.trim());
    assert.deepEqual(crumbs(), ['World', 'Downtime', 'ledger crumb']);
    assert.equal(
      crumbs().includes('Crafting Systems'),
      false,
      'a World route is still rooted at Crafting Systems'
    );

    // AND `World` NAVIGATES, because an intermediate crumb that names a reachable screen should
    // reach it — which is the rule every other crumb in this trail already follows.
    const world = target.querySelector('[data-breadcrumb-world]');
    assert.equal(world.tagName.toLowerCase(), 'button');
    world.click();
    await settleRouteExit();
    assert.deepEqual(crumbs(), ['World'], 'the World crumb did not reach the World route');
    // ON THE WORLD ROUTE IT IS THE LEAF and stops being a control.
    assert.equal(target.querySelector('[data-breadcrumb-world]').tagName.toLowerCase(), 'span');
  });

  it('offers the rail sub-item of the tab already on screen to the companion', async () => {
    const registry = createManagerExtensionsRegistry();
    const mounts = [];
    const events = [];
    registry.publicApi.registerWorldNavProvider(chromeChannelProvider(mounts));
    mountDowntimeManager([], {}, {}, { managerExtensions: registry });
    worldNavItem('downtime').click();
    await settleRouteExit();
    assert.equal(mounts.length, 1);
    const stop = mounts[0].onRouteReselect(() => events.push('pop'));

    // The click that used to do nothing at all. It is DISTINGUISHABLE from a first mount.
    target.querySelector('#manager-downtime-nav-ledger').click();
    await settleRouteExit();
    assert.deepEqual(events, ['pop'], 'the rail click reaches the companion');
    assert.equal(mounts.length, 1, 'and is a re-activation, not a remount');
    assert.equal(activeCompanionPanel().dataset.downtimeExtensionPanel, 'ledger');

    target.querySelector('#manager-downtime-nav-ledger').click();
    await settleRouteExit();
    assert.deepEqual(events, ['pop', 'pop'], 'it keeps working — this is not a one-shot');

    // A DIFFERENT sub-item is still a navigation, and must not be reported as a re-activation.
    target.querySelector('#manager-downtime-nav-crew').click();
    await settleRouteExit();
    assert.deepEqual(events, ['pop', 'pop'], 'navigating away is not a re-activation');
    assert.equal(mounts.length, 2, 'it is a mount, which is the other half of the distinction');

    // The handler died with its mount, so the new one hears nothing it did not ask for.
    target.querySelector('#manager-downtime-nav-crew').click();
    await settleRouteExit();
    assert.deepEqual(events, ['pop', 'pop'], 'a new mount inherits no listeners');

    stop();
    stop();
    const laterMount = mounts[1];
    laterMount.onRouteReselect(() => events.push('crew'));
    target.querySelector('#manager-downtime-nav-crew').click();
    await settleRouteExit();
    assert.deepEqual(events, ['pop', 'pop', 'crew']);
  });

  it('contains a throwing re-activation handler and keeps Core’s own click behaviour', async () => {
    const registry = createManagerExtensionsRegistry();
    const mounts = [];
    registry.publicApi.registerWorldNavProvider(chromeChannelProvider(mounts));
    mountDowntimeManager([], {}, {}, { managerExtensions: registry });
    worldNavItem('downtime').click();
    await settleRouteExit();
    mounts[0].onRouteReselect(() => {
      throw new Error('companion exploded');
    });

    const errors = [];
    const originalError = console.error;
    console.error = (...args) => errors.push(args);
    try {
      assert.doesNotThrow(() => target.querySelector('#manager-downtime-nav-ledger').click());
      await settleRouteExit();
    } finally {
      console.error = originalError;
    }
    assert.equal(errors.length, 1);
    assert.match(errors[0][0], /Downtime route re-activation handler failed/);
    assert.equal(
      activeCompanionPanel().dataset.downtimeExtensionPanel,
      'ledger',
      'the rail still works and the surface is still the companion’s'
    );
  });

  // The mounted-companion fixture every navigation-guard case opens with.
  async function mountGuardedCompanion() {
    const registry = createManagerExtensionsRegistry();
    const mounts = [];
    registry.publicApi.registerWorldNavProvider(chromeChannelProvider(mounts));
    mountDowntimeManager([], {}, {}, { managerExtensions: registry });
    worldNavItem('downtime').click();
    await settleRouteExit();
    assert.equal(mounts.length, 1);
    return mounts;
  }

  const managerRoute = () => target.querySelector('.fabricate-manager').dataset.managerView;

  it('lets a companion with unsaved work refuse a tab switch and a route exit', async () => {
    const mounts = await mountGuardedCompanion();
    const asked = [];
    mounts[0].onBeforeNavigate((event) => {
      asked.push(event.reason);
      return false;
    });

    // A TAB SWITCH. Before this seam the companion could prompt on the controls it owns and on
    // a rail re-activation, and had no say at all here: the panel was disposed and its draft
    // went with it.
    target.querySelector('#manager-downtime-nav-crew').click();
    await settleRouteExit();
    assert.deepEqual(asked, ['tab'], 'the guard is told which kind of navigation it is refusing');
    assert.equal(
      activeCompanionPanel().dataset.downtimeExtensionPanel,
      'ledger',
      'the GM stays on the screen holding the unsaved work'
    );
    assert.equal(mounts.length, 1, 'and the mount that owns it is never torn down');

    // A ROUTE EXIT, for a Core route that has nothing to do with Downtime.
    worldNavItem('parties').click();
    await settleRouteExit();
    assert.deepEqual(asked, ['tab', 'route'], 'leaving the route reports as a route exit');
    assert.equal(managerRoute(), 'world-downtime', 'the GM is still on the companion’s route');
    assert.equal(mounts.length, 1);
    assert.ok(Boolean(activeCompanionPanel()), 'and its panel was never disposed');
  });

  it('gets out of the way the moment the companion allows', async () => {
    const mounts = await mountGuardedCompanion();
    const asked = [];
    let allow = false;
    mounts[0].onBeforeNavigate((event) => {
      asked.push(event.reason);
      return allow;
    });

    target.querySelector('#manager-downtime-nav-crew').click();
    await settleRouteExit();
    assert.equal(activeCompanionPanel().dataset.downtimeExtensionPanel, 'ledger');

    allow = true;
    target.querySelector('#manager-downtime-nav-crew').click();
    await settleRouteExit();
    assert.deepEqual(asked, ['tab', 'tab']);
    assert.equal(
      activeCompanionPanel().dataset.downtimeExtensionPanel,
      'crew',
      'an allowed navigation is the navigation that shipped, unchanged'
    );
    assert.equal(mounts.length, 2, 'and the destination tab mounts normally');

    // The guard died with the mount that registered it, so the new screen answers for itself.
    worldNavItem('parties').click();
    await settleRouteExit();
    assert.deepEqual(asked, ['tab', 'tab'], 'a new mount inherits no guard');
    assert.equal(managerRoute(), 'world');
  });

  it('waits for a companion’s own dialog before deciding', async () => {
    const mounts = await mountGuardedCompanion();
    let answer;
    mounts[0].onBeforeNavigate(
      () =>
        new Promise((resolve) => {
          answer = resolve;
        })
    );

    worldNavItem('parties').click();
    await settleRouteExit();
    assert.equal(managerRoute(), 'world-downtime', 'nothing moves while the GM is being asked');

    // A SECOND navigation arriving mid-dialog resolves from the same answer rather than
    // stacking a second prompt on the first.
    target.querySelector('#manager-downtime-nav-crew').click();
    await settleRouteExit();
    assert.equal(activeCompanionPanel().dataset.downtimeExtensionPanel, 'ledger');

    answer(false);
    await settleRouteExit();
    assert.equal(managerRoute(), 'world-downtime', 'the GM keeps their unsaved work');
    assert.equal(activeCompanionPanel().dataset.downtimeExtensionPanel, 'ledger');
    assert.equal(mounts.length, 1);
  });

  /** THE COMPATIBILITY GUARANTEE at the Manager level. */
  it('asks nothing at all of a companion that registered no guard', async () => {
    const mounts = await mountGuardedCompanion();

    target.querySelector('#manager-downtime-nav-crew').click();
    await settleRouteExit();
    assert.equal(activeCompanionPanel().dataset.downtimeExtensionPanel, 'crew');
    assert.equal(mounts.length, 2);

    worldNavItem('parties').click();
    await settleRouteExit();
    assert.equal(managerRoute(), 'world');

    worldNavItem('downtime').click();
    await settleRouteExit();
    assert.equal(managerRoute(), 'world-downtime');
    assert.equal(mounts.length, 3, 'every navigation completed, exactly as it did before');
  });

  it('never asks about a rail click that leaves the screen it is on', async () => {
    const mounts = await mountGuardedCompanion();
    const asked = [];
    mounts[0].onBeforeNavigate((event) => {
      asked.push(event.reason);
      return false;
    });

    // The PARENT Downtime rail item, clicked while the route is already open. It states no
    // destination tab, so it navigates nowhere — and a guard that fired here would prompt the
    // GM about abandoning work they are not being asked to abandon.
    worldNavItem('downtime').click();
    await settleRouteExit();
    assert.deepEqual(asked, [], 're-entering the route the GM is already on is not a navigation');

    // Neither is re-activating the sub-item already on screen: that is `onRouteReselect`.
    target.querySelector('#manager-downtime-nav-ledger').click();
    await settleRouteExit();
    assert.deepEqual(asked, [], 'and neither is a re-activation of the tab already showing');
    assert.equal(activeCompanionPanel().dataset.downtimeExtensionPanel, 'ledger');
    assert.equal(mounts.length, 1);
  });

  it('drops a navigation guard when its mount ends, and when the companion unsubscribes', async () => {
    const mounts = await mountGuardedCompanion();
    const asked = [];
    const stop = mounts[0].onBeforeNavigate(() => {
      asked.push('ledger');
      return false;
    });

    stop();
    stop();
    target.querySelector('#manager-downtime-nav-crew').click();
    await settleRouteExit();
    assert.deepEqual(
      asked,
      [],
      'an unsubscribed guard is not consulted, and stopping twice is safe'
    );
    assert.equal(activeCompanionPanel().dataset.downtimeExtensionPanel, 'crew');

    // The retired mount's context cannot register a new guard over the mount that replaced it.
    const staleStop = mounts[0].onBeforeNavigate(() => {
      asked.push('stale');
      return false;
    });
    assert.equal(typeof staleStop, 'function');
    worldNavItem('parties').click();
    await settleRouteExit();
    assert.deepEqual(asked, [], 'a retired context registers nothing');
    assert.equal(managerRoute(), 'world');
  });

  /** A COMPANION DEFECT MUST NEVER TRAP THE GM. */
  it('contains a throwing navigation guard and lets the GM leave', async () => {
    const mounts = await mountGuardedCompanion();
    mounts[0].onBeforeNavigate(() => {
      throw new Error('companion exploded');
    });

    const errors = [];
    const originalError = console.error;
    console.error = (...args) => errors.push(args);
    try {
      assert.doesNotThrow(() => worldNavItem('parties').click());
      await settleRouteExit();
    } finally {
      console.error = originalError;
    }
    assert.equal(errors.length, 1);
    assert.match(errors[0][0], /Downtime navigation guard failed/);
    assert.equal(managerRoute(), 'world', 'the GM is not stranded by a companion’s bug');
  });

  /** ISSUE 1332 — a companion sending the GM to another of its OWN tabs. */
  const downtimeSubitem = (tabId) => target.querySelector(`#manager-downtime-nav-${tabId}`);

  it('takes the GM to another of the companion’s own tabs, on the companion’s own request', async () => {
    const mounts = await mountGuardedCompanion();
    assert.equal(activeCompanionPanel().dataset.downtimeExtensionPanel, 'ledger');

    const moved = mounts[0].navigateToTab('crew');
    assert.equal(
      moved,
      true,
      'a request nobody has to be asked about is answered without asynchrony, as a click is'
    );
    await settleRouteExit();

    assert.equal(
      activeCompanionPanel().dataset.downtimeExtensionPanel,
      'crew',
      'THE POINT: the companion drew a control that names another of its screens, and reached it'
    );
    assert.equal(mounts.length, 2, 'the destination mounts exactly as a rail click mounts it');
    assert.equal(mounts[1].tabId, 'crew', 'and is told which of its own tabs it is showing');
    assert.equal(managerRoute(), 'world-downtime');
    // The RAIL follows, which is what makes this a navigation rather than a panel swap.
    assert.equal(downtimeSubitem('crew').getAttribute('aria-current'), 'true');
    assert.equal(downtimeSubitem('ledger').getAttribute('aria-current'), null);
    assert.ok(downtimeSubitem('crew').classList.contains('is-active'));
  });

  it('offers the companion’s own guard the navigation the companion asked for', async () => {
    const mounts = await mountGuardedCompanion();
    const asked = [];
    mounts[0].onBeforeNavigate((event) => {
      asked.push(event.reason);
      return false;
    });

    const moved = mounts[0].navigateToTab('crew');
    await settleRouteExit();
    assert.deepEqual(
      asked,
      ['tab'],
      'a companion holding unsaved work is asked about its OWN request, with the same reason'
    );
    assert.equal(moved, false, 'and is told plainly that nobody moved');
    assert.equal(
      activeCompanionPanel().dataset.downtimeExtensionPanel,
      'ledger',
      'the GM stays on the screen holding the unsaved work'
    );
    assert.equal(mounts.length, 1, 'and the mount that owns it is never torn down');
    assert.equal(downtimeSubitem('ledger').getAttribute('aria-current'), 'true');
  });

  it('answers with a promise while the companion’s own dialog is still open', async () => {
    const mounts = await mountGuardedCompanion();
    let answer;
    mounts[0].onBeforeNavigate(
      () =>
        new Promise((resolve) => {
          answer = resolve;
        })
    );

    const moved = mounts[0].navigateToTab('crew');
    // A BOOLEAN HERE WOULD BE A LIE. The veto is a dialog the GM has not answered.
    assert.equal(typeof moved?.then, 'function');
    await settleRouteExit();
    assert.equal(
      activeCompanionPanel().dataset.downtimeExtensionPanel,
      'ledger',
      'and nothing moves while the GM is being asked'
    );

    answer(false);
    assert.equal(await moved, false, 'the promise resolves to the answer the GM actually gave');
    await settleRouteExit();
    assert.equal(activeCompanionPanel().dataset.downtimeExtensionPanel, 'ledger');
    assert.equal(mounts.length, 1);
  });

  it('re-activates the tab already on screen rather than remounting it', async () => {
    const mounts = await mountGuardedCompanion();
    const events = [];
    mounts[0].onRouteReselect(() => events.push('pop'));
    const asked = [];
    mounts[0].onBeforeNavigate((event) => {
      asked.push(event.reason);
      return false;
    });

    assert.equal(mounts[0].navigateToTab('ledger'), true);
    await settleRouteExit();

    assert.deepEqual(events, ['pop'], 'the companion is offered its own re-activation');
    assert.equal(
      mounts.length,
      1,
      'THE POINT: no remount, so the drill-down the companion is popping out of still exists'
    );
    // The veto above is a POSITIVE CONTROL for the routing claim, not decoration.
    assert.deepEqual(asked, [], 'and no guard is asked about a navigation that goes nowhere');
    assert.equal(activeCompanionPanel().dataset.downtimeExtensionPanel, 'ledger');
  });

  /** THE GUARD CALLING BACK INTO THE SEAM IT IS ANSWERING (issue 1332 review). */
  async function mountThreeTabCompanion() {
    const registry = createManagerExtensionsRegistry();
    const mounts = [];
    registry.publicApi.registerWorldNavProvider(
      downtimeProvider({
        prefix: 'Guild',
        ids: ['ledger', 'crew', 'writs'],
        mount: ({ context }) => {
          mounts.push(context);
        },
      })
    );
    mountDowntimeManager([], {}, {}, { managerExtensions: registry });
    worldNavItem('downtime').click();
    await settleRouteExit();
    assert.equal(mounts.length, 1);
    return mounts;
  }

  it('refuses a redirect a guard asks for from inside its own body', async () => {
    const mounts = await mountThreeTabCompanion();
    const asked = [];
    const redirects = [];
    mounts[0].onBeforeNavigate((event) => {
      asked.push(event.reason);
      redirects.push(mounts[0].navigateToTab('writs'));
      return false;
    });

    // Before the refusal existed this recursed without bound.
    downtimeSubitem('crew').click();
    await settleRouteExit();

    assert.deepEqual(asked, ['tab'], 'the guard is asked once for the one navigation the GM made');
    assert.deepEqual(redirects, [false], 'and its own request is answered plainly, not nested');
    assert.equal(activeCompanionPanel().dataset.downtimeExtensionPanel, 'ledger');
    assert.equal(mounts.length, 1, 'nobody moved: not to the GM’s tab, and not to the redirect');
  });

  it('never commits a redirect ahead of the veto that is still pending', async () => {
    const mounts = await mountThreeTabCompanion();
    let calls = 0;
    let redirect;
    mounts[0].onBeforeNavigate(() => {
      calls += 1;
      // The CONDITIONAL redirect, which is worse than the unbounded one: it terminates.
      if (calls > 1) return true;
      redirect = mounts[0].navigateToTab('writs');
      return false;
    });

    downtimeSubitem('crew').click();
    await settleRouteExit();

    assert.equal(calls, 1, 'the guard is never re-entered, so its second arm is never reached');
    assert.equal(redirect, false);
    assert.equal(
      activeCompanionPanel().dataset.downtimeExtensionPanel,
      'ledger',
      'THE POINT: the veto is what stands, and no route was committed while it was pending'
    );
    assert.equal(mounts.length, 1);
    assert.equal(downtimeSubitem('ledger').getAttribute('aria-current'), 'true');
  });

  it('cannot reach Core’s own tabs once its provider has unregistered', async () => {
    const registry = createManagerExtensionsRegistry();
    const mounts = [];
    const unregister = registry.publicApi.registerWorldNavProvider(chromeChannelProvider(mounts));
    mountDowntimeManager([], {}, {}, { managerExtensions: registry });
    worldNavItem('downtime').click();
    await settleRouteExit();
    assert.equal(mounts.length, 1);

    // WHY THIS CASE EXISTS, and why a made-up tab id could not replace it. Between the
    // unregistration and Core's re-render the mount is still the live one, and the tab list
    // Core is ABOUT to render is its own preview's — `tracking`, `activities`, `factions`,
    // `settings`. Resolving membership from what Core renders rather than from the registered
    // provider would therefore hand a companion that no longer exists a working route onto
    // Core's own screens, which is the one destination this seam most clearly refuses.
    unregister();
    assert.equal(mounts[0].navigateToTab('tracking'), false, 'a Core preview tab is not its own');
    assert.equal(mounts[0].navigateToTab('ledger'), false, 'and neither is a tab it just lost');
    await settleRouteExit();
    assert.equal(mounts.length, 1, 'and nothing it asked for remounted it');
  });

  it('refuses a call from a mount that has already ended, and moves nobody', async () => {
    const mounts = await mountGuardedCompanion();
    downtimeSubitem('crew').click();
    await settleRouteExit();
    assert.equal(mounts.length, 2, 'the GM went somewhere, and the first mount ended');

    // The retired context, exactly as a companion would still be holding it.
    assert.equal(mounts[0].navigateToTab('ledger'), false);
    await settleRouteExit();
    assert.equal(
      activeCompanionPanel().dataset.downtimeExtensionPanel,
      'crew',
      'a stale context cannot drag the GM off the screen they chose'
    );
    assert.equal(mounts.length, 2, 'and nothing remounted');

    // POSITIVE CONTROL. Without it the `false` above passes just as well for a member that
    // never navigates anybody, which is the failure this suite has been bitten by before.
    assert.equal(mounts[1].navigateToTab('ledger'), true);
    await settleRouteExit();
    assert.equal(activeCompanionPanel().dataset.downtimeExtensionPanel, 'ledger');
    assert.equal(mounts.length, 3);
  });

  it('reaches the tabs this provider registered, and nothing else', async () => {
    const mounts = await mountGuardedCompanion();

    // `tracking` and `settings` are CORE'S OWN preview tab ids — real Downtime tabs.
    assert.equal(mounts[0].navigateToTab('tracking'), false);
    assert.equal(mounts[0].navigateToTab('settings'), false);
    assert.equal(mounts[0].navigateToTab('ledger-2'), false, 'and an id that exists nowhere');
    await settleRouteExit();
    assert.equal(activeCompanionPanel().dataset.downtimeExtensionPanel, 'ledger');
    assert.equal(managerRoute(), 'world-downtime', 'no Core route is reachable through the seam');
    assert.equal(mounts.length, 1, 'and nothing remounted on the way to refusing');

    // MALFORMED INPUT IS THE OTHER RULING, and it throws rather than answering.
    for (const malformed of [undefined, null, '', '   ', 7, ['crew']]) {
      assert.throws(
        () => mounts[0].navigateToTab(malformed),
        /navigateToTab requires a non-empty tab id/,
        `expected ${String(malformed)} to throw rather than answer`
      );
    }
    assert.equal(activeCompanionPanel().dataset.downtimeExtensionPanel, 'ledger');

    assert.equal(
      mounts[0].navigateToTab('crew'),
      true,
      'positive control: the tabs this provider DID register are still reachable'
    );
  });

  it('re-points the route when a provider re-registers with a different tab set', async () => {
    useShippedLocalization();
    const registry = createManagerExtensionsRegistry();
    const unregisterFirst = registry.publicApi.registerWorldNavProvider(
      downtimeProvider({ prefix: 'First', ids: ['alpha', 'beta'] })
    );
    mountDowntimeManager([], {}, {}, { managerExtensions: registry });
    worldNavItem('downtime').click();
    await settleRouteExit();
    target.querySelector('#manager-downtime-nav-beta').click();
    await settleDowntimeProvider();
    assert.equal(activeCompanionPanel().dataset.downtimeExtensionPanel, 'beta');

    unregisterFirst();
    registry.publicApi.registerWorldNavProvider(
      downtimeProvider({ prefix: 'Second', ids: ['gamma', 'delta', 'epsilon'] })
    );
    await settleDowntimeProvider();
    assert.deepEqual(downtimeRailIds(), ['gamma', 'delta', 'epsilon']);
    assert.deepEqual(downtimeTabIds(), [], 'and still no second rendering of the new set');
    assert.equal(
      activeCompanionPanel().dataset.downtimeExtensionPanel,
      'gamma',
      'an active tab the new set drops falls back to the first tab rather than rendering nothing'
    );
    assert.equal(
      managerTitle(),
      shippedString('FABRICATE.Admin.Manager.World.Downtime.Title'),
      'a replacement that declares no chrome gets Core naming the ROUTE, never the old tab'
    );
    assert.equal(
      managerSubtitle(),
      '',
      'Core preview marketing copy never sits under a companion screen that declared none'
    );
  });

  it('restores Core preview parity when the last provider is removed', async () => {
    useShippedLocalization();
    const registry = createManagerExtensionsRegistry();
    const unregisterProvider = registry.publicApi.registerWorldNavProvider(
      downtimeProvider({ prefix: 'Guild', ids: ['ledger', 'crew'] })
    );
    mountDowntimeManager([], {}, {}, { managerExtensions: registry });
    worldNavItem('downtime').click();
    await settleRouteExit();
    assert.deepEqual(downtimeRailIds(), ['ledger', 'crew']);
    assert.deepEqual(
      downtimeTabIds(),
      [],
      'the companion holds the surface, so Core draws no strip'
    );

    unregisterProvider();
    await settleDowntimeProvider();
    assert.deepEqual(downtimeTabIds(), ['tracking', 'activities', 'factions', 'settings']);
    assert.deepEqual(downtimeRailIds(), ['tracking', 'activities', 'factions', 'settings']);
    assert.equal(
      target.querySelector('[data-downtime-panel]:not([hidden])').dataset.downtimePanel,
      'tracking'
    );
    assert.equal(
      managerTitle(),
      shippedString('FABRICATE.Admin.Manager.World.Downtime.Preview.Tracking.Title')
    );
    assert.equal(
      managerSubtitle(),
      shippedString('FABRICATE.Admin.Manager.World.Downtime.Preview.Tracking.Subtitle')
    );
    assert.equal(
      target.querySelector('[data-breadcrumb-downtime-tab]').textContent.trim(),
      shippedString('FABRICATE.Admin.Manager.World.Downtime.Tabs.Tracking.Label')
    );
    assert.equal(
      target.querySelector('.manager-header-actions').getAttribute('aria-label'),
      shippedString('FABRICATE.Admin.Manager.World.Downtime.Actions')
    );
    assert.ok(
      Boolean(target.querySelector('[data-downtime-unlock]')),
      'Core reclaims its own Unlock with Premium action'
    );
    assert.equal(
      target.querySelectorAll('[data-world-downtime-lock] .fa-lock').length,
      4,
      'every Core rail child is padlocked again'
    );
    assert.ok(Boolean(target.querySelector('[data-world-downtime-callout]')));
  });

  it('supplies a frozen mount context and remounts when a companion requests it', async () => {
    const registry = createManagerExtensionsRegistry();
    const contexts = [];
    registry.publicApi.registerWorldNavProvider(
      downtimeProvider({
        ids: ['board'],
        mount: ({ context }) => {
          contexts.push(context);
        },
      })
    );
    globalThis.game.user = { isGM: true };
    try {
      mountDowntimeManager([], {}, {}, { managerExtensions: registry });
      worldNavItem('downtime').click();
      await settleRouteExit();

      assert.equal(contexts.length, 1);
      const [context] = contexts;
      assert.ok(Object.isFrozen(context), 'the context is frozen, so it cannot be written back');
      assert.deepEqual(Object.keys(context).sort(compareStrings), [
        'craftingSystemId',
        'isGM',
        // The runtime route-chrome channel is FUNCTIONS on the frozen context.
        'navigateToTab',
        'onBeforeNavigate',
        'onRouteReselect',
        'requestRemount',
        'revision',
        'route',
        'schemaVersion',
        'setRouteChrome',
        'surface',
        'surfaceId',
        'tabId',
      ]);
      assert.equal(typeof context.setRouteChrome, 'function');
      assert.equal(typeof context.onRouteReselect, 'function');
      assert.equal(typeof context.onBeforeNavigate, 'function');
      assert.equal(typeof context.navigateToTab, 'function');
      assert.equal(context.schemaVersion, 1);
      assert.equal(context.surface, 'manager');
      assert.equal(context.surfaceId, 'downtime');
      assert.equal(context.route, 'world-downtime');
      assert.equal(context.tabId, 'board');
      assert.equal(context.craftingSystemId, 'alchemy');
      assert.equal(context.isGM, true);
      assert.equal(context.revision, 0);

      context.requestRemount();
      await settleDowntimeProvider();
      assert.equal(contexts.length, 2, 'requestRemount re-runs mount for the active tab');
      assert.equal(contexts[1].revision, 1);
      assert.notEqual(contexts[1], context, 'each mount receives a fresh frozen context');
    } finally {
      delete globalThis.game.user;
    }
  });

  it('reports a null crafting system on the Downtime route when none is selected', async () => {
    const registry = createManagerExtensionsRegistry();
    const contexts = [];
    registry.publicApi.registerWorldNavProvider(
      downtimeProvider({
        ids: ['board'],
        mount: ({ context }) => {
          contexts.push(context);
        },
      })
    );
    mountDowntimeManager([], { noSystems: true }, {}, { managerExtensions: registry });
    worldNavItem('downtime').click();
    await settleRouteExit();

    assert.equal(contexts.length, 1, 'the route stays reachable with no crafting system selected');
    assert.equal(contexts[0].craftingSystemId, null);
    assert.equal(contexts[0].isGM, false, 'isGM reads the live Foundry user, defaulting closed');
  });

  it('publishes observational route hooks for mount, tab change and unmount', async () => {
    const hooks = [];
    const registry = createManagerExtensionsRegistry({
      emitHook: (name, payload) => hooks.push([name, payload]),
    });
    mountDowntimeManager([], {}, {}, { managerExtensions: registry });
    worldNavItem('downtime').click();
    await settleRouteExit();

    assert.deepEqual(
      hooks.map(([name]) => name),
      [MANAGER_HOOKS.SURFACE_MOUNTED]
    );
    assert.deepEqual(hooks[0][1], {
      schemaVersion: 1,
      surfaceId: 'downtime',
      route: 'world-downtime',
      tabId: 'tracking',
      providerId: null,
      coreFallback: true,
    });

    target.querySelector('[data-downtime-tab="factions"]').click();
    await settleDowntimeProvider();
    assert.equal(hooks[1][0], MANAGER_HOOKS.SURFACE_TAB_CHANGED);
    assert.equal(hooks[1][1].previousTabId, 'tracking');
    assert.equal(hooks[1][1].tabId, 'factions');

    const unregister = registry.publicApi.registerWorldNavProvider(
      downtimeProvider({ ids: ['factions', 'ledger'] })
    );
    await settleDowntimeProvider();
    assert.deepEqual(
      hooks.slice(2).map(([name]) => name),
      [MANAGER_HOOKS.NAV_PROVIDER_REGISTERED],
      'adopting a provider that still declares the active tab moves no tab'
    );

    unregister();
    await settleDowntimeProvider();
    worldNavItem('parties').click();
    await settleRouteExit();
    const unmountEvent = hooks.find(([name]) => name === MANAGER_HOOKS.SURFACE_UNMOUNTED);
    assert.ok(Boolean(unmountEvent), 'leaving the route publishes the unmount hook');
    assert.equal(unmountEvent[1].tabId, 'factions');
    assert.equal(unmountEvent[1].coreFallback, true);
  });

  // -- Downtime rail tab badges (issue 1302) --------------------------------------------

  const downtimeBadge = (tabId) => target.querySelector(`[data-world-downtime-badge="${tabId}"]`);
  const downtimeRollup = () => target.querySelector('[data-world-downtime-badge-total]');
  const downtimeParentAriaLabel = () => worldNavItem('downtime').getAttribute('aria-label');
  const downtimePremiumState = () =>
    target.querySelector('[data-world-nav-premium]')?.dataset.worldNavPremiumState;

  // AC-14's fixture: three rendered tabs.
  function badgedDowntimeProvider(mounts = [], badges = { ledger: 3, crew: 2 }) {
    return downtimeProvider({
      prefix: 'Guild',
      ids: ['ledger', 'crew', 'writs'],
      tab: (id) =>
        badges[id] === undefined
          ? {}
          : { badge: { count: badges[id], accessibleName: `${badges[id]} waiting on ${id}` } },
      mount: ({ context }) => {
        mounts.push(context);
      },
    });
  }

  // Registered BEFORE the mount, so the Manager opens in provider mode on its default route —
  // which is the state the rollup exists for, and the one no navigation is needed to reach.
  async function mountBadgedDowntimeManager({ badges, mounts = [] } = {}) {
    const registry = createManagerExtensionsRegistry();
    registry.publicApi.registerWorldNavProvider(badgedDowntimeProvider(mounts, badges));
    mountDowntimeManager([], {}, {}, { managerExtensions: registry });
    await settleDowntimeProvider();
    return { registry, mounts };
  }

  it('AC-11 — the runtime channel reaches the rail with no mount, and never by remounting one', async () => {
    const mounts = [];
    const { registry } = await mountBadgedDowntimeManager({ mounts });

    // (a) THE HALF THAT KILLS THE WRITE-ONLY SINK. The disclosure toggle opens the group
    // without leaving the `systems` route, so nothing has mounted and the companion holds no
    // context at all — the registry-level setter is the only channel there is. An
    // implementation that renders `tab.badge` and never subscribes stops here.
    target.querySelector('[data-world-downtime-toggle]').click();
    await settleDowntimeProvider();
    assert.equal(mounts.length, 0, 'opening a disclosure is not a navigation, and not a mount');
    assert.equal(
      downtimeBadge('ledger').textContent.trim(),
      '3',
      'the tab’s REGISTERED badge is what the rail starts from'
    );

    assert.equal(
      registry.publicApi.setWorldNavTabBadge('downtime', 'ledger', {
        count: 5,
        accessibleName: '5 claims waiting',
      }),
      true
    );
    await settleDowntimeProvider();
    assert.equal(
      downtimeBadge('ledger').textContent.trim(),
      '5',
      'the runtime badge reached the rail with no mount live anywhere'
    );
    assert.equal(mounts.length, 0, 'and stating one did not create one');

    // (b) The same call against a LIVE mount. `mounts.length === 1` is the assertion doing
    // the work: the host's mount effect keys on the context OBJECT and disposes the active
    // mount when it changes, so a replaced context is a remount and would push a second
    // entry. The identity clause below is entailed by the count, and kept as a cheap
    // restatement of what the count means.
    target.querySelector('#manager-downtime-nav-ledger').click();
    await settleRouteExit();
    assert.equal(mounts.length, 1, 'navigating to the companion’s screen mounts it once');
    const contextBefore = mounts[0];

    assert.equal(
      registry.publicApi.setWorldNavTabBadge('downtime', 'ledger', {
        count: 9,
        accessibleName: '9 claims waiting',
      }),
      true
    );
    await settleDowntimeProvider();
    assert.equal(downtimeBadge('ledger').textContent.trim(), '9');
    assert.equal(
      mounts.length,
      1,
      'THE WHOLE POINT: a new badge, same mount — the screen the GM is looking at survives it'
    );
    assert.equal(mounts[0], contextBefore, 'and the context the companion holds is the same one');

    // SURVIVES A TAB CHANGE AND A ROUTE CHANGE. The requirement says so and nothing else here
    // pins it: every other cell states a badge and reads it back where it stands.
    target.querySelector('#manager-downtime-nav-crew').click();
    await settleRouteExit();
    assert.equal(
      downtimeBadge('ledger').textContent.trim(),
      '9',
      'a tab change ends a mount, and a badge is not scoped to one'
    );

    worldNavItem('parties').click();
    await settleRouteExit();
    assert.equal(
      downtimeBadge('ledger').textContent.trim(),
      '9',
      'leaving the route entirely does not clear it either — which is the whole reason the ' +
        'channel hangs off the registration rather than off the frozen mount context'
    );

    worldNavItem('downtime').click();
    await settleRouteExit();
    assert.equal(
      downtimeBadge('ledger').textContent.trim(),
      '9',
      'and it is still there on return'
    );
  });

  it('AC-12 — a badge is a DESCRIPTION with a verbatim name, never part of the sub-item’s name', async () => {
    useShippedLocalization();
    // The fixture's `accessibleName` is a LIVE lang key.
    const VERBATIM_KEY = 'FABRICATE.Admin.Manager.World.Downtime.Nav';
    const registry = createManagerExtensionsRegistry();
    registry.publicApi.registerWorldNavProvider(
      downtimeProvider({
        prefix: 'Guild',
        ids: ['ledger', 'crew'],
        tab: (id) => ({
          badge:
            id === 'ledger'
              ? { count: 3, accessibleName: VERBATIM_KEY }
              : { count: 2, accessibleName: '2 crew idle' },
        }),
      })
    );
    mountDowntimeManager([], {}, {}, { managerExtensions: registry });
    worldNavItem('downtime').click();
    await settleRouteExit();

    const badge = downtimeBadge('ledger');
    assert.equal(badge.getAttribute('role'), 'img', 'a marker needs a name of its own');
    // THE SAME VEHICLE AS ITS OWN SUM (issue 1515). The parent's rollup is `navTabBadgeTotal`
    // over exactly these badges and has always drawn as the issue pill; drawing the addends as
    // record counts made one fact two marks. The discriminator the Rail Marker Family states is
    // that this mark carries a count AND names its unit, which the `aria-label` above is.
    assert.ok(
      badge.classList.contains('manager-nav-issue-badge'),
      'a companion tab badge draws through the rail summary vehicle'
    );
    assert.ok(
      !badge.classList.contains('manager-nav-count'),
      'and not through the record-count vehicle, which is a bare numeral standing for records'
    );
    assert.equal(
      badge.getAttribute('aria-label'),
      VERBATIM_KEY,
      'a badge name is FINAL DISPLAY TEXT, rendered verbatim exactly as `label` is'
    );
    assert.notEqual(
      shippedString(VERBATIM_KEY),
      VERBATIM_KEY,
      'and that key really does resolve in the shipped lang file, so the assertion above has teeth'
    );

    // A DESCRIPTION, not a name. The sub-item's own accessible name stays the companion's
    // `accessibleName`; Core owns no word order in the companion's language, and
    // `aria-labelledby` with two IDREFs would concatenate them in Core's listed order.
    const railItem = target.querySelector('#manager-downtime-nav-ledger');
    assert.equal(railItem.getAttribute('aria-label'), 'Open Guild ledger');
    assert.equal(railItem.getAttribute('aria-describedby'), badge.id);
    assert.equal(badge.id, 'manager-downtime-nav-badge-ledger');
    assert.equal(
      target.querySelector(`#${badge.id}`).getAttribute('aria-label'),
      VERBATIM_KEY,
      'the IDREF resolves to the badge, and the description a GM hears is that same string'
    );
    assert.notEqual(
      downtimeBadge('crew').id,
      badge.id,
      'two badged tabs carry distinct ids, or one sub-item describes the other’s count'
    );
    assert.equal(downtimeBadge('crew').id, 'manager-downtime-nav-badge-crew');

    // NEVER A DESCENDANT OF THE LABEL SPAN. That span names the whole companion panel region,
    // so a badge nested inside it would silently rename the region to "Guild ledger 3".
    const labelSpan = target.querySelector('#manager-downtime-nav-label-ledger');
    assert.ok(!labelSpan.contains(badge), 'the badge is a SIBLING of the label, not a child of it');
    assert.equal(badge.parentElement, railItem, 'it sits in the row’s own trailing track');
    assert.equal(
      labelSpan.textContent.trim(),
      'Guild ledger',
      'so the visible label is unchanged by the badge beside it'
    );
    const region = target.querySelector('#world-downtime-panel-ledger');
    assert.equal(region.getAttribute('aria-labelledby'), labelSpan.id);
    assert.equal(
      target.querySelector(`#${region.getAttribute('aria-labelledby')}`).textContent.trim(),
      'Guild ledger',
      'and the panel region’s accessible name is unchanged by the badge’s presence'
    );
  });

  it('AC-13 — a stated zero renders the numeral, and clearing leaves no dangling IDREF', async () => {
    const registry = createManagerExtensionsRegistry();
    registry.publicApi.registerWorldNavProvider(
      downtimeProvider({ prefix: 'Guild', ids: ['ledger', 'crew'] })
    );
    mountDowntimeManager([], {}, {}, { managerExtensions: registry });
    worldNavItem('downtime').click();
    await settleRouteExit();
    const railItem = () => target.querySelector('#manager-downtime-nav-ledger');

    assert.ok(!downtimeBadge('ledger'), 'a tab stating no count renders no numeral');
    assert.ok(
      !railItem().hasAttribute('aria-describedby'),
      'and points no description at an element that is not there'
    );

    registry.publicApi.setWorldNavTabBadge('downtime', 'ledger', {
      count: 3,
      accessibleName: '3 claims waiting',
    });
    await settleDowntimeProvider();
    assert.equal(downtimeBadge('ledger').textContent.trim(), '3');

    registry.publicApi.setWorldNavTabBadge('downtime', 'ledger', {
      count: 0,
      accessibleName: 'Nothing waiting',
    });
    await settleDowntimeProvider();
    assert.equal(
      downtimeBadge('ledger').textContent.trim(),
      '0',
      'a stated zero is a POSITIVE statement about the tab: "0" means no records, and an ' +
        'absent numeral means no count was stated at all'
    );
    assert.equal(downtimeBadge('ledger').getAttribute('aria-label'), 'Nothing waiting');
    assert.equal(railItem().getAttribute('aria-describedby'), 'manager-downtime-nav-badge-ledger');

    registry.publicApi.setWorldNavTabBadge('downtime', 'ledger', null);
    await settleDowntimeProvider();
    assert.ok(!downtimeBadge('ledger'), 'clearing a badge removes the element');
    assert.ok(
      !railItem().hasAttribute('aria-describedby'),
      'and takes the IDREF with it — no description pointing at a node that no longer exists'
    );
  });

  // AC-14 — the parent rollup, in six cells. Every one of them discriminates against an
  // implementation the other five accept, which is why they are written out rather than
  // folded into "the rollup shows when it should".
  describe('AC-14 — the Downtime parent rollup summarises what a closed disclosure hides', () => {
    it('cell 1 — renders the total on a fresh Manager, in place of the muted PREMIUM chip', async () => {
      useShippedLocalization();
      await mountBadgedDowntimeManager();

      const parent = worldNavItem('downtime');
      assert.equal(
        parent.getAttribute('aria-expanded'),
        'false',
        'the Downtime disclosure is closed on EVERY fresh Manager open, which is the state ' +
          'the rollup exists for'
      );
      const rollup = downtimeRollup();
      assert.equal(rollup.textContent.trim(), '5', '3 on ledger plus 2 on crew; writs has none');
      assert.equal(rollup.getAttribute('role'), 'img');
      assert.equal(
        rollup.getAttribute('aria-label'),
        '5 updates',
        'Core names the unit itself, generically: it cannot know whether a companion counts ' +
          'records or demands, and the summed value is heterogeneous across tabs'
      );
      assert.ok(
        rollup.classList.contains('manager-nav-issue-badge'),
        'the rail’s summary vehicle, which is the mark that survives the collapsed-rail hide'
      );
      assert.ok(
        !target.querySelector('[data-world-nav-premium]'),
        'the parent’s single trailing track carries EITHER the chip or the rollup, never both'
      );

      // The parent's `aria-label` replaces its subtree.
      const visibleLabel = parent.querySelector('.manager-nav-label').textContent.trim();
      assert.equal(parent.getAttribute('aria-label'), 'Downtime, 5 updates');
      assert.ok(
        parent.getAttribute('aria-label').includes(visibleLabel),
        'Label-in-Name: the composed name contains the text rendered inside the row’s label'
      );
    });

    it('cell 2 — opening the group removes the rollup, restores the chip, and reverts the name', async () => {
      useShippedLocalization();
      await mountBadgedDowntimeManager();
      target.querySelector('[data-world-downtime-toggle]').click();
      await settleDowntimeProvider();

      assert.ok(
        !downtimeRollup(),
        'the children are on screen carrying their own counts, so Core has nothing to summarise'
      );
      assert.equal(downtimePremiumState(), 'installed', 'and the muted chip has its track back');
      assert.equal(
        downtimeParentAriaLabel(),
        'Downtime',
        'EXACTLY the route name: an unconditional composition would make every GM on every ' +
          'route hear "Downtime, 0 updates", and nothing else here catches that'
      );
    });

    it('cell 3 — collapsing the rail brings the rollup back even with the group open', async () => {
      await mountBadgedDowntimeManager();
      target.querySelector('[data-world-downtime-toggle]').click();
      await settleDowntimeProvider();
      assert.ok(!downtimeRollup(), 'the starting state for this cell is the group OPEN');

      // `railLockedOpen` is false off the Downtime route, so the control is enabled here.
      railToggleControl().click();
      await settleDowntimeProvider();

      assert.ok(railBodyCollapsed(), 'the rail is genuinely collapsed');
      assert.equal(
        downtimeRollup().textContent.trim(),
        '5',
        'the SECOND disjunct, and the cell that kills an implementation carrying only ' +
          '`!railGroupExpanded.worldDowntime`: on a collapsed rail the submenu is hidden and ' +
          'the rollup is the group’s only surviving signal'
      );
      // Deliberately nothing about the sub-item badges: happy-dom applies no stylesheet.
    });

    it('cell 4 — a provider with no badges renders no rollup and keeps its chip', async () => {
      useShippedLocalization();
      await mountBadgedDowntimeManager({ badges: {} });

      assert.ok(
        !downtimeRollup(),
        'Core has nothing to summarise at zero, and a lone 0 pill in a 56px icon gutter is a ' +
          'mark drawing attention to nothing'
      );
      assert.equal(downtimePremiumState(), 'installed');
      assert.equal(
        downtimeParentAriaLabel(),
        'Downtime',
        'and the row keeps the plain route name in every state but the one that earns more'
      );
    });

    it('cell 5 — the runtime layer OVERRIDES the registered one: 5 → 7 → 5, and never 10', async () => {
      useShippedLocalization();
      const mounts = [];
      const { registry } = await mountBadgedDowntimeManager({ mounts });
      assert.equal(downtimeRollup().textContent.trim(), '5');

      assert.equal(
        registry.publicApi.setWorldNavTabBadge('downtime', 'ledger', {
          count: 5,
          accessibleName: '5 claims waiting',
        }),
        true
      );
      await settleDowntimeProvider();
      assert.equal(
        downtimeRollup().textContent.trim(),
        '7',
        'ledger’s runtime 5 REPLACES its registered 3; `sum(registered) + sum(runtime)` would ' +
          'render 10, and "changes the total" would accept it'
      );
      assert.equal(downtimeParentAriaLabel(), 'Downtime, 7 updates');
      assert.equal(mounts.length, 0, 'with no mount live anywhere');

      registry.publicApi.setWorldNavTabBadge('downtime', 'ledger', null);
      await settleDowntimeProvider();
      assert.equal(
        downtimeRollup().textContent.trim(),
        '5',
        'and `null` clears the runtime layer, restoring the registered badge and the total'
      );
    });

    it('cell 6 — core-fallback renders no rollup and keeps the gold preview chip', async () => {
      // The CHEAP SECONDARY to AC-15, not the decisive form.
      mountDowntimeManager([], {}, {}, { managerExtensions: createManagerExtensionsRegistry() });
      await settleDowntimeProvider();

      assert.ok(!downtimeRollup(), 'Core does not summarise its own preview to itself');
      assert.equal(downtimePremiumState(), 'preview', 'and the loud gold sell is untouched');
    });
  });

  // AC-15, the reachable half. `manager-contract.test.js` counts the two badge render sites; this
  // is the state that proves the mode guard on them is doing work rather than guarding an
  // impossibility.
  it('AC-15 — a runtime badge stored while a mount is faulted never reaches Core’s preview row', async () => {
    useShippedLocalization();
    const registry = createManagerExtensionsRegistry();
    const errors = [];
    const originalError = console.error;
    console.error = (...args) => errors.push(args);
    try {
      mountDowntimeManager([], {}, {}, { managerExtensions: registry });
      registry.publicApi.registerWorldNavProvider(
        downtimeProvider({
          prefix: 'Broken',
          mount() {
            throw new Error('mount exploded');
          },
        })
      );
      worldNavItem('downtime').click();
      await settleRouteExit();

      assert.ok(errors.length > 0, 'the mount really did fault');
      assert.equal(
        downtimePremiumState(),
        'preview',
        'so Core took the surface back and is selling it again'
      );
      assert.deepEqual(
        downtimeTabIds(),
        ['tracking', 'activities', 'factions', 'settings'],
        'and Core is rendering its OWN four preview tabs, which is the collision'
      );

      assert.equal(
        registry.publicApi.setWorldNavTabBadge('downtime', 'tracking', {
          count: 4,
          accessibleName: '4 claims waiting',
        }),
        true,
        'the faulted provider still holds the surface and still declares the tab, so the ' +
          'setter accepts and STORES: the store is not what protects the preview row'
      );
      await settleDowntimeProvider();

      assert.ok(
        !target.querySelector('[data-world-downtime-badge]'),
        'the render guard is: no companion count appears on a Core preview row'
      );
      assert.ok(
        !target.querySelector('[data-world-downtime-badge-total]'),
        'and no rollup summarises a set Core owns'
      );
      assert.equal(downtimePremiumState(), 'preview', 'so the gold upsell is exactly what it was');
    } finally {
      console.error = originalError;
    }
  });

  // AC-23 — the four keys tasks 4 and 5 read. `text(key, fallback)` returns the FALLBACK
  // whenever `localize` hands the key back, so an implementation that renders every badge
  // correctly and ships none of these keys keeps every other criterion green while leaving
  // four strings untranslatable in every locale.
  it('AC-23 — the four new Downtime badge keys are string leaves in the shipped lang file', () => {
    const base = 'FABRICATE.Admin.Manager.World.Downtime';
    for (const leaf of [
      'BadgeTotalOne',
      'BadgeTotalOther',
      'NavWithBadgeOne',
      'NavWithBadgeOther',
    ]) {
      const key = `${base}.${leaf}`;
      assert.notEqual(
        shippedString(key),
        key,
        `${key} must be a string leaf in lang/en.json, or its fallback is untranslatable`
      );
    }
    for (const leaf of ['BadgeTotalOne', 'BadgeTotalOther']) {
      assert.ok(
        shippedString(`${base}.${leaf}`).includes('{count}'),
        `${leaf} must substitute the total rather than stating a number`
      );
    }
    // The teeth on Decision 5's SUBSTITUTED noun. Writing the literal word "Downtime" into
    // these two keys would put the row's noun in three places, where a translator changing one
    // and not the others silently breaks Label-in-Name with no test able to see it.
    for (const leaf of ['NavWithBadgeOne', 'NavWithBadgeOther']) {
      const value = shippedString(`${base}.${leaf}`);
      assert.ok(value.includes('{label}'), `${leaf} must take the row’s label as a token`);
      assert.ok(value.includes('{count}'), `${leaf} must take the total as a token`);
    }
  });

  // -- The World > Downtime experimental gate (issue 1257) ------------------------------

  // Everything the rail renders for Downtime, as one list.
  const DOWNTIME_RAIL_PARTS = [
    ['[data-world-downtime-section]', 'the group'],
    ['#manager-world-nav-downtime', 'the parent row'],
    ['#manager-downtime-toggle', 'the disclosure toggle'],
    ['.manager-nav-premium', 'the PREMIUM badge'],
  ];

  function assertDowntimeRailAbsent() {
    for (const [selector, label] of DOWNTIME_RAIL_PARTS) {
      assert.ok(!target.querySelector(selector), `${label} must not render behind a shut gate`);
    }
    // The submenu, its padlocks and the premium callout are children of the group.
    assert.ok(!target.querySelector('[data-world-downtime-submenu]'), 'no submenu');
    assert.ok(!target.querySelector('[data-world-downtime-lock]'), 'no padlocks');
    assert.ok(!target.querySelector('[data-world-downtime-callout]'), 'no premium callout');
  }

  it('hides the whole Downtime group behind a shut gate, and leaves World Parties alone', () => {
    mountManager([], { experimentalFeaturesEnabled: false });

    assertDowntimeRailAbsent();
    assert.ok(
      Boolean(target.querySelector('#manager-world-nav-parties')),
      'Parties is not gated — it is the permanent World entry the gated route redirects to'
    );
    assert.ok(
      Boolean(target.querySelector('[data-world-nav-section]')),
      'and the World section itself still renders, with a member left in it'
    );
  });

  it('renders the whole Downtime group once the GM opts in', () => {
    mountDowntimeManager([], {}, {}, { managerExtensions: createManagerExtensionsRegistry() });

    for (const [selector, label] of DOWNTIME_RAIL_PARTS) {
      assert.ok(Boolean(target.querySelector(selector)), `${label} renders behind an open gate`);
    }
    // Opened by the parent click, which is what proves the toggle and submenu are the shipped
    // ones rather than empty shells the negative case above could pass against vacuously.
    worldNavItem('downtime').click();
    flushSync();
    assert.equal(downtimeRailIds().length, 4, 'and the four Core previews are its children');
    assert.ok(Boolean(target.querySelector('[data-world-downtime-callout]')));
  });

  it('leaves the gated Manager with no control that reaches the Downtime route', async () => {
    mountManager([], { experimentalFeaturesEnabled: false });

    for (const control of Array.from(target.querySelectorAll('[data-world-nav-item]'))) {
      control.click();
      await settleRouteExit();
      assert.notEqual(
        managerRoute(),
        'world-downtime',
        `activating ${control.dataset.worldNavItem} must not reach a gated route`
      );
    }
    assertDowntimeRailAbsent();
  });

  /**
   * Turn the world setting off underneath the mounted Manager.
   *
   * @param {boolean} enabled The new value of `fabricate.experimentalFeatures`.
   */
  async function setExperimentalFeatures(enabled) {
    mountedStore.viewState.update((state) => ({
      ...state,
      experimentalFeaturesEnabled: enabled,
    }));
    await settleRouteExit();
  }

  /**
   * Put a companion on the Downtime route with the gate open, recording its lifecycle.
   *
   * @param {object} [options] Fixture inputs.
   * @param {object} [options.registry] Registry to register into.
   * @returns {Promise<{mounts: object[], cleanups: number[]}>} Mount contexts and cleanup log.
   */
  async function standOnCompanionDowntime({ registry = createManagerExtensionsRegistry() } = {}) {
    const mounts = [];
    const cleanups = [];
    const unregister = registry.publicApi.registerWorldNavProvider(
      downtimeProvider({
        ids: ['ledger', 'crew'],
        mount({ target: mountTarget, tabId, context }) {
          mountTarget.textContent = `Mounted ${tabId}`;
          mounts.push(context);
          return () => cleanups.push(tabId);
        },
      })
    );
    mountDowntimeManager([], {}, {}, { managerExtensions: registry });
    worldNavItem('downtime').click();
    await settleRouteExit();
    assert.equal(mounts.length, 1, 'the companion holds the route before the gate moves');
    return { mounts, cleanups, unregister };
  }

  /** THE SETTING MOVING UNDER A STANDING GM MUST NOT TOUCH THE PANEL (issue 1257). */
  it('leaves an open companion panel alone when the setting moves under it', async () => {
    const { mounts, cleanups } = await standOnCompanionDowntime();
    const asked = [];
    mounts[0].onBeforeNavigate((event) => {
      asked.push(event.reason);
      return false;
    });

    // THE POSITIVE CONTROL, and the case is worthless without it. "The guard was not consulted"
    // reads identically to "no guard was ever registered", and `onBeforeNavigate` returns a silent
    // no-op unsubscribe when it is called from a context whose mount is not live — so prove the
    // guard is live, and refusing, BEFORE asserting anything about what does or does not reach it.
    worldNavItem('parties').click();
    await settleRouteExit();
    assert.deepEqual(asked, ['route'], 'an ordinary rail exit consults the guard');
    assert.equal(managerRoute(), 'world-downtime', 'and its refusal holds the GM on the route');
    asked.length = 0;

    await setExperimentalFeatures(false);

    assert.equal(
      managerRoute(),
      'world-downtime',
      'the open route is not yanked out from under it'
    );
    assert.ok(Boolean(activeCompanionPanel()), 'the companion panel is still on screen');
    assert.deepEqual(cleanups, [], 'nothing was torn down, so no unsaved work was discarded');
    assert.deepEqual(asked, [], 'and nothing prompted either — this is not a navigation at all');
    assertDowntimeRailAbsent();

    // THE WAY OUT IS UNCHANGED. The rail entry is gone.
    worldNavItem('parties').click();
    await settleRouteExit();
    assert.deepEqual(asked, ['route'], 'the next navigation still consults the same live guard');
    assert.equal(managerRoute(), 'world-downtime', 'and still honours its refusal');
    assert.deepEqual(cleanups, []);
  });

  it('lets the GM leave the de-gated route for good once the companion allows it', async () => {
    const { mounts, cleanups } = await standOnCompanionDowntime();
    let allow = false;
    mounts[0].onBeforeNavigate(() => allow);

    await setExperimentalFeatures(false);
    assert.equal(managerRoute(), 'world-downtime');

    allow = true;
    worldNavItem('parties').click();
    await settleRouteExit();

    assert.equal(managerRoute(), 'world', 'the GM leaves through the exit they chose');
    assert.deepEqual(
      cleanups,
      ['ledger'],
      'and the companion is disposed exactly once, on the way'
    );
    assertDowntimeRailAbsent();

    // AND CANNOT RETURN. The rail entry is gone and both entries refuse.
    assert.ok(!target.querySelector('[data-world-downtime-item]'), 'no sub-item survives to click');
    assert.equal(managerRoute(), 'world');
  });

  it('accepts a provider registered while gated without blaming the module, and never mounts it', async () => {
    const hooks = [];
    const registry = createManagerExtensionsRegistry({
      emitHook: (name, payload) => hooks.push([name, payload]),
    });
    mountManager([], { experimentalFeaturesEnabled: false }, {}, { managerExtensions: registry });

    const mounts = [];
    const errors = [];
    const warnings = [];
    const originalError = console.error;
    const originalWarn = console.warn;
    console.error = (...args) => errors.push(args);
    console.warn = (...args) => warnings.push(args);
    let unregister;
    try {
      // A companion registers at `ready` and cannot know this GM's setting.
      assert.doesNotThrow(() => {
        unregister = registry.publicApi.registerWorldNavProvider(
          downtimeProvider({
            mount({ context }) {
              mounts.push(context);
            },
          })
        );
      }, 'registration is a page-session concern and never consults a per-world setting');
      await settleRouteExit();
    } finally {
      console.error = originalError;
      console.warn = originalWarn;
    }

    assert.deepEqual(errors, [], 'nothing is logged as if the module were at fault');
    assert.deepEqual(warnings, []);
    assert.deepEqual(
      hooks.map(([name]) => name),
      [MANAGER_HOOKS.NAV_PROVIDER_REGISTERED],
      'the registration hook still fires, and no surface lifecycle hook does'
    );
    assert.equal(typeof unregister, 'function', 'and the companion keeps its unregister handle');
    assert.deepEqual(mounts, [], 'what it observes is an ABSENCE: mount is simply never called');
    assert.ok(!target.querySelector('[data-world-downtime-host]'), 'no host is rendered');
    assertDowntimeRailAbsent();
  });

  it('refuses a companion’s tab navigation once the gate shuts under a standing GM', async () => {
    const { mounts, cleanups } = await standOnCompanionDowntime();

    // The gate does not evict a standing GM, which is what makes this state reachable at all:
    await setExperimentalFeatures(false);
    assert.equal(managerRoute(), 'world-downtime', 'the GM is left exactly where they were');
    assert.equal(mounts.length, 1);
    assertDowntimeRailAbsent();

    assert.equal(mounts[0].navigateToTab('crew'), false);
    await settleRouteExit();
    assert.equal(managerRoute(), 'world-downtime', 'and the request moved nobody');
    assert.equal(mounts.length, 1, 'no second mount, so nothing was silently torn down');
    assert.deepEqual(cleanups, [], 'nor was the standing companion disposed by a refusal');
  });

  it('cannot be resurrected by requestRemount from a context retained across the gate', async () => {
    const { mounts, cleanups } = await standOnCompanionDowntime();
    const retained = mounts[0];

    // Close the gate, then leave the panel the ordinary way.
    await setExperimentalFeatures(false);
    worldNavItem('parties').click();
    await settleRouteExit();
    assert.equal(managerRoute(), 'world');
    assert.deepEqual(cleanups, ['ledger'], 'the mount ended on the way out');

    // A companion may hold its context past the mount that minted it — a pending promise.
    assert.doesNotThrow(() => retained.requestRemount());
    await settleRouteExit();

    assert.equal(managerRoute(), 'world', 'the GM is not dragged back onto a gated route');
    assert.ok(!target.querySelector('[data-world-downtime-host]'), 'and no host is re-rendered');
    assert.deepEqual(mounts.length, 1, 'the companion is not mounted a second time');
    assert.deepEqual(cleanups, ['ledger'], 'nor disposed a second time');
    assertDowntimeRailAbsent();
  });
}
