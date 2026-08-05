<!-- Svelte 5 runes mode -->
<!--
  Required-tools section for a single recipe scope (recipe-level for single-step
  recipes, one step for multi-step, or the multi-step global card). Rebuilt to the
  GM Recipe Studio prototype (issue 643 §D): a tool row is a medallion + name +
  a subtle `×`, the add-button is a dashed accent pill, and the empty state is a
  single centered dashed panel. Tool behavior belongs to Tool Studio, so Recipe
  rows carry identity only.

  `idPrefix` namespaces the `data-recipe-section` marker so single-step vs. per-step
  instances are distinguishable in tests. `emptyLabel` carries the context-specific
  empty copy (recipe / step / global).
-->
<script>
  import EmptyState from '../EmptyState.svelte';
  import { localize } from '../../../util/foundryBridge.js';
  import SearchablePopover from '../SearchablePopover.svelte';

  let {
    toolIds = [],
    toolsLibrary = [],
    emptyLabel = '',
    addLabel = '',
    onAddTool = () => {},
    onRemoveTool = () => {},
    idPrefix = '',
  } = $props();

  function text(key, fallback) {
    const translated = localize(key);
    return translated && translated !== key ? translated : fallback;
  }

  const addToolLabel = $derived(
    addLabel || text('FABRICATE.Admin.Manager.Recipe.AddTool', 'Add tool')
  );
  const emptyToolLabel = $derived(
    emptyLabel || text('FABRICATE.Admin.Manager.Recipe.ToolsEmptyPanel', 'No tools required.')
  );

  // Display precedence, per `data-models` `## Tool` requirement 13 and mirroring
  // `toolStudio.js`'s `toolDisplayName`/`toolDisplayImage`: authored label, then the
  // registration display SNAPSHOT (`name`/`img`), then the linked managed component,
  // then the fallback. The snapshot rung is load-bearing — a first-class item-sourced
  // tool carries `componentId: null` (issue 561), so a component-only resolver renders
  // "Unnamed tool" and the item-bag sentinel for a fully-populated tool (issue 976).
  // `componentName`/`componentImg` arrive pre-flattened from `recipeToolsLibrary`, so
  // this re-derives the canonical ordering rather than importing the helper; the shared
  // precedence table in `tests/helpers/toolDisplayPrecedenceCases.js` pins them equal.
  function toolDisplayLabel(tool) {
    return (
      String(tool?.label || '').trim() ||
      tool?.name ||
      tool?.componentName ||
      text('FABRICATE.Admin.Manager.Recipe.UnnamedTool', 'Unnamed tool')
    );
  }

  function toolLabel(toolId) {
    const tool = (toolsLibrary || []).find((entry) => entry.id === toolId);
    return toolDisplayLabel(tool);
  }

  function toolImage(tool) {
    return tool?.img || tool?.componentImg || 'icons/svg/item-bag.svg';
  }

  function toolImageById(toolId) {
    const tool = (toolsLibrary || []).find((entry) => entry.id === toolId);
    return toolImage(tool);
  }

  const availableToolOptions = $derived(
    (toolsLibrary || [])
      .filter((tool) => !(toolIds || []).includes(tool.id))
      .map((tool) => ({ id: tool.id, label: toolDisplayLabel(tool), img: toolImage(tool) }))
  );

  const toolsEmptyHint = $derived(
    (toolsLibrary || []).length === 0
      ? text('FABRICATE.Admin.Manager.Recipe.NoToolsDefined', 'No tools defined')
      : text('FABRICATE.Admin.Manager.Recipe.AllToolsAdded', 'All tools added')
  );
</script>

<div class="manager-recipe-tools-section" data-recipe-section={`${idPrefix}tools`}>
  {#if (toolIds || []).length === 0}
    <EmptyState
      compact
      icon="fas fa-screwdriver-wrench"
      title={emptyToolLabel}
      dataAttr="data-recipe-tools-empty"
    />
  {:else}
    <ul class="manager-recipe-tool-rows">
      {#each toolIds as toolId (toolId)}
        <li class="manager-recipe-tool-row" data-recipe-tool-id={toolId}>
          <span class="manager-recipe-tool-medallion" aria-hidden="true"
            ><img src={toolImageById(toolId)} alt="" /></span
          >
          <span class="manager-recipe-tool-name">{toolLabel(toolId)}</span>
          <button
            type="button"
            class="manager-recipe-tool-remove"
            data-recipe-remove="tool"
            aria-label={text('FABRICATE.Admin.Manager.Recipe.RemoveTool', 'Remove tool')}
            title={text('FABRICATE.Admin.Manager.Recipe.RemoveTool', 'Remove tool')}
            onclick={() => onRemoveTool(toolId)}
            ><i class="fas fa-times" aria-hidden="true"></i></button
          >
        </li>
      {/each}
    </ul>
  {/if}
  <SearchablePopover
    options={availableToolOptions}
    pickerClass="manager-recipe-tools-picker"
    triggerClass="manager-button is-dashed manager-recipe-tools-trigger"
    triggerIcon="fas fa-plus"
    triggerLabel={addToolLabel}
    triggerAriaLabel={addToolLabel}
    triggerAddMarker="tool"
    dialogAriaLabel={addToolLabel}
    searchPlaceholder={text(
      'FABRICATE.Admin.Manager.Recipe.ToolSearchPlaceholder',
      'Search tools...'
    )}
    searchAriaLabel={text(
      'FABRICATE.Admin.Manager.Recipe.ToolSearchPlaceholder',
      'Search tools...'
    )}
    emptyHint={toolsEmptyHint}
    showChevron={false}
    onChoose={(id) => onAddTool(id)}
  />
</div>
