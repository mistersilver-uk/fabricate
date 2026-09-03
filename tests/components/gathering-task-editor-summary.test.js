import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dirname, '../..');
const editorPath = resolve(repoRoot, 'src/ui/svelte/apps/manager/GatheringTaskEditView.svelte');
const rootPath = resolve(repoRoot, 'src/ui/svelte/apps/manager/CraftingSystemManagerRoot.svelte');
const langPath = resolve(repoRoot, 'lang/en.json');

const editorSource = readFileSync(editorPath, 'utf8');
const rootSource = readFileSync(rootPath, 'utf8');
const lang = JSON.parse(readFileSync(langPath, 'utf8'));

describe('Selected gathering task — drops summary lives in the inspector', () => {
  it('renders the drops summary inside the task inspector card', () => {
    assert.ok(rootSource.includes('data-task-drops-summary'), 'root inspector should expose the drops summary card');
    assert.ok(rootSource.includes('data-task-drops-summary-list'), 'drop summary list should expose a data attribute');
    assert.ok(rootSource.includes('data-task-drop-summary-chip'), 'each drop chip should expose a data attribute');
    assert.ok(rootSource.includes('data-task-environment-usage'), 'environment usage block should expose a data attribute');
    assert.ok(rootSource.includes('manager-task-drop-summary-thumb'), 'drop chip should include a thumbnail image');
    assert.ok(rootSource.includes('manager-task-environment-usage-card'), 'environment usage should render tiled cards');
    assert.ok(rootSource.includes('manager-task-environment-usage-thumb'), 'environment tile should include a thumbnail image');
    assert.ok(rootSource.includes('manager-task-environment-usage-grid'), 'environment tiles should sit in a grid container');
  });

  it('renders the environment usage as its own inspector card after the drops summary card', () => {
    const dropsIdx = rootSource.indexOf('data-task-drops-summary');
    const usageIdx = rootSource.indexOf('data-task-environment-usage');
    assert.ok(dropsIdx >= 0, 'drops summary attribute should exist');
    assert.ok(usageIdx > dropsIdx, 'environment usage should appear after the drops summary');
    assert.ok(
      rootSource.includes('manager-task-environment-usage-card'),
      'environment usage should live in its own inspector card'
    );
  });

  it('only shows the biome detail label when the value is user-defined (not "Any")', () => {
    // The trailing "Biome" label is guarded so "Any biome" is not shown redundantly
    // as "Any biome Biome". Region is no longer a composition fact in the inspector.
    assert.equal(rootSource.includes('recordRegions('), false, 'region fact is removed from the task/event inspector');
    assert.equal(rootSource.includes('data-gathering-task-fact="region"'), false, 'task region fact is removed');
    assert.equal(rootSource.includes('data-gathering-event-fact="region"'), false, 'event region fact is removed');
    assert.ok(/data-gathering-task-fact="biomes"[\s\S]*?\{#if Array\.isArray\(selectedGatheringTask\.biomes\) && selectedGatheringTask\.biomes\.length > 0\}/.test(rootSource), 'task biome label should be conditional on user-defined biomes');
  });

  it('reads drop labels/images from existing task helpers and environment usage from enabledTaskIds', () => {
    assert.ok(rootSource.includes('gatheringDropImage(drop)'), 'inspector should reuse gatheringDropImage for the drop thumb');
    assert.ok(rootSource.includes('gatheringDropName(drop)'), 'inspector should reuse gatheringDropName for the drop label');
    assert.ok(rootSource.includes('enabledTaskIds'), 'inspector should filter environments by enabledTaskIds');
    assert.ok(rootSource.includes('environmentImage(environment)'), 'inspector should reuse environmentImage helper');
    assert.ok(rootSource.includes('environmentName(environment)'), 'inspector should reuse environmentName helper');
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
    assert.ok(rootSource.includes('FABRICATE.Admin.Manager.Environment.Tasks.DropsSummary'));
    assert.ok(rootSource.includes('FABRICATE.Admin.Manager.Environment.Tasks.NotUsedInEnvironments'));
  });

  it('does not pass environments/selectedSystemId to the task editor mount', () => {
    const editorMountIndex = rootSource.indexOf('<GatheringTaskEditView');
    assert.ok(editorMountIndex >= 0, 'editor mount should be present in the manager root');
    const editorMountSlice = rootSource.slice(editorMountIndex, editorMountIndex + 2000);
    assert.equal(/\benvironments=\{environmentList\}/.test(editorMountSlice), false, 'editor mount should not pass environments anymore');
  });
});
