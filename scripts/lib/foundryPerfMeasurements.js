/**
 * What the Foundry `perf` profile measures, and which class each number belongs to (issue 1073).
 */

/** The measurement classes, named so no call site writes a bare `1` or `2`. */
export const MEASUREMENT_CLASS = Object.freeze({
  /** Machine-invariant given the fixture, the Foundry build and the game system. Assertable. */
  INVARIANT: 1,
  /** Wall clock, heap, long tasks. Recorded only. Never asserted, ever. */
  TIMING: 2,
});

/** Why a declared measurement is not implemented by this change. */
export const MEASUREMENT_STATUS = Object.freeze({
  IMPLEMENTED: 'implemented',
  /** Declared by issue 1073, deliberately not built here; `blockedBy` says what would unblock it. */
  DEFERRED: 'deferred',
});

/** Every measurement issue 1073 names, in report order. */
export const PERF_MEASUREMENTS = Object.freeze([
  {
    id: 'startup-phases',
    title: 'Module and world ready time attributable to Fabricate',
    classes: [MEASUREMENT_CLASS.TIMING, MEASUREMENT_CLASS.INVARIANT],
    status: MEASUREMENT_STATUS.IMPLEMENTED,
    detail:
      'Read from the `fabricate:*` performance measures emitted by src/utils/startupMarks.js: the ' +
      'outer `initialize` span plus the `migrations`, `data-load` and `startup-maintenance` spans ' +
      'nested in it. Durations are class 2; the corpus sizes the spans loaded are class 1.',
  },
  {
    id: 'first-page-ready',
    title: 'First-page readiness',
    classes: [MEASUREMENT_CLASS.TIMING],
    status: MEASUREMENT_STATUS.IMPLEMENTED,
    detail:
      'Navigation timing plus the interval from `game.ready` to `game.fabricate.ready`. Wholly ' +
      'class 2 — it is a wall-clock reading of a browser boot and nothing about it is invariant.',
  },
  {
    id: 'long-tasks',
    title: 'Main-thread long tasks',
    classes: [MEASUREMENT_CLASS.TIMING],
    status: MEASUREMENT_STATUS.IMPLEMENTED,
    detail:
      'A `PerformanceObserver` on `longtask`, installed before the page scripts run, attributing ' +
      'each task to the scenario open at the time. Durations are class 2. The COUNT is not ' +
      'promoted to class 1: the 50 ms long-task threshold is itself a wall-clock threshold, so on ' +
      'a fast machine the same work yields fewer tasks.',
  },
  {
    id: 'manager-open',
    title: 'Opening the GM Crafting System Manager',
    classes: [MEASUREMENT_CLASS.TIMING, MEASUREMENT_CLASS.INVARIANT],
    status: MEASUREMENT_STATUS.IMPLEMENTED,
    detail: 'Time to a mounted `.fabricate-manager`; rendered row and system counts are class 1.',
  },
  {
    id: 'manager-recipes',
    title: 'GM recipe browser',
    classes: [MEASUREMENT_CLASS.TIMING, MEASUREMENT_CLASS.INVARIANT],
    status: MEASUREMENT_STATUS.IMPLEMENTED,
    detail: 'Navigating to the Recipes view. Row count and page size are class 1.',
  },
  {
    id: 'manager-components',
    title: 'GM component browser',
    classes: [MEASUREMENT_CLASS.TIMING, MEASUREMENT_CLASS.INVARIANT],
    status: MEASUREMENT_STATUS.IMPLEMENTED,
    detail: 'Navigating to the Components view. Row count and page size are class 1.',
  },
  {
    id: 'manager-search-page',
    title: 'Search, filter and paging in the GM browser',
    classes: [MEASUREMENT_CLASS.TIMING, MEASUREMENT_CLASS.INVARIANT],
    status: MEASUREMENT_STATUS.IMPLEMENTED,
    detail:
      'A search term and a page advance, driven through the manager app store rather than through ' +
      'DOM controls, so the measurement survives a control being restyled. Match counts are ' +
      'class 1.',
  },
  {
    id: 'player-open',
    title: 'Opening the player app on the Crafting tab',
    classes: [MEASUREMENT_CLASS.TIMING, MEASUREMENT_CLASS.INVARIANT],
    status: MEASUREMENT_STATUS.IMPLEMENTED,
    detail:
      'Time to a mounted `#fabricate-app` with its actor bar ready. Listed row count is class 1. ' +
      'This is the path the field report hit at 7.5 s.',
  },
  {
    id: 'player-tabs',
    title: 'Player Inventory, Alchemy and Journal tabs',
    classes: [MEASUREMENT_CLASS.TIMING, MEASUREMENT_CLASS.INVARIANT],
    status: MEASUREMENT_STATUS.IMPLEMENTED,
    detail:
      'One switch per available tab. The Alchemy tab is conditional on an enabled alchemy system ' +
      'with recipes, so its absence is recorded as unavailable rather than as a zero.',
  },
  {
    id: 'player-actor-switch',
    title: 'Switching the acting actor and the component sources',
    classes: [MEASUREMENT_CLASS.TIMING, MEASUREMENT_CLASS.INVARIANT],
    status: MEASUREMENT_STATUS.IMPLEMENTED,
    detail:
      'The inventory axis in its Foundry form: the seeded source actors hold the held-stack ' +
      'fixture, so switching between them re-runs identity resolution over real owned items. ' +
      'Held-stack counts per actor are class 1.',
  },
  {
    id: 'definition-edit',
    title: 'One recipe edit and one component edit',
    classes: [MEASUREMENT_CLASS.TIMING, MEASUREMENT_CLASS.INVARIANT],
    status: MEASUREMENT_STATUS.IMPLEMENTED,
    detail:
      'A single-field edit saved through the managers, which today rewrites the whole `recipes` ' +
      'or `craftingSystems` world setting. The serialized payload byte size is class 1 and is the ' +
      'number that makes the write-amplification argument without a clock.',
  },
  {
    id: 'system-import',
    title: 'Import of a large system',
    classes: [MEASUREMENT_CLASS.TIMING, MEASUREMENT_CLASS.INVARIANT],
    status: MEASUREMENT_STATUS.IMPLEMENTED,
    detail:
      'A bounded import through the public import path. Bounded deliberately: import is quadratic ' +
      'today (issue 1086 owns the fix), so a full-corpus import would not complete. The recipe ' +
      'count imported and the resulting corpus size are class 1.',
  },
  {
    id: 'propagation-hydrated',
    title: 'Cross-client propagation to a client holding the data',
    classes: [MEASUREMENT_CLASS.TIMING, MEASUREMENT_CLASS.INVARIANT],
    status: MEASUREMENT_STATUS.IMPLEMENTED,
    detail:
      'A second browser context joins as a player, then the GM saves one definition edit. Timed ' +
      'from the GM write to the receiver observing the change. The receiver-side hook delivery ' +
      'count is class 1.',
  },
  {
    id: 'propagation-unhydrated',
    title: 'Cross-client propagation to a client that has NOT loaded the record',
    classes: [MEASUREMENT_CLASS.TIMING, MEASUREMENT_CLASS.INVARIANT],
    status: MEASUREMENT_STATUS.DEFERRED,
    blockedBy:
      'issues 1080 and 1089 — no Documents-backed adapter exists to be un-hydrated against',
    detail:
      'ISSUE 1073 IS WRONG ABOUT TODAY. It requires timing "both the hydrated and un-hydrated ' +
      'receiver". That distinction is a property of the DOCUMENTS backend issue 1088 probed: a ' +
      'compendium client holding only the connect-time index gets no update hook on 14.365. The ' +
      'shipped backend is world SETTINGS, which issue 1088 Q4 confirmed replicate IN FULL to every ' +
      'client at connect — so on this backend there is no un-hydrated receiver to time, and a ' +
      'number reported here would be the hydrated one under a second name. The scenario is ' +
      'declared so the gap is visible and so issue 1092 has a named slot to fill.',
  },
  {
    id: 'heap-samples',
    title: 'Browser heap before and after major operations',
    classes: [MEASUREMENT_CLASS.TIMING],
    status: MEASUREMENT_STATUS.IMPLEMENTED,
    detail:
      '`performance.memory.usedJSHeapSize`, sampled around each scenario. Class 2 and unusually ' +
      'weak even for class 2: the reading depends on whatever the garbage collector last did, so ' +
      'it is a hint about allocation pressure and never evidence of a leak.',
  },
  {
    id: 'persistence-experiments',
    title: 'Persistence comparison experiments from issue 1079',
    classes: [MEASUREMENT_CLASS.TIMING, MEASUREMENT_CLASS.INVARIANT],
    status: MEASUREMENT_STATUS.DEFERRED,
    blockedBy:
      'issue 1080 — issue 1079 HAS run and chose a backend, but its prototypes were ' +
      'deliberately not versioned (see ADR 0001, Provenance), so there is no adapter here to ' +
      'measure until 1080 implements the selected one',
    detail:
      'Issue 1073 asks for these "where prototyped". Nothing is prototyped: issue 1079 has not ' +
      'run, and issue 1089 (the repository abstraction the alternatives would plug into) has not ' +
      'landed. The settings arm is measured by `definition-edit` above, which is the control any ' +
      'later prototype is compared against.',
  },
]);

/** Every measurement id, in report order. */
export const PERF_MEASUREMENT_IDS = Object.freeze(
  PERF_MEASUREMENTS.map((measurement) => measurement.id)
);

/** Look one measurement up by id. */
export function findMeasurement(id) {
  return PERF_MEASUREMENTS.find((measurement) => measurement.id === id) ?? null;
}

/** The measurements this change actually runs. */
export function implementedMeasurements() {
  return PERF_MEASUREMENTS.filter(
    (measurement) => measurement.status === MEASUREMENT_STATUS.IMPLEMENTED
  );
}

/** The measurements declared but not built, each carrying what blocks it. */
export function deferredMeasurements() {
  return PERF_MEASUREMENTS.filter(
    (measurement) => measurement.status === MEASUREMENT_STATUS.DEFERRED
  );
}

/** Reconcile scenario output against the registry. */
export function reconcileResults(results) {
  const supplied = new Set(Object.keys(results ?? {}));
  const reconciled = [];
  const missing = [];
  /** @type {Record<string, object>} */
  const invariant = {};
  /** @type {Record<string, object>} */
  const timing = {};

  for (const measurement of PERF_MEASUREMENTS) {
    const result = results?.[measurement.id];
    supplied.delete(measurement.id);

    if (!result) {
      // A DEFERRED measurement producing nothing is expected and is not a hole; an IMPLEMENTED one
      // producing nothing is the failure this reconciliation exists to surface.
      if (measurement.status === MEASUREMENT_STATUS.IMPLEMENTED) missing.push(measurement.id);
      reconciled.push({ ...measurement, produced: false });
      continue;
    }

    if (result.invariant) invariant[measurement.id] = result.invariant;
    if (result.timing) timing[measurement.id] = result.timing;
    reconciled.push({ ...measurement, produced: true, unavailable: result.unavailable ?? null });
  }

  return { reconciled, missing, undeclared: [...supplied], invariant, timing };
}
