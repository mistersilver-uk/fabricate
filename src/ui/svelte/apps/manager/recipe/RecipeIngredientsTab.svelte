<!-- Svelte 5 runes mode -->
<!--
  Ingredients tab. Single-step recipes show the recipe-level ingredient section
  directly; multi-step recipes show the steps as an expandable/collapsible,
  drag-to-reorder accordion (shared with Overview and Results), each expanded step
  hosting its own ingredient section (scoped via `idPrefix`). Reordering here uses
  the same `onReorderSteps` as every other surface, so a move stays in sync with
  the Results and Overview views. The shell owns the add/remove patching; `stepId`
  is null for the single-step (recipe) scope.
-->
<script>
  import { localize } from '../../../util/foundryBridge.js';
  import RecipeStepAccordion from './RecipeStepAccordion.svelte';
  import RecipeIngredientsSection from './RecipeIngredientsSection.svelte';

  let {
    recipe = null,
    isMultiStep = false,
    onAddIngredientSet = () => {},
    onRemoveIngredientSet = () => {},
    onReorderSteps = () => {}
  } = $props();

  function text(key, fallback) {
    const translated = localize(key);
    return translated && translated !== key ? translated : fallback;
  }

  const ingredientSets = $derived(Array.isArray(recipe?.ingredientSets) ? recipe.ingredientSets : []);
  const steps = $derived(Array.isArray(recipe?.steps) ? recipe.steps : []);

  function stepIngredientSets(step) {
    return Array.isArray(step?.ingredientSets) ? step.ingredientSets : [];
  }
</script>

<section class="manager-recipe-tab manager-recipe-ingredients-tab" data-recipe-tab="ingredients" aria-label={text('FABRICATE.Admin.Manager.Recipe.Tabs.Ingredients', 'Ingredients')}>
  {#if isMultiStep}
    {#if steps.length === 0}
      <p class="manager-muted">{text('FABRICATE.Admin.Manager.Recipe.NoStepsHint', 'Add a step in Overview to configure its ingredients.')}</p>
    {:else}
      <RecipeStepAccordion {steps} {onReorderSteps}>
        {#snippet body(step)}
          <RecipeIngredientsSection
            idPrefix={`step-${step.id}-`}
            ingredientSets={stepIngredientSets(step)}
            onAddIngredientSet={() => onAddIngredientSet(step.id)}
            onRemoveIngredientSet={(setId) => onRemoveIngredientSet(step.id, setId)}
          />
        {/snippet}
      </RecipeStepAccordion>
    {/if}
  {:else}
    <RecipeIngredientsSection
      {ingredientSets}
      onAddIngredientSet={() => onAddIngredientSet(null)}
      onRemoveIngredientSet={(setId) => onRemoveIngredientSet(null, setId)}
    />
  {/if}
</section>
