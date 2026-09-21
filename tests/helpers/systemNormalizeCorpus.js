/**
 * The system-normalizer corpus (issue 1713): the per-member ARGUMENT TUPLES the equivalence pin and
 * the delegate-forwarding proof both run over, so the two suites share one source of truth. Every
 * export is a function returning fresh values, because several members are handed a `Set` or an
 * options bag a caller may mutate. A row carrying `alternatives` is the forwarding row for its
 * member: one alternative per argument, each of which must change the result.
 */

/** The non-vacuousness floors the pin suite asserts, so a gutted corpus cannot read green. */
export const CORPUS_FLOORS = Object.freeze({
  tools: 29,
  systemFields: 36,
  essences: 30,
  recipeItems: 24,
  components: 40,
  systems: 5,
});

/** A tool authoring every source-ref spelling, both prerequisite halves and both repair shapes. */
function fullyAuthoredTool() {
  return {
    id: 'tool-full',
    enabled: false,
    label: '  Master Hammer  ',
    componentId: '  comp-hammer  ',
    name: 'Hammer',
    img: 'icons/svg/hammer.svg',
    description: 'A well-worn hammer',
    originItemUuid: 'Item.origin',
    registeredItemUuid: 'Item.registered',
    sourceItemUuid: 'Item.legacySourceItem',
    sourceUuid: 'Item.legacySource',
    aliasItemUuids: ['Item.registered', ' Item.alias ', 'Item.alias', '', 7],
    requirement: { formula: '1d4' },
    prerequisites: { enabled: true, ids: ['p1', ' p2 ', 'p1', ''], gateMode: 'bonus' },
    breakage: { mode: 'limitedUses', maxUses: '5' },
    checkBreakable: true,
    onBreak: { mode: 'replaceWith', replacementComponentId: 'comp-replacement' },
    // One group carrying an `id` and one without: the `IngredientGroup` mint path reached only
    // through `new Tool(...)`, which no direct `randomID()` site in the cluster covers.
    repairRequirements: [
      { id: 'group-authored', name: 'Authored', options: [{ componentId: 'comp-nail', quantity: 1 }] },
      { name: 'Minted', options: [{ componentId: 'comp-plank', quantity: 2 }] },
    ],
  };
}

function toolScenarios() {
  return [
    { member: '_normalizeTool', name: 'toolEmpty', args: [{}, {}] },
    {
      member: '_normalizeTool',
      name: 'toolFullyAuthored',
      args: [fullyAuthoredTool(), { validPrerequisiteIds: new Set(['p1']) }],
      alternatives: [{ componentId: 'comp-other' }, {}],
    },
    {
      member: '_normalizeTool',
      name: 'toolLegacySpellings',
      args: [
        {
          componentId: 'comp-legacy',
          sourceUuid: 'Item.legacy',
          sourceItemUuid: 'Item.legacyItem',
          fallbackItemIds: ['Item.legacy', ' Item.fallback ', ''],
          breakage: { mode: 'immune' },
        },
        {},
      ],
    },
    {
      member: '_normalizeTool',
      name: 'toolUnknownPrerequisiteBasis',
      args: [{ componentId: 'c', prerequisites: { enabled: true, ids: ['p1', 'zz'] } }, {}],
    },
    { member: '_normalizeTool', name: 'toolNonObject', args: ['not-an-object', {}] },

    // The second argument OMITTED: the only input that sees `validIds`' `null` default, and so the
    // only one that reds a `= new Set()` default which every live call site passes past.
    {
      member: '_normalizeToolPrerequisites',
      name: 'prerequisitesBasisOmitted',
      args: [{ enabled: true, ids: ['p1', 'zz'], gateMode: 'bonus' }],
    },
    // A truthy NON-Set basis, which the `instanceof Set` sentinel must refuse to prune against.
    {
      member: '_normalizeToolPrerequisites',
      name: 'prerequisitesNonSetBasis',
      args: [{ enabled: true, ids: ['p1', 'zz'] }, ['p1']],
    },
    {
      member: '_normalizeToolPrerequisites',
      name: 'prerequisitesKnownBasis',
      // `zz` is outside the basis, so the pruned and unpruned results DIFFER and a delegate that
      // drops the second argument cannot read green.
      args: [
        { enabled: true, ids: ['p1', ' p2 ', 'p1', '', 'zz'], gateMode: 'usability' },
        new Set(['p1', 'p2']),
      ],
      alternatives: [{ enabled: false, ids: ['p1'] }, new Set(['p2'])],
    },
    {
      member: '_normalizeToolPrerequisites',
      name: 'prerequisitesEnabledWithNoIds',
      args: [{ enabled: true, ids: [] }, null],
    },
    {
      member: '_normalizeToolPrerequisites',
      name: 'prerequisitesBogusGateMode',
      args: [{ enabled: true, ids: ['p1'], gateMode: 'bogus' }, null],
    },
    { member: '_normalizeToolPrerequisites', name: 'prerequisitesNonObject', args: [null, null] },

    { member: '_normalizeToolRequirement', name: 'requirementString', args: ['1d4'] },
    { member: '_normalizeToolRequirement', name: 'requirementNumericFormula', args: [{ formula: 5 }] },
    {
      member: '_normalizeToolRequirement',
      name: 'requirementAuthored',
      args: [{ formula: '1d6' }],
      alternatives: [{ formula: '2d6' }],
    },
    { member: '_normalizeToolRequirement', name: 'requirementNull', args: [null] },

    { member: '_normalizeToolBreakage', name: 'breakageLegacyImmune', args: [{ mode: 'immune', maxUses: 3 }] },
    { member: '_normalizeToolBreakage', name: 'breakageMaxUsesAbsent', args: [{ mode: 'limitedUses' }] },
    { member: '_normalizeToolBreakage', name: 'breakageMaxUsesNull', args: [{ mode: 'limitedUses', maxUses: null }] },
    { member: '_normalizeToolBreakage', name: 'breakageMaxUsesBlank', args: [{ mode: 'limitedUses', maxUses: '' }] },
    {
      member: '_normalizeToolBreakage',
      name: 'breakageMaxUsesString',
      args: [{ mode: 'limitedUses', maxUses: '5' }],
      alternatives: [{ mode: 'limitedUses', maxUses: 9 }],
    },
    { member: '_normalizeToolBreakage', name: 'breakageMaxUsesNumber', args: [{ mode: 'limitedUses', maxUses: 5 }] },
    {
      member: '_normalizeToolBreakage',
      name: 'breakageChanceNumeric',
      args: [{ mode: 'breakageChance', breakageChance: 25 }],
    },
    {
      member: '_normalizeToolBreakage',
      name: 'breakageChanceNonNumeric',
      args: [{ mode: 'breakageChance', breakageChance: 'often' }],
    },
    {
      member: '_normalizeToolBreakage',
      name: 'breakageDiceWithThreshold',
      args: [{ mode: 'diceExpression', formula: '1d20', threshold: '5' }],
    },
    {
      member: '_normalizeToolBreakage',
      name: 'breakageDiceWithoutThreshold',
      args: [{ mode: 'diceExpression', formula: '1d20' }],
    },
    { member: '_normalizeToolBreakage', name: 'breakageBogusMode', args: [{ mode: 'bogus', maxUses: 2 }] },

    {
      member: '_normalizeToolOnBreak',
      name: 'onBreakFlagBroken',
      args: [{ mode: 'flagBroken' }],
      alternatives: [{ mode: 'destroy' }],
    },
    {
      member: '_normalizeToolOnBreak',
      name: 'onBreakLegacyReplacementComponentId',
      args: [{ mode: 'replaceWith', replacementComponentId: 'comp-1' }],
    },
    { member: '_normalizeToolOnBreak', name: 'onBreakNull', args: [null] },
  ];
}

function systemFieldScenarios() {
  return [
    { member: '_normalizeFeatures', name: 'featuresAbsent', args: [{}] },
    { member: '_normalizeFeatures', name: 'featuresEmpty', args: [{ features: {} }] },
    {
      member: '_normalizeFeatures',
      name: 'featuresMultiStepAgreesWithLegacy',
      args: [{ features: { multiStepRecipes: true, complexRecipes: true } }],
    },
    // The legacy `complexRecipes` seeds `multiStepRecipes` ONLY when the new key is absent, so a
    // disagreeing pair is the input that reds a preference flip.
    {
      member: '_normalizeFeatures',
      name: 'featuresMultiStepDisagreesWithLegacy',
      args: [{ features: { multiStepRecipes: false, complexRecipes: true } }],
    },
    { member: '_normalizeFeatures', name: 'featuresLegacyComplexOnly', args: [{ features: { complexRecipes: true } }] },
    {
      member: '_normalizeFeatures',
      name: 'featuresDefaultOnTogglesExplicitlyFalse',
      args: [
        {
          features: {
            salvage: false,
            chatOutput: false,
            refundOnPlayerCancel: false,
            essences: true,
            gathering: true,
            propertyMacros: true,
            craftingChecks: true,
            outcomeRouting: true,
            effectTransfer: true,
            itemPiles: true,
          },
        },
      ],
      alternatives: [{ features: { salvage: true } }],
    },
    { member: '_normalizeFeatures', name: 'featuresEssencesFromSystemFlag', args: [{ enableEssences: true }] },

    { member: '_normalizeVisibilityMode', name: 'visibilityModeGlobal', args: ['global'] },
    {
      member: '_normalizeVisibilityMode',
      name: 'visibilityModeRestricted',
      args: ['restricted'],
      alternatives: ['item'],
    },
    { member: '_normalizeVisibilityMode', name: 'visibilityModeItem', args: ['item'] },
    { member: '_normalizeVisibilityMode', name: 'visibilityModeKnowledge', args: ['knowledge'] },
    { member: '_normalizeVisibilityMode', name: 'visibilityModeNull', args: [null] },
    { member: '_normalizeVisibilityMode', name: 'visibilityModeBogus', args: ['bogus'] },

    { member: '_normalizeRecipeVisibility', name: 'recipeVisibilityAbsent', args: [{}] },
    {
      member: '_normalizeRecipeVisibility',
      name: 'recipeVisibilityTeaserLearned',
      args: [{ listMode: 'teaser', knowledge: { mode: 'learned', learn: { dragDropEnabled: false } } }],
      alternatives: [{ listMode: 'player', knowledge: { mode: 'item' } }],
    },
    {
      member: '_normalizeRecipeVisibility',
      name: 'recipeVisibilityPlayerItem',
      args: [{ listMode: 'player', knowledge: { mode: 'item' } }],
    },
    {
      member: '_normalizeRecipeVisibility',
      name: 'recipeVisibilityKnowledgeItemOrLearned',
      args: [{ listMode: 'knowledge', knowledge: { mode: 'itemOrLearned', learn: {} } }],
    },
    {
      member: '_normalizeRecipeVisibility',
      name: 'recipeVisibilityBogusTokens',
      args: [{ listMode: 'bogus', knowledge: { mode: 'bogus' } }],
    },
    {
      member: '_normalizeRecipeVisibility',
      name: 'recipeVisibilityGlobalDragDropAbsent',
      args: [{ listMode: 'global' }],
    },

    { member: '_normalizeTeaserConfig', name: 'teaserConfigNonObject', args: ['nope'] },
    { member: '_normalizeTeaserConfig', name: 'teaserConfigAbsent', args: [{}] },
    // The blank-id fragment is the only input that reds a dropped `if (!id) return null` guard.
    {
      member: '_normalizeTeaserConfig',
      name: 'teaserConfigBlankAndValidFragments',
      args: [
        {
          enabled: true,
          discoveryMode: 'both',
          fragments: [
            { id: '   ', name: 'Blank' },
            {
              id: 'frag-1',
              name: '  Whisper  ',
              linkedItemUuid: 'Item.frag',
              recipeIds: ['r1', 5, 'r2'],
              progressValue: 150,
            },
            { id: 'frag-2', progressValue: -20 },
            null,
          ],
        },
      ],
      alternatives: [{ enabled: false, discoveryMode: 'threshold', fragments: [] }],
    },
    {
      member: '_normalizeTeaserConfig',
      name: 'teaserConfigBogusDiscoveryMode',
      args: [{ enabled: true, discoveryMode: 'bogus', fragments: 'not-an-array' }],
    },

    { member: '_normalizeRequirements', name: 'requirementsAbsent', args: [{}] },
    {
      member: '_normalizeRequirements',
      name: 'requirementsTimeDisabled',
      args: [{ time: { enabled: false }, currency: { enabled: true } }],
      alternatives: [{ time: { enabled: true }, currency: { enabled: false } }],
    },
    {
      member: '_normalizeRequirements',
      name: 'requirementsTimeEnabledAbsent',
      args: [{ currency: { enabled: true } }],
    },

    // The pre-1278 sibling keys the allowlist rebuild sheds; a spread of `currency` before
    // `{ enabled }` would carry them through.
    {
      member: '_normalizeCurrencyConfig',
      name: 'currencyConfigPre1278Siblings',
      args: [{ enabled: true, unit: 'gp', abbreviation: 'gp', denominations: [{ id: 'gp', rate: 1 }] }],
      alternatives: [{ enabled: false, unit: 'gp' }],
    },
    { member: '_normalizeCurrencyConfig', name: 'currencyConfigAbsent', args: [{}] },
    { member: '_normalizeCurrencyConfig', name: 'currencyConfigNonObject', args: [null] },

    // The duplicate entry is the only input that reds a dropped dedupe.
    {
      member: '_normalizeStringList',
      name: 'stringListDuplicatesAndBlanks',
      args: [['alpha', ' alpha ', 'beta', '', null, 'alpha', 7]],
      alternatives: [['beta']],
    },
    { member: '_normalizeStringList', name: 'stringListNonArray', args: ['nope'] },

    {
      member: '_normalizeAlchemyConfig',
      name: 'alchemyConfigCanonicalMode',
      args: [
        { checkMode: 'tiered', learnOnCraft: false, consumeOnFail: false, showAttemptHistoryToPlayers: false },
        'alchemy',
      ],
      alternatives: [{ checkMode: 'simple' }, 'simple'],
    },
    { member: '_normalizeAlchemyConfig', name: 'alchemyConfigLegacyCauldron', args: [{ checkMode: 'simple' }, 'cauldron'] },
    { member: '_normalizeAlchemyConfig', name: 'alchemyConfigBogusCheckMode', args: [{ checkMode: 'bogus' }, 'alchemy'] },
    { member: '_normalizeAlchemyConfig', name: 'alchemyConfigNonAlchemyMode', args: [{ checkMode: 'simple' }, 'routedByCheck'] },
    { member: '_normalizeAlchemyConfig', name: 'alchemyConfigFlagsAbsent', args: [{}, 'alchemy'] },
  ];
}

function essenceScenarios() {
  return [
    {
      member: '_normalizeEssenceDefinitions',
      name: 'essenceDefinitionsMixedCorpus',
      args: [
        [
          'Fire',
          '   ',
          { id: 'FIRE' },
          { name: 'Fire' },
          { id: '  ', name: '  ' },
          { id: '2024' },
          {
            id: 'water',
            colorToken: '--fab-tag-blue',
            propertyMacroUuid: 'Macro.abcdef',
            enabled: 'false',
            associatedSystemItemId: 'comp-1',
          },
          { id: 'air', colorToken: 'green', propertyMacroUuid: 'bare-word', enabled: false },
          { id: 'earth', propertyMacroUuid: 'Compendium.mod.macros.xyz' },
          null,
          42,
        ],
      ],
      alternatives: [['Fire']],
    },
    { member: '_normalizeEssenceDefinitions', name: 'essenceDefinitionsNonArray', args: ['nope'] },

    {
      member: '_normalizeEssenceDefinition',
      name: 'essenceDefinitionStringColliding',
      args: ['  Molten Fire  ', new Set(['molten-fire'])],
      alternatives: ['Other Essence', new Set()],
    },
    { member: '_normalizeEssenceDefinition', name: 'essenceDefinitionBlankString', args: ['   ', new Set()] },
    // A mixed-case id is what the lowercase-and-uniquify requirement actually rests on.
    { member: '_normalizeEssenceDefinition', name: 'essenceDefinitionMixedCaseId', args: [{ id: 'MiXeD Case' }, new Set()] },
    { member: '_normalizeEssenceDefinition', name: 'essenceDefinitionNameOnly', args: [{ name: 'Verdant Ichor' }, new Set()] },
    { member: '_normalizeEssenceDefinition', name: 'essenceDefinitionNeitherIdNorName', args: [{ description: 'x' }, new Set()] },
    { member: '_normalizeEssenceDefinition', name: 'essenceDefinitionDigitOnlyId', args: [{ id: '2024' }, new Set()] },
    {
      member: '_normalizeEssenceDefinition',
      name: 'essenceDefinitionEnabledStringFalse',
      args: [{ id: 'e1', enabled: 'false' }, new Set()],
    },
    { member: '_normalizeEssenceDefinition', name: 'essenceDefinitionEnabledFalse', args: [{ id: 'e2', enabled: false }, new Set()] },
    {
      member: '_normalizeEssenceDefinition',
      name: 'essenceDefinitionPrefixedColorToken',
      args: [{ id: 'e3', colorToken: '--fab-tag-crimson' }, new Set()],
    },
    { member: '_normalizeEssenceDefinition', name: 'essenceDefinitionBareColorToken', args: [{ id: 'e4', colorToken: 'crimson' }, new Set()] },
    {
      member: '_normalizeEssenceDefinition',
      name: 'essenceDefinitionLegacyCompendiumMacro',
      args: [{ id: 'e5', propertyMacroUuid: 'Compendium.mod.macros.abc123' }, new Set()],
    },
    {
      member: '_normalizeEssenceDefinition',
      name: 'essenceDefinitionBareWordMacro',
      args: [{ id: 'e6', propertyMacroUuid: 'not-a-uuid' }, new Set()],
    },
    {
      member: '_normalizeEssenceDefinition',
      name: 'essenceDefinitionAssociatedWithoutSource',
      args: [{ id: 'e7', associatedSystemItemId: 'comp-7', sourceItemUuid: 'Item.seven' }, new Set()],
    },
    { member: '_normalizeEssenceDefinition', name: 'essenceDefinitionNonObject', args: [7, new Set()] },

    { member: '_looksLikeDocumentUuid', name: 'looksLikeDocumentUuidItem', args: ['Item.abc'], alternatives: ['nope'] },
    { member: '_looksLikeDocumentUuid', name: 'looksLikeDocumentUuidCompendium', args: ['Compendium.mod.pack.abc'] },
    { member: '_looksLikeDocumentUuid', name: 'looksLikeDocumentUuidBareWord', args: ['bare'] },
    { member: '_looksLikeDocumentUuid', name: 'looksLikeDocumentUuidNull', args: [null] },

    { member: '_toKey', name: 'toKeyMixedCase', args: ['  Molten FIRE  '], alternatives: ['water'] },
    { member: '_toKey', name: 'toKeyDigits', args: ['2024'] },
    { member: '_toKey', name: 'toKeyEdgeSeparators', args: ['--a__b--'] },
    { member: '_toKey', name: 'toKeyEmpty', args: [''] },

    // The basis OMITTED, `null`, an empty Set, a populated Set and a truthy non-Set: the five
    // inputs the Valid Id Basis sentinel is answerable to.
    { member: '_normalizeEssenceQuantities', name: 'essenceQuantitiesBasisOmitted', args: [{ fire: 2, water: 1 }] },
    { member: '_normalizeEssenceQuantities', name: 'essenceQuantitiesBasisNull', args: [{ fire: 2, water: 1 }, null] },
    { member: '_normalizeEssenceQuantities', name: 'essenceQuantitiesBasisEmptySet', args: [{ fire: 2 }, new Set()] },
    { member: '_normalizeEssenceQuantities', name: 'essenceQuantitiesBasisNonSet', args: [{ fire: 2, water: 1 }, ['fire']] },
    {
      member: '_normalizeEssenceQuantities',
      name: 'essenceQuantitiesBasisPopulated',
      args: [
        { fire: 2, water: '2', earth: 0, air: -1, '   ': 5, '  wind  ': 3, mud: 'x', stone: 4 },
        new Set(['fire', 'water', 'wind']),
      ],
      alternatives: [{ fire: 1 }, new Set(['fire'])],
    },
    { member: '_normalizeEssenceQuantities', name: 'essenceQuantitiesNonObject', args: ['nope', null] },
  ];
}

/** A recipe-item definition authoring every source-ref spelling and both description shapes. */
function fullyAuthoredRecipeItem() {
  return {
    id: 'book-1',
    name: '  Tome of Iron  ',
    description: { value: '<p>Bound  in <b>leather</b></p>' },
    img: '  ',
    originItemUuid: ' Item.origin ',
    registeredItemUuid: 'Item.registered',
    sourceItemUuid: 'Item.legacyItem',
    sourceUuid: 'Item.legacy',
    aliasItemUuids: ['Item.registered', ' Item.alias ', 'Item.alias', ''],
    enabled: false,
    recipeIds: ['r1', ' r1 ', '', 'r2'],
    caps: {
      item: { limitUses: true, maxUses: '3', whenSpent: 'inert', destroyWhenExhausted: true },
      learn: { limitLearning: true, learnsAllowed: 2, learnScope: 'total', prerequisiteIds: ['r9'] },
    },
  };
}

function recipeItemScenarios() {
  return [
    {
      member: '_normalizeRecipeItemDefinitions',
      name: 'recipeItemDefinitionsCollidingIds',
      args: [[{ id: 'book' }, { id: 'book' }, { name: 'No id' }, null, 'nope']],
      alternatives: [[{ id: 'book' }]],
    },
    { member: '_normalizeRecipeItemDefinitions', name: 'recipeItemDefinitionsNonArray', args: ['nope'] },

    { member: '_normalizeRecipeItemCaps', name: 'capsAbsent', args: [{}] },
    {
      member: '_normalizeRecipeItemCaps',
      name: 'capsAuthoredWhenSpentContradictsLegacy',
      args: [
        {
          item: { limitUses: true, maxUses: '3', whenSpent: 'inert', destroyWhenExhausted: true },
          learn: {
            consumeOnLearn: false,
            limitLearning: true,
            learnsAllowed: 2,
            limitRecipes: false,
            maxRecipes: 9,
            learnScope: 'total',
            prerequisiteIds: ['r1', '  r1  ', ''],
            characterPrerequisiteIds: [' cp1 ', 'cp1', ''],
            destroyWhenSpent: true,
          },
        },
      ],
      alternatives: [{ item: { whenSpent: 'destroyed' }, learn: {} }],
    },
    { member: '_normalizeRecipeItemCaps', name: 'capsLegacyDestroyWhenExhaustedFalse', args: [{ item: { destroyWhenExhausted: false } }] },
    { member: '_normalizeRecipeItemCaps', name: 'capsLimitLearningWithNoCount', args: [{ learn: { limitLearning: true } }] },
    { member: '_normalizeRecipeItemCaps', name: 'capsLimitLearningZero', args: [{ learn: { limitLearning: true, learnsAllowed: 0 } }] },
    { member: '_normalizeRecipeItemCaps', name: 'capsLimitLearningNegative', args: [{ learn: { limitLearning: true, learnsAllowed: -1 } }] },
    { member: '_normalizeRecipeItemCaps', name: 'capsLegacyLimitRecipes', args: [{ learn: { limitRecipes: true, maxRecipes: 4 } }] },
    { member: '_normalizeRecipeItemCaps', name: 'capsLegacyLearningModeParty', args: [{ learn: { learningMode: 'party' } }] },
    { member: '_normalizeRecipeItemCaps', name: 'capsLegacySinglePrerequisite', args: [{ learn: { prerequisite: '  r9  ' } }] },
    {
      member: '_normalizeRecipeItemCaps',
      name: 'capsLegacyPrerequisiteBesideIds',
      args: [{ learn: { prerequisite: 'r9', prerequisiteIds: ['r1'] } }],
    },
    {
      member: '_normalizeRecipeItemCaps',
      name: 'capsAuthoredLearnScopeBeatsLegacyMode',
      args: [{ learn: { learnScope: 'perInstance', learningMode: 'party' } }],
    },

    {
      member: '_normalizeRecipeItemDefinition',
      name: 'recipeItemDefinitionFullyAuthored',
      args: [fullyAuthoredRecipeItem(), new Set(['book-1'])],
      alternatives: [{ id: 'other-book' }, new Set()],
    },
    // No `name` and a dotted uuid: the only input that reds a `parts.at(-1)` → `parts[0]` swap.
    {
      member: '_normalizeRecipeItemDefinition',
      name: 'recipeItemDefinitionLabelFromDottedUuid',
      args: [{ id: 'rid-x', originItemUuid: 'Compendium.mod.pack.TheTome' }, new Set()],
    },
    { member: '_normalizeRecipeItemDefinition', name: 'recipeItemDefinitionNoId', args: [{ name: 'Fresh' }, new Set()] },
    {
      member: '_normalizeRecipeItemDefinition',
      name: 'recipeItemDefinitionLegacyRefs',
      args: [{ id: 'legacy', sourceUuid: 'Item.legacy', fallbackItemIds: ['Item.legacy', ' Item.fallback ', ''] }, new Set()],
    },
    // The two description shapes that separate `plainTextDescription` from its same-arity
    // neighbour `descriptionTextCandidate`.
    {
      member: '_normalizeRecipeItemDefinition',
      name: 'recipeItemDefinitionEnricherDescription',
      args: [{ id: 'enricher', description: '&Reference[prone]{Prone}' }, new Set()],
    },
    {
      member: '_normalizeRecipeItemDefinition',
      name: 'recipeItemDefinitionFoundryDescription',
      args: [{ id: 'foundry-shape', description: { value: '<p>Bound  in <b>leather</b></p>' } }, new Set()],
    },
    { member: '_normalizeRecipeItemDefinition', name: 'recipeItemDefinitionNonObject', args: ['nope', new Set()] },

    {
      member: '_labelFromUuid',
      name: 'labelFromUuidDotted',
      args: ['Compendium.mod.pack.TheTome'],
      alternatives: ['Item.Other'],
    },
    { member: '_labelFromUuid', name: 'labelFromUuidBareWord', args: ['TheTome'] },
    { member: '_labelFromUuid', name: 'labelFromUuidEmpty', args: [''] },
    { member: '_labelFromUuid', name: 'labelFromUuidNull', args: [null] },
  ];
}

/** A salvage config with the failure group FIRST, which the Simple-mode clamp must re-order. */
function failureFirstSalvage() {
  return {
    enabled: true,
    allowPlayerResultReorder: false,
    ingredientQuantity: '2',
    dcOverride: '12',
    toolIds: [' t1 ', 't1', '', 't2'],
    checkModifierIds: ['m1', 'm2'],
    outcomeRouting: { mode: 'byRole' },
    timeRequirement: { minutes: 30, hours: 0, days: -1 },
    currencyRequirement: { unit: '  ', amount: '5' },
    resultGroups: [
      { id: 'g-fail', name: '  ', role: 'failure', results: [{ componentId: 'c-scrap' }] },
      {
        name: 'Success',
        results: [
          { id: 'res-1', componentId: 'c1', systemItemId: 'c-other', quantity: '3', quantityFormula: ' 1d4 ' },
          null,
        ],
      },
    ],
  };
}

/** A component authoring every field the cluster touches, including the complications mint path. */
function fullyAuthoredComponent() {
  return {
    id: 'comp-1',
    name: 'Iron Ore',
    img: '',
    description: { value: '<p>Raw  <b>iron</b></p>' },
    originItemUuid: 'Item.origin',
    registeredItemUuid: 'Item.registered',
    sourceItemUuid: 'Item.legacyItem',
    sourceUuid: 'Item.legacy',
    aliasItemUuids: ['Item.registered', ' Item.alias ', 'Item.alias', ''],
    tier: 'common',
    category: '  Metals  ',
    tags: ['ore'],
    essences: { fire: 2, water: '2', earth: 0, '  wind  ': 3 },
    difficulty: '4.7',
    complications: [{ label: 'Shatters', chance: 25 }],
    salvage: failureFirstSalvage(),
  };
}

function componentScenarios() {
  return [
    {
      member: '_normalizeComponent',
      name: 'componentFullyAuthoredSimpleMode',
      args: [
        fullyAuthoredComponent(),
        {
          validEssenceIds: new Set(['fire', 'water']),
          salvageResolutionMode: 'simple',
          salvageSimpleCheckHasFormula: true,
        },
      ],
      alternatives: [{ id: 'comp-other' }, {}],
    },
    // A bare `validEssenceIds` Set as the second positional argument: the legacy call form.
    {
      member: '_normalizeComponent',
      name: 'componentLegacyPositionalEssenceSet',
      args: [{ id: 'c1', essences: { fire: 2, water: 1 } }, new Set(['fire'])],
    },
    {
      member: '_normalizeComponent',
      name: 'componentEnricherDescription',
      args: [{ id: 'c-ref', description: '&Reference[prone]{Prone}' }, {}],
    },
    {
      member: '_normalizeComponent',
      name: 'componentFoundryDescription',
      args: [{ id: 'c-desc', description: { value: '<p>Iron  <b>ore</b></p>' } }, {}],
    },
    { member: '_normalizeComponent', name: 'componentComplicationsAuthored', args: [{ id: 'c-comp', complications: [{ label: 'Shatters' }] }, {}] },
    { member: '_normalizeComponent', name: 'componentCategoryAbsent', args: [{}, {}] },

    {
      member: '_salvageNormalizationContext',
      name: 'salvageContextSimpleWithFormula',
      args: [{ salvageResolutionMode: 'simple', salvageCraftingCheck: { simple: { rollFormula: '1d20' } } }],
      alternatives: [{ salvageResolutionMode: 'progressive' }],
    },
    { member: '_salvageNormalizationContext', name: 'salvageContextLegacyTiered', args: [{ salvageResolutionMode: 'tiered' }] },
    { member: '_salvageNormalizationContext', name: 'salvageContextBogusMode', args: [{ salvageResolutionMode: 'bogus' }] },
    { member: '_salvageNormalizationContext', name: 'salvageContextAbsent', args: [{}] },
    {
      member: '_salvageNormalizationContext',
      name: 'salvageContextBlankFormula',
      args: [{ salvageResolutionMode: 'simple', salvageCraftingCheck: { simple: { rollFormula: '   ' } } }],
    },

    { member: '_normalizeSalvage', name: 'salvageNonObject', args: ['nope', {}] },
    { member: '_normalizeSalvage', name: 'salvageDisabledNoGroups', args: [{ enabled: false, resultGroups: [] }, {}] },
    { member: '_normalizeSalvage', name: 'salvageEnabledZeroGroups', args: [{ enabled: true, resultGroups: [] }, {}] },
    {
      member: '_normalizeSalvage',
      name: 'salvageSimpleFailureFirstWithFormula',
      args: [failureFirstSalvage(), { salvageResolutionMode: 'simple', salvageSimpleCheckHasFormula: true }],
      alternatives: [{ enabled: false }, { salvageResolutionMode: 'routed' }],
    },
    {
      member: '_normalizeSalvage',
      name: 'salvageSimpleFailureFirstWithoutFormula',
      args: [failureFirstSalvage(), { salvageResolutionMode: 'simple', salvageSimpleCheckHasFormula: false }],
    },
    {
      member: '_normalizeSalvage',
      name: 'salvageSimpleFailureOnly',
      args: [
        { enabled: true, resultGroups: [{ id: 'g-fail', role: 'failure', results: [{ componentId: 'c1' }] }] },
        { salvageResolutionMode: 'simple', salvageSimpleCheckHasFormula: true },
      ],
    },
    { member: '_normalizeSalvage', name: 'salvageRoutedMode', args: [failureFirstSalvage(), { salvageResolutionMode: 'routed' }] },
    { member: '_normalizeSalvage', name: 'salvageProgressiveMode', args: [failureFirstSalvage(), { salvageResolutionMode: 'progressive' }] },
    { member: '_normalizeSalvage', name: 'salvageDcOverrideNull', args: [{ enabled: true, dcOverride: null, resultGroups: [] }, {}] },
    { member: '_normalizeSalvage', name: 'salvageDcOverrideBlank', args: [{ enabled: true, dcOverride: '', resultGroups: [] }, {}] },
    { member: '_normalizeSalvage', name: 'salvageDcOverrideNumeric', args: [{ enabled: true, dcOverride: 12, resultGroups: [] }, {}] },
    // Absent / empty / populated: an authored pick of zero is distinct from an absent one.
    { member: '_normalizeSalvage', name: 'salvageCheckModifierIdsAbsent', args: [{ enabled: true, resultGroups: [] }, {}] },
    { member: '_normalizeSalvage', name: 'salvageCheckModifierIdsEmpty', args: [{ enabled: true, checkModifierIds: [], resultGroups: [] }, {}] },
    {
      member: '_normalizeSalvage',
      name: 'salvageCheckModifierIdsPopulated',
      args: [{ enabled: true, checkModifierIds: ['m1', 'm1', ' m2 '], resultGroups: [] }, {}],
    },
    {
      member: '_normalizeSalvage',
      name: 'salvageRequirementsNonObject',
      args: [{ enabled: true, resultGroups: [], timeRequirement: 'nope', currencyRequirement: 'nope' }, {}],
    },

    {
      member: '_normalizeToolIds',
      name: 'toolIdsDuplicatesAndBlanks',
      args: [[' t1 ', 't1', '', null, 't2']],
      alternatives: [['t2']],
    },
    { member: '_normalizeToolIds', name: 'toolIdsNonArray', args: ['nope'] },

    {
      member: '_normalizeSalvageResult',
      name: 'salvageResultFullyAuthored',
      args: [{ id: 'res-1', componentId: 'c1', systemItemId: 'c-other', quantity: '3', quantityFormula: ' 1d4 ', propertyMacroUuid: 'Macro.abc' }],
      alternatives: [{ componentId: 'c2' }],
    },
    { member: '_normalizeSalvageResult', name: 'salvageResultSystemItemIdOnly', args: [{ systemItemId: 'c9' }] },
    { member: '_normalizeSalvageResult', name: 'salvageResultBlankFormula', args: [{ componentId: 'c1', quantityFormula: '   ' }] },
    { member: '_normalizeSalvageResult', name: 'salvageResultNonObject', args: [null] },

    {
      member: '_normalizeSalvageResultGroup',
      name: 'salvageResultGroupFailureRole',
      args: [{ id: 'g1', name: '  ', role: 'failure', results: [{ componentId: 'c1' }, null] }],
      alternatives: [{ id: 'g1', name: 'Other', results: [] }],
    },
    { member: '_normalizeSalvageResultGroup', name: 'salvageResultGroupMintedId', args: [{ name: 'Success', results: [{ componentId: 'c2' }] }] },
    { member: '_normalizeSalvageResultGroup', name: 'salvageResultGroupNonObject', args: ['nope'] },

    {
      member: '_normalizeTimeRequirement',
      name: 'timeRequirementZeroAndNegative',
      args: [{ minutes: 30, hours: 0, days: -1, months: '2', years: 'x' }],
      alternatives: [{ minutes: 5 }],
    },
    { member: '_normalizeTimeRequirement', name: 'timeRequirementNonObject', args: ['nope'] },

    {
      member: '_normalizeCurrencyRequirement',
      name: 'currencyRequirementBlankUnit',
      args: [{ unit: '   ', amount: '5' }],
      alternatives: [{ unit: 'sp', amount: 5 }],
    },
    { member: '_normalizeCurrencyRequirement', name: 'currencyRequirementNegativeAmount', args: [{ unit: 'sp', amount: -3 }] },
    { member: '_normalizeCurrencyRequirement', name: 'currencyRequirementNonObject', args: [null] },
  ];
}

const CLUSTERS = Object.freeze({
  tools: toolScenarios,
  systemFields: systemFieldScenarios,
  essences: essenceScenarios,
  recipeItems: recipeItemScenarios,
  components: componentScenarios,
});

/** Every per-member scenario, cluster-tagged, in a fixed order so minted ids are reproducible. */
export function memberScenarios() {
  return Object.entries(CLUSTERS).flatMap(([cluster, build]) =>
    build().map((scenario) => ({ cluster, ...scenario }))
  );
}

/** The per-cluster scenario counts the pin suite checks against `CORPUS_FLOORS`. */
export function clusterCounts() {
  return Object.fromEntries(Object.entries(CLUSTERS).map(([cluster, build]) => [cluster, build().length]));
}

/**
 * The wrapped-system list, driven through `_normalizeSystem` at the UNKNOWN Valid Id Basis — a bare
 * manager seeds no scope store — and re-fed to pin idempotence.
 */
export function systemScenarios() {
  return [
    { name: 'systemMinimal', system: {} },
    {
      name: 'systemFullyAuthored',
      system: {
        id: 'sys-1',
        name: 'Forge',
        resolutionMode: 'progressive',
        features: { salvage: true, essences: true, multiStepRecipes: true },
        itemTags: ['metal', ' metal ', ''],
        visibilityMode: 'restricted',
        recipeVisibility: { listMode: 'teaser', knowledge: { mode: 'learned', learn: { dragDropEnabled: false } } },
        requirements: { time: { enabled: false }, currency: { enabled: true, unit: 'gp' } },
        essenceDefinitions: ['Fire', { id: 'FIRE' }, { id: 'water', colorToken: '--fab-tag-blue' }],
        recipeItemDefinitions: [fullyAuthoredRecipeItem(), { name: 'Unbound' }],
        components: [fullyAuthoredComponent(), { id: 'comp-2', essences: { fire: 1 } }],
        tools: [fullyAuthoredTool(), {}],
        teaserConfig: { enabled: true, discoveryMode: 'both', fragments: [{ id: 'frag-1', progressValue: 150 }, { id: '  ' }] },
        componentCategories: ['Metals'],
        categories: ['Weapons'],
        salvageResolutionMode: 'routed',
        salvageCraftingCheck: { simple: { rollFormula: '1d20' } },
      },
    },
    {
      name: 'systemLegacySpellings',
      system: {
        id: 'sys-legacy',
        resolutionMode: 'cauldron',
        enableEssences: true,
        tags: ['alchemical'],
        essences: ['Fire', 'Water'],
        recipeItems: [{ id: 'book-legacy', sourceUuid: 'Item.legacy' }],
        managedItems: [{ id: 'comp-legacy', sourceUuid: 'Item.legacy' }],
        cauldron: { checkMode: 'tiered', learnOnCraft: false },
        features: { complexRecipes: true },
      },
    },
    {
      name: 'systemSimpleSalvageClamp',
      system: {
        id: 'sys-simple',
        salvageResolutionMode: 'simple',
        salvageCraftingCheck: { simple: { rollFormula: '1d20' } },
        components: [{ id: 'comp-salvage', salvage: failureFirstSalvage() }],
      },
    },
    {
      name: 'systemSimpleSalvageNoFormula',
      system: {
        id: 'sys-simple-bare',
        salvageResolutionMode: 'simple',
        components: [{ id: 'comp-salvage', salvage: failureFirstSalvage() }],
      },
    },
  ];
}
