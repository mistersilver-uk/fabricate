<!--
  Gathering environment composition editor shell. It keeps the `manager-environment-edit-view` root
  so the `environment-edit` route and parent layout stay intact; the header lives in the shared
  manager chrome, and this body renders the tab bar, the active tab and the editor-owned right
  inspector (the manager root skips the shared one for this view). It composes reusable library
  tasks and events into one environment and never edits the reusable source records.
-->
<script>
  import EnvironmentEditorTabs from './environment/EnvironmentEditorTabs.svelte';
  import EnvironmentOverviewTab from './environment/EnvironmentOverviewTab.svelte';
  import EnvironmentTasksTab from './environment/EnvironmentTasksTab.svelte';
  import EnvironmentEventsTab from './environment/EnvironmentEventsTab.svelte';
  import EnvironmentValidationTab from './environment/EnvironmentValidationTab.svelte';
  import EnvironmentRightInspector from './environment/EnvironmentRightInspector.svelte';
  import {
    countReadiness,
    evaluateEnvironmentReadiness,
  } from './environment/environmentReadiness.js';
  import { ENVIRONMENT_INCLUDED_COMPOSITION_STATES } from '../../../../systems/gatheringComposition.js';
  import { localize } from '../../util/foundryBridge.js';
  import { focusValidationTarget } from './validationFocus.js';
  import { announceValidationOutcome } from './validationAnnouncement.js';

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

  // This editor's own root, so the shared row action resolves and names things inside THIS
  // editor rather than anywhere else in the manager window.
  let editorRoot = $state(null);

  // The destination TAB PANEL, where a validation row's action lands (issue 1517): every row there
  // addresses a RECORD rather than a control. Bound OUTSIDE the route branch, so the reference
  // survives the route change the action just made.
  let tabPanel = $state(null);

  // WHAT THE LIVE REGION SAYS: the ACTION'S OUTCOME, not a count — a row action changes no tally.
  let issueAnnouncement = $state('');

  function text(key, fallback) {
    const translated = localize(key);
    return translated && translated !== key ? translated : fallback;
  }

  // The two routes a validation row may address, written once so the route write, the sentence's
  // route word and the record lookup cannot disagree about which tab a kind opens.
  const ISSUE_ROUTES = {
    task: {
      tab: 'tasks',
      key: 'FABRICATE.Admin.Manager.EnvironmentEditor.Tabs.Tasks',
      fallback: 'Tasks',
    },
    event: {
      tab: 'events',
      key: 'FABRICATE.Admin.Manager.EnvironmentEditor.Tabs.Events',
      fallback: 'Events',
    },
  };

  function selectRecord(kind, id) {
    selectedKind = kind;
    selectedId = id;
  }

  /** The name of the record a validation row routed to, read off the composition list the route
      shows; the action SELECTS that record, so it is where the GM now is. `''` when the list no
      longer holds it. */
  function recordName(kind, id) {
    const records = kind === 'event' ? composition?.events : composition?.tasks;
    const entry = Array.isArray(records) ? records.find((record) => record?.id === id) : null;
    return String(entry?.record?.name || '').trim();
  }

  /**
   * Deep-link from a validation issue: select the record, switch tab, THEN re-home the keyboard.
   * THE ORDER IS THE MECHANISM — selection and route are written synchronously and FIRST, so the
   * destination panel exists by the time the focus helper's `queueMicrotask` runs, and everything
   * after that is `validationAnnouncement.js`'s. THIS HOST'S ROWS ADDRESS A RECORD, so the resolver
   * is ASKED with no address and answers `null`, the panel fallback's entry condition; asked rather
   * than skipped, so one module decides what "no control was reached" means.
   */
  function selectValidationRecord(kind, id) {
    const route = ISSUE_ROUTES[kind] ?? ISSUE_ROUTES.task;
    selectRecord(kind, id);
    activeTab = route.tab;
    announceValidationOutcome({
      root: editorRoot,
      routeLabel: text(route.key, route.fallback),
      destinationName: recordName(kind, id),
      focus: () => focusValidationTarget(editorRoot, null),
      fallbackPanel: tabPanel,
      announce: (sentence) => {
        issueAnnouncement = sentence;
      },
    });
  }

  // INCLUDED, not COMPOSED — the tab badges count what the Included list SHOWS. The two sets hold
  // the same members today but answer different questions, and `gatheringComposition.js` exports
  // both one line apart, so the name matters (issue 1321).
  function countIncludedRecords(records = []) {
    return Array.isArray(records)
      ? records.filter((entry) =>
          ENVIRONMENT_INCLUDED_COMPOSITION_STATES.has(entry?.compositionState)
        ).length
      : 0;
  }

  // Auto-select the first available record of the tab's kind so the inspector is populated. A
  // valid manual selection of the same kind is never overridden; a stale cross-tab one is.
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
  // THE BADGE IS THE VALIDATION TAB'S OWN COUNTS, READ THROUGH THE SHARED ACCESSOR (issue 1517):
  // two numbers describing one screen have to be one number.
  const validationCounts = $derived(countReadiness(readiness));
  const validationBadges = $derived([
    ...(validationCounts.blocking > 0
      ? [{ label: String(validationCounts.blocking), tone: 'danger' }]
      : []),
    ...(validationCounts.warnings > 0
      ? [{ label: String(validationCounts.warnings), tone: 'warning' }]
      : []),
  ]);
  const badges = $derived({
    tasks: taskCompositionCount || 0,
    events: eventCompositionCount || 0,
    validation: validationBadges,
  });
</script>

<div class="manager-environment-edit-view" data-environment-editor bind:this={editorRoot}>
  <!--
    THE ROW ACTION'S LIVE REGION IS HOSTED HERE, not in the validation tab (issue 1517): activating
    a row action unmounts that whole panel in the same update that was supposed to announce, so the
    element carrying `aria-live` is ALWAYS in the DOM, outside the `{#if activeTab}` chain, with its
    own `{#if}` inside it. A THIRD CHILD DOES NOT BREAK THIS VIEW'S TWO-ROW GRID, because
    `.visually-hidden` is `position: absolute` and takes no track.
  -->
  <div class="visually-hidden" role="status" aria-live="polite" data-environment-issue-announcement>
    {#if issueAnnouncement}{issueAnnouncement}{/if}
  </div>
  <EnvironmentEditorTabs
    {activeTab}
    {badges}
    onSelect={(tab) => {
      activeTab = tab;
    }}
  />

  <div class="manager-environment-workspace" class:is-inspector-hidden={activeTab === 'validation'}>
    <!-- `tabindex="-1"` and `data-keyboard-focus="true"` are the validation row action's focus
         destination (issue 1517); without the pair focus falls to `<body>`, where Space pauses the
         game and the arrows pan the canvas behind the window. -->
    <div
      class="manager-environment-tab-panel"
      role="tabpanel"
      id={`environment-panel-${activeTab}`}
      aria-labelledby={`environment-tab-${activeTab}`}
      tabindex="-1"
      data-keyboard-focus="true"
      bind:this={tabPanel}
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
