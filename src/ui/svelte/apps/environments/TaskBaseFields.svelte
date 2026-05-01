<!-- Svelte 5 runes mode -->
<script>
  import { localize } from '../../util/foundryBridge.js';
  import ImagePathPicker from '../../components/ImagePathPicker.svelte';

  let {
    activeTask,
    onPickImagePath,
    sectionOpen = true,
    sectionSummary = '',
    sectionInvalid = false,
    setSectionOpen,
    updateTask,
    taskField,
    fieldInvalid,
    fieldDescribedBy,
    fieldErrors,
    fieldErrorId
  } = $props();
</script>

<section class="environment-base-authoring" aria-label={localize('FABRICATE.Admin.Environments.SectionBase')} data-environment-invalid={sectionInvalid ? 'true' : undefined}>
  <details open={sectionOpen} ontoggle={(event) => setSectionOpen?.(event.currentTarget.open)}>
    <summary class="environment-task-header">
      <h5>{localize('FABRICATE.Admin.Environments.SectionBase')}</h5>
      <span class="hint">{sectionSummary}</span>
      {#if sectionInvalid}
        <span class="badge badge-disabled">{localize('FABRICATE.Admin.Environments.Invalid')}</span>
      {/if}
    </summary>
    <div class="environment-fields">
      <label class="form-group">
        <span>{localize('FABRICATE.Admin.Environments.TaskName')}</span>
        <input
          type="text"
          value={activeTask.name}
          data-environment-field={taskField('name')}
          aria-invalid={fieldInvalid(taskField('name'))}
          aria-describedby={fieldDescribedBy(taskField('name'))}
          oninput={(event) => updateTask('name', event.target.value)}
        />
        {#if fieldErrors(taskField('name')).length > 0}
          <span class="environment-field-error" id={fieldErrorId(taskField('name'))}>{fieldErrors(taskField('name'))[0].message}</span>
        {/if}
      </label>
      <label class="form-group">
        <span>{localize('FABRICATE.Admin.Environments.TaskResolutionMode')}</span>
        <select
          value={activeTask.resolutionMode}
          data-environment-field={taskField('resolutionMode')}
          aria-invalid={fieldInvalid(taskField('resolutionMode'))}
          aria-describedby={fieldDescribedBy(taskField('resolutionMode'))}
          onchange={(event) => updateTask('resolutionMode', event.target.value)}
        >
          <option value="routed">{localize('FABRICATE.Admin.Environments.TaskResolutionRouted')}</option>
          <option value="progressive">{localize('FABRICATE.Admin.Environments.TaskResolutionProgressive')}</option>
        </select>
        {#if fieldErrors(taskField('resolutionMode')).length > 0}
          <span class="environment-field-error" id={fieldErrorId(taskField('resolutionMode'))}>{fieldErrors(taskField('resolutionMode'))[0].message}</span>
        {/if}
      </label>
      <label class="form-group span-2">
        <span>{localize('FABRICATE.Admin.Environments.TaskDescription')}</span>
        <textarea
          rows="3"
          value={activeTask.description || ''}
          oninput={(event) => updateTask('description', event.target.value)}
        ></textarea>
      </label>
      <label class="form-group span-2">
        <span>{localize('FABRICATE.Admin.Environments.TaskImage')}</span>
        <ImagePathPicker
          value={activeTask.img || ''}
          defaultImage="icons/svg/item-bag.svg"
          chooseLabel={localize('FABRICATE.Admin.Environments.ChooseImage')}
          unavailableLabel={localize('FABRICATE.Admin.Environments.ImagePickerUnavailable')}
          dataEnvironmentField={taskField('img')}
          ariaInvalid={fieldInvalid(taskField('img'))}
          ariaDescribedBy={fieldDescribedBy(taskField('img'))}
          onChange={(path) => updateTask('img', path)}
          onPickImagePath={onPickImagePath}
        />
        {#if fieldErrors(taskField('img')).length > 0}
          <span class="environment-field-error" id={fieldErrorId(taskField('img'))}>{fieldErrors(taskField('img'))[0].message}</span>
        {/if}
      </label>
      <label class="checkbox-label span-2">
        <input
          type="checkbox"
          checked={activeTask.enabled}
          onchange={(event) => updateTask('enabled', event.target.checked)}
        />
        {localize('FABRICATE.Admin.Environments.TaskEnabled')}
      </label>
    </div>
  </details>
</section>
