/**
 * The Primitive Lab's fixture gate (issue 2339): a fixture is a call site that authors no word. Its
 * template renders the row's component with the row's props, shipped primitives and snippet wiring
 * only, every string it hands a component comes from the row, its imports are the closed list, an
 * `act` comes with its `reached`, and it compiles with no warning. Each rule runs over the real
 * fixtures and over a synthetic source that breaks it.
 */
import assert from 'node:assert/strict';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import { compile, parse } from 'svelte/compiler';

import { catalogueEntries } from '../scripts/lib/primitiveLabSmoke.js';

import { VALUE_PROP } from './helpers/primitiveLabWords.js';
import { declaredPropNames } from './helpers/sveltePropsDeclaration.js';

const REPO_ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const FIXTURE_DIRECTORY = 'tests/view-lab/primitives/fixtures';
const COMPONENT_DIRECTORY = 'src/ui/svelte/components/';

/** Every module a fixture may import besides `svelte` and a shipped component: the act helpers and the pure helpers a named shipped caller imports. */
const IMPORTABLE = Object.freeze([
  'tests/view-lab/primitives/fixtureActs.js',
  'src/ui/svelte/apps/manager/checks/checkAdjustmentLabel.js',
  'src/utils/checkAdjustmentFormat.js',
]);

/** The calls a `<script module>` literal may be an argument to: a query, an attribute read, a wait's description. */
const QUERY_CALLS = Object.freeze([
  'querySelector',
  'querySelectorAll',
  'closest',
  'matches',
  'getAttribute',
  'hasAttribute',
  'waitFor',
]);

/** Attributes whose literal values select rather than say. */
const VALUE_ATTRIBUTE = (name) =>
  VALUE_PROP.test(name) || name === 'role' || name === 'aria-hidden' || name.startsWith('data-');

const REST_PROP = '...rest';

/** AST keys that hold positions, back-references or comments rather than code. */
const SKIPPED_KEYS = new Set([
  'type',
  'start',
  'end',
  'loc',
  'metadata',
  'leadingComments',
  'trailingComments',
]);

const blank = (text) => typeof text !== 'string' || text.trim() === '';

/** The callee's own name: `waitFor(…)` and `root.querySelector(…)` alike. */
function calleeName(node) {
  const callee = node.callee;
  if (callee?.type === 'Identifier') return callee.name;
  if (callee?.type === 'MemberExpression' && !callee.computed) return callee.property.name;
  return null;
}

/** Whether a `<script module>` call may take literal arguments. */
function takesLiterals(node) {
  if (node.type === 'NewExpression') return calleeName(node) === 'Error';
  return node.type === 'CallExpression' && QUERY_CALLS.includes(calleeName(node));
}

const isLiteral = (node) => node.type === 'Literal' || node.type === 'TemplateLiteral';

/** The text a leaf node authors, `''` for a leaf that authors none, undefined for a node to walk. */
function leafText(node) {
  if (node.type === 'Text') return node.data;
  if (node.type === 'Literal') return typeof node.value === 'string' ? node.value : '';
  if (node.type === 'TemplateElement') return node.value.cooked;
  if (node.type === 'Comment' || node.type === 'ImportDeclaration') return '';
  return undefined;
}

/** The parts of a key or an attribute that can author a word, or null for any other node. */
function wordBearingParts(node) {
  if (node.type === 'Property') return node.computed ? [node.key, node.value] : [node.value];
  if (node.type === 'Attribute') return VALUE_ATTRIBUTE(node.name) ? [] : [node.value];
  return null;
}

/**
 * Every word a subtree authors: a non-blank `Text`, string `Literal` or template quasi, outside an
 * import source, an object key and a value attribute. In a module script a call that
 * `takesLiterals` may hold literals as its own arguments.
 */
function wordsIn(node, inModule, found = []) {
  if (!node || typeof node !== 'object') return found;
  if (Array.isArray(node)) {
    for (const item of node) wordsIn(item, inModule, found);
    return found;
  }
  const text = leafText(node);
  if (text !== undefined) {
    if (!blank(text)) found.push(text.trim());
    return found;
  }
  const parts = wordBearingParts(node);
  if (parts) return wordsIn(parts, inModule, found);
  const spared = new Set(inModule && takesLiterals(node) ? node.arguments.filter(isLiteral) : []);
  for (const [key, value] of Object.entries(node)) {
    if (SKIPPED_KEYS.has(key)) continue;
    wordsIn(
      key === 'arguments' ? value.filter((item) => !spared.has(item)) : value,
      inModule,
      found
    );
  }
  for (const literal of spared) wordsIn(literal.expressions ?? [], inModule, found);
  return found;
}

/** Every Svelte template node in a fragment, depth-first, snippet bodies and block branches included. */
function templateNodes(node, found = []) {
  if (!node || typeof node !== 'object') return found;
  if (Array.isArray(node)) {
    for (const item of node) templateNodes(item, found);
    return found;
  }
  if (
    typeof node.type === 'string' &&
    node.start !== undefined &&
    !node.type.endsWith('Expression')
  ) {
    found.push(node);
  }
  for (const key of [
    'fragment',
    'nodes',
    'body',
    'consequent',
    'alternate',
    'fallback',
    'pending',
    'then',
    'catch',
  ]) {
    if (key in node && node[key] && typeof node[key] === 'object') templateNodes(node[key], found);
  }
  return found;
}

/** The `$props()` destructure: each declared key with its local binding. */
function propsBindings(instance) {
  const bindings = new Map();
  for (const statement of instance?.content.body ?? []) {
    for (const declarator of statement.declarations ?? []) {
      if (declarator.init?.callee?.name !== '$props') continue;
      for (const property of declarator.id.properties ?? []) {
        if (property.type !== 'Property') continue;
        const local =
          property.value.type === 'AssignmentPattern' ? property.value.left : property.value;
        bindings.set(property.key.name, local.name);
      }
    }
  }
  return bindings;
}

/** Each import's local name and the repository path or package it resolves to. */
function importsOf(ast, file) {
  const imports = [];
  for (const script of [ast.instance, ast.module]) {
    for (const statement of script?.content.body ?? []) {
      if (statement.type !== 'ImportDeclaration') continue;
      const source = statement.source.value;
      const resolved = source.startsWith('.')
        ? path.posix.normalize(path.posix.join(path.posix.dirname(file), source))
        : source;
      imports.push({
        resolved,
        locals: statement.specifiers.map((specifier) => specifier.local.name),
      });
    }
  }
  return imports;
}

/** The names a `<script module>` exports. */
function moduleExports(ast) {
  return (ast.module?.content.body ?? [])
    .filter((statement) => statement.type === 'ExportNamedDeclaration')
    .flatMap((statement) => {
      const declaration = statement.declaration;
      if (declaration?.id) return [declaration.id.name];
      if (declaration?.declarations) return declaration.declarations.map((item) => item.id.name);
      return statement.specifiers.map((specifier) => specifier.exported.name);
    });
}

/** The props a component passes a rendered `<X>`: attributes, bindings and its child snippets. */
function passedProps(node) {
  const named = node.attributes
    .filter((attribute) => attribute.type === 'Attribute' || attribute.type === 'BindDirective')
    .map((attribute) => attribute.name);
  const children = node.fragment.nodes.filter(
    (child) => child.type !== 'Comment' && !(child.type === 'Text' && blank(child.data))
  );
  const snippets = children
    .filter((child) => child.type === 'SnippetBlock')
    .map((child) => child.expression.name);
  const content = children.some((child) => child.type !== 'SnippetBlock') ? ['children'] : [];
  return [...named, ...snippets, ...content];
}

const undeclared = (passed, declared) =>
  declared === null
    ? passed
    : passed.filter((name) => !declared.includes(name) && !declared.includes(REST_PROP));

/** Whether a render tag calls the local `children` binding. */
function rendersChildren(nodes, local) {
  return nodes.some((node) => {
    if (node.type !== 'RenderTag') return false;
    const call =
      node.expression.type === 'ChainExpression' ? node.expression.expression : node.expression;
    return call.callee?.name === local;
  });
}

/** The alias's problems: it spreads the row's props, and passes only what each row's path declares. */
function aliasProblems(node, { bindings, rows, propsOf }) {
  const spreadsProps = node.attributes.some(
    (attribute) =>
      attribute.type === 'SpreadAttribute' && attribute.expression.name === bindings.get('props')
  );
  const problems = spreadsProps
    ? []
    : [`passes <${node.name}> no \`{...props}\`, so the row's props are dropped`];
  for (const row of rows) {
    const names = undeclared(passedProps(node), propsOf(row.path));
    problems.push(...names.map((name) => `passes \`${name}\`, which ${row.path} does not declare`));
  }
  return problems;
}

/** A composed primitive's problems: it is a shipped component, passed only what it declares. */
function primitiveProblems(node, primitives, propsOf) {
  const primitive = primitives.get(node.name);
  if (!primitive) {
    return [`renders <${node.name}>, which is neither its component nor a shipped primitive`];
  }
  return undeclared(passedProps(node), propsOf(primitive)).map(
    (name) => `passes <${node.name}> \`${name}\`, which ${primitive} does not declare`
  );
}

/**
 * The template rules of D4: only the alias, shipped primitives and snippet wiring; the alias gets
 * `{...props}` and only props its row's component declares; a composed primitive only its own.
 */
function templateProblems(ast, { file, rows, propsOf }) {
  const bindings = propsBindings(ast.instance);
  const alias = bindings.get('component');
  const primitives = new Map(
    importsOf(ast, file)
      .filter(({ resolved }) => resolved.startsWith(COMPONENT_DIRECTORY))
      .flatMap(({ resolved, locals }) => locals.map((local) => [local, resolved]))
  );
  const nodes = templateNodes(ast.fragment);
  const problems = nodes
    .filter((node) => node.type === 'RegularElement' || node.type.startsWith('Svelte'))
    .map((node) => `renders a raw <${node.name}>, so markup no shipped primitive owns`);
  const components = nodes.filter((node) => node.type === 'Component');
  if (!alias || components.every((node) => node.name !== alias)) {
    problems.push('never renders the `component` prop it is handed');
  }
  for (const node of components) {
    problems.push(
      ...(node.name === alias
        ? aliasProblems(node, { bindings, rows, propsOf })
        : primitiveProblems(node, primitives, propsOf))
    );
  }
  const wantsChildren = rows.some((row) => row.content !== undefined);
  if (wantsChildren && !rendersChildren(nodes, bindings.get('children'))) {
    problems.push('is handed `content` by its row and renders no `children`');
  }
  return problems;
}

/** The import list of D3. */
function importProblems(ast, file) {
  return importsOf(ast, file)
    .filter(
      ({ resolved }) =>
        resolved !== 'svelte' &&
        !resolved.startsWith(COMPONENT_DIRECTORY) &&
        !IMPORTABLE.includes(resolved)
    )
    .map(
      ({ resolved }) =>
        `imports ${resolved}, outside svelte, the shipped components and the named helpers`
    );
}

/**
 * Every rule this gate holds a fixture to.
 *
 * @param {string} source The fixture's source.
 * @param {{file: string, rows: object[], propsOf: (path: string) => string[]|null}} context
 *   Its repository path, the rows naming it, and the props reader.
 * @returns {string[]} One problem per broken rule.
 */
function fixtureProblems(source, context) {
  const ast = parse(source, { modern: true });
  const words = [
    ...wordsIn(ast.fragment, false),
    ...wordsIn(ast.instance?.content, false),
    ...wordsIn(ast.module?.content, true),
  ];
  const exported = moduleExports(ast);
  const declared = declaredPropNames(source);
  return [
    ...words.map((word) => `authors the word ${JSON.stringify(word)}; a word comes from its row`),
    ...importProblems(ast, context.file),
    ...templateProblems(ast, context),
    ...(exported.includes('act') && !exported.includes('reached')
      ? ['exports `act` and no `reached`']
      : []),
    ...context.rows.flatMap((row) =>
      Object.keys(row.data ?? {})
        .filter((key) => !declared.includes(key))
        .map((key) => `is handed \`data.${key}\`, which it does not declare`)
    ),
  ];
}

/** Component prop names, read once per path; null when the file is absent or declares none. */
const declaredCache = new Map();
function declaredFor(componentPath) {
  if (!declaredCache.has(componentPath)) {
    const absolute = path.join(REPO_ROOT, componentPath);
    let declared = null;
    try {
      if (existsSync(absolute)) declared = declaredPropNames(readFileSync(absolute, 'utf8'));
    } catch {
      declared = null;
    }
    declaredCache.set(componentPath, declared);
  }
  return declaredCache.get(componentPath);
}

const CATALOGUE = catalogueEntries(REPO_ROOT);
const FIXTURE_ROWS = CATALOGUE.map((entry) => entry.row).filter((row) => row.fixture !== undefined);
const FIXTURES = readdirSync(path.join(REPO_ROOT, FIXTURE_DIRECTORY))
  .filter((name) => name.endsWith('.svelte'))
  .map((name) => {
    const file = `${FIXTURE_DIRECTORY}/${name}`;
    const fixture = name.replace(/\.svelte$/, '');
    return {
      file,
      fixture,
      source: readFileSync(path.join(REPO_ROOT, file), 'utf8'),
      rows: FIXTURE_ROWS.filter((row) => row.fixture === fixture),
    };
  });

test('the fixture corpus is alive', () => {
  assert.ok(FIXTURES.length > 0, 'no fixture file, so every rule below has no domain');
  assert.ok(FIXTURE_ROWS.length > 0, 'no catalogue row names a fixture');
});

test('every fixture is named by a catalogue row', () => {
  const orphans = FIXTURES.filter(({ rows }) => rows.length === 0).map(({ file }) => file);
  assert.deepEqual(orphans, [], 'a fixture no row names is code the lab never runs');
});

test('every fixture is a call site that authors no word', () => {
  for (const { file, source, rows } of FIXTURES) {
    assert.deepEqual(fixtureProblems(source, { file, rows, propsOf: declaredFor }), [], file);
  }
});

test('every fixture compiles with no warning', () => {
  for (const { file, source } of FIXTURES) {
    const { warnings } = compile(source, { filename: file, generate: 'client' });
    assert.deepEqual(
      warnings.map((warning) => `${warning.code}: ${warning.message}`),
      [],
      `${file}: \`lint:svelte:warnings\` walks src only, so this is the fixture's warning gate`
    );
  }
});

/** A synthetic fixture: the template and scripts given, standing up a removable chip. */
function synthetic({
  instance = '',
  module = '',
  template = '<Specimen {...props} onRemove={remove} />',
}) {
  return (
    (module ? `<script module>\n${module}\n</script>\n` : '') +
    `<script>\n  let { component: Specimen, props = {}, children, typed = '' } = $props();\n  function remove() {}\n${instance}\n</script>\n\n${template}\n`
  );
}

const CHIP = { path: 'src/ui/svelte/components/Chip.svelte' };
const SYNTHETIC_FILE = `${FIXTURE_DIRECTORY}/Synthetic.svelte`;

/** The problems a synthetic fixture yields beside the words its own `typed = ''` default does not author. */
function problemsOf(parts, rows = [CHIP]) {
  return fixtureProblems(synthetic(parts), { file: SYNTHETIC_FILE, rows, propsOf: declaredFor });
}

test('a well-formed synthetic fixture passes, so each control below fails on its own defect', () => {
  assert.deepEqual(problemsOf({}), []);
  assert.deepEqual(
    problemsOf(
      { template: '<Specimen {...props} onRemove={remove}>{@render children?.()}</Specimen>' },
      [{ ...CHIP, content: ['Perception'] }]
    ),
    []
  );
});

test('a word in the template, an attribute or an expression is refused', () => {
  const cases = [
    '<Specimen {...props} onRemove={remove}>Remove</Specimen>',
    "<Specimen {...props} onRemove={remove}>{'Remove'}</Specimen>",
    '<Specimen {...props} onRemove={remove} aria-label="Remove" />',
    "<Specimen {...props} onRemove={remove} aria-label={'Remove'} />",
    '<Specimen {...props} onRemove={remove} aria-label={`Remove ${typed}`} />',
  ];
  for (const template of cases) {
    assert.ok(
      problemsOf({ template }).some((problem) => problem.includes('authors the word "Remove')),
      template
    );
  }
  assert.ok(
    problemsOf({
      template: '<Specimen {...props} onRemove={remove} tone="danger" data-hook="x" />',
    }).every((problem) => !problem.includes('authors')),
    'a value attribute selects rather than says'
  );
});

test('a module script may query with literals and may not type one', () => {
  const querying =
    'export function reached(root) { return Boolean(root.querySelector(\'[role="option"]\')); }';
  assert.deepEqual(problemsOf({ module: querying }), []);
  const typing = `import { type } from '../fixtureActs.js';\nexport async function act(root) { await type(root.querySelector('input'), 'smith'); }\n${querying}`;
  assert.deepEqual(problemsOf({ module: typing }), [
    'authors the word "smith"; a word comes from its row',
  ]);
});

test('an import outside the closed list is refused', () => {
  const instance = "  import { localize } from '../../../../src/ui/svelte/util/foundryBridge.js';";
  assert.deepEqual(problemsOf({ instance }), [
    'imports src/ui/svelte/util/foundryBridge.js, outside svelte, the shipped components and the named helpers',
  ]);
});

test('a raw element, or a context class around the alias, is refused', () => {
  const template =
    '<div class="manager-body is-rail-collapsed"><Specimen {...props} onRemove={remove} /></div>';
  assert.deepEqual(problemsOf({ template }), [
    'renders a raw <div>, so markup no shipped primitive owns',
  ]);
});

test('the alias must be rendered, with the row’s props', () => {
  assert.ok(
    problemsOf({ template: '' }).includes('never renders the `component` prop it is handed')
  );
  assert.deepEqual(problemsOf({ template: '<Specimen onRemove={remove} />' }), [
    "passes <Specimen> no `{...props}`, so the row's props are dropped",
  ]);
});

test('an attribute the component or a composed primitive does not declare is refused', () => {
  const stageNav = { path: 'src/ui/svelte/components/StageNav.svelte' };
  assert.deepEqual(
    problemsOf({ template: '<Specimen {...props} onDelete={remove} />' }, [stageNav]),
    ['passes `onDelete`, which src/ui/svelte/components/StageNav.svelte does not declare']
  );
  const instance =
    "  import Medallion from '../../../../src/ui/svelte/components/Medallion.svelte';";
  const template = '<Specimen {...props} onRemove={remove} />\n<Medallion onRemove={remove} />';
  assert.deepEqual(problemsOf({ instance, template }), [
    'passes <Medallion> `onRemove`, which src/ui/svelte/components/Medallion.svelte does not declare',
  ]);
});

test('a row with `content` needs a fixture that renders `children`', () => {
  assert.deepEqual(problemsOf({}, [{ ...CHIP, content: ['Perception'] }]), [
    'is handed `content` by its row and renders no `children`',
  ]);
});

test('an `act` with no `reached`, and an undeclared `data` key, are refused', () => {
  const module = 'export async function act() {}';
  assert.deepEqual(problemsOf({ module }), ['exports `act` and no `reached`']);
  assert.deepEqual(problemsOf({}, [{ ...CHIP, data: { typed: 'smith', items: [] } }]), [
    'is handed `data.items`, which it does not declare',
  ]);
});
