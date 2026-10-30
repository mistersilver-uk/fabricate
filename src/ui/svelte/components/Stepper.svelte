<!--
  A clamped numeric stepper whose PRIMARY control is a real, typeable `<input type="number">` styled
  mono, or a spinbutton text input in the formatted mode; the −/+ buttons are adjuncts. A click-only
  stepper is a keyboard regression, so the input stays editable. It imports nothing but Svelte.

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
  | `formatValue` / `parseValue` | functions \| `null` | `null` | Both together opt into the FORMATTED mode below; without them the `type="number"` path and its commit-on-input are unchanged. `parseValue(text)` returns a finite number, `null` for the null endpoint, or anything else for invalid text. |
  | `format` | `'signed'` \| `'unlimited'` | `''` | A built-in formatter, the published way into the FORMATTED mode; `formatValue` and `parseValue` win where both are given, and any other value leaves the `type="number"` path. `signed` draws a leading `+` on positives; `unlimited` draws `0` as `nullLabel` and reports `0` rather than `null`. Typing `nullLabel` selects the endpoint. |
  | `stops` | `number[]` | `[]` | The formatted mode's ordered stepping values. Empty steps by `step` within `min`/`max`. |
  | `nullLabel` | string | `''` | Names the formatted mode's null endpoint (Otherwise), one step below the lowest stop, or the `unlimited` zero. Without it a `null` value is unset: blank, with the placeholder. At the endpoint the input carries `data-stepper-endpoint`, reads muted at rest and, horizontal and unfilled, widens to the label's character count, so only a mono Latin label fits exactly. |

  Callbacks:
  - `onChange(value)` — the clamped number on every accepted edit, and `null` when an `allowUnset`
    field is cleared or the formatted mode selects its null endpoint.

  Invariants:
  - `inputProps` CARRIES ATTRIBUTES AND `data-*` ONLY, NEVER EVENT HANDLERS. The spread sits after
    `oninput={onInput} onblur={onBlur}` so an explicit attribute wins, which means an `oninput` or
    `onblur` routed through it silently REPLACES the commit path. Put behaviour in `onChange`.
  - A refused value snaps back on blur, in both modes: after the next flush a blurred input still
    connected and unfocused is rewritten to the held value.
  - `disabled` is the TOP-LEVEL prop, never an `inputProps` key: the adjuncts read the top-level
    prop, so `inputProps={{ disabled: … }}` would leave −/+ live on a control that looks off.
  - NAMING IS `ariaLabel`, NEVER A WRAPPING `<label>`: a `<label>` with no `for` binds to its FIRST
    labelable descendant, the − button, so clicking the caption would DECREMENT the value;
    `tests/components/stepper-call-site-contract.test.js` fails any such `<label>`.
  - THE FORMATTED MODE is a `role="spinbutton"` text input that commits only on Enter or blur, and
    restores its committed display for invalid text. Enter never submits an enclosing form, and
    Escape during an edit restores without blurring and stops before Foundry's `core.dismiss`.
    Stepping moves to the nearest strictly greater or smaller stop, so an off-list value stays exact
    until stepped; `tests/components/stepper-formatted-mounted.test.js`.
-->
<script>
  import { tick } from 'svelte';

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
    formatValue = null,
    parseValue = null,
    format = '',
    stops = [],
    nullLabel = '',
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

  async function onBlur(event) {
    const input = event.currentTarget;
    const raw = input.value;
    if (raw !== '' || !allowUnset) {
      const parsed = Number(raw);
      const next = raw === '' || !Number.isFinite(parsed) ? numericValue : clamp(parsed);
      input.value = String(next);
      if (next !== numericValue) onChange(next);
    }
    await tick();
    if (!input.isConnected || input.ownerDocument.activeElement === input) return;
    if (input.value !== String(displayValue)) input.value = String(displayValue);
  }

  const isBlank = (candidate) => candidate === null || candidate === undefined || candidate === '';

  const custom = $derived(typeof formatValue === 'function' && typeof parseValue === 'function');
  const builtIn = $derived(!custom && ['signed', 'unlimited'].includes(format) ? format : '');
  const unlimited = $derived(builtIn === 'unlimited');
  const isFormatted = $derived(custom || builtIn !== '');
  const numericStops = $derived(
    [...new Set((Array.isArray(stops) ? stops : []).filter(Number.isFinite))].sort((a, b) => a - b)
  );
  const lowestStop = $derived(numericStops[0] ?? min ?? null);
  const highestStop = $derived(numericStops.at(-1) ?? max ?? null);
  const hasEndpoint = $derived(isFormatted && typeof nullLabel === 'string' && nullLabel !== '');
  const endpointValue = $derived(unlimited ? 0 : null);
  const committedFrom = $derived(unlimited || !isBlank(value) ? numericValue : null);
  const atEndpoint = $derived(hasEndpoint && committedFrom === endpointValue);

  const SIGNED_NUMBER = /^[+\-\u2212]?(?:\d+(?:\.\d*)?|\.\d+)$/;
  const formatText = (number) =>
    custom
      ? formatValue(number)
      : builtIn === 'signed' && number > 0
        ? `+${number}`
        : String(number);

  function parseText(text) {
    if (custom) return parseValue(text);
    if (hasEndpoint && text.toLowerCase() === nullLabel.toLowerCase()) return null;
    return SIGNED_NUMBER.test(text) ? Number(text.replace('\u2212', '-')) : Number.NaN;
  }

  function displayFor(candidate) {
    if (hasEndpoint && candidate === endpointValue) return nullLabel;
    return candidate === null ? '' : String(formatText(candidate) ?? '');
  }

  const formattedDisplay = $derived(isFormatted ? displayFor(committedFrom) : '');

  /** The value one step from `from` (`null` is unset or the endpoint), or `undefined` to stay. */
  function formattedStep(from, direction) {
    if (hasEndpoint && from === endpointValue && direction < 0) return undefined;
    if (from === null) return lowestStop ?? 0;
    let next;
    if (numericStops.length === 0) next = clamp(from + direction * step);
    else if (direction > 0) next = numericStops.find((stop) => stop > from);
    else next = numericStops.findLast((stop) => stop < from);
    if (next !== undefined && next !== from) return next;
    return direction < 0 && hasEndpoint ? endpointValue : undefined;
  }

  const decrementBlocked = $derived(
    isFormatted ? formattedStep(committedFrom, -1) === undefined : atMin
  );
  const incrementBlocked = $derived(
    isFormatted ? formattedStep(committedFrom, 1) === undefined : atMax
  );

  async function emitFormatted(next, input) {
    if (next !== undefined) {
      const changed = next === null ? !isBlank(value) : isBlank(value) || next !== numericValue;
      if (changed) onChange(next);
    }
    if (!input) return;
    input.value = next === undefined ? formattedDisplay : displayFor(next);
    await tick();
    if (input.isConnected && input.ownerDocument.activeElement !== input)
      input.value = formattedDisplay;
  }

  function parsedDraft(text) {
    if (text === '') return !hasEndpoint && !unlimited && allowUnset ? null : undefined;
    const parsed = parseText(text);
    if (parsed === null) return hasEndpoint ? endpointValue : undefined;
    if (unlimited && hasEndpoint && parsed === 0) return endpointValue;
    return Number.isFinite(parsed) ? clamp(parsed) : undefined;
  }

  function commitDraft(input) {
    const typed = input.value.trim();
    emitFormatted(typed === formattedDisplay ? undefined : parsedDraft(typed), input);
  }

  function keyedValue(key) {
    if (key === 'ArrowUp') return formattedStep(committedFrom, 1);
    if (key === 'ArrowDown') return formattedStep(committedFrom, -1);
    if (key === 'Home') return lowestStop ?? undefined;
    if (key === 'End') return highestStop ?? undefined;
    return undefined;
  }

  function onFormattedKeydown(event) {
    const input = event.currentTarget;
    if (event.key === 'Escape') {
      if (input.value === formattedDisplay) return;
      event.preventDefault();
      event.stopPropagation();
      input.value = formattedDisplay;
      return;
    }
    if (event.key === 'Enter') {
      if (event.isComposing) return;
      event.preventDefault();
      commitDraft(input);
      return;
    }
    if (event.shiftKey || event.ctrlKey || event.altKey || event.metaKey) return;
    const next = keyedValue(event.key);
    const vertical = event.key === 'ArrowUp' || event.key === 'ArrowDown';
    if (next === undefined && !vertical) return;
    event.preventDefault();
    if (next !== undefined) emitFormatted(next, input);
  }

  function stepAdjunct(direction) {
    if (isFormatted) emitFormatted(formattedStep(committedFrom, direction), null);
    else commit(stepFrom + direction * step);
  }
</script>

{#snippet numericField()}
  {#if isFormatted}
    <input
      type="text"
      inputmode="decimal"
      role="spinbutton"
      class="fab-stepper-input"
      data-stepper-input
      data-stepper-endpoint={atEndpoint ? '' : undefined}
      value={formattedDisplay}
      {disabled}
      aria-label={ariaLabel || undefined}
      aria-valuemin={lowestStop ?? undefined}
      aria-valuemax={highestStop ?? undefined}
      aria-valuenow={atEndpoint ? undefined : (committedFrom ?? undefined)}
      aria-valuetext={formattedDisplay || undefined}
      onkeydown={onFormattedKeydown}
      onblur={(event) => commitDraft(event.currentTarget)}
      {...inputProps}
      placeholder={resolvedPlaceholder}
    />
  {:else}
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
  {/if}
{/snippet}

{#snippet decrementAdjunct()}
  <button
    type="button"
    class="fab-stepper-adjunct"
    data-keyboard-focus="true"
    data-stepper-decrement
    aria-label={decrementLabel || undefined}
    disabled={disabled || decrementBlocked}
    onclick={() => stepAdjunct(-1)}
  >
    <i class="fas {decrementIcon}" aria-hidden="true"></i>
  </button>
{/snippet}

{#snippet incrementAdjunct()}
  <button
    type="button"
    class="fab-stepper-adjunct"
    data-keyboard-focus="true"
    data-stepper-increment
    aria-label={incrementLabel || undefined}
    disabled={disabled || incrementBlocked}
    onclick={() => stepAdjunct(1)}
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
  style:--fab-stepper-endpoint-ch={hasEndpoint ? Array.from(nullLabel).length : undefined}
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
    border-radius: 7px;
    background: var(--fab-surface-soft);
  }

  .fab-stepper.is-disabled {
    opacity: 0.45;
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
    border-radius: 7px;
    font-size: 11px;
  }

  .fab-stepper.is-vertical .fab-stepper-input {
    width: 100%;
    height: 30px;
    font-size: 1.05rem;
    font-weight: 500;
  }

  .fab-stepper.is-comfortable:not(.is-vertical) .fab-stepper-adjunct {
    width: 24px;
    height: 24px;
  }

  .fab-stepper.is-fill:not(.is-vertical) {
    display: flex;
    box-sizing: border-box;
    width: 100%;
    height: var(--fab-stepper-fill-height, 38px);
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
    font-size: 9px;
    line-height: 1;
    cursor: pointer;
  }

  /* The 24px pointer target (WCAG 2.2 §2.5.8) of a 22px button: a 1px padding the negative margin
     gives back, so the row keeps its 22px and the 2px gap to the input. The background stays on the
     content box and takes the 7px corner that leaves it the drawn 6px, and the focus ring sits on
     the 24px edge, which is where the 22px box's ring sat at an offset of 1px. A positioned
     `::before` would paint the glyph a sub-pixel off. */
  .fab-stepper:not(.is-vertical):not(.is-comfortable) .fab-stepper-adjunct {
    box-sizing: border-box;
    width: 24px;
    height: 24px;
    margin: -1px;
    padding: 1px;
    /* ratchet-exempt(design-system): the 22px button's 6px corner outset by the 1px hit-area padding, so the content-box background still draws 6; retires if the adjunct moves to the ::before form or a hit-area token lands */
    border-radius: 7px;
    background-clip: content-box;
  }

  .fab-stepper:not(.is-vertical):not(.is-comfortable) .fab-stepper-adjunct:focus-visible {
    outline-offset: 0;
  }

  .fab-stepper-adjunct:hover:not(:disabled) {
    color: var(--fab-text);
    background: var(--fab-surface-raised);
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
    font-size: 11.5px;
    font-weight: 500;
    font-variant-numeric: tabular-nums;
    text-align: center;
    appearance: textfield;
  }

  /* The same 24px target for the typeable input, by a 1px border-box inset the negative margin gives
     back: the row keeps its 22px, the text stays centred and the focus ring stays where it was. */
  .fab-stepper:not(.is-vertical):not(.is-fill) .fab-stepper-input {
    box-sizing: border-box;
    height: 24px;
    margin-block: -1px;
  }

  .fab-stepper:not(.is-vertical):not(.is-fill) .fab-stepper-input[data-stepper-endpoint] {
    /* 4px is the border-box input's two 2px inline paddings, around the label's own width. */
    width: max(64px, calc(var(--fab-stepper-endpoint-ch) * 1ch + 4px));
  }

  .fab-stepper-input[data-stepper-endpoint]:not(:focus-visible) {
    color: var(--fab-text-muted);
  }

  /* The unset placeholder is text: muted clears 4.5:1 where the user-agent grey does not. */
  .fab-stepper-input:not(:focus-visible)::placeholder {
    color: var(--fab-text-muted);
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

  .fab-stepper:not(.is-vertical):not(.is-fill) .fab-stepper-input:focus-visible {
    outline-offset: 0;
  }

  .fab-stepper-adjunct:focus-visible {
    outline: 2px solid var(--fab-accent);
    outline-offset: 1px;
  }
</style>
