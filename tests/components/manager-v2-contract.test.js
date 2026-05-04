import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dirname, '../..');
const rootPath = resolve(repoRoot, 'src/ui/svelte/apps/manager-v2/CraftingSystemManagerV2Root.svelte');
const appPath = resolve(repoRoot, 'src/ui/SvelteCraftingSystemManagerV2App.svelte.js');
const mainPath = resolve(repoRoot, 'src/main.js');
const langPath = resolve(repoRoot, 'lang/en.json');

const rootSource = readFileSync(rootPath, 'utf8');
const appSource = readFileSync(appPath, 'utf8');
const mainSource = readFileSync(mainPath, 'utf8');
const lang = JSON.parse(readFileSync(langPath, 'utf8'));

describe('CraftingSystemManagerV2 source contract', () => {
  it('self-registers as a parallel manager app without replacing the legacy manager', () => {
    assert.ok(
      appSource.includes("extends SvelteRecipeManagerApp"),
      'v2 wrapper should reuse the current manager store/service plumbing'
    );
    assert.ok(
      appSource.includes('registerCraftingSystemManagerV2App(SvelteCraftingSystemManagerV2App)'),
      'v2 wrapper should self-register with the v2 registry'
    );
    assert.ok(
      appSource.includes('openCurrentAdmin'),
      'v2 wrapper should expose an explicit legacy admin launch service during additive rollout'
    );
    assert.ok(
      mainSource.includes("import './ui/SvelteRecipeManagerApp.svelte.js';"),
      'legacy manager side-effect import should remain'
    );
    assert.ok(
      mainSource.includes("import './ui/SvelteCraftingSystemManagerV2App.svelte.js';"),
      'v2 manager side-effect import should be present for registry wiring'
    );
  });

  it('renders the manager-v2 shell with Systems and Recipes browser structures', () => {
    for (const snippet of [
      'class="fabricate-manager-v2"',
      'data-manager-v2-view={currentView}',
      'class="manager-v2-header"',
      'class="manager-v2-breadcrumbs"',
      'class="manager-v2-body"',
      'class="manager-v2-rail"',
      'class="manager-v2-main"',
      'class="manager-v2-inspector"',
      'class="manager-v2-toolbar"',
      'class="manager-v2-filter"',
      'class="manager-v2-systems-table"',
      'class="manager-v2-empty"',
      'class="manager-v2-recipes-table"',
      'manager-v2-recipe-row',
      'class="manager-v2-recipe-identity"',
      'manager-v2-recipe-status',
      'class="manager-v2-component-drop-zone"',
      'class={componentTableClass}',
      'manager-v2-component-row',
      'class="manager-v2-component-identity"',
      'EssenceBrowserView',
      'EnvironmentEditView',
      'manager-v2-environment-edit-main',
      'manager-v2-system-edit-form',
      'manager-v2-toggle-row'
    ]) {
      assert.ok(rootSource.includes(snippet), `root should include ${snippet}`);
    }
  });

  it('keeps presentational Svelte free of direct Foundry globals', () => {
    assert.ok(!/\b(?:game|ui|Hooks|CONFIG)\b/.test(rootSource), 'root should not directly reference Foundry globals');
  });

  it('uses localized manager-v2 copy keys', () => {
    assert.ok(rootSource.includes('FABRICATE.Admin.ManagerV2.Title'), 'root should use manager-v2 localization keys');
    assert.ok(lang.FABRICATE.Admin.ManagerV2, 'English localization should define manager-v2 copy');
    assert.equal(lang.FABRICATE.Admin.ManagerV2.Title, 'Crafting systems');
    assert.equal(lang.FABRICATE.Admin.ManagerV2.Nav.Components, 'Components');
    assert.equal(lang.FABRICATE.Admin.ManagerV2.OpenCurrentAdmin, 'Open current admin');
    assert.equal(lang.FABRICATE.Admin.ManagerV2.Breadcrumbs, 'Breadcrumbs');
    assert.equal(lang.FABRICATE.Admin.ManagerV2.EditSystem, 'Edit system');
    assert.equal(lang.FABRICATE.Admin.ManagerV2.ReturnToSystemLibrary, 'Return to System Library');
    assert.equal(lang.FABRICATE.Admin.ManagerV2.StatusOn, 'On');
    assert.equal(lang.FABRICATE.Admin.ManagerV2.StatusOff, 'Off');
    assert.equal(lang.FABRICATE.Admin.ManagerV2.EnableSystemNamed, 'Enable {name}');
    assert.equal(lang.FABRICATE.Admin.ManagerV2.DisableSystemNamed, 'Disable {name}');
    assert.equal(lang.FABRICATE.Admin.ManagerV2.SystemEdit.Title, 'System settings');
    assert.equal(lang.FABRICATE.Admin.ManagerV2.SystemEdit.SaveDetails, 'Save details');
    assert.equal(lang.FABRICATE.Admin.ManagerV2.Recipe.Title, 'Recipes');
    assert.equal(lang.FABRICATE.Admin.ManagerV2.Recipe.Requirements, 'Requirements');
    assert.equal(lang.FABRICATE.Admin.ManagerV2.Component.Title, 'Components');
    assert.equal(lang.FABRICATE.Admin.ManagerV2.Component.DropZoneTitle, 'Drop items to add components');
    assert.equal(lang.FABRICATE.Admin.ManagerV2.Component.SourceLinked, 'Linked source');
    assert.equal(lang.FABRICATE.Admin.ManagerV2.Essence.Title, 'Essences');
    assert.equal(lang.FABRICATE.Admin.ManagerV2.Essence.Library, 'Essence browser');
    assert.equal(lang.FABRICATE.Admin.ManagerV2.Essence.SourceLinked, 'Linked source');
  });

  it('routes system Edit to the in-place v2 edit view and existing store callbacks', () => {
    assert.ok(!rootSource.includes('openLegacySystemSettings'), 'root should not keep dead legacy edit routing');
    assert.ok(!rootSource.includes('Edit details'), 'root should not show the former dead edit details label');
    assert.ok(!rootSource.includes('services?.onEditSystem'), 'root should not launch the current admin for system row Edit');
    assert.ok(rootSource.includes('FABRICATE.Admin.ManagerV2.EditSystem'), 'root should expose a localized system edit action');
    assert.ok(rootSource.includes("activeView = 'system-edit'"), 'system row Edit should transition to the local edit route');
    assert.ok(rootSource.includes('store.saveSystemDetails?.('), 'system edit should save details through the admin store');
    assert.ok(rootSource.includes('store.setResolutionMode?.(nextMode)'), 'system edit should delegate resolution changes to the admin store');
    assert.ok(!rootSource.includes("value: 'routed'"), 'system edit should not offer unsupported routed persistence values before runtime support exists');
    assert.ok(rootSource.includes("value: 'mapped'"), 'system edit should retain the existing routed-by-ingredients persistence value');
    assert.ok(rootSource.includes("value: 'tiered'"), 'system edit should retain the existing routed-by-check persistence value');
    assert.ok(rootSource.includes('store.toggleAdvancedOptions?.'), 'system edit should delegate advanced visibility changes to the admin store');
    assert.ok(rootSource.includes('store.toggleFeature?.(feature.storeKey'), 'system edit should delegate feature toggles to the admin store');
    assert.ok(!rootSource.includes("storeKey: 'complexRecipes'"), 'system edit should not reintroduce the legacy complex recipes toggle');
    assert.ok(!rootSource.includes("storeKey: 'craftingChecks'"), 'system edit should not reintroduce the legacy crafting checks toggle');
    assert.ok(!rootSource.includes("storeKey: 'outcomeRouting'"), 'system edit should not reintroduce the legacy outcome routing toggle');
    assert.ok(!appSource.includes('onEditSystem'), 'v2 wrapper should not provide a row edit service for this action');
    assert.ok(appSource.includes('openCurrentAdmin'), 'v2 wrapper should keep the explicit legacy fallback');
    assert.ok(!appSource.includes('LAST_MANAGED_CRAFTING_SYSTEM'), 'v2 row edit should not seed and launch the current admin');
  });

  it('keeps first-slice action and navigation hierarchy focused', () => {
    assert.ok(!rootSource.includes('function viewKicker'), 'top-bar view kickers should not duplicate the page title');
    assert.ok(!rootSource.includes('{viewKicker()}'), 'top-bar header should render only the page title and subtitle');
    assert.ok(
      rootSource.includes('visiblePlaceholderViews'),
      'root should derive selected-system placeholder nav from selection and feature gates'
    );
    assert.ok(rootSource.includes('selectSystemAndShowBrowser'), 'root should keep an explicit systems-browser route');
    assert.ok(rootSource.includes('manager-v2-scope-card'), 'root should render selected system scope as static rail text');
    assert.ok(rootSource.includes('manager-v2-scope-return'), 'root should expose a return-to-system-library rail action');
    assert.ok(rootSource.includes('FABRICATE.Admin.ManagerV2.ReturnToSystemLibrary'), 'return-to-library action should be localized');
    assert.ok(rootSource.includes("setView('essences')"), 'essences should be exposed as a real selected-system route');
    assert.ok(!rootSource.includes("{ id: 'essences'"), 'essences should not remain a disabled placeholder route');
    assert.ok(!rootSource.includes('clearSelectedSystem'), 'root should not expose a selected-system clear route');
    assert.ok(!rootSource.includes("selectSystem('', 'systems')"), 'selected-system rail should not clear real store selection');
    assert.ok(!rootSource.includes('manager-v2-scope-clear'), 'selected-system rail should not render the old x clear icon');
    assert.ok(rootSource.includes('toggleSystemEnabled'), 'systems browser should expose interactive row status toggles');
    assert.ok(rootSource.includes('manager-v2-status-toggle'), 'systems browser should render status as a toggle control');
    assert.ok(!rootSource.includes("setView('systems')"), 'systems should not be exposed as a left-rail tab');
    assert.ok(!rootSource.includes('manager-v2-count-cluster'), 'system rows should not duplicate inspector counts inline');
    assert.ok(!rootSource.includes('FABRICATE.Admin.ManagerV2.QuickActions'), 'inspector should not duplicate row actions');
    assert.equal(lang.FABRICATE.Admin.ManagerV2.SystemLibraryHint, 'Select a row to view counts and enabled features.');
    assert.equal(
      lang.FABRICATE.Admin.ManagerV2.InspectorHint,
      'The inspector shows counts, resolution mode, and enabled features for the selected system.'
    );
  });

  it('keeps the recipes browser browser-only and wired to existing callbacks', () => {
    for (const snippet of [
      'store.createRecipe?.()',
      'store.setRecipeSearch?.',
      'store.toggleRecipeEnabled?.',
      'store.importRecipes?.()',
      'store.exportRecipes?.()',
      'store.duplicateRecipe?.(recipeId)',
      'store.deleteRecipe?.(recipeId)',
      'services?.onEditRecipe?.(recipeId)'
    ]) {
      assert.ok(rootSource.includes(snippet), `root should wire ${snippet}`);
    }
    assert.ok(!rootSource.includes('saveRecipe'), 'recipes browser should not introduce inline save behavior');
    assert.ok(!rootSource.includes('required station'), 'recipes browser should not introduce unsupported recipe fields');
  });

  it('keeps the components browser browser-only and wired to existing component callbacks', () => {
    for (const snippet of [
      'store.setItemSearch?.',
      'services?.onDropItem?.(data)',
      'services?.onEditComponent?.(itemId)',
      'store.deleteComponent?.(itemId)',
      'services?.onCopySourceUuid?.(uuid)'
    ]) {
      assert.ok(rootSource.includes(snippet), `root should wire ${snippet}`);
    }
    assert.ok(rootSource.includes("activeView = view"), 'components should use the selected-system route state');
    assert.ok(!rootSource.includes('saveComponent'), 'components browser should not introduce inline save behavior');
    assert.ok(!rootSource.includes('usageCount ='), 'components browser should not invent usage counts');
    assert.ok(!rootSource.includes('stale source'), 'components browser should not invent source freshness labels');
  });

  it('uses a purpose-built manager-v2 environment editor instead of mounting the legacy tab', () => {
    assert.ok(
      rootSource.includes("import EnvironmentEditView from './EnvironmentEditView.svelte';"),
      'environment edit route should import the v2 editor view'
    );
    assert.ok(!rootSource.includes("import EnvironmentsTab from '../EnvironmentsTab.svelte';"), 'manager-v2 root should not import the full legacy environments tab');
    assert.ok(!rootSource.includes('forceEditorOpen'), 'manager-v2 edit route should not force-open the legacy environment editor');
    for (const snippet of [
      'store.updateEnvironmentDraft',
      'store.saveEnvironmentDraft',
      'store.duplicateEnvironmentDraft',
      'store.deleteEnvironmentDraft',
      'store.moveEnvironmentDraft',
      'store.addEnvironmentTask',
      'store.updateEnvironmentTask',
      'store.addEnvironmentTaskResultGroup',
      'store.addEnvironmentTaskCatalyst',
      'store.updateEnvironmentTaskVisibility',
      'store.updateEnvironmentTaskResultSelection',
      'store.updateEnvironmentTaskProgressive',
      'store.updateEnvironmentTaskCheck',
      'store.updateEnvironmentTaskTimeRequirement',
      'store.updateEnvironmentTaskFailureOutcome'
    ]) {
      assert.ok(rootSource.includes(snippet), `environment edit route should wire ${snippet}`);
    }
    assert.equal(lang.FABRICATE.Admin.ManagerV2.Environment.TaskTabDetails, 'Task Details');
    assert.equal(lang.FABRICATE.Admin.ManagerV2.Environment.EvidenceColumn, 'Environment evidence');
  });
});
