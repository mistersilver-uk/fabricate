<!--
  The single-caller swatch trigger that opens the shared tint palette as an anchored popover. The
  palette is the library's `<TintPicker>` specimen, which `TintPicker.svelte` implements.
-->
<script>
  import { anchoredPopover, hostRelativePopoverLayout } from '../actions/anchoredPopover.js';
  import { dismissOnOutsideClick } from '../actions/dismissOnOutsideClick.js';
  import { computeIconPickerPopoverLayout } from '../util/iconPickerPopover.js';
  import { MANAGER_MAIN_SELECTOR } from '../util/overlayBounds.js';
  import TintPicker from './TintPicker.svelte';
  import { tintSwatchStyle } from '../util/managerColorTokens.js';

  const popoverLayout = hostRelativePopoverLayout(computeIconPickerPopoverLayout);

  let {
    colorToken = 'sage',
    customColor = '',
    ariaLabel = '',
    // Left unset, `TintPicker` names the palette in the localized default (issue 2257).
    presetGridLabel = undefined,
    customHexLabel = undefined,
    allowCustom = true,
    // TRUE when the caller's model holds no authored colour at all: `colorToken` normalizes an
    // absent value onto a preset, so without this the control would assert an authored choice
    // nobody made. Unset paints a neutral swatch and selects no preset.
    unset = false,
    bounds = MANAGER_MAIN_SELECTOR,
    onChange = () => {},
  } = $props();

  const UNSET_SWATCH = '--manager-color-swatch: var(--fab-border-strong)';

  let open = $state(false);
  let pickerRoot = $state(null);
  let triggerButton = $state(null);
  let popoverRoot = $state(null);

  function closePicker() {
    open = false;
  }

  function togglePicker() {
    open = !open;
  }

  function registerPopoverNode(node) {
    popoverRoot = node;
  }

  // `anchoredPopover` is applied HERE rather than with `use:` on the panel, because the panel is
  // `TintPicker` — a separate shared component this one does not own the markup of. An
  // action is a plain function, so the picker drives it against the node the popover registers:
  // same contract, same teardown, no new prop on a component three other surfaces render.
  $effect(() => {
    if (!popoverRoot) return;

    const handle = anchoredPopover(popoverRoot, {
      component: 'TintPickerButton',
      trigger: () => triggerButton,
      layout: popoverLayout,
      layoutOptions: () => ({ horizontalAlign: 'left', minWidth: 220, maxWidth: 220 }),
      bounds,
    });

    return () => handle.destroy();
  });
</script>

<!-- `fabricate-color-picker` is this primitive's NAMESPACE root. ONE class, not two: this
     component renders no panel of its own — its panel is `TintPicker`, which carries its
     own root class. -->
<span
  bind:this={pickerRoot}
  class="fabricate-color-picker manager-color-picker"
  use:dismissOnOutsideClick={{
    enabled: open,
    onDismiss: closePicker,
    additionalNodes: () => [popoverRoot],
  }}
>
  <button
    type="button"
    bind:this={triggerButton}
    class="manager-color-picker-trigger"
    class:is-unset={unset}
    aria-expanded={open}
    aria-label={ariaLabel || undefined}
    title={ariaLabel || undefined}
    style={unset ? UNSET_SWATCH : tintSwatchStyle(colorToken, customColor)}
    onclick={togglePicker}
  >
    <span class="manager-color-swatch" aria-hidden="true"></span>
  </button>
  {#if open}
    <TintPicker
      {colorToken}
      {customColor}
      {presetGridLabel}
      {customHexLabel}
      {allowCustom}
      {unset}
      {onChange}
      {registerPopoverNode}
      manageDismiss={false}
    />
  {/if}
</span>
