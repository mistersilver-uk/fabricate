import { describe, it, before, after, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, mkdirSync, mkdtempSync, rmSync, symlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { compile } from 'svelte/compiler';
import { flushSync, mount, tick, unmount } from '../../node_modules/svelte/src/index-client.js';
import { writable } from 'svelte/store';
import { setupDOM, teardownDOM } from '../helpers/svelte-dom.js';

const repoRoot = resolve(import.meta.dirname, '../..');
const sharedComponentNames = [
  'ImagePathPicker',
  'IconPicker',
  'ManagerColorPicker',
  'ManagerColorPopover',
  'EssenceSourceSelector',
  'Pagination',
  // The Recipe Studio primitives (issue 643). They are import-free leaves, but they
  // MUST still be compiled into this tree: a `.svelte` the mounted root renders but
  // the allowlist omits does NOT fail — it hangs, reported as `# cancelled`.
  'Medallion',
  'StatusPill',
  'CollapsibleGroupHeader',
  // The duration editor's per-unit steppers are the shared editable-input Stepper.
  'Stepper',
];

let tempRoot;
let Component;
let EnvironmentEditViewComponent;
let ChecksRightMenuComponent;
let CraftingCheckEditorComponent;
let SimpleCraftingCheckEditorComponent;
let ProgressiveCraftingCheckEditorComponent;
let ToolsBrowserViewComponent;
let ChecksViewComponent;
let RecipeOverviewTabComponent;
let SystemEditViewComponent;
let CraftingSettingsViewComponent;
let mounted;
let target;

function rewriteClientImports(code) {
  return code
    .replace(/from 'svelte';/g, "from 'svelte/internal/client';")
    .replace(/(from\s+['"][^'"]+\.svelte)(['"])/g, '$1.js$2');
}

function compileManagerRoot() {
  writeCompiledSvelte('src/ui/svelte/apps/manager/CraftingSystemManagerRoot.svelte');
  // Rendered by BOTH ComponentEditView (salvage) and RecipeResultsTab (issue 651).
  // Omitting it here HANGS every mounted manager test rather than failing one.
  writeCompiledSvelte('src/ui/svelte/apps/manager/ToggleCard.svelte');
  writeCompiledSvelte('src/ui/svelte/apps/manager/ComponentEditView.svelte');
  writeCompiledSvelte('src/ui/svelte/apps/manager/ComponentSourceInspector.svelte');
  writeCompiledSvelte('src/ui/svelte/apps/manager/ComponentDifficultyInspector.svelte');
  writeCompiledSvelte('src/ui/svelte/apps/manager/ComponentsBrowserView.svelte');
  writeCompiledSvelte('src/ui/svelte/apps/manager/checks/ChecksView.svelte');
  writeCompiledSvelte('src/ui/svelte/apps/manager/checks/ChecksEditorTabs.svelte');
  writeCompiledSvelte('src/ui/svelte/apps/manager/checks/ChecksRightMenu.svelte');
  writeCompiledSvelte('src/ui/svelte/apps/manager/checks/CheckFormulaFields.svelte');
  writeCompiledSvelte('src/ui/svelte/apps/manager/checks/CheckTriggers.svelte');
  writeCompiledSvelte('src/ui/svelte/apps/manager/checks/CheckRecipeTiers.svelte');
  writeCompiledSvelte('src/ui/svelte/apps/manager/checks/CheckAwardMode.svelte');
  writeCompiledSvelte('src/ui/svelte/apps/manager/checks/CraftingCheckEditor.svelte');
  writeCompiledSvelte('src/ui/svelte/apps/manager/checks/SimpleCraftingCheckEditor.svelte');
  writeCompiledSvelte('src/ui/svelte/apps/manager/checks/ProgressiveCraftingCheckEditor.svelte');
  writeCompiledSvelte('src/ui/svelte/apps/manager/checks/ChecksValidationTab.svelte');
  writeCompiledSvelte('src/ui/svelte/apps/manager/EnvironmentEditView.svelte');
  writeCompiledSvelte('src/ui/svelte/apps/manager/EnvironmentsBrowserView.svelte');
  writeCompiledSvelte('src/ui/svelte/apps/manager/GatheringEconomyView.svelte');
  writeCompiledSvelte('src/ui/svelte/apps/manager/EssenceBrowserView.svelte');
  writeCompiledSvelte('src/ui/svelte/apps/manager/EssenceEditView.svelte');
  writeCompiledSvelte('src/ui/svelte/apps/manager/GatheringTaskEditView.svelte');
  writeCompiledSvelte('src/ui/svelte/apps/manager/ToolsBrowserView.svelte');
  writeCompiledSvelte('src/ui/svelte/apps/manager/GatheringTasksBrowserView.svelte');
  writeCompiledSvelte('src/ui/svelte/apps/manager/GatheringEventsBrowserView.svelte');
  writeCompiledSvelte('src/ui/svelte/apps/manager/GatheringEventEditView.svelte');
  writeCompiledSvelte('src/ui/svelte/apps/manager/GatheringTravelTabs.svelte');
  writeCompiledSvelte('src/ui/svelte/apps/manager/GatheringPartiesTab.svelte');
  writeCompiledSvelte('src/ui/svelte/apps/manager/GatheringRealmsTab.svelte');
  writeCompiledSvelte('src/ui/svelte/apps/manager/GatheringMapLinksTab.svelte');
  writeCompiledSvelte('src/ui/svelte/apps/manager/MapRegionLinkPicker.svelte');
  writeCompiledSvelte('src/ui/svelte/apps/manager/RealmEnvironmentsEditor.svelte');
  writeCompiledSvelte('src/ui/svelte/apps/manager/RealmNameField.svelte');
  writeCompiledSvelte('src/ui/svelte/apps/manager/SearchablePopover.svelte');
  writeCompiledSvelte('src/ui/svelte/apps/manager/RealmOverridePicker.svelte');
  writeCompiledSvelte('src/ui/svelte/apps/manager/PartyExpandedBody.svelte');
  writeCompiledSvelte('src/ui/svelte/apps/manager/PartyNameField.svelte');
  writeCompiledSvelte('src/ui/svelte/apps/manager/GatheringTravelView.svelte');
  writeCompiledSvelte('src/ui/svelte/apps/manager/GatheringRealmQuickList.svelte');
  writeCompiledSvelte('src/ui/svelte/apps/manager/RecipesBrowserView.svelte');
  // The library inspector, extracted out of the root (issue 643). It lives under
  // `recipes/` — NOT `recipe/`, which the screenshot map's RECIPE_EDIT_MATCHES globs.
  writeCompiledSvelte('src/ui/svelte/apps/manager/recipes/RecipeBrowserInspector.svelte');
  writeCompiledSvelte('src/ui/svelte/apps/manager/BooksScrollsView.svelte');
  writeCompiledSvelte('src/ui/svelte/apps/manager/CraftingSettingsView.svelte');
  writeCompiledSvelte('src/ui/svelte/apps/manager/CraftingEffectPanel.svelte');
  writeCompiledSvelte('src/ui/svelte/apps/manager/SegmentedControl.svelte');
  writeCompiledSvelte('src/ui/svelte/apps/manager/RosterRow.svelte');
  writeCompiledSvelte('src/ui/svelte/apps/manager/ItemPickerModal.svelte');
  writeCompiledSvelte('src/ui/svelte/apps/manager/AccessTabView.svelte');
  writeCompiledSvelte('src/ui/svelte/apps/manager/GrantAccessInspector.svelte');
  writeCompiledSvelte('src/ui/svelte/apps/manager/ItemPageInspector.svelte');
  writeCompiledSvelte('src/ui/svelte/apps/manager/RecipeItemEditor.svelte');
  // The RecipeItemEditor's "How players see it" rail embeds the REAL player
  // InventoryDetail (which pulls in CraftingThumb → craftingImageDefaults) fed a
  // synthetic row from recipeItemPreviewRow.js (issue 544). Compile/copy them here too
  // or mounting the manager tree that renders the editor HANGS (# cancelled).
  writeCompiledSvelte('src/ui/svelte/apps/inventory/InventoryDetail.svelte');
  writeCompiledSvelte('src/ui/svelte/apps/crafting/CraftingThumb.svelte');
  for (const recipeItemComponent of [
    'RecipeItemEditorTabs',
    'RecipeItemOverviewTab',
    'RecipeItemContentsTab',
    'RecipeItemLimitsTab',
    'RecipeItemValidationTab',
  ]) {
    writeCompiledSvelte(`src/ui/svelte/apps/manager/recipe-item/${recipeItemComponent}.svelte`);
  }
  // Plain crafting modules imported by the nav model + Settings/nav wiring — copied
  // raw (NOT compiled), the same way recipe/recipeReadiness.js is.
  for (const craftingModule of ['craftingVisibility.js', 'craftingNav.js']) {
    const moduleDestination = join(tempRoot, `src/ui/svelte/apps/manager/crafting/${craftingModule}`);
    mkdirSync(dirname(moduleDestination), { recursive: true });
    writeFileSync(
      moduleDestination,
      readFileSync(resolve(repoRoot, `src/ui/svelte/apps/manager/crafting/${craftingModule}`), 'utf8')
    );
  }
  writeCompiledSvelte('src/ui/svelte/apps/manager/RecipeEditView.svelte');
  writeCompiledSvelte('src/ui/svelte/apps/manager/RecipeStepsCard.svelte');
  for (const recipeComponent of [
    'RecipeEditorTabs',
    // The editor's mode banner + context rail (issue 643). The rail REPLACED
    // RecipeItemInspector and lives under `recipe/` so the screenshot map's
    // RECIPE_EDIT_MATCHES glob republishes the editor frames when it changes.
    'RecipeModeBanner',
    'RecipeContextRail',
    'RecipeOverviewTab',
    'RecipeIngredientsTab',
    'RecipeResultsTab',
    'RecipeToolsTab',
    'RecipeValidationTab',
    'RecipeStepAccordion',
    'RecipeDurationEditor',
    'RecipeDurationSteppers',
    'RecipeIngredientsSection',
    'RecipeIngredientSetCard',
    'RecipeIngredientGroupCard',
    'RecipeIngredientOption',
    'RecipeResultsSection',
    'RecipeResultGroupCard',
    'RecipeRoutingAssignment',
    'RecipeResultItemRow',
    'RecipeToolsSection',
  ]) {
    writeCompiledSvelte(`src/ui/svelte/apps/manager/recipe/${recipeComponent}.svelte`);
  }
  for (const recipeModule of ['recipeReadiness.js']) {
    const moduleDestination = join(tempRoot, `src/ui/svelte/apps/manager/recipe/${recipeModule}`);
    mkdirSync(dirname(moduleDestination), { recursive: true });
    writeFileSync(
      moduleDestination,
      readFileSync(resolve(repoRoot, `src/ui/svelte/apps/manager/recipe/${recipeModule}`), 'utf8')
    );
  }
  writeCompiledSvelte('src/ui/svelte/apps/manager/ResolutionModeCard.svelte');
  // Plain module imported by CraftingSettingsView — copied raw (NOT compiled), the
  // same way recipe/recipeReadiness.js is, so the mounted import resolves.
  {
    const moduleDestination = join(tempRoot, 'src/ui/svelte/apps/manager/resolutionModeOptions.js');
    mkdirSync(dirname(moduleDestination), { recursive: true });
    writeFileSync(
      moduleDestination,
      readFileSync(resolve(repoRoot, 'src/ui/svelte/apps/manager/resolutionModeOptions.js'), 'utf8')
    );
  }
  writeCompiledSvelte('src/ui/svelte/apps/manager/system/SystemEditorTabs.svelte');
  writeCompiledSvelte('src/ui/svelte/apps/manager/system/CharacterPrerequisitesCard.svelte');
  writeCompiledSvelte('src/ui/svelte/apps/manager/SystemEditView.svelte');
  writeCompiledSvelte('src/ui/svelte/apps/manager/SystemOverviewView.svelte');
  writeCompiledSvelte('src/ui/svelte/apps/manager/SystemsBrowserView.svelte');
  writeCompiledSvelte('src/ui/svelte/apps/manager/TagsCategoriesView.svelte');
  for (const environmentComponent of [
    'EnvironmentEditorTabs',
    'EnvironmentOverviewTab',
    'EnvironmentTasksTab',
    'EnvironmentEventsTab',
    'EnvironmentValidationTab',
    'EnvironmentRightInspector',
    'EnvironmentSummaryInspector',
    'RecordInspector',
    'CompositionList',
    'CompositionStatePill',
    'RuntimeStatePill',
    'MatchingEvidenceChips',
    'OverrideIndicator',
    'CompositionModeControl',
  ]) {
    writeCompiledSvelte(`src/ui/svelte/apps/manager/environment/${environmentComponent}.svelte`);
  }
  for (const environmentModule of ['environmentReadiness.js']) {
    const moduleDestination = join(
      tempRoot,
      `src/ui/svelte/apps/manager/environment/${environmentModule}`
    );
    mkdirSync(dirname(moduleDestination), { recursive: true });
    writeFileSync(
      moduleDestination,
      readFileSync(
        resolve(repoRoot, `src/ui/svelte/apps/manager/environment/${environmentModule}`),
        'utf8'
      )
    );
  }
  for (const componentName of sharedComponentNames) {
    writeCompiledSvelte(`src/ui/svelte/components/${componentName}.svelte`);
  }

  for (const utilPath of [
    'foundryBridge.js',
    'recipeItemAccessBadge.js',
    'essenceIcons.js',
    'fontAwesomeFreeClassicIcons.js',
    'iconPickerPopover.js',
    'componentEditor.js',
    'dropRateTier.js',
    'dropUtils.js',
    'sceneImages.js',
    'gatheringFormat.js',
    'recipeImageIcons.js',
    'recipeDuration.js',
    'recipeCurrency.js',
    'systemDisambiguation.js',
    'craftingImageDefaults.js',
    'recipeItemPreviewRow.js',
  ]) {
    const utilDestination = join(tempRoot, `src/ui/svelte/util/${utilPath}`);
    mkdirSync(dirname(utilDestination), { recursive: true });
    writeFileSync(
      utilDestination,
      readFileSync(resolve(repoRoot, `src/ui/svelte/util/${utilPath}`), 'utf8')
    );
  }

  // recipeImageIcons re-exports DEFAULT_RECIPE_IMAGE from the Recipe model (the
  // single low-layer source of truth), so copy that module and its transitive
  // model/util/config dependencies verbatim.
  for (const rawPath of [
    'src/models/Recipe.js',
    'src/models/Ingredient.js',
    'src/models/IngredientSet.js',
    'src/models/IngredientGroup.js',
    'src/models/Result.js',
    'src/models/match/matchTypes.js',
    'src/utils/recipeCategories.js',
    // The recipe library's pure list model (filter / group / sort / paginate + the
    // per-row derivations). Imported by RecipesBrowserView (issue 643).
    'src/utils/recipeBrowserModel.js',
    'src/utils/routedOutcomeKeywords.js',
    'src/utils/craftingCheckExpression.js',
    'src/ui/svelte/apps/manager/checks/checksReadiness.js',
    'src/config/flags.js',
    // CharacterPrerequisitesCard imports the pure prerequisite engine (issue 544).
    'src/systems/characterPrerequisites.js',
    'src/config/currencyPresets.js',
    'src/config/currencyProviders.js',
    'src/systems/Pf2eInventoryCoinAdapter.js',
    'src/gatheringImageDefaults.js',
    // CraftingSystemManagerRoot seeds a routing provider when a recipe enters
    // Complex mode, reusing chooseSeedProvider from this pure migration module.
    'src/migration/migrateRecipeForModeChange.js',
    // RecipeValidationTab localizes a signature-collision blocker row via this pure
    // leaf (issue 549); copy it so the mounted import resolves.
    'src/utils/recipeActivationMessages.js',
  ]) {
    const rawDestination = join(tempRoot, rawPath);
    mkdirSync(dirname(rawDestination), { recursive: true });
    writeFileSync(rawDestination, readFileSync(resolve(repoRoot, rawPath), 'utf8'));
  }

  for (const actionPath of ['dragDrop.js', 'dismissOnOutsideClick.js', 'portal.js']) {
    const actionDestination = join(tempRoot, `src/ui/svelte/actions/${actionPath}`);
    mkdirSync(dirname(actionDestination), { recursive: true });
    writeFileSync(
      actionDestination,
      readFileSync(resolve(repoRoot, `src/ui/svelte/actions/${actionPath}`), 'utf8')
    );
  }
}

function navButton(labelText) {
  return Array.from(target.querySelectorAll('.manager-nav-button')).find((button) =>
    button.textContent.includes(labelText)
  );
}

function gatheringSubitem(labelText) {
  return Array.from(target.querySelectorAll('.manager-nav-subitem')).find((button) =>
    button.textContent.includes(labelText)
  );
}

function gatheringToggle() {
  return target.querySelector('.manager-nav-toggle');
}

// The gated Crafting nav group (issue 511) nests Recipes as a sub-route. Clicking
// the "Crafting" parent from a non-crafting route routes straight to Recipes and
// expands the group; the parent also carries the recipes count badge.
function craftingParent() {
  return navButton('Crafting');
}

function craftingSubitem(labelText) {
  return Array.from(target.querySelectorAll('#manager-crafting-submenu .manager-nav-subitem')).find(
    (button) => button.textContent.includes(labelText)
  );
}

// Mount the manager, route to Recipes, and open the recipe-edit route for r1.
// Assigns the module-level `mounted`/`target` (so afterEach can clean up) and
// returns the mounted target for the caller to query.
async function openRecipeEditor(calls, storeOptions = {}) {
  target = document.createElement('div');
  document.body.appendChild(target);
  mounted = mount(Component, {
    target,
    props: {
      store: createStore(calls, { experimentalFeaturesEnabled: true, ...storeOptions }),
      services: { openCurrentAdmin: () => {} },
    },
  });
  flushSync();
  craftingParent().click();
  await tick();
  flushSync();
  // The Edit action moved to the inspector (issue 643): SELECT the row by clicking its
  // identity, which drives the shell inspector, then click the inspector's Edit action.
  target.querySelector('[data-recipe-id="r1"] .manager-recipe-identity').click();
  await tick();
  flushSync();
  target.querySelector('.manager-recipe-browser-inspector [data-recipe-action="edit"]').click();
  await tick();
  flushSync();
  return target;
}

function headerSaveButton(target) {
  return Array.from(target.querySelectorAll('.manager-header-actions .manager-button')).find(
    (button) => button.textContent.includes('Save')
  );
}

function editRecipeName(target, value) {
  const nameInput = target.querySelector('.manager-main [data-recipe-field="name"]');
  nameInput.value = value;
  nameInput.dispatchEvent(new globalThis.window.Event('input', { bubbles: true }));
}

function writeCompiledSvelte(sourcePath) {
  const source = readFileSync(resolve(repoRoot, sourcePath), 'utf8');
  const compiled = compile(source, {
    filename: sourcePath,
    generate: 'client',
    dev: true,
    css: 'injected',
  });
  const destination = join(tempRoot, `${sourcePath}.js`);
  mkdirSync(dirname(destination), { recursive: true });
  writeFileSync(destination, rewriteClientImports(compiled.js.code));
}

// Inject a recipe knowledge mode onto a selected system so tests can exercise the
// recipe-edit inspector gating. Kept out of createStore to hold that helper under
// the cognitive-complexity budget.
function applyRecipeKnowledgeMode(system, mode) {
  if (!system || !mode) return system;
  return { ...system, recipeVisibility: { knowledge: { mode } } };
}

// Merge a selected currency config onto the alchemy fixture so applySelectedSystem
// (which re-reads systemDetails) preserves the currency config across an Edit click.
// Mutates the passed systemDetails map. Kept out of createStore to hold that helper
// under the cognitive-complexity budget.
function applySelectedCurrency(systemDetails, selectedCurrency) {
  if (!selectedCurrency) return;
  systemDetails.alchemy = {
    ...systemDetails.alchemy,
    requirements: { ...systemDetails.alchemy.requirements, currency: selectedCurrency },
  };
}

function createStore(calls = [], options = {}) {
  const selectedFeatures = options.selectedFeatures || {
    essences: true,
    effectTransfer: true,
    itemTags: true,
    gathering: true,
    recipeCategories: true,
    salvage: true,
  };
  const alchemyManagedItemOptions = options.emptyComponents
    ? []
    : [
        {
          id: 'c1',
          name: 'Iron Ore',
          img: 'icons/commodities/metal/ore-chunk-grey.webp',
          description: 'Unrefined metal.',
          originItemUuid: 'Compendium.fabricate.items.iron-ore',
        },
        {
          id: 'c2',
          name: 'Glass Vial',
          img: 'icons/containers/kitchenware/vase-clay-blue.webp',
          description: '',
        },
        {
          id: 'c3',
          name: 'Nightshade With An Exceptionally Long Localized Component Name',
          img: 'icons/consumables/plants/nightshade.jpg',
          description: 'A dusky flowering herb used in careful doses.',
          originItemUuid: 'Compendium.fabricate.items.nightshade-with-a-long-source-reference',
        },
        {
          id: 'c4',
          name: 'Coal',
          img: 'icons/commodities/materials/bowl-powder-black.webp',
          description: 'Fuel for a steady forge.',
        },
      ];
  const systemDetails = {
    alchemy: {
      id: 'alchemy',
      name: 'Alchemy',
      description: 'Potion and essence work',
      resolutionMode: options.alchemyResolutionMode || 'alchemy',
      // System-level alchemy check mode (issue 554). Defaults to `simple` so the
      // Checks tab renders the simple pass/fail editor for the default fixture;
      // tests exercising None/Tiered pass their own `alchemyConfig`.
      alchemy: options.alchemyConfig ?? {
        checkMode: 'simple',
        learnOnCraft: true,
        consumeOnFail: true,
        showAttemptHistoryToPlayers: false,
      },
      craftingCheck: options.craftingCheck,
      salvageResolutionMode: options.salvageResolutionMode || 'simple',
      salvageCraftingCheck: options.salvageCraftingCheck,
      gatheringCraftingCheck: options.gatheringCraftingCheck,
      features: selectedFeatures,
      managedItemOptions: alchemyManagedItemOptions,
      // System-level recipe visibility config (issue 511). The Books & Scrolls
      // surface reads the shared use/learn caps from here; left undefined unless a
      // test supplies one (the visibility card then falls back to its defaults).
      recipeVisibility: options.recipeVisibility,
      // Recipe items (cook books / scrolls) surfaced by the Books & Scrolls
      // management surface (issue 511). r1 links to the first book, so the
      // surface can show a linked-recipe count and the shared cap chips.
      recipeItemDefinitions: options.recipeItemDefinitions ?? [
        {
          id: 'ri1',
          name: 'Alchemist Cook Book',
          img: 'icons/sundries/books/book-worn-brown.webp',
          description: 'A well-thumbed book of potion recipes.',
        },
        {
          id: 'ri2',
          name: 'Scroll of Elixirs',
          img: 'icons/sundries/scrolls/scroll-bound-brown.webp',
          description: '',
        },
      ],
      // Tools are system-owned: the manager reads the library from
      // selectedSystem.tools (not gatheringConfig). Mirror the option here so the
      // Tools browser + the gathering task editor's tool picker see them.
      tools: options.gatheringLibraryTools || [],
      essenceDefinitions: [
        {
          id: 'earth',
          name: 'Earth',
          description: 'Stone and root.',
          icon: 'fas fa-mountain',
          sourceComponentId: 'c1',
          sourceItemUuid: 'c1',
          associatedSystemItemId: 'c1',
        },
        {
          id: 'water',
          name: 'Water',
          description: 'Clear current.',
          icon: 'fas fa-water',
          sourceComponentId: null,
          sourceItemUuid: null,
          associatedSystemItemId: null,
        },
      ],
      itemTags: ['herb', 'mineral', 'ore'],
      categories: ['potions'],
      sceneOptions: [
        {
          uuid: 'Scene.forest',
          name: 'Moonlit Forest',
          background: { src: 'forest-full.webp' },
          img: 'forest-medium.webp',
          thumbnail: 'forest-thumb.webp',
        },
      ],
      availableScriptMacros: [],
    },
    smithing: {
      id: 'smithing',
      name: 'Smithing',
      description: 'Heavy equipment work',
      resolutionMode: 'routedByCheck',
      features: {
        gathering: false,
        itemTags: false,
        recipeCategories: true,
        essences: false,
        salvage: true,
      },
      managedItemOptions: [
        { id: 's1' },
        { id: 's2' },
        { id: 's3' },
        { id: 's4' },
        { id: 's5' },
        { id: 's6' },
      ],
      essenceDefinitions: [],
      itemTags: [],
      categories: ['armor'],
    },
  };
  const componentItems = {
    alchemy: [
      {
        id: 'c1',
        name: 'Iron Ore',
        img: 'icons/commodities/metal/ore-chunk-grey.webp',
        description: 'Unrefined metal.',
        tags: ['ore', 'metal'],
        essences: [{ id: 'earth', name: 'Earth', icon: 'fas fa-mountain', quantity: 2 }],
        registeredItemUuidDisplay: 'Compendium.fabricate.items.iron-ore',
        hasRegisteredItemUuid: true,
        sourceOrigin: 'compendium',
        sourceOriginLabel: 'Compendium',
        sourceMissing: false,
        showTags: true,
        showEssences: true,
        difficulty: 2,
        // Raw per-component salvage shape the in-manager editor reads/edits. Only
        // present when a test opts in via options.componentSalvage.
        salvage: options.componentSalvage,
        salvageSummary: {
          quantityRequired: 1,
          toolCount: 1,
          resultGroupCount: 1,
          outcomeCount: 0,
          hasTimeRequirement: false,
          hasCurrencyRequirement: false,
        },
      },
      {
        id: 'c2',
        name: 'Glass Vial',
        img: 'icons/containers/kitchenware/vase-clay-blue.webp',
        description: '',
        tags: ['container'],
        essences: [],
        registeredItemUuidDisplay: '',
        hasRegisteredItemUuid: false,
        sourceOrigin: 'unknown',
        sourceOriginLabel: 'Unknown',
        sourceMissing: false,
        showTags: true,
        showEssences: true,
        // Mirror the normalized component shape: the `difficulty` key is always
        // present and set to undefined when unset, so the browser must show
        // "None" by value (not by key absence).
        difficulty: undefined,
      },
      ...(options.extendedComponentCards
        ? [
            {
              id: 'c3',
              name: 'Nightshade With An Exceptionally Long Localized Component Name',
              img: 'icons/consumables/plants/nightshade.jpg',
              description: 'A dusky flowering herb used in careful doses.',
              tags: ['herb', 'night'],
              essences: [],
              registeredItemUuidDisplay: '',
              hasRegisteredItemUuid: false,
              sourceOrigin: 'unknown',
              sourceOriginLabel: 'Unknown',
              sourceMissing: false,
              showTags: true,
              showEssences: true,
            },
            {
              id: 'c4',
              name: 'Coal',
              img: 'icons/commodities/materials/bowl-powder-black.webp',
              description: 'Fuel for a steady forge.',
              tags: ['fuel', 'mineral'],
              essences: [],
              registeredItemUuidDisplay: '',
              hasRegisteredItemUuid: false,
              sourceOrigin: 'unknown',
              sourceOriginLabel: 'Unknown',
              sourceMissing: false,
              showTags: true,
              showEssences: true,
            },
            {
              id: 'c5',
              name: 'Moon Fern',
              img: 'icons/consumables/plants/leaf-green.webp',
              description: 'Soft fronds that glow under moonlight.',
              tags: ['herb', 'moon'],
              essences: [],
              registeredItemUuidDisplay: '',
              hasRegisteredItemUuid: false,
              sourceOrigin: 'unknown',
              sourceOriginLabel: 'Unknown',
              sourceMissing: false,
              showTags: true,
              showEssences: true,
            },
            {
              id: 'c6',
              name: 'Crystal Dust',
              img: 'icons/commodities/gems/gem-powder-blue.webp',
              description: 'Fine shimmering mineral powder.',
              tags: ['mineral', 'crystal'],
              essences: [],
              registeredItemUuidDisplay: '',
              hasRegisteredItemUuid: false,
              sourceOrigin: 'unknown',
              sourceOriginLabel: 'Unknown',
              sourceMissing: false,
              showTags: true,
              showEssences: true,
            },
            {
              id: 'c7',
              name: 'Sun Petal',
              img: 'icons/consumables/plants/flower-yellow.webp',
              description: 'A warm yellow flower used in tonics.',
              tags: ['herb', 'sun'],
              essences: [],
              registeredItemUuidDisplay: '',
              hasRegisteredItemUuid: false,
              sourceOrigin: 'unknown',
              sourceOriginLabel: 'Unknown',
              sourceMissing: false,
              showTags: true,
              showEssences: true,
            },
            {
              id: 'c8',
              name: 'River Salt',
              img: 'icons/commodities/materials/powder-white.webp',
              description: 'Coarse salt gathered from river stones.',
              tags: ['mineral', 'water'],
              essences: [],
              registeredItemUuidDisplay: '',
              hasRegisteredItemUuid: false,
              sourceOrigin: 'unknown',
              sourceOriginLabel: 'Unknown',
              sourceMissing: false,
              showTags: true,
              showEssences: true,
            },
          ]
        : []),
    ],
    smithing: [
      {
        id: 's1',
        name: 'Coal',
        img: 'icons/commodities/materials/bowl-powder-black.webp',
        description: 'Forge fuel.',
        tags: [],
        essences: [],
        registeredItemUuidDisplay: '',
        hasRegisteredItemUuid: false,
        sourceOrigin: 'unknown',
        sourceOriginLabel: 'Unknown',
        sourceMissing: false,
        showTags: false,
        showEssences: false,
      },
    ],
  };
  const environmentDraft = {
    id: 'env-forest',
    craftingSystemId: 'alchemy',
    name: 'Moonlit Forest',
    description: 'Herbs and roots under old trees.',
    enabled: true,
    selectionMode: 'targeted',
    img: 'forest-custom.webp',
    sceneUuid: 'Scene.forest',
    region: 'north',
    biomes: ['forest'],
    enabledTaskIds: ['task-herbs'],
    tasks: [
      {
        id: 'task-forage',
        name: 'Forage',
        description: '',
        img: '',
        enabled: true,
        resolutionMode: 'routed',
        toolIds: ['tool-c2'],
        resultSelection: { provider: 'macroOutcome', macroUuid: '' },
        resultGroups: [
          {
            id: 'group-common',
            name: 'Common',
            results: [{ id: 'result-herb', componentId: 'c1', quantity: 2 }],
          },
        ],
      },
    ],
  };
  const environments = options.emptyEnvironments
    ? []
    : [
        environmentDraft,
        {
          id: 'env-cavern',
          craftingSystemId: 'alchemy',
          name: 'Quiet Cavern',
          description: 'Blind prospecting in dark mineral seams.',
          enabled: false,
          selectionMode: 'blind',
          sceneUuid: 'Scene.missing',
          region: 'north',
          biomes: ['cavern'],
          disabledTaskIds: ['task-cavern'],
          tasks: [
            {
              id: 'task-prospect',
              name: 'Prospect',
              description: '',
              img: '',
              enabled: false,
              resolutionMode: 'progressive',
              progressive: { awardMode: 'partial' },
              check: { provider: 'macro', macroUuid: '' },
              resultGroups: [],
            },
          ],
        },
      ];
  applySelectedCurrency(systemDetails, options.selectedCurrency);
  const baseSelectedSystem =
    options.noSystems || options.selected === false ? null : systemDetails.alchemy;
  const selectedSystemWithMode = applyRecipeKnowledgeMode(
    baseSelectedSystem,
    options.recipeKnowledgeMode
  );
  // Flat visibilityMode (issue 511, PR-B) + any other per-test system overrides.
  const selectedSystem = selectedSystemWithMode
    ? { ...selectedSystemWithMode, ...(options.selectedSystemOverrides || {}) }
    : selectedSystemWithMode;
  const essenceCardsBySystem = {
    alchemy: [
      {
        id: 'earth',
        name: 'Earth',
        description: 'Stone and root.',
        icon: 'fas fa-mountain',
        sourceComponentId: 'c1',
        sourceItemUuid: 'c1',
        associatedSystemItemId: 'c1',
        associatedItem: {
          id: 'c1',
          name: 'Iron Ore',
          img: 'icons/commodities/metal/ore-chunk-grey.webp',
        },
        associatedItemName: 'Iron Ore',
        sourceName: 'Iron Ore',
        sourceState: 'linked',
        componentUsageCount: 1,
        componentUsageItems: [
          { id: 'c1', name: 'Iron Ore', img: 'icons/commodities/metal/ore-chunk-grey.webp' },
        ],
        deleteBlocked: true,
      },
      {
        id: 'water',
        name: 'Water',
        description: 'Clear current.',
        icon: 'fas fa-water',
        sourceComponentId: '',
        sourceItemUuid: null,
        associatedSystemItemId: null,
        associatedItem: null,
        associatedItemName: null,
        sourceName: '',
        sourceState: 'none',
        componentUsageCount: 0,
        componentUsageItems: [],
        deleteBlocked: false,
      },
    ],
    smithing: [],
  };
  const viewState = writable({
    systems: options.noSystems
      ? []
      : [
          {
            id: 'alchemy',
            name: 'Alchemy',
            description: 'Potion and essence work',
            enabled: true,
            resolutionMode: 'alchemy',
            features: selectedFeatures,
            featureCount: 3,
            componentCount: alchemyManagedItemOptions.length,
            recipeCount: 2,
            selected: options.selected !== false,
          },
          {
            id: 'smithing',
            name: 'Smithing',
            description: 'Heavy equipment work',
            enabled: false,
            resolutionMode: 'routedByCheck',
            features: systemDetails.smithing.features,
            featureCount: 1,
            componentCount: 6,
            recipeCount: 5,
            selected: false,
          },
        ],
    systemsLoading: options.systemsLoading === true,
    selectedSystem,
    recipes: options.emptyRecipes
      ? []
      : [
          {
            id: 'r1',
            name: 'Healing Draught',
            img: 'icons/consumables/potions/potion-bottle-corked-red.webp',
            description: 'Restores a small amount of health.',
            category: 'potions',
            recipeItemId: 'ri1',
            enabled: true,
            locked: false,
            isSimple: true,
            structureLabel: 'Simple',
            stepCount: 1,
            resultGroupCount: 1,
            ingredientCount: 2,
            toolCount: 1,
            requirementsPreview: [
              {
                id: 'step-1',
                name: 'Step 1',
                ingredientSetCount: 1,
                ingredientCount: 2,
                toolCount: 1,
                resultGroupCount: 1,
              },
            ],
            visibilitySummary: 'All players',
            ingredients: new Array(2),
            tools: new Array(1),
          },
          {
            id: 'r2',
            name: 'Locked Elixir',
            img: 'icons/consumables/potions/potion-flask-corked-blue.webp',
            description: 'Requires special access.',
            category: 'elixirs',
            enabled: false,
            locked: true,
            incomplete: true,
            isSimple: false,
            structureLabel: 'Single step',
            stepCount: 1,
            resultGroupCount: 2,
            ingredientCount: 3,
            toolCount: 0,
            requirementsPreview: [
              {
                id: 'step-1',
                name: 'Step 1',
                ingredientSetCount: 2,
                ingredientCount: 3,
                toolCount: 0,
                resultGroupCount: 2,
              },
            ],
            visibilitySummary: 'Restricted (none selected)',
            ingredients: new Array(3),
            tools: [],
          },
        ],
    recipeCategories: [
      { name: 'elixirs', count: 1 },
      { name: 'potions', count: 1 },
    ],
    recipeSearchTerm: '',
    itemSearchTerm: '',
    experimentalFeaturesEnabled: options.experimentalFeaturesEnabled === true,
    itemCards: selectedSystem ? componentCardsFor(selectedSystem.id) : [],
    essenceCards: selectedSystem
      ? options.emptyEssences
        ? []
        : essenceCardsBySystem[selectedSystem.id]
      : [],
    showVisibilitySummary: true,
    canShowEnvironmentsTab: selectedFeatures.gathering === true,
    environments,
    environmentsLoading: false,
    environmentsError: null,
    // Library-derived per-environment composition counts (tasks/events matched in).
    environmentTaskCounts: options.environmentTaskCounts || {
      'env-forest': { availableTaskCount: 1, availableEventCount: 0 },
      'env-cavern': { availableTaskCount: 1, availableEventCount: 0 },
    },
    selectedEnvironmentId: options.emptyEnvironments ? '' : 'env-forest',
    environmentDraft: options.emptyEnvironments ? null : environmentDraft,
    environmentDraftDirty: options.environmentDraftDirty === true,
    environmentDraftIsNew: false,
    environmentSaving: false,
    environmentSaveError: null,
    environmentValidationState: options.environmentValidationState || null,
    selectedEnvironmentTaskId: 'task-forage',
    toolsDraft: options.toolsDraft || [],
    toolsDraftBaseline: options.toolsDraftBaseline || options.toolsDraft || [],
    toolsDraftSystemId: options.toolsDraftSystemId || 'alchemy',
    toolsDraftDirty: options.toolsDraftDirty === true,
    toolsDraftDirtyToolIds: options.toolsDraftDirtyToolIds || [],
    toolsDraftSaving: options.toolsDraftSaving === true,
    toolsDraftSaveError: null,
    toolsDraftSelectedToolId: options.toolsDraftSelectedToolId || '',
    toolsDraftExpandedToolId: options.toolsDraftExpandedToolId || '',
    toolsDraftValidation: options.toolsDraftValidation || { valid: true, errors: [] },
    gatheringConfig: options.gatheringConfig || {
      conditions: { weather: 'clear', timeOfDay: 'day' },
      vocabularies: {
        regions: [],
        biomes: ['forest'],
        danger: ['safe', 'hazardous'],
        weather: ['clear', 'rain'],
        timeOfDay: ['dawn', 'day', 'night'],
      },
      systems: {
        alchemy: {
          conditions: {
            weather: {
              enabled: true,
              current: 'clear',
              values: [
                { id: 'clear', label: 'Clear Sky', icon: 'fas fa-sun' },
                { id: 'heavy-rain', label: 'Storm Rain', icon: 'fas fa-cloud-showers-heavy' },
              ],
            },
            timeOfDay: {
              enabled: true,
              current: 'day',
              values: [
                { id: 'dawn', label: 'First Light', icon: 'fas fa-cloud-sun' },
                { id: 'day', label: 'High Day', icon: 'fas fa-sun' },
                { id: 'night', label: 'Deep Night', icon: 'fas fa-moon' },
              ],
            },
          },
          vocabularies: {
            regions: {
              values: [
                { id: 'north', label: 'Northlands' },
                { id: 'south', label: 'South Coast' },
              ],
            },
            biomes: {
              values: [
                {
                  id: 'forest',
                  label: 'Moon Forest',
                  icon: 'fas fa-tree',
                  colorToken: 'sage',
                  customColor: '',
                },
                {
                  id: 'cavern',
                  label: 'Crystal Cavern',
                  icon: 'fas fa-gem',
                  colorToken: 'mist',
                  customColor: '#88AAFF',
                },
              ],
            },
          },
          rules: {
            rewardSelectionMode: options.rewardSelectionMode || 'highestRankedDrop',
            rewardLimit: 1,
            eventSelectionMode: 'allDrops',
            eventLimit: 1,
            eventPolicy: 'successWithEvent',
          },
          // The gathering economy's resolution mode selects the Checks gathering
          // editor (d100 → read-only card; progressive/routed → an editor).
          economy: { resolutionMode: options.gatheringResolutionMode || 'd100' },
          tasks: options.emptyGatheringTasks
            ? []
            : [
                {
                  id: 'task-herbs',
                  name: 'Gather Moon Herbs',
                  description: 'Collect luminous herbs near old roots.',
                  img: 'icons/consumables/plants/leaf-glowing-green.webp',
                  enabled: true,
                  region: 'north',
                  biomes: ['forest'],
                  weather: ['clear'],
                  timeOfDay: ['day'],
                  toolIds: Array.isArray(options.taskInitialToolIds)
                    ? options.taskInitialToolIds
                    : [],
                  dropRows: options.taskDropRows || [
                    {
                      id: 'drop-nightshade',
                      componentId: 'c3',
                      quantity: 2,
                      dropRate: 80,
                      enabled: true,
                      conditionModifiers: {
                        biome: [{ id: 'forest-penalty', conditionId: 'forest', value: -10 }],
                        timeOfDay: [
                          { id: 'night-bonus', conditionId: 'night', value: 20 },
                          { id: 'day-neutral', conditionId: 'day', value: 0 },
                        ],
                        weather: [{ id: 'clear-penalty', conditionId: 'clear', value: -15 }],
                      },
                    },
                  ],
                },
                {
                  id: 'task-cavern',
                  name: 'Prospect Crystal Veins',
                  description: 'Search cavern walls for mineral blooms.',
                  img: 'icons/commodities/gems/gem-rough-teal.webp',
                  enabled: true,
                  region: 'north',
                  biomes: ['cavern'],
                  weather: [],
                  timeOfDay: ['night'],
                  dropRows: [
                    { id: 'drop-ore', componentId: 'c1', quantity: 1, dropRate: 45, enabled: true },
                  ],
                },
                {
                  id: 'task-south',
                  name: 'South Coast Driftwood',
                  description: 'Gather beach wood after storms.',
                  img: 'icons/commodities/wood/log-stack-brown.webp',
                  enabled: false,
                  region: 'south',
                  biomes: ['forest'],
                  weather: ['heavy-rain'],
                  timeOfDay: [],
                  dropRows: [],
                },
              ],
          events: [],
          tools: options.gatheringLibraryTools || [],
        },
      },
    },
    foundrySystemId: options.foundrySystemId || '',
    // The `evaluateSystemValidation` report drives the System Overview page's
    // Validation tab, its nav badge, and the system-blocker banner.
    systemValidation: options.systemValidation || {
      issues: [],
      counts: { critical: 0, warning: 0, info: 0, blockers: 0 },
      blocksSystem: false,
    },
  });

  function applySelectedSystem(id) {
    const nextSelected = systemDetails[id] || null;
    viewState.update((state) => ({
      ...state,
      selectedSystem: nextSelected,
      itemCards: componentCardsFor(id),
      essenceCards: essenceCardsBySystem[id] || [],
      itemSearchTerm: '',
      canShowEnvironmentsTab: nextSelected?.features?.gathering === true,
      systems: state.systems.map((system) => ({
        ...system,
        selected: system.id === id,
      })),
    }));
  }

  function componentCardsFor(id) {
    if (options.emptyComponents) return [];
    return (componentItems[id] || []).map((item) =>
      options.missingComponentSource && item.id === 'c1'
        ? { ...item, sourceMissing: true, sourceOrigin: 'missing', sourceOriginLabel: 'Missing' }
        : item
    );
  }

  function applySystemEnabled(id, enabled) {
    if (systemDetails[id]) {
      systemDetails[id] = { ...systemDetails[id], enabled };
    }
    viewState.update((state) => ({
      ...state,
      selectedSystem:
        state.selectedSystem?.id === id
          ? { ...state.selectedSystem, enabled }
          : state.selectedSystem,
      systems: state.systems.map((system) => (system.id === id ? { ...system, enabled } : system)),
    }));
  }

  return {
    viewState,
    selectSystem: (id) => {
      calls.push(['selectSystem', id]);
      applySelectedSystem(id);
      return true;
    },
    createSystem: () => calls.push(['createSystem']),
    importSystem: () => calls.push(['importSystem']),
    exportSystem: (id) => calls.push(['exportSystem', id]),
    deleteSystem: (id) => calls.push(['deleteSystem', id]),
    toggleSystemEnabled: (id, enabled) => {
      calls.push(['toggleSystemEnabled', id, enabled]);
      applySystemEnabled(id, enabled);
    },
    saveSystemDetails: (name, description) => calls.push(['saveSystemDetails', name, description]),
    updateRecipeItemCaps: (recipeItemId, patch) => {
      calls.push(['updateRecipeItemCaps', recipeItemId, patch]);
      return options.updateRecipeItemCapsResult ?? true;
    },
    setVisibilityMode: (mode) => {
      calls.push(['setVisibilityMode', mode]);
      return options.setVisibilityModeResult ?? true;
    },
    setAlchemyCheckMode: (mode) => {
      calls.push(['setAlchemyCheckMode', mode]);
      return options.setAlchemyCheckModeResult ?? true;
    },
    setRecipeItemEnabled: (recipeItemId, enabled) => {
      calls.push(['setRecipeItemEnabled', recipeItemId, enabled]);
      return options.setRecipeItemEnabledResult ?? true;
    },
    saveRecipeItem: (recipeItemId, patch) => {
      calls.push(['saveRecipeItem', recipeItemId, patch]);
      return options.saveRecipeItemResult ?? true;
    },
    deleteRecipeItemDefinition: (recipeItemId) => {
      calls.push(['deleteRecipeItemDefinition', recipeItemId]);
      return options.deleteRecipeItemDefinitionResult ?? true;
    },
    confirmDiscardDirtyRecipeItemDraft: () => {
      calls.push(['confirmDiscardDirtyRecipeItemDraft']);
      return options.confirmDiscardRecipeItemResult ?? 'discard';
    },
    getPcRoster: () => {
      calls.push(['getPcRoster']);
      return options.pcRoster ?? [];
    },
    saveRecipeAccess: (recipeId, grant) => {
      calls.push(['saveRecipeAccess', recipeId, grant]);
      return options.saveRecipeAccessResult ?? true;
    },
    setResolutionMode: async (mode) => {
      calls.push(['setResolutionMode', mode]);
      return options.resolutionModeResult ?? true;
    },
    setSalvageResolutionMode: async (mode) => {
      calls.push(['setSalvageResolutionMode', mode]);
      return options.salvageResolutionModeResult ?? true;
    },
    toggleFeature: (feature, enabled) => {
      calls.push(['toggleFeature', feature, enabled]);
      return options.toggleFeatureResult ?? true;
    },
    toggleRequirement: (requirement, enabled) => {
      calls.push(['toggleRequirement', requirement, enabled]);
    },
    setCurrencySpendStrategy: async (id, strategy) => {
      calls.push(['setCurrencySpendStrategy', strategy, id]);
    },
    setCurrencyProvider: async (id, providerId) => {
      calls.push(['setCurrencyProvider', providerId, id]);
    },
    setCurrencyMacro: async (id, key, uuid) => {
      calls.push(['setCurrencyMacro', key, uuid, id]);
    },
    clearCurrencyMacro: async (id, key) => {
      calls.push(['clearCurrencyMacro', key, id]);
    },
    createRecipe: () => {
      calls.push(['createRecipe']);
      return options.createRecipeResult ?? { id: 'r-created' };
    },
    importRecipes: () => calls.push(['importRecipes']),
    exportRecipes: () => calls.push(['exportRecipes']),
    setRecipeSearch: (term) => calls.push(['setRecipeSearch', term]),
    // The THIRD argument is load-bearing and is captured deliberately. It carries the
    // blocked-enable `onBlocked` sink: supplying it is what makes the real store
    // SUPPRESS its Foundry notification. Drop it anywhere in the row → root → store
    // chain and the in-window flash dies while the toast silently returns, so a stub
    // that swallowed it would let that regression through green.
    toggleRecipeEnabled: (id, enabled, toggleOptions) => {
      calls.push(['toggleRecipeEnabled', id, enabled, toggleOptions]);
      return options.toggleRecipeEnabledResult ?? true;
    },
    updateRecipe: (id, updates, opts) => {
      calls.push(['updateRecipe', id, updates, opts]);
      return options.updateRecipeResult ?? true;
    },
    addRecipeItemFromUuid: (systemId, uuid) => {
      calls.push(['addRecipeItemFromUuid', systemId, uuid]);
      return options.addRecipeItemResult ?? { item: { id: 'ri-created' }, action: 'added' };
    },
    confirmDiscardDirtyRecipeDraft: () => {
      calls.push(['confirmDiscardDirtyRecipeDraft']);
      return options.confirmDiscardRecipeResult ?? 'discard';
    },
    confirmRecipeAction: (opts) => {
      calls.push(['confirmRecipeAction', opts]);
      return options.confirmRecipeActionResult ?? true;
    },
    duplicateRecipe: (id) => calls.push(['duplicateRecipe', id]),
    deleteRecipe: (id) => {
      calls.push(['deleteRecipe', id]);
      return options.deleteRecipeResult ?? true;
    },
    setItemSearch: (term) => calls.push(['setItemSearch', term]),
    deleteComponent: (id) => calls.push(['deleteComponent', id]),
    updateComponent: (id, updates) => {
      calls.push(['updateComponent', id, updates]);
      if (options.updateComponentReject) return Promise.reject(new Error('update failed'));
      return options.updateComponentResult ?? true;
    },
    addEssence: (name, description, icon, sourceComponentId) => {
      calls.push(['addEssence', name, description, icon, sourceComponentId]);
      if (options.addEssenceReject) return Promise.reject(new Error('add failed'));
      return options.addEssenceResult ?? true;
    },
    updateEssence: (id, updates) => {
      calls.push(['updateEssence', id, updates]);
      if (options.updateEssenceReject) return Promise.reject(new Error('update failed'));
      return options.updateEssenceResult ?? true;
    },
    removeEssence: (id) => calls.push(['removeEssence', id]),
    addCategory: (value) => {
      calls.push(['addCategory', value]);
      if (options.addCategoryReject) return Promise.reject(new Error('add category failed'));
      return options.addCategoryResult ?? true;
    },
    removeCategory: (value) => calls.push(['removeCategory', value]),
    addTag: (value) => {
      calls.push(['addTag', value]);
      if (options.addTagReject) return Promise.reject(new Error('add tag failed'));
      return options.addTagResult ?? true;
    },
    removeTag: (value) => calls.push(['removeTag', value]),
    confirmDiscardDirtyEssenceDraft: () => {
      calls.push(['confirmDiscardDirtyEssenceDraft']);
      return options.confirmDiscardEssenceResult ?? true;
    },
    confirmDiscardDirtyComponentDraft: () => {
      calls.push(['confirmDiscardDirtyComponentDraft']);
      return options.confirmDiscardComponentResult ?? true;
    },
    confirmDiscardDirtyGatheringTaskDraft: () => {
      calls.push(['confirmDiscardDirtyGatheringTaskDraft']);
      return options.confirmDiscardGatheringTaskResult ?? true;
    },
    confirmDiscardDirtyGatheringEventDraft: () => {
      calls.push(['confirmDiscardDirtyGatheringEventDraft']);
      return options.confirmDiscardGatheringEventResult ?? true;
    },
    selectEnvironment: (id) => {
      calls.push(['selectEnvironment', id]);
      viewState.update((state) => ({
        ...state,
        selectedEnvironmentId: id,
        environmentDraft:
          state.environments.find((environment) => environment.id === id) || state.environmentDraft,
        environmentDraftDirty: false,
        environmentValidationState: options.environmentValidationState || null,
      }));
      return viewState;
    },
    createEnvironmentDraft: () => {
      calls.push(['createEnvironmentDraft']);
      viewState.update((state) => ({
        ...state,
        selectedEnvironmentId: 'env-new',
        environmentDraft: {
          ...environmentDraft,
          id: 'env-new',
          name: 'New Gathering Environment',
          enabled: false,
        },
        environmentDraftDirty: true,
        environmentDraftIsNew: true,
      }));
      return true;
    },
    saveCraftingCheckRouted: (routed) => {
      calls.push(['saveCraftingCheckRouted', routed]);
    },
    saveCraftingCheckSimple: (simple) => {
      calls.push(['saveCraftingCheckSimple', simple]);
    },
    saveCraftingCheckActive: (enabled) => {
      calls.push(['saveCraftingCheckActive', enabled]);
    },
    saveSalvageCheckProgressive: (progressive) => {
      calls.push(['saveSalvageCheckProgressive', progressive]);
    },
    saveSalvageCheckActive: (enabled) => {
      calls.push(['saveSalvageCheckActive', enabled]);
    },
    saveGatheringCheckProgressive: (progressive) => {
      calls.push(['saveGatheringCheckProgressive', progressive]);
    },
    saveGatheringCheckRouted: (routed) => {
      calls.push(['saveGatheringCheckRouted', routed]);
    },
    saveGatheringCheckActive: (enabled) => {
      calls.push(['saveGatheringCheckActive', enabled]);
    },
    updateEnvironmentDraft: (updates) => {
      calls.push(['updateEnvironmentDraft', updates]);
      viewState.update((state) => ({
        ...state,
        environmentDraft: { ...state.environmentDraft, ...updates },
        environmentDraftDirty: true,
      }));
    },
    confirmDiscardDirtyEnvironmentDraft: () => {
      calls.push(['confirmDiscardDirtyEnvironmentDraft']);
      return options.confirmDiscardResult ?? true;
    },
    cancelEnvironmentDraft: () => {
      calls.push(['cancelEnvironmentDraft']);
      viewState.update((state) => ({
        ...state,
        environmentDraft:
          state.environments.find(
            (environment) => environment.id === state.selectedEnvironmentId
          ) || environmentDraft,
        environmentDraftDirty: false,
        environmentDraftIsNew: false,
        environmentValidationState: null,
      }));
    },
    saveEnvironmentDraft: () => calls.push(['saveEnvironmentDraft']),
    duplicateEnvironmentDraft: (id) => calls.push(['duplicateEnvironmentDraft', id]),
    deleteEnvironmentDraft: (id) => calls.push(['deleteEnvironmentDraft', id]),
    moveEnvironmentDraft: (id, direction) => calls.push(['moveEnvironmentDraft', id, direction]),
    toggleEnvironmentEnabled: (id, enabled) =>
      calls.push(['toggleEnvironmentEnabled', id, enabled]),
    addEnvironmentTask: () => calls.push(['addEnvironmentTask']),
    selectEnvironmentTask: (id) => calls.push(['selectEnvironmentTask', id]),
    updateEnvironmentTask: (id, updates) => calls.push(['updateEnvironmentTask', id, updates]),
    duplicateEnvironmentTask: (id) => calls.push(['duplicateEnvironmentTask', id]),
    deleteEnvironmentTask: (id) => calls.push(['deleteEnvironmentTask', id]),
    moveEnvironmentTask: (id, direction) => calls.push(['moveEnvironmentTask', id, direction]),
    addEnvironmentTaskResultGroup: (id) => calls.push(['addEnvironmentTaskResultGroup', id]),
    updateEnvironmentTaskResultGroup: (...args) =>
      calls.push(['updateEnvironmentTaskResultGroup', ...args]),
    deleteEnvironmentTaskResultGroup: (...args) =>
      calls.push(['deleteEnvironmentTaskResultGroup', ...args]),
    moveEnvironmentTaskResultGroup: (...args) =>
      calls.push(['moveEnvironmentTaskResultGroup', ...args]),
    addEnvironmentTaskResult: (...args) => calls.push(['addEnvironmentTaskResult', ...args]),
    updateEnvironmentTaskResult: (...args) => calls.push(['updateEnvironmentTaskResult', ...args]),
    deleteEnvironmentTaskResult: (...args) => calls.push(['deleteEnvironmentTaskResult', ...args]),
    moveEnvironmentTaskResult: (...args) => calls.push(['moveEnvironmentTaskResult', ...args]),
    updateEnvironmentTaskVisibility: (...args) =>
      calls.push(['updateEnvironmentTaskVisibility', ...args]),
    updateEnvironmentTaskResultSelection: (...args) =>
      calls.push(['updateEnvironmentTaskResultSelection', ...args]),
    updateEnvironmentTaskProgressive: (...args) =>
      calls.push(['updateEnvironmentTaskProgressive', ...args]),
    updateEnvironmentTaskCheck: (...args) => calls.push(['updateEnvironmentTaskCheck', ...args]),
    updateEnvironmentTaskTimeRequirement: (...args) =>
      calls.push(['updateEnvironmentTaskTimeRequirement', ...args]),
    updateEnvironmentTaskFailureOutcome: (...args) =>
      calls.push(['updateEnvironmentTaskFailureOutcome', ...args]),
    updateGatheringConditions: (...args) => calls.push(['updateGatheringConditions', ...args]),
    toggleGatheringConditionEnabled: (...args) =>
      calls.push(['toggleGatheringConditionEnabled', ...args]),
    addGatheringConditionValue: (...args) => calls.push(['addGatheringConditionValue', ...args]),
    updateGatheringConditionValue: (...args) =>
      calls.push(['updateGatheringConditionValue', ...args]),
    deleteGatheringConditionValue: (...args) =>
      calls.push(['deleteGatheringConditionValue', ...args]),
    addGatheringVocabularyValue: (...args) => calls.push(['addGatheringVocabularyValue', ...args]),
    updateGatheringVocabularyValue: (...args) =>
      calls.push(['updateGatheringVocabularyValue', ...args]),
    deleteGatheringVocabularyValue: (...args) =>
      calls.push(['deleteGatheringVocabularyValue', ...args]),
    setGatheringRealmsEnabled: (systemId, enabled) => {
      calls.push(['setGatheringRealmsEnabled', systemId, enabled]);
      viewState.update((state) => ({
        ...state,
        gatheringRealmSettings: { ...(state.gatheringRealmSettings || {}), enabled },
      }));
      return true;
    },
    addGatheringLibraryTask: (systemId) => {
      calls.push(['addGatheringLibraryTask', systemId]);
      return { id: 'task-new', name: 'New Gathering Task', dropRows: [] };
    },
    updateGatheringLibraryTask: (systemId, taskId, updates = {}) => {
      calls.push(['updateGatheringLibraryTask', systemId, taskId, updates]);
      viewState.update((state) => {
        const systemConfig = state.gatheringConfig?.systems?.[systemId];
        if (!systemConfig) return state;
        return {
          ...state,
          gatheringConfig: {
            ...state.gatheringConfig,
            systems: {
              ...state.gatheringConfig.systems,
              [systemId]: {
                ...systemConfig,
                tasks: systemConfig.tasks.map((task) =>
                  task.id === taskId ? { ...task, ...updates } : task
                ),
              },
            },
          },
        };
      });
      return true;
    },
    duplicateGatheringLibraryTask: (...args) => {
      calls.push(['duplicateGatheringLibraryTask', ...args]);
      return { id: 'task-copy', name: 'Gather Moon Herbs (Copy)', dropRows: [] };
    },
    deleteGatheringLibraryTask: (...args) => calls.push(['deleteGatheringLibraryTask', ...args]),
    enterToolsDraft: (systemId) => calls.push(['enterToolsDraft', systemId]),
    addToolToDraft: (...args) => calls.push(['addToolToDraft', ...args]),
    addToolFromUuidToDraft: (...args) => {
      calls.push(['addToolFromUuidToDraft', ...args]);
      return true;
    },
    updateToolInDraft: (toolId, patch = {}) => {
      calls.push(['updateToolInDraft', toolId, patch]);
      viewState.update((state) => ({
        ...state,
        toolsDraft: Array.isArray(state.toolsDraft)
          ? state.toolsDraft.map((tool) => (tool.id === toolId ? { ...tool, ...patch } : tool))
          : state.toolsDraft,
        toolsDraftDirty: true,
        toolsDraftDirtyToolIds: Array.from(
          new Set([...(state.toolsDraftDirtyToolIds || []), toolId])
        ),
      }));
      return true;
    },
    deleteToolFromDraft: (...args) => calls.push(['deleteToolFromDraft', ...args]),
    selectDraftTool: (...args) => calls.push(['selectDraftTool', ...args]),
    setExpandedDraftTool: (id = '') => {
      calls.push(['setExpandedDraftTool', id]);
      viewState.update((state) => ({
        ...state,
        toolsDraftExpandedToolId: id,
      }));
      return true;
    },
    validateToolDraft: (toolId) => {
      calls.push(['validateToolDraft', toolId]);
      return options.toolValidationById?.[toolId] || { valid: true, errors: [] };
    },
    saveToolDraft: (toolId) => {
      calls.push(['saveToolDraft', toolId]);
      viewState.update((state) => ({
        ...state,
        toolsDraftDirtyToolIds: (state.toolsDraftDirtyToolIds || []).filter((id) => id !== toolId),
        toolsDraftDirty:
          (state.toolsDraftDirtyToolIds || []).filter((id) => id !== toolId).length > 0,
      }));
      return true;
    },
    saveAllDirtyToolDrafts: () => {
      calls.push(['saveAllDirtyToolDrafts']);
      viewState.update((state) => ({
        ...state,
        toolsDraftDirtyToolIds: [],
        toolsDraftDirty: false,
      }));
      return options.saveAllDirtyToolDraftsResult ?? true;
    },
    saveToolsDraft: () => calls.push(['saveToolsDraft']),
    isToolsDraftDirty: () =>
      options.toolsDraftDirty === true || get(viewState).toolsDraftDirty === true,
    confirmDiscardDirtyToolsDraft: () => {
      calls.push(['confirmDiscardDirtyToolsDraft']);
      return options.confirmDiscardDirtyToolsResult ?? true;
    },
    cancelToolsDraft: () => {
      if (options.trackCancelToolsDraft) calls.push(['cancelToolsDraft']);
      return true;
    },
  };
}

// Mount the manager, open the Alchemy system editor, and settle the DOM. The currency editor
// tests below all repeat this exact mount + "Edit Alchemy" + flush dance and differ only in the
// `createStore` options, so it lives here instead of being inlined per test. Assigns the shared
// `mounted`/`target` so the suite's `afterEach` tears them down. Returns the captured `calls`.
async function mountCurrencyEditor(storeOptions) {
  const calls = [];
  target = document.createElement('div');
  document.body.appendChild(target);
  mounted = mount(Component, {
    target,
    props: {
      store: createStore(calls, storeOptions),
      services: { openCurrentAdmin: () => {} },
    },
  });
  flushSync();
  target.querySelector('[aria-label="Edit Alchemy"]').click();
  await Promise.resolve();
  await Promise.resolve();
  await tick();
  flushSync();
  return { calls };
}

// Mount the manager and open the tabbed System Overview page for Alchemy with an
// injected validation report. Mirrors `mountCurrencyEditor`: the same mount +
// "Edit Alchemy" + flush dance, shared `mounted`/`target` so `afterEach` cleans up.
async function mountSystemOverviewPage(systemValidation) {
  const calls = [];
  target = document.createElement('div');
  document.body.appendChild(target);
  mounted = mount(Component, {
    target,
    props: {
      // experimentalFeaturesEnabled keeps the recipe route available so a recipe
      // deep link from the Validation tab resolves to the recipe editor.
      store: createStore(calls, { systemValidation, experimentalFeaturesEnabled: true }),
      services: { openCurrentAdmin: () => {} },
    },
  });
  flushSync();
  target.querySelector('[aria-label="Edit Alchemy"]').click();
  await Promise.resolve();
  await Promise.resolve();
  await tick();
  flushSync();
  return { calls };
}

// Shared assertion for a ResolutionModeCard's option list: the rows render in the
// expected order, each wraps a real radio in the named group, and each has a
// non-empty description. Hoisted so the recipe/salvage tests stay DRY (Sonar gate).
function assertResolutionCard(card, { optionAttr, groupName, expectedValues }) {
  assert.ok(card, 'resolution-mode card should render');
  const rows = [...card.querySelectorAll(`[${optionAttr}]`)];
  assert.deepEqual(
    rows.map((row) => row.getAttribute(optionAttr)),
    expectedValues,
    'card lists its options in order'
  );
  assert.ok(
    rows.every((row) => row.querySelector(`input[type="radio"][name="${groupName}"]`)),
    'each row wraps a real radio in the group'
  );
  assert.ok(
    rows.every(
      (row) => row.querySelector('.manager-resolution-option-desc')?.textContent.trim().length > 0
    ),
    'each row has a non-empty description'
  );
  return rows;
}

describe('CraftingSystemManager mounted behavior', () => {
  before(async () => {
    setupDOM();
    globalThis.Text = document.createTextNode('').constructor;
    globalThis.Comment = document.createComment('').constructor;
    globalThis.game = {
      i18n: {
        localize: (key) => key,
        format: (key) => key,
      },
    };
    tempRoot = mkdtempSync(join(tmpdir(), 'fabricate-manager-'));
    symlinkSync(resolve(repoRoot, 'node_modules'), join(tempRoot, 'node_modules'), 'junction');
    compileManagerRoot();
    Component = (
      await import(
        pathToFileURL(
          join(tempRoot, 'src/ui/svelte/apps/manager/CraftingSystemManagerRoot.svelte.js')
        )
      )
    ).default;
    EnvironmentEditViewComponent = (
      await import(
        pathToFileURL(join(tempRoot, 'src/ui/svelte/apps/manager/EnvironmentEditView.svelte.js'))
      )
    ).default;
    ChecksRightMenuComponent = (
      await import(
        pathToFileURL(join(tempRoot, 'src/ui/svelte/apps/manager/checks/ChecksRightMenu.svelte.js'))
      )
    ).default;
    CraftingCheckEditorComponent = (
      await import(
        pathToFileURL(
          join(tempRoot, 'src/ui/svelte/apps/manager/checks/CraftingCheckEditor.svelte.js')
        )
      )
    ).default;
    SimpleCraftingCheckEditorComponent = (
      await import(
        pathToFileURL(
          join(tempRoot, 'src/ui/svelte/apps/manager/checks/SimpleCraftingCheckEditor.svelte.js')
        )
      )
    ).default;
    ProgressiveCraftingCheckEditorComponent = (
      await import(
        pathToFileURL(
          join(
            tempRoot,
            'src/ui/svelte/apps/manager/checks/ProgressiveCraftingCheckEditor.svelte.js'
          )
        )
      )
    ).default;
    RecipeOverviewTabComponent = (
      await import(
        pathToFileURL(
          join(tempRoot, 'src/ui/svelte/apps/manager/recipe/RecipeOverviewTab.svelte.js')
        )
      )
    ).default;
    SystemEditViewComponent = (
      await import(
        pathToFileURL(join(tempRoot, 'src/ui/svelte/apps/manager/SystemEditView.svelte.js'))
      )
    ).default;
    CraftingSettingsViewComponent = (
      await import(
        pathToFileURL(join(tempRoot, 'src/ui/svelte/apps/manager/CraftingSettingsView.svelte.js'))
      )
    ).default;
    ToolsBrowserViewComponent = (
      await import(
        pathToFileURL(join(tempRoot, 'src/ui/svelte/apps/manager/ToolsBrowserView.svelte.js'))
      )
    ).default;
    ChecksViewComponent = (
      await import(
        pathToFileURL(join(tempRoot, 'src/ui/svelte/apps/manager/checks/ChecksView.svelte.js'))
      )
    ).default;
  });

  afterEach(() => {
    if (mounted) {
      unmount(mounted);
      mounted = null;
    }
    target?.remove();
    target = null;
  });

  after(() => {
    rmSync(tempRoot, { recursive: true, force: true });
    teardownDOM();
    delete globalThis.game;
  });

  it('renders the three-region systems shell with selected inspector data', () => {
    target = document.createElement('div');
    document.body.appendChild(target);
    mounted = mount(Component, {
      target,
      props: {
        store: createStore(),
        services: { openCurrentAdmin: () => {} },
      },
    });
    flushSync();

    assert.ok(target.querySelector('.fabricate-manager'));
    assert.ok(target.querySelector('.manager-rail'));
    assert.ok(target.querySelector('.manager-main'));
    assert.ok(target.querySelector('.manager-inspector'));
    assert.equal(target.querySelectorAll('.manager-system-row').length, 2);
    assert.equal(target.querySelectorAll('.manager-table-head [role="columnheader"]').length, 4);
    assert.equal(target.querySelectorAll('.manager-count-cluster').length, 0);
    assert.ok(target.querySelector('.manager-breadcrumbs'));
    assert.equal(target.querySelector('.manager-header .manager-heading > .manager-kicker'), null);
    assert.equal(target.textContent.includes('Systems View'), false);
    assert.equal(target.querySelector('.manager-section-header .manager-action-group'), null);
    assert.equal(target.textContent.includes('Quick actions'), false);
    assert.deepEqual(
      Array.from(target.querySelectorAll('.manager-nav-label')).map((label) =>
        label.textContent.trim()
      ),
      [
        'System Overview',
        'Components',
        'Tags & Categories',
        'Essences',
        'Tools',
        'Checks',
        'Gathering',
        'Recipes',
        'Graph',
      ]
    );
    assert.equal(
      Array.from(target.querySelectorAll('.manager-header-actions .manager-button')).some(
        (button) => button.textContent.includes('Open current admin')
      ),
      false,
      'system library header should not expose the legacy admin launch button'
    );
    // The standalone "Overview" nav item was folded into the renamed "System
    // Overview" nav item, which now carries the open-validation-issue badge.
    const systemOverviewNav = Array.from(target.querySelectorAll('.manager-nav-button')).find(
      (button) =>
        button.querySelector('.manager-nav-label')?.textContent.trim() === 'System Overview'
    );
    assert.ok(systemOverviewNav, 'system overview nav button should render');
    assert.ok(
      systemOverviewNav.querySelector('.fas.fa-clipboard-check'),
      'system overview nav should use the validation clipboard icon'
    );
    assert.equal(
      Array.from(target.querySelectorAll('.manager-nav-button[data-nav-system-overview]')).length,
      0,
      'the standalone Overview nav item should be removed'
    );
    const toolsNav = Array.from(target.querySelectorAll('.manager-nav-button')).find(
      (button) => button.querySelector('.manager-nav-label')?.textContent.trim() === 'Tools'
    );
    assert.equal(toolsNav.querySelector('.manager-nav-count')?.textContent.trim(), '0');
    assert.ok(target.textContent.includes('Alchemy'));
    assert.ok(target.textContent.includes('Potion and essence work'));
    assert.ok(target.textContent.includes('4'));
    assert.ok(target.textContent.includes('2'));

    const environmentFact = target.querySelector('[data-count-id="environments"]');
    assert.equal(
      environmentFact.textContent.trim().replace(/\s+/g, ' '),
      '2 Gathering environments'
    );
    assert.equal(
      environmentFact.querySelector('.manager-fact-leading')?.textContent.trim(),
      '2 Gathering'
    );
    assert.equal(
      environmentFact.querySelector('.manager-fact-label')?.textContent.trim(),
      'environments'
    );

    const systemHeroRow = target.querySelector(
      '.manager-inspector .manager-inspector-title-row.is-hero-large'
    );
    assert.ok(systemHeroRow, 'systems inspector should use the prominent hero title row');
    assert.ok(
      systemHeroRow.querySelector('.manager-inspector-icon.is-hero-large'),
      'systems inspector hero should render the icon at hero-large size'
    );
  });

  it('keeps experimental selected-system routes disabled by default', async () => {
    const calls = [];
    target = document.createElement('div');
    document.body.appendChild(target);
    mounted = mount(Component, {
      target,
      props: {
        store: createStore(calls),
        services: { openCurrentAdmin: () => {} },
      },
    });
    flushSync();

    const plannedButtons = ['Recipes', 'Graph'].map((label) => navButton(label));
    assert.equal(target.querySelector('.fabricate-manager').dataset.managerView, 'systems');
    assert.deepEqual(
      plannedButtons.map((button) => button?.disabled === true),
      [true, true]
    );
    assert.deepEqual(
      plannedButtons.map((button) =>
        button?.querySelector('.manager-nav-count')?.textContent.trim()
      ),
      ['Soon', 'Soon']
    );

    navButton('Recipes').click();
    await tick();
    flushSync();

    assert.equal(target.querySelector('.fabricate-manager').dataset.managerView, 'systems');
    assert.equal(target.querySelector('.manager-recipes-table'), null);
    assert.deepEqual(calls, []);
  });

  it('routes the Checks nav to a four-tab view with a tab-aware context menu', async () => {
    target = document.createElement('div');
    document.body.appendChild(target);
    mounted = mount(Component, {
      target,
      props: {
        store: createStore(),
        services: { openCurrentAdmin: () => {} },
      },
    });
    flushSync();

    const checksNav = navButton('Checks');
    assert.ok(checksNav, 'a real Checks nav button should render');
    assert.equal(
      checksNav.disabled,
      false,
      'Checks should be an active route, not a Soon placeholder'
    );
    assert.ok(checksNav.querySelector('i.fa-dice-d20'), 'Checks nav should use the d20 die icon');

    checksNav.click();
    await tick();
    flushSync();

    assert.equal(target.querySelector('.fabricate-manager').dataset.managerView, 'checks');
    assert.deepEqual(
      Array.from(target.querySelectorAll('[data-checks-tab-button]')).map((button) =>
        button.textContent.trim()
      ),
      ['Crafting', 'Salvage', 'Gathering', 'Validation']
    );

    // The Crafting tab renders a single editor (the default fixture is alchemy mode,
    // which authors a simple pass/fail check) — not a create-a-list surface — and its
    // docs help card sits in the right menu.
    const craftingPanel = target.querySelector('[data-checks-panel="crafting"]');
    assert.ok(craftingPanel, 'Crafting panel should be the default');
    assert.ok(
      craftingPanel.querySelector('[data-simple-check-editor]'),
      'alchemy crafting shows the simple check editor'
    );
    assert.equal(
      target.querySelector('.manager-header-actions [data-checks-create]'),
      null,
      'a singleton check has no create action'
    );
    const craftingHelp = target.querySelector('[data-checks-help="crafting"]');
    assert.ok(craftingHelp, 'Crafting tab shows its docs help card');
    assert.ok(
      craftingHelp.classList.contains('manager-setup-card'),
      'help card reuses the recipe setup-card format'
    );
    const craftingDocs = craftingHelp.querySelector(
      'a[href="https://mistersilver-uk.github.io/fabricate/crafting-checks"]'
    );
    assert.ok(craftingDocs, 'crafting help card links to the crafting-checks docs page');
    assert.equal(craftingDocs.getAttribute('target'), '_blank');
    assert.equal(craftingDocs.getAttribute('rel'), 'noreferrer');
    assert.equal(
      target.querySelector('.manager-environment-workspace.is-inspector-hidden'),
      null,
      'the context menu column should be visible on the Crafting tab'
    );

    // Salvage is its own singleton page with its own docs link.
    target.querySelector('[data-checks-tab-button="salvage"]').click();
    await tick();
    flushSync();
    const salvagePanel = target.querySelector('[data-checks-panel="salvage"]');
    // Salvage (simple resolution mode by default) now renders the shared simple
    // check editor with the recipe-specific DC source hidden.
    assert.ok(
      salvagePanel.querySelector('[data-simple-check-editor]'),
      'salvage simple mode shows the simple check editor'
    );
    assert.equal(
      salvagePanel.querySelector('[data-dc-mode-option]'),
      null,
      'salvage hides the recipe-specific DC source section'
    );
    assert.ok(
      target
        .querySelector('[data-checks-help="salvage"]')
        ?.querySelector('a[href="https://mistersilver-uk.github.io/fabricate/salvage"]'),
      'salvage help card links to the salvage docs page'
    );

    // Gathering page (default fixture economy is d100) renders the read-only card
    // reflecting the d100-is-the-roll framing and links to its docs.
    target.querySelector('[data-checks-tab-button="gathering"]').click();
    await tick();
    flushSync();
    const gatheringPanel = target.querySelector('[data-checks-panel="gathering"]');
    assert.ok(
      gatheringPanel.hasAttribute('data-gathering-d100-readonly'),
      'd100 gathering renders the read-only card, not an editor'
    );
    assert.equal(
      gatheringPanel.querySelector('.manager-card-title').textContent.trim(),
      'Fixed d100 roll'
    );
    assert.ok(
      gatheringPanel.textContent.includes('d100'),
      'the gathering page explains the d100 roll is the check'
    );
    assert.ok(
      target
        .querySelector('[data-checks-help="gathering"]')
        ?.querySelector(
          'a[href="https://mistersilver-uk.github.io/fabricate/gathering-environments"]'
        ),
      'gathering help card links to the gathering docs page'
    );

    // Validation spans the full width with no context menu.
    target.querySelector('[data-checks-tab-button="validation"]').click();
    await tick();
    flushSync();
    const validationPanel = target.querySelector('[data-checks-panel="validation"]');
    assert.ok(validationPanel);
    // The Validation tab now renders a per-check readiness section for every
    // in-play subsystem (alchemy fixture: crafting + salvage), replacing the old
    // "Nothing to validate yet" placeholder.
    assert.ok(
      validationPanel.querySelector('[data-checks-validation-section="crafting"]'),
      'the Validation tab renders a per-check section for the crafting check'
    );
    assert.ok(
      validationPanel.querySelector(
        '[data-checks-validation-section="crafting"] [data-check="hasRollFormula"]'
      ),
      'the crafting section lists the roll-formula readiness check'
    );
    assert.equal(
      target.querySelector('[data-checks-help]'),
      null,
      'Validation tab should not render a context menu'
    );
    assert.ok(
      target.querySelector('.manager-environment-workspace.is-inspector-hidden'),
      'Validation tab should collapse the context-menu column'
    );

    // The shared manager inspector is not rendered for the Checks view.
    assert.equal(
      target.querySelector('.manager-body > .manager-inspector'),
      null,
      'Checks view owns its own context menu, so the shared inspector is skipped'
    );
  });

  it('hides the Checks Salvage tab when the salvage feature is off', async () => {
    target = document.createElement('div');
    document.body.appendChild(target);
    mounted = mount(Component, {
      target,
      props: {
        store: createStore([], {
          selectedFeatures: {
            essences: true,
            itemTags: true,
            recipeCategories: true,
            gathering: true,
            salvage: false,
          },
        }),
        services: { openCurrentAdmin: () => {} },
      },
    });
    flushSync();
    navButton('Checks').click();
    await tick();
    flushSync();

    assert.deepEqual(
      Array.from(target.querySelectorAll('[data-checks-tab-button]')).map((button) =>
        button.textContent.trim()
      ),
      ['Crafting', 'Gathering', 'Validation'],
      'the Salvage tab is dropped when salvage is off'
    );
    assert.equal(
      target.querySelector('[data-checks-tab-button="salvage"]'),
      null,
      'no salvage tab button renders'
    );
  });

  async function mountChecksWithAlchemyCheckMode(checkMode) {
    const calls = [];
    target = document.createElement('div');
    document.body.appendChild(target);
    mounted = mount(Component, {
      target,
      props: {
        store: createStore(calls, { alchemyConfig: { checkMode } }),
        services: { openCurrentAdmin: () => {} },
      },
    });
    flushSync();
    navButton('Checks').click();
    await tick();
    flushSync();
    return calls;
  }

  it('Checks: alchemy checkMode=none renders the check-mode selector at the top and the read-only "resolves without a check" notice below, no Active toggle (issue 554)', async () => {
    await mountChecksWithAlchemyCheckMode('none');
    // The none/simple/tiered selector renders at the top of the Crafting sub-tab.
    const selector = target.querySelector(
      '[data-checks-panel="crafting"] [data-crafting-alchemy-checkmode]'
    );
    assert.ok(selector, 'the alchemy check-mode selector renders at the top of the Crafting tab');
    const selectorOptions = Array.from(
      selector.querySelectorAll('[data-crafting-alchemy-checkmode-option]')
    ).map((option) => option.getAttribute('data-crafting-alchemy-checkmode-option'));
    for (const mode of ['none', 'simple', 'tiered']) {
      assert.ok(selectorOptions.includes(mode), `check-mode option "${mode}" is offered`);
    }
    assert.ok(
      target.querySelector('[data-checks-panel="crafting"] [data-alchemy-none-readonly]'),
      'None mode renders the read-only crafting notice below the selector'
    );
    assert.equal(
      target.querySelector('[data-checks-panel="crafting"] [data-simple-check-editor]'),
      null,
      'no editor in None mode'
    );
    assert.equal(
      target.querySelector('[data-checks-active-toggle]'),
      null,
      'None mode does not offer an Active toggle'
    );
  });

  it('Checks: alchemy checkMode=simple renders the selector above the simple editor and cannot be disabled (issue 554)', async () => {
    await mountChecksWithAlchemyCheckMode('simple');
    assert.ok(
      target.querySelector('[data-checks-panel="crafting"] [data-crafting-alchemy-checkmode]'),
      'the alchemy check-mode selector renders at the top of the Crafting tab'
    );
    assert.ok(
      target.querySelector('[data-checks-panel="crafting"] [data-simple-check-editor]'),
      'Simple mode renders the simple pass/fail editor below the selector'
    );
    assert.equal(
      target.querySelector('[data-checks-active-toggle]'),
      null,
      'Simple mode is mandatory — no Active toggle'
    );
    assert.ok(
      target.querySelector('[data-checks-active-required]'),
      'Simple mode shows the cannot-be-disabled required hint'
    );
  });

  it('Checks: alchemy checkMode=tiered renders the selector above the routed editor and cannot be disabled (issue 554)', async () => {
    await mountChecksWithAlchemyCheckMode('tiered');
    assert.ok(
      target.querySelector('[data-checks-panel="crafting"] [data-crafting-alchemy-checkmode]'),
      'the alchemy check-mode selector renders at the top of the Crafting tab'
    );
    assert.ok(
      target.querySelector('[data-checks-panel="crafting"] [data-crafting-check-editor]'),
      'Tiered mode renders the routed outcome-tier editor below the selector'
    );
    assert.equal(
      target.querySelector('[data-checks-active-toggle]'),
      null,
      'Tiered mode is mandatory — no Active toggle'
    );
    assert.ok(
      target.querySelector('[data-checks-active-required]'),
      'Tiered mode shows the cannot-be-disabled required hint'
    );
  });

  it('Checks: selecting a check-mode option persists live via setAlchemyCheckMode (issue 554)', async () => {
    const calls = await mountChecksWithAlchemyCheckMode('none');
    const tieredRadio = target.querySelector(
      '[data-checks-panel="crafting"] [data-crafting-alchemy-checkmode-option="tiered"] input'
    );
    assert.ok(tieredRadio, 'the tiered option radio renders');
    tieredRadio.checked = true;
    tieredRadio.dispatchEvent(new Event('change', { bubbles: true }));
    flushSync();
    assert.deepEqual(
      calls.filter((call) => call[0] === 'setAlchemyCheckMode'),
      [['setAlchemyCheckMode', 'tiered']],
      'choosing a mode routes through the store setAlchemyCheckMode action'
    );
  });

  it('points each Checks help card at the matching documentation page', () => {
    const cases = [
      {
        activeTab: 'crafting',
        href: 'https://mistersilver-uk.github.io/fabricate/crafting-checks',
      },
      { activeTab: 'salvage', href: 'https://mistersilver-uk.github.io/fabricate/salvage' },
      {
        activeTab: 'gathering',
        href: 'https://mistersilver-uk.github.io/fabricate/gathering-environments',
      },
    ];
    for (const { activeTab, href } of cases) {
      target = document.createElement('div');
      document.body.appendChild(target);
      mounted = mount(ChecksRightMenuComponent, { target, props: { activeTab } });
      flushSync();

      const card = target.querySelector(`[data-checks-help="${activeTab}"]`);
      assert.ok(card, `${activeTab} menu renders a help card`);
      assert.ok(
        card.classList.contains('manager-setup-card'),
        'help card uses the setup-card format'
      );
      assert.ok(card.querySelector(`a[href="${href}"]`), `${activeTab} help card links to ${href}`);

      unmount(mounted);
      mounted = null;
      target.remove();
      target = null;
    }
  });

  it('renders the routed crafting check editor only when the system is in routed mode', async () => {
    const calls = [];
    target = document.createElement('div');
    document.body.appendChild(target);
    mounted = mount(Component, {
      target,
      props: {
        store: createStore(calls, {
          alchemyResolutionMode: 'routedByCheck',
          craftingCheck: {
            routed: {
              type: 'fixed',
              rollExpression: '2d6',
              relativeOutcomes: [],
              fixedOutcomes: [
                { id: 'seed1', name: 'Hit', success: true, breakTools: false, start: 1, end: 6 },
              ],
            },
          },
        }),
        services: { openCurrentAdmin: () => {} },
      },
    });
    flushSync();

    navButton('Checks').click();
    await tick();
    flushSync();

    assert.equal(target.querySelector('.fabricate-manager').dataset.managerView, 'checks');
    assert.ok(
      target.querySelector('[data-crafting-check-editor]'),
      'routed mode shows the crafting check editor'
    );
    assert.equal(
      target.querySelector('.manager-checks-page'),
      null,
      'the singleton placeholder page is replaced by the editor'
    );
    assert.equal(target.querySelectorAll('[data-check-type-option]').length, 2);
    // The editor is seeded from the selected system's persisted routed config
    // (legacy `rollExpression` migrates to the shared `rollFormula` field).
    const expressionInput = target.querySelector('[data-check-roll-formula]');
    assert.equal(expressionInput.value, '2d6');
    const rows = target.querySelectorAll('[data-outcome-row]');
    assert.equal(rows.length, 1, 'the persisted tier is rendered');
    assert.equal(rows[0].getAttribute('data-outcome-id'), 'seed1');
    assert.equal(rows[0].querySelector('[data-outcome-name]').value, 'Hit');

    // Routed mode requires the check, so the Active card shows the required hint
    // (no on/off toggle).
    assert.ok(
      target.querySelector('[data-checks-active="crafting"] [data-checks-active-required]'),
      'routed crafting check shows the required hint'
    );
    assert.equal(target.querySelector('[data-checks-active-toggle]'), null);

    // The Save button is always present, disabled until there are unsaved edits.
    const saveButtonInitial = target.querySelector('[data-checks-save]');
    assert.ok(saveButtonInitial, 'the Save button is always rendered');
    assert.ok(saveButtonInitial.disabled, 'the Save button is disabled with no unsaved edits');

    // Editing stages a change: the Save button enables and persists via the store
    // seam (not auto-saved), then the unsaved state clears.
    expressionInput.value = '2d6+1d4';
    expressionInput.dispatchEvent(new Event('input', { bubbles: true }));
    await tick();
    flushSync();
    const saveButton = target.querySelector('[data-checks-save]');
    assert.ok(saveButton, 'the Save button is present');
    assert.equal(saveButton.disabled, false, 'editing enables the Save button');

    saveButton.click();
    await tick();
    await Promise.resolve();
    flushSync();
    const saved = calls.find((call) => call[0] === 'saveCraftingCheckRouted');
    assert.ok(saved, 'Save persists the routed config through the store');
    assert.equal(saved[1].rollFormula, '2d6+1d4');
    assert.ok(
      target.querySelector('[data-checks-save]').disabled,
      'saving clears the unsaved state and re-disables the Save button'
    );
  });

  it('routedByIngredients renders the SimpleCraftingCheckEditor (no tier editor) and Save routes through the simple slot', async () => {
    const calls = [];
    target = document.createElement('div');
    document.body.appendChild(target);
    mounted = mount(Component, {
      target,
      props: {
        store: createStore(calls, {
          alchemyResolutionMode: 'routedByIngredients',
          // The RI check now lives on the shared simple pass/fail slot.
          craftingCheck: {
            simple: { rollFormula: '1d20', dc: 14, thresholdMode: 'meet', dcMode: 'static', tiers: [] },
          },
        }),
        services: { openCurrentAdmin: () => {} },
      },
    });
    flushSync();

    navButton('Checks').click();
    await tick();
    flushSync();

    const craftingPanel = target.querySelector('[data-checks-panel="crafting"]');
    assert.ok(
      craftingPanel.querySelector('[data-simple-check-editor]'),
      'routedByIngredients renders the simple pass/fail editor'
    );
    // It is NOT the routed tier editor: no relative/fixed toggle, no outcome-tiers
    // table, no "Recipes do not have a DC" fixed-mode notice.
    assert.equal(
      craftingPanel.querySelector('[data-crafting-check-editor]'),
      null,
      'the routed tier editor is not rendered for routedByIngredients'
    );
    assert.equal(
      craftingPanel.querySelector('[data-check-type-option]'),
      null,
      'no relative/fixed type toggle'
    );
    assert.equal(
      craftingPanel.querySelector('[data-outcome-row]'),
      null,
      'no outcome-tiers table'
    );
    // The DC + static/dynamic DC source are shown (pass/fail gate uses the DC).
    assert.ok(
      craftingPanel.querySelector('[data-dc-mode-option]'),
      'the simple editor shows the static/dynamic DC source'
    );
    const formulaInput = craftingPanel.querySelector('[data-check-roll-formula]');
    assert.equal(formulaInput.value, '1d20', 'seeded from craftingCheck.simple');

    // Save routes through the simple slot, not the routed slot.
    formulaInput.value = '1d20+2';
    formulaInput.dispatchEvent(new Event('input', { bubbles: true }));
    await tick();
    flushSync();
    target.querySelector('[data-checks-save]').click();
    await tick();
    await Promise.resolve();
    flushSync();
    assert.ok(
      calls.find((call) => call[0] === 'saveCraftingCheckSimple'),
      'Save persists the routedByIngredients check through the simple slot'
    );
    assert.equal(
      calls.some((call) => call[0] === 'saveCraftingCheckRouted'),
      false,
      'routedByIngredients never saves through the routed slot'
    );
  });

  it('reseeds the crafting-check drafts on a same-system resolution-mode switch across the RI boundary', async () => {
    const calls = [];
    const store = createStore(calls, {
      alchemyResolutionMode: 'routedByIngredients',
      craftingCheck: {
        simple: { rollFormula: '1d20', dc: 14, thresholdMode: 'meet', dcMode: 'static', tiers: [] },
        routed: { rollFormula: '', type: 'relative', relativeOutcomes: [], fixedOutcomes: [] },
      },
    });
    target = document.createElement('div');
    document.body.appendChild(target);
    mounted = mount(Component, {
      target,
      props: { store, services: { openCurrentAdmin: () => {} } },
    });
    flushSync();

    navButton('Checks').click();
    await tick();
    flushSync();

    // Initially routedByIngredients → the simple editor, seeded from the simple slot.
    let craftingPanel = target.querySelector('[data-checks-panel="crafting"]');
    assert.ok(craftingPanel.querySelector('[data-simple-check-editor]'));

    // Switch the SAME system to routedByCheck with a persisted routed formula. The
    // reseed guard must re-read both crafting-check slots so the routed editor shows
    // the persisted routed formula (not a stale/empty draft).
    store.viewState.update((state) => ({
      ...state,
      selectedSystem: {
        ...state.selectedSystem,
        resolutionMode: 'routedByCheck',
        craftingCheck: {
          simple: state.selectedSystem.craftingCheck.simple,
          routed: {
            rollFormula: '2d8+1',
            type: 'relative',
            relativeOutcomes: [],
            fixedOutcomes: [],
          },
        },
      },
    }));
    await tick();
    flushSync();

    craftingPanel = target.querySelector('[data-checks-panel="crafting"]');
    assert.ok(
      craftingPanel.querySelector('[data-crafting-check-editor]'),
      'routedByCheck now renders the routed tier editor'
    );
    assert.equal(
      craftingPanel.querySelector('[data-check-roll-formula]').value,
      '2d8+1',
      'the routed draft was reseeded from the persisted routed slot (no data-loss)'
    );
  });

  it('Checks Save is tab-aware: edits and persists the salvage progressive award mode', async () => {
    const calls = [];
    target = document.createElement('div');
    document.body.appendChild(target);
    mounted = mount(Component, {
      target,
      props: {
        store: createStore(calls, {
          salvageResolutionMode: 'progressive',
          salvageCraftingCheck: {
            enabled: true,
            progressive: { awardMode: 'equal', allowPlayerReorder: true },
          },
        }),
        services: { openCurrentAdmin: () => {} },
      },
    });
    flushSync();

    navButton('Checks').click();
    await tick();
    flushSync();

    // Switch to the Salvage sub-tab; progressive salvage reuses the crafting
    // progressive editor (formula + crits + award mode).
    target.querySelector('[data-checks-tab-button="salvage"]').click();
    await tick();
    flushSync();

    const salvageEditor = target.querySelector('[data-progressive-check-editor]');
    assert.ok(salvageEditor, 'progressive salvage shows the progressive editor');
    assert.ok(
      salvageEditor
        .querySelector('[data-award-mode-option="equal"]')
        .classList.contains('is-active'),
      'the selector is seeded from the persisted award mode'
    );

    // The Save button is present but disabled until an edit stages a change.
    assert.ok(
      target.querySelector('[data-checks-save]')?.disabled,
      'the Save button is disabled with no unsaved edits'
    );

    // Change the award mode; the shared (tab-aware) Save button enables.
    salvageEditor.querySelector('[data-award-mode-option="exceed"] input').click();
    await tick();
    flushSync();
    const saveButton = target.querySelector('[data-checks-save]');
    assert.ok(saveButton, 'the Save button is present');
    assert.equal(saveButton.disabled, false, 'editing the salvage award mode enables the Save button');

    saveButton.click();
    await tick();
    await Promise.resolve();
    flushSync();

    // The header Save routes to the SALVAGE seam (not crafting) because the salvage
    // sub-tab is active.
    const saved = calls.find((call) => call[0] === 'saveSalvageCheckProgressive');
    assert.ok(saved, 'Save persists the salvage progressive config through the store');
    assert.equal(saved[1].awardMode, 'exceed', 'the new award mode is sent');
    // Issue 651 retired the system-level reorder flag: the draft clone no longer
    // carries it, so a legacy stored value is not written back on save.
    assert.equal(
      saved[1].allowPlayerReorder,
      undefined,
      'the retired allowPlayerReorder is not sent'
    );
    assert.equal(
      calls.find((call) => call[0] === 'saveCraftingCheckProgressive'),
      undefined,
      'the salvage tab does not call the crafting save seam'
    );
    assert.ok(
      target.querySelector('[data-checks-save]').disabled,
      'saving clears the unsaved state and re-disables the Save button'
    );
  });

  it('Checks Gathering tab in d100 economy mode renders the read-only card and no editor', async () => {
    const calls = [];
    target = document.createElement('div');
    document.body.appendChild(target);
    mounted = mount(Component, {
      target,
      props: {
        store: createStore(calls, { gatheringResolutionMode: 'd100' }),
        services: { openCurrentAdmin: () => {} },
      },
    });
    flushSync();

    navButton('Checks').click();
    await tick();
    flushSync();
    target.querySelector('[data-checks-tab-button="gathering"]').click();
    await tick();
    flushSync();

    const panel = target.querySelector('[data-checks-panel="gathering"]');
    assert.ok(
      panel.hasAttribute('data-gathering-d100-readonly'),
      'd100 mode renders the read-only card'
    );
    assert.equal(
      panel.querySelector('[data-progressive-check-editor]'),
      null,
      'd100 mode renders no progressive editor'
    );
    assert.equal(
      panel.querySelector('[data-crafting-check-editor]'),
      null,
      'd100 mode renders no routed editor'
    );
    // d100 is the fixed roll: the Active card shows the read-only note, no toggle.
    assert.ok(
      target.querySelector('[data-checks-active="gathering"] [data-checks-active-required]'),
      'd100 gathering shows the read-only required hint'
    );
    assert.equal(
      target.querySelector('[data-checks-active="gathering"] [data-checks-active-toggle]'),
      null,
      'd100 gathering offers no Active toggle'
    );
  });

  it('Checks Gathering tab in progressive economy mode renders the progressive editor and saves', async () => {
    const calls = [];
    target = document.createElement('div');
    document.body.appendChild(target);
    mounted = mount(Component, {
      target,
      props: {
        store: createStore(calls, {
          gatheringResolutionMode: 'progressive',
          gatheringCraftingCheck: {
            enabled: true,
            progressive: { awardMode: 'equal', allowPlayerReorder: true },
          },
        }),
        services: { openCurrentAdmin: () => {} },
      },
    });
    flushSync();

    navButton('Checks').click();
    await tick();
    flushSync();
    target.querySelector('[data-checks-tab-button="gathering"]').click();
    await tick();
    flushSync();

    const panel = target.querySelector('[data-checks-panel="gathering"]');
    assert.ok(
      panel.hasAttribute('data-gathering-d100-readonly') === false,
      'progressive mode is not the read-only card'
    );
    const editor = panel.querySelector('[data-progressive-check-editor]');
    assert.ok(editor, 'progressive gathering shows the progressive editor');
    assert.ok(
      editor.querySelector('[data-award-mode-option="equal"]').classList.contains('is-active'),
      'the editor is seeded from the persisted award mode'
    );

    // The Save button is present but disabled until an edit stages a change.
    assert.ok(
      target.querySelector('[data-checks-save]')?.disabled,
      'the Save button is disabled with no unsaved edits'
    );

    editor.querySelector('[data-award-mode-option="exceed"] input').click();
    await tick();
    flushSync();
    const saveButton = target.querySelector('[data-checks-save]');
    assert.ok(saveButton, 'the Save button is present');
    assert.equal(saveButton.disabled, false, 'editing the gathering award mode enables the Save button');

    saveButton.click();
    await tick();
    await Promise.resolve();
    flushSync();

    const saved = calls.find((call) => call[0] === 'saveGatheringCheckProgressive');
    assert.ok(saved, 'Save persists the gathering progressive config through the store');
    assert.equal(saved[1].awardMode, 'exceed', 'the new award mode is sent');
    // Issue 651 retired the system-level reorder flag: the draft clone no longer
    // carries it, so a legacy stored value is not written back on save.
    assert.equal(
      saved[1].allowPlayerReorder,
      undefined,
      'the retired allowPlayerReorder is not sent'
    );
    assert.equal(
      calls.find((call) => call[0] === 'saveSalvageCheckProgressive'),
      undefined,
      'the gathering tab does not call the salvage save seam'
    );
  });

  it('Checks Gathering tab in routed economy mode renders the routed editor without recipe tiers', async () => {
    const calls = [];
    target = document.createElement('div');
    document.body.appendChild(target);
    mounted = mount(Component, {
      target,
      props: {
        store: createStore(calls, {
          gatheringResolutionMode: 'routed',
          gatheringCraftingCheck: {
            enabled: true,
            routed: {
              type: 'relative',
              rollFormula: '2d6',
              relativeOutcomes: [
                { id: 'seed1', name: 'Rich Vein', success: true, breakTools: false, dc: 5 },
              ],
              fixedOutcomes: [],
            },
          },
        }),
        services: { openCurrentAdmin: () => {} },
      },
    });
    flushSync();

    navButton('Checks').click();
    await tick();
    flushSync();
    target.querySelector('[data-checks-tab-button="gathering"]').click();
    await tick();
    flushSync();

    const panel = target.querySelector('[data-checks-panel="gathering"]');
    const editor = panel.querySelector('[data-crafting-check-editor]');
    assert.ok(editor, 'routed gathering shows the crafting check editor');
    // Routed gathering reuses the crafting editor with recipe tiers hidden
    // (showTiers={false}), like routed salvage.
    assert.equal(
      editor.querySelector('[data-routed-tiers]'),
      null,
      'routed gathering hides the recipe tiers card'
    );
    assert.equal(panel.querySelector('[data-check-roll-formula]').value, '2d6');

    // Editing stages a change that persists via the gathering routed seam.
    const formula = panel.querySelector('[data-check-roll-formula]');
    formula.value = '2d6+1d4';
    formula.dispatchEvent(new Event('input', { bubbles: true }));
    await tick();
    flushSync();
    target.querySelector('[data-checks-save]').click();
    await tick();
    await Promise.resolve();
    flushSync();
    const saved = calls.find((call) => call[0] === 'saveGatheringCheckRouted');
    assert.ok(saved, 'Save persists the gathering routed config through the store');
    assert.equal(saved[1].rollFormula, '2d6+1d4');
  });

  it('offers an Active on/off toggle for the crafting check when resolution is simple', async () => {
    const calls = [];
    target = document.createElement('div');
    document.body.appendChild(target);
    mounted = mount(Component, {
      target,
      props: {
        store: createStore(calls, {
          alchemyResolutionMode: 'simple',
          craftingCheck: { enabled: false },
        }),
        services: { openCurrentAdmin: () => {} },
      },
    });
    flushSync();

    navButton('Checks').click();
    await tick();
    flushSync();

    // Simple mode: the check is optional, so the Active card offers an on/off toggle
    // and the central column is the singleton page (not the routed editor).
    const toggle = target.querySelector(
      '[data-checks-active="crafting"] [data-checks-active-toggle]'
    );
    assert.ok(toggle, 'optional crafting check shows the Active toggle');
    assert.equal(target.querySelector('[data-checks-active-required]'), null);
    assert.equal(target.querySelector('[data-crafting-check-editor]'), null);

    toggle.click();
    await tick();
    flushSync();
    const toggled = calls.find((call) => call[0] === 'saveCraftingCheckActive');
    assert.ok(toggled, 'toggling Active persists through the store');
    assert.equal(toggled[1], true, 'enabling the check sends true');
  });

  it('crafting check editor (relative): formula/DC/comparison, unified triggers, recipe tiers, and outcomes', () => {
    const emitted = [];
    const value = {
      type: 'relative',
      rollFormula: '2d6+1d4',
      dc: 14,
      thresholdMode: 'meet',
      tiers: [],
      checkBreakage: { triggers: [] },
      relativeOutcomes: [
        { id: 'a1b2c3d4ef', name: 'Fail', success: false, breakTools: true, dc: -2 },
      ],
      fixedOutcomes: [
        { id: 'fx1', name: 'Range', success: true, breakTools: false, start: 1, end: 6 },
      ],
    };
    target = document.createElement('div');
    document.body.appendChild(target);
    mounted = mount(CraftingCheckEditorComponent, {
      target,
      props: { value, onChange: (next) => emitted.push(next) },
    });
    flushSync();

    // Routed mirrors simple: a formula/DC/comparison row and the always-rendered
    // unified trigger editor (replacing the old per-die crit table).
    assert.equal(target.querySelector('[data-check-roll-formula]').value, '2d6+1d4');
    assert.equal(target.querySelector('[data-check-dc]').value, '14');
    assert.ok(target.querySelector('[data-threshold-mode]'), 'comparison select renders');
    assert.ok(target.querySelector('[data-check-triggers]'), 'the unified trigger editor renders');
    assert.equal(target.querySelector('[data-crit-group]'), null, 'the old crit table is gone');
    // Relative checks expose recipe tiers (DC overrides); fixed checks do not.
    assert.ok(
      target.querySelector('[data-routed-tiers]'),
      'relative mode shows the recipe tiers card'
    );

    // Column labels live in the table header, not on every row. Under toolSpecific
    // authority (the default here) the per-outcome Break tools column is hidden.
    assert.deepEqual(
      [...target.querySelectorAll('.manager-checks-outcome-head [role="columnheader"]')]
        .map((cell) => cell.textContent.trim())
        .filter(Boolean),
      ['Name', 'DC ±', 'Outcome']
    );
    assert.ok(target.querySelector('[data-outcome-dc]'), 'relative tiers expose a DC field');
    assert.equal(
      target.querySelector('[data-outcome-start]'),
      null,
      'relative tiers do not expose a fixed range'
    );

    // The generated id is kept on the row but never printed (secret).
    const row = target.querySelector('[data-outcome-row]');
    assert.equal(row.getAttribute('data-outcome-id'), 'a1b2c3d4ef');
    assert.ok(!row.textContent.includes('a1b2c3'), 'the secret id is not displayed');

    // State controls are red/green pills, not raw checkboxes, and flip on click.
    const successToggle = target.querySelector('[data-outcome-success]');
    assert.equal(successToggle.tagName, 'BUTTON');
    assert.ok(
      successToggle.classList.contains('manager-checks-state-pill'),
      'the state control is a coloured pill button'
    );
    assert.equal(target.querySelector('[data-outcome-success] input'), null, 'no default checkbox');
    assert.ok(
      successToggle.textContent.includes('Failure'),
      'the pill shows the state value (Failure), not Off'
    );
    assert.ok(
      successToggle.classList.contains('is-negative'),
      'the failure state is the red/negative pill'
    );
    // The per-outcome break-tools pill is hidden under toolSpecific authority.
    assert.equal(
      target.querySelector('[data-outcome-break]'),
      null,
      'the per-outcome break column is hidden under toolSpecific'
    );
    successToggle.click();
    assert.equal(emitted.at(-1).relativeOutcomes[0].success, true, 'clicking flips success state');

    // The type selector reuses the resolution radio-option styling.
    target.querySelector('[data-check-type-option="fixed"] input').click();
    assert.equal(emitted.at(-1).type, 'fixed', 'switching type emits the new type');

    target.querySelector('[data-add-outcome]').click();
    assert.equal(emitted.at(-1).relativeOutcomes.length, 2, 'adding appends a relative tier');
    assert.ok(emitted.at(-1).relativeOutcomes.at(-1).id, 'a new tier is given a generated id');

    target.querySelector('[data-remove-outcome]').click();
    assert.equal(emitted.at(-1).relativeOutcomes.length, 0, 'removing drops the relative tier');
    assert.equal(
      emitted.at(-1).fixedOutcomes.length,
      1,
      'editing relative tiers never touches the independent fixed tiers'
    );
  });

  it('crafting check editor (fixed): bounds the value range and flags overlapping tiers', () => {
    const value = {
      type: 'fixed',
      rollExpression: '1d20',
      relativeOutcomes: [],
      fixedOutcomes: [
        { id: 'id00000001', name: 'Low', success: false, breakTools: false, start: 1, end: 12 },
        { id: 'id00000002', name: 'High', success: true, breakTools: false, start: 10, end: 20 },
      ],
    };
    target = document.createElement('div');
    document.body.appendChild(target);
    mounted = mount(CraftingCheckEditorComponent, { target, props: { value, onChange: () => {} } });
    flushSync();

    assert.ok(target.querySelector('[data-outcome-start]'), 'fixed tiers expose a range');
    assert.equal(target.querySelector('[data-outcome-dc]'), null, 'fixed tiers hide the DC field');
    assert.equal(
      target.querySelector('[data-expression-range]'),
      null,
      'no value range is computed (the roll may reference actor data)'
    );
    // Inline textual validation moved to the Checks Validation tab; the editor
    // keeps only the per-row invalid highlight as a localized affordance.
    assert.equal(
      target.querySelector('[data-checks-validation]'),
      null,
      'the editor no longer renders inline validation messages'
    );
    assert.equal(
      target.querySelectorAll('.manager-checks-outcome-row.is-invalid').length,
      2,
      'both overlapping tiers still get the per-row invalid highlight'
    );
  });

  it('crafting check editor: no longer surfaces tier validation inline (moved to the Validation tab)', () => {
    const value = {
      type: 'relative',
      rollFormula: '1d20',
      dc: 15,
      relativeOutcomes: [
        { id: 'id00000001', name: 'Success', success: true, breakTools: false, dc: 0 },
        { id: 'id00000002', name: '   ', success: false, breakTools: false, dc: -5 },
      ],
      fixedOutcomes: [],
    };
    target = document.createElement('div');
    document.body.appendChild(target);
    mounted = mount(CraftingCheckEditorComponent, { target, props: { value, onChange: () => {} } });
    flushSync();

    // The unnamed-tier (and no-Success) messages are surfaced by the Checks
    // Validation tab now; the editor itself renders no inline validation list.
    assert.equal(
      target.querySelector('[data-checks-validation]'),
      null,
      'the editor no longer renders the inline unnamed-tier validation message'
    );
  });

  it('simple check editor: threshold + comparison, unified triggers, tiers, and macro modes', () => {
    const emitted = [];
    const value = {
      rollFormula: '1d20+@abilities.int.mod',
      dc: 12,
      thresholdMode: 'meet',
      dcMode: 'static',
      tiers: [{ id: 'tier1', name: 'Hard', dc: 18 }],
      macroUuid: null,
      // Two unified triggers: a forced failure and a forced success on the d20 total.
      checkBreakage: {
        triggers: [
          { id: 'c1', condition: { type: 'diceGroup', groupId: 0, aggregate: 'total', operator: '==', value: 1 }, outcome: 'failure', breakTools: false },
          { id: 'c2', condition: { type: 'diceGroup', groupId: 0, aggregate: 'total', operator: '==', value: 20 }, outcome: 'success', breakTools: false },
        ],
      },
    };
    target = document.createElement('div');
    document.body.appendChild(target);
    mounted = mount(SimpleCraftingCheckEditorComponent, {
      target,
      props: { value, onChange: (next) => emitted.push(next) },
    });
    flushSync();

    assert.ok(target.querySelector('[data-simple-check-editor]'));
    // DC + comparison sit on the formula line.
    assert.equal(target.querySelector('[data-check-dc]').value, '12');
    assert.equal(target.querySelector('[data-threshold-mode]').value, 'meet');

    // The old crit table is replaced by the always-rendered unified trigger editor.
    assert.equal(target.querySelector('[data-crit-group]'), null, 'the old crit table is gone');
    const triggers = target.querySelector('[data-check-triggers]');
    assert.ok(triggers, 'the unified trigger editor renders');
    assert.equal(triggers.querySelectorAll('[data-trigger]').length, 2, 'both triggers render');
    // Under toolSpecific authority the outcome toggle is available but the break pill is not.
    const c2 = triggers.querySelector('[data-trigger="c2"]');
    assert.ok(
      c2.querySelector('[data-trigger-outcome="success"]').classList.contains('is-selected'),
      'the success trigger shows the Automatic success segment selected'
    );
    assert.equal(triggers.querySelector('[data-trigger-break]'), null, 'no break pill under toolSpecific');

    // Clicking a segment emits the new outcome.
    c2.querySelector('[data-trigger-outcome="none"]').click();
    assert.equal(emitted.at(-1).checkBreakage.triggers.find((t) => t.id === 'c2').outcome, 'none');

    // Add appends a new trigger; remove drops one.
    triggers.querySelector('[data-add-trigger]').click();
    assert.equal(emitted.at(-1).checkBreakage.triggers.length, 3, 'add appends a trigger');
    triggers.querySelector('[data-trigger="c1"] [data-remove-trigger]').click();
    assert.deepEqual(
      emitted.at(-1).checkBreakage.triggers.map((t) => t.id),
      ['c2'],
      'remove drops just that trigger'
    );

    // Static mode shows the tiers table (no macro drop zone).
    assert.equal(target.querySelector('[data-tier-name]').value, 'Hard');
    assert.equal(target.querySelector('[data-check-macro-dropzone]'), null);

    target.querySelector('[data-add-tier]').click();
    assert.equal(emitted.at(-1).tiers.length, 2);
    target.querySelector('[data-remove-tier]').click();
    assert.equal(emitted.at(-1).tiers.length, 0);

    // Switching to dynamic keeps the static fields (non-destructive).
    target.querySelector('[data-dc-mode-option="dynamic"] input').click();
    assert.equal(emitted.at(-1).dcMode, 'dynamic');
    assert.equal(emitted.at(-1).dc, 12, 'shared fields are preserved');
    assert.deepEqual(emitted.at(-1).tiers, value.tiers);
  });

  it('simple check editor: dynamic mode renders a macro drop zone (threshold stays on the formula line)', () => {
    target = document.createElement('div');
    document.body.appendChild(target);
    mounted = mount(SimpleCraftingCheckEditorComponent, {
      target,
      props: {
        value: {
          rollFormula: '1d20',
          dc: 15,
          thresholdMode: 'meet',
          dcMode: 'dynamic',
          tiers: [],
          macroUuid: null,
          diceCrits: [],
        },
        onChange: () => {},
      },
    });
    flushSync();
    assert.ok(target.querySelector('[data-dynamic-dc]'));
    assert.ok(target.querySelector('[data-check-macro-dropzone]'), 'shows the macro drop zone');
    assert.equal(target.querySelector('[data-tier-name]'), null, 'no tiers table in dynamic mode');
    // The threshold is shared, so it is shown in both modes.
    assert.ok(target.querySelector('[data-check-dc]'));
  });

  it('progressive check editor: formula + unified trigger list only (no DC, comparison, tiers, or macro)', () => {
    const emitted = [];
    const value = {
      awardMode: 'equal',
      rollFormula: '2d6',
      checkBreakage: {
        triggers: [
          {
            id: 'c1',
            condition: { type: 'diceGroup', groupId: 0, aggregate: 'total', operator: '==', value: 12 },
            outcome: 'success',
            breakTools: false,
          },
          {
            id: 'c2',
            condition: { type: 'diceGroup', groupId: 0, aggregate: 'total', operator: '==', value: 2 },
            outcome: 'failure',
            breakTools: false,
          },
        ],
      },
    };
    target = document.createElement('div');
    document.body.appendChild(target);
    mounted = mount(ProgressiveCraftingCheckEditorComponent, {
      target,
      props: { value, onChange: (next) => emitted.push(next) },
    });
    flushSync();

    assert.ok(target.querySelector('[data-progressive-check-editor]'));
    // Formula field is shared, but the DC + comparison are hidden (no threshold).
    assert.ok(target.querySelector('[data-check-roll-formula]'), 'the formula field renders');
    assert.equal(target.querySelector('[data-check-dc]'), null, 'no DC field');
    assert.equal(target.querySelector('[data-threshold-mode]'), null, 'no comparison select');
    // No DC-source radios, recipe tiers, or macro drop zone.
    assert.equal(target.querySelector('[data-dc-mode-option]'), null);
    assert.equal(target.querySelector('[data-tier-name]'), null);
    assert.equal(target.querySelector('[data-check-macro-dropzone]'), null);

    // The unified trigger list renders. In the progressive (numeric) context the
    // outcome toggle is relabelled award-all/award-none rather than success/failure.
    const triggers = target.querySelector('[data-check-triggers]');
    assert.ok(triggers, 'the unified trigger editor renders');
    const c1Triggers = triggers.querySelector('[data-trigger="c1"]');
    assert.ok(
      c1Triggers.querySelector('[data-trigger-outcome="success"]').classList.contains('is-selected'),
      'the success trigger selects the award-all segment'
    );
    const optionLabels = [...c1Triggers.querySelectorAll('[data-trigger-outcome]')].map(
      (b) => b.textContent
    );
    assert.ok(optionLabels.some((label) => label.includes('Award all')), 'success reads "Award all"');
    assert.ok(optionLabels.some((label) => label.includes('Award none')), 'failure reads "Award none"');
    // Default toolSpecific authority hides the per-trigger break pill.
    assert.equal(triggers.querySelector('[data-trigger-break]'), null, 'no break pill under toolSpecific');

    // The award-mode selector renders, defaults to equal, and emits the chosen mode.
    const awardCard = target.querySelector('[data-award-mode]');
    assert.ok(awardCard, 'the award-mode card renders');
    assert.ok(
      awardCard.querySelector('[data-award-mode-option="equal"]').classList.contains('is-active'),
      'equal is the default award mode'
    );
    awardCard.querySelector('[data-award-mode-option="partial"] input').click();
    assert.equal(emitted.at(-1).awardMode, 'partial', 'selecting an award mode emits it');

    // Editing a trigger outcome preserves the carried award settings.
    c1Triggers.querySelector('[data-trigger-outcome="none"]').click();
    flushSync();
    assert.equal(
      emitted.at(-1).checkBreakage.triggers.find((t) => t.id === 'c1').outcome,
      'none',
      'clicking a segment emits the new outcome'
    );
    assert.equal(emitted.at(-1).awardMode, 'equal', 'award settings are preserved on a trigger edit');
  });

  // Tool-breakage authority UI (issue 419 recombine). Each editor accepts a
  // `breakageAuthority` prop and ALWAYS renders the unified CheckTriggers editor; the
  // per-trigger break-tools pill (and the routed per-outcome break column) is shown
  // ONLY under `checkDriven`. Mount an editor with a given authority and return the
  // emitted patches so each assertion stays DRY.
  function mountCheckEditor(EditorComponent, value, breakageAuthority, extraProps = {}) {
    target = document.createElement('div');
    document.body.appendChild(target);
    const emitted = [];
    mounted = mount(EditorComponent, {
      target,
      props: {
        value,
        breakageAuthority,
        onChange: (next) => emitted.push(next),
        ...extraProps,
      },
    });
    flushSync();
    return emitted;
  }

  const breakageTriggers = {
    triggers: [
      {
        id: 'c1',
        condition: { type: 'diceGroup', groupId: 0, aggregate: 'anyDie', operator: '==', value: 1 },
        outcome: 'failure',
        breakTools: false,
      },
    ],
  };
  const simpleBreakageValue = {
    rollFormula: '1d20',
    dc: 12,
    thresholdMode: 'meet',
    dcMode: 'static',
    tiers: [],
    macroUuid: null,
    checkBreakage: breakageTriggers,
  };
  const progressiveBreakageValue = {
    awardMode: 'equal',
    rollFormula: '2d6',
    checkBreakage: {
      triggers: [
        {
          id: 'c1',
          condition: { type: 'diceGroup', groupId: 0, aggregate: 'total', operator: '==', value: 2 },
          outcome: 'failure',
          breakTools: false,
        },
      ],
    },
  };
  const routedBreakageValue = {
    type: 'relative',
    rollFormula: '1d20',
    dc: 14,
    thresholdMode: 'meet',
    tiers: [],
    checkBreakage: breakageTriggers,
    relativeOutcomes: [{ id: 'o1', name: 'Success', success: true, breakTools: false, dc: 0 }],
    fixedOutcomes: [],
  };

  // The unified trigger editor is ALWAYS rendered, regardless of authority; only the
  // per-trigger break pill is gated. Confirm across all three editors.
  const breakageEditorCases = [
    { name: 'simple', component: () => SimpleCraftingCheckEditorComponent, value: () => simpleBreakageValue },
    {
      name: 'progressive',
      component: () => ProgressiveCraftingCheckEditorComponent,
      value: () => progressiveBreakageValue,
    },
    { name: 'routed', component: () => CraftingCheckEditorComponent, value: () => routedBreakageValue },
  ];
  for (const editorCase of breakageEditorCases) {
    it(`${editorCase.name} check editor: renders the unified triggers with no break pill under toolSpecific`, () => {
      mountCheckEditor(editorCase.component(), editorCase.value(), 'toolSpecific');
      const triggers = target.querySelector('[data-check-triggers]');
      assert.ok(triggers, 'the unified trigger editor renders under toolSpecific authority');
      // The outcome toggle is always available (forcing works under both authorities).
      assert.ok(
        triggers.querySelector('[data-trigger-outcome]'),
        'the outcome toggle renders under toolSpecific'
      );
      // The break-tools pill is gated off under toolSpecific.
      assert.equal(
        triggers.querySelector('[data-trigger-break]'),
        null,
        'the per-trigger break pill is hidden under toolSpecific'
      );
      // The free-text label input is gone entirely.
      assert.equal(
        triggers.querySelector('[data-breakage-trigger-label]'),
        null,
        'no trigger label input remains'
      );
    });

    it(`${editorCase.name} check editor: renders the unified triggers WITH the break pill under checkDriven`, () => {
      mountCheckEditor(editorCase.component(), editorCase.value(), 'checkDriven');
      const triggers = target.querySelector('[data-check-triggers]');
      assert.ok(triggers, 'the unified trigger editor renders under checkDriven authority');
      assert.ok(
        triggers.querySelector('[data-trigger-outcome]'),
        'the outcome toggle renders under checkDriven'
      );
      assert.ok(
        triggers.querySelector('[data-trigger-break]'),
        'the per-trigger break pill renders under checkDriven'
      );
    });
  }

  it('routed check editor: shows the per-outcome break-tools column only under checkDriven', () => {
    mountCheckEditor(CraftingCheckEditorComponent, routedBreakageValue, 'toolSpecific');
    assert.equal(
      target.querySelector('[data-outcome-break]'),
      null,
      'the per-outcome break-tools pill is hidden under toolSpecific'
    );

    if (mounted) unmount(mounted);
    target.remove();
    mountCheckEditor(CraftingCheckEditorComponent, routedBreakageValue, 'checkDriven');
    assert.ok(
      target.querySelector('[data-outcome-break]'),
      'the per-outcome break-tools pill renders under checkDriven'
    );
  });

  it('check triggers editor: Add seeds a default trigger and the break pill toggles breakTools', () => {
    const emitted = mountCheckEditor(
      SimpleCraftingCheckEditorComponent,
      {
        ...simpleBreakageValue,
        checkBreakage: {
          triggers: [
            { id: 'c1', condition: { type: 'rollTotal', operator: '<=', value: 3 }, outcome: 'none', breakTools: true },
          ],
        },
      },
      'checkDriven'
    );
    // Add appends a new default trigger (controlled component: the DOM reflects the
    // value prop, not the emit, so the new trigger is asserted on the emitted block).
    target.querySelector('[data-add-trigger]').click();
    flushSync();
    const added = emitted.at(-1).checkBreakage.triggers;
    assert.equal(added.length, 2, 'adding appends a trigger');
    assert.equal(added[1].outcome, 'none', 'a new trigger forces no outcome by default');
    assert.equal(added[1].breakTools, true, 'a new trigger breaks tools by default under checkDriven');

    // The existing trigger's break pill renders (checkDriven) and toggles breakTools.
    const breakPill = target.querySelector('[data-trigger="c1"] [data-trigger-break]');
    assert.ok(breakPill, 'the break pill renders under checkDriven');
    breakPill.click();
    flushSync();
    assert.equal(
      emitted.at(-1).checkBreakage.triggers.find((t) => t.id === 'c1').breakTools,
      false,
      'clicking the break pill toggles breakTools off'
    );
  });

  it('check triggers editor: disables the forcing segments for an outcomeTier condition', () => {
    mountCheckEditor(
      CraftingCheckEditorComponent,
      {
        ...routedBreakageValue,
        checkBreakage: {
          triggers: [
            {
              id: 't1',
              condition: { type: 'outcomeTier', tierIds: ['o1'], outcomeKeys: [] },
              outcome: 'none',
              breakTools: true,
            },
          ],
        },
      },
      'checkDriven'
    );
    const tierTrigger = target.querySelector('[data-trigger="t1"]');
    const successSeg = tierTrigger.querySelector('[data-trigger-outcome="success"]');
    const noneSeg = tierTrigger.querySelector('[data-trigger-outcome="none"]');
    assert.ok(successSeg, 'the outcome toggle renders for an outcomeTier trigger');
    assert.ok(successSeg.disabled, 'an outcomeTier condition disables the forcing segments');
    assert.ok(noneSeg.classList.contains('is-selected'), 'the outcome is pinned to No effect');
  });

  function mountChecksView(props) {
    target = document.createElement('div');
    document.body.appendChild(target);
    mounted = mount(ChecksViewComponent, {
      target,
      props: { resolutionMode: 'simple', craftingCheckSimple: simpleBreakageValue, ...props },
    });
    flushSync();
  }

  it('checks view: a checkDriven crafting editor shows the break pill; the gathering tab is hidden when gathering is off', () => {
    mountChecksView({
      breakageAuthority: 'checkDriven',
      features: { gathering: false },
      gatheringResolutionMode: 'routed',
      gatheringCheckRouted: routedBreakageValue,
    });
    // Crafting (always on) honours the system authority and shows the break pill.
    const craftingTriggers = target.querySelector('[data-check-triggers]');
    assert.ok(craftingTriggers, 'crafting editor renders the unified triggers');
    assert.ok(
      craftingTriggers.querySelector('[data-trigger-break]'),
      'crafting break pill renders under checkDriven authority'
    );

    // Gathering is an opt-in feature: with it off, its Checks tab is not offered at
    // all (so there is no disabled gathering editor to reach).
    assert.equal(
      target.querySelector('[data-checks-tab-button="gathering"]'),
      null,
      'the gathering tab is hidden when the gathering feature is off'
    );
  });

  it('checks view: the gathering tab is offered when the gathering feature is on', () => {
    mountChecksView({
      breakageAuthority: 'toolSpecific',
      features: { gathering: true },
      gatheringResolutionMode: 'routed',
      gatheringCheckRouted: routedBreakageValue,
    });
    const gatheringTab = target.querySelector('[data-checks-tab-button="gathering"]');
    assert.ok(gatheringTab, 'the gathering tab renders when gathering is enabled');
    gatheringTab.click();
    flushSync();
    assert.ok(
      target.querySelector('[data-checks-panel="gathering"]'),
      'the gathering panel is shown when the tab is selected'
    );
  });

  // The per-tool breakage mechanic is authority-driven (issue 419). Mount the
  // tools browser with one expanded tool and a given authority; return the
  // emitted onUpdateTool patches so each assertion stays DRY.
  function mountToolsBrowser(tool, breakageAuthority) {
    target = document.createElement('div');
    document.body.appendChild(target);
    const emitted = [];
    mounted = mount(ToolsBrowserViewComponent, {
      target,
      props: {
        tools: [tool],
        expandedToolId: tool.id,
        breakageAuthority,
        onUpdateTool: (id, patch) => emitted.push({ id, patch }),
      },
    });
    flushSync();
    return emitted;
  }

  it('tools browser: tool-specific authority offers the original three mechanics (no immune)', () => {
    const emitted = mountToolsBrowser(
      { id: 't1', name: 'Hammer', componentId: 'c1', breakage: { mode: 'limitedUses', maxUses: 3 } },
      'toolSpecific'
    );
    for (const mode of ['limitedUses', 'breakageChance', 'diceExpression']) {
      assert.ok(
        target.querySelector(`input[name="tool-t1-breakage-mode"][value="${mode}"]`),
        `the ${mode} mechanic radio renders under tool-specific authority`
      );
    }
    assert.equal(
      target.querySelector('input[name="tool-t1-breakage-mode"][value="immune"]'),
      null,
      'immune is not offered as a per-tool mechanic under tool-specific authority'
    );
    assert.ok(
      target.querySelector('.manager-tools-max-uses-input'),
      'the limited-uses field renders for a limitedUses tool'
    );
    target.querySelector('input[name="tool-t1-breakage-mode"][value="breakageChance"]').click();
    flushSync();
    assert.deepEqual(
      emitted.at(-1),
      { id: 't1', patch: { breakage: { mode: 'breakageChance', breakageChance: 0 } } },
      'selecting a mechanic persists it'
    );
  });

  it('tools browser: check-driven authority offers only breakable and immune with no fields', () => {
    const emitted = mountToolsBrowser(
      { id: 't1', name: 'Hammer', componentId: 'c1', breakage: { mode: 'limitedUses', maxUses: 3 } },
      'checkDriven'
    );
    assert.ok(
      target.querySelector('input[name="tool-t1-breakage-mode"][value="breakable"]'),
      'the breakable option renders under check-driven authority'
    );
    assert.ok(
      target.querySelector('input[name="tool-t1-breakage-mode"][value="immune"]'),
      'the immune option renders under check-driven authority'
    );
    for (const mode of ['limitedUses', 'breakageChance', 'diceExpression']) {
      assert.equal(
        target.querySelector(`input[name="tool-t1-breakage-mode"][value="${mode}"]`),
        null,
        `the ${mode} mechanic radio is hidden under check-driven authority`
      );
    }
    // A non-immune tool reads as breakable, and no mechanic fields render.
    assert.ok(
      target.querySelector('input[name="tool-t1-breakage-mode"][value="breakable"]').checked,
      'a non-immune tool is shown as breakable'
    );
    assert.equal(target.querySelector('.manager-tools-max-uses-input'), null, 'no limited-uses field');
    assert.equal(target.querySelector('input[type="range"]'), null, 'no breakage-chance slider');
    // Selecting immune emits the fields-less immune block.
    target.querySelector('input[name="tool-t1-breakage-mode"][value="immune"]').click();
    flushSync();
    assert.deepEqual(
      emitted.at(-1),
      { id: 't1', patch: { breakage: { mode: 'immune' } } },
      'selecting immune emits a breakage block with no fields'
    );
  });

  it('tools browser: check-driven breakable restores a non-immune mechanic for an immune tool', () => {
    const emitted = mountToolsBrowser(
      { id: 't1', name: 'Anvil', componentId: 'c1', breakage: { mode: 'immune' } },
      'checkDriven'
    );
    assert.ok(
      target.querySelector('input[name="tool-t1-breakage-mode"][value="immune"]').checked,
      'an immune tool is shown as immune'
    );
    target.querySelector('input[name="tool-t1-breakage-mode"][value="breakable"]').click();
    flushSync();
    assert.deepEqual(
      emitted.at(-1),
      { id: 't1', patch: { breakage: { mode: 'limitedUses', maxUses: null } } },
      'choosing breakable for an immune tool defaults to unlimited limited-uses'
    );
    // The on-break action fieldset still renders for an immune tool.
    assert.ok(
      target.querySelector('input[name="tool-t1-on-break-mode"]'),
      'the on-break action controls still render for an immune tool'
    );
  });

  it('tools browser: renders the breakage-source card header and self-describing options', () => {
    target = document.createElement('div');
    document.body.appendChild(target);
    mounted = mount(ToolsBrowserViewComponent, {
      target,
      props: { tools: [], breakageAuthority: 'checkDriven', onSetBreakageAuthority: () => {} },
    });
    flushSync();
    const authoritySection = target.querySelector('[data-manager-tools-authority]');
    assert.ok(authoritySection, 'the authority section renders');
    assert.ok(
      authoritySection.querySelector('.manager-card-title'),
      'the breakage-source card has a header title'
    );
    assert.ok(
      authoritySection.querySelector('p.manager-muted'),
      'the breakage-source card has descriptive hint text'
    );
    assert.ok(
      target.querySelector('[data-breakage-authority="checkDriven"]'),
      'the authority radio options render'
    );
    // The separate advisory line was removed; the check-driven option description
    // now carries the "except Immune" guidance instead.
    assert.equal(
      target.querySelector('[data-breakage-authority-advisory]'),
      null,
      'the standalone advisory line is gone'
    );
    const checkDrivenDesc = target.querySelector(
      '[data-breakage-authority="checkDriven"]'
    )?.parentElement?.querySelector('.manager-radio-option-desc');
    assert.ok(
      checkDrivenDesc && /immune/i.test(checkDrivenDesc.textContent),
      'the check-driven option description surfaces the immune exception'
    );
  });

  for (const mode of ['simple', 'alchemy']) {
    it(`renders the simple crafting check editor and saves it in ${mode} mode`, async () => {
      const calls = [];
      target = document.createElement('div');
      document.body.appendChild(target);
      mounted = mount(Component, {
        target,
        props: {
          store: createStore(calls, {
            alchemyResolutionMode: mode,
            craftingCheck: {
              simple: {
                rollFormula: '1d20',
                dc: 12,
                thresholdMode: 'meet',
                dcMode: 'static',
                tiers: [],
                macroUuid: null,
                diceCrits: [],
              },
            },
          }),
          services: { openCurrentAdmin: () => {} },
        },
      });
      flushSync();

      navButton('Checks').click();
      await tick();
      flushSync();

      assert.ok(
        target.querySelector('[data-simple-check-editor]'),
        `${mode} mode shows the simple check editor`
      );
      assert.equal(
        target.querySelector('[data-crafting-check-editor]'),
        null,
        'not the routed editor'
      );

      // Seeded from the persisted config; Save present but disabled until edited.
      const dcInput = target.querySelector('[data-check-dc]');
      assert.equal(dcInput.value, '12');
      assert.ok(
        target.querySelector('[data-checks-save]')?.disabled,
        'the Save button is disabled with no unsaved edits'
      );

      dcInput.value = '17';
      dcInput.dispatchEvent(new Event('input', { bubbles: true }));
      await tick();
      flushSync();
      const saveButton = target.querySelector('[data-checks-save]');
      assert.ok(saveButton, 'the Save button is present');
      assert.equal(saveButton.disabled, false, 'editing enables the Save button');

      saveButton.click();
      await tick();
      await Promise.resolve();
      flushSync();
      const saved = calls.find((call) => call[0] === 'saveCraftingCheckSimple');
      assert.ok(saved, 'Save persists the simple config through the store');
      assert.equal(saved[1].dc, 17);
      assert.ok(
        target.querySelector('[data-checks-save]').disabled,
        'saving clears the unsaved state and re-disables the Save button'
      );
    });
  }

  it('recipe overview shows the check-tier dropdown only when tiers exist and emits checkTierId', () => {
    const emitted = [];
    // No tiers ⇒ no dropdown.
    target = document.createElement('div');
    document.body.appendChild(target);
    mounted = mount(RecipeOverviewTabComponent, {
      target,
      props: {
        recipe: { id: 'r1', checkTierId: null },
        checkTierOptions: [],
        onUpdateRecipe: () => {},
      },
    });
    flushSync();
    assert.equal(target.querySelector('[data-recipe-check-tier]'), null);
    unmount(mounted);
    mounted = null;
    target.remove();

    // Tiers present ⇒ dropdown with the recipe's current selection.
    target = document.createElement('div');
    document.body.appendChild(target);
    mounted = mount(RecipeOverviewTabComponent, {
      target,
      props: {
        recipe: { id: 'r1', checkTierId: 'tier1' },
        checkTierOptions: [
          { id: 'tier1', name: 'Hard', dc: 18 },
          { id: 'tier2', name: 'Easy', dc: 8 },
        ],
        onUpdateRecipe: (patch) => emitted.push(patch),
      },
    });
    flushSync();
    const select = target.querySelector('[data-recipe-check-tier] select');
    assert.ok(select, 'dropdown renders when tiers exist');
    assert.equal(select.value, 'tier1', 'reflects the recipe selection');
    assert.equal(select.querySelectorAll('option').length, 3, 'Default + two tiers');

    select.value = 'tier2';
    select.dispatchEvent(new Event('change', { bubbles: true }));
    assert.deepEqual(emitted.at(-1), { checkTierId: 'tier2' });

    select.value = '';
    select.dispatchEvent(new Event('change', { bubbles: true }));
    assert.deepEqual(emitted.at(-1), { checkTierId: null }, 'Default clears the tier');
  });

  function mountSystemEditView(props) {
    target = document.createElement('div');
    document.body.appendChild(target);
    mounted = mount(SystemEditViewComponent, { target, props });
    flushSync();
    return target;
  }

  function mountCraftingSettingsView(props) {
    target = document.createElement('div');
    document.body.appendChild(target);
    mounted = mount(CraftingSettingsViewComponent, { target, props });
    flushSync();
    return target;
  }

  function mountRecipeOverview(props) {
    target = document.createElement('div');
    document.body.appendChild(target);
    mounted = mount(RecipeOverviewTabComponent, { target, props });
    flushSync();
    return target;
  }

  it('CraftingSettingsView renders the recipe resolution and flat visibility-mode cards', () => {
    // The recipe resolution + flat visibility-mode controls live on the gated
    // Crafting > Settings page (issue 511, PR-B). Visibility is now a single flat
    // enum (global/restricted/item/knowledge), not the old listMode card.
    const baseSystem = {
      id: 'sys1',
      name: 'System One',
      resolutionMode: 'simple',
      visibilityMode: 'knowledge',
      features: {},
      craftingEffect: {
        showAccess: false,
        showBooksScrolls: true,
        showLimitedUse: false,
        showLearningLimits: true,
        summaryKey: 'FABRICATE.Admin.Manager.Crafting.Effect.SummaryKnowledge',
      },
    };
    mountCraftingSettingsView({ selectedSystem: baseSystem });
    assert.ok(
      target.querySelector('[data-crafting-resolution-mode]'),
      'the resolution-mode card renders on Crafting Settings'
    );
    assert.ok(
      target.querySelector('[data-crafting-visibility-section]'),
      'the flat visibility-mode section renders'
    );
    // All four visibility modes are offered.
    const visibilityOptions = Array.from(
      target.querySelectorAll('[data-crafting-visibility-mode-option]')
    ).map((option) => option.getAttribute('data-crafting-visibility-mode-option'));
    for (const mode of ['global', 'restricted', 'item', 'knowledge']) {
      assert.ok(visibilityOptions.includes(mode), `visibility option "${mode}" is offered`);
    }
    // The effect panel reflects the active mode's conditional surface.
    assert.ok(
      target.querySelector('[data-crafting-settings-context] [data-crafting-effect]'),
      'the effect panel renders alongside the cards'
    );
  });

  it('CraftingSettingsView no longer renders the alchemy check-mode sub-section — it moved to the Checks tab (issue 554)', () => {
    // The alchemy check-mode selector relocated to the top of the Checks tab's
    // Crafting sub-tab, so the Crafting Settings page must not render it even for
    // an alchemy system.
    mountCraftingSettingsView({
      selectedSystem: {
        id: 'sys1',
        name: 'Alchemy System',
        resolutionMode: 'alchemy',
        visibilityMode: 'knowledge',
        alchemy: { checkMode: 'none' },
        features: {},
        craftingEffect: { summaryKey: 'FABRICATE.Admin.Manager.Crafting.Effect.SummaryKnowledge' },
      },
    });
    assert.equal(
      target.querySelector('[data-crafting-alchemy-checkmode-section]'),
      null,
      'the settings page does not render the alchemy check-mode sub-section'
    );
    assert.equal(
      target.querySelector('[data-crafting-alchemy-checkmode]'),
      null,
      'the settings page does not render the alchemy check-mode selector'
    );
    // The Recipe resolution card itself still renders on the settings page.
    assert.ok(
      target.querySelector('[data-crafting-resolution-section]'),
      'the recipe resolution section still renders on the settings page'
    );
  });

  it('SystemEditView character-prerequisites accordion renders an icon picker left of the name input (issue 544)', () => {
    mountSystemEditView({
      selectedSystem: { id: 'sys1', name: 'System One', resolutionMode: 'simple', features: {} },
      characterPrerequisiteLibrary: [
        { id: 'p1', name: 'Proficient in Arcana', icon: 'fa-solid fa-hat-wizard', path: 'skills.arc.prof.multiplier', op: 'gte', value: 1 },
      ],
    });
    const card = target.querySelector('[data-system-character-prerequisites]');
    assert.ok(card, 'the prerequisites card renders');
    // Expand the item, then the name row exposes the icon field (with the searchable
    // IconPicker trigger) before the name input.
    card.querySelector('[data-toggle-prerequisite]').click();
    flushSync();
    const iconField = target.querySelector('[data-prerequisite-icon-field]');
    assert.ok(iconField, 'the icon field renders in the expanded editor');
    assert.ok(
      iconField.querySelector('.manager-prerequisite-icon-trigger'),
      'the icon field renders the searchable IconPicker trigger'
    );
    // Icon field precedes the name input within the name row (icon is to the left).
    const row = target.querySelector('.manager-prerequisite-name-row');
    const nameInput = row.querySelector('[data-prerequisite-name]');
    assert.ok(
      iconField.compareDocumentPosition(nameInput) & Node.DOCUMENT_POSITION_FOLLOWING,
      'the icon field comes before the name input'
    );
  });

  // The per-recipe visibility card is GONE (issue 643 §2c). It was a legacy surface
  // editing legacy fields: gated on the superseded `recipeVisibility.listMode`, writing
  // `recipe.visibility { restricted, allowedUserIds }` whose canonical successor is
  // `recipe.access { characterIds, playerIds }` — owned by the Access tab. The
  // assertions below are the REMOVAL contract, not a repoint of the old editor.
  it('recipe overview no longer renders any per-recipe visibility editor', () => {
    mountRecipeOverview({
      recipe: { id: 'r1', visibility: { restricted: true, allowedUserIds: ['u1'] } },
      onUpdateRecipe: () => {},
    });
    assert.equal(
      target.querySelector('[data-recipe-section="visibility"]'),
      null,
      'the legacy visibility section is deleted, not restyled'
    );
    assert.equal(
      target.querySelector('[data-recipe-field="visibility-restricted"]'),
      null,
      'no restrict toggle'
    );
    assert.equal(
      target.querySelector('[data-recipe-visibility-users]'),
      null,
      'no allowed-users allow-list'
    );
  });

  // The Locked STATUS card is a different concept from the recipe-item locked IMAGE
  // (`data-recipe-item-locked-image`), so it deliberately sits outside that naming
  // family. `recipe.locked` was persisted and engine-honoured but written by nothing.
  it('recipe overview renders the Locked status card and toggles it in both directions', () => {
    const toggled = [];
    mountRecipeOverview({
      recipe: { id: 'r1' },
      locked: false,
      onToggleLocked: (next) => toggled.push(next),
      onUpdateRecipe: () => {},
    });
    const card = target.querySelector('[data-recipe-section="locked-status"]');
    assert.ok(card, 'the Locked status card renders');
    assert.equal(
      target.querySelector('[data-recipe-item-locked-image]'),
      null,
      'the Locked card is not the recipe-item locked-image affordance'
    );
    // The Locked card is a left-aligned status card (icon + copy + switch), not the
    // 96px image-picker media stack (`.manager-task-core-status`), which centres its
    // copy and 14ch-clamps it (issue 643).
    assert.ok(
      card.querySelector('.manager-recipe-status-card') || card.classList.contains('manager-recipe-status-card'),
      'the Locked switch and its copy sit in a status card'
    );
    assert.ok(
      card.querySelector('[data-recipe-field="locked"]'),
      'the Locked switch renders in the status card'
    );
    assert.equal(
      card.querySelector('.manager-task-core-status'),
      null,
      'a card with no image picker must not reuse the media column stack, which centres and 14ch-clamps its copy'
    );
    const toggle = target.querySelector('[data-recipe-field="locked"]');
    assert.equal(toggle.getAttribute('aria-pressed'), 'false', 'an unlocked recipe reads off');
    toggle.click();
    assert.deepEqual(toggled, [true], 'locking requests locked = true');

    unmount(mounted);
    mounted = null;
    target.remove();

    // Unlocking is never gated — a GM locks a recipe precisely while it is unfinished.
    const unlocked = [];
    mountRecipeOverview({
      recipe: { id: 'r1' },
      locked: true,
      onToggleLocked: (next) => unlocked.push(next),
      onUpdateRecipe: () => {},
    });
    const lockedToggle = target.querySelector('[data-recipe-field="locked"]');
    assert.equal(lockedToggle.getAttribute('aria-pressed'), 'true', 'a locked recipe reads on');
    assert.equal(lockedToggle.disabled, false, 'unlocking is never gated');
    lockedToggle.click();
    assert.deepEqual(unlocked, [false], 'unlocking requests locked = false');
  });

  it('renders Systems Library current gathering condition shortcuts for enabled dimensions', () => {
    const calls = [];
    target = document.createElement('div');
    document.body.appendChild(target);
    mounted = mount(Component, {
      target,
      props: {
        store: createStore(calls),
        services: { openCurrentAdmin: () => {} },
      },
    });
    flushSync();

    const card = target.querySelector('[data-systems-gathering-conditions]');
    assert.ok(card, 'selected gathering system should show condition shortcut card');
    assert.equal(card.querySelectorAll('[data-systems-gathering-condition]').length, 2);
    assert.ok(card.querySelector('[data-systems-gathering-condition="timeOfDay"]'));
    assert.ok(card.querySelector('[data-systems-gathering-condition="weather"]'));
    assert.ok(card.textContent.includes('Global conditions'));
    assert.ok(card.textContent.includes('Current time of day'));
    assert.ok(card.textContent.includes('Current weather'));
    assert.deepEqual(
      Array.from(card.querySelectorAll('[data-systems-gathering-condition="weather"] option')).map(
        (option) => option.textContent
      ),
      ['Clear Sky', 'Storm Rain']
    );

    const weatherSelect = card.querySelector('[data-systems-gathering-condition="weather"] select');
    weatherSelect.value = 'heavy-rain';
    weatherSelect.dispatchEvent(new Event('change', { bubbles: true }));
    flushSync();

    assert.deepEqual(
      calls.find((call) => call[0] === 'updateGatheringConditions'),
      ['updateGatheringConditions', { weather: 'heavy-rain', systemId: 'alchemy' }]
    );
  });

  it('hides Systems Library condition shortcuts when gathering or both condition dimensions are disabled', () => {
    target = document.createElement('div');
    document.body.appendChild(target);
    mounted = mount(Component, {
      target,
      props: {
        store: createStore([], {
          selectedFeatures: {
            essences: true,
            effectTransfer: true,
            itemTags: true,
            gathering: false,
            recipeCategories: true,
          },
        }),
        services: { openCurrentAdmin: () => {} },
      },
    });
    flushSync();
    assert.equal(target.querySelector('[data-systems-gathering-conditions]'), null);

    unmount(mounted);
    mounted = null;
    target.remove();
    target = document.createElement('div');
    document.body.appendChild(target);
    mounted = mount(Component, {
      target,
      props: {
        store: createStore([], {
          gatheringConfig: {
            systems: {
              alchemy: {
                conditions: {
                  weather: {
                    enabled: false,
                    current: 'clear',
                    values: [{ id: 'clear', label: 'Clear Sky', icon: 'fas fa-sun' }],
                  },
                  timeOfDay: {
                    enabled: false,
                    current: 'day',
                    values: [{ id: 'day', label: 'High Day', icon: 'fas fa-sun' }],
                  },
                },
              },
            },
          },
        }),
        services: { openCurrentAdmin: () => {} },
      },
    });
    flushSync();
    assert.equal(target.querySelector('[data-systems-gathering-conditions]'), null);
  });

  it('shows only the enabled Systems Library condition shortcut dimension', () => {
    target = document.createElement('div');
    document.body.appendChild(target);
    mounted = mount(Component, {
      target,
      props: {
        store: createStore([], {
          gatheringConfig: {
            systems: {
              alchemy: {
                conditions: {
                  weather: {
                    enabled: true,
                    current: 'heavy-rain',
                    values: [
                      { id: 'clear', label: 'Clear Sky', icon: 'fas fa-sun' },
                      { id: 'heavy-rain', label: 'Storm Rain', icon: 'fas fa-cloud-showers-heavy' },
                    ],
                  },
                  timeOfDay: {
                    enabled: false,
                    current: 'day',
                    values: [{ id: 'day', label: 'High Day', icon: 'fas fa-sun' }],
                  },
                },
              },
            },
          },
        }),
        services: { openCurrentAdmin: () => {} },
      },
    });
    flushSync();

    const card = target.querySelector('[data-systems-gathering-conditions]');
    assert.ok(card);
    assert.equal(card.querySelectorAll('[data-systems-gathering-condition]').length, 1);
    assert.ok(card.querySelector('[data-systems-gathering-condition="weather"]'));
    assert.equal(card.querySelector('[data-systems-gathering-condition="timeOfDay"]'), null);
  });

  it('shows the unselected systems library only when no crafting systems exist', () => {
    target = document.createElement('div');
    document.body.appendChild(target);
    mounted = mount(Component, {
      target,
      props: {
        store: createStore([], { noSystems: true }),
        services: { openCurrentAdmin: () => {} },
      },
    });
    flushSync();

    const navLabels = Array.from(target.querySelectorAll('.manager-nav-label')).map((label) =>
      label.textContent.trim()
    );
    assert.deepEqual(navLabels, []);
    assert.ok(target.textContent.includes('Crafting Systems'));
    assert.ok(target.textContent.includes('No crafting systems yet'));
    assert.ok(target.textContent.includes('Set up your first system'));
    assert.ok(
      target.textContent.includes('Create a system for one crafting discipline or ruleset.')
    );
    assert.ok(target.textContent.includes('Quickstart'));
    assert.equal(target.textContent.includes('Select a system'), false);
    assert.equal(target.querySelectorAll('.manager-setup-card').length, 1);
  });

  it('shows systems loading instead of the empty systems setup while startup is pending', () => {
    target = document.createElement('div');
    document.body.appendChild(target);
    mounted = mount(Component, {
      target,
      props: {
        store: createStore([], { noSystems: true, systemsLoading: true }),
        services: { openCurrentAdmin: () => {} },
      },
    });
    flushSync();

    assert.ok(target.textContent.includes('Loading crafting systems...'));
    assert.equal(target.textContent.includes('No crafting systems yet'), false);
    assert.equal(target.textContent.includes('Set up your first system'), false);
    assert.ok(target.querySelector('[data-systems-loading]'));
  });

  it('toggles systems library row status without selecting the row', async () => {
    const calls = [];
    target = document.createElement('div');
    document.body.appendChild(target);
    mounted = mount(Component, {
      target,
      props: {
        store: createStore(calls),
        services: { openCurrentAdmin: () => {} },
      },
    });
    flushSync();

    const smithingToggle = target.querySelector('[aria-label="Enable Smithing"]');
    assert.ok(smithingToggle, 'disabled system row should expose an enable toggle');
    assert.equal(smithingToggle.getAttribute('aria-pressed'), 'false');
    assert.ok(smithingToggle.classList.contains('is-off'));

    smithingToggle.click();
    await tick();
    flushSync();

    assert.deepEqual(calls.slice(-1), [['toggleSystemEnabled', 'smithing', true]]);
    assert.equal(
      target.querySelector('[data-system-id="alchemy"]').getAttribute('aria-selected'),
      'true'
    );
    assert.equal(
      target.querySelector('[data-system-id="smithing"]').getAttribute('aria-selected'),
      'false'
    );
    assert.equal(
      target.querySelector('[aria-label="Disable Smithing"]').getAttribute('aria-pressed'),
      'true'
    );

    const alchemyToggle = target.querySelector('[aria-label="Disable Alchemy"]');
    assert.ok(alchemyToggle, 'active system row should expose a disable toggle');
    alchemyToggle.click();
    await tick();
    flushSync();

    assert.deepEqual(calls.slice(-1), [['toggleSystemEnabled', 'alchemy', false]]);
    assert.equal(
      target.querySelector('[aria-label="Enable Alchemy"]').getAttribute('aria-pressed'),
      'false'
    );
  });

  it('feature-gates selected-system placeholder navigation', () => {
    target = document.createElement('div');
    document.body.appendChild(target);
    mounted = mount(Component, {
      target,
      props: {
        store: createStore([], { selectedFeatures: {} }),
        services: { openCurrentAdmin: () => {} },
      },
    });
    flushSync();

    assert.deepEqual(
      Array.from(target.querySelectorAll('.manager-nav-label')).map((label) =>
        label.textContent.trim()
      ),
      [
        'System Overview',
        'Components',
        'Tags & Categories',
        'Tools',
        'Checks',
        'Recipes',
        'Graph',
      ]
    );

    const environmentFact = target.querySelector('[data-count-id="environments"]');
    assert.equal(
      environmentFact.textContent.trim().replace(/\s+/g, ' '),
      'Gathering environments Off'
    );
    assert.equal(
      environmentFact.querySelector('.manager-fact-label')?.textContent.trim(),
      'Gathering environments'
    );
    assert.equal(environmentFact.querySelector('strong.is-disabled')?.textContent.trim(), 'Off');
  });

  it('routes selected-system breadcrumb to settings and returns to system library without clearing selection', async () => {
    const calls = [];
    target = document.createElement('div');
    document.body.appendChild(target);
    mounted = mount(Component, {
      target,
      props: {
        store: createStore(calls, { experimentalFeaturesEnabled: true }),
        services: { openCurrentAdmin: () => {} },
      },
    });
    flushSync();

    const recipesNav = craftingParent();
    assert.equal(recipesNav.disabled, false);
    // Parent total = 2 recipes + 2 books & scrolls items in the default fixture (issue 643).
    assert.equal(recipesNav.querySelector('.manager-nav-count')?.textContent.trim(), '4');
    for (const label of ['Graph']) {
      const plannedNav = navButton(label);
      assert.equal(plannedNav.disabled, true);
      assert.equal(plannedNav.querySelector('.manager-nav-count')?.textContent.trim(), 'Soon');
    }

    craftingParent().click();
    await tick();
    flushSync();
    assert.equal(target.querySelector('.fabricate-manager').dataset.managerView, 'recipes');

    const systemCrumb = Array.from(target.querySelectorAll('.manager-breadcrumbs button')).find(
      (button) => button.textContent.trim() === 'Alchemy'
    );
    systemCrumb.click();
    await Promise.resolve();
    await tick();
    flushSync();

    assert.equal(target.querySelector('.fabricate-manager').dataset.managerView, 'system-edit');
    assert.ok(target.querySelector('.manager-system-edit-form'));

    // The rail's crafting-system card SELECTS (issue 643): a real `<select>` naming the
    // current system and listing every other, so the GM can switch system without a
    // round trip through the system library — which the old name + icon-button card had
    // no way to do at all.
    const scopeCard = target.querySelector('.manager-scope-card');
    assert.ok(scopeCard, 'selected system scope card should render');
    const scopeSelect = scopeCard.querySelector('[data-manager-scope-select]');
    assert.ok(scopeSelect, 'the rail card should expose a system select');
    assert.equal(scopeSelect.tagName, 'SELECT');
    assert.equal(scopeSelect.value, 'alchemy', 'the select names the selected system');
    assert.ok(
      Array.from(scopeSelect.options).map((option) => option.value).includes('alchemy'),
      'the select lists the systems the manager knows about'
    );
    assert.equal(
      scopeCard.querySelector('.manager-scope-name'),
      null,
      'the static name span is retired, not merely hidden'
    );

    const returnButton = scopeCard.querySelector('.manager-scope-return');
    assert.ok(returnButton, 'selected system scope should expose a return-to-library button');
    assert.equal(returnButton.getAttribute('aria-label'), 'Return to System Library');
    assert.equal(returnButton.getAttribute('title'), 'Return to System Library');
    assert.match(returnButton.textContent, /All crafting systems/);

    const callsBeforeReturn = calls.length;
    returnButton.click();
    await Promise.resolve();
    await tick();
    flushSync();

    assert.equal(
      calls.length,
      callsBeforeReturn,
      'returning to system library should not call selectSystem'
    );
    assert.equal(target.querySelector('.fabricate-manager').dataset.managerView, 'systems');
    assert.ok(
      target.querySelector('.manager-scope-card'),
      'selected system scope should remain visible'
    );
    assert.equal(
      target.querySelector('[data-system-id="alchemy"]').getAttribute('aria-selected'),
      'true'
    );
    assert.deepEqual(
      Array.from(target.querySelectorAll('.manager-nav-label')).map((label) =>
        label.textContent.trim()
      ),
      [
        'System Overview',
        'Crafting',
        'Components',
        'Tags & Categories',
        'Essences',
        'Tools',
        'Checks',
        'Gathering',
        'Graph',
      ]
    );
    assert.ok(target.textContent.includes('System library'));
  });

  it('routes to the recipes browser with selected recipe inspector and actions', async () => {
    const calls = [];
    target = document.createElement('div');
    document.body.appendChild(target);
    mounted = mount(Component, {
      target,
      props: {
        store: createStore(calls, { experimentalFeaturesEnabled: true }),
        services: {
          openCurrentAdmin: () => {},
        },
      },
    });
    flushSync();

    craftingParent().click();
    await tick();
    flushSync();

    assert.equal(target.querySelector('.fabricate-manager').dataset.managerView, 'recipes');
    assert.equal(target.querySelectorAll('.manager-recipe-row').length, 2);
    // ONE page header, owned by the shell (issue 643). The library used to render a
    // second — kicker + "Recipe library" + a second subtitle — directly beneath the
    // shell's breadcrumb / "Recipes" / subtitle / Create block.
    assert.equal(
      target.querySelectorAll('.manager-main .manager-section-header').length,
      0,
      'the library must not stack a second page header under the shell header'
    );
    assert.ok(target.textContent.includes('Healing Draught'));
    assert.ok(target.textContent.includes('Restores a small amount of health.'));
    assert.ok(target.textContent.includes('Player visibility'));
    const enabledRecipeToggle = target.querySelector(
      '[data-recipe-id="r1"] .manager-status-toggle'
    );
    const disabledRecipeToggle = target.querySelector(
      '[data-recipe-id="r2"] .manager-status-toggle'
    );
    assert.ok(enabledRecipeToggle, 'enabled recipe row should render the shared status toggle');
    assert.ok(disabledRecipeToggle, 'disabled recipe row should render the shared status toggle');
    assert.equal(enabledRecipeToggle.getAttribute('aria-pressed'), 'true');
    assert.equal(disabledRecipeToggle.getAttribute('aria-pressed'), 'false');
    // No "On"/"Off" TEXT in the row (issue 643): the track colour is the state, the
    // aria-label names it, and the Disabled pill says it in words. A third copy on every
    // row cost ~30px of the description. The label survives everywhere else in the manager,
    // where a switch has no pill beside it.
    for (const toggle of [enabledRecipeToggle, disabledRecipeToggle]) {
      assert.equal(
        toggle.querySelector('.manager-status-toggle-label'),
        null,
        'the row switch carries no redundant On/Off text'
      );
      assert.ok(toggle.getAttribute('aria-label'), 'the switch is still named for assistive tech');
    }
    assert.equal(
      target.querySelector('[data-recipe-id="r2"] .manager-toggle input[type="checkbox"]'),
      null
    );

    target.querySelector('[data-recipe-id="r2"] .manager-recipe-identity').click();
    await tick();
    flushSync();
    assert.ok(target.querySelector('[data-recipe-id="r2"]').classList.contains('is-selected'));
    assert.ok(target.textContent.includes('Locked Elixir'));
    assert.ok(target.textContent.includes('Restricted (none selected)'));
    // r2 is incomplete AND off, so enabling it would be REFUSED — the row says that
    // rather than merely "incomplete" (issue 643 §2's four row states, rendered
    // through the shared StatusPill).
    const r2Blocked = target.querySelector('[data-recipe-id="r2"] [data-status-pill="danger"]');
    assert.ok(r2Blocked, "an incomplete, disabled recipe row should say it can't be enabled");
    assert.equal(r2Blocked.textContent.trim(), "Can't enable");
    assert.equal(
      target.querySelector('[data-recipe-id="r1"] [data-status-pill="warning"]'),
      null,
      'a complete recipe row should not render an authoring-state pill'
    );

    assert.equal(
      target.querySelector('.manager-pagination'),
      null,
      'pagination should hide while filtered row count is below the page size'
    );

    // The status filter is a segmented control (all / on / off), defaulting to `all`
    // — a default that hid rows would break the smoke harness's visible-row wait.
    assert.equal(
      target.querySelector('[data-recipe-filter-chip="status"]'),
      null,
      'no active-filter chip should show while every filter is at its default'
    );
    const offSegment = target.querySelector('[data-recipe-status-option="off"] input');
    offSegment.checked = true;
    offSegment.dispatchEvent(new Event('change', { bubbles: true }));
    await tick();
    flushSync();
    assert.equal(target.querySelectorAll('.manager-recipe-row').length, 1, 'only the off recipe remains');
    const statusChip = target.querySelector('[data-recipe-filter-chip="status"]');
    assert.ok(statusChip, 'an active filter should surface a clearable chip');
    statusChip.querySelector('.manager-recipe-chip-clear').click();
    await tick();
    flushSync();
    assert.equal(
      target.querySelector('[data-recipe-filter-chip="status"]'),
      null,
      'clearing the chip should reset the filter'
    );
    assert.equal(target.querySelectorAll('.manager-recipe-row').length, 2);

    // `Edit recipe` is the POINT of the inspector and its primary action (issue 643).
    // The panel used to offer Duplicate and Delete as visual peers and no Edit at all,
    // which made destroying the recipe the loudest thing on it.
    const inspectorActions = Array.from(
      target.querySelectorAll('.manager-recipe-browser-inspector-actions [data-recipe-action]')
    ).map((button) => button.dataset.recipeAction);
    assert.deepEqual(
      inspectorActions,
      ['duplicate', 'edit', 'delete'],
      'Duplicate (secondary), then Edit (primary), then Delete demoted below it'
    );
    // The 2x2 stat grid (issue 643, brief §3.3) answers the four questions a GM has
    // about the recipe they just clicked. Structure and Result-groups restated the row
    // itself and are gone; Ingredients, Results and the Crafting check replace them.
    for (const fact of ['ingredients', 'results', 'steps', 'check']) {
      assert.ok(
        target.querySelector(`[data-recipe-fact="${fact}"]`),
        `recipe inspector should expose the ${fact} stat`
      );
    }
    assert.ok(
      target.querySelector('.manager-recipe-stat-grid'),
      'recipe inspector should render the stat grid, not the generic fact list'
    );
    // The inspector is ONE column on the panel background, not five nested boxes: it used
    // to wrap every section in a `.manager-inspector-card` under its own <h3>, including an
    // invented "Recipe details" heading over a stat grid that needs no title.
    assert.equal(
      target.querySelectorAll('.manager-recipe-browser-inspector .manager-inspector-card').length,
      0,
      'the inspector sections are micro-labels on the panel, not nested cards'
    );
    assert.equal(
      target.querySelector('[data-recipe-inspector]').textContent.includes('Recipe details'),
      false,
      'the invented "Recipe details" heading is gone'
    );
    const heroRow = target.querySelector('.manager-recipe-browser-inspector-hero');
    assert.ok(heroRow, 'recipe inspector should lead with its hero');
    assert.equal(
      heroRow.querySelector('[data-medallion]').dataset.medallion,
      'image',
      'recipe inspector hero should render the resolved recipe image, not only a glyph'
    );

    const search = target.querySelector('.manager-toolbar input[type="search"]');
    search.value = 'elixir';
    search.dispatchEvent(new Event('input', { bubbles: true }));

    target.querySelector('[data-recipe-id="r2"] .manager-status-toggle').click();

    // Duplicate and Delete moved to the inspector (issue 643): SELECT r2 by clicking its
    // identity, then drive the inspector's Duplicate and Delete actions, which operate on
    // the selected recipe. Both keep the browser mounted; Edit is exercised separately
    // below because it navigates to the recipe-edit route.
    target.querySelector('[data-recipe-id="r2"] .manager-recipe-identity').click();
    flushSync();
    target.querySelector('.manager-recipe-browser-inspector [data-recipe-action="duplicate"]').click();
    target.querySelector('.manager-recipe-browser-inspector [data-recipe-action="delete"]').click();

    assert.deepEqual(calls.slice(-2), [
      ['duplicateRecipe', 'r2'],
      ['deleteRecipe', 'r2'],
    ]);
    assert.ok(calls.some((call) => call[0] === 'setRecipeSearch' && call[1] === 'elixir'));
    const enableCall = calls.find(
      (call) => call[0] === 'toggleRecipeEnabled' && call[1] === 'r2' && call[2] === true
    );
    assert.ok(enableCall, 'the row toggle reaches the store through the root');

    // THE CHAIN, END TO END. `RecipesBrowserView` hands its `onToggleEnabled` prop an
    // `onBlocked` sink; the ROOT must forward that third argument to
    // `store.toggleRecipeEnabled`, because supplying it is exactly what makes the real
    // store suppress its Foundry notification. Two half-proofs (the row emits it; the
    // store honours it) both stay green while the root quietly drops it — and the flash
    // dies while the toast returns. So this asserts the whole path: the store received
    // the sink, and driving that sink renders the in-window flash.
    assert.equal(
      typeof enableCall[3]?.onBlocked,
      'function',
      'the root must forward the row\'s blocked-message sink to the store — dropping it silently restores the Foundry toast'
    );
    assert.equal(
      target.querySelector('[data-recipe-flash]'),
      null,
      'nothing has been refused yet'
    );
    enableCall[3].onBlocked('This recipe has no result groups.');
    flushSync();
    const flash = target.querySelector('[data-recipe-flash]');
    assert.ok(flash, 'the refusal the store pushes back through the sink renders in-window');
    assert.equal(flash.getAttribute('role'), 'alert');
    assert.match(flash.textContent, /This recipe has no result groups\./);
    target.querySelector('[data-recipe-flash-dismiss]').click();
    flushSync();
    assert.equal(target.querySelector('[data-recipe-flash]'), null, 'the flash is dismissible');

    // The recipes header no longer renders crafting-system import/export.
    assert.ok(
      !calls.some((call) => call[0] === 'importRecipes'),
      'recipes header should not call importRecipes'
    );
    assert.ok(
      !calls.some((call) => call[0] === 'exportRecipes'),
      'recipes header should not call exportRecipes'
    );

    // Edit moved to the inspector (issue 643): r2 is already selected above, so the
    // inspector's Edit action navigates to the in-manager recipe-edit route rather than
    // calling a service callback.
    const editButton = target.querySelector(
      '.manager-recipe-browser-inspector [data-recipe-action="edit"]'
    );
    assert.ok(editButton.querySelector('.fa-pen'), 'the inspector Edit action carries the pen icon');
    editButton.click();
    await tick();
    flushSync();
    assert.equal(
      target.querySelector('.fabricate-manager').dataset.managerView,
      'recipe-edit',
      'Edit should navigate to the recipe-edit route'
    );
    assert.ok(
      target.querySelector('.manager-main [data-recipe-section="identity"]'),
      'recipe-edit renders the identity card in the central main'
    );
    // The mock system carries no recipeVisibility.knowledge.mode, so the editor
    // defaults to 'itemOrLearned' and the recipe-item card is shown in the global
    // inspector aside (not a view-internal column).
    assert.ok(
      target.querySelector('.manager-inspector [data-recipe-section="recipe-item"]'),
      'recipe-item card shows in the global inspector for the default knowledge mode'
    );
    // The recipe-edit header now follows the task/environment convention: Back to
    // recipes + Delete recipe + Save (no Cancel).
    const recipeEditButtons = Array.from(
      target.querySelectorAll('.manager-header-actions .manager-button')
    );
    assert.ok(
      !recipeEditButtons.some((button) => button.textContent.includes('Cancel')),
      'recipe-edit header should not offer a Cancel control'
    );
    const backButton = recipeEditButtons.find((button) =>
      button.textContent.includes('Back to recipes')
    );
    assert.ok(backButton, 'recipe-edit header should offer a Back to recipes control');
    backButton.click();
    await tick();
    flushSync();
    assert.equal(
      target.querySelector('.fabricate-manager').dataset.managerView,
      'recipes',
      'Back to recipes should return to the recipes browser'
    );
  });

  // Issue 643: the browser's filter / sort / group / paginate state is lifted to the
  // root so it survives the edit round-trip. Opening the editor unmounts the browser;
  // without the lift it remounted at defaults, throwing away the view the GM left. The
  // search term already persisted (it lives in the store); this proves the other controls
  // now do too — open Edit from the ROW pencil, return, and find the same view.
  it('preserves the recipe browser filters and sort across an edit round-trip', async () => {
    const calls = [];
    target = document.createElement('div');
    document.body.appendChild(target);
    mounted = mount(Component, {
      target,
      props: {
        store: createStore(calls, { experimentalFeaturesEnabled: true }),
        services: { openCurrentAdmin: () => {} },
      },
    });
    flushSync();

    craftingParent().click();
    await tick();
    flushSync();
    assert.equal(target.querySelector('.fabricate-manager').dataset.managerView, 'recipes');
    assert.equal(target.querySelectorAll('.manager-recipe-row').length, 2, 'both recipes at the default filter');

    // Filter to OFF (leaves only the disabled r2) and flip the sort to descending.
    const offSegment = target.querySelector('[data-recipe-status-option="off"] input');
    offSegment.checked = true;
    offSegment.dispatchEvent(new Event('change', { bubbles: true }));
    target.querySelector('[data-recipe-sort-direction]').click();
    await tick();
    flushSync();
    assert.deepEqual(
      Array.from(target.querySelectorAll('.manager-recipe-row')).map((row) => row.dataset.recipeId),
      ['r2'],
      'the OFF filter leaves only the disabled recipe',
    );
    assert.equal(
      target.querySelector('[data-recipe-sort-direction]').dataset.recipeSortDirection,
      'desc',
    );

    // Open the editor from the ROW's own Edit pencil (the restored primary affordance).
    target.querySelector('[data-recipe-id="r2"] [data-recipe-edit]').click();
    await tick();
    flushSync();
    assert.equal(
      target.querySelector('.fabricate-manager').dataset.managerView,
      'recipe-edit',
      'the row Edit pencil opens the recipe-edit route',
    );

    // Return via Back to recipes.
    const backButton = Array.from(
      target.querySelectorAll('.manager-header-actions .manager-button'),
    ).find((button) => button.textContent.includes('Back to recipes'));
    assert.ok(backButton, 'the editor offers Back to recipes');
    backButton.click();
    await tick();
    flushSync();

    // The browser is back with the SAME filters and sort — not reset to defaults.
    assert.equal(target.querySelector('.fabricate-manager').dataset.managerView, 'recipes');
    assert.ok(
      target.querySelector('[data-recipe-filter-chip="status"]'),
      'the status filter survived the edit round-trip',
    );
    assert.deepEqual(
      Array.from(target.querySelectorAll('.manager-recipe-row')).map((row) => row.dataset.recipeId),
      ['r2'],
      'the OFF filter is still applied after returning from the editor',
    );
    assert.equal(
      target.querySelector('[data-recipe-sort-direction]').dataset.recipeSortDirection,
      'desc',
      'the descending sort survived the edit round-trip',
    );
  });

  it('creates a recipe from the recipes header and opens the recipe-edit route', async () => {
    const calls = [];
    target = document.createElement('div');
    document.body.appendChild(target);
    mounted = mount(Component, {
      target,
      props: {
        store: createStore(calls, { experimentalFeaturesEnabled: true }),
        services: {
          openCurrentAdmin: () => {},
        },
      },
    });
    flushSync();

    craftingParent().click();
    await tick();
    flushSync();

    const createButton = Array.from(
      target.querySelectorAll('.manager-header-actions .manager-button')
    ).find((button) => button.textContent.includes('Create recipe'));
    assert.ok(createButton, 'recipes header should offer a Create recipe control');
    createButton.click();
    await tick();
    flushSync();

    assert.ok(
      calls.some((call) => call[0] === 'createRecipe'),
      'Create recipe should call store.createRecipe'
    );
    assert.equal(
      target.querySelector('.fabricate-manager').dataset.managerView,
      'recipe-edit',
      'Create recipe should open the recipe-edit route'
    );
  });

  it('shows the recipe-item inspector aside on the recipe-edit route when the knowledge mode is learned', async () => {
    const calls = [];
    target = document.createElement('div');
    document.body.appendChild(target);
    mounted = mount(Component, {
      target,
      props: {
        store: createStore(calls, {
          experimentalFeaturesEnabled: true,
          recipeKnowledgeMode: 'learned',
        }),
        services: {
          openCurrentAdmin: () => {},
        },
      },
    });
    flushSync();

    craftingParent().click();
    await tick();
    flushSync();

    // Select r2, then open the editor from the inspector's Edit action (issue 643).
    target.querySelector('[data-recipe-id="r2"] .manager-recipe-identity').click();
    await tick();
    flushSync();
    target.querySelector('.manager-recipe-browser-inspector [data-recipe-action="edit"]').click();
    await tick();
    flushSync();

    assert.equal(
      target.querySelector('.fabricate-manager').dataset.managerView,
      'recipe-edit',
      'Edit should navigate to the recipe-edit route'
    );
    assert.ok(
      target.querySelector('.manager-main [data-recipe-section="identity"]'),
      'recipe-edit still renders the identity card in the central main'
    );
    // Learning a recipe requires it to link a recipe item (the book the player
    // learns from), and this inspector is the only place that link is authored,
    // so the recipe-item card must show for 'learned' too — otherwise a
    // learned-only system has no way to make any recipe learnable.
    assert.ok(
      target.querySelector('.manager-inspector [data-recipe-section="recipe-item"]'),
      'recipe-item card shows for the learned knowledge mode'
    );
    assert.ok(
      target.querySelector('.manager-inspector'),
      'the inspector aside is present for the learned knowledge mode'
    );
    assert.ok(
      !target.textContent.includes('Edit identity for this recipe.'),
      'learned mode no longer shows the identity-only subtitle'
    );
  });

  it('stages editor edits without persisting until the header Save is pressed', async () => {
    const calls = [];
    const target = await openRecipeEditor(calls);

    editRecipeName(target, 'Greater Healing Draught');
    await tick();
    flushSync();

    // No persistence has happened yet — the edit is staged in the root-held draft.
    assert.ok(
      !calls.some((call) => call[0] === 'updateRecipe'),
      'editing does not call store.updateRecipe before Save'
    );
    // The Unsaved chip reflects the dirty draft.
    const dirtyChip = Array.from(
      target.querySelectorAll('.manager-header-actions .manager-chip.is-warning')
    ).find((chip) => chip.textContent.includes('Unsaved'));
    assert.ok(dirtyChip, 'the Unsaved chip is shown while the draft is dirty');

    // The header Save commits the whole staged draft in exactly one updateRecipe call.
    headerSaveButton(target).click();
    await tick();
    flushSync();
    const updateCalls = calls.filter((call) => call[0] === 'updateRecipe');
    assert.equal(updateCalls.length, 1, 'Save fires exactly one store.updateRecipe');
    assert.equal(updateCalls[0][1], 'r1', 'updateRecipe targets the edited recipe id');
    assert.equal(
      updateCalls[0][2].name,
      'Greater Healing Draught',
      'the committed draft carries the staged name'
    );
    assert.equal(
      target.querySelector('.fabricate-manager').dataset.managerView,
      'recipes',
      'a successful Save returns to the recipes browser'
    );
  });

  it('gives a step seeded by switching to multi-step a stable id (so step-scoped edits route to the step, not the recipe)', async () => {
    const calls = [];
    const target = await openRecipeEditor(calls, {
      selectedFeatures: {
        essences: true,
        effectTransfer: true,
        itemTags: true,
        gathering: true,
        recipeCategories: true,
        multiStepRecipes: true,
      },
    });

    // Switching a single-step recipe to multi-step seeds one step into the draft.
    // It must carry an id up front: step-scoped edits route by step id, and an
    // id-less step (undefined == null) misroutes to the recipe scope — looking
    // like the per-step ingredient/result/tool/cost adds do nothing.
    target.querySelector('.manager-inspector [data-recipe-step-mode-option="multi"]').click();
    await tick();
    flushSync();

    headerSaveButton(target).click();
    await tick();
    flushSync();

    const updateCalls = calls.filter((call) => call[0] === 'updateRecipe');
    assert.equal(updateCalls.length, 1, 'Save commits the staged multi-step draft once');
    const committed = updateCalls[0][2];
    assert.ok(
      Array.isArray(committed.steps) && committed.steps.length === 1,
      'the draft now holds one explicit step'
    );
    assert.ok(
      typeof committed.steps[0].id === 'string' && committed.steps[0].id.length > 0,
      'the seeded step carries a stable id so its scoped edits do not misroute'
    );
  });

  it('persists the enabled toggle immediately and never marks the editor dirty', async () => {
    const calls = [];
    await openRecipeEditor(calls);

    // r1 starts enabled; toggling fires toggleRecipeEnabled(false) immediately.
    target.querySelector('.manager-main [data-recipe-field="enabled"]').click();
    await tick();
    flushSync();

    const toggleCalls = calls.filter((call) => call[0] === 'toggleRecipeEnabled');
    assert.equal(
      toggleCalls.length,
      1,
      'the enabled toggle persists immediately via toggleRecipeEnabled'
    );
    assert.deepEqual(
      [toggleCalls[0][1], toggleCalls[0][2]],
      ['r1', false],
      'it disables the persisted recipe'
    );
    assert.ok(
      !calls.some((call) => call[0] === 'updateRecipe'),
      'the enabled toggle does not stage an updateRecipe'
    );

    // The toggle synced the baseline, so the editor is not dirty: no Unsaved chip.
    const dirtyChip = Array.from(
      target.querySelectorAll('.manager-header-actions .manager-chip.is-warning')
    ).find((chip) => chip.textContent.includes('Unsaved'));
    assert.equal(dirtyChip, undefined, 'toggling enabled does not mark the editor dirty');
  });

  it('does not prompt on navigation when only the enabled toggle changed', async () => {
    const calls = [];
    await openRecipeEditor(calls);

    target.querySelector('.manager-main [data-recipe-field="enabled"]').click();
    await tick();
    flushSync();

    Array.from(target.querySelectorAll('.manager-header-actions .manager-button'))
      .find((button) => button.textContent.includes('Back to recipes'))
      .click();
    await tick();
    flushSync();

    assert.ok(
      !calls.some((call) => call[0] === 'confirmDiscardDirtyRecipeDraft'),
      'no discard prompt fires after only toggling enabled'
    );
    assert.equal(
      target.querySelector('.fabricate-manager').dataset.managerView,
      'recipes',
      'navigation proceeds without a prompt'
    );
  });

  it('prompts the 3-way choice on dirty navigation and Saves on the save choice', async () => {
    const calls = [];
    const target = await openRecipeEditor(calls, { confirmDiscardRecipeResult: 'save' });

    editRecipeName(target, 'Save On Exit');
    await tick();
    flushSync();

    Array.from(target.querySelectorAll('.manager-header-actions .manager-button'))
      .find((button) => button.textContent.includes('Back to recipes'))
      .click();
    await tick();
    flushSync();

    assert.ok(
      calls.some((call) => call[0] === 'confirmDiscardDirtyRecipeDraft'),
      'the 3-way choice dialog is consulted on dirty navigation'
    );
    const updateCalls = calls.filter((call) => call[0] === 'updateRecipe');
    assert.equal(updateCalls.length, 1, 'choosing Save commits the staged draft');
    assert.equal(
      updateCalls[0][2].name,
      'Save On Exit',
      'the committed draft carries the staged name'
    );
    assert.equal(
      target.querySelector('.fabricate-manager').dataset.managerView,
      'recipes',
      'navigation proceeds after Save'
    );
  });

  it('discards staged edits on the discard choice and does not persist them', async () => {
    const calls = [];
    const target = await openRecipeEditor(calls, { confirmDiscardRecipeResult: 'discard' });

    editRecipeName(target, 'Discard Me');
    await tick();
    flushSync();

    Array.from(target.querySelectorAll('.manager-header-actions .manager-button'))
      .find((button) => button.textContent.includes('Back to recipes'))
      .click();
    await tick();
    flushSync();

    assert.ok(
      calls.some((call) => call[0] === 'confirmDiscardDirtyRecipeDraft'),
      'the choice dialog is consulted'
    );
    assert.ok(
      !calls.some((call) => call[0] === 'updateRecipe'),
      'choosing Discard persists nothing'
    );
    assert.equal(
      target.querySelector('.fabricate-manager').dataset.managerView,
      'recipes',
      'navigation proceeds after Discard'
    );
  });

  it('stays in the editor on the cancel (keep editing) choice', async () => {
    const calls = [];
    const target = await openRecipeEditor(calls, { confirmDiscardRecipeResult: 'cancel' });

    editRecipeName(target, 'Keep Editing');
    await tick();
    flushSync();

    Array.from(target.querySelectorAll('.manager-header-actions .manager-button'))
      .find((button) => button.textContent.includes('Back to recipes'))
      .click();
    await tick();
    flushSync();

    assert.ok(
      calls.some((call) => call[0] === 'confirmDiscardDirtyRecipeDraft'),
      'the choice dialog is consulted'
    );
    assert.ok(!calls.some((call) => call[0] === 'updateRecipe'), 'cancelling persists nothing');
    assert.equal(
      target.querySelector('.fabricate-manager').dataset.managerView,
      'recipe-edit',
      'cancelling keeps the editor open'
    );
  });

  it('changing the crafting system from the rail scope-select returns to the recipe browser', async () => {
    const calls = [];
    const target = await openRecipeEditor(calls);
    assert.equal(target.querySelector('.fabricate-manager').dataset.managerView, 'recipe-edit');

    const scopeSelect = target.querySelector('[data-manager-scope-select]');
    const current = scopeSelect.value;
    const other = Array.from(scopeSelect.options)
      .map((option) => option.value)
      .find((value) => value !== current);
    assert.ok(other, 'a second crafting system is available to switch to');

    scopeSelect.value = other;
    scopeSelect.dispatchEvent(new globalThis.window.Event('change', { bubbles: true }));
    await tick();
    flushSync();

    assert.equal(
      target.querySelector('.fabricate-manager').dataset.managerView,
      'recipes',
      'switching system from the recipe editor lands on the recipe browser, not a stale editor'
    );
    assert.ok(
      calls.some((call) => call[0] === 'selectSystem' && call[1] === other),
      'the new system was selected'
    );
  });

  it('guards an unsaved recipe editor before a scope-select system switch (cancel keeps it open)', async () => {
    const calls = [];
    const target = await openRecipeEditor(calls, { confirmDiscardRecipeResult: 'cancel' });
    editRecipeName(target, 'Dirty Draft');
    await tick();
    flushSync();

    const scopeSelect = target.querySelector('[data-manager-scope-select]');
    const other = Array.from(scopeSelect.options)
      .map((option) => option.value)
      .find((value) => value !== scopeSelect.value);

    scopeSelect.value = other;
    scopeSelect.dispatchEvent(new globalThis.window.Event('change', { bubbles: true }));
    await tick();
    flushSync();

    assert.ok(
      calls.some((call) => call[0] === 'confirmDiscardDirtyRecipeDraft'),
      'the discard dialog is consulted before switching system'
    );
    assert.equal(
      target.querySelector('.fabricate-manager').dataset.managerView,
      'recipe-edit',
      'cancelling the discard keeps the editor open'
    );
    assert.ok(
      !calls.some((call) => call[0] === 'selectSystem' && call[1] === other),
      'the system is not switched when the discard is cancelled'
    );
  });

  it('routes to the components browser with filters, drop import, selected inspector, and actions', async () => {
    const calls = [];
    const dropped = [];
    const edited = [];
    const copied = [];
    target = document.createElement('div');
    document.body.appendChild(target);
    mounted = mount(Component, {
      target,
      props: {
        store: createStore(calls),
        services: {
          openCurrentAdmin: () => {},
          onDropItem: (data) => dropped.push(data),
          onEditComponent: (id) => edited.push(id),
          onCopySourceUuid: (uuid) => copied.push(uuid),
        },
      },
    });
    flushSync();

    navButton('Components').click();
    await tick();
    flushSync();

    assert.equal(target.querySelector('.fabricate-manager').dataset.managerView, 'components');
    assert.equal(target.querySelectorAll('.manager-component-row').length, 2);
    assert.ok(target.textContent.includes('Component directory'));
    assert.ok(target.textContent.includes('Drop items to add components'));
    assert.ok(target.textContent.includes('Iron Ore'));
    assert.ok(target.textContent.includes('Compendium'));
    assert.ok(target.textContent.includes('Unknown'));
    const compactEssenceChip = target.querySelector(
      '[data-component-id="c1"] .manager-essence-compact-chip'
    );
    assert.equal(
      compactEssenceChip?.textContent.trim(),
      '2',
      'essence row should show only compact quantity text'
    );
    assert.equal(
      compactEssenceChip?.getAttribute('aria-label'),
      'Earth 2',
      'compact essence chip should expose the essence name and quantity accessibly'
    );
    assert.equal(target.textContent.includes('Usage evidence'), false);
    assert.equal(target.textContent.includes('Evidence'), false);
    assert.equal(target.textContent.includes('Progressive difficulty'), false);

    const search = target.querySelector('.manager-toolbar input[type="search"]');
    search.value = 'iron';
    search.dispatchEvent(new Event('input', { bubbles: true }));

    assert.equal(
      target.querySelector('[aria-label="Filter components by tag"]'),
      null,
      'component tag filtering should use searchable pills, not the legacy dropdown'
    );

    const tagSearch = target.querySelector('[aria-label="Search component tags"]');
    assert.ok(tagSearch, 'component tag search should render when component tags are available');
    tagSearch.value = 'con';
    tagSearch.dispatchEvent(new Event('input', { bubbles: true }));
    await tick();
    flushSync();
    const containerSuggestion = Array.from(target.querySelectorAll('.manager-tag-suggestion')).find(
      (button) => button.textContent.includes('container')
    );
    assert.ok(containerSuggestion, 'tag search should show matching tags underneath');
    containerSuggestion.click();
    await tick();
    flushSync();
    assert.equal(target.querySelectorAll('.manager-component-row').length, 1);
    assert.ok(target.textContent.includes('Glass Vial'));
    const containerPill = target.querySelector('[data-component-tag-pill="container"]');
    assert.ok(containerPill, 'selected tag should render as a removable pill');
    const componentToolbar = target.querySelector('.manager-toolbar');
    const primaryToolbarRow = target.querySelector('.manager-toolbar-primary');
    const tagSearchControl = target.querySelector('[data-component-tag-search]');
    const selectedTagRow = target.querySelector('.manager-toolbar-pills');
    assert.ok(
      primaryToolbarRow.contains(tagSearchControl),
      'tag search control should stay in the primary toolbar row'
    );
    assert.equal(
      selectedTagRow?.parentElement,
      componentToolbar,
      'selected tag pills should render in a toolbar sibling row'
    );
    assert.equal(
      tagSearchControl.contains(containerPill),
      false,
      'selected tag pills should not live inside the tag search control'
    );

    containerPill.querySelector('button').click();
    await tick();
    flushSync();
    assert.equal(target.querySelectorAll('.manager-component-row').length, 2);

    tagSearch.value = 'ore';
    tagSearch.dispatchEvent(new Event('input', { bubbles: true }));
    await tick();
    flushSync();
    Array.from(target.querySelectorAll('.manager-tag-suggestion'))
      .find((button) => button.textContent.includes('ore'))
      .click();
    await tick();
    flushSync();
    tagSearch.value = 'metal';
    tagSearch.dispatchEvent(new Event('input', { bubbles: true }));
    await tick();
    flushSync();
    Array.from(target.querySelectorAll('.manager-tag-suggestion'))
      .find((button) => button.textContent.includes('metal'))
      .click();
    await tick();
    flushSync();
    assert.equal(
      target.querySelectorAll('.manager-component-row').length,
      1,
      'multiple selected tags should require all tags'
    );
    assert.ok(target.textContent.includes('Iron Ore'));

    target
      .querySelector('[data-component-tag-pill="ore"]')
      .dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true }));
    await tick();
    flushSync();
    assert.equal(
      target.querySelector('[data-component-tag-pill="ore"]'),
      null,
      'right-clicking a tag pill should remove it'
    );

    target.querySelector('[data-clear-filters="components"]').click();
    await tick();
    flushSync();
    assert.equal(
      target.querySelector('[data-component-tag-pill="metal"]'),
      null,
      'clear filters should remove selected tag pills'
    );
    assert.equal(target.querySelectorAll('.manager-component-row').length, 2);

    target.querySelector('[data-component-id="c1"] .manager-component-identity').click();
    await tick();
    flushSync();
    assert.ok(target.querySelector('[data-component-id="c1"]').classList.contains('is-selected'));
    assert.equal(
      target.textContent.includes('Compendium.fabricate.items.iron-ore'),
      false,
      'raw source UUID should not render as inspector text'
    );

    const copySourceAction = target.querySelector('[data-component-action="copy-source"]');
    assert.ok(copySourceAction, 'component inspector should expose a copy source action');
    assert.equal(copySourceAction.getAttribute('title'), 'Compendium.fabricate.items.iron-ore');
    copySourceAction.click();
    flushSync();
    assert.equal(
      target.querySelector('[data-component-action="edit"]'),
      null,
      'component inspector should not duplicate row edit action'
    );
    assert.equal(
      target.querySelector('[data-component-action="delete"]'),
      null,
      'component inspector should not duplicate row delete action'
    );
    assert.ok(
      target.querySelector('[data-component-section="source"]'),
      'component inspector should expose a Source section'
    );
    assert.equal(
      target.querySelector('[data-component-source-missing]'),
      null,
      'resolved source should not show a missing-source warning'
    );
    const componentHeroRow = target.querySelector('.manager-inspector-title-row.is-hero-large');
    assert.ok(componentHeroRow, 'component inspector should use the prominent hero title row');
    assert.ok(
      componentHeroRow.querySelector('.manager-component-preview'),
      'component inspector hero should render the component preview image'
    );

    const dropEvent = new Event('drop', { bubbles: true, cancelable: true });
    Object.defineProperty(dropEvent, 'dataTransfer', {
      value: { getData: () => JSON.stringify({ type: 'Item', uuid: 'Item.dropped' }) },
    });
    target.querySelector('.manager-component-drop-zone').dispatchEvent(dropEvent);

    target.querySelector('[data-component-id="c1"] [aria-label="Edit Iron Ore"]').click();
    flushSync();
    await tick();
    flushSync();
    assert.equal(
      target.querySelector('.fabricate-manager').dataset.managerView,
      'component-edit',
      'row Edit action should route into the manager component-edit view'
    );
    Array.from(target.querySelectorAll('.manager-breadcrumbs button'))
      .find((button) => button.textContent.trim() === 'Components')
      .click();
    flushSync();
    await tick();
    flushSync();
    assert.equal(
      target.querySelector('.fabricate-manager').dataset.managerView,
      'components',
      'breadcrumb Components button should return to the components browser'
    );
    target.querySelector('[data-component-id="c1"] [aria-label="Delete Iron Ore"]').click();

    assert.deepEqual(dropped, [{ type: 'Item', uuid: 'Item.dropped' }]);
    assert.deepEqual(copied, ['Compendium.fabricate.items.iron-ore']);
    assert.deepEqual(
      edited,
      [],
      'manager row Edit should no longer call the legacy services.onEditComponent'
    );
    assert.ok(calls.some((call) => call[0] === 'setItemSearch' && call[1] === 'iron'));
    assert.ok(calls.some((call) => call[0] === 'deleteComponent' && call[1] === 'c1'));
  });

  it('shows progressive difficulty only for progressive component systems and warns for missing sources', async () => {
    target = document.createElement('div');
    document.body.appendChild(target);
    mounted = mount(Component, {
      target,
      props: {
        store: createStore([], {
          alchemyResolutionMode: 'progressive',
          missingComponentSource: true,
        }),
        services: { openCurrentAdmin: () => {}, onDropItem: () => {}, onCopySourceUuid: () => {} },
      },
    });
    flushSync();

    navButton('Components').click();
    await tick();
    flushSync();

    assert.ok(target.textContent.includes('Progressive difficulty'));
    assert.ok(target.textContent.includes('Missing'));

    // A set difficulty renders as a plain, borderless value (not a chip); an
    // unset one shows a centered "None".
    const c1DifficultyCell = target.querySelector('[data-component-id="c1"] .manager-component-difficulty-cell');
    assert.ok(c1DifficultyCell, 'difficulty cell renders for a progressive system');
    assert.ok(
      c1DifficultyCell.querySelector('.manager-component-difficulty-value'),
      'a set difficulty renders as a plain value element'
    );
    assert.equal(
      c1DifficultyCell.querySelector('.manager-chip'),
      null,
      'the difficulty value is not boxed in a chip'
    );
    assert.match(c1DifficultyCell.textContent, /2/, 'the set difficulty value is shown');
    const c2DifficultyCell = target.querySelector('[data-component-id="c2"] .manager-component-difficulty-cell');
    assert.match(c2DifficultyCell.textContent, /None/, 'an unset difficulty shows "None"');

    target.querySelector('[data-component-id="c1"] .manager-component-identity').click();
    await tick();
    flushSync();

    assert.ok(
      target.querySelector('[data-component-source-missing]'),
      'missing stored source should show a warning callout'
    );
    assert.equal(
      target.textContent.includes('Compendium.fabricate.items.iron-ore'),
      false,
      'missing source warning should not print the raw UUID'
    );
  });

  it('opens the in-manager component-edit view, persists tag changes, and exposes source actions', async () => {
    const calls = [];
    const replaced = [];
    const unlinked = [];
    const opened = [];
    target = document.createElement('div');
    document.body.appendChild(target);
    mounted = mount(Component, {
      target,
      props: {
        store: createStore(calls),
        services: {
          openCurrentAdmin: () => {},
          onDropItem: () => {},
          onCopySourceUuid: () => {},
          onReplaceSource: (itemId, data) => replaced.push({ itemId, data }),
          onUnlinkSource: (itemId) => unlinked.push(itemId),
          onOpenSource: (uuid) => opened.push(uuid),
        },
      },
    });
    flushSync();

    navButton('Components').click();
    await tick();
    flushSync();

    target.querySelector('[data-component-id="c1"] [aria-label="Edit Iron Ore"]').click();
    flushSync();
    await tick();
    flushSync();

    const root = target.querySelector('.fabricate-manager');
    assert.equal(
      root.dataset.managerView,
      'component-edit',
      'row Edit should land on the component-edit route'
    );
    assert.ok(
      target.textContent.includes('Edit component'),
      'header should show the Edit component title'
    );
    assert.ok(
      target.querySelector('[data-component-edit-section="identity"]'),
      'Identity card should render in the editor'
    );
    assert.ok(
      target.querySelector('[data-component-edit-section="source"]'),
      'Linked Source Item card should render in the right column'
    );

    target.querySelector('[data-component-edit-action="open-source"]').click();
    flushSync();
    assert.deepEqual(
      opened,
      ['Compendium.fabricate.items.iron-ore'],
      'Open Source Item should call onOpenSource with the stored UUID'
    );

    target.querySelector('[data-component-edit-action="unlink-source"]').click();
    flushSync();
    assert.deepEqual(
      unlinked,
      ['c1'],
      'Unlink Source Item should call onUnlinkSource with the component id'
    );

    const dropEvent = new Event('drop', { bubbles: true, cancelable: true });
    Object.defineProperty(dropEvent, 'dataTransfer', {
      value: { getData: () => JSON.stringify({ type: 'Item', uuid: 'Item.replacement' }) },
    });
    target.querySelector('[data-component-edit-action="replace-source"]').dispatchEvent(dropEvent);
    flushSync();
    assert.deepEqual(
      replaced,
      [{ itemId: 'c1', data: { type: 'Item', uuid: 'Item.replacement' } }],
      'drop should route through onReplaceSource for the active component'
    );

    // Tags and essences are stacked cards in the editor (no tabs), so they render immediately.
    assert.ok(
      target.querySelector('[data-component-edit-section="tags"]'),
      'Tags section should render'
    );
    assert.ok(
      target.querySelector('[data-component-edit-section="essences"]'),
      'Essences section should render'
    );

    // Tags are added from a dropdown (like the gathering weather/time-of-day fields),
    // then appear underneath as removable pills.
    assert.equal(
      target.querySelector('[data-component-edit-tag-pill="mineral"]'),
      null,
      'mineral should not be a selected pill yet'
    );
    target.querySelector('[data-component-edit-tag-menu]').click();
    flushSync();
    await tick();
    flushSync();
    const mineralOption = target.querySelector('[data-component-edit-tag-option="mineral"]');
    assert.ok(mineralOption, 'tag dropdown should list the unselected system itemTags');
    mineralOption.click();
    flushSync();
    await tick();
    flushSync();

    assert.ok(
      target.querySelector('[data-component-edit-tag-pill="mineral"]'),
      'selected tag should appear as a removable pill'
    );
    assert.ok(
      target.textContent.includes('Unsaved'),
      'dirty indicator should appear after a tag change'
    );

    const saveButton = target.querySelector('button[form="manager-component-edit-form"]');
    assert.ok(saveButton, 'header save submit should target the edit form');
    assert.equal(saveButton.disabled, false, 'save should be enabled when the draft is dirty');
    saveButton.click();
    flushSync();
    await tick();
    flushSync();
    await tick();
    flushSync();

    const updateCall = calls.find((call) => call[0] === 'updateComponent');
    assert.ok(updateCall, 'save should call store.updateComponent');
    assert.equal(updateCall[1], 'c1');
    assert.equal(
      Array.isArray(updateCall[2].tags) && updateCall[2].tags.includes('mineral'),
      true,
      'tags update should include the newly checked tag'
    );
    assert.equal(
      target.querySelector('.fabricate-manager').dataset.managerView,
      'components',
      'successful save should return to the components browser'
    );
  });

  // Mount the manager and open c1's component-edit route. Hoisted so the
  // difficulty-inspector tests stay DRY (Sonar new-code gate).
  async function openComponentEditor(calls, storeOptions = {}) {
    target = document.createElement('div');
    document.body.appendChild(target);
    mounted = mount(Component, {
      target,
      props: {
        store: createStore(calls, storeOptions),
        services: { openCurrentAdmin: () => {}, onDropItem: () => {} },
      },
    });
    flushSync();

    navButton('Components').click();
    await tick();
    flushSync();

    target.querySelector('[data-component-id="c1"] [aria-label="Edit Iron Ore"]').click();
    flushSync();
    await tick();
    flushSync();
    return target;
  }

  it('stages progressive-difficulty edits into the component editor save flow', async () => {
    const calls = [];
    await openComponentEditor(calls, { alchemyResolutionMode: 'progressive' });

    const card = target.querySelector('[data-component-edit-section="difficulty"]');
    assert.ok(card, 'difficulty inspector card should render for a progressive system');
    const input = card.querySelector('input');
    assert.ok(input, 'difficulty card should expose a number input');
    assert.equal(input.value, '2', 'input should seed from the persisted component difficulty');

    // Editing stages the value but must NOT write to the store immediately.
    input.value = '5';
    input.dispatchEvent(new globalThis.window.Event('input', { bubbles: true }));
    await tick();
    flushSync();
    assert.equal(
      calls.some((call) => call[0] === 'updateComponent'),
      false,
      'editing difficulty must not persist before Save'
    );

    // Staging a change makes the editor dirty and enables Save.
    const saveButton = target.querySelector('button[form="manager-component-edit-form"]');
    assert.ok(saveButton, 'component editor Save button should render');
    assert.equal(saveButton.disabled, false, 'a staged difficulty change should enable Save');

    // Saving persists the staged difficulty through the editor's save flow.
    saveButton.click();
    await tick();
    flushSync();
    const saveCall = calls.find((call) => call[0] === 'updateComponent');
    assert.ok(saveCall, 'Save should call store.updateComponent');
    assert.equal(saveCall[1], 'c1');
    assert.equal(saveCall[2].difficulty, 5, 'the staged truncated integer should persist on Save');
  });

  it('clears a staged progressive difficulty on Save when the input is blanked', async () => {
    const calls = [];
    await openComponentEditor(calls, { alchemyResolutionMode: 'progressive' });

    const input = target.querySelector('[data-component-edit-section="difficulty"] input');
    input.value = '';
    input.dispatchEvent(new globalThis.window.Event('input', { bubbles: true }));
    await tick();
    flushSync();

    target.querySelector('button[form="manager-component-edit-form"]').click();
    await tick();
    flushSync();
    const saveCall = calls.find((call) => call[0] === 'updateComponent');
    assert.ok(saveCall, 'Save should call store.updateComponent');
    assert.equal(saveCall[2].difficulty, null, 'blanking the input clears the difficulty on Save');
  });

  it('hides the progressive-difficulty inspector for a non-progressive system', async () => {
    const calls = [];
    await openComponentEditor(calls);

    assert.ok(
      target.querySelector('[data-component-edit-section="source"]'),
      'source inspector should still render'
    );
    assert.equal(
      target.querySelector('[data-component-edit-section="difficulty"]'),
      null,
      'difficulty inspector should be absent when crafting resolution mode is not progressive'
    );
  });

  // Mount the manager with salvage authoring enabled and open c1's component-edit
  // route. Hoisted so the salvage-section tests stay DRY (Sonar new-code gate).
  async function openComponentSalvageEditor(calls, storeOptions = {}) {
    target = document.createElement('div');
    document.body.appendChild(target);
    mounted = mount(Component, {
      target,
      props: {
        store: createStore(calls, {
          selectedFeatures: {
            essences: true,
            effectTransfer: true,
            itemTags: true,
            gathering: true,
            recipeCategories: true,
            salvage: true,
          },
          ...storeOptions,
        }),
        services: { openCurrentAdmin: () => {}, onDropItem: () => {} },
      },
    });
    flushSync();

    navButton('Components').click();
    await tick();
    flushSync();

    target.querySelector('[data-component-id="c1"] [aria-label="Edit Iron Ore"]').click();
    flushSync();
    await tick();
    flushSync();
    return target;
  }

  const ROUTED_SALVAGE_CHECK = {
    enabled: true,
    routed: {
      type: 'relative',
      relativeOutcomes: [
        { id: 'o-fail', name: 'Failure', success: false },
        { id: 'o-pass', name: 'Success', success: true },
        { id: 'o-crit', name: 'Critical Success', success: true },
      ],
    },
  };

  it('renders the salvage authoring section with result-group add, routing selects, and DC override for a routed system', async () => {
    const calls = [];
    await openComponentSalvageEditor(calls, {
      salvageResolutionMode: 'routed',
      salvageCraftingCheck: ROUTED_SALVAGE_CHECK,
    });

    const section = target.querySelector('[data-salvage-section]');
    assert.ok(section, 'salvage authoring section should render when showSalvage is true');

    // Adding a result group reveals the group name input and an add-result button.
    assert.equal(
      section.querySelector('[data-salvage-group-name]'),
      null,
      'no result group should exist before adding one'
    );
    section.querySelector('[data-add-salvage-group]').click();
    await tick();
    flushSync();
    assert.ok(
      target.querySelector('[data-salvage-section] [data-salvage-group-name]'),
      'add group should render an editable result group'
    );

    // One routing select per non-empty outcome name on the routed salvage check.
    const routes = target.querySelectorAll('[data-salvage-routing] [data-salvage-route]');
    assert.equal(routes.length, 3, 'one routing select per routed outcome tier name');
    assert.deepEqual(
      Array.from(routes).map((select) => select.dataset.salvageRoute),
      ['Failure', 'Success', 'Critical Success'],
      'routing selects should be keyed by outcome tier name'
    );

    assert.ok(
      target.querySelector('[data-salvage-section] [data-salvage-dc-override] input'),
      'routed mode should render the DC-override field'
    );
  });

  it('hides the salvage authoring section when the system does not enable salvage', async () => {
    const calls = [];
    target = document.createElement('div');
    document.body.appendChild(target);
    mounted = mount(Component, {
      target,
      props: {
        store: createStore(calls, {
          selectedFeatures: {
            essences: true,
            effectTransfer: true,
            itemTags: true,
            gathering: true,
            recipeCategories: true,
            salvage: false,
          },
        }),
        services: { openCurrentAdmin: () => {}, onDropItem: () => {} },
      },
    });
    flushSync();

    navButton('Components').click();
    await tick();
    flushSync();
    target.querySelector('[data-component-id="c1"] [aria-label="Edit Iron Ore"]').click();
    flushSync();
    await tick();
    flushSync();

    assert.equal(
      target.querySelector('[data-salvage-section]'),
      null,
      'salvage section should not render when showSalvage is false'
    );
  });

  it('shows salvage result groups but hides routing and DC override in progressive mode', async () => {
    const calls = [];
    await openComponentSalvageEditor(calls, {
      salvageResolutionMode: 'progressive',
      salvageCraftingCheck: { enabled: true, progressive: { awardMode: 'equal' } },
    });

    assert.ok(
      target.querySelector('[data-salvage-section] [data-add-salvage-group]'),
      'progressive mode should still allow authoring result groups'
    );
    assert.equal(
      target.querySelector('[data-salvage-routing]'),
      null,
      'progressive mode has no routing'
    );
    assert.equal(
      target.querySelector('[data-salvage-dc-override]'),
      null,
      'progressive mode has no DC override'
    );
  });

  it('emits onDraftChange with updates.salvage carrying authored result-group edits', async () => {
    const calls = [];
    await openComponentSalvageEditor(calls, {
      salvageResolutionMode: 'simple',
      salvageCraftingCheck: { enabled: true, simple: {} },
      componentSalvage: {
        enabled: true,
        ingredientQuantity: 2,
        toolIds: ['anvil'],
        dcOverride: null,
        resultGroups: [],
        outcomeRouting: {},
      },
    });

    const section = target.querySelector('[data-salvage-section]');
    section.querySelector('[data-add-salvage-group]').click();
    await tick();
    flushSync();
    target.querySelector('[data-salvage-section] [data-add-salvage-result]').click();
    await tick();
    flushSync();

    // The component header Save submits the edit form and routes through
    // store.updateComponent with the authored salvage payload.
    const saveButton = target.querySelector('button[form="manager-component-edit-form"]');
    assert.ok(saveButton, 'salvage edits should reveal the header Save button');
    assert.equal(saveButton.disabled, false, 'save should be enabled after a salvage edit');
    saveButton.click();
    flushSync();
    await tick();
    flushSync();
    await tick();
    flushSync();

    const updateCall = calls.find((call) => call[0] === 'updateComponent');
    assert.ok(updateCall, 'salvage save should call store.updateComponent');
    assert.equal(updateCall[1], 'c1');
    const salvage = updateCall[2].salvage;
    assert.ok(salvage, 'updates should carry a salvage payload');
    assert.equal(salvage.resultGroups.length, 1, 'one authored result group');
    assert.equal(salvage.resultGroups[0].results.length, 1, 'one authored result in the group');
    // Untouched salvage fields must survive the round-trip (not be dropped).
    assert.equal(salvage.enabled, true, 'enabled should be preserved');
    assert.equal(salvage.ingredientQuantity, 2, 'ingredientQuantity should be preserved');
    assert.deepEqual(salvage.toolIds, ['anvil'], 'toolIds should be preserved');
  });

  it('routes to tags and categories with add feedback, usage warnings, and store delegation', async () => {
    const calls = [];
    const confirmations = [];
    target = document.createElement('div');
    document.body.appendChild(target);
    mounted = mount(Component, {
      target,
      props: {
        store: createStore(calls),
        services: {
          openCurrentAdmin: () => {},
          confirmVocabularyRemoval: (kind, row, message) => {
            confirmations.push([kind, row.name, message]);
            return false;
          },
        },
      },
    });
    flushSync();

    const tagsButton = navButton('Tags & Categories');
    assert.ok(tagsButton, 'tags/categories nav button should render for selected systems');
    assert.equal(tagsButton.disabled, false);
    tagsButton.click();
    await tick();
    flushSync();

    assert.equal(target.querySelector('.fabricate-manager').dataset.managerView, 'tags');
    assert.ok(target.textContent.includes('Recipe categories'));
    assert.ok(target.textContent.includes('Item tags'));
    assert.ok(target.textContent.includes('General'));
    assert.ok(target.textContent.includes('potions'));
    assert.ok(target.textContent.includes('ore'));
    assert.ok(target.textContent.includes('Vocabulary counts'));
    assert.ok(target.querySelector('[data-category-id="general"]').textContent.includes('Locked'));

    const howItWorksCard = target.querySelector('[data-tags-evidence="how-it-works"]');
    assert.ok(howItWorksCard, 'tags inspector should render a How-it-works evidence card');
    assert.ok(
      howItWorksCard.textContent.includes('flat'),
      'How-it-works should explain that categories are flat'
    );
    assert.ok(
      howItWorksCard.textContent.includes('General'),
      'How-it-works should explain reserved General'
    );
    assert.ok(howItWorksCard.textContent.includes('tag'), 'How-it-works should mention item tags');

    // The Examples and General-category evidence cards were removed; only the
    // How-it-works card and Vocabulary counts remain in the tags inspector.
    assert.equal(
      target.querySelector('[data-tags-evidence="examples"]'),
      null,
      'the Examples evidence card is removed'
    );

    const categoryInput = target.querySelector('#manager-category-add');
    categoryInput.value = 'General';
    categoryInput.dispatchEvent(new Event('input', { bubbles: true }));
    target
      .querySelector('[aria-label="Recipe categories"] form')
      .dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    await tick();
    flushSync();
    assert.ok(target.textContent.includes('General is already available as the base category.'));
    assert.ok(!calls.some((call) => call[0] === 'addCategory'));

    categoryInput.value = 'Elixirs';
    categoryInput.dispatchEvent(new Event('input', { bubbles: true }));
    target
      .querySelector('[aria-label="Recipe categories"] form')
      .dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    await tick();
    await tick();
    flushSync();
    assert.ok(calls.some((call) => call[0] === 'addCategory' && call[1] === 'Elixirs'));
    assert.equal(categoryInput.value, '');
    assert.equal(document.activeElement, categoryInput);

    const tagInput = target.querySelector('#manager-tag-add');
    tagInput.value = 'SPICE';
    tagInput.dispatchEvent(new Event('input', { bubbles: true }));
    target
      .querySelector('[aria-label="Item tags"] form')
      .dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    await tick();
    await tick();
    flushSync();
    assert.ok(calls.some((call) => call[0] === 'addTag' && call[1] === 'spice'));
    assert.ok(target.textContent.includes('Tag added with cleaned-up lowercase text.'));
    assert.equal(tagInput.value, '');
    assert.equal(document.activeElement, tagInput);

    target.querySelector('[aria-label="Remove category potions"]').click();
    await tick();
    flushSync();
    assert.deepEqual(confirmations[0]?.slice(0, 2), ['category', 'potions']);
    assert.ok(!calls.some((call) => call[0] === 'removeCategory' && call[1] === 'potions'));

    target.querySelector('[aria-label="Remove tag ore"]').click();
    await tick();
    flushSync();
    assert.deepEqual(confirmations[1]?.slice(0, 2), ['tag', 'ore']);
    assert.ok(!calls.some((call) => call[0] === 'removeTag' && call[1] === 'ore'));

    const search = target.querySelector('.manager-toolbar input[type="search"]');
    search.value = 'zzzz';
    search.dispatchEvent(new Event('input', { bubbles: true }));
    await tick();
    flushSync();
    assert.ok(target.textContent.includes('No custom categories match this search.'));
    assert.ok(target.textContent.includes('No item tags match this search.'));
    assert.ok(target.textContent.includes('General'));
  });

  it('keeps tags and categories add inputs when store add callbacks fail', async () => {
    const calls = [];
    target = document.createElement('div');
    document.body.appendChild(target);
    mounted = mount(Component, {
      target,
      props: {
        store: createStore(calls, {
          addCategoryResult: false,
          addTagReject: true,
        }),
        services: { openCurrentAdmin: () => {} },
      },
    });
    flushSync();

    navButton('Tags & Categories').click();
    await tick();
    flushSync();

    const categoryInput = target.querySelector('#manager-category-add');
    categoryInput.value = 'Elixirs';
    categoryInput.dispatchEvent(new Event('input', { bubbles: true }));
    target
      .querySelector('[aria-label="Recipe categories"] form')
      .dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    await tick();
    await tick();
    flushSync();
    assert.ok(calls.some((call) => call[0] === 'addCategory' && call[1] === 'Elixirs'));
    assert.equal(categoryInput.value, 'Elixirs');
    assert.equal(document.activeElement, categoryInput);
    assert.ok(target.textContent.includes('Category could not be added.'));

    const tagInput = target.querySelector('#manager-tag-add');
    tagInput.value = 'SPICE';
    tagInput.dispatchEvent(new Event('input', { bubbles: true }));
    target
      .querySelector('[aria-label="Item tags"] form')
      .dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    await tick();
    await tick();
    flushSync();
    assert.ok(calls.some((call) => call[0] === 'addTag' && call[1] === 'spice'));
    assert.equal(tagInput.value, 'SPICE');
    assert.equal(document.activeElement, tagInput);
    assert.ok(target.textContent.includes('Tag could not be added.'));
  });

  it('routes to the essence browser and dedicated edit route without inline editing', async () => {
    const calls = [];
    const editedComponents = [];
    const copiedSources = [];
    target = document.createElement('div');
    document.body.appendChild(target);
    mounted = mount(Component, {
      target,
      props: {
        store: createStore(calls),
        services: {
          openCurrentAdmin: () => {},
          onEditComponent: (id) => editedComponents.push(id),
          onCopySourceUuid: (uuid) => copiedSources.push(uuid),
          importSingleManagedItemFromDrop: async () => ({
            id: 'c2',
            name: 'Glass Vial',
            img: 'icons/consumables/potions/vial-corked-blue.webp',
          }),
        },
      },
    });
    flushSync();

    const essenceButton = navButton('Essences');
    assert.ok(essenceButton, 'essence nav button should render when the feature is enabled');
    assert.equal(essenceButton.disabled, false);
    essenceButton.click();
    await tick();
    flushSync();

    assert.equal(target.querySelector('.fabricate-manager').dataset.managerView, 'essences');
    assert.ok(target.textContent.includes('Essence browser'));
    assert.equal(target.querySelectorAll('.manager-essence-row').length, 2);
    assert.ok(target.textContent.includes('Earth'));
    assert.equal(target.querySelector('.manager-essence-action-band'), null);
    assert.equal(target.textContent.includes('Linked source'), false);
    const linkedSourceImage = target.querySelector(
      '[data-essence-id="earth"] .manager-essence-source-cell-image'
    );
    assert.ok(linkedSourceImage, 'linked essence Source column should render image evidence');
    assert.equal(linkedSourceImage.title, 'Iron Ore');
    assert.equal(linkedSourceImage.getAttribute('aria-label'), 'Iron Ore');
    assert.ok(
      target
        .querySelector('[data-essence-id="water"] .manager-essence-source-cell')
        .textContent.includes('None')
    );
    assert.ok(target.textContent.includes('Deletion blocked'));
    assert.equal(target.querySelectorAll('.manager-essence-usage-item').length, 1);
    assert.equal(target.querySelector('.manager-essence-usage-item').title, 'Iron Ore');
    target.querySelector('.manager-essence-usage-item').click();
    flushSync();
    await tick();
    flushSync();
    assert.equal(
      target.querySelector('.fabricate-manager').dataset.managerView,
      'component-edit',
      'essence usage thumbnail should route to the manager component-edit view'
    );
    assert.deepEqual(
      editedComponents,
      [],
      'essence usage thumbnail should no longer launch the legacy services.onEditComponent'
    );
    navButton('Essences').click();
    flushSync();
    await tick();
    flushSync();
    assert.equal(target.querySelector('.fabricate-manager').dataset.managerView, 'essences');
    assert.equal(target.querySelectorAll('.manager-essence-edit-row').length, 0);
    assert.equal(target.querySelectorAll('#manager-essence-create-name').length, 0);

    target.querySelector('[data-essence-id="water"]').click();
    await tick();
    flushSync();
    assert.ok(target.querySelector('[data-essence-id="water"]').classList.contains('is-selected'));
    assert.ok(target.textContent.includes('Clear current.'));

    assert.equal(
      target.querySelector('[data-essence-action="edit"]'),
      null,
      'essence inspector should not duplicate row Edit actions'
    );
    assert.equal(
      target.querySelector('[data-essence-action="delete"]'),
      null,
      'essence inspector should not duplicate row Delete actions'
    );
    assert.ok(
      target.querySelector('[data-essence-section="usage"]'),
      'essence inspector should expose a Usage section'
    );
    assert.ok(
      target.querySelector(
        '[data-essence-section="source"] .manager-essence-source-drop-zone .essence-source-trigger'
      ),
      'unlinked selected essence should expose a source drop zone'
    );
    const essenceHeroRow = target.querySelector('.manager-inspector-title-row.is-hero-large');
    assert.ok(essenceHeroRow, 'essence inspector should use the prominent hero title row');
    assert.ok(
      essenceHeroRow.querySelector('.manager-inspector-icon.is-hero-large'),
      'essence inspector hero should render the icon at hero-large size'
    );

    const inspectorDropEvent = new Event('drop', { bubbles: true, cancelable: true });
    Object.defineProperty(inspectorDropEvent, 'dataTransfer', {
      value: { getData: () => JSON.stringify({ type: 'Item', uuid: 'Item.glass-vial' }) },
    });
    target
      .querySelector('[data-essence-section="source"] .essence-source-trigger')
      .dispatchEvent(inspectorDropEvent);
    await tick();
    await tick();
    flushSync();
    assert.ok(
      calls.some(
        (call) =>
          call[0] === 'updateEssence' && call[1] === 'water' && call[2].sourceComponentId === 'c2'
      )
    );

    target.querySelector('[data-essence-id="earth"]').click();
    await tick();
    flushSync();
    const inspectorSourceSummary = target.querySelector(
      '[data-essence-section="source"] .manager-essence-inspector-source-summary'
    );
    assert.ok(
      inspectorSourceSummary,
      'linked selected essence should render a source summary card'
    );
    assert.equal(
      inspectorSourceSummary.querySelectorAll('.manager-essence-source-thumb').length,
      1,
      'linked selected essence should show one source thumbnail'
    );
    assert.ok(
      inspectorSourceSummary
        .querySelector('.manager-essence-source-copy')
        .textContent.includes('Iron Ore'),
      'linked selected essence should keep the source name readable'
    );
    assert.equal(
      inspectorSourceSummary
        .querySelector('.manager-essence-source-copy')
        .textContent.includes('c1'),
      false,
      'linked selected essence should not print UUID evidence under the item name'
    );
    const inspectorSourceActions = target.querySelector(
      '[data-essence-section="source"] .manager-essence-inspector-source-actions'
    );
    assert.ok(
      inspectorSourceActions,
      'linked selected essence should expose source actions below the item card'
    );
    assert.equal(
      inspectorSourceSummary.contains(inspectorSourceActions),
      false,
      'source actions should sit outside the linked item card'
    );
    const copySourceAction = inspectorSourceActions.querySelector(
      '[data-essence-action="copy-source"]'
    );
    assert.ok(copySourceAction, 'linked selected essence should expose source copy');
    assert.equal(copySourceAction.disabled, false);
    copySourceAction.click();
    flushSync();
    assert.deepEqual(copiedSources, ['c1']);
    const unlinkSourceAction = inspectorSourceActions.querySelector(
      '[data-essence-action="unlink-source"]'
    );
    assert.ok(
      unlinkSourceAction.classList.contains('is-warning-action'),
      'unlink source should use the amber warning action style'
    );
    unlinkSourceAction.click();
    await tick();
    flushSync();
    assert.ok(
      calls.some(
        (call) =>
          call[0] === 'updateEssence' && call[1] === 'earth' && call[2].sourceComponentId === null
      )
    );

    const sourceFilter = target.querySelector('[aria-label="Filter essences by source state"]');
    sourceFilter.value = 'none';
    sourceFilter.dispatchEvent(new Event('change', { bubbles: true }));
    sourceFilter.dispatchEvent(new Event('input', { bubbles: true }));
    await tick();
    flushSync();
    assert.equal(target.querySelectorAll('.manager-essence-row').length, 1);
    assert.ok(target.textContent.includes('Water'));

    sourceFilter.value = 'all';
    sourceFilter.dispatchEvent(new Event('change', { bubbles: true }));
    await tick();
    flushSync();

    target.querySelector('[data-essence-id="water"] [aria-label="Edit Water"]').click();
    await tick();
    flushSync();
    assert.equal(target.querySelector('.fabricate-manager').dataset.managerView, 'essence-edit');
    assert.ok(target.textContent.includes('Edit essence'));
    assert.ok(!target.textContent.includes('Essence editor'));
    assert.ok(
      !target.querySelector('.manager-essence-edit-view .manager-action-group'),
      'identity card should not duplicate route save/cancel actions'
    );
    assert.equal(target.textContent.includes('Basic information'), false);
    assert.equal(target.textContent.includes('Essence ID'), false);
    assert.ok(
      !target.querySelector('.manager-inspector [aria-label="Edit Water"]'),
      'inspector should not show an edit action while already editing'
    );
    assert.ok(
      target.querySelector('.essence-icon-picker-trigger'),
      'edit route should use the shared icon picker trigger'
    );
    assert.equal(target.querySelector('.essence-icon-picker-trigger').title, 'Change icon');
    assert.ok(target.textContent.includes('Clear icon'));
    assert.ok(
      target.querySelector('.essence-source-trigger'),
      'effect-transfer systems should show source picker controls'
    );
    assert.ok(
      target.querySelector('.manager-essence-source-summary'),
      'edit route should show selected source summary inside the form'
    );
    assert.ok(
      target.querySelector('.manager-essence-source-drop-zone .essence-source-trigger'),
      'edit route should show a full-width source drop/pick target'
    );
    assert.equal(
      target.querySelector('.manager-header-actions .manager-button.is-primary').disabled,
      true
    );

    const editName = target.querySelector('#manager-essence-edit-name');
    editName.value = 'Rain';
    editName.dispatchEvent(new Event('input', { bubbles: true }));
    await tick();
    flushSync();
    assert.equal(target.querySelector('.manager-inspector-name').textContent.trim(), 'Rain');
    assert.equal(
      target.querySelector('.manager-header-actions .manager-button.is-primary').disabled,
      false
    );
    target.querySelector('.essence-source-trigger').click();
    await tick();
    flushSync();
    document.querySelector('.essence-source-picker-option[title="Glass Vial"]').click();
    await tick();
    flushSync();
    assert.ok(
      target.querySelector('.manager-essence-source-summary').textContent.includes('Glass Vial')
    );
    target.querySelector('.manager-header-actions .manager-button.is-primary').click();
    await tick();
    flushSync();
    assert.ok(
      calls.some(
        (call) =>
          call[0] === 'updateEssence' &&
          call[1] === 'water' &&
          call[2].name === 'Rain' &&
          call[2].sourceComponentId === 'c2'
      )
    );
    assert.equal(target.querySelector('.fabricate-manager').dataset.managerView, 'essences');

    target.querySelector('[data-essence-id="water"] [aria-label="Delete Water"]').click();
    assert.ok(calls.some((call) => call[0] === 'removeEssence' && call[1] === 'water'));
    await tick();
    flushSync();
    assert.equal(
      target.querySelector('[data-essence-id="earth"] [aria-label="Delete Earth"]').disabled,
      true
    );

    target.querySelector('.manager-header-actions .manager-button.is-primary').click();
    await tick();
    flushSync();
    assert.equal(target.querySelector('.fabricate-manager').dataset.managerView, 'essence-edit');
    assert.equal(
      target.querySelector('.manager-inspector-name').textContent.trim(),
      'New essence draft'
    );
    assert.equal(
      target.querySelector('.manager-header-actions .manager-button.is-primary').disabled,
      true
    );
    const createName = target.querySelector('#manager-essence-edit-name');
    createName.value = 'Air';
    createName.dispatchEvent(new Event('input', { bubbles: true }));
    await tick();
    flushSync();
    assert.equal(target.querySelector('.manager-inspector-name').textContent.trim(), 'Air');
    target.querySelector('.manager-header-actions .manager-button.is-primary').click();
    await tick();
    flushSync();
    assert.ok(calls.some((call) => call[0] === 'addEssence' && call[1] === 'Air'));
  });

  it('hides manager essence source UI when effect transfer is disabled', async () => {
    const calls = [];
    target = document.createElement('div');
    document.body.appendChild(target);
    mounted = mount(Component, {
      target,
      props: {
        store: createStore(calls, {
          selectedFeatures: {
            essences: true,
            effectTransfer: false,
            itemTags: true,
            gathering: true,
            recipeCategories: true,
          },
        }),
        services: { openCurrentAdmin: () => {} },
      },
    });
    flushSync();

    navButton('Essences').click();
    await tick();
    flushSync();

    assert.equal(target.querySelector('[aria-label="Filter essences by source state"]'), null);
    assert.equal(
      target.querySelector('.manager-essences-table').classList.contains('has-no-source'),
      true
    );
    assert.equal(target.textContent.includes('Linked source'), false);
    assert.equal(target.textContent.includes('Source evidence'), false);

    target.querySelector('[data-essence-id="water"] [aria-label="Edit Water"]').click();
    await tick();
    flushSync();

    assert.equal(target.querySelector('.essence-source-trigger'), null);
    assert.equal(target.querySelector('.manager-essence-source-summary'), null);
    assert.equal(target.querySelector('.manager-essence-source-drop-zone'), null);
    assert.equal(target.textContent.includes('Source unresolved'), false);
    assert.equal(target.textContent.includes('source linkage'), false);

    const editName = target.querySelector('#manager-essence-edit-name');
    editName.value = 'Rain';
    editName.dispatchEvent(new Event('input', { bubbles: true }));
    await tick();
    flushSync();
    target.querySelector('.manager-header-actions .manager-button.is-primary').click();
    await tick();
    flushSync();

    const updateCall = calls.find((call) => call[0] === 'updateEssence');
    assert.ok(updateCall, 'identity save should delegate an essence update');
    assert.equal(Object.prototype.hasOwnProperty.call(updateCall[2], 'sourceComponentId'), false);
  });

  it('protects dirty essence edit drafts when leaving the route', async () => {
    const calls = [];
    target = document.createElement('div');
    document.body.appendChild(target);
    mounted = mount(Component, {
      target,
      props: {
        store: createStore(calls, {
          confirmDiscardEssenceResult: false,
          experimentalFeaturesEnabled: true,
        }),
        services: { openCurrentAdmin: () => {} },
      },
    });
    flushSync();

    navButton('Essences').click();
    await tick();
    flushSync();
    target.querySelector('[data-essence-id="water"] [aria-label="Edit Water"]').click();
    await tick();
    flushSync();

    const editName = target.querySelector('#manager-essence-edit-name');
    editName.value = 'Rain';
    editName.dispatchEvent(new Event('input', { bubbles: true }));
    await tick();
    flushSync();

    craftingParent().click();
    await tick();
    flushSync();

    assert.ok(calls.some((call) => call[0] === 'confirmDiscardDirtyEssenceDraft'));
    assert.equal(target.querySelector('.fabricate-manager').dataset.managerView, 'essence-edit');
    assert.equal(target.querySelector('#manager-essence-edit-name').value, 'Rain');
  });

  it('saves a dirty essence edit draft and completes navigation when the GM chooses Save', async () => {
    const calls = [];
    target = document.createElement('div');
    document.body.appendChild(target);
    mounted = mount(Component, {
      target,
      props: {
        store: createStore(calls, {
          confirmDiscardEssenceResult: 'save',
          experimentalFeaturesEnabled: true,
        }),
        services: { openCurrentAdmin: () => {} },
      },
    });
    flushSync();

    navButton('Essences').click();
    await tick();
    flushSync();
    target.querySelector('[data-essence-id="water"] [aria-label="Edit Water"]').click();
    await tick();
    flushSync();

    const editName = target.querySelector('#manager-essence-edit-name');
    editName.value = 'Rain';
    editName.dispatchEvent(new Event('input', { bubbles: true }));
    await tick();
    flushSync();

    craftingParent().click();
    for (let i = 0; i < 6; i++) await Promise.resolve();
    await tick();
    flushSync();
    await tick();
    flushSync();

    assert.ok(calls.some((call) => call[0] === 'confirmDiscardDirtyEssenceDraft'));
    const updateCall = calls.find((call) => call[0] === 'updateEssence');
    assert.ok(updateCall, 'choosing Save should persist the dirty essence draft');
    assert.equal(updateCall[1], 'water');
    assert.equal(updateCall[2].name, 'Rain');
    assert.equal(target.querySelector('.fabricate-manager').dataset.managerView, 'recipes');
  });

  it('keeps a dirty essence edit draft open when the Save fails on route exit', async () => {
    const calls = [];
    target = document.createElement('div');
    document.body.appendChild(target);
    mounted = mount(Component, {
      target,
      props: {
        store: createStore(calls, {
          confirmDiscardEssenceResult: 'save',
          updateEssenceResult: false,
          experimentalFeaturesEnabled: true,
        }),
        services: { openCurrentAdmin: () => {} },
      },
    });
    flushSync();

    navButton('Essences').click();
    await tick();
    flushSync();
    target.querySelector('[data-essence-id="water"] [aria-label="Edit Water"]').click();
    await tick();
    flushSync();

    const editName = target.querySelector('#manager-essence-edit-name');
    editName.value = 'Rain';
    editName.dispatchEvent(new Event('input', { bubbles: true }));
    await tick();
    flushSync();

    craftingParent().click();
    await Promise.resolve();
    await Promise.resolve();
    await tick();
    flushSync();

    assert.ok(
      calls.some((call) => call[0] === 'updateEssence'),
      'Save should be attempted'
    );
    assert.equal(target.querySelector('.fabricate-manager').dataset.managerView, 'essence-edit');
    assert.equal(target.querySelector('#manager-essence-edit-name').value, 'Rain');
  });

  it('keeps essence edit drafts on failed and rejected saves', async () => {
    const failedCalls = [];
    target = document.createElement('div');
    document.body.appendChild(target);
    mounted = mount(Component, {
      target,
      props: {
        store: createStore(failedCalls, { updateEssenceResult: false }),
        services: { openCurrentAdmin: () => {} },
      },
    });
    flushSync();

    navButton('Essences').click();
    await tick();
    flushSync();
    target.querySelector('[data-essence-id="water"] [aria-label="Edit Water"]').click();
    await tick();
    flushSync();
    const failedName = target.querySelector('#manager-essence-edit-name');
    failedName.value = 'Rain';
    failedName.dispatchEvent(new Event('input', { bubbles: true }));
    await tick();
    flushSync();
    target.querySelector('.manager-header-actions .manager-button.is-primary').click();
    await tick();
    await tick();
    flushSync();

    assert.equal(target.querySelector('.fabricate-manager').dataset.managerView, 'essence-edit');
    assert.equal(target.querySelector('#manager-essence-edit-name').value, 'Rain');
    assert.ok(target.textContent.includes('Save failed.'));

    unmount(mounted);
    target.remove();

    const rejectedCalls = [];
    target = document.createElement('div');
    document.body.appendChild(target);
    mounted = mount(Component, {
      target,
      props: {
        store: createStore(rejectedCalls, { updateEssenceReject: true }),
        services: { openCurrentAdmin: () => {} },
      },
    });
    flushSync();

    navButton('Essences').click();
    await tick();
    flushSync();
    target.querySelector('[data-essence-id="water"] [aria-label="Edit Water"]').click();
    await tick();
    flushSync();
    const rejectedName = target.querySelector('#manager-essence-edit-name');
    rejectedName.value = 'Storm';
    rejectedName.dispatchEvent(new Event('input', { bubbles: true }));
    await tick();
    flushSync();
    target.querySelector('.manager-header-actions .manager-button.is-primary').click();
    await tick();
    await tick();
    flushSync();

    assert.equal(target.querySelector('.fabricate-manager').dataset.managerView, 'essence-edit');
    assert.equal(target.querySelector('#manager-essence-edit-name').value, 'Storm');
    assert.ok(target.textContent.includes('Save failed.'));

    unmount(mounted);
    target.remove();

    const createFailedCalls = [];
    target = document.createElement('div');
    document.body.appendChild(target);
    mounted = mount(Component, {
      target,
      props: {
        store: createStore(createFailedCalls, { addEssenceResult: false }),
        services: { openCurrentAdmin: () => {} },
      },
    });
    flushSync();

    navButton('Essences').click();
    await tick();
    flushSync();
    target.querySelector('.manager-header-actions .manager-button.is-primary').click();
    await tick();
    flushSync();
    const createName = target.querySelector('#manager-essence-edit-name');
    createName.value = 'Air';
    createName.dispatchEvent(new Event('input', { bubbles: true }));
    await tick();
    flushSync();
    target.querySelector('.manager-header-actions .manager-button.is-primary').click();
    await tick();
    await tick();
    flushSync();

    assert.equal(target.querySelector('.fabricate-manager').dataset.managerView, 'essence-edit');
    assert.equal(target.querySelector('#manager-essence-edit-name').value, 'Air');
    assert.ok(target.textContent.includes('Save failed.'));
  });

  it('renders the gated Crafting nav group only when experimental features are on', async () => {
    // Experimental OFF: no Crafting group; Recipes shows as a disabled placeholder.
    target = document.createElement('div');
    document.body.appendChild(target);
    mounted = mount(Component, {
      target,
      props: {
        store: createStore([], { experimentalFeaturesEnabled: false }),
        services: { openCurrentAdmin: () => {} },
      },
    });
    flushSync();
    assert.equal(target.querySelector('#manager-nav-crafting'), null, 'Crafting group hidden when experimental off');
    assert.equal(Boolean(craftingParent()), false, 'no Crafting parent button when experimental off');
  });

  it('exposes the Crafting group with Gathering-parity a11y and nested Settings + Recipes', async () => {
    const calls = [];
    target = document.createElement('div');
    document.body.appendChild(target);
    mounted = mount(Component, {
      target,
      props: {
        store: createStore(calls, { experimentalFeaturesEnabled: true }),
        services: { openCurrentAdmin: () => {} },
      },
    });
    flushSync();

    // Collapsed by default: parent present, submenu absent.
    const parent = target.querySelector('#manager-nav-crafting');
    assert.ok(parent, 'Crafting parent renders when experimental on');
    assert.equal(parent.getAttribute('aria-expanded'), 'false');
    // Parent total = 2 recipes + 2 books & scrolls items in the default fixture (issue 643).
    assert.equal(parent.querySelector('.manager-nav-count').textContent.trim(), '4');
    const toggle = target.querySelector('#manager-nav-crafting + .manager-nav-toggle');
    assert.equal(toggle.getAttribute('aria-controls'), 'manager-crafting-submenu');
    assert.equal(toggle.getAttribute('aria-label'), 'Expand crafting menu');
    assert.equal(target.querySelector('#manager-crafting-submenu'), null);

    // Clicking the parent routes to Recipes and expands the submenu.
    parent.click();
    await tick();
    flushSync();
    assert.equal(target.querySelector('.fabricate-manager').dataset.managerView, 'recipes');
    assert.equal(parent.getAttribute('aria-expanded'), 'true');
    const submenu = target.querySelector('#manager-crafting-submenu');
    assert.ok(submenu, 'crafting submenu renders when expanded');
    assert.equal(
      target.querySelector('#manager-nav-crafting + .manager-nav-toggle').getAttribute('aria-label'),
      'Collapse crafting menu'
    );
    // The Crafting sub-tabs are a conditional set keyed on the system's
    // visibilityMode (issue 511, PR-B). The default fixture has no visibilityMode
    // (→ 'knowledge'), so Access is hidden and Books & Scrolls is shown; order is
    // Recipes · Books & Scrolls · Settings.
    const craftingItems = Array.from(submenu.querySelectorAll('.manager-nav-subitem'));
    assert.deepEqual(
      craftingItems.map((item) => item.querySelector('.manager-nav-label')?.textContent.trim()),
      ['Recipes', 'Books & Scrolls', 'Settings']
    );
    assert.deepEqual(
      craftingItems.map((item) => item.id),
      ['manager-crafting-nav-recipes', 'manager-crafting-nav-books-scrolls', 'manager-crafting-nav-settings']
    );
    assert.equal(craftingSubitem('Recipes').getAttribute('aria-current'), 'page');
    assert.equal(craftingSubitem('Recipes').classList.contains('is-active'), true);
    assert.equal(craftingSubitem('Settings').getAttribute('aria-current'), null);

    // Settings routes to the real crafting-rules page (resolution mode + visibility).
    craftingSubitem('Settings').click();
    await tick();
    flushSync();
    assert.equal(target.querySelector('.fabricate-manager').dataset.managerView, 'crafting-settings');
    assert.equal(craftingSubitem('Settings').getAttribute('aria-current'), 'page');
    assert.ok(target.querySelector('[data-crafting-settings]'), 'crafting settings page renders');
    assert.ok(
      target.querySelector('[data-crafting-resolution-mode]'),
      'the recipe resolution-mode card renders on Crafting Settings'
    );
    // The inspector aside is suppressed on the crafting-settings route.
    assert.equal(target.querySelector('.manager-inspector'), null);

    // Recipes sub-item routes back to the recipes browser.
    craftingSubitem('Recipes').click();
    await tick();
    flushSync();
    assert.equal(target.querySelector('.fabricate-manager').dataset.managerView, 'recipes');
    assert.equal(target.querySelectorAll('.manager-recipe-row').length, 2);
  });

  it('does not mark a Crafting subitem active while the group is expanded over a non-crafting route', async () => {
    target = document.createElement('div');
    document.body.appendChild(target);
    mounted = mount(Component, {
      target,
      props: {
        store: createStore([], { experimentalFeaturesEnabled: true }),
        services: { openCurrentAdmin: () => {} },
      },
    });
    flushSync();

    // On Components (a non-crafting route), manually expand the collapsed Crafting
    // group via its toggle.
    navButton('Components').click();
    await tick();
    flushSync();
    assert.equal(target.querySelector('.fabricate-manager').dataset.managerView, 'components');
    target.querySelector('#manager-nav-crafting + .manager-nav-toggle').click();
    await tick();
    flushSync();

    // The submenu is shown, but no subitem falsely reports the active/current page
    // (the state is guarded by isCraftingRoute, mirroring the Gathering group).
    assert.ok(target.querySelector('#manager-crafting-submenu'), 'submenu expands from a non-crafting route');
    assert.equal(craftingSubitem('Recipes').getAttribute('aria-current'), null);
    assert.equal(craftingSubitem('Recipes').classList.contains('is-active'), false);
    assert.equal(craftingSubitem('Settings').getAttribute('aria-current'), null);
    assert.equal(craftingSubitem('Books & Scrolls').getAttribute('aria-current'), null);
  });

  // Navigate the mounted manager to the Books & Scrolls surface via the Crafting
  // group and return the surface root for querying.
  async function openBooksScrolls(calls, storeOptions = {}) {
    target = document.createElement('div');
    document.body.appendChild(target);
    mounted = mount(Component, {
      target,
      props: {
        store: createStore(calls, { experimentalFeaturesEnabled: true, ...storeOptions }),
        services: { openCurrentAdmin: () => {} },
      },
    });
    flushSync();
    craftingParent().click();
    await tick();
    flushSync();
    craftingSubitem('Books & Scrolls').click();
    await tick();
    flushSync();
    return target;
  }

  // Projected recipe-item fixtures (issue 511, PR-B). The router forwards
  // `selectedSystem.recipeItemDefinitions` straight to BooksScrollsView, so these
  // carry the enriched projection fields the surface reads (resolvedName,
  // derivedType, recipes[], caps).
  const booksScrollsFixtures = [
    {
      id: 'ri1',
      name: 'Alchemist Cook Book',
      resolvedName: 'Alchemist Cook Book',
      resolvedImg: 'icons/sundries/books/book-worn-brown.webp',
      derivedType: 'Book',
      originItemUuid: 'Compendium.fabricate.items.cook-book',
      enabled: true,
      description: 'A well-thumbed book of potion recipes.',
      recipes: [{ id: 'r1', name: 'Healing Draught', category: 'potions' }],
      learnedByCount: 2,
      linkMissing: false,
      caps: { learn: { limitLearning: true, learningMode: 'once' } },
    },
    {
      id: 'ri2',
      name: 'Scroll of Elixirs',
      resolvedName: 'Scroll of Elixirs',
      resolvedImg: 'icons/sundries/scrolls/scroll-bound-brown.webp',
      derivedType: 'Scroll',
      originItemUuid: '',
      enabled: true,
      description: '',
      recipes: [],
      learnedByCount: 0,
      linkMissing: false,
      caps: { learn: { limitLearning: false } },
    },
  ];

  it('lists recipe items with recipe-count and cap chips and surfaces the item inspector on select', async () => {
    const calls = [];
    await openBooksScrolls(calls, { recipeItemDefinitions: booksScrollsFixtures });

    assert.equal(target.querySelector('.fabricate-manager').dataset.managerView, 'books-scrolls');
    assert.ok(target.querySelector('[data-books-scrolls]'), 'Books & Scrolls surface renders');
    // The parent nav count totals the visible sub-tabs: 2 recipes + 2 books & scrolls
    // items in the fixture (issue 643).
    assert.equal(craftingParent().querySelector('.manager-nav-count').textContent.trim(), '4');

    // Both recipe items are listed with their own recipe-count + learning chips.
    const cards = Array.from(target.querySelectorAll('[data-books-scrolls-item]'));
    assert.equal(cards.length, 2);
    assert.equal(
      target.querySelector('[data-books-scrolls-recipe-count="ri1"]').textContent.trim(),
      '1 recipe'
    );
    assert.equal(
      target.querySelector('[data-books-scrolls-recipe-count="ri2"]').textContent.trim(),
      'No recipes'
    );
    // Knowledge mode (default): the cap chip shows the learning limit.
    assert.equal(
      target.querySelector('[data-books-scrolls-cap-chip="ri1"]').getAttribute('data-books-scrolls-cap-limited'),
      'true'
    );
    assert.equal(
      target.querySelector('[data-books-scrolls-cap-chip="ri2"]').getAttribute('data-books-scrolls-cap-limited'),
      'false'
    );

    // Toggling a row's enabled flag routes through setRecipeItemEnabled (no draft).
    target.querySelector('[data-books-scrolls-toggle="ri1"]').click();
    await tick();
    flushSync();
    assert.ok(
      calls.some((call) => call[0] === 'setRecipeItemEnabled' && call[1] === 'ri1' && call[2] === false),
      'toggling a row calls setRecipeItemEnabled'
    );

    // Selecting a row surfaces the ItemPageInspector aside for that item.
    target.querySelector('[data-books-scrolls-select="ri2"]').click();
    await tick();
    flushSync();
    assert.ok(target.querySelector('[data-item-page-inspector]'), 'the item inspector renders on select');
    assert.equal(
      target.querySelector('[data-item-page-name]').textContent.trim(),
      'Scroll of Elixirs'
    );
    assert.equal(target.querySelector('[data-item-page-recipe-count]').textContent.trim(), '0');
  });

  it('opens the recipe-item editor from a Books & Scrolls row and saves the staged draft', async () => {
    const calls = [];
    await openBooksScrolls(calls, { recipeItemDefinitions: booksScrollsFixtures });

    // The pen action opens the full-window recipe-item editor route.
    target.querySelector('[data-books-scrolls-edit="ri1"]').click();
    await tick();
    flushSync();
    assert.equal(target.querySelector('.fabricate-manager').dataset.managerView, 'recipe-item-edit');
    assert.ok(target.querySelector('[data-recipe-item-editor]'), 'the recipe-item editor body renders');
    // The router owns the header + footer actions.
    assert.ok(target.querySelector('[data-recipe-item-back]'), 'Back action renders');
    assert.ok(target.querySelector('[data-recipe-item-delete]'), 'Delete action renders');
    const save = target.querySelector('[data-recipe-item-save]');
    assert.ok(save, 'Save action renders');
    assert.equal(save.disabled, true, 'Save is disabled until the draft is dirty');
    // The editor is fed the persisted linked recipe (r1) for ri1.
    assert.ok(target.textContent.includes('Alchemist Cook Book'), 'the linked item name shows in the editor');

    // Flipping the Overview Enabled toggle stages a draft change → dirty.
    target.querySelector('[data-recipe-item-enabled]').click();
    await tick();
    flushSync();
    assert.ok(target.querySelector('[data-recipe-item-dirty]'), 'the Unsaved chip appears when dirty');
    assert.equal(target.querySelector('[data-recipe-item-save]').disabled, false, 'Save enables when dirty');

    // Saving commits the whole draft in one saveRecipeItem call, then returns to
    // the Books & Scrolls surface.
    target.querySelector('[data-recipe-item-save]').click();
    await tick();
    flushSync();
    const saveCall = calls.find((call) => call[0] === 'saveRecipeItem' && call[1] === 'ri1');
    assert.ok(saveCall, 'Save routes through saveRecipeItem for ri1');
    assert.equal(saveCall[2].enabled, false, 'the staged enabled change is persisted');
    assert.equal(target.querySelector('.fabricate-manager').dataset.managerView, 'books-scrolls');
  });

  it('guards a dirty recipe-item editor exit through the confirm-discard chain', async () => {
    const calls = [];
    await openBooksScrolls(calls, {
      recipeItemDefinitions: booksScrollsFixtures,
      // Cancel the discard so navigation is blocked and the editor stays open.
      confirmDiscardRecipeItemResult: 'cancel',
    });

    target.querySelector('[data-books-scrolls-edit="ri1"]').click();
    await tick();
    flushSync();
    assert.equal(target.querySelector('.fabricate-manager').dataset.managerView, 'recipe-item-edit');

    // Make the draft dirty.
    target.querySelector('[data-recipe-item-enabled]').click();
    await tick();
    flushSync();

    // Attempting to leave via Back consults the confirm-discard guard; cancelling
    // keeps us on the editor route.
    target.querySelector('[data-recipe-item-back]').click();
    await tick();
    flushSync();
    assert.ok(
      calls.some((call) => call[0] === 'confirmDiscardDirtyRecipeItemDraft'),
      'a dirty exit enters the recipe-item confirm-discard chain'
    );
    assert.equal(
      target.querySelector('.fabricate-manager').dataset.managerView,
      'recipe-item-edit',
      'cancelling the discard keeps the editor open'
    );
  });

  it('opens the item picker to create a recipe item and then opens its editor', async () => {
    const calls = [];
    target = document.createElement('div');
    document.body.appendChild(target);
    mounted = mount(Component, {
      target,
      props: {
        store: createStore(calls, {
          experimentalFeaturesEnabled: true,
          recipeItemDefinitions: booksScrollsFixtures,
        }),
        services: {
          openCurrentAdmin: () => {},
          getWorldItemOptions: () => [
            { uuid: 'Compendium.world.items.tome', name: 'Tome of Wonders', img: '', type: 'book' },
          ],
        },
      },
    });
    flushSync();
    craftingParent().click();
    await tick();
    flushSync();
    craftingSubitem('Books & Scrolls').click();
    await tick();
    flushSync();

    // Create opens the router-owned item picker modal.
    target.querySelector('[data-books-scrolls-create]').click();
    await tick();
    flushSync();
    const pickerRow = document.querySelector('[data-item-picker-row]');
    assert.ok(pickerRow, 'the item picker lists world items');

    // Picking an item adds the definition and opens its editor.
    pickerRow.click();
    await tick();
    flushSync();
    await tick();
    flushSync();
    assert.ok(
      calls.some((call) => call[0] === 'addRecipeItemFromUuid' && call[2] === 'Compendium.world.items.tome'),
      'picking an item adds it via addRecipeItemFromUuid'
    );
    assert.equal(target.querySelector('.fabricate-manager').dataset.managerView, 'recipe-item-edit');
  });

  it('exposes the Access sub-tab under restricted visibility and grants a recipe', async () => {
    const calls = [];
    target = document.createElement('div');
    document.body.appendChild(target);
    mounted = mount(Component, {
      target,
      props: {
        store: createStore(calls, {
          experimentalFeaturesEnabled: true,
          selectedSystemOverrides: { visibilityMode: 'restricted' },
          pcRoster: [{ id: 'char1', name: 'Aria', img: '' }],
        }),
        services: { openCurrentAdmin: () => {} },
      },
    });
    flushSync();

    // Restricted visibility surfaces the Access sub-tab (and hides Books & Scrolls).
    craftingParent().click();
    await tick();
    flushSync();
    assert.ok(craftingSubitem('Access'), 'the Access sub-tab is shown under restricted visibility');
    assert.equal(craftingSubitem('Books & Scrolls'), undefined, 'Books & Scrolls is hidden under restricted');

    craftingSubitem('Access').click();
    await tick();
    flushSync();
    assert.equal(target.querySelector('.fabricate-manager').dataset.managerView, 'access');
    assert.ok(target.querySelector('[data-access-search]'), 'the access list renders');
    assert.ok(target.querySelectorAll('[data-access-row]').length >= 1, 'recipes are listed');

    // Selecting a recipe surfaces the GrantAccessInspector.
    target.querySelector('[data-access-row="r1"]').click();
    await tick();
    flushSync();
    assert.ok(target.querySelector('[data-access-roster]'), 'the grant-access inspector renders on select');
  });

  it('shows the Books & Scrolls empty state when the system has no recipe items', async () => {
    const calls = [];
    await openBooksScrolls(calls, { recipeItemDefinitions: [] });

    assert.equal(target.querySelector('.fabricate-manager').dataset.managerView, 'books-scrolls');
    assert.ok(target.querySelector('[data-books-scrolls-empty]'), 'empty state renders');
    assert.equal(target.querySelectorAll('[data-books-scrolls-item]').length, 0);
    assert.ok(target.textContent.includes('No recipe items yet'));
  });

  it('routes to the environments browser and opens the forced v2 editor route', async () => {
    const calls = [];
    target = document.createElement('div');
    document.body.appendChild(target);
    mounted = mount(Component, {
      target,
      props: {
        store: createStore(calls),
        services: { openCurrentAdmin: () => {} },
      },
    });
    flushSync();

    navButton('Gathering').click();
    await tick();
    flushSync();

    assert.equal(target.querySelector('.fabricate-manager').dataset.managerView, 'environments');
    assert.equal(target.querySelectorAll('.manager-environment-row').length, 2);
    assert.ok(target.textContent.includes('Gathering environments'));
    assert.ok(target.textContent.includes('Moonlit Forest'));
    assert.ok(target.textContent.includes('Quiet Cavern'));
    const gatheringParent = target.querySelector('#manager-nav-gathering');
    assert.equal(gatheringParent.getAttribute('aria-expanded'), 'true');
    assert.equal(gatheringParent.classList.contains('is-active'), false);
    assert.equal(
      target.querySelector('.manager-nav-group').classList.contains('is-expanded'),
      true
    );
    // The parent count is the sum of records (environments + tasks + events), not
    // the subitem count. Travel is hidden by default (Travel & Realms toggle off).
    assert.equal(gatheringParent.querySelector('.manager-nav-count').textContent.trim(), '5');
    assert.equal(gatheringToggle().getAttribute('aria-label'), 'Collapse gathering menu');
    const gatheringItems = Array.from(target.querySelectorAll('.manager-nav-subitem'));
    assert.deepEqual(
      gatheringItems.map((item) => item.querySelector('.manager-nav-label')?.textContent.trim()),
      ['Environments', 'Tasks', 'Events', 'Settings']
    );
    assert.deepEqual(
      gatheringItems.map(
        (item) => item.querySelector('.manager-nav-count')?.textContent.trim() ?? null
      ),
      ['2', '3', '0', null]
    );
    assert.equal(gatheringSubitem('Environments').getAttribute('aria-current'), 'page');
    assert.equal(target.querySelectorAll('.manager-gathering-tab').length, 0);

    gatheringToggle().click();
    await tick();
    flushSync();
    assert.equal(target.querySelector('.fabricate-manager').dataset.managerView, 'environments');
    assert.equal(target.querySelectorAll('.manager-nav-subitem').length, 4);
    assert.equal(
      target.querySelector('#manager-nav-gathering').getAttribute('aria-expanded'),
      'true'
    );
    assert.equal(
      target.querySelector('.manager-nav-group').classList.contains('is-expanded'),
      true
    );

    gatheringSubitem('Tasks').click();
    await tick();
    flushSync();

    assert.equal(gatheringSubitem('Tasks').getAttribute('aria-current'), 'page');
    assert.equal(
      target.querySelector('#manager-nav-gathering').classList.contains('is-active'),
      false
    );
    assert.equal(gatheringSubitem('Tasks').classList.contains('is-active'), true);
    target.querySelector('#manager-nav-gathering').click();
    await tick();
    flushSync();
    assert.equal(gatheringSubitem('Tasks').getAttribute('aria-current'), 'page');
    assert.equal(gatheringSubitem('Tasks').classList.contains('is-active'), true);
    gatheringToggle().click();
    await tick();
    flushSync();
    assert.equal(target.querySelectorAll('.manager-nav-subitem').length, 4);
    assert.equal(
      target.querySelector('#manager-nav-gathering').getAttribute('aria-expanded'),
      'true'
    );
    assert.equal(target.querySelectorAll('.manager-gathering-task-row').length, 3);
    assert.ok(target.textContent.includes('Gather Moon Herbs'));
    assert.ok(target.textContent.includes('Prospect Crystal Veins'));
    const tasksHead = target.querySelector('.manager-gathering-task-table-head');
    const taskHeaders = Array.from(tasksHead.querySelectorAll('[role="columnheader"]')).map(
      (node) => node.textContent.trim()
    );
    assert.equal(taskHeaders.length, 4, 'task table should have four headers');
    assert.deepEqual(taskHeaders, ['Gathering task', 'Tags', 'Status', 'Actions']);
    const firstTaskRow = target.querySelector('.manager-gathering-task-row');
    const tagsCell = firstTaskRow.querySelector(
      '.manager-gathering-task-tags-cell[data-gathering-task-tags]'
    );
    assert.ok(tagsCell, 'tags chip cell renders as its own grid cell');
    const tagPills = Array.from(tagsCell.querySelectorAll('.manager-availability-pill'));
    const tagKinds = new Set();
    for (const pill of tagPills) {
      for (const kind of ['biome', 'timeOfDay', 'weather']) {
        if (pill.classList.contains(`is-${kind}`)) tagKinds.add(kind);
      }
    }
    assert.equal(
      tagKinds.size,
      3,
      'tags row should contain chips from all composition dimensions (biome/time/weather); region is geography, not composition'
    );
    const description = firstTaskRow.querySelector(
      '.manager-gathering-task-identity .manager-system-description'
    );
    assert.ok(
      description && description.textContent.trim().length > 0,
      'short description should render under the task name'
    );
    assert.ok(
      target
        .querySelector('[data-gathering-task-inspector]')
        .textContent.includes('Selected gathering task')
    );
    assert.equal(
      target.querySelector('.manager-inspector').textContent.includes('Gathering task actions'),
      false,
      'selected gathering task inspector should not duplicate row actions'
    );
    assert.equal(
      target.querySelector('.manager-inspector [aria-label="Edit Gather Moon Herbs"]'),
      null,
      'selected gathering task inspector should not render edit action buttons'
    );
    assert.equal(
      target.querySelector('.manager-inspector [aria-label="Duplicate Gather Moon Herbs"]'),
      null,
      'selected gathering task inspector should not render duplicate action buttons'
    );
    assert.equal(
      target.querySelector('.manager-inspector [aria-label="Delete Gather Moon Herbs"]'),
      null,
      'selected gathering task inspector should not render delete action buttons'
    );
    assert.equal(
      target.querySelector('[data-gathering-task-inspector] .manager-action-group'),
      null,
      'selected gathering task identity card should not contain an action group'
    );
    const dropChips = target.querySelectorAll(
      '[data-task-drops-summary] [data-task-drop-summary-chip]'
    );
    assert.ok(
      Array.from(dropChips).some(
        (chip) =>
          chip.textContent.includes(
            'Nightshade With An Exceptionally Long Localized Component Name'
          ) && chip.textContent.includes('80%')
      ),
      'drops summary should show the nightshade drop name + chance'
    );
    assert.equal(
      target.querySelector('[data-gathering-task-fact="environments"] strong').textContent.trim(),
      '1'
    );
    // Region is no longer a composition fact in the task inspector.
    assert.equal(
      target.querySelector('[data-gathering-task-fact="region"]'),
      null,
      'region fact is removed from the task inspector'
    );
    // A user-defined biome keeps its contextual label inline (e.g. "2 Biome").
    const taskBiomeFact = target.querySelector('[data-gathering-task-fact="biomes"]');
    assert.ok(
      taskBiomeFact.querySelector('.manager-fact-label'),
      'a user-defined biome count should keep its contextual label'
    );

    const taskSearch = target.querySelector('[data-gathering-tasks-browser] input[type="search"]');
    taskSearch.value = 'crystal';
    taskSearch.dispatchEvent(new Event('input', { bubbles: true }));
    await tick();
    flushSync();
    assert.equal(target.querySelectorAll('.manager-gathering-task-row').length, 1);
    assert.ok(target.textContent.includes('Prospect Crystal Veins'));

    target.querySelector('[data-clear-filters="gathering-tasks"]').click();
    await tick();
    flushSync();
    const taskSelects = target.querySelectorAll(
      '[data-gathering-tasks-browser] .manager-filter select'
    );
    taskSelects[0].value = 'disabled';
    taskSelects[0].dispatchEvent(new Event('change', { bubbles: true }));
    await tick();
    flushSync();
    assert.equal(target.querySelectorAll('.manager-gathering-task-row').length, 1);
    assert.ok(target.textContent.includes('South Coast Driftwood'));

    target.querySelector('[data-clear-filters="gathering-tasks"]').click();
    await tick();
    flushSync();
    // Region filter is removed; the biome filter is now the second select.
    taskSelects[1].value = 'cavern';
    taskSelects[1].dispatchEvent(new Event('change', { bubbles: true }));
    await tick();
    flushSync();
    assert.equal(target.querySelectorAll('.manager-gathering-task-row').length, 1);
    assert.ok(target.textContent.includes('Prospect Crystal Veins'));
    target.querySelector('[data-clear-filters="gathering-tasks"]').click();
    await tick();
    flushSync();
    taskSelects[2].value = 'mismatch';
    taskSelects[2].dispatchEvent(new Event('change', { bubbles: true }));
    await tick();
    flushSync();
    assert.equal(target.querySelectorAll('.manager-gathering-task-row').length, 2);

    target.querySelector('[data-clear-filters="gathering-tasks"]').click();
    await tick();
    flushSync();
    target.querySelector('[data-gathering-task-id="task-herbs"] .manager-status-toggle').click();
    target
      .querySelector(
        '[data-gathering-task-id="task-herbs"] [aria-label="Duplicate Gather Moon Herbs"]'
      )
      .click();
    target
      .querySelector(
        '[data-gathering-task-id="task-herbs"] [aria-label="Delete Gather Moon Herbs"]'
      )
      .click();
    assert.ok(
      calls.some(
        (call) =>
          call[0] === 'updateGatheringLibraryTask' &&
          call[1] === 'alchemy' &&
          call[2] === 'task-herbs' &&
          call[3].enabled === false
      )
    );
    assert.ok(
      calls.some(
        (call) =>
          call[0] === 'duplicateGatheringLibraryTask' &&
          call[1] === 'alchemy' &&
          call[2] === 'task-herbs'
      )
    );
    assert.ok(
      calls.some(
        (call) =>
          call[0] === 'deleteGatheringLibraryTask' &&
          call[1] === 'alchemy' &&
          call[2] === 'task-herbs'
      )
    );

    target
      .querySelector('[data-gathering-task-id="task-herbs"] [aria-label="Edit Gather Moon Herbs"]')
      .click();
    await tick();
    flushSync();
    assert.equal(
      target.querySelector('.fabricate-manager').dataset.managerView,
      'gathering-task-edit'
    );
    target.querySelector('#manager-nav-gathering').click();
    await tick();
    flushSync();
    assert.equal(
      target.querySelector('.fabricate-manager').dataset.managerView,
      'gathering-task-edit'
    );
    gatheringToggle().click();
    await tick();
    flushSync();
    assert.equal(target.querySelectorAll('.manager-nav-subitem').length, 4);
    assert.equal(
      target.querySelector('#manager-nav-gathering').getAttribute('aria-expanded'),
      'true'
    );
    assert.ok(target.querySelector('[data-gathering-task-editor]'));
    const coreEditor = target.querySelector('[data-gathering-task-core-editor]');
    assert.ok(coreEditor);
    assert.equal(coreEditor.querySelector('.manager-link-button'), null);
    assert.equal(coreEditor.textContent.includes('Back to task library'), false);
    assert.ok(target.textContent.includes('Task Identity'));
    assert.equal(target.textContent.includes('Internal ID'), false);
    assert.ok(
      target.textContent.includes(
        'Edit availability, identity, and drop rules for the selected gathering task.'
      )
    );
    assert.ok(target.querySelector('[data-gathering-task-drops-table]'));
    assert.ok(target.querySelector('[data-gathering-task-drop-inspector]'));
    const dropInspector = target.querySelector('[data-gathering-task-drop-inspector]');
    const dropInspectorChildren = Array.from(dropInspector.children);
    assert.ok(dropInspectorChildren[0].classList.contains('manager-drop-editor-header-card'));
    assert.equal(dropInspectorChildren[0].classList.contains('is-sticky'), false);
    assert.ok(dropInspectorChildren[1].classList.contains('manager-drop-inspector-divider'));
    assert.ok(dropInspectorChildren[2].classList.contains('manager-drop-inspector-scroll'));
    assert.ok(dropInspectorChildren[2].querySelector('.manager-drop-editor-card'));
    assert.ok(dropInspectorChildren[2].querySelector('[data-gathering-drop-character-modifiers]'));
    assert.equal(target.querySelector('.manager-task-editor-tabs'), null);
    assert.equal(target.querySelector('[data-gathering-task-summary]'), null);
    assert.equal(target.querySelector('[data-gathering-task-matching-logic]'), null);
    assert.ok(target.textContent.includes('Drop chance'));
    assert.equal(target.querySelector('.manager-task-card-header .manager-drop-count'), null);
    assert.ok(target.querySelector('.manager-task-drop-footer [data-gathering-task-drop-count]'));
    const dropColumnHeaders = Array.from(
      target.querySelectorAll('[data-gathering-task-drops-table] [role="columnheader"]')
    ).map((node) => node.textContent.trim());
    assert.ok(dropColumnHeaders.includes('Count'));
    assert.ok(
      dropColumnHeaders.includes('#'),
      'highestRankedDrop mode should surface the rank column header'
    );
    assert.equal(dropColumnHeaders.includes('Quantity'), false);
    assert.equal(dropColumnHeaders.includes('Actions'), false);
    const populatedDropRow = target.querySelector(
      '[data-gathering-task-drop-id="drop-nightshade"]'
    );
    assert.equal(populatedDropRow.querySelector('[data-gathering-task-drop-row-number]'), null);
    const populatedComponentCell = populatedDropRow.querySelector(
      '[data-gathering-task-drop-component-cell]'
    );
    const populatedComponentButton = populatedComponentCell.querySelector(
      '.manager-drop-component-button'
    );
    assert.ok(populatedComponentButton);
    const populatedComponentThumb = populatedComponentCell.querySelector(
      '.manager-gathering-task-thumb'
    );
    assert.ok(populatedComponentThumb);
    assert.equal(populatedComponentButton.getAttribute('title'), 'Right-click to clear component');
    assert.ok(
      populatedComponentCell.textContent.includes(
        'Nightshade With An Exceptionally Long Localized Component Name'
      )
    );
    assert.equal(
      populatedComponentCell.querySelector(
        '.manager-drop-component-button .manager-system-description'
      ),
      null
    );
    assert.equal(
      populatedComponentCell.textContent.includes('A dusky flowering herb used in careful doses.'),
      false
    );
    assert.equal(populatedComponentCell.textContent.includes('Unresolved drop'), false);
    assert.equal(populatedDropRow.textContent.includes('Drop component'), false);
    assert.equal(populatedDropRow.textContent.includes('Drop chance'), false);
    assert.equal(populatedDropRow.textContent.includes('Quantity'), false);
    assert.equal(populatedDropRow.textContent.includes('award'), false);
    const populatedChanceCell = populatedDropRow.querySelector(
      '[data-gathering-task-drop-chance-cell]'
    );
    const dropRateInput = populatedChanceCell.querySelector('.manager-drop-rate-percent input');
    assert.equal(dropRateInput.getAttribute('type'), 'text');
    assert.equal(dropRateInput.getAttribute('inputmode'), 'numeric');
    assert.equal(dropRateInput.getAttribute('pattern'), '[0-9]*');
    assert.equal(dropRateInput.value, '80');
    const dropRateControl = populatedChanceCell.querySelector('input[type="range"]').parentElement;
    assert.ok(dropRateControl.classList.contains('manager-drop-rate-control'));
    assert.ok(dropRateControl.classList.contains('is-common'));
    assert.ok(dropRateControl.getAttribute('style').includes('--fab-drop-rate-value: 80%;'));
    assert.ok(
      dropRateControl
        .getAttribute('style')
        .includes('--fab-drop-rate-color: var(--fab-drop-rate-common);')
    );
    dropRateInput.value = '07a';
    dropRateInput.dispatchEvent(new Event('input', { bubbles: true }));
    await tick();
    flushSync();
    assert.equal(dropRateInput.value, '7');
    const updatedDropRateInput = populatedDropRow.querySelector('.manager-drop-rate-percent input');
    updatedDropRateInput.value = '150';
    updatedDropRateInput.dispatchEvent(new Event('input', { bubbles: true }));
    await tick();
    flushSync();
    assert.equal(updatedDropRateInput.value, '150');
    updatedDropRateInput.dispatchEvent(new Event('blur', { bubbles: true }));
    await tick();
    flushSync();
    assert.equal(updatedDropRateInput.value, '7');
    let stepDropRateInput = populatedDropRow.querySelector('.manager-drop-rate-percent input');
    const dropRateArrowUpEvent = new KeyboardEvent('keydown', {
      key: 'ArrowUp',
      bubbles: true,
      cancelable: true,
    });
    stepDropRateInput.dispatchEvent(dropRateArrowUpEvent);
    await tick();
    flushSync();
    assert.equal(dropRateArrowUpEvent.defaultPrevented, true);
    assert.equal(stepDropRateInput.value, '8');
    stepDropRateInput = populatedDropRow.querySelector('.manager-drop-rate-percent input');
    stepDropRateInput.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true, cancelable: true })
    );
    await tick();
    flushSync();
    assert.equal(stepDropRateInput.value, '7');
    stepDropRateInput = populatedDropRow.querySelector('.manager-drop-rate-percent input');
    stepDropRateInput.value = '100';
    stepDropRateInput.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'ArrowUp', bubbles: true, cancelable: true })
    );
    await tick();
    flushSync();
    assert.equal(stepDropRateInput.value, '100');
    stepDropRateInput.value = '0';
    stepDropRateInput.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true, cancelable: true })
    );
    await tick();
    flushSync();
    assert.equal(stepDropRateInput.value, '0');
    const quantityInput = populatedDropRow.querySelector('.manager-drop-quantity-cell input');
    assert.equal(quantityInput.getAttribute('type'), 'text');
    assert.equal(quantityInput.getAttribute('inputmode'), 'numeric');
    assert.equal(quantityInput.getAttribute('pattern'), '[1-9][0-9]{0,2}');
    assert.equal(quantityInput.value, '2');
    quantityInput.value = 'abc0';
    quantityInput.dispatchEvent(new Event('input', { bubbles: true }));
    await tick();
    flushSync();
    assert.equal(quantityInput.value, '');
    quantityInput.value = '03a';
    quantityInput.dispatchEvent(new Event('input', { bubbles: true }));
    await tick();
    flushSync();
    assert.equal(quantityInput.value, '3');
    let stepQuantityInput = populatedDropRow.querySelector('.manager-drop-quantity-cell input');
    const quantityArrowUpEvent = new KeyboardEvent('keydown', {
      key: 'ArrowUp',
      bubbles: true,
      cancelable: true,
    });
    stepQuantityInput.dispatchEvent(quantityArrowUpEvent);
    await tick();
    flushSync();
    assert.equal(quantityArrowUpEvent.defaultPrevented, true);
    assert.equal(stepQuantityInput.value, '4');
    stepQuantityInput = populatedDropRow.querySelector('.manager-drop-quantity-cell input');
    stepQuantityInput.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true, cancelable: true })
    );
    await tick();
    flushSync();
    assert.equal(stepQuantityInput.value, '3');
    stepQuantityInput = populatedDropRow.querySelector('.manager-drop-quantity-cell input');
    stepQuantityInput.value = '999';
    stepQuantityInput.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'ArrowUp', bubbles: true, cancelable: true })
    );
    await tick();
    flushSync();
    assert.equal(stepQuantityInput.value, '999');
    stepQuantityInput = populatedDropRow.querySelector('.manager-drop-quantity-cell input');
    stepQuantityInput.value = '1';
    stepQuantityInput.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true, cancelable: true })
    );
    await tick();
    flushSync();
    assert.equal(stepQuantityInput.value, '1');
    stepQuantityInput = populatedDropRow.querySelector('.manager-drop-quantity-cell input');
    stepQuantityInput.value = '1000';
    stepQuantityInput.dispatchEvent(new Event('input', { bubbles: true }));
    await tick();
    flushSync();
    assert.equal(stepQuantityInput.value, '1000');
    stepQuantityInput.dispatchEvent(new Event('blur', { bubbles: true }));
    await tick();
    flushSync();
    assert.equal(stepQuantityInput.value, '1');
    const modifierPills = populatedDropRow.querySelectorAll('.manager-drop-modifier-pill');
    assert.equal(modifierPills.length, 4);
    assert.ok(
      Array.from(modifierPills).some(
        (pill) =>
          pill.classList.contains('is-negative') &&
          pill.textContent.includes('Moon Forest') &&
          pill.textContent.includes('-10%')
      ),
      'biome drop modifiers should render in the row'
    );
    assert.ok(
      Array.from(modifierPills).some(
        (pill) =>
          pill.classList.contains('is-positive') &&
          pill.textContent.includes('Deep Night') &&
          pill.textContent.includes('+20%')
      )
    );
    assert.ok(
      Array.from(modifierPills).some(
        (pill) =>
          pill.classList.contains('is-negative') &&
          pill.textContent.includes('Clear Sky') &&
          pill.textContent.includes('-15%')
      )
    );
    assert.ok(
      Array.from(modifierPills).some(
        (pill) =>
          pill.classList.contains('is-neutral') &&
          pill.textContent.includes('High Day') &&
          pill.textContent.includes('+0%')
      )
    );
    assert.equal(populatedDropRow.querySelector('[aria-label="Duplicate"]'), null);
    assert.equal(populatedDropRow.querySelector('[aria-label="Delete"]'), null);
    const selectedDropInspector = target.querySelector('[data-gathering-task-drop-inspector]');
    const selectedDropActions = selectedDropInspector.querySelector('.manager-drop-editor-actions');
    assert.ok(selectedDropActions);
    assert.ok(
      selectedDropActions.previousElementSibling?.classList.contains('manager-inspector-title-row')
    );
    assert.ok(selectedDropActions.querySelector('[aria-label="Duplicate"]'));
    assert.ok(selectedDropActions.querySelector('[aria-label="Delete"]'));
    assert.equal(selectedDropInspector.textContent.includes('Drop component'), false);
    assert.equal(selectedDropInspector.textContent.includes('Select a component'), false);
    const inspectorRateEditor = selectedDropInspector.querySelector(
      '[data-gathering-drop-inspector-rate]'
    );
    assert.ok(inspectorRateEditor.textContent.includes('Drop chance'));
    const inspectorRateInput = inspectorRateEditor.querySelector(
      '.manager-drop-rate-percent input'
    );
    assert.equal(inspectorRateInput.getAttribute('type'), 'text');
    assert.equal(inspectorRateInput.getAttribute('inputmode'), 'numeric');
    assert.equal(inspectorRateInput.value, '0');
    const inspectorRateControl = inspectorRateEditor.querySelector('.manager-drop-rate-control');
    assert.ok(inspectorRateControl.classList.contains('is-none'));
    assert.ok(inspectorRateControl.getAttribute('style').includes('--fab-drop-rate-value: 0%;'));
    assert.ok(
      inspectorRateControl
        .getAttribute('style')
        .includes('--fab-drop-rate-color: var(--fab-drop-rate-none);')
    );
    inspectorRateInput.value = '09x';
    inspectorRateInput.dispatchEvent(new Event('input', { bubbles: true }));
    await tick();
    flushSync();
    assert.equal(inspectorRateInput.value, '9');
    let refreshedInspectorRateInput = selectedDropInspector.querySelector(
      '[data-gathering-drop-inspector-rate] .manager-drop-rate-percent input'
    );
    const inspectorRateArrowUpEvent = new KeyboardEvent('keydown', {
      key: 'ArrowUp',
      bubbles: true,
      cancelable: true,
    });
    refreshedInspectorRateInput.dispatchEvent(inspectorRateArrowUpEvent);
    await tick();
    flushSync();
    assert.equal(inspectorRateArrowUpEvent.defaultPrevented, true);
    assert.equal(refreshedInspectorRateInput.value, '10');
    refreshedInspectorRateInput = selectedDropInspector.querySelector(
      '[data-gathering-drop-inspector-rate] .manager-drop-rate-percent input'
    );
    refreshedInspectorRateInput.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true, cancelable: true })
    );
    await tick();
    flushSync();
    assert.equal(refreshedInspectorRateInput.value, '9');
    const inspectorCountEditor = selectedDropInspector.querySelector(
      '[data-gathering-drop-inspector-count]'
    );
    assert.ok(inspectorCountEditor.textContent.includes('Count'));
    const inspectorCountInput = inspectorCountEditor.querySelector('input');
    assert.equal(inspectorCountInput.getAttribute('type'), 'text');
    assert.equal(inspectorCountInput.getAttribute('inputmode'), 'numeric');
    assert.equal(inspectorCountInput.getAttribute('pattern'), '[1-9][0-9]{0,2}');
    assert.equal(inspectorCountInput.value, '1');
    inspectorCountInput.value = '06x';
    inspectorCountInput.dispatchEvent(new Event('input', { bubbles: true }));
    await tick();
    flushSync();
    assert.equal(inspectorCountInput.value, '6');
    let refreshedInspectorCountInput = selectedDropInspector.querySelector(
      '[data-gathering-drop-inspector-count] input'
    );
    const inspectorCountArrowDownEvent = new KeyboardEvent('keydown', {
      key: 'ArrowDown',
      bubbles: true,
      cancelable: true,
    });
    refreshedInspectorCountInput.dispatchEvent(inspectorCountArrowDownEvent);
    await tick();
    flushSync();
    assert.equal(inspectorCountArrowDownEvent.defaultPrevented, true);
    assert.equal(refreshedInspectorCountInput.value, '5');
    refreshedInspectorCountInput = selectedDropInspector.querySelector(
      '[data-gathering-drop-inspector-count] input'
    );
    refreshedInspectorCountInput.value = '1000';
    refreshedInspectorCountInput.dispatchEvent(new Event('input', { bubbles: true }));
    await tick();
    flushSync();
    assert.equal(refreshedInspectorCountInput.value, '1000');
    refreshedInspectorCountInput.dispatchEvent(new Event('blur', { bubbles: true }));
    await tick();
    flushSync();
    assert.equal(refreshedInspectorCountInput.value, '5');
    assert.equal(populatedDropRow.querySelector('[aria-label="Select drop rule"]'), null);
    assert.equal(populatedDropRow.querySelector('[aria-label="Edit drop rule"]'), null);
    const mediaColumn = coreEditor.querySelector('.manager-task-media-column');
    const taskImagePicker = coreEditor.querySelector('.manager-task-image-picker');
    const taskStatus = coreEditor.querySelector('.manager-task-core-status');
    const taskStatusToggle = taskStatus.querySelector('.manager-status-toggle');
    assert.equal(mediaColumn.firstElementChild, taskImagePicker);
    assert.equal(mediaColumn.children[1], taskStatus);
    assert.equal(taskStatusToggle.tagName, 'BUTTON');
    assert.equal(taskStatusToggle.querySelector('input'), null);
    assert.equal(
      taskStatusToggle.querySelector('.manager-status-toggle-label').textContent.trim(),
      'Off'
    );
    taskStatusToggle.click();
    await tick();
    flushSync();
    assert.equal(
      taskStatusToggle.querySelector('.manager-status-toggle-label').textContent.trim(),
      'On'
    );
    const taskNameInput = target.querySelector('[data-gathering-task-field="name"]');
    assert.equal(
      Boolean(
        taskNameInput.compareDocumentPosition(taskImagePicker) & Node.DOCUMENT_POSITION_PRECEDING
      ),
      true,
      'task name should be positioned after the image column in the core editor'
    );
    taskNameInput.value = 'Gather Sun Herbs';
    taskNameInput.dispatchEvent(new Event('input', { bubbles: true }));
    await tick();
    flushSync();
    assert.equal(taskNameInput.value, 'Gather Sun Herbs');
    const biomeAvailability = target.querySelector('[data-gathering-task-field="biomes"]');
    const timeAvailability = target.querySelector('[data-gathering-task-field="timeOfDay"]');
    const weatherAvailability = target.querySelector('[data-gathering-task-field="weather"]');
    // Region is no longer a task availability/composition axis.
    assert.equal(
      target.querySelector('[data-gathering-task-field="regions"]'),
      null,
      'region availability picker is removed from the task editor'
    );
    assert.equal(timeAvailability.querySelector('select'), null);
    assert.equal(weatherAvailability.querySelector('select'), null);
    assert.equal(biomeAvailability.querySelector('select'), null);
    const biomePill = biomeAvailability.querySelector(
      '[data-gathering-task-availability-pill="biomes"][data-condition-id="forest"]'
    );
    const timePill = timeAvailability.querySelector(
      '[data-gathering-task-availability-pill="timeOfDay"][data-condition-id="day"]'
    );
    const weatherPill = weatherAvailability.querySelector(
      '[data-gathering-task-availability-pill="weather"][data-condition-id="clear"]'
    );
    assert.ok(biomePill);
    assert.ok(biomePill.textContent.includes('Moon Forest'));
    assert.ok(biomePill.querySelector('i.fas.fa-tree'));
    assert.ok(timePill);
    assert.ok(timePill.textContent.includes('High Day'));
    assert.ok(timePill.querySelector('i.fas.fa-sun'));
    assert.ok(weatherPill);
    assert.ok(weatherPill.textContent.includes('Clear Sky'));
    assert.ok(weatherPill.querySelector('i.fas.fa-sun'));

    biomeAvailability.querySelector('.manager-availability-menu-button').click();
    await tick();
    flushSync();
    assert.equal(
      biomeAvailability.querySelector(
        '[data-gathering-task-availability-option="biomes"][data-condition-id="forest"]'
      ),
      null
    );
    assert.deepEqual(
      Array.from(
        biomeAvailability.querySelectorAll('[data-gathering-task-availability-option="biomes"]')
      ).map((option) => option.textContent.trim()),
      ['Crystal Cavern']
    );
    assert.ok(biomeAvailability.querySelector('[data-condition-id="cavern"] i.fas.fa-gem'));
    biomeAvailability
      .querySelector(
        '[data-gathering-task-availability-option="biomes"][data-condition-id="cavern"]'
      )
      .click();
    await tick();
    flushSync();
    assert.ok(
      biomeAvailability.querySelector(
        '[data-gathering-task-availability-pill="biomes"][data-condition-id="cavern"]'
      )
    );

    biomeAvailability
      .querySelector(
        '[data-gathering-task-availability-pill="biomes"][data-condition-id="forest"] .manager-availability-remove'
      )
      .click();
    await tick();
    flushSync();
    assert.equal(
      biomeAvailability.querySelector(
        '[data-gathering-task-availability-pill="biomes"][data-condition-id="forest"]'
      ),
      null
    );

    biomeAvailability
      .querySelector(
        '[data-gathering-task-availability-pill="biomes"][data-condition-id="cavern"] .manager-availability-remove'
      )
      .click();
    await tick();
    flushSync();
    assert.ok(biomeAvailability.textContent.includes('Any Biome'));

    timeAvailability.querySelector('.manager-availability-menu-button').click();
    await tick();
    flushSync();
    assert.equal(
      timeAvailability.querySelector(
        '[data-gathering-task-availability-option="timeOfDay"][data-condition-id="day"]'
      ),
      null
    );
    assert.deepEqual(
      Array.from(
        timeAvailability.querySelectorAll('[data-gathering-task-availability-option="timeOfDay"]')
      ).map((option) => option.textContent.trim()),
      ['First Light', 'Deep Night']
    );
    assert.ok(timeAvailability.querySelector('[data-condition-id="night"] i.fas.fa-moon'));
    timeAvailability
      .querySelector(
        '[data-gathering-task-availability-option="timeOfDay"][data-condition-id="night"]'
      )
      .click();
    await tick();
    flushSync();
    assert.ok(
      timeAvailability.querySelector(
        '[data-gathering-task-availability-pill="timeOfDay"][data-condition-id="night"]'
      )
    );

    timeAvailability
      .querySelector(
        '[data-gathering-task-availability-pill="timeOfDay"][data-condition-id="day"] .manager-availability-remove'
      )
      .click();
    await tick();
    flushSync();
    assert.equal(
      timeAvailability.querySelector(
        '[data-gathering-task-availability-pill="timeOfDay"][data-condition-id="day"]'
      ),
      null
    );

    weatherAvailability.querySelector('.manager-availability-menu-button').click();
    await tick();
    flushSync();
    assert.equal(
      weatherAvailability.querySelector(
        '[data-gathering-task-availability-option="weather"][data-condition-id="clear"]'
      ),
      null
    );
    assert.deepEqual(
      Array.from(
        weatherAvailability.querySelectorAll('[data-gathering-task-availability-option="weather"]')
      ).map((option) => option.textContent.trim()),
      ['Storm Rain']
    );
    assert.ok(
      weatherAvailability.querySelector(
        '[data-condition-id="heavy-rain"] i.fas.fa-cloud-showers-heavy'
      )
    );
    weatherAvailability
      .querySelector(
        '[data-gathering-task-availability-option="weather"][data-condition-id="heavy-rain"]'
      )
      .click();
    await tick();
    flushSync();
    assert.ok(
      weatherAvailability.querySelector(
        '[data-gathering-task-availability-pill="weather"][data-condition-id="heavy-rain"]'
      )
    );

    weatherAvailability
      .querySelector(
        '[data-gathering-task-availability-pill="weather"][data-condition-id="clear"] .manager-availability-remove'
      )
      .click();
    await tick();
    flushSync();
    assert.equal(
      weatherAvailability.querySelector(
        '[data-gathering-task-availability-pill="weather"][data-condition-id="clear"]'
      ),
      null
    );
    for (const availability of [biomeAvailability, timeAvailability, weatherAvailability]) {
      availability.querySelector('.manager-availability-menu-button').click();
      await tick();
      flushSync();
      assert.ok(
        availability.querySelector('.manager-availability-menu'),
        'picker menu should open on trigger click'
      );
      document.body.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }));
      await tick();
      flushSync();
      assert.equal(
        availability.querySelector('.manager-availability-menu'),
        null,
        'picker menu should dismiss on outside mousedown'
      );
    }
    const inspectorSlider = target.querySelector(
      '[data-gathering-task-drop-inspector] input[type="range"]'
    );
    inspectorSlider.value = '35';
    inspectorSlider.dispatchEvent(new Event('input', { bubbles: true }));
    await tick();
    flushSync();
    assert.equal(
      target.querySelector(
        '[data-gathering-task-drop-inspector] [data-gathering-drop-inspector-rate] input[type="text"]'
      ).value,
      '35'
    );
    const chanceSlider = target.querySelector(
      '[data-gathering-task-drop-id="drop-nightshade"] input[type="range"]'
    );
    chanceSlider.value = '25';
    chanceSlider.dispatchEvent(new Event('input', { bubbles: true }));
    await tick();
    flushSync();
    assert.equal(
      target.querySelector(
        '[data-gathering-task-drop-id="drop-nightshade"] .manager-drop-rate-percent input'
      ).value,
      '25'
    );
    target.querySelector('[data-gathering-task-drop-inspector] [aria-label="Duplicate"]').click();
    await tick();
    flushSync();
    assert.ok(target.querySelector('[data-gathering-task-reward-rule-notice]'));
    const clearableComponentThumb = target.querySelector(
      '[data-gathering-task-drop-id="drop-nightshade"] .manager-gathering-task-thumb'
    );
    assert.ok(clearableComponentThumb);
    const clearComponentEvent = new MouseEvent('mousedown', {
      button: 2,
      bubbles: true,
      cancelable: true,
    });
    clearableComponentThumb.dispatchEvent(clearComponentEvent);
    await tick();
    flushSync();
    assert.equal(clearComponentEvent.defaultPrevented, true);
    const clearedDropRow = target.querySelector('[data-gathering-task-drop-id="drop-nightshade"]');
    assert.ok(clearedDropRow.textContent.includes('No Component'));
    const saveButton = target.querySelector('.manager-header-actions .manager-button.is-primary');
    assert.ok(saveButton, 'gathering task editor should expose a Save button');
    saveButton.click();
    await tick();
    flushSync();
    assert.ok(
      calls.some(
        (call) =>
          call[0] === 'updateGatheringLibraryTask' &&
          call[1] === 'alchemy' &&
          call[2] === 'task-herbs' &&
          call[3].name === 'Gather Sun Herbs' &&
          call[3].enabled === true
      ),
      'Save should persist staged edits in a single call'
    );
    target.querySelector('.manager-header-actions .manager-button:not(.is-primary)').click();
    await tick();
    flushSync();
    assert.equal(target.querySelector('.fabricate-manager').dataset.managerView, 'environments');
    assert.equal(gatheringSubitem('Tasks').getAttribute('aria-current'), 'page');

    gatheringSubitem('Events').click();
    await tick();
    flushSync();
    assert.equal(gatheringSubitem('Events').getAttribute('aria-current'), 'page');
    assert.ok(
      target.querySelector('[data-gathering-events-browser]'),
      'Events tab should mount the event library browser'
    );
    assert.equal(target.querySelector('.manager-environments-table'), null);
    assert.ok(
      target.querySelector('.manager-inspector').textContent.includes('Select a gathering event'),
      'inspector should show the select-event empty state when no event is selected'
    );
    assert.equal(
      target.querySelector('.manager-inspector').textContent.includes('Selected environment'),
      false
    );

    gatheringSubitem('Settings').click();
    await tick();
    flushSync();
    assert.equal(gatheringSubitem('Settings').getAttribute('aria-current'), 'page');
    assert.equal(target.querySelector('.manager-toolbar'), null);
    assert.equal(target.querySelector('.manager-environments-table'), null);
    assert.ok(
      target.textContent.includes('Set system-level drop resolution and event rules for gathering.')
    );
    assert.equal(target.querySelectorAll('[data-gathering-condition-panel]').length, 2);
    // Region is no longer a vocabulary dimension: only the biome vocabulary panel remains.
    assert.equal(target.querySelectorAll('[data-gathering-vocabulary-panel]').length, 1);
    assert.ok(target.querySelector('[data-gathering-condition-panel="timeOfDay"]'));
    assert.ok(target.querySelector('[data-gathering-condition-panel="weather"]'));
    assert.equal(target.querySelector('[data-gathering-vocabulary-panel="regions"]'), null);
    assert.ok(target.querySelector('[data-gathering-vocabulary-panel="biomes"]'));
    // The Travel & Realms toggle card hosts the subsystem flag.
    assert.ok(target.querySelector('[data-gathering-realm-toggle-panel]'));
    assert.ok(target.querySelector('[data-gathering-realm-toggle]'));
    assert.ok(target.textContent.includes('Times of day'));
    assert.ok(target.textContent.includes('Weather conditions'));
    assert.ok(target.textContent.includes('Travel & Realms'));
    assert.ok(target.textContent.includes('Biomes'));
    assert.ok(
      target.textContent.includes(
        'These values control current time matching for gathering tasks and events. Click the name of a time of day to edit it.'
      )
    );
    assert.ok(
      target.textContent.includes(
        'These values control weather matching for gathering tasks and events. Click the name of a condition to edit it.'
      )
    );
    assert.ok(
      target.textContent.includes(
        'Environments can have multiple biomes. Left-click the icon to swap it out, right-click to change the colour.'
      )
    );
    assert.equal(target.querySelectorAll('.manager-condition-add input').length, 3);
    assert.equal(
      target.querySelectorAll('.manager-condition-add .essence-icon-picker-trigger.icon-only')
        .length,
      3
    );
    assert.equal(target.querySelectorAll('.manager-color-picker-trigger').length, 1);
    assert.equal(target.querySelectorAll('.manager-condition-add .manager-add-button').length, 3);
    assert.equal(
      Array.from(target.querySelectorAll('.manager-condition-add .manager-add-button')).every(
        (button) => button.textContent.trim() === 'Add'
      ),
      true
    );
    assert.equal(target.textContent.includes('Add time of day'), false);
    assert.equal(target.textContent.includes('Add weather'), false);
    assert.equal(target.textContent.includes('Add region'), false);
    assert.equal(target.textContent.includes('Add biome'), false);
    assert.equal(target.querySelectorAll('[data-gathering-condition-value]').length, 5);
    assert.equal(target.querySelectorAll('.manager-vocabulary-pill').length, 2);
    assert.equal(
      target.querySelectorAll(
        '[data-gathering-vocabulary-panel="biomes"] .manager-biome-combined-trigger'
      ).length,
      2
    );
    assert.equal(target.querySelectorAll('.manager-condition-label-input').length, 7);
    assert.equal(
      target.querySelectorAll('.manager-vocabulary-pill .manager-condition-label-input').length,
      2
    );
    assert.deepEqual(
      Array.from(
        target.querySelectorAll(
          '[data-gathering-condition-panel="weather"] .manager-condition-label-input'
        )
      ).map((input) => input.value),
      ['Clear Sky', 'Storm Rain']
    );
    assert.deepEqual(
      Array.from(
        target.querySelectorAll(
          '[data-gathering-condition-panel="timeOfDay"] .manager-condition-label-input'
        )
      ).map((input) => input.value),
      ['First Light', 'High Day', 'Deep Night']
    );
    const weatherLabelInput = target.querySelector(
      '[data-gathering-condition-value="heavy-rain"] .manager-condition-label-input'
    );
    weatherLabelInput.value = 'Heavy Rainfall';
    weatherLabelInput.dispatchEvent(new Event('blur'));
    await tick();
    flushSync();
    assert.deepEqual(
      calls.find((call) => call[0] === 'updateGatheringConditionValue'),
      [
        'updateGatheringConditionValue',
        'weather',
        'heavy-rain',
        { label: 'Heavy Rainfall' },
        'alchemy',
      ]
    );

    const timeLabelInput = target.querySelector(
      '[data-gathering-condition-value="dawn"] .manager-condition-label-input'
    );
    timeLabelInput.focus();
    timeLabelInput.value = 'Grey Dawn';
    timeLabelInput.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true })
    );
    await tick();
    flushSync();
    assert.deepEqual(calls.filter((call) => call[0] === 'updateGatheringConditionValue').at(-1), [
      'updateGatheringConditionValue',
      'timeOfDay',
      'dawn',
      { label: 'Grey Dawn' },
      'alchemy',
    ]);
    assert.equal(
      target.querySelectorAll(
        '[data-gathering-condition-value] .essence-icon-picker-trigger.icon-only'
      ).length,
      5
    );
    const biomeLabelInput = target.querySelector(
      '[data-gathering-vocabulary-panel="biomes"] [data-gathering-vocabulary-value="forest"] .manager-condition-label-input'
    );
    biomeLabelInput.value = 'Old Moon Forest';
    biomeLabelInput.dispatchEvent(new Event('blur'));
    await tick();
    flushSync();
    assert.deepEqual(
      calls.find((call) => call[0] === 'updateGatheringVocabularyValue'),
      [
        'updateGatheringVocabularyValue',
        'biomes',
        'forest',
        { label: 'Old Moon Forest' },
        'alchemy',
      ]
    );
    const biomeIconTrigger = target.querySelector(
      '[data-gathering-vocabulary-panel="biomes"] [data-gathering-vocabulary-value="forest"] .manager-biome-combined-trigger'
    );
    biomeIconTrigger.click();
    await tick();
    flushSync();
    assert.ok(target.querySelector('.essence-icon-picker-popover'));
    target.querySelector('.essence-icon-picker-popover .essence-icon-picker-option').click();
    await tick();
    flushSync();
    assert.equal(
      calls.filter((call) => call[0] === 'updateGatheringVocabularyValue').at(-1)[1],
      'biomes'
    );
    const biomeColorTrigger = target.querySelector(
      '[data-gathering-vocabulary-panel="biomes"] [data-gathering-vocabulary-value="forest"] .manager-biome-combined-trigger'
    );
    const managerShell = target.querySelector('.fabricate-manager');
    const managerMain = target.querySelector('.manager-main');
    const originalShellRect = managerShell.getBoundingClientRect;
    const originalMainRect = managerMain.getBoundingClientRect;
    const originalBiomeTriggerRect = biomeColorTrigger.getBoundingClientRect;
    managerShell.getBoundingClientRect = () => ({
      left: 100,
      top: 50,
      right: 800,
      bottom: 370,
      width: 700,
      height: 320,
    });
    managerMain.getBoundingClientRect = () => ({
      left: 120,
      top: 60,
      right: 760,
      bottom: 360,
      width: 640,
      height: 300,
    });
    biomeColorTrigger.getBoundingClientRect = () => ({
      left: 140,
      top: 330,
      right: 170,
      bottom: 360,
      width: 30,
      height: 30,
    });
    biomeColorTrigger.dispatchEvent(
      new MouseEvent('contextmenu', { bubbles: true, cancelable: true })
    );
    await tick();
    flushSync();
    await tick();
    flushSync();
    const colorPopover = target.querySelector('[data-manager-color-picker-popover]');
    assert.ok(colorPopover);
    assert.equal(
      colorPopover.closest('.fabricate-manager'),
      managerShell,
      'biome color popover should stay inside the Manager shell overlay layer'
    );
    assert.equal(
      colorPopover.closest('[data-gathering-vocabulary-panel="biomes"]'),
      null,
      'biome color popover should be portaled out of the settings panel'
    );
    assert.match(
      colorPopover.getAttribute('style'),
      /bottom:\s*\d+px;/,
      'lower biome color popovers should flip above the trigger when space below is constrained'
    );
    assert.match(
      colorPopover.getAttribute('style'),
      /left:\s*40px;/,
      'biome color popover should left-align with the trigger while within the main panel bounds'
    );
    assert.match(
      colorPopover.getAttribute('style'),
      /width:\s*220px;/,
      'biome color popover should keep its fixed compact width'
    );
    target.querySelector('[data-manager-color-token="mist"]').click();
    await tick();
    flushSync();
    assert.deepEqual(calls.filter((call) => call[0] === 'updateGatheringVocabularyValue').at(-1), [
      'updateGatheringVocabularyValue',
      'biomes',
      'forest',
      { colorToken: 'mist', customColor: '' },
      'alchemy',
    ]);
    assert.ok(target.querySelector('[data-manager-color-picker-popover]'));
    document.body.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
    await tick();
    flushSync();
    assert.equal(target.querySelector('[data-manager-color-picker-popover]'), null);
    biomeColorTrigger.getBoundingClientRect = () => ({
      left: 760,
      top: 330,
      right: 790,
      bottom: 360,
      width: 30,
      height: 30,
    });
    biomeColorTrigger.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'F10', shiftKey: true, bubbles: true, cancelable: true })
    );
    await tick();
    flushSync();
    const constrainedColorPopover = target.querySelector('[data-manager-color-picker-popover]');
    assert.ok(constrainedColorPopover);
    assert.match(
      constrainedColorPopover.getAttribute('style'),
      /left:\s*424px;/,
      'biome color popover should clamp to the Manager main panel right edge'
    );
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    await tick();
    flushSync();
    assert.equal(target.querySelector('[data-manager-color-picker-popover]'), null);
    managerShell.getBoundingClientRect = originalShellRect;
    managerMain.getBoundingClientRect = originalMainRect;
    biomeColorTrigger.getBoundingClientRect = originalBiomeTriggerRect;
    assert.equal(target.querySelector('.manager-gathering-settings-summary'), null);
    assert.equal(target.querySelector('[data-gathering-rule-fact]'), null);
    assert.ok(
      target
        .querySelector('.manager-inspector')
        .textContent.includes('Choose how rewards are granted.')
    );
    assert.ok(
      target
        .querySelector('.manager-inspector')
        .textContent.includes('Choose how matching events are applied after a gathering roll.')
    );
    assert.ok(
      target
        .querySelector('.manager-inspector')
        .textContent.includes(
          'Decide whether rolling an event still allows the gathering attempt to succeed.'
        )
    );
    const rewardsSelect = target.querySelector('#manager-gathering-rule-rewards');
    const eventsSelect = target.querySelector('#manager-gathering-rule-events');
    assert.deepEqual(
      Array.from(rewardsSelect.options).map((option) => option.textContent.trim()),
      ['Highest ranked successful drop', 'All successful drops', 'Limit successful drops']
    );
    assert.deepEqual(
      Array.from(eventsSelect.options).map((option) => option.textContent.trim()),
      ['Highest ranked triggered event', 'All triggered events', 'Limit triggered events']
    );
    assert.equal(eventsSelect.textContent.includes('Highest ranked successful drop'), false);
    assert.equal(eventsSelect.textContent.includes('All successful drops'), false);
    assert.ok(target.textContent.includes('Gathering succeeds'));
    assert.ok(target.querySelector('.manager-inspector [data-gathering-inspector-rules]'));
    assert.equal(
      target
        .querySelector('.manager-inspector [data-gathering-inspector-rules] h2')
        .textContent.trim(),
      'Rules'
    );
    assert.equal(
      target.querySelectorAll('.manager-inspector [data-gathering-inspector-rules] select').length,
      10
    );
    const dropModifierModeSelect = target.querySelector(
      '#manager-gathering-rule-drop-modifier-mode'
    );
    assert.ok(dropModifierModeSelect, 'drop modifier mode select renders in the rules inspector');
    assert.deepEqual(
      Array.from(dropModifierModeSelect.options).map((option) => option.value),
      ['additive', 'multiplicative']
    );
    assert.deepEqual(
      Array.from(dropModifierModeSelect.options).map((option) => option.textContent.trim()),
      ['Additive (percentage points)', 'Multiplicative (scale by percentage)']
    );
    const eventVisibilitySelect = target.querySelector('#manager-gathering-rule-event-visibility');
    assert.ok(eventVisibilitySelect, 'event visibility select renders in the rules inspector');
    assert.deepEqual(
      Array.from(eventVisibilitySelect.options).map((option) => option.textContent.trim()),
      ['Danger level only', 'Encounter chance', 'Full details']
    );
    assert.equal(target.querySelector('.manager-inspector [data-gathering-rule-stepper]'), null);
    assert.equal(
      target.querySelector('.manager-inspector').textContent.includes('Selected environment'),
      false
    );

    gatheringSubitem('Environments').click();
    await tick();
    flushSync();
    assert.equal(gatheringSubitem('Environments').getAttribute('aria-current'), 'page');
    assert.equal(target.querySelectorAll('.manager-environment-row').length, 2);

    const environmentTable = target.querySelector('.manager-environments-table');
    assert.deepEqual(
      Array.from(environmentTable.querySelectorAll('[role="columnheader"]')).map((header) =>
        header.textContent.trim()
      ),
      ['Environment', 'Selection mode', 'Tasks', 'Status', 'Actions']
    );
    assert.equal(environmentTable.textContent.includes('Linked scene'), false);
    assert.equal(environmentTable.textContent.includes('Scene unresolved'), false);
    const forestRow = target.querySelector('[data-environment-id="env-forest"]');
    assert.equal(
      forestRow.querySelector('.manager-environment-task-count').textContent.trim(),
      '1'
    );
    assert.equal(forestRow.textContent.includes('results'), false);
    assert.equal(forestRow.textContent.includes('catalysts'), false);
    assert.equal(forestRow.querySelector('.manager-environment-task-count.manager-chip'), null);
    assert.ok(forestRow.querySelector('.manager-status-toggle'));
    assert.ok(forestRow.querySelector('.manager-environment-action-grid'));
    assert.ok(forestRow.querySelector('[aria-label="Edit Moonlit Forest"]'));
    assert.ok(forestRow.querySelector('[aria-label="Duplicate Moonlit Forest"]'));
    assert.ok(forestRow.querySelector('[aria-label="Delete Moonlit Forest"]'));
    assert.equal(
      forestRow.querySelector('.manager-environment-reorder-stack'),
      null,
      'environment rows should no longer render reorder controls'
    );
    assert.ok(
      target.querySelector('.manager-inspector').textContent.includes('Selected environment')
    );
    assert.equal(
      target.querySelector('.manager-inspector').textContent.includes('Environment actions'),
      false,
      'selected environment inspector should not duplicate row quick actions'
    );

    const search = target.querySelector('.manager-toolbar input[type="search"]');
    search.value = 'cavern';
    search.dispatchEvent(new Event('input', { bubbles: true }));
    await tick();
    flushSync();
    assert.equal(target.querySelectorAll('.manager-environment-row').length, 1);
    assert.ok(target.textContent.includes('Quiet Cavern'));

    const cavernToggle = target.querySelector(
      '[data-environment-id="env-cavern"] .manager-status-toggle'
    );
    cavernToggle.click();
    await tick();
    flushSync();
    assert.ok(
      calls.some(
        (call) =>
          call[0] === 'toggleEnvironmentEnabled' && call[1] === 'env-cavern' && call[2] === true
      )
    );
    assert.equal(
      calls.some((call) => call[0] === 'selectEnvironment' && call[1] === 'env-cavern'),
      false
    );

    target
      .querySelector('[data-environment-id="env-cavern"] .manager-environment-identity')
      .click();
    await tick();
    flushSync();
    assert.ok(
      target.querySelector('[data-environment-id="env-cavern"]').classList.contains('is-selected')
    );
    assert.ok(calls.some((call) => call[0] === 'selectEnvironment' && call[1] === 'env-cavern'));

    target
      .querySelector('[data-environment-id="env-cavern"] [aria-label="Duplicate Quiet Cavern"]')
      .click();
    target
      .querySelector('[data-environment-id="env-cavern"] [aria-label="Delete Quiet Cavern"]')
      .click();
    assert.ok(
      calls.some((call) => call[0] === 'duplicateEnvironmentDraft' && call[1] === 'env-cavern')
    );
    assert.ok(
      calls.some((call) => call[0] === 'deleteEnvironmentDraft' && call[1] === 'env-cavern')
    );

    target.querySelector('[aria-label="Edit Quiet Cavern"]').click();
    await Promise.resolve();
    await Promise.resolve();
    await tick();
    flushSync();

    assert.equal(
      target.querySelector('.fabricate-manager').dataset.managerView,
      'environment-edit'
    );
    assert.ok(
      target.querySelector('.manager-environment-editor-shell .manager-environment-edit-view')
    );
    assert.ok(target.textContent.includes('Quiet Cavern'));
  });

  it('flips the Travel & Realms toggle (aria-pressed) and reveals the Travel nav item', async () => {
    const calls = [];
    target = document.createElement('div');
    document.body.appendChild(target);
    mounted = mount(Component, {
      target,
      props: { store: createStore(calls), services: { openCurrentAdmin: () => {} } },
    });
    flushSync();

    navButton('Gathering').click();
    await tick();
    flushSync();
    gatheringSubitem('Settings').click();
    await tick();
    flushSync();

    // Travel is hidden while the toggle is off.
    assert.equal(Boolean(gatheringSubitem('Travel')), false, 'Travel nav item hidden by default');
    const toggle = target.querySelector('[data-gathering-realm-toggle]');
    assert.ok(toggle, 'realm toggle card renders on the settings tab');
    assert.equal(toggle.getAttribute('aria-pressed'), 'false', 'toggle starts unpressed');

    toggle.click();
    await tick();
    flushSync();

    assert.ok(
      calls.some(
        (call) =>
          call[0] === 'setGatheringRealmsEnabled' && call[1] === 'alchemy' && call[2] === true
      ),
      'clicking the toggle calls setGatheringRealmsEnabled with the flipped value'
    );
    assert.equal(
      target.querySelector('[data-gathering-realm-toggle]').getAttribute('aria-pressed'),
      'true',
      'toggle reflects the new pressed state'
    );
    // Enabling the flag reveals the Travel nav item.
    assert.ok(
      gatheringSubitem('Travel'),
      'Travel nav item appears once Travel & Realms is enabled'
    );
  });

  it('falls back from a stale Travel tab to Environments when Travel & Realms is disabled', async () => {
    const calls = [];
    target = document.createElement('div');
    document.body.appendChild(target);
    mounted = mount(Component, {
      target,
      props: { store: createStore(calls), services: { openCurrentAdmin: () => {} } },
    });
    flushSync();

    navButton('Gathering').click();
    await tick();
    flushSync();

    // Enable the subsystem, then route to the Travel tab.
    gatheringSubitem('Settings').click();
    await tick();
    flushSync();
    target.querySelector('[data-gathering-realm-toggle]').click();
    await tick();
    flushSync();
    gatheringSubitem('Travel').click();
    await tick();
    flushSync();
    assert.ok(
      gatheringSubitem('Travel')?.getAttribute('aria-current') === 'page',
      'Travel tab is active'
    );

    // Disabling the flag must drop the stale Travel tab back to Environments, not
    // leave the manager stranded on a hidden tab. Re-enter Settings to flip it off
    // (the Travel surface has no toggle).
    gatheringSubitem('Settings').click();
    await tick();
    flushSync();
    target.querySelector('[data-gathering-realm-toggle]').click();
    await tick();
    flushSync();

    assert.equal(Boolean(gatheringSubitem('Travel')), false, 'Travel nav item hidden again');
    // The active tab is no longer Travel; Settings remains the current selection.
    const activeSubitem = Array.from(target.querySelectorAll('.manager-nav-subitem')).find(
      (item) => item.getAttribute('aria-current') === 'page'
    );
    assert.notEqual(
      activeSubitem?.textContent.trim(),
      'Travel',
      'stale Travel tab is not the active tab'
    );
  });

  it('deletes the editing gathering task from the editor toolbar and returns to the task browser', async () => {
    const calls = [];
    target = document.createElement('div');
    document.body.appendChild(target);
    mounted = mount(Component, {
      target,
      props: {
        store: createStore(calls),
        services: { openCurrentAdmin: () => {} },
      },
    });
    flushSync();

    navButton('Gathering').click();
    await tick();
    flushSync();

    gatheringSubitem('Tasks').click();
    await tick();
    flushSync();

    target
      .querySelector('[data-gathering-task-id="task-herbs"] [aria-label="Edit Gather Moon Herbs"]')
      .click();
    await tick();
    flushSync();
    assert.equal(
      target.querySelector('.fabricate-manager').dataset.managerView,
      'gathering-task-edit'
    );

    const headerDeleteButton = target.querySelector(
      '.manager-header-actions .manager-button.is-danger'
    );
    assert.ok(headerDeleteButton, 'editor toolbar should expose a destructive delete button');
    assert.ok(headerDeleteButton.textContent.includes('Delete gathering task'));
    headerDeleteButton.click();
    await tick();
    flushSync();

    assert.ok(
      calls.some(
        (call) =>
          call[0] === 'deleteGatheringLibraryTask' &&
          call[1] === 'alchemy' &&
          call[2] === 'task-herbs'
      ),
      `expected deleteGatheringLibraryTask call for task-herbs, got ${JSON.stringify(calls)}`
    );
    assert.equal(target.querySelector('.fabricate-manager').dataset.managerView, 'environments');
  });

  it('edits gathering task drop rules from unresolved row through inspector modifiers', async () => {
    const calls = [];
    target = document.createElement('div');
    document.body.appendChild(target);
    mounted = mount(Component, {
      target,
      props: {
        store: createStore(calls),
        services: {
          openCurrentAdmin: () => {},
          importSingleManagedItemFromDrop: async () => ({ id: 'c2', name: 'Glass Vial' }),
        },
      },
    });
    flushSync();

    navButton('Gathering').click();
    await tick();
    flushSync();
    gatheringSubitem('Tasks').click();
    await tick();
    flushSync();
    target
      .querySelector('[data-gathering-task-id="task-herbs"] [aria-label="Edit Gather Moon Herbs"]')
      .click();
    await tick();
    flushSync();

    const knownDropIds = new Set(
      Array.from(target.querySelectorAll('[data-gathering-task-drop-id]')).map(
        (node) => node.dataset.gatheringTaskDropId
      )
    );
    Array.from(target.querySelectorAll('.manager-task-card-header .manager-button'))
      .find((button) => button.textContent.includes('Add drop rule'))
      .click();
    await tick();
    flushSync();

    const addedDropRow = Array.from(target.querySelectorAll('[data-gathering-task-drop-id]')).find(
      (node) => !knownDropIds.has(node.dataset.gatheringTaskDropId)
    );
    assert.ok(addedDropRow, 'add drop should stage an unresolved selected drop row');
    const addedRow = { id: addedDropRow.dataset.gatheringTaskDropId };
    assert.ok(addedDropRow.querySelector('[data-gathering-task-drop-zone]'));
    assert.ok(addedDropRow.textContent.includes('No Component'));
    assert.ok(addedDropRow.textContent.includes('Create or assign'));
    assert.equal(addedDropRow.textContent.includes('Drop component'), false);
    assert.equal(addedDropRow.textContent.includes('Drop chance'), false);
    assert.equal(addedDropRow.textContent.includes('Quantity'), false);
    assert.equal(addedDropRow.querySelector('[aria-label="Select drop rule"]'), null);
    target.querySelector('[data-gathering-task-drop-id="drop-nightshade"]').click();
    await tick();
    flushSync();
    assert.ok(
      target
        .querySelector('[data-gathering-task-drop-inspector]')
        .textContent.includes('Nightshade With An Exceptionally Long Localized Component Name')
    );
    addedDropRow.click();
    await tick();
    flushSync();
    assert.equal(
      target
        .querySelector('[data-gathering-task-drop-inspector]')
        .textContent.includes('Drop component'),
      false
    );
    assert.equal(
      target.querySelector(
        '[data-gathering-task-drop-inspector] [data-gathering-drop-inspector-rate] input[type="text"]'
      ).value,
      '25'
    );
    assert.equal(
      target.querySelector(
        '[data-gathering-task-drop-inspector] [data-gathering-drop-inspector-count] input'
      ).value,
      '1'
    );
    assert.equal(
      target.querySelector(
        '[data-gathering-task-drop-id="drop-nightshade"] [aria-label="Duplicate"]'
      ),
      null
    );
    assert.equal(
      target.querySelector('[data-gathering-task-drop-id="drop-nightshade"] [aria-label="Delete"]'),
      null
    );

    const inspectorSlider = target.querySelector(
      '[data-gathering-task-drop-inspector] input[type="range"]'
    );
    inspectorSlider.value = '100';
    inspectorSlider.dispatchEvent(new Event('input', { bubbles: true }));
    await tick();
    flushSync();

    target.querySelector('[data-gathering-task-drop-inspector] [aria-label="Duplicate"]').click();
    await tick();
    flushSync();
    const unresolvedDropsAtRate100 = Array.from(
      target.querySelectorAll('[data-gathering-task-drop-id]')
    ).filter((node) => node.textContent.includes('No Component'));
    assert.ok(
      unresolvedDropsAtRate100.length >= 2,
      'duplicate should stage a second unresolved drop row'
    );
    target.querySelector(`[data-gathering-task-drop-id="${addedRow.id}"]`).click();
    await tick();
    flushSync();
    target.querySelector('[data-gathering-task-drop-inspector] [aria-label="Delete"]').click();
    await tick();
    flushSync();
    assert.equal(
      target.querySelector(`[data-gathering-task-drop-id="${addedRow.id}"]`),
      null,
      'delete should stage removal of the row'
    );
  });

  it('browses and drags managed components inside the gathering task editor', async () => {
    const calls = [];
    const importedDrops = [];
    target = document.createElement('div');
    document.body.appendChild(target);
    mounted = mount(Component, {
      target,
      props: {
        store: createStore(calls, {
          extendedComponentCards: true,
          taskDropRows: [
            {
              id: 'drop-empty',
              componentId: '',
              itemUuid: '',
              systemItemId: '',
              name: '',
              quantity: 1,
              dropRate: 25,
              enabled: false,
            },
            {
              id: 'drop-stale',
              componentId: 'c3',
              itemUuid: 'Item.stale',
              systemItemId: 'legacy-system-item',
              name: 'Legacy Name',
              quantity: 1,
              dropRate: 40,
              enabled: true,
            },
          ],
        }),
        services: {
          openCurrentAdmin: () => {},
          importSingleManagedItemFromDrop: async (data) => {
            importedDrops.push(data);
            return { id: 'c1', name: 'Iron Ore' };
          },
        },
      },
    });
    flushSync();

    navButton('Gathering').click();
    await tick();
    flushSync();
    gatheringSubitem('Tasks').click();
    await tick();
    flushSync();
    target
      .querySelector('[data-gathering-task-id="task-herbs"] [aria-label="Edit Gather Moon Herbs"]')
      .click();
    await tick();
    flushSync();

    const browser = target.querySelector('[data-gathering-task-component-browser]');
    const dropsCard = target.querySelector('.manager-task-drops-card');
    assert.ok(browser, 'component browser should render in the task editor');
    assert.equal(
      Boolean(browser.compareDocumentPosition(dropsCard) & Node.DOCUMENT_POSITION_FOLLOWING),
      true,
      'component browser should render above drop rules'
    );
    assert.equal(
      target.querySelectorAll('[data-gathering-component-card]').length,
      6,
      'component browser should default to six cards per page'
    );
    assert.ok(browser.textContent.includes('Iron Ore'));
    assert.equal(
      browser.textContent.includes('River Salt'),
      false,
      'seventh component should start on the next page'
    );

    const nameSearch = target.querySelector('[aria-label="Search component names"]');
    nameSearch.value = 'coal';
    nameSearch.dispatchEvent(new Event('input', { bubbles: true }));
    await tick();
    flushSync();
    assert.equal(target.querySelectorAll('[data-gathering-component-card]').length, 1);
    assert.ok(browser.textContent.includes('Coal'));

    nameSearch.value = 'fuel';
    nameSearch.dispatchEvent(new Event('input', { bubbles: true }));
    await tick();
    flushSync();
    assert.equal(
      target.querySelectorAll('[data-gathering-component-card]').length,
      0,
      'component browser name search should not match descriptions'
    );

    nameSearch.value = '';
    nameSearch.dispatchEvent(new Event('input', { bubbles: true }));
    await tick();
    flushSync();

    const tagSearch = target.querySelector('[aria-label="Search component tags"]');
    tagSearch.value = 'her';
    tagSearch.dispatchEvent(new Event('input', { bubbles: true }));
    await tick();
    flushSync();
    Array.from(target.querySelectorAll('[data-gathering-component-tag-suggestion]'))
      .find((button) => button.textContent.includes('herb'))
      .click();
    await tick();
    flushSync();
    assert.equal(target.querySelectorAll('[data-gathering-component-card]').length, 3);
    assert.ok(browser.textContent.includes('Nightshade'));
    assert.ok(browser.textContent.includes('Moon Fern'));
    assert.ok(browser.textContent.includes('Sun Petal'));

    tagSearch.value = 'moo';
    tagSearch.dispatchEvent(new Event('input', { bubbles: true }));
    await tick();
    flushSync();
    Array.from(target.querySelectorAll('[data-gathering-component-tag-suggestion]'))
      .find((button) => button.textContent.includes('moon'))
      .click();
    await tick();
    flushSync();
    assert.equal(
      target.querySelectorAll('[data-gathering-component-card]').length,
      1,
      'selected component tags should require all tags'
    );
    assert.ok(browser.textContent.includes('Moon Fern'));
    const selectedTagPills = Array.from(
      target.querySelectorAll('[data-gathering-component-tag-pill]')
    );
    assert.ok(
      selectedTagPills.every((pill) => pill.classList.contains('manager-selected-tag-pill')),
      'selected component tags should render as removable pills'
    );

    for (const pill of Array.from(
      target.querySelectorAll('[data-gathering-component-tag-pill] button')
    )) {
      pill.click();
      await tick();
      flushSync();
    }

    function dragPayloadFrom(card) {
      let raw = '';
      const dragStart = new Event('dragstart', { bubbles: true, cancelable: true });
      Object.defineProperty(dragStart, 'dataTransfer', {
        value: {
          setData: (type, value) => {
            if (type === 'text/plain') raw = value;
          },
          effectAllowed: '',
        },
      });
      card.dispatchEvent(dragStart);
      return raw;
    }

    function dropPayloadOn(row, raw) {
      const dropEvent = new Event('drop', { bubbles: true, cancelable: true });
      Object.defineProperty(dropEvent, 'dataTransfer', {
        value: { getData: (type) => (type === 'text/plain' ? raw : '') },
      });
      row.dispatchEvent(dropEvent);
    }

    const emptyRow = target.querySelector('[data-gathering-task-drop-id="drop-empty"]');
    const glassPayload = dragPayloadFrom(
      target.querySelector('[data-gathering-component-card="c2"]')
    );
    assert.deepEqual(JSON.parse(glassPayload), {
      type: 'FabricateManagedComponent',
      componentId: 'c2',
    });
    dropPayloadOn(emptyRow, glassPayload);
    await tick();
    flushSync();
    const emptyRowAfter = target.querySelector('[data-gathering-task-drop-id="drop-empty"]');
    assert.ok(
      emptyRowAfter && emptyRowAfter.textContent.includes('Glass Vial'),
      'managed-component drag should stage the new component on the drop row'
    );

    const staleRow = target.querySelector('[data-gathering-task-drop-id="drop-stale"]');
    const coalPayload = dragPayloadFrom(
      target.querySelector('[data-gathering-component-card="c4"]')
    );
    dropPayloadOn(staleRow, coalPayload);
    await tick();
    flushSync();
    const staleRowAfter = target.querySelector('[data-gathering-task-drop-id="drop-stale"]');
    assert.ok(
      staleRowAfter && !staleRowAfter.textContent.includes('Legacy Name'),
      'managed-component drag onto a stale row should stage the replacement'
    );

    dropPayloadOn(staleRow, JSON.stringify({ type: 'Item', uuid: 'Item.imported' }));
    await Promise.resolve();
    await tick();
    flushSync();
    assert.deepEqual(
      importedDrops,
      [{ type: 'Item', uuid: 'Item.imported' }],
      'non-managed drops should keep using the import flow'
    );
  });

  it('keeps the component browser per-page selector after a page size fits everything on one page', async () => {
    target = document.createElement('div');
    document.body.appendChild(target);
    mounted = mount(Component, {
      target,
      props: {
        store: createStore([], { extendedComponentCards: true }),
        services: { openCurrentAdmin: () => {} },
      },
    });
    flushSync();

    navButton('Gathering').click();
    await tick();
    flushSync();
    gatheringSubitem('Tasks').click();
    await tick();
    flushSync();
    target
      .querySelector('[data-gathering-task-id="task-herbs"] [aria-label="Edit Gather Moon Herbs"]')
      .click();
    await tick();
    flushSync();

    const footer = target.querySelector('.manager-task-component-browser-footer');
    const sizeSelect = () => footer.querySelector('[data-pagination-size]');
    assert.equal(
      target.querySelectorAll('[data-gathering-component-card]').length,
      6,
      'component browser should default to six cards per page'
    );
    assert.ok(sizeSelect(), 'per-page selector should render while multiple pages exist');
    assert.ok(
      footer.querySelector('[data-pagination-next]'),
      'next-page control should render while multiple pages exist'
    );

    // Selecting 9 fits all seven components on a single page. The per-page selector must
    // survive so the user can still switch back — the prev/next nav is the only part that
    // should disappear once there is a single page.
    const select = sizeSelect();
    select.value = '9';
    select.dispatchEvent(new Event('change', { bubbles: true }));
    await tick();
    flushSync();
    assert.equal(
      target.querySelectorAll('[data-gathering-component-card]').length,
      8,
      'choosing nine per page should show every component on one page'
    );
    assert.ok(
      sizeSelect(),
      'per-page selector must remain visible when the chosen size fits everything on one page'
    );
    assert.equal(sizeSelect().value, '9', 'per-page selector should reflect the chosen page size');
    assert.equal(
      footer.querySelector('[data-pagination-next]'),
      null,
      'prev/next nav should hide when there is only one page'
    );

    // Recoverability: the surviving selector still works to reduce the page size again.
    const restore = sizeSelect();
    restore.value = '6';
    restore.dispatchEvent(new Event('change', { bubbles: true }));
    await tick();
    flushSync();
    assert.equal(
      target.querySelectorAll('[data-gathering-component-card]').length,
      6,
      'the per-page selector should switch back to six per page'
    );
  });

  it('caps gathering task drop modifiers at four labels and redirects to the selected rule beyond', async () => {
    const fourModifiers = Array.from({ length: 4 }, (_, index) => ({
      id: `four-${index}`,
      conditionId: `four-${index}`,
      value: index + 1,
    }));
    const fiveModifiers = Array.from({ length: 5 }, (_, index) => ({
      id: `five-${index}`,
      conditionId: `five-${index}`,
      value: index + 1,
    }));
    target = document.createElement('div');
    document.body.appendChild(target);
    mounted = mount(Component, {
      target,
      props: {
        store: createStore([], {
          taskDropRows: [
            {
              id: 'drop-four-modifiers',
              componentId: 'c1',
              quantity: 1,
              dropRate: 25,
              enabled: true,
              conditionModifiers: { timeOfDay: fourModifiers, weather: [] },
            },
            {
              id: 'drop-five-modifiers',
              componentId: 'c3',
              quantity: 1,
              dropRate: 25,
              enabled: true,
              conditionModifiers: { timeOfDay: fiveModifiers, weather: [] },
            },
          ],
        }),
        services: { openCurrentAdmin: () => {} },
      },
    });
    flushSync();

    navButton('Gathering').click();
    await tick();
    flushSync();
    gatheringSubitem('Tasks').click();
    await tick();
    flushSync();
    target
      .querySelector('[data-gathering-task-id="task-herbs"] [aria-label="Edit Gather Moon Herbs"]')
      .click();
    await tick();
    flushSync();

    const fourModifierRow = target.querySelector(
      '[data-gathering-task-drop-id="drop-four-modifiers"]'
    );
    const fiveModifierRow = target.querySelector(
      '[data-gathering-task-drop-id="drop-five-modifiers"]'
    );
    // Up to four modifiers render as chips (which scroll within the cell if long names wrap);
    // five or more are capped and redirect to the selected rule's inspector.
    assert.equal(fourModifierRow.querySelectorAll('.manager-drop-modifier-pill').length, 4);
    assert.equal(fourModifierRow.textContent.includes('See selected rule for modifiers'), false);
    assert.equal(fiveModifierRow.querySelectorAll('.manager-drop-modifier-pill').length, 0);
    assert.ok(fiveModifierRow.querySelector('.manager-drop-modifier-overflow'));
    assert.ok(fiveModifierRow.textContent.includes('See selected rule for modifiers'));
  });

  it('colours gathering task drop chance sliders by rarity threshold', async () => {
    const rarityRows = [
      ['drop-guaranteed', 100, 'is-guaranteed', 'var(--fab-drop-rate-guaranteed)'],
      ['drop-common', 70, 'is-common', 'var(--fab-drop-rate-common)'],
      ['drop-uncommon', 69, 'is-uncommon', 'var(--fab-drop-rate-uncommon)'],
      ['drop-rare', 15, 'is-rare', 'var(--fab-drop-rate-rare)'],
      ['drop-very-rare', 5, 'is-very-rare', 'var(--fab-drop-rate-very-rare)'],
      ['drop-legendary', 4, 'is-legendary', 'var(--fab-drop-rate-legendary)'],
      ['drop-zero', 0, 'is-none', 'var(--fab-drop-rate-none)'],
    ];
    const dropRows = rarityRows.map(([id, dropRate]) => ({
      id,
      componentId: 'c1',
      quantity: 1,
      dropRate,
      enabled: true,
    }));
    target = document.createElement('div');
    document.body.appendChild(target);
    mounted = mount(Component, {
      target,
      props: {
        store: createStore([], { taskDropRows: dropRows }),
        services: { openCurrentAdmin: () => {} },
      },
    });
    flushSync();

    navButton('Gathering').click();
    await tick();
    flushSync();
    gatheringSubitem('Tasks').click();
    await tick();
    flushSync();
    target
      .querySelector('[data-gathering-task-id="task-herbs"] [aria-label="Edit Gather Moon Herbs"]')
      .click();
    await tick();
    flushSync();

    function assertRenderedRarityRows(rows) {
      for (const [id, dropRate, tierClass, color] of rows) {
        const control = target.querySelector(
          `[data-gathering-task-drop-id="${id}"] .manager-drop-rate-control`
        );
        assert.ok(control.classList.contains(tierClass), `${id} should use ${tierClass}`);
        assert.ok(
          control.getAttribute('style').includes(`--fab-drop-rate-value: ${dropRate}%;`),
          `${id} should expose its slider fill value`
        );
        assert.ok(
          control.getAttribute('style').includes(`--fab-drop-rate-color: ${color};`),
          `${id} should expose ${color}`
        );
      }
    }

    assertRenderedRarityRows(rarityRows.slice(0, 5));
    target.querySelector('.manager-task-drops-card [data-pagination-next]').click();
    await tick();
    flushSync();
    assertRenderedRarityRows(rarityRows.slice(5));
  });

  it('paginates gathering task editor drop rules without snapping back to the selected row', async () => {
    const dropRows = Array.from({ length: 12 }, (_, index) => ({
      id: `drop-page-${index + 1}`,
      componentId: index % 2 === 0 ? 'c1' : 'c3',
      quantity: 1,
      dropRate: 10 + index,
      enabled: true,
    }));
    target = document.createElement('div');
    document.body.appendChild(target);
    mounted = mount(Component, {
      target,
      props: {
        store: createStore([], { taskDropRows: dropRows }),
        services: { openCurrentAdmin: () => {} },
      },
    });
    flushSync();

    navButton('Gathering').click();
    await tick();
    flushSync();
    gatheringSubitem('Tasks').click();
    await tick();
    flushSync();
    target
      .querySelector('[data-gathering-task-id="task-herbs"] [aria-label="Edit Gather Moon Herbs"]')
      .click();
    await tick();
    flushSync();

    const dropRulesCard = target.querySelector('.manager-task-drops-card');
    assert.ok(target.querySelector('[data-gathering-task-drop-id="drop-page-1"]'));
    assert.equal(
      dropRulesCard.querySelectorAll('[data-gathering-task-drop-id]').length,
      5,
      'drop rules should default to five rows per page'
    );
    assert.equal(
      dropRulesCard.querySelector('[data-pagination-page]').textContent.trim(),
      'Page 1 of 3'
    );
    dropRulesCard.querySelector('[data-pagination-next]').click();
    await tick();
    flushSync();

    assert.equal(
      dropRulesCard.querySelector('[data-pagination-page]').textContent.trim(),
      'Page 2 of 3'
    );
    assert.equal(target.querySelector('[data-gathering-task-drop-id="drop-page-1"]'), null);
    assert.ok(target.querySelector('[data-gathering-task-drop-id="drop-page-6"]'));
  });

  it('shows the drop rank column with boundary-aware reorder buttons under highestRankedDrop mode', async () => {
    const dropRows = [
      { id: 'drop-rank-1', componentId: 'c1', quantity: 1, dropRate: 90, enabled: true },
      { id: 'drop-rank-2', componentId: 'c1', quantity: 1, dropRate: 60, enabled: true },
      { id: 'drop-rank-3', componentId: 'c1', quantity: 1, dropRate: 30, enabled: true },
    ];
    target = document.createElement('div');
    document.body.appendChild(target);
    mounted = mount(Component, {
      target,
      props: {
        store: createStore([], {
          taskDropRows: dropRows,
          rewardSelectionMode: 'highestRankedDrop',
        }),
        services: { openCurrentAdmin: () => {} },
      },
    });
    flushSync();

    navButton('Gathering').click();
    await tick();
    flushSync();
    gatheringSubitem('Tasks').click();
    await tick();
    flushSync();
    target
      .querySelector('[data-gathering-task-id="task-herbs"] [aria-label="Edit Gather Moon Herbs"]')
      .click();
    await tick();
    flushSync();

    const table = target.querySelector('[data-gathering-task-drops-table]');
    assert.ok(
      table.classList.contains('is-ranked-mode'),
      'drop table should opt into ranked-mode layout'
    );
    const rankCells = table.querySelectorAll('[data-gathering-task-drop-rank-cell]');
    assert.equal(rankCells.length, 3, 'every visible drop row should expose a rank cell');
    const ranks = Array.from(rankCells).map((cell) =>
      cell.querySelector('[data-gathering-task-drop-rank]').textContent.trim()
    );
    assert.deepEqual(
      ranks,
      ['#1', '#2', '#3'],
      'rank labels should reflect 1-indexed position in dropRows'
    );

    const firstRow = target.querySelector('[data-gathering-task-drop-id="drop-rank-1"]');
    const lastRow = target.querySelector('[data-gathering-task-drop-id="drop-rank-3"]');
    assert.equal(
      firstRow.querySelector('[data-gathering-task-drop-move="up"]').disabled,
      true,
      'first row should not be movable up'
    );
    assert.equal(
      lastRow.querySelector('[data-gathering-task-drop-move="down"]').disabled,
      true,
      'last row should not be movable down'
    );

    firstRow.querySelector('[data-gathering-task-drop-move="down"]').click();
    await tick();
    flushSync();

    const reorderedIds = Array.from(target.querySelectorAll('[data-gathering-task-drop-id]')).map(
      (node) => node.dataset.gatheringTaskDropId
    );
    assert.deepEqual(
      reorderedIds,
      ['drop-rank-2', 'drop-rank-1', 'drop-rank-3'],
      'moving the top row down should swap it with its neighbor in dropRows'
    );
    const updatedRanks = Array.from(target.querySelectorAll('[data-gathering-task-drop-rank]')).map(
      (node) => node.textContent.trim()
    );
    assert.deepEqual(
      updatedRanks,
      ['#1', '#2', '#3'],
      'rank labels should re-derive from the new array order'
    );
  });

  it('hides the drop rank column when the reward selection mode is not highestRankedDrop', async () => {
    const dropRows = [
      { id: 'drop-unranked-1', componentId: 'c1', quantity: 1, dropRate: 70, enabled: true },
      { id: 'drop-unranked-2', componentId: 'c1', quantity: 1, dropRate: 40, enabled: true },
    ];
    target = document.createElement('div');
    document.body.appendChild(target);
    mounted = mount(Component, {
      target,
      props: {
        store: createStore([], { taskDropRows: dropRows, rewardSelectionMode: 'allDrops' }),
        services: { openCurrentAdmin: () => {} },
      },
    });
    flushSync();

    navButton('Gathering').click();
    await tick();
    flushSync();
    gatheringSubitem('Tasks').click();
    await tick();
    flushSync();
    target
      .querySelector('[data-gathering-task-id="task-herbs"] [aria-label="Edit Gather Moon Herbs"]')
      .click();
    await tick();
    flushSync();

    const table = target.querySelector('[data-gathering-task-drops-table]');
    assert.equal(
      table.classList.contains('is-ranked-mode'),
      false,
      'allDrops mode should not opt into ranked layout'
    );
    assert.equal(
      table.querySelectorAll('[data-gathering-task-drop-rank-cell]').length,
      0,
      'allDrops mode should not render rank cells'
    );
  });

  it('renders selected gathering tool dirty state and actions in the inspector header card', async () => {
    const calls = [];
    target = document.createElement('div');
    document.body.appendChild(target);
    mounted = mount(Component, {
      target,
      props: {
        store: createStore(calls, {
          toolsDraftDirty: true,
          toolsDraftDirtyToolIds: ['tool-catalyst'],
          trackCancelToolsDraft: true,
          toolsDraftSelectedToolId: 'tool-catalyst',
          gatheringLibraryTools: [
            {
              id: 'tool-catalyst',
              label: 'Artisan Catalyst',
              enabled: true,
              componentId: 'c1',
              requirement: null,
              breakage: { mode: 'limitedUses', maxUses: null },
              onBreak: { mode: 'destroy' },
            },
          ],
          toolsDraft: [
            {
              id: 'tool-catalyst',
              label: 'Artisan Catalyst',
              enabled: true,
              componentId: 'c1',
              requirement: null,
              breakage: { mode: 'limitedUses', maxUses: null },
              onBreak: { mode: 'destroy' },
            },
          ],
        }),
        services: { openCurrentAdmin: () => {} },
      },
    });
    flushSync();

    navButton('Gathering').click();
    await tick();
    flushSync();
    navButton('Tools').click();
    await tick();
    flushSync();

    assert.equal(navButton('Tools').querySelector('.manager-nav-count')?.textContent.trim(), '1');
    assert.equal(target.querySelector('.manager-header-actions'), null);
    assert.equal(
      target.querySelector('.manager-header').textContent.includes('Back to Gathering'),
      false
    );
    assert.equal(target.querySelector('.manager-header').textContent.includes('Unsaved'), false);
    assert.equal(
      target.querySelector('.manager-header').textContent.includes('Delete tool'),
      false
    );
    assert.equal(
      target.querySelector('.manager-header').textContent.includes('Save changes'),
      false
    );
    assert.equal(target.querySelector('.manager-header').textContent.includes('Import'), false);
    assert.equal(target.querySelector('.manager-header').textContent.includes('Export'), false);
    assert.equal(target.querySelector('.manager-header').textContent.includes('Create'), false);

    const toolInspector = target.querySelector('[data-manager-tool-inspector]');
    assert.ok(toolInspector.textContent.includes('Artisan Catalyst'));
    assert.ok(
      toolInspector.querySelector('.manager-tools-dirty-chip').textContent.includes('Unsaved')
    );
    assert.ok(
      toolInspector.querySelector('.manager-tools-dirty-chip .fa-save'),
      'inspector dirty pip should include the save icon'
    );
    const inspectorActions = toolInspector.querySelector('.manager-tool-inspector-actions');
    assert.ok(inspectorActions, 'selected tool inspector header card should own tool actions');
    assert.equal(inspectorActions.querySelectorAll('.manager-button').length, 2);
    assert.ok(
      inspectorActions
        .querySelector('.manager-button.is-danger')
        .textContent.includes('Delete tool')
    );
    assert.ok(
      inspectorActions
        .querySelector('.manager-button.is-primary')
        .textContent.includes('Save changes')
    );

    inspectorActions.querySelector('.manager-button.is-primary').click();
    await tick();
    flushSync();
    assert.ok(calls.some((call) => call[0] === 'saveToolDraft' && call[1] === 'tool-catalyst'));

    inspectorActions.querySelector('.manager-button.is-danger').click();
    await tick();
    flushSync();
    assert.ok(
      calls.some((call) => call[0] === 'deleteToolFromDraft' && call[1] === 'tool-catalyst')
    );
  });

  it('renders dirty pips in tool rows and removes the inert overflow menu button', async () => {
    target = document.createElement('div');
    document.body.appendChild(target);
    mounted = mount(Component, {
      target,
      props: {
        store: createStore([], {
          toolsDraftDirty: true,
          toolsDraftDirtyToolIds: ['tool-catalyst'],
          toolsDraftSelectedToolId: 'tool-catalyst',
          toolsDraft: [
            {
              id: 'tool-catalyst',
              label: 'Artisan Catalyst',
              enabled: true,
              componentId: 'c1',
              requirement: null,
              breakage: { mode: 'limitedUses', maxUses: null },
              onBreak: { mode: 'destroy' },
            },
            {
              id: 'tool-mail',
              label: 'Draconic Scale Mail',
              enabled: true,
              componentId: 'c2',
              requirement: null,
              breakage: { mode: 'limitedUses', maxUses: null },
              onBreak: { mode: 'destroy' },
            },
          ],
        }),
        services: { openCurrentAdmin: () => {} },
      },
    });
    flushSync();

    navButton('Gathering').click();
    await tick();
    flushSync();
    navButton('Tools').click();
    await tick();
    flushSync();

    const dirtyRow = target.querySelector('[data-manager-tool-id="tool-catalyst"]');
    const cleanRow = target.querySelector('[data-manager-tool-id="tool-mail"]');
    assert.ok(
      dirtyRow
        .querySelector('.manager-tools-row-dirty-slot .manager-tools-dirty-chip')
        .textContent.includes('Unsaved')
    );
    assert.ok(
      dirtyRow.querySelector('.manager-tools-row-dirty-slot .fa-save'),
      'row dirty pip should include the save icon'
    );
    assert.equal(
      dirtyRow.querySelector('.manager-tools-row-actions .manager-tools-dirty-chip'),
      null
    );
    assert.equal(
      cleanRow.querySelector('.manager-tools-row-dirty-slot .manager-tools-dirty-chip'),
      null
    );
    assert.equal(dirtyRow.querySelector('[aria-label="More actions"]'), null);
    assert.equal(
      dirtyRow.querySelectorAll('.manager-tools-row-actions .manager-icon-button').length,
      1
    );
  });

  it('offers save-all navigation handling when leaving with unsaved tools', async () => {
    const calls = [];
    target = document.createElement('div');
    document.body.appendChild(target);
    mounted = mount(Component, {
      target,
      props: {
        store: createStore(calls, {
          toolsDraftDirty: true,
          toolsDraftDirtyToolIds: ['tool-catalyst'],
          trackCancelToolsDraft: true,
          toolsDraftSelectedToolId: 'tool-catalyst',
          toolsDraft: [
            {
              id: 'tool-catalyst',
              label: 'Artisan Catalyst',
              enabled: true,
              componentId: 'c1',
              requirement: null,
              breakage: { mode: 'limitedUses', maxUses: null },
              onBreak: { mode: 'destroy' },
            },
          ],
        }),
        services: {
          openCurrentAdmin: () => {},
          confirmDirtyToolsNavigation: () => {
            calls.push(['confirmDirtyToolsNavigation']);
            return 'save';
          },
        },
      },
    });
    flushSync();

    navButton('Gathering').click();
    await tick();
    flushSync();
    navButton('Tools').click();
    await tick();
    flushSync();
    navButton('Components').click();
    await Promise.resolve();
    await Promise.resolve();
    await tick();
    flushSync();

    assert.ok(calls.some((call) => call[0] === 'confirmDirtyToolsNavigation'));
    assert.ok(calls.some((call) => call[0] === 'saveAllDirtyToolDrafts'));
    assert.ok(calls.some((call) => call[0] === 'cancelToolsDraft'));
    assert.ok(target.textContent.includes('Components'));
  });

  it('expands a gathering tool row when the row is clicked', async () => {
    target = document.createElement('div');
    document.body.appendChild(target);
    mounted = mount(Component, {
      target,
      props: {
        store: createStore([], {
          toolsDraftSelectedToolId: 'tool-catalyst',
          toolsDraft: [
            {
              id: 'tool-catalyst',
              label: 'Artisan Catalyst',
              enabled: true,
              componentId: 'c1',
              requirement: null,
              breakage: { mode: 'limitedUses', maxUses: null },
              onBreak: { mode: 'destroy' },
            },
          ],
        }),
        services: { openCurrentAdmin: () => {} },
      },
    });
    flushSync();

    navButton('Gathering').click();
    await tick();
    flushSync();
    navButton('Tools').click();
    await tick();
    flushSync();

    const row = target.querySelector('[data-manager-tool-id="tool-catalyst"]');
    assert.ok(row);
    assert.equal(row.querySelector('[data-manager-tool-editor]'), null);

    row.querySelector('.manager-tools-row-body').click();
    await tick();
    flushSync();
    assert.ok(
      row.querySelector('[data-manager-tool-editor]'),
      'row click should expand the tool editor'
    );

    row.querySelector('.manager-tools-row-body').click();
    await tick();
    flushSync();
    assert.ok(
      row.querySelector('[data-manager-tool-editor]'),
      'row click should keep an already expanded tool open'
    );

    row.querySelector('.manager-tools-row-actions .manager-icon-button:last-child').click();
    await tick();
    flushSync();
    assert.equal(
      row.querySelector('[data-manager-tool-editor]'),
      null,
      'chevron button should remain the explicit collapse control'
    );
  });

  it('swaps a mapped gathering tool component from the row drop zone', async () => {
    const calls = [];
    target = document.createElement('div');
    document.body.appendChild(target);
    mounted = mount(Component, {
      target,
      props: {
        store: createStore(calls, {
          toolsDraftSelectedToolId: 'tool-catalyst',
          toolsDraft: [
            {
              id: 'tool-catalyst',
              label: '',
              enabled: true,
              componentId: 'c1',
              requirement: null,
              breakage: { mode: 'limitedUses', maxUses: null },
              onBreak: { mode: 'destroy' },
            },
          ],
        }),
        services: { openCurrentAdmin: () => {} },
      },
    });
    flushSync();

    navButton('Gathering').click();
    await tick();
    flushSync();
    navButton('Tools').click();
    await tick();
    flushSync();

    function dragPayloadFrom(card) {
      let raw = '';
      const dragStart = new Event('dragstart', { bubbles: true, cancelable: true });
      Object.defineProperty(dragStart, 'dataTransfer', {
        value: {
          setData: (type, value) => {
            if (type === 'text/plain') raw = value;
          },
          effectAllowed: '',
        },
      });
      card.dispatchEvent(dragStart);
      return raw;
    }

    function dropPayloadOn(node, raw) {
      const dropEvent = new Event('drop', { bubbles: true, cancelable: true });
      Object.defineProperty(dropEvent, 'dataTransfer', {
        value: { getData: (type) => (type === 'text/plain' ? raw : '') },
      });
      node.dispatchEvent(dropEvent);
    }

    const dropZone = target.querySelector(
      '[data-manager-tool-component-drop-zone="tool-catalyst"]'
    );
    assert.ok(dropZone);
    assert.ok(dropZone.classList.contains('is-component-drop-zone'));

    const payload = dragPayloadFrom(
      target.querySelector('[data-manager-tools-component-card="c2"]')
    );
    assert.deepEqual(JSON.parse(payload), { type: 'FabricateManagedComponent', componentId: 'c2' });
    dropPayloadOn(dropZone, payload);
    await tick();
    flushSync();

    assert.ok(
      calls.some(
        (call) =>
          call[0] === 'updateToolInDraft' &&
          call[1] === 'tool-catalyst' &&
          call[2].componentId === 'c2'
      )
    );
    assert.ok(
      target
        .querySelector('[data-manager-tool-id="tool-catalyst"]')
        .textContent.includes('Glass Vial'),
      'row drop should stage the replacement component on the tool'
    );
  });

  it('creates a gathering tool from a managed component dropped on the add-tool stub', async () => {
    const calls = [];
    target = document.createElement('div');
    document.body.appendChild(target);
    mounted = mount(Component, {
      target,
      props: {
        store: createStore(calls, {
          toolsDraftSelectedToolId: 'tool-catalyst',
          toolsDraft: [
            {
              id: 'tool-catalyst',
              label: 'Artisan Catalyst',
              enabled: true,
              componentId: 'c1',
              requirement: null,
              breakage: { mode: 'limitedUses', maxUses: null },
              onBreak: { mode: 'destroy' },
            },
          ],
        }),
        services: { openCurrentAdmin: () => {} },
      },
    });
    flushSync();

    navButton('Gathering').click();
    await tick();
    flushSync();
    navButton('Tools').click();
    await tick();
    flushSync();

    const addStub = target.querySelector('[data-manager-tools-add-stub]');
    assert.ok(addStub);
    addStub.click();
    await tick();
    flushSync();
    assert.ok(
      calls.some((call) => call[0] === 'addToolToDraft' && call.length === 1),
      'clicking the add stub should still create a blank tool'
    );

    let raw = '';
    const dragStart = new Event('dragstart', { bubbles: true, cancelable: true });
    Object.defineProperty(dragStart, 'dataTransfer', {
      value: {
        setData: (type, value) => {
          if (type === 'text/plain') raw = value;
        },
        effectAllowed: '',
      },
    });
    target.querySelector('[data-manager-tools-component-card="c2"]').dispatchEvent(dragStart);

    const dropEvent = new Event('drop', { bubbles: true, cancelable: true });
    Object.defineProperty(dropEvent, 'dataTransfer', {
      value: { getData: (type) => (type === 'text/plain' ? raw : '') },
    });
    addStub.dispatchEvent(dropEvent);
    await tick();
    flushSync();

    assert.ok(calls.some((call) => call[0] === 'addToolToDraft' && call[1]?.componentId === 'c2'));
  });

  it('creates a first-class item-sourced tool from a raw Item dropped on the add-tool stub (issue 561)', async () => {
    const calls = [];
    const importedDrops = [];
    target = document.createElement('div');
    document.body.appendChild(target);
    mounted = mount(Component, {
      target,
      props: {
        store: createStore(calls, {
          toolsDraft: [
            {
              id: 'tool-catalyst',
              label: 'Artisan Catalyst',
              enabled: true,
              componentId: 'c1',
              requirement: null,
              breakage: { mode: 'limitedUses', maxUses: null },
              onBreak: { mode: 'destroy' },
            },
          ],
        }),
        services: {
          openCurrentAdmin: () => {},
          // The rewired handler must NOT import the dropped Item as a component.
          importSingleManagedItemFromDrop: async (data) => {
            importedDrops.push(data);
            return { id: 'c2', name: 'Glass Vial' };
          },
        },
      },
    });
    flushSync();

    navButton('Gathering').click();
    await tick();
    flushSync();
    navButton('Tools').click();
    await tick();
    flushSync();

    const itemPayload = { type: 'Item', uuid: 'Actor.hero.Item.glass-vial' };
    const dropEvent = new Event('drop', { bubbles: true, cancelable: true });
    Object.defineProperty(dropEvent, 'dataTransfer', {
      value: { getData: (type) => (type === 'text/plain' ? JSON.stringify(itemPayload) : '') },
    });
    target.querySelector('[data-manager-tools-add-stub]').dispatchEvent(dropEvent);
    await Promise.resolve();
    await tick();
    flushSync();

    // No component import (the removed authoring wart), and the drop routes to the
    // first-class item-sourced tool registration with the Item uuid.
    assert.deepEqual(importedDrops, []);
    assert.ok(
      calls.some(
        (call) => call[0] === 'addToolFromUuidToDraft' && call[1] === 'Actor.hero.Item.glass-vial'
      )
    );
  });

  it('edits gathering tool requirements as a single expression without exposing provider selection', async () => {
    const calls = [];
    target = document.createElement('div');
    document.body.appendChild(target);
    mounted = mount(Component, {
      target,
      props: {
        store: createStore(calls, {
          toolsDraftSelectedToolId: 'tool-catalyst',
          toolsDraftExpandedToolId: 'tool-catalyst',
          toolsDraft: [
            {
              id: 'tool-catalyst',
              label: 'Artisan Catalyst',
              enabled: true,
              componentId: 'c1',
              requirement: { formula: '@tools.example.value' },
              breakage: { mode: 'limitedUses', maxUses: null },
              onBreak: { mode: 'destroy' },
            },
          ],
        }),
        services: { openCurrentAdmin: () => {} },
      },
    });
    flushSync();

    navButton('Gathering').click();
    await tick();
    flushSync();
    navButton('Tools').click();
    await tick();
    flushSync();

    const editor = target.querySelector('[data-manager-tool-editor]');
    assert.ok(editor);
    assert.equal(editor.querySelector('.manager-provider-expression-input'), null);
    assert.equal(editor.querySelector('select[id$="-provider"]'), null);
    assert.ok(editor.textContent.includes('Enter an actor roll-data property'));
    assert.ok(editor.textContent.includes('Example: @tools.example.value'));
    assert.ok(!editor.textContent.includes('Example: @abilities.str.mod'));
    assert.ok(!editor.textContent.includes('Example: @skills.prc.total'));

    const expressionInput = editor.querySelector('.manager-tools-requirement-expression input');
    assert.equal(expressionInput.value, '@tools.example.value');
    expressionInput.value = '@tools.smith.value';
    expressionInput.dispatchEvent(new Event('input', { bubbles: true }));
    await tick();
    flushSync();

    assert.ok(
      calls.some(
        (call) =>
          call[0] === 'updateToolInDraft' &&
          call[1] === 'tool-catalyst' &&
          call[2].requirement?.formula === '@tools.smith.value' &&
          call[2].requirement?.provider === undefined &&
          call[2].requirement?.macroUuid === undefined
      )
    );
  });

  it('renders gathering tool breakage chance as a full gradient slider without rarity tiers', async () => {
    const calls = [];
    target = document.createElement('div');
    document.body.appendChild(target);
    mounted = mount(Component, {
      target,
      props: {
        store: createStore(calls, {
          toolsDraftSelectedToolId: 'tool-catalyst',
          toolsDraftExpandedToolId: 'tool-catalyst',
          toolsDraft: [
            {
              id: 'tool-catalyst',
              label: 'Artisan Catalyst',
              enabled: true,
              componentId: 'c1',
              requirement: null,
              breakage: { mode: 'breakageChance', breakageChance: 25 },
              onBreak: { mode: 'destroy' },
            },
          ],
        }),
        services: { openCurrentAdmin: () => {} },
      },
    });
    flushSync();

    navButton('Gathering').click();
    await tick();
    flushSync();
    navButton('Tools').click();
    await tick();
    flushSync();

    const control = target.querySelector(
      '[data-manager-tool-editor] .manager-tool-breakage-chance-control'
    );
    assert.ok(control);
    assert.ok(control.classList.contains('manager-drop-rate-control'));
    for (const tierClass of [
      'is-none',
      'is-legendary',
      'is-very-rare',
      'is-rare',
      'is-uncommon',
      'is-common',
      'is-guaranteed',
    ]) {
      assert.equal(
        control.classList.contains(tierClass),
        false,
        `breakage chance slider should not use ${tierClass}`
      );
    }
    assert.ok(control.getAttribute('style').includes('--fab-drop-rate-value: 25%;'));
    assert.ok(
      control
        .getAttribute('style')
        .includes(
          '--fab-tool-breakage-chance-color: color-mix(in srgb, var(--fab-warning) 50%, var(--fab-success) 50%);'
        )
    );

    const range = control.querySelector('input[type="range"]');
    assert.ok(range);
    range.value = '75';
    range.dispatchEvent(new Event('input', { bubbles: true }));
    await tick();
    flushSync();

    assert.ok(
      calls.some(
        (call) =>
          call[0] === 'updateToolInDraft' &&
          call[1] === 'tool-catalyst' &&
          call[2].breakage?.mode === 'breakageChance' &&
          call[2].breakage?.breakageChance === 75
      )
    );
    assert.ok(
      control
        .getAttribute('style')
        .includes(
          '--fab-tool-breakage-chance-color: color-mix(in srgb, var(--fab-danger) 50%, var(--fab-warning) 50%);'
        )
    );

    const percentInput = target.querySelector(
      '[data-manager-tool-editor] .manager-drop-rate-percent input[type="text"]'
    );
    percentInput.value = '42';
    percentInput.dispatchEvent(new Event('input', { bubbles: true }));
    await tick();
    flushSync();

    assert.ok(
      calls.some(
        (call) =>
          call[0] === 'updateToolInDraft' &&
          call[1] === 'tool-catalyst' &&
          call[2].breakage?.mode === 'breakageChance' &&
          call[2].breakage?.breakageChance === 42
      )
    );
  });

  it('uses the primary component drop-zone layout for replacement tools', async () => {
    const calls = [];
    target = document.createElement('div');
    document.body.appendChild(target);
    mounted = mount(Component, {
      target,
      props: {
        store: createStore(calls, {
          toolsDraftSelectedToolId: 'tool-catalyst',
          toolsDraftExpandedToolId: 'tool-catalyst',
          toolsDraft: [
            {
              id: 'tool-catalyst',
              label: 'Artisan Catalyst',
              enabled: true,
              componentId: 'c1',
              requirement: null,
              breakage: { mode: 'limitedUses', maxUses: null },
              onBreak: { mode: 'replaceWith', replacementComponentId: null },
            },
          ],
        }),
        services: { openCurrentAdmin: () => {} },
      },
    });
    flushSync();

    navButton('Gathering').click();
    await tick();
    flushSync();
    navButton('Tools').click();
    await tick();
    flushSync();

    const replacementDropZone = target.querySelector(
      '[data-manager-tool-replacement-drop-zone="tool-catalyst"]'
    );
    assert.ok(replacementDropZone);
    const replacementField = replacementDropZone.parentElement;
    assert.ok(replacementField.classList.contains('manager-tools-replacement-field'));
    assert.equal(replacementField.classList.contains('manager-tools-inline-field'), false);
    assert.equal(replacementField.firstElementChild, replacementDropZone);
    assert.equal(
      Array.from(replacementField.children).some(
        (child) => child.tagName === 'SPAN' && child.textContent.trim() === 'Replacement component'
      ),
      false
    );
    assert.equal(
      replacementDropZone.querySelector('select'),
      null,
      'replacement component should use the primary drop-zone layout instead of a select'
    );
    assert.ok(replacementDropZone.querySelector('.manager-drop-empty-component'));
    assert.ok(replacementDropZone.textContent.includes('No Component'));
    assert.ok(replacementDropZone.textContent.includes('Create or assign'));

    let raw = '';
    const dragStart = new Event('dragstart', { bubbles: true, cancelable: true });
    Object.defineProperty(dragStart, 'dataTransfer', {
      value: {
        setData: (type, value) => {
          if (type === 'text/plain') raw = value;
        },
        effectAllowed: '',
      },
    });
    target.querySelector('[data-manager-tools-component-card="c2"]').dispatchEvent(dragStart);

    const dropEvent = new Event('drop', { bubbles: true, cancelable: true });
    Object.defineProperty(dropEvent, 'dataTransfer', {
      value: { getData: (type) => (type === 'text/plain' ? raw : '') },
    });
    replacementDropZone.dispatchEvent(dropEvent);
    await tick();
    flushSync();

    assert.ok(
      calls.some(
        (call) =>
          call[0] === 'updateToolInDraft' &&
          call[1] === 'tool-catalyst' &&
          call[2].onBreak?.mode === 'replaceWith' &&
          call[2].onBreak?.replacementComponentId === 'c2'
      )
    );
    assert.ok(replacementDropZone.textContent.includes('Glass Vial'));

    const clearEvent = new MouseEvent('contextmenu', { bubbles: true, cancelable: true });
    replacementDropZone.querySelector('.manager-drop-component-button').dispatchEvent(clearEvent);
    await tick();
    flushSync();

    assert.ok(
      calls.some(
        (call) =>
          call[0] === 'updateToolInDraft' &&
          call[1] === 'tool-catalyst' &&
          call[2].onBreak?.mode === 'replaceWith' &&
          call[2].onBreak?.replacementComponentId === null
      )
    );
  });

  it('shows setup guidance and keeps create routing when a gathering system has no environments', async () => {
    const calls = [];
    target = document.createElement('div');
    document.body.appendChild(target);
    mounted = mount(Component, {
      target,
      props: {
        store: createStore(calls, { emptyEnvironments: true }),
        services: { openCurrentAdmin: () => {} },
      },
    });
    flushSync();

    navButton('Gathering').click();
    await tick();
    flushSync();

    assert.equal(target.querySelector('.fabricate-manager').dataset.managerView, 'environments');
    const gatheringItems = Array.from(target.querySelectorAll('.manager-nav-subitem'));
    assert.deepEqual(
      gatheringItems.map((item) => item.querySelector('.manager-nav-label')?.textContent.trim()),
      ['Environments', 'Tasks', 'Events', 'Settings']
    );
    assert.deepEqual(
      gatheringItems.map(
        (item) => item.querySelector('.manager-nav-count')?.textContent.trim() ?? null
      ),
      ['0', '3', '0', null]
    );
    assert.equal(gatheringSubitem('Environments').getAttribute('aria-current'), 'page');
    assert.ok(target.textContent.includes('Prepare gathering building blocks first'));
    assert.ok(
      target.textContent.includes('Define gathering tasks and events before creating environments')
    );
    assert.ok(target.textContent.includes('Review tasks'));
    assert.ok(target.textContent.includes('Review events'));
    assert.ok(target.textContent.includes('Plan gathering content'));
    assert.ok(target.textContent.includes('Define gathering tasks with their checks'));
    assert.ok(target.textContent.includes('Prepare event options'));
    assert.ok(
      target.textContent.includes(
        'Create environments after the gathering task and event libraries are ready to attach.'
      )
    );
    assert.ok(target.textContent.includes('Gathering docs'));
    assert.equal(target.textContent.includes('Select an environment'), false);

    Array.from(target.querySelectorAll('.manager-table-scroll .manager-button'))
      .find((button) => button.textContent.includes('Review tasks'))
      .click();
    await tick();
    flushSync();

    assert.equal(gatheringSubitem('Tasks').getAttribute('aria-current'), 'page');
    assert.ok(target.textContent.includes('Gather Moon Herbs'));
    assert.ok(target.querySelector('[data-gathering-tasks-browser]'));
    assert.ok(target.querySelector('[data-gathering-task-inspector]'));
    assert.equal(
      target.querySelector('.manager-inspector').textContent.includes('Plan gathering content'),
      false
    );

    gatheringSubitem('Environments').click();
    await tick();
    flushSync();

    Array.from(target.querySelectorAll('.manager-table-scroll .manager-button'))
      .find((button) => button.textContent.includes('Review events'))
      .click();
    await tick();
    flushSync();

    assert.equal(gatheringSubitem('Events').getAttribute('aria-current'), 'page');
    assert.ok(
      target.querySelector('[data-gathering-events-browser]'),
      'Review events button should land on the event library'
    );

    gatheringSubitem('Environments').click();
    await tick();
    flushSync();

    target.querySelector('.manager-table-scroll .manager-button.is-primary').click();
    await tick();
    flushSync();

    assert.equal(
      target.querySelector('.fabricate-manager').dataset.managerView,
      'environment-edit'
    );
    assert.ok(calls.some((call) => call[0] === 'createEnvironmentDraft'));
  });

  it('shows create guidance when the gathering task library is empty', async () => {
    const calls = [];
    target = document.createElement('div');
    document.body.appendChild(target);
    mounted = mount(Component, {
      target,
      props: {
        store: createStore(calls, { emptyGatheringTasks: true }),
        services: { openCurrentAdmin: () => {} },
      },
    });
    flushSync();

    navButton('Gathering').click();
    await tick();
    flushSync();
    gatheringSubitem('Tasks').click();
    await tick();
    flushSync();

    assert.ok(target.textContent.includes('No gathering tasks yet'));
    assert.ok(
      target.textContent.includes('Create gathering tasks before attaching them to environments.')
    );
    target.querySelector('[data-gathering-tasks-browser] .manager-button.is-primary').click();
    await tick();
    flushSync();

    assert.deepEqual(
      calls.find((call) => call[0] === 'addGatheringLibraryTask'),
      ['addGatheringLibraryTask', 'alchemy']
    );
  });

  it('shows setup guidance when a system has no recipes', async () => {
    const calls = [];
    target = document.createElement('div');
    document.body.appendChild(target);
    mounted = mount(Component, {
      target,
      props: {
        store: createStore(calls, { emptyRecipes: true, experimentalFeaturesEnabled: true }),
        services: { openCurrentAdmin: () => {} },
      },
    });
    flushSync();

    const recipesNav = craftingParent();
    assert.equal(recipesNav.disabled, false);
    // No recipes, but the fixture's 2 books & scrolls items still count toward the
    // Crafting parent total; the setup guidance below is keyed on empty recipes, not
    // this badge (issue 643).
    assert.equal(recipesNav.querySelector('.manager-nav-count')?.textContent.trim(), '2');
    for (const label of ['Graph']) {
      const plannedNav = navButton(label);
      assert.equal(plannedNav.disabled, true);
      assert.equal(plannedNav.querySelector('.manager-nav-count')?.textContent.trim(), 'Soon');
    }

    craftingParent().click();
    await tick();
    flushSync();

    assert.equal(target.querySelector('.fabricate-manager').dataset.managerView, 'recipes');
    assert.ok(target.textContent.includes('No recipes yet'));
    assert.ok(target.textContent.includes('Set up recipes'));
    assert.ok(
      target.textContent.includes('Choose the recipe structure supported by the selected system.')
    );
    assert.ok(target.textContent.includes('Recipe docs'));
    assert.equal(target.textContent.includes('Select a recipe'), false);

    // The Recipe Editor was removed, so the empty state no longer offers a
    // Create Recipe button.
    assert.equal(
      target.querySelector('.manager-table-scroll .manager-button.is-primary'),
      null,
      'empty recipe state should not offer a create button'
    );
    assert.ok(
      !calls.some((call) => call[0] === 'createRecipe'),
      'createRecipe should no longer be wired'
    );
  });

  it('points empty recipe setup to Components when the system has no components', async () => {
    const calls = [];
    target = document.createElement('div');
    document.body.appendChild(target);
    mounted = mount(Component, {
      target,
      props: {
        store: createStore(calls, {
          emptyRecipes: true,
          emptyComponents: true,
          experimentalFeaturesEnabled: true,
        }),
        services: { openCurrentAdmin: () => {} },
      },
    });
    flushSync();

    craftingParent().click();
    await tick();
    flushSync();

    assert.equal(target.querySelector('.fabricate-manager').dataset.managerView, 'recipes');
    assert.ok(target.textContent.includes('No recipes yet'));
    assert.ok(target.textContent.includes('Add components before creating recipes'));
    assert.ok(
      target.textContent.includes(
        'Open Components and drop world, compendium, pack, or folder items into this system.'
      )
    );
    assert.ok(target.textContent.includes('Add components'));
    assert.equal(
      target.textContent.includes('Choose the recipe structure supported by the selected system.'),
      false
    );

    Array.from(target.querySelectorAll('.manager-setup-links .manager-button'))
      .find((button) => button.textContent.includes('Add components'))
      .click();
    await tick();
    flushSync();

    assert.equal(target.querySelector('.fabricate-manager').dataset.managerView, 'components');
    assert.ok(target.textContent.includes('No components yet'));
  });

  it('shows setup guidance and keeps import affordance when a system has no components', async () => {
    const calls = [];
    target = document.createElement('div');
    document.body.appendChild(target);
    mounted = mount(Component, {
      target,
      props: {
        store: createStore(calls, { emptyComponents: true }),
        services: {
          openCurrentAdmin: () => {},
          onDropItem: (data) => calls.push(['dropItem', data]),
        },
      },
    });
    flushSync();

    navButton('Components').click();
    await tick();
    flushSync();

    assert.equal(target.querySelector('.fabricate-manager').dataset.managerView, 'components');
    assert.ok(target.textContent.includes('No components yet'));
    assert.ok(target.textContent.includes('Set up components'));
    assert.ok(
      target.textContent.includes(
        'Drop world, compendium, pack, or folder items into the component browser.'
      )
    );
    assert.ok(target.textContent.includes('Component docs'));
    assert.ok(target.querySelector('.manager-component-drop-zone'));
    assert.equal(target.textContent.includes('Select a component'), false);
  });

  it('shows setup guidance and keeps create routing when a system has no essences', async () => {
    const calls = [];
    target = document.createElement('div');
    document.body.appendChild(target);
    mounted = mount(Component, {
      target,
      props: {
        store: createStore(calls, { emptyEssences: true }),
        services: { openCurrentAdmin: () => {} },
      },
    });
    flushSync();

    navButton('Essences').click();
    await tick();
    flushSync();

    assert.equal(target.querySelector('.fabricate-manager').dataset.managerView, 'essences');
    assert.ok(target.textContent.includes('No essences yet'));
    assert.ok(target.textContent.includes('Set up essences'));
    assert.ok(
      target.textContent.includes('Create an essence with a clear name, icon, and description.')
    );
    assert.ok(target.textContent.includes('Essence docs'));
    assert.equal(target.textContent.includes('Select an essence'), false);

    target.querySelector('.manager-header-actions .manager-button.is-primary').click();
    await tick();
    flushSync();

    assert.equal(target.querySelector('.fabricate-manager').dataset.managerView, 'essence-edit');
  });

  it('creates a new environment draft with draft-backed title and inspector context', async () => {
    const calls = [];
    target = document.createElement('div');
    document.body.appendChild(target);
    mounted = mount(Component, {
      target,
      props: {
        store: createStore(calls),
        services: { openCurrentAdmin: () => {} },
      },
    });
    flushSync();

    navButton('Gathering').click();
    await tick();
    flushSync();
    target.querySelector('.manager-header-actions .manager-button.is-primary').click();
    await tick();
    flushSync();

    assert.equal(
      target.querySelector('.fabricate-manager').dataset.managerView,
      'environment-edit'
    );
    // The environment editor matches the task/event convention: a STATIC title,
    // breadcrumb crumb, and concise help-text subtitle — the environment NAME and
    // DESCRIPTION are no longer injected into the chrome. Pills render under the title.
    assert.equal(target.querySelector('.manager-title').textContent.trim(), 'Edit environment');
    const envEditCrumbs = Array.from(target.querySelectorAll('.manager-breadcrumbs span'));
    assert.equal(
      envEditCrumbs[envEditCrumbs.length - 1].textContent.trim(),
      'Edit environment',
      'final breadcrumb crumb should be the static label, not the environment name'
    );
    assert.equal(
      target.querySelector('.manager-subtitle').textContent.trim(),
      'Edit scene linkage, identity, tasks, events, tools, and validation for the selected environment.',
      'subtitle should be the static help text, not the environment description'
    );
    assert.ok(
      target.querySelector('[data-environment-status-pills]'),
      'chrome header should render environment status pills'
    );
    assert.ok(
      target.querySelector('[data-action="delete-environment"]'),
      'chrome header should expose the delete action'
    );
    // The v2 composition editor owns its own contextual inspector inside the
    // editor workspace (the manager root no longer renders the shared rail for
    // this view), defaulting to the environment summary when nothing is selected.
    assert.ok(
      target.querySelector('.manager-environment-edit-view[data-environment-editor]'),
      'environment-edit should mount the composition editor'
    );
    assert.ok(
      target.querySelector('.manager-environment-inspector'),
      'composition editor should render its own inspector rail'
    );
    assert.ok(
      target.querySelector('[data-environment-summary-inspector]'),
      'inspector should default to the environment summary with no selection'
    );
    assert.ok(calls.some((call) => call[0] === 'createEnvironmentDraft'));
  });

  it('shows the linked scene thumbnail in place of the environment image and locks the editor identity', async () => {
    const calls = [];
    target = document.createElement('div');
    document.body.appendChild(target);
    mounted = mount(Component, {
      target,
      props: {
        store: createStore(calls),
        services: { openCurrentAdmin: () => {} },
      },
    });
    flushSync();

    navButton('Gathering').click();
    await tick();
    flushSync();
    gatheringSubitem('Environments').click();
    await tick();
    flushSync();

    // Display precedence: the linked scene thumbnail replaces the environment's own image,
    // even though the environment stores its own `img` ('forest-custom.webp').
    const forestRow =
      target.querySelector('[data-environment-id="env-forest"]') ||
      Array.from(target.querySelectorAll('.manager-environment-row')).find((row) =>
        row.textContent.includes('Moonlit Forest')
      );
    assert.equal(
      forestRow.querySelector('.manager-environment-thumb').getAttribute('src'),
      'forest-medium.webp',
      'a linked scene image should replace the environment image in browser rows'
    );

    // Open the editor on the forest draft (scene linked).
    target.querySelector('.manager-header-actions .manager-button.is-primary').click();
    await tick();
    flushSync();
    assert.equal(
      target.querySelector('.fabricate-manager').dataset.managerView,
      'environment-edit'
    );

    // Identity image is a locked, muted scene thumbnail — not an editable picker.
    let picker = target.querySelector(
      '[data-overview-section="identity"] .manager-task-image-picker'
    );
    assert.ok(
      picker.classList.contains('is-scene-linked'),
      'identity image should be scene-locked while a scene is linked'
    );
    assert.equal(picker.tagName, 'SPAN', 'locked identity image should not be an editable button');
    assert.ok(picker.querySelector('.fa-lock'), 'locked identity image should show a lock icon');
    assert.equal(
      target.querySelector('[data-overview-section="identity"] .fa-pen'),
      null,
      'locked identity image should not show the edit affordance'
    );
    assert.equal(
      picker.querySelector('img').getAttribute('src'),
      'forest-medium.webp',
      'locked identity image should show the scene thumbnail'
    );

    // Unlink the scene → the identity image returns to the editable stored value.
    target.querySelector('[data-environment-summary-scene] .manager-icon-button.is-danger').click();
    await tick();
    flushSync();

    picker = target.querySelector('[data-overview-section="identity"] .manager-task-image-picker');
    assert.equal(
      picker.tagName,
      'BUTTON',
      'identity image should be editable again once the scene is unlinked'
    );
    assert.equal(picker.classList.contains('is-scene-linked'), false);
    assert.ok(
      picker.querySelector('.fa-pen'),
      'unlocked identity image should show the edit affordance'
    );
    assert.equal(
      picker.querySelector('img').getAttribute('src'),
      'forest-custom.webp',
      'unlinking should restore the stored environment image'
    );
  });

  it('protects dirty environment edit drafts when leaving via the back button', async () => {
    const calls = [];
    target = document.createElement('div');
    document.body.appendChild(target);
    mounted = mount(Component, {
      target,
      props: {
        store: createStore(calls, { confirmDiscardResult: false }),
        services: { openCurrentAdmin: () => {} },
      },
    });
    flushSync();

    navButton('Gathering').click();
    await tick();
    flushSync();
    target.querySelector('.manager-header-actions .manager-button.is-primary').click();
    await tick();
    flushSync();
    assert.equal(
      target.querySelector('.fabricate-manager').dataset.managerView,
      'environment-edit'
    );

    const backButton = Array.from(
      target.querySelectorAll('.manager-header-actions .manager-button')
    ).find((button) => button.textContent.includes('Back to environments'));
    assert.ok(backButton, 'env-edit header should render a Back to environments button');
    backButton.click();
    await tick();
    flushSync();

    assert.ok(
      calls.some((call) => call[0] === 'confirmDiscardDirtyEnvironmentDraft'),
      'clicking Back with a dirty draft should ask the store to confirm discard'
    );
    assert.equal(
      calls.filter((call) => call[0] === 'cancelEnvironmentDraft').length,
      0,
      'declining the confirm should not run cancelEnvironmentDraft'
    );
    assert.equal(
      target.querySelector('.fabricate-manager').dataset.managerView,
      'environment-edit',
      'declining the confirm should keep the editor open'
    );
  });

  it('omits source and action controls from mounted task and event record inspectors', async () => {
    const updateCalls = [];
    target = document.createElement('div');
    document.body.appendChild(target);
    mounted = mount(EnvironmentEditViewComponent, {
      target,
      props: {
        environmentDraft: {
          id: 'env-forest',
          craftingSystemId: 'alchemy',
          name: 'Moonlit Forest',
          enabled: true,
          selectionMode: 'targeted',
          compositionMode: 'automatic',
          taskDropRateAdjustments: { 'task-forage': { 'drop-herb': 15, 'drop-root': -10 } },
          taskDropRateAdjustmentsEnabled: {},
        },
        composition: {
          compositionMode: 'automatic',
          conditions: {},
          counts: { availableTasks: 1, availableEvents: 1 },
          tasks: [
            {
              id: 'task-forage',
              record: { name: 'Forage Herbs', img: 'icons/svg/item-bag.svg' },
              compositionState: 'includedByMatch',
              runtimeState: 'available',
              libraryEnabled: true,
              matches: true,
              conditionsMet: true,
              evidence: {
                biome: {
                  state: 'match',
                  recordValues: ['forest', 'desert'],
                  envValues: ['forest'],
                  applicable: true,
                },
                region: {
                  state: 'mismatch',
                  recordValues: ['south'],
                  envValues: ['north'],
                  applicable: true,
                },
                weather: {
                  state: 'mismatch',
                  recordValues: ['storm'],
                  envValues: ['clear'],
                  applicable: true,
                },
                time: { state: 'any', recordValues: [], envValues: ['day'], applicable: true },
                danger: {
                  state: 'any',
                  recordValues: ['deadly'],
                  envValues: ['dangerous'],
                  applicable: false,
                },
              },
              dropRateAdjustmentsEnabled: true,
              dropRateAdjustmentRows: [
                {
                  id: 'drop-herb',
                  name: 'Moon Herb',
                  img: 'icons/consumables/plants/leaf-green.webp',
                  componentId: 'c1',
                  quantity: 1,
                  baseDropRate: 40,
                  adjustment: 15,
                  effectiveDropRate: 55,
                  hasDropRateAdjustment: true,
                },
                {
                  id: 'drop-root',
                  name: 'Moon Root',
                  img: 'icons/consumables/plants/root-brown.webp',
                  componentId: 'c2',
                  quantity: 1,
                  baseDropRate: 30,
                  adjustment: -10,
                  effectiveDropRate: 20,
                  hasDropRateAdjustment: true,
                },
              ],
            },
          ],
          events: [
            {
              id: 'event-thorns',
              record: { name: 'Thorn Snare', img: 'icons/svg/hazard.svg', dropRate: 10 },
              compositionState: 'includedByMatch',
              runtimeState: 'available',
              libraryEnabled: true,
              matches: true,
              conditionsMet: true,
              evidence: {
                biome: {
                  state: 'match',
                  recordValues: ['forest'],
                  envValues: ['forest'],
                  applicable: true,
                },
                region: {
                  state: 'match',
                  recordValues: ['north'],
                  envValues: ['north'],
                  applicable: true,
                },
                weather: {
                  state: 'match',
                  recordValues: ['clear'],
                  envValues: ['clear'],
                  applicable: true,
                },
                time: {
                  state: 'mismatch',
                  recordValues: ['night'],
                  envValues: ['day'],
                  applicable: true,
                },
                danger: {
                  state: 'mismatch',
                  recordValues: ['deadly'],
                  envValues: ['dangerous'],
                  applicable: true,
                },
              },
              dropRateAdjustment: 0,
            },
          ],
        },
        onUpdateEnvironment: (updates) => updateCalls.push(updates),
      },
    });
    flushSync();

    target.querySelector('[data-environment-tab-button="tasks"]').click();
    await tick();
    flushSync();
    const taskInspector = target.querySelector('[data-record-inspector="task"]');
    assert.ok(taskInspector, 'tasks tab should render the selected task inspector');
    assert.ok(
      taskInspector.querySelector('.manager-inspector-title-row'),
      'task inspector should render the selected-record header'
    );
    assert.ok(
      taskInspector.textContent.includes('Selected task'),
      'task inspector header should identify the selected task'
    );
    assert.ok(
      taskInspector.textContent.includes('Forage Herbs'),
      'task inspector header should include the selected task name'
    );
    assert.equal(
      taskInspector.querySelector('[data-composition-state]')?.dataset.compositionState,
      'includedByMatch',
      'task inspector header should keep the composition pill'
    );
    assert.equal(
      taskInspector.querySelector('[data-runtime-state]')?.dataset.runtimeState,
      'available',
      'task inspector header should keep the runtime pill'
    );
    assert.equal(
      target.querySelector('[data-record-inspector-section="source"]'),
      null,
      'task inspector should not render a Source card'
    );
    assert.equal(
      target.querySelector('[data-record-inspector-section="runtime-state"]'),
      null,
      'task inspector should not render a Runtime state card'
    );
    assert.equal(
      target.querySelector('.manager-environment-inspector-actions'),
      null,
      'task inspector should not render the selected-record action strip'
    );
    assert.equal(
      target.querySelector('.manager-environment-open-source'),
      null,
      'task inspector should not render an open-source CTA'
    );
    assert.equal(
      target
        .querySelector('[data-record-inspector-section="evidence"] .manager-card-title')
        .textContent.trim(),
      'Task Environment Matching'
    );
    const taskEvidenceRows = Array.from(
      target.querySelectorAll('.manager-environment-evidence-table [data-evidence-field]')
    );
    assert.deepEqual(
      taskEvidenceRows.map((row) => row.dataset.evidenceField),
      ['biome', 'weather', 'time', 'danger'],
      'task evidence table should render every composition dimension (region is geography, not composition)'
    );
    assert.equal(
      target
        .querySelector('[data-evidence-field="biome"] [data-evidence-value-state="match"]')
        .textContent.trim(),
      'Forest'
    );
    assert.equal(
      target
        .querySelector('[data-evidence-field="biome"] [data-evidence-value-state="mismatch"]')
        .textContent.trim(),
      'Desert'
    );
    assert.equal(
      target
        .querySelector('[data-evidence-field="weather"] .manager-environment-evidence-value-pill')
        .classList.contains('is-warning'),
      true,
      'weather mismatch should use warning tone'
    );
    assert.ok(
      target.querySelector('[data-evidence-field="danger"]').textContent.includes('Any danger'),
      'task evidence table should keep the danger row as unconstrained'
    );
    const taskOverrides = target.querySelector('[data-record-inspector-section="overrides"]');
    assert.ok(taskOverrides, 'task inspector should keep the overrides card');
    assert.ok(
      taskOverrides.querySelector('[data-task-drop-rate-adjustments-toggle]'),
      'task overrides should render the apply toggle'
    );
    assert.ok(
      taskOverrides.textContent.includes('Base chance modifiers'),
      'task overrides should render the base chance modifier section'
    );
    assert.ok(
      taskOverrides.textContent.includes('Base 40%'),
      'task overrides should keep the base chance context'
    );
    assert.ok(
      taskOverrides.textContent.includes('Effective 55%'),
      'task overrides should keep the effective chance context'
    );
    const taskAdjustmentRow = taskOverrides.querySelector(
      '[data-drop-rate-adjustment="drop-herb"]'
    );
    assert.ok(taskAdjustmentRow, 'task drop override should render a row for the selected drop');
    assert.equal(
      taskAdjustmentRow.classList.contains('is-positive'),
      true,
      'positive modifiers should color the whole task drop override row'
    );
    assert.equal(
      taskOverrides
        .querySelector('[data-drop-rate-adjustment="drop-root"]')
        ?.classList.contains('is-negative'),
      true,
      'negative modifiers should color the whole task drop override row'
    );
    assert.equal(
      taskAdjustmentRow
        .querySelector('.manager-environment-drop-adjustment-thumb')
        ?.getAttribute('src'),
      'icons/consumables/plants/leaf-green.webp',
      'task drop override should render the drop image'
    );
    assert.equal(
      taskAdjustmentRow
        .querySelector('.manager-environment-drop-adjustment-drop strong')
        ?.textContent.trim(),
      'Moon Herb',
      'task drop override should render the drop name'
    );
    assert.equal(
      taskAdjustmentRow.querySelector('[data-drop-rate-adjustment-base]')?.textContent.trim(),
      'Base 40%',
      'base rate should be its own one-row item'
    );
    const taskEffectiveRate = taskAdjustmentRow.querySelector(
      '[data-drop-rate-adjustment-effective]'
    );
    assert.equal(
      taskEffectiveRate?.textContent.trim(),
      'Effective 55%',
      'effective rate should be its own one-row item'
    );
    const taskClearButton = taskAdjustmentRow.querySelector(
      '.manager-environment-drop-adjustment-clear'
    );
    assert.ok(taskClearButton, 'task drop override should render an icon-only clear button');
    assert.equal(taskClearButton.getAttribute('aria-label'), 'Clear');
    assert.equal(taskClearButton.getAttribute('title'), 'Clear');
    assert.equal(
      taskClearButton.textContent.trim(),
      '',
      'clear button should not render visible text'
    );
    assert.equal(
      taskClearButton.parentElement?.classList.contains(
        'manager-environment-drop-adjustment-controls'
      ),
      true,
      'clear button should stay inside the task drop control row'
    );
    assert.equal(
      taskEffectiveRate?.nextElementSibling,
      taskClearButton,
      'clear button should sit immediately after the effective rate block'
    );
    const taskAdjustmentInput = taskOverrides.querySelector(
      '[data-drop-rate-adjustment="drop-herb"] [data-drop-rate-adjustment-input]'
    );
    assert.ok(taskAdjustmentInput, 'task drop override should render a custom percent input');
    assert.equal(taskAdjustmentInput.getAttribute('type'), 'text');
    assert.equal(taskAdjustmentInput.value, '+15');
    assert.equal(
      taskAdjustmentInput.getAttribute('aria-label'),
      'Drop-rate adjustment (-100% to +100%)'
    );
    const percentShell = taskAdjustmentRow.querySelector('[data-drop-rate-adjustment-percent]');
    assert.ok(percentShell, 'task drop override should render the percent suffix shell');
    assert.equal(
      percentShell.classList.contains('is-positive'),
      false,
      'positive modifiers should not color the percent input shell'
    );
    assert.equal(
      taskOverrides
        .querySelector(
          '[data-drop-rate-adjustment="drop-root"] [data-drop-rate-adjustment-percent]'
        )
        ?.classList.contains('is-negative'),
      false,
      'negative modifiers should not color the percent input shell'
    );
    assert.equal(
      taskOverrides.querySelector('[data-drop-rate-adjustment="drop-herb"] input[type="number"]'),
      null,
      'task drop override should not use the plain number input'
    );
    taskAdjustmentInput.value = '-';
    taskAdjustmentInput.dispatchEvent(new Event('input', { bubbles: true }));
    assert.equal(
      updateCalls.length,
      0,
      'typing a lone negative sign should remain an intermediate edit state'
    );
    taskAdjustmentInput.value = '-5';
    taskAdjustmentInput.dispatchEvent(new Event('input', { bubbles: true }));
    assert.deepEqual(
      updateCalls.at(-1),
      { taskDropRateAdjustments: { 'task-forage': { 'drop-herb': -5, 'drop-root': -10 } } },
      'task percent input should update the stored drop adjustment'
    );
    taskOverrides.querySelector('[data-task-drop-rate-adjustments-toggle]').click();
    assert.deepEqual(
      updateCalls.at(-1),
      { taskDropRateAdjustmentsEnabled: { 'task-forage': false } },
      'turning the toggle off should preserve stored values and only disable application'
    );

    target.querySelector('[data-environment-tab-button="events"]').click();
    await tick();
    flushSync();
    const eventInspector = target.querySelector('[data-record-inspector="event"]');
    assert.ok(eventInspector, 'events tab should render the selected event inspector');
    assert.ok(
      eventInspector.querySelector('.manager-inspector-title-row'),
      'event inspector should render the selected-record header'
    );
    assert.ok(
      eventInspector.textContent.includes('Selected event'),
      'event inspector header should identify the selected event'
    );
    assert.ok(
      eventInspector.textContent.includes('Thorn Snare'),
      'event inspector header should include the selected event name'
    );
    assert.equal(
      eventInspector.querySelector('[data-composition-state]')?.dataset.compositionState,
      'includedByMatch',
      'event inspector header should keep the composition pill'
    );
    assert.equal(
      eventInspector.querySelector('[data-runtime-state]')?.dataset.runtimeState,
      'available',
      'event inspector header should keep the runtime pill'
    );
    assert.equal(
      target.querySelector('[data-record-inspector-section="source"]'),
      null,
      'event inspector should not render a Source card'
    );
    assert.equal(
      target.querySelector('[data-record-inspector-section="runtime-state"]'),
      null,
      'event inspector should not render a Runtime state card'
    );
    assert.equal(
      target.querySelector('[data-record-inspector-section="event-runtime"]'),
      null,
      'event inspector should not render a Event runtime card'
    );
    assert.equal(
      target.querySelector('.manager-environment-inspector-actions'),
      null,
      'event inspector should not render the selected-record action strip'
    );
    assert.equal(
      target.querySelector('.manager-environment-open-source'),
      null,
      'event inspector should not render an open-source CTA'
    );
    assert.equal(
      target
        .querySelector('[data-record-inspector-section="evidence"] .manager-card-title')
        .textContent.trim(),
      'Event Environment Matching'
    );
    const eventEvidenceRows = Array.from(
      target.querySelectorAll('.manager-environment-evidence-table [data-evidence-field]')
    );
    assert.deepEqual(
      eventEvidenceRows.map((row) => row.dataset.evidenceField),
      ['biome', 'weather', 'time', 'danger'],
      'event evidence table should render every composition dimension (region is geography, not composition)'
    );
    assert.equal(
      target
        .querySelector('[data-evidence-field="danger"] [data-evidence-value-state="mismatch"]')
        .textContent.trim(),
      'Deadly'
    );
    assert.equal(
      target
        .querySelector('[data-evidence-field="danger"] .manager-environment-evidence-value-pill')
        .classList.contains('is-danger'),
      true,
      'danger mismatch should use danger tone'
    );
    const eventOverrides = target.querySelector('[data-record-inspector-section="overrides"]');
    assert.ok(eventOverrides, 'event inspector should keep the overrides card');
    assert.ok(
      eventOverrides.textContent.includes('Environment overrides'),
      'event overrides card should keep its title'
    );
    assert.ok(
      eventOverrides.textContent.includes('Base chance modifier'),
      'event overrides should render the singular base-chance-modifier heading'
    );
    assert.ok(
      eventOverrides.querySelector('[data-event-drop-rate-adjustments-toggle]'),
      'event overrides should render the apply toggle'
    );
    const eventAdjustmentRow = eventOverrides.querySelector(
      '[data-drop-rate-adjustment="event-thorns"]'
    );
    assert.ok(
      eventAdjustmentRow,
      'event override should render a single row card for the selected event'
    );
    assert.equal(
      eventAdjustmentRow.classList.contains('is-task-drop'),
      true,
      'event override row should reuse the task-drop card layout'
    );
    assert.equal(
      eventAdjustmentRow
        .querySelector('.manager-environment-drop-adjustment-thumb')
        ?.getAttribute('src'),
      'icons/svg/hazard.svg',
      'event override should render the event image'
    );
    assert.equal(
      eventAdjustmentRow
        .querySelector('.manager-environment-drop-adjustment-drop strong')
        ?.textContent.trim(),
      'Thorn Snare',
      'event override should render the event name'
    );
    assert.equal(
      eventAdjustmentRow.querySelector('[data-drop-rate-adjustment-base]')?.textContent.trim(),
      'Base 10%',
      'event base rate should be its own one-row item'
    );
    assert.equal(
      eventAdjustmentRow.querySelector('[data-drop-rate-adjustment-effective]')?.textContent.trim(),
      'Effective 10%',
      'event effective rate should be its own one-row item'
    );
    const eventAdjustmentInput = eventAdjustmentRow.querySelector(
      '[data-drop-rate-adjustment-input]'
    );
    assert.ok(eventAdjustmentInput, 'event override should render the custom percent input');
    assert.equal(
      eventAdjustmentInput.getAttribute('type'),
      'text',
      'event override input should use the text percentage input formatting'
    );
    assert.equal(
      eventAdjustmentRow.querySelector('input[type="number"]'),
      null,
      'event override should no longer use the plain number input'
    );
    assert.ok(
      eventAdjustmentRow.querySelector('.manager-environment-drop-adjustment-clear'),
      'event override should render the icon-only clear button'
    );
    eventAdjustmentInput.value = '-5';
    eventAdjustmentInput.dispatchEvent(new Event('input', { bubbles: true }));
    assert.deepEqual(
      updateCalls.at(-1),
      { eventDropRateAdjustments: { 'event-thorns': -5 } },
      'event percent input should update the stored event adjustment'
    );
    eventOverrides.querySelector('[data-event-drop-rate-adjustments-toggle]').click();
    assert.deepEqual(
      updateCalls.at(-1),
      { eventDropRateAdjustmentsEnabled: { 'event-thorns': false } },
      'turning the event toggle off should preserve stored values and only disable application'
    );
  });

  it('routes validation issue actions to the matching composition tab and selected record', async () => {
    target = document.createElement('div');
    document.body.appendChild(target);
    mounted = mount(EnvironmentEditViewComponent, {
      target,
      props: {
        environmentDraft: {
          id: 'env-forest',
          craftingSystemId: 'alchemy',
          name: 'Moonlit Forest',
          description: 'Old trees and moonlit herbs.',
          enabled: true,
          selectionMode: 'targeted',
          compositionMode: 'automatic',
          biomes: ['forest'],
          dangerLevel: 'dangerous',
          sceneUuid: 'Scene.forest',
        },
        composition: {
          compositionMode: 'automatic',
          counts: { availableTasks: 1, unavailableEvents: 1, availableEvents: 0 },
          tasks: [
            {
              id: 'task-moon-herbs',
              kind: 'task',
              record: { name: 'Gather Moon Herbs', description: '', img: 'icons/svg/item-bag.svg' },
              compositionState: 'includedByMatch',
              runtimeState: 'available',
              evidence: {},
            },
          ],
          events: [
            {
              id: 'event-thorns',
              kind: 'event',
              record: {
                name: 'Thorn Snare',
                description: 'Tangled thorns.',
                img: 'icons/svg/hazard.svg',
                dropRate: 10,
              },
              compositionState: 'includedButUnavailable',
              runtimeState: 'unavailable',
              evidence: {},
            },
          ],
        },
      },
    });
    flushSync();

    target.querySelector('[data-environment-tab-button="validation"]').click();
    await tick();
    flushSync();

    Array.from(target.querySelectorAll('.manager-environment-issue-action'))
      .find((button) => button.textContent.includes('View event'))
      .click();
    await tick();
    flushSync();

    assert.equal(
      target.querySelector('[data-environment-tab-button="events"]').getAttribute('aria-selected'),
      'true'
    );
    assert.ok(
      target
        .querySelector('[data-environment-tab="events"] [data-record-id="event-thorns"]')
        .classList.contains('is-selected')
    );
    assert.ok(
      target.querySelector('[data-record-inspector="event"]').textContent.includes('Thorn Snare')
    );

    target.querySelector('[data-environment-tab-button="validation"]').click();
    await tick();
    flushSync();

    Array.from(target.querySelectorAll('.manager-environment-issue-action'))
      .find((button) => button.textContent.includes('View task'))
      .click();
    await tick();
    flushSync();

    assert.equal(
      target.querySelector('[data-environment-tab-button="tasks"]').getAttribute('aria-selected'),
      'true'
    );
    assert.ok(
      target
        .querySelector('[data-environment-tab="tasks"] [data-record-id="task-moon-herbs"]')
        .classList.contains('is-selected')
    );
    assert.ok(
      target
        .querySelector('[data-record-inspector="task"]')
        .textContent.includes('Gather Moon Herbs')
    );
  });

  it('counts editor tab badges from composition membership and splits validation counts', async () => {
    target = document.createElement('div');
    document.body.appendChild(target);
    mounted = mount(EnvironmentEditViewComponent, {
      target,
      props: {
        environmentDraft: {
          id: 'env-forest',
          craftingSystemId: 'alchemy',
          name: 'Moonlit Forest',
          description: 'Old trees and moonlit herbs.',
          enabled: true,
          selectionMode: 'targeted',
          compositionMode: 'automatic',
          biomes: ['forest'],
          dangerLevel: 'dangerous',
          sceneUuid: '',
        },
        composition: {
          compositionMode: 'automatic',
          counts: { availableTasks: 0, availableEvents: 0, unavailableEvents: 1 },
          tasks: [
            {
              id: 'task-rain-herbs',
              kind: 'task',
              record: {
                name: 'Gather Rain Herbs',
                description: 'Gather herbs that only bloom in rain.',
                img: 'icons/svg/item-bag.svg',
              },
              compositionState: 'includedByMatch',
              runtimeState: 'unavailable',
              evidence: {},
            },
            {
              id: 'task-excluded',
              kind: 'task',
              record: {
                name: 'Excluded Task',
                description: 'Locally excluded.',
                img: 'icons/svg/item-bag.svg',
              },
              compositionState: 'excluded',
              runtimeState: 'unavailable',
              evidence: {},
            },
          ],
          events: [
            {
              id: 'event-force',
              kind: 'event',
              record: {
                name: 'Forced Event',
                description: 'Added despite matching state.',
                img: 'icons/svg/hazard.svg',
                dropRate: 10,
              },
              compositionState: 'forceIncluded',
              runtimeState: 'available',
              evidence: {},
            },
            {
              id: 'event-stale',
              kind: 'event',
              record: {
                name: 'Stale Event',
                description: 'No longer matches.',
                img: 'icons/svg/hazard.svg',
                dropRate: 10,
              },
              compositionState: 'includedButUnavailable',
              runtimeState: 'unavailable',
              evidence: {},
            },
            {
              id: 'event-disabled',
              kind: 'event',
              record: {
                name: 'Disabled Event',
                description: 'Disabled globally.',
                img: 'icons/svg/hazard.svg',
                dropRate: 10,
              },
              compositionState: 'libraryDisabled',
              runtimeState: 'unavailable',
              evidence: {},
            },
          ],
        },
      },
    });
    flushSync();

    const taskBadges = Array.from(
      target.querySelectorAll(
        '[data-environment-tab-button="tasks"] .manager-environment-tab-badge'
      )
    );
    const eventBadges = Array.from(
      target.querySelectorAll(
        '[data-environment-tab-button="events"] .manager-environment-tab-badge'
      )
    );
    const validationBadges = Array.from(
      target.querySelectorAll(
        '[data-environment-tab-button="validation"] .manager-environment-tab-badge'
      )
    );

    assert.deepEqual(
      taskBadges.map((node) => node.textContent.trim()),
      ['1'],
      'runtime-unavailable included task should count, excluded task should not'
    );
    assert.deepEqual(
      eventBadges.map((node) => node.textContent.trim()),
      ['2'],
      'force-included and stale included events should count, library-disabled event should not'
    );
    assert.deepEqual(
      validationBadges.map((node) => node.textContent.trim()),
      ['3', '2'],
      'validation badges should show counts only'
    );
    assert.equal(
      target
        .querySelector('[data-environment-tab-button="validation"]')
        .textContent.includes('errors'),
      false,
      'validation badge should not spell out error status'
    );
    assert.equal(
      target
        .querySelector('[data-environment-tab-button="validation"]')
        .textContent.includes('warnings'),
      false,
      'validation badge should not spell out warning status'
    );
    assert.equal(
      validationBadges[0].classList.contains('is-danger'),
      true,
      'error validation badge should use danger tone'
    );
    assert.equal(
      validationBadges[1].classList.contains('is-warning'),
      true,
      'warning validation badge should use warning tone'
    );
  });

  it('uses configured danger choices while preserving stale current danger values', async () => {
    target = document.createElement('div');
    document.body.appendChild(target);
    mounted = mount(EnvironmentEditViewComponent, {
      target,
      props: {
        environmentDraft: {
          id: 'env-forest',
          craftingSystemId: 'alchemy',
          name: 'Moonlit Forest',
          description: 'Old trees and moonlit herbs.',
          enabled: true,
          selectionMode: 'targeted',
          compositionMode: 'automatic',
          biomes: ['forest'],
          dangerLevel: 'extreme',
        },
        composition: { compositionMode: 'automatic', counts: {}, tasks: [], events: [] },
        dangerOptions: [
          { id: 'safe', label: 'Camp safe' },
          { id: 'hazardous', label: 'Rough going' },
        ],
      },
    });
    flushSync();

    const dangerSelect = target.querySelector('[data-environment-field="dangerLevel"]');
    assert.equal(dangerSelect.value, 'extreme');
    assert.deepEqual(
      Array.from(dangerSelect.options).map((option) => option.value),
      ['extreme', 'safe', 'hazardous']
    );
    assert.deepEqual(
      Array.from(dangerSelect.options).map((option) => option.textContent.trim()),
      ['Extreme', 'Camp safe', 'Rough going']
    );
  });

  it('scores inspector danger evidence against the six-level canonical scale', async () => {
    target = document.createElement('div');
    document.body.appendChild(target);
    mounted = mount(EnvironmentEditViewComponent, {
      target,
      props: {
        environmentDraft: {
          id: 'env-forest',
          craftingSystemId: 'alchemy',
          name: 'Moonlit Forest',
          description: 'Old trees and moonlit herbs.',
          enabled: true,
          selectionMode: 'targeted',
          compositionMode: 'automatic',
          biomes: ['forest'],
          dangerLevel: 'dangerous',
        },
        composition: {
          compositionMode: 'automatic',
          counts: { availableTasks: 1 },
          tasks: [
            {
              id: 'task-danger',
              kind: 'task',
              record: {
                name: 'Read the Trail',
                description: 'Judge the safest route.',
                img: 'icons/svg/item-bag.svg',
              },
              compositionState: 'includedByMatch',
              runtimeState: 'available',
              evidence: {
                biome: { state: 'any', recordValues: [], envValues: ['forest'], applicable: true },
                region: { state: 'any', recordValues: [], envValues: [], applicable: true },
                weather: { state: 'any', recordValues: [], envValues: [], applicable: true },
                time: { state: 'any', recordValues: [], envValues: [], applicable: true },
                danger: {
                  state: 'match',
                  recordValues: ['unsafe', 'extreme'],
                  envValues: ['dangerous'],
                  applicable: true,
                },
              },
            },
          ],
          events: [],
        },
      },
    });
    flushSync();

    target.querySelector('[data-environment-tab-button="tasks"]').click();
    await tick();
    flushSync();

    const dangerPills = Array.from(
      target.querySelectorAll('[data-evidence-field="danger"] [data-evidence-value-state]')
    );
    assert.deepEqual(
      dangerPills.map((pill) => pill.textContent.trim()),
      ['Unsafe', 'Extreme']
    );
    assert.deepEqual(
      dangerPills.map((pill) => pill.dataset.evidenceValueState),
      ['match', 'mismatch']
    );
    assert.equal(
      dangerPills[0].classList.contains('is-positive'),
      true,
      'unsafe should rank below dangerous'
    );
    assert.equal(
      dangerPills[1].classList.contains('is-danger'),
      true,
      'extreme should rank above dangerous'
    );
  });

  it('clears hidden component facet filters when the selected system changes', async () => {
    const store = createStore();
    target = document.createElement('div');
    document.body.appendChild(target);
    mounted = mount(Component, {
      target,
      props: {
        store,
        services: {
          openCurrentAdmin: () => {},
          onDropItem: () => {},
        },
      },
    });
    flushSync();

    navButton('Components').click();
    await tick();
    flushSync();

    const tagSearch = target.querySelector('[aria-label="Search component tags"]');
    tagSearch.value = 'ore';
    tagSearch.dispatchEvent(new Event('input', { bubbles: true }));
    await tick();
    flushSync();
    Array.from(target.querySelectorAll('.manager-tag-suggestion'))
      .find((button) => button.textContent.includes('ore'))
      .click();
    await tick();
    flushSync();
    assert.equal(target.querySelectorAll('.manager-component-row').length, 1);

    store.selectSystem('smithing');
    await tick();
    flushSync();

    assert.equal(target.querySelector('[aria-label="Filter components by tag"]'), null);
    assert.equal(target.querySelector('[aria-label="Search component tags"]'), null);
    assert.equal(target.querySelectorAll('.manager-component-row').length, 1);
    assert.ok(target.textContent.includes('Coal'));
    assert.equal(target.textContent.includes('No components match these filters'), false);
  });

  it('supports search, row selection, in-place system edit, and row actions', async () => {
    const calls = [];
    let onEditSystemCalled = false;
    target = document.createElement('div');
    document.body.appendChild(target);
    mounted = mount(Component, {
      target,
      props: {
        store: createStore(calls),
        services: {
          onEditSystem: () => {
            onEditSystemCalled = true;
          },
        },
      },
    });
    flushSync();

    const search = target.querySelector('input[type="search"]');
    search.value = 'smith';
    search.dispatchEvent(new Event('input', { bubbles: true }));
    await tick();
    flushSync();
    assert.equal(target.querySelectorAll('.manager-system-row').length, 1);
    assert.ok(target.textContent.includes('Smithing'));

    search.value = '';
    search.dispatchEvent(new Event('input', { bubbles: true }));
    await tick();
    flushSync();

    target.querySelector('[data-system-id="smithing"] .manager-labeled-cell').click();
    await tick();
    flushSync();
    target
      .querySelector('[data-system-id="smithing"]')
      .dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    await tick();
    flushSync();
    target.querySelector('[aria-label="Export Smithing"]').click();
    target.querySelector('[aria-label="Edit Smithing"]').click();
    await Promise.resolve();
    await Promise.resolve();
    await tick();
    flushSync();

    assert.equal(onEditSystemCalled, false);
    assert.equal(target.querySelector('.fabricate-manager').dataset.managerView, 'system-edit');
    assert.ok(target.textContent.includes('System Overview'));
    // The Settings tab is the default, so its form renders immediately.
    assert.equal(target.querySelector('[data-system-tab="settings"]')?.getAttribute('aria-selected'), 'true');
    assert.ok(target.querySelector('.manager-system-edit-form'));
    assert.deepEqual(calls.slice(-4), [
      ['selectSystem', 'smithing'],
      ['selectSystem', 'smithing'],
      ['exportSystem', 'smithing'],
      ['selectSystem', 'smithing'],
    ]);
  });

  it('writes system edit controls through existing admin-store callbacks', async () => {
    const calls = [];
    target = document.createElement('div');
    document.body.appendChild(target);
    mounted = mount(Component, {
      target,
      props: {
        store: createStore(calls),
        services: { openCurrentAdmin: () => {} },
      },
    });
    flushSync();

    target.querySelector('[aria-label="Edit Alchemy"]').click();
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
    await tick();
    flushSync();

    const name = target.querySelector('#manager-system-name');
    const description = target.querySelector('#manager-system-description');
    name.value = 'Greater Alchemy';
    name.dispatchEvent(new Event('input', { bubbles: true }));
    description.value = 'Updated potion work';
    description.dispatchEvent(new Event('input', { bubbles: true }));
    target
      .querySelector('.manager-system-edit-form')
      .dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));

    // Resolution mode moved to the gated Crafting > Settings page (issue 511), so
    // System Overview no longer carries the resolution-mode card. Identity save and
    // the optional-feature toggles still live here.
    assert.equal(
      target.querySelector('#manager-system-resolution-mode'),
      null,
      'the resolution-mode card is no longer on System Overview'
    );

    target.querySelector('[data-feature-key="gathering"] .manager-status-toggle').click();

    assert.ok(
      calls.some(
        (call) =>
          call[0] === 'saveSystemDetails' &&
          call[1] === 'Greater Alchemy' &&
          call[2] === 'Updated potion work'
      )
    );
    assert.ok(
      calls.some(
        (call) => call[0] === 'toggleFeature' && call[1] === 'gathering' && call[2] === false
      )
    );
  });

  // A report carrying a system blocker plus a deep-linkable recipe issue, so the
  // Validation tab's grouped list and deep-link wiring are both exercised.
  const overviewReport = {
    issues: [
      {
        kind: 'system',
        entityId: null,
        entityName: 'Alchemy',
        severity: 'critical',
        blocks: 'system',
        code: 'progressiveNoCheck',
        message: 'Progressive mode requires a configured progressive crafting check.',
        nav: { view: 'system-overview' },
      },
      {
        kind: 'recipe',
        entityId: 'r1',
        entityName: 'Healing Draught',
        severity: 'warning',
        blocks: 'enable',
        code: 'noResultGroup',
        message: 'A step is missing a result group.',
        nav: { view: 'recipe-edit' },
      },
    ],
    counts: { critical: 1, warning: 1, info: 0, blockers: 1 },
    blocksSystem: true,
  };

  it('opens the System Overview page on the Settings tab by default', async () => {
    await mountSystemOverviewPage(overviewReport);

    assert.equal(target.querySelector('.fabricate-manager').dataset.managerView, 'system-edit');
    const settingsTab = target.querySelector('[data-system-tab="settings"]');
    const validationTab = target.querySelector('[data-system-tab="validation"]');
    assert.ok(settingsTab, 'Settings tab renders');
    assert.ok(validationTab, 'Validation tab renders');
    assert.equal(settingsTab.getAttribute('aria-selected'), 'true', 'Settings is the default tab');
    assert.equal(validationTab.getAttribute('aria-selected'), 'false');
    assert.ok(target.querySelector('.manager-system-edit-form'), 'the settings form renders');
    assert.ok(
      target.querySelector('[data-system-edit-blocker]'),
      'the system-blocker banner stays on the Settings tab'
    );
    assert.equal(
      target.querySelector('[data-system-overview]'),
      null,
      'the validation list is not rendered while Settings is active'
    );
    // The renamed nav item carries the open-issue badge (critical + warning = 2).
    const navBadge = navButton('System Overview').querySelector('.manager-nav-count');
    assert.equal(navBadge?.textContent.trim(), '2');
    // The Validation tab carries a danger + warning badge of open issues.
    assert.equal(
      validationTab.querySelector('.manager-environment-tab-badge.is-danger')?.textContent.trim(),
      '1'
    );
    assert.equal(
      validationTab.querySelector('.manager-environment-tab-badge.is-warning')?.textContent.trim(),
      '1'
    );
  });

  it('renders the kind-grouped validation list on the Validation tab and deep-links an issue', async () => {
    const { calls } = await mountSystemOverviewPage(overviewReport);

    target.querySelector('[data-system-tab="validation"]').click();
    await tick();
    flushSync();

    assert.equal(
      target.querySelector('[data-system-tab="validation"]').getAttribute('aria-selected'),
      'true'
    );
    assert.ok(
      target.querySelector('[data-system-overview]'),
      'the validation list renders in the Validation panel'
    );
    assert.ok(
      target.querySelector('[data-system-overview-group="system"]'),
      'the system-blocker group renders'
    );
    assert.ok(
      target.querySelector('[data-system-overview-blocker]'),
      'the validation list keeps its blocker note'
    );
    // The summary badges + Review copy stay on the validation tab.
    assert.ok(
      target.querySelector('[data-system-overview-counts]'),
      'the critical/warning/notes summary badges render'
    );

    const recipeLink = target.querySelector(
      '[data-overview-issue="noResultGroup"] [data-overview-link="recipe"]'
    );
    assert.ok(recipeLink, 'the recipe issue exposes a deep-link button');
    recipeLink.click();
    await Promise.resolve();
    await Promise.resolve();
    await tick();
    flushSync();
    assert.equal(
      target.querySelector('.fabricate-manager').dataset.managerView,
      'recipe-edit',
      'the deep link routes to the recipe editor'
    );
  });

  it("switches to the Validation tab when the Settings tab's blocker link is clicked", async () => {
    await mountSystemOverviewPage(overviewReport);

    const blockerLink = target.querySelector('[data-system-edit-blocker-link]');
    assert.ok(blockerLink, 'the blocker banner exposes an open-overview link');
    blockerLink.click();
    await tick();
    flushSync();

    assert.equal(
      target.querySelector('[data-system-tab="validation"]').getAttribute('aria-selected'),
      'true',
      'the blocker link opens the Validation tab in place'
    );
    assert.ok(target.querySelector('[data-system-overview]'), 'the validation list is shown');
  });

  it('renders the salvage resolution-mode card (simple/progressive/routed) and routes its change', async () => {
    // The resolution cards live on the gated Crafting > Settings page now (issue 511).
    const calls = [];
    mountCraftingSettingsView({
      selectedSystem: {
        id: 'sys1',
        name: 'Alchemy',
        resolutionMode: 'alchemy',
        features: { salvage: true },
        recipeVisibility: { listMode: 'global' },
        showRecipeVisibilityKnowledgeOptions: false,
      },
      onSetSalvageResolutionMode: (mode) => {
        calls.push(['setSalvageResolutionMode', mode]);
        return true;
      },
    });

    const salvageCard = target.querySelector('[data-crafting-salvage-resolution-mode]');
    const rows = assertResolutionCard(salvageCard, {
      optionAttr: 'data-crafting-salvage-resolution-mode-option',
      groupName: 'manager-crafting-salvage-resolution-mode',
      expectedValues: ['simple', 'progressive', 'routed'],
    });
    assert.equal(rows.length, 3, 'salvage card offers exactly three options');

    // Simple is the default, so it is the checked radio for a simple/absent system.
    const checked = salvageCard.querySelector(
      'input[type="radio"][name="manager-crafting-salvage-resolution-mode"]:checked'
    );
    assert.ok(checked, 'a salvage radio is checked for a simple/absent system');
    assert.equal(
      checked.closest('[data-crafting-salvage-resolution-mode-option]').dataset
        .craftingSalvageResolutionModeOption,
      'simple',
      'simple is the default selected salvage mode'
    );

    const routedRadio = salvageCard.querySelector(
      '[data-crafting-salvage-resolution-mode-option="routed"] input[type="radio"]'
    );
    routedRadio.checked = true;
    routedRadio.dispatchEvent(new Event('change', { bubbles: true }));
    await Promise.resolve();
    await tick();
    flushSync();

    assert.ok(
      calls.some((call) => call[0] === 'setSalvageResolutionMode' && call[1] === 'routed'),
      'selecting the routed radio persists the canonical routed value'
    );
  });

  it('renders the Salvage feature toggle and routes its change', async () => {
    const { calls } = await mountCurrencyEditor();
    const tile = target.querySelector('[data-feature-key="salvage"]');
    assert.ok(tile, 'the salvage feature toggle renders in System Settings');
    // The default fixture has salvage on, so toggling sends false.
    tile.querySelector('.manager-status-toggle').click();
    assert.ok(
      calls.some(
        (call) => call[0] === 'toggleFeature' && call[1] === 'salvage' && call[2] === false
      ),
      'toggling the salvage tile routes toggleFeature(salvage, false)'
    );
  });

  it('hides the salvage resolution-mode card when the salvage feature is off (toggle stays available)', async () => {
    await mountCurrencyEditor({
      selectedFeatures: {
        essences: true,
        itemTags: true,
        recipeCategories: true,
        gathering: true,
        salvage: false,
      },
    });
    assert.equal(
      target.querySelector('[data-system-salvage-resolution-mode]'),
      null,
      'the salvage resolution card is hidden when salvage is off'
    );
    const tile = target.querySelector('[data-feature-key="salvage"]');
    assert.ok(tile, 'the salvage toggle still renders so the GM can turn salvage back on');
    assert.equal(
      tile.querySelector('.manager-status-toggle').getAttribute('aria-pressed'),
      'false',
      'the salvage toggle reads as off'
    );
  });

  it('gives every feature tile an icon chip whose state class tracks the feature', async () => {
    await mountCurrencyEditor({
      selectedFeatures: {
        essences: true,
        itemTags: true,
        recipeCategories: true,
        gathering: true,
        salvage: false,
      },
    });

    for (const tile of target.querySelectorAll('[data-feature-key]')) {
      const chip = tile.querySelector('.manager-feature-tile-icon');
      const key = tile.getAttribute('data-feature-key');
      assert.ok(chip, `the ${key} tile renders an icon chip`);
      assert.ok(
        chip.querySelector('i')?.className.trim(),
        `the ${key} chip renders a non-empty icon glyph`
      );
      // The chip is decorative: the toggle already carries the state accessibly.
      assert.equal(chip.getAttribute('aria-hidden'), 'true', `the ${key} chip is hidden from AT`);
    }

    assert.ok(
      target.querySelector('[data-feature-key="essences"] .manager-feature-tile-icon').classList.contains('is-on'),
      'an enabled feature reads as on in the chip'
    );
    assert.ok(
      target.querySelector('[data-feature-key="salvage"] .manager-feature-tile-icon').classList.contains('is-off'),
      'a disabled feature reads as off in the chip'
    );
  });

  it('flips the feature chip state class when the feature toggles', async () => {
    await mountCurrencyEditor({
      selectedFeatures: {
        essences: true,
        itemTags: true,
        recipeCategories: true,
        gathering: true,
        salvage: false,
      },
    });
    const chipClasses = () =>
      target.querySelector('[data-feature-key="salvage"] .manager-feature-tile-icon').classList;
    assert.ok(chipClasses().contains('is-off'), 'the salvage chip starts off');

    await mountCurrencyEditor({
      selectedFeatures: {
        essences: true,
        itemTags: true,
        recipeCategories: true,
        gathering: true,
        salvage: true,
      },
    });
    assert.ok(chipClasses().contains('is-on'), 'the salvage chip reads on once the feature is enabled');
  });

  it('renders the currency spend-strategy control with three options and routes its change', async () => {
    const { calls } = await mountCurrencyEditor({
      selectedCurrency: {
        enabled: true,
        spendStrategy: 'actorProperty',
        providerId: '',
        macros: { canAfford: '', increment: '', decrement: '' },
        units: [],
      },
    });

    const strategy = target.querySelector('[data-system-currency-strategy-select]');
    assert.ok(strategy, 'spend-strategy select should render');
    const optionValues = [...strategy.querySelectorAll('option')].map((option) => option.value);
    assert.deepEqual(
      optionValues,
      ['actorProperty', 'actorInventory', 'macro'],
      'three peer spend strategies should be offered'
    );
    // The single shared strategy hint reflects the selected strategy.
    assert.ok(
      target.querySelector('[data-system-currency-strategy-hint]'),
      'a strategy hint should render'
    );
    strategy.value = 'macro';
    strategy.dispatchEvent(new Event('change', { bubbles: true }));
    await tick();
    flushSync();
    assert.ok(calls.some((call) => call[0] === 'setCurrencySpendStrategy' && call[1] === 'macro'));
  });

  it('mounts the macro strategy with three macro drop zones and no inventory-mode select', async () => {
    await mountCurrencyEditor({
      selectedCurrency: {
        enabled: true,
        spendStrategy: 'macro',
        providerId: '',
        macros: { canAfford: '', increment: '', decrement: '' },
        units: [],
      },
    });

    const macroRow = target.querySelector('[data-system-currency-macros]');
    assert.ok(macroRow, 'macro zones container should render');
    // The three drop zones share one single-row container.
    assert.ok(
      macroRow.classList.contains('manager-currency-macro-row'),
      'the three macro drop zones should share the single-row container'
    );
    const dropzones = macroRow.querySelectorAll('[data-system-currency-macro-dropzone]');
    assert.equal(dropzones.length, 3, 'macro strategy should show three drop zones');
    assert.equal(
      target.querySelectorAll('[data-system-currency-macro-dropzone]').length,
      3,
      'all three drop zones live inside the single-row container'
    );
    // The removed nested inventory-mode select must not render.
    assert.equal(target.querySelector('[data-system-currency-inventory-mode-select]'), null);
  });

  it('gives each empty macro drop zone a field-specific accessible name', async () => {
    await mountCurrencyEditor({
      selectedCurrency: {
        enabled: true,
        spendStrategy: 'macro',
        providerId: '',
        macros: { canAfford: '', increment: '', decrement: '' },
        units: [],
      },
    });

    const dropzones = [...target.querySelectorAll('[data-system-currency-macro-dropzone]')];
    assert.equal(dropzones.length, 3, 'macro strategy should show three drop zones');
    const labels = dropzones.map((zone) => zone.getAttribute('aria-label'));
    // Every empty drop zone must expose a non-empty, distinct accessible name (not the shared hint).
    assert.ok(
      labels.every((label) => label && label.length > 0),
      'each drop zone should have an aria-label'
    );
    assert.equal(new Set(labels).size, 3, 'the three drop-zone aria-labels should be distinct');
  });

  it('shows a no-provider callout for actorInventory on a no-provider system and keeps units editable', async () => {
    // dnd5e has no registered provider; selecting actorInventory must surface the steer-to-macro
    // callout and keep the GM's units editable rather than wiping them.
    await mountCurrencyEditor({
      foundrySystemId: 'dnd5e',
      selectedCurrency: {
        enabled: true,
        spendStrategy: 'actorInventory',
        providerId: '',
        macros: { canAfford: '', increment: '', decrement: '' },
        units: [
          {
            id: 'gp',
            label: 'Gold',
            abbreviation: 'gp',
            icon: 'fa-solid fa-coins',
            denomination: 'gp',
            contains: [],
          },
        ],
      },
    });

    // No provider select is offered; the no-provider callout renders instead.
    assert.equal(
      target.querySelector('[data-system-currency-provider-select]'),
      null,
      'no provider select should render for a no-provider system'
    );
    assert.ok(
      target.querySelector('[data-system-currency-no-provider]'),
      'the no-provider callout should appear, steering the GM to the macro strategy'
    );
    // The removed inventory-mode select must not render.
    assert.equal(
      target.querySelector('[data-system-currency-inventory-mode-select]'),
      null,
      'the nested inventory-mode select should be gone'
    );
    // Units stay GM-editable (not read-only) on a no-provider system.
    assert.ok(
      target.querySelector(
        '.manager-currency-unit-card .manager-character-modifier-card-header-actions'
      ),
      'Add/Seed header actions should remain available for a no-provider system'
    );
  });

  it('removes the sub-unit section under the macro strategy and shows the conversion hint', async () => {
    await mountCurrencyEditor({
      selectedCurrency: {
        enabled: true,
        spendStrategy: 'macro',
        providerId: '',
        macros: { canAfford: '', increment: '', decrement: '' },
        units: [
          {
            id: 'gp',
            label: 'Gold',
            abbreviation: 'gp',
            icon: 'fa-solid fa-coins',
            contains: [{ unitId: 'sp', amount: 10 }],
          },
          {
            id: 'sp',
            label: 'Silver',
            abbreviation: 'sp',
            icon: 'fa-solid fa-coins',
            contains: [],
          },
        ],
      },
    });

    // Expand the gp unit's editor.
    const card = target.querySelector('.manager-currency-unit-card');
    card
      .querySelector('[data-system-currency-unit="gp"] [aria-label="Edit currency unit"]')
      .click();
    await tick();
    flushSync();

    // No sub-unit section renders (no heading, builder, chips, or warnings) and the macro-conversion
    // hint is shown instead.
    assert.equal(
      card.querySelector('.manager-currency-subunit-section'),
      null,
      'no sub-unit section in macro mode'
    );
    assert.equal(
      card.querySelector('.manager-currency-subunit-builder'),
      null,
      'no add-sub-unit builder in macro mode'
    );
    assert.equal(
      card.querySelectorAll('[data-system-currency-subunit]').length,
      0,
      'no sub-unit chips in macro mode'
    );
    assert.ok(
      card.querySelector('[data-system-currency-unit-macro-note]'),
      'macro-conversion hint should render'
    );
  });

  // Pins the SystemEditView mirror of canAddCurrencySubUnit (currencyCanAddSubUnit /
  // currencyReachableUnitIds) that drives the add-sub-unit <select> options. The shared helper in
  // src/systems/currencyProfile.js is unit-tested, but this UI mirror has no behavioral test, so it
  // could silently drift. The dropdown only renders for the currently expanded unit, so each case
  // mounts the editor in actorProperty mode (sub-unit section editable), expands the target unit via
  // its edit pen, and asserts the actual rendered <option> values (each value is the unit id).
  async function offeredSubUnitOptionIds(units, expandUnitId) {
    if (mounted) unmount(mounted);
    if (target?.parentNode) target.remove();
    await mountCurrencyEditor({
      selectedCurrency: {
        enabled: true,
        spendStrategy: 'actorProperty',
        providerId: '',
        macros: { canAfford: '', increment: '', decrement: '' },
        units,
      },
    });
    const card = target.querySelector('.manager-currency-unit-card');
    card
      .querySelector(
        `[data-system-currency-unit="${expandUnitId}"] [aria-label="Edit currency unit"]`
      )
      .click();
    await tick();
    flushSync();
    const builder = card.querySelector('.manager-currency-subunit-builder');
    if (!builder) return [];
    return [...builder.querySelectorAll('select option')].map((option) => option.value);
  }

  it('drives the add-sub-unit dropdown from disjoint reachable sets for chain, diamond, and cross-parent cases', async () => {
    // Chain P->A->B->C: editing P must exclude C (deeper descendant), A (already contained), and B
    // (deeper descendant) — none can be offered as a fresh sub-unit of P.
    const chainUnits = [
      {
        id: 'P',
        label: 'Platinum',
        abbreviation: 'P',
        actorPath: 'system.currency.p',
        contains: [{ unitId: 'A', amount: 10 }],
      },
      {
        id: 'A',
        label: 'Gold',
        abbreviation: 'A',
        actorPath: 'system.currency.a',
        contains: [{ unitId: 'B', amount: 10 }],
      },
      {
        id: 'B',
        label: 'Silver',
        abbreviation: 'B',
        actorPath: 'system.currency.b',
        contains: [{ unitId: 'C', amount: 10 }],
      },
      { id: 'C', label: 'Copper', abbreviation: 'C', actorPath: 'system.currency.c', contains: [] },
    ];
    const chainOffered = await offeredSubUnitOptionIds(chainUnits, 'P');
    assert.ok(
      !chainOffered.includes('C'),
      'chain: C (deeper descendant of P) must not be offered when editing P'
    );
    assert.ok(
      !chainOffered.includes('A'),
      'chain: A (already contained by P) must not be offered when editing P'
    );
    assert.ok(
      !chainOffered.includes('B'),
      'chain: B (deeper descendant of P) must not be offered when editing P'
    );

    // Diamond: cp; sp->cp; gp->sp; ep->sp. Editing gp (already reaches gp->sp->cp) must exclude ep
    // (adding ep would create a second gp->sp path) and cp (already reachable).
    const diamondUnits = [
      {
        id: 'cp',
        label: 'Copper',
        abbreviation: 'cp',
        actorPath: 'system.currency.cp',
        contains: [],
      },
      {
        id: 'sp',
        label: 'Silver',
        abbreviation: 'sp',
        actorPath: 'system.currency.sp',
        contains: [{ unitId: 'cp', amount: 10 }],
      },
      {
        id: 'gp',
        label: 'Gold',
        abbreviation: 'gp',
        actorPath: 'system.currency.gp',
        contains: [{ unitId: 'sp', amount: 10 }],
      },
      {
        id: 'ep',
        label: 'Electrum',
        abbreviation: 'ep',
        actorPath: 'system.currency.ep',
        contains: [{ unitId: 'sp', amount: 5 }],
      },
    ];
    const diamondOffered = await offeredSubUnitOptionIds(diamondUnits, 'gp');
    assert.ok(
      !diamondOffered.includes('ep'),
      'diamond: ep must not be offered when editing gp (would create a second gp->sp path)'
    );
    assert.ok(
      !diamondOffered.includes('cp'),
      'diamond: cp must not be offered when editing gp (already reachable gp->sp->cp)'
    );

    // Cross-parent (allowed): a fresh unrelated unit pp (no contains) SHOULD be offered sp, since a
    // node legitimately shared by two DIFFERENT parents is fine — the rule must not over-restrict.
    const crossParentUnits = [
      ...diamondUnits,
      {
        id: 'pp',
        label: 'Platinum',
        abbreviation: 'pp',
        actorPath: 'system.currency.pp',
        contains: [],
      },
    ];
    const crossParentOffered = await offeredSubUnitOptionIds(crossParentUnits, 'pp');
    assert.ok(
      crossParentOffered.includes('sp'),
      'cross-parent: sp SHOULD be offered when editing the unrelated pp (legitimate shared child)'
    );
  });

  it('renders actorInventory provider units as a read-only provider-managed list', async () => {
    await mountCurrencyEditor({
      foundrySystemId: 'pf2e',
      selectedCurrency: {
        enabled: true,
        spendStrategy: 'actorInventory',
        providerId: 'pf2e-inventory',
        macros: { canAfford: '', increment: '', decrement: '' },
        units: [
          {
            id: 'gp',
            label: 'Gold',
            abbreviation: 'gp',
            icon: 'fa-solid fa-coins',
            denomination: 'gp',
            contains: [{ unitId: 'sp', amount: 10 }],
          },
          {
            id: 'sp',
            label: 'Silver',
            abbreviation: 'sp',
            icon: 'fa-solid fa-coins',
            denomination: 'sp',
            contains: [],
          },
        ],
      },
    });

    // The provider-managed callout renders and the Add/Seed header actions are hidden.
    assert.ok(
      target.querySelector('[data-system-currency-provider-managed]'),
      'provider-managed callout should render'
    );
    assert.equal(
      target.querySelector(
        '.manager-currency-unit-card .manager-character-modifier-card-header-actions'
      ),
      null,
      'Add and Seed header actions should be hidden in provider mode'
    );
    // Units render read-only: no pen/edit, delete, or remove controls, no editable amount inputs.
    const card = target.querySelector('.manager-currency-unit-card');
    assert.ok(card.querySelector('[data-system-currency-unit="gp"]'), 'gp unit should render');
    assert.equal(
      card.querySelectorAll('.manager-currency-provider-managed-summary .manager-icon-button')
        .length,
      0,
      'no edit/delete icon buttons in read-only summary'
    );
    assert.equal(
      card.querySelectorAll('.manager-availability-pill-amount').length,
      0,
      'no editable amount inputs in read-only mode'
    );
    assert.equal(
      card.querySelectorAll('.manager-availability-remove').length,
      0,
      'no remove-cross controls in read-only mode'
    );
    // Provider read-only units present label / abbreviation / denomination as static field/value
    // pairs and render NO sub-unit chips.
    assert.equal(
      card.querySelectorAll('[data-system-currency-subunit]').length,
      0,
      'no sub-unit chips in provider read-only mode'
    );
    const gpUnit = card.querySelector('[data-system-currency-unit="gp"]');
    assert.equal(
      gpUnit.querySelector('[data-system-currency-readonly-label]').textContent.trim(),
      'Gold'
    );
    assert.equal(
      gpUnit.querySelector('[data-system-currency-abbreviation]').textContent.trim(),
      'gp'
    );
    assert.equal(
      gpUnit.querySelector('[data-system-currency-denomination]').textContent.trim(),
      'gp'
    );
  });

  it('renders the currency feature toggle in Optional features and routes its change', async () => {
    const { calls } = await mountCurrencyEditor({
      selectedCurrency: {
        enabled: false,
        spendStrategy: 'actorProperty',
        providerId: '',
        macros: { canAfford: '', increment: '', decrement: '' },
        units: [],
      },
    });

    const tile = target.querySelector('[data-feature-key="currency"]');
    assert.ok(tile, 'currency toggle tile should render in Optional features');
    const toggle = tile.querySelector('[data-system-currency-toggle]');
    assert.ok(toggle, 'currency toggle button should render');
    assert.equal(toggle.getAttribute('aria-pressed'), 'false', 'toggle reflects disabled currency');
    assert.ok(tile.querySelector('small'), 'currency tile should include a hint');

    toggle.click();
    await tick();
    flushSync();
    assert.ok(
      calls.some(
        (call) => call[0] === 'toggleRequirement' && call[1] === 'currency' && call[2] === true
      ),
      'clicking the toggle should enable currency through toggleRequirement'
    );
  });

  it('hides the Currency Units card when currency is disabled and shows it when enabled', async () => {
    await mountCurrencyEditor({
      selectedCurrency: {
        enabled: false,
        spendStrategy: 'actorProperty',
        providerId: '',
        macros: { canAfford: '', increment: '', decrement: '' },
        units: [],
      },
    });
    assert.equal(
      target.querySelector('[data-system-currency-units]'),
      null,
      'Currency Units card should be hidden when currency is disabled'
    );
    // The toggle tile still renders even with the card hidden.
    assert.ok(
      target.querySelector('[data-feature-key="currency"]'),
      'currency toggle tile should still render'
    );

    // Tear down before re-mounting with currency enabled.
    if (mounted) unmount(mounted);
    if (target?.parentNode) target.remove();

    await mountCurrencyEditor({
      selectedCurrency: {
        enabled: true,
        spendStrategy: 'actorProperty',
        providerId: '',
        macros: { canAfford: '', increment: '', decrement: '' },
        units: [],
      },
    });
    assert.ok(
      target.querySelector('[data-system-currency-units]'),
      'Currency Units card should render when currency is enabled'
    );
  });

  it('rolls back system edit controls when existing store callbacks reject changes', async () => {
    const calls = [];
    target = document.createElement('div');
    document.body.appendChild(target);
    mounted = mount(Component, {
      target,
      props: {
        store: createStore(calls, { resolutionModeResult: false, toggleFeatureResult: false }),
        services: { openCurrentAdmin: () => {} },
      },
    });
    flushSync();

    target.querySelector('[aria-label="Edit Alchemy"]').click();
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
    await tick();
    flushSync();

    assert.equal(target.querySelector('[data-feature-key="complexRecipes"]'), null);
    assert.equal(target.querySelector('[data-feature-key="craftingChecks"]'), null);
    assert.equal(target.querySelector('[data-feature-key="outcomeRouting"]'), null);

    // Resolution-mode rollback moved to the Crafting Settings page (issue 511); the
    // optional-feature toggle rollback still lives on System Overview.
    const gathering = target.querySelector('[data-feature-key="gathering"] .manager-status-toggle');
    assert.equal(gathering.getAttribute('aria-pressed'), 'true');
    gathering.click();
    await Promise.resolve();
    await tick();
    flushSync();
    assert.equal(gathering.getAttribute('aria-pressed'), 'true');

    assert.ok(
      calls.some(
        (call) => call[0] === 'toggleFeature' && call[1] === 'gathering' && call[2] === false
      )
    );
  });

  it('CraftingSettingsView rolls back the resolution radio when the store rejects the change', async () => {
    // The resolution-mode confirm-then-migrate flow can be cancelled (store returns
    // false); the card must revert to the system's mode (issue 511).
    mountCraftingSettingsView({
      selectedSystem: {
        id: 'sys1',
        name: 'Alchemy',
        resolutionMode: 'alchemy',
        features: {},
        recipeVisibility: { listMode: 'global' },
        showRecipeVisibilityKnowledgeOptions: false,
      },
      onSetResolutionMode: async () => false,
    });

    const modeCard = target.querySelector('#manager-crafting-resolution-mode');
    const activeMode = () =>
      modeCard.querySelector('.manager-resolution-option.is-active')?.dataset
        .craftingResolutionModeOption;
    assert.equal(activeMode(), 'alchemy');

    const progressiveRadio = modeCard.querySelector(
      '[data-crafting-resolution-mode-option="progressive"] input[type="radio"]'
    );
    progressiveRadio.checked = true;
    progressiveRadio.dispatchEvent(new Event('change', { bubbles: true }));
    await Promise.resolve();
    await tick();
    flushSync();

    assert.equal(activeMode(), 'alchemy', 'a rejected change reverts to the system mode');
    assert.equal(
      modeCard.querySelector('input[type="radio"][name="manager-crafting-resolution-mode"]:checked')
        ?.value,
      'alchemy',
      'the rejected change re-checks the previously-selected radio'
    );
  });

  it('renders the Required Tools picker in the gathering task editor and adds/removes references', async () => {
    const calls = [];
    target = document.createElement('div');
    document.body.appendChild(target);
    mounted = mount(Component, {
      target,
      props: {
        store: createStore(calls, {
          gatheringLibraryTools: [
            {
              id: 'tool-pickaxe',
              label: 'Pickaxe',
              enabled: true,
              componentId: 'c1',
              requirement: null,
              breakage: { mode: 'limitedUses', maxUses: null },
              onBreak: { mode: 'destroy' },
            },
            {
              id: 'tool-lantern',
              label: 'Lantern',
              enabled: true,
              componentId: 'c2',
              requirement: null,
              breakage: { mode: 'limitedUses', maxUses: null },
              onBreak: { mode: 'destroy' },
            },
          ],
          taskInitialToolIds: ['tool-pickaxe'],
        }),
        services: { openCurrentAdmin: () => {} },
      },
    });
    flushSync();

    navButton('Gathering').click();
    await tick();
    flushSync();
    gatheringSubitem('Tasks').click();
    await tick();
    flushSync();
    target
      .querySelector('[data-gathering-task-id="task-herbs"] [aria-label="Edit Gather Moon Herbs"]')
      .click();
    await tick();
    flushSync();

    const section = target.querySelector('[data-gathering-task-required-tools]');
    assert.ok(section, 'required tools section should render in the task editor');

    const attached = section.querySelectorAll('[data-gathering-task-required-tool-pill]');
    assert.equal(attached.length, 1);
    assert.equal(
      attached[0].getAttribute('data-gathering-task-required-tool-pill'),
      'tool-pickaxe'
    );
    assert.ok(attached[0].textContent.includes('Pickaxe'));

    const resultCards = section.querySelectorAll('[data-gathering-task-required-tools-card]');
    assert.equal(resultCards.length, 1);
    assert.equal(
      resultCards[0].getAttribute('data-gathering-task-required-tools-card'),
      'tool-lantern'
    );

    resultCards[0].click();
    await tick();
    flushSync();

    const afterAddPills = target.querySelectorAll('[data-gathering-task-required-tool-pill]');
    assert.equal(afterAddPills.length, 2);
    const afterAddPillIds = Array.from(afterAddPills).map((node) =>
      node.getAttribute('data-gathering-task-required-tool-pill')
    );
    assert.deepEqual(afterAddPillIds.sort(), ['tool-lantern', 'tool-pickaxe']);
    assert.equal(
      target.querySelectorAll('[data-gathering-task-required-tools-card]').length,
      0,
      'attached tools should be removed from the result grid'
    );

    const lanternPill = Array.from(afterAddPills).find(
      (node) => node.getAttribute('data-gathering-task-required-tool-pill') === 'tool-pickaxe'
    );
    lanternPill.querySelector('.manager-availability-remove').click();
    await tick();
    flushSync();
    const afterRemovePills = target.querySelectorAll('[data-gathering-task-required-tool-pill]');
    assert.equal(afterRemovePills.length, 1);
    assert.equal(
      afterRemovePills[0].getAttribute('data-gathering-task-required-tool-pill'),
      'tool-lantern'
    );

    target.querySelector('.manager-header-actions .manager-button.is-primary').click();
    await tick();
    flushSync();
    assert.ok(
      calls.some(
        (call) =>
          call[0] === 'updateGatheringLibraryTask' &&
          call[1] === 'alchemy' &&
          call[2] === 'task-herbs' &&
          Array.isArray(call[3].toolIds) &&
          call[3].toolIds.length === 1 &&
          call[3].toolIds[0] === 'tool-lantern'
      ),
      `expected Save to persist toolIds: ['tool-lantern'], got ${JSON.stringify(calls.filter((c) => c[0] === 'updateGatheringLibraryTask'))}`
    );
  });

  it('renders a stale chip for task toolIds whose library entry is missing and lets the user clear it', async () => {
    const calls = [];
    target = document.createElement('div');
    document.body.appendChild(target);
    mounted = mount(Component, {
      target,
      props: {
        store: createStore(calls, {
          gatheringLibraryTools: [],
          taskInitialToolIds: ['tool-ghost'],
        }),
        services: { openCurrentAdmin: () => {} },
      },
    });
    flushSync();

    navButton('Gathering').click();
    await tick();
    flushSync();
    gatheringSubitem('Tasks').click();
    await tick();
    flushSync();
    target
      .querySelector('[data-gathering-task-id="task-herbs"] [aria-label="Edit Gather Moon Herbs"]')
      .click();
    await tick();
    flushSync();

    const section = target.querySelector('[data-gathering-task-required-tools]');
    const stalePill = section.querySelector(
      '[data-gathering-task-required-tool-pill="tool-ghost"]'
    );
    assert.ok(stalePill, 'stale tool reference should render as a pill');
    assert.ok(stalePill.classList.contains('is-stale'));
    assert.ok(stalePill.textContent.includes('Deleted tool'));

    assert.ok(
      section.querySelector('[data-gathering-task-required-tools-library-empty]'),
      'library-empty placeholder should render when no tools exist'
    );
    assert.equal(
      section.querySelector('[data-gathering-task-required-tools-search]'),
      null,
      'search input should hide when library is empty'
    );

    stalePill.querySelector('.manager-availability-remove').click();
    await tick();
    flushSync();

    const afterClearPills = target.querySelectorAll('[data-gathering-task-required-tool-pill]');
    assert.equal(
      afterClearPills.length,
      0,
      'removing the stale chip should clear the dangling reference'
    );
    assert.ok(
      target
        .querySelector('[data-gathering-task-required-tools]')
        .textContent.includes('No tools required')
    );

    target.querySelector('.manager-header-actions .manager-button.is-primary').click();
    await tick();
    flushSync();
    assert.ok(
      calls.some(
        (call) =>
          call[0] === 'updateGatheringLibraryTask' &&
          call[1] === 'alchemy' &&
          call[2] === 'task-herbs' &&
          Array.isArray(call[3].toolIds) &&
          call[3].toolIds.length === 0
      ),
      'saving after stale-chip removal should persist toolIds: []'
    );
  });

  it('filters required-tools results by the search input', async () => {
    target = document.createElement('div');
    document.body.appendChild(target);
    mounted = mount(Component, {
      target,
      props: {
        store: createStore([], {
          gatheringLibraryTools: [
            {
              id: 'tool-pickaxe',
              label: 'Pickaxe',
              enabled: true,
              componentId: 'c1',
              requirement: null,
              breakage: { mode: 'limitedUses', maxUses: null },
              onBreak: { mode: 'destroy' },
            },
            {
              id: 'tool-lantern',
              label: 'Lantern',
              enabled: true,
              componentId: 'c2',
              requirement: null,
              breakage: { mode: 'limitedUses', maxUses: null },
              onBreak: { mode: 'destroy' },
            },
          ],
        }),
        services: { openCurrentAdmin: () => {} },
      },
    });
    flushSync();

    navButton('Gathering').click();
    await tick();
    flushSync();
    gatheringSubitem('Tasks').click();
    await tick();
    flushSync();
    target
      .querySelector('[data-gathering-task-id="task-herbs"] [aria-label="Edit Gather Moon Herbs"]')
      .click();
    await tick();
    flushSync();

    const section = target.querySelector('[data-gathering-task-required-tools]');
    const initialCards = section.querySelectorAll('[data-gathering-task-required-tools-card]');
    assert.equal(initialCards.length, 2);

    const searchInput = section.querySelector('[data-gathering-task-required-tools-search] input');
    searchInput.value = 'lant';
    searchInput.dispatchEvent(new Event('input', { bubbles: true }));
    await tick();
    flushSync();

    const filteredCards = section.querySelectorAll('[data-gathering-task-required-tools-card]');
    assert.equal(filteredCards.length, 1);
    assert.equal(
      filteredCards[0].getAttribute('data-gathering-task-required-tools-card'),
      'tool-lantern'
    );
  });
});
