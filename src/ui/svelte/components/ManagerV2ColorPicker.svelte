<!-- Svelte 5 runes mode -->
<script>
  let {
    colorToken = 'sage',
    customColor = '',
    buttonTitle = 'Choose colour',
    presetGridLabel = 'Colour presets',
    customHexLabel = 'Custom hex',
    onChange = () => {}
  } = $props();

  let open = $state(false);

  const presets = [
    { token: 'sage', label: 'Sage' },
    { token: 'mist', label: 'Mist' },
    { token: 'lavender', label: 'Lavender' },
    { token: 'rose', label: 'Rose' },
    { token: 'peach', label: 'Peach' },
    { token: 'butter', label: 'Butter' },
    { token: 'aqua', label: 'Aqua' },
    { token: 'mauve', label: 'Mauve' }
  ];

  function normalizedToken(value) {
    const token = String(value || '').replace(/^--fab-tag-/, '');
    return presets.some(preset => preset.token === token) ? token : 'sage';
  }

  function validCustomHex(value) {
    const hex = String(value || '').trim();
    return /^#[0-9a-fA-F]{6}$/.test(hex) ? hex.toUpperCase() : '';
  }

  function swatchStyle(token = colorToken, hex = customColor) {
    const custom = validCustomHex(hex);
    return `--manager-v2-color-swatch: ${custom || `var(--fab-tag-${normalizedToken(token)})`}`;
  }

  function selectPreset(token) {
    onChange({ colorToken: token, customColor });
  }

  function updateCustomColor(value) {
    onChange({ colorToken: normalizedToken(colorToken), customColor: value });
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
    <span class="manager-v2-color-picker-popover" data-manager-v2-color-picker-popover>
      <span class="manager-v2-color-preset-grid" aria-label={presetGridLabel}>
        {#each presets as preset (preset.token)}
          <button
            type="button"
            class={`manager-v2-color-preset ${normalizedToken(colorToken) === preset.token ? 'is-selected' : ''}`}
            aria-label={preset.label}
            title={preset.label}
            data-manager-v2-color-token={preset.token}
            style={swatchStyle(preset.token, '')}
            onclick={() => selectPreset(preset.token)}
          >
            <span class="manager-v2-color-swatch" aria-hidden="true"></span>
          </button>
        {/each}
      </span>
      <label class="manager-v2-color-custom">
        <span>{customHexLabel}</span>
        <input
          value={customColor || ''}
          placeholder="hex"
          data-manager-v2-custom-color
          oninput={(event) => updateCustomColor(event.currentTarget.value)}
        />
      </label>
    </span>
  {/if}
</span>
