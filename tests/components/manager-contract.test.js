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
import {
  componentAstOf,
  componentAstsIn,
  componentScopeOf,
  moduleAstOf,
  moduleAstsIn,
} from '../helpers/parsedSource.js';
import {
  attributeNames,
  attributeValue,
  carriesSpread,
  containsLiteral,
  declaredConstant,
  declaresAttribute,
  declaresProp,
  importsModule,
  passesProp,
  propNone,
  readsGlobal,
  referencesIdentifier,
  rendersComponent,
  rendersElement,
  requiresProp,
  spellsLiteral,
} from '../helpers/svelteStructureContract.js';
import { declaredManagerClasses } from '../helpers/manager/managerStylesheet.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dirname, '../..');
const rootPath = resolve(repoRoot, 'src/ui/svelte/apps/manager/CraftingSystemManagerRoot.svelte');
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
const appPath = resolve(repoRoot, 'src/ui/SvelteCraftingSystemManagerApp.svelte.js');
const langPath = resolve(repoRoot, 'lang/en.json');

const rootSource = readFileSync(rootPath, 'utf8');
// The reward and event limit counts are one shared component (issue 1050).
const gatheringRuleLimitStepperSource = readFileSync(
  resolve(repoRoot, 'src/ui/svelte/apps/manager/environment/GatheringRuleLimitStepper.svelte'),
  'utf8'
);
const environmentEditSource = readFileSync(environmentEditPath, 'utf8');
const environmentsBrowserSource = readFileSync(environmentsBrowserPath, 'utf8');
const gatheringTaskEditSource = readFileSync(gatheringTaskEditPath, 'utf8');
const chanceSliderSource = readFileSync(chanceSliderPath, 'utf8');
const gatheringTasksBrowserSource = readFileSync(gatheringTasksBrowserPath, 'utf8');
const knowledgeSource = readFileSync(knowledgePath, 'utf8');
const armedDangerButtonSource = readFileSync(armedDangerButtonPath, 'utf8');
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
// The WORLD Tool entry, which took the linked-item card off the system editor (issue 1373).
const worldToolEntrySource = readFileSync(
  resolve(repoRoot, 'src/ui/svelte/apps/manager/scoped/WorldToolEntryPage.svelte'),
  'utf8'
);
const appSource = readFileSync(appPath, 'utf8');
const lang = JSON.parse(readFileSync(langPath, 'utf8'));


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

/** An `if` that tests one literal and returns another, which is the direction a mapping has. */
function returnsForComparison(node, [compared, returned]) {
  for (const inner of walkNodes(node)) {
    if (inner.type !== 'IfStatement' || !comparesToLiteral(inner.test, compared)) continue;
    for (const branch of walkNodes(inner.consequent)) {
      if (branch.type === 'ReturnStatement' && branch.argument?.value === returned) return true;
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

/** Every literal a subtree assigns to one binding, which is what a route transition is. */
function assignedLiterals(node, name) {
  const values = [];
  for (const inner of walkNodes(node)) {
    if (inner.type !== 'AssignmentExpression' || inner.left?.name !== name) continue;
    if (inner.right?.type === 'Literal') values.push(inner.right.value);
  }
  return values;
}

/** Every literal value a subtree gives one object-literal key, which is what a table row is. */
function propertyValues(node, key) {
  const values = [];
  for (const inner of walkNodes(node)) {
    if (inner.type === 'Property' && inner.key?.name === key && inner.value?.type === 'Literal') {
      values.push(inner.value.value);
    }
  }
  return values;
}

/** The record in a table whose named key carries this literal — the row a claim is about. */
function recordAst(node, [key, value]) {
  for (const inner of walkNodes(node)) {
    if (inner.type !== 'ObjectExpression') continue;
    if (inner.properties.some((entry) => propertyValues(entry, key).includes(value))) return inner;
  }
  throw new Error(`no record with ${key} "${value}"`);
}

/** One named function or binding value out of a subtree — the AST of the slice it replaces. */
function namedCodeAst(scope, name) {
  for (const node of walkNodes(scope ?? {})) {
    if (node.type === 'FunctionDeclaration' && node.id?.name === name) return node;
    if (node.type === 'VariableDeclarator' && node.id?.name === name && node.init) return node.init;
  }
  throw new Error(`no binding \`${name}\``);
}

/** Every `bind:` target a template declares, which is how a component reaches its own node. */
function boundDirectives(component) {
  const names = new Set();
  for (const node of templateNodes(component)) {
    for (const attribute of node.attributes ?? []) {
      if (attribute.type === 'BindDirective' && attribute.name) names.add(attribute.name);
    }
  }
  return names;
}

/** The expression one element gives a `{…}` attribute, or `undefined` for a static one. */
function attributeExpression(node, name) {
  const attribute = (node.attributes ?? []).find(
    (candidate) => candidate.type === 'Attribute' && candidate.name === name
  );
  return attribute?.value?.type === 'ExpressionTag' ? attribute.value.expression : undefined;
}

/** The first static value any template node gives an attribute — one of two shipped spellings. */
function attributeLiteral(component, name) {
  for (const node of templateNodes(component)) {
    const value = attributeValue(node, name);
    if (value !== undefined) return value;
  }
  return undefined;
}

/** The literal a subtree binds to one name, whether as a `const` or as a prop default. */
function constantLiteral(node, name) {
  for (const inner of walkNodes(node)) {
    if (inner.type !== 'VariableDeclarator' || inner.id?.name !== name) continue;
    if (inner.init?.type === 'Literal') return inner.init.value;
  }
  return undefined;
}

/** The default one component declares for a prop, which is where a class stem is stated. */
function propDefault(component, name) {
  for (const node of walkNodes(component)) {
    if (node.type !== 'VariableDeclarator' || calledName(node.init) !== '$props') continue;
    for (const property of node.id?.properties ?? []) {
      if (property.key?.name !== name || property.value?.right?.type !== 'Literal') continue;
      return property.value.right.value;
    }
  }
  return undefined;
}

/** The chunks a template literal appends straight to `${name}`, hyphen dropped. */
function templateSuffixes(component, name) {
  const suffixes = [];
  for (const node of walkNodes(component)) {
    if (node.type !== 'TemplateLiteral') continue;
    node.expressions.forEach((expression, index) => {
      if (expression?.type !== 'Identifier' || expression.name !== name) return;
      const [, suffix] = /^-([a-z-]+)/.exec(node.quasis[index + 1]?.value?.raw ?? '') ?? [];
      if (suffix) suffixes.push(suffix);
    });
  }
  return suffixes;
}

/** The literal a subtree compares the named binding against — what a route branch tests. */
function comparedLiteral(node, name) {
  for (const inner of walkNodes(node)) {
    if (inner.type !== 'BinaryExpression') continue;
    const sides = [inner.left, inner.right];
    if (!sides.some((side) => side?.type === 'Identifier' && side.name === name)) continue;
    const literal = sides.find((side) => side?.type === 'Literal');
    if (literal) return literal.value;
  }
  return undefined;
}

/** The `(key, fallback)` pair a `return text(key, fallback);` states, or `[]` for any other. */
function returnedTextArguments(node) {
  const call = node?.type === 'ReturnStatement' ? node.argument : undefined;
  if (calledName(call) !== 'text') return [];
  const [key, fallback] = call.arguments.map((argument) =>
    argument?.type === 'Literal' ? argument.value : undefined
  );
  return typeof key === 'string' && typeof fallback === 'string' ? [key, fallback] : [];
}

/** Every object-literal key a subtree writes, for the claims about a key rather than its value. */
function propertyKeys(node) {
  const keys = new Set();
  for (const inner of walkNodes(node)) {
    if (inner.type === 'Property' && inner.key?.name) keys.add(inner.key.name);
  }
  return keys;
}

/** The object literal a subtree pushes onto one named array — the allowlist a collector writes. */
function pushedRecord(node, arrayName) {
  for (const inner of walkNodes(node)) {
    if (calledName(inner) !== 'push' || inner.callee?.object?.name !== arrayName) continue;
    const [record] = inner.arguments;
    if (record?.type === 'ObjectExpression') return record;
  }
  return undefined;
}

/** Every render site of one component, for the claims that COUNT them or compare two. */
function renderedNodes(component, name) {
  return templateNodes(component).filter((node) => node.type === 'Component' && node.name === name);
}

/** The literal one node gives a prop, whether spelled as text or as a `{…}` expression. */
function propLiteral(node, name) {
  const expression = attributeExpression(node, name);
  if (expression?.type === 'Literal') return expression.value;
  return attributeValue(node, name);
}

/** Every static value a template gives one attribute, in render order. */
function attributeValues(component, name) {
  return templateNodes(component)
    .map((node) => attributeValue(node, name))
    .filter((value) => value !== undefined);
}

/** The expressions rendered inside the elements carrying one static class. */
function classRenderedExpressions(component, className) {
  const found = [];
  for (const node of templateNodes(component)) {
    if (attributeValue(node, 'class') !== className) continue;
    for (const child of node.fragment?.nodes ?? []) {
      if (child.type === 'ExpressionTag') found.push(child.expression);
    }
  }
  return found;
}

/** The value one module or component binds to a named `const`, as an AST to ask further of. */
function declaredConstantValue(file, name) {
  const parsed = file.endsWith('.svelte') ? componentAstOf(file) : moduleAstOf(file).ast;
  return namedCodeAst(file.endsWith('.svelte') ? [parsed.instance, parsed.module] : parsed, name);
}

/** The claims any plain code subtree answers: a module, a class member, or one function body. */
function claimsOverCode(code) {
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
    returnsFor: (pair) => returnsForComparison(code, pair),
    assigns: ([name, value]) => assignedLiterals(code, name).includes(value),
    property: ([key, value]) => propertyValues(code, key).includes(value),
    key: (name) => propertyKeys(code).has(name),
  };
}

/** The claims a whole parsed component answers, template included. */
function claimsForComponent(component) {
  return {
    ...claimsOverCode(component),
    renders: (name) => rendersComponent(component, name),
    element: (name) => rendersElement(component, name),
    binds: (name) => boundDirectives(component).has(name),
    imports: (specifier) => importsModule(component, specifier),
    declares: (name) => declaredConstant(component, name),
    names: (name) => referencesIdentifier(component, name),
    spells: (text) => containsLiteral(component, text),
    spellsExactly: (text) => spellsLiteral(component, text),
    prop: ([name, propName]) => passesProp(component, name, propName),
    propNone: ([name, propName]) => propNone(component, name, propName),
    attribute: ([name, value]) =>
      templateNodes(component).some((node) => attributeValue(node, name) === value),
    writes: (name) => attributeNames(component).has(name),
    declaresProp: (name) => declaresProp(component, name),
    defaults: ([name, value]) => propDefault(component, name) === value,
    passesValue: ([name, propName, value]) => {
      const nodes = renderedNodes(component, name);
      return nodes.length > 0 && nodes.every((node) => propLiteral(node, propName) === value);
    },
    requiresProp: (name) => requiresProp(component, name),
  };
}

/** "In at least one of these", stated once: a composite target is a quantifier, not a join. */
function claimsAcross(subjects) {
  const kinds = [...new Set(subjects.flatMap((subject) => Object.keys(subject)))];
  return Object.fromEntries(
    kinds.map((kind) => [kind, (row) => subjects.some((subject) => subject[kind]?.(row) === true)])
  );
}

function claimsForFile(file) {
  return file.endsWith('.svelte')
    ? claimsForComponent(componentAstOf(file))
    : claimsOverCode(moduleAstOf(file).ast);
}

/**
 * A repo-relative path, optionally narrowed to one class member and one of its properties, or to
 * one function of a component — the AST equivalent of the bounded text slice it replaces — or a
 * list of paths or a directory, which answer for at least one of their files.
 */
function structureOf(target) {
  if (Array.isArray(target)) return claimsAcross(target.map(claimsForFile));
  if (typeof target === 'object' && target.dir) {
    return claimsAcross([
      ...componentAstsIn(target.dir).map(claimsForComponent),
      ...moduleAstsIn(target.dir).map(({ ast }) => claimsOverCode(ast)),
    ]);
  }
  const { file, member, property, fn, constant, record } =
    typeof target === 'string' ? { file: target } : target;
  const binding = fn ?? constant;
  if (file.endsWith('.svelte')) {
    const component = componentAstOf(file);
    if (!binding && !record) {
      const scope = componentScopeOf(file);
      return { ...claimsForComponent(component), global: (name) => readsGlobal(scope, name) };
    }
    const scoped = binding
      ? namedCodeAst([component.instance, component.module], binding)
      : component;
    return claimsOverCode(record ? recordAst(scoped, record) : scoped);
  }
  const { ast } = moduleAstOf(file);
  let code = member ? classMemberAst(ast, member) : ast;
  if (binding) code = namedCodeAst(code, binding);
  if (record) code = recordAst(code, record);
  if (property) code = propertyAst(code, property);
  return claimsOverCode(code);
}

/** What a failure message calls the target, whichever of the four shapes it took. */
function labelOf(target) {
  if (Array.isArray(target)) return `any of ${target.length} manager views`;
  if (typeof target === 'string') return target;
  if (target.dir) return `any of ${target.dir}`;
  const { file, member, constant, property, fn, record } = target;
  const parts = [file, member, constant ?? fn, record?.join('='), property];
  return parts.filter(Boolean).join(' > ');
}

/** Each claim a contract row may make: the question to ask, and the answer it must get. */
const CONTRACT_CLAIMS = Object.freeze({
  renders: { ask: 'renders', holds: true, says: (v) => `renders <${v}>` },
  elements: { ask: 'element', holds: true, says: (v) => `renders a <${v}> element` },
  elementsNo: { ask: 'element', holds: false, says: (v) => `renders no <${v}> element` },
  binds: { ask: 'binds', holds: true, says: (v) => `binds ${v}` },
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
  spellsExactlyNo: { ask: 'spellsExactly', holds: false, says: (v) => `spells no "${v}"` },
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
  returnsFor: {
    ask: 'returnsFor',
    holds: true,
    says: ([c, r]) => `maps "${c}" to "${r}", in that direction`,
  },
  assigns: { ask: 'assigns', holds: true, says: ([n, v]) => `assigns ${n} = "${v}"` },
  assignsNo: { ask: 'assigns', holds: false, says: ([n, v]) => `never assigns ${n} = "${v}"` },
  property: { ask: 'property', holds: true, says: ([k, v]) => `carries ${k}: "${v}"` },
  propertyNo: { ask: 'property', holds: false, says: ([k, v]) => `carries no ${k}: "${v}"` },
  keys: { ask: 'key', holds: true, says: (v) => `gives some record a ${v} key` },
  keysNo: { ask: 'key', holds: false, says: (v) => `gives no record a ${v} key` },
  comparesNo: { ask: 'compares', holds: false, says: (v) => `hard-codes no comparison to ${v}` },
  passesProps: { ask: 'prop', holds: true, says: ([c, p]) => `passes ${p} to every <${c}>` },
  passesValues: {
    ask: 'passesValue',
    holds: true,
    says: ([c, p, v]) => `passes ${p}={${v}} to every <${c}>`,
  },
  defaults: { ask: 'defaults', holds: true, says: ([n, v]) => `defaults ${n} to "${v}"` },
  passesPropsNo: { ask: 'propNone', holds: true, says: ([c, p]) => `passes no ${p} to <${c}>` },
  attributes: { ask: 'attribute', holds: true, says: ([a, v]) => `writes ${a}="${v}"` },
  attributesNo: { ask: 'attribute', holds: false, says: ([a, v]) => `writes no ${a}="${v}"` },
  writes: { ask: 'writes', holds: true, says: (v) => `writes the ${v} attribute` },
  writesNo: { ask: 'writes', holds: false, says: (v) => `writes no ${v} attribute` },
  readsNoGlobal: { ask: 'global', holds: false, says: (v) => `reads no ${v} global directly` },
});

const APP_SHELL = 'src/ui/SvelteCraftingSystemManagerApp.svelte.js';
const MAIN = 'src/main.js';
const MANAGER_ROOT = 'src/ui/svelte/apps/manager/CraftingSystemManagerRoot.svelte';
const MANAGER_EXTENSIONS = 'src/ui/managerExtensions.js';
const DOWNTIME_HOST = 'src/ui/svelte/apps/manager/downtime/WorldDowntimeExtensionHost.svelte';
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
const SYSTEMS_BROWSER = 'src/ui/svelte/apps/manager/SystemsBrowserView.svelte';
const SYSTEM_EDIT = 'src/ui/svelte/apps/manager/SystemEditView.svelte';
const TAGS_CATEGORIES = 'src/ui/svelte/apps/manager/TagsCategoriesView.svelte';
const WORLD_CURRENCY = 'src/ui/svelte/apps/manager/world/WorldCurrencyTab.svelte';
const WORLD_MODIFIERS = 'src/ui/svelte/apps/manager/world/WorldModifiersTab.svelte';
// The WORLD Tool entry, which took the linked-item card off the system editor (issue 1373).
const WORLD_TOOL_ENTRY = 'src/ui/svelte/apps/manager/scoped/WorldToolEntryPage.svelte';
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

/** One target, one contract test; every converted structural pin is one row of `claims`. */
function defineStructureContract(title, target, claims) {
  it(title, () => {
    const subject = structureOf(target);
    const label = labelOf(target);
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

  // The shell's own chrome and the eight routes it mounts. `fabricate-manager` and
  // `data-manager-view` are not here: every route module reads them off the mounted shell
  // (`target.querySelector('.fabricate-manager').dataset.managerView`).
  defineStructureContract('renders the manager shell and the routes it hosts', MANAGER_ROOT, {
    attributes: [
      ['class', 'manager-header'],
      ['class', 'manager-breadcrumbs'],
      ['class', 'manager-rail'],
      ['class', 'manager-inspector'],
    ],
    spells: ['is-rail-collapsed', 'manager-environment-edit-main'],
    renders: [
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
  defineStructureContract('titles the page after the record it edits', MANAGER_ROOT, {
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

  // Every one of the nine store delegations this block used to pin as root text is driven by
  // `tests/components/manager-tags-mounted.js`, which clicks the real control and reads the call
  // back off the store double; what stays is the route's own shape.
  defineStructureContract('routes tags and categories to its own focused page', MANAGER_ROOT, {
    imports: ['./TagsCategoriesView.svelte'],
  });

  defineStructureContract('owns the vocabulary wiring on that page', TAGS_CATEGORIES, {
    declaresProp: ['onRemoveCategory', 'onRemoveComponentCategory', 'onSetComponentCategoryIcon'],
    spellsExactly: ['FABRICATE.Admin.Manager.TagsCategories.GeneralReservedFeedback'],
    readsNoGlobal: ['game', 'ui', 'Hooks', 'CONFIG'],
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
    { file: MANAGER_ROOT, fn: 'confirmEssenceRouteExit' },
    { names: ['nextEssenceId', 'selectedEssenceId'], compares: ['essence-edit'] }
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

  // A load-bearing asymmetry: `confirmComponentRouteExit` deliberately lacks the
  // `|| nextView === '<kind>-edit'` bypass its recipe sibling carries, which is why the two are
  // asserted together: the sibling is what makes the absence a choice rather than an oversight.
  defineStructureContract(
    'AC14: the component route guard keeps NO component-edit bypass (issue 676)',
    { file: MANAGER_ROOT, fn: 'confirmComponentRouteExit' },
    { names: ['activeView'], compares: ['component-edit'], namesNo: ['nextView'] }
  );

  defineStructureContract(
    'and the recipe sibling still carries the bypass it omits',
    { file: MANAGER_ROOT, fn: 'confirmRecipeRouteExit' },
    { names: ['activeView', 'nextView'], compares: ['recipe-edit'] }
  );

  // `foundry` is not in the global set: the editor reaches `globalThis.foundry.utils.randomID`.
  // What it must never reach is an application class, which is the member read below.
  defineStructureContract('keeps the component editor free of Foundry globals', COMPONENT_EDIT, {
    readsNoGlobal: ['game', 'ui', 'Hooks', 'CONFIG'],
    readsNo: ['globalThis.foundry.applications', 'foundry.applications'],
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

  // The Tools library and the focused editor. What the library DRAWS — the rows, the pager, the
  // per-system counts, the selection, the three tabs, the absent creation surface and the absent
  // source drop zone, the dirty guard and the armed removal — is driven by
  // `tests/components/manager-tools-mounted.js`. What stays is the wiring behind it, including
  // the two callbacks that are deliberately NOT here.
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
      'confirmToolsRouteExit',
      'toolsNavCount',
      'createWorldToolFromItemDrop',
      'adoptWorldToolIntoSystem',
    ],
    reads: [
      'store.openToolDraft',
      'store.saveToolDraft',
      // `store.deleteToolDraft` GOES WITH THE HEADER BUTTON THAT CALLED IT. It deleted this
      // system's in-system record alone, leaving the world membership record behind as a ghost
      // nothing can read; `removeToolFromSystem` is the pair of writes that actually undoes an
      // adoption, and it is what the removal callout reaches (issue 1373).
      'store.removeToolFromSystem',
      'store.setToolSectionInherited',
      // TOOL CREATION IS A WORLD-SCOPE WRITE NOW.
      'services.resolveToolSource',
      'store.worldScope.tool.createEntity',
    ],
    passesProps: [
      ['WorldToolCataloguePage', 'onCreateFromItemDrop'],
      ['ToolBrowserInspector', 'onAddToSystem'],
      ['ToolBrowserInspector', 'onEditWorldTool'],
      // TASK 4: the editor behind `Edit rules` offers the route the rules LIST already advertises.
      ['ToolEditView', 'onEditWorldTool'],
    ],
    spellsExactly: ['world-tool-entry'],
    // AND THE SYSTEM ROUTE CARRIES NO CREATION DROP. The two screens had the drop zone exactly
    // inverted against the design, so this is the half that proves the move rather than a copy.
    namesNo: ['onCreateToolDrop', 'deleteSelectedLibraryTool'],
    readsNo: ['store.createToolDraft', 'store.deleteToolDraft'],
  });

  // Adoption is a NAMED handler that selects what it adopted, rather than leaving the GM on a row
  // that has silently changed cohort.
  defineStructureContract(
    'selects the Tool it has just adopted into the system',
    { file: MANAGER_ROOT, fn: 'adoptWorldToolIntoSystem' },
    { callsWith: [['selectLibraryTool', 'entityId']] }
  );

  // A rail count is a bare mono numeral in its own span, not a chip (issue 643). The Tool Studio's
  // entry is DRIVEN by `tests/components/manager-rail-mounted.js`, which presses it and reads the
  // route, and asserts the badge is absent at zero; what a mounted case cannot see is which
  // derivation each span renders.
  it('renders each rail count as the derived number inside the shared count span', () => {
    const rendered = classRenderedExpressions(componentAstOf(MANAGER_ROOT), 'manager-nav-count');
    const read = rendered.flatMap((expression) => [
      ...memberPaths(expression),
      ...identifierNames(expression),
    ]);
    for (const count of ['gatheringNavCounts.total', 'toolsNavCount']) {
      assert.ok(read.includes(count), `the rail renders ${count} as a bare count numeral`);
    }
  });

  defineStructureContract('renders the requirements tab from the focused editor', TOOL_EDIT, {
    renders: ['ToolRequirementsTab'],
    passesProps: [['ToolRequirementsTab', 'modifierOptions']],
    writes: ['data-tool-editor-world-tool'],
    names: ['onEditWorldTool'],
    // NO BARE `Delete` IN THE SYSTEM HEADER.
    spellsNo: ['data-tool-editor-delete'],
  });

  // ── THE BONUS TAKES ITS VALUE FROM THE WORLD LIBRARY (issue 1373, maintainer round 3) ──
  // The tab used to render a free-text `RollDataExpressionInput` labelled `Bonus expression`,
  // which the design has no counterpart for at either scope: `proto:2353`-`2369` and
  // `proto:2886`-`2905` both draw a single-select `World modifiers` list, and `proto:4753` sets
  // `bonus` to the chosen entry's expression. The persisted shape is untouched; what went away is
  // the ability to TYPE one. The two absent eyebrows are the headings the design merged into the
  // one sentence above the gate pair.
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

  it('draws BOTH lists on that tab as the shared modifier row, one of them opted in', () => {
    const requirements = componentAstOf(TOOL_REQUIREMENTS);
    const rows = renderedNodes(requirements, 'ModifierLibraryRow');
    assert.equal(rows.length, 2, 'the tab draws the shared row twice — prerequisites and bonus');
    // AND ONLY ONE OPTS IN. The bonus list one section below and the Checks Studio one screen
    // away both pass NEITHER, which is what makes the row's defaults load-bearing.
    const optedIn = rows.filter(
      (node) => propLiteral(node, 'controlPlacement') ?? propLiteral(node, 'textLayout')
    );
    assert.equal(optedIn.length, 1, 'only ONE opts in — the bonus list keeps the shipped face');
    const [prerequisite] = optedIn;
    assert.equal(propLiteral(prerequisite, 'controlPlacement'), 'leading', '`proto:2331`');
    assert.equal(propLiteral(prerequisite, 'textLayout'), 'stacked', '`proto:2333`');
    assert.ok(
      literalStrings(prerequisite).includes('data-tool-prerequisite-row'),
      'and it is the PREREQUISITE list, not the bonus list, that took them'
    );
    // The gate pair keeps its option-card group; the BONUS list must not grow a second one.
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

  // BOTH CALLERS MUST PASS THE ROSTER. A prop declared and not passed renders an empty library
  // that reads as "this world has none" — and it also subscribes the whole spread bundle, because
  // Svelte evaluates a spread only on a key MISS.
  defineStructureContract('forwards the roster from the world Tool entry too', WORLD_TOOL_ENTRY, {
    passesProps: [['ToolRequirementsTab', 'modifierOptions']],
    // ONE ACTION ON THE TILE, which is what the design draws (issue 1373's parity round). The
    // Copy that sat beside Unlink is gone with the raw uuid line it copied: an id is not a fact
    // this screen states anywhere else, and the third line displaced the hint that says what
    // dropping onto the tile does.
    renders: ['ItemDropZone'],
    spells: ['SourceDropHint'],
    writesNo: ['copyLabel', 'subline'],
    spellsNo: ['data-tool-source-replace'],
  });

  it('passes the world modifier roster to BOTH Tool requirement scopes', () => {
    const scopes = templateNodes(componentAstOf(MANAGER_ROOT)).filter(
      (node) => attributeExpression(node, 'modifierOptions')?.name === 'selectedSystemModifiers'
    );
    assert.equal(scopes.length, 2, 'the focused system editor and the world Tool entry');
  });

  // ── EVERY BEHAVIOUR SECTION IS A CARD. This used to require a `manager-tool-section-heading`
  // block — an unenclosed `<h3>` with a glyph and a hint, sitting on the page background above
  // loose controls. The design encloses each section in its own bordered, filled card whose head
  // states the section, whether this system inherits the world Tool's answer or overrides it,
  // what the world's answer is, and the switch between the two.
  defineStructureContract('draws breakage as inherit-aware cards', TOOL_BREAKAGE, {
    renders: ['ToolInheritCard'],
    writes: ['data-tool-remove-from-system'],
    spells: ['StopUsingHereHint'],
    // `Always fires` is GONE: the design uses that slot for the inheritance state.
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

  // THE SWITCH IS THE SHIPPED PRIMITIVE, not a second hand-rolled one.
  defineStructureContract('reuses the shared scoped inherit row', TOOL_INHERIT_CARD, {
    imports: ['../scoped/InheritRow.svelte'],
    passesValues: [['InheritRow', 'stateChip', false]],
  });

  // ── THE LINKED-ITEM CARD IS NOT AT SYSTEM SCOPE, and the per-system display-label override
  // names itself as an override in the screen's own idiom rather than in a help sentence.
  defineStructureContract('keeps the system band free of source linking', TOOL_SYSTEM_SCOPE, {
    renders: ['ToolInheritCard'],
    writes: ['data-tool-label'],
    rendersNo: ['ItemDropZone'],
    namesNo: ['onSourceDrop', 'onUnlinkSource', 'onCopySourceUuid'],
  });

  // THERE IS NO OVERVIEW TAB AT SYSTEM SCOPE AT ALL, and the declaration form is the `EditorTabs`
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
    { file: APP_SHELL, member: '_buildServices' },
    { reads: ['game.clipboard'], calls: ['copyPlainText'] }
  );

  defineStructureContract('never bypasses the Foundry clipboard service anywhere in the shell', APP_SHELL, {
    readsNo: ['navigator.clipboard', 'foundry.utils.copyPlainText'],
  });

  // The GM Knowledge surface (issue 785). Everything asserted here is a wiring decision whose
  // absence is SILENT at runtime: an un-suppressed inspector holds a dead 300px strip open, an
  // un-threaded `resolutionMode` hides the rail entry from the `global` + alchemy configuration
  // that motivated the widened gate, and an ungated `setKnowledgeActive` puts a whole-world
  // actors x items scan on every one of `refresh()`'s callers.
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
    callsWith: [['setKnowledgeActive', 'currentView']],
    passesProps: [['KnowledgeView', 'knowledge']],
    // The projection is published TOP-LEVEL, never hung off selectedSystem.
    readsNo: ['selectedSystem.knowledge'],
  });

  defineStructureContract(
    'threads the resolution mode the widened rail gate reads',
    { file: MANAGER_ROOT, constant: 'craftingNavArgs' },
    { keys: ['resolutionMode'], names: ['craftingResolutionMode'] }
  );

  // The CSS column release and the aside suppression are ONE decision expressed twice; doing only
  // the first leaves an empty 300px inspector holding the strip. The shared inspector element
  // itself is stated by `renders the manager shell and the routes it hosts`.
  defineStructureContract(
    'releases the third column for the full-width Knowledge surface',
    { file: MANAGER_ROOT, constant: 'FULL_WIDTH_VIEWS', record: ['id', 'knowledge'] },
    { property: [['layoutClass', 'self-owned-3-track']] }
  );

  // The view owns the single armed token and every disarm rule, and seeds its default tab ONCE.
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

  // A REAL focusable button, not the prototype's span affordance.
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

  // The armed token is keyed on the DOCUMENT id, so two copies of one recipe arm separately, and
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
  // `_filterNonExhausted` reads `timesUsed` alone. Read off the ONE disablable control rather
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
    const studio = moduleAstOf(KNOWLEDGE_STUDIO).ast;
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

    const collector = classMemberAst(
      moduleAstOf(APP_SHELL).ast,
      '_collectKnowledgeLearnedEntries'
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
  const SCOPED_DIR = 'src/ui/svelte/apps/manager/scoped';
  const SCOPED_PREVIEW = `${SCOPED_DIR}/ScopedEntityPreview.svelte`;
  // The Tool rail's stem is its own prop default now.
  const TOOL_PREVIEW = 'src/ui/svelte/apps/manager/tools/ToolBehaviorPreview.svelte';
  const declaredClasses = declaredManagerClasses();

  /**
   * The SEVEN class names `ScopedEntityPreview` renders for a given stem.
   *
   * @param {string} stem
   * @returns {string[]}
   */
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

  /**
   * The `{key, fallback}` pair `viewTitle` declares for each world scoped-entity route.
   *
   * @returns {Map<string, {key: string, fallback: string}>}
   */
  function scopedTitlesFromRoot() {
    const titles = new Map();
    const viewTitle = namedCodeAst(componentAstOf(MANAGER_ROOT).instance, 'viewTitle');
    for (const node of walkNodes(viewTitle)) {
      if (node.type !== 'IfStatement') continue;
      const view = comparedLiteral(node.test, 'currentView');
      const [key, fallback] = returnedTextArguments(node.consequent);
      if (String(view).startsWith('world-') && key !== undefined) titles.set(view, { key, fallback });
    }
    return titles;
  }

  /**
   * The four facts `scopedEntryRoutes.js` records per entry route, in declaration order.
   *
   * @param {string} file
   * @returns {Array<{entryView: string, entityType: string, catalogueView: string, catalogueTitleKey: string, catalogueTitleFallback: string}>}
   */
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

    // TWO SPELLINGS, AND BOTH ARE READ (issue 1372). A page that still DELEGATES its body states
    // the four facts as attributes on `ScopedPlaceholderPage`; a page a screen lane has REPLACED
    // states them as module constants beside its own `<main>`. Reading only the first form makes
    // every replaced page answer `undefined` on all four, which collapses the distinctness sets
    // below to fewer than seven and reds a lane that did everything right — and reading only the
    // second would do the same to the four that have not been replaced yet. The swap detector has
    // to survive the transition it exists to police, so it resolves either.
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
    // NON-VACUITY, because the pair of readings above is exactly the thing that can silently
    // answer `undefined` for every page after a rename: a set of seven `undefined`s has size one,
    // which the distinctness assertions below would catch, but a set of seven MISSING title
    // fallbacks would not — nothing else reads that field.
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
    assert.equal(crumbs.length, 1, 'the entry trail draws ONE intermediate catalogue crumb');
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
