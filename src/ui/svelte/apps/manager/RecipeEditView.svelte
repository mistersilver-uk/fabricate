<!-- Svelte 5 runes mode -->
<script>
  import { localize } from '../../util/foundryBridge.js';

  let {
    recipe = null,
    onBack = () => {}
  } = $props();

  function text(key, fallback) {
    const translated = localize(key);
    return translated && translated !== key ? translated : fallback;
  }

  function recipeImage(value) {
    return value?.img || 'icons/svg/item-bag.svg';
  }
</script>

<main class="manager-main" aria-label={text('FABRICATE.Admin.Manager.Recipe.EditTitle', 'Edit recipe')}>
  {#if recipe}
    <div class="manager-empty">
      <div>
        <img class="manager-recipe-preview" src={recipeImage(recipe)} alt="" />
        <h3 title={recipe.name}>{recipe.name}</h3>
        <p class="manager-kicker">{text('FABRICATE.Admin.Manager.Recipe.EditPlaceholderTitle', 'Recipe editor coming soon')}</p>
        <p>{text('FABRICATE.Admin.Manager.Recipe.EditPlaceholderHint', 'The full recipe editor is on its way; this preview shows the recipe you selected while the authoring workspace is built.')}</p>
        <button type="button" class="manager-button" onclick={() => onBack()}>
          <i class="fas fa-arrow-left" aria-hidden="true"></i>
          <span>{text('FABRICATE.Admin.Manager.Recipe.BackToBrowse', 'Back to recipes')}</span>
        </button>
      </div>
    </div>
  {:else}
    <div class="manager-empty">
      <div>
        <i class="fas fa-scroll" aria-hidden="true"></i>
        <h3>{text('FABRICATE.Admin.Manager.Recipe.SelectRecipe', 'Select a recipe')}</h3>
        <p>{text('FABRICATE.Admin.Manager.Recipe.EditMissingHint', 'Pick a recipe from the browser to open its editor.')}</p>
      </div>
    </div>
  {/if}
</main>
