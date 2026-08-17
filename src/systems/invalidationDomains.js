/**
 * @module invalidationDomains
 *
 * The **invalidation-domain taxonomy** (issue 1078 part B1, under #1070).
 *
 * A crafting-data change used to reach the player window as one zero-argument signal, and the
 * shell answered it by reloading all five shared stores. This module names the seven classes
 * of FACT a change can belong to, and — once, in one authored table — which read-model stores
 * depend on each. Everything else about routing is derived from that table mechanically.
 *
 * ## The three vocabularies this must not be confused with
 *
 * 1. **The DDD bounded context.** `DOMAIN.md` uses "domain" for the ubiquitous language of the
 *    whole crafting model. An invalidation domain is far narrower: it is a class of fact, and
 *    it exists only to decide what to rebuild.
 * 2. **`revisionTokens`' entity scope.** That module used to call `recipes` / `systems` "the
 *    domain scope"; it is now "the entity scope", precisely so this file can own the word.
 *    An invalidation domain composes into a token scope through
 *    {@link module:revisionTokens.REVISION_SCOPES}`.facts(factClass, systemId)`.
 * 3. **The presentation LAYER.** `presentation` is established across the specs and ~37 code
 *    sites as a layer ("Pure presentation helper", "the panel is presentational"), so the fact
 *    class that covers names, images and categories is called `labelling` instead.
 *
 * ## Exactly one authored mapping
 *
 * {@link DOMAIN_CONSUMERS} is authored. {@link STORE_DOMAINS} is its transpose, computed here
 * at load time and never written by hand — a store's subscription set is *defined* as
 * `{ d | d names that store in DOMAIN_CONSUMERS }`. Authoring both would let them drift, and a
 * freeze test comparing two hand-written tables asserts nothing a reader could not see. The
 * falsifiable assertion is the derived constant against the shell's ACTUAL subscription
 * behaviour, which `tests/components/fabricate-app-root-mounted.test.js` makes mounted.
 *
 * ## The failure direction is deliberate
 *
 * A field this file does not classify resolves to EVERY domain, and an unattributable change
 * routes to every store. Over-broad invalidation is a performance bug; a stale read model is a
 * correctness one. Every widening here is therefore silent and safe, and every NARROWING has
 * to be authored — which is what the completeness gate in
 * `tests/invalidation-domains.test.js` exists to keep honest in both directions.
 */

/**
 * The seven invalidation domains.
 *
 * Frozen and exhaustive: an eighth requires a row in {@link DOMAIN_CONSUMERS}, a row in the
 * canonical `data-models` spec, and a decision about every store — which is the review gate
 * this enum exists to force.
 *
 * @type {Readonly<Record<string, string>>}
 */
export const INVALIDATION_DOMAINS = Object.freeze({
  /** Names, images, categories, tags and sort keys. */
  LABELLING: 'labelling',
  /** ALL authored prose — recipe, step, system, component, tool and recipe-item descriptions. */
  NARRATIVE: 'narrative',
  /** Ingredient sets and groups, set essences, results, steps. */
  MATERIALS_AND_YIELD: 'materials-and-yield',
  /** Tools, currency, checks, resolution modes, modifiers and requirements. */
  RESOLUTION_CONFIG: 'resolution-config',
  /** Component, tool and essence definitions. */
  COMPONENT_DEFINITIONS: 'component-definitions',
  /** Teasers, recipe-item definitions, learned and discovery state. */
  ACCESS_AND_KNOWLEDGE: 'access-and-knowledge',
  /** Actor-held items. */
  HELD_INVENTORY: 'held-inventory',
});

/**
 * Every domain name, in taxonomy order.
 *
 * @type {readonly string[]}
 */
export const INVALIDATION_DOMAIN_NAMES = Object.freeze(Object.values(INVALIDATION_DOMAINS));

const DOMAIN_NAME_SET = new Set(INVALIDATION_DOMAIN_NAMES);

/**
 * Whether a value names a domain in this taxonomy.
 *
 * @param {*} name
 * @returns {boolean}
 */
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
 * **The one authored mapping**: which stores consume each domain.
 *
 * `journal`'s absence from `narrative` is the single routing decision this taxonomy exists to
 * make observable — `RunJournalBuilder` reads no description anywhere and its three `flavor`
 * fields are hardcoded empty literals — and it is acceptance criterion 3 of issue 1078.
 *
 * `gathering` consumes only three domains because the gathering listing reads a system's name,
 * its tool and component definitions, and its access configuration, and nothing else this
 * taxonomy classifies.
 *
 * @type {Readonly<Record<string, readonly string[]>>}
 */
export const DOMAIN_CONSUMERS = Object.freeze({
  [LABELLING]: Object.freeze([CRAFTING, INVENTORY, ALCHEMY, JOURNAL, GATHERING]),
  [NARRATIVE]: Object.freeze([CRAFTING, INVENTORY, ALCHEMY]),
  [MATERIALS_AND_YIELD]: Object.freeze([CRAFTING, INVENTORY, ALCHEMY, JOURNAL]),
  [RESOLUTION_CONFIG]: Object.freeze([CRAFTING, INVENTORY, ALCHEMY, JOURNAL]),
  [COMPONENT_DEFINITIONS]: Object.freeze([CRAFTING, INVENTORY, ALCHEMY, JOURNAL, GATHERING]),
  [ACCESS_AND_KNOWLEDGE]: Object.freeze([CRAFTING, INVENTORY, ALCHEMY, JOURNAL, GATHERING]),
  [HELD_INVENTORY]: Object.freeze([CRAFTING, INVENTORY, ALCHEMY, JOURNAL]),
});

/**
 * The transpose of {@link DOMAIN_CONSUMERS}: which domains each store subscribes to.
 *
 * DERIVED, never authored. Consumers route from this.
 *
 * @type {Readonly<Record<string, readonly string[]>>}
 */
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

/**
 * A field whose class this file does not name resolves to EVERYTHING — see the module header.
 *
 * @type {readonly string[]}
 */
export const ALL_INVALIDATION_DOMAINS = INVALIDATION_DOMAIN_NAMES;

/**
 * Facts a `features`-style boolean mirror carries.
 *
 * `_normalizeSystem` emits `enableTags` / `enableEssences` / `enableCategories` /
 * `enableMultiStepRecipes` as transitional aliases of `features`, and `essences` as an alias of
 * `essenceDefinitions`. They are classified by the RULE below rather than by five ad-hoc rows,
 * so a sixth alias inherits its host's classification instead of silently falling to the
 * fail-safe.
 *
 * @type {Readonly<Record<string, string>>}
 */
export const MIRRORED_SYSTEM_FIELDS = Object.freeze({
  enableTags: 'features',
  enableEssences: 'features',
  enableCategories: 'features',
  enableMultiStepRecipes: 'features',
  essences: 'essenceDefinitions',
});

/**
 * Which domains each top-level key of a PERSISTED crafting system belongs to.
 *
 * Read on the replication path, where `corpusDelta` names the differing top-level keys of the
 * projected record and nothing finer is available. The projection for a system is the identity,
 * so these are exactly `_normalizeSystem`'s return keys.
 *
 * @type {Readonly<Record<string, readonly string[]>>}
 */
export const SYSTEM_FIELD_DOMAINS = Object.freeze({
  // Identity. Unreachable for a `changed` record (the delta pairs BY id) and present on every
  // added or removed one, where the whole record is the change.
  id: ALL_INVALIDATION_DOMAINS,
  name: Object.freeze([LABELLING]),
  description: Object.freeze([NARRATIVE]),
  // A disabled system hides every recipe it owns from every non-GM surface.
  enabled: Object.freeze([ACCESS_AND_KNOWLEDGE]),
  resolutionMode: Object.freeze([RESOLUTION_CONFIG]),
  // `features` gates essences (materials), multi-step structure (resolution) and the journal's
  // multi-step reading (access) all at once, so it is deliberately the widest system row.
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
  // An essence definition carries a name and an icon (labelling), participates in every
  // ingredient-set essence total (materials) and is itself a definition.
  essenceDefinitions: Object.freeze([LABELLING, MATERIALS_AND_YIELD, COMPONENT_DEFINITIONS]),
  // A recipe item is a book or scroll: its prose is narrative, its title is labelling, and its
  // membership decides what a player may learn.
  recipeItemDefinitions: Object.freeze([LABELLING, NARRATIVE, ACCESS_AND_KNOWLEDGE]),
  membershipResolvesByRecipeIds: Object.freeze([ACCESS_AND_KNOWLEDGE]),
  modifiers: Object.freeze([RESOLUTION_CONFIG]),
  craftingCheck: Object.freeze([RESOLUTION_CONFIG]),
  salvageCraftingCheck: Object.freeze([RESOLUTION_CONFIG]),
  gatheringCraftingCheck: Object.freeze([RESOLUTION_CONFIG]),
  salvageResolutionMode: Object.freeze([RESOLUTION_CONFIG]),
  toolBreakage: Object.freeze([RESOLUTION_CONFIG]),
  alchemy: Object.freeze([RESOLUTION_CONFIG]),
  teaserConfig: Object.freeze([NARRATIVE, ACCESS_AND_KNOWLEDGE]),
  // A component's name is labelling and its prose narrative, but the ARRAY cannot say which
  // moved, so a component rewrite carries all three of the classes a component can express.
  components: Object.freeze([LABELLING, NARRATIVE, COMPONENT_DEFINITIONS]),
  tools: Object.freeze([LABELLING, NARRATIVE, COMPONENT_DEFINITIONS, RESOLUTION_CONFIG]),
  characterPrerequisites: Object.freeze([LABELLING, ACCESS_AND_KNOWLEDGE]),
  // Gathering geography and its behaviour settings. Classified across the three domains the
  // gathering store subscribes to, because the listing reads realm names, realm-gated task
  // availability and the tools a realm offers.
  gatheringRealms: Object.freeze([LABELLING, COMPONENT_DEFINITIONS, ACCESS_AND_KNOWLEDGE]),
  gatheringRealmSettings: Object.freeze([LABELLING, COMPONENT_DEFINITIONS, ACCESS_AND_KNOWLEDGE]),
});

/**
 * Which domains each top-level key of a PERSISTED recipe belongs to.
 *
 * The projection for a recipe is `toJSON()`, so these are exactly its emitted keys plus the
 * ones `RECIPE_OMITTED_WHEN_DEFAULT` drops when they carry their default.
 *
 * @type {Readonly<Record<string, readonly string[]>>}
 */
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
  teaser: Object.freeze([NARRATIVE, ACCESS_AND_KNOWLEDGE]),
});

/**
 * The domains a set of changed top-level field names belongs to.
 *
 * An EMPTY field list means "the change is real but not attributable to a field" — the contract
 * `CorpusRecordDelta.fields` states for a projection that is not a plain object — and is
 * answered with every domain, never with none. So is any field the map does not name.
 *
 * @param {readonly string[]|undefined|null} fields
 * @param {Readonly<Record<string, readonly string[]>>} fieldDomains
 * @param {Readonly<Record<string, string>>} [mirrors] Alias key -> the key it mirrors.
 * @returns {string[]} Domain names, in taxonomy order.
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

/**
 * {@link domainsForFields} for a crafting-system record.
 *
 * @param {readonly string[]|undefined|null} fields
 * @returns {string[]}
 */
export function domainsForSystemFields(fields) {
  return domainsForFields(fields, SYSTEM_FIELD_DOMAINS, MIRRORED_SYSTEM_FIELDS);
}

/**
 * {@link domainsForFields} for a recipe record.
 *
 * @param {readonly string[]|undefined|null} fields
 * @returns {string[]}
 */
export function domainsForRecipeFields(fields) {
  return domainsForFields(fields, RECIPE_FIELD_DOMAINS);
}
