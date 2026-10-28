/**
 * What the published component gates share (issue 2452): the three parses a gate reads of a file,
 * an entry's import closure, a component's declared props, the pinned tags of each
 * `svelte:element`, admission rule 9's scan of one component with each element's hook and guards,
 * every stylesheet a published root's selectors are read from, and the ancestor and Foundry
 * dependencies of a closure. `tests/published-component-manifest.test.js`,
 * `tests/published-component-controls.test.js` and `tests/segmented-control-closure.test.js` import
 * them.
 */
import assert from 'node:assert/strict';
import { posix, resolve } from 'node:path';

import { stylesheetSources } from '../../scripts/lib/stylesheetSource.js';

import { templateOf } from './apiConvention.js';
import { unguardedFontPrimaryReads } from './fontPrimaryReads.js';
import {
  identifierNames,
  importedModules,
  lazilyImportedModules,
  literalStrings,
  parseModule,
  walkNodes,
  walkWithAncestors,
} from './moduleAst.js';
import { componentAstOf, componentScopeOf, moduleAstOf } from './parsedSource.js';
import { readScannedDirectory, repoRoot } from './sourceScan.js';
import { parseComponentScope, readsGlobal } from './svelteStructureContract.js';

export const byName = (a, b) => a.localeCompare(b);

/** The three parses the gate reads of a file: a component, its scopes, and a plain module. */
export const SHIPPED = Object.freeze({
  component: componentAstOf,
  componentScope: componentScopeOf,
  module: moduleAstOf,
});

/** The same three parses over `sources`, a map of path to text. */
export function syntheticReader(sources) {
  return {
    component: (file) => templateOf(file, sources[file]).ast,
    componentScope: (file) => parseComponentScope(sources[file]),
    module: (file) => parseModule(sources[file]),
  };
}

export const isComponent = (file) => file.endsWith('.svelte');

/**
 * The file at `path` and every relative `.svelte` or `.js` file it reaches by `import`,
 * `export … from`, `export * from` or a literal `import()`, so a re-export-only barrel is walked.
 */
export function importClosure(path, reader, seen = new Set()) {
  if (seen.has(path)) return seen;
  seen.add(path);
  const ast = isComponent(path) ? reader.component(path) : reader.module(path).ast;
  for (const specifier of [...importedModules(ast), ...lazilyImportedModules(ast)]) {
    if (!specifier.startsWith('.') || !/\.(?:svelte|js)$/.test(specifier)) continue;
    importClosure(posix.join(posix.dirname(path), specifier), reader, seen);
  }
  return seen;
}

/**
 * Each `$props()` key with its local name, whether it is `$bindable`, and its default as
 * `fallback`: the node it is assigned, `$bindable`'s argument, or `undefined`.
 */
export function propLocals(ast) {
  for (const node of walkNodes(ast.instance)) {
    if (node.type !== 'VariableDeclarator' || node.init?.callee?.name !== '$props') continue;
    return node.id.properties
      .filter((property) => property.type === 'Property')
      .map((property) => {
        const value = property.value;
        const defaulted = value.type === 'AssignmentPattern';
        const local = defaulted ? value.left.name : value.name;
        const bindable = defaulted && value.right.callee?.name === '$bindable';
        const stated = defaulted ? value.right : undefined;
        const fallback = bindable ? stated.arguments[0] : stated;
        return { key: property.key.name ?? property.key.value, local, bindable, fallback };
      });
  }
  return [];
}

/** Whether an identifier under `parent` is read as a name: no member name after a dot, and no object key. */
export function isNameRead(node, parent) {
  const isMemberName =
    parent?.type === 'MemberExpression' && parent.property === node && !parent.computed;
  const isObjectKey = parent?.type === 'Property' && parent.key === node && !parent.computed;
  return !isMemberName && !isObjectKey;
}

/** Every name an expression reads: no member name after a dot, and no object key. */
export function referencedNames(expression) {
  const names = new Set();
  walkWithAncestors(expression, (node, ancestors) => {
    if (node.type === 'Identifier' && isNameRead(node, ancestors.at(-1))) names.add(node.name);
  });
  return names;
}

/** An entry's published keys by the local name its component declares each under. */
export function publishedLocals(entry, ast) {
  return new Map(
    propLocals(ast)
      .filter(({ key }) => Object.hasOwn(entry.props, key))
      .map(({ key, local }) => [local, key])
  );
}

const FOCUSABLE_TAGS = new Set(['button', 'a']);
const FORM_CONTROLS = new Set(['button', 'input', 'select', 'textarea']);

/** Whether an element of this tag is focusable or a form control whatever else it states. */
export const isControlTag = (tag) => FOCUSABLE_TAGS.has(tag) || FORM_CONTROLS.has(tag);

export const attributeOf = (element, name) =>
  element.attributes.find((attribute) => attribute.type === 'Attribute' && attribute.name === name);

/** An attribute's text when it is static, `''` when bare, else `undefined`. */
export function staticText(attribute) {
  if (!attribute) return undefined;
  if (attribute.value === true) return '';
  const parts = [attribute.value].flat();
  if (parts.some((part) => part.type !== 'Text')) return undefined;
  return parts.map((part) => part.data).join('');
}

const HOOK = /^data-(?!keyboard-focus$)/;

/** An element's first static `data-*` hook other than `data-keyboard-focus`, as `[name]`, or `''`. */
function hookOf(node) {
  const hook = node.attributes.find(
    (attribute) =>
      attribute.type === 'Attribute' &&
      HOOK.test(attribute.name) &&
      staticText(attribute) !== undefined
  );
  return hook ? `[${hook.name}]` : '';
}

const GUARD_OF = Object.freeze({ IfBlock: 'test', EachBlock: 'expression' });

/**
 * Every name read by the test of an `{#if}`, consequent or alternate, and by the expression of an
 * `{#each}`, among a node's ancestors.
 */
function guardNames(ancestors) {
  const names = new Set();
  for (const block of ancestors) {
    const guard = block[GUARD_OF[block.type]];
    if (guard) for (const name of referencedNames(guard)) names.add(name);
  }
  return names;
}

/**
 * Each `svelte:element` a shipped closure or the probe draws, by `<file>: svelte:element<hook>`:
 * the `tags` it can draw through the seam and the published `keys` its tag follows. A keyed pin
 * names in `heldBy` the mounted clause that passes the key a value outside `tags` and reads a
 * pinned tag back; `open` marks a tag a published key drives unfiltered, which only the test probe
 * may be.
 */
export const DYNAMIC_ELEMENTS = Object.freeze({
  // `tag` and `href`, which could draw an `<a>`, are not published.
  'src/ui/svelte/components/Button.svelte: svelte:element': { tags: ['button'], keys: [] },
  // The note draws a `div` while it holds a title, an item or the actions slot, else a `p`.
  'src/ui/svelte/components/Callout.svelte: svelte:element': {
    tags: ['div', 'p'],
    keys: ['actions', 'items', 'title'],
    heldBy: "tests/components/published-callout-mounted.test.js: Callout's host element",
  },
  'src/ui/svelte/components/Chip.svelte: svelte:element': { tags: ['span'], keys: [] },
  // An `as` outside the three hosts draws a `div`, and no host is focusable; `SearchField` passes
  // the literal `as="label"`, and `field-source-contract` requires a literal `as` on every `<Field>`.
  'src/ui/svelte/components/Field.svelte: svelte:element': {
    tags: ['div', 'fieldset', 'label'],
    keys: ['as'],
    heldBy: "tests/components/published-field-mounted.test.js: Field's host element",
  },
  'src/ui/svelte/components/Kicker.svelte: svelte:element': {
    tags: ['h3', 'p', 'span'],
    keys: ['as'],
    heldBy: "tests/components/published-leaves-mounted.test.js: Kicker's host element",
  },
  // `onSubmit`, which draws a `<form>`, is not published.
  'src/ui/svelte/components/Modal.svelte: svelte:element': { tags: ['div'], keys: [] },
  'tests/fixtures/published-components/PublishedProbe.svelte: svelte:element': {
    tags: ['div'],
    keys: ['bodyAs'],
    open: true,
  },
});

/** Every `svelte:element` one parsed file draws, as `{ id, node }`. */
export function dynamicElements(file, ast) {
  return [...walkNodes(ast.fragment)]
    .filter((node) => node.type === 'SvelteElement')
    .map((node) => ({ id: `${file}: ${node.name}${hookOf(node)}`, node }));
}

const isCallTo = (node, name) => node?.type === 'CallExpression' && node.callee?.name === name;

/** What a tag that reads one declarator's names is followed into: a plain `const`'s initialiser, else `null`. */
function followedInto(statement, declarator) {
  const plain = statement.kind === 'const' && declarator.id.type === 'Identifier';
  return plain && !isCallTo(declarator.init, '$state') ? declarator.init : null;
}

/**
 * Each name a component's scripts declare at their top level, beside what a tag that reads it is
 * followed into: a `const`'s initialiser or a function, and `null` for a name the gate cannot
 * follow (a `let`, a `$state`, an import, a class, a destructured name, the rest local).
 */
function scriptDeclarations(ast) {
  const declared = new Map();
  const statements = [ast.module, ast.instance]
    .flatMap((script) => script?.content?.body ?? [])
    .map((statement) => statement.declaration ?? statement);
  for (const statement of statements) {
    if (statement.type === 'FunctionDeclaration') declared.set(statement.id.name, statement);
    if (statement.type === 'ClassDeclaration') declared.set(statement.id.name, null);
    for (const specifier of statement.specifiers ?? []) declared.set(specifier.local.name, null);
    for (const declarator of statement.declarations ?? []) {
      const props = isCallTo(declarator.init, '$props');
      const bound = props
        ? declarator.id.properties.filter((property) => property.type === 'RestElement')
        : [declarator.id];
      for (const name of bound.flatMap((pattern) => [...identifierNames(pattern)])) {
        declared.set(name, followedInto(statement, declarator));
      }
    }
  }
  return declared;
}

/** What each template node that binds names binds: a pattern, or a name as a string. */
const TEMPLATE_BINDERS = Object.freeze({
  EachBlock: (node) => [node.context, node.index],
  ConstTag: (node) => node.declaration.declarations.map(({ id }) => id),
  SnippetBlock: (node) => [node.expression, ...node.parameters],
  AwaitBlock: (node) => [node.value, node.error],
  LetDirective: (node) => [node.name],
});

/** Every name a template block of one component binds, wherever in the template. */
export function templateBindings(ast) {
  const bound = new Set();
  for (const node of walkNodes(ast.fragment)) {
    for (const binder of TEMPLATE_BINDERS[node.type]?.(node) ?? []) {
      const names = typeof binder === 'string' ? [binder] : identifierNames(binder);
      for (const name of names) bound.add(name);
    }
  }
  return bound;
}

/**
 * What `names` read, to a fixed point, as `{ keys, props, faults }`: the published keys, and every
 * prop by its key. A `const` is followed into its initialiser, `$derived` and `$derived.by`
 * included, and a function into its body. `published` is the entry's keys by local name. A name
 * declared any other way, or bound by a template block anywhere in the file, is the fault
 * `reads <name>, which the gate cannot follow`; any other is a global.
 */
export function followedProps(ast, names, published) {
  const locals = new Map(propLocals(ast).map(({ key, local }) => [local, key]));
  const declared = scriptDeclarations(ast);
  const bound = templateBindings(ast);
  const keys = new Set();
  const props = new Set();
  const faults = [];
  const seen = new Set();
  const queue = [...names];
  while (queue.length > 0) {
    const name = queue.pop();
    if (seen.has(name)) continue;
    seen.add(name);
    if (bound.has(name) || declared.get(name) === null) {
      faults.push(`reads ${name}, which the gate cannot follow`);
    } else if (locals.has(name)) {
      props.add(locals.get(name));
      if (published.has(name)) keys.add(published.get(name));
    } else if (declared.has(name)) {
      queue.push(...referencedNames(declared.get(name)));
    }
  }
  return { keys: [...keys].sort(byName), props: [...props].sort(byName), faults };
}

/** What a `svelte:element`'s `this` expression reads, as `followedProps` answers it for the tag. */
export function tagKeys(ast, node, published) {
  const { keys, props, faults } = followedProps(ast, referencedNames(node.tag), published);
  return { keys, props, faults: faults.map((fault) => `tag ${fault}`) };
}

/** The local a member chain starts from, or `null` where it starts anywhere else. */
function chainRoot(expression) {
  let node = expression;
  while (node.type === 'ChainExpression' || node.type === 'MemberExpression') {
    node = node.type === 'ChainExpression' ? node.expression : node.object;
  }
  return node.type === 'Identifier' ? node.name : null;
}

/**
 * Where a name expression's value can come from, as `{ locals, literal, unfollowed }`: the prop
 * locals it reaches, whether a string or template literal reaches it, and whether a value comes
 * from anything else. It walks value operands only (`SPREAD_OPERANDS`), a `const` into its
 * initialiser, `$derived(…)` into its argument, and a member chain to its root; `undefined` and
 * `null` add nothing. A `let`, `$state`, import, function, call or template binding is unfollowed.
 */
export function nameSources(ast, expression) {
  const props = new Set(propLocals(ast).map(({ local }) => local));
  const declared = scriptDeclarations(ast);
  const bound = templateBindings(ast);
  const found = { locals: new Set(), literal: false, unfollowed: false };
  const seen = new Set();
  // `undefined` is read before the declarations, which also hold each name a pattern's default reads.
  const readName = (name) => {
    if (seen.has(name) || name === 'undefined') return;
    seen.add(name);
    const init = declared.get(name);
    if (bound.has(name) || init === null || init?.type === 'FunctionDeclaration') {
      found.unfollowed = true;
    } else if (props.has(name)) found.locals.add(name);
    else if (init) visit(init);
    else found.unfollowed = true;
  };
  const readRoot = (node) => {
    const root = chainRoot(node);
    if (root && props.has(root) && !bound.has(root)) found.locals.add(root);
    else found.unfollowed = true;
  };
  const visit = (node) => {
    const operands = SPREAD_OPERANDS[node.type]?.(node);
    if (operands) {
      for (const operand of operands) visit(operand);
      return;
    }
    switch (node.type) {
      case 'Literal': {
        found.literal ||= node.value !== null;
        break;
      }
      case 'TemplateLiteral': {
        found.literal = true;
        break;
      }
      case 'Identifier': {
        readName(node.name);
        break;
      }
      case 'MemberExpression':
      case 'ChainExpression': {
        readRoot(node);
        break;
      }
      default: {
        if (isCallTo(node, '$derived')) visit(node.arguments[0]);
        else found.unfollowed = true;
      }
    }
  };
  visit(expression);
  return {
    locals: [...found.locals].sort(byName),
    literal: found.literal,
    unfollowed: found.unfollowed,
  };
}

/** Whether a `$props()` local's default is absent or a falsy literal, so an `{#if}` on it alone is false. */
function falsyDefault(ast, local) {
  const declarator = [...walkNodes(ast.instance)].find(
    (node) => node.type === 'VariableDeclarator' && isCallTo(node.init, '$props')
  );
  const property = declarator?.id.properties?.find(({ value }) =>
    value?.type === 'AssignmentPattern' ? value.left.name === local : value?.name === local
  );
  if (!property) return false;
  const fallback = property.value.type === 'AssignmentPattern' ? property.value.right : null;
  if (!fallback) return true;
  if (fallback.type === 'Identifier') return fallback.name === 'undefined';
  return fallback.type === 'Literal' && !fallback.value;
}

/** The fragments a template node draws its children in; a snippet definition draws none where it sits. */
const CHILD_FRAGMENTS = Object.freeze({
  EachBlock: ({ body, fallback }) => [body, fallback],
  AwaitBlock: ({ pending, then, catch: caught }) => [pending, then, caught],
  SnippetBlock: () => [],
});

/** A child component may draw text whatever its slot holds, so `drawsOwnText` fails closed on it. */
const TEXT_COMPONENTS = new Set(['Component', 'SvelteComponent', 'SvelteSelf']);

/**
 * Whether a control draws text of its own: a non-blank text node, an expression, an `{@html}`, a
 * child component, or a render tag of anything but a snippet its file defines, which is followed
 * into. An `{#if}` whose test is a prop local the entry does not publish (`published`, by local)
 * held at a falsy default draws only its alternate. Anything else that holds children is read
 * through them.
 */
export function drawsOwnText(ast, node, published) {
  const snippets = new Map(
    [...walkNodes(ast.fragment)]
      .filter((block) => block.type === 'SnippetBlock')
      .map((block) => [block.expression.name, block])
  );
  const props = new Set(propLocals(ast).map(({ local }) => local));
  const heldOff = ({ test }) =>
    test.type === 'Identifier' &&
    props.has(test.name) &&
    !published.has(test.name) &&
    falsyDefault(ast, test.name);
  const followed = new Set();
  const inFragments = (fragments) =>
    fragments.some((fragment) => fragment?.nodes.some((child) => drawsText(child)));
  const drawsText = (child) => {
    if (child.type === 'Text') return child.data.trim() !== '';
    if (child.type === 'Comment' || child.type === 'ConstTag') return false;
    if (TEXT_COMPONENTS.has(child.type)) return true;
    if (child.type === 'IfBlock') {
      return inFragments([heldOff(child) ? null : child.consequent, child.alternate]);
    }
    if (child.type === 'RenderTag') {
      const snippet = snippets.get(chainRoot(renderCallee(child)));
      if (!snippet) return true;
      if (followed.has(snippet)) return false;
      followed.add(snippet);
      return inFragments([snippet.body]);
    }
    const fragments = CHILD_FRAGMENTS[child.type]?.(child) ?? [child.fragment];
    const held = fragments.some((fragment) => fragment !== undefined && fragment !== null);
    return held ? inFragments(fragments) : !CHILD_FRAGMENTS[child.type];
  };
  return inFragments([node.fragment]);
}

/** The callee of a render tag's call, `?.()` or not. */
const renderCallee = (tag) =>
  (tag.expression.type === 'ChainExpression' ? tag.expression.expression : tag.expression).callee;

/** What one pin breaks against the element it names, in a file that spells `spelled`. */
function pinFaults(id, pin, read, spelled) {
  const faults = [
    ...pin.tags
      .filter((tag) => !spelled.has(tag))
      .map((tag) => `${id} pins <${tag}>, which its file does not spell`),
    ...read.faults.map((fault) => `${id} ${fault}`),
  ];
  if (pin.keys.join(',') !== read.keys.join(',')) {
    faults.push(`${id} pins the keys [${pin.keys}], and its tag follows [${read.keys}]`);
  }
  if (pin.keys.length > 0 && !pin.open && !pin.heldBy) {
    faults.push(`${id} follows a published key and names no mounted clause in heldBy`);
  }
  if (pin.open && id.startsWith('src/')) faults.push(`${id} is open in a shipped file`);
  return faults;
}

/** Each local one parsed file imports from a relative specifier, by the path it resolves to. */
export function relativeImports(file, ast) {
  const imported = new Map();
  const statements = [ast.module, ast.instance].flatMap((script) => script?.content?.body ?? []);
  for (const statement of statements) {
    if (statement.type !== 'ImportDeclaration' || !statement.source.value.startsWith('.')) continue;
    const path = posix.join(posix.dirname(file), statement.source.value);
    for (const specifier of statement.specifiers) imported.set(specifier.local.name, path);
  }
  return imported;
}

/** Each component tag one parsed file draws from a relative import, as `[path, node]`. */
export function componentTags(file, ast) {
  const imported = relativeImports(file, ast);
  return [...walkNodes(ast.fragment)]
    .filter((node) => node.type === 'Component' && imported.has(node.name))
    .map((node) => [imported.get(node.name), node]);
}

/**
 * What one file breaks by drawing a child whose pinned tags rest on a prop's default, `defaulted`
 * naming those props and the pinned tags by the child's path: it states one of them on the child's
 * tag, other than as a literal naming a pinned tag, or a spread. An entry's own file (`entryFile`)
 * may spread its rest local, which holds `data-*` keys alone (M13). A tag `drawn` answers no
 * published closure draws is not judged (issue 2454).
 */
function passedFaults(file, ast, defaulted, entryFile, drawn) {
  const rest = entryFile ? restLocal(ast) : null;
  const tags = componentTags(file, ast).filter(([, node]) => drawn(file, node));
  return tags.flatMap(([child, node]) => {
    const { keys = [], tags = [] } = defaulted.get(child) ?? {};
    if (keys.length === 0) return [];
    const literalTag = (value) => tags.includes(staticText({ value }));
    const passes = ({ type, name, value, expression }) =>
      type === 'SpreadAttribute'
        ? !rest || expression?.name !== rest
        : keys.includes(name) && !(type === 'Attribute' && literalTag(value));
    return node.attributes
      .filter((attribute) => passes(attribute))
      .map(
        ({ name = 'a spread' }) =>
          `${file} passes ${name} to ${child}, whose pinned tags rest on its default`
      );
  });
}

/**
 * What the pins of `dynamic` break against the `svelte:element`s `files` draw, each file as
 * `{ file, ast, published }`: every drawn element is pinned and no two share an id, every pin is
 * drawn, each pinned tag is a string literal its file spells, a pin's `keys` are what `tagKeys`
 * reads, a keyed pin that is not `open` states `heldBy`, no file under `src/` is `open`, and no
 * file passes a child a prop its tag reads and its pin does not follow, but as a pinned tag's literal,
 * from a tag `drawnTag(file, node)` answers a published closure draws.
 */
export function dynamicElementFaults(files, dynamic = DYNAMIC_ELEMENTS, drawnTag = () => true) {
  const faults = [];
  const drawn = new Set();
  const defaulted = new Map();
  for (const { file, ast, published } of files) {
    const scripts = [ast.module, ast.instance, ast.fragment];
    const spelled = new Set(scripts.flatMap((part) => literalStrings(part)));
    for (const { id, node } of dynamicElements(file, ast)) {
      if (drawn.has(id)) faults.push(`${id} is drawn twice, so one pin would name two elements`);
      drawn.add(id);
      if (!Object.hasOwn(dynamic, id)) {
        faults.push(`${id} has no pin`);
        continue;
      }
      const read = tagKeys(ast, node, published);
      faults.push(...pinFaults(id, dynamic[id], read, spelled));
      const unfollowed = read.props.filter((key) => !dynamic[id].keys.includes(key));
      const { keys = [], tags = [] } = defaulted.get(file) ?? {};
      defaulted.set(file, { keys: [...keys, ...unfollowed], tags: [...tags, ...dynamic[id].tags] });
    }
  }
  const passed = files.flatMap(({ file, ast, published }) =>
    passedFaults(file, ast, defaulted, published.size > 0, drawnTag)
  );
  const undrawn = Object.keys(dynamic).filter((id) => !drawn.has(id));
  return [...faults, ...passed, ...undrawn.map((id) => `${id} is pinned and no file draws it`)];
}

/** What rule 9 judges one element as: its tags, and whether any is focusable or a form control. */
function judgedAs(node, pin) {
  const tags = node.type === 'SvelteElement' ? pin?.tags : [node.name];
  if (!tags) return null;
  const focusable =
    tags.some((tag) => FOCUSABLE_TAGS.has(tag)) || Boolean(attributeOf(node, 'tabindex'));
  return { tags, focusable, control: tags.some((tag) => FORM_CONTROLS.has(tag)) };
}

/**
 * Judged elements whose ids collide each take their static `type` as a suffix,
 * `<id>[type="<type>"]`; a collision a static `type` cannot resolve is the fault
 * `<id> names more than one element`.
 */
function distinctIds(elements) {
  const shared = Map.groupBy(elements, ({ id }) => id);
  const faults = [];
  for (const [id, group] of shared) {
    const types = group.map(({ node }) => staticText(attributeOf(node, 'type')));
    const resolved = !types.includes(undefined) && new Set(types).size === types.length;
    if (group.length > 1 && !resolved) faults.push(`${id} names more than one element`);
  }
  const typed = elements.map((element) => {
    const type = staticText(attributeOf(element.node, 'type'));
    const suffixed = shared.get(element.id).length > 1 && type !== undefined;
    return suffixed ? { ...element, id: `${element.id}[type="${type}"]` } : element;
  });
  return { elements: typed, faults };
}

/**
 * Whether a form control's `name` is unique to its mount (issue 2601): its value, through a
 * top-level `const` or `$derived` and either branch of a conditional, is a template that reads the
 * component's `$props.id()` local, or `<prop> || <such a value>` where the prop is a local outside
 * `published` whose default is `''`, each such local added to `blank`. `published` is the
 * published locals of the entry whose own file it is, and `null`, which admits no prop, for any
 * other file.
 */
function mountUniqueName(ast, attribute, published, blank = new Set()) {
  const [tag, ...others] = [attribute.value].flat();
  if (tag?.type !== 'ExpressionTag' || others.length > 0) return false;
  const declared = scriptDeclarations(ast);
  const bound = templateBindings(ast);
  const isId = (init) =>
    init?.callee?.type === 'MemberExpression' &&
    init.callee.object.name === '$props' &&
    init.callee.property.name === 'id';
  const ids = new Set([...declared].flatMap(([local, init]) => (isId(init) ? [local] : [])));
  const props = new Map(propLocals(ast).map(({ local, fallback }) => [local, fallback]));
  const unpublishedBlank = (node) =>
    node?.type === 'Identifier' &&
    published !== null &&
    !published.has(node.name) &&
    props.get(node.name)?.value === '';
  const unique = (node, depth = 0) => {
    if (depth > 3) return false;
    if (node?.type === 'TemplateLiteral') {
      return node.expressions.some((part) => part.type === 'Identifier' && ids.has(part.name));
    }
    if (node?.type === 'LogicalExpression') {
      const rests = unpublishedBlank(node.left);
      const left = rests || unique(node.left, depth + 1);
      const admitted = node.operator === '||' && left && unique(node.right, depth + 1);
      if (admitted && rests) blank.add(node.left.name);
      return admitted;
    }
    if (node?.type === 'ConditionalExpression') {
      return unique(node.consequent, depth + 1) && unique(node.alternate, depth + 1);
    }
    if (node?.type !== 'Identifier' || bound.has(node.name) || props.has(node.name)) return false;
    const init = declared.get(node.name);
    return unique(isCallTo(init, '$derived') ? init.arguments[0] : init, depth + 1);
  };
  return unique(tag.expression);
}

/**
 * Admission rule 9 over one closure file: a `button`, `a` or `[tabindex]` element states
 * `data-keyboard-focus="true"`, a `button` states `type="button"`, and no form control states
 * `name` but one `mountUniqueName` admits under `published`. A `svelte:element` is judged once, as
 * the union of its pinned tags, and one with no pin is a fault; its `type` is a mounted suite's.
 * Answers each element it judged beside each fault, both as `<file>: <tag> …`, each judged
 * element as `{ id, node, guards, tags }`, its `id` being `<file>: <tag>[<hook>]`, as
 * `distinctIds` resolves two that share one, and in `blank` the props whose blank default a
 * name it admitted rests on.
 */
export function focusableElements(file, ast, dynamic = DYNAMIC_ELEMENTS, published = null) {
  const judged = [];
  const faults = [];
  const elements = [];
  const blank = new Set();
  walkWithAncestors(ast.fragment, (node, ancestors) => {
    if (node.type !== 'RegularElement' && node.type !== 'SvelteElement') return;
    const id = `${file}: ${node.name}${hookOf(node)}`;
    const as = judgedAs(node, dynamic[id]);
    if (!as) faults.push(`${file}: ${node.name} has no pinned tags`);
    if (!as || (!as.focusable && !as.control)) return;
    const states = (name, value) => staticText(attributeOf(node, name)) === value;
    judged.push(`${file}: ${node.name}`);
    elements.push({ id, node, guards: guardNames(ancestors), tags: as.tags });
    if (as.focusable && !states('data-keyboard-focus', 'true')) {
      faults.push(`${file}: ${node.name} does not state data-keyboard-focus="true"`);
    }
    if (node.name === 'button' && !states('type', 'button')) {
      faults.push(`${file}: button does not state type="button"`);
    }
    const name = attributeOf(node, 'name');
    if (as.control && name && !mountUniqueName(ast, name, published, blank)) {
      faults.push(`${file}: ${node.name} states name`);
    }
  });
  const distinct = distinctIds(elements);
  const keys = new Map(propLocals(ast).map(({ key, local }) => [local, key]));
  return {
    judged,
    faults: [...faults, ...distinct.faults],
    elements: distinct.elements,
    blank: [...blank].map((local) => keys.get(local)),
  };
}

/**
 * What the files of a closure that draw `child` break by passing it `keys`, on which a name the
 * child admits rests at their blank default: a spread onto the child's tag, or one of `keys` at a
 * value `mountUniqueName` does not admit in the drawing file, judged under `publishedOf(file)`.
 */
function blankNameFaults(child, keys, files, reader, publishedOf) {
  return files.flatMap((file) => {
    const ast = reader.component(file);
    const tags = componentTags(file, ast).filter(([path]) => path === child);
    return tags.flatMap(([, tag]) =>
      tag.attributes.flatMap((attribute) => {
        if (attribute.type === 'SpreadAttribute') {
          return [`${file} spreads onto ${child}, whose form control's name rests on [${keys}]`];
        }
        if (!keys.includes(attribute.name)) return [];
        return mountUniqueName(ast, attribute, publishedOf(file, ast))
          ? []
          : [`${file} passes ${attribute.name} to ${child} at a value not unique to the mount`];
      })
    );
  });
}

/**
 * Admission rule 9 over the component files of `path`'s closure (issue 2646): the root is judged
 * under `rootPublished`, a file that is another published entry's own path under that entry's
 * published locals, and any other file under none. Where a published child's form control is named
 * through a prop's blank default, each closure file drawing the child passes that prop only as
 * `blankNameFaults` admits. Answers every element judged, and every fault.
 */
export function closureFocusables(
  path,
  reader,
  { manifest = [], rootPublished = null, dynamic } = {}
) {
  const files = [...importClosure(path, reader)].filter(isComponent);
  const publishedOf = (file, ast) => {
    if (file === path) return rootPublished;
    const owner = manifest.find((entry) => entry.path === file);
    return owner ? new Set(publishedLocals(owner, ast).keys()) : null;
  };
  const scans = files.map((file) => {
    const ast = reader.component(file);
    const scan = focusableElements(file, ast, dynamic, publishedOf(file, ast));
    const nested = file !== path && scan.blank.length > 0;
    const drawn = nested ? blankNameFaults(file, scan.blank, files, reader, publishedOf) : [];
    return { judged: scan.judged, faults: [...scan.faults, ...drawn] };
  });
  return {
    judged: scans.flatMap((scan) => scan.judged),
    faults: scans.flatMap((scan) => scan.faults),
  };
}

/** The local a component's `$props()` pattern collects its rest keys under, or `undefined`. */
export function restLocal(ast) {
  const declarators = [...walkNodes(ast.instance)].filter(
    (node) => node.type === 'VariableDeclarator' && isCallTo(node.init, '$props')
  );
  const patterns = declarators.flatMap((node) => node.id.properties ?? []);
  return patterns.find((property) => property.type === 'RestElement')?.argument.name;
}

/** Whether every read of `name` in one component is the whole expression of a spread attribute. */
function readOnlyInSpreads(ast, name) {
  let elsewhere = false;
  for (const root of [ast.module, ast.instance, ast.fragment]) {
    walkWithAncestors(root, (node, ancestors) => {
      if (node.type !== 'Identifier' || node.name !== name) return;
      const parent = ancestors.at(-1);
      const declares = parent?.type === 'VariableDeclarator' && parent.id === node;
      const spread = parent?.type === 'SpreadAttribute' && parent.expression === node;
      if (!declares && !spread && isNameRead(node, parent)) elsewhere = true;
    });
  }
  return !elsewhere;
}

/** The operands a spread expression can take its value from: `a && b` spreads `b` or nothing. */
const SPREAD_OPERANDS = Object.freeze({
  ConditionalExpression: ({ consequent, alternate }) => [consequent, alternate],
  LogicalExpression: ({ operator, left, right }) => (operator === '&&' ? [right] : [left, right]),
});

/**
 * The keys of every object literal an initialiser can answer, in lower case as a spread writes
 * them on an HTML element, or `null` where one is not read.
 */
function objectKeys(expression) {
  if (isCallTo(expression, '$derived')) return objectKeys(expression.arguments[0]);
  if (expression?.type === 'ObjectExpression') {
    const { properties } = expression;
    const plain = properties.every(({ type, computed }) => type === 'Property' && !computed);
    return plain ? properties.map(({ key }) => String(key.name ?? key.value).toLowerCase()) : null;
  }
  const operands = SPREAD_OPERANDS[expression?.type]?.(expression);
  if (!operands) return null;
  const keys = operands.map((operand) => objectKeys(operand));
  return keys.includes(null) ? null : keys.flat();
}

/** Every name a script of one component exports by declaration, which another module can then write to. */
function exportedLocals(ast) {
  const exported = [ast.module, ast.instance]
    .flatMap((script) => script?.content?.body ?? [])
    .flatMap(({ type, declaration }) =>
      type === 'ExportNamedDeclaration' ? (declaration?.declarations ?? []) : []
    );
  return new Set(exported.flatMap(({ id }) => [...identifierNames(id)]));
}

/**
 * The keys a spread attribute's expression can write, or `null` where the gate cannot follow it.
 * It follows a name no template block binds, declared by a top-level plain `const` no script
 * exports and read nowhere but in spread attributes, into an object literal with no spread and no
 * computed key, under `$derived(…)` or not, and through a conditional, `||`, `??` and the right
 * of `&&`.
 */
export function spreadKeys(ast, expression) {
  if (expression?.type !== 'Identifier') return null;
  const { name } = expression;
  const followable = !templateBindings(ast).has(name) && !exportedLocals(ast).has(name);
  return followable && readOnlyInSpreads(ast, name)
    ? objectKeys(scriptDeclarations(ast).get(name))
    : null;
}

/** What hands an element to code of the component's own, which can write any attribute on it. */
const ELEMENT_HANDLERS = Object.freeze({
  UseDirective: 'a use: action',
  AttachTag: 'an {@attach}',
  TransitionDirective: 'a transition',
  AnimateDirective: 'an animate: directive',
});

/**
 * Every element one component spreads its `$props()` rest local on, a `svelte:element` and a
 * child component included, as `{ node, guards, before, written, spreads, handed }`: the names its
 * `{#if}` and `{#each}` ancestors read; each `data-*` attribute written ahead of the spread, static
 * or not; every attribute the element states, wherever it sits; every other spread as
 * `{ local, before, keys }`, `keys` being its `spreadKeys`; and each `ELEMENT_HANDLERS` it carries.
 * An attribute's name is read in lower case, as HTML reads it. A rest that reaches an element any
 * other way (an alias, a `$derived` copy) answers none.
 */
export function restElements(ast) {
  const rest = restLocal(ast);
  if (!rest) return [];
  const isRest = ({ type, expression }) => type === 'SpreadAttribute' && expression?.name === rest;
  const elements = [];
  walkWithAncestors(ast.fragment, (node, ancestors) => {
    if (['RegularElement', 'SvelteElement', 'Component'].includes(node.type)) {
      elements.push({ node, guards: guardNames(ancestors) });
    }
  });
  return elements.flatMap(({ node, guards }) => {
    const at = node.attributes.findIndex((attribute) => isRest(attribute));
    if (at === -1) return [];
    const stated = node.attributes.map(({ type, name }) =>
      type === 'Attribute' ? name.toLowerCase() : null
    );
    const written = stated.filter((name) => name !== null);
    const before = stated.slice(0, at).filter((name) => name?.startsWith('data-'));
    const spreads = node.attributes.flatMap((attribute, index) => {
      if (attribute.type !== 'SpreadAttribute' || isRest(attribute)) return [];
      const local = attribute.expression.name ?? 'an expression';
      return [{ local, before: index < at, keys: spreadKeys(ast, attribute.expression) }];
    });
    const handed = node.attributes.flatMap(({ type }) => ELEMENT_HANDLERS[type] ?? []);
    return [{ node, guards, before, written, spreads, handed }];
  });
}

const isBlank = (node) =>
  (node.type === 'Text' && node.data.trim() === '') ||
  node.type === 'Comment' ||
  node.type === 'ConstTag';

/** The branches of one `{#if}` chain, `{:else if}` flattened, an absent `{:else}` left out. */
function chainBranches(block) {
  const branches = [block.consequent];
  let alternate = block.alternate;
  while (alternate) {
    const [only, ...others] = alternate.nodes.filter((node) => !isBlank(node));
    if (only?.type === 'IfBlock' && only.elseif && others.length === 0) {
      branches.push(only.consequent);
      alternate = only.alternate;
    } else {
      branches.push(alternate);
      alternate = null;
    }
  }
  return branches;
}

export const BRANCH_TWIN =
  'rest lands in one branch of an {#if} or {#each} and another branch draws without it';

/** The branches one block chooses between, or none for a block that chooses nothing. */
function blockBranches(node) {
  if (node.type === 'IfBlock' && !node.elseif) return chainBranches(node);
  return node.type === 'EachBlock' && node.fallback ? [node.body, node.fallback] : [];
}

/**
 * The twin rule over one component: an `{#if}` chain, or an `{#each}` with its `{:else}`, one of
 * whose branches that draws anything holds a rest landing and another holds none is `BRANCH_TWIN`,
 * once per block; a branch that draws nothing is not judged.
 */
export function branchTwinFaults(ast) {
  const landings = new Set(restElements(ast).map(({ node }) => node));
  if (landings.size === 0) return [];
  const holds = (fragment) => [...walkNodes(fragment)].some((node) => landings.has(node));
  return [...walkNodes(ast.fragment)].flatMap((block) => {
    const drawn = blockBranches(block).filter((fragment) =>
      fragment.nodes.some((node) => !isBlank(node))
    );
    const holding = drawn.filter((fragment) => holds(fragment));
    return holding.length > 0 && holding.length < drawn.length ? [BRANCH_TWIN] : [];
  });
}

/**
 * What one element a control-landing rest is spread on breaks by what the component writes on it
 * beside that rest: a spread the gate cannot follow, wherever it sits; an `ELEMENT_HANDLERS`
 * member; a `data-*` name written ahead of the rest, by an attribute or a followed spread, that
 * `reserved` does not match, so a rest key could replace it; and one of `ariaKeys`, the entry's
 * `aria` keys, written by an attribute or a followed spread on either side of the rest.
 */
export function controlRestFaults({ before, written, spreads, handed }, reserved, ariaKeys = []) {
  const ahead = spreads.filter((spread) => spread.before).flatMap(({ keys }) => keys ?? []);
  const replaceable = [...before, ...ahead.filter((name) => name.startsWith('data-'))];
  const stated = [...written, ...spreads.flatMap(({ keys }) => keys ?? [])];
  return [
    ...spreads
      .filter(({ keys }) => keys === null)
      .map(
        ({ local }) =>
          `a spread of ${local} sits on a control-landing rest element and the gate cannot follow it`
      ),
    ...handed.map(
      (what) => `${what} hands a control-landing rest element to code the gate cannot follow`
    ),
    ...replaceable
      .filter((name) => !reserved.test(name))
      .map((name) => `${name} is written before a control-landing rest and is not reserved`),
    ...stated
      .filter((name) => ariaKeys.includes(name))
      .map((name) => `${name} is written by the component and published as an aria key`),
  ];
}

/**
 * The ARIA attributes the contract never publishes as an `aria` key, in the order the spec's
 * "published only as an `aria` key" bullet spells them, which `fabricate-api-surface.test.js`
 * holds equal. A name source and any other `aria-*` name are held at version 1, not listed.
 */
export const NEVER_ARIA = Object.freeze([
  'aria-pressed',
  'aria-checked',
  'aria-selected',
  'aria-current',
  'aria-disabled',
  'aria-hidden',
  'aria-live',
  'aria-atomic',
  'aria-relevant',
  'aria-owns',
  'aria-activedescendant',
  'aria-flowto',
]);

const ARIA_KEY = /^aria-[a-z]+$/;

/**
 * What an `aria` key breaks, as `<key> <rule>`: spelled `aria-<name>`, no prop the component
 * declares (`declared`), never `required`, on an entry whose rest lands on a control, and no
 * `NEVER_ARIA` name.
 */
export function ariaFaults(key, spec, entry, declared) {
  const lands = entry.rest === true && entry.restOn === 'control';
  return [
    ...(ARIA_KEY.test(key) ? [] : [`${key} is an aria key not spelled aria-<name>`]),
    ...(declared ? [`${key} is an aria key the component declares as a prop`] : []),
    ...(spec.required === undefined ? [] : [`${key} is an aria key that states required`]),
    ...(lands ? [] : [`${key} is an aria key on an entry whose rest lands on no control`]),
    ...(NEVER_ARIA.includes(key) ? [`${key} is an ARIA attribute the seam never publishes`] : []),
  ];
}

/** How often one component reads its `$props()` rest local, the pattern that declares it apart. */
export function restReads(ast) {
  const rest = restLocal(ast);
  let reads = 0;
  for (const root of rest ? [ast.module, ast.instance, ast.fragment] : []) {
    walkWithAncestors(root, (node, ancestors) => {
      if (node.type !== 'Identifier' || node.name !== rest) return;
      const parent = ancestors.at(-1);
      if (parent?.type !== 'RestElement' && isNameRead(node, parent)) reads += 1;
    });
  }
  return reads;
}

/** Every `.svelte` file under `dir`, recursively, by path. */
export function componentPathsUnder(dir, isRoot = true) {
  return readScannedDirectory(resolve(repoRoot, dir), { isRoot })
    .flatMap((entry) => {
      const path = `${dir}/${entry.name}`;
      if (entry.isDirectory()) return componentPathsUnder(path, false);
      return path.endsWith('.svelte') ? [path] : [];
    })
    .sort(byName);
}

/**
 * Every selector of one parsed stylesheet with a part `test` passes, wherever in the selector, as
 * `{ complex, rule, within }`: its rule, and the names of the at-rules and `'rule'` for each style
 * rule that hold it.
 */
export function selectorsWithRules(css, test) {
  const found = [];
  walkWithAncestors(css, (rule, ancestors) => {
    if (rule.type !== 'Rule') return;
    const within = ancestors
      .filter((ancestor) => ancestor.type === 'Rule' || ancestor.type === 'Atrule')
      .map((ancestor) => (ancestor.type === 'Rule' ? 'rule' : `@${ancestor.name}`));
    for (const complex of rule.prelude.children) {
      if ([...walkNodes(complex)].some((part) => test(part))) found.push({ complex, rule, within });
    }
  });
  return found;
}

/** Every selector of one parsed stylesheet with a part `test` passes, wherever in the selector. */
export const selectorsHolding = (css, test) =>
  selectorsWithRules(css, test).map(({ complex }) => complex);

export const selectorsNaming = (css, root) =>
  selectorsHolding(css, (part) => part.type === 'ClassSelector' && part.name === root);

/** A selector as its stylesheet writes it. */
export const writtenSelector = (css, complex) =>
  css.content.styles.slice(complex.start - css.content.start, complex.end - css.content.start);

/** The name an attribute selector matches in HTML: a character escape resolved, in lower case. */
const matchedAttribute = (part) => part.name.replaceAll(/\\(.)/gsu, '$1').toLowerCase();

/**
 * The classes one compound requires of the element it matches: its own, and those of a `:global()`
 * that wraps one compound. A class under any other pseudo-class (`:not()`, `:is()`, `:where()`,
 * `:has()`) is one the element need not carry.
 */
function requiredClasses(relative) {
  return relative.selectors.flatMap((part) => {
    if (part.type === 'ClassSelector') return [part.name];
    if (part.type !== 'PseudoClassSelector' || part.name !== 'global') return [];
    const [wrapped, ...others] = (part.args?.children ?? []).flatMap((complex) => complex.children);
    return wrapped && others.length === 0 ? requiredClasses(wrapped) : [];
  });
}

const ANCESTOR_COMBINATORS = new Set([' ', '>']);

/**
 * Every selector of `sheets`, each `[file, css]`, with an attribute selector named `name` wherever
 * in the selector, as `{ written, above, bearers }`: as its sheet writes it; each of the
 * `requiredClasses` of a compound a descendant or child combinator follows ahead of the compound
 * that holds the attribute, which is an ancestor of that compound's element; and the
 * `requiredClasses` of every compound, inside a pseudo-class or not, that holds the attribute
 * outside a `:has()`, whose arguments match other elements and are read as compounds of their own.
 * `name` is lower case.
 */
export function attributeSelectors(sheets, name) {
  const holds = (part) => part.type === 'AttributeSelector' && matchedAttribute(part) === name;
  const holdsIn = (relative) => [...walkNodes(relative)].some((part) => holds(part));
  const holdsOn = (relative) => {
    const related = new Set(
      [...walkNodes(relative)].flatMap((part) =>
        part.type === 'PseudoClassSelector' && part.name === 'has' ? [...walkNodes(part.args)] : []
      )
    );
    return [...walkNodes(relative)].some((part) => holds(part) && !related.has(part));
  };
  return sheets.flatMap(([file, css]) =>
    selectorsHolding(css, holds).map((complex) => {
      const at = complex.children.findIndex((relative) => holdsIn(relative));
      const above = complex.children
        .slice(0, at)
        .filter((_, index) => ANCESTOR_COMBINATORS.has(complex.children[index + 1].combinator.name))
        .flatMap((relative) => requiredClasses(relative));
      const bearers = [...walkNodes(complex)]
        .filter((node) => node.type === 'RelativeSelector' && holdsOn(node))
        .flatMap((relative) => requiredClasses(relative));
      const written = `${file}: ${writtenSelector(css, complex)}`;
      return { written, above, bearers: [...new Set(bearers)] };
    })
  );
}

/** Every selector of one parsed stylesheet with an attribute selector named `name`, as written. */
export const selectorsOnAttribute = (file, css, name) =>
  attributeSelectors([[file, css]], name).map(({ written }) => written);

const isRingSelector = (complex) => {
  const [root, subject, ...deeper] = complex.children;
  if (!subject || deeper.length > 0) return false;
  const [rootPart, ...rootRest] = root.selectors;
  const [element, pseudo, ...rest] = subject.selectors;
  return (
    rootRest.length === 0 &&
    rootPart.type === 'ClassSelector' &&
    rootPart.name === 'fabricate' &&
    rest.length === 0 &&
    (element.type === 'TypeSelector' || element.type === 'AttributeSelector') &&
    pseudo?.type === 'PseudoClassSelector' &&
    pseudo.name === 'focus-visible'
  );
};

/** A rule's declarations as `[property, value]`, each value on one line. */
export const declarationsOf = (rule) =>
  rule.block.children
    .filter((node) => node.type === 'Declaration')
    .map((node) => [node.property, node.value.replaceAll(/\s+/g, ' ').trim()]);

let ring;
/** The module's keyboard ring, read from `styles/fabricate-base.css`: the elements it names and what it draws. */
export function moduleRing() {
  if (ring) return ring;
  const base = stylesheetSources().parts.find(({ file }) => file === 'styles/fabricate-base.css');
  const { css } = templateOf(base.file, `<style>${base.text}</style>`).ast;
  const rules = [...walkNodes(css)].filter(
    (node) =>
      node.type === 'Rule' && node.prelude.children.every((complex) => isRingSelector(complex))
  );
  assert.equal(rules.length, 1, 'one `.fabricate <element>:focus-visible` rule');
  const named = rules[0].prelude.children.map((complex) => complex.children[1].selectors[0]);
  const drawn = Object.fromEntries(declarationsOf(rules[0]));
  ring = {
    tags: named.filter((part) => part.type === 'TypeSelector').map((part) => part.name),
    attributes: named.filter((part) => part.type === 'AttributeSelector').map((part) => part.name),
    outline: drawn.outline,
    offset: drawn['outline-offset'],
  };
  return ring;
}

const byProperty = ([a], [b]) => byName(a, b);
/** Whether a rule declares exactly `declarations`, in any order. */
export const sameDeclarations = (rule, declarations) =>
  JSON.stringify(declarationsOf(rule).sort(byProperty)) ===
  JSON.stringify([...declarations].sort(byProperty));

/** Whether a rule declares exactly `outline: none` and `box-shadow: none`. */
export const isStrip = (rule) =>
  sameDeclarations(rule, [
    ['outline', 'none'],
    ['box-shadow', 'none'],
  ]);

let stylesheets;
/** Every module sheet partial and every component `<style>` under `src/ui/svelte`, as `[file, css]`. */
export function everyStylesheet() {
  if (stylesheets) return stylesheets;
  const sheets = stylesheetSources().parts.map(({ file, text }) => [
    file,
    templateOf(file, `<style>${text}</style>`).ast.css,
  ]);
  const blocks = componentPathsUnder('src/ui/svelte').map((file) => [
    file,
    componentAstOf(file).css,
  ]);
  assert.equal(sheets.length, 14, 'the fourteen partials');
  assert.ok(blocks.length > 400, 'every component under src/ui/svelte');
  stylesheets = [...sheets, ...blocks];
  return stylesheets;
}

const CLAUSE_CALLS = new Set(['it', 'test']);

/** Whether a node is a `.getAttribute(<string>)` call. */
const readsByName = (node) =>
  node.type === 'CallExpression' &&
  node.callee?.type === 'MemberExpression' &&
  node.callee.property?.name === 'getAttribute' &&
  typeof node.arguments[0]?.value === 'string';

const isFunctionNode = (node) =>
  node?.type === 'ArrowFunctionExpression' || node?.type === 'FunctionExpression';

const SKIPPABLE_CALLS = new Set(['describe', 'it', 'test']);
const SKIP_MARKS = new Set(['skip', 'todo']);

/** Whether a node is a skipped `describe`, `it` or `test`: `.skip`, `.todo`, or a set `skip` or `todo` option. */
function isSkippedCall(node) {
  if (node.type !== 'CallExpression') return false;
  const { callee } = node;
  if (callee?.type === 'MemberExpression' && SKIPPABLE_CALLS.has(callee.object?.name)) {
    return SKIP_MARKS.has(callee.property?.name);
  }
  if (!SKIPPABLE_CALLS.has(callee?.name)) return false;
  return node.arguments.some(
    (argument) =>
      argument.type === 'ObjectExpression' &&
      argument.properties.some(
        ({ key, value }) => SKIP_MARKS.has(key?.name) && !(value.type === 'Literal' && !value.value)
      )
  );
}

/**
 * Every attribute name a suite reads with `.getAttribute('<name>')` inside the body of an `it` or
 * `test` call that neither it nor a `describe` around it skips, from a parsed module. Which element
 * the read is made of is not seen, nor whether an inner function that holds it is ever called.
 */
export function attributesReadInClauses(ast) {
  const bodies = [];
  walkWithAncestors(ast, (node, ancestors) => {
    const clause = node.type === 'CallExpression' && CLAUSE_CALLS.has(node.callee?.name);
    if (!clause || [node, ...ancestors].some((above) => isSkippedCall(above))) return;
    bodies.push(...node.arguments.filter((argument) => isFunctionNode(argument)));
  });
  const reads = bodies.flatMap((body) => [...walkNodes(body)].filter((node) => readsByName(node)));
  return [...new Set(reads.map((call) => call.arguments[0].value))].sort(byName);
}

/** Each `heldBy`, `<file>: <title>`, whose file has no `describe` block of that title. */
export function unheldClauses(heldBys) {
  return heldBys.filter((heldBy) => {
    const [file, title] = heldBy.split(': ');
    const described = [...walkNodes(SHIPPED.module(file).ast)]
      .filter((node) => node.type === 'CallExpression' && node.callee.name === 'describe')
      .map((node) => node.arguments[0]?.value);
    return !described.includes(title);
  });
}

const APP_ROOTS = new Set(['fabricate', 'fabricate-app', 'fabricate-manager']);
const APP_TOKENS = ['var(--fab-manager-'];
/** What a `fabricate` entry is still refused: the Manager root's own class and tokens. */
const MANAGER_ROOTS = new Set(['fabricate-manager']);
const MANAGER_RULES = new Set(['app-root selector', ...APP_TOKENS]);
export const FOUNDRY_GLOBALS = [
  'game',
  'foundry',
  'Hooks',
  'CONFIG',
  'CONST',
  'ui',
  'canvas',
  'fromUuid',
  'fromUuidSync',
  'getDocumentClass',
];

/** The static class names one template node writes, by attribute or directive. */
export function classNames(node) {
  if (node.type === 'ClassDirective') return [node.name];
  if (node.type !== 'Attribute' || node.name !== 'class' || !Array.isArray(node.value)) return [];
  return node.value.flatMap((part) => (part.type === 'Text' ? part.data.split(/\s+/) : []));
}

/**
 * What a component's own stylesheet and template borrow from above the entry's `root`, by rule:
 * every rule at `any`, the Manager root's selector and tokens at `fabricate`, none at `manager`.
 */
export function ancestorDependencies(ast, root = 'any') {
  if (root === 'manager') return [];
  const windowed = root === 'fabricate';
  const refused = windowed ? MANAGER_ROOTS : APP_ROOTS;
  const found = new Set();
  for (const node of walkNodes(ast.css)) {
    if (node.type === 'ClassSelector' && refused.has(node.name)) found.add('app-root selector');
    if (node.type === 'Atrule' && node.name === 'container') found.add('@container');
    if (node.type !== 'Declaration') continue;
    for (const token of APP_TOKENS) if (node.value.includes(token)) found.add(token);
    if (unguardedFontPrimaryReads(node.value).length > 0) {
      found.add('unguarded var(--font-primary)');
    }
  }
  for (const node of walkNodes(ast.fragment)) {
    if (classNames(node).includes('visually-hidden')) found.add('.visually-hidden');
  }
  return [...found].filter((rule) => !windowed || MANAGER_RULES.has(rule)).sort(byName);
}

/** Each Foundry global one file reads, as `reads <name>`; a local binding of the name is no read. */
export function foundryReads(file, reader) {
  const scope = isComponent(file) ? reader.componentScope(file) : reader.module(file);
  return FOUNDRY_GLOBALS.filter((name) => readsGlobal(scope, name)).map((name) => `reads ${name}`);
}

/**
 * The root a gate judges `entry`'s closure and focus mark at: `'fabricate'` for one the seam draws
 * under the standalone style root, whose `.fabricate` the module sheet styles it by (issue 2456).
 */
export const gatedRoot = (entry) => (entry.standaloneRoot === true ? 'fabricate' : entry.root);

/** Each ancestor dependency and Foundry read in an entry's closure, as `<file>: <rule>`. */
export function closureDependencies(path, reader = SHIPPED, root = 'any') {
  return [...importClosure(path, reader)].flatMap((file) =>
    [
      ...(isComponent(file) ? ancestorDependencies(reader.component(file), root) : []),
      ...foundryReads(file, reader),
    ].map((rule) => `${file}: ${rule}`)
  );
}
