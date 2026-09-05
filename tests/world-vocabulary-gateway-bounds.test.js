/**
 * The two BOUNDS this change claims for itself, each as a recorded golden (issue 1392, epic
 * 1357, PR 7a).
 *
 * ── WHY GOLDENS AND NOT A LIVE `git diff` ────────────────────────────────────────────────
 * No shipped test diffs the working checkout against `origin/main`, and a `git diff` inside a
 * test is hostile to a shallow CI checkout and to a detached reviewer snapshot — both of which
 * this repository's review lanes actually use. A recorded golden states the same claim about the
 * same bytes and keeps stating it after the branch merges, which is the half a diff cannot do.
 * The pattern is `tests/fixtures/scopedDefinitionNormalize.golden.json`'s.
 *
 * ── WHAT EACH ONE BOUNDS ─────────────────────────────────────────────────────────────────
 * 1. `adminStore.js` is a gateway file `### GM World Scoped Entity Routes` requirement 7 closes
 *    to this lane, and it was reopened for ONE named missing seam: the world-scope projection is
 *    handed no recipe corpus, so a world-wide recipe reference count was underivable from the
 *    open files. The bound is that the COUNTING did not move into this file with the argument —
 *    and the sharpest mechanical statement of that is the IMPORT SURFACE, because computing the
 *    usage here would need `buildVocabularyUsage` imported.
 *    The golden was re-recorded ONCE since, for issue 1371 r19-store2, which adds
 *    `componentEssenceOverrideOn` — an import that takes the "is a system-scope essence write an
 *    override" rule OUT of this gateway and into `systems/componentEssenceOverride.js`, so it
 *    moves behaviour out rather than in and the bound above is unweakened. Re-recording is the
 *    correct response to a lane that genuinely changes this surface; ADDING an import that pulls
 *    work in is still what this guard exists to red.
 * 2. `CraftingSystemManager.js` is opened for a COMMENT ONLY. `_vocabularyBasis`'s docstring now
 *    records why the world half is deliberately not wired into the category-icon prune basis;
 *    its executable body, and `_scopeBasis`'s, are byte-identical to the lane base.
 *
 * The comment-stripped form is what the second golden holds, so the docstring rewrite this
 * change SHIPS does not itself red the guard while any executable change still does.
 *
 * ── AND THE NON-VACUITY HALF ─────────────────────────────────────────────────────────────
 * Both extractors are `indexOf` slices, and an `indexOf` slice answers something plausible on a
 * miss. Each is therefore asserted to contain a named landmark BEFORE its equality clause, so a
 * broken extractor reds rather than comparing two empty strings.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import test from 'node:test';

const repoRoot = resolve(import.meta.dirname, '..');
const read = (path) => readFileSync(resolve(repoRoot, path), 'utf8');

/**
 * Every top-level `import` statement of a module, in source order.
 *
 * `[^;]*` spans newlines, and an import statement carries no semicolon of its own before its
 * terminator, so this captures a multi-line brace list whole.
 *
 * @param {string} source
 * @returns {string}
 */
export function importSurface(source) {
  return (source.match(/^import\b[^;]*;/gm) ?? []).join('\n');
}

/**
 * One named function or method's source, comment-stripped.
 *
 * The closer is the first line at the declaration's own indentation that is a bare `}`, which is
 * exact for both shapes this file reads: a top-level `function` and a class method.
 *
 * @param {string} source
 * @param {string} declaration the declaration line, verbatim and including its indentation.
 * @returns {string}
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
