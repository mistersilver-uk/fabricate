<!-- Svelte 5 runes mode -->
<!--
  Shared roll formula (+ optional DC + comparison) row for the crafting check
  editors (simple, routed, and progressive). When the DC is shown the check
  succeeds once the roll total reaches it, met-or-exceeded or strictly exceeded.
  Controlled: reads the discrete fields and emits a partial patch via onChange
  (the parent merges it into the full check object).

  `showDc` (default true) renders the DC + comparison fields. The progressive check
  has no DC — its total is a numeric value, not a pass/fail threshold — so it sets
  `showDc={false}` to render the formula field alone.
-->
<script>
  import { localize } from '../../../util/foundryBridge.js';
  import Stepper from '../../../components/Stepper.svelte';
  import { stepperLabels } from '../../../components/stepperLabels.js';

  let {
    rollFormula = '',
    dc = 15,
    thresholdMode = 'meet',
    placeholder = '1d20+@abilities.int.mod',
    showDc = true,
    onChange = () => {},
  } = $props();

  function text(key, fallback) {
    const translated = localize(key);
    return translated && translated !== key ? translated : fallback;
  }

  const comparison = $derived(thresholdMode === 'exceed' ? 'exceed' : 'meet');

  // Visible field label, stepper accessible name, and the `{label}` slot in the shared
  // `Decrease {label}` / `Increase {label}` adjunct strings — one string, three readers.
  const dcLabel = $derived(text('FABRICATE.Admin.Manager.Checks.Crafting.Dc', 'DC'));
</script>

<div class="manager-checks-formula-row">
  <label class="manager-field manager-checks-formula-field">
    <span>{text('FABRICATE.Admin.Manager.Checks.Crafting.FormulaLabel', 'Formula')}</span>
    <input
      data-check-roll-formula
      value={rollFormula || ''}
      {placeholder}
      oninput={(event) => onChange({ rollFormula: event.currentTarget.value })}
    />
  </label>
  {#if showDc}
    <!-- A `<div>`, not the `<label>` it was: see the NAMING contract in `Stepper.svelte`. -->
    <div class="manager-field manager-checks-threshold-field">
      <span>{dcLabel}</span>
      <!-- `fill` rather than the inline default (D2): this is a 120px flex slot on an
           `align-items: flex-end` row beside a 36px formula field and a 36px comparison
           select, so an inline 102x28 island would change the control's width, height,
           border and fill relative to its siblings.

           `min={0}`: a check DC below zero is not a DC, and the bare input this replaced
           had no live `−` button that could reach -1 from 0 in a single click. -->
      <Stepper
        fill
        min={0}
        value={dc ?? 15}
        {...stepperLabels(dcLabel)}
        inputProps={{ 'data-check-dc': '' }}
        onChange={(next) => onChange({ dc: next })}
      />
    </div>
    <label class="manager-field manager-checks-threshold-mode">
      <span
        >{text('FABRICATE.Admin.Manager.Checks.Crafting.ThresholdComparison', 'Comparison')}</span
      >
      <select
        data-threshold-mode
        value={comparison}
        onchange={(event) => onChange({ thresholdMode: event.currentTarget.value })}
      >
        <option value="meet"
          >{text('FABRICATE.Admin.Manager.Checks.Crafting.ThresholdMeet', 'Meet or exceed')}</option
        >
        <option value="exceed"
          >{text('FABRICATE.Admin.Manager.Checks.Crafting.ThresholdExceed', 'Exceed')}</option
        >
      </select>
    </label>
  {/if}
</div>
