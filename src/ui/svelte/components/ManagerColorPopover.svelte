<!-- Svelte 5 runes mode -->
<!--
  The manager's colour palette. Rendered as a POPOVER by `ManagerColorPicker`, the
  environments biome picker and the character-modifier picker, and INLINE by the essence
  editor's Identity palette and the essence bulk-edit Colour stage (issue 1036).

  Both additions in issue 1036 are GATED, and the gates are the point rather than caution:

   - `layout="inline"` suppresses the popover chrome the GLOBAL sheet applies
     (`.fabricate-manager .manager-color-picker-popover` — absolute positioning, z-index,
     a fixed 220px width, a border and a shadow). The suppression is written at three
     classes so it beats that two-class global rule on specificity rather than on source
     order, which a scoped block cannot rely on alone.
   - `allowNone` adds a ninth NO-COLOUR cell, the only route this palette has ever had back
     to unset — the shipped editor reaches unset through a separate Clear button, so an
     inline palette without this cell would be a one-way door. It is off by default because
     the preset grid is `repeat(4, 1fr)` and `EnvironmentsBrowserView`'s two call sites
     would otherwise gain both a ragged ninth cell and a clear-to-unset route they do not
     have.
-->
<script>
  import { dismissOnOutsideClick } from '../actions/dismissOnOutsideClick.js';
  import { portal } from '../actions/portal.js';
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
    // The No-colour cell's accessible name. Pre-localized by the caller, exactly as
    // `presetGridLabel` and `customHexLabel` already are — this component takes strings,
    // never keys.
    noneLabel = 'No colour',
    // Whether the free-hex entry is offered alongside the preset palette. Callers whose
    // stored model has no `customColor` sibling (the per-essence colour, issue 917) set
    // this false: the palette is then the whole vocabulary, because a free hex cannot be
    // guaranteed legible across all seven themes.
    allowCustom = true,
    // TRUE when the caller holds no authored colour. `normalizedToken` folds an absent
    // value onto `sage`, so without this the palette would mark Sage selected for a
    // model that has chosen nothing. See ManagerColorPicker for the full reasoning.
    unset = false,
    // `'popover'` (default) or `'inline'`. See the header: inline strips the popover
    // chrome the global sheet applies, and nothing else.
    layout = 'popover',
    // Whether the palette offers the NO COLOUR cell. Default false — see the header for
    // why this is gated rather than universal.
    allowNone = false,
    // Whether the No-colour cell is MARKED SELECTED. `null` (the default) derives it from
    // `unset`, which is the shipped behaviour and what every popover call site wants: a
    // model holding no colour has chosen "no colour".
    //
    // A bulk-edit STAGE has a third state the popover otherwise cannot express (issue
    // 1036). Its Colour axis stages `Leave unchanged`, `Clear colour` or a token, and the
    // first two are BOTH "no preset is marked" — so deriving the cell from `unset` alone
    // would paint `Clear colour` as staged while the panel's own sub-hint says
    // `Leave unchanged`, which is the one confusion this three-value axis exists to
    // prevent. Passing `false` marks nothing at all.
    noneSelected = null,
    // Emitted when the No-colour cell is chosen. Separate from `onChange` because the two
    // are different instructions: `onChange` always carries a token, and folding "unset"
    // into it as `colorToken: ''` would make every existing consumer have to learn a new
    // falsy case. A caller that does not pass this cannot show the cell.
    onClear = null,
    onChange = () => {},
    onDismiss = () => {},
    manageDismiss = true,
    popoverStyle = '',
    portalTarget = null,
    registerPopoverNode = () => {},
  } = $props();

  let popoverRoot = $state(null);

  // LOCALIZED (issue 1036). The label is both `aria-label` and `title`, so it is the whole
  // screen-reader surface of a colour cell; it was derived English until now. The palette
  // itself is the shared constant, so this popover, its trigger and the essence Identity
  // tab's inline palette cannot drift in order, membership or naming.
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

  // The No-colour cell is offered only when BOTH the gate is open and the caller supplied
  // a handler: a cell that renders and does nothing is worse than no cell.
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
  class="manager-color-picker-popover"
  class:is-inline={layout === 'inline'}
  data-manager-color-picker-popover
  data-manager-color-layout={layout === 'inline' ? 'inline' : undefined}
  style={popoverStyle}
  use:dismissOnOutsideClick={{ enabled: manageDismiss, onDismiss }}
  use:portal={portalTarget}
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
  /* INLINE layout (issue 1036). Every declaration here UNDOES one the global rule
     `.fabricate-manager .manager-color-picker-popover` applies, and nothing else: the
     palette itself is unchanged between the two modes.

     Written as three classes on purpose. Svelte compiles a scoped selector to
     `.manager-color-picker-popover.is-inline.svelte-<hash>`, which is (0,3,0) and beats the
     global rule's (0,2,0) on SPECIFICITY. Relying on source order instead would work only
     while `css: 'injected'` keeps putting this block after Foundry's stylesheet link, which
     is a build detail rather than a contract. */
  .manager-color-picker-popover.is-inline {
    position: static;
    z-index: auto;
    width: 100%;
    padding: 0;
    border: 0;
    background: none;
    box-shadow: none;
  }

  /* INLINE SWATCH GEOMETRY (issue 1036 fidelity pass), and it is the reason the palette
     shipped enormous. The global grid is `repeat(4, 1fr)` and the cell is `aspect-ratio: 1`
     — sized by the POPOVER's fixed 220px width, that is a ~46px square, which is what the
     three popover call sites still get. Inline, the same rules take the width of whatever
     column hosts them: ~62px squares in the 300px bulk rail, and ~165px squares across the
     editor's main column, where ten of them consumed more height than every other control
     on the tab combined.

     So the inline mode sizes the cell instead of letting the container do it. The height is
     fixed at the 28px this file's own `.manager-color-custom input` already uses, the square
     constraint is released, and the columns are `auto-fit` over a 44px floor — which
     resolves to one row of nine across the editor and two rows (5 + 4) in the rail, both of
     which are the prototype's own composition. `auto-fit` rather than `auto-fill` so the
     cells stretch to fill a wide row instead of leaving collapsed tracks beside them.

     Three classes plus the hash, as the block above, so this beats the two-class global
     rules on specificity rather than on source order. */
  .manager-color-picker-popover.is-inline .manager-color-preset-grid {
    grid-template-columns: repeat(auto-fit, minmax(44px, 1fr));
  }

  .manager-color-picker-popover.is-inline .manager-color-preset {
    aspect-ratio: auto;
    height: 28px;
    min-height: 28px;
  }

  /* The NO COLOUR cell reads as an absence rather than as a ninth colour: the theme's own
     surface behind a struck-through glyph, not a swatch. Flat by contract — no gradient
     (`tests/components/flat-ui-style-contract.test.js`). */
  .manager-color-swatch-none {
    color: var(--fab-text-muted);
    background: var(--fab-bg-3);
    font-size: 0.6rem;
  }
</style>
