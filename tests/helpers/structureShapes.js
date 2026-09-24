/**
 * The AST predicates behind the structure-contract claims (issues 1691, 1933): shape equality with
 * a parsed probe, which ignores positions, raw spellings, comments and `?.` wrappers, and the
 * template, import and prop questions the claim table asks. Reads no file.
 */
import { isDeepStrictEqual } from 'node:util';

import {
  calledName,
  importedModules,
  lazilyImportedModules,
  parseModule,
  walkNodes,
} from './moduleAst.js';
import { declaredProps } from './svelteStructureContract.js';

const IGNORED_KEYS = new Set([
  'start',
  'end',
  'loc',
  'range',
  'raw',
  'parent',
  'leadingComments',
  'trailingComments',
  'comments',
  'tokens',
  'metadata',
]);

/** A node as plain data: what it is and what it holds, never where it sits or how it is spelled. */
export function shapeOf(node) {
  if (Array.isArray(node)) return node.map(shapeOf);
  if (!node || typeof node !== 'object') return node;
  if (node.type === 'ChainExpression') return shapeOf(node.expression);
  const shape = {};
  for (const [key, value] of Object.entries(node)) {
    if (!IGNORED_KEYS.has(key)) shape[key] = shapeOf(value);
  }
  return shape;
}

/**
 * A module statement first, so `function f() {}` stays a declaration; then an expression, where a
 * multi-key object literal lands; then a function-body statement such as `return`.
 */
const PROBE_FORMS = Object.freeze([
  [(source) => source, (body) => (body.length === 1 ? body[0] : undefined)],
  [(source) => `(${source}\n);`, (body) => body[0]?.expression],
  [
    (source) => `async function probe() {\n${source}\n}`,
    (body) => (body[0]?.body?.body?.length === 1 ? body[0].body.body[0] : undefined),
  ],
]);

const probes = new Map();

function parseProbe(source) {
  for (const [wrap, pick] of PROBE_FORMS) {
    let body;
    try {
      body = parseModule(wrap(source)).ast.body;
    } catch {
      continue;
    }
    const node = pick(body);
    if (node) return shapeOf(node.type === 'ExpressionStatement' ? node.expression : node);
  }
  throw new Error(`the probe \`${source}\` is not one JavaScript expression or statement`);
}

/** The shape of one expression or statement, parsed once per spelling. */
export function probeShape(source) {
  if (!probes.has(source)) probes.set(source, parseProbe(source));
  return probes.get(source);
}

/** Whether a node has exactly the probe's shape. */
export function hasShape(node, source) {
  const probe = probeShape(source);
  const subject = node?.type === 'ChainExpression' ? node.expression : node;
  return subject?.type === probe.type && isDeepStrictEqual(shapeOf(subject), probe);
}

/** How many nodes of a subtree have exactly the probe's shape. */
export function shapeCount(root, source) {
  let count = 0;
  for (const node of walkNodes(root)) {
    if (node.type !== 'ChainExpression' && hasShape(node, source)) count += 1;
  }
  return count;
}

/** Every element or component node in a template, for the claims that count render sites. */
export function templateNodes(component) {
  const nodes = [];
  for (const node of walkNodes(component.fragment)) {
    if (node.type === 'RegularElement' || node.type === 'Component') nodes.push(node);
  }
  return nodes;
}

/** A record key under either shipped spelling, so a quoted key cannot evade a claim about it. */
export function keyName(node) {
  if (node.key?.name) return node.key.name;
  return node.key?.type === 'Literal' ? String(node.key.value) : undefined;
}

/** One named function or binding value out of a subtree — the AST of the slice it replaces. */
export function namedCodeAst(scope, name) {
  for (const node of walkNodes(scope ?? {})) {
    if (node.type === 'FunctionDeclaration' && node.id?.name === name) return node;
    if (node.type === 'VariableDeclarator' && node.id?.name === name && node.init) return node.init;
  }
  throw new Error(`no binding \`${name}\``);
}

/** Every render site of one component, for the claims that count them or compare two. */
export function renderedNodes(component, name) {
  return templateNodes(component).filter((node) => node.type === 'Component' && node.name === name);
}

const byLocale = (a, b) => String(a).localeCompare(String(b));
export const sameSorted = (actual, expected) =>
  isDeepStrictEqual([...actual].sort(byLocale), [...expected].sort(byLocale));
const COMPUTED_IMPORT = 'import(<computed>)';

/** A dynamic specifier, or the marker an unreadable one gets so an exact set cannot miss it. */
function dynamicSpecifier(source) {
  if (source?.type === 'Literal' && typeof source.value === 'string') return source.value;
  if (source?.type === 'TemplateLiteral' && source.expressions.length === 0) {
    return source.quasis[0].value.cooked;
  }
  return COMPUTED_IMPORT;
}

/** A static specifier, a namespace import or `export * as` spelled `* as <specifier>`. */
function staticSpecifier(declaration) {
  const whole =
    (declaration.specifiers ?? []).some(({ type }) => type === 'ImportNamespaceSpecifier') ||
    (declaration.type === 'ExportAllDeclaration' && declaration.exported);
  return whole ? `* as ${declaration.source.value}` : declaration.source.value;
}

/** Every specifier a subtree imports in any form. */
const importSpecifiers = (node) => [
  ...importedModules(node, staticSpecifier),
  ...lazilyImportedModules(node, dynamicSpecifier),
];

/** The specifiers naming `needle`, case-insensitively; an unreadable `import()` always counts. */
export function importFamily(node, needle) {
  return importSpecifiers(node).filter(
    (specifier) =>
      specifier === COMPUTED_IMPORT || specifier.toLowerCase().includes(needle.toLowerCase())
  );
}

const memberKey = (node) =>
  node.computed
    ? node.property?.type === 'Literal'
      ? String(node.property.value)
      : undefined
    : node.property?.name;

function chainLabel(node) {
  if (node?.type === 'ChainExpression') return chainLabel(node.expression);
  if (node?.type === 'Identifier') return node.name;
  if (node?.type === 'ThisExpression') return 'this';
  if (node?.type === 'MemberExpression' && !node.computed) {
    return `${chainLabel(node.object)}.${node.property.name}`;
  }
  return '?';
}

/** Each read of `.property`, bracket spelling included, as `root.property.next`, counted. */
export function propertyReadTally(node, property) {
  const members = [...walkNodes(node)].filter((inner) => inner.type === 'MemberExpression');
  const reads = new Set(members.filter((member) => memberKey(member) === property));
  const next = new Map(members.filter(({ object }) => reads.has(object)).map((m) => [m.object, m]));
  const tally = new Map();
  for (const read of reads) {
    const tail = next.has(read) ? [memberKey(next.get(read)) ?? '[computed]'] : [];
    const label = [chainLabel(read.object), property, ...tail].join('.');
    tally.set(label, (tally.get(label) ?? 0) + 1);
  }
  return [...tally].sort(([left], [right]) => byLocale(left, right));
}

/** An attribute as a call site spells it: `bind:` for a binding, `...x` for a spread. */
export function attributeLabel(attribute) {
  if (attribute.type === 'BindDirective') return `bind:${attribute.name}`;
  if (attribute.type === 'SpreadAttribute') return `...${attribute.expression?.name ?? '?'}`;
  return attribute.name;
}

/** Whether a node gives an attribute this value: static text, `true` bare, else a probe's shape. */
export function attributeIs(node, [name, expected]) {
  const attribute = (node.attributes ?? []).find((entry) => attributeLabel(entry) === name);
  if (attribute?.type === 'BindDirective') return hasShape(attribute.expression, expected);
  if (attribute?.value === true) return expected === true;
  if (attribute?.value?.type === 'ExpressionTag') {
    return typeof expected === 'string' && hasShape(attribute.value.expression, expected);
  }
  const chunks = Array.isArray(attribute?.value) ? attribute.value : [];
  return chunks.length === 1 && chunks[0].type === 'Text' && chunks[0].data === expected;
}

/** The template nodes a row names: by tag or component `at`, and by one attribute `where`. */
export function locatedNodes(component, locator) {
  const { at, where } = typeof locator === 'string' ? { at: locator } : locator;
  return templateNodes(component).filter(
    (node) =>
      (at === undefined || node.name === at) && (where === undefined || attributeIs(node, where))
  );
}

export const locatorLabel = (locator) => {
  if (typeof locator === 'string') return `<${locator}>`;
  const where = locator.where ? ` ${locator.where[0]}=${locator.where[1]}` : '';
  return `<${locator.at ?? '*'}${where}>`;
};

/** The keys a spread `{...name}` carries, read off the `$derived({…})` or object it names. */
function spreadKeys(component, expression) {
  if (expression?.type !== 'Identifier') return null;
  let value;
  try {
    value = namedCodeAst([component.instance, component.module], expression.name);
  } catch {
    return null;
  }
  const object = calledName(value) === '$derived' ? value.arguments[0] : value;
  return object?.type === 'ObjectExpression' ? object.properties.map(keyName) : null;
}

/** Whether every render of `name` supplies each prop `screen` declares, bar exactly `exempt`. */
export function suppliesProps(component, screen, { component: name, exempt = [] }) {
  const declared = [...declaredProps(screen).declared];
  const sites = renderedNodes(component, name);
  if (declared.length === 0 || sites.length === 0) return false;
  return sites.every((site) => {
    const supplied = new Set();
    for (const attribute of site.attributes ?? []) {
      const keys =
        attribute.type === 'SpreadAttribute'
          ? spreadKeys(component, attribute.expression)
          : [attribute.name];
      if (!keys) return false;
      for (const key of keys) supplied.add(key);
    }
    return sameSorted(
      declared.filter((prop) => !supplied.has(prop)),
      exempt
    );
  });
}

/** The names a member access or an object key spells, which are not reads of a binding. */
function spelledOnly(nodes) {
  const spelled = new Set();
  for (const node of nodes) {
    if (node.type === 'MemberExpression' && !node.computed) spelled.add(node.property);
    if (node.type === 'Property' && !node.computed && !node.shorthand) spelled.add(node.key);
  }
  return spelled;
}

/** The declared props nothing outside the `$props()` declaration reads as a binding. */
export function unreadProps(component) {
  const declarations = [...walkNodes(component)].filter(
    (node) => node.type === 'VariableDeclarator' && calledName(node.init) === '$props'
  );
  const nodes = [...walkNodes(component, new Set(declarations))];
  const spelled = spelledOnly(nodes);
  const read = new Set(
    nodes.filter((node) => node.type === 'Identifier' && !spelled.has(node)).map(({ name }) => name)
  );
  return [...declaredProps(component).declared].filter((prop) => !read.has(prop));
}
