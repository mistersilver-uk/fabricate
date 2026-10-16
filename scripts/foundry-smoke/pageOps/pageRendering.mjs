/**
 * Whether the GM page is producing animation frames. Playwright's click waits for a target to hold
 * its box across two frames, so a page that has stopped rendering stalls every click at "visible,
 * enabled and stable" however healthy its DOM is.
 */

import { diagnoseStall } from './stallDiagnostics.mjs';

/** Resolve to the ms one animation frame took, or `null` when none came within `ms`. */
export async function frameLatency(page, ms) {
  return await page.evaluate(
    (limit) =>
      new Promise((resolve) => {
        const started = performance.now();
        const timer = setTimeout(() => resolve(null), limit);
        requestAnimationFrame(() => {
          clearTimeout(timer);
          resolve(Math.round(performance.now() - started));
        });
      }),
    ms
  );
}

/**
 * Resolve once the page renders frames, bringing it to the front when it has none. Answers `null`
 * for a page that was rendering, else what `diagnose` saw while it was not; throws, with that,
 * when the page renders nothing even in front.
 */
export async function ensurePageRendering(
  page,
  { probeMs = 2000, timeout = 30_000, diagnose = diagnoseStall } = {}
) {
  if ((await frameLatency(page, probeMs)) !== null) return null;
  const stall = await diagnose(page);
  await page.bringToFront();
  if ((await frameLatency(page, timeout)) !== null) return stall;
  throw new Error(
    `the page rendered no frame in ${timeout}ms, even brought to the front. ` +
      `While stalled: ${JSON.stringify(stall)}`
  );
}

/**
 * What a click target looks like to the page when Playwright cannot act on it: whether it exists,
 * its disabled state, its box, its pointer events, what covers its centre, and how
 * long a frame takes. Diagnostic only; it never throws.
 */
export async function describeClickTarget(locator) {
  const page = locator.page();
  const latency = await frameLatency(page, 2000).catch(() => 'unreadable');
  const target = await locator
    .evaluate(
      (element) => {
        const { x, y, width, height } = element.getBoundingClientRect();
        const top = document.elementFromPoint(x + width / 2, y + height / 2);
        return {
          box: [x, y, width, height].map(Math.round).join(','),
          disabled: element.disabled === true,
          ariaDisabled: element.closest('[aria-disabled="true"]')?.tagName ?? null,
          pointerEvents: getComputedStyle(element).pointerEvents,
          coveredBy: element.contains(top) ? null : (top?.outerHTML?.slice(0, 120) ?? null),
          visibility: document.visibilityState,
        };
      },
      null,
      { timeout: 2000 }
    )
    .catch((error) => ({ missing: error.message.split('\n', 1)[0] }));
  return { frameMs: latency, ...target };
}
