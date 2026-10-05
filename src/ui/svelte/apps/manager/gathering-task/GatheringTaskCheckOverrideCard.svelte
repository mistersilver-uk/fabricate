<!--
  A routed gathering task's check override card (issue 1522). One field, picked by the check's
  evaluation (R3, issue 2005): `dcOverride` under a fixed target, `adjustmentOverride` under a
  character value, `successesOverride` under a count; null uses the system's. A dormant field is
  kept and named by its own notice. Writes through `onUpdateTask`.
-->
<script>
  import Callout from '../../../components/Callout.svelte';
  import Field from '../../../components/Field.svelte';
  import Stepper from '../../../components/Stepper.svelte';
  import { stepperLabels } from '../../../components/stepperLabels.js';
  import { normalizeCheckEvaluation } from '../../../../../systems/normalize/checkEvaluation.js';
  import {
    MULTIPLIER_STOPS,
    formatCheckAdjustment,
    parseCheckAdjustment,
  } from '../checks/checkAdjustmentLabel.js';
  import OverridePlayerSees from '../component/OverridePlayerSees.svelte';
  import { checkOverrideField, overrideInvalidForKind } from '../component/overridePlayerSees.js';
  import { taskKeptNotices, taskOverrideCopy } from '../component/taskOverrideCopy.js';
  import GatheringTaskCard from './GatheringTaskCard.svelte';

  let {
    text,
    task,
    checkConfig = null,
    previewActors = [],
    resolvePreviewCharacter = () => null,
    onUpdateTask = () => {},
  } = $props();

  const instanceId = $props.id();
  const checkEvaluation = $derived(normalizeCheckEvaluation(checkConfig?.evaluation));
  const overrideField = $derived(checkOverrideField(checkEvaluation));
  const overrideAttribute = $derived(overrideField === 'adjustmentOverride');
  const overrideKind = $derived(checkEvaluation.target.adjustmentKind);
  const dcOverrideValue = $derived(task?.dcOverride ?? null);
  const adjustmentOverrideValue = $derived(task?.adjustmentOverride ?? null);
  const successesOverrideValue = $derived(task?.successesOverride ?? null);
  // A kind switch can leave a kept override invalid with no re-typing to catch it (issue 2078).
  const overrideInvalid = $derived(
    overrideInvalidForKind({
      attribute: overrideAttribute,
      kind: overrideKind,
      adjustmentOverride: adjustmentOverrideValue,
    })
  );
  const overrideInvalidId = `${instanceId}-task-override-invalid`;
  function updateDcOverride(value) {
    if (value === null || value === undefined) {
      onUpdateTask({ dcOverride: null });
      return;
    }
    const next = Number(value);
    onUpdateTask({ dcOverride: Number.isFinite(next) ? Math.trunc(next) : null });
  }
  // Never truncated: a multiplier such as ×0.7 is exact.
  function updateAdjustmentOverride(value) {
    onUpdateTask({ adjustmentOverride: Number.isFinite(value) ? value : null });
  }
  function updateSuccessesOverride(value) {
    onUpdateTask({ successesOverride: Number.isFinite(value) ? Math.trunc(value) : null });
  }
  const formatOverride = (value) => formatCheckAdjustment(overrideKind, value);
  const parseOverride = (value) => parseCheckAdjustment(overrideKind, value);
  const overrideCopy = $derived(
    taskOverrideCopy(checkEvaluation, checkConfig?.thresholdMode, text)
  );
  const keptOverrideNotices = $derived(
    taskKeptNotices({ evaluation: checkEvaluation, task }, text)
  );
</script>

<GatheringTaskCard
  class="manager-task-dc-card"
  title={overrideCopy.title}
  hint={overrideCopy.hint}
  data-gathering-task-dc
  data-gathering-task-override-field={overrideField}
>
  <div class="manager-task-dc-row">
    <!-- `<div>`, not `<label>`: see the NAMING contract in `Stepper.svelte`. -->
    <Field as="div" class="manager-task-dc-field">
      <span>{overrideCopy.label}</span>
      {#if overrideField === 'successesOverride'}
        <!-- An integer 0–20, the range the normalizer keeps; no presets (R3). -->
        <!-- ratchet-exempt(design-system): the spread is `stepperLabels`, the Stepper names the shared derivation requires, moved from GatheringTaskEditView -->
        <Stepper
          value={successesOverrideValue}
          allowUnset
          step={1}
          min={0}
          max={20}
          fill
          density="comfortable"
          placeholder={text(
            'FABRICATE.Admin.Manager.Gathering.TaskDcOverridePlaceholder',
            'System default'
          )}
          {...stepperLabels(overrideCopy.label)}
          inputProps={{ 'data-gathering-task-successes-override': '' }}
          onChange={(next) => updateSuccessesOverride(next)}
        />
      {:else if overrideAttribute}
        <!-- Keyed by kind, so a switch re-reads the kept value through the other formatter. -->
        {#key overrideKind}
          <!-- ratchet-exempt(design-system): the spread is `stepperLabels`, the Stepper names the shared derivation requires, moved from GatheringTaskEditView -->
          <Stepper
            value={adjustmentOverrideValue}
            allowUnset
            fill
            density="comfortable"
            formatValue={formatOverride}
            parseValue={parseOverride}
            stops={overrideKind === 'multiply' ? MULTIPLIER_STOPS : []}
            placeholder={text(
              'FABRICATE.Admin.Manager.Gathering.TaskDcOverridePlaceholder',
              'System default'
            )}
            {...stepperLabels(overrideCopy.label)}
            inputProps={{
              'data-gathering-task-adjustment-override': '',
              'aria-invalid': overrideInvalid ? 'true' : undefined,
              'aria-describedby': overrideInvalid ? overrideInvalidId : undefined,
            }}
            onChange={(next) => updateAdjustmentOverride(next)}
          />
        {/key}
      {:else}
        <!-- `min={0}`: a DC below zero is not a DC, and an unset field steps from `min ?? 0`, so
             one `−` on the blank field would commit -1. `fill` takes its width from the
             `.manager-task-dc-field` cap below. -->
        <!-- ratchet-exempt(design-system): the spread is `stepperLabels`, the Stepper names the shared derivation requires, moved from GatheringTaskEditView -->
        <Stepper
          value={dcOverrideValue}
          allowUnset
          step={1}
          min={0}
          fill
          density="comfortable"
          placeholder={text(
            'FABRICATE.Admin.Manager.Gathering.TaskDcOverridePlaceholder',
            'System default'
          )}
          {...stepperLabels(overrideCopy.label)}
          inputProps={{ 'data-gathering-task-dc-override': '' }}
          onChange={(next) => updateDcOverride(next)}
        />
      {/if}
    </Field>
  </div>
  {#if overrideInvalid}
    <p
      class="manager-muted manager-task-dc-invalid"
      id={overrideInvalidId}
      data-gathering-task-override-invalid
    >
      <i class="fas fa-circle-exclamation" aria-hidden="true"></i>
      {text(
        'FABRICATE.Admin.Manager.Gathering.TaskOverrideInvalidForKind',
        'This override does not suit its kind: an added adjustment must be a finite number and a multiplier must be above zero.'
      )}
    </p>
  {/if}
  {#each keptOverrideNotices as notice (notice)}
    <Callout text={notice} data-gathering-task-override-kept />
  {/each}
  <OverridePlayerSees
    subject={task?.name || ''}
    evaluation={checkEvaluation}
    thresholdMode={checkConfig?.thresholdMode}
    type={checkConfig?.type ?? null}
    dcOverride={dcOverrideValue}
    adjustmentOverride={adjustmentOverrideValue}
    successesOverride={successesOverrideValue}
    anchorDc={Number(checkConfig?.dc ?? 15)}
    actors={previewActors}
    resolveCharacter={resolvePreviewCharacter}
  />
</GatheringTaskCard>

<style>
  /* A CAP rather than dropping `fill`: nothing above the lone field gives it a width, so a filled
     stepper spanned the whole card, and an unfilled one is stretched to the same box. 160px is the
     width `fill` was measured against. `:global()` chained with `.fabricate-field`, because the
     class sits on a `<Field>`, keeps the (0,2,0) the scoped form had. */
  :global(.fabricate-field.manager-task-dc-field) {
    max-width: 160px;
  }

  .manager-task-dc-invalid {
    display: flex;
    align-items: center;
    gap: var(--fab-space-2);
    color: var(--fab-danger-text);
  }

  /* Edge-marks the stepper the way an invalid formula is marked elsewhere: two selectors deep to
     reach the stepper's own border, which the plain input never draws. */
  :global(.manager-task-dc-row .fab-stepper:has(input[aria-invalid='true'])) {
    border-color: var(--fab-danger-border);
  }
</style>
