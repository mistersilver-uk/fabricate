<!-- Svelte 5 runes mode -->
<script>
  import Chip from './Chip.svelte';
  import ManagerButton from '../../components/ManagerButton.svelte';
  import { localize } from '../../util/foundryBridge.js';
  import ToolBehaviorPreview from './tools/ToolBehaviorPreview.svelte';
  import ToolBreakageTab from './tools/ToolBreakageTab.svelte';
  import ToolEditorTabs from './tools/ToolEditorTabs.svelte';
  import ToolOverviewTab from './tools/ToolOverviewTab.svelte';
  import ToolRequirementsTab from './tools/ToolRequirementsTab.svelte';
  import ToolValidationTab from './tools/ToolValidationTab.svelte';
  import {
    toolDisplayImage,
    toolDisplayName,
    toolEditorValidation,
    toolSourceUuid,
  } from './tools/toolStudio.js';

  let {
    tool = null,
    // THE WORLD TOOL CORPUS, read for ONE question: does a world record exist for this Tool?
    // `toolScopeProps` was already being spread in by the call site and silently dropped, so
    // declaring it costs no new wiring. The button below must not offer a route to an entry
    // editor that would open on nothing, which is the state a pre-migration in-system Tool with
    // no world half is in.
    scope = null,
    systemName = '',
    validation = { valid: false, errors: [] },
    persisted = true,
    dirty = false,
    saving = false,
    saveError = null,
    activeTab = 'overview',
    focusValidationNonce = 0,
    managedItems = [],
    itemTags = [],
    essenceOptions = [],
    currencyUnits = [],
    currencyEnabled = false,
    prerequisiteOptions = [],
    authority = 'toolSpecific',
    onOpenSystems = () => {},
    onOpenSystem = () => {},
    onOpenTools = () => {},
    onBack = () => {},
    onDelete = () => {},
    onSave = () => {},
    onTabChange = () => {},
    onPatch = () => {},
    onToggleEnabled = () => {},
    // ── THE ROUTE OUT TO THE WORLD TOOL (issue 1373) ────────────────────────────────────────
    // The rules LIST already claims this Tool inherits world defaults, offers `What it would
    // inherit here`, and pins an `Edit the world Tool` button to its inspector. The editor
    // behind `Edit rules` offered no route to that record at all, so the list advertised a
    // destination the next screen could not reach. This is the same navigation the inspector's
    // button takes, wired to the same shell handler; the design puts it in the header band, as
    // `World Tool`, beside `Back to Tool Rules`.
    //
    // The LINK ITSELF is not authored here any more, and the three wires that used to do it —
    // `onSourceDrop`, `onCopySourceUuid`, `onUnlinkSource` — are gone with the card that used
    // them. See `tools/ToolOverviewTab` for why.
    onEditWorldTool = () => {},
  } = $props();

  function text(key, fallback) {
    const translated = localize(key);
    return translated && translated !== key ? translated : fallback;
  }
  const displayName = $derived(
    toolDisplayName(
      tool,
      managedItems,
      text('FABRICATE.Admin.Manager.Tools.Untitled', 'Untitled Tool')
    )
  );
  const displayImage = $derived(toolDisplayImage(tool, managedItems));
  const sourceContext = $derived(
    toolSourceUuid(tool) || tool?.componentId
      ? text('FABRICATE.Admin.Manager.Tools.Editor.HeaderLinked', 'Linked game-world Item')
      : text('FABRICATE.Admin.Manager.Tools.Editor.HeaderUnlinked', 'Unlinked Tool')
  );
  const editorErrorCount = $derived(
    toolEditorValidation(tool, authority, validation.errors).issueCount
  );
  const requirementCount = $derived(
    (tool?.prerequisites?.enabled ? tool.prerequisites.ids?.length || 0 : 0) +
      (tool?.bonus?.enabled ? 1 : 0)
  );

  /**
   * Whether the world catalogue actually holds a record for this Tool.
   *
   * `false` is a real answer rather than a fallback: a pre-migration in-system Tool that no
   * `1.30.0` pass has lifted has no world half, and routing to its entry editor would land the
   * GM on the `no longer in the corpus` state. The button is simply absent there.
   */
  const worldRecordExists = $derived(
    Array.isArray(scope?.entries) &&
      scope.entries.some((entry) => String(entry?.id ?? '') === String(tool?.id ?? ''))
  );
</script>

<main class="manager-main manager-tool-edit-main" data-tool-edit-view>
  <header class="manager-tool-edit-header" data-tool-editor-header>
    <nav
      class="manager-breadcrumbs"
      aria-label={text('FABRICATE.Admin.Manager.Breadcrumbs', 'Breadcrumbs')}
    >
      <button type="button" data-tool-editor-open-systems onclick={onOpenSystems}
        >{text('FABRICATE.Admin.Manager.Nav.Systems', 'Crafting Systems')}</button
      >
      <i class="fas fa-chevron-right" aria-hidden="true"></i>
      <button type="button" data-tool-editor-open-system onclick={onOpenSystem}>{systemName}</button
      >
      <i class="fas fa-chevron-right" aria-hidden="true"></i>
      <button type="button" data-tool-editor-open-tools onclick={onOpenTools}
        >{text('FABRICATE.Admin.Manager.Nav.ToolRules', 'Tool Rules')}</button
      >
      <i class="fas fa-chevron-right" aria-hidden="true"></i>
      <span title={displayName}>{displayName}</span>
    </nav>
    <div class="manager-tool-edit-header-main">
      <div class="manager-tool-edit-identity">
        <img src={displayImage} alt="" data-tool-editor-image />
        <div class="manager-tool-edit-identity-copy">
          <h2 title={displayName}>{displayName}</h2>
          <p data-tool-editor-source-context>{sourceContext}</p>
        </div>
      </div>
      <div class="manager-header-actions manager-tool-edit-actions">
        {#if dirty}<Chip tone="warning" data-tool-editor-status
            >{text('FABRICATE.Admin.Manager.Tools.Dirty', 'Unsaved')}</Chip
          >{/if}
        {#if dirty}<span data-tool-editor-dirty hidden>dirty</span>{/if}
        <!-- These three are the AUTHORITY for `ManagerButton` (issue 1096): the maintainer's
             reference for what a manager button should look like. They go through the
             primitive so the two screens cannot drift apart again — a role or a treatment
             that lands here now lands everywhere the primitive is used. Their rendering is
             unchanged: `fab-manager-button` re-declares the same `.manager-header-actions`
             values these already inherit from their ancestor. -->
        {#if worldRecordExists}
          <ManagerButton
            data-tool-editor-world-tool={String(tool?.id ?? '')}
            aria-label={text('FABRICATE.Admin.Manager.Tools.EditWorldTool', 'Edit the world Tool')}
            onclick={() => onEditWorldTool(String(tool?.id ?? ''))}
            disabled={saving}
            ><i class="fas fa-globe" aria-hidden="true"></i><span
              >{text('FABRICATE.Admin.Manager.Tools.WorldToolAction', 'World Tool')}</span
            ></ManagerButton
          >
        {/if}
        <ManagerButton
          role="ghost"
          data-tool-editor-back
          aria-label={text('FABRICATE.Admin.Manager.Tools.Editor.BackLabel', 'Back to Tools')}
          title={text('FABRICATE.Admin.Manager.Tools.Editor.BackLabel', 'Back to Tools')}
          onclick={onBack}
          disabled={saving}
          ><i class="fas fa-arrow-left" aria-hidden="true"></i><span
            >{text('FABRICATE.Admin.Manager.Tools.BackToTools', 'Back to tools')}</span
          ></ManagerButton
        >
        <ManagerButton
          role="danger"
          data-tool-editor-delete
          aria-label={text('FABRICATE.Admin.Manager.Tools.Editor.DeleteLabel', 'Delete Tool')}
          onclick={onDelete}
          disabled={saving}
          ><i class="fas fa-trash" aria-hidden="true"></i><span
            >{text('FABRICATE.Admin.Manager.Tools.Delete', 'Delete')}</span
          ></ManagerButton
        >
        <ManagerButton
          role="primary"
          data-tool-editor-save
          aria-label={text('FABRICATE.Admin.Manager.Tools.Editor.SaveLabel', 'Save Tool')}
          onclick={onSave}
          disabled={!dirty || !validation.valid || saving}
          title={validation.valid
            ? ''
            : text(
                'FABRICATE.Admin.Manager.Tools.Editor.ResolveValidation',
                'Resolve validation issues before saving.'
              )}
          ><i class={saving ? 'fas fa-spinner fa-spin' : 'fas fa-save'} aria-hidden="true"></i><span
            >{text('FABRICATE.Admin.Manager.Tools.Save', 'Save tool')}</span
          ></ManagerButton
        >
      </div>
    </div>
  </header>

  <ToolEditorTabs
    {activeTab}
    errorCount={editorErrorCount}
    {requirementCount}
    onChange={onTabChange}
  />

  <div class="manager-tool-edit-composition">
    <div
      class="manager-tool-editor-panel"
      role="tabpanel"
      id={`tool-panel-${activeTab}`}
      aria-labelledby={`tool-tab-${activeTab}`}
      data-tool-editor-panel={activeTab}
      tabindex="0"
    >
      {#if activeTab === 'overview'}
        <ToolOverviewTab {tool} {managedItems} {persisted} {onPatch} {onToggleEnabled} />
      {:else if activeTab === 'breakage'}
        <ToolBreakageTab
          {tool}
          {authority}
          componentOptions={managedItems}
          {itemTags}
          {essenceOptions}
          {currencyUnits}
          {currencyEnabled}
          {onPatch}
        />
      {:else if activeTab === 'requirements'}
        <ToolRequirementsTab {tool} {prerequisiteOptions} {onPatch} />
      {:else}
        <ToolValidationTab {tool} {authority} {validation} {saveError} {focusValidationNonce} />
      {/if}
    </div>
    <ToolBehaviorPreview {tool} {authority} {managedItems} />
  </div>
</main>
