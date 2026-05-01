<!-- Svelte 5 runes mode -->
<script>
  import { localize } from '../../util/foundryBridge.js';

  let {
    activeTaskResultSelection = null,
    scriptMacroOptions = [],
    rollTableOptions = [],
    selectedResultSelectionMacroMissing = false,
    selectedRollTableMissing = false,
    sectionOpen = true,
    sectionSummary = '',
    sectionInvalid = false,
    setSectionOpen,
    updateResultSelection,
    taskField,
    fieldInvalid,
    fieldDescribedBy,
    fieldErrors,
    fieldErrorId
  } = $props();

  const rollTableOptionList = $derived(Array.isArray(rollTableOptions) ? rollTableOptions : []);
</script>

<section class="environment-resolution-authoring" aria-label={localize('FABRICATE.Admin.Environments.ResultSelection')} data-environment-invalid={sectionInvalid ? 'true' : undefined}>
  <details open={sectionOpen} ontoggle={(event) => setSectionOpen?.(event.currentTarget.open)}>
    <summary class="environment-task-header">
      <h5>{localize('FABRICATE.Admin.Environments.ResultSelection')}</h5>
      <span class="hint">{sectionSummary}</span>
      {#if sectionInvalid}
        <span class="badge badge-disabled">{localize('FABRICATE.Admin.Environments.Invalid')}</span>
      {/if}
    </summary>
    <div class="environment-fields environment-resolution-fields">
      <label class="form-group">
        <span>{localize('FABRICATE.Admin.Environments.ResultSelectionProvider')}</span>
        <select
          value={activeTaskResultSelection?.provider || 'macroOutcome'}
          data-environment-field={taskField('resultSelection.provider')}
          aria-invalid={fieldInvalid(taskField('resultSelection.provider'))}
          aria-describedby={fieldDescribedBy(taskField('resultSelection.provider'))}
          onchange={(event) => updateResultSelection({ provider: event.target.value })}
        >
          <option value="macroOutcome">{localize('FABRICATE.Admin.Environments.ResultSelectionProviderMacro')}</option>
          <option value="rollTableOutcome">{localize('FABRICATE.Admin.Environments.ResultSelectionProviderRollTable')}</option>
        </select>
        {#if fieldErrors(taskField('resultSelection.provider')).length > 0}
          <span class="environment-field-error" id={fieldErrorId(taskField('resultSelection.provider'))}>{fieldErrors(taskField('resultSelection.provider'))[0].message}</span>
        {/if}
      </label>

      {#if activeTaskResultSelection?.provider === 'rollTableOutcome'}
        <label class="form-group span-2">
          <span>{localize('FABRICATE.Admin.Environments.RollTableUuid')}</span>
          <div class="environment-assisted-field">
            <select
              value={activeTaskResultSelection?.rollTableUuid || ''}
              aria-label={localize('FABRICATE.Admin.Environments.RollTableSelect')}
              aria-describedby={selectedRollTableMissing ? 'environment-roll-table-reference-warning' : undefined}
              onchange={(event) => updateResultSelection({ provider: 'rollTableOutcome', rollTableUuid: event.target.value })}
            >
              <option value="">{localize('FABRICATE.Admin.Environments.NoRollTableSelected')}</option>
              {#if selectedRollTableMissing}
                <option value={activeTaskResultSelection.rollTableUuid}>{localize('FABRICATE.Admin.Environments.MissingReferenceOption', { uuid: activeTaskResultSelection.rollTableUuid })}</option>
              {/if}
              {#each rollTableOptionList as table (table.uuid)}
                <option value={table.uuid}>{table.name}</option>
              {/each}
            </select>
            <input
              type="text"
              name="rollTableUuid"
              value={activeTaskResultSelection?.rollTableUuid || ''}
              placeholder="RollTable.xxxxxxxxxxxx"
              data-environment-field={taskField('resultSelection.rollTableUuid')}
              aria-invalid={fieldInvalid(taskField('resultSelection.rollTableUuid'))}
              aria-describedby={fieldDescribedBy(taskField('resultSelection.rollTableUuid'), selectedRollTableMissing ? 'environment-roll-table-reference-warning' : '')}
              oninput={(event) => updateResultSelection({ provider: 'rollTableOutcome', rollTableUuid: event.target.value })}
            />
          </div>
          {#if selectedRollTableMissing}
            <span class="environment-stale-warning" id="environment-roll-table-reference-warning">
              {localize('FABRICATE.Admin.Environments.MissingRollTableReferenceWarning')}
            </span>
          {/if}
          {#if fieldErrors(taskField('resultSelection.rollTableUuid')).length > 0}
            <span class="environment-field-error" id={fieldErrorId(taskField('resultSelection.rollTableUuid'))}>{fieldErrors(taskField('resultSelection.rollTableUuid'))[0].message}</span>
          {/if}
        </label>
        <p class="hint span-2">{localize('FABRICATE.Admin.Environments.RollTableHint')}</p>
      {:else}
        <label class="form-group span-2">
          <span>{localize('FABRICATE.Admin.Environments.ResultSelectionMacro')}</span>
          <select
            value={activeTaskResultSelection?.macroUuid || ''}
            data-environment-field={taskField('resultSelection.macroUuid')}
            aria-invalid={fieldInvalid(taskField('resultSelection.macroUuid'))}
            aria-describedby={fieldDescribedBy(taskField('resultSelection.macroUuid'), selectedResultSelectionMacroMissing ? 'environment-result-selection-macro-reference-warning' : '')}
            onchange={(event) => updateResultSelection({ provider: 'macroOutcome', macroUuid: event.target.value })}
          >
            <option value="">{localize('FABRICATE.Admin.Environments.NoMacroSelected')}</option>
            {#if selectedResultSelectionMacroMissing}
              <option value={activeTaskResultSelection.macroUuid}>{activeTaskResultSelection.macroUuid}</option>
            {/if}
            {#each scriptMacroOptions as macro (macro.uuid)}
              <option value={macro.uuid}>{macro.name}</option>
            {/each}
          </select>
          {#if selectedResultSelectionMacroMissing}
            <span class="environment-stale-warning" id="environment-result-selection-macro-reference-warning">
              {localize('FABRICATE.Admin.Environments.MissingMacroReferenceWarning')}
            </span>
          {/if}
          {#if fieldErrors(taskField('resultSelection.macroUuid')).length > 0}
            <span class="environment-field-error" id={fieldErrorId(taskField('resultSelection.macroUuid'))}>{fieldErrors(taskField('resultSelection.macroUuid'))[0].message}</span>
          {/if}
        </label>
      {/if}
    </div>
  </details>
</section>
