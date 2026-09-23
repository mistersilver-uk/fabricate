/**
 * THE ONE SHARED FIXTURE BUILDER for the `1.30.0` world-scope entity migration (issue 1363). THE
 * GENERATOR IS SEEDED, never `Math.random`, which SonarCloud reports as S2245 (insecure randomness)
 * and which FAILS the quality gate.
 */

import { ESSENCE_EFFECT_SOURCE_FIELDS } from '../../src/systems/worldScopeEntityGrouping.js';
import { membershipKey } from '../../src/systems/scopedDefinitions.js';
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
 * Build ONE in-memory world scope store, exactly as `worldScopeStores.js` composes the real one but
 * without importing `src/config/settings.js` (which drags `src/ui/theme.js` in).
 *
 * @param {unknown} value The persisted payload.
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
 * @param {new (...args: any[]) => any} CraftingSystemManager The imported class.
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
 * The REAL normalize-and-save seam: hydrate every system through `_normalizeSystem` with the given
 * scope stores and hand back what would be persisted.
 *
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

// Corpus construction

const ITEM_IMAGES = ['icons/svg/item-bag.svg', 'icons/svg/chest.svg', 'icons/svg/anvil.svg'];

function pick(random, list) {
  return list[Math.floor(random() * list.length) % list.length];
}

/** One raw component, before normalization. */
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
            // A DANGLING result, when the scenario asks for one.
            ...(danglingResultId ? [{ componentId: danglingResultId, quantity: 1 }] : []),
          ],
        },
      ],
    },
  };
}

/** One raw tool, before normalization. */
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
    // `omitMacroKey` models a record that PREDATES the field (issue 1036).
    ...(omitMacroKey ? {} : { propertyMacroUuid: macro }),
    // ALL THREE SPELLINGS, because the walk rewrites all three and two of them were the gaps `####
    // D9` closed.
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
 * @param {boolean} [spec.legacyGatheringTools] Seed the pre-`0.7.0` gathering tools copy.
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
        // SALVAGE `toolIds` DEFAULT TO THE SYSTEM'S OWN TOOLS.
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
 */
export function normalizeCorpus(CraftingSystemManager, raw) {
  const manager = new CraftingSystemManager({ getRecipes: () => [] });
  return { ...raw, systems: raw.systems.map((system) => manager._normalizeSystem(system)) };
}

// The named scenarios, shared by every world-scope test file

/**
 * The adversarial corpus set the differential, the drift ZERO case and the post-condition
 * invariants all run over.
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
      // Z2. An essence whose SOURCE is a component the migration re-keys.
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
 * A corpus carrying MALFORMED records the normalizer would otherwise repair, used to prove the pure
 * transforms are total. It is deliberately NOT normalized first.
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

// The post-migration merge corpus (issue 1654)

/**
 * The `effectSource` block a membership record or world default carries, read off a raw essence row
 * through the shared field list rather than a second spelling of the three names.
 *
 * @param {object} row A raw essence definition.
 */
function effectSourceBlockOf(row) {
  const block = {};
  for (const field of ESSENCE_EFFECT_SOURCE_FIELDS) {
    if (row[field] !== undefined) block[field] = row[field];
  }
  return block;
}

/**
 * Build an already-migrated world: a `craftingSystems` corpus plus the essence and component scope
 * payloads `1.30.0` would have left behind, in the stored map shape.
 *
 * @param {Array<object>} [spec.systems] `[{id, name, essences: [...], components: [{id, member}]}]`
 * @param {object} [spec.worldDefaults] `{[essenceId]: {macro?, effectSource?}}`
 * @param {string[]|null} [spec.entityOrder] An explicit `essenceScope.entities` order.
 */
export function buildEssenceMergeCorpus({
  systems: specs = [],
  worldDefaults = {},
  entityOrder = null,
} = {}) {
  const systems = [];
  const entitiesById = new Map();
  const membership = {};
  const componentEntities = new Map();
  const componentMembership = {};

  for (const spec of specs) {
    const systemId = spec.id;
    const essenceDefinitions = [];
    for (const essence of spec.essences ?? []) {
      const name = essence.name ?? essence.id;
      const row = {
        ...rawEssence({
          id: essence.id,
          name,
          sourceComponentId: essence.sourceComponentId ?? null,
          macro: essence.macro ?? null,
        }),
        ...(essence.icon === undefined ? {} : { icon: essence.icon }),
        ...(essence.colorToken === undefined ? {} : { colorToken: essence.colorToken }),
        ...(essence.description === undefined ? {} : { description: essence.description }),
        enabled: essence.enabled !== false,
      };
      // The first declaration wins the world identity, as the donor rule `1.30.0` lifted under.
      if (!entitiesById.has(essence.id)) {
        entitiesById.set(essence.id, {
          id: essence.id,
          name: row.name,
          icon: row.icon,
          colorToken: row.colorToken,
          description: row.description,
        });
      }
      if (essence.inSystem !== false) essenceDefinitions.push(row);
      if (essence.member === false) continue;
      const omitted = essence.omitSections ?? [];
      const record = {
        entityId: essence.id,
        systemId,
        inherit: {
          effectSource: essence.inherit?.effectSource === true,
          macro: essence.inherit?.macro === true,
        },
        enabled: essence.enabled !== false,
      };
      if (!omitted.includes('effectSource')) {
        record.effectSource = essence.effectSource ?? effectSourceBlockOf(row);
      }
      if (!omitted.includes('macro')) record.macro = essence.macro ?? null;
      membership[membershipKey(essence.id, systemId)] = record;
    }

    for (const component of spec.components ?? []) {
      if (!componentEntities.has(component.id)) {
        componentEntities.set(component.id, {
          id: component.id,
          name: `Component ${component.id}`,
        });
      }
      if (component.member === false) continue;
      componentMembership[membershipKey(component.id, systemId)] = {
        entityId: component.id,
        systemId,
        inherit: {},
      };
    }

    systems.push({
      id: systemId,
      name: spec.name ?? `System ${systemId}`,
      enabled: true,
      components: [],
      essenceDefinitions,
      tools: [],
    });
  }

  const orderedIds = entityOrder ?? [...entitiesById.keys()];
  const defaults = {};
  for (const [id, sections] of Object.entries(worldDefaults)) defaults[id] = { id, ...sections };

  return {
    systems,
    essenceScope: {
      entities: orderedIds.map((id) => entitiesById.get(id)).filter(Boolean),
      defaults,
      membership,
    },
    componentScope: {
      entities: [...componentEntities.values()],
      defaults: {},
      membership: componentMembership,
    },
  };
}

// The two projections

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

/** Blank every REFERENCE leaf inside a projected value. */
/** The leaf keys that hold a COMPONENT reference rather than content. */
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
 * PROJECTION (a) — the entity projection: every field a production reader consumes, per `(system,
 * entity)` pair.
 *
 * @param {boolean} throughScope Whether to read through the scope resolvers (the AFTER leg).
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
 * PROJECTION (b) — the resolved reference CLOSURE. A reference resolving to nothing is recorded as
 * `UNRESOLVED:<site path>` and never dropped, so a prune is a VISIBLE DIFFERENCE rather than an
 * absence.
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
      // green in the differential and RED only in the walk, so criterion 3's claim that projection
      // (b) covers every reference site was false for three of them.
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

// The THIRD projection, and the id-canonicalising key rewriter (issue 1364)

/**
 * PROJECTION (c) — the three WORLD-SCOPE SLICES, per layer. The two projections above answer what a
 * system's entities ARE and what every reference DENOTES.
 *
 * @param {{components?: unknown, essences?: unknown, tools?: unknown}} scopeCorpus Each value is
 * either the persisted scope payload or a store's published corpus; both sub-key shapes are read.
 */
export function projectScopeSlices(scopeCorpus) {
  const corpus = scopeCorpus && typeof scopeCorpus === 'object' ? scopeCorpus : {};
  const projection = {};
  for (const entityType of ['components', 'essences', 'tools']) {
    const payload = corpus[entityType] ?? {};
    for (const entity of subKeyEntries(payload?.entities)) {
      if (entity?.id) projection[`${entityType}|entities|${entity.id}`] = entity;
    }
    for (const record of subKeyEntries(payload?.defaults)) {
      if (record?.id) projection[`${entityType}|defaults|${record.id}`] = record;
    }
    for (const record of subKeyEntries(payload?.membership)) {
      if (!record?.entityId || !record?.systemId) continue;
      projection[`${entityType}|membership|${record.systemId}|${record.entityId}`] = record;
    }
  }
  return projection;
}

/** The entries of a scope sub-key, whether it arrived as a map or as an array. */
function subKeyEntries(raw) {
  if (Array.isArray(raw)) return raw;
  if (raw && typeof raw === 'object') return Object.values(raw);
  return [];
}

/**
 * Rewrite every id a projection embeds, through the ACTUAL map an import produced.
 *
 * @param {Map<string, string>} maps.ids Old entity/recipe id to new.
 * @param {Map<string, string>} maps.systemIds Old system id to new.
 */
export function canonicaliseProjection(projection, { ids, systemIds }) {
  const mapId = (value) => ids.get(value) ?? systemIds.get(value) ?? value;
  const rewritten = {};
  for (const [key, value] of Object.entries(projection)) {
    rewritten[canonicaliseKey(key, mapId)] = canonicaliseValue(value, mapId);
  }
  return rewritten;
}

/** Rewrite the ids a projection KEY embeds — both the pipe form and the dotted path form. */
function canonicaliseKey(key, mapId) {
  if (key.includes('|')) return key.split('|').map((segment) => mapId(segment)).join('|');
  const dotted = /^(systems|recipes|gatheringConfig)\.([^.[]+)(.*)$/.exec(key);
  return dotted ? `${dotted[1]}.${mapId(dotted[2])}${dotted[3]}` : key;
}

/**
 * The keys whose value a projected record carries as an IDENTIFIER: its own identity, and the
 * component-reference leaves the shared walk rewrites.
 */
const CANONICALISED_ID_KEYS = new Set([
  'id',
  'entityId',
  'systemId',
  'componentId',
  'systemItemId',
  'sourceComponentId',
  'associatedSystemItemId',
  'sourceItemUuid',
]);

/**
 * Rewrite the ids a projected record carries. Every other field is compared verbatim. Reference
 * leaves are rewritten rather than SCRUBBED here, which is the opposite of what projection (a) does
 * to the same key names — deliberately.
 */
function canonicaliseValue(value, mapId) {
  if (Array.isArray(value)) return value.map((entry) => canonicaliseValue(entry, mapId));
  if (value === null || typeof value !== 'object') return value;
  const rewritten = {};
  for (const [key, entry] of Object.entries(value)) {
    if (CANONICALISED_ID_KEYS.has(key) && typeof entry === 'string') rewritten[key] = mapId(entry);
    else rewritten[key] = canonicaliseValue(entry, mapId);
  }
  return rewritten;
}

/**
 * The ACTUAL copy-mode id map, read off the prepared pack data by POSITION against the envelope it
 * was prepared from.
 *
 * @param {object} envelope The payload handed to `prepareForImport`.
 * @param {object} packData Its result.
 * @param {string} destinationSystemId The id the import actually resolved.
 */
export function actualImportIdMap(envelope, packData, destinationSystemId) {
  const ids = new Map();
  const pairs = [
    [envelope.system?.components, packData.system?.components],
    [envelope.recipes, packData.recipes],
  ];
  for (const [before, after] of pairs) {
    for (const [index, record] of (before ?? []).entries()) {
      const next = (after ?? [])[index];
      if (record?.id && next?.id) ids.set(record.id, next.id);
    }
  }
  const systemIds = new Map();
  if (envelope.system?.id) systemIds.set(envelope.system.id, destinationSystemId);
  return { ids, systemIds };
}
