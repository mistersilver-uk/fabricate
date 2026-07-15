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
    // Hidden in routed check-mode recipes (routing is by check outcome, not set name).
    showSetName = true,
    // Drives the mode-adaptive heading + intro (§B5): 'ingredientSet' routing reads
    // as "Ingredient sets", everything else as "Ingredients".
    routingProvider = null,
    onUpdateIngredientSets = () => {},
    onDeleteStep = () => {}
  } = $props();

  function text(key, fallback) {
    const translated = localize(key);
    return translated && translated !== key ? translated : fallback;
  }

  const ingredientSets = $derived(Array.isArray(recipe?.ingredientSets) ? recipe.ingredientSets : []);
  const steps = $derived(Array.isArray(recipe?.steps) ? recipe.steps : []);

  // Per-mode heading + intro OUTSIDE any card (§B5), mirroring the Results tab.
  const heading = $derived(
    isMultiStep
      ? {
          title: text('FABRICATE.Admin.Manager.Recipe.IngredientsHeadingMultiStep', 'Steps & ingredients'),
          intro: text('FABRICATE.Admin.Manager.Recipe.IngredientsIntroMultiStep', 'Ordered steps craft in sequence, each with its own ingredients and essences. Durations are set on the Overview tab.')
        }
      : routingProvider === 'ingredientSet'
        ? {
            title: text('FABRICATE.Admin.Manager.Recipe.IngredientsHeadingSets', 'Ingredient sets'),
            intro: text('FABRICATE.Admin.Manager.Recipe.IngredientsIntroSets', 'Each set is a full list of components (AND). The crafter satisfies any one set (OR); the set used selects the result on the Results tab.')
          }
        : {
            title: text('FABRICATE.Admin.Manager.Recipe.IngredientsHeadingFlat', 'Ingredients'),
            intro: text('FABRICATE.Admin.Manager.Recipe.IngredientsIntroFlat', 'Everything the crafter must provide. A set is satisfied when every requirement in it is met (AND).')
          }
  );

  function stepIngredientSets(step) {
    return Array.isArray(step?.ingredientSets) ? step.ingredientSets : [];
  }
</script>

<section class="manager-recipe-tab manager-recipe-ingredients-tab" data-recipe-tab="ingredients" aria-label={text('FABRICATE.Admin.Manager.Recipe.Tabs.Ingredients', 'Ingredients')}>
  <div class="manager-recipe-tab-intro">
    <h2 class="manager-recipe-tab-title">{heading.title}</h2>
    <p class="manager-muted">{heading.intro}</p>
  </div>

  {#if isMultiStep}
    {#if steps.length === 0}
      <p class="manager-muted">{text('FABRICATE.Admin.Manager.Recipe.NoStepsHint', 'Add a step in Overview to configure its ingredients.')}</p>
    {:else}
      <RecipeStepAccordion {steps} {onDeleteStep}>
        {#snippet body(step)}
          <RecipeIngredientsSection
            idPrefix={`step-${step.id}-`}
            ingredientSets={stepIngredientSets(step)}
            {complex}
            {componentOptions}
            {essenceOptions}
            {itemTags}
            {currencyUnits}
            {showSetName}
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
      {currencyUnits}
      {showSetName}
      onChange={(nextSets) => onUpdateIngredientSets(null, nextSets)}
    />
  {/if}
</section>
