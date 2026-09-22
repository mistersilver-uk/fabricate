<!-- Svelte 5 runes mode -->
<!--
  The manager page header's breadcrumb trail: the world root or the crafting-system root, then one
  crumb chain per route (issue 1720, extracted from the root).

  Props:
  | prop | values | default | contract |
  | --- | --- | --- | --- |
  | `header` | the `headerModel` instance | — | read for `title`, which two world scoped crumbs fall back to |
  | `text` | the shell's localizer | — | `(key, fallback)`; the trail spells no copy of its own |

  Every other prop is one route's crumb subject or the handler its crumb navigates through.

  Invariants:
  - A crumb is a control only when pressing it leaves the screen the GM is on; the Gathering group
    crumb is a span on `environments` and a button in its editors.
  - The world root is a span on `world` itself and a button everywhere below it.
-->
<script>
  let {
    header,
    text = () => '',
    currentView = '',
    selectedSystem = null,
    isWorldRoute = false,
    isWorldDowntimeRoute = false,
    isWorldRulesRoute = false,
    isWorldTravelRoute = false,
    isWorldScopedRoute = false,
    isChecksRoute = false,
    checksActiveTab = '',
    worldScopedEntryRoute = null,
    worldScopedEntryCrumb = '',
    worldRulesTab = '',
    worldRulesPageTitle = '',
    worldTravelTab = '',
    worldDowntimeTabId = '',
    downtimeTabCrumb = '',
    downtimeTabCrumbNavigable = false,
    downtimeLeafCrumb = '',
    downtimeChromeChannel = null,
    activeGatheringTab = '',
    gatheringTabLabel = '',
    recipeDraft = null,
    recipeItemCrumb = '',
    componentForEdit = null,
    essenceEditName = '',
    environmentCrumb = '',
    gatheringTaskCrumb = '',
    gatheringEventCrumb = '',
    openWorldParties = () => {},
    setView = () => {},
    selectSystemAndShowBrowser = () => {},
    editSystem = () => {},
    openCraftingSection = () => {},
    backToBooksScrolls = () => {},
    backToEssencesBrowse = () => {},
    backToRecipesBrowse = () => {},
    backToComponentsBrowse = () => {},
    backToEnvironmentsBrowse = () => {},
    backToGatheringTaskLibrary = () => {},
    backToGatheringEventLibrary = () => {},
  } = $props();
</script>

<nav
  class="manager-breadcrumbs"
  aria-label={text('FABRICATE.Admin.Manager.Breadcrumbs', 'Breadcrumbs')}
>
  <!-- Two roots, not one: the world trail and the crafting-system trail (issue 1322). -->
  {#if isWorldRoute || isWorldDowntimeRoute || isWorldRulesRoute || isWorldTravelRoute || isWorldScopedRoute}
    <!-- The trail spells `World.Breadcrumb`; the caps `World.Heading` is the rail's own label. -->
    {#if isWorldRoute}
      <span data-breadcrumb-world>{text('FABRICATE.Admin.Manager.World.Breadcrumb', 'World')}</span>
    {:else}
      <button type="button" data-breadcrumb-world onclick={() => openWorldParties()}
        >{text('FABRICATE.Admin.Manager.World.Breadcrumb', 'World')}</button
      >
    {/if}
    {#if isWorldScopedRoute}
      <!-- A catalogue is two crumbs and an entry is three. -->
      <i class="fas fa-chevron-right" aria-hidden="true"></i>
      {#if worldScopedEntryRoute}
        <button
          type="button"
          data-breadcrumb-world-scoped-catalogue={worldScopedEntryRoute.catalogueView}
          onclick={() => setView(worldScopedEntryRoute.catalogueView)}
          >{text(
            worldScopedEntryRoute.catalogueTitleKey,
            worldScopedEntryRoute.catalogueTitleFallback
          )}</button
        >
        <i class="fas fa-chevron-right" aria-hidden="true"></i>
        <!-- The entity's own name where the corpus supplies one, falling back to the screen
             title: an entry with no subject chosen must not print an empty crumb. -->
        <span data-breadcrumb-world-scoped={currentView} title={worldScopedEntryCrumb}
          >{worldScopedEntryCrumb || header.title}</span
        >
      {:else}
        <span data-breadcrumb-world-scoped={currentView}>{header.title}</span>
      {/if}
    {/if}
    {#if isWorldRulesRoute}
      <i class="fas fa-chevron-right" aria-hidden="true"></i>
      <span>{text('FABRICATE.Admin.Manager.World.RulesNav', 'Rules & Resources')}</span>
      <i class="fas fa-chevron-right" aria-hidden="true"></i>
      <span data-breadcrumb-world-rules-tab={worldRulesTab}>{worldRulesPageTitle}</span>
    {/if}
    {#if isWorldTravelRoute}
      <i class="fas fa-chevron-right" aria-hidden="true"></i>
      <span>{text('FABRICATE.Admin.Manager.World.TravelNav', 'Travel')}</span>
      <i class="fas fa-chevron-right" aria-hidden="true"></i>
      <span data-breadcrumb-world-travel-tab={worldTravelTab}
        >{worldTravelTab === 'map'
          ? text('FABRICATE.Admin.Manager.Travel.Tabs.MapLinks', 'Map Region Links')
          : text('FABRICATE.Admin.Manager.Travel.Tabs.Realms', 'Realms')}</span
      >
    {/if}
    {#if isWorldDowntimeRoute}
      <i class="fas fa-chevron-right" aria-hidden="true"></i>
      <span>{text('FABRICATE.Admin.Manager.World.Downtime.Title', 'Downtime')}</span>
      <i class="fas fa-chevron-right" aria-hidden="true"></i>
      <!-- The tab crumb names the tab, so whoever owns the tab owns its navigation. -->
      {#if downtimeTabCrumbNavigable}
        <button
          type="button"
          data-breadcrumb-downtime-tab={worldDowntimeTabId}
          onclick={() => downtimeChromeChannel.reselect()}>{downtimeTabCrumb}</button
        >
      {:else}
        <span data-breadcrumb-downtime-tab={worldDowntimeTabId}>{downtimeTabCrumb}</span>
      {/if}
      <!-- The companion's own leaf under it, where it says something the tab crumb does not. -->
      {#if downtimeLeafCrumb}
        <i class="fas fa-chevron-right" aria-hidden="true"></i>
        <span data-breadcrumb-downtime-leaf>{downtimeLeafCrumb}</span>
      {/if}
    {/if}
  {:else}
    <button type="button" onclick={() => selectSystemAndShowBrowser()}
      >{text('FABRICATE.Admin.Manager.Nav.Systems', 'Crafting Systems')}</button
    >
    {#if selectedSystem && currentView !== 'systems'}
      <i class="fas fa-chevron-right" aria-hidden="true"></i>
      <button type="button" onclick={() => editSystem(selectedSystem.id)}
        >{selectedSystem.name}</button
      >
    {/if}
  {/if}
  {#if currentView === 'recipes'}
    <i class="fas fa-chevron-right" aria-hidden="true"></i>
    <button type="button" onclick={() => openCraftingSection('recipes')}
      >{text('FABRICATE.Admin.Manager.Nav.Crafting', 'Crafting')}</button
    >
    <i class="fas fa-chevron-right" aria-hidden="true"></i>
    <span>{text('FABRICATE.Admin.Manager.Nav.Recipes', 'Recipes')}</span>
  {/if}
  {#if currentView === 'crafting-settings'}
    <i class="fas fa-chevron-right" aria-hidden="true"></i>
    <button type="button" onclick={() => openCraftingSection('recipes')}
      >{text('FABRICATE.Admin.Manager.Nav.Crafting', 'Crafting')}</button
    >
    <i class="fas fa-chevron-right" aria-hidden="true"></i>
    <span>{text('FABRICATE.Admin.Manager.Crafting.CraftingTabs.Settings', 'Settings')}</span>
  {/if}
  {#if currentView === 'access'}
    <i class="fas fa-chevron-right" aria-hidden="true"></i>
    <button type="button" onclick={() => openCraftingSection('recipes')}
      >{text('FABRICATE.Admin.Manager.Nav.Crafting', 'Crafting')}</button
    >
    <i class="fas fa-chevron-right" aria-hidden="true"></i>
    <span>{text('FABRICATE.Admin.Manager.Nav.Access', 'Access')}</span>
  {/if}
  {#if currentView === 'books-scrolls'}
    <i class="fas fa-chevron-right" aria-hidden="true"></i>
    <button type="button" onclick={() => openCraftingSection('recipes')}
      >{text('FABRICATE.Admin.Manager.Nav.Crafting', 'Crafting')}</button
    >
    <i class="fas fa-chevron-right" aria-hidden="true"></i>
    <span>{text('FABRICATE.Admin.Manager.Nav.BooksScrolls', 'Books & Scrolls')}</span>
  {/if}
  {#if currentView === 'knowledge'}
    <i class="fas fa-chevron-right" aria-hidden="true"></i>
    <button type="button" onclick={() => openCraftingSection('recipes')}
      >{text('FABRICATE.Admin.Manager.Nav.Crafting', 'Crafting')}</button
    >
    <i class="fas fa-chevron-right" aria-hidden="true"></i>
    <span>{text('FABRICATE.Admin.Manager.Nav.Knowledge', 'Knowledge')}</span>
  {/if}
  {#if currentView === 'recipe-item-edit'}
    <i class="fas fa-chevron-right" aria-hidden="true"></i>
    <button type="button" onclick={() => openCraftingSection('recipes')}
      >{text('FABRICATE.Admin.Manager.Nav.Crafting', 'Crafting')}</button
    >
    <i class="fas fa-chevron-right" aria-hidden="true"></i>
    <button type="button" onclick={backToBooksScrolls}
      >{text('FABRICATE.Admin.Manager.Nav.BooksScrolls', 'Books & Scrolls')}</button
    >
    <i class="fas fa-chevron-right" aria-hidden="true"></i>
    <!-- Name the item, not the generic "Edit recipe item". -->
    <span title={recipeItemCrumb}>{recipeItemCrumb}</span>
  {/if}
  {#if currentView === 'components'}
    <i class="fas fa-chevron-right" aria-hidden="true"></i>
    <span>{text('FABRICATE.Admin.Manager.Nav.ComponentRules', 'Component Rules')}</span>
  {/if}
  {#if currentView === 'tags'}
    <i class="fas fa-chevron-right" aria-hidden="true"></i>
    <span>{text('FABRICATE.Admin.Manager.Nav.TagsCategories', 'Tags & Categories')}</span>
  {/if}
  {#if currentView === 'essences'}
    <i class="fas fa-chevron-right" aria-hidden="true"></i>
    <span>{text('FABRICATE.Admin.Manager.Nav.EssenceRules', 'Essence Rules')}</span>
  {/if}
  {#if currentView === 'essence-edit'}
    <i class="fas fa-chevron-right" aria-hidden="true"></i>
    <button type="button" onclick={backToEssencesBrowse}
      >{text('FABRICATE.Admin.Manager.Nav.EssenceRules', 'Essence Rules')}</button
    >
    <i class="fas fa-chevron-right" aria-hidden="true"></i>
    <!-- Name the essence, not the generic "Edit essence", which survives as the fallback for
       a subject with no name yet. -->
    <span title={essenceEditName}
      >{essenceEditName ||
        text('FABRICATE.Admin.Manager.Essence.EditBreadcrumb', 'Edit essence')}</span
    >
  {/if}
  {#if currentView === 'recipe-edit'}
    <i class="fas fa-chevron-right" aria-hidden="true"></i>
    <button type="button" onclick={() => openCraftingSection('recipes')}
      >{text('FABRICATE.Admin.Manager.Nav.Crafting', 'Crafting')}</button
    >
    <i class="fas fa-chevron-right" aria-hidden="true"></i>
    <button type="button" onclick={backToRecipesBrowse}
      >{text('FABRICATE.Admin.Manager.Nav.Recipes', 'Recipes')}</button
    >
    <i class="fas fa-chevron-right" aria-hidden="true"></i>
    <!-- Name the recipe, not the generic "Edit recipe". -->
    <span
      >{recipeDraft?.name ||
        text('FABRICATE.Admin.Manager.Recipe.EditBreadcrumb', 'Edit recipe')}</span
    >
  {/if}
  {#if currentView === 'component-edit'}
    <i class="fas fa-chevron-right" aria-hidden="true"></i>
    <button type="button" onclick={backToComponentsBrowse}
      >{text('FABRICATE.Admin.Manager.Nav.ComponentRules', 'Component Rules')}</button
    >
    <i class="fas fa-chevron-right" aria-hidden="true"></i>
    <!-- Name the component, not the generic "Edit component". -->
    <span
      >{componentForEdit?.name ||
        text('FABRICATE.Admin.Manager.Component.EditBreadcrumb', 'Edit component')}</span
    >
  {/if}
  {#if currentView === 'environments'}
    <i class="fas fa-chevron-right" aria-hidden="true"></i>
    <!-- The group, then the screen: Gathering is four screens under one name. A crumb is a
       control only where pressing it leaves the screen, and `backToEnvironmentsBrowse` returns
       to this route, so the group is a span here and a button in the editors below. -->
    <span>{text('FABRICATE.Admin.Manager.Nav.Environments', 'Gathering')}</span>
    {#if gatheringTabLabel}
      <i class="fas fa-chevron-right" aria-hidden="true"></i>
      <span data-breadcrumb-gathering-tab={activeGatheringTab}>{gatheringTabLabel}</span>
    {/if}
  {/if}
  {#if currentView === 'environment-edit'}
    <i class="fas fa-chevron-right" aria-hidden="true"></i>
    <button type="button" onclick={backToEnvironmentsBrowse}
      >{text('FABRICATE.Admin.Manager.Nav.Environments', 'Gathering')}</button
    >
    <i class="fas fa-chevron-right" aria-hidden="true"></i>
    <button type="button" onclick={backToEnvironmentsBrowse}
      >{text(
        'FABRICATE.Admin.Manager.Environment.GatheringTabs.Environments',
        'Environments'
      )}</button
    >
    <i class="fas fa-chevron-right" aria-hidden="true"></i>
    <span title={environmentCrumb}>{environmentCrumb}</span>
  {/if}
  {#if currentView === 'gathering-task-edit'}
    <i class="fas fa-chevron-right" aria-hidden="true"></i>
    <!-- The group is not skipped: `Tasks` is a screen inside Gathering. -->
    <button type="button" onclick={backToEnvironmentsBrowse}
      >{text('FABRICATE.Admin.Manager.Nav.Environments', 'Gathering')}</button
    >
    <i class="fas fa-chevron-right" aria-hidden="true"></i>
    <button type="button" onclick={backToGatheringTaskLibrary}
      >{text('FABRICATE.Admin.Manager.Environment.GatheringTabs.Tasks', 'Tasks')}</button
    >
    <i class="fas fa-chevron-right" aria-hidden="true"></i>
    <span title={gatheringTaskCrumb}>{gatheringTaskCrumb}</span>
  {/if}
  {#if currentView === 'gathering-event-edit'}
    <i class="fas fa-chevron-right" aria-hidden="true"></i>
    <button type="button" onclick={backToEnvironmentsBrowse}
      >{text('FABRICATE.Admin.Manager.Nav.Environments', 'Gathering')}</button
    >
    <i class="fas fa-chevron-right" aria-hidden="true"></i>
    <button type="button" onclick={backToGatheringEventLibrary}
      >{text('FABRICATE.Admin.Manager.Environment.GatheringTabs.Encounters', 'Events')}</button
    >
    <i class="fas fa-chevron-right" aria-hidden="true"></i>
    <span title={gatheringEventCrumb}>{gatheringEventCrumb}</span>
  {/if}
  {#if isChecksRoute}
    <i class="fas fa-chevron-right" aria-hidden="true"></i>
    <span>{text('FABRICATE.Admin.Manager.Nav.Checks', 'Checks')}</span>
    <i class="fas fa-chevron-right" aria-hidden="true"></i>
    <span
      >{text(
        `FABRICATE.Admin.Manager.Checks.Tabs.${checksActiveTab[0].toUpperCase()}${checksActiveTab.slice(1)}`,
        checksActiveTab
      )}</span
    >
  {/if}
  {#if currentView === 'system-edit'}
    <i class="fas fa-chevron-right" aria-hidden="true"></i>
    <span>{text('FABRICATE.Admin.Manager.SystemEdit.PageBreadcrumb', 'System Overview')}</span>
  {/if}
</nav>
