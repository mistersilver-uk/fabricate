<!-- Svelte 5 runes mode -->
<script>
  import { localize } from '../util/foundryBridge.js';
  import DropZone from '../components/DropZone.svelte';

  let { store } = $props();

  // svelte-ignore state_referenced_locally
  const cauldronItems = store.cauldronItems;

  function handleDrop(item) {
    if (item) store.addCauldronItem(item);
  }
</script>

<div class="fabricate-cauldron-panel">
  <h3 class="cauldron-title">{localize('FABRICATE.Cauldron.Title')}</h3>

  <div class="cauldron-drop-area">
    <DropZone onDrop={handleDrop} label="FABRICATE.Cauldron.DropIngredients" />
  </div>

  {#if $cauldronItems.length > 0}
    <ul class="cauldron-ingredient-list">
      {#each $cauldronItems as item, i (i)}
        <li class="cauldron-ingredient-item">
          {#if item.img}
            <img src={item.img} alt={item.name} class="cauldron-ingredient-img" />
          {/if}
          <span class="cauldron-ingredient-name">{item.name ?? item.uuid}</span>
          <button
            class="cauldron-remove-btn"
            onclick={() => store.removeCauldronItem(i)}
            aria-label="Remove ingredient"
          >
            <i class="fas fa-times"></i>
          </button>
        </li>
      {/each}
    </ul>
  {/if}

  <div class="cauldron-actions">
    <button
      class="fabricate-craft-button cauldron-submit-btn"
      onclick={store.submitCauldronAttempt}
      disabled={$cauldronItems.length === 0}
    >
      {localize('FABRICATE.Cauldron.SubmitAttempt')}
    </button>
    {#if $cauldronItems.length > 0}
      <button
        class="cauldron-clear-btn"
        onclick={store.clearCauldronItems}
        aria-label="Clear all ingredients"
      >
        <i class="fas fa-trash"></i>
      </button>
    {/if}
  </div>
</div>
