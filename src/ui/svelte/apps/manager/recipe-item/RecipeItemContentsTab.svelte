<!-- Svelte 5 runes mode -->
<!--
  Contents tab of the recipe-item editor: the recipes a reader can learn from this item, edited as
  one record's membership through `SetPicker` in its staged form (issue 1782).

  CONTROLLED: Apply forwards each recipe it adds as `onLinkRecipe(recipeId)` and each it removes as
  `onRemoveRecipe(recipeId)`, and the router merges them into the draft; nothing writes before it.

  Props:
   - linkedRecipes: `[{ id, name, category, img? }]` recipes currently inside the item.
   - availableRecipes: `[{ id, name, category, img? }]` the system's other recipes.
   - onLinkRecipe(recipeId) / onRemoveRecipe(recipeId).
-->
<script>
  import { localizeOr } from '../../../util/localizeOr.js';
  // Shared pure resolver: an empty OR generic item-bag image falls back to the
  // alchemical blueprint — matching the player builder + browser exactly (no drift).
  import { resolveRecipeImage } from '../../../util/craftingImageDefaults.js';
  import Button from '../../../components/Button.svelte';
  import SetPicker from '../../../components/SetPicker.svelte';

  let {
    linkedRecipes = [],
    availableRecipes = [],
    onLinkRecipe = () => {},
    onRemoveRecipe = () => {},
  } = $props();

  const linkedIds = $derived((linkedRecipes || []).map((recipe) => recipe.id));

  // Every recipe of the system, the linked ones first, each once: the panel marks the members.
  const recipeOptions = $derived(
    [...(linkedRecipes || []), ...(availableRecipes || [])]
      .filter((recipe, index, all) => all.findIndex((other) => other.id === recipe.id) === index)
      .map((recipe) => ({
        id: recipe.id,
        label: recipe.name,
        meta: String(
          recipe.category ||
            localizeOr('FABRICATE.Admin.Manager.RecipeItem.Contents.Uncategorized', 'General')
        ),
        img: resolveRecipeImage(recipe),
        data: { 'data-recipe-item-link-recipe-option': recipe.id },
      }))
  );

  function applyMembership(next, { added, removed }) {
    for (const recipeId of added) onLinkRecipe(recipeId);
    for (const recipeId of removed) onRemoveRecipe(recipeId);
  }

  const linkLabel = $derived(
    localizeOr('FABRICATE.Admin.Manager.RecipeItem.Contents.LinkRecipe', 'Link recipe')
  );
</script>

<section
  class="manager-recipe-item-tab"
  data-recipe-item-tab="contents"
  aria-label={localizeOr('FABRICATE.Admin.Manager.RecipeItem.Contents.Title', 'Recipes inside')}
>
  <div class="manager-recipe-item-contents-heading">
    <i class="fas fa-scroll" aria-hidden="true"></i>
    <h3 class="manager-card-title">
      {localizeOr('FABRICATE.Admin.Manager.RecipeItem.Contents.Heading', 'Recipes inside')}
    </h3>
  </div>

  <p class="manager-muted manager-recipe-item-contents-hint">
    {localizeOr(
      'FABRICATE.Admin.Manager.RecipeItem.Contents.Hint',
      'The recipes a reader can learn from this item. Remove any that shouldn’t be taught here.'
    )}
  </p>

  {#if linkedIds.length === 0}
    <p class="manager-muted" data-recipe-item-contents-empty>
      {localizeOr(
        'FABRICATE.Admin.Manager.RecipeItem.Contents.Empty',
        'No recipes linked yet. Use “Link recipe” to add one.'
      )}
    </p>
  {/if}

  <!-- The validation row's `recipeLinked` address rides the trigger (issue 1517): it is the one
       control that answers the blocker, and a `<button>` that is never disabled. -->
  <SetPicker
    data-recipe-item-contents-picker=""
    value={linkedIds}
    options={recipeOptions}
    onChange={applyMembership}
    ariaLabel={localizeOr('FABRICATE.Admin.Manager.RecipeItem.Contents.Title', 'Recipes inside')}
    searchLabel={localizeOr(
      'FABRICATE.Admin.Manager.RecipeItem.Contents.SearchRecipes',
      'Search recipes…'
    )}
    emptyLabel={localizeOr(
      'FABRICATE.Admin.Manager.RecipeItem.Contents.NoRecipes',
      'This system has no recipes yet.'
    )}
  >
    {#snippet trigger({ attributes })}
      <!-- ratchet-exempt(design-system): the spread is the picker's own trigger contract (type, ARIA state, handlers, element attachment), never a caller's name -->
      <Button
        role="dashed"
        data-recipe-item-link-recipe-toggle=""
        data-validation-target="recipe-item-link-recipe"
        {...attributes}
      >
        <i class="fas fa-plus" aria-hidden="true"></i>
        <span>{linkLabel}</span>
      </Button>
    {/snippet}
  </SetPicker>
</section>

<style>
  .manager-recipe-item-tab {
    display: flex;
    flex-direction: column;
    gap: var(--fab-space-2);
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

  .manager-recipe-item-contents-hint {
    margin: 0 0 var(--fab-space-2);
  }
</style>
