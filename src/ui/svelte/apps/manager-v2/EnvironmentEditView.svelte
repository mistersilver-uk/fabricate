<!-- Svelte 5 runes mode -->
<script>
  import { tick } from 'svelte';
  import { localize } from '../../util/foundryBridge.js';
  import CatalystList from '../environments/CatalystList.svelte';
  import EnvironmentActionMenu from '../environments/EnvironmentActionMenu.svelte';
  import FailureOutcomeFields from '../environments/FailureOutcomeFields.svelte';
  import ProgressiveFields from '../environments/ProgressiveFields.svelte';
  import ResultGroups from '../environments/ResultGroups.svelte';
  import ResultSelectionFields from '../environments/ResultSelectionFields.svelte';
  import TaskBaseFields from '../environments/TaskBaseFields.svelte';
  import TimeRequirementFields from '../environments/TimeRequirementFields.svelte';
  import VisibilityFields from '../environments/VisibilityFields.svelte';
  import ImagePathPicker from '../../components/ImagePathPicker.svelte';

  let {
    environments = [],
    environmentDraft = null,
    dirty = false,
    isNew = false,
    saving = false,
    saveError = null,
    validationState = null,
    selectedTaskId = '',
    managedItemOptions = [],
    availableScriptMacros = [],
    sceneOptions = [],
    rollTableOptions = [],
    gatheringConfig = null,
    onPickImagePath,
    onUpdateEnvironment,
    onUpdateGatheringConditions,
    onUpdateGatheringVocabulary,
    onAddGatheringLibraryTask,
    onUpdateGatheringLibraryTask,
    onDeleteGatheringLibraryTask,
    onAddGatheringLibraryHazard,
    onUpdateGatheringLibraryHazard,
    onDeleteGatheringLibraryHazard,
    onAddGatheringHazardCharacterModifier = null,
    onUpdateGatheringHazardCharacterModifier = null,
    onDeleteGatheringHazardCharacterModifier = null,
    onSaveEnvironment,
    onDuplicateEnvironment,
    onDeleteEnvironment,
    onMoveEnvironment,
    onAddTask,
    onSelectTask,
    onUpdateTask,
    onDuplicateTask,
    onDeleteTask,
    onMoveTask,
    onAddResultGroup,
    onUpdateResultGroup,
    onDeleteResultGroup,
    onMoveResultGroup,
    onAddResult,
    onUpdateResult,
    onDeleteResult,
    onMoveResult,
    onAddCatalyst,
    onUpdateCatalyst,
    onDeleteCatalyst,
    onUpdateVisibility,
    onUpdateResultSelection,
    onUpdateProgressive,
    onUpdateCheck,
    onUpdateTimeRequirement,
    onUpdateFailureOutcome
  } = $props();

  const timeUnits = [
    { field: 'minutes', label: 'FABRICATE.Admin.Environments.TimeMinutes' },
    { field: 'hours', label: 'FABRICATE.Admin.Environments.TimeHours' },
    { field: 'days', label: 'FABRICATE.Admin.Environments.TimeDays' },
    { field: 'months', label: 'FABRICATE.Admin.Environments.TimeMonths' },
    { field: 'years', label: 'FABRICATE.Admin.Environments.TimeYears' }
  ];

  const taskTabs = [
    { id: 'details', section: 'base', icon: 'fas fa-pen', labelKey: 'FABRICATE.Admin.ManagerV2.Environment.TaskTabDetails', fallback: 'Task Details' },
    { id: 'results', section: 'resultGroups', icon: 'fas fa-box-open', labelKey: 'FABRICATE.Admin.ManagerV2.Environment.TaskTabResults', fallback: 'Results' },
    { id: 'catalysts', section: 'catalysts', icon: 'fas fa-key', labelKey: 'FABRICATE.Admin.ManagerV2.Environment.TaskTabCatalysts', fallback: 'Catalysts' },
    { id: 'visibility', section: 'visibility', icon: 'fas fa-eye', labelKey: 'FABRICATE.Admin.ManagerV2.Environment.TaskTabVisibility', fallback: 'Visibility' },
    { id: 'timing', section: 'time', icon: 'fas fa-clock', labelKey: 'FABRICATE.Admin.ManagerV2.Environment.TaskTabTiming', fallback: 'Timing' },
    { id: 'check', section: 'check', icon: 'fas fa-dice-d20', labelKey: 'FABRICATE.Admin.ManagerV2.Environment.TaskTabCheck', fallback: 'Check' }
  ];

  let localSelectedTaskId = $state('');
  let activeTaskTab = $state('details');
  let pendingVisibility = $state(null);
  let pendingVisibilityKey = $state('');
  let expandedResultGroups = $state({});
  let lastValidationFocusAttempt = $state(0);
  let sceneDropActive = $state(false);
  let validationOpen = $state(false);
  let lastValidationCount = $state(-1);

  const tasks = $derived(Array.isArray(environmentDraft?.tasks) ? environmentDraft.tasks : []);
  const activeTaskId = $derived(selectedTaskId || localSelectedTaskId);
  const activeTask = $derived(tasks.find(task => task.id === activeTaskId) || null);
  const activeTaskIndex = $derived(tasks.findIndex(task => task.id === activeTaskId));
  const selectedEnvironmentIndex = $derived(environments.findIndex(environment => environment.id === environmentDraft?.id));
  const activeTaskTimeRequirement = $derived(activeTask?.timeRequirement || null);
  const activeTaskFailureOutcome = $derived(activeTask?.failureOutcome || null);
  const activeTaskVisibility = $derived(activeTask?.visibility || null);
  const activeTaskResultSelection = $derived(activeTask?.resultSelection || null);
  const activeTaskProgressive = $derived(activeTask?.progressive || null);
  const activeTaskCheck = $derived(activeTask?.check || null);
  const activeTaskCatalysts = $derived(Array.isArray(activeTask?.catalysts) ? activeTask.catalysts : []);
  const activeTaskResultGroups = $derived(Array.isArray(activeTask?.resultGroups) ? activeTask.resultGroups : []);
  const validationErrors = $derived(Array.isArray(validationState?.errors) ? validationState.errors : []);
  const managedItemMap = $derived(new Map((Array.isArray(managedItemOptions) ? managedItemOptions : []).map(item => [item.id, item])));
  const scriptMacroOptions = $derived(Array.isArray(availableScriptMacros) ? availableScriptMacros : []);
  const sceneOptionList = $derived(Array.isArray(sceneOptions) ? sceneOptions : []);
  const rollTableOptionList = $derived(Array.isArray(rollTableOptions) ? rollTableOptions : []);
  const gatheringVocabularies = $derived(gatheringConfig?.vocabularies || {});
  const gatheringConditions = $derived(gatheringConfig?.conditions || {});
  const gatheringSystemConfig = $derived(gatheringConfig?.systems?.[environmentDraft?.craftingSystemId] || { tasks: [], hazards: [] });
  const gatheringSystemVocabularies = $derived(gatheringSystemConfig?.vocabularies || {});
  const regionVocabularyValues = $derived(Array.isArray(gatheringSystemVocabularies?.regions?.values)
    ? gatheringSystemVocabularies.regions.values
    : (gatheringVocabularies.regions || []));
  const gatheringSystemConditions = $derived(gatheringSystemConfig?.conditions || {});
  const weatherSetting = $derived(gatheringSystemConditions.weather || { current: gatheringConditions.weather || 'clear', values: gatheringVocabularies.weather || ['clear'] });
  const timeOfDaySetting = $derived(gatheringSystemConditions.timeOfDay || { current: gatheringConditions.timeOfDay || 'day', values: gatheringVocabularies.timeOfDay || ['day'] });
  const libraryTasks = $derived(Array.isArray(gatheringSystemConfig.tasks) ? gatheringSystemConfig.tasks : []);
  const libraryHazards = $derived(Array.isArray(gatheringSystemConfig.hazards) ? gatheringSystemConfig.hazards : []);
  const libraryCharacterModifiers = $derived(Array.isArray(gatheringSystemConfig.characterModifiers) ? gatheringSystemConfig.characterModifiers : []);

  function libraryCharacterModifierEntry(modifierId) {
    if (!modifierId) return null;
    return libraryCharacterModifiers.find(entry => entry.id === modifierId) || null;
  }

  function hazardCharacterModifierLabel(ref) {
    const entry = libraryCharacterModifierEntry(ref?.modifierId);
    if (entry) return entry.label || entry.id;
    return text('FABRICATE.Admin.ManagerV2.Gathering.CharacterModifiers.UnknownModifier', 'Unknown modifier ({id})').replace('{id}', ref?.modifierId || '');
  }

  function hazardCharacterModifierIcon(ref) {
    return libraryCharacterModifierEntry(ref?.modifierId)?.icon || 'fa-solid fa-user';
  }

  function hazardCharacterModifierIsCustomized(ref) {
    if (!ref) return false;
    return Boolean(ref.expressionOverride);
  }

  function hazardCharacterModifierRefs(hazard) {
    return Array.isArray(hazard?.characterModifiers) ? hazard.characterModifiers : [];
  }

  async function onAddHazardCharacterModifier(hazardId) {
    if (!onAddGatheringHazardCharacterModifier) return;
    const firstId = libraryCharacterModifiers[0]?.id || '';
    await onAddGatheringHazardCharacterModifier(
      environmentDraft?.craftingSystemId,
      hazardId,
      firstId ? { modifierId: firstId } : { modifierId: '' }
    );
  }

  async function onUpdateHazardCharacterModifier(hazardId, refId, patch) {
    if (!onUpdateGatheringHazardCharacterModifier) return;
    await onUpdateGatheringHazardCharacterModifier(environmentDraft?.craftingSystemId, hazardId, refId, patch);
  }

  async function onDeleteHazardCharacterModifier(hazardId, refId) {
    if (!onDeleteGatheringHazardCharacterModifier) return;
    await onDeleteGatheringHazardCharacterModifier(environmentDraft?.craftingSystemId, hazardId, refId);
  }

  const activeVisibilityKey = $derived(`${environmentDraft?.id || 'new'}:${environmentDraft?.craftingSystemId || ''}:${activeTaskId}`);
  const editorVisibility = $derived(pendingVisibility || activeTaskVisibility);
  const normalizedValidationErrors = $derived(validationErrors.map(error => normalizedValidationTarget(error)));
  const invalidTaskIds = $derived(new Set(normalizedValidationErrors.map(error => error.taskId).filter(Boolean)));
  const invalidTaskSectionIds = $derived(new Set(normalizedValidationErrors
    .filter(error => error.taskId && error.sectionKey)
    .map(error => taskSectionId(error.taskId, error.sectionKey))));
  const invalidResultGroupIds = $derived(new Set(normalizedValidationErrors
    .filter(error => error.taskId && error.resultGroupId)
    .map(error => resultGroupExpansionId(error.taskId, error.resultGroupId))));
  const groupedValidationSections = $derived(validationGroups(normalizedValidationErrors));
  const selectedScene = $derived(linkedSceneForDraft());
  const selectedSceneMissing = $derived(Boolean(environmentDraft?.sceneUuid) && !selectedScene);
  const selectedVisibilityMacroMissing = $derived(Boolean(editorVisibility?.macroUuid) && !scriptMacroOptions.some(macro => macro.uuid === editorVisibility.macroUuid));
  const selectedResultSelectionMacroMissing = $derived(Boolean(activeTaskResultSelection?.macroUuid) && !scriptMacroOptions.some(macro => macro.uuid === activeTaskResultSelection.macroUuid));
  const selectedCheckMacroMissing = $derived(Boolean(activeTaskCheck?.macroUuid) && !scriptMacroOptions.some(macro => macro.uuid === activeTaskCheck.macroUuid));
  const selectedFailureMacroMissing = $derived(Boolean(activeTaskFailureOutcome?.macroUuid) && !scriptMacroOptions.some(macro => macro.uuid === activeTaskFailureOutcome.macroUuid));
  const selectedRollTableMissing = $derived(activeTaskResultSelection?.provider === 'rollTableOutcome'
    && Boolean(activeTaskResultSelection?.rollTableUuid)
    && !rollTableOptionList.some(table => table.uuid === activeTaskResultSelection.rollTableUuid));

  $effect(() => {
    if (tasks.length === 0) {
      localSelectedTaskId = '';
      return;
    }
    if (!tasks.some(task => task.id === activeTaskId)) {
      localSelectedTaskId = tasks[0].id;
    }
  });

  $effect(() => {
    if (pendingVisibilityKey !== activeVisibilityKey) {
      pendingVisibility = null;
      pendingVisibilityKey = activeVisibilityKey;
    }
  });

  $effect(() => {
    const attempt = Number(validationState?.attempt || 0);
    if (attempt > 0 && attempt !== lastValidationFocusAttempt) {
      lastValidationFocusAttempt = attempt;
      if (validationErrors.length > 0) {
        validationOpen = true;
      }
      focusValidationError(validationState.firstInvalidField);
    }
  });

  $effect(() => {
    const count = validationErrors.length;
    if (lastValidationCount === -1) {
      lastValidationCount = count;
      if (count > 0) {
        validationOpen = true;
      }
      return;
    }
    if (count > lastValidationCount) {
      validationOpen = true;
    }
    lastValidationCount = count;
  });

  function handleSceneDragOver(event) {
    if (!event?.dataTransfer) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = 'link';
    sceneDropActive = true;
  }

  function handleSceneDragLeave() {
    sceneDropActive = false;
  }

  function handleSceneDrop(event) {
    event.preventDefault();
    sceneDropActive = false;
    const raw = event?.dataTransfer?.getData?.('text/plain') || '';
    if (!raw) return;
    let payload;
    try {
      payload = JSON.parse(raw);
    } catch (_) {
      return;
    }
    if (!payload || payload.type !== 'Scene') return;
    const uuid = payload.uuid || (payload.id ? `Scene.${payload.id}` : null);
    if (!uuid) return;
    updateField('sceneUuid', uuid);
  }

  function text(key, fallback) {
    const translated = localize(key);
    return translated && translated !== key ? translated : fallback;
  }

  function environmentName() {
    const explicitName = typeof environmentDraft?.name === 'string' ? environmentDraft.name.trim() : '';
    if (explicitName) return explicitName;
    return text('FABRICATE.Admin.Environments.NewDraftTitle', 'New Gathering Environment');
  }

  function linkedSceneForDraft() {
    const sceneUuid = environmentDraft?.sceneUuid || '';
    if (!sceneUuid) return null;
    return sceneOptionList.find(scene => scene.uuid === sceneUuid) || null;
  }

  function sceneImage() {
    return selectedScene?.background?.src || selectedScene?.img || selectedScene?.thumbnail || selectedScene?.thumb || 'icons/svg/item-bag.svg';
  }

  function taskResultCount(task) {
    return (Array.isArray(task?.resultGroups) ? task.resultGroups : [])
      .reduce((total, group) => total + (Array.isArray(group?.results) ? group.results.length : 0), 0);
  }

  function resultGroupCountLabel(count) {
    return localize('FABRICATE.Admin.Environments.ResultGroupCount', { count });
  }

  function resultCountLabel(count) {
    return localize('FABRICATE.Admin.Environments.ResultCount', { count });
  }

  function catalystCountLabel(count) {
    return localize('FABRICATE.Admin.Environments.CatalystCount', { count });
  }

  function taskEnabledLabel(task) {
    return task?.enabled
      ? localize('FABRICATE.Admin.Environments.Enabled')
      : localize('FABRICATE.Admin.Recipes.Disabled');
  }

  function taskResolutionModeLabel(task) {
    return task?.resolutionMode === 'routed'
      ? localize('FABRICATE.Admin.Environments.TaskResolutionRouted')
      : localize('FABRICATE.Admin.Environments.TaskResolutionProgressive');
  }

  function taskTimeLabel(task) {
    return task?.timeRequirement
      ? localize('FABRICATE.Admin.Environments.Timed')
      : localize('FABRICATE.Admin.Environments.Immediate');
  }

  function taskVisibilityLabel(task) {
    return task?.visibility
      ? localize('FABRICATE.Admin.Environments.VisibilityConfigured')
      : localize('FABRICATE.Admin.Environments.VisibilityUnconfigured');
  }

  function taskSummary(task) {
    const groups = Array.isArray(task?.resultGroups) ? task.resultGroups : [];
    const catalysts = Array.isArray(task?.catalysts) ? task.catalysts : [];
    return [
      taskResolutionModeLabel(task),
      taskTimeLabel(task),
      catalystCountLabel(catalysts.length),
      resultCountLabel(taskResultCount(task))
    ].join(' · ');
  }

  function taskBaseSummary(task) {
    return [taskEnabledLabel(task), taskResolutionModeLabel(task)].join(' · ');
  }

  function taskFailureSummary(task) {
    return task?.failureOutcome
      ? localize('FABRICATE.Admin.Environments.FailureCustom')
      : localize('FABRICATE.Admin.Environments.FailureDefault');
  }

  function taskResolutionSummary(task) {
    if (task?.resultSelection?.provider === 'rollTableOutcome') {
      return localize('FABRICATE.Admin.Environments.ResultSelectionProviderRollTable');
    }
    return localize('FABRICATE.Admin.Environments.ResultSelectionProviderMacro');
  }

  function taskCheckSummary(task) {
    const awardMode = task?.progressive?.awardMode || 'equal';
    const awardLabel = awardMode === 'partial'
      ? localize('FABRICATE.Admin.Environments.ProgressiveAwardPartial')
      : awardMode === 'exceed'
        ? localize('FABRICATE.Admin.Environments.ProgressiveAwardExceed')
        : localize('FABRICATE.Admin.Environments.ProgressiveAwardEqual');
    if (!task?.check?.provider) {
      return `${awardLabel} · ${localize('FABRICATE.Admin.Environments.CheckUnconfigured')}`;
    }
    const providerLabel = task.check.provider === 'dnd5e'
      ? localize('FABRICATE.Admin.Environments.CheckProviderDnd5e')
      : task.check.provider === 'pf2e'
        ? localize('FABRICATE.Admin.Environments.CheckProviderPf2e')
        : localize('FABRICATE.Admin.Environments.CheckProviderMacro');
    return `${awardLabel} · ${providerLabel}`;
  }

  function taskResultGroupSummary(task) {
    const groups = Array.isArray(task?.resultGroups) ? task.resultGroups : [];
    return `${resultGroupCountLabel(groups.length)} · ${resultCountLabel(taskResultCount(task))}`;
  }

  function taskSectionId(taskId, sectionKey) {
    return taskId && sectionKey ? `task.${taskId}.${sectionKey}` : '';
  }

  function resultGroupExpansionId(taskId, groupId) {
    return taskId && groupId ? `task.${taskId}.resultGroups.${groupId}` : '';
  }

  function taskSectionInvalid(sectionKey) {
    return activeTask?.id ? invalidTaskSectionIds.has(taskSectionId(activeTask.id, sectionKey)) : false;
  }

  function isResultGroupExpanded(groupId) {
    const groupExpansionId = resultGroupExpansionId(activeTask?.id, groupId);
    if (!groupExpansionId) return true;
    return expandedResultGroups[groupExpansionId] ?? true;
  }

  function setResultGroupExpanded(groupId, open) {
    const groupExpansionId = resultGroupExpansionId(activeTask?.id, groupId);
    if (!groupExpansionId) return;
    expandedResultGroups = { ...expandedResultGroups, [groupExpansionId]: Boolean(open) };
  }

  function taskIdForValidationError(error) {
    if (error?.taskId) return error.taskId;
    const match = String(error?.path || '').match(/^task\.([^.]+)\./);
    return match?.[1] || null;
  }

  function sectionKeyForValidationPath(path) {
    const match = String(path || '').match(/^task\.[^.]+\.(.+)$/);
    const taskPath = match?.[1] || '';
    if (!taskPath) return null;
    if (/^(name|description|img|enabled|resolutionMode)(\.|$)/.test(taskPath)) return 'base';
    if (taskPath.startsWith('timeRequirement')) return 'time';
    if (taskPath.startsWith('failureOutcome')) return 'failure';
    if (taskPath.startsWith('visibility')) return 'visibility';
    if (taskPath.startsWith('resultSelection')) return 'resolution';
    if (taskPath.startsWith('progressive') || taskPath.startsWith('check')) return 'check';
    if (taskPath.startsWith('catalysts')) return 'catalysts';
    if (taskPath.startsWith('resultGroups') || taskPath.startsWith('result.')) return 'resultGroups';
    return 'base';
  }

  function taskTabForSection(sectionKey) {
    if (sectionKey === 'base') return 'details';
    if (sectionKey === 'resolution' || sectionKey === 'resultGroups') return 'results';
    if (sectionKey === 'catalysts') return 'catalysts';
    if (sectionKey === 'visibility') return 'visibility';
    if (sectionKey === 'time' || sectionKey === 'failure') return 'timing';
    if (sectionKey === 'check') return 'check';
    return 'details';
  }

  function taskTabInvalid(tabId) {
    if (!activeTask?.id) return false;
    return normalizedValidationErrors.some(error => error.taskId === activeTask.id && taskTabForSection(error.sectionKey) === tabId);
  }

  function resultGroupIdForValidationPath(path, taskId) {
    const taskPath = String(path || '').replace(/^task\.[^.]+\./, '');
    const groupMatch = taskPath.match(/^resultGroups\.([^.]+)\./);
    if (groupMatch) return groupMatch[1];
    const resultMatch = taskPath.match(/^result\.([^.]+)\./);
    if (!resultMatch) return null;
    const task = tasks.find(candidate => candidate.id === taskId);
    const resultId = resultMatch[1];
    const group = (Array.isArray(task?.resultGroups) ? task.resultGroups : [])
      .find(candidate => (Array.isArray(candidate?.results) ? candidate.results : [])
        .some(result => result?.id === resultId));
    return group?.id || null;
  }

  function normalizedValidationTarget(error) {
    const taskId = taskIdForValidationError(error);
    const sectionKey = sectionKeyForValidationPath(error?.path);
    const resultGroupId = sectionKey === 'resultGroups'
      ? resultGroupIdForValidationPath(error?.path, taskId)
      : null;
    return { ...error, taskId, sectionKey, resultGroupId };
  }

  function validationGroupTitle(error) {
    if (error.taskId) {
      const task = tasks.find(candidate => candidate.id === error.taskId);
      const taskName = task?.name || localize('FABRICATE.Admin.Environments.NewTaskName');
      return `${text('FABRICATE.Admin.ManagerV2.Environment.SelectedTask', 'Selected task')}: ${taskName}`;
    }
    if (String(error.path || '').startsWith('environment.sceneUuid')) {
      return text('FABRICATE.Admin.ManagerV2.Environment.SceneCard', 'Linked scene');
    }
    return text('FABRICATE.Admin.ManagerV2.Environment.EnvironmentDetailsTab', 'Environment Details');
  }

  function validationGroups(errors) {
    const groups = new Map();
    for (const error of errors) {
      const severity = error.severity === 'warning' || error.level === 'warning'
        ? text('FABRICATE.Admin.ManagerV2.Environment.ValidationWarning', 'Warning')
        : text('FABRICATE.Admin.ManagerV2.Environment.ValidationIssue', 'Issue');
      const title = validationGroupTitle(error);
      const key = `${severity}:${title}`;
      if (!groups.has(key)) {
        groups.set(key, {
          id: key.replace(/[^a-zA-Z0-9_-]+/g, '-'),
          title,
          severity,
          items: []
        });
      }
      groups.get(key).items.push(error);
    }
    return Array.from(groups.values());
  }

  function revealValidationTarget(error) {
    const target = normalizedValidationTarget(error);
    if (target.taskId) {
      if (target.taskId !== activeTaskId) selectTask(target.taskId);
      activeTaskTab = taskTabForSection(target.sectionKey);
      if (target.resultGroupId) {
        expandedResultGroups = {
          ...expandedResultGroups,
          [resultGroupExpansionId(target.taskId, target.resultGroupId)]: true
        };
      }
    }
  }

  function updateField(field, value) {
    onUpdateEnvironment?.({ [field]: value });
  }

  function updateCondition(field, value) {
    onUpdateEnvironment?.({
      conditions: {
        ...(environmentDraft?.conditions || {}),
        [field]: value
      }
    });
  }

  function tagCsv(values) {
    return (Array.isArray(values) ? values : [])
      .map(value => String(value || '').trim())
      .filter(Boolean)
      .join(', ');
  }

  function parseTags(value) {
    return String(value || '')
      .split(',')
      .map(entry => entry.trim().toLowerCase())
      .filter(Boolean);
  }

  function conditionId(option) {
    if (option && typeof option === 'object') return String(option.id || '').trim();
    return String(option || '').trim();
  }

  function conditionLabel(option) {
    if (option && typeof option === 'object') return String(option.label || option.id || '').trim();
    return String(option || '').trim();
  }

  function vocabularyId(option) {
    if (option && typeof option === 'object') return String(option.id || '').trim();
    return String(option || '').trim();
  }

  function vocabularyLabel(option) {
    if (option && typeof option === 'object') return String(option.label || option.id || '').trim();
    return String(option || '').trim();
  }

  function firstDropRow(task) {
    return Array.isArray(task?.dropRows) && task.dropRows.length > 0
      ? task.dropRows[0]
      : { id: 'drop-row', componentId: '', itemUuid: '', quantity: 1, dropRate: 100, enabled: true };
  }

  function updateTaskFirstDropRow(task, updates) {
    const existingRows = Array.isArray(task?.dropRows) && task.dropRows.length > 0 ? task.dropRows : [firstDropRow(task)];
    const nextRows = existingRows.map((row, index) => index === 0 ? { ...row, ...updates } : row);
    onUpdateGatheringLibraryTask?.(environmentDraft?.craftingSystemId, task.id, { dropRows: nextRows });
  }

  function environmentIdList(field) {
    return Array.isArray(environmentDraft?.[field]) ? environmentDraft[field] : [];
  }

  function libraryRecordEnabled(recordId, enabledField, disabledField) {
    const enabled = environmentIdList(enabledField);
    const disabled = environmentIdList(disabledField);
    if (disabled.includes(recordId)) return false;
    return enabled.length === 0 || enabled.includes(recordId);
  }

  function toggleLibraryRecord(recordId, checked, enabledField, disabledField) {
    const enabled = environmentIdList(enabledField);
    const disabled = environmentIdList(disabledField);
    if (checked) {
      onUpdateEnvironment?.({
        [enabledField]: Array.from(new Set([...enabled, recordId])),
        [disabledField]: disabled.filter(id => id !== recordId)
      });
      return;
    }
    onUpdateEnvironment?.({
      [enabledField]: enabled.filter(id => id !== recordId),
      [disabledField]: Array.from(new Set([...disabled, recordId]))
    });
  }

  function selectTask(taskId) {
    localSelectedTaskId = taskId;
    onSelectTask?.(taskId);
  }

  function updateTask(field, value) {
    const taskId = activeTask?.id;
    if (!taskId) return;
    onUpdateTask?.(taskId, { [field]: value });
  }

  function updateTaskNodes(field, value) {
    const taskId = activeTask?.id;
    if (!taskId) return;
    const existing = activeTask.nodes || { enabled: true, max: 0, current: 0, depletionTiming: 'onStart', respawn: { policy: 'none' } };
    onUpdateTask?.(taskId, {
      nodes: {
        ...existing,
        enabled: true,
        [field]: value
      }
    });
  }

  function updateTaskRespawn(field, value) {
    const taskId = activeTask?.id;
    if (!taskId) return;
    const existing = activeTask.nodes || { enabled: true, max: 0, current: 0, depletionTiming: 'onStart', respawn: { policy: 'none' } };
    onUpdateTask?.(taskId, {
      nodes: {
        ...existing,
        enabled: true,
        respawn: {
          ...(existing.respawn || { policy: 'none' }),
          [field]: value
        }
      }
    });
  }

  function updateAttemptLimit(field, value) {
    const taskId = activeTask?.id;
    if (!taskId) return;
    onUpdateTask?.(taskId, {
      attemptLimit: {
        ...(activeTask.attemptLimit || { enabled: true, scope: 'actor', max: 1, windowSeconds: 0, recharge: { policy: 'none' } }),
        enabled: true,
        [field]: value
      }
    });
  }

  async function pickTaskImagePath(currentPath) {
    if (!activeTask?.id || !onPickImagePath) return;
    try {
      const selectedPath = await onPickImagePath(currentPath || activeTask.img || '');
      if (typeof selectedPath === 'string' && selectedPath.trim()) {
        updateTask('img', selectedPath);
      }
    } catch (err) {
      // Picker failures preserve the current manual value.
    }
  }

  function environmentField(field) {
    return `environment.${field}`;
  }

  function taskField(field) {
    return activeTask?.id ? `task.${activeTask.id}.${field}` : '';
  }

  function catalystField(index, field) {
    return activeTask?.id ? `task.${activeTask.id}.catalysts.${index}.${field}` : '';
  }

  function resultGroupField(groupId, field) {
    return activeTask?.id && groupId ? `task.${activeTask.id}.resultGroups.${groupId}.${field}` : '';
  }

  function resultGroupsField() {
    return activeTask?.id ? `task.${activeTask.id}.resultGroups` : '';
  }

  function resultGroupResultsField(groupId) {
    return activeTask?.id && groupId ? `task.${activeTask.id}.resultGroups.${groupId}.results` : '';
  }

  function resultField(resultId, field) {
    return activeTask?.id && resultId ? `task.${activeTask.id}.result.${resultId}.${field}` : '';
  }

  function domIdFromPath(path) {
    return String(path || 'field').replace(/[^a-zA-Z0-9_-]+/g, '-');
  }

  function fieldErrors(path) {
    if (!path) return [];
    return validationErrors.filter(error => error.path === path);
  }

  function fieldErrorId(path) {
    return `environment-field-error-${domIdFromPath(path)}`;
  }

  function fieldInvalid(path) {
    return fieldErrors(path).length > 0 ? 'true' : undefined;
  }

  function fieldDescribedBy(path, extraIds = '') {
    const ids = String(extraIds || '').trim().split(/\s+/).filter(Boolean);
    if (fieldErrors(path).length > 0) ids.push(fieldErrorId(path));
    return ids.length > 0 ? ids.join(' ') : undefined;
  }

  async function focusValidationError(error) {
    if (!error?.fieldSelector) return;
    revealValidationTarget(error);
    await tick();
    const documentRef = globalThis.document;
    const root = documentRef?.querySelector?.('.manager-v2-environment-edit-view');
    const target = root?.querySelector?.(error.fieldSelector) || documentRef?.querySelector?.(error.fieldSelector);
    if (!target) return;
    target.scrollIntoView?.({ block: 'center', inline: 'nearest' });
    target.focus?.({ preventScroll: true });
  }

  function activeTaskActions() {
    const taskId = activeTask?.id || '';
    const name = activeTask?.name || localize('FABRICATE.Admin.Environments.NewTaskName');
    return [
      {
        key: 'move-up',
        label: localize('FABRICATE.Admin.Environments.MoveUp'),
        icon: 'fas fa-arrow-up',
        disabled: !taskId || activeTaskIndex <= 0 || !onMoveTask,
        onSelect: () => onMoveTask?.(taskId, 'up')
      },
      {
        key: 'move-down',
        label: localize('FABRICATE.Admin.Environments.MoveDown'),
        icon: 'fas fa-arrow-down',
        disabled: !taskId || activeTaskIndex < 0 || activeTaskIndex >= tasks.length - 1 || !onMoveTask,
        onSelect: () => onMoveTask?.(taskId, 'down')
      },
      {
        key: 'duplicate',
        label: localize('FABRICATE.Admin.Environments.DuplicateTaskNamed', { name }),
        icon: 'fas fa-copy',
        disabled: !taskId || !onDuplicateTask,
        onSelect: () => onDuplicateTask?.(taskId)
      },
      {
        key: 'delete',
        label: localize('FABRICATE.Admin.Environments.DeleteTaskNamed', { name }),
        icon: 'fas fa-trash',
        danger: true,
        disabled: !taskId || !onDeleteTask,
        onSelect: () => onDeleteTask?.(taskId)
      }
    ];
  }

  function selectedEnvironmentActions() {
    const environmentId = environmentDraft?.id || '';
    const name = environmentName();
    const canActOnPersistedEnvironment = Boolean(environmentId) && !isNew;
    return [
      {
        key: 'move-up',
        label: localize('FABRICATE.Admin.Environments.MoveUp'),
        icon: 'fas fa-arrow-up',
        disabled: !canActOnPersistedEnvironment || selectedEnvironmentIndex <= 0 || !onMoveEnvironment,
        onSelect: () => onMoveEnvironment?.(environmentId, 'up')
      },
      {
        key: 'move-down',
        label: localize('FABRICATE.Admin.Environments.MoveDown'),
        icon: 'fas fa-arrow-down',
        disabled: !canActOnPersistedEnvironment || selectedEnvironmentIndex < 0 || selectedEnvironmentIndex >= environments.length - 1 || !onMoveEnvironment,
        onSelect: () => onMoveEnvironment?.(environmentId, 'down')
      },
      {
        key: 'duplicate',
        label: localize('FABRICATE.Admin.Environments.DuplicateEnvironmentNamed', { name }),
        icon: 'fas fa-copy',
        disabled: !canActOnPersistedEnvironment || !onDuplicateEnvironment,
        onSelect: () => onDuplicateEnvironment?.(environmentId)
      },
      {
        key: 'delete',
        label: localize('FABRICATE.Admin.Environments.DeleteEnvironmentNamed', { name }),
        icon: 'fas fa-trash',
        danger: true,
        disabled: !canActOnPersistedEnvironment || !onDeleteEnvironment,
        onSelect: () => onDeleteEnvironment?.(environmentId)
      }
    ];
  }

  function addResultGroup() {
    if (!activeTask?.id) return;
    onAddResultGroup?.(activeTask.id);
  }

  function updateResultGroup(groupId, updates) {
    if (!activeTask?.id || !groupId) return;
    onUpdateResultGroup?.(activeTask.id, groupId, updates);
  }

  function deleteResultGroup(groupId) {
    if (!activeTask?.id || !groupId) return;
    onDeleteResultGroup?.(activeTask.id, groupId);
  }

  function moveResultGroup(groupId, direction) {
    if (!activeTask?.id || !groupId) return;
    onMoveResultGroup?.(activeTask.id, groupId, direction);
  }

  function addResult(groupId) {
    if (!activeTask?.id || !groupId) return;
    onAddResult?.(activeTask.id, groupId);
  }

  function updateResult(groupId, resultId, updates) {
    if (!activeTask?.id || !groupId || !resultId) return;
    onUpdateResult?.(activeTask.id, groupId, resultId, updates);
  }

  function deleteResult(groupId, resultId) {
    if (!activeTask?.id || !groupId || !resultId) return;
    onDeleteResult?.(activeTask.id, groupId, resultId);
  }

  function moveResult(groupId, resultId, direction) {
    if (!activeTask?.id || !groupId || !resultId) return;
    onMoveResult?.(activeTask.id, groupId, resultId, direction);
  }

  function addCatalyst() {
    if (!activeTask?.id) return;
    onAddCatalyst?.(activeTask.id);
  }

  function updateCatalyst(catalystIndex, updates) {
    if (!activeTask?.id) return;
    onUpdateCatalyst?.(activeTask.id, catalystIndex, updates);
  }

  function deleteCatalyst(catalystIndex) {
    if (!activeTask?.id) return;
    onDeleteCatalyst?.(activeTask.id, catalystIndex);
  }

  function isCompleteVisibility(config) {
    if (config?.provider === 'macro') return Boolean(String(config.macroUuid ?? '').trim());
    if (config?.provider === 'dnd5e' || config?.provider === 'pf2e') {
      return Boolean(String(config.formula ?? '').trim()) && Boolean(String(config.threshold ?? '').trim());
    }
    return false;
  }

  function defaultVisibilityForProvider(provider) {
    const source = editorVisibility || activeTaskVisibility || {};
    if (provider === 'dnd5e' || provider === 'pf2e') {
      return { provider, formula: source.formula || '', threshold: source.threshold || '' };
    }
    return { provider: 'macro', macroUuid: source.macroUuid || scriptMacroOptions[0]?.uuid || '' };
  }

  function updateVisibility(updatesOrNull) {
    if (!activeTask?.id) return;
    onUpdateVisibility?.(activeTask.id, updatesOrNull);
  }

  function commitVisibilityIfComplete(nextVisibility) {
    pendingVisibilityKey = activeVisibilityKey;
    if (isCompleteVisibility(nextVisibility)) {
      pendingVisibility = null;
      updateVisibility(nextVisibility);
      return;
    }
    pendingVisibility = nextVisibility;
  }

  function toggleVisibility(enabled) {
    if (!enabled) {
      pendingVisibility = null;
      if (activeTaskVisibility) updateVisibility(null);
      return;
    }
    commitVisibilityIfComplete(defaultVisibilityForProvider(editorVisibility?.provider || 'macro'));
  }

  function updateVisibilityProvider(provider) {
    commitVisibilityIfComplete(defaultVisibilityForProvider(provider));
  }

  function updateVisibilityField(field, value) {
    const nextVisibility = {
      ...(editorVisibility || { provider: 'macro' }),
      provider: editorVisibility?.provider || 'macro',
      [field]: value
    };
    commitVisibilityIfComplete(nextVisibility);
  }

  function updateResultSelection(updates) {
    if (!activeTask?.id) return;
    onUpdateResultSelection?.(activeTask.id, updates);
  }

  function updateProgressive(updates) {
    if (!activeTask?.id) return;
    onUpdateProgressive?.(activeTask.id, updates);
  }

  function updateCheck(updates) {
    if (!activeTask?.id) return;
    onUpdateCheck?.(activeTask.id, updates);
  }

  function toggleTimeRequirement(enabled) {
    if (!activeTask?.id) return;
    if (!enabled) {
      onUpdateTimeRequirement?.(activeTask.id, null);
      return;
    }
    onUpdateTimeRequirement?.(activeTask.id, {
      minutes: activeTaskTimeRequirement?.minutes ?? 1,
      hours: activeTaskTimeRequirement?.hours ?? 0,
      days: activeTaskTimeRequirement?.days ?? 0,
      months: activeTaskTimeRequirement?.months ?? 0,
      years: activeTaskTimeRequirement?.years ?? 0
    });
  }

  function updateTimeRequirement(field, value) {
    if (!activeTask?.id) return;
    onUpdateTimeRequirement?.(activeTask.id, { [field]: value });
  }

  function toggleFailureOutcome(enabled) {
    if (!activeTask?.id) return;
    onUpdateFailureOutcome?.(activeTask.id, enabled ? { mode: 'text', text: '' } : null);
  }

  function updateFailureOutcome(updates) {
    if (!activeTask?.id) return;
    onUpdateFailureOutcome?.(activeTask.id, updates);
  }

  function resultDifficulty(result) {
    const item = managedItemMap.get(result?.componentId);
    const difficulty = Number(item?.difficulty);
    return Number.isFinite(difficulty) && difficulty >= 1 ? difficulty : '';
  }
</script>

<form class="manager-v2-environment-edit-view" onsubmit={(event) => { event.preventDefault(); onSaveEnvironment?.(); }}>
  {#if environmentDraft}
    <section class="manager-v2-environment-details-band" aria-label={text('FABRICATE.Admin.ManagerV2.Environment.DetailsBand', 'Environment workspace')}>
      <div class="manager-v2-edit-card-heading">
        <div>
          <p class="manager-v2-kicker">{text('FABRICATE.Admin.ManagerV2.Environment.EnvironmentDetailsTab', 'Environment Details')}</p>
          <h2 class="manager-v2-card-title">{environmentName()}</h2>
        </div>
        <div class="manager-v2-action-group">
          {#if dirty}
            <span class="manager-v2-chip is-warning">{text('FABRICATE.Admin.ManagerV2.Environment.Dirty', 'Unsaved')}</span>
          {/if}
          <EnvironmentActionMenu
            actions={selectedEnvironmentActions()}
            triggerLabel={localize('FABRICATE.Admin.Environments.ActionsForEnvironment', { name: environmentName() })}
          />
        </div>
      </div>

      <div class="manager-v2-environment-details-grid">
        <div class="manager-v2-environment-fields-card">
          <div class="manager-v2-form-grid">
            <label class="manager-v2-field">
              <span>{localize('FABRICATE.Admin.Environments.Name')}</span>
              <input
                type="text"
                value={environmentDraft.name}
                data-environment-field={environmentField('name')}
                aria-invalid={fieldInvalid(environmentField('name'))}
                aria-describedby={fieldDescribedBy(environmentField('name'))}
                oninput={(event) => updateField('name', event.target.value)}
              />
              {#if fieldErrors(environmentField('name')).length > 0}
                <span class="environment-field-error" id={fieldErrorId(environmentField('name'))}>{fieldErrors(environmentField('name'))[0].message}</span>
              {/if}
            </label>
            <label class="manager-v2-field">
              <span>{localize('FABRICATE.Admin.Environments.SelectionMode')}</span>
              <select
                value={environmentDraft.selectionMode}
                data-environment-field={environmentField('selectionMode')}
                aria-invalid={fieldInvalid(environmentField('selectionMode'))}
                aria-describedby={fieldDescribedBy(environmentField('selectionMode'))}
                onchange={(event) => updateField('selectionMode', event.target.value)}
              >
                <option value="targeted">{localize('FABRICATE.Admin.Environments.SelectionTargeted')}</option>
                <option value="blind">{localize('FABRICATE.Admin.Environments.SelectionBlind')}</option>
              </select>
              {#if fieldErrors(environmentField('selectionMode')).length > 0}
                <span class="environment-field-error" id={fieldErrorId(environmentField('selectionMode'))}>{fieldErrors(environmentField('selectionMode'))[0].message}</span>
              {/if}
            </label>
            <label class="manager-v2-field span-2">
              <span>{localize('FABRICATE.Admin.Environments.Description')}</span>
              <textarea rows="3" value={environmentDraft.description} oninput={(event) => updateField('description', event.target.value)}></textarea>
            </label>
            <div class="manager-v2-field span-2">
              <span class="manager-v2-field-label">{text('FABRICATE.Admin.ManagerV2.Environment.Image', 'Environment image')}</span>
              <ImagePathPicker
                value={environmentDraft.img || ''}
                defaultImage="icons/environment/wilderness/cave-entrance.webp"
                showInput={false}
                dataEnvironmentField={environmentField('img')}
                chooseLabel={text('FABRICATE.Admin.ManagerV2.Environment.ChooseImage', 'Choose environment image')}
                onChange={(path) => updateField('img', path)}
                onPickImagePath={onPickImagePath}
              />
            </div>
          </div>
        </div>

        <section class="manager-v2-environment-scene-card" aria-label={text('FABRICATE.Admin.ManagerV2.Environment.SceneCard', 'Linked scene')}>
          <img class:is-linked={Boolean(selectedScene)} src={sceneImage()} alt="" />
          <div>
            <p class="manager-v2-kicker">{localize('FABRICATE.Admin.Environments.SceneUuid')}</p>
            <h3>{selectedScene?.name || (selectedSceneMissing ? text('FABRICATE.Admin.ManagerV2.Environment.SceneMissing', 'Scene unresolved') : text('FABRICATE.Admin.ManagerV2.Environment.SceneNone', 'No scene'))}</h3>
            <span class={`manager-v2-chip ${selectedScene ? 'is-active' : selectedSceneMissing ? 'is-warning' : 'is-disabled'}`}>
              {selectedScene ? text('FABRICATE.Admin.ManagerV2.Environment.SceneLinked', 'Linked scene') : selectedSceneMissing ? text('FABRICATE.Admin.ManagerV2.Environment.SceneMissing', 'Scene unresolved') : text('FABRICATE.Admin.ManagerV2.Environment.SceneNone', 'No scene')}
            </span>
          </div>
          <div
            class={`manager-v2-scene-drop-zone ${sceneDropActive ? 'is-active' : ''} ${selectedScene ? 'is-linked' : selectedSceneMissing ? 'is-warning' : ''}`}
            role="button"
            tabindex="0"
            data-environment-field={environmentField('sceneUuid')}
            aria-label={text('FABRICATE.Admin.ManagerV2.Environment.SceneDropZoneLabel', 'Scene drop zone')}
            aria-describedby={fieldDescribedBy(environmentField('sceneUuid'), selectedSceneMissing ? 'manager-v2-environment-scene-reference-warning' : '')}
            ondragover={handleSceneDragOver}
            ondragleave={handleSceneDragLeave}
            ondrop={handleSceneDrop}
          >
            <i class="fas fa-arrow-down-to-bracket" aria-hidden="true"></i>
            <p class="manager-v2-scene-drop-hint">
              {environmentDraft.sceneUuid
                ? text('FABRICATE.Admin.ManagerV2.Environment.SceneDropReplaceHint', 'Drag a different scene here to replace this link')
                : text('FABRICATE.Admin.ManagerV2.Environment.SceneDropHint', 'Drag a scene from the Scenes sidebar to link it')}
            </p>
            {#if environmentDraft.sceneUuid}
              <button
                type="button"
                class="manager-v2-button"
                onclick={(event) => { event.stopPropagation(); updateField('sceneUuid', ''); }}
              >
                <i class="fas fa-unlink" aria-hidden="true"></i>
                <span>{text('FABRICATE.Admin.ManagerV2.Environment.UnlinkScene', 'Unlink')}</span>
              </button>
            {/if}
          </div>
          {#if selectedSceneMissing}
            <span class="environment-stale-warning manager-v2-scene-warning" id="manager-v2-environment-scene-reference-warning">
              {localize('FABRICATE.Admin.Environments.LinkedSceneReferenceWarning')}
            </span>
          {/if}
          {#if fieldErrors(environmentField('sceneUuid')).length > 0}
            <span class="environment-field-error manager-v2-scene-warning" id={fieldErrorId(environmentField('sceneUuid'))}>{fieldErrors(environmentField('sceneUuid'))[0].message}</span>
          {/if}
        </section>

        <section class="manager-v2-environment-status-card" aria-label={text('FABRICATE.Admin.ManagerV2.Environment.StatusCard', 'Environment status')}>
          <p class="manager-v2-kicker">{localize('FABRICATE.Admin.Environments.Enabled')}</p>
          <div class="manager-v2-environment-status-row">
            <button
              type="button"
              class={`manager-v2-status-toggle ${environmentDraft.enabled === false ? 'is-off' : 'is-on'}`}
              aria-pressed={environmentDraft.enabled !== false}
              aria-label={environmentDraft.enabled === false
                ? text('FABRICATE.Admin.ManagerV2.EnableEnvironment', 'Enable environment')
                : text('FABRICATE.Admin.ManagerV2.DisableEnvironment', 'Disable environment')}
              onclick={() => updateField('enabled', environmentDraft.enabled === false)}
            >
              <span class="manager-v2-status-toggle-track" aria-hidden="true">
                <span class="manager-v2-status-toggle-knob"></span>
              </span>
              <span class="manager-v2-status-toggle-label">
                {environmentDraft.enabled === false ? text('FABRICATE.Admin.ManagerV2.StatusOff', 'Off') : text('FABRICATE.Admin.ManagerV2.StatusOn', 'On')}
              </span>
            </button>
            <span class="manager-v2-environment-status-meta">
              <strong>{environmentDraft.enabled === false ? text('FABRICATE.Admin.ManagerV2.StatusDisabled', 'Disabled') : text('FABRICATE.Admin.ManagerV2.StatusActive', 'Active')}</strong>
              <small>{environmentDraft.enabled === false
                ? text('FABRICATE.Admin.ManagerV2.Environment.DisabledHint', 'Players cannot attempt this environment.')
                : text('FABRICATE.Admin.ManagerV2.Environment.EnabledHint', 'Available to players when scene matches.')}</small>
            </span>
          </div>
        </section>
      </div>
    </section>

    <section class={`manager-v2-environment-validation-band ${validationOpen ? 'is-open' : ''}`} aria-label={text('FABRICATE.Admin.ManagerV2.Environment.Validation', 'Validation')}>
      <button
        type="button"
        class="manager-v2-environment-validation-toggle"
        aria-expanded={validationOpen}
        onclick={() => { validationOpen = !validationOpen; }}
      >
        <i class={validationErrors.length > 0 ? 'fas fa-triangle-exclamation' : 'fas fa-circle-check'} aria-hidden="true"></i>
        <strong>{text('FABRICATE.Admin.ManagerV2.Environment.Validation', 'Validation')}</strong>
        {#if validationErrors.length > 0}
          <span class="manager-v2-chip is-warning">{validationErrors.length}</span>
        {:else if saveError}
          <span class="manager-v2-chip is-warning">{text('FABRICATE.Admin.ManagerV2.Environment.SaveErrorChip', 'Save error')}</span>
        {:else}
          <span class="manager-v2-chip is-active">{text('FABRICATE.Admin.ManagerV2.Environment.ValidationAllGood', 'All good')}</span>
        {/if}
        <i class={`manager-v2-environment-validation-chevron fas ${validationOpen ? 'fa-chevron-up' : 'fa-chevron-down'}`} aria-hidden="true"></i>
      </button>
      {#if validationOpen}
        <div class="manager-v2-environment-validation-body">
          {#if validationErrors.length > 0}
            <div class="manager-v2-validation-groups" aria-label={validationState?.summary || localize('FABRICATE.Admin.Environments.ValidationSummary', { count: validationErrors.length })}>
              {#each groupedValidationSections as group (group.id)}
                <section class="manager-v2-validation-group" aria-label={group.title}>
                  <div class="manager-v2-validation-group-heading">
                    <strong>{group.title}</strong>
                    <span class="manager-v2-chip is-warning">{group.severity}</span>
                  </div>
                  <ul class="manager-v2-validation-list">
                    {#each group.items as error (error.id || error.path || error.message)}
                      <li>
                        <i class="fas fa-triangle-exclamation" aria-hidden="true"></i>
                        {#if error.fieldSelector}
                          <button type="button" class="environment-validation-link" onclick={() => focusValidationError(error)}>
                            {error.message}
                          </button>
                        {:else}
                          <span>{error.message}</span>
                        {/if}
                      </li>
                    {/each}
                  </ul>
                </section>
              {/each}
            </div>
          {:else if saveError}
            <p class="manager-v2-muted is-danger">{saveError}</p>
          {:else}
            <p class="manager-v2-muted">{text('FABRICATE.Admin.ManagerV2.Environment.NoValidationIssues', 'No validation issues are currently reported.')}</p>
          {/if}
          {#if selectedSceneMissing}
            <p class="environment-stale-warning">{localize('FABRICATE.Admin.Environments.LinkedSceneReferenceWarning')}</p>
          {/if}
        </div>
      {/if}
    </section>

    <section class="manager-v2-inspector-card manager-v2-gathering-library" aria-label={text('FABRICATE.Admin.ManagerV2.Environment.GatheringLibrarySettings', 'Gathering library and settings')}>
      <div class="manager-v2-edit-card-heading">
        <div>
          <p class="manager-v2-kicker">{text('FABRICATE.Admin.ManagerV2.Environment.GlobalConditions', 'Global conditions')}</p>
          <h3 class="manager-v2-card-title">{text('FABRICATE.Admin.ManagerV2.Environment.GatheringLibrarySettings', 'Gathering library and settings')}</h3>
        </div>
      </div>

      <div class="manager-v2-form-grid">
        <label class="manager-v2-field">
          <span>{text('FABRICATE.Admin.ManagerV2.Environment.CurrentWeather', 'Current weather')}</span>
          <select value={weatherSetting.current || 'clear'} onchange={(event) => onUpdateGatheringConditions?.({ weather: event.target.value })}>
            {#each weatherSetting.values || ['clear'] as weather (conditionId(weather))}
              <option value={conditionId(weather)}>{conditionLabel(weather)}</option>
            {/each}
          </select>
        </label>
        <label class="manager-v2-field">
          <span>{text('FABRICATE.Admin.ManagerV2.Environment.CurrentTimeOfDay', 'Current time of day')}</span>
          <select value={timeOfDaySetting.current || 'day'} onchange={(event) => onUpdateGatheringConditions?.({ timeOfDay: event.target.value })}>
            {#each timeOfDaySetting.values || ['day'] as timeOfDay (conditionId(timeOfDay))}
              <option value={conditionId(timeOfDay)}>{conditionLabel(timeOfDay)}</option>
            {/each}
          </select>
        </label>
        <label class="manager-v2-field">
          <span>{text('FABRICATE.Admin.ManagerV2.Environment.EnvironmentRegion', 'Environment region')}</span>
          <input value={environmentDraft.region || ''} list="manager-v2-gathering-regions" oninput={(event) => updateField('region', event.target.value)} />
          <datalist id="manager-v2-gathering-regions">
            {#each regionVocabularyValues as region (vocabularyId(region))}<option value={vocabularyId(region)} label={vocabularyLabel(region)}></option>{/each}
          </datalist>
        </label>
        <label class="manager-v2-field">
          <span>{text('FABRICATE.Admin.ManagerV2.Environment.EnvironmentBiomes', 'Environment biomes')}</span>
          <input value={tagCsv(environmentDraft.biomes)} oninput={(event) => updateField('biomes', parseTags(event.target.value))} />
        </label>
        <label class="manager-v2-field">
          <span>{text('FABRICATE.Admin.ManagerV2.Environment.EnvironmentDangerTags', 'Danger tags')}</span>
          <input value={tagCsv(environmentDraft.dangerTags)} oninput={(event) => updateField('dangerTags', parseTags(event.target.value))} />
        </label>
      </div>

      <details class="manager-v2-library-details">
        <summary>{text('FABRICATE.Admin.ManagerV2.Environment.TagVocabularies', 'Tag vocabularies')}</summary>
        <div class="manager-v2-form-grid">
          {#each ['danger'] as vocabulary (vocabulary)}
            <label class="manager-v2-field">
              <span>{vocabulary}</span>
              <input value={tagCsv(gatheringVocabularies[vocabulary])} oninput={(event) => onUpdateGatheringVocabulary?.(vocabulary, parseTags(event.target.value))} />
            </label>
          {/each}
        </div>
      </details>

      <div class="manager-v2-library-columns">
        <section>
          <div class="manager-v2-edit-card-heading">
            <div>
              <p class="manager-v2-kicker">{text('FABRICATE.Admin.ManagerV2.Environment.ReusableTasks', 'Gathering Tasks')}</p>
              <h4>{libraryTasks.length}</h4>
            </div>
            <button type="button" class="manager-v2-icon-button" aria-label={text('FABRICATE.Admin.ManagerV2.Environment.AddReusableTask', 'Add gathering task')} title={text('FABRICATE.Admin.ManagerV2.Environment.AddReusableTask', 'Add gathering task')} onclick={() => onAddGatheringLibraryTask?.(environmentDraft?.craftingSystemId)}>
              <i class="fas fa-plus" aria-hidden="true"></i>
            </button>
          </div>
          <div class="manager-v2-library-list">
            {#each libraryTasks as task (task.id)}
              {@const row = firstDropRow(task)}
              <details class="manager-v2-library-row">
                <summary>
                  <label class="manager-v2-inline-toggle">
                    <input
                      type="checkbox"
                      checked={libraryRecordEnabled(task.id, 'enabledTaskIds', 'disabledTaskIds')}
                      onchange={(event) => toggleLibraryRecord(task.id, event.target.checked, 'enabledTaskIds', 'disabledTaskIds')}
                    />
                    <span>{task.name}</span>
                  </label>
                </summary>
                <div class="manager-v2-form-grid">
                  <label class="manager-v2-field"><span>{text('FABRICATE.Admin.Environments.Name', 'Name')}</span><input value={task.name} oninput={(event) => onUpdateGatheringLibraryTask?.(environmentDraft?.craftingSystemId, task.id, { name: event.target.value })} /></label>
                  <label class="manager-v2-field"><span>{text('FABRICATE.Admin.ManagerV2.Environment.MatchRegion', 'Match region')}</span><input value={task.region || ''} oninput={(event) => onUpdateGatheringLibraryTask?.(environmentDraft?.craftingSystemId, task.id, { region: event.target.value })} /></label>
                  <label class="manager-v2-field"><span>{text('FABRICATE.Admin.ManagerV2.Environment.MatchBiomes', 'Match biomes')}</span><input value={tagCsv(task.biomes)} oninput={(event) => onUpdateGatheringLibraryTask?.(environmentDraft?.craftingSystemId, task.id, { biomes: parseTags(event.target.value) })} /></label>
                  <label class="manager-v2-field"><span>{text('FABRICATE.Admin.ManagerV2.Environment.MatchWeather', 'Match weather')}</span><input value={tagCsv(task.weather)} oninput={(event) => onUpdateGatheringLibraryTask?.(environmentDraft?.craftingSystemId, task.id, { weather: parseTags(event.target.value) })} /></label>
                  <label class="manager-v2-field"><span>{text('FABRICATE.Admin.ManagerV2.Environment.MatchTimeOfDay', 'Match time')}</span><input value={tagCsv(task.timeOfDay)} oninput={(event) => onUpdateGatheringLibraryTask?.(environmentDraft?.craftingSystemId, task.id, { timeOfDay: parseTags(event.target.value) })} /></label>
                  <label class="manager-v2-field"><span>{text('FABRICATE.Admin.ManagerV2.Environment.DropComponent', 'Drop component')}</span><select value={row.componentId || ''} onchange={(event) => updateTaskFirstDropRow(task, { componentId: event.target.value })}><option value=""></option>{#each managedItemOptions as item (item.id)}<option value={item.id}>{item.name}</option>{/each}</select></label>
                  <label class="manager-v2-field"><span>{text('FABRICATE.Admin.ManagerV2.Environment.DropRate', 'Drop rate')}</span><input type="number" min="0" max="100" step="1" value={row.dropRate ?? 1} oninput={(event) => updateTaskFirstDropRow(task, { dropRate: Number(event.target.value || 0) })} /></label>
                  <label class="manager-v2-field"><span>{text('FABRICATE.Admin.ManagerV2.Environment.Quantity', 'Quantity')}</span><input type="number" min="1" step="1" value={row.quantity || 1} oninput={(event) => updateTaskFirstDropRow(task, { quantity: Number(event.target.value || 1) })} /></label>
                </div>
                <button type="button" class="manager-v2-button is-danger" onclick={() => onDeleteGatheringLibraryTask?.(environmentDraft?.craftingSystemId, task.id)}>
                  <i class="fas fa-trash" aria-hidden="true"></i>
                  <span>{text('FABRICATE.Admin.ManagerV2.Environment.DeleteReusableTask', 'Delete gathering task')}</span>
                </button>
              </details>
            {:else}
              <p class="manager-v2-muted">{text('FABRICATE.Admin.ManagerV2.Environment.NoReusableTasks', 'No gathering tasks yet.')}</p>
            {/each}
          </div>
        </section>

        <section>
          <div class="manager-v2-edit-card-heading">
            <div>
              <p class="manager-v2-kicker">{text('FABRICATE.Admin.ManagerV2.Environment.ReusableHazards', 'Reusable hazards')}</p>
              <h4>{libraryHazards.length}</h4>
            </div>
            <button type="button" class="manager-v2-icon-button" aria-label={text('FABRICATE.Admin.ManagerV2.Environment.AddReusableHazard', 'Add reusable hazard')} title={text('FABRICATE.Admin.ManagerV2.Environment.AddReusableHazard', 'Add reusable hazard')} onclick={() => onAddGatheringLibraryHazard?.(environmentDraft?.craftingSystemId)}>
              <i class="fas fa-plus" aria-hidden="true"></i>
            </button>
          </div>
          <div class="manager-v2-library-list">
            {#each libraryHazards as hazard (hazard.id)}
              <details class="manager-v2-library-row">
                <summary>
                  <label class="manager-v2-inline-toggle">
                    <input
                      type="checkbox"
                      checked={libraryRecordEnabled(hazard.id, 'enabledHazardIds', 'disabledHazardIds')}
                      onchange={(event) => toggleLibraryRecord(hazard.id, event.target.checked, 'enabledHazardIds', 'disabledHazardIds')}
                    />
                    <span>{hazard.name}</span>
                  </label>
                </summary>
                <div class="manager-v2-form-grid">
                  <label class="manager-v2-field"><span>{text('FABRICATE.Admin.Environments.Name', 'Name')}</span><input value={hazard.name} oninput={(event) => onUpdateGatheringLibraryHazard?.(environmentDraft?.craftingSystemId, hazard.id, { name: event.target.value })} /></label>
                  <label class="manager-v2-field"><span>{text('FABRICATE.Admin.ManagerV2.Environment.MatchDanger', 'Match danger')}</span><input value={tagCsv(hazard.dangerTags)} oninput={(event) => onUpdateGatheringLibraryHazard?.(environmentDraft?.craftingSystemId, hazard.id, { dangerTags: parseTags(event.target.value) })} /></label>
                  <label class="manager-v2-field"><span>{text('FABRICATE.Admin.ManagerV2.Environment.MatchRegion', 'Match region')}</span><input value={hazard.region || ''} oninput={(event) => onUpdateGatheringLibraryHazard?.(environmentDraft?.craftingSystemId, hazard.id, { region: event.target.value })} /></label>
                  <label class="manager-v2-field"><span>{text('FABRICATE.Admin.ManagerV2.Environment.MatchBiomes', 'Match biomes')}</span><input value={tagCsv(hazard.biomes)} oninput={(event) => onUpdateGatheringLibraryHazard?.(environmentDraft?.craftingSystemId, hazard.id, { biomes: parseTags(event.target.value) })} /></label>
                  <label class="manager-v2-field"><span>{text('FABRICATE.Admin.ManagerV2.Environment.MatchWeather', 'Match weather')}</span><input value={tagCsv(hazard.weather)} oninput={(event) => onUpdateGatheringLibraryHazard?.(environmentDraft?.craftingSystemId, hazard.id, { weather: parseTags(event.target.value) })} /></label>
                  <label class="manager-v2-field"><span>{text('FABRICATE.Admin.ManagerV2.Environment.MatchTimeOfDay', 'Match time')}</span><input value={tagCsv(hazard.timeOfDay)} oninput={(event) => onUpdateGatheringLibraryHazard?.(environmentDraft?.craftingSystemId, hazard.id, { timeOfDay: parseTags(event.target.value) })} /></label>
                  <label class="manager-v2-field"><span>{text('FABRICATE.Admin.ManagerV2.Environment.DropRate', 'Drop rate')}</span><input type="number" min="1" max="100" step="1" value={hazard.dropRate || 1} oninput={(event) => onUpdateGatheringLibraryHazard?.(environmentDraft?.craftingSystemId, hazard.id, { dropRate: Number(event.target.value || 1) })} /></label>
                </div>
                <section class="manager-v2-character-modifier-row-editor manager-v2-hazard-character-modifiers" data-gathering-hazard-character-modifiers={hazard.id}>
                  <div class="manager-v2-inspector-subhead">
                    <h4>{text('FABRICATE.Admin.ManagerV2.Gathering.CharacterModifiers.RowSectionTitle', 'Character modifiers')}</h4>
                    <button type="button" class="manager-v2-icon-button" aria-label={text('FABRICATE.Admin.ManagerV2.Gathering.CharacterModifiers.AddRowReference', 'Add character modifier reference')} onclick={() => onAddHazardCharacterModifier(hazard.id)}>
                      <i class="fas fa-plus" aria-hidden="true"></i>
                    </button>
                  </div>
                  <div class="manager-v2-character-modifier-row-list">
                    {#each hazardCharacterModifierRefs(hazard) as ref (ref.id)}
                      {@const libraryEntry = libraryCharacterModifierEntry(ref.modifierId)}
                      {@const customized = hazardCharacterModifierIsCustomized(ref)}
                      <div class="manager-v2-character-modifier-row-reference" data-gathering-hazard-character-modifier-ref={ref.id}>
                        <div class="manager-v2-character-modifier-row-summary">
                          <span class="manager-v2-character-modifier-icon"><i class={hazardCharacterModifierIcon(ref)} aria-hidden="true"></i></span>
                          <label class="manager-v2-field manager-v2-character-modifier-picker">
                            <span class="visually-hidden">{text('FABRICATE.Admin.ManagerV2.Gathering.CharacterModifiers.PickerLabel', 'Modifier')}</span>
                            <select value={ref.modifierId} onchange={(event) => onUpdateHazardCharacterModifier(hazard.id, ref.id, { modifierId: event.currentTarget.value })}>
                              {#if !libraryEntry}
                                <option value={ref.modifierId} disabled>{hazardCharacterModifierLabel(ref)}</option>
                              {/if}
                              {#each libraryCharacterModifiers as option (option.id)}
                                <option value={option.id}>{option.label || option.id}</option>
                              {/each}
                            </select>
                          </label>
                          <label class="manager-v2-field manager-v2-character-modifier-operator-toggle">
                            <span class="visually-hidden">{text('FABRICATE.Admin.ManagerV2.Gathering.CharacterModifiers.Operator', 'Operator')}</span>
                            <select value={ref.operator || '+'} onchange={(event) => onUpdateHazardCharacterModifier(hazard.id, ref.id, { operator: event.currentTarget.value })}>
                              <option value="+">+</option>
                              <option value="-">-</option>
                            </select>
                          </label>
                          {#if customized}
                            <span class="manager-v2-chip manager-v2-character-modifier-customized-badge" data-tooltip={text('FABRICATE.Admin.ManagerV2.Gathering.CharacterModifiers.CustomizedTooltip', 'This reference overrides library defaults.')}>
                              <i class="fa-solid fa-sliders" aria-hidden="true"></i>
                              {text('FABRICATE.Admin.ManagerV2.Gathering.CharacterModifiers.Customized', 'Customized')}
                            </span>
                          {/if}
                          {#if !libraryEntry}
                            <span class="manager-v2-character-modifier-stale-warning" data-tooltip={text('FABRICATE.Admin.ManagerV2.Gathering.CharacterModifiers.UnknownModifier', 'Unknown modifier ({id})').replace('{id}', ref.modifierId)}>
                              <i class="fa-solid fa-triangle-exclamation" aria-hidden="true"></i>
                            </span>
                          {/if}
                          <button type="button" class="manager-v2-icon-button is-danger" aria-label={text('FABRICATE.Admin.ManagerV2.Gathering.CharacterModifiers.DeleteRowReference', 'Delete character modifier reference')} onclick={() => onDeleteHazardCharacterModifier(hazard.id, ref.id)}>
                            <i class="fas fa-trash" aria-hidden="true"></i>
                          </button>
                        </div>
                        <details class="manager-v2-character-modifier-bounds">
                          <summary>{text('FABRICATE.Admin.ManagerV2.Gathering.CharacterModifiers.Bounds', 'Bounds')}</summary>
                          <div class="manager-v2-form-grid">
                            <label class="manager-v2-field">
                              <span>{text('FABRICATE.Admin.ManagerV2.Gathering.CharacterModifiers.Min', 'Min')}</span>
                              <input type="number" step="1" value={ref.min ?? ''} oninput={(event) => onUpdateHazardCharacterModifier(hazard.id, ref.id, { min: event.currentTarget.value === '' ? null : Number(event.currentTarget.value) })} />
                            </label>
                            <label class="manager-v2-field">
                              <span>{text('FABRICATE.Admin.ManagerV2.Gathering.CharacterModifiers.Max', 'Max')}</span>
                              <input type="number" step="1" value={ref.max ?? ''} oninput={(event) => onUpdateHazardCharacterModifier(hazard.id, ref.id, { max: event.currentTarget.value === '' ? null : Number(event.currentTarget.value) })} />
                            </label>
                          </div>
                        </details>
                        <details class="manager-v2-character-modifier-override">
                          <summary>{text('FABRICATE.Admin.ManagerV2.Gathering.CharacterModifiers.Customize', 'Customize for this row')}</summary>
                          <label class="manager-v2-field" for={`hazard-${hazard.id}-character-modifier-${ref.id}-expression`}>
                            <span>{text('FABRICATE.Admin.ManagerV2.Gathering.CharacterModifiers.Expression', 'Expression')}</span>
                            <input
                              type="text"
                              id={`hazard-${hazard.id}-character-modifier-${ref.id}-expression`}
                              value={ref.expressionOverride || ''}
                              oninput={(event) => onUpdateHazardCharacterModifier(hazard.id, ref.id, { expressionOverride: event.currentTarget.value })}
                            />
                          </label>
                        </details>
                      </div>
                    {:else}
                      <p class="manager-v2-muted manager-v2-character-modifier-row-empty">{text('FABRICATE.Admin.ManagerV2.Gathering.CharacterModifiers.RowEmpty', 'No character modifiers attached.')}</p>
                    {/each}
                  </div>
                  {#if libraryCharacterModifiers.length === 0}
                    <p class="manager-v2-muted manager-v2-character-modifier-empty-hint">{text('FABRICATE.Admin.ManagerV2.Gathering.CharacterModifiers.LibraryEmptyHint', 'Add a modifier to the system library first to reference it here.')}</p>
                  {/if}
                </section>
                <button type="button" class="manager-v2-button is-danger" onclick={() => onDeleteGatheringLibraryHazard?.(environmentDraft?.craftingSystemId, hazard.id)}>
                  <i class="fas fa-trash" aria-hidden="true"></i>
                  <span>{text('FABRICATE.Admin.ManagerV2.Environment.DeleteReusableHazard', 'Delete reusable hazard')}</span>
                </button>
              </details>
            {:else}
              <p class="manager-v2-muted">{text('FABRICATE.Admin.ManagerV2.Environment.NoReusableHazards', 'No reusable hazards yet.')}</p>
            {/each}
          </div>
        </section>
      </div>
    </section>

    <section class="manager-v2-environment-workspace" aria-label={localize('FABRICATE.Admin.Environments.Tasks')}>
      <aside class="manager-v2-environment-task-rail">
        <div class="manager-v2-edit-card-heading">
          <div>
            <p class="manager-v2-kicker">{localize('FABRICATE.Admin.Environments.Tasks')}</p>
            <h3 class="manager-v2-card-title">{text('FABRICATE.Admin.ManagerV2.Environment.TaskRailTitle', 'Task list')}</h3>
          </div>
          <button type="button" class="manager-v2-icon-button" aria-label={localize('FABRICATE.Admin.Environments.AddTask')} title={localize('FABRICATE.Admin.Environments.AddTask')} onclick={() => onAddTask?.()}>
            <i class="fas fa-plus" aria-hidden="true"></i>
          </button>
        </div>

        {#if tasks.length > 0}
          <div class="manager-v2-task-rail-list" role="list">
            {#each tasks as task, index (task.id)}
              <div class={`manager-v2-task-rail-row ${activeTaskId === task.id ? 'is-active' : ''}`} data-environment-invalid={invalidTaskIds.has(task.id) ? 'true' : undefined}>
                <button type="button" class="manager-v2-task-rail-select" onclick={() => selectTask(task.id)} aria-current={activeTaskId === task.id ? 'true' : undefined}>
                  <i class={invalidTaskIds.has(task.id) ? 'fas fa-circle-exclamation' : task.enabled === false ? 'fas fa-circle-minus' : 'fas fa-circle-check'} aria-hidden="true"></i>
                  <span>
                    <strong>{task.name || localize('FABRICATE.Admin.Environments.NewTaskName')}</strong>
                    <small>{taskSummary(task)}</small>
                  </span>
                </button>
                <span class="manager-v2-task-rail-handle" aria-hidden="true"><i class="fas fa-grip-lines"></i></span>
                <EnvironmentActionMenu
                  actions={[
                    { key: 'move-up', label: localize('FABRICATE.Admin.Environments.MoveUp'), icon: 'fas fa-arrow-up', disabled: index === 0 || !onMoveTask, onSelect: () => onMoveTask?.(task.id, 'up') },
                    { key: 'move-down', label: localize('FABRICATE.Admin.Environments.MoveDown'), icon: 'fas fa-arrow-down', disabled: index === tasks.length - 1 || !onMoveTask, onSelect: () => onMoveTask?.(task.id, 'down') },
                    { key: 'duplicate', label: localize('FABRICATE.Admin.Environments.DuplicateTaskNamed', { name: task.name || localize('FABRICATE.Admin.Environments.NewTaskName') }), icon: 'fas fa-copy', disabled: !onDuplicateTask, onSelect: () => onDuplicateTask?.(task.id) },
                    { key: 'delete', label: localize('FABRICATE.Admin.Environments.DeleteTaskNamed', { name: task.name || localize('FABRICATE.Admin.Environments.NewTaskName') }), icon: 'fas fa-trash', danger: true, disabled: !onDeleteTask, onSelect: () => onDeleteTask?.(task.id) }
                  ]}
                  triggerLabel={localize('FABRICATE.Admin.Environments.TaskActionsFor', { name: task.name || localize('FABRICATE.Admin.Environments.NewTaskName') })}
                />
              </div>
            {/each}
          </div>
        {:else}
          <div class="manager-v2-empty compact">
            <i class="fas fa-list-check" aria-hidden="true"></i>
            <h3>{localize('FABRICATE.Admin.Environments.NoTasks')}</h3>
            <p>{localize('FABRICATE.Admin.Environments.NoTasksHint')}</p>
            <button type="button" class="manager-v2-button is-primary" data-environment-empty-action="add-task" onclick={() => onAddTask?.()}>
              <i class="fas fa-plus" aria-hidden="true"></i>
              <span>{localize('FABRICATE.Admin.Environments.AddTask')}</span>
            </button>
          </div>
        {/if}
      </aside>

      <section class="manager-v2-environment-task-editor" aria-label={text('FABRICATE.Admin.ManagerV2.Environment.SelectedTaskEditor', 'Selected task editor')}>
        {#if activeTask}
          <div class="manager-v2-task-editor-header">
            <img src={activeTask.img || 'icons/svg/item-bag.svg'} alt="" />
            <div>
              <p class="manager-v2-kicker">{taskResolutionModeLabel(activeTask)}</p>
              <h3>{activeTask.name || localize('FABRICATE.Admin.Environments.NewTaskName')}</h3>
              <div class="manager-v2-chip-row">
                <span class={`manager-v2-chip ${activeTask.enabled === false ? 'is-disabled' : 'is-active'}`}>{taskEnabledLabel(activeTask)}</span>
                <span class="manager-v2-chip">{taskTimeLabel(activeTask)}</span>
                {#if invalidTaskIds.has(activeTask.id)}
                  <span class="manager-v2-chip is-danger">{localize('FABRICATE.Admin.Environments.Invalid')}</span>
                {/if}
              </div>
            </div>
            <EnvironmentActionMenu
              actions={activeTaskActions()}
              triggerLabel={localize('FABRICATE.Admin.Environments.TaskActionsFor', { name: activeTask.name || localize('FABRICATE.Admin.Environments.NewTaskName') })}
            />
          </div>

          <div class="manager-v2-task-tabs" role="tablist" aria-label={text('FABRICATE.Admin.ManagerV2.Environment.TaskTabs', 'Task editor tabs')}>
            {#each taskTabs as tab (tab.id)}
              <button
                type="button"
                role="tab"
                class:active={activeTaskTab === tab.id}
                data-environment-invalid={taskTabInvalid(tab.id) ? 'true' : undefined}
                aria-selected={activeTaskTab === tab.id}
                onclick={() => { activeTaskTab = tab.id; }}
              >
                <i class={tab.icon} aria-hidden="true"></i>
                <span>{text(tab.labelKey, tab.fallback)}</span>
              </button>
            {/each}
          </div>

          <div class="manager-v2-environment-task-panel">
            {#if activeTaskTab === 'details'}
              <TaskBaseFields
                {activeTask}
                onPickImagePath={onPickImagePath ? pickTaskImagePath : null}
                sectionOpen={true}
                sectionSummary={taskBaseSummary(activeTask)}
                sectionInvalid={taskSectionInvalid('base')}
                setSectionOpen={() => {}}
                {updateTask}
                {taskField}
                {fieldInvalid}
                {fieldDescribedBy}
                {fieldErrors}
                {fieldErrorId}
              />
              <section class="environment-editor-section">
                <div class="environment-editor-section-header">
                  <div>
                    <h4>{text('FABRICATE.Admin.ManagerV2.Environment.RichTaskEconomy', 'Rich task economy')}</h4>
                    <p>{text('FABRICATE.Admin.ManagerV2.Environment.RichTaskEconomyHint', 'Configure node availability, stamina cost, risk, and attempt pacing for this gathering task.')}</p>
                  </div>
                </div>
                <div class="manager-v2-form-grid">
                  <label class="manager-v2-field">
                    <span>{text('FABRICATE.Admin.ManagerV2.Environment.TaskRisk', 'Task risk')}</span>
                    <select value={activeTask.riskOverride || ''} onchange={(event) => updateTask('riskOverride', event.target.value)}>
                      <option value="">{text('FABRICATE.Admin.ManagerV2.Environment.UseEnvironmentRisk', 'Use environment')}</option>
                      <option value="safe">{text('FABRICATE.Admin.ManagerV2.Environment.RiskSafe', 'Safe')}</option>
                      <option value="hazardous">{text('FABRICATE.Admin.ManagerV2.Environment.RiskHazardous', 'Hazardous')}</option>
                      <option value="unsafe">{text('FABRICATE.Admin.ManagerV2.Environment.RiskUnsafe', 'Unsafe')}</option>
                      <option value="extreme">{text('FABRICATE.Admin.ManagerV2.Environment.RiskExtreme', 'Extreme')}</option>
                    </select>
                  </label>
                  <label class="manager-v2-field">
                    <span>{text('FABRICATE.Admin.ManagerV2.Environment.StaminaCost', 'Stamina cost')}</span>
                    <input type="number" min="0" step="1" value={activeTask.staminaCost || 0} oninput={(event) => updateTask('staminaCost', Number(event.target.value || 0))} />
                  </label>
                  <label class="manager-v2-field">
                    <span>{text('FABRICATE.Admin.ManagerV2.Environment.NodeCurrent', 'Available nodes')}</span>
                    <input type="number" min="0" step="1" value={activeTask.nodes?.current || 0} oninput={(event) => updateTaskNodes('current', Number(event.target.value || 0))} />
                  </label>
                  <label class="manager-v2-field">
                    <span>{text('FABRICATE.Admin.ManagerV2.Environment.NodeMax', 'Max nodes')}</span>
                    <input type="number" min="0" step="1" value={activeTask.nodes?.max || 0} oninput={(event) => updateTaskNodes('max', Number(event.target.value || 0))} />
                  </label>
                  <label class="manager-v2-field">
                    <span>{text('FABRICATE.Admin.ManagerV2.Environment.DepletionTiming', 'Depletion timing')}</span>
                    <select value={activeTask.nodes?.depletionTiming || 'onStart'} onchange={(event) => updateTaskNodes('depletionTiming', event.target.value)}>
                      <option value="onStart">{text('FABRICATE.Admin.ManagerV2.Environment.DepleteOnStart', 'On start')}</option>
                      <option value="onSuccess">{text('FABRICATE.Admin.ManagerV2.Environment.DepleteOnSuccess', 'On success')}</option>
                    </select>
                  </label>
                  <label class="manager-v2-field">
                    <span>{text('FABRICATE.Admin.ManagerV2.Environment.RespawnPolicy', 'Respawn policy')}</span>
                    <select value={activeTask.nodes?.respawn?.policy || 'none'} onchange={(event) => updateTaskRespawn('policy', event.target.value)}>
                      <option value="none">{text('FABRICATE.Admin.ManagerV2.Environment.RespawnNone', 'None')}</option>
                      <option value="manual">{text('FABRICATE.Admin.ManagerV2.Environment.RespawnManual', 'Manual')}</option>
                      <option value="elapsedTime">{text('FABRICATE.Admin.ManagerV2.Environment.RespawnElapsed', 'Elapsed time')}</option>
                      <option value="probability">{text('FABRICATE.Admin.ManagerV2.Environment.RespawnProbability', 'Probability')}</option>
                      <option value="manualAndElapsedTime">{text('FABRICATE.Admin.ManagerV2.Environment.RespawnHybrid', 'Manual and elapsed')}</option>
                    </select>
                  </label>
                  <label class="manager-v2-field">
                    <span>{text('FABRICATE.Admin.ManagerV2.Environment.AttemptLimit', 'Attempt limit')}</span>
                    <input type="number" min="0" step="1" value={activeTask.attemptLimit?.max || 0} oninput={(event) => updateAttemptLimit('max', Number(event.target.value || 0))} />
                  </label>
                  <label class="manager-v2-field">
                    <span>{text('FABRICATE.Admin.ManagerV2.Environment.AttemptScope', 'Attempt scope')}</span>
                    <select value={activeTask.attemptLimit?.scope || 'actor'} onchange={(event) => updateAttemptLimit('scope', event.target.value)}>
                      <option value="actor">{text('FABRICATE.Admin.ManagerV2.Environment.ScopeActor', 'Actor')}</option>
                      <option value="user">{text('FABRICATE.Admin.ManagerV2.Environment.ScopeUser', 'User')}</option>
                      <option value="task">{text('FABRICATE.Admin.ManagerV2.Environment.ScopeTask', 'Task')}</option>
                      <option value="environment">{text('FABRICATE.Admin.ManagerV2.Environment.ScopeEnvironment', 'Environment')}</option>
                      <option value="global">{text('FABRICATE.Admin.ManagerV2.Environment.ScopeGlobal', 'Global')}</option>
                    </select>
                  </label>
                </div>
              </section>
            {:else if activeTaskTab === 'results'}
              {#if activeTask.resolutionMode === 'routed'}
                <ResultSelectionFields
                  {activeTaskResultSelection}
                  {scriptMacroOptions}
                  rollTableOptions={rollTableOptionList}
                  {selectedResultSelectionMacroMissing}
                  {selectedRollTableMissing}
                  sectionOpen={true}
                  sectionSummary={taskResolutionSummary(activeTask)}
                  sectionInvalid={taskSectionInvalid('resolution')}
                  setSectionOpen={() => {}}
                  {updateResultSelection}
                  {taskField}
                  {fieldInvalid}
                  {fieldDescribedBy}
                  {fieldErrors}
                  {fieldErrorId}
                />
              {/if}
              <ResultGroups
                {activeTask}
                {activeTaskResultGroups}
                {managedItemOptions}
                sectionOpen={true}
                sectionSummary={taskResultGroupSummary(activeTask)}
                sectionInvalid={taskSectionInvalid('resultGroups')}
                setSectionOpen={() => {}}
                {invalidResultGroupIds}
                {isResultGroupExpanded}
                {setResultGroupExpanded}
                {addResultGroup}
                {updateResultGroup}
                {deleteResultGroup}
                {moveResultGroup}
                {addResult}
                {updateResult}
                {deleteResult}
                {moveResult}
                {resultDifficulty}
                {resultGroupsField}
                {resultGroupField}
                {resultGroupResultsField}
                {resultField}
                {fieldInvalid}
                {fieldDescribedBy}
                {fieldErrors}
                {fieldErrorId}
              />
            {:else if activeTaskTab === 'catalysts'}
              <CatalystList
                {activeTaskCatalysts}
                {managedItemOptions}
                sectionOpen={true}
                sectionSummary={catalystCountLabel(activeTaskCatalysts.length)}
                sectionInvalid={taskSectionInvalid('catalysts')}
                setSectionOpen={() => {}}
                {addCatalyst}
                {updateCatalyst}
                {deleteCatalyst}
                {catalystField}
                {fieldInvalid}
                {fieldDescribedBy}
                {fieldErrors}
                {fieldErrorId}
              />
            {:else if activeTaskTab === 'visibility'}
              <VisibilityFields
                {editorVisibility}
                {scriptMacroOptions}
                {selectedVisibilityMacroMissing}
                sectionOpen={true}
                sectionSummary={taskVisibilityLabel(activeTask)}
                sectionInvalid={taskSectionInvalid('visibility')}
                setSectionOpen={() => {}}
                {toggleVisibility}
                {updateVisibilityProvider}
                {updateVisibilityField}
                {taskField}
                {fieldInvalid}
                {fieldDescribedBy}
                {fieldErrors}
                {fieldErrorId}
              />
            {:else if activeTaskTab === 'timing'}
              <TimeRequirementFields
                {timeUnits}
                {activeTaskTimeRequirement}
                sectionOpen={true}
                sectionSummary={taskTimeLabel(activeTask)}
                sectionInvalid={taskSectionInvalid('time')}
                setSectionOpen={() => {}}
                {toggleTimeRequirement}
                {updateTimeRequirement}
                {taskField}
                {fieldInvalid}
                {fieldDescribedBy}
                {fieldErrors}
                {fieldErrorId}
              />
              <FailureOutcomeFields
                {activeTaskFailureOutcome}
                {scriptMacroOptions}
                {selectedFailureMacroMissing}
                sectionOpen={true}
                sectionSummary={taskFailureSummary(activeTask)}
                sectionInvalid={taskSectionInvalid('failure')}
                setSectionOpen={() => {}}
                {toggleFailureOutcome}
                {updateFailureOutcome}
                {taskField}
                {fieldInvalid}
                {fieldDescribedBy}
                {fieldErrors}
                {fieldErrorId}
              />
            {:else if activeTaskTab === 'check'}
              {#if activeTask.resolutionMode === 'progressive'}
                <ProgressiveFields
                  {activeTaskProgressive}
                  {activeTaskCheck}
                  {scriptMacroOptions}
                  {selectedCheckMacroMissing}
                  sectionOpen={true}
                  sectionSummary={taskCheckSummary(activeTask)}
                  sectionInvalid={taskSectionInvalid('check')}
                  setSectionOpen={() => {}}
                  {updateProgressive}
                  {updateCheck}
                  {taskField}
                  {fieldInvalid}
                  {fieldDescribedBy}
                  {fieldErrors}
                  {fieldErrorId}
                />
              {:else}
                <div class="manager-v2-empty compact">
                  <i class="fas fa-dice-d20" aria-hidden="true"></i>
                  <h3>{text('FABRICATE.Admin.ManagerV2.Environment.NoCheckTaskFields', 'No check fields')}</h3>
                  <p>{text('FABRICATE.Admin.ManagerV2.Environment.NoCheckTaskFieldsHint', 'Routed tasks use result selection from the Results tab.')}</p>
                </div>
              {/if}
            {/if}
          </div>
        {:else}
          <div class="manager-v2-empty compact">
            <i class="fas fa-list-check" aria-hidden="true"></i>
            <h3>{localize('FABRICATE.Admin.Environments.NoTasks')}</h3>
            <p>{localize('FABRICATE.Admin.Environments.NoTasksHint')}</p>
          </div>
        {/if}
      </section>

    </section>
  {:else}
    <div class="manager-v2-empty">
      <i class="fas fa-seedling" aria-hidden="true"></i>
      <h3>{text('FABRICATE.Admin.ManagerV2.Environment.SelectEnvironment', 'Select an environment')}</h3>
      <p>{text('FABRICATE.Admin.ManagerV2.Environment.InspectorHint', 'The inspector shows scene imagery, task evidence, draft state, and existing actions for the selected row.')}</p>
    </div>
  {/if}
</form>
