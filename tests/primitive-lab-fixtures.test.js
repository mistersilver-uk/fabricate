/**
 * The Primitive Lab's fixture gate (issue 2339): a fixture is a call site that authors no word. Its
 * template renders the row's component with the row's props, shipped primitives and snippet wiring
 * only, with no style or class of its own; every string it hands a component comes from the row, its
 * imports are the closed list, an `act` drives no event itself and comes with its `reached`, and it
 * compiles with no warning. A shipped primitive is a component under `src/ui/svelte/components/` or
 * a composition the manifest lists under `designSystemPrimitives`. Each rule runs over the real
 * fixtures and a synthetic source breaking it.
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

const MANIFEST = JSON.parse(
  readFileSync(path.join(REPO_ROOT, 'scripts/lib/designSystemPrimitives.json'), 'utf8')
);
const MANIFEST_COMPOSITIONS = new Set(
  MANIFEST.designSystemPrimitives
    .map((entry) => entry.path)
    .filter((entryPath) => entryPath.endsWith('.svelte'))
);
const NOT_A_PRIMITIVE = new Set(MANIFEST.notAPrimitive.map((entry) => entry.path));

/** Whether a fixture may compose this path: a shipped component or a manifest-listed composition, never a `notAPrimitive` path. */
const isShippedPrimitive = (resolved) =>
  !NOT_A_PRIMITIVE.has(resolved) &&
  (resolved.startsWith(COMPONENT_DIRECTORY) || MANIFEST_COMPOSITIONS.has(resolved));

/** Every module a fixture may import besides `svelte` and a shipped primitive: the act helpers and the pure helpers a named shipped caller imports. */
const IMPORTABLE = Object.freeze([
  'tests/view-lab/primitives/fixtureActs.js',
  'src/ui/svelte/apps/manager/checks/checkAdjustmentLabel.js',
  'src/utils/checkAdjustmentFormat.js',
  'src/ui/svelte/util/statusChipTone.js',
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

/** Element methods an act may not call itself, because `fixtureActs.js` drives every event. */
const EVENT_METHODS = new Set(['focus', 'blur', 'click', 'dispatchEvent']);

const PRESENTATION_ATTRIBUTES = new Set(['class', 'style']);

/** A prop that hands a primitive presentation, as `rowClass` or `wellStyle` do. */
const PRESENTATION_PROP = /(?:Class|Style)$/;

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

/** The passed names a component does not declare; `...rest` admits any but `children`. */
const undeclared = (passed, declared) =>
  declared === null
    ? passed
    : passed.filter(
        (name) => !declared.includes(name) && (name === 'children' || !declared.includes(REST_PROP))
      );

/** Visit every ESTree or template node under `node`. */
function eachNode(node, visit) {
  if (!node || typeof node !== 'object') return;
  if (Array.isArray(node)) {
    for (const item of node) eachNode(item, visit);
    return;
  }
  if (typeof node.type === 'string') visit(node);
  for (const [key, value] of Object.entries(node)) {
    if (!SKIPPED_KEYS.has(key)) eachNode(value, visit);
  }
}

/** An attribute's value when it is exactly one `{expression}`, else null. */
function soleExpression(attribute) {
  const value =
    Array.isArray(attribute.value) && attribute.value.length === 1
      ? attribute.value[0]
      : attribute.value;
  return value?.type === 'ExpressionTag' ? value.expression : null;
}

/** Whether an expression is the `local` binding whole, or a condition that may yield it; `&&` yields only its right. */
function yields(expression, local) {
  if (expression?.type === 'ConditionalExpression') {
    return yields(expression.consequent, local) || yields(expression.alternate, local);
  }
  if (expression?.type === 'LogicalExpression') {
    const right = yields(expression.right, local);
    return expression.operator === '&&' ? right : right || yields(expression.left, local);
  }
  return expression?.type === 'Identifier' && expression.name === local;
}

/** Whether a node renders the `local` binding or hands it on whole as an attribute. */
function passesOn(node, local) {
  if (node.type === 'RenderTag') {
    const call =
      node.expression.type === 'ChainExpression' ? node.expression.expression : node.expression;
    return call.callee?.name === local;
  }
  return (node.attributes ?? []).some(
    (attribute) => attribute.type === 'Attribute' && yields(soleExpression(attribute), local)
  );
}

/** The `content` and snippets its rows hand a fixture, and the snippets it declares, each passed on. */
function handedProblems(ast, nodes, { bindings, rows }) {
  const handed = (local) => local !== undefined && nodes.some((node) => passesOn(node, local));
  const problems =
    rows.some((row) => row.content !== undefined) && !handed(bindings.get('children'))
      ? ['is handed `content` by its row and renders no `children`']
      : [];
  const snippets = new Set(rows.flatMap((row) => Object.keys(row.snippets ?? {})));
  for (const name of snippets) {
    if (!handed(bindings.get(name))) {
      problems.push(`is handed the \`${name}\` snippet by its row and does not pass it on`);
    }
  }
  for (const node of ast.fragment.nodes) {
    if (node.type === 'SnippetBlock' && !handed(node.expression.name)) {
      problems.push(`declares the \`${node.expression.name}\` snippet and does not pass it on`);
    }
  }
  return problems;
}

/** The name a class or style attribute or directive sets, or null for any other attribute. */
function presentationName(attribute) {
  if (attribute.type === 'ClassDirective') return `class:${attribute.name}`;
  if (attribute.type === 'StyleDirective') return `style:${attribute.name}`;
  const isPresentation =
    attribute.type === 'Attribute' &&
    (PRESENTATION_ATTRIBUTES.has(attribute.name) || PRESENTATION_PROP.test(attribute.name));
  return isPresentation ? attribute.name : null;
}

/** Whether an expression reads a row value: a `$props()` local, or a member of one. */
function readsRow(expression, readable) {
  let root = expression;
  while (root?.type === 'MemberExpression') root = root.object;
  return root?.type === 'Identifier' && readable.has(root.name);
}

/**
 * No `<style>`, no `{@html}`, and no class or style the fixture authors: a `class`, `style`,
 * `*Class` or `*Style` attribute only reads the row's `props` or `data` or a shipped primitive's
 * export, and a directive's name is always its own.
 */
function presentationProblems(ast, nodes, { bindings, primitives }) {
  const readable = new Set([
    ...[...bindings]
      .filter(([key]) => key !== 'component' && key !== 'children')
      .map(([, local]) => local),
    ...primitives.keys(),
  ]);
  const problems = ast.css
    ? ['carries a <style> block, so presentation no shipped primitive owns']
    : [];
  for (const node of nodes) {
    if (node.type === 'HtmlTag') {
      problems.push('renders {@html}, so markup no shipped primitive owns');
    }
    for (const attribute of node.attributes ?? []) {
      const name = presentationName(attribute);
      if (name === null) continue;
      if (attribute.type === 'Attribute' && readsRow(soleExpression(attribute), readable)) continue;
      problems.push(
        `gives <${node.name}> \`${name}\` of its own, so presentation no shipped primitive owns`
      );
    }
  }
  return problems;
}

/** Each `.focus()`, `.blur()`, `.click()` or `.dispatchEvent()` a script calls itself. */
function eventCallProblems(ast) {
  const problems = [];
  eachNode([ast.instance?.content, ast.module?.content], (node) => {
    const callee = node.type === 'CallExpression' ? node.callee : null;
    if (callee?.type !== 'MemberExpression' || callee.computed) return;
    if (!EVENT_METHODS.has(callee.property.name)) return;
    problems.push(
      `calls \`.${callee.property.name}()\`; an act drives events only through fixtureActs.js`
    );
  });
  return problems;
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
      .filter(({ resolved }) => isShippedPrimitive(resolved))
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
  return [
    ...problems,
    ...handedProblems(ast, nodes, { bindings, rows }),
    ...presentationProblems(ast, nodes, { bindings, primitives }),
  ];
}

/** The import list of D3. */
function importProblems(ast, file) {
  return importsOf(ast, file)
    .filter(
      ({ resolved }) =>
        resolved !== 'svelte' && !isShippedPrimitive(resolved) && !IMPORTABLE.includes(resolved)
    )
    .map(
      ({ resolved }) =>
        `imports ${resolved}, outside svelte, the shipped primitives and the named helpers`
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
    ...eventCallProblems(ast),
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
  const acting = FIXTURES.filter(({ source }) =>
    moduleExports(parse(source, { modern: true })).includes('act')
  );
  assert.ok(acting.length > 0, 'no fixture exports `act`, so the act rules have no real domain');
  const composing = FIXTURES.filter(({ file, source }) =>
    importsOf(parse(source, { modern: true }), file).some(
      ({ resolved }) =>
        MANIFEST_COMPOSITIONS.has(resolved) && !resolved.startsWith(COMPONENT_DIRECTORY)
    )
  );
  assert.ok(
    composing.map(({ fixture }) => fixture).includes('BulkEditPanelStatus'),
    'no fixture composes a manifest-listed composition, so that allowance has no real domain'
  );
});

/** The fixture files no catalogue row names. */
const orphansOf = (fixtures) =>
  fixtures.filter(({ rows }) => rows.length === 0).map(({ file }) => file);

/** A source's compiler warnings, one `code: message` each. */
function warningsOf(source, file) {
  const { warnings } = compile(source, { filename: file, generate: 'client' });
  return warnings.map((warning) => `${warning.code}: ${warning.message}`);
}

test('every fixture is named by a catalogue row', () => {
  assert.deepEqual(orphansOf(FIXTURES), [], 'a fixture no row names is code the lab never runs');
});

test('every notice row that passes an action names the fixture that gives it a handler', () => {
  const rows = CATALOGUE.map((entry) => entry.row).filter(
    (row) => row.path.endsWith('/Notice.svelte') && row.props?.action
  );
  assert.equal(rows.length, 3, 'the three notice rows that draw an action');
  assert.deepEqual(
    rows.map((row) => row.fixture),
    ['NoticeAction', 'NoticeAction', 'NoticeAction'],
    'a row that passes a label alone draws no button, so its frame loses the control unseen'
  );
});

test('every fixture is a call site that authors no word', () => {
  for (const { file, source, rows } of FIXTURES) {
    assert.deepEqual(fixtureProblems(source, { file, rows, propsOf: declaredFor }), [], file);
  }
});

test('every fixture compiles with no warning', () => {
  for (const { file, source } of FIXTURES) {
    assert.deepEqual(
      warningsOf(source, file),
      [],
      `${file}: \`lint:svelte:warnings\` walks src only, so this is the fixture's warning gate`
    );
  }
});

/** A synthetic fixture: the template and scripts given, standing up a removable chip. */
function synthetic({
  instance = '',
  module = '',
  declares = '',
  template = '<Specimen {...props} onRemove={remove} />',
}) {
  return (
    (module ? `<script module>\n${module}\n</script>\n` : '') +
    `<script>\n  let { component: Specimen, props = {}, children, typed = ''${declares} } = $props();\n  function remove() {}\n${instance}\n</script>\n\n${template}\n`
  );
}

const CHIP = { path: 'src/ui/svelte/components/Chip.svelte' };
const BULK_EDIT_SECTION = 'src/ui/svelte/apps/manager/BulkEditSection.svelte';
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
    'imports src/ui/svelte/util/foundryBridge.js, outside svelte, the shipped primitives and the named helpers',
  ]);
});

/** A synthetic fixture importing `local` from `src/ui/svelte/apps/<target>`. */
const importingApp = (local, target) =>
  `  import ${local} from '../../../../src/ui/svelte/apps/${target}';`;

const refusedApp = (target) => [
  `imports src/ui/svelte/apps/${target}, outside svelte, the shipped primitives and the named helpers`,
];

test('a `notAPrimitive` composition is refused', () => {
  const target = 'manager/SystemOverviewView.svelte';
  assert.deepEqual(problemsOf({ instance: importingApp('Part', target) }), refusedApp(target));
});

test('a `notAPrimitive` component is refused', () => {
  const instance =
    "  import Part from '../../../../src/ui/svelte/components/TintPickerButton.svelte';";
  assert.deepEqual(problemsOf({ instance }), [
    'imports src/ui/svelte/components/TintPickerButton.svelte, outside svelte, the shipped primitives and the named helpers',
  ]);
});

test('a component the library names only in prose is refused', () => {
  const target = 'journal/RunDetail.svelte';
  assert.deepEqual(problemsOf({ instance: importingApp('Part', target) }), refusedApp(target));
});

test('a manifest-listed composition may be composed, passed only what it declares', () => {
  const instance = importingApp('BulkEditSection', 'manager/BulkEditSection.svelte');
  const composed = (attribute) =>
    problemsOf({
      instance,
      template: [
        '<Specimen {...props} onRemove={remove} />',
        `<BulkEditSection ${attribute} />`,
      ].join('\n'),
    });
  assert.deepEqual(composed('label={typed}'), []);
  assert.deepEqual(composed('x={typed}'), [
    `passes <BulkEditSection> \`x\`, which ${BULK_EDIT_SECTION} does not declare`,
  ]);
});

test('a raw element, or a context class around the alias, is refused', () => {
  const template =
    '<div class="manager-body is-rail-collapsed"><Specimen {...props} onRemove={remove} /></div>';
  assert.deepEqual(problemsOf({ template }), [
    'renders a raw <div>, so markup no shipped primitive owns',
    'gives <div> `class` of its own, so presentation no shipped primitive owns',
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

test('`...rest` does not admit `children` a component does not declare', () => {
  const logList = { path: 'src/ui/svelte/components/LogList.svelte', content: ['Perception'] };
  const template = '<Specimen {...props} onRemove={remove}>{@render children?.()}</Specimen>';
  assert.deepEqual(problemsOf({ template }, [logList]), [
    'passes `children`, which src/ui/svelte/components/LogList.svelte does not declare',
  ]);
});

test('an `act` with no `reached`, and an undeclared `data` key, are refused', () => {
  const module = 'export async function act() {}';
  assert.deepEqual(problemsOf({ module }), ['exports `act` and no `reached`']);
  assert.deepEqual(problemsOf({}, [{ ...CHIP, data: { typed: 'smith', items: [] } }]), [
    'is handed `data.items`, which it does not declare',
  ]);
});

test('an unnamed fixture is an orphan, and a warning a source compiles with is read', () => {
  const named = { file: 'a.svelte', rows: [CHIP] };
  assert.deepEqual(orphansOf([named, { file: SYNTHETIC_FILE, rows: [] }]), [SYNTHETIC_FILE]);
  const warned = warningsOf(synthetic({ template: '<img src="x.webp" />' }), SYNTHETIC_FILE);
  assert.ok(
    warned.some((warning) => warning.startsWith('a11y_missing_attribute')),
    warned.join('\n')
  );
});

test('a <style> block, an {@html} tag, and a class or style the fixture authors are refused', () => {
  const style = '<Specimen {...props} onRemove={remove} />\n<style>\n  .x { margin: 0; }\n</style>';
  assert.deepEqual(problemsOf({ template: style }), [
    'carries a <style> block, so presentation no shipped primitive owns',
  ]);
  assert.deepEqual(
    problemsOf({ template: '<Specimen {...props} onRemove={remove}>{@html typed}</Specimen>' }),
    ['renders {@html}, so markup no shipped primitive owns']
  );
  const withAttribute = (attribute) =>
    ['<Specimen {...props} onRemove={remove}', attribute, '/>'].join(' ');
  const authored = [
    ['class="is-rail-collapsed"', 'class'],
    ['class="pick {typed}"', 'class'],
    ["style={'margin: 0'}", 'style'],
    ['style:margin={typed}', 'style:margin'],
    ['class:is-open={typed}', 'class:is-open'],
    ['rowClass="is-open"', 'rowClass'],
    ["wellStyle={'margin: 0'}", 'wellStyle'],
  ];
  for (const [attribute, name] of authored) {
    const template = withAttribute(attribute);
    assert.ok(
      problemsOf({ template }).includes(
        `gives <Specimen> \`${name}\` of its own, so presentation no shipped primitive owns`
      ),
      template
    );
  }
  for (const attribute of [
    'class={props.class}',
    'class={typed}',
    'style={props.style}',
    'wellStyle={props.wellStyle}',
  ]) {
    const template = withAttribute(attribute);
    assert.deepEqual(problemsOf({ template }), [], `${attribute} reads the row`);
  }
});

test('an act that calls an element event method itself is refused', () => {
  for (const method of ['focus', 'blur', 'click', 'dispatchEvent']) {
    const module = `export async function act(root) { root.querySelector('input').${method}(); }\nexport function reached() { return true; }`;
    assert.deepEqual(problemsOf({ module }), [
      `calls \`.${method}()\`; an act drives events only through fixtureActs.js`,
    ]);
  }
});

test('a row snippet needs a fixture that declares it and passes it on', () => {
  const listRow = { path: 'src/ui/svelte/components/ListRow.svelte', snippets: { meta: [] } };
  const template = '<Specimen {...props} />';
  const refused = ['is handed the `meta` snippet by its row and does not pass it on'];
  assert.deepEqual(problemsOf({ template }, [listRow]), refused);
  assert.deepEqual(problemsOf({ declares: ', meta', template }, [listRow]), refused);
  assert.deepEqual(
    problemsOf({ declares: ', meta', template: '<Specimen {...props} {meta} />' }, [listRow]),
    []
  );
});

test('a snippet the fixture declares and never passes on is refused', () => {
  const declaring = (alias) =>
    problemsOf({ template: ['{#snippet action()}{/snippet}', alias].join('\n') });
  assert.deepEqual(declaring('<Specimen {...props} onRemove={remove} />'), [
    'declares the `action` snippet and does not pass it on',
  ]);
  for (const handed of ['{action}', 'action={typed ? action : undefined}']) {
    assert.deepEqual(declaring(['<Specimen {...props}', handed, '/>'].join(' ')), [], handed);
  }
  assert.deepEqual(declaring('<Specimen {...props} action={action && typed} />'), [
    'declares the `action` snippet and does not pass it on',
  ]);
});
