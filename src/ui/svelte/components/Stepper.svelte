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
   - value: the current number, or `null` / `undefined` / `''` for an UNSET field
     (see `allowUnset`). The default is `null` rather than `0` deliberately: Svelte
     5's `$props()` fallback fires on `undefined`, so a `0` default would resolve
     before `allowUnset` was ever consulted and render `0` for a field its caller
     left unset. `Number(null) === 0`, which is exactly what `numericValue` already
     produced, so `allowUnset={false}` is unaffected by the change.
   - min / max: inclusive clamp bounds (`null` disables that bound).
   - step: increment applied by the −/+ buttons (default 1).
   - ariaLabel: accessible name for the input (already localized).
   - decrementLabel / incrementLabel: accessible names for the adjunct buttons.
     Localize `FABRICATE.Common.Stepper.Decrease` / `FABRICATE.Common.Stepper.Increase`
     against the field's own label; this leaf localizes nothing itself.
   - disabled: disables the whole control.
   - allowUnset: the field's domain admits absence (an inherited DC override, an
     unbounded modifier bound). See the block comment on the prop.
   - placeholder: shown while the input is empty. Wins over `inputProps.placeholder`.
   - fill: stretch to the layout slot instead of sizing to content. See the CSS.
   - inputProps: extra ATTRIBUTES spread onto the underlying `<input>`.
   - onChange(value): called with the clamped number on every accepted edit, and with
     `null` when an `allowUnset` field is cleared.

  ORIENTATION is an ORDER, not a second control. The input and the two adjuncts are
  declared once each as `{#snippet}`s and the two branches differ only in the sequence
  they `{@render}` them in (and in which icon each adjunct draws). They used to be
  written out twice, which meant every change to the field — the `allowUnset` display
  value, the `inputProps` spread, a `data-*` hook — had to be made in two places and was
  a live clone the moment one of them was.

  `inputProps` CONTRACT — attributes and `data-*` only, NEVER event handlers. The
  spread sits after `oninput={onInput} onblur={onBlur}` on the input (it has to, so an
  explicit attribute a caller passes wins over the primitive's default), which means an
  `oninput` or `onblur` routed through `inputProps` silently REPLACES this component's
  commit path: the control keeps rendering and stepping and simply stops reporting
  edits, with nothing failing loudly. Pass hooks and attributes through `inputProps`;
  put behaviour in `onChange`.

  `disabled` is the TOP-LEVEL prop, never an `inputProps` key. The adjuncts read the
  top-level prop (`disabled || atMin` / `disabled || atMax`), so `inputProps={{
  disabled: … }}` would disable only the input and leave −/+ live on a control the
  caller believes is off — and every DOM assertion that checks `input.disabled` would
  still pass, so the defect ships green.
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
    // `false` (default): today's behaviour unchanged — a blank entry is coerced back
    // to the model value on blur and never committed, and `0` renders as `0`.
    // `true`: absence is a real value in this field's domain, so blank renders blank,
    // clearing commits `null`, blur leaves a blank field blank, and the adjuncts step
    // from `min ?? 0` and stay enabled while there is nothing to be at the bound of.
    // Use it only where `null` genuinely persists — a field that merely LOOKS blank
    // for zero must keep the default and show `0`.
    allowUnset = false,
    // Placeholder text for the input. The explicit prop WINS over
    // `inputProps.placeholder`; either route reaches the rendered input.
    placeholder = '',
    // `true`: fill the layout slot rather than sizing to content. Mutually exclusive
    // with `orientation="vertical"`, which is already full-width. See the CSS.
    fill = false,
    // 'horizontal' (default): [−] [input] [+], for inline quantities.
    // 'vertical': up-chevron / big mono input / down-chevron, for the Overview
    // duration unit columns — the increment sits on TOP so the visual stacks the
    // way a spinner reads.
    orientation = 'horizontal',
    // 'default': the compact 22px control the manager's dense editors use.
    // 'comfortable': every target — the typeable input INCLUDED, not just the −/+
    // adjuncts — raised to at least 24x24 for WCAG 2.2 §2.5.8. The input is the
    // primary control, so raising only the adjuncts would leave the real target
    // undersized. Used by the crafting essence pool, whose steppers are the main
    // interaction of that panel rather than an inline field tweak.
    density = 'default',
    // Extra ATTRIBUTES spread onto the underlying `<input>` (e.g. a test/marker
    // `data-*` hook a caller relies on). Attributes and `data-*` only — never event
    // handlers; see the `inputProps` CONTRACT note in the header. Import-free: a
    // plain object, so this leaf still carries no module dependency into the mount
    // harnesses.
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

  // What the input renders. A NAMED derived rather than an inline ternary, because both
  // orientation branches need it and inlining would nest one ternary inside the markup's
  // existing expressions (Sonar S3358).
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
  // Vertical stacks the pair as a spinner, so it draws chevrons and reads top-to-bottom;
  // horizontal sits inline around the field, so it draws − and +.
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

<!-- The typeable control. `type="number"` is load-bearing: this component owns no keydown
     handler, so Up/Down are native number-input behaviour that fires `input` and lands in
     `onInput` → `commit`. `tests/components/stepper-spinner.test.js` pins that, and pins
     that BOTH branches below render this one snippet rather than growing a second field. -->
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

  /* WCAG 2.2 §2.5.8 minimum target: 24x24 CSS px on EVERY target, the typeable input
     included. The compact default stays 22px because it sits inside dense manager
     editor rows where it is one field among many; this variant is for a control that
     IS the interaction.

     `:not(.is-vertical)` is a GUARD, not decoration. The vertical rules above have the
     same specificity as these, so a caller combining `orientation="vertical"` with
     `density="comfortable"` would resolve on source order alone and SHRINK the spinner
     to 24px — narrower than the full-width column it exists to fill, and shorter than
     the 26/30px the vertical variant asks for. Excluding the combination here means
     vertical keeps its own (already >= 24px) geometry instead. */
  .fab-stepper.is-comfortable:not(.is-vertical) .fab-stepper-adjunct {
    width: 24px;
    height: 24px;
  }

  /* `fill`: stretch to the layout slot instead of sizing to content.

     This exists because the primitive is NARROWER than the bare fields it replaces on
     the pinned manager slots. A 102x28 borderless inline-flex island beside a 160x36
     `<select>` and a 160x36 disabled placeholder would change the control's width,
     height, border and fill on a mode swap — exactly what the UI spec's no-movement
     rule forbids. So the slot's pin stays and the primitive learns to fill it.

     `--fab-stepper-fill-height` defaults to 36px, the height `.manager-field
     input`/`select` and `.manager-checks-outcome-row input` both resolve to. It is a
     custom property rather than a constant because the candidate layout contexts do
     NOT agree: 30px on the economy actor cells, 34px on the tool inline fields, 28px
     on the environment composition weight field. Taking a SIZE from the layout context
     is permitted — what a layout-context rule must not restyle is the primitive's
     `font-*`, `border`, `border-radius` and `background`.

     `box-sizing` is declared HERE rather than inherited. The only universal reset in the
     global sheet is `.fabricate-manager * { box-sizing: border-box }`, which is area-scoped
     — `.fabricate-interactable-config` and `.fabricate-component-editor` get none — and this
     is an import-free leaf that cannot see which area it was dropped into. Without it the
     declared height becomes a CONTENT height and the control stands `36 + 4 padding + 2
     border` = 42px outside the manager, 6px taller than the siblings it exists to match.
     It is also what makes `height: 100%` on the input below resolve consistently in both.

     `:not(.is-vertical)` is the same GUARD the comfortable rules above carry. The
     vertical variant is already `width: 100%` with its own stacked 26/30px geometry,
     so `fill` is mutually exclusive with `orientation="vertical"`. */
  .fab-stepper.is-fill:not(.is-vertical) {
    display: flex;
    box-sizing: border-box;
    width: 100%;
    height: var(--fab-stepper-fill-height, 36px);
  }

  /* `min-width: 0` is LOAD-BEARING, not tidiness. `.fab-stepper-input`'s `width: 48px`
     below is the only thing keeping this flex item from overflowing: per Flexbox §4.5
     an item's automatic minimum size is min(specified size suggestion, content size
     suggestion), and the 48px width is what supplies the specified suggestion.
     `width: auto` removes it, leaving the UA min-content width of an `<input>`
     (default `size=20`, ~140-180px even at 0.74rem mono). Without `min-width: 0` a
     filled stepper's own minimum would be ~194px and it would OVERFLOW the 160px slot
     this variant exists to fill. */
  .fab-stepper.is-fill:not(.is-vertical) .fab-stepper-input {
    flex: 1 1 0;
    width: auto;
    min-width: 0;
    height: 100%;
  }

  /* `fill` + `comfortable` is declared EXPLICITLY, at (0,5,0), because the rule above
     and `.fab-stepper.is-comfortable:not(.is-vertical) .fab-stepper-input` both resolve
     at (0,4,0) — so the combination would otherwise be settled by source order alone
     and could pin the input to 24px inside a 36px wrapper. The input is borderless and
     transparent, so the visible box is the WRAPPER: the typeable target would be 12px
     shorter than it looks. The two variants are REQUIRED together on the economy actor
     cells, so this is a real combination, not a defensive one. */
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

  /* NO native spinner. This control already offers both ways to step — the −/+ adjuncts for
     the pointer, and the browser's own Up/Down handling for the keyboard — so the arrows are
     a third affordance that duplicates both. They also cost real room: the field is 48px and
     the spinner takes ~13-17px of it, shunting the centred mono value off-centre.

     The element STAYS `type="number"`. This component has no keydown handler of its own:
     Up/Down work purely as native number-input behaviour, which fires `input` and lands in
     `onInput` → `commit`. Suppressing the pseudo-elements removes only the drawn buttons and
     leaves that intact, whereas switching to `type="text"` would silently delete the keyboard
     stepping this component's header says it exists to protect.
     `tests/components/stepper-spinner.test.js` pins both halves of that. */
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
