/**
 * Parse plain `.js` / `.mjs` into an ESTree AST for the gates that need structure rather than text
 * (issues 1658, 1659). Its guarantees are proved from inside the `npm test` glob by
 * `tests/module-ast.test.js`, because `tests/helpers/` is outside that glob.
 *
 * `svelte/compiler`'s `parse` is template-only and `compileModule` returns code, so neither yields a
 * module AST. `acorn` is present only transitively; declaring it would touch `package.json` and
 * `package-lock.json`, both high-risk paths. `svelte-eslint-parser` is already a declared
 * devDependency and its `.svelte.js` rune-module mode is a strict superset of module JS.
 *
 * Feeding plain JS to the template parser inside a synthetic `<script>` wrapper was rejected: it
 * shifts every offset by the wrapper's length, breaks on an unescaped `</script` in any string,
 * comment or template literal, and fails outright on a hashbang.
 */
import { parseForESLint } from 'svelte-eslint-parser';

/**
 * The parser selects its mode from the extension, so the name must end `.svelte.js`; nothing reads
 * the file system, and no claim is made about where the source came from.
 */
const PROBE_FILE_PATH = 'probe.svelte.js';

/** Keys that make the tree cyclic or carry no child nodes, so a walk must not follow them. */
const SKIPPED_KEYS = new Set(['parent', 'loc', 'range']);

/**
 * @param {string} source
 * @returns {{ast: object, scopeManager: object}} `loc` and `range` are unshifted from `source`.
 */
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

/**
 * Every node under `root`, depth-first, each visited once.
 *
 * @param {object} root
 * @returns {Generator<object>}
 */
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
