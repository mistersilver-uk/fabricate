<!-- Svelte 5 runes mode -->
<!--
  One routed outcome tier row: its band swatch, name, threshold field, success toggle, the
  `checkDriven` break-tools switch and delete. `column` names the threshold field: `dc` (`DC ±`),
  `benefit` (`Benefit ±`) and `successes` (`Extra successes`) edit the tier's `dc` offset, `adjustment` edits its multiplier with
  a null endpoint read as Otherwise, and a fixed-type row edits its `start`/`end` range. The list's
  column header names each field on screen; every control also carries its own accessible name.
-->
<script>
  import ManagerButton from '../../../components/ManagerButton.svelte';
  import SegmentedControl from '../../../components/SegmentedControl.svelte';
  import StatusToggle from '../../../components/StatusToggle.svelte';
  import Stepper from '../../../components/Stepper.svelte';
  import { stepperLabels } from '../../../components/stepperLabels.js';
  import { localize } from '../../../util/foundryBridge.js';
  import {
    MULTIPLIER_STOPS,
    formatCheckAdjustment,
    parseCheckAdjustment,
  } from './checkAdjustmentLabel.js';
  import { outcomeThresholdLabels } from './checksCopy.js';

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

  // Fixed rows name `[start, end]`; a relative row names its one threshold field.
  const labels = $derived(outcomeThresholdLabels(type, column, text));
  const thresholdLabel = $derived(labels[0]);
  const startLabel = $derived(labels[0]);
  const endLabel = $derived(labels[1] ?? '');
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

  const breakLabel = $derived(
    text('FABRICATE.Admin.Manager.Checks.Crafting.OutcomeBreak', 'Break tools')
  );

  const formatMultiplier = (value) => formatCheckAdjustment('multiply', value);
  // A relative offset reads signed (`+3`, `−1`, `0`), as the recipe tiers' adjustments do.
  const formatOffset = (value) => formatCheckAdjustment('add', value);
  const parseOffset = (value) => parseCheckAdjustment('add', value);
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
    <!-- The multiplier, with Otherwise one step below the lowest stop: the tier a roll lands in
         when it meets no multiplied threshold. Its kept `dc` offset is left untouched. -->
    <div class="manager-checks-tier-stepper">
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
    <div class="manager-checks-tier-stepper">
      <Stepper
        fill
        value={outcome.dc ?? 0}
        formatValue={formatOffset}
        parseValue={parseOffset}
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
    data-outcome-success
    optionDataAttr="data-outcome-success-option"
    onChange={(next) => onUpdate({ success: next === 'success' })}
  />

  <!-- KEPT, and gated, on purpose: the MATCHED TIER's own `breakTools` is read by
       `checkRoll.js`, so under `checkDriven` this is the only authoring surface for a
       live engine field. -->
  {#if checkDriven}
    <span class="manager-checks-tier-break">
      <StatusToggle
        on={outcome.breakTools === true}
        ariaLabel={breakLabel}
        data-outcome-break=""
        onclick={() => onUpdate({ breakTools: outcome.breakTools !== true })}
      />
    </span>
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
  .manager-checks-tier-break {
    display: flex;
    flex: 0 0 76px;
    justify-content: center;
  }
</style>
