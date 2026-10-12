/**
 * The published component manifest (issue 2426) against each component's parsed declaration: its
 * props, rest and data-only kinds, and a stylesheet and template that need no Fabricate ancestor.
 * The test-only probe gives the gate a domain while the shipped manifest is empty; the adapter's
 * binding of each path is the mounted suite's.
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { PUBLISHED_COMPONENT_MANIFEST } from '../src/ui/publishedComponentManifest.js';

import { PROBE_ENTRY } from './fixtures/published-components/probeEntry.js';
import { readDeclaration, templateOf } from './helpers/apiConvention.js';
import { walkNodes } from './helpers/moduleAst.js';
import { componentAstOf } from './helpers/parsedSource.js';

const byName = (a, b) => a.localeCompare(b);

const APP_ROOTS = new Set(['fabricate', 'fabricate-app', 'fabricate-manager']);
const APP_TOKENS = ['var(--fab-manager-', 'var(--font-primary'];

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

/** What a component's own stylesheet and template borrow from a Fabricate window, by rule. */
function ancestorDependencies(ast) {
  const found = new Set();
  for (const node of walkNodes(ast.css)) {
    if (node.type === 'ClassSelector' && APP_ROOTS.has(node.name)) found.add('app-root selector');
    if (node.type === 'Atrule' && node.name === 'container') found.add('@container');
    if (node.type !== 'Declaration') continue;
    for (const token of APP_TOKENS) if (node.value.includes(token)) found.add(token);
  }
  for (const node of walkNodes(ast.fragment)) {
    if (classNames(node).includes('visually-hidden')) found.add('.visually-hidden');
  }
  return [...found].sort(byName);
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
    it(`${entry.name} publishes only declared data props, and rest exactly when declared`, () => {
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
      for (const [key, spec] of Object.entries(entry.props)) {
        assert.ok(declaration.names.includes(key), `${key} is a declared prop`);
        assert.equal(spec.kind, 'data', `${key} is a data prop until issue 2427`);
        assert.ok(
          spec.required === undefined || typeof spec.required === 'boolean',
          `${key} is required by a boolean, or not at all`
        );
      }
      assert.equal(entry.rest, declaration.rest !== null, 'rest matches the rest declaration');

      const locals = propLocals(declaration.ast);
      const rendered = renderedLocals(declaration.ast);
      for (const { key, local, bindable } of locals) {
        assert.equal(bindable, false, `${key} is not $bindable`);
        assert.equal(rendered.has(local), false, `${key} is not rendered as a snippet`);
      }
    });

    it(`${entry.name} styles itself without a Fabricate ancestor`, () => {
      assert.deepEqual(ancestorDependencies(componentAstOf(entry.path)), []);
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
      'var(--fab-manager-',
      'var(--font-primary',
    ]);
    for (const root of ['.fabricate', '.fabricate-app']) {
      const scoped = templateOf('Root.svelte', `<style>:global ${root} .a { color: red; }</style>`);
      assert.deepEqual(ancestorDependencies(scoped.ast), ['app-root selector'], root);
    }
  });
});
