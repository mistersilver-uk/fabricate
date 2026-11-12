/**
 * A Chromium page holding each case's published mount as the seam draws it, under the module sheet,
 * in a `[data-case]` cell, and a reader of one element's role, name and description in Chromium's
 * own accessibility tree (issues 2892, 2894, 2895).
 */
import { resolve } from 'node:path';

import { chromium } from './playwrightChromium.js';
import {
  PUBLISHED_ADAPTER,
  PUBLISHED_COMPILED_MODULES,
  PUBLISHED_RAW_MODULES,
  PUBLISHED_RUNE_MODULES,
  PUBLISHED_SEAM,
  fabricateTarget,
  settle,
  shippedSeam,
} from './publishedComponentModules.js';
import { renderedPageHead } from './renderedPageHead.js';
import { createMountedComponentHarness } from './svelte-component-harness.js';

/**
 * The markup of each `[id, entry, props]` case, in order, each mounted through one fresh seam, settled,
 * read and destroyed.
 */
async function drawnCases(tmpPrefix, cases) {
  const harness = createMountedComponentHarness({
    repoRoot: resolve(import.meta.dirname, '../..'),
    tmpPrefix,
    rawModules: PUBLISHED_RAW_MODULES,
    runeModules: PUBLISHED_RUNE_MODULES,
    compiledModules: PUBLISHED_COMPILED_MODULES,
    componentPath: 'src/ui/svelte/published/PublishedComponentHost.svelte',
  });
  const shells = [];
  await harness.setup();
  try {
    const { publishedComponentRuntime: runtime, COMPONENTS: components } =
      await harness.loadRuneModule(PUBLISHED_ADAPTER);
    const { createPublishedComponents } = await harness.loadRawModule(PUBLISHED_SEAM);
    const ui = shippedSeam({ createPublishedComponents, runtime, components, report() {} });
    const cells = await Promise.all(
      cases.map(async ([id, name, props]) => {
        const target = fabricateTarget(shells);
        const handle = ui.mount(name, { target, props });
        await settle();
        const cell = `<div data-case="${id}">${target.innerHTML}</div>`;
        handle.destroy();
        return cell;
      })
    );
    return cells.join('');
  } finally {
    for (const shell of shells) shell.remove();
    harness.teardown();
  }
}

/**
 * Opens the page; `before` is markup drawn ahead of the cells, `css` a sheet after the module's, and
 * `components` the names whose scoped styles the page carries, for a component with a `<style>` block.
 */
export async function publishedAxPage({
  tmpPrefix,
  cases,
  before = '',
  css = '',
  components = [],
}) {
  const cells = await drawnCases(tmpPrefix, cases);
  const browser = await chromium.launch();
  const tab = await browser.newPage({ viewport: { width: 900, height: 1200 } });
  await tab.setContent(
    `${renderedPageHead(components)}<body class="game"><div class="fabricate fabricate-app" data-fabricate-theme="fabricate">` +
      `<style>[data-case]{display:flex;padding:8px}${css}</style>${before}${cells}</div></body></html>`,
    { waitUntil: 'load' }
  );
  /** The first element `selector` matches, as `{ role, name, description }` in the tree. */
  async function axOf(selector) {
    const session = await tab.context().newCDPSession(tab);
    try {
      const expression = `document.querySelector(${JSON.stringify(selector)})`;
      const { result } = await session.send('Runtime.evaluate', { expression });
      const { nodes } = await session.send('Accessibility.getPartialAXTree', {
        objectId: result.objectId,
        fetchRelatives: false,
      });
      const [own] = nodes;
      return {
        role: own.role?.value,
        name: own.name?.value ?? '',
        description: own.description?.value ?? '',
      };
    } finally {
      await session.detach();
    }
  }
  return { tab, axOf, close: () => browser.close() };
}
