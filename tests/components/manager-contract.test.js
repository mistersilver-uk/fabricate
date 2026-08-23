import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { classMemberSource, moduleFunctionSource } from '../helpers/boundedSource.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dirname, '../..');
const rootPath = resolve(repoRoot, 'src/ui/svelte/apps/manager/CraftingSystemManagerRoot.svelte');
const essenceBrowserPath = resolve(
  repoRoot,
  'src/ui/svelte/apps/manager/EssenceBrowserView.svelte'
);
const essenceEditPath = resolve(repoRoot, 'src/ui/svelte/apps/manager/EssenceEditView.svelte');
// The GM Essence Studio's own components (issue 1036). They sit under `essences/` — the
// BROWSER's directory, which the screenshot evidence map globs for the essence views — and
// every one of them joins `managerSource` below. A `!managerSource.includes(...)` assertion
// over markup that MOVED into one of these goes vacuous rather than red, which is why the
// join has to move in lockstep with the extraction.
const essenceStudioDir = resolve(repoRoot, 'src/ui/svelte/apps/manager/essences');
const tagsCategoriesPath = resolve(
  repoRoot,
  'src/ui/svelte/apps/manager/TagsCategoriesView.svelte'
);
const systemEditPath = resolve(repoRoot, 'src/ui/svelte/apps/manager/SystemEditView.svelte');
// World > Currency (issue 1278): the relocated currency editor, whose contract used to be part
// of SystemEditView's.
const worldCurrencyPath = resolve(
  repoRoot,
  'src/ui/svelte/apps/manager/world/WorldCurrencyTab.svelte'
);
const craftingSettingsPath = resolve(
  repoRoot,
  'src/ui/svelte/apps/manager/CraftingSettingsView.svelte'
);
const resolutionModeOptionsPath = resolve(
  repoRoot,
  'src/ui/svelte/apps/manager/resolutionModeOptions.js'
);
const systemsBrowserPath = resolve(
  repoRoot,
  'src/ui/svelte/apps/manager/SystemsBrowserView.svelte'
);
const recipesBrowserPath = resolve(
  repoRoot,
  'src/ui/svelte/apps/manager/RecipesBrowserView.svelte'
);
// The library inspector, extracted out of the root (issue 643). It sits under
// `recipes/`, NOT `recipe/` — the latter is the recipe EDITOR's screenshot-map glob.
const recipeBrowserInspectorPath = resolve(
  repoRoot,
  'src/ui/svelte/apps/manager/recipes/RecipeBrowserInspector.svelte'
);
const componentEditPath = resolve(repoRoot, 'src/ui/svelte/apps/manager/ComponentEditView.svelte');
const componentsBrowserPath = resolve(
  repoRoot,
  'src/ui/svelte/apps/manager/ComponentsBrowserView.svelte'
);
const componentRowPath = resolve(
  repoRoot,
  'src/ui/svelte/apps/manager/components/ComponentRow.svelte'
);
const environmentEditPath = resolve(
  repoRoot,
  'src/ui/svelte/apps/manager/EnvironmentEditView.svelte'
);
const environmentsBrowserPath = resolve(
  repoRoot,
  'src/ui/svelte/apps/manager/EnvironmentsBrowserView.svelte'
);
const gatheringTaskEditPath = resolve(
  repoRoot,
  'src/ui/svelte/apps/manager/GatheringTaskEditView.svelte'
);
const chanceSliderPath = resolve(repoRoot, 'src/ui/svelte/components/ChanceSlider.svelte');
const gatheringTasksBrowserPath = resolve(
  repoRoot,
  'src/ui/svelte/apps/manager/GatheringTasksBrowserView.svelte'
);
// The GM Knowledge surface (issue 785). `KnowledgeView` and the reusable
// `ArmedDangerButton` sit at the manager root; the surface's own children live
// under `knowledge/`, which is also where the pure projection lives.
const knowledgePath = resolve(repoRoot, 'src/ui/svelte/apps/manager/KnowledgeView.svelte');
const armedDangerButtonPath = resolve(
  repoRoot,
  'src/ui/svelte/apps/manager/ArmedDangerButton.svelte'
);
const knowledgeComponentDir = resolve(repoRoot, 'src/ui/svelte/apps/manager/knowledge');
const toolsBrowserPath = resolve(repoRoot, 'src/ui/svelte/apps/manager/ToolsBrowserView.svelte');
const toolEditPath = resolve(repoRoot, 'src/ui/svelte/apps/manager/ToolEditView.svelte');
const toolBreakagePath = resolve(
  repoRoot,
  'src/ui/svelte/apps/manager/tools/ToolBreakageTab.svelte'
);
const toolOverviewPath = resolve(
  repoRoot,
  'src/ui/svelte/apps/manager/tools/ToolOverviewTab.svelte'
);
const toolRequirementsPath = resolve(
  repoRoot,
  'src/ui/svelte/apps/manager/tools/ToolRequirementsTab.svelte'
);
const toolValidationPath = resolve(
  repoRoot,
  'src/ui/svelte/apps/manager/tools/ToolValidationTab.svelte'
);
const appPath = resolve(repoRoot, 'src/ui/SvelteCraftingSystemManagerApp.svelte.js');
const mainPath = resolve(repoRoot, 'src/main.js');
const langPath = resolve(repoRoot, 'lang/en.json');

const rootSource = readFileSync(rootPath, 'utf8');
// The reward and event limit counts are one shared component (issue 1050), so the marker the
// root used to carry twice is emitted there from its `rule` prop.
const gatheringRuleLimitStepperSource = readFileSync(
  resolve(repoRoot, 'src/ui/svelte/apps/manager/environment/GatheringRuleLimitStepper.svelte'),
  'utf8'
);
const essenceBrowserSource = readFileSync(essenceBrowserPath, 'utf8');
// The paginated rows/columns are the shared studio-library shelf now, so the `<ul>` and its
// `role="list"` are rendered there rather than in each browser view.
const libraryShelfSource = readFileSync(
  resolve(repoRoot, 'src/ui/svelte/apps/manager/library/LibraryShelf.svelte'),
  'utf8'
);
const essenceEditSource = readFileSync(essenceEditPath, 'utf8');
const essenceStudioSources = readdirSync(essenceStudioDir)
  .filter((entry) => entry.endsWith('.svelte') || entry.endsWith('.js'))
  .map((entry) => readFileSync(resolve(essenceStudioDir, entry), 'utf8'));
const essenceStudioSource = essenceStudioSources.join('\n');
const tagsCategoriesSource = readFileSync(tagsCategoriesPath, 'utf8');
const systemEditSource = readFileSync(systemEditPath, 'utf8');
const worldCurrencySource = readFileSync(worldCurrencyPath, 'utf8');
const craftingSettingsSource = readFileSync(craftingSettingsPath, 'utf8');
const resolutionModeOptionsSource = readFileSync(resolutionModeOptionsPath, 'utf8');
const systemsBrowserSource = readFileSync(systemsBrowserPath, 'utf8');
const recipesBrowserSource = readFileSync(recipesBrowserPath, 'utf8');
const recipeBrowserInspectorSource = readFileSync(recipeBrowserInspectorPath, 'utf8');
const componentEditSource = readFileSync(componentEditPath, 'utf8');
const componentsBrowserSource = readFileSync(componentsBrowserPath, 'utf8');
const componentRowSource = readFileSync(componentRowPath, 'utf8');
const environmentEditSource = readFileSync(environmentEditPath, 'utf8');
const environmentsBrowserSource = readFileSync(environmentsBrowserPath, 'utf8');
const gatheringTaskEditSource = readFileSync(gatheringTaskEditPath, 'utf8');
const chanceSliderSource = readFileSync(chanceSliderPath, 'utf8');
const gatheringTasksBrowserSource = readFileSync(gatheringTasksBrowserPath, 'utf8');
const knowledgeSource = readFileSync(knowledgePath, 'utf8');
const armedDangerButtonSource = readFileSync(armedDangerButtonPath, 'utf8');
const toolsBrowserSource = readFileSync(toolsBrowserPath, 'utf8');
const toolEditSource = readFileSync(toolEditPath, 'utf8');
const toolBreakageSource = readFileSync(toolBreakagePath, 'utf8');
const toolOverviewSource = readFileSync(toolOverviewPath, 'utf8');
const toolRequirementsSource = readFileSync(toolRequirementsPath, 'utf8');
const toolValidationSource = readFileSync(toolValidationPath, 'utf8');
const appSource = readFileSync(appPath, 'utf8');
const hostSource = readFileSync(
  resolve(repoRoot, 'src/ui/svelte/apps/manager/downtime/WorldDowntimeExtensionHost.svelte'),
  'utf8'
);
const managerExtensionsSource = readFileSync(
  resolve(repoRoot, 'src/ui/managerExtensions.js'),
  'utf8'
);
const previewProviderSource = readFileSync(
  resolve(repoRoot, 'src/ui/svelte/apps/manager/downtime/worldDowntimePreviewProvider.js'),
  'utf8'
);
const mainSource = readFileSync(mainPath, 'utf8');
const lang = JSON.parse(readFileSync(langPath, 'utf8'));

const managerSource = [
  rootSource,
  recipeBrowserInspectorSource,
  essenceBrowserSource,
  essenceEditSource,
  essenceStudioSource,
  tagsCategoriesSource,
  systemEditSource,
  craftingSettingsSource,
  resolutionModeOptionsSource,
  systemsBrowserSource,
  recipesBrowserSource,
  componentsBrowserSource,
  componentEditSource,
  environmentEditSource,
  environmentsBrowserSource,
  gatheringTaskEditSource,
  chanceSliderSource,
  gatheringTasksBrowserSource,
  toolsBrowserSource,
].join('\n');

function catalogValue(key) {
  return key.split('.').reduce((node, part) => node?.[part], lang);
}

function decodeStaticString(quote, body) {
  return Function(`return ${quote}${body}${quote};`)();
}

function staticTextCalls(source) {
  const pattern =
    /text\(\s*(["'])(FABRICATE(?:\\.|(?!\1).)*)\1\s*,\s*(["'])((?:\\.|(?!\3).)*)\3\s*\)/gs;
  return [...source.matchAll(pattern)].map((match) => ({
    key: match[2],
    fallback: decodeStaticString(match[3], match[4]),
  }));
}

function isChangedManagerEnvironmentLocalizationKey(key) {
  return (
    // The Knowledge surface's whole string tree is authored fresh in issue 785, so
    // every fallback it renders is compared against en.json rather than only the
    // keys an older change happened to touch.
    key.startsWith('FABRICATE.Admin.Manager.Knowledge.') ||
    key === 'FABRICATE.Admin.Manager.Nav.Knowledge' ||
    key.startsWith('FABRICATE.Admin.Manager.Environment.') ||
    key.startsWith('FABRICATE.Admin.Manager.EnvironmentEditor.') ||
    key.startsWith('FABRICATE.Admin.Manager.Gathering.CharacterModifiers.') ||
    key.startsWith('FABRICATE.Admin.Manager.CurrencyUnits.') ||
    key.startsWith('FABRICATE.Admin.Environments.') ||
    [
      'FABRICATE.Admin.Manager.GlobalConditions',
      'FABRICATE.Admin.Manager.CurrentTimeOfDay',
      'FABRICATE.Admin.Manager.CurrentWeather',
    ].includes(key)
  );
}

function sourceName(filePath) {
  return filePath.replace(`${repoRoot}\\`, '').replace(`${repoRoot}/`, '');
}

describe('CraftingSystemManager source contract', () => {
  it('injects the exact page-session manager extension registry into the Svelte root', () => {
    assert.ok(appSource.includes("import { managerExtensions } from './managerExtensions.js';"));
    assert.ok(appSource.includes('managerExtensions,'));
    assert.ok(
      rootSource.includes(
        'let { store, services = null, managerExtensions = null, playerExtensions = null } = $props()'
      )
    );
    assert.ok(rootSource.includes('<WorldDowntimeExtensionHost'));
  });
  it('keeps one owner of the active Downtime provider, and it is the shell', () => {
    // The rail renders the active tab set while the host is UNMOUNTED, and a mount fault
    // has to move the rail as well as the panel. Two subscribers to the same registry would
    // disagree on both, so the shell subscribes and the host takes a prop.
    assert.ok(
      rootSource.includes('managerExtensions.subscribe(WORLD_DOWNTIME_SURFACE_ID'),
      'the shell subscribes to the surface it renders'
    );
    assert.ok(
      !hostSource.includes('.subscribe('),
      'the Downtime host takes the live provider as a prop and subscribes to nothing'
    );
    assert.ok(
      hostSource.includes('onProviderFault(activeProvider)'),
      'a mount fault is reported UP to the shell rather than healed locally'
    );
    // Core's own tab id list is content, not contract: nothing on the seam may read it.
    assert.ok(
      !managerExtensionsSource.includes('CORE_DOWNTIME_PREVIEW_TAB_IDS'),
      'the registry never enumerates the tab ids it will accept'
    );
    assert.ok(
      previewProviderSource.includes('export const CORE_DOWNTIME_PREVIEW_TAB_IDS'),
      "Core's preview tab ids live beside the copy and icons they index"
    );
  });
  // The cross-component handoff that names the companion panel (issue 1213). Root owns the id
  // and threads it down; the host consumes it. Every claim here was ungated at review, and the
  // host's DEFAULT was itself the hand-maintained mirror its own comment forbids — a second
  // copy of Root's literal, agreeing today and undetectable the day it stops. Deleting the
  // thread-through at the call site survived the entire suite.
  it('threads the rail label id into the Downtime host rather than mirroring the literal', () => {
    assert.ok(
      rootSource.includes(
        'const downtimeNavLabelId = (tabId) => `manager-downtime-nav-label-${tabId}`;'
      ),
      'Root owns the rail label id, stated once'
    );
    assert.ok(
      rootSource.includes('navLabelId={downtimeNavLabelId}'),
      'and passes it to the host — without this the panel region has no name at all'
    );
    assert.ok(
      hostSource.includes('aria-labelledby={navLabelId(tab.id)}'),
      'the host names its region from the prop and derives no id of its own'
    );
    // REQUIRED, with no default. The host must not be able to answer the question itself.
    assert.match(
      hostSource,
      /^\s{4}navLabelId,\s*$/m,
      'navLabelId is declared with no fallback, so an unthreaded host fails loudly'
    );
    assert.ok(
      !hostSource.includes('manager-downtime-nav'),
      'and the host carries no copy of Root literal in any form'
    );
    // The region takes the SCREEN name, so the id points at the label span rather than at the
    // button — whose accessible name is the tab's `accessibleName`, an instruction.
    assert.ok(
      rootSource.includes('<span class="manager-nav-label" id={downtimeNavLabelId(item.id)}'),
      'the id lands on the visible label element'
    );
    assert.match(
      rootSource,
      /aria-label=\{downtimeCoreFallback\s*\?\s*undefined\s*:\s*downtimeTabText\(item, 'accessibleName'\)\}/,
      'and the sub-item consumes accessibleName in provider mode, so the seam does not require a field it discards'
    );
  });
  it('disposes a Downtime companion before ApplicationV2 closes and removes its Svelte target', () => {
    const closeStart = appSource.indexOf('async close(options) {');
    const closeEnd = appSource.indexOf('  static show()', closeStart);
    const closeSource = appSource.slice(closeStart, closeEnd);
    const dispose = closeSource.indexOf('disposeDowntimeProviderBeforeRemoval?.()');
    const superClose = closeSource.indexOf('return super.close(options);');
    assert.ok(dispose >= 0, 'the production manager close invokes the root disposal bridge');
    assert.ok(superClose > dispose, 'the bridge runs before ApplicationV2 removes the Svelte target');
    assert.match(
      closeSource,
      /disposeDowntimeProviderBeforeRemoval\?\.\(\);[\s\S]*?return super\.close\(options\);/,
      'the real manager close keeps disposal and ApplicationV2 close in one ordered composition'
    );
  });
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
    assert.ok(
      appSource.includes('height: 940'),
      'manager app should open tall enough for gathering task drag/drop'
    );
    assert.ok(
      !mainSource.includes("import './ui/SvelteRecipeManagerApp.svelte.js';"),
      'legacy manager side-effect import should be removed'
    );
    // Issue 150: the GM-only manager subtree is deferred to a lazy chunk, so
    // main.js must NOT statically side-effect-import it and must instead pull it
    // in through a dynamic import() behind the memoized loader.
    assert.ok(
      !mainSource.includes("import './ui/SvelteCraftingSystemManagerApp.svelte.js';"),
      'manager static side-effect import should be removed so it lands in a lazy chunk'
    );
    assert.ok(
      mainSource.includes("import('./ui/SvelteCraftingSystemManagerApp.svelte.js')"),
      'manager app should be pulled in via a dynamic import for the lazy chunk'
    );
    assert.ok(
      mainSource.includes('loadCraftingSystemManagerAppClass'),
      'main.js should expose the memoized async manager loader'
    );
  });

  // The access rosters are the manager's only Foundry user/ownership surface, and every
  // rule below is one a naive implementation gets WRONG in a way that silently
  // UNDER- or OVER-reports who can craft a recipe (issue 643 §4b).
  it('derives the access rosters from the non-GM roster, never by testing a GM', () => {
    // `Document#testUserPermission` short-circuits EVERY GM (Assistant included, since
    // `User#isGM` is `hasRole(ASSISTANT)`) to OWNER, so GMs must be filtered FIRST.
    assert.ok(
      appSource.includes('game.users?.players'),
      'uses the canonical Foundry non-GM roster'
    );
    assert.ok(appSource.includes('_playerUsers()'), 'both rosters go through the one GM filter');
    assert.equal(
      appSource.includes('actor.isOwner'),
      false,
      'never uses the game.user-scoped Actor#isOwner (always true on a GM client)'
    );
    // The fallback must agree with `Users#players` (`!u.isGM && u.hasRole('PLAYER')`).
    // A `!isGM` filter alone admits role-NONE users, offering the GM a grantable target
    // the engine ignores.
    const fallback = appSource.slice(
      appSource.indexOf('_playerUsers() {'),
      appSource.indexOf('_userRoleLabel(role) {')
    );
    assert.ok(
      fallback.includes("hasRole('PLAYER')") && fallback.includes('USER_ROLES?.PLAYER'),
      'the fallback applies the same role floor as the canonical roster'
    );
    // Everything this labels comes from the GM-free roster, so a GAMEMASTER/ASSISTANT
    // branch would be unreachable code claiming to handle a case that cannot arrive.
    const roleLabel = appSource.slice(appSource.indexOf('_userRoleLabel(role) {'));
    assert.equal(
      roleLabel.slice(0, roleLabel.indexOf('_userColor')).includes('RoleGamemaster'),
      false,
      'a GM never reaches the role label — the roster excludes them'
    );
  });

  it('models "who plays this character" as a SET, with the whole-table case explicit', () => {
    assert.ok(
      appSource.includes("actor.testUserPermission?.(user, 'OWNER')"),
      'OWNER holders control the actor'
    );
    assert.ok(appSource.includes('user.character.id === actor.id'), 'the assigned player too');
    assert.ok(appSource.includes('controlledBy'), 'the union is exposed as a set');
    assert.ok(
      appSource.includes('sharedWithAllPlayers'),
      'ownership.default >= OWNER reaches the whole table'
    );
    assert.ok(appSource.includes('actor.ownership?.default'), 'reads the default ownership level');
    assert.equal(appSource.includes('playedBy'), false, 'no lossy singular playedBy field');
  });

  it('resolves granted character ids over EVERY world actor, not the PC-filtered roster', () => {
    // The runtime predicate applies no type filter, so a grant naming a non-PC actor is
    // still honoured — resolving over the filtered roster would drop it from display.
    assert.ok(appSource.includes('getAccessCharacterActors:'), 'exposes the unfiltered roster');
    const unfiltered = appSource.slice(
      appSource.indexOf('getAccessCharacterActors:'),
      appSource.indexOf('getWorldItemOptions:')
    );
    assert.equal(
      unfiltered.includes('isPlayerCharacterActor'),
      false,
      'the access roster applies no player-character type filter'
    );
  });

  it('forwards Tool Item services from the internal service set into prepared Svelte props', () => {
    const buildServicesStart = appSource.indexOf('  _buildServices() {');
    const preparePropsStart = appSource.indexOf('  _prepareSvelteProps(context) {');
    const preparePropsEnd = appSource.indexOf('\n  // Foundry', preparePropsStart);
    const buildServicesSource = appSource.slice(buildServicesStart, preparePropsStart);
    const preparePropsSource = appSource.slice(preparePropsStart, preparePropsEnd);
    const preparedServicesSource = preparePropsSource.slice(
      preparePropsSource.indexOf('      services: {')
    );

    assert.ok(
      buildServicesSource.includes('getWorldItemOptions: () =>') &&
        buildServicesSource.includes(
          'resolveToolSource: (uuid) => resolveItemSourceSnapshot(uuid)'
        ),
      'the internal service set should define the world Item projection and Tool source resolver'
    );
    assert.ok(
      preparedServicesSource.includes('getWorldItemOptions: this._services.getWorldItemOptions,'),
      'prepared Svelte props should forward world Item options into the root services'
    );
    assert.ok(
      preparedServicesSource.includes('resolveToolSource: this._services.resolveToolSource,'),
      'prepared Svelte props should forward Tool Item drop resolution into the root services'
    );
  });

  it('key-filters the noisy updateActor hook so an HP tick does not reproject', () => {
    assert.ok(appSource.includes("Hooks.on('updateActor'"), 'actor updates are hooked');
    assert.ok(
      appSource.includes("'ownership' in diff || 'name' in diff || 'img' in diff"),
      'only ownership / name / img reproject the rosters'
    );
    assert.ok(appSource.includes("'createActor'"), 'actor creation reprojects');
    assert.ok(appSource.includes("'deleteActor'"), 'actor deletion reprojects');
    assert.ok(
      appSource.includes('refreshAccessRosters'),
      'reprojects both rosters, not just users'
    );
  });

  it('guards manager startup against unready Fabricate services', () => {
    assert.ok(
      appSource.includes('isFabricateReady'),
      'manager app should expose readiness through services'
    );
    assert.ok(
      appSource.includes('onFabricateReady'),
      'manager app should expose a ready callback service'
    );
    assert.ok(
      appSource.includes("hooks.once('fabricate.ready'"),
      'ready callback should listen at the Foundry edge'
    );
    assert.ok(
      appSource.includes('_pendingReadyOpen'),
      'v2 app should prevent duplicate deferred opens'
    );
    assert.ok(
      appSource.includes('StartupPending'),
      'v2 app should notify when startup defers the window open'
    );
    assert.ok(
      appSource.includes("hooks.once('fabricate.ready', openWhenReady)"),
      'v2 app should defer direct opens until fabricate.ready'
    );
    assert.ok(
      systemsBrowserSource.includes('systemsLoading'),
      'systems browser should receive loading state'
    );
    assert.ok(
      rootSource.includes('systemsLoading'),
      'root should pass loading state to systems browser and inspector'
    );
    assert.equal(lang.FABRICATE.Admin.Manager.LoadingSystems, 'Loading crafting systems...');
    assert.equal(
      lang.FABRICATE.Admin.Manager.StartupPending,
      'Fabricate is still loading. The crafting system manager will open when startup finishes.'
    );
  });

  // Issue 643 established the manager titlebar; issue 1185 reassigned its gold badge.
  // The badge USED to name the selected crafting system — which the rail's crafting-system
  // card already does on every screen, so the strip was repeating the rail. It now carries
  // the premium signal instead, and only when a companion module is registered.
  it('renders a titlebar carrying the premium signal and the system resolution', () => {
    for (const snippet of [
      'class="manager-titlebar"',
      'data-manager-titlebar',
      'class="manager-titlebar-badge"',
      'data-manager-titlebar-premium',
      '{#if premiumInstalled}',
      "text('FABRICATE.Admin.Manager.Titlebar.Premium', 'PREMIUM')",
      'data-manager-titlebar-status',
      '{titlebarStatusLabel()}',
    ]) {
      assert.ok(rootSource.includes(snippet), `root titlebar should include ${snippet}`);
    }
    // The layer-group icon and "Crafting Systems" product label are gone (issue 643):
    // the Foundry window's own title bar already names the app, so a second copy inside
    // the window was duplicated chrome.
    assert.equal(
      rootSource.includes('manager-titlebar-icon'),
      false,
      'the duplicated titlebar app icon should be removed'
    );
    assert.equal(
      rootSource.includes('manager-titlebar-product'),
      false,
      'the duplicated "Crafting Systems" titlebar label should be removed'
    );
    // Issue 1185: the Downtime route briefly led the page header with a 42px glyph tile from
    // the prototype. No other Manager route has one, so it is gone — and with it the third
    // header child that broke `justify-content: space-between`.
    assert.equal(
      rootSource.includes('manager-route-icon'),
      false,
      'no route may lead the page header with an identity tile of its own'
    );
    assert.equal(
      rootSource.includes('data-manager-route-icon'),
      false,
      'and its marker attribute goes with it'
    );
    // Issue 1185: the system name badge is gone in BOTH states, not merely hidden behind a
    // flag. Its marker attribute and its lang key go with it.
    assert.equal(
      rootSource.includes('data-manager-titlebar-system'),
      false,
      'the redundant crafting-system titlebar badge should be removed'
    );
    assert.equal(
      rootSource.includes('Titlebar.SystemBadge'),
      false,
      'and its accessible-name key with it'
    );
    assert.equal(
      lang.FABRICATE.Admin.Manager.Titlebar.SystemBadge,
      undefined,
      'the orphaned SystemBadge string should be deleted from lang/en.json, not left behind'
    );
    assert.equal(
      /mythwright/i.test(rootSource),
      false,
      '"Mythwright" is a prototype theme name and must never be hard-coded into the chrome'
    );
    // The premium badge is driven by the REGISTRY, not by Core's Downtime route: a companion
    // that ships some future surface is still installed and still lights the strip.
    assert.ok(
      rootSource.includes('const premiumInstalled = $derived(registeredSurfaceIds.length > 0)'),
      'the titlebar premium signal should read the whole registered surface set'
    );
    assert.ok(
      rootSource.includes('managerExtensions.subscribeSurfaceIds('),
      'and should stay live through the registry surface-set subscription'
    );
    assert.equal(
      /premiumInstalled[^\n]*downtime/i.test(rootSource),
      false,
      'the premium signal must not be keyed on the Core downtime surface id'
    );
    assert.equal(
      lang.FABRICATE.Admin.Manager.Titlebar.Premium,
      'PREMIUM',
      'lang should expose the titlebar premium mark'
    );
    assert.equal(
      lang.FABRICATE.Admin.Manager.Titlebar.PremiumStatus,
      'Fabricate Premium is installed and connected',
      'and the accessible name and tooltip that explain it'
    );
    // The status line reports the SYSTEM's resolution mode, and counts outcome tiers
    // only where tiers exist to count (routedByCheck).
    assert.ok(
      rootSource.includes(
        "selectedSystem?.resolutionMode === 'routedByCheck'\n      ? routedOutcomeTierCount(selectedSystem?.craftingCheck?.routed)"
      ),
      'the titlebar outcome-tier count should only be resolved for a routed-by-check system'
    );
    assert.ok(
      lang.FABRICATE.Admin.Manager.Titlebar.OutcomeTiers === 'outcome tiers',
      'lang should expose the pluralized outcome-tier label the titlebar formats'
    );
  });

  it('renders the rail section label and bare mono count numerals without elevating the dead Graph row', () => {
    assert.ok(
      rootSource.includes('class="manager-rail-title"'),
      'the rail should carry an uppercase section label'
    );
    assert.ok(
      rootSource.includes('data-manager-rail-section'),
      'the rail section label should be addressable'
    );
    assert.ok(
      lang.FABRICATE.Admin.Manager.Nav.SectionLabel === 'GM management',
      'the rail section label should be localized'
    );
    // A rail count is a BARE NUMERAL, not a badge (issue 643). Borrowing `.manager-chip`
    // meant every nav row wore a bordered, 24px-tall, button-shaped pill that the CSS then
    // spent five declarations undoing; `.manager-nav-count` owns its own rule instead.
    assert.ok(
      rootSource.includes('<span class="manager-nav-count">{selectedCounts.components}</span>'),
      'a rail count should render as a bare numeral, not a chip'
    );
    assert.equal(
      rootSource.includes('manager-nav-count manager-chip'),
      false,
      'no rail count should borrow the content chip'
    );
    assert.ok(
      rootSource.includes(
        "<span class=\"manager-nav-count\">{text('FABRICATE.Admin.Manager.Soon', 'Soon')}</span>"
      ),
      'the disabled Graph placeholder should keep its plain Soon span, not gain a chip'
    );
  });

  it('renders the manager shell with Systems and Recipes browser structures', () => {
    for (const snippet of [
      'class="fabricate-manager"',
      'data-manager-view={currentView}',
      'class="manager-header"',
      'class="manager-breadcrumbs"',
      "class={`manager-body ${railCollapsedDisplay ? 'is-rail-collapsed' : ''}`}",
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
      'manager-environment-edit-main',
    ]) {
      assert.ok(rootSource.includes(snippet), `root should include ${snippet}`);
    }
    // `class="manager-empty"` is NOT in this list any more (issue 785): the manager's
    // no-state panel is the shared `EmptyState` component, so the root imports and renders
    // it rather than hand-rolling the dashed-panel markup.
    for (const snippet of [
      'class="manager-main"',
      'class="manager-toolbar"',
      'class="manager-filter"',
      "import EmptyState from './EmptyState.svelte'",
      '<EmptyState',
    ]) {
      assert.ok(managerSource.includes(snippet), `manager source should include ${snippet}`);
    }
    // `class={componentTableClass}` is GONE (issue 676): the rebuilt browser is a LIST
    // of rows, not a `role="table"` grid, so the table scaffolding and the class that
    // toggled its column template are dropped rather than left orphaned on a non-table
    // structure. `.manager-component-drop-zone` still lives here; the row's own classes
    // moved into the extracted ComponentRow and are pinned there — both are probed by
    // managerLayoutGuards and the smoke harness.
    for (const snippet of ['class="manager-component-drop-zone"', 'ComponentRow']) {
      assert.ok(
        componentsBrowserSource.includes(snippet),
        `ComponentsBrowserView should include ${snippet}`
      );
    }
    for (const snippet of ['manager-component-row', 'class="manager-component-identity"']) {
      assert.ok(componentRowSource.includes(snippet), `ComponentRow should include ${snippet}`);
    }
    // The dropped table scaffolding must not creep back in either file.
    for (const snippet of ['role="table"', 'role="row"', 'role="columnheader"', 'role="cell"']) {
      assert.ok(
        !componentsBrowserSource.includes(snippet) && !componentRowSource.includes(snippet),
        `the component browser must not reintroduce ${snippet}`
      );
    }
    for (const snippet of [
      'manager-system-edit-form',
      'data-edit-control="advanced-options"',
      'manager-feature-tile',
    ]) {
      assert.ok(systemEditSource.includes(snippet), `SystemEditView should include ${snippet}`);
    }
    // The modifier editor is formula-only: one labelled expression field, with no provider
    // chip, provider-label helper, or macro UUID field. Since issue 1117 that field is
    // `RollDataExpressionInput` — the control the retired Checks-tab editor used, adopted
    // here because this is now the ONE surface that authors an expression — so the binding
    // pinned is its `onChange`, not a raw `event.currentTarget.value` read.
    assert.ok(
      !systemEditSource.includes('ProviderExpressionInput'),
      'modifier editor should not import the deleted provider/expression component'
    );
    assert.ok(
      !systemEditSource.includes('characterModifierProviderLabel'),
      'modifier editor should not render a provider label'
    );
    assert.ok(
      !systemEditSource.includes('manager-character-modifier-provider'),
      'modifier summary should not render a provider chip'
    );
    assert.ok(
      /onUpdateModifier\(entry\.id, \{ expression \}\)/.test(systemEditSource),
      'modifier editor should bind the expression field through RollDataExpressionInput'
    );
    assert.ok(
      systemEditSource.includes('FABRICATE.Admin.Manager.Modifiers.Expression'),
      'modifier editor should keep the localized Expression label'
    );
    // --- World > Currency (issue 1278) --------------------------------------------------
    // The ladder, spend strategy, provider and macro set are WORLD scope: a world runs one
    // ruleset, so there is one way actors store coins and two crafting systems cannot
    // meaningfully disagree about it. The whole editor therefore reads WorldCurrencyTab. What
    // survives on System Settings is the participation toggle alone, asserted at the end.
    for (const snippet of [
      'data-world-currency-units',
      'manager-currency-unit-card',
      'handleAddCurrencyUnit',
      'onSeedCurrencyPresets',
      'manager-currency-subunit-builder',
      // The unit card's collapsed summary row reuses the character-modifier summary class; it
      // moved with the card rather than staying behind on System Settings.
      'manager-character-modifier-summary',
      'manager-availability-pill is-currency',
      'manager-availability-pill-amount',
    ]) {
      assert.ok(
        worldCurrencySource.includes(snippet),
        `WorldCurrencyTab should include ${snippet}`
      );
    }
    // Asserted as patterns rather than snippets in the list above: Prettier (issue 923) prints
    // both calls one argument per line.
    assert.ok(
      /onUpdateCurrencySubUnit\(\s*unit\.id,\s*contained\.unitId,\s*event\.currentTarget\.value\s*\)/.test(
        worldCurrencySource
      ),
      'WorldCurrencyTab should bind the sub-unit amount input to onUpdateCurrencySubUnit'
    );
    assert.ok(
      /onDeleteCurrencySubUnit\(\s*unit\.id,\s*contained\.unitId\s*\)/.test(worldCurrencySource),
      'WorldCurrencyTab should wire the sub-unit delete action'
    );
    assert.ok(
      rootSource.includes('currencyUnits={selectedCurrencyUnits}'),
      'root should pass the world currency units to WorldCurrencyTab'
    );
    // Shorthand for `onAddCurrencySubUnit={onAddCurrencySubUnit}` — prettier-plugin-svelte
    // rewrites the long form to it (issue 923). Anchored on the leading whitespace that starts
    // an attribute, so the needle cannot also be satisfied by the tail of a longer identifier
    // such as `{noOnAddCurrencySubUnit}`.
    assert.ok(
      rootSource.includes(' {onAddCurrencySubUnit}'),
      'root should pass currency sub-unit actions to WorldCurrencyTab'
    );
    assert.ok(
      rootSource.includes('{currencySpendStrategy}'),
      'root should thread the spend strategy to WorldCurrencyTab'
    );
    // Three peer top-level spend strategies (actorProperty / actorInventory / macro). The strategy
    // select renders all three options and the editor branches on each strategy.
    assert.ok(
      worldCurrencySource.includes("currencySpendStrategy === 'actorInventory'"),
      'currency editor should branch on the actorInventory spend strategy'
    );
    for (const value of ['actorProperty', 'actorInventory', 'macro']) {
      assert.ok(
        worldCurrencySource.includes(`value: '${value}'`),
        `currency editor should offer the ${value} spend strategy option`
      );
    }
    // Currency spend-strategy / provider / macro controls.
    for (const snippet of [
      'data-world-currency-strategy-select',
      'onSetCurrencySpendStrategy(event.currentTarget.value)',
      // The single shared strategy hint reflects the selected strategy.
      'data-world-currency-strategy-hint',
      'currencySpendStrategyHint()',
      'data-world-currency-provider-select',
      'onSetCurrencyProvider(event.currentTarget.value)',
      'data-world-currency-no-provider',
      'data-world-currency-macros',
      'data-world-currency-macro-dropzone',
      'manager-component-source-drop-zone',
      'use:dragDrop',
      'resolveDropData',
      "type !== 'Macro'",
      'onClearCurrencyMacro(field.key)',
      // Each empty macro drop zone exposes a field-specific accessible name so the three zones are
      // distinguishable to assistive tech (the linked-state group already has a field-specific label).
      'aria-label={currencyMacroDropZoneLabel(field)}',
    ]) {
      assert.ok(
        worldCurrencySource.includes(snippet),
        `WorldCurrencyTab should include ${snippet}`
      );
    }
    // The nested inventory-mode select is gone — macro is now a peer top-level strategy.
    assert.ok(
      !worldCurrencySource.includes('data-world-currency-inventory-mode-select'),
      'currency editor should not render the removed nested inventory-mode select'
    );
    assert.ok(
      !worldCurrencySource.includes('inventoryMode'),
      'currency editor should not reference the removed inventoryMode model'
    );
    // The macro branch renders only under the peer macro strategy.
    assert.ok(
      worldCurrencySource.includes("currencySpendStrategy === 'macro'"),
      'currency editor should branch on the macro spend strategy'
    );
    // A world with no registered provider can still select actorInventory but is steered to the
    // macro strategy via a no-provider callout, and its units are never wiped.
    assert.ok(
      worldCurrencySource.includes(
        'const currencyHasProviders = $derived(currencyProviderOptions.length > 0)'
      ),
      'currency editor should derive whether the world has any providers'
    );
    // The three macro drop zones (canAfford / increment / decrement) lay out side-by-side in a
    // single responsive row via a namespaced container class.
    assert.ok(
      worldCurrencySource.includes('manager-currency-macro-zones manager-currency-macro-row'),
      'macro drop zones should be wrapped in the single-row container'
    );
    // Sub-units only drive the engine in actorProperty mode, so the whole sub-unit section (heading,
    // add control, chips, no-eligible callout) is gated behind a derived macro-mode flag — it must
    // not render in provider (read-only) or macro modes.
    assert.ok(
      worldCurrencySource.includes('const currencyMacroMode = $derived('),
      'currency editor should derive a macro-mode flag'
    );
    assert.ok(
      worldCurrencySource.includes('{#if currencyMacroMode}'),
      'currency editor should gate the per-unit editor body on the macro-mode flag'
    );
    // The sub-unit section markup (heading, add-sub-unit control, chips) lives only inside the
    // non-macro branch, after the `{#if currencyMacroMode}` gate.
    assert.ok(
      worldCurrencySource.indexOf('{#if currencyMacroMode}') <
        worldCurrencySource.indexOf('manager-currency-subunit-section'),
      'sub-unit section should render only in the non-macro (actorProperty) branch'
    );
    // Macro mode shows a conversion hint instead of any sub-unit controls.
    assert.ok(
      worldCurrencySource.includes('FABRICATE.Admin.Manager.CurrencyUnits.MacroConversionHint'),
      'macro mode should include the macro-conversion hint'
    );
    // The actorInventory strategy (with a provider) makes the units provider-owned and read-only:
    // the Add/Seed header actions and the editable unit controls are gated behind a non-read-only
    // condition, and a dedicated read-only branch with a provider-managed callout renders instead.
    assert.ok(
      worldCurrencySource.includes(
        'const currencyUnitsReadOnly = $derived(currencyShowProviderBranch)'
      ),
      'currency editor should derive a read-only flag for the active provider inventory branch'
    );
    assert.ok(
      worldCurrencySource.includes('{#if !currencyUnitsReadOnly}'),
      'currency editor should gate the Add/Seed header actions behind the non-provider (editable) condition'
    );
    assert.ok(
      worldCurrencySource.includes('{#if currencyUnitsReadOnly}'),
      'currency editor should render a dedicated read-only branch in provider mode'
    );
    for (const snippet of [
      'data-world-currency-provider-managed',
      'manager-currency-provider-managed-callout',
      'currencyProviderManagedHint()',
      'manager-currency-provider-managed-summary',
      'manager-currency-readonly-fields',
      'data-world-currency-readonly-label',
      'data-world-currency-abbreviation',
      'data-world-currency-denomination',
      'FABRICATE.Admin.Manager.CurrencyUnits.ProviderManagedTitle',
    ]) {
      assert.ok(
        worldCurrencySource.includes(snippet),
        `WorldCurrencyTab should include read-only ${snippet}`
      );
    }
    // Provider read-only units present label/abbreviation/denomination as static field/value pairs;
    // they must NOT render sub-unit chips. The only `data-world-currency-subunit` occurrence lives
    // in the editable (actorProperty) branch, after the provider-managed read-only branch.
    assert.ok(
      worldCurrencySource.indexOf('data-world-currency-provider-managed') <
        worldCurrencySource.indexOf('data-world-currency-subunit'),
      'provider-managed read-only branch should render before the editable sub-unit chips'
    );
    assert.equal(
      worldCurrencySource.split('data-world-currency-subunit=').length - 1,
      1,
      'sub-unit chips should appear only once (in the editable actorProperty branch)'
    );
    // The read-only branch precedes the editable branch, so the editable controls (editable amount
    // input, remove cross) live only after the provider-managed branch.
    assert.ok(
      worldCurrencySource.indexOf('data-world-currency-provider-managed') <
        worldCurrencySource.indexOf('class="manager-availability-pill-amount"'),
      'provider-managed read-only branch should render before the editable unit list'
    );
    for (const prop of [
      '{currencyProviderId}',
      '{currencyMacros}',
      '{currencyProviderOptions}',
      // Shorthand, like the three above: prettier-plugin-svelte rewrites `attr={attr}` to
      // Svelte's `{attr}` form (issue 923). The two are the same binding.
      '{onSetCurrencySpendStrategy}',
      '{onSetCurrencyProvider}',
      '{onSetCurrencyMacro}',
      '{onClearCurrencyMacro}',
    ]) {
      assert.ok(rootSource.includes(prop), `root should thread ${prop} to WorldCurrencyTab`);
    }
    // The removed nested inventory-mode setter must no longer be threaded.
    assert.ok(
      !rootSource.includes('onSetCurrencyInventoryMode'),
      'root should not thread the removed inventory-mode setter'
    );
    assert.ok(
      rootSource.includes('getCurrencyProvidersForFoundrySystem'),
      'root should derive provider options from the currency provider registry'
    );
    // --- What survives on System Settings ------------------------------------------------
    // The participation toggle and nothing else. It reads `requirements.currency.enabled` and
    // calls `onToggleCurrency`, and renders always so the Optional features section is never
    // empty.
    for (const snippet of [
      'const currencyEnabled = $derived(selectedSystem?.requirements?.currency?.enabled === true)',
      'data-system-currency-toggle',
      'onToggleCurrency',
      'FABRICATE.Admin.Manager.Feature.Currency',
      'FABRICATE.Admin.Manager.SystemEdit.FeatureHint.Currency',
    ]) {
      assert.ok(systemEditSource.includes(snippet), `SystemEditView should include ${snippet}`);
    }
    assert.ok(
      systemEditSource.includes('data-feature-key="currency"'),
      'currency toggle tile should always render in the Optional features section'
    );
    // The editor itself is GONE from the crafting system page (issue 1278). These are markers of
    // the card that was deleted; any of them reappearing means the per-system currency surface
    // has crept back and the two scopes can disagree again.
    for (const removed of [
      'manager-currency-unit-card',
      'data-system-currency-units',
      'data-system-currency-strategy-select',
      'data-system-currency-macros',
      'currencyProviderOptions',
      'onSetCurrencySpendStrategy',
      'onAddCurrencyUnit',
    ]) {
      assert.equal(
        systemEditSource.includes(removed),
        false,
        `SystemEditView should no longer carry the relocated currency control ${removed}`
      );
    }
    assert.ok(
      rootSource.includes("store.toggleRequirement?.('currency', next)"),
      'root should thread onToggleCurrency to store.toggleRequirement'
    );
    assert.ok(
      rootSource.includes("store.toggleRequirement?.('time', next)"),
      'root should thread onToggleTime to store.toggleRequirement (issue 714)'
    );
    for (const snippet of [
      'class="manager-systems-table"',
      'manager-system-row',
      'manager-system-identity',
      // Same-named systems are disambiguated in the rail via the shared helper (issue 346).
      "import { buildSystemLabelMap, systemDisplayLabel } from '../../util/systemDisambiguation.js'",
      'buildSystemLabelMap(systems)',
      'systemDisplayLabel(system, systemLabels)',
    ]) {
      assert.ok(
        systemsBrowserSource.includes(snippet),
        `SystemsBrowserView should include ${snippet}`
      );
    }
    for (const snippet of [
      'class="manager-recipes-table"',
      'manager-recipe-row',
      'class="manager-recipe-identity"',
      'manager-recipe-status',
      // The row's restored Edit pencil and the column header above the list (issue 643).
      'data-recipe-edit={recipe.id}',
      'class="manager-recipe-table-head"',
      'FABRICATE.Admin.Manager.Recipe.Column.Recipe',
      // The lifted browser view-state seam.
      'browserState = $bindable(null)',
      'createRecipeBrowserState',
    ]) {
      assert.ok(
        recipesBrowserSource.includes(snippet),
        `RecipesBrowserView should include ${snippet}`
      );
    }
    // The row Edit pencil reuses the Books & Scrolls icon-button + pen idiom, and the
    // filter/sort/paging state is lifted (no local $state for those controls remains).
    assert.ok(
      recipesBrowserSource.includes('class="manager-icon-button manager-recipe-edit"'),
      'the row Edit affordance should be a manager-icon-button, matching Books & Scrolls'
    );
    assert.equal(
      /let\s+statusFilter\s*=\s*\$state/.test(recipesBrowserSource),
      false,
      'the browser view-state must be lifted, not held as local component $state'
    );
    // The row DELEGATES its authoring-state pills to the shared activation predicate
    // (issue 1010), which the bulk panel's pre-flight count and the attention sort read
    // too — so the pilled rows and the counted rows are one set by construction.
    //
    // Delegation is all this assertion may claim, because it is all the component's text
    // contains. The predicate is owned by `tests/util/recipe-browser-model.test.js`, and
    // the RENDERED pills by the `authoring-state pills` cases in
    // `tests/components/recipes-browser-view-mounted.test.js`. Two earlier attempts to
    // pin the state here instead both failed the same way: `recipe.incomplete` ended up
    // satisfied only by a dead `data-recipe-incomplete` attribute nothing read, and
    // `recipe.enableBlocked` only by the prose above `STATUS_LABELS` — the field is read
    // inside `recipeBrowserModel.js` and never appears in this markup at all. A source
    // scan cannot see rendered state that no rendered text names.
    assert.ok(
      /return deriveRecipeStatuses\(recipe\)/.test(recipesBrowserSource),
      'RecipesBrowserView should derive its authoring-state pills through the shared predicate'
    );
    assert.equal(
      recipesBrowserSource.includes('recipe.incomplete'),
      false,
      'and must not reintroduce the narrower incomplete predicate the pills were moved off'
    );
    assert.ok(
      recipesBrowserSource.includes('FABRICATE.Admin.Manager.Recipe.Incomplete'),
      'RecipesBrowserView should use the localized Incomplete label'
    );
    // The four row states are one component (StatusPill) rather than four ad-hoc
    // chips. The tones stay distinguishable: warning = blocked but already enabled,
    // danger = blocked AND off, i.e. enabling would be REFUSED (issue 643, repointed
    // onto the shared activation predicate by issue 1010).
    assert.ok(
      recipesBrowserSource.includes("import StatusPill from '../../components/StatusPill.svelte'"),
      'the row should render its states through the shared StatusPill'
    );
    assert.ok(
      /incomplete:\s*\['FABRICATE\.Admin\.Manager\.Recipe\.Incomplete'/.test(recipesBrowserSource),
      'the Incomplete state should carry its localized label'
    );
    assert.ok(
      recipesBrowserSource.includes('FABRICATE.Admin.Manager.Recipe.CantEnable'),
      "an incomplete + disabled recipe should say enabling is refused, not merely 'incomplete'"
    );
    // A card row has no columns: the list is a real <ul role="list"> of <li> cards.
    assert.ok(
      recipesBrowserSource.includes('<ul class="manager-recipe-group-list" role="list"'),
      'recipe rows should be a list, not a role="table"'
    );
    assert.equal(
      recipesBrowserSource.includes('role="table"'),
      false,
      'the card row must not retain the table role'
    );
  });

  it('keeps presentational Svelte free of direct Foundry globals', () => {
    assert.ok(
      !/\b(?:game|ui|Hooks|CONFIG)\b/.test(rootSource),
      'root should not directly reference Foundry globals'
    );
  });

  it('uses localized manager copy keys', () => {
    assert.ok(
      rootSource.includes('FABRICATE.Admin.Manager.Title'),
      'root should use manager localization keys'
    );
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
    assert.equal(lang.FABRICATE.Admin.Manager.CurrencyUnits.Title, 'Currency units');
    assert.equal(lang.FABRICATE.Admin.Manager.CurrencyUnits.Add, 'Add currency unit');
    assert.equal(lang.FABRICATE.Admin.Manager.CurrencyUnits.AddSubUnit, 'Add sub-unit');
    for (const key of [
      'SpendStrategy',
      'SpendStrategyHint',
      'SpendStrategyActorProperty',
      'SpendStrategyActorPropertyHint',
      'SpendStrategyActorInventory',
      'SpendStrategyActorInventoryHint',
      'SpendStrategyMacro',
      'SpendStrategyMacroHint',
      'Provider',
      'ProviderHint',
      'NoProviders',
      'MacroCanAfford',
      'MacroCanAffordHint',
      'MacroIncrement',
      'MacroIncrementHint',
      'MacroDecrement',
      'MacroDecrementHint',
      'MacroDropHint',
      'MacroDropZoneLabel',
      'MacroReplaceHint',
      'MacroUnlink',
      'MacroMissing',
      'MacroConversionHint',
      'ProviderManagedTitle',
      'ProviderManagedHint',
    ]) {
      assert.ok(
        lang.FABRICATE.Admin.Manager.CurrencyUnits[key],
        `CurrencyUnits.${key} should be defined`
      );
    }
    // The removed nested inventory-mode localization keys must be gone.
    for (const key of [
      'InventoryMode',
      'InventoryModeHint',
      'InventoryModeProvider',
      'InventoryModeMacro',
    ]) {
      assert.equal(
        lang.FABRICATE.Admin.Manager.CurrencyUnits[key],
        undefined,
        `CurrencyUnits.${key} should be removed`
      );
    }
    assert.equal(lang.FABRICATE.Admin.Manager.Recipe.Title, 'Recipes');
    assert.equal(lang.FABRICATE.Admin.Manager.Recipe.Requirements, 'Requirements');
    assert.equal(lang.FABRICATE.Admin.Manager.Recipe.EnableNamed, 'Enable {name}');
    assert.equal(lang.FABRICATE.Admin.Manager.Recipe.DisableNamed, 'Disable {name}');
    assert.equal(lang.FABRICATE.Admin.Manager.Component.Title, 'Components');
    assert.equal(
      lang.FABRICATE.Admin.Manager.Component.DropZoneTitle,
      'Drop items to add components'
    );
    assert.equal(lang.FABRICATE.Admin.Manager.Component.Origin, 'Origin');
    assert.equal(lang.FABRICATE.Admin.Manager.Component.SourceOriginCompendium, 'Compendium');
    assert.equal(lang.FABRICATE.Admin.Manager.TagsCategories.Title, 'Tags & Categories');
    assert.equal(lang.FABRICATE.Admin.Manager.TagsCategories.Library, 'Tags & Categories');
    assert.equal(
      lang.FABRICATE.Admin.Manager.TagsCategories.GeneralReservedFeedback,
      'General is already available as the base category.'
    );
    assert.equal(lang.FABRICATE.Admin.Manager.Essence.Title, 'Essences');
    // `Essence.Library` / `Essence.LibraryHint` / `Essence.Kicker` are RETIRED with the
    // duplicate page header the browser used to render above the shell's own (issue 1036).
    // The route title is `Essence.Title`, which the shell owns and which is asserted above.
    assert.equal(lang.FABRICATE.Admin.Manager.Essence.EditTitle, 'Edit essence');
    assert.equal(lang.FABRICATE.Admin.Manager.Essence.EditBreadcrumb, 'Edit essence');
    assert.equal(lang.FABRICATE.Admin.Manager.Essence.CreateBreadcrumb, 'Create essence');
    assert.equal(lang.FABRICATE.Admin.Manager.Essence.SourceLinkedFilter, 'Linked');
    assert.equal(lang.FABRICATE.Admin.Manager.Essence.SourceNoneShort, 'None');
    assert.equal(
      lang.FABRICATE.Admin.Manager.Environment.GatheringTabs.EncountersTitle,
      'Gathering events'
    );
    assert.equal(
      lang.FABRICATE.Admin.Manager.Environment.GatheringTabs.EncountersHint,
      'Browse reusable events before attaching them to environments.'
    );
    assert.equal(rootSource.includes('EncountersPlaceholderTitle'), false);
    assert.equal(rootSource.includes('EncountersPlaceholderHint'), false);
  });

  it('keeps changed manager and environment static localization fallbacks aligned with en.json', () => {
    const environmentComponentDir = resolve(repoRoot, 'src/ui/svelte/apps/manager/environment');
    const contractFiles = [
      rootPath,
      environmentEditPath,
      environmentsBrowserPath,
      knowledgePath,
      armedDangerButtonPath,
      ...readdirSync(environmentComponentDir)
        .filter((name) => name.endsWith('.svelte'))
        .map((name) => resolve(environmentComponentDir, name)),
      ...readdirSync(knowledgeComponentDir)
        .filter((name) => name.endsWith('.svelte'))
        .map((name) => resolve(knowledgeComponentDir, name)),
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
          failures.push(
            `${sourceName(filePath)}: ${key} fallback "${fallback}" does not match en.json "${value}"`
          );
        }
      }
    }

    assert.deepEqual(failures, []);
  });

  it('routes system Edit to the in-place v2 edit view and existing store callbacks', () => {
    assert.ok(
      !rootSource.includes('openLegacySystemSettings'),
      'root should not keep dead legacy edit routing'
    );
    assert.ok(
      !rootSource.includes('Edit details'),
      'root should not show the former dead edit details label'
    );
    assert.ok(
      !rootSource.includes('services?.onEditSystem'),
      'root should not launch the current admin for system row Edit'
    );
    assert.ok(
      managerSource.includes('FABRICATE.Admin.Manager.EditSystem'),
      'manager should expose a localized system edit action'
    );
    assert.ok(
      rootSource.includes("activeView = 'system-edit'"),
      'system row Edit should transition to the local edit route'
    );
    assert.ok(
      managerSource.includes('store.saveSystemDetails?.('),
      'system edit should save details through the admin store'
    );
    assert.ok(
      managerSource.includes('onSetResolutionMode(nextMode)') ||
        managerSource.includes('store.setResolutionMode?.(nextMode)'),
      'system edit should delegate resolution changes to the admin store'
    );
    assert.ok(
      rootSource.includes('store.setResolutionMode?.'),
      'root should pass the resolution-mode callback through to the system-edit view'
    );
    // Scope the resolution/salvage persistence-value assertions to the resolution
    // mode options module: the alchemy check-mode selector at the top of the Checks
    // tab's Crafting sub-tab legitimately carries a `value: 'tiered'` check-mode
    // option that is unrelated to the retired legacy resolution/salvage `tiered` mode.
    assert.ok(
      resolutionModeOptionsSource.includes("value: 'routed'"),
      'salvage resolution should offer the canonical routed persistence value'
    );
    assert.ok(
      !resolutionModeOptionsSource.includes("value: 'mapped'"),
      'resolution options should not offer the legacy mapped persistence value'
    );
    assert.ok(
      !resolutionModeOptionsSource.includes("value: 'tiered'"),
      'resolution options should not offer the legacy tiered persistence value'
    );
    assert.ok(
      !rootSource.includes('store.toggleAdvancedOptions?.'),
      'root should not retain the removed advanced visibility toggle wiring'
    );
    assert.ok(
      rootSource.includes('store.toggleFeature?.'),
      'root should delegate feature toggles to the admin store'
    );
    assert.ok(
      !managerSource.includes("storeKey: 'complexRecipes'"),
      'system edit should not reintroduce the legacy complex recipes toggle'
    );
    assert.ok(
      !managerSource.includes("storeKey: 'craftingChecks'"),
      'system edit should not reintroduce the legacy crafting checks toggle'
    );
    assert.ok(
      !managerSource.includes("storeKey: 'outcomeRouting'"),
      'system edit should not reintroduce the legacy outcome routing toggle'
    );
    assert.ok(
      !appSource.includes('onEditSystem'),
      'v2 wrapper should not provide a row edit service for this action'
    );
    assert.ok(
      !appSource.includes('openCurrentAdmin'),
      'v2 wrapper should not retain a legacy admin fallback service'
    );
    assert.ok(
      !appSource.includes('LAST_MANAGED_CRAFTING_SYSTEM'),
      'v2 row edit should not seed and launch the current admin'
    );
  });

  it('renames the recipe resolution-mode legend and offers a salvage resolution-mode card', () => {
    // The recipe card legend is renamed; its consumer is now the Crafting Settings
    // page (issue 511 moved the resolution cards off System Overview).
    assert.equal(lang.FABRICATE.Admin.SystemSettings.ResolutionMode, 'Recipe resolution mode');
    assert.ok(
      craftingSettingsSource.includes('legendFallback="Recipe resolution mode"'),
      'crafting settings inline fallback should match the renamed value'
    );

    // Salvage card source hooks: fieldset + option attribute names and the radio group name.
    assert.ok(
      craftingSettingsSource.includes('data-crafting-salvage-resolution-mode'),
      'crafting settings should declare the salvage fieldset hook'
    );
    assert.ok(
      craftingSettingsSource.includes('data-crafting-salvage-resolution-mode-option'),
      'crafting settings should declare the salvage option hook'
    );
    assert.ok(
      craftingSettingsSource.includes('manager-crafting-salvage-resolution-mode'),
      'crafting settings should use the dedicated salvage radio group name'
    );

    // New salvage i18n keys are present and non-empty.
    for (const key of [
      'SalvageResolutionMode',
      'SalvageResolutionModeHint',
      'SalvageResolutionSimple',
      'SalvageResolutionSimpleDesc',
      'SalvageResolutionProgressive',
      'SalvageResolutionProgressiveDesc',
      'SalvageResolutionRouted',
      'SalvageResolutionRoutedDesc',
      'ResolutionComingSoon',
    ]) {
      const value = lang.FABRICATE.Admin.SystemSettings[key];
      assert.equal(typeof value, 'string', `SystemSettings.${key} should be a string`);
      assert.ok(value.length > 0, `SystemSettings.${key} should be non-empty`);
    }

    // Salvage option-set guard: the salvage options offer simple (default) +
    // progressive + routed, but never alchemy (no ingredient-set routing).
    const salvageOptionsMatch = resolutionModeOptionsSource.match(
      /salvageResolutionModeOptions\s*=\s*\[([\s\S]*?)\];/
    );
    assert.ok(
      salvageOptionsMatch,
      'the shared module should define a salvageResolutionModeOptions array'
    );
    const salvageOptionsBlock = salvageOptionsMatch[1];
    assert.ok(salvageOptionsBlock.includes("value: 'simple'"), 'salvage should offer simple');
    assert.ok(
      salvageOptionsBlock.includes("value: 'progressive'"),
      'salvage should offer progressive'
    );
    assert.ok(salvageOptionsBlock.includes("value: 'routed'"), 'salvage should offer routed');
    assert.ok(
      !salvageOptionsBlock.includes("value: 'alchemy'"),
      'salvage should NOT offer alchemy'
    );

    // Persistence wiring threaded from the root through the crafting settings view to the store.
    assert.ok(
      craftingSettingsSource.includes('onSetSalvageResolutionMode'),
      'crafting settings should accept the salvage persistence prop'
    );
    assert.ok(
      rootSource.includes('store.setSalvageResolutionMode?.'),
      'root should pass the salvage callback through to the crafting settings view'
    );
  });

  it('offers a gathering resolution-mode card with d100 selectable and progressive/routed coming soon', () => {
    const gatheringEconomySource = readFileSync(
      resolve(repoRoot, 'src/ui/svelte/apps/manager/GatheringEconomyView.svelte'),
      'utf8'
    );
    assert.ok(
      gatheringEconomySource.includes('data-gathering-resolution-mode'),
      'gathering view should declare the resolution fieldset hook'
    );
    assert.ok(
      gatheringEconomySource.includes('data-gathering-resolution-mode-option'),
      'gathering view should declare the resolution option hook'
    );
    assert.ok(
      gatheringEconomySource.includes('manager-gathering-resolution-mode'),
      'gathering view should use the dedicated resolution radio group name'
    );

    const optionsMatch = gatheringEconomySource.match(
      /gatheringResolutionModeOptions\s*=\s*\[([\s\S]*?)\];/
    );
    assert.ok(optionsMatch, 'gathering view should define a gatheringResolutionModeOptions array');
    const optionsBlock = optionsMatch[1];
    assert.ok(optionsBlock.includes("value: 'd100'"), 'gathering should offer d100');
    assert.ok(optionsBlock.includes("value: 'progressive'"), 'gathering should offer progressive');
    assert.ok(optionsBlock.includes("value: 'routed'"), 'gathering should offer routed');

    // d100 is selectable; progressive/routed are disabled coming-soon affordances.
    assert.equal(
      lang.FABRICATE.Admin.Manager.Economy.GatheringResolutionMode,
      'Gathering resolution mode'
    );
    for (const key of ['D100', 'D100Desc', 'Progressive', 'Routed']) {
      const value = lang.FABRICATE.Admin.Manager.Economy.Resolution[key];
      assert.equal(typeof value, 'string', `Economy.Resolution.${key} should be a string`);
      assert.ok(value.length > 0, `Economy.Resolution.${key} should be non-empty`);
    }
  });

  it('folds the validation overview into a full-width tabbed System Overview page (#429)', () => {
    // The standalone overview route and the legacy "Edit summary" key are gone.
    assert.equal(
      lang.FABRICATE.Admin.Manager.SystemEdit.Summary,
      undefined,
      'the legacy Summary key is removed'
    );
    assert.ok(
      !rootSource.includes('SystemEdit.Summary'),
      'no consumer references the removed Summary key'
    );

    // The System Overview page is the renamed system-edit route; the page title,
    // breadcrumb, and nav label all read "System Overview".
    assert.equal(
      lang.FABRICATE.Admin.Manager.SystemEdit.Nav,
      'System Overview',
      'the nav item is renamed System Overview'
    );
    assert.equal(lang.FABRICATE.Admin.Manager.SystemEdit.PageTitle, 'System Overview');
    assert.ok(
      rootSource.includes(
        "text('FABRICATE.Admin.Manager.SystemEdit.PageTitle', 'System Overview')"
      ),
      'the page title reads System Overview'
    );
    assert.ok(
      rootSource.includes("text('FABRICATE.Admin.Manager.SystemEdit.Nav', 'System Overview')"),
      'the renamed nav item reads System Overview'
    );

    // The standalone Overview route was folded into the system-edit page; its old
    // nav item and routed view token are gone.
    assert.ok(
      !rootSource.includes('data-nav-system-overview'),
      'the standalone Overview nav item is removed'
    );
    assert.ok(
      !rootSource.includes("activeView = 'system-overview'"),
      'no route transitions to the standalone overview view'
    );
    assert.ok(
      rootSource.includes("if (view === 'system-overview') return 'system-edit'"),
      'a stale overview token folds into the system-edit page'
    );

    // The renamed nav item uses the validation clipboard icon and carries the
    // open-issue badge that the standalone Overview item used to own.
    assert.ok(
      rootSource.includes('data-nav-system-edit'),
      'the renamed nav item exposes a stable data hook'
    );
    assert.ok(
      rootSource.includes('{#if systemOverviewCount > 0}'),
      'the renamed nav item carries the open-validation-issue badge'
    );

    // The page is a full-width tabbed shell mirroring the environment editor: the
    // shared inspector is skipped, and SystemEditView owns the tabs + workspace.
    assert.ok(
      rootSource.includes("currentView !== 'system-edit'") &&
        rootSource.includes('class="manager-inspector"'),
      'the shared inspector is skipped for the full-width system-edit page'
    );
    assert.ok(systemEditSource.includes('SystemEditorTabs'), 'SystemEditView renders the tab bar');
    assert.ok(systemEditSource.includes("activeTab === 'settings'"), 'Settings is a tab panel');
    assert.ok(systemEditSource.includes("activeTab === 'validation'"), 'Validation is a tab panel');
    assert.ok(
      systemEditSource.includes('SystemOverviewView'),
      'the Validation tab renders the overview list'
    );
    assert.ok(
      systemEditSource.includes('manager-system-workspace'),
      'the workspace mirrors the environment workspace'
    );

    // The library inspector's detail card is a 2x2 STAT grid (issue 643, brief §3.3),
    // not the generic fact-line list: it answers Ingredients / Results / Steps /
    // Crafting check. Structure and Result-groups were restatements of the row the GM
    // had just clicked, and Produces — the one thing the old inspector could not tell
    // them — is now a first-class section.
    assert.ok(
      recipeBrowserInspectorSource.includes('class="manager-recipe-stat-grid"'),
      'the library inspector renders the 2x2 stat grid'
    );
    for (const fact of ['ingredients', 'results', 'steps', 'check']) {
      assert.ok(
        recipeBrowserInspectorSource.includes(`id: '${fact}'`),
        `the stat grid answers "${fact}"`
      );
    }
    assert.ok(
      recipeBrowserInspectorSource.includes('data-recipe-produces-empty'),
      'a recipe that makes nothing on a success says so'
    );
    assert.ok(
      recipeBrowserInspectorSource.includes('buildRecipeRequirementRows') &&
        recipeBrowserInspectorSource.includes('buildRecipeProduceRows'),
      'the Requires/Produces walk lives in the pure model, not in the component'
    );

    // The inspector is ONE column on the panel background (issue 643): section labels are
    // uppercase micro-labels directly on the panel, not five nested `.manager-inspector-card`
    // boxes under `<h3>` titles, and there is no invented "Recipe details" heading.
    assert.equal(
      recipeBrowserInspectorSource.includes('manager-inspector-card'),
      false,
      'the inspector sections are micro-labels on the panel, not nested cards'
    );
    assert.equal(
      recipeBrowserInspectorSource.includes('Recipe.Details'),
      false,
      'the invented "Recipe details" heading is gone'
    );

    // `Edit recipe` is the point of the inspector: the accent-filled primary. There used to
    // be no Edit at all, and Delete sat as a peer of Duplicate.
    assert.ok(
      recipeBrowserInspectorSource.includes('data-recipe-action="edit"'),
      'the inspector exposes the primary Edit action'
    );
    assert.ok(
      recipeBrowserInspectorSource.includes('onEdit = () => {}'),
      'the inspector takes an onEdit callback'
    );
    assert.ok(
      recipeBrowserInspectorSource.includes('manager-recipe-browser-inspector-delete'),
      'Delete is a dark danger button below Edit, not a peer of Duplicate'
    );

    // The reserved alchemy-Simple failure group is SHOWN (danger-toned), not filtered out —
    // deleting it made an alchemy recipe's failure output invisible.
    assert.ok(
      recipeBrowserInspectorSource.includes(
        "data-recipe-produces={row.failure ? 'failure' : 'success'}"
      ),
      'every produced group is rendered, toned by role'
    );
  });

  it('keeps first-slice action and navigation hierarchy focused', () => {
    assert.ok(
      !rootSource.includes('function viewKicker'),
      'top-bar view kickers should not duplicate the page title'
    );
    assert.ok(
      !rootSource.includes('{viewKicker()}'),
      'top-bar header should render only the page title and subtitle'
    );
    assert.ok(
      rootSource.includes('visiblePlaceholderViews'),
      'root should derive selected-system placeholder nav from selection and feature gates'
    );
    // Issue 745: the Crafting group is unconditional (v1.3 headline); the experimental
    // toggle now only gates the unimplemented Graph placeholder.
    assert.ok(
      rootSource.includes(
        'const experimentalFeaturesEnabled = $derived($viewState.experimentalFeaturesEnabled === true)'
      ),
      'root should derive the experimental gate for the Graph placeholder'
    );
    assert.ok(
      !rootSource.includes('recipesRouteEnabled'),
      'the recipes-route experimental gate should be gone'
    );
    assert.ok(
      !rootSource.includes('!recipesAvailable'),
      'route normalization should no longer gate crafting views on the experimental toggle'
    );
    assert.ok(
      !rootSource.includes('{#if recipesRouteEnabled}'),
      'the Crafting rail group should render unconditionally'
    );
    assert.ok(
      rootSource.includes("if (view.id === 'graph') return experimentalFeaturesEnabled;"),
      'the Graph placeholder should be gated on the experimental toggle'
    );
    assert.ok(
      !rootSource.includes("{ id: 'recipes', icon: 'fas fa-scroll'"),
      'the disabled Recipes placeholder should be removed now that Crafting is always available'
    );
    assert.ok(
      /id: 'graph',\s*icon: 'fas fa-project-diagram'/.test(rootSource),
      'the Graph placeholder should remain in the planned placeholder list'
    );
    assert.ok(
      rootSource.includes('selectSystemAndShowBrowser'),
      'root should keep an explicit systems-browser route'
    );
    assert.ok(
      rootSource.includes('manager-scope-card'),
      'root should render the selected system in a rail card'
    );
    assert.ok(
      rootSource.indexOf('data-manager-rail-section') <
        rootSource.indexOf('class="manager-rail-block"'),
      'GM management should label the rail before the crafting-system scope card'
    );
    // The rail card SELECTS (issue 643): before this the rail could name the selected
    // system but offered no way at all to switch to another one.
    assert.ok(
      rootSource.includes('data-manager-scope-select'),
      'the rail card should carry a real system select'
    );
    assert.ok(
      !rootSource.includes('manager-scope-name'),
      'the static rail name span is retired, not merely hidden'
    );
    assert.ok(
      rootSource.includes('FABRICATE.Admin.Manager.AllCraftingSystems'),
      'the rail back link should be localized'
    );
    assert.ok(
      !rootSource.includes('FABRICATE.Admin.Manager.Workspace'),
      'the rail should not repeat "GM management" below its own section label'
    );
    assert.ok(
      rootSource.includes('manager-scope-return'),
      'root should expose a return-to-system-library rail action'
    );
    assert.ok(
      rootSource.includes('FABRICATE.Admin.Manager.ReturnToSystemLibrary'),
      'return-to-library action should be localized'
    );
    assert.ok(
      !rootSource.includes('SystemEdit.EditBadge'),
      'system settings nav should not render the former Edit badge'
    );
    assert.ok(
      rootSource.includes("setView('essences')"),
      'essences should be exposed as a real selected-system route'
    );
    assert.ok(
      rootSource.includes("setView('tags')"),
      'tags and categories should be exposed as a real selected-system route'
    );
    assert.ok(
      rootSource.includes("activeView = 'essence-edit'"),
      'essence edit actions should transition to the local edit route'
    );
    assert.ok(
      !rootSource.includes("{ id: 'essences'"),
      'essences should not remain a disabled placeholder route'
    );
    assert.ok(
      !rootSource.includes("{ id: 'tags'"),
      'tags should not remain a disabled placeholder route'
    );
    assert.ok(
      !rootSource.includes('clearSelectedSystem'),
      'root should not expose a selected-system clear route'
    );
    assert.ok(
      !rootSource.includes("selectSystem('', 'systems')"),
      'selected-system rail should not clear real store selection'
    );
    assert.ok(
      !rootSource.includes('manager-scope-clear'),
      'selected-system rail should not render the old x clear icon'
    );
    assert.ok(
      managerSource.includes('toggleSystemEnabled'),
      'systems browser should expose interactive row status toggles'
    );
    assert.ok(
      systemsBrowserSource.includes('manager-status-toggle'),
      'systems browser should render status as a toggle control'
    );
    assert.ok(
      recipesBrowserSource.includes('manager-status-toggle'),
      'recipes browser should render status as a toggle control'
    );
    assert.ok(
      !recipesBrowserSource.includes(
        'type="checkbox"\n                  checked={recipe.enabled !== false}'
      ),
      'recipes browser should not render recipe status as a checkbox'
    );
    assert.ok(
      !rootSource.includes("setView('systems')"),
      'systems should not be exposed as a left-rail tab'
    );
    assert.ok(
      !rootSource.includes('manager-count-cluster'),
      'system rows should not duplicate inspector counts inline'
    );
    assert.ok(
      !rootSource.includes('FABRICATE.Admin.Manager.QuickActions'),
      'inspector should not duplicate row actions'
    );
    assert.ok(
      !rootSource
        .replace(/\r\n/g, '\n')
        .includes(
          '{:else}\n        <button type="button" class="manager-button" onclick={importSystem}>\n          <i class="fas fa-file-import" aria-hidden="true"></i>\n          <span>{text(\'FABRICATE.Admin.Manager.Import\', \'Import\')}</span>\n        </button>\n        <button type="button" class="manager-button" onclick={openCurrentAdmin}>'
        ),
      'system library header should not render the legacy admin launch button'
    );
    assert.equal(
      lang.FABRICATE.Admin.Manager.SystemLibraryHint,
      'Select a row to view counts and enabled features.'
    );
    assert.equal(
      lang.FABRICATE.Admin.Manager.InspectorHint,
      'The inspector shows counts, resolution mode, and enabled features for the selected system.'
    );
    assert.ok(
      rootSource.includes('FABRICATE.Admin.Manager.EmptySetup.Title'),
      'no-systems inspector should use localized setup copy'
    );
    assert.ok(
      rootSource.includes('https://mistersilver-uk.github.io/fabricate/quickstart'),
      'no-systems inspector should link to the published quickstart'
    );
    assert.ok(
      rootSource.includes('https://mistersilver-uk.github.io/fabricate'),
      'no-systems inspector should link to the published docs'
    );
    assert.equal(lang.FABRICATE.Admin.Manager.EmptySetup.Title, 'Set up your first system');
    assert.equal(lang.FABRICATE.Admin.Manager.EmptySetup.Quickstart, 'Quickstart');
    assert.equal(lang.FABRICATE.Admin.Manager.EmptySetup.Docs, 'Docs');
    assert.ok(
      managerSource.includes('FABRICATE.Admin.Manager.Environment.EmptyTitle'),
      'empty environments browser should use Manager localized copy'
    );
    assert.ok(
      rootSource.includes('FABRICATE.Admin.Manager.Environment.EmptySetup.Title'),
      'empty environments inspector should use localized setup copy'
    );
    assert.ok(
      rootSource.includes('https://mistersilver-uk.github.io/fabricate/gathering-environments'),
      'empty environments inspector should link to published gathering docs'
    );
    assert.equal(
      lang.FABRICATE.Admin.Manager.Environment.EmptyTitle,
      'Prepare gathering building blocks first'
    );
    assert.equal(
      lang.FABRICATE.Admin.Manager.Environment.EmptyHint,
      'Define gathering tasks and events before creating environments, then attach those building blocks to each location players can gather from.'
    );
    assert.ok(
      rootSource.includes('manager-nav-submenu'),
      'gathering sections should render in the left rail submenu'
    );
    assert.ok(
      rootSource.includes('manager-nav-toggle'),
      'gathering rail should expose an expand/collapse control'
    );
    assert.ok(
      rootSource.includes("manager-nav-group ${railGroupExpanded.gathering ? 'is-expanded' : ''}"),
      'expanded gathering rail should style as one submenu group'
    );
    assert.ok(
      /const gatheringEventDefinitions = \$derived\(\s*Array\.isArray\(selectedGatheringSystemConfig\.events\)\s*\? selectedGatheringSystemConfig\.events\s*: \[\]\s*\)/.test(
        rootSource
      ),
      'root should derive reusable gathering event counts from selected gathering config'
    );
    assert.ok(
      /total:\s*environmentList\.length \+ gatheringTaskDefinitions\.length \+ gatheringEventDefinitions\.length/.test(
        rootSource
      ),
      'gathering parent count should summarize environments, tasks, and events'
    );
    // Issue 643: a rail count is a bare mono numeral, not a chip.
    assert.ok(
      rootSource.includes('<span class="manager-nav-count">{gatheringNavCounts.total}</span>'),
      'gathering parent should render a summary count numeral'
    );
    assert.ok(
      rootSource.includes('gatheringNavCounts[gatheringItem.id]'),
      'gathering submenu items should render their count chips from gathered section counts'
    );
    assert.equal(
      rootSource.includes("manager-nav-parent ${isGatheringRoute ? 'is-active' : ''}"),
      false,
      'gathering parent should not use the selected pill class'
    );
    assert.ok(
      rootSource.includes('FABRICATE.Admin.Manager.Nav.ExpandGathering'),
      'gathering rail expand label should be localized'
    );
    assert.ok(
      rootSource.includes('FABRICATE.Admin.Manager.Nav.CollapseGathering'),
      'gathering rail collapse label should be localized'
    );
    assert.equal(
      environmentsBrowserSource.includes('manager-gathering-tabs'),
      false,
      'gathering page should not render local section tabs'
    );
    assert.ok(
      rootSource.includes("let activeGatheringTab = $state('environments')"),
      'root should own gathering tab state for inspector coordination'
    );
    assert.ok(
      environmentsBrowserSource.includes("activeGatheringTab = 'environments'"),
      'gathering page should accept environments as the default active tab'
    );
    assert.ok(
      environmentsBrowserSource.includes('onSelectGatheringTab(tabId)'),
      'gathering page should report tab changes to the root'
    );
    assert.ok(
      rootSource.includes('data-gathering-inspector-placeholder'),
      'right inspector should render placeholders for non-environment gathering tabs'
    );
    assert.equal(
      rootSource.match(/FABRICATE\.Admin\.Manager\.Environment\.Actions/g)?.length ?? 0,
      1,
      'environment actions localization should remain only for the header aria label, not a redundant inspector card'
    );
    assert.ok(
      !rootSource.includes(
        "<h3 class=\"manager-card-title\">{text('FABRICATE.Admin.Manager.Environment.Actions', 'Environment actions')}</h3>"
      ),
      'selected environment inspector should not render a redundant Environment actions card'
    );
    assert.ok(
      environmentsBrowserSource.includes(
        'FABRICATE.Admin.Manager.Environment.GatheringTabs.TasksHint'
      ),
      'gathering task browser copy should be localized'
    );
    assert.ok(
      environmentsBrowserSource.includes("selectGatheringTab('tasks')"),
      'empty environments guidance should route to the Tasks tab'
    );
    assert.ok(
      environmentsBrowserSource.includes("selectGatheringTab('encounters')"),
      'empty environments guidance should route events to the Events tab'
    );
    assert.ok(
      environmentsBrowserSource.includes('manager-environment-action-grid'),
      'environment rows should keep quick action wiring'
    );
    assert.ok(
      environmentsBrowserSource.includes('onEditEnvironment(environment.id)'),
      'environment rows should wire edit quick actions'
    );
    assert.ok(
      environmentsBrowserSource.includes('onDuplicateEnvironment(environment.id)'),
      'environment rows should wire duplicate quick actions'
    );
    assert.ok(
      environmentsBrowserSource.includes('onDeleteEnvironment(environment.id)'),
      'environment rows should wire delete quick actions'
    );
    assert.equal(
      lang.FABRICATE.Admin.Manager.Environment.GatheringTabs.Label,
      'Gathering sections'
    );
    assert.equal(
      lang.FABRICATE.Admin.Manager.Environment.GatheringTabs.Environments,
      'Environments'
    );
    assert.equal(lang.FABRICATE.Admin.Manager.Environment.GatheringTabs.Tasks, 'Tasks');
    assert.equal(lang.FABRICATE.Admin.Manager.Environment.GatheringTabs.Encounters, 'Events');
    assert.equal(lang.FABRICATE.Admin.Manager.Environment.GatheringTabs.Settings, 'Settings');
    assert.equal(lang.FABRICATE.Admin.Manager.Nav.ExpandGathering, 'Expand gathering menu');
    assert.equal(lang.FABRICATE.Admin.Manager.Nav.CollapseGathering, 'Collapse gathering menu');
    assert.equal(lang.FABRICATE.Admin.Manager.Environment.GatheringTabs.OpenTasks, 'Review tasks');
    assert.equal(
      lang.FABRICATE.Admin.Manager.Environment.GatheringTabs.OpenEvents,
      'Review events'
    );
    assert.equal(
      lang.FABRICATE.Admin.Manager.Environment.GatheringTabs.TasksHint,
      'Browse gathering tasks before attaching them to environments.'
    );
    assert.equal(
      lang.FABRICATE.Admin.Manager.Environment.GatheringTabs.EncountersHint,
      'Browse reusable events before attaching them to environments.'
    );
    assert.equal(
      lang.FABRICATE.Admin.Manager.Environment.GatheringTabs.SettingsPlaceholderHint,
      'Set system-level drop resolution and event rules for gathering.'
    );
    assert.equal(
      lang.FABRICATE.Admin.Manager.Environment.Conditions.TimeOfDayTitle,
      'Times of day'
    );
    assert.equal(
      lang.FABRICATE.Admin.Manager.Environment.Conditions.WeatherTitle,
      'Weather conditions'
    );
    assert.equal(
      lang.FABRICATE.Admin.Manager.Environment.EmptySetup.Title,
      'Plan gathering content'
    );
    assert.equal(
      lang.FABRICATE.Admin.Manager.Environment.EmptySetup.StepEvents,
      'Prepare event options that can be reused across your locations.'
    );
    assert.equal(
      lang.FABRICATE.Admin.Manager.Environment.EmptySetup.GatheringDocs,
      'Gathering docs'
    );
    // The empty-recipes setup card moved into the extracted library inspector with
    // the rest of the aside (issue 643); the root still supplies the component count
    // and the Components deep-link.
    assert.ok(
      recipeBrowserInspectorSource.includes('FABRICATE.Admin.Manager.Recipe.EmptySetup.Title'),
      'empty recipes inspector should use localized setup copy'
    );
    assert.ok(
      recipeBrowserInspectorSource.includes('https://mistersilver-uk.github.io/fabricate/recipes'),
      'empty recipes inspector should link to published recipe docs'
    );
    assert.ok(
      recipeBrowserInspectorSource.includes('componentCount > 0'),
      'empty recipes inspector should branch on selected-system component count'
    );
    assert.ok(
      rootSource.includes('componentCount={selectedCounts.components}'),
      'the root should feed the inspector its component count'
    );
    assert.ok(
      rootSource.includes("onAddComponents={() => setView('components')}"),
      'empty recipes inspector should route zero-component setup to Components'
    );
    assert.equal(lang.FABRICATE.Admin.Manager.Recipe.EmptySetup.Title, 'Set up recipes');
    assert.equal(
      lang.FABRICATE.Admin.Manager.Recipe.EmptySetup.NoComponentsHint,
      'Add components before creating recipes so ingredients, tools, and results have reusable items to reference.'
    );
    assert.equal(lang.FABRICATE.Admin.Manager.Recipe.EmptySetup.AddComponents, 'Add components');
    assert.equal(lang.FABRICATE.Admin.Manager.Recipe.EmptySetup.RecipeDocs, 'Recipe docs');
    assert.ok(
      rootSource.includes('FABRICATE.Admin.Manager.Component.EmptySetup.Title'),
      'empty components inspector should use localized setup copy'
    );
    assert.ok(
      rootSource.includes(
        'https://mistersilver-uk.github.io/fabricate/crafting-systems#components'
      ),
      'empty components inspector should link to published component docs'
    );
    assert.equal(lang.FABRICATE.Admin.Manager.Component.EmptySetup.Title, 'Set up components');
    assert.equal(lang.FABRICATE.Admin.Manager.Component.EmptySetup.ComponentDocs, 'Component docs');
    assert.ok(
      rootSource.includes('FABRICATE.Admin.Manager.Essence.EmptySetup.Title'),
      'empty essences inspector should use localized setup copy'
    );
    assert.ok(
      rootSource.includes('https://mistersilver-uk.github.io/fabricate/essences'),
      'empty essences inspector should link to published essence docs'
    );
    assert.equal(lang.FABRICATE.Admin.Manager.Essence.EmptySetup.Title, 'Set up essences');
    assert.equal(lang.FABRICATE.Admin.Manager.Essence.EmptySetup.EssenceDocs, 'Essence docs');
  });

  it('keeps manager tags and categories route focused and store-wired', () => {
    assert.ok(
      rootSource.includes("import TagsCategoriesView from './TagsCategoriesView.svelte';"),
      'root should import the focused tags/categories page'
    );
    assert.ok(
      rootSource.includes('store.addCategory?.(value, icon)'),
      'category add should delegate to the admin store with its icon'
    );
    assert.ok(
      rootSource.includes('store.removeCategory?.(category)'),
      'category remove should delegate to the admin store'
    );
    // Per-category icon persistence (issue 689) is a dedicated store seam.
    assert.ok(
      rootSource.includes('store.setCategoryIcon?.(name, icon)'),
      'category icon edits should delegate to the admin store'
    );
    // The COMPONENT category vocabulary (issue 676) — the sibling of the two above,
    // and a SEPARATE store action: it must never be folded into addCategory.
    assert.ok(
      rootSource.includes('store.addComponentCategory?.(value, icon)'),
      'component category add should delegate to the admin store with its icon'
    );
    assert.ok(
      rootSource.includes('store.removeComponentCategory?.(category)'),
      'component category remove should delegate to the admin store'
    );
    assert.ok(
      rootSource.includes('store.setComponentCategoryIcon?.(name, icon)'),
      'component category icon edits should delegate to the admin store'
    );
    assert.ok(
      rootSource.includes('store.addTag?.(value)'),
      'tag add should delegate to the admin store'
    );
    assert.ok(
      rootSource.includes('store.removeTag?.(tag)'),
      'tag remove should delegate to the admin store'
    );
    // The destructive delete is now confirmed inline in the focused route (issue 689),
    // then cascades through the store's remove ops — not an external confirm seam.
    assert.ok(
      tagsCategoriesSource.includes('onRemoveCategory'),
      'focused route should own the vocabulary remove wiring'
    );
    assert.ok(
      tagsCategoriesSource.includes('GeneralReservedFeedback'),
      'focused route should keep reserved General feedback visible'
    );
    assert.ok(
      !/\b(?:game|ui|Hooks|CONFIG)\b/.test(tagsCategoriesSource),
      'tags/categories route should not directly reference Foundry globals'
    );
  });

  it('keeps manager essence browsing browser-only and source UI feature-gated', () => {
    assert.ok(
      rootSource.includes("import EssenceEditView from './EssenceEditView.svelte';"),
      'root should import the dedicated essence edit route'
    );
    assert.ok(
      rootSource.includes('showEssenceSourceUi'),
      'root should derive the effect-transfer source UI gate'
    );
    assert.ok(
      rootSource.includes("currentView === 'essence-edit'"),
      'root should route the dedicated edit view'
    );
    assert.ok(
      rootSource.includes('confirmDiscardDirtyEssenceDraft'),
      'root should protect dirty essence edit drafts when a confirm seam is available'
    );
    assert.ok(
      essenceBrowserSource.includes('onEditEssence'),
      'browser row edit should ask the root to route to edit'
    );
    assert.ok(
      essenceBrowserSource.includes('showSourceUi'),
      'browser should receive the source UI feature gate'
    );
    assert.ok(
      !essenceBrowserSource.includes('onUpdateEssence'),
      'browser should not own essence update persistence'
    );
    assert.ok(
      !essenceBrowserSource.includes('manager-essence-edit-row'),
      'browser should not render inline edit rows'
    );
    assert.ok(
      !essenceBrowserSource.includes('manager-essence-create-name'),
      'browser should not render inline create fields'
    );
    assert.ok(
      !essenceBrowserSource.includes('manager-essence-action-band'),
      'browser should not duplicate the route-header create action'
    );
    // The SOURCE COLUMN is retired with the table (issue 1036). It reported one bit — is
    // there an image — in a column of its own; the row now carries an `Effects` capability
    // pill instead, and the retained needs-attention filter is what finds a BROKEN link.
    assert.ok(
      !essenceBrowserSource.includes('manager-essence-source-cell-image'),
      'the source column and its image cell are retired with the table head'
    );
    assert.ok(
      essenceBrowserSource.includes('data-essence-source-filter'),
      'but the source-state filter is RETAINED: a broken source link is otherwise unfindable'
    );
    // Browser state is LIFTED to the root, which is criterion 12: search, filters, sort,
    // presentation and page all survive the editor round-trip.
    assert.ok(
      essenceBrowserSource.includes('browserState = $bindable(null)'),
      'the browser binds its view-state rather than owning it'
    );
    assert.ok(
      rootSource.includes('bind:browserState={essenceBrowserState}'),
      'and the root is what holds it across the round-trip'
    );
    // A card row has no columns, so the rows are a real `<ul role="list">` of `<li>` cards
    // and the `role="columnheader"` head is gone with the table it labelled. Pinned on the
    // RENDERED attribute (`role="list"`) rather than on the absence of `role="table"`,
    // which both files' own comments legitimately mention in prose.
    assert.ok(
      libraryShelfSource.includes('role="list"'),
      'the row list is a real list, not a table with no columns'
    );
    assert.ok(
      !essenceBrowserSource.includes('role="columnheader"'),
      'and it has no column headers left to label'
    );
  });

  it('uses shared manager essence picker controls on the dedicated edit route', () => {
    assert.ok(
      essenceStudioSource.includes(
        "import IconPicker from '../../../components/IconPicker.svelte';"
      ),
      'edit route should use the shared IconPicker'
    );
    assert.ok(
      essenceStudioSource.includes(
        "import EssenceSourceSelector from '../../../components/EssenceSourceSelector.svelte';"
      ),
      'edit route should use the shared source selector'
    );
    assert.ok(
      essenceEditSource.includes('showSourceUi'),
      'edit route should gate source controls by effect transfer'
    );
    assert.ok(
      essenceEditSource.includes('onDirtyChange(dirty)'),
      'edit route should expose dirty state to route-exit protection'
    );
    assert.ok(
      essenceEditSource.includes('onSave(draftId || null, updates)'),
      'edit route should delegate create and update persistence to the root/store seam'
    );
    assert.ok(
      essenceEditSource.includes('id="manager-essence-edit-form"'),
      'edit route should expose a form target for route-header save actions'
    );
    assert.ok(
      !essenceEditSource.includes('EditKicker'),
      'edit route should not render a duplicate inner route header'
    );
    assert.ok(
      !essenceEditSource.includes('IconClassHint'),
      'edit route should not expose raw icon class copy'
    );
    // The Save button now lives in the SHARED `ComponentEditorHeader`, which submits by id
    // through its `formId` prop. Both halves of that pairing still have to survive
    // verbatim — drop either and Save silently stops working, with no test to catch it —
    // so the pairing is asserted at both ends rather than at the literal attribute.
    assert.ok(
      rootSource.includes('formId="manager-essence-edit-form"'),
      'root header should own the primary save action for the edit form'
    );
    assert.ok(
      rootSource.includes('saveAttr="data-essence-edit-save"'),
      'and it wears this studio own hooks rather than the component studio ones'
    );
    // Edit, Duplicate and Delete are the INSPECTOR's, and the inspector is now an extracted
    // component under `essences/` rather than ~200 lines inlined in the root. The row keeps
    // the pencil alone; the assertions therefore move to the studio source, and asserting
    // their ABSENCE from the root proves the extraction happened rather than being copied.
    assert.ok(
      !rootSource.includes('data-essence-action='),
      'the root no longer inlines any essence inspector action'
    );
    for (const action of ['edit', 'duplicate', 'delete', 'copy-source', 'unlink-source']) {
      assert.ok(
        essenceStudioSource.includes(`data-essence-action="${action}"`),
        `the extracted inspector exposes the ${action} action`
      );
    }
    assert.ok(
      rootSource.includes('<EssenceBrowserInspector'),
      'and the root renders it as a component'
    );
    assert.ok(
      rootSource.includes('<EssenceBulkEditPanel'),
      'with the bulk panel replacing it while a selection exists'
    );
    assert.ok(
      rootSource.includes(
        'store.updateEssence?.(selectedEssenceForInspector.id, { sourceComponentId })'
      ),
      'inspector source changes should use updateEssence'
    );
    // Criterion 23's four route-wiring items, pinned at the chokepoint rather than at a
    // control: the same-view skip the other guards already have, the store's `cancel` half,
    // and the `deleteEssence` boolean the root now consumes.
    // The skip compares the ESSENCE, not only the view token. `essence-edit` is a "same
    // token, different subject" route: `editEssence` early-returns on an unchanged id, so
    // every call reaching the guard from inside the editor is a switch to a DIFFERENT
    // essence, which a token-only skip waved through with the draft unsaved and no prompt.
    assert.ok(
      rootSource.includes(
        "if (nextView === 'essence-edit' && nextEssenceId && nextEssenceId === selectedEssenceId)"
      ),
      'the essence route guard skips a same-ESSENCE exit, as the tools and system guards do'
    );
    assert.ok(
      !rootSource.includes(
        "if (activeView !== 'essence-edit' || nextView === 'essence-edit') return true;"
      ),
      'and the token-only form is gone, not merely shadowed'
    );
    assert.ok(
      rootSource.includes("confirmRouteExit('essence-edit', essenceId)"),
      'and `editEssence` supplies the target id, or the comparison can never be true'
    );
    assert.ok(
      rootSource.includes('store.cancelEssenceDraft?.()'),
      'and the discard branch reaches the store half of Cancel'
    );
    assert.ok(
      rootSource.includes('importSingleManagedItemFromDrop'),
      'inspector source drops should reuse the managed-item import seam'
    );
    // The armed BULK delete is a deliberate deviation from the `AGENTS.md` carve-out, under
    // the maintainer's binding decision for this action. The SINGLE delete keeps the
    // store-owned `confirmDialog`, so the two idioms do not collide on one screen.
    // The arm is now reached through the shared `BulkDeleteCard` (issue 1132), which renders
    // `ArmedDangerButton` itself. Retargeted rather than dropped: the assertion is about the
    // IDIOM — this delete arms instead of opening a dialog — and the card is what carries it.
    assert.ok(
      essenceStudioSource.includes('<BulkDeleteCard'),
      'the bulk delete arms rather than opening a dialog'
    );
    assert.ok(
      essenceStudioSource.includes('data-essence-bulk-impact'),
      'and states its impact before it is armed'
    );
    assert.ok(
      !essenceEditSource.includes('game.'),
      'edit route should not reference Foundry runtime globals'
    );
  });

  it('wires production essence dirty confirmation and manager app close guard', () => {
    assert.ok(
      /confirmDiscardEssenceDraft:\s*\(\)\s*=>\s*confirmDialog/.test(appSource),
      'v2 app should provide a production discard confirmation service'
    );
    for (const key of [
      'DiscardDirtyTitle',
      'DiscardDirtyContent',
      'DiscardDirtyConfirm',
      'DiscardDirtyCancel',
    ]) {
      assert.equal(
        typeof lang.FABRICATE.Admin.Manager.Essence[key],
        'string',
        `en.json should define Essence.${key}`
      );
    }
    assert.ok(
      appSource.includes('registerEssenceDirtyGuard'),
      'v2 app should accept the route dirty guard'
    );
    assert.ok(appSource.includes('async close(options)'), 'v2 app should guard window close');
    assert.ok(
      appSource.includes('canCloseEssence === false'),
      'v2 app close should stay open when discard is declined'
    );
    assert.ok(
      appSource.includes('if (!options?.force)'),
      'v2 app close should bypass interactive dirty guards during forced lifecycle teardown'
    );
  });

  /**
   * THE HALF OF THE COMPATIBILITY GUARANTEE THAT IS NOT BEHAVIOURAL.
   *
   * `confirmNavigation` answers `undefined` when no companion holds a guard, and its own suite
   * pins that. What cannot be observed from a mounted test, because a single microtask of
   * added latency is invisible through Svelte's own flush, is that BOTH callers actually read
   * `undefined` as "take the branch you took before this seam existed". Written any other way
   * — awaiting unconditionally, or comparing against `true` — every Manager close would pay an
   * extra `await` and every route exit would hand `afterTruthyResult` a composed promise, for a
   * question no companion asked. So the short-circuit is asserted where it lives.
   */
  it('costs a companion that registers no navigation guard nothing on either exit path', () => {
    assert.ok(
      appSource.includes(
        'if (canCloseCompanion !== undefined && (await canCloseCompanion) === false) return this;'
      ),
      'the window close skips its await entirely when there is no companion guard to ask'
    );
    const closeStart = appSource.indexOf('async close(options) {');
    const forceGate = appSource.indexOf('if (!options?.force) {', closeStart);
    const companionAsk = appSource.indexOf('_confirmDowntimeCompanionNavigation?.()', closeStart);
    const toolAsk = appSource.indexOf('_confirmDiscardDirtyToolDraft?.()', closeStart);
    assert.ok(forceGate > closeStart, 'the close still gates every interactive guard on force');
    assert.ok(
      companionAsk > forceGate,
      'the companion guard sits INSIDE the force gate, so a forced teardown never asks it'
    );
    assert.ok(
      companionAsk < toolAsk,
      'and is asked before the Core guards that can save, so a veto writes nothing'
    );
    assert.ok(
      rootSource.includes(
        'if (companion === undefined) return finishRouteExit(nextView, nextRouteId);'
      ),
      'the route exit returns its original result untouched when there is nothing to ask'
    );
    assert.ok(
      rootSource.includes("confirmRouteExit('world-downtime', tabId)"),
      'a Downtime tab switch states its destination tab, so the guard can tell it from a re-entry'
    );
  });

  it('keeps the recipes browser browser-only and wired to existing callbacks', () => {
    for (const snippet of [
      'store.setRecipeSearch?.',
      'store.toggleRecipeEnabled?.',
      'store.createRecipe?.()',
      'store.duplicateRecipe?.(recipeId)',
      'store.deleteRecipe?.(recipeId)',
    ]) {
      assert.ok(rootSource.includes(snippet), `root should wire ${snippet}`);
    }
    // The recipes header now offers a single primary "Create recipe" action
    // (create-then-edit) instead of crafting-system import/export, which moved off
    // the recipes header entirely.
    assert.ok(
      rootSource.includes('function createRecipe('),
      'createRecipe handler should be defined'
    );
    assert.ok(
      !rootSource.includes('onclick={importRecipes}'),
      'recipes header should not render import'
    );
    assert.ok(
      !rootSource.includes('onclick={exportRecipes}'),
      'recipes header should not render export'
    );
    // The recipe-edit route is reached BOTH from the inspector's Edit action and from
    // each row's own Edit pencil, restored to match the Books & Scrolls row edit (issue
    // 643): the inspector wires onEdit → editRecipe, and the row wires onEditRecipe →
    // editRecipe(id).
    assert.ok(
      rootSource.includes('onEdit={() => editRecipe(selectedRecipe?.id)}'),
      'inspector Edit should be wired to editRecipe'
    );
    assert.ok(
      rootSource.includes('onEditRecipe={(id) => editRecipe(id)}'),
      'the row Edit pencil should be wired to editRecipe(id)'
    );
    assert.ok(
      rootSource.includes('function editRecipe('),
      'editRecipe navigation should be defined'
    );
    assert.ok(
      rootSource.includes('function backToRecipesBrowse('),
      'backToRecipesBrowse navigation should be defined'
    );
    assert.ok(rootSource.includes("'recipe-edit'"), 'recipe-edit route should be wired');
    // saveRecipeDraft lives in the root (it commits the root-held draft), so scope
    // the inline-save absence to the browser source instead.
    assert.ok(
      !recipesBrowserSource.includes('saveRecipe'),
      'recipes browser should not introduce inline save behavior'
    );
    assert.ok(
      !rootSource.includes('required station'),
      'recipes browser should not introduce unsupported recipe fields'
    );
  });

  it('keeps the components browser browser-only and wired to existing component callbacks', () => {
    for (const snippet of [
      'store.setItemSearch?.',
      'services?.onDropItem?.(data)',
      'store.deleteComponent?.(itemId)',
      'services?.onCopySourceUuid?.(uuid)',
    ]) {
      assert.ok(rootSource.includes(snippet), `root should wire ${snippet}`);
    }
    assert.ok(
      rootSource.includes('activeView = view'),
      'components should use the selected-system route state'
    );
    assert.ok(
      !rootSource.includes('usageCount ='),
      'components browser should not invent usage counts'
    );
    assert.ok(
      !rootSource.includes('stale source'),
      'components browser should not invent source freshness labels'
    );
  });

  it('AC14: confirmComponentRouteExit retains NO component-edit bypass (issue 676)', () => {
    // LOAD-BEARING ASYMMETRY. `confirmComponentRouteExit` deliberately LACKS the
    // `|| nextView === '<kind>-edit'` bypass its recipe and environment siblings carry
    // (`confirmRecipeRouteExit`: `if (activeView !== 'recipe-edit' || nextView === 'recipe-edit') return true;`).
    //
    // That omission is exactly what makes `editComponent` guard component -> component
    // navigation — i.e. it is what makes the salvage "Edit ↗" deep link safe. An
    // implementer told to "mirror the Recipe Studio" copies the bypass and silently
    // discards a dirty draft on a deep-link jump, with nothing failing.
    const guard = rootSource.slice(
      rootSource.indexOf('function confirmComponentRouteExit'),
      rootSource.indexOf('function confirmEnvironmentRouteExit')
    );
    assert.ok(guard.length > 0, 'expected to locate confirmComponentRouteExit');
    assert.ok(
      guard.includes("if (activeView !== 'component-edit') return true;"),
      'the component route guard should short-circuit only on the ACTIVE view'
    );
    assert.ok(
      !guard.includes("nextView === 'component-edit'"),
      'the component route guard must NOT gain the recipe/environment nextView bypass'
    );
    // The sibling that DOES carry it, pinned so this test cannot pass vacuously by the
    // bypass string simply having been renamed everywhere.
    assert.ok(
      rootSource.includes(
        "if (activeView !== 'recipe-edit' || nextView === 'recipe-edit') return true;"
      ),
      'the recipe sibling still carries the bypass this one deliberately omits'
    );
  });

  it('routes the components row Edit action through the in-manager component-edit view', () => {
    assert.ok(
      rootSource.includes("activeView = 'component-edit'"),
      'editComponent should set the activeView to the in-manager component-edit route'
    );
    assert.ok(
      rootSource.includes('import ComponentEditView'),
      'root should import the ComponentEditView'
    );
    assert.ok(
      rootSource.includes('store.updateComponent?.'),
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
    assert.ok(
      !rootSource.includes("import EnvironmentsTab from '../EnvironmentsTab.svelte';"),
      'manager root should not import the full legacy environments tab'
    );
    assert.ok(
      !rootSource.includes('forceEditorOpen'),
      'manager edit route should not force-open the legacy environment editor'
    );
    // The v2 environment editor is a composition/wrapper editor: it composes
    // reusable library tasks/events into one environment via include/exclude,
    // ordering, and a shared automatic|manual composition mode. It does NOT
    // author reusable source records (that lives in the standalone
    // gathering-task-edit / gathering-event-edit routes), so it must wire the
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
      'composition={$viewState.environmentComposition}',
    ]) {
      assert.ok(rootSource.includes(snippet), `environment edit route should wire ${snippet}`);
    }
    for (const snippet of [
      'store.addEnvironmentTaskResultGroup',
      'store.addEnvironmentTaskCatalyst',
      'store.updateEnvironmentTaskVisibility',
      'store.updateEnvironmentTaskCheck',
    ]) {
      assert.ok(
        !environmentEditSource.includes(snippet),
        `environment composition editor should not author tasks via ${snippet}`
      );
    }
    assert.ok(
      !environmentEditSource.includes("id: 'advanced'"),
      'environment editor should not define an advanced task tab'
    );
    assert.ok(
      !environmentEditSource.includes('manager-environment-details-tabs'),
      'environment editor should not render environment advanced tabs'
    );
    assert.ok(
      !environmentEditSource.includes('manager-environment-evidence-column'),
      'environment editor should no longer render the duplicated evidence column'
    );
  });

  it('wires Manager gathering libraries, global conditions, and environment composition controls', () => {
    // Global conditions and vocabularies are authored from the gathering
    // workspace browser (settings tab); library task/event authoring and rules
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
      'onDeleteGatheringVocabularyValue={store.deleteGatheringVocabularyValue}',
    ]) {
      assert.ok(rootSource.includes(snippet), `root should wire ${snippet}`);
    }
    // NOTE: per-token environment-editor contracts were removed when the editor
    // was placeholder'd out pending redesign. The store wirings above and the
    // settings/browser surfaces below still need to pass.
    assert.ok(
      rootSource.includes('data-gathering-inspector-rules'),
      'root should render the settings rules inspector'
    );
    assert.ok(
      environmentsBrowserSource.includes('data-gathering-condition-panel={condition.kind}'),
      'settings tab should render condition vocabulary panels'
    );
    assert.ok(
      environmentsBrowserSource.includes('onToggleGatheringConditionEnabled?.'),
      'settings condition panels should wire matching toggles'
    );
    assert.ok(
      environmentsBrowserSource.includes('onAddGatheringConditionValue?.'),
      'settings condition panels should wire value additions'
    );
    assert.ok(
      environmentsBrowserSource.includes('onUpdateGatheringConditionValue?.'),
      'settings condition panels should wire label and icon updates'
    );
    assert.ok(
      environmentsBrowserSource.includes('onDeleteGatheringConditionValue?.'),
      'settings condition panels should wire value deletion'
    );
    assert.ok(
      environmentsBrowserSource.includes('data-gathering-vocabulary-panel={vocabulary.kind}'),
      'settings tab should render region and biome vocabulary panels'
    );
    assert.ok(
      environmentsBrowserSource.includes('onAddGatheringVocabularyValue?.'),
      'settings vocabulary panels should wire value additions'
    );
    assert.ok(
      environmentsBrowserSource.includes('onUpdateGatheringVocabularyValue?.'),
      'settings vocabulary panels should wire label, icon, and colour updates'
    );
    assert.ok(
      environmentsBrowserSource.includes('onDeleteGatheringVocabularyValue?.'),
      'settings vocabulary panels should wire value deletion'
    );
    assert.ok(
      environmentsBrowserSource.includes('ManagerColorPicker'),
      'settings biome panels should use the manager color picker'
    );
    assert.ok(
      environmentsBrowserSource.includes('IconPicker'),
      'settings condition panels should reuse the shared icon picker'
    );
    assert.ok(
      environmentsBrowserSource.includes('manager-condition-label-input'),
      'settings condition panels should expose editable display labels'
    );
    assert.ok(
      /onAddGatheringConditionValue\?\.\(\s*kind,\s*\{ label: value, icon: conditionAddIcon\(kind\) \}/.test(
        environmentsBrowserSource
      ),
      'settings condition add should include the selected icon'
    );
    assert.equal(lang.FABRICATE.Admin.Manager.Environment.Conditions.NewIcon, 'New value icon');
    // NOTE: vocabulary-CSV contracts on environmentEditSource removed pending editor redesign.
    assert.ok(rootSource.includes('updateSelectedGatheringRules'), 'root should wire rule updates');
    assert.ok(
      rootSource.includes('manager-rule-copy'),
      'root should render rule descriptions beside inspector icons'
    );
    // The two limits are one shared component now (issue 1050), so the marker they were
    // asserted through lives there and is driven by the `rule` prop. Both halves are pinned:
    // the root still renders one of each, and the component still emits the marker from the
    // prop — so a root that stopped rendering a limit, or a component that stopped marking
    // it, fails here rather than one covering for the other.
    for (const rule of ['rewardLimit', 'eventLimit']) {
      assert.match(
        rootSource,
        new RegExp(String.raw`<GatheringRuleLimitStepper\s+rule="${rule}"`),
        `root should render the ${rule} stepper`
      );
    }
    assert.ok(
      gatheringRuleLimitStepperSource.includes('data-gathering-rule-stepper={rule}'),
      'the shared limit stepper marks itself with the rules field it edits'
    );
    assert.ok(
      rootSource.includes('FABRICATE.Admin.Manager.Environment.Rules.EventHighestRankedDrop'),
      'event rule select should use event-specific drop labels'
    );
    assert.equal(
      lang.FABRICATE.Admin.Manager.Environment.Rules.HighestRankedDrop,
      'Highest ranked successful drop'
    );
    assert.equal(lang.FABRICATE.Admin.Manager.Environment.Rules.AllDrops, 'All successful drops');
    assert.equal(
      lang.FABRICATE.Admin.Manager.Environment.Rules.LimitedDrops,
      'Limit successful drops'
    );
    assert.equal(
      lang.FABRICATE.Admin.Manager.Environment.Rules.EventHighestRankedDrop,
      'Highest ranked triggered event'
    );
    assert.equal(
      lang.FABRICATE.Admin.Manager.Environment.Rules.EventAllDrops,
      'All triggered events'
    );
    assert.equal(
      lang.FABRICATE.Admin.Manager.Environment.Rules.EventLimitedDrops,
      'Limit triggered events'
    );
    assert.ok(
      rootSource.includes('selectedGatheringConditionShortcuts'),
      'root should derive selected-system condition shortcuts'
    );
    assert.ok(
      rootSource.includes('buildSelectedGatheringConditionShortcuts'),
      'root should keep shortcut visibility gated by selected-system gathering conditions'
    );
    assert.ok(
      rootSource.includes('data-systems-gathering-conditions'),
      'systems inspector should render a global condition shortcut card'
    );
    assert.ok(
      rootSource.includes('data-systems-gathering-condition={condition.kind}'),
      'systems inspector should render one shortcut per enabled condition dimension'
    );
    assert.ok(
      rootSource.includes(
        'store.updateGatheringConditions?.({ [kind]: value, systemId: selectedSystemId })'
      ),
      'systems inspector shortcuts should reuse current condition persistence with selected system id'
    );
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
      'manager-drop-editor-actions',
    ]) {
      assert.ok(rootSource.includes(snippet), `root should include ${snippet}`);
    }
    for (const snippet of [
      'GatheringTasksBrowserView',
      'tasks={selectedGatheringSystemConfig.tasks || []}',
      'selectedTaskId',
      'managedItemOptions',
    ]) {
      assert.ok(
        environmentsBrowserSource.includes(snippet),
        `environment browser should include ${snippet}`
      );
    }
    for (const snippet of [
      'data-gathering-tasks-browser',
      'manager-gathering-tasks-table',
      'biomeChips(task)',
      'timeChips(task)',
      'weatherChips(task)',
      'rowChips(task)',
      'data-gathering-task-tags',
      'onDuplicateTask(selectedSystemId, task.id)',
      'onDeleteTask(selectedSystemId, task.id)',
      'onToggleTaskEnabled(selectedSystemId, task.id',
    ]) {
      assert.ok(
        gatheringTasksBrowserSource.includes(snippet),
        `task browser should include ${snippet}`
      );
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
      'manager-drop-modifier-overflow',
      'ChanceSlider',
      'inputmode="numeric"',
      "pattern={'[1-9][0-9]{0,2}'}",
      'onClearDropComponent',
      'onDropComponentMouseDown',
      'onComponentDragStart',
      'FabricateManagedComponent',
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
      'DropModifierOverflowHint',
      'RewardRuleNotice',
    ]) {
      assert.ok(gatheringTaskEditSource.includes(snippet), `task editor should include ${snippet}`);
    }
    // Asserted as a pattern rather than a snippet in the list above: Prettier (issue 923) prints
    // this object literal one property per line with a trailing comma, so no single-line
    // substring covers the whole payload.
    assert.ok(
      /onUpdateDrop\(rowId, \{\s*componentId: data\.componentId,\s*itemUuid: '',\s*systemItemId: '',\s*name: '',\s*enabled: true,?\s*\}\)/.test(
        gatheringTaskEditSource
      ),
      'a managed-component drop should reset the row identity and enable it'
    );
    for (const snippet of [
      'manager-drop-rate-value',
      'manager-drop-rate-percent',
      'manager-drop-rate-track',
      'manager-drop-rate-fill',
      'type="number"',
      'type="range"',
      'handleNumberInput',
      'handleNumberBlur',
      'handleNumberKeydown',
      'handleRangeInput',
      'resolveColor',
      'numberLabel',
      'rangeLabel',
    ]) {
      assert.ok(chanceSliderSource.includes(snippet), `shared chance slider should include ${snippet}`);
    }
    for (const snippet of [
      'manager-drop-editor-values',
      'data-gathering-drop-inspector-rate',
      'data-gathering-drop-inspector-count',
      'gatheringDropRateTierClass',
      'gatheringDropRateTierColor',
      'onGatheringDropCountKeydown',
      'ChanceSlider',
    ]) {
      assert.ok(
        rootSource.includes(snippet),
        `root should include selected drop inspector ${snippet}`
      );
    }
    // Issue 883: the inspector's slider IS `ChanceSlider`. It used to hand-roll the same
    // track/fill/range structure and its own input/blur/keydown trio beside it, so the
    // structure and the handlers must be gone from the root, not merely unused — a
    // surviving copy is what the next divergence gets written against.
    for (const dead of [
      'manager-drop-rate-control',
      'manager-drop-rate-track',
      'manager-drop-rate-fill',
      'onGatheringDropRateInput',
      'onGatheringDropRateBlur',
      'onGatheringDropRateKeydown',
    ]) {
      assert.equal(
        rootSource.includes(dead),
        false,
        `root should render the drop-rate slider through ChanceSlider, not ${dead}`
      );
    }
    assert.ok(
      !gatheringTaskEditSource.includes('manager-task-editor-tabs'),
      'task editor should be a one-page editor without tab navigation'
    );
    assert.ok(
      gatheringTaskEditSource.includes('TaskIdentity'),
      'task editor should render a visible task identity heading'
    );
    assert.ok(
      !/Tasks\.TaskId(?!entity)/.test(gatheringTaskEditSource),
      'task editor should not render the raw internal task id localization'
    );
    assert.ok(
      !gatheringTaskEditSource.includes('Internal ID'),
      'task editor should not render the raw internal task id label'
    );
    assert.ok(
      !gatheringTaskEditSource.includes('BackToLibrary'),
      'task editor should not render a duplicate central back-to-library control'
    );
    assert.ok(
      !gatheringTaskEditSource.includes('type="checkbox"'),
      'task editor status toggle should use the shared button pattern'
    );
    assert.ok(
      !gatheringTaskEditSource.includes('<select value={selectedCondition'),
      'task availability should not use native single-select controls'
    );
    assert.ok(
      !gatheringTaskEditSource.includes('function selectedCondition('),
      'task availability should not collapse arrays to a single selection'
    );
    assert.ok(
      !gatheringTaskEditSource.includes('Tasks.SelectDrop'),
      'drop rows should not render a row-level edit/select quick action'
    );
    assert.ok(
      !gatheringTaskEditSource.includes('data-gathering-task-drop-actions'),
      'drop rows should not render row-level duplicate/delete actions'
    );
    assert.ok(
      !gatheringTaskEditSource.includes('data-gathering-task-drop-row-number'),
      'drop rows should not add a leading row number column'
    );
    assert.ok(
      !gatheringTaskEditSource.includes('EditDrop'),
      'drop rows should not add an edit quick action'
    );
    assert.ok(
      !gatheringTaskEditSource.includes('manager-labeled-cell manager-drop-component-cell'),
      'drop component row values should not render responsive duplicate labels'
    );
    assert.ok(
      !gatheringTaskEditSource.includes('manager-labeled-cell manager-drop-rate-cell'),
      'drop chance row values should not render responsive duplicate labels'
    );
    assert.ok(
      !gatheringTaskEditSource.includes('QuantityShortHint'),
      'drop quantity row values should not render an extra helper label'
    );
    assert.ok(
      !rootSource.includes('selectedGatheringDrop.componentId ||'),
      'selected drop inspector should not render a component selector'
    );
    assert.ok(
      gatheringTaskEditSource.includes('manager-task-media-column'),
      'task editor should group image and status in the media column'
    );
    assert.ok(
      gatheringTaskEditSource.includes('availableConditionOptions'),
      'task editor should filter selected availability options out of menus'
    );
    assert.ok(
      gatheringTaskEditSource.includes('selectedConditionOptions'),
      'task editor should render selected availability values as pills'
    );
    assert.ok(
      gatheringTaskEditSource.includes('StatusOff'),
      'task editor should use shared Off status copy'
    );
    assert.ok(
      gatheringTaskEditSource.includes('StatusOn'),
      'task editor should use shared On status copy'
    );
    assert.ok(
      gatheringTaskEditSource.includes('manager-task-required-tools-card'),
      'task editor should render the Required Tools section'
    );
    assert.ok(
      gatheringTaskEditSource.includes('data-gathering-task-required-tools'),
      'Required Tools section should expose a stable data hook'
    );
    assert.ok(
      gatheringTaskEditSource.includes('onAddToolReference'),
      'task editor should call back to the root for tool-reference additions'
    );
    assert.ok(
      gatheringTaskEditSource.includes('onRemoveToolReference'),
      'task editor should call back to the root for tool-reference removals'
    );
    assert.ok(
      rootSource.includes('selectedGatheringSystemTools'),
      'root should derive the per-system tools library for the task editor'
    );
    assert.ok(
      rootSource.includes('addToolReferenceToSelectedTask'),
      'root should expose an add-tool-reference handler'
    );
    assert.ok(
      rootSource.includes('removeToolReferenceFromSelectedTask'),
      'root should expose a remove-tool-reference handler'
    );
    assert.equal(
      lang.FABRICATE.Admin.Manager.Environment.Tasks.RequiredToolsTitle,
      'Required Tools'
    );
    assert.equal(
      lang.FABRICATE.Admin.Manager.Environment.Tasks.RequiredToolsEmpty,
      'No tools required.'
    );
    assert.equal(lang.FABRICATE.Admin.Manager.Environment.Tasks.StaleToolChip, 'Deleted tool');
    assert.equal(lang.FABRICATE.Admin.Manager.Environment.Tasks.SearchTools, 'Search tools...');
    assert.equal(
      lang.FABRICATE.Admin.Manager.Environment.Tasks.EmptyTitle,
      'No gathering tasks yet'
    );
    assert.equal(lang.FABRICATE.Admin.Manager.Environment.Tasks.DropChance, 'Drop chance');
    assert.equal(
      lang.FABRICATE.Admin.Manager.Environment.Tasks.DropChancePercent,
      'Drop chance percent'
    );
    assert.equal(lang.FABRICATE.Admin.Manager.Environment.Tasks.DropQuantityColumn, 'Count');
    assert.equal(
      lang.FABRICATE.Admin.Manager.Environment.Tasks.ClearDropComponentHint,
      'Right-click to clear component'
    );
    assert.equal(
      lang.FABRICATE.Admin.Manager.Environment.Tasks.DropModifierOverflowHint,
      'See selected rule for modifiers'
    );
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
      !rootSource.includes(
        "<h3 class=\"manager-card-title\">{text('FABRICATE.Admin.Manager.Environment.Tasks.Actions', 'Gathering task actions')}</h3>"
      ),
      'gathering task inspector should not keep an action card heading'
    );
    assert.ok(
      !rootSource.includes('duplicateGatheringTask(selectedSystemId, selectedGatheringTask.id)'),
      'gathering task inspector should not duplicate row-level duplicate actions'
    );
    assert.equal(
      lang.FABRICATE.Admin.Manager.Environment.Tasks.BackToLibrary,
      'Back to task library'
    );
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

  it('wires the Tools library and focused editor through root-owned draft callbacks', () => {
    assert.ok(
      rootSource.includes("import ToolsBrowserView from './ToolsBrowserView.svelte';"),
      'root should import ToolsBrowserView'
    );
    for (const snippet of [
      "currentView === 'tools'",
      "currentView === 'tool-edit'",
      'focusedToolDraft',
      'focusedToolValidation',
      'openToolEditor',
      'selectLibraryTool',
      'backToToolsBrowser',
      'saveSelectedToolDraft',
      'deleteSelectedLibraryTool',
      'confirmToolsRouteExit',
      'store.createToolDraft?.',
      'store?.openToolDraft',
      'store?.saveToolDraft',
      'store?.deleteToolDraft',
      'toolsNavCount',
    ]) {
      assert.ok(rootSource.includes(snippet), `root should reference ${snippet}`);
    }
    assert.ok(
      /onclick=\{\(\) => setView\('tools'\)\}/.test(rootSource),
      "root should wire a top-level Tools nav button to setView('tools')"
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
    assert.equal(lang.FABRICATE.Admin.Manager.Tools.Save, 'Save tool');
    assert.equal(lang.FABRICATE.Admin.Manager.Tools.NavigationDirty.SaveAll, 'Save All');
    assert.ok(
      rootSource.includes("import ToolEditView from './ToolEditView.svelte';"),
      'root should import the focused Tool editor'
    );
    assert.ok(
      toolEditSource.includes('<ToolRequirementsTab'),
      'focused editor should render its requirements tab'
    );
    assert.ok(
      !toolRequirementsSource.includes('ProviderExpressionInput'),
      'Tool requirements should use shared prerequisites rather than provider selection'
    );
    assert.ok(
      toolRequirementsSource.includes('manager-tool-prerequisite-list'),
      'Tool requirements should expose the shared prerequisite picker'
    );
    assert.ok(
      toolRequirementsSource.includes('RollDataExpressionInput'),
      'Tool requirements should reuse the roll-data expression input'
    );
    assert.ok(
      /manager-tool-section-heading[\s\S]*?<h3>\s*<i class="fas fa-heart-crack"[\s\S]*?<\/h3>[\s\S]*?<p>/.test(
        toolBreakageSource
      ),
      'Breakage should render its icon heading and immediate hint before the method cards'
    );
    assert.ok(
      !toolBreakageSource.includes('BreakageKicker'),
      'Breakage should not restore the redundant BREAKAGE kicker'
    );
    assert.ok(
      !toolOverviewSource.includes('compactSourceId'),
      'Overview should not expose the raw or compact source UUID'
    );
    assert.ok(
      !toolOverviewSource.includes('<code title={source.uuid'),
      'Overview should not render the source UUID below the source name'
    );
    assert.ok(
      toolOverviewSource.includes('<ItemDropZone'),
      'Overview should reuse the shared drag-only Item drop zone'
    );
    assert.ok(
      /copyLabel=[\s\S]*?unlinkLabel=/.test(toolOverviewSource),
      'Overview should place the Copy source UUID action before Unlink'
    );
    assert.ok(
      toolOverviewSource.includes('SourceDropHint'),
      'Overview should explain that dropping an Item replaces the linked source'
    );
    assert.ok(
      !toolOverviewSource.includes('data-tool-source-replace'),
      'Overview should not offer the removed source picker'
    );
    assert.ok(
      toolValidationSource.includes('<EditorValidationSurface'),
      'Validation should reuse the recipe-style editor validation surface'
    );
    assert.ok(
      appSource.includes('const clipboard = game?.clipboard;') &&
        appSource.includes('await clipboard.copyPlainText(text);'),
      'Manager UUID copies should use the Foundry V13 clipboard service'
    );
    assert.equal(
      appSource.includes('navigator.clipboard') ||
        appSource.includes('foundry.utils.copyPlainText'),
      false,
      'Manager UUID copies should not bypass the Foundry clipboard service'
    );
  });

  // The GM Knowledge surface (issue 785). Everything asserted here is a wiring
  // decision whose absence is SILENT at runtime: an un-suppressed inspector holds a
  // dead 300px strip open, an un-threaded `resolutionMode` hides the rail entry from
  // the `global` + alchemy configuration that motivated the widened gate, and an
  // ungated `setKnowledgeActive` puts a whole-world actors x items scan on every one
  // of `refresh()`'s callers.
  it('routes the Knowledge surface, releases its third column, and gates its projection', () => {
    assert.ok(
      rootSource.includes("import KnowledgeView from './KnowledgeView.svelte';"),
      'root should import the Knowledge surface'
    );
    for (const snippet of [
      "currentView === 'knowledge'",
      'knowledge={knowledgeState}',
      "const knowledgeState = $derived($viewState.knowledge || null)",
      "store.setKnowledgeActive?.(currentView === 'knowledge')",
      'store.selectKnowledgeActor?.(actorId)',
      'store.expendRecipeItemUse?.(actorId, itemId)',
      'store.deleteOwnedRecipeItem?.(actorId, itemId)',
      'store.eraseLearnedRecipe?.(actorId, recipeId)',
      'store.resetActorSystemKnowledge?.(actorId)',
      'store.resetActorAllKnowledge?.(actorId)',
      'resolutionMode: craftingResolutionMode,',
      "const craftingResolutionMode = $derived(selectedSystem?.resolutionMode || '')",
    ]) {
      assert.ok(rootSource.includes(snippet), `root should reference ${snippet}`);
    }
    // The CSS column release and this aside suppression are ONE decision expressed
    // twice; doing only the first leaves an empty 300px inspector holding the strip.
    assert.ok(
      rootSource.includes("currentView !== 'knowledge'") &&
        rootSource.includes('class="manager-inspector"'),
      'the shared inspector is suppressed for the full-width knowledge surface'
    );
    // The projection is published TOP-LEVEL, never hung off selectedSystem.
    assert.equal(
      rootSource.includes('selectedSystem.knowledge'),
      false,
      'the knowledge projection must not be read off selectedSystem'
    );

    // The view owns the single armed token and every disarm rule.
    for (const snippet of [
      'data-knowledge-view',
      'KnowledgeRoster',
      'KnowledgeTabs',
      'KnowledgeRecipeItemsTab',
      'KnowledgeLearnedRecipesTab',
      'filterKnowledgeRoster',
      'let armedToken = $state',
      "role=\"tabpanel\"",
    ]) {
      assert.ok(knowledgeSource.includes(snippet), `KnowledgeView should include ${snippet}`);
    }
    // The default tab is seeded ONCE from the store, never derived live from the
    // definition count: a GM authoring the system's first recipe item elsewhere
    // would otherwise yank the open tab and silently disarm an armed row.
    assert.ok(
      knowledgeSource.includes('let tabSeeded = $state(false)'),
      'the default tab should be seeded once on surface entry'
    );

    // The armed control is a REAL focusable button, and its token is keyed on the
    // target document id — never a row index, which the asynchronous re-projection
    // would turn into a destructive misfire.
    assert.ok(
      armedDangerButtonSource.includes('<button\n  bind:this={element}\n  type="button"'),
      'the armed confirmation should be a real button element'
    );
    assert.equal(
      /sc-on-click/.test(armedDangerButtonSource),
      false,
      'the prototype span affordance must not be copied'
    );
    for (const snippet of [
      "data-armed={armed ? 'true' : 'false'}",
      'data-arm-token={token}',
      'aria-label={consequence}',
      "event.key !== 'Escape'",
      'function handleBlur()',
      'armedIcon = \'fas fa-triangle-exclamation\'',
    ]) {
      assert.ok(
        armedDangerButtonSource.includes(snippet),
        `ArmedDangerButton should include ${snippet}`
      );
    }
    const copyRowSource = readFileSync(
      resolve(knowledgeComponentDir, 'KnowledgeOwnedCopyRow.svelte'),
      'utf8'
    );
    const learnedRowSource = readFileSync(
      resolve(knowledgeComponentDir, 'KnowledgeLearnedRow.svelte'),
      'utf8'
    );
    assert.ok(
      copyRowSource.includes('`delete:${copy?.itemId'),
      'the delete token should be keyed on the item document id'
    );
    assert.ok(
      learnedRowSource.includes('`erase:${learned?.recipeId'),
      'the erase token should be keyed on the recipe id'
    );
    // Only `spent` disables Expend. An `!inert` term would apply a gate the engine
    // does not: `_filterNonExhausted` reads `timesUsed` alone.
    assert.ok(
      copyRowSource.includes('disabled={!copy.canExpend}'),
      'Expend should be disabled purely from the projected affordance'
    );
    assert.equal(
      /!\s*copy\.inert/.test(copyRowSource),
      false,
      'inert must not gate the Expend affordance'
    );
    // `inert` is an INDEPENDENT chip, so the fused "Spent · inert" label is retired.
    assert.ok(
      copyRowSource.includes('data-knowledge-inert'),
      'inert should render as its own chip'
    );
  });

  // The Knowledge SEAM (issue 785). Every rule here is invisible at unit level and
  // silent at runtime if it regresses: dropping `reprojectKnowledge` from the item
  // handler leaves a learn/expend/delete on another client unrendered, inverting the
  // `doc?.pack` guard re-projects the whole world for a compendium write, flattening a
  // `[hook, id]` tuple leaks the listener across every manager reopen, and removing an
  // `isGM` gate hands a player a GM mutation.
  it('registers the Knowledge hook set as tuples, filters it, and GM-gates every mutation', () => {
    // Only actor-owned, NON-compendium items can change the projection. `Document#pack`
    // falls back to `this.parent?.pack`, so an Item embedded in a compendium Actor is
    // readable straight off the embedded doc.
    assert.ok(
      appSource.includes("if (doc?.parent?.documentName !== 'Actor') return;"),
      'the item handler drops a world/compendium-root item'
    );
    assert.ok(
      appSource.includes('if (doc?.pack) return;'),
      'the item handler drops an item embedded in a COMPENDIUM actor'
    );
    // `updateActor` is key-filtered because it is noisy (every HP tick fires it);
    // learned recipes, usage counts and learn counts all live under `flags`.
    assert.ok(
      appSource.includes("if ('flags' in diff) {"),
      "updateActor re-projects knowledge only on a 'flags' diff"
    );
    // `scheduleKnowledgeRefresh` is a TOTAL no-op unless the Knowledge surface is open, so
    // the same diff must ALSO mark the Recipe Studio's learned-recipe index stale — that
    // index is what the delete card's "Will be forgotten by N characters" counts through
    // (issue 1132, review round). Marking is all it does: `updateActor` fires for every
    // module's flag writes, so rebuilding here would be a world walk per foreign write.
    assert.ok(
      appSource.includes(
        'const markLearnerIndexStale = () => this._adminStore?.markLearnedRecipeIndexStale?.();'
      ),
      'the actor hooks mark the learned-recipe index stale rather than rebuilding it'
    );
    assert.ok(
      appSource.includes('markLearnerIndexStale();\n        reprojectKnowledge();'),
      'and the flags branch does both'
    );
    // Parent CRUD is load-bearing, not belt-and-braces: an `Actor.create` carrying
    // `items[]` fires createActor and ZERO createItem.
    assert.ok(
      appSource.includes(
        "...['createActor', 'deleteActor'].map((hook) => [hook, Hooks.on(hook, reprojectOnActorCrud)])"
      ),
      'createActor/deleteActor route through the knowledge reprojection too'
    );
    assert.ok(
      appSource.includes('const reprojectKnowledge = () =>') &&
        appSource.includes('scheduleKnowledgeRefresh'),
      'the knowledge reprojection coalesces through the store scheduler'
    );
    for (const hook of ['createItem', 'updateItem', 'deleteItem']) {
      assert.ok(appSource.includes(`'${hook}'`), `${hook} is registered`);
    }

    // EVERY `_userHooks` entry is an `[hookName, id]` tuple, and the unregister side
    // destructures exactly that shape. A bare id makes it destructure `undefined`.
    const hooksBlock = appSource.slice(
      appSource.indexOf('this._userHooks = ['),
      appSource.indexOf('_unregisterUserHooks() {')
    );
    assert.ok(hooksBlock.length > 0, 'the hook registration block is locatable');
    const flatHooks = hooksBlock.replaceAll(/\s+/g, ' ');
    const registrations = flatHooks.match(/Hooks\.on\(/g) || [];
    const tuples = flatHooks.match(/\[ ?(?:hook|'[a-zA-Z]+') ?, ?Hooks\.on\(/g) || [];
    assert.ok(registrations.length >= 4, 'the user hooks are registered here');
    assert.equal(
      tuples.length,
      registrations.length,
      'every Hooks.on id is registered inside a [hookName, id] tuple'
    );
    assert.ok(
      appSource.includes('for (const [hook, id] of this._userHooks)'),
      'the unregister side destructures the tuple'
    );

    // The GM gate is `isGM`, NOT `activeGM`: this is a single-client, user-initiated
    // mutation from a GM-only Application, and `activeGM` would lock out the assistant
    // GMs `show()` already admits.
    assert.ok(
      appSource.includes('if (game.user?.isGM !== true)') &&
        appSource.includes('KNOWLEDGE_MESSAGES.gmOnly'),
      'the knowledge gate denies a non-GM with the GM-only message'
    );
    assert.equal(
      /activeGM/.test(appSource.slice(appSource.indexOf('_knowledgeActor('))),
      false,
      'the Knowledge seam must never gate on activeGM'
    );
    // All four mutating methods reach that gate — directly, or through the shared
    // `_knowledgeTarget` resolver which calls it first.
    for (const method of [
      '_expendRecipeItemUse({',
      '_deleteOwnedRecipeItem({',
      '_eraseLearnedRecipe({',
      '_resetActorKnowledge({',
    ]) {
      const start = appSource.indexOf(`async ${method}`);
      assert.ok(start > 0, `${method} exists`);
      const body = appSource.slice(start, start + 700);
      assert.match(
        body,
        /this\._knowledge(Actor|Target)\(/,
        `${method} resolves through the GM-gated helper`
      );
      assert.ok(body.includes('if (denied) return denied;'), `${method} returns the denial`);
    }
    assert.ok(
      appSource.includes('const { actor, denied } = this._knowledgeActor(actorId);'),
      '_knowledgeTarget itself runs the GM gate before any document lookup'
    );

    // The Foundry-free mutation bodies live in the collaborator, so the seam only
    // resolves documents and delegates.
    assert.ok(
      appSource.includes(
        "} from './svelte/apps/manager/knowledge/knowledgeMutations.js';"
      ),
      'the seam delegates its mutations to the plain-JS collaborator'
    );
    for (const call of [
      'await expendOwnedRecipeItemUse({',
      'await deleteOwnedRecipeItemCopy({',
      'await eraseLearnedRecipeEntry({',
      'await resetActorKnowledgeState({',
    ]) {
      assert.ok(appSource.includes(call), `the seam calls ${call}`);
    }

    // The roster is player characters only — the same predicate the Access roster uses.
    //
    // ANTI-PIN (issue 1024). The old assertion pinned the exact
    // `game.fabricate?.isPlayerCharacterActor?.(actor) ?? actor?.type === 'character'`
    // reach-around this change deletes. Replacing it with a positive
    // `includes('isPlayerCharacterActor(actor)')` would be a tautology that survives a
    // WRONG import — so instead assert the hardcoded literal is ABSENT (provably red
    // before this change, at both the Access and Knowledge rosters) plus the import.
    assert.equal(
      appSource.includes("actor?.type === 'character'"),
      false,
      'the manager app must not re-hardcode the dnd5e/pf2e player-character actor type'
    );
    assert.equal(
      appSource.includes("actor.type === 'character'"),
      false,
      'nor the unchained spelling of it'
    );
    assert.equal(
      appSource.includes('game.fabricate?.isPlayerCharacterActor'),
      false,
      'the predicate is not published on game.fabricate, so no site may reach for it there'
    );
    assert.ok(
      appSource.includes(
        "import { isPlayerCharacterActor } from '../config/playerCharacterTypes.js';"
      ),
      'the manager app imports the shared, GM-configurable player-character predicate'
    );
  });

  // The learned-row ALLOWLIST (issue 1289). `_collectKnowledgeLearnedEntries` builds every
  // learned row as a hand-written object literal, so a field that literal does not name never
  // reaches the display ladder at all — the row renders whatever an earlier rung answers, with
  // nothing failing anywhere. Deleting the `granted`/`grantedBy` pair from it survived the
  // whole suite: the mounted Knowledge suite feeds `projectKnowledgeSnapshot` a hand-built
  // `rawLearned` fixture, so it proves the ladder and the render but never the collection; the
  // Foundry step opens no Knowledge row for its throwaway actor; and the View Lab frame is a
  // screenshot, not a gate.
  //
  // The expected set is DERIVED from the ladder's own source rather than restated, so a field
  // added to the ladder later cannot be forgotten here either.
  it('names every learned-entry field the display ladder reads', () => {
    const studioSource = readFileSync(resolve(knowledgeComponentDir, 'knowledgeStudio.js'), 'utf8');
    // Walked to a FIXED POINT from the projection the collected rows are fed to: every
    // `raw.<field>` that projection reads, and the same again for every function it hands the
    // same `raw` to, at any depth. One level would miss `granted`/`grantedBy`, which
    // `learnedRecipeSource` reads only through `learnedRecipeGrantSource`.
    const readFields = new Set();
    const walked = new Set();
    const queue = ['projectLearnedRecipeRow'];
    while (queue.length > 0) {
      const name = queue.shift();
      if (walked.has(name)) continue;
      walked.add(name);
      const body = moduleFunctionSource(studioSource, name, 'knowledgeStudio.js');
      for (const [, field] of body.matchAll(/\braw\.([A-Za-z_$][\w$]*)/g)) readFields.add(field);
      for (const [, callee] of body.matchAll(/\b([A-Za-z_$][\w$]*)\(raw\)/g)) queue.push(callee);
    }
    // A VACUITY guard, not the subject. The walk keys on the ladder's input still being named
    // `raw` and still being read field by field; a rewrite that destructured it would leave
    // every assertion below passing over an empty set.
    assert.ok(
      readFields.size >= 6,
      `the learned-row ladder no longer reads \`raw.<field>\`, so this derivation proves nothing (found ${[...readFields].join(', ') || 'nothing'})`
    );

    const collector = classMemberSource(
      appSource,
      '_collectKnowledgeLearnedEntries(actor, items, context) {',
      'SvelteCraftingSystemManagerApp.svelte.js'
    );
    const literalStart = collector.indexOf('learnedRecipes.push({');
    const literalEnd = collector.indexOf('\n      });', literalStart);
    assert.ok(
      literalStart >= 0 && literalEnd > literalStart,
      'the learned-row literal is locatable inside the collector, so this is not an empty slice'
    );
    const literal = collector.slice(literalStart, literalEnd);
    // A field is named either as `field: value` or as the `field,` shorthand.
    const named = new Set(
      [...literal.matchAll(/^\s+([A-Za-z_$][\w$]*)[:,]/gm)].map(([, key]) => key)
    );
    for (const field of readFields) {
      assert.ok(
        named.has(field),
        `the collector's allowlist drops \`${field}\`, which the learned-row ladder reads: the row falls silently to an earlier rung`
      );
    }
    // Named for their own sake as well as by derivation: these two are the pair the ladder
    // reads STRICTLY (`granted === true`, `typeof grantedBy === 'string'`), so they are also
    // the pair a `String(...)` or `|| ''` default here would quietly make plausible.
    assert.ok(
      readFields.has('granted') && readFields.has('grantedBy'),
      'the grant rungs are still part of the ladder this derivation walks'
    );
  });

  it('wires a collapsible left rail persisted via the manager setting seam', () => {
    assert.ok(
      rootSource.includes(
        "let railCollapsed = $state(services?.getSetting?.('managerRailCollapsed') === true);"
      ),
      'rail collapsed state should initialize from the persisted managerRailCollapsed client setting'
    );
    assert.ok(
      rootSource.includes('function toggleManagerRail()'),
      'root should expose a rail toggle handler'
    );
    assert.ok(
      rootSource.includes("services?.setSetting?.('managerRailCollapsed', railCollapsed);"),
      'toggling the rail should persist managerRailCollapsed through the setSetting seam'
    );
    // The DISPLAY value, never the stored one (issue 1213). `railCollapsed` is the GM's
    // persisted client preference and stays authoritative for what is written back; what the
    // body renders is `railCollapsed && !railLockedOpen`, so the Downtime rail lock can force
    // the sidebar open without permanently un-collapsing the rail on every other route.
    assert.ok(
      rootSource.includes(
        "class={`manager-body ${railCollapsedDisplay ? 'is-rail-collapsed' : ''}`}"
      ),
      'manager-body should bind the is-rail-collapsed modifier from the displayed rail state'
    );
    assert.ok(
      rootSource.includes(
        'const railCollapsedDisplay = $derived(railCollapsed && !railLockedOpen);'
      ),
      'and the displayed state must be DERIVED, never written back over the stored preference'
    );
    assert.ok(
      rootSource.includes('class="manager-rail-toggle manager-scope-collapse"'),
      'the scope-card header should render the shared collapse/expand control'
    );
    // COUNTED, not merely present (issue 1213 review). The control is written TWICE, once per
    // `{#if selectedSystem}` scope-card branch, and an `includes` check is satisfied by either
    // one alone — which is how deleting the lock attributes from the no-system branch survived
    // the whole suite. Both sites read the DISPLAYED state and both are inert under the lock.
    // `(?<![-\w])` because `aria-disabled={railLockedOpen}` CONTAINS `disabled={railLockedOpen}`,
    // so a plain substring count reports four sites for two and reads as a pass.
    const occurrences = (attribute) =>
      rootSource.match(new RegExp(`(?<![-\\w])${attribute.replace(/[{}]/g, '\\$&')}`, 'g'))
        ?.length ?? 0;
    const railToggleSites = occurrences('data-manager-rail-toggle');
    assert.equal(railToggleSites, 2, 'the scope card renders the rail toggle once per branch');
    for (const attribute of [
      'aria-pressed={railCollapsedDisplay}',
      'aria-label={railToggleLabel}',
      'title={railToggleTitle}',
      'disabled={railLockedOpen}',
      'aria-disabled={railLockedOpen}',
    ]) {
      assert.equal(
        occurrences(attribute),
        railToggleSites,
        `every rail-toggle site must carry ${attribute}, not just the one a mounted case renders`
      );
    }
    assert.match(
      rootSource,
      /function toggleManagerRail\(\)\s*\{[\s\S]{0,400}?if \(railLockedOpen\) return;/,
      'and the handler early-returns, so a programmatic call obeys the lock too'
    );
    assert.ok(
      rootSource.includes('FABRICATE.Admin.Manager.Nav.CollapseRail') &&
        rootSource.includes('FABRICATE.Admin.Manager.Nav.ExpandRail'),
      'rail toggle labels should be localized for both states'
    );
    assert.equal(lang.FABRICATE.Admin.Manager.Nav.CollapseRail, 'Collapse navigation rail');
    assert.equal(lang.FABRICATE.Admin.Manager.Nav.ExpandRail, 'Expand navigation rail');
    assert.ok(
      appSource.includes('getSetting: this._services.getSetting,') &&
        appSource.includes('setSetting: this._services.setSetting,'),
      'manager app should expose the setting seam to the Svelte component services'
    );
  });
});
