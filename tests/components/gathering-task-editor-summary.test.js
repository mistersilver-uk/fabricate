import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dirname, '../..');
const editorPath = resolve(repoRoot, 'src/ui/svelte/apps/manager/GatheringTaskEditView.svelte');
const economyPath = resolve(repoRoot, 'src/ui/svelte/apps/manager/GatheringEconomyView.svelte');
const rootPath = resolve(repoRoot, 'src/ui/svelte/apps/manager/CraftingSystemManagerRoot.svelte');
// Issue 1707 phase 2 moved the two inspector branches out of the root into these leaves; the cards
// this file pins are theirs now, and the root's remaining facts are the editor mount and the draft.
const taskInspectorPath = resolve(
  repoRoot,
  'src/ui/svelte/apps/manager/environment/GatheringTaskInspector.svelte'
);
const eventInspectorPath = resolve(
  repoRoot,
  'src/ui/svelte/apps/manager/environment/GatheringEventInspector.svelte'
);
const langPath = resolve(repoRoot, 'lang/en.json');

const editorSource = readFileSync(editorPath, 'utf8');
const economySource = readFileSync(economyPath, 'utf8');
const rootSource = readFileSync(rootPath, 'utf8');
const taskInspectorSource = readFileSync(taskInspectorPath, 'utf8');
const inspectorSource = `${taskInspectorSource}\n${readFileSync(eventInspectorPath, 'utf8')}`;
const lang = JSON.parse(readFileSync(langPath, 'utf8'));

describe('Selected gathering task — drops summary lives in the inspector', () => {
  it('renders the drops summary inside the task inspector card', () => {
    assert.ok(taskInspectorSource.includes('data-task-drops-summary'), 'task inspector should expose the drops summary card');
    assert.ok(taskInspectorSource.includes('data-task-drops-summary-list'), 'drop summary list should expose a data attribute');
    assert.ok(taskInspectorSource.includes('data-task-drop-summary-chip'), 'each drop chip should expose a data attribute');
    assert.ok(taskInspectorSource.includes('data-task-environment-usage'), 'environment usage block should expose a data attribute');
    assert.ok(taskInspectorSource.includes('manager-task-drop-summary-thumb'), 'drop chip should include a thumbnail image');
    assert.ok(taskInspectorSource.includes('manager-task-environment-usage-card'), 'environment usage should render tiled cards');
    assert.ok(taskInspectorSource.includes('manager-task-environment-usage-thumb'), 'environment tile should include a thumbnail image');
    assert.ok(taskInspectorSource.includes('manager-task-environment-usage-grid'), 'environment tiles should sit in a grid container');
  });

  it('renders the environment usage as its own inspector card after the drops summary card', () => {
    const dropsIdx = taskInspectorSource.indexOf('data-task-drops-summary');
    const usageIdx = taskInspectorSource.indexOf('data-task-environment-usage');
    assert.ok(dropsIdx >= 0, 'drops summary attribute should exist');
    assert.ok(usageIdx > dropsIdx, 'environment usage should appear after the drops summary');
    // The card pin above already fixes the tile class; this test owns the order of the two cards,
    // and pinning the class twice in one file was one fact in two places (issue 1707 phase 2).
  });

  it('only shows the biome detail label when the value is user-defined (not "Any")', () => {
    // The trailing "Biome" label is guarded so "Any biome" is not shown redundantly
    // as "Any biome Biome". Region is no longer a composition fact in either inspector, and the
    // three needles are one fact — asked of both leaves at once, because the task and event
    // branches now live in two files (issue 1707 phase 2).
    for (const needle of [
      'recordRegions(',
      'data-gathering-task-fact="region"',
      'data-gathering-event-fact="region"',
    ]) {
      assert.equal(inspectorSource.includes(needle), false, `region fact ${needle} is removed`);
    }
    assert.ok(/data-gathering-task-fact="biomes"[\s\S]*?\{#if Array\.isArray\(task\.biomes\) && task\.biomes\.length > 0\}/.test(taskInspectorSource), 'task biome label should be conditional on user-defined biomes');
  });

  it('reads drop labels/images from existing task helpers and environment usage from enabledTaskIds', () => {
    assert.ok(taskInspectorSource.includes('gatheringDropImage(drop)'), 'inspector should reuse gatheringDropImage for the drop thumb');
    assert.ok(taskInspectorSource.includes('gatheringDropName(drop)'), 'inspector should reuse gatheringDropName for the drop label');
    assert.ok(rootSource.includes('enabledTaskIds'), 'the shell should filter environments by enabledTaskIds');
    assert.ok(taskInspectorSource.includes('environmentImage(environment)'), 'inspector should reuse environmentImage helper');
    assert.ok(taskInspectorSource.includes('environmentName(environment)'), 'inspector should reuse environmentName helper');
  });

  it('removes the drops summary from the task editor view', () => {
    assert.equal(editorSource.includes('data-task-drops-summary'), false, 'editor should no longer render the drops summary card');
    assert.equal(editorSource.includes('dropSummaryRows'), false, 'editor should no longer derive dropSummaryRows');
    assert.equal(editorSource.includes('referencingEnvironments'), false, 'editor should no longer derive referencingEnvironments');
    assert.equal(/environments\s*=\s*\[\]/.test(editorSource), false, 'editor should no longer accept an environments prop');
    assert.equal(/selectedSystemId\s*=\s*''/.test(editorSource), false, 'editor should no longer accept a selectedSystemId prop');
  });

  it('keeps the existing localization keys (now consumed by the inspector)', () => {
    const keys = lang.FABRICATE.Admin.Manager.Environment.Tasks;
    assert.equal(keys.DropsSummary, 'Drops summary');
    assert.equal(keys.NoDropsConfigured, 'No drops configured yet.');
    assert.equal(keys.UsedInEnvironments, 'Used in {count} environments');
    assert.equal(keys.UsedInOneEnvironment, 'Used in 1 environment');
    assert.equal(keys.NotUsedInEnvironments, 'Not used in any environments yet.');
    assert.ok(taskInspectorSource.includes('FABRICATE.Admin.Manager.Environment.Tasks.DropsSummary'));
    assert.ok(
      taskInspectorSource.includes('FABRICATE.Admin.Manager.Environment.Tasks.NotUsedInEnvironments')
    );
  });

  it('does not pass environments/selectedSystemId to the task editor mount', () => {
    const editorMountIndex = rootSource.indexOf('<GatheringTaskEditView');
    assert.ok(editorMountIndex >= 0, 'editor mount should be present in the manager root');
    const editorMountSlice = rootSource.slice(editorMountIndex, editorMountIndex + 2000);
    assert.equal(/\benvironments=\{environmentList\}/.test(editorMountSlice), false, 'editor mount should not pass environments anymore');
  });

  it('owns gathering resolution on the task editor and keeps the economy selector inert', () => {
    assert.ok(editorSource.includes('data-gathering-task-resolution-mode'));
    assert.ok(editorSource.includes("onUpdateTask({ resolutionMode: mode })"));
    assert.ok(editorSource.includes('KNOWN_RESOLUTION_MODES.has(task?.resolutionMode)'));
    assert.equal(economySource.includes('data-gathering-resolution-mode'), false);
    assert.equal(economySource.includes('setResolutionMode'), false);
  });

  it('routes task-mode authoring to the correct persisted result source', () => {
    assert.ok(editorSource.includes("taskResolutionMode === 'd100'"));
    assert.ok(editorSource.includes("taskResolutionMode === 'straight'"));
    assert.ok(editorSource.includes("taskResolutionMode === 'routed'"));
    assert.ok(editorSource.includes('<RecipeResultsSection'));
    assert.ok(editorSource.includes('<RecipeResultGroupCard'));
    assert.equal(editorSource.includes('checkOutcomeIds'), false);
    assert.ok(taskInspectorSource.includes("editingTask?.resolutionMode || 'd100'"));
    assert.ok(
      rootSource.includes(
        'Edit identity, availability, resolution, and results for the selected gathering task.'
      )
    );
  });

  it('renders active result validation beside the result editor', () => {
    assert.ok(editorSource.includes('resultValidationErrors = []'));
    assert.ok(editorSource.includes('data-gathering-task-results-validation'));
    assert.ok(rootSource.includes('resultValidationErrors={gatheringTaskValidation.resultErrors'));
  });
});
