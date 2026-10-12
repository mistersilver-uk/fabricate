/**
 * The published component manifest (issue 2426) against each component's parsed declaration: its
 * props, rest and each key's kind, then its import closure of `.svelte` and `.js` files: a
 * stylesheet and template that need no Fabricate ancestor, and no read of a Foundry global; then
 * the module sheet's selectors that name the published `Chip`'s root class (issue 2451). The
 * test-only probe runs beside the shipped entries; the adapter's bindings are the mounted suite's.
 * Limit: it reads scoped `<style>` declarations, not inline `style=` values.
 * Limit: `readsGlobal` sees a free reference or a member of a free host, not a destructure of one.
 * Limit: `renderedLocals` sees `{@render local()}` and `{@render local?.()}` on the prop's own
 * local, not a snippet forwarded to a child, read through an alias, or tested in `{#if}`; a
 * forwarded `text` key fails closed and a forwarded `data` key is not seen.
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

/** Every local a `{@render}` tag calls, with each call's argument count and whether it is `?.()`. */
function renderedLocals(ast) {
  const called = new Map();
  for (const node of walkNodes(ast.fragment)) {
    if (node.type !== 'RenderTag') continue;
    const call =
      node.expression.type === 'ChainExpression' ? node.expression.expression : node.expression;
    if (call.callee?.type !== 'Identifier') continue;
    const calls = called.get(call.callee.name) ?? [];
    calls.push({ args: call.arguments.length, optional: call.optional === true });
    called.set(call.callee.name, calls);
  }
  return called;
}

const SHIPPED_KINDS = new Set(['data', 'text']);

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
    if (spec.kind === 'data' && calls.length > 0) {
      faults.push(`${key} is a data key rendered as a snippet`);
    }
    return faults;
  });
}

const CHIP_ROOT = 'manager-chip';
/** The classes the published `Chip` keys can write beside its root class. */
const PUBLISHED_CHIP_CLASSES = new Set([
  'is-positive',
  'is-warning',
  'is-danger',
  'is-info',
  'is-neutral',
  'is-accent',
  'is-list',
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
  const at = compounds.findIndex((compound) => classesOf(compound).includes(CHIP_ROOT));
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

/** What a component's own stylesheet and template borrow from a Fabricate window, by rule. */
function ancestorDependencies(ast) {
  const found = new Set();
  for (const node of walkNodes(ast.css)) {
    if (node.type === 'ClassSelector' && APP_ROOTS.has(node.name)) found.add('app-root selector');
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
  return [...found].sort(byName);
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
function closureDependencies(path, reader = SHIPPED) {
  return [...importClosure(path, reader)].flatMap((file) =>
    [
      ...(isComponent(file) ? ancestorDependencies(reader.component(file)) : []),
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
    it(`${entry.name} publishes only declared props at a shipped kind, and rest exactly when declared`, () => {
      const declaration = readDeclaration({ file: entry.path, ast: componentAstOf(entry.path) });
      assert.deepEqual(Object.keys(entry).sort(byName), [
        'name',
        'path',
        'props',
        'rest',
        'version',
      ]);
      assert.ok(Number.isInteger(entry.version) && entry.version > 0, 'a positive version');
      assert.equal(entry.name, declaration.component);
      assert.equal(entry.rest, declaration.rest !== null, 'rest matches the rest declaration');
      assert.deepEqual(declarationFaults(entry, declaration.ast), []);
    });

    it(`${entry.name} needs no Fabricate ancestor and reads no Foundry global, closure included`, () => {
      assert.deepEqual(closureDependencies(entry.path), []);
    });
  }

  it('reads a snippet, a bindable and a rest prop from a declaration, so the gate can see them', () => {
    const { ast } = templateOf(
      'Synthetic.svelte',
      '<script>\n  let { body, value = $bindable(), ...rest } = $props();\n</script>\n{@render body?.()}'
    );
    assert.deepEqual(propLocals(ast), [
      { key: 'body', local: 'body', bindable: false },
      { key: 'value', local: 'value', bindable: true },
    ]);
    assert.deepEqual([...renderedLocals(ast)], [['body', [{ args: 0, optional: true }]]]);
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
    ['a slot kind', { note: { kind: 'slot' } }, ['note has the unshipped kind slot']],
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
    `${MANAGER} :is(.manager-chip.manager-tag-pill, .manager-pill)`,
  ]) {
    it(`refuses ${selector}, which nothing keeps off a published chip`, () => {
      const css = `@media (width > 1px) { .manager-pill, ${selector} { height: 30px } }`;
      assert.deepEqual(unsafeChipSelectors('sheet.css', css), [`sheet.css: ${selector}`]);
    });
  }
});
