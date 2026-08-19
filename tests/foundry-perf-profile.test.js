/**
 * The Foundry perf profile's pure layer (issue 1073).
 *
 * What is worth testing here is precisely what a live run cannot check for itself. A run needs
 * Docker, a licensed Foundry image and roughly an hour; nobody will run it to find out that a
 * preflight message was wrong or that the write budget quietly became proportional to the corpus. So
 * every derivation the profile depends on is exercised here, and the browser walk — which genuinely
 * cannot be unit-tested — is reduced to a registry whose SHAPE is pinned instead.
 *
 * Three of these are guards over hand-maintained mirrors rather than over logic, and they are the
 * ones most likely to earn their keep: the scenario-to-measurement mirror, the startup mark names
 * shared between `src/utils/startupMarks.js` and the browser-side reader, and the assertion that no
 * required workflow invokes the profile.
 */
import { strict as assert } from 'node:assert';
import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

import {
  LONG_TASK_THRESHOLD_MS,
  summarizeLongTasks,
  summarizeStartupMeasures,
  traceFilename,
} from '../scripts/lib/foundryPerfCapture.js';
import {
  MEASUREMENT_CLASS,
  MEASUREMENT_STATUS,
  PERF_MEASUREMENTS,
  PERF_MEASUREMENT_IDS,
  deferredMeasurements,
  implementedMeasurements,
  reconcileResults,
} from '../scripts/lib/foundryPerfMeasurements.js';
import {
  checkPerfPreconditions,
  formatPreflight,
  parseEnvFile,
  resolveEffectiveEnv,
} from '../scripts/lib/foundryPerfPreflight.js';
import {
  FOUNDRY_COMPARABILITY_FIELDS,
  HOST_COMPARABILITY_FIELDS,
  assertFoundryComparable,
  buildPerfRunRecord,
  compareInvariants,
  compareTimings,
  median,
  perfRunFilename,
} from '../scripts/lib/foundryPerfRecord.js';
import { PERF_SCENARIOS, timeOperation } from '../scripts/lib/foundryPerfScenarios.js';
import {
  SCALE_FIXTURE_MODULE,
  SEED_WRITE_BUDGET,
  buildFoundrySeed,
  censusRequestedMix,
  loadScaleFixtureModule,
  seedFidelityProbe,
  toItemCreateData,
} from '../scripts/lib/foundryPerfSeed.js';
import { defaultRunTimeoutMs, EXPECTED_WALK_MS_BY_PROFILE } from '../scripts/lib/foundryRunBudget.js';
import {
  STARTUP_PHASES,
  STARTUP_PHASE_NAMES,
  createStartupMarks,
  startupMarkNames,
  startupMeasureName,
} from '../src/utils/startupMarks.js';

const REPOSITORY_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const SYSTEM_ID = 'benchsys';

/**
 * A fixture with the shape issue 1071's `buildScaleFixture` returns, at an arbitrary size.
 *
 * Built here rather than imported because issue 1071 is a separate lane: this file must pass on a
 * checkout that has the perf profile and not the fixtures. What it MUST match is the fixture's
 * SHAPE, and the mirror test below fails if the real generator is present and disagrees.
 *
 * The actor count is THREE, not one, and that is load-bearing rather than incidental: issue 1071's
 * inventory generator spreads its stacks over a crafting actor plus source actors, and a one-actor
 * fixture makes the "every actor is batched into ONE create call" assertion vacuous — `actors.length`
 * and the constant `1` are the same number, so a per-actor regression passes the budget test.
 *
 * @param {{recipes: number, components: number, stacks: number}} scale
 */
function fakeFixture({ recipes, components, stacks }) {
  const actorCount = 3;
  const componentList = Array.from({ length: components }, (_unused, index) => ({
    id: `component-${index}`,
    name: `Bench Component ${index}`,
    registeredItemUuid: `Compendium.bench.Item.component-${index}`,
  }));

  // The three identity kinds, interleaved: durable, sourceRef, unmatched, repeating.
  const items = Array.from({ length: stacks }, (_unused, index) => {
    const component = componentList[index % Math.max(componentList.length, 1)] ?? null;
    const kind = index % 3;
    if (kind === 0 && component) {
      return {
        name: component.name,
        system: { quantity: 2 },
        _stats: { compendiumSource: component.registeredItemUuid },
        flags: {
          fabricate: {
            roles: { [SYSTEM_ID]: { componentId: component.id } },
            componentId: undefined,
            essences: undefined,
          },
        },
      };
    }
    if (kind === 1 && component) {
      return {
        name: component.name,
        system: { quantity: 3 },
        _stats: { compendiumSource: component.registeredItemUuid },
        flags: { fabricate: { roles: undefined, componentId: undefined, essences: undefined } },
      };
    }
    return {
      name: `Mundane Sundry ${index}`,
      system: { quantity: 1 },
      _stats: {},
      flags: { fabricate: { roles: undefined, componentId: undefined, essences: undefined } },
    };
  });

  return {
    profile: 'fake-corpus',
    seed: 1071,
    harnessVersion: 1,
    system: { id: SYSTEM_ID, name: 'Benchmark Crafting System', components: componentList },
    components: componentList,
    tools: [],
    recipes: Array.from({ length: recipes }, (_unused, index) => ({
      id: `recipe-${index}`,
      name: `Bench Recipe ${index}`,
      craftingSystemId: SYSTEM_ID,
    })),
    inventory: {
      mix: { stacks, unmatchedRatio: 1 / 3, sourceActorCount: actorCount - 1 },
      // Round-robin, exactly as `buildHeldInventory` deals its stacks, so each actor holds a
      // representative slice of the mix rather than a run of one kind.
      actors: Array.from({ length: actorCount }, (_unused, actorIndex) => ({
        name: actorIndex === 0 ? 'Bench Crafter' : `Bench Source ${actorIndex}`,
        type: 'character',
        items: items.filter((_item, itemIndex) => itemIndex % actorCount === actorIndex),
        flags:
          actorIndex === 0
            ? { fabricate: { learnedRecipes: { 'recipe-0': { learnedAt: 0 } } } }
            : { fabricate: { learnedRecipes: {} } },
      })),
    },
  };
}

// ── Seeding ────────────────────────────────────────────────────────────────────────────────

test('seeding writes a bounded number of times whatever the corpus size', () => {
  // Three orders of magnitude apart. If any write were per-record, the large fixture would report a
  // four-figure count here and the small one would not.
  const small = buildFoundrySeed(fakeFixture({ recipes: 10, components: 5, stacks: 6 }));
  const large = buildFoundrySeed(fakeFixture({ recipes: 10_000, components: 5000, stacks: 1200 }));

  for (const [label, seed] of [
    ['small', small],
    ['large', large],
  ]) {
    assert.equal(
      seed.writes.settingWrites,
      SEED_WRITE_BUDGET.settingWrites,
      `${label} fixture must write exactly ${SEED_WRITE_BUDGET.settingWrites} settings`
    );
    assert.equal(
      seed.writes.actorCreateCalls,
      SEED_WRITE_BUDGET.actorCreateCalls,
      `${label} fixture must batch every actor into one create call`
    );
  }
  assert.deepEqual(large.writes, small.writes, 'the write count must not depend on the corpus size');
  assert.ok(
    large.actors.length > 1,
    'the fixture must seed MORE than one actor, or the batching assertion above is vacuous'
  );
});

test('a multi-point inventory series seeds the point that was asked for', () => {
  // Found by running the seeder against issue 1071's REAL fixtures: `held-inventory` carries a
  // 100 / 500 / 1,000 series and a bare `fixture.inventory` is only its FIRST point, so an
  // unparameterised seeder would have run the whole profile at the cheapest point of the axis while
  // reporting it under the axis's name.
  const base = fakeFixture({ recipes: 2, components: 4, stacks: 6 });
  const series = [6, 12, 24].map((stacks) => fakeFixture({ recipes: 2, components: 4, stacks }));
  const fixture = {
    ...base,
    inventorySeries: series.map((entry) => entry.inventory),
  };

  const first = buildFoundrySeed(fixture);
  const last = buildFoundrySeed(fixture, { inventoryPoint: 2 });

  assert.equal(first.invariant.inventoryPoint, 0);
  assert.equal(first.invariant.inventorySeriesLength, 3);
  assert.equal(first.invariant.requestedMix.stacks, 6);
  assert.equal(last.invariant.inventoryPoint, 2);
  assert.equal(last.invariant.requestedMix.stacks, 24, 'the third point holds four times the first');
  assert.deepEqual(last.writes, first.writes, 'a bigger series point is still three writes');

  // A corpus-axis fixture has no series, and must say so rather than claim to be at point 0.
  assert.equal(buildFoundrySeed(base).invariant.inventoryPoint, null);
  assert.equal(buildFoundrySeed(base).invariant.inventorySeriesLength, 1);
});

test('the seed carries the two corpus settings, in the shape the managers read', () => {
  const seed = buildFoundrySeed(fakeFixture({ recipes: 4, components: 2, stacks: 3 }));
  assert.deepEqual(
    seed.settings.map((setting) => `${setting.namespace}.${setting.key}`),
    ['fabricate.craftingSystems', 'fabricate.recipes']
  );
  assert.ok(Array.isArray(seed.settings[0].value), 'craftingSystems is a whole-array payload');
  assert.equal(seed.settings[1].value.length, 4);
  assert.equal(seed.invariant.payloadBytes.recipes, JSON.stringify(seed.settings[1].value).length);
});

test('a held stack translates to Item creation data preserving its identity tier', () => {
  const options = { itemType: 'loot', quantityPath: 'quantity' };
  const durable = toItemCreateData(
    {
      name: 'Iron Ore',
      system: { quantity: 4 },
      _stats: { compendiumSource: 'Compendium.bench.Item.c1' },
      flags: { fabricate: { roles: { benchsys: { componentId: 'c1' } }, essences: undefined } },
    },
    options
  );

  assert.equal(durable.type, 'loot');
  assert.equal(durable.system.quantity, 4);
  assert.equal(durable.flags.fabricate.roles.benchsys.componentId, 'c1');
  assert.ok(
    !Object.hasOwn(durable.flags.fabricate, 'essences'),
    'an undefined flag key must be dropped, not passed to Foundry as present-but-undefined'
  );
  assert.equal(durable._stats.compendiumSource, 'Compendium.bench.Item.c1');

  const unmatched = toItemCreateData({ name: 'Rope', system: { quantity: 1 } }, options);
  assert.ok(!unmatched.flags, 'an item with no Fabricate flags gets no flags block at all');
  assert.ok(!unmatched._stats, 'an item with no source reference gets no _stats block');
});

test('the requested mix is recounted from the translated payloads, not restated', () => {
  const seed = buildFoundrySeed(fakeFixture({ recipes: 2, components: 3, stacks: 9 }));
  const mix = censusRequestedMix(seed.actors, SYSTEM_ID);
  assert.equal(mix.stacks, 9);
  assert.equal(mix.durable, 3, 'one in three stacks carries a durable role flag');
  assert.equal(mix.sourceRef, 3, 'one in three carries only a source reference');
  assert.equal(mix.unmatched, 3, 'one in three resolves to no component at all');
  assert.deepEqual(seed.invariant.requestedMix, mix);
});

test('seed fidelity reports drift when Foundry did not keep what the seed asked for', () => {
  const seed = buildFoundrySeed(fakeFixture({ recipes: 2, components: 3, stacks: 9 }));
  const probe = seedFidelityProbe(seed);

  const kept = probe.describe(probe.expected);
  assert.ok(kept.matches, 'an exact census is not drift');

  // The failure this exists for: `_stats.compendiumSource` is core-managed, so a create call may
  // drop it — turning every sourceRef stack into an unmatched one while the run reports otherwise.
  const dropped = probe.describe({ ...probe.expected, sourceRef: 0 });
  assert.ok(!dropped.matches);
  assert.match(dropped.drift.join(' '), /sourceRef: requested 3, Foundry kept 0/);
});

test('a missing issue-1071 fixture module fails by naming the issue and the path', async () => {
  await assert.rejects(
    () =>
      loadScaleFixtureModule({
        importModule: () => Promise.reject(new Error('ERR_MODULE_NOT_FOUND')),
      }),
    (error) => {
      assert.match(error.message, /1071/);
      assert.match(error.message, new RegExp(SCALE_FIXTURE_MODULE.replaceAll('/', '\\/')));
      assert.match(error.message, /second fixture generator/);
      return true;
    }
  );
});

// ── Preflight ──────────────────────────────────────────────────────────────────────────────

const READY_FACTS = Object.freeze({
  env: { FOUNDRY_USERNAME: 'u', FOUNDRY_PASSWORD: 'p' },
  dockerAvailable: true,
  envFilePresent: true,
  imageCached: true,
  image: 'felddy/foundryvtt:14.365',
  fixturesPresent: true,
  fixtureModule: SCALE_FIXTURE_MODULE,
});

test('the preflight passes when every precondition is met', () => {
  const result = checkPerfPreconditions(READY_FACTS);
  assert.ok(result.ok);
  assert.deepEqual(result.problems, []);
  assert.match(formatPreflight(result), /all preconditions met/);
});

test('each unmet precondition is reported by id, with a fix', () => {
  const cases = [
    ['docker-missing', { dockerAvailable: false }],
    ['credentials-missing', { env: {} }],
    ['image-missing', { imageCached: false }],
    ['fixtures-missing', { fixturesPresent: false }],
  ];
  for (const [id, override] of cases) {
    const result = checkPerfPreconditions({ ...READY_FACTS, ...override });
    assert.ok(!result.ok, `${id} must fail the preflight`);
    const problem = result.problems.find((entry) => entry.id === id);
    assert.ok(Boolean(problem), `${id} must be reported by that id`);
    assert.ok(problem.fix.length > 0, `${id} must carry an actionable fix`);
  }
});

test('a missing image instructs a manual pull and never promises to fetch one', () => {
  const result = checkPerfPreconditions({ ...READY_FACTS, imageCached: false });
  const problem = result.problems.find((entry) => entry.id === 'image-missing');
  assert.match(problem.fix, /docker pull felddy\/foundryvtt:14\.365/);
  assert.match(problem.fix, /will not pull it/);
  assert.match(formatPreflight(result), /nothing was downloaded/i);
});

test('credentials in .env.foundry satisfy the preflight without being exported', () => {
  // The defect this exists for, found by running the preflight for real: it reported
  // `credentials-missing` on a worktree whose `.env.foundry` held both values, in the same breath
  // as acknowledging the file existed.
  const contents = [
    '# Foundry account used by the smoke harness',
    'FOUNDRY_USERNAME=someone',
    'FOUNDRY_PASSWORD = a secret with spaces ',
    'MALFORMED_LINE_WITH_NO_EQUALS',
    '',
  ].join('\n');

  const parsed = parseEnvFile(contents);
  assert.equal(parsed.FOUNDRY_USERNAME, 'someone');
  assert.equal(parsed.FOUNDRY_PASSWORD, 'a secret with spaces');
  assert.ok(!Object.hasOwn(parsed, 'MALFORMED_LINE_WITH_NO_EQUALS'));
  assert.ok(!Object.hasOwn(parsed, '#'), 'a comment is not a key');

  const result = checkPerfPreconditions({
    ...READY_FACTS,
    env: resolveEffectiveEnv({}, contents),
  });
  assert.ok(result.ok, 'credentials in the file must satisfy the preflight');
});

test('the real environment outranks the env file, as it does for the container', () => {
  // `up` only fills a key that is not already set, so the preflight must judge the same value the
  // container will actually receive — otherwise it can pass on a credential nothing forwards.
  const effective = resolveEffectiveEnv(
    { FOUNDRY_USERNAME: 'exported' },
    'FOUNDRY_USERNAME=from-file\nFOUNDRY_PASSWORD=p'
  );
  assert.equal(effective.FOUNDRY_USERNAME, 'exported');
  assert.equal(effective.FOUNDRY_PASSWORD, 'p');
  assert.deepEqual(resolveEffectiveEnv({}, null), {}, 'an absent file contributes nothing');
});

test('a docker-less host is not also told its image is missing', () => {
  // Reporting `image-missing` when the CLI never answered would be an invented fact: nothing looked.
  const result = checkPerfPreconditions({
    ...READY_FACTS,
    dockerAvailable: false,
    imageCached: false,
  });
  assert.ok(result.problems.some((entry) => entry.id === 'docker-missing'));
  assert.ok(!result.problems.some((entry) => entry.id === 'image-missing'));
});

// ── Startup marks ──────────────────────────────────────────────────────────────────────────

/** A `performance` double recording the calls made against it. */
function fakePerformance({ throwOnMeasure = false } = {}) {
  const marks = [];
  const measures = [];
  return {
    marks,
    measures,
    mark: (name) => marks.push(name),
    measure: (name, start, end) => {
      if (throwOnMeasure) throw new Error('measure refused');
      measures.push({ name, start, end });
    },
  };
}

test('a startup phase emits a mark pair and one measure', () => {
  const performance = fakePerformance();
  const marks = createStartupMarks({ performance });
  marks.begin(STARTUP_PHASES.MIGRATIONS);
  marks.end(STARTUP_PHASES.MIGRATIONS);

  const names = startupMarkNames(STARTUP_PHASES.MIGRATIONS);
  assert.deepEqual(performance.marks, [names.start, names.end]);
  assert.deepEqual(performance.measures, [
    { name: startupMeasureName(STARTUP_PHASES.MIGRATIONS), start: names.start, end: names.end },
  ]);
  assert.deepEqual(marks.opened(), []);
});

test('ending a phase that never began measures nothing', () => {
  // The trap: `performance.measure(name, undefined, end)` measures from navigation start and
  // silently reports a large, wrong duration.
  const performance = fakePerformance();
  createStartupMarks({ performance }).end(STARTUP_PHASES.DATA_LOAD);
  assert.deepEqual(performance.measures, []);
  assert.deepEqual(performance.marks, []);
});

test('instrumentation can never fail a boot', () => {
  assert.doesNotThrow(() => {
    const marks = createStartupMarks({ performance: fakePerformance({ throwOnMeasure: true }) });
    marks.begin(STARTUP_PHASES.INITIALIZE);
    marks.end(STARTUP_PHASES.INITIALIZE);
  });
  assert.doesNotThrow(() => {
    const marks = createStartupMarks({ performance: undefined });
    marks.begin(STARTUP_PHASES.INITIALIZE);
    marks.end(STARTUP_PHASES.INITIALIZE);
    assert.deepEqual(marks.opened(), []);
  });
});

test('an unclosed phase is reported rather than silently dropped', () => {
  const marks = createStartupMarks({ performance: fakePerformance() });
  marks.begin(STARTUP_PHASES.STARTUP_MAINTENANCE);
  assert.deepEqual(marks.opened(), [STARTUP_PHASES.STARTUP_MAINTENANCE]);
});

test('main.js opens and closes every declared startup phase', () => {
  // The mirror that rots silently: a phase declared here but never marked in `initialize()` makes
  // the profile report `missing` forever while every gate stays green.
  const source = readFileSync(join(REPOSITORY_ROOT, 'src', 'main.js'), 'utf8');
  for (const phase of STARTUP_PHASE_NAMES) {
    const constant = Object.entries(STARTUP_PHASES).find(([, value]) => value === phase)[0];
    const begins = source.split(`_startupMarks.begin(STARTUP_PHASES.${constant})`).length - 1;
    const ends = source.split(`_startupMarks.end(STARTUP_PHASES.${constant})`).length - 1;
    assert.equal(begins, 1, `main.js must begin the ${phase} phase exactly once`);
    assert.equal(ends, 1, `main.js must end the ${phase} phase exactly once`);
  }
});

// ── Capture summarizers ────────────────────────────────────────────────────────────────────

test('long tasks are bucketed by scenario, and an unattributed one is kept', () => {
  const summary = summarizeLongTasks([
    { duration: 60, scenario: 'manager-open' },
    { duration: 140, scenario: 'manager-open' },
    { duration: 55, scenario: null },
    { duration: Number.NaN, scenario: 'manager-open' },
  ]);
  assert.equal(summary.count, 3, 'a non-finite duration is not a long task');
  assert.equal(summary.totalMs, 255);
  assert.equal(summary.maxMs, 140);
  assert.deepEqual(summary.byScenario['manager-open'], { count: 2, totalMs: 200, maxMs: 140 });
  assert.deepEqual(summary.byScenario.unattributed, { count: 1, totalMs: 55, maxMs: 55 });
  assert.ok(LONG_TASK_THRESHOLD_MS > 0);
});

test('startup attribution reports the unexplained remainder of initialize', () => {
  const summary = summarizeStartupMeasures([
    { name: 'fabricate:initialize', duration: 1000 },
    { name: 'fabricate:migrations', duration: 400 },
    { name: 'fabricate:data-load', duration: 300 },
    { name: 'fabricate:startup-maintenance', duration: 200 },
    { name: 'unrelated:thing', duration: 9999 },
  ]);
  assert.deepEqual(summary.missing, []);
  assert.equal(summary.phases.initialize, 1000);
  assert.equal(summary.unattributedMs, 100, 'collaborator construction and hook registration');
});

test('an absent startup phase is missing, not zero', () => {
  const summary = summarizeStartupMeasures([{ name: 'fabricate:initialize', duration: 1000 }]);
  assert.deepEqual(summary.missing, ['migrations', 'data-load', 'startup-maintenance']);
  assert.equal(summary.unattributedMs, null, 'a remainder over missing terms would be fiction');
  assert.ok(!Object.hasOwn(summary.phases, 'migrations'));
});

test('a trace file names the commit, the arm and the fixture', () => {
  const name = traceFilename({
    capturedAt: '2026-08-13T10:20:30.400Z',
    commit: 'abcdef1234567890',
    arm: 'v13',
    fixtureProfile: 'held-inventory',
  });
  assert.equal(name, '2026-08-13T10-20-30Z-abcdef1-v13-held-inventory.json');
});

// ── The measurement registry and its mirror ───────────────────────────────────────────────

test('every measurement issue 1073 asks for is declared, with a class and a status', () => {
  assert.ok(PERF_MEASUREMENTS.length >= 10);
  for (const measurement of PERF_MEASUREMENTS) {
    assert.ok(measurement.title.length > 0, `${measurement.id} needs a title`);
    assert.ok(measurement.classes.length > 0, `${measurement.id} must declare its classes`);
    for (const declared of measurement.classes) {
      assert.ok(
        declared === MEASUREMENT_CLASS.INVARIANT || declared === MEASUREMENT_CLASS.TIMING,
        `${measurement.id} declared an unknown measurement class`
      );
    }
    if (measurement.status === MEASUREMENT_STATUS.DEFERRED) {
      assert.ok(
        measurement.blockedBy?.length > 0,
        `${measurement.id} is deferred and must say what blocks it`
      );
    }
  }
  assert.equal(new Set(PERF_MEASUREMENT_IDS).size, PERF_MEASUREMENT_IDS.length);
});

test('the deferred measurements are exactly the two with no shippable subject', () => {
  assert.deepEqual(
    deferredMeasurements().map((measurement) => measurement.id).sort(),
    ['persistence-experiments', 'propagation-unhydrated']
  );
});

test('every implemented measurement has a scenario, and every scenario a measurement', () => {
  // The hand-maintained mirror. Break either side and the profile reports nothing for a
  // measurement while exiting zero.
  const declared = new Set(implementedMeasurements().map((measurement) => measurement.id));
  const covered = new Set(PERF_SCENARIOS.map((scenario) => scenario.measurementId));

  for (const id of declared) {
    assert.ok(covered.has(id), `measurement "${id}" is implemented but no scenario produces it`);
  }
  for (const id of covered) {
    assert.ok(declared.has(id), `scenario "${id}" names no implemented measurement`);
  }
  for (const scenario of PERF_SCENARIOS) {
    const runnable = typeof scenario.run === 'function' || scenario.deferredToRunner === true;
    assert.ok(runnable, `scenario "${scenario.id}" neither runs nor defers to the runner`);
  }
});

test('reconciliation names what produced nothing and what nothing declared', () => {
  const reconciled = reconcileResults({
    'manager-open': { timing: { samplesMs: [12] }, invariant: { systems: 1 } },
    'not-a-measurement': { timing: { samplesMs: [1] } },
  });

  assert.deepEqual(reconciled.undeclared, ['not-a-measurement']);
  assert.ok(reconciled.missing.includes('player-open'), 'an implemented measurement with no result');
  assert.ok(
    !reconciled.missing.includes('persistence-experiments'),
    'a deferred measurement producing nothing is expected, not a hole'
  );
  assert.deepEqual(reconciled.timing['manager-open'], { samplesMs: [12] });
  assert.deepEqual(reconciled.invariant['manager-open'], { systems: 1 });
});

test('a repeated operation is sampled after an untimed warm-up', async () => {
  let calls = 0;
  const timing = await timeOperation(
    async () => {
      calls += 1;
    },
    { reps: 3 }
  );
  assert.equal(calls, 4, 'one warm-up plus three sampled repetitions');
  assert.equal(timing.samplesMs.length, 3, 'the warm-up is not in the sample set');
  assert.ok(Number.isFinite(timing.coldMs));
});

// ── The run record ─────────────────────────────────────────────────────────────────────────

function runRecord(overrides = {}) {
  return buildPerfRunRecord({
    host: {
      commit: 'abcdef1234567',
      nodeVersion: '22.22.2',
      cpuModel: 'AMD Ryzen 9 9900X3D',
      arch: 'x64',
      capturedAt: '2026-08-13T10:20:30.400Z',
      ...overrides.host,
    },
    foundry: {
      arm: 'v14',
      foundryVersion: '14.365',
      image: 'felddy/foundryvtt:14.365',
      gameSystem: 'dnd5e@5.3.3',
      browserVersion: '140.0.0',
      fixtureProfile: 'simple-corpus',
      fixtureSeed: 1071,
      ...overrides.foundry,
    },
    seed: overrides.seed ?? { recipes: 10_000 },
    reconciled: overrides.reconciled ?? reconcileResults({}),
  });
}

test('a run record warns, in its own text, that its timings are class 2', () => {
  const record = runRecord();
  assert.match(record.warning, /CLASS 2/);
  assert.match(record.warning, /MUST NOT be asserted/);
  assert.equal(record.schema, 'fabricate-foundry-perf/1');
});

test('two runs are comparable only when host AND Foundry envelopes agree', () => {
  assert.ok(assertFoundryComparable(runRecord(), runRecord()).comparable);

  // EVERY comparability field gets its OWN case, each varying exactly one value. A case that
  // changed two at once (say `arm` and `foundryVersion` together, as a real arm switch does) would
  // still pass if one of the two were dropped from the rule — so the fields would be individually
  // unguarded while the test looked thorough.
  const cases = [
    ...HOST_COMPARABILITY_FIELDS.map((field) => [{ host: { [field]: 'something-else' } }, field]),
    ...FOUNDRY_COMPARABILITY_FIELDS.map((field) => [
      { foundry: { [field]: 'something-else' } },
      field,
    ]),
  ];
  assert.equal(cases.length, 10, 'three host fields plus seven Foundry fields');

  for (const [override, field] of cases) {
    const result = assertFoundryComparable(runRecord(), runRecord(override));
    assert.ok(!result.comparable, `a differing ${field} must refuse comparison`);
    assert.ok(
      result.reasons.some((reason) => reason.includes(`.${field}:`)),
      `the refusal must name ${field}; got ${result.reasons.join(' ')}`
    );
  }
});

test('a run record file name identifies the commit, the arm and the fixture', () => {
  assert.equal(
    perfRunFilename(runRecord()),
    '2026-08-13T10-20-30Z-abcdef1-v14-simple-corpus.json'
  );
});

test('timings are compared as ratios, and a one-sided measurement yields none', () => {
  const baseline = { timing: { 'player-open': { samplesMs: [100, 200, 300] } } };
  const candidate = {
    timing: { 'player-open': { samplesMs: [50, 100, 150] }, 'manager-open': { samplesMs: [10] } },
  };
  const rows = compareTimings(baseline, candidate);
  const playerOpen = rows.find((row) => row.measurement === 'player-open');
  assert.equal(playerOpen.ratio, 0.5, 'medians 200 -> 100');
  const managerOpen = rows.find((row) => row.measurement === 'manager-open');
  assert.equal(managerOpen.ratio, null, 'no baseline median, so no ratio');
});

test('median returns null for an empty sample rather than NaN', () => {
  assert.equal(median([]), null);
  assert.equal(median([3, 1, 2]), 2);
  assert.equal(median([4, 1, 3, 2]), 2.5);
});

test('a moved invariant is reported as a finding, not a refusal', () => {
  const differences = compareInvariants(
    { invariant: { 'definition-edit': { recipesBytes: 22_300_000 } } },
    { invariant: { 'definition-edit': { recipesBytes: 2200 } } }
  );
  assert.equal(differences.length, 1);
  assert.match(differences[0], /definition-edit/);
});

// ── Lifecycle wiring ───────────────────────────────────────────────────────────────────────

test('the perf profile has its own run budget, above every smoke walk', () => {
  assert.ok(Object.hasOwn(EXPECTED_WALK_MS_BY_PROFILE, 'perf'));
  assert.ok(
    defaultRunTimeoutMs('perf') > defaultRunTimeoutMs('full'),
    'seeding 10,000 recipes into a live world and reloading cannot fit a smoke walk budget'
  );
});

test('the perf check reuses the existing up/run/down lifecycle and declares a preflight', () => {
  const source = readFileSync(join(REPOSITORY_ROOT, 'scripts', 'foundry-test.mjs'), 'utf8');
  assert.match(source, /perf: Object\.freeze\(\{/, 'perf is registered on the existing check axis');
  assert.match(source, /script: 'foundry-perf-run\.mjs'/);
  assert.match(source, /preflightArgs: \['--preflight'\]/);
  assert.match(source, /=== foundry-test: PREFLIGHT ===/);
  // The preflight must run BEFORE the build and before `up`, or it has not saved anything.
  assert.ok(
    source.indexOf('=== foundry-test: PREFLIGHT ===') < source.indexOf('=== foundry-test: BUILD ==='),
    'the preflight must precede the build'
  );
});

test('no GitHub workflow invokes the perf profile', () => {
  // The acceptance criterion, checked rather than promised: `perf` must appear in no required check.
  const workflowDir = join(REPOSITORY_ROOT, '.github', 'workflows');
  const offenders = [];
  for (const file of readdirSync(workflowDir).filter((name) => /\.ya?ml$/.test(name))) {
    const source = readFileSync(join(workflowDir, file), 'utf8');
    if (/test:foundry:perf|--check=perf|--profile=perf|foundry-perf-run/.test(source)) {
      offenders.push(file);
    }
  }
  assert.deepEqual(
    offenders,
    [],
    'the perf profile is opt-in and manual; it must not be wired into CI'
  );
});

test('the perf lifecycle forwards the fixture as a flag', () => {
  // A FLAG, not "export the variable yourself": the one command a maintainer is handed has to
  // work on Windows too, where a POSIX `VAR=value npm run ...` prefix is not a thing.
  const source = readFileSync(join(REPOSITORY_ROOT, 'scripts', 'foundry-test.mjs'), 'utf8');
  assert.match(source, /--fixture=\(\.\+\)\$/);
  assert.match(source, /process\.env\.FOUNDRY_PERF_FIXTURE = fixture\[1\]/);
});

test('the scenario registry imports nothing from src/, so a product deletion cannot break it', () => {
  // THE COUPLING THAT ALREADY BIT (issues 1255, 1261, 1265). A static import of a shipped
  // `src/systems/` module made a product-side file deletion a LOAD-TIME `Cannot find module` for
  // this whole registry -- which takes out EVERY scenario, not the one that used the constant.
  //
  // Asserted against the import statements rather than against a whole-file grep: prose here
  // legitimately names `src/` paths, and a grep that matched those would be a gate that can only
  // fail for the wrong reason.
  const source = readFileSync(
    join(REPOSITORY_ROOT, 'scripts', 'lib', 'foundryPerfScenarios.js'),
    'utf8'
  );
  const specifiers = [...source.matchAll(/^\s*import\s[^;]*?from\s+'([^']+)';/gm)].map(
    (match) => match[1]
  );
  assert.deepEqual(
    specifiers.filter((specifier) => specifier.includes('/src/')),
    [],
    'a scenario needs the product from the live PAGE, never from a static import'
  );
});

test('the src-import scan can actually fail', () => {
  // Prove the gate before trusting it. A scan whose regex matched nothing would report the file
  // clean whatever it imported, which is the failure mode every source scan has.
  const perturbed = "import { THING } from '../../src/systems/somewhere.js';\n";
  const specifiers = [...perturbed.matchAll(/^\s*import\s[^;]*?from\s+'([^']+)';/gm)].map(
    (match) => match[1]
  );
  assert.deepEqual(specifiers, ['../../src/systems/somewhere.js']);
  assert.equal(specifiers.filter((specifier) => specifier.includes('/src/')).length, 1);
});
