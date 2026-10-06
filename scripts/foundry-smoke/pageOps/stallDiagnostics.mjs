/**
 * What a page that renders no frames is doing instead, sampled over a short window through the
 * Chrome DevTools Protocol: its main-thread work by kind, its hottest JavaScript, how late its
 * timers run, and which browser processes burned the CPU. Diagnostic only; it never throws.
 */

const MAIN_THREAD_METRICS = [
  'TaskDuration',
  'ScriptDuration',
  'LayoutDuration',
  'RecalcStyleDuration',
];

/** The `top` callFrames by sampled self time, each `{ fn, at, ms }`, from a CDP `Profile`. */
export function hottestFrames(profile, top = 8) {
  const nodes = new Map((profile?.nodes ?? []).map((node) => [node.id, node]));
  const samples = profile?.samples ?? [];
  const deltas = profile?.timeDeltas ?? [];
  const selfUs = new Map();
  for (const [index, id] of samples.entries()) {
    selfUs.set(id, (selfUs.get(id) ?? 0) + Math.max(deltas[index + 1] ?? deltas[index] ?? 0, 0));
  }
  const byFrame = new Map();
  for (const [id, us] of selfUs) {
    const frame = nodes.get(id)?.callFrame;
    if (!frame) continue;
    const fn = frame.functionName || '(anonymous)';
    const at = `${String(frame.url).split('/').pop()}:${frame.lineNumber + 1}`;
    const key = `${fn} ${at}`;
    const entry = byFrame.get(key) ?? { fn, at, ms: 0 };
    entry.ms += us / 1000;
    byFrame.set(key, entry);
  }
  return [...byFrame.values()]
    .map((entry) => ({ ...entry, ms: Math.round(entry.ms) }))
    .sort((left, right) => right.ms - left.ms)
    .slice(0, top);
}

/** Each named cumulative metric's growth between two `Performance.getMetrics` reads, in ms. */
export function metricGrowth(before, after, names = MAIN_THREAD_METRICS) {
  const read = (metrics, name) => metrics?.find((metric) => metric.name === name)?.value ?? 0;
  return Object.fromEntries(
    names.map((name) => [name, Math.round((read(after, name) - read(before, name)) * 1000)])
  );
}

/** CPU seconds each process type burned between two `SystemInfo.getProcessInfo` reads. */
export function processCpuGrowth(before, after) {
  const start = new Map((before ?? []).map((process) => [process.id, process.cpuTime]));
  const growth = {};
  for (const process of after ?? []) {
    const spent = process.cpuTime - (start.get(process.id) ?? 0);
    growth[process.type] = Math.round(((growth[process.type] ?? 0) + spent) * 100) / 100;
  }
  return growth;
}

/** How late a `ms` timer fires on the page: near zero when its main thread is free. */
async function timerLateness(page, ms) {
  return await page.evaluate(
    (wait) =>
      new Promise((resolve) => {
        const started = performance.now();
        setTimeout(() => resolve(Math.round(performance.now() - started - wait)), wait);
      }),
    ms
  );
}

/** Sample the page for `windowMs` and answer what it spent the window on. */
export async function diagnoseStall(page, windowMs = 5000) {
  const report = {};
  try {
    const session = await page.context().newCDPSession(page);
    const browserSession = await page.context().browser().newBrowserCDPSession();
    await session.send('Performance.enable');
    await session.send('Profiler.enable');
    const metricsBefore = (await session.send('Performance.getMetrics')).metrics;
    const processesBefore = (await browserSession.send('SystemInfo.getProcessInfo')).processInfo;
    await session.send('Profiler.start');
    report.timerLateMs = await timerLateness(page, windowMs);
    const { profile } = await session.send('Profiler.stop');
    const metricsAfter = (await session.send('Performance.getMetrics')).metrics;
    const processesAfter = (await browserSession.send('SystemInfo.getProcessInfo')).processInfo;
    report.mainThreadMs = metricGrowth(metricsBefore, metricsAfter);
    report.processCpuS = processCpuGrowth(processesBefore, processesAfter);
    report.hottest = hottestFrames(profile);
    await session.detach().catch(() => {});
    await browserSession.detach().catch(() => {});
  } catch (error) {
    report.unreadable = String(error?.message ?? error).split('\n', 1)[0];
  }
  return report;
}
