import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dirname, '../..');
const editPath = resolve(repoRoot, 'src/ui/svelte/apps/manager/RecipeEditView.svelte');
const rootPath = resolve(repoRoot, 'src/ui/svelte/apps/manager/CraftingSystemManagerRoot.svelte');
const storePath = resolve(repoRoot, 'src/ui/svelte/stores/adminStore.js');
const langPath = resolve(repoRoot, 'lang/en.json');
const cssPath = resolve(repoRoot, 'styles/fabricate.css');

const editSource = readFileSync(editPath, 'utf8');
const rootSource = readFileSync(rootPath, 'utf8');
const storeSource = readFileSync(storePath, 'utf8');
const lang = JSON.parse(readFileSync(langPath, 'utf8'));
const css = readFileSync(cssPath, 'utf8');

const recipeLang = lang.FABRICATE.Admin.Manager.Recipe;

describe('RecipeEditView two-column workspace', () => {
  it('renders a two-column workspace form with the identity panel and inspector', () => {
    assert.ok(editSource.includes('id="manager-recipe-edit-form"'), 'workspace form has the recipe-edit form id');
    assert.ok(editSource.includes('manager-recipe-workspace'), 'workspace grid class present');
    assert.ok(editSource.includes('manager-recipe-edit-panel'), 'central editing panel present');
    assert.ok(editSource.includes('manager-recipe-inspector'), 'right inspector column present');
  });

  it('exposes a full-width path via is-inspector-hidden gated on the linked-item card', () => {
    assert.ok(editSource.includes('class:is-inspector-hidden={!showLinkedItemCard}'), 'full-width path toggles on showLinkedItemCard');
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

  it('wires the draft/dirty/save callbacks', () => {
    assert.ok(editSource.includes('onDirtyChange('), 'emits onDirtyChange');
    assert.ok(editSource.includes('onDraftChange('), 'emits onDraftChange');
    assert.ok(editSource.includes('onSave('), 'invokes onSave');
    assert.ok(editSource.includes('validName'), 'tracks name validity');
    assert.ok(/recipeItemId:\s*recipeItemId\s*\|\|\s*null/.test(editSource), 'buildUpdates carries recipeItemId');
  });

  it('does not render a draft-state card', () => {
    assert.equal(editSource.includes('DraftState'), false, 'no draft-state card copy');
    assert.equal(editSource.includes('draft-state'), false, 'no draft-state element');
  });
});

describe('RecipeEditView recipe-item link card', () => {
  it('gates the card on item-consuming knowledge modes', () => {
    assert.ok(
      editSource.includes("knowledgeMode === 'item'") && editSource.includes("knowledgeMode === 'itemOrLearned'"),
      'card shown for item / itemOrLearned'
    );
    assert.ok(editSource.includes('{#if showLinkedItemCard}'), 'card render is gated on showLinkedItemCard');
  });

  it('reuses the scene-linked / inspector card classes', () => {
    assert.ok(editSource.includes('manager-inspector-card'), 'reuses inspector card');
    assert.ok(editSource.includes('manager-environment-scene-linked'), 'reuses linked container class');
    assert.ok(editSource.includes('manager-environment-scene-dropzone'), 'reuses dropzone class');
  });

  it('uses item iconography, not scene/map icons, and no scene-locked-image branch', () => {
    assert.ok(editSource.includes('fa-box'), 'dropzone uses an item box icon');
    assert.ok(editSource.includes('fa-suitcase'), 'missing thumb uses a suitcase icon');
    assert.ok(editSource.includes("icons/svg/item-bag.svg"), 'item-bag image fallback');
    assert.equal(editSource.includes('fa-map'), false, 'no map icon');
    assert.equal(editSource.includes('data-scene-locked-image'), false, 'no scene-locked-image branch');
  });

  it('drops Foundry items via dragDrop + resolveDropData with the Item-only guard', () => {
    assert.ok(editSource.includes('use:dragDrop'), 'uses the dragDrop action');
    assert.ok(editSource.includes('resolveDropData'), 'resolves drop data');
    assert.ok(editSource.includes("type !== 'Item' || !uuid"), 'Item-only + non-empty uuid guard');
    assert.ok(editSource.includes('onAddRecipeItem('), 'links via onAddRecipeItem');
    assert.ok(editSource.includes('onSetRecipeItem('), 'persists via onSetRecipeItem');
  });

  it('uses the canonical recipeItemId, never the legacy linkedRecipeItemUuid', () => {
    assert.ok(editSource.includes('recipeItemId'), 'references recipeItemId');
    assert.equal(editSource.includes('linkedRecipeItemUuid'), false, 'never references the legacy alias');
  });

  it('does not delete the shared recipe-item definition on unlink', () => {
    assert.equal(editSource.includes('deleteRecipeItemDefinition'), false, 'unlink must not delete the shared definition');
  });

  it('resolves the underlying item in a cancelled-guarded $effect', () => {
    assert.ok(editSource.includes('globalThis.fromUuid'), 'resolves via fromUuid');
    assert.ok(editSource.includes('let cancelled = false'), 'effect carries a cancelled guard');
    assert.ok(editSource.includes('cancelled = true'), 'cleanup flips the cancelled guard');
  });

  it('carries the EnvironmentSummaryInspector a11y contract', () => {
    assert.ok(editSource.includes('role="group"'), 'linked container is a group');
    assert.ok(editSource.includes('aria-label='), 'linked container has an aria-label');
    assert.ok(editSource.includes('svelte-ignore a11y_no_noninteractive_element_interactions'), 'carries the ignore comment');
    assert.ok(editSource.includes('manager-icon-button is-danger'), 'visible danger unlink button');
  });

  it('wires open, copy, and missing states', () => {
    assert.ok(editSource.includes('onOpenItem('), 'open wired');
    assert.ok(editSource.includes('onCopyItemUuid('), 'copy-uuid wired');
    assert.ok(editSource.includes('FABRICATE.Admin.Manager.Recipe.RecipeItemMissing'), 'missing state copy');
  });
});

describe('adminStore recipe-item projections + API', () => {
  it('exports updateRecipe and addRecipeItemFromUuid', () => {
    assert.ok(/async function updateRecipe\(/.test(storeSource), 'updateRecipe defined');
    assert.ok(/async function addRecipeItemFromUuid\(/.test(storeSource), 'addRecipeItemFromUuid defined');
    assert.ok(/\n\s*updateRecipe,/.test(storeSource), 'updateRecipe exported');
    assert.ok(/\n\s*addRecipeItemFromUuid,/.test(storeSource), 'addRecipeItemFromUuid exported');
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
    assert.ok(/function handleAddRecipeItem\(/.test(rootSource), 'handleAddRecipeItem defined');
    assert.ok(/function handleSetRecipeItem\(/.test(rootSource), 'handleSetRecipeItem defined');
    assert.ok(rootSource.includes('canSaveRecipeEdit'), 'canSaveRecipeEdit derived');
    assert.ok(rootSource.includes('recipeKnowledgeMode'), 'recipeKnowledgeMode derived');
  });

  it('wires the recipe-edit header chip + Save/Cancel and the expanded view props', () => {
    assert.ok(rootSource.includes('form="manager-recipe-edit-form"'), 'header Save submits the recipe-edit form');
    assert.ok(rootSource.includes('FABRICATE.Admin.Manager.Recipe.Dirty'), 'dirty chip uses Recipe.Dirty');
    assert.ok(rootSource.includes('onclick={cancelRecipeEdit}'), 'header Cancel wired');
    assert.ok(rootSource.includes('knowledgeMode={recipeKnowledgeMode}'), 'passes knowledgeMode');
    assert.ok(rootSource.includes('onPickImagePath={services?.pickImagePath}'), 'passes onPickImagePath');
    assert.ok(rootSource.includes('onSave={saveRecipeEdit}'), 'passes onSave');
    assert.ok(rootSource.includes('onDraftChange={handleRecipeDraftChange}'), 'passes onDraftChange');
  });

  it('wires confirmRecipeRouteExit into the route-exit chain', () => {
    assert.ok(/function confirmRecipeRouteExit\(/.test(rootSource), 'confirmRecipeRouteExit defined');
    assert.ok(rootSource.includes('confirmRecipeRouteExit(nextView)'), 'recipe route exit is part of the chain');
    assert.ok(rootSource.includes('FABRICATE.Admin.Manager.Recipe.DiscardDirtyContent'), 'discard prompt uses the DiscardDirty content key');
  });
});

describe('recipe-edit CSS workspace block', () => {
  function workspaceBlock() {
    const start = css.indexOf('.fabricate-manager .manager-recipe-workspace {');
    assert.ok(start >= 0, 'recipe workspace block present');
    const end = css.indexOf('}', css.indexOf('.manager-recipe-inspector', start));
    return css.slice(start, end);
  }

  it('uses a 340px right column collapsing to one column when hidden', () => {
    const block = workspaceBlock();
    assert.ok(block.includes('grid-template-columns: minmax(0, 1fr) 340px'), 'two-column grid with 340px sidebar');
    assert.ok(block.includes('is-inspector-hidden'), 'single-column path');
  });

  it('uses no colour literal in the recipe-scoped block', () => {
    const block = workspaceBlock();
    assert.equal(/#[0-9a-fA-F]{3,8}\b/.test(block), false, 'no hex colour literals');
    assert.equal(/\brgb\(/.test(block), false, 'no rgb literals');
  });

  it('places the single-column collapse inside the only 960px container query', () => {
    const matches = css.match(/@container fabricate-manager \(max-width: 960px\)/g) || [];
    assert.equal(matches.length, 1, 'exactly one 960px container query block');
    const qStart = css.indexOf('@container fabricate-manager (max-width: 960px)');
    const qBlock = css.slice(qStart, css.indexOf('\n}\n', qStart));
    assert.ok(qBlock.includes('.manager-recipe-workspace'), 'recipe collapse rule lives inside the 960px query');
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
});
