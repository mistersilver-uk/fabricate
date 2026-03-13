import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const featureCardStackPath = resolve(__dirname, '../../src/ui/svelte/apps/FeatureCardStack.svelte');
const editorRootPath = resolve(__dirname, '../../src/ui/svelte/apps/editor/RecipeEditorRoot.svelte');
const tokenListPath = resolve(__dirname, '../../src/ui/svelte/apps/TokenList.svelte');
const featureCardStackSource = readFileSync(featureCardStackPath, 'utf8');
const editorRootSource = readFileSync(editorRootPath, 'utf8');
const tokenListSource = readFileSync(tokenListPath, 'utf8');

describe('Reserved general recipe category UI contract', () => {
  it('renders a locked General token in system category management', () => {
    assert.ok(
      featureCardStackSource.includes("localize('FABRICATE.Common.General')"),
      'system category management should display the localized General token'
    );
    assert.ok(
      featureCardStackSource.includes('class="token token-locked"'),
      'the reserved General category should render with a locked token style'
    );
    assert.ok(
      featureCardStackSource.indexOf('<TokenList') < featureCardStackSource.indexOf('class="token token-locked"'),
      'the reserved General category should be rendered inside the shared token list'
    );
  });

  it('allows TokenList to prepend reserved tokens ahead of editable items', () => {
    assert.ok(
      tokenListSource.includes('{@render children?.()}'),
      'TokenList should render prepended token content before editable items'
    );
    assert.ok(
      tokenListSource.includes('{:else if !children}'),
      'TokenList should keep its empty hint hidden when reserved prepended tokens are present'
    );
  });

  it('localizes the General category label in the recipe editor select', () => {
    assert.ok(
      editorRootSource.includes('getRecipeCategoryLabel(cat, localize)'),
      'recipe editor category options should map the reserved general category to a localized label'
    );
  });
});
