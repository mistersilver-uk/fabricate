<!-- Svelte 5 runes mode -->
<script>
  import { localize } from '../../util/foundryBridge.js';

  let {
    activeTaskFailureOutcome = null,
    scriptMacroOptions = [],
    selectedFailureMacroMissing = false,
    sectionOpen = true,
    sectionSummary = '',
    sectionInvalid = false,
    setSectionOpen,
    toggleFailureOutcome,
    updateFailureOutcome,
    taskField,
    fieldInvalid,
    fieldDescribedBy,
    fieldErrors,
    fieldErrorId
  } = $props();
</script>

<section class="environment-failure-authoring" aria-label={localize('FABRICATE.Admin.Environments.FailureOutcome')} data-environment-invalid={sectionInvalid ? 'true' : undefined}>
  <details open={sectionOpen} ontoggle={(event) => setSectionOpen?.(event.currentTarget.open)}>
    <summary class="environment-task-header">
      <h5>{localize('FABRICATE.Admin.Environments.FailureOutcome')}</h5>
      <span class="hint">{sectionSummary}</span>
      {#if sectionInvalid}
        <span class="badge badge-disabled">{localize('FABRICATE.Admin.Environments.Invalid')}</span>
      {/if}
    </summary>
    <label class="checkbox-label">
      <input
        type="checkbox"
        checked={Boolean(activeTaskFailureOutcome)}
        onchange={(event) => toggleFailureOutcome(event.target.checked)}
      />
      {localize('FABRICATE.Admin.Environments.CustomFailureOutcome')}
    </label>

    {#if activeTaskFailureOutcome}
      <div class="environment-fields environment-failure-fields">
        <label class="form-group">
          <span>{localize('FABRICATE.Admin.Environments.FailureOutcomeMode')}</span>
          <select
            value={activeTaskFailureOutcome.mode || 'text'}
            data-environment-field={taskField('failureOutcome.mode')}
            aria-invalid={fieldInvalid(taskField('failureOutcome.mode'))}
            aria-describedby={fieldDescribedBy(taskField('failureOutcome.mode'))}
            onchange={(event) => updateFailureOutcome({ mode: event.target.value })}
          >
            <option value="text">{localize('FABRICATE.Admin.Environments.FailureOutcomeText')}</option>
            <option value="macro">{localize('FABRICATE.Admin.Environments.FailureOutcomeMacro')}</option>
          </select>
          {#if fieldErrors(taskField('failureOutcome.mode')).length > 0}
            <span class="environment-field-error" id={fieldErrorId(taskField('failureOutcome.mode'))}>{fieldErrors(taskField('failureOutcome.mode'))[0].message}</span>
          {/if}
        </label>

        {#if activeTaskFailureOutcome.mode === 'macro'}
          <label class="form-group span-2">
            <span>{localize('FABRICATE.Admin.Environments.FailureOutcomeMacroUuid')}</span>
            <select
              value={activeTaskFailureOutcome.macroUuid || ''}
              data-environment-field={taskField('failureOutcome.macroUuid')}
              aria-invalid={fieldInvalid(taskField('failureOutcome.macroUuid'))}
              aria-describedby={fieldDescribedBy(taskField('failureOutcome.macroUuid'), selectedFailureMacroMissing ? 'environment-failure-macro-reference-warning' : '')}
              onchange={(event) => updateFailureOutcome({ mode: 'macro', macroUuid: event.target.value })}
            >
              <option value="">{localize('FABRICATE.Admin.Environments.NoMacroSelected')}</option>
              {#if selectedFailureMacroMissing}
                <option value={activeTaskFailureOutcome.macroUuid}>{activeTaskFailureOutcome.macroUuid}</option>
              {/if}
              {#each scriptMacroOptions as macro (macro.uuid)}
                <option value={macro.uuid}>{macro.name}</option>
              {/each}
            </select>
            {#if selectedFailureMacroMissing}
              <span class="environment-stale-warning" id="environment-failure-macro-reference-warning">
                {localize('FABRICATE.Admin.Environments.MissingMacroReferenceWarning')}
              </span>
            {/if}
            {#if fieldErrors(taskField('failureOutcome.macroUuid')).length > 0}
              <span class="environment-field-error" id={fieldErrorId(taskField('failureOutcome.macroUuid'))}>{fieldErrors(taskField('failureOutcome.macroUuid'))[0].message}</span>
            {/if}
          </label>
        {:else}
          <label class="form-group span-2">
            <span>{localize('FABRICATE.Admin.Environments.FailureOutcomeTextValue')}</span>
            <textarea
              rows="2"
              value={activeTaskFailureOutcome.text || ''}
              data-environment-field={taskField('failureOutcome.text')}
              aria-invalid={fieldInvalid(taskField('failureOutcome.text'))}
              aria-describedby={fieldDescribedBy(taskField('failureOutcome.text'))}
              oninput={(event) => updateFailureOutcome({ mode: 'text', text: event.target.value })}
            ></textarea>
            {#if fieldErrors(taskField('failureOutcome.text')).length > 0}
              <span class="environment-field-error" id={fieldErrorId(taskField('failureOutcome.text'))}>{fieldErrors(taskField('failureOutcome.text'))[0].message}</span>
            {/if}
          </label>
        {/if}
        <p class="hint span-2">{localize('FABRICATE.Admin.Environments.FailureOutcomeHint')}</p>
      </div>
    {:else}
      <p class="hint">{localize('FABRICATE.Admin.Environments.DefaultFailureOutcomeHint')}</p>
    {/if}
  </details>
</section>
