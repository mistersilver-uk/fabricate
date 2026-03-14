<!-- Svelte 5 runes mode -->
<script>
  import { localize } from '../util/foundryBridge.js';
  import ActorSelector from './ActorSelector.svelte';
  import SourceActorPicker from './SourceActorPicker.svelte';
  import CraftingTab from './CraftingTab.svelte';
  import AlchemyTab from './AlchemyTab.svelte';

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

<div class="fabricate-crafting-app">
  <!-- Actor Selection Section -->
  <section class="actor-selection-section">
    <ActorSelector
      availableActors={$viewState.availableActors}
      onSelectActor={store.selectActor}
    />
    <SourceActorPicker
      ownedActors={$viewState.ownedActors}
      onToggleSource={store.toggleSourceActor}
    />
  </section>

  {#if $showTabBar}
    <nav class="fabricate-tab-bar" role="tablist">
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
    </nav>
  {/if}

  {#if $hasAlchemyTab && ($activeTab === 'alchemy' || !$hasCraftingTab)}
    <AlchemyTab {store} />
  {:else}
    <CraftingTab {store} {services} />
  {/if}
</div>

<style>
  .fabricate-tab-bar {
    display: flex;
    gap: 0;
    padding: 0 12px;
    border-bottom: 1px solid rgba(0, 0, 0, 0.2);
    background: rgba(0, 0, 0, 0.06);
  }

  .fabricate-tab {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    padding: 6px 12px;
    font-size: 13px;
    border-radius: 6px 6px 0 0;
    border: 1px solid rgba(0, 0, 0, 0.25);
    border-bottom: none;
    background: transparent;
    opacity: 0.7;
    cursor: pointer;
  }

  .fabricate-tab:hover {
    background: rgba(0, 0, 0, 0.08);
    opacity: 1;
  }

  .fabricate-tab.active {
    background: var(--fabricate-primary);
    color: #fff;
    border-color: var(--fabricate-primary);
    opacity: 1;
  }
</style>
