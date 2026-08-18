/**
 * Issue 1211 — the total-loss path the forward rows create, the three fixes that close it,
 * and the GM-facing reports that make each one visible.
 *
 * ## The path, as the driver reproduced it against the shipped reconciler
 *
 * ```text
 * start:  layout=singleArray target=perRecord documents=3
 * boot 1: action=failed  (the empty-source guard refused, as designed)
 *         layout=singleArray target=singleArray documents=3
 * boot 2: action=settled reclaimed=3
 *         layout=singleArray target=singleArray documents=0
 * ```
 *
 * `action: 'settled'`, no error, no GM notice, and the corpus is gone on the boot AFTER the
 * one that protected it. The refusal reverted the target onto `singleArray`, which made both
 * keys agree on the one value envelope reclamation is armed by. On the REVERSE direction the
 * same refusal compensates to `perRecord`, which the reclaim gate refuses — so the asymmetry
 * is created by adding the forward rows and defended by nothing that shipped.
 *
 * ## Three fixes, three discriminating guards, and one net that discriminates NOTHING
 *
 * - **A refusal writes no compensation and does not revert the target** — the first describe
 *   block.
 * - **Envelope reclamation refuses a document the settled corpus does not describe** — the
 *   second, with BOTH halves, because a reclaimer that never reclaims satisfies the refusal
 *   half alone and leaks every envelope forever.
 * - **The forward compensation deletes the layout document rather than writing a value** —
 *   `tests/definition-storage-forward-conversion.test.js`, which owns the compensation
 *   fixtures.
 *
 * The two-boot case below is DELIBERATELY not independently discriminating: either of the
 * first two fixes alone makes it green. It is the regression net for the composed hazard, and
 * it is labelled as such so its passing is never read as evidence that any one fix works.
 */

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';

import {
  DEFINITION_STORAGE_LAYOUTS,
  RECIPE_STORAGE_ARRANGEMENT_UNKNOWN_LABEL_KEY,
  RECIPE_STORAGE_TARGET_CHOICES,
  recipeStorageArrangementLabelKey,
  SETTING_KEYS,
} from '../src/config/settings.js';
import { reconcileRecipeStorageLayout } from '../src/systems/definitionStorageConversion.js';

import { mainMethodSource, MAIN_SOURCE } from './helpers/fabricateFacadeHarness.js';
import { instrumentReconcilerCalls } from './helpers/reconcilerCallCounter.js';
import {
  installRecipeStorageWorld,
  LAYOUT_KEY,
  PER_RECORD,
  recipe,
  SINGLE_ARRAY,
  TARGET_KEY,
} from './helpers/recipeStorageWorld.js';

const { env, world } = installRecipeStorageWorld();

const RECIPES_KEY = SETTING_KEYS.RECIPES;
const lang = JSON.parse(readFileSync(new URL('../lang/en.json', import.meta.url), 'utf8'));
const NOTICES = lang.FABRICATE.Settings.RecipeStorageTarget;

/**
 * The world that reaches the refusal: the layout says the corpus is in the legacy key, the
 * legacy key is empty, and three per-record documents exist. Either the layout is a lie or
 * this client cannot read the legacy key, and inferring which from a data key's emptiness is
 * exactly what the specification forbids.
 */
const ORPHANS = [recipe('r1'), recipe('r2'), recipe('r3')];

/** @returns {Promise<object>} the refusal fixture. */
function refusalWorld() {
  return world({
    layout: SINGLE_ARRAY,
    target: PER_RECORD,
    legacy: [],
    records: ORPHANS,
  });
}

describe('a refusal compensates nothing and reverts nothing', () => {
  it('leaves both keys exactly as found and issues no setting write', async () => {
    // *Reddens when* the refusal is routed through the reconciler's generic catch: the target
    // then reverts to `singleArray`, which is the precondition for the reclaim on boot 2.
    const fixture = await refusalWorld();
    const instrument = instrumentReconcilerCalls(fixture.seams);

    const report = await reconcileRecipeStorageLayout(instrument.seams);

    assert.equal(report.action, 'refused');
    assert.match(report.error.message, /does not describe this world's storage/);
    assert.equal(env.settings.get(LAYOUT_KEY), SINGLE_ARRAY, 'the layout still reads singleArray');
    assert.equal(
      fixture.documentExists(LAYOUT_KEY),
      false,
      'and its document is still ABSENT — a compensation write would have created one'
    );
    assert.equal(env.settings.get(TARGET_KEY), PER_RECORD, 'the target was NOT reverted');
    assert.deepEqual(instrument.calls, [], 'no setSetting call was issued at all');
    assert.deepEqual(fixture.recordIds(), ['r1', 'r2', 'r3']);
  });
});

describe('envelope reclamation refuses a document the settled corpus does not describe', () => {
  /** A settled legacy world with documents left over. */
  function settledLegacyWorld(legacy, records) {
    return world({ layout: SINGLE_ARRAY, target: SINGLE_ARRAY, legacy, records });
  }

  it('(a) reclaims NOTHING when the legacy array names none of the documents', async () => {
    const fixture = await settledLegacyWorld([], ORPHANS);

    const report = await reconcileRecipeStorageLayout(fixture.seams);

    assert.equal(report.action, 'reclaim-refused');
    assert.equal(report.reclaimed, 0);
    assert.equal(report.kept, 3, 'the report names how many documents it refused to delete');
    assert.equal(report.records, 0, 'and how many recipes the settled corpus holds');
    assert.deepEqual(fixture.recordIds(), ['r1', 'r2', 'r3'], 'all three survive');
  });

  it('(b) still reclaims when the legacy array describes every document', async () => {
    // The half that stops the guard being satisfied by never reclaiming. Without it a
    // reclaimer that refuses unconditionally passes (a) and leaks every envelope forever with
    // no detector, which is the failure the retry exists to prevent.
    const described = [recipe('r1'), recipe('r2'), recipe('r3')];
    const fixture = await settledLegacyWorld(described, [recipe('r1'), recipe('r2')]);

    const report = await reconcileRecipeStorageLayout(fixture.seams);

    assert.equal(report.action, 'settled');
    assert.equal(report.reclaimed, 2);
    assert.deepEqual(fixture.recordIds(), []);
  });

  it('(c) applies the rule PER DOCUMENT on a partial overlap', async () => {
    // Precision rather than data safety: an all-or-nothing rule also keeps `r3`, which is the
    // only document that could hold what the settled corpus lacks. This pins WHICH rule
    // shipped, so the two cannot be confused later.
    const fixture = await settledLegacyWorld([recipe('r1'), recipe('r2')], ORPHANS);

    const report = await reconcileRecipeStorageLayout(fixture.seams);

    assert.equal(report.action, 'reclaim-refused');
    assert.equal(report.reclaimed, 2, 'an all-or-nothing rule reclaims 0 here');
    assert.equal(report.kept, 1);
    assert.deepEqual(fixture.recordIds(), ['r3'], 'and the undescribed one is what survives');
  });
});

describe('two boots, end to end', () => {
  it('NOT independently discriminating — the net for the composed hazard', async () => {
    // Either fix above alone makes this green, which is exactly why both have their own
    // mutation. *Reddens when* BOTH are absent, which is the state the driver reproduced:
    // `boot 1 documents=3` -> `boot 2 action=settled reclaimed=3 documents=0`.
    const fixture = await refusalWorld();

    const first = await reconcileRecipeStorageLayout(fixture.seams);
    const second = await reconcileRecipeStorageLayout(fixture.seams);

    assert.equal(first.action, 'refused');
    assert.equal(second.action, 'refused', 'boot 2 refuses again rather than settling');
    assert.equal(second.reclaimed ?? 0, 0);
    assert.deepEqual(fixture.recordIds(), ['r1', 'r2', 'r3'], 'the corpus survives boot 2');
  });
});

describe('a legacy document surviving on a settled granular world is not an orphan', () => {
  const corpus = [recipe('r1'), recipe('r2')];

  it('retries step 4 when the survivor is byte-identical debris', async () => {
    const fixture = await world({
      layout: PER_RECORD,
      target: PER_RECORD,
      legacy: structuredClone(corpus),
      records: corpus,
    });
    assert.equal(fixture.documentExists(RECIPES_KEY), true);

    const report = await reconcileRecipeStorageLayout(fixture.seams);

    assert.equal(report.action, 'settled');
    assert.equal(report.reclaimed, 1);
    assert.equal(fixture.documentExists(RECIPES_KEY), false, 'step 4 is retried');
    assert.deepEqual(fixture.recordIds(), ['r1', 'r2'], 'and the granular corpus is untouched');
  });

  it('KEEPS a divergent survivor and reports both counts', async () => {
    // The downgrade round trip: an older build read the surviving legacy document, the GM
    // edited normally, and the next upgrade reads the granular corpus. *Reddens when* the
    // detector reclaims unconditionally — the edits are then discarded silently, which is the
    // quiet downgrade-lossy case the detector exists for.
    const edited = [{ ...recipe('r1'), name: 'edited on the older build' }];
    const fixture = await world({
      layout: PER_RECORD,
      target: PER_RECORD,
      legacy: edited,
      records: corpus,
    });

    const report = await reconcileRecipeStorageLayout(fixture.seams);

    assert.equal(report.action, 'legacy-survivor-diverged');
    assert.equal(report.legacyRecords, 1);
    assert.equal(report.granularRecords, 2);
    assert.equal(fixture.documentExists(RECIPES_KEY), true, 'the document is untouched');
    assert.deepEqual(env.settings.get(RECIPES_KEY), edited, 'and so is its value');
  });

  it('says nothing at all when no legacy document survives', async () => {
    const fixture = await world({
      layout: PER_RECORD,
      target: PER_RECORD,
      legacy: [],
      legacyDocument: false,
      records: corpus,
    });

    const report = await reconcileRecipeStorageLayout(fixture.seams);

    assert.equal(report.action, 'settled');
    assert.equal(report.reclaimed, 0);
    // Presence, never the value: a deleted registered setting reads back as its `[]` default,
    // so a detector that consulted the VALUE would find "an empty legacy corpus" on every
    // converted world and either report it forever or reclaim a document that is not there.
    assert.deepEqual(env.settings.get(RECIPES_KEY), []);
  });
});

describe('the GM is told, in terms that are not the reverse direction’s', () => {
  const announce = mainMethodSource('  _announceDefinitionStorageOutcome(report) {', MAIN_SOURCE);
  const completed = mainMethodSource(
    '  _announceCompletedStorageConversion(report, format) {',
    MAIN_SOURCE
  );

  it('uses a DIFFERENT key from RST.Converted for the forward direction', () => {
    // `Converted` reads "It is now safe to downgrade Fabricate on this world" — the reverse
    // conversion's message, and the exact inverse of what a forward conversion just did.
    // *Reddens when* the forward path reuses the `converted` branch.
    assert.ok(
      completed.includes('FABRICATE.Settings.RecipeStorageTarget.ConvertedToPerRecord'),
      'the forward direction has its own completion string'
    );
    assert.notEqual(
      'FABRICATE.Settings.RecipeStorageTarget.ConvertedToPerRecord',
      'FABRICATE.Settings.RecipeStorageTarget.Converted'
    );
    assert.ok(
      completed.includes('RECIPE_STORAGE_CONVERSION_DIRECTIONS.FORWARD'),
      'and it is selected by the direction the conversion reported, not guessed from the target'
    );
    assert.match(NOTICES.ConvertedToPerRecord, /no longer be opened with an older version/);
    assert.match(
      NOTICES.ConvertedToPerRecord,
      /Recipe Storage Arrangement/,
      'and it names the control that undoes it'
    );
    assert.match(NOTICES.Converted, /safe to downgrade/, 'the reverse still says the opposite');
  });

  it('cannot render a raw layout token, because the label helper is total', () => {
    // *Reddens when* `label()` keeps its `String(value)` fallback. The leak is real today:
    // the LAYOUT enumeration carries `unsettled` and the operator-facing choices map has no
    // entry for it and never will.
    assert.equal(
      RECIPE_STORAGE_TARGET_CHOICES[DEFINITION_STORAGE_LAYOUTS.UNSETTLED],
      undefined,
      'the leak this hardening closes is reachable, not hypothetical'
    );
    for (const value of [DEFINITION_STORAGE_LAYOUTS.UNSETTLED, null, undefined, '', 'nonsense']) {
      const key = recipeStorageArrangementLabelKey(value);
      assert.equal(key, RECIPE_STORAGE_ARRANGEMENT_UNKNOWN_LABEL_KEY, `${value} leaks`);
      assert.ok(Boolean(NOTICES.UnknownArrangement), 'and the miss arm resolves to a phrase');
    }
    assert.equal(
      recipeStorageArrangementLabelKey(PER_RECORD),
      RECIPE_STORAGE_TARGET_CHOICES[PER_RECORD]
    );
    assert.ok(!announce.includes('String(value)'), 'the raw-token fallback is gone');
    assert.ok(
      announce.includes('recipeStorageArrangementLabelKey(value)'),
      'and the total helper is what replaced it'
    );
  });

  it('tells the GM when the conversion was deferred by a boot', () => {
    // *Reddens when* the deferral returns silently, which leaves the setting reading "One
    // record per recipe" beside an unmoved layout and nothing saying why.
    assert.ok(
      announce.includes("case 'deferred':"),
      'the deferral has its own branch in the outcome switch'
    );
    assert.match(
      announce.slice(announce.indexOf("case 'deferred':")),
      /FABRICATE\.Settings\.RecipeStorageTarget\.Deferred[\s\S]{0,200}permanent: true/,
      'and it is a PERMANENT notice — a transient one is missed on a busy boot'
    );
    assert.match(NOTICES.Deferred, /next time a GM loads this world/);
  });

  it('reports both integrity findings permanently, naming both counts each', () => {
    for (const [action, key] of [
      ['reclaim-refused', 'ReclaimRefused'],
      ['legacy-survivor-diverged', 'LegacySurvivorDiverged'],
      ['refused', 'Refused'],
    ]) {
      const branch = announce.slice(announce.indexOf(`case '${action}':`));
      assert.ok(announce.includes(`case '${action}':`), `${action} is reported`);
      assert.match(
        branch,
        new RegExp(`FABRICATE\\.Settings\\.RecipeStorageTarget\\.${key}[\\s\\S]{0,300}permanent: true`),
        `${action} reports permanently`
      );
    }
    assert.match(NOTICES.ReclaimRefused, /\{kept\}[\s\S]*\{records\}/);
    assert.match(NOTICES.LegacySurvivorDiverged, /\{legacyRecords\}[\s\S]*\{granularRecords\}/);
    for (const notice of [NOTICES.ReclaimRefused, NOTICES.LegacySurvivorDiverged, NOTICES.Refused]) {
      assert.ok(!/\{(current|requested)\}/.test(notice), 'no arrangement token is interpolated');
    }
  });
});
