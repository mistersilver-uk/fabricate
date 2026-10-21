/**
 * What a published entry's closure draws (issue 2454): the props of each closure file that are
 * falsy whatever the companion passes, the template nodes an `{#if}` on such a prop leaves undrawn,
 * and the component files a drawn tag reaches from the entry's own.
 * Limit: an entry file's prop is falsy when it is unpublished, never written and its default is a
 * falsy literal; another file's when every drawn tag passes it a falsy literal or a falsy prop of
 * that tag's file, or omits it beside a falsy literal default, with no spread but the entry's rest.
 * Limit: a test is falsy only as a falsy prop, a plain `const` or `$derived` of a falsy expression,
 * `Boolean()` of one, an `&&` with a falsy side, an `||` of falsy sides, or a member read off one; a
 * snippet's content counts as drawn wherever the snippet is declared drawn.
 */
import { posix } from 'node:path';

import { walkNodes, walkWithAncestors } from './moduleAst.js';
import { importClosure, isComponent } from './publishedComponentGate.js';

const FALSY_LITERALS = new Set([false, null, 0, '']);
const DRAWN_TYPES = new Set(['RegularElement', 'SvelteElement', 'Component']);

const isFalsyLiteral = (node) =>
  (node?.type === 'Literal' && FALSY_LITERALS.has(node.value)) ||
  (node?.type === 'Identifier' && node.name === 'undefined');

/** Each `$props()` key by local name, beside whether its default is a falsy literal or absent. */
function declaredProps(ast) {
  for (const node of walkNodes(ast.instance)) {
    if (node.type !== 'VariableDeclarator' || node.init?.callee?.name !== '$props') continue;
    return node.id.properties
      .filter((property) => property.type === 'Property')
      .map(({ key, value }) => {
        const named = key.name ?? key.value;
        if (value.type !== 'AssignmentPattern')
          return { key: named, local: value.name, falsy: true };
        const bindable = value.right.callee?.name === '$bindable';
        const fallback = bindable ? value.right.arguments[0] : value.right;
        return { key: named, local: value.left.name, falsy: !fallback || isFalsyLiteral(fallback) };
      });
  }
  return [];
}

/** Every local a component assigns, updates or binds, each of which its own writes keep live. */
function writtenLocals(ast) {
  const written = new Set();
  for (const node of [ast.instance, ast.fragment].flatMap((root) => [...walkNodes(root)])) {
    if (node.type === 'AssignmentExpression' && node.left.type === 'Identifier') {
      written.add(node.left.name);
    }
    if (node.type === 'UpdateExpression' && node.argument.type === 'Identifier') {
      written.add(node.argument.name);
    }
    if (node.type === 'BindDirective' && node.expression?.type === 'Identifier') {
      written.add(node.expression.name);
    }
  }
  return written;
}

/** Each top-level `const` of the instance script by name, a `$derived` read through to its expression. */
function constInits(ast) {
  const inits = new Map();
  for (const statement of ast.instance?.content.body ?? []) {
    if (statement.type !== 'VariableDeclaration' || statement.kind !== 'const') continue;
    for (const { id, init } of statement.declarations) {
      if (id.type !== 'Identifier' || !init) continue;
      inits.set(id.name, init.callee?.name === '$derived' ? init.arguments[0] : init);
    }
  }
  return inits;
}

/** Whether `expression` is falsy while every local of `falsy` is, as the module docblock limits. */
function isFalsy(expression, falsy, inits, seen = new Set()) {
  if (!expression) return false;
  if (isFalsyLiteral(expression)) return true;
  const again = (node) => isFalsy(node, falsy, inits, seen);
  switch (expression.type) {
    case 'Identifier': {
      const { name } = expression;
      if (falsy.has(name)) return true;
      if (!inits.has(name) || seen.has(name)) return false;
      return isFalsy(inits.get(name), falsy, inits, new Set([...seen, name]));
    }
    case 'LogicalExpression': {
      if (expression.operator === '&&') return again(expression.left) || again(expression.right);
      return expression.operator === '||' && again(expression.left) && again(expression.right);
    }
    case 'MemberExpression': {
      return again(expression.object);
    }
    case 'ChainExpression': {
      return again(expression.expression);
    }
    case 'CallExpression': {
      return expression.callee?.name === 'Boolean' && again(expression.arguments[0]);
    }
    default: {
      return false;
    }
  }
}

/** The start offset of every element and component tag an `{#if}` with a falsy test hides. */
function undrawnStarts(ast, falsy) {
  const inits = constInits(ast);
  const hidden = new Set();
  walkWithAncestors(ast.fragment, (node, ancestors) => {
    if (!DRAWN_TYPES.has(node.type)) return;
    const below = [...ancestors, node];
    const covered = ancestors.some(
      (block, at) =>
        block.type === 'IfBlock' &&
        below[at + 1] === block.consequent &&
        isFalsy(block.test, falsy, inits)
    );
    if (covered) hidden.add(node.start);
  });
  return hidden;
}

/** Each relative component tag one file draws, as `{ child, node }`. */
function componentTags(file, ast) {
  const imported = new Map();
  for (const statement of ast.instance?.content.body ?? []) {
    if (statement.type !== 'ImportDeclaration' || !statement.source.value.startsWith('.')) continue;
    const path = posix.join(posix.dirname(file), statement.source.value);
    for (const specifier of statement.specifiers) imported.set(specifier.local.name, path);
  }
  return [...walkNodes(ast.fragment)]
    .filter((node) => node.type === 'Component' && imported.has(node.name))
    .map((node) => ({ child: imported.get(node.name), node }));
}

/** Whether one attribute's value is falsy: a bare attribute is `true`, and text is falsy only empty. */
function attributeIsFalsy({ value }, falsy, inits) {
  if (value === true) return false;
  const parts = [value].flat();
  if (parts.every((part) => part.type === 'Text')) return parts.every((part) => part.data === '');
  return parts.length === 1 && isFalsy(parts[0].expression, falsy, inits);
}

/**
 * Whether a drawn tag keeps the child's prop `key` falsy, given the props of its own file that are:
 * it states no spread but `ownRest`, binds nothing to it, and passes a falsy value or none at all
 * beside a falsy default.
 */
function keepsFalsy(node, key, defaultFalsy, { falsy, inits, ownRest }) {
  const spread = node.attributes.some(
    ({ type, expression }) =>
      type === 'SpreadAttribute' && (!ownRest || expression?.name !== ownRest)
  );
  if (spread) return false;
  const stated = node.attributes.filter(
    ({ type, name }) => (type === 'Attribute' || type === 'BindDirective') && name === key
  );
  if (stated.length === 0) return defaultFalsy;
  return stated.every(
    (attribute) => attribute.type === 'Attribute' && attributeIsFalsy(attribute, falsy, inits)
  );
}

/** The local a component's `$props()` pattern collects its rest keys under, or `undefined`. */
function restLocalOf(ast) {
  for (const node of walkNodes(ast.instance)) {
    if (node.type !== 'VariableDeclarator' || node.init?.callee?.name !== '$props') continue;
    return node.id.properties.find((property) => property.type === 'RestElement')?.argument.name;
  }
  return undefined;
}

/**
 * The files `entry`'s closure draws from its own, the start offsets each leaves undrawn, and its
 * falsy props by local name, as `{ files, undrawn, falsy }`, at the greatest fixed point.
 */
export function drawnClosure(entry, reader) {
  const files = [...importClosure(entry.path, reader)].filter((file) => isComponent(file));
  const parsed = new Map(
    files.map((file) => {
      const ast = reader.component(file);
      return [
        file,
        { ast, props: declaredProps(ast), written: writtenLocals(ast), inits: constInits(ast) },
      ];
    })
  );
  const falsy = new Map(
    files.map((file) => {
      const { props, written } = parsed.get(file);
      const own = file === entry.path;
      const kept = props.filter(
        ({ key, local, falsy: byDefault }) =>
          !written.has(local) && (!own || (byDefault && !Object.hasOwn(entry.props, key)))
      );
      return [file, new Set(kept.map(({ local }) => local))];
    })
  );
  for (;;) {
    const { drawn, undrawn, tags } = drawnFrom(entry.path, parsed, falsy);
    let changed = false;
    for (const { parent, child, node } of tags) {
      const context = {
        falsy: falsy.get(parent),
        inits: parsed.get(parent).inits,
        ownRest: parent === entry.path && restLocalOf(parsed.get(parent).ast),
      };
      for (const { key, local, falsy: byDefault } of parsed.get(child)?.props ?? []) {
        if (!falsy.get(child).has(local) || keepsFalsy(node, key, byDefault, context)) continue;
        falsy.get(child).delete(local);
        changed = true;
      }
    }
    if (!changed) return { files: drawn, undrawn, falsy };
  }
}

/** The files drawn from `root` while `falsy` holds, each file's undrawn starts, and every drawn tag. */
function drawnFrom(root, parsed, falsy) {
  const drawn = new Set([root]);
  const undrawn = new Map();
  const tags = [];
  const queue = [root];
  while (queue.length > 0) {
    const parent = queue.shift();
    const { ast } = parsed.get(parent);
    const hidden = undrawnStarts(ast, falsy.get(parent));
    undrawn.set(parent, hidden);
    for (const { child, node } of componentTags(parent, ast)) {
      if (hidden.has(node.start) || !parsed.has(child)) continue;
      tags.push({ parent, child, node });
      if (drawn.has(child)) continue;
      drawn.add(child);
      queue.push(child);
    }
  }
  return { drawn, undrawn, tags };
}

/** Whether `entry`'s drawn closure draws `node` of `file`. */
export const drawsNode = ({ files, undrawn }, file, node) =>
  files.has(file) && !undrawn.get(file)?.has(node.start);
