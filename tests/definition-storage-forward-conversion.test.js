/**
 * Issue 1211 — the FORWARD recipe Storage Layout Conversion.
 *
 * Every assertion here is written against a specific way it could be vacuous, because this
 * issue has already produced one anti-guard, four vacuous acceptance items, and an
 * implementation that destroyed an entire corpus while scoring 13/13 green. Three instrument
 * preconditions are load-bearing and must not be relaxed:
 *
 * 1. **Interruption is modelled by ABANDONING the in-flight call, never by throwing.**
 *    `reconcileRecipeStorageLayout` catches every throw, so a throwing seam exercises the
 *    COMPENSATION path: the layout never stays `unsettled` and the target is reverted, so
 *    every window assertion passes having tested nothing. See
 *    `tests/helpers/reconcilerCallCounter.js`. The harness fires the reconciler and does NOT
 *    await it — awaiting hangs, and `node --test` reports a hang as `# cancelled`, not
 *    `# fail`.
 * 2. **The counter-placement pin needs MORE THAN ONE record.** At one record a
 *    reconciler-wide counter and an in-loop one coincide, and the pin proves nothing. The
 *    total is therefore pinned over three records AND asserted invariant across corpus sizes,
 *    which is the assertion an in-loop counter cannot satisfy.
 * 3. **Every equivalence comparison passes `storedRecords` and asserts its own
 *    non-emptiness.** `canonicalizeDefinitionCorpus`'s undescriptive-bytes refusal
 *    EARLY-RETURNS on an empty corpus, so an empty fixture satisfies every equivalence item
 *    trivially while disarming the refusal that exists to catch reading the bytes too late.
 *
 * ## Two places this file departs from the planned acceptance text, and why
 *
 * - The plan's item 10 asks for "the layout is still `unsettled`" after a verification
 *   failure, while its item 8(a) asks for the layout DOCUMENT not to exist after the same
 *   failure. Those cannot both hold: compensation is what makes 8(a) true, and compensation
 *   restores the pre-step-1 presence, which on a never-converted world means the layout reads
 *   its registered `singleArray` default. 8(a) is the one grounded in shipped canonical spec
 *   ("compensation MUST restore key presence"), so it wins, and item 10's real property —
 *   verification GATES step 3 — is asserted directly instead: `perRecord` is never written at
 *   any point.
 * - The plan pins a clean run at three counted calls. The implemented conversion issues FOUR
 *   (`setSetting`, `createDocuments`, `setSetting`, and step 4's `Document#delete()`), and
 *   the plan's own window matrix requires step 4 to be a counted increment, since W5 and W6
 *   are separated by it. The pin states the actual sequence rather than a number, so it names
 *   what it counts.
 */

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';

import { DEFINITION_STORAGE_LAYOUTS, SETTING_KEYS } from '../src/config/settings.js';
import {
  getHighestRegisteredMigrationVersion,
  MigrationRunner,
} from '../src/migration/MigrationRunner.js';
import {
  RECIPE_STORAGE_CONVERSION_DIRECTIONS,
  RecipeStorageConversionRefusedError,
  reconcileRecipeStorageLayout,
  runForwardRecipeStorageConversion,
} from '../src/systems/definitionStorageConversion.js';
import { createRecipeCorpus, resyncGranularRecipeRecords } from '../src/systems/recipeCorpus.js';
import { composeStartupPassList } from '../src/systems/startupPassComposition.js';

import {
  canonicalDefinitionCorpusJson,
  canonicalizeDefinitionCorpus,
} from './helpers/canonicalizeDefinitionCorpus.js';
import { mainMethodSource, MAIN_SOURCE } from './helpers/fabricateFacadeHarness.js';
import { instrumentReconcilerCalls } from './helpers/reconcilerCallCounter.js';
import {
  installRecipeStorageWorld,
  LAYOUT_KEY,
  legacyShapedRecipe,
  PER_RECORD,
  qualified,
  recipe,
  SINGLE_ARRAY,
  TARGET_KEY,
  UNSETTLED,
} from './helpers/recipeStorageWorld.js';

const { env, world } = installRecipeStorageWorld();

const { RecipeManager } = await import('../src/systems/RecipeManager.js');

const RECIPES_KEY = SETTING_KEYS.RECIPES;
const QUALIFIED_RECIPES = qualified(RECIPES_KEY);
const { FORWARD } = RECIPE_STORAGE_CONVERSION_DIRECTIONS;

/**
 * The fixture corpus. Three records so the counter-placement pin discriminates, and one of
 * them legacy-shaped so the canonical comparison really does run in provenance mode.
 */
const CORPUS = [recipe('r1'), recipe('r2'), legacyShapedRecipe('r3')];

/** The canonical-form options every comparison in this file uses. */
const FORM = { storedRecords: CORPUS };

/** Read the records back out of the per-record documents, id-ordered. */
function granularCorpus(fixture) {
  return [...fixture.host.collection.documents.values()]
    .filter((document) => document.key.startsWith(`${qualified('recipe.')}`))
    .sort((left, right) => (left.key < right.key ? -1 : 1))
    .map((document) => document.value);
}

/**
 * Fire a reconcile that will be abandoned mid-flight, and resolve once the abandoned call has
 * BEGUN.
 *
 * The returned promise is deliberately NOT the reconciler's: that one never settles, and
 * awaiting it is what turns a window assertion into `# cancelled`.
 *
 * @param {object} fixture
 * @param {number} abandonAt 1-based ordinal of the counted call to abandon.
 * @returns {Promise<{calls: string[]}>}
 */
async function abandonAtCall(fixture, abandonAt) {
  const instrument = instrumentReconcilerCalls(fixture.seams, { abandonAt });
  // Fire and forget. The reconciler's promise never settles by construction.
  void reconcileRecipeStorageLayout(instrument.seams);
  await instrument.reachedAbandonment;
  return instrument;
}

describe('the forward conversion carries the corpus verbatim', () => {
  it('is byte-equivalent under the committed canonical form', async () => {
    const fixture = await world({ layout: SINGLE_ARRAY, target: PER_RECORD, legacy: CORPUS });
    // The bytes are held from BEFORE step 1. `_refuseUndescriptiveStoredIdentity` refuses
    // bytes read after step 4 — at which point the deleted key serves its registered `[]`
    // default — but it early-returns on an EMPTY corpus, so non-emptiness is asserted rather
    // than assumed.
    assert.ok(CORPUS.length > 0, 'an empty fixture satisfies every equivalence item trivially');
    assert.ok(
      CORPUS.some((record) => Array.isArray(record.catalysts)),
      'at least one record carries a field Recipe#toJSON does not emit'
    );

    const report = await reconcileRecipeStorageLayout(fixture.seams);

    assert.equal(report.action, 'converted');
    assert.equal(report.records, CORPUS.length);
    assert.equal(report.direction, FORWARD);
    const after = granularCorpus(fixture);
    assert.equal(
      canonicalizeDefinitionCorpus(after, FORM).provenance,
      'stored',
      'the stamp is the first JSON field precisely so a silent drop to shape mode cannot pass'
    );
    assert.equal(canonicalizeDefinitionCorpus(after, FORM).version, 2);
    assert.equal(
      canonicalDefinitionCorpusJson(after, FORM),
      canonicalDefinitionCorpusJson(CORPUS, FORM),
      'domain-level equivalence under CANONICAL_FORM_VERSION'
    );
    // The structural half, stated separately: the canonical comparison above would also pass
    // on a corpus that lost a record if the ORIGINAL had lost it too.
    assert.deepEqual(fixture.recordIds(), ['r1', 'r2', 'r3']);
    assert.ok(
      after.every((record) => !('complex' in record) && !('metadata' in record)),
      'no normalizer key was added, so the records were never hydrated through the model'
    );
  });

  it('preserves a cross-key reference, including one that was already dangling', async () => {
    // NOT subsumed by the equivalence assertion above: canonical rule 4 renumbers
    // hydrate-minted ids positionally, so a minted-id substitution compares equal, and the
    // referents live in `craftingSystems`, which is not in the recipe corpus's
    // `storedRecords` at all. Starting from a KNOWN DANGLING entry is what makes a silent
    // repair visible — a repair is a change no equality against a repaired baseline sees.
    const corpus = [
      recipe('t1', { toolIds: ['toolHammer000001', 'toolGhost00000001'] }),
      recipe('t2', { toolIds: ['toolHammer000001'] }),
    ];
    const fixture = await world({ layout: SINGLE_ARRAY, target: PER_RECORD, legacy: corpus });
    env.settings.set(SETTING_KEYS.CRAFTING_SYSTEMS, [
      { id: 'sys-1', tools: [{ id: 'toolHammer000001', name: 'Hammer' }] },
    ]);
    const resolvable = (id) =>
      env.settings
        .get(SETTING_KEYS.CRAFTING_SYSTEMS)
        .some((system) => system.tools.some((tool) => tool.id === id));
    assert.equal(resolvable('toolGhost00000001'), false, 'the fixture starts dangling');

    await reconcileRecipeStorageLayout(fixture.seams);

    const after = granularCorpus(fixture);
    assert.deepEqual(
      after.flatMap((record) => record.toolIds ?? []).sort(),
      ['toolGhost00000001', 'toolHammer000001', 'toolHammer000001'],
      'every reference survives, the resolvable one and the dangling one alike'
    );
    assert.equal(resolvable('toolGhost00000001'), false, 'and it is still dangling');
  });
});

describe('step 2 is create/update-only', () => {
  it('issues NO delete leg, over a resume whose source is a strict subset of the index', async () => {
    // The fixture the plan review proved is the only discriminating one. The legacy array is
    // a strict, NON-EMPTY subset of the index, so the empty-source guard does not fire and
    // `putAll` — which derives its removals from the supplied corpus — silently destroys the
    // record the source no longer names, while still reporting `action: 'converted'`.
    const fixture = await world({
      layout: UNSETTLED,
      target: PER_RECORD,
      legacy: [recipe('r1'), recipe('r2')],
      records: [recipe('r1'), recipe('r2'), recipe('r3')],
    });

    const report = await reconcileRecipeStorageLayout(fixture.seams);

    assert.equal(report.action, 'converted');
    assert.deepEqual(
      fixture.host.calls.map((call) => call.leg),
      ['documentDelete'],
      'the only document operation is step 4 — no bulk delete leg is ever issued'
    );
    assert.deepEqual(fixture.recordIds(), ['r1', 'r2', 'r3'], 'r3 survives');
  });
});

describe('the guard refuses before it writes anything', () => {
  it('refuses an empty source over a non-empty destination, having written nothing', async () => {
    // Called on `run` DIRECTLY, not through the reconciler: the shipped reconciler's generic
    // catch issues two compensation writes, so "no write of any kind" is false there and an
    // assertion made through it would be measuring the wrong thing.
    const fixture = await world({
      layout: SINGLE_ARRAY,
      target: PER_RECORD,
      legacy: [],
      records: [recipe('r1'), recipe('r2')],
    });
    const instrument = instrumentReconcilerCalls(fixture.seams);

    await assert.rejects(
      () => runForwardRecipeStorageConversion(instrument.seams),
      RecipeStorageConversionRefusedError
    );

    assert.deepEqual(instrument.calls, [], 'zero document calls and zero setting writes');
    assert.deepEqual(env.writes, []);
    assert.equal(env.settings.get(LAYOUT_KEY), SINGLE_ARRAY, 'the layout is untouched');
    assert.equal(fixture.documentExists(LAYOUT_KEY), false, 'and step 1 created no document');
    assert.deepEqual(fixture.recordIds(), ['r1', 'r2'], 'the destination corpus survives');
  });
});

describe('compensation restores key PRESENCE, not value', () => {
  /** A fixture whose create leg drops one document, so verification fails after step 2. */
  async function shortCreateLeg(options) {
    const fixture = await world(options);
    fixture.host.vetoedKeys.add(qualified('recipe.r2'));
    return fixture;
  }

  it('DELETES the layout document it created on a never-converted world', async () => {
    // The mutation this reddens: the forward direction inheriting the reverse's
    // value-restoring compensation. That fabricates a layout document on a world the GM is
    // being told is untouched — and spends an envelope — which is exactly what
    // `data-models/spec.md` § "compensation MUST restore key presence" forbids.
    const fixture = await shortCreateLeg({
      layout: SINGLE_ARRAY,
      target: PER_RECORD,
      legacy: CORPUS,
    });
    assert.equal(fixture.documentExists(LAYOUT_KEY), false, 'no layout document to begin with');

    const report = await reconcileRecipeStorageLayout(fixture.seams);

    assert.equal(report.action, 'failed');
    assert.equal(
      fixture.documentExists(LAYOUT_KEY),
      false,
      'the layout document does not EXIST — asserting it holds singleArray would pass on a fabricated one'
    );
    assert.equal(env.settings.get(LAYOUT_KEY), SINGLE_ARRAY, 'so it reads its registered default');
    assert.deepEqual(
      fixture.recordIds(),
      ['r1', 'r3'],
      'the debris survives for the next boot to reclaim'
    );
    assert.equal(env.settings.get(TARGET_KEY), PER_RECORD, 'the target reverted nothing');
  });

  it('restores the layout VALUE when the document was already there', async () => {
    // The `unsettled -> perRecord` resume row. That document provably exists — `unsettled` is
    // not the registered default — so deleting it would assert `singleArray` over a corpus
    // that is half converted, which is the mirror of the same defect.
    const fixture = await shortCreateLeg({
      layout: UNSETTLED,
      target: PER_RECORD,
      legacy: CORPUS,
    });
    assert.equal(fixture.documentExists(LAYOUT_KEY), true);

    const report = await reconcileRecipeStorageLayout(fixture.seams);

    assert.equal(report.action, 'failed');
    assert.equal(fixture.documentExists(LAYOUT_KEY), true, 'the document still exists');
    assert.equal(env.settings.get(LAYOUT_KEY), UNSETTLED, 'and its value is restored');
  });
});

describe('verification gates step 3', () => {
  it('never writes the target value over a corpus missing a record, and a resume converges', async () => {
    const fixture = await world({ layout: SINGLE_ARRAY, target: PER_RECORD, legacy: CORPUS });
    fixture.host.vetoedKeys.add(qualified('recipe.r2'));
    const instrument = instrumentReconcilerCalls(fixture.seams);

    const report = await reconcileRecipeStorageLayout(instrument.seams);

    assert.equal(report.action, 'failed');
    assert.match(
      report.error.message,
      /a hook or the server dropped 1/,
      'the short-return check raised, and step 3 was never reached'
    );
    // The property, asserted directly rather than through a post-hoc settings read: with the
    // verification moved between steps 3 and 4 this line is the only thing that reddens.
    assert.ok(
      !instrument.calls.includes(`setSetting:${LAYOUT_KEY}`) ||
        !env.writes.some((write) => write.key === LAYOUT_KEY && write.value === PER_RECORD),
      'the layout never read perRecord at any point'
    );
    assert.equal(fixture.documentExists(RECIPES_KEY), true, 'the legacy document is intact');
    assert.equal(env.settings.get(RECIPES_KEY).length, CORPUS.length);

    // The resume. The survivors were indexed at `_createDocuments` BEFORE `_verifyReturned`
    // raised, which is what makes a resume converge rather than mint duplicates.
    fixture.host.vetoedKeys.clear();
    const resumed = await reconcileRecipeStorageLayout(fixture.seams);

    assert.equal(resumed.action, 'converted');
    assert.deepEqual(fixture.recordIds(), ['r1', 'r2', 'r3']);
    assert.equal(
      canonicalDefinitionCorpusJson(granularCorpus(fixture), FORM),
      canonicalDefinitionCorpusJson(CORPUS, FORM),
      'full canonical equality with the baseline'
    );
  });

  it('re-reads the index before step 3, so a returned-but-absent document still gates it', async () => {
    // The belt to the short-return check's braces, and the only thing that catches a document
    // the server ACKNOWLEDGED but that is not in the collection — a duplicate key resolving to
    // the first document, or an index the write path did not update. The short return cannot
    // see it: the call resolved with exactly the count it was asked for.
    const fixture = await world({ layout: SINGLE_ARRAY, target: PER_RECORD, legacy: CORPUS });
    const real = fixture.host.documentClass;
    const seams = {
      ...fixture.seams,
      documentClass: () => ({
        ...real,
        createDocuments: async (data, options) => {
          const created = await real.createDocuments(data, options);
          // Acknowledged, then absent. The return is the full set, so every count matches.
          fixture.host.collection.documents.delete(created[1].id);
          return created;
        },
      }),
    };

    const report = await reconcileRecipeStorageLayout(seams);

    assert.equal(report.action, 'failed');
    assert.match(report.error.message, /did not land/, 'the index verification raised');
    assert.equal(
      env.writes.some((write) => write.key === LAYOUT_KEY && write.value === PER_RECORD),
      false,
      'the layout never read perRecord'
    );
    assert.equal(fixture.documentExists(RECIPES_KEY), true, 'the legacy document is intact');
  });

  it('treats a short create leg as a FAILURE, and does not re-create from a stale index', async () => {
    // W3, the veto window. A `preCreateSetting`-equivalent veto drops one document and lets
    // the rest COMMIT — the call resolves successfully having written less than it was asked
    // to — so a conversion that trusted the resolution would advance the layout over a corpus
    // missing a record.
    const fixture = await world({ layout: SINGLE_ARRAY, target: PER_RECORD, legacy: CORPUS });
    fixture.host.vetoedKeys.add(qualified('recipe.r2'));

    await reconcileRecipeStorageLayout(fixture.seams);

    assert.deepEqual(fixture.recordIds(), ['r1', 'r3'], 'the survivors committed');
    fixture.host.vetoedKeys.clear();
    await reconcileRecipeStorageLayout(fixture.seams);

    assert.equal(
      fixture.host.collection.countFor(qualified('recipe.r1')),
      1,
      'the resume refreshed its index rather than minting a duplicate for a committed record'
    );
    assert.deepEqual(fixture.recordIds(), ['r1', 'r2', 'r3']);
  });
});

describe('compensation is unreachable after step 3', () => {
  it('completes forward when step 4 fails, and reports the reclaim failure', async () => {
    const fixture = await world({ layout: SINGLE_ARRAY, target: PER_RECORD, legacy: CORPUS });
    const seams = {
      ...fixture.seams,
      settingDocuments: {
        exists: (key) => fixture.settingDocuments.exists(key),
        delete: async (key) => {
          if (key === QUALIFIED_RECIPES) throw new Error('socket closed');
          return fixture.settingDocuments.delete(key);
        },
      },
    };

    const report = await reconcileRecipeStorageLayout(seams);

    assert.equal(report.action, 'converted', 'a step-4 failure completes FORWARD');
    assert.ok(report.reclaimFailure instanceof Error, 'and the return reports it');
    assert.equal(env.settings.get(LAYOUT_KEY), PER_RECORD, 'the layout still reads the target');
    assert.equal(env.settings.get(TARGET_KEY), PER_RECORD, 'and so does the target');
    assert.equal(fixture.documentExists(LAYOUT_KEY), true);
    assert.equal(
      fixture.documentExists(RECIPES_KEY),
      true,
      'the legacy document survives, which is the quiet downgrade-lossy state'
    );
  });

  it('issues no compensation write once the legacy delete has resolved', async () => {
    const fixture = await world({ layout: SINGLE_ARRAY, target: PER_RECORD, legacy: CORPUS });
    const instrument = instrumentReconcilerCalls(fixture.seams);

    await reconcileRecipeStorageLayout(instrument.seams);

    assert.deepEqual(
      instrument.calls,
      [
        `setSetting:${LAYOUT_KEY}`,
        `createDocuments:${CORPUS.length}`,
        `setSetting:${LAYOUT_KEY}`,
        `documentDelete:${QUALIFIED_RECIPES}`,
      ],
      'nothing follows step 4 — a compensation write would appear as a fifth call'
    );
  });
});

describe('the reconciler-wide call counter and the five counter-driven windows', () => {
  it('counts a stated set, and its total is INVARIANT across corpus sizes', async () => {
    // Placement is what decides the verdict. A counter moved inside the conversion's record
    // loop makes W1, W5 and W6 inexpressible — none of them is inside any loop — and the
    // suite silently shrinks. At exactly ONE record a reconciler-wide counter and an in-loop
    // one coincide, so the pin is taken over three records and the invariance below is what
    // an in-loop counter cannot satisfy.
    const totals = [];
    for (const size of [1, 3, 7]) {
      const corpus = Array.from({ length: size }, (_, index) => recipe(`x${index}`));
      const fixture = await world({ layout: SINGLE_ARRAY, target: PER_RECORD, legacy: corpus });
      const instrument = instrumentReconcilerCalls(fixture.seams);
      await reconcileRecipeStorageLayout(instrument.seams);
      totals.push({ size, calls: instrument.calls });
    }

    assert.deepEqual(
      totals.find((entry) => entry.size === 3).calls,
      [
        `setSetting:${LAYOUT_KEY}`,
        'createDocuments:3',
        `setSetting:${LAYOUT_KEY}`,
        `documentDelete:${QUALIFIED_RECIPES}`,
      ],
      'the counted set, stated rather than implied'
    );
    assert.deepEqual(
      totals.map((entry) => entry.calls.length),
      [4, 4, 4],
      'at most a fixed number of calls whatever the corpus size — #1070’s own claim, observable'
    );
  });

  it('W1 — the layout is unsettled and no record document has been written', async () => {
    const fixture = await world({ layout: SINGLE_ARRAY, target: PER_RECORD, legacy: CORPUS });

    await abandonAtCall(fixture, 2);

    assert.equal(env.settings.get(LAYOUT_KEY), UNSETTLED, 'not singleArray — that is the throw');
    assert.equal(env.settings.get(TARGET_KEY), PER_RECORD, 'and the target was NOT reverted');
    assert.deepEqual(fixture.recordIds(), []);
    await assertResumeConverges(fixture);
  });

  it('W2 — the create leg committed and the update leg was never issued', async () => {
    // Resume-only: a first conversion has an empty index, so `_differential` emits creates
    // alone and no update call exists to abandon.
    const stale = { ...recipe('r1'), name: 'a stale value' };
    const fixture = await world({
      layout: UNSETTLED,
      target: PER_RECORD,
      legacy: CORPUS,
      records: [stale],
    });

    const instrument = await abandonAtCall(fixture, 3);

    assert.deepEqual(instrument.calls, [
      `setSetting:${LAYOUT_KEY}`,
      'createDocuments:2',
      'updateDocuments:1',
    ]);
    assert.equal(env.settings.get(LAYOUT_KEY), UNSETTLED);
    assert.deepEqual(fixture.recordIds(), ['r1', 'r2', 'r3'], 'the creates committed');
    assert.equal(
      fixture.host.collection.getSetting(qualified('recipe.r1')).value.name,
      'a stale value',
      'and the update did not land'
    );
    await assertResumeConverges(fixture);
  });

  it('W4 — step 2 is complete and verified while the layout is still unsettled', async () => {
    const fixture = await world({ layout: SINGLE_ARRAY, target: PER_RECORD, legacy: CORPUS });

    await abandonAtCall(fixture, 3);

    assert.equal(env.settings.get(LAYOUT_KEY), UNSETTLED);
    assert.deepEqual(fixture.recordIds(), ['r1', 'r2', 'r3']);
    assert.equal(fixture.documentExists(RECIPES_KEY), true, 'the legacy document is intact');
    await assertResumeConverges(fixture);
  });

  it('W5 — the layout reads the target and the legacy document is still present', async () => {
    const fixture = await world({ layout: SINGLE_ARRAY, target: PER_RECORD, legacy: CORPUS });

    await abandonAtCall(fixture, 4);

    assert.equal(env.settings.get(LAYOUT_KEY), PER_RECORD);
    assert.equal(fixture.documentExists(RECIPES_KEY), true);
    // A settled `perRecord` boot with a byte-identical survivor retries step 4 rather than
    // reporting a divergence — see `tests/definition-storage-reclaim-refusal.test.js`.
    const resumed = await reconcileRecipeStorageLayout(fixture.seams);
    assert.equal(resumed.action, 'settled');
    assert.equal(fixture.documentExists(RECIPES_KEY), false, 'step 4 is retried');
    assert.equal(
      canonicalDefinitionCorpusJson(granularCorpus(fixture), FORM),
      canonicalDefinitionCorpusJson(CORPUS, FORM)
    );
  });

  it('W6 — the legacy document is gone and the conversion returned', async () => {
    const fixture = await world({ layout: SINGLE_ARRAY, target: PER_RECORD, legacy: CORPUS });

    const report = await reconcileRecipeStorageLayout(fixture.seams);

    assert.equal(report.action, 'converted');
    assert.equal(fixture.documentExists(RECIPES_KEY), false);
    assert.deepEqual(
      env.settings.get(RECIPES_KEY),
      [],
      'and it reads its registered default — silently, which is the cliff the reverse exists for'
    );
  });
});

/**
 * Run a fresh reconciler over the same mutated world and assert it reaches canonical equality
 * with the baseline.
 *
 * @param {object} fixture
 */
async function assertResumeConverges(fixture) {
  const resumed = await reconcileRecipeStorageLayout(fixture.seams);
  assert.equal(resumed.action, 'converted');
  assert.deepEqual(fixture.recordIds(), ['r1', 'r2', 'r3']);
  assert.equal(
    canonicalDefinitionCorpusJson(granularCorpus(fixture), FORM),
    canonicalDefinitionCorpusJson(CORPUS, FORM),
    'a fresh reconciler over the abandoned world converges on the baseline'
  );
}

describe('two clients converge from settled bytes', () => {
  it('produces one document set, interleaved at every leg boundary', async () => {
    // True by construction — `deriveSettingDocumentId` derives `_id` from the record key and
    // `createDocuments({keepId: true})` is an unconditional put — and kept as the regression
    // net on that derivation. It is NOT evidence about the deferral: a SEQUENTIAL two-client
    // run cannot fail at all, because the second client short-circuits at `layout === target`
    // and issues no document call.
    const fixture = await world({ layout: SINGLE_ARRAY, target: PER_RECORD, legacy: CORPUS });
    const clientA = runForwardRecipeStorageConversion(fixture.seams);
    const clientB = runForwardRecipeStorageConversion(fixture.seams);

    await Promise.all([clientA, clientB]);

    assert.deepEqual(fixture.recordIds(), ['r1', 'r2', 'r3'], 'one document set, not two');
    assert.equal(
      canonicalDefinitionCorpusJson(granularCorpus(fixture), FORM),
      canonicalDefinitionCorpusJson(CORPUS, FORM)
    );
  });
});

describe('the conversion defers a boot whose migration pass persisted a corpus key', () => {
  /** A legacy-arrangement world the real MigrationRunner can be driven over. */
  function legacyMigrationWorld(settings) {
    const store = new Map(Object.entries({ migrationVersion: '0.0.0', ...settings }));
    const getSetting = (key) => store.get(key) ?? null;
    const setSetting = async (key, value) => {
      store.set(key, value);
      return value;
    };
    return {
      store,
      runner: new MigrationRunner({
        getSetting,
        setSetting,
        recipeCorpus: createRecipeCorpus({ getSetting, setSetting }),
      }),
    };
  }

  /** A record the 1.17.0 essence-group migration mints a `crypto.randomUUID()` into. */
  const mintingRecipe = {
    id: 'm1',
    name: 'Minting',
    craftingSystemId: 'sys-1',
    ingredientSets: [{ essences: { fire: 2 } }],
    resultGroups: [],
  };

  it('PREMISE — two passes over the same bytes are not byte-reproducible', async () => {
    // The requirement's own basis, made falsifiable: if minting ever becomes deterministic
    // this reddens and the deferral needs re-grounding rather than silently becoming
    // ceremony.
    const outputs = [];
    for (let run = 0; run < 2; run += 1) {
      const world = legacyMigrationWorld({ recipes: structuredClone([mintingRecipe]) });
      await world.runner.run();
      outputs.push(JSON.stringify(world.store.get('recipes')));
    }

    assert.notEqual(outputs[0], outputs[1], 'the pass mints per run over the same source');
  });

  it('REPORT — the pass reports the writes it ISSUED, not the migrations it ran', async () => {
    const changed = legacyMigrationWorld({
      recipes: [],
      craftingSystems: [{ id: 'sys-1', name: 'S', essences: [{ id: 'e1', name: 'Fire' }] }],
    });
    assert.equal((await changed.runner.run()).persistedCorpusKey, true, 'only systems changed');

    const untouched = legacyMigrationWorld({ recipes: [], craftingSystems: [] });
    const summary = await untouched.runner.run();
    assert.equal(summary.ran > 0, true, 'migrations DID run — this is not the empty-pass path');
    assert.equal(summary.persistedCorpusKey, false, 'but none of them changed anything');

    const upToDate = legacyMigrationWorld({
      recipes: [],
      migrationVersion: getHighestRegisteredMigrationVersion(),
    });
    assert.equal((await upToDate.runner.run()).persistedCorpusKey, false);
  });

  it('REPORT — a pass that refused before the writeback persisted nothing', async () => {
    const store = new Map([
      ['migrationVersion', '0.0.0'],
      [SETTING_KEYS.RECIPE_STORAGE_LAYOUT, DEFINITION_STORAGE_LAYOUTS.UNSETTLED],
    ]);
    const getSetting = (key) => store.get(key) ?? null;
    const setSetting = async (key, value) => store.set(key, value);
    const runner = new MigrationRunner({
      getSetting,
      setSetting,
      recipeCorpus: createRecipeCorpus({ getSetting, setSetting }),
    });

    const summary = await runner.run();

    assert.equal(summary.deferred, true);
    assert.equal(summary.persistedCorpusKey, false, 'it never reached the writeback');
  });

  it('BEHAVIOUR — the reconciler converts on false and defers, silently, on true', async () => {
    const converting = await world({ layout: SINGLE_ARRAY, target: PER_RECORD, legacy: CORPUS });
    assert.equal(
      (await reconcileRecipeStorageLayout(converting.seams)).action,
      'converted',
      'the control: with no corpus write this boot, it converts'
    );

    const deferring = await world({ layout: SINGLE_ARRAY, target: PER_RECORD, legacy: CORPUS });
    const instrument = instrumentReconcilerCalls(deferring.seams);
    const report = await reconcileRecipeStorageLayout({
      ...instrument.seams,
      migrationPassPersistedCorpusKey: true,
    });

    assert.equal(report.action, 'deferred');
    assert.deepEqual(instrument.calls, [], 'zero document calls and zero setting writes');
    assert.equal(deferring.documentExists(RECIPES_KEY), true, 'the corpus is untouched');
    assert.deepEqual(deferring.recordIds(), []);
  });

  it('WIRING — main.js threads the report from the pass into the reconcile', () => {
    // A source scan, and named explicitly rather than left implicit: the parameter DEFAULTS
    // to false, so a dropped argument fails OPEN and no behavioural test can see it.
    // `src/main.js` cannot be imported under `node --test`.
    const body = mainMethodSource('  async initialize() {', MAIN_SOURCE);
    const migrate = body.indexOf('const migrationPassPersistedCorpusKey = await this._runMigrations();');
    const reconcile = body.indexOf(
      'await this._reconcileDefinitionStorage(migrationPassPersistedCorpusKey);'
    );
    assert.ok(migrate > -1, 'initialize() captures the pass report');
    assert.ok(reconcile > -1, 'and passes it to the reconcile');
    assert.ok(migrate < reconcile, 'in that order');

    const runMigrations = mainMethodSource('  async _runMigrations() {', MAIN_SOURCE);
    assert.ok(
      runMigrations.includes('summary?.persistedCorpusKey === true'),
      'the fact is read from the summary, never re-derived from `ran`'
    );
    assert.ok(
      !runMigrations.includes('summary?.ran'),
      'and `ran` is not consulted for it — it counts migrations executed, not writes issued'
    );
  });
});

describe('destructive startup passes are omitted throughout the conversion', () => {
  /**
   * Compose the pass list from a REAL world in a REAL intermediate state, with a real
   * `RecipeManager` reading it. Composing from a hand-set layout would measure the Valid Id
   * Basis clauses, which are already pinned; this measures THIS change's writes.
   *
   * @param {object} fixture
   * @returns {Promise<string[]>} the emitted pass labels.
   */
  async function composeFrom(fixture) {
    env.settings.set(SETTING_KEYS.MIGRATION_VERSION, getHighestRegisteredMigrationVersion());
    const previousSetting = globalThis.Setting;
    globalThis.game.settings.storage = { get: () => fixture.host.collection };
    globalThis.Setting = { implementation: fixture.host.documentClass };
    try {
      const recipeManager = new RecipeManager();
      await recipeManager.initialize();
      const record = () => () => Promise.resolve();
      return composeStartupPassList({
        recipeManager,
        craftingSystemManager: {
          getSystems: () => [{ id: 'sys-1', components: [{ id: 'c1' }] }],
          describeDefinitionStorage: () => ({
            granular: false,
            arrangement: null,
            layoutAtCorpusRead: null,
          }),
        },
        craftingRunManager: {
          cleanupInvalidRuns: record(),
          pruneInstantaneousActiveRuns: record(),
        },
        salvageRunManager: { cleanupInvalidRuns: record() },
        recipeVisibilityService: { cleanupLearnedRecipes: record() },
        getSetting: (key) => env.settings.get(key),
        setSetting: async () => {},
        resolveGatheringActor: () => null,
        isSelectableGatheringActor: () => false,
        warn: () => {},
      }).map(([label]) => label);
    } finally {
      globalThis.Setting = previousSetting;
      delete globalThis.game.settings.storage;
    }
  }

  /** Only the pass whose basis is systems + components survives a recipes-incomplete basis. */
  const RECIPES_INCOMPLETE = ['salvage runs'];

  it('omits them at W1, W2 and W4, where step 1 left the layout unsettled', async () => {
    // The mutation this reddens: step 1 writing the layout to the TARGET value instead of
    // `unsettled`. No Valid Id Basis clause then refuses — clause 1 passes, clause 2 passes
    // because layout equals target, clause 4 passes because the arrangement derives from the
    // target, and clause 5 passes because the sample is `perRecord` — and every destructive
    // pass runs against a half-written corpus.
    for (const abandonAt of [2, 3]) {
      const fixture = await world({ layout: SINGLE_ARRAY, target: PER_RECORD, legacy: CORPUS });
      await abandonAtCall(fixture, abandonAt);
      assert.deepEqual(await composeFrom(fixture), RECIPES_INCOMPLETE, `abandoned at ${abandonAt}`);
    }
  });

  it('omits them after a veto compensated the conversion away', async () => {
    const fixture = await world({ layout: SINGLE_ARRAY, target: PER_RECORD, legacy: CORPUS });
    fixture.host.vetoedKeys.add(qualified('recipe.r2'));
    await reconcileRecipeStorageLayout(fixture.seams);

    assert.deepEqual(await composeFrom(fixture), RECIPES_INCOMPLETE);
  });

  it('emits every pass once the conversion has completed — the positive control', async () => {
    // Without this, "omitted" is satisfied by a composition site that emits nothing at all.
    const fixture = await world({ layout: SINGLE_ARRAY, target: PER_RECORD, legacy: CORPUS });
    await reconcileRecipeStorageLayout(fixture.seams);

    assert.deepEqual(await composeFrom(fixture), [
      'crafting runs',
      'phantom crafting runs',
      'salvage runs',
      'learned recipes',
      'stale preferences',
    ]);
  });
});

describe('the post-bridge record resync is unconditional and correctly placed', () => {
  it('adopts a record document that replicated before the listeners existed', async () => {
    const fixture = await world({
      layout: PER_RECORD,
      target: PER_RECORD,
      legacy: [],
      legacyDocument: false,
      records: [recipe('r1')],
    });
    const previousSetting = globalThis.Setting;
    globalThis.game.settings.storage = { get: () => fixture.host.collection };
    globalThis.Setting = { implementation: fixture.host.documentClass };
    try {
      const manager = new RecipeManager();
      await manager.initialize();
      assert.deepEqual(
        manager.getRecipes().map((entry) => entry.id),
        ['r1']
      );
      // The buffered socket event core replayed before `ready`: the document is correct in
      // setting storage and missing from this client's map.
      fixture.host.seed({ key: qualified('recipe.r2'), value: recipe('r2') });

      assert.equal(resyncGranularRecipeRecords(manager), true);
      assert.deepEqual(
        manager
          .getRecipes()
          .map((entry) => entry.id)
          .sort(),
        ['r1', 'r2']
      );
    } finally {
      globalThis.Setting = previousSetting;
      delete globalThis.game.settings.storage;
    }
  });

  it('is a no-op for a manager on the settings adapter', async () => {
    const fixture = await world({ layout: SINGLE_ARRAY, target: SINGLE_ARRAY, legacy: CORPUS });
    const manager = new RecipeManager();
    await manager.initialize();

    assert.equal(resyncGranularRecipeRecords(manager), false);
    assert.equal(manager.getRecipes().length, CORPUS.length, 'and it changed nothing');
    assert.equal(fixture.host.calls.length, 0);
  });

  it('sits after every setting-hook registration and inside no GM gate', () => {
    // Position is the property twice over: before the registrations it reopens the window it
    // closes, and inside a GM gate it runs only on the client that never misses its own
    // writes. `src/main.js` cannot be imported, so this is a source scan.
    const source = MAIN_SOURCE;
    const resync = source.indexOf('resyncGranularRecipeRecords(fabricate.recipeManager)');
    assert.ok(resync > -1, 'the ready callback still performs the resync');
    for (const registration of [
      "Hooks.on('updateSetting', handleFabricateSettingDocumentChange);",
      "Hooks.on('createSetting', handleFabricateSettingDocumentChange);",
      "Hooks.on('deleteSetting', handleFabricateSettingDocumentDelete);",
    ]) {
      const at = source.indexOf(registration);
      assert.ok(at > -1, `${registration} is still registered`);
      assert.ok(at < resync, `the resync follows ${registration}`);
    }
    // The gate check: no GM predicate between the last registration and the resync call.
    const between = source.slice(
      source.indexOf("Hooks.on('deleteSetting', handleFabricateSettingDocumentDelete);"),
      resync
    );
    assert.ok(!between.includes('isGM'), 'no isGM gate encloses the resync');
    assert.ok(!between.includes('activeGM'), 'and no activeGM gate does either');
  });
});

describe('the localized strings the forward direction needs exist', () => {
  const lang = JSON.parse(readFileSync(new URL('../lang/en.json', import.meta.url), 'utf8'));

  it('carries a complete sentence for every new outcome', () => {
    for (const name of [
      'ConvertedToPerRecord',
      'ConvertedLegacySurvives',
      'Deferred',
      'Declined',
      'Refused',
      'ReclaimRefused',
      'LegacySurvivorDiverged',
      'UnknownArrangement',
    ]) {
      const value = lang.FABRICATE.Settings.RecipeStorageTarget[name];
      assert.ok(Boolean(value), `FABRICATE.Settings.RecipeStorageTarget.${name} is missing`);
      assert.ok(
        !value.includes('singleArray') && !value.includes('perRecord') && !value.includes('unsettled'),
        `${name} interpolates or names a raw layout token`
      );
    }
  });
});
