<!-- Svelte 5 runes mode -->
<!--
  RecipeListRow is one selectable recipe in the left-column browser list. It shows
  the recipe thumbnail, name, mode chip, and a status badge (from
  craftingRecipeStatus). Clicking it selects the recipe (drives the centre detail)
  and highlights the row. An "add to shopping list" affordance is exposed via a
  trailing button so a player can queue materials without opening the detail.
-->
<script>
  import { localize } from '../../util/foundryBridge.js';
  import CraftingThumb from './CraftingThumb.svelte';
  import CraftingStatusBadge from './CraftingStatusBadge.svelte';

  let {
    recipe = null,
    selected = false,
    onSelect = null,
    onAddToShoppingList = null
  } = $props();

  const id = $derived(String(recipe?.id ?? ''));
  const name = $derived(String(recipe?.name ?? ''));
  const modeLabel = $derived(String(recipe?.modeLabel ?? ''));
  const status = $derived(String(recipe?.browseStatus ?? ''));
  const redacted = $derived(recipe?.redaction?.redacted === true);

  function select() {
    onSelect?.(id);
  }
  function onRowKey(event) {
    if (event.key === 'Enter' || event.key === ' ' || event.key === 'Spacebar') {
      event.preventDefault();
      select();
    }
  }
  function addToList(event) {
    event.stopPropagation();
    onAddToShoppingList?.(id);
  }
</script>

<div
  class="crafting-recipe-row"
  class:is-selected={selected}
  role="listitem"
  data-recipe-id={id}
  data-selected={selected ? 'true' : 'false'}
  data-recipe-status={status}
>
  <!-- svelte-ignore a11y_no_static_element_interactions -->
  <div
    class="crafting-recipe-row-main is-toggle"
    role="button"
    tabindex="0"
    aria-pressed={selected}
    onclick={select}
    onkeydown={onRowKey}
  >
    <CraftingThumb src={recipe?.img} alt="" size={44} />
    <span class="crafting-recipe-row-copy">
      <span class="crafting-recipe-row-name" title={name}>{name}</span>
      <span class="crafting-recipe-row-meta">
        <span class="crafting-recipe-row-mode">{modeLabel}</span>
        <CraftingStatusBadge {status} compact />
      </span>
    </span>
    {#if !redacted}
      <button
        type="button"
        class="crafting-recipe-row-add"
        title={localize('FABRICATE.App.Crafting.Shopping.AddToList')}
        aria-label={localize('FABRICATE.App.Crafting.Shopping.AddToList')}
        onclick={addToList}
      >
        <i class="fas fa-cart-plus" aria-hidden="true"></i>
      </button>
    {/if}
  </div>
</div>

<style>
  .crafting-recipe-row {
    box-sizing: border-box;
    width: 100%;
    border: 1px solid var(--fab-border);
    border-radius: 8px;
    background: var(--fab-surface-soft);
    color: var(--fab-text);
    overflow: hidden;
  }

  .crafting-recipe-row.is-selected {
    border-color: var(--fab-accent);
    background: var(--fab-accent-soft);
  }

  .crafting-recipe-row-main {
    display: flex;
    align-items: center;
    gap: var(--fab-space-3);
    padding: var(--fab-space-2);
    min-height: 60px;
  }

  .crafting-recipe-row-main.is-toggle {
    cursor: pointer;
  }

  .crafting-recipe-row-main.is-toggle:focus-visible {
    outline: 2px solid var(--fab-accent);
    outline-offset: -2px;
  }

  .crafting-recipe-row-copy {
    flex: 1 1 auto;
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 4px;
  }

  .crafting-recipe-row-name {
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    font-weight: 600;
  }

  .crafting-recipe-row-meta {
    display: flex;
    align-items: center;
    gap: 6px;
    min-width: 0;
  }

  .crafting-recipe-row-mode {
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    font-size: 11px;
    color: var(--fab-text-muted);
  }

  .crafting-recipe-row-add {
    box-sizing: border-box;
    flex: 0 0 auto;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 32px;
    height: 32px;
    min-height: 32px;
    padding: 0;
    border: 1px solid var(--fab-border);
    border-radius: 6px;
    background: var(--fab-surface);
    color: var(--fab-text-muted);
    cursor: pointer;
  }

  .crafting-recipe-row-add:hover {
    background: var(--fab-surface-raised);
    color: var(--fab-text);
  }

  .crafting-recipe-row-add:focus-visible {
    outline: 2px solid var(--fab-accent);
    outline-offset: 2px;
  }
</style>
