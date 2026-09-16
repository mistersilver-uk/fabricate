<!--
  The manager's colour palette, rendered as a POPOVER by three pickers and INLINE by two editors. It
  takes already-localized strings, never keys.

  Props:
  | prop | values | default | contract |
  | --- | --- | --- | --- |
  | `layout` | `'popover'` \| `'inline'` | `'popover'` | `inline` suppresses the popover chrome the GLOBAL sheet applies — absolute positioning, z-index, a fixed width, a border and a shadow — and nothing else. |
  | `allowCustom` | boolean | `true` | Whether free-hex entry is offered beside the presets. A caller whose stored model has no `customColor` sibling sets it false: the palette is then the whole vocabulary, because a free hex cannot be guaranteed legible across all seven themes. |
  | `allowNone` / `unset` | booleans | `false` | `allowNone` adds a ninth NO-COLOUR cell, the only route this palette has ever had back to unset, off by default because the preset grid is `repeat(4, 1fr)`. `unset` is TRUE when the caller holds no authored colour: `normalizedToken` folds an absent value onto a preset, so without it the palette marks that preset selected for a model that has chosen nothing. |
  | `noneSelected` | boolean or `null` | `null` | Whether the No-colour cell is MARKED. `null` derives it from `unset`, which is what every popover caller wants. A bulk-edit STAGE has a third state this cannot otherwise express — "leave unchanged", "clear colour" or a token, where the first two are BOTH "no preset is marked" — so passing `false` marks nothing at all. |
  | `onSelectNone` / `presetGridLabel` / `customHexLabel` / `noneLabel` | function / pre-localized strings | `undefined` / — | The No-colour cell's handler and the palette's accessible names. `onSelectNone` is separate from `onChange` because the two are different instructions, and folding "unset" into `onChange` as an empty token would make every existing consumer learn a new falsy case; a caller that does not pass it cannot show the cell. |

  Invariants:
  - THE NO-COLOUR CELL IS OFFERED ONLY WHEN BOTH THE GATE IS OPEN AND A HANDLER WAS SUPPLIED: a cell
    that renders and does nothing is worse than no cell.
  - THIS PANEL NEITHER MEASURES NOR PORTALS ITSELF. A caller that opens it as a popover applies the
    shared `anchoredPopover` action to the node registered here, and that action writes the node's
    inline `style` and moves it into the resolved host — hence no `popoverStyle` or `portalTarget`.
  - EVERY CELL'S LABEL IS BOTH `aria-label` AND `title`, so it is the whole screen-reader surface of
    a colour cell. The palette itself is a shared constant, so this popover, its trigger and the
    editor's inline palette cannot drift in order, membership or naming.
-->
<script>
  import { dismissOnOutsideClick } from '../actions/dismissOnOutsideClick.js';
  import { localize } from '../util/foundryBridge.js';
  import {
    MANAGER_COLOR_TOKENS,
    managerColorTokenLabel,
    normalizeManagerColorToken,
  } from '../util/managerColorTokens.js';

  let {
    colorToken = 'sage',
    customColor = '',
    presetGridLabel = 'Colour presets',
    customHexLabel = 'Custom hex',
    noneLabel = 'No colour',
    allowCustom = true,
    unset = false,
    layout = 'popover',
    allowNone = false,
    noneSelected = null,
    onClear = null,
    onChange = () => {},
    onDismiss = () => {},
    manageDismiss = true,
    registerPopoverNode = () => {},
  } = $props();

  let popoverRoot = $state(null);

  const presets = $derived(
    MANAGER_COLOR_TOKENS.map((preset) => ({
      token: preset.token,
      label: managerColorTokenLabel(preset.token, localize),
    }))
  );

  function normalizedToken(value) {
    return normalizeManagerColorToken(value);
  }

  function validCustomHex(value) {
    const hex = String(value || '').trim();
    return /^#[0-9a-fA-F]{6}$/.test(hex) ? hex.toUpperCase() : '';
  }

  function swatchStyle(token = colorToken, hex = customColor) {
    const custom = validCustomHex(hex);
    return `--manager-color-swatch: ${custom || `var(--fab-tag-${normalizedToken(token)})`}`;
  }

  function selectPreset(token) {
    onChange({ colorToken: token, customColor });
  }

  const showNoColour = $derived(allowNone === true && typeof onClear === 'function');
  const noColourSelected = $derived(typeof noneSelected === 'boolean' ? noneSelected : unset);

  function updateCustomColor(value) {
    onChange({ colorToken: normalizedToken(colorToken), customColor: value });
  }

  $effect(() => {
    registerPopoverNode(popoverRoot);

    return () => registerPopoverNode(null);
  });
</script>

<span
  bind:this={popoverRoot}
  class="fabricate-color-picker-popover manager-color-picker-popover"
  class:is-inline={layout === 'inline'}
  data-manager-color-picker-popover
  data-manager-color-layout={layout === 'inline' ? 'inline' : undefined}
  use:dismissOnOutsideClick={{ enabled: manageDismiss, onDismiss }}
>
  <span class="manager-color-preset-grid" aria-label={presetGridLabel}>
    {#if showNoColour}
      <button
        type="button"
        class={`manager-color-preset manager-color-preset-none ${noColourSelected ? 'is-selected' : ''}`}
        aria-label={noneLabel}
        title={noneLabel}
        data-manager-color-none
        onclick={() => onClear()}
      >
        <span class="manager-color-swatch manager-color-swatch-none" aria-hidden="true">
          <i class="fas fa-slash"></i>
        </span>
      </button>
    {/if}
    {#each presets as preset (preset.token)}
      <button
        type="button"
        class={`manager-color-preset ${!unset && normalizedToken(colorToken) === preset.token ? 'is-selected' : ''}`}
        aria-label={preset.label}
        title={preset.label}
        data-manager-color-token={preset.token}
        style={swatchStyle(preset.token, '')}
        onclick={() => selectPreset(preset.token)}
      >
        <span class="manager-color-swatch" aria-hidden="true"></span>
      </button>
    {/each}
  </span>
  {#if allowCustom}
    <label class="manager-color-custom">
      <span>{customHexLabel}</span>
      <input
        value={customColor || ''}
        placeholder="hex"
        data-manager-custom-color
        oninput={(event) => updateCustomColor(event.currentTarget.value)}
      />
    </label>
  {/if}
</span>

<style>
  .manager-color-picker-popover.is-inline {
    position: static;
    z-index: auto;
    width: 100%;
    padding: 0;
    border: 0;
    background: none;
    box-shadow: none;
  }

  .manager-color-picker-popover.is-inline .manager-color-preset-grid {
    grid-template-columns: repeat(auto-fit, minmax(44px, 1fr));
  }

  .manager-color-picker-popover.is-inline .manager-color-preset {
    aspect-ratio: auto;
    height: 28px;
    min-height: 28px;
  }

  .manager-color-swatch-none {
    color: var(--fab-text-muted);
    background: var(--fab-bg-3);
    font-size: 0.6rem;
  }
</style>
