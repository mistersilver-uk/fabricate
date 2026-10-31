/**
 * Issue 2853 — the published `Button`'s and `IconButton`'s small rungs, measured in Chromium on the
 * markup the seam draws, under the module sheet: each rung's box, padding, corner and keyboard ring,
 * the defaults unchanged, and the 24px pointer target the 20px and 22px icon buttons reach past
 * their box without moving the row they sit in.
 */
import assert from 'node:assert/strict';
import { resolve } from 'node:path';
import { after, before, describe, it } from 'node:test';

import { chromium } from 'playwright';

import { compareSpecificity, specificityOf } from '../../scripts/lib/stylesheetSelectorCensus.js';
import {
  PUBLISHED_ADAPTER,
  PUBLISHED_COMPILED_MODULES,
  PUBLISHED_RAW_MODULES,
  PUBLISHED_RUNE_MODULES,
  PUBLISHED_SEAM,
  fabricateTarget,
  settle,
  shippedSeam,
} from '../helpers/publishedComponentModules.js';
import { renderedPageHead } from '../helpers/renderedPageHead.js';
import { collectStyleCorpus, rulesIn, splitSelectorList } from '../helpers/styleBlockScan.js';
import { createMountedComponentHarness } from '../helpers/svelte-component-harness.js';
import { propertiesOf } from '../helpers/themePaletteContrast.js';

const harness = createMountedComponentHarness({
  repoRoot: resolve(import.meta.dirname, '../..'),
  tmpPrefix: 'fabricate-button-rungs-rendered-',
  rawModules: PUBLISHED_RAW_MODULES,
  runeModules: PUBLISHED_RUNE_MODULES,
  compiledModules: PUBLISHED_COMPILED_MODULES,
  componentPath: 'src/ui/svelte/published/PublishedComponentHost.svelte',
});

/** Each `Button` rung's height and corner, `''` the default 34. */
const BUTTON_RUNGS = Object.freeze({
  '': [34, 9],
  24: [24, 6],
  26: [26, 7],
  28: [28, 7],
  38: [38, 9],
});
/** Each `IconButton` rung's side and corner, `''` the default 34. */
const ICON_RUNGS = Object.freeze({
  '': [34, 9],
  20: [20, 6],
  22: [22, 6],
  24: [24, 6],
  26: [26, 7],
});
const TARGET_FLOOR = 24;

let browser;
let tab;

/** The seam's markup for one mount of `name` with `props`, as a companion's target holds it. */
async function drawn(ui, shells, name, props) {
  const target = fabricateTarget(shells);
  const handle = ui.mount(name, { target, props: { onclick() {}, ...props } });
  await settle();
  const markup = target.innerHTML;
  handle.destroy();
  return markup;
}

before(async () => {
  const shells = [];
  const cases = [];
  await harness.setup();
  try {
    const { publishedComponentRuntime: runtime, COMPONENTS: components } =
      await harness.loadRuneModule(PUBLISHED_ADAPTER);
    const { createPublishedComponents } = await harness.loadRawModule(PUBLISHED_SEAM);
    const ui = shippedSeam({ createPublishedComponents, runtime, components, report() {} });
    for (const size of Object.keys(BUTTON_RUNGS)) {
      const button = await drawn(ui, shells, 'Button', { children: 'Add tier', size });
      cases.push(`<div data-case="button-${size}">${button}<span data-after>x</span></div>`);
    }
    for (const size of Object.keys(ICON_RUNGS)) {
      const props = { icon: 'fas fa-xmark', ariaLabel: 'Dismiss the entry', size };
      const button = await drawn(ui, shells, 'IconButton', props);
      cases.push(`<div data-case="icon-${size}">${button}<span data-after>x</span></div>`);
    }
    for (const size of ['20', '22']) {
      const props = { icon: 'fas fa-xmark', ariaLabel: 'Dismiss', size, role: 'ghost-danger' };
      const button = await drawn(ui, shells, 'IconButton', props);
      cases.push(`<div data-case="ghost-${size}">${button}<span data-after>x</span></div>`);
    }
  } finally {
    for (const shell of shells) shell.remove();
    harness.teardown();
  }
  browser = await chromium.launch();
  tab = await browser.newPage({ viewport: { width: 800, height: 1200 } });
  await tab.setContent(
    `${renderedPageHead([])}<body class="game"><div class="fabricate fabricate-app">` +
      '<style>[data-case]{display:flex;align-items:center;gap:8px;padding:16px}</style>' +
      `${cases.join('')}</div></body></html>`,
    { waitUntil: 'load' }
  );
});

after(async () => {
  await browser?.close();
});

/** The box, padding, corner and ring of the case's control, keyboard-focused when `focused`. */
async function measure(id, { focused = false } = {}) {
  const selector = `[data-case="${id}"] button`;
  if (focused) {
    await tab.keyboard.press('Tab');
    await tab.focus(selector);
  }
  return tab.evaluate((hook) => {
    const button = document.querySelector(hook);
    const style = getComputedStyle(button);
    const { left, top, width, height, right } = button.getBoundingClientRect();
    const after = button.parentElement.querySelector('[data-after]').getBoundingClientRect();
    const glyph = button.querySelector('i')?.getBoundingClientRect();
    return {
      width,
      height,
      left,
      top,
      right,
      afterLeft: after.left,
      paddingInline: [style.paddingLeft, style.paddingRight],
      radius: style.borderTopLeftRadius,
      ring: [style.outlineStyle, style.outlineWidth, style.outlineOffset],
      focusVisible: button.matches(':focus-visible'),
      glyphCentre: glyph && [glyph.left + glyph.width / 2, glyph.top + glyph.height / 2],
    };
  }, selector);
}

/**
 * Which of the whole-pixel points `reach` px outside each edge of the case's control land on it,
 * and which one pixel further out, each `[left, right, top, bottom]`: a point is read at its
 * pixel, since Chromium rounds a fractional point before it hit-tests.
 */
const pointerTarget = (id, reach) =>
  tab.evaluate(
    ({ hook, out }) => {
      const button = document.querySelector(hook);
      const { left, right, top, bottom } = button.getBoundingClientRect();
      const [x, y] = [(left + right) / 2, (top + bottom) / 2];
      const on = (px, py) => {
        const found = document.elementFromPoint(px, py);
        return found === button || button.contains(found);
      };
      const ring = (by) => [
        on(left - by, y),
        on(right + by - 1, y),
        on(x, top - by),
        on(x, bottom + by - 1),
      ];
      return { inside: ring(out), past: ring(out + 1) };
    },
    { hook: `[data-case="${id}"] button`, out: reach }
  );

describe('the published Button rungs', () => {
  for (const [size, [height, corner]] of Object.entries(BUTTON_RUNGS)) {
    it(`draws size ${JSON.stringify(size)} ${height}px tall at a ${corner}px corner, with the default padding and the 2px ring 2px clear`, async () => {
      const box = await measure(`button-${size}`, { focused: true });
      assert.equal(box.focusVisible, true, 'the button took keyboard focus');
      assert.equal(box.height, height);
      assert.equal(box.radius, `${corner}px`);
      assert.deepEqual(box.paddingInline, ['12px', '12px'], 'every rung keeps the inline padding');
      assert.deepEqual(box.ring, ['solid', '2px', '2px'], 'so the ring reaches 4px past the box');
      assert.ok(height >= TARGET_FLOOR, 'each rung is its own 24px pointer target');
    });
  }
});

describe('the published IconButton rungs', () => {
  for (const [size, [side, corner]] of Object.entries(ICON_RUNGS)) {
    it(`draws size ${JSON.stringify(size)} as a ${side}px square at a ${corner}px corner, with the 2px ring 2px clear`, async () => {
      const box = await measure(`icon-${size}`, { focused: true });
      assert.equal(box.focusVisible, true, 'the button took keyboard focus');
      assert.deepEqual([box.width, box.height, box.radius], [side, side, `${corner}px`]);
      assert.deepEqual(box.ring, ['solid', '2px', '2px']);
      const [x, y] = box.glyphCentre;
      assert.ok(Math.abs(x - (box.left + side / 2)) <= 0.5, `the glyph is centred across (${x})`);
      assert.ok(Math.abs(y - (box.top + side / 2)) <= 0.5, `and down (${y})`);
    });
  }

  for (const size of ['20', '22', '24', '26']) {
    const reach = (TARGET_FLOOR - Math.min(Number(size), TARGET_FLOOR)) / 2;
    it(`takes the pointer ${reach}px past each edge of size ${size}, a ${TARGET_FLOOR}px target about its centre, and moves nothing beside it`, async () => {
      const id = `icon-${size}`;
      const { inside, past } = await pointerTarget(id, reach);
      assert.deepEqual(
        inside,
        [true, true, true, true],
        'the outermost pixel on each side presses it'
      );
      assert.deepEqual(past, [false, false, false, false], 'and the next one out does not');
      const box = await measure(id);
      assert.equal(
        box.afterLeft - box.right,
        8,
        'the next item sits the row gap from the drawn box'
      );
    });
  }
});

describe('the 20px and 22px rungs against the role rules', () => {
  const rules = rulesIn(collectStyleCorpus()['styles/fabricate.css']);
  /** A selector that styles the icon button by its own and its role classes alone. */
  const ROLE_COMPOUND =
    /^\.fabricate-icon-button(?:\.(?:fabricate-icon-button|is-ghost|is-danger|is-primary)|:[a-z-]+(?:\([^)]*\))?)*$/u;

  for (const size of ['20', '22']) {
    it(`outranks every role rule that sets its geometry at size ${size}, so no import order decides it`, () => {
      const rung = `.fabricate-icon-button.fabricate-icon-button.fabricate-icon-button.is-size-${size}`;
      const own = rules.find((rule) => splitSelectorList(rule.selector).includes(rung));
      assert.ok(own, `the ${rung} rule is declared`);
      const geometry = new Set(propertiesOf(own).keys());
      const rivals = rules.flatMap((rule) =>
        splitSelectorList(rule.selector).filter(
          (part) =>
            ROLE_COMPOUND.test(part) && [...propertiesOf(rule).keys()].some((p) => geometry.has(p))
        )
      );
      assert.ok(
        rivals.includes('.fabricate-icon-button.fabricate-icon-button.is-ghost'),
        'the ghost rung is read'
      );
      assert.deepEqual(
        rivals.filter((part) => compareSpecificity(specificityOf(rung), specificityOf(part)) <= 0),
        []
      );
    });

    it(`draws the ghost-danger role at size ${size} as the rung's square`, async () => {
      const box = await measure(`ghost-${size}`);
      assert.deepEqual([box.width, box.height, box.radius], [Number(size), Number(size), '6px']);
    });
  }
});
