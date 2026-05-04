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
  'ImagePathPicker'
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
  writeCompiledSvelte('src/ui/svelte/apps/manager-v2/EnvironmentEditView.svelte');
  writeCompiledSvelte('src/ui/svelte/apps/EnvironmentsTab.svelte');
  for (const componentName of environmentComponentNames) {
    writeCompiledSvelte(`src/ui/svelte/apps/environments/${componentName}.svelte`);
  }
  for (const componentName of sharedComponentNames) {
    writeCompiledSvelte(`src/ui/svelte/components/${componentName}.svelte`);
  }

  const utilDestination = join(tempRoot, 'src/ui/svelte/util/foundryBridge.js');
  mkdirSync(dirname(utilDestination), { recursive: true });
  writeFileSync(
    utilDestination,
    readFileSync(resolve(repoRoot, 'src/ui/svelte/util/foundryBridge.js'), 'utf8')
  );

  const actionDestination = join(tempRoot, 'src/ui/svelte/actions/dragDrop.js');
  mkdirSync(dirname(actionDestination), { recursive: true });
  writeFileSync(
    actionDestination,
    readFileSync(resolve(repoRoot, 'src/ui/svelte/actions/dragDrop.js'), 'utf8')
  );
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
    itemTags: true,
    gathering: true,
    recipeCategories: true
  };
  const systemDetails = {
    alchemy: {
      id: 'alchemy',
      name: 'Alchemy',
      description: 'Potion and essence work',
      resolutionMode: 'alchemy',
      advancedOptionsEnabled: true,
      features: selectedFeatures,
      managedItemOptions: [{ id: 'c1' }, { id: 'c2' }, { id: 'c3' }, { id: 'c4' }],
      essenceDefinitions: [{ id: 'e1' }],
      itemTags: ['herb', 'mineral'],
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
  const environments = [
    environmentDraft,
    {
      id: 'env-cavern',
      craftingSystemId: 'alchemy',
      name: 'Quiet Cavern',
      description: 'Blind prospecting in dark mineral seams.',
      enabled: false,
      selectionMode: 'blind',
      sceneUuid: 'Scene.missing',
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
  const selectedSystem = options.selected === false ? null : systemDetails.alchemy;
  const viewState = writable({
    systems: [
      {
        id: 'alchemy',
        name: 'Alchemy',
        description: 'Potion and essence work',
        enabled: true,
        resolutionMode: 'alchemy',
        advancedOptionsEnabled: true,
        features: selectedFeatures,
        featureCount: 3,
        componentCount: 4,
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
    recipes: [
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
    itemCards: selectedSystem ? componentItems[selectedSystem.id] : [],
    showVisibilitySummary: true,
    canShowEnvironmentsTab: selectedFeatures.gathering === true,
    environments,
    environmentsLoading: false,
    environmentsError: null,
    selectedEnvironmentId: 'env-forest',
    environmentDraft,
    environmentDraftDirty: options.environmentDraftDirty === true,
    environmentDraftIsNew: false,
    environmentSaving: false,
    environmentSaveError: null,
    environmentValidationState: options.environmentValidationState || null,
    selectedEnvironmentTaskId: 'task-forage'
  });

  function applySelectedSystem(id) {
    const nextSelected = systemDetails[id] || null;
    viewState.update(state => ({
      ...state,
      selectedSystem: nextSelected,
      itemCards: componentItems[id] || [],
      itemSearchTerm: '',
      canShowEnvironmentsTab: nextSelected?.features?.gathering === true,
      systems: state.systems.map(system => ({
        ...system,
        selected: system.id === id
      }))
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
    updateEnvironmentTaskFailureOutcome: (...args) => calls.push(['updateEnvironmentTaskFailureOutcome', ...args])
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
    symlinkSync(resolve(repoRoot, 'node_modules'), join(tempRoot, 'node_modules'), 'dir');
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
      ['System settings', 'Recipes', 'Components', 'Environments', 'Essences', 'Tags & Categories', 'Rules', 'Graph']
    );
    assert.ok(target.textContent.includes('Alchemy'));
    assert.ok(target.textContent.includes('Potion and essence work'));
    assert.ok(target.textContent.includes('4'));
    assert.ok(target.textContent.includes('2'));

    const environmentFact = target.querySelector('[data-count-id="environments"]');
    assert.equal(environmentFact.textContent.trim().replace(/\s+/g, ' '), '2 Gathering environments');
    assert.equal(environmentFact.querySelector('.manager-v2-fact-leading')?.textContent.trim(), '2 Gathering');
    assert.equal(environmentFact.querySelector('.manager-v2-fact-label')?.textContent.trim(), 'environments');
  });

  it('hides selected-system placeholder navigation until a system is selected', () => {
    target = document.createElement('div');
    document.body.appendChild(target);
    mounted = mount(Component, {
      target,
      props: {
        store: createStore([], { selected: false }),
        services: { openCurrentAdmin: () => {} }
      }
    });
    flushSync();

    const navLabels = Array.from(target.querySelectorAll('.manager-v2-nav-label')).map(label => label.textContent.trim());
    assert.deepEqual(navLabels, []);
    assert.equal(navLabels.includes('Components'), false);
    assert.equal(navLabels.includes('Recipes'), false);
    assert.ok(target.textContent.includes('Crafting Systems'));
    assert.ok(target.textContent.includes('Select a system'));
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

  it('routes selected-system breadcrumb to settings and clears selection from the rail scope', async () => {
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

    const scopeButton = target.querySelector('.manager-v2-scope-button');
    assert.ok(scopeButton, 'selected system scope button should render');
    assert.ok(scopeButton.querySelector('.manager-v2-scope-clear'), 'selected system scope button should expose a clear icon');
    assert.equal(scopeButton.getAttribute('aria-label'), 'Clear selected system: Alchemy');

    scopeButton.click();
    await Promise.resolve();
    await tick();
    flushSync();

    assert.deepEqual(calls.slice(-1), [['selectSystem', '']]);
    assert.equal(target.querySelector('.fabricate-manager-v2').dataset.managerV2View, 'systems');
    assert.equal(target.querySelector('.manager-v2-scope-button'), null);
    assert.deepEqual(
      Array.from(target.querySelectorAll('.manager-v2-nav-label')).map(label => label.textContent.trim()),
      []
    );
    assert.ok(target.textContent.includes('Select a system'));
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

    target.querySelector('[data-recipe-id="r2"] .manager-v2-recipe-identity').click();
    await tick();
    flushSync();
    assert.ok(target.querySelector('[data-recipe-id="r2"]').classList.contains('is-selected'));
    assert.ok(target.textContent.includes('Locked Elixir'));
    assert.ok(target.textContent.includes('Restricted (none selected)'));

    const search = target.querySelector('.manager-v2-toolbar input[type="search"]');
    search.value = 'elixir';
    search.dispatchEvent(new Event('input', { bubbles: true }));

    const toggle = target.querySelector('[data-recipe-id="r2"] input[type="checkbox"]');
    toggle.checked = true;
    toggle.dispatchEvent(new Event('change', { bubbles: true }));

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
    assert.ok(target.textContent.includes('Linked source'));
    assert.ok(target.textContent.includes('Earth 2'));
    assert.ok(target.textContent.includes('Usage evidence'));

    const search = target.querySelector('.manager-v2-toolbar input[type="search"]');
    search.value = 'iron';
    search.dispatchEvent(new Event('input', { bubbles: true }));

    const sourceFilter = target.querySelector('[aria-label="Filter components by source state"]');
    sourceFilter.value = 'none';
    sourceFilter.dispatchEvent(new Event('change', { bubbles: true }));
    sourceFilter.dispatchEvent(new Event('input', { bubbles: true }));
    await tick();
    flushSync();
    assert.equal(target.querySelectorAll('.manager-v2-component-row').length, 1);
    assert.ok(target.textContent.includes('Glass Vial'));

    sourceFilter.value = 'all';
    sourceFilter.dispatchEvent(new Event('change', { bubbles: true }));
    sourceFilter.dispatchEvent(new Event('input', { bubbles: true }));
    await tick();
    flushSync();

    target.querySelector('[data-component-id="c1"] .manager-v2-component-identity').click();
    await tick();
    flushSync();
    assert.ok(target.querySelector('[data-component-id="c1"]').classList.contains('is-selected'));
    assert.ok(target.textContent.includes('Compendium.fabricate.items.iron-ore'));

    const dropEvent = new Event('drop', { bubbles: true, cancelable: true });
    Object.defineProperty(dropEvent, 'dataTransfer', {
      value: { getData: () => JSON.stringify({ type: 'Item', uuid: 'Item.dropped' }) }
    });
    target.querySelector('.manager-v2-component-drop-zone').dispatchEvent(dropEvent);

    target.querySelector('[data-component-id="c1"] .manager-v2-icon-button').click();
    target.querySelector('[data-component-id="c1"] .manager-v2-icon-button:nth-of-type(2)').click();
    target.querySelector('[data-component-id="c1"] .manager-v2-icon-button:nth-of-type(3)').click();

    assert.deepEqual(dropped, [{ type: 'Item', uuid: 'Item.dropped' }]);
    assert.deepEqual(copied, ['Compendium.fabricate.items.iron-ore']);
    assert.deepEqual(edited, ['c1']);
    assert.ok(calls.some(call => call[0] === 'setItemSearch' && call[1] === 'iron'));
    assert.ok(calls.some(call => call[0] === 'deleteComponent' && call[1] === 'c1'));
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

    navButton('Environments').click();
    await tick();
    flushSync();

    assert.equal(target.querySelector('.fabricate-manager-v2').dataset.managerV2View, 'environments');
    assert.equal(target.querySelectorAll('.manager-v2-environment-row').length, 2);
    assert.ok(target.textContent.includes('Gathering environments'));
    assert.ok(target.textContent.includes('Moonlit Forest'));
    assert.ok(target.textContent.includes('Quiet Cavern'));
    assert.ok(target.textContent.includes('Linked scene'));
    assert.ok(target.textContent.includes('Scene unresolved'));

    const search = target.querySelector('.manager-v2-toolbar input[type="search"]');
    search.value = 'cavern';
    search.dispatchEvent(new Event('input', { bubbles: true }));
    await tick();
    flushSync();
    assert.equal(target.querySelectorAll('.manager-v2-environment-row').length, 1);
    assert.ok(target.textContent.includes('Quiet Cavern'));
    assert.equal(
      target.querySelector('[data-environment-id="env-cavern"] .manager-v2-icon-button:nth-of-type(2)').disabled,
      false,
      'filtered environment move-up should use full list order, not filtered row position'
    );

    target.querySelector('[data-environment-id="env-cavern"] .manager-v2-environment-identity').click();
    await tick();
    flushSync();
    assert.ok(target.querySelector('[data-environment-id="env-cavern"]').classList.contains('is-selected'));
    assert.ok(calls.some(call => call[0] === 'selectEnvironment' && call[1] === 'env-cavern'));

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
    assert.ok(target.querySelector('.manager-v2-environment-evidence-column'));
    assert.equal(target.textContent.includes('Back to environments'), false);
    assert.ok(target.textContent.includes('Quiet Cavern'));

    target.querySelector('.manager-v2-environment-task-rail .manager-v2-icon-button').click();
    target.querySelector('.manager-v2-environment-edit-view').dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));

    assert.ok(calls.some(call => call[0] === 'addEnvironmentTask'));
    assert.ok(calls.some(call => call[0] === 'saveEnvironmentDraft'));
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

    navButton('Environments').click();
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

    navButton('Environments').click();
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

    navButton('Environments').click();
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

    navButton('Environments').click();
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

    target.querySelector('.manager-v2-environment-details-tabs [role="tab"]:nth-child(2)').click();
    await tick();
    flushSync();
    assert.equal(target.querySelector('[data-environment-field="environment.name"]'), null);

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

    const tagFilter = target.querySelector('[aria-label="Filter components by tag"]');
    tagFilter.value = 'ore';
    tagFilter.dispatchEvent(new Event('change', { bubbles: true }));
    await tick();
    flushSync();
    assert.equal(target.querySelectorAll('.manager-v2-component-row').length, 1);

    store.selectSystem('smithing');
    await tick();
    flushSync();

    assert.equal(target.querySelector('[aria-label="Filter components by tag"]'), null);
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
