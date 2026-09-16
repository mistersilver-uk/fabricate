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

  // The destination TAB PANEL, and it is where a validation row's action lands (issue 1517).
  // Every row on that tab addresses a RECORD rather than a control, so there is never a control
  // to focus and the panel is the only destination there is. It is bound OUTSIDE the route
  // branch, so the reference survives the route change the action just made.
  let tabPanel = $state(null);

  // WHAT THE LIVE REGION SAYS: the ACTION'S OUTCOME, not a count. Activating a row action
  // changes no tally, so a count-subjected region would recite an unchanged number at the moment
  // a GM most needs to know where they landed.
  let issueAnnouncement = $state('');

  function text(key, fallback) {
    const translated = localize(key);
    return translated && translated !== key ? translated : fallback;
  }

  // The two routes a validation row may address, and the two composition lists behind them.
  // Written once so the route write, the sentence's route word and the record lookup cannot
  // disagree about which tab a kind opens.
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

  /**
   * The name of the record a validation row routed to, read off the composition list the route
   * shows. It is the row's own subject rather than anything on the destination, and that is what
   * makes it the right thing to say: this action SELECTS that record, so it is where the GM now
   * is.
   *
   * @param {string} kind `task` or `event`.
   * @param {string} id the record id the row carried.
   * @returns {string} the record's name, or `''` when the list no longer holds it.
   */
  function recordName(kind, id) {
    const records = kind === 'event' ? composition?.events : composition?.tasks;
    const entry = Array.isArray(records) ? records.find((record) => record?.id === id) : null;
    return String(entry?.record?.name || '').trim();
  }

  /**
   * Deep-link from a validation issue: select the record the issue is about, switch to the tab
   * that lists it, THEN re-home the keyboard and say where it went.
   *
   * THE ORDER IS THE MECHANISM, not a preference. The selection and the route are written
   * synchronously and FIRST, so Svelte has flushed both and the destination panel exists by the
   * time the focus helper's `queueMicrotask` runs. Everything after that — the panel fallback,
   * the sentence and the delay that queues it behind the focus utterance — belongs to
   * `validationAnnouncement.js`, which owns it for all six hosts.
   *
   * THIS HOST'S ROWS ADDRESS A RECORD, NOT A CONTROL, so the resolver is asked with no address
   * and answers `null`, which is the panel fallback's entry condition. It is ASKED rather than
   * skipped: one module decides what "no control was reached" means, and a host deciding that
   * for itself would be a sixth answer to a question the other five already share.
   *
   * @param {string} kind `task` or `event`, the row's own route.
   * @param {string} id the record id the row carried.
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
  // THE BADGE IS THE VALIDATION TAB'S OWN COUNTS, READ THROUGH THE SHARED ACCESSOR (issue 1517).
  // It used to count `critical` and `warning` severities here, while the tab counted
  // `!== 'critical'` inside — so an `info`-only environment showed NO badge over a rail reading
  // "Warnings: 2", and an unsatisfied readiness check with no issue behind it was badged by
  // nothing at all. Two numbers describing one screen have to be one number.
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
    THE ROW ACTION'S LIVE REGION, and it is HOSTED HERE rather than in the validation tab for a
    reason that is not stylistic (issue 1517). Activating a row action sets `activeTab` to
    another value, which unmounts the whole validation panel — live region included — in the
    same update that was supposed to announce. So the element carrying `aria-live` is ALWAYS in
    the DOM, outside the `{#if activeTab}` chain below, with its own `{#if}` INSIDE it.

    A THIRD CHILD DOES NOT BREAK THIS VIEW'S TWO-ROW GRID (`grid-template-rows: auto minmax(0,
    1fr)`): `.visually-hidden` is `position: absolute`, so this element is out of flow and takes
    no grid track. It wears that shipped utility, rooted at the MODULE, and is addressed by a
    `data-` hook rather than a class, so it joins no pinned class family.
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
         destination (issue 1517). Every row on that tab addresses a RECORD the route selects
         rather than a control, so there is no control to land on and this panel is the landing;
         without the pair focus falls to `<body>`, where Space pauses the game, the arrows pan
         the canvas behind the window and Tab walks out of the application. The panel is BOUND
         here, outside the route branch, so the reference survives the route change. -->
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
