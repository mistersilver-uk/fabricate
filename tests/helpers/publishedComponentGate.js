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

/** Every name an expression reads: no member name after a dot, and no object key. */
export function referencedNames(expression) {
  const names = new Set();
  walkWithAncestors(expression, (node, ancestors) => {
    if (node.type !== 'Identifier') return;
    const parent = ancestors.at(-1);
    const isMemberName =
      parent?.type === 'MemberExpression' && parent.property === node && !parent.computed;
    const isObjectKey = parent?.type === 'Property' && parent.key === node && !parent.computed;
    if (!isMemberName && !isObjectKey) names.add(node.name);
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

/**
 * The published keys a `svelte:element`'s `this` expression reads, to a fixed point, as
 * `{ keys, faults }`: a `const` is followed into its initialiser, `$derived` and `$derived.by`
 * included, and a function into its body. `published` is the entry's keys by local name. A name
 * declared any other way is the fault `tag reads <name>, which the gate cannot follow`, and a name
 * the scripts do not declare is a global.
 */
export function tagKeys(ast, node, published) {
  const props = new Set(propLocals(ast).map(({ local }) => local));
  const declared = scriptDeclarations(ast);
  const keys = new Set();
  const faults = [];
  const seen = new Set();
  const queue = [...referencedNames(node.tag)];
  while (queue.length > 0) {
    const name = queue.pop();
    if (seen.has(name)) continue;
    seen.add(name);
    if (props.has(name)) {
      if (published.has(name)) keys.add(published.get(name));
    } else if (declared.get(name)) {
      queue.push(...referencedNames(declared.get(name)));
    } else if (declared.has(name)) {
      faults.push(`tag reads ${name}, which the gate cannot follow`);
    }
  }
  return { keys: [...keys].sort(byName), faults };
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

/**
 * What the pins of `dynamic` break against the `svelte:element`s `files` draw, each file as
 * `{ file, ast, published }`: every drawn element is pinned and no two share an id, every pin is
 * drawn, each pinned tag is a string literal its file spells, a pin's `keys` are what `tagKeys`
 * reads, a keyed pin that is not `open` states `heldBy`, and no file under `src/` is `open`.
 */
export function dynamicElementFaults(files, dynamic = DYNAMIC_ELEMENTS) {
  const faults = [];
  const drawn = new Set();
  for (const { file, ast, published } of files) {
    const scripts = [ast.module, ast.instance, ast.fragment];
    const spelled = new Set(scripts.flatMap((part) => literalStrings(part)));
    for (const { id, node } of dynamicElements(file, ast)) {
      if (drawn.has(id)) faults.push(`${id} is drawn twice, so one pin would name two elements`);
      drawn.add(id);
      if (Object.hasOwn(dynamic, id)) {
        faults.push(...pinFaults(id, dynamic[id], tagKeys(ast, node, published), spelled));
      } else faults.push(`${id} has no pin`);
    }
  }
  const undrawn = Object.keys(dynamic).filter((id) => !drawn.has(id));
  return [...faults, ...undrawn.map((id) => `${id} is pinned and no file draws it`)];
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

/** Every selector of one parsed stylesheet with a part `test` passes, wherever in the selector. */
export function selectorsHolding(css, test) {
  const found = [];
  for (const node of walkNodes(css)) {
    if (node.type !== 'Rule') continue;
    for (const complex of node.prelude.children) {
      if ([...walkNodes(complex)].some((part) => test(part))) found.push(complex);
    }
  }
  return found;
}

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
