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
  'ProviderExpressionInput'
];

let tempRoot;
let Component;
let mounted;
let target;

function rewriteClientImports(code) {
  return code
    .replace(/from 'svelte';/g, "from 'svelte/internal/client';")
    .replace(/(from\s+['"][^'"]+\.svelte)(['"])/g, '$1.js$2');
}

function compileManagerRoot() {
  writeCompiledSvelte('src/ui/svelte/apps/manager/CraftingSystemManagerRoot.svelte');
  writeCompiledSvelte('src/ui/svelte/apps/manager/ComponentEditView.svelte');
  writeCompiledSvelte('src/ui/svelte/apps/manager/ComponentsBrowserView.svelte');
  writeCompiledSvelte('src/ui/svelte/apps/manager/EnvironmentEditView.svelte');
  writeCompiledSvelte('src/ui/svelte/apps/manager/EnvironmentsBrowserView.svelte');
  writeCompiledSvelte('src/ui/svelte/apps/manager/EssenceBrowserView.svelte');
  writeCompiledSvelte('src/ui/svelte/apps/manager/EssenceEditView.svelte');
  writeCompiledSvelte('src/ui/svelte/apps/manager/GatheringTaskEditView.svelte');
  writeCompiledSvelte('src/ui/svelte/apps/manager/ToolsBrowserView.svelte');
  writeCompiledSvelte('src/ui/svelte/apps/manager/GatheringTasksBrowserView.svelte');
  writeCompiledSvelte('src/ui/svelte/apps/manager/GatheringHazardsBrowserView.svelte');
  writeCompiledSvelte('src/ui/svelte/apps/manager/GatheringHazardEditView.svelte');
  writeCompiledSvelte('src/ui/svelte/apps/manager/RecipesBrowserView.svelte');
  writeCompiledSvelte('src/ui/svelte/apps/manager/SystemEditView.svelte');
  writeCompiledSvelte('src/ui/svelte/apps/manager/SystemsBrowserView.svelte');
  writeCompiledSvelte('src/ui/svelte/apps/manager/TagsCategoriesView.svelte');
  for (const componentName of sharedComponentNames) {
    writeCompiledSvelte(`src/ui/svelte/components/${componentName}.svelte`);
  }

  for (const utilPath of ['foundryBridge.js', 'essenceIcons.js', 'fontAwesomeFreeClassicIcons.js', 'iconPickerPopover.js', 'componentEditor.js', 'dropRateTier.js']) {
    const utilDestination = join(tempRoot, `src/ui/svelte/util/${utilPath}`);
    mkdirSync(dirname(utilDestination), { recursive: true });
    writeFileSync(
      utilDestination,
      readFileSync(resolve(repoRoot, `src/ui/svelte/util/${utilPath}`), 'utf8')
    );
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
  return Array.from(target.querySelectorAll('.manager-nav-button'))
    .find(button => button.textContent.includes(labelText));
}

function gatheringSubitem(labelText) {
  return Array.from(target.querySelectorAll('.manager-nav-subitem'))
    .find(button => button.textContent.includes(labelText));
}

function gatheringToggle() {
  return target.querySelector('.manager-nav-toggle');
}

function writeCompiledSvelte(sourcePath) {
  const source = readFileSync(resolve(repoRoot, sourcePath), 'utf8');
  const compiled = compile(source, {
    filename: sourcePath,
    generate: 'client',
    dev: true,
    css: 'injected'
  });
  const destination = join(tempRoot, `${sourcePath}.js`);
  mkdirSync(dirname(destination), { recursive: true });
  writeFileSync(destination, rewriteClientImports(compiled.js.code));
}

function createStore(calls = [], options = {}) {
  const selectedFeatures = options.selectedFeatures || {
    essences: true,
    effectTransfer: true,
    itemTags: true,
    gathering: true,
    recipeCategories: true
  };
  const alchemyManagedItemOptions = options.emptyComponents ? [] : [
    { id: 'c1', name: 'Iron Ore', img: 'icons/commodities/metal/ore-chunk-grey.webp', description: 'Unrefined metal.', sourceItemUuid: 'Compendium.fabricate.items.iron-ore' },
    { id: 'c2', name: 'Glass Vial', img: 'icons/containers/kitchenware/vase-clay-blue.webp', description: '' },
    { id: 'c3', name: 'Nightshade With An Exceptionally Long Localized Component Name', img: 'icons/consumables/plants/nightshade.jpg', description: 'A dusky flowering herb used in careful doses.', sourceItemUuid: 'Compendium.fabricate.items.nightshade-with-a-long-source-reference' },
    { id: 'c4', name: 'Coal', img: 'icons/commodities/materials/bowl-powder-black.webp', description: 'Fuel for a steady forge.' }
  ];
  const systemDetails = {
    alchemy: {
      id: 'alchemy',
      name: 'Alchemy',
      description: 'Potion and essence work',
      resolutionMode: options.alchemyResolutionMode || 'alchemy',
      advancedOptionsEnabled: true,
      features: selectedFeatures,
      managedItemOptions: alchemyManagedItemOptions,
      essenceDefinitions: [
        { id: 'earth', name: 'Earth', description: 'Stone and root.', icon: 'fas fa-mountain', sourceComponentId: 'c1', sourceItemUuid: 'c1', associatedSystemItemId: 'c1' },
        { id: 'water', name: 'Water', description: 'Clear current.', icon: 'fas fa-water', sourceComponentId: null, sourceItemUuid: null, associatedSystemItemId: null }
      ],
      itemTags: ['herb', 'mineral', 'ore'],
      categories: ['potions'],
      sceneOptions: [
        { uuid: 'Scene.forest', name: 'Moonlit Forest', background: { src: 'forest-full.webp' }, img: 'forest-medium.webp', thumbnail: 'forest-thumb.webp' }
      ],
      availableScriptMacros: [],
      rollTableOptions: []
    },
    smithing: {
      id: 'smithing',
      name: 'Smithing',
      description: 'Heavy equipment work',
      resolutionMode: 'routed',
      advancedOptionsEnabled: false,
      features: {
        gathering: false,
        itemTags: false,
        recipeCategories: true,
        essences: false
      },
      managedItemOptions: [{ id: 's1' }, { id: 's2' }, { id: 's3' }, { id: 's4' }, { id: 's5' }, { id: 's6' }],
      essenceDefinitions: [],
      itemTags: [],
      categories: ['armor']
    }
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
        sourceUuidDisplay: 'Compendium.fabricate.items.iron-ore',
        hasSourceUuid: true,
        sourceOrigin: 'compendium',
        sourceOriginLabel: 'Compendium',
        sourceMissing: false,
        showTags: true,
        showEssences: true,
        difficulty: 2,
        salvageSummary: { quantityRequired: 1, catalystCount: 1, resultGroupCount: 1, outcomeCount: 0, hasTimeRequirement: false, hasCurrencyRequirement: false }
      },
      {
        id: 'c2',
        name: 'Glass Vial',
        img: 'icons/containers/kitchenware/vase-clay-blue.webp',
        description: '',
        tags: ['container'],
        essences: [],
        sourceUuidDisplay: '',
        hasSourceUuid: false,
        sourceOrigin: 'unknown',
        sourceOriginLabel: 'Unknown',
        sourceMissing: false,
        showTags: true,
        showEssences: true
      },
      ...(options.extendedComponentCards ? [
        {
          id: 'c3',
          name: 'Nightshade With An Exceptionally Long Localized Component Name',
          img: 'icons/consumables/plants/nightshade.jpg',
          description: 'A dusky flowering herb used in careful doses.',
          tags: ['herb', 'night'],
          essences: [],
          sourceUuidDisplay: '',
          hasSourceUuid: false,
          sourceOrigin: 'unknown',
          sourceOriginLabel: 'Unknown',
          sourceMissing: false,
          showTags: true,
          showEssences: true
        },
        {
          id: 'c4',
          name: 'Coal',
          img: 'icons/commodities/materials/bowl-powder-black.webp',
          description: 'Fuel for a steady forge.',
          tags: ['fuel', 'mineral'],
          essences: [],
          sourceUuidDisplay: '',
          hasSourceUuid: false,
          sourceOrigin: 'unknown',
          sourceOriginLabel: 'Unknown',
          sourceMissing: false,
          showTags: true,
          showEssences: true
        },
        {
          id: 'c5',
          name: 'Moon Fern',
          img: 'icons/consumables/plants/leaf-green.webp',
          description: 'Soft fronds that glow under moonlight.',
          tags: ['herb', 'moon'],
          essences: [],
          sourceUuidDisplay: '',
          hasSourceUuid: false,
          sourceOrigin: 'unknown',
          sourceOriginLabel: 'Unknown',
          sourceMissing: false,
          showTags: true,
          showEssences: true
        },
        {
          id: 'c6',
          name: 'Crystal Dust',
          img: 'icons/commodities/gems/gem-powder-blue.webp',
          description: 'Fine shimmering mineral powder.',
          tags: ['mineral', 'crystal'],
          essences: [],
          sourceUuidDisplay: '',
          hasSourceUuid: false,
          sourceOrigin: 'unknown',
          sourceOriginLabel: 'Unknown',
          sourceMissing: false,
          showTags: true,
          showEssences: true
        },
        {
          id: 'c7',
          name: 'Sun Petal',
          img: 'icons/consumables/plants/flower-yellow.webp',
          description: 'A warm yellow flower used in tonics.',
          tags: ['herb', 'sun'],
          essences: [],
          sourceUuidDisplay: '',
          hasSourceUuid: false,
          sourceOrigin: 'unknown',
          sourceOriginLabel: 'Unknown',
          sourceMissing: false,
          showTags: true,
          showEssences: true
        },
        {
          id: 'c8',
          name: 'River Salt',
          img: 'icons/commodities/materials/powder-white.webp',
          description: 'Coarse salt gathered from river stones.',
          tags: ['mineral', 'water'],
          essences: [],
          sourceUuidDisplay: '',
          hasSourceUuid: false,
          sourceOrigin: 'unknown',
          sourceOriginLabel: 'Unknown',
          sourceMissing: false,
          showTags: true,
          showEssences: true
        }
      ] : [])
    ],
    smithing: [
      {
        id: 's1',
        name: 'Coal',
        img: 'icons/commodities/materials/bowl-powder-black.webp',
        description: 'Forge fuel.',
        tags: [],
        essences: [],
        sourceUuidDisplay: '',
        hasSourceUuid: false,
        sourceOrigin: 'unknown',
        sourceOriginLabel: 'Unknown',
        sourceMissing: false,
        showTags: false,
        showEssences: false
      }
    ]
  };
  const environmentDraft = {
    id: 'env-forest',
    craftingSystemId: 'alchemy',
    name: 'Moonlit Forest',
    description: 'Herbs and roots under old trees.',
    enabled: true,
    selectionMode: 'targeted',
    sceneUuid: 'Scene.forest',
    region: 'north',
    biomes: ['forest'],
    enabledTaskIds: ['task-herbs'],
    tasks: [{
      id: 'task-forage',
      name: 'Forage',
      description: '',
      img: '',
      enabled: true,
      resolutionMode: 'routed',
      catalysts: [{ componentId: 'c2', degradesOnUse: true, destroyWhenExhausted: false, maxUses: 3 }],
      resultSelection: { provider: 'macroOutcome', macroUuid: '' },
      resultGroups: [{
        id: 'group-common',
        name: 'Common',
        results: [{ id: 'result-herb', componentId: 'c1', quantity: 2 }]
      }]
    }]
  };
  const environments = options.emptyEnvironments ? [] : [
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
      tasks: [{
        id: 'task-prospect',
        name: 'Prospect',
        description: '',
        img: '',
        enabled: false,
        resolutionMode: 'progressive',
        catalysts: [],
        progressive: { awardMode: 'partial' },
        check: { provider: 'macro', macroUuid: '' },
        resultGroups: []
      }]
    }
  ];
  const selectedSystem = options.noSystems || options.selected === false ? null : systemDetails.alchemy;
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
        associatedItem: { id: 'c1', name: 'Iron Ore', img: 'icons/commodities/metal/ore-chunk-grey.webp' },
        associatedItemName: 'Iron Ore',
        sourceName: 'Iron Ore',
        sourceState: 'linked',
        componentUsageCount: 1,
        componentUsageItems: [
          { id: 'c1', name: 'Iron Ore', img: 'icons/commodities/metal/ore-chunk-grey.webp' }
        ],
        deleteBlocked: true
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
        deleteBlocked: false
      }
    ],
    smithing: []
  };
  const viewState = writable({
    systems: options.noSystems ? [] : [
      {
        id: 'alchemy',
        name: 'Alchemy',
        description: 'Potion and essence work',
        enabled: true,
        resolutionMode: 'alchemy',
        advancedOptionsEnabled: true,
        features: selectedFeatures,
        featureCount: 3,
        componentCount: alchemyManagedItemOptions.length,
        recipeCount: 2,
        selected: options.selected !== false
      },
      {
        id: 'smithing',
        name: 'Smithing',
        description: 'Heavy equipment work',
        enabled: false,
        resolutionMode: 'routed',
        advancedOptionsEnabled: false,
        features: systemDetails.smithing.features,
        featureCount: 1,
        componentCount: 6,
        recipeCount: 5,
        selected: false
      }
    ],
    systemsLoading: options.systemsLoading === true,
    selectedSystem,
    recipes: options.emptyRecipes ? [] : [
      {
        id: 'r1',
        name: 'Healing Draught',
        img: 'icons/consumables/potions/potion-bottle-corked-red.webp',
        description: 'Restores a small amount of health.',
        category: 'potions',
        enabled: true,
        locked: false,
        isSimple: true,
        structureLabel: 'Simple',
        stepCount: 1,
        resultGroupCount: 1,
        ingredientCount: 2,
        catalystCount: 1,
        requirementsPreview: [{ id: 'step-1', name: 'Step 1', ingredientSetCount: 1, ingredientCount: 2, catalystCount: 1, resultGroupCount: 1 }],
        visibilitySummary: 'All players',
        ingredients: new Array(2),
        catalysts: new Array(1)
      },
      {
        id: 'r2',
        name: 'Locked Elixir',
        img: 'icons/consumables/potions/potion-flask-corked-blue.webp',
        description: 'Requires special access.',
        category: 'elixirs',
        enabled: false,
        locked: true,
        isSimple: false,
        structureLabel: 'Single step',
        stepCount: 1,
        resultGroupCount: 2,
        ingredientCount: 3,
        catalystCount: 0,
        requirementsPreview: [{ id: 'step-1', name: 'Step 1', ingredientSetCount: 2, ingredientCount: 3, catalystCount: 0, resultGroupCount: 2 }],
        visibilitySummary: 'Restricted (none selected)',
        ingredients: new Array(3),
        catalysts: []
      }
    ],
    recipeCategories: [{ name: 'elixirs', count: 1 }, { name: 'potions', count: 1 }],
    recipeSearchTerm: '',
    itemSearchTerm: '',
    itemCards: selectedSystem ? componentCardsFor(selectedSystem.id) : [],
    essenceCards: selectedSystem ? (options.emptyEssences ? [] : essenceCardsBySystem[selectedSystem.id]) : [],
    showVisibilitySummary: true,
    canShowEnvironmentsTab: selectedFeatures.gathering === true,
    environments,
    environmentsLoading: false,
    environmentsError: null,
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
        timeOfDay: ['dawn', 'day', 'night']
      },
      systems: {
        alchemy: {
          conditions: {
            weather: {
              enabled: true,
              current: 'clear',
              values: [
                { id: 'clear', label: 'Clear Sky', icon: 'fas fa-sun' },
                { id: 'heavy-rain', label: 'Storm Rain', icon: 'fas fa-cloud-showers-heavy' }
              ]
            },
            timeOfDay: {
              enabled: true,
              current: 'day',
              values: [
                { id: 'dawn', label: 'First Light', icon: 'fas fa-cloud-sun' },
                { id: 'day', label: 'High Day', icon: 'fas fa-sun' },
                { id: 'night', label: 'Deep Night', icon: 'fas fa-moon' }
              ]
            }
          },
          vocabularies: {
            regions: {
              values: [
                { id: 'north', label: 'Northlands' },
                { id: 'south', label: 'South Coast' }
              ]
            },
            biomes: {
              values: [
                { id: 'forest', label: 'Moon Forest', icon: 'fas fa-tree', colorToken: 'sage', customColor: '' },
                { id: 'cavern', label: 'Crystal Cavern', icon: 'fas fa-gem', colorToken: 'mist', customColor: '#88AAFF' }
              ]
            }
          },
          rules: {
            rewardSelectionMode: options.rewardSelectionMode || 'highestRankedDrop',
            rewardLimit: 1,
            hazardSelectionMode: 'allDrops',
            hazardLimit: 1,
            hazardPolicy: 'successWithHazard'
          },
          tasks: options.emptyGatheringTasks ? [] : [
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
              toolIds: Array.isArray(options.taskInitialToolIds) ? options.taskInitialToolIds : [],
              dropRows: options.taskDropRows || [
                {
                  id: 'drop-nightshade',
                  componentId: 'c3',
                  quantity: 2,
                  dropRate: 80,
                  enabled: true,
                  conditionModifiers: {
                    timeOfDay: [
                      { id: 'night-bonus', conditionId: 'night', value: 20 },
                      { id: 'day-neutral', conditionId: 'day', value: 0 }
                    ],
                    weather: [{ id: 'clear-penalty', conditionId: 'clear', value: -15 }]
                  }
                }
              ]
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
                { id: 'drop-ore', componentId: 'c1', quantity: 1, dropRate: 45, enabled: true }
              ]
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
              dropRows: []
            }
          ],
          hazards: [],
          tools: options.gatheringLibraryTools || []
        }
      }
    }
  });

  function applySelectedSystem(id) {
    const nextSelected = systemDetails[id] || null;
    viewState.update(state => ({
      ...state,
      selectedSystem: nextSelected,
      itemCards: componentCardsFor(id),
      essenceCards: essenceCardsBySystem[id] || [],
      itemSearchTerm: '',
      canShowEnvironmentsTab: nextSelected?.features?.gathering === true,
      systems: state.systems.map(system => ({
        ...system,
        selected: system.id === id
      }))
    }));
  }

  function componentCardsFor(id) {
    if (options.emptyComponents) return [];
    return (componentItems[id] || []).map(item => (
      options.missingComponentSource && item.id === 'c1'
        ? { ...item, sourceMissing: true, sourceOrigin: 'missing', sourceOriginLabel: 'Missing' }
        : item
    ));
  }

  function applySystemEnabled(id, enabled) {
    if (systemDetails[id]) {
      systemDetails[id] = { ...systemDetails[id], enabled };
    }
    viewState.update(state => ({
      ...state,
      selectedSystem: state.selectedSystem?.id === id
        ? { ...state.selectedSystem, enabled }
        : state.selectedSystem,
      systems: state.systems.map(system =>
        system.id === id ? { ...system, enabled } : system
      )
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
    saveSystemDetails: (name, description, advancedOptionsEnabled) => calls.push(['saveSystemDetails', name, description, advancedOptionsEnabled]),
    setResolutionMode: async (mode) => {
      calls.push(['setResolutionMode', mode]);
      return options.resolutionModeResult ?? true;
    },
    toggleAdvancedOptions: (enabled) => {
      calls.push(['toggleAdvancedOptions', enabled]);
      return options.advancedOptionsResult ?? true;
    },
    toggleFeature: (feature, enabled) => {
      calls.push(['toggleFeature', feature, enabled]);
      return options.toggleFeatureResult ?? true;
    },
    createRecipe: () => calls.push(['createRecipe']),
    importRecipes: () => calls.push(['importRecipes']),
    exportRecipes: () => calls.push(['exportRecipes']),
    setRecipeSearch: (term) => calls.push(['setRecipeSearch', term]),
    toggleRecipeEnabled: (id, enabled) => calls.push(['toggleRecipeEnabled', id, enabled]),
    duplicateRecipe: (id) => calls.push(['duplicateRecipe', id]),
    deleteRecipe: (id) => calls.push(['deleteRecipe', id]),
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
    selectEnvironment: (id) => {
      calls.push(['selectEnvironment', id]);
      viewState.update(state => ({
        ...state,
        selectedEnvironmentId: id,
        environmentDraft: state.environments.find(environment => environment.id === id) || state.environmentDraft,
        environmentDraftDirty: false,
        environmentValidationState: options.environmentValidationState || null
      }));
      return viewState;
    },
    createEnvironmentDraft: () => {
      calls.push(['createEnvironmentDraft']);
      viewState.update(state => ({
        ...state,
        selectedEnvironmentId: 'env-new',
        environmentDraft: { ...environmentDraft, id: 'env-new', name: 'New Gathering Environment', enabled: false },
        environmentDraftDirty: true,
        environmentDraftIsNew: true
      }));
      return true;
    },
    updateEnvironmentDraft: (updates) => {
      calls.push(['updateEnvironmentDraft', updates]);
      viewState.update(state => ({
        ...state,
        environmentDraft: { ...state.environmentDraft, ...updates },
        environmentDraftDirty: true
      }));
    },
    confirmDiscardDirtyEnvironmentDraft: () => {
      calls.push(['confirmDiscardDirtyEnvironmentDraft']);
      return options.confirmDiscardResult ?? true;
    },
    cancelEnvironmentDraft: () => {
      calls.push(['cancelEnvironmentDraft']);
      viewState.update(state => ({
        ...state,
        environmentDraft: state.environments.find(environment => environment.id === state.selectedEnvironmentId) || environmentDraft,
        environmentDraftDirty: false,
        environmentDraftIsNew: false,
        environmentValidationState: null
      }));
    },
    saveEnvironmentDraft: () => calls.push(['saveEnvironmentDraft']),
    duplicateEnvironmentDraft: (id) => calls.push(['duplicateEnvironmentDraft', id]),
    deleteEnvironmentDraft: (id) => calls.push(['deleteEnvironmentDraft', id]),
    moveEnvironmentDraft: (id, direction) => calls.push(['moveEnvironmentDraft', id, direction]),
    toggleEnvironmentEnabled: (id, enabled) => calls.push(['toggleEnvironmentEnabled', id, enabled]),
    addEnvironmentTask: () => calls.push(['addEnvironmentTask']),
    selectEnvironmentTask: (id) => calls.push(['selectEnvironmentTask', id]),
    updateEnvironmentTask: (id, updates) => calls.push(['updateEnvironmentTask', id, updates]),
    duplicateEnvironmentTask: (id) => calls.push(['duplicateEnvironmentTask', id]),
    deleteEnvironmentTask: (id) => calls.push(['deleteEnvironmentTask', id]),
    moveEnvironmentTask: (id, direction) => calls.push(['moveEnvironmentTask', id, direction]),
    addEnvironmentTaskResultGroup: (id) => calls.push(['addEnvironmentTaskResultGroup', id]),
    updateEnvironmentTaskResultGroup: (...args) => calls.push(['updateEnvironmentTaskResultGroup', ...args]),
    deleteEnvironmentTaskResultGroup: (...args) => calls.push(['deleteEnvironmentTaskResultGroup', ...args]),
    moveEnvironmentTaskResultGroup: (...args) => calls.push(['moveEnvironmentTaskResultGroup', ...args]),
    addEnvironmentTaskResult: (...args) => calls.push(['addEnvironmentTaskResult', ...args]),
    updateEnvironmentTaskResult: (...args) => calls.push(['updateEnvironmentTaskResult', ...args]),
    deleteEnvironmentTaskResult: (...args) => calls.push(['deleteEnvironmentTaskResult', ...args]),
    moveEnvironmentTaskResult: (...args) => calls.push(['moveEnvironmentTaskResult', ...args]),
    addEnvironmentTaskCatalyst: (...args) => calls.push(['addEnvironmentTaskCatalyst', ...args]),
    updateEnvironmentTaskCatalyst: (...args) => calls.push(['updateEnvironmentTaskCatalyst', ...args]),
    deleteEnvironmentTaskCatalyst: (...args) => calls.push(['deleteEnvironmentTaskCatalyst', ...args]),
    updateEnvironmentTaskVisibility: (...args) => calls.push(['updateEnvironmentTaskVisibility', ...args]),
    updateEnvironmentTaskResultSelection: (...args) => calls.push(['updateEnvironmentTaskResultSelection', ...args]),
    updateEnvironmentTaskProgressive: (...args) => calls.push(['updateEnvironmentTaskProgressive', ...args]),
    updateEnvironmentTaskCheck: (...args) => calls.push(['updateEnvironmentTaskCheck', ...args]),
    updateEnvironmentTaskTimeRequirement: (...args) => calls.push(['updateEnvironmentTaskTimeRequirement', ...args]),
    updateEnvironmentTaskFailureOutcome: (...args) => calls.push(['updateEnvironmentTaskFailureOutcome', ...args]),
    updateGatheringConditions: (...args) => calls.push(['updateGatheringConditions', ...args]),
    toggleGatheringConditionEnabled: (...args) => calls.push(['toggleGatheringConditionEnabled', ...args]),
    addGatheringConditionValue: (...args) => calls.push(['addGatheringConditionValue', ...args]),
    updateGatheringConditionValue: (...args) => calls.push(['updateGatheringConditionValue', ...args]),
    deleteGatheringConditionValue: (...args) => calls.push(['deleteGatheringConditionValue', ...args]),
    addGatheringVocabularyValue: (...args) => calls.push(['addGatheringVocabularyValue', ...args]),
    updateGatheringVocabularyValue: (...args) => calls.push(['updateGatheringVocabularyValue', ...args]),
    deleteGatheringVocabularyValue: (...args) => calls.push(['deleteGatheringVocabularyValue', ...args]),
    addGatheringLibraryTask: (systemId) => {
      calls.push(['addGatheringLibraryTask', systemId]);
      return { id: 'task-new', name: 'New Gathering Task', dropRows: [] };
    },
    updateGatheringLibraryTask: (systemId, taskId, updates = {}) => {
      calls.push(['updateGatheringLibraryTask', systemId, taskId, updates]);
      viewState.update(state => {
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
                tasks: systemConfig.tasks.map(task => task.id === taskId ? { ...task, ...updates } : task)
              }
            }
          }
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
    updateToolInDraft: (toolId, patch = {}) => {
      calls.push(['updateToolInDraft', toolId, patch]);
      viewState.update(state => ({
        ...state,
        toolsDraft: Array.isArray(state.toolsDraft)
          ? state.toolsDraft.map(tool => tool.id === toolId ? { ...tool, ...patch } : tool)
          : state.toolsDraft,
        toolsDraftDirty: true,
        toolsDraftDirtyToolIds: Array.from(new Set([...(state.toolsDraftDirtyToolIds || []), toolId]))
      }));
      return true;
    },
    deleteToolFromDraft: (...args) => calls.push(['deleteToolFromDraft', ...args]),
    selectDraftTool: (...args) => calls.push(['selectDraftTool', ...args]),
    setExpandedDraftTool: (id = '') => {
      calls.push(['setExpandedDraftTool', id]);
      viewState.update(state => ({
        ...state,
        toolsDraftExpandedToolId: id
      }));
      return true;
    },
    validateToolDraft: (toolId) => {
      calls.push(['validateToolDraft', toolId]);
      return options.toolValidationById?.[toolId] || { valid: true, errors: [] };
    },
    saveToolDraft: (toolId) => {
      calls.push(['saveToolDraft', toolId]);
      viewState.update(state => ({
        ...state,
        toolsDraftDirtyToolIds: (state.toolsDraftDirtyToolIds || []).filter(id => id !== toolId),
        toolsDraftDirty: (state.toolsDraftDirtyToolIds || []).filter(id => id !== toolId).length > 0
      }));
      return true;
    },
    saveAllDirtyToolDrafts: () => {
      calls.push(['saveAllDirtyToolDrafts']);
      viewState.update(state => ({
        ...state,
        toolsDraftDirtyToolIds: [],
        toolsDraftDirty: false
      }));
      return options.saveAllDirtyToolDraftsResult ?? true;
    },
    saveToolsDraft: () => calls.push(['saveToolsDraft']),
    isToolsDraftDirty: () => options.toolsDraftDirty === true || get(viewState).toolsDraftDirty === true,
    confirmDiscardDirtyToolsDraft: () => {
      calls.push(['confirmDiscardDirtyToolsDraft']);
      return options.confirmDiscardDirtyToolsResult ?? true;
    },
    cancelToolsDraft: () => {
      if (options.trackCancelToolsDraft) calls.push(['cancelToolsDraft']);
      return true;
    }
  };
}

describe('CraftingSystemManager mounted behavior', () => {
  before(async () => {
    setupDOM();
    globalThis.Text = document.createTextNode('').constructor;
    globalThis.Comment = document.createComment('').constructor;
    globalThis.game = {
      i18n: {
        localize: (key) => key,
        format: (key) => key
      }
    };
    tempRoot = mkdtempSync(join(tmpdir(), 'fabricate-manager-'));
    symlinkSync(resolve(repoRoot, 'node_modules'), join(tempRoot, 'node_modules'), 'junction');
    compileManagerRoot();
    Component = (await import(pathToFileURL(join(
      tempRoot,
      'src/ui/svelte/apps/manager/CraftingSystemManagerRoot.svelte.js'
    )))).default;
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
        services: { openCurrentAdmin: () => {} }
      }
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
      Array.from(target.querySelectorAll('.manager-nav-label')).map(label => label.textContent.trim()),
      ['System settings', 'Recipes', 'Components', 'Tags & Categories', 'Essences', 'Tools', 'Gathering', 'Rules', 'Graph']
    );
    assert.equal(
      Array.from(target.querySelectorAll('.manager-header-actions .manager-button'))
        .some(button => button.textContent.includes('Open current admin')),
      false,
      'system library header should not expose the legacy admin launch button'
    );
    const systemSettingsNav = Array.from(target.querySelectorAll('.manager-nav-button'))
      .find(button => button.querySelector('.manager-nav-label')?.textContent.trim() === 'System settings');
    assert.ok(systemSettingsNav, 'system settings nav button should render');
    assert.equal(systemSettingsNav.querySelector('.manager-nav-count'), null, 'system settings nav should not show an Edit badge');
    const toolsNav = Array.from(target.querySelectorAll('.manager-nav-button'))
      .find(button => button.querySelector('.manager-nav-label')?.textContent.trim() === 'Tools');
    assert.equal(toolsNav.querySelector('.manager-nav-count')?.textContent.trim(), '0');
    assert.ok(target.textContent.includes('Alchemy'));
    assert.ok(target.textContent.includes('Potion and essence work'));
    assert.ok(target.textContent.includes('4'));
    assert.ok(target.textContent.includes('2'));

    const environmentFact = target.querySelector('[data-count-id="environments"]');
    assert.equal(environmentFact.textContent.trim().replace(/\s+/g, ' '), '2 Gathering environments');
    assert.equal(environmentFact.querySelector('.manager-fact-leading')?.textContent.trim(), '2 Gathering');
    assert.equal(environmentFact.querySelector('.manager-fact-label')?.textContent.trim(), 'environments');

    const systemHeroRow = target.querySelector('.manager-inspector .manager-inspector-title-row.is-hero-large');
    assert.ok(systemHeroRow, 'systems inspector should use the prominent hero title row');
    assert.ok(systemHeroRow.querySelector('.manager-inspector-icon.is-hero-large'), 'systems inspector hero should render the icon at hero-large size');
  });

  it('renders Systems Library current gathering condition shortcuts for enabled dimensions', () => {
    const calls = [];
    target = document.createElement('div');
    document.body.appendChild(target);
    mounted = mount(Component, {
      target,
      props: {
        store: createStore(calls),
        services: { openCurrentAdmin: () => {} }
      }
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
      Array.from(card.querySelectorAll('[data-systems-gathering-condition="weather"] option')).map(option => option.textContent),
      ['Clear Sky', 'Storm Rain']
    );

    const weatherSelect = card.querySelector('[data-systems-gathering-condition="weather"] select');
    weatherSelect.value = 'heavy-rain';
    weatherSelect.dispatchEvent(new Event('change', { bubbles: true }));
    flushSync();

    assert.deepEqual(
      calls.find(call => call[0] === 'updateGatheringConditions'),
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
            recipeCategories: true
          }
        }),
        services: { openCurrentAdmin: () => {} }
      }
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
                  weather: { enabled: false, current: 'clear', values: [{ id: 'clear', label: 'Clear Sky', icon: 'fas fa-sun' }] },
                  timeOfDay: { enabled: false, current: 'day', values: [{ id: 'day', label: 'High Day', icon: 'fas fa-sun' }] }
                }
              }
            }
          }
        }),
        services: { openCurrentAdmin: () => {} }
      }
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
                      { id: 'heavy-rain', label: 'Storm Rain', icon: 'fas fa-cloud-showers-heavy' }
                    ]
                  },
                  timeOfDay: { enabled: false, current: 'day', values: [{ id: 'day', label: 'High Day', icon: 'fas fa-sun' }] }
                }
              }
            }
          }
        }),
        services: { openCurrentAdmin: () => {} }
      }
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
        services: { openCurrentAdmin: () => {} }
      }
    });
    flushSync();

    const navLabels = Array.from(target.querySelectorAll('.manager-nav-label')).map(label => label.textContent.trim());
    assert.deepEqual(navLabels, []);
    assert.ok(target.textContent.includes('Crafting Systems'));
    assert.ok(target.textContent.includes('No crafting systems yet'));
    assert.ok(target.textContent.includes('Set up your first system'));
    assert.ok(target.textContent.includes('Create a system for one crafting discipline or ruleset.'));
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
        services: { openCurrentAdmin: () => {} }
      }
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
        services: { openCurrentAdmin: () => {} }
      }
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
    assert.equal(target.querySelector('[data-system-id="alchemy"]').getAttribute('aria-selected'), 'true');
    assert.equal(target.querySelector('[data-system-id="smithing"]').getAttribute('aria-selected'), 'false');
    assert.equal(target.querySelector('[aria-label="Disable Smithing"]').getAttribute('aria-pressed'), 'true');

    const alchemyToggle = target.querySelector('[aria-label="Disable Alchemy"]');
    assert.ok(alchemyToggle, 'active system row should expose a disable toggle');
    alchemyToggle.click();
    await tick();
    flushSync();

    assert.deepEqual(calls.slice(-1), [['toggleSystemEnabled', 'alchemy', false]]);
    assert.equal(target.querySelector('[aria-label="Enable Alchemy"]').getAttribute('aria-pressed'), 'false');
  });

  it('feature-gates selected-system placeholder navigation', () => {
    target = document.createElement('div');
    document.body.appendChild(target);
    mounted = mount(Component, {
      target,
      props: {
        store: createStore([], { selectedFeatures: {} }),
        services: { openCurrentAdmin: () => {} }
      }
    });
    flushSync();

    assert.deepEqual(
      Array.from(target.querySelectorAll('.manager-nav-label')).map(label => label.textContent.trim()),
      ['System settings', 'Recipes', 'Components', 'Tags & Categories', 'Tools', 'Rules', 'Graph']
    );

    const environmentFact = target.querySelector('[data-count-id="environments"]');
    assert.equal(environmentFact.textContent.trim().replace(/\s+/g, ' '), 'Gathering environments Off');
    assert.equal(environmentFact.querySelector('.manager-fact-label')?.textContent.trim(), 'Gathering environments');
    assert.equal(environmentFact.querySelector('strong.is-disabled')?.textContent.trim(), 'Off');
  });

  it('routes selected-system breadcrumb to settings and returns to system library without clearing selection', async () => {
    const calls = [];
    target = document.createElement('div');
    document.body.appendChild(target);
    mounted = mount(Component, {
      target,
      props: {
        store: createStore(calls),
        services: { openCurrentAdmin: () => {} }
      }
    });
    flushSync();

    navButton('Recipes').click();
    await tick();
    flushSync();
    assert.equal(target.querySelector('.fabricate-manager').dataset.managerView, 'recipes');

    const systemCrumb = Array.from(target.querySelectorAll('.manager-breadcrumbs button'))
      .find(button => button.textContent.trim() === 'Alchemy');
    systemCrumb.click();
    await Promise.resolve();
    await tick();
    flushSync();

    assert.equal(target.querySelector('.fabricate-manager').dataset.managerView, 'system-edit');
    assert.ok(target.querySelector('.manager-system-edit-form'));

    const scopeCard = target.querySelector('.manager-scope-card');
    assert.ok(scopeCard, 'selected system scope card should render');
    assert.equal(scopeCard.querySelector('.manager-scope-name')?.textContent.trim(), 'Alchemy');
    assert.equal(scopeCard.querySelector('.manager-scope-name')?.tagName, 'SPAN');
    const returnButton = scopeCard.querySelector('.manager-scope-return');
    assert.ok(returnButton, 'selected system scope should expose a return-to-library button');
    assert.equal(returnButton.getAttribute('aria-label'), 'Return to System Library');
    assert.equal(returnButton.getAttribute('title'), 'Return to System Library');

    const callsBeforeScopeNameClick = calls.length;
    scopeCard.querySelector('.manager-scope-name').dispatchEvent(new MouseEvent('click', { bubbles: true }));
    await tick();
    flushSync();
    assert.equal(calls.length, callsBeforeScopeNameClick, 'clicking the selected system name should not route or clear selection');
    assert.equal(target.querySelector('.fabricate-manager').dataset.managerView, 'system-edit');

    const callsBeforeReturn = calls.length;
    returnButton.click();
    await Promise.resolve();
    await tick();
    flushSync();

    assert.equal(calls.length, callsBeforeReturn, 'returning to system library should not call selectSystem');
    assert.equal(target.querySelector('.fabricate-manager').dataset.managerView, 'systems');
    assert.ok(target.querySelector('.manager-scope-card'), 'selected system scope should remain visible');
    assert.equal(target.querySelector('[data-system-id="alchemy"]').getAttribute('aria-selected'), 'true');
    assert.deepEqual(
      Array.from(target.querySelectorAll('.manager-nav-label')).map(label => label.textContent.trim()),
      ['System settings', 'Recipes', 'Components', 'Tags & Categories', 'Essences', 'Tools', 'Gathering', 'Rules', 'Graph']
    );
    assert.ok(target.textContent.includes('System library'));
  });

  it('routes to the recipes browser with selected recipe inspector and actions', async () => {
    const calls = [];
    const edited = [];
    target = document.createElement('div');
    document.body.appendChild(target);
    mounted = mount(Component, {
      target,
      props: {
        store: createStore(calls),
        services: {
          openCurrentAdmin: () => {},
          onEditRecipe: (id) => edited.push(id)
        }
      }
    });
    flushSync();

    navButton('Recipes').click();
    await tick();
    flushSync();

    assert.equal(target.querySelector('.fabricate-manager').dataset.managerView, 'recipes');
    assert.equal(target.querySelectorAll('.manager-recipe-row').length, 2);
    assert.ok(target.textContent.includes('Recipe library'));
    assert.ok(target.textContent.includes('Healing Draught'));
    assert.ok(target.textContent.includes('Restores a small amount of health.'));
    assert.ok(target.textContent.includes('Requirements'));
    assert.ok(target.textContent.includes('Player visibility'));
    const enabledRecipeToggle = target.querySelector('[data-recipe-id="r1"] .manager-status-toggle');
    const disabledRecipeToggle = target.querySelector('[data-recipe-id="r2"] .manager-status-toggle');
    assert.ok(enabledRecipeToggle, 'enabled recipe row should render the shared status toggle');
    assert.ok(disabledRecipeToggle, 'disabled recipe row should render the shared status toggle');
    assert.equal(enabledRecipeToggle.getAttribute('aria-pressed'), 'true');
    assert.equal(disabledRecipeToggle.getAttribute('aria-pressed'), 'false');
    assert.equal(enabledRecipeToggle.querySelector('.manager-status-toggle-label').textContent.trim(), 'On');
    assert.equal(disabledRecipeToggle.querySelector('.manager-status-toggle-label').textContent.trim(), 'Off');
    assert.equal(target.querySelector('[data-recipe-id="r2"] .manager-toggle input[type="checkbox"]'), null);

    target.querySelector('[data-recipe-id="r2"] .manager-recipe-identity').click();
    await tick();
    flushSync();
    assert.ok(target.querySelector('[data-recipe-id="r2"]').classList.contains('is-selected'));
    assert.ok(target.textContent.includes('Locked Elixir'));
    assert.ok(target.textContent.includes('Restricted (none selected)'));

    assert.equal(target.querySelector('.manager-pagination'), null, 'pagination should hide while filtered row count is below the page size');

    assert.equal(target.querySelector('[data-clear-filters="recipes"]'), null, 'Clear filters should hide while no filter is active');
    const recipeStatusFilterSelect = target.querySelector('[aria-label="Filter recipes by status"]');
    recipeStatusFilterSelect.value = 'disabled';
    recipeStatusFilterSelect.dispatchEvent(new Event('change', { bubbles: true }));
    await tick();
    flushSync();
    const recipeClearButton = target.querySelector('[data-clear-filters="recipes"]');
    assert.ok(recipeClearButton, 'Clear filters should appear when a recipe filter is active');
    recipeClearButton.click();
    await tick();
    flushSync();
    assert.equal(target.querySelector('[data-clear-filters="recipes"]'), null, 'Clear filters should hide after resetting filters');
    assert.equal(target.querySelector('[aria-label="Filter recipes by status"]').value, 'all');

    const editAction = target.querySelector('[data-recipe-action="edit"]');
    assert.ok(editAction, 'recipe inspector should expose an Edit action');
    assert.ok(editAction.classList.contains('is-primary'), 'Edit recipe should be the primary inspector action');
    assert.ok(target.querySelector('[data-recipe-action="duplicate"]'), 'recipe inspector should expose a Duplicate action');
    assert.ok(target.querySelector('[data-recipe-action="delete"]'), 'recipe inspector should expose a Delete action');
    assert.ok(target.querySelector('[data-recipe-fact="structure"]'), 'recipe inspector should expose a Structure fact');
    assert.ok(target.querySelector('[data-recipe-fact="result-groups"]'), 'recipe inspector should expose a Result groups fact');
    const heroRow = target.querySelector('.manager-inspector-title-row.is-hero-large');
    assert.ok(heroRow, 'recipe inspector should use the prominent hero title row');
    assert.ok(heroRow.querySelector('.manager-recipe-preview'), 'recipe inspector hero should render the recipe preview image');

    const search = target.querySelector('.manager-toolbar input[type="search"]');
    search.value = 'elixir';
    search.dispatchEvent(new Event('input', { bubbles: true }));

    target.querySelector('[data-recipe-id="r2"] .manager-status-toggle').click();

    target.querySelector('[data-recipe-id="r2"] .manager-icon-button').click();
    target.querySelector('[data-recipe-id="r2"] .manager-icon-button:nth-of-type(2)').click();
    target.querySelector('[data-recipe-id="r2"] .manager-icon-button:nth-of-type(3)').click();
    target.querySelector('.manager-header-actions .manager-button:nth-child(1)').click();
    target.querySelector('.manager-header-actions .manager-button:nth-child(2)').click();
    target.querySelector('.manager-header-actions .manager-button:nth-child(3)').click();

    assert.deepEqual(edited, ['r2']);
    assert.deepEqual(calls.slice(-5), [
      ['duplicateRecipe', 'r2'],
      ['deleteRecipe', 'r2'],
      ['importRecipes'],
      ['exportRecipes'],
      ['createRecipe']
    ]);
    assert.ok(calls.some(call => call[0] === 'setRecipeSearch' && call[1] === 'elixir'));
    assert.ok(calls.some(call => call[0] === 'toggleRecipeEnabled' && call[1] === 'r2' && call[2] === true));
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
          onCopySourceUuid: (uuid) => copied.push(uuid)
        }
      }
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
    const compactEssenceChip = target.querySelector('[data-component-id="c1"] .manager-essence-compact-chip');
    assert.equal(compactEssenceChip?.textContent.trim(), '2', 'essence row should show only compact quantity text');
    assert.equal(compactEssenceChip?.getAttribute('aria-label'), 'Earth 2', 'compact essence chip should expose the essence name and quantity accessibly');
    assert.equal(target.textContent.includes('Usage evidence'), false);
    assert.equal(target.textContent.includes('Evidence'), false);
    assert.equal(target.textContent.includes('Progressive difficulty'), false);

    const search = target.querySelector('.manager-toolbar input[type="search"]');
    search.value = 'iron';
    search.dispatchEvent(new Event('input', { bubbles: true }));

    assert.equal(target.querySelector('[aria-label="Filter components by tag"]'), null, 'component tag filtering should use searchable pills, not the legacy dropdown');

    const tagSearch = target.querySelector('[aria-label="Search component tags"]');
    assert.ok(tagSearch, 'component tag search should render when component tags are available');
    tagSearch.value = 'con';
    tagSearch.dispatchEvent(new Event('input', { bubbles: true }));
    await tick();
    flushSync();
    const containerSuggestion = Array.from(target.querySelectorAll('.manager-tag-suggestion'))
      .find(button => button.textContent.includes('container'));
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
    assert.ok(primaryToolbarRow.contains(tagSearchControl), 'tag search control should stay in the primary toolbar row');
    assert.equal(selectedTagRow?.parentElement, componentToolbar, 'selected tag pills should render in a toolbar sibling row');
    assert.equal(tagSearchControl.contains(containerPill), false, 'selected tag pills should not live inside the tag search control');

    containerPill.querySelector('button').click();
    await tick();
    flushSync();
    assert.equal(target.querySelectorAll('.manager-component-row').length, 2);

    tagSearch.value = 'ore';
    tagSearch.dispatchEvent(new Event('input', { bubbles: true }));
    await tick();
    flushSync();
    Array.from(target.querySelectorAll('.manager-tag-suggestion'))
      .find(button => button.textContent.includes('ore'))
      .click();
    await tick();
    flushSync();
    tagSearch.value = 'metal';
    tagSearch.dispatchEvent(new Event('input', { bubbles: true }));
    await tick();
    flushSync();
    Array.from(target.querySelectorAll('.manager-tag-suggestion'))
      .find(button => button.textContent.includes('metal'))
      .click();
    await tick();
    flushSync();
    assert.equal(target.querySelectorAll('.manager-component-row').length, 1, 'multiple selected tags should require all tags');
    assert.ok(target.textContent.includes('Iron Ore'));

    target.querySelector('[data-component-tag-pill="ore"]').dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true }));
    await tick();
    flushSync();
    assert.equal(target.querySelector('[data-component-tag-pill="ore"]'), null, 'right-clicking a tag pill should remove it');

    target.querySelector('[data-clear-filters="components"]').click();
    await tick();
    flushSync();
    assert.equal(target.querySelector('[data-component-tag-pill="metal"]'), null, 'clear filters should remove selected tag pills');
    assert.equal(target.querySelectorAll('.manager-component-row').length, 2);

    target.querySelector('[data-component-id="c1"] .manager-component-identity').click();
    await tick();
    flushSync();
    assert.ok(target.querySelector('[data-component-id="c1"]').classList.contains('is-selected'));
    assert.equal(target.textContent.includes('Compendium.fabricate.items.iron-ore'), false, 'raw source UUID should not render as inspector text');

    const copySourceAction = target.querySelector('[data-component-action="copy-source"]');
    assert.ok(copySourceAction, 'component inspector should expose a copy source action');
    assert.equal(copySourceAction.getAttribute('title'), 'Compendium.fabricate.items.iron-ore');
    copySourceAction.click();
    flushSync();
    assert.equal(target.querySelector('[data-component-action="edit"]'), null, 'component inspector should not duplicate row edit action');
    assert.equal(target.querySelector('[data-component-action="delete"]'), null, 'component inspector should not duplicate row delete action');
    assert.ok(target.querySelector('[data-component-section="source"]'), 'component inspector should expose a Source section');
    assert.equal(target.querySelector('[data-component-source-missing]'), null, 'resolved source should not show a missing-source warning');
    const componentHeroRow = target.querySelector('.manager-inspector-title-row.is-hero-large');
    assert.ok(componentHeroRow, 'component inspector should use the prominent hero title row');
    assert.ok(componentHeroRow.querySelector('.manager-component-preview'), 'component inspector hero should render the component preview image');

    const dropEvent = new Event('drop', { bubbles: true, cancelable: true });
    Object.defineProperty(dropEvent, 'dataTransfer', {
      value: { getData: () => JSON.stringify({ type: 'Item', uuid: 'Item.dropped' }) }
    });
    target.querySelector('.manager-component-drop-zone').dispatchEvent(dropEvent);

    target.querySelector('[data-component-id="c1"] [aria-label="Edit Iron Ore"]').click();
    flushSync();
    await tick();
    flushSync();
    assert.equal(target.querySelector('.fabricate-manager').dataset.managerView, 'component-edit', 'row Edit action should route into the manager component-edit view');
    Array.from(target.querySelectorAll('.manager-breadcrumbs button')).find(button => button.textContent.trim() === 'Components').click();
    flushSync();
    await tick();
    flushSync();
    assert.equal(target.querySelector('.fabricate-manager').dataset.managerView, 'components', 'breadcrumb Components button should return to the components browser');
    target.querySelector('[data-component-id="c1"] [aria-label="Delete Iron Ore"]').click();

    assert.deepEqual(dropped, [{ type: 'Item', uuid: 'Item.dropped' }]);
    assert.deepEqual(copied, ['Compendium.fabricate.items.iron-ore']);
    assert.deepEqual(edited, [], 'manager row Edit should no longer call the legacy services.onEditComponent');
    assert.ok(calls.some(call => call[0] === 'setItemSearch' && call[1] === 'iron'));
    assert.ok(calls.some(call => call[0] === 'deleteComponent' && call[1] === 'c1'));
  });

  it('shows progressive difficulty only for progressive component systems and warns for missing sources', async () => {
    target = document.createElement('div');
    document.body.appendChild(target);
    mounted = mount(Component, {
      target,
      props: {
        store: createStore([], { alchemyResolutionMode: 'progressive', missingComponentSource: true }),
        services: { openCurrentAdmin: () => {}, onDropItem: () => {}, onCopySourceUuid: () => {} }
      }
    });
    flushSync();

    navButton('Components').click();
    await tick();
    flushSync();

    assert.ok(target.textContent.includes('Progressive difficulty'));
    assert.ok(target.textContent.includes('Missing'));

    target.querySelector('[data-component-id="c1"] .manager-component-identity').click();
    await tick();
    flushSync();

    assert.ok(target.querySelector('[data-component-source-missing]'), 'missing stored source should show a warning callout');
    assert.equal(target.textContent.includes('Compendium.fabricate.items.iron-ore'), false, 'missing source warning should not print the raw UUID');
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
          onOpenSource: (uuid) => opened.push(uuid)
        }
      }
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
    assert.equal(root.dataset.managerView, 'component-edit', 'row Edit should land on the component-edit route');
    assert.ok(target.textContent.includes('Edit component'), 'header should show the Edit component title');
    assert.ok(target.querySelector('[data-component-edit-tab="details"].is-active'), 'Details tab should be active by default');
    assert.ok(target.querySelector('[data-component-edit-section="identity"]'), 'Identity card should render on the Details tab');
    assert.ok(target.querySelector('[data-component-edit-section="source"]'), 'Linked Source Item card should render on the Details tab');

    target.querySelector('[data-component-edit-action="open-source"]').click();
    flushSync();
    assert.deepEqual(opened, ['Compendium.fabricate.items.iron-ore'], 'Open Source Item should call onOpenSource with the stored UUID');

    target.querySelector('[data-component-edit-action="unlink-source"]').click();
    flushSync();
    assert.deepEqual(unlinked, ['c1'], 'Unlink Source Item should call onUnlinkSource with the component id');

    const dropEvent = new Event('drop', { bubbles: true, cancelable: true });
    Object.defineProperty(dropEvent, 'dataTransfer', {
      value: { getData: () => JSON.stringify({ type: 'Item', uuid: 'Item.replacement' }) }
    });
    target.querySelector('[data-component-edit-action="replace-source"]').dispatchEvent(dropEvent);
    flushSync();
    assert.deepEqual(replaced, [{ itemId: 'c1', data: { type: 'Item', uuid: 'Item.replacement' } }], 'drop should route through onReplaceSource for the active component');

    target.querySelector('[data-component-edit-tab="tags-essences"]').click();
    flushSync();
    await tick();
    flushSync();

    assert.ok(target.querySelector('[data-component-edit-tab="tags-essences"].is-active'), 'Tags & Essences tab should activate on click');
    assert.ok(target.querySelector('[data-component-edit-section="tags"]'), 'Tags section should render');
    assert.ok(target.querySelector('[data-component-edit-section="essences"]'), 'Essences section should render');

    const mineralCheckbox = Array.from(target.querySelectorAll('.manager-component-tag-option'))
      .find(label => label.textContent.includes('mineral'));
    assert.ok(mineralCheckbox, 'tag checkboxes should render for the system itemTags');
    const mineralInput = mineralCheckbox.querySelector('input[type="checkbox"]');
    mineralInput.checked = true;
    mineralInput.dispatchEvent(new Event('change', { bubbles: true }));
    flushSync();
    await tick();
    flushSync();

    assert.ok(target.textContent.includes('Unsaved'), 'dirty indicator should appear after a tag change');

    const saveButton = target.querySelector('button[form="manager-component-edit-form"]');
    assert.ok(saveButton, 'header save submit should target the edit form');
    assert.equal(saveButton.disabled, false, 'save should be enabled when the draft is dirty');
    saveButton.click();
    flushSync();
    await tick();
    flushSync();
    await tick();
    flushSync();

    const updateCall = calls.find(call => call[0] === 'updateComponent');
    assert.ok(updateCall, 'save should call store.updateComponent');
    assert.equal(updateCall[1], 'c1');
    assert.equal(Array.isArray(updateCall[2].tags) && updateCall[2].tags.includes('mineral'), true, 'tags update should include the newly checked tag');
    assert.equal(target.querySelector('.fabricate-manager').dataset.managerView, 'components', 'successful save should return to the components browser');
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
          }
        }
      }
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
    assert.ok(howItWorksCard.textContent.includes('flat'), 'How-it-works should explain that categories are flat');
    assert.ok(howItWorksCard.textContent.includes('General'), 'How-it-works should explain reserved General');
    assert.ok(howItWorksCard.textContent.includes('tag'), 'How-it-works should mention item tags');

    const examplesCard = target.querySelector('[data-tags-evidence="examples"]');
    assert.ok(examplesCard, 'tags inspector should render an Examples evidence card');

    const categoryInput = target.querySelector('#manager-category-add');
    categoryInput.value = 'General';
    categoryInput.dispatchEvent(new Event('input', { bubbles: true }));
    target.querySelector('[aria-label="Recipe categories"] form').dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    await tick();
    flushSync();
    assert.ok(target.textContent.includes('General is already available as the base category.'));
    assert.ok(!calls.some(call => call[0] === 'addCategory'));

    categoryInput.value = 'Elixirs';
    categoryInput.dispatchEvent(new Event('input', { bubbles: true }));
    target.querySelector('[aria-label="Recipe categories"] form').dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    await tick();
    await tick();
    flushSync();
    assert.ok(calls.some(call => call[0] === 'addCategory' && call[1] === 'Elixirs'));
    assert.equal(categoryInput.value, '');
    assert.equal(document.activeElement, categoryInput);

    const tagInput = target.querySelector('#manager-tag-add');
    tagInput.value = 'SPICE';
    tagInput.dispatchEvent(new Event('input', { bubbles: true }));
    target.querySelector('[aria-label="Item tags"] form').dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    await tick();
    await tick();
    flushSync();
    assert.ok(calls.some(call => call[0] === 'addTag' && call[1] === 'spice'));
    assert.ok(target.textContent.includes('Tag added with cleaned-up lowercase text.'));
    assert.equal(tagInput.value, '');
    assert.equal(document.activeElement, tagInput);

    target.querySelector('[aria-label="Remove category potions"]').click();
    await tick();
    flushSync();
    assert.deepEqual(confirmations[0]?.slice(0, 2), ['category', 'potions']);
    assert.ok(!calls.some(call => call[0] === 'removeCategory' && call[1] === 'potions'));

    target.querySelector('[aria-label="Remove tag ore"]').click();
    await tick();
    flushSync();
    assert.deepEqual(confirmations[1]?.slice(0, 2), ['tag', 'ore']);
    assert.ok(!calls.some(call => call[0] === 'removeTag' && call[1] === 'ore'));

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
          addTagReject: true
        }),
        services: { openCurrentAdmin: () => {} }
      }
    });
    flushSync();

    navButton('Tags & Categories').click();
    await tick();
    flushSync();

    const categoryInput = target.querySelector('#manager-category-add');
    categoryInput.value = 'Elixirs';
    categoryInput.dispatchEvent(new Event('input', { bubbles: true }));
    target.querySelector('[aria-label="Recipe categories"] form').dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    await tick();
    await tick();
    flushSync();
    assert.ok(calls.some(call => call[0] === 'addCategory' && call[1] === 'Elixirs'));
    assert.equal(categoryInput.value, 'Elixirs');
    assert.equal(document.activeElement, categoryInput);
    assert.ok(target.textContent.includes('Category could not be added.'));

    const tagInput = target.querySelector('#manager-tag-add');
    tagInput.value = 'SPICE';
    tagInput.dispatchEvent(new Event('input', { bubbles: true }));
    target.querySelector('[aria-label="Item tags"] form').dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    await tick();
    await tick();
    flushSync();
    assert.ok(calls.some(call => call[0] === 'addTag' && call[1] === 'spice'));
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
          importSingleManagedItemFromDrop: async () => ({ id: 'c2', name: 'Glass Vial', img: 'icons/consumables/potions/vial-corked-blue.webp' })
        }
      }
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
    const linkedSourceImage = target.querySelector('[data-essence-id="earth"] .manager-essence-source-cell-image');
    assert.ok(linkedSourceImage, 'linked essence Source column should render image evidence');
    assert.equal(linkedSourceImage.title, 'Iron Ore');
    assert.equal(linkedSourceImage.getAttribute('aria-label'), 'Iron Ore');
    assert.ok(target.querySelector('[data-essence-id="water"] .manager-essence-source-cell').textContent.includes('None'));
    assert.ok(target.textContent.includes('Deletion blocked'));
    assert.equal(target.querySelectorAll('.manager-essence-usage-item').length, 1);
    assert.equal(target.querySelector('.manager-essence-usage-item').title, 'Iron Ore');
    target.querySelector('.manager-essence-usage-item').click();
    flushSync();
    await tick();
    flushSync();
    assert.equal(target.querySelector('.fabricate-manager').dataset.managerView, 'component-edit', 'essence usage thumbnail should route to the manager component-edit view');
    assert.deepEqual(editedComponents, [], 'essence usage thumbnail should no longer launch the legacy services.onEditComponent');
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

    assert.equal(target.querySelector('[data-essence-action="edit"]'), null, 'essence inspector should not duplicate row Edit actions');
    assert.equal(target.querySelector('[data-essence-action="delete"]'), null, 'essence inspector should not duplicate row Delete actions');
    assert.ok(target.querySelector('[data-essence-section="usage"]'), 'essence inspector should expose a Usage section');
    assert.ok(target.querySelector('[data-essence-section="source"] .manager-essence-source-drop-zone .essence-source-trigger'), 'unlinked selected essence should expose a source drop zone');
    const essenceHeroRow = target.querySelector('.manager-inspector-title-row.is-hero-large');
    assert.ok(essenceHeroRow, 'essence inspector should use the prominent hero title row');
    assert.ok(essenceHeroRow.querySelector('.manager-inspector-icon.is-hero-large'), 'essence inspector hero should render the icon at hero-large size');

    const inspectorDropEvent = new Event('drop', { bubbles: true, cancelable: true });
    Object.defineProperty(inspectorDropEvent, 'dataTransfer', {
      value: { getData: () => JSON.stringify({ type: 'Item', uuid: 'Item.glass-vial' }) }
    });
    target.querySelector('[data-essence-section="source"] .essence-source-trigger').dispatchEvent(inspectorDropEvent);
    await tick();
    await tick();
    flushSync();
    assert.ok(calls.some(call => call[0] === 'updateEssence' && call[1] === 'water' && call[2].sourceComponentId === 'c2'));

    target.querySelector('[data-essence-id="earth"]').click();
    await tick();
    flushSync();
    const inspectorSourceSummary = target.querySelector('[data-essence-section="source"] .manager-essence-inspector-source-summary');
    assert.ok(inspectorSourceSummary, 'linked selected essence should render a source summary card');
    assert.equal(inspectorSourceSummary.querySelectorAll('.manager-essence-source-thumb').length, 1, 'linked selected essence should show one source thumbnail');
    assert.ok(inspectorSourceSummary.querySelector('.manager-essence-source-copy').textContent.includes('Iron Ore'), 'linked selected essence should keep the source name readable');
    assert.equal(inspectorSourceSummary.querySelector('.manager-essence-source-copy').textContent.includes('c1'), false, 'linked selected essence should not print UUID evidence under the item name');
    const inspectorSourceActions = target.querySelector('[data-essence-section="source"] .manager-essence-inspector-source-actions');
    assert.ok(inspectorSourceActions, 'linked selected essence should expose source actions below the item card');
    assert.equal(inspectorSourceSummary.contains(inspectorSourceActions), false, 'source actions should sit outside the linked item card');
    const copySourceAction = inspectorSourceActions.querySelector('[data-essence-action="copy-source"]');
    assert.ok(copySourceAction, 'linked selected essence should expose source copy');
    assert.equal(copySourceAction.disabled, false);
    copySourceAction.click();
    flushSync();
    assert.deepEqual(copiedSources, ['c1']);
    const unlinkSourceAction = inspectorSourceActions.querySelector('[data-essence-action="unlink-source"]');
    assert.ok(unlinkSourceAction.classList.contains('is-warning-action'), 'unlink source should use the amber warning action style');
    unlinkSourceAction.click();
    await tick();
    flushSync();
    assert.ok(calls.some(call => call[0] === 'updateEssence' && call[1] === 'earth' && call[2].sourceComponentId === null));

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
    assert.ok(!target.querySelector('.manager-essence-edit-view .manager-action-group'), 'identity card should not duplicate route save/cancel actions');
    assert.equal(target.textContent.includes('Basic information'), false);
    assert.equal(target.textContent.includes('Essence ID'), false);
    assert.ok(!target.querySelector('.manager-inspector [aria-label="Edit Water"]'), 'inspector should not show an edit action while already editing');
    assert.ok(target.querySelector('.essence-icon-picker-trigger'), 'edit route should use the shared icon picker trigger');
    assert.equal(target.querySelector('.essence-icon-picker-trigger').title, 'Change icon');
    assert.ok(target.textContent.includes('Clear icon'));
    assert.ok(target.querySelector('.essence-source-trigger'), 'effect-transfer systems should show source picker controls');
    assert.ok(target.querySelector('.manager-essence-source-summary'), 'edit route should show selected source summary inside the form');
    assert.ok(target.querySelector('.manager-essence-source-drop-zone .essence-source-trigger'), 'edit route should show a full-width source drop/pick target');
    assert.equal(target.querySelector('.manager-header-actions .manager-button.is-primary').disabled, true);

    const editName = target.querySelector('#manager-essence-edit-name');
    editName.value = 'Rain';
    editName.dispatchEvent(new Event('input', { bubbles: true }));
    await tick();
    flushSync();
    assert.equal(target.querySelector('.manager-inspector-name').textContent.trim(), 'Rain');
    assert.equal(target.querySelector('.manager-header-actions .manager-button.is-primary').disabled, false);
    target.querySelector('.essence-source-trigger').click();
    await tick();
    flushSync();
    document.querySelector('.essence-source-picker-option[title="Glass Vial"]').click();
    await tick();
    flushSync();
    assert.ok(target.querySelector('.manager-essence-source-summary').textContent.includes('Glass Vial'));
    target.querySelector('.manager-header-actions .manager-button.is-primary').click();
    await tick();
    flushSync();
    assert.ok(calls.some(call => call[0] === 'updateEssence' && call[1] === 'water' && call[2].name === 'Rain' && call[2].sourceComponentId === 'c2'));
    assert.equal(target.querySelector('.fabricate-manager').dataset.managerView, 'essences');

    target.querySelector('[data-essence-id="water"] [aria-label="Delete Water"]').click();
    assert.ok(calls.some(call => call[0] === 'removeEssence' && call[1] === 'water'));
    await tick();
    flushSync();
    assert.equal(target.querySelector('[data-essence-id="earth"] [aria-label="Delete Earth"]').disabled, true);

    target.querySelector('.manager-header-actions .manager-button.is-primary').click();
    await tick();
    flushSync();
    assert.equal(target.querySelector('.fabricate-manager').dataset.managerView, 'essence-edit');
    assert.equal(target.querySelector('.manager-inspector-name').textContent.trim(), 'New essence draft');
    assert.equal(target.querySelector('.manager-header-actions .manager-button.is-primary').disabled, true);
    const createName = target.querySelector('#manager-essence-edit-name');
    createName.value = 'Air';
    createName.dispatchEvent(new Event('input', { bubbles: true }));
    await tick();
    flushSync();
    assert.equal(target.querySelector('.manager-inspector-name').textContent.trim(), 'Air');
    target.querySelector('.manager-header-actions .manager-button.is-primary').click();
    await tick();
    flushSync();
    assert.ok(calls.some(call => call[0] === 'addEssence' && call[1] === 'Air'));
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
            recipeCategories: true
          }
        }),
        services: { openCurrentAdmin: () => {} }
      }
    });
    flushSync();

    navButton('Essences').click();
    await tick();
    flushSync();

    assert.equal(target.querySelector('[aria-label="Filter essences by source state"]'), null);
    assert.equal(target.querySelector('.manager-essences-table').classList.contains('has-no-source'), true);
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

    const updateCall = calls.find(call => call[0] === 'updateEssence');
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
        store: createStore(calls, { confirmDiscardEssenceResult: false }),
        services: { openCurrentAdmin: () => {} }
      }
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

    navButton('Recipes').click();
    await tick();
    flushSync();

    assert.ok(calls.some(call => call[0] === 'confirmDiscardDirtyEssenceDraft'));
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
        services: { openCurrentAdmin: () => {} }
      }
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
        services: { openCurrentAdmin: () => {} }
      }
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
        services: { openCurrentAdmin: () => {} }
      }
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

  it('routes to the environments browser and opens the forced v2 editor route', async () => {
    const calls = [];
    target = document.createElement('div');
    document.body.appendChild(target);
    mounted = mount(Component, {
      target,
      props: {
        store: createStore(calls),
        services: { openCurrentAdmin: () => {} }
      }
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
    assert.equal(target.querySelector('.manager-nav-group').classList.contains('is-expanded'), true);
    assert.equal(gatheringParent.querySelector('.manager-nav-count').textContent.trim(), '5');
    assert.equal(gatheringToggle().getAttribute('aria-label'), 'Collapse gathering menu');
    const gatheringItems = Array.from(target.querySelectorAll('.manager-nav-subitem'));
    assert.deepEqual(
      gatheringItems.map(item => item.querySelector('.manager-nav-label')?.textContent.trim()),
      ['Environments', 'Tasks', 'Hazards', 'Settings']
    );
    assert.deepEqual(
      gatheringItems.map(item => item.querySelector('.manager-nav-count')?.textContent.trim() ?? null),
      ['2', '3', '0', null]
    );
    assert.equal(
      gatheringSubitem('Environments').getAttribute('aria-current'),
      'page'
    );
    assert.equal(target.querySelectorAll('.manager-gathering-tab').length, 0);

    gatheringToggle().click();
    await tick();
    flushSync();
    assert.equal(target.querySelector('.fabricate-manager').dataset.managerView, 'environments');
    assert.equal(target.querySelectorAll('.manager-nav-subitem').length, 4);
    assert.equal(target.querySelector('#manager-nav-gathering').getAttribute('aria-expanded'), 'true');
    assert.equal(target.querySelector('.manager-nav-group').classList.contains('is-expanded'), true);

    gatheringSubitem('Tasks').click();
    await tick();
    flushSync();

    assert.equal(gatheringSubitem('Tasks').getAttribute('aria-current'), 'page');
    assert.equal(target.querySelector('#manager-nav-gathering').classList.contains('is-active'), false);
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
    assert.equal(target.querySelector('#manager-nav-gathering').getAttribute('aria-expanded'), 'true');
    assert.equal(target.querySelectorAll('.manager-gathering-task-row').length, 3);
    assert.ok(target.textContent.includes('Gather Moon Herbs'));
    assert.ok(target.textContent.includes('Prospect Crystal Veins'));
    const tasksHead = target.querySelector('.manager-gathering-task-table-head');
    const taskHeaders = Array.from(tasksHead.querySelectorAll('[role="columnheader"]')).map(node => node.textContent.trim());
    assert.equal(taskHeaders.length, 4, 'task table should have four headers');
    assert.deepEqual(taskHeaders, ['Gathering task', 'Tags', 'Status', 'Actions']);
    const firstTaskRow = target.querySelector('.manager-gathering-task-row');
    const tagsCell = firstTaskRow.querySelector('.manager-gathering-task-tags-cell[data-gathering-task-tags]');
    assert.ok(tagsCell, 'tags chip cell renders as its own grid cell');
    const tagPills = Array.from(tagsCell.querySelectorAll('.manager-availability-pill'));
    const tagKinds = new Set();
    for (const pill of tagPills) {
      for (const kind of ['region', 'biome', 'timeOfDay', 'weather']) {
        if (pill.classList.contains(`is-${kind}`)) tagKinds.add(kind);
      }
    }
    assert.equal(tagKinds.size, 4, 'tags row should contain chips from all four dimensions (region/biome/time/weather)');
    const description = firstTaskRow.querySelector('.manager-gathering-task-identity .manager-system-description');
    assert.ok(description && description.textContent.trim().length > 0, 'short description should render under the task name');
    assert.ok(target.querySelector('[data-gathering-task-inspector]').textContent.includes('Selected gathering task'));
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
    const dropChips = target.querySelectorAll('[data-task-drops-summary] [data-task-drop-summary-chip]');
    assert.ok(
      Array.from(dropChips).some(chip => chip.textContent.includes('Nightshade With An Exceptionally Long Localized Component Name') && chip.textContent.includes('80%')),
      'drops summary should show the nightshade drop name + chance'
    );
    assert.equal(target.querySelector('[data-gathering-task-fact="environments"] strong').textContent.trim(), '1');

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
    const taskSelects = target.querySelectorAll('[data-gathering-tasks-browser] .manager-filter select');
    taskSelects[0].value = 'disabled';
    taskSelects[0].dispatchEvent(new Event('change', { bubbles: true }));
    await tick();
    flushSync();
    assert.equal(target.querySelectorAll('.manager-gathering-task-row').length, 1);
    assert.ok(target.textContent.includes('South Coast Driftwood'));

    target.querySelector('[data-clear-filters="gathering-tasks"]').click();
    await tick();
    flushSync();
    taskSelects[1].value = 'north';
    taskSelects[1].dispatchEvent(new Event('change', { bubbles: true }));
    await tick();
    flushSync();
    assert.equal(target.querySelectorAll('.manager-gathering-task-row').length, 2);
    taskSelects[2].value = 'cavern';
    taskSelects[2].dispatchEvent(new Event('change', { bubbles: true }));
    await tick();
    flushSync();
    assert.equal(target.querySelectorAll('.manager-gathering-task-row').length, 1);
    assert.ok(target.textContent.includes('Prospect Crystal Veins'));
    target.querySelector('[data-clear-filters="gathering-tasks"]').click();
    await tick();
    flushSync();
    taskSelects[3].value = 'mismatch';
    taskSelects[3].dispatchEvent(new Event('change', { bubbles: true }));
    await tick();
    flushSync();
    assert.equal(target.querySelectorAll('.manager-gathering-task-row').length, 2);

    target.querySelector('[data-clear-filters="gathering-tasks"]').click();
    await tick();
    flushSync();
    target.querySelector('[data-gathering-task-id="task-herbs"] .manager-status-toggle').click();
    target.querySelector('[data-gathering-task-id="task-herbs"] [aria-label="Duplicate Gather Moon Herbs"]').click();
    target.querySelector('[data-gathering-task-id="task-herbs"] [aria-label="Delete Gather Moon Herbs"]').click();
    assert.ok(calls.some(call => call[0] === 'updateGatheringLibraryTask' && call[1] === 'alchemy' && call[2] === 'task-herbs' && call[3].enabled === false));
    assert.ok(calls.some(call => call[0] === 'duplicateGatheringLibraryTask' && call[1] === 'alchemy' && call[2] === 'task-herbs'));
    assert.ok(calls.some(call => call[0] === 'deleteGatheringLibraryTask' && call[1] === 'alchemy' && call[2] === 'task-herbs'));

    target.querySelector('[data-gathering-task-id="task-herbs"] [aria-label="Edit Gather Moon Herbs"]').click();
    await tick();
    flushSync();
    assert.equal(target.querySelector('.fabricate-manager').dataset.managerView, 'gathering-task-edit');
    target.querySelector('#manager-nav-gathering').click();
    await tick();
    flushSync();
    assert.equal(target.querySelector('.fabricate-manager').dataset.managerView, 'gathering-task-edit');
    gatheringToggle().click();
    await tick();
    flushSync();
    assert.equal(target.querySelectorAll('.manager-nav-subitem').length, 4);
    assert.equal(target.querySelector('#manager-nav-gathering').getAttribute('aria-expanded'), 'true');
    assert.ok(target.querySelector('[data-gathering-task-editor]'));
    const coreEditor = target.querySelector('[data-gathering-task-core-editor]');
    assert.ok(coreEditor);
    assert.equal(coreEditor.querySelector('.manager-link-button'), null);
    assert.equal(coreEditor.textContent.includes('Back to task library'), false);
    assert.ok(target.textContent.includes('Task Identity'));
    assert.equal(target.textContent.includes('Internal ID'), false);
    assert.ok(target.textContent.includes('Edit availability, identity, and drop rules for the selected gathering task.'));
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
    const dropColumnHeaders = Array.from(target.querySelectorAll('[data-gathering-task-drops-table] [role="columnheader"]')).map(node => node.textContent.trim());
    assert.ok(dropColumnHeaders.includes('Count'));
    assert.ok(dropColumnHeaders.includes('#'), 'highestRankedDrop mode should surface the rank column header');
    assert.equal(dropColumnHeaders.includes('Quantity'), false);
    assert.equal(dropColumnHeaders.includes('Actions'), false);
    const populatedDropRow = target.querySelector('[data-gathering-task-drop-id="drop-nightshade"]');
    assert.equal(populatedDropRow.querySelector('[data-gathering-task-drop-row-number]'), null);
    const populatedComponentCell = populatedDropRow.querySelector('[data-gathering-task-drop-component-cell]');
    const populatedComponentButton = populatedComponentCell.querySelector('.manager-drop-component-button');
    assert.ok(populatedComponentButton);
    const populatedComponentThumb = populatedComponentCell.querySelector('.manager-gathering-task-thumb');
    assert.ok(populatedComponentThumb);
    assert.equal(populatedComponentButton.getAttribute('title'), 'Right-click to clear component');
    assert.ok(populatedComponentCell.textContent.includes('Nightshade With An Exceptionally Long Localized Component Name'));
    assert.equal(populatedComponentCell.querySelector('.manager-drop-component-button .manager-system-description'), null);
    assert.equal(populatedComponentCell.textContent.includes('A dusky flowering herb used in careful doses.'), false);
    assert.equal(populatedComponentCell.textContent.includes('Unresolved drop'), false);
    assert.equal(populatedDropRow.textContent.includes('Drop component'), false);
    assert.equal(populatedDropRow.textContent.includes('Drop chance'), false);
    assert.equal(populatedDropRow.textContent.includes('Quantity'), false);
    assert.equal(populatedDropRow.textContent.includes('award'), false);
    const populatedChanceCell = populatedDropRow.querySelector('[data-gathering-task-drop-chance-cell]');
    const dropRateInput = populatedChanceCell.querySelector('.manager-drop-rate-percent input');
    assert.equal(dropRateInput.getAttribute('type'), 'text');
    assert.equal(dropRateInput.getAttribute('inputmode'), 'numeric');
    assert.equal(dropRateInput.getAttribute('pattern'), '[0-9]*');
    assert.equal(dropRateInput.value, '80');
    const dropRateControl = populatedChanceCell.querySelector('input[type="range"]').parentElement;
    assert.ok(dropRateControl.classList.contains('manager-drop-rate-control'));
    assert.ok(dropRateControl.classList.contains('is-common'));
    assert.ok(dropRateControl.getAttribute('style').includes('--fab-drop-rate-value: 80%;'));
    assert.ok(dropRateControl.getAttribute('style').includes('--fab-drop-rate-color: var(--fab-drop-rate-common);'));
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
    const dropRateArrowUpEvent = new KeyboardEvent('keydown', { key: 'ArrowUp', bubbles: true, cancelable: true });
    stepDropRateInput.dispatchEvent(dropRateArrowUpEvent);
    await tick();
    flushSync();
    assert.equal(dropRateArrowUpEvent.defaultPrevented, true);
    assert.equal(stepDropRateInput.value, '8');
    stepDropRateInput = populatedDropRow.querySelector('.manager-drop-rate-percent input');
    stepDropRateInput.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true, cancelable: true }));
    await tick();
    flushSync();
    assert.equal(stepDropRateInput.value, '7');
    stepDropRateInput = populatedDropRow.querySelector('.manager-drop-rate-percent input');
    stepDropRateInput.value = '100';
    stepDropRateInput.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowUp', bubbles: true, cancelable: true }));
    await tick();
    flushSync();
    assert.equal(stepDropRateInput.value, '100');
    stepDropRateInput.value = '0';
    stepDropRateInput.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true, cancelable: true }));
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
    const quantityArrowUpEvent = new KeyboardEvent('keydown', { key: 'ArrowUp', bubbles: true, cancelable: true });
    stepQuantityInput.dispatchEvent(quantityArrowUpEvent);
    await tick();
    flushSync();
    assert.equal(quantityArrowUpEvent.defaultPrevented, true);
    assert.equal(stepQuantityInput.value, '4');
    stepQuantityInput = populatedDropRow.querySelector('.manager-drop-quantity-cell input');
    stepQuantityInput.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true, cancelable: true }));
    await tick();
    flushSync();
    assert.equal(stepQuantityInput.value, '3');
    stepQuantityInput = populatedDropRow.querySelector('.manager-drop-quantity-cell input');
    stepQuantityInput.value = '999';
    stepQuantityInput.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowUp', bubbles: true, cancelable: true }));
    await tick();
    flushSync();
    assert.equal(stepQuantityInput.value, '999');
    stepQuantityInput = populatedDropRow.querySelector('.manager-drop-quantity-cell input');
    stepQuantityInput.value = '1';
    stepQuantityInput.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true, cancelable: true }));
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
    assert.equal(modifierPills.length, 3);
    assert.ok(Array.from(modifierPills).some(pill => pill.classList.contains('is-positive') && pill.textContent.includes('Deep Night') && pill.textContent.includes('+20%')));
    assert.ok(Array.from(modifierPills).some(pill => pill.classList.contains('is-negative') && pill.textContent.includes('Clear Sky') && pill.textContent.includes('-15%')));
    assert.ok(Array.from(modifierPills).some(pill => pill.classList.contains('is-neutral') && pill.textContent.includes('High Day') && pill.textContent.includes('+0%')));
    assert.equal(populatedDropRow.querySelector('[aria-label="Duplicate drop rule"]'), null);
    assert.equal(populatedDropRow.querySelector('[aria-label="Delete drop rule"]'), null);
    const selectedDropInspector = target.querySelector('[data-gathering-task-drop-inspector]');
    const selectedDropActions = selectedDropInspector.querySelector('.manager-drop-editor-actions');
    assert.ok(selectedDropActions);
    assert.ok(selectedDropActions.previousElementSibling?.classList.contains('manager-inspector-title-row'));
    assert.ok(selectedDropActions.querySelector('[aria-label="Duplicate drop rule"]'));
    assert.ok(selectedDropActions.querySelector('[aria-label="Delete drop rule"]'));
    assert.equal(selectedDropInspector.textContent.includes('Drop component'), false);
    assert.equal(selectedDropInspector.textContent.includes('Select a component'), false);
    const inspectorRateEditor = selectedDropInspector.querySelector('[data-gathering-drop-inspector-rate]');
    assert.ok(inspectorRateEditor.textContent.includes('Drop chance'));
    const inspectorRateInput = inspectorRateEditor.querySelector('.manager-drop-rate-percent input');
    assert.equal(inspectorRateInput.getAttribute('type'), 'text');
    assert.equal(inspectorRateInput.getAttribute('inputmode'), 'numeric');
    assert.equal(inspectorRateInput.value, '0');
    const inspectorRateControl = inspectorRateEditor.querySelector('.manager-drop-rate-control');
    assert.ok(inspectorRateControl.classList.contains('is-none'));
    assert.ok(inspectorRateControl.getAttribute('style').includes('--fab-drop-rate-value: 0%;'));
    assert.ok(inspectorRateControl.getAttribute('style').includes('--fab-drop-rate-color: var(--fab-drop-rate-none);'));
    inspectorRateInput.value = '09x';
    inspectorRateInput.dispatchEvent(new Event('input', { bubbles: true }));
    await tick();
    flushSync();
    assert.equal(inspectorRateInput.value, '9');
    let refreshedInspectorRateInput = selectedDropInspector.querySelector('[data-gathering-drop-inspector-rate] .manager-drop-rate-percent input');
    const inspectorRateArrowUpEvent = new KeyboardEvent('keydown', { key: 'ArrowUp', bubbles: true, cancelable: true });
    refreshedInspectorRateInput.dispatchEvent(inspectorRateArrowUpEvent);
    await tick();
    flushSync();
    assert.equal(inspectorRateArrowUpEvent.defaultPrevented, true);
    assert.equal(refreshedInspectorRateInput.value, '10');
    refreshedInspectorRateInput = selectedDropInspector.querySelector('[data-gathering-drop-inspector-rate] .manager-drop-rate-percent input');
    refreshedInspectorRateInput.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true, cancelable: true }));
    await tick();
    flushSync();
    assert.equal(refreshedInspectorRateInput.value, '9');
    const inspectorCountEditor = selectedDropInspector.querySelector('[data-gathering-drop-inspector-count]');
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
    let refreshedInspectorCountInput = selectedDropInspector.querySelector('[data-gathering-drop-inspector-count] input');
    const inspectorCountArrowDownEvent = new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true, cancelable: true });
    refreshedInspectorCountInput.dispatchEvent(inspectorCountArrowDownEvent);
    await tick();
    flushSync();
    assert.equal(inspectorCountArrowDownEvent.defaultPrevented, true);
    assert.equal(refreshedInspectorCountInput.value, '5');
    refreshedInspectorCountInput = selectedDropInspector.querySelector('[data-gathering-drop-inspector-count] input');
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
    assert.equal(taskStatusToggle.querySelector('.manager-status-toggle-label').textContent.trim(), 'Off');
    taskStatusToggle.click();
    await tick();
    flushSync();
    assert.equal(taskStatusToggle.querySelector('.manager-status-toggle-label').textContent.trim(), 'On');
    const taskNameInput = target.querySelector('[data-gathering-task-field="name"]');
    assert.equal(
      Boolean(taskNameInput.compareDocumentPosition(taskImagePicker) & Node.DOCUMENT_POSITION_PRECEDING),
      true,
      'task name should be positioned after the image column in the core editor'
    );
    taskNameInput.value = 'Gather Sun Herbs';
    taskNameInput.dispatchEvent(new Event('input', { bubbles: true }));
    await tick();
    flushSync();
    assert.equal(taskNameInput.value, 'Gather Sun Herbs');
    const regionAvailability = target.querySelector('[data-gathering-task-field="regions"]');
    const biomeAvailability = target.querySelector('[data-gathering-task-field="biomes"]');
    const timeAvailability = target.querySelector('[data-gathering-task-field="timeOfDay"]');
    const weatherAvailability = target.querySelector('[data-gathering-task-field="weather"]');
    assert.equal(regionAvailability.querySelector('select'), null);
    assert.equal(timeAvailability.querySelector('select'), null);
    assert.equal(weatherAvailability.querySelector('select'), null);
    assert.equal(biomeAvailability.querySelector('select'), null);
    const regionPillNorth = regionAvailability.querySelector('[data-gathering-task-availability-pill="regions"][data-condition-id="north"]');
    assert.ok(regionPillNorth);
    assert.ok(regionPillNorth.textContent.includes('Northlands'));
    regionAvailability.querySelector('.manager-availability-menu-button').click();
    await tick();
    flushSync();
    assert.equal(regionAvailability.querySelector('[data-gathering-task-availability-option="regions"][data-condition-id="north"]'), null);
    assert.deepEqual(
      Array.from(regionAvailability.querySelectorAll('[data-gathering-task-availability-option="regions"]')).map(option => option.textContent.trim()),
      ['South Coast']
    );
    regionAvailability.querySelector('[data-gathering-task-availability-option="regions"][data-condition-id="south"]').click();
    await tick();
    flushSync();
    assert.ok(regionAvailability.querySelector('[data-gathering-task-availability-pill="regions"][data-condition-id="south"]'));
    regionAvailability.querySelector('[data-gathering-task-availability-pill="regions"][data-condition-id="north"] .manager-availability-remove').click();
    await tick();
    flushSync();
    assert.equal(regionAvailability.querySelector('[data-gathering-task-availability-pill="regions"][data-condition-id="north"]'), null);
    const biomePill = biomeAvailability.querySelector('[data-gathering-task-availability-pill="biomes"][data-condition-id="forest"]');
    const timePill = timeAvailability.querySelector('[data-gathering-task-availability-pill="timeOfDay"][data-condition-id="day"]');
    const weatherPill = weatherAvailability.querySelector('[data-gathering-task-availability-pill="weather"][data-condition-id="clear"]');
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
    assert.equal(biomeAvailability.querySelector('[data-gathering-task-availability-option="biomes"][data-condition-id="forest"]'), null);
    assert.deepEqual(
      Array.from(biomeAvailability.querySelectorAll('[data-gathering-task-availability-option="biomes"]')).map(option => option.textContent.trim()),
      ['Crystal Cavern']
    );
    assert.ok(biomeAvailability.querySelector('[data-condition-id="cavern"] i.fas.fa-gem'));
    biomeAvailability.querySelector('[data-gathering-task-availability-option="biomes"][data-condition-id="cavern"]').click();
    await tick();
    flushSync();
    assert.ok(biomeAvailability.querySelector('[data-gathering-task-availability-pill="biomes"][data-condition-id="cavern"]'));

    biomeAvailability.querySelector('[data-gathering-task-availability-pill="biomes"][data-condition-id="forest"] .manager-availability-remove').click();
    await tick();
    flushSync();
    assert.equal(biomeAvailability.querySelector('[data-gathering-task-availability-pill="biomes"][data-condition-id="forest"]'), null);

    biomeAvailability.querySelector('[data-gathering-task-availability-pill="biomes"][data-condition-id="cavern"] .manager-availability-remove').click();
    await tick();
    flushSync();
    assert.ok(biomeAvailability.textContent.includes('Any Biome'));

    timeAvailability.querySelector('.manager-availability-menu-button').click();
    await tick();
    flushSync();
    assert.equal(timeAvailability.querySelector('[data-gathering-task-availability-option="timeOfDay"][data-condition-id="day"]'), null);
    assert.deepEqual(
      Array.from(timeAvailability.querySelectorAll('[data-gathering-task-availability-option="timeOfDay"]')).map(option => option.textContent.trim()),
      ['First Light', 'Deep Night']
    );
    assert.ok(timeAvailability.querySelector('[data-condition-id="night"] i.fas.fa-moon'));
    timeAvailability.querySelector('[data-gathering-task-availability-option="timeOfDay"][data-condition-id="night"]').click();
    await tick();
    flushSync();
    assert.ok(timeAvailability.querySelector('[data-gathering-task-availability-pill="timeOfDay"][data-condition-id="night"]'));

    timeAvailability.querySelector('[data-gathering-task-availability-pill="timeOfDay"][data-condition-id="day"] .manager-availability-remove').click();
    await tick();
    flushSync();
    assert.equal(timeAvailability.querySelector('[data-gathering-task-availability-pill="timeOfDay"][data-condition-id="day"]'), null);

    weatherAvailability.querySelector('.manager-availability-menu-button').click();
    await tick();
    flushSync();
    assert.equal(weatherAvailability.querySelector('[data-gathering-task-availability-option="weather"][data-condition-id="clear"]'), null);
    assert.deepEqual(
      Array.from(weatherAvailability.querySelectorAll('[data-gathering-task-availability-option="weather"]')).map(option => option.textContent.trim()),
      ['Storm Rain']
    );
    assert.ok(weatherAvailability.querySelector('[data-condition-id="heavy-rain"] i.fas.fa-cloud-showers-heavy'));
    weatherAvailability.querySelector('[data-gathering-task-availability-option="weather"][data-condition-id="heavy-rain"]').click();
    await tick();
    flushSync();
    assert.ok(weatherAvailability.querySelector('[data-gathering-task-availability-pill="weather"][data-condition-id="heavy-rain"]'));

    weatherAvailability.querySelector('[data-gathering-task-availability-pill="weather"][data-condition-id="clear"] .manager-availability-remove').click();
    await tick();
    flushSync();
    assert.equal(weatherAvailability.querySelector('[data-gathering-task-availability-pill="weather"][data-condition-id="clear"]'), null);
    for (const availability of [regionAvailability, biomeAvailability, timeAvailability, weatherAvailability]) {
      availability.querySelector('.manager-availability-menu-button').click();
      await tick();
      flushSync();
      assert.ok(availability.querySelector('.manager-availability-menu'), 'picker menu should open on trigger click');
      document.body.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }));
      await tick();
      flushSync();
      assert.equal(availability.querySelector('.manager-availability-menu'), null, 'picker menu should dismiss on outside mousedown');
    }
    const inspectorSlider = target.querySelector('[data-gathering-task-drop-inspector] input[type="range"]');
    inspectorSlider.value = '35';
    inspectorSlider.dispatchEvent(new Event('input', { bubbles: true }));
    await tick();
    flushSync();
    assert.equal(target.querySelector('[data-gathering-task-drop-inspector] [data-gathering-drop-inspector-rate] input[type="text"]').value, '35');
    const chanceSlider = target.querySelector('[data-gathering-task-drop-id="drop-nightshade"] input[type="range"]');
    chanceSlider.value = '25';
    chanceSlider.dispatchEvent(new Event('input', { bubbles: true }));
    await tick();
    flushSync();
    assert.equal(target.querySelector('[data-gathering-task-drop-id="drop-nightshade"] .manager-drop-rate-percent input').value, '25');
    target.querySelector('[data-gathering-task-drop-inspector] [aria-label="Duplicate drop rule"]').click();
    await tick();
    flushSync();
    assert.ok(target.querySelector('[data-gathering-task-reward-rule-notice]'));
    const clearableComponentThumb = target.querySelector('[data-gathering-task-drop-id="drop-nightshade"] .manager-gathering-task-thumb');
    assert.ok(clearableComponentThumb);
    const clearComponentEvent = new MouseEvent('mousedown', { button: 2, bubbles: true, cancelable: true });
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
    assert.ok(calls.some(call => call[0] === 'updateGatheringLibraryTask' && call[1] === 'alchemy' && call[2] === 'task-herbs' && call[3].name === 'Gather Sun Herbs' && call[3].enabled === true), 'Save should persist staged edits in a single call');
    target.querySelector('.manager-header-actions .manager-button:not(.is-primary)').click();
    await tick();
    flushSync();
    assert.equal(target.querySelector('.fabricate-manager').dataset.managerView, 'environments');
    assert.equal(gatheringSubitem('Tasks').getAttribute('aria-current'), 'page');

    gatheringSubitem('Hazards').click();
    await tick();
    flushSync();
    assert.equal(gatheringSubitem('Hazards').getAttribute('aria-current'), 'page');
    assert.ok(target.querySelector('[data-gathering-hazards-browser]'), 'Hazards tab should mount the hazard library browser');
    assert.equal(target.querySelector('.manager-environments-table'), null);
    assert.ok(
      target.querySelector('.manager-inspector').textContent.includes('Select a gathering hazard'),
      'inspector should show the select-hazard empty state when no hazard is selected'
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
    assert.ok(target.textContent.includes('Set system-level drop resolution and hazard rules for gathering.'));
    assert.equal(target.querySelectorAll('[data-gathering-condition-panel]').length, 2);
    assert.equal(target.querySelectorAll('[data-gathering-vocabulary-panel]').length, 2);
    assert.ok(target.querySelector('[data-gathering-condition-panel="timeOfDay"]'));
    assert.ok(target.querySelector('[data-gathering-condition-panel="weather"]'));
    assert.ok(target.querySelector('[data-gathering-vocabulary-panel="regions"]'));
    assert.ok(target.querySelector('[data-gathering-vocabulary-panel="biomes"]'));
    assert.ok(target.textContent.includes('Times of day'));
    assert.ok(target.textContent.includes('Weather conditions'));
    assert.ok(target.textContent.includes('Regions'));
    assert.ok(target.textContent.includes('Biomes'));
    assert.ok(target.textContent.includes('These values control current time matching for gathering tasks and hazards.'));
    assert.ok(target.textContent.includes('These values control current weather matching for gathering tasks and hazards.'));
    assert.ok(target.textContent.includes('Environments use one region. Labels can be renamed without changing ids.'));
    assert.ok(target.textContent.includes('Environments can use multiple biomes. Left-click the coloured icon to edit icon; right-click to edit colour.'));
    assert.equal(target.querySelectorAll('.manager-condition-add input').length, 4);
    assert.equal(target.querySelectorAll('.manager-condition-add .essence-icon-picker-trigger.icon-only').length, 3);
    assert.equal(target.querySelectorAll('.manager-color-picker-trigger').length, 1);
    assert.equal(target.querySelectorAll('.manager-condition-add .manager-add-button').length, 4);
    assert.equal(Array.from(target.querySelectorAll('.manager-condition-add .manager-add-button')).every(button => button.textContent.trim() === 'Add'), true);
    assert.equal(target.textContent.includes('Add time of day'), false);
    assert.equal(target.textContent.includes('Add weather'), false);
    assert.equal(target.textContent.includes('Add region'), false);
    assert.equal(target.textContent.includes('Add biome'), false);
    assert.equal(target.querySelectorAll('[data-gathering-condition-value]').length, 5);
    assert.equal(target.querySelectorAll('.manager-vocabulary-pill').length, 4);
    assert.equal(target.querySelectorAll('[data-gathering-vocabulary-panel="biomes"] .manager-biome-combined-trigger').length, 2);
    assert.equal(target.querySelectorAll('.manager-condition-label-input').length, 9);
    assert.equal(target.querySelectorAll('.manager-vocabulary-pill .manager-condition-label-input').length, 4);
    assert.deepEqual(
      Array.from(target.querySelectorAll('[data-gathering-condition-panel="weather"] .manager-condition-label-input')).map(input => input.value),
      ['Clear Sky', 'Storm Rain']
    );
    assert.deepEqual(
      Array.from(target.querySelectorAll('[data-gathering-condition-panel="timeOfDay"] .manager-condition-label-input')).map(input => input.value),
      ['First Light', 'High Day', 'Deep Night']
    );
    const weatherLabelInput = target.querySelector('[data-gathering-condition-value="heavy-rain"] .manager-condition-label-input');
    weatherLabelInput.value = 'Heavy Rainfall';
    weatherLabelInput.dispatchEvent(new Event('blur'));
    await tick();
    flushSync();
    assert.deepEqual(
      calls.find(call => call[0] === 'updateGatheringConditionValue'),
      ['updateGatheringConditionValue', 'weather', 'heavy-rain', { label: 'Heavy Rainfall' }, 'alchemy']
    );

    const timeLabelInput = target.querySelector('[data-gathering-condition-value="dawn"] .manager-condition-label-input');
    timeLabelInput.focus();
    timeLabelInput.value = 'Grey Dawn';
    timeLabelInput.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }));
    await tick();
    flushSync();
    assert.deepEqual(
      calls.filter(call => call[0] === 'updateGatheringConditionValue').at(-1),
      ['updateGatheringConditionValue', 'timeOfDay', 'dawn', { label: 'Grey Dawn' }, 'alchemy']
    );
    assert.equal(target.querySelectorAll('[data-gathering-condition-value] .essence-icon-picker-trigger.icon-only').length, 5);
    const regionLabelInput = target.querySelector('[data-gathering-vocabulary-panel="regions"] [data-gathering-vocabulary-value="north"] .manager-condition-label-input');
    regionLabelInput.value = 'Northern Reach';
    regionLabelInput.dispatchEvent(new Event('blur'));
    await tick();
    flushSync();
    assert.deepEqual(
      calls.find(call => call[0] === 'updateGatheringVocabularyValue'),
      ['updateGatheringVocabularyValue', 'regions', 'north', { label: 'Northern Reach' }, 'alchemy']
    );
    const biomeIconTrigger = target.querySelector('[data-gathering-vocabulary-panel="biomes"] [data-gathering-vocabulary-value="forest"] .manager-biome-combined-trigger');
    biomeIconTrigger.click();
    await tick();
    flushSync();
    assert.ok(target.querySelector('.essence-icon-picker-popover'));
    target.querySelector('.essence-icon-picker-popover .essence-icon-picker-option').click();
    await tick();
    flushSync();
    assert.equal(calls.filter(call => call[0] === 'updateGatheringVocabularyValue').at(-1)[1], 'biomes');
    const biomeColorTrigger = target.querySelector('[data-gathering-vocabulary-panel="biomes"] [data-gathering-vocabulary-value="forest"] .manager-biome-combined-trigger');
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
      height: 320
    });
    managerMain.getBoundingClientRect = () => ({
      left: 120,
      top: 60,
      right: 760,
      bottom: 360,
      width: 640,
      height: 300
    });
    biomeColorTrigger.getBoundingClientRect = () => ({
      left: 140,
      top: 330,
      right: 170,
      bottom: 360,
      width: 30,
      height: 30
    });
    biomeColorTrigger.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true }));
    await tick();
    flushSync();
    await tick();
    flushSync();
    const colorPopover = target.querySelector('[data-manager-color-picker-popover]');
    assert.ok(colorPopover);
    assert.equal(colorPopover.closest('.fabricate-manager'), managerShell, 'biome color popover should stay inside the Manager shell overlay layer');
    assert.equal(colorPopover.closest('[data-gathering-vocabulary-panel="biomes"]'), null, 'biome color popover should be portaled out of the settings panel');
    assert.match(colorPopover.getAttribute('style'), /bottom:\s*\d+px;/, 'lower biome color popovers should flip above the trigger when space below is constrained');
    assert.match(colorPopover.getAttribute('style'), /left:\s*40px;/, 'biome color popover should left-align with the trigger while within the main panel bounds');
    assert.match(colorPopover.getAttribute('style'), /width:\s*220px;/, 'biome color popover should keep its fixed compact width');
    target.querySelector('[data-manager-color-token="mist"]').click();
    await tick();
    flushSync();
    assert.deepEqual(
      calls.filter(call => call[0] === 'updateGatheringVocabularyValue').at(-1),
      ['updateGatheringVocabularyValue', 'biomes', 'forest', { colorToken: 'mist', customColor: '' }, 'alchemy']
    );
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
      height: 30
    });
    biomeColorTrigger.dispatchEvent(new KeyboardEvent('keydown', { key: 'F10', shiftKey: true, bubbles: true, cancelable: true }));
    await tick();
    flushSync();
    const constrainedColorPopover = target.querySelector('[data-manager-color-picker-popover]');
    assert.ok(constrainedColorPopover);
    assert.match(constrainedColorPopover.getAttribute('style'), /left:\s*424px;/, 'biome color popover should clamp to the Manager main panel right edge');
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    await tick();
    flushSync();
    assert.equal(target.querySelector('[data-manager-color-picker-popover]'), null);
    managerShell.getBoundingClientRect = originalShellRect;
    managerMain.getBoundingClientRect = originalMainRect;
    biomeColorTrigger.getBoundingClientRect = originalBiomeTriggerRect;
    assert.equal(target.querySelector('.manager-gathering-settings-summary'), null);
    assert.equal(target.querySelector('[data-gathering-rule-fact]'), null);
    assert.ok(target.querySelector('.manager-inspector').textContent.includes('Choose which successful drop rows are granted.'));
    assert.ok(target.querySelector('.manager-inspector').textContent.includes('Choose which matching hazards are applied after a gathering roll.'));
    assert.ok(target.querySelector('.manager-inspector').textContent.includes('Decide whether selected hazards still allow the gathering attempt to succeed.'));
    const rewardsSelect = target.querySelector('#manager-gathering-rule-rewards');
    const hazardsSelect = target.querySelector('#manager-gathering-rule-hazards');
    assert.deepEqual(
      Array.from(rewardsSelect.options).map(option => option.textContent.trim()),
      ['Highest ranked successful drop', 'All successful drops', 'Limit successful drops']
    );
    assert.deepEqual(
      Array.from(hazardsSelect.options).map(option => option.textContent.trim()),
      ['Highest ranked triggered hazard', 'All triggered hazards', 'Limit triggered hazards']
    );
    assert.equal(hazardsSelect.textContent.includes('Highest ranked successful drop'), false);
    assert.equal(hazardsSelect.textContent.includes('All successful drops'), false);
    assert.ok(target.textContent.includes('Gathering succeeds'));
    assert.ok(target.querySelector('.manager-inspector [data-gathering-inspector-rules]'));
    assert.equal(target.querySelector('.manager-inspector [data-gathering-inspector-rules] h2').textContent.trim(), 'Rules');
    assert.equal(target.querySelectorAll('.manager-inspector [data-gathering-inspector-rules] select').length, 4);
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
      Array.from(environmentTable.querySelectorAll('[role="columnheader"]')).map(header => header.textContent.trim()),
      ['Environment', 'Selection mode', 'Tasks', 'Status', 'Actions']
    );
    assert.equal(environmentTable.textContent.includes('Linked scene'), false);
    assert.equal(environmentTable.textContent.includes('Scene unresolved'), false);
    const forestRow = target.querySelector('[data-environment-id="env-forest"]');
    assert.equal(forestRow.querySelector('.manager-environment-task-count').textContent.trim(), '1');
    assert.equal(forestRow.textContent.includes('results'), false);
    assert.equal(forestRow.textContent.includes('catalysts'), false);
    assert.equal(forestRow.querySelector('.manager-environment-task-count.manager-chip'), null);
    assert.ok(forestRow.querySelector('.manager-status-toggle'));
    assert.ok(forestRow.querySelector('.manager-environment-action-grid'));
    assert.ok(forestRow.querySelector('[aria-label="Edit Moonlit Forest"]'));
    assert.ok(forestRow.querySelector('[aria-label="Duplicate Moonlit Forest"]'));
    assert.ok(forestRow.querySelector('[aria-label="Delete Moonlit Forest"]'));
    assert.ok(forestRow.querySelector('.manager-environment-reorder-stack'));
    assert.ok(target.querySelector('.manager-inspector').textContent.includes('Selected environment'));
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
    assert.equal(
      target.querySelector('[data-environment-id="env-cavern"] .manager-environment-reorder-stack [aria-label="Move up"]').disabled,
      false,
      'filtered environment move-up should use full list order, not filtered row position'
    );

    const cavernToggle = target.querySelector('[data-environment-id="env-cavern"] .manager-status-toggle');
    cavernToggle.click();
    await tick();
    flushSync();
    assert.ok(calls.some(call => call[0] === 'toggleEnvironmentEnabled' && call[1] === 'env-cavern' && call[2] === true));
    assert.equal(calls.some(call => call[0] === 'selectEnvironment' && call[1] === 'env-cavern'), false);

    target.querySelector('[data-environment-id="env-cavern"] .manager-environment-identity').click();
    await tick();
    flushSync();
    assert.ok(target.querySelector('[data-environment-id="env-cavern"]').classList.contains('is-selected'));
    assert.ok(calls.some(call => call[0] === 'selectEnvironment' && call[1] === 'env-cavern'));

    target.querySelector('[data-environment-id="env-cavern"] [aria-label="Move up"]').click();
    target.querySelector('[data-environment-id="env-cavern"] [aria-label="Duplicate Quiet Cavern"]').click();
    target.querySelector('[data-environment-id="env-cavern"] [aria-label="Delete Quiet Cavern"]').click();
    assert.ok(calls.some(call => call[0] === 'moveEnvironmentDraft' && call[1] === 'env-cavern' && call[2] === 'up'));
    assert.ok(calls.some(call => call[0] === 'duplicateEnvironmentDraft' && call[1] === 'env-cavern'));
    assert.ok(calls.some(call => call[0] === 'deleteEnvironmentDraft' && call[1] === 'env-cavern'));

    target.querySelector('[aria-label="Edit Quiet Cavern"]').click();
    await Promise.resolve();
    await Promise.resolve();
    await tick();
    flushSync();

    assert.equal(target.querySelector('.fabricate-manager').dataset.managerView, 'environment-edit');
    assert.ok(target.querySelector('.manager-environment-editor-shell .manager-environment-edit-view'));
    assert.ok(target.textContent.includes('Quiet Cavern'));
  });

  it('deletes the editing gathering task from the editor toolbar and returns to the task browser', async () => {
    const calls = [];
    target = document.createElement('div');
    document.body.appendChild(target);
    mounted = mount(Component, {
      target,
      props: {
        store: createStore(calls),
        services: { openCurrentAdmin: () => {} }
      }
    });
    flushSync();

    navButton('Gathering').click();
    await tick();
    flushSync();

    gatheringSubitem('Tasks').click();
    await tick();
    flushSync();

    target.querySelector('[data-gathering-task-id="task-herbs"] [aria-label="Edit Gather Moon Herbs"]').click();
    await tick();
    flushSync();
    assert.equal(target.querySelector('.fabricate-manager').dataset.managerView, 'gathering-task-edit');

    const headerDeleteButton = target.querySelector('.manager-header-actions .manager-button.is-danger');
    assert.ok(headerDeleteButton, 'editor toolbar should expose a destructive delete button');
    assert.ok(headerDeleteButton.textContent.includes('Delete gathering task'));
    headerDeleteButton.click();
    await tick();
    flushSync();

    assert.ok(
      calls.some(call => call[0] === 'deleteGatheringLibraryTask' && call[1] === 'alchemy' && call[2] === 'task-herbs'),
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
          importSingleManagedItemFromDrop: async () => ({ id: 'c2', name: 'Glass Vial' })
        }
      }
    });
    flushSync();

    navButton('Gathering').click();
    await tick();
    flushSync();
    gatheringSubitem('Tasks').click();
    await tick();
    flushSync();
    target.querySelector('[data-gathering-task-id="task-herbs"] [aria-label="Edit Gather Moon Herbs"]').click();
    await tick();
    flushSync();

    const knownDropIds = new Set(Array.from(target.querySelectorAll('[data-gathering-task-drop-id]'))
      .map(node => node.dataset.gatheringTaskDropId));
    Array.from(target.querySelectorAll('.manager-task-card-header .manager-button'))
      .find(button => button.textContent.includes('Add drop rule'))
      .click();
    await tick();
    flushSync();

    const addedDropRow = Array.from(target.querySelectorAll('[data-gathering-task-drop-id]'))
      .find(node => !knownDropIds.has(node.dataset.gatheringTaskDropId));
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
    assert.ok(target.querySelector('[data-gathering-task-drop-inspector]').textContent.includes('Nightshade With An Exceptionally Long Localized Component Name'));
    addedDropRow.click();
    await tick();
    flushSync();
    assert.equal(target.querySelector('[data-gathering-task-drop-inspector]').textContent.includes('Drop component'), false);
    assert.equal(target.querySelector('[data-gathering-task-drop-inspector] [data-gathering-drop-inspector-rate] input[type="text"]').value, '25');
    assert.equal(target.querySelector('[data-gathering-task-drop-inspector] [data-gathering-drop-inspector-count] input').value, '1');
    assert.equal(target.querySelector('[data-gathering-task-drop-id="drop-nightshade"] [aria-label="Duplicate drop rule"]'), null);
    assert.equal(target.querySelector('[data-gathering-task-drop-id="drop-nightshade"] [aria-label="Delete drop rule"]'), null);

    const inspectorSlider = target.querySelector('[data-gathering-task-drop-inspector] input[type="range"]');
    inspectorSlider.value = '100';
    inspectorSlider.dispatchEvent(new Event('input', { bubbles: true }));
    await tick();
    flushSync();

    target.querySelector('[data-gathering-task-drop-inspector] [aria-label="Duplicate drop rule"]').click();
    await tick();
    flushSync();
    const unresolvedDropsAtRate100 = Array.from(target.querySelectorAll('[data-gathering-task-drop-id]'))
      .filter(node => node.textContent.includes('No Component'));
    assert.ok(unresolvedDropsAtRate100.length >= 2, 'duplicate should stage a second unresolved drop row');
    target.querySelector(`[data-gathering-task-drop-id="${addedRow.id}"]`).click();
    await tick();
    flushSync();
    target.querySelector('[data-gathering-task-drop-inspector] [aria-label="Delete drop rule"]').click();
    await tick();
    flushSync();
    assert.equal(target.querySelector(`[data-gathering-task-drop-id="${addedRow.id}"]`), null, 'delete should stage removal of the row');
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
            { id: 'drop-empty', componentId: '', itemUuid: '', systemItemId: '', name: '', quantity: 1, dropRate: 25, enabled: false },
            { id: 'drop-stale', componentId: 'c3', itemUuid: 'Item.stale', systemItemId: 'legacy-system-item', name: 'Legacy Name', quantity: 1, dropRate: 40, enabled: true }
          ]
        }),
        services: {
          openCurrentAdmin: () => {},
          importSingleManagedItemFromDrop: async (data) => {
            importedDrops.push(data);
            return { id: 'c1', name: 'Iron Ore' };
          }
        }
      }
    });
    flushSync();

    navButton('Gathering').click();
    await tick();
    flushSync();
    gatheringSubitem('Tasks').click();
    await tick();
    flushSync();
    target.querySelector('[data-gathering-task-id="task-herbs"] [aria-label="Edit Gather Moon Herbs"]').click();
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
    assert.equal(target.querySelectorAll('[data-gathering-component-card]').length, 6, 'component browser should default to six cards per page');
    assert.ok(browser.textContent.includes('Iron Ore'));
    assert.equal(browser.textContent.includes('River Salt'), false, 'seventh component should start on the next page');

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
    assert.equal(target.querySelectorAll('[data-gathering-component-card]').length, 0, 'component browser name search should not match descriptions');

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
      .find(button => button.textContent.includes('herb'))
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
      .find(button => button.textContent.includes('moon'))
      .click();
    await tick();
    flushSync();
    assert.equal(target.querySelectorAll('[data-gathering-component-card]').length, 1, 'selected component tags should require all tags');
    assert.ok(browser.textContent.includes('Moon Fern'));
    const selectedTagPills = Array.from(target.querySelectorAll('[data-gathering-component-tag-pill]'));
    assert.ok(selectedTagPills.every(pill => pill.classList.contains('manager-selected-tag-pill')), 'selected component tags should render as removable pills');

    for (const pill of Array.from(target.querySelectorAll('[data-gathering-component-tag-pill] button'))) {
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
          effectAllowed: ''
        }
      });
      card.dispatchEvent(dragStart);
      return raw;
    }

    function dropPayloadOn(row, raw) {
      const dropEvent = new Event('drop', { bubbles: true, cancelable: true });
      Object.defineProperty(dropEvent, 'dataTransfer', {
        value: { getData: (type) => type === 'text/plain' ? raw : '' }
      });
      row.dispatchEvent(dropEvent);
    }

    const emptyRow = target.querySelector('[data-gathering-task-drop-id="drop-empty"]');
    const glassPayload = dragPayloadFrom(target.querySelector('[data-gathering-component-card="c2"]'));
    assert.deepEqual(JSON.parse(glassPayload), { type: 'FabricateManagedComponent', componentId: 'c2' });
    dropPayloadOn(emptyRow, glassPayload);
    await tick();
    flushSync();
    const emptyRowAfter = target.querySelector('[data-gathering-task-drop-id="drop-empty"]');
    assert.ok(emptyRowAfter && emptyRowAfter.textContent.includes('Glass Vial'), 'managed-component drag should stage the new component on the drop row');

    const staleRow = target.querySelector('[data-gathering-task-drop-id="drop-stale"]');
    const coalPayload = dragPayloadFrom(target.querySelector('[data-gathering-component-card="c4"]'));
    dropPayloadOn(staleRow, coalPayload);
    await tick();
    flushSync();
    const staleRowAfter = target.querySelector('[data-gathering-task-drop-id="drop-stale"]');
    assert.ok(staleRowAfter && !staleRowAfter.textContent.includes('Legacy Name'), 'managed-component drag onto a stale row should stage the replacement');

    dropPayloadOn(staleRow, JSON.stringify({ type: 'Item', uuid: 'Item.imported' }));
    await Promise.resolve();
    await tick();
    flushSync();
    assert.deepEqual(importedDrops, [{ type: 'Item', uuid: 'Item.imported' }], 'non-managed drops should keep using the import flow');
  });

  it('summarizes crowded gathering task drop modifiers at five or more labels', async () => {
    const fourModifiers = Array.from({ length: 4 }, (_, index) => ({
      id: `four-${index}`,
      conditionId: `four-${index}`,
      value: index + 1
    }));
    const fiveModifiers = Array.from({ length: 5 }, (_, index) => ({
      id: `five-${index}`,
      conditionId: `five-${index}`,
      value: index + 1
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
              conditionModifiers: { timeOfDay: fourModifiers, weather: [] }
            },
            {
              id: 'drop-five-modifiers',
              componentId: 'c3',
              quantity: 1,
              dropRate: 25,
              enabled: true,
              conditionModifiers: { timeOfDay: fiveModifiers, weather: [] }
            }
          ]
        }),
        services: { openCurrentAdmin: () => {} }
      }
    });
    flushSync();

    navButton('Gathering').click();
    await tick();
    flushSync();
    gatheringSubitem('Tasks').click();
    await tick();
    flushSync();
    target.querySelector('[data-gathering-task-id="task-herbs"] [aria-label="Edit Gather Moon Herbs"]').click();
    await tick();
    flushSync();

    const fourModifierRow = target.querySelector('[data-gathering-task-drop-id="drop-four-modifiers"]');
    const fiveModifierRow = target.querySelector('[data-gathering-task-drop-id="drop-five-modifiers"]');
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
      ['drop-zero', 0, 'is-none', 'var(--fab-drop-rate-none)']
    ];
    const dropRows = rarityRows.map(([id, dropRate]) => ({
      id,
      componentId: 'c1',
      quantity: 1,
      dropRate,
      enabled: true
    }));
    target = document.createElement('div');
    document.body.appendChild(target);
    mounted = mount(Component, {
      target,
      props: {
        store: createStore([], { taskDropRows: dropRows }),
        services: { openCurrentAdmin: () => {} }
      }
    });
    flushSync();

    navButton('Gathering').click();
    await tick();
    flushSync();
    gatheringSubitem('Tasks').click();
    await tick();
    flushSync();
    target.querySelector('[data-gathering-task-id="task-herbs"] [aria-label="Edit Gather Moon Herbs"]').click();
    await tick();
    flushSync();

    function assertRenderedRarityRows(rows) {
      for (const [id, dropRate, tierClass, color] of rows) {
        const control = target.querySelector(`[data-gathering-task-drop-id="${id}"] .manager-drop-rate-control`);
        assert.ok(control.classList.contains(tierClass), `${id} should use ${tierClass}`);
        assert.ok(control.getAttribute('style').includes(`--fab-drop-rate-value: ${dropRate}%;`), `${id} should expose its slider fill value`);
        assert.ok(control.getAttribute('style').includes(`--fab-drop-rate-color: ${color};`), `${id} should expose ${color}`);
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
      enabled: true
    }));
    target = document.createElement('div');
    document.body.appendChild(target);
    mounted = mount(Component, {
      target,
      props: {
        store: createStore([], { taskDropRows: dropRows }),
        services: { openCurrentAdmin: () => {} }
      }
    });
    flushSync();

    navButton('Gathering').click();
    await tick();
    flushSync();
    gatheringSubitem('Tasks').click();
    await tick();
    flushSync();
    target.querySelector('[data-gathering-task-id="task-herbs"] [aria-label="Edit Gather Moon Herbs"]').click();
    await tick();
    flushSync();

    const dropRulesCard = target.querySelector('.manager-task-drops-card');
    assert.ok(target.querySelector('[data-gathering-task-drop-id="drop-page-1"]'));
    assert.equal(dropRulesCard.querySelectorAll('[data-gathering-task-drop-id]').length, 5, 'drop rules should default to five rows per page');
    assert.equal(dropRulesCard.querySelector('[data-pagination-page]').textContent.trim(), 'Page 1 of 3');
    dropRulesCard.querySelector('[data-pagination-next]').click();
    await tick();
    flushSync();

    assert.equal(dropRulesCard.querySelector('[data-pagination-page]').textContent.trim(), 'Page 2 of 3');
    assert.equal(target.querySelector('[data-gathering-task-drop-id="drop-page-1"]'), null);
    assert.ok(target.querySelector('[data-gathering-task-drop-id="drop-page-6"]'));
  });

  it('shows the drop rank column with boundary-aware reorder buttons under highestRankedDrop mode', async () => {
    const dropRows = [
      { id: 'drop-rank-1', componentId: 'c1', quantity: 1, dropRate: 90, enabled: true },
      { id: 'drop-rank-2', componentId: 'c1', quantity: 1, dropRate: 60, enabled: true },
      { id: 'drop-rank-3', componentId: 'c1', quantity: 1, dropRate: 30, enabled: true }
    ];
    target = document.createElement('div');
    document.body.appendChild(target);
    mounted = mount(Component, {
      target,
      props: {
        store: createStore([], { taskDropRows: dropRows, rewardSelectionMode: 'highestRankedDrop' }),
        services: { openCurrentAdmin: () => {} }
      }
    });
    flushSync();

    navButton('Gathering').click();
    await tick();
    flushSync();
    gatheringSubitem('Tasks').click();
    await tick();
    flushSync();
    target.querySelector('[data-gathering-task-id="task-herbs"] [aria-label="Edit Gather Moon Herbs"]').click();
    await tick();
    flushSync();

    const table = target.querySelector('[data-gathering-task-drops-table]');
    assert.ok(table.classList.contains('is-ranked-mode'), 'drop table should opt into ranked-mode layout');
    const rankCells = table.querySelectorAll('[data-gathering-task-drop-rank-cell]');
    assert.equal(rankCells.length, 3, 'every visible drop row should expose a rank cell');
    const ranks = Array.from(rankCells).map(cell => cell.querySelector('[data-gathering-task-drop-rank]').textContent.trim());
    assert.deepEqual(ranks, ['#1', '#2', '#3'], 'rank labels should reflect 1-indexed position in dropRows');

    const firstRow = target.querySelector('[data-gathering-task-drop-id="drop-rank-1"]');
    const lastRow = target.querySelector('[data-gathering-task-drop-id="drop-rank-3"]');
    assert.equal(firstRow.querySelector('[data-gathering-task-drop-move="up"]').disabled, true, 'first row should not be movable up');
    assert.equal(lastRow.querySelector('[data-gathering-task-drop-move="down"]').disabled, true, 'last row should not be movable down');

    firstRow.querySelector('[data-gathering-task-drop-move="down"]').click();
    await tick();
    flushSync();

    const reorderedIds = Array.from(target.querySelectorAll('[data-gathering-task-drop-id]')).map(node => node.dataset.gatheringTaskDropId);
    assert.deepEqual(reorderedIds, ['drop-rank-2', 'drop-rank-1', 'drop-rank-3'], 'moving the top row down should swap it with its neighbor in dropRows');
    const updatedRanks = Array.from(target.querySelectorAll('[data-gathering-task-drop-rank]')).map(node => node.textContent.trim());
    assert.deepEqual(updatedRanks, ['#1', '#2', '#3'], 'rank labels should re-derive from the new array order');
  });

  it('hides the drop rank column when the reward selection mode is not highestRankedDrop', async () => {
    const dropRows = [
      { id: 'drop-unranked-1', componentId: 'c1', quantity: 1, dropRate: 70, enabled: true },
      { id: 'drop-unranked-2', componentId: 'c1', quantity: 1, dropRate: 40, enabled: true }
    ];
    target = document.createElement('div');
    document.body.appendChild(target);
    mounted = mount(Component, {
      target,
      props: {
        store: createStore([], { taskDropRows: dropRows, rewardSelectionMode: 'allDrops' }),
        services: { openCurrentAdmin: () => {} }
      }
    });
    flushSync();

    navButton('Gathering').click();
    await tick();
    flushSync();
    gatheringSubitem('Tasks').click();
    await tick();
    flushSync();
    target.querySelector('[data-gathering-task-id="task-herbs"] [aria-label="Edit Gather Moon Herbs"]').click();
    await tick();
    flushSync();

    const table = target.querySelector('[data-gathering-task-drops-table]');
    assert.equal(table.classList.contains('is-ranked-mode'), false, 'allDrops mode should not opt into ranked layout');
    assert.equal(table.querySelectorAll('[data-gathering-task-drop-rank-cell]').length, 0, 'allDrops mode should not render rank cells');
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
          gatheringLibraryTools: [{
            id: 'tool-catalyst',
            label: 'Artisan Catalyst',
            enabled: true,
            componentId: 'c1',
            requirement: null,
            breakage: { mode: 'limitedUses', maxUses: null },
            onBreak: { mode: 'destroy' }
          }],
          toolsDraft: [{
            id: 'tool-catalyst',
            label: 'Artisan Catalyst',
            enabled: true,
            componentId: 'c1',
            requirement: null,
            breakage: { mode: 'limitedUses', maxUses: null },
            onBreak: { mode: 'destroy' }
          }]
        }),
        services: { openCurrentAdmin: () => {} }
      }
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
    assert.equal(target.querySelector('.manager-header').textContent.includes('Back to Gathering'), false);
    assert.equal(target.querySelector('.manager-header').textContent.includes('Unsaved'), false);
    assert.equal(target.querySelector('.manager-header').textContent.includes('Delete tool'), false);
    assert.equal(target.querySelector('.manager-header').textContent.includes('Save changes'), false);
    assert.equal(target.querySelector('.manager-header').textContent.includes('Import'), false);
    assert.equal(target.querySelector('.manager-header').textContent.includes('Export'), false);
    assert.equal(target.querySelector('.manager-header').textContent.includes('Create'), false);

    const toolInspector = target.querySelector('[data-manager-tool-inspector]');
    assert.ok(toolInspector.textContent.includes('Artisan Catalyst'));
    assert.ok(toolInspector.querySelector('.manager-tools-dirty-chip').textContent.includes('Unsaved'));
    assert.ok(toolInspector.querySelector('.manager-tools-dirty-chip .fa-save'), 'inspector dirty pip should include the save icon');
    const inspectorActions = toolInspector.querySelector('.manager-tool-inspector-actions');
    assert.ok(inspectorActions, 'selected tool inspector header card should own tool actions');
    assert.equal(inspectorActions.querySelectorAll('.manager-button').length, 2);
    assert.ok(inspectorActions.querySelector('.manager-button.is-danger').textContent.includes('Delete tool'));
    assert.ok(inspectorActions.querySelector('.manager-button.is-primary').textContent.includes('Save changes'));

    inspectorActions.querySelector('.manager-button.is-primary').click();
    await tick();
    flushSync();
    assert.ok(calls.some(call => call[0] === 'saveToolDraft' && call[1] === 'tool-catalyst'));

    inspectorActions.querySelector('.manager-button.is-danger').click();
    await tick();
    flushSync();
    assert.ok(calls.some(call => call[0] === 'deleteToolFromDraft' && call[1] === 'tool-catalyst'));
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
              onBreak: { mode: 'destroy' }
            },
            {
              id: 'tool-mail',
              label: 'Draconic Scale Mail',
              enabled: true,
              componentId: 'c2',
              requirement: null,
              breakage: { mode: 'limitedUses', maxUses: null },
              onBreak: { mode: 'destroy' }
            }
          ]
        }),
        services: { openCurrentAdmin: () => {} }
      }
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
    assert.ok(dirtyRow.querySelector('.manager-tools-row-dirty-slot .manager-tools-dirty-chip').textContent.includes('Unsaved'));
    assert.ok(dirtyRow.querySelector('.manager-tools-row-dirty-slot .fa-save'), 'row dirty pip should include the save icon');
    assert.equal(dirtyRow.querySelector('.manager-tools-row-actions .manager-tools-dirty-chip'), null);
    assert.equal(cleanRow.querySelector('.manager-tools-row-dirty-slot .manager-tools-dirty-chip'), null);
    assert.equal(dirtyRow.querySelector('[aria-label="More actions"]'), null);
    assert.equal(dirtyRow.querySelectorAll('.manager-tools-row-actions .manager-icon-button').length, 1);
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
          toolsDraft: [{
            id: 'tool-catalyst',
            label: 'Artisan Catalyst',
            enabled: true,
            componentId: 'c1',
            requirement: null,
            breakage: { mode: 'limitedUses', maxUses: null },
            onBreak: { mode: 'destroy' }
          }]
        }),
        services: {
          openCurrentAdmin: () => {},
          confirmDirtyToolsNavigation: () => {
            calls.push(['confirmDirtyToolsNavigation']);
            return 'save';
          }
        }
      }
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

    assert.ok(calls.some(call => call[0] === 'confirmDirtyToolsNavigation'));
    assert.ok(calls.some(call => call[0] === 'saveAllDirtyToolDrafts'));
    assert.ok(calls.some(call => call[0] === 'cancelToolsDraft'));
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
          toolsDraft: [{
            id: 'tool-catalyst',
            label: 'Artisan Catalyst',
            enabled: true,
            componentId: 'c1',
            requirement: null,
            breakage: { mode: 'limitedUses', maxUses: null },
            onBreak: { mode: 'destroy' }
          }]
        }),
        services: { openCurrentAdmin: () => {} }
      }
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
    assert.ok(row.querySelector('[data-manager-tool-editor]'), 'row click should expand the tool editor');

    row.querySelector('.manager-tools-row-body').click();
    await tick();
    flushSync();
    assert.ok(row.querySelector('[data-manager-tool-editor]'), 'row click should keep an already expanded tool open');

    row.querySelector('.manager-tools-row-actions .manager-icon-button:last-child').click();
    await tick();
    flushSync();
    assert.equal(row.querySelector('[data-manager-tool-editor]'), null, 'chevron button should remain the explicit collapse control');
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
          toolsDraft: [{
            id: 'tool-catalyst',
            label: '',
            enabled: true,
            componentId: 'c1',
            requirement: null,
            breakage: { mode: 'limitedUses', maxUses: null },
            onBreak: { mode: 'destroy' }
          }]
        }),
        services: { openCurrentAdmin: () => {} }
      }
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
          effectAllowed: ''
        }
      });
      card.dispatchEvent(dragStart);
      return raw;
    }

    function dropPayloadOn(node, raw) {
      const dropEvent = new Event('drop', { bubbles: true, cancelable: true });
      Object.defineProperty(dropEvent, 'dataTransfer', {
        value: { getData: (type) => type === 'text/plain' ? raw : '' }
      });
      node.dispatchEvent(dropEvent);
    }

    const dropZone = target.querySelector('[data-manager-tool-component-drop-zone="tool-catalyst"]');
    assert.ok(dropZone);
    assert.ok(dropZone.classList.contains('is-component-drop-zone'));

    const payload = dragPayloadFrom(target.querySelector('[data-manager-tools-component-card="c2"]'));
    assert.deepEqual(JSON.parse(payload), { type: 'FabricateManagedComponent', componentId: 'c2' });
    dropPayloadOn(dropZone, payload);
    await tick();
    flushSync();

    assert.ok(calls.some(call => call[0] === 'updateToolInDraft' && call[1] === 'tool-catalyst' && call[2].componentId === 'c2'));
    assert.ok(target.querySelector('[data-manager-tool-id="tool-catalyst"]').textContent.includes('Glass Vial'), 'row drop should stage the replacement component on the tool');
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
          toolsDraft: [{
            id: 'tool-catalyst',
            label: 'Artisan Catalyst',
            enabled: true,
            componentId: 'c1',
            requirement: null,
            breakage: { mode: 'limitedUses', maxUses: null },
            onBreak: { mode: 'destroy' }
          }]
        }),
        services: { openCurrentAdmin: () => {} }
      }
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
    assert.ok(calls.some(call => call[0] === 'addToolToDraft' && call.length === 1), 'clicking the add stub should still create a blank tool');

    let raw = '';
    const dragStart = new Event('dragstart', { bubbles: true, cancelable: true });
    Object.defineProperty(dragStart, 'dataTransfer', {
      value: {
        setData: (type, value) => {
          if (type === 'text/plain') raw = value;
        },
        effectAllowed: ''
      }
    });
    target.querySelector('[data-manager-tools-component-card="c2"]').dispatchEvent(dragStart);

    const dropEvent = new Event('drop', { bubbles: true, cancelable: true });
    Object.defineProperty(dropEvent, 'dataTransfer', {
      value: { getData: (type) => type === 'text/plain' ? raw : '' }
    });
    addStub.dispatchEvent(dropEvent);
    await tick();
    flushSync();

    assert.ok(calls.some(call => call[0] === 'addToolToDraft' && call[1]?.componentId === 'c2'));
  });

  it('imports an item dropped on the add-tool stub before creating the gathering tool', async () => {
    const calls = [];
    const importedDrops = [];
    target = document.createElement('div');
    document.body.appendChild(target);
    mounted = mount(Component, {
      target,
      props: {
        store: createStore(calls, {
          toolsDraft: [{
            id: 'tool-catalyst',
            label: 'Artisan Catalyst',
            enabled: true,
            componentId: 'c1',
            requirement: null,
            breakage: { mode: 'limitedUses', maxUses: null },
            onBreak: { mode: 'destroy' }
          }]
        }),
        services: {
          openCurrentAdmin: () => {},
          importSingleManagedItemFromDrop: async (data) => {
            importedDrops.push(data);
            return { id: 'c2', name: 'Glass Vial' };
          }
        }
      }
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
      value: { getData: (type) => type === 'text/plain' ? JSON.stringify(itemPayload) : '' }
    });
    target.querySelector('[data-manager-tools-add-stub]').dispatchEvent(dropEvent);
    await Promise.resolve();
    await tick();
    flushSync();

    assert.deepEqual(importedDrops, [itemPayload]);
    assert.ok(calls.some(call => call[0] === 'addToolToDraft' && call[1]?.componentId === 'c2'));
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
          toolsDraft: [{
            id: 'tool-catalyst',
            label: 'Artisan Catalyst',
            enabled: true,
            componentId: 'c1',
            requirement: { provider: 'pf2e', formula: '@tools.alchemist.value', macroUuid: 'Macro.old' },
            breakage: { mode: 'limitedUses', maxUses: null },
            onBreak: { mode: 'destroy' }
          }]
        }),
        services: { openCurrentAdmin: () => {} }
      }
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
    assert.ok(editor.textContent.includes('Example: @tools.alchemist.value'));
    assert.ok(!editor.textContent.includes('Example: @abilities.str.mod'));
    assert.ok(!editor.textContent.includes('Example: @skills.prc.total'));

    const expressionInput = editor.querySelector('.manager-tools-requirement-expression input');
    assert.equal(expressionInput.value, '@tools.alchemist.value');
    expressionInput.value = '@tools.smith.value';
    expressionInput.dispatchEvent(new Event('input', { bubbles: true }));
    await tick();
    flushSync();

    assert.ok(calls.some(call => call[0] === 'updateToolInDraft'
      && call[1] === 'tool-catalyst'
      && call[2].requirement?.provider === 'dnd5e'
      && call[2].requirement?.formula === '@tools.smith.value'
      && call[2].requirement?.macroUuid === ''));
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
          toolsDraft: [{
            id: 'tool-catalyst',
            label: 'Artisan Catalyst',
            enabled: true,
            componentId: 'c1',
            requirement: null,
            breakage: { mode: 'breakageChance', breakageChance: 25 },
            onBreak: { mode: 'destroy' }
          }]
        }),
        services: { openCurrentAdmin: () => {} }
      }
    });
    flushSync();

    navButton('Gathering').click();
    await tick();
    flushSync();
    navButton('Tools').click();
    await tick();
    flushSync();

    const control = target.querySelector('[data-manager-tool-editor] .manager-tool-breakage-chance-control');
    assert.ok(control);
    assert.ok(control.classList.contains('manager-drop-rate-control'));
    for (const tierClass of ['is-none', 'is-legendary', 'is-very-rare', 'is-rare', 'is-uncommon', 'is-common', 'is-guaranteed']) {
      assert.equal(control.classList.contains(tierClass), false, `breakage chance slider should not use ${tierClass}`);
    }
    assert.ok(control.getAttribute('style').includes('--fab-drop-rate-value: 25%;'));
    assert.ok(control.getAttribute('style').includes('--fab-tool-breakage-chance-color: color-mix(in srgb, var(--fab-warning) 50%, var(--fab-success) 50%);'));

    const range = control.querySelector('input[type="range"]');
    assert.ok(range);
    range.value = '75';
    range.dispatchEvent(new Event('input', { bubbles: true }));
    await tick();
    flushSync();

    assert.ok(calls.some(call => call[0] === 'updateToolInDraft'
      && call[1] === 'tool-catalyst'
      && call[2].breakage?.mode === 'breakageChance'
      && call[2].breakage?.breakageChance === 75));
    assert.ok(control.getAttribute('style').includes('--fab-tool-breakage-chance-color: color-mix(in srgb, var(--fab-danger) 50%, var(--fab-warning) 50%);'));

    const percentInput = target.querySelector('[data-manager-tool-editor] .manager-drop-rate-percent input[type="text"]');
    percentInput.value = '42';
    percentInput.dispatchEvent(new Event('input', { bubbles: true }));
    await tick();
    flushSync();

    assert.ok(calls.some(call => call[0] === 'updateToolInDraft'
      && call[1] === 'tool-catalyst'
      && call[2].breakage?.mode === 'breakageChance'
      && call[2].breakage?.breakageChance === 42));
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
          toolsDraft: [{
            id: 'tool-catalyst',
            label: 'Artisan Catalyst',
            enabled: true,
            componentId: 'c1',
            requirement: null,
            breakage: { mode: 'limitedUses', maxUses: null },
            onBreak: { mode: 'replaceWith', replacementComponentId: null }
          }]
        }),
        services: { openCurrentAdmin: () => {} }
      }
    });
    flushSync();

    navButton('Gathering').click();
    await tick();
    flushSync();
    navButton('Tools').click();
    await tick();
    flushSync();

    const replacementDropZone = target.querySelector('[data-manager-tool-replacement-drop-zone="tool-catalyst"]');
    assert.ok(replacementDropZone);
    const replacementField = replacementDropZone.parentElement;
    assert.ok(replacementField.classList.contains('manager-tools-replacement-field'));
    assert.equal(replacementField.classList.contains('manager-tools-inline-field'), false);
    assert.equal(replacementField.firstElementChild, replacementDropZone);
    assert.equal(
      Array.from(replacementField.children).some(child => child.tagName === 'SPAN' && child.textContent.trim() === 'Replacement component'),
      false
    );
    assert.equal(replacementDropZone.querySelector('select'), null, 'replacement component should use the primary drop-zone layout instead of a select');
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
        effectAllowed: ''
      }
    });
    target.querySelector('[data-manager-tools-component-card="c2"]').dispatchEvent(dragStart);

    const dropEvent = new Event('drop', { bubbles: true, cancelable: true });
    Object.defineProperty(dropEvent, 'dataTransfer', {
      value: { getData: (type) => type === 'text/plain' ? raw : '' }
    });
    replacementDropZone.dispatchEvent(dropEvent);
    await tick();
    flushSync();

    assert.ok(calls.some(call => call[0] === 'updateToolInDraft'
      && call[1] === 'tool-catalyst'
      && call[2].onBreak?.mode === 'replaceWith'
      && call[2].onBreak?.replacementComponentId === 'c2'));
    assert.ok(replacementDropZone.textContent.includes('Glass Vial'));

    const clearEvent = new MouseEvent('contextmenu', { bubbles: true, cancelable: true });
    replacementDropZone.querySelector('.manager-drop-component-button').dispatchEvent(clearEvent);
    await tick();
    flushSync();

    assert.ok(calls.some(call => call[0] === 'updateToolInDraft'
      && call[1] === 'tool-catalyst'
      && call[2].onBreak?.mode === 'replaceWith'
      && call[2].onBreak?.replacementComponentId === null));
  });

  it('shows setup guidance and keeps create routing when a gathering system has no environments', async () => {
    const calls = [];
    target = document.createElement('div');
    document.body.appendChild(target);
    mounted = mount(Component, {
      target,
      props: {
        store: createStore(calls, { emptyEnvironments: true }),
        services: { openCurrentAdmin: () => {} }
      }
    });
    flushSync();

    navButton('Gathering').click();
    await tick();
    flushSync();

    assert.equal(target.querySelector('.fabricate-manager').dataset.managerView, 'environments');
    const gatheringItems = Array.from(target.querySelectorAll('.manager-nav-subitem'));
    assert.deepEqual(
      gatheringItems.map(item => item.querySelector('.manager-nav-label')?.textContent.trim()),
      ['Environments', 'Tasks', 'Hazards', 'Settings']
    );
    assert.deepEqual(
      gatheringItems.map(item => item.querySelector('.manager-nav-count')?.textContent.trim() ?? null),
      ['0', '3', '0', null]
    );
    assert.equal(gatheringSubitem('Environments').getAttribute('aria-current'), 'page');
    assert.ok(target.textContent.includes('Prepare gathering building blocks first'));
    assert.ok(target.textContent.includes('Define gathering tasks and hazards before creating environments'));
    assert.ok(target.textContent.includes('Review tasks'));
    assert.ok(target.textContent.includes('Review hazards'));
    assert.ok(target.textContent.includes('Plan gathering content'));
    assert.ok(target.textContent.includes('Define gathering tasks with their checks'));
    assert.ok(target.textContent.includes('Prepare encounter and hazard options'));
    assert.ok(target.textContent.includes('Create environments after the gathering task and hazard libraries are ready to attach.'));
    assert.ok(target.textContent.includes('Gathering docs'));
    assert.equal(target.textContent.includes('Select an environment'), false);

    Array.from(target.querySelectorAll('.manager-table-scroll .manager-button'))
      .find(button => button.textContent.includes('Review tasks'))
      .click();
    await tick();
    flushSync();

    assert.equal(gatheringSubitem('Tasks').getAttribute('aria-current'), 'page');
    assert.ok(target.textContent.includes('Gather Moon Herbs'));
    assert.ok(target.querySelector('[data-gathering-tasks-browser]'));
    assert.ok(target.querySelector('[data-gathering-task-inspector]'));
    assert.equal(target.querySelector('.manager-inspector').textContent.includes('Plan gathering content'), false);

    gatheringSubitem('Environments').click();
    await tick();
    flushSync();

    Array.from(target.querySelectorAll('.manager-table-scroll .manager-button'))
      .find(button => button.textContent.includes('Review hazards'))
      .click();
    await tick();
    flushSync();

    assert.equal(gatheringSubitem('Hazards').getAttribute('aria-current'), 'page');
    assert.ok(target.querySelector('[data-gathering-hazards-browser]'), 'Review hazards button should land on the hazard library');

    gatheringSubitem('Environments').click();
    await tick();
    flushSync();

    target.querySelector('.manager-table-scroll .manager-button.is-primary').click();
    await tick();
    flushSync();

    assert.equal(target.querySelector('.fabricate-manager').dataset.managerView, 'environment-edit');
    assert.ok(calls.some(call => call[0] === 'createEnvironmentDraft'));
  });

  it('shows create guidance when the gathering task library is empty', async () => {
    const calls = [];
    target = document.createElement('div');
    document.body.appendChild(target);
    mounted = mount(Component, {
      target,
      props: {
        store: createStore(calls, { emptyGatheringTasks: true }),
        services: { openCurrentAdmin: () => {} }
      }
    });
    flushSync();

    navButton('Gathering').click();
    await tick();
    flushSync();
    gatheringSubitem('Tasks').click();
    await tick();
    flushSync();

    assert.ok(target.textContent.includes('No gathering tasks yet'));
    assert.ok(target.textContent.includes('Create gathering tasks before attaching them to environments.'));
    target.querySelector('[data-gathering-tasks-browser] .manager-button.is-primary').click();
    await tick();
    flushSync();

    assert.deepEqual(calls.find(call => call[0] === 'addGatheringLibraryTask'), ['addGatheringLibraryTask', 'alchemy']);
  });

  it('shows setup guidance and keeps create routing when a system has no recipes', async () => {
    const calls = [];
    target = document.createElement('div');
    document.body.appendChild(target);
    mounted = mount(Component, {
      target,
      props: {
        store: createStore(calls, { emptyRecipes: true }),
        services: { openCurrentAdmin: () => {} }
      }
    });
    flushSync();

    navButton('Recipes').click();
    await tick();
    flushSync();

    assert.equal(target.querySelector('.fabricate-manager').dataset.managerView, 'recipes');
    assert.ok(target.textContent.includes('No recipes yet'));
    assert.ok(target.textContent.includes('Set up recipes'));
    assert.ok(target.textContent.includes('Choose the recipe structure supported by the selected system.'));
    assert.ok(target.textContent.includes('Recipe docs'));
    assert.equal(target.textContent.includes('Select a recipe'), false);

    target.querySelector('.manager-table-scroll .manager-button.is-primary').click();
    assert.ok(calls.some(call => call[0] === 'createRecipe'));
  });

  it('points empty recipe setup to Components when the system has no components', async () => {
    const calls = [];
    target = document.createElement('div');
    document.body.appendChild(target);
    mounted = mount(Component, {
      target,
      props: {
        store: createStore(calls, { emptyRecipes: true, emptyComponents: true }),
        services: { openCurrentAdmin: () => {} }
      }
    });
    flushSync();

    navButton('Recipes').click();
    await tick();
    flushSync();

    assert.equal(target.querySelector('.fabricate-manager').dataset.managerView, 'recipes');
    assert.ok(target.textContent.includes('No recipes yet'));
    assert.ok(target.textContent.includes('Add components before creating recipes'));
    assert.ok(target.textContent.includes('Open Components and drop world, compendium, pack, or folder items into this system.'));
    assert.ok(target.textContent.includes('Add components'));
    assert.equal(target.textContent.includes('Choose the recipe structure supported by the selected system.'), false);

    Array.from(target.querySelectorAll('.manager-setup-links .manager-button'))
      .find(button => button.textContent.includes('Add components'))
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
        services: { openCurrentAdmin: () => {}, onDropItem: (data) => calls.push(['dropItem', data]) }
      }
    });
    flushSync();

    navButton('Components').click();
    await tick();
    flushSync();

    assert.equal(target.querySelector('.fabricate-manager').dataset.managerView, 'components');
    assert.ok(target.textContent.includes('No components yet'));
    assert.ok(target.textContent.includes('Set up components'));
    assert.ok(target.textContent.includes('Drop world, compendium, pack, or folder items into the component browser.'));
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
        services: { openCurrentAdmin: () => {} }
      }
    });
    flushSync();

    navButton('Essences').click();
    await tick();
    flushSync();

    assert.equal(target.querySelector('.fabricate-manager').dataset.managerView, 'essences');
    assert.ok(target.textContent.includes('No essences yet'));
    assert.ok(target.textContent.includes('Set up essences'));
    assert.ok(target.textContent.includes('Create an essence with a clear name, icon, and description.'));
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
        services: { openCurrentAdmin: () => {} }
      }
    });
    flushSync();

    navButton('Gathering').click();
    await tick();
    flushSync();
    target.querySelector('.manager-header-actions .manager-button.is-primary').click();
    await tick();
    flushSync();

    assert.equal(target.querySelector('.fabricate-manager').dataset.managerView, 'environment-edit');
    assert.equal(target.querySelector('.manager-environment-details-band .manager-card-title').textContent.trim(), 'New Gathering Environment');
    assert.equal(target.querySelector('.manager-inspector'), null);
    assert.ok(calls.some(call => call[0] === 'createEnvironmentDraft'));
  });

  // NOTE: previously covered tests for environment-edit input wiring and validation
  // tab routing were removed when the environment editor was placeholder'd out for
  // redesign. The store-level dirty-draft, cancel, and validation behaviours remain
  // covered by tests/stores/adminStore.test.js. Reinstate mounted coverage when the
  // new editor lands.

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
          onDropItem: () => {}
        }
      }
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
      .find(button => button.textContent.includes('ore'))
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
          onEditSystem: () => { onEditSystemCalled = true; }
        }
      }
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
    target.querySelector('[data-system-id="smithing"]').dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
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
    assert.ok(target.textContent.includes('System settings'));
    assert.ok(target.querySelector('.manager-system-edit-form'));
    assert.deepEqual(calls.slice(-4), [
      ['selectSystem', 'smithing'],
      ['selectSystem', 'smithing'],
      ['exportSystem', 'smithing'],
      ['selectSystem', 'smithing']
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
        services: { openCurrentAdmin: () => {} }
      }
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
    target.querySelector('.manager-system-edit-form').dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));

    const resolution = target.querySelector('#manager-system-resolution-mode');
    resolution.value = 'mapped';
    resolution.dispatchEvent(new Event('change', { bubbles: true }));
    await Promise.resolve();

    const advanced = target.querySelector('[data-edit-control="advanced-options"] input');
    advanced.checked = false;
    advanced.dispatchEvent(new Event('change', { bubbles: true }));

    const gathering = target.querySelector('[data-feature-key="gathering"] input');
    gathering.checked = false;
    gathering.dispatchEvent(new Event('change', { bubbles: true }));

    assert.ok(calls.some(call => call[0] === 'saveSystemDetails'
      && call[1] === 'Greater Alchemy'
      && call[2] === 'Updated potion work'
      && call[3] === true));
    assert.ok(calls.some(call => call[0] === 'setResolutionMode' && call[1] === 'mapped'));
    assert.ok(calls.some(call => call[0] === 'toggleAdvancedOptions' && call[1] === false));
    assert.ok(calls.some(call => call[0] === 'toggleFeature' && call[1] === 'gathering' && call[2] === false));
  });

  it('rolls back system edit controls when existing store callbacks reject changes', async () => {
    const calls = [];
    target = document.createElement('div');
    document.body.appendChild(target);
    mounted = mount(Component, {
      target,
      props: {
        store: createStore(calls, { resolutionModeResult: false, toggleFeatureResult: false }),
        services: { openCurrentAdmin: () => {} }
      }
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

    const resolution = target.querySelector('#manager-system-resolution-mode');
    resolution.value = 'progressive';
    resolution.dispatchEvent(new Event('change', { bubbles: true }));
    await Promise.resolve();
    await tick();
    flushSync();
    assert.equal(resolution.value, 'alchemy');

    const gathering = target.querySelector('[data-feature-key="gathering"] input');
    gathering.checked = false;
    gathering.dispatchEvent(new Event('change', { bubbles: true }));
    await Promise.resolve();
    await tick();
    flushSync();
    assert.equal(gathering.checked, true);

    assert.ok(calls.some(call => call[0] === 'setResolutionMode' && call[1] === 'progressive'));
    assert.ok(calls.some(call => call[0] === 'toggleFeature' && call[1] === 'gathering' && call[2] === false));
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
            { id: 'tool-pickaxe', label: 'Pickaxe', enabled: true, componentId: 'c1', requirement: null, breakage: { mode: 'limitedUses', maxUses: null }, onBreak: { mode: 'destroy' } },
            { id: 'tool-lantern', label: 'Lantern', enabled: true, componentId: 'c2', requirement: null, breakage: { mode: 'limitedUses', maxUses: null }, onBreak: { mode: 'destroy' } }
          ],
          taskInitialToolIds: ['tool-pickaxe']
        }),
        services: { openCurrentAdmin: () => {} }
      }
    });
    flushSync();

    navButton('Gathering').click();
    await tick();
    flushSync();
    gatheringSubitem('Tasks').click();
    await tick();
    flushSync();
    target.querySelector('[data-gathering-task-id="task-herbs"] [aria-label="Edit Gather Moon Herbs"]').click();
    await tick();
    flushSync();

    const section = target.querySelector('[data-gathering-task-required-tools]');
    assert.ok(section, 'required tools section should render in the task editor');

    const attached = section.querySelectorAll('[data-gathering-task-required-tool-pill]');
    assert.equal(attached.length, 1);
    assert.equal(attached[0].getAttribute('data-gathering-task-required-tool-pill'), 'tool-pickaxe');
    assert.ok(attached[0].textContent.includes('Pickaxe'));

    const resultCards = section.querySelectorAll('[data-gathering-task-required-tools-card]');
    assert.equal(resultCards.length, 1);
    assert.equal(resultCards[0].getAttribute('data-gathering-task-required-tools-card'), 'tool-lantern');

    resultCards[0].click();
    await tick();
    flushSync();

    const afterAddPills = target.querySelectorAll('[data-gathering-task-required-tool-pill]');
    assert.equal(afterAddPills.length, 2);
    const afterAddPillIds = Array.from(afterAddPills).map(node => node.getAttribute('data-gathering-task-required-tool-pill'));
    assert.deepEqual(afterAddPillIds.sort(), ['tool-lantern', 'tool-pickaxe']);
    assert.equal(target.querySelectorAll('[data-gathering-task-required-tools-card]').length, 0, 'attached tools should be removed from the result grid');

    const lanternPill = Array.from(afterAddPills).find(node => node.getAttribute('data-gathering-task-required-tool-pill') === 'tool-pickaxe');
    lanternPill.querySelector('.manager-availability-remove').click();
    await tick();
    flushSync();
    const afterRemovePills = target.querySelectorAll('[data-gathering-task-required-tool-pill]');
    assert.equal(afterRemovePills.length, 1);
    assert.equal(afterRemovePills[0].getAttribute('data-gathering-task-required-tool-pill'), 'tool-lantern');

    target.querySelector('.manager-header-actions .manager-button.is-primary').click();
    await tick();
    flushSync();
    assert.ok(
      calls.some(call => call[0] === 'updateGatheringLibraryTask'
        && call[1] === 'alchemy'
        && call[2] === 'task-herbs'
        && Array.isArray(call[3].toolIds)
        && call[3].toolIds.length === 1
        && call[3].toolIds[0] === 'tool-lantern'),
      `expected Save to persist toolIds: ['tool-lantern'], got ${JSON.stringify(calls.filter(c => c[0] === 'updateGatheringLibraryTask'))}`
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
          taskInitialToolIds: ['tool-ghost']
        }),
        services: { openCurrentAdmin: () => {} }
      }
    });
    flushSync();

    navButton('Gathering').click();
    await tick();
    flushSync();
    gatheringSubitem('Tasks').click();
    await tick();
    flushSync();
    target.querySelector('[data-gathering-task-id="task-herbs"] [aria-label="Edit Gather Moon Herbs"]').click();
    await tick();
    flushSync();

    const section = target.querySelector('[data-gathering-task-required-tools]');
    const stalePill = section.querySelector('[data-gathering-task-required-tool-pill="tool-ghost"]');
    assert.ok(stalePill, 'stale tool reference should render as a pill');
    assert.ok(stalePill.classList.contains('is-stale'));
    assert.ok(stalePill.textContent.includes('Deleted tool'));

    assert.ok(section.querySelector('[data-gathering-task-required-tools-library-empty]'), 'library-empty placeholder should render when no tools exist');
    assert.equal(section.querySelector('[data-gathering-task-required-tools-search]'), null, 'search input should hide when library is empty');

    stalePill.querySelector('.manager-availability-remove').click();
    await tick();
    flushSync();

    const afterClearPills = target.querySelectorAll('[data-gathering-task-required-tool-pill]');
    assert.equal(afterClearPills.length, 0, 'removing the stale chip should clear the dangling reference');
    assert.ok(target.querySelector('[data-gathering-task-required-tools]').textContent.includes('No tools required'));

    target.querySelector('.manager-header-actions .manager-button.is-primary').click();
    await tick();
    flushSync();
    assert.ok(
      calls.some(call => call[0] === 'updateGatheringLibraryTask'
        && call[1] === 'alchemy'
        && call[2] === 'task-herbs'
        && Array.isArray(call[3].toolIds)
        && call[3].toolIds.length === 0),
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
            { id: 'tool-pickaxe', label: 'Pickaxe', enabled: true, componentId: 'c1', requirement: null, breakage: { mode: 'limitedUses', maxUses: null }, onBreak: { mode: 'destroy' } },
            { id: 'tool-lantern', label: 'Lantern', enabled: true, componentId: 'c2', requirement: null, breakage: { mode: 'limitedUses', maxUses: null }, onBreak: { mode: 'destroy' } }
          ]
        }),
        services: { openCurrentAdmin: () => {} }
      }
    });
    flushSync();

    navButton('Gathering').click();
    await tick();
    flushSync();
    gatheringSubitem('Tasks').click();
    await tick();
    flushSync();
    target.querySelector('[data-gathering-task-id="task-herbs"] [aria-label="Edit Gather Moon Herbs"]').click();
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
    assert.equal(filteredCards[0].getAttribute('data-gathering-task-required-tools-card'), 'tool-lantern');
  });
});
