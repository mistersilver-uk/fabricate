import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const visibilitySectionPath = resolve(__dirname, '../../src/ui/svelte/apps/editor/VisibilitySection.svelte');
const recipeEditorRootPath = resolve(__dirname, '../../src/ui/svelte/apps/editor/RecipeEditorRoot.svelte');
const recipeEditorAppPath = resolve(__dirname, '../../src/ui/SvelteRecipeEditorApp.svelte.js');
const visibilitySectionSource = readFileSync(visibilitySectionPath, 'utf8');
const recipeEditorRootSource = readFileSync(recipeEditorRootPath, 'utf8');
const recipeEditorAppSource = readFileSync(recipeEditorAppPath, 'utf8');

describe('Recipe item selector UI contract', () => {
  it('uses recipeItemId rather than a raw linkedRecipeItemUuid input in the Svelte editor', () => {
    assert.ok(
      visibilitySectionSource.includes('data-field="recipeItemId"'),
      'visibility section should bind validation and drop targeting to recipeItemId'
    );
    assert.ok(
      !visibilitySectionSource.includes('UuidPlaceholder'),
      'visibility section should not render the legacy UUID entry field'
    );
  });

  it('supports drag-and-drop assignment and local recipe-item cards', () => {
    assert.ok(
      visibilitySectionSource.includes("type: 'recipeItem'"),
      'visibility section should expose draggable system recipe-item cards'
    );
    assert.ok(
      visibilitySectionSource.includes('use:dragDrop'),
      'visibility section should accept drag-and-drop recipe-item assignment'
    );
  });

  it('renders a searchable system recipe-item list rather than a description-heavy chip grid', () => {
    assert.ok(
      visibilitySectionSource.includes('recipe-item-search'),
      'visibility section should render a dedicated search control for system recipe items'
    );
    assert.ok(
      visibilitySectionSource.includes('recipe-item-list'),
      'visibility section should render recipe items in a searchable list'
    );
    assert.ok(
      !visibilitySectionSource.includes('recipe-item-description'),
      'visibility section should not render recipe-item descriptions in the editor association UI'
    );
    assert.ok(
      !visibilitySectionSource.includes('recipe-item-source'),
      'visibility section should not print literal recipe-item UUID text'
    );
  });

  it('uses icon affordances for recipe-item source UUIDs and deletion', () => {
    assert.ok(
      visibilitySectionSource.includes('onCopyRecipeItemSource'),
      'visibility section should expose a source UUID icon action'
    );
    assert.ok(
      visibilitySectionSource.includes('onDeleteRecipeItem'),
      'visibility section should expose delete actions for system recipe items'
    );
    assert.ok(
      visibilitySectionSource.includes('fa-copy'),
      'visibility section should use a copy icon for source UUID access'
    );
    assert.ok(
      visibilitySectionSource.includes('fa-trash'),
      'visibility section should use a delete icon for recipe-item removal'
    );
  });

  it('lets the editor app create or reuse recipe-item definitions from dropped Foundry items', () => {
    assert.ok(
      recipeEditorAppSource.includes('assignRecipeItemFromDrop'),
      'editor app services should convert dropped Foundry items into recipe-item definitions'
    );
    assert.ok(
      recipeEditorAppSource.includes('addRecipeItemFromUuid'),
      'recipe-item assignment should use the crafting-system recipe-item library rather than components'
    );
  });

  it('locks recipe images to the associated recipe item in the active Svelte editor path', () => {
    assert.ok(
      recipeEditorAppSource.includes('deleteRecipeItemDefinition'),
      'editor app services should support recipe-item deletion from the editor'
    );
    assert.ok(
      recipeEditorAppSource.includes('copyToClipboard'),
      'editor app services should support source UUID copy affordances'
    );
    assert.ok(
      visibilitySectionSource.includes('onRefreshRecipeItem'),
      'visibility section should expose a refresh action for syncing the recipe image'
    );
  });

  it('refreshes the system recipe-item list from a reactive invalidation signal after deletes', () => {
    assert.ok(
      recipeEditorRootSource.includes('recipeItemDefinitionsVersion'),
      'recipe editor root should subscribe to a recipe-item definition invalidation signal'
    );
    assert.ok(
      recipeEditorRootSource.includes('$recipeItemDefinitionsVersion;'),
      'recipe editor root should re-read recipe-item definitions when the invalidation signal changes'
    );
  });
});
