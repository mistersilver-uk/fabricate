<!-- Svelte 5 runes mode -->
<script>
  import { localize } from '../util/foundryBridge.js';

  let {
    recipes = [],
    searchTerm = '',
    craftableOnly = false,
    selectedRecipeId = null,
    onSearch,
    onToggleCraftableOnly,
    onAutoFill,
    onSelectRecipe
  } = $props();

  function handleRowClick(recipeId) {
    if (typeof onSelectRecipe === 'function') {
      onSelectRecipe(recipeId);
    }
  }

  function handleRowKey(event, recipeId) {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      handleRowClick(recipeId);
    }
  }
</script>

<div class="alchemy-discovered">
  <div class="alchemy-discovered-header">
    <h4 class="alchemy-discovered-title">
      {localize('FABRICATE.Alchemy.DiscoveredRecipes')}
    </h4>

    <label class="sr-only" for="alchemy-recipe-search">
      {localize('FABRICATE.Alchemy.SearchRecipes')}
    </label>
    <input
      type="text"
      id="alchemy-recipe-search"
      class="alchemy-discovered-search"
      placeholder={localize('FABRICATE.Alchemy.SearchPlaceholder')}
      value={searchTerm}
      aria-label={localize('FABRICATE.Alchemy.SearchRecipes')}
      oninput={(e) => onSearch?.(e.target.value)}
    />

    <button
      type="button"
      class="fabricate-filter-btn"
      class:active={craftableOnly}
      onclick={() => onToggleCraftableOnly?.()}
    >
      <i class="fas fa-check-circle"></i>
      {localize('FABRICATE.Alchemy.CraftableOnly')}
    </button>
  </div>

  <div class="alchemy-discovered-list">
    {#if recipes.length === 0}
      <div class="alchemy-discovered-empty">
        <i class="fas fa-book-open"></i>
        <p class="alchemy-discovered-empty-msg">
          {localize('FABRICATE.Alchemy.NoDiscoveredRecipes')}
        </p>
        <p class="alchemy-discovered-empty-hint">
          {localize('FABRICATE.Alchemy.NoDiscoveredRecipesHint')}
        </p>
      </div>
    {:else}
      {#each recipes as recipe (recipe.id)}
        <div
          class="alchemy-discovered-row"
          class:alchemy-discovered-row--selected={selectedRecipeId === recipe.id}
          data-recipe-id={recipe.id}
          role={onSelectRecipe ? 'button' : undefined}
          tabindex={onSelectRecipe ? 0 : undefined}
          aria-pressed={onSelectRecipe ? (selectedRecipeId === recipe.id) : undefined}
          onclick={onSelectRecipe ? () => handleRowClick(recipe.id) : undefined}
          onkeydown={onSelectRecipe ? (e) => handleRowKey(e, recipe.id) : undefined}
        >
          <img
            class="alchemy-discovered-img"
            src={recipe.img || 'icons/svg/item-bag.svg'}
            alt={recipe.name}
            width="32"
            height="32"
          />

          <span class="alchemy-discovered-name">{recipe.name}</span>

          <span
            class="alchemy-discovered-badge"
            class:available={recipe.canCraft}
            class:missing={!recipe.canCraft}
          >
            {recipe.canCraft
              ? localize('FABRICATE.Alchemy.StatusAvailable')
              : localize('FABRICATE.Alchemy.StatusMissing')}
          </span>

          <button
            type="button"
            class="alchemy-autofill-btn"
            aria-label={localize('FABRICATE.Alchemy.AutoFill') + ' ' + recipe.name}
            aria-disabled={recipe.canCraft ? undefined : 'true'}
            disabled={!recipe.canCraft}
            onclick={recipe.canCraft ? (e) => { e.stopPropagation(); onAutoFill?.(recipe.id); } : null}
          >
            <i class="fas fa-fill-drip"></i>
          </button>
        </div>
      {/each}
    {/if}
  </div>
</div>

<style>
  .alchemy-discovered {
    display: flex;
    flex-direction: column;
    overflow: hidden;
    height: 100%;
  }

  .alchemy-discovered-header {
    display: flex;
    flex-direction: column;
    gap: 4px;
    padding: 8px;
    flex-shrink: 0;
    min-height: 64px;
    justify-content: center;
  }

  .alchemy-discovered-title {
    margin: 0 0 2px 0;
    font-size: 11px;
    font-weight: 700;
    text-transform: uppercase;
    color: var(--fab-text-subtle);
    letter-spacing: 0.04em;
  }

  .sr-only {
    position: absolute;
    width: 1px;
    height: 1px;
    padding: 0;
    margin: -1px;
    overflow: hidden;
    clip: rect(0, 0, 0, 0);
    white-space: nowrap;
    border: 0;
  }

  .alchemy-discovered-search {
    height: var(--fab-v2-control-height);
    font-size: 13px;
    border-radius: var(--fab-v2-radius-control);
    padding: 0 var(--fab-space-2);
    width: 100%;
    box-sizing: border-box;
    border: 1px solid var(--fab-border);
    background: var(--fab-surface-raised);
    color: var(--fab-text);
  }

  .alchemy-discovered-search::placeholder {
    color: var(--fab-text-subtle);
  }

  .alchemy-discovered-search:focus,
  .alchemy-discovered-search:focus-visible {
    outline: 2px solid var(--fab-accent);
    outline-offset: 2px;
    border-color: var(--fab-accent);
  }

  .alchemy-discovered-list {
    flex: 1;
    overflow-y: auto;
  }

  .alchemy-discovered-row {
    display: flex;
    align-items: center;
    gap: var(--fab-space-2);
    padding: 6px var(--fab-space-2);
    border-bottom: 1px solid var(--fab-border);
    color: var(--fab-text);
  }

  .alchemy-discovered-row:hover {
    background: var(--fab-surface-raised);
  }

  .alchemy-discovered-row[role="button"] {
    cursor: pointer;
  }

  .alchemy-discovered-row--selected {
    background: var(--fab-accent-soft);
    box-shadow: inset 3px 0 0 var(--fab-accent);
  }

  .alchemy-discovered-row--selected:hover {
    background: var(--fab-accent-soft);
  }

  .alchemy-discovered-row[role="button"]:focus-visible {
    outline: 2px solid var(--fab-accent);
    outline-offset: -2px;
  }

  .alchemy-discovered-img {
    width: 32px;
    height: 32px;
    object-fit: contain;
    flex-shrink: 0;
  }

  .alchemy-discovered-name {
    flex: 1;
    font-size: 13px;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    min-width: 0;
  }

  .alchemy-discovered-badge {
    font-size: 11px;
    padding: 2px 6px;
    border-radius: 4px;
    border: 1px solid var(--fab-border);
    flex-shrink: 0;
    font-weight: 600;
  }

  .alchemy-discovered-badge.available {
    background: var(--fab-accent-soft);
    color: var(--fab-accent);
    border-color: var(--fab-accent);
  }

  .alchemy-discovered-badge.missing {
    background: var(--fab-warning-soft);
    color: var(--fab-warning);
    border-color: var(--fab-warning);
  }

  .alchemy-autofill-btn {
    width: var(--fab-v2-icon-button);
    height: var(--fab-v2-icon-button);
    display: flex;
    align-items: center;
    justify-content: center;
    border-radius: var(--fab-v2-radius-control);
    border: 1px solid var(--fab-border);
    background: transparent;
    color: var(--fab-text-muted);
    cursor: pointer;
    flex-shrink: 0;
    font-size: 13px;
    padding: 0;
  }

  .alchemy-autofill-btn:hover:not(:disabled),
  .alchemy-autofill-btn:focus-visible {
    border-color: var(--fab-border-strong);
    color: var(--fab-text);
    background: var(--fab-surface-raised);
  }

  .alchemy-autofill-btn:disabled {
    opacity: 0.45;
    cursor: not-allowed;
  }

  .alchemy-discovered-empty {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: var(--fab-space-1);
    padding: var(--fab-space-6) var(--fab-space-3);
    text-align: center;
    color: var(--fab-text-subtle);
  }

  .alchemy-discovered-empty i {
    font-size: 32px;
    opacity: 0.5;
  }

  .alchemy-discovered-empty-msg,
  .alchemy-discovered-empty-hint {
    font-size: 12px;
    color: var(--fab-text-subtle);
    margin: 0;
    text-align: center;
  }
</style>
