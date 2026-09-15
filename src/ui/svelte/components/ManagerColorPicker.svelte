<script>
  import { anchoredPopover, hostRelativePopoverLayout } from '../actions/anchoredPopover.js';
  import { dismissOnOutsideClick } from '../actions/dismissOnOutsideClick.js';
  import { computeIconPickerPopoverLayout } from '../util/iconPickerPopover.js';
  import { MANAGER_MAIN_SELECTOR } from '../util/overlayBounds.js';
  import ManagerColorPopover from './ManagerColorPopover.svelte';
  import { normalizeManagerColorToken } from '../util/managerColorTokens.js';

  const popoverLayout = hostRelativePopoverLayout(computeIconPickerPopoverLayout);

  let {
    colorToken = 'sage',
    customColor = '',
    buttonTitle = 'Choose colour',
    presetGridLabel = 'Colour presets',
    customHexLabel = 'Custom hex',
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

  // ONE constant: the trigger's swatch and the popover's selection marking have to agree about
  // which token is which.
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
  // `ManagerColorPopover` — a separate shared component this one does not own the markup of. An
  // action is a plain function, so the picker drives it against the node the popover registers:
  // same contract, same teardown, no new prop on a component three other surfaces render.
  $effect(() => {
    if (!popoverRoot) return;

    const handle = anchoredPopover(popoverRoot, {
      component: 'ManagerColorPicker',
      trigger: () => triggerButton,
      layout: popoverLayout,
      layoutOptions: () => ({ horizontalAlign: 'left', minWidth: 220, maxWidth: 220 }),
      bounds,
    });

    return () => handle.destroy();
  });
</script>

<!-- `fabricate-color-picker` is this primitive's NAMESPACE root. ONE class, not two: this
     component renders no panel of its own — its panel is `ManagerColorPopover`, which carries its
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
    aria-label={buttonTitle}
    title={buttonTitle}
    style={unset ? UNSET_SWATCH : swatchStyle()}
    onclick={togglePicker}
  >
    <span class="manager-color-swatch" aria-hidden="true"></span>
  </button>
  {#if open}
    <ManagerColorPopover
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
