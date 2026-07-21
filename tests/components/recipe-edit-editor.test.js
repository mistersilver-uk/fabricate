import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dirname, '../..');
const editPath = resolve(repoRoot, 'src/ui/svelte/apps/manager/RecipeEditView.svelte');
const overviewPath = resolve(repoRoot, 'src/ui/svelte/apps/manager/recipe/RecipeOverviewTab.svelte');
// Issue 676 deleted RecipeContextRail; its content lives in these two tabs (plus the
// Step-mode control on Overview above).
const accessTabPath = resolve(repoRoot, 'src/ui/svelte/apps/manager/recipe/RecipeAccessTab.svelte');
const booksTabPath = resolve(
  repoRoot,
  'src/ui/svelte/apps/manager/recipe/RecipeBooksScrollsTab.svelte'
);
const tabsPath = resolve(repoRoot, 'src/ui/svelte/apps/manager/recipe/RecipeEditorTabs.svelte');
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
const accessTabSource = readFileSync(accessTabPath, 'utf8');
const booksTabSource = readFileSync(booksTabPath, 'utf8');
const tabsSource = readFileSync(tabsPath, 'utf8');
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

// Extract a single scoped-`<style>` rule block by its selector and assert it (a) carries
// each required fragment and (b) no longer sets `max-width` (the issue-796 cap on both the
// grid list and the empty panel). The selector must be given VERBATIM — for the grid rule
// pass the COMPOUND `.manager-recipe-books-tab .manager-recipe-item-links`, since a bare
// `.manager-recipe-item-links` regex would match the leftover `margin: 0` block first.
function assertScopedRuleHasNoMaxWidth(source, selector, { mustContain = [] } = {}) {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const rule = source.match(new RegExp(`${escaped}\\s*\\{[^}]*\\}`));
  assert.ok(rule, `scoped rule for "${selector}" exists`);
  for (const fragment of mustContain) {
    assert.ok(rule[0].includes(fragment), `"${selector}" declares ${fragment}`);
  }
  assert.equal(/max-width/.test(rule[0]), false, `"${selector}" no longer carries the cap`);
}

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
    assert.ok(overviewSource.includes('ToggleCard'), 'reuses the shared ToggleCard for the status toggles (issue 658 retrofit)');
    // Category authored on Overview (prototype §5.1), not the rail.
    assert.ok(overviewSource.includes('data-recipe-category-select'), 'category select lives on Overview');
    // Two side-by-side status cards (Enabled + Locked) now render through the shared
    // ToggleCard extracted in issue 651; the issue-658 retrofit is a byte-faithful DOM
    // no-op, so the section/field markers move from inlined attributes onto props.
    assert.ok(overviewSource.includes('variant="is-enabled"'), 'enabled status card via ToggleCard');
    assert.ok(overviewSource.includes('variant="is-locked"'), 'locked status card via ToggleCard');
    assert.ok(overviewSource.includes('section="enabled-status"'), 'enabled status card section marker');
    assert.ok(overviewSource.includes('section="locked-status"'), 'locked status card section marker');
    // Always-visible inline duration steppers replace the popover on the tab.
    assert.ok(overviewSource.includes('RecipeDurationSteppers'), 'inline duration steppers on the Duration card');
    assert.ok(overviewSource.includes('data-recipe-field="name"'), 'name field bound');
    assert.ok(overviewSource.includes('data-recipe-field="description"'), 'description field bound');
    assert.ok(overviewSource.includes('field="enabled"'), 'enabled toggle bound');
    assert.ok(overviewSource.includes('field="locked"'), 'locked toggle bound');
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

  // The view threads `recipeItemDefinitions` to the read-only Books & Scrolls TAB
  // (issue 676 rehomed it here from the deleted rail). What must never come back is the
  // AUTHORING path: adding a recipe to a book is owned by the book's own editor, and a
  // recipe-side add would be a second writer for the same many-to-many.
  it('carries no recipe-item AUTHORING state, props, or drop zone in the view', () => {
    assert.equal(editSource.includes('knowledgeMode'), false, 'no knowledgeMode prop');
    assert.equal(editSource.includes('onAddRecipeItem'), false, 'no add-recipe-item prop');
    assert.equal(editSource.includes('onSetRecipeItem'), false, 'no set-recipe-item prop');
    assert.equal(editSource.includes('manager-environment-scene-dropzone'), false, 'no recipe-item dropzone');
    assert.equal(editSource.includes('manager-environment-scene-linked'), false, 'no recipe-item linked card');
    assert.equal(editSource.includes('dragDrop'), false, 'no dragDrop import/usage');
    assert.equal(editSource.includes('resolveDropData'), false, 'no resolveDropData import/usage');
    // The read-only summary props ARE expected, and are forwarded to the tab.
    assert.ok(editSource.includes('recipeItemDefinitions'), 'forwards the definition library to the books tab');
    assert.ok(editSource.includes('onRemoveRecipeItem'), 'forwards the per-row unlink (a removal, not authoring)');
  });

  it('does not render a draft-state card', () => {
    assert.equal(editSource.includes('DraftState'), false, 'no draft-state card copy');
    assert.equal(editSource.includes('draft-state'), false, 'no draft-state element');
  });
});

// Issue 676 deleted RecipeContextRail. Its two content sections became real tabs and
// its Step-mode control moved to Overview; its validation summary + mini check list
// were dropped as duplicates of the Validation tab, which reads the same evaluator.
describe('RecipeBooksScrollsTab (issue 676: rehomed from the deleted context rail)', () => {
  it('renders the frozen recipe-item section marker', () => {
    assert.ok(
      booksTabSource.includes('data-recipe-section="recipe-item"'),
      'recipe-item section marker (FROZEN: the smoke harness waits on it)'
    );
    assert.ok(
      booksTabSource.includes('data-recipe-tab="books-scrolls"'),
      'carries the tab marker, like every other recipe tab'
    );
  });

  // The book rows must NOT borrow the gathering environment editor's vocabulary, which
  // is what the rail did. A book is not a scene, and borrowing a neighbour's classes is
  // how a surface silently inherits that neighbour's ramp (issue 676's amber tag pills).
  it('uses its own row vocabulary, not the gathering scene-widget classes', () => {
    assert.equal(
      booksTabSource.includes('manager-environment-scene-linked'),
      false,
      'no borrowed gathering scene-row class'
    );
    assert.equal(
      booksTabSource.includes('manager-environment-scene-thumb'),
      false,
      'no borrowed gathering scene-thumb class'
    );
    assert.ok(booksTabSource.includes('manager-recipe-book-link'), 'owns its row class');
    assert.ok(booksTabSource.includes('manager-recipe-book-thumb'), 'owns its thumb class');
  });

  it('carries NO book drop zone and NO "link another" — adding to a book lives on Books & Scrolls', () => {
    assert.equal(booksTabSource.includes('use:dragDrop'), false, 'no drop action');
    assert.equal(booksTabSource.includes('data-recipe-item-dropzone'), false, 'no drop zone');
    assert.equal(booksTabSource.includes('onAddRecipeItem'), false, 'no add-recipe-item path');
    assert.equal(booksTabSource.includes('RecipeItemLinkAnother'), false, 'no link-another affordance');
    // Removing THIS recipe from a book it already appears in is still allowed.
    assert.ok(booksTabSource.includes('onRemoveRecipeItem('), 'per-row removal retained');
    assert.ok(booksTabSource.includes('data-recipe-open-books'), 'deep-links to Books & Scrolls');
  });

  it('uses item iconography and the shared image constant', () => {
    assert.ok(booksTabSource.includes('fa-suitcase'), 'missing thumb uses a suitcase icon');
    assert.ok(
      booksTabSource.includes(
        "import { DEFAULT_RECIPE_IMAGE } from '../../../util/recipeImageIcons.js'"
      ),
      'image fallback uses the shared DEFAULT_RECIPE_IMAGE constant'
    );
    assert.equal(booksTabSource.includes("'icons/svg/item-bag.svg'"), false, 'no bag-SVG literal');
    assert.equal(booksTabSource.includes('fa-map'), false, 'no map icon');
  });

  it('uses the canonical recipeItemId, never the legacy linkedRecipeItemUuid', () => {
    assert.ok(booksTabSource.includes('recipeItemId'), 'references recipeItemId');
    assert.equal(
      booksTabSource.includes('linkedRecipeItemUuid'),
      false,
      'never references the legacy alias'
    );
  });

  it('does not delete the shared recipe-item definition on unlink', () => {
    assert.equal(
      booksTabSource.includes('deleteRecipeItemDefinition'),
      false,
      'unlink must not delete the shared definition'
    );
  });

  it('resolves each linked book in a cancelled-guarded $effect', () => {
    assert.ok(booksTabSource.includes('globalThis.fromUuid'), 'resolves via fromUuid');
    assert.ok(booksTabSource.includes('let cancelled = false'), 'effect carries a cancelled guard');
    assert.ok(booksTabSource.includes('cancelled = true'), 'cleanup flips the cancelled guard');
  });

  it('carries the linked-list a11y contract and the missing state', () => {
    assert.ok(booksTabSource.includes('data-recipe-item-links'), 'renders the linked-items list');
    assert.ok(booksTabSource.includes('aria-label='), 'the list has an aria-label');
    assert.ok(booksTabSource.includes('manager-icon-button is-danger'), 'visible danger unlink button');
    assert.ok(booksTabSource.includes('onOpenItem('), 'open wired');
    assert.ok(
      booksTabSource.includes('FABRICATE.Admin.Manager.Recipe.RecipeItemMissing'),
      'missing state copy'
    );
  });

  // Issue 796: the linked-book list tiles into the same responsive auto-fill grid the
  // Access tab adopted in issue 740, dropping the old `max-width: 520px` cap. The cascade
  // win over the shared flex rule and the tiled fill are verified live in the smoke frame;
  // this pins the rule SHAPE so a re-cap regresses at test time. The COMPOUND selector is
  // extracted deliberately — a bare `.manager-recipe-item-links` regex would match the
  // leftover `margin: 0` block first and assert against the wrong rule.
  it('tiles the linked-book list into an uncapped auto-fill grid (Access-tab parity)', () => {
    assertScopedRuleHasNoMaxWidth(
      booksTabSource,
      '.manager-recipe-books-tab .manager-recipe-item-links',
      { mustContain: ['display: grid', 'repeat(auto-fill'] }
    );
  });

  // The original bug capped BOTH the list and the empty state. Without this symmetric
  // guard a re-cap of only the empty panel would ship green.
  it('keeps the empty state a full-width uncapped panel', () => {
    assertScopedRuleHasNoMaxWidth(booksTabSource, '.manager-recipe-section-empty', {
      mustContain: ['width: 100%'],
    });
  });
});

describe('RecipeAccessTab (issue 676: rehomed from the deleted context rail)', () => {
  it('renders the frozen access section marker', () => {
    assert.ok(
      accessTabSource.includes('data-recipe-section="access"'),
      'access section marker (FROZEN: the smoke harness waits on it)'
    );
    assert.ok(accessTabSource.includes('data-recipe-tab="access"'), 'carries the tab marker');
  });

  it('never resolves access ids itself and never mutates the grant', () => {
    // The store resolves (over EVERY world actor, not the PC roster); the tab takes
    // resolved rows. Unresolvable ids are dropped from display, never persisted away.
    assert.ok(accessTabSource.includes('accessPlayers'), 'takes resolved players');
    assert.ok(accessTabSource.includes('accessCharacters'), 'takes resolved characters');
    assert.equal(accessTabSource.includes('characterIds'), false, 'the tab never touches grant ids');
    assert.equal(accessTabSource.includes('playerIds'), false, 'the tab never touches grant ids');
    assert.equal(accessTabSource.includes('saveRecipeAccess'), false, 'the tab is read-only');
    assert.ok(accessTabSource.includes('data-recipe-open-access'), 'deep-links to the Access screen');
  });

  it('treats the character->player relation as a SET, with the whole-table case distinct', () => {
    assert.ok(accessTabSource.includes('controlledBy'), 'reads the controller SET');
    assert.ok(
      accessTabSource.includes('sharedWithAllPlayers'),
      'ownership.default >= OWNER reaches the whole table'
    );
    assert.ok(
      accessTabSource.includes('AccessTab.SharedWithAllPlayers'),
      'the whole-table case has its OWN string, never "Played by <one name>"'
    );
    assert.equal(accessTabSource.includes('playedBy'), false, 'no lossy singular playedBy field');
  });
});

describe('RecipeEditorTabs gates Access / Books & Scrolls on craftingEffect (issue 676)', () => {
  it('is MODE-CONDITIONAL off craftingEffect, and offers neither tab under global', () => {
    assert.ok(tabsSource.includes('visibilityEffect?.showAccess'), 'restricted branch');
    assert.ok(tabsSource.includes('visibilityEffect?.showBooksScrolls'), 'item/knowledge branch');
    // The prop must NOT be called `effect`: the compiler then reads `$effect(...)` as
    // a store subscription (`$` + `effect`) and the component throws at mount.
    assert.equal(
      /^\s*effect = /m.test(tabsSource),
      false,
      'the craftingEffect prop is never named `effect` (it would shadow the $effect rune)'
    );
  });

  // The gate is on the tab BUTTON, not just the panel: a tab that opens an empty panel
  // is worse than no tab. RecipeEditView derives TAB_IDS from the SAME effect so a
  // deep-link cannot select a tab the strip does not render.
  it('derives the editor TAB_IDS from the same visibilityEffect the strip reads', () => {
    assert.ok(
      editSource.includes("visibilityEffect?.showAccess ? ['access'] : []"),
      'TAB_IDS gates access on the same effect'
    );
    assert.ok(
      editSource.includes("visibilityEffect?.showBooksScrolls ? ['books-scrolls'] : []"),
      'TAB_IDS gates books-scrolls on the same effect'
    );
    assert.ok(
      editSource.includes("if (!TAB_IDS.includes(activeTab)) activeTab = 'overview'"),
      'a mode change that retires the active tab falls back to Overview'
    );
  });
});

describe('Step mode lives on the Overview tab (issue 676: rehomed from the deleted rail)', () => {
  it('renders Step mode as a real SegmentedControl beside the steps it governs', () => {
    assert.ok(overviewSource.includes("import SegmentedControl from '../SegmentedControl.svelte'"));
    assert.ok(overviewSource.includes('optionDataAttr="data-recipe-step-mode-option"'));
    assert.ok(
      overviewSource.includes('data-recipe-section="recipe-step-mode"'),
      'carries the step-mode section marker'
    );
    // The rail was the ONLY consumer of these two handlers; without the rehome,
    // multi-step recipes would be unreachable for every system with the feature on.
    assert.ok(overviewSource.includes('onEnterMultiStep'), 'wires the enter-multi-step handler');
    assert.ok(overviewSource.includes('onRevertToSingleStep'), 'wires the revert handler');
    assert.ok(overviewSource.includes('multiStepEnabled'), 'gated on the system feature');
  });

  // Recipe complexity is emergent from the ingredient-set count (issue 643): no editor
  // surface carries a Simple/Complex control.
  it('carries NO Recipe mode toggle', () => {
    assert.equal(overviewSource.includes('data-recipe-mode-option'), false, 'no Recipe mode segmented control');
    assert.equal(overviewSource.includes('data-recipe-section="recipe-mode"'), false, 'no Recipe mode section');
    assert.equal(overviewSource.includes('onSetComplexity'), false, 'no complexity setter');
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
    assert.equal(overviewSource.includes('hideComplexToggle'), false, 'Overview declares no hideComplexToggle prop');
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

  it('renders NO context rail on recipe-edit — the tabs take the released column (issue 676)', () => {
    assert.equal(rootSource.includes('RecipeContextRail'), false, 'the rail component is gone entirely');
    assert.equal(rootSource.includes('recipeInspectorVisible'), false, 'no conditional-hide gate remains');
    assert.ok(
      rootSource.includes('recipeVisibilityEffect = $derived(craftingEffect('),
      'the conditional tabs are driven by the canonical craftingEffect matrix'
    );
    assert.ok(
      rootSource.includes('store.resolveRecipeAccess?.('),
      'access ids are resolved in the STORE, never in the tab'
    );
    // The aside's suppression list no longer names recipe-edit at all.
    const asideGuard = rootSource.slice(
      rootSource.indexOf("{#if currentView !== 'environment-edit' && currentView !== 'checks'"),
      rootSource.indexOf('<aside class="manager-inspector"')
    );
    // Issue 676: the aside IS suppressed on recipe-edit now. This guard and the
    // two-column override list in styles/fabricate.css are ONE decision expressed twice
    // — suppress without releasing and a 300px empty box holds the strip open; release
    // without suppressing and the empty aside wraps to a row under the editor.
    assert.ok(
      asideGuard.includes("currentView !== 'recipe-edit'"),
      'the aside is suppressed on recipe-edit, matching the released grid column'
    );
    assert.ok(
      /\[data-manager-view="recipe-edit"\] \.manager-body/.test(css),
      'recipe-edit is in the two-column override list, releasing the rail column to the tabs'
    );
  });

  it('passes the read-only recipe-item summary props to RecipeEditView, but no authoring path', () => {
    const start = rootSource.indexOf('<RecipeEditView');
    const end = rootSource.indexOf('/>', start);
    const block = rootSource.slice(start, end);
    assert.equal(block.includes('knowledgeMode'), false, 'no knowledgeMode prop on the view');
    assert.equal(block.includes('onAddRecipeItem'), false, 'no add-recipe-item prop on the view');
    assert.equal(block.includes('onSetRecipeItem'), false, 'no set-recipe-item prop on the view');
    // The Books & Scrolls tab (issue 676) needs the library + the unlink; the rail took
    // exactly these before it was deleted.
    assert.ok(block.includes('{recipeItemDefinitions}'), 'the definition library reaches the books tab');
    assert.ok(block.includes('onRemoveRecipeItem={handleRemoveRecipeItem}'), 'the per-row unlink is wired');
    assert.ok(block.includes('visibilityEffect={recipeVisibilityEffect}'), 'the tab gate is wired');
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

  // Issue 676: the recipe's book rows no longer borrow this gathering class — a book is
  // not a scene. The class remains the environment editor's own.
  it('is not borrowed by the recipe Books & Scrolls tab', () => {
    assert.equal(
      booksTabSource.includes('manager-environment-scene-name'),
      false,
      'the books tab owns its row vocabulary rather than borrowing the gathering scene widget'
    );
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

  it('drops the recipe-item locked-image strings (the image is always editable now)', () => {
    for (const absent of ['RecipeItemLockedImage', 'RecipeItemLockedImageTooltip']) {
      assert.equal(absent in recipeLang, false, `${absent} must be removed`);
    }
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
      booksTabSource.includes("import { DEFAULT_RECIPE_IMAGE } from '../../../util/recipeImageIcons.js'"),
      'RecipeBooksScrollsTab imports the constant'
    );
    assert.equal(booksTabSource.includes("const DEFAULT_RECIPE_IMAGE = 'icons/svg/item-bag.svg'"), false, 'no local bag-SVG literal in the books tab');
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

describe('RecipeEditView keeps the recipe image always editable', () => {
  // A recipe can belong to many books & scrolls (recipeIds[] is many-to-many), so the
  // image no longer mirrors or locks to a single linked recipe item (issue 643).
  it('drops the linked-state derivation and the linkedItemImage prop', () => {
    assert.equal(editSource.includes('isRecipeItemLinked'), false, 'no linked-state derivation');
    assert.equal(editSource.includes('linkedItemImage'), false, 'no linkedItemImage prop');
  });

  it('renders only the editable image picker button — no locked span, lock icon, or marker', () => {
    assert.equal(overviewSource.includes('{#if isRecipeItemLinked}'), false, 'no linked-state branch');
    assert.equal(overviewSource.includes('is-recipe-item-linked'), false, 'no recipe-item locked class');
    assert.equal(overviewSource.includes('data-recipe-item-locked-image'), false, 'no locked-image marker');
    assert.ok(overviewSource.includes('data-recipe-field="img"'), 'keeps the editable image picker button');
    assert.ok(overviewSource.includes('onclick={onChooseImage}'), 'the picker button is clickable');
  });

  it('guards chooseImage only on the pick handler, never on a linked state', () => {
    assert.ok(
      editSource.includes("if (typeof onPickImagePath !== 'function') return;"),
      'chooseImage early-returns only when there is no pick handler'
    );
    assert.equal(
      editSource.includes('isRecipeItemLinked) return'),
      false,
      'chooseImage no longer early-returns on a linked recipe item'
    );
  });

  it('does not thread a linked recipe-item image through the root', () => {
    assert.equal(rootSource.includes('linkedItemImage'), false, 'root passes no linkedItemImage prop');
    assert.equal(rootSource.includes('recipeDraftLinkedItemImage'), false, 'root derives no locked image');
  });

  it('resolves the editor header + picker image through the shared bag→blueprint resolver', () => {
    assert.ok(
      rootSource.includes("import { resolveRecipeImage } from '../../util/craftingImageDefaults.js'"),
      'root imports the shared resolver for the header medallion'
    );
    assert.ok(
      rootSource.includes('src={resolveRecipeImage(recipeDraft)}'),
      'the header medallion resolves the generic bag to the blueprint default'
    );
    assert.ok(
      overviewSource.includes('resolveRecipeImage({ img: value })'),
      'the overview picker resolves the generic bag to the blueprint default'
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

describe('recipe image picker no longer reuses the scene-locked visuals', () => {
  it('drops the is-recipe-item-linked locked-picker rules (the recipe image is always editable)', () => {
    assert.equal(
      css.includes('is-recipe-item-linked'),
      false,
      'the recipe-item locked-picker class is removed from the stylesheet'
    );
  });
});
