/**
 * ONE shared multi-feature authoring fixture + volatile-field normalizer,
 * imported by every import/export test file so the fixture cannot drift and the
 * round-trip/report tests share a single source of truth (Sonar duplication
 * mitigation, Q6). This file is a HELPER, never a `*.test.js`.
 *
 * The fixture deliberately exercises every feature the issue's acceptance
 * checklist requires; `REQUIRED_FIXTURE_FEATURES` (below) is the completeness
 * contract the guard test asserts against so a missing feature fails loudly (Q5).
 */

export const FIXTURE_SYSTEM_ID = 'sys-full-authoring';
export const FIXTURE_TASK_ID = 'task-forage-herbs';
export const FIXTURE_EVENT_ID = 'event-wolf-pack';
export const FIXTURE_TOOL_ID = 'tool-sickle';
export const FIXTURE_MODIFIER_ID = 'mod-skilled';
export const FIXTURE_REALM_ID = 'realm-verdant';

/**
 * Build a full authoring fixture.
 *
 * @returns {{ system: object, recipes: object[], environments: object[], gatheringConfig: object }}
 */
export function buildFullAuthoringFixture() {
  const system = {
    id: FIXTURE_SYSTEM_ID,
    name: 'Full Authoring System',
    description: 'A system exercising every authoring surface.',
    enabled: true,
    resolutionMode: 'simple',
    features: {
      essences: true,
      recipeCategories: true,
      itemTags: true,
      gathering: true,
    },
    essenceDefinitions: [
      { id: 'earth', name: 'Earth', description: '', icon: 'fas fa-mountain', sourceComponentId: 'comp-ore' },
    ],
    categories: ['Potions', 'Reagents'],
    itemTags: ['ingredient', 'reagent'],
    components: [
      {
        id: 'comp-ore',
        name: 'Iron Ore',
        originItemUuid: 'Compendium.world.items.Item.iron-ore',
        categories: ['Reagents'],
        tags: ['ingredient'],
        difficulty: 3,
        essences: { earth: 1 },
        // The importer's component-resolution path normalizes this on; carrying
        // it keeps the KEEP-mode round-trip faithful.
        aliasItemUuids: [],
      },
      {
        id: 'comp-herb',
        name: 'Moonleaf',
        originItemUuid: 'Compendium.world.items.Item.moonleaf',
        categories: ['Reagents'],
        tags: ['reagent'],
        difficulty: 1,
        essences: {},
        aliasItemUuids: [],
        // An AUTHORED EMPTY salvage check-modifier pick (issue 1095): a real pick of ZERO,
        // distinct from an absent one, which inherits. It is the one shape a truthiness
        // test silently loses, and the two resolve to DIFFERENT rolls.
        salvage: {
          enabled: true,
          resultGroups: [{ id: 'sg-1', name: 'Scrap', results: [] }],
          checkModifierIds: [],
        },
      },
    ],
    recipeItemDefinitions: [{ id: 'recipe-def-1', name: 'Recipe Sheet' }],
    tools: [
      {
        id: 'sys-tool-hammer',
        // A first-class tool (issue 561) carrying its own source refs + snapshot, so the
        // KEEP-mode round-trip is symmetric (the import-time upcast is a no-op).
        name: 'Smithing Hammer',
        componentId: 'comp-ore',
        registeredItemUuid: 'Compendium.world.items.Item.iron-ore',
        originItemUuid: 'Compendium.world.items.Item.iron-ore',
        aliasItemUuids: [],
        breakage: { enabled: true, chance: 10 },
        onBreak: { action: 'consume', replacementComponentId: 'comp-ore' },
      },
    ],
    gatheringRealms: [
      {
        id: FIXTURE_REALM_ID,
        craftingSystemId: FIXTURE_SYSTEM_ID,
        name: 'Verdant Wilds',
        enabled: true,
        sceneMappings: [
          {
            sceneUuid: 'Scene.verdant-map',
            sceneRegionUuid: 'Scene.verdant-map.Region.grove',
          },
        ],
      },
    ],
    gatheringRealmSettings: { revealMode: 'alwaysVisible', modifierVisibility: 'visible' },
    // The ONE system-level modifier library (issues 1095, 1117). THREE entries on purpose:
    // one carrying BOTH bounds and one carrying NEITHER, because `min`/`max` are
    // absence-preserving and a fixture where every entry is bounded cannot tell a
    // round-trip that DROPS the keys from one that writes them everywhere — plus the entry
    // a gathering drop row references, which used to live in a second library in the
    // gathering config and now lives here with the rest.
    modifiers: [
      { id: 'mod-medicine', label: 'Medicine', expression: '@abilities.med.mod', min: -1, max: 5 },
      { id: 'mod-alchemy', label: 'Alchemy', expression: '@abilities.alch.mod' },
      { id: FIXTURE_MODIFIER_ID, label: 'Skilled', expression: '@abilities.str.mod' },
    ],
    // A NON-DEFAULT selection triple on EACH of the three activity checks. A
    // default-valued fixture is not an oracle for an allowlist rebuild: `addAll` with an
    // empty id set and no cap is exactly what a normalizer that emitted NOTHING produces,
    // so a dropped key would round-trip indistinguishably.
    craftingCheck: {
      enabled: true,
      simple: { rollFormula: '1d20 + @abilities.med.mod', dc: 14 },
      defaultModifierPolicy: 'bySubject',
      defaultModifierIds: ['mod-medicine'],
      maxModifierPicks: 2,
    },
    salvageCraftingCheck: {
      enabled: true,
      simple: { rollFormula: '1d20', dc: 12 },
      defaultModifierPolicy: 'highest',
      defaultModifierIds: ['mod-medicine', 'mod-alchemy'],
      maxModifierPicks: 1,
    },
    gatheringCraftingCheck: {
      enabled: true,
      routed: { rollFormula: '1d20', dc: 12 },
      defaultModifierPolicy: 'bySubject',
      defaultModifierIds: ['mod-alchemy'],
      maxModifierPicks: 3,
    },
  };

  const recipes = [
    {
      id: 'recipe-elixir',
      name: 'Elixir of Vigor',
      craftingSystemId: FIXTURE_SYSTEM_ID,
      recipeItemId: 'recipe-def-1',
      // grouped + alternative ingredient options
      ingredientSets: [
        {
          id: 'set-1',
          ingredientOptions: [
            { id: 'opt-a', ingredients: { 'comp-ore': 2 } },
            { id: 'opt-b', ingredients: { 'comp-herb': 3 } },
          ],
        },
      ],
      resultGroups: [{ id: 'rg-1', results: { 'comp-herb': 1 } }],
      // a crafting check
      check: {
        enabled: true,
        rollFormula: '1d20',
        thresholds: { success: 12 },
      },
      toolIds: ['sys-tool-hammer'],
      enabled: true,
    },
  ];

  const environments = [
    // Targeted + automatic composition environment.
    {
      id: 'env-grove',
      craftingSystemId: FIXTURE_SYSTEM_ID,
      name: 'Sunlit Grove',
      description: 'A targeted grove.',
      enabled: true,
      selectionMode: 'targeted',
      compositionMode: 'automatic',
      sceneUuid: 'Scene.verdant-map',
      biomes: ['forest'],
      dangerTags: ['hazardous'],
      includedRealmIds: [FIXTURE_REALM_ID],
      enabledTaskIds: [FIXTURE_TASK_ID],
      enabledEventIds: [FIXTURE_EVENT_ID],
      taskOrder: [FIXTURE_TASK_ID],
      taskDropRateAdjustments: { [FIXTURE_TASK_ID]: { 'row-1': 5 } },
      conditions: { weather: 'clear', timeOfDay: 'day', visibility: '', notes: '' },
      nodeRuntime: { [FIXTURE_TASK_ID]: { remaining: 2, respawnAt: 123 } },
    },
    // Blind + manual composition environment.
    {
      id: 'env-thicket',
      craftingSystemId: FIXTURE_SYSTEM_ID,
      name: 'Shadow Thicket',
      description: 'A blind, manually-composed thicket.',
      enabled: true,
      selectionMode: 'blind',
      compositionMode: 'manual',
      biomes: ['forest'],
      dangerTags: ['unsafe'],
      includedRealmIds: [FIXTURE_REALM_ID],
      forcedTaskIds: [FIXTURE_TASK_ID],
      blindSelection: { weights: { [FIXTURE_TASK_ID]: 3 } },
      conditions: { weather: 'rain', timeOfDay: 'night', visibility: '', notes: '' },
      nodeRuntime: {},
    },
  ];

  const gatheringConfig = {
    vocabularies: {
      biomes: [{ id: 'forest', label: 'Forest', icon: 'fas fa-tree', colorToken: '' }],
      danger: ['safe', 'hazardous', 'unsafe', 'extreme'],
      weather: [
        { id: 'clear', label: 'Clear', icon: '', colorToken: '' },
        { id: 'rain', label: 'Rain', icon: '', colorToken: '' },
      ],
      timeOfDay: [
        { id: 'day', label: 'Day', icon: '', colorToken: '' },
        { id: 'night', label: 'Night', icon: '', colorToken: '' },
      ],
    },
    conditions: { weather: 'clear', timeOfDay: 'day' },
    systems: {
      [FIXTURE_SYSTEM_ID]: {
        rules: {
          rewardSelectionMode: 'highestRankedDrop',
          rewardLimit: 1,
          eventSelectionMode: 'allDrops',
          eventLimit: 1,
          eventPolicy: 'successWithEvent',
          toolBreakagePolicy: 'perUse',
          biomeModifierAggregation: 'sum',
          blindCandidateGate: 'discovered',
          revealPolicy: 'onSuccess',
          revealScope: 'party',
          eventVisibility: 'gm',
          dropModifierMode: 'character',
        },
        conditions: {
          weather: {
            enabled: true,
            current: 'rain',
            values: [
              { id: 'clear', label: 'Clear', icon: '', colorToken: '' },
              { id: 'rain', label: 'Rain', icon: '', colorToken: '' },
            ],
          },
          timeOfDay: {
            enabled: true,
            current: 'night',
            values: [
              { id: 'day', label: 'Day', icon: '', colorToken: '' },
              { id: 'night', label: 'Night', icon: '', colorToken: '' },
            ],
          },
        },
        vocabularies: {
          biomes: [{ id: 'forest', label: 'Forest', icon: 'fas fa-tree', colorToken: '' }],
          danger: ['safe', 'hazardous', 'unsafe', 'extreme'],
          weather: [
            { id: 'clear', label: 'Clear', icon: '', colorToken: '' },
            { id: 'rain', label: 'Rain', icon: '', colorToken: '' },
          ],
          timeOfDay: [
            { id: 'day', label: 'Day', icon: '', colorToken: '' },
            { id: 'night', label: 'Night', icon: '', colorToken: '' },
          ],
        },
        economy: {
          staminaEnabled: true,
          nodeLimitationEnabled: true,
          stamina: { defaultMax: 10, regenPerDay: 2 },
        },
        tasks: [
          {
            id: FIXTURE_TASK_ID,
            name: 'Forage Herbs',
            enabled: true,
            img: 'icons/tools/hand/sickle.webp',
            biomes: ['forest'],
            weather: ['clear'],
            timeOfDay: ['day'],
            staminaCost: 2,
            toolIds: [FIXTURE_TOOL_ID],
            // A TWO-ID check-modifier pick (issue 1095). Non-default on both axes: two
            // ids rather than none, and a pick at all rather than inheritance — so a
            // normalizer that dropped the key round-trips visibly differently.
            checkModifierIds: ['mod-medicine', 'mod-alchemy'],
            dropRows: [
              {
                id: 'row-1',
                componentId: 'comp-herb',
                quantity: 1,
                dropRate: 60,
                characterModifiers: [{ modifierId: FIXTURE_MODIFIER_ID }],
              },
              {
                id: 'row-2',
                itemUuid: 'Compendium.world.items.Item.rare-root',
                quantity: 1,
                dropRate: 10,
              },
            ],
            nodes: { count: 4, depletion: 'perDrop', respawn: { mode: 'daily' } },
          },
        ],
        events: [
          {
            id: FIXTURE_EVENT_ID,
            name: 'Wolf Pack',
            enabled: true,
            dangerTags: ['unsafe'],
            biomes: ['forest'],
            weather: ['rain'],
            timeOfDay: ['night'],
            dropRate: 15,
            eventModifier: { kind: 'penalty', value: 2 },
          },
        ],
        tools: [
          {
            id: FIXTURE_TOOL_ID,
            label: 'Sickle',
            enabled: true,
            componentId: 'comp-herb',
            requirement: { formula: '1' },
            breakage: { enabled: true, chance: 5 },
            onBreak: { action: 'replace', replacementComponentId: 'comp-ore' },
          },
        ],
      },
    },
  };

  return { system, recipes, environments, gatheringConfig };
}

/**
 * The completeness contract the guard test (Q5) enforces. Each predicate reads
 * the fixture and MUST return true; a missing feature makes the guard fail so the
 * fixture cannot silently drift below the issue's required coverage.
 */
export const REQUIRED_FIXTURE_FEATURES = Object.freeze([
  ['recipe has a check', (f) => f.recipes.some((r) => r.check?.enabled)],
  [
    'recipe has grouped/alternative ingredient options',
    (f) => f.recipes.some((r) => r.ingredientSets?.[0]?.ingredientOptions?.length >= 2),
  ],
  [
    'components carry categories/tags/difficulty',
    (f) =>
      f.system.components.some(
        (c) => Array.isArray(c.categories) && Array.isArray(c.tags) && Number.isFinite(c.difficulty)
      ),
  ],
  ['gathering is enabled', (f) => f.system.features?.gathering === true],
  [
    'has a targeted environment',
    (f) => f.environments.some((e) => e.selectionMode === 'targeted'),
  ],
  [
    'has a blind environment with blind selection weights',
    (f) => f.environments.some((e) => e.selectionMode === 'blind' && e.blindSelection?.weights),
  ],
  [
    'has both manual and automatic composition',
    (f) =>
      f.environments.some((e) => e.compositionMode === 'manual') &&
      f.environments.some((e) => e.compositionMode === 'automatic'),
  ],
  ['has reusable tasks', (f) => (slice(f).tasks?.length ?? 0) >= 1],
  ['has reusable events', (f) => (slice(f).events?.length ?? 0) >= 1],
  [
    'has a required tool with breakage config',
    (f) => (slice(f).tools ?? []).some((t) => t.breakage?.enabled && t.onBreak),
  ],
  [
    'blind rules carry candidate gate + reveal + reveal scope',
    (f) => {
      const rules = slice(f).rules ?? {};
      return Boolean(rules.blindCandidateGate && rules.revealPolicy && rules.revealScope);
    },
  ],
  ['has weather vocabulary', (f) => (f.gatheringConfig.vocabularies?.weather?.length ?? 0) >= 1],
  ['has timeOfDay vocabulary', (f) => (f.gatheringConfig.vocabularies?.timeOfDay?.length ?? 0) >= 1],
  ['has biome vocabulary', (f) => (f.gatheringConfig.vocabularies?.biomes?.length ?? 0) >= 1],
  ['has danger vocabulary', (f) => (f.gatheringConfig.vocabularies?.danger?.length ?? 0) >= 1],
  ['has a realm', (f) => (f.system.gatheringRealms?.length ?? 0) >= 1],
  [
    'realm carries scene + scene-region mappings',
    (f) =>
      f.system.gatheringRealms.some((r) =>
        (r.sceneMappings ?? []).some((m) => m.sceneUuid && m.sceneRegionUuid)
      ),
  ],
  [
    'a drop row targets a world item via itemUuid',
    (f) => (slice(f).tasks ?? []).some((t) => (t.dropRows ?? []).some((row) => row.itemUuid)),
  ],
  // ── issues 1095/1117: the ONE system-level library and its three selections ───────
  [
    'system carries a modifier library with one BOUNDED and one UNBOUNDED entry',
    (f) => {
      const library = f.system.modifiers ?? [];
      return (
        library.some((entry) => Number.isFinite(entry.min) && Number.isFinite(entry.max)) &&
        library.some((entry) => !Object.hasOwn(entry, 'min') && !Object.hasOwn(entry, 'max'))
      );
    },
  ],
  [
    'the ONE library also carries the entry a gathering drop row references',
    (f) =>
      (f.system.modifiers ?? []).some((entry) => entry.id === FIXTURE_MODIFIER_ID) &&
      !Object.hasOwn(f.gatheringConfig.systems[f.system.id] ?? {}, 'characterModifiers'),
  ],
  [
    'all THREE activity checks carry a NON-DEFAULT selection triple',
    (f) =>
      ['craftingCheck', 'salvageCraftingCheck', 'gatheringCraftingCheck'].every((key) => {
        const check = f.system[key] ?? {};
        return (
          check.defaultModifierPolicy !== undefined &&
          check.defaultModifierPolicy !== 'addAll' &&
          (check.defaultModifierIds ?? []).length > 0 &&
          Number.isInteger(check.maxModifierPicks)
        );
      }),
  ],
  [
    'a component authors an EMPTY salvage check-modifier pick',
    (f) =>
      f.system.components.some(
        (component) =>
          Array.isArray(component.salvage?.checkModifierIds) &&
          component.salvage.checkModifierIds.length === 0
      ),
  ],
  [
    'a gathering task authors a TWO-ID check-modifier pick',
    (f) =>
      (slice(f).tasks ?? []).some(
        (task) =>
          Array.isArray(task.checkModifierIds) && task.checkModifierIds.length === 2
      ),
  ],
]);

function slice(fixture) {
  return fixture.gatheringConfig?.systems?.[FIXTURE_SYSTEM_ID] ?? {};
}

/**
 * Volatile-field normalizer for round-trip deep-equal: strips the envelope
 * provenance fields that legitimately change between exports (`exportedAt`,
 * `fabricateVersion`) so two exports of the same authoring data compare equal.
 *
 * Also strips per-recipe `importSource` (issue 775): import stamps durable
 * provenance (a stable `systemId` + a volatile `importedAt`) onto every recipe it
 * writes, so the second (post-import) export legitimately carries it while the
 * first (authored) export does not. It is import-stamped provenance, not authoring
 * data, so it is normalized out of the round-trip comparison.
 *
 * @param {object} payload
 * @returns {object} a clone without volatile fields
 */
export function normalizeExportEnvelope(payload) {
  const clone = structuredClone(payload);
  delete clone.exportedAt;
  delete clone.fabricateVersion;
  for (const recipe of Array.isArray(clone.recipes) ? clone.recipes : []) {
    if (recipe && typeof recipe === 'object') delete recipe.importSource;
  }
  return clone;
}
