<!--
  A clamped numeric stepper whose PRIMARY control is a real, typeable `<input type="number">` styled
  mono; the −/+ buttons are adjuncts, not the only path. A click-only stepper is a keyboard
  regression, so the input always stays editable. An import-free leaf: props only, no util imports.

  Props:
  | prop | values | default | contract |
  | --- | --- | --- | --- |
  | `value` | number \| `null` \| `undefined` \| `''` | `null` | `null` rather than `0` deliberately: `$props()` fallbacks fire on `undefined`, so a `0` default would resolve before `allowUnset` was consulted and render `0` for a field its caller left unset. |
  | `min` / `max` / `step` | numbers \| `null` | `null` / `null` / `1` | Inclusive clamp bounds, where `null` disables that bound, and the increment the −/+ buttons apply. |
  | `ariaLabel` / `decrementLabel` / `incrementLabel` | localized strings | `''` | The input's accessible name — never a wrapping `<label>`, see the invariants — and the adjuncts'. This leaf localizes nothing itself. |
  | `disabled` | boolean | `false` | Disables the whole control. |
  | `allowUnset` | boolean | `false` | The field's domain admits absence. Use it only where `null` genuinely persists — a field that merely LOOKS blank for zero keeps the default and shows `0`. |
  | `placeholder` / `fill` | string / boolean | `''` / `false` | `placeholder` shows while the input is empty and WINS over `inputProps.placeholder`; `fill` sets `width: 100%`, so it stretches correctly only inside a slot that already has an intrinsic width, and is mutually exclusive with `orientation="vertical"`. |
  | `orientation` | `'horizontal'` \| `'vertical'` | `'horizontal'` | An ORDER, not a second control: the two branches render the same three snippets in a different sequence, and draw a different pair of icons. |
  | `density` | `'default'` \| `'comfortable'` | `'default'` | `comfortable` raises EVERY target — the typeable input included — to at least 24x24 for WCAG 2.2 §2.5.8. |
  | `inputProps` | plain object | `{}` | Extra ATTRIBUTES spread onto the underlying `<input>`. See the invariants. |

  Callbacks:
  - `onChange(value)` — the clamped number on every accepted edit, and `null` when an `allowUnset`
    field is cleared.

  Invariants:
  - `inputProps` CARRIES ATTRIBUTES AND `data-*` ONLY, NEVER EVENT HANDLERS. The spread sits after
    `oninput={onInput} onblur={onBlur}` — it has to, so an explicit attribute a caller passes wins —
    which means an `oninput` or `onblur` routed through it silently REPLACES the commit path: the
    control keeps rendering and stepping and simply stops reporting edits. Put behaviour in
    `onChange`.
  - `disabled` is the TOP-LEVEL prop, never an `inputProps` key: the adjuncts read the top-level
    prop, so `inputProps={{ disabled: … }}` would leave −/+ live on a control the caller believes is
    off while every DOM assertion checking `input.disabled` still passed.
  - NAMING IS `ariaLabel`, NEVER A WRAPPING `<label>`. A `<label>` with no `for` binds to its FIRST
    labelable descendant, which here is the − button, so a caption and a Stepper inside one
    `<label>` makes clicking the caption DECREMENT the value;
    `tests/components/stepper-call-site-contract.test.js` fails any such `<label>` in `src/ui/svelte`
    while allowing a `<label for>` naming the input's own id, which is a different binding.
-->
<script>
  let {
    value = null,
    min = null,
    max = null,
    step = 1,
    ariaLabel = '',
    decrementLabel = '',
    incrementLabel = '',
    disabled = false,
    allowUnset = false,
    placeholder = '',
    fill = false,
    orientation = 'horizontal',
    density = 'default',
    inputProps = {},
    onChange = () => {},
  } = $props();

  const isVertical = $derived(orientation === 'vertical');
  const isComfortable = $derived(density === 'comfortable');

  function clamp(candidate) {
    let next = candidate;
    if (min !== null && min !== undefined && next < min) next = min;
    if (max !== null && max !== undefined && next > max) next = max;
    return next;
  }

  const numericValue = $derived(Number.isFinite(Number(value)) ? Number(value) : 0);

  const isUnset = $derived(allowUnset && (value === null || value === undefined || value === ''));

  const displayValue = $derived(isUnset ? '' : numericValue);

  const stepFrom = $derived(isUnset ? (min ?? 0) : numericValue);

  const atMin = $derived(!isUnset && min !== null && min !== undefined && numericValue <= min);
  const atMax = $derived(!isUnset && max !== null && max !== undefined && numericValue >= max);

  const resolvedPlaceholder = $derived(placeholder || inputProps.placeholder || undefined);

  const decrementIcon = $derived(isVertical ? 'fa-chevron-down' : 'fa-minus');
  const incrementIcon = $derived(isVertical ? 'fa-chevron-up' : 'fa-plus');

  function commit(candidate) {
    if (!Number.isFinite(candidate)) return;
    const next = clamp(candidate);
    if (isUnset || next !== numericValue) onChange(next);
  }

  function onInput(event) {
    const raw = event.currentTarget.value;
    if (raw === '') {
      if (allowUnset) onChange(null);
      return;
    }
    commit(Number(raw));
  }

  function onBlur(event) {
    const raw = event.currentTarget.value;
    if (raw === '' && allowUnset) return;
    const parsed = Number(raw);
    const next = raw === '' || !Number.isFinite(parsed) ? numericValue : clamp(parsed);
    event.currentTarget.value = String(next);
    if (next !== numericValue) onChange(next);
  }
</script>

{#snippet numericField()}
  <input
    type="number"
    class="fab-stepper-input"
    data-stepper-input
    value={displayValue}
    min={min ?? undefined}
    max={max ?? undefined}
    {step}
    {disabled}
    aria-label={ariaLabel || undefined}
    oninput={onInput}
    onblur={onBlur}
    {...inputProps}
    placeholder={resolvedPlaceholder}
  />
{/snippet}

{#snippet decrementAdjunct()}
  <button
    type="button"
    class="fab-stepper-adjunct"
    data-stepper-decrement
    aria-label={decrementLabel || undefined}
    disabled={disabled || atMin}
    onclick={() => commit(stepFrom - step)}
  >
    <i class="fas {decrementIcon}" aria-hidden="true"></i>
  </button>
{/snippet}

{#snippet incrementAdjunct()}
  <button
    type="button"
    class="fab-stepper-adjunct"
    data-stepper-increment
    aria-label={incrementLabel || undefined}
    disabled={disabled || atMax}
    onclick={() => commit(stepFrom + step)}
  >
    <i class="fas {incrementIcon}" aria-hidden="true"></i>
  </button>
{/snippet}

<div
  class="fab-stepper"
  class:is-disabled={disabled}
  class:is-vertical={isVertical}
  class:is-comfortable={isComfortable}
  class:is-fill={fill}
>
  {#if isVertical}
    {@render incrementAdjunct()}
    {@render numericField()}
    {@render decrementAdjunct()}
  {:else}
    {@render decrementAdjunct()}
    {@render numericField()}
    {@render incrementAdjunct()}
  {/if}
</div>

<style>
  .fab-stepper {
    display: inline-flex;
    align-items: center;
    gap: var(--fab-space-2xs);
    padding: var(--fab-space-2xs);
    border: 1px solid var(--fab-border);
    border-radius: 8px;
    background: var(--fab-surface-soft);
  }

  .fab-stepper.is-disabled {
    opacity: 0.55;
  }

  .fab-stepper.is-vertical {
    flex-direction: column;
    width: 100%;
    padding: var(--fab-space-2xs) 0;
    gap: 0;
    background: transparent;
    border: 0;
  }

  .fab-stepper.is-vertical .fab-stepper-adjunct {
    width: 100%;
    height: 26px;
    border-radius: 6px;
    font-size: 0.7rem;
  }

  .fab-stepper.is-vertical .fab-stepper-input {
    width: 100%;
    height: 30px;
    font-size: 1.05rem;
    font-weight: 600;
  }

  .fab-stepper.is-comfortable:not(.is-vertical) .fab-stepper-adjunct {
    width: 24px;
    height: 24px;
  }

  .fab-stepper.is-fill:not(.is-vertical) {
    display: flex;
    box-sizing: border-box;
    width: 100%;
    height: var(--fab-stepper-fill-height, 36px);
  }

  .fab-stepper.is-fill:not(.is-vertical) .fab-stepper-input {
    flex: 1 1 0;
    width: auto;
    min-width: 0;
    height: 100%;
  }

  .fab-stepper.is-fill.is-comfortable:not(.is-vertical) .fab-stepper-input {
    height: 100%;
    min-height: 24px;
  }

  .fab-stepper-adjunct {
    appearance: none;
    -webkit-appearance: none;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 22px;
    height: 22px;
    min-height: 0;
    padding: 0;
    border: 0;
    border-radius: 6px;
    color: var(--fab-text-subtle);
    background: transparent;
    font-size: 0.62rem;
    line-height: 1;
    cursor: pointer;
  }

  .fab-stepper-adjunct:hover:not(:disabled) {
    color: var(--fab-text);
    background: var(--fab-surface-active);
  }

  .fab-stepper-adjunct:disabled {
    color: var(--fab-text-disabled);
    cursor: default;
  }

  .fab-stepper-input {
    width: 48px;
    height: 22px;
    min-height: 0;
    padding: 0 var(--fab-space-2xs);
    border: 0;
    border-radius: 6px;
    color: var(--fab-text);
    background: transparent;
    font-family: var(--fab-font-mono);
    font-size: 0.74rem;
    font-weight: 500;
    text-align: center;
    appearance: textfield;
  }

  .fab-stepper-input::-webkit-outer-spin-button,
  .fab-stepper-input::-webkit-inner-spin-button {
    appearance: none;
    -webkit-appearance: none;
    margin: 0;
  }

  .fab-stepper-input:focus-visible {
    outline: 2px solid var(--fab-accent);
    outline-offset: 1px;
  }

  .fab-stepper-adjunct:focus-visible {
    outline: 2px solid var(--fab-accent);
    outline-offset: 1px;
  }
</style>
