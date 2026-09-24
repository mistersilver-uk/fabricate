/**
 * The gathering workspace's read side: its tab, its task, event and drop selections and drafts,
 * the selected system's gathering library, and the presenters bound to that system. Every input
 * is a thunk read at call time. The model owns no effect: the root runs each reconciler
 * (`normalizeTab`, `resetTabOffRoute`, `reselectTask`, `reselectEvent`, `reselectDrop` and
 * `resetOnSystemSwitch`) from its own `$effect`.
 */
import { routedTierOptionsForPolicy } from '../../../../utils/routedOutcomeKeywords.js';

import {
  activeEnvironmentCount,
  environmentDirtyFor,
  environmentFacts,
  environmentImage,
  environmentInvalidFor,
  environmentName,
  environmentSceneImage,
  environmentSceneState,
  environmentSelectionModeLabel,
  environmentStatusLabel,
  gatheringConditionLabel,
  gatheringDropImage,
  gatheringDropName,
  gatheringEventReferencingEnvironments,
  gatheringModifierCardHint,
  gatheringModifierCardTitle,
  gatheringModifierKindIcon,
  gatheringTaskAvailability,
  gatheringTaskDropRows,
  gatheringTaskName,
  gatheringTaskReferencingEnvironments,
  hasEnvironmentImage,
} from './gatheringDisplay.js';

const gatheringNavItems = [
  {
    id: 'environments',
    icon: 'fas fa-seedling',
    labelKey: 'FABRICATE.Admin.Manager.Environment.GatheringTabs.Environments',
    labelFallback: 'Environments',
  },
  {
    id: 'tasks',
    icon: 'fas fa-list-check',
    labelKey: 'FABRICATE.Admin.Manager.Environment.GatheringTabs.Tasks',
    labelFallback: 'Tasks',
    titleKey: 'FABRICATE.Admin.Manager.Environment.GatheringTabs.TasksTitle',
    titleFallback: 'Gathering Tasks',
    hintKey: 'FABRICATE.Admin.Manager.Environment.GatheringTabs.TasksHint',
    hintFallback: 'Browse gathering tasks before attaching them to environments.',
  },
  {
    id: 'encounters',
    icon: 'fas fa-masks-theater',
    labelKey: 'FABRICATE.Admin.Manager.Environment.GatheringTabs.Encounters',
    labelFallback: 'Events',
    titleKey: 'FABRICATE.Admin.Manager.Environment.GatheringTabs.EncountersTitle',
    titleFallback: 'Gathering events',
    hintKey: 'FABRICATE.Admin.Manager.Environment.GatheringTabs.EncountersHint',
    hintFallback: 'Browse reusable events before attaching them to environments.',
  },
  {
    id: 'settings',
    icon: 'fas fa-sliders',
    labelKey: 'FABRICATE.Admin.Manager.Environment.GatheringTabs.Settings',
    labelFallback: 'Settings',
    titleKey: 'FABRICATE.Admin.Manager.Environment.GatheringTabs.SettingsPlaceholderTitle',
    titleFallback: 'Gathering settings',
    hintKey: 'FABRICATE.Admin.Manager.Environment.GatheringTabs.SettingsPlaceholderHint',
    hintFallback: 'Set system-level rules for gathering.',
  },
];

/** The shell's names for one library record's selection, draft and editor state. */
export const TASK_FIELDS = Object.freeze({
  selectedId: 'selectedGatheringTaskId',
  draft: 'gatheringTaskDraft',
  baseline: 'gatheringTaskDraftBaseline',
  saving: 'gatheringTaskSaving',
  saveError: 'gatheringTaskSaveError',
  selected: 'selectedGatheringTask',
  editing: 'editingGatheringTask',
  dirty: 'gatheringTaskDraftDirty',
  validation: 'gatheringTaskValidation',
});

export const EVENT_FIELDS = Object.freeze({
  selectedId: 'selectedGatheringEventId',
  draft: 'gatheringEventDraft',
  baseline: 'gatheringEventDraftBaseline',
  saving: 'gatheringEventSaving',
  saveError: 'gatheringEventSaveError',
  selected: 'selectedGatheringEvent',
  editing: 'editingGatheringEvent',
  dirty: 'gatheringEventDraftDirty',
  validation: 'gatheringEventValidation',
});

function validateGatheringEventDraft(draft, text) {
  if (!draft) return { valid: true, errors: [] };
  const errors = [];
  if (!String(draft?.name || '').trim()) {
    errors.push(
      text('FABRICATE.Admin.Manager.Environment.Events.NameRequired', 'Name is required.')
    );
  }
  const rate = Number(draft?.dropRate);
  if (!Number.isFinite(rate) || rate < 1 || rate > 100) {
    errors.push(
      text(
        'FABRICATE.Admin.Manager.Environment.Events.DropRateInvalid',
        'Drop rate must be between 1 and 100.'
      )
    );
  }
  return { valid: errors.length === 0, errors };
}

/** Copy each part's accessors onto one object; a spread would read every getter once instead. */
export function mergeAccessors(...parts) {
  const model = {};
  for (const part of parts) {
    Object.defineProperties(model, Object.getOwnPropertyDescriptors(part));
  }
  return model;
}

/** Re-expose one record's accessors under the shell's names for them. */
function exposeFields(record, fields) {
  const exposed = {};
  for (const [field, name] of Object.entries(fields)) {
    const { get, set } = Object.getOwnPropertyDescriptor(record, field);
    Object.defineProperty(exposed, name, { get, set, enumerable: true });
  }
  return exposed;
}

/** An economy limitation's own `enabled` flag, or else the legacy single mode naming it. */
function economyLimitEnabled(economy, limit) {
  const block = economy[limit];
  return block != null && Object.prototype.hasOwnProperty.call(block, 'enabled')
    ? block.enabled === true
    : economy.mode === limit;
}

/** The selected system's gathering config, and the library and counts read off it. */
function createLibrary({ viewState, selectedSystemId }) {
  const environmentList = $derived(viewState().environments || []);
  const selectedGatheringRules = $derived(
    viewState().gatheringConfig?.systems?.[selectedSystemId()]?.rules || {
      rewardSelectionMode: 'highestRankedDrop',
      rewardLimit: 1,
      eventSelectionMode: 'allDrops',
      eventLimit: 1,
      eventPolicy: 'successWithEvent',
      toolBreakagePolicy: 'failureOnBreak',
      biomeModifierAggregation: 'strongestOfEach',
      eventVisibility: 'encounterChance',
    }
  );
  const selectedGatheringSystemConfig = $derived(
    viewState().gatheringConfig?.systems?.[selectedSystemId()] || {}
  );
  // Two independent limitation flags.
  const selectedGatheringEconomy = $derived(selectedGatheringSystemConfig.economy || {});
  // Selects the gathering check editor: d100 is fixed, progressive and routed are editable.
  const gatheringResolutionMode = $derived(selectedGatheringEconomy.resolutionMode || 'd100');
  const selectedGatheringTaskStaminaEnabled = $derived(
    economyLimitEnabled(selectedGatheringEconomy, 'stamina')
  );
  const selectedGatheringTaskNodesEnabled = $derived(
    economyLimitEnabled(selectedGatheringEconomy, 'nodes')
  );
  const gatheringTaskDefinitions = $derived(
    Array.isArray(selectedGatheringSystemConfig.tasks) ? selectedGatheringSystemConfig.tasks : []
  );
  const gatheringEventDefinitions = $derived(
    Array.isArray(selectedGatheringSystemConfig.events) ? selectedGatheringSystemConfig.events : []
  );
  // The task editor's default-environment options: the selected system's environments.
  const selectedSystemEnvironmentOptions = $derived(
    environmentList
      .filter(
        (environment) =>
          String(environment?.craftingSystemId || '') === String(selectedSystemId() || '')
      )
      .map((environment) => ({
        id: String(environment.id),
        name: String(environment.name || environment.id),
      }))
  );
  const gatheringNavCounts = $derived({
    environments: environmentList.length,
    tasks: gatheringTaskDefinitions.length,
    encounters: gatheringEventDefinitions.length,
    total:
      environmentList.length + gatheringTaskDefinitions.length + gatheringEventDefinitions.length,
  });

  return {
    get environmentList() {
      return environmentList;
    },
    get selectedGatheringRules() {
      return selectedGatheringRules;
    },
    get selectedGatheringSystemConfig() {
      return selectedGatheringSystemConfig;
    },
    get gatheringResolutionMode() {
      return gatheringResolutionMode;
    },
    get selectedGatheringTaskStaminaEnabled() {
      return selectedGatheringTaskStaminaEnabled;
    },
    get selectedGatheringTaskNodesEnabled() {
      return selectedGatheringTaskNodesEnabled;
    },
    get gatheringTaskDefinitions() {
      return gatheringTaskDefinitions;
    },
    get gatheringEventDefinitions() {
      return gatheringEventDefinitions;
    },
    get selectedSystemEnvironmentOptions() {
      return selectedSystemEnvironmentOptions;
    },
    get gatheringNavCounts() {
      return gatheringNavCounts;
    },
  };
}

/** The rail's gathering tab, the inspector tab it opens, and the page copy it names. */
function createTabs({ view, canShowEnvironments, isGatheringRoute, text }) {
  let activeGatheringTab = $state('environments');
  const displayedGatheringTab = $derived(activeGatheringTab);
  const visibleGatheringNavItems = gatheringNavItems;
  const gatheringInspectorTabs = $derived(
    visibleGatheringNavItems.filter((tab) => tab.id !== 'environments')
  );
  const isActiveGatheringChildRoute = $derived(
    isGatheringRoute() && visibleGatheringNavItems.some((tab) => tab.id === displayedGatheringTab)
  );
  const activeGatheringInspectorTab = $derived(
    gatheringInspectorTabs.find((tab) => tab.id === displayedGatheringTab) || null
  );
  const gatheringTabLabel = $derived.by(() => {
    const item = gatheringNavItems.find((entry) => entry.id === activeGatheringTab);
    return item ? text(item.labelKey, item.labelFallback) : '';
  });
  const activeGatheringNavItem = $derived(
    gatheringNavItems.find((entry) => entry.id === displayedGatheringTab) || null
  );
  const gatheringTabPageTitle = $derived(
    activeGatheringNavItem?.titleKey
      ? text(activeGatheringNavItem.titleKey, activeGatheringNavItem.titleFallback)
      : ''
  );
  const gatheringTabPageHint = $derived(
    activeGatheringNavItem?.hintKey
      ? text(activeGatheringNavItem.hintKey, activeGatheringNavItem.hintFallback)
      : ''
  );

  return {
    get activeGatheringTab() {
      return activeGatheringTab;
    },
    set activeGatheringTab(tab) {
      activeGatheringTab = tab;
    },
    get displayedGatheringTab() {
      return displayedGatheringTab;
    },
    get visibleGatheringNavItems() {
      return visibleGatheringNavItems;
    },
    get isActiveGatheringChildRoute() {
      return isActiveGatheringChildRoute;
    },
    get activeGatheringInspectorTab() {
      return activeGatheringInspectorTab;
    },
    get gatheringTabLabel() {
      return gatheringTabLabel;
    },
    get gatheringTabPageTitle() {
      return gatheringTabPageTitle;
    },
    get gatheringTabPageHint() {
      return gatheringTabPageHint;
    },
    // A restored token can still name a section that no longer exists, including the retired
    // `travel` one, which is now the World > Travel route.
    normalizeTab() {
      if (visibleGatheringNavItems.every((tab) => tab.id !== activeGatheringTab)) {
        activeGatheringTab = 'environments';
      }
    },
    resetTabOffRoute() {
      if (activeGatheringTab === 'environments') return;
      const currentView = view();
      if (currentView === 'environments' && canShowEnvironments()) return;
      if (currentView === 'gathering-task-edit' && canShowEnvironments()) return;
      if (currentView === 'gathering-event-edit' && canShowEnvironments()) return;
      activeGatheringTab = 'environments';
    },
  };
}

/**
 * One library record kind's selection and staged draft. The selection falls back to the first
 * record, and the header toolbar renders `saveError` beside Save (issue 919).
 */
function createRecordDrafts({ definitions, validate }) {
  let selectedId = $state('');
  let draft = $state(null);
  let baseline = $state(null);
  let saving = $state(false);
  let saveError = $state('');
  const selected = $derived(
    definitions().find((entry) => entry.id === selectedId) || definitions()[0] || null
  );
  const editing = $derived(draft || selected);
  const dirty = $derived(
    !!(draft && baseline && JSON.stringify(draft) !== JSON.stringify(baseline))
  );
  const validation = $derived(validate(draft));

  return {
    get selectedId() {
      return selectedId;
    },
    set selectedId(id) {
      selectedId = id;
    },
    get draft() {
      return draft;
    },
    set draft(next) {
      draft = next;
    },
    get baseline() {
      return baseline;
    },
    set baseline(next) {
      baseline = next;
    },
    get saving() {
      return saving;
    },
    set saving(next) {
      saving = next;
    },
    get saveError() {
      return saveError;
    },
    set saveError(next) {
      saveError = next;
    },
    get selected() {
      return selected;
    },
    get editing() {
      return editing;
    },
    get dirty() {
      return dirty;
    },
    get validation() {
      return validation;
    },
    /** Keep a live selection; `false` means the workspace is hidden and the selection cleared. */
    reselect(shown) {
      if (!shown) {
        selectedId = '';
        return false;
      }
      if (selectedId && definitions().some((entry) => entry.id === selectedId)) return true;
      selectedId = definitions()[0]?.id || '';
      return true;
    },
    reset() {
      selectedId = '';
      draft = null;
      baseline = null;
      saving = false;
      saveError = '';
    },
  };
}

/** The drop row the task editor's inspector edits, falling back to the task's first row. */
function createDropSelection(editingTask) {
  let selectedGatheringDropId = $state('');
  const selectedGatheringDrop = $derived(
    gatheringTaskDropRows(editingTask()).find((row) => row.id === selectedGatheringDropId) ||
      gatheringTaskDropRows(editingTask())[0] ||
      null
  );

  return {
    get selectedGatheringDropId() {
      return selectedGatheringDropId;
    },
    set selectedGatheringDropId(id) {
      selectedGatheringDropId = id;
    },
    get selectedGatheringDrop() {
      return selectedGatheringDrop;
    },
    reselectDrop() {
      const task = editingTask();
      if (!task) {
        selectedGatheringDropId = '';
        return;
      }
      const rows = gatheringTaskDropRows(task);
      if (selectedGatheringDropId && rows.some((row) => row.id === selectedGatheringDropId)) return;
      selectedGatheringDropId = rows[0]?.id || '';
    },
  };
}

/** The environment the browser and editor show, and the party realm-override gate. */
function createEnvironments(
  { viewState, view, selectedSystem, canShowEnvironments, text },
  library
) {
  const environmentValidationCount = $derived(
    Array.isArray(viewState().environmentValidationState?.errors)
      ? viewState().environmentValidationState.errors.length
      : 0
  );
  const selectedEnvironmentId = $derived(
    viewState().selectedEnvironmentId || viewState().environmentDraft?.id || ''
  );
  const environmentDraftForDisplay = $derived(viewState().environmentDraft || null);
  const shouldUseEnvironmentDraftForDisplay = $derived.by(() => {
    const currentView = view();
    return (
      Boolean(environmentDraftForDisplay) &&
      (currentView === 'environment-edit' ||
        viewState().environmentDraftDirty === true ||
        viewState().environmentDraftIsNew === true ||
        environmentDraftForDisplay.id === selectedEnvironmentId)
    );
  });
  const selectedEnvironment = $derived(
    shouldUseEnvironmentDraftForDisplay
      ? environmentDraftForDisplay
      : library.environmentList.find((environment) => environment.id === selectedEnvironmentId) ||
          library.environmentList.find(
            (environment) => environment.id === environmentDraftForDisplay?.id
          ) ||
          library.environmentList[0] ||
          null
  );
  const selectedEnvironmentFacts = $derived(
    environmentFacts(selectedEnvironment, viewState().environmentTaskCounts, text)
  );
  const selectedEnvironmentSceneState = $derived(
    environmentSceneState(selectedEnvironment, selectedSystem()?.sceneOptions, text)
  );
  // The selected system's participation in Travel & Realms (issue 1282).
  const gatheringRealmsEnabled = $derived(viewState().gatheringRealmSettings?.enabled === true);
  // A party's current-realm override is per selected system, so that system needs both the
  // gathering feature and its Travel & Realms toggle.
  const partyRealmOverridesAvailable = $derived(
    canShowEnvironments() &&
      gatheringRealmsEnabled &&
      viewState().partyRealmOverridesAvailable === true
  );
  const partyRealmOverridesUnavailableHint = $derived.by(() => {
    if (!selectedSystem() || selectedSystem()?.features?.gathering !== true) {
      return text(
        'FABRICATE.Admin.Manager.World.PartyOverrideGatheringRequired',
        'Select a crafting system with Gathering enabled to set a current-realm override.'
      );
    }
    if (gatheringRealmsEnabled) return '';
    return text(
      'FABRICATE.Admin.Manager.World.PartyOverrideTravelRequired',
      'Enable Travel & Realms in this system\u{2019}s settings to set a current-realm override.'
    );
  });

  return {
    get environmentValidationCount() {
      return environmentValidationCount;
    },
    get selectedEnvironmentId() {
      return selectedEnvironmentId;
    },
    get environmentDraftForDisplay() {
      return environmentDraftForDisplay;
    },
    get shouldUseEnvironmentDraftForDisplay() {
      return shouldUseEnvironmentDraftForDisplay;
    },
    get selectedEnvironment() {
      return selectedEnvironment;
    },
    get selectedEnvironmentFacts() {
      return selectedEnvironmentFacts;
    },
    get selectedEnvironmentSceneState() {
      return selectedEnvironmentSceneState;
    },
    get gatheringRealmsEnabled() {
      return gatheringRealmsEnabled;
    },
    get partyRealmOverridesAvailable() {
      return partyRealmOverridesAvailable;
    },
    get partyRealmOverridesUnavailableHint() {
      return partyRealmOverridesUnavailableHint;
    },
  };
}

/** The `gatheringDisplay.js` presenters that read state, bound to the selected system. */
function createPresenters({ viewState, selectedSystem, selectedSystemId, text }, parts) {
  const { library, environments } = parts;
  const sceneOptions = () => selectedSystem()?.sceneOptions;
  const managedItemOptions = () => selectedSystem()?.managedItemOptions;
  const conditionLabel = (kind, id) =>
    gatheringConditionLabel(kind, id, library.selectedGatheringSystemConfig);
  const activeCount = (record, kind, unownedSystemId) =>
    activeEnvironmentCount(record, kind, {
      environments: library.environmentList,
      systemId: selectedSystemId(),
      unownedSystemId,
      conditionSettings: library.selectedGatheringSystemConfig.conditions,
    });

  return {
    environmentName: (environment) => environmentName(environment, text),
    environmentImage: (environment) => environmentImage(environment, sceneOptions()),
    hasEnvironmentImage: (environment) => hasEnvironmentImage(environment, sceneOptions()),
    environmentSceneImage: (environment) => environmentSceneImage(environment, sceneOptions()),
    environmentSelectionModeLabel: (environment) =>
      environmentSelectionModeLabel(environment, text),
    environmentStatusLabel: (environment) => environmentStatusLabel(environment, text),
    environmentDirtyFor: (environment) => environmentDirtyFor(environment, viewState()),
    environmentInvalidFor: (environment) =>
      environmentInvalidFor(environment, viewState(), environments.environmentValidationCount),
    gatheringTaskName: (task) => gatheringTaskName(task, text),
    gatheringDropName: (row) => gatheringDropName(row, managedItemOptions(), text),
    gatheringDropImage: (row) => gatheringDropImage(row, managedItemOptions()),
    gatheringConditionLabel: conditionLabel,
    gatheringModifierKindIcon: (kind, conditionId) =>
      gatheringModifierKindIcon(kind, conditionId, library.selectedGatheringSystemConfig),
    gatheringModifierCardTitle: (kind, scope) => gatheringModifierCardTitle(kind, scope, text),
    gatheringModifierCardHint: (kind, scope) => gatheringModifierCardHint(kind, scope, text),
    gatheringTaskAvailability: (task) => gatheringTaskAvailability(task, conditionLabel, text),
    gatheringTaskReferencingEnvironments: (task) =>
      gatheringTaskReferencingEnvironments(task, library.environmentList, selectedSystemId()),
    gatheringEventReferencingEnvironments: (event) =>
      gatheringEventReferencingEnvironments(event, library.environmentList, selectedSystemId()),
    // A task counts an environment with no system as the selected system's; an event does not.
    activeGatheringTaskEnvironmentCount: (task) => activeCount(task, 'task', selectedSystemId()),
    activeGatheringEventEnvironmentCount: (event) => activeCount(event, 'event', ''),
  };
}

export function createGatheringRouteModel(inputs = {}) {
  const { store, selectedSystem, selectedSystemId, canShowEnvironments, text } = inputs;
  const library = createLibrary(inputs);
  const tabs = createTabs(inputs);
  const tasks = createRecordDrafts({
    definitions: () => library.gatheringTaskDefinitions,
    validate: (draft) =>
      draft
        ? store().validateGatheringLibraryTask?.(draft) || { valid: true, errors: [] }
        : { valid: true, errors: [] },
  });
  const events = createRecordDrafts({
    definitions: () => library.gatheringEventDefinitions,
    validate: (draft) => validateGatheringEventDraft(draft, text),
  });
  const drops = createDropSelection(() => tasks.editing);
  const environments = createEnvironments(inputs, library);
  const gatheringTaskResolutionMode = $derived(tasks.editing?.resolutionMode || 'd100');
  const gatheringTaskRoutedOutcomeTiers = $derived.by(() =>
    routedTierOptionsForPolicy(
      selectedSystem()?.gatheringCraftingCheck?.routed,
      selectedSystem()?.gatheringCraftingCheck?.failureResultPolicy
    )
  );
  let lastGatheringSystemId = $state('');

  return mergeAccessors(
    library,
    tabs,
    exposeFields(tasks, TASK_FIELDS),
    exposeFields(events, EVENT_FIELDS),
    drops,
    environments,
    createPresenters(inputs, { library, environments }),
    {
      get gatheringTaskResolutionMode() {
        return gatheringTaskResolutionMode;
      },
      get gatheringTaskRoutedOutcomeTiers() {
        return gatheringTaskRoutedOutcomeTiers;
      },
      reselectTask() {
        if (!tasks.reselect(canShowEnvironments())) drops.selectedGatheringDropId = '';
      },
      reselectEvent() {
        events.reselect(canShowEnvironments());
      },
      resetOnSystemSwitch() {
        const systemId = selectedSystemId();
        if (systemId === lastGatheringSystemId) return;
        tabs.activeGatheringTab = 'environments';
        tasks.reset();
        events.reset();
        inputs.navRail().setGroupExpanded('gathering', inputs.isGatheringRoute());
        lastGatheringSystemId = systemId;
      },
    }
  );
}
