/**
 * The invalidation-domain taxonomy (issue 1078; `data-models/spec.md` § Invalidation Domains):
 * the seven classes of fact a crafting-data change can belong to and, in one authored table, the
 * stores consuming each. `STORE_DOMAINS` is derived from that table, never authored. An
 * unclassified field or unattributable change resolves to EVERY domain, so a widening is safe and a
 * narrowing must be authored; `tests/invalidation-domains.test.js` pins completeness in both
 * directions and every row's value. Neither the DDD sense of domain nor `revisionTokens`' entity
 * scope: a domain composes into a token scope through `REVISION_SCOPES.facts`.
 */

/**
 * The seven domains, closed: an eighth needs a `DOMAIN_CONSUMERS` row, a spec row and a decision
 * about every store.
 */
export const INVALIDATION_DOMAINS = Object.freeze({
  /** Names, images, categories, tags and sort keys. */
  LABELLING: 'labelling',
  /**
   * Authored prose carried on THIS channel. Realm and task prose (the gathering store does not
   * consume `narrative`) and teaser prose (gate configuration) are deliberately outside it.
   */
  NARRATIVE: 'narrative',
  /** Ingredient sets and groups, set essences, results, steps. */
  MATERIALS_AND_YIELD: 'materials-and-yield',
  /** Tools, currency, checks, resolution modes, modifiers and requirements. */
  RESOLUTION_CONFIG: 'resolution-config',
  /** Component, tool and essence definitions. */
  COMPONENT_DEFINITIONS: 'component-definitions',
  /**
   * Teasers, recipe-item definitions and the authored learning and discovery gates; a player's
   * own learned and discovered state lives in actor flags, not here.
   */
  ACCESS_AND_KNOWLEDGE: 'access-and-knowledge',
  /** Actor-held items. */
  HELD_INVENTORY: 'held-inventory',
});

/** Every domain name, in taxonomy order. */
export const INVALIDATION_DOMAIN_NAMES = Object.freeze(Object.values(INVALIDATION_DOMAINS));

const DOMAIN_NAME_SET = new Set(INVALIDATION_DOMAIN_NAMES);

export function isInvalidationDomain(name) {
  return DOMAIN_NAME_SET.has(name);
}

const {
  LABELLING,
  NARRATIVE,
  MATERIALS_AND_YIELD,
  RESOLUTION_CONFIG,
  COMPONENT_DEFINITIONS,
  ACCESS_AND_KNOWLEDGE,
  HELD_INVENTORY,
} = INVALIDATION_DOMAINS;

/** The read-model store each shared service publishes. */
export const INVALIDATION_STORES = Object.freeze({
  CRAFTING: 'crafting',
  INVENTORY: 'inventory',
  ALCHEMY: 'alchemy',
  JOURNAL: 'journal',
  GATHERING: 'gathering',
});

const { CRAFTING, INVENTORY, ALCHEMY, JOURNAL, GATHERING } = INVALIDATION_STORES;

/**
 * The one authored mapping: the stores consuming each domain. `journal` skips `narrative` (issue
 * 1078's observable decision). `gathering` takes `materials-and-yield` and `resolution-config`
 * because its non-GM listing runs the system-validity gate, whose `blocksSystem` blockers read
 * them; omitting either would keep a system hidden from players after the GM fixed it. It skips
 * `held-inventory`, which reaches it through its own `subscribeInventoryChange`.
 */
export const DOMAIN_CONSUMERS = Object.freeze({
  [LABELLING]: Object.freeze([CRAFTING, INVENTORY, ALCHEMY, JOURNAL, GATHERING]),
  [NARRATIVE]: Object.freeze([CRAFTING, INVENTORY, ALCHEMY]),
  [MATERIALS_AND_YIELD]: Object.freeze([CRAFTING, INVENTORY, ALCHEMY, JOURNAL, GATHERING]),
  [RESOLUTION_CONFIG]: Object.freeze([CRAFTING, INVENTORY, ALCHEMY, JOURNAL, GATHERING]),
  [COMPONENT_DEFINITIONS]: Object.freeze([CRAFTING, INVENTORY, ALCHEMY, JOURNAL, GATHERING]),
  [ACCESS_AND_KNOWLEDGE]: Object.freeze([CRAFTING, INVENTORY, ALCHEMY, JOURNAL, GATHERING]),
  [HELD_INVENTORY]: Object.freeze([CRAFTING, INVENTORY, ALCHEMY, JOURNAL]),
});

/** The derived transpose of `DOMAIN_CONSUMERS`, which consumers route from. */
export const STORE_DOMAINS = Object.freeze(
  Object.fromEntries(
    Object.values(INVALIDATION_STORES).map((store) => [
      store,
      Object.freeze(
        INVALIDATION_DOMAIN_NAMES.filter((domain) => DOMAIN_CONSUMERS[domain].includes(store))
      ),
    ])
  )
);

/** What an unclassified field resolves to. */
export const ALL_INVALIDATION_DOMAINS = INVALIDATION_DOMAIN_NAMES;

/** `_normalizeSystem`'s transitional alias keys, each classified as the field it mirrors. */
export const MIRRORED_SYSTEM_FIELDS = Object.freeze({
  enableTags: 'features',
  enableEssences: 'features',
  enableCategories: 'features',
  enableMultiStepRecipes: 'features',
  essences: 'essenceDefinitions',
});

/** The domains of each top-level key `_normalizeSystem` persists, read on the replication path. */
export const SYSTEM_FIELD_DOMAINS = Object.freeze({
  // Unreachable when changed (the delta pairs by id); the whole record on an add or a remove.
  id: ALL_INVALIDATION_DOMAINS,
  name: Object.freeze([LABELLING]),
  description: Object.freeze([NARRATIVE]),
  // A disabled system hides every recipe it owns from every non-GM surface.
  enabled: Object.freeze([ACCESS_AND_KNOWLEDGE]),
  resolutionMode: Object.freeze([RESOLUTION_CONFIG]),
  // Gates essences, multi-step structure and the journal's multi-step reading: the widest row.
  features: Object.freeze([MATERIALS_AND_YIELD, RESOLUTION_CONFIG, ACCESS_AND_KNOWLEDGE]),
  itemTags: Object.freeze([LABELLING]),
  tags: Object.freeze([LABELLING]),
  categories: Object.freeze([LABELLING]),
  componentCategories: Object.freeze([LABELLING]),
  categoryIcons: Object.freeze([LABELLING]),
  componentCategoryIcons: Object.freeze([LABELLING]),
  visibilityMode: Object.freeze([ACCESS_AND_KNOWLEDGE]),
  recipeVisibility: Object.freeze([ACCESS_AND_KNOWLEDGE]),
  requirements: Object.freeze([RESOLUTION_CONFIG]),
  // A name and icon, every ingredient-set essence total, and a definition in its own right.
  essenceDefinitions: Object.freeze([LABELLING, MATERIALS_AND_YIELD, COMPONENT_DEFINITIONS]),
  // A book's prose, its title, and the membership deciding what a player may learn.
  recipeItemDefinitions: Object.freeze([LABELLING, NARRATIVE, ACCESS_AND_KNOWLEDGE]),
  membershipResolvesByRecipeIds: Object.freeze([ACCESS_AND_KNOWLEDGE]),
  craftingCheck: Object.freeze([RESOLUTION_CONFIG]),
  salvageCraftingCheck: Object.freeze([RESOLUTION_CONFIG]),
  gatheringCraftingCheck: Object.freeze([RESOLUTION_CONFIG]),
  salvageResolutionMode: Object.freeze([RESOLUTION_CONFIG]),
  toolBreakage: Object.freeze([RESOLUTION_CONFIG]),
  alchemy: Object.freeze([RESOLUTION_CONFIG]),
  // Gate configuration, prose included (see `NARRATIVE`).
  teaserConfig: Object.freeze([ACCESS_AND_KNOWLEDGE]),
  // The array cannot say which class moved, so it carries all three a component can express.
  components: Object.freeze([LABELLING, NARRATIVE, COMPONENT_DEFINITIONS]),
  tools: Object.freeze([LABELLING, NARRATIVE, COMPONENT_DEFINITIONS, RESOLUTION_CONFIG]),
  // `modifiers` and `characterPrerequisites` left the system (issue 1308), as did `gatheringRealms`
  // (issue 1282); `settingChangeBridge`'s `characterLibraries` and `travelConfig` legs announce
  // them. `gatheringRealmSettings` (`{ enabled }`) stays, and participation changes the realm
  // names, realm-gated task availability and realm tools a listing reads.
  gatheringRealmSettings: Object.freeze([LABELLING, COMPONENT_DEFINITIONS, ACCESS_AND_KNOWLEDGE]),
});

/** The domains of each top-level key a recipe's `toJSON()` emits, or omits at its default. */
export const RECIPE_FIELD_DOMAINS = Object.freeze({
  id: ALL_INVALIDATION_DOMAINS,
  // A recipe that MOVED changes which system every consumer must attribute it to.
  craftingSystemId: ALL_INVALIDATION_DOMAINS,
  name: Object.freeze([LABELLING]),
  img: Object.freeze([LABELLING]),
  category: Object.freeze([LABELLING]),
  tags: Object.freeze([LABELLING]),
  system: Object.freeze([LABELLING]),
  metadata: Object.freeze([LABELLING]),
  importSource: Object.freeze([LABELLING]),
  description: Object.freeze([NARRATIVE]),
  // The enabled cohort IS the alchemy signature report's input, and it decides browse status.
  enabled: Object.freeze([MATERIALS_AND_YIELD, ACCESS_AND_KNOWLEDGE]),
  complex: Object.freeze([MATERIALS_AND_YIELD]),
  steps: Object.freeze([MATERIALS_AND_YIELD]),
  ingredientSets: Object.freeze([MATERIALS_AND_YIELD]),
  resultGroups: Object.freeze([MATERIALS_AND_YIELD]),
  resultSelection: Object.freeze([MATERIALS_AND_YIELD]),
  isVariable: Object.freeze([MATERIALS_AND_YIELD]),
  outcomeRouting: Object.freeze([MATERIALS_AND_YIELD, RESOLUTION_CONFIG]),
  toolIds: Object.freeze([RESOLUTION_CONFIG]),
  timeRequirement: Object.freeze([RESOLUTION_CONFIG]),
  transferEffects: Object.freeze([RESOLUTION_CONFIG]),
  checkTierId: Object.freeze([RESOLUTION_CONFIG]),
  minSuccessOutcomeId: Object.freeze([RESOLUTION_CONFIG]),
  craftingModifier: Object.freeze([RESOLUTION_CONFIG]),
  currencyCost: Object.freeze([RESOLUTION_CONFIG]),
  allowPlayerResultReorder: Object.freeze([RESOLUTION_CONFIG]),
  locked: Object.freeze([ACCESS_AND_KNOWLEDGE]),
  visibility: Object.freeze([ACCESS_AND_KNOWLEDGE]),
  access: Object.freeze([ACCESS_AND_KNOWLEDGE]),
  recipeItemId: Object.freeze([ACCESS_AND_KNOWLEDGE]),
  linkedRecipeItemUuid: Object.freeze([ACCESS_AND_KNOWLEDGE]),
  // Classified whole as gate configuration (see `NARRATIVE`).
  teaser: Object.freeze([ACCESS_AND_KNOWLEDGE]),
});

/**
 * The domains of the changed top-level fields, in taxonomy order. An empty list (a real change no
 * field names) or an unclassified field resolves to every domain; `mirrors` maps alias keys.
 */
export function domainsForFields(fields, fieldDomains, mirrors = {}) {
  if (!Array.isArray(fields) || fields.length === 0) return [...ALL_INVALIDATION_DOMAINS];
  const found = new Set();
  for (const field of fields) {
    const classified = fieldDomains[mirrors[field] ?? field];
    if (!classified) return [...ALL_INVALIDATION_DOMAINS];
    for (const domain of classified) found.add(domain);
  }
  return INVALIDATION_DOMAIN_NAMES.filter((domain) => found.has(domain));
}

export function domainsForSystemFields(fields) {
  return domainsForFields(fields, SYSTEM_FIELD_DOMAINS, MIRRORED_SYSTEM_FIELDS);
}

export function domainsForRecipeFields(fields) {
  return domainsForFields(fields, RECIPE_FIELD_DOMAINS);
}
