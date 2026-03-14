import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const mainPath = resolve(__dirname, '../src/main.js');
const mainSource = readFileSync(mainPath, 'utf8');

test('Fabricate exposes deleteRecipe on the main Foundry API object', () => {
  assert.ok(
    mainSource.includes('async deleteRecipe(recipeId)'),
    'Fabricate should expose a deleteRecipe method on the main game.fabricate API object'
  );
  assert.ok(
    mainSource.includes('return await this.recipeManager.deleteRecipe(recipeId);'),
    'Fabricate.deleteRecipe should delegate to RecipeManager.deleteRecipe'
  );
});

test('Fabricate macro helper exposes deleteRecipe', () => {
  assert.ok(
    mainSource.includes('deleteRecipe: async (recipeId) => {'),
    'the global fabricate helper should expose deleteRecipe'
  );
  assert.ok(
    mainSource.includes('return await game.fabricate.deleteRecipe(recipeId);'),
    'the global fabricate helper should delegate to game.fabricate.deleteRecipe'
  );
});
