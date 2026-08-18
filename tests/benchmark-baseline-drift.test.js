/**
 * The class-1 baseline drift guard (issue 1071) — the harness's actual regression guard.
 *
 * Mirrors `tests/view-lab-chrome-drift.test.js`: re-derive the committed values from source and
 * fail when they have moved. Here the "source" is the synthetic corpus and the code under
 * measurement, and the committed values are the machine-invariant counts in
 * `benchmarks/baselines/<profile>.json`.
 *
 * ## Why counts and not milliseconds
 *
 * A committed wall-clock number is re-measured on a different machine and read as a regression.
 * This repository has already paid for that: `scripts/lib/foundryRunBudget.js` records the
 * Foundry `rc` walk budget being re-estimated three times because hosted-runner timing did not
 * match local. Counts have no such problem — the same fixture examines the same number of
 * candidates everywhere — so counts are what is asserted and timings are never asserted at all.
 *
 * ## Why this test re-runs the benchmarks rather than only reading the files
 *
 * A drift test that compared the baseline to itself would be vacuous. Each profile's count pass
 * is executed here for real (`reps: 0` — the counted pass only, no timed repetitions), which is
 * also what keeps the fixture generators honest: a generator that silently produced the wrong
 * scale would move every count in the file.
 *
 * The pass costs a measured 4.6 seconds in total (three runs, median, at the commit that added
 * the recipe storage-arrangement cases of issue 1247; 3.5 s on the same machine immediately
 * before them, and 3.3 s at the commit that added the connect cases). Those four cases each
 * convert or seed a 10,000-recipe corpus in an UNTIMED setup, which is where the second spent
 * went. That budget is the reason `held-inventory` pins its recipe corpus at 6 rows and
 * `rich-corpus` bounds its solver case at 12 — see the ceilings recorded on each profile. That
 * figure is measured rather than estimated, so a case added later has a real budget to reason
 * against; the previous "roughly ten seconds" was an estimate and is now roughly 2x high. Those bounds buy a guard that runs in the normal suite instead of a
 * fuller measurement that would only ever run by hand and would therefore never catch anything.
 *
 * ## The `setting-envelope-budget` artifact is the ONE term this file cannot re-run (issue 1080)
 *
 * ADR 0001's whole decision now rests on a connect-overhead budget, and the rate that budget is
 * spent at is a `Setting` document envelope measured inside a real Foundry. Nothing headless can
 * produce it, so the gate below is deliberately narrower than the profile gates above and says
 * which half is which rather than implying the whole thing is re-derived. See
 * {@link SETTING_ENVELOPE_GATE_SCOPE}.
 */
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import test from 'node:test';

import {
  BASELINE_REFRESH_HINT as REFRESH_HINT,
  baselinePath,
  diffAgainstBaseline,
} from '../scripts/lib/benchmarkBaselines.js';
import { measureProfiles } from '../scripts/lib/benchmarkRunner.js';
import { FABRICATE_SETTINGS_NAMESPACE } from '../src/config/settings.js';
import {
  PerRecordCraftingDefinitionRepository,
  RECIPE_RECORD_KEY_PREFIX,
} from '../src/systems/PerRecordCraftingDefinitionRepository.js';

import { SETTING_DOCUMENT_ENVELOPE_BYTES } from './helpers/scale/connectPayloadModel.js';
import { DEFAULT_SEED, SCALE_PROFILE_NAMES } from './helpers/scale/scaleProfiles.js';

/** The non-profile artifact recording ADR 0001's connect budget and the rate it is spent at. */
const SETTING_ENVELOPE_ARTIFACT = 'setting-envelope-budget';

/**
 * What the `setting-envelope-budget` gate DOES and DOES NOT catch, stated on the constant
 * because a reader who trusts the wrong half of it will trust the wrong half of ADR 0001.
 *
 * **It catches the key-scheme term.** Key length is re-derivable in this process — the
 * qualified prefix comes out of `FABRICATE_SETTINGS_NAMESPACE` and `RECIPE_RECORD_KEY_PREFIX`
 * through the adapter's own `keyFor()` — so lengthening the prefix moves a committed number
 * and turns this file red. That matters because each added prefix character costs roughly
 * twelve documents of the recorded headroom.
 *
 * **It catches a deliberate edit of the recorded rate**, from two directions. The derived
 * budget figures are recomputed here, so editing `envelopeBytes` alone leaves them
 * inconsistent; and the rate is cross-checked against
 * {@link SETTING_DOCUMENT_ENVELOPE_BYTES} in `tests/helpers/scale/connectPayloadModel.js`, so
 * editing both leaves the two files disagreeing. A re-measurement therefore has to land as a
 * committed diff across both, which is the point of the artifact.
 *
 * **It does NOT catch a Foundry core version changing the envelope**, which is half of the
 * stated hazard. The envelope is a live-harness BYTE measurement — the `_id`, `key`, `user`
 * and `_stats` fields the server wraps a value in — and CI cannot re-derive it. For that term
 * this gate degrades to exactly the self-comparison this file's header calls vacuous: it
 * compares a committed number to another committed number. A core release that widens
 * `_stats` moves the real envelope and every assertion below stays green. Only
 * `npm run test:foundry:perf` sees that, and it is not a CI job.
 *
 * The same limit applies to the per-game-system BAND. One system is measured; the band rule is
 * arithmetic over string lengths, not a second measurement, and this gate re-derives only the
 * arithmetic.
 *
 * @type {string}
 */
const SETTING_ENVELOPE_GATE_SCOPE =
  'gates the key-scheme term and a deliberate edit of the recorded rate; does NOT gate a ' +
  'Foundry core version changing the envelope — only npm run test:foundry:perf sees that.';

/**
 * The fully-qualified per-record recipe key prefix, re-derived through the shipped key builder
 * rather than reassembled here, so the committed length is checked against the code that
 * actually produces the keys.
 *
 * @returns {string}
 */
function deriveRecipeKeyPrefix() {
  const repository = new PerRecordCraftingDefinitionRepository({
    keyPrefix: RECIPE_RECORD_KEY_PREFIX,
  });
  const probeId = 'driftProbeId';
  const key = repository.keyFor(probeId);
  assert.ok(key.endsWith(probeId), `keyFor() no longer appends the record id: ${key}`);
  return key.slice(0, key.length - probeId.length);
}

test('every profile has a committed class-1 baseline', () => {
  for (const profile of SCALE_PROFILE_NAMES) {
    assert.ok(
      existsSync(baselinePath(profile)),
      `no committed baseline for "${profile}". ${REFRESH_HINT}`
    );
  }
});

/**
 * The two classes staying apart is the load-bearing convention. A millisecond that leaks into
 * a committed file is a number a reviewer on another machine will be asked to explain.
 *
 * @param {string} name The committed artifact's file stem.
 * @returns {string} its raw contents, so a caller reads the file once.
 */
function readMachineInvariantArtifact(name) {
  const raw = readFileSync(baselinePath(name), 'utf8');
  assert.ok(
    !/samplesMs|heapDelta|"ms"|durationMs/.test(raw),
    `${name}.json contains machine-DEPENDENT data. Class-2 timings belong in the ` +
      'gitignored .benchmarks/runs/ directory and are never asserted.'
  );
  return raw;
}

test('committed baselines carry counts and NEVER wall clock or heap', () => {
  for (const profile of SCALE_PROFILE_NAMES) {
    const raw = readMachineInvariantArtifact(profile);
    const baseline = JSON.parse(raw);
    assert.equal(baseline.profile, profile);
    assert.ok(Object.keys(baseline.cases).length > 0, `${profile} has no cases`);
    assert.ok(baseline.checksums.corpus, `${profile} has no fixture checksum`);
    assert.ok(baseline.construction, `${profile} does not state its fixture construction`);
  }
});

// One test per profile: the sweep is the expensive part, and a per-profile failure names the
// profile in its own title rather than burying it in one aggregate assertion.
for (const profile of SCALE_PROFILE_NAMES) {
  test(`${profile} class-1 counts match the committed baseline`, async () => {
    const baseline = JSON.parse(readFileSync(baselinePath(profile), 'utf8'));
    const { class1ByProfile } = await measureProfiles({
      profiles: [profile],
      seed: DEFAULT_SEED,
      // The counted pass only. Timed repetitions would add nothing here — nothing in this file
      // may assert on a timing — and would multiply the suite's cost.
      reps: 0,
    });
    const drift = diffAgainstBaseline(baseline, class1ByProfile[profile]);
    assert.deepEqual(drift, [], `class-1 drift in ${profile}:\n  ${drift.join('\n  ')}\n\n${REFRESH_HINT}`);
  });
}

// ---------------------------------------------------------------------------------------------
// The `setting-envelope-budget` artifact (issue 1080). Read `SETTING_ENVELOPE_GATE_SCOPE` above
// before quoting any of this as a regression guard: only half of it is re-derived.
// ---------------------------------------------------------------------------------------------

test('the setting-envelope budget is committed and machine-invariant', () => {
  assert.ok(
    existsSync(baselinePath(SETTING_ENVELOPE_ARTIFACT)),
    `no committed ${SETTING_ENVELOPE_ARTIFACT}.json. ADR 0001's decision rests on it.`
  );
  const artifact = JSON.parse(readMachineInvariantArtifact(SETTING_ENVELOPE_ARTIFACT));
  assert.equal(artifact.artifact, SETTING_ENVELOPE_ARTIFACT);
  // It is NOT a scale profile: it has no fixture, so it must not claim one, and the profile
  // loops above must never be able to pick it up.
  assert.ok(!artifact.profile, 'the envelope budget is not a scale profile and must not name one');
  assert.ok(!SCALE_PROFILE_NAMES.includes(SETTING_ENVELOPE_ARTIFACT));
  assert.ok(artifact.construction, 'the envelope budget does not state its construction');
  // The disclosure is part of the artifact, not only of this file: a reader who opens the JSON
  // must be told which term CI cannot re-derive.
  assert.ok(
    artifact.gates?.notReDerived?.length > 0,
    `the envelope budget must state what it does NOT gate — ${SETTING_ENVELOPE_GATE_SCOPE}`
  );
});

test('the committed key-scheme term matches the key the adapter actually builds', () => {
  const artifact = JSON.parse(readFileSync(baselinePath(SETTING_ENVELOPE_ARTIFACT), 'utf8'));
  const recorded = artifact.keyScheme.recipe;
  const derived = deriveRecipeKeyPrefix();
  assert.equal(
    derived,
    recorded.qualifiedPrefix,
    'the per-record recipe key prefix moved. Each added character costs about ' +
      `${artifact.budget.headroomDocumentsPerAddedPrefixChar} documents of headroom, so ` +
      're-record the budget in the same pull request.'
  );
  assert.equal(derived.length, recorded.qualifiedPrefixChars);
  assert.equal(recorded.namespace, FABRICATE_SETTINGS_NAMESPACE);
  assert.equal(recorded.prefix, RECIPE_RECORD_KEY_PREFIX);
  // The trailing separator is the whole reason `recipe.` does not also match
  // `recipeStorageLayout` / `recipeStorageTarget`, so it is asserted rather than assumed.
  assert.ok(derived.endsWith('.'), `the qualified prefix lost its separator: ${derived}`);
});

test('the committed envelope rate agrees with the connect-payload model', () => {
  const artifact = JSON.parse(readFileSync(baselinePath(SETTING_ENVELOPE_ARTIFACT), 'utf8'));
  const [primary] = artifact.envelope.measured;
  // Two files must agree, so a re-measurement cannot land in one of them. This is a
  // committed-number-to-committed-number comparison and gates an EDIT, never a core release.
  assert.equal(
    primary.envelopeBytes,
    SETTING_DOCUMENT_ENVELOPE_BYTES,
    'the recorded envelope rate and connectPayloadModel.js disagree. A re-measurement must ' +
      'move both in the same pull request.'
  );
  assert.equal(primary.envelopeBytes, primary.settingDocumentBytes - primary.storedValueBytes);
  for (const measurement of artifact.envelope.measured) {
    assert.equal(
      measurement.systemIdentityChars,
      measurement.gameSystem.length + measurement.gameSystemVersion.length,
      `${measurement.gameSystem}'s band term does not match its own identity strings`
    );
  }
});

test('the committed budget arithmetic is recomputed, not asserted', () => {
  const artifact = JSON.parse(readFileSync(baselinePath(SETTING_ENVELOPE_ARTIFACT), 'utf8'));
  const [primary] = artifact.envelope.measured;
  const { budget } = artifact;
  // The whole-array layout pays one byte of array punctuation per record, so the per-record
  // penalty is the envelope less that byte. `connectPayloadModel.js` states the same identity.
  assert.equal(budget.deltaBytesPerRecord, primary.envelopeBytes - 1);
  assert.equal(
    budget.budgetDocuments,
    Math.floor(budget.connectOverheadBudgetBytes / budget.deltaBytesPerRecord),
    'the recorded document ceiling is not the floor of the budget over the per-record penalty'
  );
  assert.equal(
    budget.headroomDocumentsPerAddedPrefixChar,
    budget.budgetDocuments -
      Math.floor(budget.connectOverheadBudgetBytes / (budget.deltaBytesPerRecord + 1)),
    'the recorded per-prefix-character headroom does not follow from the budget'
  );
  // The tolerance itself is a maintainer input pegged to issue 1088's measured index, NOT a
  // crossing point — ADR 0001's first amendment exists because that distinction was lost once.
  assert.ok(
    /tolerance/i.test(budget.budgetProvenance) && !/crossover/i.test(budget.budgetProvenance),
    'the budget must be recorded as a maintainer tolerance, never as a derived crossing point'
  );
});
