<!-- Svelte 5 runes mode -->
<!--
  FabricateAppRoot is the shell for the unified Fabricate window. It renders a
  full-height left navigation with four tabs (Crafting, Gathering, Journal,
  Inventory). Tab content is an empty placeholder for now — this is the
  structural shell consumer surfaces will be built into.

  The active tab is owned by the host application (SvelteFabricateApp); nav
  clicks call `onSelectTab` and the host pushes the new tab back down via
  `activeTab`, so this component stays a pure projection of host state.
-->
<script>
  import { localize, subscribeSceneChange, subscribeWorldTime } from '../util/foundryBridge.js';
  import GatheringView from './gathering/GatheringView.svelte';
  import CraftingView from './crafting/CraftingView.svelte';
  import JournalView from './journal/JournalView.svelte';
  import InventoryView from './inventory/InventoryView.svelte';
  import ActorSelectTopBar from '../components/ActorSelectTopBar.svelte';

  let {
    activeTab = 'crafting',
    showAlchemy = false,
    onSelectTab = null,
    services = null,
    activeCanvasTool = null,
    scopedEnvironmentId = null,
    scopedTaskId = null,
    scopedActorId = null
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
  const ALL_TABS = [
    { id: 'crafting', icon: 'fa-hammer', label: 'FABRICATE.App.Nav.Crafting' },
    { id: 'alchemy', icon: 'fa-flask', label: 'FABRICATE.App.Nav.Alchemy', requires: 'alchemy' },
    { id: 'gathering', icon: 'fa-leaf', label: 'FABRICATE.App.Nav.Gathering' },
    { id: 'journal', icon: 'fa-book-open', label: 'FABRICATE.App.Nav.Journal' },
    { id: 'inventory', icon: 'fa-boxes-stacked', label: 'FABRICATE.App.Nav.Inventory' }
  ];

  // The Journal nav entry carries a live active-run count badge fed by the shared
  // journal store's reactive `navCount` rune getter.
  const journalNavCount = $derived(Number(services?.journal?.navCount ?? 0));
  const tabs = $derived(
    ALL_TABS
      .filter(tab => tab.requires !== 'alchemy' || showAlchemy)
      .map(tab => (tab.id === 'journal' ? { ...tab, count: journalNavCount } : tab))
  );

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
</script>

<div class="fabricate-app-shell">
  <div class="fabricate-app-nav" role="tablist" aria-orientation="vertical">
    {#each tabs as tab (tab.id)}
      <button
        type="button"
        class="fabricate-app-nav-item"
        class:active={activeTab === tab.id}
        role="tab"
        aria-selected={activeTab === tab.id}
        onclick={() => onSelectTab?.(tab.id)}
      >
        <i class="fas {tab.icon}" aria-hidden="true"></i>
        <span class="fabricate-app-nav-label">{localize(tab.label)}</span>
        {#if tab.count > 0}
          <span class="fabricate-app-nav-count" data-nav-count={tab.id}>{tab.count}</span>
        {/if}
      </button>
    {/each}
  </div>

  <div class="fabricate-app-main">
    <!-- The active station-tool chip rides in the shared header bar's right-side
         context cluster (next to the gathering weather/time/region info). It is
         passed down so ActorSelectTopBar can render it adjacent to those
         conditions; see ActorSelectTopBar for the chip markup + aria-live. -->
    <ActorSelectTopBar store={services?.actorBar} {services} {activeTab} {activeCanvasTool} />

    <section class="fabricate-app-content" role="tabpanel">
      {#each tabs as tab (tab.id)}
        {#if activeTab === tab.id}
          {#if tab.id === 'crafting'}
            <CraftingView {services} />
          {:else if tab.id === 'gathering'}
            <GatheringView {services} {scopedEnvironmentId} {scopedTaskId} />
          {:else if tab.id === 'journal'}
            <JournalView {services} />
          {:else if tab.id === 'inventory'}
            <InventoryView {services} />
          {:else}
            <!-- Shared placeholder for the (future) Alchemy tab.
                 FORWARD-COMPAT NOTE: when the planned Alchemy tab
                 gains its own header/context bar (analogous to gathering's
                 weather/time/region in ActorSelectTopBar), the active station-tool
                 chip should move into THAT bar's RIGHT side, next to the tab's own
                 context info. Until then the chip rides in the shared
                 ActorSelectTopBar right bar (see the gathering pattern there). -->
            <div class="fabricate-app-placeholder">
              <i class="fas {tab.icon}" aria-hidden="true"></i>
              <p class="fabricate-app-placeholder-title">{localize(tab.label)}</p>
              <p class="fabricate-app-placeholder-hint">{localize('FABRICATE.App.ComingSoon')}</p>
            </div>
          {/if}
        {/if}
      {/each}
    </section>
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

  .fabricate-app-nav-label {
    max-width: 100%;
    font-size: 11px;
    line-height: 1.1;
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

  .fabricate-app-placeholder {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 12px;
    height: 100%;
    color: var(--fab-text-muted);
    opacity: 0.6;
  }

  .fabricate-app-placeholder i {
    font-size: 36px;
  }

  .fabricate-app-placeholder p {
    margin: 0;
  }

  .fabricate-app-placeholder-title {
    font-size: 18px;
    font-weight: 600;
  }

  .fabricate-app-placeholder-hint {
    font-size: 13px;
    text-transform: uppercase;
    letter-spacing: 0.08em;
  }
</style>
