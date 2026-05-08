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
  <div class="alchemy-system-selector">
    <select
      class="alchemy-system-select"
      value={selectedSystemId}
      onchange={handleChange}
      aria-label={localize('FABRICATE.Alchemy.SelectSystem')}
    >
      {#each alchemySystems as system (system.id)}
        <option value={system.id}>{system.name}</option>
      {/each}
    </select>
  </div>
{/if}

<style>
  .alchemy-system-selector {
    width: 100%;
  }

  .alchemy-system-select {
    width: 100%;
    height: var(--fab-v2-control-height);
    padding: 0 var(--fab-space-3);
    border: 1px solid var(--fab-border);
    border-radius: var(--fab-v2-radius-control);
    background: var(--fab-surface-raised);
    color: var(--fab-text);
    font-size: 13px;
    cursor: pointer;
  }

  .alchemy-system-select:focus,
  .alchemy-system-select:focus-visible {
    outline: 2px solid var(--fab-accent);
    outline-offset: 2px;
    border-color: var(--fab-accent);
  }
</style>
