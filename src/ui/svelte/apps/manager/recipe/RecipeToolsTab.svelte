<!-- Svelte 5 runes mode -->
<!--
  Tools tab. Always shows the recipe-level tools section (the tools required across
  the whole recipe). For multi-step recipes it then lists the ordered steps as an
  expandable/collapsible accordion (shared with Overview, Ingredients, and Results)
  — WITHOUT drag-reorder (order is set in Overview) but WITH the time/currency chips
  and a delete button in each header, each expanded step hosting its own tools
  section (scoped via `idPrefix`). Deleting a step here removes the whole step (its
  ingredients and results too), so the parent confirms. The shell owns the
  add/remove patching; recipe-level tools patch the recipe, per-step tools patch
  the step. Each named routed-by-ingredients set gets a `SetCard` with its own tools, renamed in place
  through `onUpdateIngredientSets(stepId, nextSets)`; an empty name is refused, since an unnamed
  set's Tool references are inert, and the tab's one persistent status region announces why.
-->
<script>
  import { tick } from 'svelte';
  import { ingredientSetToolsAreActive } from '../../../../../systems/toolCheckBonus.js';
  import { localize } from '../../../util/foundryBridge.js';
  import RecipeStepAccordion from './RecipeStepAccordion.svelte';
  import RecipeToolsSection from './RecipeToolsSection.svelte';
  import SetCard from '../../../components/SetCard.svelte';
  import { uniqueRowKeys } from '../../../components/resultRows.js';
  import { localizeOr } from '../../../util/localizeOr.js';

  let {
    // The resolution-mode callout, rendered in this tab's heading block (issue 1522).
    modeCallout = undefined,
    recipe = null,
    isMultiStep = false,
    // COLLAPSED chain (issue 710): the system's multi-step feature is off but the
    // recipe still carries authored steps. Step-level tool authoring is gated read-only
    // behind a note; the preserved step data is restored on re-enable.
    collapsed = false,
    toolIds = [],
    toolsLibrary = [],
    routingProvider = null,
    onUpdateIngredientSets = () => {},
    onAddTool = () => {},
    onRemoveTool = () => {},
    onAddStepTool = () => {},
    onRemoveStepTool = () => {},
    onAddIngredientSetTool = () => {},
    onRemoveIngredientSetTool = () => {},
    onDeleteStep = () => {},
  } = $props();

  function text(key, fallback) {
    const translated = localize(key);
    return translated && translated !== key ? translated : fallback;
  }

  const steps = $derived(Array.isArray(recipe?.steps) ? recipe.steps : []);

  function stepToolIds(step) {
    return Array.isArray(step?.toolIds) ? step.toolIds : [];
  }

  function ingredientSets(scope) {
    return Array.isArray(scope?.ingredientSets) ? scope.ingredientSets : [];
  }

  function setToolIds(set) {
    return Array.isArray(set?.toolIds) ? set.toolIds : [];
  }

  // The sets whose empty rename was refused, keyed by id, until a rename lands.
  let refused = $state({});
  let announced = $state('');
  const unnamedText = $derived(
    localizeOr(
      'FABRICATE.Admin.Manager.Recipe.ToolsSetNameRequired',
      'An ingredient set needs a name to carry Tools. An unnamed set’s Tool references are inert: they stay saved, and apply again once it is named.'
    )
  );

  // Cleared first, so a second refusal is a change the region announces again.
  function announceRefusal() {
    announced = '';
    tick().then(() => {
      announced = unnamedText;
    });
  }

  function renameSet(stepId, scope, set, name) {
    if (!String(name).trim()) {
      refused = { ...refused, [set.id]: true };
      announceRefusal();
      return false;
    }
    refused = { ...refused, [set.id]: false };
    announced = '';
    const sets = ingredientSets(scope).map((entry) =>
      entry.id === set.id ? { ...entry, name } : entry
    );
    onUpdateIngredientSets(stepId, sets);
    return true;
  }

  function toolEligibleIngredientSets(scope) {
    const system = {
      resolutionMode: routingProvider === 'ingredientSet' ? 'routedByIngredients' : null,
    };
    return ingredientSets(scope).filter((set) => ingredientSetToolsAreActive(system, set));
  }
</script>

{#snippet setTools(stepId, scope, set, idPrefix)}
  <SetCard
    kicker={localizeOr('FABRICATE.Common.SetCard.Kicker.IngredientSet', 'Ingredient set')}
    name={set.name}
    nameProps={{ 'data-recipe-tools-set-field': 'name' }}
    onRename={(name) => renameSet(stepId, scope, set, name)}
    note={refused[set.id] ? unnamedNote : undefined}
    data-recipe-tools-ingredient-set={set.id}
  >
    <RecipeToolsSection
      {idPrefix}
      toolIds={setToolIds(set)}
      {toolsLibrary}
      emptyLabel={text(
        'FABRICATE.Admin.Manager.Recipe.ToolsEmptyIngredientSet',
        'No tools needed for this ingredient set.'
      )}
      onAddTool={(toolId) => onAddIngredientSetTool(stepId, set.id, toolId)}
      onRemoveTool={(toolId) => onRemoveIngredientSetTool(stepId, set.id, toolId)}
    />
  </SetCard>
{/snippet}

{#snippet unnamedNote()}
  <span data-recipe-tools-set-note>{unnamedText}</span>
{/snippet}

<section
  class="manager-recipe-tab manager-recipe-tools-tab"
  data-recipe-tab="tools"
  aria-label={text('FABRICATE.Admin.Manager.Recipe.Tabs.Tools', 'Tools')}
>
  <span class="visually-hidden" role="status" data-recipe-tools-set-status>{announced}</span>
  <div class="fab-stack" data-gap="3" data-tab-heading>
    <div class="manager-recipe-tab-intro">
      <h2 class="manager-recipe-tab-title">
        {text('FABRICATE.Admin.Manager.Recipe.ToolsSection', 'Tools')}
      </h2>
      <p class="manager-muted">
        {text(
          'FABRICATE.Admin.Manager.Recipe.ToolsIntro',
          'Required for crafting — configure their behavior in Tool Studio.'
        )}
      </p>
      {#if collapsed}
        <p class="manager-muted" data-recipe-collapsed-note>
          {text(
            'FABRICATE.Admin.Manager.Recipe.CollapsedStepsNote',
            'This recipe keeps its steps but runs as one combined action while multi-step recipes are disabled for this system. Turn multi-step recipes back on to edit steps.'
          )}
        </p>
      {/if}
    </div>
    {@render modeCallout?.()}
  </div>

  <!-- A collapsed chain authors nothing here; the heading block's note says why. -->
  {#if isMultiStep && steps.length > 0 && !collapsed}
    <!-- The recipe-level tools are GLOBAL — required for every step (§D2). -->
    <div class="manager-recipe-tools-global" data-recipe-tools-global>
      <div class="manager-recipe-tools-global-head">
        <span class="manager-recipe-tools-global-medallion" aria-hidden="true"
          ><i class="fas fa-globe"></i></span
        >
        <div>
          <h3 class="manager-recipe-section-title">
            {text('FABRICATE.Admin.Manager.Recipe.GlobalTools', 'Global tools')}
          </h3>
          <p class="manager-muted">
            {text('FABRICATE.Admin.Manager.Recipe.GlobalToolsHint', 'required for every step')}
          </p>
        </div>
      </div>
      <RecipeToolsSection
        {toolIds}
        {toolsLibrary}
        emptyLabel={text(
          'FABRICATE.Admin.Manager.Recipe.ToolsEmptyGlobal',
          'No global tools — add one that every step needs.'
        )}
        addLabel={text('FABRICATE.Admin.Manager.Recipe.AddGlobalTool', 'Add global tool')}
        {onAddTool}
        {onRemoveTool}
      />
    </div>

    <div class="manager-recipe-tools-divider" aria-hidden="true">
      <span>{text('FABRICATE.Admin.Manager.Recipe.PlusPerStep', 'Plus, per step')}</span>
    </div>

    <RecipeStepAccordion {steps} alwaysOpen {onDeleteStep}>
      {#snippet body(step)}
        <RecipeToolsSection
          idPrefix={`step-${step.id}-`}
          toolIds={stepToolIds(step)}
          {toolsLibrary}
          emptyLabel={text(
            'FABRICATE.Admin.Manager.Recipe.ToolsEmptyStep',
            'No tools needed for this step.'
          )}
          onAddTool={(toolId) => onAddStepTool(step.id, toolId)}
          onRemoveTool={(toolId) => onRemoveStepTool(step.id, toolId)}
        />
        {@const stepSets = toolEligibleIngredientSets(step)}
        {@const stepSetKeys = uniqueRowKeys(stepSets)}
        {#each stepSets as set, index (stepSetKeys[index])}
          {@render setTools(step.id, step, set, `step-${step.id}-set-${set.id}-`)}
        {/each}
      {/snippet}
    </RecipeStepAccordion>
  {:else if !collapsed}
    <RecipeToolsSection
      {toolIds}
      {toolsLibrary}
      emptyLabel={text('FABRICATE.Admin.Manager.Recipe.ToolsEmptyPanel', 'No tools required.')}
      {onAddTool}
      {onRemoveTool}
    />
    {@const recipeSets = toolEligibleIngredientSets(recipe)}
    {@const recipeSetKeys = uniqueRowKeys(recipeSets)}
    {#each recipeSets as set, index (recipeSetKeys[index])}
      {@render setTools(null, recipe, set, `set-${set.id}-`)}
    {/each}
  {/if}
</section>
