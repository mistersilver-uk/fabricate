/**
 * Issue 1232 — the GM-facing Definition Storage Target, and the reverse conversion that
 * makes flipping it mean something.
 *
 * The two halves are one control and are tested as one. Five claims, each of which is a
 * data-loss door if it is wrong:
 *
 * 1. **Flipping the target to an arrangement this build cannot reach does not leave the
 *    world permanently refused by the Valid Id Basis gate.** Clause 2 refuses whenever
 *    `layout !== target`, so a target nothing can satisfy would omit every destructive
 *    startup pass on that world forever. The assertion is made against `readValidIdBasis`
 *    itself rather than against the settings values, because "the gate is satisfied" is the
 *    property that matters and re-deriving it here would prove only that this file can
 *    restate a comparison.
 * 2. **The reverse conversion round-trips.** Compared under the COMMITTED canonical form
 *    (`tests/helpers/canonicalizeDefinitionCorpus.js`, `CANONICAL_FORM_VERSION`), which is
 *    ADR 0001's domain-level equivalence criterion. See the caveat below for what that does
 *    and does not establish.
 * 3. **A downgrade after a reverse conversion loads the corpus normally**, demonstrated
 *    twice: reading the bytes back through an UNGUARDED settings adapter — which is what an
 *    older build is, with no arrangement guard, no layout awareness and only the legacy key
 *    — and then HYDRATING them through the real model, which is what that build actually
 *    does with them.
 *
 * ## Every canonical comparison passes `storedRecords`
 *
 * The canonical form (issue 1233) decides authored-versus-hydrate-minted identity by
 * PROVENANCE: an authored id is in the stored bytes and a minted one is not, and the two
 * share a shape so nothing else can tell them apart. Omitting `storedRecords` selects the
 * degraded `provenance: 'shape'` mode, which is v1's rule set and is NOT deterministic over
 * a corpus the load path mints for. Every comparison here therefore passes the bytes, one
 * asserts the `'stored'` stamp so a silent drop back to shape mode cannot pass, and a
 * non-vacuity control shows the two modes really do differ for this fixture.
 *
 * That control is only meaningful because the round-trip corpus carries a deliberately
 * LEGACY-SHAPED record ({@link legacyShapedRecipe}). Without it nothing in this file minted
 * at all and shape mode was accidentally deterministic — the fixture would have been
 * avoiding the one shape the reverse conversion most has to survive.
 * 4. **The re-creation escape is closed.** A client holding a stale settings adapter after a
 *    forward conversion cannot write `fabricate.recipes` back into existence, and the
 *    mirror — a stale per-record adapter after a reverse conversion — is closed too.
 * 5. **The localized strings exist**, asserted against `lang/en.json` rather than against a
 *    restatement of the keys, so the settings row cannot ship rendering raw key names.
 *
 * ## What claim 2 cannot yet assert
 *
 * The forward conversion is issue 1211's and does not exist in this build, so "forward then
 * reverse" is exercised by writing the per-record corpus through
 * `PerRecordCraftingDefinitionRepository#putAll` — which IS the operation a forward
 * conversion's step 2 performs, and is the only per-record writer this build has. When the
 * real forward conversion lands, this round trip should be re-pointed at it. That is stated
 * here rather than left implicit because the difference is real: this proves the two
 * ARRANGEMENTS hold the same corpus, and not that the forward conversion's own step 2 puts
 * it there correctly.
 */

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';

import {
  DEFINITION_STORAGE_LAYOUTS,
  DEFINITION_STORAGE_TARGETS,
  FABRICATE_SETTINGS_NAMESPACE,
  RECIPE_STORAGE_TARGET_CHOICES,
  SETTING_KEYS,
  registerFabricateSettings,
} from '../src/config/settings.js';
import {
  DefinitionStorageArrangementError,
  createArrangementWriteGuard,
} from '../src/systems/definitionStorageArrangement.js';
import {
  RECIPE_STORAGE_CONVERSIONS,
  recipeStorageConversionFor,
  reconcileRecipeStorageLayout,
  runReverseRecipeStorageConversion,
} from '../src/systems/definitionStorageConversion.js';
import {
  PerRecordCraftingDefinitionRepository,
  RECIPE_RECORD_KEY_PREFIX,
} from '../src/systems/PerRecordCraftingDefinitionRepository.js';
import { SettingsCraftingDefinitionRepository } from '../src/systems/SettingsCraftingDefinitionRepository.js';
import { readValidIdBasis } from '../src/systems/validIdBasis.js';

import {
  canonicalDefinitionCorpusJson,
  canonicalizeDefinitionCorpus,
} from './helpers/canonicalizeDefinitionCorpus.js';
import { installFoundryEnv } from './helpers/foundryEnv.js';
import { SettingHost } from './helpers/settingDocumentHost.js';

const env = installFoundryEnv();

/** `foundry.utils.randomID()`'s alphabet (base 36) and length. */
const ID_ALPHABET = 'abcdefghijklmnopqrstuvwxyz0123456789';

/**
 * A faithful stand-in for `foundry.utils.randomID()` — 16 characters of the same alphabet,
 * unpredictable per call — installed OVER `installFoundryEnv`'s sequential `rid-N` stub.
 *
 * The shared stub is looser than the thing it stands for in the two ways that matter here:
 * `rid-N` is not `CORE_ID_PATTERN`-shaped, so the canonical form's provenance rule would
 * never classify it as hydrate-minted, and it is sequential per process, so two hydrates of
 * the SAME stored bytes differ in a way no real world does. Either one alone would make the
 * hydrating downgrade assertion below pass or fail for a reason that has nothing to do with
 * this change. `tests/canonical-definition-corpus.test.js` refuses the same stub for the
 * same reason; drawing from the platform CSPRNG rather than `Math.random()` is SonarCloud
 * S2245.
 *
 * @returns {string}
 */
function mintCoreId() {
  const bytes = globalThis.crypto.getRandomValues(new Uint8Array(16));
  return Array.from(bytes, (byte) => ID_ALPHABET[byte % ID_ALPHABET.length]).join('');
}

globalThis.foundry.utils.randomID = mintCoreId;

const { RecipeManager } = await import('../src/systems/RecipeManager.js');
const { Recipe } = await import('../src/models/Recipe.js');

const { SINGLE_ARRAY, PER_RECORD, UNSETTLED } = DEFINITION_STORAGE_LAYOUTS;
const LAYOUT_KEY = SETTING_KEYS.RECIPE_STORAGE_LAYOUT;
const TARGET_KEY = SETTING_KEYS.RECIPE_STORAGE_TARGET;

const lang = JSON.parse(readFileSync(new URL('../lang/en.json', import.meta.url), 'utf8'));

/**
 * A world whose two storage settings and legacy recipe array are addressable, plus a
 * `Setting` document host for the per-record side.
 *
 * @param {object} [options]
 * @param {string} [options.layout]
 * @param {string} [options.target]
 * @param {object[]} [options.legacy] Records in the legacy whole-array key.
 * @param {object[]} [options.perRecord] Records written as per-record documents.
 */
async function world({ layout = SINGLE_ARRAY, target = SINGLE_ARRAY, legacy = [], records = [] }) {
  env.settings.clear();
  env.writes.length = 0;
  env.settings.set(LAYOUT_KEY, layout);
  env.settings.set(TARGET_KEY, target);
  env.settings.set(SETTING_KEYS.RECIPES, legacy);
  // Seeded so the Valid Id Basis assertions below turn on the STORAGE clauses. Left unset it
  // reads `null`, clause 3 refuses, and every basis assertion in this file would be true for
  // a reason that has nothing to do with the conversion.
  env.settings.set(SETTING_KEYS.MIGRATION_VERSION, '1.0.0');
  const host = new SettingHost();
  if (records.length > 0) {
    await new PerRecordCraftingDefinitionRepository({
      keyPrefix: RECIPE_RECORD_KEY_PREFIX,
      documentClass: () => host.documentClass,
      collection: () => host.collection,
    }).putAll(records);
    host.calls.length = 0;
  }
  const seams = {
    getSetting: (key) => env.settings.get(key),
    setSetting: async (key, value) => {
      env.settings.set(key, value);
      env.writes.push({ key, value });
      return value;
    },
    documentClass: () => host.documentClass,
    collection: () => host.collection,
  };
  return { host, seams, settingWrites: () => env.writes.map((write) => write.key) };
}

/** @param {string} id @param {object} [overrides] */
function recipe(id, overrides = {}) {
  return {
    id,
    name: `Recipe ${id}`,
    craftingSystemId: 'sys-1',
    ingredientSets: [],
    resultGroups: [{ id: `rg-${id}`, results: [{ id: `res-${id}`, itemUuid: 'Item.x', quantity: 1 }] }],
    ...overrides,
  };
}

/**
 * A record in the PRE-ingredient-groups shape: a flat `ingredients` array and an ingredient
 * set with no id of its own.
 *
 * In the round-trip fixture deliberately. It is the shape the reverse conversion most has to
 * survive — a world old enough to still be on the single-array layout is exactly a world
 * whose recipes were authored before ingredient groups existed — and it is the shape that
 * makes "a conversion carries stored bytes and does NOT hydrate through the model" testable.
 * `IngredientSet.js`'s PERMANENT INBOUND SHIM rewrites it on hydrate, minting an id per
 * group and one for the set, so a conversion that round-tripped records through
 * `Recipe.fromJSON`/`toJSON` would silently rewrite this record's identity; with only
 * post-groups records in the fixture, that mutation passes.
 *
 * @param {string} id
 */
function legacyShapedRecipe(id) {
  return {
    id,
    name: `Legacy ${id}`,
    craftingSystemId: 'sys-1',
    ingredientSets: [{ ingredients: [{ componentId: 'componentIron001', quantity: 2 }] }],
    resultGroups: [
      { id: `rg-${id}`, results: [{ id: `res-${id}`, componentId: 'componentSteel01', quantity: 1 }] },
    ],
  };
}

/** The recipe half of the Valid Id Basis, for a manager reporting `storage`. */
function recipeBasis(storage) {
  return readValidIdBasis({
    getSetting: (key) => env.settings.get(key),
    getHighestRegisteredMigrationVersion: () => '1.0.0',
    storage: { recipes: storage },
  }).recipes;
}

/** The definition `registerFabricateSettings` hands `game.settings.register` for one key. */
function registeredDefinition(key) {
  const registered = [];
  const previousGame = globalThis.game;
  globalThis.game = {
    settings: { register: (namespace, settingKey, definition) => registered.push({ settingKey, definition }) },
  };
  try {
    registerFabricateSettings();
  } finally {
    globalThis.game = previousGame;
  }
  return registered.find((entry) => entry.settingKey === key)?.definition ?? null;
}

/** Resolve a dotted localization key against `lang/en.json`. */
function localized(key) {
  return String(key)
    .split('.')
    .reduce((node, segment) => (node == null ? undefined : node[segment]), lang);
}

describe('the Definition Storage Target is the GM-facing control', () => {
  it('renders a config row with localized name, hint and choices', () => {
    const definition = registeredDefinition(TARGET_KEY);

    assert.equal(definition.config, true, 'the target is the supported pre-downgrade control');
    assert.equal(definition.scope, 'world');
    assert.equal(definition.default, SINGLE_ARRAY);
    assert.ok(Boolean(localized(definition.name)), `${definition.name} is missing from lang/en.json`);
    assert.ok(Boolean(localized(definition.hint)), `${definition.hint} is missing from lang/en.json`);
    assert.deepEqual(definition.choices, RECIPE_STORAGE_TARGET_CHOICES);
  });

  it('offers a localized label for every target value', () => {
    // A hand-maintained mirror of the target enumeration. A missing entry renders the raw
    // key in the dropdown and offers the GM no way back to that arrangement.
    for (const target of Object.values(DEFINITION_STORAGE_TARGETS)) {
      const key = RECIPE_STORAGE_TARGET_CHOICES[target];
      assert.ok(Boolean(key), `no choice label for the target "${target}"`);
      assert.ok(Boolean(localized(key)), `${key} is missing from lang/en.json`);
    }
  });

  it('leaves the LAYOUT unexposed, because it records observed state', () => {
    // A hand-set layout is indistinguishable from a real one: asserting `singleArray` over a
    // per-record corpus presents an empty world, and asserting `perRecord` over a legacy
    // corpus does the same in the other direction.
    assert.equal(registeredDefinition(LAYOUT_KEY).config, false);
  });

  it('localizes every message the reconcile can produce', () => {
    for (const name of ['Converted', 'ReclaimPending', 'Unavailable', 'Failed', 'Unsettled']) {
      const key = `FABRICATE.Settings.RecipeStorageTarget.${name}`;
      assert.ok(Boolean(localized(key)), `${key} is missing from lang/en.json`);
    }
  });
});

describe('a target no conversion can satisfy never leaves the world permanently gated', () => {
  it('reverts the target to the settled layout instead of stranding the gate', async () => {
    const { seams } = await world({ layout: SINGLE_ARRAY, target: PER_RECORD, legacy: [recipe('r1')] });

    const report = await reconcileRecipeStorageLayout(seams);

    assert.equal(report.action, 'target-reverted');
    assert.equal(env.settings.get(TARGET_KEY), SINGLE_ARRAY, 'the target is restored to the layout');
    assert.equal(env.settings.get(LAYOUT_KEY), SINGLE_ARRAY, 'nothing touched the layout');
    // The claim that matters: the gate is satisfied again, so every destructive startup pass
    // runs. Asserting the settings alone would restate the comparison rather than test it.
    assert.equal(
      recipeBasis({ granular: false, arrangement: SINGLE_ARRAY, layoutAtCorpusRead: SINGLE_ARRAY }),
      true
    );
  });

  it('leaves the gate refusing before the reconcile runs, so the revert is load-bearing', async () => {
    await world({ layout: SINGLE_ARRAY, target: PER_RECORD });

    assert.equal(
      recipeBasis({ granular: false, arrangement: SINGLE_ARRAY, layoutAtCorpusRead: SINGLE_ARRAY }),
      false,
      'clause 2 refuses while layout !== target; without the revert this state is permanent'
    );
  });

  it('reports an unsettled layout it cannot resume rather than writing an illegal target', async () => {
    // `unsettled` is not a legal target, so this one cannot be repaired by a settings write.
    // It is a genuinely half-converted corpus — reachable only by downgrading from a build
    // that ran a forward conversion — and the gate is right to keep refusing it.
    const { seams } = await world({ layout: UNSETTLED, target: PER_RECORD });

    const report = await reconcileRecipeStorageLayout(seams);

    assert.equal(report.action, 'unsettled-unresolvable');
    assert.equal(env.settings.get(TARGET_KEY), PER_RECORD, 'no illegal target is laundered in');
    assert.deepEqual(env.writes, [], 'nothing is written at all');
  });

  it('declares the reachable transitions rather than deriving them from the target values', () => {
    // Derived availability would silently start claiming a forward conversion the moment a
    // value was added to the target enumeration. Issue 1211 adds rows here; until it does,
    // the forward direction is honestly absent.
    assert.equal(recipeStorageConversionFor(PER_RECORD, SINGLE_ARRAY), runReverseRecipeStorageConversion);
    assert.equal(recipeStorageConversionFor(UNSETTLED, SINGLE_ARRAY), runReverseRecipeStorageConversion);
    assert.equal(recipeStorageConversionFor(SINGLE_ARRAY, PER_RECORD), null);
    assert.equal(recipeStorageConversionFor(UNSETTLED, PER_RECORD), null);
    assert.deepEqual(
      RECIPE_STORAGE_CONVERSIONS.map((entry) => `${entry.from}->${entry.to}`),
      ['perRecord->singleArray', 'unsettled->singleArray']
    );
  });
});

describe('the reverse conversion moves the corpus back into the legacy key', () => {
  const corpus = [
    recipe('r2'),
    recipe('r1'),
    recipe('r3', { craftingSystemId: 'sys-2' }),
    legacyShapedRecipe('r4'),
  ];

  it('round-trips the corpus under the committed canonical form', async () => {
    const { seams } = await world({ layout: PER_RECORD, target: SINGLE_ARRAY, records: corpus });

    const report = await reconcileRecipeStorageLayout(seams);

    assert.equal(report.action, 'converted');
    assert.equal(report.records, corpus.length);
    // `storedRecords` is what selects the DETERMINISTIC form. Without it the comparison runs
    // in the degraded `provenance: 'shape'` mode, which is v1's rule set and is not
    // deterministic over a corpus the load path mints ids for — see #1233. Both sides are
    // handed the same stored bytes because that is what they are: the conversion carries
    // record values verbatim between arrangements, so any string NOT in `corpus` appearing on
    // either side is an id the conversion invented, and it is renumbered on one side only.
    const form = { storedRecords: corpus };
    assert.equal(
      canonicalizeDefinitionCorpus(env.settings.get(SETTING_KEYS.RECIPES), form).provenance,
      'stored',
      'the stamp is the first JSON field precisely so a silent drop to shape mode cannot pass'
    );
    assert.equal(
      canonicalDefinitionCorpusJson(env.settings.get(SETTING_KEYS.RECIPES), form),
      canonicalDefinitionCorpusJson(corpus, form),
      'domain-level equivalence under CANONICAL_FORM_VERSION, ADR 0001’s criterion'
    );
  });

  it('preserves every record id and every internal reference', async () => {
    // The structural half, stated separately because the canonical comparison above would
    // also pass on a corpus that lost a record if the ORIGINAL had lost it too.
    const { seams } = await world({ layout: PER_RECORD, target: SINGLE_ARRAY, records: corpus });

    await reconcileRecipeStorageLayout(seams);

    const written = env.settings.get(SETTING_KEYS.RECIPES);
    assert.equal(written.length, corpus.length);
    assert.deepEqual(
      written.map((record) => record.id).sort(),
      corpus.map((record) => record.id).sort()
    );
    for (const record of written) {
      const before = corpus.find((candidate) => candidate.id === record.id);
      assert.deepEqual(record.resultGroups, before.resultGroups, 'nested references survive');
      assert.equal(record.craftingSystemId, before.craftingSystemId);
    }
  });

  it('runs the four steps in order and reclaims the per-record envelopes last', async () => {
    const { host, seams } = await world({ layout: PER_RECORD, target: SINGLE_ARRAY, records: corpus });

    await reconcileRecipeStorageLayout(seams);

    assert.deepEqual(
      env.writes.map((write) => `${write.key}=${Array.isArray(write.value) ? write.value.length : write.value}`),
      [
        `${LAYOUT_KEY}=unsettled`,
        `${SETTING_KEYS.RECIPES}=${corpus.length}`,
        `${LAYOUT_KEY}=singleArray`,
      ],
      'layout unsettled, then the array, then the layout — the document delete comes after'
    );
    assert.deepEqual(host.legs, ['delete'], 'step 4 is the only document operation');
    assert.equal(host.collection.documents.size, 0, 'every per-record envelope is reclaimed');
  });

  it('refuses rather than writing an empty array over a surviving legacy corpus', async () => {
    // The layout claims `perRecord` and there are no record documents, but the legacy key
    // still holds recipes. Step 2 would replace them with `[]`. Inferring the true layout
    // from which key holds data is forbidden, so refusing is the only non-destructive answer.
    const { seams } = await world({ layout: PER_RECORD, target: SINGLE_ARRAY, legacy: corpus });

    const report = await reconcileRecipeStorageLayout(seams);

    assert.equal(report.action, 'failed');
    assert.match(report.error.message, /does not describe this world's storage/);
    assert.equal(env.settings.get(SETTING_KEYS.RECIPES).length, corpus.length, 'the corpus survives');
  });

  it('compensates BOTH keys when a step fails, restoring the layout VALUE', async () => {
    // The forward conversion compensates by DELETING the layout document, because a
    // never-converted world has none. That inverts here: a reverse runs only on a world whose
    // layout already reads `perRecord`, so the document exists and its value is restored.
    // Deleting it would fabricate a `singleArray` layout over a per-record corpus.
    const { seams } = await world({ layout: PER_RECORD, target: SINGLE_ARRAY, records: corpus });
    const failing = {
      ...seams,
      setSetting: async (key, value) => {
        if (key === SETTING_KEYS.RECIPES) throw new Error('socket closed');
        return seams.setSetting(key, value);
      },
    };

    const report = await reconcileRecipeStorageLayout(failing);

    assert.equal(report.action, 'failed');
    assert.equal(env.settings.get(LAYOUT_KEY), PER_RECORD, 'the layout value is restored');
    assert.equal(env.settings.get(TARGET_KEY), PER_RECORD, 'and the target follows it');
    assert.equal(
      recipeBasis({ granular: true, arrangement: PER_RECORD, layoutAtCorpusRead: PER_RECORD }),
      true,
      'a failed conversion is retryable, not a permanently gated world'
    );
  });

  it('retries an unfinished envelope reclamation on a later settled boot', async () => {
    // Step 4 sits OUTSIDE the transaction, so its failure completes forward. Without a retry
    // the envelopes leak forever with no detector.
    const { host, seams } = await world({ layout: SINGLE_ARRAY, target: SINGLE_ARRAY, legacy: corpus, records: corpus });

    const report = await reconcileRecipeStorageLayout(seams);

    assert.equal(report.action, 'settled');
    assert.equal(report.reclaimed, corpus.length);
    assert.equal(host.collection.documents.size, 0);
  });
});

describe('a downgrade after a reverse conversion loads the corpus normally', () => {
  const corpus = [recipe('r1'), recipe('r2'), legacyShapedRecipe('r3')];

  /**
   * What an older build IS: a settings adapter with no arrangement guard, no layout read, and
   * no knowledge that the per-record backend ever existed.
   *
   * @param {(raw: object) => object} [hydrate]
   */
  function olderBuildRepository(hydrate = (raw) => raw) {
    return new SettingsCraftingDefinitionRepository({
      settingKey: SETTING_KEYS.RECIPES,
      corpus: () => new Map(),
      hydrate,
      getSetting: (key) => env.settings.get(key) ?? [],
      setSetting: async () => {},
    });
  }

  it('is read in full by a build with no layout awareness at all', async () => {
    const { seams } = await world({ layout: PER_RECORD, target: SINGLE_ARRAY, records: corpus });
    await reconcileRecipeStorageLayout(seams);

    const loaded = await olderBuildRepository().loadAll();
    assert.equal(loaded.length, corpus.length);
    assert.equal(
      canonicalDefinitionCorpusJson(loaded, { storedRecords: corpus }),
      canonicalDefinitionCorpusJson(corpus, { storedRecords: corpus })
    );
  });

  it('hydrates through the model to the same corpus the per-record bytes hydrate to', async () => {
    // The claim above compares STORED BYTES, which is only half of "loads normally": a real
    // older build runs `Recipe.fromJSON` over them. That matters because the legacy-shaped
    // record in this corpus MINTS on hydrate — `IngredientSet.js`'s permanent inbound shim
    // gives the flat `ingredients` array a group id and the set an id, from
    // `foundry.utils.randomID()` — so the two sides below carry DIFFERENT random values at
    // the same structural positions and are equal only under the provenance rule.
    const { host, seams } = await world({ layout: PER_RECORD, target: SINGLE_ARRAY, records: corpus });
    const beforeConversion = [...host.collection.documents.values()]
      .map((document) => Recipe.fromJSON(document.value).toJSON())
      .sort((left, right) => (left.id < right.id ? -1 : 1));

    await reconcileRecipeStorageLayout(seams);

    const afterDowngrade = (await olderBuildRepository((raw) => Recipe.fromJSON(raw)).loadAll())
      .map((record) => record.toJSON())
      .sort((left, right) => (left.id < right.id ? -1 : 1));

    const form = { storedRecords: corpus };
    assert.equal(
      canonicalDefinitionCorpusJson(afterDowngrade, form),
      canonicalDefinitionCorpusJson(beforeConversion, form),
      'the same domain corpus, hydrated from the two arrangements'
    );
  });

  it('would compare two random values without the stored bytes, so the form is load-bearing', async () => {
    // The non-vacuity control for the assertion above. In the degraded `provenance: 'shape'`
    // mode a hydrate-minted `randomID()` is indistinguishable from an authored id, so the two
    // loads differ on ids no world ever persisted. This is what threading `storedRecords`
    // buys, demonstrated rather than asserted.
    const { host } = await world({ layout: PER_RECORD, target: SINGLE_ARRAY, records: corpus });
    const stored = [...host.collection.documents.values()].map((document) => document.value);
    const first = stored.map((raw) => Recipe.fromJSON(raw).toJSON());
    const second = stored.map((raw) => Recipe.fromJSON(raw).toJSON());

    assert.notEqual(
      canonicalDefinitionCorpusJson(first),
      canonicalDefinitionCorpusJson(second),
      'shape mode is NOT deterministic over this corpus; the fixture really does mint'
    );
    assert.equal(
      canonicalDefinitionCorpusJson(first, { storedRecords: corpus }),
      canonicalDefinitionCorpusJson(second, { storedRecords: corpus }),
      'provenance mode is'
    );
  });

  it('is what the pre-reverse world would NOT have given it', async () => {
    // The failure this mitigates: after a forward conversion the legacy document is gone and
    // `ClientSettings#get` serves the registered `[]` default — no throw, no warning,
    // indistinguishable from a genuinely empty world.
    await world({ layout: PER_RECORD, target: PER_RECORD, records: [recipe('r1')] });
    env.settings.delete(SETTING_KEYS.RECIPES);
    const older = new SettingsCraftingDefinitionRepository({
      settingKey: SETTING_KEYS.RECIPES,
      corpus: () => new Map(),
      getSetting: (key) => env.settings.get(key) ?? [],
      setSetting: async () => {},
    });

    assert.deepEqual(await older.loadAll(), [], 'silently empty — the cliff the reverse removes');
  });
});

describe('the re-creation escape is closed', () => {
  it('refuses a whole-corpus write once the layout has moved to per-record', async () => {
    await world({ layout: SINGLE_ARRAY, target: SINGLE_ARRAY, legacy: [recipe('r1')] });
    const manager = new RecipeManager();
    await manager.initialize();
    assert.equal(manager.getRecipes().length, 1);
    // Another client's forward conversion completes: the layout flips and the legacy
    // document is deleted. Nothing rebuilds THIS client's repository.
    env.settings.set(LAYOUT_KEY, PER_RECORD);
    env.settings.set(TARGET_KEY, PER_RECORD);
    env.settings.delete(SETTING_KEYS.RECIPES);
    env.writes.length = 0;

    await assert.rejects(() => manager.save(), DefinitionStorageArrangementError);
    assert.deepEqual(
      env.writes.filter((write) => write.key === SETTING_KEYS.RECIPES),
      [],
      'ClientSettings#setWorld would have taken its CREATE branch and re-minted the legacy key'
    );
    assert.equal(env.settings.has(SETTING_KEYS.RECIPES), false);
  });

  it('closes the mirror: a stale per-record adapter cannot re-mint record documents', async () => {
    const host = new SettingHost();
    let layout = PER_RECORD;
    const repository = new PerRecordCraftingDefinitionRepository({
      keyPrefix: RECIPE_RECORD_KEY_PREFIX,
      documentClass: () => host.documentClass,
      collection: () => host.collection,
      assertWritable: createArrangementWriteGuard({
        arrangement: PER_RECORD,
        readLayout: () => layout,
      }),
    });
    await repository.put(recipe('r1'));
    assert.equal(host.collection.documents.size, 1);

    layout = SINGLE_ARRAY;

    await assert.rejects(() => repository.put(recipe('r2')), DefinitionStorageArrangementError);
    assert.equal(host.collection.documents.size, 1, 'the reclaimed envelopes stay reclaimed');
  });

  it('does not refuse on an unreadable layout, which is how every fixture keeps writing', () => {
    // The hazard is a layout that MOVED, which is by definition readable. Refusing on an
    // unreadable one would brick every manager built with no `game` at all.
    for (const layout of [null, undefined, '', 'nonsense']) {
      assert.doesNotThrow(
        createArrangementWriteGuard({ arrangement: SINGLE_ARRAY, readLayout: () => layout })
      );
    }
    assert.doesNotThrow(createArrangementWriteGuard({ arrangement: null, readLayout: () => PER_RECORD }));
  });
});

describe('a client recovers from a completed conversion without reloading', () => {
  it('rebuilds its repository and re-reads the corpus once the layout and target agree', async () => {
    const corpus = [recipe('r1'), recipe('r2')];
    const { host } = await world({ layout: SINGLE_ARRAY, target: SINGLE_ARRAY, legacy: corpus });
    const manager = new RecipeManager();
    await manager.initialize();
    assert.equal(manager.describeDefinitionStorage().arrangement, SINGLE_ARRAY);

    // A forward conversion completes elsewhere: the records are now documents and the legacy
    // key is gone. `PerRecordCraftingDefinitionRepository` resolves its collection from the
    // globals, so the host is installed there for this leg.
    await new PerRecordCraftingDefinitionRepository({
      keyPrefix: RECIPE_RECORD_KEY_PREFIX,
      documentClass: () => host.documentClass,
      collection: () => host.collection,
    }).putAll(corpus);
    env.settings.delete(SETTING_KEYS.RECIPES);
    env.settings.set(LAYOUT_KEY, PER_RECORD);
    env.settings.set(TARGET_KEY, PER_RECORD);
    const previousSetting = globalThis.Setting;
    globalThis.Setting = { implementation: host.documentClass };
    globalThis.game.settings.storage = { get: () => host.collection };
    try {
      assert.equal(await manager.rebuildDefinitionStorage(), true);
    } finally {
      globalThis.Setting = previousSetting;
      delete globalThis.game.settings.storage;
    }

    assert.equal(manager.describeDefinitionStorage().arrangement, PER_RECORD);
    assert.equal(manager.describeDefinitionStorage().granular, true);
    assert.equal(manager.describeDefinitionStorage().layoutAtCorpusRead, PER_RECORD);
    assert.deepEqual(
      manager.getRecipes().map((record) => record.id).sort(),
      ['r1', 'r2']
    );
  });

  it('declines to rebuild mid-conversion, when the layout and target disagree', async () => {
    await world({ layout: UNSETTLED, target: PER_RECORD, legacy: [recipe('r1')] });
    const manager = new RecipeManager();

    assert.equal(await manager.rebuildDefinitionStorage(), false);
    assert.equal(
      manager.describeDefinitionStorage().arrangement,
      PER_RECORD,
      'the arrangement it was BUILT for is untouched; its writes stay refused until the flip'
    );
  });

  it('never replaces an INJECTED repository', async () => {
    await world({ layout: PER_RECORD, target: PER_RECORD });
    const injected = new SettingsCraftingDefinitionRepository({
      settingKey: SETTING_KEYS.RECIPES,
      corpus: () => new Map(),
      getSetting: () => [],
      setSetting: async () => {},
    });
    const manager = new RecipeManager({ repository: injected });

    assert.equal(await manager.rebuildDefinitionStorage(), false);
    assert.equal(manager._repository, injected);
    assert.equal(manager.describeDefinitionStorage().arrangement, null);
  });
});

describe('the two storage keys are the only ones this control touches', () => {
  it('uses the fully-qualified prefix the bridge routes on', () => {
    // Narrative, and the reason the record prefix keeps its trailing separator: `recipe`
    // without it also prefix-matches both storage keys.
    assert.ok(`${FABRICATE_SETTINGS_NAMESPACE}.${TARGET_KEY}`.startsWith('fabricate.recipe'));
    assert.ok(
      !`${FABRICATE_SETTINGS_NAMESPACE}.${TARGET_KEY}`.startsWith(
        `${FABRICATE_SETTINGS_NAMESPACE}.${RECIPE_RECORD_KEY_PREFIX}`
      )
    );
  });
});
