/**
 * Proves every structure predicate, the module-AST predicates beside them, the AST-only read seam
 * they are reached through, and that each header still states its policy (issues 1658, 1691).
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
  attributeExpression,
  attributeNames,
  attributeValue,
  boundDirectives,
  carriesSpread,
  containsLiteral,
  declaredConstant,
  declaresAttribute,
  declaresProp,
  importedModules,
  importsModule,
  parseComponent,
  parseComponentScope,
  passesProp,
  propDefault,
  propNone,
  readsGlobal,
  referencesIdentifier,
  requiresProp,
  rendersBefore,
  spellsLiteral,
  styleDeclares,
  styleRule,
  styleRules,
  renderedComponents,
  renderedElements,
  rendersComponent,
  rendersElement,
} from './helpers/svelteStructureContract.js';
import { walkElements } from './helpers/svelteTemplateScan.js';

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

test('propNone denies the partial case that negating passesProp would accept', () => {
  const partial = parseComponent('<div><Chip tone="a" /><Chip /></div>');
  assert.equal(passesProp(partial, 'Chip', 'tone'), false, 'not every occurrence declares it');
  assert.equal(propNone(partial, 'Chip', 'tone'), false, 'but one does, so "passes no" is false');
  assert.equal(propNone(parseComponent('<div><Chip /></div>'), 'Chip', 'tone'), true);
  assert.equal(propNone(ast, 'Callout', 'tone'), false, 'an unrendered component is not a contract');
});

test('attributeValue reads a static value only, and attributeNames lists directives too', () => {
  const card = parseComponent('<div><Chip tone="warn" label={name} bind:open /></div>');
  let chip;
  walkElements(card.fragment, (candidate) => {
    if (candidate.type === 'Component') chip = candidate;
  });
  assert.equal(attributeValue(chip, 'tone'), 'warn');
  assert.equal(attributeValue(chip, 'label'), undefined, 'an expression has no static value');
  assert.equal(attributeValue(chip, 'absent'), undefined);
  assert.deepStrictEqual([...attributeNames(card)].sort(), ['label', 'open', 'tone']);
  assert.equal(attributeNames(parseComponent('<div />')).has('class'), false);
});

test('declaresProp and requiresProp separate a defaulted prop from one with no fallback', () => {
  const props = parseComponent(
    '<script>let { store, services = null, ...rest } = $props();</script><div />'
  );
  assert.equal(declaresProp(props, 'store'), true);
  assert.equal(declaresProp(props, 'services'), true);
  assert.equal(declaresProp(props, 'managerExtensions'), false);
  assert.equal(requiresProp(props, 'store'), true, 'no default, so an unthreaded caller fails');
  assert.equal(requiresProp(props, 'services'), false, 'a default answers for the caller instead');
  assert.equal(declaresProp(parseComponent('<script>let { store } = other();</script><div />'), 'store'), false);
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

test('attributeExpression reads the expression form only, and denies the static one', () => {
  const card = parseComponent('<div><Chip onclick={close} tone="warn" /></div>');
  let chip;
  walkElements(card.fragment, (candidate) => {
    if (candidate.type === 'Component') chip = candidate;
  });
  assert.equal(attributeExpression(chip, 'onclick')?.name, 'close');
  assert.equal(attributeExpression(chip, 'tone'), undefined, 'a static value is not an expression');
  assert.equal(attributeExpression(chip, 'absent'), undefined);
});

test('boundDirectives lists bind: targets and nothing else a directive spells', () => {
  const bound = parseComponent(
    '<div><input bind:value={name} /><Chip class:tone={true} onclick={close} bind:this={el} /></div>'
  );
  assert.deepStrictEqual([...boundDirectives(bound)].sort(), ['this', 'value']);
  assert.equal(boundDirectives(parseComponent('<div />')).has('value'), false);
});

test('propDefault answers the literal default, and undefined for anything else', () => {
  const props = parseComponent(
    "<script>let { classPrefix = 'manager-scoped-preview', rows = [], store } = $props();</script><div />"
  );
  assert.equal(propDefault(props, 'classPrefix'), 'manager-scoped-preview');
  assert.equal(propDefault(props, 'rows'), undefined, 'a non-literal default is not a stated value');
  assert.equal(propDefault(props, 'store'), undefined, 'and a required prop declares none');
  assert.equal(propDefault(props, 'absent'), undefined);
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
  assert.equal(readsGlobal(root, 'foundry'), true, 'the root does reach globalThis.foundry.utils');
});

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

const STYLED = [
  '<div class="books-tab"><span class="item-links"></span></div>',
  '<style>',
  '  .books-tab .item-links {',
  '    display: grid;',
  '    grid-template-columns: repeat(3, minmax(0, 1fr));',
  '  }',
  '  .item-links { margin: 0; }',
  '  @media (max-width: 40rem) {',
  '    .books-tab .item-links { gap: 0.25rem; }',
  '  }',
  '  :global(.fabricate-manager) .tab-empty { width: 100%; }',
  '  [data-state="on"].pill { color: red; }',
  '</style>',
].join('\n');

const styled = parseComponent(STYLED);

test('styleRules reaches the rules an at-rule block nests as well as the top-level ones', () => {
  assert.equal(styleRules(styled).length, 5);
  assert.equal(styleRules(parseComponent('<div></div>')).length, 0);
});

test('styleRule pins the compound chain a bare-class rule beside it cannot satisfy', () => {
  const rule = styleRule(styled, ['books-tab', 'item-links']);
  const properties = rule.block.children.map((node) => node.property);
  assert.deepStrictEqual(properties, ['display', 'grid-template-columns']);
});

test('styleRule throws on an absent selector, so a CSS claim cannot pass vacuously', () => {
  assert.throws(() => styleRule(styled, ['books-tab', 'missing']), /no scoped rule/);
  assert.throws(() => styleRule(parseComponent('<div></div>'), ['any']), /no scoped rule/);
});

test('styleRule addresses a :global() leg and an attribute selector structurally', () => {
  assert.ok(styleRule(styled, [{ global: 'fabricate-manager' }, 'tab-empty']));
  assert.ok(styleRule(styled, [[{ attribute: ['data-state', 'on'] }, 'pill']]));
  assert.throws(() => styleRule(styled, [{ global: 'fabricate-manager' }]), /no scoped rule/);
});

test('styleDeclares compares the whole value, not a fragment of it', () => {
  const grid = ['books-tab', 'item-links'];
  assert.equal(styleDeclares(styled, [grid, 'grid-template-columns']), true);
  assert.equal(
    styleDeclares(styled, [grid, 'grid-template-columns', 'repeat(3, minmax(0, 1fr))']),
    true
  );
  assert.equal(styleDeclares(styled, [grid, 'grid-template-columns', 'repeat(3, minmax(0']), false);
  assert.equal(styleDeclares(styled, [grid, 'max-width']), false);
});

const ORDERED = [
  '<section>',
  '  <Tabs />',
  '  <div class="chips">',
  '    {#each chips as chip}<Chip />{/each}',
  '    <Popover />',
  '  </div>',
  '  <button data-remove="result-set"></button>',
  '</section>',
].join('\n');

const ordered = parseComponent(ORDERED);

test('rendersBefore orders components, blocks, classes and attributes in one list', () => {
  assert.equal(rendersBefore(ordered, ['Tabs', 'Popover']), true);
  assert.equal(rendersBefore(ordered, ['Popover', 'Tabs']), false);
  assert.equal(rendersBefore(ordered, ['EachBlock', 'Popover']), true);
  assert.equal(rendersBefore(ordered, [{ class: 'chips' }, 'EachBlock']), true);
  assert.equal(
    rendersBefore(ordered, ['Popover', { attribute: ['data-remove', 'result-set'] }]),
    true
  );
});

test('rendersBefore is false when either end is absent, rather than vacuously true', () => {
  assert.equal(rendersBefore(ordered, ['Tabs', 'Missing']), false);
  assert.equal(rendersBefore(ordered, ['Missing', 'Tabs']), false);
});
