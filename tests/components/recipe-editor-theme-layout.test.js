import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const rootPath = resolve(__dirname, '../../src/ui/svelte/apps/editor/RecipeEditorRoot.svelte');
const bannerPath = resolve(__dirname, '../../src/ui/svelte/apps/editor/ValidationBanner.svelte');
const pickerPath = resolve(__dirname, '../../src/ui/svelte/apps/editor/ItemPickerGrid.svelte');
const cssPath = resolve(__dirname, '../../styles/fabricate.css');

const rootSource = readFileSync(rootPath, 'utf8');
const bannerSource = readFileSync(bannerPath, 'utf8');
const pickerSource = readFileSync(pickerPath, 'utf8');
const css = readFileSync(cssPath, 'utf8');

describe('Recipe editor theme layout contract', () => {
  it('applies the shared editor surface hook to the main editor sections', () => {
    assert.match(rootSource, /class="basic-info editor-panel-surface"/);
    assert.match(rootSource, /class="flags-section editor-panel-surface"/);
    assert.match(rootSource, /class="ingredient-sets-section editor-panel-surface"/);
    assert.match(rootSource, /class="result-groups-section editor-panel-surface"/);
    assert.match(rootSource, /--fabricate-editor-surface:/);
    assert.match(rootSource, /\.editor-panel-surface \{/);
  });

  it('removes the light validation and picker surface fallbacks in favor of editor tokens', () => {
    assert.ok(
      !bannerSource.includes('#f8d7da'),
      'validation banner should not use the previous pale error background'
    );
    assert.ok(
      bannerSource.includes('var(--fabricate-editor-border-danger'),
      'validation banner should rely on the editor danger token set'
    );
    assert.ok(
      !pickerSource.includes('background: var(--color-bg-option, #fff);'),
      'picker header should not use the previous white fallback surface'
    );
    assert.ok(
      !pickerSource.includes('position: sticky;'),
      'picker search section should no longer be sticky inside the scrolling panel'
    );
    assert.ok(
      !pickerSource.includes('backdrop-filter:'),
      'picker search section should no longer use translucent blur styling'
    );
    assert.ok(
      !pickerSource.includes('linear-gradient('),
      'picker search section should use a solid surface without gradient treatments'
    );
    assert.ok(
      pickerSource.includes('background: var(--fabricate-editor-menu-bg, #171b26);'),
      'picker search section should use the editor solid surface token'
    );
    assert.ok(
      pickerSource.includes('class="picker-grid-scroll"'),
      'picker should dedicate a scroll region to the grid beneath the search section'
    );
    assert.ok(
      pickerSource.includes('var(--fabricate-editor-input-bg'),
      'picker cards should use the shared editor input/surface token'
    );
  });
});

describe('Recipe editor shared control CSS', () => {
  it('defines shared input, button, and accent styling for the recipe editor', () => {
    assert.match(
      css,
      /\.fabricate-recipe-editor :is\(input:not\(\[type="checkbox"\]\):not\(\[type="radio"\]\), select, textarea\) \{/s
    );
    assert.ok(css.includes('font: inherit;'));
    assert.match(
      css,
      /\.fabricate-recipe-editor button:not\(\.validation-error-link\):not\(\.icon-button\) \{/s
    );
    assert.ok(css.includes('accent-color: var(--fabricate-editor-accent, #4a90e2);'));
    assert.ok(css.includes('box-shadow:\n    0 0 0 1px var(--fabricate-editor-accent, #4a90e2),'));
  });

  it('keeps recipe-editor selects dark without forcing a taller closed control', () => {
    assert.match(
      css,
      /\.fabricate-recipe-editor select \{[\s\S]*?color-scheme: dark;[\s\S]*?\}/
    );
    assert.ok(
      !css.includes('min-height: 42px;'),
      'closed select height should not be forced taller than the text inputs'
    );
    assert.match(
      css,
      /\.fabricate-recipe-editor select option,[\s\S]*?background: var\(--fabricate-editor-menu-bg, #171b26\);/
    );
    assert.match(
      css,
      /\.fabricate-recipe-editor select option:checked,[\s\S]*?background: var\(--fabricate-editor-menu-selected, #5a88bb\);/
    );
  });
});
