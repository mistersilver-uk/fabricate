<!-- Svelte 5 runes mode -->
<!--
  Ingredient-sets section for a single recipe scope (recipe-level for single-step
  recipes, or one step for multi-step). This iteration is the empty-state shell:
  add appends an id-less placeholder set (the store assigns the id) rendered as a
  minimal row; the rich per-set editor comes later. `idPrefix` namespaces the
  `data-recipe-section` marker so single-step vs. per-step instances are
  distinguishable in tests.
-->
<script>
  import { localize } from '../../../util/foundryBridge.js';

  let {
    ingredientSets = [],
    onAddIngredientSet = () => {},
    onRemoveIngredientSet = () => {},
    idPrefix = ''
  } = $props();

  function text(key, fallback) {
    const translated = localize(key);
    return translated && translated !== key ? translated : fallback;
  }
</script>

<section class="manager-task-core-card manager-recipe-section" data-recipe-section={`${idPrefix}ingredients`}>
  <div class="manager-task-card-heading">
    <div>
      <h3>{text('FABRICATE.Admin.Manager.Recipe.IngredientsSection', 'Ingredients')}</h3>
    </div>
  </div>
  {#if (ingredientSets || []).length === 0}
    <div class="manager-recipe-section-empty">
      <p class="manager-recipe-section-empty-title">{text('FABRICATE.Admin.Manager.Recipe.IngredientsEmpty', 'No ingredients yet')}</p>
      <p class="manager-muted">{text('FABRICATE.Admin.Manager.Recipe.IngredientsEmptyHint', 'Add a set of ingredients required to craft.')}</p>
      <button type="button" class="manager-button" data-recipe-add="ingredient-set" onclick={() => onAddIngredientSet()}>
        <i class="fas fa-plus" aria-hidden="true"></i>
        <span>{text('FABRICATE.Admin.Manager.Recipe.AddIngredientSet', 'Add set')}</span>
      </button>
    </div>
  {:else}
    <ul class="manager-recipe-req-rows">
      {#each ingredientSets as set, index (set.id)}
        <li class="manager-recipe-req-row" data-recipe-req-id={set.id}>
          <span class="manager-recipe-req-label">{`${text('FABRICATE.Admin.Manager.Recipe.SetLabel', 'Set')} ${index + 1}`}</span>
          <button
            type="button"
            class="manager-icon-button is-danger"
            data-recipe-remove="ingredient-set"
            aria-label={text('FABRICATE.Admin.Manager.Recipe.RemoveIngredientSet', 'Remove set')}
            title={text('FABRICATE.Admin.Manager.Recipe.RemoveIngredientSet', 'Remove set')}
            onclick={() => onRemoveIngredientSet(set.id)}
          ><i class="fas fa-trash" aria-hidden="true"></i></button>
        </li>
      {/each}
    </ul>
    <button type="button" class="manager-button" data-recipe-add="ingredient-set" onclick={() => onAddIngredientSet()}>
      <i class="fas fa-plus" aria-hidden="true"></i>
      <span>{text('FABRICATE.Admin.Manager.Recipe.AddIngredientSet', 'Add set')}</span>
    </button>
  {/if}
</section>
