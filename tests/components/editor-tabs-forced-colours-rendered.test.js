/**
 * Issue 2897: under forced colours the strip's transparent tab borders are repainted in the
 * reader's text colour under every tab, so the selected tab must be told from the others by its
 * indicator and not by its weight. The selected tab draws a `Highlight` indicator twice as thick
 * as the others' without moving its box, on the published `EditorTabs` and on the in-app strips
 * that share its stylesheet by class: the environment strip's button class and a danger-toned
 * selected tab. Outside forced colours the indicator is the accent at the same width. Measured in
 * Chromium on the markup the seam draws, with the weights made equal to prove the indicator alone.
 */
import assert from 'node:assert/strict';
import { resolve } from 'node:path';
import { after, before, describe, it } from 'node:test';

import { chromium } from 'playwright';

import { pixelAt } from '../helpers/pagePixels.js';
import {
  PUBLISHED_ADAPTER,
  PUBLISHED_COMPILED_MODULES,
  PUBLISHED_RAW_MODULES,
  PUBLISHED_RUNE_MODULES,
  PUBLISHED_SEAM,
  companionTarget,
  settle,
  shippedSeam,
} from '../helpers/publishedComponentModules.js';
import { renderedPageHead } from '../helpers/renderedPageHead.js';
import { createMountedComponentHarness } from '../helpers/svelte-component-harness.js';

const harness = createMountedComponentHarness({
  repoRoot: resolve(import.meta.dirname, '../..'),
  tmpPrefix: 'fabricate-editor-tabs-forced-',
  rawModules: PUBLISHED_RAW_MODULES,
  runeModules: PUBLISHED_RUNE_MODULES,
  compiledModules: PUBLISHED_COMPILED_MODULES,
  componentPath: 'src/ui/svelte/published/PublishedComponentHost.svelte',
});

const TABS = [
  { id: 'inputs', label: 'Inputs' },
  { id: 'outputs', label: 'Outputs' },
  { id: 'notes', label: 'Notes' },
];

/** Each strip's id and how its published markup is turned into the in-app strip it stands for. */
const STRIPS = Object.freeze({
  published: (html) => html,
  environment: (html) => html.replaceAll('manager-editor-tab', 'manager-environment-tab'),
  danger: (html) => html.replace('is-active', 'is-active is-danger'),
});

let browser;
let tab;

before(async () => {
  const shells = [];
  let markup = '';
  await harness.setup();
  try {
    const { publishedComponentRuntime: runtime, COMPONENTS: components } =
      await harness.loadRuneModule(PUBLISHED_ADAPTER);
    const { createPublishedComponents } = await harness.loadRawModule(PUBLISHED_SEAM);
    const ui = shippedSeam({ createPublishedComponents, runtime, components, report() {} });
    const target = companionTarget(shells);
    const handle = ui.mount('EditorTabs', {
      target,
      props: {
        tabs: TABS,
        activeTab: 'inputs',
        ariaLabel: 'Reagent sections',
        idStem: 'acme-reagents',
        onSelect() {},
      },
    });
    await settle();
    markup = target.innerHTML;
    handle.destroy();
  } finally {
    for (const shell of shells) shell.remove();
    harness.teardown();
  }
  browser = await chromium.launch();
  tab = await browser.newPage({ viewport: { width: 600, height: 400 } });
  await tab.setContent(
    `${renderedPageHead(['EditorTabs'])}<body class="game">` +
      '<div class="fabricate fabricate-app" data-fabricate-theme="fabricate" ' +
      'style="background:var(--fab-bg-1);padding:12px">' +
      // The weights are made equal, so only the indicator can tell the selected tab.
      '<style>.fabricate-tabs button{font-weight:500 !important}</style>' +
      Object.entries(STRIPS)
        .map(
          ([id, make]) => `<div data-strip="${id}" style="margin-bottom:16px">${make(markup)}</div>`
        )
        .join('') +
      '<i data-system style="color:CanvasText;background:Canvas;border:2px solid Highlight"></i>' +
      '<i data-accent style="color:var(--fab-accent)"></i></div></body></html>',
    { waitUntil: 'load' }
  );
});

after(async () => {
  await browser?.close();
});

/** A strip's selected and an unselected tab: the bottom edge's paint and the box and label. */
const drawn = (strip) =>
  tab.$eval(`[data-strip="${strip}"]`, (root) => {
    const textTop = (button) => {
      const range = document.createRange();
      range.selectNodeContents(button);
      return Math.round(range.getBoundingClientRect().top);
    };
    const read = (button) => {
      const style = getComputedStyle(button);
      const box = button.getBoundingClientRect();
      return {
        width: style.borderBottomWidth,
        style: style.borderBottomStyle,
        colour: style.borderBottomColor,
        weight: style.fontWeight,
        height: box.height,
        textTop: textTop(button),
      };
    };
    const [selected, ...others] = [
      root.querySelector('[aria-selected="true"]'),
      ...root.querySelectorAll('[aria-selected="false"]'),
    ].map(read);
    return { selected, others };
  });

const system = () =>
  tab.evaluate(() => {
    const style = getComputedStyle(document.querySelector('[data-system]'));
    return {
      text: style.color,
      highlight: style.borderTopColor,
      accent: getComputedStyle(document.querySelector('[data-accent]')).color,
    };
  });

describe('the editor tab strip under forced colours', () => {
  for (const strip of Object.keys(STRIPS)) {
    it(`draws the ${strip} strip's selected indicator in Highlight and thicker, on a box that does not move`, async () => {
      await tab.emulateMedia({ forcedColors: 'active' });
      try {
        const colours = await system();
        const { selected, others } = await drawn(strip);
        assert.equal(others.length, 2);
        assert.equal(
          selected.weight,
          others[0].weight,
          'the weights are equal, so weight is no cue'
        );
        assert.deepEqual(
          [selected.style, selected.width, selected.colour],
          ['solid', '4px', colours.highlight],
          'the selected indicator'
        );
        for (const other of others) {
          assert.deepEqual(
            [other.style, other.width, other.colour],
            ['solid', '2px', colours.text]
          );
          assert.notEqual(other.colour, colours.highlight, 'an unselected tab is not Highlight');
          assert.equal(other.height, selected.height, 'the same box height');
          assert.equal(other.textTop, selected.textTop, 'the label does not move');
        }
      } finally {
        await tab.emulateMedia({ forcedColors: 'none' });
      }
    });
  }

  it('paints the selected indicator and an unselected one apart, pixel for pixel', async () => {
    await tab.emulateMedia({ forcedColors: 'active' });
    try {
      const rows = Array.from(
        await tab.$$eval('[data-strip="published"] button', (buttons) =>
          buttons.map((button) => {
            const { left, width, bottom } = button.getBoundingClientRect();
            return { x: Math.round(left + width / 2), bottom: Math.round(bottom) };
          })
        ),
        (box) => [1, 2, 3, 4].map((up) => pixelAt(tab, box.x, box.bottom - up))
      );
      const [selected, ...others] = await Promise.all(rows.map((row) => Promise.all(row)));
      assert.notDeepEqual(
        selected,
        others[0],
        'the selected tab’s lower edge differs from another’s'
      );
      assert.deepEqual(others[0], others[1], 'two unselected tabs paint alike');
    } finally {
      await tab.emulateMedia({ forcedColors: 'none' });
    }
  });

  it('keeps the accent indicator at 2px outside forced colours', async () => {
    const colours = await system();
    for (const strip of Object.keys(STRIPS)) {
      const { selected, others } = await drawn(strip);
      assert.deepEqual([selected.width, others[0].width], ['2px', '2px'], strip);
      assert.equal(others[0].colour, 'rgba(0, 0, 0, 0)', `${strip}: others stay transparent`);
      if (strip !== 'danger') assert.equal(selected.colour, colours.accent, strip);
    }
  });
});
