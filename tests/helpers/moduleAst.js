/**
 * Parse plain `.js` / `.mjs` into an ESTree AST for the gates that need structure rather than text
 * (issues 1658, 1659).
 */
import { parseForESLint } from 'svelte-eslint-parser';

/** The parser selects its mode from the extension, so the name must end `.svelte.js`. */
const PROBE_FILE_PATH = 'probe.svelte.js';

/** Keys that make the tree cyclic or carry no child nodes, so a walk must not follow them. */
const SKIPPED_KEYS = new Set(['parent', 'loc', 'range', 'tokens', 'comments']);

/** `loc` and `range` on the result are unshifted from `source`. */
export function parseModule(source) {
  const { ast, scopeManager } = parseForESLint(String(source ?? ''), {
    filePath: PROBE_FILE_PATH,
    ecmaVersion: 'latest',
    sourceType: 'module',
    loc: true,
    range: true,
  });
  return { ast, scopeManager };
}

/** Every node under `root`, depth-first, each visited once. */
export function* walkNodes(root, seen = new Set()) {
  if (!root || typeof root !== 'object' || seen.has(root)) return;
  seen.add(root);
  if (typeof root.type === 'string') yield root;
  for (const [key, value] of Object.entries(root)) {
    if (SKIPPED_KEYS.has(key)) continue;
    if (Array.isArray(value)) {
      for (const child of value) yield* walkNodes(child, seen);
    } else if (value && typeof value === 'object') {
      yield* walkNodes(value, seen);
    }
  }
}

/** The name a call invokes, whether `fn()` or `object.fn()`; `undefined` for a computed callee. */
export function calledName(node) {
  if (node?.type !== 'CallExpression') return undefined;
  if (node.callee?.type === 'Identifier') return node.callee.name;
  if (node.callee?.type === 'MemberExpression' && node.callee.property?.type === 'Identifier') {
    return node.callee.computed ? undefined : node.callee.property.name;
  }
  return undefined;
}

/** Every string a subtree spells literally, including template-literal chunks. */
export function literalStrings(node) {
  const found = [];
  for (const inner of walkNodes(node)) {
    if (inner.type === 'Literal' && typeof inner.value === 'string') found.push(inner.value);
    if (inner.type === 'TemplateLiteral') {
      for (const quasi of inner.quasis) found.push(quasi.value.raw);
    }
  }
  return found;
}

/** Every identifier name a subtree mentions. */
export function identifierNames(node) {
  const names = new Set();
  for (const inner of walkNodes(node)) if (inner.type === 'Identifier') names.add(inner.name);
  return names;
}

const SPECIFIER_TYPES = Object.freeze([
  'ImportDeclaration',
  'ExportNamedDeclaration',
  'ExportAllDeclaration',
]);

/** Every specifier a subtree names in a static import or re-export, as `label` spells it. */
export function importedModules(node, label = (declaration) => declaration.source.value) {
  const specifiers = [];
  for (const inner of walkNodes(node)) {
    if (SPECIFIER_TYPES.includes(inner.type) && inner.source?.value) {
      specifiers.push(label(inner));
    }
  }
  return specifiers;
}

const literalSource = (source) => (source?.type === 'Literal' ? source.value : undefined);

/** Every specifier a subtree names in an `import(…)` that `read` reads: by default a literal. */
export function lazilyImportedModules(node, read = literalSource) {
  const specifiers = [];
  for (const inner of walkNodes(node)) {
    if (inner.type !== 'ImportExpression') continue;
    const specifier = read(inner.source);
    if (specifier !== undefined) specifiers.push(specifier);
  }
  return specifiers;
}

/** Static and lazy are separate questions: a chunked module is imported one way, not the other. */
export function importsModule(node, specifier) {
  return importedModules(node).includes(specifier);
}

export function importsModuleLazily(node, specifier) {
  return lazilyImportedModules(node).includes(specifier);
}

/** Anywhere, property keys and member names included, which is what makes an absence sound. */
export function referencesIdentifier(node, name) {
  return identifierNames(node).has(name);
}

/** Whether a subtree declares `const <name>`, wherever the declaration sits. */
export function declaredConstant(node, name) {
  for (const inner of walkNodes(node)) {
    if (inner.type !== 'VariableDeclaration' || inner.kind !== 'const') continue;
    if (inner.declarations.some((declarator) => declarator.id?.name === name)) return true;
  }
  return false;
}
