/**
 * The two BOUNDS this change claims for itself (issue 1392, epic 1357, PR 7a).
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import test from 'node:test';

import { CraftingSystemManager } from '../src/systems/CraftingSystemManager.js';
import { normalizeCustomComponentCategories } from '../src/utils/componentCategories.js';
import { parseModule } from './helpers/moduleAst.js';
import { moduleAstOf } from './helpers/parsedSource.js';
import { defineStructureContract } from './helpers/structureContract.js';
import { shapeOf } from './helpers/structureShapes.js';

const repoRoot = resolve(import.meta.dirname, '..');
const CSM = 'src/systems/CraftingSystemManager.js';

/** Every top-level `import` of a module, as its shape, in source order. */
const importShapes = (ast) =>
  ast.body.filter((node) => node.type === 'ImportDeclaration').map(shapeOf);

test('the admin store gateway keeps its lane-base IMPORT SURFACE', () => {
  const goldenPath = resolve(repoRoot, 'tests/fixtures/adminStoreImportSurface.golden.txt');
  const golden = importShapes(parseModule(readFileSync(goldenPath, 'utf8')).ast);
  assert.ok(
    golden.some(({ specifiers }) =>
      specifiers.some(({ local }) => local.name === 'createWorldScopeActions')
    ),
    'the golden does not look like this module’s imports at all'
  );
  assert.deepEqual(
    importShapes(moduleAstOf('src/ui/svelte/stores/adminStore.js').ast),
    golden,
    'ONE argument at the world-scope projection’s call site is the whole executable diff this ' +
      'lane claims in a gateway file. Computing the reference counts HERE instead would need ' +
      '`buildVocabularyUsage` imported, which is what this golden refuses.'
  );
});

// Union the world vocabulary into `_vocabularyBasis` and these red: a widened basis is KNOWN
// wherever either half is known, so it would arm the sharpest of the seven prune sites in a state
// that prunes nothing today.
defineStructureContract('the crafting system manager is opened for a COMMENT ONLY', CSM, {
  contains: [
    'function _vocabularyBasis(vocabulary) { return vocabulary.length > 0 ? vocabulary : null; }',
  ],
});
defineStructureContract(
  'and the basis reaches the system’s own vocabularies alone',
  { file: CSM, member: '_scopeBasis' },
  {
    contains: [
      `return {
      componentIds: _scopeEntityBasis(
        _resolveStoreSeam(this._componentScopeStore),
        system?.components ?? system?.managedItems ?? system?.items
      ),
      essenceIds: _scopeEntityBasis(
        _resolveStoreSeam(this._essenceScopeStore),
        system?.essenceDefinitions ?? system?.essences
      ),
      toolIds: _scopeEntityBasis(_resolveStoreSeam(this._toolScopeStore), system?.tools),
      componentCategories: _vocabularyBasis(
        normalizeCustomComponentCategories(system?.componentCategories)
      ),
      recipeCategories: _vocabularyBasis(normalizeCustomRecipeCategories(system?.categories)),
    };`,
    ],
  }
);

test('a world vocabulary on the facade leaves an unauthored system basis unknown', () => {
  const world = { list: () => [{ id: 'world-ore', name: 'World ore' }], isSeeded: () => true };
  const previous = globalThis.game;
  globalThis.game = {
    fabricate: { getVocabularyScopeStore: () => world, worldVocabularyStore: world },
  };
  try {
    const manager = new CraftingSystemManager({ getRecipes: () => [] });
    const unauthored = manager._scopeBasis({ componentCategories: [], categories: [] });
    assert.equal(unauthored.componentCategories, null, 'no system vocabulary is an UNKNOWN basis');
    assert.equal(unauthored.recipeCategories, null);
    const authored = manager._scopeBasis({ componentCategories: ['Ore'], categories: [] });
    assert.deepEqual(
      authored.componentCategories,
      normalizeCustomComponentCategories(['Ore']),
      'and an authored one is the system’s own, with nothing of the world’s beside it'
    );
  } finally {
    globalThis.game = previous;
  }
});
