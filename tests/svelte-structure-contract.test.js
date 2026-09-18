/**
 * Proves every predicate `tests/helpers/svelteStructureContract.js` exports, the module-AST
 * predicates beside them, and the AST-only read seam they are reached through — plus that each
 * header still states the policy it exists to enforce (issues 1658, 1691).
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { test } from 'node:test';

import {
  componentAstOf,
  componentAstsIn,
  componentScopeOf,
  moduleAstOf,
  moduleAstsIn,
} from './helpers/parsedSource.js';
import {
  declaredConstant as declaredConstantOf,
  importsModule as importsModuleOf,
  importsModuleLazily,
  parseModule,
  referencesIdentifier as referencesIdentifierOf,
} from './helpers/moduleAst.js';
import {
  carriesSpread,
  containsLiteral,
  declaredConstant,
  declaresAttribute,
  importedModules,
  importsModule,
  parseComponent,
  parseComponentScope,
  passesProp,
  readsGlobal,
  referencesIdentifier,
  spellsLiteral,
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

/** A real component and a real module, so the seam is proved against the tree it reads. */
const ROOT_COMPONENT = 'src/ui/svelte/apps/manager/CraftingSystemManagerRoot.svelte';
const APP_MODULE = 'src/ui/SvelteCraftingSystemManagerApp.svelte.js';

test('the read seam hands back each vocabulary, parses one file once, and returns no text', () => {
  const component = componentAstOf(ROOT_COMPONENT);
  assert.ok(Boolean(component.fragment), 'the component vocabulary carries a template fragment');
  assert.equal(componentAstOf(ROOT_COMPONENT), component, 'and is parsed once, not per caller');
  const scope = componentScopeOf(ROOT_COMPONENT);
  assert.ok(Boolean(scope.scopeManager?.globalScope), 'the scope vocabulary resolves references');
  const module = moduleAstOf(APP_MODULE);
  assert.equal(module.ast.type, 'Program', 'a .js target is an ESTree program');
  assert.ok(Boolean(module.scopeManager), 'with its own scope manager');
  for (const value of [component, scope, module]) assert.notEqual(typeof value, 'string');
});

test('the directory forms answer one AST per file, by extension', () => {
  const dir = 'src/ui/svelte/apps/manager/essences';
  const components = componentAstsIn(dir);
  assert.ok(components.length > 0, 'the Essence Studio directory holds components');
  assert.ok(
    components.every((ast) => Boolean(ast.fragment)),
    'every entry is a parsed component, so a caller can quantify over them'
  );
  assert.ok(
    moduleAstsIn(dir).every((parsed) => parsed.ast.type === 'Program'),
    'and the .js half answers programs'
  );
});

test('the seam header still forbids the one text-shaped route an AST return leaves open', () => {
  const header = readFileSync(resolve(import.meta.dirname, 'helpers/parsedSource.js'), 'utf8').slice(
    0,
    1200
  );
  assert.match(header, /returns ASTs and never source\s+\* text/);
  assert.match(header, /JSON\.stringify\(ast\)\.includes/);
});

/** `game` read once per place a component can spell code, so each leg is proved alone. */
const GLOBAL_READ_FIXTURES = Object.freeze({
  'the instance script': "<script>const who = game.user.name;</script><div>{who}</div>",
  'the module script': "<script module>export const who = game.user.name;</script><div />",
  'a template expression': '<div>{game.user.name}</div>',
  'a host member read': '<script>const who = globalThis.game.user.name;</script><div>{who}</div>',
  'a computed host read': "<script>const who = globalThis['game'].user;</script><div>{who}</div>",
});

for (const [place, source] of Object.entries(GLOBAL_READ_FIXTURES)) {
  test(`readsGlobal sees a Foundry global read in ${place}`, () => {
    assert.equal(readsGlobal(parseComponentScope(source), 'game'), true);
  });
}

/** The three shapes a `\bgame\b` regex called reads and a scope-resolved predicate must not. */
const GLOBAL_NEGATIVE_FIXTURES = Object.freeze({
  'a local binding of the same name': '<script>const game = { user: 1 };</script><div>{game.user}</div>',
  'a member property of another object': '<script>const who = props.game.user;</script><div>{who}</div>',
  'an object-literal key': '<script>const bag = { game: 1 };</script><div>{bag.game}</div>',
});

for (const [shape, source] of Object.entries(GLOBAL_NEGATIVE_FIXTURES)) {
  test(`readsGlobal denies ${shape}`, () => {
    assert.equal(readsGlobal(parseComponentScope(source), 'game'), false);
  });
}

test('readsGlobal answers per name, and the manager root reads none of the four', () => {
  const root = componentScopeOf(ROOT_COMPONENT);
  for (const name of ['game', 'ui', 'Hooks', 'CONFIG']) {
    assert.equal(readsGlobal(root, name), false, `the root must not read ${name}`);
  }
  // A host read the name set deliberately EXCLUDES, proving the predicate would have seen it.
  assert.equal(readsGlobal(root, 'foundry'), true, 'the root does reach globalThis.foundry.utils');
});

/** One fixture for the three structural predicates the negatives converted onto. */
const DECLARATION_FIXTURE = [
  '<script module>',
  "  const KIND = 'studio';",
  '</script>',
  '<script>',
  '  const total = $derived(rows.length);',
  '  let open = $state(false);',
  '</script>',
  '<div class="manager-shelf" data-shelf>',
  '  {#each rows as row}',
  '    {@const badge = badgeFor(row)}',
  '    <span>{badge}</span>',
  '  {/each}',
  '  {KIND}{total}{open}',
  '</div>',
].join('\n');

const declarations = parseComponent(DECLARATION_FIXTURE);

test('declaredConstant reads both scripts and a template @const, and denies a let', () => {
  assert.equal(declaredConstant(declarations, 'KIND'), true, 'the module script');
  assert.equal(declaredConstant(declarations, 'total'), true, 'the instance script');
  assert.equal(declaredConstant(declarations, 'badge'), true, 'a template @const');
  assert.equal(declaredConstant(declarations, 'open'), false, 'a let is not a const');
  assert.equal(declaredConstant(declarations, 'absent'), false);
});

test('referencesIdentifier reaches script and template alike, and denies one absent', () => {
  assert.equal(referencesIdentifier(declarations, 'badgeFor'), true, 'a template call');
  assert.equal(referencesIdentifier(declarations, 'rows'), true);
  assert.equal(referencesIdentifier(declarations, 'openLegacySystemSettings'), false);
});

test('containsLiteral sees an attribute value, a class token and a script string', () => {
  assert.equal(containsLiteral(declarations, 'manager-shelf'), true, 'an attribute value');
  assert.equal(containsLiteral(declarations, 'studio'), true, 'a script string');
  assert.equal(containsLiteral(declarations, 'manager-titlebar-icon'), false);
});

test('spellsLiteral needs the whole literal, which a longer neighbour cannot satisfy', () => {
  const keys = parseComponent("<div>{text('FABRICATE.Manager.Titlebar.Premium', 'PREMIUM')}</div>");
  assert.equal(containsLiteral(keys, 'FABRICATE.Manager.Title'), true, 'the prefix is contained');
  assert.equal(
    spellsLiteral(keys, 'FABRICATE.Manager.Title'),
    false,
    'but a key nothing spells in full is not spelled — the difference a source pin could not make'
  );
  assert.equal(spellsLiteral(keys, 'FABRICATE.Manager.Titlebar.Premium'), true);
});

/** The module-AST half, on a fixture rather than on a production file that may move. */
const MODULE_FIXTURE = [
  "import { registerApp } from './registry.js';",
  "export * from './surface.js';",
  'const LOADER = async () => {',
  "  const mod = await import('./lazy.js');",
  '  return mod.default;',
  '};',
  'let counter = 0;',
  'export { LOADER, counter, registerApp };',
].join('\n');

const moduleFixture = parseModule(MODULE_FIXTURE).ast;

test('the module predicates separate a static import from a lazy one', () => {
  assert.equal(importsModuleOf(moduleFixture, './registry.js'), true);
  assert.equal(importsModuleOf(moduleFixture, './surface.js'), true, 'a re-export counts');
  assert.equal(importsModuleOf(moduleFixture, './lazy.js'), false, 'a dynamic import is not static');
  assert.equal(importsModuleLazily(moduleFixture, './lazy.js'), true);
  assert.equal(importsModuleLazily(moduleFixture, './registry.js'), false);
});

test('the module predicates answer for a constant and a named reference', () => {
  assert.equal(declaredConstantOf(moduleFixture, 'LOADER'), true);
  assert.equal(declaredConstantOf(moduleFixture, 'counter'), false, 'a let is not a const');
  assert.equal(referencesIdentifierOf(moduleFixture, 'registerApp'), true);
  assert.equal(referencesIdentifierOf(moduleFixture, 'SvelteRecipeManagerApp'), false);
});
