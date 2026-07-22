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

test('Items Directory manager action launches the v2 manager through the lazy loader', () => {
  const source = mainSource();
  const buttonStart = source.indexOf("createHeaderButton(\n        'Manage Crafting Systems'");
  assert.notEqual(buttonStart, -1, 'main.js should create a Manage Crafting Systems header button');

  // The createHeaderButton call closes at a 6-space-indented `);`.
  const buttonEnd = source.indexOf('\n      );', buttonStart);
  assert.notEqual(buttonEnd, -1, 'the manager button call should close');
  const buttonSource = source.slice(buttonStart, buttonEnd);

  // Issue 150: the button fires the memoized async loader and shows the resolved class.
  assert.match(buttonSource, /loadCraftingSystemManagerAppClass\(\)\.then\(\(AppClass\) => AppClass\.show\(\)\)/);
  assert.doesNotMatch(buttonSource, /getCraftingSystemManagerAppClass\(\)\.show\(\)/);
});

test('openRecipeManager public API opens the crafting system manager through the lazy loader', () => {
  const source = mainSource();
  const apiStart = source.indexOf('openRecipeManager: () => {');
  assert.notEqual(apiStart, -1, 'main.js should expose openRecipeManager');

  const apiEnd = source.indexOf('},', apiStart);
  const apiSource = source.slice(apiStart, apiEnd);

  assert.match(apiSource, /loadCraftingSystemManagerAppClass\(\)\.then\(\(AppClass\) => AppClass\.show\(\)\)/);
  assert.doesNotMatch(apiSource, /getCraftingSystemManagerAppClass\(\)\.show\(\)/);
});
