import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const rootSource = readFileSync(
  resolve(__dirname, '../../src/ui/svelte/apps/FabricateAppRoot.svelte'),
  'utf8'
);
const appSource = readFileSync(
  resolve(__dirname, '../../src/ui/SvelteFabricateApp.svelte.js'),
  'utf8'
);
const gatheringSource = readFileSync(
  resolve(__dirname, '../../src/ui/svelte/apps/gathering/GatheringView.svelte'),
  'utf8'
);
const navModelSource = readFileSync(
  resolve(__dirname, '../../src/ui/playerNavModel.js'),
  'utf8'
);
const extensionHostSource = readFileSync(
  resolve(__dirname, '../../src/ui/svelte/apps/PlayerExtensionHost.svelte'),
  'utf8'
);

describe('FabricateAppRoot shell', () => {
  it('renders the planned navigation tabs', () => {
    for (const id of ['crafting', 'alchemy', 'gathering', 'journal', 'inventory']) {
      assert.ok(rootSource.includes(`id: '${id}'`), `nav should include the ${id} tab`);
    }
    for (const key of [
      'FABRICATE.App.Nav.Crafting',
      'FABRICATE.App.Nav.Alchemy',
      'FABRICATE.App.Nav.Gathering',
      'FABRICATE.App.Nav.Journal',
      'FABRICATE.App.Nav.Inventory',
    ]) {
      assert.ok(rootSource.includes(key), `nav should localize ${key}`);
    }
  });

  it('gates the Alchemy tab behind the showAlchemy prop', () => {
    assert.ok(rootSource.includes('showAlchemy = false'), 'shell should accept a showAlchemy prop');
    assert.ok(
      rootSource.includes("requires: 'alchemy'"),
      'the alchemy tab should be marked conditional'
    );
    assert.ok(
      rootSource.includes('showAlchemy,') && rootSource.includes('buildPlayerNavTabs({'),
      'the shell should hand showAlchemy to the one shared rail derivation'
    );
    // The gate itself moved into the UI-free leaf (issue 1198) so the shell, the application
    // host and the View Lab read ONE answer instead of three hand-maintained mirrors. Assert
    // it where it now lives, or this case silently stops covering anything.
    assert.ok(
      navModelSource.includes("tab.requires !== 'alchemy' || showAlchemy"),
      'the alchemy tab should only render when showAlchemy is true'
    );
  });

  it('routes the alchemy tab to AlchemyView (no more coming-soon placeholder)', () => {
    assert.ok(
      rootSource.includes("import AlchemyView from './alchemy/AlchemyView.svelte'"),
      'the shell should import AlchemyView'
    );
    // `tab.tabId`, not `tab.id`: a rail entry is now addressed by its ROUTE KEY and carries the
    // bare tab id separately, so a Core branch must read the bare id.
    assert.ok(
      /\{:else if tab\.tabId === 'alchemy'\}[\s\S]*<AlchemyView \{services\} \/>/.test(rootSource),
      'the alchemy tab should render AlchemyView'
    );
    assert.ok(
      !rootSource.includes('FABRICATE.App.ComingSoon'),
      'the coming-soon placeholder should be gone now every tab is implemented'
    );
  });

  it('routes the inventory tab to InventoryView (not the placeholder)', () => {
    assert.ok(
      rootSource.includes("import InventoryView from './inventory/InventoryView.svelte'"),
      'the shell should import InventoryView'
    );
    assert.ok(
      /\{:else if tab\.tabId === 'inventory'\}\s*<InventoryView \{services\} \/>/.test(rootSource),
      'the inventory tab should render InventoryView'
    );
  });

  // Issue 1198. The rendered behaviour is proved in `fabricate-app-root-mounted.test.js`
  // against a real registry; these are the structural claims a mount cannot see.
  describe('companion navigation surfaces', () => {
    it('renders the extension branch through PlayerExtensionHost', () => {
      assert.ok(
        rootSource.includes("import PlayerExtensionHost from './PlayerExtensionHost.svelte'"),
        'the shell should import the mount host'
      );
      assert.ok(rootSource.includes('<PlayerExtensionHost'), 'and render it for a companion route');
      assert.ok(
        rootSource.includes('data-player-extension-fault'),
        'a faulted surface gets a Core error state in the panel'
      );
      assert.ok(
        rootSource.includes('data-player-nav-tab'),
        'every rail button carries a stable per-tab selector'
      );
    });

    it('subscribes to nothing: the snapshot arrives as a prop', () => {
      // Two subscribers within one window disagree about what that window renders, so the
      // application host is the player window's single subscriber and this shell is a pure
      // projection of what it pushes down.
      assert.ok(
        rootSource.includes('extensionSurfaces = []'),
        'the shell takes the frozen snapshot as a prop'
      );
      assert.ok(
        !rootSource.includes('.subscribeSurfaceIds('),
        'the shell must never subscribe to the registry itself'
      );
      assert.ok(
        !extensionHostSource.includes('.subscribeSurfaceIds('),
        'nor may the mount host'
      );
    });
  });

  // AC12 / maintainer decision A1. Scope prose expires when an issue closes; this does not.
  // The player window carries NO companion-product signal in any state — no badge, no
  // padlocked entry, no teaser tab, no upgrade offer, no subscription call to action.
  it('carries no premium signal of any kind, in either player-side component', () => {
    const forbidden = [
      'premiumInstalled',
      'registeredSurfaceIds',
      'manager-titlebar-badge',
      'patreon.com',
      'PREMIUM',
    ];
    for (const [name, source] of [
      ['FabricateAppRoot.svelte', rootSource],
      ['PlayerExtensionHost.svelte', extensionHostSource],
    ]) {
      for (const token of forbidden) {
        assert.ok(
          !source.includes(token),
          `${name} must not contain "${token}" — the player window advertises nothing, in any state`
        );
      }
    }
  });

  it('threads the active canvas tool into the shared header bar instead of a chip bar above the content', () => {
    // The standalone chip bar above the tab content was removed; the chip now
    // rides in ActorSelectTopBar's right-side context cluster.
    assert.ok(
      !rootSource.includes('fabricate-app-tool-chip-bar'),
      'the standalone tool-chip bar should be gone from the app shell'
    );
    assert.ok(
      rootSource.includes('{activeCanvasTool}') ||
        rootSource.includes('activeCanvasTool={activeCanvasTool}'),
      'the active canvas tool should be passed into ActorSelectTopBar'
    );
    assert.ok(
      /<ActorSelectTopBar[^>]*activeCanvasTool/.test(rootSource),
      'ActorSelectTopBar should receive the activeCanvasTool prop'
    );
  });

  it('filters the inventory-change refresh to actors this app reads from', () => {
    assert.ok(
      rootSource.includes('subscribeInventoryChange'),
      'the shell should subscribe to owned-item changes'
    );
    // Only reload for actors this app reads from — the selected crafting actor or a
    // component-source actor, resolved at fire time.
    assert.ok(
      rootSource.includes('isRelevantCraftingActor'),
      'inventory refresh should be filtered to relevant actors'
    );
    assert.ok(
      rootSource.includes('getSelectedCraftingActorId') &&
        rootSource.includes('getCraftingComponentSourceIds'),
      'relevance should be computed from the selected + source actor seams'
    );
  });

  // WHICH STORES EACH SUBSCRIPTION REACHES IS PROVED BY MOUNTING, NOT BY READING THE SOURCE.
  //
  // Two source-text guards used to live here, each slicing a 400-character window after the
  // FIRST occurrence of a `subscribe*(` call and asserting the store seams it named. Both were
  // provably vacuous: that window spans four subscription sites, so review demonstrated all
  // five of their assertions passing against routing that was simultaneously wrong in three
  // ways — the journal subscribed to `narrative`, every store was handed every domain, and
  // every domain token was misspelled. They are replaced by the table-driven mounted case in
  // `fabricate-app-root-mounted.test.js`, which drives one single-domain payload per domain
  // through the real `Hooks` seam and asserts the exact set of store seams invoked.
  it('never calls the inventory store load seam directly, anywhere in the shell', () => {
    // The one claim of the deleted pair a mount cannot make cheaply, because it is about the
    // WHOLE file rather than about one code path. `inventoryStore.reloadOnDocumentChange`
    // drops a hook-driven listing reload while a bulk salvage/destroy run is in flight (issue
    // 859), leaving the run's own terminal reload to pick it up; a direct `load(true)` from
    // the shell rebuilds the listing under the open bulk panel roughly once per queued row
    // and makes the guard dead code.
    assert.ok(
      !/services\?\.inventory\?\.load\?\.\(/.test(rootSource),
      'the shell must never call the inventory store load seam directly'
    );
  });

  it('wires the Gathering view to refresh on inventory and crafting-data changes', () => {
    assert.ok(
      gatheringSource.includes('subscribeInventoryChange'),
      'GatheringView should refresh on the selected actor inventory change'
    );
    assert.ok(
      gatheringSource.includes('subscribeCraftingDataChange'),
      'GatheringView should refresh on a crafting-system/recipe change'
    );
    assert.ok(
      gatheringSource.includes('store.selectedActorId'),
      'gathering inventory relevance should be gated on the selected gathering actor'
    );
  });

  it('scopes the Gathering view to the DERIVED domain set rather than a restated list', () => {
    // The gathering store's ROUTING behaviour is proved end to end by
    // `tests/invalidation-domain-signal.test.js`, which subscribes through the shipped
    // `STORE_DOMAINS[GATHERING]` and asserts which changes reach it. What that cannot see is
    // whether THIS view uses the same set, because this view's subscription is not what it
    // drives. Pinned at the source, and the guard is not vacuous — mutating the derived set to
    // an inline list reddens it.
    //
    // A mounted proof is genuinely available and was weighed rather than assumed away:
    // `GatheringView` is already mounted by three suites, all of which now carry
    // `invalidationDomains.js` in their allowlists, so what is missing is a `Hooks` fake and a
    // `load` counter rather than a harness. It is worth adding when one of those suites next
    // needs a `Hooks` fake for its own reasons; standing one up for this single line is not.
    assert.match(
      gatheringSource,
      /subscribeCraftingDataChange\([\s\S]{0,120}domains: STORE_DOMAINS\[INVALIDATION_STORES\.GATHERING\]/,
      'GatheringView must take its domain set from the derived transpose'
    );
    assert.ok(
      !/domains: \[/.test(gatheringSource),
      'and never restate one inline — a second copy is exactly the drift the derivation removes'
    );
  });

  it('exposes an accessible tablist driven by host state', () => {
    assert.ok(rootSource.includes('role="tablist"'), 'left nav should be a tablist');
    assert.ok(
      rootSource.includes('activeTab === tab.routeKey'),
      'active state should derive from the activeTab prop'
    );
    assert.ok(
      rootSource.includes('onSelectTab?.(tab.routeKey)'),
      'clicks should delegate selection to the host'
    );
    // The rail-button accessibility contract (issue 1198). It predates this change and is
    // closed by it, because this change is what puts third-party content inside the panel and
    // grows the tablist.
    assert.ok(rootSource.includes('aria-controls="player-nav-panel"'), 'buttons control the panel');
    assert.ok(
      rootSource.includes('aria-labelledby={activeNavTab'),
      'and the panel is labelled by the active button'
    );
    // The tab stop falls back to the first entry when the active tab names no rendered entry,
    // so it is bound to focusableTab rather than activeTab; aria-selected stays on activeTab.
    // The behavioural pin for the fallback lives in fabricate-app-root-mounted.test.js.
    assert.ok(
      rootSource.includes('tab.routeKey === focusableTab?.routeKey ? 0 : -1'),
      'the rail uses a roving tabindex'
    );
    for (const key of ['ArrowDown', 'ArrowUp', 'Home', 'End']) {
      assert.ok(rootSource.includes(`'${key}'`), `the vertical rail should handle ${key}`);
    }
    assert.ok(
      !rootSource.includes("'ArrowLeft'") && !rootSource.includes("'ArrowRight'"),
      'the rail is aria-orientation="vertical", so the horizontal pair would be wrong'
    );
    // A third-party label is unbounded and the rail column is 84px wide with a fixed 64px
    // button, so the label must truncate rather than put a horizontal scrollbar in the rail.
    assert.ok(
      /\.fabricate-app-nav-label \{[^}]*overflow: hidden;[^}]*text-overflow: ellipsis;/s.test(
        rootSource
      ),
      'the rail label should truncate with an ellipsis'
    );
  });
});

describe('SvelteFabricateApp shell window', () => {
  it('is a single shared window keyed by a stable id', () => {
    assert.ok(appSource.includes("id: 'fabricate-app'"), 'window id should be fabricate-app');
    assert.ok(appSource.includes('static _instance'), 'a single shared instance should be tracked');
  });

  it('opens or re-focuses on the requested tab', () => {
    assert.ok(appSource.includes('static async show(tab'), 'show should accept a tab argument');
    assert.ok(
      appSource.includes('bringToFront()'),
      'an already-open window should be brought to front'
    );
    assert.ok(
      appSource.includes('updateProps({ activeTab'),
      'tab switches should update props reactively'
    );
  });

  describe('activeCanvasTool session context (Phase 4)', () => {
    it('show accepts a two-arg { activeCanvasTool } options bag without breaking single-arg callers', () => {
      assert.ok(
        appSource.includes(
          'static async show(tab = DEFAULT_TAB, { activeCanvasTool, environmentId, taskId, actorId, interactableRef, onClose } = {})'
        ),
        'show should be the two-arg form with an options default so single-arg callers stay valid'
      );
      // existing single-arg call sites pass no options → activeCanvasTool undefined → null.
      assert.ok(
        appSource.includes('const nextCanvasTool = activeCanvasTool ?? null;'),
        'undefined options collapse to null'
      );
    });

    it('show SETS the active canvas tool on a fresh open and REPLACES it on re-show', () => {
      assert.ok(
        appSource.includes('existing._activeCanvasTool = nextCanvasTool;'),
        're-show of the live singleton replaces the active canvas tool'
      );
      assert.ok(
        appSource.includes('new SvelteFabricateApp({') &&
          appSource.includes('activeCanvasTool: nextCanvasTool'),
        'a fresh open seeds the active canvas tool through the constructor'
      );
    });

    it('a plain show(tab) CLEARS any existing active canvas tool (no stale station inherit)', () => {
      // nextCanvasTool is null when no options are supplied, and re-show assigns it
      // unconditionally — so a plain re-open clears a prior station context.
      assert.ok(
        appSource.includes('const nextCanvasTool = activeCanvasTool ?? null;'),
        'plain show resolves to null'
      );
    });

    it('exposes the active canvas tool through the services bag', () => {
      assert.ok(
        appSource.includes('getActiveCanvasTool: () => this._activeCanvasTool ?? null'),
        '_buildServices should expose getActiveCanvasTool'
      );
    });

    it('clears the active canvas tool on close() and the _onClose safety net', () => {
      const closeIdx = appSource.indexOf('async close(options)');
      const onCloseIdx = appSource.indexOf('_onClose(options)');
      assert.ok(closeIdx >= 0 && onCloseIdx >= 0, 'both close paths exist');
      const closeBody = appSource.slice(closeIdx, onCloseIdx);
      assert.ok(
        closeBody.includes('this._activeCanvasTool = null;'),
        'close() clears the session context'
      );
      const onCloseBody = appSource.slice(onCloseIdx);
      assert.ok(
        onCloseBody.includes('this._activeCanvasTool = null;'),
        '_onClose clears the session context too'
      );
    });

    it('derives a system-scoped presentTools payload from the active canvas tool', () => {
      assert.ok(
        appSource.includes('const componentId = this._activeCanvasTool?.componentId;'),
        'the threading boundary derives the present set from the active tool componentId'
      );
      assert.ok(
        appSource.includes('const systemId = this._activeCanvasTool?.systemId;'),
        'the threading boundary also reads the active tool systemId for scoping'
      );
      assert.ok(
        appSource.includes('const toolId = this._activeCanvasTool?.toolId;'),
        'the threading boundary also reads the library tool id (issue 1119)'
      );
      // Issue 1119: an item-sourced Tool carries `componentId: null`, so a componentId-only
      // payload was inert for every station the Tool Studio can author. The payload now
      // carries BOTH id kinds, still scoped by systemId (both ids are per-system).
      assert.ok(
        appSource.includes('if (!systemId || (!componentId && !toolId)) return null;'),
        'the payload is inert only when the system or BOTH ids are missing'
      );
      assert.ok(
        appSource.includes('componentIds: componentId ? [componentId] : [],') &&
          appSource.includes('toolIds: toolId ? [toolId] : [],'),
        'the payload carries systemId, componentIds and toolIds so matching stays system-scoped'
      );
    });

    it('passes the active canvas tool through to the Svelte props', () => {
      assert.ok(
        appSource.includes('activeCanvasTool: this._activeCanvasTool'),
        '_prepareSvelteProps should surface the active canvas tool reactively'
      );
    });
  });

  describe('interactable close re-prompt callback (issue 332)', () => {
    it('threads a one-shot onClose option through show into the constructor', () => {
      assert.ok(
        appSource.includes(
          'static async show(tab = DEFAULT_TAB, { activeCanvasTool, environmentId, taskId, actorId, interactableRef, onClose } = {})'
        ),
        'show should accept an onClose option'
      );
      assert.ok(
        appSource.includes("const nextOnClose = typeof onClose === 'function' ? onClose : null;"),
        'show should normalize a non-function onClose to null'
      );
      assert.ok(
        appSource.includes('onClose: nextOnClose'),
        'a fresh open seeds the close callback through the constructor'
      );
      assert.ok(
        appSource.includes("if (typeof options.onClose === 'function') {"),
        'the constructor stores a function onClose'
      );
      assert.ok(
        appSource.includes('this._onCloseCallback = options.onClose;'),
        'the constructor stores onClose on the instance'
      );
    });

    it('re-show REPLACES the one-shot close callback (set when supplied, cleared when not)', () => {
      assert.ok(
        appSource.includes('existing._onCloseCallback = nextOnClose;'),
        're-show replaces the close callback so a plain re-open clears a stale interactable re-prompt'
      );
    });

    it('fires the close callback once (no-throw) from both close paths and clears it', () => {
      assert.ok(appSource.includes('_fireCloseCallback()'), 'a one-shot fire helper exists');
      const closeIdx = appSource.indexOf('async close(options)');
      const onCloseIdx = appSource.indexOf('_onClose(options)');
      const closeBody = appSource.slice(closeIdx, onCloseIdx);
      assert.ok(closeBody.includes('this._fireCloseCallback();'), 'close() fires the callback');
      const onCloseBody = appSource.slice(onCloseIdx);
      assert.ok(
        onCloseBody.includes('this._fireCloseCallback();'),
        '_onClose fires the callback as a safety net'
      );
      // The helper is one-shot: it clears the ref BEFORE invoking so a double
      // close path (close → _onClose) cannot fire it twice.
      const fireIdx = appSource.indexOf('_fireCloseCallback() {');
      const fireBody = appSource.slice(fireIdx, fireIdx + 400);
      assert.ok(
        fireBody.includes('this._onCloseCallback = null;'),
        'the helper clears the callback ref'
      );
      assert.ok(
        fireBody.indexOf('this._onCloseCallback = null;') < fireBody.indexOf('callback()'),
        'the callback ref is cleared BEFORE invoking so it fires at most once'
      );
      assert.ok(
        fireBody.includes('try {') && fireBody.includes('catch'),
        'the fire is wrapped no-throw'
      );
    });

    it('fires the close callback AFTER super.close() so the canvas is settled', () => {
      const closeIdx = appSource.indexOf('async close(options)');
      const onCloseIdx = appSource.indexOf('_onClose(options)');
      const closeBody = appSource.slice(closeIdx, onCloseIdx);
      assert.ok(
        closeBody.indexOf('await super.close(options)') <
          closeBody.indexOf('this._fireCloseCallback();'),
        'the re-prompt fires after the window has fully closed'
      );
    });
  });

  it('only accepts a Core tab or a currently registered companion route key', () => {
    assert.ok(
      appSource.includes("['crafting', 'alchemy', 'gathering', 'journal', 'inventory']"),
      'the Core tab set should still be the known nav tabs'
    );
    // The WHOLE guard expression, not the bare `isOfferedTab(tab)` this used to look for:
    // `static show`'s own site matches that substring too, so dropping the predicate out of
    // `_selectTab` left this case green under the name of the thing it had stopped covering.
    assert.ok(
      appSource.includes('if (!isOfferedTab(tab) || tab === this._activeTab) {'),
      '_selectTab should guard against tabs nothing offers'
    );
    // `isCoreTabId` is STRUCTURAL — it answers "this is not a provider route key", which is
    // true of any non-empty string — so the predicate must intersect it with this window's own
    // Core ids. Without the intersection `isOfferedTab('bogus')` is true and the constructor,
    // `_selectTab` and `static show` all silently accept it, which is looser than the shipped
    // `VALID_TABS` set this replaced.
    assert.ok(
      /if \(isCoreTabId\(tab\)\) return CORE_TABS\.has\(tab\);/.test(appSource),
      'a Core-shaped id must still be checked against the Core set'
    );
    assert.ok(
      appSource.includes('playerExtensions.getPlayerNavProvider(route.surfaceId)'),
      'and a route key must be checked against the LIVE registry, not a frozen set'
    );
    for (const site of [
      'if (isOfferedTab(options.activeTab))',
      'if (!isOfferedTab(tab) || tab === this._activeTab) {',
      'const initialTab = isOfferedTab(tab) ? tab : DEFAULT_TAB;',
    ]) {
      assert.ok(appSource.includes(site), `the predicate should also guard: ${site}`);
    }
  });

  // Issue 1198. Every claim here is one a mounted test cannot make, because the class extends
  // ApplicationV2 and cannot be instantiated headless.
  describe('companion navigation surfaces', () => {
    it('SEEDS the snapshot in _prepareSvelteProps, derived rather than read off a field', () => {
      const start = appSource.indexOf('_prepareSvelteProps() {');
      const body = appSource.slice(start, appSource.indexOf('_selectTab(tab) {'));
      assert.ok(start >= 0, '_prepareSvelteProps exists');
      // `_registerHooks()` runs from `_onRender` — AFTER this method — and returns early once
      // the hook bag exists, so without the seed a companion registering during its own init
      // has no tabs on first open and, if it never re-registers, never at all.
      assert.ok(
        body.includes('extensionSurfaces: deriveExtensionSurfaces(playerExtensions, {'),
        'the first frame props must DERIVE the snapshot'
      );
      // The temporary player Downtime gate (issue 1257): the snapshot is derived under the
      // world's opt-in, so the first frame cannot advertise a withheld surface either.
      assert.ok(
        body.includes('experimentalFeaturesEnabled: isExperimentalFeaturesEnabled()'),
        'and must state the experimental gate it is derived under'
      );
      assert.ok(
        !body.includes('extensionSurfaces: this._'),
        'never off a field: a key present here is re-assigned over the reactive props on every ' +
          're-render, so a stale field would clobber a live snapshot'
      );
      assert.ok(body.includes('playerExtensions'), 'and the registry is threaded down');
    });

    it('subscribes exactly once, in _registerHooks, and releases it in _removeHooks', () => {
      assert.ok(
        appSource.includes('playerExtensions.subscribeSurfaceIds(() =>'),
        'the application host is the player window sole subscriber'
      );
      assert.equal(
        (appSource.match(/subscribeSurfaceIds\(/g) || []).length,
        1,
        'exactly one subscription: two subscribers within one window disagree'
      );
      const removeIdx = appSource.indexOf('_removeHooks() {');
      const removeBody = appSource.slice(removeIdx, removeIdx + 400);
      assert.ok(
        removeBody.includes('this._playerExtensionsUnsubscribe?.();'),
        'and it is released with the Foundry hooks it lives beside'
      );
    });

    it('falls the active route back through resolveActiveTab on every publication', () => {
      const start = appSource.indexOf('_refreshExtensionSurfaces() {');
      assert.ok(start >= 0, '_refreshExtensionSurfaces exists');
      const body = appSource.slice(start, start + 600);
      assert.ok(body.includes('deriveExtensionSurfaces(playerExtensions, {'), 'fresh snapshot');
      assert.ok(
        body.includes('experimentalFeaturesEnabled: isExperimentalFeaturesEnabled()'),
        'and re-reads the experimental gate rather than caching the first frame\'s answer'
      );
      assert.ok(body.includes('resolveActiveTab('), 'and the shared fallback rule');
      assert.ok(body.includes('this.updateProps({ extensionSurfaces'), 'pushed down reactively');
    });

    it('disposes a mounted companion immediately before AWAITING super.close(options)', () => {
      const closeIdx = appSource.indexOf('async close(options)');
      const onCloseIdx = appSource.indexOf('_onClose(options)');
      const closeBody = appSource.slice(closeIdx, onCloseIdx);
      const dispose = closeBody.indexOf(
        'this._svelteComponent?.disposePlayerProvidersBeforeRemoval?.();'
      );
      const superClose = closeBody.indexOf('const result = await super.close(options);');
      assert.ok(dispose >= 0, 'close() disposes the companion');
      assert.ok(superClose >= 0, 'and awaits super.close');
      // Targeted at the AWAITED call, not at a returned expression: unlike the manager, this
      // class assigns the result and returns it afterwards.
      assert.ok(
        dispose < superClose,
        'the companion must tear down while its mount target is still connected'
      );
    });
  });

  it('wires the player Inventory tab seam, store, and cross-tab navigation', () => {
    assert.ok(
      appSource.includes(
        'listInventoryForActor: (opts = {}) => game?.fabricate?.listInventoryForActor?.(opts)'
      ),
      '_buildServices should expose the listInventoryForActor seam'
    );
    assert.ok(
      appSource.includes('services.inventory = createInventoryStore({ services })'),
      'the inventory store should be instantiated as a shared singleton'
    );
    assert.ok(
      appSource.includes('services.navigateToCraftingRecipe ='),
      'a cross-tab navigation seam should be exposed for Pin for Crafting'
    );
    assert.ok(
      appSource.includes("this._selectTab('crafting')"),
      'navigation should switch to the Crafting tab'
    );
  });

  it('computes and live-refreshes Alchemy tab availability', () => {
    assert.ok(
      appSource.includes('isAlchemyTabAvailable'),
      'shell should derive Alchemy availability from the shared helper'
    );
    assert.ok(appSource.includes('showAlchemy:'), 'showAlchemy should be passed to the component');
    assert.ok(
      appSource.includes("Hooks.on('fabricate.craftingSystemsChanged'"),
      'should re-evaluate when systems change'
    );
    assert.ok(
      appSource.includes("Hooks.on('fabricate.recipesChanged'"),
      'should re-evaluate when recipes change'
    );
    assert.ok(
      appSource.includes("this._activeTab === 'alchemy'"),
      'should fall back off the Alchemy tab when it disappears'
    );
  });

  // The window teardown is the ONLY net either progressive-order writer has: a player
  // who reorders and immediately closes, refreshes, or logs out inside the debounce
  // window loses the write silently otherwise. Source-contract, because the class
  // extends ApplicationV2 and cannot be instantiated headless.
  describe('_flushPendingOrderWrite (issues 651, 675)', () => {
    it('flushes BOTH progressive-order writers on teardown', () => {
      assert.ok(
        appSource.includes('this._services?.crafting?.flushProgressiveOrder?.()'),
        'the crafting store is flushed'
      );
      assert.ok(
        appSource.includes('this._services?.inventory?.flushSalvageOrder?.()'),
        'and the inventory store, which writes the salvage stage order'
      );
    });

    it('is called from both close() and _onClose(), so a forced teardown still writes', () => {
      const calls = appSource.split('this._flushPendingOrderWrite();').length - 1;
      assert.equal(calls, 2, 'close() and _onClose() both flush; the stores no-op the second');
    });

    it('attaches a .catch() to each flush, so no rejection can escape this seam', () => {
      // `void` discards the promise and the surrounding try/catch only catches
      // SYNCHRONOUS throws, so a rejecting flush would become an unhandled promise
      // rejection at window teardown — a console error on a path with no user to see
      // it, which the smoke run counts and fails on. The stores report failure by
      // return status rather than rejecting; this is the second line of defence.
      assert.ok(
        appSource.includes("flushProgressiveOrder?.()?.catch?.(noop)"),
        'the crafting flush cannot reject out of the teardown'
      );
      assert.ok(
        appSource.includes("flushSalvageOrder?.()?.catch?.(noop)"),
        'nor the inventory flush'
      );
    });
  });
});
