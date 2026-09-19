import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { classMemberSource, moduleFunctionSource } from '../helpers/boundedSource.js';
import {
  calledName,
  declaredConstant as declaredConstantOf,
  identifierNames,
  importsModule as importsModuleOf,
  importsModuleLazily,
  literalStrings,
  referencesIdentifier as referencesIdentifierOf,
  walkNodes,
} from '../helpers/moduleAst.js';
import { componentAstOf, componentScopeOf, moduleAstOf } from '../helpers/parsedSource.js';
import {
  containsLiteral,
  declaredConstant,
  declaresAttribute,
  declaresProp,
  importsModule,
  passesProp,
  readsGlobal,
  referencesIdentifier,
  rendersComponent,
  requiresProp,
  spellsLiteral,
} from '../helpers/svelteStructureContract.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dirname, '../..');
const rootPath = resolve(repoRoot, 'src/ui/svelte/apps/manager/CraftingSystemManagerRoot.svelte');
const essenceBrowserPath = resolve(
  repoRoot,
  'src/ui/svelte/apps/manager/EssenceBrowserView.svelte'
);
const essenceEditPath = resolve(repoRoot, 'src/ui/svelte/apps/manager/EssenceEditView.svelte');
// The GM Essence Studio's own components (issue 1036). They sit under `essences/`.
const essenceStudioDir = resolve(repoRoot, 'src/ui/svelte/apps/manager/essences');
const tagsCategoriesPath = resolve(
  repoRoot,
  'src/ui/svelte/apps/manager/TagsCategoriesView.svelte'
);
const systemEditPath = resolve(repoRoot, 'src/ui/svelte/apps/manager/SystemEditView.svelte');
// World > Currency (issue 1278): the relocated currency editor.
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
  'src/ui/svelte/components/ArmedDangerButton.svelte'
);
const knowledgeComponentDir = resolve(repoRoot, 'src/ui/svelte/apps/manager/knowledge');
const toolsBrowserPath = resolve(repoRoot, 'src/ui/svelte/apps/manager/ToolsBrowserView.svelte');
const toolEditPath = resolve(repoRoot, 'src/ui/svelte/apps/manager/ToolEditView.svelte');
const toolBreakagePath = resolve(
  repoRoot,
  'src/ui/svelte/apps/manager/tools/ToolBreakageTab.svelte'
);
// The system-scope band that replaced the retired Overview tab (issue 1373).
const toolSystemScopePath = resolve(
  repoRoot,
  'src/ui/svelte/apps/manager/tools/ToolSystemScopeCards.svelte'
);
const toolInheritCardPath = resolve(
  repoRoot,
  'src/ui/svelte/apps/manager/tools/ToolInheritCard.svelte'
);
const toolRequirementsPath = resolve(
  repoRoot,
  'src/ui/svelte/apps/manager/tools/ToolRequirementsTab.svelte'
);
const toolValidationPath = resolve(
  repoRoot,
  'src/ui/svelte/apps/manager/tools/ToolValidationTab.svelte'
);
// The Checks Studio's own modifier catalogue, read here for ONE reason.
const craftingModifierCataloguePath = resolve(
  repoRoot,
  'src/ui/svelte/apps/manager/checks/CraftingModifierCatalogueCard.svelte'
);
const appPath = resolve(repoRoot, 'src/ui/SvelteCraftingSystemManagerApp.svelte.js');
const langPath = resolve(repoRoot, 'lang/en.json');

const rootSource = readFileSync(rootPath, 'utf8');
// The reward and event limit counts are one shared component (issue 1050).
const gatheringRuleLimitStepperSource = readFileSync(
  resolve(repoRoot, 'src/ui/svelte/apps/manager/environment/GatheringRuleLimitStepper.svelte'),
  'utf8'
);
const essenceBrowserSource = readFileSync(essenceBrowserPath, 'utf8');
// The paginated rows/columns are the shared studio-library shelf now.
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
const worldModifiersSource = readFileSync(
  resolve(repoRoot, 'src/ui/svelte/apps/manager/world/WorldModifiersTab.svelte'),
  'utf8'
);
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
const toolSystemScopeSource = readFileSync(toolSystemScopePath, 'utf8');
const toolInheritCardSource = readFileSync(toolInheritCardPath, 'utf8');
const toolEditorTabsSource = readFileSync(
  resolve(repoRoot, 'src/ui/svelte/apps/manager/tools/ToolEditorTabs.svelte'),
  'utf8'
);
const toolRequirementsSource = readFileSync(toolRequirementsPath, 'utf8');
const toolValidationSource = readFileSync(toolValidationPath, 'utf8');
const craftingModifierCatalogueSource = readFileSync(craftingModifierCataloguePath, 'utf8');
// The WORLD Tool entry, which took the linked-item card off the system editor (issue 1373).
const worldToolEntrySource = readFileSync(
  resolve(repoRoot, 'src/ui/svelte/apps/manager/scoped/WorldToolEntryPage.svelte'),
  'utf8'
);
const appSource = readFileSync(appPath, 'utf8');
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

function sourceName(filePath) {
  return filePath.replace(`${repoRoot}\\`, '').replace(`${repoRoot}/`, '');
}

// A structural claim is a ROW in a `defineStructureContract` table, never another
// parse-and-assert pair: the repeated pair is the shape the duplication gate fails (issue 1691).

function classMemberAst(ast, name) {
  for (const node of walkNodes(ast)) {
    if (node.type === 'MethodDefinition' && node.key?.name === name) return node;
  }
  throw new Error(`no class member \`${name}\``);
}

/** Every element or component node in a template, for the claims that COUNT render sites. */
function templateNodes(component) {
  const nodes = [];
  for (const node of walkNodes(component.fragment)) {
    if (node.type === 'RegularElement' || node.type === 'Component') nodes.push(node);
  }
  return nodes;
}

function propertyAst(node, name) {
  for (const inner of walkNodes(node)) {
    if (inner.type === 'Property' && inner.key?.name === name) return inner.value;
  }
  throw new Error(`no property \`${name}\``);
}

/** Every `a.b.c` chain a subtree reads, optional links flattened, `this` spelled out. */
function memberPaths(node) {
  const paths = [];
  for (const inner of walkNodes(node)) {
    if (inner.type !== 'MemberExpression' || inner.computed) continue;
    const parts = [];
    let cursor = inner;
    while (cursor?.type === 'MemberExpression' && !cursor.computed) {
      parts.unshift(cursor.property?.name);
      cursor = cursor.object;
    }
    if (cursor?.type === 'Identifier') parts.unshift(cursor.name);
    else if (cursor?.type === 'ThisExpression') parts.unshift('this');
    else continue;
    if (parts.every(Boolean)) paths.push(parts.join('.'));
  }
  return paths;
}

function callNames(node) {
  const names = new Set();
  for (const inner of walkNodes(node)) {
    const called = calledName(inner);
    if (called) names.add(called);
  }
  return names;
}

/** Directly, or through a mapped list. */
function hookNames(node) {
  const events = new Set();
  for (const inner of walkNodes(node)) {
    if (inner.type !== 'CallExpression') continue;
    if (registersAHook(inner)) {
      const [event] = inner.arguments;
      if (event?.type === 'Literal' && typeof event.value === 'string') events.add(event.value);
    }
    // A mapped list names its events; the registration itself carries only the loop variable.
    const source = inner.callee?.object;
    if (calledName(inner) !== 'map' || source?.type !== 'ArrayExpression') continue;
    if ([...walkNodes(inner.arguments[0] ?? {})].some(registersAHook)) {
      for (const literal of literalStrings(source)) events.add(literal);
    }
  }
  return events;
}

function registersAHook(node) {
  if (node?.type !== 'CallExpression') return false;
  const called = calledName(node);
  const bus = node.callee?.object?.name;
  return (called === 'on' || called === 'once') && (bus === 'Hooks' || bus === 'hooks');
}

/** The keys a subtree tests with `in` against the named object. */
function inOperatorKeys(node, objectName) {
  const keys = new Set();
  for (const inner of walkNodes(node)) {
    if (inner.type !== 'BinaryExpression' || inner.operator !== 'in') continue;
    if (inner.right?.name !== objectName) continue;
    if (inner.left?.type === 'Literal') keys.add(String(inner.left.value));
  }
  return keys;
}

function comparesToLiteral(node, value) {
  for (const inner of walkNodes(node)) {
    if (inner.type !== 'BinaryExpression') continue;
    if ([inner.left, inner.right].some((side) => side?.type === 'Literal' && side.value === value)) {
      return true;
    }
  }
  return false;
}

function extendsCallOf(node, name) {
  for (const inner of walkNodes(node)) {
    if (inner.type !== 'ClassDeclaration' && inner.type !== 'ClassExpression') continue;
    if (calledName(inner.superClass) === name) return true;
  }
  return false;
}

function exportedNames(node) {
  const names = new Set();
  for (const inner of walkNodes(node)) {
    if (inner.type !== 'ExportNamedDeclaration') continue;
    for (const declarator of inner.declaration?.declarations ?? []) {
      if (declarator.id?.name) names.add(declarator.id.name);
    }
    if (inner.declaration?.id?.name) names.add(inner.declaration.id.name);
    for (const specifier of inner.specifiers ?? []) {
      if (specifier.exported?.name) names.add(specifier.exported.name);
    }
  }
  return names;
}

function callsWithArgument(node, [name, argument]) {
  for (const inner of walkNodes(node)) {
    if (inner.type !== 'CallExpression' || calledName(inner) !== name) continue;
    if (inner.arguments.some((value) => identifierNames(value).has(argument))) return true;
  }
  return false;
}

/**
 * A repo-relative path, optionally narrowed to one class member and one of its properties — the
 * AST equivalent of the bounded text slice it replaces — with the claims its kind can answer.
 */
function structureOf(target) {
  const { file, member, property } = typeof target === 'string' ? { file: target } : target;
  if (file.endsWith('.svelte')) {
    const component = componentAstOf(file);
    const scope = componentScopeOf(file);
    return {
      renders: (name) => rendersComponent(component, name),
      imports: (specifier) => importsModule(component, specifier),
      declares: (name) => declaredConstant(component, name),
      names: (name) => referencesIdentifier(component, name),
      spells: (text) => containsLiteral(component, text),
      spellsExactly: (text) => spellsLiteral(component, text),
      global: (name) => readsGlobal(scope, name),
      prop: ([name, propName]) => passesProp(component, name, propName),
      reads: (path) => memberPaths(component).includes(path),
      calls: (name) => callNames(component).has(name),
      callsWith: (pair) => callsWithArgument(component, pair),
      compares: (value) => comparesToLiteral(component, value),
      declaresProp: (name) => declaresProp(component, name),
      requiresProp: (name) => requiresProp(component, name),
    };
  }
  const { ast } = moduleAstOf(file);
  let code = member ? classMemberAst(ast, member) : ast;
  if (property) code = propertyAst(code, property);
  return {
    imports: (specifier) => importsModuleOf(code, specifier),
    importsLazily: (specifier) => importsModuleLazily(code, specifier),
    declares: (name) => declaredConstantOf(code, name),
    names: (name) => referencesIdentifierOf(code, name),
    spells: (text) => literalStrings(code).some((literal) => literal.includes(text)),
    spellsExactly: (text) => literalStrings(code).includes(text),
    reads: (path) => memberPaths(code).includes(path),
    calls: (name) => callNames(code).has(name),
    callsWith: (pair) => callsWithArgument(code, pair),
    extendsCall: (name) => extendsCallOf(code, name),
    exports: (name) => exportedNames(code).has(name),
    hooks: (event) => hookNames(code).has(event),
    diffKeys: ([object, key]) => inOperatorKeys(code, object).has(key),
    compares: (value) => comparesToLiteral(code, value),
  };
}

/** Each claim a contract row may make: the question to ask, and the answer it must get. */
const CONTRACT_CLAIMS = Object.freeze({
  renders: { ask: 'renders', holds: true, says: (v) => `renders <${v}>` },
  rendersNo: { ask: 'renders', holds: false, says: (v) => `no longer renders <${v}>` },
  imports: { ask: 'imports', holds: true, says: (v) => `imports ${v}` },
  importsNo: { ask: 'imports', holds: false, says: (v) => `no longer imports ${v}` },
  importsLazily: { ask: 'importsLazily', holds: true, says: (v) => `imports ${v} lazily` },
  declares: { ask: 'declares', holds: true, says: (v) => `declares const ${v}` },
  names: { ask: 'names', holds: true, says: (v) => `names ${v}` },
  namesNo: { ask: 'names', holds: false, says: (v) => `no longer names ${v}` },
  spells: { ask: 'spells', holds: true, says: (v) => `spells "${v}"` },
  spellsNo: { ask: 'spells', holds: false, says: (v) => `no longer spells "${v}"` },
  spellsExactly: { ask: 'spellsExactly', holds: true, says: (v) => `spells "${v}" in full` },
  reads: { ask: 'reads', holds: true, says: (v) => `reads ${v}` },
  readsNo: { ask: 'reads', holds: false, says: (v) => `never reads ${v}` },
  calls: { ask: 'calls', holds: true, says: (v) => `calls ${v}()` },
  callsNo: { ask: 'calls', holds: false, says: (v) => `never calls ${v}()` },
  callsWith: { ask: 'callsWith', holds: true, says: ([f, a]) => `calls ${f}() with ${a}` },
  declaresProp: { ask: 'declaresProp', holds: true, says: (v) => `declares the ${v} prop` },
  requiresProp: {
    ask: 'requiresProp',
    holds: true,
    says: (v) => `declares ${v} with no fallback, so an unthreaded caller fails loudly`,
  },
  exports: { ask: 'exports', holds: true, says: (v) => `exports ${v}` },
  extendsCall: { ask: 'extendsCall', holds: true, says: (v) => `extends ${v}()` },
  hooks: { ask: 'hooks', holds: true, says: (v) => `registers the ${v} hook` },
  diffKeys: { ask: 'diffKeys', holds: true, says: ([o, k]) => `re-projects on a ${o}.${k} change` },
  compares: { ask: 'compares', holds: true, says: (v) => `compares against ${v}` },
  comparesNo: { ask: 'compares', holds: false, says: (v) => `hard-codes no comparison to ${v}` },
  passesProps: { ask: 'prop', holds: true, says: ([c, p]) => `passes ${p} to every <${c}>` },
  readsNoGlobal: { ask: 'global', holds: false, says: (v) => `reads no ${v} global directly` },
});

const APP_SHELL = 'src/ui/SvelteCraftingSystemManagerApp.svelte.js';
const MAIN = 'src/main.js';
const MANAGER_ROOT = 'src/ui/svelte/apps/manager/CraftingSystemManagerRoot.svelte';
const DOWNTIME_HOST = 'src/ui/svelte/apps/manager/downtime/WorldDowntimeExtensionHost.svelte';
const MANAGER_EXTENSIONS = 'src/ui/managerExtensions.js';
const DOWNTIME_PREVIEW_PROVIDER =
  'src/ui/svelte/apps/manager/downtime/worldDowntimePreviewProvider.js';

/** One target, one contract test; every converted structural pin is one row of `claims`. */
function defineStructureContract(title, target, claims) {
  it(title, () => {
    const subject = structureOf(target);
    const label =
      typeof target === 'string'
        ? target
        : [target.file, target.member, target.property].filter(Boolean).join(' > ');
    for (const [kind, rows] of Object.entries(claims)) {
      const claim = CONTRACT_CLAIMS[kind];
      assert.equal(typeof subject[claim.ask], 'function', `${label} cannot answer "${kind}"`);
      for (const row of rows) {
        assert.equal(subject[claim.ask](row), claim.holds, `${label} ${claim.says(row)}`);
      }
    }
  });
}

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
    const sites = templateNodes(componentAstOf(MANAGER_ROOT))
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

  // `Document#testUserPermission` short-circuits every GM to OWNER, so GMs are filtered first. No
  // other file states that `Users#players` is the roster this reads, so it stays asserted here.
  defineStructureContract('derives the access rosters from the non-GM roster', APP_SHELL, {
    reads: ['game.users.players'],
    calls: ['_playerUsers'],
    readsNo: ['actor.isOwner'],
    namesNo: ['playedBy'],
  });

  // The fallback must agree with `Users#players` (`!u.isGM && u.hasRole('PLAYER')`).
  defineStructureContract(
    'falls back to the same role floor the canonical roster applies',
    { file: APP_SHELL, member: '_playerUsers' },
    { calls: ['hasRole'], spells: ['PLAYER'], reads: ['globalThis.CONST.USER_ROLES.PLAYER'] }
  );

  defineStructureContract(
    'labels only the roles a grantable user can hold',
    { file: APP_SHELL, member: '_userRoleLabel' },
    { spells: ['USER.RolePlayer'], spellsNo: ['RoleGamemaster'] }
  );

  defineStructureContract(
    'models "who plays this character" as a SET, with the whole-table case explicit',
    { file: APP_SHELL, member: '_describeAccessActor' },
    {
      reads: ['actor.testUserPermission', 'user.character.id', 'actor.ownership.default'],
      names: ['controlledBy', 'sharedWithAllPlayers'],
      spells: ['OWNER'],
    }
  );

  defineStructureContract(
    'resolves granted character ids over every world actor',
    { file: APP_SHELL, member: '_buildServices', property: 'getAccessCharacterActors' },
    { namesNo: ['isPlayerCharacterActor'] }
  );

  defineStructureContract(
    'defines the world Item projection in the service set',
    { file: APP_SHELL, member: '_buildServices' },
    { names: ['getWorldItemOptions'] }
  );

  defineStructureContract(
    'resolves a Tool source through the uuid seam, not the world roster',
    { file: APP_SHELL, member: '_buildServices', property: 'resolveToolSource' },
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
    { file: APP_SHELL, member: '_buildServices', property: 'getVocabularyScopeStore' },
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
    { file: APP_SHELL, member: '_buildServices' },
    { names: ['isFabricateReady', 'onFabricateReady'] }
  );

  defineStructureContract(
    'defers a direct open, once, until Fabricate reports ready',
    { file: APP_SHELL, member: 'show' },
    { names: ['_pendingReadyOpen'], spells: ['StartupPending'] }
  );

  it('loads the systems browser behind that guard', () => {
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
    // `class="manager-empty"` is NOT in this list any more (issue 785).
    for (const snippet of [
      'class="manager-main"',
      '<ManagerToolbar',
      'class="manager-filter"',
      "import EmptyState from '../../components/EmptyState.svelte'",
      '<EmptyState',
    ]) {
      assert.ok(managerSource.includes(snippet), `manager source should include ${snippet}`);
    }
    // `class={componentTableClass}` is GONE (issue 676).
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
    // The modifier editor is formula-only: one labelled expression field.
    assert.ok(
      !worldModifiersSource.includes('ProviderExpressionInput'),
      'modifier editor should not import the deleted provider/expression component'
    );
    assert.ok(
      !worldModifiersSource.includes('characterModifierProviderLabel'),
      'modifier editor should not render a provider label'
    );
    assert.ok(
      !worldModifiersSource.includes('manager-character-modifier-provider'),
      'modifier summary should not render a provider chip'
    );
    assert.ok(
      /onUpdate\(entry\.id, \{ expression \}\)/.test(worldModifiersSource),
      'modifier editor should bind the expression field through RollDataExpressionInput'
    );
    assert.ok(
      worldModifiersSource.includes('FABRICATE.Admin.Manager.Modifiers.Expression'),
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
      // The unit card's collapsed summary row reuses the character-modifier summary class.
      'manager-character-modifier-summary',
      // The sub-unit token is the shared `Chip` as of issue 1515.
      'data-world-currency-subunit={contained.unitId}',
      'manager-currency-subunit-amount',
    ]) {
      assert.ok(
        worldCurrencySource.includes(snippet),
        `WorldCurrencyTab should include ${snippet}`
      );
    }
    // Asserted as patterns rather than snippets in the list above.
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
    // Shorthand for `onAddCurrencySubUnit={onAddCurrencySubUnit}`.
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
      // Issue 1510: the shared `<Select>` hands the caller its OWN typed value.
      'onChange={(next) => onSetCurrencySpendStrategy(next)}',
      // The single shared strategy hint reflects the selected strategy.
      'data-world-currency-strategy-hint',
      'currencySpendStrategyHint()',
      'data-world-currency-provider-select',
      'onChange={(next) => onSetCurrencyProvider(next)}',
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
    // Sub-units only drive the engine in actorProperty mode.
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
    // The read-only branch precedes the editable branch.
    assert.ok(
      worldCurrencySource.indexOf('data-world-currency-provider-managed') <
        worldCurrencySource.indexOf('class="manager-currency-subunit-amount"'),
      'provider-managed read-only branch should render before the editable unit list'
    );
    for (const prop of [
      '{currencyProviderId}',
      '{currencyMacros}',
      '{currencyProviderOptions}',
      // Shorthand, like the three above.
      '{onSetCurrencySpendStrategy}',
      '{onSetCurrencyProvider}',
      '{onSetCurrencyMacro}',
      '{onClearCurrencyMacro}',
      // The world currency validation report (issue 1493).
      '{currencyValidationErrors}',
    ]) {
      assert.ok(rootSource.includes(prop), `root should thread ${prop} to WorldCurrencyTab`);
    }
    // --- The world currency validation join (issue 1493) ---------------------------------
    // `validateCurrencyProfile` shipped with ZERO callers in the manager, so a world whose
    // currency profile could not be spent against said nothing at all on the page that authors
    // it. What makes it visible is a THREE-link join: `adminStore` publishes
    // `worldCurrencyValidation`, the root derives `currencyValidationErrors` off it, and the
    // root threads that to `WorldCurrencyTab`.
    const worldCurrencyTag = /<WorldCurrencyTab\b[\s\S]*?\/>/.exec(rootSource)?.[0] ?? '';
    assert.ok(worldCurrencyTag.length > 0, 'root should render a self-closing <WorldCurrencyTab />');
    assert.ok(
      worldCurrencyTag.includes('{currencyValidationErrors}'),
      'root should thread {currencyValidationErrors} on the WorldCurrencyTab tag itself'
    );
    assert.ok(
      /currencyValidationErrors\s*=\s*\[\]/.test(worldCurrencySource),
      'WorldCurrencyTab should DECLARE currencyValidationErrors in its $props(); an undeclared prop is silently dropped'
    );
    assert.ok(
      worldCurrencySource.includes('data-world-currency-validation'),
      'WorldCurrencyTab should render the validation live region the threaded errors feed'
    );
    assert.ok(
      rootSource.includes('$viewState.worldCurrencyValidation'),
      'root should read the store-published worldCurrencyValidation report, not invent its own'
    );
    assert.ok(
      /const currencyValidationErrors = \$derived\([\s\S]{0,200}?worldCurrencyValidation\.errors/.test(
        rootSource
      ),
      'root should derive currencyValidationErrors FROM the published report'
    );
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
    // The row Edit pencil reuses the Books & Scrolls icon-button + pen idiom.
    assert.ok(
      // `<IconButton class="manager-recipe-edit">` since issue 1422: the contract class is
      // emitted by the primitive, so asserting it at the call site would now assert the
      // convention this change removed.
      /<IconButton\s+class="manager-recipe-edit"/.test(recipesBrowserSource),
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
    // The four row states are one component rather than four ad-hoc chips. The tones stay
    // distinguishable: warning = blocked but already enabled, danger = blocked AND off, i.e.
    assert.ok(
      recipesBrowserSource.includes("import Chip from '../../components/Chip.svelte'"),
      'the row should render its states through the shared Chip'
    );
    // AND THROUGH THE TONE MAP, which is the half a source pin can see and a mounted test
    // cannot: the projection emits the retired pill's vocabulary, `Chip` DROPS a tone it does
    // not know, and an unmapped row therefore renders an untoned chip on a green suite.
    assert.ok(
      recipesBrowserSource.includes('tone={statusChipTone(pill.tone)}'),
      'and the projected tone should be mapped rather than bound straight onto the chip'
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

  // `foundry` is deliberately NOT in the set: the root reaches `globalThis.foundry.utils.parseUuid`
  // and `.agents/docs/foundry-and-architecture.md` requires it keep doing so.
  defineStructureContract('keeps presentational Svelte free of direct Foundry globals', MANAGER_ROOT, {
    readsNoGlobal: ['game', 'ui', 'Hooks', 'CONFIG'],
  });

  defineStructureContract('uses manager localization keys rather than hard-coded copy', MANAGER_ROOT, {
    // In full: a substring claim is satisfied by `…Titlebar.Premium` next door. The mounted cases
    // render this copy, which `text(key, fallback)` still produces under a renamed key.
    spellsExactly: [
      'FABRICATE.Admin.Manager.Title',
      'FABRICATE.Admin.Manager.Soon',
      'FABRICATE.Admin.Manager.Titlebar.Premium',
    ],
    spellsNo: ['EncountersPlaceholderTitle', 'EncountersPlaceholderHint'],
  });

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
  });

  it('renames the recipe resolution-mode legend and offers a salvage resolution-mode card', () => {
    // The recipe card legend is renamed.
    assert.equal(lang.FABRICATE.Admin.SystemSettings.ResolutionMode, 'Recipe resolution mode');
    // `legend=` since issue 1509 phase 3.
    assert.ok(
      craftingSettingsSource.includes('legend="Recipe resolution mode"'),
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

  it('authors straight, d100 and routed on each task rather than the gathering economy', () => {
    const gatheringEconomySource = readFileSync(
      resolve(repoRoot, 'src/ui/svelte/apps/manager/GatheringEconomyView.svelte'),
      'utf8'
    );
    assert.ok(
      !gatheringEconomySource.includes('data-gathering-resolution-mode'),
      'the inert economy mode has no authoring selector'
    );
    const taskEditorSource = readFileSync(
      resolve(repoRoot, 'src/ui/svelte/apps/manager/GatheringTaskEditView.svelte'),
      'utf8'
    );
    assert.ok(taskEditorSource.includes('<RadioCardGroup'), 'task mode reuses the shared radio cards');
    const optionsMatch = taskEditorSource.match(
      /resolutionModeOptions\s*=\s*\[([\s\S]*?)\];/
    );
    assert.ok(optionsMatch, 'the task editor defines its mode choices');
    const optionsBlock = optionsMatch[1];
    for (const mode of ['straight', 'd100', 'routed']) {
      assert.ok(optionsBlock.includes(`value: '${mode}'`), `the task offers ${mode}`);
    }
    assert.ok(!optionsBlock.includes("value: 'progressive'"), 'dormant progressive is not offered');
    assert.ok(!optionsBlock.includes('disabled:'), 'all three authored modes are selectable');
    assert.ok(taskEditorSource.includes('onUpdateTask({ resolutionMode: mode })'), 'mode edits patch the task');
    assert.ok(rootSource.includes('resolutionMode={gatheringTaskResolutionMode}'), 'the parent supplies the task mode');
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

    // The System Overview page is the renamed system-edit route.
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
    assert.ok(
      !rootSource.includes('SystemEdit.PageTitle'),
      'no consumer references the retired page-title key'
    );
    assert.ok(
      rootSource.includes(
        "selectedSystem?.name || text('FABRICATE.Admin.Manager.SystemEdit.Nav', 'System Overview')"
      ),
      'the page title is the selected system name, falling back to the route name when there is ' +
        'no selection rather than rendering an empty heading'
    );
    assert.ok(
      rootSource.includes(
        "text('FABRICATE.Admin.Manager.SystemEdit.PageBreadcrumb', 'System Overview')"
      ),
      'the breadcrumb tail still names the route'
    );
    assert.ok(
      rootSource.includes("text('FABRICATE.Admin.Manager.SystemEdit.Nav', 'System Overview')"),
      'the renamed nav item reads System Overview'
    );

    // The standalone Overview route was folded into the system-edit page.
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

    // The page is a full-width tabbed shell mirroring the environment editor.
    assert.ok(
      /id: 'system-edit',\s*\n\s*layoutClass: 'full-width-2-track'/.test(rootSource) &&
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

    // The inspector is ONE column on the panel background (issue 643).
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

    // `Edit recipe` is the point of the inspector.
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

    // The reserved alchemy-Simple failure group is SHOWN (danger-toned).
    assert.ok(
      recipeBrowserInspectorSource.includes(
        "data-recipe-produces={row.failure ? 'failure' : 'success'}"
      ),
      'every produced group is rendered, toned by role'
    );
  });

  it('keeps first-slice action and navigation hierarchy focused', () => {
    // ISSUE 1515 REVERSED THE TWO CLAUSES THAT USED TO STAND HERE. They said the top bar renders
    // "only the page title and subtitle", and no view kicker, which was true of the SHELL and
    // false of the product: six routes drew their own eyebrow a few pixels lower, inside a second
    // page header of their own. Deleting those headers moved the eyebrow up rather than removing
    // it, so the shell resolves one per route — and the clause the old assertions were really
    // protecting, that an eyebrow must not restate the title, is now stated positively below.
    assert.ok(
      rootSource.includes('function viewKicker'),
      'the shell resolves the page eyebrow per route, beside viewTitle and viewSubtitle'
    );
    assert.ok(
      rootSource.includes('{viewKicker()}'),
      'and renders it in the page header rather than leaving the resolver unread'
    );
    // NO EYEBROW ON `system-edit`, deliberately.
    const kickerBody = rootSource.slice(
      rootSource.indexOf('function viewKicker'),
      rootSource.indexOf('function viewTitle')
    );
    assert.ok(kickerBody.length > 0, 'the viewKicker body read is broken');
    assert.ok(
      !kickerBody.includes("'system-edit'"),
      'system-edit renders no eyebrow; its title is the record and its trail names the route'
    );
    assert.ok(
      !kickerBody.includes('viewTitle('),
      'and no route resolves its eyebrow from its own title'
    );
    assert.ok(
      rootSource.includes('visiblePlaceholderViews'),
      'root should derive selected-system placeholder nav from selection and feature gates'
    );
    // Issue 745: the Crafting group is unconditional (v1.3 headline).
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
      /id: 'graph',[\s\S]{0,600}?icon: 'fas fa-project-diagram'/.test(rootSource),
      'the Graph placeholder should remain in the planned placeholder list'
    );
    // And it carries its rail id as a COMPLETE LITERAL (issue 1362).
    assert.ok(
      rootSource.includes("navId: 'manager-nav-graph'"),
      'the Graph placeholder declares its rail id as a complete literal'
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
    // The rail card SELECTS (issue 643).
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
    // `<StatusToggle`, not the class literal (issue 1040). The row's switch renders through
    // the shared primitive, which is the only thing under `src/` that writes
    // `manager-status-toggle` now, so a search for the class would read 0 while the control
    // is present and correct.
    assert.ok(
      systemsBrowserSource.includes('<StatusToggle'),
      'systems browser should render status as a toggle control'
    );
    assert.ok(
      recipesBrowserSource.includes('<StatusToggle'),
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
    // The legacy system-library header rendered an admin launch button beside Import.
    assert.ok(
      /<ManagerButton[^<>]*\bdata-manager-import-system\b[^<>]*onclick=\{importSystem\}[^<>]*>/.test(
        rootSource
      ),
      'the system library header should still render Import — the absence check below is ' +
        'vacuous against a header that no longer exists'
    );
    assert.ok(
      !rootSource.includes('openCurrentAdmin'),
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
      rootSource.includes('https://mistersilver-uk.github.io/fabricate/help/quickstart'),
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
      rootSource.includes('https://mistersilver-uk.github.io/fabricate/gathering/environments'),
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
      recipeBrowserInspectorSource.includes('https://mistersilver-uk.github.io/fabricate/crafting/recipes/'),
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
        'https://mistersilver-uk.github.io/fabricate/components/'
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
    // The COMPONENT category vocabulary (issue 676).
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
    // The SOURCE COLUMN is retired with the table (issue 1036). It reported one bit.
    assert.ok(
      !essenceBrowserSource.includes('manager-essence-source-cell-image'),
      'the source column and its image cell are retired with the table head'
    );
    // AND SO IS THE SOURCE-STATE SELECT (issue 1372, maintainer parity round 8). The reference's
    // bar carries ONE filter beside the search field — the membership pair — and this bar carried
    // four. A broken link is still findable: the row's summary line NAMES the source and marks
    // the breakage, the search box reads that name, and the `Effects` chip carries it in its own
    // tone and title.
    assert.ok(
      !essenceBrowserSource.includes('data-essence-source-filter'),
      'the source-state select is a control the reference does not draw'
    );
    assert.ok(
      !essenceBrowserSource.includes('data-essence-status-filter'),
      'and neither is the status segment'
    );
    assert.ok(
      essenceBrowserSource.includes('data-essence-membership-filter'),
      'NON-VACUITY: the one filter the reference DOES draw is still on the bar'
    );
    // Browser state is LIFTED to the root, which is criterion 12: search, filters.
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
    // The Save button now lives in the SHARED `ComponentEditorHeader`.
    assert.ok(
      rootSource.includes('formId="manager-essence-edit-form"'),
      'root header should own the primary save action for the edit form'
    );
    assert.ok(
      rootSource.includes('saveAttr="data-essence-edit-save"'),
      'and it wears this studio own hooks rather than the component studio ones'
    );
    // Edit, Duplicate and Delete are the INSPECTOR's.
    assert.ok(
      !rootSource.includes('data-essence-action='),
      'the root no longer inlines any essence inspector action'
    );
    // `duplicate` is NOT in this set (issue 1372, maintainer parity round 8).
    for (const action of ['edit', 'delete', 'copy-source', 'unlink-source']) {
      assert.ok(
        essenceStudioSource.includes(`data-essence-action="${action}"`),
        `the extracted inspector exposes the ${action} action`
      );
    }
    assert.ok(
      !essenceStudioSource.includes('data-essence-action="duplicate"'),
      'and it exposes NO duplicate action'
    );
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
    // Criterion 23's four route-wiring items.
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
    // The armed BULK delete is a deliberate deviation from the `AGENTS.md` carve-out.
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
    // saveRecipeDraft lives in the root (it commits the root-held draft).
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
    // The sibling that DOES carry it.
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
    // The v2 environment editor is a composition/wrapper editor.
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
    // The two limits are one shared component now (issue 1050).
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
    // Asserted as a pattern rather than a snippet in the list above.
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
    // The destructive role, read off ONE element rather than off two strings that happen to
    // sit within 200 characters of each other. `/manager-button is-danger[\s\S]{0,200}
    // deleteGatheringTaskDraft/` matched a class string in one control and a handler in
    // another as readily as both in the same one, and the class literal it keyed on left the
    // file entirely when this toolbar moved onto `ManagerButton` (issue 1118).
    const deleteTag = /<ManagerButton[^<>]*\bdata-gathering-task-delete\b[^<>]*>/.exec(rootSource);
    assert.ok(
      deleteTag,
      'gathering task editor should render its delete control as a ManagerButton carrying ' +
        'data-gathering-task-delete'
    );
    assert.ok(
      deleteTag[0].includes('role="danger"'),
      'gathering task editor delete button should use the danger destructive role'
    );
    assert.ok(
      deleteTag[0].includes('onclick={deleteGatheringTaskDraft}'),
      'the element carrying data-gathering-task-delete should be the one wired to ' +
        'deleteGatheringTaskDraft — otherwise the role above is asserted on some other control'
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
      // `deleteSelectedLibraryTool` IS GONE.
      'removeFocusedToolFromSystem',
      // The per-section inherit switch.
      'setFocusedToolSectionInherited',
      'confirmToolsRouteExit',
      // `store.createToolDraft?.` IS GONE FROM THIS LIST.
      'store?.openToolDraft',
      'store?.saveToolDraft',
      // `store?.deleteToolDraft` GOES WITH THE HEADER BUTTON THAT CALLED IT. It deleted this
      // system's in-system record alone, leaving the world membership record behind as a ghost
      // nothing can read; `removeToolFromSystem` is the pair of writes that actually undoes an
      // adoption, and it is what the removal callout reaches (issue 1373).
      'store?.removeToolFromSystem',
      'store?.setToolSectionInherited',
      'toolsNavCount',
    ]) {
      assert.ok(rootSource.includes(snippet), `root should reference ${snippet}`);
    }
    // TOOL CREATION IS A WORLD-SCOPE WRITE NOW. All four halves are pinned.
    for (const snippet of [
      'createWorldToolFromItemDrop',
      'services?.resolveToolSource',
      'store?.worldScope?.tool?.createEntity',
      'onCreateFromItemDrop={createWorldToolFromItemDrop}',
      "openWorldScopedEntry('world-tool-entry', entityId)",
    ]) {
      assert.ok(rootSource.includes(snippet), `root should reference ${snippet}`);
    }
    // AND THE SYSTEM ROUTE NO LONGER CARRIES ONE. The two screens had the drop zone exactly
    // inverted against the design, so this is the half that proves the move rather than a copy.
    assert.ok(
      !rootSource.includes('onCreateToolDrop'),
      'the system Tool Rules route passes no creation drop callback'
    );
    // AND ADOPTION IS A NAMED HANDLER.
    for (const snippet of [
      'async function adoptWorldToolIntoSystem(entityId)',
      'onAddToSystem={(entityId) => adoptWorldToolIntoSystem(entityId)}',
      'return selectLibraryTool(entityId);',
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
    // `Tool Rules`, not `Tools` (issue 1373). The rail entry.
    assert.equal(lang.FABRICATE.Admin.Manager.Tools.Title, 'Tool Rules');
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
    // ── THE BONUS TAKES ITS VALUE FROM THE WORLD LIBRARY (issue 1373, maintainer round 3) ──
    // The tab used to render a free-text `RollDataExpressionInput` labelled `Bonus expression`,
    // which the design has no counterpart for at either scope: `proto:2353`-`2369` and
    // `proto:2886`-`2905` both draw a single-select `World modifiers` list, and `proto:4753`
    // sets `bonus` to the chosen entry's expression. The persisted shape is untouched; what
    // went away is the ability to TYPE one.
    assert.ok(
      !toolRequirementsSource.includes('RollDataExpressionInput'),
      'Tool requirements should not offer a raw bonus-expression field'
    );
    assert.ok(
      toolRequirementsSource.includes('data-tool-bonus-modifier'),
      'Tool requirements should select the bonus from the world modifier library'
    );
    // ── AND THE LIBRARY IS DRAWN AS ROWS.
    assert.ok(
      toolRequirementsSource.includes('<ModifierLibraryRow'),
      'the bonus list should render the shared modifier row, not option cards'
    );
    assert.ok(
      craftingModifierCatalogueSource.includes('<ModifierLibraryRow'),
      'the Checks Studio catalogue should render the SAME shared row, so there is one row and ' +
        'not two'
    );
    assert.ok(
      !/<RadioCardGroup[^>]*?tool-bonus-modifier/s.test(toolRequirementsSource),
      'the bonus list should render no option-card group'
    );

    // ── AND SO IS THE PREREQUISITE LIST DIRECTLY ABOVE IT (issue 1373, maintainer round 5) ─
    assert.equal(
      (toolRequirementsSource.match(/<ModifierLibraryRow/g) || []).length,
      2,
      'BOTH lists on this tab draw the shared modifier row — the prerequisites and the bonus'
    );
    assert.ok(
      toolRequirementsSource.includes("'data-tool-prerequisite-row': option.id"),
      'each prerequisite row names the entry it stands for, so a frame can select one'
    );
    // The IMPORT and the ELEMENT, not the name.
    assert.ok(
      !/import ChecklistCardRow|<ChecklistCardRow/.test(toolRequirementsSource),
      'the bespoke checklist row is gone from the tab, not merely unused beside the shared one'
    );
    assert.ok(
      !existsSync(resolve(repoRoot, 'src/ui/svelte/apps/manager/ChecklistCardRow.svelte')),
      'and the orphaned component is REMOVED — its only caller was this list, and a component ' +
        'left standing with no caller is how a fourth row comes back by copy'
    );
    // THE TRAILING CONTROL IS A REAL CHECKBOX, through the manager's one selection primitive.
    assert.ok(
      toolRequirementsSource.includes('<SelectionCheckbox'),
      'the prerequisite row trails the shared selection checkbox'
    );
    assert.ok(
      /<SelectionCheckbox[^>]*wrapper="contents"/s.test(toolRequirementsSource),
      'in `contents` mode, because the row host is already a <label> and labels may not nest'
    );

    // ── TWO HEADINGS THE DESIGN DOES NOT DRAW (issue 1373, maintainer round 5) ────────────
    assert.ok(
      !toolRequirementsSource.includes('WhichPrerequisites'),
      'no `WHICH PREREQUISITES` eyebrow: the design heads the list with nothing'
    );
    assert.ok(
      !toolRequirementsSource.includes('legendVisible'),
      'and no `WHEN PREREQUISITES FAIL` eyebrow: the gate pair is introduced by the sentence ' +
        'above it, so un-hiding its legend would print the heading the design merged away'
    );
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
    // ── THE ROW'S TWO VARIANTS ARE DECLARED.
    const modifierRowSource = readFileSync(
      resolve(repoRoot, 'src/ui/svelte/apps/manager/ModifierLibraryRow.svelte'),
      'utf8'
    );
    assert.match(
      modifierRowSource,
      /controlPlacement = 'trailing'/,
      "the control slot defaults to the shipped trailing edge, so today's callers are unmoved"
    );
    assert.match(
      modifierRowSource,
      /textLayout = 'inline'/,
      'and the text defaults to one line, for the same reason'
    );
    // The names are the row's own vocabulary. A caller-named variant is the failure this ruling
    // rejects by name, so it is asserted rather than left to review.
    for (const callerName of ['prerequisite', 'bonus', 'checks', 'catalogue']) {
      assert.equal(
        new RegExp(`variant\\s*=\\s*'${callerName}'|'${callerName}'\\s*=>`, 'i').test(
          modifierRowSource
        ),
        false,
        `the row must not name a variant after its caller (${callerName})`
      );
    }
    // AND THE PREREQUISITE LIST IS THE ONE THAT OPTS IN. The bonus list one section below and
    // the Checks Studio one screen away both pass NEITHER, which is what makes the defaults
    // load-bearing rather than decorative.
    const modifierRowTags = toolRequirementsSource.match(/<ModifierLibraryRow[^>]*>/g) || [];
    assert.equal(modifierRowTags.length, 2, 'the tab draws the shared row twice');
    const optedIn = modifierRowTags.filter((tag) => /controlPlacement|textLayout/.test(tag));
    assert.equal(
      optedIn.length,
      1,
      'and only ONE of the two opts in — the bonus list keeps the shipped face'
    );
    assert.match(optedIn[0], /controlPlacement="leading"/, '`proto:2331` puts the checkbox first');
    assert.match(
      optedIn[0],
      /textLayout="stacked"/,
      '`proto:2333` sets the name over the expression'
    );
    assert.match(
      optedIn[0],
      /data-tool-prerequisite-row/,
      'and it is the PREREQUISITE list, not the bonus list, that took them'
    );
    assert.equal(
      /controlPlacement|textLayout/.test(craftingModifierCatalogueSource),
      false,
      'the Checks Studio caller is untouched: it passes neither prop and renders as it shipped'
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
    // AND BOTH CALLERS MUST PASS THE ROSTER. A prop declared and not passed renders an empty
    // library that reads as "this world has none" — and it also subscribes the whole spread
    // bundle, because Svelte evaluates a spread only on a key MISS.
    for (const [name, source] of [
      ['ToolEditView', toolEditSource],
      ['WorldToolEntryPage', worldToolEntrySource],
    ]) {
      assert.ok(
        /\{modifierOptions\}/.test(source),
        `${name} should forward modifierOptions to the requirements tab`
      );
    }
    assert.equal(
      (rootSource.match(/modifierOptions=\{selectedSystemModifiers\}/g) || []).length,
      2,
      'the manager root should pass the world modifier roster to BOTH Tool requirement scopes'
    );
    // ── EVERY BEHAVIOUR SECTION IS A CARD.
    // This used to require a `manager-tool-section-heading` block — an unenclosed `<h3>` with a
    // glyph and a hint, sitting on the page background above loose controls. The design encloses
    // each section in its own bordered, filled card whose head states the section, whether this
    // system inherits the world Tool's answer or overrides it, what the world's answer is, and
    // the switch between the two. `ToolInheritCard` is that card and both tabs are its callers.
    assert.ok(
      !toolBreakageSource.includes('manager-tool-section-heading'),
      'Breakage must not restore the bare page-background section heading'
    );
    for (const [label, source] of [
      ['Breakage', toolBreakageSource],
      ['Requirements', toolRequirementsSource],
    ]) {
      assert.ok(
        source.includes('<ToolInheritCard'),
        `${label} must draw its sections as inherit-aware cards`
      );
    }
    assert.deepEqual(
      [...toolBreakageSource.matchAll(/section="(\w+)"/g)].map((match) => match[1]),
      ['breakage', 'onBreak'],
      'Breakage owns exactly the two world-default sections it authors'
    );
    assert.deepEqual(
      [...toolRequirementsSource.matchAll(/section="(\w+)"/g)].map((match) => match[1]),
      ['prerequisites', 'bonus'],
      'and Requirements owns the other two'
    );
    // THE SWITCH IS THE SHIPPED PRIMITIVE.
    assert.ok(
      toolInheritCardSource.includes("import InheritRow from '../scoped/InheritRow.svelte';") &&
        toolInheritCardSource.includes('stateChip={false}'),
      'the card reuses the shared scoped inherit row rather than hand-rolling a second switch'
    );
    // AND `Always fires` IS GONE. The design uses that slot for the inheritance state.
    assert.ok(
      !toolBreakageSource.includes('AlwaysFires'),
      'the on-break legend badge must not survive the card conversion'
    );
    assert.ok(
      !toolBreakageSource.includes('BreakageKicker'),
      'Breakage should not restore the redundant BREAKAGE kicker'
    );
    // ── THE LINKED-ITEM CARD IS NOT AT SYSTEM SCOPE.
    assert.ok(
      !toolSystemScopeSource.includes('<ItemDropZone'),
      'the system-scope band must not carry a source drop zone'
    );
    assert.ok(
      !toolSystemScopeSource.includes('onSourceDrop') &&
        !toolSystemScopeSource.includes('onUnlinkSource') &&
        !toolSystemScopeSource.includes('onCopySourceUuid'),
      'nor any of the three source-link callbacks'
    );
    // THERE IS NO OVERVIEW TAB AT SYSTEM SCOPE AT ALL. The tab strip is three tabs.
    assert.ok(
      !toolEditorTabsSource.includes("'overview'"),
      'the system tab strip must not declare an Overview tab'
    );
    // THE DECLARATION FORM IS THE `EditorTabs` PRIMITIVE'S (issue 1038).
    assert.match(
      toolEditorTabsSource,
      /const TABS = \[\s*\{\s*id: 'breakage'[\s\S]*?id: 'requirements'[\s\S]*?id: 'validation'/,
      'and must declare Breakage, Requirements and Validation, in that order'
    );
    assert.equal(
      (toolEditorTabsSource.match(/^\s*id: '/gm) || []).length,
      3,
      'and exactly three, so a fourth cannot be appended past the ordering match above'
    );
    assert.ok(
      toolEditorTabsSource.includes("activeTab = 'breakage'"),
      'and must default to Breakage rather than a tab that no longer exists'
    );
    // NO BARE `Delete` IN THE SYSTEM HEADER.
    assert.ok(
      !toolEditSource.includes('data-tool-editor-delete'),
      'the system header must not carry a bare Delete'
    );
    assert.ok(
      toolBreakageSource.includes('data-tool-remove-from-system') &&
        toolBreakageSource.includes('StopUsingHereHint'),
      'and the Breakage tab closes with the explained remove-from-system callout'
    );
    assert.equal(
      lang.FABRICATE.Admin.Manager.Tools.Editor.StopUsingHereHint,
      'Removes the rules in {system} only. The world Tool and every other system are untouched.'
    );
    // THE HEADER STATES SCOPE AND SAVES RULES.
    assert.equal(
      lang.FABRICATE.Admin.Manager.Tools.Editor.HeaderSystemScope,
      'Rules in {system} · identity comes from the world Tool'
    );
    assert.equal(lang.FABRICATE.Admin.Manager.Tools.BackToToolRules, 'Back to Tool Rules');
    assert.equal(lang.FABRICATE.Admin.Manager.Tools.SaveRules, 'Save rules');
    assert.ok(
      worldToolEntrySource.includes('<ItemDropZone'),
      'the world Tool entry reuses the shared drag-only Item drop zone'
    );
    // ONE ACTION ON THE TILE, which is what the design draws (issue 1373's parity round). The
    // Copy that sat beside Unlink is gone with the raw uuid line it copied: an id is not a fact
    // this screen states anywhere else, and the third line displaced the hint that says what
    // dropping onto the tile does.
    assert.ok(
      !worldToolEntrySource.includes('copyLabel='),
      'the tile offers one button, not a Copy beside the Unlink'
    );
    assert.ok(
      !worldToolEntrySource.includes('subline='),
      'and no raw uuid line under the two the design draws'
    );
    assert.ok(
      worldToolEntrySource.includes('SourceDropHint'),
      'and explains that dropping an Item replaces the linked source'
    );
    assert.ok(
      !worldToolEntrySource.includes('data-tool-source-replace'),
      'without reviving the removed source picker'
    );
    // THE SYSTEM LABEL FIELD SURVIVES, and names itself as an OVERRIDE of the world value.
    assert.ok(
      toolSystemScopeSource.includes('data-tool-label'),
      'the per-system display-label override still ships'
    );
    // AND IT SAYS SO IN THE SCREEN'S OWN IDIOM RATHER THAN IN A HELP SENTENCE (issue 1373). The
    // card is a `ToolInheritCard` now: blank IS the inheriting state, so the pill, the
    // `World default: <name>` line, the globe row and the switch carry the whole claim, and the
    // sentence beneath is a caption rather than the only place the override is stated.
    assert.ok(
      toolSystemScopeSource.includes('<ToolInheritCard'),
      'the label card is the same inherit card every other overridable fact here renders through'
    );
    assert.equal(
      lang.FABRICATE.Admin.Manager.Tools.Editor.LabelFallback,
      'The name this crafting system shows for the Tool.'
    );
    // AND THE WORLD FIELD NAMES ITSELF AS OPTIONAL (issue 1373's parity round). Its old copy
    // described the field's REACH across crafting systems, which is a fact about the override
    // above rather than about this control, and said nothing about the one thing the design's
    // frame does: that a blank is allowed and what answers for it.
    assert.equal(
      lang.FABRICATE.Admin.Manager.Scoped.Entry.DisplayLabelInheritHint,
      'Leave blank to use the linked Item name.'
    );
    assert.equal(
      lang.FABRICATE.Admin.Manager.Scoped.Entry.DisplayLabelUnlinkedHint,
      'No Item is linked, so this record has no name to fall back on.'
    );
    // TASK 4: the editor behind `Edit rules` offers the route the rules LIST already advertises.
    assert.ok(
      toolEditSource.includes('data-tool-editor-world-tool') &&
        toolEditSource.includes('onEditWorldTool'),
      'the focused Tool editor offers a route out to the world Tool'
    );
    assert.ok(
      rootSource.includes(
        "onEditWorldTool={(entityId) => openWorldScopedEntry('world-tool-entry', entityId)}"
      ),
      'and the root wires it to the same navigation the rules inspector takes'
    );
    assert.ok(
      toolValidationSource.includes('<ScopedValidationTab'),
      'Validation should reuse the shared scoped-entity validation shell'
    );
    // And that shell really does render the recipe-style surface. Asserting only the shell
    // would pass on a shell that had dropped it, which is the whole point of the original.
    assert.ok(
      readFileSync(
        resolve(repoRoot, 'src/ui/svelte/apps/manager/scoped/ScopedValidationTab.svelte'),
        'utf8'
      ).includes('<EditorValidationSurface'),
      'the shared scoped validation shell should reuse the recipe-style editor validation surface'
    );
  });

  defineStructureContract(
    'copies a UUID through the Foundry clipboard service',
    { file: APP_SHELL, member: '_buildServices' },
    { reads: ['game.clipboard'], calls: ['copyPlainText'] }
  );

  defineStructureContract('never bypasses the Foundry clipboard service anywhere in the shell', APP_SHELL, {
    readsNo: ['navigator.clipboard', 'foundry.utils.copyPlainText'],
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
      /id: 'knowledge',\s*\n\s*layoutClass: 'self-owned-3-track'/.test(rootSource) &&
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
    // The default tab is seeded ONCE from the store.
    assert.ok(
      knowledgeSource.includes('let tabSeeded = $state(false)'),
      'the default tab should be seeded once on surface entry'
    );

    // The armed control is a REAL focusable button.
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
    { file: APP_SHELL, member: '_knowledgeActor' },
    { reads: ['game.user.isGM', 'KNOWLEDGE_MESSAGES.gmOnly'] }
  );

  defineStructureContract(
    'runs that gate before any document lookup on the item target too',
    { file: APP_SHELL, member: '_knowledgeTarget' },
    { calls: ['_knowledgeActor'] }
  );

  // Without the third column, the gated resolver, a row says the mutation is delegated but not
  // that anything gates it.
  const KNOWLEDGE_MUTATIONS = Object.freeze([
    ['_expendRecipeItemUse', 'expendOwnedRecipeItemUse', '_knowledgeTarget'],
    ['_deleteOwnedRecipeItem', 'deleteOwnedRecipeItemCopy', '_knowledgeTarget'],
    ['_eraseLearnedRecipe', 'eraseLearnedRecipeEntry', '_knowledgeActor'],
    ['_resetActorKnowledge', 'resetActorKnowledgeState', '_knowledgeActor'],
  ]);

  for (const [method, mutation, gate] of KNOWLEDGE_MUTATIONS) {
    defineStructureContract(
      `${method} resolves through the GM-gated helper and delegates its mutation`,
      { file: APP_SHELL, member: method },
      { calls: [mutation, gate], names: ['denied'] }
    );
  }

  // An anti-pin (issue 1024): a positive `isPlayerCharacterActor` claim is a tautology that
  // survives the wrong import, so the claim is that the hardcoded actor type is absent, plus the
  // import.
  defineStructureContract(
    'reaches the player-character roster through the shared, GM-configurable predicate', APP_SHELL,
    {
      imports: [
        './svelte/apps/manager/knowledge/knowledgeMutations.js',
        '../config/playerCharacterTypes.js',
      ],
      comparesNo: ['character'],
      readsNo: ['game.fabricate.isPlayerCharacterActor'],
      namesNo: ['activeGM'],
    }
  );

  // The learned-row ALLOWLIST (issue 1289). `_collectKnowledgeLearnedEntries` builds every
  // learned row as a hand-written object literal, so a field that literal does not name never
  // reaches the display ladder at all — the row renders whatever an earlier rung answers, with
  // nothing failing anywhere. Deleting the `granted`/`grantedBy` pair from it survived the
  // whole suite: the mounted Knowledge suite feeds `projectKnowledgeSnapshot` a hand-built
  // `rawLearned` fixture, so it proves the ladder and the render but never the collection; the
  // Foundry step opens no Knowledge row for its throwaway actor; and the View Lab frame is a
  // screenshot, not a gate.
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
    // Named for their own sake as well as by derivation.
    assert.ok(
      readFields.has('granted') && readFields.has('grantedBy'),
      'the grant rungs are still part of the ladder this derivation walks'
    );
  });

  // `railCollapsed` is the stored preference; the body renders `railCollapsedDisplay`, so the
  // Downtime rail lock forces the sidebar open without un-collapsing every other route. The
  // rendered half is mounted through `assertRailLockedOpen` and `assertRailLockSurvivesPresses`.
  defineStructureContract('wires a collapsible left rail persisted via the manager setting seam', MANAGER_ROOT, {
    spells: [
      'managerRailCollapsed',
      'FABRICATE.Admin.Manager.Nav.CollapseRail',
      'FABRICATE.Admin.Manager.Nav.ExpandRail',
    ],
    reads: ['services.getSetting', 'services.setSetting'],
    names: ['toggleManagerRail'],
    declares: ['railCollapsedDisplay'],
  });

  // Counted, not merely present (issue 1213 review): a mounted case renders one of the two sites,
  // so the branch it does not reach would lose the lock silently.
  it('writes the rail toggle twice, and both sites carry the same state attributes', () => {
    const sites = templateNodes(componentAstOf(MANAGER_ROOT)).filter((node) =>
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
  const scopedDir = resolve(repoRoot, 'src/ui/svelte/apps/manager/scoped');
  const previewSource = readFileSync(resolve(scopedDir, 'ScopedEntityPreview.svelte'), 'utf8');
  const toolPreviewSource = readFileSync(
    resolve(repoRoot, 'src/ui/svelte/apps/manager/tools/ToolBehaviorPreview.svelte'),
    'utf8'
  );
  const fabricateCss = readFileSync(resolve(repoRoot, 'styles/fabricate.css'), 'utf8');
  const viewTitleSource = classMemberSource(
    rootSource,
    'function viewTitle() {',
    'the manager root'
  );

  // Every class the manager stylesheet declares a rule for.
  const declaredManagerClasses = new Set(
    [...fabricateCss.matchAll(/\.fabricate-manager\s+\.([a-z0-9-]+)/g)].map((match) => match[1])
  );

  /**
   * The SEVEN class names `ScopedEntityPreview` renders for a given stem.
   *
   * @param {string} stem
   * @returns {string[]}
   */
  function renderedPreviewClasses(stem) {
    const suffixes = [...previewSource.matchAll(/\$\{classPrefix\}-([a-z-]+)/g)].map(
      (match) => match[1]
    );
    return [stem, ...new Set(suffixes.map((suffix) => `${stem}-${suffix}`))];
  }

  it('declares a rule for every class the preview shell renders, for BOTH stems', () => {
    assert.ok(
      previewSource.includes('<aside class={classPrefix}'),
      'the shell renders the bare stem as a class, which the derivation below depends on'
    );
    const defaultStem = previewSource.match(/classPrefix = '([a-z-]+)'/)?.[1];
    // THE TOOL RAIL'S STEM IS ITS OWN PROP DEFAULT NOW.
    const toolStem = toolPreviewSource.match(/classPrefix = '([a-z-]+)'/)?.[1];
    assert.equal(defaultStem, 'manager-scoped-preview');
    assert.equal(toolStem, 'manager-tool-preview');
    assert.ok(
      worldToolEntrySource.includes('classPrefix="manager-scoped-preview"'),
      'the world Tool entry renders the shared rail under the placement-free default stem'
    );

    // NON-VACUITY FIRST. The lookup is a set built by regex over a 20,000-line stylesheet.
    assert.ok(
      declaredManagerClasses.size > 200,
      'the stylesheet scan found almost nothing, so it cannot be trusted to find an omission'
    );
    assert.equal(
      declaredManagerClasses.has('manager-scoped-preview-not-a-real-region'),
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
          declaredManagerClasses.has(className),
          `\`styles/fabricate.css\` declares no rule for \`.${className}\`. The shell's docblock ` +
            'says both stems are declared there and this is the only thing that checks it: a ' +
            'renamed region leaves the six editors PRs 6a-c and 7 build rendering unstyled, and ' +
            'requirement 7 closes that stylesheet to all four of those lanes.'
        );
      }
    }
  });

  /**
   * The `{key, fallback}` pair `viewTitle` declares for each world scoped-entity route.
   *
   * @returns {Map<string, {key: string, fallback: string}>}
   */
  function scopedTitlesFromRoot() {
    const titles = new Map();
    const pattern =
      /if \(currentView === '(world-[a-z-]+)'\)\s*\n\s*return text\('([^']+)', '([^']*)'\);/g;
    for (const match of viewTitleSource.matchAll(pattern)) {
      titles.set(match[1], { key: match[2], fallback: match[3] });
    }
    return titles;
  }

  it('gives each of the seven placeholder pages a DISTINCT triple that matches its route', () => {
    const titles = scopedTitlesFromRoot();
    assert.equal(
      titles.size,
      7,
      'the parse of `viewTitle` found the wrong number of world scoped-entity titles, so every ' +
        'cross-check below would be against the wrong set'
    );

    // TWO SPELLINGS, AND BOTH ARE READ (issue 1372). A page that still DELEGATES its body states
    // the four facts as attributes on `ScopedPlaceholderPage`; a page a screen lane has REPLACED
    // states them as module constants beside its own `<main>`. Reading only the first form makes
    // every replaced page answer `undefined` on all four, which collapses the distinctness sets
    // below to fewer than seven and reds a lane that did everything right — and reading only the
    // second would do the same to the four that have not been replaced yet. The swap detector has
    // to survive the transition it exists to police, so it resolves either.
    const declared = (source, attribute, constant) =>
      source.match(new RegExp(`const ${constant} = '([^']+)'`))?.[1] ??
      source.match(new RegExp(`${attribute}="([^"]+)"`))?.[1];
    // THE SEVEN PAGES, AND THE THREE `WorldComponentEntry*` CHILDREN THAT ARE NOT PAGES (issue
    // 1371, parity round 4). The world Component entry was rebuilt to the reference as four
    // files; each child renders a CARD or the rail, declares no route identity and carries no
    // route hook. They are excluded BY NAME rather than by "has no PAGE_ID", because the
    // non-vacuity assertion below exists precisely to catch a page that stopped declaring one.
    const SCOPED_ENTRY_CHILDREN = new Set([
      'WorldComponentEntryPreviewRail.svelte',
      'WorldComponentEntrySourceCard.svelte',
      'WorldComponentEntrySystemsCard.svelte',
    ]);
    const pages = readdirSync(scopedDir)
      .filter(
        (entry) =>
          entry.startsWith('World') &&
          entry.endsWith('.svelte') &&
          !SCOPED_ENTRY_CHILDREN.has(entry)
      )
      .map((entry) => {
        const source = readFileSync(resolve(scopedDir, entry), 'utf8');
        return {
          file: entry,
          pageId: declared(source, 'pageId', 'PAGE_ID'),
          icon: declared(source, 'icon', 'PAGE_ICON'),
          titleKey: declared(source, 'titleKey', 'TITLE_KEY'),
          titleFallback: declared(source, 'titleFallback', 'TITLE_FALLBACK'),
        };
      });
    // NON-VACUITY, because the regex pair above is exactly the thing that can silently answer
    // `undefined` for every page after a rename: a set of seven `undefined`s has size one, which
    // the distinctness assertions below would catch, but a set of seven MISSING title fallbacks
    // would not — nothing else reads that field.
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
      // THE SWAP DETECTOR. The page resolves the screen's name for its `<main>` accessible name
      // and the header resolves it again for the `<h1>`, out of two different files. A swapped
      // key renders a page titled after its sibling - which nothing in `npm test` renders, and
      // which the View Lab would publish as a frame before anything failed.
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
    const entryRoutesSource = readFileSync(resolve(scopedDir, 'scopedEntryRoutes.js'), 'utf8');
    const declared = [
      ...entryRoutesSource.matchAll(
        /'(world-[a-z-]+-entry)': Object\.freeze\(\{\s*entityType: '([a-z]+)',\s*catalogueView: '([a-z-]+)',\s*catalogueTitleKey: '([^']+)',\s*catalogueTitleFallback: '([^']+)',/g
      ),
    ];
    assert.deepEqual(
      declared.map((match) => match[1]),
      ['world-component-entry', 'world-essence-entry', 'world-tool-entry'],
      'three entry routes, one per scoped entity type'
    );
    for (const match of declared) {
      const [, entryView, entityType, catalogueView, catalogueKey, catalogueFallback] = match;
      assert.ok(titles.has(entryView), `${entryView} is one of the seven titled routes`);
      const catalogue = titles.get(catalogueView);
      assert.ok(Boolean(catalogue), `${entryView} returns to \`${catalogueView}\`, a real route`);
      // The middle crumb names the catalogue with the SAME string the catalogue own header
      // uses. Two copies of one lang key is exactly the mirror this suite exists to hold.
      assert.equal(catalogueKey, catalogue.key, `${entryView} catalogue crumb key`);
      assert.equal(catalogueFallback, catalogue.fallback, `${entryView} catalogue crumb copy`);
      assert.ok(
        catalogueView.startsWith(`world-${entityType.slice(0, 4)}`),
        `${entryView} must return to the catalogue of its OWN entity type`
      );
    }
  });

  it('renders the entry trail as three crumbs, the middle one a button back to the catalogue', () => {
    // The crumb is shell chrome, and `### GM World Scoped Entity Routes` requirement 7 closes
    // the shell to PRs 6a, 6b and 6c - so an entry editor, released to full width and therefore
    // rendering no inspector, would have had no way back at all if this were left to them.
    assert.match(
      rootSource,
      /\{#if worldScopedEntryRoute\}[\s\S]{0,900}?data-breadcrumb-world-scoped-catalogue=\{worldScopedEntryRoute\.catalogueView\}[\s\S]{0,400}?onclick=\{\(\) => setView\(worldScopedEntryRoute\.catalogueView\)\}/,
      'the entry trail draws an intermediate catalogue crumb, and it navigates'
    );
    // AND THE SUBJECT REACHES IT WITHOUT REOPENING THIS FILE. A catalogue row in PR 6a calls
    // `onOpenEntry(entityId)`; the shell records the subject, performs the navigation through
    // the confirm-discard gate, and resolves the name out of the published world corpus.
    for (const [catalogue, entry] of [
      ['WorldComponentCataloguePage', 'world-component-entry'],
      ['WorldEssenceCataloguePage', 'world-essence-entry'],
      ['WorldToolCataloguePage', 'world-tool-entry'],
    ]) {
      assert.match(
        rootSource,
        new RegExp(
          `<${catalogue}\\s*\\n\\s*\\{\\.\\.\\.[a-zA-Z]+ScopeProps\\}\\s*\\n\\s*onOpenEntry=\\{\\(entityId\\) => openWorldScopedEntry\\('${entry}', entityId\\)\\}`
        ),
        `${catalogue} is wired with both seams PR 6a builds its catalogue on`
      );
    }
    assert.match(
      rootSource,
      /function openWorldScopedEntry\(view, entityId\) \{[\s\S]{0,500}?confirmRouteExit\(view\)/,
      'and it routes through the same confirm-discard gate every other navigation passes'
    );
  });
});
