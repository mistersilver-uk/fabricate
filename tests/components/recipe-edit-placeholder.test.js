import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dirname, '../..');
const browserPath = resolve(repoRoot, 'src/ui/svelte/apps/manager/RecipesBrowserView.svelte');
const inspectorPath = resolve(repoRoot, 'src/ui/svelte/apps/manager/recipes/RecipeBrowserInspector.svelte');
const editPath = resolve(repoRoot, 'src/ui/svelte/apps/manager/RecipeEditView.svelte');
const rootPath = resolve(repoRoot, 'src/ui/svelte/apps/manager/CraftingSystemManagerRoot.svelte');
const langPath = resolve(repoRoot, 'lang/en.json');
const cssPath = resolve(repoRoot, 'styles/fabricate.css');

const browserSource = readFileSync(browserPath, 'utf8');
const inspectorSource = readFileSync(inspectorPath, 'utf8');
const editSource = readFileSync(editPath, 'utf8');
const rootSource = readFileSync(rootPath, 'utf8');
const lang = JSON.parse(readFileSync(langPath, 'utf8'));
const css = readFileSync(cssPath, 'utf8');

const recipeLang = lang.FABRICATE.Admin.Manager.Recipe;

// The three recipe actions (Duplicate / Edit / Delete) moved OFF the row and into the
// inspector (issue 643): the row now carries only the lock toggle and the enable
// switch, and a click on the identity selects the recipe to drive the inspector. So the
// action block lives in the inspector source, ordered Duplicate -> Edit -> Delete.
function inspectorActionBlock() {
  const start = inspectorSource.indexOf('class="manager-recipe-browser-inspector-actions"');
  assert.ok(start >= 0, 'inspector action group should be present');
  const lastButton = inspectorSource.indexOf('fa-trash', start);
  assert.ok(lastButton > start, 'inspector action group should contain the delete button');
  const end = inspectorSource.indexOf('</div>', lastButton);
  assert.ok(end > start, 'inspector action group should close before the panel ends');
  return inspectorSource.slice(start, end);
}

describe('recipe row keeps a single Edit affordance; Duplicate/Delete stay inspector-only', () => {
  it('restores the row Edit pencil but keeps Duplicate/Delete off the row', () => {
    // The row carries its own Edit pencil again (issue 643), matching the Books & Scrolls
    // row edit — but Duplicate and Delete remain the inspector's job, so the row must not
    // author those callbacks or the old three-icon action group.
    assert.ok(browserSource.includes('onEditRecipe'), 'the row declares the onEditRecipe prop');
    assert.ok(browserSource.includes('data-recipe-edit={recipe.id}'), 'the row renders its Edit pencil');
    assert.equal(browserSource.includes('onDuplicateRecipe'), false, 'the row should not declare an onDuplicateRecipe prop');
    assert.equal(browserSource.includes('onDeleteRecipe'), false, 'the row should not declare an onDeleteRecipe prop');
    assert.equal(browserSource.includes('manager-recipe-actions'), false, 'the row action group markup should be gone');
    // The other two controls the row KEEPS.
    assert.ok(browserSource.includes('data-recipe-lock'), 'the row keeps the lock control');
    assert.ok(browserSource.includes('manager-status-toggle'), 'the row keeps the enable toggle');
  });

  it('renders exactly three inspector action buttons ordered Duplicate -> Edit -> Delete', () => {
    const block = inspectorActionBlock();
    const buttonCount = (block.match(/<button/g) || []).length;
    assert.equal(buttonCount, 3, 'inspector action group should contain exactly three buttons');
    const copyIdx = block.indexOf('fa-copy');
    const penIdx = block.indexOf('fa-pen');
    const trashIdx = block.indexOf('fa-trash');
    assert.ok(copyIdx >= 0 && penIdx >= 0 && trashIdx >= 0, 'all three icons should be present');
    assert.ok(copyIdx < penIdx, 'Duplicate should come before Edit');
    assert.ok(penIdx < trashIdx, 'Edit should come before Delete');
  });

  // The three inspector actions are FULL-WIDTH buttons, not ghost icons and not a plain
  // text link: Duplicate is a dark secondary, Edit the accent primary, Delete a dark
  // danger button (issue 643).
  it('renders the three inspector actions as full-width buttons', () => {
    const block = inspectorActionBlock();
    assert.equal(
      (block.match(/class="manager-button /g) || []).length,
      3,
      'all three inspector actions are manager-button controls'
    );
    // The selectors chain `.manager-button` (0,3,0) so they beat the base
    // `.manager-button` rule declared later in the sheet — issue 643. Each rule is now
    // SHARED with the component browser inspector's matching action (issue 676), so the
    // recipe selector heads a list rather than standing alone: match it either way.
    for (const selector of [
      '.fabricate-manager .manager-button.manager-recipe-browser-inspector-duplicate',
      '.fabricate-manager .manager-button.manager-recipe-browser-inspector-edit',
      '.fabricate-manager .manager-button.manager-recipe-browser-inspector-delete'
    ]) {
      const start = css.indexOf(selector);
      assert.ok(start >= 0, `${selector} should own a rule`);
      const cssBlock = css.slice(start, css.indexOf('}', start));
      assert.ok(cssBlock.includes('width: 100%;'), `${selector} should be full width`);
    }
  });

  it('wires the inspector Edit button to onEdit with the localized label', () => {
    const block = inspectorActionBlock();
    assert.ok(block.includes('onEdit()'), 'Edit button should call onEdit');
    assert.ok(block.includes('FABRICATE.Admin.Manager.Recipe.Edit'), 'Edit button uses the Edit label key');
  });

  it('does not gate the inspector actions on the recipe lock state', () => {
    const block = inspectorActionBlock();
    assert.equal(block.includes('.locked'), false, 'inspector actions must not gate on the recipe lock state');
    assert.equal(/\{#if[^}]*locked/.test(block), false, 'no locked guard should wrap the inspector actions');
  });
});

describe('inspector action button layout', () => {
  it('stacks the inspector actions in a single non-wrapping column', () => {
    // The COMPONENT browser inspector (issue 676) shares this rule rather than
    // re-deriving a second copy, so the recipe selector is no longer the whole prelude.
    const start = css.indexOf('.fabricate-manager .manager-recipe-browser-inspector-actions,');
    assert.ok(start >= 0, 'inspector actions rule should exist');
    const end = css.indexOf('}', start);
    const block = css.slice(start, end);
    assert.ok(block.includes('flex-direction: column'), 'the inspector actions stack vertically');
  });

  // The row is a card, not a column grid, so there is no fixed 118px actions column
  // any more. The invariant it protected — the row actions never get squeezed —
  // now lives on the control cluster: it does not shrink, and the identity cell is
  // the only thing that gives way.
  it('never shrinks the row control cluster', () => {
    const start = css.indexOf('.fabricate-manager .manager-recipe-cluster {');
    assert.ok(start >= 0, 'the recipe row control cluster should own a rule');
    const block = css.slice(start, css.indexOf('}', start));
    assert.ok(block.includes('flex-shrink: 0'), 'the control cluster must not shrink');
    assert.equal(
      css.includes('--fab-mv2-recipe-grid'),
      false,
      'the card row must not resurrect the retired column grid'
    );
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

  it('wires both the inspector and the row Edit actions to the recipe-edit navigation', () => {
    // The recipe-edit route is reached from the inspector's Edit button AND from each
    // row's restored Edit pencil (issue 643), so the root wires both to editRecipe.
    assert.ok(
      rootSource.includes('onEdit={() => editRecipe(selectedRecipe?.id)}'),
      'RecipeBrowserInspector should receive onEdit wired to editRecipe'
    );
    assert.ok(
      rootSource.includes('onEditRecipe={(id) => editRecipe(id)}'),
      'the row Edit pencil should be wired to editRecipe(id)'
    );
  });

  it('keeps the Crafting nav group active on the recipe-edit subroute', () => {
    // Recipes nests inside the gated Crafting nav group (issue 511, PR-B). The
    // crafting nav membership + active-tab mapping now live in the shared
    // crafting/craftingNav.js model, so the root derives the boolean/tab from the
    // imported helpers rather than an inline route list.
    assert.ok(
      rootSource.includes('isCraftingView(currentView)'),
      'root should derive isCraftingRoute from the shared isCraftingRoute helper'
    );
    assert.ok(
      rootSource.includes('resolveActiveCraftingTab(currentView)'),
      'root should derive the active crafting tab from the shared activeCraftingTab helper'
    );
    assert.ok(
      rootSource.includes("aria-current={isCraftingRoute ? 'page' : undefined}"),
      'crafting parent aria-current should track isCraftingRoute'
    );
  });

  it('no longer redirects crafting views on the experimental toggle in normalizedActiveView (issue 745)', () => {
    assert.ok(
      !rootSource.includes('CRAFTING_VIEWS.includes(view) && !recipesAvailable'),
      'normalizedActiveView should not gate crafting views (including recipe-edit) on the experimental toggle any more'
    );
  });

  it('suppresses the inspector aside on recipe-edit, matching the released grid column', () => {
    // Issue 676 deleted the context rail: recipe-edit is a TWO-column route now, and the
    // 300px the rail held goes to the tab panel. Suppressing the aside here and adding
    // recipe-edit to the two-column override list in styles/fabricate.css are ONE
    // decision expressed twice — suppress without releasing and a 300px empty box still
    // holds the strip open; release without suppressing and the (empty) aside wraps to
    // an implicit grid row BELOW the editor. This pins both halves together.
    assert.equal(
      rootSource.includes('recipeInspectorVisible'),
      false,
      'no conditional-hide gate: the aside is unconditionally absent on this route'
    );
    const asideGuard = rootSource.slice(
      rootSource.indexOf("{#if currentView !== 'environment-edit' && currentView !== 'checks'"),
      rootSource.indexOf('<aside class="manager-inspector"')
    );
    assert.ok(
      asideGuard.includes("currentView !== 'recipe-edit'"),
      'the aside is suppressed on recipe-edit'
    );
    const css = readFileSync(resolve(repoRoot, 'styles/fabricate.css'), 'utf8');
    assert.ok(
      css.includes('.fabricate-manager[data-manager-view="recipe-edit"] .manager-body'),
      'and the grid column is released, or the suppressed aside leaves a dead 300px strip'
    );
    assert.ok(
      css.includes('.fabricate-manager[data-manager-view="recipe-edit"] .manager-body.is-rail-collapsed'),
      'the collapsed-rail variant is released too'
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
