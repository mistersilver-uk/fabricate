<!-- Svelte 5 runes mode -->
<script>
  import { localize } from '../../util/foundryBridge.js';
  import ProviderExpressionInput from '../../components/ProviderExpressionInput.svelte';

  let {
    activeTaskTools = [],
    managedItemOptions = [],
    sectionOpen = true,
    sectionSummary = '',
    sectionInvalid = false,
    setSectionOpen,
    addTool,
    updateTool,
    deleteTool,
    toolField,
    fieldInvalid,
    fieldDescribedBy,
    fieldErrors,
    fieldErrorId
  } = $props();

  const managedItemMap = $derived(new Map((Array.isArray(managedItemOptions) ? managedItemOptions : []).map(item => [item.id, item])));

  function selectedItem(componentId) {
    return managedItemMap.get(componentId) || null;
  }

  function defaultRequirement() {
    return { provider: 'dnd5e', formula: '', macroUuid: '' };
  }

  function withRequirement(tool, mutate) {
    const requirement = tool.requirement
      ? { ...tool.requirement }
      : defaultRequirement();
    mutate(requirement);
    return { requirement };
  }

  function clearRequirement() {
    return { requirement: null };
  }

  function modeBreakage(mode) {
    if (mode === 'limitedUses') return { mode, maxUses: null };
    if (mode === 'breakageChance') return { mode, breakageChance: 0 };
    return { mode: 'diceExpression', formula: '', threshold: 0 };
  }

  function modeOnBreak(mode) {
    if (mode === 'replaceWith') return { mode, replacementComponentId: null };
    return { mode };
  }
</script>

<section
  class="environment-catalyst-authoring"
  aria-label={localize('FABRICATE.Admin.Environments.Tools')}
  data-environment-invalid={sectionInvalid ? 'true' : undefined}
>
  <details open={sectionOpen} ontoggle={(event) => setSectionOpen?.(event.currentTarget.open)}>
    <summary class="environment-task-header">
      <h5>{localize('FABRICATE.Admin.Environments.Tools')}</h5>
      <span class="hint">{sectionSummary}</span>
      {#if sectionInvalid}
        <span class="badge badge-disabled">{localize('FABRICATE.Admin.Environments.Invalid')}</span>
      {/if}
    </summary>
    <div class="environment-task-header">
      <button type="button" onclick={addTool}>
        <i class="fas fa-plus"></i> {localize('FABRICATE.Admin.Environments.AddTool')}
      </button>
    </div>

    {#if activeTaskTools.length > 0}
      <div class="environment-catalyst-table" role="table" aria-label={localize('FABRICATE.Admin.Environments.Tools')}>
        {#each activeTaskTools as tool, toolIndex}
          <div class="environment-catalyst-row" role="row">
            <div class="environment-selected-item">
              <img class="environment-selected-item-img" src={selectedItem(tool.componentId)?.img || 'icons/svg/item-bag.svg'} alt="" />
              <div>
                <span class="environment-selected-item-name">{selectedItem(tool.componentId)?.name || localize('FABRICATE.Admin.Environments.NoManagedItemSelected')}</span>
                <span class="environment-selected-item-meta">{localize('FABRICATE.Admin.Environments.ToolComponent')}</span>
              </div>
            </div>

            <label class="form-group environment-result-component">
              <span>{localize('FABRICATE.Admin.Environments.ToolComponent')}</span>
              <select
                value={tool.componentId || ''}
                data-environment-field={toolField(toolIndex, 'componentId')}
                aria-invalid={fieldInvalid(toolField(toolIndex, 'componentId'))}
                aria-describedby={fieldDescribedBy(toolField(toolIndex, 'componentId'))}
                onchange={(event) => updateTool(toolIndex, { componentId: event.target.value })}
              >
                <option value="">{localize('FABRICATE.Admin.Environments.NoManagedItemSelected')}</option>
                {#each managedItemOptions as item (item.id)}
                  <option value={item.id}>{item.name}</option>
                {/each}
              </select>
              {#if fieldErrors(toolField(toolIndex, 'componentId')).length > 0}
                <span class="environment-field-error" id={fieldErrorId(toolField(toolIndex, 'componentId'))}>{fieldErrors(toolField(toolIndex, 'componentId'))[0].message}</span>
              {/if}
            </label>

            <fieldset class="environment-tool-requirement">
              <legend>{localize('FABRICATE.Admin.Environments.ToolRequirement')}</legend>
              {#if tool.requirement}
                <ProviderExpressionInput
                  provider={tool.requirement.provider}
                  expression={tool.requirement.formula}
                  macroUuid={tool.requirement.macroUuid}
                  idPrefix={`tool-${toolIndex}-requirement`}
                  expressionLabelKey="FABRICATE.Admin.Environments.ToolRequirement"
                  expressionLabelFallback="Requirement expression"
                  onProviderChange={(value) => updateTool(toolIndex, withRequirement(tool, r => { r.provider = value; }))}
                  onExpressionChange={(value) => updateTool(toolIndex, withRequirement(tool, r => { r.formula = value; }))}
                  onMacroUuidChange={(value) => updateTool(toolIndex, withRequirement(tool, r => { r.macroUuid = value; }))}
                />
                <button type="button" class="btn-link" onclick={() => updateTool(toolIndex, clearRequirement())}>
                  {localize('FABRICATE.Admin.Environments.ToolRequirementRemove')}
                </button>
              {:else}
                <p class="hint">{localize('FABRICATE.Admin.Environments.ToolRequirementHint')}</p>
                <button type="button" onclick={() => updateTool(toolIndex, { requirement: defaultRequirement() })}>
                  <i class="fas fa-plus"></i> {localize('FABRICATE.Admin.Environments.ToolRequirementAdd')}
                </button>
              {/if}
            </fieldset>

            <fieldset class="environment-tool-breakage">
              <legend>{localize('FABRICATE.Admin.Environments.ToolBreakageMode')}</legend>
              <div class="environment-tool-breakage-modes" role="radiogroup">
                <label class="checkbox-label">
                  <input
                    type="radio"
                    name={`tool-${toolIndex}-breakage-mode`}
                    checked={tool.breakage?.mode === 'limitedUses'}
                    onchange={() => updateTool(toolIndex, { breakage: modeBreakage('limitedUses') })}
                  />
                  <span>{localize('FABRICATE.Admin.Environments.ToolBreakageLimitedUses')}</span>
                </label>
                <label class="checkbox-label">
                  <input
                    type="radio"
                    name={`tool-${toolIndex}-breakage-mode`}
                    checked={tool.breakage?.mode === 'breakageChance'}
                    onchange={() => updateTool(toolIndex, { breakage: modeBreakage('breakageChance') })}
                  />
                  <span>{localize('FABRICATE.Admin.Environments.ToolBreakageChance')}</span>
                </label>
                <label class="checkbox-label">
                  <input
                    type="radio"
                    name={`tool-${toolIndex}-breakage-mode`}
                    checked={tool.breakage?.mode === 'diceExpression'}
                    onchange={() => updateTool(toolIndex, { breakage: modeBreakage('diceExpression') })}
                  />
                  <span>{localize('FABRICATE.Admin.Environments.ToolBreakageDice')}</span>
                </label>
              </div>

              {#if tool.breakage?.mode === 'limitedUses'}
                <label class="form-group">
                  <span>{localize('FABRICATE.Admin.Environments.ToolMaxUses')}</span>
                  <input
                    type="number"
                    min="1"
                    step="1"
                    placeholder={localize('FABRICATE.Admin.Environments.CatalystMaxUsesUnlimited')}
                    value={tool.breakage.maxUses ?? ''}
                    data-environment-field={toolField(toolIndex, 'breakage.maxUses')}
                    aria-invalid={fieldInvalid(toolField(toolIndex, 'breakage.maxUses'))}
                    oninput={(event) => updateTool(toolIndex, { breakage: { mode: 'limitedUses', maxUses: event.target.value === '' ? null : Number(event.target.value) } })}
                  />
                  {#if fieldErrors(toolField(toolIndex, 'breakage.maxUses')).length > 0}
                    <span class="environment-field-error">{fieldErrors(toolField(toolIndex, 'breakage.maxUses'))[0].message}</span>
                  {/if}
                </label>
              {:else if tool.breakage?.mode === 'breakageChance'}
                <label class="form-group">
                  <span>{localize('FABRICATE.Admin.Environments.ToolBreakageChancePercent')}</span>
                  <div class="environment-tool-breakage-slider">
                    <input
                      type="range"
                      min="0"
                      max="100"
                      step="1"
                      value={tool.breakage.breakageChance ?? 0}
                      data-environment-field={toolField(toolIndex, 'breakage.breakageChance')}
                      oninput={(event) => updateTool(toolIndex, { breakage: { mode: 'breakageChance', breakageChance: Number(event.target.value) } })}
                    />
                    <output>{tool.breakage.breakageChance ?? 0}%</output>
                  </div>
                  {#if fieldErrors(toolField(toolIndex, 'breakage.breakageChance')).length > 0}
                    <span class="environment-field-error">{fieldErrors(toolField(toolIndex, 'breakage.breakageChance'))[0].message}</span>
                  {/if}
                </label>
              {:else if tool.breakage?.mode === 'diceExpression'}
                <label class="form-group">
                  <span>{localize('FABRICATE.Admin.Environments.ToolBreakageFormula')}</span>
                  <input
                    type="text"
                    value={tool.breakage.formula ?? ''}
                    placeholder="1d20 + @abilities.str.mod"
                    data-environment-field={toolField(toolIndex, 'breakage.formula')}
                    aria-invalid={fieldInvalid(toolField(toolIndex, 'breakage.formula'))}
                    oninput={(event) => updateTool(toolIndex, { breakage: { mode: 'diceExpression', formula: event.target.value, threshold: tool.breakage.threshold ?? 0 } })}
                  />
                  {#if fieldErrors(toolField(toolIndex, 'breakage.formula')).length > 0}
                    <span class="environment-field-error">{fieldErrors(toolField(toolIndex, 'breakage.formula'))[0].message}</span>
                  {/if}
                </label>
                <label class="form-group">
                  <span>{localize('FABRICATE.Admin.Environments.ToolBreakageThreshold')}</span>
                  <input
                    type="number"
                    step="1"
                    value={tool.breakage.threshold ?? 0}
                    data-environment-field={toolField(toolIndex, 'breakage.threshold')}
                    oninput={(event) => updateTool(toolIndex, { breakage: { mode: 'diceExpression', formula: tool.breakage.formula ?? '', threshold: Number(event.target.value) } })}
                  />
                </label>
              {/if}
            </fieldset>

            <fieldset class="environment-tool-on-break">
              <legend>{localize('FABRICATE.Admin.Environments.ToolOnBreak')}</legend>
              <div role="radiogroup">
                <label class="checkbox-label">
                  <input
                    type="radio"
                    name={`tool-${toolIndex}-on-break`}
                    checked={tool.onBreak?.mode === 'destroy'}
                    onchange={() => updateTool(toolIndex, { onBreak: modeOnBreak('destroy') })}
                  />
                  <span>{localize('FABRICATE.Admin.Environments.ToolOnBreakDestroy')}</span>
                </label>
                <label class="checkbox-label">
                  <input
                    type="radio"
                    name={`tool-${toolIndex}-on-break`}
                    checked={tool.onBreak?.mode === 'flagBroken'}
                    onchange={() => updateTool(toolIndex, { onBreak: modeOnBreak('flagBroken') })}
                  />
                  <span>{localize('FABRICATE.Admin.Environments.ToolOnBreakFlag')}</span>
                </label>
                <label class="checkbox-label">
                  <input
                    type="radio"
                    name={`tool-${toolIndex}-on-break`}
                    checked={tool.onBreak?.mode === 'replaceWith'}
                    onchange={() => updateTool(toolIndex, { onBreak: modeOnBreak('replaceWith') })}
                  />
                  <span>{localize('FABRICATE.Admin.Environments.ToolOnBreakReplace')}</span>
                </label>
              </div>
              {#if tool.onBreak?.mode === 'replaceWith'}
                <label class="form-group">
                  <span>{localize('FABRICATE.Admin.Environments.ToolReplacementComponent')}</span>
                  <select
                    value={tool.onBreak.replacementComponentId || ''}
                    data-environment-field={toolField(toolIndex, 'onBreak.replacementComponentId')}
                    aria-invalid={fieldInvalid(toolField(toolIndex, 'onBreak.replacementComponentId'))}
                    onchange={(event) => updateTool(toolIndex, { onBreak: { mode: 'replaceWith', replacementComponentId: event.target.value || null } })}
                  >
                    <option value="">{localize('FABRICATE.Admin.Environments.NoManagedItemSelected')}</option>
                    {#each managedItemOptions as item (item.id)}
                      <option value={item.id}>{item.name}</option>
                    {/each}
                  </select>
                  {#if fieldErrors(toolField(toolIndex, 'onBreak.replacementComponentId')).length > 0}
                    <span class="environment-field-error">{fieldErrors(toolField(toolIndex, 'onBreak.replacementComponentId'))[0].message}</span>
                  {/if}
                </label>
              {/if}
            </fieldset>

            <div class="environment-row-actions">
              <button
                type="button"
                class="btn-icon btn-danger"
                onclick={() => deleteTool(toolIndex)}
                title={localize('FABRICATE.Admin.Environments.DeleteTool')}
                aria-label={localize('FABRICATE.Admin.Environments.DeleteTool')}
              >
                <i class="fas fa-trash"></i>
              </button>
            </div>
          </div>
        {/each}
      </div>
    {:else}
      <div class="environment-empty-action compact">
        <i class="fas fa-screwdriver-wrench" aria-hidden="true"></i>
        <div>
          <strong>{localize('FABRICATE.Admin.Environments.NoTools')}</strong>
          <p>{localize('FABRICATE.Admin.Environments.NoToolsHint')}</p>
        </div>
        <button type="button" data-environment-empty-action="add-tool" onclick={addTool}>
          <i class="fas fa-plus"></i> {localize('FABRICATE.Admin.Environments.AddTool')}
        </button>
      </div>
    {/if}
  </details>
</section>
