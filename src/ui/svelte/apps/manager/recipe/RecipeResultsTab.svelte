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
  const heading = $derived(
    progressive
      ? { title: text('FABRICATE.Admin.Manager.Recipe.ResultsHeadingProgressive', 'Result stages (by difficulty)'), intro: text('FABRICATE.Admin.Manager.Recipe.ResultsIntroProgressive', 'One roll is spent down this ordered list, meeting each stage’s difficulty in turn — how far it reaches decides how complete the result is.') }
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

  {#if progressive}
    <!-- Roll-budget info strip (§C4). -->
    <div class="manager-recipe-info-strip" data-recipe-info-strip>
      <i class="fas fa-dice-d20" aria-hidden="true"></i>
      <span>{text('FABRICATE.Admin.Manager.Recipe.ResultsProgressiveInfo', 'Roll budget flows down the list · each stage consumes its difficulty before the next is produced')}</span>
    </div>
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

  {#if progressive}
    <!-- Reorder-permission card (§C4, issue 651), placed at the END of the progressive
         block — AFTER the result sets, never directly beneath the info strip. The two
         info-toned surfaces would otherwise stack as one undifferentiated block. This
         adjacency also reads correctly on its own terms: strip = "here is how this list
         is spent" (preamble) → list = the thing → card = "here is who may reorder it"
         (policy about the thing you have now seen).

         The strip's copy is NOT folded into this card's sub-line: the strip states an
         INVARIANT (the award mechanic is true of every progressive recipe regardless of
         this toggle) while the card states a CONDITIONAL. When the toggle is off the
         budget explanation must still be true, so a merged sub-line would caveat itself. -->
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
</section>
