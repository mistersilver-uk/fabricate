<!-- Svelte 5 runes mode -->
<!--
  Results tab. Single-step recipes show the recipe-level result section directly;
  multi-step recipes show the ordered steps as an expandable/collapsible accordion
  (shared with Overview, Ingredients, and Tools) — WITHOUT drag-reorder (order is
  set in Overview) but WITH the time/currency chips and a delete button in each
  header, each expanded step hosting its own result section (scoped via `idPrefix`).
  Deleting a step here removes the whole step (its ingredients and tools too), so
  the parent confirms.

  Each result section emits the whole replacement groups array via a single
  `onChange(nextGroups)`; the shell maps it to the right scope patch (recipe vs.
  step) through `onUpdateResultGroups(stepId, nextGroups)`. `stepId` is null for
  the single-step (recipe) scope.
-->
<script>
  import { localize } from '../../../util/foundryBridge.js';
  import ToggleCard from '../ToggleCard.svelte';
  import RecipeStepAccordion from './RecipeStepAccordion.svelte';
  import RecipeResultsSection from './RecipeResultsSection.svelte';

  let {
    recipe = null,
    // Alchemy Simple two-slot result editor (issue 554); forwarded to each section.
    alchemySimple = false,
    // Simple resolution mode with the check enabled uses the SAME two-slot editor
    // (success + reserved failure); single-step only (issue 643).
    simpleFailureSlot = false,
    isMultiStep = false,
    // COLLAPSED chain (issue 710): the system's multi-step feature is off but the
    // recipe still carries authored steps, so the parent passes `isMultiStep={false}`
    // AND a single-step projection of the recipe whose result groups are the FINAL
    // step's. Edits write through to that step. This flag only drives the explanatory
    // note — the editor surface is the normal single-step one.
    collapsed = false,
    componentOptions = [],
    // Result routing (routed systems). Provider + the system's outcome tiers feed
    // the per-result-set assignment controls; ingredient-mode assignment writes
    // back through onAssignIngredientSet(stepId, groupId, setId, assigned).
    routingProvider = null,
    outcomeTierOptions = [],
    outcomeTiersDefined = false,
    // Progressive systems award results in order; forwarded to each result section
    // so its rows get drag-reorder handles.
    progressive = false,
    // Deep-link from a progressive row's read-only difficulty badge to the component
    // editor's Difficulty card (component.difficulty is a Component property).
    onOpenComponent = () => {},
    onAssignIngredientSet = () => {},
    onUpdateResultGroups = () => {},
    onDeleteStep = () => {},
    // GM policy: may a player reorder this recipe's progressive stages? Default true
    // (issue 651). Written back through onUpdateRecipe by the shell.
    onToggleAllowPlayerResultReorder = () => {}
  } = $props();

  // Default-true: only an explicit `false` turns the switch off, matching the model.
  const allowPlayerResultReorder = $derived(recipe?.allowPlayerResultReorder !== false);

  function text(key, fallback) {
    const translated = localize(key);
    return translated && translated !== key ? translated : fallback;
  }

  const resultGroups = $derived(Array.isArray(recipe?.resultGroups) ? recipe.resultGroups : []);
  const ingredientSets = $derived(Array.isArray(recipe?.ingredientSets) ? recipe.ingredientSets : []);
  const steps = $derived(Array.isArray(recipe?.steps) ? recipe.steps : []);

  // Per-mode heading + intro OUTSIDE any card (§C3).
  //
  // The progressive heading is "Results", matching the progressive SALVAGE editor
  // (issue 676). The two are the same surface and must not drift: salvage says
  // "Results" over its ordered stage list, and "Result stages (by difficulty)" plus a
  // paragraph of mechanics restated, above a list whose own info strip already explains
  // the roll budget, was the recipe side saying it three times. The strip below is the
  // one place that explanation belongs.
  const heading = $derived(
    progressive
      ? { title: text('FABRICATE.Admin.Manager.Recipe.ResultsHeadingProgressive', 'Results'), intro: text('FABRICATE.Admin.Manager.Recipe.ResultsIntroProgressive', 'What this recipe produces, awarded in order down the list.') }
      : routingProvider === 'check'
        ? { title: text('FABRICATE.Admin.Manager.Recipe.ResultsHeadingCheck', 'Results by outcome'), intro: text('FABRICATE.Admin.Manager.Recipe.ResultsIntroCheck', 'Each result set is produced on a matching crafting-check success tier.') }
        : routingProvider === 'ingredientSet'
          ? { title: text('FABRICATE.Admin.Manager.Recipe.ResultsHeadingIngredients', 'Results by ingredient set'), intro: text('FABRICATE.Admin.Manager.Recipe.ResultsIntroIngredients', 'The ingredient set the crafter uses selects the result set.') }
          : { title: text('FABRICATE.Admin.Manager.Recipe.ResultsHeadingSimple', 'Result'), intro: text('FABRICATE.Admin.Manager.Recipe.ResultsIntroSimple', 'One ingredient set produces one result set.') }
  );

  function stepResultGroups(step) {
    return Array.isArray(step?.resultGroups) ? step.resultGroups : [];
  }

  function stepIngredientSets(step) {
    return Array.isArray(step?.ingredientSets) ? step.ingredientSets : [];
  }
</script>

<section class="manager-recipe-tab manager-recipe-results-tab" data-recipe-tab="results" aria-label={text('FABRICATE.Admin.Manager.Recipe.Tabs.Results', 'Results')}>
  <div class="manager-recipe-tab-intro">
    <h2 class="manager-recipe-tab-title">{heading.title}</h2>
    <p class="manager-muted">{heading.intro}</p>
  </div>

  {#if collapsed}
    <div class="manager-recipe-info-strip" data-recipe-collapsed-results-note>
      <i class="fas fa-layer-group" aria-hidden="true"></i>
      <span>{text('FABRICATE.Admin.Manager.Recipe.CollapsedResultsNote', 'Multi-step recipes are disabled, so this recipe runs as one combined action. You are editing its final results — the output the combined action produces.')}</span>
    </div>
  {/if}

  {#if progressive}
    <!-- The strip and the reorder policy sit ABOVE the list, not after it (issue 676,
         matching the progressive salvage editor): both describe what the ORDER MEANS,
         and the order is the thing being authored below. The reorder card used to render
         at the very BOTTOM — the GM read the policy governing the list only after they
         had finished writing it. Salvage fixed that first; this is the recipe side
         following its already-migrated sibling.

         The strip's copy is NOT folded into the card's sub-line: the strip states an
         INVARIANT (the award mechanic is true of every progressive recipe regardless of
         this toggle) while the card states a CONDITIONAL. When the toggle is off the
         budget explanation must still be true, so a merged sub-line would caveat itself. -->
    <div class="manager-recipe-info-strip" data-recipe-info-strip>
      <i class="fas fa-dice-d20" aria-hidden="true"></i>
      <span>{text('FABRICATE.Admin.Manager.Recipe.ResultsProgressiveInfo', 'Roll budget flows down the list · each stage consumes its difficulty before the next is produced')}</span>
    </div>

    <ToggleCard
      variant="is-info"
      icon="fas fa-arrow-down-a-z"
      section="allow-player-result-reorder"
      field="allowPlayerResultReorder"
      title={text('FABRICATE.Admin.Manager.Recipe.AllowPlayerResultReorderTitle', 'Allow player result re-ordering')}
      sub={text('FABRICATE.Admin.Manager.Recipe.AllowPlayerResultReorderSub', 'Players may set their own stage order for this recipe, which is remembered and used every time they craft it.')}
      toggleLabel={text('FABRICATE.Admin.Manager.Recipe.AllowPlayerResultReorderToggle', 'Allow player result re-ordering')}
      on={allowPlayerResultReorder}
      onToggle={(next) => onToggleAllowPlayerResultReorder(next)}
    />
  {/if}

  {#if isMultiStep}
    {#if steps.length === 0}
      <p class="manager-muted">{text('FABRICATE.Admin.Manager.Recipe.NoStepsHint', 'Add a step in Overview to configure its results.')}</p>
    {:else}
      <RecipeStepAccordion {steps} alwaysOpen {onDeleteStep}>
        {#snippet body(step)}
          <RecipeResultsSection
            idPrefix={`step-${step.id}-`}
            resultGroups={stepResultGroups(step)}
            {alchemySimple}
            {componentOptions}
            {routingProvider}
            {progressive}
            {onOpenComponent}
            ingredientSets={stepIngredientSets(step)}
            {outcomeTierOptions}
            {outcomeTiersDefined}
            onAssignIngredientSet={(groupId, setId, assigned) =>
              onAssignIngredientSet(step.id, groupId, setId, assigned)}
            onChange={(nextGroups) => onUpdateResultGroups(step.id, nextGroups)}
          />
        {/snippet}
      </RecipeStepAccordion>
    {/if}
  {:else}
    <RecipeResultsSection
      {resultGroups}
      alchemySimple={alchemySimple || simpleFailureSlot}
      {componentOptions}
      {routingProvider}
      {progressive}
      {onOpenComponent}
      {ingredientSets}
      {outcomeTierOptions}
      {outcomeTiersDefined}
      onAssignIngredientSet={(groupId, setId, assigned) =>
        onAssignIngredientSet(null, groupId, setId, assigned)}
      onChange={(nextGroups) => onUpdateResultGroups(null, nextGroups)}
    />
  {/if}

</section>
