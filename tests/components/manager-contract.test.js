import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  calledName,
  identifierNames,
  literalStrings,
  walkNodes,
} from '../helpers/moduleAst.js';
import {
  componentAstOf,
  componentAstsIn,
  componentScopeOf,
  moduleAstOf,
  moduleAstsIn,
} from '../helpers/parsedSource.js';
import {
  attributeExpression,
  attributeNames,
  attributeValue,
  boundDirectives,
  carriesSpread,
  containsLiteral,
  declaredConstant,
  declaresAttribute,
  declaresProp,
  importsModule,
  passesProp,
  propDefault,
  propNone,
  readsGlobal,
  referencesIdentifier,
  rendersComponent,
  rendersElement,
  requiresProp,
  spelledLiterals,
  spellsLiteral,
} from '../helpers/svelteStructureContract.js';
import {
  CONTRACT_CLAIMS,
  attributeLiteral,
  attributeValues,
  callNames,
  callsWithLiteral,
  claimsAcross,
  claimsForComponent,
  claimsForFile,
  claimsOverCode,
  classMemberAst,
  classRenderedExpressions,
  comparedLiteral,
  constantLiteral,
  declaredConstantValue,
  defineStructureContract,
  labelOf,
  memberPaths,
  namedCodeAst,
  propLiteral,
  propertyAst,
  propertyValues,
  pushedRecord,
  recordAst,
  registersAHook,
  renderedNodes,
  returnedTextArguments,
  staticTextCalls,
  structureOf,
  templateNodes,
  templateSuffixes,
} from '../helpers/structureContract.js';
import { SHIPPED_LANG as lang } from '../helpers/manager/managerLocalization.js';
import { declaredManagerClasses } from '../helpers/manager/managerStylesheet.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dirname, '../..');

/** Every `.svelte` file in one directory, as the repo-relative paths a contract target takes. */
function componentPathsIn(dir) {
  return readdirSync(resolve(repoRoot, dir))
    .filter((entry) => entry.endsWith('.svelte'))
    .map((entry) => `${dir}/${entry}`);
}

function catalogValue(key) {
  return key.split('.').reduce((node, part) => node?.[part], lang);
}

function isChangedManagerEnvironmentLocalizationKey(key) {
  return (
    // The Knowledge surface's whole string tree is authored fresh in issue 785.
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

const APP_SHELL = 'src/ui/SvelteCraftingSystemManagerApp.svelte.js';
const MANAGER_SERVICES = 'src/ui/managerServices.js';
const KNOWLEDGE_SNAPSHOT = 'src/systems/knowledgeSnapshot.js';
const KNOWLEDGE_TARGETS = 'src/ui/svelte/apps/manager/knowledge/knowledgeTargets.js';
const MAIN = 'src/main.js';

/** Every module the entry composes; each carries the chunk-split claim in its own contract row. */
const BOOTSTRAP_MODULES = [
  'src/bootstrap/Fabricate.js',
  'src/bootstrap/bulkFacade.js',
  'src/bootstrap/companionFacade.js',
  'src/bootstrap/composeServices.js',
  'src/bootstrap/craftingFacade.js',
  'src/bootstrap/gatheringFacade.js',
  'src/bootstrap/gatheringRuntime.js',
  'src/bootstrap/hooks.js',
  'src/bootstrap/journalFacade.js',
  'src/bootstrap/journalOperations.js',
  'src/bootstrap/migrations.js',
  'src/bootstrap/publicApi.js',
  'src/bootstrap/socketRouter.js',
];
const MANAGER_ROOT = 'src/ui/svelte/apps/manager/CraftingSystemManagerRoot.svelte';
const MANAGER_EXTENSIONS = 'src/ui/managerExtensions.js';
const DOWNTIME_HOST = 'src/ui/svelte/apps/manager/downtime/WorldDowntimeExtensionHost.svelte';
const MANAGER_NAV_RAIL = 'src/ui/svelte/apps/manager/ManagerNavRail.svelte';
const NAV_RAIL_MODEL = 'src/ui/svelte/apps/manager/navRailModel.svelte.js';
const HEADER_MODEL = 'src/ui/svelte/apps/manager/headerModel.svelte.js';
const MANAGER_SYSTEM_NAV = 'src/ui/svelte/apps/manager/ManagerSystemNav.svelte';
const MANAGER_WORLD_NAV = 'src/ui/svelte/apps/manager/ManagerWorldNav.svelte';
const MANAGER_WORLD_DOWNTIME_NAV_GROUP =
  'src/ui/svelte/apps/manager/ManagerWorldDowntimeNavGroup.svelte';
// The rail's three entry units answer together for a claim over the entries they share; a claim
// narrowed to one of them would drop most of its population (issue 1717).
const MANAGER_NAV_UNITS = [MANAGER_SYSTEM_NAV, MANAGER_WORLD_NAV, MANAGER_WORLD_DOWNTIME_NAV_GROUP];
// The page header's copy is spelled across two units since issue 1720 — the shell's markup and the
// model it resolves from — so a key that must appear once appears once across the pair.
const headerCopyLiterals = () => [
  ...spelledLiterals(componentAstOf(MANAGER_ROOT)),
  ...literalStrings(moduleAstOf(HEADER_MODEL).ast),
];
const DOWNTIME_PREVIEW_PROVIDER =
  'src/ui/svelte/apps/manager/downtime/worldDowntimePreviewProvider.js';
const COMPONENTS_BROWSER = 'src/ui/svelte/apps/manager/ComponentsBrowserView.svelte';
const COMPONENT_ROW = 'src/ui/svelte/apps/manager/components/ComponentRow.svelte';
const COMPONENT_EDIT = 'src/ui/svelte/apps/manager/ComponentEditView.svelte';
const CRAFTING_SETTINGS = 'src/ui/svelte/apps/manager/CraftingSettingsView.svelte';
const ESSENCE_BROWSER = 'src/ui/svelte/apps/manager/EssenceBrowserView.svelte';
const ESSENCE_EDIT = 'src/ui/svelte/apps/manager/EssenceEditView.svelte';
// The GM Essence Studio's own components, which sit under `essences/` (issue 1036).
const ESSENCE_STUDIO = { dir: 'src/ui/svelte/apps/manager/essences' };
const LIBRARY_SHELF = 'src/ui/svelte/apps/manager/library/LibraryShelf.svelte';
const MODIFIER_CATALOGUE =
  'src/ui/svelte/apps/manager/checks/CraftingModifierCatalogueCard.svelte';
const RECIPES_BROWSER = 'src/ui/svelte/apps/manager/RecipesBrowserView.svelte';
// The library inspector, extracted out of the root (issue 643). It sits under `recipes/`, not
// `recipe/` — the latter is the recipe editor's screenshot-map glob.
const RECIPE_BROWSER_INSPECTOR =
  'src/ui/svelte/apps/manager/recipes/RecipeBrowserInspector.svelte';
const RESOLUTION_MODE_OPTIONS = 'src/ui/svelte/apps/manager/resolutionModeOptions.js';
const ROUTE_EXIT_GUARDS = 'src/ui/svelte/apps/manager/routeExitGuards.js';
const SYSTEMS_BROWSER = 'src/ui/svelte/apps/manager/SystemsBrowserView.svelte';
const SYSTEM_EDIT = 'src/ui/svelte/apps/manager/SystemEditView.svelte';
const TAGS_CATEGORIES = 'src/ui/svelte/apps/manager/TagsCategoriesView.svelte';
// The system screen's presentation model (issue 1915), the world screen's twin.
const SYSTEM_VOCABULARY = 'src/ui/svelte/apps/manager/systemVocabularyStudio.js';
const WORLD_CURRENCY = 'src/ui/svelte/apps/manager/world/WorldCurrencyTab.svelte';
const WORLD_MODIFIERS = 'src/ui/svelte/apps/manager/world/WorldModifiersTab.svelte';
// The world Tool entry, which took the linked-item card off the system editor (issue 1373).
const WORLD_TOOL_ENTRY = 'src/ui/svelte/apps/manager/scoped/WorldToolEntryPage.svelte';
const CHANCE_SLIDER = 'src/ui/svelte/components/ChanceSlider.svelte';
const ENVIRONMENT_EDIT = 'src/ui/svelte/apps/manager/EnvironmentEditView.svelte';
// The reward and event limit counts are one shared component (issue 1050).
const GATHERING_INSPECTOR_RAIL =
  'src/ui/svelte/apps/manager/environment/GatheringInspectorRail.svelte';
const GATHERING_RULES_INSPECTOR =
  'src/ui/svelte/apps/manager/environment/GatheringRulesInspector.svelte';
const GATHERING_TASK_INSPECTOR =
  'src/ui/svelte/apps/manager/environment/GatheringTaskInspector.svelte';
const GATHERING_RULE_STEPPER =
  'src/ui/svelte/apps/manager/environment/GatheringRuleLimitStepper.svelte';
const ENVIRONMENTS_BROWSER = 'src/ui/svelte/apps/manager/EnvironmentsBrowserView.svelte';
const GATHERING_ECONOMY = 'src/ui/svelte/apps/manager/GatheringEconomyView.svelte';
const GATHERING_TASK_EDIT = 'src/ui/svelte/apps/manager/GatheringTaskEditView.svelte';
const GATHERING_TASKS_BROWSER = 'src/ui/svelte/apps/manager/GatheringTasksBrowserView.svelte';
const MODIFIER_LIBRARY_ROW = 'src/ui/svelte/apps/manager/ModifierLibraryRow.svelte';
const SCOPED_VALIDATION_TAB = 'src/ui/svelte/apps/manager/scoped/ScopedValidationTab.svelte';
const TOOL_EDIT = 'src/ui/svelte/apps/manager/ToolEditView.svelte';
const TOOL_BREAKAGE = 'src/ui/svelte/apps/manager/tools/ToolBreakageTab.svelte';
const TOOL_EDITOR_TABS = 'src/ui/svelte/apps/manager/tools/ToolEditorTabs.svelte';
const TOOL_INHERIT_CARD = 'src/ui/svelte/apps/manager/tools/ToolInheritCard.svelte';
const TOOL_REQUIREMENTS = 'src/ui/svelte/apps/manager/tools/ToolRequirementsTab.svelte';
// The system-scope band that replaced the retired Overview tab (issue 1373).
const TOOL_SYSTEM_SCOPE = 'src/ui/svelte/apps/manager/tools/ToolSystemScopeCards.svelte';
const TOOL_VALIDATION = 'src/ui/svelte/apps/manager/tools/ToolValidationTab.svelte';
// The GM Knowledge surface (issue 785). `KnowledgeView` and the reusable `ArmedDangerButton` sit
// at the manager root; the rows and the pure projection live under `knowledge/`.
const KNOWLEDGE_VIEW = 'src/ui/svelte/apps/manager/KnowledgeView.svelte';
const ARMED_DANGER_BUTTON = 'src/ui/svelte/components/ArmedDangerButton.svelte';
const KNOWLEDGE_COPY_ROW = 'src/ui/svelte/apps/manager/knowledge/KnowledgeOwnedCopyRow.svelte';
const KNOWLEDGE_LEARNED_ROW = 'src/ui/svelte/apps/manager/knowledge/KnowledgeLearnedRow.svelte';
const KNOWLEDGE_STUDIO = 'src/ui/svelte/apps/manager/knowledge/knowledgeStudio.js';

/** The manager views a claim may hold of any one of, which the joined text used to ask of all. */
const MANAGER_VIEWS = [
  MANAGER_ROOT,
  COMPONENTS_BROWSER,
  COMPONENT_EDIT,
  ESSENCE_BROWSER,
  ESSENCE_EDIT,
  RECIPES_BROWSER,
  SYSTEMS_BROWSER,
  SYSTEM_EDIT,
  TAGS_CATEGORIES,
  'src/ui/svelte/apps/manager/EnvironmentEditView.svelte',
  'src/ui/svelte/apps/manager/EnvironmentsBrowserView.svelte',
  'src/ui/svelte/apps/manager/GatheringTaskEditView.svelte',
  'src/ui/svelte/apps/manager/GatheringTasksBrowserView.svelte',
  'src/ui/svelte/apps/manager/ToolsBrowserView.svelte',
  'src/ui/svelte/components/ChanceSlider.svelte',
];

describe('CraftingSystemManager source contract', () => {
  defineStructureContract(
    'injects the exact page-session manager extension registry into the Svelte root',
    APP_SHELL,
    { imports: ['./managerExtensions.js'] }
  );

  defineStructureContract(
    'hands that registry to the root beside the player one',
    { file: APP_SHELL, member: '_prepareSvelteProps' },
    { names: ['managerExtensions', 'playerExtensions'] }
  );

  defineStructureContract(
    'takes both registries as props and renders the Downtime host',
    MANAGER_ROOT,
    {
      declaresProp: ['store', 'services', 'managerExtensions', 'playerExtensions'],
      renders: ['WorldDowntimeExtensionHost'],
    }
  );

  // The rail renders the active tab set while the host is unmounted, so the shell owns the live
  // provider and the host takes it as a prop.
  defineStructureContract('keeps one owner of the active Downtime provider', MANAGER_ROOT, {
    callsWith: [['subscribe', 'WORLD_DOWNTIME_SURFACE_ID']],
  });

  defineStructureContract('leaves the Downtime host subscribing to nothing', DOWNTIME_HOST, {
    callsNo: ['subscribe'],
    callsWith: [['onProviderFault', 'activeProvider']],
  });

  defineStructureContract(
    'never enumerates the tab ids the registry will accept',
    MANAGER_EXTENSIONS,
    { namesNo: ['CORE_DOWNTIME_PREVIEW_TAB_IDS'] }
  );

  defineStructureContract(
    "publishes Core's preview tab ids beside its copy",
    DOWNTIME_PREVIEW_PROVIDER,
    { exports: ['CORE_DOWNTIME_PREVIEW_TAB_IDS'] }
  );

  // Root owns the rail label id, stated once; the host derives no id of its own (issue 1213).
  defineStructureContract(
    'owns the rail label id and threads it into the Downtime host',
    MANAGER_ROOT,
    {
      declares: ['downtimeNavLabelId'],
      spells: ['manager-downtime-nav-label-'],
      passesProps: [['WorldDowntimeExtensionHost', 'navLabelId']],
    }
  );

  // Required, with no default: a default would be the hand-maintained mirror this prop avoids —
  // a second copy of Root's literal, agreeing today and undetectable the day it stops.
  defineStructureContract(
    'names its region from the prop and carries no copy of the literal',
    DOWNTIME_HOST,
    { requiresProp: ['navLabelId'], spellsNo: ['manager-downtime-nav'] }
  );

  // What the `AC-11` to `AC-15` mounted cases cannot say is how many render sites exist: a third
  // one added outside the provider-mode guard would satisfy every one of them (issue 1302).
  it('renders the Downtime badge at exactly two sites', () => {
    const sites = templateNodes(componentAstOf(MANAGER_WORLD_DOWNTIME_NAV_GROUP))
      .filter((node) =>
        (node.attributes ?? []).some((attribute) =>
          String(attribute.name ?? '').startsWith('data-world-downtime-badge')
        )
      )
      .map((node) => node.name);
    assert.equal(
      sites.length,
      2,
      `the sub-item badge and the parent rollup, and nothing else (found ${sites.join(', ')})`
    );
  });

  // The companion is disposed before ApplicationV2 removes its Svelte target; that ordering is
  // asserted against the real class by `tests/components/manager-extension-composition.test.js`.

  // The window height is owned by `scripts/lib/foundryChromeSpec.js` and deep-equalled against the
  // real `DEFAULT_OPTIONS` by `tests/view-lab-app-options-parity.test.js`.
  defineStructureContract('self-registers as the sole crafting system manager app', APP_SHELL, {
    extendsCall: ['SvelteApplicationMixin'],
    callsWith: [['registerCraftingSystemManagerApp', 'SvelteCraftingSystemManagerApp']],
    namesNo: [
      'SvelteRecipeManagerApp',
      'openCurrentAdmin',
      'onEditSystem',
      'LAST_MANAGED_CRAFTING_SYSTEM',
    ],
  });

  // Deferred to its own chunk (issue 150): the static import matters by its absence.
  defineStructureContract('defers the GM-only manager subtree to a lazy chunk', MAIN, {
    importsNo: [
      './ui/SvelteRecipeManagerApp.svelte.js',
      './ui/SvelteCraftingSystemManagerApp.svelte.js',
    ],
    importsLazily: ['./ui/SvelteCraftingSystemManagerApp.svelte.js'],
    names: ['loadCraftingSystemManagerAppClass'],
  });

  // The thirteen `src/bootstrap/` modules the entry composes (issue 1715). `defineStructureContract`
  // runs its claims against ONE target, so each is its own row rather than an extension of the
  // entry's: a static manager import in any of them would defeat the chunk split as surely as one
  // here. The `../ui/…` spelling is the one that can occur a directory down.
  for (const module of BOOTSTRAP_MODULES) {
    defineStructureContract(
      `takes no static manager import in ${module.slice('src/bootstrap/'.length)}`,
      module,
      {
        importsNo: [
          '../ui/SvelteRecipeManagerApp.svelte.js',
          '../ui/SvelteCraftingSystemManagerApp.svelte.js',
        ],
      }
    );
  }

  it('lists every src/bootstrap module, so a new one cannot escape the chunk-split row', () => {
    assert.deepEqual(
      readdirSync(resolve(repoRoot, 'src/bootstrap'))
        .filter((file) => file.endsWith('.js'))
        .sort()
        .map((file) => `src/bootstrap/${file}`),
      [...BOOTSTRAP_MODULES].sort()
    );
  });

  // `Document#testUserPermission` short-circuits every GM to OWNER, so GMs are filtered first. No
  // other file states that `Users#players` is the roster this reads, so it stays asserted here.
  defineStructureContract('derives the access rosters from the non-GM roster', MANAGER_SERVICES, {
    reads: ['game.users.players'],
    calls: ['playerUsers'],
    readsNo: ['actor.isOwner'],
    namesNo: ['playedBy'],
  });

  // The fallback must agree with `Users#players` (`!u.isGM && u.hasRole('PLAYER')`).
  defineStructureContract(
    'falls back to the same role floor the canonical roster applies',
    { file: MANAGER_SERVICES, fn: 'playerUsers' },
    { calls: ['hasRole'], spells: ['PLAYER'], reads: ['globalThis.CONST.USER_ROLES.PLAYER'] }
  );

  defineStructureContract(
    'labels only the roles a grantable user can hold',
    { file: MANAGER_SERVICES, fn: 'userRoleLabel' },
    { spells: ['USER.RolePlayer'], spellsNo: ['RoleGamemaster'] }
  );

  defineStructureContract(
    'models "who plays this character" as a SET, with the whole-table case explicit',
    { file: MANAGER_SERVICES, fn: 'describeAccessActor' },
    {
      reads: ['actor.testUserPermission', 'user.character.id', 'actor.ownership.default'],
      names: ['controlledBy', 'sharedWithAllPlayers'],
      spells: ['OWNER'],
    }
  );

  defineStructureContract(
    'resolves granted character ids over every world actor',
    { file: MANAGER_SERVICES, fn: 'rosterServices', property: 'getAccessCharacterActors' },
    { namesNo: ['isPlayerCharacterActor'] }
  );

  defineStructureContract(
    'defines the world Item projection in the service set',
    { file: MANAGER_SERVICES, fn: 'actorProjectionServices' },
    { names: ['getWorldItemOptions'] }
  );

  defineStructureContract(
    'resolves a Tool source through the uuid seam, not the world roster',
    { file: MANAGER_SERVICES, fn: 'actorProjectionServices', property: 'resolveToolSource' },
    { calls: ['resolveItemSourceSnapshot'] }
  );

  defineStructureContract(
    'forwards Tool Item services from the internal service set into prepared Svelte props',
    { file: APP_SHELL, member: '_prepareSvelteProps', property: 'services' },
    { reads: ['this._services.getWorldItemOptions', 'this._services.resolveToolSource'] }
  );

  // Under the accessor name the adminStore's read and write legs already call (issue 1392).
  defineStructureContract(
    'hands the world VOCABULARY store to the manager, which nothing else can see',
    { file: MANAGER_SERVICES, fn: 'worldStoreServices', property: 'getVocabularyScopeStore' },
    { reads: ['game.fabricate.getVocabularyScopeStore'] }
  );

  // `updateActor` fires on every HP tick, so only the three keys that move a roster reproject it.
  defineStructureContract(
    'key-filters the noisy updateActor hook so an HP tick does not reproject',
    { file: APP_SHELL, member: '_registerUserHooks' },
    {
      hooks: ['updateActor', 'createActor', 'deleteActor'],
      diffKeys: [
        ['diff', 'ownership'],
        ['diff', 'name'],
        ['diff', 'img'],
      ],
      calls: ['refreshAccessRosters'],
    }
  );

  // The `fabricate.ready` one-shot is asserted byte-identically, and its deferred open replayed,
  // by `tests/components/manager-launch-readiness.test.js`.
  defineStructureContract(
    'guards manager startup against unready Fabricate services',
    { file: MANAGER_SERVICES, fn: 'readinessServices' },
    { names: ['isFabricateReady', 'onFabricateReady'] }
  );

  defineStructureContract(
    'defers a direct open, once, until Fabricate reports ready',
    { file: APP_SHELL, member: 'show' },
    { names: ['_pendingReadyOpen'], spells: ['StartupPending'] }
  );

  it('states the copy the loading and startup guards read', () => {
    assert.equal(lang.FABRICATE.Admin.Manager.LoadingSystems, 'Loading crafting systems...');
    assert.equal(
      lang.FABRICATE.Admin.Manager.StartupPending,
      'Fabricate is still loading. The crafting system manager will open when startup finishes.'
    );
  });

  defineStructureContract('loads the systems browser behind that guard', MANAGER_ROOT, {
    passesProps: [['SystemsBrowserView', 'systemsLoading']],
  });

  // What the titlebar renders is mounted; here are the derivation behind it and the
  // route-conditional negative the rail case cannot reach (issue 1185).
  defineStructureContract('drives the titlebar premium signal off the whole surface set', MANAGER_ROOT, {
    declares: ['premiumInstalled'],
    calls: ['subscribeSurfaceIds', 'routedOutcomeTierCount'],
    compares: ['routedByCheck'],
    spellsNo: ['Mythwright', 'mythwright', 'manager-route-icon'],
  });

  it('states the titlebar copy the premium mark and the outcome-tier label read', () => {
    assert.equal(
      lang.FABRICATE.Admin.Manager.Titlebar.SystemBadge,
      undefined,
      'the orphaned SystemBadge string should be deleted from lang/en.json, not left behind'
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
    assert.equal(
      lang.FABRICATE.Admin.Manager.Titlebar.OutcomeTiers,
      'outcome tiers',
      'lang should expose the pluralized outcome-tier label the titlebar formats'
    );
  });

  it('localizes the rail section label', () => {
    assert.equal(
      lang.FABRICATE.Admin.Manager.Nav.SectionLabel,
      'GM management',
      'the rail section label should be localized'
    );
  });

  // World scope, not per system (issue 1278). Every rendered half of this editor is driven by
  // `tests/components/world-currency-tab.test.js`; what stays is the drop pipeline behind the
  // macro zones, and two keys claimed in full because each has a longer neighbour.
  defineStructureContract('authors the world coin ladder on one page', WORLD_CURRENCY, {
    declaresProp: ['currencyValidationErrors'],
    declares: ['currencyHasProviders', 'currencyMacroMode', 'currencyUnitsReadOnly'],
    names: ['dragDrop'],
    calls: ['resolveDropData'],
    compares: ['Macro'],
    spellsExactly: [
      'FABRICATE.Admin.Manager.CurrencyUnits.MacroConversionHint',
      'FABRICATE.Admin.Manager.CurrencyUnits.ProviderManagedTitle',
    ],
    namesNo: ['inventoryMode'],
    spellsNo: ['data-world-currency-inventory-mode-select'],
  });

  // `passesProps` requires the `<WorldCurrencyTab>` call site to declare the prop, which is the
  // "on the tag itself" claim the sliced tag used to make, for the whole set at once. The
  // validation report is a three-link join: publish, derive, thread (issue 1493).
  defineStructureContract('threads the world currency profile and its report', MANAGER_ROOT, {
    passesProps: [
      ['WorldCurrencyTab', 'currencyUnits'],
      ['WorldCurrencyTab', 'currencySpendStrategy'],
      ['WorldCurrencyTab', 'currencyProviderId'],
      ['WorldCurrencyTab', 'currencyProviderOptions'],
      ['WorldCurrencyTab', 'currencyMacros'],
      ['WorldCurrencyTab', 'currencyValidationErrors'],
      ['WorldCurrencyTab', 'onAddCurrencySubUnit'],
      ['WorldCurrencyTab', 'onSetCurrencySpendStrategy'],
      ['WorldCurrencyTab', 'onSetCurrencyProvider'],
      ['WorldCurrencyTab', 'onSetCurrencyMacro'],
      ['WorldCurrencyTab', 'onClearCurrencyMacro'],
    ],
    declares: ['worldCurrencyValidation'],
    reads: ['$viewState.worldCurrencyValidation'],
    names: ['getCurrencyProvidersForFoundrySystem'],
    namesNo: ['onSetCurrencyInventoryMode'],
  });

  defineStructureContract(
    'derives the report from the published one',
    { file: MANAGER_ROOT, constant: 'currencyValidationErrors' },
    { reads: ['worldCurrencyValidation.errors'] }
  );

  // Formula-only since issue 1440: one labelled expression field, no provider leg. The key is
  // claimed in full, because `…Modifiers.ExpressionHint` next door satisfies a substring.
  defineStructureContract('authors a character modifier as a formula alone', WORLD_MODIFIERS, {
    renders: ['RollDataExpressionInput'],
    passesProps: [['RollDataExpressionInput', 'onChange']],
    calls: ['onUpdate'],
    spellsExactly: ['FABRICATE.Admin.Manager.Modifiers.Expression'],
    namesNo: ['ProviderExpressionInput', 'characterModifierProviderLabel'],
    spellsNo: ['manager-character-modifier-provider'],
  });

  // One shared row, not two: the Tool Studio's bonus picker draws it too (asserted beside its
  // own pins), so the catalogue's half of that claim is stated here. The two absent props are
  // read against the same rendered node the row claim resolves, so neither is vacuous.
  defineStructureContract(
    'draws the Checks Studio modifier catalogue with the shared library row, as it shipped',
    MODIFIER_CATALOGUE,
    {
      renders: ['ModifierLibraryRow'],
      passesPropsNo: [
        ['ModifierLibraryRow', 'controlPlacement'],
        ['ModifierLibraryRow', 'textLayout'],
      ],
    }
  );

  // `manager-rail` is `ManagerNavRail`'s own identity since issue 1717; `is-rail-collapsed` is
  // still the shell's, because it is on `.manager-body`.
  defineStructureContract('names the rail aside', MANAGER_NAV_RAIL, {
    attributes: [['class', 'manager-rail']],
  });

  // The shell's own chrome and the eight routes it mounts. `fabricate-manager` and
  // `data-manager-view` are not here: every route module reads them off the mounted shell
  // (`target.querySelector('.fabricate-manager').dataset.managerView`).
  defineStructureContract('renders the manager shell and the routes it hosts', MANAGER_ROOT, {
    attributes: [
      ['class', 'manager-header'],
      ['class', 'manager-breadcrumbs'],
      ['class', 'manager-inspector'],
    ],
    spells: ['is-rail-collapsed', 'manager-environment-edit-main'],
    renders: [
      'ManagerNavRail',
      'ComponentsBrowserView',
      'EnvironmentsBrowserView',
      'EssenceBrowserView',
      'EssenceEditView',
      'TagsCategoriesView',
      'EnvironmentEditView',
      'RecipesBrowserView',
      'SystemEditView',
      'SystemsBrowserView',
    ],
  });

  // `class="manager-empty"` is not in this set any more (issue 785).
  defineStructureContract('gives a browse route the same main column', MANAGER_VIEWS, {
    spells: ['manager-main', 'manager-filter'],
    spellsExactly: ['FABRICATE.Admin.Manager.Environment.EmptyTitle'],
    renders: ['ManagerToolbar', 'EmptyState'],
    imports: ['../../components/EmptyState.svelte'],
  });

  // What System Settings draws is driven by `tests/components/manager-systems-mounted.js`. The
  // relocated currency editor (issue 1278) is the absence this states: any of these markers
  // reappearing means the two scopes can disagree about one world's coins again.
  defineStructureContract('keeps the crafting system page to its own settings', SYSTEM_EDIT, {
    renders: ['SystemEditorTabs', 'SystemOverviewView'],
    declares: ['currencyEnabled'],
    reads: ['selectedSystem.requirements.currency.enabled'],
    names: ['onToggleCurrency'],
    compares: ['settings', 'validation'],
    spells: ['manager-system-workspace'],
    spellsExactly: [
      'FABRICATE.Admin.Manager.Feature.Currency',
      'FABRICATE.Admin.Manager.SystemEdit.FeatureHint.Currency',
    ],
    attributes: [['data-edit-control', 'advanced-options']],
    namesNo: ['currencyProviderOptions', 'onSetCurrencySpendStrategy', 'onAddCurrencyUnit'],
    spellsNo: [
      'manager-currency-unit-card',
      'data-system-currency-units',
      'data-system-currency-strategy-select',
      'data-system-currency-macros',
    ],
    writesNo: [
      'data-system-currency-units',
      'data-system-currency-strategy-select',
      'data-system-currency-macros',
    ],
  });

  defineStructureContract('threads both requirement toggles to the one store seam', MANAGER_ROOT, {
    callsWith: [['toggleRequirement', 'next']],
  });

  // Same-named systems are disambiguated through the shared helper (issue 346). The rows, their
  // identity buttons and the status switch are driven by the mounted systems and rail cases.
  // `<StatusToggle`, not the class literal (issue 1040): the row's switch renders through the
  // shared primitive, which is the only thing under `src/` that writes `manager-status-toggle`,
  // so a search for the class would read 0 while the control is present and correct.
  defineStructureContract('disambiguates same-named systems in the library', SYSTEMS_BROWSER, {
    declaresProp: ['systemsLoading', 'onToggleSystemEnabled'],
    imports: ['../../util/systemDisambiguation.js'],
    calls: ['buildSystemLabelMap', 'systemDisplayLabel'],
    renders: ['StatusToggle'],
  });

  // `foundry` is deliberately NOT in the set: the root reaches `globalThis.foundry.utils.parseUuid`
  // and `.agents/docs/foundry-and-architecture.md` requires it keep doing so.
  defineStructureContract('keeps presentational Svelte free of direct Foundry globals', MANAGER_ROOT, {
    readsNoGlobal: ['game', 'ui', 'Hooks', 'CONFIG'],
  });

  defineStructureContract(
    'uses manager localization keys rather than hard-coded copy',
    [MANAGER_ROOT, MANAGER_SYSTEM_NAV, HEADER_MODEL],
    {
      // In full: a substring claim is satisfied by `…Titlebar.Premium` next door. The mounted
      // cases render this copy, which `text(key, fallback)` still produces under a renamed key.
      spellsExactly: [
        'FABRICATE.Admin.Manager.Title',
        'FABRICATE.Admin.Manager.Soon',
        'FABRICATE.Admin.Manager.Titlebar.Premium',
      ],
      spellsNo: ['EncountersPlaceholderTitle', 'EncountersPlaceholderHint'],
    }
  );

  it('uses localized manager copy keys', () => {
    assert.ok(lang.FABRICATE.Admin.Manager, 'English localization should define manager copy');
    assert.equal(lang.FABRICATE.Admin.Manager.Title, 'Crafting systems');
    // `Nav.Components`, `Nav.Tools` and `Component.Title` are GONE (issue 1362). The three
    // system screens are titled `Component Rules` / `Essence Rules` / `Tool Rules` after the
    // prototype, and the relabel is the screen's name everywhere it names the SCREEN — the
    // rail entry, the page title, the breadcrumb crumb and the browser's `<main>` accessible
    // name — because a page titled `Component Rules` whose accessible name said `Components`
    // is the WCAG 2.5.3 Label in Name hazard. The old keys had no consumer left, so they are
    // deleted rather than left as orphans.
    assert.equal(lang.FABRICATE.Admin.Manager.Nav.ComponentRules, 'Component Rules');
    assert.equal(lang.FABRICATE.Admin.Manager.Nav.EssenceRules, 'Essence Rules');
    assert.equal(lang.FABRICATE.Admin.Manager.Nav.ToolRules, 'Tool Rules');
    assert.equal(lang.FABRICATE.Admin.Manager.Nav.Components, undefined);
    assert.equal(lang.FABRICATE.Admin.Manager.Nav.Tools, undefined);
    // `Nav.Essences` SURVIVES, and the difference is the point.
    assert.equal(lang.FABRICATE.Admin.Manager.Nav.Essences, 'Essences');
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
    assert.equal(lang.FABRICATE.Admin.Manager.Component.Title, undefined);
    assert.equal(
      lang.FABRICATE.Admin.Manager.Component.DropZoneTitle,
      'Drop items to add components'
    );
    assert.equal(lang.FABRICATE.Admin.Manager.Component.Origin, 'Origin');
    // `SourceOriginCompendium` — and `SourceOriginWorld` / `-Missing` / `-Unknown` with it.
    assert.equal(lang.FABRICATE.Admin.Manager.Component.SourceOriginCompendium, undefined);
    assert.equal(lang.FABRICATE.Admin.Manager.TagsCategories.Title, 'Tags & Categories');
    assert.equal(lang.FABRICATE.Admin.Manager.TagsCategories.Library, 'Tags & Categories');
    assert.equal(
      lang.FABRICATE.Admin.Manager.TagsCategories.GeneralReservedFeedback,
      'General is already available as the base category.'
    );
    assert.equal(lang.FABRICATE.Admin.Manager.Essence.Title, 'Essences');
    // `Essence.Library` / `Essence.LibraryHint` / `Essence.Kicker` are RETIRED with the
    // duplicate page header the browser used to render above the shell's own (issue 1036).
    assert.equal(lang.FABRICATE.Admin.Manager.Essence.EditTitle, 'Edit essence');
    assert.equal(lang.FABRICATE.Admin.Manager.Essence.EditBreadcrumb, 'Edit essence');
    // `CreateBreadcrumb` — and `Create`.
    assert.equal(lang.FABRICATE.Admin.Manager.Essence.CreateBreadcrumb, undefined);
    // `SourceAll` / `SourceLinkedFilter` / `SourceNone` / `SourceNeedsAttention` and the status
    // segment's `Status.All` are RETIRED with the two toolbar filters issue 1372's round-8 parity
    // pass removed; the orphan gate fails a key nothing references, so they left with them.
    assert.equal(lang.FABRICATE.Admin.Manager.Essence.SourceLinkedFilter, undefined);
    assert.equal(lang.FABRICATE.Admin.Manager.Essence.SourceNoneShort, 'None');
    assert.equal(
      lang.FABRICATE.Admin.Manager.Environment.GatheringTabs.EncountersTitle,
      'Gathering events'
    );
    assert.equal(
      lang.FABRICATE.Admin.Manager.Environment.GatheringTabs.EncountersHint,
      'Browse reusable events before attaching them to environments.'
    );
  });

  it('keeps changed manager and environment static localization fallbacks aligned with en.json', () => {
    const contractFiles = [
      MANAGER_ROOT,
      ENVIRONMENT_EDIT,
      ENVIRONMENTS_BROWSER,
      KNOWLEDGE_VIEW,
      ARMED_DANGER_BUTTON,
      ...componentPathsIn('src/ui/svelte/apps/manager/environment'),
      ...componentPathsIn('src/ui/svelte/apps/manager/knowledge'),
    ];
    const failures = [];

    for (const file of contractFiles) {
      for (const { key, fallback } of staticTextCalls(componentAstOf(file))) {
        if (!isChangedManagerEnvironmentLocalizationKey(key)) continue;
        const value = catalogValue(key);
        if (typeof value !== 'string') {
          failures.push(`${file}: missing ${key}`);
        } else if (value !== fallback) {
          failures.push(`${file}: ${key} fallback "${fallback}" does not match en.json "${value}"`);
        }
      }
    }

    assert.deepEqual(failures, []);
  });

  // The v2 route replaced a launch into the legacy admin (issue 429). Saving, the row status
  // switch and the feature toggles are driven by `tests/components/manager-systems-mounted.js`;
  // what stays is the dead wiring's absence and the callbacks the root threads to the page.
  defineStructureContract('routes system Edit to the in-place v2 edit view', MANAGER_ROOT, {
    assigns: [['activeView', 'system-edit']],
    reads: ['store.setResolutionMode', 'store.toggleFeature'],
    namesNo: ['openLegacySystemSettings'],
    readsNo: ['services.onEditSystem', 'store.toggleAdvancedOptions'],
    spellsNo: ['Edit details'],
  });

  // Asked of the whole manager view set, because the action and the save live on two of its
  // pages: "in at least one of these", stated once.
  defineStructureContract('saves system details through the admin store', MANAGER_VIEWS, {
    spellsExactly: ['FABRICATE.Admin.Manager.EditSystem'],
    reads: ['store.saveSystemDetails'],
    callsWith: [['setResolutionMode', 'nextMode']],
  });

  // The three legacy toggles are gone from the feature table, which is the only place a
  // `storeKey` is written.
  defineStructureContract('reintroduces none of the legacy system toggles', SYSTEM_EDIT, {
    propertyNo: [
      ['storeKey', 'complexRecipes'],
      ['storeKey', 'craftingChecks'],
      ['storeKey', 'outcomeRouting'],
    ],
  });

  it('renames the recipe resolution-mode legend and states the salvage copy', () => {
    assert.equal(lang.FABRICATE.Admin.SystemSettings.ResolutionMode, 'Recipe resolution mode');
    for (const key of [
      'SalvageResolutionMode',
      'SalvageResolutionModeHint',
      'SalvageResolutionSimple',
      'SalvageResolutionSimpleDesc',
      'SalvageResolutionProgressive',
      'SalvageResolutionProgressiveDesc',
      'SalvageResolutionRouted',
      'SalvageResolutionRoutedDesc',
    ]) {
      const value = lang.FABRICATE.Admin.SystemSettings[key];
      assert.equal(typeof value, 'string', `SystemSettings.${key} should be a string`);
      assert.ok(value.length > 0, `SystemSettings.${key} should be non-empty`);
    }
  });

  // The salvage card's own hooks, which reach `RadioCardGroup` as prop values since issue 1509
  // folded the `ResolutionModeCard` shim away.
  defineStructureContract('draws a salvage resolution card of its own', CRAFTING_SETTINGS, {
    declaresProp: ['onSetSalvageResolutionMode'],
    attributes: [
      ['legend', 'Salvage resolution mode'],
      ['cardId', 'manager-crafting-salvage-resolution-mode'],
      ['groupName', 'manager-crafting-salvage-resolution-mode'],
      ['dataAttr', 'data-crafting-salvage-resolution-mode'],
      ['optionDataAttr', 'data-crafting-salvage-resolution-mode-option'],
    ],
  });

  // The recipe card's own legend fallback, stated apart from the salvage card's.
  defineStructureContract('keeps the recipe card legend beside it', CRAFTING_SETTINGS, {
    attributes: [['legend', 'Recipe resolution mode']],
  });

  // Salvage has exactly one ingredient, so ingredient-set routing is meaningless and `alchemy`
  // is not offered; the narrowing to the salvage binding is what keeps that absence honest,
  // because the recipe list beside it does offer alchemy.
  defineStructureContract(
    'offers salvage every resolution except the ingredient-set ones',
    { file: RESOLUTION_MODE_OPTIONS, constant: 'salvageResolutionModeOptions' },
    { spellsExactly: ['simple', 'progressive', 'routed'], spellsExactlyNo: ['alchemy'] }
  );

  // The two retired persistence tokens, across the whole module: neither list may offer them.
  defineStructureContract(
    'retires the legacy mapped and tiered persistence values',
    RESOLUTION_MODE_OPTIONS,
    { spellsExactlyNo: ['mapped', 'tiered'] }
  );

  defineStructureContract('threads the salvage persistence callback', MANAGER_ROOT, {
    reads: ['store.setSalvageResolutionMode'],
    passesProps: [['CraftingSettingsView', 'onSetSalvageResolutionMode']],
  });

  // The task owns its resolution mode; the inert gathering economy offers no authoring selector
  // for one. `resolutionMode={gatheringTaskResolutionMode}` is stated by the task-library contract
  // below, which owns every prop the root threads into this editor.
  defineStructureContract(
    'offers no resolution mode on the inert gathering economy',
    GATHERING_ECONOMY,
    { writesNo: ['data-gathering-resolution-mode'], spellsNo: ['data-gathering-resolution-mode'] }
  );

  defineStructureContract(
    'authors straight, d100 and routed on each task, all three selectable',
    { file: GATHERING_TASK_EDIT, constant: 'resolutionModeOptions' },
    {
      property: [
        ['value', 'straight'],
        ['value', 'd100'],
        ['value', 'routed'],
      ],
      // Dormant progressive is not offered, and none of the three authored modes is disabled.
      propertyNo: [['value', 'progressive']],
      keysNo: ['disabled'],
    }
  );

  defineStructureContract(
    'reuses the shared radio cards for the task mode, and patches the task, not the event',
    { file: GATHERING_TASK_EDIT, fn: 'setTaskResolutionMode' },
    { callsWith: [['onUpdateTask', 'mode']], keys: ['resolutionMode'] }
  );

  it('renames the standalone overview page and retires the keys it replaced', () => {
    assert.equal(
      lang.FABRICATE.Admin.Manager.SystemEdit.Summary,
      undefined,
      'the legacy Summary key is removed'
    );
    assert.equal(
      lang.FABRICATE.Admin.Manager.SystemEdit.Nav,
      'System Overview',
      'the nav item is renamed System Overview'
    );
    assert.equal(
      lang.FABRICATE.Admin.Manager.SystemEdit.PageBreadcrumb,
      'System Overview',
      'and the breadcrumb tail keeps the route name'
    );
    assert.equal(
      lang.FABRICATE.Admin.Manager.SystemEdit.PageTitle,
      undefined,
      'the page-title key is retired: the heading is the record, not a localized route name'
    );
  });

  // The heading is the selected system's name, falling back to the route name only when nothing
  // is selected, rather than rendering an empty heading (#429).
  defineStructureContract('titles the page after the record it edits', [MANAGER_ROOT, MANAGER_SYSTEM_NAV], {
    reads: ['selectedSystem.name'],
    spellsExactly: [
      'FABRICATE.Admin.Manager.SystemEdit.Nav',
      'FABRICATE.Admin.Manager.SystemEdit.PageBreadcrumb',
    ],
    spellsNo: ['SystemEdit.Summary', 'SystemEdit.PageTitle'],
    writes: ['data-nav-system-edit'],
    writesNo: ['data-nav-system-overview'],
    names: ['systemOverviewCount'],
    assignsNo: [['activeView', 'system-overview']],
  });

  defineStructureContract(
    'folds a stale overview token into the system-edit page',
    { file: MANAGER_ROOT, fn: 'normalizedActiveView' },
    { returnsFor: [['system-overview', 'system-edit']] }
  );

  // The page is a full-width tabbed shell mirroring the environment editor: the aside is skipped
  // and the column released. The registry entry is the one place that decision is recorded, and
  // `tests/manager-full-width-gate.test.js` is what holds it to the stylesheet.
  defineStructureContract(
    'releases the inspector column for the tabbed overview page',
    { file: MANAGER_ROOT, constant: 'FULL_WIDTH_VIEWS', record: ['id', 'system-edit'] },
    { property: [['layoutClass', 'full-width-2-track']] }
  );

  // Deleting the six per-route page headers moved the eyebrow up rather than removing it, so the
  // shell resolves one per route (issue 1515). What the old "no kicker" clauses were protecting —
  // that an eyebrow must not restate the title — is stated positively here.
  defineStructureContract('resolves the page eyebrow per route, beside the title', HEADER_MODEL, {
    names: ['viewKicker'],
    calls: ['viewKicker'],
  });

  defineStructureContract(
    'gives system-edit no eyebrow, and resolves none from a route title',
    { file: HEADER_MODEL, fn: 'viewKicker' },
    { spellsExactlyNo: ['system-edit'], callsNo: ['viewTitle'] }
  );

  // Issue 745: the Crafting group is unconditional (v1.3 headline), so the recipes-route
  // experimental gate is gone and the disabled Recipes placeholder with it. Essences and Tags are
  // real routes now, which is why neither may reappear in the placeholder list either.
  defineStructureContract(
    'derives the placeholder rail from selection and feature gates',
    [MANAGER_ROOT, MANAGER_SYSTEM_NAV],
    {
    names: ['visiblePlaceholderViews', 'selectSystemAndShowBrowser'],
    declares: ['experimentalFeaturesEnabled'],
    reads: ['$viewState.experimentalFeaturesEnabled'],
    assigns: [['activeView', 'essence-edit']],
    callsLiteral: [
      ['setView', 'essences'],
      ['setView', 'tags'],
    ],
    namesNo: ['recipesRouteEnabled', 'recipesAvailable', 'clearSelectedSystem', 'openCurrentAdmin'],
    // Systems is reached from the scope card, never as a left-rail tab, and the rail card never
    // clears the real store selection.
    callsLiteralNo: [
      ['setView', 'systems'],
      ['selectSystem', ''],
    ],
    }
  );

  defineStructureContract(
    'advertises the Graph placeholder as the only one, behind the experimental toggle',
    { file: MANAGER_SYSTEM_NAV, constant: 'placeholderViews' },
    {
      property: [
        ['id', 'graph'],
        // The rail id as a complete literal rather than a `manager-nav-${view.id}` template.
        ['navId', 'manager-nav-graph'],
        ['icon', 'fas fa-project-diagram'],
      ],
      propertyNo: [
        ['id', 'recipes'],
        ['id', 'essences'],
        ['id', 'tags'],
      ],
    }
  );

  defineStructureContract(
    'and gates it on the experimental toggle rather than on a system feature',
    { file: MANAGER_SYSTEM_NAV, fn: 'isViewAvailableForSystem' },
    { compares: ['graph'], names: ['experimentalFeaturesEnabled'] }
  );

  // The rail card selects (issue 643): the static name span, the x clear icon and the inline count
  // cluster are retired rather than merely hidden.
  defineStructureContract(
    'renders the selected system in a rail card that selects',
    MANAGER_NAV_RAIL,
    {
    writes: ['data-manager-scope-select', 'data-manager-rail-section'],
    spells: ['manager-scope-return'],
    spellsExactly: [
      'manager-scope-card',
      'FABRICATE.Admin.Manager.AllCraftingSystems',
      'FABRICATE.Admin.Manager.ReturnToSystemLibrary',
    ],
    spellsNo: [
      'manager-scope-name',
      'manager-scope-clear',
      'manager-count-cluster',
      'SystemEdit.EditBadge',
      'FABRICATE.Admin.Manager.Workspace',
      'FABRICATE.Admin.Manager.QuickActions',
    ],
    }
  );

  // Three claims a whole-file search cannot make: which element carries which hook, what order two
  // rail regions render in, and that the gathering parent takes no selected-pill class.
  it('labels the rail before the scope card', () => {
    const nodes = templateNodes(componentAstOf(MANAGER_NAV_RAIL));
    const label = nodes.findIndex((node) =>
      declaresAttribute(node, 'data-manager-rail-section', { directives: false })
    );
    const block = nodes.findIndex((node) => attributeValue(node, 'class') === 'manager-rail-block');
    assert.ok(label >= 0 && block >= 0, 'both rail regions still render');
    assert.ok(label < block, 'GM management labels the rail before the crafting-system scope card');
  });

  it('keeps Import on the library header', () => {
    const nodes = templateNodes(componentAstOf(MANAGER_ROOT));
    // The legacy system-library header rendered an admin launch button beside Import, so the
    // `openCurrentAdmin` absence above is vacuous against a header that no longer exists.
    const [importButton] = nodes.filter((node) =>
      declaresAttribute(node, 'data-manager-import-system', { directives: false })
    );
    assert.ok(Boolean(importButton), 'the system library header still renders Import');
    assert.equal(importButton.name, 'ManagerButton', 'through the shared button primitive');
    assert.equal(attributeExpression(importButton, 'onclick')?.name, 'importSystem');

  });

  // A universal over every composition site, which is why it reads all three entry units: the
  // sites are spread across them and narrowing it to one would drop most of its population.
  it('never takes the selected pill class from the route a nav parent groups', () => {
    const parentClasses = MANAGER_NAV_UNITS.flatMap((file) =>
      [...walkNodes(componentAstOf(file).fragment)].filter(
        (node) =>
          node.type === 'TemplateLiteral' &&
          literalStrings(node).some((literal) => literal.includes('manager-nav-parent'))
      )
    );
    assert.ok(parentClasses.length > 0, 'the gathering parent still composes its class');
    assert.ok(
      parentClasses.every((node) => !identifierNames(node).has('isGatheringRoute')),
      'and does not take the selected pill class from the route it groups'
    );
  });

  // The gathering rail is one submenu group with its own expand/collapse control and a rollup
  // count summarising the three sections beneath it.
  defineStructureContract('groups the gathering sections into a rail submenu', MANAGER_SYSTEM_NAV, {
    spells: ['manager-nav-group '],
    // The member path the unit reads through its `navRail` prop, which is what replaced the
    // root's own `railGroupExpanded` (issue 1717).
    reads: ['navRail.expanded.gathering'],
    spellsExactly: [
      'manager-nav-submenu',
      'manager-nav-toggle',
      'is-expanded',
      'FABRICATE.Admin.Manager.Nav.ExpandGathering',
      'FABRICATE.Admin.Manager.Nav.CollapseGathering',
    ],
  });

  // The tab the submenu reads is still the shell's; the placeholder it routes into moved to the
  // gathering inspector rail with issue 1707, whose own contract claims the write.
  defineStructureContract("keeps the gathering rail's active tab on the shell", MANAGER_ROOT, {
    names: ['activeGatheringTab'],
  });

  defineStructureContract(
    'counts each gathering section for its own rail entry',
    { file: MANAGER_ROOT, constant: 'gatheringNavCounts' },
    { keys: ['environments', 'tasks', 'encounters', 'total'] }
  );

  // Narrowed to `total`, because the three lengths are each read for their own section beside it:
  // asked of the whole derivation, a rollup that had dropped one would still answer yes.
  defineStructureContract(
    'and summarises environments, tasks and events in the parent rollup',
    { file: MANAGER_ROOT, constant: 'gatheringNavCounts', property: 'total' },
    {
      reads: [
        'environmentList.length',
        'gatheringTaskDefinitions.length',
        'gatheringEventDefinitions.length',
      ],
    }
  );

  defineStructureContract(
    'derives the reusable event count from the selected gathering config',
    { file: MANAGER_ROOT, constant: 'gatheringEventDefinitions' },
    { reads: ['selectedGatheringSystemConfig.events'] }
  );

  defineStructureContract(
    'owns the gathering tab state for inspector coordination',
    { file: MANAGER_ROOT, constant: 'activeGatheringTab' },
    { spellsExactly: ['environments'] }
  );

  // The gathering page renders no section tabs of its own: the rail owns that hierarchy, and the
  // page reports the tab it was given back to the root.
  defineStructureContract('reports gathering tab changes to the root', ENVIRONMENTS_BROWSER, {
    defaults: [['activeGatheringTab', 'environments']],
    callsWith: [
      ['onSelectGatheringTab', 'tabId'],
      ['onEditEnvironment', 'environment'],
      ['onDuplicateEnvironment', 'environment'],
      ['onDeleteEnvironment', 'environment'],
    ],
    callsLiteral: [
      ['selectGatheringTab', 'tasks'],
      ['selectGatheringTab', 'encounters'],
    ],
    spellsExactly: [
      'manager-environment-action-grid',
      'FABRICATE.Admin.Manager.Environment.GatheringTabs.TasksHint',
    ],
    spellsNo: ['manager-gathering-tabs'],
  });

  // The empty-state inspectors route the GM to the missing building block and to the published
  // docs, rather than restating the row actions beside them.
  defineStructureContract('routes every empty setup inspector to its own next step', MANAGER_ROOT, {
    // The URLs in full: a substring claim on the essences page is satisfied by the
    // effect-transfer URL one card away, which leaves a moved link green.
    spellsExactly: [
      'FABRICATE.Admin.Manager.EmptySetup.Title',
      'FABRICATE.Admin.Manager.Component.EmptySetup.Title',
      'FABRICATE.Admin.Manager.Essence.EmptySetup.Title',
      'https://mistersilver-uk.github.io/fabricate/help/quickstart',
      'https://mistersilver-uk.github.io/fabricate/components/',
      'https://mistersilver-uk.github.io/fabricate/essences',
    ],
  });

  // Read off the one node: `setView('components')` is satisfied by another button entirely.
  it('routes the empty-setup Add components action to the components route', () => {
    const [inspector] = templateNodes(componentAstOf(MANAGER_ROOT)).filter((node) =>
      declaresAttribute(node, 'onAddComponents', { directives: false })
    );
    assert.ok(Boolean(inspector), 'the empty recipes inspector still offers Add components');
    assert.ok(
      callsWithLiteral(attributeExpression(inspector, 'onAddComponents'), ['setView', 'components']),
      'and it routes to the components library'
    );
    assert.ok(
      memberPaths(attributeExpression(inspector, 'componentCount')).includes(
        'selectedCounts.components'
      ),
      'beside the count that decides whether it renders'
    );
  });

  it('keeps the environment and task action keys to their header aria labels alone', () => {
    const spelled = headerCopyLiterals();
    for (const key of [
      'FABRICATE.Admin.Manager.Environment.Actions',
      'FABRICATE.Admin.Manager.Environment.Tasks.Actions',
    ]) {
      assert.equal(
        spelled.filter((literal) => literal === key).length,
        1,
        `${key} is the header label, not a second inspector card heading beside it`
      );
    }
  });

  it('states the rail, empty-setup and gathering-tab copy those routes read', () => {
    assert.equal(
      lang.FABRICATE.Admin.Manager.SystemLibraryHint,
      'Select a row to view counts and enabled features.'
    );
    assert.equal(
      lang.FABRICATE.Admin.Manager.InspectorHint,
      'The inspector shows counts, resolution mode, and enabled features for the selected system.'
    );
    assert.equal(lang.FABRICATE.Admin.Manager.EmptySetup.Title, 'Set up your first system');
    assert.equal(lang.FABRICATE.Admin.Manager.EmptySetup.Quickstart, 'Quickstart');
    assert.equal(lang.FABRICATE.Admin.Manager.EmptySetup.Docs, 'Docs');
    assert.equal(
      lang.FABRICATE.Admin.Manager.Environment.EmptyTitle,
      'Prepare gathering building blocks first'
    );
    assert.equal(
      lang.FABRICATE.Admin.Manager.Environment.EmptyHint,
      'Define gathering tasks and events before creating environments, then attach those building blocks to each location players can gather from.'
    );
    assert.equal(lang.FABRICATE.Admin.Manager.Environment.GatheringTabs.Label, 'Gathering sections');
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
    assert.equal(lang.FABRICATE.Admin.Manager.Environment.GatheringTabs.OpenEvents, 'Review events');
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
    assert.equal(lang.FABRICATE.Admin.Manager.Recipe.EmptySetup.Title, 'Set up recipes');
    assert.equal(
      lang.FABRICATE.Admin.Manager.Recipe.EmptySetup.NoComponentsHint,
      'Add components before creating recipes so ingredients, tools, and results have reusable items to reference.'
    );
    assert.equal(lang.FABRICATE.Admin.Manager.Recipe.EmptySetup.AddComponents, 'Add components');
    assert.equal(lang.FABRICATE.Admin.Manager.Recipe.EmptySetup.RecipeDocs, 'Recipe docs');
    assert.equal(lang.FABRICATE.Admin.Manager.Component.EmptySetup.Title, 'Set up components');
    assert.equal(lang.FABRICATE.Admin.Manager.Component.EmptySetup.ComponentDocs, 'Component docs');
    assert.equal(lang.FABRICATE.Admin.Manager.Essence.EmptySetup.Title, 'Set up essences');
    assert.equal(lang.FABRICATE.Admin.Manager.Essence.EmptySetup.EssenceDocs, 'Essence docs');
  });

  // Every one of the nine store delegations this block used to pin as root text is driven by
  // `tests/components/manager-tags-mounted.js`, which clicks the real control and reads the call
  // back off the store double; what stays is the route's own shape.
  defineStructureContract('routes tags and categories to its own focused page', MANAGER_ROOT, {
    imports: ['./TagsCategoriesView.svelte'],
  });

  defineStructureContract('owns the vocabulary wiring on that page', TAGS_CATEGORIES, {
    declaresProp: ['onRemoveCategory', 'onRemoveComponentCategory', 'onSetComponentCategoryIcon'],
    renders: ['VocabularyShell', 'VocabularyShellPanel'],
    readsNoGlobal: ['game', 'ui', 'Hooks', 'CONFIG'],
  });

  // The copy and the hint machines moved OUT of the view at issue 1915: it states no vocabulary
  // string of its own any more, so the key that pinned the reserved-bucket refusal is re-pointed
  // at the presentation model that now spells it.
  defineStructureContract('states the system vocabulary copy in its own model', SYSTEM_VOCABULARY, {
    spellsExactly: ['FABRICATE.Admin.Manager.TagsCategories.GeneralReservedFeedback'],
  });

  // What the browser renders — the rows, the disabled marker, the capability pills, the usage
  // counts, the row toggle and the absent action band — is driven by
  // `tests/components/manager-essences-mounted.js`. What stays is the seam and what was deleted.
  defineStructureContract('keeps essence browsing browser-only', ESSENCE_BROWSER, {
    declaresProp: ['onEditEssence', 'showSourceUi', 'browserState'],
    spellsExactly: ['data-essence-membership-filter'],
    namesNo: ['onUpdateEssence'],
    spellsNo: [
      'manager-essence-edit-row',
      'manager-essence-create-name',
      'manager-essence-source-cell-image',
      'data-essence-source-filter',
      'data-essence-status-filter',
    ],
    attributesNo: [['role', 'columnheader']],
  });

  // A card row has no columns, so the paginated rows are a real list on the shared shelf.
  defineStructureContract('renders those rows on the shared studio shelf', LIBRARY_SHELF, {
    attributes: [['role', 'list']],
  });

  defineStructureContract('routes essence editing to its own page', MANAGER_ROOT, {
    imports: ['./EssenceEditView.svelte'],
    declares: ['showEssenceSourceUi'],
    names: ['essenceBrowserState'],
    compares: ['essence-edit'],
    passesProps: [['EssenceBrowserView', 'browserState']],
    renders: ['EssenceBrowserInspector', 'EssenceBulkEditPanel'],
    spellsExactly: ['manager-essence-edit-form', 'data-essence-edit-save'],
    writesNo: ['data-essence-action'],
  });

  // Criterion 23: the guard compares the essence and not only the view token, so re-entering the
  // editor for the same essence skips the prompt and switching to another one does not.
  defineStructureContract(
    'skips a same-essence route exit rather than a same-token one',
    { file: ROUTE_EXIT_GUARDS, record: ['view', 'essence-edit'] },
    { property: [['skip', 'subject']] }
  );

  defineStructureContract(
    'and names the essence that subject is, or the comparison compares nothing',
    { file: MANAGER_ROOT, constant: 'routeExitGuards', property: 'essence-edit' },
    { names: ['activeView', 'selectedEssenceId'], compares: ['essence-edit'] }
  );

  defineStructureContract(
    'and supplies the target id, or that comparison can never be true',
    { file: MANAGER_ROOT, fn: 'editEssence' },
    { callsWith: [['confirmRouteExit', 'essenceId']], spellsExactly: ['essence-edit'] }
  );

  defineStructureContract('authors an essence on that page and nowhere else', ESSENCE_EDIT, {
    declaresProp: ['showSourceUi', 'onDirtyChange', 'onSave'],
    calls: ['onDirtyChange', 'onSave'],
    attributes: [['id', 'manager-essence-edit-form']],
    namesNo: ['EditKicker'],
    spellsNo: ['IconClassHint'],
    readsNoGlobal: ['game'],
  });

  // `duplicate` is not in this set (issue 1372), and the armed bulk delete is a deliberate
  // deviation from the `AGENTS.md` dialog carve-out.
  defineStructureContract('extracts the inspector and its bulk panel', ESSENCE_STUDIO, {
    imports: [
      '../../../components/IconPicker.svelte',
      '../../../components/EssenceSourceSelector.svelte',
    ],
    renders: ['BulkDeleteCard'],
    attributes: [
      ['data-essence-action', 'edit'],
      ['data-essence-action', 'delete'],
      ['data-essence-action', 'copy-source'],
      ['data-essence-action', 'unlink-source'],
    ],
    attributesNo: [['data-essence-action', 'duplicate']],
  });

  defineStructureContract(
    'wires the production essence discard confirmation through the dialog seam',
    { file: APP_SHELL, member: '_prepareSvelteProps', property: 'confirmDiscardEssenceDraft' },
    { calls: ['confirmDialog'] }
  );

  defineStructureContract(
    'guards the manager window close on the essence draft, except under a forced teardown',
    { file: APP_SHELL, member: 'close' },
    { names: ['canCloseEssence'], reads: ['options.force'] }
  );

  defineStructureContract(
    'accepts the route dirty guard the essence editor registers',
    { file: APP_SHELL, member: '_prepareSvelteProps' },
    { names: ['registerEssenceDirtyGuard'] }
  );

  it('states the essence discard copy the confirmation reads', () => {
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
  });

  // What the library draws is driven by `tests/components/recipes-browser-view-mounted.test.js`,
  // which acts on real rows in the browser and the inspector alike. What stays is the wiring
  // behind them, and the shapes those cases would still pass without.
  defineStructureContract('draws the recipe library as a list of cards', RECIPES_BROWSER, {
    declaresProp: ['browserState'],
    names: ['createRecipeBrowserState'],
    imports: ['../../components/Chip.svelte'],
    calls: ['deriveRecipeStatuses', 'statusChipTone'],
    renders: ['StatusToggle', 'IconButton'],
    spells: ['manager-recipes-table', 'manager-recipe-table-head'],
    spellsExactly: ['FABRICATE.Admin.Manager.Recipe.Column.Recipe'],
    attributes: [['role', 'list']],
    attributesNo: [
      ['role', 'table'],
      ['type', 'checkbox'],
    ],
    // The narrower predicate the pills were moved off, and the save that lives in the root.
    readsNo: ['recipe.incomplete'],
    namesNo: ['saveRecipe'],
  });

  // The aside moved into the extracted inspector (issue 643), which is one column on the panel
  // background rather than five nested cards.
  defineStructureContract('answers what a recipe needs and makes', RECIPE_BROWSER_INSPECTOR, {
    declaresProp: ['onEdit', 'componentCount'],
    calls: ['buildRecipeRequirementRows', 'buildRecipeProduceRows'],
    spells: [
      'manager-recipe-browser-inspector-delete',
      'https://mistersilver-uk.github.io/fabricate/crafting/recipes/',
    ],
    spellsExactly: ['FABRICATE.Admin.Manager.Recipe.EmptySetup.Title'],
    spellsNo: ['manager-inspector-card', 'Recipe.Details'],
  });

  // Both routes into the editor, and the two header actions that are not on this header.
  defineStructureContract('routes recipe editing from the row and the inspector', MANAGER_ROOT, {
    passesProps: [
      ['RecipeBrowserInspector', 'onEdit'],
      ['RecipesBrowserView', 'onEditRecipe'],
    ],
    names: ['editRecipe', 'backToRecipesBrowse'],
    spellsExactly: ['recipe-edit'],
    namesNo: ['importRecipes', 'exportRecipes'],
    spellsNo: ['required station'],
  });

  // A card row has no columns (issue 676): the browser is a real list and the row is its item, so
  // neither file may reintroduce the table scaffolding. Read off the rendered attribute rather
  // than the file text, which both files' own prose legitimately mentions.
  const TABLE_ROLES = Object.freeze([
    ['role', 'table'],
    ['role', 'row'],
    ['role', 'columnheader'],
    ['role', 'cell'],
  ]);

  defineStructureContract('draws the component library as a list of rows', COMPONENTS_BROWSER, {
    renders: ['ComponentRow'],
    attributes: [['role', 'list']],
    attributesNo: TABLE_ROLES,
  });

  // The `<li>` needs no explicit `listitem`; the anchor that keeps the negatives honest is the
  // row's own class, which is what the mounted browser cases query it by.
  defineStructureContract('draws a component row as one of that list', COMPONENT_ROW, {
    attributes: [['class', 'manager-component-row']],
    attributesNo: TABLE_ROLES,
  });

  // The store wiring behind this route — search, drop import, delete, copy-source and the legacy
  // editor it no longer launches — is driven by `tests/components/manager-components-mounted.js`,
  // which clicks each control on the real route. What stays is what nothing renders.
  defineStructureContract('invents no component facts the store does not publish', MANAGER_ROOT, {
    namesNo: ['usageCount'],
    spellsNo: ['stale source'],
  });

  defineStructureContract('edits a component in place rather than in the legacy app', MANAGER_ROOT, {
    imports: ['./ComponentEditView.svelte'],
    calls: ['updateComponent'],
  });

  // A load-bearing asymmetry: the component row deliberately waives no navigation where its
  // recipe sibling waives a same-view one, which is why the two are asserted together: the
  // sibling is what makes the absence a choice rather than an oversight.
  defineStructureContract(
    'AC14: the component route guard keeps NO component-edit bypass (issue 676)',
    { file: ROUTE_EXIT_GUARDS, record: ['view', 'component-edit'] },
    { property: [['skip', 'none']] }
  );

  defineStructureContract(
    'and the recipe sibling still carries the bypass it omits',
    { file: ROUTE_EXIT_GUARDS, record: ['view', 'recipe-edit'] },
    { property: [['skip', 'same-view']] }
  );

  defineStructureContract(
    'and the component row is asked about the route it is on, not the one it is leaving',
    { file: MANAGER_ROOT, constant: 'routeExitGuards', property: 'component-edit' },
    { names: ['activeView'], compares: ['component-edit'], namesNo: ['nextView'] }
  );

  // `foundry` is not in the global set: the editor reaches `globalThis.foundry.utils.randomID`.
  // What it must never reach is an application class, which is the member read below.
  defineStructureContract('keeps the component editor free of Foundry globals', COMPONENT_EDIT, {
    readsNoGlobal: ['game', 'ui', 'Hooks', 'CONFIG'],
    readsNo: ['globalThis.foundry.applications', 'foundry.applications'],
  });

  // The v2 environment editor is a composition editor (issue 429): it wraps records the libraries
  // author rather than authoring tasks of its own, so every task-authoring store action stays out
  // of it and the root threads the composition in.
  defineStructureContract('uses a purpose-built manager environment editor', MANAGER_ROOT, {
    imports: ['./EnvironmentEditView.svelte'],
    reads: [
      'store.updateEnvironmentDraft',
      'store.saveEnvironmentDraft',
      'store.deleteEnvironmentDraft',
      'store.setEnvironmentCompositionMode',
      'store.includeEnvironmentRecord',
      'store.forceIncludeEnvironmentRecord',
      'store.excludeEnvironmentRecord',
      'store.restoreEnvironmentRecord',
      'store.reorderEnvironmentRecord',
      '$viewState.environmentComposition',
    ],
    passesProps: [['EnvironmentEditView', 'composition']],
    importsNo: ['../EnvironmentsTab.svelte'],
    namesNo: ['forceEditorOpen'],
  });

  defineStructureContract('composes an environment rather than authoring its tasks', ENVIRONMENT_EDIT, {
    readsNo: [
      'store.addEnvironmentTaskResultGroup',
      'store.addEnvironmentTaskCatalyst',
      'store.updateEnvironmentTaskVisibility',
      'store.updateEnvironmentTaskCheck',
    ],
    propertyNo: [['id', 'advanced']],
    spellsNo: ['manager-environment-details-tabs', 'manager-environment-evidence-column'],
  });

  // Global conditions and vocabularies are authored from the gathering workspace browser (settings
  // tab); library task/event authoring and rules live on their own routes, so those store actions
  // are invoked by root-owned functions rather than passed into the composition editor.
  // The rules card moved into `environment/GatheringRulesInspector.svelte` (issue 1707 phase 2)
  // and the rail that selects it into `environment/GatheringInspectorRail.svelte` (phase 3), so
  // the root renders the rail.
  defineStructureContract('wires the Manager gathering libraries and global conditions', MANAGER_ROOT, {
    renders: ['GatheringInspectorRail'],
    passesProps: [
      ['EnvironmentsBrowserView', 'gatheringConfig'],
      ['EnvironmentsBrowserView', 'onUpdateGatheringConditions'],
      ['EnvironmentsBrowserView', 'onToggleGatheringConditionEnabled'],
      ['EnvironmentsBrowserView', 'onAddGatheringConditionValue'],
      ['EnvironmentsBrowserView', 'onDeleteGatheringConditionValue'],
      ['EnvironmentsBrowserView', 'onAddGatheringVocabularyValue'],
      ['EnvironmentsBrowserView', 'onUpdateGatheringVocabularyValue'],
      ['EnvironmentsBrowserView', 'onDeleteGatheringVocabularyValue'],
    ],
    reads: [
      '$viewState.gatheringConfig',
      'store.updateGatheringConditions',
      'store.toggleGatheringConditionEnabled',
      'store.addGatheringConditionValue',
      'store.deleteGatheringConditionValue',
      'store.addGatheringVocabularyValue',
      'store.updateGatheringVocabularyValue',
      'store.deleteGatheringVocabularyValue',
    ],
    names: ['updateSelectedGatheringRules', 'selectedGatheringConditionShortcuts'],
    calls: ['buildSelectedGatheringConditionShortcuts'],
    // `data-gathering-inspector-rules` is the rules leaf's own hook now (issue 1707 phase 2) and
    // `manager-environments-mounted.js` pins it through the DOM.
    writes: [
      'data-systems-gathering-conditions',
      'data-systems-gathering-condition',
    ],
  });

  // The rules card moved into `environment/GatheringRulesInspector.svelte` (issue 1707 phase 2):
  // its copy, its event-specific drop label and its two limit steppers are that leaf's own.
  defineStructureContract('draws the gathering rules inspector', GATHERING_RULES_INSPECTOR, {
    writes: ['data-gathering-inspector-rules'],
    spellsExactly: [
      'manager-rule-copy',
      'FABRICATE.Admin.Manager.Environment.Rules.EventHighestRankedDrop',
    ],
    // The two limits are one shared component now (issue 1050).
    attributes: [
      ['rule', 'rewardLimit'],
      ['rule', 'eventLimit'],
    ],
  });

  // The rail's own states moved with the branch chain (issue 1707 phase 3): the placeholder hook
  // (an unreachable arm, kept byte-faithful — deletion is a follow-up) and the empty-library setup
  // card's title key are that file's own.
  defineStructureContract('draws the gathering inspector rail', GATHERING_INSPECTOR_RAIL, {
    writes: ['data-gathering-inspector-placeholder'],
    spellsExactly: [
      'FABRICATE.Admin.Manager.Environment.EmptySetup.Title',
      'https://mistersilver-uk.github.io/fabricate/gathering/environments',
    ],
  });

  // The shortcut persists against the selected system rather than against the world, which is the
  // whole point of a per-system shortcut card.
  defineStructureContract(
    'persists a condition shortcut against the selected system',
    { file: MANAGER_ROOT, fn: 'updateSelectedGatheringCondition' },
    {
      reads: ['store.updateGatheringConditions'],
      keys: ['systemId'],
      names: ['selectedSystemId'],
    }
  );

  defineStructureContract('marks the shared limit stepper with the field it edits', GATHERING_RULE_STEPPER, {
    writes: ['data-gathering-rule-stepper'],
    declaresProp: ['rule'],
  });

  // The component header states `rule` is both the value's key and the marker; two independent
  // claims leave the marker free to carry anything, so the binding itself is read off the node.
  it('binds that marker to the rules field rather than to any other expression', () => {
    const [stepper] = templateNodes(componentAstOf(GATHERING_RULE_STEPPER)).filter((node) =>
      declaresAttribute(node, 'data-gathering-rule-stepper', { directives: false })
    );
    assert.ok(Boolean(stepper), 'the stepper still marks its wrapper');
    assert.equal(attributeExpression(stepper, 'data-gathering-rule-stepper')?.name, 'rule');
  });

  // The settings tab is where a world's condition and vocabulary values are authored, through the
  // shared pickers rather than through bespoke inputs.
  defineStructureContract('authors global conditions and vocabularies on the settings tab', ENVIRONMENTS_BROWSER, {
    renders: ['ManagerColorPicker', 'IconPicker'],
    writes: ['data-gathering-condition-panel', 'data-gathering-vocabulary-panel'],
    calls: [
      'onToggleGatheringConditionEnabled',
      'onAddGatheringConditionValue',
      'onUpdateGatheringConditionValue',
      'onDeleteGatheringConditionValue',
      'onAddGatheringVocabularyValue',
      'onUpdateGatheringVocabularyValue',
      'onDeleteGatheringVocabularyValue',
    ],
    callsWith: [['onAddGatheringConditionValue', 'conditionAddIcon']],
    spellsExactly: ['manager-condition-label-input'],
  });

  it('states the gathering rule and condition copy the inspector reads', () => {
    assert.equal(lang.FABRICATE.Admin.Manager.Environment.Conditions.NewIcon, 'New value icon');
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
  });

  // What the library, its inspector and the focused editor draw and do — rows, drop rules,
  // component browser, sliders, paging, availability, Required Tools, toolbar delete — is driven
  // by `tests/components/manager-gathering-mounted.js`. What stays is the wiring behind them.
  // The drop inspector moved into `environment/GatheringTaskInspector.svelte` (issue 1707 phase
  // 2) and the rail that selects it into `environment/GatheringInspectorRail.svelte` (phase 3), so
  // the root renders the editor and the rail.
  defineStructureContract('wires the gathering task library and its inspector', MANAGER_ROOT, {
    renders: ['GatheringTaskEditView', 'GatheringInspectorRail'],
    names: [
      'selectedGatheringTaskId',
      'selectGatheringTask',
      'createGatheringTask',
      'editGatheringTask',
      'duplicateGatheringTask',
      'deleteGatheringTask',
      'toggleGatheringTaskEnabled',
      'addGatheringDropModifier',
      'updateGatheringDropModifier',
      'gatheringDropRateTierClass',
      'gatheringDropRateTierColor',
      'onGatheringDropCountKeydown',
      'deleteGatheringTaskDraft',
      'selectedGatheringSystemTools',
      'addToolReferenceToSelectedTask',
      'removeToolReferenceFromSelectedTask',
    ],
    reads: ['store.duplicateGatheringLibraryTask'],
    declares: ['itemCards'],
    passesProps: [
      ['EnvironmentsBrowserView', 'onSelectGatheringTask'],
      ['EnvironmentsBrowserView', 'onCreateGatheringTask'],
      ['EnvironmentsBrowserView', 'onEditGatheringTask'],
      ['EnvironmentsBrowserView', 'onDuplicateGatheringTask'],
      ['EnvironmentsBrowserView', 'onDeleteGatheringTask'],
      ['EnvironmentsBrowserView', 'onToggleGatheringTaskEnabled'],
      ['GatheringTaskEditView', 'itemCards'],
      ['GatheringTaskEditView', 'resolutionMode'],
    ],
    // Issue 883: the inspector's slider is `ChanceSlider`. The track/fill structure and the
    // input/blur/keydown trio it hand-rolled must be gone from the root, not merely unused — a
    // surviving copy is what the next divergence gets written against.
    spellsNo: ['manager-drop-rate-control', 'manager-drop-rate-track', 'manager-drop-rate-fill'],
    namesNo: ['onGatheringDropRateInput', 'onGatheringDropRateBlur', 'onGatheringDropRateKeydown'],
    // The selected drop inspector renders no component selector, and no second duplicate action.
    readsNo: ['selectedGatheringDrop.componentId'],
    callsWithNo: [['duplicateGatheringTask', 'selectedGatheringTask']],
  });

  // The task and drop inspector markup moved into `environment/GatheringTaskInspector.svelte`
  // (issue 1707 phase 2): its hooks and the drop editor's classes are that leaf's own.
  defineStructureContract('draws the gathering task inspector and its drop editor', GATHERING_TASK_INSPECTOR, {
    writes: [
      'data-gathering-task-inspector',
      'data-gathering-task-drop-inspector',
      'data-gathering-drop-inspector-rate',
      'data-gathering-drop-inspector-count',
    ],
    spellsExactly: ['manager-drop-editor-actions', 'manager-drop-editor-values'],
    spellsNo: ['manager-drop-rate-control', 'manager-drop-rate-track', 'manager-drop-rate-fill'],
  });

  defineStructureContract(
    'hosts the task library on the gathering workspace',
    ENVIRONMENTS_BROWSER,
    {
      renders: ['GatheringTasksBrowserView'],
      passesProps: [
        ['GatheringTasksBrowserView', 'tasks'],
        ['GatheringTasksBrowserView', 'selectedTaskId'],
        ['GatheringTasksBrowserView', 'managedItemOptions'],
      ],
      reads: ['selectedGatheringSystemConfig.tasks'],
    }
  );

  defineStructureContract('draws the task library rows and their actions', GATHERING_TASKS_BROWSER, {
    writes: ['data-gathering-tasks-browser', 'data-gathering-task-tags'],
    spellsExactly: ['manager-gathering-tasks-table'],
    calls: ['biomeChips', 'timeChips', 'weatherChips', 'rowChips'],
    callsWith: [
      ['onDuplicateTask', 'selectedSystemId'],
      ['onDeleteTask', 'selectedSystemId'],
      ['onToggleTaskEnabled', 'selectedSystemId'],
    ],
  });

  // The editor is one page, not a tab strip, and the drop table is the row itself rather than a
  // row plus a responsive duplicate of every one of its labels.
  defineStructureContract('authors a gathering task on one page', GATHERING_TASK_EDIT, {
    renders: ['ChanceSlider', 'RadioCardGroup'],
    names: [
      'pageSize',
      'showRewardRuleNotice',
      'dragDrop',
      'availableConditionOptions',
      'selectedConditionOptions',
      'dropRateTierColor',
    ],
    calls: [
      'onClearDropComponent',
      'onDropComponentMouseDown',
      'onComponentDragStart',
      'dropRateTierClass',
      'onQuantityInput',
      'onQuantityKeydown',
      'onPickImagePath',
      'onAddToolReference',
      'onRemoveToolReference',
    ],
    callsWith: [['onImportDrop', 'rowId']],
    writes: [
      'data-gathering-task-editor',
      'data-gathering-task-core-editor',
      'data-gathering-task-availability',
      'data-gathering-task-availability-pill',
      'data-gathering-task-component-browser',
      'data-gathering-task-component-grid',
      'data-gathering-component-card',
      'data-gathering-component-name-search',
      'data-gathering-component-tag-search',
      'data-gathering-task-drops-table',
      'data-gathering-task-drop-component-cell',
      'data-gathering-task-drop-chance-cell',
      'data-gathering-task-drop-count',
      'data-gathering-task-required-tools',
      'oncontextmenu',
    ],
    attributes: [['inputmode', 'numeric']],
    spells: ['manager-drop-cell', 'manager-drop-component-cell', 'manager-drop-quantity-cell'],
    spellsExactly: [
      'manager-selected-tag-pill',
      'data-gathering-task-availability-option',
      'manager-task-drop-controls',
      'manager-task-drop-footer',
      'manager-task-component-browser-card',
      'manager-task-component-grid',
      'manager-task-component-card-grip',
      'manager-task-media-column',
      'manager-task-required-tools-card',
      'manager-drop-modifier-pill',
      'manager-drop-modifier-list',
      'manager-drop-modifier-overflow',
      '[1-9][0-9]{0,2}',
    ],
    // The one-page editor's absences: no tab strip, no raw internal id, no duplicate back
    // control, no native single-select availability, no row-level quick actions, no responsive
    // label duplicates.
    namesNo: ['selectedCondition'],
    attributesNo: [['type', 'checkbox']],
    spellsExactlyNo: ['FABRICATE.Admin.Manager.Environment.Tasks.TaskId'],
    writesNo: ['data-gathering-task-drop-actions', 'data-gathering-task-drop-row-number'],
    spellsNo: [
      'manager-task-editor-tabs',
      'Internal ID',
      'BackToLibrary',
      'Tasks.SelectDrop',
      'EditDrop',
      'manager-labeled-cell manager-drop-component-cell',
      'manager-labeled-cell manager-drop-rate-cell',
      'QuantityShortHint',
    ],
  });

  // Asserted where it is decided rather than over the whole file: a managed-component drop
  // resets the row's identity and enables it.
  defineStructureContract(
    'resets a drop row identity when a managed component lands on it',
    { file: GATHERING_TASK_EDIT, fn: 'handleDropZoneDrop' },
    {
      compares: ['FabricateManagedComponent'],
      callsWith: [['onUpdateDrop', 'rowId']],
      reads: ['data.componentId'],
      keys: ['componentId', 'itemUuid', 'systemItemId', 'name', 'enabled'],
    }
  );

  defineStructureContract('draws one shared chance slider for both scopes', CHANCE_SLIDER, {
    names: ['handleNumberInput', 'handleNumberBlur', 'handleNumberKeydown', 'handleRangeInput'],
    declaresProp: ['resolveColor', 'numberLabel', 'rangeLabel'],
    attributes: [
      ['type', 'number'],
      ['type', 'range'],
    ],
    spells: ['manager-drop-rate-value', 'manager-drop-rate-percent'],
    spellsExactly: ['manager-drop-rate-track', 'manager-drop-rate-fill'],
  });

  it('keeps the gathering task actions key to the header aria label alone', () => {
    const key = 'FABRICATE.Admin.Manager.Environment.Tasks.Actions';
    const spelled = headerCopyLiterals().filter((text) => text === key);
    assert.equal(
      spelled.length,
      1,
      'the task inspector keeps no redundant action card heading beside the header label'
    );
  });

  // The destructive role, read off one element rather than off two strings that happen to sit
  // within 200 characters of each other. The class literal the old match keyed on left the file
  // entirely when this toolbar moved onto `ManagerButton` (issue 1118).
  it('renders the task delete as one danger ManagerButton wired to the draft delete', () => {
    const [remove] = templateNodes(componentAstOf(MANAGER_ROOT)).filter((node) =>
      declaresAttribute(node, 'data-gathering-task-delete', { directives: false })
    );
    assert.ok(Boolean(remove), 'the task editor toolbar still renders its delete control');
    assert.equal(remove.name, 'ManagerButton', 'through the shared button primitive');
    assert.equal(attributeValue(remove, 'role'), 'danger', 'in the destructive role');
    assert.equal(
      attributeExpression(remove, 'onclick')?.name,
      'deleteGatheringTaskDraft',
      'and the element carrying the hook is the one wired to the draft delete'
    );
  });

  it('states the gathering task copy the editor, its columns and its rails read', () => {
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
      lang.FABRICATE.Admin.Manager.Environment.Tasks.BackToLibrary,
      'Back to task library'
    );
    assert.equal(lang.FABRICATE.Admin.Manager.Environment.Tasks.CopySuffix, 'Copy');
    assert.equal(lang.FABRICATE.Admin.Manager.Environment.Tasks.Delete, 'Delete gathering task');
  });

  // What the library draws — rows, pager, per-system counts, selection, the three tabs, the
  // absent creation surface and source drop zone, the dirty guard, the armed removal — is driven
  // by `tests/components/manager-tools-mounted.js`. What stays is the wiring behind it.
  defineStructureContract('wires the Tools library and focused editor', MANAGER_ROOT, {
    imports: ['./ToolsBrowserView.svelte', './ToolEditView.svelte'],
    compares: ['tools', 'tool-edit'],
    names: [
      'focusedToolDraft',
      'focusedToolValidation',
      'openToolEditor',
      'selectLibraryTool',
      'backToToolsBrowser',
      'saveSelectedToolDraft',
      // The per-section inherit switch.
      'setFocusedToolSectionInherited',
      'toolsNavCount',
      'createWorldToolFromItemDrop',
      'adoptWorldToolIntoSystem',
    ],
    reads: [
      'store.openToolDraft',
      'store.saveToolDraft',
      // `store.deleteToolDraft` left the world membership record behind as a ghost nothing can
      // read; `removeToolFromSystem` is the pair of writes that undoes an adoption (issue 1373).
      'store.removeToolFromSystem',
      'store.setToolSectionInherited',
      // Tool creation is a world-scope write now.
      'services.resolveToolSource',
      'store.worldScope.tool.createEntity',
    ],
    passesProps: [
      ['WorldToolCataloguePage', 'onCreateFromItemDrop'],
      ['ToolBrowserInspector', 'onAddToSystem'],
      ['ToolBrowserInspector', 'onEditWorldTool'],
      // Task 4: the editor behind `Edit rules` offers the route the rules list already advertises.
      ['ToolEditView', 'onEditWorldTool'],
    ],
    // The row by name, because `routeExitGuardFor` alone is satisfied by any row at all.
    callsLiteral: [['routeExitGuardFor', 'tool-edit']],
    spellsExactly: ['world-tool-entry'],
    // And the system route carries no creation drop. The two screens had the drop zone exactly
    // inverted against the design, so this is the half that proves the move rather than a copy.
    namesNo: ['onCreateToolDrop', 'deleteSelectedLibraryTool'],
    readsNo: ['store.createToolDraft', 'store.deleteToolDraft'],
  });

  // The editor's own route-exit guard, which compares the tool and not only the view token, so
  // opening another tool from the library prompts and re-opening the focused one does not.
  defineStructureContract(
    'and guards the focused tool editor on the tool rather than the view token',
    { file: ROUTE_EXIT_GUARDS, record: ['view', 'tool-edit'] },
    { property: [['skip', 'subject']] }
  );

  defineStructureContract(
    'and names which tool that subject is, and the seam the prompt comes from',
    { file: MANAGER_ROOT, constant: 'routeExitGuards', property: 'tool-edit' },
    { names: ['focusedToolDraft'], reads: ['services.confirmDirtyToolsNavigation'] }
  );

  // Adoption is a named handler that selects what it adopted, rather than leaving the GM on a row
  // that has silently changed cohort.
  defineStructureContract(
    'selects the Tool it has just adopted into the system',
    { file: MANAGER_ROOT, fn: 'adoptWorldToolIntoSystem' },
    { callsWith: [['selectLibraryTool', 'entityId']] }
  );

  // A rail count is a bare mono numeral in its own span, not a chip (issue 643). The Tool Studio
  // entry is driven by `tests/components/manager-rail-mounted.js`, which presses it, reads the
  // route and asserts the badge is absent at zero; which derivation each span renders is not.
  it('renders each rail count as the derived number inside the shared count span', () => {
    const rendered = classRenderedExpressions(
      componentAstOf(MANAGER_SYSTEM_NAV),
      'manager-nav-count'
    );
    const read = rendered.flatMap((expression) => [
      ...memberPaths(expression),
      ...identifierNames(expression),
    ]);
    for (const count of ['gatheringNavCounts.total', 'toolsNavCount']) {
      assert.ok(read.includes(count), `the rail renders ${count} as a bare count numeral`);
    }
    assert.ok(
      rendered.some(
        (expression) =>
          expression.type === 'MemberExpression' &&
          expression.computed &&
          expression.object?.name === 'gatheringNavCounts'
      ),
      'and each gathering sub-item reads its own section count out of the same derivation'
    );
  });

  defineStructureContract('renders the requirements tab from the focused editor', TOOL_EDIT, {
    renders: ['ToolRequirementsTab'],
    passesProps: [['ToolRequirementsTab', 'modifierOptions']],
    writes: ['data-tool-editor-world-tool'],
    names: ['onEditWorldTool'],
    // No bare `Delete` in the system header, in either hook spelling: attribute, and object key.
    writesNo: ['data-tool-editor-delete'],
    spellsNo: ['data-tool-editor-delete'],
  });

  // The bonus takes its value from the world library (issue 1373): `proto:2353` and `proto:2886`
  // both draw a single-select `World modifiers` list, so what went away is the ability to type an
  // expression. The two absent eyebrows are headings the design merged into one sentence.
  defineStructureContract('takes the bonus from the world modifier library', TOOL_REQUIREMENTS, {
    renders: ['ModifierLibraryRow', 'SelectionCheckbox', 'ToolInheritCard'],
    spells: ['manager-tool-prerequisite-list'],
    spellsExactly: ['data-tool-bonus-modifier', 'data-tool-prerequisite-row'],
    passesValues: [['SelectionCheckbox', 'wrapper', 'contents']],
    namesNo: [
      'ProviderExpressionInput',
      'RollDataExpressionInput',
      'ChecklistCardRow',
      'legendVisible',
    ],
    rendersNo: ['ChecklistCardRow'],
    spellsNo: ['WhichPrerequisites'],
  });

  it('draws both lists on that tab as the shared modifier row, one of them opted in', () => {
    const requirements = componentAstOf(TOOL_REQUIREMENTS);
    const rows = renderedNodes(requirements, 'ModifierLibraryRow');
    assert.equal(rows.length, 2, 'the tab draws the shared row twice — prerequisites and bonus');
    // And only one opts in. The bonus list one section below and the Checks Studio one screen
    // away both pass neither, which is what makes the row's defaults load-bearing.
    const optedIn = rows.filter(
      (node) => propLiteral(node, 'controlPlacement') ?? propLiteral(node, 'textLayout')
    );
    assert.equal(optedIn.length, 1, 'only one opts in — the bonus list keeps the shipped face');
    const [prerequisite] = optedIn;
    assert.equal(propLiteral(prerequisite, 'controlPlacement'), 'leading', '`proto:2331`');
    assert.equal(propLiteral(prerequisite, 'textLayout'), 'stacked', '`proto:2333`');
    assert.ok(
      literalStrings(prerequisite).includes('data-tool-prerequisite-row'),
      'and it is the prerequisite list, not the bonus list, that took them'
    );
    // The gate pair keeps its option-card group; the bonus list must not grow a second one.
    for (const group of renderedNodes(requirements, 'RadioCardGroup')) {
      assert.ok(
        !literalStrings(group).some((literal) => literal.includes('tool-bonus-modifier')),
        'the bonus list renders rows, not option cards'
      );
    }
  });

  // The names are the row's own vocabulary: a caller-named variant is the failure this ruling
  // rejects by name, so it is asserted rather than left to review.
  defineStructureContract('declares the row two variants of its own', MODIFIER_LIBRARY_ROW, {
    defaults: [
      // The shipped trailing edge and the one-line text, so today's callers are unmoved.
      ['controlPlacement', 'trailing'],
      ['textLayout', 'inline'],
    ],
    spellsExactlyNo: ['prerequisite', 'bonus', 'checks', 'catalogue'],
  });

  // Both callers must pass the roster. A prop declared and not passed renders an empty library
  // that reads as "this world has none" — and it also subscribes the whole spread bundle, because
  // Svelte evaluates a spread only on a key miss.
  defineStructureContract('forwards the roster from the world Tool entry too', WORLD_TOOL_ENTRY, {
    passesProps: [['ToolRequirementsTab', 'modifierOptions']],
    // One action on the tile (issue 1373): the Copy beside Unlink went with the raw uuid line it
    // copied, which displaced the hint saying what dropping onto the tile does.
    renders: ['ItemDropZone'],
    spells: ['SourceDropHint'],
    writesNo: ['copyLabel', 'subline'],
    spellsNo: ['data-tool-source-replace'],
  });

  it('passes the world modifier roster to both Tool requirement scopes', () => {
    const scopes = templateNodes(componentAstOf(MANAGER_ROOT)).filter(
      (node) => attributeExpression(node, 'modifierOptions')?.name === 'selectedSystemModifiers'
    );
    assert.equal(scopes.length, 2, 'the focused system editor and the world Tool entry');
  });

  // Every behaviour section is a card rather than a bare page-background heading over loose
  // controls: its head states the section, whether this system inherits the world Tool's answer,
  // what that answer is, and the switch between the two.
  defineStructureContract('draws breakage as inherit-aware cards', TOOL_BREAKAGE, {
    renders: ['ToolInheritCard'],
    writes: ['data-tool-remove-from-system'],
    spells: ['StopUsingHereHint'],
    // `Always fires` is gone: the design uses that slot for the inheritance state.
    spellsNo: ['manager-tool-section-heading', 'AlwaysFires', 'BreakageKicker'],
  });

  it('splits the four world-default sections two and two across the tabs', () => {
    assert.deepEqual(
      attributeValues(componentAstOf(TOOL_BREAKAGE), 'section'),
      ['breakage', 'onBreak'],
      'Breakage owns exactly the two world-default sections it authors'
    );
    assert.deepEqual(
      attributeValues(componentAstOf(TOOL_REQUIREMENTS), 'section'),
      ['prerequisites', 'bonus'],
      'and Requirements owns the other two'
    );
  });

  // The switch is the shipped primitive, not a second hand-rolled one.
  defineStructureContract('reuses the shared scoped inherit row', TOOL_INHERIT_CARD, {
    imports: ['../scoped/InheritRow.svelte'],
    passesValues: [['InheritRow', 'stateChip', false]],
  });

  // The linked-item card is not at system scope, and the per-system display-label override
  // names itself as an override in the screen's own idiom rather than in a help sentence.
  defineStructureContract('keeps the system band free of source linking', TOOL_SYSTEM_SCOPE, {
    renders: ['ToolInheritCard'],
    writes: ['data-tool-label'],
    rendersNo: ['ItemDropZone'],
    namesNo: ['onSourceDrop', 'onUnlinkSource', 'onCopySourceUuid'],
  });

  // There is no overview tab at system scope at all, and the declaration form is the `EditorTabs`
  // primitive's (issue 1038).
  defineStructureContract('defaults the system tab strip to Breakage', TOOL_EDITOR_TABS, {
    defaults: [['activeTab', 'breakage']],
    spellsExactlyNo: ['overview'],
  });

  it('declares exactly three system tabs, in the shipped order', () => {
    assert.deepEqual(
      propertyValues(declaredConstantValue(TOOL_EDITOR_TABS, 'TABS'), 'id'),
      ['breakage', 'requirements', 'validation'],
      'Breakage, Requirements and Validation, and no fourth appended past them'
    );
  });

  // Validation reuses the shared scoped shell, and that shell really does render the recipe-style
  // surface: asserting only the shell would pass on a shell that had dropped it.
  defineStructureContract('reuses the shared scoped validation shell', TOOL_VALIDATION, {
    renders: ['ScopedValidationTab'],
  });

  defineStructureContract(
    'and that shell renders the recipe-style editor validation surface',
    SCOPED_VALIDATION_TAB,
    { renders: ['EditorValidationSurface'] }
  );

  it('states the Tools copy the rail, the editor and the world field read', () => {
    assert.ok(
      lang.FABRICATE.Admin.Manager.Tools && typeof lang.FABRICATE.Admin.Manager.Tools === 'object',
      'lang should expose a FABRICATE.Admin.Manager.Tools block'
    );
    // `Tool Rules`, not `Tools` (issue 1373). The rail entry.
    assert.equal(lang.FABRICATE.Admin.Manager.Tools.Title, 'Tool Rules');
    assert.equal(lang.FABRICATE.Admin.Manager.Tools.Add, 'Add tool');
    assert.equal(lang.FABRICATE.Admin.Manager.Tools.Save, 'Save tool');
    assert.equal(lang.FABRICATE.Admin.Manager.Tools.NavigationDirty.SaveAll, 'Save All');
    assert.equal(lang.FABRICATE.Admin.Manager.Tools.BackToToolRules, 'Back to Tool Rules');
    assert.equal(lang.FABRICATE.Admin.Manager.Tools.SaveRules, 'Save rules');
    assert.equal(
      lang.FABRICATE.Admin.Manager.Tools.Editor.WhichPrerequisites,
      undefined,
      'the retired eyebrow key is removed, not left for a future caller to re-render'
    );
    assert.equal(
      lang.FABRICATE.Admin.Manager.Tools.Editor.RequiredAll,
      'All selected prerequisites are required (AND). When a character fails them:',
      '`proto:2334` states the AND rule and introduces the gate pair in ONE sentence'
    );
    // The gate group keeps its accessible name — the heading is hidden, not deleted.
    assert.equal(
      lang.FABRICATE.Admin.Manager.Tools.Editor.GateMode,
      'When prerequisites fail',
      'the gate group keeps a legend for a screen reader even though nothing paints it'
    );
    // AND THE EMPTY LIBRARY NAMES ITS ROUTE, exactly as the bonus section below states its own.
    assert.equal(
      lang.FABRICATE.Admin.Manager.Tools.Editor.NoPrerequisites,
      'No character prerequisites are defined in this world yet. They are defined under World, ' +
        'Rules and resources.',
      'the two absences on this tab read the same way, route included'
    );
    assert.equal(
      lang.FABRICATE.Admin.Manager.Tools.Editor.StopUsingHereHint,
      'Removes the rules in {system} only. The world Tool and every other system are untouched.'
    );
    assert.equal(
      lang.FABRICATE.Admin.Manager.Tools.Editor.HeaderSystemScope,
      'Rules in {system} · identity comes from the world Tool'
    );
    assert.equal(
      lang.FABRICATE.Admin.Manager.Tools.Editor.LabelFallback,
      'The name this crafting system shows for the Tool.'
    );
    // The world field names itself as optional (issue 1373): its old copy described the override
    // above rather than saying that a blank is allowed and what answers for it.
    assert.equal(
      lang.FABRICATE.Admin.Manager.Scoped.Entry.DisplayLabelInheritHint,
      'Leave blank to use the linked Item name.'
    );
    assert.equal(
      lang.FABRICATE.Admin.Manager.Scoped.Entry.DisplayLabelUnlinkedHint,
      'No Item is linked, so this record has no name to fall back on.'
    );
  });

  it('removes the orphaned checklist row rather than leaving it standing', () => {
    assert.ok(
      !existsSync(resolve(repoRoot, 'src/ui/svelte/apps/manager/ChecklistCardRow.svelte')),
      'its only caller was the prerequisite list, and a component left standing with no caller ' +
        'is how a fourth row comes back by copy'
    );
  });

  defineStructureContract(
    'copies a UUID through the Foundry clipboard service',
    { file: MANAGER_SERVICES, fn: 'dialogServices' },
    { reads: ['game.clipboard'], calls: ['copyPlainText'] }
  );

  // Asserted over BOTH halves of the shell, so moving the clipboard code out of the app module did
  // not weaken the claim to the half it left behind.
  for (const file of [APP_SHELL, MANAGER_SERVICES]) {
    defineStructureContract(`never bypasses the Foundry clipboard service anywhere in ${file}`, file, {
      readsNo: ['navigator.clipboard', 'foundry.utils.copyPlainText'],
    });
  }

  // The GM Knowledge surface (issue 785). Each wiring decision here fails silently at runtime: an
  // un-suppressed inspector holds a dead 300px strip open, an un-threaded `resolutionMode` hides
  // the rail entry, and an ungated `setKnowledgeActive` scans every actor on every `refresh()`.
  defineStructureContract('routes the Knowledge surface and gates its projection', MANAGER_ROOT, {
    imports: ['./KnowledgeView.svelte'],
    compares: ['knowledge'],
    declares: ['knowledgeState', 'craftingResolutionMode'],
    reads: [
      '$viewState.knowledge',
      'selectedSystem.resolutionMode',
      'store.setKnowledgeActive',
      'store.selectKnowledgeActor',
      'store.expendRecipeItemUse',
      'store.deleteOwnedRecipeItem',
      'store.eraseLearnedRecipe',
      'store.resetActorSystemKnowledge',
      'store.resetActorAllKnowledge',
    ],
    callsWith: [
      ['setKnowledgeActive', 'currentView'],
      ['selectKnowledgeActor', 'actorId'],
      ['expendRecipeItemUse', 'actorId'],
      ['expendRecipeItemUse', 'itemId'],
      ['deleteOwnedRecipeItem', 'actorId'],
      ['deleteOwnedRecipeItem', 'itemId'],
      ['eraseLearnedRecipe', 'actorId'],
      ['eraseLearnedRecipe', 'recipeId'],
      ['resetActorSystemKnowledge', 'actorId'],
      ['resetActorAllKnowledge', 'actorId'],
    ],
    // Each delegation is threaded as the prop the view calls, so a store read that stopped
    // reaching the surface is not answered by the read alone.
    passesProps: [
      ['KnowledgeView', 'knowledge'],
      ['KnowledgeView', 'onSelectActor'],
      ['KnowledgeView', 'onExpend'],
      ['KnowledgeView', 'onDelete'],
      ['KnowledgeView', 'onErase'],
      ['KnowledgeView', 'onResetSystem'],
      ['KnowledgeView', 'onResetAll'],
    ],
    // The projection is published TOP-LEVEL, never hung off selectedSystem.
    readsNo: ['selectedSystem.knowledge'],
  });

  defineStructureContract(
    'threads the resolution mode the widened rail gate reads',
    { file: MANAGER_ROOT, constant: 'craftingNavArgs' },
    { keys: ['resolutionMode'], names: ['craftingResolutionMode'] }
  );

  // The CSS column release and the aside suppression are one decision expressed twice; doing only
  // the first leaves an empty 300px inspector holding the strip. The shared inspector element
  // itself is stated by `renders the manager shell and the routes it hosts`.
  defineStructureContract(
    'releases the third column for the full-width Knowledge surface',
    { file: MANAGER_ROOT, constant: 'FULL_WIDTH_VIEWS', record: ['id', 'knowledge'] },
    { property: [['layoutClass', 'self-owned-3-track']] }
  );

  // The view owns the single armed token and every disarm rule, and seeds its default tab once.
  defineStructureContract('owns the armed token and the seeded default tab', KNOWLEDGE_VIEW, {
    renders: [
      'KnowledgeRoster',
      'KnowledgeTabs',
      'KnowledgeRecipeItemsTab',
      'KnowledgeLearnedRecipesTab',
    ],
    names: ['filterKnowledgeRoster', 'armedToken', 'tabSeeded'],
    writes: ['data-knowledge-view'],
    attributes: [['role', 'tabpanel']],
  });

  // A real focusable button, not the prototype's span affordance.
  defineStructureContract('arms a real button rather than a span', ARMED_DANGER_BUTTON, {
    elements: ['button'],
    binds: ['this'],
    attributes: [['type', 'button']],
    writes: ['data-armed', 'data-arm-token', 'aria-label'],
    names: ['armed', 'token', 'consequence', 'handleBlur'],
    reads: ['event.key'],
    compares: ['Escape'],
    spellsExactly: ['fas fa-triangle-exclamation'],
    spellsNo: ['sc-on-click'],
  });

  // The armed token is keyed on the document id, so two copies of one recipe arm separately, and
  // `inert` renders as its own chip rather than fused into the "Spent" label.
  defineStructureContract('keys the delete token on the item document id', KNOWLEDGE_COPY_ROW, {
    spells: ['delete:'],
    reads: ['copy.itemId'],
    writes: ['data-knowledge-inert'],
  });

  defineStructureContract('keys the erase token on the recipe id', KNOWLEDGE_LEARNED_ROW, {
    spells: ['erase:'],
    reads: ['learned.recipeId'],
  });

  // Only `spent` disables Expend. An `!inert` term would apply a gate the engine does not:
  // `_filterNonExhausted` reads `timesUsed` alone. Read off the one disablable control rather
  // than off the whole file, which legitimately reads `copy.inert` for the chip beside it.
  it('disables Expend from the projected affordance alone', () => {
    const expend = templateNodes(componentAstOf(KNOWLEDGE_COPY_ROW)).find((node) =>
      declaresAttribute(node, 'disabled', { directives: false })
    );
    assert.ok(Boolean(expend), 'the copy row still renders a disablable Expend control');
    const gate = attributeExpression(expend, 'disabled');
    assert.ok(memberPaths(gate).includes('copy.canExpend'), 'Expend reads the affordance');
    assert.ok(!identifierNames(gate).has('inert'), 'and inert does not gate it');
  });

  // The Knowledge seam (issue 785). Every rule here is invisible at unit level and silent at
  // runtime if it regresses: dropping `reprojectKnowledge` from the item handler leaves a
  // learn/expend/delete on another client unrendered, flattening a `[hook, id]` tuple leaks the
  // listener across every manager reopen, and removing an `isGM` gate hands a player a GM
  // mutation. What this file cannot state is which way each guard runs and which handler a hook
  // is bound to; `tests/components/manager-extension-composition.test.js` drives the real class
  // against a recording `Hooks` and admin store for that.
  // `Document#pack` falls back to `this.parent?.pack`, so a compendium-actor item is readable off
  // the embedded doc; and `scheduleKnowledgeRefresh` no-ops unless the Knowledge surface is open.
  defineStructureContract(
    'registers the Knowledge hook set, filtered to what can change the projection',
    { file: APP_SHELL, member: '_registerUserHooks' },
    {
      hooks: ['createItem', 'updateItem', 'deleteItem', 'createActor', 'deleteActor'],
      diffKeys: [['diff', 'flags']],
      reads: ['doc.parent.documentName', 'doc.pack'],
      calls: ['markLearnedRecipeIndexStale', 'scheduleKnowledgeRefresh'],
      compares: ['Actor'],
    }
  );

  it('registers every user hook as an [hookName, id] tuple, and unregisters by the same shape', () => {
    const registerHooks = classMemberAst(moduleAstOf(APP_SHELL).ast, '_registerUserHooks');
    const nodes = [...walkNodes(registerHooks)];
    const registrations = nodes.filter(registersAHook);
    const tuples = nodes.filter(
      (node) =>
        node.type === 'ArrayExpression' &&
        node.elements.length === 2 &&
        registersAHook(node.elements[1])
    );
    assert.ok(registrations.length >= 4, 'the user hooks are registered here');
    assert.equal(
      tuples.length,
      registrations.length,
      'every Hooks.on id is registered inside a [hookName, id] tuple — a bare id makes the ' +
        'unregister side destructure undefined and leak the listener across every manager reopen'
    );
    const unregister = classMemberAst(moduleAstOf(APP_SHELL).ast, '_unregisterUserHooks');
    const destructured = [...walkNodes(unregister)].some(
      (node) =>
        node.type === 'ForOfStatement' &&
        node.left?.declarations?.[0]?.id?.type === 'ArrayPattern' &&
        node.left.declarations[0].id.elements.length === 2
    );
    assert.ok(destructured, 'the unregister side destructures the tuple');
  });

  defineStructureContract(
    'gates the Knowledge seam on isGM and denies a non-GM with the GM-only message',
    { file: KNOWLEDGE_TARGETS, fn: 'knowledgeActor' },
    { reads: ['game.user.isGM', 'KNOWLEDGE_MESSAGES.gmOnly'] }
  );

  defineStructureContract(
    'runs that gate before any document lookup on the item target too',
    { file: KNOWLEDGE_TARGETS, fn: 'knowledgeTarget' },
    { calls: ['knowledgeActor'] }
  );

  // Without the third column, the gated resolver, a row says the mutation is delegated but not
  // that anything gates it.
  const KNOWLEDGE_MUTATIONS = Object.freeze([
    ['expendRecipeItemUse', 'expendOwnedRecipeItemUse', 'knowledgeTarget'],
    ['deleteOwnedRecipeItem', 'deleteOwnedRecipeItemCopy', 'knowledgeTarget'],
    ['eraseLearnedRecipe', 'eraseLearnedRecipeEntry', 'knowledgeActor'],
    ['resetActorKnowledge', 'resetActorKnowledgeState', 'knowledgeActor'],
  ]);

  for (const [method, mutation, gate] of KNOWLEDGE_MUTATIONS) {
    defineStructureContract(
      `${method} resolves through the GM-gated helper and delegates its mutation`,
      { file: KNOWLEDGE_TARGETS, fn: method },
      { calls: [mutation, gate], names: ['denied'] }
    );
  }

  // An anti-pin (issue 1024): a positive `isPlayerCharacterActor` claim is a tautology that
  // survives the wrong import, so the claim is that the hardcoded actor type is absent, plus the
  // import.
  defineStructureContract(
    'reaches the player-character roster through the shared, GM-configurable predicate', APP_SHELL,
    {
      imports: ['../config/playerCharacterTypes.js'],
      comparesNo: ['character'],
      readsNo: ['game.fabricate.isPlayerCharacterActor'],
      namesNo: ['activeGM'],
    }
  );

  // The two rosters that anti-pin exists for moved with the services bag (issue 1674), so the
  // claim is asserted over its new home as well as its old one.
  defineStructureContract(
    'reaches the player-character roster through the shared, GM-configurable predicate',
    MANAGER_SERVICES,
    {
      imports: ['../config/playerCharacterTypes.js'],
      comparesNo: ['character'],
      readsNo: ['game.fabricate.isPlayerCharacterActor'],
    }
  );

  // The write half moved beside the primitives it drives (issue 1674), so the same anti-pin is
  // asserted there: `activeGM` would lock out the assistant GMs `show()` already admits.
  defineStructureContract('drives the merged knowledge primitives, ungated by activeGM', KNOWLEDGE_TARGETS, {
    imports: ['./knowledgeMutations.js'],
    namesNo: ['activeGM'],
  });

  // The learned-row allowlist (issue 1289). `collectKnowledgeLearnedEntries` in `src/systems/knowledgeSnapshot.js` builds each row as
  // a hand-written object literal, so a field it does not name never reaches the display ladder:
  // the row falls to an earlier rung with nothing failing, and the mounted fixture cannot see it.
  it('names every learned-entry field the display ladder reads', () => {
    const studio = moduleAstOf(KNOWLEDGE_STUDIO).ast;
    // Walked to a fixed point from the projection the collected rows are fed to. One level would
    // miss `granted`/`grantedBy`, which `learnedRecipeSource` reads only through
    // `learnedRecipeGrantSource`.
    const readFields = new Set();
    const walked = new Set();
    const queue = ['projectLearnedRecipeRow'];
    while (queue.length > 0) {
      const name = queue.shift();
      if (walked.has(name)) continue;
      walked.add(name);
      const body = namedCodeAst(studio, name);
      for (const path of memberPaths(body)) {
        const [head, field] = path.split('.');
        if (head === 'raw' && field) readFields.add(field);
      }
      for (const node of walkNodes(body)) {
        if (node.type !== 'CallExpression' || node.arguments.length !== 1) continue;
        if (node.arguments[0]?.name === 'raw') queue.push(calledName(node));
      }
    }
    // A VACUITY guard, not the subject. The walk keys on the ladder's input still being named
    // `raw` and still being read field by field; a rewrite that destructured it would leave
    // every assertion below passing over an empty set.
    assert.ok(
      readFields.size >= 6,
      `the learned-row ladder no longer reads \`raw.<field>\`, so this derivation proves nothing (found ${[...readFields].join(', ') || 'nothing'})`
    );

    const collector = namedCodeAst(
      moduleAstOf(KNOWLEDGE_SNAPSHOT).ast,
      'collectKnowledgeLearnedEntries'
    );
    const literal = pushedRecord(collector, 'learnedRecipes');
    assert.ok(
      Boolean(literal),
      'the learned-row literal is locatable inside the collector, so this is not an empty slice'
    );
    // A field is named either as `field: value` or as the `field` shorthand.
    const named = new Set(literal.properties.map((property) => property.key?.name));
    for (const field of readFields) {
      assert.ok(
        named.has(field),
        `the collector's allowlist drops \`${field}\`, which the learned-row ladder reads: the row falls silently to an earlier rung`
      );
    }
    // Named for their own sake as well as by derivation.
    assert.ok(
      readFields.has('granted') && readFields.has('grantedBy'),
      'the grant rungs are still part of the ladder this derivation walks'
    );
  });

  // `railCollapsed` is the stored preference; the body renders `railCollapsedDisplay`, so the
  // Downtime rail lock forces the sidebar open without un-collapsing every other route. The
  // rendered half is mounted through `assertRailLockedOpen` and `assertRailLockSurvivesPresses`.
  defineStructureContract('wires a collapsible left rail persisted via the manager setting seam', NAV_RAIL_MODEL, {
    spells: ['managerRailCollapsed'],
    reads: ['services.getSetting', 'services.setSetting'],
    names: ['toggleRail'],
    declares: ['collapsedDisplay'],
  });

  defineStructureContract('names the rail toggle for both states', MANAGER_NAV_RAIL, {
    spells: [
      'FABRICATE.Admin.Manager.Nav.CollapseRail',
      'FABRICATE.Admin.Manager.Nav.ExpandRail',
    ],
  });

  // Counted, not merely present (issue 1213 review): a mounted case renders one of the two sites,
  // so the branch it does not reach would lose the lock silently.
  it('writes the rail toggle twice, and both sites carry the same state attributes', () => {
    const sites = templateNodes(componentAstOf(MANAGER_NAV_RAIL)).filter((node) =>
      declaresAttribute(node, 'data-manager-rail-toggle', { directives: false })
    );
    assert.equal(sites.length, 2, 'the scope card renders the rail toggle once per branch');
    for (const attribute of ['aria-pressed', 'aria-label', 'title', 'disabled', 'aria-disabled']) {
      assert.ok(
        sites.every((node) => declaresAttribute(node, attribute, { directives: false })),
        `every rail-toggle site must carry ${attribute}, not just the one a mounted case renders`
      );
    }
  });

  it('localizes the rail toggle for both states', () => {
    assert.equal(lang.FABRICATE.Admin.Manager.Nav.CollapseRail, 'Collapse navigation rail');
    assert.equal(lang.FABRICATE.Admin.Manager.Nav.ExpandRail, 'Expand navigation rail');
  });

  defineStructureContract(
    'exposes the setting seam to the Svelte component services',
    { file: APP_SHELL, member: '_prepareSvelteProps', property: 'services' },
    { reads: ['this._services.getSetting', 'this._services.setSetting'] }
  );
});

/** The world scoped-entity shell's HAND-MAINTAINED MIRRORS (issue 1362, epic 1357). */
describe('world scoped-entity source contract (issue 1362)', () => {
  const SCOPED_DIR = 'src/ui/svelte/apps/manager/scoped';
  const SCOPED_PREVIEW = `${SCOPED_DIR}/ScopedEntityPreview.svelte`;
  // The Tool rail's stem is its own prop default now.
  const TOOL_PREVIEW = 'src/ui/svelte/apps/manager/tools/ToolBehaviorPreview.svelte';
  const declaredClasses = declaredManagerClasses();

  /** The seven class names `ScopedEntityPreview` renders for a given stem. */
  function renderedPreviewClasses(stem) {
    const suffixes = templateSuffixes(componentAstOf(SCOPED_PREVIEW), 'classPrefix');
    return [stem, ...new Set(suffixes.map((suffix) => `${stem}-${suffix}`))];
  }

  defineStructureContract(
    'renders the shared rail under the placement-free default stem',
    WORLD_TOOL_ENTRY,
    { attributes: [['classPrefix', 'manager-scoped-preview']] }
  );

  it('declares a rule for every class the preview shell renders, for BOTH stems', () => {
    const preview = componentAstOf(SCOPED_PREVIEW);
    assert.ok(
      templateNodes(preview).some(
        (node) =>
          node.name === 'aside' && attributeExpression(node, 'class')?.name === 'classPrefix'
      ),
      'the shell renders the bare stem as a class, which the derivation below depends on'
    );
    const defaultStem = propDefault(preview, 'classPrefix');
    const toolStem = propDefault(componentAstOf(TOOL_PREVIEW), 'classPrefix');
    assert.equal(defaultStem, 'manager-scoped-preview');
    assert.equal(toolStem, 'manager-tool-preview');

    // NON-VACUITY FIRST. The lookup is a set built by regex over a 20,000-line stylesheet.
    assert.ok(
      declaredClasses.size > 200,
      'the stylesheet scan found almost nothing, so it cannot be trusted to find an omission'
    );
    assert.equal(
      declaredClasses.has('manager-scoped-preview-not-a-real-region'),
      false,
      'the lookup can answer no, so the assertions below are measurements'
    );

    for (const stem of [defaultStem, toolStem]) {
      const classes = renderedPreviewClasses(stem);
      // SEVEN since issue 1371's parity round.
      assert.equal(
        classes.length,
        7,
        `the shell renders seven classes per stem; the derivation found ${classes.length}`
      );
      for (const className of classes) {
        assert.ok(
          declaredClasses.has(className),
          `\`styles/fabricate.css\` declares no rule for \`.${className}\`. The shell's docblock ` +
            'says both stems are declared there and this is the only thing that checks it: a ' +
            'renamed region leaves the six editors PRs 6a-c and 7 build rendering unstyled, and ' +
            'requirement 7 closes that stylesheet to all four of those lanes.'
        );
      }
    }
  });

  /** The `{key, fallback}` pair `viewTitle` declares per world scoped-entity route. */
  function scopedTitlesFromRoot() {
    const titles = new Map();
    const viewTitle = namedCodeAst(moduleAstOf(HEADER_MODEL).ast, 'viewTitle');
    for (const node of walkNodes(viewTitle)) {
      if (node.type !== 'IfStatement') continue;
      const view = comparedLiteral(node.test, 'currentView');
      const [key, fallback] = returnedTextArguments(node.consequent);
      if (String(view).startsWith('world-') && key !== undefined) titles.set(view, { key, fallback });
    }
    return titles;
  }

  /** The four facts `scopedEntryRoutes.js` records per entry route, in declaration order. */
  function declaredEntryRoutes(file) {
    const routes = [];
    for (const node of walkNodes(moduleAstOf(file).ast)) {
      if (node.type !== 'Property' || !/^world-[a-z-]+-entry$/.test(node.key?.value ?? '')) continue;
      const fact = (key) => propertyValues(node.value, key)[0];
      routes.push({
        entryView: node.key.value,
        entityType: fact('entityType'),
        catalogueView: fact('catalogueView'),
        catalogueTitleKey: fact('catalogueTitleKey'),
        catalogueTitleFallback: fact('catalogueTitleFallback'),
      });
    }
    return routes;
  }

  it('gives each of the seven placeholder pages a DISTINCT triple that matches its route', () => {
    const titles = scopedTitlesFromRoot();
    assert.equal(
      titles.size,
      7,
      'the parse of `viewTitle` found the wrong number of world scoped-entity titles, so every ' +
        'cross-check below would be against the wrong set'
    );

    // Two spellings, both read (issue 1372): a page that still delegates states the four facts as
    // attributes on `ScopedPlaceholderPage`, one a screen lane has replaced as module constants.
    // The `WorldComponentEntry*` children declare no route identity, so they are excluded by name.
    const SCOPED_ENTRY_CHILDREN = new Set([
      'WorldComponentEntryPreviewRail.svelte',
      'WorldComponentEntrySourceCard.svelte',
      'WorldComponentEntrySystemsCard.svelte',
    ]);
    const pages = readdirSync(resolve(repoRoot, SCOPED_DIR))
      .filter(
        (entry) =>
          entry.startsWith('World') &&
          entry.endsWith('.svelte') &&
          !SCOPED_ENTRY_CHILDREN.has(entry)
      )
      .map((entry) => {
        const page = componentAstOf(`${SCOPED_DIR}/${entry}`);
        const declared = (attribute, constant) =>
          constantLiteral(page, constant) ?? attributeLiteral(page, attribute);
        return {
          file: entry,
          pageId: declared('pageId', 'PAGE_ID'),
          icon: declared('icon', 'PAGE_ICON'),
          titleKey: declared('titleKey', 'TITLE_KEY'),
          titleFallback: declared('titleFallback', 'TITLE_FALLBACK'),
        };
      });
    // Non-vacuity: a set of seven `undefined` ids has size one, which the distinctness assertions
    // below would catch, but seven missing title fallbacks would not — nothing else reads that
    // field.
    for (const page of pages) {
      for (const field of ['pageId', 'icon', 'titleKey', 'titleFallback']) {
        assert.equal(
          typeof page[field],
          'string',
          `${page.file} declares no ${field} in either supported spelling`
        );
      }
    }
    assert.equal(pages.length, 7, 'seven world scoped-entity pages');

    for (const field of ['pageId', 'icon', 'titleKey']) {
      assert.equal(
        new Set(pages.map((page) => page[field])).size,
        7,
        `two pages share a ${field}: one of the seven routes is wearing another identity`
      );
    }

    for (const page of pages) {
      const declared = titles.get(page.pageId);
      assert.ok(
        Boolean(declared),
        `${page.file} claims the route \`${page.pageId}\`, which \`viewTitle\` does not title`
      );
      // The swap detector. The page resolves the screen's name for its `<main>` accessible name
      // and the header resolves it again for the `<h1>`, out of two different files; a swapped key
      // renders a page titled after its sibling, which the View Lab would publish as a frame.
      assert.equal(
        page.titleKey,
        declared.key,
        `${page.file} must carry the title key the header uses for \`${page.pageId}\``
      );
      assert.equal(page.titleFallback, declared.fallback, `${page.file} fallback must match`);
      assert.equal(
        typeof catalogValue(page.titleKey),
        'string',
        `${page.titleKey} must resolve to a string in \`lang/en.json\``
      );
    }
  });

  it('roots each entry route at its own catalogue, under that catalogue title key', () => {
    const titles = scopedTitlesFromRoot();
    const declared = declaredEntryRoutes(`${SCOPED_DIR}/scopedEntryRoutes.js`);
    assert.deepEqual(
      declared.map((route) => route.entryView),
      ['world-component-entry', 'world-essence-entry', 'world-tool-entry'],
      'three entry routes, one per scoped entity type'
    );
    for (const route of declared) {
      const { entryView, entityType, catalogueView, catalogueTitleKey, catalogueTitleFallback } =
        route;
      assert.ok(titles.has(entryView), `${entryView} is one of the seven titled routes`);
      const catalogue = titles.get(catalogueView);
      assert.ok(Boolean(catalogue), `${entryView} returns to \`${catalogueView}\`, a real route`);
      // The middle crumb names the catalogue with the SAME string the catalogue own header
      // uses. Two copies of one lang key is exactly the mirror this suite exists to hold.
      assert.equal(catalogueTitleKey, catalogue.key, `${entryView} catalogue crumb key`);
      assert.equal(catalogueTitleFallback, catalogue.fallback, `${entryView} catalogue crumb copy`);
      assert.ok(
        catalogueView.startsWith(`world-${entityType.slice(0, 4)}`),
        `${entryView} must return to the catalogue of its OWN entity type`
      );
    }
  });

  // The crumb is shell chrome, and `### GM World Scoped Entity Routes` requirement 7 closes the
  // shell to PRs 6a, 6b and 6c - so an entry editor, released to full width and therefore
  // rendering no inspector, would have had no way back at all if this were left to them.
  it('renders the entry trail as three crumbs, the middle one a button back to the catalogue', () => {
    const root = componentAstOf(MANAGER_ROOT);
    const crumbs = templateNodes(root).filter((node) =>
      declaresAttribute(node, 'data-breadcrumb-world-scoped-catalogue', { directives: false })
    );
    assert.equal(crumbs.length, 1, 'the entry trail draws one intermediate catalogue crumb');
    const [crumb] = crumbs;
    assert.equal(crumb.name, 'button', 'and it is a real button, not a static crumb');
    const navigation = attributeExpression(crumb, 'onclick');
    assert.ok(callNames(navigation).has('setView'), 'the crumb navigates');
    assert.ok(
      memberPaths(navigation).includes('worldScopedEntryRoute.catalogueView'),
      'to the catalogue the entry route records, rather than to a second copy of that mapping'
    );

    // AND THE SUBJECT REACHES IT WITHOUT REOPENING THIS FILE. A catalogue row in PR 6a calls
    // `onOpenEntry(entityId)`; the shell records the subject, performs the navigation through
    // the confirm-discard gate, and resolves the name out of the published world corpus.
    for (const [catalogue, entry] of [
      ['WorldComponentCataloguePage', 'world-component-entry'],
      ['WorldEssenceCataloguePage', 'world-essence-entry'],
      ['WorldToolCataloguePage', 'world-tool-entry'],
    ]) {
      const page = templateNodes(root).find((node) => node.name === catalogue);
      assert.ok(Boolean(page), `${catalogue} is rendered by the shell`);
      assert.ok(carriesSpread(page), `${catalogue} takes the shared scope props`);
      const open = attributeExpression(page, 'onOpenEntry');
      assert.ok(callNames(open).has('openWorldScopedEntry'), `${catalogue} opens an entry route`);
      assert.ok(literalStrings(open).includes(entry), `${catalogue} opens \`${entry}\``);
    }
  });

  defineStructureContract(
    'and routes that open through the same confirm-discard gate every navigation passes',
    { file: MANAGER_ROOT, fn: 'openWorldScopedEntry' },
    { callsWith: [['confirmRouteExit', 'view']] }
  );
});
