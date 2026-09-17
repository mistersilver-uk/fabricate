/**
 * The manager layout suites' ONE Chromium, and the cascade page they measure inside (issue 1670).
 *
 * `manager-layout.test.js` was a single 13,915-line file, and the reason it had to stay one file
 * was the browser: it opened ONE `chromium.launch()` for 129 tests because a process per test blew
 * the file's CI budget. Splitting it per surface would have re-introduced that cost one level up —
 * `node --test` runs a process per `*.test.js`, so six suites would be six launches.
 *
 * So the lifecycle lives HERE rather than in any suite, and the six surface modules are plain
 * `.js` imported by one `manager-layout.test.js` entry: one process, one module instance of this
 * file, one browser. A suite never touches `chromium` and never closes the browser — it closes its
 * own CONTEXT, which is the isolation that actually matters (cookies, `document`, injected markup)
 * and costs a fraction of a process.
 */
import { after } from 'node:test';

import { chromium } from 'playwright';

/**
 * Launched on first use and closed once, by the root hook registered below.
 *
 * The hook is registered at MODULE LOAD, not at first launch: `node:test` collects root hooks
 * before the run starts, so a hook registered from inside a running test is too late to close
 * anything and the process would hang on a live browser.
 */
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

/**
 * A fresh browser CONTEXT on the shared browser, for a suite that drives its own pages.
 *
 * @param {import('playwright').BrowserContextOptions} [options]
 * @returns {Promise<import('playwright').BrowserContext>}
 */
export async function openLayoutContext(options) {
  return (await sharedBrowser()).newContext(options);
}

/**
 * Read one element's border box and its computed style, in the page.
 *
 * Serialized into Chromium, so it closes over nothing. A missing element THROWS rather than
 * returning `null`: a probe whose selector stopped matching is a broken measurement, and a
 * silent `null` reads downstream as a geometry that merely differs.
 *
 * ITERATING A `CSSStyleDeclaration` YIELDS LONGHANDS ONLY, so the snapshot carries `overflow-x`
 * and not `overflow`, `grid-template-columns` and not `grid-template`. A caller wanting a
 * SHORTHAND names it in `properties`, which is read through `getPropertyValue` and merged over
 * the snapshot — otherwise the read is `undefined` and every comparison against it is vacuous.
 *
 * @param {{selector: string, properties: readonly string[]}} request
 * @returns {{box: {x: number, y: number, width: number, height: number, top: number,
 *   right: number, bottom: number, left: number}, style: Record<string, string>}}
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

/**
 * Lay `html` out under `cssSources`, in the order given, on the shared browser.
 *
 * The sheets are injected as separate `<style>` elements ahead of the markup, which is the
 * cascade the product ships: `styles/fabricate.css` first, then each component's compiled scoped
 * block after it, exactly as `css: 'injected'` orders them. Pass `cssSources: []` when the fixture
 * is a whole document that carries its own head.
 *
 * @param {string} html
 * @param {readonly string[]} [cssSources]
 * @param {import('playwright').BrowserContextOptions} [options]
 * @returns {Promise<LayoutView>}
 */
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
