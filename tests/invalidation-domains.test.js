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
  gathering: ['labelling', 'component-definitions', 'access-and-knowledge'],
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
