import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const pickerPath = resolve(__dirname, '../../src/ui/svelte/apps/editor/RecipeImagePicker.svelte');
const rootPath = resolve(__dirname, '../../src/ui/svelte/apps/editor/RecipeEditorRoot.svelte');
const cssPath = resolve(__dirname, '../../styles/fabricate.css');

const pickerSource = readFileSync(pickerPath, 'utf8');
const rootSource = readFileSync(rootPath, 'utf8');
const css = readFileSync(cssPath, 'utf8');

describe('RecipeImagePicker component layout', () => {
  it('renders a clickable trigger button wrapping the current image', () => {
    assert.ok(
      pickerSource.includes('class="recipe-image-picker-trigger"'),
      'picker should render a trigger button'
    );
    assert.ok(
      pickerSource.includes('class="recipe-image-picker-preview"'),
      'trigger button should contain an image preview'
    );
    assert.ok(
      pickerSource.includes('onclick={togglePicker}'),
      'trigger button should open the picker on click'
    );
  });

  it('uses normalizeRecipeImage to guard against empty value', () => {
    assert.ok(
      pickerSource.includes('normalizeRecipeImage'),
      'picker should call normalizeRecipeImage to ensure a valid image is always shown'
    );
  });

  it('defaults to DEFAULT_RECIPE_IMAGE', () => {
    assert.ok(
      pickerSource.includes('DEFAULT_RECIPE_IMAGE'),
      'picker should import and use the default recipe image constant'
    );
  });

  it('shows a grid popover of document icons when open', () => {
    assert.ok(
      pickerSource.includes('class="recipe-image-picker-popover"'),
      'picker should render a popover container'
    );
    assert.ok(
      pickerSource.includes('class="recipe-image-picker-grid"'),
      'popover should contain a grid of icon options'
    );
    assert.ok(
      pickerSource.includes('RECIPE_IMAGE_ICONS'),
      'picker should iterate over RECIPE_IMAGE_ICONS'
    );
  });

  it('marks the currently selected icon', () => {
    assert.ok(
      pickerSource.includes('class:selected={iconPath === currentImage}'),
      'picker option should receive the selected class when it matches the current image'
    );
    assert.ok(
      pickerSource.includes('aria-selected={iconPath === currentImage}'),
      'picker option should set aria-selected for accessibility'
    );
  });

  it('calls onChange when an icon is selected', () => {
    assert.ok(
      pickerSource.includes('onclick={() => selectImage(iconPath)}'),
      'clicking an option should call selectImage'
    );
    assert.ok(
      pickerSource.includes('onChange(iconPath)'),
      'selectImage should invoke the onChange callback with the chosen path'
    );
  });

  it('uses left-aligned popover layout', () => {
    assert.ok(
      pickerSource.includes("horizontalAlign: 'left'"),
      'popover should be left-aligned to avoid right overflow'
    );
  });

  it('portals the popover into the recipe editor root', () => {
    assert.ok(
      pickerSource.includes(".fabricate-recipe-editor"),
      'picker should portal the popover into .fabricate-recipe-editor'
    );
    assert.ok(
      pickerSource.includes('use:portal'),
      'picker should use the portal action for the popover'
    );
  });

  it('is imported and used in RecipeEditorRoot', () => {
    assert.ok(
      rootSource.includes("import RecipeImagePicker from './RecipeImagePicker.svelte'"),
      'RecipeEditorRoot should import RecipeImagePicker'
    );
    assert.ok(
      rootSource.includes('<RecipeImagePicker'),
      'RecipeEditorRoot should render the RecipeImagePicker component'
    );
  });

  it('passes draft.img and store.setField to RecipeImagePicker', () => {
    assert.ok(
      rootSource.includes("value={$draft.img}"),
      'RecipeEditorRoot should pass draft.img as value to RecipeImagePicker'
    );
    assert.ok(
      rootSource.includes("store.setField('img', path)"),
      'RecipeEditorRoot should update the img field via store.setField on change'
    );
  });

  it('places the image picker to the left of the name/category/description fields', () => {
    assert.ok(
      rootSource.includes('class="info-layout"'),
      'basic-info section should use the info-layout wrapper'
    );
    assert.ok(
      rootSource.includes('class="info-image-column"'),
      'image picker should be in its own left column'
    );
    assert.ok(
      rootSource.includes('class="info-fields-column"'),
      'text fields should be in a separate right column'
    );
    // Image column should appear before the fields column in the DOM
    const imageColPos = rootSource.indexOf('class="info-image-column"');
    const fieldsColPos = rootSource.indexOf('class="info-fields-column"');
    assert.ok(imageColPos < fieldsColPos, 'image column should appear before the fields column in markup');
  });

  it('no longer renders a plain text input for the image path', () => {
    assert.ok(
      !rootSource.includes('id="recipeImg"'),
      'plain text image input should be removed in favour of the visual picker'
    );
  });
});

describe('RecipeImagePicker CSS contract', () => {
  it('recipe editor establishes a positioning root for the picker popover', () => {
    const match = css.match(/\.fabricate-recipe-editor \{[\s\S]*?\}/);
    assert.ok(match, '.fabricate-recipe-editor CSS block should exist');
    const block = match[0];
    assert.ok(block.includes('position: relative;'), 'editor root should anchor absolutely positioned overlays');
    assert.ok(block.includes('isolation: isolate;'), 'editor root should isolate picker z-index from host chrome');
  });

  it('recipe image picker popover uses an absolute high-z overlay', () => {
    const match = css.match(/\.fabricate-recipe-editor \.recipe-image-picker-popover \{[\s\S]*?\}/);
    assert.ok(match, 'recipe image picker popover CSS block should exist');
    const block = match[0];
    assert.ok(block.includes('position: absolute;'), 'popover should be absolutely positioned');
    assert.ok(block.includes('z-index: 4000;'), 'popover should layer above surrounding UI');
    assert.ok(block.includes('overflow: hidden;'), 'popover should clip its interior scroll region');
  });

  it('recipe image picker grid uses a 6-column layout', () => {
    const match = css.match(/\.fabricate-recipe-editor \.recipe-image-picker-grid \{[\s\S]*?\}/);
    assert.ok(match, 'recipe image picker grid CSS block should exist');
    const block = match[0];
    assert.ok(block.includes('display: grid;'), 'icon grid should use CSS grid');
    assert.ok(block.includes('grid-template-columns: repeat(6, 1fr);'), 'icon grid should use 6 equal columns');
  });

  it('selected recipe image option uses accent colour highlight', () => {
    const match = css.match(/\.fabricate-recipe-editor \.recipe-image-picker-option\.selected \{[\s\S]*?\}/);
    assert.ok(match, 'selected option CSS block should exist');
    const block = match[0];
    assert.ok(
      block.includes('--fabricate-editor-accent'),
      'selected option should use the editor accent colour token for its border'
    );
  });
});
