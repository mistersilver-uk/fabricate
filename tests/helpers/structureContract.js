/**
 * The shared structure-contract table (issue 1691, extracted by 1697): one target, one `it`, one
 * row per converted pin. Every read goes through the AST-only seam `tests/helpers/parsedSource.js`,
 * so a row cannot become `text.includes(…)` again. Pinned by `tests/structure-contract.test.js`.
 */
import { it } from 'node:test';
import assert from 'node:assert/strict';

import {
  calledName,
  declaredConstant as declaredConstantOf,
  identifierNames,
  importsModule as importsModuleOf,
  importsModuleLazily,
  literalStrings,
  referencesIdentifier as referencesIdentifierOf,
  walkNodes,
} from './moduleAst.js';
import {
  componentAstOf,
  componentAstsIn,
  componentScopeOf,
  moduleAstOf,
  moduleAstsIn,
} from './parsedSource.js';
import {
  attributeExpression,
  attributeNames,
  attributeValue,
  boundDirectives,
  containsLiteral,
  declaredConstant,
  declaresProp,
  importsModule,
  passesProp,
  propDefault,
  propNone,
  readsGlobal,
  referencesIdentifier,
  rendersBefore,
  rendersComponent,
  rendersElement,
  requiresProp,
  spellsLiteral,
  styleDeclares,
  styleRule,
} from './svelteStructureContract.js';

/** Every `text(key, fallback)` a component states with both arguments spelled out. */
function staticTextCalls(component) {
  const calls = [];
  for (const node of walkNodes(component)) {
    if (calledName(node) !== 'text') continue;
    const [key, fallback] = node.arguments;
    if (typeof key?.value !== 'string' || typeof fallback?.value !== 'string') continue;
    if (key.type === 'Literal' && fallback.type === 'Literal') {
      calls.push({ key: key.value, fallback: fallback.value });
    }
  }
  return calls;
}
// A structural claim is a row in a `defineStructureContract` table, never another
// parse-and-assert pair: the repeated pair is the shape the duplication gate fails (issue 1691).

function classMemberAst(ast, name) {
  for (const node of walkNodes(ast)) {
    if (node.type === 'MethodDefinition' && node.key?.name === name) return node;
  }
  throw new Error(`no class member \`${name}\``);
}

/** Every element or component node in a template, for the claims that count render sites. */
function templateNodes(component) {
  const nodes = [];
  for (const node of walkNodes(component.fragment)) {
    if (node.type === 'RegularElement' || node.type === 'Component') nodes.push(node);
  }
  return nodes;
}

/** A record key under either shipped spelling, so a quoted key cannot evade a claim about it. */
function keyName(node) {
  if (node.key?.name) return node.key.name;
  return node.key?.type === 'Literal' ? String(node.key.value) : undefined;
}

function propertyAst(node, name) {
  for (const inner of walkNodes(node)) {
    if (inner.type === 'Property' && keyName(inner) === name) return inner.value;
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

/** Whether a subtree calls one function with a given literal argument — what a route press is. */
function callsWithLiteral(node, [name, value]) {
  for (const inner of walkNodes(node)) {
    if (inner.type !== 'CallExpression' || calledName(inner) !== name) continue;
    if (inner.arguments.some((argument) => argument?.type === 'Literal' && argument.value === value))
      return true;
  }
  return false;
}

/** The class members whose own body calls `name`, sorted: the census a prune seam is held to. */
function membersCalling(node, name) {
  const members = [];
  for (const inner of walkNodes(node)) {
    if (inner.type !== 'MethodDefinition' || !callNames(inner.value).has(name)) continue;
    members.push(keyName(inner));
  }
  return members.sort();
}

/** Whether a `??` or `||` falls back from a call of `callee` to a `new constructorName(…)`. */
function fallsBackFrom(node, [callee, constructorName]) {
  for (const inner of walkNodes(node)) {
    if (inner.type !== 'LogicalExpression' || !['??', '||'].includes(inner.operator)) continue;
    if (inner.right?.type !== 'NewExpression' || inner.right.callee?.name !== constructorName) continue;
    if (callNames(inner.left).has(callee)) return true;
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
    if (inner.type === 'Property' && keyName(inner) === key && inner.value?.type === 'Literal') {
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
    if (inner.type !== 'Property') continue;
    const name = keyName(inner);
    if (name !== undefined) keys.add(name);
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

/** Every render site of one component, for the claims that count them or compare two. */
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
    callsLiteral: (pair) => callsWithLiteral(code, pair),
    extendsCall: (name) => extendsCallOf(code, name),
    exports: (name) => exportedNames(code).has(name),
    hooks: (event) => hookNames(code).has(event),
    diffKeys: ([object, key]) => inOperatorKeys(code, object).has(key),
    compares: (value) => comparesToLiteral(code, value),
    returnsFor: (pair) => returnsForComparison(code, pair),
    assigns: ([name, value]) => assignedLiterals(code, name).includes(value),
    property: ([key, value]) => propertyValues(code, key).includes(value),
    key: (name) => propertyKeys(code).has(name),
    callers: ([name, members]) =>
      membersCalling(code, name).join('\n') === [...members].sort().join('\n'),
    fallsBack: (pair) => fallsBackFrom(code, pair),
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
    rendersBefore: (pair) => rendersBefore(component, pair),
    styleDeclares: (row) => styleDeclares(component, row),
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
    let scoped = binding
      ? namedCodeAst([component.instance, component.module], binding)
      : component;
    if (record) scoped = recordAst(scoped, record);
    if (property) scoped = propertyAst(scoped, property);
    return claimsOverCode(scoped);
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
  if (Array.isArray(target)) return `any of ${target.length} files`;
  if (typeof target === 'string') return target;
  if (target.dir) return `any of ${target.dir}`;
  const { file, member, constant, property, fn, record } = target;
  const parts = [file, member, constant ?? fn, record?.join('='), property];
  return parts.filter(Boolean).join(' > ');
}

/** How a failure message names one addressable template node. */
const labelOfNode = (token) => (typeof token === 'string' ? `<${token}>` : JSON.stringify(token));

/** Each claim a contract row may make: the question to ask, and the answer it must get. */
const CONTRACT_CLAIMS = Object.freeze({
  renders: { ask: 'renders', holds: true, says: (v) => `renders <${v}>` },
  elements: { ask: 'element', holds: true, says: (v) => `renders a <${v}> element` },
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
  callsWithNo: {
    ask: 'callsWith',
    holds: false,
    says: ([f, a]) => `never calls ${f}() with ${a}`,
  },
  callsLiteral: { ask: 'callsLiteral', holds: true, says: ([f, v]) => `calls ${f}("${v}")` },
  callsLiteralNo: {
    ask: 'callsLiteral',
    holds: false,
    says: ([f, v]) => `never calls ${f}("${v}")`,
  },
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
  callers: {
    ask: 'callers',
    holds: true,
    says: ([f, members]) => `calls ${f}() from exactly ${members.join(', ')}`,
  },
  fallsBackNo: {
    ask: 'fallsBack',
    holds: false,
    says: ([f, c]) => `never falls back from ${f}() to a new ${c}`,
  },
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
  rendersBefore: {
    ask: 'rendersBefore',
    holds: true,
    says: ([b, a]) => `draws ${labelOfNode(b)} before ${labelOfNode(a)}`,
  },
  styleDeclares: {
    ask: 'styleDeclares',
    holds: true,
    says: ([s, p, v]) => `scopes ${JSON.stringify(s)} { ${p}${v === undefined ? '' : `: ${v}`} }`,
  },
  styleDeclaresNo: {
    ask: 'styleDeclares',
    holds: false,
    says: ([s, p]) => `scopes ${JSON.stringify(s)} with no ${p}`,
  },
});

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

export {
  CONTRACT_CLAIMS,
  attributeLiteral,
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
  attributeValues,
};
