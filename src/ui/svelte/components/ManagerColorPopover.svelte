<!-- Svelte 5 runes mode -->
<script>
  import { dismissOnOutsideClick } from '../actions/dismissOnOutsideClick.js';
  import { portal } from '../actions/portal.js';

  let {
    colorToken = 'sage',
    customColor = '',
    presetGridLabel = 'Colour presets',
    customHexLabel = 'Custom hex',
    // Whether the free-hex entry is offered alongside the preset palette. Callers whose
    // stored model has no `customColor` sibling (the per-essence colour, issue 917) set
    // this false: the palette is then the whole vocabulary, because a free hex cannot be
    // guaranteed legible across all seven themes.
    allowCustom = true,
    // TRUE when the caller holds no authored colour. `normalizedToken` folds an absent
    // value onto `sage`, so without this the palette would mark Sage selected for a
    // model that has chosen nothing. See ManagerColorPicker for the full reasoning.
    unset = false,
    onChange = () => {},
    onDismiss = () => {},
    manageDismiss = true,
    popoverStyle = '',
    portalTarget = null,
    registerPopoverNode = () => {},
  } = $props();

  let popoverRoot = $state(null);

  const presets = [
    { token: 'sage', label: 'Sage' },
    { token: 'mist', label: 'Mist' },
    { token: 'lavender', label: 'Lavender' },
    { token: 'rose', label: 'Rose' },
    { token: 'peach', label: 'Peach' },
    { token: 'butter', label: 'Butter' },
    { token: 'aqua', label: 'Aqua' },
    { token: 'mauve', label: 'Mauve' },
  ];

  function normalizedToken(value) {
    const token = String(value || '').replace(/^--fab-tag-/, '');
    return presets.some((preset) => preset.token === token) ? token : 'sage';
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
  data-manager-color-picker-popover
  style={popoverStyle}
  use:dismissOnOutsideClick={{ enabled: manageDismiss, onDismiss }}
  use:portal={portalTarget}
>
  <span class="manager-color-preset-grid" aria-label={presetGridLabel}>
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
