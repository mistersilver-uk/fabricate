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

  it('uses a single availability dropdown instead of separate enabled and locked checkboxes', () => {
    assert.ok(
      rootSource.includes('id="recipeAvailability"'),
      'recipe editor should render a dedicated availability select'
    );
    assert.ok(
      rootSource.includes("store.setAvailabilityState"),
      'availability changes should route through the dedicated store action'
    );
    assert.ok(
      rootSource.includes("RECIPE_AVAILABILITY_STATES.ENABLED"),
      'the availability select should include the enabled option'
    );
    assert.ok(
      rootSource.includes("RECIPE_AVAILABILITY_STATES.DISABLED"),
      'the availability select should include the disabled option'
    );
    assert.ok(
      rootSource.includes("RECIPE_AVAILABILITY_STATES.LOCKED"),
      'the availability select should include the locked option'
    );
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
      !bannerSource.includes('backdrop-filter:'),
      'validation banner should avoid blur-based glass styling in the flat UI'
    );
    assert.ok(
      !rootSource.includes('linear-gradient('),
      'recipe editor should not use gradient backgrounds in the flat UI'
    );
    assert.ok(
      !rootSource.includes('radial-gradient('),
      'recipe editor should not use radial gradient backgrounds in the flat UI'
    );
    assert.ok(
      !rootSource.includes('backdrop-filter:'),
      'recipe editor panels should avoid blur-based glass styling in the flat UI'
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

  it('renders picker results as one-row entries with truncation-safe names', () => {
    assert.match(
      pickerSource,
      /\.picker-grid \{[\s\S]*display: flex;[\s\S]*flex-direction: column;/,
      'picker results should stack vertically'
    );
    assert.match(
      pickerSource,
      /\.picker-card \{[\s\S]*flex-direction: row;[\s\S]*width: 100%;/,
      'picker cards should use a horizontal row layout'
    );
    assert.match(
      pickerSource,
      /\.picker-card-name \{[\s\S]*white-space: nowrap;[\s\S]*text-overflow: ellipsis;/,
      'picker names should truncate within the row instead of overflowing'
    );
  });
});

describe('Recipe editor shared control CSS', () => {
  it('defines shared input, button, and accent styling for the recipe editor on --fab-* tokens', () => {
    assert.match(
      css,
      /\.fabricate-recipe-editor :is\(input:not\(\[type="checkbox"\]\):not\(\[type="radio"\]\), select, textarea\) \{/s
    );
    assert.ok(css.includes('font: inherit;'));
    assert.match(
      css,
      /\.fabricate-recipe-editor button:not\(\.validation-error-link\):not\(\.icon-button\) \{/s
    );
    assert.ok(
      css.includes('accent-color: var(--fab-accent);'),
      'recipe editor checkbox/radio accent must use --fab-accent'
    );
    assert.match(
      css,
      /box-shadow:\s+0 0 0 1px var\(--fab-accent\),/s,
      'recipe editor focus ring must use --fab-accent'
    );
    assert.ok(
      !css.includes('--fabricate-editor-'),
      'legacy --fabricate-editor-* token namespace must be fully migrated'
    );
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
      /\.fabricate-recipe-editor select option,[\s\S]*?background: var\(--fab-bg-3\);/,
      'recipe editor select option chrome must use --fab-bg-3 surface'
    );
    assert.match(
      css,
      /\.fabricate-recipe-editor select option:checked,[\s\S]*?background: var\(--fab-accent\);/,
      'selected option must highlight on --fab-accent'
    );
  });
});
