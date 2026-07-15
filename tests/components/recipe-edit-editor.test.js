import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dirname, '../..');
const editPath = resolve(repoRoot, 'src/ui/svelte/apps/manager/RecipeEditView.svelte');
const overviewPath = resolve(repoRoot, 'src/ui/svelte/apps/manager/recipe/RecipeOverviewTab.svelte');
const railPath = resolve(repoRoot, 'src/ui/svelte/apps/manager/recipe/RecipeContextRail.svelte');
const rootPath = resolve(repoRoot, 'src/ui/svelte/apps/manager/CraftingSystemManagerRoot.svelte');
const browserPath = resolve(repoRoot, 'src/ui/svelte/apps/manager/RecipesBrowserView.svelte');
const browserInspectorPath = resolve(
  repoRoot,
  'src/ui/svelte/apps/manager/recipes/RecipeBrowserInspector.svelte'
);
const storePath = resolve(repoRoot, 'src/ui/svelte/stores/adminStore.js');
const modelPath = resolve(repoRoot, 'src/models/Recipe.js');
const managerPath = resolve(repoRoot, 'src/systems/RecipeManager.js');
const graphPath = resolve(repoRoot, 'src/ui/svelte/util/recipeGraphBuilder.js');
const iconsPath = resolve(repoRoot, 'src/ui/svelte/util/recipeImageIcons.js');
const langPath = resolve(repoRoot, 'lang/en.json');
const cssPath = resolve(repoRoot, 'styles/fabricate.css');
const routingAssignmentPath = resolve(
  repoRoot,
  'src/ui/svelte/apps/manager/recipe/RecipeRoutingAssignment.svelte'
);
const resultGroupCardPath = resolve(
  repoRoot,
  'src/ui/svelte/apps/manager/recipe/RecipeResultGroupCard.svelte'
);

const editSource = readFileSync(editPath, 'utf8');
// The identity card + locked image-picker markup live in the Overview tab. The
// editor is fully controlled: the root holds the recipe draft and the shell forwards
// identity edits via onUpdateRecipe / onToggleEnabled (no form, no local draft state).
const overviewSource = readFileSync(overviewPath, 'utf8');
const railSource = readFileSync(railPath, 'utf8');
const rootSource = readFileSync(rootPath, 'utf8');
const browserSource = readFileSync(browserPath, 'utf8');
const browserInspectorSource = readFileSync(browserInspectorPath, 'utf8');
const storeSource = readFileSync(storePath, 'utf8');
const modelSource = readFileSync(modelPath, 'utf8');
const managerSource = readFileSync(managerPath, 'utf8');
const graphSource = readFileSync(graphPath, 'utf8');
const iconsSource = readFileSync(iconsPath, 'utf8');
const lang = JSON.parse(readFileSync(langPath, 'utf8'));
const css = readFileSync(cssPath, 'utf8');
const routingAssignmentSource = readFileSync(routingAssignmentPath, 'utf8');
const resultGroupCardSource = readFileSync(resultGroupCardPath, 'utf8');

const recipeLang = lang.FABRICATE.Admin.Manager.Recipe;
const BLUEPRINT_DEFAULT = 'icons/sundries/documents/blueprint-recipe-alchemical.webp';

describe('RecipeEditView identity-only single column', () => {
  it('renders the identity card in the standard manager-main, with no bespoke workspace', () => {
    // The editor is fully controlled now: no <form> wrapper, the root's header Save
    // button commits the staged draft.
    assert.equal(editSource.includes('manager-recipe-edit-form'), false, 'no recipe-edit form wrapper in the controlled view');
    assert.equal(/<form\b/.test(editSource), false, 'the controlled editor renders no form element');
    assert.ok(editSource.includes('manager-recipe-edit-main'), 'reuses the recipe-edit main class');
    assert.equal(editSource.includes('manager-recipe-workspace'), false, 'no bespoke workspace grid');
    assert.equal(editSource.includes('manager-recipe-edit-panel'), false, 'no bespoke editing panel');
    assert.equal(editSource.includes('manager-recipe-inspector'), false, 'no view-internal inspector column');
    assert.equal(editSource.includes('is-inspector-hidden'), false, 'no inspector-hidden toggle');
  });

  it('rebuilds the Overview tab to the prototype (micro-labels, select row, status cards, inline duration)', () => {
    // The card-stack chrome is gone: micro-labels over unwrapped fields (issue 643).
    assert.equal(overviewSource.includes('manager-task-core-card'), false, 'no reused task core card wrapper');
    assert.ok(overviewSource.includes('manager-recipe-micro-label'), 'uppercase micro-labels over fields');
    assert.ok(overviewSource.includes('manager-task-image-picker'), 'keeps the shared image picker (capability)');
    assert.ok(overviewSource.includes('manager-status-toggle'), 'reuses the status toggle');
    // Category authored on Overview (prototype §5.1), not the rail.
    assert.ok(overviewSource.includes('data-recipe-category-select'), 'category select lives on Overview');
    // Two side-by-side status cards (Enabled + Locked).
    assert.ok(overviewSource.includes('manager-recipe-status-card'), 'status cards for enabled + locked');
    assert.ok(overviewSource.includes('data-recipe-section="enabled-status"'), 'enabled status card');
    assert.ok(overviewSource.includes('data-recipe-section="locked-status"'), 'locked status card');
    // Always-visible inline duration steppers replace the popover on the tab.
    assert.ok(overviewSource.includes('RecipeDurationSteppers'), 'inline duration steppers on the Duration card');
    assert.ok(overviewSource.includes('data-recipe-field="name"'), 'name field bound');
    assert.ok(overviewSource.includes('data-recipe-field="description"'), 'description field bound');
    assert.ok(overviewSource.includes('data-recipe-field="enabled"'), 'enabled toggle bound');
    assert.ok(overviewSource.includes('data-recipe-field="locked"'), 'locked toggle bound');
    assert.ok(overviewSource.includes('data-recipe-field="img"'), 'image picker bound');
  });

  it('keeps the empty select-a-recipe state', () => {
    assert.ok(editSource.includes('FABRICATE.Admin.Manager.Recipe.SelectRecipe'), 'empty state copy retained');
  });

  it('is fully controlled: identity edits stage via onUpdateRecipe and enabled via onToggleEnabled', () => {
    // No local identity state / dirty / save machinery survives in the view.
    assert.equal(editSource.includes('onDirtyChange'), false, 'no onDirtyChange prop/emit');
    assert.equal(editSource.includes('onDraftChange'), false, 'no onDraftChange prop/emit');
    assert.equal(editSource.includes('onSave'), false, 'no onSave prop/emit');
    assert.equal(editSource.includes('buildDraftSummary'), false, 'no draft summary builder');
    assert.equal(/let name = \$state/.test(editSource), false, 'no local name state');
    assert.equal(/let enabled = \$state/.test(editSource), false, 'no local enabled state');
    // Identity edits emit onUpdateRecipe; the enabled toggle emits onToggleEnabled.
    assert.ok(editSource.includes('onUpdateRecipe({ name: value })'), 'name input stages via onUpdateRecipe');
    assert.ok(editSource.includes('onUpdateRecipe({ description: value })'), 'description input stages via onUpdateRecipe');
    assert.ok(editSource.includes('onUpdateRecipe({ img: value })'), 'image picker stages via onUpdateRecipe');
    assert.ok(editSource.includes('{onToggleEnabled}'), 'the enabled toggle forwards onToggleEnabled');
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

describe('RecipeContextRail (issue 643 §4b)', () => {
  it('renders inspector cards with the frozen recipe-item section marker', () => {
    assert.ok(railSource.includes('manager-inspector-card'), 'reuses inspector card');
    assert.ok(
      railSource.includes('data-recipe-section="recipe-item"'),
      'recipe-item section marker (FROZEN: the smoke harness waits on it)'
    );
    assert.ok(
      railSource.includes('manager-environment-scene-linked'),
      'reuses linked container class'
    );
  });

  it('is MODE-CONDITIONAL off craftingEffect, and renders neither section under global', () => {
    assert.ok(railSource.includes('visibilityEffect?.showAccess'), 'restricted branch');
    assert.ok(railSource.includes('visibilityEffect?.showBooksScrolls'), 'item/knowledge branch');
    // The prop must NOT be called `effect`: the compiler then reads `$effect(...)` as
    // a store subscription (`$` + `effect`) and the component throws at mount.
    assert.equal(
      /^\s*effect = /m.test(railSource),
      false,
      'the craftingEffect prop is never named `effect` (it would shadow the $effect rune)'
    );
  });

  it('carries NO book drop zone and NO "link another" — adding to a book lives on Books & Scrolls', () => {
    assert.equal(railSource.includes('use:dragDrop'), false, 'no drop action');
    assert.equal(railSource.includes('data-recipe-item-dropzone'), false, 'no drop zone');
    assert.equal(railSource.includes('onAddRecipeItem'), false, 'no add-recipe-item path');
    assert.equal(railSource.includes('RecipeItemLinkAnother'), false, 'no link-another affordance');
    // Removing THIS recipe from a book it already appears in is still allowed.
    assert.ok(railSource.includes('onRemoveRecipeItem('), 'per-row removal retained');
    assert.ok(railSource.includes('data-recipe-open-books'), 'deep-links to Books & Scrolls');
  });

  it('never resolves access ids itself and never mutates the grant', () => {
    // The store resolves (over EVERY world actor, not the PC roster); the rail takes
    // resolved rows. Unresolvable ids are dropped from display, never persisted away.
    assert.ok(railSource.includes('accessPlayers'), 'takes resolved players');
    assert.ok(railSource.includes('accessCharacters'), 'takes resolved characters');
    assert.equal(railSource.includes('characterIds'), false, 'the rail never touches grant ids');
    assert.equal(railSource.includes('playerIds'), false, 'the rail never touches grant ids');
    assert.equal(railSource.includes('saveRecipeAccess'), false, 'the rail is read-only');
    assert.ok(railSource.includes('data-recipe-open-access'), 'deep-links to the Access tab');
  });

  it('treats the character->player relation as a SET, with the whole-table case distinct', () => {
    assert.ok(railSource.includes('controlledBy'), 'reads the controller SET');
    assert.ok(
      railSource.includes('sharedWithAllPlayers'),
      'ownership.default >= OWNER reaches the whole table'
    );
    assert.ok(
      railSource.includes('Rail.SharedWithAllPlayers'),
      'the whole-table case has its OWN string, never "Played by <one name>"'
    );
    assert.equal(railSource.includes('playedBy'), false, 'no lossy singular playedBy field');
  });

  it('uses item iconography and the shared image constant', () => {
    assert.ok(railSource.includes('fa-suitcase'), 'missing thumb uses a suitcase icon');
    assert.ok(
      railSource.includes(
        "import { DEFAULT_RECIPE_IMAGE } from '../../../util/recipeImageIcons.js'"
      ),
      'image fallback uses the shared DEFAULT_RECIPE_IMAGE constant'
    );
    assert.equal(railSource.includes("'icons/svg/item-bag.svg'"), false, 'no bag-SVG literal');
    assert.equal(railSource.includes('fa-map'), false, 'no map icon');
  });

  it('uses the canonical recipeItemId, never the legacy linkedRecipeItemUuid', () => {
    assert.ok(railSource.includes('recipeItemId'), 'references recipeItemId');
    assert.equal(
      railSource.includes('linkedRecipeItemUuid'),
      false,
      'never references the legacy alias'
    );
  });

  it('does not delete the shared recipe-item definition on unlink', () => {
    assert.equal(
      railSource.includes('deleteRecipeItemDefinition'),
      false,
      'unlink must not delete the shared definition'
    );
  });

  it('resolves each linked book in a cancelled-guarded $effect', () => {
    assert.ok(railSource.includes('globalThis.fromUuid'), 'resolves via fromUuid');
    assert.ok(railSource.includes('let cancelled = false'), 'effect carries a cancelled guard');
    assert.ok(railSource.includes('cancelled = true'), 'cleanup flips the cancelled guard');
  });

  it('carries the linked-list a11y contract and the missing state', () => {
    assert.ok(railSource.includes('data-recipe-item-links'), 'renders the linked-items list');
    assert.ok(railSource.includes('aria-label='), 'the list has an aria-label');
    assert.ok(railSource.includes('manager-icon-button is-danger'), 'visible danger unlink button');
    assert.ok(railSource.includes('onOpenItem('), 'open wired');
    assert.ok(
      railSource.includes('FABRICATE.Admin.Manager.Recipe.RecipeItemMissing'),
      'missing state copy'
    );
  });

  it('renders Step mode as a real SegmentedControl and the validation mini-list, with NO Recipe mode toggle', () => {
    assert.ok(railSource.includes("import SegmentedControl from '../SegmentedControl.svelte'"));
    assert.ok(railSource.includes("optionDataAttr=\"data-recipe-step-mode-option\""));
    // The Step-mode control fills its rail track full-width (issue 643).
    assert.ok(railSource.includes('fill={true}'), 'Step-mode SegmentedControl opts into fill');
    // Recipe complexity is emergent from the ingredient-set count now (issue 643):
    // the rail carries no Simple/Complex control at all.
    assert.equal(railSource.includes('data-recipe-mode-option'), false, 'no Recipe mode segmented control');
    assert.equal(railSource.includes('data-recipe-section="recipe-mode"'), false, 'no Recipe mode rail section');
    assert.equal(railSource.includes('onSetComplexity'), false, 'the rail no longer wires a complexity setter');
    assert.ok(railSource.includes('data-recipe-validation-clear'), 'an All clear pill');
    assert.ok(railSource.includes('data-recipe-rail-check'), 'the failing-check list');
  });
});

describe('RecipeModeBanner (issue 643 §5)', () => {
  const bannerSource = readFileSync(
    resolve(repoRoot, 'src/ui/svelte/apps/manager/recipe/RecipeModeBanner.svelte'),
    'utf8'
  );

  it('reuses the canonical resolution-mode option list rather than re-authoring one', () => {
    assert.ok(
      bannerSource.includes("import { resolutionModeOptions } from '../resolutionModeOptions.js'"),
      'reads the canonical { value, icon, labelKey, descKey } list'
    );
    assert.equal(bannerSource.includes('MODE_INFO'), false, 'no second, drifting copy of the table');
  });

  it('states that the mode is SYSTEM-level and routes to Crafting Settings', () => {
    assert.ok(bannerSource.includes('data-recipe-mode-banner-settings'), 'a settings deep-link');
    assert.ok(bannerSource.includes('ModeBanner.SettingsHint'), 'says the mode is system-wide');
    // A per-recipe resolution mode does not exist; the banner must not offer one.
    assert.equal(bannerSource.includes('onChange'), false, 'no per-recipe mode control');
  });

  it('is rendered by the editor shell below the tab strip so the tabs stay attached to the header (§4.2)', () => {
    assert.ok(editSource.includes('<RecipeModeBanner'), 'the shell renders the banner');
    assert.ok(
      editSource.indexOf('<RecipeEditorTabs') < editSource.indexOf('<RecipeModeBanner'),
      'header → tabs → banner → content: the banner sits below the tab strip'
    );
  });

  it('reads as an INFO banner with an icon medallion, not as one more card', () => {
    assert.ok(
      bannerSource.includes('manager-recipe-mode-banner-medallion'),
      'the icon sits in a medallion'
    );
    assert.ok(
      bannerSource.includes('background: var(--fab-info-soft);') &&
        bannerSource.includes('border: 1px solid var(--fab-info-border);'),
      'the banner is info-toned — it explains why the editor below it has the shape it has'
    );
  });

  it('lets the description WRAP — it is the one sentence the banner exists to deliver', () => {
    // It was `white-space: nowrap` + ellipsis, so at 900px (and for any longer localized
    // string) the sentence was truncated to a few words.
    const desc = bannerSource.slice(bannerSource.indexOf('.manager-recipe-mode-banner-desc'));
    const block = desc.slice(0, desc.indexOf('}'));
    assert.equal(block.includes('white-space: nowrap;'), false, 'the sentence is not truncated');
    assert.ok(block.includes('-webkit-line-clamp: 2;'), 'it wraps, clamped to two lines');
    assert.ok(block.includes('line-height: 1.45;'));
  });
});

describe('the progressive reorder announcement', () => {
  const cardSource = readFileSync(
    resolve(repoRoot, 'src/ui/svelte/apps/manager/recipe/RecipeResultGroupCard.svelte'),
    'utf8'
  );
  const moveItem = cardSource.slice(
    cardSource.indexOf('function moveItem('),
    cardSource.indexOf('// Routing provider:')
  );

  it('reads the moved result NAME before the reorder, not after', () => {
    // `reorderItem` emits the reordered group. Once the parent round-trips the new prop,
    // `results[index]` is the item that swapped INTO that slot — so a name read after the
    // move announces the wrong result.
    const nameRead = moveItem.indexOf('componentNameFor(results[index])');
    const reorder = moveItem.indexOf('reorderItem(index, target)');
    assert.ok(nameRead > -1 && reorder > -1);
    assert.ok(nameRead < reorder, 'the name is captured before the array moves under it');
    assert.ok(
      moveItem.indexOf('const total = results.length') < reorder,
      'so is the total'
    );
  });

  it('announces through ONE localized key with placeholders, not a concatenation', () => {
    // "…MovedToPosition… {n} …OfCount… {n}" hard-codes English word order into the
    // component; a translator cannot reorder a sentence assembled from fragments.
    assert.ok(moveItem.includes('ResultMoveAnnouncement'), 'one key carries the whole sentence');
    for (const fragment of ['MovedToPosition', 'OfCount']) {
      assert.equal(
        cardSource.includes(fragment),
        false,
        `${fragment} was a sentence fragment and is gone`
      );
    }
    const announcement = lang.FABRICATE.Admin.Manager.Recipe.ResultMoveAnnouncement;
    for (const token of ['{name}', '{position}', '{total}']) {
      assert.ok(announcement.includes(token), `the key takes ${token}`);
    }
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
  it('owns the root-held recipe draft and its staging handlers', () => {
    assert.ok(/async function saveRecipeDraft\(/.test(rootSource), 'saveRecipeDraft defined');
    assert.ok(/function backToRecipesBrowse\(/.test(rootSource), 'backToRecipesBrowse defined');
    assert.ok(/async function deleteRecipeFromEdit\(/.test(rootSource), 'deleteRecipeFromEdit defined');
    assert.ok(/function patchRecipeDraft\(/.test(rootSource), 'patchRecipeDraft stages edits into the draft');
    // Adding a recipe to a book is authored on Books & Scrolls (issue 643 §2c), so
    // the recipe-side add/link handlers are gone; per-book REMOVAL is retained.
    assert.equal(rootSource.includes('handleAddRecipeItem'), false, 'no recipe-side book-add path');
    assert.equal(rootSource.includes('handleSetRecipeItem'), false, 'no recipe-side book-link path');
    assert.ok(/async function handleRemoveRecipeItem\(/.test(rootSource), 'handleRemoveRecipeItem retained');
    assert.ok(/async function handleToggleRecipeEnabled\(/.test(rootSource), 'handleToggleRecipeEnabled defined');
    // The draft + baseline + JSON-diff dirty flag are the source of truth.
    assert.ok(/let recipeDraft = \$state\(null\)/.test(rootSource), 'recipeDraft state declared');
    assert.ok(/let recipeDraftBaseline = \$state\(null\)/.test(rootSource), 'recipeDraftBaseline state declared');
    assert.ok(rootSource.includes('JSON.stringify(recipeDraft) !== JSON.stringify(recipeDraftBaseline)'), 'dirty derives from a JSON diff');
    // The editor no longer calls the immediate-persist store methods.
    assert.equal(rootSource.includes('store.deleteRecipeStep?.('), false, 'editor no longer calls store.deleteRecipeStep');
    assert.equal(rootSource.includes('store.setRecipeComplexity?.('), false, 'editor no longer calls store.setRecipeComplexity');
    assert.equal(rootSource.includes('store.revertRecipeToSingleStep?.('), false, 'editor no longer calls store.revertRecipeToSingleStep');
    assert.ok(rootSource.includes('canSaveRecipeEdit'), 'canSaveRecipeEdit derived');
    // The rail's composition keys off the CANONICAL visibilityMode matrix, not the
    // legacy recipeVisibility.knowledge.mode the old inspector gate read.
    assert.equal(rootSource.includes('recipeKnowledgeMode'), false, 'the legacy knowledge-mode gate is gone');
  });

  it('stages destructive in-draft actions through the confirm-only store helper', () => {
    assert.ok(rootSource.includes('store.confirmRecipeAction?.('), 'destructive actions confirm via store.confirmRecipeAction');
    assert.ok(/async function confirmRecipeAction\(/.test(storeSource), 'store defines confirmRecipeAction');
    assert.ok(/\n[ \t]*confirmRecipeAction,/.test(storeSource), 'store exports confirmRecipeAction');
  });

  it('never seeds an alchemy routing provider on Complex (the per-recipe provider is retired)', () => {
    // Alchemy now routes on the system-level alchemy.checkMode, so the per-recipe
    // resultSelection.provider is retired: entering Complex seeds NOTHING, and the
    // Complex toggle is hidden for alchemy (its shape derives from checkMode).
    assert.ok(
      !rootSource.includes(
        "import { chooseSeedProvider } from '../../../../migration/migrateRecipeForModeChange.js'"
      ),
      'root no longer imports the retired provider-choice contract'
    );
    assert.ok(
      !rootSource.includes('chooseSeedProvider('),
      'root no longer seeds an alchemy resultSelection.provider'
    );
    // The Simple/Complex toggle is gone entirely (issue 643): complexity is emergent
    // from structure, and alchemy already forced a single set, so there is no toggle
    // to hide any more.
    assert.equal(rootSource.includes('hideComplexToggle'), false, 'no hideComplexToggle prop threaded from the root');
    assert.equal(railSource.includes('hideComplexToggle'), false, 'the rail declares no hideComplexToggle prop');
    // Alchemy forbids adding ingredient sets; the emergent add-set affordance is gated
    // on recipeCanAddSet, which excludes alchemy.
    assert.ok(
      rootSource.includes("recipeMultiSetAllowed && selectedSystem?.resolutionMode !== 'alchemy'"),
      'recipeCanAddSet excludes alchemy from the add-ingredient-set affordance'
    );
  });

  it('sources the destructive recipe confirm titles + content from lang keys', () => {
    // Keys exist with the expected English copy and HTML-preserving interpolation.
    assert.equal(recipeLang.RevertToSingleStepTitle, 'Switch to single-step?');
    assert.ok(recipeLang.RevertToSingleStepContent.includes('<strong>{name}</strong>'), 'revert content keeps the bold name placeholder');
    // The Simple/Complex toggle (and its Switch-to-simple confirm) is gone (issue 643):
    // complexity is emergent, so those keys are retired.
    assert.equal(recipeLang.SwitchToSimpleTitle, undefined, 'the retired switch-to-simple title key is removed');
    assert.equal(recipeLang.SwitchToSimpleContent, undefined, 'the retired switch-to-simple content key is removed');
    assert.equal(recipeLang.DeleteStepTitle, 'Delete step?');
    assert.ok(recipeLang.DeleteStepContent.includes('<strong>{name}</strong>'), 'delete-step content keeps the bold name placeholder');
    assert.ok(recipeLang.DeleteStepContent.includes('{alsoDeleted}'), 'delete-step content keeps the alsoDeleted placeholder');
    for (const key of ['DeleteStepAlsoIngredients', 'DeleteStepAlsoResults', 'DeleteStepAlsoTools', 'DeleteStepAlsoAll']) {
      assert.equal(typeof recipeLang[key], 'string', `${key} fragment defined`);
    }
    assert.equal(recipeLang.UnnamedStep, 'this step');

    // The handlers localize these keys rather than embedding hardcoded English.
    assert.ok(rootSource.includes("localize('FABRICATE.Admin.Manager.Recipe.RevertToSingleStepTitle')"), 'revert title localized');
    assert.ok(rootSource.includes("localize('FABRICATE.Admin.Manager.Recipe.RevertToSingleStepContent', { name })"), 'revert content localized with name');
    assert.equal(rootSource.includes('SwitchToSimple'), false, 'the retired switch-to-simple confirm is gone from the root');
    assert.ok(rootSource.includes("localize('FABRICATE.Admin.Manager.Recipe.DeleteStepTitle')"), 'delete-step title localized');
    assert.ok(rootSource.includes("localize('FABRICATE.Admin.Manager.Recipe.DeleteStepContent', { name, alsoDeleted })"), 'delete-step content localized with name + alsoDeleted');

    // No hardcoded English confirm copy lingers in the handlers.
    assert.equal(rootSource.includes("title: 'Switch to single-step?'"), false, 'no hardcoded revert title');
    assert.equal(rootSource.includes("title: 'Switch to simple?'"), false, 'no hardcoded switch-to-simple title');
    assert.equal(rootSource.includes("title: 'Delete step?'"), false, 'no hardcoded delete-step title');
  });

  it('wires the recipe-edit header chip + Back/Delete/Save and the controlled view props', () => {
    assert.ok(rootSource.includes('onclick={saveRecipeDraft}'), 'header Save commits via a plain onclick');
    assert.equal(rootSource.includes('form="manager-recipe-edit-form"'), false, 'header Save no longer submits a form');
    assert.ok(rootSource.includes('FABRICATE.Admin.Manager.Recipe.Dirty'), 'dirty chip uses Recipe.Dirty');
    assert.ok(rootSource.includes('onclick={backToRecipesBrowse}'), 'header Back to recipes wired');
    assert.ok(rootSource.includes('FABRICATE.Admin.Manager.Recipe.BackToBrowse'), 'Back button uses Recipe.BackToBrowse');
    assert.ok(rootSource.includes('onclick={deleteRecipeFromEdit}'), 'header Delete recipe wired');
    assert.ok(rootSource.includes('FABRICATE.Admin.Manager.Recipe.Delete'), 'Delete button uses Recipe.Delete');
    // Scope the danger-class assertion to the recipe-edit header branch.
    const recipeEditHeader = rootSource.slice(
      rootSource.indexOf("{:else if currentView === 'recipe-edit'}"),
      rootSource.indexOf("{:else if currentView === 'components'}")
    );
    assert.ok(recipeEditHeader.includes('is-danger'), 'Delete button carries the is-danger class');
    assert.ok(!recipeEditHeader.includes('cancelRecipeEdit'), 'recipe-edit header no longer renders Cancel');
    assert.ok(rootSource.includes('onPickImagePath={services?.pickImagePath}'), 'passes onPickImagePath');
    assert.ok(rootSource.includes('recipe={recipeDraft}'), 'passes the root-held draft as recipe');
    assert.ok(rootSource.includes('onUpdateRecipe={(patch) => patchRecipeDraft(patch)}'), 'onUpdateRecipe stages into the draft');
    assert.ok(rootSource.includes('onToggleEnabled={handleToggleRecipeEnabled}'), 'passes the immediate enabled toggle');
    // Scope the removed-prop assertions to the RecipeEditView mount (essence/component
    // editors still use onDraftChange/onDirtyChange of their own).
    const recipeViewMount = rootSource.slice(
      rootSource.indexOf('<RecipeEditView'),
      rootSource.indexOf('/>', rootSource.indexOf('<RecipeEditView'))
    );
    assert.equal(recipeViewMount.includes('onSave='), false, 'no onSave prop on the controlled view');
    assert.equal(recipeViewMount.includes('onDraftChange='), false, 'no onDraftChange prop on the controlled view');
    assert.equal(recipeViewMount.includes('onDirtyChange='), false, 'no onDirtyChange prop on the controlled view');
  });

  it('renders the context rail in the global inspector aside, ALWAYS present on recipe-edit', () => {
    assert.ok(rootSource.includes("import RecipeContextRail from './recipe/RecipeContextRail.svelte'"), 'imports the rail component');
    assert.ok(rootSource.includes('<RecipeContextRail'), 'renders the rail in an aside branch');
    // The rail is never hidden: recipe-edit is absent from the two-column override
    // list, so a hidden inspector left a 300px dead column (issue 643 §8).
    assert.equal(rootSource.includes('recipeInspectorVisible'), false, 'no conditional-hide gate remains');
    assert.ok(
      rootSource.includes('recipeRailEffect = $derived(craftingEffect('),
      'the rail composition is driven by the canonical craftingEffect matrix'
    );
    assert.ok(
      rootSource.includes('store.resolveRecipeAccess?.('),
      'access ids are resolved in the STORE, never in the rail'
    );
    // The aside's suppression list no longer names recipe-edit at all.
    const asideGuard = rootSource.slice(
      rootSource.indexOf("{#if currentView !== 'environment-edit' && currentView !== 'checks'"),
      rootSource.indexOf('<aside class="manager-inspector"')
    );
    assert.equal(
      asideGuard.includes("currentView !== 'recipe-edit'"),
      false,
      'the aside is never suppressed on recipe-edit — the context rail is always present'
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

  it('scopes the context-rail background to the Recipe Studio views (matching the main panel)', () => {
    // The shared inspector is one shade lighter (--fab-mv2-surface-2) than the main
    // editor panel. In the Recipe Studio views only, the rail drops onto the SAME
    // surface as the panel (--fab-mv2-surface-1); other screens keep their shade
    // (issue 643).
    assert.match(
      css,
      /\.fabricate-manager\[data-manager-view="recipe-edit"\]\s+\.manager-inspector,\s*\.fabricate-manager\[data-manager-view="recipes"\]\s+\.manager-inspector\s*\{\s*background:\s*var\(--fab-mv2-surface-1\);\s*\}/,
      'recipe-edit + recipes inspector background override'
    );
    // The global inspector rule is untouched: still the lighter shared shade.
    assert.match(
      css,
      /\.fabricate-manager\s+\.manager-inspector\s*\{[^}]*background:\s*var\(--fab-mv2-surface-2\);/,
      'the shared inspector keeps --fab-mv2-surface-2 on every other screen'
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
    assert.ok(railSource.includes('class="manager-environment-scene-name'), 'the rail books card uses the shared name class');
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
      railSource.includes("import { DEFAULT_RECIPE_IMAGE } from '../../../util/recipeImageIcons.js'"),
      'RecipeContextRail imports the constant'
    );
    assert.equal(railSource.includes("const DEFAULT_RECIPE_IMAGE = 'icons/svg/item-bag.svg'"), false, 'no local bag-SVG literal in the rail');
  });
});

describe('recipe image helpers prefer the linked recipe-item image', () => {
  it('RecipesBrowserView row thumbnail prefers recipeItemImg, then the shared resolver', () => {
    assert.ok(
      browserSource.includes("import { resolveRecipeImage } from '../../util/craftingImageDefaults.js'"),
      'browser imports the shared resolver'
    );
    assert.ok(
      browserSource.includes('recipe?.recipeItemImg || resolveRecipeImage(recipe)'),
      'row image prefers the linked item image, then the shared resolver'
    );
    assert.equal(browserSource.includes("recipe?.img || 'icons/svg/item-bag.svg'"), false, 'no bag-SVG row fallback');
  });

  // The library inspector's hero image moved out of the root with the inspector
  // (issue 643) and now uses the SAME shared resolver as the row, rather than a
  // second, subtly different `img || DEFAULT_RECIPE_IMAGE` fallback chain.
  it('the extracted library inspector resolves its hero image the same way the row does', () => {
    assert.ok(
      browserInspectorSource.includes(
        "import { resolveRecipeImage } from '../../../util/craftingImageDefaults.js'"
      ),
      'the library inspector imports the shared resolver'
    );
    assert.ok(
      browserInspectorSource.includes('recipe?.recipeItemImg || resolveRecipeImage(recipe)'),
      'inspector hero image prefers the linked item image, then the shared resolver'
    );
    // The root imports the shared constant for the editor header's medallion, but must
    // never re-own a local image-resolution helper.
    assert.equal(
      /function\s+recipeImage\s*\(/.test(rootSource),
      false,
      'the root no longer owns a recipe image helper'
    );
  });
});

describe('RecipeEditView locks the image picker to the linked recipe item', () => {
  it('derives the linked state and accepts the linkedItemImage prop', () => {
    assert.ok(editSource.includes('isRecipeItemLinked = $derived(Boolean(recipe?.recipeItemId))'), 'derives the linked state');
    assert.ok(/linkedItemImage\s*=\s*''/.test(editSource), 'accepts the linkedItemImage prop with a default');
  });

  it('renders the locked is-recipe-item-linked span with a lock icon and locked-image marker', () => {
    assert.ok(overviewSource.includes('{#if isRecipeItemLinked}'), 'branches on the linked state');
    assert.ok(overviewSource.includes('is-recipe-item-linked'), 'uses the recipe-specific locked class');
    assert.ok(overviewSource.includes('data-recipe-item-locked-image'), 'carries the locked-image marker attribute');
    assert.ok(overviewSource.includes('fa-lock'), 'shows a lock icon when linked');
    assert.ok(
      overviewSource.includes('FABRICATE.Admin.Manager.Recipe.RecipeItemLockedImage')
        && overviewSource.includes('FABRICATE.Admin.Manager.Recipe.RecipeItemLockedImageTooltip'),
      'uses the locked-image lang keys'
    );
    assert.ok(overviewSource.includes('src={linkedItemImage || recipeImage(img)}'), 'shows the linked item image when locked');
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

  it('passes the STAGED-draft linked recipe-item image into the view from the root', () => {
    // Regression: the locked Overview image must derive from the staged recipeDraft's
    // recipeItemId resolved against recipeItemDefinitions, NOT the persisted
    // selectedRecipe projection — so staging a link change updates the preview pre-save.
    assert.ok(
      rootSource.includes('linkedItemImage={recipeDraftLinkedItemImage}'),
      'root passes the staged-draft-derived image as linkedItemImage'
    );
    assert.equal(
      rootSource.includes("linkedItemImage={selectedRecipe?.recipeItemImg"),
      false,
      'root no longer reads the persisted selectedRecipe.recipeItemImg for the locked image'
    );
    assert.ok(
      /const recipeDraftLinkedItemImage = \$derived\(/.test(rootSource),
      'root derives the locked image from a dedicated $derived'
    );
    assert.ok(
      rootSource.includes('recipeDraft?.recipeItemId')
        && rootSource.includes('recipeItemDefinitions.find('),
      'the derivation resolves the staged recipeItemId against recipeItemDefinitions'
    );
  });
});

describe('routed result-set head anchors the add-trigger to the right (issue 643 CHANGE 4)', () => {
  it('pushes the routing add-trigger to the far right of the chip row via an auto margin', () => {
    assert.ok(
      /\.manager-recipe-routing-assignment-chips \.manager-recipe-routing-picker\s*\{[^}]*margin-left:\s*auto/.test(
        css
      ),
      'the routing add-trigger (picker) is anchored right with margin-left: auto so it sits by the delete button'
    );
  });

  it('keeps the reusable routing hooks intact on both routed heads', () => {
    // The add-trigger carries the routing-option add marker and chips carry the chip
    // hook — both are relied on by the mounted routing tests and the smoke harness.
    assert.ok(
      routingAssignmentSource.includes('triggerAddMarker="routing-option"'),
      'the add-trigger keeps its routing-option marker'
    );
    assert.ok(
      routingAssignmentSource.includes('data-routing-chip={chip.id}'),
      'each assigned chip keeps its data-routing-chip hook'
    );
    // The trigger (SearchablePopover wrapper) carries the routing-picker class the
    // right-anchor rule targets, and it is the LAST flow child after the chips.
    assert.ok(
      routingAssignmentSource.includes('manager-recipe-routing-picker'),
      'the add-trigger wrapper carries the routing-picker class'
    );
    assert.ok(
      routingAssignmentSource.indexOf('{#each chips') <
        routingAssignmentSource.indexOf('manager-recipe-routing-picker'),
      'the add-trigger renders after the chips so the auto margin pushes only it right'
    );
  });

  it('places the delete button immediately after the routing head in the result-set head', () => {
    // The head reads [routing assignment (label + chips + right-anchored add)] [trash],
    // so the add-trigger lands next to the delete (result-set remove) button.
    assert.ok(
      resultGroupCardSource.includes('data-recipe-remove="result-set"'),
      'the result-set head keeps its delete hook'
    );
    assert.ok(
      resultGroupCardSource.indexOf('<RecipeRoutingAssignment') <
        resultGroupCardSource.indexOf('data-recipe-remove="result-set"'),
      'the delete button follows the routing assignment in the head'
    );
  });
});

describe('recipe locked-image picker reuses the scene-locked visuals', () => {
  it('groups is-recipe-item-linked into the existing locked-picker rules (no duplicated declarations, no raw colours)', () => {
    assert.ok(
      css.includes('.manager-task-image-picker.is-recipe-item-linked'),
      'recipe locked class is styled'
    );
    assert.ok(
      /\.is-scene-linked,\n[ \t]*\.fabricate-manager \.manager-task-image-picker\.is-recipe-item-linked[\s,{]/.test(css),
      'recipe locked class is comma-joined into the cursor rule alongside the scene class'
    );
    assert.ok(
      css.includes('.manager-task-image-picker.is-recipe-item-linked .fa-lock'),
      'recipe lock icon shares the muted colour rule'
    );
  });
});
