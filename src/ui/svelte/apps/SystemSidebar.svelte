<!-- Svelte 5 runes mode -->
<script>
  import { localize } from '../util/foundryBridge.js';

  let { systems = [], onSelectSystem, onCreateSystem, onDeleteSystem, onExportSystem, onImportSystem } = $props();
  let openMenuSystemId = $state(null);

  function closeMenu() {
    openMenuSystemId = null;
  }

  function toggleMenu(systemId, event) {
    event.preventDefault();
    event.stopPropagation();
    openMenuSystemId = openMenuSystemId === systemId ? null : systemId;
  }

  function selectSystem(systemId) {
    closeMenu();
    onSelectSystem?.(systemId);
  }

  function handleMenuAction(action, systemId, event) {
    event.preventDefault();
    event.stopPropagation();
    closeMenu();
    action?.(systemId);
  }

  function handleContextKeydown(systemId, event) {
    if (event.key === 'ContextMenu' || (event.shiftKey && event.key === 'F10')) {
      toggleMenu(systemId, event);
    }
  }

  function dismissMenuAction(node) {
    const closeIfOutside = (event) => {
      if (!(event.target instanceof Node)) return;
      if (!node.contains(event.target)) {
        closeMenu();
      }
    };

    const closeOnEscape = (event) => {
      if (event.key === 'Escape') {
        closeMenu();
      }
    };

    document.addEventListener('mousedown', closeIfOutside, true);
    document.addEventListener('contextmenu', closeIfOutside, true);
    document.addEventListener('keydown', closeOnEscape, true);

    return {
      destroy() {
        document.removeEventListener('mousedown', closeIfOutside, true);
        document.removeEventListener('contextmenu', closeIfOutside, true);
        document.removeEventListener('keydown', closeOnEscape, true);
      }
    };
  }
</script>

<aside class="admin-sidebar" use:dismissMenuAction>
  <div class="admin-sidebar-header">
    <h3>{localize('FABRICATE.Admin.Sidebar.Title')}</h3>
    <button type="button" onclick={onCreateSystem} title={localize('FABRICATE.Admin.Sidebar.CreateSystem')}>
      <i class="fas fa-plus"></i>
    </button>
  </div>
  <div class="admin-system-list-shell">
    <ul class="admin-system-list">
      {#each systems as system (system.id)}
        <li
          class:active={system.selected}
          class:menu-open={openMenuSystemId === system.id}
          data-system-id={system.id}
        >
          <button
            type="button"
            class="system-link"
            onclick={() => selectSystem(system.id)}
            oncontextmenu={(event) => toggleMenu(system.id, event)}
            onkeydown={(event) => handleContextKeydown(system.id, event)}
          >
            {system.name}
          </button>

          {#if openMenuSystemId === system.id}
            <div class="system-context-menu" role="menu" aria-label={localize('FABRICATE.Admin.Actions')}>
              <button
                type="button"
                class="system-context-action"
                role="menuitem"
                onclick={(event) => handleMenuAction(onExportSystem, system.id, event)}
              >
                <i class="fas fa-file-export"></i>
                <span>{localize('FABRICATE.Admin.Sidebar.ExportSystem')}</span>
              </button>
              <button
                type="button"
                class="system-context-action danger"
                role="menuitem"
                onclick={(event) => handleMenuAction(onDeleteSystem, system.id, event)}
              >
                <i class="fas fa-trash"></i>
                <span>{localize('FABRICATE.Admin.Sidebar.DeleteSystem')}</span>
              </button>
            </div>
          {/if}
        </li>
      {:else}
        <li class="empty">{localize('FABRICATE.Admin.Sidebar.Empty')}</li>
      {/each}
    </ul>
  </div>
  <div class="admin-sidebar-footer">
    <button type="button" class="import-system-btn" onclick={onImportSystem}>
      <i class="fas fa-file-import"></i> {localize('FABRICATE.Admin.Sidebar.ImportSystem')}
    </button>
  </div>
</aside>
