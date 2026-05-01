<!-- Svelte 5 runes mode -->
<script>
  import { tick } from 'svelte';
  import { localize } from '../util/foundryBridge.js';
  import CatalystList from './environments/CatalystList.svelte';
  import EnvironmentActionMenu from './environments/EnvironmentActionMenu.svelte';
  import EnvironmentFields from './environments/EnvironmentFields.svelte';
  import EnvironmentList from './environments/EnvironmentList.svelte';
  import EnvironmentValidationFeedback from './environments/EnvironmentValidationFeedback.svelte';
  import FailureOutcomeFields from './environments/FailureOutcomeFields.svelte';
  import ProgressiveFields from './environments/ProgressiveFields.svelte';
  import ResultGroups from './environments/ResultGroups.svelte';
  import ResultSelectionFields from './environments/ResultSelectionFields.svelte';
  import TaskBaseFields from './environments/TaskBaseFields.svelte';
  import TaskList from './environments/TaskList.svelte';
  import TimeRequirementFields from './environments/TimeRequirementFields.svelte';
  import VisibilityFields from './environments/VisibilityFields.svelte';

  let {
    environments = [],
    environmentDraft = null,
    dirty = false,
    isNew = false,
    saving = false,
    saveError = null,
    validationState = null,
    loading = false,
    error = null,
    onSelectEnvironment,
    onCreateEnvironment,
    onUpdateEnvironment,
    onCancelEnvironment,
    onSaveEnvironment,
    onDuplicateEnvironment,
    onDeleteEnvironment,
    onToggleEnvironmentEnabled,
    onMoveEnvironment,
    selectedTaskId = '',
    onAddTask,
    onSelectTask,
    onUpdateTask,
    onDuplicateTask,
    onDeleteTask,
    onMoveTask,
    managedItemOptions = [],
    availableScriptMacros = [],
    sceneOptions = [],
    rollTableOptions = [],
    onPickImagePath,
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

  let localSelectedTaskId = $state('');
  let editorOpen = $state(false);

  const tasks = $derived(Array.isArray(environmentDraft?.tasks) ? environmentDraft.tasks : []);
  const backToGridLabel = $derived(localize('FABRICATE.Admin.Environments.BackToEnvironmentGrid') || 'Back to environments');
  const activeTaskId = $derived(selectedTaskId || localSelectedTaskId);
  const activeTask = $derived(tasks.find(task => task.id === activeTaskId) || null);
  const activeTaskIndex = $derived(tasks.findIndex(task => task.id === activeTaskId));
  const selectedEnvironmentIndex = $derived(
    environments.findIndex(environment => environment.id === environmentDraft?.id)
  );
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
  let pendingVisibility = $state(null);
  let pendingVisibilityKey = $state('');
  let expandedTaskSections = $state({});
  let expandedResultGroups = $state({});
  let lastValidationFocusAttempt = $state(0);
  let lastEnvironmentDraftSystemId = $state(null);
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
  const taskSummaries = $derived(new Map(tasks.map(task => [task.id, taskSummary(task)])));
  const selectedVisibilityMacroMissing = $derived(
    Boolean(editorVisibility?.macroUuid) &&
      !scriptMacroOptions.some(macro => macro.uuid === editorVisibility.macroUuid)
  );
  const selectedResultSelectionMacroMissing = $derived(
    Boolean(activeTaskResultSelection?.macroUuid) &&
      !scriptMacroOptions.some(macro => macro.uuid === activeTaskResultSelection.macroUuid)
  );
  const selectedCheckMacroMissing = $derived(
    Boolean(activeTaskCheck?.macroUuid) &&
      !scriptMacroOptions.some(macro => macro.uuid === activeTaskCheck.macroUuid)
  );
  const selectedFailureMacroMissing = $derived(
    Boolean(activeTaskFailureOutcome?.macroUuid) &&
      !scriptMacroOptions.some(macro => macro.uuid === activeTaskFailureOutcome.macroUuid)
  );
  const selectedSceneMissing = $derived(
    Boolean(environmentDraft?.sceneUuid) &&
      !sceneOptionList.some(scene => scene.uuid === environmentDraft.sceneUuid)
  );
  const selectedRollTableMissing = $derived(
    activeTaskResultSelection?.provider === 'rollTableOutcome' &&
      Boolean(activeTaskResultSelection?.rollTableUuid) &&
      !rollTableOptionList.some(table => table.uuid === activeTaskResultSelection.rollTableUuid)
  );

  $effect(() => {
    const nextSystemId = environmentDraft?.craftingSystemId || '';
    if (lastEnvironmentDraftSystemId === null) {
      lastEnvironmentDraftSystemId = nextSystemId;
      return;
    }
    if (lastEnvironmentDraftSystemId && nextSystemId && nextSystemId !== lastEnvironmentDraftSystemId) {
      editorOpen = false;
    }
    lastEnvironmentDraftSystemId = nextSystemId;
  });

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

  function taskCountLabel(environment) {
    const count = Array.isArray(environment?.tasks) ? environment.tasks.length : 0;
    return localize('FABRICATE.Admin.Environments.TaskCount', { count });
  }

  function createEnvironment() {
    const draft = onCreateEnvironment?.();
    if (draft && typeof draft.then === 'function') {
      draft.then(result => {
        if (result !== null && result !== false) editorOpen = true;
      });
      return;
    }
    if (draft !== null && draft !== false) {
      editorOpen = true;
    }
  }

  function editEnvironment(environmentId) {
    if (!environmentId) return;
    const selected = onSelectEnvironment?.(environmentId);
    if (selected && typeof selected.then === 'function') {
      selected.then(result => {
        if (result !== false) editorOpen = true;
      });
      return;
    }
    if (selected !== false) {
      editorOpen = true;
    }
  }

  function showEnvironmentGrid() {
    editorOpen = false;
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
      taskEnabledLabel(task),
      taskResolutionModeLabel(task),
      taskTimeLabel(task),
      taskVisibilityLabel(task),
      catalystCountLabel(catalysts.length),
      resultGroupCountLabel(groups.length),
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

  function isTaskSectionExpanded(sectionKey) {
    const sectionId = taskSectionId(activeTask?.id, sectionKey);
    if (!sectionId) return true;
    return expandedTaskSections[sectionId] ?? true;
  }

  function setTaskSectionExpanded(sectionKey, open) {
    const sectionId = taskSectionId(activeTask?.id, sectionKey);
    if (!sectionId) return;
    expandedTaskSections = { ...expandedTaskSections, [sectionId]: Boolean(open) };
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
    return {
      ...error,
      taskId,
      sectionKey,
      resultGroupId
    };
  }

  function revealValidationTarget(error) {
    const target = normalizedValidationTarget(error);
    if (target.taskId) {
      if (target.taskId !== activeTaskId) selectTask(target.taskId);
      if (target.sectionKey) {
        expandedTaskSections = {
          ...expandedTaskSections,
          [taskSectionId(target.taskId, target.sectionKey)]: true
        };
      }
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

  function selectTask(taskId) {
    localSelectedTaskId = taskId;
    onSelectTask?.(taskId);
  }

  function addTask() {
    onAddTask?.();
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
    const root = documentRef?.querySelector?.('.environment-draft-editor');
    const target = root?.querySelector?.(error.fieldSelector) || documentRef?.querySelector?.(error.fieldSelector);
    if (!target) return;
    target.scrollIntoView?.({ block: 'center', inline: 'nearest' });
    target.focus?.({ preventScroll: true });
  }

  function duplicateTask(taskId = activeTask?.id) {
    if (!taskId) return;
    onDuplicateTask?.(taskId);
  }

  function deleteTask(taskId = activeTask?.id) {
    if (!taskId) return;
    onDeleteTask?.(taskId);
  }

  function moveTask(taskId, direction) {
    if (!taskId) return;
    onMoveTask?.(taskId, direction);
  }

  function selectedEnvironmentActions() {
    const environmentId = environmentDraft?.id || '';
    const name = environmentDraft?.name || localize('FABRICATE.Admin.Environments.NewDraftTitle');
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

  function activeTaskActions() {
    const taskId = activeTask?.id || '';
    const name = activeTask?.name || localize('FABRICATE.Admin.Environments.NewTaskName');
    return [
      {
        key: 'move-up',
        label: localize('FABRICATE.Admin.Environments.MoveUp'),
        icon: 'fas fa-arrow-up',
        disabled: !taskId || activeTaskIndex <= 0 || !onMoveTask,
        onSelect: () => moveTask(taskId, 'up')
      },
      {
        key: 'move-down',
        label: localize('FABRICATE.Admin.Environments.MoveDown'),
        icon: 'fas fa-arrow-down',
        disabled: !taskId || activeTaskIndex < 0 || activeTaskIndex >= tasks.length - 1 || !onMoveTask,
        onSelect: () => moveTask(taskId, 'down')
      },
      {
        key: 'duplicate',
        label: localize('FABRICATE.Admin.Environments.DuplicateTaskNamed', { name }),
        icon: 'fas fa-copy',
        disabled: !taskId || !onDuplicateTask,
        onSelect: () => duplicateTask(taskId)
      },
      {
        key: 'delete',
        label: localize('FABRICATE.Admin.Environments.DeleteTaskNamed', { name }),
        icon: 'fas fa-trash',
        danger: true,
        disabled: !taskId || !onDeleteTask,
        onSelect: () => deleteTask(taskId)
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
    if (config?.provider === 'macro') {
      return Boolean(String(config.macroUuid ?? '').trim());
    }
    if (config?.provider === 'dnd5e' || config?.provider === 'pf2e') {
      return Boolean(String(config.formula ?? '').trim()) && Boolean(String(config.threshold ?? '').trim());
    }
    return false;
  }

  function defaultVisibilityForProvider(provider) {
    const source = editorVisibility || activeTaskVisibility || {};
    if (provider === 'dnd5e' || provider === 'pf2e') {
      return {
        provider,
        formula: source.formula || '',
        threshold: source.threshold || ''
      };
    }
    return {
      provider: 'macro',
      macroUuid: source.macroUuid || scriptMacroOptions[0]?.uuid || ''
    };
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
      if (activeTaskVisibility) {
        updateVisibility(null);
      }
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

<section class="admin-panel environments-panel">
  <div class="panel-toolbar">
    <h3>{localize('FABRICATE.Admin.Environments.Title')}</h3>
    <button type="button" onclick={createEnvironment}>
      <i class="fas fa-plus"></i> {localize('FABRICATE.Admin.Environments.NewEnvironment')}
    </button>
  </div>

  {#if loading}
    <div class="fabricate-empty">
      <i class="fas fa-spinner fa-spin"></i>
      <h3>{localize('FABRICATE.Admin.Environments.Loading')}</h3>
    </div>
  {:else if error}
    <div class="fabricate-empty">
      <i class="fas fa-exclamation-triangle"></i>
      <h3>{localize('FABRICATE.Admin.Environments.ErrorTitle')}</h3>
      <p>{error}</p>
    </div>
  {:else if environments.length === 0 && !environmentDraft}
    <div class="fabricate-empty">
      <i class="fas fa-seedling"></i>
      <h3>{localize('FABRICATE.Admin.Environments.EmptyTitle')}</h3>
      <p>{localize('FABRICATE.Admin.Environments.EmptyHint')}</p>
      <button
        type="button"
        class="btn-primary"
        data-environment-empty-action="create-environment"
        title={localize('FABRICATE.Admin.Environments.EmptyActionHint')}
        onclick={createEnvironment}
      >
        <i class="fas fa-plus"></i> {localize('FABRICATE.Admin.Environments.NewEnvironment')}
      </button>
    </div>
  {:else}
    <div class="environment-foundation" data-environment-view={editorOpen ? 'editor' : 'grid'}>
      {#if !editorOpen}
      <EnvironmentValidationFeedback
        validationErrors={[]}
        validationState={null}
        {saveError}
        {focusValidationError}
      />
      <EnvironmentList
        {environments}
        selectedEnvironmentId={environmentDraft?.id || ''}
        sceneOptions={sceneOptionList}
        {taskCountLabel}
        onEditEnvironment={editEnvironment}
        {onToggleEnvironmentEnabled}
        {onMoveEnvironment}
        {onDuplicateEnvironment}
        {onDeleteEnvironment}
      />
      {:else}
      <form class="environment-draft-editor" onsubmit={(event) => { event.preventDefault(); onSaveEnvironment?.(); }}>
        {#if environmentDraft}
          <div class="environment-editor-header">
            <div>
              <button type="button" class="environment-back-button" data-environment-action="back-to-grid" aria-label={backToGridLabel} onclick={showEnvironmentGrid}>
                {backToGridLabel}
              </button>
              <h4>{isNew ? localize('FABRICATE.Admin.Environments.NewDraftTitle') : environmentDraft.name}</h4>
              {#if dirty}
                <span class="badge badge-advanced">{localize('FABRICATE.Admin.Environments.Unsaved')}</span>
              {/if}
            </div>
            <div class="environment-editor-actions">
              <EnvironmentActionMenu
                actions={selectedEnvironmentActions()}
                triggerLabel={localize('FABRICATE.Admin.Environments.ActionsForEnvironment', { name: environmentDraft.name || localize('FABRICATE.Admin.Environments.NewDraftTitle') })}
              />
            </div>
          </div>

          <EnvironmentValidationFeedback
            {validationErrors}
            {validationState}
            {saveError}
            {focusValidationError}
          />

          <EnvironmentFields
            {environmentDraft}
            sceneOptions={sceneOptionList}
            {selectedSceneMissing}
            {updateField}
            {environmentField}
            {fieldInvalid}
            {fieldDescribedBy}
            {fieldErrors}
            {fieldErrorId}
          />

          <section class="environment-task-authoring" aria-label={localize('FABRICATE.Admin.Environments.Tasks')}>
            <div class="environment-task-header">
              <h5>{localize('FABRICATE.Admin.Environments.Tasks')}</h5>
              <button type="button" onclick={addTask}>
                <i class="fas fa-plus"></i> {localize('FABRICATE.Admin.Environments.AddTask')}
              </button>
            </div>

            {#if tasks.length > 0}
              <div class="environment-task-layout">
                <TaskList
                  {tasks}
                  {activeTaskId}
                  {taskSummaries}
                  {invalidTaskIds}
                  {selectTask}
                  {moveTask}
                  {duplicateTask}
                  {deleteTask}
                />

                {#if activeTask}
                  <div class="environment-task-editor">
                    <div class="environment-task-editor-header">
                      <img src={activeTask.img || 'icons/svg/item-bag.svg'} alt={activeTask.name} />
                      <div class="environment-editor-actions">
                        <EnvironmentActionMenu
                          actions={activeTaskActions()}
                          triggerLabel={localize('FABRICATE.Admin.Environments.TaskActionsFor', { name: activeTask.name || localize('FABRICATE.Admin.Environments.NewTaskName') })}
                        />
                      </div>
                    </div>

                    <TaskBaseFields
                      {activeTask}
                      onPickImagePath={onPickImagePath ? pickTaskImagePath : null}
                      sectionOpen={isTaskSectionExpanded('base')}
                      sectionSummary={taskBaseSummary(activeTask)}
                      sectionInvalid={taskSectionInvalid('base')}
                      setSectionOpen={(open) => setTaskSectionExpanded('base', open)}
                      {updateTask}
                      {taskField}
                      {fieldInvalid}
                      {fieldDescribedBy}
                      {fieldErrors}
                      {fieldErrorId}
                    />

                    <TimeRequirementFields
                      {timeUnits}
                      {activeTaskTimeRequirement}
                      sectionOpen={isTaskSectionExpanded('time')}
                      sectionSummary={taskTimeLabel(activeTask)}
                      sectionInvalid={taskSectionInvalid('time')}
                      setSectionOpen={(open) => setTaskSectionExpanded('time', open)}
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
                      sectionOpen={isTaskSectionExpanded('failure')}
                      sectionSummary={taskFailureSummary(activeTask)}
                      sectionInvalid={taskSectionInvalid('failure')}
                      setSectionOpen={(open) => setTaskSectionExpanded('failure', open)}
                      {toggleFailureOutcome}
                      {updateFailureOutcome}
                      {taskField}
                      {fieldInvalid}
                      {fieldDescribedBy}
                      {fieldErrors}
                      {fieldErrorId}
                    />

                    {#if activeTask.resolutionMode === 'routed'}
                      <ResultSelectionFields
                        {activeTaskResultSelection}
                        {scriptMacroOptions}
                        rollTableOptions={rollTableOptionList}
                        {selectedResultSelectionMacroMissing}
                        {selectedRollTableMissing}
                        sectionOpen={isTaskSectionExpanded('resolution')}
                        sectionSummary={taskResolutionSummary(activeTask)}
                        sectionInvalid={taskSectionInvalid('resolution')}
                        setSectionOpen={(open) => setTaskSectionExpanded('resolution', open)}
                        {updateResultSelection}
                        {taskField}
                        {fieldInvalid}
                        {fieldDescribedBy}
                        {fieldErrors}
                        {fieldErrorId}
                      />
                    {/if}

                    {#if activeTask.resolutionMode === 'progressive'}
                      <ProgressiveFields
                        {activeTaskProgressive}
                        {activeTaskCheck}
                        {scriptMacroOptions}
                        {selectedCheckMacroMissing}
                        sectionOpen={isTaskSectionExpanded('check')}
                        sectionSummary={taskCheckSummary(activeTask)}
                        sectionInvalid={taskSectionInvalid('check')}
                        setSectionOpen={(open) => setTaskSectionExpanded('check', open)}
                        {updateProgressive}
                        {updateCheck}
                        {taskField}
                        {fieldInvalid}
                        {fieldDescribedBy}
                        {fieldErrors}
                        {fieldErrorId}
                      />
                    {/if}

                    <VisibilityFields
                      {editorVisibility}
                      {scriptMacroOptions}
                      {selectedVisibilityMacroMissing}
                      sectionOpen={isTaskSectionExpanded('visibility')}
                      sectionSummary={taskVisibilityLabel(activeTask)}
                      sectionInvalid={taskSectionInvalid('visibility')}
                      setSectionOpen={(open) => setTaskSectionExpanded('visibility', open)}
                      {toggleVisibility}
                      {updateVisibilityProvider}
                      {updateVisibilityField}
                      {taskField}
                      {fieldInvalid}
                      {fieldDescribedBy}
                      {fieldErrors}
                      {fieldErrorId}
                    />

                    <CatalystList
                      {activeTaskCatalysts}
                      {managedItemOptions}
                      sectionOpen={isTaskSectionExpanded('catalysts')}
                      sectionSummary={catalystCountLabel(activeTaskCatalysts.length)}
                      sectionInvalid={taskSectionInvalid('catalysts')}
                      setSectionOpen={(open) => setTaskSectionExpanded('catalysts', open)}
                      {addCatalyst}
                      {updateCatalyst}
                      {deleteCatalyst}
                      {catalystField}
                      {fieldInvalid}
                      {fieldDescribedBy}
                      {fieldErrors}
                      {fieldErrorId}
                    />

                    <ResultGroups
                      {activeTask}
                      {activeTaskResultGroups}
                      {managedItemOptions}
                      sectionOpen={isTaskSectionExpanded('resultGroups')}
                      sectionSummary={taskResultGroupSummary(activeTask)}
                      sectionInvalid={taskSectionInvalid('resultGroups')}
                      setSectionOpen={(open) => setTaskSectionExpanded('resultGroups', open)}
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
                  </div>
                {/if}
              </div>
            {:else}
              <div class="environment-empty-action">
                <i class="fas fa-list-check" aria-hidden="true"></i>
                <div>
                  <strong>{localize('FABRICATE.Admin.Environments.NoTasks')}</strong>
                  <p>{localize('FABRICATE.Admin.Environments.NoTasksHint')}</p>
                </div>
                <button type="button" data-environment-empty-action="add-task" onclick={addTask}>
                  <i class="fas fa-plus"></i> {localize('FABRICATE.Admin.Environments.AddTask')}
                </button>
              </div>
            {/if}
          </section>

          <div class="environment-save-actions">
            <button type="button" onclick={() => onCancelEnvironment?.()} disabled={!dirty || saving}>
              <i class="fas fa-undo"></i> {localize('FABRICATE.Admin.Environments.Cancel')}
            </button>
            <button type="submit" class="btn-primary" disabled={!dirty || saving}>
              <i class={saving ? 'fas fa-spinner fa-spin' : 'fas fa-save'}></i> {localize('FABRICATE.Admin.Environments.Save')}
            </button>
          </div>
        {/if}
      </form>
      {/if}
    </div>
  {/if}
</section>
