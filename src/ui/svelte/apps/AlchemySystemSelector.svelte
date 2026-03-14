<!-- Svelte 5 runes mode -->
<script>
  import { localize } from '../util/foundryBridge.js';

  let {
    alchemySystems = [],
    selectedSystemId = '',
    onSelectSystem
  } = $props();

  function handleChange(event) {
    onSelectSystem?.(event.target.value);
  }
</script>

{#if alchemySystems.length > 1}
  <div class="alchemy-system-selector" style="margin-bottom: 8px;">
    <select
      class="alchemy-system-select"
      value={selectedSystemId}
      onchange={handleChange}
      aria-label={localize('FABRICATE.Alchemy.SelectSystem')}
      style="width: 100%; height: 32px; font-size: 13px;"
    >
      {#each alchemySystems as system (system.id)}
        <option value={system.id}>{system.name}</option>
      {/each}
    </select>
  </div>
{/if}
