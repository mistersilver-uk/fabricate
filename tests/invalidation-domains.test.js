/**
 * The invalidation-domain taxonomy (issue 1078 part B1, under #1070).
 *
 * ## What this file is for, and what it deliberately does NOT assert
 *
 * `DOMAIN_CONSUMERS` is the one AUTHORED mapping and `STORE_DOMAINS` is its transpose, computed
 * at load time. Asserting the transpose here would be `f(x) === f(x)` — the test would apply the
 * same operation the module applies and could not fail. So the store expectations below are
 * written out LITERALLY, from the approved taxonomy table, and the derived constant's real
 * falsifier is the mounted shell test in `tests/components/fabricate-app-root-mounted.test.js`,
 * which compares it against the shell's actual subscription behaviour.
 *
 * ## The completeness gate runs in BOTH directions
 *
 * Only checking that every PRODUCED key is classified lets a phantom row survive forever; only
 * checking that every CLASSIFIED key is produced lets a new field fall silently to the
 * every-domain fail-safe, which is safe but is also the over-broad invalidation this issue
 * exists to remove. Both directions run against the real projections — `_normalizeSystem`'s
 * return keys and `Recipe#toJSON`'s emitted keys plus the ones it omits when they are default —
 * so neither can go stale against a hand-written list.
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { RECIPE_OMITTED_WHEN_DEFAULT } from '../src/models/Recipe.js';

import { installFoundryEnv } from './helpers/foundryEnv.js';

installFoundryEnv();

const { CraftingSystemManager } = await import('../src/systems/CraftingSystemManager.js');
const { RecipeManager } = await import('../src/systems/RecipeManager.js');
const { Recipe } = await import('../src/models/Recipe.js');
const { REVISION_SCOPES } = await import('../src/systems/revisionTokens.js');
const {
  ALL_INVALIDATION_DOMAINS,
  DOMAIN_CONSUMERS,
  domainsForFields,
  domainsForRecipeFields,
  domainsForSystemFields,
  INVALIDATION_DOMAIN_NAMES,
  INVALIDATION_DOMAINS,
  INVALIDATION_STORES,
  isInvalidationDomain,
  MIRRORED_SYSTEM_FIELDS,
  RECIPE_FIELD_DOMAINS,
  STORE_DOMAINS,
  SYSTEM_FIELD_DOMAINS,
} = await import('../src/systems/invalidationDomains.js');

/** The approved taxonomy's Consuming-stores column, restated rather than derived. */
const APPROVED_STORE_DOMAINS = {
  crafting: [
    'labelling',
    'narrative',
    'materials-and-yield',
    'resolution-config',
    'component-definitions',
    'access-and-knowledge',
    'held-inventory',
  ],
  inventory: [
    'labelling',
    'narrative',
    'materials-and-yield',
    'resolution-config',
    'component-definitions',
    'access-and-knowledge',
    'held-inventory',
  ],
  alchemy: [
    'labelling',
    'narrative',
    'materials-and-yield',
    'resolution-config',
    'component-definitions',
    'access-and-knowledge',
    'held-inventory',
  ],
  journal: [
    'labelling',
    'materials-and-yield',
    'resolution-config',
    'component-definitions',
    'access-and-knowledge',
    'held-inventory',
  ],
  // FIVE of seven. `materials-and-yield` and `resolution-config` are not there for anything the
  // gathering surfaces render: the listing runs the system-validity gate, which hides a whole
  // system's environments from non-GM viewers on a missing routed/progressive/alchemy check
  // formula or an alchemy signature collision. Excluding them left a GM authoring the fix while
  // every player's Gathering tab kept hiding the system — with a well-formed, correctly
  // attributed payload, so no fail-safe could catch it.
  gathering: [
    'labelling',
    'materials-and-yield',
    'resolution-config',
    'component-definitions',
    'access-and-knowledge',
  ],
};

/**
 * The APPROVED field classifications, restated field by field.
 *
 * These exist because the completeness gate below is PRESENCE-ONLY — it asserts that every
 * produced key is classified, that no row is a phantom, and that each row is a non-empty subset
 * of the seven. None of that looks at the VALUES, and the hole is not theoretical: rewriting
 * every row that is exactly `[RESOLUTION_CONFIG]` to `[NARRATIVE]` — 17 substitutions — left the
 * whole suite green, including the mounted shell, while a GM changing a crafting check silently
 * stopped rebuilding the run journal on every client. That is the correctness direction, and it
 * is the same defect class as a wrong row in the store table one layer up.
 *
 * So the values are restated here, literally, exactly as `APPROVED_STORE_DOMAINS` is. Deriving
 * the expectation from the shipped constant would make this assertion unfailable; the cost of a
 * literal is that a deliberate reclassification is a diff in two places, which is the point.
 */
const APPROVED_SYSTEM_FIELD_DOMAINS = {
  id: [...ALL_INVALIDATION_DOMAINS],
  name: ['labelling'],
  description: ['narrative'],
  enabled: ['access-and-knowledge'],
  resolutionMode: ['resolution-config'],
  features: ['materials-and-yield', 'resolution-config', 'access-and-knowledge'],
  itemTags: ['labelling'],
  tags: ['labelling'],
  categories: ['labelling'],
  componentCategories: ['labelling'],
  categoryIcons: ['labelling'],
  componentCategoryIcons: ['labelling'],
  visibilityMode: ['access-and-knowledge'],
  recipeVisibility: ['access-and-knowledge'],
  requirements: ['resolution-config'],
  essenceDefinitions: ['labelling', 'materials-and-yield', 'component-definitions'],
  recipeItemDefinitions: ['labelling', 'narrative', 'access-and-knowledge'],
  membershipResolvesByRecipeIds: ['access-and-knowledge'],
  craftingCheck: ['resolution-config'],
  salvageCraftingCheck: ['resolution-config'],
  gatheringCraftingCheck: ['resolution-config'],
  salvageResolutionMode: ['resolution-config'],
  toolBreakage: ['resolution-config'],
  alchemy: ['resolution-config'],
  teaserConfig: ['access-and-knowledge'],
  components: ['labelling', 'narrative', 'component-definitions'],
  tools: ['labelling', 'narrative', 'component-definitions', 'resolution-config'],
  gatheringRealmSettings: ['labelling', 'component-definitions', 'access-and-knowledge'],
};
const APPROVED_RECIPE_FIELD_DOMAINS = {
  id: [...ALL_INVALIDATION_DOMAINS],
  craftingSystemId: [...ALL_INVALIDATION_DOMAINS],
  name: ['labelling'],
  img: ['labelling'],
  category: ['labelling'],
  tags: ['labelling'],
  system: ['labelling'],
  metadata: ['labelling'],
  importSource: ['labelling'],
  description: ['narrative'],
  enabled: ['materials-and-yield', 'access-and-knowledge'],
  complex: ['materials-and-yield'],
  steps: ['materials-and-yield'],
  ingredientSets: ['materials-and-yield'],
  resultGroups: ['materials-and-yield'],
  resultSelection: ['materials-and-yield'],
  isVariable: ['materials-and-yield'],
  outcomeRouting: ['materials-and-yield', 'resolution-config'],
  toolIds: ['resolution-config'],
  timeRequirement: ['resolution-config'],
  transferEffects: ['resolution-config'],
  checkTierId: ['resolution-config'],
  minSuccessOutcomeId: ['resolution-config'],
  craftingModifier: ['resolution-config'],
  currencyCost: ['resolution-config'],
  allowPlayerResultReorder: ['resolution-config'],
  locked: ['access-and-knowledge'],
  visibility: ['access-and-knowledge'],
  access: ['access-and-knowledge'],
  recipeItemId: ['access-and-knowledge'],
  linkedRecipeItemUuid: ['access-and-knowledge'],
  teaser: ['access-and-knowledge'],
};

/** Every top-level key `_normalizeSystem` actually emits. */
function producedSystemKeys() {
  const manager = new CraftingSystemManager(new RecipeManager({}));
  return new Set(Object.keys(manager._normalizeSystem({})));
}

/**
 * Every top-level key a persisted recipe can carry: the ones `toJSON()` always emits, plus the
 * ones it omits when they hold the value the constructor rebuilds from absence.
 */
function producedRecipeKeys() {
  return new Set([
    ...Object.keys(new Recipe({}).toJSON()),
    ...Object.keys(RECIPE_OMITTED_WHEN_DEFAULT),
  ]);
}

describe('the invalidation-domain taxonomy is frozen and exhaustive', () => {
  it('names seven domains, uniquely, and refuses anything else', () => {
    assert.equal(INVALIDATION_DOMAIN_NAMES.length, 7);
    assert.equal(new Set(INVALIDATION_DOMAIN_NAMES).size, 7, 'no two domains share a name');
    assert.ok(Object.isFrozen(INVALIDATION_DOMAINS));
    assert.ok(Object.isFrozen(DOMAIN_CONSUMERS));
    for (const name of INVALIDATION_DOMAIN_NAMES) assert.ok(isInvalidationDomain(name));
    assert.ok(!isInvalidationDomain('presentation'), 'the layer name is NOT a fact class');
    assert.ok(!isInvalidationDomain('cost-and-yield'), 'the pre-split domain no longer exists');
  });

  it('gives every domain at least one consuming store, all of them real stores', () => {
    const stores = new Set(Object.values(INVALIDATION_STORES));
    for (const domain of INVALIDATION_DOMAIN_NAMES) {
      const consumers = DOMAIN_CONSUMERS[domain];
      assert.ok(Array.isArray(consumers) && consumers.length > 0, `${domain} names no consumer`);
      for (const store of consumers) {
        assert.ok(stores.has(store), `${domain} names an unknown store "${store}"`);
      }
    }
  });

  it('matches the approved Consuming-stores column, restated rather than transposed', () => {
    // Literal, deliberately. See the file header: deriving the expectation the same way the
    // module derives the constant would make this assertion unfailable.
    assert.deepEqual(
      Object.fromEntries(Object.entries(STORE_DOMAINS).map(([store, domains]) => [store, [...domains]])),
      APPROVED_STORE_DOMAINS
    );
  });

  it('excludes the JOURNAL from narrative, which is acceptance criterion 3 itself', () => {
    assert.ok(
      !DOMAIN_CONSUMERS[INVALIDATION_DOMAINS.NARRATIVE].includes(INVALIDATION_STORES.JOURNAL),
      'RunJournalBuilder reads no description anywhere and its three flavor fields are ' +
        'hardcoded empty literals, so a description-only edit must not rebuild the journal'
    );
    assert.ok(
      DOMAIN_CONSUMERS[INVALIDATION_DOMAINS.NARRATIVE].includes(INVALIDATION_STORES.INVENTORY),
      'and the inventory store IS a narrative consumer — the book detail blurb and the ' +
        'component detail prose — so the exclusion above is a decision, not an empty set'
    );
  });

  it('composes a fact scope that cannot collide with an entity scope', () => {
    assert.equal(REVISION_SCOPES.facts('narrative', 'sys-a'), 'facts:narrative:sys-a');
    assert.notEqual(REVISION_SCOPES.facts('recipes', 'sys-a'), REVISION_SCOPES.recipesOfSystem('sys-a'));
    assert.notEqual(REVISION_SCOPES.facts('system', 'sys-a'), REVISION_SCOPES.system('sys-a'));
  });
});

describe('the field -> domain completeness gate, in both directions', () => {
  it('classifies every key a persisted crafting SYSTEM actually carries', () => {
    const produced = producedSystemKeys();
    assert.ok(produced.size > 30, 'the premise: _normalizeSystem really did emit a full record');
    const unclassified = [...produced].filter(
      (key) => !SYSTEM_FIELD_DOMAINS[key] && !MIRRORED_SYSTEM_FIELDS[key]
    );
    assert.deepEqual(
      unclassified,
      [],
      'an unclassified key falls to the every-domain fail-safe, which is safe and is also the ' +
        'over-broad invalidation issue 1078 exists to remove'
    );
  });

  it('classifies no PHANTOM system key that no projection produces', () => {
    const produced = producedSystemKeys();
    const phantom = [...Object.keys(SYSTEM_FIELD_DOMAINS), ...Object.keys(MIRRORED_SYSTEM_FIELDS)]
      .filter((key) => !produced.has(key))
      .sort();
    assert.deepEqual(
      phantom,
      [],
      'a row for a field nothing emits survives forever and quietly documents a dependency ' +
        'that does not exist — a system-level `img` was exactly that'
    );
  });

  it('classifies every key a persisted RECIPE can carry, and no phantom', () => {
    const produced = producedRecipeKeys();
    assert.ok(produced.size > 25, 'the premise: the union really is the whole recipe shape');
    assert.deepEqual(
      [...produced].filter((key) => !RECIPE_FIELD_DOMAINS[key]).sort(),
      [],
      'every produced recipe key is classified'
    );
    assert.deepEqual(
      Object.keys(RECIPE_FIELD_DOMAINS)
        .filter((key) => !produced.has(key))
        .sort(),
      [],
      'and no classified recipe key is a phantom'
    );
  });

  it('classifies every SYSTEM field to exactly the approved domains', () => {
    assert.deepEqual(
      Object.fromEntries(
        Object.entries(SYSTEM_FIELD_DOMAINS).map(([field, domains]) => [field, [...domains]])
      ),
      APPROVED_SYSTEM_FIELD_DOMAINS
    );
  });

  it('classifies every RECIPE field to exactly the approved domains', () => {
    assert.deepEqual(
      Object.fromEntries(
        Object.entries(RECIPE_FIELD_DOMAINS).map(([field, domains]) => [field, [...domains]])
      ),
      APPROVED_RECIPE_FIELD_DOMAINS
    );
  });

  it('states the MIRRORED-field rule rather than five ad-hoc rows', () => {
    // `enableTags` / `enableEssences` / `enableCategories` / `enableMultiStepRecipes` are
    // transitional aliases of `features`, and `essences` of `essenceDefinitions`. A rule keeps a
    // sixth alias inheriting its host's classification instead of falling to the fail-safe.
    for (const [alias, host] of Object.entries(MIRRORED_SYSTEM_FIELDS)) {
      assert.ok(SYSTEM_FIELD_DOMAINS[host], `${alias} mirrors ${host}, which must be classified`);
      assert.deepEqual(
        domainsForSystemFields([alias]),
        domainsForSystemFields([host]),
        `${alias} must resolve to exactly ${host}'s domains`
      );
    }
  });

  it('gives every classified field a non-empty subset of the seven domains', () => {
    for (const [map, name] of [
      [SYSTEM_FIELD_DOMAINS, 'system'],
      [RECIPE_FIELD_DOMAINS, 'recipe'],
    ]) {
      for (const [field, domains] of Object.entries(map)) {
        assert.ok(domains.length > 0, `${name}.${field} is classified to nothing`);
        for (const domain of domains) {
          assert.ok(isInvalidationDomain(domain), `${name}.${field} names "${domain}"`);
        }
      }
    }
  });
});

describe('field attribution fails SAFE', () => {
  it('answers with every domain for a field it does not know', () => {
    assert.deepEqual(domainsForSystemFields(['name', 'somethingNobodyClassified']), [
      ...ALL_INVALIDATION_DOMAINS,
    ]);
    assert.deepEqual(domainsForRecipeFields(['inventedTomorrow']), [...ALL_INVALIDATION_DOMAINS]);
  });

  it('answers with every domain for an EMPTY or absent field list', () => {
    // `CorpusRecordDelta.fields` is empty when the change is real but not attributable to a
    // field, and its contract is that a consumer must treat that as "everything".
    assert.deepEqual(domainsForRecipeFields([]), [...ALL_INVALIDATION_DOMAINS]);
    assert.deepEqual(domainsForRecipeFields(undefined), [...ALL_INVALIDATION_DOMAINS]);
    assert.deepEqual(domainsForSystemFields(null), [...ALL_INVALIDATION_DOMAINS]);
  });

  it('narrows a known field, in taxonomy order and without duplicates', () => {
    assert.deepEqual(domainsForRecipeFields(['description']), ['narrative']);
    assert.deepEqual(domainsForRecipeFields(['name', 'img', 'category']), ['labelling']);
    assert.deepEqual(domainsForRecipeFields(['ingredientSets', 'name']), [
      'labelling',
      'materials-and-yield',
    ]);
    assert.deepEqual(domainsForSystemFields(['components']), [
      'labelling',
      'narrative',
      'component-definitions',
    ]);
  });

  it('keeps the DESCRIPTION-ONLY case out of every journal-consumed domain', () => {
    // The taxonomy's whole load-bearing claim, stated at the field level: the journal
    // subscribes to six domains and `narrative` is not one of them.
    const journalDomains = new Set(STORE_DOMAINS[INVALIDATION_STORES.JOURNAL]);
    for (const domain of domainsForRecipeFields(['description'])) {
      assert.ok(!journalDomains.has(domain), `a description edit named ${domain}`);
    }
    for (const domain of domainsForSystemFields(['description'])) {
      assert.ok(!journalDomains.has(domain), `a system description edit named ${domain}`);
    }
  });

  it('routes REALM prose to the gathering store rather than to narrative', () => {
    // The one carrier of authored prose `narrative` deliberately does not cover, and the
    // reason is routing rather than an oversight: a realm's `description` is rendered by
    // `EnvironmentCard.svelte` and `GatheringDetail.svelte`, and the `gathering` store does not
    // consume `narrative` — so filing it there would leave realm prose unable to reach the only
    // store that renders it. Pinned because the exception is stated in the canonical spec and a
    // prose-only claim rots silently.
    const gatheringDomains = new Set(STORE_DOMAINS[INVALIDATION_STORES.GATHERING]);
    // `gatheringRealms` left the crafting system in issue 1282 — the realm library is a
    // world setting, so it has no row here and `settingChangeBridge`'s travel leg announces
    // realm edits instead. `gatheringRealmSettings` stays: `{ enabled }` still lives here.
    for (const field of ['gatheringRealmSettings']) {
      const domains = domainsForSystemFields([field]);
      assert.ok(
        !domains.includes(INVALIDATION_DOMAINS.NARRATIVE),
        `${field} must not name narrative, which the gathering store does not consume`
      );
      assert.ok(
        domains.some((domain) => gatheringDomains.has(domain)),
        `${field} must reach the gathering store, which is the surface that renders its prose`
      );
    }
  });

  it('resolves through an explicit mirror map when one is supplied', () => {
    assert.deepEqual(
      domainsForFields(['alias'], { host: ['labelling'] }, { alias: 'host' }),
      ['labelling']
    );
    assert.deepEqual(domainsForFields(['alias'], { host: ['labelling'] }), [
      ...ALL_INVALIDATION_DOMAINS,
    ]);
  });
});
