<!-- Svelte 5 runes mode -->
<!--
  A clamped numeric stepper whose PRIMARY control is a real, typeable
  `<input type="number">` styled mono; the −/+ buttons are adjuncts, not the
  only path. A click-only stepper is a keyboard regression, so the input always
  stays editable and the buttons never become the sole affordance.

  Import-free leaf (design-system §7): props only — no foundryBridge, no model or
  util imports. Callers pass an already-localized `ariaLabel`. One util import
  inside a leaf would propagate a required raw-module entry into every mount
  harness that compiles anything rendering it (a missing entry HANGS the suite as
  `# cancelled` rather than failing).

  Props:
   - value: the current number.
   - min / max: inclusive clamp bounds (`null` disables that bound).
   - step: increment applied by the −/+ buttons (default 1).
   - ariaLabel: accessible name for the input (already localized).
   - decrementLabel / incrementLabel: accessible names for the adjunct buttons.
   - disabled: disables the whole control.
   - onChange(value): called with the clamped number on every accepted edit.
-->
<script>
  let {
    value = 0,
    min = null,
    max = null,
    step = 1,
    ariaLabel = '',
    decrementLabel = '',
    incrementLabel = '',
    disabled = false,
    // 'horizontal' (default): [−] [input] [+], for inline quantities.
    // 'vertical': up-chevron / big mono input / down-chevron, for the Overview
    // duration unit columns — the increment sits on TOP so the visual stacks the
    // way a spinner reads.
    orientation = 'horizontal',
    // Extra attributes spread onto the underlying `<input>` (e.g. a test/marker
    // `data-*` hook a caller relies on). Import-free: a plain object, so this leaf
    // still carries no module dependency into the mount harnesses.
    inputProps = {},
    onChange = () => {}
  } = $props();

  const isVertical = $derived(orientation === 'vertical');

  function clamp(candidate) {
    let next = candidate;
    if (min !== null && min !== undefined && next < min) next = min;
    if (max !== null && max !== undefined && next > max) next = max;
    return next;
  }

  const numericValue = $derived(Number.isFinite(Number(value)) ? Number(value) : 0);
  const atMin = $derived(min !== null && min !== undefined && numericValue <= min);
  const atMax = $derived(max !== null && max !== undefined && numericValue >= max);

  function commit(candidate) {
    if (!Number.isFinite(candidate)) return;
    const next = clamp(candidate);
    if (next !== numericValue) onChange(next);
  }

  // A partially typed value ('', '-') must not be coerced to 0 mid-keystroke, so
  // only a finite parse commits; the field re-syncs from `value` on blur.
  function onInput(event) {
    const raw = event.currentTarget.value;
    if (raw === '') return;
    commit(Number(raw));
  }

  // Blur re-asserts the clamped model value over whatever the field holds, so an
  // out-of-range or empty entry cannot survive as displayed state.
  function onBlur(event) {
    const raw = event.currentTarget.value;
    const parsed = Number(raw);
    const next = raw === '' || !Number.isFinite(parsed) ? numericValue : clamp(parsed);
    event.currentTarget.value = String(next);
    if (next !== numericValue) onChange(next);
  }
</script>

<div class="fab-stepper" class:is-disabled={disabled} class:is-vertical={isVertical}>
  {#if isVertical}
    <button
      type="button"
      class="fab-stepper-adjunct"
      data-stepper-increment
      aria-label={incrementLabel || undefined}
      disabled={disabled || atMax}
      onclick={() => commit(numericValue + step)}
    >
      <i class="fas fa-chevron-up" aria-hidden="true"></i>
    </button>
    <input
      type="number"
      class="fab-stepper-input"
      data-stepper-input
      value={numericValue}
      min={min ?? undefined}
      max={max ?? undefined}
      {step}
      {disabled}
      aria-label={ariaLabel || undefined}
      oninput={onInput}
      onblur={onBlur}
      {...inputProps}
    />
    <button
      type="button"
      class="fab-stepper-adjunct"
      data-stepper-decrement
      aria-label={decrementLabel || undefined}
      disabled={disabled || atMin}
      onclick={() => commit(numericValue - step)}
    >
      <i class="fas fa-chevron-down" aria-hidden="true"></i>
    </button>
  {:else}
    <button
      type="button"
      class="fab-stepper-adjunct"
      data-stepper-decrement
      aria-label={decrementLabel || undefined}
      disabled={disabled || atMin}
      onclick={() => commit(numericValue - step)}
    >
      <i class="fas fa-minus" aria-hidden="true"></i>
    </button>
    <input
      type="number"
      class="fab-stepper-input"
      data-stepper-input
      value={numericValue}
      min={min ?? undefined}
      max={max ?? undefined}
      {step}
      {disabled}
      aria-label={ariaLabel || undefined}
      oninput={onInput}
      onblur={onBlur}
      {...inputProps}
    />
    <button
      type="button"
      class="fab-stepper-adjunct"
      data-stepper-increment
      aria-label={incrementLabel || undefined}
      disabled={disabled || atMax}
      onclick={() => commit(numericValue + step)}
    >
      <i class="fas fa-plus" aria-hidden="true"></i>
    </button>
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

  /* Vertical spinner (Overview duration columns): up-chevron / big mono value /
     down-chevron stacked, filling the column width. */
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

  /* The typeable input is the control; the buttons only nudge it. */
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
