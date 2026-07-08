<!-- Svelte 5 runes mode -->
<!--
  KnownRecipesColumn — the left column of the Alchemy workbench: the recipes the
  player has discovered (LEARNED only; undiscovered recipes are never named here —
  only their count in the footer). Search, recipe rows with a signature summary and
  a live-match badge, a zero-known empty state, and the undiscovered-count footer.
  A "Switch discipline" button appears only when more than one discipline exists.
  Prop-driven.
-->
<script>
  import { localize } from '../../util/foundryBridge.js';

  let {
    recipes = [],
    knownCount = 0,
    undiscoveredCount = 0,
    search = '',
    selectedRecipeId = null,
    matchedRecipeId = null,
    activeSystemName = '',
    canSwitch = false,
    onSearch = null,
    onSelect = null,
    onSwitch = null
  } = $props();

  /** A short, safe signature summary for a LEARNED recipe (the player knows it). */
  function sigSummary(recipe) {
    const set = recipe?.signatureSummary?.[0];
    if (!set) return '';
    const groups = Array.isArray(set.groups) ? set.groups : [];
    const parts = groups
      .map((group) => {
        const option = group?.options?.[0];
        if (!option) return null;
        const alt = group.options.length > 1 ? ' +' : '';
        return `${option.name}${alt} ×${option.quantity}`;
      })
      .filter(Boolean);
    if (set.essences?.length) {
      for (const essence of set.essences) parts.push(`${essence.name} ×${essence.quantity}`);
    }
    return parts.join(' · ');
  }

  function resultLabel(recipe) {
    if (!recipe?.result) return '';
    return localize('FABRICATE.App.Alchemy.Makes', {
      name: recipe.result.name,
      qty: recipe.result.quantity
    });
  }
</script>

<div class="alchemy-known">
  <div class="alchemy-known-head">
    <div class="alchemy-known-title">{localize('FABRICATE.App.Alchemy.KnownRecipes')}</div>
    <span class="alchemy-known-count">{knownCount}</span>
  </div>

  {#if activeSystemName || canSwitch}
    <div class="alchemy-known-system">
      <span class="alchemy-known-system-name">{activeSystemName}</span>
      {#if canSwitch}
        <button
          type="button"
          class="alchemy-switch"
          data-alchemy-switch
          onclick={() => onSwitch?.()}
        >
          <i class="fas fa-arrow-right-arrow-left" aria-hidden="true"></i>
          {localize('FABRICATE.App.Alchemy.SwitchDiscipline')}
        </button>
      {/if}
    </div>
  {/if}

  <label class="alchemy-known-search">
    <i class="fas fa-magnifying-glass" aria-hidden="true"></i>
    <input
      type="text"
      value={search}
      placeholder={localize('FABRICATE.App.Alchemy.SearchKnown')}
      aria-label={localize('FABRICATE.App.Alchemy.SearchKnown')}
      oninput={(event) => onSearch?.(event.target.value)}
    />
  </label>

  {#if recipes.length === 0}
    <div class="alchemy-known-empty" data-alchemy-zero-known>
      <i class="fas fa-flask-vial" aria-hidden="true"></i>
      <p class="alchemy-known-empty-title">{localize('FABRICATE.App.Alchemy.ZeroKnownTitle')}</p>
      <p class="alchemy-known-empty-hint">{localize('FABRICATE.App.Alchemy.ZeroKnownHint')}</p>
    </div>
  {:else}
    <ul class="alchemy-known-list">
      {#each recipes as recipe (recipe.id)}
        <li>
          <button
            type="button"
            class="alchemy-recipe"
            class:is-selected={recipe.id === selectedRecipeId}
            class:is-match={recipe.id === matchedRecipeId}
            data-alchemy-recipe={recipe.id}
            onclick={() => onSelect?.(recipe.id)}
          >
            <span class="alchemy-recipe-top">
              <span class="alchemy-recipe-icon">
                {#if recipe.img}
                  <img src={recipe.img} alt="" />
                {:else}
                  <i class="fas fa-flask" aria-hidden="true"></i>
                {/if}
              </span>
              <span class="alchemy-recipe-meta">
                <span class="alchemy-recipe-name">{recipe.name}</span>
                <span class="alchemy-recipe-sig">{sigSummary(recipe)}</span>
              </span>
              {#if recipe.id === matchedRecipeId}
                <span class="alchemy-recipe-badge" aria-hidden="true"
                  ><i class="fas fa-wand-sparkles"></i></span
                >
              {/if}
            </span>
            {#if recipe.result}
              <span class="alchemy-recipe-result">
                <i class="fas fa-arrow-right-long" aria-hidden="true"></i>
                {resultLabel(recipe)}
              </span>
            {/if}
          </button>
        </li>
      {/each}
    </ul>
  {/if}

  <div class="alchemy-known-footer" data-alchemy-undiscovered>
    <i class="fas fa-flask-vial" aria-hidden="true"></i>
    <span>
      <b>{localize('FABRICATE.App.Alchemy.Undiscovered', { count: undiscoveredCount })}</b>
      {localize('FABRICATE.App.Alchemy.UndiscoveredHint')}
    </span>
  </div>
</div>

<style>
  .alchemy-known {
    display: flex;
    flex-direction: column;
    min-height: 0;
    height: 100%;
    padding: 16px;
    background: var(--fab-surface-soft);
    border: 1px solid var(--fab-border);
    border-radius: 10px;
  }

  .alchemy-known-head {
    display: flex;
    align-items: baseline;
    justify-content: space-between;
    margin-bottom: 10px;
  }

  .alchemy-known-title {
    font-family: var(--font-primary);
    font-size: 15px;
    font-weight: 600;
    color: var(--fab-text);
  }

  .alchemy-known-count {
    font-family: var(--font-primary);
    font-size: 11px;
    font-weight: 600;
    color: var(--fab-text-subtle);
  }

  .alchemy-known-system {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
    margin-bottom: 10px;
  }

  .alchemy-known-system-name {
    font-size: 11px;
    font-weight: 600;
    color: var(--fab-text-secondary);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .alchemy-switch {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    padding: 4px 10px;
    border-radius: 8px;
    border: 1px solid var(--fab-border);
    background: var(--fab-surface);
    color: var(--fab-text-secondary);
    font-size: 11px;
    font-weight: 600;
    cursor: pointer;
    white-space: nowrap;
  }

  .alchemy-switch:hover {
    background: var(--fab-surface-active);
  }

  .alchemy-known-search {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 0 11px;
    height: 36px;
    background: var(--fab-surface);
    border: 1px solid var(--fab-border);
    border-radius: 8px;
    margin-bottom: 12px;
    color: var(--fab-text-subtle);
    flex: 0 0 auto;
  }

  .alchemy-known-search input {
    flex: 1;
    min-width: 0;
    background: transparent;
    border: 0;
    color: var(--fab-text);
    font-size: 12.5px;
  }

  .alchemy-known-list {
    list-style: none;
    margin: 0 -4px;
    padding: 0 4px;
    display: flex;
    flex-direction: column;
    gap: 8px;
    overflow-y: auto;
    min-height: 0;
    flex: 1 1 auto;
  }

  .alchemy-recipe {
    width: 100%;
    display: flex;
    flex-direction: column;
    gap: 9px;
    padding: 12px 13px;
    border-radius: 11px;
    border: 1px solid var(--fab-border);
    background: var(--fab-surface);
    color: var(--fab-text);
    cursor: pointer;
    text-align: left;
  }

  .alchemy-recipe.is-selected,
  .alchemy-recipe.is-match {
    border-color: var(--fab-accent-border);
    background: var(--fab-surface-active);
  }

  .alchemy-recipe-top {
    display: flex;
    align-items: center;
    gap: 10px;
  }

  .alchemy-recipe-icon {
    width: 36px;
    height: 36px;
    flex: 0 0 auto;
    border-radius: 8px;
    background: var(--fab-surface-soft);
    display: flex;
    align-items: center;
    justify-content: center;
    color: var(--fab-tag-peach);
    overflow: hidden;
  }

  .alchemy-recipe-icon img {
    width: 100%;
    height: 100%;
    object-fit: cover;
  }

  .alchemy-recipe-meta {
    flex: 1 1 auto;
    min-width: 0;
    display: flex;
    flex-direction: column;
  }

  .alchemy-recipe-name {
    font-family: var(--font-primary);
    font-size: 13px;
    font-weight: 600;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .alchemy-recipe-sig {
    font-size: 10px;
    color: var(--fab-text-subtle);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    margin-top: 1px;
  }

  .alchemy-recipe-badge {
    width: 22px;
    height: 22px;
    flex: 0 0 auto;
    border-radius: 6px;
    display: flex;
    align-items: center;
    justify-content: center;
    background: var(--fab-accent-soft);
    border: 1px solid var(--fab-accent-border);
    color: var(--fab-accent);
    font-size: 8px;
  }

  .alchemy-recipe-result {
    display: flex;
    align-items: center;
    gap: 6px;
    padding-top: 9px;
    border-top: 1px solid var(--fab-border);
    font-size: 10.5px;
    font-weight: 600;
    color: var(--fab-text-secondary);
  }

  .alchemy-recipe-result i {
    color: var(--fab-accent);
    font-size: 9px;
  }

  .alchemy-known-empty {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 8px;
    text-align: center;
    padding: 28px 16px;
    color: var(--fab-text-muted);
    flex: 1 1 auto;
  }

  .alchemy-known-empty i {
    font-size: 24px;
  }

  .alchemy-known-empty-title {
    margin: 0;
    font-weight: 600;
    color: var(--fab-text-secondary);
  }

  .alchemy-known-empty-hint {
    margin: 0;
    font-size: 11px;
  }

  .alchemy-known-footer {
    margin-top: 12px;
    padding: 11px 12px;
    border-radius: 9px;
    background: var(--fab-surface);
    border: 1px dashed var(--fab-border-strong);
    display: flex;
    gap: 9px;
    font-size: 10.5px;
    line-height: 1.5;
    color: var(--fab-text-muted);
    flex: 0 0 auto;
  }

  .alchemy-known-footer i {
    color: var(--fab-accent);
    font-size: 12px;
    margin-top: 1px;
  }

  .alchemy-known-footer b {
    color: var(--fab-text-secondary);
    font-weight: 600;
  }
</style>
