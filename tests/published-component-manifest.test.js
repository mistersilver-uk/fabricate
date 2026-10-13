/**
 * The published component manifest (issue 2426) against each component's parsed declaration: its
 * props, rest, root and each key's kind, then its import closure of `.svelte` and `.js` files: a
 * stylesheet and template that need no ancestor above the entry's root, no read of a Foundry
 * global, no class the module sheet names under an `any` root, and focusable elements marked as
 * admission rule 9 asks; then the module sheet's selectors that name the published `Chip`'s root
 * class (issue 2451). The test-only probe runs beside the shipped entries; the adapter's bindings
 * are the mounted suite's.
 * Limit: it reads scoped `<style>` declarations, not inline `style=` values.
 * Limit: rule 9 does not see a `svelte:element` tag, or an attribute a spread writes.
 * Limit: sheet reach does not see a class composed across an interpolation, a class a published
 * `data` value writes (`icon` on `Medallion`, `StatBox` and `InfoStrip`), or an unprefixed state
 * class.
 * Limit: `readsGlobal` sees a free reference or a member of a free host, not a destructure of one.
 * Limit: `renderedLocals` sees `{@render local()}` and `{@render local?.()}` on the prop's own
 * local, not a snippet forwarded to a child, read through an alias, or tested in `{#if}`; a
 * forwarded `text` or `slot` key fails closed and a forwarded `data` key is not seen.
 * Limit: the chip census reads the module sheet, not a component's `:global()` rule, and takes on
 * trust that no extension target sits under a `CHIP_LAYOUT_ANCESTORS` class.
 */
import assert from 'node:assert/strict';
import { posix } from 'node:path';
import { describe, it } from 'node:test';

import { stylesheetSources } from '../scripts/lib/stylesheetSource.js';
import { PUBLISHED_COMPONENT_MANIFEST } from '../src/ui/publishedComponentManifest.js';

import { PROBE_ENTRY } from './fixtures/published-components/probeEntry.js';
import { readDeclaration, templateOf } from './helpers/apiConvention.js';
import {
  importedModules,
  lazilyImportedModules,
  parseModule,
  walkNodes,
} from './helpers/moduleAst.js';
import { componentAstOf, componentScopeOf, moduleAstOf } from './helpers/parsedSource.js';
import { parseComponentScope, readsGlobal } from './helpers/svelteStructureContract.js';

const byName = (a, b) => a.localeCompare(b);

const APP_ROOTS = new Set(['fabricate', 'fabricate-app', 'fabricate-manager']);
const APP_TOKENS = ['var(--fab-manager-'];
/** What a `fabricate` entry is still refused: the Manager root's own class and tokens. */
const MANAGER_ROOTS = new Set(['fabricate-manager']);
const MANAGER_RULES = new Set(['app-root selector', ...APP_TOKENS]);
// A `--font-primary` read whose fallback ends in a literal resolves with no Foundry variable.
const LITERAL_GUARDED_FACE = /var\(\s*--font-primary\s*,\s*[^\s(),][^()]*\)/g;
const FOUNDRY_GLOBALS = [
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

/** The three parses the gate reads of a file: a component, its scopes, and a plain module. */
const SHIPPED = Object.freeze({
  component: componentAstOf,
  componentScope: componentScopeOf,
  module: moduleAstOf,
});

/** The same three parses over `sources`, a map of path to text. */
function syntheticReader(sources) {
  return {
    component: (file) => templateOf(file, sources[file]).ast,
    componentScope: (file) => parseComponentScope(sources[file]),
    module: (file) => parseModule(sources[file]),
  };
}

const isComponent = (file) => file.endsWith('.svelte');

/** Each `$props()` key with its local name and whether it is `$bindable`. */
function propLocals(ast) {
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

/** Every render tag beneath an `{#each}` or a `{#key}`, where one tag can hold several branches. */
function repeatedRenderTags(ast) {
  const repeated = new Set();
  for (const block of walkNodes(ast.fragment)) {
    if (block.type !== 'EachBlock' && block.type !== 'KeyBlock') continue;
    for (const node of walkNodes(block)) if (node.type === 'RenderTag') repeated.add(node);
  }
  return repeated;
}

/**
 * Every local a `{@render}` tag calls, with each call's argument count, whether it is `?.()`, and
 * whether an `{#each}` or `{#key}` holds it.
 */
function renderedLocals(ast) {
  const called = new Map();
  const repeated = repeatedRenderTags(ast);
  for (const node of walkNodes(ast.fragment)) {
    if (node.type !== 'RenderTag') continue;
    const call =
      node.expression.type === 'ChainExpression' ? node.expression.expression : node.expression;
    if (call.callee?.type !== 'Identifier') continue;
    const calls = called.get(call.callee.name) ?? [];
    calls.push({
      args: call.arguments.length,
      optional: call.optional === true,
      repeated: repeated.has(node),
    });
    called.set(call.callee.name, calls);
  }
  return called;
}

const SHIPPED_KINDS = new Set(['data', 'text', 'slot']);
const SLOT_ELEMENTS = new Set(['div', 'span']);

/** What a `text` key's render calls break: drawn at least once, bare, and `?.()` unless required. */
function textRenderFaults(key, spec, calls) {
  const faults = [];
  if (calls.length === 0) faults.push(`${key} is a text key no render tag draws`);
  if (calls.some((call) => call.args > 0)) {
    faults.push(`${key} is a text key rendered with an argument`);
  }
  if (spec.required !== true && calls.some((call) => !call.optional)) {
    faults.push(`${key} is an optional text key rendered without ?.`);
  }
  return faults;
}

/**
 * What a `slot` key's spec and render calls break: `{ kind, element? }` with a `<div>` or
 * `<span>` element, drawn by exactly one bare `?.()` render tag that no `{#each}` or `{#key}`
 * holds, so the one slot element is drawn once and never taken in turn.
 */
function slotFaults(key, spec, calls) {
  const faults = [];
  if (spec.required !== undefined) faults.push(`${key} is a slot key that states required`);
  if (spec.element !== undefined && !SLOT_ELEMENTS.has(spec.element)) {
    faults.push(`${key} is a slot key whose element is ${spec.element}`);
  }
  if (calls.length === 0) faults.push(`${key} is a slot key no render tag draws`);
  if (calls.length > 1) faults.push(`${key} is a slot key more than one render tag draws`);
  if (calls.some((call) => call.args > 0)) {
    faults.push(`${key} is a slot key rendered with an argument`);
  }
  if (calls.some((call) => !call.optional)) faults.push(`${key} is a slot key rendered without ?.`);
  if (calls.some((call) => call.repeated)) {
    faults.push(`${key} is a slot key rendered inside {#each} or {#key}`);
  }
  return faults;
}

/**
 * Each rule an entry's published keys break against the component's parsed declaration, as
 * `<key> <rule>`. An unpublished prop is not judged: it may be `$bindable` or rendered either way.
 */
function declarationFaults(entry, ast) {
  const declared = new Map(propLocals(ast).map((prop) => [prop.key, prop]));
  const rendered = renderedLocals(ast);
  return Object.entries(entry.props).flatMap(([key, spec]) => {
    const prop = declared.get(key);
    if (!prop) return [`${key} is not a declared prop`];
    const faults = [];
    if (!SHIPPED_KINDS.has(spec.kind)) faults.push(`${key} has the unshipped kind ${spec.kind}`);
    if (spec.required !== undefined && typeof spec.required !== 'boolean') {
      faults.push(`${key} is required by something other than a boolean`);
    }
    if (prop.bindable) faults.push(`${key} is $bindable`);
    const calls = rendered.get(prop.local) ?? [];
    if (spec.kind === 'text') faults.push(...textRenderFaults(key, spec, calls));
    if (spec.kind === 'slot') faults.push(...slotFaults(key, spec, calls));
    if (spec.kind !== 'slot' && spec.element !== undefined) {
      faults.push(`${key} states element, which only a slot key takes`);
    }
    if (spec.kind === 'data' && calls.length > 0) {
      faults.push(`${key} is a data key rendered as a snippet`);
    }
    return faults;
  });
}

const CHIP_ROOT = 'manager-chip';
/** The classes `tone` and `density` can write beside the root class, private values included. */
const PUBLISHED_CHIP_CLASSES = new Set([
  'is-positive',
  'is-warning',
  'is-danger',
  'is-info',
  'is-neutral',
  'is-accent',
  'is-active',
  'is-disabled',
  'is-negative',
  'is-muted',
  'is-tag',
  'is-secondary',
  'is-subtle',
  'is-list',
  'is-row',
  'is-action',
  'is-tag-run',
  'is-inspector',
  'is-header',
]);
/** The manager layout classes a sheet rule reaches a chip under; no extension target sits in one. */
const CHIP_LAYOUT_ANCESTORS = new Set([
  'manager-tools-authority-heading',
  'manager-recipe-steps-requirements',
  'manager-recipe-name-row',
  'manager-vocabulary-row',
  'manager-component-tag-run',
]);

const classesOf = (compound) =>
  compound.selectors.filter((part) => part.type === 'ClassSelector').map((part) => part.name);

/**
 * Whether no element a published `Chip` draws can match `complex`: its chip compound takes a class
 * the published keys cannot write or `:disabled`, a later compound needs a classed descendant (the
 * chip draws none), or an earlier one is a pinned layout ancestor. Anything else fails closed.
 */
function cannotMatchPublishedChip(complex) {
  const compounds = complex.children;
  const at = compounds.findLastIndex((compound) => classesOf(compound).includes(CHIP_ROOT));
  if (at === -1) return false;
  const chip = compounds[at];
  const unwritable = classesOf(chip).some(
    (name) => name !== CHIP_ROOT && !PUBLISHED_CHIP_CLASSES.has(name)
  );
  const disabled = chip.selectors.some(
    (part) => part.type === 'PseudoClassSelector' && part.name === 'disabled'
  );
  const classedChild = compounds.slice(at + 1).some((compound) => classesOf(compound).length > 0);
  const layoutAncestor = compounds
    .slice(0, at)
    .some((compound) => classesOf(compound).some((name) => CHIP_LAYOUT_ANCESTORS.has(name)));
  return unwritable || disabled || classedChild || layoutAncestor;
}

/** Every selector in one sheet that names the chip root, as `{ selector, safe }`. */
function chipSelectors(file, css) {
  const { source, ast } = templateOf(file, `<style>${css}</style>`);
  const found = [];
  for (const node of walkNodes(ast.css)) {
    if (node.type !== 'Rule') continue;
    for (const complex of node.prelude.children) {
      const names = [...walkNodes(complex)].some(
        (part) => part.type === 'ClassSelector' && part.name === CHIP_ROOT
      );
      if (!names) continue;
      const selector = source.slice(complex.start, complex.end);
      found.push({ selector: `${file}: ${selector}`, safe: cannotMatchPublishedChip(complex) });
    }
  }
  return found;
}

const unsafeChipSelectors = (file, css) =>
  chipSelectors(file, css)
    .filter(({ safe }) => !safe)
    .map(({ selector }) => selector);

/**
 * What a component's own stylesheet and template borrow from above the entry's `root`, by rule:
 * every rule at `any`, the Manager root's selector and tokens at `fabricate`, none at `manager`.
 */
function ancestorDependencies(ast, root = 'any') {
  if (root === 'manager') return [];
  const windowed = root === 'fabricate';
  const refused = windowed ? MANAGER_ROOTS : APP_ROOTS;
  const found = new Set();
  for (const node of walkNodes(ast.css)) {
    if (node.type === 'ClassSelector' && refused.has(node.name)) found.add('app-root selector');
    if (node.type === 'Atrule' && node.name === 'container') found.add('@container');
    if (node.type !== 'Declaration') continue;
    for (const token of APP_TOKENS) if (node.value.includes(token)) found.add(token);
    if (node.value.replaceAll(LITERAL_GUARDED_FACE, '').includes('--font-primary')) {
      found.add('unguarded var(--font-primary)');
    }
  }
  for (const node of walkNodes(ast.fragment)) {
    if (classNames(node).includes('visually-hidden')) found.add('.visually-hidden');
  }
  return [...found].filter((rule) => !windowed || MANAGER_RULES.has(rule)).sort(byName);
}

/**
 * The file at `path` and every relative `.svelte` or `.js` file it reaches by `import`,
 * `export … from`, `export * from` or a literal `import()`, so a re-export-only barrel is walked.
 */
function importClosure(path, reader, seen = new Set()) {
  if (seen.has(path)) return seen;
  seen.add(path);
  const ast = isComponent(path) ? reader.component(path) : reader.module(path).ast;
  for (const specifier of [...importedModules(ast), ...lazilyImportedModules(ast)]) {
    if (!specifier.startsWith('.') || !/\.(?:svelte|js)$/.test(specifier)) continue;
    importClosure(posix.join(posix.dirname(path), specifier), reader, seen);
  }
  return seen;
}

/** Each Foundry global one file reads, as `reads <name>`; a local binding of the name is no read. */
function foundryReads(file, reader) {
  const scope = isComponent(file) ? reader.componentScope(file) : reader.module(file);
  return FOUNDRY_GLOBALS.filter((name) => readsGlobal(scope, name)).map((name) => `reads ${name}`);
}

/** Each ancestor dependency and Foundry read in an entry's closure, as `<file>: <rule>`. */
function closureDependencies(path, reader = SHIPPED, root = 'any') {
  return [...importClosure(path, reader)].flatMap((file) =>
    [
      ...(isComponent(file) ? ancestorDependencies(reader.component(file), root) : []),
      ...foundryReads(file, reader),
    ].map((rule) => `${file}: ${rule}`)
  );
}

/** The static class names one template node writes, by attribute or directive. */
function classNames(node) {
  if (node.type === 'ClassDirective') return [node.name];
  if (node.type !== 'Attribute' || node.name !== 'class' || !Array.isArray(node.value)) return [];
  return node.value.flatMap((part) => (part.type === 'Text' ? part.data.split(/\s+/) : []));
}

const SHEET_PREFIXES = ['fab-', 'fabricate-', 'manager-'];

/** Every class name a module sheet selector names. */
function sheetClassNames() {
  const names = new Set();
  for (const { file, text } of stylesheetSources().parts) {
    const { ast } = templateOf(file, `<style>${text}</style>`);
    for (const node of walkNodes(ast.css)) if (node.type === 'ClassSelector') names.add(node.name);
  }
  return names;
}

/**
 * Every string one closure file spells where a class may be written: each string literal and
 * template-literal chunk of its scripts and template expressions, its class attribute text and its
 * `class:` directive names.
 */
function spelledStrings(file, reader) {
  const component = isComponent(file) ? reader.component(file) : null;
  const roots = component
    ? [component.module, component.instance, component.fragment]
    : [reader.module(file).ast];
  const strings = [];
  for (const node of roots.flatMap((root) => [...walkNodes(root)])) {
    if (node.type === 'Literal' && typeof node.value === 'string') strings.push(node.value);
    if (node.type === 'TemplateElement') strings.push(node.value.cooked ?? node.value.raw);
    strings.push(...classNames(node));
  }
  return strings;
}

/**
 * Sheet reach: each `fab-`, `fabricate-` or `manager-` class token an `any` entry's closure
 * spells that a selector in `sheet` names, as `<file>: <token>`. Another root is not judged.
 */
function sheetReach({ path, root }, sheet, reader = SHIPPED) {
  if (root !== 'any') return [];
  return [...importClosure(path, reader)].flatMap((file) => {
    const tokens = spelledStrings(file, reader).flatMap((text) => text.split(/\s+/));
    return [...new Set(tokens)]
      .filter((token) => SHEET_PREFIXES.some((prefix) => token.startsWith(prefix)))
      .filter((token) => sheet.has(token))
      .sort(byName)
      .map((token) => `${file}: ${token}`);
  });
}

/** The sheet-named tokens the shipped `any` closures spell, each kept off a published mount. */
const SHEET_REACH_PINS = Object.freeze([
  // On the remove control, which no published key draws.
  'src/ui/svelte/components/Chip.svelte: fab-hit-area',
  // The chip's root class, which the 18-selector census below holds.
  'src/ui/svelte/components/Chip.svelte: manager-chip',
]);

const FOCUSABLE_TAGS = new Set(['button', 'a']);
const FORM_CONTROLS = new Set(['button', 'input', 'select', 'textarea']);

const attributeOf = (element, name) =>
  element.attributes.find((attribute) => attribute.type === 'Attribute' && attribute.name === name);

/** An attribute's text when it is static, `''` when bare, else `undefined`. */
function staticText(attribute) {
  if (!attribute) return undefined;
  if (attribute.value === true) return '';
  const parts = [attribute.value].flat();
  if (parts.some((part) => part.type !== 'Text')) return undefined;
  return parts.map((part) => part.data).join('');
}

/**
 * Admission rule 9 over one closure file: a `button`, `a` or `[tabindex]` element states
 * `data-keyboard-focus="true"`, a `button` states `type="button"`, and no form control states
 * `name`. Answers each element it judged beside each fault, both as `<file>: <tag> …`.
 */
function focusableElements(file, ast) {
  const judged = [];
  const faults = [];
  for (const node of walkNodes(ast.fragment)) {
    if (node.type !== 'RegularElement') continue;
    const focusable = FOCUSABLE_TAGS.has(node.name) || Boolean(attributeOf(node, 'tabindex'));
    const control = FORM_CONTROLS.has(node.name);
    if (!focusable && !control) continue;
    const states = (name, value) => staticText(attributeOf(node, name)) === value;
    judged.push(`${file}: ${node.name}`);
    if (focusable && !states('data-keyboard-focus', 'true')) {
      faults.push(`${file}: ${node.name} does not state data-keyboard-focus="true"`);
    }
    if (node.name === 'button' && !states('type', 'button')) {
      faults.push(`${file}: button does not state type="button"`);
    }
    if (control && attributeOf(node, 'name')) faults.push(`${file}: ${node.name} states name`);
  }
  return { judged, faults };
}

/** Rule 9 over an entry's whole closure: every element judged, and every fault. */
function closureFocusables(path, reader = SHIPPED) {
  const scans = [...importClosure(path, reader)]
    .filter(isComponent)
    .map((file) => focusableElements(file, reader.component(file)));
  return {
    judged: scans.flatMap((scan) => scan.judged),
    faults: scans.flatMap((scan) => scan.faults),
  };
}

describe('the manifest', () => {
  it('is a frozen list of frozen entries with unique names', () => {
    assert.ok(Object.isFrozen(PUBLISHED_COMPONENT_MANIFEST));
    const names = PUBLISHED_COMPONENT_MANIFEST.map((entry) => entry.name);
    assert.equal(new Set(names).size, names.length);
    for (const entry of PUBLISHED_COMPONENT_MANIFEST) {
      assert.ok(Object.isFrozen(entry) && Object.isFrozen(entry.props), entry.name);
    }
  });
});

describe('each entry matches its component declaration', () => {
  for (const entry of [...PUBLISHED_COMPONENT_MANIFEST, PROBE_ENTRY]) {
    it(`${entry.name} publishes only declared props at a shipped kind, rest exactly when declared, and a root`, () => {
      const declaration = readDeclaration({ file: entry.path, ast: componentAstOf(entry.path) });
      assert.deepEqual(Object.keys(entry).sort(byName), [
        'name',
        'path',
        'props',
        'rest',
        'root',
        'version',
      ]);
      assert.ok(['any', 'fabricate', 'manager'].includes(entry.root), 'a shipped root');
      assert.ok(Number.isInteger(entry.version) && entry.version > 0, 'a positive version');
      assert.equal(entry.name, declaration.component);
      assert.equal(entry.rest, declaration.rest !== null, 'rest matches the rest declaration');
      assert.deepEqual(declarationFaults(entry, declaration.ast), []);
    });

    it(`${entry.name} needs no ancestor above its root and reads no Foundry global, closure included`, () => {
      assert.deepEqual(closureDependencies(entry.path, SHIPPED, entry.root), []);
    });

    it(`${entry.name} marks every focusable element it draws, and names no form control`, () => {
      assert.deepEqual(closureFocusables(entry.path).faults, []);
    });
  }

  it('judges one focusable element across the shipped closures, the Chip remove button', () => {
    const judged = [...PUBLISHED_COMPONENT_MANIFEST, PROBE_ENTRY].flatMap(
      (entry) => closureFocusables(entry.path).judged
    );
    assert.deepEqual([...new Set(judged)], ['src/ui/svelte/components/Chip.svelte: button']);
  });

  it('spells no sheet-named class in an any closure but the pinned Chip pair', () => {
    const sheet = sheetClassNames();
    assert.ok(sheet.has('fabricate-card') && sheet.size > 500, 'the module sheet was read');
    const reach = [...PUBLISHED_COMPONENT_MANIFEST, PROBE_ENTRY].flatMap((entry) =>
      sheetReach(entry, sheet)
    );
    assert.deepEqual([...new Set(reach)].sort(byName), [...SHEET_REACH_PINS]);
  });

  it('reads a snippet, a bindable and a rest prop from a declaration, so the gate can see them', () => {
    const { ast } = templateOf(
      'Synthetic.svelte',
      '<script>\n  let { body, value = $bindable(), ...rest } = $props();\n</script>\n{@render body?.()}'
    );
    assert.deepEqual(propLocals(ast), [
      { key: 'body', local: 'body', bindable: false },
      { key: 'value', local: 'value', bindable: true },
    ]);
    assert.deepEqual(
      [...renderedLocals(ast)],
      [['body', [{ args: 0, optional: true, repeated: false }]]]
    );
  });

  const SYNTHETIC = templateOf(
    'Synthetic.svelte',
    [
      '<script>',
      '  let { label, body, note, value = $bindable(), row, ...rest } = $props();',
      '</script>',
      '<p {...rest}>{label}{@render body()}{@render body?.()}{@render note?.()}</p>',
      '{@render row?.(label)}{@render row()}',
    ].join('\n')
  ).ast;
  const data = { kind: 'data' };
  const faultsOf = (props) => declarationFaults({ props }, SYNTHETIC);

  it('passes a synthetic entry whose keys each match their declaration and render tags', () => {
    const body = { kind: 'text', required: true };
    assert.deepEqual(faultsOf({ label: data, body, note: { kind: 'text' } }), []);
  });

  it('admits an unpublished prop that is $bindable, or rendered with and without an argument', () => {
    assert.deepEqual(faultsOf({ label: data }), []);
  });

  for (const [claim, props, faults] of [
    ['a published $bindable key', { value: data }, ['value is $bindable']],
    [
      'a text key no render tag draws',
      { label: { kind: 'text' } },
      ['label is a text key no render tag draws'],
    ],
    [
      'a text key rendered bare at one site and with an argument at another',
      {
        row: { kind: 'text', required: true },
      },
      ['row is a text key rendered with an argument'],
    ],
    [
      'an optional text key rendered without ?.',
      { body: { kind: 'text' } },
      ['body is an optional text key rendered without ?.'],
    ],
    ['a data key with a render tag', { note: data }, ['note is a data key rendered as a snippet']],
    ['a callback kind', { note: { kind: 'callback' } }, ['note has the unshipped kind callback']],
    [
      'element on a key that is no slot',
      { label: { kind: 'data', element: 'div' } },
      ['label states element, which only a slot key takes'],
    ],
    ['a key the component does not declare', { missing: data }, ['missing is not a declared prop']],
    [
      'a required that is not a boolean',
      { label: { kind: 'data', required: 'yes' } },
      ['label is required by something other than a boolean'],
    ],
  ]) {
    it(`names ${claim} as a fault`, () => {
      assert.deepEqual(faultsOf(props), faults);
    });
  }

  const SLOTTED = templateOf(
    'Slotted.svelte',
    [
      '<script>',
      '  let { clean, twice, bare, given, listed, keyed, unused } = $props();',
      '</script>',
      '<div>{@render clean?.()}{@render twice?.()}{@render twice?.()}{@render bare()}</div>',
      '{@render given?.(1)}',
      '{#each [1] as item (item)}<p>{@render listed?.()}</p>{/each}',
      '{#key clean}<p>{@render keyed?.()}</p>{/key}',
    ].join('\n')
  ).ast;
  const slot = { kind: 'slot' };
  const slotFaultsOf = (props) => declarationFaults({ props }, SLOTTED);

  it('passes a slot key one bare ?.() render tag draws, at either element', () => {
    assert.deepEqual(slotFaultsOf({ clean: slot }), []);
    for (const element of ['div', 'span']) {
      assert.deepEqual(slotFaultsOf({ clean: { kind: 'slot', element } }), []);
    }
  });

  for (const [claim, props, faults] of [
    ['no render tag draws', { unused: slot }, ['unused is a slot key no render tag draws']],
    [
      'two render tags draw',
      { twice: slot },
      ['twice is a slot key more than one render tag draws'],
    ],
    [
      'rendered with an argument',
      { given: slot },
      ['given is a slot key rendered with an argument'],
    ],
    ['rendered without ?.', { bare: slot }, ['bare is a slot key rendered without ?.']],
    [
      'rendered inside {#each}',
      { listed: slot },
      ['listed is a slot key rendered inside {#each} or {#key}'],
    ],
    [
      'rendered inside {#key}',
      { keyed: slot },
      ['keyed is a slot key rendered inside {#each} or {#key}'],
    ],
    [
      'that states required',
      { clean: { kind: 'slot', required: false } },
      ['clean is a slot key that states required'],
    ],
    [
      'whose element is a <p>',
      { clean: { kind: 'slot', element: 'p' } },
      ['clean is a slot key whose element is p'],
    ],
  ]) {
    it(`names a slot key ${claim} as a fault`, () => {
      assert.deepEqual(slotFaultsOf(props), faults);
    });
  }

  it('walks static component imports, so an offender only an imported file carries is named', () => {
    const sources = {
      'src/Entry.svelte':
        '<script>import Leaf from \'./parts/Leaf.svelte\';</script><Leaf /><span class="visually-hidden"></span>',
      'src/parts/Cycle.svelte': "<script>import Entry from '../Entry.svelte';</script><Entry />",
      'src/parts/Leaf.svelte':
        "<script module>import Deep from '../deep/Deep.svelte';</script><script>import Cycle from './Cycle.svelte';</script><Deep /><Cycle />",
      'src/deep/Deep.svelte': '<style>:global(.fabricate-app) .a { color: red; }</style>',
    };
    assert.deepEqual(closureDependencies('src/Entry.svelte', syntheticReader(sources)), [
      'src/Entry.svelte: .visually-hidden',
      'src/deep/Deep.svelte: app-root selector',
    ]);
  });

  it('sees every ancestor dependency the published-components spec forbids', () => {
    const offenders = [
      '<span class="a visually-hidden"></span><span class:visually-hidden={on}></span>',
      '<style>',
      '  :global(.fabricate-manager) .a { color: var(--fab-manager-ink); }',
      '  @container app (width > 1px) { .a { font-family: var(--font-primary); } }',
      '</style>',
    ];
    const { ast } = templateOf('Synthetic.svelte', offenders.join('\n'));
    assert.deepEqual(ancestorDependencies(ast), [
      '.visually-hidden',
      '@container',
      'app-root selector',
      'unguarded var(--font-primary)',
      'var(--fab-manager-',
    ]);
    for (const root of ['.fabricate', '.fabricate-app']) {
      const scoped = templateOf('Root.svelte', `<style>:global ${root} .a { color: red; }</style>`);
      assert.deepEqual(ancestorDependencies(scoped.ast), ['app-root selector'], root);
    }
  });

  const MANAGER_BORROWS = [
    ['a .fabricate-manager selector', ':global(.fabricate-manager) .a { color: red; }'],
    ['a --fab-manager- token', '.a { color: var(--fab-manager-ink); }'],
  ];
  const WINDOW_BORROWS = [
    ['a .fabricate selector', ':global(.fabricate) .a { color: red; }'],
    ['a .fabricate-app selector', ':global(.fabricate-app) .a { color: red; }'],
  ];
  const rootRule = (css, root) =>
    closureDependencies(
      'src/E.svelte',
      syntheticReader({ 'src/E.svelte': `<style>${css}</style>` }),
      root
    );

  for (const [claim, css] of WINDOW_BORROWS) {
    it(`admits ${claim} to a fabricate entry and a manager entry, and refuses it to an any entry`, () => {
      assert.deepEqual(rootRule(css, 'fabricate'), []);
      assert.deepEqual(rootRule(css, 'manager'), []);
      assert.deepEqual(rootRule(css, 'any'), ['src/E.svelte: app-root selector']);
    });
  }

  for (const [claim, css] of MANAGER_BORROWS) {
    it(`refuses ${claim} to a fabricate entry and an any entry, and admits it to a manager entry`, () => {
      assert.equal(rootRule(css, 'fabricate').length, 1);
      assert.deepEqual(rootRule(css, 'fabricate'), rootRule(css, 'any'));
      assert.deepEqual(rootRule(css, 'manager'), []);
    });
  }

  it('admits what only a Fabricate window supplies to a fabricate entry, and never a Foundry read', () => {
    const windowed =
      '<span class="visually-hidden"></span><style>@container app (width > 1px) { .a { font-family: var(--font-primary); } }</style>';
    const reader = syntheticReader({
      'src/E.svelte': windowed,
      'src/G.svelte': '<script>const read = game;</script>',
    });
    assert.deepEqual(closureDependencies('src/E.svelte', reader, 'fabricate'), []);
    assert.equal(closureDependencies('src/E.svelte', reader, 'any').length, 3);
    for (const root of ['any', 'fabricate', 'manager']) {
      assert.deepEqual(closureDependencies('src/G.svelte', reader, root), [
        'src/G.svelte: reads game',
      ]);
    }
  });

  const CARD = new Set(['fabricate-card']);
  const reachOf = (sources, root = 'any') =>
    sheetReach({ path: 'src/E.svelte', root }, CARD, syntheticReader(sources));

  for (const [spelling, source] of [
    ['class attribute text', '<section class="a fabricate-card"></section>'],
    ['a class: directive', '<section class:fabricate-card={on}></section>'],
    ['a template class array', "<section class={['fabricate-card', extra]}></section>"],
    ['a script literal', "<script>const classes = ['fabricate-card'];</script>"],
    [
      'a template-literal chunk',
      '<script>const classes = `fabricate-card ${extra}`;</script>{classes}',
    ],
    ['a module script literal', "<script module>export const ROOT = 'fabricate-card';</script>"],
  ]) {
    it(`names a sheet-named class an any entry spells as ${spelling}`, () => {
      assert.deepEqual(reachOf({ 'src/E.svelte': source }), ['src/E.svelte: fabricate-card']);
      assert.deepEqual(reachOf({ 'src/E.svelte': source }, 'fabricate'), [], 'not at fabricate');
    });
  }

  it('names a sheet-named class only a file reached by import spells', () => {
    const sources = {
      'src/E.svelte': "<script>import Leaf from './Leaf.svelte';</script><Leaf />",
      'src/Leaf.svelte': "<script>import { ROOT } from './root.js';</script><p class={ROOT}></p>",
      'src/root.js': "export const ROOT = 'fabricate-card';",
    };
    assert.deepEqual(reachOf(sources), ['src/root.js: fabricate-card']);
  });

  it('reads a class token whole, so a longer name and a token inside a value are not the class', () => {
    const source =
      '<script>const style = `--x:var(--fabricate-card-${tone})`;</script><p class="fabricate-card-row not-fabricate-card" {style}></p>';
    assert.deepEqual(reachOf({ 'src/E.svelte': source }), []);
  });

  const focusOf = (markup) =>
    closureFocusables('src/E.svelte', syntheticReader({ 'src/E.svelte': markup }));

  it('passes a marked button and an unnamed input, and reports both as judged', () => {
    assert.deepEqual(
      focusOf('<button type="button" data-keyboard-focus="true">x</button><input /><p>x</p>'),
      { judged: ['src/E.svelte: button', 'src/E.svelte: input'], faults: [] }
    );
  });

  for (const [claim, markup, fault] of [
    [
      'a button without data-keyboard-focus',
      '<button type="button">x</button>',
      'button does not state data-keyboard-focus="true"',
    ],
    [
      'a button whose data-keyboard-focus is not static',
      '<button type="button" data-keyboard-focus={on}>x</button>',
      'button does not state data-keyboard-focus="true"',
    ],
    [
      'a button without type',
      '<button data-keyboard-focus="true">x</button>',
      'button does not state type="button"',
    ],
    ['a link', '<a href="#x">x</a>', 'a does not state data-keyboard-focus="true"'],
    [
      'an element with tabindex',
      '<span tabindex="0">x</span>',
      'span does not state data-keyboard-focus="true"',
    ],
    ['a named input', '<input name="q" />', 'input states name'],
    ['a named select', '<select name={field}></select>', 'select states name'],
  ]) {
    it(`names ${claim} as a rule 9 fault`, () => {
      assert.deepEqual(focusOf(markup).faults, [`src/E.svelte: ${fault}`]);
    });
  }

  const faceRule = (value) =>
    ancestorDependencies(
      templateOf('Face.svelte', `<style>.a { font-family: ${value}; }</style>`).ast
    );

  for (const value of [
    'var(--font-primary)',
    'var(--font-primary, )',
    'var(--font-primary, var(--x))',
    'var(--font-body, var(--font-primary))',
  ]) {
    it(`refuses ${value}, which can go invalid with no Foundry variable`, () => {
      assert.deepEqual(faceRule(value), ['unguarded var(--font-primary)']);
    });
  }

  it('admits a --font-primary read whose fallback ends in a literal', () => {
    assert.deepEqual(faceRule('var(--font-body, var(--font-primary, sans-serif))'), []);
  });

  it('follows a re-export and a lazy import to a plain module that reads a Foundry global', () => {
    const reader = syntheticReader({
      'src/Entry.svelte':
        "<script>import { localize } from './bridge.js'; const lazy = () => import('./lazy.js');</script>{localize('a')}{lazy}",
      'src/bridge.js': "export { localize } from './localize.js'; export * from './star.js';",
      'src/localize.js': 'export const localize = (key) => globalThis.game?.i18n.localize(key);',
      'src/star.js': 'export const settle = () => Hooks.callAll("settle");',
      'src/lazy.js': 'export default () => window["canvas"].ready;',
    });
    assert.deepEqual(closureDependencies('src/Entry.svelte', reader), [
      'src/localize.js: reads game',
      'src/star.js: reads Hooks',
      'src/lazy.js: reads canvas',
    ]);
  });

  it('reports a Foundry global a component reads in its template or its script', () => {
    const reader = syntheticReader({
      'src/Template.svelte': "<p>{game.i18n.localize('a')}</p>",
      'src/Script.svelte':
        '<script>const id = foundry.utils.randomID(); ui.notifications.info(id);</script>',
    });
    assert.deepEqual(closureDependencies('src/Template.svelte', reader), [
      'src/Template.svelte: reads game',
    ]);
    assert.deepEqual(closureDependencies('src/Script.svelte', reader), [
      'src/Script.svelte: reads foundry',
      'src/Script.svelte: reads ui',
    ]);
  });

  for (const name of [
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
  ]) {
    it(`refuses a closure file that reads ${name}`, () => {
      const reader = syntheticReader({ 'src/E.svelte': `<script>const read = ${name};</script>` });
      assert.deepEqual(closureDependencies('src/E.svelte', reader), [
        `src/E.svelte: reads ${name}`,
      ]);
    });
  }

  it('reads a local binding and a member of the same name as no global', () => {
    const reader = syntheticReader({
      'src/Local.svelte':
        "<script>import { ui } from './local.js'; const game = { user: 1 };</script>{game.user}{ui.canvas}",
      'src/local.js': 'const game = { user: 1 }; export const ui = { canvas: game.user };',
    });
    assert.deepEqual(closureDependencies('src/Local.svelte', reader), []);
  });
});

describe('the module sheet against the published Chip', () => {
  it('names the chip root in 18 selectors, none of which a published chip can match', () => {
    const selectors = stylesheetSources().parts.flatMap(({ file, text }) =>
      chipSelectors(file, text)
    );
    assert.deepEqual(
      selectors.filter(({ safe }) => !safe).map(({ selector }) => selector),
      []
    );
    assert.equal(selectors.length, 18, 'the census the static Chip was published on');
    assert.deepEqual(
      Object.keys(PUBLISHED_COMPONENT_MANIFEST.find(({ name }) => name === 'Chip').props),
      ['tone', 'density', 'children'],
      'a published key that draws a classed child reopens cannotMatchPublishedChip and fab-hit-area'
    );
  });

  const MANAGER = '.fabricate-manager';
  for (const [claim, selector] of [
    ['a class the published keys cannot write', `${MANAGER} .manager-chip.manager-tag-pill`],
    ['a published class beside an unwritable one', `${MANAGER} .manager-chip.is-list.is-empty`],
    ['the :disabled state', `${MANAGER} .manager-chip:disabled`],
    ['a classed glyph child', `${MANAGER} .manager-chip .fa-circle`],
    ['a pinned layout ancestor', `${MANAGER} .manager-vocabulary-row > .manager-chip`],
    ['another class that only starts with the root', `${MANAGER} .manager-chip-row`],
  ]) {
    it(`admits a selector that needs ${claim}`, () => {
      assert.deepEqual(unsafeChipSelectors('sheet.css', `${selector} { height: 30px }`), []);
    });
  }

  for (const selector of [
    `${MANAGER} .manager-chip`,
    `${MANAGER} .manager-chip.is-warning.is-list`,
    `${MANAGER} .manager-inspector .manager-chip`,
    `${MANAGER} .manager-chip > span`,
    `${MANAGER} .manager-chip ~ div > .manager-chip`,
    `${MANAGER} .manager-chip.is-row`,
    `${MANAGER} :is(.manager-chip.manager-tag-pill, .manager-pill)`,
  ]) {
    it(`refuses ${selector}, which nothing keeps off a published chip`, () => {
      const css = `@media (width > 1px) { .manager-pill, ${selector} { height: 30px } }`;
      assert.deepEqual(unsafeChipSelectors('sheet.css', css), [`sheet.css: ${selector}`]);
    });
  }
});
