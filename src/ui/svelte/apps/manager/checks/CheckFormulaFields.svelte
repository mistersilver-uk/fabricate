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
  import { getModifierExpressionSuggestions } from '../../../../../config/modifierExpressionSuggestions.js';
  import { localize } from '../../../util/foundryBridge.js';
  import Stepper from '../../../components/Stepper.svelte';
  import { stepperLabels } from '../../../components/stepperLabels.js';

  let {
    rollFormula = '',
    dc = 15,
    thresholdMode = 'meet',
    placeholder = '1d20+@abilities.int.mod',
    showDc = true,
    foundrySystemId = '',
    onChange = () => {},
  } = $props();

  function text(key, fallback) {
    const translated = localize(key);
    return translated && translated !== key ? translated : fallback;
  }

  const comparison = $derived(thresholdMode === 'exceed' ? 'exceed' : 'meet');

  // The formula token quick-add row (issue 1096). DERIVED FROM THE ACTIVE WORLD, never a
  // literal list.
  //
  // It WAS a literal list, and it shipped `@ingredients` — a term that resolves against
  // nothing, so one click on the chip wrote it into the formula and BROKE the check. A
  // one-click path to a broken check is worse than no chip at all, and the other four were
  // no better evidenced: `@prof` and `@level` are dnd5e-shaped guesses in a system-agnostic
  // module, and nothing anywhere proved any of the five against a real actor's roll data.
  //
  // `getModifierExpressionSuggestions` is the derivation the modifier chips already use: its
  // system-specific half comes from the shipped preset bundles
  // (`getCharacterModifierPresetsForFoundrySystem`), so a chip can only ever offer a path the
  // product would itself author for this world, and an UNSUPPORTED world degrades to the
  // system-agnostic terms rather than offering a dnd5e path it does not have. That removes
  // the whole class of defect rather than the one instance of it.
  const quickTokens = $derived(
    getModifierExpressionSuggestions(foundrySystemId).map((suggestion) => suggestion.expression)
  );

  function appendToken(token) {
    const current = String(rollFormula || '').trim();
    onChange({ rollFormula: current ? `${current} + ${token}` : token });
  }

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
    <!-- Real `<button>`s, never the prototype's click-handled bare spans: this row is five
         controls a GM operates, and a span with an `onclick` is reachable by neither the
         keyboard nor a screen reader. -->
    <span class="manager-checks-formula-tokens" data-check-formula-tokens>
      {#each quickTokens as token (token)}
        <button
          type="button"
          class="manager-checks-formula-token"
          data-check-formula-token={token}
          onclick={() => appendToken(token)}
        >
          + {token}
        </button>
      {/each}
    </span>
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
