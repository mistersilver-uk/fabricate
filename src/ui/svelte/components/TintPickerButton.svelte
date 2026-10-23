<!--
  The single-caller swatch trigger that opens the shared tint palette, `TintPicker.svelte`, as its
  popover. The swatch is `TintPicker`'s `trigger` snippet, so `SearchablePopover` owns the panel's
  position, dismissal and focus return, and the button only spreads its attributes and names itself.
-->
<script>
  import { MANAGER_MAIN_SELECTOR } from '../util/overlayBounds.js';
  import TintPicker from './TintPicker.svelte';
  import { tintSwatchStyle } from '../util/managerColorTokens.js';

  let {
    colorToken = 'sage',
    customColor = '',
    ariaLabel = '',
    // Left unset, `TintPicker` names the palette in the localized default (issue 2257).
    presetGridLabel = undefined,
    customHexLabel = undefined,
    // Free-hex entry is opt-in: only a caller whose stored model carries a `customColor` sibling
    // (the gathering biome) passes true (issue 2352).
    allowCustom = false,
    // TRUE when the caller's model holds no authored colour at all: `colorToken` normalizes an
    // absent value onto a preset, so without this the control would assert an authored choice
    // nobody made. Unset paints a neutral swatch and selects no preset.
    unset = false,
    bounds = MANAGER_MAIN_SELECTOR,
    onChange = () => {},
  } = $props();

  const UNSET_SWATCH = '--manager-color-swatch: var(--fab-border-strong)';
</script>

<!-- `fabricate-color-picker` is this primitive's NAMESPACE root. ONE class, not two: this
     component renders no panel of its own — its panel is `TintPicker`'s. -->
<span class="fabricate-color-picker manager-color-picker">
  <TintPicker
    {colorToken}
    {customColor}
    {presetGridLabel}
    {customHexLabel}
    {allowCustom}
    {unset}
    {bounds}
    {onChange}
  >
    {#snippet trigger({ attributes })}
      <button
        class="manager-color-picker-trigger"
        class:is-unset={unset}
        aria-label={ariaLabel || undefined}
        title={ariaLabel || undefined}
        style={unset ? UNSET_SWATCH : tintSwatchStyle(colorToken, customColor)}
        {...attributes}
      >
        <span class="manager-color-swatch" aria-hidden="true"></span>
      </button>
    {/snippet}
  </TintPicker>
</span>
