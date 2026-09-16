<!--
  The manager's colour palette, rendered as a POPOVER by three pickers and INLINE by two editors. It
  takes already-localized strings, never keys.

  Props:
  | prop | values | default | contract |
  | --- | --- | --- | --- |
  | `layout` | `'popover'` \| `'inline'` | `'popover'` | `inline` suppresses the popover chrome the GLOBAL sheet applies — absolute positioning, z-index, a fixed width, a border and a shadow — and nothing else. |
  | `allowCustom` | boolean | `true` | Whether free-hex entry is offered beside the presets. A caller whose stored model has no `customColor` sibling sets it false: the palette is then the whole vocabulary, because a free hex cannot be guaranteed legible across all seven themes. |
  | `allowNone` | boolean | `false` | Adds a ninth NO-COLOUR cell, the only route this palette has ever had back to unset. Off by default, because the preset grid is `repeat(4, 1fr)` and the shipped popover callers would otherwise gain both a ragged ninth cell and a clear-to-unset route they do not have. |
  | `unset` | boolean | `false` | TRUE when the caller holds no authored colour. `normalizedToken` folds an absent value onto a preset, so without this the palette marks that preset selected for a model that has chosen nothing. |
  | `noneSelected` | boolean or `null` | `null` | Whether the No-colour cell is MARKED. `null` derives it from `unset`, which is what every popover caller wants. A bulk-edit STAGE has a third state this cannot otherwise express: its Colour axis stages "leave unchanged", "clear colour" or a token, and the first two are BOTH "no preset is marked" — so deriving from `unset` alone would paint "clear colour" as staged while the panel's own sub-hint says "leave unchanged". Passing `false` marks nothing at all. |
  | `onSelectNone` | function | `undefined` | Emitted when the No-colour cell is chosen. Separate from `onChange` because the two are different instructions: `onChange` always carries a token, and folding "unset" into it as an empty token would make every existing consumer learn a new falsy case. A caller that does not pass this cannot show the cell. |
  | `presetGridLabel` / `customHexLabel` / `noneLabel` | pre-localized strings | — | The palette's accessible names. |

  Invariants:
  - THE NO-COLOUR CELL IS OFFERED ONLY WHEN BOTH THE GATE IS OPEN AND A HANDLER WAS SUPPLIED: a
    cell that renders and does nothing is worse than no cell.
  - THIS PANEL NEITHER MEASURES NOR PORTALS ITSELF. A caller that opens it as a popover applies the
    shared `anchoredPopover` action to the node registered here, and that action writes the node's
    inline `style` and moves it into the resolved host — which is why there is no `popoverStyle`
    and no `portalTarget` prop: a `style` binding on this element would fight the action for the
    same attribute, and the portal target is the action's own answer rather than a value to hand
    it.
  - EVERY CELL'S LABEL IS BOTH `aria-label` AND `title`, so it is the whole screen-reader surface
    of a colour cell. The palette itself is a shared constant, so this popover, its trigger and the
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

<!-- `fabricate-color-picker-popover` is this primitive's NAMESPACE root. ONE class, because this
     root element IS the panel that gets portaled, so a second would name the same element twice.
     A portaled node keeps its classes and loses its ancestors. -->
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
  /* INLINE layout: every declaration here UNDOES one the global popover rule applies, and nothing
     else — the palette itself is unchanged between the two modes. Written as three classes on
     purpose: Svelte compiles a scoped selector to three classes plus the hash, which beats the
     global rule's two on SPECIFICITY, where relying on source order would work only while the
     build keeps injecting this block after Foundry's stylesheet link. */
  .manager-color-picker-popover.is-inline {
    position: static;
    z-index: auto;
    width: 100%;
    padding: 0;
    border: 0;
    background: none;
    box-shadow: none;
  }

  /* INLINE SWATCH GEOMETRY, and it is why the palette shipped enormous: the global grid's
     `aspect-ratio: 1` cell is sized by the POPOVER's fixed width, and inline the same rules take
     the width of whatever column hosts them. So the inline mode sizes the CELL instead — a fixed
     height, the square constraint released, and `auto-fit` columns over a floor, `auto-fit` rather
     than `auto-fill` so the cells stretch instead of leaving collapsed tracks. Three classes plus
     the hash again, so this beats the global rules on specificity. */
  .manager-color-picker-popover.is-inline .manager-color-preset-grid {
    grid-template-columns: repeat(auto-fit, minmax(44px, 1fr));
  }

  .manager-color-picker-popover.is-inline .manager-color-preset {
    aspect-ratio: auto;
    height: 28px;
    min-height: 28px;
  }

  /* The NO COLOUR cell reads as an absence rather than a ninth colour: the theme's own surface
     behind a struck-through glyph, not a swatch. Flat by contract — no gradient. */
  .manager-color-swatch-none {
    color: var(--fab-text-muted);
    background: var(--fab-bg-3);
    font-size: 0.6rem;
  }
</style>
