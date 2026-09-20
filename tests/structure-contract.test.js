/**
 * Proves the shared claim table itself (issue 1697): every target narrowing throws by name when
 * its binding is gone, a composed `{ member, property }` target is receiver-scoped, `claimsAcross`
 * is a quantifier, and the CSS and order claims reach the predicates they are wired to.
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { moduleAstOf } from './helpers/parsedSource.js';
import { parseComponent } from './helpers/svelteStructureContract.js';
import {
  CONTRACT_CLAIMS,
  claimsAcross,
  claimsForComponent,
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
