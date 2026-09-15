<!--
  A clamped numeric stepper whose PRIMARY control is a real, typeable `<input type="number">`
  styled mono; the −/+ buttons are adjuncts, not the only path. A click-only stepper is a keyboard
  regression, so the input always stays editable and the buttons never become the sole affordance.

  Props:
  | prop | values | default | contract |
  | --- | --- | --- | --- |
  | `value` | number \| `null` \| `undefined` \| `''` | `null` | `null` rather than `0` deliberately: `$props()` fallbacks fire on `undefined`, so a `0` default would resolve before `allowUnset` was consulted and render `0` for a field its caller left unset. |
  | `min` / `max` | number \| `null` | `null` | Inclusive clamp bounds; `null` disables that bound. |
  | `step` | number | `1` | The increment the −/+ buttons apply. |
  | `ariaLabel` | localized string | `''` | The input's accessible name. See the invariants: never a wrapping `<label>`. |
  | `decrementLabel` / `incrementLabel` | localized string | `''` | Accessible names for the adjuncts. This leaf localizes nothing itself. |
  | `disabled` | boolean | `false` | Disables the whole control. |
  | `allowUnset` | boolean | `false` | The field's domain admits absence. Use it only where `null` genuinely persists — a field that merely LOOKS blank for zero must keep the default and show `0`. |
  | `placeholder` | string | `''` | Shown while the input is empty. WINS over `inputProps.placeholder`. |
  | `fill` | boolean | `false` | Sets `width: 100%`, so it only stretches correctly inside a slot that already has an intrinsic width. Mutually exclusive with `orientation="vertical"`. |
  | `orientation` | `'horizontal'` \| `'vertical'` | `'horizontal'` | An ORDER, not a second control: the two branches render the same three snippets in a different sequence, and draw a different pair of icons. |
  | `density` | `'default'` \| `'comfortable'` | `'default'` | `comfortable` raises EVERY target — the typeable input included — to at least 24x24 for WCAG 2.2 §2.5.8. |
  | `inputProps` | plain object | `{}` | Extra ATTRIBUTES spread onto the underlying `<input>`. See the invariants. |

  Callbacks:
  - `onChange(value)` — the clamped number on every accepted edit, and `null` when an
    `allowUnset` field is cleared.

  Invariants:
  - `inputProps` CONTRACT — attributes and `data-*` only, NEVER event handlers. The spread sits
    after `oninput={onInput} onblur={onBlur}` on the input (it has to, so an explicit attribute a
    caller passes wins over the primitive's default), which means an `oninput` or `onblur` routed
    through `inputProps` silently REPLACES this component's commit path: the control keeps
    rendering and stepping and simply stops reporting edits, with nothing failing loudly. Pass
    hooks and attributes through `inputProps`; put behaviour in `onChange`.
  - `disabled` is the TOP-LEVEL prop, never an `inputProps` key. The adjuncts read the top-level
    prop (`disabled || atMin` / `disabled || atMax`), so `inputProps={{ disabled: … }}` would
    disable only the input and leave −/+ live on a control the caller believes is off — and every
    DOM assertion that checks `input.disabled` would still pass, so the defect ships green.
  - NAMING IS `ariaLabel`, NEVER A WRAPPING `<label>`. A `<label>` with no `for` binds to its
    FIRST labelable descendant, and this component's is the − button: a caption and a Stepper
    inside one `<label>` therefore makes clicking the caption DECREMENT the value instead of
    focusing the field. Call sites spell it as a `<div>` with a sibling `<span>` caption and pass
    the name through `ariaLabel`.
    `tests/components/stepper-call-site-contract.test.js` fails any `<label>` in `src/ui/svelte`
    that wraps a Stepper this way. A `<label for>` naming the input's own id is a DIFFERENT and
    correct binding — HTML consults descendants only when `for` is absent — so the guard allows
    it.
  - IMPORT-FREE LEAF: props only, no `foundryBridge`, no util imports. One util import inside a
    leaf propagates a required raw-module entry into every mount harness that compiles anything
    rendering it, and a missing entry HANGS that suite as `# cancelled` rather than failing it.
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
    // `true`: blank renders blank, clearing commits `null`, blur leaves a blank field blank,
    // and the adjuncts step from `min ?? 0` and stay enabled while there is nothing to be at
    // the bound of. `false`: a blank entry is coerced back to the model value on blur.
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

  // Whether the field currently holds nothing. It cannot be read off `numericValue`:
  // `Number(null)` and `Number('')` are both a perfectly finite `0`, which is the whole
  // reason absence has to be decided from the raw prop instead.
  const isUnset = $derived(allowUnset && (value === null || value === undefined || value === ''));

  // A NAMED derived rather than an inline ternary: both orientation branches need it, and
  // inlining would nest one ternary inside the markup's existing expressions (Sonar S3358).
  const displayValue = $derived(isUnset ? '' : numericValue);

  // An unset field's adjuncts step from its lower bound, not from the `0` that
  // `Number(null)` coerces to — `+` on an unset `min={5}` field commits 6, not 1.
  const stepFrom = $derived(isUnset ? (min ?? 0) : numericValue);

  // Nothing is "at the bound" while there is no value, so neither adjunct is disabled
  // then; without the guard the coerced `0` would read as at-min on any `min >= 0`.
  const atMin = $derived(!isUnset && min !== null && min !== undefined && numericValue <= min);
  const atMax = $derived(!isUnset && max !== null && max !== undefined && numericValue >= max);

  // Explicit prop first, `inputProps` as the fallback: the spread has to stay last in
  // the markup, so precedence is resolved here instead of by attribute order.
  const resolvedPlaceholder = $derived(placeholder || inputProps.placeholder || undefined);

  // The ONLY thing that differs between the two orientations besides render order.
  const decrementIcon = $derived(isVertical ? 'fa-chevron-down' : 'fa-minus');
  const incrementIcon = $derived(isVertical ? 'fa-chevron-up' : 'fa-plus');

  function commit(candidate) {
    if (!Number.isFinite(candidate)) return;
    const next = clamp(candidate);
    // An unset field always commits: blank → 0 is a real edit even though
    // `numericValue` already reads 0.
    if (isUnset || next !== numericValue) onChange(next);
  }

  // A partially typed value ('', '-') must not be coerced to 0 mid-keystroke, so
  // only a finite parse commits; the field re-syncs from `value` on blur. Where the
  // caller allows absence, clearing the field IS the edit and commits `null`.
  function onInput(event) {
    const raw = event.currentTarget.value;
    if (raw === '') {
      if (allowUnset) onChange(null);
      return;
    }
    commit(Number(raw));
  }

  // Blur re-asserts the clamped model value over whatever the field holds, so an
  // out-of-range or empty entry cannot survive as displayed state. A field that
  // allows absence is the exception: blank is legal there, so blur leaves it blank
  // and reports nothing rather than re-asserting a value the user just removed.
  function onBlur(event) {
    const raw = event.currentTarget.value;
    if (raw === '' && allowUnset) return;
    const parsed = Number(raw);
    const next = raw === '' || !Number.isFinite(parsed) ? numericValue : clamp(parsed);
    event.currentTarget.value = String(next);
    if (next !== numericValue) onChange(next);
  }
</script>

<!-- `type="number"` is load-bearing: this component owns no keydown handler, so Up/Down are
     native number-input behaviour that fires `input` and lands in `onInput` → `commit`.
     `tests/components/stepper-spinner.test.js` pins that, and pins that BOTH branches render
     this one snippet rather than growing a second field. -->
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
    <!-- Increment on TOP, so the stack reads the way a spinner does. -->
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

  /* `:not(.is-vertical)` is a GUARD, not decoration. The vertical rules above have the same
     specificity as these, so a caller combining `orientation="vertical"` with
     `density="comfortable"` would resolve on source order alone and SHRINK the spinner to
     24px — narrower than the full-width column it exists to fill. */
  .fab-stepper.is-comfortable:not(.is-vertical) .fab-stepper-adjunct {
    width: 24px;
    height: 24px;
  }

  /* `--fab-stepper-fill-height` is a custom property rather than a constant because the
     candidate layout contexts do NOT agree: 30px on the economy actor cells, 34px on the tool
     inline fields, 28px on the environment composition weight field. Taking a SIZE from the
     layout context is permitted — what a layout-context rule must not restyle is the
     primitive's `font-*`, `border`, `border-radius` and `background`.

     `box-sizing` is declared HERE rather than inherited. The only universal reset in the
     global sheet is area-scoped, and this is an import-free leaf that cannot see which area
     it was dropped into. Without it the declared height becomes a CONTENT height and the
     control stands 42px outside the manager, 6px taller than the siblings it exists to
     match. It is also what makes `height: 100%` on the input below resolve in both. */
  .fab-stepper.is-fill:not(.is-vertical) {
    display: flex;
    box-sizing: border-box;
    width: 100%;
    height: var(--fab-stepper-fill-height, 36px);
  }

  /* `min-width: 0` is LOAD-BEARING. Per Flexbox §4.5 an item's automatic minimum size is
     min(specified size suggestion, content size suggestion), and `width: auto` here removes
     the specified suggestion, leaving the UA min-content width of an `<input>` (~140-180px).
     Without `min-width: 0` a filled stepper would OVERFLOW the 160px slot it exists to
     fill. */
  .fab-stepper.is-fill:not(.is-vertical) .fab-stepper-input {
    flex: 1 1 0;
    width: auto;
    min-width: 0;
    height: 100%;
  }

  /* `fill` + `comfortable` is declared EXPLICITLY, at (0,5,0), because the rule above and
     `.fab-stepper.is-comfortable:not(.is-vertical) .fab-stepper-input` both resolve at
     (0,4,0) — so the combination would otherwise be settled by source order alone and could
     pin the input to 24px inside a 36px wrapper. The input is borderless, so the visible box
     is the WRAPPER and the typeable target would be 12px shorter than it looks. The two are
     REQUIRED together on the economy actor cells. */
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
    /* Firefox and the standard property. See the spin-button rule below. */
    appearance: textfield;
  }

  /* NO native spinner, and the element STAYS `type="number"`. Suppressing the
     pseudo-elements removes only the drawn buttons, whereas switching to `type="text"` would
     silently delete the keyboard stepping this component exists to protect.
     `tests/components/stepper-spinner.test.js` pins both halves. */
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
