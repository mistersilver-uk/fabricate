<!-- Svelte 5 runes mode -->
<script>
  import { localize } from '../../util/foundryBridge.js';

  let {
    timeUnits = [],
    activeTaskTimeRequirement = null,
    sectionOpen = true,
    sectionSummary = '',
    sectionInvalid = false,
    setSectionOpen,
    toggleTimeRequirement,
    updateTimeRequirement,
    taskField,
    fieldInvalid,
    fieldDescribedBy,
    fieldErrors,
    fieldErrorId
  } = $props();
</script>

<section class="environment-time-authoring" aria-label={localize('FABRICATE.Admin.Environments.TimeRequirement')} data-environment-invalid={sectionInvalid ? 'true' : undefined}>
  <details open={sectionOpen} ontoggle={(event) => setSectionOpen?.(event.currentTarget.open)}>
    <summary class="environment-task-header">
      <h5>{localize('FABRICATE.Admin.Environments.TimeRequirement')}</h5>
      <span class="hint">{sectionSummary}</span>
      {#if sectionInvalid}
        <span class="badge badge-disabled">{localize('FABRICATE.Admin.Environments.Invalid')}</span>
      {/if}
    </summary>
    <label class="checkbox-label">
      <input
        type="checkbox"
        checked={Boolean(activeTaskTimeRequirement)}
        onchange={(event) => toggleTimeRequirement(event.target.checked)}
      />
      {localize('FABRICATE.Admin.Environments.TimedTask')}
    </label>

    {#if activeTaskTimeRequirement}
      <div class="environment-fields environment-time-fields">
        {#each timeUnits as unit (unit.field)}
          <label class="form-group">
            <span>{localize(unit.label)}</span>
            <input
              type="number"
              min="0"
              step="1"
              value={activeTaskTimeRequirement?.[unit.field] ?? 0}
              data-environment-field={taskField(`timeRequirement.${unit.field}`)}
              aria-invalid={fieldInvalid(taskField(`timeRequirement.${unit.field}`))}
              aria-describedby={fieldDescribedBy(taskField(`timeRequirement.${unit.field}`))}
              oninput={(event) => updateTimeRequirement(unit.field, event.target.value)}
            />
            {#if fieldErrors(taskField(`timeRequirement.${unit.field}`)).length > 0}
              <span class="environment-field-error" id={fieldErrorId(taskField(`timeRequirement.${unit.field}`))}>{fieldErrors(taskField(`timeRequirement.${unit.field}`))[0].message}</span>
            {/if}
          </label>
        {/each}
        <p class="hint span-2">{localize('FABRICATE.Admin.Environments.TimeRequirementHint')}</p>
      </div>
    {:else}
      <p class="hint">{localize('FABRICATE.Admin.Environments.ImmediateTaskHint')}</p>
    {/if}
  </details>
</section>
