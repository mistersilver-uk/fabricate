/**
 * The rules of the shared-primitive API convention gate (issue 1507), stated over sources handed
 * in, so the gate and its mutation controls run the same code. The convention's wording is the
 * five-rules block of `openspec/specs/design-system/library.html`; this rules on prop names only.
 */
/*
 * Known limits. A key is read by its literal name, so a computed key, or a key retired or
 * misspelled for one primitive only, passes. Rest-after-`class` matches the attribute's name, so
 * a fixed `class="x"` before the spread passes. What a spread carries is not read. A primitive
 * reached through a barrel, an alias, a member tag, `<svelte:component>` or a dynamic import is
 * not read as a primitive tag. Nothing under `tests/` is scanned.
 */
import path from 'node:path';

import { parse } from 'svelte/compiler';

import { walkNodes } from './moduleAst.js';
import { lineOf } from './svelteTemplateScan.js';

/** The directory whose components the convention binds. */
export const COMPONENTS_DIR = 'src/ui/svelte/components';

/** Every retired spelling. No primitive declares one and no caller or props object passes one. */
export const BANNED_NAMES = Object.freeze([
  'dataAttr',
  'dataValue',
  'stateDataAttr',
  'stateDataValue',
  'dataGroup',
  'testId',
  'inputAttrs',
  'rootAttributes',
  'searchFieldAttributes',
  'triggerData',
  'buttonTitle',
  'groupLabel',
  'menuAriaLabel',
  'menuLabel',
  'triggerAriaLabel',
  'triggerAriaLabelledBy',
  'triggerAriaDescribedBy',
  'dialogAriaLabel',
  'dialogAriaLabelledBy',
  'searchAriaLabel',
  'labelledBy',
  'describedBy',
  'onInput',
  'subAttr',
  'toggleAttr',
  'unlinkAttr',
  'hookAttribute',
  'containerAttribute',
  'badgeAttribute',
  'countAttribute',
  'dotAttribute',
]);

/** Names a declaration may carry only through the exceptions register. */
export const REGISTER_ONLY_NAMES = Object.freeze(['compact', 'onChoose']);

/** A spelling retired on one primitive that stays the convention's own word on others. */
export const RETIRED_BY_COMPONENT = Object.freeze({
  ActionMenu: Object.freeze(['triggerLabel']),
  FillBar: Object.freeze(['size']),
  Pagination: Object.freeze(['label']),
  RowDisclosure: Object.freeze(['label']),
  SelectionCheckbox: Object.freeze(['size']),
});

/** `DataAttr` is the one conforming name that ends in a banned suffix. */
export const BANNED_SUFFIXES = Object.freeze([
  Object.freeze({ suffix: 'Attr', unless: 'DataAttr' }),
  Object.freeze({ suffix: 'Attrs' }),
  Object.freeze({ suffix: 'Attribute' }),
  Object.freeze({ suffix: 'Attributes' }),
  Object.freeze({ suffix: 'Data' }),
  Object.freeze({ suffix: 'AriaLabel' }),
]);

/** The name the register and a report use for the rest-spread rules. */
export const REST = '...rest';

/** Lowercase attributes a caller may hand a rest-spreading primitive besides `data-*`/`aria-*`. */
export const REST_HTML_ATTRIBUTES = Object.freeze([
  'disabled',
  'draggable',
  'for',
  'form',
  'id',
  'name',
  'role',
  'style',
  'tabindex',
  'title',
  'type',
  'value',
]);

/** Primitives whose contract refuses `class` and `style`: their rest takes `data-*` alone. */
export const HOOK_ONLY_PRIMITIVES = Object.freeze(['Kicker', 'Notice', 'StatBox']);

/** An attribute a primitive writes from a declared prop; a caller passes it by that prop. */
export const NAMING_ATTRIBUTES = Object.freeze({
  'aria-label': 'ariaLabel',
  'aria-labelledby': 'ariaLabelledBy',
  'aria-describedby': 'ariaDescribedBy',
});

/** The ratchet id of one spread a caller writes onto a primitive's tag. */
export const CALLER_SPREAD = 'spread onto a primitive tag';

const ELEMENT_TYPES = new Set(['RegularElement', 'SvelteElement', 'Component']);

/** One template as `{ file, source, ast }`, the shape `templatesOf` hands back for the tree. */
export function templateOf(file, source) {
  try {
    return { file, source, ast: parse(source, { modern: true }) };
  } catch (error) {
    throw new Error(`${file} failed to parse: ${error.message}`, { cause: error });
  }
}

function scriptBodies(ast) {
  return [ast.module, ast.instance].flatMap((script) => script?.content?.body ?? []);
}

function propsPattern(file, ast) {
  for (const node of ast.instance?.content?.body ?? []) {
    if (node.type !== 'VariableDeclaration') continue;
    for (const declarator of node.declarations) {
      const init = declarator.init;
      if (init?.type !== 'CallExpression' || init.callee?.name !== '$props') continue;
      if (declarator.id.type === 'ObjectPattern') return declarator.id;
      throw new Error(`${file} reads \`$props()\` without destructuring it, so it names no prop`);
    }
  }
  throw new Error(`${file} declares no \`$props()\` destructure for the gate to read`);
}

const keyName = (property) => property.key?.name ?? property.key?.value;

function localName(property) {
  const value = property.value;
  return value?.type === 'AssignmentPattern' ? value.left?.name : value?.name;
}

/** Whether `node` reads one of `names`, ignoring object keys and member names. */
function reads(node, names) {
  const skipped = new Set();
  for (const inner of walkNodes(node)) {
    if (inner.type === 'Property' && !inner.computed && !inner.shorthand) skipped.add(inner.key);
    if (inner.type === 'MemberExpression' && !inner.computed) skipped.add(inner.property);
    if (inner.type === 'Identifier' && names.has(inner.name) && !skipped.has(inner)) return true;
  }
  return false;
}

/** Every binding the instance script derives from `seed`, `seed` included. */
function derivedFrom(ast, seed) {
  const names = new Set([seed]);
  const script = ast.instance?.content;
  for (let grew = true; grew; ) {
    grew = false;
    for (const node of walkNodes(script)) {
      const bound =
        node.type === 'VariableDeclarator' && node.id?.type === 'Identifier'
          ? [node.id.name, node.init]
          : node.type === 'FunctionDeclaration'
            ? [node.id?.name, node.body]
            : null;
      if (!bound?.[0] || names.has(bound[0]) || !reads(bound[1], names)) continue;
      names.add(bound[0]);
      grew = true;
    }
  }
  return names;
}

function reachesAriaLabel(ast, local) {
  const names = derivedFrom(ast, local);
  for (const node of walkNodes(ast)) {
    const isSink =
      (node.type === 'Attribute' && (node.name === 'aria-label' || node.name === 'ariaLabel')) ||
      (node.type === 'Property' && !node.computed && keyName(node) === 'aria-label');
    if (isSink && reads(node.value, names)) return true;
  }
  return false;
}

function rootElements(fragment, found = []) {
  for (const node of fragment?.nodes ?? []) {
    if (ELEMENT_TYPES.has(node.type)) found.push(node);
    if (node.type !== 'IfBlock') continue;
    rootElements(node.consequent, found);
    rootElements(node.alternate, found);
  }
  return found;
}

function restFaults(ast, declaration) {
  if (!new Set(declaration.names).has('class')) {
    return ['declares a rest spread and no `class` prop'];
  }
  const roots = new Set(rootElements(ast.fragment));
  const faults = [];
  let sites = 0;
  for (const node of walkNodes(ast.fragment)) {
    if (!ELEMENT_TYPES.has(node.type)) continue;
    const at = node.attributes.findIndex(
      (attribute) =>
        attribute.type === 'SpreadAttribute' && attribute.expression?.name === declaration.rest
    );
    if (at === -1) continue;
    sites += 1;
    const classAt = node.attributes.findIndex((attribute) => attribute.name === 'class');
    if (!roots.has(node)) faults.push(`spreads its rest on <${node.name}>, which is not the root`);
    else if (classAt === -1 || classAt > at) faults.push('spreads its rest before `class`');
  }
  if (sites === 0) faults.push('declares a rest spread it writes on no element');
  return faults;
}

/**
 * One primitive's declaration, read from its parsed template: its public prop names in source
 * order, its rest binding and the tree. Throws, naming the file, when it destructures no
 * `$props()`.
 */
export function readDeclaration({ file, ast }) {
  const names = [];
  let rest = null;
  let ariaLabelLocal = null;
  for (const property of propsPattern(file, ast).properties) {
    if (property.type === 'RestElement') {
      rest = property.argument.name;
      continue;
    }
    const name = keyName(property);
    if (typeof name !== 'string') throw new Error(`${file} declares a prop with a computed name`);
    names.push(name);
    if (name === 'ariaLabel') ariaLabelLocal = localName(property);
  }
  return {
    file,
    component: path.posix.basename(file, '.svelte'),
    names,
    rest,
    ariaLabelLocal,
    ast,
  };
}

function nameFaults(component, name) {
  const faults = [];
  if (BANNED_NAMES.includes(name)) faults.push('is a retired spelling');
  if (RETIRED_BY_COMPONENT[component]?.includes(name)) faults.push('is retired on this primitive');
  if (REGISTER_ONLY_NAMES.includes(name)) faults.push('is allowed only through the register');
  for (const { suffix, unless } of BANNED_SUFFIXES) {
    if (name.endsWith(suffix) && !(unless && name.endsWith(unless))) {
      faults.push(`ends in the banned suffix \`${suffix}\``);
    }
  }
  return faults;
}

/** Every rule a declaration breaks, as `{ component, name, fault }`. */
export function declarationViolations(declaration) {
  const { component, names, rest, ariaLabelLocal, ast } = declaration;
  const found = [];
  for (const name of names) {
    for (const fault of nameFaults(component, name)) found.push({ component, name, fault });
  }
  if (rest) {
    for (const fault of restFaults(ast, declaration)) found.push({ component, name: REST, fault });
  }
  if (ariaLabelLocal && !reachesAriaLabel(ast, ariaLabelLocal)) {
    found.push({ component, name: 'ariaLabel', fault: 'never reaches an `aria-label`' });
  }
  return found;
}

/**
 * Split violations by the register: those no entry excuses, entries that excuse nothing, and
 * entries with no stated reason. An entry excuses the one `fault` it names, on its `component`
 * and `name`.
 */
export function applyRegister(violations, exceptions) {
  const used = new Set();
  const unexcused = violations.filter((violation) => {
    const entry = exceptions.find(
      (held) =>
        held.component === violation.component &&
        held.name === violation.name &&
        held.fault === violation.fault
    );
    if (entry) used.add(entry);
    return !entry;
  });
  return {
    unexcused,
    stale: exceptions.filter((entry) => !used.has(entry)),
    unreasoned: exceptions.filter((entry) => String(entry.reason ?? '').trim().length < 20),
  };
}

/** The primitives a template imports, by local name. Throws on any form but a default import. */
function importedPrimitives(file, ast) {
  const found = new Map();
  for (const node of scriptBodies(ast)) {
    if (node.type !== 'ImportDeclaration' || !String(node.source.value).startsWith('.')) continue;
    const target = path.posix.join(path.posix.dirname(file), node.source.value);
    if (path.posix.dirname(target) !== COMPONENTS_DIR || !target.endsWith('.svelte')) continue;
    for (const specifier of node.specifiers) {
      if (specifier.type !== 'ImportDefaultSpecifier') {
        throw new Error(
          `${file} imports ${node.source.value} by a form other than its default, so the gate ` +
            'cannot tell which tags are that primitive'
        );
      }
      found.set(specifier.local.name, path.posix.basename(target, '.svelte'));
    }
  }
  return found;
}

function restAllows(component, name) {
  if (HOOK_ONLY_PRIMITIVES.includes(component)) return /^data-[a-z0-9-]+$/u.test(name);
  return (
    /^(?:data|aria)-[a-z0-9-]+$/u.test(name) ||
    /^on[a-z]+$/u.test(name) ||
    REST_HTML_ATTRIBUTES.includes(name)
  );
}

function attributeFault(attribute, component, declaration) {
  if (attribute.type !== 'Attribute' && attribute.type !== 'BindDirective') {
    return `a ${attribute.type}, which the gate cannot read as a prop`;
  }
  const { name } = attribute;
  if (attribute.type === 'BindDirective' && name === 'this') return null;
  if (declaration.names.includes(name)) return null;
  if (BANNED_NAMES.includes(name) || RETIRED_BY_COMPONENT[component]?.includes(name)) {
    return `\`${name}\`, a retired spelling`;
  }
  const prop = NAMING_ATTRIBUTES[name];
  if (prop && declaration.names.includes(prop)) {
    return `\`${name}\`, which the primitive takes as \`${prop}\``;
  }
  if (declaration.rest && attribute.type === 'Attribute' && restAllows(component, name)) {
    return null;
  }
  return `\`${name}\`, which the primitive does not declare`;
}

/** The props a tag's child content passes: each named snippet, and `children` for the rest. */
function contentProps(node) {
  const names = new Set();
  for (const child of node.fragment?.nodes ?? []) {
    if (child.type === 'SnippetBlock') names.add(child.expression.name);
    else if (child.type !== 'Comment' && !(child.type === 'Text' && child.data.trim() === '')) {
      names.add('children');
    }
  }
  return [...names];
}

/** Every tag in one template that renders an imported primitive, as `{ node, component }`. */
function primitiveTags({ file, ast }) {
  const imported = importedPrimitives(file, ast);
  const found = [];
  if (imported.size === 0) return found;
  for (const node of walkNodes(ast.fragment)) {
    if (node.type !== 'Component' || !imported.has(node.name)) continue;
    found.push({ node, component: imported.get(node.name) });
  }
  return found;
}

/**
 * Every spread one template writes onto a primitive's tag, as a ratchet site at the tag's own
 * line, where a `ratchet-exempt` marker above the tag excuses it.
 */
export function callerSpreadSites(template) {
  return primitiveTags(template).flatMap(({ node }) =>
    node.attributes
      .filter((attribute) => attribute.type === 'SpreadAttribute')
      .map(() => ({
        file: template.file,
        line: lineOf(template.source, node.start),
        id: CALLER_SPREAD,
      }))
  );
}

/**
 * What one template passes to the primitives it imports: every attribute a primitive does not
 * take, as `{ file, line, component, fault }`, and how many primitive tags it read.
 * `declarations` maps a primitive's name to its `readDeclaration`.
 */
export function callerReport(template, declarations) {
  const { file, source } = template;
  const violations = [];
  const tags = primitiveTags(template);
  for (const { node, component } of tags) {
    const declaration = declarations.get(component);
    if (!declaration) throw new Error(`${file} imports ${component}, which the gate did not read`);
    for (const attribute of node.attributes) {
      if (attribute.type === 'SpreadAttribute') continue;
      const fault = attributeFault(attribute, component, declaration);
      if (fault) violations.push({ file, line: lineOf(source, attribute.start), component, fault });
    }
    for (const name of contentProps(node)) {
      if (declaration.names.includes(name)) continue;
      const fault = `\`${name}\` content, which the primitive does not declare`;
      violations.push({ file, line: lineOf(source, node.start), component, fault });
    }
  }
  return { violations, tags: tags.length };
}

/** Every banned key an object literal in one parsed module or template writes. */
export function bannedKeys(file, ast) {
  const found = [];
  for (const node of walkNodes(ast)) {
    if (node.type !== 'ObjectExpression') continue;
    for (const property of node.properties) {
      if (property.type !== 'Property' || property.computed) continue;
      const name = keyName(property);
      if (BANNED_NAMES.includes(name)) found.push({ file, line: property.loc.start.line, name });
    }
  }
  return found;
}
