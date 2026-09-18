/**
 * Structural questions about a Svelte component, answered from its AST rather than its text
 * (issue 1658). `tests/svelte-structure-contract.test.js` pins the two paragraphs below.
 *
 * Do not add a string `includes` on component source to a test. That is the shape
 * `tests/source-pin-ratchet.test.js` bounds, and these predicates are what it converts to.
 *
 * The residue they deliberately do not address: exact JS expression text, and a receiver that is a
 * loop variable rather than a literal. An i18n key is a literal `spellsLiteral` answers, and a
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

export function parseComponent(source) {
  return parse(String(source ?? ''), { modern: true });
}

/** The OTHER vocabulary: the scope-resolved parse `parseComponent` does not produce. */
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
  // `walkElements` visits RegularElement and Component only, so a dynamic tag needs its own pass.
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

/** False when the component is not rendered, so a vacuous true cannot read as a contract. */
export function passesProp(ast, componentName, propName) {
  const occurrences = collect(
    ast,
    (node) => node.type === 'Component' && node.name === componentName
  );
  if (occurrences.length === 0) return false;
  return occurrences.every((node) => declaresAttribute(node, propName));
}

function scriptBodies(ast) {
  return [ast.instance?.content?.body ?? [], ast.module?.content?.body ?? []];
}

function codeParts(ast) {
  return [...scriptBodies(ast), ast.fragment ?? {}];
}

/** Both script blocks, static and dynamic imports, and re-exports. */
export function importedModules(ast) {
  return scriptBodies(ast).flatMap((body) => [
    ...importedModuleSpecifiers(body),
    ...lazilyImportedModules(body),
  ]);
}

export function importsModule(ast, specifier) {
  return importedModules(ast).includes(specifier);
}

export function declaredConstant(ast, name) {
  return codeParts(ast).some((part) => declaresConstant(part, name));
}

export function referencesIdentifier(ast, name) {
  return codeParts(ast).some((part) => namesIdentifier(part, name));
}

export function spelledLiterals(ast) {
  const found = [];
  for (const part of codeParts(ast)) {
    found.push(...literalStrings(part));
    for (const node of walkNodes(part)) {
      if (node.type === 'Text' && typeof node.data === 'string') found.push(node.data);
    }
  }
  return found;
}

/** A SUBSTRING match; for a whole i18n key ask `spellsLiteral`, which a neighbour cannot satisfy. */
export function containsLiteral(ast, text) {
  return spelledLiterals(ast).some((literal) => literal.includes(String(text)));
}

export function spellsLiteral(ast, text) {
  return spelledLiterals(ast).includes(String(text));
}

const GLOBAL_HOSTS = Object.freeze(new Set(['globalThis', 'window', 'self']));

function memberName(node) {
  if (!node.computed) return node.property?.type === 'Identifier' ? node.property.name : undefined;
  return node.property?.type === 'Literal' && typeof node.property.value === 'string'
    ? node.property.value
    : undefined;
}

/**
 * Both legs are required: a free reference (`game.user`) and a member read off a free host
 * (`globalThis.game.user`). Scope resolution is what denies a local `const game` and an `obj.game`.
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
