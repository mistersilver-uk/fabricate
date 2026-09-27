<!-- Svelte 5 runes mode -->
<!--
  One routed outcome tier row: its band swatch, name, threshold field, success toggle, the
  `checkDriven` break-tools toggle and delete. `column` names the threshold field: `dc` (`DC ±`)
  and `benefit` (`Benefit ±`) edit the tier's `dc` offset, `adjustment` edits its multiplier with
  a null endpoint read as Otherwise, and a fixed-type row edits its `start`/`end` range. Outside
  `dc` the field's name is also shown, since the bands no longer read as plain offsets.
-->
<script>
  import ManagerButton from '../../../components/ManagerButton.svelte';
  import SegmentedControl from '../../../components/SegmentedControl.svelte';
  import Stepper from '../../../components/Stepper.svelte';
  import { stepperLabels } from '../../../components/stepperLabels.js';
  import { localize } from '../../../util/foundryBridge.js';
  import {
    MULTIPLIER_STOPS,
    formatCheckAdjustment,
    parseCheckAdjustment,
  } from './checkAdjustmentLabel.js';

  let {
    outcome,
    type = 'relative',
    column = 'dc',
    invalid = false,
    swatch = '',
    checkDriven = false,
    onUpdate = () => {},
    onRemove = () => {},
  } = $props();

  function text(key, fallback) {
    const translated = localize(key);
    return translated && translated !== key ? translated : fallback;
  }

  const thresholdLabel = $derived.by(() => {
    if (column === 'adjustment') {
      return text('FABRICATE.Admin.Manager.Checks.Evaluation.Adjustment', 'Adjustment');
    }
    if (column === 'benefit') {
      return text('FABRICATE.Admin.Manager.Checks.Evaluation.OutcomeBenefit', 'Benefit ±');
    }
    return text('FABRICATE.Admin.Manager.Checks.Crafting.OutcomeDc', 'DC ±');
  });
  const startLabel = $derived(
    text('FABRICATE.Admin.Manager.Checks.Crafting.OutcomeStart', 'Start')
  );
  const endLabel = $derived(text('FABRICATE.Admin.Manager.Checks.Crafting.OutcomeEnd', 'End'));
  const otherwiseLabel = $derived(
    text('FABRICATE.Admin.Manager.Checks.Evaluation.Otherwise', 'Otherwise')
  );

  // The two segments of the per-tier outcome toggle.
  const outcomeSegments = $derived([
    {
      value: 'success',
      fallback: text('FABRICATE.Admin.Manager.Checks.Crafting.OutcomeSuccessOn', 'Success'),
      variant: 'success',
    },
    {
      value: 'failure',
      fallback: text('FABRICATE.Admin.Manager.Checks.Crafting.OutcomeSuccessOff', 'Failure'),
      variant: 'danger',
    },
  ]);

  // The same shape for the `checkDriven`-only tool-breakage choice; `keep` is the benign one.
  const breakToolsSegments = $derived([
    {
      value: 'keep',
      fallback: text('FABRICATE.Admin.Manager.Checks.Crafting.OutcomeBreakOff', "Don't break"),
      variant: 'success',
    },
    {
      value: 'break',
      fallback: text('FABRICATE.Admin.Manager.Checks.Crafting.OutcomeBreakOn', 'Break'),
      variant: 'danger',
    },
  ]);

  const formatMultiplier = (value) => formatCheckAdjustment('multiply', value);
  const parseMultiplier = (value) =>
    value.trim() === otherwiseLabel ? null : parseCheckAdjustment('multiply', value);
</script>

<div
  class={`manager-checks-tier-row ${invalid ? 'is-invalid' : ''}`}
  role="listitem"
  data-outcome-row={outcome.id}
  data-outcome-id={outcome.id}
>
  <!-- The KEY to the strip above: this row's band in its own tone, decorative to a screen
       reader, the row's accessible name coming from the Name field. -->
  <span
    class="manager-checks-tier-swatch"
    data-outcome-swatch={outcome.id}
    style={`--fab-outcome-swatch: ${swatch || 'var(--fab-surface-active)'};`}
    aria-hidden="true"
  ></span>
  <input
    class="manager-checks-tier-name"
    data-outcome-name
    aria-label={text('FABRICATE.Admin.Manager.Checks.Crafting.OutcomeName', 'Name')}
    value={outcome.name || ''}
    oninput={(event) => onUpdate({ name: event.currentTarget.value })}
  />

  <!-- `fill` plus a WIDTH from the layout context, the one thing it may take from this
       primitive. `allowUnset` is absent, a tier threshold having no "unset" meaning, and
       every `data-*` hook goes through `inputProps` onto the real `<input>`. -->
  {#if type === 'fixed'}
    <div class="manager-checks-tier-stepper is-narrow">
      <Stepper
        fill
        value={outcome.start ?? 0}
        {...stepperLabels(startLabel)}
        inputProps={{ 'data-outcome-start': '' }}
        onChange={(start) => onUpdate({ start })}
      />
    </div>
    <div class="manager-checks-tier-stepper is-narrow">
      <Stepper
        fill
        value={outcome.end ?? 0}
        {...stepperLabels(endLabel)}
        inputProps={{ 'data-outcome-end': '' }}
        onChange={(end) => onUpdate({ end })}
      />
    </div>
  {:else if column === 'adjustment'}
    <span class="manager-checks-tier-unit" aria-hidden="true">{thresholdLabel}</span>
    <!-- The multiplier, with Otherwise one step below the lowest stop: the tier a roll lands in
         when it meets no multiplied threshold. Its kept `dc` offset is left untouched. The wider
         track fits the Otherwise label. -->
    <div class="manager-checks-tier-stepper is-wide">
      <Stepper
        fill
        value={outcome.adjustment ?? null}
        formatValue={formatMultiplier}
        parseValue={parseMultiplier}
        stops={MULTIPLIER_STOPS}
        nullLabel={otherwiseLabel}
        {...stepperLabels(thresholdLabel)}
        inputProps={{ 'data-outcome-adjustment': '' }}
        onChange={(adjustment) => onUpdate({ adjustment })}
      />
    </div>
  {:else}
    {#if column !== 'dc'}
      <span class="manager-checks-tier-unit" aria-hidden="true">{thresholdLabel}</span>
    {/if}
    <div class="manager-checks-tier-stepper">
      <Stepper
        fill
        value={outcome.dc ?? 0}
        {...stepperLabels(thresholdLabel)}
        inputProps={{ 'data-outcome-dc': '' }}
        onChange={(dc) => onUpdate({ dc })}
      />
    </div>
  {/if}

  <!-- A SEGMENTED TOGGLE, not a pill that swaps its own label: the click-in-place pill
       showed only the state the tier is IN, readable as either a reading or a verb. -->
  <SegmentedControl
    density="compact"
    options={outcomeSegments}
    value={outcome.success === true ? 'success' : 'failure'}
    groupName={`outcome-success-${outcome.id}`}
    ariaLabel={text('FABRICATE.Admin.Manager.Checks.Crafting.OutcomeSuccess', 'Success')}
    dataAttr="data-outcome-success"
    optionDataAttr="data-outcome-success-option"
    onChange={(next) => onUpdate({ success: next === 'success' })}
  />

  <!-- KEPT, and gated, on purpose: the MATCHED TIER's own `breakTools` is read by
       `checkRoll.js`, so under `checkDriven` this is the only authoring surface for a
       live engine field. -->
  {#if checkDriven}
    <SegmentedControl
      density="compact"
      options={breakToolsSegments}
      value={outcome.breakTools === true ? 'break' : 'keep'}
      groupName={`outcome-break-${outcome.id}`}
      ariaLabel={text('FABRICATE.Admin.Manager.Checks.Crafting.OutcomeBreak', 'Break tools')}
      dataAttr="data-outcome-break"
      optionDataAttr="data-outcome-break-option"
      onChange={(next) => onUpdate({ breakTools: next === 'break' })}
    />
  {/if}

  <ManagerButton
    role="danger"
    class="manager-checks-tier-remove"
    data-remove-outcome
    aria-label={text('FABRICATE.Admin.Manager.Checks.Crafting.RemoveOutcome', 'Remove outcome')}
    onclick={onRemove}
  >
    <i class="fas fa-trash" aria-hidden="true"></i>
  </ManagerButton>
</div>

<style>
  .manager-checks-tier-stepper.is-wide {
    width: 136px;
  }
</style>
