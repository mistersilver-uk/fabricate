<!-- Svelte 5 runes mode -->
<!--
  FabricateAppRoot is the shell for the unified Fabricate window. It renders a
  full-height left navigation and the active tab's implemented consumer surface:
  Crafting, Gathering, Journal, Inventory, and the conditional Alchemy tab (five
  tabs when Alchemy is available, four otherwise), plus every tab contributed by a
  registered player navigation provider (issue 1198).

  The active tab is owned by the host application (SvelteFabricateApp); nav
  clicks call `onSelectTab` and the host pushes the new tab back down via
  `activeTab`, so this component stays a pure projection of host state. That is
  also why this shell SUBSCRIBES TO NOTHING: `SvelteFabricateApp` is the player
  window's single registry subscriber and pushes `extensionSurfaces` down as a
  prop, exactly as `WorldDowntimeExtensionHost` takes `provider` as a prop.
-->
<script>
  import { onDestroy, tick, untrack } from 'svelte';
  import {
    isGameMaster,
    localize,
    subscribeSceneChange,
    subscribeWorldTime,
    subscribeInventoryChange,
    subscribeCraftingDataChange,
    subscribeActorRunFlagChange,
  } from '../util/foundryBridge.js';
  import GatheringView from './gathering/GatheringView.svelte';
  import CraftingView from './crafting/CraftingView.svelte';
  import AlchemyView from './alchemy/AlchemyView.svelte';
  import JournalView from './journal/JournalView.svelte';
  import InventoryView from './inventory/InventoryView.svelte';
  import ActorSelectTopBar from '../components/ActorSelectTopBar.svelte';
  import PlayerExtensionHost from './PlayerExtensionHost.svelte';
  import { buildPlayerNavTabs, parseRouteKey } from '../../playerNavModel.js';

  let {
    activeTab = 'crafting',
    showAlchemy = false,
    onSelectTab = null,
    services = null,
    activeCanvasTool = null,
    scopedEnvironmentId = null,
    scopedTaskId = null,
    scopedActorId = null,
    // The frozen `[{ surfaceId, provider }]` snapshot the application host derives on every
    // registry publication, and the registry itself — carried only so the mount host emits
    // its surface hooks through the same injectable edge the registry's own hooks use.
    extensionSurfaces = [],
    playerExtensions = null,
  } = $props();

  // The scoped interacting actor most recently applied to the selection, so an
  // interactable-granted actor seeds the bar once per distinct value (re-applied
  // when the window re-opens for a different actor) without clobbering a later
  // manual pick within the session.
  let appliedScopedActorId = $state(null);

  // Load the shared actor-selection state and current gathering conditions once
  // the shell mounts. The store guards its own one-time load (re-entry guard).
  // When an interactable activation supplied a scoped actor, seed it as the
  // default selection AFTER the selectable list has loaded.
  $effect(() => {
    const bar = services?.actorBar;
    if (!bar) return;
    bar.loadSelectableActors();
    bar.refreshConditions();
    if (scopedActorId && scopedActorId !== appliedScopedActorId) {
      appliedScopedActorId = scopedActorId;
      bar.selectScopedActor(scopedActorId);
    }
  });

  // The Alchemy tab is only shown when an enabled alchemy system has recipes.
  const CORE_PLAYER_TABS = [
    { id: 'crafting', icon: 'fa-hammer', label: 'FABRICATE.App.Nav.Crafting' },
    { id: 'alchemy', icon: 'fa-flask', label: 'FABRICATE.App.Nav.Alchemy', requires: 'alchemy' },
    { id: 'gathering', icon: 'fa-leaf', label: 'FABRICATE.App.Nav.Gathering' },
    { id: 'journal', icon: 'fa-book-open', label: 'FABRICATE.App.Nav.Journal' },
    { id: 'inventory', icon: 'fa-boxes-stacked', label: 'FABRICATE.App.Nav.Inventory' },
  ];

  // The Journal nav entry carries a live active-run count badge fed by the shared
  // journal store's reactive `navCount` rune getter.
  const journalNavCount = $derived(Number(services?.journal?.navCount ?? 0));
  // ONE derivation, three callers: this rail, the application host that owns the active tab,
  // and the View Lab's mount harness all read `playerNavModel.js` rather than each computing
  // its own answer. Its projection is an explicit allowlist, never a spread, so a field Core
  // does not read — a provider-declared `count`, say — cannot reach the rendered rail.
  const tabs = $derived(
    buildPlayerNavTabs({
      coreTabs: CORE_PLAYER_TABS,
      showAlchemy,
      journalNavCount,
      extensionSurfaces,
      localize,
    })
  );
  const activeNavTab = $derived(tabs.find((tab) => tab.routeKey === activeTab) ?? null);

  // ---------------------------------------------------------------------------------------
  // Companion surfaces (issue 1198)
  // ---------------------------------------------------------------------------------------

  const activeRoute = $derived(parseRouteKey(activeTab));
  const activeSurface = $derived(
    activeRoute
      ? (extensionSurfaces.find((surface) => surface.surfaceId === activeRoute.surfaceId) ?? null)
      : null
  );
  // A provider whose mount threw is set ASIDE, never unregistered: its registration (and its
  // unregister handle) stays the companion's, its rail entries stay in the rail, and the
  // active tab does not move. The faulted PROVIDER identity is recorded rather than the
  // surface id, which is what stops a replacement provider being pre-blamed for the previous
  // one's fault — a new snapshot is a new chance.
  //
  // `$state.raw`, NOT `$state`. A deep `$state` array proxies everything put into it, so the
  // recorded provider would be a PROXY of the companion's object and `entry.provider ===
  // activeSurface.provider` would be permanently false — the fault would be recorded, never
  // take effect, and the host would re-mount the throwing provider forever. Svelte says so out
  // loud (`state_proxy_equality_mismatch`) and then aborts with `effect_update_depth_exceeded`.
  // The array is replaced wholesale on every write, so raw is also all it ever needed.
  let faultedProviders = $state.raw([]);
  const activeProviderFaulted = $derived(
    Boolean(activeSurface) &&
      faultedProviders.some(
        (entry) =>
          entry.surfaceId === activeSurface.surfaceId && entry.provider === activeSurface.provider
      )
  );

  // A STABLE identity, never an inline arrow at the call site, and self-contained under
  // `untrack`. The host calls this from INSIDE its mount effect, so both a fresh function
  // identity per shell render and a tracked read of the values below would make the effect
  // depend on its own fault report: it re-runs, the mount throws again, and the pair diverge.
  // The Manager host is handed a stable named function for the same reason.
  function noteProviderFault(provider) {
    untrack(() => {
      const surfaceId = activeSurface?.surfaceId ?? null;
      if (!surfaceId) return;
      faultedProviders = [
        ...faultedProviders.filter((entry) => entry.surfaceId !== surfaceId),
        { surfaceId, provider },
      ];
    });
  }

  // Bumped by `context.requestRemount()`. The host's mount effect keys on the frozen context
  // object, so a new identity is the whole re-render mechanism.
  let contextRevision = $state(0);
  function requestRemount() {
    contextRevision += 1;
  }

  const playerExtensionContext = $derived.by(() => {
    // Read the revision so `requestRemount()` yields a NEW frozen identity.
    const revision = contextRevision;
    if (!activeSurface || !activeRoute) return null;
    return Object.freeze({
      schemaVersion: 1,
      surface: 'player',
      surfaceId: activeSurface.surfaceId,
      // The provider's own BARE tab id, never the composed route key.
      tabId: activeRoute.tabId,
      // A LOGICAL-OR, not a nullish-coalesce: `createActorBarStore` initialises and clears
      // this to the empty string, so `??` would publish `''` where the contract says `null`
      // — and, because the frozen context is the remount key, would also fire one spurious
      // remount the moment anything normalised it. The seam beneath it is named for
      // gathering, but `ActorSelectTopBar` renders above EVERY tab, so this is the
      // window-wide selection.
      actorId: services?.actorBar?.selectedActorId || null,
      // PRESENTATION, never authorization. It is true for assistant GMs too, and this window
      // has no role gate at all, so a companion showing GM affordances off it still needs its
      // own gate on any privileged write.
      isGM: isGameMaster(),
      revision,
      requestRemount,
    });
  });

  let shell = $state(null);
  let extensionHost = $state(null);

  // The ApplicationV2 shell calls this before it unmounts the Svelte root, while a companion
  // target is still connected. `onDestroy` remains the safety net for direct Svelte teardown
  // paths, which necessarily run against an already-detached tree.
  export function disposePlayerProvidersBeforeRemoval() {
    extensionHost?.disposeBeforeRemoval?.();
  }

  onDestroy(disposePlayerProvidersBeforeRemoval);

  function railButton(routeKey) {
    // Selection is by ATTRIBUTE, never by id: a route key contains colons, and an id selector
    // containing a colon is invalid CSS and throws `SyntaxError` rather than returning null.
    // The `id` exists only as an IDREF target, where no CSS parse happens.
    return shell?.querySelector?.(`[data-player-nav-tab="${routeKey}"]`) ?? null;
  }

  // Plain locals, deliberately not `$state`: they record what has already been OBSERVED, so
  // making them reactive would make this effect its own dependency.
  let observedFaultKey;
  let faultKeyObserved = false;
  const faultKey = $derived(activeProviderFaulted ? activeTab : null);

  /**
   * Should focus be recovered onto the rail, given where it is right now?
   *
   * A mount fault CLEARS the companion's subtree imperatively, from inside the host's own
   * effect, before this shell re-renders at all — so by the time the transition is observed
   * the focused companion control is already gone and focus has dropped to the document body.
   * That IS the loss D8 describes, so a body (or absent) `activeElement` counts. The check
   * still refuses to steal focus that something outside this window now holds.
   *
   * @returns {boolean} True when the rail should take focus.
   */
  function focusIsRecoverable() {
    const active = document.activeElement;
    return active == null || active === document.body || shell?.contains?.(active) === true;
  }

  // `$effect.pre` runs BEFORE the DOM is updated, mirroring `WorldDowntimeExtensionHost`'s
  // focus recovery — but as ONE effect rather than that host's capture/restore pair.
  //
  // The pair cannot work here and the reason is ordering, not taste. The fault is written from
  // a CHILD component's effect, which runs after this component's own effects in the same
  // flush, so a sibling `$effect` restoring focus would run before the `$effect.pre` that set
  // its flag — and, having already read the new `faultKey`, would never re-run. It was
  // silently a no-op until `fabricate-app-root-mounted.test.js` asked where focus actually
  // landed. Scheduling the restore on `tick()` from the pre-effect itself removes the ordering
  // question: the DOM is updated by the time the microtask runs.
  $effect.pre(() => {
    const nextKey = faultKey;
    if (faultKeyObserved && nextKey === observedFaultKey) return;
    const hadKey = faultKeyObserved;
    faultKeyObserved = true;
    observedFaultKey = nextKey;
    if (!hadKey || nextKey === null || !focusIsRecoverable()) return;
    tick().then(() => railButton(nextKey)?.focus?.());
  });

  // The rail is `aria-orientation="vertical"`, so the arrow pair is Up/Down rather than the
  // Manager tab strip's Left/Right. Selection follows focus, which is the tablist default.
  function onNavKeydown(event, index) {
    let next;
    if (event.key === 'ArrowDown') next = (index + 1) % tabs.length;
    else if (event.key === 'ArrowUp') next = (index - 1 + tabs.length) % tabs.length;
    else if (event.key === 'Home') next = 0;
    else if (event.key === 'End') next = tabs.length - 1;
    else return;
    event.preventDefault();
    const nextTab = tabs[next];
    onSelectTab?.(nextTab.routeKey);
    tick().then(() => railButton(nextTab.routeKey)?.focus?.());
  }

  // Shell-level Journal refresh: keep the store (and thus the nav badge) fresh
  // even while the Journal tab is closed. A scene change or world-time advance
  // quietly re-fetches; the store guards its own one-time initial load via
  // `loadedOnce`. JournalView registers its own (tab-open) effects too; the extra
  // quiet loads are harmless. READ-only — no side effects published here.
  $effect(() => {
    const store = services?.journal;
    if (store && !store.loadedOnce) store.load();
  });
  $effect(() => subscribeWorldTime(() => services?.journal?.load?.(true)));
  $effect(() => subscribeSceneChange(() => services?.journal?.load?.(true)));
  // Cross-client run refresh (issues 733 + 739): a run created/advanced/archived by
  // another client (or the primary-GM world-time resume) writes the selected actor's
  // run flags. main.js drops the stale run-manager cache on the same updateActor hook,
  // so this quiet re-fetch reads the freshly-persisted runs without a full app reload.
  // Gated to the selected journal actor so unrelated actors' updates are ignored.
  $effect(() =>
    subscribeActorRunFlagChange(() => services?.journal?.load?.(true), {
      isRelevantActor: (actorId) => {
        const selected = services?.getSelectedActorId?.() || null;
        return Boolean(selected) && String(selected) === String(actorId);
      },
    })
  );

  // Is the actor whose items just changed one this app's crafting/inventory views
  // read from? Membership in the selected crafting actor + the component-source
  // actors, read at fire time so it tracks the live selection. Filters out
  // unrelated actors' item churn so we don't reload on every world item edit.
  function isRelevantCraftingActor(actorId) {
    if (!actorId) return false;
    const selected = services?.getSelectedCraftingActorId?.() || null;
    if (selected && String(selected) === String(actorId)) return true;
    const sources = services?.getCraftingComponentSourceIds?.() ?? [];
    return Array.isArray(sources) && sources.some((id) => String(id) === String(actorId));
  }

  // Shell-level inventory-change refresh: adding/removing a component or editing an
  // item quantity on a relevant actor invalidates owned counts and recipe
  // craftability. Quietly re-fetch the item-derived shared stores (the Crafting and
  // Inventory views read these singletons, so both tabs update — even while closed).
  // The Gathering tab owns its own subscription (its listing is view-local).
  //
  // THE INVENTORY LISTING GOES THROUGH `reloadOnDocumentChange`, NEVER `load(true)`
  // (issue 859). That store method IS the bulk-run suppression: item mutations arrive
  // one hook fire per document, and a bulk run's burst — each row taking a roll, a
  // message create, item CRUD and up to three flag writes — coalesces into nothing
  // inside the subscription's trailing debounce, so a direct load here rebuilds the
  // listing under the open panel roughly once per queued row. The guard DROPS the
  // reload while a run is in flight; the run's own terminal `load(true)` picks it up,
  // which is what makes the drop safe. Calling `load(true)` from here is the bypass
  // that makes the guard dead code, so `fabricate-app-shell.test.js` pins its absence.
  $effect(() =>
    subscribeInventoryChange(
      () => {
        services?.crafting?.load?.(true);
        services?.inventory?.reloadOnDocumentChange?.();
        services?.alchemy?.load?.(true);
      },
      { isRelevantActor: (actorId) => isRelevantCraftingActor(actorId) }
    )
  );

  // Shell-level crafting-data refresh: a GM editing/saving a crafting system or
  // recipe can change definitions surfaced on any tab (recipe names in Journal runs,
  // component metadata, availability), so quietly reload every shared data store.
  // Works cross-client via main.js's updateSetting bridge (see subscribeCraftingDataChange).
  //
  // The inventory listing goes through the same bulk-run guard as the item-change
  // hook above. This one is not a per-document burst, so it is not the reload the
  // guard was added for — but rebuilding the listing under a live bulk panel is
  // exactly as wrong here, and the run's terminal reload covers the dropped refresh
  // identically. One rule for every shell-driven listing reload, no exceptions to
  // remember.
  $effect(() =>
    subscribeCraftingDataChange(() => {
      services?.craftingSources?.load?.(true);
      services?.crafting?.load?.(true);
      services?.inventory?.reloadOnDocumentChange?.();
      services?.alchemy?.load?.(true);
      services?.journal?.load?.(true);
    })
  );
</script>

<!-- `data-active-tab` publishes the route, mirroring what the manager root already does with
     `data-manager-view`. It is a zero-behaviour attribute: nothing reads it at runtime, no style
     binds to it, and removing it would change nothing a user sees.

     It exists because the screenshot harness had no way to tell which tab a captured frame is
     showing. Every player case shared one readiness selector — this element's class — which is
     present on every tab in every state, so a case whose navigation silently no-oped still
     published a frame and still passed. The manager half has been held to its route from the
     start; this gives the player half the same footing. -->
<div class="fabricate-app-shell" data-active-tab={activeTab} bind:this={shell}>
  <div
    class="fabricate-app-nav"
    role="tablist"
    aria-orientation="vertical"
    aria-label={localize('FABRICATE.App.Nav.Tablist')}
  >
    <!-- Every id this block introduces is NAMESPACED. A bare Core id such as `crafting` or
         `journal` shares a document with Foundry's own chrome, which does use bare id
         selectors, and an IDREF resolves to the first match in document order — so a
         collision would silently mislabel the panel with nothing able to see it, because
         happy-dom has no sidebar to collide with. -->
    {#each tabs as tab, index (tab.routeKey)}
      <button
        type="button"
        class="fabricate-app-nav-item"
        class:active={activeTab === tab.routeKey}
        role="tab"
        id={`player-nav-tab-${tab.routeKey}`}
        data-player-nav-tab={tab.routeKey}
        aria-selected={activeTab === tab.routeKey}
        aria-controls="player-nav-panel"
        aria-label={tab.accessibleName}
        aria-describedby={tab.tooltip ? `player-nav-tooltip-${tab.routeKey}` : undefined}
        tabindex={activeTab === tab.routeKey ? 0 : -1}
        onclick={() => onSelectTab?.(tab.routeKey)}
        onkeydown={(event) => onNavKeydown(event, index)}
      >
        <i class={tab.iconClass} aria-hidden="true"></i>
        <span class="fabricate-app-nav-label">{tab.text}</span>
        {#if tab.count > 0}
          <span class="fabricate-app-nav-count" data-nav-count={tab.routeKey}>{tab.count}</span>
        {/if}
      </button>
      {#if tab.tooltip}
        <span
          id={`player-nav-tooltip-${tab.routeKey}`}
          class="fabricate-app-nav-tooltip"
          role="tooltip">{tab.tooltip}</span
        >
      {/if}
    {/each}
  </div>

  <div class="fabricate-app-main">
    <!-- The active station-tool chip rides in the shared header bar's right-side
         context cluster (next to the gathering weather/time/region info). It is
         passed down so ActorSelectTopBar can render it adjacent to those
         conditions; see ActorSelectTopBar for the chip markup + aria-live. -->
    <ActorSelectTopBar store={services?.actorBar} {services} {activeTab} {activeCanvasTool} />

    <!-- A `div`, not the `section` this used to be. Naming the panel is what makes it a
         labelled `region` landmark by implication, and a landmark cannot also be a tabpanel:
         the compiler warning gate catches it, and the Manager's own downtime panels already
         use a plain `div` with exactly this attribute set. -->
    <div
      class="fabricate-app-content"
      id="player-nav-panel"
      role="tabpanel"
      tabindex="0"
      aria-labelledby={activeNavTab ? `player-nav-tab-${activeNavTab.routeKey}` : undefined}
    >
      {#if activeRoute}
        <!-- A companion route. The host is keyed on the SURFACE rather than sitting inside
             the per-tab each-block above, so it survives a tab change within one surface —
             which is what lets it report `surfaceTabChanged` at all — and is recreated when
             the user moves to a different companion's surface. -->
        {#if activeSurface && activeProviderFaulted}
          <div
            class="fabricate-app-extension-fault"
            data-player-extension-fault={activeSurface.surfaceId}
            role="alert"
          >
            <i class="fas fa-triangle-exclamation" aria-hidden="true"></i>
            <div>
              <strong>{localize('FABRICATE.App.Extension.FaultTitle')}</strong>
              <p>
                {localize('FABRICATE.App.Extension.FaultDescription', {
                  providerId: activeSurface.provider.id,
                })}
              </p>
            </div>
          </div>
        {:else if activeSurface}
          {#key activeSurface.surfaceId}
            <PlayerExtensionHost
              bind:this={extensionHost}
              provider={activeSurface.provider}
              surfaceId={activeSurface.surfaceId}
              tabId={activeRoute.tabId}
              context={playerExtensionContext}
              emitHook={playerExtensions?.emitHook}
              onProviderFault={noteProviderFault}
            />
          {/key}
        {/if}
      {:else}
        {#each tabs as tab (tab.routeKey)}
          {#if activeTab === tab.routeKey}
            {#if tab.tabId === 'crafting'}
              <CraftingView {services} />
            {:else if tab.tabId === 'alchemy'}
              <!-- FORWARD-COMPAT NOTE: the Alchemy tab does not yet carry its own
                   header/context bar. When it gains one (analogous to gathering's
                   weather/time/region in ActorSelectTopBar), the active station-tool
                   chip should move into THAT bar's RIGHT side, next to the tab's own
                   context info. Until then the chip rides in the shared
                   ActorSelectTopBar right bar (see the gathering pattern there). -->
              <AlchemyView {services} />
            {:else if tab.tabId === 'gathering'}
              <GatheringView {services} {scopedEnvironmentId} {scopedTaskId} />
            {:else if tab.tabId === 'journal'}
              <JournalView {services} />
            {:else if tab.tabId === 'inventory'}
              <InventoryView {services} />
            {/if}
          {/if}
        {/each}
      {/if}
    </div>
  </div>
</div>

<style>
  .fabricate-app-shell {
    display: flex;
    height: 100%;
    min-height: 0;
    color: var(--fab-text);
    background: var(--fab-surface);
  }

  .fabricate-app-nav {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 8px;
    flex: 0 0 84px;
    padding: 8px;
    border-right: 1px solid var(--fab-border);
    background: var(--fab-surface-soft);
    overflow-y: auto;
  }

  .fabricate-app-nav-item {
    position: relative;
    box-sizing: border-box;
    flex: 0 0 auto;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 6px;
    padding: 6px;
    width: 64px;
    height: 64px;
    text-align: center;
    border: 1px solid transparent;
    border-radius: 10px;
    background: transparent;
    color: var(--fab-text-muted);
    cursor: pointer;
  }

  .fabricate-app-nav-item i {
    font-size: 20px;
    line-height: 1;
  }

  /* `overflow` and `text-overflow` are what ADMIT a third-party label. Core authors its own
     five strings and its longest consumes almost exactly the ~52px text box a fixed 64px
     button leaves; a companion's label and its localizations are unbounded, and
     `.fabricate-app-nav` is `overflow-y: auto`, so `overflow-x` computes to `auto` and an
     unbounded label would spill and put a horizontal scrollbar in the 84px column. The
     untruncated text is what `accessibleName` and `tooltip` are for. */
  .fabricate-app-nav-label {
    max-width: 100%;
    overflow: hidden;
    font-size: 11px;
    line-height: 1.1;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  /* The `aria-describedby` target for a provider tab that supplies a tooltip. It is taken
     OUT OF FLOW and clipped rather than rendered: the rail is an 84px column with a fixed
     64px button grid, so a visible tooltip is the same overhang that failed the Manager
     strip's horizontal-overflow assertion, and the seam's contract is that a supplied
     tooltip is EXPOSED through `aria-describedby`, not that Core paints it. No pixels move
     for the five shipped Core buttons, which supply no tooltip and render no such node. */
  .fabricate-app-nav-tooltip {
    position: absolute;
    width: 1px;
    height: 1px;
    overflow: hidden;
    clip: rect(0 0 0 0);
    white-space: nowrap;
  }

  .fabricate-app-nav-item:hover {
    background: var(--fab-surface-raised);
    color: var(--fab-text);
  }

  .fabricate-app-nav-item.active {
    background: var(--fab-accent-soft);
    color: var(--fab-accent);
    border-color: var(--fab-accent);
  }

  /* Focus rings (Foundry orange suppressed on :focus, accent ring on
     :focus-visible) are handled globally for the .fabricate-app area in
     styles/fabricate.css. */

  .fabricate-app-main {
    flex: 1 1 auto;
    display: flex;
    flex-direction: column;
    min-width: 0;
    min-height: 0;
  }

  .fabricate-app-main :global(.fabricate-app-actor-bar) {
    flex: 0 0 auto;
  }

  .fabricate-app-content {
    flex: 1 1 auto;
    min-width: 0;
    min-height: 0;
    overflow: auto;
  }

  /* Core's own diagnostic for a companion whose mount threw. It is DIAGNOSTIC, not
     promotional: it names the provider that failed and says nothing about products,
     offers or subscriptions. */
  .fabricate-app-extension-fault {
    display: flex;
    align-items: flex-start;
    gap: 12px;
    margin: 20px;
    padding: 14px 16px;
    border: 1px solid var(--fab-border-strong);
    border-radius: 10px;
    background: var(--fab-surface-raised);
    color: var(--fab-text);
  }

  .fabricate-app-extension-fault i {
    color: var(--fab-danger-text);
    font-size: 18px;
    line-height: 1.2;
  }

  .fabricate-app-extension-fault p {
    margin: 4px 0 0;
    color: var(--fab-text-muted);
    font-size: 12px;
    line-height: 1.4;
  }
</style>
