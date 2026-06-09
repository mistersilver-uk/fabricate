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
  import { localize } from '../util/foundryBridge.js';
  import GatheringView from './gathering/GatheringView.svelte';
  import ActorSelectTopBar from '../components/ActorSelectTopBar.svelte';

  let {
    activeTab = 'crafting',
    showAlchemy = false,
    onSelectTab = null,
    services = null,
    activeCanvasTool = null
  } = $props();

  // Load the shared actor-selection state and current gathering conditions once
  // the shell mounts. The store guards its own one-time load (re-entry guard).
  $effect(() => {
    services?.actorBar?.loadSelectableActors();
    services?.actorBar?.refreshConditions();
  });

  // The Alchemy tab is only shown when an enabled alchemy system has recipes.
  const ALL_TABS = [
    { id: 'crafting', icon: 'fa-hammer', label: 'FABRICATE.App.Nav.Crafting' },
    { id: 'alchemy', icon: 'fa-flask', label: 'FABRICATE.App.Nav.Alchemy', requires: 'alchemy' },
    { id: 'gathering', icon: 'fa-leaf', label: 'FABRICATE.App.Nav.Gathering' },
    { id: 'journal', icon: 'fa-book-open', label: 'FABRICATE.App.Nav.Journal' },
    { id: 'inventory', icon: 'fa-boxes-stacked', label: 'FABRICATE.App.Nav.Inventory' }
  ];

  const tabs = $derived(ALL_TABS.filter(tab => tab.requires !== 'alchemy' || showAlchemy));
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
      </button>
    {/each}
  </div>

  <div class="fabricate-app-main">
    <!-- The active station-tool chip rides in the shared header bar's right-side
         context cluster (next to the gathering weather/time/region info). It is
         passed down so ActorSelectTopBar can render it adjacent to those
         conditions; see ActorSelectTopBar for the chip markup + aria-live. -->
    <ActorSelectTopBar store={services?.actorBar} {activeTab} {activeCanvasTool} />

    <section class="fabricate-app-content" role="tabpanel">
      {#each tabs as tab (tab.id)}
        {#if activeTab === tab.id}
          {#if tab.id === 'gathering'}
            <GatheringView {services} />
          {:else}
            <!-- Shared placeholder for the Crafting, (future) Alchemy, Journal,
                 and Inventory tabs. FORWARD-COMPAT NOTE: when the Crafting and
                 planned Alchemy tabs gain their own header/context bar (analogous
                 to gathering's weather/time/region in ActorSelectTopBar), the
                 active station-tool chip should move into THAT bar's RIGHT side,
                 next to the tab's own context info. Until then the chip rides in
                 the shared ActorSelectTopBar right bar (see the gathering pattern
                 there). -->
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
