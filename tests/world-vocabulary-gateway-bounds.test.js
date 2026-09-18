/**
 * The two BOUNDS this change claims for itself, each as a recorded golden (issue 1392, epic 1357,
 * PR 7a).
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import test from 'node:test';

const repoRoot = resolve(import.meta.dirname, '..');
const read = (path) => readFileSync(resolve(repoRoot, path), 'utf8');

/** Every top-level `import` statement of a module, in source order. */
export function importSurface(source) {
  return (source.match(/^import\b[^;]*;/gm) ?? []).join('\n');
}

/**
 * One named function or method's source, comment-stripped.
 *
 * @param {string} declaration the declaration line, verbatim and including its indentation.
 */
export function strippedFunction(source, declaration) {
  const start = source.indexOf(declaration);
  if (start === -1) return '';
  const indent = declaration.slice(0, declaration.length - declaration.trimStart().length);
  const lines = source.slice(start).split('\n');
  const body = [lines[0]];
  for (const line of lines.slice(1)) {
    body.push(line);
    if (line === `${indent}}`) break;
  }
  return body
    .filter((line) => {
      const trimmed = line.trim();
      return trimmed !== '' && !trimmed.startsWith('//') && !trimmed.startsWith('*') && !trimmed.startsWith('/*');
    })
    .join('\n');
}

test('the admin store gateway keeps its lane-base IMPORT SURFACE', () => {
  const golden = read('tests/fixtures/adminStoreImportSurface.golden.txt').trimEnd();
  assert.ok(golden.length > 0, 'the golden is empty, so the comparison below is vacuous');
  assert.ok(
    golden.includes('createWorldScopeActions'),
    'the golden does not look like this module’s imports at all'
  );
  assert.equal(
    importSurface(read('src/ui/svelte/stores/adminStore.js')),
    golden,
    'ONE argument at the world-scope projection’s call site is the whole executable diff this ' +
      'lane claims in a gateway file. Computing the reference counts HERE instead would need ' +
      '`buildVocabularyUsage` imported, which is what this golden refuses.'
  );
});

test('the crafting system manager is opened for a COMMENT ONLY', () => {
  const source = read('src/systems/CraftingSystemManager.js');
  const current = [
    strippedFunction(source, 'function _vocabularyBasis(vocabulary) {'),
    strippedFunction(source, '  _scopeBasis(system) {'),
  ].join('\n\n');
  const golden = read('tests/fixtures/vocabularyBasisSource.golden.txt').trimEnd();
  assert.ok(
    golden.includes('vocabulary.length > 0 ? vocabulary : null'),
    'the golden does not carry the basis expression, so the extractor or the golden is stale'
  );
  assert.ok(golden.includes('componentCategories: _vocabularyBasis('), 'and it reaches _scopeBasis');
  assert.equal(
    current,
    golden,
    'union the world vocabulary into `_vocabularyBasis` and this reds — which is the point. ' +
      'A widened basis is KNOWN wherever either half is known, so it would arm the sharpest of ' +
      'the seven prune sites in a state that prunes nothing today.'
  );
});
