<!-- Svelte 5 runes mode -->
<script>
  import { localize } from '../../util/foundryBridge.js';

  let {
    activeTaskProgressive = null,
    activeTaskCheck = null,
    scriptMacroOptions = [],
    selectedCheckMacroMissing = false,
    sectionOpen = true,
    sectionSummary = '',
    sectionInvalid = false,
    setSectionOpen,
    updateProgressive,
    updateCheck,
    taskField,
    fieldInvalid,
    fieldDescribedBy,
    fieldErrors,
    fieldErrorId
  } = $props();
</script>

<section class="environment-progressive-authoring" aria-label={localize('FABRICATE.Admin.Environments.Check')} data-environment-invalid={sectionInvalid ? 'true' : undefined}>
  <details open={sectionOpen} ontoggle={(event) => setSectionOpen?.(event.currentTarget.open)}>
    <summary class="environment-task-header">
      <h5>{localize('FABRICATE.Admin.Environments.Check')}</h5>
      <span class="hint">{sectionSummary}</span>
      {#if sectionInvalid}
        <span class="badge badge-disabled">{localize('FABRICATE.Admin.Environments.Invalid')}</span>
      {/if}
    </summary>
    <div class="environment-fields environment-progressive-fields">
      <label class="form-group">
        <span>{localize('FABRICATE.Admin.Environments.ProgressiveAwardMode')}</span>
        <select
          value={activeTaskProgressive?.awardMode || 'equal'}
          data-environment-field={taskField('progressive.awardMode')}
          aria-invalid={fieldInvalid(taskField('progressive.awardMode'))}
          aria-describedby={fieldDescribedBy(taskField('progressive.awardMode'))}
          onchange={(event) => updateProgressive({ awardMode: event.target.value })}
        >
          <option value="equal">{localize('FABRICATE.Admin.Environments.ProgressiveAwardEqual')}</option>
          <option value="partial">{localize('FABRICATE.Admin.Environments.ProgressiveAwardPartial')}</option>
          <option value="exceed">{localize('FABRICATE.Admin.Environments.ProgressiveAwardExceed')}</option>
        </select>
        {#if fieldErrors(taskField('progressive.awardMode')).length > 0}
          <span class="environment-field-error" id={fieldErrorId(taskField('progressive.awardMode'))}>{fieldErrors(taskField('progressive.awardMode'))[0].message}</span>
        {/if}
      </label>
      <label class="form-group">
        <span>{localize('FABRICATE.Admin.Environments.CheckProvider')}</span>
        <select
          value={activeTaskCheck?.provider || 'macro'}
          data-environment-field={taskField('check.provider')}
          aria-invalid={fieldInvalid(taskField('check.provider'))}
          aria-describedby={fieldDescribedBy(taskField('check.provider'))}
          onchange={(event) => updateCheck({ provider: event.target.value })}
        >
          <option value="macro">{localize('FABRICATE.Admin.Environments.CheckProviderMacro')}</option>
          <option value="dnd5e">{localize('FABRICATE.Admin.Environments.CheckProviderDnd5e')}</option>
          <option value="pf2e">{localize('FABRICATE.Admin.Environments.CheckProviderPf2e')}</option>
        </select>
        {#if fieldErrors(taskField('check.provider')).length > 0}
          <span class="environment-field-error" id={fieldErrorId(taskField('check.provider'))}>{fieldErrors(taskField('check.provider'))[0].message}</span>
        {/if}
      </label>

      {#if activeTaskCheck?.provider === 'dnd5e' || activeTaskCheck?.provider === 'pf2e'}
        <label class="form-group">
          <span>{localize('FABRICATE.Admin.Environments.CheckFormula')}</span>
          <input
            type="text"
            value={activeTaskCheck?.formula || ''}
            data-environment-field={taskField('check.formula')}
            aria-invalid={fieldInvalid(taskField('check.formula'))}
            aria-describedby={fieldDescribedBy(taskField('check.formula'))}
            oninput={(event) => updateCheck({ provider: activeTaskCheck?.provider || 'dnd5e', formula: event.target.value })}
          />
          {#if fieldErrors(taskField('check.formula')).length > 0}
            <span class="environment-field-error" id={fieldErrorId(taskField('check.formula'))}>{fieldErrors(taskField('check.formula'))[0].message}</span>
          {/if}
        </label>
        <label class="form-group">
          <span>{localize('FABRICATE.Admin.Environments.CheckThreshold')}</span>
          <input
            type="text"
            value={activeTaskCheck?.threshold || ''}
            placeholder={localize('FABRICATE.Admin.Environments.CheckThresholdOptional')}
            data-environment-field={taskField('check.threshold')}
            aria-invalid={fieldInvalid(taskField('check.threshold'))}
            aria-describedby={fieldDescribedBy(taskField('check.threshold'))}
            oninput={(event) => updateCheck({ provider: activeTaskCheck?.provider || 'dnd5e', threshold: event.target.value })}
          />
          {#if fieldErrors(taskField('check.threshold')).length > 0}
            <span class="environment-field-error" id={fieldErrorId(taskField('check.threshold'))}>{fieldErrors(taskField('check.threshold'))[0].message}</span>
          {/if}
        </label>
      {:else}
        <label class="form-group span-2">
          <span>{localize('FABRICATE.Admin.Environments.CheckMacro')}</span>
          <select
            value={activeTaskCheck?.macroUuid || ''}
            data-environment-field={taskField('check.macroUuid')}
            aria-invalid={fieldInvalid(taskField('check.macroUuid'))}
            aria-describedby={fieldDescribedBy(taskField('check.macroUuid'), selectedCheckMacroMissing ? 'environment-check-macro-reference-warning' : '')}
            onchange={(event) => updateCheck({ provider: 'macro', macroUuid: event.target.value })}
          >
            <option value="">{localize('FABRICATE.Admin.Environments.NoMacroSelected')}</option>
            {#if selectedCheckMacroMissing}
              <option value={activeTaskCheck.macroUuid}>{activeTaskCheck.macroUuid}</option>
            {/if}
            {#each scriptMacroOptions as macro (macro.uuid)}
              <option value={macro.uuid}>{macro.name}</option>
            {/each}
          </select>
          {#if selectedCheckMacroMissing}
            <span class="environment-stale-warning" id="environment-check-macro-reference-warning">
              {localize('FABRICATE.Admin.Environments.MissingMacroReferenceWarning')}
            </span>
          {/if}
          {#if fieldErrors(taskField('check.macroUuid')).length > 0}
            <span class="environment-field-error" id={fieldErrorId(taskField('check.macroUuid'))}>{fieldErrors(taskField('check.macroUuid'))[0].message}</span>
          {/if}
        </label>
      {/if}
    </div>
  </details>
</section>
