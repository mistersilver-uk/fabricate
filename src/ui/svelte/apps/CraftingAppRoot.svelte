<!-- Svelte 5 runes mode -->
<script>
  import ActorSelector from './ActorSelector.svelte';
  import SourceActorPicker from './SourceActorPicker.svelte';
  import CraftingTab from './CraftingTab.svelte';

  let { store, services = null } = $props();

  // svelte-ignore state_referenced_locally
  const viewState = store.viewState;
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

  <CraftingTab {store} {services} />
</div>
