/**
 * Browser-side performance capture for the Foundry perf profile (issue 1073): long tasks, heap
 * samples, and the startup spans `src/utils/startupMarks.js` emits.
 *
 * ## Everything here is pure; the page does the observing
 *
 * The functions below either RETURN a function for the runner to inject into the page, or SUMMARIZE
 * data the page already sent back. Nothing in this module touches Playwright, a browser or a clock,
 * so `node --test` can exercise the summarizers — which is where the arithmetic that could be wrong
 * actually lives.
 *
 * ## Why the bridge is installed before page scripts, not after boot
 *
 * A `PerformanceObserver` only reports entries that occur after it is constructed, and `longtask`
 * has no `buffered: true` replay in every build. Installing it from a `page.evaluate` after
 * `game.ready` would therefore miss the boot — which is the single most long-task-dense stretch of
 * the whole run and the one the "first-page readiness" measurement is about. So the bridge goes in
 * through `addInitScript`, before any page script runs.
 *
 * ## Long tasks are attributed to a scenario, and unattributed ones are kept
 *
 * The runner stamps the current scenario name onto the bridge as it walks. A task landing between
 * scenarios keeps a `null` scenario rather than being dropped or charged to whichever ran next: a
 * long task during a settling period is a real finding, and quietly attributing it to the next
 * scenario would misreport where the cost is.
 */

import { STARTUP_MARK_PREFIX, STARTUP_PHASE_NAMES } from '../../src/utils/startupMarks.js';

/** The page-side global the bridge installs itself on. */
export const PERF_BRIDGE_KEY = '__fabricatePerf';

/**
 * The `longtask` threshold the browser applies, restated for the report.
 *
 * Recorded so a reader knows the count is threshold-relative — the same work yields fewer long tasks
 * on a faster machine, which is exactly why the count stays class 2 rather than being promoted to an
 * assertable invariant.
 */
export const LONG_TASK_THRESHOLD_MS = 50;

/**
 * The init script installed into every page context.
 *
 * Written as a standalone function taking its whole configuration as one argument, because
 * Playwright serializes it and it therefore cannot close over anything in this module.
 *
 * @param {{key: string}} config
 */
export function installPerfBridge({ key }) {
  const bridge = {
    scenario: null,
    longTasks: [],
    heapSamples: [],
    supported: { longTask: false, heap: false },
  };
  globalThis[key] = bridge;

  try {
    const observer = new globalThis.PerformanceObserver((list) => {
      for (const entry of list.getEntries()) {
        bridge.longTasks.push({
          startTime: entry.startTime,
          duration: entry.duration,
          scenario: bridge.scenario,
        });
      }
    });
    observer.observe({ type: 'longtask', buffered: true });
    bridge.supported.longTask = true;
  } catch {
    // A build without the Long Tasks API records nothing rather than failing the run; the report
    // says `supported.longTask: false` so an empty list is never read as "no long tasks".
  }

  bridge.supported.heap = typeof globalThis.performance?.memory?.usedJSHeapSize === 'number';

  bridge.sampleHeap = (label) => {
    const used = globalThis.performance?.memory?.usedJSHeapSize ?? null;
    bridge.heapSamples.push({ label, scenario: bridge.scenario, usedJSHeapSize: used });
    return used;
  };
}

/**
 * Summarize the long tasks the bridge collected.
 *
 * @param {Array<{duration: number, scenario: string|null}>} tasks
 * @returns {{count: number, totalMs: number, maxMs: number,
 *   byScenario: Record<string, {count: number, totalMs: number, maxMs: number}>}}
 */
export function summarizeLongTasks(tasks) {
  const summary = { count: 0, totalMs: 0, maxMs: 0, byScenario: {} };
  for (const task of tasks ?? []) {
    const duration = Number(task?.duration);
    if (!Number.isFinite(duration)) continue;
    // `null` becomes the literal string `unattributed` rather than disappearing into an object key
    // of `"null"`, so the report names the bucket instead of implying a scenario called null.
    const scenario = task.scenario ?? 'unattributed';
    const bucket = (summary.byScenario[scenario] ??= { count: 0, totalMs: 0, maxMs: 0 });
    summary.count += 1;
    summary.totalMs += duration;
    summary.maxMs = Math.max(summary.maxMs, duration);
    bucket.count += 1;
    bucket.totalMs += duration;
    bucket.maxMs = Math.max(bucket.maxMs, duration);
  }
  return summary;
}

/**
 * The name every startup measure carries, derived rather than restated.
 *
 * @param {string} phase
 * @returns {string}
 */
function measureName(phase) {
  return `${STARTUP_MARK_PREFIX}:${phase}`;
}

/**
 * Reduce raw `performance.getEntriesByType('measure')` entries to the startup attribution.
 *
 * Two derived values are worth more than the raw four:
 *
 * - `unattributedMs` — `initialize` minus its three nested spans. That is collaborator construction
 *   and hook registration, and it is the part that has no owner in the performance programme. A
 *   remainder that grows is a finding nobody would see in a single total.
 * - `missing` — phases the page never reported. That happens when the running module predates the
 *   marks, or a build stripped them, and it must not be reported as zero milliseconds: zero is a
 *   measurement and this is its absence.
 *
 * @param {Array<{name: string, duration: number}>} entries
 * @returns {{phases: Record<string, number>, unattributedMs: number|null, missing: string[]}}
 */
export function summarizeStartupMeasures(entries) {
  /** @type {Record<string, number>} */
  const phases = {};
  const missing = [];

  for (const phase of STARTUP_PHASE_NAMES) {
    const entry = (entries ?? []).find((candidate) => candidate?.name === measureName(phase));
    if (entry && Number.isFinite(Number(entry.duration))) phases[phase] = Number(entry.duration);
    else missing.push(phase);
  }

  const [outer, ...nested] = STARTUP_PHASE_NAMES;
  const haveAll = missing.length === 0;
  const unattributedMs = haveAll
    ? phases[outer] - nested.reduce((total, phase) => total + phases[phase], 0)
    : null;

  return { phases, unattributedMs, missing };
}

/**
 * The file name a Chrome DevTools trace is written under.
 *
 * @param {{commit?: string|null, arm?: string, fixtureProfile?: string, capturedAt?: string}} meta
 * @returns {string}
 */
export function traceFilename(meta) {
  const stamp = String(meta?.capturedAt ?? new Date(0).toISOString())
    .replaceAll(':', '-')
    .replace(/\.\d+Z$/, 'Z');
  const shortSha = String(meta?.commit ?? 'nocommit').slice(0, 7);
  return `${stamp}-${shortSha}-${meta?.arm ?? 'noarm'}-${meta?.fixtureProfile ?? 'noprofile'}.json`;
}
