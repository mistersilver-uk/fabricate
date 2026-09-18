/**
 * The manager layout suites' ONE Chromium, and the cascade page they measure inside (issue 1670).
 */
import { after } from 'node:test';

import { chromium } from 'playwright';

/** Launched on first use and closed once, by the root hook registered below. */
let browserPromise;

after(async () => {
  if (!browserPromise) return;
  const browser = await browserPromise;
  browserPromise = undefined;
  await browser.close();
});

/** The shared browser, launched at most once per process. */
function sharedBrowser() {
  browserPromise ??= chromium.launch();
  return browserPromise;
}

/** A fresh browser CONTEXT on the shared browser, for a suite that drives its own pages. */
export async function openLayoutContext(options) {
  return (await sharedBrowser()).newContext(options);
}

/**
 * Read one element's border box and its computed style, in the page.
 *
 * @returns {{box: {x: number, y: number, width: number, height: number, top: number, right: number,
 * bottom: number, left: number}, style: Record<string, string>}}
 */
function readBoxAndStyle({ selector, properties }) {
  const element = document.querySelector(selector);
  if (!element) throw new Error(`layout harness: no element matches \`${selector}\``);
  const rect = element.getBoundingClientRect();
  const computed = getComputedStyle(element);
  const style = {};
  for (const property of computed) style[property] = computed.getPropertyValue(property);
  for (const property of properties) style[property] = computed.getPropertyValue(property);
  return {
    box: {
      x: rect.x,
      y: rect.y,
      width: rect.width,
      height: rect.height,
      top: rect.top,
      right: rect.right,
      bottom: rect.bottom,
      left: rect.left,
    },
    style,
  };
}

/**
 * One measured page: the Playwright `page` for bespoke probes, `measure` for the common one, and
 * `close` which disposes the CONTEXT and never the shared browser.
 *
 * @typedef {object} LayoutView
 * @property {import('playwright').Page} page
 * @property {import('playwright').BrowserContext} context
 * @property {(selector: string, properties?: readonly string[]) =>
 *   Promise<{box: object, style: Record<string, string>}>} measure
 * @property {() => Promise<void>} close
 */

/** Lay `html` out under `cssSources`, in the order given, on the shared browser. */
export async function renderWithCascade(html, cssSources = [], options = {}) {
  const context = await openLayoutContext(options);
  const page = await context.newPage();
  const sheets = cssSources.map((sheet) => `<style>${sheet}</style>`).join('');
  await page.setContent(`${sheets}${html}`);
  return {
    page,
    context,
    measure: (selector, properties = []) =>
      page.evaluate(readBoxAndStyle, { selector, properties }),
    close: () => context.close(),
  };
}
