import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dirname, '../..');
const browserPath = resolve(repoRoot, 'src/ui/svelte/apps/manager/RecipesBrowserView.svelte');
const editPath = resolve(repoRoot, 'src/ui/svelte/apps/manager/RecipeEditView.svelte');
const rootPath = resolve(repoRoot, 'src/ui/svelte/apps/manager/CraftingSystemManagerRoot.svelte');
const langPath = resolve(repoRoot, 'lang/en.json');
const cssPath = resolve(repoRoot, 'styles/fabricate.css');

const browserSource = readFileSync(browserPath, 'utf8');
const editSource = readFileSync(editPath, 'utf8');
const rootSource = readFileSync(rootPath, 'utf8');
const lang = JSON.parse(readFileSync(langPath, 'utf8'));
const css = readFileSync(cssPath, 'utf8');

const recipeLang = lang.FABRICATE.Admin.Manager.Recipe;

function actionGroupBlock() {
  const start = browserSource.indexOf('class="manager-action-group manager-labeled-cell"');
  assert.ok(start >= 0, 'recipe action group should be present');
  const end = browserSource.indexOf('</span>\n          </div>', start);
  assert.ok(end > start, 'recipe action group should close before the row ends');
  return browserSource.slice(start, end);
}

describe('RecipesBrowserView Edit quick-action', () => {
  it('declares an onEditRecipe prop', () => {
    assert.ok(browserSource.includes('onEditRecipe = () => {}'), 'onEditRecipe prop should be declared');
  });

  it('renders exactly three action buttons ordered Edit -> Duplicate -> Delete', () => {
    const block = actionGroupBlock();
    const buttonCount = (block.match(/<button/g) || []).length;
    assert.equal(buttonCount, 3, 'action group should contain exactly three buttons');
    const editIdx = block.indexOf('fa-edit');
    const copyIdx = block.indexOf('fa-copy');
    const trashIdx = block.indexOf('fa-trash');
    assert.ok(editIdx >= 0 && copyIdx >= 0 && trashIdx >= 0, 'all three icons should be present');
    assert.ok(editIdx < copyIdx, 'Edit should come before Duplicate');
    assert.ok(copyIdx < trashIdx, 'Duplicate should come before Delete');
  });

  it('wires the Edit button to onEditRecipe with localized aria-label and title', () => {
    const block = actionGroupBlock();
    assert.ok(block.includes('onEditRecipe(recipe.id)'), 'Edit button should call onEditRecipe');
    assert.ok(block.includes('FABRICATE.Admin.Manager.Recipe.EditNamed'), 'Edit button uses the EditNamed aria-label key');
    assert.ok(block.includes('FABRICATE.Admin.Manager.Recipe.Edit'), 'Edit button uses the Edit title key');
  });

  it('does not gate the Edit button on recipe.locked', () => {
    const block = actionGroupBlock();
    assert.equal(block.includes('recipe.locked'), false, 'action group must not gate buttons on recipe.locked');
    assert.equal(/\{#if[^}]*locked/.test(block), false, 'no locked guard should wrap the action buttons');
  });
});

describe('recipe-edit action group spacing', () => {
  it('pins the recipe action group to a single non-wrapping row', () => {
    const start = css.indexOf('.manager-recipe-row .manager-action-group {');
    assert.ok(start >= 0, 'scoped recipe action-group rule should exist');
    const end = css.indexOf('}', start);
    const block = css.slice(start, end);
    assert.ok(block.includes('flex-wrap: nowrap'), 'action group should not wrap');
    assert.ok(block.includes('gap: var(--fab-space-1)'), 'action group uses the tight token gap');
  });

  it('keeps the recipe actions column at 118px', () => {
    const matches = css.match(/--fab-mv2-recipe-grid:[^;]*118px;/g) || [];
    assert.ok(matches.length >= 1, 'recipe grid last column should remain 118px');
  });

  it('adds a recipe-edit manager-main grid override', () => {
    assert.ok(
      css.includes('.fabricate-manager[data-manager-view="recipe-edit"] .manager-main'),
      'recipe-edit view needs a manager-main grid override'
    );
  });
});

describe('CraftingSystemManagerRoot recipe-edit wiring', () => {
  it('imports and renders RecipeEditView', () => {
    assert.ok(rootSource.includes("import RecipeEditView from './RecipeEditView.svelte'"), 'RecipeEditView should be imported');
    assert.ok(rootSource.includes('<RecipeEditView'), 'RecipeEditView should be rendered');
    // The route-exit-aware Back lives in the shared header (onclick={backToRecipesBrowse}),
    // not as a view prop — the controlled editor carries no onBack.
    assert.ok(rootSource.includes('onclick={backToRecipesBrowse}'), 'header Back wired to the route-exit-aware backToRecipesBrowse');
  });

  it('defines editRecipe and backToRecipesBrowse navigation', () => {
    assert.ok(/function editRecipe\(/.test(rootSource), 'editRecipe should be defined');
    assert.ok(/function backToRecipesBrowse\(/.test(rootSource), 'backToRecipesBrowse should be defined');
    assert.ok(rootSource.includes("confirmRouteExit('recipe-edit')"), 'editRecipe should run the recipe-edit route exit guard');
    assert.ok(rootSource.includes("activeView = 'recipe-edit'"), 'editRecipe should switch to the recipe-edit view');
  });

  it('passes onEditRecipe to RecipesBrowserView', () => {
    assert.ok(rootSource.includes('onEditRecipe={(id) => editRecipe(id)}'), 'RecipesBrowserView should receive onEditRecipe');
  });

  it('keeps the Crafting nav group active on the recipe-edit subroute', () => {
    // Recipes now nests inside the gated Crafting nav group (issue 511); the
    // parent tracks any crafting child route and recipe-edit maps to the Recipes
    // sub-item via the activeCraftingTab default branch.
    assert.ok(
      rootSource.includes("|| currentView === 'recipe-edit'"),
      'isCraftingRoute should include recipe-edit'
    );
    assert.ok(
      rootSource.includes("aria-current={isCraftingRoute ? 'page' : undefined}"),
      'crafting parent aria-current should track isCraftingRoute'
    );
    assert.ok(
      rootSource.includes("currentView === 'crafting-settings' ? 'settings' : 'recipes'"),
      'activeCraftingTab should map recipe-edit (default) to the recipes sub-item'
    );
  });

  it('redirects recipe-edit like recipes (fallback to system-edit) in normalizedActiveView', () => {
    assert.ok(
      rootSource.includes("if ((view === 'recipes' || view === 'recipe-edit' || view === 'crafting-settings') && !recipesAvailable) return 'system-edit'"),
      'normalizedActiveView should treat recipe-edit like recipes and fall back to system-edit'
    );
  });

  it('gates the inspector aside for recipe-edit on recipeInspectorVisible', () => {
    assert.ok(
      rootSource.includes("(currentView !== 'recipe-edit' || recipeInspectorVisible)"),
      'inspector aside should render for recipe-edit only when recipeInspectorVisible'
    );
  });

  it('renders a recipe-edit breadcrumb crumb back to Recipes', () => {
    const idx = rootSource.indexOf("currentView === 'recipe-edit'");
    assert.ok(idx >= 0, 'recipe-edit branch should exist');
    assert.ok(rootSource.includes('FABRICATE.Admin.Manager.Recipe.EditBreadcrumb'), 'breadcrumb uses the EditBreadcrumb key');
  });
});

describe('RecipeEditView empty-state regression guards', () => {
  it('declares the recipe prop (controlled view, no onBack)', () => {
    assert.ok(editSource.includes('recipe = null'), 'recipe prop defaults to null');
    // The controlled editor has no onBack — Back is owned by the shared header.
    assert.equal(editSource.includes('onBack'), false, 'onBack prop is no longer declared');
  });

  it('renders a null-recipe empty branch reusing SelectRecipe', () => {
    assert.ok(editSource.includes('{#if recipe}'), 'view branches on the recipe prop');
    assert.ok(editSource.includes('{:else}'), 'view has a null-recipe branch');
    assert.ok(editSource.includes('FABRICATE.Admin.Manager.Recipe.SelectRecipe'), 'null branch reuses SelectRecipe');
    assert.ok(editSource.includes('FABRICATE.Admin.Manager.Recipe.EditMissingHint'), 'null branch uses EditMissingHint');
  });

  it('reuses the manager-empty surface for the null-recipe state', () => {
    assert.ok(editSource.includes('manager-empty'), 'empty state reuses the manager-empty surface');
  });

  it('no longer references the removed placeholder copy', () => {
    assert.equal(editSource.includes('EditPlaceholderTitle'), false, 'placeholder title key removed');
    assert.equal(editSource.includes('EditPlaceholderHint'), false, 'placeholder hint key removed');
  });
});

describe('recipe-edit localization keys', () => {
  it('pins logic-bearing keys exactly', () => {
    assert.equal(recipeLang.Edit, 'Edit recipe', 'Edit title copy is fixed');
    assert.ok(typeof recipeLang.EditNamed === 'string' && recipeLang.EditNamed.includes('{name}'), 'EditNamed must interpolate {name}');
  });

  it('provides non-empty incidental copy', () => {
    for (const key of ['EditSubtitle', 'BackToBrowse', 'EditTitle', 'EditBreadcrumb', 'EditMissingHint']) {
      assert.ok(typeof recipeLang[key] === 'string' && recipeLang[key].trim().length > 0, `${key} should be a non-empty string`);
    }
  });

  it('drops the removed placeholder keys and stale coming-soon subtitle', () => {
    assert.equal('EditPlaceholderTitle' in recipeLang, false, 'EditPlaceholderTitle removed');
    assert.equal('EditPlaceholderHint' in recipeLang, false, 'EditPlaceholderHint removed');
    assert.equal(recipeLang.EditSubtitle.includes('coming soon'), false, 'EditSubtitle no longer says coming soon');
  });

  it('reuses the existing SelectRecipe key', () => {
    assert.equal(recipeLang.SelectRecipe, 'Select a recipe', 'SelectRecipe is reused, not duplicated');
  });

  it('does not introduce BackToLibrary or EditMissingTitle under Recipe', () => {
    assert.equal('BackToLibrary' in recipeLang, false, 'BackToLibrary must not be added');
    assert.equal('EditMissingTitle' in recipeLang, false, 'EditMissingTitle must not be added');
  });
});
