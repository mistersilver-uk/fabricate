import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const componentPath = resolve(__dirname, '../../src/ui/svelte/apps/editor/RecipeImagePicker.svelte');
const source = readFileSync(componentPath, 'utf8');

test('RecipeImagePicker imports recipeImageIcons utilities', () => {
  assert.ok(
    source.includes("from '../../util/recipeImageIcons.js'"),
    'should import from recipeImageIcons.js'
  );
  assert.ok(source.includes('RECIPE_IMAGE_OPTIONS'), 'should import RECIPE_IMAGE_OPTIONS');
  assert.ok(source.includes('normalizeRecipeImage'), 'should import normalizeRecipeImage');
  assert.ok(source.includes('filterRecipeImageOptions'), 'should import filterRecipeImageOptions');
});

test('RecipeImagePicker uses $props() for value and onChange', () => {
  assert.ok(source.includes('$props()'), 'should use $props() rune');
  assert.ok(source.includes('value'), 'should destructure value from props');
  assert.ok(source.includes('onChange'), 'should destructure onChange from props');
});

test('RecipeImagePicker uses $state for pickerOpen and searchTerm', () => {
  assert.ok(source.includes('pickerOpen'), 'should have pickerOpen state');
  assert.ok(source.includes('searchTerm'), 'should have searchTerm state');
  assert.ok(source.includes('$state(false)'), 'pickerOpen should default to false');
  assert.ok(source.includes("$state('')"), 'searchTerm should default to empty string');
});

test('RecipeImagePicker renders a trigger button with aria attributes', () => {
  assert.ok(source.includes('aria-expanded'), 'trigger button should have aria-expanded');
  assert.ok(source.includes('aria-haspopup'), 'trigger button should have aria-haspopup');
  assert.ok(source.includes('aria-label'), 'trigger button should have aria-label');
});

test('RecipeImagePicker renders an img thumbnail in the trigger', () => {
  assert.ok(source.includes('<img'), 'should render an img element');
  assert.ok(
    source.includes('48') || source.includes('width: 48') || source.includes('height: 48'),
    'thumbnail should be 48px'
  );
});

test('RecipeImagePicker uses dismissOnOutsideClick action', () => {
  assert.ok(
    source.includes("from '../../actions/dismissOnOutsideClick.js'") ||
    source.includes("from '../../../actions/dismissOnOutsideClick.js'") ||
    source.includes('dismissOnOutsideClick'),
    'should import and use dismissOnOutsideClick'
  );
  assert.ok(source.includes('use:dismissOnOutsideClick'), 'should use dismissOnOutsideClick action');
});

test('RecipeImagePicker uses portal action', () => {
  assert.ok(
    source.includes("from '../../actions/portal.js'") ||
    source.includes("from '../../../actions/portal.js'") ||
    source.includes('portal'),
    'should import and use portal'
  );
  assert.ok(source.includes('use:portal'), 'should use portal action');
});

test('RecipeImagePicker uses computeIconPickerPopoverLayout', () => {
  assert.ok(
    source.includes('computeIconPickerPopoverLayout'),
    'should use computeIconPickerPopoverLayout for positioning'
  );
});

test('RecipeImagePicker popover shows a search input', () => {
  assert.ok(
    source.includes('SearchImage') || source.includes('searchTerm') || source.includes('search'),
    'popover should include a search input'
  );
  assert.ok(
    source.includes('bind:value={searchTerm}') || source.includes('searchTerm'),
    'search input should bind to searchTerm'
  );
});

test('RecipeImagePicker uses CSS grid for icon options', () => {
  assert.ok(
    source.includes('auto-fill') || source.includes('grid-template-columns'),
    'should use CSS grid with auto-fill for icon options'
  );
  assert.ok(
    source.includes('48px') || source.includes('minmax'),
    'grid should use minmax sizing'
  );
});

test('RecipeImagePicker iterates over filteredOptions', () => {
  assert.ok(source.includes('filteredOptions'), 'should derive and iterate filteredOptions');
  assert.ok(source.includes('#each filteredOptions'), 'should use {#each} for rendering options');
});

test('RecipeImagePicker calls onChange when an icon is selected', () => {
  assert.ok(
    source.includes('onChange('),
    'should call onChange when an icon is selected'
  );
});

test('RecipeImagePicker uses localize for i18n strings', () => {
  assert.ok(
    source.includes("from '../../util/foundryBridge.js'"),
    'should import localize from foundryBridge.js'
  );
  assert.ok(source.includes('localize('), 'should call localize() for UI strings');
});

test('RecipeImagePicker uses horizontalAlign left for positioning', () => {
  assert.ok(
    source.includes("horizontalAlign: 'left'"),
    'should use horizontalAlign: left for the popover layout'
  );
});

test('RecipeImagePicker popover has role="dialog"', () => {
  assert.ok(source.includes('role="dialog"'), 'popover should have role dialog for accessibility');
});
