/**
 * Browser-side performance capture for the Foundry perf profile (issue 1073): long tasks, heap
 * samples, and the startup spans `src/utils/startupMarks.js` emits.
 */

import { STARTUP_MARK_PREFIX, STARTUP_PHASE_NAMES } from '../../src/utils/startupMarks.js';

/** The page-side global the bridge installs itself on. */
export const PERF_BRIDGE_KEY = '__fabricatePerf';

/** The `longtask` threshold the browser applies, restated for the report. */
export const LONG_TASK_THRESHOLD_MS = 50;

/** The init script installed into every page context. */
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

/** Summarize the long tasks the bridge collected. */
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

/** The name every startup measure carries, derived rather than restated. */
function measureName(phase) {
  return `${STARTUP_MARK_PREFIX}:${phase}`;
}

/** Reduce raw `performance.getEntriesByType('measure')` entries to the startup attribution. */
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

/** The file name a Chrome DevTools trace is written under. */
export function traceFilename(meta) {
  const stamp = String(meta?.capturedAt ?? new Date(0).toISOString())
    .replaceAll(':', '-')
    .replace(/\.\d+Z$/, 'Z');
  const shortSha = String(meta?.commit ?? 'nocommit').slice(0, 7);
  return `${stamp}-${shortSha}-${meta?.arm ?? 'noarm'}-${meta?.fixtureProfile ?? 'noprofile'}.json`;
}
