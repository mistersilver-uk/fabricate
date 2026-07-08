<!-- Svelte 5 runes mode -->
<!--
  Contents tab of the recipe-item editor. Lists the recipes a reader can learn from
  this item (`linkedRecipes`), each removable, and offers a "Link recipe" affordance
  that picks from `availableRecipes` (recipes not already linked).

  CONTROLLED: emits `onLinkRecipe(recipeId)` / `onRemoveRecipe(recipeId)`; the router
  merges the change into the draft.

  Props:
   - linkedRecipes: `[{ id, name, category, img? }]` recipes currently inside the item.
   - availableRecipes: `[{ id, name, category, img? }]` candidate recipes to link.
   - onLinkRecipe(recipeId) / onRemoveRecipe(recipeId).
-->
<script>
  import { localize } from '../../../util/foundryBridge.js';

  let {
    linkedRecipes = [],
    availableRecipes = [],
    onLinkRecipe = () => {},
    onRemoveRecipe = () => {}
  } = $props();

  let linkOpen = $state(false);

  function text(key, fallback) {
    const translated = localize(key);
    return translated && translated !== key ? translated : fallback;
  }

  const linkedIds = $derived(new Set((linkedRecipes || []).map(recipe => String(recipe?.id))));
  // Only offer recipes that are not already linked.
  const linkable = $derived((availableRecipes || []).filter(recipe => !linkedIds.has(String(recipe?.id))));

  function categoryLabel(recipe) {
    return String(recipe?.category || text('FABRICATE.Admin.Manager.RecipeItem.Contents.Uncategorized', 'General'));
  }

  function linkRecipe(recipeId) {
    if (!recipeId) return;
    onLinkRecipe(recipeId);
    linkOpen = false;
  }
</script>

<section class="manager-recipe-item-tab" data-recipe-item-tab="contents" aria-label={text('FABRICATE.Admin.Manager.RecipeItem.Contents.Title', 'Recipes inside')}>
  <div class="manager-recipe-item-contents-head">
    <div class="manager-recipe-item-contents-heading">
      <i class="fas fa-scroll" aria-hidden="true"></i>
      <h3 class="manager-card-title">{text('FABRICATE.Admin.Manager.RecipeItem.Contents.Heading', 'Recipes inside')}</h3>
    </div>
    <div class="manager-recipe-item-link-recipe">
      <button
        type="button"
        class="manager-chip is-neutral manager-recipe-item-link-recipe-toggle"
        data-recipe-item-link-recipe-toggle
        aria-haspopup="listbox"
        aria-expanded={linkOpen}
        disabled={linkable.length === 0}
        onclick={() => { linkOpen = !linkOpen; }}
      >
        <i class="fas fa-plus" aria-hidden="true"></i>
        <span>{text('FABRICATE.Admin.Manager.RecipeItem.Contents.LinkRecipe', 'Link recipe')}</span>
      </button>
      {#if linkOpen && linkable.length > 0}
        <div class="manager-recipe-item-link-recipe-list" role="listbox" data-recipe-item-link-recipe-list aria-label={text('FABRICATE.Admin.Manager.RecipeItem.Contents.LinkRecipe', 'Link recipe')}>
          {#each linkable as recipe (recipe.id)}
            <button
              type="button"
              class="manager-recipe-item-link-recipe-option"
              role="option"
              aria-selected="false"
              data-recipe-item-link-recipe-option={recipe.id}
              onclick={() => linkRecipe(recipe.id)}
            >
              <span class="manager-recipe-item-recipe-icon" aria-hidden="true"><i class="fas fa-fire"></i></span>
              <span class="manager-recipe-item-recipe-name">{recipe.name}</span>
              <span class="manager-recipe-item-recipe-cat">{categoryLabel(recipe)}</span>
            </button>
          {/each}
        </div>
      {/if}
    </div>
  </div>

  <p class="manager-muted manager-recipe-item-contents-hint">{text('FABRICATE.Admin.Manager.RecipeItem.Contents.Hint', 'The recipes a reader can learn from this item. Remove any that shouldn’t be taught here.')}</p>

  {#if linkedRecipes.length === 0}
    <p class="manager-muted" data-recipe-item-contents-empty>{text('FABRICATE.Admin.Manager.RecipeItem.Contents.Empty', 'No recipes linked yet. Use “Link recipe” to add one.')}</p>
  {:else}
    <ul class="manager-recipe-item-recipe-list" data-recipe-item-contents-list>
      {#each linkedRecipes as recipe (recipe.id)}
        <li class="manager-recipe-item-recipe-row" data-recipe-item-recipe={recipe.id}>
          <span class="manager-recipe-item-recipe-icon" aria-hidden="true">
            {#if recipe.img}<img src={recipe.img} alt="" />{:else}<i class="fas fa-fire"></i>{/if}
          </span>
          <div class="manager-recipe-item-recipe-copy">
            <span class="manager-recipe-item-recipe-name">{recipe.name}</span>
            <span class="manager-recipe-item-recipe-cat">{categoryLabel(recipe)}</span>
          </div>
          <button
            type="button"
            class="manager-icon-button is-danger"
            data-recipe-item-remove-recipe={recipe.id}
            aria-label={text('FABRICATE.Admin.Manager.RecipeItem.Contents.Remove', 'Remove recipe')}
            title={text('FABRICATE.Admin.Manager.RecipeItem.Contents.Remove', 'Remove recipe')}
            onclick={() => onRemoveRecipe(recipe.id)}
          >
            <i class="fas fa-xmark" aria-hidden="true"></i>
          </button>
        </li>
      {/each}
    </ul>
  {/if}
</section>

<style>
  .manager-recipe-item-tab {
    display: flex;
    flex-direction: column;
    gap: var(--fab-space-2);
  }

  .manager-recipe-item-contents-head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--fab-space-3);
  }

  .manager-recipe-item-contents-heading {
    display: flex;
    align-items: center;
    gap: var(--fab-space-2);
    color: var(--fab-accent);
  }

  .manager-recipe-item-contents-heading .manager-card-title {
    margin: 0;
  }

  .manager-recipe-item-link-recipe {
    position: relative;
  }

  .manager-recipe-item-link-recipe-toggle {
    cursor: pointer;
  }

  .manager-recipe-item-link-recipe-toggle:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  .manager-recipe-item-link-recipe-list {
    position: absolute;
    right: 0;
    top: calc(100% + var(--fab-space-1));
    z-index: 20;
    display: flex;
    flex-direction: column;
    gap: var(--fab-space-1);
    min-width: 220px;
    max-height: 260px;
    overflow-y: auto;
    padding: var(--fab-space-2);
    border: 1px solid var(--fab-border-strong);
    border-radius: 10px;
    background: var(--fab-bg-1);
    box-shadow: var(--fab-shadow-lg);
  }

  .manager-recipe-item-link-recipe-option {
    display: flex;
    align-items: center;
    gap: var(--fab-space-2);
    padding: var(--fab-space-2);
    border: 1px solid transparent;
    border-radius: 8px;
    background: transparent;
    text-align: left;
    cursor: pointer;
  }

  .manager-recipe-item-link-recipe-option:hover,
  .manager-recipe-item-link-recipe-option:focus-visible {
    border-color: var(--fab-accent-border);
    background: var(--fab-surface-soft);
    outline: none;
  }

  .manager-recipe-item-contents-hint {
    margin: 0 0 var(--fab-space-2);
  }

  .manager-recipe-item-recipe-list {
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: var(--fab-space-2);
  }

  .manager-recipe-item-recipe-row {
    display: flex;
    align-items: center;
    gap: var(--fab-space-3);
    padding: var(--fab-space-2) var(--fab-space-3);
    border: 1px solid var(--fab-border);
    border-radius: 9px;
    background: var(--fab-bg-2);
  }

  .manager-recipe-item-recipe-icon {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 30px;
    height: 30px;
    flex: 0 0 30px;
    border-radius: 7px;
    background: var(--fab-bg-3);
    color: var(--fab-accent);
    overflow: hidden;
  }

  .manager-recipe-item-recipe-icon img {
    width: 100%;
    height: 100%;
    object-fit: cover;
  }

  .manager-recipe-item-recipe-copy {
    display: flex;
    flex-direction: column;
    gap: 1px;
    min-width: 0;
    flex: 1;
  }

  .manager-recipe-item-recipe-name {
    font-weight: 600;
    font-size: 0.8rem;
    color: var(--fab-text);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .manager-recipe-item-recipe-cat {
    font-size: 0.62rem;
    color: var(--fab-text-subtle);
  }
</style>
