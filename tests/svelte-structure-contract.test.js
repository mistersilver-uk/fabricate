/**
 * Proves every predicate `tests/helpers/svelteStructureContract.js` exports, and that its header
 * still states the policy the helper exists to enforce (issue 1658).
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { test } from 'node:test';

import {
  carriesSpread,
  declaresAttribute,
  importedModules,
  importsModule,
  parseComponent,
  passesProp,
  renderedComponents,
  renderedElements,
  rendersComponent,
  rendersElement,
} from './helpers/svelteStructureContract.js';
import { walkElements } from './helpers/svelteTemplateScan.js';

/** A second fixture for the shapes the first deliberately does not carry. */
const EDGE_FIXTURE = [
  '<script module>',
  "  export const KIND = 'x';",
  '</script>',
  '<script>',
  "  import { helper } from './helper.js';",
  "  export * from './reexported.js';",
  "  const lazy = () => import('./dynamic.js');",
  '</script>',
  '',
  '<svelte:element this="label" class="wrap">',
  '  <Chip {...rest} />',
  '  <Chip class:tone={true} />',
  '  <Chip tone="a" />',
  '</svelte:element>',
].join('\n');

const edge = parseComponent(EDGE_FIXTURE);

/** One fixture exercising every predicate: a nested block, a directive, and two imports. */
const FIXTURE = [
  '<script>',
  "  import Chip from './Chip.svelte';",
  "  import { tone } from '../stores/tone.js';",
  '  let open = $state(false);',
  '</script>',
  '',
  '<div class="wrap">',
  '  <select bind:value={open}>',
  '    <option value="a">a</option>',
  '  </select>',
  '  {#if open}',
  '    <Chip label="one" tone={tone} />',
  '  {/if}',
  '  {#each [1, 2] as n}',
  '    <Chip label={n} tone={tone} />',
  '  {/each}',
  '</div>',
].join('\n');

const ast = parseComponent(FIXTURE);

test('renderedComponents lists every component, including inside if and each blocks', () => {
  assert.deepStrictEqual(renderedComponents(ast), ['Chip', 'Chip']);
});

test('rendersComponent answers for a component nested in a block, and denies one absent', () => {
  assert.equal(rendersComponent(ast, 'Chip'), true);
  assert.equal(rendersComponent(ast, 'Callout'), false);
});

test('renderedElements lists raw elements lower-cased, and rendersElement answers for one', () => {
  assert.deepStrictEqual(renderedElements(ast), ['div', 'select', 'option']);
  assert.equal(rendersElement(ast, 'SELECT'), true);
  assert.equal(rendersElement(ast, 'textarea'), false);
});

test('passesProp requires every occurrence to declare it, and is false when none is rendered', () => {
  assert.equal(passesProp(ast, 'Chip', 'tone'), true);
  assert.equal(passesProp(ast, 'Chip', 'disabled'), false);
  assert.equal(passesProp(ast, 'Callout', 'tone'), false);
});

test('passesProp is false when only some occurrences declare the prop', () => {
  const partial = parseComponent('<div><Chip tone="a" /><Chip /></div>');
  assert.equal(passesProp(partial, 'Chip', 'tone'), false);
});

test('declaresAttribute sees a directive as well as a plain attribute', () => {
  const select = parseComponent('<select bind:value={x} id="s"></select>');
  let node;
  walkElements(select.fragment, (candidate) => {
    if (candidate.type === 'RegularElement' && candidate.name === 'select') node = candidate;
  });
  assert.ok(node, 'the fixture renders a select');
  assert.equal(declaresAttribute(node, 'id'), true);
  assert.equal(declaresAttribute(node, 'value'), true);
  assert.equal(declaresAttribute(node, 'name'), false);
});

test('importedModules and importsModule read the instance script', () => {
  assert.deepStrictEqual(importedModules(ast), ['./Chip.svelte', '../stores/tone.js']);
  assert.equal(importsModule(ast, '../stores/tone.js'), true);
  assert.equal(importsModule(ast, './Nothing.svelte'), false);
});

test('the helper header still states the policy that string includes is not to be added', () => {
  const header = readFileSync(
    resolve(import.meta.dirname, 'helpers/svelteStructureContract.js'),
    'utf8'
  ).slice(0, 1600);
  assert.match(header, /Do not add a string `includes` on component source to a test\./);
  // Pin the residue sentence, not a heading word: a heading can stay while the claim under it
  // rots, which is how a coverage figure nobody re-derived survived plan review.
  assert.match(header, /exact JS expression text/);
  assert.match(header, /loop variable rather than a literal/);
});

test('a svelte:element with a literal tag is a rendered element', () => {
  assert.equal(rendersElement(edge, 'label'), true);
});

test('a class: directive is not a prop, so passesProp does not accept it', () => {
  const classOnly = parseComponent('<div><Chip class:tone={true} /></div>');
  assert.equal(passesProp(classOnly, 'Chip', 'tone'), false);
});

test('a bind: directive does count as passing the prop', () => {
  const bound = parseComponent('<div><Chip bind:tone={x} /></div>');
  assert.equal(passesProp(bound, 'Chip', 'tone'), true);
});

test('a spread makes the prop undecidable, reported as false and distinguishable', () => {
  const spread = parseComponent('<div><Chip {...rest} /></div>');
  assert.equal(passesProp(spread, 'Chip', 'tone'), false);
  const [occurrence] = [];
  let node;
  walkElements(spread.fragment, (candidate) => {
    if (candidate.type === 'Component') node = candidate;
  });
  assert.equal(occurrence, undefined);
  assert.equal(carriesSpread(node), true);
});

test('importedModules sees the module script, a re-export and a dynamic import', () => {
  const found = importedModules(edge);
  assert.ok(found.includes('./helper.js'), 'static import');
  assert.ok(found.includes('./reexported.js'), 're-export');
  assert.ok(found.includes('./dynamic.js'), 'dynamic import');
});
