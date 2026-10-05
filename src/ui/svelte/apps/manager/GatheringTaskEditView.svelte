<!-- Svelte 5 runes mode -->
<!--
  The gathering task editor (issue 1522): a tab strip over one tab panel — Overview, Requirements
  and Results, each in `gathering-task/`. The tab is the caller's (`activeTab`, `onTabChange`). The
  lists' searches, pages and tag picks live here, so they survive a tab switch and reset together
  when the task changes.
-->
<script>
  import EmptyState from '../../components/EmptyState.svelte';
  import { localize } from '../../util/foundryBridge.js';
  import GatheringTaskEditorTabs from './gathering-task/GatheringTaskEditorTabs.svelte';
  import GatheringTaskOverviewTab from './gathering-task/GatheringTaskOverviewTab.svelte';
  import GatheringTaskRequirementsTab from './gathering-task/GatheringTaskRequirementsTab.svelte';
  import GatheringTaskResultsTab from './gathering-task/GatheringTaskResultsTab.svelte';

  let {
    task = null,
    activeTab = 'overview',
    staminaEnabled = false,
    nodesEnabled = false,
    resolutionMode = null,
    routedOutcomeTiers = [],
    // The routed gathering check, whose evaluation picks the override field, and the Preview-as
    // roster and lookup its Player sees line resolves with (issue 2005).
    checkConfig = null,
    previewActors = [],
    resolvePreviewCharacter = () => null,
    resultValidationErrors = [],
    itemCards = [],
    managedItemOptions = [],
    weatherOptions = [],
    timeOfDayOptions = [],
    biomeOptions = [],
    selectedDropId = '',
    rewardRules = null,
    characterModifierLibrary = [],
    // The SYSTEM's one CHECK-modifier catalogue and the GATHERING check's selection over it
    // (issue 1095). DELIBERATELY NOT `characterModifierLibrary` above: that is the d100
    // percentage-point library, a different concept with different arithmetic. The picker
    // renders only under `bySubject`.
    checkModifierOptions = [],
    gatheringModifierPolicy = 'addAll',
    gatheringModifierMaxPicks = null,
    // The gathering check's DEFAULT eligible set, so the picker can NAME what this task
    // inherits when it has authored no pick of its own.
    gatheringModifierDefaultIds = [],
    libraryTools = [],
    environmentOptions = [],
    onPickImagePath = null,
    onTabChange = () => {},
    onUpdateTask = () => {},
    onSelectDrop = () => {},
    onAddDrop = () => {},
    onUpdateDrop = () => {},
    onMoveDrop = () => {},
    onImportDrop = () => {},
    onAddToolReference = () => {},
    onRemoveToolReference = () => {},
  } = $props();

  const KNOWN_RESOLUTION_MODES = new Set(['straight', 'd100', 'routed', 'progressive']);
  const taskResolutionMode = $derived(
    KNOWN_RESOLUTION_MODES.has(resolutionMode)
      ? resolutionMode
      : KNOWN_RESOLUTION_MODES.has(task?.resolutionMode)
        ? task.resolutionMode
        : 'd100'
  );

  let searchTerm = $state('');
  let pageIndex = $state(0);
  let pageSize = $state(5);
  let componentSearchTerm = $state('');
  let componentTagSearchTerm = $state('');
  let selectedComponentTags = $state([]);
  let componentPageIndex = $state(0);
  let lastTaskId = $state('');
  // One open flag per availability menu (issue 1458), so the task-switch reset below can force
  // all three shut; mutual exclusion comes from `SearchablePopover`'s outside-click dismissal.
  let availabilityMenuOpen = $state({ biomes: false, timeOfDay: false, weather: false });
  let componentPageSize = $state(6);
  let toolSearchTerm = $state('');
  let toolPageIndex = $state(0);
  let toolPageSize = $state(6);

  const dropRows = $derived(Array.isArray(task?.dropRows) ? task.dropRows : []);
  const selectedDrop = $derived(
    dropRows.find((row) => row.id === selectedDropId) || dropRows[0] || null
  );
  const repeatedComponentRows = $derived(
    dropRows.filter((row) => row.componentId && row.componentId === selectedDrop?.componentId)
  );
  const showRewardRuleNotice = $derived(
    selectedDrop?.componentId &&
      repeatedComponentRows.length > 1 &&
      rewardRules?.rewardSelectionMode !== 'allDrops'
  );

  $effect(() => {
    if (task?.id === lastTaskId) return;
    searchTerm = '';
    pageIndex = 0;
    componentSearchTerm = '';
    componentTagSearchTerm = '';
    selectedComponentTags = [];
    componentPageIndex = 0;
    availabilityMenuOpen = { biomes: false, timeOfDay: false, weather: false };
    toolSearchTerm = '';
    toolPageIndex = 0;
    lastTaskId = task?.id || '';
  });

  function text(key, fallback) {
    const translated = localize(key);
    return translated && translated !== key ? translated : fallback;
  }
</script>

<main
  class="manager-main manager-gathering-task-edit-view"
  class:has-reward-rule-notice={showRewardRuleNotice}
  aria-label={text('FABRICATE.Admin.Manager.Environment.Tasks.EditTitle', 'Edit gathering task')}
  data-gathering-task-editor
>
  {#if task}
    <GatheringTaskEditorTabs {activeTab} onSelect={onTabChange} />
    <div
      class="manager-gathering-task-panel"
      role="tabpanel"
      id={`gathering-task-panel-${activeTab}`}
      aria-labelledby={`gathering-task-tab-${activeTab}`}
      tabindex="-1"
      data-keyboard-focus="true"
      data-gathering-task-panel={activeTab}
    >
      {#if activeTab === 'requirements'}
        <GatheringTaskRequirementsTab
          {text}
          {task}
          {taskResolutionMode}
          {staminaEnabled}
          {checkConfig}
          {previewActors}
          {resolvePreviewCharacter}
          {weatherOptions}
          {timeOfDayOptions}
          {biomeOptions}
          {characterModifierLibrary}
          {checkModifierOptions}
          {gatheringModifierPolicy}
          {gatheringModifierMaxPicks}
          {gatheringModifierDefaultIds}
          {libraryTools}
          {managedItemOptions}
          bind:availabilityMenuOpen
          bind:toolSearchTerm
          bind:toolPageIndex
          bind:toolPageSize
          {onUpdateTask}
          {onAddToolReference}
          {onRemoveToolReference}
        />
      {:else if activeTab === 'results'}
        <GatheringTaskResultsTab
          {text}
          {task}
          {taskResolutionMode}
          {routedOutcomeTiers}
          {resultValidationErrors}
          {showRewardRuleNotice}
          selectedRowId={selectedDrop?.id || ''}
          {rewardRules}
          {itemCards}
          {managedItemOptions}
          {weatherOptions}
          {timeOfDayOptions}
          {biomeOptions}
          {characterModifierLibrary}
          bind:searchTerm
          bind:pageIndex
          bind:pageSize
          bind:componentSearchTerm
          bind:componentTagSearchTerm
          bind:selectedComponentTags
          bind:componentPageIndex
          bind:componentPageSize
          {onUpdateTask}
          {onAddDrop}
          {onSelectDrop}
          {onUpdateDrop}
          {onMoveDrop}
          {onImportDrop}
        />
      {:else}
        <GatheringTaskOverviewTab
          {text}
          {task}
          {taskResolutionMode}
          {nodesEnabled}
          {environmentOptions}
          {onPickImagePath}
          {onUpdateTask}
        />
      {/if}
    </div>
  {:else}
    <EmptyState
      icon="fas fa-list-check"
      title={text(
        'FABRICATE.Admin.Manager.Environment.Tasks.SelectTask',
        'Select a gathering task'
      )}
    />
  {/if}
</main>

<style>
  /* The panel carries the card stack the view's own grid used to: rows sized to each card. */
  .manager-gathering-task-panel {
    display: grid;
    grid-auto-rows: auto;
    gap: var(--fab-space-3);
    min-width: 0;
  }
</style>
