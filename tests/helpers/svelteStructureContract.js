/**
 * Structural questions about a Svelte component, answered from its AST instead of from its text
 * (issue 1658), so a rename, an import reorder or an extraction does not break a test that never
 * cared how the component was written. Proved from inside the `npm test` glob by
 * `tests/svelte-structure-contract.test.js`.
 *
 * Do not add a string `includes` on component source to a test. That is the shape
 * `tests/source-pin-ratchet.test.js` bounds, and these predicates are what it converts to.
 *
 * It parses nothing of its own: `svelteTemplateScan.js` already walks every shipped template with
 * `svelte/compiler`, and a second walker beside it is the duplication both helpers exist to avoid.
 *
 * COVERAGE IS NOT MEASURED HERE. These predicates address the `.svelte`-targeted structural subset
 * of the sites the ratchet counts. No share is stated, because no run has derived one against the
 * ledger this change pins, and the plan-review estimate was taken against a corpus figure this
 * change corrected. #1691 derives it at its own boundary. The residue they deliberately do not
 * address: exact JS expression text, a receiver that is a loop variable rather than a literal,
 * i18n key strings, and `.js`/`.mjs` targets.
 */
import { parse } from 'svelte/compiler';

import { walkNodes } from './moduleAst.js';
import { attributeNamed, walkElements } from './svelteTemplateScan.js';

/** Directives that genuinely bind a prop; `class:`, `style:`, `use:`, `on:` and friends do not. */
const PROP_DIRECTIVES = Object.freeze(new Set(['BindDirective']));

/** Declaration nodes that name a module the component depends on. */
const SPECIFIER_TYPES = Object.freeze([
  'ImportDeclaration',
  'ExportNamedDeclaration',
  'ExportAllDeclaration',
]);

/** Keys that make the tree cyclic or carry no child nodes. */
const SKIPPED_KEYS = Object.freeze(['parent', 'loc', 'range']);

/** Parse one component's source into the AST the predicates below read. */
export function parseComponent(source) {
  return parse(String(source ?? ''), { modern: true });
}

function collect(ast, predicate) {
  const found = [];
  walkElements(ast.fragment ?? ast, (node) => {
    if (predicate(node)) found.push(node);
  });
  return found.sort((left, right) => left.start - right.start);
}

/** Every `Component` node the template renders, by name, in source order. */
export function renderedComponents(ast) {
  return collect(ast, (node) => node.type === 'Component').map((node) => node.name);
}

/** Whether the template renders the named component anywhere, including inside a block or snippet. */
export function rendersComponent(ast, name) {
  return renderedComponents(ast).includes(name);
}

/**
 * Every raw element the template draws, lower-cased, in source order.
 *
 * A `<svelte:element this="td">` contributes its literal tag; one whose `this` is an expression
 * cannot be known statically and contributes nothing, so a false from `rendersElement` means
 * "not drawn statically under that name", never "not drawn".
 */
export function renderedElements(ast) {
  const named = collect(ast, (node) => node.type === 'RegularElement').map((node) => ({
    start: node.start,
    tag: node.name.toLowerCase(),
  }));
  // `walkElements` visits only RegularElement and Component, so a dynamic tag needs its own pass.
  // It reuses this change's generic node walk rather than adding a second element walker.
  const dynamic = [];
  for (const node of walkNodes(ast.fragment ?? ast)) {
    if (node.type !== 'SvelteElement') continue;
    const tag = node.tag;
    if (tag?.type === 'Literal' && typeof tag.value === 'string') {
      dynamic.push({ start: node.start, tag: tag.value.toLowerCase() });
    }
  }
  return [...named, ...dynamic].sort((left, right) => left.start - right.start).map((e) => e.tag);
}

/** Whether the template draws a raw element of this tag name, ignoring case. */
export function rendersElement(ast, tagName) {
  return renderedElements(ast).includes(String(tagName).toLowerCase());
}

/** Whether a node carries a spread, which makes any absent prop undecidable from the template. */
export function carriesSpread(node) {
  return (node.attributes || []).some((attribute) => attribute.type === 'SpreadAttribute');
}

/**
 * Whether one element or component node declares the named attribute, prop or binding.
 *
 * A `class:name`, `style:name`, `use:name`, `on:name` or transition directive shares the name
 * space but passes no prop, so only a binding counts. Pass `directives: false` to require a plain
 * attribute.
 */
export function declaresAttribute(node, name, { directives = true } = {}) {
  if (attributeNamed(node, name)) return true;
  if (!directives) return false;
  return (node.attributes || []).some(
    (attribute) => PROP_DIRECTIVES.has(attribute.type) && attribute.name === name
  );
}

/**
 * Whether every occurrence of `componentName` declares `propName`.
 *
 * False when the component is not rendered at all, so a caller cannot read a vacuous true as a
 * satisfied contract. An occurrence carrying a spread is UNDECIDABLE from the template and is
 * reported as not declaring it — do not read a false here as proof of a call-site defect. Use
 * `carriesSpread` to tell the two apart.
 */
export function passesProp(ast, componentName, propName) {
  const occurrences = collect(
    ast,
    (node) => node.type === 'Component' && node.name === componentName
  );
  if (occurrences.length === 0) return false;
  return occurrences.every((node) => declaresAttribute(node, propName));
}

/**
 * Every module specifier the component depends on: both script blocks, static and dynamic imports,
 * and re-exports. A narrower reading would answer `false` for a component that genuinely depends
 * on the module, which is the failure direction this epic exists to prevent.
 */
export function importedModules(ast) {
  const specifiers = [];
  const visit = (node) => {
    if (!node || typeof node !== 'object') return;
    if (Array.isArray(node)) {
      for (const child of node) visit(child);
      return;
    }
    if (SPECIFIER_TYPES.includes(node.type) && node.source?.value) {
      specifiers.push(node.source.value);
    }
    if (node.type === 'ImportExpression' && node.source?.type === 'Literal') {
      specifiers.push(node.source.value);
    }
    for (const [key, value] of Object.entries(node)) {
      if (SKIPPED_KEYS.includes(key)) continue;
      if (value && typeof value === 'object') visit(value);
    }
  };
  visit(ast.instance?.content?.body ?? []);
  visit(ast.module?.content?.body ?? []);
  return specifiers;
}

/** Whether the component imports or re-exports the given module specifier. */
export function importsModule(ast, specifier) {
  return importedModules(ast).includes(specifier);
}
