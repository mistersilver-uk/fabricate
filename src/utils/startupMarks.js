/**
 * Explicit `performance.mark` boundaries around Fabricate's startup phases (issue 1073).
 *
 * WHY THIS EXISTS. The Foundry performance profile is asked to report "module/world ready time
 * attributable to Fabricate". Without boundaries that word is unfalsifiable: a stopwatch around the
 * `ready` hook measures Foundry, dnd5e, every other active module and Fabricate together, and any
 * split between them is a guess presented as a number. Marking the phases makes the attribution a
 * measured fact — `performance.getEntriesByType('measure')` in the page returns exactly the spans
 * Fabricate opened and closed, and nothing else.
 *
 * WHY IT IS A MODULE AND NOT FOUR INLINE `performance.mark` CALLS IN `main.js`. Three reasons, and
 * the third is the one that decides it:
 *
 *   1. `main.js` is outside the Prettier corpus and effectively untested; a pure collaborator here
 *      is inside both.
 *   2. The instrumentation must be incapable of breaking a boot. A browser with a partial
 *      `performance` implementation, a phase ended that never began, or a duplicate span must all be
 *      no-ops rather than a thrown error from the middle of `initialize()`. That is a behaviour with
 *      cases, so it wants tests.
 *   3. The mark NAMES are a contract read by a different file in a different language
 *      (`scripts/lib/foundryPerfCapture.js`, in the browser, via a `page.evaluate`). A hand-copied
 *      string in two places rots silently: the profile keeps reporting, and reports nothing.
 *      Exporting the names from one module lets a unit test pin the mirror.
 *
 * NOTHING HERE READS A FOUNDRY GLOBAL, and the default `performance` is resolved at call time rather
 * than at import time so a test can inject one.
 */

/** Namespace every mark and measure this module emits. Never emit an unprefixed name. */
export const STARTUP_MARK_PREFIX = 'fabricate';

/**
 * The startup phases, in the order `Fabricate.initialize()` runs them.
 *
 * `initialize` is the OUTER span and the other three are nested inside it, so
 * `initialize >= migrations + dataLoad + startupMaintenance` always holds. The remainder is the
 * unattributed part of `initialize` — collaborator construction and hook registration — and a
 * profile that finds the remainder growing has learned something a single total would have hidden.
 *
 * These four are not an arbitrary selection. They are the three whole-corpus costs the performance
 * programme is about (`_runMigrations` reads the settings corpus directly across ~36 registered
 * migrations; `RecipeManager.initialize` and `CraftingSystemManager.initialize` deserialize the
 * whole `recipes` and `craftingSystems` payloads; `runStartupMaintenance` re-walks recipes, systems
 * and owned actor items), plus the total they sit in.
 */
export const STARTUP_PHASES = Object.freeze({
  INITIALIZE: 'initialize',
  MIGRATIONS: 'migrations',
  DATA_LOAD: 'data-load',
  STARTUP_MAINTENANCE: 'startup-maintenance',
});

/** Every phase name, in run order. */
export const STARTUP_PHASE_NAMES = Object.freeze([
  STARTUP_PHASES.INITIALIZE,
  STARTUP_PHASES.MIGRATIONS,
  STARTUP_PHASES.DATA_LOAD,
  STARTUP_PHASES.STARTUP_MAINTENANCE,
]);

/**
 * The measure name a phase reports under. This is the string the browser-side capture matches, so it
 * is derived in one place rather than restated.
 *
 * @param {string} phase
 * @returns {string}
 */
export function startupMeasureName(phase) {
  return `${STARTUP_MARK_PREFIX}:${phase}`;
}

/**
 * The mark names bounding a phase.
 *
 * @param {string} phase
 * @returns {{start: string, end: string}}
 */
export function startupMarkNames(phase) {
  const measure = startupMeasureName(phase);
  return { start: `${measure}:start`, end: `${measure}:end` };
}

/**
 * Open and close named startup spans on a `performance`-like object.
 *
 * Every method is total: an absent, partial or throwing `performance` degrades to a no-op, and
 * `end()` for a phase that never began does nothing rather than emitting a span measured from
 * navigation start (which a naive `performance.measure(name, undefined, end)` would silently do —
 * that is a wrong number, which is worse than a missing one).
 *
 * @param {object} [options]
 * @param {object} [options.performance] Injected for tests; defaults to the ambient global.
 * @returns {{begin: (phase: string) => void, end: (phase: string) => void, opened: () => string[]}}
 */
export function createStartupMarks({ performance = globalThis.performance } = {}) {
  /** Phases whose start mark was actually recorded — the precondition for measuring one. */
  const open = new Set();

  const canMark = typeof performance?.mark === 'function';
  const canMeasure = canMark && typeof performance?.measure === 'function';

  return {
    begin(phase) {
      if (!canMeasure) return;
      try {
        performance.mark(startupMarkNames(phase).start);
        open.add(phase);
      } catch {
        // Instrumentation must never be able to fail a boot.
      }
    },

    end(phase) {
      if (!canMeasure || !open.has(phase)) return;
      const { start, end } = startupMarkNames(phase);
      try {
        performance.mark(end);
        performance.measure(startupMeasureName(phase), start, end);
      } catch {
        // As above. A partially recorded span is dropped, not reported half-open.
      } finally {
        open.delete(phase);
      }
    },

    /** Phases begun but not yet ended — a non-empty result after startup means a missing `end`. */
    opened: () => [...open],
  };
}
