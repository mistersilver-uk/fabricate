/**
 * What a published entry's closure draws (issue 2454): the props of each closure file that are
 * falsy whatever the companion passes, the template nodes an `{#if}` on such a prop leaves undrawn,
 * and the component files a drawn tag, or a drawn file's other use of a component, reaches.
 * Limit: an entry file's prop is falsy when it is unpublished, never written and its default is a
 * falsy literal; another file's when every drawn tag passes it a falsy literal or a falsy prop of
 * that tag's file, or omits it beside a falsy literal default, with no spread but the entry's rest,
 * no child content it could be and no snippet of its name; a name the template binds is never one.
 * Limit: a test is falsy only as a falsy prop, a plain `const` or `$derived` of a falsy expression,
 * `Boolean()` of one, an `&&` with a falsy side, an `||` of falsy sides, its `.length`, or an
 * optional read off one of a member no primitive holds; a snippet's content counts as drawn
 * wherever the snippet is declared drawn. A component drawn other than by a tag has no falsy prop.
 */
import { posix } from 'node:path';

import {
  identifierNames,
  importedModules,
  lazilyImportedModules,
  walkNodes,
  walkWithAncestors,
} from './moduleAst.js';
import {
  componentTags,
  importClosure,
  isComponent,
  propLocals,
  referencedNames,
  relativeImports,
  restLocal,
  templateBindings,
} from './publishedComponentGate.js';

const FALSY_LITERALS = new Set([false, null, 0, '']);
const DRAWN_TYPES = new Set(['RegularElement', 'SvelteElement', 'Component']);

/**
 * The members a falsy primitive reads as other than `undefined`, its prototype's and `Object`'s,
 * read from the running Node, so a member newer than it reads as absent.
 */
const PRIMITIVE_MEMBERS = new Set(
  [String, Number, Boolean, Object].flatMap(({ prototype }) =>
    Object.getOwnPropertyNames(prototype)
  )
);

const isFalsyLiteral = (node) =>
  (node?.type === 'Literal' && FALSY_LITERALS.has(node.value)) ||
  (node?.type === 'Identifier' && node.name === 'undefined');

/** Whether a `$props()` local's default, as `propLocals` reads it, is absent or a falsy literal. */
const falsyByDefault = ({ fallback }) => !fallback || isFalsyLiteral(fallback);

/** The node each write names its target by, by the write's node type. */
const WRITE_TARGETS = Object.freeze({
  AssignmentExpression: 'left',
  ForInStatement: 'left',
  ForOfStatement: 'left',
  UpdateExpression: 'argument',
  BindDirective: 'expression',
});

/** Every local a component assigns, updates or binds, a destructuring pattern's included. */
function writtenLocals(ast) {
  const written = new Set();
  for (const root of [ast.module, ast.instance, ast.fragment]) {
    for (const node of walkNodes(root)) {
      const target = Object.hasOwn(WRITE_TARGETS, node.type) && node[WRITE_TARGETS[node.type]];
      if (!target || target.type === 'MemberExpression') continue;
      for (const name of identifierNames(target)) written.add(name);
    }
  }
  return written;
}

/**
 * Each top-level `const` of the instance script by name, a `$derived` read through to its
 * expression, but a name the template binds, which a block can shadow.
 */
function constInits(ast, bound) {
  const inits = new Map();
  for (const statement of ast.instance?.content.body ?? []) {
    if (statement.type !== 'VariableDeclaration' || statement.kind !== 'const') continue;
    for (const { id, init } of statement.declarations) {
      if (id.type !== 'Identifier' || !init || bound.has(id.name)) continue;
      inits.set(id.name, init.callee?.name === '$derived' ? init.arguments[0] : init);
    }
  }
  return inits;
}

/** Whether a member read off a falsy value is falsy: its `.length`, or an optional read of a member no primitive holds. */
function isFalsyMember({ computed, optional, property }) {
  const name = !computed && property.type === 'Identifier' ? property.name : null;
  return name === 'length' || (optional && name !== null && !PRIMITIVE_MEMBERS.has(name));
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
      return isFalsyMember(expression) && again(expression.object);
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
function undrawnStarts({ ast, inits }, falsy) {
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

/** Whether one attribute's value is falsy: a bare attribute is `true`, and text is falsy only empty. */
function attributeIsFalsy({ value }, falsy, inits) {
  if (value === true) return false;
  const parts = [value].flat();
  if (parts.every((part) => part.type === 'Text')) return parts.every((part) => part.data === '');
  return parts.length === 1 && isFalsy(parts[0].expression, falsy, inits);
}

/** Whether a tag's content hands the child `key`: a snippet of that name, or any other content as `children`. */
function contentPasses(node, key) {
  const content = node.fragment?.nodes ?? [];
  const asSnippet = content.some(
    (child) => child.type === 'SnippetBlock' && child.expression.name === key
  );
  const asChildren =
    key === 'children' &&
    content.some(
      (child) => child.type !== 'SnippetBlock' && !(child.type === 'Text' && !child.data.trim())
    );
  return asSnippet || asChildren;
}

/**
 * Whether a drawn tag keeps the child's prop `key` falsy, given the props of its own file that are:
 * it states no spread but `ownRest`, binds nothing to it, hands it no content, and passes a falsy
 * value or none at all beside a falsy default.
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
  if (contentPasses(node, key)) return false;
  if (stated.length === 0) return defaultFalsy;
  return stated.every(
    (attribute) => attribute.type === 'Attribute' && attributeIsFalsy(attribute, falsy, inits)
  );
}

/** The head of each dotted tag, `Ns` of `<Ns.default />`, which reads the import it names. */
function dottedTagHeads(fragment) {
  const heads = [...walkNodes(fragment)]
    .filter((node) => node.type === 'Component')
    .map(({ name }) => [name, name.split('.', 1)[0]]);
  return heads.filter(([name, head]) => head !== name).map(([, head]) => head);
}

/** Every name a component reads but as a plain tag's name, its import specifiers aside. */
function namesReadUntagged(ast) {
  const scripts = [ast.module, ast.instance].flatMap((script) => script?.content?.body ?? []);
  const read = scripts.filter((statement) => statement.type !== 'ImportDeclaration');
  const names = [...read, ast.fragment].flatMap((node) => [...referencedNames(node)]);
  return new Set([...names, ...dottedTagHeads(ast.fragment)]);
}

/**
 * The closure components drawn other than by a tag, as `{ always, byParent }`: each one a `.js`
 * closure file imports, re-exports or loads, and, by the component that draws them, each one a
 * component loads by `import()`, re-exports, or names by its import local other than as a tag.
 */
function untaggedDraws(closure, reader) {
  const components = new Set(closure.filter((file) => isComponent(file)));
  const always = new Set();
  const byParent = new Map();
  for (const file of closure) {
    const own = isComponent(file);
    const ast = own ? reader.component(file) : reader.module(file).ast;
    const label = (declaration) =>
      own && declaration.type === 'ImportDeclaration' ? null : declaration.source.value;
    const loaded = [...importedModules(ast, label), ...lazilyImportedModules(ast)]
      .filter((specifier) => specifier?.startsWith('.'))
      .map((specifier) => posix.join(posix.dirname(file), specifier));
    const reached = new Set(loaded.filter((path) => components.has(path)));
    if (!own) {
      for (const path of reached) always.add(path);
      continue;
    }
    const read = namesReadUntagged(ast);
    for (const [local, path] of relativeImports(file, ast)) {
      if (components.has(path) && read.has(local)) reached.add(path);
    }
    byParent.set(file, reached);
  }
  return { always, byParent };
}

/**
 * The files `entry`'s closure draws from its own, the start offsets each leaves undrawn, its falsy
 * props by local name and each file's `const` inits, as `{ files, undrawn, falsy, inits }`, at the
 * greatest fixed point.
 */
export function drawnClosure(entry, reader) {
  const closure = [...importClosure(entry.path, reader)];
  const untagged = untaggedDraws(closure, reader);
  const parsed = new Map(
    closure
      .filter((file) => isComponent(file))
      .map((file) => {
        const ast = reader.component(file);
        const bound = templateBindings(ast);
        const props = propLocals(ast).filter(({ local }) => !bound.has(local));
        return [file, { ast, props, written: writtenLocals(ast), inits: constInits(ast, bound) }];
      })
  );
  const falsy = new Map(
    [...parsed].map(([file, { props, written }]) => {
      const own = file === entry.path;
      const kept = props.filter(
        (prop) =>
          !written.has(prop.local) &&
          (!own || (falsyByDefault(prop) && !Object.hasOwn(entry.props, prop.key)))
      );
      return [file, new Set(kept.map(({ local }) => local))];
    })
  );
  for (;;) {
    const { drawn, undrawn, tags, loose } = drawnFrom(entry.path, parsed, falsy, untagged);
    const changed = [
      ...[...loose].map((child) => clearFalsy(falsy.get(child))),
      ...tags.map((tag) => narrowFalsy(tag, parsed, falsy, entry.path)),
    ];
    if (!changed.includes(true)) {
      const inits = new Map([...parsed].map(([file, parts]) => [file, parts.inits]));
      return { files: drawn, undrawn, falsy, inits };
    }
  }
}

/** Empties one file's falsy set, answering whether it held any. */
function clearFalsy(held) {
  const had = held.size > 0;
  held.clear();
  return had;
}

/** Drops from the child's falsy set each prop one drawn tag does not keep falsy, answering whether any went. */
function narrowFalsy({ parent, child, node }, parsed, falsy, root) {
  const context = {
    falsy: falsy.get(parent),
    inits: parsed.get(parent).inits,
    ownRest: parent === root && restLocal(parsed.get(parent).ast),
  };
  let changed = false;
  for (const prop of parsed.get(child).props) {
    const held = falsy.get(child);
    if (!held.has(prop.local) || keepsFalsy(node, prop.key, falsyByDefault(prop), context))
      continue;
    held.delete(prop.local);
    changed = true;
  }
  return changed;
}

/**
 * The files drawn from `root` while `falsy` holds, each file's undrawn starts, every drawn tag, and
 * the components drawn other than by a tag (`loose`).
 */
function drawnFrom(root, parsed, falsy, { always, byParent }) {
  const loose = new Set([...always].filter((file) => parsed.has(file)));
  const drawn = new Set([root, ...loose]);
  const undrawn = new Map();
  const tags = [];
  const queue = [...drawn];
  while (queue.length > 0) {
    const parent = queue.shift();
    const hidden = undrawnStarts(parsed.get(parent), falsy.get(parent));
    undrawn.set(parent, hidden);
    const reached = [...(byParent.get(parent) ?? [])];
    for (const [child, node] of componentTags(parent, parsed.get(parent).ast)) {
      if (hidden.has(node.start) || !parsed.has(child)) continue;
      tags.push({ parent, child, node });
      reached.push(child);
    }
    for (const child of reached) {
      if (drawn.has(child)) continue;
      drawn.add(child);
      queue.push(child);
    }
  }
  for (const child of [...drawn].flatMap((file) => [...(byParent.get(file) ?? [])])) {
    loose.add(child);
  }
  return { drawn, undrawn, tags, loose };
}

/** Whether `entry`'s drawn closure draws `node` of `file`. */
export const drawsNode = ({ files, undrawn }, file, node) =>
  files.has(file) && !undrawn.get(file)?.has(node.start);

/** Whether `expression` of `file` is falsy whatever the companion passes, by `entry`'s drawn closure. */
export const heldFalsy = ({ falsy, inits }, file, expression) =>
  isFalsy(expression, falsy.get(file) ?? new Set(), inits.get(file) ?? new Map());
