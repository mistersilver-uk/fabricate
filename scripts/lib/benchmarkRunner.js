/**
 * The benchmark runner (issue 1071): builds a profile's fixture, runs its cases, and emits the two
 * measurement classes strictly apart.
 */
import { casesForProfile } from '../../tests/helpers/scale/benchmarkCases.js';
import { fixtureChecksum } from '../../tests/helpers/scale/fixtureChecksum.js';
import { createOperationCounters } from '../../tests/helpers/scale/scaleCounters.js';
import { HARNESS_VERSION, buildScaleFixture } from '../../tests/helpers/scale/scaleProfiles.js';
import { loadBenchmarkModules } from '../../tests/helpers/scale/scaleWorld.js';

/** A fixture's committed identity: the checksum plus the declared scale. */
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

/** Run every case of one profile. */
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
    // `find`/`filter`/`some`, so once identity resolution became index-backed (issue 1076) it would
    // have reported a triumphant zero for work that is genuinely still O(library) once per index
    // build.
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

    // A case that installed ambient state — a global, or a shared setting every other case reads —
    // restores it here.
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

/** Build one profile's fixture, recording (but not asserting) what generation cost. */
export function buildFixtureTimed(profile, seed) {
  const started = performance.now();
  const fixture = buildScaleFixture({ profile, seed });
  return { fixture, generationMs: performance.now() - started };
}

/** Measure every requested profile: fixture, counted pass, timed reps. */
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
