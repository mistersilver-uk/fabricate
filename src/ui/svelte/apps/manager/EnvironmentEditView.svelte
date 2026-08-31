<!-- Svelte 5 runes mode -->
<!--
  Gathering environment composition editor shell.

  Keeps the `manager-environment-edit-view` root so the `environment-edit` route
  and parent layout stay intact. The header (title, status pills, Back/Delete/Save)
  lives in the shared manager chrome; this body renders the tab bar, the active
  tab, and the editor-owned right inspector (the manager root skips the shared
  inspector for this view). The editor composes reusable library tasks/events
  into a single environment via include / exclude / ordering and a shared
  automatic|manual composition mode; it never edits the reusable source records
  (those live in the standalone gathering-task-edit / gathering-event-edit routes).
-->
<script>
  import EnvironmentEditorTabs from './environment/EnvironmentEditorTabs.svelte';
  import EnvironmentOverviewTab from './environment/EnvironmentOverviewTab.svelte';
  import EnvironmentTasksTab from './environment/EnvironmentTasksTab.svelte';
  import EnvironmentEventsTab from './environment/EnvironmentEventsTab.svelte';
  import EnvironmentValidationTab from './environment/EnvironmentValidationTab.svelte';
  import EnvironmentRightInspector from './environment/EnvironmentRightInspector.svelte';
  import { evaluateEnvironmentReadiness } from './environment/environmentReadiness.js';
  import { ENVIRONMENT_INCLUDED_COMPOSITION_STATES } from '../../../../systems/gatheringComposition.js';

  let {
    environmentDraft = null,
    composition = {
      compositionMode: 'automatic',
      conditions: {},
      tasks: [],
      events: [],
      counts: {},
    },
    eventSelectionMode = 'allDrops',
    realmRecords = [],
    realmsEnabled = false,
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
    onOpenSourceEvent = () => {},
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
    activeTab = kind === 'event' ? 'events' : 'tasks';
  }

  // INCLUDED, not COMPOSED — the tab badges count what the Included list SHOWS. The two
  // sets hold the same four members today (issue 1315 made `includedNotMatching` compose),
  // but they answer different questions — "shown in the Included list" versus "composes at
  // runtime" — and the next change to the vocabulary can part them again. This was named
  // `countComposedRecords` while filtering the included set, and now that
  // `src/systems/gatheringComposition.js` exports both sets one line apart, that name was
  // an invitation to "correct" the import to the other set and silently change every badge
  // (issue 1321).
  function countIncludedRecords(records = []) {
    return Array.isArray(records)
      ? records.filter((entry) =>
          ENVIRONMENT_INCLUDED_COMPOSITION_STATES.has(entry?.compositionState)
        ).length
      : 0;
  }

  // On the Tasks/Events tabs, auto-select the first active (available) record of
  // that kind so the inspector is populated. A valid manual selection of the same
  // kind is never overridden; a stale cross-tab selection is replaced. When no
  // record is available, selection is left so the inspector shows its empty state.
  $effect(() => {
    if (activeTab !== 'tasks' && activeTab !== 'events') return;
    const kind = activeTab === 'events' ? 'event' : 'task';
    const records = Array.isArray(activeTab === 'events' ? composition?.events : composition?.tasks)
      ? activeTab === 'events'
        ? composition.events
        : composition.tasks
      : [];
    const hasValidSelection =
      selectedKind === kind && records.some((entry) => entry.id === selectedId);
    if (hasValidSelection) return;
    const firstActive = records.find((entry) => entry.runtimeState === 'available');
    if (firstActive) selectRecord(kind, firstActive.id);
  });

  const readiness = $derived(
    evaluateEnvironmentReadiness(environmentDraft || {}, composition || {})
  );
  const taskCompositionCount = $derived(countIncludedRecords(composition?.tasks));
  const eventCompositionCount = $derived(countIncludedRecords(composition?.events));
  const errorCount = $derived(
    readiness.issues.filter((issue) => issue.severity === 'critical').length
  );
  const warningCount = $derived(
    readiness.issues.filter((issue) => issue.severity === 'warning').length
  );
  const validationBadges = $derived([
    ...(errorCount > 0 ? [{ label: String(errorCount), tone: 'danger' }] : []),
    ...(warningCount > 0 ? [{ label: String(warningCount), tone: 'warning' }] : []),
  ]);
  const badges = $derived({
    tasks: taskCompositionCount || 0,
    events: eventCompositionCount || 0,
    validation: validationBadges,
  });
</script>

<div class="manager-environment-edit-view" data-environment-editor>
  <EnvironmentEditorTabs
    {activeTab}
    {badges}
    onSelect={(tab) => {
      activeTab = tab;
    }}
  />

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
          {realmRecords}
          {realmsEnabled}
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
      {:else if activeTab === 'events'}
        <EnvironmentEventsTab
          {composition}
          {eventSelectionMode}
          {selectedKind}
          {selectedId}
          onSelectRecord={selectRecord}
          {onIncludeRecord}
          {onForceIncludeRecord}
          {onExcludeRecord}
          {onRestoreRecord}
          {onReorderRecord}
          {onOpenSourceEvent}
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
