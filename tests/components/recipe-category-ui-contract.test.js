import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const editorRootPath = resolve(__dirname, '../../src/ui/svelte/apps/editor/RecipeEditorRoot.svelte');
const editorRootSource = readFileSync(editorRootPath, 'utf8');

describe('Reserved general recipe category UI contract', () => {
  it('localizes the General category label in the recipe editor select', () => {
    assert.ok(
      editorRootSource.includes('getRecipeCategoryLabel(cat, localize)'),
      'recipe editor category options should map the reserved general category to a localized label'
    );
  });
});
