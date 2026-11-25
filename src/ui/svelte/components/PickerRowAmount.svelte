<!-- Svelte 5 runes mode -->
<!--
  The amount slot of a `PickerRow`: a stepper, or behind a Fixed | Rolled toggle a roll expression.
  It renders a fragment into the row's trailing controls and owns no wrapper element, except under
  `formula`, which draws one flex-wrapping root so its notes sit under the controls on any host.

  Props:
  | prop | values | default | contract |
  | --- | --- | --- | --- |
  | `value` | the row's `value` | `{}` | Reads `kind`, `quantity` and `quantityFormula`; an absent or non-positive `quantity` shows as 1 and is not written back. |
  | `amount` | `{ min, max, unit, inputProps, ariaLabel, decrementLabel, incrementLabel, fixedLabel, rolledLabel, modeAriaLabel, formulaAriaLabel }` | `{}` | The stepper's bounds, a unit drawn after it, attributes added to its input beside the row's own hook, and copy that overrides this slot's own: the stepper's and its two buttons' names, the two segment words, and the toggle's and the expression's names. |
  | `name` | string | `''` | The subject's name, or the kind word while unnamed: the stepper is `Quantity for {name}`, the toggle `Amount for {name}` and the expression `Rolled amount for {name}`. |
  | `rollable` | boolean | `false` | Draws the Fixed \| Rolled toggle. Only a `component` or `currency` result has a formula, so every other kind ignores it. |
  | `formula` | `{ resolve, unresolvedLabel, tokens?, tokensLabel?, placeholder?, hint? }` \| `null` | `null` | Supersedes `rollable`: the Fixed \| Formula toggle draws for every kind. An absent `amount.min` or `amount.max` is unbounded and the stepper shows a stored number verbatim, 0 included, and a `null` amount as "—", unset. `resolve`, `unresolvedLabel`, `tokens` and `tokensLabel` go to the expression field; `placeholder` may truncate at its 102px, so `hint` carries the full example, drawn as muted text under the Formula input and only there, and described after the reading. |
  | `readonly` / `disabled` | booleans | `false` | The static read-only amount, a rolled one as its expression; and every control off. |
  | `invalid` | string | `''` | A message: sets `aria-invalid` on the amount control and describes it with the message. |

  Callbacks:
  - `onChange(patch)` — `{ quantity }` from the stepper, or `{ quantityFormula }` from the toggle and
    the expression; Fixed sends `undefined`, which the adapters turn into an absent key.

  Invariants:
  - Rolled never writes `quantity`, and opening Rolled with nothing typed writes nothing; the same holds for Formula.
  - The typed expression is kept here across Rolled → Fixed → Rolled, so switching back restores it.
  - That Fixed | Rolled state is per component instance, so a `rollable` caller keys its rows by
    stable entry identity.
  - Fixed ↔ Rolled moves no focus; the swapped control is the next tab stop. All pinned by
    `tests/components/picker-row-matrix-mounted.test.js`.
-->
<script module>
  // Minted per instance: two rows sharing one radio `name` are one group to the browser.
  let amountSeq = 0;
</script>

<script>
  import SegmentedControl from './SegmentedControl.svelte';
  import Stepper from './Stepper.svelte';
  import { localizeOr as text } from '../util/localizeOr.js';
  import RollDataExpressionInput from './RollDataExpressionInput.svelte';
  import { shownAmount } from './pickerRowKinds.js';

  amountSeq += 1;
  const instance = amountSeq;
  const errorId = `fabricate-picker-row-amount-error-${instance}`;
  const hintId = `fabricate-picker-row-amount-hint-${instance}`;

  // Essence and currency count on `match.amount`, so their marker differs from the quantity's.
  const AMOUNT_HOOKS = {
    essence: 'data-recipe-essence-amount',
    currency: 'data-recipe-currency-amount',
  };

  let {
    value = {},
    amount = {},
    name = '',
    rollable = false,
    formula = null,
    readonly = false,
    disabled = false,
    invalid = '',
    onChange = () => {},
  } = $props();

  const verbatim = $derived(typeof value?.quantity === 'number' ? value.quantity : null);
  const shown = $derived(formula ? verbatim : shownAmount(value?.quantity));
  const togglable = $derived(
    formula ? !readonly : rollable && ['component', 'currency'].includes(value?.kind) && !readonly
  );
  const stored = $derived(typeof value?.quantityFormula === 'string' ? value.quantityFormula : '');

  // Whether the GM has opened Rolled on this row, and what they last typed into it.
  let opened = $state(false);
  let typed = $state('');
  const rolled = $derived(togglable && (stored.trim() !== '' || opened));

  function setMode(mode) {
    if (mode === 'fixed') {
      typed = stored || typed;
      opened = false;
      if (value?.quantityFormula !== undefined) onChange({ quantityFormula: undefined });
      return;
    }
    opened = true;
    if (typed.trim() !== '') onChange({ quantityFormula: typed });
  }

  function writeFormula(raw) {
    typed = raw;
    opened = true;
    onChange({ quantityFormula: raw });
  }

  const invalidAttrs = $derived(
    invalid ? { 'aria-invalid': 'true', 'aria-describedby': errorId } : {}
  );
  const named = (key, fallback) => text(key, fallback).replace('{name}', name);
  const stepperName = $derived(
    amount.ariaLabel || named('FABRICATE.Admin.Manager.Recipe.QuantityFor', 'Quantity for {name}')
  );
  const hint = $derived(typeof formula?.hint === 'string' ? formula.hint.trim() : '');
  const hintShown = $derived(rolled && hint !== '');
  const formulaDescription = $derived(
    [hintShown ? hintId : '', invalid ? errorId : ''].filter(Boolean).join(' ') || undefined
  );
  const secondWord = $derived(
    formula
      ? text('FABRICATE.Admin.Manager.Recipe.AmountFormula', 'Formula')
      : text('FABRICATE.Admin.Manager.Recipe.AmountRolled', 'Rolled')
  );
  const modes = $derived([
    {
      value: 'fixed',
      label: amount.fixedLabel || text('FABRICATE.Admin.Manager.Recipe.AmountFixed', 'Fixed'),
      disabled,
    },
    {
      value: 'rolled',
      label: amount.rolledLabel || secondWord,
      disabled,
    },
  ]);
</script>

{#snippet stepper()}
  <Stepper
    value={shown}
    min={amount.min ?? (formula ? null : 1)}
    max={amount.max ?? (formula ? null : 9999)}
    allowUnset={Boolean(formula)}
    placeholder={formula ? '—' : ''}
    {disabled}
    ariaLabel={stepperName}
    decrementLabel={amount.decrementLabel ||
      text('FABRICATE.Admin.Manager.Recipe.QuantityDecrement', 'Decrease quantity')}
    incrementLabel={amount.incrementLabel ||
      text('FABRICATE.Admin.Manager.Recipe.QuantityIncrement', 'Increase quantity')}
    inputProps={{
      [AMOUNT_HOOKS[value?.kind] ?? 'data-recipe-option-quantity']: '',
      class: 'fab-stepper-input manager-recipe-option-quantity',
      ...amount.inputProps,
      ...invalidAttrs,
    }}
    onChange={(next) => onChange({ quantity: next })}
  />
{/snippet}

{#snippet notes()}
  {#if amount.unit}
    <span class="manager-recipe-option-unit" title={amount.unit} data-recipe-option-unit
      >{amount.unit}</span
    >
  {/if}
  {#if invalid}
    <span id={errorId} class="manager-recipe-option-invalid" data-recipe-option-invalid
      >{invalid}</span
    >
  {/if}
{/snippet}

<!-- The plain branch renders the stepper alone, so an unadorned row gains no text node. -->
{#if readonly}
  <!-- Read-only amount, on the same marker so the currency count stays locatable. -->
  <span
    class="manager-recipe-option-quantity is-readonly"
    data-recipe-currency-amount
    data-recipe-currency-readonly-amount>{stored || shown}</span
  >
{:else if formula}
  <div class="fab-picker-row-amount-formula">
    <SegmentedControl
      options={modes}
      value={rolled ? 'rolled' : 'fixed'}
      density="inline"
      groupName={`picker-row-amount-${instance}`}
      ariaLabel={amount.modeAriaLabel ||
        named('FABRICATE.Admin.Manager.Recipe.AmountFor', 'Amount for {name}')}
      optionDataAttr="data-recipe-option-amount-mode"
      onChange={setMode}
    />
    {#if rolled}
      <div class="fab-picker-row-amount-field">
        <RollDataExpressionInput
          value={stored}
          placeholder={formula.placeholder ?? '1d4+1'}
          resolve={formula.resolve}
          unresolvedLabel={formula.unresolvedLabel}
          tokens={formula.tokens}
          tokensLabel={formula.tokensLabel}
          {disabled}
          data-recipe-option-formula=""
          aria-label={amount.formulaAriaLabel ||
            named('FABRICATE.Admin.Manager.Recipe.RolledAmountFor', 'Rolled amount for {name}')}
          aria-invalid={invalid ? 'true' : undefined}
          aria-describedby={formulaDescription}
          onChange={writeFormula}
        />
      </div>
    {:else}
      {@render stepper()}
    {/if}
    {#if amount.unit}
      <span class="manager-recipe-option-unit" title={amount.unit} data-recipe-option-unit
        >{amount.unit}</span
      >
    {/if}
    {#if hintShown}
      <span id={hintId} class="fab-picker-row-amount-note fab-picker-row-amount-hint">{hint}</span>
    {/if}
    {#if invalid}
      <span
        id={errorId}
        class="manager-recipe-option-invalid fab-picker-row-amount-note"
        data-recipe-option-invalid>{invalid}</span
      >
    {/if}
  </div>
{:else if togglable}
  <SegmentedControl
    options={modes}
    value={rolled ? 'rolled' : 'fixed'}
    density="inline"
    groupName={`picker-row-amount-${instance}`}
    ariaLabel={amount.modeAriaLabel ||
      named('FABRICATE.Admin.Manager.Recipe.AmountFor', 'Amount for {name}')}
    optionDataAttr="data-recipe-option-amount-mode"
    onChange={setMode}
  />
  {#if rolled}
    <RollDataExpressionInput
      value={stored}
      placeholder="1d4+1"
      {disabled}
      data-recipe-option-formula=""
      aria-label={amount.formulaAriaLabel ||
        named('FABRICATE.Admin.Manager.Recipe.RolledAmountFor', 'Rolled amount for {name}')}
      title={text(
        'FABRICATE.Admin.Manager.Recipe.RolledAmountHint',
        'A dice expression such as 1d4+1, rolled when the result is awarded. A missing character value counts as 0.'
      )}
      aria-invalid={invalid ? 'true' : undefined}
      aria-describedby={invalid ? errorId : undefined}
      onChange={writeFormula}
    />
  {:else}
    {@render stepper()}
  {/if}
  {@render notes()}
{:else if amount.unit || invalid}
  {@render stepper()}
  {@render notes()}
{:else}
  {@render stepper()}
{/if}

<style>
  /* Notes hang on lines under the controls, on any host: `contain: inline-size` gives them no
     intrinsic width, and the negative end margin cancels the gap they would add to the row. */
  .fab-picker-row-amount-formula {
    display: flex;
    flex-wrap: wrap;
    align-items: flex-start;
    gap: var(--fab-space-1) var(--fab-space-2);
    min-width: 0;
  }

  .fab-picker-row-amount-field {
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    gap: var(--fab-space-1);
    min-width: 0;
    padding-block-start: 1px;
    align-self: flex-start;
  }

  .fab-picker-row-amount-note {
    order: 1;
    flex: 0 0 100%;
    margin-inline-end: calc(-1 * var(--fab-space-2));
    contain: inline-size;
    font-size: 0.66rem;
  }

  .fab-picker-row-amount-hint {
    color: var(--fab-text-muted);
  }
</style>
