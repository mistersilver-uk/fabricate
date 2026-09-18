/**
 * Structural questions about a Svelte component, answered from its AST instead of from its text
 * (issue 1658), so a rename, an import reorder or an extraction does not break a test that never
 * cared how the component was written. `tests/svelte-structure-contract.test.js` pins the two
 * paragraphs below, so condense them only together with that test.
 *
 * Do not add a string `includes` on component source to a test. That is the shape
 * `tests/source-pin-ratchet.test.js` bounds, and these predicates are what it converts to.
 *
 * The residue they deliberately do not address: exact JS expression text, and a receiver that is a
 * loop variable rather than a literal. An i18n key is a literal `containsLiteral` answers, and a
 * `.js`/`.mjs` target is answered by the sibling predicates in `moduleAst.js` (issue 1691).
 */
import { parse } from 'svelte/compiler';
import { parseForESLint } from 'svelte-eslint-parser';

import {
  declaredConstant as declaresConstant,
  importedModules as importedModuleSpecifiers,
  lazilyImportedModules,
  literalStrings,
  referencesIdentifier as namesIdentifier,
  walkNodes,
} from './moduleAst.js';
import { attributeNamed, walkElements } from './svelteTemplateScan.js';

/** Directives that genuinely bind a prop; `class:`, `style:`, `use:`, `on:` and friends do not. */
const PROP_DIRECTIVES = Object.freeze(new Set(['BindDirective']));

/** Parse one component's source into the AST the predicates below read. */
export function parseComponent(source) {
  return parse(String(source ?? ''), { modern: true });
}

/**
 * The same component in the OTHER vocabulary: an ESTree parse with a scope manager, which
 * `parseComponent` does not produce and which `readsGlobal` cannot answer without.
 */
export function parseComponentScope(source) {
  return parseForESLint(String(source ?? ''), {
    filePath: 'probe.svelte',
    ecmaVersion: 'latest',
    sourceType: 'module',
    loc: true,
    range: true,
  });
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

/** Both script blocks, in source order; the two places a component may declare or import. */
function scriptBodies(ast) {
  return [ast.instance?.content?.body ?? [], ast.module?.content?.body ?? []];
}

/** The scripts and the template: everywhere a component spells code. */
function codeParts(ast) {
  return [...scriptBodies(ast), ast.fragment ?? {}];
}

/**
 * Every module specifier the component depends on: both script blocks, static and dynamic imports,
 * and re-exports.
 */
export function importedModules(ast) {
  return scriptBodies(ast).flatMap((body) => [
    ...importedModuleSpecifiers(body),
    ...lazilyImportedModules(body),
  ]);
}

/** Whether the component imports or re-exports the given module specifier. */
export function importsModule(ast, specifier) {
  return importedModules(ast).includes(specifier);
}

/** Whether either script, or a `{@const}`, declares `const <name>`. */
export function declaredConstant(ast, name) {
  return codeParts(ast).some((part) => declaresConstant(part, name));
}

/** Whether the component names this identifier in a script or a template expression. */
export function referencesIdentifier(ast, name) {
  return codeParts(ast).some((part) => namesIdentifier(part, name));
}

/**
 * Whether the component spells this text in any literal it carries — a JS string, a template
 * chunk, a static attribute value or template text. Deliberately a substring match, because the
 * claims it answers are mostly absences and a looser needle makes an absence harder to fake.
 */
export function containsLiteral(ast, text) {
  const needle = String(text);
  return codeParts(ast).some((part) => {
    if (literalStrings(part).some((literal) => literal.includes(needle))) return true;
    for (const node of walkNodes(part)) {
      if (node.type === 'Text' && String(node.data ?? '').includes(needle)) return true;
    }
    return false;
  });
}

/** The host objects through which a Foundry global is also legitimately reached. */
const GLOBAL_HOSTS = Object.freeze(new Set(['globalThis', 'window', 'self']));

/** The property a member expression reads, for a plain name or a string-literal index. */
function memberName(node) {
  if (!node.computed) return node.property?.type === 'Identifier' ? node.property.name : undefined;
  return node.property?.type === 'Literal' && typeof node.property.value === 'string'
    ? node.property.value
    : undefined;
}

/**
 * Whether a component reads the named global, on the scope-resolved parse `parseComponentScope`
 * returns. Both legs are required: a free reference (`game.user` in the template) and a member read
 * off a free host (`globalThis.game.user`, the prevailing form). Scope resolution is what makes a
 * local `const game`, an `obj.game` property and an object key named `game` all answer false.
 */
export function readsGlobal({ ast, scopeManager }, name) {
  const free = scopeManager?.globalScope?.through ?? [];
  if (free.some((reference) => reference.identifier?.name === name)) return true;
  const hosts = new Set(
    free
      .filter((reference) => GLOBAL_HOSTS.has(reference.identifier?.name))
      .map((reference) => reference.identifier)
  );
  for (const node of walkNodes(ast)) {
    if (node.type === 'MemberExpression' && hosts.has(node.object) && memberName(node) === name) {
      return true;
    }
  }
  return false;
}
