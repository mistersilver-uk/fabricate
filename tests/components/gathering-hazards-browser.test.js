import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dirname, '../..');
const browserPath = resolve(repoRoot, 'src/ui/svelte/apps/manager/GatheringHazardsBrowserView.svelte');
const environmentsBrowserPath = resolve(repoRoot, 'src/ui/svelte/apps/manager/EnvironmentsBrowserView.svelte');
const rootPath = resolve(repoRoot, 'src/ui/svelte/apps/manager/CraftingSystemManagerRoot.svelte');
const langPath = resolve(repoRoot, 'lang/en.json');

const browserSource = readFileSync(browserPath, 'utf8');
const environmentsBrowserSource = readFileSync(environmentsBrowserPath, 'utf8');
const rootSource = readFileSync(rootPath, 'utf8');
const lang = JSON.parse(readFileSync(langPath, 'utf8'));

describe('GatheringHazardsBrowserView source contract', () => {
  it('renders a hazard library tabpanel with the expected toolbar filters', () => {
    assert.ok(browserSource.includes("class=\"manager-gathering-panel manager-gathering-panel-hazards\""), 'browser should use the hazard panel class');
    assert.ok(browserSource.includes('data-gathering-hazards-browser'), 'browser should expose a data attribute hook for tests');
    assert.ok(browserSource.includes("type=\"search\""), 'browser should include a search input');
    assert.ok(browserSource.includes('bind:value={searchTerm}'), 'browser should bind the search term');
    assert.ok(browserSource.includes("value={statusFilter}"), 'browser should expose a status filter');
    assert.ok(browserSource.includes("value={regionFilter}"), 'browser should expose a region filter');
    assert.ok(browserSource.includes("value={biomeFilter}"), 'browser should expose a biome filter');
    assert.ok(browserSource.includes("value={dangerFilter}"), 'browser should expose a danger tag filter');
  });

  it('exposes row identity, status toggle, and the create/edit/duplicate/delete actions', () => {
    assert.ok(browserSource.includes('data-gathering-hazard-id={hazard.id}'), 'rows should expose a data attribute for assertions');
    assert.ok(browserSource.includes('manager-gathering-hazard-identity'), 'each row should use a hazard identity button');
    assert.ok(browserSource.includes('onCreateHazard'), 'browser should call onCreateHazard');
    assert.ok(browserSource.includes('onEditHazard'), 'browser should call onEditHazard');
    assert.ok(browserSource.includes('onDuplicateHazard'), 'browser should call onDuplicateHazard');
    assert.ok(browserSource.includes('onDeleteHazard'), 'browser should call onDeleteHazard');
    assert.ok(browserSource.includes('onToggleHazardEnabled'), 'browser should call onToggleHazardEnabled');
  });

  it('counts referenced environments using enabledHazardIds', () => {
    assert.ok(
      browserSource.includes('enabledHazardIds'),
      'environment usage count must read from environment.enabledHazardIds so deletion confirmation maths matches the store'
    );
  });

  it('replaces the encounters placeholder with the new hazard library tabpanel', () => {
    assert.ok(
      environmentsBrowserSource.includes("activeGatheringTab === 'encounters'"),
      'EnvironmentsBrowserView should render the encounters tab when the active tab is encounters'
    );
    assert.ok(
      environmentsBrowserSource.includes('<GatheringHazardsBrowserView'),
      'EnvironmentsBrowserView should mount the new GatheringHazardsBrowserView component'
    );
    assert.ok(
      !environmentsBrowserSource.includes('EncountersPlaceholderTitle'),
      'placeholder localization keys should be replaced with non-placeholder keys once hazard authoring lands'
    );
    assert.ok(
      environmentsBrowserSource.includes('EncountersTitle'),
      'hazards tab should use the EncountersTitle key now that the placeholder is gone'
    );
  });

  it('wires hazard CRUD and selection state through the manager root', () => {
    assert.ok(rootSource.includes('selectedGatheringHazardId'), 'manager root should track the selected hazard id');
    assert.ok(rootSource.includes('function selectGatheringHazard'), 'manager root should expose selectGatheringHazard');
    assert.ok(rootSource.includes('function createGatheringHazard'), 'manager root should expose createGatheringHazard');
    assert.ok(rootSource.includes('function duplicateGatheringHazard'), 'manager root should expose duplicateGatheringHazard');
    assert.ok(rootSource.includes('function deleteGatheringHazard'), 'manager root should expose deleteGatheringHazard');
    assert.ok(rootSource.includes('function toggleGatheringHazardEnabled'), 'manager root should expose toggleGatheringHazardEnabled');
    assert.ok(rootSource.includes('function updateSelectedGatheringHazard'), 'manager root should expose updateSelectedGatheringHazard');
    assert.ok(rootSource.includes('store.duplicateGatheringLibraryHazard'), 'manager root should call the new store duplicate action');
  });

  it('localizes the hazard library labels', () => {
    const hazardsNamespace = lang.FABRICATE.Admin.Manager.Environment.Hazards;
    assert.ok(hazardsNamespace, 'lang/en.json should declare the Hazards namespace');
    for (const key of ['Filters', 'SearchPlaceholder', 'Create', 'Edit', 'Duplicate', 'Delete', 'DangerTags', 'DropRate', 'Environments', 'EmptyTitle']) {
      assert.ok(hazardsNamespace[key], `lang/en.json Hazards namespace should declare ${key}`);
    }
    assert.equal(lang.FABRICATE.Admin.Manager.Environment.GatheringTabs.EncountersTitle, 'Gathering hazards');
    assert.ok(
      !lang.FABRICATE.Admin.Manager.Environment.GatheringTabs.EncountersPlaceholderTitle,
      'placeholder title key should be removed once hazard authoring lands'
    );
  });
});
