/**
 * Measure oversized files and functions (issue 1659). Proved from inside the `npm test` glob by
 * `tests/file-size-ledger.test.js`.
 *
 * Boundaries come from a PARSE, never a brace-depth scan. A regex literal's `{1,32}` quantifier
 * contributes braces that corrupt a depth counter, and the functions that matter here nest — the
 * issue's own `adminStore.refresh()` sits inside `createAdminStore()`, which a top-level scan
 * never reaches.
 *
 * An enclosing function's count is not reduced by a nested one: subtracting would hide a long
 * function that happens to contain a longer-lived helper.
 */
import { parse } from 'svelte/compiler';

import { parseModule, walkNodes } from './moduleAst.js';

/** More than this many physical lines makes a file oversized. */
export const FILE_THRESHOLDS = Object.freeze({ '.svelte': 500, '.js': 800, '.mjs': 800 });

/** More than this many physical lines makes a function oversized. */
export const FUNCTION_THRESHOLD = 100;

const FUNCTION_TYPES = Object.freeze([
  'FunctionDeclaration',
  'FunctionExpression',
  'ArrowFunctionExpression',
]);

/** The name a function is reached by, or `undefined` when it is genuinely anonymous. */
function declaredName(node, owners) {
  if (node.id?.name) return node.id.name;
  const owner = owners.get(node);
  if (!owner) return undefined;
  if (owner.type === 'VariableDeclarator' && owner.id?.type === 'Identifier') return owner.id.name;
  if (owner.type === 'Property' || owner.type === 'PropertyDefinition') {
    return owner.key?.name ?? owner.key?.value;
  }
  if (owner.type === 'MethodDefinition') return owner.key?.name ?? owner.key?.value;
  return undefined;
}

/** Map each function node to the declaration that names it, which the AST does not record. */
function functionOwners(ast) {
  const owners = new Map();
  for (const node of walkNodes(ast)) {
    const candidates = [
      ['VariableDeclarator', node.init],
      ['Property', node.value],
      ['PropertyDefinition', node.value],
      ['MethodDefinition', node.value],
    ];
    for (const [type, value] of candidates) {
      if (node.type === type && value && FUNCTION_TYPES.includes(value.type))
        owners.set(value, node);
    }
  }
  return owners;
}

/** A qualified name, so two same-named accessors in one file cannot share a key. */
function qualify(node, owners, byNode) {
  const trail = [];
  let current = node;
  while (current) {
    const name = declaredName(current, owners);
    trail.unshift(name ?? 'anonymous');
    current = byNode.get(current);
  }
  return trail.join('>');
}

/** Each function's enclosing function, so a nested one can be qualified by its parent. */
function enclosingFunctions(functions) {
  const byNode = new Map();
  for (const inner of functions) {
    let best;
    for (const outer of functions) {
      if (outer === inner) continue;
      if (outer.start > inner.start || outer.end < inner.end) continue;
      if (!best || outer.start > best.start) best = outer;
    }
    if (best) byNode.set(inner, best);
  }
  return byNode;
}

const lineOf = (text, index) => text.slice(0, index).split('\n').length;

/**
 * Every function in one parsed program, as `{ symbol, lines }`, measured in physical lines.
 *
 * A repeated qualified name takes an ordinal. Two anonymous callbacks in one file would otherwise
 * share a key, and a ledger keyed by name silently keeps only the last — a dropped entry that
 * reads as a shrinking debt.
 */
function measureProgram(ast, text, offset = 0) {
  const functions = [...walkNodes(ast)]
    .filter((node) => FUNCTION_TYPES.includes(node.type))
    .sort((left, right) => left.start - right.start);
  const owners = functionOwners(ast);
  const byNode = enclosingFunctions(functions);
  const seen = new Map();
  return functions.map((node) => {
    const base = qualify(node, owners, byNode);
    const ordinal = (seen.get(base) ?? 0) + 1;
    seen.set(base, ordinal);
    return {
      symbol: ordinal === 1 ? base : `${base}#${ordinal}`,
      lines: lineOf(text, node.end + offset) - lineOf(text, node.start + offset) + 1,
    };
  });
}

/** Every function in a `.js` or `.mjs` module. */
export function measureModuleFunctions(text) {
  return measureProgram(parseModule(text).ast, text);
}

/**
 * Every function in a component's script blocks. The markup carries no function declarations of
 * its own, and a component's FILE size is measured over the whole file rather than here.
 */
export function measureComponentFunctions(text) {
  const ast = parse(text, { modern: true });
  const measured = [];
  for (const block of [ast.instance, ast.module]) {
    if (block?.content) measured.push(...measureProgram(block.content, text));
  }
  return measured;
}

/** Physical lines, comments and blanks included, matching the figures the issue quotes. */
export const physicalLines = (text) => text.split('\n').length;
