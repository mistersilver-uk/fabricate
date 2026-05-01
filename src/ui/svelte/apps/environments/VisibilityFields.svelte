<!-- Svelte 5 runes mode -->
<script>
  import { localize } from '../../util/foundryBridge.js';

  let {
    editorVisibility = null,
    scriptMacroOptions = [],
    selectedVisibilityMacroMissing = false,
    sectionOpen = true,
    sectionSummary = '',
    sectionInvalid = false,
    setSectionOpen,
    toggleVisibility,
    updateVisibilityProvider,
    updateVisibilityField,
    taskField,
    fieldInvalid,
    fieldDescribedBy,
    fieldErrors,
    fieldErrorId
  } = $props();
</script>

<section class="environment-visibility-authoring" aria-label={localize('FABRICATE.Admin.Environments.Visibility')} data-environment-invalid={sectionInvalid ? 'true' : undefined}>
  <details open={sectionOpen} ontoggle={(event) => setSectionOpen?.(event.currentTarget.open)}>
    <summary class="environment-task-header">
      <h5>{localize('FABRICATE.Admin.Environments.Visibility')}</h5>
      <span class="hint">{sectionSummary}</span>
      {#if sectionInvalid}
        <span class="badge badge-disabled">{localize('FABRICATE.Admin.Environments.Invalid')}</span>
      {/if}
    </summary>
    <label class="checkbox-label">
      <input
        type="checkbox"
        checked={Boolean(editorVisibility)}
        onchange={(event) => toggleVisibility(event.target.checked)}
      />
      {localize('FABRICATE.Admin.Environments.VisibilityEnabled')}
    </label>

    {#if editorVisibility}
      <div class="environment-fields environment-visibility-fields">
        <label class="form-group">
          <span>{localize('FABRICATE.Admin.Environments.VisibilityProvider')}</span>
          <select
            value={editorVisibility.provider || 'macro'}
            data-environment-field={taskField('visibility.provider')}
            aria-invalid={fieldInvalid(taskField('visibility.provider'))}
            aria-describedby={fieldDescribedBy(taskField('visibility.provider'))}
            onchange={(event) => updateVisibilityProvider(event.target.value)}
          >
            <option value="macro">{localize('FABRICATE.Admin.Environments.VisibilityProviderMacro')}</option>
            <option value="dnd5e">{localize('FABRICATE.Admin.Environments.VisibilityProviderDnd5e')}</option>
            <option value="pf2e">{localize('FABRICATE.Admin.Environments.VisibilityProviderPf2e')}</option>
          </select>
          {#if fieldErrors(taskField('visibility.provider')).length > 0}
            <span class="environment-field-error" id={fieldErrorId(taskField('visibility.provider'))}>{fieldErrors(taskField('visibility.provider'))[0].message}</span>
          {/if}
        </label>

        {#if editorVisibility.provider === 'dnd5e' || editorVisibility.provider === 'pf2e'}
          <label class="form-group">
            <span>{localize('FABRICATE.Admin.Environments.VisibilityFormula')}</span>
            <input
              type="text"
              value={editorVisibility.formula || ''}
              data-environment-field={taskField('visibility.formula')}
              aria-invalid={fieldInvalid(taskField('visibility.formula'))}
              aria-describedby={fieldDescribedBy(taskField('visibility.formula'))}
              oninput={(event) => updateVisibilityField('formula', event.target.value)}
            />
            {#if fieldErrors(taskField('visibility.formula')).length > 0}
              <span class="environment-field-error" id={fieldErrorId(taskField('visibility.formula'))}>{fieldErrors(taskField('visibility.formula'))[0].message}</span>
            {/if}
          </label>
          <label class="form-group span-2">
            <span>{localize('FABRICATE.Admin.Environments.VisibilityThreshold')}</span>
            <input
              type="text"
              value={editorVisibility.threshold || ''}
              data-environment-field={taskField('visibility.threshold')}
              aria-invalid={fieldInvalid(taskField('visibility.threshold'))}
              aria-describedby={fieldDescribedBy(taskField('visibility.threshold'))}
              oninput={(event) => updateVisibilityField('threshold', event.target.value)}
            />
            {#if fieldErrors(taskField('visibility.threshold')).length > 0}
              <span class="environment-field-error" id={fieldErrorId(taskField('visibility.threshold'))}>{fieldErrors(taskField('visibility.threshold'))[0].message}</span>
            {/if}
          </label>
        {:else}
          <label class="form-group span-2">
            <span>{localize('FABRICATE.Admin.Environments.VisibilityMacro')}</span>
            <select
              value={editorVisibility.macroUuid || ''}
              data-environment-field={taskField('visibility.macroUuid')}
              aria-invalid={fieldInvalid(taskField('visibility.macroUuid'))}
              aria-describedby={fieldDescribedBy(taskField('visibility.macroUuid'), selectedVisibilityMacroMissing ? 'environment-visibility-macro-reference-warning' : '')}
              onchange={(event) => updateVisibilityField('macroUuid', event.target.value)}
            >
              <option value="">{localize('FABRICATE.Admin.Environments.NoMacroSelected')}</option>
              {#if selectedVisibilityMacroMissing}
                <option value={editorVisibility.macroUuid}>{editorVisibility.macroUuid}</option>
              {/if}
              {#each scriptMacroOptions as macro (macro.uuid)}
                <option value={macro.uuid}>{macro.name}</option>
              {/each}
            </select>
            {#if selectedVisibilityMacroMissing}
              <span class="environment-stale-warning" id="environment-visibility-macro-reference-warning">
                {localize('FABRICATE.Admin.Environments.MissingMacroReferenceWarning')}
              </span>
            {/if}
            {#if fieldErrors(taskField('visibility.macroUuid')).length > 0}
              <span class="environment-field-error" id={fieldErrorId(taskField('visibility.macroUuid'))}>{fieldErrors(taskField('visibility.macroUuid'))[0].message}</span>
            {/if}
          </label>
        {/if}
      </div>
    {:else}
      <div class="environment-empty-action compact">
        <i class="fas fa-eye-slash" aria-hidden="true"></i>
        <div>
          <strong>{localize('FABRICATE.Admin.Environments.NoVisibility')}</strong>
          <p>{localize('FABRICATE.Admin.Environments.NoVisibilityHint')}</p>
        </div>
        <button type="button" data-environment-empty-action="enable-visibility" onclick={() => toggleVisibility?.(true)}>
          <i class="fas fa-plus"></i> {localize('FABRICATE.Admin.Environments.VisibilityEnabled')}
        </button>
      </div>
    {/if}
  </details>
</section>
