/**
 * What the Foundry `perf` profile measures, and which class each number belongs to (issue 1073).
 *
 * ## Why a registry rather than a list of `page.evaluate` calls
 *
 * Issue 1073 enumerates ten measurements. A harness that simply implements some of them reports a
 * confident-looking JSON in which an absent measurement and a measurement that returned zero are
 * indistinguishable, and in which nothing says whether a printed number may be asserted. Both
 * failures are silent, and both are the kind this programme exists to stop.
 *
 * So every measurement the issue asks for is declared here — including the ones this change does
 * NOT implement, each with the reason it is not implemented — and the run record is assembled from
 * this registry rather than from whatever the scenarios happened to return. A measurement with no
 * result is reported as missing, by name.
 *
 * ## The two classes, inherited from issue 1071 and not re-invented
 *
 * - **Class 1 — machine-invariant.** Operation and corpus counts, payload byte sizes, row counts,
 *   hook-delivery counts. Reproducible on any machine from `{fixture, seed}`, therefore assertable.
 * - **Class 2 — machine-dependent.** Wall clock, heap, long-task durations. Recorded, never
 *   asserted, and only ever compared as a ratio between two runs on one machine.
 *
 * REAL FOUNDRY WEAKENS CLASS 1, AND THIS IS THE ONE PLACE THAT SAYS SO. Under plain Node a class-1
 * count is invariant full stop. Inside a live Foundry it is invariant *given the Foundry build and
 * the game system*, because those decide document schemas, what a create call preserves, and which
 * hooks fire. That is why every class-1 value here is recorded against the run's arm and Foundry
 * build, and why the profile writes NO committed baseline of its own: the committed, cross-machine
 * baseline is issue 1071's headless one. See `benchmarks/README.md` (issue 1071) for that half.
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

/**
 * Every measurement issue 1073 names, in report order.
 *
 * `id` is the key the scenarios return their results under, so a scenario that changes its id
 * without changing this table reports as missing rather than as silently absent.
 */
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

/**
 * Look one measurement up by id.
 *
 * @param {string} id
 * @returns {object|null}
 */
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

/**
 * Reconcile scenario output against the registry.
 *
 * This is the function that makes an absent measurement loud. It answers three questions no
 * consumer of a raw results object can answer for itself: which declared measurements produced
 * nothing, which results nothing declared, and — for every result that did arrive — which of its
 * values may be asserted and which may only be reported.
 *
 * @param {Record<string, {invariant?: object, timing?: object, unavailable?: string}>} results
 * @returns {{
 *   reconciled: Array<object>,
 *   missing: string[],
 *   undeclared: string[],
 *   invariant: Record<string, object>,
 *   timing: Record<string, object>
 * }}
 */
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
