<!-- Svelte 5 runes mode -->
<script>
  import { localize } from '../../util/foundryBridge.js';

  let {
    environmentDraft,
    sceneOptions = [],
    selectedSceneMissing = false,
    updateField,
    environmentField,
    fieldInvalid,
    fieldDescribedBy,
    fieldErrors,
    fieldErrorId
  } = $props();

  const sceneOptionList = $derived(Array.isArray(sceneOptions) ? sceneOptions : []);
</script>

<section class="environment-fields environment-editor-card" aria-label={localize('FABRICATE.Admin.Environments.EnvironmentDetails')}>
  <label class="form-group">
    <span>{localize('FABRICATE.Admin.Environments.Name')}</span>
    <input
      type="text"
      value={environmentDraft.name}
      data-environment-field={environmentField('name')}
      aria-invalid={fieldInvalid(environmentField('name'))}
      aria-describedby={fieldDescribedBy(environmentField('name'))}
      oninput={(event) => updateField('name', event.target.value)}
    />
    {#if fieldErrors(environmentField('name')).length > 0}
      <span class="environment-field-error" id={fieldErrorId(environmentField('name'))}>{fieldErrors(environmentField('name'))[0].message}</span>
    {/if}
  </label>
  <label class="form-group">
    <span>{localize('FABRICATE.Admin.Environments.SelectionMode')}</span>
    <select
      value={environmentDraft.selectionMode}
      data-environment-field={environmentField('selectionMode')}
      aria-invalid={fieldInvalid(environmentField('selectionMode'))}
      aria-describedby={fieldDescribedBy(environmentField('selectionMode'))}
      onchange={(event) => updateField('selectionMode', event.target.value)}
    >
      <option value="targeted">{localize('FABRICATE.Admin.Environments.SelectionTargeted')}</option>
      <option value="blind">{localize('FABRICATE.Admin.Environments.SelectionBlind')}</option>
    </select>
    {#if fieldErrors(environmentField('selectionMode')).length > 0}
      <span class="environment-field-error" id={fieldErrorId(environmentField('selectionMode'))}>{fieldErrors(environmentField('selectionMode'))[0].message}</span>
    {/if}
  </label>
  <label class="form-group span-2">
    <span>{localize('FABRICATE.Admin.Environments.Description')}</span>
    <textarea
      rows="4"
      value={environmentDraft.description}
      oninput={(event) => updateField('description', event.target.value)}
    ></textarea>
  </label>
  <label class="form-group span-2">
    <span>{localize('FABRICATE.Admin.Environments.SceneUuid')}</span>
    <div class="environment-assisted-field">
      <select
        value={environmentDraft.sceneUuid || ''}
        aria-label={localize('FABRICATE.Admin.Environments.SceneSelect')}
        aria-describedby={selectedSceneMissing ? 'environment-scene-reference-warning' : undefined}
        onchange={(event) => updateField('sceneUuid', event.target.value)}
      >
        <option value="">{localize('FABRICATE.Admin.Environments.NoSceneSelected')}</option>
        {#if selectedSceneMissing}
          <option value={environmentDraft.sceneUuid}>{localize('FABRICATE.Admin.Environments.MissingReferenceOption', { uuid: environmentDraft.sceneUuid })}</option>
        {/if}
        {#each sceneOptionList as scene (scene.uuid)}
          <option value={scene.uuid}>{scene.name}</option>
        {/each}
      </select>
      <input
        type="text"
        value={environmentDraft.sceneUuid || ''}
        placeholder="Scene.xxxxxxxxxxxxxxxx"
        data-environment-field={environmentField('sceneUuid')}
        aria-invalid={fieldInvalid(environmentField('sceneUuid'))}
        aria-describedby={fieldDescribedBy(environmentField('sceneUuid'), selectedSceneMissing ? 'environment-scene-reference-warning' : '')}
        oninput={(event) => updateField('sceneUuid', event.target.value)}
      />
    </div>
    {#if selectedSceneMissing}
      <span class="environment-stale-warning" id="environment-scene-reference-warning">
        {localize('FABRICATE.Admin.Environments.LinkedSceneReferenceWarning')}
      </span>
    {/if}
    {#if fieldErrors(environmentField('sceneUuid')).length > 0}
      <span class="environment-field-error" id={fieldErrorId(environmentField('sceneUuid'))}>{fieldErrors(environmentField('sceneUuid'))[0].message}</span>
    {/if}
  </label>
  <label class="checkbox-label span-2">
    <input
      type="checkbox"
      checked={environmentDraft.enabled}
      onchange={(event) => updateField('enabled', event.target.checked)}
    />
    {localize('FABRICATE.Admin.Environments.Enabled')}
  </label>
</section>
