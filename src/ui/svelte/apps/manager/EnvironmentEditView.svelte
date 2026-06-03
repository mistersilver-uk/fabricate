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
  import { localize } from '../../util/foundryBridge.js';

  const INCLUDED_COMPOSITION_STATES = new Set([
    'includedByMatch',
    'explicitlyIncluded',
    'forceIncluded',
    'includedButUnavailable'
  ]);

  let {
    environmentDraft = null,
    composition = { compositionMode: 'automatic', conditions: {}, tasks: [], hazards: [], counts: {} },
    hazardSelectionMode = 'allDrops',
    regionOptions = [],
    biomeOptions = [],
    dangerOptions = [],
    linkedSceneImage = '',
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

  function selectValidationRecord(kind, id) {
    selectRecord(kind, id);
    activeTab = kind === 'hazard' ? 'hazards' : 'tasks';
  }

  function text(key, fallback) {
    const translated = localize(key);
    return translated && translated !== key ? translated : fallback;
  }

  function countComposedRecords(records = []) {
    return Array.isArray(records)
      ? records.filter(entry => INCLUDED_COMPOSITION_STATES.has(entry?.compositionState)).length
      : 0;
  }

  function validationCountLabel(kind, count) {
    if (kind === 'warning') {
      return count === 1
        ? text('FABRICATE.Admin.Manager.EnvironmentEditor.Validation.BadgeWarningOne', '1 warning')
        : text('FABRICATE.Admin.Manager.EnvironmentEditor.Validation.BadgeWarningMany', '{count} warnings').replace('{count}', count);
    }
    return count === 1
      ? text('FABRICATE.Admin.Manager.EnvironmentEditor.Validation.BadgeErrorOne', '1 error')
      : text('FABRICATE.Admin.Manager.EnvironmentEditor.Validation.BadgeErrorMany', '{count} errors').replace('{count}', count);
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

  const readiness = $derived(evaluateEnvironmentReadiness(environmentDraft || {}, composition || {}));
  const taskCompositionCount = $derived(countComposedRecords(composition?.tasks));
  const hazardCompositionCount = $derived(countComposedRecords(composition?.hazards));
  const errorCount = $derived(readiness.issues.filter(issue => issue.severity === 'critical').length);
  const warningCount = $derived(readiness.issues.filter(issue => issue.severity === 'warning').length);
  const validationBadges = $derived([
    ...(errorCount > 0 ? [{ label: validationCountLabel('error', errorCount), tone: 'danger' }] : []),
    ...(warningCount > 0 ? [{ label: validationCountLabel('warning', warningCount), tone: 'warning' }] : [])
  ]);
  const badges = $derived({
    tasks: taskCompositionCount || 0,
    hazards: hazardCompositionCount || 0,
    validation: validationBadges
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
          {linkedSceneImage}
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
          onSelectRecord={selectValidationRecord}
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
