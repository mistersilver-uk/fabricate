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
 * 6. **The boot reconcile runs before the backend is selected.** `src/main.js` cannot be
 *    imported under `node --test`, so the ORDER is pinned as source the way this repo
 *    already pins its other `initialize()` positions, and the failure that ordering prevents
 *    is reproduced separately against the real reconciler and the real manager.
 *
 * ## What claim 2 does and does not assert, now that the forward conversion exists
 *
 * The reverse round trip below still seeds its per-record side with
 * `PerRecordCraftingDefinitionRepository#putAll` rather than with the real forward
 * conversion, and that is deliberate rather than stale: this file's subject is the REVERSE
 * direction, and seeding through the forward conversion would make every failure here
 * ambiguous between the two. Issue 1211's own suite
 * (`tests/definition-storage-forward-conversion.test.js`) drives the forward direction end
 * to end against the same canonical form, including the byte-equivalence assertion this
 * file's round trip is the mirror of.
 *
 * ## What issue 1211 changed in this file
 *
 * The forward rows completed the conversion table, so `target-reverted` and
 * `unsettled-unresolvable` became unreachable FOR RECIPES: every pair of a recognised layout
 * and a legal target with `layout !== target` now has a conversion. The two cases that
 * asserted those dispositions assert the conversion instead, and a new case pins the
 * totality itself — which is the property that decides whether a world can be permanently
 * gated, and the one that reverts if a row is ever removed.
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
  runForwardRecipeStorageConversion,
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
import { mainMethodSource, MAIN_SOURCE } from './helpers/fabricateFacadeHarness.js';
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
 * In both fixture corpora deliberately. It is the shape the reverse conversion most has to
 * survive — a world old enough to still be on the single-array layout is exactly a world
 * whose recipes were authored before ingredient groups existed — and it is load-bearing in
 * two distinct ways.
 *
 * **It is what makes these fixtures MINT at all.** `IngredientSet.js`'s PERMANENT INBOUND
 * SHIM rewrites the flat `ingredients` array on hydrate, minting an id for the group and one
 * for the set, from `foundry.utils.randomID()`. With only post-groups records nothing in
 * this file mints, the degraded `provenance: 'shape'` mode is accidentally deterministic,
 * and the non-vacuity control below goes green while demonstrating nothing.
 *
 * **It is this fixture's only defence against an ID-ONLY REWRITE.** A conversion that
 * carried every field verbatim but minted the two ids this shim mints — adding no other key
 * — is invisible to a post-groups-only corpus, whose `ingredientSets` are empty and have
 * nothing to mint for. Confirmed by applying exactly that mutation: it reddens the round
 * trip and the downgrade with this record present, and passes with it swapped for
 * {@link recipe}.
 *
 * It is NOT what defends against the coarser mutation of round-tripping records through
 * `Recipe.fromJSON`/`toJSON`, which an earlier revision of this comment claimed. The
 * normalizer adds `complex`, `enabled`, `metadata`, `name`, `componentId: null` and
 * `systemItemId` regardless of shape, so that mutation reddens on a post-groups corpus too.
 * The distinction matters because the over-claim invites a later author to drop this record
 * once some other test covers the round trip.
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
  it('CONVERTS toward the requested target instead of stranding the gate', async () => {
    // Issue 1211 changed this case's disposition and not its property. Before the forward
    // rows existed this transition had no conversion, so the reconciler restored the gate by
    // reverting the TARGET; now it restores it by performing the conversion the GM asked for.
    // The assertion is made against `readValidIdBasis` itself for the same reason it always
    // was: "the gate is satisfied" is the property, and re-deriving the comparison here would
    // prove only that this file can restate it.
    const { seams } = await world({ layout: SINGLE_ARRAY, target: PER_RECORD, legacy: [recipe('r1')] });

    const report = await reconcileRecipeStorageLayout(seams);

    assert.equal(report.action, 'converted');
    assert.equal(env.settings.get(TARGET_KEY), PER_RECORD, 'the requested arrangement stands');
    assert.equal(env.settings.get(LAYOUT_KEY), PER_RECORD, 'and the layout now describes it');
    assert.equal(
      recipeBasis({ granular: true, arrangement: PER_RECORD, layoutAtCorpusRead: PER_RECORD }),
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

  it('resumes an unsettled layout toward the requested target', async () => {
    // `unsettled` is not a legal TARGET, so this world cannot be repaired by a settings write
    // at all — before issue 1211 it was reported and left refused. The forward resume row is
    // what makes it recoverable, and a conversion is the only thing that can be: the corpus
    // really is spread across both arrangements.
    const { seams } = await world({ layout: UNSETTLED, target: PER_RECORD, legacy: [recipe('r1')] });

    const report = await reconcileRecipeStorageLayout(seams);

    assert.equal(report.action, 'converted');
    assert.equal(env.settings.get(TARGET_KEY), PER_RECORD, 'no illegal target is laundered in');
    assert.equal(env.settings.get(LAYOUT_KEY), PER_RECORD);
  });

  it('declares the reachable transitions rather than deriving them from the target values', () => {
    // Derived availability would silently start claiming a conversion the moment a value was
    // added to the target enumeration.
    assert.equal(recipeStorageConversionFor(PER_RECORD, SINGLE_ARRAY), runReverseRecipeStorageConversion);
    assert.equal(recipeStorageConversionFor(UNSETTLED, SINGLE_ARRAY), runReverseRecipeStorageConversion);
    assert.equal(recipeStorageConversionFor(SINGLE_ARRAY, PER_RECORD), runForwardRecipeStorageConversion);
    assert.equal(recipeStorageConversionFor(UNSETTLED, PER_RECORD), runForwardRecipeStorageConversion);
    assert.deepEqual(
      RECIPE_STORAGE_CONVERSIONS.map((entry) => `${entry.from}->${entry.to}`),
      [
        'perRecord->singleArray',
        'unsettled->singleArray',
        'singleArray->perRecord',
        'unsettled->perRecord',
      ]
    );
  });

  it('covers EVERY reachable transition, so neither non-conversion fallback can fire', () => {
    // The property the two rewritten cases above used to assert directly, stated once where
    // it cannot rot. The reconciler KEEPS its `target-reverted` and `unsettled-unresolvable`
    // branches — they are the required disposition for an entity class whose table is not
    // total, which component extraction (#1212) will be while it is half-built — and issue
    // 1211 made them unreachable for RECIPES by completing this table. Remove a row and this
    // fails, naming the transition that has just become permanently gated.
    const missing = [];
    for (const layout of [SINGLE_ARRAY, PER_RECORD, UNSETTLED]) {
      for (const target of [SINGLE_ARRAY, PER_RECORD]) {
        if (layout === target) continue;
        if (!recipeStorageConversionFor(layout, target)) missing.push(`${layout}->${target}`);
      }
    }
    assert.deepEqual(missing, [], 'a transition with no conversion leaves that world gated');
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

    assert.equal(report.action, 'refused');
    assert.match(report.error.message, /does not describe this world's storage/);
    assert.equal(env.settings.get(SETTING_KEYS.RECIPES).length, corpus.length, 'the corpus survives');
    // Issue 1211: a refusal wrote nothing, so nothing is compensated and BOTH keys are left
    // as found. Compensating a refusal is what turns it into a total loss on the NEXT boot —
    // `tests/definition-storage-reclaim-refusal.test.js` drives that composition.
    assert.deepEqual(env.writes, [], 'a refusal issues no setting write of any kind');
    assert.equal(env.settings.get(LAYOUT_KEY), PER_RECORD, 'the layout is left as found');
    assert.equal(env.settings.get(TARGET_KEY), SINGLE_ARRAY, 'and so is the target');
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

describe('the reconcile runs where the ordering constraint requires (src/main.js)', () => {
  // `src/main.js` imports the global stylesheet and the Svelte UI roots at module load, so it
  // cannot be imported under `node --test` — see `tests/helpers/fabricateFacadeHarness.js`.
  // Position is therefore pinned as SOURCE, exactly as `tests/startup-valid-id-basis.test.js`
  // already pins the composition site and the readiness pair. That is not a weaker choice
  // here: position IS the property, and no runtime observation of a module that cannot be
  // loaded could make it stronger.
  const initialize = mainMethodSource('  async initialize() {', MAIN_SOURCE);
  // Issue 1211 gave the call an argument — the migration pass's own report of whether it
  // wrote a corpus key — so the literal is matched up to its opening parenthesis. Its
  // ARGUMENT is pinned separately, in `tests/definition-storage-forward-conversion.test.js`,
  // because the parameter defaults to false and a dropped argument therefore fails OPEN.
  const RECONCILE = 'await this._reconcileDefinitionStorage(';
  const SELECT_BACKEND = 'this.recipeManager = new RecipeManager({';

  /**
   * A top-level statement's own text, bounded at its two-space-indented closing line.
   *
   * The same bounding discipline {@link mainMethodSource} applies to a class member: an
   * unbounded `slice(indexOf(...))` runs to the end of the file, which makes every
   * "must NOT contain" assertion permanently red and every "must contain" one vacuous.
   *
   * @param {string} signature
   * @param {string} closing
   * @returns {string}
   */
  function boundedSource(signature, closing = '\n  });') {
    const start = MAIN_SOURCE.indexOf(signature);
    if (start < 0) throw new Error(`main.js no longer declares \`${signature}\``);
    const end = MAIN_SOURCE.indexOf(`${closing}\n`, start);
    if (end < 0) throw new Error(`\`${signature}\` has no bounding \`${closing}\``);
    return MAIN_SOURCE.slice(start, end + closing.length);
  }

  it('reconciles BEFORE constructing the manager that selects the backend', () => {
    // The constraint the issue asks to be stated AND enforced. A refactor that moved the
    // reconcile below the construction ships green against every behavioural suite in this
    // repo — nothing imports `src/main.js` — and produces exactly the failure this issue is
    // written around, demonstrated in the next test.
    const reconcile = initialize.indexOf(RECONCILE);
    const select = initialize.indexOf(SELECT_BACKEND);
    assert.ok(reconcile > -1, 'initialize() still runs the boot storage reconcile');
    assert.ok(select > -1, 'initialize() still constructs the recipe manager');
    // Ordering over a FIRST index is only a constraint while there is one of each. A second
    // call above a moved one would otherwise satisfy `reconcile < select` while the moved one
    // does the damage.
    assert.equal(initialize.lastIndexOf(RECONCILE), reconcile, 'exactly one reconcile call');
    assert.equal(initialize.lastIndexOf(SELECT_BACKEND), select, 'exactly one construction');
    assert.ok(
      reconcile < select,
      'the backend is selected from the TARGET, once, in the constructor — so a reconcile ' +
        'below it leaves the converting GM on the adapter it just dismantled'
    );
  });

  it('is what stops the converting GM’s own world reading EMPTY on that boot', async () => {
    // Why the line above is not a style preference. Nothing here reads `src/main.js`; it
    // reproduces the two orderings against the real reconciler and the real manager, so the
    // pin above has a demonstrated failure behind it rather than a remembered one.
    const corpus = [recipe('r1'), recipe('r2')];
    const { seams } = await world({ layout: PER_RECORD, target: SINGLE_ARRAY, records: corpus });

    // Manager first — the forbidden order. `readRecipeStorageTarget()` answers `singleArray`,
    // so this manager gets the SETTINGS adapter, and step 2 has not written the legacy key.
    const constructedFirst = new RecipeManager();
    await constructedFirst.initialize();
    assert.equal(
      constructedFirst.getRecipes().length,
      0,
      'silently empty: the corpus is still in the per-record documents'
    );

    await reconcileRecipeStorageLayout(seams);

    const constructedAfter = new RecipeManager();
    await constructedAfter.initialize();
    assert.deepEqual(
      constructedAfter.getRecipes().map((record) => record.id).sort(),
      ['r1', 'r2'],
      'reconciling first means the selection below it is made against settled storage'
    );
  });

  it('runs the boot pass on the primary GM alone', () => {
    // A Storage Layout Conversion is a world-scoped multi-write and `isGM` is true for every
    // assistant GM too, so an `isGM` gate would let the full GM and every assistant convert
    // the same corpus concurrently — last-writer-wins over a half-moved corpus. Same gate,
    // same reason, as `_runMigrations` directly below it.
    const method = mainMethodSource(
      '  async _reconcileDefinitionStorage(migrationPassPersistedCorpusKey = false) {',
      MAIN_SOURCE
    );
    const gate = method.indexOf('if (game.users?.activeGM?.id !== game.user?.id) return;');
    assert.ok(gate > -1, 'the primary-GM gate is still the first thing the boot pass does');
    assert.ok(
      gate < method.indexOf('reconcileRecipeStorageLayout('),
      'and it precedes the write, rather than reporting after one'
    );
  });

  it('reacts to a TARGET change only, so the conversion’s own writes cannot re-enter it', () => {
    // The bridge emits `fabricate.recipeStorageLayoutChanged` for BOTH storage keys. Only a
    // target change is a request; the layout leg is steps 1 and 3 of the conversion coming
    // back, and reconciling on those would re-enter the operation that produced them. That
    // filter is what makes the mid-session path terminate.
    const hook = boundedSource(
      "Hooks.on('fabricate.recipeStorageLayoutChanged', ({ key } = {}) => {"
    );
    const filter = hook.indexOf(
      'if (key !== `${FABRICATE_SETTINGS_NAMESPACE}.${SETTING_KEYS.RECIPE_STORAGE_TARGET}`) return;'
    );
    const gate = hook.indexOf('if (game.users?.activeGM?.id !== game.user?.id) return;');
    const react = hook.indexOf('fabricate._reconcileDefinitionStorage()');
    assert.ok(filter > -1, 'the layout leg is filtered out');
    assert.ok(gate > -1, 'and the mid-session pass is primary-GM gated like the boot pass');
    assert.ok(react > -1, 'the hook still drives the reconcile');
    assert.ok(filter < react && gate < react, 'both refusals precede the reaction');
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
