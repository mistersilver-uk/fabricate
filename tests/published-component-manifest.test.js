/**
 * The published component manifest (issue 2426) against the code it names: the adapter binds
 * exactly the manifest's paths, and each entry's props, rest and data-only kinds match the
 * component's own `$props()` declaration. The test-only probe gives the gate a domain while the
 * shipped manifest is empty.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, posix, resolve } from 'node:path';
import { describe, it } from 'node:test';

import { PUBLISHED_COMPONENT_MANIFEST } from '../src/ui/publishedComponentManifest.js';

import { PROBE_ENTRY } from './fixtures/published-components/probeEntry.js';
import { readDeclaration, templateOf } from './helpers/apiConvention.js';
import { parseModule, walkNodes } from './helpers/moduleAst.js';

const repoRoot = resolve(import.meta.dirname, '..');
const ADAPTER = 'src/ui/publishedComponents.svelte.js';
const HOST = 'src/ui/svelte/published/PublishedComponentHost.svelte';

const byName = (a, b) => a.localeCompare(b);
const read = (file) => readFileSync(resolve(repoRoot, file), 'utf8');

/** The adapter's `.svelte` default imports as `{ local: repoPath }`, the boundary host aside. */
function adapterComponentImports() {
  const { ast } = parseModule(read(ADAPTER));
  const imports = {};
  for (const node of ast.body) {
    if (node.type !== 'ImportDeclaration' || !node.source.value.endsWith('.svelte')) continue;
    const path = posix.join(dirname(ADAPTER), node.source.value);
    if (path === HOST) continue;
    const local = node.specifiers.find((s) => s.type === 'ImportDefaultSpecifier')?.local.name;
    imports[local] = path;
  }
  return imports;
}

/** The adapter's `COMPONENTS` binding as `[path, local]` pairs, in source order. */
function adapterBindings() {
  const { ast } = parseModule(read(ADAPTER));
  for (const node of walkNodes(ast)) {
    if (node.type !== 'VariableDeclarator' || node.id?.name !== 'COMPONENTS') continue;
    const object = node.init.type === 'CallExpression' ? node.init.arguments[0] : node.init;
    return object.properties.map((property) => [property.key.value, property.value.name]);
  }
  throw new Error(`${ADAPTER} declares no COMPONENTS binding`);
}

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

/** Every local a `{@render}` tag calls. */
function renderedLocals(ast) {
  const called = new Set();
  for (const node of walkNodes(ast.fragment)) {
    if (node.type !== 'RenderTag') continue;
    const call =
      node.expression.type === 'ChainExpression' ? node.expression.expression : node.expression;
    if (call.callee?.type === 'Identifier') called.add(call.callee.name);
  }
  return called;
}

describe('the adapter binds exactly the manifest', () => {
  it('imports one component per manifest path and no other', () => {
    const imported = Object.values(adapterComponentImports()).sort(byName);
    const published = PUBLISHED_COMPONENT_MANIFEST.map((entry) => entry.path).sort(byName);
    assert.deepEqual(imported, published);
  });

  it('keys COMPONENTS by manifest path, in manifest order, to the import of that path', () => {
    const imports = adapterComponentImports();
    const bindings = adapterBindings();
    assert.deepEqual(
      bindings.map(([path]) => path),
      PUBLISHED_COMPONENT_MANIFEST.map((entry) => entry.path)
    );
    for (const [path, local] of bindings) assert.equal(imports[local], path);
  });

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
    it(`${entry.name} publishes only declared data props, and rest exactly when declared`, () => {
      const declaration = readDeclaration(templateOf(entry.path, read(entry.path)));
      assert.deepEqual(Object.keys(entry).sort(byName), [
        'name',
        'path',
        'props',
        'rest',
        'version',
      ]);
      assert.ok(Number.isInteger(entry.version) && entry.version > 0, 'a positive version');
      assert.equal(entry.name, declaration.component);
      for (const [key, spec] of Object.entries(entry.props)) {
        assert.ok(declaration.names.includes(key), `${key} is a declared prop`);
        assert.equal(spec.kind, 'data', `${key} is a data prop until #2427`);
      }
      assert.equal(entry.rest, declaration.rest !== null, 'rest matches the rest declaration');

      const locals = propLocals(declaration.ast);
      const rendered = renderedLocals(declaration.ast);
      for (const { key, local, bindable } of locals) {
        assert.equal(bindable, false, `${key} is not $bindable`);
        assert.equal(rendered.has(local), false, `${key} is not rendered as a snippet`);
      }
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
    assert.deepEqual([...renderedLocals(ast)], ['body']);
  });
});
