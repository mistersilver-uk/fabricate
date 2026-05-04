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
    onPickImagePath,
    onUpdateEnvironment,
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
    { id: 'advanced', section: 'check', icon: 'fas fa-sliders-h', labelKey: 'FABRICATE.Admin.ManagerV2.Environment.TaskTabAdvanced', fallback: 'Advanced' }
  ];

  let localSelectedTaskId = $state('');
  let detailsTab = $state('details');
  let activeTaskTab = $state('details');
  let pendingVisibility = $state(null);
  let pendingVisibilityKey = $state('');
  let expandedResultGroups = $state({});
  let lastValidationFocusAttempt = $state(0);

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
      focusValidationError(validationState.firstInvalidField);
    }
  });

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

  function environmentSelectionModeLabel() {
    return environmentDraft?.selectionMode === 'blind'
      ? text('FABRICATE.Admin.Environments.SelectionBlind', 'Blind')
      : text('FABRICATE.Admin.Environments.SelectionTargeted', 'Targeted');
  }

  function taskResultCount(task) {
    return (Array.isArray(task?.resultGroups) ? task.resultGroups : [])
      .reduce((total, group) => total + (Array.isArray(group?.results) ? group.results.length : 0), 0);
  }

  function environmentResultCount() {
    return tasks.reduce((total, task) => total + taskResultCount(task), 0);
  }

  function environmentCatalystCount() {
    return tasks.reduce((total, task) => total + (Array.isArray(task?.catalysts) ? task.catalysts.length : 0), 0);
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
    if (sectionKey === 'check') return 'advanced';
    return 'details';
  }

  function taskTabInvalid(tabId) {
    if (!activeTask?.id) return false;
    return normalizedValidationErrors.some(error => error.taskId === activeTask.id && taskTabForSection(error.sectionKey) === tabId);
  }

  function environmentDetailsTabForPath(path) {
    if (String(path || '').startsWith('environment.sceneUuid')) return 'advanced';
    if (String(path || '').startsWith('environment.')) return 'details';
    return detailsTab;
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
    } else {
      detailsTab = environmentDetailsTabForPath(error?.path);
    }
  }

  function updateField(field, value) {
    onUpdateEnvironment?.({ [field]: value });
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
          <p class="manager-v2-kicker">{isNew ? text('FABRICATE.Admin.Environments.NewDraftTitle', 'New Gathering Environment') : text('FABRICATE.Admin.ManagerV2.Environment.EditKicker', 'Environment Edit')}</p>
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

      <div class="manager-v2-environment-details-tabs" role="tablist" aria-label={text('FABRICATE.Admin.ManagerV2.Environment.DetailTabs', 'Environment detail sections')}>
        <button type="button" role="tab" class:active={detailsTab === 'details'} aria-selected={detailsTab === 'details'} onclick={() => { detailsTab = 'details'; }}>{text('FABRICATE.Admin.ManagerV2.Environment.EnvironmentDetailsTab', 'Environment Details')}</button>
        <button type="button" role="tab" class:active={detailsTab === 'advanced'} aria-selected={detailsTab === 'advanced'} onclick={() => { detailsTab = 'advanced'; }}>{text('FABRICATE.Admin.ManagerV2.Environment.AdvancedTab', 'Advanced')}</button>
      </div>

      <div class="manager-v2-environment-details-grid">
        <div class="manager-v2-environment-fields-card">
          {#if detailsTab === 'details'}
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
              <label class="manager-v2-toggle-row span-2">
                <input type="checkbox" checked={environmentDraft.enabled} onchange={(event) => updateField('enabled', event.target.checked)} />
                <span>
                  <strong>{localize('FABRICATE.Admin.Environments.Enabled')}</strong>
                  <small>{environmentDraft.enabled ? text('FABRICATE.Admin.ManagerV2.StatusActive', 'Active') : text('FABRICATE.Admin.ManagerV2.StatusDisabled', 'Disabled')}</small>
                </span>
              </label>
            </div>
          {:else}
            <div class="manager-v2-form-grid">
              <label class="manager-v2-field span-2">
                <span>{localize('FABRICATE.Admin.Environments.SceneUuid')}</span>
                <select
                  value={environmentDraft.sceneUuid || ''}
                  aria-label={localize('FABRICATE.Admin.Environments.SceneSelect')}
                  aria-describedby={selectedSceneMissing ? 'manager-v2-environment-scene-reference-warning' : undefined}
                  onchange={(event) => updateField('sceneUuid', event.target.value)}
                >
                  <option value="">{localize('FABRICATE.Admin.Environments.NoSceneSelected')}</option>
                  {#if selectedSceneMissing}
                    <option value={environmentDraft.sceneUuid}>{localize('FABRICATE.Admin.Environments.MissingReferenceOption', { uuid: environmentDraft.sceneUuid })}</option>
                  {/if}
                  {#each sceneOptionList as scene (scene.uuid)}
                    <option value={scene.uuid}>{scene.name}</option>
                  {/each}
                </select>
              </label>
              <label class="manager-v2-field span-2">
                <span>{text('FABRICATE.Admin.ManagerV2.Environment.RawSceneUuid', 'Raw Scene UUID')}</span>
                <input
                  type="text"
                  value={environmentDraft.sceneUuid || ''}
                  placeholder="Scene.xxxxxxxxxxxxxxxx"
                  data-environment-field={environmentField('sceneUuid')}
                  aria-invalid={fieldInvalid(environmentField('sceneUuid'))}
                  aria-describedby={fieldDescribedBy(environmentField('sceneUuid'), selectedSceneMissing ? 'manager-v2-environment-scene-reference-warning' : '')}
                  oninput={(event) => updateField('sceneUuid', event.target.value)}
                />
                {#if selectedSceneMissing}
                  <span class="environment-stale-warning" id="manager-v2-environment-scene-reference-warning">
                    {localize('FABRICATE.Admin.Environments.LinkedSceneReferenceWarning')}
                  </span>
                {/if}
                {#if fieldErrors(environmentField('sceneUuid')).length > 0}
                  <span class="environment-field-error" id={fieldErrorId(environmentField('sceneUuid'))}>{fieldErrors(environmentField('sceneUuid'))[0].message}</span>
                {/if}
              </label>
            </div>
          {/if}
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
          <div class="manager-v2-scene-actions">
            <select
              value={environmentDraft.sceneUuid || ''}
              data-environment-field={environmentField('sceneUuid')}
              aria-label={localize('FABRICATE.Admin.Environments.SceneSelect')}
              onchange={(event) => updateField('sceneUuid', event.target.value)}
            >
              <option value="">{localize('FABRICATE.Admin.Environments.NoSceneSelected')}</option>
              {#each sceneOptionList as scene (scene.uuid)}
                <option value={scene.uuid}>{scene.name}</option>
              {/each}
            </select>
            <button type="button" class="manager-v2-button" onclick={() => updateField('sceneUuid', '')} disabled={!environmentDraft.sceneUuid}>
              <i class="fas fa-unlink" aria-hidden="true"></i>
              <span>{text('FABRICATE.Admin.ManagerV2.Environment.UnlinkScene', 'Unlink')}</span>
            </button>
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
            {:else}
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
                  <i class="fas fa-sliders-h" aria-hidden="true"></i>
                  <h3>{text('FABRICATE.Admin.ManagerV2.Environment.NoAdvancedTaskFields', 'No advanced fields')}</h3>
                  <p>{text('FABRICATE.Admin.ManagerV2.Environment.NoAdvancedTaskFieldsHint', 'Progressive check controls appear here for progressive tasks.')}</p>
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

      <aside class="manager-v2-environment-evidence-column" aria-label={text('FABRICATE.Admin.ManagerV2.Environment.EvidenceColumn', 'Environment evidence')}>
        <section class="manager-v2-inspector-card">
          <h3 class="manager-v2-card-title">{text('FABRICATE.Admin.ManagerV2.Environment.Summary', 'Environment summary')}</h3>
          <div class="manager-v2-fact-grid">
            <div class="manager-v2-fact"><strong>{tasks.length}</strong><span>{localize('FABRICATE.Admin.Environments.Tasks')}</span></div>
            <div class="manager-v2-fact"><strong>{environmentResultCount()}</strong><span>{localize('FABRICATE.Admin.Environments.Results')}</span></div>
            <div class="manager-v2-fact"><strong>{environmentCatalystCount()}</strong><span>{localize('FABRICATE.Admin.Environments.Catalysts')}</span></div>
            <div class="manager-v2-fact"><strong>{environmentSelectionModeLabel()}</strong><span>{localize('FABRICATE.Admin.Environments.SelectionMode')}</span></div>
          </div>
        </section>

        <section class="manager-v2-inspector-card">
          <h3 class="manager-v2-card-title">{text('FABRICATE.Admin.ManagerV2.Environment.Validation', 'Validation')}</h3>
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
        </section>

        {#if activeTask}
          <section class="manager-v2-inspector-card">
            <h3 class="manager-v2-card-title">{text('FABRICATE.Admin.ManagerV2.Environment.SelectedTask', 'Selected task')}</h3>
            <div class="manager-v2-chip-row">
              <span class={`manager-v2-chip ${activeTask.enabled === false ? 'is-disabled' : 'is-active'}`}>{taskEnabledLabel(activeTask)}</span>
              <span class="manager-v2-chip">{taskResolutionModeLabel(activeTask)}</span>
              <span class="manager-v2-chip">{taskTimeLabel(activeTask)}</span>
            </div>
            <p class="manager-v2-muted">{activeTask.description || text('FABRICATE.Admin.ManagerV2.NoDescriptionAdded', 'No description has been added.')}</p>
            <div class="manager-v2-fact-grid">
              <div class="manager-v2-fact"><strong>{activeTaskResultGroups.length}</strong><span>{localize('FABRICATE.Admin.Environments.ResultGroups')}</span></div>
              <div class="manager-v2-fact"><strong>{taskResultCount(activeTask)}</strong><span>{localize('FABRICATE.Admin.Environments.Results')}</span></div>
              <div class="manager-v2-fact"><strong>{activeTaskCatalysts.length}</strong><span>{localize('FABRICATE.Admin.Environments.Catalysts')}</span></div>
              <div class="manager-v2-fact"><strong>{taskVisibilityLabel(activeTask)}</strong><span>{localize('FABRICATE.Admin.Environments.Visibility')}</span></div>
            </div>
          </section>
        {/if}
      </aside>
    </section>
  {:else}
    <div class="manager-v2-empty">
      <i class="fas fa-seedling" aria-hidden="true"></i>
      <h3>{text('FABRICATE.Admin.ManagerV2.Environment.SelectEnvironment', 'Select an environment')}</h3>
      <p>{text('FABRICATE.Admin.ManagerV2.Environment.InspectorHint', 'The inspector shows scene imagery, task evidence, draft state, and existing actions for the selected row.')}</p>
    </div>
  {/if}
</form>
