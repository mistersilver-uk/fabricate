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
 * MEASURED COVERAGE. These predicates answer about 7% of the 2,300 pin sites the ratchet counts,
 * and under a fifth even counting every attribute pin. The residue they deliberately do not
 * address is exact JS expression text, a receiver that is a loop variable rather than a literal,
 * i18n key strings, and `.js`/`.mjs` targets — the majority of `src/` references from `tests/`.
 * A conversion that needs one of those needs a behavioural assertion, not a predicate here.
 */
import { parse } from 'svelte/compiler';

import { attributeNamed, walkElements } from './svelteTemplateScan.js';

/** Parse one component's source into the AST the predicates below read. */
export function parseComponent(source) {
  return parse(String(source ?? ''), { modern: true });
}

function collect(ast, predicate) {
  const found = [];
  walkElements(ast.fragment ?? ast, (node) => {
    if (predicate(node)) found.push(node);
  });
  return found;
}

/** Every `Component` node the template renders, by name, in document order. */
export function renderedComponents(ast) {
  return collect(ast, (node) => node.type === 'Component').map((node) => node.name);
}

/** Whether the template renders the named component anywhere, including inside a block or snippet. */
export function rendersComponent(ast, name) {
  return renderedComponents(ast).includes(name);
}

/** Every raw element the template draws, lower-cased, in document order. */
export function renderedElements(ast) {
  return collect(ast, (node) => node.type === 'RegularElement').map((node) =>
    node.name.toLowerCase()
  );
}

/** Whether the template draws a raw element of this tag name, ignoring case. */
export function rendersElement(ast, tagName) {
  return renderedElements(ast).includes(String(tagName).toLowerCase());
}

/**
 * Whether every occurrence of `componentName` declares `propName`.
 *
 * Returns false when the component is not rendered at all, so a caller cannot read a vacuous true
 * as a satisfied contract.
 */
export function passesProp(ast, componentName, propName) {
  const occurrences = collect(
    ast,
    (node) => node.type === 'Component' && node.name === componentName
  );
  if (occurrences.length === 0) return false;
  return occurrences.every((node) => declaresAttribute(node, propName));
}

/** Whether one element or component node declares the named attribute, prop or directive. */
export function declaresAttribute(node, name) {
  if (attributeNamed(node, name)) return true;
  return (node.attributes || []).some(
    (attribute) => attribute.type !== 'Attribute' && attribute.name === name
  );
}

/** Every module specifier the instance script imports, in source order. */
export function importedModules(ast) {
  const body = ast.instance?.content?.body ?? [];
  return body.filter((node) => node.type === 'ImportDeclaration').map((node) => node.source.value);
}

/** Whether the instance script imports the given module specifier. */
export function importsModule(ast, specifier) {
  return importedModules(ast).includes(specifier);
}
