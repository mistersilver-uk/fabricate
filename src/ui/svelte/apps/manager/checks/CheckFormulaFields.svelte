<!-- Svelte 5 runes mode -->
<!--
  Shared roll formula + DC + comparison row for the crafting check editors (simple
  and routed). The check succeeds when the roll total reaches the DC, met-or-
  exceeded or strictly exceeded. Controlled: reads the discrete fields and emits a
  partial patch via onChange (the parent merges it into the full check object).

  `showDc` (default true) renders the DC + comparison fields. The progressive check
  has no DC — its total is a numeric value, not a pass/fail threshold — so it sets
  `showDc={false}` to render the formula field alone.
-->
<script>
  import { localize } from '../../../util/foundryBridge.js';

  let {
    rollFormula = '',
    dc = 15,
    thresholdMode = 'meet',
    placeholder = '1d20+@abilities.int.mod',
    showDc = true,
    onChange = () => {}
  } = $props();

  function text(key, fallback) {
    const translated = localize(key);
    return translated && translated !== key ? translated : fallback;
  }

  function numeric(rawValue) {
    if (rawValue === '' || rawValue === '-') return 0;
    const parsed = Number(rawValue);
    return Number.isNaN(parsed) ? 0 : parsed;
  }

  const comparison = $derived(thresholdMode === 'exceed' ? 'exceed' : 'meet');
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
    <label class="manager-field manager-checks-threshold-field">
      <span>{text('FABRICATE.Admin.Manager.Checks.Crafting.Dc', 'DC')}</span>
      <input
        type="number"
        data-check-dc
        value={dc ?? 15}
        oninput={(event) => onChange({ dc: numeric(event.currentTarget.value) })}
      />
    </label>
    <label class="manager-field manager-checks-threshold-mode">
      <span>{text('FABRICATE.Admin.Manager.Checks.Crafting.ThresholdComparison', 'Comparison')}</span>
      <select
        data-threshold-mode
        value={comparison}
        onchange={(event) => onChange({ thresholdMode: event.currentTarget.value })}
      >
        <option value="meet">{text('FABRICATE.Admin.Manager.Checks.Crafting.ThresholdMeet', 'Meet or exceed')}</option>
        <option value="exceed">{text('FABRICATE.Admin.Manager.Checks.Crafting.ThresholdExceed', 'Exceed')}</option>
      </select>
    </label>
  {/if}
</div>
