/**
 * The benchmark runner (issue 1071): builds a profile's fixture, runs its cases, and emits the
 * TWO measurement classes strictly apart.
 *
 * ## The two classes, and why they are not one file
 *
 * - **Class 1 — machine-invariant.** Operation counts, hydrated-model counts, candidate
 *   examinations, signature comparisons, graph node/edge counts, serialized payload bytes,
 *   fixture checksums. These are identical on every machine and every Node build, so they are
 *   committed under `benchmarks/baselines/` and asserted by a drift test. This is the actual
 *   regression guard.
 * - **Class 2 — machine-dependent.** Wall clock and heap. Written to gitignored
 *   `.benchmarks/runs/`, never asserted, and only ever reported as a RATIO between two runs on
 *   one machine.
 *
 * A single JSON of milliseconds checked into the repository is the obvious design and the
 * broken one: it gets re-measured on a different machine and read as a regression. Splitting
 * the classes makes the committed artefact genuinely portable and leaves the timings advisory.
 *
 * ## Generation is outside the timed region, structurally
 *
 * `buildScaleFixture` and each case's `setup` run before the clock starts, and the clock only
 * wraps `case.run`. That is not a convention the runner asks callers to honour — it is the only
 * shape the case contract allows. Fixture generation cost is still RECORDED (as class 2), so a
 * generator that gets pathologically slow is visible rather than silently doubling every run.
 */
import { casesForProfile } from '../../tests/helpers/scale/benchmarkCases.js';
import { fixtureChecksum } from '../../tests/helpers/scale/fixtureChecksum.js';
import { createOperationCounters } from '../../tests/helpers/scale/scaleCounters.js';
import { HARNESS_VERSION, buildScaleFixture } from '../../tests/helpers/scale/scaleProfiles.js';
import { loadBenchmarkModules } from '../../tests/helpers/scale/scaleWorld.js';

/**
 * A fixture's committed identity: the checksum plus the declared scale.
 *
 * The checksum covers the CORPUS and the LIBRARY but deliberately not the whole fixture
 * object, because the fixture also carries its own metadata (description, ceiling prose) whose
 * wording must be free to change without reporting generator drift.
 *
 * @param {object} fixture
 * @returns {{corpus: string, components: string, inventory: string}}
 */
export function fixtureChecksums(fixture) {
  return {
    corpus: fixtureChecksum(fixture.recipes),
    components: fixtureChecksum(fixture.components),
    inventory: fixtureChecksum(
      fixture.inventorySeries
        ? fixture.inventorySeries.map((entry) => entry.actors)
        : fixture.inventory.actors
    ),
  };
}

/**
 * Run every case of one profile.
 *
 * @param {object} options
 * @param {object} options.fixture Already built — the runner never times generation.
 * @param {object} options.modules Result of `loadBenchmarkModules`.
 * @param {object[]} options.cases
 * @param {number} options.reps Timed repetitions per case, after one warm-up.
 * @param {(message: string) => void} [options.onProgress]
 * @returns {Promise<{class1: object, class2: object}>}
 */
export async function runProfileCases({ fixture, modules, cases, reps, onProgress = () => {} }) {
  const class1 = {};
  const class2 = {};

  for (const benchmarkCase of cases) {
    onProgress(`  ${benchmarkCase.id}`);
    const counters = createOperationCounters();
    const context = { fixture, modules, counters };

    // ---- untimed ----------------------------------------------------------------
    const state = await benchmarkCase.setup(context);

    // ---- counted pass (also the warm-up) ----------------------------------------
    counters.reset();
    // The fixture-side `countingCandidates` array can only see a scan expressed as
    // `find`/`filter`/`some`, so once identity resolution became index-backed (issue 1076)
    // it would have reported a triumphant zero for work that is genuinely still O(library)
    // once per index build. `definitionIndex` therefore carries its OWN counter, and it is
    // folded into the same class-1 bag here so a baseline shows both halves rather than a
    // number that stopped being able to move.
    modules.definitionIndex.resetIdentityCounters();
    const result = await benchmarkCase.run(state);
    const identity = modules.definitionIndex.readIdentityCounters();
    counters.bump('identityCandidatesExamined', identity.candidatesExamined);
    counters.bump('identityIndexBuilds', identity.indexBuilds);
    const caseCounts = benchmarkCase.counts ? benchmarkCase.counts(state, result, counters) : {};
    class1[benchmarkCase.id] = {
      description: benchmarkCase.description,
      counts: { ...counters.snapshot(), ...caseCounts },
    };

    // ---- timed passes -----------------------------------------------------------
    const samples = [];
    const heapBefore = process.memoryUsage().heapUsed;
    // Reps are sequential BY DESIGN; running them concurrently would have them contend for the
    // same CPU and measure the contention rather than the code.
    for (let rep = 0; rep < reps; rep++) {
      const started = performance.now();
      await benchmarkCase.run(state);
      samples.push(performance.now() - started);
    }
    const heapAfter = process.memoryUsage().heapUsed;

    // A case that installed AMBIENT state — a global, or a shared setting every other case
    // reads — restores it here. The harness shares one settings map and one set of Foundry
    // globals across every case in a profile, so a case that leaves a flag behind silently
    // changes what the cases AFTER it measure, and the damage shows up as a counter quietly
    // going to zero somewhere else. `teardown` is optional and runs after the timed reps, so
    // a case that needs its state for the whole measurement still has it.
    await benchmarkCase.teardown?.(state);

    class2[benchmarkCase.id] = {
      samplesMs: samples,
      // Heap is RECORD-ONLY and must never be asserted: Node reports it after whatever the GC
      // happened to do, so a delta is a hint about allocation pressure and nothing more.
      heapDeltaBytes: heapAfter - heapBefore,
    };
  }

  return { class1, class2 };
}

/**
 * Build one profile's fixture, recording (but not asserting) what generation cost.
 *
 * @param {string} profile
 * @param {number} seed
 * @returns {{fixture: object, generationMs: number}}
 */
export function buildFixtureTimed(profile, seed) {
  const started = performance.now();
  const fixture = buildScaleFixture({ profile, seed });
  return { fixture, generationMs: performance.now() - started };
}

/**
 * Measure every requested profile: fixture, counted pass, timed reps.
 *
 * Lives here rather than in the CLI so the drift test can run the counted pass (`reps: 0`)
 * through exactly the same code path the command uses. A guard that re-implements the thing it
 * guards is a guard over a second implementation.
 *
 * @param {object} options
 * @param {string[]} options.profiles
 * @param {number} options.seed
 * @param {number} options.reps `0` runs the counted pass only.
 * @param {(message: string) => void} [options.onProgress]
 * @returns {Promise<{class1ByProfile: object, class2ByProfile: object, generationMs: object}>}
 */
export async function measureProfiles({ profiles, seed, reps, onProgress = () => {} }) {
  const modules = await loadBenchmarkModules();
  const class1ByProfile = {};
  const class2ByProfile = {};
  const generationMs = {};

  for (const profile of profiles) {
    onProgress(profile);
    // Generation is OUTSIDE every timed region; its own cost is recorded as class 2 so a
    // pathologically slow generator is visible rather than silently doubling each run.
    const built = buildFixtureTimed(profile, seed);
    const { fixture } = built;
    generationMs[profile] = built.generationMs;

    const { class1, class2 } = await runProfileCases({
      fixture,
      modules,
      cases: casesForProfile(profile),
      reps,
      onProgress,
    });

    class1ByProfile[profile] = {
      profile,
      harnessVersion: HARNESS_VERSION,
      seed,
      description: fixture.description,
      construction: fixture.construction,
      requiresNodeModules: fixture.requiresNodeModules,
      ceiling: fixture.ceiling,
      scale: fixture.scale,
      inventoryMix: fixture.inventorySeries
        ? fixture.inventorySeries.map((entry) => entry.mix)
        : [fixture.inventory.mix],
      checksums: fixtureChecksums(fixture),
      cases: class1,
    };
    class2ByProfile[profile] = class2;
  }

  return { class1ByProfile, class2ByProfile, generationMs };
}
