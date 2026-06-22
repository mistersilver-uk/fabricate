<!-- Svelte 5 runes mode -->
<!--
  Checks view shell.

  Mirrors the gathering environment editor layout: a full-width tab strip
  (Crafting / Salvage / Gathering / Validation) above a workspace split into a
  central column and a right context menu. Crafting is the default tab. The
  Crafting, Salvage, and Gathering tabs show the right context menu; Validation
  spans the full width with no menu (the menu is not mounted there).

  The active tab is owned by the manager root (a controlled `activeTab` prop) so
  the root header can render a tab-aware "Create a … Check" action beside it.
  Until the checks data model exists, every tab renders the recipe-browser-style
  central empty state with a "No … checks yet" call to action.
-->
<script>
  import { localize } from '../../../util/foundryBridge.js';
  import ChecksEditorTabs from './ChecksEditorTabs.svelte';
  import ChecksRightMenu from './ChecksRightMenu.svelte';

  let { activeTab = 'crafting', onSelectTab = () => {} } = $props();

  function text(key, fallback) {
    const translated = localize(key);
    return translated && translated !== key ? translated : fallback;
  }

  const PANELS = {
    crafting: {
      icon: 'fas fa-hammer',
      emptyTitle: text('FABRICATE.Admin.Manager.Checks.Crafting.EmptyTitle', 'No crafting checks yet'),
      emptyHint: text(
        'FABRICATE.Admin.Manager.Checks.Crafting.EmptyHint',
        'Create a crafting check to gate crafting attempts behind a roll.'
      )
    },
    salvage: {
      icon: 'fas fa-recycle',
      emptyTitle: text('FABRICATE.Admin.Manager.Checks.Salvage.EmptyTitle', 'No salvage checks yet'),
      emptyHint: text(
        'FABRICATE.Admin.Manager.Checks.Salvage.EmptyHint',
        'Create a salvage check to gate salvage attempts behind a roll.'
      )
    },
    gathering: {
      icon: 'fas fa-seedling',
      emptyTitle: text('FABRICATE.Admin.Manager.Checks.Gathering.EmptyTitle', 'No gathering checks yet'),
      emptyHint: text(
        'FABRICATE.Admin.Manager.Checks.Gathering.EmptyHint',
        'Create a gathering check to gate gathering attempts behind a roll.'
      )
    },
    validation: {
      icon: 'fas fa-clipboard-check',
      emptyTitle: text('FABRICATE.Admin.Manager.Checks.Validation.EmptyTitle', 'Nothing to validate yet'),
      emptyHint: text(
        'FABRICATE.Admin.Manager.Checks.Validation.EmptyHint',
        'Issues across crafting, salvage, and gathering checks will be listed here.'
      )
    }
  };

  const panel = $derived(PANELS[activeTab] || PANELS.crafting);
  const hasMenu = $derived(activeTab !== 'validation');
</script>

<div class="manager-environment-edit-view" data-environment-editor data-checks-editor>
  <ChecksEditorTabs {activeTab} onSelect={onSelectTab} />

  <div class="manager-environment-workspace" class:is-inspector-hidden={!hasMenu}>
    <div
      class="manager-environment-tab-panel"
      role="tabpanel"
      id={`checks-panel-${activeTab}`}
      aria-labelledby={`checks-tab-${activeTab}`}
    >
      <div class="manager-empty" data-checks-panel={activeTab}>
        <div>
          <i class={panel.icon} aria-hidden="true"></i>
          <h3>{panel.emptyTitle}</h3>
          <p>{panel.emptyHint}</p>
        </div>
      </div>
    </div>

    {#if hasMenu}
      <ChecksRightMenu {activeTab} />
    {/if}
  </div>
</div>
