<!-- Svelte 5 runes mode -->
<!--
  Checks view shell.

  Mirrors the gathering environment editor layout: a full-width tab strip
  (Crafting / Salvage / Gathering / Validation) above a workspace split into a
  central column and a right context menu. Crafting is the default tab.

  A system has exactly one crafting, one salvage, and one gathering check — each
  a singleton whose shape is determined by the system's resolution mode (and
  preserved per mode when modes are switched). So each check tab is a single
  editor page, not a list: there is no create action and no "no checks yet"
  empty state. The Crafting, Salvage, and Gathering tabs show the right context
  menu (docs help); Validation spans the full width with no menu. Placeholder
  content for this first iteration.
-->
<script>
  import { localize } from '../../../util/foundryBridge.js';
  import ChecksEditorTabs from './ChecksEditorTabs.svelte';
  import ChecksRightMenu from './ChecksRightMenu.svelte';
  import CraftingCheckEditor from './CraftingCheckEditor.svelte';

  // `resolutionMode` is the selected system's recipe resolution mode. The full
  // crafting check editor is built for routed mode; other modes keep the
  // singleton placeholder page until their editors are built.
  let { resolutionMode = 'simple' } = $props();

  function text(key, fallback) {
    const translated = localize(key);
    return translated && translated !== key ? translated : fallback;
  }

  function newId() {
    const random = globalThis.foundry?.utils?.randomID;
    return typeof random === 'function' ? random() : Math.random().toString(36).slice(2, 12);
  }

  let activeTab = $state('crafting');

  // Local draft for the routed crafting check. Persistence to the system model
  // is a follow-up; for now the draft lives for the lifetime of the view.
  let craftingCheckDraft = $state({
    type: 'relative',
    rollExpression: '1d20',
    outcomes: [
      { id: newId(), name: 'Failure', success: false, breakTools: true, dc: 0, start: 1, end: 10 },
      { id: newId(), name: 'Success', success: true, breakTools: false, dc: 0, start: 11, end: 20 }
    ]
  });

  const craftingRouted = $derived(resolutionMode === 'routed');

  const PAGES = {
    crafting: {
      title: text('FABRICATE.Admin.Manager.Checks.Crafting.PageTitle', 'Crafting check'),
      lead: text(
        'FABRICATE.Admin.Manager.Checks.Crafting.PageLead',
        "A system has a single crafting check. Its shape is determined by the system's resolution mode and preserved when you switch modes."
      ),
      configHint: text(
        'FABRICATE.Admin.Manager.Checks.Crafting.ConfigHint',
        'Roll, difficulty, and outcome settings for the crafting check will appear here.'
      )
    },
    salvage: {
      title: text('FABRICATE.Admin.Manager.Checks.Salvage.PageTitle', 'Salvage check'),
      lead: text(
        'FABRICATE.Admin.Manager.Checks.Salvage.PageLead',
        "A system has a single salvage check. Its shape is determined by the system's salvage resolution mode and preserved when you switch modes."
      ),
      configHint: text(
        'FABRICATE.Admin.Manager.Checks.Salvage.ConfigHint',
        'Roll, difficulty, and outcome settings for the salvage check will appear here.'
      )
    },
    gathering: {
      title: text('FABRICATE.Admin.Manager.Checks.Gathering.PageTitle', 'Gathering check'),
      lead: text(
        'FABRICATE.Admin.Manager.Checks.Gathering.PageLead',
        'A system has a single gathering check. In d100 mode it is the fixed d100 roll and is not editable; progressive and routed modes let you define it. Per-task tuning adjusts the difficulty, not the roll.'
      ),
      configHint: text(
        'FABRICATE.Admin.Manager.Checks.Gathering.ConfigHint',
        'Roll, difficulty, and outcome settings for the gathering check will appear here.'
      )
    }
  };

  const validation = {
    title: text('FABRICATE.Admin.Manager.Checks.Validation.EmptyTitle', 'Nothing to validate yet'),
    hint: text(
      'FABRICATE.Admin.Manager.Checks.Validation.EmptyHint',
      'Issues across the crafting, salvage, and gathering checks will be listed here.'
    )
  };

  const configTitle = text('FABRICATE.Admin.Manager.Checks.Configuration', 'Configuration');
  const pageKicker = text('FABRICATE.Admin.Manager.Checks.PageKicker', 'One per system');
  const page = $derived(PAGES[activeTab] || PAGES.crafting);
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
      {#if activeTab === 'validation'}
        <div class="manager-empty" data-checks-panel="validation">
          <div>
            <i class="fas fa-clipboard-check" aria-hidden="true"></i>
            <h3>{validation.title}</h3>
            <p>{validation.hint}</p>
          </div>
        </div>
      {:else if activeTab === 'crafting' && craftingRouted}
        <div data-checks-panel="crafting">
          <CraftingCheckEditor value={craftingCheckDraft} onChange={(next) => { craftingCheckDraft = next; }} />
        </div>
      {:else}
        <div class="manager-checks-page" data-checks-panel={activeTab}>
          <section class="manager-inspector-card">
            <p class="manager-kicker">{pageKicker}</p>
            <h2 class="manager-card-title">{page.title}</h2>
            <p class="manager-muted">{page.lead}</p>
          </section>
          <section class="manager-inspector-card">
            <h3 class="manager-card-title">{configTitle}</h3>
            <p class="manager-muted">{page.configHint}</p>
          </section>
        </div>
      {/if}
    </div>

    {#if hasMenu}
      <ChecksRightMenu {activeTab} />
    {/if}
  </div>
</div>
