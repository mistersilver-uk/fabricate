<!-- Svelte 5 runes mode -->
<!--
  Gathering environment composition editor shell.

  Keeps the `manager-environment-edit-view` root so the `environment-edit` route
  and parent layout stay intact. The header (title, status pills, Back/Delete/Save)
  lives in the shared manager chrome; this body renders the tab bar, the active
  tab, and the editor-owned right inspector (the manager root skips the shared
  inspector for this view). The editor composes reusable library tasks/hazards
  into a single environment via include / exclude / ordering and a shared
  automatic|manual composition mode; it never edits the reusable source records
  (those live in the standalone gathering-task-edit / gathering-hazard-edit routes).
-->
<script>
  import EnvironmentEditorTabs from './environment/EnvironmentEditorTabs.svelte';
  import EnvironmentOverviewTab from './environment/EnvironmentOverviewTab.svelte';
  import EnvironmentTasksTab from './environment/EnvironmentTasksTab.svelte';
  import EnvironmentHazardsTab from './environment/EnvironmentHazardsTab.svelte';
  import EnvironmentValidationTab from './environment/EnvironmentValidationTab.svelte';
  import EnvironmentRightInspector from './environment/EnvironmentRightInspector.svelte';
  import { evaluateEnvironmentReadiness } from './environment/environmentReadiness.js';

  let {
    environmentDraft = null,
    composition = { compositionMode: 'automatic', conditions: {}, tasks: [], hazards: [], counts: {} },
    hazardSelectionMode = 'allDrops',
    regionOptions = [],
    biomeOptions = [],
    dangerOptions = [],
    onPickImagePath = null,
    onUpdateEnvironment = () => {},
    onSetCompositionMode = () => {},
    onIncludeRecord = () => {},
    onForceIncludeRecord = () => {},
    onExcludeRecord = () => {},
    onRestoreRecord = () => {},
    onReorderRecord = () => {},
    onOpenSourceTask = () => {},
    onOpenSourceHazard = () => {}
  } = $props();

  let activeTab = $state('overview');
  let selectedKind = $state('');
  let selectedId = $state('');

  function selectRecord(kind, id) {
    selectedKind = kind;
    selectedId = id;
  }

  // On the Tasks/Hazards tabs, auto-select the first active (available) record of
  // that kind so the inspector is populated. A valid manual selection of the same
  // kind is never overridden; a stale cross-tab selection is replaced. When no
  // record is available, selection is left so the inspector shows its empty state.
  $effect(() => {
    if (activeTab !== 'tasks' && activeTab !== 'hazards') return;
    const kind = activeTab === 'hazards' ? 'hazard' : 'task';
    const records = Array.isArray(activeTab === 'hazards' ? composition?.hazards : composition?.tasks)
      ? (activeTab === 'hazards' ? composition.hazards : composition.tasks)
      : [];
    const hasValidSelection = selectedKind === kind && records.some(entry => entry.id === selectedId);
    if (hasValidSelection) return;
    const firstActive = records.find(entry => entry.runtimeState === 'available');
    if (firstActive) selectRecord(kind, firstActive.id);
  });

  const counts = $derived(composition?.counts || {});
  const readiness = $derived(evaluateEnvironmentReadiness(environmentDraft || {}, composition || {}));
  const criticalCount = $derived(readiness.issues.filter(issue => issue.severity === 'critical').length);
  const badges = $derived({
    tasks: counts.availableTasks || 0,
    hazards: counts.availableHazards || 0,
    validation: criticalCount || 0
  });
</script>

<div class="manager-environment-edit-view" data-environment-editor>
  <EnvironmentEditorTabs {activeTab} {badges} onSelect={(tab) => { activeTab = tab; }} />

  <div class="manager-environment-workspace" class:is-inspector-hidden={activeTab === 'validation'}>
    <div
      class="manager-environment-tab-panel"
      role="tabpanel"
      id={`environment-panel-${activeTab}`}
      aria-labelledby={`environment-tab-${activeTab}`}
    >
      {#if activeTab === 'overview'}
        <EnvironmentOverviewTab
          environment={environmentDraft}
          {composition}
          {regionOptions}
          {biomeOptions}
          {dangerOptions}
          {onPickImagePath}
          onUpdate={onUpdateEnvironment}
          {onSetCompositionMode}
        />
      {:else if activeTab === 'tasks'}
        <EnvironmentTasksTab
          environment={environmentDraft}
          {composition}
          {selectedKind}
          {selectedId}
          onSelectRecord={selectRecord}
          onUpdate={onUpdateEnvironment}
          {onIncludeRecord}
          {onForceIncludeRecord}
          {onExcludeRecord}
          {onRestoreRecord}
          {onReorderRecord}
          {onOpenSourceTask}
        />
      {:else if activeTab === 'hazards'}
        <EnvironmentHazardsTab
          {composition}
          {hazardSelectionMode}
          {selectedKind}
          {selectedId}
          onSelectRecord={selectRecord}
          {onIncludeRecord}
          {onForceIncludeRecord}
          {onExcludeRecord}
          {onRestoreRecord}
          {onReorderRecord}
          {onOpenSourceHazard}
        />
      {:else if activeTab === 'validation'}
        <EnvironmentValidationTab
          environment={environmentDraft}
          {composition}
          onSelectRecord={selectRecord}
        />
      {/if}
    </div>

    {#if activeTab !== 'validation'}
      <EnvironmentRightInspector
        {activeTab}
        environment={environmentDraft}
        {composition}
        {selectedKind}
        {selectedId}
        {onUpdateEnvironment}
      />
    {/if}
  </div>
</div>
