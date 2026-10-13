/**
 * What the published component gates share (issue 2452): the three parses a gate reads of a file,
 * an entry's import closure, a component's declared props, the pinned tags of each
 * `svelte:element`, admission rule 9's scan of one component with each element's hook and guards,
 * and every stylesheet a published root's selectors are read from.
 * `tests/published-component-manifest.test.js` and `tests/published-component-controls.test.js`
 * import them.
 */
import assert from 'node:assert/strict';
import { posix, resolve } from 'node:path';

import { stylesheetSources } from '../../scripts/lib/stylesheetSource.js';

import { templateOf } from './apiConvention.js';
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
import { parseComponentScope } from './svelteStructureContract.js';

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

/** Each `$props()` key with its local name and whether it is `$bindable`. */
export function propLocals(ast) {
  for (const node of walkNodes(ast.instance)) {
    if (node.type !== 'VariableDeclarator' || node.init?.callee?.name !== '$props') continue;
    return node.id.properties
      .filter((property) => property.type === 'Property')
      .map((property) => {
        const value = property.value;
        const local = value.type === 'AssignmentPattern' ? value.left.name : value.name;
        const bindable =
          value.type === 'AssignmentPattern' && value.right.callee?.name === '$bindable';
        return { key: property.key.name ?? property.key.value, local, bindable };
      });
  }
  return [];
}

/** Whether an identifier under `parent` is read as a name: no member name after a dot, and no object key. */
function isNameRead(node, parent) {
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
  'src/ui/svelte/components/Chip.svelte: svelte:element': { tags: ['span'], keys: [] },
  'src/ui/svelte/components/Kicker.svelte: svelte:element': {
    tags: ['h3', 'p', 'span'],
    keys: ['as'],
    heldBy: "tests/components/published-leaves-mounted.test.js: Kicker's host element",
  },
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
function templateBindings(ast) {
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
 * What a `svelte:element`'s `this` expression reads, to a fixed point, as `{ keys, props, faults }`:
 * the published keys, and every prop by its key. A `const` is followed into its initialiser,
 * `$derived` and `$derived.by` included, and a function into its body. `published` is the entry's
 * keys by local name. A name declared any other way, or bound by a template block anywhere in the
 * file, is the fault `tag reads <name>, which the gate cannot follow`; any other is a global.
 */
export function tagKeys(ast, node, published) {
  const locals = new Map(propLocals(ast).map(({ key, local }) => [local, key]));
  const declared = scriptDeclarations(ast);
  const bound = templateBindings(ast);
  const keys = new Set();
  const props = new Set();
  const faults = [];
  const seen = new Set();
  const queue = [...referencedNames(node.tag)];
  while (queue.length > 0) {
    const name = queue.pop();
    if (seen.has(name)) continue;
    seen.add(name);
    if (bound.has(name) || declared.get(name) === null) {
      faults.push(`tag reads ${name}, which the gate cannot follow`);
    } else if (locals.has(name)) {
      props.add(locals.get(name));
      if (published.has(name)) keys.add(published.get(name));
    } else if (declared.has(name)) {
      queue.push(...referencedNames(declared.get(name)));
    }
  }
  return { keys: [...keys].sort(byName), props: [...props].sort(byName), faults };
}

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

/** Each component tag one parsed file draws from a relative import, as `[path, node]`. */
function componentTags(file, ast) {
  const imported = new Map();
  const statements = [ast.module, ast.instance].flatMap((script) => script?.content?.body ?? []);
  for (const statement of statements) {
    if (statement.type !== 'ImportDeclaration' || !statement.source.value.startsWith('.')) continue;
    const path = posix.join(posix.dirname(file), statement.source.value);
    for (const specifier of statement.specifiers) imported.set(specifier.local.name, path);
  }
  return [...walkNodes(ast.fragment)]
    .filter((node) => node.type === 'Component' && imported.has(node.name))
    .map((node) => [imported.get(node.name), node]);
}

/**
 * What one file breaks by drawing a child whose pinned tags rest on a prop's default, `defaulted`
 * naming those props by the child's path: it states one of them on the child's tag, or a spread.
 */
function passedFaults(file, ast, defaulted) {
  return componentTags(file, ast).flatMap(([child, node]) => {
    const keys = defaulted.get(child) ?? [];
    if (keys.length === 0) return [];
    return node.attributes
      .filter(({ type, name }) => type === 'SpreadAttribute' || keys.includes(name))
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
 * file passes a child a prop its tag reads and its pin does not follow.
 */
export function dynamicElementFaults(files, dynamic = DYNAMIC_ELEMENTS) {
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
      defaulted.set(file, [...(defaulted.get(file) ?? []), ...unfollowed]);
    }
  }
  const passed = files.flatMap(({ file, ast }) => passedFaults(file, ast, defaulted));
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
 * Admission rule 9 over one closure file: a `button`, `a` or `[tabindex]` element states
 * `data-keyboard-focus="true"`, a `button` states `type="button"`, and no form control states
 * `name`. A `svelte:element` is judged once, as the union of its pinned tags, and one with no pin
 * is a fault; its `type` is a mounted suite's. Answers each element it judged beside each fault,
 * both as `<file>: <tag> …`, and each judged element as `{ id, node, guards, tags }`, its `id`
 * being `<file>: <tag>[<hook>]`.
 */
export function focusableElements(file, ast, dynamic = DYNAMIC_ELEMENTS) {
  const judged = [];
  const faults = [];
  const elements = [];
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
    if (as.control && attributeOf(node, 'name')) faults.push(`${file}: ${node.name} states name`);
  });
  return { judged, faults, elements };
}

/** The local a component's `$props()` pattern collects its rest keys under, or `undefined`. */
function restLocal(ast) {
  const declarators = [...walkNodes(ast.instance)].filter(
    (node) => node.type === 'VariableDeclarator' && isCallTo(node.init, '$props')
  );
  const patterns = declarators.flatMap((node) => node.id.properties ?? []);
  return patterns.find((property) => property.type === 'RestElement')?.argument.name;
}

/**
 * Every element one component spreads its `$props()` rest local on, a `svelte:element` included,
 * as `{ node, before }`, `before` naming each `data-*` attribute written ahead of the spread,
 * static or not. A rest that reaches an element any other way (an alias, a `$derived` copy, a
 * child component) answers none.
 */
export function restElements(ast) {
  const rest = restLocal(ast);
  if (!rest) return [];
  return [...walkNodes(ast.fragment)]
    .filter((node) => node.type === 'RegularElement' || node.type === 'SvelteElement')
    .flatMap((node) => {
      const at = node.attributes.findIndex(
        (attribute) => attribute.type === 'SpreadAttribute' && attribute.expression?.name === rest
      );
      if (at === -1) return [];
      const before = node.attributes
        .slice(0, at)
        .filter(({ type, name }) => type === 'Attribute' && name.startsWith('data-'))
        .map(({ name }) => name);
      return [{ node, before }];
    });
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

/** Every selector of one parsed stylesheet with an attribute selector named `name`, as written. */
export const selectorsOnAttribute = (file, css, name) =>
  selectorsHolding(css, (part) => part.type === 'AttributeSelector' && part.name === name).map(
    (complex) => `${file}: ${writtenSelector(css, complex)}`
  );

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
