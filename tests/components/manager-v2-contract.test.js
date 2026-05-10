import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dirname, '../..');
const rootPath = resolve(repoRoot, 'src/ui/svelte/apps/manager-v2/CraftingSystemManagerV2Root.svelte');
const essenceBrowserPath = resolve(repoRoot, 'src/ui/svelte/apps/manager-v2/EssenceBrowserView.svelte');
const essenceEditPath = resolve(repoRoot, 'src/ui/svelte/apps/manager-v2/EssenceEditView.svelte');
const tagsCategoriesPath = resolve(repoRoot, 'src/ui/svelte/apps/manager-v2/TagsCategoriesView.svelte');
const systemEditPath = resolve(repoRoot, 'src/ui/svelte/apps/manager-v2/SystemEditView.svelte');
const systemsBrowserPath = resolve(repoRoot, 'src/ui/svelte/apps/manager-v2/SystemsBrowserView.svelte');
const recipesBrowserPath = resolve(repoRoot, 'src/ui/svelte/apps/manager-v2/RecipesBrowserView.svelte');
const componentEditPath = resolve(repoRoot, 'src/ui/svelte/apps/manager-v2/ComponentEditView.svelte');
const componentsBrowserPath = resolve(repoRoot, 'src/ui/svelte/apps/manager-v2/ComponentsBrowserView.svelte');
const environmentEditPath = resolve(repoRoot, 'src/ui/svelte/apps/manager-v2/EnvironmentEditView.svelte');
const environmentsBrowserPath = resolve(repoRoot, 'src/ui/svelte/apps/manager-v2/EnvironmentsBrowserView.svelte');
const gatheringTasksBrowserPath = resolve(repoRoot, 'src/ui/svelte/apps/manager-v2/GatheringTasksBrowserView.svelte');
const appPath = resolve(repoRoot, 'src/ui/SvelteCraftingSystemManagerV2App.svelte.js');
const mainPath = resolve(repoRoot, 'src/main.js');
const langPath = resolve(repoRoot, 'lang/en.json');

const rootSource = readFileSync(rootPath, 'utf8');
const essenceBrowserSource = readFileSync(essenceBrowserPath, 'utf8');
const essenceEditSource = readFileSync(essenceEditPath, 'utf8');
const tagsCategoriesSource = readFileSync(tagsCategoriesPath, 'utf8');
const systemEditSource = readFileSync(systemEditPath, 'utf8');
const systemsBrowserSource = readFileSync(systemsBrowserPath, 'utf8');
const recipesBrowserSource = readFileSync(recipesBrowserPath, 'utf8');
const componentEditSource = readFileSync(componentEditPath, 'utf8');
const componentsBrowserSource = readFileSync(componentsBrowserPath, 'utf8');
const environmentEditSource = readFileSync(environmentEditPath, 'utf8');
const environmentsBrowserSource = readFileSync(environmentsBrowserPath, 'utf8');
const gatheringTasksBrowserSource = readFileSync(gatheringTasksBrowserPath, 'utf8');
const appSource = readFileSync(appPath, 'utf8');
const mainSource = readFileSync(mainPath, 'utf8');
const lang = JSON.parse(readFileSync(langPath, 'utf8'));

const managerV2Source = [rootSource, essenceBrowserSource, essenceEditSource, tagsCategoriesSource, systemEditSource, systemsBrowserSource, recipesBrowserSource, componentsBrowserSource, componentEditSource, environmentEditSource, environmentsBrowserSource, gatheringTasksBrowserSource].join('\n');

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
      'class="manager-v2-inspector"',
      'ComponentsBrowserView',
      'EnvironmentsBrowserView',
      'EssenceBrowserView',
      'EssenceEditView',
      'TagsCategoriesView',
      'EnvironmentEditView',
      'RecipesBrowserView',
      'SystemEditView',
      'SystemsBrowserView',
      'manager-v2-environment-edit-main'
    ]) {
      assert.ok(rootSource.includes(snippet), `root should include ${snippet}`);
    }
    for (const snippet of [
      'class="manager-v2-main"',
      'class="manager-v2-toolbar"',
      'class="manager-v2-filter"',
      'class="manager-v2-empty"'
    ]) {
      assert.ok(managerV2Source.includes(snippet), `manager-v2 source should include ${snippet}`);
    }
    for (const snippet of [
      'class="manager-v2-component-drop-zone"',
      'class={componentTableClass}',
      'manager-v2-component-row',
      'class="manager-v2-component-identity"'
    ]) {
      assert.ok(componentsBrowserSource.includes(snippet), `ComponentsBrowserView should include ${snippet}`);
    }
    for (const snippet of [
      'manager-v2-system-edit-form',
      'manager-v2-toggle-row'
    ]) {
      assert.ok(systemEditSource.includes(snippet), `SystemEditView should include ${snippet}`);
    }
    for (const snippet of [
      'class="manager-v2-systems-table"',
      'manager-v2-system-row',
      'manager-v2-system-identity'
    ]) {
      assert.ok(systemsBrowserSource.includes(snippet), `SystemsBrowserView should include ${snippet}`);
    }
    for (const snippet of [
      'class="manager-v2-recipes-table"',
      'manager-v2-recipe-row',
      'class="manager-v2-recipe-identity"',
      'manager-v2-recipe-status'
    ]) {
      assert.ok(recipesBrowserSource.includes(snippet), `RecipesBrowserView should include ${snippet}`);
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
    assert.equal(lang.FABRICATE.Admin.ManagerV2.Nav.Environments, 'Gathering');
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
    assert.equal(lang.FABRICATE.Admin.ManagerV2.SystemEdit.EditBadge, undefined);
    assert.equal(lang.FABRICATE.Admin.ManagerV2.Recipe.Title, 'Recipes');
    assert.equal(lang.FABRICATE.Admin.ManagerV2.Recipe.Requirements, 'Requirements');
    assert.equal(lang.FABRICATE.Admin.ManagerV2.Recipe.EnableNamed, 'Enable {name}');
    assert.equal(lang.FABRICATE.Admin.ManagerV2.Recipe.DisableNamed, 'Disable {name}');
    assert.equal(lang.FABRICATE.Admin.ManagerV2.Component.Title, 'Components');
    assert.equal(lang.FABRICATE.Admin.ManagerV2.Component.DropZoneTitle, 'Drop items to add components');
    assert.equal(lang.FABRICATE.Admin.ManagerV2.Component.Origin, 'Origin');
    assert.equal(lang.FABRICATE.Admin.ManagerV2.Component.SourceOriginCompendium, 'Compendium');
    assert.equal(lang.FABRICATE.Admin.ManagerV2.TagsCategories.Title, 'Tags & Categories');
    assert.equal(lang.FABRICATE.Admin.ManagerV2.TagsCategories.Library, 'Tags & Categories');
    assert.equal(lang.FABRICATE.Admin.ManagerV2.TagsCategories.GeneralReservedFeedback, 'General is already available as the base category.');
    assert.equal(lang.FABRICATE.Admin.ManagerV2.Essence.Title, 'Essences');
    assert.equal(lang.FABRICATE.Admin.ManagerV2.Essence.Library, 'Essence browser');
    assert.equal(lang.FABRICATE.Admin.ManagerV2.Essence.EditTitle, 'Edit essence');
    assert.equal(lang.FABRICATE.Admin.ManagerV2.Essence.EditBreadcrumb, 'Edit essence');
    assert.equal(lang.FABRICATE.Admin.ManagerV2.Essence.CreateBreadcrumb, 'Create essence');
    assert.equal(lang.FABRICATE.Admin.ManagerV2.Essence.SourceLinkedFilter, 'Linked');
    assert.equal(lang.FABRICATE.Admin.ManagerV2.Essence.SourceNoneShort, 'None');
  });

  it('routes system Edit to the in-place v2 edit view and existing store callbacks', () => {
    assert.ok(!rootSource.includes('openLegacySystemSettings'), 'root should not keep dead legacy edit routing');
    assert.ok(!rootSource.includes('Edit details'), 'root should not show the former dead edit details label');
    assert.ok(!rootSource.includes('services?.onEditSystem'), 'root should not launch the current admin for system row Edit');
    assert.ok(managerV2Source.includes('FABRICATE.Admin.ManagerV2.EditSystem'), 'manager-v2 should expose a localized system edit action');
    assert.ok(rootSource.includes("activeView = 'system-edit'"), 'system row Edit should transition to the local edit route');
    assert.ok(managerV2Source.includes('store.saveSystemDetails?.('), 'system edit should save details through the admin store');
    assert.ok(managerV2Source.includes('onSetResolutionMode(nextMode)') || managerV2Source.includes('store.setResolutionMode?.(nextMode)'), 'system edit should delegate resolution changes to the admin store');
    assert.ok(rootSource.includes('store.setResolutionMode?.'), 'root should pass the resolution-mode callback through to the system-edit view');
    assert.ok(!managerV2Source.includes("value: 'routed'"), 'system edit should not offer unsupported routed persistence values before runtime support exists');
    assert.ok(managerV2Source.includes("value: 'mapped'"), 'system edit should retain the existing routed-by-ingredients persistence value');
    assert.ok(managerV2Source.includes("value: 'tiered'"), 'system edit should retain the existing routed-by-check persistence value');
    assert.ok(rootSource.includes('store.toggleAdvancedOptions?.'), 'root should delegate advanced visibility changes to the admin store');
    assert.ok(rootSource.includes('store.toggleFeature?.'), 'root should delegate feature toggles to the admin store');
    assert.ok(!managerV2Source.includes("storeKey: 'complexRecipes'"), 'system edit should not reintroduce the legacy complex recipes toggle');
    assert.ok(!managerV2Source.includes("storeKey: 'craftingChecks'"), 'system edit should not reintroduce the legacy crafting checks toggle');
    assert.ok(!managerV2Source.includes("storeKey: 'outcomeRouting'"), 'system edit should not reintroduce the legacy outcome routing toggle');
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
    assert.ok(!rootSource.includes('SystemEdit.EditBadge'), 'system settings nav should not render the former Edit badge');
    assert.ok(rootSource.includes("setView('essences')"), 'essences should be exposed as a real selected-system route');
    assert.ok(rootSource.includes("setView('tags')"), 'tags and categories should be exposed as a real selected-system route');
    assert.ok(rootSource.includes("activeView = 'essence-edit'"), 'essence edit actions should transition to the local edit route');
    assert.ok(!rootSource.includes("{ id: 'essences'"), 'essences should not remain a disabled placeholder route');
    assert.ok(!rootSource.includes("{ id: 'tags'"), 'tags should not remain a disabled placeholder route');
    assert.ok(!rootSource.includes('clearSelectedSystem'), 'root should not expose a selected-system clear route');
    assert.ok(!rootSource.includes("selectSystem('', 'systems')"), 'selected-system rail should not clear real store selection');
    assert.ok(!rootSource.includes('manager-v2-scope-clear'), 'selected-system rail should not render the old x clear icon');
    assert.ok(managerV2Source.includes('toggleSystemEnabled'), 'systems browser should expose interactive row status toggles');
    assert.ok(systemsBrowserSource.includes('manager-v2-status-toggle'), 'systems browser should render status as a toggle control');
    assert.ok(recipesBrowserSource.includes('manager-v2-status-toggle'), 'recipes browser should render status as a toggle control');
    assert.ok(!recipesBrowserSource.includes('type="checkbox"\n                  checked={recipe.enabled !== false}'), 'recipes browser should not render recipe status as a checkbox');
    assert.ok(!rootSource.includes("setView('systems')"), 'systems should not be exposed as a left-rail tab');
    assert.ok(!rootSource.includes('manager-v2-count-cluster'), 'system rows should not duplicate inspector counts inline');
    assert.ok(!rootSource.includes('FABRICATE.Admin.ManagerV2.QuickActions'), 'inspector should not duplicate row actions');
    assert.ok(
      !rootSource.replace(/\r\n/g, '\n').includes("{:else}\n        <button type=\"button\" class=\"manager-v2-button\" onclick={importSystem}>\n          <i class=\"fas fa-file-import\" aria-hidden=\"true\"></i>\n          <span>{text('FABRICATE.Admin.ManagerV2.Import', 'Import')}</span>\n        </button>\n        <button type=\"button\" class=\"manager-v2-button\" onclick={openCurrentAdmin}>"),
      'system library header should not render the legacy admin launch button'
    );
    assert.equal(lang.FABRICATE.Admin.ManagerV2.SystemLibraryHint, 'Select a row to view counts and enabled features.');
    assert.equal(
      lang.FABRICATE.Admin.ManagerV2.InspectorHint,
      'The inspector shows counts, resolution mode, and enabled features for the selected system.'
    );
    assert.ok(rootSource.includes("FABRICATE.Admin.ManagerV2.EmptySetup.Title"), 'no-systems inspector should use localized setup copy');
    assert.ok(rootSource.includes("https://misterpotts.github.io/fabricate/quickstart/"), 'no-systems inspector should link to the published quickstart');
    assert.ok(rootSource.includes("https://misterpotts.github.io/fabricate/"), 'no-systems inspector should link to the published docs');
    assert.equal(lang.FABRICATE.Admin.ManagerV2.EmptySetup.Title, 'Set up your first system');
    assert.equal(lang.FABRICATE.Admin.ManagerV2.EmptySetup.Quickstart, 'Quickstart');
    assert.equal(lang.FABRICATE.Admin.ManagerV2.EmptySetup.Docs, 'Docs');
    assert.ok(managerV2Source.includes('FABRICATE.Admin.ManagerV2.Environment.EmptyTitle'), 'empty environments browser should use Manager V2 localized copy');
    assert.ok(rootSource.includes('FABRICATE.Admin.ManagerV2.Environment.EmptySetup.Title'), 'empty environments inspector should use localized setup copy');
    assert.ok(rootSource.includes('https://misterpotts.github.io/fabricate/gathering-environments/'), 'empty environments inspector should link to published gathering docs');
    assert.equal(lang.FABRICATE.Admin.ManagerV2.Environment.EmptyTitle, 'Prepare gathering building blocks first');
    assert.equal(
      lang.FABRICATE.Admin.ManagerV2.Environment.EmptyHint,
      'Define gathering tasks and hazards before creating environments, then attach those building blocks to each location players can gather from.'
    );
    assert.ok(environmentsBrowserSource.includes('manager-v2-gathering-tabs'), 'gathering page should render local section tabs');
    assert.ok(rootSource.includes("let activeGatheringTab = $state('environments')"), 'root should own gathering tab state for inspector coordination');
    assert.ok(environmentsBrowserSource.includes("activeGatheringTab = 'environments'"), 'gathering page should accept environments as the default active tab');
    assert.ok(environmentsBrowserSource.includes('onSelectGatheringTab(tabId)'), 'gathering page should report tab changes to the root');
    assert.ok(rootSource.includes('data-gathering-inspector-placeholder'), 'right inspector should render placeholders for non-environment gathering tabs');
    assert.equal(
      rootSource.match(/FABRICATE\.Admin\.ManagerV2\.Environment\.Actions/g)?.length ?? 0,
      1,
      'environment actions localization should remain only for the header aria label, not a redundant inspector card'
    );
    assert.ok(
      !rootSource.includes("<h3 class=\"manager-v2-card-title\">{text('FABRICATE.Admin.ManagerV2.Environment.Actions', 'Environment actions')}</h3>"),
      'selected environment inspector should not render a redundant Environment actions card'
    );
    assert.ok(environmentsBrowserSource.includes('FABRICATE.Admin.ManagerV2.Environment.GatheringTabs.TasksHint'), 'gathering task browser copy should be localized');
    assert.ok(environmentsBrowserSource.includes("selectGatheringTab('tasks')"), 'empty environments guidance should route to the Tasks tab');
    assert.ok(environmentsBrowserSource.includes("selectGatheringTab('encounters')"), 'empty environments guidance should route hazards to the Hazards tab');
    assert.ok(environmentsBrowserSource.includes('manager-v2-environment-action-grid'), 'environment rows should keep quick action wiring');
    assert.ok(environmentsBrowserSource.includes('onEditEnvironment(environment.id)'), 'environment rows should wire edit quick actions');
    assert.ok(environmentsBrowserSource.includes('onDuplicateEnvironment(environment.id)'), 'environment rows should wire duplicate quick actions');
    assert.ok(environmentsBrowserSource.includes('onDeleteEnvironment(environment.id)'), 'environment rows should wire delete quick actions');
    assert.equal(lang.FABRICATE.Admin.ManagerV2.Environment.GatheringTabs.Label, 'Gathering sections');
    assert.equal(lang.FABRICATE.Admin.ManagerV2.Environment.GatheringTabs.Environments, 'Environments');
    assert.equal(lang.FABRICATE.Admin.ManagerV2.Environment.GatheringTabs.Tasks, 'Tasks');
    assert.equal(lang.FABRICATE.Admin.ManagerV2.Environment.GatheringTabs.Encounters, 'Hazards');
    assert.equal(lang.FABRICATE.Admin.ManagerV2.Environment.GatheringTabs.Settings, 'Settings');
    assert.equal(lang.FABRICATE.Admin.ManagerV2.Environment.GatheringTabs.OpenTasks, 'Review tasks');
    assert.equal(lang.FABRICATE.Admin.ManagerV2.Environment.GatheringTabs.OpenHazards, 'Review hazards');
    assert.equal(lang.FABRICATE.Admin.ManagerV2.Environment.GatheringTabs.TasksHint, 'Browse gathering tasks before attaching them to environments.');
    assert.equal(lang.FABRICATE.Admin.ManagerV2.Environment.GatheringTabs.EncountersPlaceholderHint, 'Reusable hazard authoring is planned for a later slice.');
    assert.equal(lang.FABRICATE.Admin.ManagerV2.Environment.GatheringTabs.SettingsPlaceholderHint, 'Set system-level d100 reward and hazard rules for gathering.');
    assert.equal(lang.FABRICATE.Admin.ManagerV2.Environment.Conditions.TimeOfDayTitle, 'Times of day');
    assert.equal(lang.FABRICATE.Admin.ManagerV2.Environment.Conditions.WeatherTitle, 'Weather conditions');
    assert.equal(lang.FABRICATE.Admin.ManagerV2.Environment.EmptySetup.Title, 'Plan gathering content');
    assert.equal(
      lang.FABRICATE.Admin.ManagerV2.Environment.EmptySetup.StepHazards,
      'Prepare encounter and hazard options that can be reused across risky locations.'
    );
    assert.equal(lang.FABRICATE.Admin.ManagerV2.Environment.EmptySetup.GatheringDocs, 'Gathering docs');
    assert.ok(rootSource.includes('FABRICATE.Admin.ManagerV2.Recipe.EmptySetup.Title'), 'empty recipes inspector should use localized setup copy');
    assert.ok(rootSource.includes('https://misterpotts.github.io/fabricate/recipes/'), 'empty recipes inspector should link to published recipe docs');
    assert.ok(rootSource.includes('selectedCounts.components > 0'), 'empty recipes inspector should branch on selected-system component count');
    assert.ok(rootSource.includes("setView('components')"), 'empty recipes inspector should route zero-component setup to Components');
    assert.equal(lang.FABRICATE.Admin.ManagerV2.Recipe.EmptySetup.Title, 'Set up recipes');
    assert.equal(
      lang.FABRICATE.Admin.ManagerV2.Recipe.EmptySetup.NoComponentsHint,
      'Add components before creating recipes so ingredients, catalysts, and results have reusable items to reference.'
    );
    assert.equal(lang.FABRICATE.Admin.ManagerV2.Recipe.EmptySetup.AddComponents, 'Add components');
    assert.equal(lang.FABRICATE.Admin.ManagerV2.Recipe.EmptySetup.RecipeDocs, 'Recipe docs');
    assert.ok(rootSource.includes('FABRICATE.Admin.ManagerV2.Component.EmptySetup.Title'), 'empty components inspector should use localized setup copy');
    assert.ok(rootSource.includes('https://misterpotts.github.io/fabricate/crafting-systems/#components'), 'empty components inspector should link to published component docs');
    assert.equal(lang.FABRICATE.Admin.ManagerV2.Component.EmptySetup.Title, 'Set up components');
    assert.equal(lang.FABRICATE.Admin.ManagerV2.Component.EmptySetup.ComponentDocs, 'Component docs');
    assert.ok(rootSource.includes('FABRICATE.Admin.ManagerV2.Essence.EmptySetup.Title'), 'empty essences inspector should use localized setup copy');
    assert.ok(rootSource.includes('https://misterpotts.github.io/fabricate/essences/'), 'empty essences inspector should link to published essence docs');
    assert.equal(lang.FABRICATE.Admin.ManagerV2.Essence.EmptySetup.Title, 'Set up essences');
    assert.equal(lang.FABRICATE.Admin.ManagerV2.Essence.EmptySetup.EssenceDocs, 'Essence docs');
  });

  it('keeps manager-v2 tags and categories route focused and store-wired', () => {
    assert.ok(
      rootSource.includes("import TagsCategoriesView from './TagsCategoriesView.svelte';"),
      'root should import the focused tags/categories page'
    );
    assert.ok(rootSource.includes('store.addCategory?.(value)'), 'category add should delegate to the admin store');
    assert.ok(rootSource.includes('store.removeCategory?.(category)'), 'category remove should delegate to the admin store');
    assert.ok(rootSource.includes('store.addTag?.(value)'), 'tag add should delegate to the admin store');
    assert.ok(rootSource.includes('store.removeTag?.(tag)'), 'tag remove should delegate to the admin store');
    assert.ok(rootSource.includes('confirmTagCategoryRemoval'), 'in-use removals should flow through a confirmation seam');
    assert.ok(tagsCategoriesSource.includes('onConfirmRemove'), 'focused route should ask the root before removing in-use vocabulary');
    assert.ok(tagsCategoriesSource.includes('GeneralReservedFeedback'), 'focused route should keep reserved General feedback visible');
    assert.ok(!/\b(?:game|ui|Hooks|CONFIG)\b/.test(tagsCategoriesSource), 'tags/categories route should not directly reference Foundry globals');
  });

  it('keeps manager-v2 essence browsing browser-only and source UI feature-gated', () => {
    assert.ok(
      rootSource.includes("import EssenceEditView from './EssenceEditView.svelte';"),
      'root should import the dedicated essence edit route'
    );
    assert.ok(rootSource.includes('showEssenceSourceUi'), 'root should derive the effect-transfer source UI gate');
    assert.ok(rootSource.includes("currentView === 'essence-edit'"), 'root should route the dedicated edit view');
    assert.ok(rootSource.includes('confirmDiscardDirtyEssenceDraft'), 'root should protect dirty essence edit drafts when a confirm seam is available');
    assert.ok(essenceBrowserSource.includes('onEditEssence'), 'browser row edit should ask the root to route to edit');
    assert.ok(essenceBrowserSource.includes('showSourceUi'), 'browser should receive the source UI feature gate');
    assert.ok(!essenceBrowserSource.includes('onUpdateEssence'), 'browser should not own essence update persistence');
    assert.ok(!essenceBrowserSource.includes('manager-v2-essence-edit-row'), 'browser should not render inline edit rows');
    assert.ok(!essenceBrowserSource.includes('manager-v2-essence-create-name'), 'browser should not render inline create fields');
    assert.ok(!essenceBrowserSource.includes('manager-v2-essence-action-band'), 'browser should not duplicate the route-header create action');
    assert.ok(!essenceBrowserSource.includes("text('FABRICATE.Admin.ManagerV2.Essence.SourceLinked'"), 'browser should not render linked-source badges');
    assert.ok(essenceBrowserSource.includes('manager-v2-essence-source-cell-image'), 'browser source column should render resolved source images');
    assert.ok(essenceBrowserSource.includes('FABRICATE.Admin.ManagerV2.Essence.SourceNoneShort'), 'browser source column should render compact None copy when unresolved');
  });

  it('uses shared manager-v2 essence picker controls on the dedicated edit route', () => {
    assert.ok(essenceEditSource.includes("import IconPicker from '../../components/IconPicker.svelte';"), 'edit route should use the shared IconPicker');
    assert.ok(essenceEditSource.includes("import EssenceSourceSelector from '../../components/EssenceSourceSelector.svelte';"), 'edit route should use the shared source selector');
    assert.ok(essenceEditSource.includes('showSourceUi'), 'edit route should gate source controls by effect transfer');
    assert.ok(essenceEditSource.includes('onDirtyChange(dirty)'), 'edit route should expose dirty state to route-exit protection');
    assert.ok(essenceEditSource.includes('onSave(draftId || null, updates)'), 'edit route should delegate create and update persistence to the root/store seam');
    assert.ok(essenceEditSource.includes('id="manager-v2-essence-edit-form"'), 'edit route should expose a form target for route-header save actions');
    assert.ok(!essenceEditSource.includes('EditKicker'), 'edit route should not render a duplicate inner route header');
    assert.ok(!essenceEditSource.includes('IconClassHint'), 'edit route should not expose raw icon class copy');
    assert.ok(rootSource.includes('form="manager-v2-essence-edit-form"'), 'root header should own the primary save action for the edit form');
    assert.ok(!rootSource.includes('data-essence-action="edit"'), 'inspector should not duplicate browse row edit actions');
    assert.ok(!rootSource.includes('data-essence-action="delete"'), 'inspector should not duplicate browse row delete actions');
    assert.ok(rootSource.includes('data-essence-action="copy-source"'), 'inspector should expose source UUID copy through the source action row');
    assert.ok(rootSource.includes('data-essence-action="unlink-source"'), 'inspector should expose source unlink through the source action row');
    assert.ok(rootSource.includes('store.updateEssence?.(selectedEssenceForInspector.id, { sourceComponentId })'), 'inspector source changes should use updateEssence');
    assert.ok(rootSource.includes('importSingleManagedItemFromDrop'), 'inspector source drops should reuse the managed-item import seam');
    assert.ok(!essenceEditSource.includes('game.'), 'edit route should not reference Foundry runtime globals');
  });

  it('wires production essence dirty confirmation and manager-v2 app close guard', () => {
    assert.ok(appSource.includes('confirmDiscardEssenceDraft: () => confirmDialog'), 'v2 app should provide a production discard confirmation service');
    for (const key of [
      'DiscardDirtyTitle',
      'DiscardDirtyContent',
      'DiscardDirtyConfirm',
      'DiscardDirtyCancel'
    ]) {
      assert.equal(typeof lang.FABRICATE.Admin.ManagerV2.Essence[key], 'string', `en.json should define Essence.${key}`);
    }
    assert.ok(appSource.includes('registerEssenceDirtyGuard'), 'v2 app should accept the route dirty guard');
    assert.ok(appSource.includes('async close(options)'), 'v2 app should guard window close');
    assert.ok(appSource.includes('canCloseEssence === false'), 'v2 app close should stay open when discard is declined');
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
      'store.deleteComponent?.(itemId)',
      'services?.onCopySourceUuid?.(uuid)'
    ]) {
      assert.ok(rootSource.includes(snippet), `root should wire ${snippet}`);
    }
    assert.ok(rootSource.includes("activeView = view"), 'components should use the selected-system route state');
    assert.ok(!rootSource.includes('usageCount ='), 'components browser should not invent usage counts');
    assert.ok(!rootSource.includes('stale source'), 'components browser should not invent source freshness labels');
  });

  it('routes the components row Edit action through the in-manager component-edit view', () => {
    assert.ok(
      rootSource.includes("activeView = 'component-edit'"),
      'editComponent should set the activeView to the in-manager component-edit route'
    );
    assert.ok(
      rootSource.includes("import ComponentEditView"),
      'root should import the ComponentEditView'
    );
    assert.ok(
      rootSource.includes("store.updateComponent?."),
      'root should persist component-edit saves through the admin-store updateComponent action'
    );
    assert.ok(
      !rootSource.includes('services?.onEditComponent?.'),
      'manager-v2 row Edit should no longer launch the legacy component editor'
    );
    const componentEditScript = componentEditSource.split('</script>')[0] || componentEditSource;
    assert.ok(
      !/\b(?:game|ui|Hooks|CONFIG)\.[a-zA-Z]/.test(componentEditScript),
      'ComponentEditView script should not reference Foundry globals directly'
    );
    assert.ok(
      !componentEditSource.includes('foundry.applications'),
      'ComponentEditView should not import Foundry application classes'
    );
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
    assert.equal(lang.FABRICATE.Admin.ManagerV2.Environment.TaskTabCheck, 'Check');
    assert.equal(lang.FABRICATE.Admin.ManagerV2.Environment.TaskTabAdvanced, undefined);
    assert.equal(lang.FABRICATE.Admin.ManagerV2.Environment.AdvancedTab, undefined);
    assert.ok(!environmentEditSource.includes("id: 'advanced'"), 'environment editor should not define an advanced task tab');
    assert.ok(!environmentEditSource.includes('manager-v2-environment-details-tabs'), 'environment editor should not render environment advanced tabs');
    assert.ok(!environmentEditSource.includes('manager-v2-environment-evidence-column'), 'environment editor should no longer render the duplicated evidence column');
    assert.ok(environmentEditSource.includes('manager-v2-environment-validation-band'), 'environment editor should render the collapsible validation band');
  });

  it('wires Manager V2 gathering libraries, global conditions, and environment composition controls', () => {
    for (const snippet of [
      'gatheringConfig={$viewState.gatheringConfig}',
      'onUpdateGatheringConditions={store.updateGatheringConditions}',
      'onUpdateGatheringVocabulary={store.updateGatheringVocabulary}',
      'onToggleGatheringConditionEnabled={store.toggleGatheringConditionEnabled}',
      'onAddGatheringConditionValue={store.addGatheringConditionValue}',
      'onDeleteGatheringConditionValue={store.deleteGatheringConditionValue}',
      'onAddGatheringVocabularyValue={store.addGatheringVocabularyValue}',
      'onUpdateGatheringVocabularyValue={store.updateGatheringVocabularyValue}',
      'onDeleteGatheringVocabularyValue={store.deleteGatheringVocabularyValue}',
      'onUpdateGatheringRules={store.updateGatheringRules}',
      'onAddGatheringLibraryTask={store.addGatheringLibraryTask}',
      'onUpdateGatheringLibraryTask={store.updateGatheringLibraryTask}',
      'onDeleteGatheringLibraryTask={store.deleteGatheringLibraryTask}',
      'onAddGatheringLibraryHazard={store.addGatheringLibraryHazard}',
      'onUpdateGatheringLibraryHazard={store.updateGatheringLibraryHazard}',
      'onDeleteGatheringLibraryHazard={store.deleteGatheringLibraryHazard}'
    ]) {
      assert.ok(rootSource.includes(snippet), `root should wire ${snippet}`);
    }
    for (const snippet of [
      'manager-v2-gathering-library',
      'CurrentWeather',
      'CurrentTimeOfDay',
      "updateField('region'",
      "updateField('biomes'",
      "updateField('dangerTags'",
      'libraryRecordEnabled(task.id',
      'toggleLibraryRecord(task.id',
      'libraryRecordEnabled(hazard.id',
      'toggleLibraryRecord(hazard.id',
      'onUpdateGatheringLibraryTask?.',
      'onUpdateGatheringLibraryHazard?.',
      'onUpdateGatheringVocabulary?.'
    ]) {
      assert.ok(environmentEditSource.includes(snippet), `environment editor should include ${snippet}`);
    }
    assert.ok(rootSource.includes('data-gathering-inspector-rules'), 'root should render the settings rules inspector');
    assert.ok(environmentsBrowserSource.includes('data-gathering-condition-panel={condition.kind}'), 'settings tab should render condition vocabulary panels');
    assert.ok(environmentsBrowserSource.includes('onToggleGatheringConditionEnabled?.'), 'settings condition panels should wire matching toggles');
    assert.ok(environmentsBrowserSource.includes('onAddGatheringConditionValue?.'), 'settings condition panels should wire value additions');
    assert.ok(environmentsBrowserSource.includes('onUpdateGatheringConditionValue?.'), 'settings condition panels should wire label and icon updates');
    assert.ok(environmentsBrowserSource.includes('onDeleteGatheringConditionValue?.'), 'settings condition panels should wire value deletion');
    assert.ok(environmentsBrowserSource.includes('data-gathering-vocabulary-panel={vocabulary.kind}'), 'settings tab should render region and biome vocabulary panels');
    assert.ok(environmentsBrowserSource.includes('onAddGatheringVocabularyValue?.'), 'settings vocabulary panels should wire value additions');
    assert.ok(environmentsBrowserSource.includes('onUpdateGatheringVocabularyValue?.'), 'settings vocabulary panels should wire label, icon, and colour updates');
    assert.ok(environmentsBrowserSource.includes('onDeleteGatheringVocabularyValue?.'), 'settings vocabulary panels should wire value deletion');
    assert.ok(environmentsBrowserSource.includes('ManagerV2ColorPicker'), 'settings biome panels should use the manager-v2 color picker');
    assert.ok(environmentsBrowserSource.includes('IconPicker'), 'settings condition panels should reuse the shared icon picker');
    assert.ok(environmentsBrowserSource.includes('manager-v2-condition-label-input'), 'settings condition panels should expose editable display labels');
    assert.ok(environmentsBrowserSource.includes("onAddGatheringConditionValue?.(kind, { label: value, icon: conditionAddIcon(kind) }"), 'settings condition add should include the selected icon');
    assert.equal(lang.FABRICATE.Admin.ManagerV2.Environment.Conditions.NewIcon, 'New value icon');
    assert.ok(environmentEditSource.includes("{#each ['danger'] as vocabulary"), 'environment editor should keep only danger in generic vocabulary CSV controls');
    assert.ok(!environmentEditSource.includes("{#each ['regions', 'biomes', 'danger'] as vocabulary"), 'environment editor should not expose regions/biomes in generic vocabulary CSV controls');
    assert.ok(!environmentEditSource.includes("{#each ['regions', 'biomes', 'danger', 'weather', 'timeOfDay'] as vocabulary"), 'environment editor should not expose weather/time generic vocabulary CSV controls');
    assert.ok(rootSource.includes('updateSelectedGatheringRules'), 'root should wire rule updates');
    assert.ok(rootSource.includes('manager-v2-rule-copy'), 'root should render rule descriptions beside inspector icons');
    assert.ok(rootSource.includes('data-gathering-rule-stepper="rewardLimit"'), 'root should render the reward limit stepper');
    assert.ok(rootSource.includes('data-gathering-rule-stepper="hazardLimit"'), 'root should render the hazard limit stepper');
    assert.ok(rootSource.includes('FABRICATE.Admin.ManagerV2.Environment.Rules.HazardHighestRankedDrop'), 'hazard rule select should use hazard-specific drop labels');
    assert.equal(lang.FABRICATE.Admin.ManagerV2.Environment.Rules.HighestRankedDrop, 'Highest ranked successful drop');
    assert.equal(lang.FABRICATE.Admin.ManagerV2.Environment.Rules.AllDrops, 'All successful drops');
    assert.equal(lang.FABRICATE.Admin.ManagerV2.Environment.Rules.LimitedDrops, 'Limit successful drops');
    assert.equal(lang.FABRICATE.Admin.ManagerV2.Environment.Rules.HazardHighestRankedDrop, 'Highest ranked triggered hazard');
    assert.equal(lang.FABRICATE.Admin.ManagerV2.Environment.Rules.HazardAllDrops, 'All triggered hazards');
    assert.equal(lang.FABRICATE.Admin.ManagerV2.Environment.Rules.HazardLimitedDrops, 'Limit triggered hazards');
    assert.ok(rootSource.includes('selectedGatheringConditionShortcuts'), 'root should derive selected-system condition shortcuts');
    assert.ok(rootSource.includes('buildSelectedGatheringConditionShortcuts'), 'root should keep shortcut visibility gated by selected-system gathering conditions');
    assert.ok(rootSource.includes('data-systems-gathering-conditions'), 'systems inspector should render a global condition shortcut card');
    assert.ok(rootSource.includes('data-systems-gathering-condition={condition.kind}'), 'systems inspector should render one shortcut per enabled condition dimension');
    assert.ok(rootSource.includes("store.updateGatheringConditions?.({ [kind]: value, systemId: selectedSystemId })"), 'systems inspector shortcuts should reuse current condition persistence with selected system id');
    assert.ok(!environmentEditSource.includes("updateField('hazardSelectionMode'"), 'environment editor should not expose per-environment hazard selection rules');
    assert.ok(!environmentEditSource.includes("updateField('hazardPolicy'"), 'environment editor should not expose per-environment hazard policy');
    assert.ok(!environmentEditSource.includes('ItemSelectionMode'), 'environment editor should not expose per-task item selection rules');
    assert.ok(!environmentEditSource.includes('weatherFilter'), 'weather should not be an environment browse filter');
    assert.ok(!environmentEditSource.includes('timeOfDayFilter'), 'time of day should not be an environment browse filter');
  });

  it('uses Foundry FilePicker for the environment image and drag-drop for scene linkage', () => {
    assert.ok(
      environmentEditSource.includes("import ImagePathPicker from '../../components/ImagePathPicker.svelte';"),
      'environment editor should import the shared ImagePathPicker component'
    );
    assert.ok(environmentEditSource.includes('showInput={false}'), 'environment image control should render in button-only mode');
    assert.ok(environmentEditSource.includes("onPickImagePath={onPickImagePath}"), 'environment image control should be wired to the FilePicker service');
    assert.ok(!environmentEditSource.includes('manager-v2-raw-scene-field'), 'environment editor should no longer render a raw scene UUID input');
    assert.ok(!environmentEditSource.includes("Environments.SceneSelect"), 'environment editor should no longer render the global scene dropdown');
    assert.ok(environmentEditSource.includes('manager-v2-scene-drop-zone'), 'environment editor should render a drag-drop zone for scene linking');
    assert.ok(environmentEditSource.includes('handleSceneDrop'), 'environment editor should define a scene drop handler');
    assert.ok(environmentEditSource.includes("payload.type !== 'Scene'"), 'scene drop handler should ignore non-Scene drag payloads');
    assert.equal(lang.FABRICATE.Admin.ManagerV2.Environment.SceneDropHint, 'Drag a scene from the Scenes sidebar to link it');
    assert.equal(lang.FABRICATE.Admin.ManagerV2.Environment.SceneDropZoneLabel, 'Scene drop zone');
    assert.equal(lang.FABRICATE.Admin.ManagerV2.Environment.ChooseImage, 'Choose environment image');
  });

  it('wires Manager V2 Gathering Tasks browser through root-owned selection and store callbacks', () => {
    for (const snippet of [
      'selectedGatheringTaskId',
      'onSelectGatheringTask={selectGatheringTask}',
      'onCreateGatheringTask={createGatheringTask}',
      'onEditGatheringTask={editGatheringTask}',
      'onDuplicateGatheringTask={duplicateGatheringTask}',
      'onDeleteGatheringTask={deleteGatheringTask}',
      'onToggleGatheringTaskEnabled={toggleGatheringTaskEnabled}',
      'store.duplicateGatheringLibraryTask',
      'data-gathering-task-inspector',
      'data-gathering-task-editor-placeholder'
    ]) {
      assert.ok(rootSource.includes(snippet), `root should include ${snippet}`);
    }
    for (const snippet of [
      'GatheringTasksBrowserView',
      'tasks={selectedGatheringSystemConfig.tasks || []}',
      'selectedTaskId',
      'managedItemOptions'
    ]) {
      assert.ok(environmentsBrowserSource.includes(snippet), `environment browser should include ${snippet}`);
    }
    for (const snippet of [
      'data-gathering-tasks-browser',
      'manager-v2-gathering-tasks-table',
      'availabilityLabels(task)',
      'activeEnvironmentCount(task)',
      'onDuplicateTask(selectedSystemId, task.id)',
      'onDeleteTask(selectedSystemId, task.id)',
      'onToggleTaskEnabled(selectedSystemId, task.id'
    ]) {
      assert.ok(gatheringTasksBrowserSource.includes(snippet), `task browser should include ${snippet}`);
    }
    assert.equal(lang.FABRICATE.Admin.ManagerV2.Environment.Tasks.EmptyTitle, 'No gathering tasks yet');
    assert.equal(lang.FABRICATE.Admin.ManagerV2.Environment.NewLibraryTask, 'New Gathering Task');
    assert.equal(
      rootSource.match(/FABRICATE\.Admin\.ManagerV2\.Environment\.Tasks\.Actions/g)?.length ?? 0,
      1,
      'gathering task actions localization should remain only for the header aria label, not a redundant inspector card'
    );
    assert.ok(
      !rootSource.includes("<h3 class=\"manager-v2-card-title\">{text('FABRICATE.Admin.ManagerV2.Environment.Tasks.Actions', 'Gathering task actions')}</h3>"),
      'gathering task inspector should not keep an action card heading'
    );
    assert.ok(!rootSource.includes('duplicateGatheringTask(selectedSystemId, selectedGatheringTask.id)'), 'gathering task inspector should not duplicate row-level duplicate actions');
    assert.equal(lang.FABRICATE.Admin.ManagerV2.Environment.Tasks.BackToLibrary, 'Back to task library');
    assert.equal(lang.FABRICATE.Admin.ManagerV2.Environment.Tasks.CopySuffix, 'Copy');
  });

  it('replaces the environment status checkbox with the shared status toggle', () => {
    assert.ok(
      environmentEditSource.includes('manager-v2-status-toggle'),
      'environment editor should render the shared manager-v2 status-toggle button for enabled state'
    );
    assert.ok(
      !/manager-v2-environment-status-card[\s\S]{0,160}type="checkbox"/.test(environmentEditSource),
      'environment editor should not render a native checkbox inside the status card'
    );
    assert.equal(lang.FABRICATE.Admin.ManagerV2.EnableEnvironment, 'Enable environment');
    assert.equal(lang.FABRICATE.Admin.ManagerV2.DisableEnvironment, 'Disable environment');
  });
});
