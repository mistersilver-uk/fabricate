/**
 * Every `RadioCardGroup` render site and Primitive Lab row passes the `<OptionCards>` API (issue
 * 2467): `value`, `groupName`, `onChange` and a legend, and no name the component does not declare.
 * The component keeps no-op defaults for a JSON row, so "required" is held here, not at runtime.
 */
import assert from 'node:assert/strict';
import { join, relative, sep } from 'node:path';
import test from 'node:test';

import { catalogueEntries } from '../../scripts/lib/primitiveLabCatalogue.js';
import { readDeclaration } from '../helpers/apiConvention.js';
import { assertFloor } from '../helpers/designSystemRatchet.js';
import {
  importedModules,
  lazilyImportedModules,
  literalStrings,
  walkNodes,
} from '../helpers/moduleAst.js';
import { componentAstOf, moduleAstOf, sourceAstEntriesUnder } from '../helpers/parsedSource.js';
import { repoRoot } from '../helpers/sourceScan.js';
import { keyName, renderedNodes } from '../helpers/structureShapes.js';
import { svelteFiles } from '../helpers/svelteTemplateScan.js';

const NAME = 'RadioCardGroup';
const COMPONENT = `src/ui/svelte/components/${NAME}.svelte`;
const DECLARED = new Set(
  readDeclaration({ file: COMPONENT, ast: componentAstOf(COMPONENT) }).names
);
const REQUIRED = Object.freeze(['value', 'groupName', 'onChange']);
/** Retired option keys: a card is disabled by `disabledOptions`, never by a key on its option. */
const RETIRED_OPTION_KEYS = Object.freeze(['disabled', 'meta', 'badgeKey', 'badgeFallback']);
/** Every `option.<key>` the component reads, which is the whole option shape it honours. */
const OPTION_KEYS = new Set(
  [...walkNodes(componentAstOf(COMPONENT))]
    .filter(
      (node) =>
        node.type === 'MemberExpression' &&
        !node.computed &&
        node.object.type === 'Identifier' &&
        node.object.name === 'option'
    )
    .map((node) => node.property.name)
);
const FORWARDED = /^(?:data|aria)-/;

const undeclared = (names) => names.filter((name) => !DECLARED.has(name) && !FORWARDED.test(name));
const lacksLegend = (names) => !names.includes('legend') && !names.includes('legendKey');

/** Every `src/` component importing the primitive, with the import declarations that name it. */
const IMPORTERS = svelteFiles(join(repoRoot, 'src')).flatMap((absolute) => {
  const file = relative(repoRoot, absolute).split(sep).join('/');
  const ast = componentAstOf(file);
  const imports = [ast.module, ast.instance]
    .flatMap((script) => script?.content.body ?? [])
    .filter(
      (node) => node.type === 'ImportDeclaration' && node.source.value.endsWith(`/${NAME}.svelte`)
    );
  return imports.length > 0 ? [{ file, ast, imports }] : [];
});

const REFERENCING = sourceAstEntriesUnder('src')
  .filter(([, ast]) =>
    [
      ...importedModules(ast),
      ...lazilyImportedModules(ast, (source) => literalStrings(source).join('')),
    ].some((specifier) => specifier.endsWith(`/${NAME}.svelte`))
  )
  .map(([path]) => path);

/** The nodes a site's `options` or `disabledOptions` expression resolves to in its own file. */
function declaredInit(name, ast) {
  const scripts = [ast.module, ast.instance];
  for (const node of walkNodes(scripts)) {
    if (node.type === 'VariableDeclarator' && node.id?.name === name && node.init) {
      const init = node.init;
      return init.type === 'CallExpression' &&
        /^\$derived/.test(init.callee.name ?? init.callee.object?.name ?? '')
        ? init.arguments[0]
        : init;
    }
  }
  return undefined;
}

/** Where an imported options list is declared: the relative module that exports the name. */
function importedInit(name, file, ast) {
  for (const node of walkNodes([ast.module, ast.instance])) {
    if (node.type !== 'ImportDeclaration' || !node.source.value.endsWith('.js')) continue;
    if (node.specifiers.every((spec) => spec.local.name !== name)) continue;
    const target = join(file, '..', node.source.value).split(sep).join('/');
    const module = moduleAstOf(target).ast;
    for (const inner of walkNodes(module)) {
      if (inner.type === 'VariableDeclarator' && inner.id?.name === name) return inner.init;
    }
  }
  return undefined;
}

const attributeExpression = (attribute) =>
  attribute?.value?.expression ?? attribute?.value?.[0]?.expression;

/** The expression an attribute passes, followed once through a same-file or imported binding. */
function resolvedExpression(attribute, file, ast) {
  const expression = attributeExpression(attribute);
  if (expression?.type !== 'Identifier') return expression;
  return declaredInit(expression.name, ast) ?? importedInit(expression.name, file, ast);
}

const SITES = IMPORTERS.flatMap(({ file, ast }) =>
  renderedNodes(ast, NAME).map((node) => ({ where: `${file} @${node.start}`, node, file, ast }))
);

const ROWS = catalogueEntries(repoRoot).filter(({ row }) => row.path === COMPONENT);

const byPath = (left, right) => left.localeCompare(right);

test('only the .svelte importers reference the primitive, in any form', () => {
  assert.deepEqual(
    REFERENCING.sort(byPath),
    IMPORTERS.map(({ file }) => file).sort(byPath),
    `a src file imports, re-exports or lazily loads ${NAME} outside a .svelte template scan`
  );
});

test('every importer binds RadioCardGroup by its own name and uses it only as a tag', () => {
  assertFloor('RadioCardGroup importers', IMPORTERS.length, 13);
  assertFloor('RadioCardGroup render sites', SITES.length, 19);
  for (const { file, ast, imports } of IMPORTERS) {
    assert.deepEqual(
      imports.flatMap((node) => node.specifiers.map((spec) => [spec.type, spec.local.name])),
      [['ImportDefaultSpecifier', NAME]],
      `${file} must import the primitive once, as a default bound to \`${NAME}\``
    );
    const reached = [...walkNodes([ast.module, ast.instance, ast.fragment], new Set(imports))];
    assert.deepEqual(
      reached
        .filter((node) => node.type === 'Identifier' && node.name === NAME)
        .map((n) => n.start),
      [],
      `${file} reads \`${NAME}\` as a value — an alias, a <svelte:component>, a {@const} or a ` +
        'wrapper that passes it on — so a render site escapes this gate'
    );
  }
});

test('every render site passes value, groupName, onChange and a legend, and only declared names', () => {
  for (const { where, node, file, ast } of SITES) {
    assert.deepEqual(
      node.attributes.filter((attribute) => attribute.type !== 'Attribute').map((a) => a.type),
      [],
      `${where} spreads, binds or directs the group; it takes plain props only`
    );
    const names = node.attributes.map((attribute) => attribute.name);
    for (const name of REQUIRED) assert.ok(names.includes(name), `${where} passes no \`${name}\``);
    assert.ok(!lacksLegend(names), `${where} passes neither \`legend\` nor \`legendKey\``);
    const snippets = (node.fragment?.nodes ?? [])
      .filter((child) => child.type === 'SnippetBlock')
      .map((child) => child.expression.name);
    assert.deepEqual(
      undeclared([...names, ...snippets]),
      [],
      `${where} passes a name ${NAME} does not declare`
    );
    const options = resolvedExpression(
      node.attributes.find((attribute) => attribute.name === 'options'),
      file,
      ast
    );
    assert.ok(options, `${where} passes \`options\` this gate cannot resolve to a declaration`);
    const optionKeys = [...walkNodes(options)]
      .filter((inner) => inner.type === 'ObjectExpression')
      .flatMap((entry) => entry.properties.map(keyName));
    assert.deepEqual(
      optionKeys.filter((key) => RETIRED_OPTION_KEYS.includes(key)),
      [],
      `${where} passes a retired option key; disable a card through \`disabledOptions\``
    );
    const disabled = node.attributes.find((attribute) => attribute.name === 'disabledOptions');
    if (!disabled) continue;
    const list = resolvedExpression(disabled, file, ast);
    assert.equal(list?.type, 'ArrayExpression', `${where} passes disabledOptions as a non-literal`);
    for (const entry of list.elements) {
      assert.equal(entry?.type, 'ObjectExpression', `${where} lists a disabled option unreadably`);
      const reason = entry.properties.find((property) => keyName(property) === 'reason');
      assert.ok(
        reason && !(reason.value.type === 'Literal' && reason.value.value === ''),
        `${where} states a disabled option with no reason`
      );
    }
  }
});

test('every catalogue row renders the group directly with the required props, all declared', () => {
  assertFloor('RadioCardGroup catalogue rows', ROWS.length, 2);
  for (const { file, index, row } of ROWS) {
    const where = `${file}[${index}]`;
    assert.ok(!('fixture' in row) && !('data' in row), `${where} must render the group directly`);
    const props = row.props ?? {};
    const names = Object.keys(props);
    for (const name of ['value', 'groupName']) {
      assert.ok(names.includes(name), `${where} passes no \`${name}\``);
    }
    assert.ok(!lacksLegend(names), `${where} passes neither \`legend\` nor \`legendKey\``);
    assert.deepEqual(undeclared(names), [], `${where} passes a prop ${NAME} does not declare`);
    const options = props.options ?? [];
    for (const option of options) {
      assert.deepEqual(
        Object.keys(option).filter((key) => !OPTION_KEYS.has(key)),
        [],
        `${where} gives an option a key ${NAME} does not read`
      );
    }
    const values = new Set(options.map((option) => option.value));
    for (const entry of props.disabledOptions ?? []) {
      assert.ok(values.has(entry.value), `${where} disables \`${entry.value}\`, no option`);
      assert.ok(
        typeof entry.reason === 'string' && entry.reason.trim() !== '',
        `${where} disables \`${entry.value}\` with no reason`
      );
    }
  }
});
