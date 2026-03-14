<!-- Svelte 5 runes mode -->
<script>
  import { localize } from '../util/foundryBridge.js';

  let {
    recipes = [],
    searchTerm = '',
    craftableOnly = false,
    onSearch,
    onToggleCraftableOnly,
    onAutoFill
  } = $props();
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
      class="alchemy-craftable-toggle"
      class:active={craftableOnly}
      onclick={() => onToggleCraftableOnly?.()}
    >
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
        <div class="alchemy-discovered-row" data-recipe-id={recipe.id}>
          <img
            class="alchemy-discovered-img"
            src={recipe.img || ''}
            alt={recipe.name}
            width="28"
            height="28"
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
            onclick={recipe.canCraft ? () => onAutoFill?.(recipe.id) : null}
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
    font-size: 12px;
    font-weight: 700;
    text-transform: uppercase;
    opacity: 0.7;
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
    height: 28px;
    font-size: 12px;
    border-radius: 4px;
    padding: 0 6px;
    width: 100%;
    box-sizing: border-box;
    border: 1px solid rgba(0, 0, 0, 0.2);
    background: rgba(255, 255, 255, 0.6);
  }

  .alchemy-craftable-toggle {
    font-size: 11px;
    padding: 3px 8px;
    border-radius: 3px;
    border: 1px solid rgba(0, 0, 0, 0.2);
    background: rgba(0, 0, 0, 0.04);
    cursor: pointer;
    align-self: flex-start;
  }

  .alchemy-craftable-toggle.active {
    background: rgba(60, 120, 200, 0.15);
    border-color: rgba(60, 120, 200, 0.4);
    color: #2c5faa;
  }

  .alchemy-discovered-list {
    flex: 1;
    overflow-y: auto;
  }

  .alchemy-discovered-row {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 6px 4px;
    border-bottom: 1px solid rgba(0, 0, 0, 0.06);
  }

  .alchemy-discovered-row:hover {
    background: rgba(0, 0, 0, 0.06);
  }

  .alchemy-discovered-img {
    width: 28px;
    height: 28px;
    object-fit: contain;
    flex-shrink: 0;
  }

  .alchemy-discovered-name {
    flex: 1;
    font-size: 12px;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    min-width: 0;
  }

  .alchemy-discovered-badge {
    font-size: 10px;
    padding: 1px 5px;
    border-radius: 3px;
    flex-shrink: 0;
    font-weight: 600;
  }

  .alchemy-discovered-badge.available {
    background: rgba(40, 160, 80, 0.15);
    color: #1e7a3c;
  }

  .alchemy-discovered-badge.missing {
    background: rgba(0, 0, 0, 0.06);
    color: rgba(0, 0, 0, 0.45);
  }

  .alchemy-autofill-btn {
    width: 28px;
    height: 28px;
    display: flex;
    align-items: center;
    justify-content: center;
    border-radius: 4px;
    border: 1px solid rgba(0, 0, 0, 0.15);
    background: rgba(0, 0, 0, 0.04);
    cursor: pointer;
    flex-shrink: 0;
    font-size: 12px;
    padding: 0;
  }

  .alchemy-autofill-btn:disabled {
    opacity: 0.3;
    cursor: default;
  }

  .alchemy-discovered-empty {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 6px;
    padding: 24px 12px;
    text-align: center;
  }

  .alchemy-discovered-empty i {
    font-size: 32px;
    opacity: 0.5;
  }

  .alchemy-discovered-empty-msg,
  .alchemy-discovered-empty-hint {
    font-size: 12px;
    opacity: 0.5;
    margin: 0;
    text-align: center;
  }
</style>
