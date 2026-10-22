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
import { walkNodes } from '../helpers/moduleAst.js';
import { componentAstOf } from '../helpers/parsedSource.js';
import { repoRoot } from '../helpers/sourceScan.js';
import { renderedNodes } from '../helpers/structureShapes.js';
import { svelteFiles } from '../helpers/svelteTemplateScan.js';

const NAME = 'RadioCardGroup';
const COMPONENT = `src/ui/svelte/components/${NAME}.svelte`;
const DECLARED = new Set(
  readDeclaration({ file: COMPONENT, ast: componentAstOf(COMPONENT) }).names
);
const REQUIRED = Object.freeze(['value', 'groupName', 'onChange']);
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

const SITES = IMPORTERS.flatMap(({ file, ast }) =>
  renderedNodes(ast, NAME).map((node) => ({ where: `${file} @${node.start}`, node }))
);

const ROWS = catalogueEntries(repoRoot).filter(({ row }) => row.path === COMPONENT);

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
  for (const { where, node } of SITES) {
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
    const reasons = [...walkNodes(node.attributes.find((a) => a.name === 'disabledOptions'))]
      .filter((inner) => inner.type === 'ObjectExpression')
      .map((entry) => entry.properties.find((property) => property.key?.name === 'reason'));
    assert.ok(
      reasons.every((reason) => reason && reason.value.value !== ''),
      `${where} states a disabled option with no reason`
    );
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
    const values = new Set((props.options ?? []).map((option) => option.value));
    for (const entry of props.disabledOptions ?? []) {
      assert.ok(values.has(entry.value), `${where} disables \`${entry.value}\`, no option`);
      assert.ok(
        typeof entry.reason === 'string' && entry.reason.trim() !== '',
        `${where} disables \`${entry.value}\` with no reason`
      );
    }
  }
});
