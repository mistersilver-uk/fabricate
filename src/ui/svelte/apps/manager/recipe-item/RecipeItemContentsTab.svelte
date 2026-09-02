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
  import SearchablePopover from '../SearchablePopover.svelte';
  // Shared pure resolver: an empty OR generic item-bag image falls back to the
  // alchemical blueprint — matching the player builder + browser exactly (no drift).
  import { resolveRecipeImage } from '../../../util/craftingImageDefaults.js';
  import IconButton from '../../../components/IconButton.svelte';

  let {
    linkedRecipes = [],
    availableRecipes = [],
    onLinkRecipe = () => {},
    onRemoveRecipe = () => {},
  } = $props();

  function text(key, fallback) {
    const translated = localize(key);
    return translated && translated !== key ? translated : fallback;
  }

  const linkedIds = $derived(new Set((linkedRecipes || []).map((recipe) => String(recipe?.id))));
  // Only offer recipes that are not already linked.
  const linkable = $derived(
    (availableRecipes || []).filter((recipe) => !linkedIds.has(String(recipe?.id)))
  );

  function categoryLabel(recipe) {
    return String(
      recipe?.category ||
        text('FABRICATE.Admin.Manager.RecipeItem.Contents.Uncategorized', 'General')
    );
  }

  /**
   * The linkable recipes, shaped for `SearchablePopover` (issue 1458).
   *
   * The category travels as `meta` — the option's SECOND LINE — rather than as a third inline
   * span. That is a deliberate change and it converges on the rows directly beneath it: a
   * LINKED recipe already renders its name over its category in a two-line copy block, so the
   * menu now offers a choice in the shape the choice will take. It is also the case `meta` is
   * documented for, a picker whose entries differ by a fact rather than by a name.
   *
   * `data` reproduces `data-recipe-item-link-recipe-option` verbatim instead of folding it into
   * the primitive's `dataId`/`data-popover-option`, so the mounted suite that reads a row's
   * recipe id out of that attribute keeps working against the same hook.
   */
  const linkOptions = $derived(
    linkable.map((recipe) => ({
      id: recipe.id,
      label: recipe.name,
      meta: categoryLabel(recipe),
      img: resolveRecipeImage(recipe),
      data: { 'data-recipe-item-link-recipe-option': recipe.id },
    }))
  );

  function linkRecipe(recipeId) {
    if (!recipeId) return;
    onLinkRecipe(recipeId);
  }
</script>

<section
  class="manager-recipe-item-tab"
  data-recipe-item-tab="contents"
  aria-label={text('FABRICATE.Admin.Manager.RecipeItem.Contents.Title', 'Recipes inside')}
>
  <div class="manager-recipe-item-contents-head">
    <div class="manager-recipe-item-contents-heading">
      <i class="fas fa-scroll" aria-hidden="true"></i>
      <h3 class="manager-card-title">
        {text('FABRICATE.Admin.Manager.RecipeItem.Contents.Heading', 'Recipes inside')}
      </h3>
    </div>
    <!-- `SearchablePopover` with its CHIP trigger (issue 1458), not a hand-rolled
         trigger-plus-listbox. The wrapper `<div>` STAYS: it is this head row's second flex
         item, and it is also the element that carries this component's scoping hash for the
         `:global(...)` disabled rule below, which would otherwise stop reaching the chip.

         `is-neutral` rides `triggerClass` because the primitive renders the chip without a
         `tone`, and that class is exactly what `tone="neutral"` emitted. `showSearch={false}`
         keeps `triggerHasPopup="listbox"` truthful, and `showChevron={false}` keeps the trigger
         an ADD control — its leading `fa-plus` says what it does, and a value chevron beside it
         would imply it shows a current selection. -->
    <div class="manager-recipe-item-link-recipe">
      <SearchablePopover
        options={linkOptions}
        triggerChip
        showSearch={false}
        showChevron={false}
        triggerHasPopup="listbox"
        triggerClass="manager-recipe-item-link-recipe-toggle is-neutral"
        triggerIcon="fas fa-plus"
        triggerLabel={text('FABRICATE.Admin.Manager.RecipeItem.Contents.LinkRecipe', 'Link recipe')}
        dialogAriaLabel={text(
          'FABRICATE.Admin.Manager.RecipeItem.Contents.LinkRecipe',
          'Link recipe'
        )}
        triggerData={{ 'data-recipe-item-link-recipe-toggle': '' }}
        disabled={linkable.length === 0}
        emptyHint={text(
          'FABRICATE.Admin.Manager.RecipeItem.Contents.NoneLinkable',
          'Every recipe is already linked'
        )}
        onChoose={linkRecipe}
      />
    </div>
  </div>

  <p class="manager-muted manager-recipe-item-contents-hint">
    {text(
      'FABRICATE.Admin.Manager.RecipeItem.Contents.Hint',
      'The recipes a reader can learn from this item. Remove any that shouldn’t be taught here.'
    )}
  </p>

  {#if linkedRecipes.length === 0}
    <p class="manager-muted" data-recipe-item-contents-empty>
      {text(
        'FABRICATE.Admin.Manager.RecipeItem.Contents.Empty',
        'No recipes linked yet. Use “Link recipe” to add one.'
      )}
    </p>
  {:else}
    <ul class="manager-recipe-item-recipe-list" data-recipe-item-contents-list>
      {#each linkedRecipes as recipe (recipe.id)}
        <li class="manager-recipe-item-recipe-row" data-recipe-item-recipe={recipe.id}>
          <span class="manager-recipe-item-recipe-icon" aria-hidden="true">
            <img src={resolveRecipeImage(recipe)} alt="" />
          </span>
          <div class="manager-recipe-item-recipe-copy">
            <span class="manager-recipe-item-recipe-name">{recipe.name}</span>
            <span class="manager-recipe-item-recipe-cat">{categoryLabel(recipe)}</span>
          </div>
          <IconButton
            class="is-danger"
            data-recipe-item-remove-recipe={recipe.id}
            ariaLabel={text('FABRICATE.Admin.Manager.RecipeItem.Contents.Remove', 'Remove recipe')}
            title={text('FABRICATE.Admin.Manager.RecipeItem.Contents.Remove', 'Remove recipe')}
            onclick={() => onRemoveRecipe(recipe.id)}
          >
            <i class="fas fa-xmark" aria-hidden="true"></i>
          </IconButton>
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

  /* The toggle is a `Chip` (issue 883), so it is NOT in this component's scope: Svelte
     stamps its hash on this component's own elements only, and a child component's root
     never carries it. Reaching it needs `:global`, nested under a selector that DOES
     carry the hash so nothing leaks. `cursor: pointer` is gone because the primitive's
     own button rule already sets it; only the disabled state is this component's own. */
  .manager-recipe-item-link-recipe :global(.manager-recipe-item-link-recipe-toggle:disabled) {
    opacity: 0.5;
    cursor: not-allowed;
  }

  /* The popover panel and its rows were `.manager-recipe-item-link-recipe-list` and
     `.manager-recipe-item-link-recipe-option`, and both blocks are GONE rather than repaired
     (issue 1458): `.manager-travel-popover` and `.manager-travel-option` in
     `styles/fabricate.css` state the same panel and the same row, and repairing a rule that
     restates the primitive's own would have kept the duplication with a `:global()` on it. */

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
