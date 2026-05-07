<!-- Svelte 5 runes mode -->
<script>
  import { localize } from '../util/foundryBridge.js';
  import ActorCraftingHeader from './ActorCraftingHeader.svelte';
  import CraftingView from './actor-app/CraftingView.svelte';
  import AlchemyView from './actor-app/AlchemyView.svelte';

  let { store, services = null } = $props();

  // svelte-ignore state_referenced_locally
  const viewState = store.viewState;
  // svelte-ignore state_referenced_locally
  const showTabBar = store.showTabBar;
  // svelte-ignore state_referenced_locally
  const activeTab = store.activeTab;
  // svelte-ignore state_referenced_locally
  const hasAlchemyTab = store.hasAlchemyTab;
  // svelte-ignore state_referenced_locally
  const hasCraftingTab = store.hasCraftingTab;
</script>

<div class="fabricate-crafting-app fabricate-actor-app">
  <ActorCraftingHeader
    availableActors={$viewState.availableActors}
    ownedActors={$viewState.ownedActors}
    onSelectActor={store.selectActor}
    onToggleSource={store.toggleSourceActor}
  />

  {#if $showTabBar}
    <div class="fabricate-tab-bar" role="tablist">
      <button
        class="fabricate-tab"
        class:active={$activeTab === 'alchemy'}
        role="tab"
        aria-selected={$activeTab === 'alchemy'}
        onclick={() => store.setActiveTab('alchemy')}
      >
        <i class="fas fa-flask"></i> {localize('FABRICATE.Tabs.Alchemy')}
      </button>
      <button
        class="fabricate-tab"
        class:active={$activeTab === 'crafting'}
        role="tab"
        aria-selected={$activeTab === 'crafting'}
        onclick={() => store.setActiveTab('crafting')}
      >
        <i class="fas fa-hammer"></i> {localize('FABRICATE.Tabs.Crafting')}
      </button>
    </div>
  {/if}

  {#if $hasAlchemyTab && ($activeTab === 'alchemy' || !$hasCraftingTab)}
    <AlchemyView {store} />
  {:else}
    <CraftingView {store} {services} />
  {/if}
</div>

<style>
  .fabricate-tab-bar {
    display: flex;
    gap: 0;
    padding: 0 var(--fab-space-3);
    border-bottom: 1px solid var(--fab-border);
    background: var(--fab-surface-soft);
  }

  .fabricate-tab {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    padding: 6px 12px;
    font-size: 13px;
    border-radius: 6px 6px 0 0;
    border: 1px solid var(--fab-border);
    border-bottom: none;
    background: transparent;
    color: var(--fab-text-muted);
    opacity: 0.85;
    cursor: pointer;
  }

  .fabricate-tab:hover {
    background: var(--fab-surface-raised);
    color: var(--fab-text);
    opacity: 1;
  }

  .fabricate-tab.active {
    background: var(--fab-accent-soft);
    color: var(--fab-accent);
    border-color: var(--fab-accent);
    opacity: 1;
  }

  .fabricate-tab:focus-visible {
    outline: 2px solid var(--fab-accent);
    outline-offset: 2px;
  }
</style>
