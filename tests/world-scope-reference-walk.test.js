/**
 * THE DERIVED MARKER FIXTURE and its completeness closures (issue 1363, criterion 9).
 *
 * "Every non-site is untouched" is checkable only against an ENUMERATED non-site list, so it
 * cannot detect a site absent from BOTH lists — which is the failure `#### D9` had just corrected
 * twice by hand. The fixture is therefore DERIVED, never hand-authored: it is a maximally
 * populated corpus produced by the REAL producers of ALL THREE payloads, with every string leaf
 * set to one marker id; running `MARKER → REWRITTEN` over it and diffing yields the set of paths
 * the walk ACTUALLY touched.
 *
 * SCOPING THE CORPUS TO `_normalizeSystem` AND `Tool.toJSON` ALONE WOULD BE VACUOUS for most of
 * the site surface: that literal carries no `recipes` key and `gatheringConfig` is a separate
 * setting, yet the recipe / step / ingredient-set / salvage `toolIds`, the gathering task and
 * event `toolIds`, the gathering drop-row `componentId`, and the legacy gathering tools copy are
 * exactly the sites `#### D9` newly adds — the newest and least exercised part of the walk. So
 * all three producers are driven:
 *
 *   - `craftingSystems` — `CraftingSystemManager#_normalizeSystem`, which routes tools through
 *     `Tool.toJSON`;
 *   - `recipes`         — `Recipe#toJSON`, the recipe corpus producer;
 *   - `gatheringConfig` — `adminStore`'s own gathering-config save path, driven through its
 *     PUBLIC actions, because that is the only thing that writes this setting.
 *
 * TWO CLOSURES, because set-equality alone is ASYMMETRIC and cannot catch the failure this
 * fixture exists to catch. A field in NEITHER list that the walk DOES rewrite makes the touched
 * set a superset and is caught; a field in neither list that the walk does NOT rewrite — the
 * MISSED-SITE case — is absent from both sides and passes. So:
 *
 *   1. a KEY-NAME closure: the distinct leaf key names present anywhere in the derived corpus
 *      must be SET-EQUAL to (the site key names UNION an explicit reasoned exclusion list), in
 *      both directions. An anchored list of seven names is itself an unguarded hand-maintained
 *      mirror and cannot see a reference field a later PR calls `catalystComponentId` or
 *      `linkedComponentId`; under the closure a NEW leaf key is on neither list and fails THIS
 *      test regardless of what it is called.
 *   2. a strictly stronger PATH closure: every leaf PATH whose key name is in the site-key-name
 *      set must ITSELF be in the enumerated site list. The key-name closure alone catches only a
 *      missed site bearing a NEW name, and two of `#### D9`'s three historical gaps bore none —
 *      `onBreak.replacementTarget.componentId` reuses `componentId` and essence `sourceItemUuid`
 *      reuses `sourceItemUuid`, so both would sit in neither list, go untouched, and pass.
 */

import assert from 'node:assert/strict';
import test from 'node:test';
import { Recipe } from '../src/models/Recipe.js';
import {
  keyedRemapper,
  rewriteGatheringSliceReferences,
  rewriteRecipeReferences,
  rewriteSystemReferences,
  WORLD_SCOPE_DEFENSIVE_SITES,
  WORLD_SCOPE_REFERENCE_SITES,
} from '../src/migration/worldScopeReferenceRewrite.js';
import { installFoundryStubs } from './helpers/worldScopeCorpus.js';

installFoundryStubs();
const { CraftingSystemManager } = await import('../src/systems/CraftingSystemManager.js');
const { createAdminStore } = await import('../src/ui/svelte/stores/adminStore.js');

const MARKER = 'MARKER-ID';
const REWRITTEN = 'REWRITTEN-ID';

// ---------------------------------------------------------------------------
// Deriving the maximally-populated corpus from the three REAL producers
// ---------------------------------------------------------------------------

function producedSystem() {
  const manager = new CraftingSystemManager({ getRecipes: () => [] });
  return manager._normalizeSystem({
    id: 'sys-1',
    name: 'System',
    features: { salvage: true, essences: true, gathering: true },
    essenceDefinitions: [
      {
        id: 'fire',
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
        essences: { fire: 2 },
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

function buildMarkedCorpus() {
  return {
    systems: [markEveryStringLeaf(system)],
    recipes: [markEveryStringLeaf(recipe)],
    gatheringConfig: markEveryStringLeaf(gatheringConfig),
  };
}

/** Run the shared walk with `MARKER -> REWRITTEN` on both legs and diff the leaf paths. */
function touchedPaths() {
  const before = buildMarkedCorpus();
  const after = buildMarkedCorpus();
  const remappers = {
    remapComponent: keyedRemapper({ [MARKER]: REWRITTEN }),
    remapTool: keyedRemapper({ [MARKER]: REWRITTEN }),
  };
  rewriteSystemReferences(after.systems[0], remappers);
  rewriteRecipeReferences(after.recipes[0], remappers);
  rewriteGatheringSliceReferences(after.gatheringConfig.systems['sys-1'], remappers);

  const roots = [
    ['systems[]', before.systems[0], after.systems[0]],
    ['recipes[]', before.recipes[0], after.recipes[0]],
    [
      'gatheringConfig.systems.*',
      before.gatheringConfig.systems['sys-1'],
      after.gatheringConfig.systems['sys-1'],
    ],
  ];
  const touched = new Set();
  const allLeaves = new Map();
  for (const [prefix, beforeRoot, afterRoot] of roots) {
    const beforeLeaves = leafPaths(beforeRoot);
    const afterLeaves = leafPaths(afterRoot);
    for (const [path, value] of beforeLeaves) {
      const full = `${prefix}.${path}`.replace('.[]', '[]');
      allLeaves.set(full, value);
      if (afterLeaves.get(path) !== value) touched.add(full);
    }
  }
  return { touched, allLeaves };
}

const { touched, allLeaves } = touchedPaths();

// ---------------------------------------------------------------------------

test('the derived corpus is genuinely maximal — the premise every assertion below rests on', () => {
  // ANTI-VACUITY. A derived corpus that produced nothing would make every closure below pass by
  // reading zero leaves, which is the shape of vacuity this whole criterion exists to refuse.
  assert.ok(allLeaves.size > 80, `the marked corpus must be richly populated (${allLeaves.size})`);
  assert.ok(touched.size > 0, 'the walk must have rewritten something');
  const roots = new Set([...allLeaves.keys()].map((path) => path.split(/[.[]/)[0]));
  assert.deepEqual([...roots].sort(), ['gatheringConfig', 'recipes', 'systems']);
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

/**
 * The leaf KEY NAMES a reference site can bear, derived FROM the site list rather than restated.
 */
const SITE_KEY_NAMES = new Set(
  WORLD_SCOPE_REFERENCE_SITES.map((site) => site.replace(/\[\]$/, '').split('.').pop())
);

/**
 * Every leaf key name in the derived corpus that is NOT a reference site.
 *
 * ONE REASON COVERS THE WHOLE LIST, which is why it is stated once rather than per entry: none of
 * these keys can hold a component or a tool id. They are identity and display (`name`, `img`,
 * `icon`, `description`, `colorToken`), document UUIDs (`originItemUuid`, `itemUuid`,
 * `macroUuid`, `linkedSceneUuid`), authored behaviour and configuration (`mode`, `formula`,
 * `dc`, `enabled`, `salvageResolutionMode`, …), vocabulary tokens (`biomes`, `dangerTags`,
 * `category`, `tags`), and structural containers (`match`, `outcomes`, `salvage`, `alchemy`).
 * `fire` is an ESSENCE ID appearing as an object key in a component's `essences` quantity map —
 * a key position, never a reference — and essence ids are the one class this migration never
 * re-keys.
 *
 * THE LIST IS THE MIRROR AND THE CLOSURE IS ITS GUARD. It is TOTAL against the derived corpus in
 * both directions, so a NEW leaf key emitted by any of the three producers is on neither list and
 * fails, whatever it is called — which is the property an anchored regex over seven known names
 * can never have — and a key the producers stop emitting fails too, so a dead exemption cannot
 * accumulate and hide the next one.
 */
const NON_SITE_KEY_NAMES = new Set([
  'alchemy',
  'aliasItemUuids',
  'allowPlayerResultReorder',
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
  'essences',
  'eventLimit',
  'eventModifier',
  'eventPolicy',
  'eventSelectionMode',
  'eventVisibility',
  'expr',
  'expression',
  'failureResultPolicy',
  'fire',
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

test('the KEY-NAME closure: every leaf key in the derived corpus is a site key or a listed non-site', () => {
  const keyNames = new Set(
    [...allLeaves.keys()].map((path) =>
      path.replace(/\[\]$/, '').split('.').pop().replace(/\[\]$/, '')
    )
  );
  const unclassified = [...keyNames].filter(
    (key) => !SITE_KEY_NAMES.has(key) && !NON_SITE_KEY_NAMES.has(key)
  );
  assert.deepEqual(
    unclassified.sort(),
    [],
    'a NEW leaf key emitted by any of the three producers is on neither list and fails HERE, ' +
      'whatever it is called — which is what an anchored seven-name regex could never do'
  );
  const unused = [...NON_SITE_KEY_NAMES].filter((key) => !keyNames.has(key));
  assert.deepEqual(
    unused.sort(),
    [],
    'a non-site exclusion for a key the producers no longer emit is dead weight that hides the next one'
  );
});

test('the PATH closure: every leaf whose key name is a SITE key name is itself an enumerated site', () => {
  const enumerated = new Set([...WORLD_SCOPE_REFERENCE_SITES, ...WORLD_SCOPE_DEFENSIVE_SITES]);
  const unlisted = [...allLeaves.keys()].filter((path) => {
    const key = path.replace(/\[\]$/, '').split('.').pop().replace(/\[\]$/, '');
    return SITE_KEY_NAMES.has(key) && !enumerated.has(path);
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
  // directions rather than trusted. A corpus authoring every legacy and alias shape is walked,
  // and every leaf the walk rewrites must be either an enumerated site or a listed defensive
  // one. An earlier form of the list named `catalysts[]` as a bare array path and omitted every
  // `systemItemId` alias, so the invariant it stated was false.
  const ingredient = () => ({
    quantity: 1,
    componentId: MARKER,
    systemItemId: MARKER,
    match: { type: 'component', componentId: MARKER, systemItemId: MARKER },
    alternatives: [
      {
        quantity: 1,
        componentId: MARKER,
        systemItemId: MARKER,
        match: { type: 'component', componentId: MARKER, systemItemId: MARKER },
      },
    ],
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
  };
  rewriteSystemReferences(after.system, remappers);
  rewriteRecipeReferences(after.recipe, remappers);
  rewriteGatheringSliceReferences(after.slice, remappers);

  const enumerated = new Set([...WORLD_SCOPE_REFERENCE_SITES, ...WORLD_SCOPE_DEFENSIVE_SITES]);
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
      if (!enumerated.has(full)) unlisted.push(full);
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
