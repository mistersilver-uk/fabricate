<!-- Svelte 5 runes mode -->
<!--
  Results tab. Single-step recipes show the recipe-level result section directly; multi-step
  recipes show the ordered steps as an accordion — WITHOUT drag-reorder, order being set in
  Overview, but WITH the time/currency chips and a delete button in each header, each expanded
  step hosting its own result section scoped via `idPrefix`. Deleting a step here removes the
  whole step, so the parent confirms.

  Each section emits the whole replacement groups array via one `onChange(nextGroups)`; the shell
  maps it to the right scope through `onUpdateResultGroups(stepId, nextGroups)`, `stepId` being
  null for the single-step scope.
-->
<script>
  import { localize } from '../../../util/foundryBridge.js';
  import ToggleCard from '../../../components/ToggleCard.svelte';
  import Callout from '../Callout.svelte';
  import RecipeStepAccordion from './RecipeStepAccordion.svelte';
  import RecipeResultsSection from './RecipeResultsSection.svelte';

  let {
    recipe = null,
    // Alchemy Simple two-slot result editor (issue 554); forwarded to each section.
    alchemySimple = false,
    // Simple resolution mode with the check enabled uses the SAME two-slot editor.
    simpleFailureSlot = false,
    isMultiStep = false,
    // COLLAPSED chain: the parent passes `isMultiStep={false}` AND a single-step projection whose
    // result groups are the FINAL step's, and edits write through to that step. This flag drives
    // only the explanatory note; the surface is the normal single-step one.
    collapsed = false,
    componentOptions = [],
    // Result routing: the provider and the system's outcome tiers feed the per-result-set
    // assignment controls.
    routingProvider = null,
    outcomeTierOptions = [],
    outcomeTiersDefined = false,
    // Issue 1098: threaded on to the section and the single-step group card alike.
    failureResultsAllowed = false,
    // Progressive systems award results in order; forwarded to each result section.
    progressive = false,
    // Deep link from a progressive row's difficulty badge to the component editor.
    onOpenComponent = () => {},
    onAssignIngredientSet = () => {},
    onUpdateResultGroups = () => {},
    onDeleteStep = () => {},
    // GM policy: may a player reorder this recipe's progressive stages? Default true.
    onToggleAllowPlayerResultReorder = () => {},
  } = $props();

  // Default-true: only an explicit `false` turns the switch off, matching the model.
  const allowPlayerResultReorder = $derived(recipe?.allowPlayerResultReorder !== false);

  function text(key, fallback) {
    const translated = localize(key);
    return translated && translated !== key ? translated : fallback;
  }

  const resultGroups = $derived(Array.isArray(recipe?.resultGroups) ? recipe.resultGroups : []);
  const ingredientSets = $derived(
    Array.isArray(recipe?.ingredientSets) ? recipe.ingredientSets : []
  );
  const steps = $derived(Array.isArray(recipe?.steps) ? recipe.steps : []);

  // Per-mode heading and intro, OUTSIDE any card. The progressive heading is "Results", matching
  // the progressive SALVAGE editor: the two are the same surface and must not drift, and the
  // strip below is the one place the roll-budget explanation belongs.
  const heading = $derived(
    progressive
      ? {
          title: text('FABRICATE.Admin.Manager.Recipe.ResultsHeadingProgressive', 'Results'),
          intro: text(
            'FABRICATE.Admin.Manager.Recipe.ResultsIntroProgressive',
            'What this recipe produces, awarded in order down the list.'
          ),
        }
      : routingProvider === 'check'
        ? {
            title: text('FABRICATE.Admin.Manager.Recipe.ResultsHeadingCheck', 'Results by outcome'),
            intro: text(
              'FABRICATE.Admin.Manager.Recipe.ResultsIntroCheck',
              'Each result set is produced on a matching crafting-check success tier.'
            ),
          }
        : routingProvider === 'ingredientSet'
          ? {
              title: text(
                'FABRICATE.Admin.Manager.Recipe.ResultsHeadingIngredients',
                'Results by ingredient set'
              ),
              intro: text(
                'FABRICATE.Admin.Manager.Recipe.ResultsIntroIngredients',
                'The ingredient set the crafter uses selects the result set.'
              ),
            }
          : {
              title: text('FABRICATE.Admin.Manager.Recipe.ResultsHeadingSimple', 'Result'),
              intro: text(
                'FABRICATE.Admin.Manager.Recipe.ResultsIntroSimple',
                'One ingredient set produces one result set.'
              ),
            }
  );

  function stepResultGroups(step) {
    return Array.isArray(step?.resultGroups) ? step.resultGroups : [];
  }

  function stepIngredientSets(step) {
    return Array.isArray(step?.ingredientSets) ? step.ingredientSets : [];
  }
</script>

<section
  class="manager-recipe-tab manager-recipe-results-tab"
  data-recipe-tab="results"
  aria-label={text('FABRICATE.Admin.Manager.Recipe.Tabs.Results', 'Results')}
>
  <div class="manager-recipe-tab-intro">
    <h2 class="manager-recipe-tab-title">{heading.title}</h2>
    <p class="manager-muted">{heading.intro}</p>
  </div>

  {#if collapsed}
    <Callout
      tone="info"
      icon="fas fa-layer-group"
      text={text(
        'FABRICATE.Admin.Manager.Recipe.CollapsedResultsNote',
        'Multi-step recipes are disabled, so this recipe runs as one combined action. You are editing its final results — the output the combined action produces.'
      )}
      dataAttr="data-recipe-collapsed-results-note"
    />
  {/if}

  {#if progressive}
    <!-- The strip and the reorder policy sit ABOVE the list, matching the progressive salvage
         editor: both describe what the ORDER MEANS, and the order is what is authored below.

         The strip's copy is NOT folded into the card's sub-line, because the strip states an
         INVARIANT — the award mechanic holds whatever the toggle says — while the card states a
         CONDITIONAL, so a merged sub-line would caveat itself. NEUTRAL rather than info on the
         same reading: the info tint is reserved for a note about LIVE state, and this strip sits
         directly above an info-tinted ToggleCard, so tinting it would spend the colour twice. -->
    <Callout
      tone="neutral"
      icon="fas fa-dice-d20"
      text={text(
        'FABRICATE.Admin.Manager.Recipe.ResultsProgressiveInfo',
        'Roll budget flows down the list · each stage consumes its difficulty before the next is produced'
      )}
      dataAttr="data-recipe-info-strip"
    />

    <ToggleCard
      variant="is-info"
      icon="fas fa-arrow-down-a-z"
      section="allow-player-result-reorder"
      field="allowPlayerResultReorder"
      title={text(
        'FABRICATE.Admin.Manager.Recipe.AllowPlayerResultReorderTitle',
        'Allow player result re-ordering'
      )}
      sub={text(
        'FABRICATE.Admin.Manager.Recipe.AllowPlayerResultReorderSub',
        'Players may set their own stage order for this recipe, which is remembered and used every time they craft it.'
      )}
      toggleLabel={text(
        'FABRICATE.Admin.Manager.Recipe.AllowPlayerResultReorderToggle',
        'Allow player result re-ordering'
      )}
      on={allowPlayerResultReorder}
      onToggle={(next) => onToggleAllowPlayerResultReorder(next)}
    />
  {/if}

  {#if isMultiStep}
    {#if steps.length === 0}
      <p class="manager-muted">
        {text(
          'FABRICATE.Admin.Manager.Recipe.NoStepsHint',
          'Add a step in Overview to configure its results.'
        )}
      </p>
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
            {failureResultsAllowed}
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
      {failureResultsAllowed}
      onAssignIngredientSet={(groupId, setId, assigned) =>
        onAssignIngredientSet(null, groupId, setId, assigned)}
      onChange={(nextGroups) => onUpdateResultGroups(null, nextGroups)}
    />
  {/if}
</section>
