/**
 * Structural questions about a Svelte component, answered from its AST rather than its text
 * (issues 1658, 1691), pinned by `tests/svelte-structure-contract.test.js`.
 * Do not add a string `includes` on component source to a test. That is the shape
 * `tests/source-pin-ratchet.test.js` bounds; the residue is exact JS expression text, and a
 * receiver that is a loop variable rather than a literal.
 */
import { parse } from 'svelte/compiler';
import { parseForESLint } from 'svelte-eslint-parser';

import {
  calledName,
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

/** The other vocabulary: the scope-resolved parse `parseComponent` does not produce. */
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

function componentOccurrences(ast, componentName) {
  return collect(ast, (node) => node.type === 'Component' && node.name === componentName);
}

/** False when the component is not rendered, so a vacuous true cannot read as a contract. */
export function passesProp(ast, componentName, propName) {
  const occurrences = componentOccurrences(ast, componentName);
  if (occurrences.length === 0) return false;
  return occurrences.every((node) => declaresAttribute(node, propName));
}

/** "No occurrence declares it", which negating `passesProp` would weaken to "not every one does". */
export function propNone(ast, componentName, propName) {
  const occurrences = componentOccurrences(ast, componentName);
  return occurrences.length > 0 && occurrences.every((node) => !declaresAttribute(node, propName));
}

/** Every attribute, prop or directive name the template writes anywhere. */
export function attributeNames(ast) {
  const names = new Set();
  for (const node of collect(ast, () => true)) {
    for (const attribute of node.attributes ?? []) if (attribute.name) names.add(attribute.name);
  }
  return names;
}

/** The static value one element or component gives an attribute, or `undefined`. */
export function attributeValue(element, name) {
  const attribute = attributeNamed(element, name);
  const [chunk] = Array.isArray(attribute?.value) ? attribute.value : [];
  return chunk?.type === 'Text' ? chunk.data : undefined;
}

/** The expression one element gives a `{…}` attribute, or `undefined` for a static one. */
export function attributeExpression(element, name) {
  const attribute = (element.attributes ?? []).find(
    (candidate) => candidate.type === 'Attribute' && candidate.name === name
  );
  return attribute?.value?.type === 'ExpressionTag' ? attribute.value.expression : undefined;
}

/** Every `bind:` target a template declares, which is how a component reaches its own node. */
export function boundDirectives(ast) {
  const names = new Set();
  for (const node of collect(ast, () => true)) {
    for (const attribute of node.attributes ?? []) {
      if (attribute.type === 'BindDirective' && attribute.name) names.add(attribute.name);
    }
  }
  return names;
}

/** The props a component destructures from `$props()`, and those it declares with no default. */
export function declaredProps(ast) {
  const declared = new Set();
  const required = new Set();
  for (const node of walkNodes(ast)) {
    if (node.type !== 'VariableDeclarator' || calledName(node.init) !== '$props') continue;
    for (const property of node.id?.properties ?? []) {
      const name = property.key?.name ?? property.value?.left?.name ?? property.value?.name;
      if (!name) continue;
      declared.add(name);
      if (property.value?.type !== 'AssignmentPattern') required.add(name);
    }
  }
  return { declared, required };
}

export function declaresProp(ast, name) {
  return declaredProps(ast).declared.has(name);
}

/** Declared with no default, so an unthreaded caller fails loudly rather than taking a fallback. */
export function requiresProp(ast, name) {
  return declaredProps(ast).required.has(name);
}

/** The literal default one component declares for a prop, which is where a class stem is stated. */
export function propDefault(ast, name) {
  for (const node of walkNodes(ast)) {
    if (node.type !== 'VariableDeclarator' || calledName(node.init) !== '$props') continue;
    for (const property of node.id?.properties ?? []) {
      if (property.key?.name !== name || property.value?.right?.type !== 'Literal') continue;
      return property.value.right.value;
    }
  }
  return undefined;
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

/** A substring match; for a whole i18n key ask `spellsLiteral`, which a neighbour cannot satisfy. */
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

/** Both legs, scope-resolved so a local `const game` and an `obj.game` are denied: a free
 * reference (`game.user`), and a member read off a free host (`globalThis.game.user`). */
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

const BLOCK_TYPES = Object.freeze(
  new Set(['EachBlock', 'IfBlock', 'KeyBlock', 'AwaitBlock', 'SnippetBlock'])
);

/** Components, raw elements and blocks in one `start`-sorted list, so order can cross kinds. */
function orderedTemplateNodes(ast) {
  const nodes = [];
  for (const node of walkNodes(ast.fragment ?? ast)) {
    const kind = node.type;
    if (kind === 'Component' || kind === 'RegularElement' || kind === 'SvelteElement') {
      nodes.push(node);
    } else if (BLOCK_TYPES.has(kind)) {
      nodes.push(node);
    }
  }
  return nodes.sort((left, right) => left.start - right.start);
}

function classTokens(node) {
  return String(attributeValue(node, 'class') ?? '').split(/\s+/).filter(Boolean);
}

/** A node address: a component name, a tag name, a block type, `{ class }` or `{ attribute }`. */
function matchesTemplateToken(node, token) {
  if (typeof token === 'string') {
    if (node.type === 'Component') return node.name === token;
    if (node.type === 'RegularElement') return node.name.toLowerCase() === token.toLowerCase();
    return node.type === token;
  }
  if (token.class !== undefined) return classTokens(node).includes(token.class);
  const [name, value] = token.attribute ?? [];
  if (value === undefined) return Boolean(attributeNamed(node, name));
  return attributeValue(node, name) === value;
}

/** Whether the first node `before` addresses is drawn earlier than the first `after` addresses. */
export function rendersBefore(ast, [before, after]) {
  const nodes = orderedTemplateNodes(ast);
  const left = nodes.findIndex((node) => matchesTemplateToken(node, before));
  const right = nodes.findIndex((node) => matchesTemplateToken(node, after));
  return left !== -1 && right !== -1 && left < right;
}

function* rulesIn(children) {
  for (const node of children ?? []) {
    if (node.type === 'Rule') {
      yield node;
      yield* rulesIn(node.block?.children);
    } else if (node.type === 'Atrule') {
      yield* rulesIn(node.block?.children);
    }
  }
}

/** Every rule a component's own `<style>` states, inside an at-rule block as well as beside one. */
export function styleRules(ast) {
  return [...rulesIn(ast.css?.children)];
}

const unquoted = (value) => String(value ?? '').replace(/^['"]|['"]$/g, '');

function matchesSelectorToken(selectors, token) {
  if (typeof token === 'string') {
    return selectors.some((node) => node.type === 'ClassSelector' && node.name === token);
  }
  if (token.attribute) {
    const [name, value] = token.attribute;
    return selectors.some(
      (node) =>
        node.type === 'AttributeSelector' &&
        node.name === name &&
        (value === undefined || unquoted(node.value) === value)
    );
  }
  return selectors.some(
    (node) =>
      node.type === 'PseudoClassSelector' &&
      node.name === 'global' &&
      (node.args?.children ?? []).some((complex) => matchesChain(complex, chainOf(token.global)))
  );
}

const chainOf = (spec) => (Array.isArray(spec) ? spec : [spec]);
const stepTokens = (step) => (Array.isArray(step) ? step : [step]);

function matchesChain(complex, chain) {
  const steps = complex.children ?? [];
  if (steps.length !== chain.length) return false;
  return chain.every((step, index) =>
    stepTokens(step).every((token) => matchesSelectorToken(steps[index].selectors ?? [], token))
  );
}

/**
 * The one rule a structured selector names. The modern CSS AST carries no selector text, so a spec
 * is a descendant chain of steps — a class token, `{ attribute: [name, value] }`, `{ global: spec }`,
 * or an array of those for a compound. Throws when nothing matches, so an absent rule cannot pass.
 */
export function styleRule(ast, spec) {
  const chain = chainOf(spec);
  for (const rule of styleRules(ast)) {
    if ((rule.prelude?.children ?? []).some((complex) => matchesChain(complex, chain))) return rule;
  }
  throw new Error(`no scoped rule for ${JSON.stringify(chain)}`);
}

/** Whether that rule declares `property`, with exactly `value` when one is given. */
export function styleDeclares(ast, [spec, property, value]) {
  const declared = (styleRule(ast, spec).block?.children ?? []).filter(
    (node) => node.type === 'Declaration' && node.property === property
  );
  if (declared.length === 0) return false;
  return value === undefined || declared.some((node) => node.value === value);
}
