import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dirname, '../..');
const rootPath = resolve(repoRoot, 'src/ui/svelte/apps/manager/CraftingSystemManagerRoot.svelte');
const essenceBrowserPath = resolve(repoRoot, 'src/ui/svelte/apps/manager/EssenceBrowserView.svelte');
const essenceEditPath = resolve(repoRoot, 'src/ui/svelte/apps/manager/EssenceEditView.svelte');
const tagsCategoriesPath = resolve(repoRoot, 'src/ui/svelte/apps/manager/TagsCategoriesView.svelte');
const systemEditPath = resolve(repoRoot, 'src/ui/svelte/apps/manager/SystemEditView.svelte');
const systemsBrowserPath = resolve(repoRoot, 'src/ui/svelte/apps/manager/SystemsBrowserView.svelte');
const recipesBrowserPath = resolve(repoRoot, 'src/ui/svelte/apps/manager/RecipesBrowserView.svelte');
const componentEditPath = resolve(repoRoot, 'src/ui/svelte/apps/manager/ComponentEditView.svelte');
const componentsBrowserPath = resolve(repoRoot, 'src/ui/svelte/apps/manager/ComponentsBrowserView.svelte');
const environmentEditPath = resolve(repoRoot, 'src/ui/svelte/apps/manager/EnvironmentEditView.svelte');
const environmentsBrowserPath = resolve(repoRoot, 'src/ui/svelte/apps/manager/EnvironmentsBrowserView.svelte');
const gatheringTaskEditPath = resolve(repoRoot, 'src/ui/svelte/apps/manager/GatheringTaskEditView.svelte');
const gatheringTasksBrowserPath = resolve(repoRoot, 'src/ui/svelte/apps/manager/GatheringTasksBrowserView.svelte');
const toolsBrowserPath = resolve(repoRoot, 'src/ui/svelte/apps/manager/ToolsBrowserView.svelte');
const appPath = resolve(repoRoot, 'src/ui/SvelteCraftingSystemManagerApp.svelte.js');
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
const gatheringTaskEditSource = readFileSync(gatheringTaskEditPath, 'utf8');
const gatheringTasksBrowserSource = readFileSync(gatheringTasksBrowserPath, 'utf8');
const toolsBrowserSource = readFileSync(toolsBrowserPath, 'utf8');
const appSource = readFileSync(appPath, 'utf8');
const mainSource = readFileSync(mainPath, 'utf8');
const lang = JSON.parse(readFileSync(langPath, 'utf8'));

const managerSource = [rootSource, essenceBrowserSource, essenceEditSource, tagsCategoriesSource, systemEditSource, systemsBrowserSource, recipesBrowserSource, componentsBrowserSource, componentEditSource, environmentEditSource, environmentsBrowserSource, gatheringTaskEditSource, gatheringTasksBrowserSource, toolsBrowserSource].join('\n');

function catalogValue(key) {
  return key.split('.').reduce((node, part) => node?.[part], lang);
}

function decodeStaticString(quote, body) {
  return Function(`return ${quote}${body}${quote};`)();
}

function staticTextCalls(source) {
  const pattern = /text\(\s*(["'])(FABRICATE(?:\\.|(?!\1).)*)\1\s*,\s*(["'])((?:\\.|(?!\3).)*)\3\s*\)/gs;
  return [...source.matchAll(pattern)].map(match => ({
    key: match[2],
    fallback: decodeStaticString(match[3], match[4])
  }));
}

function isChangedManagerEnvironmentLocalizationKey(key) {
  return key.startsWith('FABRICATE.Admin.Manager.Environment.')
    || key.startsWith('FABRICATE.Admin.Manager.EnvironmentEditor.')
    || key.startsWith('FABRICATE.Admin.Manager.Gathering.CharacterModifiers.')
    || key.startsWith('FABRICATE.Admin.Environments.')
    || [
      'FABRICATE.Admin.Manager.GlobalConditions',
      'FABRICATE.Admin.Manager.CurrentTimeOfDay',
      'FABRICATE.Admin.Manager.CurrentWeather'
    ].includes(key);
}

function sourceName(filePath) {
  return filePath.replace(`${repoRoot}\\`, '').replace(`${repoRoot}/`, '');
}

describe('CraftingSystemManager source contract', () => {
  it('self-registers as the sole crafting system manager app', () => {
    assert.ok(
      appSource.includes('extends SvelteApplicationMixin('),
      'manager app should be a standalone ApplicationV2 shell with no legacy base class'
    );
    assert.ok(
      !appSource.includes('SvelteRecipeManagerApp'),
      'manager app should not reference the removed legacy manager class'
    );
    assert.ok(
      appSource.includes('registerCraftingSystemManagerApp(SvelteCraftingSystemManagerApp)'),
      'manager app should self-register with the manager registry'
    );
    assert.ok(
      !appSource.includes('openCurrentAdmin'),
      'manager app should not expose a legacy admin launch service'
    );
    assert.ok(appSource.includes('height: 940'), 'manager app should open tall enough for gathering task drag/drop');
    assert.ok(
      !mainSource.includes("import './ui/SvelteRecipeManagerApp.svelte.js';"),
      'legacy manager side-effect import should be removed'
    );
    assert.ok(
      mainSource.includes("import './ui/SvelteCraftingSystemManagerApp.svelte.js';"),
      'manager side-effect import should be present for registry wiring'
    );
  });

  it('guards manager startup against unready Fabricate services', () => {
    assert.ok(appSource.includes('isFabricateReady'), 'manager app should expose readiness through services');
    assert.ok(appSource.includes('onFabricateReady'), 'manager app should expose a ready callback service');
    assert.ok(appSource.includes("hooks.once('fabricate.ready'"), 'ready callback should listen at the Foundry edge');
    assert.ok(appSource.includes('_pendingReadyOpen'), 'v2 app should prevent duplicate deferred opens');
    assert.ok(appSource.includes('StartupPending'), 'v2 app should notify when startup defers the window open');
    assert.ok(appSource.includes("hooks.once('fabricate.ready', openWhenReady)"), 'v2 app should defer direct opens until fabricate.ready');
    assert.ok(systemsBrowserSource.includes('systemsLoading'), 'systems browser should receive loading state');
    assert.ok(rootSource.includes('systemsLoading'), 'root should pass loading state to systems browser and inspector');
    assert.equal(lang.FABRICATE.Admin.Manager.LoadingSystems, 'Loading crafting systems...');
    assert.equal(
      lang.FABRICATE.Admin.Manager.StartupPending,
      'Fabricate is still loading. The crafting system manager will open when startup finishes.'
    );
  });

  it('renders the manager shell with Systems and Recipes browser structures', () => {
    for (const snippet of [
      'class="fabricate-manager"',
      'data-manager-view={currentView}',
      'class="manager-header"',
      'class="manager-breadcrumbs"',
      'class="manager-body"',
      'class="manager-rail"',
      'class="manager-inspector"',
      'ComponentsBrowserView',
      'EnvironmentsBrowserView',
      'EssenceBrowserView',
      'EssenceEditView',
      'TagsCategoriesView',
      'EnvironmentEditView',
      'RecipesBrowserView',
      'SystemEditView',
      'SystemsBrowserView',
      'manager-environment-edit-main'
    ]) {
      assert.ok(rootSource.includes(snippet), `root should include ${snippet}`);
    }
    for (const snippet of [
      'class="manager-main"',
      'class="manager-toolbar"',
      'class="manager-filter"',
      'class="manager-empty"'
    ]) {
      assert.ok(managerSource.includes(snippet), `manager source should include ${snippet}`);
    }
    for (const snippet of [
      'class="manager-component-drop-zone"',
      'class={componentTableClass}',
      'manager-component-row',
      'class="manager-component-identity"'
    ]) {
      assert.ok(componentsBrowserSource.includes(snippet), `ComponentsBrowserView should include ${snippet}`);
    }
    for (const snippet of [
      'manager-system-edit-form',
      'manager-toggle-row'
    ]) {
      assert.ok(systemEditSource.includes(snippet), `SystemEditView should include ${snippet}`);
    }
    for (const snippet of [
      'class="manager-systems-table"',
      'manager-system-row',
      'manager-system-identity'
    ]) {
      assert.ok(systemsBrowserSource.includes(snippet), `SystemsBrowserView should include ${snippet}`);
    }
    for (const snippet of [
      'class="manager-recipes-table"',
      'manager-recipe-row',
      'class="manager-recipe-identity"',
      'manager-recipe-status'
    ]) {
      assert.ok(recipesBrowserSource.includes(snippet), `RecipesBrowserView should include ${snippet}`);
    }
  });

  it('keeps presentational Svelte free of direct Foundry globals', () => {
    assert.ok(!/\b(?:game|ui|Hooks|CONFIG)\b/.test(rootSource), 'root should not directly reference Foundry globals');
  });

  it('uses localized manager copy keys', () => {
    assert.ok(rootSource.includes('FABRICATE.Admin.Manager.Title'), 'root should use manager localization keys');
    assert.ok(lang.FABRICATE.Admin.Manager, 'English localization should define manager copy');
    assert.equal(lang.FABRICATE.Admin.Manager.Title, 'Crafting systems');
    assert.equal(lang.FABRICATE.Admin.Manager.Nav.Components, 'Components');
    assert.equal(lang.FABRICATE.Admin.Manager.Nav.Environments, 'Gathering');
    assert.equal(lang.FABRICATE.Admin.Manager.Breadcrumbs, 'Breadcrumbs');
    assert.equal(lang.FABRICATE.Admin.Manager.EditSystem, 'Edit system');
    assert.equal(lang.FABRICATE.Admin.Manager.ReturnToSystemLibrary, 'Return to System Library');
    assert.equal(lang.FABRICATE.Admin.Manager.StatusOn, 'On');
    assert.equal(lang.FABRICATE.Admin.Manager.StatusOff, 'Off');
    assert.equal(lang.FABRICATE.Admin.Manager.EnableSystemNamed, 'Enable {name}');
    assert.equal(lang.FABRICATE.Admin.Manager.DisableSystemNamed, 'Disable {name}');
    assert.equal(lang.FABRICATE.Admin.Manager.SystemEdit.Title, 'System settings');
    assert.equal(lang.FABRICATE.Admin.Manager.SystemEdit.SaveDetails, 'Save details');
    assert.equal(lang.FABRICATE.Admin.Manager.SystemEdit.EditBadge, undefined);
    assert.equal(lang.FABRICATE.Admin.Manager.Recipe.Title, 'Recipes');
    assert.equal(lang.FABRICATE.Admin.Manager.Recipe.Requirements, 'Requirements');
    assert.equal(lang.FABRICATE.Admin.Manager.Recipe.EnableNamed, 'Enable {name}');
    assert.equal(lang.FABRICATE.Admin.Manager.Recipe.DisableNamed, 'Disable {name}');
    assert.equal(lang.FABRICATE.Admin.Manager.Component.Title, 'Components');
    assert.equal(lang.FABRICATE.Admin.Manager.Component.DropZoneTitle, 'Drop items to add components');
    assert.equal(lang.FABRICATE.Admin.Manager.Component.Origin, 'Origin');
    assert.equal(lang.FABRICATE.Admin.Manager.Component.SourceOriginCompendium, 'Compendium');
    assert.equal(lang.FABRICATE.Admin.Manager.TagsCategories.Title, 'Tags & Categories');
    assert.equal(lang.FABRICATE.Admin.Manager.TagsCategories.Library, 'Tags & Categories');
    assert.equal(lang.FABRICATE.Admin.Manager.TagsCategories.GeneralReservedFeedback, 'General is already available as the base category.');
    assert.equal(lang.FABRICATE.Admin.Manager.Essence.Title, 'Essences');
    assert.equal(lang.FABRICATE.Admin.Manager.Essence.Library, 'Essence browser');
    assert.equal(lang.FABRICATE.Admin.Manager.Essence.EditTitle, 'Edit essence');
    assert.equal(lang.FABRICATE.Admin.Manager.Essence.EditBreadcrumb, 'Edit essence');
    assert.equal(lang.FABRICATE.Admin.Manager.Essence.CreateBreadcrumb, 'Create essence');
    assert.equal(lang.FABRICATE.Admin.Manager.Essence.SourceLinkedFilter, 'Linked');
    assert.equal(lang.FABRICATE.Admin.Manager.Essence.SourceNoneShort, 'None');
    assert.equal(lang.FABRICATE.Admin.Manager.Environment.GatheringTabs.EncountersTitle, 'Gathering hazards');
    assert.equal(lang.FABRICATE.Admin.Manager.Environment.GatheringTabs.EncountersHint, 'Browse reusable hazards before attaching them to environments.');
    assert.equal(rootSource.includes('EncountersPlaceholderTitle'), false);
    assert.equal(rootSource.includes('EncountersPlaceholderHint'), false);
  });

  it('keeps changed manager and environment static localization fallbacks aligned with en.json', () => {
    const environmentComponentDir = resolve(repoRoot, 'src/ui/svelte/apps/manager/environment');
    const contractFiles = [
      rootPath,
      environmentEditPath,
      environmentsBrowserPath,
      ...readdirSync(environmentComponentDir)
        .filter(name => name.endsWith('.svelte'))
        .map(name => resolve(environmentComponentDir, name))
    ];
    const failures = [];

    for (const filePath of contractFiles) {
      const source = readFileSync(filePath, 'utf8');
      for (const { key, fallback } of staticTextCalls(source)) {
        if (!isChangedManagerEnvironmentLocalizationKey(key)) continue;
        const value = catalogValue(key);
        if (typeof value !== 'string') {
          failures.push(`${sourceName(filePath)}: missing ${key}`);
        } else if (value !== fallback) {
          failures.push(`${sourceName(filePath)}: ${key} fallback "${fallback}" does not match en.json "${value}"`);
        }
      }
    }

    assert.deepEqual(failures, []);
  });

  it('routes system Edit to the in-place v2 edit view and existing store callbacks', () => {
    assert.ok(!rootSource.includes('openLegacySystemSettings'), 'root should not keep dead legacy edit routing');
    assert.ok(!rootSource.includes('Edit details'), 'root should not show the former dead edit details label');
    assert.ok(!rootSource.includes('services?.onEditSystem'), 'root should not launch the current admin for system row Edit');
    assert.ok(managerSource.includes('FABRICATE.Admin.Manager.EditSystem'), 'manager should expose a localized system edit action');
    assert.ok(rootSource.includes("activeView = 'system-edit'"), 'system row Edit should transition to the local edit route');
    assert.ok(managerSource.includes('store.saveSystemDetails?.('), 'system edit should save details through the admin store');
    assert.ok(managerSource.includes('onSetResolutionMode(nextMode)') || managerSource.includes('store.setResolutionMode?.(nextMode)'), 'system edit should delegate resolution changes to the admin store');
    assert.ok(rootSource.includes('store.setResolutionMode?.'), 'root should pass the resolution-mode callback through to the system-edit view');
    assert.ok(!managerSource.includes("value: 'routed'"), 'system edit should not offer unsupported routed persistence values before runtime support exists');
    assert.ok(managerSource.includes("value: 'mapped'"), 'system edit should retain the existing routed-by-ingredients persistence value');
    assert.ok(managerSource.includes("value: 'tiered'"), 'system edit should retain the existing routed-by-check persistence value');
    assert.ok(rootSource.includes('store.toggleAdvancedOptions?.'), 'root should delegate advanced visibility changes to the admin store');
    assert.ok(rootSource.includes('store.toggleFeature?.'), 'root should delegate feature toggles to the admin store');
    assert.ok(!managerSource.includes("storeKey: 'complexRecipes'"), 'system edit should not reintroduce the legacy complex recipes toggle');
    assert.ok(!managerSource.includes("storeKey: 'craftingChecks'"), 'system edit should not reintroduce the legacy crafting checks toggle');
    assert.ok(!managerSource.includes("storeKey: 'outcomeRouting'"), 'system edit should not reintroduce the legacy outcome routing toggle');
    assert.ok(!appSource.includes('onEditSystem'), 'v2 wrapper should not provide a row edit service for this action');
    assert.ok(!appSource.includes('openCurrentAdmin'), 'v2 wrapper should not retain a legacy admin fallback service');
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
    assert.ok(rootSource.includes('manager-scope-card'), 'root should render selected system scope as static rail text');
    assert.ok(rootSource.includes('manager-scope-return'), 'root should expose a return-to-system-library rail action');
    assert.ok(rootSource.includes('FABRICATE.Admin.Manager.ReturnToSystemLibrary'), 'return-to-library action should be localized');
    assert.ok(!rootSource.includes('SystemEdit.EditBadge'), 'system settings nav should not render the former Edit badge');
    assert.ok(rootSource.includes("setView('essences')"), 'essences should be exposed as a real selected-system route');
    assert.ok(rootSource.includes("setView('tags')"), 'tags and categories should be exposed as a real selected-system route');
    assert.ok(rootSource.includes("activeView = 'essence-edit'"), 'essence edit actions should transition to the local edit route');
    assert.ok(!rootSource.includes("{ id: 'essences'"), 'essences should not remain a disabled placeholder route');
    assert.ok(!rootSource.includes("{ id: 'tags'"), 'tags should not remain a disabled placeholder route');
    assert.ok(!rootSource.includes('clearSelectedSystem'), 'root should not expose a selected-system clear route');
    assert.ok(!rootSource.includes("selectSystem('', 'systems')"), 'selected-system rail should not clear real store selection');
    assert.ok(!rootSource.includes('manager-scope-clear'), 'selected-system rail should not render the old x clear icon');
    assert.ok(managerSource.includes('toggleSystemEnabled'), 'systems browser should expose interactive row status toggles');
    assert.ok(systemsBrowserSource.includes('manager-status-toggle'), 'systems browser should render status as a toggle control');
    assert.ok(recipesBrowserSource.includes('manager-status-toggle'), 'recipes browser should render status as a toggle control');
    assert.ok(!recipesBrowserSource.includes('type="checkbox"\n                  checked={recipe.enabled !== false}'), 'recipes browser should not render recipe status as a checkbox');
    assert.ok(!rootSource.includes("setView('systems')"), 'systems should not be exposed as a left-rail tab');
    assert.ok(!rootSource.includes('manager-count-cluster'), 'system rows should not duplicate inspector counts inline');
    assert.ok(!rootSource.includes('FABRICATE.Admin.Manager.QuickActions'), 'inspector should not duplicate row actions');
    assert.ok(
      !rootSource.replace(/\r\n/g, '\n').includes("{:else}\n        <button type=\"button\" class=\"manager-button\" onclick={importSystem}>\n          <i class=\"fas fa-file-import\" aria-hidden=\"true\"></i>\n          <span>{text('FABRICATE.Admin.Manager.Import', 'Import')}</span>\n        </button>\n        <button type=\"button\" class=\"manager-button\" onclick={openCurrentAdmin}>"),
      'system library header should not render the legacy admin launch button'
    );
    assert.equal(lang.FABRICATE.Admin.Manager.SystemLibraryHint, 'Select a row to view counts and enabled features.');
    assert.equal(
      lang.FABRICATE.Admin.Manager.InspectorHint,
      'The inspector shows counts, resolution mode, and enabled features for the selected system.'
    );
    assert.ok(rootSource.includes("FABRICATE.Admin.Manager.EmptySetup.Title"), 'no-systems inspector should use localized setup copy');
    assert.ok(rootSource.includes("https://misterpotts.github.io/fabricate/quickstart/"), 'no-systems inspector should link to the published quickstart');
    assert.ok(rootSource.includes("https://misterpotts.github.io/fabricate/"), 'no-systems inspector should link to the published docs');
    assert.equal(lang.FABRICATE.Admin.Manager.EmptySetup.Title, 'Set up your first system');
    assert.equal(lang.FABRICATE.Admin.Manager.EmptySetup.Quickstart, 'Quickstart');
    assert.equal(lang.FABRICATE.Admin.Manager.EmptySetup.Docs, 'Docs');
    assert.ok(managerSource.includes('FABRICATE.Admin.Manager.Environment.EmptyTitle'), 'empty environments browser should use Manager localized copy');
    assert.ok(rootSource.includes('FABRICATE.Admin.Manager.Environment.EmptySetup.Title'), 'empty environments inspector should use localized setup copy');
    assert.ok(rootSource.includes('https://misterpotts.github.io/fabricate/gathering-environments/'), 'empty environments inspector should link to published gathering docs');
    assert.equal(lang.FABRICATE.Admin.Manager.Environment.EmptyTitle, 'Prepare gathering building blocks first');
    assert.equal(
      lang.FABRICATE.Admin.Manager.Environment.EmptyHint,
      'Define gathering tasks and hazards before creating environments, then attach those building blocks to each location players can gather from.'
    );
    assert.ok(rootSource.includes('manager-nav-submenu'), 'gathering sections should render in the left rail submenu');
    assert.ok(rootSource.includes('manager-nav-toggle'), 'gathering rail should expose an expand/collapse control');
    assert.ok(rootSource.includes("manager-nav-group ${gatheringMenuExpanded ? 'is-expanded' : ''}"), 'expanded gathering rail should style as one submenu group');
    assert.ok(rootSource.includes('const gatheringHazardDefinitions = $derived(Array.isArray(selectedGatheringSystemConfig.hazards) ? selectedGatheringSystemConfig.hazards : [])'), 'root should derive reusable gathering hazard counts from selected gathering config');
    assert.ok(rootSource.includes('total: environmentList.length + gatheringTaskDefinitions.length + gatheringHazardDefinitions.length'), 'gathering parent count should summarize environments, tasks, and hazards');
    assert.ok(rootSource.includes('<span class="manager-nav-count">{gatheringNavCounts.total}</span>'), 'gathering parent should render a summary count chip');
    assert.ok(rootSource.includes('gatheringNavCounts[gatheringItem.id]'), 'gathering submenu items should render their count chips from gathered section counts');
    assert.equal(rootSource.includes("manager-nav-parent ${isGatheringRoute ? 'is-active' : ''}"), false, 'gathering parent should not use the selected pill class');
    assert.ok(rootSource.includes('FABRICATE.Admin.Manager.Nav.ExpandGathering'), 'gathering rail expand label should be localized');
    assert.ok(rootSource.includes('FABRICATE.Admin.Manager.Nav.CollapseGathering'), 'gathering rail collapse label should be localized');
    assert.equal(environmentsBrowserSource.includes('manager-gathering-tabs'), false, 'gathering page should not render local section tabs');
    assert.ok(rootSource.includes("let activeGatheringTab = $state('environments')"), 'root should own gathering tab state for inspector coordination');
    assert.ok(environmentsBrowserSource.includes("activeGatheringTab = 'environments'"), 'gathering page should accept environments as the default active tab');
    assert.ok(environmentsBrowserSource.includes('onSelectGatheringTab(tabId)'), 'gathering page should report tab changes to the root');
    assert.ok(rootSource.includes('data-gathering-inspector-placeholder'), 'right inspector should render placeholders for non-environment gathering tabs');
    assert.equal(
      rootSource.match(/FABRICATE\.Admin\.Manager\.Environment\.Actions/g)?.length ?? 0,
      1,
      'environment actions localization should remain only for the header aria label, not a redundant inspector card'
    );
    assert.ok(
      !rootSource.includes("<h3 class=\"manager-card-title\">{text('FABRICATE.Admin.Manager.Environment.Actions', 'Environment actions')}</h3>"),
      'selected environment inspector should not render a redundant Environment actions card'
    );
    assert.ok(environmentsBrowserSource.includes('FABRICATE.Admin.Manager.Environment.GatheringTabs.TasksHint'), 'gathering task browser copy should be localized');
    assert.ok(environmentsBrowserSource.includes("selectGatheringTab('tasks')"), 'empty environments guidance should route to the Tasks tab');
    assert.ok(environmentsBrowserSource.includes("selectGatheringTab('encounters')"), 'empty environments guidance should route hazards to the Hazards tab');
    assert.ok(environmentsBrowserSource.includes('manager-environment-action-grid'), 'environment rows should keep quick action wiring');
    assert.ok(environmentsBrowserSource.includes('onEditEnvironment(environment.id)'), 'environment rows should wire edit quick actions');
    assert.ok(environmentsBrowserSource.includes('onDuplicateEnvironment(environment.id)'), 'environment rows should wire duplicate quick actions');
    assert.ok(environmentsBrowserSource.includes('onDeleteEnvironment(environment.id)'), 'environment rows should wire delete quick actions');
    assert.equal(lang.FABRICATE.Admin.Manager.Environment.GatheringTabs.Label, 'Gathering sections');
    assert.equal(lang.FABRICATE.Admin.Manager.Environment.GatheringTabs.Environments, 'Environments');
    assert.equal(lang.FABRICATE.Admin.Manager.Environment.GatheringTabs.Tasks, 'Tasks');
    assert.equal(lang.FABRICATE.Admin.Manager.Environment.GatheringTabs.Encounters, 'Hazards');
    assert.equal(lang.FABRICATE.Admin.Manager.Environment.GatheringTabs.Settings, 'Settings');
    assert.equal(lang.FABRICATE.Admin.Manager.Nav.ExpandGathering, 'Expand gathering menu');
    assert.equal(lang.FABRICATE.Admin.Manager.Nav.CollapseGathering, 'Collapse gathering menu');
    assert.equal(lang.FABRICATE.Admin.Manager.Environment.GatheringTabs.OpenTasks, 'Review tasks');
    assert.equal(lang.FABRICATE.Admin.Manager.Environment.GatheringTabs.OpenHazards, 'Review hazards');
    assert.equal(lang.FABRICATE.Admin.Manager.Environment.GatheringTabs.TasksHint, 'Browse gathering tasks before attaching them to environments.');
    assert.equal(lang.FABRICATE.Admin.Manager.Environment.GatheringTabs.EncountersHint, 'Browse reusable hazards before attaching them to environments.');
    assert.equal(lang.FABRICATE.Admin.Manager.Environment.GatheringTabs.SettingsPlaceholderHint, 'Set system-level drop resolution and hazard rules for gathering.');
    assert.equal(lang.FABRICATE.Admin.Manager.Environment.Conditions.TimeOfDayTitle, 'Times of day');
    assert.equal(lang.FABRICATE.Admin.Manager.Environment.Conditions.WeatherTitle, 'Weather conditions');
    assert.equal(lang.FABRICATE.Admin.Manager.Environment.EmptySetup.Title, 'Plan gathering content');
    assert.equal(
      lang.FABRICATE.Admin.Manager.Environment.EmptySetup.StepHazards,
      'Prepare encounter and hazard options that can be reused across risky locations.'
    );
    assert.equal(lang.FABRICATE.Admin.Manager.Environment.EmptySetup.GatheringDocs, 'Gathering docs');
    assert.ok(rootSource.includes('FABRICATE.Admin.Manager.Recipe.EmptySetup.Title'), 'empty recipes inspector should use localized setup copy');
    assert.ok(rootSource.includes('https://misterpotts.github.io/fabricate/recipes/'), 'empty recipes inspector should link to published recipe docs');
    assert.ok(rootSource.includes('selectedCounts.components > 0'), 'empty recipes inspector should branch on selected-system component count');
    assert.ok(rootSource.includes("setView('components')"), 'empty recipes inspector should route zero-component setup to Components');
    assert.equal(lang.FABRICATE.Admin.Manager.Recipe.EmptySetup.Title, 'Set up recipes');
    assert.equal(
      lang.FABRICATE.Admin.Manager.Recipe.EmptySetup.NoComponentsHint,
      'Add components before creating recipes so ingredients, catalysts, and results have reusable items to reference.'
    );
    assert.equal(lang.FABRICATE.Admin.Manager.Recipe.EmptySetup.AddComponents, 'Add components');
    assert.equal(lang.FABRICATE.Admin.Manager.Recipe.EmptySetup.RecipeDocs, 'Recipe docs');
    assert.ok(rootSource.includes('FABRICATE.Admin.Manager.Component.EmptySetup.Title'), 'empty components inspector should use localized setup copy');
    assert.ok(rootSource.includes('https://misterpotts.github.io/fabricate/crafting-systems/#components'), 'empty components inspector should link to published component docs');
    assert.equal(lang.FABRICATE.Admin.Manager.Component.EmptySetup.Title, 'Set up components');
    assert.equal(lang.FABRICATE.Admin.Manager.Component.EmptySetup.ComponentDocs, 'Component docs');
    assert.ok(rootSource.includes('FABRICATE.Admin.Manager.Essence.EmptySetup.Title'), 'empty essences inspector should use localized setup copy');
    assert.ok(rootSource.includes('https://misterpotts.github.io/fabricate/essences/'), 'empty essences inspector should link to published essence docs');
    assert.equal(lang.FABRICATE.Admin.Manager.Essence.EmptySetup.Title, 'Set up essences');
    assert.equal(lang.FABRICATE.Admin.Manager.Essence.EmptySetup.EssenceDocs, 'Essence docs');
  });

  it('keeps manager tags and categories route focused and store-wired', () => {
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

  it('keeps manager essence browsing browser-only and source UI feature-gated', () => {
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
    assert.ok(!essenceBrowserSource.includes('manager-essence-edit-row'), 'browser should not render inline edit rows');
    assert.ok(!essenceBrowserSource.includes('manager-essence-create-name'), 'browser should not render inline create fields');
    assert.ok(!essenceBrowserSource.includes('manager-essence-action-band'), 'browser should not duplicate the route-header create action');
    assert.ok(!essenceBrowserSource.includes("text('FABRICATE.Admin.Manager.Essence.SourceLinked'"), 'browser should not render linked-source badges');
    assert.ok(essenceBrowserSource.includes('manager-essence-source-cell-image'), 'browser source column should render resolved source images');
    assert.ok(essenceBrowserSource.includes('FABRICATE.Admin.Manager.Essence.SourceNoneShort'), 'browser source column should render compact None copy when unresolved');
  });

  it('uses shared manager essence picker controls on the dedicated edit route', () => {
    assert.ok(essenceEditSource.includes("import IconPicker from '../../components/IconPicker.svelte';"), 'edit route should use the shared IconPicker');
    assert.ok(essenceEditSource.includes("import EssenceSourceSelector from '../../components/EssenceSourceSelector.svelte';"), 'edit route should use the shared source selector');
    assert.ok(essenceEditSource.includes('showSourceUi'), 'edit route should gate source controls by effect transfer');
    assert.ok(essenceEditSource.includes('onDirtyChange(dirty)'), 'edit route should expose dirty state to route-exit protection');
    assert.ok(essenceEditSource.includes('onSave(draftId || null, updates)'), 'edit route should delegate create and update persistence to the root/store seam');
    assert.ok(essenceEditSource.includes('id="manager-essence-edit-form"'), 'edit route should expose a form target for route-header save actions');
    assert.ok(!essenceEditSource.includes('EditKicker'), 'edit route should not render a duplicate inner route header');
    assert.ok(!essenceEditSource.includes('IconClassHint'), 'edit route should not expose raw icon class copy');
    assert.ok(rootSource.includes('form="manager-essence-edit-form"'), 'root header should own the primary save action for the edit form');
    assert.ok(!rootSource.includes('data-essence-action="edit"'), 'inspector should not duplicate browse row edit actions');
    assert.ok(!rootSource.includes('data-essence-action="delete"'), 'inspector should not duplicate browse row delete actions');
    assert.ok(rootSource.includes('data-essence-action="copy-source"'), 'inspector should expose source UUID copy through the source action row');
    assert.ok(rootSource.includes('data-essence-action="unlink-source"'), 'inspector should expose source unlink through the source action row');
    assert.ok(rootSource.includes('store.updateEssence?.(selectedEssenceForInspector.id, { sourceComponentId })'), 'inspector source changes should use updateEssence');
    assert.ok(rootSource.includes('importSingleManagedItemFromDrop'), 'inspector source drops should reuse the managed-item import seam');
    assert.ok(!essenceEditSource.includes('game.'), 'edit route should not reference Foundry runtime globals');
  });

  it('wires production essence dirty confirmation and manager app close guard', () => {
    assert.ok(appSource.includes('confirmDiscardEssenceDraft: () => confirmDialog'), 'v2 app should provide a production discard confirmation service');
    for (const key of [
      'DiscardDirtyTitle',
      'DiscardDirtyContent',
      'DiscardDirtyConfirm',
      'DiscardDirtyCancel'
    ]) {
      assert.equal(typeof lang.FABRICATE.Admin.Manager.Essence[key], 'string', `en.json should define Essence.${key}`);
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
      'manager row Edit should no longer launch the legacy component editor'
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

  it('uses a purpose-built manager environment editor instead of mounting the legacy tab', () => {
    assert.ok(
      rootSource.includes("import EnvironmentEditView from './EnvironmentEditView.svelte';"),
      'environment edit route should import the v2 editor view'
    );
    assert.ok(!rootSource.includes("import EnvironmentsTab from '../EnvironmentsTab.svelte';"), 'manager root should not import the full legacy environments tab');
    assert.ok(!rootSource.includes('forceEditorOpen'), 'manager edit route should not force-open the legacy environment editor');
    // The v2 environment editor is a composition/wrapper editor: it composes
    // reusable library tasks/hazards into one environment via include/exclude,
    // ordering, and a shared automatic|manual composition mode. It does NOT
    // author reusable source records (that lives in the standalone
    // gathering-task-edit / gathering-hazard-edit routes), so it must wire the
    // composition store actions rather than the inline task-authoring handlers.
    for (const snippet of [
      'store.updateEnvironmentDraft',
      'store.saveEnvironmentDraft',
      'store.deleteEnvironmentDraft',
      'store.setEnvironmentCompositionMode',
      'store.includeEnvironmentRecord',
      'store.forceIncludeEnvironmentRecord',
      'store.excludeEnvironmentRecord',
      'store.restoreEnvironmentRecord',
      'store.reorderEnvironmentRecord',
      'composition={$viewState.environmentComposition}'
    ]) {
      assert.ok(rootSource.includes(snippet), `environment edit route should wire ${snippet}`);
    }
    for (const snippet of [
      'store.addEnvironmentTaskResultGroup',
      'store.addEnvironmentTaskCatalyst',
      'store.updateEnvironmentTaskVisibility',
      'store.updateEnvironmentTaskCheck'
    ]) {
      assert.ok(!environmentEditSource.includes(snippet), `environment composition editor should not author tasks via ${snippet}`);
    }
    assert.ok(!environmentEditSource.includes("id: 'advanced'"), 'environment editor should not define an advanced task tab');
    assert.ok(!environmentEditSource.includes('manager-environment-details-tabs'), 'environment editor should not render environment advanced tabs');
    assert.ok(!environmentEditSource.includes('manager-environment-evidence-column'), 'environment editor should no longer render the duplicated evidence column');
  });

  it('wires Manager gathering libraries, global conditions, and environment composition controls', () => {
    // Global conditions and vocabularies are authored from the gathering
    // workspace browser (settings tab); library task/hazard authoring and rules
    // live on their own routes, so those store actions are invoked by root-owned
    // functions rather than passed into the environment composition editor.
    for (const snippet of [
      'gatheringConfig={$viewState.gatheringConfig}',
      'onUpdateGatheringConditions={store.updateGatheringConditions}',
      'onToggleGatheringConditionEnabled={store.toggleGatheringConditionEnabled}',
      'onAddGatheringConditionValue={store.addGatheringConditionValue}',
      'onDeleteGatheringConditionValue={store.deleteGatheringConditionValue}',
      'onAddGatheringVocabularyValue={store.addGatheringVocabularyValue}',
      'onUpdateGatheringVocabularyValue={store.updateGatheringVocabularyValue}',
      'onDeleteGatheringVocabularyValue={store.deleteGatheringVocabularyValue}'
    ]) {
      assert.ok(rootSource.includes(snippet), `root should wire ${snippet}`);
    }
    // NOTE: per-token environment-editor contracts were removed when the editor
    // was placeholder'd out pending redesign. The store wirings above and the
    // settings/browser surfaces below still need to pass.
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
    assert.ok(environmentsBrowserSource.includes('ManagerColorPicker'), 'settings biome panels should use the manager color picker');
    assert.ok(environmentsBrowserSource.includes('IconPicker'), 'settings condition panels should reuse the shared icon picker');
    assert.ok(environmentsBrowserSource.includes('manager-condition-label-input'), 'settings condition panels should expose editable display labels');
    assert.ok(environmentsBrowserSource.includes("onAddGatheringConditionValue?.(kind, { label: value, icon: conditionAddIcon(kind) }"), 'settings condition add should include the selected icon');
    assert.equal(lang.FABRICATE.Admin.Manager.Environment.Conditions.NewIcon, 'New value icon');
    // NOTE: vocabulary-CSV contracts on environmentEditSource removed pending editor redesign.
    assert.ok(rootSource.includes('updateSelectedGatheringRules'), 'root should wire rule updates');
    assert.ok(rootSource.includes('manager-rule-copy'), 'root should render rule descriptions beside inspector icons');
    assert.ok(rootSource.includes('data-gathering-rule-stepper="rewardLimit"'), 'root should render the reward limit stepper');
    assert.ok(rootSource.includes('data-gathering-rule-stepper="hazardLimit"'), 'root should render the hazard limit stepper');
    assert.ok(rootSource.includes('FABRICATE.Admin.Manager.Environment.Rules.HazardHighestRankedDrop'), 'hazard rule select should use hazard-specific drop labels');
    assert.equal(lang.FABRICATE.Admin.Manager.Environment.Rules.HighestRankedDrop, 'Highest ranked successful drop');
    assert.equal(lang.FABRICATE.Admin.Manager.Environment.Rules.AllDrops, 'All successful drops');
    assert.equal(lang.FABRICATE.Admin.Manager.Environment.Rules.LimitedDrops, 'Limit successful drops');
    assert.equal(lang.FABRICATE.Admin.Manager.Environment.Rules.HazardHighestRankedDrop, 'Highest ranked triggered hazard');
    assert.equal(lang.FABRICATE.Admin.Manager.Environment.Rules.HazardAllDrops, 'All triggered hazards');
    assert.equal(lang.FABRICATE.Admin.Manager.Environment.Rules.HazardLimitedDrops, 'Limit triggered hazards');
    assert.ok(rootSource.includes('selectedGatheringConditionShortcuts'), 'root should derive selected-system condition shortcuts');
    assert.ok(rootSource.includes('buildSelectedGatheringConditionShortcuts'), 'root should keep shortcut visibility gated by selected-system gathering conditions');
    assert.ok(rootSource.includes('data-systems-gathering-conditions'), 'systems inspector should render a global condition shortcut card');
    assert.ok(rootSource.includes('data-systems-gathering-condition={condition.kind}'), 'systems inspector should render one shortcut per enabled condition dimension');
    assert.ok(rootSource.includes("store.updateGatheringConditions?.({ [kind]: value, systemId: selectedSystemId })"), 'systems inspector shortcuts should reuse current condition persistence with selected system id');
    // NOTE: per-token environment-editor negative assertions removed pending editor redesign.
  });

  // NOTE: FilePicker and scene-drop-zone contracts on environmentEditSource removed
  // when the editor was placeholder'd out pending redesign.

  it('wires Manager Gathering Tasks browser through root-owned selection and store callbacks', () => {
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
      'GatheringTaskEditView',
      '{itemCards}',
      'data-gathering-task-drop-inspector',
      'addGatheringDropModifier',
      'updateGatheringDropModifier',
      'manager-drop-editor-actions'
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
      'manager-gathering-tasks-table',
      'regionChips(task)',
      'biomeChips(task)',
      'timeChips(task)',
      'weatherChips(task)',
      'rowChips(task)',
      'data-gathering-task-tags',
      'onDuplicateTask(selectedSystemId, task.id)',
      'onDeleteTask(selectedSystemId, task.id)',
      'onToggleTaskEnabled(selectedSystemId, task.id'
    ]) {
      assert.ok(gatheringTasksBrowserSource.includes(snippet), `task browser should include ${snippet}`);
    }
    for (const snippet of [
      'data-gathering-task-editor',
      'class:has-reward-rule-notice={showRewardRuleNotice}',
      'data-gathering-task-core-editor',
      'data-gathering-task-availability',
      'data-gathering-task-component-browser',
      'data-gathering-task-component-grid',
      'data-gathering-component-card',
      'data-gathering-component-name-search',
      'data-gathering-component-tag-search',
      'manager-selected-tag-pill',
      'data-gathering-task-drops-table',
      'data-gathering-task-availability-option',
      'data-gathering-task-availability-pill',
      'data-gathering-task-drop-component-cell',
      'data-gathering-task-drop-chance-cell',
      'data-gathering-task-drop-count',
      'manager-task-drop-controls',
      'manager-task-drop-footer',
      'manager-task-component-browser-card',
      'manager-task-component-grid',
      'manager-task-component-card-grip',
      'let pageSize = $state(5)',
      'manager-drop-cell',
      'manager-drop-component-cell',
      'manager-drop-quantity-cell',
      'manager-drop-modifier-pill',
      'manager-drop-modifier-list',
      'manager-drop-rate-value',
      'manager-drop-rate-percent',
      'manager-drop-rate-track',
      'manager-drop-rate-fill',
      'inputmode="numeric"',
      "pattern={'[1-9][0-9]{0,2}'}",
      'pattern="[0-9]*"',
      'onClearDropComponent',
      'onDropComponentMouseDown',
      'onDropRateInput',
      'onDropRateBlur',
      'onDropRateKeydown',
      'onComponentDragStart',
      'FabricateManagedComponent',
      "onUpdateDrop(rowId, { componentId: data.componentId, itemUuid: '', systemItemId: '', name: '', enabled: true })",
      'dropRateTierClass',
      'dropRateTierColor',
      'onQuantityInput',
      'onQuantityKeydown',
      'oncontextmenu',
      'use:dragDrop',
      'onImportDrop(rowId, data)',
      'onPickImagePath',
      'DropChance',
      'ClearDropComponentHint',
      'DropQuantityColumn',
      'RewardRuleNotice'
    ]) {
      assert.ok(gatheringTaskEditSource.includes(snippet), `task editor should include ${snippet}`);
    }
    for (const snippet of [
      'manager-drop-editor-values',
      'data-gathering-drop-inspector-rate',
      'data-gathering-drop-inspector-count',
      'gatheringDropRateTierClass',
      'gatheringDropRateTierColor',
      'onGatheringDropRateKeydown',
      'onGatheringDropCountKeydown',
      'manager-drop-rate-control',
      'manager-drop-rate-track',
      'manager-drop-rate-fill'
    ]) {
      assert.ok(rootSource.includes(snippet), `root should include selected drop inspector ${snippet}`);
    }
    assert.ok(!gatheringTaskEditSource.includes('manager-task-editor-tabs'), 'task editor should be a one-page editor without tab navigation');
    assert.ok(gatheringTaskEditSource.includes('TaskIdentity'), 'task editor should render a visible task identity heading');
    assert.ok(!/Tasks\.TaskId(?!entity)/.test(gatheringTaskEditSource), 'task editor should not render the raw internal task id localization');
    assert.ok(!gatheringTaskEditSource.includes('Internal ID'), 'task editor should not render the raw internal task id label');
    assert.ok(!gatheringTaskEditSource.includes('BackToLibrary'), 'task editor should not render a duplicate central back-to-library control');
    assert.ok(!gatheringTaskEditSource.includes('type="checkbox"'), 'task editor status toggle should use the shared button pattern');
    assert.ok(!gatheringTaskEditSource.includes('<select value={selectedCondition'), 'task availability should not use native single-select controls');
    assert.ok(!gatheringTaskEditSource.includes('function selectedCondition('), 'task availability should not collapse arrays to a single selection');
    assert.ok(!gatheringTaskEditSource.includes('Tasks.SelectDrop'), 'drop rows should not render a row-level edit/select quick action');
    assert.ok(!gatheringTaskEditSource.includes('data-gathering-task-drop-actions'), 'drop rows should not render row-level duplicate/delete actions');
    assert.ok(!gatheringTaskEditSource.includes('data-gathering-task-drop-row-number'), 'drop rows should not add a leading row number column');
    assert.ok(!gatheringTaskEditSource.includes('EditDrop'), 'drop rows should not add an edit quick action');
    assert.ok(!gatheringTaskEditSource.includes('manager-labeled-cell manager-drop-component-cell'), 'drop component row values should not render responsive duplicate labels');
    assert.ok(!gatheringTaskEditSource.includes('manager-labeled-cell manager-drop-rate-cell'), 'drop chance row values should not render responsive duplicate labels');
    assert.ok(!gatheringTaskEditSource.includes('QuantityShortHint'), 'drop quantity row values should not render an extra helper label');
    assert.ok(!rootSource.includes('selectedGatheringDrop.componentId ||'), 'selected drop inspector should not render a component selector');
    assert.ok(gatheringTaskEditSource.includes('manager-task-media-column'), 'task editor should group image and status in the media column');
    assert.ok(gatheringTaskEditSource.includes('availableConditionOptions'), 'task editor should filter selected availability options out of menus');
    assert.ok(gatheringTaskEditSource.includes('selectedConditionOptions'), 'task editor should render selected availability values as pills');
    assert.ok(gatheringTaskEditSource.includes('StatusOff'), 'task editor should use shared Off status copy');
    assert.ok(gatheringTaskEditSource.includes('StatusOn'), 'task editor should use shared On status copy');
    assert.ok(gatheringTaskEditSource.includes('manager-task-required-tools-card'), 'task editor should render the Required Tools section');
    assert.ok(gatheringTaskEditSource.includes('data-gathering-task-required-tools'), 'Required Tools section should expose a stable data hook');
    assert.ok(gatheringTaskEditSource.includes('onAddToolReference'), 'task editor should call back to the root for tool-reference additions');
    assert.ok(gatheringTaskEditSource.includes('onRemoveToolReference'), 'task editor should call back to the root for tool-reference removals');
    assert.ok(rootSource.includes('selectedGatheringSystemTools'), 'root should derive the per-system tools library for the task editor');
    assert.ok(rootSource.includes('addToolReferenceToSelectedTask'), 'root should expose an add-tool-reference handler');
    assert.ok(rootSource.includes('removeToolReferenceFromSelectedTask'), 'root should expose a remove-tool-reference handler');
    assert.equal(lang.FABRICATE.Admin.Manager.Environment.Tasks.RequiredToolsTitle, 'Required Tools');
    assert.equal(lang.FABRICATE.Admin.Manager.Environment.Tasks.RequiredToolsEmpty, 'No tools required.');
    assert.equal(lang.FABRICATE.Admin.Manager.Environment.Tasks.StaleToolChip, 'Deleted tool');
    assert.equal(lang.FABRICATE.Admin.Manager.Environment.Tasks.SearchTools, 'Search tools...');
    assert.equal(lang.FABRICATE.Admin.Manager.Environment.Tasks.EmptyTitle, 'No gathering tasks yet');
    assert.equal(lang.FABRICATE.Admin.Manager.Environment.Tasks.DropChance, 'Drop chance');
    assert.equal(lang.FABRICATE.Admin.Manager.Environment.Tasks.DropChancePercent, 'Drop chance percent');
    assert.equal(lang.FABRICATE.Admin.Manager.Environment.Tasks.DropQuantityColumn, 'Count');
    assert.equal(lang.FABRICATE.Admin.Manager.Environment.Tasks.ClearDropComponentHint, 'Right-click to clear component');
    assert.equal(lang.FABRICATE.Admin.Manager.Environment.Tasks.NoComponent, 'No Component');
    assert.equal(lang.FABRICATE.Admin.Manager.Environment.Tasks.CreateOrAssign, 'Create or assign');
    assert.equal(lang.FABRICATE.Admin.Manager.Environment.Tasks.TaskIdentity, 'Task Identity');
    assert.equal(lang.FABRICATE.Admin.Manager.Environment.Tasks.TaskId, undefined);
    assert.equal(lang.FABRICATE.Admin.Manager.Environment.NewLibraryTask, 'New Gathering Task');
    assert.equal(
      rootSource.match(/FABRICATE\.Admin\.Manager\.Environment\.Tasks\.Actions/g)?.length ?? 0,
      1,
      'gathering task actions localization should remain only for the header aria label, not a redundant inspector card'
    );
    assert.ok(
      !rootSource.includes("<h3 class=\"manager-card-title\">{text('FABRICATE.Admin.Manager.Environment.Tasks.Actions', 'Gathering task actions')}</h3>"),
      'gathering task inspector should not keep an action card heading'
    );
    assert.ok(!rootSource.includes('duplicateGatheringTask(selectedSystemId, selectedGatheringTask.id)'), 'gathering task inspector should not duplicate row-level duplicate actions');
    assert.equal(lang.FABRICATE.Admin.Manager.Environment.Tasks.BackToLibrary, 'Back to task library');
    assert.equal(lang.FABRICATE.Admin.Manager.Environment.Tasks.CopySuffix, 'Copy');
    assert.equal(lang.FABRICATE.Admin.Manager.Environment.Tasks.Delete, 'Delete gathering task');
    assert.ok(
      rootSource.includes('onclick={deleteGatheringTaskDraft}'),
      'gathering task editor toolbar should wire the delete button to deleteGatheringTaskDraft'
    );
    assert.ok(
      /manager-button is-danger[\s\S]{0,200}deleteGatheringTaskDraft/.test(rootSource),
      'gathering task editor delete button should use the is-danger destructive style'
    );
  });

  // NOTE: status-toggle contract on environmentEditSource removed when the editor
  // was placeholder'd out pending redesign.

  it('wires the Gathering Tools page through root-owned draft callbacks', () => {
    assert.ok(
      rootSource.includes("import ToolsBrowserView from './ToolsBrowserView.svelte';"),
      'root should import ToolsBrowserView'
    );
    for (const snippet of [
      "currentView === 'tools'",
      'enterToolsDraft',
      'saveToolDraft',
      'saveAllDirtyToolDrafts',
      'cancelToolsDraft',
      'addToolToDraft',
      'updateToolInDraft',
      'deleteToolFromDraft',
      'selectDraftTool',
      'setExpandedDraftTool',
      'toolsDraftDirtyToolIds',
      'toolsDraftSelectedToolId',
      'toolsNavCount',
      'selectedToolDraftValidation'
    ]) {
      assert.ok(rootSource.includes(snippet), `root should reference ${snippet}`);
    }
    assert.ok(
      /onclick=\{\(\) => setView\('tools'\)\}/.test(rootSource),
      'root should wire a top-level Tools nav button to setView(\'tools\')'
    );
    assert.ok(
      rootSource.includes('<span class="manager-nav-count">{toolsNavCount}</span>'),
      'root should render a Tools nav count chip'
    );
    assert.ok(
      lang.FABRICATE.Admin.Manager.Tools && typeof lang.FABRICATE.Admin.Manager.Tools === 'object',
      'lang should expose a FABRICATE.Admin.Manager.Tools block'
    );
    assert.equal(lang.FABRICATE.Admin.Manager.Tools.Title, 'Tools');
    assert.equal(lang.FABRICATE.Admin.Manager.Tools.Add, 'Add tool');
    assert.equal(lang.FABRICATE.Admin.Manager.Tools.Save, 'Save changes');
    assert.equal(lang.FABRICATE.Admin.Manager.Tools.NavigationDirty.SaveAll, 'Save All');
    assert.equal(lang.FABRICATE.Admin.Manager.Tools.RequirementInstructions, 'Enter an actor roll-data property. The tool is available when the value is greater than zero.');
    assert.equal(lang.FABRICATE.Admin.Manager.Tools.RequirementExampleActorProperty, 'Example: @tools.example.value');
    assert.ok(!toolsBrowserSource.includes('ProviderExpressionInput'), 'tools requirement editor should not expose provider selection');
    assert.ok(toolsBrowserSource.includes('manager-tools-requirement-expression'), 'tools requirement editor should expose a single expression input');
    assert.equal(lang.FABRICATE.Admin.Manager.Environment.GatheringTabs.Tools, 'Tools');
  });
});
