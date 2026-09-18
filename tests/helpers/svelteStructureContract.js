/**
 * Structural questions about a Svelte component, answered from its AST instead of from its text
 * (issue 1658), so a rename, an import reorder or an extraction does not break a test that never
 * cared how the component was written. `tests/svelte-structure-contract.test.js` pins the two
 * paragraphs below, so condense them only together with that test.
 *
 * Do not add a string `includes` on component source to a test. That is the shape
 * `tests/source-pin-ratchet.test.js` bounds, and these predicates are what it converts to.
 *
 * The residue they deliberately do not address: exact JS expression text, a receiver that is a
 * loop variable rather than a literal, i18n key strings, and `.js`/`.mjs` targets.
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

/** Every raw element the template draws, lower-cased, in source order. */
export function renderedElements(ast) {
  const named = collect(ast, (node) => node.type === 'RegularElement').map((node) => ({
    start: node.start,
    tag: node.name.toLowerCase(),
  }));
  // `walkElements` visits only RegularElement and Component, so a dynamic tag needs its own pass.
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

/** Whether one element or component node declares the named attribute, prop or binding. */
export function declaresAttribute(node, name, { directives = true } = {}) {
  if (attributeNamed(node, name)) return true;
  if (!directives) return false;
  return (node.attributes || []).some(
    (attribute) => PROP_DIRECTIVES.has(attribute.type) && attribute.name === name
  );
}

/**
 * Whether every occurrence of `componentName` declares `propName`. False when the component is not
 * rendered at all, so a caller cannot read a vacuous true as a satisfied contract.
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
 * and re-exports.
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
