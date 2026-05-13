<!-- Svelte 5 runes mode -->
<!--
  Manager V2 — Gathering Tools library page body.

  Browses the reusable tools library for the selected crafting system, supports
  inline expansion to edit a tool, and emits row-level CRUD via callbacks. The
  surrounding shell (CraftingSystemManagerV2Root.svelte) supplies the page
  header chrome, the right-side inspector, and Save / dirty-state handling.
-->
<script>
  import { dragDrop } from '../../actions/dragDrop.js';
  import { localize } from '../../util/foundryBridge.js';
  import { dropRateTierClass, dropRateTierColor } from '../../util/dropRateTier.js';
  import ProviderExpressionInput from '../../components/ProviderExpressionInput.svelte';

  let {
    tools = [],
    selectedToolId = '',
    expandedToolId = '',
    managedItemOptions = [],
    onSelectTool = () => {},
    onToggleExpand = () => {},
    onAddTool = () => {},
    onUpdateTool = () => {},
    onDeleteTool = () => {}
  } = $props();

  function text(key, fallback = key) {
    const translated = localize(key);
    return translated && translated !== key ? translated : fallback;
  }

  function formatCount(key, fallback, count) {
    return text(key, fallback).replace('{count}', String(count));
  }

  const managedItemMap = $derived(new Map(
    (Array.isArray(managedItemOptions) ? managedItemOptions : []).map(item => [String(item.id), item])
  ));

  function managedItem(componentId) {
    if (!componentId) return null;
    return managedItemMap.get(String(componentId)) || null;
  }

  function toolImage(tool) {
    return managedItem(tool?.componentId)?.img || 'icons/svg/item-bag.svg';
  }

  function toolPrimaryLabel(tool) {
    const label = String(tool?.label || '').trim();
    if (label) return label;
    const componentName = managedItem(tool?.componentId)?.name;
    if (componentName) return String(componentName);
    return text('FABRICATE.Admin.ManagerV2.Tools.EmptyTitle', 'No tool name');
  }

  function toolSecondary(tool) {
    const rarity = managedItem(tool?.componentId)?.rarity;
    const baseLabel = text('FABRICATE.Admin.ManagerV2.Tools.SecondaryLabel', 'Tool');
    if (rarity) return `${baseLabel} · ${rarity}`;
    return `${baseLabel} · ${text('FABRICATE.Admin.ManagerV2.Tools.SecondaryRarityFallback', 'Common')}`;
  }

  function requirementChipClass(tool) {
    return tool?.requirement ? 'manager-v2-chip is-active' : 'manager-v2-chip is-neutral';
  }

  function requirementChipLabel(tool) {
    return tool?.requirement
      ? text('FABRICATE.Admin.ManagerV2.Tools.RequirementPresent', 'Requirement set')
      : text('FABRICATE.Admin.ManagerV2.Tools.RequirementNone', 'No requirement');
  }

  function breakageChipClass(tool) {
    return tool?.breakage?.mode === 'limitedUses' ? 'manager-v2-chip is-neutral' : 'manager-v2-chip is-warning';
  }

  function breakageChipLabel(tool) {
    const mode = tool?.breakage?.mode;
    if (mode === 'limitedUses') {
      const maxUses = tool?.breakage?.maxUses;
      if (maxUses === null || maxUses === undefined) {
        return text('FABRICATE.Admin.ManagerV2.Tools.BreakageSummaryUnlimited', 'Unlimited uses');
      }
      return formatCount('FABRICATE.Admin.ManagerV2.Tools.BreakageSummaryLimited', '{count} max uses', Number(maxUses));
    }
    if (mode === 'breakageChance') {
      return text('FABRICATE.Admin.ManagerV2.Tools.BreakageSummaryChance', '{percent}% break chance')
        .replace('{percent}', String(tool?.breakage?.breakageChance ?? 0));
    }
    if (mode === 'diceExpression') {
      return text('FABRICATE.Admin.ManagerV2.Tools.BreakageSummaryDice', 'Dice < {threshold}')
        .replace('{threshold}', String(tool?.breakage?.threshold ?? 0));
    }
    return text('FABRICATE.Admin.ManagerV2.Tools.BreakageLimitedUses', 'Limited uses');
  }

  function onBreakChipClass(tool) {
    const mode = tool?.onBreak?.mode;
    if (mode === 'destroy') return 'manager-v2-chip is-danger';
    if (mode === 'flagBroken') return 'manager-v2-chip is-warning';
    return 'manager-v2-chip is-positive';
  }

  function onBreakChipLabel(tool) {
    const mode = tool?.onBreak?.mode;
    if (mode === 'destroy') return text('FABRICATE.Admin.ManagerV2.Tools.OnBreakDestroy', 'Destroy item');
    if (mode === 'flagBroken') return text('FABRICATE.Admin.ManagerV2.Tools.OnBreakFlag', 'Mark as broken');
    return text('FABRICATE.Admin.ManagerV2.Tools.OnBreakReplace', 'Replace with item');
  }

  function handleSelectRow(tool) {
    onSelectTool?.(tool.id);
    onToggleExpand?.(tool.id);
  }

  function handleRowKey(event, tool) {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      handleSelectRow(tool);
    }
  }

  function handleComponentDrop(tool, payload) {
    if (!payload || payload.type !== 'FabricateManagedComponent') return;
    onUpdateTool?.(tool.id, { componentId: payload.componentId || payload.id });
  }

  function handleReplacementDrop(tool, payload) {
    if (!payload || payload.type !== 'FabricateManagedComponent') return;
    const replacementComponentId = payload.componentId || payload.id;
    onUpdateTool?.(tool.id, { onBreak: { mode: 'replaceWith', replacementComponentId } });
  }

  function defaultRequirement() {
    return { provider: 'dnd5e', formula: '', macroUuid: '' };
  }

  function setBreakageMode(tool, mode) {
    if (mode === 'limitedUses') {
      onUpdateTool?.(tool.id, { breakage: { mode, maxUses: null } });
    } else if (mode === 'breakageChance') {
      onUpdateTool?.(tool.id, { breakage: { mode, breakageChance: 0 } });
    } else {
      onUpdateTool?.(tool.id, { breakage: { mode, formula: '', threshold: 0 } });
    }
  }

  function setOnBreakMode(tool, mode) {
    if (mode === 'replaceWith') {
      onUpdateTool?.(tool.id, { onBreak: { mode, replacementComponentId: null } });
    } else {
      onUpdateTool?.(tool.id, { onBreak: { mode } });
    }
  }

  function replacementSameAsComponent(tool) {
    return tool?.onBreak?.mode === 'replaceWith'
      && tool?.onBreak?.replacementComponentId
      && tool?.onBreak?.replacementComponentId === tool?.componentId;
  }
</script>

<main class="manager-v2-main manager-v2-tools-main" aria-label={text('FABRICATE.Admin.ManagerV2.Tools.Title', 'Tools')}>
  <section class="manager-v2-section-header">
    <div class="manager-v2-heading">
      <p class="manager-v2-kicker">{text('FABRICATE.Admin.ManagerV2.Environment.GatheringTabs.Tools', 'Tools')}</p>
      <h2 class="manager-v2-title">{text('FABRICATE.Admin.ManagerV2.Tools.Title', 'Tools')}</h2>
      <p class="manager-v2-subtitle">{text('FABRICATE.Admin.ManagerV2.Tools.Subtitle', 'Manage reusable gathering tools and configure how they behave when required by tasks.')}</p>
    </div>
  </section>

  <section class="manager-v2-inspector-card manager-v2-tools-card" data-manager-v2-tools-browser>
    <div class="manager-v2-tools-card-header">
      <div>
        <h3 class="manager-v2-card-title">{formatCount('FABRICATE.Admin.ManagerV2.Tools.RowCount', 'Tools ({count})', tools.length)}</h3>
        <p class="manager-v2-muted">{text('FABRICATE.Admin.ManagerV2.Tools.RowCountHint', 'Define the behavior of tools when used in gathering tasks.')}</p>
      </div>
      <button type="button" class="manager-v2-button is-primary" onclick={() => onAddTool?.()} data-manager-v2-tools-add>
        <i class="fas fa-plus" aria-hidden="true"></i>
        <span>{text('FABRICATE.Admin.ManagerV2.Tools.Add', 'Add tool')}</span>
      </button>
    </div>

    {#if tools.length === 0}
      <div class="manager-v2-empty is-compact manager-v2-tools-empty">
        <div>
          <i class="fas fa-screwdriver-wrench" aria-hidden="true"></i>
          <h3>{text('FABRICATE.Admin.ManagerV2.Tools.EmptyTitle', 'No tools yet')}</h3>
          <p class="manager-v2-muted">{text('FABRICATE.Admin.ManagerV2.Tools.EmptyHint', 'Add a reusable tool that gathering tasks can require.')}</p>
          <button type="button" class="manager-v2-button is-primary" onclick={() => onAddTool?.()}>
            <i class="fas fa-plus" aria-hidden="true"></i>
            <span>{text('FABRICATE.Admin.ManagerV2.Tools.Add', 'Add tool')}</span>
          </button>
        </div>
      </div>
    {:else}
      <div class="manager-v2-tools-list" role="list">
        {#each tools as tool (tool.id)}
          {@const isExpanded = expandedToolId === tool.id}
          {@const isSelected = selectedToolId === tool.id}
          <div class={`manager-v2-tools-row ${isSelected ? 'is-selected' : ''} ${isExpanded ? 'is-expanded' : ''}`}
            role="listitem"
            data-manager-v2-tool-id={tool.id}>
            <div class="manager-v2-tools-row-body"
              role="button"
              tabindex="0"
              aria-selected={isSelected}
              aria-expanded={isExpanded}
              onclick={() => handleSelectRow(tool)}
              onkeydown={(event) => handleRowKey(event, tool)}>
              <div class="manager-v2-tools-identity">
                <img class="manager-v2-tools-thumb" src={toolImage(tool)} alt="" />
                <div class="manager-v2-tools-identity-copy">
                  <span class="manager-v2-tools-name">{toolPrimaryLabel(tool)}</span>
                  <span class="manager-v2-tools-secondary">{toolSecondary(tool)}</span>
                </div>
              </div>
              <div class="manager-v2-tools-row-summary">
                <span class={requirementChipClass(tool)}>
                  <i class="fas fa-shield-halved" aria-hidden="true"></i>
                  <span>{requirementChipLabel(tool)}</span>
                </span>
                <span class={breakageChipClass(tool)}>
                  <i class="fas fa-hammer-crash" aria-hidden="true"></i>
                  <span>{breakageChipLabel(tool)}</span>
                </span>
                <span class={onBreakChipClass(tool)}>
                  <i class="fas fa-shield-virus" aria-hidden="true"></i>
                  <span>{onBreakChipLabel(tool)}</span>
                </span>
              </div>
              <div class="manager-v2-tools-row-actions">
                <button type="button"
                  class="manager-v2-icon-button"
                  title={text('FABRICATE.Admin.ManagerV2.Tools.MoreActions', 'More actions')}
                  aria-label={text('FABRICATE.Admin.ManagerV2.Tools.MoreActions', 'More actions')}
                  aria-haspopup="menu"
                  onclick={(event) => event.stopPropagation()}>
                  <i class="fas fa-ellipsis" aria-hidden="true"></i>
                </button>
                <button type="button"
                  class="manager-v2-icon-button"
                  title={isExpanded ? text('FABRICATE.Admin.ManagerV2.Tools.CollapseRow', 'Collapse tool editor') : text('FABRICATE.Admin.ManagerV2.Tools.ExpandRow', 'Expand tool editor')}
                  aria-label={isExpanded ? text('FABRICATE.Admin.ManagerV2.Tools.CollapseRow', 'Collapse tool editor') : text('FABRICATE.Admin.ManagerV2.Tools.ExpandRow', 'Expand tool editor')}
                  onclick={(event) => { event.stopPropagation(); onToggleExpand?.(tool.id); }}>
                  <i class={isExpanded ? 'fas fa-chevron-up' : 'fas fa-chevron-down'} aria-hidden="true"></i>
                </button>
              </div>
            </div>

            {#if isExpanded}
              <div class="manager-v2-tools-row-editor" data-manager-v2-tool-editor>
                <label class="manager-v2-field">
                  <span>{text('FABRICATE.Admin.ManagerV2.Tools.LabelField', 'Display label')}</span>
                  <input type="text"
                    value={tool.label || ''}
                    placeholder={managedItem(tool.componentId)?.name || ''}
                    oninput={(event) => onUpdateTool?.(tool.id, { label: event.currentTarget.value })} />
                  <span class="manager-v2-muted">{text('FABRICATE.Admin.ManagerV2.Tools.LabelHint', 'Optional. Falls back to the component name.')}</span>
                </label>

                <div class="manager-v2-field">
                  <span>{text('FABRICATE.Admin.ManagerV2.Tools.ComponentLabel', 'Component')}</span>
                  <div class="manager-v2-tool-component-row"
                    use:dragDrop={{ onDrop: (data) => handleComponentDrop(tool, data), activeClass: 'is-drop-active' }}>
                    <button type="button"
                      class="manager-v2-gathering-task-identity manager-v2-drop-component-button"
                      title={text('FABRICATE.Admin.ManagerV2.Tools.ComponentChooseHint', 'Drop a component to assign.')}
                      oncontextmenu={(event) => { event.preventDefault(); onUpdateTool?.(tool.id, { componentId: null }); }}>
                      <img class="manager-v2-gathering-task-thumb" src={toolImage(tool)} alt="" />
                      <span class="manager-v2-system-copy">
                        <span class="manager-v2-system-name">{managedItem(tool.componentId)?.name || text('FABRICATE.Admin.ManagerV2.Tools.OverviewComponentMissing', 'Not set')}</span>
                      </span>
                    </button>
                    <select aria-label={text('FABRICATE.Admin.ManagerV2.Tools.ComponentLabel', 'Component')}
                      value={tool.componentId || ''}
                      onchange={(event) => onUpdateTool?.(tool.id, { componentId: event.currentTarget.value || null })}>
                      <option value="">{text('FABRICATE.Admin.ManagerV2.Tools.OverviewComponentMissing', 'Not set')}</option>
                      {#each managedItemOptions as item (item.id)}
                        <option value={item.id}>{item.name}</option>
                      {/each}
                    </select>
                  </div>
                </div>

                <fieldset class="manager-v2-tools-section">
                  <legend>{text('FABRICATE.Admin.ManagerV2.Tools.RequirementTitle', 'Requirement')}</legend>
                  {#if tool.requirement}
                    <ProviderExpressionInput
                      provider={tool.requirement.provider}
                      expression={tool.requirement.formula}
                      macroUuid={tool.requirement.macroUuid}
                      idPrefix={`tool-${tool.id}-requirement`}
                      providerLabelKey="FABRICATE.Admin.ManagerV2.Tools.RequirementProvider"
                      providerLabelFallback="Provider"
                      expressionLabelKey="FABRICATE.Admin.ManagerV2.Tools.RequirementExpression"
                      expressionLabelFallback="Expression"
                      macroUuidLabelKey="FABRICATE.Admin.ManagerV2.Tools.RequirementMacro"
                      macroUuidLabelFallback="Macro UUID"
                      onProviderChange={(value) => onUpdateTool?.(tool.id, { requirement: { ...tool.requirement, provider: value } })}
                      onExpressionChange={(value) => onUpdateTool?.(tool.id, { requirement: { ...tool.requirement, formula: value } })}
                      onMacroUuidChange={(value) => onUpdateTool?.(tool.id, { requirement: { ...tool.requirement, macroUuid: value } })}
                    />
                    <button type="button"
                      class="manager-v2-button"
                      onclick={() => onUpdateTool?.(tool.id, { requirement: null })}>
                      <i class="fas fa-xmark" aria-hidden="true"></i>
                      <span>{text('FABRICATE.Admin.ManagerV2.Tools.RequirementRemove', 'Remove requirement')}</span>
                    </button>
                  {:else}
                    <p class="manager-v2-muted">{text('FABRICATE.Admin.ManagerV2.Tools.RequirementHint', 'Optional expression that must be truthy for the actor to use this tool.')}</p>
                    <button type="button"
                      class="manager-v2-button"
                      onclick={() => onUpdateTool?.(tool.id, { requirement: defaultRequirement() })}>
                      <i class="fas fa-plus" aria-hidden="true"></i>
                      <span>{text('FABRICATE.Admin.ManagerV2.Tools.RequirementAdd', 'Add requirement')}</span>
                    </button>
                  {/if}
                </fieldset>

                <fieldset class="manager-v2-radio-group manager-v2-tools-section" role="radiogroup" aria-labelledby={`tool-${tool.id}-breakage-legend`}>
                  <legend id={`tool-${tool.id}-breakage-legend`} class="manager-v2-radio-group-legend">{text('FABRICATE.Admin.ManagerV2.Tools.BreakageTitle', 'Breakage mechanic')}</legend>
                  <div class="manager-v2-radio-options">
                    {#each [
                      { value: 'limitedUses', icon: 'fas fa-hashtag', labelKey: 'FABRICATE.Admin.ManagerV2.Tools.BreakageLimitedUses', labelFallback: 'Limited uses' },
                      { value: 'breakageChance', icon: 'fas fa-percent', labelKey: 'FABRICATE.Admin.ManagerV2.Tools.BreakageChance', labelFallback: 'Breakage chance' },
                      { value: 'diceExpression', icon: 'fas fa-dice-d20', labelKey: 'FABRICATE.Admin.ManagerV2.Tools.BreakageDice', labelFallback: 'Dice expression' }
                    ] as option (option.value)}
                      <label class={`manager-v2-radio-option ${tool.breakage?.mode === option.value ? 'is-selected' : ''}`}>
                        <input type="radio"
                          name={`tool-${tool.id}-breakage-mode`}
                          value={option.value}
                          checked={tool.breakage?.mode === option.value}
                          onchange={() => setBreakageMode(tool, option.value)} />
                        <i class={option.icon} aria-hidden="true"></i>
                        <span>{text(option.labelKey, option.labelFallback)}</span>
                      </label>
                    {/each}
                  </div>
                  {#if tool.breakage?.mode === 'limitedUses'}
                    <label class="manager-v2-field">
                      <span>{text('FABRICATE.Admin.ManagerV2.Tools.BreakageMaxUses', 'Maximum uses')}</span>
                      <input type="number"
                        min="1"
                        step="1"
                        placeholder={text('FABRICATE.Admin.ManagerV2.Tools.BreakageMaxUsesHint', 'Blank = unlimited')}
                        value={tool.breakage.maxUses ?? ''}
                        oninput={(event) => {
                          const raw = event.currentTarget.value;
                          const next = raw === '' ? null : Number(raw);
                          onUpdateTool?.(tool.id, { breakage: { mode: 'limitedUses', maxUses: next } });
                        }} />
                    </label>
                  {:else if tool.breakage?.mode === 'breakageChance'}
                    <label class="manager-v2-field">
                      <span>{text('FABRICATE.Admin.ManagerV2.Tools.BreakageChancePercent', 'Break chance (%)')}</span>
                      <span class={`manager-v2-drop-rate-control manager-v2-tool-breakage-slider ${dropRateTierClass(tool.breakage.breakageChance ?? 0)}`}
                        style={`--fab-drop-rate-value: ${tool.breakage.breakageChance ?? 0}%; --fab-drop-rate-color: ${dropRateTierColor(tool.breakage.breakageChance ?? 0)};`}>
                        <span class="manager-v2-drop-rate-track" aria-hidden="true">
                          <span class="manager-v2-drop-rate-fill"></span>
                        </span>
                        <input type="range"
                          min="0"
                          max="100"
                          step="1"
                          value={tool.breakage.breakageChance ?? 0}
                          oninput={(event) => onUpdateTool?.(tool.id, { breakage: { mode: 'breakageChance', breakageChance: Number(event.currentTarget.value) } })} />
                      </span>
                      <output>{tool.breakage.breakageChance ?? 0}%</output>
                    </label>
                  {:else if tool.breakage?.mode === 'diceExpression'}
                    <label class="manager-v2-field">
                      <span>{text('FABRICATE.Admin.ManagerV2.Tools.BreakageFormula', 'Formula')}</span>
                      <input type="text"
                        value={tool.breakage.formula || ''}
                        placeholder="1d20 + @abilities.str.mod"
                        oninput={(event) => onUpdateTool?.(tool.id, { breakage: { mode: 'diceExpression', formula: event.currentTarget.value, threshold: tool.breakage.threshold ?? 0 } })} />
                    </label>
                    <label class="manager-v2-field">
                      <span>{text('FABRICATE.Admin.ManagerV2.Tools.BreakageThreshold', 'Break below')}</span>
                      <input type="number"
                        step="1"
                        value={tool.breakage.threshold ?? 0}
                        oninput={(event) => onUpdateTool?.(tool.id, { breakage: { mode: 'diceExpression', formula: tool.breakage.formula || '', threshold: Number(event.currentTarget.value) } })} />
                    </label>
                  {/if}
                </fieldset>

                <fieldset class="manager-v2-radio-group manager-v2-tools-section" role="radiogroup" aria-labelledby={`tool-${tool.id}-on-break-legend`}>
                  <legend id={`tool-${tool.id}-on-break-legend`} class="manager-v2-radio-group-legend">{text('FABRICATE.Admin.ManagerV2.Tools.OnBreakTitle', 'On-break action')}</legend>
                  <div class="manager-v2-radio-options">
                    {#each [
                      { value: 'destroy', icon: 'fas fa-circle-xmark', labelKey: 'FABRICATE.Admin.ManagerV2.Tools.OnBreakDestroy', labelFallback: 'Destroy item' },
                      { value: 'flagBroken', icon: 'fas fa-shield-halved', labelKey: 'FABRICATE.Admin.ManagerV2.Tools.OnBreakFlag', labelFallback: 'Mark as broken' },
                      { value: 'replaceWith', icon: 'fas fa-right-left', labelKey: 'FABRICATE.Admin.ManagerV2.Tools.OnBreakReplace', labelFallback: 'Replace with item' }
                    ] as option (option.value)}
                      <label class={`manager-v2-radio-option ${tool.onBreak?.mode === option.value ? 'is-selected' : ''}`}>
                        <input type="radio"
                          name={`tool-${tool.id}-on-break-mode`}
                          value={option.value}
                          checked={tool.onBreak?.mode === option.value}
                          onchange={() => setOnBreakMode(tool, option.value)} />
                        <i class={option.icon} aria-hidden="true"></i>
                        <span>{text(option.labelKey, option.labelFallback)}</span>
                      </label>
                    {/each}
                  </div>
                  {#if tool.onBreak?.mode === 'replaceWith'}
                    <div class="manager-v2-field">
                      <span>{text('FABRICATE.Admin.ManagerV2.Tools.ReplacementComponent', 'Replacement component')}</span>
                      <div class="manager-v2-tool-component-row"
                        use:dragDrop={{ onDrop: (data) => handleReplacementDrop(tool, data), activeClass: 'is-drop-active' }}>
                        <button type="button"
                          class="manager-v2-gathering-task-identity manager-v2-drop-component-button"
                          oncontextmenu={(event) => { event.preventDefault(); onUpdateTool?.(tool.id, { onBreak: { mode: 'replaceWith', replacementComponentId: null } }); }}>
                          <img class="manager-v2-gathering-task-thumb" src={managedItem(tool.onBreak.replacementComponentId)?.img || 'icons/svg/item-bag.svg'} alt="" />
                          <span class="manager-v2-system-copy">
                            <span class="manager-v2-system-name">{managedItem(tool.onBreak.replacementComponentId)?.name || text('FABRICATE.Admin.ManagerV2.Tools.OverviewComponentMissing', 'Not set')}</span>
                          </span>
                        </button>
                        <select aria-label={text('FABRICATE.Admin.ManagerV2.Tools.ReplacementComponent', 'Replacement component')}
                          value={tool.onBreak.replacementComponentId || ''}
                          onchange={(event) => onUpdateTool?.(tool.id, { onBreak: { mode: 'replaceWith', replacementComponentId: event.currentTarget.value || null } })}>
                          <option value="">{text('FABRICATE.Admin.ManagerV2.Tools.OverviewComponentMissing', 'Not set')}</option>
                          {#each managedItemOptions as item (item.id)}
                            <option value={item.id}>{item.name}</option>
                          {/each}
                        </select>
                      </div>
                      {#if replacementSameAsComponent(tool)}
                        <span class="manager-v2-chip is-danger" role="alert">
                          <i class="fas fa-triangle-exclamation" aria-hidden="true"></i>
                          <span>{text('FABRICATE.Admin.ManagerV2.Tools.ReplacementSame', 'Replacement must differ from the tool component.')}</span>
                        </span>
                      {/if}
                    </div>
                  {/if}
                </fieldset>

                <div class="manager-v2-tools-row-editor-actions">
                  <button type="button"
                    class="manager-v2-button is-danger"
                    onclick={() => onDeleteTool?.(tool.id)}
                    data-manager-v2-tool-delete>
                    <i class="fas fa-trash" aria-hidden="true"></i>
                    <span>{text('FABRICATE.Admin.ManagerV2.Tools.Delete', 'Delete tool')}</span>
                  </button>
                </div>
              </div>
            {/if}
          </div>
        {/each}
        <button type="button"
          class="manager-v2-tools-empty-stub"
          onclick={() => onAddTool?.()}>
          <i class="fas fa-plus" aria-hidden="true"></i>
          <span>{text('FABRICATE.Admin.ManagerV2.Tools.Add', 'Add tool')}</span>
        </button>
      </div>
    {/if}
  </section>
</main>
