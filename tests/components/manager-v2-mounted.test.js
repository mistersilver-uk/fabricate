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
const environmentComponentNames = [
  'EnvironmentActionMenu',
  'CatalystList',
  'EnvironmentFields',
  'EnvironmentList',
  'EnvironmentValidationFeedback',
  'FailureOutcomeFields',
  'ProgressiveFields',
  'ResultGroups',
  'ResultSelectionFields',
  'TaskBaseFields',
  'TaskList',
  'TimeRequirementFields',
  'VisibilityFields'
];
const sharedComponentNames = [
  'ImagePathPicker',
  'IconPicker',
  'ManagerV2ColorPicker',
  'ManagerV2ColorPopover',
  'EssenceSourceSelector',
  'Pagination'
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

function compileManagerV2Root() {
  writeCompiledSvelte('src/ui/svelte/apps/manager-v2/CraftingSystemManagerV2Root.svelte');
  writeCompiledSvelte('src/ui/svelte/apps/manager-v2/ComponentEditView.svelte');
  writeCompiledSvelte('src/ui/svelte/apps/manager-v2/ComponentsBrowserView.svelte');
  writeCompiledSvelte('src/ui/svelte/apps/manager-v2/EnvironmentEditView.svelte');
  writeCompiledSvelte('src/ui/svelte/apps/manager-v2/EnvironmentsBrowserView.svelte');
  writeCompiledSvelte('src/ui/svelte/apps/manager-v2/EssenceBrowserView.svelte');
  writeCompiledSvelte('src/ui/svelte/apps/manager-v2/EssenceEditView.svelte');
  writeCompiledSvelte('src/ui/svelte/apps/manager-v2/GatheringTasksBrowserView.svelte');
  writeCompiledSvelte('src/ui/svelte/apps/manager-v2/RecipesBrowserView.svelte');
  writeCompiledSvelte('src/ui/svelte/apps/manager-v2/SystemEditView.svelte');
  writeCompiledSvelte('src/ui/svelte/apps/manager-v2/SystemsBrowserView.svelte');
  writeCompiledSvelte('src/ui/svelte/apps/manager-v2/TagsCategoriesView.svelte');
  writeCompiledSvelte('src/ui/svelte/apps/EnvironmentsTab.svelte');
  for (const componentName of environmentComponentNames) {
    writeCompiledSvelte(`src/ui/svelte/apps/environments/${componentName}.svelte`);
  }
  for (const componentName of sharedComponentNames) {
    writeCompiledSvelte(`src/ui/svelte/components/${componentName}.svelte`);
  }

  for (const utilPath of ['foundryBridge.js', 'essenceIcons.js', 'fontAwesomeFreeClassicIcons.js', 'iconPickerPopover.js', 'componentEditor.js']) {
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
  return Array.from(target.querySelectorAll('.manager-v2-nav-button'))
    .find(button => button.textContent.includes(labelText));
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
    { id: 'c1', name: 'Iron Ore', img: 'icons/commodities/metal/ore-chunk-grey.webp', sourceItemUuid: 'Compendium.fabricate.items.iron-ore' },
    { id: 'c2', name: 'Glass Vial', img: 'icons/containers/kitchenware/vase-clay-blue.webp' },
    { id: 'c3', name: 'Nightshade', img: 'icons/consumables/plants/nightshade.jpg' },
    { id: 'c4', name: 'Coal', img: 'icons/commodities/materials/bowl-powder-black.webp' }
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
      }
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
            rewardSelectionMode: 'highestRankedDrop',
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
              dropRows: [
                { id: 'drop-nightshade', componentId: 'c3', quantity: 2, dropRate: 80, enabled: true }
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
          hazards: []
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
      return { id: 'task-new', name: 'Reusable gathering task', dropRows: [] };
    },
    updateGatheringLibraryTask: (...args) => calls.push(['updateGatheringLibraryTask', ...args]),
    duplicateGatheringLibraryTask: (...args) => {
      calls.push(['duplicateGatheringLibraryTask', ...args]);
      return { id: 'task-copy', name: 'Gather Moon Herbs (Copy)', dropRows: [] };
    },
    deleteGatheringLibraryTask: (...args) => calls.push(['deleteGatheringLibraryTask', ...args])
  };
}

describe('CraftingSystemManagerV2 mounted behavior', () => {
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
    tempRoot = mkdtempSync(join(tmpdir(), 'fabricate-manager-v2-'));
    symlinkSync(resolve(repoRoot, 'node_modules'), join(tempRoot, 'node_modules'), 'junction');
    compileManagerV2Root();
    Component = (await import(pathToFileURL(join(
      tempRoot,
      'src/ui/svelte/apps/manager-v2/CraftingSystemManagerV2Root.svelte.js'
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

    assert.ok(target.querySelector('.fabricate-manager-v2'));
    assert.ok(target.querySelector('.manager-v2-rail'));
    assert.ok(target.querySelector('.manager-v2-main'));
    assert.ok(target.querySelector('.manager-v2-inspector'));
    assert.equal(target.querySelectorAll('.manager-v2-system-row').length, 2);
    assert.equal(target.querySelectorAll('.manager-v2-table-head [role="columnheader"]').length, 4);
    assert.equal(target.querySelectorAll('.manager-v2-count-cluster').length, 0);
    assert.ok(target.querySelector('.manager-v2-breadcrumbs'));
    assert.equal(target.querySelector('.manager-v2-header .manager-v2-heading > .manager-v2-kicker'), null);
    assert.equal(target.textContent.includes('Systems View'), false);
    assert.equal(target.querySelector('.manager-v2-section-header .manager-v2-action-group'), null);
    assert.equal(target.textContent.includes('Quick actions'), false);
    assert.deepEqual(
      Array.from(target.querySelectorAll('.manager-v2-nav-label')).map(label => label.textContent.trim()),
      ['System settings', 'Recipes', 'Components', 'Tags & Categories', 'Essences', 'Gathering', 'Rules', 'Graph']
    );
    assert.equal(
      Array.from(target.querySelectorAll('.manager-v2-header-actions .manager-v2-button'))
        .some(button => button.textContent.includes('Open current admin')),
      false,
      'system library header should not expose the legacy admin launch button'
    );
    const systemSettingsNav = Array.from(target.querySelectorAll('.manager-v2-nav-button'))
      .find(button => button.querySelector('.manager-v2-nav-label')?.textContent.trim() === 'System settings');
    assert.ok(systemSettingsNav, 'system settings nav button should render');
    assert.equal(systemSettingsNav.querySelector('.manager-v2-nav-count'), null, 'system settings nav should not show an Edit badge');
    assert.ok(target.textContent.includes('Alchemy'));
    assert.ok(target.textContent.includes('Potion and essence work'));
    assert.ok(target.textContent.includes('4'));
    assert.ok(target.textContent.includes('2'));

    const environmentFact = target.querySelector('[data-count-id="environments"]');
    assert.equal(environmentFact.textContent.trim().replace(/\s+/g, ' '), '2 Gathering environments');
    assert.equal(environmentFact.querySelector('.manager-v2-fact-leading')?.textContent.trim(), '2 Gathering');
    assert.equal(environmentFact.querySelector('.manager-v2-fact-label')?.textContent.trim(), 'environments');

    const systemHeroRow = target.querySelector('.manager-v2-inspector .manager-v2-inspector-title-row.is-hero-large');
    assert.ok(systemHeroRow, 'systems inspector should use the prominent hero title row');
    assert.ok(systemHeroRow.querySelector('.manager-v2-inspector-icon.is-hero-large'), 'systems inspector hero should render the icon at hero-large size');
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

    const navLabels = Array.from(target.querySelectorAll('.manager-v2-nav-label')).map(label => label.textContent.trim());
    assert.deepEqual(navLabels, []);
    assert.ok(target.textContent.includes('Crafting Systems'));
    assert.ok(target.textContent.includes('No crafting systems yet'));
    assert.ok(target.textContent.includes('Set up your first system'));
    assert.ok(target.textContent.includes('Create a system for one crafting discipline or ruleset.'));
    assert.ok(target.textContent.includes('Quickstart'));
    assert.equal(target.textContent.includes('Select a system'), false);
    assert.equal(target.querySelectorAll('.manager-v2-setup-card').length, 1);
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
      Array.from(target.querySelectorAll('.manager-v2-nav-label')).map(label => label.textContent.trim()),
      ['System settings', 'Recipes', 'Components', 'Tags & Categories', 'Rules', 'Graph']
    );

    const environmentFact = target.querySelector('[data-count-id="environments"]');
    assert.equal(environmentFact.textContent.trim().replace(/\s+/g, ' '), 'Gathering environments Off');
    assert.equal(environmentFact.querySelector('.manager-v2-fact-label')?.textContent.trim(), 'Gathering environments');
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
    assert.equal(target.querySelector('.fabricate-manager-v2').dataset.managerV2View, 'recipes');

    const systemCrumb = Array.from(target.querySelectorAll('.manager-v2-breadcrumbs button'))
      .find(button => button.textContent.trim() === 'Alchemy');
    systemCrumb.click();
    await Promise.resolve();
    await tick();
    flushSync();

    assert.equal(target.querySelector('.fabricate-manager-v2').dataset.managerV2View, 'system-edit');
    assert.ok(target.querySelector('.manager-v2-system-edit-form'));

    const scopeCard = target.querySelector('.manager-v2-scope-card');
    assert.ok(scopeCard, 'selected system scope card should render');
    assert.equal(scopeCard.querySelector('.manager-v2-scope-name')?.textContent.trim(), 'Alchemy');
    assert.equal(scopeCard.querySelector('.manager-v2-scope-name')?.tagName, 'SPAN');
    const returnButton = scopeCard.querySelector('.manager-v2-scope-return');
    assert.ok(returnButton, 'selected system scope should expose a return-to-library button');
    assert.equal(returnButton.getAttribute('aria-label'), 'Return to System Library');
    assert.equal(returnButton.getAttribute('title'), 'Return to System Library');

    const callsBeforeScopeNameClick = calls.length;
    scopeCard.querySelector('.manager-v2-scope-name').dispatchEvent(new MouseEvent('click', { bubbles: true }));
    await tick();
    flushSync();
    assert.equal(calls.length, callsBeforeScopeNameClick, 'clicking the selected system name should not route or clear selection');
    assert.equal(target.querySelector('.fabricate-manager-v2').dataset.managerV2View, 'system-edit');

    const callsBeforeReturn = calls.length;
    returnButton.click();
    await Promise.resolve();
    await tick();
    flushSync();

    assert.equal(calls.length, callsBeforeReturn, 'returning to system library should not call selectSystem');
    assert.equal(target.querySelector('.fabricate-manager-v2').dataset.managerV2View, 'systems');
    assert.ok(target.querySelector('.manager-v2-scope-card'), 'selected system scope should remain visible');
    assert.equal(target.querySelector('[data-system-id="alchemy"]').getAttribute('aria-selected'), 'true');
    assert.deepEqual(
      Array.from(target.querySelectorAll('.manager-v2-nav-label')).map(label => label.textContent.trim()),
      ['System settings', 'Recipes', 'Components', 'Tags & Categories', 'Essences', 'Gathering', 'Rules', 'Graph']
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

    assert.equal(target.querySelector('.fabricate-manager-v2').dataset.managerV2View, 'recipes');
    assert.equal(target.querySelectorAll('.manager-v2-recipe-row').length, 2);
    assert.ok(target.textContent.includes('Recipe library'));
    assert.ok(target.textContent.includes('Healing Draught'));
    assert.ok(target.textContent.includes('Restores a small amount of health.'));
    assert.ok(target.textContent.includes('Requirements'));
    assert.ok(target.textContent.includes('Player visibility'));
    const enabledRecipeToggle = target.querySelector('[data-recipe-id="r1"] .manager-v2-status-toggle');
    const disabledRecipeToggle = target.querySelector('[data-recipe-id="r2"] .manager-v2-status-toggle');
    assert.ok(enabledRecipeToggle, 'enabled recipe row should render the shared status toggle');
    assert.ok(disabledRecipeToggle, 'disabled recipe row should render the shared status toggle');
    assert.equal(enabledRecipeToggle.getAttribute('aria-pressed'), 'true');
    assert.equal(disabledRecipeToggle.getAttribute('aria-pressed'), 'false');
    assert.equal(enabledRecipeToggle.querySelector('.manager-v2-status-toggle-label').textContent.trim(), 'On');
    assert.equal(disabledRecipeToggle.querySelector('.manager-v2-status-toggle-label').textContent.trim(), 'Off');
    assert.equal(target.querySelector('[data-recipe-id="r2"] .manager-v2-toggle input[type="checkbox"]'), null);

    target.querySelector('[data-recipe-id="r2"] .manager-v2-recipe-identity').click();
    await tick();
    flushSync();
    assert.ok(target.querySelector('[data-recipe-id="r2"]').classList.contains('is-selected'));
    assert.ok(target.textContent.includes('Locked Elixir'));
    assert.ok(target.textContent.includes('Restricted (none selected)'));

    assert.equal(target.querySelector('.manager-v2-pagination'), null, 'pagination should hide while filtered row count is below the page size');

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
    const heroRow = target.querySelector('.manager-v2-inspector-title-row.is-hero-large');
    assert.ok(heroRow, 'recipe inspector should use the prominent hero title row');
    assert.ok(heroRow.querySelector('.manager-v2-recipe-preview'), 'recipe inspector hero should render the recipe preview image');

    const search = target.querySelector('.manager-v2-toolbar input[type="search"]');
    search.value = 'elixir';
    search.dispatchEvent(new Event('input', { bubbles: true }));

    target.querySelector('[data-recipe-id="r2"] .manager-v2-status-toggle').click();

    target.querySelector('[data-recipe-id="r2"] .manager-v2-icon-button').click();
    target.querySelector('[data-recipe-id="r2"] .manager-v2-icon-button:nth-of-type(2)').click();
    target.querySelector('[data-recipe-id="r2"] .manager-v2-icon-button:nth-of-type(3)').click();
    target.querySelector('.manager-v2-header-actions .manager-v2-button:nth-child(1)').click();
    target.querySelector('.manager-v2-header-actions .manager-v2-button:nth-child(2)').click();
    target.querySelector('.manager-v2-header-actions .manager-v2-button:nth-child(3)').click();

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

    assert.equal(target.querySelector('.fabricate-manager-v2').dataset.managerV2View, 'components');
    assert.equal(target.querySelectorAll('.manager-v2-component-row').length, 2);
    assert.ok(target.textContent.includes('Component directory'));
    assert.ok(target.textContent.includes('Drop items to add components'));
    assert.ok(target.textContent.includes('Iron Ore'));
    assert.ok(target.textContent.includes('Compendium'));
    assert.ok(target.textContent.includes('Unknown'));
    const compactEssenceChip = target.querySelector('[data-component-id="c1"] .manager-v2-essence-compact-chip');
    assert.equal(compactEssenceChip?.textContent.trim(), '2', 'essence row should show only compact quantity text');
    assert.equal(compactEssenceChip?.getAttribute('aria-label'), 'Earth 2', 'compact essence chip should expose the essence name and quantity accessibly');
    assert.equal(target.textContent.includes('Usage evidence'), false);
    assert.equal(target.textContent.includes('Evidence'), false);
    assert.equal(target.textContent.includes('Progressive difficulty'), false);

    const search = target.querySelector('.manager-v2-toolbar input[type="search"]');
    search.value = 'iron';
    search.dispatchEvent(new Event('input', { bubbles: true }));

    assert.equal(target.querySelector('[aria-label="Filter components by tag"]'), null, 'component tag filtering should use searchable pills, not the legacy dropdown');

    const tagSearch = target.querySelector('[aria-label="Search component tags"]');
    assert.ok(tagSearch, 'component tag search should render when component tags are available');
    tagSearch.value = 'con';
    tagSearch.dispatchEvent(new Event('input', { bubbles: true }));
    await tick();
    flushSync();
    const containerSuggestion = Array.from(target.querySelectorAll('.manager-v2-tag-suggestion'))
      .find(button => button.textContent.includes('container'));
    assert.ok(containerSuggestion, 'tag search should show matching tags underneath');
    containerSuggestion.click();
    await tick();
    flushSync();
    assert.equal(target.querySelectorAll('.manager-v2-component-row').length, 1);
    assert.ok(target.textContent.includes('Glass Vial'));
    const containerPill = target.querySelector('[data-component-tag-pill="container"]');
    assert.ok(containerPill, 'selected tag should render as a removable pill');
    const componentToolbar = target.querySelector('.manager-v2-toolbar');
    const primaryToolbarRow = target.querySelector('.manager-v2-toolbar-primary');
    const tagSearchControl = target.querySelector('[data-component-tag-search]');
    const selectedTagRow = target.querySelector('.manager-v2-toolbar-pills');
    assert.ok(primaryToolbarRow.contains(tagSearchControl), 'tag search control should stay in the primary toolbar row');
    assert.equal(selectedTagRow?.parentElement, componentToolbar, 'selected tag pills should render in a toolbar sibling row');
    assert.equal(tagSearchControl.contains(containerPill), false, 'selected tag pills should not live inside the tag search control');

    containerPill.querySelector('button').click();
    await tick();
    flushSync();
    assert.equal(target.querySelectorAll('.manager-v2-component-row').length, 2);

    tagSearch.value = 'ore';
    tagSearch.dispatchEvent(new Event('input', { bubbles: true }));
    await tick();
    flushSync();
    Array.from(target.querySelectorAll('.manager-v2-tag-suggestion'))
      .find(button => button.textContent.includes('ore'))
      .click();
    await tick();
    flushSync();
    tagSearch.value = 'metal';
    tagSearch.dispatchEvent(new Event('input', { bubbles: true }));
    await tick();
    flushSync();
    Array.from(target.querySelectorAll('.manager-v2-tag-suggestion'))
      .find(button => button.textContent.includes('metal'))
      .click();
    await tick();
    flushSync();
    assert.equal(target.querySelectorAll('.manager-v2-component-row').length, 1, 'multiple selected tags should require all tags');
    assert.ok(target.textContent.includes('Iron Ore'));

    target.querySelector('[data-component-tag-pill="ore"]').dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true }));
    await tick();
    flushSync();
    assert.equal(target.querySelector('[data-component-tag-pill="ore"]'), null, 'right-clicking a tag pill should remove it');

    target.querySelector('[data-clear-filters="components"]').click();
    await tick();
    flushSync();
    assert.equal(target.querySelector('[data-component-tag-pill="metal"]'), null, 'clear filters should remove selected tag pills');
    assert.equal(target.querySelectorAll('.manager-v2-component-row').length, 2);

    target.querySelector('[data-component-id="c1"] .manager-v2-component-identity').click();
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
    const componentHeroRow = target.querySelector('.manager-v2-inspector-title-row.is-hero-large');
    assert.ok(componentHeroRow, 'component inspector should use the prominent hero title row');
    assert.ok(componentHeroRow.querySelector('.manager-v2-component-preview'), 'component inspector hero should render the component preview image');

    const dropEvent = new Event('drop', { bubbles: true, cancelable: true });
    Object.defineProperty(dropEvent, 'dataTransfer', {
      value: { getData: () => JSON.stringify({ type: 'Item', uuid: 'Item.dropped' }) }
    });
    target.querySelector('.manager-v2-component-drop-zone').dispatchEvent(dropEvent);

    target.querySelector('[data-component-id="c1"] [aria-label="Edit Iron Ore"]').click();
    flushSync();
    await tick();
    flushSync();
    assert.equal(target.querySelector('.fabricate-manager-v2').dataset.managerV2View, 'component-edit', 'row Edit action should route into the manager-v2 component-edit view');
    Array.from(target.querySelectorAll('.manager-v2-breadcrumbs button')).find(button => button.textContent.trim() === 'Components').click();
    flushSync();
    await tick();
    flushSync();
    assert.equal(target.querySelector('.fabricate-manager-v2').dataset.managerV2View, 'components', 'breadcrumb Components button should return to the components browser');
    target.querySelector('[data-component-id="c1"] [aria-label="Delete Iron Ore"]').click();

    assert.deepEqual(dropped, [{ type: 'Item', uuid: 'Item.dropped' }]);
    assert.deepEqual(copied, ['Compendium.fabricate.items.iron-ore']);
    assert.deepEqual(edited, [], 'manager-v2 row Edit should no longer call the legacy services.onEditComponent');
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

    target.querySelector('[data-component-id="c1"] .manager-v2-component-identity').click();
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

    const root = target.querySelector('.fabricate-manager-v2');
    assert.equal(root.dataset.managerV2View, 'component-edit', 'row Edit should land on the component-edit route');
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

    const mineralCheckbox = Array.from(target.querySelectorAll('.manager-v2-component-tag-option'))
      .find(label => label.textContent.includes('mineral'));
    assert.ok(mineralCheckbox, 'tag checkboxes should render for the system itemTags');
    const mineralInput = mineralCheckbox.querySelector('input[type="checkbox"]');
    mineralInput.checked = true;
    mineralInput.dispatchEvent(new Event('change', { bubbles: true }));
    flushSync();
    await tick();
    flushSync();

    assert.ok(target.textContent.includes('Unsaved'), 'dirty indicator should appear after a tag change');

    const saveButton = target.querySelector('button[form="manager-v2-component-edit-form"]');
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
    assert.equal(target.querySelector('.fabricate-manager-v2').dataset.managerV2View, 'components', 'successful save should return to the components browser');
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

    assert.equal(target.querySelector('.fabricate-manager-v2').dataset.managerV2View, 'tags');
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

    const categoryInput = target.querySelector('#manager-v2-category-add');
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

    const tagInput = target.querySelector('#manager-v2-tag-add');
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

    const search = target.querySelector('.manager-v2-toolbar input[type="search"]');
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

    const categoryInput = target.querySelector('#manager-v2-category-add');
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

    const tagInput = target.querySelector('#manager-v2-tag-add');
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

    assert.equal(target.querySelector('.fabricate-manager-v2').dataset.managerV2View, 'essences');
    assert.ok(target.textContent.includes('Essence browser'));
    assert.equal(target.querySelectorAll('.manager-v2-essence-row').length, 2);
    assert.ok(target.textContent.includes('Earth'));
    assert.equal(target.querySelector('.manager-v2-essence-action-band'), null);
    assert.equal(target.textContent.includes('Linked source'), false);
    const linkedSourceImage = target.querySelector('[data-essence-id="earth"] .manager-v2-essence-source-cell-image');
    assert.ok(linkedSourceImage, 'linked essence Source column should render image evidence');
    assert.equal(linkedSourceImage.title, 'Iron Ore');
    assert.equal(linkedSourceImage.getAttribute('aria-label'), 'Iron Ore');
    assert.ok(target.querySelector('[data-essence-id="water"] .manager-v2-essence-source-cell').textContent.includes('None'));
    assert.ok(target.textContent.includes('Deletion blocked'));
    assert.equal(target.querySelectorAll('.manager-v2-essence-usage-item').length, 1);
    assert.equal(target.querySelector('.manager-v2-essence-usage-item').title, 'Iron Ore');
    target.querySelector('.manager-v2-essence-usage-item').click();
    flushSync();
    await tick();
    flushSync();
    assert.equal(target.querySelector('.fabricate-manager-v2').dataset.managerV2View, 'component-edit', 'essence usage thumbnail should route to the manager-v2 component-edit view');
    assert.deepEqual(editedComponents, [], 'essence usage thumbnail should no longer launch the legacy services.onEditComponent');
    navButton('Essences').click();
    flushSync();
    await tick();
    flushSync();
    assert.equal(target.querySelector('.fabricate-manager-v2').dataset.managerV2View, 'essences');
    assert.equal(target.querySelectorAll('.manager-v2-essence-edit-row').length, 0);
    assert.equal(target.querySelectorAll('#manager-v2-essence-create-name').length, 0);

    target.querySelector('[data-essence-id="water"]').click();
    await tick();
    flushSync();
    assert.ok(target.querySelector('[data-essence-id="water"]').classList.contains('is-selected'));
    assert.ok(target.textContent.includes('Clear current.'));

    assert.equal(target.querySelector('[data-essence-action="edit"]'), null, 'essence inspector should not duplicate row Edit actions');
    assert.equal(target.querySelector('[data-essence-action="delete"]'), null, 'essence inspector should not duplicate row Delete actions');
    assert.ok(target.querySelector('[data-essence-section="usage"]'), 'essence inspector should expose a Usage section');
    assert.ok(target.querySelector('[data-essence-section="source"] .manager-v2-essence-source-drop-zone .essence-source-trigger'), 'unlinked selected essence should expose a source drop zone');
    const essenceHeroRow = target.querySelector('.manager-v2-inspector-title-row.is-hero-large');
    assert.ok(essenceHeroRow, 'essence inspector should use the prominent hero title row');
    assert.ok(essenceHeroRow.querySelector('.manager-v2-inspector-icon.is-hero-large'), 'essence inspector hero should render the icon at hero-large size');

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
    const inspectorSourceSummary = target.querySelector('[data-essence-section="source"] .manager-v2-essence-inspector-source-summary');
    assert.ok(inspectorSourceSummary, 'linked selected essence should render a source summary card');
    assert.equal(inspectorSourceSummary.querySelectorAll('.manager-v2-essence-source-thumb').length, 1, 'linked selected essence should show one source thumbnail');
    assert.ok(inspectorSourceSummary.querySelector('.manager-v2-essence-source-copy').textContent.includes('Iron Ore'), 'linked selected essence should keep the source name readable');
    assert.equal(inspectorSourceSummary.querySelector('.manager-v2-essence-source-copy').textContent.includes('c1'), false, 'linked selected essence should not print UUID evidence under the item name');
    const inspectorSourceActions = target.querySelector('[data-essence-section="source"] .manager-v2-essence-inspector-source-actions');
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
    assert.equal(target.querySelectorAll('.manager-v2-essence-row').length, 1);
    assert.ok(target.textContent.includes('Water'));

    sourceFilter.value = 'all';
    sourceFilter.dispatchEvent(new Event('change', { bubbles: true }));
    await tick();
    flushSync();

    target.querySelector('[data-essence-id="water"] [aria-label="Edit Water"]').click();
    await tick();
    flushSync();
    assert.equal(target.querySelector('.fabricate-manager-v2').dataset.managerV2View, 'essence-edit');
    assert.ok(target.textContent.includes('Edit essence'));
    assert.ok(!target.textContent.includes('Essence editor'));
    assert.ok(!target.querySelector('.manager-v2-essence-edit-view .manager-v2-action-group'), 'identity card should not duplicate route save/cancel actions');
    assert.equal(target.textContent.includes('Basic information'), false);
    assert.equal(target.textContent.includes('Essence ID'), false);
    assert.ok(!target.querySelector('.manager-v2-inspector [aria-label="Edit Water"]'), 'inspector should not show an edit action while already editing');
    assert.ok(target.querySelector('.essence-icon-picker-trigger'), 'edit route should use the shared icon picker trigger');
    assert.equal(target.querySelector('.essence-icon-picker-trigger').title, 'Change icon');
    assert.ok(target.textContent.includes('Clear icon'));
    assert.ok(target.querySelector('.essence-source-trigger'), 'effect-transfer systems should show source picker controls');
    assert.ok(target.querySelector('.manager-v2-essence-source-summary'), 'edit route should show selected source summary inside the form');
    assert.ok(target.querySelector('.manager-v2-essence-source-drop-zone .essence-source-trigger'), 'edit route should show a full-width source drop/pick target');
    assert.equal(target.querySelector('.manager-v2-header-actions .manager-v2-button.is-primary').disabled, true);

    const editName = target.querySelector('#manager-v2-essence-edit-name');
    editName.value = 'Rain';
    editName.dispatchEvent(new Event('input', { bubbles: true }));
    await tick();
    flushSync();
    assert.equal(target.querySelector('.manager-v2-inspector-name').textContent.trim(), 'Rain');
    assert.equal(target.querySelector('.manager-v2-header-actions .manager-v2-button.is-primary').disabled, false);
    target.querySelector('.essence-source-trigger').click();
    await tick();
    flushSync();
    document.querySelector('.essence-source-picker-option[title="Glass Vial"]').click();
    await tick();
    flushSync();
    assert.ok(target.querySelector('.manager-v2-essence-source-summary').textContent.includes('Glass Vial'));
    target.querySelector('.manager-v2-header-actions .manager-v2-button.is-primary').click();
    await tick();
    flushSync();
    assert.ok(calls.some(call => call[0] === 'updateEssence' && call[1] === 'water' && call[2].name === 'Rain' && call[2].sourceComponentId === 'c2'));
    assert.equal(target.querySelector('.fabricate-manager-v2').dataset.managerV2View, 'essences');

    target.querySelector('[data-essence-id="water"] [aria-label="Delete Water"]').click();
    assert.ok(calls.some(call => call[0] === 'removeEssence' && call[1] === 'water'));
    await tick();
    flushSync();
    assert.equal(target.querySelector('[data-essence-id="earth"] [aria-label="Delete Earth"]').disabled, true);

    target.querySelector('.manager-v2-header-actions .manager-v2-button.is-primary').click();
    await tick();
    flushSync();
    assert.equal(target.querySelector('.fabricate-manager-v2').dataset.managerV2View, 'essence-edit');
    assert.equal(target.querySelector('.manager-v2-inspector-name').textContent.trim(), 'New essence draft');
    assert.equal(target.querySelector('.manager-v2-header-actions .manager-v2-button.is-primary').disabled, true);
    const createName = target.querySelector('#manager-v2-essence-edit-name');
    createName.value = 'Air';
    createName.dispatchEvent(new Event('input', { bubbles: true }));
    await tick();
    flushSync();
    assert.equal(target.querySelector('.manager-v2-inspector-name').textContent.trim(), 'Air');
    target.querySelector('.manager-v2-header-actions .manager-v2-button.is-primary').click();
    await tick();
    flushSync();
    assert.ok(calls.some(call => call[0] === 'addEssence' && call[1] === 'Air'));
  });

  it('hides manager-v2 essence source UI when effect transfer is disabled', async () => {
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
    assert.equal(target.querySelector('.manager-v2-essences-table').classList.contains('has-no-source'), true);
    assert.equal(target.textContent.includes('Linked source'), false);
    assert.equal(target.textContent.includes('Source evidence'), false);

    target.querySelector('[data-essence-id="water"] [aria-label="Edit Water"]').click();
    await tick();
    flushSync();

    assert.equal(target.querySelector('.essence-source-trigger'), null);
    assert.equal(target.querySelector('.manager-v2-essence-source-summary'), null);
    assert.equal(target.querySelector('.manager-v2-essence-source-drop-zone'), null);
    assert.equal(target.textContent.includes('Source unresolved'), false);
    assert.equal(target.textContent.includes('source linkage'), false);

    const editName = target.querySelector('#manager-v2-essence-edit-name');
    editName.value = 'Rain';
    editName.dispatchEvent(new Event('input', { bubbles: true }));
    await tick();
    flushSync();
    target.querySelector('.manager-v2-header-actions .manager-v2-button.is-primary').click();
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

    const editName = target.querySelector('#manager-v2-essence-edit-name');
    editName.value = 'Rain';
    editName.dispatchEvent(new Event('input', { bubbles: true }));
    await tick();
    flushSync();

    navButton('Recipes').click();
    await tick();
    flushSync();

    assert.ok(calls.some(call => call[0] === 'confirmDiscardDirtyEssenceDraft'));
    assert.equal(target.querySelector('.fabricate-manager-v2').dataset.managerV2View, 'essence-edit');
    assert.equal(target.querySelector('#manager-v2-essence-edit-name').value, 'Rain');
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
    const failedName = target.querySelector('#manager-v2-essence-edit-name');
    failedName.value = 'Rain';
    failedName.dispatchEvent(new Event('input', { bubbles: true }));
    await tick();
    flushSync();
    target.querySelector('.manager-v2-header-actions .manager-v2-button.is-primary').click();
    await tick();
    await tick();
    flushSync();

    assert.equal(target.querySelector('.fabricate-manager-v2').dataset.managerV2View, 'essence-edit');
    assert.equal(target.querySelector('#manager-v2-essence-edit-name').value, 'Rain');
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
    const rejectedName = target.querySelector('#manager-v2-essence-edit-name');
    rejectedName.value = 'Storm';
    rejectedName.dispatchEvent(new Event('input', { bubbles: true }));
    await tick();
    flushSync();
    target.querySelector('.manager-v2-header-actions .manager-v2-button.is-primary').click();
    await tick();
    await tick();
    flushSync();

    assert.equal(target.querySelector('.fabricate-manager-v2').dataset.managerV2View, 'essence-edit');
    assert.equal(target.querySelector('#manager-v2-essence-edit-name').value, 'Storm');
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
    target.querySelector('.manager-v2-header-actions .manager-v2-button.is-primary').click();
    await tick();
    flushSync();
    const createName = target.querySelector('#manager-v2-essence-edit-name');
    createName.value = 'Air';
    createName.dispatchEvent(new Event('input', { bubbles: true }));
    await tick();
    flushSync();
    target.querySelector('.manager-v2-header-actions .manager-v2-button.is-primary').click();
    await tick();
    await tick();
    flushSync();

    assert.equal(target.querySelector('.fabricate-manager-v2').dataset.managerV2View, 'essence-edit');
    assert.equal(target.querySelector('#manager-v2-essence-edit-name').value, 'Air');
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

    assert.equal(target.querySelector('.fabricate-manager-v2').dataset.managerV2View, 'environments');
    assert.equal(target.querySelectorAll('.manager-v2-environment-row').length, 2);
    assert.ok(target.textContent.includes('Gathering environments'));
    assert.ok(target.textContent.includes('Moonlit Forest'));
    assert.ok(target.textContent.includes('Quiet Cavern'));
    const gatheringTabs = Array.from(target.querySelectorAll('.manager-v2-gathering-tab'));
    assert.deepEqual(
      gatheringTabs.map(tab => tab.textContent.trim()),
      ['Environments', 'Tasks', 'Hazards', 'Settings']
    );
    assert.equal(
      gatheringTabs.find(tab => tab.textContent.includes('Environments')).getAttribute('aria-selected'),
      'true'
    );

    gatheringTabs.find(tab => tab.textContent.includes('Tasks')).click();
    await tick();
    flushSync();

    assert.equal(
      target.querySelector(`.manager-v2-gathering-tab[aria-selected="true"]`).textContent.trim(),
      'Tasks'
    );
    assert.equal(target.querySelectorAll('.manager-v2-gathering-task-row').length, 3);
    assert.ok(target.textContent.includes('Gather Moon Herbs'));
    assert.ok(target.textContent.includes('Prospect Crystal Veins'));
    assert.ok(target.textContent.includes('High Day, Clear Sky'));
    assert.ok(target.querySelector('[data-gathering-task-inspector]').textContent.includes('Selected reusable task'));
    assert.ok(target.querySelector('.manager-v2-inspector').textContent.includes('Nightshade x2 (80%)'));
    assert.equal(target.querySelector('[data-gathering-task-fact="environments"] strong').textContent.trim(), '1');

    const taskSearch = target.querySelector('[data-gathering-tasks-browser] input[type="search"]');
    taskSearch.value = 'crystal';
    taskSearch.dispatchEvent(new Event('input', { bubbles: true }));
    await tick();
    flushSync();
    assert.equal(target.querySelectorAll('.manager-v2-gathering-task-row').length, 1);
    assert.ok(target.textContent.includes('Prospect Crystal Veins'));

    target.querySelector('[data-clear-filters="gathering-tasks"]').click();
    await tick();
    flushSync();
    const taskSelects = target.querySelectorAll('[data-gathering-tasks-browser] .manager-v2-filter select');
    taskSelects[0].value = 'disabled';
    taskSelects[0].dispatchEvent(new Event('change', { bubbles: true }));
    await tick();
    flushSync();
    assert.equal(target.querySelectorAll('.manager-v2-gathering-task-row').length, 1);
    assert.ok(target.textContent.includes('South Coast Driftwood'));

    target.querySelector('[data-clear-filters="gathering-tasks"]').click();
    await tick();
    flushSync();
    taskSelects[1].value = 'north';
    taskSelects[1].dispatchEvent(new Event('change', { bubbles: true }));
    await tick();
    flushSync();
    assert.equal(target.querySelectorAll('.manager-v2-gathering-task-row').length, 2);
    taskSelects[2].value = 'cavern';
    taskSelects[2].dispatchEvent(new Event('change', { bubbles: true }));
    await tick();
    flushSync();
    assert.equal(target.querySelectorAll('.manager-v2-gathering-task-row').length, 1);
    assert.ok(target.textContent.includes('Prospect Crystal Veins'));
    target.querySelector('[data-clear-filters="gathering-tasks"]').click();
    await tick();
    flushSync();
    taskSelects[3].value = 'mismatch';
    taskSelects[3].dispatchEvent(new Event('change', { bubbles: true }));
    await tick();
    flushSync();
    assert.equal(target.querySelectorAll('.manager-v2-gathering-task-row').length, 2);

    target.querySelector('[data-clear-filters="gathering-tasks"]').click();
    await tick();
    flushSync();
    target.querySelector('[data-gathering-task-id="task-herbs"] .manager-v2-status-toggle').click();
    target.querySelector('[data-gathering-task-id="task-herbs"] [aria-label="Duplicate Gather Moon Herbs"]').click();
    target.querySelector('[data-gathering-task-id="task-herbs"] [aria-label="Delete Gather Moon Herbs"]').click();
    assert.ok(calls.some(call => call[0] === 'updateGatheringLibraryTask' && call[1] === 'alchemy' && call[2] === 'task-herbs' && call[3].enabled === false));
    assert.ok(calls.some(call => call[0] === 'duplicateGatheringLibraryTask' && call[1] === 'alchemy' && call[2] === 'task-herbs'));
    assert.ok(calls.some(call => call[0] === 'deleteGatheringLibraryTask' && call[1] === 'alchemy' && call[2] === 'task-herbs'));

    target.querySelector('[data-gathering-task-id="task-herbs"] [aria-label="Edit Gather Moon Herbs"]').click();
    await tick();
    flushSync();
    assert.equal(target.querySelector('.fabricate-manager-v2').dataset.managerV2View, 'gathering-task-edit');
    assert.ok(target.querySelector('[data-gathering-task-editor-placeholder]'));
    assert.ok(target.textContent.includes('Detailed authoring fields for reusable gathering task definitions are coming later.'));
    target.querySelector('[data-gathering-task-editor-placeholder] .manager-v2-button').click();
    await tick();
    flushSync();
    assert.equal(target.querySelector('.fabricate-manager-v2').dataset.managerV2View, 'environments');
    assert.equal(target.querySelector('#manager-v2-gathering-tab-tasks').getAttribute('aria-selected'), 'true');

    for (const [label, placeholder] of [
      ['Hazards', 'Reusable hazard authoring is planned for a later slice.']
    ]) {
      Array.from(target.querySelectorAll('.manager-v2-gathering-tab'))
        .find(tab => tab.textContent.includes(label))
        .click();
      await tick();
      flushSync();

      assert.equal(
        target.querySelector(`.manager-v2-gathering-tab[aria-selected="true"]`).textContent.trim(),
        label
      );
      assert.ok(target.textContent.includes(placeholder));
      assert.equal(target.querySelector('.manager-v2-toolbar'), null);
      assert.equal(target.querySelector('.manager-v2-environments-table'), null);
      assert.equal(
        target.querySelector('.manager-v2-inspector [data-gathering-inspector-placeholder] h2').textContent.trim(),
        label === 'Hazards' ? 'Gathering hazards' : 'Gathering settings'
      );
      assert.ok(target.querySelector('.manager-v2-inspector').textContent.includes(placeholder));
      assert.equal(
        target.querySelector('.manager-v2-inspector').textContent.includes('Selected environment'),
        false
      );
    }

    Array.from(target.querySelectorAll('.manager-v2-gathering-tab'))
      .find(tab => tab.textContent.includes('Settings'))
      .click();
    await tick();
    flushSync();
    assert.equal(
      target.querySelector(`.manager-v2-gathering-tab[aria-selected="true"]`).textContent.trim(),
      'Settings'
    );
    assert.equal(target.querySelector('.manager-v2-toolbar'), null);
    assert.equal(target.querySelector('.manager-v2-environments-table'), null);
    assert.ok(target.textContent.includes('Set system-level d100 reward and hazard rules for gathering.'));
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
    assert.ok(target.textContent.includes('These values control current time matching for reusable tasks and hazards.'));
    assert.ok(target.textContent.includes('These values control current weather matching for reusable tasks and hazards.'));
    assert.ok(target.textContent.includes('Environments use one region. Labels can be renamed without changing ids.'));
    assert.ok(target.textContent.includes('Environments can use multiple biomes. Left-click the coloured icon to edit icon; right-click to edit colour.'));
    assert.equal(target.querySelectorAll('.manager-v2-condition-add input').length, 4);
    assert.equal(target.querySelectorAll('.manager-v2-condition-add .essence-icon-picker-trigger.icon-only').length, 3);
    assert.equal(target.querySelectorAll('.manager-v2-color-picker-trigger').length, 1);
    assert.equal(target.querySelectorAll('.manager-v2-condition-add .manager-v2-add-button').length, 4);
    assert.equal(Array.from(target.querySelectorAll('.manager-v2-condition-add .manager-v2-add-button')).every(button => button.textContent.trim() === 'Add'), true);
    assert.equal(target.textContent.includes('Add time of day'), false);
    assert.equal(target.textContent.includes('Add weather'), false);
    assert.equal(target.textContent.includes('Add region'), false);
    assert.equal(target.textContent.includes('Add biome'), false);
    assert.equal(target.querySelectorAll('[data-gathering-condition-value]').length, 5);
    assert.equal(target.querySelectorAll('.manager-v2-vocabulary-pill').length, 4);
    assert.equal(target.querySelectorAll('[data-gathering-vocabulary-panel="biomes"] .manager-v2-biome-combined-trigger').length, 2);
    assert.equal(target.querySelectorAll('.manager-v2-condition-label-input').length, 9);
    assert.equal(target.querySelectorAll('.manager-v2-vocabulary-pill .manager-v2-condition-label-input').length, 4);
    assert.deepEqual(
      Array.from(target.querySelectorAll('[data-gathering-condition-panel="weather"] .manager-v2-condition-label-input')).map(input => input.value),
      ['Clear Sky', 'Storm Rain']
    );
    assert.deepEqual(
      Array.from(target.querySelectorAll('[data-gathering-condition-panel="timeOfDay"] .manager-v2-condition-label-input')).map(input => input.value),
      ['First Light', 'High Day', 'Deep Night']
    );
    const weatherLabelInput = target.querySelector('[data-gathering-condition-value="heavy-rain"] .manager-v2-condition-label-input');
    weatherLabelInput.value = 'Heavy Rainfall';
    weatherLabelInput.dispatchEvent(new Event('blur'));
    await tick();
    flushSync();
    assert.deepEqual(
      calls.find(call => call[0] === 'updateGatheringConditionValue'),
      ['updateGatheringConditionValue', 'weather', 'heavy-rain', { label: 'Heavy Rainfall' }, 'alchemy']
    );

    const timeLabelInput = target.querySelector('[data-gathering-condition-value="dawn"] .manager-v2-condition-label-input');
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
    const regionLabelInput = target.querySelector('[data-gathering-vocabulary-panel="regions"] [data-gathering-vocabulary-value="north"] .manager-v2-condition-label-input');
    regionLabelInput.value = 'Northern Reach';
    regionLabelInput.dispatchEvent(new Event('blur'));
    await tick();
    flushSync();
    assert.deepEqual(
      calls.find(call => call[0] === 'updateGatheringVocabularyValue'),
      ['updateGatheringVocabularyValue', 'regions', 'north', { label: 'Northern Reach' }, 'alchemy']
    );
    const biomeIconTrigger = target.querySelector('[data-gathering-vocabulary-panel="biomes"] [data-gathering-vocabulary-value="forest"] .manager-v2-biome-combined-trigger');
    biomeIconTrigger.click();
    await tick();
    flushSync();
    assert.ok(target.querySelector('.essence-icon-picker-popover'));
    target.querySelector('.essence-icon-picker-popover .essence-icon-picker-option').click();
    await tick();
    flushSync();
    assert.equal(calls.filter(call => call[0] === 'updateGatheringVocabularyValue').at(-1)[1], 'biomes');
    const biomeColorTrigger = target.querySelector('[data-gathering-vocabulary-panel="biomes"] [data-gathering-vocabulary-value="forest"] .manager-v2-biome-combined-trigger');
    const managerShell = target.querySelector('.fabricate-manager-v2');
    const managerMain = target.querySelector('.manager-v2-main');
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
    const colorPopover = target.querySelector('[data-manager-v2-color-picker-popover]');
    assert.ok(colorPopover);
    assert.equal(colorPopover.closest('.fabricate-manager-v2'), managerShell, 'biome color popover should stay inside the Manager V2 shell overlay layer');
    assert.equal(colorPopover.closest('[data-gathering-vocabulary-panel="biomes"]'), null, 'biome color popover should be portaled out of the settings panel');
    assert.match(colorPopover.getAttribute('style'), /bottom:\s*\d+px;/, 'lower biome color popovers should flip above the trigger when space below is constrained');
    assert.match(colorPopover.getAttribute('style'), /left:\s*40px;/, 'biome color popover should left-align with the trigger while within the main panel bounds');
    assert.match(colorPopover.getAttribute('style'), /width:\s*220px;/, 'biome color popover should keep its fixed compact width');
    target.querySelector('[data-manager-v2-color-token="mist"]').click();
    await tick();
    flushSync();
    assert.deepEqual(
      calls.filter(call => call[0] === 'updateGatheringVocabularyValue').at(-1),
      ['updateGatheringVocabularyValue', 'biomes', 'forest', { colorToken: 'mist', customColor: '' }, 'alchemy']
    );
    assert.ok(target.querySelector('[data-manager-v2-color-picker-popover]'));
    document.body.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
    await tick();
    flushSync();
    assert.equal(target.querySelector('[data-manager-v2-color-picker-popover]'), null);
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
    const constrainedColorPopover = target.querySelector('[data-manager-v2-color-picker-popover]');
    assert.ok(constrainedColorPopover);
    assert.match(constrainedColorPopover.getAttribute('style'), /left:\s*424px;/, 'biome color popover should clamp to the Manager V2 main panel right edge');
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    await tick();
    flushSync();
    assert.equal(target.querySelector('[data-manager-v2-color-picker-popover]'), null);
    managerShell.getBoundingClientRect = originalShellRect;
    managerMain.getBoundingClientRect = originalMainRect;
    biomeColorTrigger.getBoundingClientRect = originalBiomeTriggerRect;
    assert.equal(target.querySelector('.manager-v2-gathering-settings-summary'), null);
    assert.equal(target.querySelector('[data-gathering-rule-fact]'), null);
    assert.ok(target.querySelector('.manager-v2-inspector').textContent.includes('Choose which successful d100 reward rows are granted.'));
    assert.ok(target.querySelector('.manager-v2-inspector').textContent.includes('Choose which matching hazards are applied after a gathering roll.'));
    assert.ok(target.querySelector('.manager-v2-inspector').textContent.includes('Decide whether selected hazards still allow the gathering attempt to succeed.'));
    const rewardsSelect = target.querySelector('#manager-v2-gathering-rule-rewards');
    const hazardsSelect = target.querySelector('#manager-v2-gathering-rule-hazards');
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
    assert.ok(target.querySelector('.manager-v2-inspector [data-gathering-inspector-rules]'));
    assert.equal(target.querySelector('.manager-v2-inspector [data-gathering-inspector-rules] h2').textContent.trim(), 'Rules');
    assert.equal(target.querySelectorAll('.manager-v2-inspector [data-gathering-inspector-rules] select').length, 3);
    assert.equal(target.querySelector('.manager-v2-inspector [data-gathering-rule-stepper]'), null);
    assert.equal(
      target.querySelector('.manager-v2-inspector').textContent.includes('Selected environment'),
      false
    );

    target.querySelector('#manager-v2-gathering-tab-environments').click();
    await tick();
    flushSync();
    assert.equal(target.querySelector('#manager-v2-gathering-tab-environments').getAttribute('aria-selected'), 'true');
    assert.equal(target.querySelectorAll('.manager-v2-environment-row').length, 2);

    const environmentTable = target.querySelector('.manager-v2-environments-table');
    assert.deepEqual(
      Array.from(environmentTable.querySelectorAll('[role="columnheader"]')).map(header => header.textContent.trim()),
      ['Environment', 'Selection mode', 'Tasks', 'Status', 'Actions']
    );
    assert.equal(environmentTable.textContent.includes('Linked scene'), false);
    assert.equal(environmentTable.textContent.includes('Scene unresolved'), false);
    const forestRow = target.querySelector('[data-environment-id="env-forest"]');
    assert.equal(forestRow.querySelector('.manager-v2-environment-task-count').textContent.trim(), '1');
    assert.equal(forestRow.textContent.includes('results'), false);
    assert.equal(forestRow.textContent.includes('catalysts'), false);
    assert.equal(forestRow.querySelector('.manager-v2-environment-task-count.manager-v2-chip'), null);
    assert.ok(forestRow.querySelector('.manager-v2-status-toggle'));
    assert.ok(forestRow.querySelector('.manager-v2-environment-action-grid'));
    assert.ok(forestRow.querySelector('[aria-label="Edit Moonlit Forest"]'));
    assert.ok(forestRow.querySelector('[aria-label="Duplicate Moonlit Forest"]'));
    assert.ok(forestRow.querySelector('[aria-label="Delete Moonlit Forest"]'));
    assert.ok(forestRow.querySelector('.manager-v2-environment-reorder-stack'));
    assert.ok(target.querySelector('.manager-v2-inspector').textContent.includes('Selected environment'));
    assert.equal(
      target.querySelector('.manager-v2-inspector').textContent.includes('Environment actions'),
      false,
      'selected environment inspector should not duplicate row quick actions'
    );

    const search = target.querySelector('.manager-v2-toolbar input[type="search"]');
    search.value = 'cavern';
    search.dispatchEvent(new Event('input', { bubbles: true }));
    await tick();
    flushSync();
    assert.equal(target.querySelectorAll('.manager-v2-environment-row').length, 1);
    assert.ok(target.textContent.includes('Quiet Cavern'));
    assert.equal(
      target.querySelector('[data-environment-id="env-cavern"] .manager-v2-environment-reorder-stack [aria-label="Move up"]').disabled,
      false,
      'filtered environment move-up should use full list order, not filtered row position'
    );

    const cavernToggle = target.querySelector('[data-environment-id="env-cavern"] .manager-v2-status-toggle');
    cavernToggle.click();
    await tick();
    flushSync();
    assert.ok(calls.some(call => call[0] === 'toggleEnvironmentEnabled' && call[1] === 'env-cavern' && call[2] === true));
    assert.equal(calls.some(call => call[0] === 'selectEnvironment' && call[1] === 'env-cavern'), false);

    target.querySelector('[data-environment-id="env-cavern"] .manager-v2-environment-identity').click();
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

    assert.equal(target.querySelector('.fabricate-manager-v2').dataset.managerV2View, 'environment-edit');
    assert.equal(target.querySelector('.manager-v2-environment-editor-shell .environment-foundation'), null);
    assert.ok(target.querySelector('.manager-v2-environment-editor-shell .manager-v2-environment-edit-view'));
    assert.ok(target.querySelector('.manager-v2-environment-task-rail'));
    assert.ok(target.querySelector('.manager-v2-environment-task-editor'));
    assert.equal(target.querySelector('.manager-v2-environment-evidence-column'), null);
    assert.ok(target.querySelector('.manager-v2-environment-validation-band'));
    assert.ok(target.querySelector('.manager-v2-scene-drop-zone'));
    assert.ok(target.querySelector('.manager-v2-environment-status-card .manager-v2-status-toggle'));
    assert.equal(target.textContent.includes('Back to environments'), false);
    assert.ok(target.textContent.includes('Quiet Cavern'));

    target.querySelector('.manager-v2-environment-task-rail .manager-v2-icon-button').click();
    target.querySelector('.manager-v2-environment-edit-view').dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));

    assert.ok(calls.some(call => call[0] === 'addEnvironmentTask'));
    assert.ok(calls.some(call => call[0] === 'saveEnvironmentDraft'));
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

    assert.equal(target.querySelector('.fabricate-manager-v2').dataset.managerV2View, 'environments');
    const gatheringTabs = Array.from(target.querySelectorAll('.manager-v2-gathering-tab'));
    assert.deepEqual(
      gatheringTabs.map(tab => tab.textContent.trim()),
      ['Environments', 'Tasks', 'Hazards', 'Settings']
    );
    assert.equal(target.querySelector('#manager-v2-gathering-tab-environments').getAttribute('aria-selected'), 'true');
    assert.ok(target.textContent.includes('Prepare gathering building blocks first'));
    assert.ok(target.textContent.includes('Define reusable tasks and hazards before creating environments'));
    assert.ok(target.textContent.includes('Review tasks'));
    assert.ok(target.textContent.includes('Review hazards'));
    assert.ok(target.textContent.includes('Plan gathering content'));
    assert.ok(target.textContent.includes('Define reusable gathering tasks with their checks'));
    assert.ok(target.textContent.includes('Prepare encounter and hazard options'));
    assert.ok(target.textContent.includes('Create environments after the reusable task and hazard libraries are ready to attach.'));
    assert.ok(target.textContent.includes('Gathering docs'));
    assert.equal(target.textContent.includes('Select an environment'), false);

    Array.from(target.querySelectorAll('.manager-v2-table-scroll .manager-v2-button'))
      .find(button => button.textContent.includes('Review tasks'))
      .click();
    await tick();
    flushSync();

    assert.equal(target.querySelector('#manager-v2-gathering-tab-tasks').getAttribute('aria-selected'), 'true');
    assert.ok(target.textContent.includes('Gather Moon Herbs'));
    assert.ok(target.querySelector('[data-gathering-tasks-browser]'));
    assert.ok(target.querySelector('[data-gathering-task-inspector]'));
    assert.equal(target.querySelector('.manager-v2-inspector').textContent.includes('Plan gathering content'), false);

    target.querySelector('#manager-v2-gathering-tab-environments').click();
    await tick();
    flushSync();

    Array.from(target.querySelectorAll('.manager-v2-table-scroll .manager-v2-button'))
      .find(button => button.textContent.includes('Review hazards'))
      .click();
    await tick();
    flushSync();

    assert.equal(target.querySelector('#manager-v2-gathering-tab-encounters').getAttribute('aria-selected'), 'true');
    assert.ok(target.textContent.includes('Reusable hazard authoring is planned for a later slice.'));

    target.querySelector('#manager-v2-gathering-tab-environments').click();
    await tick();
    flushSync();

    target.querySelector('.manager-v2-table-scroll .manager-v2-button.is-primary').click();
    await tick();
    flushSync();

    assert.equal(target.querySelector('.fabricate-manager-v2').dataset.managerV2View, 'environment-edit');
    assert.ok(calls.some(call => call[0] === 'createEnvironmentDraft'));
  });

  it('shows create guidance when the reusable gathering task library is empty', async () => {
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
    target.querySelector('#manager-v2-gathering-tab-tasks').click();
    await tick();
    flushSync();

    assert.ok(target.textContent.includes('No reusable tasks yet'));
    assert.ok(target.textContent.includes('Create reusable gathering task definitions before attaching them to environments.'));
    target.querySelector('[data-gathering-tasks-browser] .manager-v2-button.is-primary').click();
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

    assert.equal(target.querySelector('.fabricate-manager-v2').dataset.managerV2View, 'recipes');
    assert.ok(target.textContent.includes('No recipes yet'));
    assert.ok(target.textContent.includes('Set up recipes'));
    assert.ok(target.textContent.includes('Choose the recipe structure supported by the selected system.'));
    assert.ok(target.textContent.includes('Recipe docs'));
    assert.equal(target.textContent.includes('Select a recipe'), false);

    target.querySelector('.manager-v2-table-scroll .manager-v2-button.is-primary').click();
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

    assert.equal(target.querySelector('.fabricate-manager-v2').dataset.managerV2View, 'recipes');
    assert.ok(target.textContent.includes('No recipes yet'));
    assert.ok(target.textContent.includes('Add components before creating recipes'));
    assert.ok(target.textContent.includes('Open Components and drop world, compendium, pack, or folder items into this system.'));
    assert.ok(target.textContent.includes('Add components'));
    assert.equal(target.textContent.includes('Choose the recipe structure supported by the selected system.'), false);

    Array.from(target.querySelectorAll('.manager-v2-setup-links .manager-v2-button'))
      .find(button => button.textContent.includes('Add components'))
      .click();
    await tick();
    flushSync();

    assert.equal(target.querySelector('.fabricate-manager-v2').dataset.managerV2View, 'components');
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

    assert.equal(target.querySelector('.fabricate-manager-v2').dataset.managerV2View, 'components');
    assert.ok(target.textContent.includes('No components yet'));
    assert.ok(target.textContent.includes('Set up components'));
    assert.ok(target.textContent.includes('Drop world, compendium, pack, or folder items into the component browser.'));
    assert.ok(target.textContent.includes('Component docs'));
    assert.ok(target.querySelector('.manager-v2-component-drop-zone'));
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

    assert.equal(target.querySelector('.fabricate-manager-v2').dataset.managerV2View, 'essences');
    assert.ok(target.textContent.includes('No essences yet'));
    assert.ok(target.textContent.includes('Set up essences'));
    assert.ok(target.textContent.includes('Create an essence with a clear name, icon, and description.'));
    assert.ok(target.textContent.includes('Essence docs'));
    assert.equal(target.textContent.includes('Select an essence'), false);

    target.querySelector('.manager-v2-header-actions .manager-v2-button.is-primary').click();
    await tick();
    flushSync();

    assert.equal(target.querySelector('.fabricate-manager-v2').dataset.managerV2View, 'essence-edit');
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
    target.querySelector('.manager-v2-header-actions .manager-v2-button.is-primary').click();
    await tick();
    flushSync();

    assert.equal(target.querySelector('.fabricate-manager-v2').dataset.managerV2View, 'environment-edit');
    assert.equal(target.querySelector('.manager-v2-environment-details-band .manager-v2-card-title').textContent.trim(), 'New Gathering Environment');
    assert.equal(target.querySelector('.manager-v2-inspector'), null);
    assert.ok(calls.some(call => call[0] === 'createEnvironmentDraft'));
  });

  it('asks the admin store before leaving a dirty environment edit route', async () => {
    const blockedCalls = [];
    target = document.createElement('div');
    document.body.appendChild(target);
    mounted = mount(Component, {
      target,
      props: {
        store: createStore(blockedCalls, { confirmDiscardResult: false }),
        services: { openCurrentAdmin: () => {} }
      }
    });
    flushSync();

    navButton('Gathering').click();
    await tick();
    flushSync();
    target.querySelector('[aria-label="Edit Moonlit Forest"]').click();
    await Promise.resolve();
    await Promise.resolve();
    await tick();
    flushSync();

    target.querySelector('.manager-v2-environment-edit-view input[data-environment-field="environment.name"]').value = 'Dirty Forest';
    target.querySelector('.manager-v2-environment-edit-view input[data-environment-field="environment.name"]').dispatchEvent(new Event('input', { bubbles: true }));
    await tick();
    flushSync();
    assert.equal(target.querySelector('.manager-v2-environment-details-band .manager-v2-card-title').textContent.trim(), 'Dirty Forest');

    navButton('Components').click();
    await Promise.resolve();
    await tick();
    flushSync();

    assert.equal(target.querySelector('.fabricate-manager-v2').dataset.managerV2View, 'environment-edit');
    assert.ok(blockedCalls.some(call => call[0] === 'confirmDiscardDirtyEnvironmentDraft'));
    assert.equal(blockedCalls.some(call => call[0] === 'cancelEnvironmentDraft'), false);

    unmount(mounted);
    mounted = null;
    target.remove();
    target = document.createElement('div');
    document.body.appendChild(target);

    const confirmedCalls = [];
    mounted = mount(Component, {
      target,
      props: {
        store: createStore(confirmedCalls, { confirmDiscardResult: true }),
        services: { openCurrentAdmin: () => {} }
      }
    });
    flushSync();

    navButton('Gathering').click();
    await tick();
    flushSync();
    target.querySelector('[aria-label="Edit Moonlit Forest"]').click();
    await Promise.resolve();
    await Promise.resolve();
    await tick();
    flushSync();
    target.querySelector('.manager-v2-environment-edit-view input[data-environment-field="environment.name"]').value = 'Dirty Forest';
    target.querySelector('.manager-v2-environment-edit-view input[data-environment-field="environment.name"]').dispatchEvent(new Event('input', { bubbles: true }));
    await tick();
    flushSync();

    navButton('Components').click();
    await Promise.resolve();
    await tick();
    flushSync();

    assert.equal(target.querySelector('.fabricate-manager-v2').dataset.managerV2View, 'components');
    assert.ok(confirmedCalls.some(call => call[0] === 'confirmDiscardDirtyEnvironmentDraft'));
    assert.ok(confirmedCalls.some(call => call[0] === 'cancelEnvironmentDraft'));
  });

  it('routes validation links to the correct environment segment and task tab', async () => {
    const calls = [];
    const validationState = {
      summary: '2 validation issues',
      errors: [
        {
          id: 'env-name',
          path: 'environment.name',
          message: 'Environment name is required.',
          fieldSelector: '[data-environment-field="environment.name"]'
        },
        {
          id: 'task-result-selection',
          path: 'task.task-forage.resultSelection.macroUuid',
          taskId: 'task-forage',
          message: 'Result selection macro is required.',
          fieldSelector: '[data-environment-field="task.task-forage.resultSelection.macroUuid"]'
        }
      ]
    };
    target = document.createElement('div');
    document.body.appendChild(target);
    mounted = mount(Component, {
      target,
      props: {
        store: createStore(calls, { environmentValidationState: validationState }),
        services: { openCurrentAdmin: () => {} }
      }
    });
    flushSync();

    navButton('Gathering').click();
    await tick();
    flushSync();
    target.querySelector('[aria-label="Edit Moonlit Forest"]').click();
    await Promise.resolve();
    await Promise.resolve();
    await tick();
    flushSync();

    assert.equal(target.querySelectorAll('.manager-v2-validation-group').length, 2);
    const taskTabs = Array.from(target.querySelectorAll('.manager-v2-task-tabs [role="tab"]'));
    assert.equal(taskTabs.find(tab => tab.textContent.includes('Results'))?.dataset.environmentInvalid, 'true');
    assert.equal(taskTabs.some(tab => tab.textContent.includes('Advanced')), false);
    assert.equal(target.querySelector('.manager-v2-environment-details-tabs'), null);
    taskTabs.find(tab => tab.textContent.includes('Catalysts'))?.click();
    await tick();
    flushSync();
    assert.ok(target.querySelector('[data-environment-field="environment.name"]'));

    target.querySelector('.environment-validation-link').click();
    await tick();
    flushSync();
    assert.ok(target.querySelector('[data-environment-field="environment.name"]'));

    target.querySelectorAll('.environment-validation-link')[1].click();
    await tick();
    flushSync();
    assert.ok(target.querySelector('.manager-v2-task-tabs [role="tab"].active').textContent.includes('Results'));
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
    Array.from(target.querySelectorAll('.manager-v2-tag-suggestion'))
      .find(button => button.textContent.includes('ore'))
      .click();
    await tick();
    flushSync();
    assert.equal(target.querySelectorAll('.manager-v2-component-row').length, 1);

    store.selectSystem('smithing');
    await tick();
    flushSync();

    assert.equal(target.querySelector('[aria-label="Filter components by tag"]'), null);
    assert.equal(target.querySelector('[aria-label="Search component tags"]'), null);
    assert.equal(target.querySelectorAll('.manager-v2-component-row').length, 1);
    assert.ok(target.textContent.includes('Coal'));
    assert.equal(target.textContent.includes('No components match these filters'), false);
  });

  it('supports search, row selection, in-place system edit, legacy admin fallback, and row actions', async () => {
    const calls = [];
    let onEditSystemCalled = false;
    let legacyOpened = false;
    target = document.createElement('div');
    document.body.appendChild(target);
    mounted = mount(Component, {
      target,
      props: {
        store: createStore(calls),
        services: {
          openCurrentAdmin: () => { legacyOpened = true; },
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
    assert.equal(target.querySelectorAll('.manager-v2-system-row').length, 1);
    assert.ok(target.textContent.includes('Smithing'));

    search.value = '';
    search.dispatchEvent(new Event('input', { bubbles: true }));
    await tick();
    flushSync();

    target.querySelector('[data-system-id="smithing"] .manager-v2-labeled-cell').click();
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
    target.querySelector('.manager-v2-header-actions .manager-v2-button:nth-child(2)').click();

    assert.equal(onEditSystemCalled, false);
    assert.equal(target.querySelector('.fabricate-manager-v2').dataset.managerV2View, 'system-edit');
    assert.ok(target.textContent.includes('System settings'));
    assert.ok(target.querySelector('.manager-v2-system-edit-form'));
    assert.deepEqual(calls.slice(-4), [
      ['selectSystem', 'smithing'],
      ['selectSystem', 'smithing'],
      ['exportSystem', 'smithing'],
      ['selectSystem', 'smithing']
    ]);
    assert.equal(legacyOpened, true);
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

    const name = target.querySelector('#manager-v2-system-name');
    const description = target.querySelector('#manager-v2-system-description');
    name.value = 'Greater Alchemy';
    name.dispatchEvent(new Event('input', { bubbles: true }));
    description.value = 'Updated potion work';
    description.dispatchEvent(new Event('input', { bubbles: true }));
    target.querySelector('.manager-v2-system-edit-form').dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));

    const resolution = target.querySelector('#manager-v2-system-resolution-mode');
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

    const resolution = target.querySelector('#manager-v2-system-resolution-mode');
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
});
