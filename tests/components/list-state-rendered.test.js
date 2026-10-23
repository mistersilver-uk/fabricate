/**
 * Issue 2548 — `<ListState>`'s loading form, measured in Chromium beside the selectable `ListRow`
 * it previews: at each density a skeleton row stands the row's border-box height, nothing in the
 * form animates, and the status line is 11.5px in the muted ink.
 */
import assert from 'node:assert/strict';
import { resolve } from 'node:path';
import { after, before, describe, it } from 'node:test';

import { chromium } from 'playwright';

import { createRawSnippet } from '../../node_modules/svelte/src/index-client.js';
import { renderedPageHead } from '../helpers/renderedPageHead.js';
import { createMountedComponentHarness } from '../helpers/svelte-component-harness.js';

const repoRoot = resolve(import.meta.dirname, '../..');
const component = (name) => `src/ui/svelte/components/${name}.svelte`;

const harnessOf = (name, compiled) =>
  createMountedComponentHarness({
    repoRoot,
    tmpPrefix: `fabricate-list-state-rendered-${name.toLowerCase()}-`,
    compiledModules: compiled.map(component),
    componentPath: component(name),
  });

const snippet = (html) => createRawSnippet(() => ({ render: () => html }));
const open = () => {};

/** The selectable row each density previews, and a one-row loading form at that density. */
const DENSITIES = Object.freeze({
  default: {
    row: { name: 'Alchemy', density: 'default', markSize: 38, selected: false, onOpen: open },
    state: { loading: true, loadingLabel: 'Loading crafting systems…', skeletonRows: 1 },
  },
  dense: {
    row: { name: 'Aria Vance', markSize: 30, selected: false, onOpen: open },
    state: {
      loading: true,
      loadingLabel: 'Loading player characters…',
      skeletonRows: 1,
      density: 'dense',
    },
  },
});

/** Each case's markup, mounted through its own harness, one after the other. */
async function markupOf(name, compiled, propsOf) {
  const harness = harnessOf(name, compiled);
  const markup = {};
  await harness.setup();
  try {
    for (const [density, props] of Object.entries(DENSITIES)) {
      markup[density] = (await harness.mount(propsOf(props))).innerHTML;
      harness.remount();
    }
  } finally {
    harness.teardown();
  }
  return markup;
}

/** Each density's row beside its loading form, in a manager root. */
const page = (rows, states) => `${renderedPageHead(['Medallion', 'ListState'])}
<body class="game"><div class="fabricate fabricate-manager" style="width:1000px">
  <span data-probe="muted" style="color:var(--fab-text-muted)"></span>
  ${Object.keys(DENSITIES)
    .map(
      (density) => `<div data-case="${density}" style="width:320px">
    <div data-part="row">${rows[density]}</div>
    <div data-part="state">${states[density]}</div>
  </div>`
    )
    .join('\n')}
</div></body></html>`;

let browser;
let tab;

before(async () => {
  const rows = await markupOf('ListRow', ['Medallion', 'ListRow'], ({ row }) => ({
    ...row,
    meta: snippet('<span>Twelve recipes</span>'),
  }));
  const states = await markupOf('ListState', ['Notice', 'ListState'], ({ state }) => state);
  browser = await chromium.launch();
  tab = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  await tab.setContent(page(rows, states), { waitUntil: 'load' });
});

after(async () => {
  await browser?.close();
});

/** The row's and the skeleton row's border-box heights in one density's case. */
const heightsOf = (density) =>
  tab.evaluate((id) => {
    const scope = document.querySelector(`[data-case="${id}"]`);
    const height = (selector) => scope.querySelector(selector)?.getBoundingClientRect().height;
    return {
      row: height('[data-part="row"] [data-list-row]'),
      skeleton: height('[data-part="state"] .fabricate-list-state-row'),
    };
  }, density);

describe('ListState, rendered (issue 2548)', () => {
  for (const density of Object.keys(DENSITIES)) {
    it(`(a) stands a ${density} skeleton row the selectable ListRow's height`, async () => {
      const { row, skeleton } = await heightsOf(density);
      assert.ok(row > 30, `${density}: the ListRow renders, at ${row}px`);
      assert.ok(
        Math.abs(skeleton - row) <= 0.5,
        `${density}: the skeleton row is ${skeleton}px against the ListRow's ${row}px`
      );
    });
  }

  it('(b) animates nothing in the loading form', async () => {
    const names = await tab.evaluate(() =>
      [...document.querySelectorAll('[data-part="state"] *')].map(
        (element) => `${element.className}: ${getComputedStyle(element).animationName}`
      )
    );
    assert.ok(names.length > 4, 'the form renders its region, line, row, mark and bars');
    for (const entry of names) assert.ok(entry.endsWith(': none'), entry);
  });

  it('(c) sets the status line at 11.5px in the muted ink', async () => {
    const line = await tab.evaluate(() => {
      const status = document.querySelector('[data-case="default"] [role="status"]');
      const style = getComputedStyle(status);
      return {
        size: style.fontSize,
        color: style.color,
        muted: getComputedStyle(document.querySelector('[data-probe="muted"]')).color,
      };
    });
    assert.equal(line.size, '11.5px');
    assert.ok(line.muted && line.muted !== 'rgba(0, 0, 0, 0)', 'the muted token resolves');
    assert.equal(line.color, line.muted, 'the line is in --fab-text-muted');
  });
});
