<!-- Svelte 5 runes mode -->
<!--
  Results tab. Single-step recipes show the recipe-level result section directly;
  multi-step recipes show the ordered steps as an expandable/collapsible accordion
  (shared with Overview, Ingredients, and Tools) — WITHOUT drag-reorder (order is
  set in Overview) but WITH the time/currency chips and a delete button in each
  header, each expanded step hosting its own result section (scoped via `idPrefix`).
  Deleting a step here removes the whole step (its ingredients and tools too), so
  the parent confirms. The shell owns the add/remove patching; `stepId` is null for
  the single-step (recipe) scope.
-->
<script>
  import { localize } from '../../../util/foundryBridge.js';
  import RecipeStepAccordion from './RecipeStepAccordion.svelte';
  import RecipeResultsSection from './RecipeResultsSection.svelte';

  let {
    recipe = null,
    complex = true,
    isMultiStep = false,
    onAddResultGroup = () => {},
    onRemoveResultGroup = () => {},
    onDeleteStep = () => {}
  } = $props();

  function text(key, fallback) {
    const translated = localize(key);
    return translated && translated !== key ? translated : fallback;
  }

  const resultGroups = $derived(Array.isArray(recipe?.resultGroups) ? recipe.resultGroups : []);
  const steps = $derived(Array.isArray(recipe?.steps) ? recipe.steps : []);

  function stepResultGroups(step) {
    return Array.isArray(step?.resultGroups) ? step.resultGroups : [];
  }
</script>

<section class="manager-recipe-tab manager-recipe-results-tab" data-recipe-tab="results" aria-label={text('FABRICATE.Admin.Manager.Recipe.Tabs.Results', 'Results')}>
  {#if isMultiStep}
    {#if steps.length === 0}
      <p class="manager-muted">{text('FABRICATE.Admin.Manager.Recipe.NoStepsHint', 'Add a step in Overview to configure its results.')}</p>
    {:else}
      <RecipeStepAccordion {steps} {onDeleteStep}>
        {#snippet body(step)}
          <RecipeResultsSection
            idPrefix={`step-${step.id}-`}
            resultGroups={stepResultGroups(step)}
            {complex}
            onAddResultGroup={() => onAddResultGroup(step.id)}
            onRemoveResultGroup={(groupId) => onRemoveResultGroup(step.id, groupId)}
          />
        {/snippet}
      </RecipeStepAccordion>
    {/if}
  {:else}
    <RecipeResultsSection
      {resultGroups}
      {complex}
      onAddResultGroup={() => onAddResultGroup(null)}
      onRemoveResultGroup={(groupId) => onRemoveResultGroup(null, groupId)}
    />
  {/if}
</section>
