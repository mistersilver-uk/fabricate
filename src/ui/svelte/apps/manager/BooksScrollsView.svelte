<!-- Svelte 5 runes mode -->
<!--
  Books & Scrolls management surface (issue 511).

  "Books & Scrolls" is only the DISPLAY name of the surface; it manages EVERY
  recipe item in the system regardless of its Foundry item type (book, scroll,
  ring, wand, gem, note). "Recipe item" is the canonical noun.

  The surface lists every recipe item with its linked recipes (matched by
  `recipe.recipeItemId`) and a summary of that item's OWN use/learn caps as
  read-only chips. Caps are now per recipe item (issue 511) and are edited on the
  item's own page — opening a row navigates to that per-item page.

  Props:
   - recipeItems: `selectedSystem.recipeItemDefinitions` ({ id, name, img, caps }).
   - recipes: the system's recipes (used to count/label linked recipes per item).
   - selectedSystemName: the system's display name (kicker).
   - onOpenRecipeItem(id): open the per-item caps page.
-->
<script>
  import { localize } from '../../util/foundryBridge.js';

  let {
    recipeItems = [],
    recipes = [],
    selectedSystemName = '',
    onOpenRecipeItem = () => {}
  } = $props();

  function text(key, fallback) {
    const translated = localize(key);
    return translated && translated !== key ? translated : fallback;
  }

  function recipeItemImage(item) {
    return item?.img || 'icons/svg/item-bag.svg';
  }

  // The recipes this recipe item teaches, matched by the recipe's linked
  // `recipeItemId` (the same id the recipe editor stores on the recipe).
  function linkedRecipes(item) {
    const id = String(item?.id || '');
    if (!id) return [];
    return (recipes || []).filter((recipe) => String(recipe?.recipeItemId || '') === id);
  }

  function useCapLabel(item) {
    const cap = item?.caps?.item || {};
    const max = Number.isFinite(Number(cap.maxUses)) ? Number(cap.maxUses) : 1;
    return cap.limitUses === true
      ? text('FABRICATE.Admin.Manager.BooksScrolls.UseCapChip', 'Use cap: {n}').replace('{n}', max)
      : text('FABRICATE.Admin.Manager.BooksScrolls.UseCapNone', 'Unlimited uses');
  }

  function learnCapLabel(item) {
    const cap = item?.caps?.learn || {};
    const max = Number.isFinite(Number(cap.maxRecipes)) ? Number(cap.maxRecipes) : 1;
    return cap.limitRecipes === true
      ? text('FABRICATE.Admin.Manager.BooksScrolls.LearnCapChip', 'Learn cap: {n}').replace('{n}', max)
      : text('FABRICATE.Admin.Manager.BooksScrolls.LearnCapNone', 'Learn all');
  }
</script>

<main class="manager-main manager-books-scrolls-main" aria-label={text('FABRICATE.Admin.Manager.BooksScrolls.Title', 'Books & Scrolls')} data-books-scrolls>
  <section class="manager-section-header">
    <div class="manager-heading">
      <p class="manager-kicker">{selectedSystemName || text('FABRICATE.Admin.Manager.SelectSystem', 'Select a system')}</p>
      <h2 class="manager-title">{text('FABRICATE.Admin.Manager.BooksScrolls.Library', 'Books & Scrolls')}</h2>
      <p class="manager-subtitle">{text('FABRICATE.Admin.Manager.BooksScrolls.LibraryHint', 'Every recipe item in this system — books, scrolls, or any item type — with its linked recipes. Open one to set its use and learn caps.')}</p>
    </div>
  </section>

  <section class="manager-table-scroll manager-books-scrolls-scroll" aria-label={text('FABRICATE.Admin.Manager.BooksScrolls.Table', 'Recipe items')}>
    {#if (recipeItems || []).length === 0}
      <div class="manager-empty" data-books-scrolls-empty>
        <div>
          <i class="fas fa-book" aria-hidden="true"></i>
          <h3>{text('FABRICATE.Admin.Manager.BooksScrolls.EmptyTitle', 'No recipe items yet')}</h3>
          <p>{text('FABRICATE.Admin.Manager.BooksScrolls.EmptyHint', 'Link a recipe item to a recipe in the recipe editor and it will appear here.')}</p>
        </div>
      </div>
    {:else}
      <div class="manager-books-scrolls-list" role="list">
        {#each recipeItems as item (item.id)}
          {@const linked = linkedRecipes(item)}
          <!-- The listitem role lives on a plain wrapper div (codebase convention);
               the interactive card stays a native <button>, so screen readers
               announce a pressable control that opens the item's page. -->
          <div class="manager-books-scrolls-listitem" role="listitem">
          <button
            type="button"
            class="manager-inspector-card manager-books-scrolls-card"
            data-books-scrolls-item={item.id}
            aria-label={text('FABRICATE.Admin.Manager.BooksScrolls.OpenItem', 'Open {name}').replace('{name}', item.name)}
            onclick={() => onOpenRecipeItem(item.id)}
          >
            <span class="manager-books-scrolls-identity">
              <img class="manager-books-scrolls-thumb" src={recipeItemImage(item)} alt="" />
              <span class="manager-books-scrolls-copy">
                <span class="manager-books-scrolls-name" title={item.name}>{item.name}</span>
                <span class="manager-books-scrolls-count" data-books-scrolls-linked-count={item.id}>
                  {text('FABRICATE.Admin.Manager.BooksScrolls.LinkedRecipes', 'Linked recipes')}: <strong>{linked.length}</strong>
                </span>
              </span>
            </span>

            <span class="manager-chip-row manager-books-scrolls-chips">
              <span class={`manager-chip ${item.caps?.item?.limitUses === true ? 'is-active' : 'is-disabled'}`} data-books-scrolls-use-chip={item.id}>
                {useCapLabel(item)}
              </span>
              <span class={`manager-chip ${item.caps?.learn?.limitRecipes === true ? 'is-active' : 'is-disabled'}`} data-books-scrolls-learn-chip={item.id}>
                {learnCapLabel(item)}
              </span>
              <span class="manager-books-scrolls-open" aria-hidden="true"><i class="fas fa-chevron-right"></i></span>
            </span>

            {#if linked.length > 0}
              <span class="manager-books-scrolls-recipes" data-books-scrolls-recipe-list={item.id}>
                {#each linked as recipe (recipe.id)}
                  <span class="manager-chip is-neutral" data-books-scrolls-recipe={recipe.id}>{recipe.name}</span>
                {/each}
              </span>
            {:else}
              <span class="manager-muted manager-books-scrolls-unlinked">{text('FABRICATE.Admin.Manager.BooksScrolls.NoLinkedRecipes', 'No recipes link to this item yet.')}</span>
            {/if}
          </button>
          </div>
        {/each}
      </div>
    {/if}
  </section>
</main>

<style>
  .manager-books-scrolls-main {
    gap: var(--fab-space-3);
    padding: var(--fab-space-3);
    overflow: hidden;
  }

  .manager-books-scrolls-scroll {
    overflow-y: auto;
    min-height: 0;
  }

  .manager-books-scrolls-list {
    display: flex;
    flex-direction: column;
    gap: var(--fab-space-2);
  }

  .manager-books-scrolls-card {
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto;
    grid-template-areas:
      'identity chips'
      'recipes recipes';
    gap: var(--fab-space-2);
    width: 100%;
    text-align: left;
    align-items: start;
    cursor: pointer;
  }

  .manager-books-scrolls-identity {
    grid-area: identity;
    display: flex;
    align-items: center;
    gap: var(--fab-space-2);
    min-width: 0;
  }

  .manager-books-scrolls-thumb {
    width: 40px;
    height: 40px;
    border-radius: 6px;
    object-fit: cover;
    flex: none;
  }

  .manager-books-scrolls-copy {
    display: flex;
    flex-direction: column;
    min-width: 0;
  }

  .manager-books-scrolls-name {
    font-weight: 600;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .manager-books-scrolls-chips {
    grid-area: chips;
    justify-content: flex-end;
    align-items: center;
    flex-wrap: wrap;
  }

  .manager-books-scrolls-open {
    display: inline-flex;
    align-items: center;
    opacity: 0.6;
  }

  .manager-books-scrolls-recipes {
    grid-area: recipes;
    display: flex;
    flex-wrap: wrap;
    gap: var(--fab-space-1);
  }

  .manager-books-scrolls-unlinked {
    grid-area: recipes;
  }
</style>
