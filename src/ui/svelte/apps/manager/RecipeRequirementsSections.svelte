<!-- Svelte 5 runes mode -->
<!--
  Shared empty-state scaffold for a recipe scope's three requirement primitives —
  ingredient sets, result groups, and required tools. Rendered both in the
  single-step editor (RecipeEditView) and inside every expanded multi-step step
  (RecipeStepsCard) so the two surfaces stay identical. This iteration is the
  empty-state shell: Ingredients / Results add an empty entry rendered as a
  minimal placeholder row; Tools is fully wired to the searchable system Tools
  library popover. The rich per-set / per-group editors come later.

  `idPrefix` namespaces the `data-recipe-section` markers so single-step vs.
  per-step instances are distinguishable in tests.
-->
<script>
  import { localize } from '../../util/foundryBridge.js';
  import SearchablePopover from './SearchablePopover.svelte';

  let {
    ingredientSets = [],
    resultGroups = [],
    toolIds = [],
    toolsLibrary = [],
    onAddIngredientSet = () => {},
    onRemoveIngredientSet = () => {},
    onAddResultGroup = () => {},
    onRemoveResultGroup = () => {},
    onAddTool = () => {},
    onRemoveTool = () => {},
    idPrefix = ''
  } = $props();

  function text(key, fallback) {
    const translated = localize(key);
    return translated && translated !== key ? translated : fallback;
  }

  function toolLabel(toolId) {
    const tool = (toolsLibrary || []).find(entry => entry.id === toolId);
    return tool?.label || tool?.componentId || toolId;
  }

  // The popover lists only tools not already required by this scope; resolve each
  // to its display label (falling back to the component id), so a tool whose label
  // is blank still shows something pickable.
  const availableToolOptions = $derived(
    (toolsLibrary || [])
      .filter(tool => !(toolIds || []).includes(tool.id))
      .map(tool => ({ id: tool.id, label: tool.label || tool.componentId || tool.id, icon: 'fas fa-screwdriver-wrench' }))
  );

  // Empty when the library has no tools at all; otherwise (every tool already
  // added) the search list collapses to the "all added" hint.
  const toolsEmptyHint = $derived(
    (toolsLibrary || []).length === 0
      ? text('FABRICATE.Admin.Manager.Recipe.NoToolsDefined', 'No tools defined')
      : text('FABRICATE.Admin.Manager.Recipe.AllToolsAdded', 'All tools added')
  );
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

<section class="manager-task-core-card manager-recipe-section" data-recipe-section={`${idPrefix}results`}>
  <div class="manager-task-card-heading">
    <div>
      <h3>{text('FABRICATE.Admin.Manager.Recipe.ResultsSection', 'Results')}</h3>
    </div>
  </div>
  {#if (resultGroups || []).length === 0}
    <div class="manager-recipe-section-empty">
      <p class="manager-recipe-section-empty-title">{text('FABRICATE.Admin.Manager.Recipe.ResultsEmpty', 'No results yet')}</p>
      <p class="manager-muted">{text('FABRICATE.Admin.Manager.Recipe.ResultsEmptyHint', 'Add a group of items this recipe can produce.')}</p>
      <button type="button" class="manager-button" data-recipe-add="result-group" onclick={() => onAddResultGroup()}>
        <i class="fas fa-plus" aria-hidden="true"></i>
        <span>{text('FABRICATE.Admin.Manager.Recipe.AddResultGroup', 'Add result group')}</span>
      </button>
    </div>
  {:else}
    <ul class="manager-recipe-req-rows">
      {#each resultGroups as group, index (group.id)}
        <li class="manager-recipe-req-row" data-recipe-req-id={group.id}>
          <span class="manager-recipe-req-label">{`${text('FABRICATE.Admin.Manager.Recipe.GroupLabel', 'Group')} ${index + 1}`}</span>
          <button
            type="button"
            class="manager-icon-button is-danger"
            data-recipe-remove="result-group"
            aria-label={text('FABRICATE.Admin.Manager.Recipe.RemoveResultGroup', 'Remove result group')}
            title={text('FABRICATE.Admin.Manager.Recipe.RemoveResultGroup', 'Remove result group')}
            onclick={() => onRemoveResultGroup(group.id)}
          ><i class="fas fa-trash" aria-hidden="true"></i></button>
        </li>
      {/each}
    </ul>
    <button type="button" class="manager-button" data-recipe-add="result-group" onclick={() => onAddResultGroup()}>
      <i class="fas fa-plus" aria-hidden="true"></i>
      <span>{text('FABRICATE.Admin.Manager.Recipe.AddResultGroup', 'Add result group')}</span>
    </button>
  {/if}
</section>

<section class="manager-task-core-card manager-recipe-section" data-recipe-section={`${idPrefix}tools`}>
  <div class="manager-task-card-heading">
    <div>
      <h3>{text('FABRICATE.Admin.Manager.Recipe.ToolsSection', 'Tools')}</h3>
    </div>
  </div>
  {#if (toolIds || []).length === 0}
    <div class="manager-recipe-section-empty">
      <p class="manager-recipe-section-empty-title">{text('FABRICATE.Admin.Manager.Recipe.ToolsEmpty', 'No tools yet')}</p>
      <p class="manager-muted">{text('FABRICATE.Admin.Manager.Recipe.ToolsEmptyHint', 'Add a tool required to craft.')}</p>
      <SearchablePopover
        options={availableToolOptions}
        pickerClass="manager-recipe-tools-picker"
        triggerClass="manager-button manager-recipe-tools-trigger"
        triggerIcon="fas fa-screwdriver-wrench"
        triggerLabel={text('FABRICATE.Admin.Manager.Recipe.AddTool', 'Add a tool')}
        triggerAriaLabel={text('FABRICATE.Admin.Manager.Recipe.AddTool', 'Add a tool')}
        dialogAriaLabel={text('FABRICATE.Admin.Manager.Recipe.AddTool', 'Add a tool')}
        searchPlaceholder={text('FABRICATE.Admin.Manager.Recipe.ToolSearchPlaceholder', 'Search tools...')}
        searchAriaLabel={text('FABRICATE.Admin.Manager.Recipe.ToolSearchPlaceholder', 'Search tools...')}
        emptyHint={toolsEmptyHint}
        onChoose={(id) => onAddTool(id)}
      />
    </div>
  {:else}
    <ul class="manager-recipe-tool-rows">
      {#each toolIds as toolId (toolId)}
        <li class="manager-recipe-tool-row" data-recipe-tool-id={toolId}>
          <span class="manager-recipe-tool-label"><i class="fas fa-screwdriver-wrench" aria-hidden="true"></i>{toolLabel(toolId)}</span>
          <button
            type="button"
            class="manager-icon-button is-danger"
            data-recipe-remove="tool"
            aria-label={text('FABRICATE.Admin.Manager.Recipe.RemoveTool', 'Remove tool')}
            title={text('FABRICATE.Admin.Manager.Recipe.RemoveTool', 'Remove tool')}
            onclick={() => onRemoveTool(toolId)}
          ><i class="fas fa-trash" aria-hidden="true"></i></button>
        </li>
      {/each}
    </ul>
    <SearchablePopover
      options={availableToolOptions}
      pickerClass="manager-recipe-tools-picker"
      triggerClass="manager-button manager-recipe-tools-trigger"
      triggerIcon="fas fa-screwdriver-wrench"
      triggerLabel={text('FABRICATE.Admin.Manager.Recipe.AddTool', 'Add a tool')}
      triggerAriaLabel={text('FABRICATE.Admin.Manager.Recipe.AddTool', 'Add a tool')}
      dialogAriaLabel={text('FABRICATE.Admin.Manager.Recipe.AddTool', 'Add a tool')}
      searchPlaceholder={text('FABRICATE.Admin.Manager.Recipe.ToolSearchPlaceholder', 'Search tools...')}
      searchAriaLabel={text('FABRICATE.Admin.Manager.Recipe.ToolSearchPlaceholder', 'Search tools...')}
      emptyHint={toolsEmptyHint}
      onChoose={(id) => onAddTool(id)}
    />
  {/if}
</section>
