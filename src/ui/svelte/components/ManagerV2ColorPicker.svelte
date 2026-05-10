<!-- Svelte 5 runes mode -->
<script>
  import ManagerV2ColorPopover from './ManagerV2ColorPopover.svelte';

  let {
    colorToken = 'sage',
    customColor = '',
    buttonTitle = 'Choose colour',
    presetGridLabel = 'Colour presets',
    customHexLabel = 'Custom hex',
    onChange = () => {}
  } = $props();

  let open = $state(false);

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
    return `--manager-v2-color-swatch: ${custom || `var(--fab-tag-${normalizedToken(token)})`}`;
  }

</script>

<span class="manager-v2-color-picker">
  <button
    type="button"
    class="manager-v2-color-picker-trigger"
    aria-expanded={open}
    aria-label={buttonTitle}
    title={buttonTitle}
    style={swatchStyle()}
    onclick={() => open = !open}
  >
    <span class="manager-v2-color-swatch" aria-hidden="true"></span>
  </button>
  {#if open}
    <ManagerV2ColorPopover
      {colorToken}
      {customColor}
      {presetGridLabel}
      {customHexLabel}
      {onChange}
      onDismiss={() => open = false}
    />
  {/if}
</span>
