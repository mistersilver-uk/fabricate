<!-- Svelte 5 runes mode -->
<script>
  import { dismissOnOutsideClick } from '../actions/dismissOnOutsideClick.js';
  import { computeIconPickerPopoverLayout } from '../util/iconPickerPopover.js';
  import ManagerColorPopover from './ManagerColorPopover.svelte';

  let {
    colorToken = 'sage',
    customColor = '',
    buttonTitle = 'Choose colour',
    presetGridLabel = 'Colour presets',
    customHexLabel = 'Custom hex',
    onChange = () => {}
  } = $props();

  let open = $state(false);
  let pickerRoot = $state(null);
  let triggerButton = $state(null);
  let popoverRoot = $state(null);
  let popoverStyle = $state('');

  function normalizedToken(value) {
    const token = String(value || '').replace(/^--fab-tag-/, '');
    return ['sage', 'mist', 'lavender', 'rose', 'peach', 'butter', 'aqua', 'mauve'].includes(token) ? token : 'sage';
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

  function getPopoverHost() {
    if (!pickerRoot || typeof document === 'undefined') return null;

    return pickerRoot.closest('.fabricate-manager');
  }

  function getPopoverHorizontalBounds(hostRect) {
    if (!pickerRoot) return {};

    const mainPanel = pickerRoot.closest('.manager-main');
    const mainPanelRect = mainPanel?.getBoundingClientRect?.();
    if (!mainPanelRect) return {};

    return {
      minLeft: mainPanelRect.left - hostRect.left + 16,
      maxRight: mainPanelRect.right - hostRect.left - 16
    };
  }

  function updatePopoverPosition() {
    if (!open || !triggerButton || typeof window === 'undefined') return;

    const popoverHost = getPopoverHost();
    const hostRect = popoverHost?.getBoundingClientRect?.() ?? {
      left: 0,
      top: 0,
      width: window.innerWidth,
      height: window.innerHeight
    };
    const triggerRect = triggerButton.getBoundingClientRect();
    const horizontalBounds = getPopoverHorizontalBounds(hostRect);

    const layout = computeIconPickerPopoverLayout(
      {
        left: triggerRect.left - hostRect.left,
        right: triggerRect.right - hostRect.left,
        top: triggerRect.top - hostRect.top,
        bottom: triggerRect.bottom - hostRect.top,
        width: triggerRect.width,
        height: triggerRect.height
      },
      { width: hostRect.width || window.innerWidth, height: hostRect.height || window.innerHeight },
      {
        horizontalAlign: 'left',
        minLeft: horizontalBounds.minLeft,
        maxRight: horizontalBounds.maxRight,
        minWidth: 220,
        maxWidth: 220
      }
    );

    if (!layout) {
      popoverStyle = '';
      return;
    }

    const verticalPosition = layout.placement === 'top'
      ? `top: auto; bottom: ${layout.bottom}px;`
      : `top: ${layout.top}px; bottom: auto;`;

    popoverStyle = [
      `left: ${layout.left}px;`,
      'right: auto;',
      `width: ${layout.width}px;`,
      `max-height: ${layout.maxHeight}px;`,
      verticalPosition
    ].join(' ');
  }

  function registerPopoverNode(node) {
    popoverRoot = node;
  }

  $effect(() => {
    if (!open || typeof window === 'undefined' || typeof document === 'undefined') {
      popoverStyle = '';
      return;
    }

    updatePopoverPosition();

    const handleViewportChange = () => updatePopoverPosition();
    window.addEventListener('resize', handleViewportChange);
    document.addEventListener('scroll', handleViewportChange, true);

    return () => {
      window.removeEventListener('resize', handleViewportChange);
      document.removeEventListener('scroll', handleViewportChange, true);
    };
  });
</script>

<span
  bind:this={pickerRoot}
  class="manager-color-picker"
  use:dismissOnOutsideClick={{
    enabled: open,
    onDismiss: closePicker,
    additionalNodes: () => [popoverRoot]
  }}
>
  <button
    type="button"
    bind:this={triggerButton}
    class="manager-color-picker-trigger"
    aria-expanded={open}
    aria-label={buttonTitle}
    title={buttonTitle}
    style={swatchStyle()}
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
      {onChange}
      popoverStyle={popoverStyle}
      portalTarget={() => getPopoverHost()}
      {registerPopoverNode}
      manageDismiss={false}
    />
  {/if}
</span>
