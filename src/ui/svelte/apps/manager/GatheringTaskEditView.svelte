<!-- Svelte 5 runes mode -->
<!--
  The gathering task editor (issue 1522): a fixed tab strip over one scrolling tab panel — Overview,
  Requirements and Results, each in `gathering-task/`. The tab is the caller's (`activeTab`,
  `onTabChange`). The lists' searches, pages and tag picks live here, so they survive a tab switch;
  the Results tab's blocking errors and warnings mark its tab, so they show from every tab.
-->
<script>
  import EmptyState from '../../components/EmptyState.svelte';
  import Notice from '../../components/Notice.svelte';
  import { localize } from '../../util/foundryBridge.js';
  import GatheringTaskEditorTabs from './gathering-task/GatheringTaskEditorTabs.svelte';
  import GatheringTaskOverviewTab from './gathering-task/GatheringTaskOverviewTab.svelte';
  import GatheringTaskRequirementsTab from './gathering-task/GatheringTaskRequirementsTab.svelte';
  import GatheringTaskResultsTab from './gathering-task/GatheringTaskResultsTab.svelte';
  import { resultNoticeCopy } from './gathering-task/taskResultNoticeCopy.js';

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

  // The route change that switches the task unmounts this view, so it is these lists' reset.
  let searchTerm = $state('');
  let pageIndex = $state(0);
  let pageSize = $state(5);
  let componentSearchTerm = $state('');
  let componentTagSearchTerm = $state('');
  let selectedComponentTags = $state([]);
  let componentPageIndex = $state(0);
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

  const copy = resultNoticeCopy(text);
  const resultErrors = $derived(
    taskResolutionMode === 'straight' || taskResolutionMode === 'routed'
      ? (Array.isArray(resultValidationErrors) ? resultValidationErrors : [])
          .map((error) => String(error || '').trim())
          .filter(Boolean)
      : []
  );
  const noRoutedTiers = $derived(
    taskResolutionMode === 'routed' &&
      (Array.isArray(routedOutcomeTiers) ? routedOutcomeTiers : []).length === 0
  );
  const rewardRuleWarning = $derived(
    taskResolutionMode === 'd100' && Boolean(showRewardRuleNotice)
  );
  const resultMarks = $derived(
    [
      resultErrors.length > 0 && {
        vehicle: 'issue',
        tone: 'danger',
        label: resultErrors.length,
        name: copy.validation(resultErrors.length),
      },
      noRoutedTiers && { vehicle: 'issue', tone: 'warning', label: 1, name: copy.noRoutedTiers() },
      rewardRuleWarning && {
        vehicle: 'issue',
        tone: 'warning',
        label: 1,
        name: copy.rewardRule(),
      },
    ].filter(Boolean)
  );

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
    <GatheringTaskEditorTabs {activeTab} badges={{ results: resultMarks }} onSelect={onTabChange} />
    <!-- The blocking notice's page position, outside the scroller so it stays in view. -->
    {#if activeTab === 'results' && resultErrors.length > 0}
      <div class="manager-editor-notice-position" data-notice-position="page">
        <Notice
          blocking
          tone="danger"
          title={copy.validation(resultErrors.length)}
          detail={resultErrors.join('; ')}
          data-gathering-task-results-validation
        />
      </div>
    {/if}
    <div
      class="manager-editor-tab-panel manager-gathering-task-panel"
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
          {noRoutedTiers}
          {rewardRuleWarning}
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
  /* The panel scrolls the card stack the view's own grid used to: rows sized to each card. */
  .manager-gathering-task-panel {
    display: grid;
    grid-auto-rows: auto;
    gap: var(--fab-space-3);
  }
</style>
