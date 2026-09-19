/**
 * Fixture corpus and observation harness for the source-identity equivalence pins (issue 1699).
 * Journalled fake documents plus a real `CraftingSystemManager`, driven through one scenario
 * matrix. What it observes is the WRITES and the SEAM CALLS, not just the returned summaries.
 */
import { CraftingSystemManager } from '../../src/systems/CraftingSystemManager.js';

let idCounter = 0;

globalThis.foundry = {
  utils: {
    randomID: () => `sid-${(idCounter += 1)}`,
    getProperty: (object, path) =>
      path.split('.').reduce((node, key) => node?.[key], object) ?? undefined,
  },
};
globalThis.ui = { notifications: { info() {}, warn() {}, error() {} } };

/** Assign `value` at a dotted path, creating the intermediate objects. */
function assignPath(target, path, value) {
  const parts = path.split('.');
  let node = target;
  while (parts.length > 1) node = node[parts.shift()] ??= {};
  node[parts[0]] = value;
}

/** Delete the leaf at a dotted path, leaving the intermediate objects alone. */
function deletePath(target, path) {
  const parts = path.split('.');
  let node = target;
  while (node && parts.length > 1) node = node[parts.shift()];
  if (node) delete node[parts[0]];
}

/**
 * A JSON-safe projection: a Foundry document collapses to its uuid, a function to a marker, and
 * `undefined` to a marker so a dropped argument cannot read as a passed `null`.
 */
export function summarize(value, depth = 0) {
  if (value === undefined) return '<undefined>';
  if (typeof value === 'function') return '<function>';
  if (value === null || typeof value !== 'object') return value;
  if (depth > 8) return '<deep>';
  if (Array.isArray(value)) return value.map((entry) => summarize(entry, depth + 1));
  if (typeof value.uuid === 'string') return { document: value.uuid };
  const projection = {};
  for (const [key, entry] of Object.entries(value)) projection[key] = summarize(entry, depth + 1);
  return projection;
}

/**
 * A journalled fake Item document. Every `update`, `setFlag` and `unsetFlag` is appended to
 * `journal` in order, which is the observable an extraction must not move.
 */
export function makeDocument(spec = {}) {
  const {
    uuid,
    name = 'Item',
    img = null,
    pack = null,
    duplicateSource = null,
    compendiumSource = null,
    description,
    flags = {},
    writable = true,
    stampable = true,
  } = spec;
  const document = {
    uuid,
    name,
    pack,
    _stats: { duplicateSource, compendiumSource },
    flags: structuredClone(flags),
    journal: [],
    getFlag(scope, key) {
      return foundry.utils.getProperty(this.flags?.[scope], key);
    },
  };
  if (img) document.img = img;
  if (description !== undefined) document.system = { description };
  if (writable) {
    document.update = async function update(patch) {
      this.journal.push({ op: 'update', patch: summarize(patch) });
      for (const [path, value] of Object.entries(patch)) assignPath(this, path, value);
    };
  }
  if (stampable) {
    document.setFlag = async function setFlag(scope, key, value) {
      this.journal.push({ op: 'setFlag', scope, key, value: summarize(value) });
      assignPath((this.flags[scope] ??= {}), key, value);
    };
    document.unsetFlag = async function unsetFlag(scope, key) {
      this.journal.push({ op: 'unsetFlag', scope, key });
      deletePath(this.flags?.[scope] ?? {}, key);
    };
  }
  return document;
}

/** An actor carrying owned copies, shaped as the repair walk reads it. */
export function makeActor(items) {
  return { items };
}

/** An item compendium the auto-stamp and repair walks read. */
export function makePack(collection, { locked = false, documents = [] } = {}) {
  return {
    collection,
    documentName: 'Item',
    locked,
    fixtureDocuments: documents,
    getDocuments: async () => documents,
  };
}

/** `game.packs`: iterable for the repair walk, and keyed for the auto-stamp lock check. */
function makePackCollection(packs) {
  const byId = new Map(packs.map((pack) => [pack.collection, pack]));
  return {
    get: (id) => byId.get(id) ?? null,
    [Symbol.iterator]: () => packs[Symbol.iterator](),
  };
}

/** A crafting system record, carrying only the three libraries this corpus drives. */
export function makeSystem(spec = {}) {
  const { id = 'sys1', name = 'System', components = [], tools = [] } = spec;
  return {
    id,
    name,
    components,
    tools,
    recipeItemDefinitions: spec.recipeItemDefinitions ?? [],
    recipes: [],
  };
}

const NO_RECIPES = { getRecipes: () => [], deleteRecipe: async () => {}, updateRecipe: async () => {} };

/** Resolve a `@UUID[…]` reference to the linked document's name, as Foundry's enricher does. */
function defaultEnricher(linkNames) {
  return (raw) =>
    String(raw).replaceAll(
      /@UUID\[([^\]]+)]/g,
      (_match, uuid) => `<a class="content-link">${linkNames[uuid] ?? uuid}</a>`
    );
}

/**
 * Build a real manager over the fixture world. `globalThis.game` and `globalThis.fromUuid` are
 * assigned AFTER construction, deliberately: that ordering is what proves the late binding.
 */
export function createHarness(spec = {}) {
  const {
    systems = [],
    items = [],
    packs = [],
    actors = [],
    resolve = {},
    linkNames = {},
    fixtures = {},
    isGM = true,
  } = spec;
  const calls = { enrichToHtml: [], primeEnricherCache: [], resolveImportedComponentSourceData: [] };
  const persistence = { save: 0, notify: 0 };
  const enrich = defaultEnricher(linkNames);
  const manager = new CraftingSystemManager(NO_RECIPES, {
    enrichToHtml: async (...args) => {
      calls.enrichToHtml.push(args.map((argument) => summarize(argument)));
      return enrich(args[0]);
    },
    primeEnricherCache: async (...args) => {
      calls.primeEnricherCache.push(args.map((argument) => summarize(argument)));
    },
  });
  manager.initialized = true;
  manager.systems = new Map(systems.map((system) => [system.id, system]));

  const resolveSourceData = manager._resolveImportedComponentSourceData.bind(manager);
  manager._resolveImportedComponentSourceData = async (...args) => {
    calls.resolveImportedComponentSourceData.push(args.map((argument) => summarize(argument)));
    return resolveSourceData(...args);
  };
  manager.save = async () => {
    persistence.save += 1;
  };
  manager._notifySystemsChanged = () => {
    persistence.notify += 1;
  };

  const journalled = [
    ...new Set(
      [
        ...items,
        ...actors.flatMap((actor) => actor.items ?? []),
        ...packs.flatMap((pack) => pack.fixtureDocuments ?? []),
        ...Object.values(resolve),
        ...Object.values(fixtures).flat(),
      ].filter((document) => Array.isArray(document?.journal))
    ),
  ];

  globalThis.game = { user: { isGM }, items, packs: makePackCollection(packs), actors };
  globalThis.fromUuid = async (uuid) => resolve[uuid] ?? null;

  return {
    manager,
    systems,
    calls,
    fixtures,
    persistence,
    documents: journalled,
    reset() {
      for (const document of journalled) document.journal.length = 0;
      for (const log of Object.values(calls)) log.length = 0;
      persistence.save = 0;
      persistence.notify = 0;
    },
    journals() {
      return Object.fromEntries(
        journalled.map((document) => [document.uuid, document.journal.map((entry) => entry)])
      );
    },
  };
}

/**
 * Run one scenario twice against the SAME harness. The second pass pins idempotence: a
 * conditional-write regression shows up there first, as a non-empty journal.
 */
export async function observeScenario(scenario) {
  const harness = scenario.build();
  return {
    first: await capturePass(scenario, harness),
    second: await capturePass(scenario, harness),
  };
}

async function capturePass(scenario, harness) {
  harness.reset();
  const result = await scenario.drive(harness.manager, harness);
  return {
    result: summarize(result),
    journals: harness.journals(),
    calls: structuredClone(harness.calls),
    persistence: { ...harness.persistence },
  };
}

// ---------------------------------------------------------------------------------------------
// The input matrix. Every row is bound to the entry point it is driven through, rather than left
// to a walk to reach, so a row that stops being exercised reds instead of quietly passing.
// ---------------------------------------------------------------------------------------------

const SNAPSHOT_SOURCES = [
  [
    'clean-world-source',
    {
      uuid: 'Item.embercap-src',
      name: 'Embercap Mushroom',
      img: 'icons/svg/mushroom.svg',
      description: { value: 'A faintly glowing cap.' },
    },
  ],
  [
    'clone-carrying-duplicate-source',
    {
      uuid: 'Item.embercap-copy',
      name: 'Embercap Mushroom (Copy)',
      duplicateSource: 'Item.embercap-src',
      compendiumSource: 'Compendium.world.kit.Item.embercap',
    },
  ],
  [
    'broken-compendium-source',
    {
      uuid: 'Item.relic-src',
      name: 'Sunken Relic',
      compendiumSource: 'Compendium.gone.kit.Item.relic',
    },
  ],
];

/** All three snapshot builders over one source, so the returned objects are compared in full. */
function snapshotScenario([id, spec]) {
  return {
    id: `snapshots/${id}`,
    build() {
      const source = makeDocument(spec);
      return createHarness({ items: [source], fixtures: { source } });
    },
    async drive(manager, harness) {
      const { source } = harness.fixtures;
      return {
        component: await manager._buildComponentSourceSnapshot(source.uuid, source),
        recipeItem: await manager._buildRecipeItemSourceSnapshot(source.uuid, source),
        tool: await manager._buildToolSourceSnapshot(source.uuid, source),
      };
    },
  };
}

const DESCRIPTION_SOURCES = [
  [
    'label-less-uuid-link',
    { uuid: 'Item.supplies', name: "Alchemist's Supplies" },
    { value: '@UUID[Compendium.dnd5e.items.Item.pouch]' },
    { 'Compendium.dnd5e.items.Item.pouch': 'Component Pouch' },
  ],
  [
    'object-description-fields',
    { uuid: 'Item.nested', name: 'Nested Fields' },
    { value: { html: '<p>Nested &amp; enriched</p>' } },
    {},
  ],
  ['no-description-at-all', { uuid: 'Item.bare', name: 'Bare Item' }, undefined, {}],
];

/** `_extractSourceDescription` directly, so the enricher call log is the observable. */
function descriptionScenario([id, spec, description, linkNames]) {
  return {
    id: `descriptions/${id}`,
    build() {
      const source = makeDocument({ ...spec, description });
      return createHarness({ items: [source], linkNames, fixtures: { source } });
    },
    drive: (manager, harness) => manager._extractSourceDescription(harness.fixtures.source),
  };
}

/** One system registering the same source uuid in all three libraries, with the given refs. */
function autoStampSystem(systemId, refs) {
  return makeSystem({
    id: systemId,
    components: [{ id: `${systemId}-comp`, name: 'Component', aliasItemUuids: [], ...refs }],
    tools: [{ id: `${systemId}-tool`, name: 'Tool', aliasItemUuids: [], ...refs }],
    recipeItemDefinitions: [
      { id: `${systemId}-recipe-item`, name: 'Recipe Item', aliasItemUuids: [], ...refs },
    ],
  });
}

/** All three one-shot auto-stamps, in order, so the three summaries are compared together. */
function autoStampScenario(id, make) {
  return {
    id: `autostamp/${id}`,
    build: () => createHarness(make()),
    async drive(manager) {
      return {
        recipeItems: await manager.autoStampRecipeItemSources(),
        components: await manager.autoStampComponentSources(),
        tools: await manager.autoStampToolSources(),
      };
    },
  };
}

const PACK_SOURCE_UUID = 'Compendium.world.kit.Item.ore';
const WORLD_SOURCE_UUID = 'Item.ore-src';

/** The auto-stamp world for a source living in one pack, whose lock state the row varies. */
function packedAutoStampWorld(locked) {
  const source = makeDocument({ uuid: PACK_SOURCE_UUID, name: 'Raw Ore', pack: 'world.kit' });
  return {
    systems: [autoStampSystem('sys1', { originItemUuid: PACK_SOURCE_UUID })],
    packs: [makePack('world.kit', { locked })],
    resolve: { [PACK_SOURCE_UUID]: source },
  };
}

const AUTO_STAMP_ROWS = [
  ['unlocked-pack-source', () => packedAutoStampWorld(false)],
  ['locked-pack-source', () => packedAutoStampWorld(true)],
  [
    'source-without-setflag',
    () => ({
      systems: [autoStampSystem('sys1', { originItemUuid: WORLD_SOURCE_UUID })],
      resolve: {
        [WORLD_SOURCE_UUID]: makeDocument({ uuid: WORLD_SOURCE_UUID, stampable: false }),
      },
    }),
  ],
  [
    'unresolvable-source-uuid',
    () => ({ systems: [autoStampSystem('sys1', { originItemUuid: WORLD_SOURCE_UUID })] }),
  ],
  [
    'source-registered-in-two-systems',
    () => ({
      systems: [
        autoStampSystem('sys1', { originItemUuid: WORLD_SOURCE_UUID }),
        autoStampSystem('sys2', { originItemUuid: WORLD_SOURCE_UUID }),
      ],
      resolve: { [WORLD_SOURCE_UUID]: makeDocument({ uuid: WORLD_SOURCE_UUID }) },
    }),
  ],
  [
    'dotted-system-id',
    () => ({
      systems: [autoStampSystem('sys.one', { originItemUuid: WORLD_SOURCE_UUID })],
      resolve: { [WORLD_SOURCE_UUID]: makeDocument({ uuid: WORLD_SOURCE_UUID }) },
    }),
  ],
  [
    'registered-uuid-only',
    () => ({
      systems: [autoStampSystem('sys1', { registeredItemUuid: WORLD_SOURCE_UUID })],
      resolve: { [WORLD_SOURCE_UUID]: makeDocument({ uuid: WORLD_SOURCE_UUID }) },
    }),
  ],
  [
    'source-already-stamped',
    () => ({
      systems: [autoStampSystem('sys1', { originItemUuid: WORLD_SOURCE_UUID })],
      resolve: {
        [WORLD_SOURCE_UUID]: makeDocument({
          uuid: WORLD_SOURCE_UUID,
          flags: {
            fabricate: {
              fabricate: {
                roles: {
                  sys1: {
                    componentId: 'sys1-comp',
                    toolId: 'sys1-tool',
                    recipeItemDefinitionId: 'sys1-recipe-item',
                  },
                },
              },
            },
          },
        }),
      },
    }),
  ],
];

/** `repairItemData` end to end, summary, journals and persistence counts alike. */
function repairScenario(id, make) {
  return {
    id: `repair/${id}`,
    build: () => createHarness(make()),
    drive: (manager) => manager.repairItemData(),
  };
}

const EMBERCAP_DEFINITION = {
  id: 'comp-embercap',
  name: 'Embercap Mushroom',
  registeredItemUuid: 'Item.embercap-src',
  originItemUuid: 'Item.embercap-src',
  aliasItemUuids: ['Compendium.world.kit.Item.embercap'],
};

const LOCKED_PACK_SOURCE_UUID = 'Compendium.dnd5e.equipment24.Item.supplies';

/** A system carrying one recipe-item library, which is where the owned-copy rows are decided. */
function recipeItemSystem(definitions) {
  return makeSystem({ id: 'sys1', recipeItemDefinitions: definitions });
}

/** One actor holding one owned copy, which every owned-copy row shares. */
function ownedCopyWorld(systems, spec) {
  const copy = makeDocument(spec);
  return { systems, actors: [makeActor([copy])], fixtures: { copy } };
}

const SELF_CORRUPTION_WORLD = () => {
  const original = makeDocument({ uuid: 'Item.embercap-src', name: 'Embercap Mushroom' });
  const clone = makeDocument({
    uuid: 'Item.embercap-copy',
    name: 'Embercap Mushroom',
    duplicateSource: 'Item.embercap-src',
    compendiumSource: 'Compendium.world.kit.Item.embercap',
  });
  return {
    systems: [makeSystem({ id: 'sys1', components: [EMBERCAP_DEFINITION] })],
    items: [original, clone],
  };
};

const REPAIR_ROWS = [
  ['self-corrupting-clone-source', SELF_CORRUPTION_WORLD],
  [
    'world-item-flagged-for-a-vanished-definition',
    () => ({
      systems: [makeSystem({ id: 'sys1', components: [EMBERCAP_DEFINITION] })],
      items: [
        makeDocument({
          uuid: 'Item.stale',
          name: 'Stale Copy',
          flags: { fabricate: { fabricate: { roles: { sys1: { componentId: 'comp-gone' } } } } },
        }),
      ],
    }),
  ],
  [
    'owned-copy-whose-name-is-ambiguous',
    () =>
      ownedCopyWorld(
        [
          recipeItemSystem([
            { id: 'ri-a', name: 'Tome of Ash', originItemUuid: 'Item.tome-a', aliasItemUuids: [] },
            { id: 'ri-b', name: 'Tome of Ash', originItemUuid: 'Item.tome-b', aliasItemUuids: [] },
          ]),
        ],
        { uuid: 'Actor.hero.Item.tome', name: 'Tome of Ash', duplicateSource: 'Item.tome-a' }
      ),
  ],
  [
    'owned-copy-flagged-for-an-unresolvable-definition',
    () =>
      ownedCopyWorld([makeSystem({ id: 'sys1', components: [EMBERCAP_DEFINITION] })], {
        uuid: 'Actor.hero.Item.mystery',
        name: 'Mystery Fungus',
        flags: {
          fabricate: { fabricate: { roles: { sys1: { componentId: 'comp-nonexistent' } } } },
        },
      }),
  ],
  [
    'owned-copy-repointed-by-name',
    () =>
      ownedCopyWorld(
        [
          recipeItemSystem([
            {
              id: 'ri-sparks',
              name: 'Scroll of Sparks',
              originItemUuid: 'Item.scroll-sparks',
              aliasItemUuids: [],
            },
            {
              id: 'ri-embers',
              name: 'Scroll of Embers',
              originItemUuid: 'Item.scroll-embers',
              aliasItemUuids: [],
            },
          ]),
        ],
        {
          uuid: 'Actor.hero.Item.scroll',
          name: 'Scroll of Embers',
          duplicateSource: 'Item.scroll-sparks',
        }
      ),
  ],
  [
    'owned-copy-without-a-duplicate-source',
    () =>
      ownedCopyWorld(
        [
          recipeItemSystem([
            {
              id: 'ri-primer',
              name: 'Alchemical Primer',
              registeredItemUuid: 'Item.primer-src',
              originItemUuid: 'Compendium.world.kit.Item.primer',
              aliasItemUuids: [],
            },
          ]),
        ],
        {
          uuid: 'Actor.hero.Item.primer',
          name: 'Alchemical Primer',
          compendiumSource: 'Compendium.world.kit.Item.primer',
        }
      ),
  ],
  [
    'owned-copy-carrying-only-the-legacy-scalar',
    () =>
      ownedCopyWorld(
        [
          recipeItemSystem([
            { id: 'ri-legacy', name: 'Faded Ledger', originItemUuid: 'Item.ledger-src', aliasItemUuids: [] },
          ]),
        ],
        {
          uuid: 'Actor.hero.Item.ledger',
          name: 'Faded Ledger',
          flags: { fabricate: { fabricate: { recipeItemDefinitionId: 'ri-legacy' } } },
        }
      ),
  ],
  [
    'tool-without-source-refs-matching-an-owned-name',
    () =>
      ownedCopyWorld(
        [makeSystem({ id: 'sys1', tools: [{ id: 'tool-hammer', name: 'Hammer', aliasItemUuids: [] }] })],
        { uuid: 'Actor.hero.Item.hammer', name: 'Hammer' }
      ),
  ],
  [
    'definition-sourced-from-a-locked-pack',
    () => ({
      systems: [
        makeSystem({
          id: 'sys1',
          components: [
            {
              id: 'comp-supplies',
              name: "Alchemist's Supplies",
              registeredItemUuid: LOCKED_PACK_SOURCE_UUID,
              originItemUuid: LOCKED_PACK_SOURCE_UUID,
              aliasItemUuids: [],
              description: '',
            },
          ],
        }),
      ],
      packs: [makePack('dnd5e.equipment24', { locked: true })],
      resolve: {
        [LOCKED_PACK_SOURCE_UUID]: makeDocument({
          uuid: LOCKED_PACK_SOURCE_UUID,
          name: "Alchemist's Supplies",
          pack: 'dnd5e.equipment24',
          description: { value: '@UUID[Compendium.dnd5e.equipment24.Item.pouch]' },
        }),
      },
      linkNames: { 'Compendium.dnd5e.equipment24.Item.pouch': 'Component Pouch' },
    }),
  ],
  [
    'definition-whose-source-carries-no-description',
    () => ({
      systems: [
        makeSystem({
          id: 'sys1',
          components: [
            {
              id: 'comp-blank',
              name: 'Blank Source',
              registeredItemUuid: 'Item.blank-src',
              aliasItemUuids: [],
              description: 'Text the GM already stored.',
            },
          ],
        }),
      ],
      resolve: {
        'Item.blank-src': makeDocument({ uuid: 'Item.blank-src', name: 'Blank Source' }),
      },
    }),
  ],
  [
    'definition-whose-source-is-gone',
    () => ({
      systems: [
        makeSystem({
          id: 'sys1',
          components: [
            {
              id: 'comp-lost',
              name: 'Lost Source',
              registeredItemUuid: 'Item.lost-src',
              aliasItemUuids: [],
              description: 'Text the GM already stored.',
            },
          ],
        }),
      ],
    }),
  ],
];

/**
 * `_stampSourceIdentity` driven DIRECTLY at an UNLOCKED pack source: the compendium-source guard
 * refuses a packed source whatever its pack's lock state, and no other suite reaches that arm.
 */
const DIRECT_STAMP_SCENARIO = {
  id: 'stamp/unlocked-pack-source-directly',
  build() {
    const source = makeDocument({ uuid: PACK_SOURCE_UUID, name: 'Raw Ore', pack: 'world.kit' });
    return createHarness({
      packs: [makePack('world.kit', { locked: false })],
      fixtures: { source },
    });
  },
  drive: (manager, harness) =>
    manager._stampSourceIdentity(harness.fixtures.source, 'roles.sys1.componentId', 'comp-ore'),
};

/** The whole matrix, in a stable order, so the golden is diffable. */
export const SCENARIOS = Object.freeze([
  ...SNAPSHOT_SOURCES.map((row) => snapshotScenario(row)),
  ...DESCRIPTION_SOURCES.map((row) => descriptionScenario(row)),
  DIRECT_STAMP_SCENARIO,
  ...AUTO_STAMP_ROWS.map(([id, make]) => autoStampScenario(id, make)),
  ...REPAIR_ROWS.map(([id, make]) => repairScenario(id, make)),
]);
