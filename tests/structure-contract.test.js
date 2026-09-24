/**
 * Proves the shared claim table itself (issue 1697): every target narrowing throws by name when
 * its binding is gone, a composed `{ member, property }` target is receiver-scoped, `claimsAcross`
 * is a quantifier, and the CSS and order claims reach the predicates they are wired to.
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { parseModule } from './helpers/moduleAst.js';
import { moduleAstOf } from './helpers/parsedSource.js';
import { parseComponent } from './helpers/svelteStructureContract.js';
import { suppliesProps, unreadProps } from './helpers/structureShapes.js';
import {
  CONTRACT_CLAIMS,
  claimsAcross,
  claimsForComponent,
  claimsOverCode,
  classMemberAst,
  labelOf,
  namedCodeAst,
  propertyAst,
  recordAst,
  structureOf,
} from './helpers/structureContract.js';

const CONFIG_APP = 'src/ui/InteractableConfigApp.svelte.js';

test('a target naming a missing binding throws by name rather than slicing the whole file', () => {
  const { ast } = moduleAstOf(CONFIG_APP);
  assert.throws(() => classMemberAst(ast, '_noSuchMember'), /no class member `_noSuchMember`/);
  assert.throws(() => namedCodeAst(ast, 'noSuchBinding'), /no binding `noSuchBinding`/);
  assert.throws(() => recordAst(ast, ['action', 'noSuchAction']), /no record with action/);
  assert.throws(() => propertyAst(ast, 'noSuchProperty'), /no property `noSuchProperty`/);
});

test('a composed member+property target scopes a claim to one seam, not to the file', () => {
  const seam = { file: CONFIG_APP, member: '_buildServices', property: 'setEnabled' };
  assert.equal(structureOf(seam).calls('planSetEnabled'), true);
  assert.equal(structureOf(seam).calls('planSetLocked'), false, 'the sibling seam is out of scope');
  assert.equal(structureOf(CONFIG_APP).calls('planSetLocked'), true, 'though the file calls it');
});

test('labelOf names each target shape, so a failure says which slice was read', () => {
  assert.equal(labelOf(CONFIG_APP), CONFIG_APP);
  assert.equal(labelOf({ file: CONFIG_APP, member: '_buildServices', property: 'setEnabled' }), `${CONFIG_APP} > _buildServices > setEnabled`);
  assert.equal(labelOf([CONFIG_APP, CONFIG_APP]), 'any of 2 files');
  assert.equal(labelOf({ dir: 'src/ui' }), 'any of src/ui');
  const path = { file: CONFIG_APP, constant: 'x', property: ['a', 'b'] };
  assert.equal(labelOf(path), `${CONFIG_APP} > x > a.b`);
});

test('claimsAcross answers "in at least one", which is a quantifier and not a join', () => {
  const across = claimsAcross([
    claimsForComponent(parseComponent('<div><Chip /></div>')),
    claimsForComponent(parseComponent('<div><Callout /></div>')),
  ]);
  assert.equal(across.renders('Chip'), true);
  assert.equal(across.renders('Callout'), true);
  assert.equal(across.renders('Banner'), false);
});

const STYLED = [
  '<div class="card"><Inner /><span class="grid"></span></div>',
  '<style>',
  '  .card .grid { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); }',
  '</style>',
].join('\n');

test('the CSS claim compares a declaration value in full and fails on an absent selector', () => {
  const subject = claimsForComponent(parseComponent(STYLED));
  const grid = ['card', 'grid'];
  assert.equal(subject.styleDeclares([grid, 'display', 'grid']), true);
  assert.equal(subject.styleDeclares([grid, 'grid-template-columns', 'repeat(3, minmax(0']), false);
  assert.equal(subject.styleDeclares([grid, 'max-width']), false);
  assert.throws(() => subject.styleDeclares([['card', 'gone'], 'display']), /no scoped rule/);
});

test('the order claim spans kinds, and CONTRACT_CLAIMS wires both new kinds to their predicate', () => {
  const subject = claimsForComponent(parseComponent(STYLED));
  assert.equal(subject.rendersBefore(['Inner', { class: 'grid' }]), true);
  assert.equal(subject.rendersBefore([{ class: 'grid' }, 'Inner']), false);
  assert.equal(CONTRACT_CLAIMS.rendersBefore.ask, 'rendersBefore');
  assert.equal(CONTRACT_CLAIMS.styleDeclares.holds, true);
  assert.equal(CONTRACT_CLAIMS.styleDeclaresNo.holds, false);
});

const CENSUS = [
  'class Manager {',
  '  basis() { return null; }',
  '  create(system) { const { ids } = this.basis(system); return ids; }',
  '  update(system) { return this.basis(system)?.ids ?? new Set(); }',
  '  list() { return []; }',
  '}',
].join('\n');

test('the census claim is an exact member set, and the fallback claim finds a defaulted call', () => {
  const subject = claimsOverCode(parseModule(CENSUS).ast);
  assert.equal(subject.callers(['basis', ['update', 'create']]), true, 'order-free');
  assert.equal(subject.callers(['basis', ['create']]), false, 'an unnamed site fails');
  assert.equal(subject.callers(['basis', ['create', 'update', 'list']]), false, 'so does a gone one');
  assert.equal(subject.fallsBack(['basis', 'Set']), true);
  assert.equal(subject.fallsBack(['list', 'Set']), false, 'a fallback from another call is not it');
  const other = claimsOverCode(parseModule('const ids = basis() || new Map();').ast);
  assert.equal(other.fallsBack(['basis', 'Set']), false, 'nor is a fallback to another class');
  assert.equal(CONTRACT_CLAIMS.callers.ask, 'callers');
  assert.equal(CONTRACT_CLAIMS.fallsBackNo.holds, false);
});

const MODULE_CENSUS = [
  'export async function add(io, system) { const { ids } = io.basis(system); return ids; }',
  'export function replace(io, system) { return io.basis(system)?.ids ?? new Set(); }',
  'export function bag(manager) { return { basis: (s) => manager._basis(s) }; }',
  CENSUS,
].join('\n');

test('the module census claim is an exact function set, blind to class members', () => {
  const subject = claimsOverCode(parseModule(MODULE_CENSUS).ast);
  assert.equal(subject.fnCallers(['basis', ['replace', 'add']]), true, 'order-free');
  assert.equal(subject.fnCallers(['basis', ['add']]), false, 'an unnamed site fails');
  assert.equal(subject.fnCallers(['basis', ['add', 'replace', 'bag']]), false, 'a thunk is not one');
  assert.equal(subject.callers(['basis', ['update', 'create']]), true, 'members stay the other kind');
  assert.equal(CONTRACT_CLAIMS.fnCallers.ask, 'fnCallers');
});

test('the shape claim matches an expression or statement shape for shape, and no comment', () => {
  const source = [
    'function open(id) {',
    "  // openRoute('entry', id);",
    '  if (!id) return false;',
    '  return store?.world?.save?.(',
    '    id,',
    '  );',
    '}',
  ].join('\n');
  const subject = claimsOverCode(parseModule(source).ast);
  assert.equal(subject.contains('store?.world?.save?.(id)'), true, 'reflowed, `?.` kept');
  assert.equal(
    subject.contains('store.world.save(id)'),
    false,
    'but the unchained call is another'
  );
  assert.equal(subject.contains('if (!id) return false;'), true, 'a function-body statement');
  assert.equal(
    subject.contains(
      'function open(id) { if (!id) return false; return store?.world?.save?.(id); }'
    ),
    true,
    'a whole declaration, its comment ignored'
  );
  assert.equal(
    subject.contains("openRoute('entry', id)"),
    false,
    'a commented-out call is no code'
  );
  assert.throws(() => subject.contains('if ('), /not one JavaScript expression or statement/);
  assert.equal(CONTRACT_CLAIMS.contains.ask, 'contains');
});

test('the import claim reads every spelling, lists a namespace, and fails closed on import(x)', () => {
  const source = [
    "import { x } from './componentScope.js';",
    "export { y } from './essenceScope';",
    "import * as all from './toolScope.js';",
    "const a = await import('./toolScope');",
    'const b = await import(`./componentScope.js`);',
  ].join('\n');
  const subject = claimsOverCode(parseModule(source).ast);
  const every = ['./componentScope.js', './componentScope.js', './essenceScope', './toolScope'];
  assert.equal(subject.importSpecifiers(['scope', [...every, '* as ./toolScope.js']]), true);
  assert.equal(subject.importSpecifiers(['scope', every]), false, 'a namespace import is its own');
  assert.equal(subject.importSpecifiers(['essence', ['./essenceScope']]), true, 'narrowed by name');
  const computed = claimsOverCode(
    parseModule('await import(NAME); await import(`./${n}.js`);').ast
  );
  assert.equal(
    computed.importSpecifiers(['scope', []]),
    false,
    'an unreadable import() is not none'
  );
  assert.equal(
    computed.importSpecifiers(['scope', ['import(<computed>)', 'import(<computed>)']]),
    true
  );
});

test('the read tally names every root and spelling, and a destructure is left to the key claim', () => {
  const source = [
    'const a = selected?.toolBreakage?.authority;',
    "const b = selected['toolBreakage'].source;",
    'const c = systems[0].toolBreakage;',
    'const { toolBreakage } = selected;',
    "if (view === 'tools' || view === 'items' || 'tools' === view || view !== 'gone') go();",
  ].join('\n');
  const subject = claimsOverCode(parseModule(source).ast);
  const tally = [
    ['?.toolBreakage', 1],
    ['selected.toolBreakage.authority', 1],
    ['selected.toolBreakage.source', 1],
  ];
  assert.equal(subject.propertyReads(['toolBreakage', tally]), true);
  assert.equal(subject.propertyReads(['toolBreakage', tally.slice(1)]), false, 'a computed root');
  assert.equal(subject.key('toolBreakage'), true, 'the destructure the tally cannot see');
  assert.equal(subject.comparedLiterals(['view', ['items', 'tools']]), true);
  assert.equal(subject.comparedLiterals(['view', ['tools']]), false, 'an exact set');
});

const CALL_SITE = [
  '<Screen label="Save" flag onOpen={(id) => open(id)} bind:state={held} />',
  '<Screen label="Back" onOpen={() => {}} />',
  '<button data-create onclick={create}>New</button>',
].join('\n');

test('the template claims locate by name and attribute, and compare values shape for shape', () => {
  const subject = claimsForComponent(parseComponent(CALL_SITE));
  const saved = { at: 'Screen', where: ['label', 'Save'] };
  assert.equal(subject.gives({ ...saved, attribute: 'onOpen', is: '(id) => open(id)' }), true);
  assert.equal(subject.gives({ ...saved, attribute: 'flag', is: true }), true, 'a bare attribute');
  assert.equal(subject.gives({ ...saved, attribute: 'bind:state', is: 'held' }), true);
  const every = { at: 'Screen', attribute: 'onOpen', is: '(id) => open(id)' };
  assert.equal(subject.gives(every), false, 'every located node');
  assert.equal(subject.gives({ at: 'Gone', attribute: 'x', is: 'y' }), false, 'none is no pass');
  const names = ['label', 'flag', 'onOpen', 'bind:state'];
  assert.equal(subject.attributeOrder({ ...saved, names }), true);
  assert.equal(subject.attributeOrder({ ...saved, names: names.toReversed() }), false, 'in order');
  assert.equal(subject.rendersTimes(['Screen', 2]), true);
  assert.equal(subject.rendersTimes([{ where: ['data-create', true] }, 1]), true);
  assert.equal(subject.rendersTimes([saved, 2]), false);
});

test('the prop claims resolve a spread, hold an exemption live, and skip the declaration', () => {
  const site = parseComponent(
    [
      '<script>',
      '  const bundle = $derived({ scope: null, systems: [] });',
      '</script>',
      '<Screen {...bundle} label="x" bind:state={held} />',
    ].join('\n')
  );
  const screen = parseComponent(
    [
      '<script>',
      '  let { scope, systems, label, state = $bindable(), extra = 0 } = $props();',
      '</script>',
      '{scope}{systems}{label}{state}{other.extra}{({ extra: 1 })}',
    ].join('\n')
  );
  const row = { component: 'Screen', exempt: ['extra'] };
  assert.equal(suppliesProps(site, screen, row), true);
  assert.equal(suppliesProps(site, screen, { component: 'Screen' }), false, 'one is unsupplied');
  assert.equal(suppliesProps(site, screen, { ...row, exempt: ['extra', 'label'] }), false, 'stale');
  assert.equal(suppliesProps(site, parseComponent('<p></p>'), row), false, 'nothing declared');
  assert.deepEqual(unreadProps(screen), ['extra'], 'nor is a declaration, a member or a key');
  assert.equal(CONTRACT_CLAIMS.propsUnread.ask, 'propsUnread');
});
