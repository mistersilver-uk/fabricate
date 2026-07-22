<!-- Svelte 5 runes mode -->
<!--
  Required-tools section for a single recipe scope (recipe-level for single-step
  recipes, one step for multi-step, or the multi-step global card). Rebuilt to the
  GM Recipe Studio prototype (issue 643 §D): a tool row is a medallion + name +
  right-aligned muted "not consumed" + a subtle `×`, the add-button is a dashed
  accent pill, and the empty state is a single centered dashed panel.

  `idPrefix` namespaces the `data-recipe-section` marker so single-step vs. per-step
  instances are distinguishable in tests. `emptyLabel` carries the context-specific
  empty copy (recipe / step / global).
-->
<script>
  import { localize } from '../../../util/foundryBridge.js';
  import SearchablePopover from '../SearchablePopover.svelte';

  let {
    toolIds = [],
    toolsLibrary = [],
    toolBonusModes = {},
    emptyLabel = '',
    addLabel = '',
    onAddTool = () => {},
    onRemoveTool = () => {},
    onSetToolBonusMode = () => {},
    idPrefix = ''
  } = $props();

  function text(key, fallback) {
    const translated = localize(key);
    return translated && translated !== key ? translated : fallback;
  }

  const addToolLabel = $derived(addLabel || text('FABRICATE.Admin.Manager.Recipe.AddTool', 'Add tool'));
  const emptyToolLabel = $derived(emptyLabel || text('FABRICATE.Admin.Manager.Recipe.ToolsEmptyPanel', 'No tools required.'));

  function toolDisplayLabel(tool) {
    return (
      tool?.label ||
      tool?.componentName ||
      text('FABRICATE.Admin.Manager.Recipe.UnnamedTool', 'Unnamed tool')
    );
  }

  function toolLabel(toolId) {
    const tool = (toolsLibrary || []).find(entry => entry.id === toolId);
    return toolDisplayLabel(tool);
  }

  function toolImage(tool) {
    return tool?.componentImg || 'icons/svg/item-bag.svg';
  }

  function toolImageById(toolId) {
    const tool = (toolsLibrary || []).find(entry => entry.id === toolId);
    return toolImage(tool);
  }

  function bonusMode(toolId) {
    return ['highestOnly', 'never'].includes(toolBonusModes?.[toolId])
      ? toolBonusModes[toolId]
      : 'always';
  }

  const availableToolOptions = $derived(
    (toolsLibrary || [])
      .filter(tool => !(toolIds || []).includes(tool.id))
      .map(tool => ({ id: tool.id, label: toolDisplayLabel(tool), img: toolImage(tool) }))
  );

  const toolsEmptyHint = $derived(
    (toolsLibrary || []).length === 0
      ? text('FABRICATE.Admin.Manager.Recipe.NoToolsDefined', 'No tools defined')
      : text('FABRICATE.Admin.Manager.Recipe.AllToolsAdded', 'All tools added')
  );
</script>

<div class="manager-recipe-tools-section" data-recipe-section={`${idPrefix}tools`}>
  {#if (toolIds || []).length === 0}
    <div class="manager-recipe-tools-empty" data-recipe-tools-empty>
      <p class="manager-muted">{emptyToolLabel}</p>
    </div>
  {:else}
    <ul class="manager-recipe-tool-rows">
      {#each toolIds as toolId (toolId)}
        <li class="manager-recipe-tool-row" data-recipe-tool-id={toolId}>
          <span class="manager-recipe-tool-medallion" aria-hidden="true"><img src={toolImageById(toolId)} alt="" /></span>
          <span class="manager-recipe-tool-name">{toolLabel(toolId)}</span>
          <span class="manager-recipe-tool-note manager-muted">{text('FABRICATE.Admin.Manager.Recipe.ToolNotConsumed', 'not consumed')}</span>
          <label class="manager-recipe-tool-bonus-mode">
            <span class="sr-only">{text('FABRICATE.Admin.Manager.Recipe.ToolBonusMode', 'Tool bonus mode')} — {toolLabel(toolId)}</span>
            <select
              data-recipe-tool-bonus-mode={toolId}
              value={bonusMode(toolId)}
              aria-label={`${text('FABRICATE.Admin.Manager.Recipe.ToolBonusMode', 'Tool bonus mode')} — ${toolLabel(toolId)}`}
              onchange={(event) => onSetToolBonusMode(toolId, event.currentTarget.value)}
            >
              <option value="always">{text('FABRICATE.Admin.Manager.Recipe.ToolBonusAlways', 'Always')}</option>
              <option value="highestOnly">{text('FABRICATE.Admin.Manager.Recipe.ToolBonusHighestOnly', 'Highest only')}</option>
              <option value="never">{text('FABRICATE.Admin.Manager.Recipe.ToolBonusNever', 'Never')}</option>
            </select>
          </label>
          <button
            type="button"
            class="manager-recipe-tool-remove"
            data-recipe-remove="tool"
            aria-label={text('FABRICATE.Admin.Manager.Recipe.RemoveTool', 'Remove tool')}
            title={text('FABRICATE.Admin.Manager.Recipe.RemoveTool', 'Remove tool')}
            onclick={() => onRemoveTool(toolId)}
          ><i class="fas fa-times" aria-hidden="true"></i></button>
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
    searchPlaceholder={text('FABRICATE.Admin.Manager.Recipe.ToolSearchPlaceholder', 'Search tools...')}
    searchAriaLabel={text('FABRICATE.Admin.Manager.Recipe.ToolSearchPlaceholder', 'Search tools...')}
    emptyHint={toolsEmptyHint}
    showChevron={false}
    onChoose={(id) => onAddTool(id)}
  />
</div>
