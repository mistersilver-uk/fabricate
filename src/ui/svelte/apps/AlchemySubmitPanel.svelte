<!-- Svelte 5 runes mode -->
<script>
  import { localize } from '../util/foundryBridge.js';
  import DropZone from '../components/DropZone.svelte';

  let { store } = $props();

  // svelte-ignore state_referenced_locally
  const alchemyItems = store.alchemyItems;

  function handleDrop(item) {
    if (item) store.addAlchemyItem(item);
  }
</script>

<div class="fabricate-alchemy-panel">
  <h3 class="alchemy-title">{localize('FABRICATE.Alchemy.Title')}</h3>

  <div class="alchemy-drop-area">
    <DropZone onDrop={handleDrop} label="FABRICATE.Alchemy.DropIngredients" />
  </div>

  {#if $alchemyItems.length > 0}
    <ul class="alchemy-ingredient-list">
      {#each $alchemyItems as item, i (i)}
        <li class="alchemy-ingredient-item">
          {#if item.img}
            <img src={item.img} alt={item.name} class="alchemy-ingredient-img" />
          {/if}
          <span class="alchemy-ingredient-name">{item.name ?? item.uuid}</span>
          <button
            class="alchemy-remove-btn"
            onclick={() => store.removeAlchemyItem(i)}
            aria-label="Remove ingredient"
          >
            <i class="fas fa-times"></i>
          </button>
        </li>
      {/each}
    </ul>
  {/if}

  <div class="alchemy-actions">
    <button
      class="fabricate-craft-button alchemy-submit-btn"
      onclick={store.submitAlchemyAttempt}
      disabled={$alchemyItems.length === 0}
    >
      {localize('FABRICATE.Alchemy.SubmitAttempt')}
    </button>
    {#if $alchemyItems.length > 0}
      <button
        class="alchemy-clear-btn"
        onclick={store.clearAlchemyItems}
        aria-label="Clear all ingredients"
      >
        <i class="fas fa-trash"></i>
      </button>
    {/if}
  </div>
</div>
