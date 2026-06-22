<!-- Svelte 5 runes mode -->
<!--
  Checks view shell.

  Mirrors the gathering environment editor layout: a full-width tab strip
  (Crafting / Salvage / Gathering / Validation) above a workspace split into a
  central column and a right context menu. Crafting is the default tab. The
  Crafting, Salvage, and Gathering tabs show the right context menu; Validation
  spans the full width with no menu (the menu is not mounted there). All tabs
  and menus carry placeholder content for this first iteration.
-->
<script>
  import { localize } from '../../../util/foundryBridge.js';
  import ChecksEditorTabs from './ChecksEditorTabs.svelte';
  import ChecksRightMenu from './ChecksRightMenu.svelte';

  function text(key, fallback) {
    const translated = localize(key);
    return translated && translated !== key ? translated : fallback;
  }

  let activeTab = $state('crafting');

  const PANELS = {
    crafting: {
      title: text('FABRICATE.Admin.Manager.Checks.Crafting.Title', 'Crafting checks'),
      body: text(
        'FABRICATE.Admin.Manager.Checks.Crafting.Body',
        'Configure how crafting attempts are checked. Content for this tab is coming soon.'
      )
    },
    salvage: {
      title: text('FABRICATE.Admin.Manager.Checks.Salvage.Title', 'Salvage checks'),
      body: text(
        'FABRICATE.Admin.Manager.Checks.Salvage.Body',
        'Configure how salvage attempts are checked. Content for this tab is coming soon.'
      )
    },
    gathering: {
      title: text('FABRICATE.Admin.Manager.Checks.Gathering.Title', 'Gathering checks'),
      body: text(
        'FABRICATE.Admin.Manager.Checks.Gathering.Body',
        'Configure how gathering attempts are checked. Content for this tab is coming soon.'
      )
    },
    validation: {
      title: text('FABRICATE.Admin.Manager.Checks.Validation.Title', 'Validation'),
      body: text(
        'FABRICATE.Admin.Manager.Checks.Validation.Body',
        'Review issues across crafting, salvage, and gathering checks. Content for this tab is coming soon.'
      )
    }
  };

  const panel = $derived(PANELS[activeTab] || PANELS.crafting);
  const hasMenu = $derived(activeTab !== 'validation');
</script>

<div class="manager-environment-edit-view" data-environment-editor data-checks-editor>
  <ChecksEditorTabs {activeTab} onSelect={(tab) => { activeTab = tab; }} />

  <div class="manager-environment-workspace" class:is-inspector-hidden={!hasMenu}>
    <div
      class="manager-environment-tab-panel"
      role="tabpanel"
      id={`checks-panel-${activeTab}`}
      aria-labelledby={`checks-tab-${activeTab}`}
    >
      <section class="manager-inspector-card" data-checks-panel={activeTab}>
        <h2 class="manager-card-title">{panel.title}</h2>
        <p class="manager-muted">{panel.body}</p>
      </section>
    </div>

    {#if hasMenu}
      <ChecksRightMenu {activeTab} />
    {/if}
  </div>
</div>
