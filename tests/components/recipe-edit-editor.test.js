/**
 * The recipe editor's structure contract (issue 1697 retired this file's source-text pins). Every
 * claim about a `src/` file is a row of the shared table; the `lang/en.json` catalogue and the
 * shipped global stylesheet are not `src/` text and keep their reads.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, it } from 'node:test';

import { ROUTE_EXIT_GUARDS } from '../../src/ui/svelte/apps/manager/routeExitGuards.js';
import { calledName, identifierNames } from '../helpers/moduleAst.js';
import { componentAstOf } from '../helpers/parsedSource.js';
import {
  attributeExpression,
  attributeValue,
  rendersElement,
} from '../helpers/svelteStructureContract.js';
import { defineStructureContract, renderedNodes } from '../helpers/structureContract.js';
import { repoRoot } from '../helpers/sourceScan.js';

const MANAGER = 'src/ui/svelte/apps/manager';
const EDIT = `${MANAGER}/RecipeEditView.svelte`;
const OVERVIEW = `${MANAGER}/recipe/RecipeOverviewTab.svelte`;
// Issue 676 deleted RecipeContextRail; these two are its content sections, rehomed as real tabs.
const ACCESS_TAB = `${MANAGER}/recipe/RecipeAccessTab.svelte`;
const BOOKS_TAB = `${MANAGER}/recipe/RecipeBooksScrollsTab.svelte`;
const TABS = `${MANAGER}/recipe/RecipeEditorTabs.svelte`;
const ROOT = `${MANAGER}/CraftingSystemManagerRoot.svelte`;
const BROWSER = `${MANAGER}/RecipesBrowserView.svelte`;
const BROWSER_INSPECTOR = `${MANAGER}/recipes/RecipeBrowserInspector.svelte`;
// The Access SURFACE (the Crafting nav's grant list + its inspector).
const ACCESS_SURFACE = `${MANAGER}/AccessTabView.svelte`;
const GRANT_ACCESS_INSPECTOR = `${MANAGER}/GrantAccessInspector.svelte`;
const STORE = 'src/ui/svelte/stores/adminStore.js';
// The GM browser row and inspector projection left `adminStore.js` for pure modules in issue 1090,
// so a claim about a projected field is asked of the projection rather than of the store.
const ROW_PROJECTION = 'src/ui/svelte/stores/adminRecipeRowProjection.js';
const SYSTEM_PROJECTION = 'src/ui/svelte/stores/adminSystemInspectorProjection.js';
const MODEL = 'src/models/Recipe.js';
const RECIPE_MANAGER = 'src/systems/RecipeManager.js';
const GRAPH = 'src/ui/svelte/util/recipeGraphBuilder.js';
const ICONS = 'src/ui/svelte/util/recipeImageIcons.js';
const BANNER = `${MANAGER}/recipe/RecipeModeBanner.svelte`;
const ROUTING_ASSIGNMENT = `${MANAGER}/recipe/RecipeRoutingAssignment.svelte`;
const RESULT_GROUP_CARD = `${MANAGER}/recipe/RecipeResultGroupCard.svelte`;

const lang = JSON.parse(readFileSync(resolve(repoRoot, 'lang/en.json'), 'utf8'));
const css = readFileSync(resolve(repoRoot, 'styles/fabricate.css'), 'utf8');

const recipeLang = lang.FABRICATE.Admin.Manager.Recipe;
const BLUEPRINT_DEFAULT = 'icons/sundries/documents/blueprint-recipe-alchemical.webp';

/**
 * The global sheet's leg of the issue-796 cap. A component's own `<style>` is asked through the
 * `styleDeclares` claim instead; this reads `styles/fabricate.css`, which is not `src/` text.
 */
function assertGlobalRuleHasNoMaxWidth(selector, { mustContain = [] } = {}) {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const rule = css.match(new RegExp(`${escaped}\\s*\\{[^}]*\\}`));
  assert.ok(rule, `scoped rule for "${selector}" exists`);
  for (const fragment of mustContain) {
    assert.ok(rule[0].includes(fragment), `"${selector}" declares ${fragment}`);
  }
  assert.equal(/max-width/.test(rule[0]), false, `"${selector}" no longer carries the cap`);
}

/** The identifier one rendered component gives a prop, so a wiring claim names the handler. */
function propIdentifier(file, component, prop) {
  const [node] = renderedNodes(componentAstOf(file), component);
  assert.ok(node, `${file} still renders <${component}>`);
  return attributeExpression(node, prop)?.name;
}

describe('RecipeEditView identity-only single column', () => {
  defineStructureContract(
    'renders the identity card in the standard manager-main, with no bespoke workspace',
    EDIT,
    {
      // The editor is fully controlled now: no <form> wrapper.
      spellsNo: [
        'manager-recipe-edit-form',
        'manager-recipe-workspace',
        'manager-recipe-edit-panel',
        'manager-recipe-inspector',
        'is-inspector-hidden',
      ],
      spells: ['manager-recipe-edit-main'],
    }
  );

  it('the controlled editor renders no form element', () => {
    assert.equal(rendersElement(componentAstOf(EDIT), 'form'), false);
  });

  defineStructureContract(
    'rebuilds the Overview tab to the prototype (micro-labels, select row, status cards, inline duration)',
    OVERVIEW,
    {
      // The card-stack chrome is gone: micro-labels over unwrapped fields (issue 643).
      spellsNo: ['manager-task-core-card'],
      spells: ['manager-recipe-micro-label', 'manager-task-image-picker'],
      renders: ['ToggleCard', 'RecipeDurationSteppers'],
      writes: ['data-recipe-category-select'],
      // The issue-658 retrofit is a byte-faithful DOM no-op, so the section/field markers moved
      // from inlined attributes onto props.
      attributes: [
        ['variant', 'is-enabled'],
        ['variant', 'is-locked'],
        ['section', 'enabled-status'],
        ['section', 'locked-status'],
        ['field', 'enabled'],
        ['field', 'locked'],
        ['data-recipe-field', 'name'],
        ['data-recipe-field', 'description'],
        ['data-recipe-field', 'img'],
      ],
    }
  );

  defineStructureContract('keeps the empty select-a-recipe state', EDIT, {
    spells: ['FABRICATE.Admin.Manager.Recipe.SelectRecipe'],
  });

  defineStructureContract(
    'is fully controlled: identity edits stage via onUpdateRecipe and enabled via onToggleEnabled',
    EDIT,
    {
      // No local identity state / dirty / save machinery survives in the view.
      namesNo: ['onDirtyChange', 'onDraftChange', 'onSave', 'buildDraftSummary'],
      writesNo: ['onDirtyChange', 'onDraftChange', 'onSave'],
      names: ['onUpdateRecipe', 'onToggleEnabled'],
      keys: ['name', 'description', 'img'],
      callsWith: [['onUpdateRecipe', 'value']],
      passesProps: [['RecipeEditorTabs', 'activeTab']],
    }
  );

  defineStructureContract(
    'carries no recipe-item AUTHORING state, props, or drop zone in the view',
    EDIT,
    {
      namesNo: ['knowledgeMode', 'onAddRecipeItem', 'onSetRecipeItem', 'dragDrop', 'resolveDropData'],
      spellsNo: ['manager-environment-scene-dropzone', 'manager-environment-scene-linked'],
      // The read-only summary props are expected, and are forwarded to the tab.
      names: ['recipeItemDefinitions', 'onRemoveRecipeItem'],
    }
  );

  defineStructureContract('does not render a draft-state card', EDIT, {
    spellsNo: ['DraftState', 'draft-state'],
  });
});

describe('RecipeBooksScrollsTab (issue 676: rehomed from the deleted context rail)', () => {
  defineStructureContract('renders the frozen recipe-item section marker', BOOKS_TAB, {
    attributes: [
      ['data-recipe-section', 'recipe-item'],
      ['data-recipe-tab', 'books-scrolls'],
    ],
  });

  defineStructureContract(
    'uses its own row vocabulary, not the gathering scene-widget classes',
    BOOKS_TAB,
    {
      spellsNo: [
        'manager-environment-scene-linked',
        'manager-environment-scene-thumb',
        'manager-environment-scene-name',
      ],
      spells: ['manager-recipe-book-link', 'manager-recipe-book-thumb'],
    }
  );

  defineStructureContract(
    'carries NO book drop zone and NO "link another" — adding to a book lives on Books & Scrolls',
    BOOKS_TAB,
    {
      namesNo: ['dragDrop', 'onAddRecipeItem', 'deleteRecipeItemDefinition', 'linkedRecipeItemUuid'],
      writesNo: ['data-recipe-item-dropzone'],
      spellsNo: ['RecipeItemLinkAnother'],
      // Removing this recipe from a book it already appears in is still allowed.
      names: ['onRemoveRecipeItem', 'recipeItemId'],
      writes: ['data-recipe-open-books'],
    }
  );

  defineStructureContract('uses item iconography and the shared image constant', BOOKS_TAB, {
    spells: ['fa-suitcase'],
    imports: ['../../../util/recipeImageIcons.js'],
    names: ['DEFAULT_RECIPE_IMAGE'],
    spellsExactlyNo: ['icons/svg/item-bag.svg'],
    spellsNo: ['fa-map'],
  });

  defineStructureContract('resolves each linked book in a cancelled-guarded $effect', BOOKS_TAB, {
    reads: ['globalThis.fromUuid'],
    names: ['cancelled'],
    assigns: [['cancelled', true]],
  });

  defineStructureContract('carries the linked-list a11y contract and the missing state', BOOKS_TAB, {
    writes: ['data-recipe-item-links', 'aria-label'],
    renders: ['IconButton'],
    passesValues: [['IconButton', 'class', 'is-danger']],
    names: ['onOpenItem'],
    spells: ['FABRICATE.Admin.Manager.Recipe.RecipeItemMissing'],
  });

  // Issue 796: the linked-book list tiles into a fixed three-column grid (widened from the earlier
  // auto-fill 220px tracks, which truncated long titles), dropping the old `max-width: 520px` cap.
  // The compound chain keeps the claim pinned to the grid rule; the file also carries a bare
  // `.manager-recipe-item-links { margin }` rule a bare-class claim could latch onto.
  defineStructureContract(
    'tiles the linked-book list into an uncapped three-column grid (Access-tab parity)',
    BOOKS_TAB,
    {
      styleDeclares: [
        [['manager-recipe-books-tab', 'manager-recipe-item-links'], 'display', 'grid'],
        [
          ['manager-recipe-books-tab', 'manager-recipe-item-links'],
          'grid-template-columns',
          'repeat(3, minmax(0, 1fr))',
        ],
      ],
      styleDeclaresNo: [[['manager-recipe-books-tab', 'manager-recipe-item-links'], 'max-width']],
    }
  );

  defineStructureContract('and hands the empty panel its container class', BOOKS_TAB, {
    passesValues: [['EmptyState', 'contextClass', 'manager-recipe-tab-empty']],
  });

  // The original bug capped both the list and the empty state. Without this symmetric guard a
  // re-cap of only the empty panel would ship green.
  it('keeps the empty state a full-width uncapped panel', () => {
    assertGlobalRuleHasNoMaxWidth('.fabricate-manager .manager-recipe-tab-empty', {
      mustContain: ['width: 100%'],
    });
  });
});

describe('RecipeAccessTab (issue 676: rehomed from the deleted context rail)', () => {
  defineStructureContract('renders the frozen access section marker', ACCESS_TAB, {
    attributes: [
      ['data-recipe-section', 'access'],
      ['data-recipe-tab', 'access'],
    ],
  });

  defineStructureContract('never resolves access ids itself and never mutates the grant', ACCESS_TAB, {
    names: ['accessPlayers', 'accessCharacters'],
    namesNo: ['characterIds', 'playerIds', 'saveRecipeAccess'],
    writes: ['data-recipe-open-access'],
  });

  defineStructureContract(
    'treats the character->player relation as a SET, with the whole-table case distinct',
    ACCESS_TAB,
    {
      names: ['controlledBy', 'sharedWithAllPlayers'],
      namesNo: ['playedBy'],
      spells: ['AccessTab.SharedWithAllPlayers'],
    }
  );

  // Issue 796: the access list widened from auto-fill 220px tracks to a fixed three-column grid,
  // in visual parity with the Books & Scrolls grid.
  defineStructureContract(
    'tiles the access list into a three-column grid (Books & Scrolls parity)',
    ACCESS_TAB,
    {
      styleDeclares: [
        [['manager-recipe-access-list'], 'display', 'grid'],
        [['manager-recipe-access-list'], 'grid-template-columns', 'repeat(3, minmax(0, 1fr))'],
      ],
      styleDeclaresNo: [[['manager-recipe-access-list'], 'max-width']],
    }
  );
});

describe('RecipeEditorTabs gates Access / Books & Scrolls on craftingEffect (issue 676)', () => {
  defineStructureContract(
    'is MODE-CONDITIONAL off craftingEffect, and offers neither tab under global',
    TABS,
    {
      reads: ['visibilityEffect.showAccess', 'visibilityEffect.showBooksScrolls'],
      // The prop must not be called `effect` — it would shadow the $effect rune.
      declaresProp: ['visibilityEffect'],
    }
  );

  it('and the craftingEffect prop is never named `effect`', () => {
    const subject = componentAstOf(TABS);
    const declared = [];
    for (const node of [subject.instance?.content, subject.module?.content]) {
      for (const name of identifierNames(node ?? {})) declared.push(name);
    }
    assert.equal(declared.includes('effect'), false, 'a prop named `effect` would shadow the rune');
  });

  // The gate is on the tab BUTTON, not just the panel.
  defineStructureContract(
    'derives the editor TAB_IDS from the same visibilityEffect the strip reads',
    { file: EDIT, constant: 'TAB_IDS' },
    {
      reads: ['visibilityEffect.showAccess', 'visibilityEffect.showBooksScrolls'],
      spellsExactly: ['access', 'books-scrolls', 'overview'],
    }
  );

  defineStructureContract(
    'and a mode change that retires the active tab falls back to Overview',
    EDIT,
    { reads: ['TAB_IDS.includes'], assigns: [['activeTab', 'overview']] }
  );
});

describe('Step mode lives on the Overview tab (issue 676: rehomed from the deleted rail)', () => {
  defineStructureContract(
    'renders Step mode as a real SegmentedControl beside the steps it governs',
    OVERVIEW,
    {
      imports: ['../../../components/SegmentedControl.svelte'],
      renders: ['SegmentedControl'],
      attributes: [
        ['optionDataAttr', 'data-recipe-step-mode-option'],
        ['data-recipe-section', 'recipe-step-mode'],
      ],
      // The rail was the only consumer of these two handlers.
      names: ['onEnterMultiStep', 'onRevertToSingleStep', 'multiStepEnabled'],
    }
  );

  // Recipe complexity is emergent from the ingredient-set count (issue 643).
  defineStructureContract('carries NO Recipe mode toggle', OVERVIEW, {
    writesNo: ['data-recipe-mode-option'],
    attributesNo: [['data-recipe-section', 'recipe-mode']],
    namesNo: ['onSetComplexity'],
  });
});

describe('RecipeModeBanner (issue 643 §5)', () => {
  // Retargeted for issue 1055: the banner is now FULLY PROP-DRIVEN.
  defineStructureContract(
    'reuses the canonical resolution-mode option list rather than re-authoring one',
    EDIT,
    { imports: ['./resolutionModeOptions.js'], names: ['resolutionModeOptions'] }
  );

  defineStructureContract('and the banner itself authors no copy at all now', BANNER, {
    namesNo: ['resolutionModeOptions', 'MODE_INFO', 'onChange'],
    spellsNo: ['ModeBanner.'],
  });

  defineStructureContract(
    'states that the mode is SYSTEM-level and routes to Crafting Settings',
    BANNER,
    {
      defaults: [['actionDataAttr', 'data-recipe-mode-banner-settings']],
      names: ['actionHint'],
      declaresProp: ['actionHint'],
    }
  );

  defineStructureContract(
    'and the resolution-mode call site still says the mode is system-wide',
    EDIT,
    { spells: ['ModeBanner.SettingsHint'] }
  );

  // Two banners can stack on the Overview tab (issue 1055). `dataAttr` carries the reported value,
  // so a shared hook would resolve to whichever rendered first.
  defineStructureContract(
    'takes its capture hook as a prop so two banners on one tab cannot collide',
    BANNER,
    {
      declaresProp: ['dataAttr', 'actionDataAttr'],
      defaults: [['dataAttr', 'data-recipe-mode-banner']],
      spellsNo: [
        'data-recipe-modifier-inert',
        'data-recipe-modifier-inert-checks',
      ],
    }
  );

  defineStructureContract('and the Overview tab passes its own hooks', OVERVIEW, {
    spells: ['data-recipe-modifier-inert', 'data-recipe-modifier-inert-checks'],
    // The rejected design's neutral "the system decides" banner is gone.
    spellsNo: ['data-recipe-modifier-banner-checks', 'data-recipe-modifier-banner'],
  });

  // Visual differentiation was promised by the design and is delivered as colour only.
  defineStructureContract(
    'differentiates a second banner by tone without moving its geometry',
    BANNER,
    {
      defaults: [['tone', 'info']],
      styleDeclares: [
        [[['manager-recipe-mode-banner', 'is-neutral']], 'border-color', 'var(--fab-border)'],
        [[['manager-recipe-mode-banner', 'is-neutral']], 'background', 'var(--fab-surface-soft)'],
        [[['manager-recipe-mode-banner', 'is-warning']], 'border-color', 'var(--fab-warning-border)'],
      ],
      styleDeclaresNo: [
        [[['manager-recipe-mode-banner', 'is-neutral']], 'padding'],
        [[['manager-recipe-mode-banner', 'is-neutral']], 'width'],
        [[['manager-recipe-mode-banner', 'is-neutral']], 'height'],
        [[['manager-recipe-mode-banner', 'is-neutral']], 'gap'],
        [[['manager-recipe-mode-banner', 'is-neutral']], 'font-size'],
      ],
    }
  );

  defineStructureContract(
    'is rendered by the editor shell below the tab strip so the tabs stay attached (§4.2)',
    EDIT,
    { renders: ['RecipeModeBanner'], rendersBefore: [['RecipeEditorTabs', 'RecipeModeBanner']] }
  );

  defineStructureContract('reads as an INFO banner with an icon medallion, not one more card', BANNER, {
    attributes: [['class', 'manager-recipe-mode-banner-medallion']],
    styleDeclares: [
      [['manager-recipe-mode-banner'], 'background', 'var(--fab-info-soft)'],
      [['manager-recipe-mode-banner'], 'border', '1px solid var(--fab-info-border)'],
    ],
  });

  defineStructureContract(
    'lets the description WRAP — it is the one sentence the banner exists to deliver',
    BANNER,
    {
      // It was `white-space: nowrap` + ellipsis.
      styleDeclares: [
        [['manager-recipe-mode-banner-desc'], '-webkit-line-clamp', '2'],
        [['manager-recipe-mode-banner-desc'], 'line-height', '1.45'],
        [['manager-recipe-mode-banner-desc'], 'white-space', 'normal'],
      ],
    }
  );
});

describe('the progressive reorder announcement', () => {
  // The statement order inside `moveItem` — the name read before the array moves — is proved by
  // the clicked mounted case in `recipe-edit-mounted.test.js`, which round-trips the patch the way
  // the root does and reads the announced sentence. What stays here is the sentence's shape.
  defineStructureContract(
    'announces through ONE localized key with placeholders, not a concatenation',
    { file: RESULT_GROUP_CARD, fn: 'moveItem' },
    {
      calls: ['componentNameFor', 'reorderItem', 'format'],
      spellsExactly: ['FABRICATE.Admin.Manager.Recipe.ResultMoveAnnouncement'],
      keys: ['name', 'position', 'total'],
    }
  );

  defineStructureContract('and the fragments it replaced are gone', RESULT_GROUP_CARD, {
    spellsNo: ['MovedToPosition', 'OfCount'],
  });

  it('the key takes the three placeholders the component supplies', () => {
    const announcement = recipeLang.ResultMoveAnnouncement;
    for (const token of ['{name}', '{position}', '{total}']) {
      assert.ok(announcement.includes(token), `the key takes ${token}`);
    }
  });
});

describe('adminStore recipe-item projections + API', () => {
  defineStructureContract('exports updateRecipe and addRecipeItemFromUuid', STORE, {
    keys: ['updateRecipe', 'addRecipeItemFromUuid', 'confirmRecipeAction'],
  });

  defineStructureContract('and defines each of them', { file: STORE, fn: 'updateRecipe' }, {
    names: ['recipeId', 'updates'],
    calls: ['getRecipeManager'],
  });

  defineStructureContract('the uuid adder too', { file: STORE, fn: 'addRecipeItemFromUuid' }, {
    names: ['itemUuid'],
    calls: ['getCraftingSystemManager'],
  });

  defineStructureContract(
    'projects recipeItemId on recipe rows',
    { file: ROW_PROJECTION },
    { keys: ['recipeItemId', 'recipeItemIds', 'recipeItemName', 'recipeItemSourceUuid'] }
  );

  defineStructureContract(
    'and recipeItemDefinitions on the selected system',
    { file: SYSTEM_PROJECTION },
    {
      keys: ['recipeItemDefinitions'],
      reads: ['selectedSystem.recipeItemDefinitions', 'Array.isArray'],
    }
  );

  // The legacy uuid alias is never a field the store or the projections read or emit. The row's
  // book membership resolves through the shared `utils/recipeItemMembership.js`, whose legacy leg
  // reads that alias, and the projection names it in the comment explaining why — so the claim is
  // about a key and a member read, which a comment cannot satisfy.
  defineStructureContract(
    'and never projects the legacy linkedRecipeItemUuid alias',
    [STORE, ROW_PROJECTION, SYSTEM_PROJECTION],
    { keysNo: ['linkedRecipeItemUuid'], namesNo: ['linkedRecipeItemUuid'] }
  );
});

describe('CraftingSystemManagerRoot recipe-edit machinery', () => {
  defineStructureContract('owns the root-held recipe draft and its staging handlers', ROOT, {
    names: [
      'saveRecipeDraft',
      'backToRecipesBrowse',
      'deleteRecipeFromEdit',
      'patchRecipeDraft',
      'handleRemoveRecipeItem',
      'handleToggleRecipeEnabled',
      'recipeDraft',
      'recipeDraftBaseline',
      'canSaveRecipeEdit',
    ],
    // Adding a recipe to a book is authored on Books & Scrolls (issue 643 §2c).
    namesNo: ['handleAddRecipeItem', 'handleSetRecipeItem', 'recipeKnowledgeMode'],
    readsNo: [
      'store.deleteRecipeStep',
      'store.setRecipeComplexity',
      'store.revertRecipeToSingleStep',
    ],
  });

  defineStructureContract(
    'and the dirty flag derives from a JSON diff of the draft against its baseline',
    { file: ROOT, constant: 'recipeEditDirty' },
    { reads: ['JSON.stringify'], names: ['recipeDraft', 'recipeDraftBaseline'] }
  );

  defineStructureContract(
    'stages destructive in-draft actions through the confirm-only store helper',
    ROOT,
    { reads: ['store.confirmRecipeAction'] }
  );

  defineStructureContract('which the store defines and exports', STORE, {
    keys: ['confirmRecipeAction', 'confirmDiscardDirtyRecipeDraft'],
    spells: ['FABRICATE.Admin.Manager.Recipe.DiscardDirtyContent'],
  });

  defineStructureContract(
    'never seeds an alchemy routing provider on Complex (the per-recipe provider is retired)',
    ROOT,
    { namesNo: ['chooseSeedProvider', 'hideComplexToggle'] }
  );

  defineStructureContract('nor does the Overview tab declare one', OVERVIEW, {
    namesNo: ['hideComplexToggle'],
  });

  defineStructureContract(
    'and alchemy is excluded from the add-ingredient-set affordance',
    { file: ROOT, constant: 'recipeCanAddSet' },
    { names: ['recipeMultiSetAllowed'], reads: ['selectedSystem.resolutionMode'], compares: ['alchemy'] }
  );

  it('sources the destructive recipe confirm titles + content from lang keys', () => {
    assert.equal(recipeLang.RevertToSingleStepTitle, 'Switch to single-step?');
    assert.ok(
      recipeLang.RevertToSingleStepContent.includes('<strong>{name}</strong>'),
      'revert content keeps the bold name placeholder'
    );
    // The Simple/Complex toggle (and its Switch-to-simple confirm) is gone (issue 643).
    assert.equal(recipeLang.SwitchToSimpleTitle, undefined, 'the retired title key is removed');
    assert.equal(recipeLang.SwitchToSimpleContent, undefined, 'and its content key');
    assert.equal(recipeLang.DeleteStepTitle, 'Delete step?');
    assert.ok(
      recipeLang.DeleteStepContent.includes('<strong>{name}</strong>'),
      'delete-step content keeps the bold name placeholder'
    );
    assert.ok(
      recipeLang.DeleteStepContent.includes('{alsoDeleted}'),
      'delete-step content keeps the alsoDeleted placeholder'
    );
    for (const key of [
      'DeleteStepAlsoIngredients',
      'DeleteStepAlsoResults',
      'DeleteStepAlsoTools',
      'DeleteStepAlsoAll',
    ]) {
      assert.equal(typeof recipeLang[key], 'string', `${key} fragment defined`);
    }
    assert.equal(recipeLang.UnnamedStep, 'this step');
  });

  defineStructureContract(
    'and the handlers localize those keys rather than embedding hardcoded English',
    ROOT,
    {
      callsLiteral: [
        ['localize', 'FABRICATE.Admin.Manager.Recipe.RevertToSingleStepTitle'],
        ['localize', 'FABRICATE.Admin.Manager.Recipe.RevertToSingleStepContent'],
        ['localize', 'FABRICATE.Admin.Manager.Recipe.DeleteStepTitle'],
        ['localize', 'FABRICATE.Admin.Manager.Recipe.DeleteStepContent'],
      ],
      spellsNo: ['SwitchToSimple'],
      spellsExactlyNo: ['Switch to single-step?', 'Switch to simple?', 'Delete step?'],
    }
  );

  defineStructureContract(
    'wires the recipe-edit header chip + Back/Delete/Save and the controlled view props',
    ROOT,
    {
      names: ['saveRecipeDraft', 'backToRecipesBrowse', 'deleteRecipeFromEdit'],
      spells: [
        'FABRICATE.Admin.Manager.Recipe.Dirty',
        'FABRICATE.Admin.Manager.Recipe.BackToBrowse',
        'FABRICATE.Admin.Manager.Recipe.Delete',
      ],
      attributesNo: [['form', 'manager-recipe-edit-form']],
      namesNo: ['cancelRecipeEdit'],
      passesProps: [
        ['RecipeEditView', 'recipe'],
        ['RecipeEditView', 'onUpdateRecipe'],
        ['RecipeEditView', 'onToggleEnabled'],
        ['RecipeEditView', 'onPickImagePath'],
        ['RecipeEditView', 'recipeItemDefinitions'],
        ['RecipeEditView', 'onRemoveRecipeItem'],
        ['RecipeEditView', 'visibilityEffect'],
      ],
      // Scoped to the RecipeEditView mount: the essence/component editors still use these.
      passesPropsNo: [
        ['RecipeEditView', 'onSave'],
        ['RecipeEditView', 'onDraftChange'],
        ['RecipeEditView', 'onDirtyChange'],
        ['RecipeEditView', 'knowledgeMode'],
        ['RecipeEditView', 'onAddRecipeItem'],
        ['RecipeEditView', 'onSetRecipeItem'],
        ['RecipeEditView', 'linkedItemImage'],
      ],
    }
  );

  it('and the controlled view takes the root-held draft and the named staging handlers', () => {
    assert.equal(propIdentifier(ROOT, 'RecipeEditView', 'recipe'), 'recipeDraft');
    assert.equal(
      propIdentifier(ROOT, 'RecipeEditView', 'onToggleEnabled'),
      'handleToggleRecipeEnabled'
    );
    assert.equal(
      propIdentifier(ROOT, 'RecipeEditView', 'onRemoveRecipeItem'),
      'handleRemoveRecipeItem'
    );
    assert.equal(
      propIdentifier(ROOT, 'RecipeEditView', 'visibilityEffect'),
      'recipeVisibilityEffect'
    );
  });

  it('renders Delete as a ManagerButton carrying the danger destructive role', () => {
    const [deleteButton] = renderedNodes(componentAstOf(ROOT), 'ManagerButton').filter(
      (node) => attributeExpression(node, 'onclick')?.name === 'deleteRecipeFromEdit'
    );
    assert.ok(deleteButton, 'the recipe-edit header renders Delete as a ManagerButton');
    assert.equal(attributeValue(deleteButton, 'role'), 'danger');
  });

  defineStructureContract(
    'renders NO context rail on recipe-edit — the tabs take the released column (issue 676)',
    ROOT,
    {
      rendersNo: ['RecipeContextRail'],
      namesNo: ['recipeInspectorVisible'],
      calls: ['craftingEffect'],
      reads: ['store.resolveRecipeAccess'],
    }
  );

  defineStructureContract(
    'and the conditional tabs are driven by the canonical craftingEffect matrix',
    { file: ROOT, constant: 'recipeVisibilityEffect' },
    { calls: ['craftingEffect'] }
  );

  it('wires the recipe row into the route-exit chain via the services discard seam', () => {
    const guard = ROUTE_EXIT_GUARDS.find((row) => row.view === 'recipe-edit');
    assert.ok(Boolean(guard), 'the cascade carries a recipe-edit route-exit guard');
    assert.equal(guard.skip, 'same-view', 'and waives a same-view re-entry, nothing wider');
  });

  defineStructureContract(
    'and the row itself confirms through the discard-dirty seam, never globalThis.confirm',
    { file: ROOT, constant: 'routeExitGuards', property: 'recipe-edit' },
    {
      reads: ['store.confirmDiscardDirtyRecipeDraft'],
      readsNo: ['globalThis.confirm'],
      calls: ['saveRecipeDraft', 'cloneRecipeDraft'],
      compares: ['recipe-edit', 'cancel', 'save'],
    }
  );
});

describe('recipe-edit CSS uses the standard shell, not a bespoke workspace', () => {
  it('keeps the recipe-edit main grid rule', () => {
    assert.ok(
      css.includes('.fabricate-manager[data-manager-view="recipe-edit"] .manager-main {'),
      'recipe-edit main grid rule retained'
    );
  });

  it('puts the context rail on the ONE shared right-hand-panel surface', () => {
    // Issue 643 put the Recipe Studio rail on the SAME surface as its main editor panel
    // (--fab-bg-2) while every other screen kept the lighter --fab-bg-3.
    assert.match(
      css,
      /\.fabricate-manager\s+\.manager-inspector\s*\{[^}]*background:\s*var\(--fab-bg-2\);/,
      'the shared inspector sits on --fab-bg-2 on every screen'
    );
    assert.doesNotMatch(
      css,
      /\[data-manager-view="(?:recipe-edit|recipes)"\]\s+\.manager-inspector\s*\{[^}]*background:/,
      'no per-view inspector background override survives'
    );
    // The Tool Studio's own right-hand panel resolves through the same token.
    assert.match(
      css,
      /\.fabricate-manager\s+\.manager-tool-preview\s*\{[^}]*background:\s*var\(--fab-bg-2\);/,
      'the Tool Studio preview panel shares the inspector surface token'
    );
  });

  it('drops the bespoke recipe workspace rules', () => {
    assert.equal(css.includes('.manager-recipe-workspace'), false, 'no recipe workspace grid rule');
    assert.equal(css.includes('.manager-recipe-edit-panel'), false, 'no recipe editing panel rule');
    assert.equal(
      css.includes('.manager-recipe-inspector'),
      false,
      'no view-internal recipe inspector rule'
    );
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
    // The BASE rule, which is the unindented one.
    const block = css.match(/^\.fabricate-manager \.manager-environment-workspace\s*\{[^}]*\}/m);
    assert.ok(block, '.manager-environment-workspace rule exists');
    assert.match(
      block[0],
      /grid-template-columns:\s*var\(--fab-env-workspace-grid,\s*minmax\(0,\s*1fr\)\s*300px\)/,
      'environment workspace inspector is 300px, matching the standard global inspector'
    );
    assert.equal(
      block[0].includes('340px'),
      false,
      'environment workspace no longer uses the wider 340px column'
    );
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
    assert.match(
      block[0],
      /display:\s*block/,
      'block-level so text-overflow applies to the button'
    );
    assert.match(block[0], /min-width:\s*0/, 'can shrink for ellipsis');
    assert.match(block[0], /max-width:\s*100%/, 'never exceeds the card width');
    assert.match(block[0], /text-overflow:\s*ellipsis/, 'ellipsis on overflow');
    assert.match(block[0], /white-space:\s*nowrap/, 'single line');
    assert.match(block[0], /text-align:\s*left/, 'stays left-aligned');
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
    for (const key of [
      'DiscardDirtyTitle',
      'DiscardDirtyContent',
      'DiscardDirtyConfirm',
      'DiscardDirtyCancel',
      'EnabledHint',
      'DisabledHint',
    ]) {
      assert.ok(
        typeof recipeLang[key] === 'string' && recipeLang[key].trim().length > 0,
        `${key} present`
      );
    }
  });

  it('omits the dropped / competing keys', () => {
    for (const absent of [
      'DraftState',
      'SaveRecipe',
      'DiscardConfirm',
      'ActiveHint',
      'DraftHint',
      'LinkedItem',
      'LinkedItemTitle',
    ]) {
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
  defineStructureContract(
    'defines the canonical default in the lowest shared layer (the model)',
    MODEL,
    {
      exports: ['DEFAULT_RECIPE_IMAGE'],
      spellsExactly: [BLUEPRINT_DEFAULT],
      spellsExactlyNo: ['icons/svg/item-bag.svg'],
      reads: ['data.img', 'this.img'],
      names: ['DEFAULT_RECIPE_IMAGE'],
    }
  );

  defineStructureContract(
    'and recipeImageIcons re-exports the constant rather than redeclaring the literal',
    ICONS,
    {
      imports: ['../../../models/Recipe.js'],
      exports: ['DEFAULT_RECIPE_IMAGE'],
      spellsExactlyNo: [BLUEPRINT_DEFAULT],
    }
  );

  defineStructureContract('routes RecipeManager defaults through the imported constant', RECIPE_MANAGER, {
    imports: ['../models/Recipe.js'],
    declares: ['DEFAULT_RECIPE_IMG'],
    names: ['DEFAULT_RECIPE_IMAGE'],
  });

  defineStructureContract(
    'and its recipe default is the constant rather than the bag SVG',
    { file: RECIPE_MANAGER, constant: 'DEFAULT_RECIPE_IMG' },
    { names: ['DEFAULT_RECIPE_IMAGE'], spellsExactlyNo: ['icons/svg/item-bag.svg'] }
  );

  defineStructureContract(
    'uses the constant (not the bag SVG) in the recipe graph node fallback',
    GRAPH,
    {
      imports: ['./recipeImageIcons.js'],
      names: ['DEFAULT_RECIPE_IMAGE'],
      reads: ['recipe.img'],
      keys: ['img'],
      spellsExactlyNo: ['icons/svg/item-bag.svg'],
    }
  );

  defineStructureContract(
    'uses the constant in the recipe-edit view via import (no local literal)',
    EDIT,
    {
      imports: ['../../util/recipeImageIcons.js'],
      names: ['DEFAULT_RECIPE_IMAGE'],
      spellsExactlyNo: ['icons/svg/item-bag.svg'],
    }
  );
});

// Issue 884 — a recipe's icon is its own `img` and nothing else. The four GM readers used to
// prefix a book image the store projected from the first definition containing the recipe;
// membership being many-to-many, that made the rendered icon a function of definition order. They
// now share one chokepoint, `resolveRecipeImage`.
describe('recipe image readers resolve the recipe own image through the shared helper', () => {
  const READERS = [
    ['RecipesBrowserView', BROWSER, '../../util/craftingImageDefaults.js', 'recipe'],
    [
      'RecipeBrowserInspector',
      BROWSER_INSPECTOR,
      '../../../util/craftingImageDefaults.js',
      'selectedRecipe',
    ],
    ['AccessTabView', ACCESS_SURFACE, '../../util/craftingImageDefaults.js', 'recipe'],
    ['GrantAccessInspector', GRANT_ACCESS_INSPECTOR, '../../util/craftingImageDefaults.js', 'recipe'],
  ];

  for (const [name, file, specifier] of READERS) {
    defineStructureContract(
      `${name} imports the shared resolver and owns no single-use wrapper`,
      file,
      {
        imports: [specifier],
        names: ['resolveRecipeImage'],
        namesNo: ['recipeImage', 'recipeItemImg'],
        spellsExactlyNo: ['icons/svg/item-bag.svg'],
      }
    );
  }

  // The Access pair imported DEFAULT_CRAFTING_IMAGE for the deleted wrapper ALONE.
  defineStructureContract(
    'and the Access pair leaves no dead DEFAULT_CRAFTING_IMAGE import behind',
    [ACCESS_SURFACE, GRANT_ACCESS_INSPECTOR],
    { namesNo: ['DEFAULT_CRAFTING_IMAGE'] }
  );

  it('calls the resolver at each render site with that surface own identifier', () => {
    for (const [name, file, , expression] of READERS) {
      const bound = renderedNodes(componentAstOf(file), 'Medallion')
        .map((node) => attributeExpression(node, 'art'))
        .filter((node) => calledName(node) === 'resolveRecipeImage')
        .filter((node) => identifierNames(node).has(expression));
      assert.ok(bound.length > 0, `${name} resolves ${expression} through the chokepoint`);
    }
  });

  defineStructureContract(
    'leaves the store with no book image for any reader to prefer, membership intact',
    [STORE, ROW_PROJECTION, SYSTEM_PROJECTION],
    { namesNo: ['recipeItemImg'] }
  );

  // The root imports the shared resolver for the editor header's medallion, but must never
  // re-own a local image-resolution helper.
  defineStructureContract('keeps the manager root free of a recipe image helper of its own', ROOT, {
    namesNo: ['recipeImage'],
  });
});

describe('RecipeEditView keeps the recipe image always editable', () => {
  // A recipe can belong to many books & scrolls (recipeIds[] is many-to-many).
  defineStructureContract('drops the linked-state derivation and the linkedItemImage prop', EDIT, {
    namesNo: ['isRecipeItemLinked', 'linkedItemImage'],
  });

  defineStructureContract(
    'renders only the editable image picker button — no locked span, lock icon, or marker',
    OVERVIEW,
    {
      namesNo: ['isRecipeItemLinked'],
      spellsNo: ['is-recipe-item-linked'],
      writesNo: ['data-recipe-item-locked-image'],
      attributes: [['data-recipe-field', 'img']],
      names: ['onChooseImage'],
    }
  );

  defineStructureContract(
    'guards chooseImage only on the pick handler, never on a linked state',
    { file: EDIT, fn: 'chooseImage' },
    { names: ['onPickImagePath'], namesNo: ['isRecipeItemLinked'], compares: ['function'] }
  );

  defineStructureContract('does not thread a linked recipe-item image through the root', ROOT, {
    namesNo: ['linkedItemImage', 'recipeDraftLinkedItemImage'],
  });

  defineStructureContract(
    'resolves the editor header image through the shared bag-to-blueprint resolver',
    ROOT,
    { imports: ['../../util/craftingImageDefaults.js'], names: ['resolveRecipeImage'] }
  );

  it('and the header medallion and the Overview picker both route through it', () => {
    const [medallion] = renderedNodes(componentAstOf(ROOT), 'Medallion').filter(
      (node) =>
        calledName(attributeExpression(node, 'art')) === 'resolveRecipeImage' &&
        identifierNames(attributeExpression(node, 'art')).has('recipeDraft')
    );
    assert.ok(medallion, 'the header medallion resolves the generic bag to the blueprint default');
  });

  defineStructureContract('and the overview picker does the same', OVERVIEW, {
    names: ['resolveRecipeImage'],
    callsWith: [['resolveRecipeImage', 'value']],
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

  defineStructureContract(
    'keeps the reusable routing hooks intact on both routed heads',
    ROUTING_ASSIGNMENT,
    {
      passesValues: [['SearchablePopover', 'triggerAddMarker', 'routing-option']],
      writes: ['data-routing-chip'],
      spells: ['manager-recipe-routing-picker'],
      // The trigger is the last flow child, so the auto margin pushes only it right.
      rendersBefore: [['EachBlock', 'SearchablePopover']],
    }
  );

  defineStructureContract(
    'places the delete button immediately after the routing head in the result-set head',
    RESULT_GROUP_CARD,
    {
      writes: ['data-recipe-remove'],
      rendersBefore: [
        ['RecipeRoutingAssignment', { attribute: ['data-recipe-remove', 'result-set'] }],
      ],
    }
  );
});

describe('recipe image picker no longer reuses the scene-locked visuals', () => {
  it('drops the is-recipe-item-linked locked-picker rules (the image is always editable)', () => {
    assert.equal(
      css.includes('is-recipe-item-linked'),
      false,
      'the recipe-item locked-picker class is removed from the stylesheet'
    );
  });
});

// Issue 1018. Two DIFFERENT predicates used to share the name `enableBlocked`.
describe('the editor enable-toggle gate is named apart from the activation gate (issue 1018)', () => {
  defineStructureContract('leaves no `enableBlocked` anywhere in the editor pair', [EDIT, OVERVIEW], {
    // `enableToggleBlocked` is a different identifier, so the name claim cannot false-positive.
    namesNo: ['enableBlocked'],
  });

  defineStructureContract(
    'keeps the editor predicate declared as `enableToggleBlocked`',
    { file: EDIT, constant: 'enableToggleBlocked' },
    { calls: ['blocksEnable'], reads: ['readiness.issues'], names: ['enabled'] }
  );

  defineStructureContract('and forwards it to the Overview tab', EDIT, {
    passesProps: [['RecipeOverviewTab', 'enableToggleBlocked']],
  });

  defineStructureContract(
    'which declares it with its off-by-default value and disables the toggle from it',
    OVERVIEW,
    { declaresProp: ['enableToggleBlocked'], defaults: [['enableToggleBlocked', false]] }
  );

  it('and the Overview enable toggle is disabled from enableToggleBlocked', () => {
    const disabled = renderedNodes(componentAstOf(OVERVIEW), 'ToggleCard')
      .map((node) => attributeExpression(node, 'disabled'))
      .filter((node) => node && identifierNames(node).has('enableToggleBlocked'));
    assert.equal(disabled.length, 1, 'exactly one toggle card is gated on the editor predicate');
    assert.ok(
      identifierNames(disabled[0]).has('saving'),
      'and it is also gated while the editor is saving'
    );
  });

  // The other half. Renaming the projection instead of the editor local would satisfy the negative
  // assertions above while leaving the two concepts merged under one name.
  defineStructureContract(
    'keeps the ACTIVATION gate projected and read as `enableBlocked`',
    ROW_PROJECTION,
    { keys: ['enableBlocked'], calls: ['_isRecipeEnableBlocked'] }
  );

  defineStructureContract('and the browser inspector pill still reads it', BROWSER_INSPECTOR, {
    reads: ['selectedRecipe.enableBlocked'],
  });
});
