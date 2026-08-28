/**
 * THE ONE SHARED FIXTURE BUILDER for the `1.30.0` world-scope entity migration (issue 1363).
 *
 * Every world-scope test file builds its corpora from here. That is not tidiness: `tests/**`
 * counts against the SonarCloud new-code duplication gate exactly as `src/` does, and three test
 * files each carrying their own near-identical corpus factory is the commonest way that gate goes
 * red.
 *
 * THE GENERATOR IS SEEDED, never `Math.random`, which SonarCloud reports as S2245 (insecure
 * randomness) and which FAILS the quality gate. A seeded generator is also what makes a property
 * failure reproducible from the seed printed in the assertion message.
 *
 * CORPORA ARE NORMALIZER OUTPUT, not hand-authored literals. Every fixture is passed through the
 * REAL `_normalizeSystem` before it is used as a BEFORE state, so the differential compares two
 * states production can actually occupy and the derived marker fixture cannot pin a shape
 * production never produces.
 */

import { createScopedDefinitionStore } from '../../src/systems/scopedDefinitionStore.js';
import {
  normalizeComponentMemberships,
  normalizeComponentWorldDefaults,
  resolveComponentScope,
} from '../../src/systems/componentScope.js';
import {
  normalizeEssenceMemberships,
  normalizeEssenceWorldDefaults,
  resolveEssenceScope,
} from '../../src/systems/essenceScope.js';
import {
  normalizeToolMemberships,
  normalizeToolWorldDefaults,
  normalizeWorldToolBreakage,
  resolveToolScope,
} from '../../src/systems/toolScope.js';
import { effectiveToolBreakageAuthority } from '../../src/systems/toolBreakageAuthority.js';

/**
 * A deterministic 32-bit generator (mulberry32).
 *
 * @param {number} seed
 * @returns {() => number} a `[0, 1)` generator.
 */
export function seededRandom(seed) {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Install the Foundry globals the manager needs, with a DETERMINISTIC id source. */
export function installFoundryStubs() {
  let counter = 0;
  globalThis.foundry = {
    utils: {
      randomID: () => `gen-${++counter}`,
      getProperty: () => undefined,
    },
  };
  globalThis.game = globalThis.game ?? {};
  return {
    reset() {
      counter = 0;
    },
  };
}

/**
 * Build ONE in-memory world scope store, exactly as `worldScopeStores.js` composes the real one
 * but without importing `src/config/settings.js` (which drags `src/ui/theme.js` in).
 *
 * @param {'components'|'essences'|'tools'} entityType
 * @param {unknown} value The persisted payload.
 * @returns {object}
 */
export function makeScopeStore(entityType, value) {
  const config = {
    components: {
      defaults: normalizeComponentWorldDefaults,
      members: normalizeComponentMemberships,
    },
    essences: { defaults: normalizeEssenceWorldDefaults, members: normalizeEssenceMemberships },
    tools: { defaults: normalizeToolWorldDefaults, members: normalizeToolMemberships },
  }[entityType];
  const store = createScopedDefinitionStore({
    settingKey: entityType,
    getSetting: () => value,
    setSetting: async () => {},
    normalizeDefaults: config.defaults,
    normalizeMemberships: config.members,
    normalizeExtras:
      entityType === 'tools'
        ? (source) => normalizeWorldToolBreakage(source.toolBreakage)
        : () => ({}),
  });
  store.load();
  return store;
}

/**
 * A crafting-system manager wired to the three scope stores built from a scope payload triple.
 *
 * FRESHLY CONSTRUCTED PER CALL, and that is load-bearing: `getScopedDefinitionUnion` memoizes on
 * `(corpus identity, system array identity, revision, length)` and a pure migration bumps no
 * revision, so a manager that already read the BEFORE leg would serve the PRE-migration union.
 *
 * @param {new (...args: any[]) => any} CraftingSystemManager The imported class.
 * @param {{componentScope?: unknown, essenceScope?: unknown, toolScope?: unknown}} [payloads]
 * @returns {object}
 */
export function makeManagerWithScope(CraftingSystemManager, payloads = {}) {
  return new CraftingSystemManager(
    { getRecipes: () => [] },
    {
      componentScopeStore: makeScopeStore('components', payloads.componentScope),
      essenceScopeStore: makeScopeStore('essences', payloads.essenceScope),
      toolScopeStore: makeScopeStore('tools', payloads.toolScope),
    }
  );
}

/**
 * The REAL normalize-and-save seam: hydrate every system through `_normalizeSystem` with the
 * given scope stores and hand back what would be persisted.
 *
 * A HAND-ROLLED STAND-IN IS LOOSER THAN THIS and would produce false passes — it will not
 * reproduce the basis-gated essence-source prune, which is the ONE prune this seam performs.
 * `#### D10`'s basis does become newly-decidable at upgrade, but it prunes no recipe, salvage or
 * gathering reference at `1.30.0`: measured across every scenario here, ten references resolve to
 * nothing before the migration and ZERO disappear after the round trip. So the round trip's value
 * is that it is the REAL seam, not that it drops references — see the differential's guard arm.
 *
 * @param {new (...args: any[]) => any} CraftingSystemManager
 * @param {object} corpus `{ systems, recipes, gatheringConfig, componentScope, ... }`
 * @returns {object} the corpus with `systems` replaced by their normalized form.
 */
export function saveRoundTrip(CraftingSystemManager, corpus) {
  const manager = makeManagerWithScope(CraftingSystemManager, corpus);
  return {
    ...corpus,
    systems: (corpus.systems ?? []).map((system) => manager._normalizeSystem(system)),
  };
}

// ---------------------------------------------------------------------------
// Corpus construction
// ---------------------------------------------------------------------------

const ITEM_IMAGES = ['icons/svg/item-bag.svg', 'icons/svg/chest.svg', 'icons/svg/anvil.svg'];

function pick(random, list) {
  return list[Math.floor(random() * list.length) % list.length];
}

/**
 * One raw component, before normalization.
 *
 * @param {object} options
 * @returns {object}
 */
function rawComponent({
  id,
  name,
  refs = [],
  random,
  essenceIds = [],
  toolIds = [],
  danglingResultId = null,
}) {
  return {
    id,
    name,
    img: pick(random, ITEM_IMAGES),
    description: `${name} description`,
    originItemUuid: refs[0] ?? null,
    registeredItemUuid: refs[0] ?? null,
    aliasItemUuids: refs.slice(1),
    // A REAL category token, not the reserved `general` bucket: the donor-elected world default
    // refuses `general` by constraint, so a corpus that only ever authors it would exercise the
    // refusal path and never the lift path.
    category: 'reagent',
    tags: [`tag-${id}`],
    essences: Object.fromEntries(essenceIds.map((essenceId) => [essenceId, 1])),
    difficulty: 2,
    salvage: {
      enabled: true,
      toolIds: [...toolIds],
      resultGroups: [
        {
          id: `sg-${id}`,
          results: [
            { componentId: id, quantity: 1 },
            // A DANGLING result, when the scenario asks for one. It exercises the
            // `flaggedForReview` REPORT, not a prune: measured across every scenario here, ten
            // references resolve to nothing before the migration and ZERO disappear after the
            // round trip. `_normalizeSystem` prunes no corpus reference against the component
            // basis at all - its single consumer of that basis is the essence source-uuid
            // retention. See the differential's own guard arm, which states the same thing.
            ...(danglingResultId ? [{ componentId: danglingResultId, quantity: 1 }] : []),
          ],
        },
      ],
    },
  };
}

/**
 * One raw tool, before normalization.
 *
 * @param {object} options
 * @returns {object}
 */
function rawTool({
  id,
  name,
  refs = [],
  componentId = null,
  replacementComponentId = null,
  repairComponentId = null,
}) {
  return {
    id,
    name,
    label: `${id} label`,
    img: 'icons/svg/anvil.svg',
    description: `${name} description`,
    componentId,
    originItemUuid: refs[0] ?? null,
    registeredItemUuid: refs[0] ?? null,
    aliasItemUuids: refs.slice(1),
    breakage: { mode: 'limitedUses', maxUses: 3 },
    checkBreakable: true,
    onBreak: replacementComponentId
      ? {
          mode: 'replaceWith',
          replacementTarget: { type: 'component', componentId: replacementComponentId },
        }
      : { mode: 'destroy' },
    repairRequirements: repairComponentId
      ? [
          {
            id: `rr-${id}`,
            name: 'Repair',
            options: [
              { quantity: 1, match: { type: 'component', componentId: repairComponentId } },
            ],
          },
        ]
      : [],
  };
}

/** One raw essence definition, before normalization. */
function rawEssence({ id, name, sourceComponentId = null, macro = null, omitMacroKey = false }) {
  return {
    id,
    name,
    icon: 'fas fa-fire',
    colorToken: 'rose',
    description: `${name} essence`,
    enabled: true,
    // `omitMacroKey` models a record that PREDATES the field. `propertyMacroUuid` is new at
    // issue 1036, so any world not re-saved since carries essences with no such key - and that
    // is exactly the shape an absence-preserving membership write hands the DONOR's macro to.
    ...(omitMacroKey ? {} : { propertyMacroUuid: macro }),
    // ALL THREE SPELLINGS, because the walk rewrites all three and two of them were the gaps
    // `#### D9` closed. A fixture carrying only the canonical one leaves the other two outside
    // the differential entirely.
    sourceComponentId,
    ...(sourceComponentId
      ? { associatedSystemItemId: sourceComponentId, sourceItemUuid: sourceComponentId }
      : {}),
  };
}

/** One raw recipe, before normalization. */
function rawRecipe({ id, systemId, componentIds, toolIds }) {
  return {
    id,
    craftingSystemId: systemId,
    name: `Recipe ${id}`,
    toolIds: [...toolIds],
    ingredientSets: [
      {
        id: `is-${id}`,
        toolIds: [...toolIds],
        ingredientGroups: [
          {
            id: `ig-${id}`,
            name: 'Group',
            options: componentIds.map((componentId) => ({
              quantity: 1,
              match: { type: 'component', componentId },
            })),
          },
        ],
      },
    ],
    resultGroups: [
      {
        id: `rg-${id}`,
        results: componentIds.map((componentId) => ({ componentId, quantity: 1 })),
      },
    ],
    steps: [
      {
        id: `st-${id}`,
        name: 'Step',
        toolIds: [...toolIds],
        ingredientSets: [
          {
            id: `sis-${id}`,
            toolIds: [...toolIds],
            ingredientGroups: [
              {
                id: `sig-${id}`,
                name: 'Group',
                options: componentIds.map((componentId) => ({
                  quantity: 1,
                  match: { type: 'component', componentId },
                })),
              },
            ],
          },
        ],
        resultGroups: [
          {
            id: `srg-${id}`,
            results: componentIds.map((componentId) => ({ componentId, quantity: 1 })),
          },
        ],
      },
    ],
  };
}

/** One gathering-config system slice. */
function rawGatheringSlice({ systemId, componentIds, toolIds }) {
  return {
    tasks: [
      {
        id: `task-${systemId}`,
        name: 'Gather',
        toolIds: [...toolIds],
        dropRows: componentIds.map((componentId, index) => ({
          id: `drop-${systemId}-${index}`,
          componentId,
          quantity: 1,
          dropRate: 1,
        })),
      },
    ],
    events: [
      {
        id: `event-${systemId}`,
        name: 'Event',
        toolIds: [...toolIds],
        dropRows: componentIds.map((componentId, index) => ({
          id: `edrop-${systemId}-${index}`,
          componentId,
          quantity: 1,
          dropRate: 1,
        })),
      },
    ],
  };
}

/**
 * Build ONE raw corpus from a declarative shape.
 *
 * `systems[]` entries declare which SOURCE ITEM each component and tool points at, so a shared
 * source uuid across two systems is what makes them one world entity. A `null` source is an
 * UNLINKED definition, which must NEVER merge.
 *
 * @param {object} spec
 * @param {number} [spec.seed]
 * @param {Array<object>} spec.systems
 * @param {boolean} [spec.legacyGatheringTools] Seed the pre-`0.7.0` gathering tools copy.
 * @returns {{systems: Array<object>, recipes: Array<object>, gatheringConfig: object}}
 */
export function buildRawCorpus({ seed = 1, systems: specs, legacyGatheringTools = false }) {
  const random = seededRandom(seed);
  const systems = [];
  const recipes = [];
  const gatheringConfig = { systems: {} };

  for (const spec of specs) {
    const systemId = spec.id;
    const essences = (spec.essences ?? []).map((essence) =>
      rawEssence({
        id: essence.id,
        name: essence.name ?? `${essence.id} in ${systemId}`,
        sourceComponentId: essence.sourceComponentId ?? null,
        macro: essence.macro ?? null,
        omitMacroKey: essence.omitMacroKey === true,
      })
    );
    const components = (spec.components ?? []).map((component) =>
      rawComponent({
        id: component.id,
        name: component.name ?? `${component.id} in ${systemId}`,
        refs: component.refs ?? [],
        random,
        essenceIds: component.essenceIds ?? essences.map((essence) => essence.id),
        // SALVAGE `toolIds` DEFAULT TO THE SYSTEM'S OWN TOOLS. An empty list left the
        // `systems[].components[].salvage.toolIds` site unexercised by projection (b), so
        // deleting it from the walk was RED only in the marker fixture.
        toolIds: component.toolIds ?? (spec.tools ?? []).map((tool) => tool.id),
        danglingResultId: component.danglingResultId ?? null,
      })
    );
    const tools = (spec.tools ?? []).map((tool) =>
      rawTool({
        id: tool.id,
        name: tool.name ?? `${tool.id} in ${systemId}`,
        refs: tool.refs ?? [],
        componentId: tool.componentId ?? null,
        replacementComponentId: tool.replacementComponentId ?? null,
        // A REPAIR RECIPE BY DEFAULT, naming the system's first component, so the
        // `repairRequirements[].options[]` site — one of `#### D9`'s three newly-closed gaps —
        // is exercised by projection (b) rather than by the marker fixture alone.
        repairComponentId: tool.repairComponentId ?? (spec.components ?? [])[0]?.id ?? null,
      })
    );
    const componentIds = components.map((component) => component.id);
    const toolIds = tools.map((tool) => tool.id);
    systems.push({
      id: systemId,
      name: spec.name ?? `System ${systemId}`,
      enabled: true,
      features: { salvage: true, essences: true, gathering: true },
      components,
      essenceDefinitions: essences,
      tools,
      ...(spec.toolBreakage ? { toolBreakage: spec.toolBreakage } : {}),
    });
    recipes.push(
      rawRecipe({
        id: `recipe-${systemId}`,
        systemId,
        componentIds: [...componentIds, ...(spec.danglingComponentIds ?? [])],
        toolIds: [...toolIds, ...(spec.danglingToolIds ?? [])],
      })
    );
    gatheringConfig.systems[systemId] = {
      ...rawGatheringSlice({ systemId, componentIds, toolIds }),
      ...(legacyGatheringTools ? { tools: tools.map((tool) => ({ ...tool })) } : {}),
    };
  }

  return { systems, recipes, gatheringConfig };
}

/**
 * The BEFORE state: a raw corpus hydrated through the REAL normalizer with UNSEEDED scope stores,
 * which is exactly what a pre-migration world holds on disk.
 *
 * @param {new (...args: any[]) => any} CraftingSystemManager
 * @param {object} raw
 * @returns {object}
 */
export function normalizeCorpus(CraftingSystemManager, raw) {
  const manager = new CraftingSystemManager({ getRecipes: () => [] });
  return { ...raw, systems: raw.systems.map((system) => manager._normalizeSystem(system)) };
}

// ---------------------------------------------------------------------------
// The named scenarios, shared by every world-scope test file
// ---------------------------------------------------------------------------

/**
 * The adversarial corpus set the differential, the drift ZERO case and the post-condition
 * invariants all run over.
 *
 * @returns {Array<{name: string, raw: object}>}
 */
export function scenarioSpecs() {
  const uuidA = 'Item.aaa';
  const uuidB = 'Item.bbb';
  const uuidC = 'Item.ccc';
  return [
    {
      name: 'fully shared source items across three systems',
      raw: buildRawCorpus({
        seed: 11,
        systems: [
          {
            id: 'sys-a',
            components: [
              { id: 'comp-1', refs: [uuidA] },
              { id: 'comp-2', refs: [uuidB] },
            ],
            essences: [{ id: 'fire' }],
            tools: [{ id: 'tool-1', refs: [uuidC], repairComponentId: 'comp-1' }],
          },
          {
            id: 'sys-b',
            components: [
              { id: 'comp-9', refs: [uuidA] },
              { id: 'comp-8', refs: [uuidB] },
            ],
            essences: [{ id: 'fire' }],
            tools: [{ id: 'tool-9', refs: [uuidC], replacementComponentId: 'comp-9' }],
          },
          {
            id: 'sys-c',
            components: [{ id: 'comp-1', refs: [uuidA] }],
            essences: [{ id: 'fire' }, { id: 'water', sourceComponentId: 'comp-1' }],
            tools: [{ id: 'tool-1', refs: [uuidC] }],
          },
        ],
      }),
    },
    {
      name: 'partially shared: a transitive three-definition group through an alias',
      raw: buildRawCorpus({
        seed: 22,
        systems: [
          { id: 'sys-a', components: [{ id: 'comp-1', refs: [uuidA] }], tools: [] },
          { id: 'sys-b', components: [{ id: 'comp-2', refs: [uuidA, uuidB] }], tools: [] },
          { id: 'sys-c', components: [{ id: 'comp-3', refs: [uuidB] }], tools: [] },
        ],
      }),
    },
    {
      // Z2. An essence whose SOURCE is a component the migration re-keys. Without it the whole
      // essence-source reference class sits outside the differential: deleting
      // `rewriteEssenceReferences` from the system leg was GREEN across every other scenario.
      name: 'an essence whose source component is re-keyed',
      raw: buildRawCorpus({
        seed: 111,
        systems: [
          { id: 'sys-a', components: [{ id: 'comp-1', refs: [uuidA] }], essences: [], tools: [] },
          {
            id: 'sys-b',
            components: [{ id: 'comp-9', refs: [uuidA] }],
            // `comp-9` is re-keyed onto `comp-1`, so every spelling of this source must move
            // with it - including `associatedSystemItemId` and the legacy `sourceItemUuid`.
            essences: [{ id: 'ember', sourceComponentId: 'comp-9' }],
            tools: [],
          },
        ],
      }),
    },
    {
      // Z3. A member that KEEPS its id, so a narrowing of its source links is NOT excused by a
      // rename entry that exists only because the id changed.
      // THE ABSENT-SECTION FALLBACK. The donor authors a property macro and the member's essence
      // predates the field entirely, so an absence-preserving membership write would leave that
      // member with an `inherit: false` switch over an ABSENT section - which resolves to the
      // WORLD value, i.e. the donor's macro, on every craft.
      name: 'a member whose essence predates the property-macro field',
      raw: buildRawCorpus({
        seed: 333,
        systems: [
          {
            id: 'sys-a',
            components: [{ id: 'comp-1', refs: [uuidA] }],
            essences: [{ id: 'fire', macro: 'Macro.donor' }],
            tools: [],
          },
          {
            id: 'sys-b',
            components: [{ id: 'comp-2', refs: [uuidA] }],
            essences: [{ id: 'fire', omitMacroKey: true }],
            tools: [],
          },
        ],
      }),
    },
    {
      name: 'a merged member that keeps its own id',
      raw: buildRawCorpus({
        seed: 222,
        systems: [
          { id: 'sys-a', components: [{ id: 'comp-1', refs: [uuidA] }], essences: [], tools: [] },
          {
            id: 'sys-b',
            components: [{ id: 'comp-1', refs: [uuidA, uuidB] }],
            essences: [],
            tools: [],
          },
        ],
      }),
    },
    {
      name: 'disjoint source items — nothing merges',
      raw: buildRawCorpus({
        seed: 33,
        systems: [
          { id: 'sys-a', components: [{ id: 'comp-1', refs: [uuidA] }], tools: [] },
          { id: 'sys-b', components: [{ id: 'comp-2', refs: [uuidB] }], tools: [] },
        ],
      }),
    },
    {
      name: 'unlinked definitions sharing a NAME are never merged',
      raw: buildRawCorpus({
        seed: 44,
        systems: [
          { id: 'sys-a', components: [{ id: 'comp-1', name: 'Ash Salt', refs: [] }], tools: [] },
          { id: 'sys-b', components: [{ id: 'comp-2', name: 'Ash Salt', refs: [] }], tools: [] },
          {
            id: 'sys-c',
            components: [{ id: 'comp-3', name: 'Ash Salt', refs: [uuidA] }],
            tools: [],
          },
        ],
      }),
    },
    {
      name: 'dangling references and colliding essence slugs',
      raw: buildRawCorpus({
        seed: 55,
        systems: [
          {
            id: 'sys-a',
            components: [{ id: 'comp-1', refs: [uuidA], danglingResultId: 'ghost-salvage-result' }],
            essences: [{ id: 'fire' }],
            tools: [{ id: 'tool-1', refs: [uuidC] }],
            danglingComponentIds: ['ghost-component'],
            danglingToolIds: ['ghost-tool'],
          },
          {
            id: 'sys-b',
            components: [{ id: 'comp-2', refs: [uuidA] }],
            essences: [{ id: 'fire' }],
            tools: [{ id: 'tool-2', refs: [uuidC] }],
          },
        ],
      }),
    },
    {
      name: 'cross-system id collisions (copy-import preserves ids)',
      raw: buildRawCorpus({
        seed: 66,
        systems: [
          {
            id: 'sys-a',
            components: [
              { id: 'shared-id', refs: [uuidA] },
              { id: 'other', refs: [uuidB] },
            ],
            tools: [],
          },
          {
            id: 'sys-b',
            components: [
              { id: 'shared-id', refs: [uuidC] },
              { id: 'other', refs: [uuidA] },
            ],
            tools: [],
          },
        ],
      }),
    },
    {
      name: 'component-linked tools deriving their source through componentId',
      raw: buildRawCorpus({
        seed: 77,
        legacyGatheringTools: true,
        systems: [
          {
            id: 'sys-a',
            components: [{ id: 'comp-1', refs: [uuidA] }],
            tools: [{ id: 'tool-1', componentId: 'comp-1' }],
          },
          {
            id: 'sys-b',
            components: [{ id: 'comp-2', refs: [uuidA] }],
            tools: [{ id: 'tool-2', componentId: 'comp-2' }],
          },
        ],
      }),
    },
    {
      // TWO definitions in ONE system pointing at the SAME source item. Its map is DISJOINT and
      // its OUTPUT collides, so only the output-uniqueness post-condition refuses it.
      name: 'two definitions in one system sharing a source item',
      raw: buildRawCorpus({
        seed: 99,
        systems: [
          {
            id: 'sys-a',
            components: [
              { id: 'comp-p', refs: [uuidA] },
              { id: 'comp-q', refs: [uuidA] },
            ],
            tools: [],
          },
        ],
      }),
    },
    {
      name: 'empty arrays and a system with nothing at all',
      raw: buildRawCorpus({
        seed: 88,
        systems: [
          { id: 'sys-a', components: [], essences: [], tools: [] },
          { id: 'sys-b', components: [{ id: 'comp-1', refs: [uuidA] }], essences: [], tools: [] },
        ],
      }),
    },
  ];
}

/**
 * A corpus carrying MALFORMED records the normalizer would otherwise repair, used to prove the
 * pure transforms are total. It is deliberately NOT normalized first.
 *
 * @returns {object}
 */
export function malformedCorpus() {
  return {
    systems: [
      null,
      'not a system',
      { id: '', components: [null, 'x', { id: '' }] },
      { id: 'sys-a', components: 'not an array', essenceDefinitions: 5, tools: { nope: true } },
      { id: 'sys-b', components: [{ id: 'comp-1', refs: 'nope', aliasItemUuids: 'nope' }] },
    ],
    recipes: [null, { craftingSystemId: 'sys-a' }, 7],
    gatheringConfig: { systems: { 'sys-a': null, 'sys-b': 'nope' } },
  };
}

// ---------------------------------------------------------------------------
// The two projections
// ---------------------------------------------------------------------------

const PROJECTED_FIELDS = Object.freeze({
  components: Object.freeze([
    'id',
    'name',
    'img',
    'description',
    'category',
    'tags',
    'essences',
    'difficulty',
    'complications',
    'salvage',
    'originItemUuid',
    'registeredItemUuid',
    'aliasItemUuids',
  ]),
  essences: Object.freeze([
    'id',
    'name',
    'icon',
    'colorToken',
    'description',
    'enabled',
    'propertyMacroUuid',
    'sourceComponentId',
    'sourceItemUuid',
    'associatedSystemItemId',
  ]),
  tools: Object.freeze([
    'id',
    'name',
    'img',
    'description',
    'label',
    'componentId',
    'enabled',
    'requirement',
    'prerequisites',
    'bonus',
    'breakage',
    'checkBreakable',
    'onBreak',
    'repairRequirements',
    'originItemUuid',
    'registeredItemUuid',
    'aliasItemUuids',
  ]),
});

/** The identity fields a merged group is permitted to differ on. */
export const PERMITTED_IDENTITY_FIELDS = Object.freeze([
  'name',
  'img',
  'icon',
  'colorToken',
  'description',
  'originItemUuid',
  'registeredItemUuid',
  'aliasItemUuids',
]);

/**
 * Blank every REFERENCE leaf inside a projected value.
 *
 * THE TWO PROJECTIONS DIVIDE THE CORPUS BETWEEN THEM: (a) owns the fields of a `(system, entity)`
 * pair, (b) owns what every reference DENOTES. A re-keyed id stored inside a salvage result group
 * or a tool's repair recipe is a reference, so comparing its literal text in (a) would report
 * every successful re-key as a behaviour change — while saying nothing about whether it still
 * resolves, which is the only question that matters and which (b) answers by resolving it.
 *
 * @param {unknown} value
 * @returns {unknown}
 */
/**
 * The leaf keys that hold a COMPONENT reference rather than content.
 *
 * The three essence spellings are here for the same reason `componentId` is: an essence source is
 * a reference the migration re-keys, so comparing its literal text in projection (a) would report
 * every successful re-key as a behaviour change while saying nothing about whether it still
 * resolves. `sourceItemUuid` is included because `## EssenceDefinition` requirement 3 permits it
 * to hold a legacy component id.
 */
const REFERENCE_LEAF_KEYS = new Set([
  'componentId',
  'systemItemId',
  'sourceComponentId',
  'associatedSystemItemId',
  'sourceItemUuid',
]);

function scrubReferences(value) {
  if (Array.isArray(value)) return value.map((entry) => scrubReferences(entry));
  if (value === null || typeof value !== 'object') return value;
  const scrubbed = {};
  for (const [key, entry] of Object.entries(value)) {
    if (REFERENCE_LEAF_KEYS.has(key)) scrubbed[key] = '<reference>';
    else if (key === 'toolIds' && Array.isArray(entry))
      scrubbed[key] = entry.map(() => '<reference>');
    else scrubbed[key] = scrubReferences(entry);
  }
  return scrubbed;
}

function project(record, entityType) {
  const projected = {};
  for (const field of PROJECTED_FIELDS[entityType]) {
    if (record?.[field] === undefined) continue;
    projected[field] = REFERENCE_LEAF_KEYS.has(field)
      ? '<reference>'
      : scrubReferences(record[field]);
  }
  return projected;
}

/**
 * PROJECTION (a) — the entity projection: every field a production reader consumes, per
 * `(system, entity)` pair.
 *
 * @param {new (...args: any[]) => any} CraftingSystemManager
 * @param {object} corpus
 * @param {boolean} throughScope Whether to read through the scope resolvers (the AFTER leg).
 * @returns {Record<string, object>}
 */
export function projectEntities(CraftingSystemManager, corpus, throughScope) {
  const projection = {};
  const manager = throughScope
    ? makeManagerWithScope(CraftingSystemManager, corpus)
    : new CraftingSystemManager({ getRecipes: () => [] });
  for (const system of corpus.systems ?? []) {
    const lists = throughScope
      ? {
          components: resolveComponentScope(
            manager._componentScopeStore.corpus(),
            system.id,
            system.components
          ),
          essences: resolveEssenceScope(
            manager._essenceScopeStore.corpus(),
            system.id,
            system.essenceDefinitions
          ),
          tools: resolveToolScope(manager._toolScopeStore.corpus(), system.id, system.tools),
        }
      : {
          components: system.components ?? [],
          essences: system.essenceDefinitions ?? [],
          tools: system.tools ?? [],
        };
    for (const [entityType, records] of Object.entries(lists)) {
      for (const record of records) {
        projection[`${system.id}|${entityType}|${record.id}`] = project(record, entityType);
      }
    }
  }
  return projection;
}

/**
 * PROJECTION (b) — the resolved reference CLOSURE.
 *
 * IT IS AN INDEPENDENT GENERIC WALK, deliberately not the production enumeration. If it drove the
 * shared rewrite walk, deleting a site from that walk would delete it from this projection too
 * and the mutation would stay GREEN — which is exactly the vacuity this criterion exists to
 * prevent. It visits EVERY leaf named `componentId` / `systemItemId`, every `toolIds[]` entry and
 * the system-level `toolBreakage`, wherever they are.
 *
 * A reference resolving to nothing is recorded as `UNRESOLVED:<site path>` and never dropped, so
 * a prune is a VISIBLE DIFFERENCE rather than an absence.
 *
 * @param {new (...args: any[]) => any} CraftingSystemManager
 * @param {object} corpus
 * @param {boolean} throughScope
 * @returns {Record<string, unknown>}
 */
export function projectReferenceClosure(CraftingSystemManager, corpus, throughScope) {
  const manager = throughScope
    ? makeManagerWithScope(CraftingSystemManager, corpus)
    : new CraftingSystemManager({ getRecipes: () => [] });
  const worldToolBreakage = throughScope
    ? (manager._toolScopeStore.corpus()?.toolBreakage ?? null)
    : null;

  const bySystem = new Map();
  for (const system of corpus.systems ?? []) {
    const components = throughScope
      ? resolveComponentScope(manager._componentScopeStore.corpus(), system.id, system.components)
      : (system.components ?? []);
    const tools = throughScope
      ? resolveToolScope(manager._toolScopeStore.corpus(), system.id, system.tools)
      : (system.tools ?? []);
    bySystem.set(system.id, {
      components: new Map(components.map((record) => [record.id, project(record, 'components')])),
      tools: new Map(tools.map((record) => [record.id, project(record, 'tools')])),
    });
  }

  const closure = {};
  const record = (path, systemId, kind, value) => {
    if (typeof value !== 'string' || value === '') return;
    const resolved = bySystem.get(systemId)?.[kind]?.get(value);
    closure[path] = resolved ?? `UNRESOLVED:${path}`;
  };

  const walk = (node, path, systemId) => {
    if (Array.isArray(node)) {
      node.forEach((entry, index) => walk(entry, `${path}[${index}]`, systemId));
      return;
    }
    if (node === null || typeof node !== 'object') return;
    for (const [key, value] of Object.entries(node)) {
      const childPath = `${path}.${key}`;
      if (key === 'componentId' || key === 'systemItemId') {
        record(childPath, systemId, 'components', value);
        continue;
      }
      // THE ESSENCE SOURCE SPELLINGS. Without these, `#### D9`'s newly-closed essence gaps are
      // green in the differential and RED only in the walk, so criterion 3's claim that
      // projection (b) covers every reference site was false for three of them.
      // `sourceItemUuid` legitimately holds EITHER a component id or a document UUID, so a
      // dotted value is skipped rather than recorded as unresolved.
      if (key === 'sourceComponentId' || key === 'associatedSystemItemId') {
        record(childPath, systemId, 'components', value);
        continue;
      }
      if (key === 'sourceItemUuid') {
        if (typeof value === 'string' && value && !value.includes('.')) {
          record(childPath, systemId, 'components', value);
        }
        continue;
      }
      if (key === 'toolIds' && Array.isArray(value)) {
        value.forEach((id, index) => record(`${childPath}[${index}]`, systemId, 'tools', id));
        continue;
      }
      walk(value, childPath, systemId);
    }
  };

  for (const system of corpus.systems ?? []) {
    walk(system.components, `systems.${system.id}.components`, system.id);
    walk(system.essenceDefinitions, `systems.${system.id}.essenceDefinitions`, system.id);
    walk(system.tools, `systems.${system.id}.tools`, system.id);
    closure[`systems.${system.id}.toolBreakage`] = effectiveToolBreakageAuthority(
      system,
      worldToolBreakage
    );
  }
  for (const recipe of corpus.recipes ?? []) {
    walk(recipe, `recipes.${recipe.id}`, recipe.craftingSystemId);
  }
  for (const [systemId, slice] of Object.entries(corpus.gatheringConfig?.systems ?? {})) {
    walk(slice, `gatheringConfig.${systemId}`, systemId);
  }
  return closure;
}
