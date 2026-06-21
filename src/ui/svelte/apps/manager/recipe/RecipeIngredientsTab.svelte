<!-- Svelte 5 runes mode -->
<!--
  Ingredients tab. Single-step recipes show the recipe-level ingredient section
  directly; multi-step recipes show the ordered steps as an expandable/collapsible
  accordion (shared with Overview, Results, and Tools) — WITHOUT drag-reorder
  (order is set in Overview) but WITH the time/currency chips and a delete button
  in each header, each expanded step hosting its own ingredient section (scoped via
  `idPrefix`). Deleting a step here removes the whole step (its results and tools
  too), so the parent confirms.

  Each ingredient section emits the whole replacement sets array via a single
  `onChange(nextSets)`; the shell maps it to the right scope patch (recipe vs.
  step) through `onUpdateIngredientSets(stepId, nextSets)`. `stepId` is null for
  the single-step (recipe) scope.
-->
<script>
  import { localize } from '../../../util/foundryBridge.js';
  import RecipeStepAccordion from './RecipeStepAccordion.svelte';
  import RecipeIngredientsSection from './RecipeIngredientsSection.svelte';

  let {
    recipe = null,
    complex = true,
    isMultiStep = false,
    currencyUnits = [],
    componentOptions = [],
    essenceOptions = [],
    itemTags = [],
    onUpdateIngredientSets = () => {},
    onDeleteStep = () => {}
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
      <RecipeStepAccordion {steps} {currencyUnits} {onDeleteStep}>
        {#snippet body(step)}
          <RecipeIngredientsSection
            idPrefix={`step-${step.id}-`}
            ingredientSets={stepIngredientSets(step)}
            {complex}
            {componentOptions}
            {essenceOptions}
            {itemTags}
            onChange={(nextSets) => onUpdateIngredientSets(step.id, nextSets)}
          />
        {/snippet}
      </RecipeStepAccordion>
    {/if}
  {:else}
    <RecipeIngredientsSection
      {ingredientSets}
      {complex}
      {componentOptions}
      {essenceOptions}
      {itemTags}
      onChange={(nextSets) => onUpdateIngredientSets(null, nextSets)}
    />
  {/if}
</section>
