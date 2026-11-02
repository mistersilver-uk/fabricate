<!--
  A single-choice strip of tint swatches (the library's `<TintSwatches>`): a radio group whose
  radios are Fabricate's `--fab-tag-*` tints, which `TintPicker`'s `inline` layout and the
  published seam draw.

  Props:
  | prop | values | default | contract |
  | --- | --- | --- | --- |
  | `value` | a tint key | `''` | The checked swatch, matched exactly; any other value checks none. |
  | `tints` | tint keys | all ten | The swatches, in its order, once each; `offeredTintKeys` drops an unknown key. |
  | `labels` | `{ [tint]: string }` | `undefined` | Final display text naming a swatch; a blank or missing one is Fabricate's own name. |
  | `ariaLabel` | string | `''` | The group's name, final display text; required by contract. |
  | `noneLabel` / `noneChecked` | string / boolean | `''` / `false` | A leading No-colour radio's name, drawn only beside `onClear`, and whether it is checked. |

  Callbacks:
  - `onChange(token)` — a swatch that is not checked is chosen by a press, Space, Enter or an arrow key.
  - `onClear()` — the No-colour radio is chosen the same way.

  Invariants:
  - One Tab stop, the checked radio or else the first; an arrow, Home or End moves focus and
    chooses, Left and Right swapped under `direction: rtl` (`published-tint-swatches-rendered`).
  - The checked mark is the fill's inset ring, never the focus outline (`tint-picker-ring-contrast`).
-->
<script>
  import { getContext } from 'svelte';

  import { APP_LOCALIZER } from '../util/appLocalizer.js';
  import {
    managerColorTokenLabel,
    offeredTintKeys,
    tintSwatchStyle,
  } from '../util/managerColorTokens.js';

  const localize = getContext(APP_LOCALIZER);

  let {
    value = '',
    tints = undefined,
    labels = undefined,
    ariaLabel = '',
    noneLabel = '',
    noneChecked = false,
    onChange = () => {},
    onClear = null,
  } = $props();

  const named = (text) => typeof text === 'string' && text.trim() !== '';
  const swatches = $derived(
    offeredTintKeys(tints).map((token) => ({
      token,
      label: named(labels?.[token]) ? labels[token] : managerColorTokenLabel(token, localize),
    }))
  );
  const showNone = $derived(named(noneLabel) && typeof onClear === 'function');
  const noneIsChecked = $derived(noneChecked === true);
  const checkedIndex = $derived(
    showNone && noneIsChecked
      ? 0
      : swatches.findIndex(({ token }) => token === value) + (showNone ? 1 : 0)
  );
  const tabStop = $derived(checkedIndex >= (showNone ? 1 : 0) ? checkedIndex : 0);

  // Index 0 is the No-colour radio while it is drawn.
  function choose(index) {
    const offset = showNone ? 1 : 0;
    if (index < offset) {
      if (!noneIsChecked) onClear();
      return;
    }
    const { token } = swatches[index - offset];
    if (token !== value) onChange(token);
  }

  const STEPS = Object.freeze({ ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 });

  function targetIndex(event, index, count) {
    if (event.key === 'Home') return 0;
    if (event.key === 'End') return count - 1;
    const step = STEPS[event.key];
    if (!step) return -1;
    const sideways = event.key === 'ArrowLeft' || event.key === 'ArrowRight';
    const flip = sideways && getComputedStyle(event.currentTarget).direction === 'rtl';
    return (index + (flip ? -step : step) + count) % count;
  }

  function onKeydown(event, index) {
    if (event.altKey || event.ctrlKey || event.metaKey) return;
    const radios = event.currentTarget.parentElement?.querySelectorAll('[role="radio"]') ?? [];
    const next = targetIndex(event, index, radios.length);
    if (next < 0) return;
    event.preventDefault();
    radios[next]?.focus();
    choose(next);
  }
</script>

<div class="fabricate-tint-swatches" role="radiogroup" aria-label={ariaLabel || undefined}>
  {#if showNone}
    <button
      type="button"
      role="radio"
      class={`fabricate-tint-swatch is-none${noneIsChecked ? ' is-selected' : ''}`}
      aria-checked={noneIsChecked ? 'true' : 'false'}
      aria-label={noneLabel || undefined}
      title={noneLabel}
      tabindex={tabStop === 0 ? 0 : -1}
      data-manager-color-none
      data-keyboard-focus="true"
      onclick={() => choose(0)}
      onkeydown={(event) => onKeydown(event, 0)}
    >
      <span class="fabricate-tint-swatch-fill" aria-hidden="true"><i class="fas fa-slash"></i></span
      >
    </button>
  {/if}
  {#each swatches as swatch, i (swatch.token)}
    {@const index = i + (showNone ? 1 : 0)}
    <button
      type="button"
      role="radio"
      class={`fabricate-tint-swatch${swatch.token === value ? ' is-selected' : ''}`}
      aria-checked={swatch.token === value ? 'true' : 'false'}
      aria-label={swatch.label}
      title={swatch.label}
      tabindex={tabStop === index ? 0 : -1}
      data-manager-color-token={swatch.token}
      data-keyboard-focus="true"
      onclick={() => choose(index)}
      onkeydown={(event) => onKeydown(event, index)}
    >
      <span
        class="fabricate-tint-swatch-fill"
        aria-hidden="true"
        style={tintSwatchStyle(swatch.token, '')}
      ></span>
    </button>
  {/each}
</div>

<style>
  .fabricate-tint-swatches {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(44px, 1fr));
    gap: var(--fab-space-chip);
    width: 100%;
  }

  /* Foundry core sets `transition: 0.5s`, a height and a shadow on every `button`; a highlight
     appears in the frame its state changes. */
  .fabricate-tint-swatch {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    box-sizing: border-box;
    width: 100%;
    min-width: 0;
    height: 28px;
    min-height: 28px;
    margin: 0;
    padding: var(--fab-space-2xs);
    border: 1px solid var(--fab-border);
    border-radius: 7px;
    background: transparent;
    position: relative;
    box-shadow: none;
    cursor: pointer;
    transition: none;
  }

  /* Hover is the outset 2px accent ring 1px clear of the edge, drawn as a border so the window's
     focus ring stays the only outline a published swatch states. */
  .fabricate-tint-swatch:hover::after {
    content: '';
    position: absolute;
    inset: -3px;
    border: 2px solid var(--fab-accent);
    border-radius: 10px;
    pointer-events: none;
  }

  /* The picker's inset cursor (issue 2416), inside the hover ring, so a swatch shows both at once. */
  .fabricate-tint-swatch:focus-visible {
    outline: 2px solid var(--fab-accent);
    outline-offset: -2px;
  }

  .fabricate-tint-swatch-fill {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 100%;
    height: 100%;
    border-radius: 6px;
    color: var(--fab-bg-0);
    background: var(--manager-color-swatch, var(--fab-tag-sage));
  }

  .fabricate-tint-swatch.is-none .fabricate-tint-swatch-fill {
    color: var(--fab-text-secondary);
    background: var(--fab-bg-3);
    font-size: 0.6rem;
  }

  .fabricate-tint-swatch.is-selected .fabricate-tint-swatch-fill {
    box-shadow: inset 0 0 0 2px var(--fab-biome-icon-foreground);
  }

  .fabricate-tint-swatch.is-none.is-selected .fabricate-tint-swatch-fill {
    box-shadow: inset 0 0 0 2px var(--fab-text);
  }

  /* A tint is the value itself, so its fill and ring keep their colours; the checked edge is
     the system highlight. */
  @media (forced-colors: active) {
    .fabricate-tint-swatch-fill {
      forced-color-adjust: none;
    }

    .fabricate-tint-swatch.is-selected {
      border-color: highlight;
    }
  }
</style>
