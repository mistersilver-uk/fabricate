<!-- Svelte 5 runes mode -->
<script>
  import { localize } from '../../util/foundryBridge.js';
  import ToolBehaviorPreview from './tools/ToolBehaviorPreview.svelte';
  import ToolBreakageTab from './tools/ToolBreakageTab.svelte';
  import ToolEditorTabs from './tools/ToolEditorTabs.svelte';
  import ToolOverviewTab from './tools/ToolOverviewTab.svelte';
  import ToolRequirementsTab from './tools/ToolRequirementsTab.svelte';
  import ToolValidationTab from './tools/ToolValidationTab.svelte';
  import { toolDisplayName, toolEditorChecks } from './tools/toolStudio.js';

  let {
    tool = null,
    validation = { valid: false, errors: [] },
    dirty = false,
    saving = false,
    saveError = null,
    activeTab = 'overview',
    focusValidationNonce = 0,
    worldItems = [],
    managedItems = [],
    itemTags = [],
    essenceOptions = [],
    currencyUnits = [],
    currencyEnabled = false,
    prerequisiteOptions = [],
    authority = 'toolSpecific',
    onBack = () => {},
    onDelete = () => {},
    onSave = () => {},
    onTabChange = () => {},
    onPatch = () => {},
    onStageSource = () => {},
    onSourceDrop = () => {},
    onUnlinkSource = () => {},
  } = $props();

  function text(key, fallback) {
    const translated = localize(key);
    return translated && translated !== key ? translated : fallback;
  }
  const displayName = $derived(toolDisplayName(tool, managedItems, text('FABRICATE.Admin.Manager.Tools.Untitled', 'Untitled Tool')));
  const editorErrorCount = $derived(toolEditorChecks(tool, authority).filter((check) => !check.valid).length + (validation.errors?.length || 0));
</script>

<main class="manager-main manager-tool-edit-main" data-tool-edit-view>
  <header class="manager-tool-edit-header" data-tool-editor-header>
    <div class="manager-tool-edit-identity">
      <button type="button" class="manager-icon-button" data-tool-editor-back aria-label={text('FABRICATE.Admin.Manager.Tools.Back', 'Back to Tools')} title={text('FABRICATE.Admin.Manager.Tools.Back', 'Back to Tools')} onclick={onBack} disabled={saving}><i class="fas fa-arrow-left" aria-hidden="true"></i></button>
      <div><p class="manager-kicker">{text('FABRICATE.Admin.Manager.Tools.EditorKicker', 'Tool editor')}</p><h2>{displayName}</h2></div>
      <span class={`manager-chip ${dirty ? 'is-warning' : 'is-positive'}`} data-tool-editor-status>
        <i class={dirty ? 'fas fa-pen' : 'fas fa-circle-check'} aria-hidden="true"></i>
        {dirty ? text('FABRICATE.Admin.Manager.Tools.Dirty', 'Unsaved') : text('FABRICATE.Admin.Manager.Tools.Editor.Saved', 'Saved')}
      </span>
      {#if dirty}<span data-tool-editor-dirty hidden>dirty</span>{/if}
    </div>
    <div class="manager-tool-edit-actions">
      <button type="button" class="manager-button is-danger" data-tool-editor-delete onclick={onDelete} disabled={saving}><i class="fas fa-trash" aria-hidden="true"></i><span>{text('FABRICATE.Admin.Manager.Tools.Delete', 'Delete Tool')}</span></button>
      <button type="button" class="manager-button is-primary" data-tool-editor-save onclick={onSave} disabled={!dirty || !validation.valid || saving} title={validation.valid ? '' : text('FABRICATE.Admin.Manager.Tools.Editor.ResolveValidation', 'Resolve validation issues before saving.')}><i class={saving ? 'fas fa-spinner fa-spin' : 'fas fa-save'} aria-hidden="true"></i><span>{text('FABRICATE.Admin.Manager.Tools.Save', 'Save changes')}</span></button>
    </div>
  </header>

  <ToolEditorTabs {activeTab} errorCount={editorErrorCount} onChange={onTabChange} />

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
        <ToolOverviewTab {tool} {worldItems} {managedItems} {onPatch} {onStageSource} {onSourceDrop} {onUnlinkSource} />
      {:else if activeTab === 'breakage'}
        <ToolBreakageTab
          {tool}
          {authority}
          componentOptions={managedItems}
          {worldItems}
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
