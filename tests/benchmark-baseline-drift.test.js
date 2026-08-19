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
 * The pass cost a measured 4.6 seconds in total while it also carried the storage-arrangement
 * and connect-payload cases (issue 1247), which seeded or converted a 10,000-recipe corpus in
 * an UNTIMED setup; issue 1261 removed them with the arrangement they measured, and 3.3 s is
 * the figure recorded before they were added. That budget is the reason `held-inventory` pins
 * its recipe corpus at 6 rows and `rich-corpus` bounds its solver case at 12 — see the ceilings
 * recorded on each profile. Those bounds buy a guard that runs in the normal suite instead of a
 * fuller measurement that would only ever run by hand and would therefore never catch anything.
 *
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

import {
  DEFAULT_SEED,
  FOUNDRY_ONLY_SCALE_PROFILE_NAMES,
  SCALE_PROFILES,
  SCALE_PROFILE_NAMES,
  SWEPT_SCALE_PROFILE_NAMES,
  buildScaleFixture,
} from './helpers/scale/scaleProfiles.js';

test('every SWEPT profile has a committed class-1 baseline', () => {
  for (const profile of SWEPT_SCALE_PROFILE_NAMES) {
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
  for (const profile of SWEPT_SCALE_PROFILE_NAMES) {
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
for (const profile of SWEPT_SCALE_PROFILE_NAMES) {
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
// The foundry-only escape hatch (issue 1255). The three loops above dropped from
// SCALE_PROFILE_NAMES to SWEPT_SCALE_PROFILE_NAMES, so a profile can now legally have no
// committed baseline. That is exactly the kind of relaxation that widens silently, so the SET
// that enjoys it is pinned by name here and every member has to justify itself.
// ---------------------------------------------------------------------------------------------

test('no profile claims the foundry-only exemption today', () => {
  // EMPTY since issue 1265 removed `granular-corpus` with the storage-arrangement axis it was
  // built for. Pinned as `[]` rather than deleted: the pin is the whole mechanism, and an empty
  // expectation is what makes re-adding a member a visible edit rather than a silent widening.
  assert.deepEqual([...FOUNDRY_ONLY_SCALE_PROFILE_NAMES], []);
  // With the list empty, this assertion is the ONLY load-bearing check on it. Every test below
  // that iterates `FOUNDRY_ONLY_SCALE_PROFILE_NAMES` now iterates nothing and passes
  // unconditionally, so read them as dormant rather than as live coverage: they start checking
  // something again on the first commit that adds a member, which is exactly when they are wanted.
});

test('the two profile lists partition the registry, with no overlap and nothing dropped', () => {
  // A profile that fell out of BOTH lists would be swept by nothing and pinned by nothing, and
  // every assertion in this file would still pass. Checked as a partition rather than as two
  // memberships for that reason.
  assert.deepEqual(
    [...SWEPT_SCALE_PROFILE_NAMES, ...FOUNDRY_ONLY_SCALE_PROFILE_NAMES].sort(),
    [...SCALE_PROFILE_NAMES].sort()
  );
  for (const profile of FOUNDRY_ONLY_SCALE_PROFILE_NAMES) {
    assert.ok(
      !SWEPT_SCALE_PROFILE_NAMES.includes(profile),
      `"${profile}" is both swept and foundry-only`
    );
  }
});

test('a foundry-only profile states why it has no headless cases, and still builds', () => {
  for (const profile of FOUNDRY_ONLY_SCALE_PROFILE_NAMES) {
    assert.ok(
      SCALE_PROFILES[profile].foundryOnlyReason?.length > 0,
      `"${profile}" opts out of the sweep and must say why`
    );
    // The exemption is from the SWEEP, never from being a real fixture. A profile that opted
    // out and then stopped building would be invisible to every other test in this file.
    const fixture = buildScaleFixture({ profile, seed: DEFAULT_SEED });
    assert.equal(fixture.components.length, SCALE_PROFILES[profile].scale.components);
    assert.equal(fixture.recipes.length, SCALE_PROFILES[profile].scale.recipes);
    assert.equal(fixture.foundryOnly, true);
  }
});
