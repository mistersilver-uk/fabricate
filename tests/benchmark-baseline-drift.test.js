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
 * The pass costs a measured 3.3 seconds in total (three runs, median, at the commit that added
 * the connect cases), which is the reason `held-inventory` pins its recipe corpus at 6 rows and
 * `rich-corpus` bounds its solver case at 12 — see the ceilings recorded on each profile. That
 * figure is measured rather than estimated, so a case added later has a real budget to reason
 * against; the previous "roughly ten seconds" was an estimate and was already 4x high. Those bounds buy a guard that runs in the normal suite instead of a
 * fuller measurement that would only ever run by hand and would therefore never catch anything.
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

import { DEFAULT_SEED, SCALE_PROFILE_NAMES } from './helpers/scale/scaleProfiles.js';

test('every profile has a committed class-1 baseline', () => {
  for (const profile of SCALE_PROFILE_NAMES) {
    assert.ok(
      existsSync(baselinePath(profile)),
      `no committed baseline for "${profile}". ${REFRESH_HINT}`
    );
  }
});

test('committed baselines carry counts and NEVER wall clock or heap', () => {
  // The two classes staying apart is the load-bearing convention. A millisecond that leaks into
  // a committed file is a number a reviewer on another machine will be asked to explain.
  const forbidden = /samplesMs|heapDelta|"ms"|durationMs/;
  for (const profile of SCALE_PROFILE_NAMES) {
    const raw = readFileSync(baselinePath(profile), 'utf8');
    assert.ok(
      !forbidden.test(raw),
      `${profile}.json contains machine-DEPENDENT data. Class-2 timings belong in the ` +
        'gitignored .benchmarks/runs/ directory and are never asserted.'
    );
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
