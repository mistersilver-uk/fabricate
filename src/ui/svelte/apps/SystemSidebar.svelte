<!-- Svelte 5 runes mode -->
<script>
  import { localize } from '../util/foundryBridge.js';

  let { systems = [], onSelectSystem, onCreateSystem, onDeleteSystem } = $props();
</script>

<aside class="admin-sidebar">
  <div class="admin-sidebar-header">
    <h3>{localize('FABRICATE.Admin.Sidebar.Title')}</h3>
    <button type="button" onclick={onCreateSystem} title={localize('FABRICATE.Admin.Sidebar.CreateSystem')}>
      <i class="fas fa-plus"></i>
    </button>
  </div>
  <ul class="admin-system-list">
    {#each systems as system (system.id)}
      <li class:active={system.selected}>
        <button type="button" class="system-link" onclick={() => onSelectSystem(system.id)}>{system.name}</button>
        <button type="button" onclick={() => onDeleteSystem(system.id)} title={localize('FABRICATE.Admin.Sidebar.DeleteSystem')}>
          <i class="fas fa-trash"></i>
        </button>
      </li>
    {:else}
      <li class="empty">{localize('FABRICATE.Admin.Sidebar.Empty')}</li>
    {/each}
  </ul>
</aside>
