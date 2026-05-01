import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const rootPath = resolve(__dirname, '../../src/ui/svelte/apps/RecipeManagerRoot.svelte');
const environmentsTabPath = resolve(__dirname, '../../src/ui/svelte/apps/EnvironmentsTab.svelte');
const environmentsComponentPaths = [
  'EnvironmentActionMenu.svelte',
  'CatalystList.svelte',
  'EnvironmentFields.svelte',
  'EnvironmentList.svelte',
  'EnvironmentValidationFeedback.svelte',
  'FailureOutcomeFields.svelte',
  'ProgressiveFields.svelte',
  'ResultGroups.svelte',
  'ResultSelectionFields.svelte',
  'TaskBaseFields.svelte',
  'TaskList.svelte',
  'TimeRequirementFields.svelte',
  'VisibilityFields.svelte'
].map(fileName => resolve(__dirname, '../../src/ui/svelte/apps/environments', fileName));
const sharedEnvironmentComponentPaths = [
  resolve(__dirname, '../../src/ui/svelte/components/ImagePathPicker.svelte')
];
const recipeManagerAppPath = resolve(__dirname, '../../src/ui/SvelteRecipeManagerApp.svelte.js');
const adminStorePath = resolve(__dirname, '../../src/ui/svelte/stores/adminStore.js');
const localePath = resolve(__dirname, '../../lang/en.json');
const stylePath = resolve(__dirname, '../../styles/fabricate.css');

const rootSource = readFileSync(rootPath, 'utf8');
const environmentsTabSource = readFileSync(environmentsTabPath, 'utf8');
const environmentsExtractedSources = environmentsComponentPaths.map(path => readFileSync(path, 'utf8'));
const sharedEnvironmentComponentSources = sharedEnvironmentComponentPaths.map(path => readFileSync(path, 'utf8'));
const environmentsComponentSource = [
  environmentsTabSource,
  ...environmentsExtractedSources,
  ...sharedEnvironmentComponentSources
].join('\n');
const recipeManagerAppSource = readFileSync(recipeManagerAppPath, 'utf8');
const adminStoreSource = readFileSync(adminStorePath, 'utf8');
const styleSource = readFileSync(stylePath, 'utf8');
const en = JSON.parse(readFileSync(localePath, 'utf8'));

function localeAt(path) {
  return path.split('.').reduce((node, segment) => node?.[segment], en);
}

describe('GM environments tab source contract', () => {
  it('renders the Environments tab conditionally from admin store state', () => {
    assert.ok(
      rootSource.includes("import EnvironmentsTab from './EnvironmentsTab.svelte';"),
      'RecipeManagerRoot should import EnvironmentsTab'
    );
    assert.ok(
      rootSource.includes("id: 'environments'") &&
        rootSource.includes('FABRICATE.Admin.Tabs.Environments'),
      'RecipeManagerRoot should define a localized environments tab'
    );
    assert.ok(
      rootSource.includes('$viewState.canShowEnvironmentsTab'),
      'RecipeManagerRoot should gate the tab through store state'
    );
    assert.ok(
      rootSource.includes("<EnvironmentsTab"),
      'RecipeManagerRoot should route activeTab=environments to EnvironmentsTab'
    );
    assert.ok(
      rootSource.includes('onSaveEnvironment={store.saveEnvironmentDraft}') &&
        rootSource.includes('onCreateEnvironment={store.createEnvironmentDraft}'),
      'RecipeManagerRoot should pass environment draft actions to EnvironmentsTab'
    );
    for (const snippet of [
      'selectedTaskId={$viewState.selectedEnvironmentTaskId}',
      'onAddTask={store.addEnvironmentTask}',
      'onSelectTask={store.selectEnvironmentTask}',
      'onUpdateTask={store.updateEnvironmentTask}',
      'onDuplicateTask={store.duplicateEnvironmentTask}',
      'onDeleteTask={store.deleteEnvironmentTask}',
      'onMoveTask={store.moveEnvironmentTask}',
      'managedItemOptions={$viewState.selectedSystem?.managedItemOptions || []}',
      'availableScriptMacros={$viewState.selectedSystem?.availableScriptMacros || []}',
      'sceneOptions={$viewState.selectedSystem?.sceneOptions || []}',
      'rollTableOptions={$viewState.selectedSystem?.rollTableOptions || []}',
      'onPickImagePath={services?.pickImagePath}',
      'validationState={$viewState.environmentValidationState}',
      'onAddResultGroup={store.addEnvironmentTaskResultGroup}',
      'onUpdateResultGroup={store.updateEnvironmentTaskResultGroup}',
      'onDeleteResultGroup={store.deleteEnvironmentTaskResultGroup}',
      'onMoveResultGroup={store.moveEnvironmentTaskResultGroup}',
      'onAddResult={store.addEnvironmentTaskResult}',
      'onUpdateResult={store.updateEnvironmentTaskResult}',
      'onDeleteResult={store.deleteEnvironmentTaskResult}',
      'onMoveResult={store.moveEnvironmentTaskResult}',
      'onAddCatalyst={store.addEnvironmentTaskCatalyst}',
      'onUpdateCatalyst={store.updateEnvironmentTaskCatalyst}',
      'onDeleteCatalyst={store.deleteEnvironmentTaskCatalyst}',
      'onUpdateVisibility={store.updateEnvironmentTaskVisibility}',
      'onUpdateResultSelection={store.updateEnvironmentTaskResultSelection}',
      'onUpdateProgressive={store.updateEnvironmentTaskProgressive}',
      'onUpdateCheck={store.updateEnvironmentTaskCheck}',
      'onUpdateTimeRequirement={store.updateEnvironmentTaskTimeRequirement}',
      'onUpdateFailureOutcome={store.updateEnvironmentTaskFailureOutcome}'
    ]) {
      assert.ok(
        rootSource.includes(snippet),
        `RecipeManagerRoot should pass ${snippet} to EnvironmentsTab`
      );
    }
  });

  it('keeps EnvironmentsTab as an environment-level editor over store state', () => {
    for (const snippet of [
      'environments = []',
      'environmentDraft = null',
      'dirty = false',
      'saveError = null',
      'validationState = null',
      'loading = false',
      'error = null',
      'onCreateEnvironment',
      'onUpdateEnvironment',
      'onSaveEnvironment',
      'onCancelEnvironment',
      'onDuplicateEnvironment',
      'onDeleteEnvironment',
      'onToggleEnvironmentEnabled',
      'onMoveEnvironment',
      'selectedTaskId',
      'onAddTask',
      'onSelectTask',
      'onUpdateTask',
      'onDuplicateTask',
      'onDeleteTask',
      'onMoveTask',
      'managedItemOptions',
      'availableScriptMacros',
      'sceneOptions',
      'rollTableOptions',
      'onPickImagePath',
      'onAddResultGroup',
      'onUpdateResultGroup',
      'onDeleteResultGroup',
      'onMoveResultGroup',
      'onAddResult',
      'onUpdateResult',
      'onDeleteResult',
      'onMoveResult',
      'onAddCatalyst',
      'onUpdateCatalyst',
      'onDeleteCatalyst',
      'onUpdateVisibility',
      'onUpdateResultSelection',
      'onUpdateProgressive',
      'onUpdateCheck',
      'onUpdateTimeRequirement',
      'onUpdateFailureOutcome',
      'FABRICATE.Admin.Environments.TimeRequirement',
      'FABRICATE.Admin.Environments.TimedTask',
      'FABRICATE.Admin.Environments.ImmediateTaskHint',
      'FABRICATE.Admin.Environments.TimeRequirementHint',
      'FABRICATE.Admin.Environments.TimeMinutes',
      'FABRICATE.Admin.Environments.TimeHours',
      'FABRICATE.Admin.Environments.TimeDays',
      'FABRICATE.Admin.Environments.TimeMonths',
      'FABRICATE.Admin.Environments.TimeYears',
      'FABRICATE.Admin.Environments.FailureOutcome',
      'FABRICATE.Admin.Environments.CustomFailureOutcome',
      'FABRICATE.Admin.Environments.DefaultFailureOutcomeHint',
      'FABRICATE.Admin.Environments.FailureOutcomeMode',
      'FABRICATE.Admin.Environments.FailureOutcomeText',
      'FABRICATE.Admin.Environments.FailureOutcomeMacro',
      'FABRICATE.Admin.Environments.FailureOutcomeTextValue',
      'FABRICATE.Admin.Environments.FailureOutcomeMacroUuid',
      'FABRICATE.Admin.Environments.FailureOutcomeHint',
      'FABRICATE.Admin.Environments.ResultSelection',
      'FABRICATE.Admin.Environments.ResultSelectionProvider',
      'FABRICATE.Admin.Environments.ResultSelectionProviderMacro',
      'FABRICATE.Admin.Environments.ResultSelectionProviderRollTable',
      'FABRICATE.Admin.Environments.ResultSelectionMacro',
      'FABRICATE.Admin.Environments.RollTableUuid',
      'FABRICATE.Admin.Environments.Check',
      'FABRICATE.Admin.Environments.CheckProvider',
      'FABRICATE.Admin.Environments.CheckProviderMacro',
      'FABRICATE.Admin.Environments.CheckProviderDnd5e',
      'FABRICATE.Admin.Environments.CheckProviderPf2e',
      'FABRICATE.Admin.Environments.CheckMacro',
      'FABRICATE.Admin.Environments.CheckFormula',
      'FABRICATE.Admin.Environments.CheckThreshold',
      'FABRICATE.Admin.Environments.ProgressiveAwardMode',
      'FABRICATE.Admin.Environments.ProgressiveAwardEqual',
      'FABRICATE.Admin.Environments.ProgressiveAwardPartial',
      'FABRICATE.Admin.Environments.ProgressiveAwardExceed',
      'FABRICATE.Admin.Environments.Loading',
      'FABRICATE.Admin.Environments.EmptyTitle',
      'FABRICATE.Admin.Environments.ErrorTitle',
      'FABRICATE.Admin.Environments.Save',
      'FABRICATE.Admin.Environments.Cancel',
      'FABRICATE.Admin.Environments.AddTask',
      'FABRICATE.Admin.Environments.TaskName',
      'FABRICATE.Admin.Environments.TaskDescription',
      'FABRICATE.Admin.Environments.TaskImage',
      'FABRICATE.Admin.Environments.TaskResolutionMode',
      'FABRICATE.Admin.Environments.Visibility',
      'FABRICATE.Admin.Environments.VisibilityEnabled',
      'FABRICATE.Admin.Environments.NoVisibility',
      'FABRICATE.Admin.Environments.VisibilityProvider',
      'FABRICATE.Admin.Environments.VisibilityProviderMacro',
      'FABRICATE.Admin.Environments.VisibilityProviderDnd5e',
      'FABRICATE.Admin.Environments.VisibilityProviderPf2e',
      'FABRICATE.Admin.Environments.VisibilityMacro',
      'FABRICATE.Admin.Environments.NoMacroSelected',
      'FABRICATE.Admin.Environments.VisibilityFormula',
      'FABRICATE.Admin.Environments.VisibilityThreshold',
      'FABRICATE.Admin.Environments.Catalysts',
      'FABRICATE.Admin.Environments.AddCatalyst',
      'FABRICATE.Admin.Environments.CatalystComponent',
      'FABRICATE.Admin.Environments.CatalystDegrades',
      'FABRICATE.Admin.Environments.CatalystDestroyWhenExhausted',
      'FABRICATE.Admin.Environments.CatalystMaxUses',
      'FABRICATE.Admin.Environments.CatalystMaxUsesUnlimited',
      'FABRICATE.Admin.Environments.DeleteCatalyst',
      'FABRICATE.Admin.Environments.ResultGroups',
      'FABRICATE.Admin.Environments.AddResultGroup',
      'FABRICATE.Admin.Environments.ResultGroupName',
      'FABRICATE.Admin.Environments.AddResult',
      'FABRICATE.Admin.Environments.ResultComponent',
      'FABRICATE.Admin.Environments.ResultQuantity',
      'FABRICATE.Admin.Environments.ResultDifficulty'
    ]) {
      assert.ok(
        environmentsComponentSource.includes(snippet),
        `EnvironmentsTab component surface should include ${snippet}`
      );
    }
    assert.equal(
      environmentsTabSource.includes("onUpdateEnvironment?.({ tasks"),
      false,
      'EnvironmentsTab should not locally mutate task lists through environment updates'
    );
  });

  it('extracts environment editor pieces into prop-driven presentational components', () => {
    for (const componentName of [
      'EnvironmentActionMenu',
      'CatalystList',
      'EnvironmentFields',
      'EnvironmentList',
      'EnvironmentValidationFeedback',
      'FailureOutcomeFields',
      'ProgressiveFields',
      'ResultGroups',
      'ResultSelectionFields',
      'TaskBaseFields',
      'TaskList',
      'TimeRequirementFields',
      'VisibilityFields'
    ]) {
      assert.ok(
        environmentsTabSource.includes(`import ${componentName} from './environments/`),
        `EnvironmentsTab should import ${componentName}`
      );
      assert.ok(
        environmentsTabSource.includes(`<${componentName}`),
        `EnvironmentsTab should render ${componentName}`
      );
    }

    for (const source of [environmentsTabSource, ...environmentsExtractedSources, ...sharedEnvironmentComponentSources]) {
      assert.ok(source.includes('let {'), 'extracted environment components should receive props explicitly');
      assert.equal(/\b(?:game|ui|Hooks|CONFIG|fromUuid)\b/.test(source), false, 'extracted environment components should not use Foundry globals');
    }
  });

  it('wires assisted picker data and actions through injected edge contracts', () => {
    for (const snippet of [
      'getSceneOptions: () =>',
      'getRollTableOptions: () =>',
      'pickImagePath: async (currentPath = \'\')',
      'pickImagePath: this._services.pickImagePath',
      'Array.from(game.scenes?.contents || [])',
      'Array.from(game.tables?.contents || [])',
      'uuid: scene.uuid',
      'name: scene.name',
      'img: scene.background?.src || scene.img || \'\'',
      'thumbnail: scene.thumbnail || scene.thumb || \'\'',
      'uuid: table.uuid',
      'name: table.name',
      'img: table.img || \'\'',
      'sceneOptions = services.getSceneOptions?.() || []',
      'rollTableOptions = services.getRollTableOptions?.() || []',
      'sceneOptions,',
      'rollTableOptions',
      'plain edge-owned records shaped',
      '`{ uuid, name, img?, stale? }`'
    ]) {
      assert.ok(
        `${recipeManagerAppSource}\n${adminStoreSource}\n${environmentsComponentSource}`.includes(snippet),
        `Picker contracts should include injected edge snippet ${snippet}`
      );
    }
  });

  it('renders accessible validation summary, field ARIA hooks, and first-invalid focus support', () => {
    for (const snippet of [
      'const validationErrors = $derived(Array.isArray(validationState?.errors) ? validationState.errors : [])',
      'const normalizedValidationErrors = $derived(validationErrors.map(error => normalizedValidationTarget(error)))',
      'const invalidTaskIds = $derived(new Set(normalizedValidationErrors.map(error => error.taskId).filter(Boolean)))',
      'const invalidTaskSectionIds = $derived(new Set(normalizedValidationErrors',
      'const invalidResultGroupIds = $derived(new Set(normalizedValidationErrors',
      'let lastValidationFocusAttempt = $state(0)',
      'focusValidationError(validationState.firstInvalidField)',
      'async function focusValidationError(error)',
      'revealValidationTarget(error)',
      'await tick()',
      "querySelector?.('.environment-draft-editor')",
      "target.scrollIntoView?.({ block: 'center', inline: 'nearest' })",
      "target.focus?.({ preventScroll: true })",
      'class="environment-validation-summary"',
      'role="alert"',
      'aria-labelledby="environment-validation-summary-title"',
      'class="environment-validation-link"',
      "data-environment-field={environmentField('selectionMode')}",
      "data-environment-field={taskField('resultSelection.macroUuid')}",
      "data-environment-field={taskField('resultSelection.rollTableUuid')}",
      "data-environment-field={taskField('progressive.awardMode')}",
      "data-environment-field={taskField('check.provider')}",
      "data-environment-field={taskField('check.formula')}",
      'data-environment-field={taskField(`timeRequirement.${unit.field}`)}',
      "data-environment-field={taskField('failureOutcome.text')}",
      "data-environment-field={catalystField(catalystIndex, 'componentId')}",
      "data-environment-field={resultGroupField(group.id, 'name')}",
      'data-environment-field={resultGroupsField()}',
      'data-environment-field={resultGroupResultsField(group.id)}',
      'tabindex="-1"',
      "data-environment-field={resultField(result.id, 'componentId')}",
      'aria-invalid={fieldInvalid(',
      'aria-describedby={fieldDescribedBy(',
      'class="environment-field-error"'
    ]) {
      assert.ok(
        environmentsComponentSource.includes(snippet),
        `EnvironmentsTab component surface should include validation/accessibility snippet ${snippet}`
      );
    }
  });

  it('derives task summaries, invalid task indicators, and validation reveal targets in the root layer', () => {
    for (const snippet of [
      'const taskSummaries = $derived(new Map(tasks.map(task => [task.id, taskSummary(task)])))',
      'function taskSummary(task)',
      "taskEnabledLabel(task)",
      "taskResolutionModeLabel(task)",
      "taskTimeLabel(task)",
      "taskVisibilityLabel(task)",
      "catalystCountLabel(catalysts.length)",
      "resultGroupCountLabel(groups.length)",
      "resultCountLabel(taskResultCount(task))",
      '{taskSummaries}',
      '{invalidTaskIds}',
      'data-environment-invalid={invalidTaskIds.has(task.id) ?',
      "localize('FABRICATE.Admin.Environments.Invalid')",
      'function normalizedValidationTarget(error)',
      'function sectionKeyForValidationPath(path)',
      "if (taskPath.startsWith('timeRequirement')) return 'time'",
      "if (taskPath.startsWith('failureOutcome')) return 'failure'",
      "if (taskPath.startsWith('visibility')) return 'visibility'",
      "if (taskPath.startsWith('resultSelection')) return 'resolution'",
      "if (taskPath.startsWith('progressive') || taskPath.startsWith('check')) return 'check'",
      "if (taskPath.startsWith('catalysts')) return 'catalysts'",
      "if (taskPath.startsWith('resultGroups') || taskPath.startsWith('result.')) return 'resultGroups'",
      'function revealValidationTarget(error)',
      '[taskSectionId(target.taskId, target.sectionKey)]: true',
      '[resultGroupExpansionId(target.taskId, target.resultGroupId)]: true'
    ]) {
      assert.ok(
        environmentsComponentSource.includes(snippet),
        `EnvironmentsTab should include summary/invalid/reveal snippet ${snippet}`
      );
    }
  });

  it('renders validation-aware collapsible task sections and result groups', () => {
    for (const snippet of [
      "sectionOpen={isTaskSectionExpanded('base')}",
      "sectionOpen={isTaskSectionExpanded('time')}",
      "sectionOpen={isTaskSectionExpanded('failure')}",
      "sectionOpen={isTaskSectionExpanded('resolution')}",
      "sectionOpen={isTaskSectionExpanded('check')}",
      "sectionOpen={isTaskSectionExpanded('visibility')}",
      "sectionOpen={isTaskSectionExpanded('catalysts')}",
      "sectionOpen={isTaskSectionExpanded('resultGroups')}",
      "sectionInvalid={taskSectionInvalid('base')}",
      "sectionInvalid={taskSectionInvalid('time')}",
      "sectionInvalid={taskSectionInvalid('failure')}",
      "sectionInvalid={taskSectionInvalid('resolution')}",
      "sectionInvalid={taskSectionInvalid('check')}",
      "sectionInvalid={taskSectionInvalid('visibility')}",
      "sectionInvalid={taskSectionInvalid('catalysts')}",
      "sectionInvalid={taskSectionInvalid('resultGroups')}",
      "setSectionOpen={(open) => setTaskSectionExpanded('resultGroups', open)}",
      '{invalidResultGroupIds}',
      '{isResultGroupExpanded}',
      '{setResultGroupExpanded}',
      '<details open={sectionOpen} ontoggle={(event) => setSectionOpen?.(event.currentTarget.open)}>',
      '<summary class="environment-task-header">',
      'data-environment-invalid={sectionInvalid ?',
      'open={isResultGroupExpanded?.(group.id) ?? true}',
      'ontoggle={(event) => setResultGroupExpanded?.(group.id, event.currentTarget.open)}'
    ]) {
      assert.ok(
        environmentsComponentSource.includes(snippet),
        `Environment task sections should include collapsible/invalid snippet ${snippet}`
      );
    }
  });

  it('keeps task summaries and invalid state exposed to assistive tech', () => {
    assert.equal(
      environmentsComponentSource.includes("aria-label={localize('FABRICATE.Admin.Environments.SelectTask'"),
      false,
      'task select buttons should not hide visible task summary text behind an overriding aria-label'
    );
    assert.ok(
      environmentsComponentSource.includes("aria-current={activeTaskId === task.id ? 'true' : undefined}"),
      'selected task rows should expose the current task state'
    );
  });

  it('renders contextual action controls as disclosed button groups, not ARIA menus', () => {
    for (const snippet of [
      'triggerLabel={localize(\'FABRICATE.Admin.Environments.ActionsForEnvironment\'',
      'triggerLabel={localize(\'FABRICATE.Admin.Environments.TaskActionsFor\'',
      'triggerLabel={localize(\'FABRICATE.Admin.Environments.ResultGroupActionsFor\'',
      'triggerLabel={localize(\'FABRICATE.Admin.Environments.ResultActionsFor\'',
      'FABRICATE.Admin.Environments.DeleteEnvironmentNamed',
      'FABRICATE.Admin.Environments.DeleteTaskNamed',
      'FABRICATE.Admin.Environments.DeleteResultGroupNamed',
      'FABRICATE.Admin.Environments.DeleteResultNamed',
      'class:open-up={openUp}',
      "data-open-direction={openUp ? 'up' : 'down'}",
      'closeMenu({ returnFocus: true })'
    ]) {
      assert.ok(
        environmentsComponentSource.includes(snippet),
        `Contextual action controls should include snippet ${snippet}`
      );
    }
    assert.equal(
      environmentsComponentSource.includes('role="menu"'),
      false,
      'action disclosure should not claim ARIA menu semantics'
    );
    assert.equal(
      environmentsComponentSource.includes('role="menuitem"'),
      false,
      'action disclosure buttons should keep native button semantics'
    );
  });

  it('keeps contextual action popovers constrained and out of mobile button flex sizing', () => {
    assert.match(
      styleSource,
      /\.fabricate-admin \.environment-action-menu-list\s*\{[^}]*width:\s*min\(14rem,\s*calc\(100vw - 2rem\)\);[^}]*max-width:\s*calc\(100vw - 2rem\);/s,
      'action popover list should use constrained viewport-aware width instead of content-sized width'
    );
    assert.doesNotMatch(
      styleSource,
      /\.fabricate-admin \.environment-action-menu-list\s*\{[^}]*width:\s*max-content;/s,
      'action popover list should not use max-content width for contextual labels'
    );
    assert.match(
      styleSource,
      /\.fabricate-admin \.environment-action-menu-item span\s*\{[^}]*white-space:\s*normal;[^}]*overflow-wrap:\s*anywhere;/s,
      'action popover item labels should wrap long localized target names'
    );
    assert.match(
      styleSource,
      /\.fabricate-admin \.environment-action-menu-item\s*\{[^}]*flex:\s*0 0 auto;/s,
      'action popover item buttons should not stretch like mobile editor action buttons'
    );
    assert.match(
      styleSource,
      /\.fabricate-admin \.environment-editor-actions > button,\s*\.fabricate-admin \.environment-save-actions > button\s*\{\s*flex:\s*1 1 140px;/s,
      'mobile editor action flex sizing should target only direct action buttons'
    );
    assert.doesNotMatch(
      styleSource,
      /\.fabricate-admin \.environment-editor-actions button,\s*\.fabricate-admin \.environment-save-actions button\s*\{\s*flex:\s*1 1 140px;/s,
      'mobile editor action flex sizing should not target descendant popover item buttons'
    );
  });

  it('keeps stale linked references visible while preserving saved UUID values', () => {
    for (const snippet of [
      'selectedResultSelectionMacroMissing',
      'selectedCheckMacroMissing',
      'selectedFailureMacroMissing',
      'selectedVisibilityMacroMissing',
      'environment-scene-reference-warning',
      'environment-roll-table-reference-warning',
      'environment-result-selection-macro-reference-warning',
      'environment-check-macro-reference-warning',
      'environment-failure-macro-reference-warning',
      'environment-visibility-macro-reference-warning',
      'class="environment-stale-warning"',
      'FABRICATE.Admin.Environments.MissingReferenceOption',
      'FABRICATE.Admin.Environments.LinkedSceneReferenceWarning',
      'FABRICATE.Admin.Environments.MissingRollTableReferenceWarning',
      'FABRICATE.Admin.Environments.MissingMacroReferenceWarning',
      '<option value={environmentDraft.sceneUuid}>{localize(\'FABRICATE.Admin.Environments.MissingReferenceOption\', { uuid: environmentDraft.sceneUuid })}</option>',
      '<option value={activeTaskResultSelection.rollTableUuid}>{localize(\'FABRICATE.Admin.Environments.MissingReferenceOption\', { uuid: activeTaskResultSelection.rollTableUuid })}</option>',
      '<option value={activeTaskResultSelection.macroUuid}>{activeTaskResultSelection.macroUuid}</option>',
      '<option value={activeTaskCheck.macroUuid}>{activeTaskCheck.macroUuid}</option>',
      '<option value={activeTaskFailureOutcome.macroUuid}>{activeTaskFailureOutcome.macroUuid}</option>',
      '<option value={editorVisibility.macroUuid}>{editorVisibility.macroUuid}</option>'
    ]) {
      assert.ok(
        environmentsComponentSource.includes(snippet),
        `EnvironmentsTab component surface should keep stale reference snippet ${snippet}`
      );
    }
  });

  it('separates amber stale-reference warnings from red validation errors', () => {
    assert.match(
      styleSource,
      /\.fabricate-admin \.environment-field-error\s*\{[^}]*color:\s*#f3b5b5;/s,
      'validation errors should keep red error treatment'
    );
    assert.match(
      styleSource,
      /\.fabricate-admin \.environment-stale-warning\s*\{[^}]*border:\s*1px solid rgba\(240,\s*173,\s*78,\s*0\.42\);[^}]*background:\s*rgba\(240,\s*173,\s*78,\s*0\.12\);[^}]*color:\s*#f3d08b;/s,
      'stale references should render as amber warnings, not red validation errors'
    );
    assert.doesNotMatch(
      styleSource,
      /\.fabricate-admin \.environment-stale-warning\s*\{[^}]*rgba\(220,\s*80,\s*80/s,
      'stale-reference warning block should not reuse red error colors'
    );
  });

  it('provides actionable environment empty states and selected item identity rows', () => {
    for (const snippet of [
      'class="environment-empty-action"',
      'data-environment-empty-action="create-environment"',
      'data-environment-empty-action="add-task"',
      'data-environment-empty-action="enable-visibility"',
      'data-environment-empty-action="add-catalyst"',
      'data-environment-empty-action="add-result-group"',
      'data-environment-empty-action="add-result"',
      'FABRICATE.Admin.Environments.EmptyActionHint',
      'FABRICATE.Admin.Environments.NoTasksHint',
      'FABRICATE.Admin.Environments.NoVisibilityHint',
      'FABRICATE.Admin.Environments.NoCatalystsHint',
      'FABRICATE.Admin.Environments.NoResultGroupsHint',
      'FABRICATE.Admin.Environments.NoResultsHint',
      'class="environment-selected-item"',
      'class="environment-selected-item-img"',
      'class="environment-selected-item-name"',
      'class="environment-selected-item-meta"'
    ]) {
      assert.ok(
        environmentsComponentSource.includes(snippet),
        `visual polish should include empty-state/identity snippet ${snippet}`
      );
    }
  });

  it('uses dark sticky save-bar styling with safe-area padding and narrow-window rules', () => {
    assert.match(
      styleSource,
      /\.fabricate-admin \.environment-base-authoring,\s*\.fabricate-admin \.environment-time-authoring,\s*\.fabricate-admin \.environment-failure-authoring,/s,
      'base authoring should share the polished task-section card styling with peer sections'
    );
    assert.match(
      styleSource,
      /\.fabricate-admin \.environment-base-authoring > details,\s*\.fabricate-admin \.environment-time-authoring > details,/s,
      'base authoring details should share the peer section details layout contract'
    );
    assert.match(
      styleSource,
      /\.fabricate-admin \.environment-base-authoring summary,\s*\.fabricate-admin \.environment-time-authoring summary,/s,
      'base authoring summary should share the peer section accordion summary styling'
    );
    assert.match(
      styleSource,
      /\.fabricate-admin \.environment-draft-editor\s*\{[^}]*scroll-padding-bottom:\s*96px;/s,
      'environment editor should reserve scroll padding so focused rows are not covered by footer actions'
    );
    assert.match(
      styleSource,
      /\.fabricate-admin \.environment-save-actions\s*\{[^}]*padding:\s*8px 0 calc\(8px \+ env\(safe-area-inset-bottom,\s*0px\)\);[^}]*background:\s*rgba\(20,\s*24,\s*31,\s*0\.96\);/s,
      'save actions should use restrained dark admin styling and safe-area padding without overlapping fields'
    );
    assert.match(
      styleSource,
      /@container fabricate-admin-main \(max-width: 760px\) \{[\s\S]*\.fabricate-admin \.environment-result-row,\s*\.fabricate-admin \.environment-result-row\.progressive,\s*\.fabricate-admin \.environment-catalyst-row\s*\{[\s\S]*grid-template-columns:\s*1fr;/s,
      'narrow admin containers should collapse result and catalyst rows to one column'
    );
    assert.match(
      styleSource,
      /\.fabricate-admin \.environment-action-menu-trigger,\s*\.fabricate-admin \.environment-card-actions \.btn-icon,\s*\.fabricate-admin \.environment-row-actions \.btn-icon\s*\{[^}]*width:\s*32px;[^}]*height:\s*32px;/s,
      'environment icon-only actions should share admin hit-area geometry'
    );
    assert.match(
      styleSource,
      /\.fabricate-admin \.environment-list\.environment-card-grid\s*\{[^}]*display:\s*grid;[^}]*grid-template-columns:\s*repeat\(3,\s*minmax\(0,\s*1fr\)\);[^}]*overflow-y:\s*auto;/s,
      'environment list should present persisted environments as a scrollable three-column card grid'
    );
    assert.match(
      styleSource,
      /\.fabricate-admin \.environment-list\.environment-card-grid\s*\{[^}]*flex:\s*1 1 auto;[^}]*min-height:\s*0;[^}]*overflow-y:\s*auto;/s,
      'environment card grid should flex to fill available height instead of using a short fixed list region'
    );
    assert.doesNotMatch(
      styleSource,
      /\.fabricate-admin \.environment-list\.environment-card-grid\s*\{[^}]*max-height:/s,
      'environment card grid should not cap itself with a fixed max-height'
    );
    assert.match(
      styleSource,
      /\.fabricate-admin \.environment-card\s*\{[^}]*min-height:\s*(?:2[2-9]\d|[3-9]\d{2})px;/s,
      'environment cards should provide enough vertical space for larger image-first card content'
    );
    assert.match(
      styleSource,
      /\.fabricate-admin \.environment-card-actions\s*\{[^}]*position:\s*absolute;[^}]*top:\s*[^;]+;[^}]*right:\s*[^;]+;/s,
      'environment card action buttons should overlay the card image at the top-right'
    );
    assert.match(
      styleSource,
      /\.fabricate-admin \.environment-card-media\s*\{[^}]*position:\s*relative;[^}]*overflow:\s*visible;[^}]*width:\s*100%;[^}]*min-width:\s*0;[^}]*aspect-ratio:\s*3 \/ 2;[^}]*min-height:\s*0;/s,
      'environment card media should keep menu-friendly visible overflow while allowing the media column to shrink inside the card'
    );
    assert.match(
      styleSource,
      /\.fabricate-admin \.environment-card-image-frame\s*\{[^}]*overflow:\s*hidden;/s,
      'environment card image clipping should be confined to the image frame so overlay menus are not clipped'
    );
    assert.match(
      styleSource,
      /\.fabricate-admin \.environment-card-image-action\s*\{[^}]*position:\s*absolute;[^}]*inset:\s*0;[^}]*height:\s*100%;/s,
      'environment card image buttons should fill the larger media frame'
    );
    assert.match(
      styleSource,
      /\.fabricate-admin \.environment-card-image\s*\{[^}]*object-fit:\s*cover;/s,
      'environment card images should keep stable cropped image geometry'
    );
    assert.match(
      styleSource,
      /\.fabricate-admin \.environment-card-image\.fallback\s*\{[^}]*width:\s*64px;[^}]*height:\s*64px;[^}]*object-fit:\s*contain;/s,
      'environment fallback icons should render as centered icons instead of cropped cover images'
    );
    assert.match(
      styleSource,
      /@container fabricate-admin-main \(max-width: 500px\) \{[\s\S]*\.fabricate-admin \.environment-list\.environment-card-grid\s*\{[\s\S]*grid-template-columns:\s*repeat\(2,\s*minmax\(0,\s*1fr\)\);/s,
      'only narrow admin containers should collapse environment cards below three columns'
    );
  });

  it('defines the grid-first environment edit flow source contract', () => {
    for (const snippet of [
      'environment-back-button',
      'data-environment-action="back-to-grid"',
      'FABRICATE.Admin.Environments.BackToEnvironmentGrid',
      'class="environment-card-body-action environment-card-name-action"',
      'class="environment-card-image-action"',
      'class="btn-icon environment-card-edit"'
    ]) {
      assert.ok(
        environmentsComponentSource.includes(snippet),
        `grid-first edit flow should include snippet ${snippet}`
      );
    }
    assert.equal(
      environmentsComponentSource.includes('class="environment-card-shell-action"'),
      false,
      'grid-first edit flow should not depend on a full-card empty overlay button'
    );
    assert.equal(
      environmentsComponentSource.includes('class:disabled={environment.enabled !== true}'),
      false,
      'environment cards should not use a generic disabled class that Foundry can treat as pointer-inert'
    );
    assert.ok(
      environmentsComponentSource.includes('class:is-disabled={environment.enabled !== true}'),
      'environment cards should use a component-scoped disabled state class'
    );
  });

  it('keeps environment card hover states readable without hover border outlines', () => {
    assert.doesNotMatch(
      styleSource,
      /\.fabricate-admin \.environment-card-image-action:hover[\s\S]*?outline:/,
      'environment card image hover should not draw an outline or border-like ring'
    );
    assert.doesNotMatch(
      styleSource,
      /\.fabricate-admin \.environment-card-name-action:hover[\s\S]*?outline:/,
      'environment card name/summary hover should not draw an outline or border-like ring'
    );
    assert.match(
      styleSource,
      /\.fabricate-admin \.environment-card-image-action:focus-visible,\s*\.fabricate-admin \.environment-card-name-action:focus-visible\s*\{[^}]*outline:\s*0;/s,
      'keyboard focus on image and name/summary edit targets should avoid border-like outlines'
    );
    assert.match(
      styleSource,
      /\.fabricate-admin \.environment-card-image-action:focus-visible::after\s*\{[^}]*background:\s*rgba\(120,\s*160,\s*255,\s*0\.18\);/s,
      'keyboard focus on the image edit target should use a non-border tint overlay'
    );
    assert.match(
      styleSource,
      /\.fabricate-admin \.environment-card-name-action:focus-visible \.environment-name\s*\{[^}]*text-decoration:\s*underline;[^}]*text-decoration-thickness:\s*2px;/s,
      'keyboard focus on the name/summary edit target should use non-border text emphasis'
    );
    assert.match(
      styleSource,
      /\.fabricate-admin \.environment-card-actions \.environment-action-menu-trigger:hover,\s*\.fabricate-admin \.environment-card-actions \.environment-action-menu-trigger:focus-visible,\s*\.fabricate-admin \.environment-card-actions \.btn-icon:hover,\s*\.fabricate-admin \.environment-card-actions \.btn-icon:focus-visible\s*\{[^}]*background:\s*rgba\(18,\s*22,\s*32,\s*0\.96\);[^}]*border-color:\s*rgba\(120,\s*160,\s*255,\s*0\.65\);[^}]*box-shadow:/s,
      'environment card action hover/focus should keep an opaque readable chip instead of a clear wash'
    );
    assert.match(
      styleSource,
      /\.fabricate-admin \.environment-card-actions \.environment-card-delete:hover,\s*\.fabricate-admin \.environment-card-actions \.environment-card-delete:focus-visible\s*\{[^}]*background:\s*rgba\(92,\s*24,\s*28,\s*0\.96\);[^}]*border-color:\s*rgba\(220,\s*80,\s*80,\s*0\.72\);/s,
      'environment card delete hover/focus should keep an opaque danger chip'
    );
  });

  it('keeps incomplete visibility provider inputs local until required fields are present', () => {
    for (const snippet of [
      'let pendingVisibility = $state(null)',
      'let pendingVisibilityKey = $state',
      "const activeVisibilityKey = $derived(`${environmentDraft?.id || 'new'}:${environmentDraft?.craftingSystemId || ''}:${activeTaskId}`)",
      'const editorVisibility = $derived(pendingVisibility || activeTaskVisibility)',
      'function isCompleteVisibility(config)',
      "return Boolean(String(config.macroUuid ?? '').trim())",
      "return Boolean(String(config.formula ?? '').trim()) && Boolean(String(config.threshold ?? '').trim())",
      'function commitVisibilityIfComplete(nextVisibility)',
      'if (isCompleteVisibility(nextVisibility))',
      'pendingVisibility = nextVisibility',
      'pendingVisibility = null',
      'if (activeTaskVisibility)',
      'updateVisibility(null)'
    ]) {
      assert.ok(
        environmentsTabSource.includes(snippet),
        `EnvironmentsTab should include local pending visibility guard ${snippet}`
      );
    }
    assert.equal(
      environmentsTabSource.includes("macroUuid: source.macroUuid || scriptMacroOptions[0]?.uuid || ''"),
      true,
      'macro defaults may be prepared locally but must pass through completeness checks before commit'
    );
    assert.equal(
      environmentsTabSource.includes("updateVisibility(defaultVisibilityForProvider"),
      false,
      'provider enable/switch should not directly emit possibly blank default visibility'
    );
    assert.equal(
      environmentsTabSource.includes('pendingVisibilityTaskId'),
      false,
      'pending visibility should not be keyed only by nested task id'
    );
    assert.match(
      environmentsTabSource,
      /if \(!enabled\) \{\s+pendingVisibility = null;\s+if \(activeTaskVisibility\) \{\s+updateVisibility\(null\);/s,
      'disabling local-only pending visibility should not emit a store clear'
    );
  });

  it('renders routed result-selection and progressive check/award controls through store callbacks', () => {
    for (const snippet of [
      'const activeTaskResultSelection = $derived(activeTask?.resultSelection || null)',
      'const selectedRollTableMissing = $derived(',
      'const activeTaskProgressive = $derived(activeTask?.progressive || null)',
      'const activeTaskCheck = $derived(activeTask?.check || null)',
      'function updateResultSelection(updates)',
      'onUpdateResultSelection?.(activeTask.id, updates)',
      'function updateProgressive(updates)',
      'onUpdateProgressive?.(activeTask.id, updates)',
      'function updateCheck(updates)',
      'onUpdateCheck?.(activeTask.id, updates)',
      "activeTask.resolutionMode === 'routed'",
      "activeTask.resolutionMode === 'progressive'",
      "value={activeTaskResultSelection?.provider || 'macroOutcome'}",
      "value={activeTaskResultSelection?.macroUuid || ''}",
      "value={activeTaskResultSelection?.rollTableUuid || ''}",
      "name=\"rollTableUuid\"",
      "rollTableOptions={rollTableOptionList}",
      "aria-describedby={selectedRollTableMissing ? 'environment-roll-table-reference-warning' : undefined}",
      "aria-describedby={fieldDescribedBy(taskField('resultSelection.rollTableUuid'), selectedRollTableMissing ? 'environment-roll-table-reference-warning' : '')}",
      "value={activeTaskProgressive?.awardMode || 'equal'}",
      "value={activeTaskCheck?.provider || 'macro'}",
      "value={activeTaskCheck?.macroUuid || ''}",
      "value={activeTaskCheck?.formula || ''}",
      "value={activeTaskCheck?.threshold || ''}"
    ]) {
      assert.ok(
        environmentsComponentSource.includes(snippet),
        `EnvironmentsTab component surface should include routed/progressive authoring snippet ${snippet}`
      );
    }
    assert.equal(
      environmentsComponentSource.includes('CheckThresholdOptional'),
      true,
      'progressive check threshold should be labelled as optional in the component source'
    );
  });

  it('renders time requirement and failure outcome controls through store callbacks', () => {
    for (const snippet of [
      'const activeTaskTimeRequirement = $derived(activeTask?.timeRequirement || null)',
      'const activeTaskFailureOutcome = $derived(activeTask?.failureOutcome || null)',
      'function toggleTimeRequirement(enabled)',
      'onUpdateTimeRequirement?.(activeTask.id, null)',
      'onUpdateTimeRequirement?.(activeTask.id, {',
      'function updateTimeRequirement(field, value)',
      'onUpdateTimeRequirement?.(activeTask.id, { [field]: value })',
      'function toggleFailureOutcome(enabled)',
      "onUpdateFailureOutcome?.(activeTask.id, enabled ? { mode: 'text', text: '' } : null)",
      'function updateFailureOutcome(updates)',
      'onUpdateFailureOutcome?.(activeTask.id, updates)',
      'value={activeTaskTimeRequirement?.[unit.field] ?? 0}',
      "oninput={(event) => updateTimeRequirement(unit.field, event.target.value)}",
      "value={activeTaskFailureOutcome.mode || 'text'}",
      "onchange={(event) => updateFailureOutcome({ mode: event.target.value })}",
      "value={activeTaskFailureOutcome.macroUuid || ''}",
      "value={activeTaskFailureOutcome.text || ''}",
      'const selectedFailureMacroMissing = $derived('
    ]) {
      assert.ok(
        environmentsComponentSource.includes(snippet),
        `EnvironmentsTab component surface should include time/failure authoring snippet ${snippet}`
      );
    }
  });

  it('injects the gathering environment store at the Foundry edge', () => {
    assert.ok(
      recipeManagerAppSource.includes('getGatheringEnvironmentStore: () => game?.fabricate?.getGatheringEnvironmentStore?.() ?? null'),
      'SvelteRecipeManagerApp should inject getGatheringEnvironmentStore into adminStore services'
    );
  });

  it('renders task image as assisted picker with manual text fallback', () => {
    for (const snippet of [
      "import ImagePathPicker from '../../components/ImagePathPicker.svelte';",
      '<ImagePathPicker',
      'dataEnvironmentField={taskField(\'img\')}',
      'ariaInvalid={fieldInvalid(taskField(\'img\'))}',
      'ariaDescribedBy={fieldDescribedBy(taskField(\'img\'))}',
      "onChange={(path) => updateTask('img', path)}",
      'onPickImagePath={onPickImagePath ? pickTaskImagePath : null}',
      'async function pickTaskImagePath(currentPath)',
      'const selectedPath = await onPickImagePath(currentPath || activeTask.img || \'\')',
      "updateTask('img', selectedPath)",
      "type=\"text\"",
      "data-environment-field={dataEnvironmentField}",
      "oninput={(event) => onChange(event.target.value)}",
      "class=\"image-path-picker-button\"",
      'const buttonLabel = $derived(',
      '<span>{buttonLabel}</span>'
    ]) {
      assert.ok(
        environmentsComponentSource.includes(snippet),
        `Task image picker should include assisted/manual snippet ${snippet}`
      );
    }
  });

  it('confirms dirty environment drafts before the app store is destroyed on close', () => {
    const confirmIndex = recipeManagerAppSource.indexOf('await this._adminStore.confirmDiscardDirtyEnvironmentDraft?.()');
    const destroyIndex = recipeManagerAppSource.indexOf('this._adminStore.destroy()');

    assert.ok(confirmIndex > -1, 'SvelteRecipeManagerApp.close should ask the admin store to confirm dirty environment discard');
    assert.ok(destroyIndex > -1, 'SvelteRecipeManagerApp.close should still destroy the admin store');
    assert.ok(confirmIndex < destroyIndex, 'dirty discard confirmation should happen before store destruction');
    assert.ok(
      recipeManagerAppSource.includes('if (!canClose) return this;'),
      'declining dirty discard confirmation should prevent close/destruction'
    );
  });

  it('defines localization keys for the tab foundation states', () => {
    for (const key of [
      'FABRICATE.Admin.Tabs.Environments',
      'FABRICATE.Admin.Environments.Title',
      'FABRICATE.Admin.Environments.Loading',
      'FABRICATE.Admin.Environments.EmptyTitle',
      'FABRICATE.Admin.Environments.EmptyHint',
      'FABRICATE.Admin.Environments.ErrorTitle',
      'FABRICATE.Admin.Environments.StoreUnavailable',
      'FABRICATE.Admin.Environments.ValidationSummary',
      'FABRICATE.Admin.Environments.ValidationSummaryOne',
      'FABRICATE.Admin.Environments.TaskCount',
      'FABRICATE.Admin.Environments.NewEnvironment',
      'FABRICATE.Admin.Environments.NewTaskName',
      'FABRICATE.Admin.Environments.NewResultGroupName',
      'FABRICATE.Admin.Environments.TaskCopySuffix',
      'FABRICATE.Admin.Environments.Invalid',
      'FABRICATE.Admin.Environments.Name',
      'FABRICATE.Admin.Environments.Description',
      'FABRICATE.Admin.Environments.SceneUuid',
      'FABRICATE.Admin.Environments.SceneSelect',
      'FABRICATE.Admin.Environments.NoSceneSelected',
      'FABRICATE.Admin.Environments.MissingReferenceOption',
      'FABRICATE.Admin.Environments.LinkedSceneReferenceWarning',
      'FABRICATE.Admin.Environments.Save',
      'FABRICATE.Admin.Environments.Cancel',
      'FABRICATE.Admin.Environments.Duplicate',
      'FABRICATE.Admin.Environments.DuplicateEnvironmentNamed',
      'FABRICATE.Admin.Environments.Delete',
      'FABRICATE.Admin.Environments.EditEnvironmentNamed',
      'FABRICATE.Admin.Environments.EnableEnvironmentNamed',
      'FABRICATE.Admin.Environments.DisableEnvironmentNamed',
      'FABRICATE.Admin.Environments.ActionsForEnvironment',
      'FABRICATE.Admin.Environments.DeleteEnvironmentNamed',
      'FABRICATE.Admin.Environments.DeleteTitle',
      'FABRICATE.Admin.Environments.DeleteContent',
      'FABRICATE.Admin.Environments.DiscardDirtyTitle',
      'FABRICATE.Admin.Environments.DiscardDirtyContent',
      'FABRICATE.Admin.Environments.DiscardDirtyConfirm',
      'FABRICATE.Admin.Environments.DiscardDirtyCancel',
      'FABRICATE.Admin.Environments.MoveUp',
      'FABRICATE.Admin.Environments.MoveDown',
      'FABRICATE.Admin.Environments.TaskActionsFor',
      'FABRICATE.Admin.Environments.DuplicateTaskNamed',
      'FABRICATE.Admin.Environments.DeleteTaskNamed',
      'FABRICATE.Admin.Environments.ResultGroupActionsFor',
      'FABRICATE.Admin.Environments.DeleteResultGroupNamed',
      'FABRICATE.Admin.Environments.ResultActionsFor',
      'FABRICATE.Admin.Environments.ResultPosition',
      'FABRICATE.Admin.Environments.DeleteResultNamed',
      'FABRICATE.Admin.Environments.Tasks',
      'FABRICATE.Admin.Environments.NoTasks',
      'FABRICATE.Admin.Environments.AddTask',
      'FABRICATE.Admin.Environments.TaskName',
      'FABRICATE.Admin.Environments.TaskDescription',
      'FABRICATE.Admin.Environments.TaskImage',
      'FABRICATE.Admin.Environments.ChooseImage',
      'FABRICATE.Admin.Environments.ImagePickerUnavailable',
      'FABRICATE.Admin.Environments.TaskEnabled',
      'FABRICATE.Admin.Environments.TaskResolutionMode',
      'FABRICATE.Admin.Environments.TaskResolutionRouted',
      'FABRICATE.Admin.Environments.TaskResolutionProgressive',
      'FABRICATE.Admin.Environments.SectionBase',
      'FABRICATE.Admin.Environments.Immediate',
      'FABRICATE.Admin.Environments.Timed',
      'FABRICATE.Admin.Environments.VisibilityConfigured',
      'FABRICATE.Admin.Environments.VisibilityUnconfigured',
      'FABRICATE.Admin.Environments.CatalystCount',
      'FABRICATE.Admin.Environments.ResultGroupCount',
      'FABRICATE.Admin.Environments.ResultCount',
      'FABRICATE.Admin.Environments.TimeRequirement',
      'FABRICATE.Admin.Environments.TimedTask',
      'FABRICATE.Admin.Environments.ImmediateTaskHint',
      'FABRICATE.Admin.Environments.TimeRequirementHint',
      'FABRICATE.Admin.Environments.TimeMinutes',
      'FABRICATE.Admin.Environments.TimeHours',
      'FABRICATE.Admin.Environments.TimeDays',
      'FABRICATE.Admin.Environments.TimeMonths',
      'FABRICATE.Admin.Environments.TimeYears',
      'FABRICATE.Admin.Environments.FailureOutcome',
      'FABRICATE.Admin.Environments.CustomFailureOutcome',
      'FABRICATE.Admin.Environments.DefaultFailureOutcomeHint',
      'FABRICATE.Admin.Environments.FailureOutcomeMode',
      'FABRICATE.Admin.Environments.FailureOutcomeText',
      'FABRICATE.Admin.Environments.FailureOutcomeMacro',
      'FABRICATE.Admin.Environments.FailureDefault',
      'FABRICATE.Admin.Environments.FailureCustom',
      'FABRICATE.Admin.Environments.FailureOutcomeTextValue',
      'FABRICATE.Admin.Environments.FailureOutcomeMacroUuid',
      'FABRICATE.Admin.Environments.FailureOutcomeHint',
      'FABRICATE.Admin.Environments.SelectTask',
      'FABRICATE.Admin.Environments.DuplicateTask',
      'FABRICATE.Admin.Environments.DeleteTask',
      'FABRICATE.Admin.Environments.Visibility',
      'FABRICATE.Admin.Environments.VisibilityEnabled',
      'FABRICATE.Admin.Environments.NoVisibility',
      'FABRICATE.Admin.Environments.VisibilityProvider',
      'FABRICATE.Admin.Environments.VisibilityProviderMacro',
      'FABRICATE.Admin.Environments.VisibilityProviderDnd5e',
      'FABRICATE.Admin.Environments.VisibilityProviderPf2e',
      'FABRICATE.Admin.Environments.VisibilityMacro',
      'FABRICATE.Admin.Environments.NoMacroSelected',
      'FABRICATE.Admin.Environments.MissingMacroReferenceWarning',
      'FABRICATE.Admin.Environments.VisibilityFormula',
      'FABRICATE.Admin.Environments.VisibilityThreshold',
      'FABRICATE.Admin.Environments.ResultSelection',
      'FABRICATE.Admin.Environments.ResultSelectionProvider',
      'FABRICATE.Admin.Environments.ResultSelectionProviderMacro',
      'FABRICATE.Admin.Environments.ResultSelectionProviderRollTable',
      'FABRICATE.Admin.Environments.ResultSelectionMacro',
      'FABRICATE.Admin.Environments.RollTableUuid',
      'FABRICATE.Admin.Environments.RollTableSelect',
      'FABRICATE.Admin.Environments.NoRollTableSelected',
      'FABRICATE.Admin.Environments.MissingRollTableReferenceWarning',
      'FABRICATE.Admin.Environments.RollTableHint',
      'FABRICATE.Admin.Environments.Check',
      'FABRICATE.Admin.Environments.CheckProvider',
      'FABRICATE.Admin.Environments.CheckProviderMacro',
      'FABRICATE.Admin.Environments.CheckProviderDnd5e',
      'FABRICATE.Admin.Environments.CheckProviderPf2e',
      'FABRICATE.Admin.Environments.CheckMacro',
      'FABRICATE.Admin.Environments.CheckFormula',
      'FABRICATE.Admin.Environments.CheckThreshold',
      'FABRICATE.Admin.Environments.CheckThresholdOptional',
      'FABRICATE.Admin.Environments.CheckUnconfigured',
      'FABRICATE.Admin.Environments.ProgressiveAwardMode',
      'FABRICATE.Admin.Environments.ProgressiveAwardEqual',
      'FABRICATE.Admin.Environments.ProgressiveAwardPartial',
      'FABRICATE.Admin.Environments.ProgressiveAwardExceed',
      'FABRICATE.Admin.Environments.Catalysts',
      'FABRICATE.Admin.Environments.NoCatalysts',
      'FABRICATE.Admin.Environments.AddCatalyst',
      'FABRICATE.Admin.Environments.CatalystComponent',
      'FABRICATE.Admin.Environments.CatalystDegrades',
      'FABRICATE.Admin.Environments.CatalystDestroyWhenExhausted',
      'FABRICATE.Admin.Environments.CatalystMaxUses',
      'FABRICATE.Admin.Environments.CatalystMaxUsesUnlimited',
      'FABRICATE.Admin.Environments.DeleteCatalyst',
      'FABRICATE.Admin.Environments.ResultGroups',
      'FABRICATE.Admin.Environments.NoResultGroups',
      'FABRICATE.Admin.Environments.AddResultGroup',
      'FABRICATE.Admin.Environments.ResultGroupName',
      'FABRICATE.Admin.Environments.DeleteResultGroup',
      'FABRICATE.Admin.Environments.Results',
      'FABRICATE.Admin.Environments.NoResults',
      'FABRICATE.Admin.Environments.AddResult',
      'FABRICATE.Admin.Environments.ResultComponent',
      'FABRICATE.Admin.Environments.ResultQuantity',
      'FABRICATE.Admin.Environments.ResultDifficulty',
      'FABRICATE.Admin.Environments.NoManagedItemSelected',
      'FABRICATE.Admin.Environments.NewResultName',
      'FABRICATE.Admin.Environments.DeleteResult',
      'FABRICATE.Admin.Environments.Actions'
    ]) {
      assert.equal(typeof localeAt(key), 'string', `${key} should be localized`);
    }
  });
});
