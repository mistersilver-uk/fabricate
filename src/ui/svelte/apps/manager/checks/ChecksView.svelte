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
  import SimpleCraftingCheckEditor from './SimpleCraftingCheckEditor.svelte';
  import ProgressiveCraftingCheckEditor from './ProgressiveCraftingCheckEditor.svelte';

  // `resolutionMode` is the selected system's recipe resolution mode and selects
  // which crafting check editor renders: routed → the outcome-tier editor;
  // simple/alchemy → the simple pass/fail editor; progressive → the formula +
  // crit editor (no DC). `craftingCheck` is the routed draft, `craftingCheckSimple`
  // the simple draft, and `craftingCheckProgressive` the progressive draft (all
  // owned/persisted by the manager root), each with a matching update callback.
  // `salvageResolutionMode` + the salvage drafts drive the Salvage tab's editor
  // (simple/routed reuse the crafting editors with recipe-specific bits hidden;
  // progressive reuses the crafting progressive editor). `onTabChange` notifies the
  // root which check sub-tab is active so the shared header Save persists the right draft.
  let {
    resolutionMode = 'simple',
    craftingCheck = null,
    craftingCheckSimple = null,
    craftingCheckProgressive = null,
    salvageResolutionMode = 'simple',
    salvageCheckSimple = null,
    salvageCheckRouted = null,
    salvageCheckProgressive = null,
    activation = {},
    onUpdateCraftingCheck = () => {},
    onUpdateCraftingCheckSimple = () => {},
    onUpdateCraftingCheckProgressive = () => {},
    onUpdateSalvageCheckSimple = () => {},
    onUpdateSalvageCheckRouted = () => {},
    onUpdateSalvageCheckProgressive = () => {},
    onTabChange = () => {},
    onToggleCheckActive = () => {}
  } = $props();

  function text(key, fallback) {
    const translated = localize(key);
    return translated && translated !== key ? translated : fallback;
  }

  let activeTab = $state('crafting');

  const craftingRouted = $derived(resolutionMode === 'routed');
  const craftingSimple = $derived(resolutionMode === 'simple' || resolutionMode === 'alchemy');
  const craftingProgressive = $derived(resolutionMode === 'progressive');
  const salvageRouted = $derived(salvageResolutionMode === 'routed');
  const salvageProgressive = $derived(salvageResolutionMode === 'progressive');
  const salvageSimple = $derived(
    salvageResolutionMode === 'simple' || salvageResolutionMode === 'alchemy'
  );

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
  <ChecksEditorTabs {activeTab} onSelect={(tab) => { activeTab = tab; onTabChange(tab); }} />

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
          <CraftingCheckEditor value={craftingCheck} onChange={onUpdateCraftingCheck} />
        </div>
      {:else if activeTab === 'crafting' && craftingSimple}
        <div data-checks-panel="crafting">
          <SimpleCraftingCheckEditor value={craftingCheckSimple} onChange={onUpdateCraftingCheckSimple} />
        </div>
      {:else if activeTab === 'crafting' && craftingProgressive}
        <div data-checks-panel="crafting">
          <ProgressiveCraftingCheckEditor value={craftingCheckProgressive} onChange={onUpdateCraftingCheckProgressive} />
        </div>
      {:else if activeTab === 'salvage' && salvageRouted}
        <div data-checks-panel="salvage">
          <CraftingCheckEditor value={salvageCheckRouted} showTiers={false} onChange={onUpdateSalvageCheckRouted} />
        </div>
      {:else if activeTab === 'salvage' && salvageProgressive}
        <div data-checks-panel="salvage">
          <ProgressiveCraftingCheckEditor value={salvageCheckProgressive} onChange={onUpdateSalvageCheckProgressive} />
        </div>
      {:else if activeTab === 'salvage' && salvageSimple}
        <div data-checks-panel="salvage">
          <SimpleCraftingCheckEditor value={salvageCheckSimple} showDcSource={false} onChange={onUpdateSalvageCheckSimple} />
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
      <ChecksRightMenu
        {activeTab}
        activation={activation?.[activeTab]}
        onToggleActive={(enabled) => onToggleCheckActive(activeTab, enabled)}
      />
    {/if}
  </div>
</div>
