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

describe('GatheringTaskEditView drops summary card', () => {
  it('accepts environments and selectedSystemId props', () => {
    assert.ok(/environments\s*=\s*\[\]/.test(editorSource), 'editor should accept an environments prop with a default');
    assert.ok(/selectedSystemId\s*=\s*''/.test(editorSource), 'editor should accept a selectedSystemId prop with a default');
  });

  it('derives drop summary rows and referencing environments', () => {
    assert.ok(editorSource.includes('const dropSummaryRows = $derived'), 'editor should derive dropSummaryRows');
    assert.ok(editorSource.includes('const referencingEnvironments = $derived'), 'editor should derive referencingEnvironments');
    assert.ok(editorSource.includes('enabledTaskIds'), 'referencingEnvironments should filter by enabledTaskIds');
    assert.ok(editorSource.includes('craftingSystemId'), 'referencingEnvironments should respect craftingSystemId scoping');
  });

  it('renders a drops summary card with image chips and environment usage chips', () => {
    assert.ok(editorSource.includes('data-task-drops-summary'), 'card should expose a data attribute for tests');
    assert.ok(editorSource.includes('data-task-drops-summary-list'), 'drop summary list should expose a data attribute');
    assert.ok(editorSource.includes('data-task-drop-summary-chip'), 'individual drop summary chip should expose a data attribute');
    assert.ok(editorSource.includes('data-task-environment-usage'), 'environment usage section should expose a data attribute');
    assert.ok(editorSource.includes('manager-task-drop-summary-thumb'), 'drop chips include a thumbnail image');
    assert.ok(editorSource.includes('manager-task-environment-usage-chip'), 'environment usage uses chip styling');
  });

  it('references the new localization keys', () => {
    const keys = lang.FABRICATE.Admin.Manager.Environment.Tasks;
    assert.equal(keys.DropsSummary, 'Drops summary');
    assert.equal(keys.NoDropsConfigured, 'No drops configured yet.');
    assert.equal(keys.UsedInEnvironments, 'Used in {count} environments');
    assert.equal(keys.UsedInOneEnvironment, 'Used in 1 environment');
    assert.equal(keys.NotUsedInEnvironments, 'Not used in any environments yet.');
    assert.ok(editorSource.includes('FABRICATE.Admin.Manager.Environment.Tasks.DropsSummary'));
    assert.ok(editorSource.includes('FABRICATE.Admin.Manager.Environment.Tasks.UsedInEnvironments'));
    assert.ok(editorSource.includes('FABRICATE.Admin.Manager.Environment.Tasks.NotUsedInEnvironments'));
  });

  it('is wired with environments and selectedSystemId from the manager root', () => {
    assert.ok(rootSource.includes('environments={environmentList}'), 'root should pass environmentList to GatheringTaskEditView');
    const editorMountIndex = rootSource.indexOf('<GatheringTaskEditView');
    assert.ok(editorMountIndex >= 0, 'editor mount should be present in the manager root');
    const editorMountSlice = rootSource.slice(editorMountIndex, editorMountIndex + 2000);
    assert.ok(/\benvironments=\{environmentList\}/.test(editorMountSlice), 'task editor mount should receive environments');
    assert.ok(/\{selectedSystemId\}/.test(editorMountSlice), 'task editor mount should receive selectedSystemId');
  });
});
