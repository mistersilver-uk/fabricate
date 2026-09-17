/**
 * The manager store double every manager mount suite drives (issue 1669, extracted verbatim from
 * `tests/components/manager-mounted.test.js`).
 *
 * `createStore` publishes the `viewState` shape `adminStore` publishes and records every call the
 * root makes into the array it is handed, which is what lets a case assert the SEAM an interaction
 * reached rather than only the DOM it produced.
 *
 * `tests/helpers/` is outside the `npm test` glob; `tests/helpers-manager.test.js` proves this
 * module from inside it.
 */
import { get, writable } from 'svelte/store';

/**
 * A copy of `card` carrying the projection's non-enumerable `hydrate()` seam, recording its
 * own id in `requests` when a view asks for it (issue 1081).
 *
 * Non-enumerable exactly as `adminComponentRowProjection` defines it, so the spread, the
 * `JSON.stringify` and the bulk-edit models the manager runs over these cards cannot see it.
 *
 * @param {object} card
 * @param {Set<string>} requests
 * @returns {object}
 */
function withHydrateSpy(card, requests) {
  const copy = { ...card };
  Object.defineProperty(copy, 'hydrate', {
    enumerable: false,
    configurable: true,
    value: () => {
      requests.add(copy.id);
      return Promise.resolve(copy);
    },
  });
  return copy;
}

// The provider declares its OWN tab set, so `ids` is a parameter rather than a copy of
// Core's four. `tab` decorates each generated tab, which is how the chrome cases attach
// per-tab titles, subtitles, breadcrumbs and header actions without a second factory.
function downtimeProvider({
  prefix = 'Companion',
  ids = ['tracking', 'activities', 'factions', 'settings'],
  tab = () => ({}),
  mount: mountProvider,
  ...overrides
} = {}) {
  return {
    apiVersion: 1,
    id: 'downtime',
    tabs: ids.map((id, index) => ({
      id,
      label: `${prefix} ${id}`,
      accessibleName: `Open ${prefix} ${id}`,
      tooltip: `${prefix} ${id} tools`,
      icon: 'fas fa-star',
      ...tab(id, index),
    })),
    mount: mountProvider ?? (() => undefined),
    ...overrides,
  };
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
// Issue 1278 split currency across two scopes, so one fixture option still describes one
// coherent setup but lands in two places: `enabled` (participation) on the crafting system, and
// the ladder/strategy/provider/macros on the WORLD projection. Tests keep passing a single
// `selectedCurrency` object; `worldCurrencyFrom` below reads the world half back out of it.
function applySelectedCurrency(systemDetails, selectedCurrency) {
  if (!selectedCurrency) return;
  systemDetails.alchemy = {
    ...systemDetails.alchemy,
    requirements: {
      ...systemDetails.alchemy.requirements,
      currency: { enabled: selectedCurrency.enabled === true },
    },
  };
}

function worldCurrencyFrom(selectedCurrency) {
  const source = selectedCurrency || {};
  return {
    spendStrategy: source.spendStrategy || 'actorProperty',
    providerId: source.providerId || '',
    macros: source.macros || { canAfford: '', increment: '', decrement: '' },
    units: Array.isArray(source.units) ? source.units : [],
  };
}

// Per-system crafting visibility/resolution modes (issue 1151), keyed by system id.
// Opt-in: with no option the shared default fixture is untouched.
//
// These are written into `systemDetails` rather than through
// `options.selectedSystemOverrides`, and the difference is load-bearing:
// `applySelectedSystem` republishes `systemDetails[id]` RAW on a scope switch, while
// the overrides only ever reach the INITIALLY selected system. A mode written the
// second way would vanish the moment the switch under test happened, and every
// post-switch assertion would pass vacuously. Mutates the passed map, like
// `applySelectedCurrency` above, and is kept out of `createStore` for the same
// cognitive-complexity reason.
function applySystemCraftingModes(systemDetails, modesById) {
  for (const [id, modes] of Object.entries(modesById || {})) {
    if (systemDetails[id]) systemDetails[id] = { ...systemDetails[id], ...modes };
  }
}

/**
 * Fill a test's `worldRealms` override out to the shape `adminStore` actually projects.
 *
 * The travel inspector reads the `environments` and `parties` ARRAYS, not only their counts, so a
 * fixture carrying counts alone makes it throw during render. That failure is not loud: Svelte
 * unwinds and the manager falls back to the systems route, so the assertion that fires is a
 * confusing "expected world-travel, got systems" several lines later. Normalizing here means a
 * future override cannot reintroduce it by omission.
 */
function projectedWorldRealms(realms) {
  return realms.map((realm) => ({
    description: '',
    img: null,
    enabled: true,
    secret: false,
    biomes: [],
    environmentCount: Array.isArray(realm.environments) ? realm.environments.length : 0,
    partyCount: Array.isArray(realm.parties) ? realm.parties.length : 0,
    environments: [],
    parties: [],
    ...realm,
  }));
}

function createStore(calls = [], options = {}) {
  const selectedFeatures = options.selectedFeatures || {
    essences: true,
    effectTransfer: true,
    // The essence property-macro gate (issue 1036). It defaults to FALSE in the real
    // normalizer, so it is set explicitly here: without it the On-craft tab renders its
    // both-off empty state and the Macro capability pill never appears, which would make
    // every macro assertion in this file pass vacuously.
    propertyMacros: true,
    itemTags: true,
    gathering: true,
    recipeCategories: true,
    salvage: true,
  };
  // Mirrors `adminStore._buildManagedItemOptions`, which is the source of the real
  // `selectedSystem.managedItemOptions`. `category` (always) and `difficulty` (when
  // authored) are part of that projection and are carried here deliberately: the salvage
  // yield picker reads options from this list (issue 676), and its read-only difficulty
  // badge reads "No difficulty" for a component whose `difficulty` was dropped in
  // projection. A fixture omitting them would let that regression pass green.
  const alchemyManagedItemOptions = options.emptyComponents
    ? []
    : [
        {
          id: 'c1',
          name: 'Iron Ore',
          img: 'icons/commodities/metal/ore-chunk-grey.webp',
          description: 'Unrefined metal.',
          category: 'Reagent',
          difficulty: 2,
          originItemUuid: 'Compendium.fabricate.items.iron-ore',
        },
        {
          id: 'c2',
          name: 'Glass Vial',
          img: 'icons/containers/kitchenware/vase-clay-blue.webp',
          description: '',
          category: 'general',
          difficulty: 5,
        },
        {
          id: 'c3',
          name: 'Nightshade With An Exceptionally Long Localized Component Name',
          img: 'icons/consumables/plants/nightshade.jpg',
          description: 'A dusky flowering herb used in careful doses.',
          category: 'general',
          originItemUuid: 'Compendium.fabricate.items.nightshade-with-a-long-source-reference',
        },
        {
          id: 'c4',
          name: 'Coal',
          img: 'icons/commodities/materials/bowl-powder-black.webp',
          description: 'Fuel for a steady forge.',
          category: 'general',
          difficulty: 3,
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
      // `enabled` defaults ON in this fixture (issue 1096), and a test that supplies its own
      // still wins. It has to be stated now because it became LOAD-BEARING: an optional
      // check that is off collapses its route to the "turn this check on" empty state, so a
      // fixture that left `enabled` absent would have silently stopped rendering the editor
      // every assertion below is about. The persisted default is still `=== true` — this is
      // a fixture choice, not a change to the normalizer.
      craftingCheck: { enabled: true, ...(options.craftingCheck || {}) },
      // The ONE modifier library (issues 1095, 1117) is NOT here any more: issue 1308 moved it to
      // WORLD scope, so it rides the view state's `worldModifiers` slice below. The warning the
      // old comment carried still holds there — the projection is an ALLOWLIST, and an
      // unforwarded key renders an empty library on every activity, which is exactly the silent
      // state this fixture exists to make reachable.
      salvageResolutionMode: options.salvageResolutionMode || 'simple',
      salvageCraftingCheck: { enabled: true, ...(options.salvageCraftingCheck || {}) },
      gatheringCraftingCheck: { enabled: true, ...(options.gatheringCraftingCheck || {}) },
      // Travel & Realms PARTICIPATION (issue 1282). The System Settings feature tile beside
      // Currency reads it off the selected system, exactly as the Currency tile reads
      // `requirements.currency.enabled`.
      gatheringRealmSettings: { enabled: options.gatheringRealmsEnabled === true },
      features: selectedFeatures,
      // Overridable so a test can supply its own component set (the Tool display
      // precedence cases resolve `componentId` against their own fixtures); defaults to
      // the alchemy list every other test relies on.
      managedItemOptions: options.managedItemOptions ?? alchemyManagedItemOptions,
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
      // The COMPONENT category vocabulary (issue 676) — a SIBLING of `categories`, kept
      // deliberately disjoint from it here so a test asserting one can never pass on
      // the other's data.
      componentCategories: ['Reagent'],
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
      gatheringRealmSettings: { enabled: options.gatheringRealmsEnabled === true },
      features: options.smithingFeatures || {
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
        // Component category (issue 676) — the browser's grouping/filter axis. This one
        // is deliberately a CUSTOM category that exists only in this system, so the
        // system-switch facet-reset test has something real to hide.
        category: 'Reagent',
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
  // `gatheringEventFactEnvironments` is opt-in only: every other test keeps reading the
  // fixed two-environment fixture below, and only the site-10 discrimination test (issue
  // 1321) supplies its own set to make the "Active environments" event fact distinguish
  // `kind: 'event'` from `'task'` and a correct `conditionSettings` shape from a wrong one.
  const environments = options.emptyEnvironments
    ? []
    : options.gatheringEventFactEnvironments || [
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
  applySystemCraftingModes(systemDetails, options.systemCraftingModes);
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
        // Issue 1036. `earth` is the ENABLED, fully-configured essence: a colour, a linked
        // source, a property macro, and both usage axes non-zero. Its `componentUsageCount`
        // (1) and `recipeUsageCount` (2) DIFFER on purpose — an impact statement that
        // derived one from the other would pass against equal numbers.
        enabled: true,
        colorToken: 'rose',
        propertyMacroUuid: 'Macro.earth-infusion',
        hasEffectTransfer: true,
        hasPropertyMacro: true,
        recipeUsageCount: 2,
        recipeUsageIds: ['r1', 'r2'],
        deleteRewritesRecipes: true,
        componentUsageCount: 1,
        componentUsageItems: [
          { id: 'c1', name: 'Iron Ore', img: 'icons/commodities/metal/ore-chunk-grey.webp' },
        ],
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
        // The DISABLED, unconfigured counterpart — no colour, no source, no macro. It carries
        // one recipe, which `earth` also carries, so the bulk impact's recipe UNION (2) is
        // smaller than the per-essence SUM (3).
        enabled: false,
        colorToken: null,
        propertyMacroUuid: null,
        hasEffectTransfer: false,
        hasPropertyMacro: false,
        recipeUsageCount: 1,
        recipeUsageIds: ['r2'],
        deleteRewritesRecipes: true,
        componentUsageCount: 0,
        componentUsageItems: [],
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
            // The REAL projection carries participation as a flat boolean (issue 1278): the
            // system list is an allowlist that does not include `requirements`, so a double that
            // omitted this would be looser than the projection it stands for — and the World >
            // Currency subtitle counts exactly this field.
            currencyEnabled: options.selectedCurrency?.enabled === true,
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
            currencyEnabled: false,
            selected: false,
          },
        ],
    systemsLoading: options.systemsLoading === true,
    selectedSystem,
    recipes: options.recipes
      ? options.recipes
      : options.emptyRecipes
        ? []
        : [
            {
              // `recipeOverrides` patches the recipe `openRecipeEditor` opens, so a test
              // can seed a persisted field (a `craftingModifier` pick, say) without
              // restating this whole fixture list as its own `options.recipes`.
              ...options.recipeOverrides,
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
              // This suite hand-builds projected rows rather than running the real
              // `_buildRecipeList`, so the projection's `enableBlocked` (issue 1010) has to
              // be stated here. The row pills now read it rather than `incomplete`, and r2
              // is exactly the off-and-un-enableable case the assertion below is about.
              enableBlocked: true,
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
    // The recipe half of the Tags & Categories reference count, published as DATA by the
    // real store (issue 1081) so the always-mounted nav badge does not have to walk the
    // rows' detail tier for it. Left UNDEFINED by default, which is what makes the default
    // rows' counts unchanged: an absent record means "not published", and the component
    // falls back to walking exactly as it did before. Tests asserting on the pre-counted
    // branch publish it, as the store does on every one of its publishes.
    recipeTagPlaceholderCounts: options.recipeTagPlaceholderCounts,
    recipeSearchTerm: '',
    itemSearchTerm: options.itemSearchTerm || '',
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
    toolDraft: options.toolDraft || null,
    toolDraftBaseline: options.toolDraftBaseline || null,
    toolDraftSystemId: options.toolDraftSystemId || 'alchemy',
    toolDraftSourceItemUuid: '',
    toolDraftDirty: options.toolDraftDirty === true || options.toolsDraftDirty === true,
    toolDraftSaving: options.toolDraftSaving === true || options.toolsDraftSaving === true,
    toolDraftSaveError: options.toolDraftSaveError || null,
    toolDraftValidation: options.toolDraftValidation || { valid: true, errors: [] },
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
              // Opt-in override (issue 1321): the site-10 discrimination test moves this off
              // its default so a `conditionSettings`-shape bug (passing the converted
              // `{weather, timeOfDay}` current shape instead of the settings shape) is
              // observable — the wrong shape falls back to `conditionSettingsToCurrent`'s
              // hard-coded default, which is this same default value, so leaving every other
              // test on it would make that failure mode silent everywhere.
              current: options.gatheringEventFactWeather || 'clear',
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
                  ...(options.omitTaskResolutionMode
                    ? {}
                    : { resolutionMode: options.taskResolutionMode || 'd100' }),
                  resultGroups: options.taskResultGroups || [],
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
          // Opt-in only: the event library is empty by default so the many existing
          // assertions about the encounters browser's empty state stay true. Tests that
          // need to reach the gathering-EVENT editor pass `gatheringLibraryEvents`.
          events: options.gatheringLibraryEvents || [],
          tools: options.gatheringLibraryTools || [],
        },
      },
    },
    // THE WORLD SCOPE PROJECTION, seeded from the same tool roster (issue 1373). The rules
    // editor reads its `(tool, system)` row for the ONE fact the system's own record cannot
    // state - whether each world-default section is inherited or overridden - and reads
    // `member` to decide whether to offer the inherit switches and the removal callout at all.
    // Every seeded row is a MIGRATED one: `migrateToolRequirementSections` writes all four
    // sections overridden, so that is the state every existing world is actually in.
    worldScope: {
      tool: {
        entities: (options.gatheringLibraryTools || []).map((tool) => ({ id: tool.id })),
        entries: (options.gatheringLibraryTools || []).map((tool) => ({
          id: tool.id,
          defaults: options.worldToolDefaults?.[tool.id] ?? null,
          systems: [
            {
              systemId: 'alchemy',
              member: options.worldToolMember !== false,
              enabled: true,
              inherited: options.worldToolInherit?.[tool.id] ?? {
                breakage: false,
                onBreak: false,
                prerequisites: false,
                bonus: false,
              },
            },
          ],
        })),
      },
    },
    // Participation is the SELECTED SYSTEM's answer; the reveal/visibility pair beside it is
    // the world's (issue 1282).
    gatheringRealmSettings: { enabled: options.gatheringRealmsEnabled === true },
    // `memberActorUuids` is carried by the REAL projection — `adminStore` spreads the stored
    // party before adding `memberCards` — and the card body and the page-header subtitle both
    // read it. A double that omitted it was looser than the helper it stands for, which is
    // exactly how a subtitle that always counted zero assigned characters would pass green.
    worldCurrency: worldCurrencyFrom(options.selectedCurrency),
    // The two character libraries are WORLD scope since issue 1308, so they ride the view state
    // beside the currency ladder rather than the selected system. `options.modifiers` and
    // `options.characterPrerequisites` keep their fixture names — the surfaces that read them
    // have not moved yet, only where the data comes from.
    worldModifiers: options.modifiers || [],
    worldCharacterPrerequisites: options.characterPrerequisites || [],
    travelParties: options.travelParties || [
      {
        id: 'party-one',
        name: 'Wayfarers',
        enabled: true,
        memberCount: 1,
        memberActorUuids: ['Actor.member'],
        memberCards: [{ uuid: 'Actor.member', name: 'Mira', img: '', stale: false }],
        travelActorUuid: 'Actor.marker',
        travelActor: { uuid: 'Actor.marker', name: 'Mira', img: '' },
      },
      {
        id: 'party-two',
        name: 'Night Watch',
        enabled: false,
        memberCount: 0,
        memberActorUuids: [],
        memberCards: [],
        travelActorUuid: null,
        travelActor: null,
      },
    ],
    selectedPartyId: 'party-one',
    actorOptions: options.actorOptions || [
      { uuid: 'Actor.member', name: 'Mira', img: '', isPlayerCharacter: true },
      { uuid: 'Actor.scout', name: 'Scout', img: '', isPlayerCharacter: true },
    ],
    partyRealmOverridesAvailable:
      options.partyRealmOverridesAvailable ?? options.gatheringRealmsEnabled === true,
    // The WORLD's realm library (issue 1282) — one library, whichever system is selected.
    worldRealms: projectedWorldRealms(
      options.worldRealms || [
        {
          id: 'realm-forest',
          name: 'Green March',
          environmentCount: 1,
          partyCount: 1,
          environments: [{ id: 'env-forest', name: 'Green March Woods', enabled: true }],
          parties: [{ id: 'party-1', name: 'The Wayfarers' }],
        },
      ]
    ),
    currentSceneRegions: options.currentSceneRegions || [],
    currentSceneUuid: options.currentSceneUuid || '',
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
      // `worldRealms` is deliberately NOT re-projected here: the realm library does not change
      // when the selected crafting system does (issue 1282).
      gatheringRealmSettings: {
        enabled: nextSelected?.gatheringRealmSettings?.enabled === true,
      },
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
    // Pad the managed list so the browser paginates. A selection is held on the lifted
    // browser state, not on the page, so proving that Apply carries an id the current page
    // does not even render needs more rows than one page holds.
    const padded = options.extraComponentItems
      ? [...(componentItems[id] || []), ...options.extraComponentItems]
      : componentItems[id] || [];
    const cards = padded
      .map((item) =>
        options.missingComponentSource && item.id === 'c1'
          ? { ...item, sourceMissing: true, sourceOrigin: 'missing', sourceOriginLabel: 'Missing' }
          : item
      )
      // Issue 1081: the real projection hands out cards carrying a NON-ENUMERABLE `hydrate()`
      // that resolves the card's linked source document — the "Missing" verdict and the live
      // description fallback — only when a view asks for it. Opting in records which cards
      // the manager asked for; a fresh copy per call, because a refresh really does project
      // fresh card objects and the request has to be re-made against them.
      .map((item) =>
        options.componentHydrationRequests
          ? withHydrateSpy(item, options.componentHydrationRequests)
          : item
      );
    // `itemCards` is the SEARCH-FILTERED list. In production `_buildItemCards` calls
    // `CraftingSystemManager.getItems(systemId, itemSearchTerm)`, which returns the whole
    // managed list for an empty search and a name/description/uuid/tag-matched subset
    // otherwise — while `selectedSystem.managedItemOptions` is built from the UNFILTERED
    // managed items. That asymmetry is real and load-bearing (issue 676: it leaked the
    // browser's search into the salvage yield picker), so the fixture reproduces it
    // rather than pretending `itemCards` is always everything.
    const search = String(options.itemSearchTerm || '')
      .trim()
      .toLowerCase();
    if (!search) return cards;
    return cards.filter(
      (item) =>
        String(item.name || '')
          .toLowerCase()
          .includes(search) ||
        (Array.isArray(item.tags) &&
          item.tags.some((tag) =>
            String(tag || '')
              .toLowerCase()
              .includes(search)
          ))
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
    // The real action returns the created system on success and `false` when the GM
    // backed out of the dirty-environment confirm, because the root routes it through
    // `afterTruthyResult` to decide whether to navigate.
    createSystem: () => {
      calls.push(['createSystem']);
      if (Object.hasOwn(options, 'createSystemResult')) return options.createSystemResult;
      // Model the real action: it registers the system, SELECTS it, and refreshes before
      // resolving. A stub that only returns an object would let the root navigate to
      // whichever system was already selected and still pass.
      const created = {
        id: 'created-system',
        name: 'New Crafting System',
        description: 'Configure categories, item tags, essences, and crafting behaviour.',
        features: {},
      };
      systemDetails[created.id] = created;
      viewState.update((state) => ({
        ...state,
        systems: [...state.systems, { id: created.id, name: created.name, selected: false }],
      }));
      applySelectedSystem(created.id);
      return created;
    },
    importSystem: () => calls.push(['importSystem']),
    exportSystem: (id) => calls.push(['exportSystem', id]),
    deleteSystem: (id) => calls.push(['deleteSystem', id]),
    toggleSystemEnabled: (id, enabled) => {
      calls.push(['toggleSystemEnabled', id, enabled]);
      applySystemEnabled(id, enabled);
    },
    saveSystemDetails: (name, description) => {
      calls.push(['saveSystemDetails', name, description]);
      if (options.saveSystemDetailsResult === false) return false;
      // Mirror the real store: persist then refresh, republishing a NEW
      // selectedSystem object (same id) carrying the saved name/description.
      viewState.update((state) => ({
        ...state,
        selectedSystem: state.selectedSystem
          ? { ...state.selectedSystem, name, description }
          : state.selectedSystem,
      }));
      return true;
    },
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
      if (options.saveRecipeItemReject) return Promise.reject(new Error('save recipe item failed'));
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
    // Nor on these: both character libraries are world scope since issue 1308. The two `add`
    // stubs RETURN a created entry, because the root's cross-copy reads its id to open the new
    // row on the destination page — a stub answering `undefined` would make the copy look like a
    // no-op and hide the very composition these are here to exercise.
    addCharacterPrerequisite: async (partial) => {
      calls.push(['addCharacterPrerequisite', partial]);
      return { id: 'created-prereq', ...partial };
    },
    addModifier: async (partial) => {
      calls.push(['addModifier', partial]);
      return { id: 'created-modifier', ...partial };
    },
    // No system id on any of these: currency is world scope since issue 1278, so the store's
    // currency actions address the ONE world config rather than a crafting system.
    setCurrencySpendStrategy: async (strategy) => {
      calls.push(['setCurrencySpendStrategy', strategy]);
    },
    setCurrencyProvider: async (providerId) => {
      calls.push(['setCurrencyProvider', providerId]);
    },
    setCurrencyMacro: async (key, uuid) => {
      calls.push(['setCurrencyMacro', key, uuid]);
    },
    clearCurrencyMacro: async (key) => {
      calls.push(['clearCurrencyMacro', key]);
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
    // Called by the root's route effect on every scope change (issue 1462). The real store
    // short-circuits internally, so the component calls it unconditionally and this records
    // every call — which is why the cases assert call DELTAS across one click rather than
    // presence.
    clearLibrarySearches: () => calls.push(['clearLibrarySearches']),
    deleteComponent: (id) => calls.push(['deleteComponent', id]),
    // The set delete (issue 1129). `describeComponentDelete` is a SYNCHRONOUS selector the
    // root `$derived`s the panel's impact from, so the double returns a literal rather than a
    // promise — an async double here would render an unresolved impact and the panel would
    // silently show zeroes.
    describeComponentDelete: (componentIds) => {
      const ids = [...(componentIds || [])];
      return (
        options.componentDeleteImpact ?? {
          deletable: ids.length,
          deletableIds: ids,
          recipesRewritten: ids.length > 0 ? 2 : 0,
          recipesDisabled: ids.length > 0 ? 1 : 0,
        }
      );
    },
    deleteComponents: (componentIds) => {
      const ids = [...(componentIds || [])];
      calls.push(['deleteComponents', ids]);
      return (
        options.deleteComponentsResult ?? {
          deleted: ids.length,
          recipesUpdated: 2,
          recipesDisabled: 1,
        }
      );
    },
    updateComponent: (id, updates) => {
      calls.push(['updateComponent', id, updates]);
      if (options.updateComponentReject) return Promise.reject(new Error('update failed'));
      return options.updateComponentResult ?? true;
    },
    // The set-apply bulk write (issue 772). It takes the selection `Set` directly and
    // already refreshes internally, so the root neither converts nor re-refreshes; the
    // recorded call is normalized to an array purely so a test can compare it.
    applyComponentBulkEdit: (componentIds, edit) => {
      const ids = [...(componentIds || [])];
      calls.push(['applyComponentBulkEdit', ids, edit]);
      // The real action returns the write RESULT, never a boolean: `null` for "nothing was
      // written" and `{updated}` counting the components that actually CHANGED, which is
      // what the toast names. Defaulting to `ids.length` keeps the common case honest while
      // a test can hand back a smaller count, or `null`, to drive the other branches.
      if (Object.hasOwn(options, 'applyComponentBulkEditResult')) {
        return options.applyComponentBulkEditResult;
      }
      return { updated: ids.length, componentIds: ids };
    },
    // The recipe twin (issue 1010). Its result carries SIX counts, and the two book ones
    // count membership EDGES rather than the definitions `booksUpdated` counts — the
    // post-apply toast composes a sentence out of them.
    applyRecipeBulkEdit: (recipeIds, edit) => {
      const ids = [...(recipeIds || [])];
      calls.push(['applyRecipeBulkEdit', ids, edit]);
      if (Object.hasOwn(options, 'applyRecipeBulkEditResult')) {
        return options.applyRecipeBulkEditResult;
      }
      return { updated: ids.length, recipeIds: ids };
    },
    // The recipe set delete (issue 1132). `describeRecipeDelete` is a SYNCHRONOUS selector
    // the root `$derived`s the panel's impact from, exactly as its component twin above is —
    // an async double here would render an unresolved impact and the card would silently
    // show zeroes and disable itself.
    describeRecipeDelete: (recipeIds) => {
      const ids = [...(recipeIds || [])];
      return (
        options.recipeDeleteImpact ?? {
          deletable: ids.length,
          deletableIds: ids,
          recipeItemsAffected: ids.length > 0 ? 2 : 0,
          recipeItemIds: ids.length > 0 ? ['ri1', 'ri2'] : [],
          learnersAffected: ids.length > 0 ? 4 : 0,
          learnerIds: ids.length > 0 ? ['a1', 'a2', 'a3', 'a4'] : [],
        }
      );
    },
    deleteRecipes: (recipeIds) => {
      const ids = [...(recipeIds || [])];
      calls.push(['deleteRecipes', ids]);
      if (options.deleteRecipesReject) return Promise.reject(new Error('delete failed'));
      return (
        options.deleteRecipesResult ?? {
          deleted: ids.length,
          recipeIds: ids,
          recipeItemsAffected: 1,
          recipeItemsRewritten: 1,
          learnersAffected: 4,
        }
      );
    },
    // FIVE positional arguments. `colorToken` (issue 917) is the last of them, and a
    // four-parameter stub records a call that looks identical whether the argument is
    // threaded or silently dropped — which is exactly how the value went missing once
    // already. Recording it is what makes the assertion below able to fail.
    //
    // SIX arguments as of issue 1036: the sixth is the options bag carrying `enabled` and
    // `propertyMacroUuid`, both of which the editor can author BEFORE the first save. A
    // five-parameter stub records a call that looks identical whether they are threaded or
    // silently dropped — which is exactly how `colorToken` went missing once already.
    addEssence: (name, description, icon, sourceComponentId, colorToken, extra) => {
      calls.push(['addEssence', name, description, icon, sourceComponentId, colorToken, extra]);
      if (options.addEssenceReject) return Promise.reject(new Error('add failed'));
      return options.addEssenceResult ?? true;
    },
    // The essence actions issue 1036 adds beside the two above. Each is reached OPTIONAL-CHAINED
    // from the root, so an absent export no-ops silently — these stubs are what make the wiring
    // detectable at all.
    //
    // `duplicateEssence` is NOT among them any more (issue 1372, maintainer parity round 8): the
    // store publishes no such verb and the inspector renders no such control. Leaving the stub
    // here would make a re-added call site look wired in every mounted assertion.
    setEssenceEnabled: (id, enabled) => {
      calls.push(['setEssenceEnabled', id, enabled]);
      return { updated: true, invalidatedRecipes: 0 };
    },
    applyEssenceBulkEdit: (essenceIds, edit) => {
      const ids = [...(essenceIds || [])];
      calls.push(['applyEssenceBulkEdit', ids, edit]);
      if (Object.hasOwn(options, 'applyEssenceBulkEditResult')) {
        return options.applyEssenceBulkEditResult;
      }
      return { updated: ids.length, essenceIds: ids };
    },
    // `deleteEssencesReject` is the twin of `deleteRecipesReject` above, and it is what makes
    // the essence root's `finally` disarm detectable at all: with only a result option, the
    // rejection branch has no way in and moving the disarm back into the `try` stays green.
    deleteEssences: (essenceIds) => {
      const ids = [...(essenceIds || [])];
      calls.push(['deleteEssences', ids]);
      if (options.deleteEssencesReject) return Promise.reject(new Error('delete failed'));
      // `recipesDisabled` is in the default, not just the explicit results, because the real
      // `adminStore.deleteEssences` always returns it (issue 1144). A double that omits it is
      // looser than production, and every toast test that does NOT pass an explicit result would
      // then be asserting against a shape the app never produces.
      return (
        options.deleteEssencesResult ?? {
          deleted: ids.length,
          blocked: [],
          recipesUpdated: 2,
          recipesDisabled: 1,
        }
      );
    },
    cancelEssenceDraft: () => {
      calls.push(['cancelEssenceDraft']);
      return true;
    },
    updateEssence: (id, updates) => {
      calls.push(['updateEssence', id, updates]);
      if (options.updateEssenceReject) return Promise.reject(new Error('update failed'));
      return options.updateEssenceResult ?? true;
    },
    // Renamed from `removeEssence` in issue 1036 so the singular delete pairs with the
    // new `deleteEssences` set delete. The store now returns a boolean rather than
    // `undefined`, which is what lets a caller tell a cancelled confirm from a write.
    deleteEssence: (id) => {
      calls.push(['deleteEssence', id]);
      return true;
    },
    addCategory: (value, icon) => {
      calls.push(['addCategory', value, icon]);
      if (options.addCategoryReject) return Promise.reject(new Error('add category failed'));
      return options.addCategoryResult ?? true;
    },
    removeCategory: (value) => calls.push(['removeCategory', value]),
    setCategoryIcon: (name, icon) => calls.push(['setCategoryIcon', name, icon]),
    // The COMPONENT category vocabulary (issue 676). The root calls these
    // optional-chained, so an absent store export no-ops SILENTLY — these stubs plus
    // the call-site assertions below are what make that detectable at all.
    addComponentCategory: (value, icon) => {
      calls.push(['addComponentCategory', value, icon]);
      return options.addComponentCategoryResult ?? true;
    },
    removeComponentCategory: (value) => calls.push(['removeComponentCategory', value]),
    setComponentCategoryIcon: (name, icon) => calls.push(['setComponentCategoryIcon', name, icon]),
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
    confirmDiscardDirtySystemDetailsDraft: () => {
      calls.push(['confirmDiscardDirtySystemDetailsDraft']);
      return options.confirmDiscardSystemDetailsResult ?? 'discard';
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
      // A store save that REFUSES, mirroring `saveSystemDetails`/`updateEssence`. The route
      // exit is gated on the answer, so a fixture that could only ever succeed cannot tell a
      // guard that inspects it from one that returns `true` unconditionally.
      return options.saveCraftingCheckSimpleResult;
    },
    // The Checks Studio's three-way route-exit prompt (issue 1096). It is `confirmDiscard*`
    // like its eight siblings and returns 'save' | 'discard' | 'cancel'; `true` is the legacy
    // discard alias the root also accepts.
    confirmDiscardDirtyChecksDraft: (activities) => {
      calls.push(['confirmDiscardDirtyChecksDraft', activities]);
      return options.confirmDiscardChecksResult ?? true;
    },
    saveCraftingCheckActive: (enabled) => {
      calls.push(['saveCraftingCheckActive', enabled]);
    },
    saveCraftingCheckConsumption: (patch) => {
      calls.push(['saveCraftingCheckConsumption', patch]);
    },
    saveAlchemyConfig: (config) => {
      calls.push(['saveAlchemyConfig', config]);
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
    // Participation is a CRAFTING SYSTEM write since issue 1282, so the double republishes BOTH
    // projections of it: the System Settings tile reads `selectedSystem.gatheringRealmSettings`
    // and the travel view-model carries its own copy. A double that moved only one of them would
    // leave the tile stuck at its old state and read as a toggle that does nothing.
    setGatheringRealmsEnabled: (systemId, enabled) => {
      calls.push(['setGatheringRealmsEnabled', systemId, enabled]);
      viewState.update((state) => ({
        ...state,
        gatheringRealmSettings: { ...state.gatheringRealmSettings, enabled },
        selectedSystem: state.selectedSystem
          ? { ...state.selectedSystem, gatheringRealmSettings: { enabled } }
          : state.selectedSystem,
      }));
      return true;
    },
    selectParty: (id) => {
      calls.push(['selectParty', id]);
      viewState.update((state) => ({ ...state, selectedPartyId: id }));
      return true;
    },
    createParty: () => {
      calls.push(['createParty']);
      return true;
    },
    renameParty: (id, name) => {
      calls.push(['renameParty', id, name]);
      return true;
    },
    addOrMovePartyMember: (id, uuid) => {
      calls.push(['addOrMovePartyMember', id, uuid]);
      return true;
    },
    removePartyMember: (id, uuid) => {
      calls.push(['removePartyMember', id, uuid]);
      return true;
    },
    movePartyMember: (from, to, uuid) => {
      calls.push(['movePartyMember', from, to, uuid]);
      return true;
    },
    setPartyTravelActor: (id, uuid) => {
      calls.push(['setPartyTravelActor', id, uuid]);
      viewState.update((state) => ({
        ...state,
        travelParties: state.travelParties.map((party) =>
          party.id === id
            ? {
                ...party,
                travelActorUuid: uuid,
                travelActor: { uuid, name: 'Scout', img: '' },
              }
            : party
        ),
      }));
      return true;
    },
    clearPartyTravelActor: (id) => {
      calls.push(['clearPartyTravelActor', id]);
      return true;
    },
    setPartyEnabled: (id, enabled) => {
      calls.push(['setPartyEnabled', id, enabled]);
      return true;
    },
    deleteParty: (id) => {
      calls.push(['deleteParty', id]);
      return true;
    },
    setPartyRealmOverride: (id, systemId, realmIds) => {
      calls.push(['setPartyRealmOverride', id, systemId, realmIds]);
      return true;
    },
    clearPartyRealmOverride: (id, systemId) => {
      calls.push(['clearPartyRealmOverride', id, systemId]);
      return true;
    },
    addGatheringLibraryTask: (systemId) => {
      calls.push(['addGatheringLibraryTask', systemId]);
      return { id: 'task-new', name: 'New Gathering Task', dropRows: [] };
    },
    validateGatheringLibraryTask: (task) =>
      options.gatheringTaskValidation?.(task) || { valid: true, errors: [], resultErrors: [] },
    updateGatheringLibraryTask: (systemId, taskId, updates = {}) => {
      calls.push(['updateGatheringLibraryTask', systemId, taskId, updates]);
      // The two failure branches the root's save path can take. Without these the fixture
      // could only ever return `true`, so the failed-save alert was undrivable (issue 919).
      if (options.updateGatheringLibraryTaskReject) {
        return Promise.reject(new Error('update gathering task failed'));
      }
      if (options.updateGatheringLibraryTaskResult === false) return false;
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
    // Also absent until issue 919. The root optional-chains to `undefined` and reads that as
    // "proceed", so the cancel branch of the save was undrivable and nothing pinned what a
    // cancellation must leave on screen. Proceeding stays the default, which is exactly what
    // the missing method already meant.
    confirmGatheringLibraryTaskCompositionLoss: (systemId, taskId, draft) => {
      calls.push(['confirmGatheringLibraryTaskCompositionLoss', systemId, taskId, draft]);
      return options.confirmGatheringLibraryTaskCompositionLossResult !== false;
    },
    duplicateGatheringLibraryTask: (...args) => {
      calls.push(['duplicateGatheringLibraryTask', ...args]);
      return { id: 'task-copy', name: 'Gather Moon Herbs (Copy)', dropRows: [] };
    },
    deleteGatheringLibraryTask: (...args) => calls.push(['deleteGatheringLibraryTask', ...args]),
    // The gathering-EVENT library had no handler here at all before issue 919, so the
    // root's `store.updateGatheringLibraryEvent?.(…)` optional-chained to `undefined` — and
    // because the root treats anything other than a literal `false` as success, every
    // mounted event save passed unconditionally. Mirrors the task handler above.
    updateGatheringLibraryEvent: (systemId, eventId, updates = {}) => {
      calls.push(['updateGatheringLibraryEvent', systemId, eventId, updates]);
      if (options.updateGatheringLibraryEventReject) {
        return Promise.reject(new Error('update gathering event failed'));
      }
      if (options.updateGatheringLibraryEventResult === false) return false;
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
                events: (systemConfig.events || []).map((event) =>
                  event.id === eventId ? { ...event, ...updates } : event
                ),
              },
            },
          },
        };
      });
      return true;
    },
    // Mirrors confirmGatheringLibraryTaskCompositionLoss above.
    confirmGatheringLibraryEventCompositionLoss: (systemId, eventId, draft) => {
      calls.push(['confirmGatheringLibraryEventCompositionLoss', systemId, eventId, draft]);
      return options.confirmGatheringLibraryEventCompositionLossResult !== false;
    },
    createToolDraft: (initialPatch = {}, systemId = 'alchemy') => {
      const created = {
        id: 'tool-new',
        enabled: true,
        label: '',
        componentId: null,
        ...initialPatch,
      };
      calls.push(['createToolDraft', initialPatch, systemId]);
      viewState.update((state) => ({
        ...state,
        toolDraft: created,
        toolDraftBaseline: null,
        toolDraftSystemId: systemId,
        toolDraftDirty: true,
        toolDraftValidation: options.toolDraftValidation || {
          valid: false,
          errors: ['Item source is required'],
        },
      }));
      return created;
    },
    openToolDraft: (toolId, systemId = 'alchemy') => {
      calls.push(['openToolDraft', toolId, systemId]);
      const state = get(viewState);
      const tool =
        state.selectedSystem?.tools?.find((entry) => entry.id === toolId) ||
        state.toolsDraft?.find((entry) => entry.id === toolId);
      if (!tool) return false;
      viewState.update((current) => ({
        ...current,
        toolDraft: { ...tool },
        toolDraftBaseline: { ...tool },
        toolDraftSystemId: systemId,
        toolDraftDirty: false,
        toolDraftValidation: options.toolDraftValidation || { valid: true, errors: [] },
      }));
      return true;
    },
    patchToolDraft: (patch = {}) => {
      calls.push(['patchToolDraft', patch]);
      viewState.update((state) => ({
        ...state,
        toolDraft: { ...(state.toolDraft || {}), ...patch },
        toolDraftDirty: true,
      }));
      return true;
    },
    stageToolDraftSource: (...args) => {
      calls.push(['stageToolDraftSource', ...args]);
      return true;
    },
    unlinkToolDraftSource: () => {
      calls.push(['unlinkToolDraftSource']);
      return true;
    },
    discardToolDraft: () => {
      calls.push(['discardToolDraft']);
      viewState.update((state) => ({
        ...state,
        toolDraft: state.toolDraftBaseline ? { ...state.toolDraftBaseline } : null,
        toolDraftDirty: false,
      }));
      return true;
    },
    deleteToolDraft: () => {
      calls.push(['deleteToolDraft']);
      viewState.update((state) => ({
        ...state,
        toolDraft: null,
        toolDraftBaseline: null,
        toolDraftDirty: false,
      }));
      return options.deleteToolDraftResult ?? true;
    },
    // THE TWO IMMEDIATE-PERSISTENCE WRITES THE RULES EDITOR PERFORMS (issue 1373): stop using a
    // Tool in this system, and move one world-default section between inheriting and overriding.
    // Both are the store's because both are TWO writes — a world membership record and the
    // in-system record — and the editor must not perform half of either.
    removeToolFromSystem: (...args) => {
      calls.push(['removeToolFromSystem', ...args]);
      viewState.update((state) => ({
        ...state,
        toolDraft: null,
        toolDraftBaseline: null,
        toolDraftDirty: false,
      }));
      return options.removeToolFromSystemResult ?? true;
    },
    setToolSectionInherited: (...args) => {
      calls.push(['setToolSectionInherited', ...args]);
      return true;
    },
    enterToolsDraft: (systemId) => calls.push(['enterToolsDraft', systemId]),
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
    saveToolDraft: () => {
      calls.push(['saveToolDraft']);
      if (options.saveToolDraftResult === false) {
        viewState.update((state) => ({
          ...state,
          toolDraftValidation: options.saveFailureValidation || {
            valid: false,
            errors: ['Item source is required'],
          },
          toolDraftSaveError: options.toolDraftSaveError || 'invalid',
        }));
        return false;
      }
      viewState.update((state) => ({
        ...state,
        toolDraftBaseline: state.toolDraft ? { ...state.toolDraft } : null,
        toolDraftDirty: false,
        toolDraftSaveError: null,
        toolsDraftDirtyToolIds: [],
        toolsDraftDirty: false,
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
    isToolsDraftDirty: () => get(viewState).toolDraftDirty === true,
    confirmDiscardDirtyToolsDraft: () => {
      calls.push(['confirmDiscardDirtyToolsDraft']);
      return options.confirmDiscardDirtyToolsResult ?? true;
    },
    cancelToolsDraft: () => {
      if (options.trackCancelToolsDraft) calls.push(['cancelToolsDraft']);
      viewState.update((state) => ({
        ...state,
        toolDraft: null,
        toolDraftBaseline: null,
        toolDraftDirty: false,
      }));
      return true;
    },
  };
}

export { createStore, downtimeProvider, projectedWorldRealms, withHydrateSpy };
