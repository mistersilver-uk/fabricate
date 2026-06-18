import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dirname, '../..');
const editPath = resolve(repoRoot, 'src/ui/svelte/apps/manager/RecipeEditView.svelte');
const inspectorPath = resolve(repoRoot, 'src/ui/svelte/apps/manager/RecipeItemInspector.svelte');
const rootPath = resolve(repoRoot, 'src/ui/svelte/apps/manager/CraftingSystemManagerRoot.svelte');
const browserPath = resolve(repoRoot, 'src/ui/svelte/apps/manager/RecipesBrowserView.svelte');
const storePath = resolve(repoRoot, 'src/ui/svelte/stores/adminStore.js');
const modelPath = resolve(repoRoot, 'src/models/Recipe.js');
const managerPath = resolve(repoRoot, 'src/systems/RecipeManager.js');
const graphPath = resolve(repoRoot, 'src/ui/svelte/util/recipeGraphBuilder.js');
const iconsPath = resolve(repoRoot, 'src/ui/svelte/util/recipeImageIcons.js');
const langPath = resolve(repoRoot, 'lang/en.json');
const cssPath = resolve(repoRoot, 'styles/fabricate.css');

const editSource = readFileSync(editPath, 'utf8');
const inspectorSource = readFileSync(inspectorPath, 'utf8');
const rootSource = readFileSync(rootPath, 'utf8');
const browserSource = readFileSync(browserPath, 'utf8');
const storeSource = readFileSync(storePath, 'utf8');
const modelSource = readFileSync(modelPath, 'utf8');
const managerSource = readFileSync(managerPath, 'utf8');
const graphSource = readFileSync(graphPath, 'utf8');
const iconsSource = readFileSync(iconsPath, 'utf8');
const lang = JSON.parse(readFileSync(langPath, 'utf8'));
const css = readFileSync(cssPath, 'utf8');

const recipeLang = lang.FABRICATE.Admin.Manager.Recipe;
const BLUEPRINT_DEFAULT = 'icons/sundries/documents/blueprint-recipe-alchemical.webp';

describe('RecipeEditView identity-only single column', () => {
  it('renders the identity card in the standard manager-main, with no bespoke workspace', () => {
    assert.ok(editSource.includes('id="manager-recipe-edit-form"'), 'identity form has the recipe-edit form id');
    assert.ok(editSource.includes('manager-recipe-edit-main'), 'reuses the recipe-edit main class');
    assert.equal(editSource.includes('manager-recipe-workspace'), false, 'no bespoke workspace grid');
    assert.equal(editSource.includes('manager-recipe-edit-panel'), false, 'no bespoke editing panel');
    assert.equal(editSource.includes('manager-recipe-inspector'), false, 'no view-internal inspector column');
    assert.equal(editSource.includes('is-inspector-hidden'), false, 'no inspector-hidden toggle');
  });

  it('reuses the environment identity card structure on a local draft', () => {
    assert.ok(editSource.includes('manager-task-core-card'), 'reuses the unscoped task core card');
    assert.ok(editSource.includes('manager-task-image-picker'), 'reuses the image picker');
    assert.ok(editSource.includes('manager-status-toggle'), 'reuses the status toggle');
    assert.ok(editSource.includes('data-recipe-field="name"'), 'name field bound');
    assert.ok(editSource.includes('data-recipe-field="description"'), 'description field bound');
    assert.ok(editSource.includes('data-recipe-field="enabled"'), 'enabled toggle bound');
    assert.ok(editSource.includes('data-recipe-field="img"'), 'image picker bound');
  });

  it('keeps the empty select-a-recipe state', () => {
    assert.ok(editSource.includes('FABRICATE.Admin.Manager.Recipe.SelectRecipe'), 'empty state copy retained');
  });

  it('wires the draft/dirty/save callbacks for identity only', () => {
    assert.ok(editSource.includes('onDirtyChange('), 'emits onDirtyChange');
    assert.ok(editSource.includes('onDraftChange('), 'emits onDraftChange');
    assert.ok(editSource.includes('onSave('), 'invokes onSave');
    assert.ok(editSource.includes('validName'), 'tracks name validity');
  });

  it('carries no recipe-item editing state, props, or card in the view', () => {
    assert.equal(editSource.includes('recipeItemDefinitions'), false, 'no recipeItemDefinitions prop');
    assert.equal(editSource.includes('knowledgeMode'), false, 'no knowledgeMode prop');
    assert.equal(editSource.includes('onAddRecipeItem'), false, 'no add-recipe-item prop');
    assert.equal(editSource.includes('onSetRecipeItem'), false, 'no set-recipe-item prop');
    assert.equal(editSource.includes('manager-environment-scene-dropzone'), false, 'no recipe-item dropzone');
    assert.equal(editSource.includes('manager-environment-scene-linked'), false, 'no recipe-item linked card');
    assert.equal(editSource.includes('dragDrop'), false, 'no dragDrop import/usage');
    assert.equal(editSource.includes('resolveDropData'), false, 'no resolveDropData import/usage');
  });

  it('does not render a draft-state card', () => {
    assert.equal(editSource.includes('DraftState'), false, 'no draft-state card copy');
    assert.equal(editSource.includes('draft-state'), false, 'no draft-state element');
  });
});

describe('RecipeItemInspector recipe-item link card', () => {
  it('renders an inspector card with the recipe-item section', () => {
    assert.ok(inspectorSource.includes('manager-inspector-card'), 'reuses inspector card');
    assert.ok(inspectorSource.includes('data-recipe-section="recipe-item"'), 'recipe-item section marker');
    assert.ok(inspectorSource.includes('manager-environment-scene-linked'), 'reuses linked container class');
    assert.ok(inspectorSource.includes('manager-environment-scene-dropzone'), 'reuses dropzone class');
  });

  it('uses item iconography, not scene/map icons, and no scene-locked-image branch', () => {
    assert.ok(inspectorSource.includes('fa-box'), 'dropzone uses an item box icon');
    assert.ok(inspectorSource.includes('fa-suitcase'), 'missing thumb uses a suitcase icon');
    assert.ok(
      inspectorSource.includes("import { DEFAULT_RECIPE_IMAGE } from '../../util/recipeImageIcons.js'"),
      'image fallback uses the shared DEFAULT_RECIPE_IMAGE constant'
    );
    assert.equal(inspectorSource.includes("'icons/svg/item-bag.svg'"), false, 'no bag-SVG literal fallback');
    assert.equal(inspectorSource.includes('fa-map'), false, 'no map icon');
    assert.equal(inspectorSource.includes('data-scene-locked-image'), false, 'no scene-locked-image branch');
  });

  it('drops Foundry items via dragDrop + resolveDropData with the Item-only guard', () => {
    assert.ok(inspectorSource.includes('use:dragDrop'), 'uses the dragDrop action');
    assert.ok(inspectorSource.includes('resolveDropData'), 'resolves drop data');
    assert.ok(inspectorSource.includes("type !== 'Item' || !uuid"), 'Item-only + non-empty uuid guard');
    assert.ok(inspectorSource.includes('onAddRecipeItem('), 'links via onAddRecipeItem');
    assert.ok(inspectorSource.includes('onSetRecipeItem('), 'persists via onSetRecipeItem');
  });

  it('uses the canonical recipeItemId, never the legacy linkedRecipeItemUuid', () => {
    assert.ok(inspectorSource.includes('recipeItemId'), 'references recipeItemId');
    assert.equal(inspectorSource.includes('linkedRecipeItemUuid'), false, 'never references the legacy alias');
  });

  it('does not delete the shared recipe-item definition on unlink', () => {
    assert.equal(inspectorSource.includes('deleteRecipeItemDefinition'), false, 'unlink must not delete the shared definition');
  });

  it('resolves the underlying item in a cancelled-guarded $effect', () => {
    assert.ok(inspectorSource.includes('globalThis.fromUuid'), 'resolves via fromUuid');
    assert.ok(inspectorSource.includes('let cancelled = false'), 'effect carries a cancelled guard');
    assert.ok(inspectorSource.includes('cancelled = true'), 'cleanup flips the cancelled guard');
  });

  it('carries the EnvironmentSummaryInspector a11y contract', () => {
    assert.ok(inspectorSource.includes('role="group"'), 'linked container is a group');
    assert.ok(inspectorSource.includes('aria-label='), 'linked container has an aria-label');
    assert.ok(inspectorSource.includes('svelte-ignore a11y_no_noninteractive_element_interactions'), 'carries the ignore comment');
    assert.ok(inspectorSource.includes('manager-icon-button is-danger'), 'visible danger unlink button');
  });

  it('wires open, copy, and missing states', () => {
    assert.ok(inspectorSource.includes('onOpenItem('), 'open wired');
    assert.ok(inspectorSource.includes('onCopyItemUuid('), 'copy-uuid wired');
    assert.ok(inspectorSource.includes('FABRICATE.Admin.Manager.Recipe.RecipeItemMissing'), 'missing state copy');
  });
});

describe('adminStore recipe-item projections + API', () => {
  it('exports updateRecipe and addRecipeItemFromUuid', () => {
    assert.ok(/async function updateRecipe\(/.test(storeSource), 'updateRecipe defined');
    assert.ok(/async function addRecipeItemFromUuid\(/.test(storeSource), 'addRecipeItemFromUuid defined');
    assert.ok(/\n[ \t]*updateRecipe,/.test(storeSource), 'updateRecipe exported');
    assert.ok(/\n[ \t]*addRecipeItemFromUuid,/.test(storeSource), 'addRecipeItemFromUuid exported');
  });

  it('projects recipeItemId on recipes and recipeItemDefinitions on the selected system', () => {
    assert.ok(storeSource.includes('recipeItemId,'), 'recipeItemId projected onto recipe rows');
    assert.ok(/recipeItemDefinitions:\s*Array\.isArray\(selectedSystem\.recipeItemDefinitions\)/.test(storeSource), 'recipeItemDefinitions projected');
    assert.equal(storeSource.includes('linkedRecipeItemUuid'), false, 'never projects the legacy alias');
  });
});

describe('CraftingSystemManagerRoot recipe-edit machinery', () => {
  it('owns recipe draft/save handlers and a knowledge-mode derived value', () => {
    assert.ok(/async function saveRecipeEdit\(/.test(rootSource), 'saveRecipeEdit defined');
    assert.ok(/function cancelRecipeEdit\(/.test(rootSource), 'cancelRecipeEdit defined');
    assert.ok(/function handleRecipeDraftChange\(/.test(rootSource), 'handleRecipeDraftChange defined');
    assert.ok(/async function handleAddRecipeItem\(/.test(rootSource), 'handleAddRecipeItem defined');
    assert.ok(/async function handleSetRecipeItem\(/.test(rootSource), 'handleSetRecipeItem defined');
    assert.ok(rootSource.includes('canSaveRecipeEdit'), 'canSaveRecipeEdit derived');
    assert.ok(rootSource.includes('recipeKnowledgeMode'), 'recipeKnowledgeMode derived');
  });

  it('wires the recipe-edit header chip + Save/Cancel and the slimmed view props', () => {
    assert.ok(rootSource.includes('form="manager-recipe-edit-form"'), 'header Save submits the recipe-edit form');
    assert.ok(rootSource.includes('FABRICATE.Admin.Manager.Recipe.Dirty'), 'dirty chip uses Recipe.Dirty');
    assert.ok(rootSource.includes('onclick={cancelRecipeEdit}'), 'header Cancel wired');
    assert.ok(rootSource.includes('onPickImagePath={services?.pickImagePath}'), 'passes onPickImagePath');
    assert.ok(rootSource.includes('onSave={saveRecipeEdit}'), 'passes onSave');
    assert.ok(rootSource.includes('onDraftChange={handleRecipeDraftChange}'), 'passes onDraftChange');
  });

  it('renders the recipe-item card in the global inspector aside, gated on knowledge mode', () => {
    assert.ok(rootSource.includes("import RecipeItemInspector from './RecipeItemInspector.svelte'"), 'imports the inspector component');
    assert.ok(rootSource.includes('<RecipeItemInspector'), 'renders the inspector in an aside branch');
    assert.ok(
      rootSource.includes("recipeInspectorVisible = $derived(currentView === 'recipe-edit'")
        && rootSource.includes("recipeKnowledgeMode === 'item'")
        && rootSource.includes("recipeKnowledgeMode === 'itemOrLearned'"),
      'recipeInspectorVisible gates on item / itemOrLearned'
    );
    assert.ok(
      rootSource.includes("(currentView !== 'recipe-edit' || recipeInspectorVisible)"),
      'aside suppression allows recipe-edit only when the inspector is visible'
    );
  });

  it('no longer passes recipe-item props to RecipeEditView', () => {
    const start = rootSource.indexOf('<RecipeEditView');
    const end = rootSource.indexOf('/>', start);
    const block = rootSource.slice(start, end);
    assert.equal(block.includes('recipeItemDefinitions'), false, 'no recipeItemDefinitions prop on the view');
    assert.equal(block.includes('knowledgeMode'), false, 'no knowledgeMode prop on the view');
    assert.equal(block.includes('onAddRecipeItem'), false, 'no add-recipe-item prop on the view');
    assert.equal(block.includes('onSetRecipeItem'), false, 'no set-recipe-item prop on the view');
  });

  it('wires confirmRecipeRouteExit into the route-exit chain via the services discard seam', () => {
    assert.ok(/function confirmRecipeRouteExit\(/.test(rootSource), 'confirmRecipeRouteExit defined');
    assert.ok(rootSource.includes('confirmRecipeRouteExit(nextView)'), 'recipe route exit is part of the chain');
    assert.ok(
      rootSource.includes('store.confirmDiscardDirtyRecipeDraft?.()'),
      'recipe route exit confirms through the services discard-dirty seam'
    );
    const guardStart = rootSource.indexOf('function confirmRecipeRouteExit(');
    const guardEnd = rootSource.indexOf('\n  }', guardStart);
    const guardBody = rootSource.slice(guardStart, guardEnd);
    assert.equal(
      guardBody.includes('globalThis.confirm'),
      false,
      'recipe route exit must not fall back to globalThis.confirm'
    );
    assert.ok(
      /function confirmDiscardDirtyRecipeDraft\(/.test(storeSource),
      'store exposes confirmDiscardDirtyRecipeDraft'
    );
    assert.ok(
      storeSource.includes('FABRICATE.Admin.Manager.Recipe.DiscardDirtyContent'),
      'discard prompt uses the DiscardDirty content key'
    );
  });
});

describe('recipe-edit CSS uses the standard shell, not a bespoke workspace', () => {
  it('keeps the recipe-edit main grid rule', () => {
    assert.ok(
      css.includes('.fabricate-manager[data-manager-view="recipe-edit"] .manager-main {'),
      'recipe-edit main grid rule retained'
    );
  });

  it('drops the bespoke recipe workspace rules', () => {
    assert.equal(css.includes('.manager-recipe-workspace'), false, 'no recipe workspace grid rule');
    assert.equal(css.includes('.manager-recipe-edit-panel'), false, 'no recipe editing panel rule');
    assert.equal(css.includes('.manager-recipe-inspector'), false, 'no view-internal recipe inspector rule');
  });

  it('gives the recipe-edit main comfortable scrolling whitespace around the identity card', () => {
    const block = css.match(/\.manager-recipe-edit-main\s*\{[^}]*\}/);
    assert.ok(block, '.manager-recipe-edit-main rule exists');
    assert.match(block[0], /padding:\s*var\(--fab-space-4\)/, 'pads the recipe-edit content');
    assert.match(block[0], /overflow-y:\s*auto/, 'a tall form scrolls');
    assert.match(block[0], /min-height:\s*0/, 'min-height:0 so it can scroll within the grid');
  });

  it('keeps the recipe-edit inspector at the standard 300px width (no per-view override)', () => {
    assert.match(
      css,
      /\.manager-body\s*\{\s*display:\s*grid;\s*grid-template-columns:\s*220px minmax\(0,\s*1fr\)\s*300px;/,
      'standard body inspector column is 300px'
    );
    assert.equal(
      /\[data-manager-view="recipe-edit"\]\s+\.manager-body\s*\{/.test(css),
      false,
      'no recipe-edit-specific body width override — recipe-edit uses the standard 300px inspector'
    );
  });

  it('keeps the environment workspace inspector consistent at the standard 300px', () => {
    const block = css.match(/\.manager-environment-workspace\s*\{[^}]*\}/);
    assert.ok(block, '.manager-environment-workspace rule exists');
    assert.match(
      block[0],
      /grid-template-columns:\s*minmax\(0,\s*1fr\)\s*300px/,
      'environment workspace inspector is 300px, matching the standard global inspector'
    );
    assert.equal(block[0].includes('340px'), false, 'environment workspace no longer uses the wider 340px column');
  });

  it('collapses the standard manager body to a single column at narrow widths', () => {
    const narrow = css.match(/@container fabricate-manager \(max-width: 1120px\) \{[\s\S]*?\n\}/);
    assert.ok(narrow, 'narrow body-grid container query exists');
    assert.match(
      narrow[0],
      /\.manager-body[\s\S]*?grid-template-columns:\s*1fr;/,
      'the standard body (used by recipe-edit) collapses to one column at narrow widths'
    );
  });
});

describe('linked scene/recipe-item name truncation (shared class)', () => {
  it('lets the linked card shrink so the name can ellipsize', () => {
    const block = css.match(/\.manager-environment-scene-linked\s*\{[^}]*\}/);
    assert.ok(block, '.manager-environment-scene-linked rule exists');
    assert.match(block[0], /min-width:\s*0/, 'linked container can shrink below content width');
  });

  it('forces the name to a block flex item that reliably truncates with an ellipsis', () => {
    const block = css.match(/\.manager-environment-scene-name\s*\{[^}]*\}/);
    assert.ok(block, '.manager-environment-scene-name rule exists');
    assert.match(block[0], /display:\s*block/, 'block-level so text-overflow applies to the button');
    assert.match(block[0], /min-width:\s*0/, 'can shrink for ellipsis');
    assert.match(block[0], /max-width:\s*100%/, 'never exceeds the card width');
    assert.match(block[0], /text-overflow:\s*ellipsis/, 'ellipsis on overflow');
    assert.match(block[0], /white-space:\s*nowrap/, 'single line');
    assert.match(block[0], /text-align:\s*left/, 'stays left-aligned');
  });

  it('is the shared class used by both the recipe-item and environment scene cards', () => {
    assert.ok(inspectorSource.includes('class="manager-environment-scene-name'), 'recipe-item card uses the shared name class');
  });
});

describe('recipe-edit localization', () => {
  it('pins the logic-bearing values', () => {
    assert.equal(recipeLang.Save, 'Save recipe');
    assert.equal(recipeLang.RecipeItem, 'Recipe item');
    assert.equal(recipeLang.RecipeItemMissing, 'Recipe item unresolved');
    assert.equal(recipeLang.ChooseImage, 'Choose recipe image');
  });

  it('provides the discard-dirty quartet and enabled/disabled hints', () => {
    for (const key of ['DiscardDirtyTitle', 'DiscardDirtyContent', 'DiscardDirtyConfirm', 'DiscardDirtyCancel', 'EnabledHint', 'DisabledHint']) {
      assert.ok(typeof recipeLang[key] === 'string' && recipeLang[key].trim().length > 0, `${key} present`);
    }
  });

  it('omits the dropped / competing keys', () => {
    for (const absent of ['DraftState', 'SaveRecipe', 'DiscardConfirm', 'ActiveHint', 'DraftHint', 'LinkedItem', 'LinkedItemTitle']) {
      assert.equal(absent in recipeLang, false, `${absent} must not be added`);
    }
  });

  it('adds the recipe-item locked-image strings mirroring the scene-locked phrasing', () => {
    assert.equal(recipeLang.RecipeItemLockedImage, 'Image provided by the linked recipe item');
    assert.equal(
      recipeLang.RecipeItemLockedImageTooltip,
      "This image comes from the linked recipe item and can't be edited. Unlink the recipe item to choose a custom image."
    );
  });
});

describe('recipe default image is the blueprint, sourced from one canonical literal', () => {
  it('defines the canonical default in the lowest shared layer (the model)', () => {
    assert.ok(
      modelSource.includes(`export const DEFAULT_RECIPE_IMAGE = '${BLUEPRINT_DEFAULT}'`),
      'Recipe.js exports the canonical DEFAULT_RECIPE_IMAGE'
    );
    assert.equal(modelSource.includes("data.img || 'icons/svg/item-bag.svg'"), false, 'constructor no longer defaults to the bag SVG');
    assert.ok(modelSource.includes('this.img = data.img || DEFAULT_RECIPE_IMAGE'), 'constructor defaults via the constant');
  });

  it('keeps a single source-of-truth literal (no duplicated blueprint string in new code)', () => {
    // The only places the literal path appears: the model definition, and the
    // picker option filename list (a separate concern, not a default fallback).
    const inModel = (modelSource.match(/blueprint-recipe-alchemical\.webp/g) || []).length;
    assert.equal(inModel, 1, 'exactly one literal in the model');
    // recipeImageIcons re-exports the constant rather than redeclaring the literal.
    assert.ok(
      iconsSource.includes("import { DEFAULT_RECIPE_IMAGE } from '../../../models/Recipe.js'")
        && iconsSource.includes('export { DEFAULT_RECIPE_IMAGE }'),
      'recipeImageIcons re-exports the model constant'
    );
    assert.equal(
      iconsSource.includes(`= '${BLUEPRINT_DEFAULT}'`),
      false,
      'recipeImageIcons does not redeclare the literal default'
    );
  });

  it('routes RecipeManager defaults through the imported constant', () => {
    assert.ok(
      managerSource.includes("import { DEFAULT_RECIPE_IMAGE, Recipe } from '../models/Recipe.js'"),
      'RecipeManager imports the constant'
    );
    assert.ok(managerSource.includes('const DEFAULT_RECIPE_IMG = DEFAULT_RECIPE_IMAGE'), 'DEFAULT_RECIPE_IMG uses the constant');
    assert.equal(managerSource.includes("const DEFAULT_RECIPE_IMG = 'icons/svg/item-bag.svg'"), false, 'no bag-SVG recipe default');
  });

  it('uses the constant (not the bag SVG) in the recipe graph node fallback', () => {
    assert.ok(graphSource.includes("import { DEFAULT_RECIPE_IMAGE } from './recipeImageIcons.js'"), 'graph builder imports the constant');
    assert.ok(graphSource.includes('img: recipe.img || DEFAULT_RECIPE_IMAGE'), 'node img falls back to the constant');
    assert.equal(graphSource.includes("recipe.img || 'icons/svg/item-bag.svg'"), false, 'no bag-SVG recipe-node fallback');
  });

  it('uses the constant in the recipe-edit view and inspector via import (no local literal)', () => {
    assert.ok(
      editSource.includes("import { DEFAULT_RECIPE_IMAGE } from '../../util/recipeImageIcons.js'"),
      'RecipeEditView imports the constant'
    );
    assert.equal(editSource.includes("const DEFAULT_RECIPE_IMAGE = 'icons/svg/item-bag.svg'"), false, 'no local bag-SVG literal in the view');
    assert.ok(
      inspectorSource.includes("import { DEFAULT_RECIPE_IMAGE } from '../../util/recipeImageIcons.js'"),
      'RecipeItemInspector imports the constant'
    );
    assert.equal(inspectorSource.includes("const DEFAULT_RECIPE_IMAGE = 'icons/svg/item-bag.svg'"), false, 'no local bag-SVG literal in the inspector');
  });
});

describe('recipe image helpers prefer the linked recipe-item image', () => {
  it('RecipesBrowserView row thumbnail prefers recipeItemImg, then img, then the default', () => {
    assert.ok(
      browserSource.includes("import { DEFAULT_RECIPE_IMAGE } from '../../util/recipeImageIcons.js'"),
      'browser imports the constant'
    );
    assert.ok(
      browserSource.includes('recipe?.recipeItemImg || recipe?.img || DEFAULT_RECIPE_IMAGE'),
      'row image prefers the linked item image'
    );
    assert.equal(browserSource.includes("recipe?.img || 'icons/svg/item-bag.svg'"), false, 'no bag-SVG row fallback');
  });

  it('CraftingSystemManagerRoot recipe preview prefers recipeItemImg, then img, then the default', () => {
    assert.ok(
      rootSource.includes("import { DEFAULT_RECIPE_IMAGE } from '../../util/recipeImageIcons.js'"),
      'root imports the constant'
    );
    assert.ok(
      rootSource.includes('recipe?.recipeItemImg || recipe?.img || DEFAULT_RECIPE_IMAGE'),
      'preview image prefers the linked item image'
    );
  });
});

describe('RecipeEditView locks the image picker to the linked recipe item', () => {
  it('derives the linked state and accepts the linkedItemImage prop', () => {
    assert.ok(editSource.includes('isRecipeItemLinked = $derived(Boolean(recipe?.recipeItemId))'), 'derives the linked state');
    assert.ok(/linkedItemImage\s*=\s*''/.test(editSource), 'accepts the linkedItemImage prop with a default');
  });

  it('renders the locked is-recipe-item-linked span with a lock icon and locked-image marker', () => {
    assert.ok(editSource.includes('{#if isRecipeItemLinked}'), 'branches on the linked state');
    assert.ok(editSource.includes('is-recipe-item-linked'), 'uses the recipe-specific locked class');
    assert.ok(editSource.includes('data-recipe-item-locked-image'), 'carries the locked-image marker attribute');
    assert.ok(editSource.includes('fa-lock'), 'shows a lock icon when linked');
    assert.ok(
      editSource.includes('FABRICATE.Admin.Manager.Recipe.RecipeItemLockedImage')
        && editSource.includes('FABRICATE.Admin.Manager.Recipe.RecipeItemLockedImageTooltip'),
      'uses the locked-image lang keys'
    );
    assert.ok(editSource.includes('src={linkedItemImage || recipeImage(img)}'), 'shows the linked item image when locked');
  });

  it('guards chooseImage on the linked state so the picker is not editable', () => {
    assert.ok(
      editSource.includes("if (typeof onPickImagePath !== 'function' || isRecipeItemLinked) return;"),
      'chooseImage early-returns when the recipe item is linked'
    );
  });

  it('does not persist the linked item image into the draft img', () => {
    assert.equal(editSource.includes('img = linkedItemImage'), false, 'never writes the item image into the draft');
  });

  it('passes the linked recipe-item image into the view from the root', () => {
    assert.ok(rootSource.includes("linkedItemImage={selectedRecipe?.recipeItemImg || ''}"), 'root passes recipeItemImg as linkedItemImage');
  });
});

describe('recipe locked-image picker reuses the scene-locked visuals', () => {
  it('groups is-recipe-item-linked into the existing locked-picker rules (no duplicated declarations, no raw colours)', () => {
    assert.ok(
      css.includes('.manager-task-image-picker.is-recipe-item-linked'),
      'recipe locked class is styled'
    );
    assert.ok(
      /\.is-scene-linked,\n[ \t]*\.fabricate-manager \.manager-task-image-picker\.is-recipe-item-linked \{/.test(css),
      'recipe locked class is comma-joined into the cursor rule alongside the scene class'
    );
    assert.ok(
      css.includes('.manager-task-image-picker.is-recipe-item-linked .fa-lock'),
      'recipe lock icon shares the muted colour rule'
    );
  });
});
