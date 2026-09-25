/** THE DERIVED MARKER FIXTURE and its completeness closures (issue 1363, criterion 9). */

import assert from 'node:assert/strict';
import test from 'node:test';
import { Recipe } from '../src/models/Recipe.js';
import {
  keyedRemapper,
  rewriteEssenceQuantityMap,
  rewriteGatheringSliceReferences,
  rewriteMembershipReferences,
  rewriteRecipeReferences,
  rewriteSystemReferences,
  WORLD_SCOPE_DEFENSIVE_SITES,
  WORLD_SCOPE_ESSENCE_DEFENSIVE_SITES,
  WORLD_SCOPE_ESSENCE_REFERENCE_SITES,
  WORLD_SCOPE_REFERENCE_SITES,
} from '../src/systems/worldScopeReferenceRewrite.js';
import { installFoundryStubs } from './helpers/worldScopeCorpus.js';

installFoundryStubs();
const { CraftingSystemManager } = await import('../src/systems/CraftingSystemManager.js');
const { createAdminStore } = await import('../src/ui/svelte/stores/adminStore.js');

const MARKER = 'MARKER-ID';
const REWRITTEN = 'REWRITTEN-ID';

/** The corpus's authored essence id, and the two ids the essence leg maps it to. */
const ESSENCE_KEY = 'fire';
const ESSENCE_VALUE_REWRITTEN = 'REWRITTEN-ESSENCE-VALUE';
const ESSENCE_KEY_REWRITTEN = 'REWRITTEN-ESSENCE-KEY';

/** One essence-typed ingredient option, with an essence-typed alternative. */
const essenceOption = () => ({
  quantity: 1,
  match: { type: 'essence', essenceId: ESSENCE_KEY, amount: 3 },
  alternatives: [{ quantity: 1, match: { type: 'essence', essenceId: ESSENCE_KEY, amount: 2 } }],
});

// Deriving the maximally-populated corpus from the three REAL producers

function producedSystem() {
  const manager = new CraftingSystemManager({ getRecipes: () => [] });
  return manager._normalizeSystem({
    id: 'sys-1',
    name: 'System',
    features: { salvage: true, essences: true, gathering: true },
    essenceDefinitions: [
      {
        id: ESSENCE_KEY,
        name: 'Fire',
        icon: 'fas fa-fire',
        colorToken: 'rose',
        description: 'Fire',
        enabled: true,
        propertyMacroUuid: 'Macro.abc',
        sourceComponentId: 'comp-1',
        sourceItemUuid: 'comp-1',
        associatedSystemItemId: 'comp-1',
      },
    ],
    components: [
      {
        id: 'comp-1',
        name: 'Ash Salt',
        img: 'icons/svg/item-bag.svg',
        description: 'Ash',
        originItemUuid: 'Item.aaa',
        registeredItemUuid: 'Item.aaa',
        aliasItemUuids: ['Item.bbb'],
        category: 'reagent',
        tags: ['alchemical'],
        essences: { [ESSENCE_KEY]: 2 },
        difficulty: 3,
        complications: [{ id: 'cx-1', label: 'Cracks' }],
        salvage: {
          enabled: true,
          toolIds: ['tool-1'],
          resultGroups: [{ id: 'sg-1', results: [{ componentId: 'comp-1', quantity: 1 }] }],
        },
      },
    ],
    tools: [
      {
        id: 'tool-1',
        name: 'Hammer',
        label: 'Hammer',
        img: 'icons/svg/anvil.svg',
        description: 'A hammer',
        componentId: 'comp-1',
        originItemUuid: 'Item.ccc',
        registeredItemUuid: 'Item.ccc',
        aliasItemUuids: [],
        requirement: { formula: '1d20' },
        prerequisites: { enabled: false, ids: [], gateMode: 'usability' },
        bonus: { enabled: true, expression: '@prof' },
        breakage: { mode: 'limitedUses', maxUses: 4 },
        checkBreakable: true,
        onBreak: {
          mode: 'replaceWith',
          replacementTarget: { type: 'component', componentId: 'comp-1' },
        },
        repairRequirements: [
          {
            id: 'rr-1',
            name: 'Repair',
            options: [
              {
                quantity: 1,
                match: { type: 'component', componentId: 'comp-1' },
                alternatives: [
                  { quantity: 1, match: { type: 'component', componentId: 'comp-1' } },
                ],
              },
              essenceOption(),
            ],
          },
        ],
      },
    ],
  });
}

function producedRecipe() {
  const ingredientSet = {
    id: 'is-1',
    name: 'Set',
    toolIds: ['tool-1'],
    // `IngredientSet.toJSON` omits an empty per-set quantity map, which would make
    // `recipes[].ingredientSets[].essences{}` unproducible and demote the site to the defensive
    // list; it is populated so the derivation genuinely covers it.
    essences: { [ESSENCE_KEY]: 1 },
    ingredientGroups: [
      {
        id: 'ig-1',
        name: 'Group',
        options: [
          {
            quantity: 1,
            match: { type: 'component', componentId: 'comp-1' },
            alternatives: [{ quantity: 1, match: { type: 'component', componentId: 'comp-1' } }],
          },
          essenceOption(),
        ],
      },
    ],
  };
  const resultGroups = [{ id: 'rg-1', results: [{ componentId: 'comp-1', quantity: 1 }] }];
  return new Recipe({
    id: 'recipe-1',
    craftingSystemId: 'sys-1',
    name: 'Recipe',
    toolIds: ['tool-1'],
    ingredientSets: [ingredientSet],
    resultGroups,
    steps: [
      {
        id: 'step-1',
        name: 'Step',
        toolIds: ['tool-1'],
        ingredientSets: [{ ...ingredientSet, id: 'sis-1' }],
        resultGroups: [{ id: 'srg-1', results: [{ componentId: 'comp-1', quantity: 1 }] }],
      },
    ],
  }).toJSON();
}

async function producedGatheringConfig(system) {
  // THE REAL PRODUCER. `gatheringConfig` is written by exactly one thing — `adminStore`'s
  // `_saveGatheringConfig` — and its two normalizers are whitelist rebuilds, so a hand-authored
  // slice would pin keys production never emits and miss keys it does.
  let persisted = {};
  const services = {
    getSetting: (key) => (key === 'gatheringConfig' ? persisted : 'sys-1'),
    setSetting: async (key, value) => {
      if (key === 'gatheringConfig') persisted = value;
    },
    getCraftingSystemManager: () => ({
      getSystems: () => [system],
      getSystem: (id) => (id === system.id ? system : null),
      getItems: () => system.components,
    }),
    getRecipeManager: () => ({ getRecipes: () => [], getRecipe: () => null }),
    getScriptMacros: () => [],
    getSceneOptions: () => [],
    getWorldUsers: () => [],
    getWorldActors: () => [],
    localize: (key) => key,
    notify: { info: () => {}, warn: () => {}, error: () => {} },
  };
  const store = createAdminStore(services);
  await store.refresh?.();
  await store.selectSystem?.('sys-1');
  const task = await store.addGatheringLibraryTask('sys-1');
  await store.updateGatheringLibraryTask('sys-1', task.id, {
    toolIds: ['tool-1'],
    dropRows: [{ id: 'drop-1', componentId: 'comp-1', quantity: 1, dropRate: 50 }],
    resolutionMode: 'straight',
    resultGroups: [
      {
        id: 'gathering-rg-1',
        name: 'Gathered result',
        results: [{ id: 'gathering-result-1', componentId: 'comp-1', quantity: 1 }],
      },
    ],
  });
  const event = await store.addGatheringLibraryEvent('sys-1');
  await store.updateGatheringLibraryEvent('sys-1', event.id, { dangerTags: ['storm'] });
  assert.ok(persisted?.systems?.['sys-1'], 'the premise: the real save path persisted a slice');
  // The pre-`0.7.0` LEGACY tools copy is a genuine on-disk shape the walk still covers, and no
  // shipped writer emits it any more, so it is grafted from the system's own normalized tools
  // rather than hand-authored.
  persisted.systems['sys-1'].tools = JSON.parse(JSON.stringify(system.tools));
  return persisted;
}

const system = producedSystem();
const recipe = producedRecipe();
const gatheringConfig = await producedGatheringConfig(system);

/** Replace every string leaf with the marker, so the diff partitions the corpus exhaustively. */
function markEveryStringLeaf(value) {
  if (Array.isArray(value)) return value.map((entry) => markEveryStringLeaf(entry));
  if (value === null || typeof value !== 'object') {
    return typeof value === 'string' ? MARKER : value;
  }
  const marked = {};
  for (const [key, entry] of Object.entries(value)) marked[key] = markEveryStringLeaf(entry);
  return marked;
}

/** Every leaf path in a value, with array indices collapsed to `[]`. */
function leafPaths(value, path = '', collected = new Map()) {
  if (Array.isArray(value)) {
    for (const entry of value) leafPaths(entry, `${path}[]`, collected);
    return collected;
  }
  if (value === null || typeof value !== 'object') {
    collected.set(path, value);
    return collected;
  }
  for (const [key, entry] of Object.entries(value)) {
    leafPaths(entry, path ? `${path}.${key}` : key, collected);
  }
  return collected;
}

/** Every plain object in a value, as `path -> its own key names`, with array indices collapsed. */
function keySetPaths(value, path = '', collected = new Map()) {
  if (Array.isArray(value)) {
    for (const entry of value) keySetPaths(entry, `${path}[]`, collected);
    return collected;
  }
  if (value === null || typeof value !== 'object') return collected;
  const keys = collected.get(path) ?? new Set();
  for (const key of Object.keys(value)) keys.add(key);
  collected.set(path, keys);
  for (const [key, entry] of Object.entries(value)) {
    keySetPaths(entry, path ? `${path}.${key}` : key, collected);
  }
  return collected;
}

/** The paths of every object whose own key set the walk moved. */
function reKeyedPaths(beforeRoot, afterRoot) {
  const beforeKeys = keySetPaths(beforeRoot);
  const afterKeys = keySetPaths(afterRoot);
  const moved = new Set();
  for (const [path, keys] of beforeKeys) {
    const after = [...(afterKeys.get(path) ?? [])].sort().join('|');
    if ([...keys].sort().join('|') !== after) moved.add(path);
  }
  return moved;
}

/** The object path a leaf path hangs off, or `''` for a leaf on the root. */
function parentPath(path) {
  const cut = path.lastIndexOf('.');
  return cut === -1 ? '' : path.slice(0, cut);
}

function buildMarkedCorpus() {
  return {
    systems: [markEveryStringLeaf(system)],
    recipes: [markEveryStringLeaf(recipe)],
    gatheringConfig: markEveryStringLeaf(gatheringConfig),
  };
}

function markedCorpusRoots(corpus) {
  return [
    ['systems[]', corpus.systems[0]],
    ['recipes[]', corpus.recipes[0]],
    ['gatheringConfig.systems.*', corpus.gatheringConfig.systems['sys-1']],
  ];
}

/** Run the shared walk over the marked corpus with one leg's remappers live and diff it. */
function diffMarkedCorpus(remappers) {
  const before = buildMarkedCorpus();
  const after = buildMarkedCorpus();
  rewriteSystemReferences(after.systems[0], remappers);
  rewriteRecipeReferences(after.recipes[0], remappers);
  rewriteGatheringSliceReferences(after.gatheringConfig.systems['sys-1'], remappers);

  const beforeRoots = markedCorpusRoots(before);
  const afterRoots = markedCorpusRoots(after);
  const touched = new Set();
  const keyMaps = new Set();
  const allLeaves = new Map();
  for (const [index, [prefix, beforeRoot]] of beforeRoots.entries()) {
    const afterRoot = afterRoots[index][1];
    const full = (path) => `${prefix}.${path}`.replace('.[]', '[]');
    const moved = reKeyedPaths(beforeRoot, afterRoot);
    for (const path of moved) keyMaps.add(`${full(path)}{}`);
    const beforeLeaves = leafPaths(beforeRoot);
    const afterLeaves = leafPaths(afterRoot);
    for (const [path, value] of beforeLeaves) {
      allLeaves.set(full(path), value);
      // A leaf of a re-keyed map is already reported as its container's key-position site;
      // counting it again as a vanished leaf would double-report the one rewrite.
      if (moved.has(parentPath(path))) continue;
      if (afterLeaves.get(path) !== value) touched.add(full(path));
    }
  }
  return { touched, keyMaps, allLeaves };
}

const componentAndToolLeg = diffMarkedCorpus({
  remapComponent: keyedRemapper({ [MARKER]: REWRITTEN }),
  remapTool: keyedRemapper({ [MARKER]: REWRITTEN }),
});
const essenceLeg = diffMarkedCorpus({
  remapEssence: keyedRemapper({
    [MARKER]: ESSENCE_VALUE_REWRITTEN,
    [ESSENCE_KEY]: ESSENCE_KEY_REWRITTEN,
  }),
});
const { touched, allLeaves } = componentAndToolLeg;

// ---------------------------------------------------------------------------

test('the derived corpus is genuinely maximal — the premise every assertion below rests on', () => {
  // ANTI-VACUITY. A derived corpus that produced nothing would make every closure below pass by
  // reading zero leaves, which is the shape of vacuity this whole criterion exists to refuse.
  assert.ok(allLeaves.size > 80, `the marked corpus must be richly populated (${allLeaves.size})`);
  assert.ok(touched.size > 0, 'the walk must have rewritten something');
  const roots = new Set([...allLeaves.keys()].map((path) => path.split(/[.[]/)[0]));
  assert.deepEqual([...roots].sort(), ['gatheringConfig', 'recipes', 'systems']);
  // The essence leg has the same anti-vacuity premise, and one more: a corpus carrying no essence
  // option and no populated quantity map would make both essence closures pass by reading zero.
  assert.ok(essenceLeg.touched.size > 0, 'the essence leg must have rewritten a leaf value');
  assert.ok(essenceLeg.keyMaps.size > 0, 'the essence leg must have re-keyed a quantity map');
});

test('the touched set is SET-EQUAL to the enumerated site list, in BOTH directions', () => {
  const enumerated = [...WORLD_SCOPE_REFERENCE_SITES].sort();
  const actual = [...touched].sort();
  assert.deepEqual(
    actual,
    enumerated,
    'a site the walk rewrites but does not list, or lists but does not rewrite, is a mirror that has rotted'
  );
});

test('the ESSENCE leg is SET-EQUAL to its own enumerated site list, in BOTH directions', () => {
  // The leg is derived with `remapComponent` and `remapTool` at `identity`, so this set is the
  // essence sites alone: a component site that leaked into the essence remapper, or an essence
  // site the walk lists and does not rewrite, fails here rather than hiding inside a merged list.
  const actual = [...essenceLeg.touched, ...essenceLeg.keyMaps].sort();
  assert.deepEqual(
    actual,
    [...WORLD_SCOPE_ESSENCE_REFERENCE_SITES].sort(),
    'an essence site the walk rewrites but does not list, or lists but does not rewrite, is a mirror that has rotted'
  );
});

test('the COMPONENT-AND-TOOL leg re-keys NOTHING — key-position rewriting is the essence leg alone', () => {
  // The negative half of the key-set closure.
  assert.deepEqual([...componentAndToolLeg.keyMaps].sort(), []);
});

/**
 * The leaf key names a reference site can bear, derived from the site lists rather than restated.
 */
const leafKeyName = (path) => path.replace(/\[\]$/, '').split('.').pop().replace(/\[\]$/, '');

const SITE_KEY_NAMES = new Set(
  [...WORLD_SCOPE_REFERENCE_SITES, ...WORLD_SCOPE_ESSENCE_REFERENCE_SITES]
    .filter((site) => !site.endsWith('{}'))
    .map((site) => leafKeyName(site))
);

/**
 * Every enumerated position across all four lists — the two leaf closures and the defensive
 * completeness walk all ask the same question of it, so it is built once.
 */
const ENUMERATED_SITES = new Set([
  ...WORLD_SCOPE_REFERENCE_SITES,
  ...WORLD_SCOPE_DEFENSIVE_SITES,
  ...WORLD_SCOPE_ESSENCE_REFERENCE_SITES,
  ...WORLD_SCOPE_ESSENCE_DEFENSIVE_SITES,
]);

/**
 * Every leaf key name in the derived corpus that is NOT a reference site. Two names no longer fit
 * that one reason and have moved to {@link ESSENCE_LEG_NON_SITE_KEY_NAMES}: both rested on essence
 * ids never being re-keyed, which `1.34.0` retired (issue 1654).
 */
const NON_SITE_KEY_NAMES = new Set([
  'alchemy',
  'adjustmentOverride',
  'aliasItemUuids',
  'allowPlayerResultReorder',
  'amount',
  'author',
  'awardMode',
  'biomeModifierAggregation',
  'blindCandidateGate',
  'breakToolsOnFail',
  'categories',
  'category',
  'chatOutput',
  'checkBreakable',
  'checkTrigger',
  'cmp',
  'colorToken',
  'complex',
  'consumeComponentOnFail',
  'consumeIngredientsOnFail',
  'crafting',
  'craftingChecks',
  'craftingSystemId',
  'created',
  'currencyCost',
  'current',
  'customColor',
  'dangerTags',
  'dc',
  'dcMode',
  'dcOverride',
  'defaultEnvironmentId',
  'defaultModifierPolicy',
  'description',
  'difficulty',
  'discoveryMode',
  'dragDropEnabled',
  'dropModifierMode',
  'dropRate',
  'effectTransfer',
  'enableCategories',
  'enableEssences',
  'enableMultiStepRecipes',
  'enableTags',
  'enabled',
  'eventLimit',
  'eventModifier',
  'eventPolicy',
  'eventSelectionMode',
  'eventVisibility',
  'expr',
  'expression',
  'failureResultPolicy',
  'formula',
  'gateMode',
  'gathering',
  'gatheringModifier',
  'icon',
  'id',
  'img',
  'ingredientQuantity',
  'itemPiles',
  'itemSelectionMode',
  'itemTags',
  'itemUuid',
  'label',
  'linkedSceneUuid',
  'listMode',
  'macroUuid',
  'match',
  'maxUses',
  'membershipResolvesByRecipeIds',
  'mode',
  'modified',
  'multiStepRecipes',
  'name',
  'originItemUuid',
  'outcomeRouting',
  'outcomes',
  'propertyMacroUuid',
  'propertyMacros',
  'quantity',
  'recipeCategories',
  'refundOnPlayerCancel',
  'registeredItemUuid',
  'resolutionMode',
  'resultSelection',
  'revealPolicy',
  'revealScope',
  'rewardLimit',
  'rewardSelectionMode',
  'rollFormula',
  'salvage',
  'salvageResolutionMode',
  'severity',
  'stageAwarded',
  'stageMissed',
  'stagePartial',
  'staminaCost',
  'successesOverride',
  'tags',
  'thresholdMode',
  'tier',
  'timeRequirement',
  'toolBreakagePolicy',
  'type',
  'value',
  'version',
  'visibility',
  'visibilityMode',
]);

/** The two leaf key names issue 1654 moved out of {@link NON_SITE_KEY_NAMES}. */
const ESSENCE_LEG_NON_SITE_KEY_NAMES = new Set(['essences', ESSENCE_KEY]);

const EVALUATION_NON_SITE_KEY_NAMES = new Set([
  'adjustmentKind',
  'base',
  'baseAdjustment',
  'die',
  'direction',
  'kind',
  'max',
  'modifierDestination',
  'once',
  'path',
  'product',
  'readMacroUuid',
  'required',
  'source',
  'spendMacroUuid',
  'threshold',
  'zeroPoolFails',
]);

test('evaluation leaves and external Macro UUIDs stay outside world entity reference rewriting', () => {
  const evaluationLeaves = [...allLeaves.keys()].filter((path) =>
    EVALUATION_NON_SITE_KEY_NAMES.has(leafKeyName(path))
  );
  assert.ok(evaluationLeaves.length > 0, 'the producer emits evaluation leaves');
  assert.ok(
    evaluationLeaves.every((path) => path.includes('.evaluation.')),
    'evaluation value keys are excluded only in the evaluation record'
  );
  const macroUuids = evaluationLeaves.filter((path) =>
    ['readMacroUuid', 'spendMacroUuid'].includes(leafKeyName(path))
  );
  assert.ok(macroUuids.length > 0, 'the producer emits external Macro UUID slots');
  assert.ok(
    macroUuids.every((path) =>
      /\.evaluation\.pool\.additionalDice\.(readMacroUuid|spendMacroUuid)$/.test(path)
    )
  );
  assert.ok(macroUuids.every((path) => !touched.has(path) && !essenceLeg.touched.has(path)));
});

test('the KEY-NAME closure: every leaf key in the derived corpus is a site key or a listed non-site', () => {
  const keyNames = new Set([...allLeaves.keys()].map((path) => leafKeyName(path)));
  const nonSites = new Set([
    ...NON_SITE_KEY_NAMES,
    ...ESSENCE_LEG_NON_SITE_KEY_NAMES,
    ...EVALUATION_NON_SITE_KEY_NAMES,
  ]);
  const unclassified = [...keyNames].filter(
    (key) => !SITE_KEY_NAMES.has(key) && !nonSites.has(key)
  );
  assert.deepEqual(
    unclassified.sort(),
    [],
    'a NEW leaf key emitted by any of the three producers is on neither list and fails HERE, ' +
      'whatever it is called — which is what an anchored seven-name regex could never do'
  );
  const unused = [...nonSites].filter((key) => !keyNames.has(key));
  assert.deepEqual(
    unused.sort(),
    [],
    'a non-site exclusion for a key the producers no longer emit is dead weight that hides the next one'
  );
});

test('the PATH closure: every leaf whose key name is a SITE key name is itself an enumerated site', () => {
  const unlisted = [...allLeaves.keys()].filter((path) => {
    const key = leafKeyName(path);
    return SITE_KEY_NAMES.has(key) && !ENUMERATED_SITES.has(path);
  });
  assert.deepEqual(
    unlisted.sort(),
    [],
    'this is the assertion that catches a re-introduced historical gap: ' +
      '`onBreak.replacementTarget.componentId` and essence `sourceItemUuid` both reuse an ' +
      'already-known key name, so the key-name closure alone would let either through'
  );
});

test('a system-level toolBreakage is NOT a reference site and is never rewritten', () => {
  const before = buildMarkedCorpus();
  const after = buildMarkedCorpus();
  after.systems[0].toolBreakage = { authority: MARKER };
  before.systems[0].toolBreakage = { authority: MARKER };
  rewriteSystemReferences(after.systems[0], {
    remapComponent: keyedRemapper({ [MARKER]: REWRITTEN }),
    remapTool: keyedRemapper({ [MARKER]: REWRITTEN }),
  });
  assert.equal(after.systems[0].toolBreakage.authority, MARKER);
});

test('the DEFENSIVE list is COMPLETE: every unproducible leaf the walk touches is on it', () => {
  // The list is the ONE escape hatch from the set-equality above, so it is pinned in BOTH
  // directions rather than trusted.
  const match = () => ({
    type: 'component',
    componentId: MARKER,
    systemItemId: MARKER,
    essenceId: MARKER,
  });
  const ingredient = () => ({
    quantity: 1,
    componentId: MARKER,
    systemItemId: MARKER,
    match: match(),
    alternatives: [{ quantity: 1, componentId: MARKER, systemItemId: MARKER, match: match() }],
  });
  const set = () => ({
    id: MARKER,
    toolIds: [MARKER],
    ingredientGroups: [{ id: MARKER, name: MARKER, options: [ingredient()] }],
    ingredients: [ingredient()],
    catalysts: [ingredient()],
  });
  const results = () => [{ componentId: MARKER, systemItemId: MARKER, quantity: 1 }];
  const tool = () => ({
    id: MARKER,
    componentId: MARKER,
    onBreak: {
      mode: 'replaceWith',
      replacementComponentId: MARKER,
      replacementTarget: { type: 'component', componentId: MARKER },
    },
    repairRequirements: [{ id: MARKER, name: MARKER, options: [ingredient()] }],
  });
  const build = () => ({
    system: {
      id: MARKER,
      components: [
        {
          id: MARKER,
          salvage: {
            toolIds: [MARKER],
            catalysts: [ingredient()],
            resultGroups: [{ id: MARKER, results: results() }],
          },
        },
      ],
      essenceDefinitions: [
        {
          id: MARKER,
          sourceComponentId: MARKER,
          associatedSystemItemId: MARKER,
          sourceItemUuid: MARKER,
        },
      ],
      tools: [tool()],
    },
    recipe: {
      id: MARKER,
      toolIds: [MARKER],
      ingredientSets: [set()],
      resultGroups: [{ id: MARKER, results: results() }],
      results: results(),
      catalysts: [ingredient()],
      steps: [
        {
          id: MARKER,
          toolIds: [MARKER],
          ingredientSets: [set()],
          resultGroups: [{ id: MARKER, results: results() }],
          catalysts: [ingredient()],
        },
      ],
    },
    slice: {
      tasks: [
        {
          id: MARKER,
          toolIds: [MARKER],
          dropRows: [{ id: MARKER, componentId: MARKER, systemItemId: MARKER }],
        },
      ],
      events: [
        {
          id: MARKER,
          toolIds: [MARKER],
          dropRows: [{ id: MARKER, componentId: MARKER, systemItemId: MARKER }],
        },
      ],
      tools: [tool()],
    },
  });

  const before = build();
  const after = build();
  const remappers = {
    remapComponent: keyedRemapper({ [MARKER]: REWRITTEN }),
    remapTool: keyedRemapper({ [MARKER]: REWRITTEN }),
    remapEssence: keyedRemapper({ [MARKER]: ESSENCE_VALUE_REWRITTEN }),
  };
  rewriteSystemReferences(after.system, remappers);
  rewriteRecipeReferences(after.recipe, remappers);
  rewriteGatheringSliceReferences(after.slice, remappers);

  const unlisted = [];
  for (const [prefix, beforeRoot, afterRoot] of [
    ['systems[]', before.system, after.system],
    ['recipes[]', before.recipe, after.recipe],
    ['gatheringConfig.systems.*', before.slice, after.slice],
  ]) {
    const beforeLeaves = leafPaths(beforeRoot);
    const afterLeaves = leafPaths(afterRoot);
    for (const [path, value] of beforeLeaves) {
      if (afterLeaves.get(path) === value) continue;
      const full = `${prefix}.${path}`.replace('.[]', '[]');
      if (!ENUMERATED_SITES.has(full)) unlisted.push(full);
    }
  }
  assert.deepEqual(
    unlisted.sort(),
    [],
    'the walk rewrites a leaf that is on NEITHER the site list nor the defensive list'
  );
});

test('every DEFENSIVE site is genuinely unproducible — the list cannot hide a real, missed site', () => {
  // The defensive list is the ONE escape hatch from the set-equality above, so it is itself
  // guarded: a path on it that the real producers DO emit is a site hiding in the exemption,
  // which is exactly how a file-path allowlist defeats a gate.
  const produced = new Set(allLeaves.keys());
  const producible = WORLD_SCOPE_DEFENSIVE_SITES.filter((site) =>
    produced.has(site.endsWith('[]') ? site : site)
  );
  assert.deepEqual(
    producible,
    [],
    'a defensive site the producers actually emit belongs in WORLD_SCOPE_REFERENCE_SITES'
  );
  assert.ok(WORLD_SCOPE_DEFENSIVE_SITES.length > 0, 'the exemption list is not vacuous');
});

test('every ESSENCE defensive site is genuinely unproducible, leaf and key position alike', () => {
  // Same guard for the key-position half, which needs its own lookup: a `…essences{}` entry is not
  // a leaf path, so `allLeaves` can never contain it.
  const producedLeaves = new Set(allLeaves.keys());
  const producedContainers = new Set([...allLeaves.keys()].map((path) => `${parentPath(path)}{}`));
  const producible = WORLD_SCOPE_ESSENCE_DEFENSIVE_SITES.filter((site) =>
    site.endsWith('{}') ? producedContainers.has(site) : producedLeaves.has(site)
  );
  assert.deepEqual(
    producible,
    [],
    'an essence defensive site the producers actually emit belongs in WORLD_SCOPE_ESSENCE_REFERENCE_SITES'
  );
  assert.ok(WORLD_SCOPE_ESSENCE_DEFENSIVE_SITES.length > 0, 'the exemption list is not vacuous');
});

// The essence leg's behaviour, where the derived fixture cannot reach (issue 1654)

/** `{ essences }` carriers for the two world-scope rows the derived corpus has no producer for. */
const scopeRows = () => ({
  worldDefault: { id: 'comp-1', category: 'reagent', essences: { fire: 2, flame: 3 } },
  membership: {
    entityId: 'comp-1',
    systemId: 'sys-1',
    inherit: { category: false, essences: false },
    essences: { fire: 2, flame: 3 },
  },
});

const MERGE_FLAME_INTO_FIRE = { flame: 'fire' };

test('an ESSENCE remapper defaults to identity, so every pre-1654 caller is byte-identical', () => {
  // The premise the whole leg rests on: `rebindCopyComponentIds` and the `1.30.0` pass hand the
  // walk two remappers and no third, and must keep seeing essence ids they never asked to move.
  const before = buildMarkedCorpus();
  const after = buildMarkedCorpus();
  rewriteSystemReferences(after.systems[0], {
    remapComponent: keyedRemapper({ [MARKER]: REWRITTEN }),
    remapTool: keyedRemapper({ [MARKER]: REWRITTEN }),
  });
  rewriteRecipeReferences(after.recipes[0], { remapComponent: keyedRemapper({}) });
  assert.deepEqual(
    after.systems[0].components[0].essences,
    before.systems[0].components[0].essences
  );
  assert.equal(
    after.recipes[0].ingredientSets[0].ingredientGroups[0].options[1].match.essenceId,
    MARKER,
    'an essence leaf must be untouched when no essence remapper is supplied'
  );
});

test('a KEY COLLISION SUMS, because the survivor carries both merged contributions', () => {
  const component = { id: 'comp-1', essences: { fire: 2, flame: 3, water: 1 } };
  rewriteEssenceQuantityMap(component, { remapEssence: keyedRemapper(MERGE_FLAME_INTO_FIRE) });
  assert.deepEqual(
    component.essences,
    { fire: 5, water: 1 },
    'last-writer-wins here would silently delete a quantity a GM authored'
  );
  assert.deepEqual(
    Object.keys(component.essences),
    ['fire', 'water'],
    'a merged key keeps the position of its FIRST contributor'
  );
});

test('the essence re-key is IDEMPOTENT on a map whose image is disjoint from its keys', () => {
  const rewrite = (set) =>
    rewriteRecipeReferences(
      { ingredientSets: [set] },
      { remapEssence: keyedRemapper(MERGE_FLAME_INTO_FIRE) }
    );
  const set = { id: 'is-1', essences: { fire: 2, flame: 3 } };
  rewrite(set);
  const once = JSON.stringify(set.essences);
  rewrite(set);
  assert.equal(
    JSON.stringify(set.essences),
    once,
    'a second pass must not re-sum: `fire` is not a key of the map, so one simultaneous lookup leaves it alone'
  );
  assert.deepEqual(set.essences, { fire: 5 });
});

test('the essence leg is TOTAL: malformed carriers answer, and never throw', () => {
  const remappers = { remapEssence: keyedRemapper(MERGE_FLAME_INTO_FIRE) };
  for (const container of [null, undefined, 'flame', 42, []]) {
    assert.doesNotThrow(() => rewriteEssenceQuantityMap(container, remappers));
  }
  // A non-object `essences` is left exactly as found rather than coerced or dropped: a migration
  // that rewrites a malformed value into a plausible one has destroyed the evidence.
  for (const essences of [null, 'flame', 7, ['flame']]) {
    const carrier = { essences };
    rewriteEssenceQuantityMap(carrier, remappers);
    assert.deepEqual(carrier.essences, essences);
  }
  const missing = { id: 'comp-1' };
  rewriteEssenceQuantityMap(missing, remappers);
  assert.deepEqual(missing, { id: 'comp-1' }, 'an absent map must not be invented');
  assert.doesNotThrow(() => rewriteRecipeReferences({ ingredientSets: [null, 7] }, remappers));
  assert.doesNotThrow(() => rewriteMembershipReferences(null, 'components', remappers));
});

test('a non-finite quantity cannot abort the pass or propagate as NaN', () => {
  const carrier = { essences: { fire: 'lots', flame: 3, ash: 'some', soot: 'more' } };
  rewriteEssenceQuantityMap(carrier, {
    remapEssence: keyedRemapper({ flame: 'fire', soot: 'ash' }),
  });
  assert.deepEqual(
    carrier.essences,
    { fire: 3, ash: 'more' },
    'a numeric side wins the merge, and two non-numeric sides resolve to the later contribution'
  );
});

test('the WORLD-SCOPE rows re-key, and `inherit.essences` — a section NAME — does not', () => {
  // The two `componentScope` sites no producer in the derived corpus emits, and the highest-stakes
  // pair: `_normalizeEssenceQuantities` prunes a key outside the Valid Id Basis, so a merged-away
  // id left standing in `defaults.*.essences{}` or `membership.*.essences{}` dies on the next save.
  const remappers = { remapEssence: keyedRemapper(MERGE_FLAME_INTO_FIRE) };
  const { worldDefault, membership } = scopeRows();
  rewriteEssenceQuantityMap(worldDefault, remappers);
  rewriteMembershipReferences(membership, 'components', remappers);
  assert.deepEqual(worldDefault.essences, { fire: 5 });
  assert.deepEqual(membership.essences, { fire: 5 });
  assert.deepEqual(
    membership.inherit,
    { category: false, essences: false },
    '`inherit.essences` is a boolean section switch keyed by a section NAME, never by an essence id'
  );
});

test('an essence id spelled `__proto__` lands as an OWN key and not as a prototype', () => {
  const carrier = { essences: { fire: 2 } };
  rewriteEssenceQuantityMap(carrier, { remapEssence: keyedRemapper({ fire: '__proto__' }) });
  assert.ok(
    Object.prototype.hasOwnProperty.call(carrier.essences, '__proto__'),
    'assigning through a plain object literal would reassign the prototype and lose the entry'
  );
  assert.equal(Object.getPrototypeOf(carrier.essences), Object.prototype);
});
