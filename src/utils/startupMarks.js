/**
 * Explicit `performance.mark` boundaries around Fabricate's startup phases (issue 1073), so "ready
 * time attributable to Fabricate" is a measured span rather than a guess. A module rather than
 * inline calls in `main.js` because the instrumentation must be incapable of breaking a boot — a
 * partial `performance`, an unopened end and a duplicate span are all no-ops — and because the mark
 * NAMES are a contract `scripts/lib/foundryPerfCapture.js` reads, pinned by a unit test. No Foundry
 * global, and `performance` resolves at call time so a test can inject one.
 */

/** Namespace every mark and measure this module emits. */
export const STARTUP_MARK_PREFIX = 'fabricate';

/** The startup phases, in the order `Fabricate.initialize()` runs them. */
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

/** The measure name a phase reports under. */
export function startupMeasureName(phase) {
  return `${STARTUP_MARK_PREFIX}:${phase}`;
}

/** The mark names bounding a phase. */
export function startupMarkNames(phase) {
  const measure = startupMeasureName(phase);
  return { start: `${measure}:start`, end: `${measure}:end` };
}

/** Open and close named startup spans on a `performance`-like object. */
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
        // As above.
      } finally {
        open.delete(phase);
      }
    },

    /** Phases begun but not yet ended — a non-empty result after startup means a missing `end`. */
    opened: () => [...open],
  };
}
