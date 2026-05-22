import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const mainPath = resolve(__dirname, '../src/main.js');

function mainSource() {
  return readFileSync(mainPath, 'utf8');
}

test('Items Directory manager action launches the v2 manager registry entry', () => {
  const source = mainSource();
  const buttonStart = source.indexOf("createHeaderButton(\n        'Manage Crafting Systems'");
  assert.notEqual(buttonStart, -1, 'main.js should create a Manage Crafting Systems header button');

  const buttonEnd = source.indexOf(');', buttonStart);
  const buttonSource = source.slice(buttonStart, buttonEnd);

  assert.match(buttonSource, /getCraftingSystemManagerV2AppClass\(\)\.show\(\)/);
  assert.doesNotMatch(buttonSource, /getRecipeManagerAppClass\(\)\.show\(\)/);
});

test('openRecipeManager public API opens the crafting system manager', () => {
  const source = mainSource();
  const apiStart = source.indexOf('openRecipeManager: () => {');
  assert.notEqual(apiStart, -1, 'main.js should expose openRecipeManager');

  const apiEnd = source.indexOf('},', apiStart);
  const apiSource = source.slice(apiStart, apiEnd);

  assert.match(apiSource, /getCraftingSystemManagerV2AppClass\(\)\.show\(\)/);
});
