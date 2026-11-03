/**
 * Issue 2901 — the published `TintSwatches` on Fabricate's real runtime in Chromium, mounted through
 * the page-session seam by `tests/fixtures/tint-swatches/mount.js` under a Vite dev server, in a
 * frame with no Fabricate root: the radio group and each radio's name and checked state in
 * Chromium's own accessibility tree, its one Tab stop, the arrow, Home, End and Space keys left to
 * right and right to left, the keyboard, hover and checked marks with their contrast in all seven
 * palettes, the 24px target, forced colours, and the View Lab case's step and selectors over its
 * own fixture.
 * Limit: no screen reader is run, and Foundry's own sheet is not loaded here, which
 * `published-standalone-root-rendered` compares.
 */
import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';

import { getCaseById } from '../../scripts/lib/viewLabCases.js';
import { MANAGER_COLOR_TOKEN_KEYS } from '../../src/ui/svelte/util/managerColorTokens.js';
import { chromiumAxNode, chromiumAxState } from '../helpers/chromiumAxNode.js';
import { contrast } from '../helpers/themePaletteContrast.js';
import { createViteFixtureServer } from '../helpers/vite-fixture-server.js';

const PALETTES = Object.freeze([
  'fabricate',
  'mythwright',
  'ironblood-forge',
  'hearth-herb',
  'starglass-arcana',
  'foundry-native',
  'sovereign',
]);
const GROUNDS = Object.freeze(['--fab-bg-0', '--fab-bg-1', '--fab-surface', '--fab-bg-2']);
const NAMES = Object.freeze([
  'Sage',
  'Mist',
  'Lavender',
  'Rose',
  'Peach',
  'Butter',
  'Aqua',
  'Mauve',
  'Verdant',
  'Azure',
]);

const fixtureServer = createViteFixtureServer({ styleMountPrefix: '/@tint-swatches-styles/' });
let page;

async function open(options = {}) {
  const next = await fixtureServer.newPage({ viewport: { width: 760, height: 900 }, ...options });
  await next.goto(fixtureServer.url('/tests/fixtures/tint-swatches/index.html'), {
    waitUntil: 'load',
  });
  await next.waitForFunction(() => globalThis.__swatchesReady === true);
  return next;
}

before(async () => {
  await fixtureServer.start();
  page = await open();
});

after(async () => {
  await fixtureServer.stop();
});

const swatch = (key, tint) => `[data-case="${key}"] [data-manager-color-token="${tint}"]`;
const callsOf = (key) => page.evaluate((id) => [...globalThis.__swatches.calls[id]], key);
const set = (key, value) =>
  page.evaluate(([id, next]) => globalThis.__swatches.set(id, next), [key, value]);
const active = () =>
  page.evaluate(() => {
    const element = document.activeElement;
    const key = element.closest('[data-case]')?.dataset.case ?? element.dataset.before ?? 'page';
    return `${key} ${element.dataset.managerColorToken ?? element.localName}`;
  });

describe('the published TintSwatches in Chromium’s accessibility tree', () => {
  it('is a radio group named by ariaLabel, holding one radio per tint named by its tint, Rose checked', async () => {
    const group = await chromiumAxNode(page, '[data-case="ltr"] [role="radiogroup"]');
    assert.deepEqual(
      [group.role, group.name, group.ignored],
      ['radiogroup', 'Activity colour', false]
    );
    assert.deepEqual(
      group.descendants.map(({ role, name }) => `${role} ${name}`),
      NAMES.map((name) => `radio ${name}`),
      'each swatch a radio named by its tint, and nothing else exposed'
    );
    const states = [];
    for (const tint of MANAGER_COLOR_TOKEN_KEYS) {
      const { checked } = await chromiumAxState(page, swatch('ltr', tint));
      states.push(`${tint} ${checked}`);
    }
    assert.deepEqual(
      states,
      MANAGER_COLOR_TOKEN_KEYS.map((tint) => `${tint} ${tint === 'rose' ? 'true' : 'false'}`)
    );
  });

  it('names a subset by the companion’s labels, and reads every radio unchecked with no value', async () => {
    const subset = await chromiumAxNode(page, '[data-case="subset"] [role="radiogroup"]');
    assert.deepEqual(
      subset.descendants.map(({ name }) => name),
      ['Moss', 'Blush', 'Straw', 'Sky']
    );
    assert.equal((await chromiumAxState(page, swatch('subset', 'azure'))).checked, 'true');
    for (const tint of MANAGER_COLOR_TOKEN_KEYS) {
      assert.equal((await chromiumAxState(page, swatch('none', tint))).checked, 'false', tint);
    }
  });
});

describe('the published TintSwatches on the keyboard', () => {
  it('is one Tab stop for each group: the checked radio, or the first where none is checked', async () => {
    await page.focus('[data-before]');
    const order = [];
    for (let step = 0; step < 5; step += 1) {
      await page.keyboard.press('Tab');
      order.push(await active());
    }
    assert.deepEqual(order, ['ltr rose', 'rtl rose', 'none sage', 'subset azure', 'page button']);
  });

  for (const [key, from, to] of [
    ['ArrowRight', 'rose', 'peach'],
    ['ArrowDown', 'peach', 'butter'],
    ['ArrowLeft', 'butter', 'peach'],
    ['ArrowUp', 'peach', 'rose'],
    ['End', 'rose', 'azure'],
    ['ArrowRight', 'azure', 'sage'],
    ['ArrowLeft', 'sage', 'azure'],
    ['Home', 'azure', 'sage'],
  ]) {
    it(`${key} from ${from} moves focus to ${to} and chooses it, left to right`, async () => {
      await set('ltr', from);
      await page.focus(swatch('ltr', from));
      const before = (await callsOf('ltr')).length;
      await page.keyboard.press(key);
      assert.equal(await active(), `ltr ${to}`);
      assert.deepEqual((await callsOf('ltr')).slice(before), [to]);
      assert.equal(
        await page.getAttribute(swatch('ltr', to), 'aria-checked'),
        'true',
        'the companion’s update checked it'
      );
      assert.equal(await page.getAttribute(swatch('ltr', to), 'tabindex'), '0');
    });
  }

  for (const [key, to] of [
    ['ArrowRight', 'lavender'],
    ['ArrowLeft', 'peach'],
    ['ArrowDown', 'peach'],
    ['ArrowUp', 'lavender'],
  ]) {
    it(`${key} from rose moves to ${to} right to left`, async () => {
      await set('rtl', 'rose');
      await page.focus(swatch('rtl', 'rose'));
      await page.keyboard.press(key);
      assert.equal(await active(), `rtl ${to}`);
    });
  }

  it('chooses the focused swatch on Space and on Enter, and reports nothing for the checked one', async () => {
    await set('none', '');
    await page.focus(swatch('none', 'sage'));
    await page.keyboard.press('Space');
    assert.deepEqual(await callsOf('none'), ['sage']);
    await page.keyboard.press('Space');
    await page.keyboard.press('Enter');
    assert.deepEqual(await callsOf('none'), ['sage'], 'the checked swatch reports nothing');
    await page.focus(swatch('none', 'mist'));
    await page.keyboard.press('Enter');
    assert.deepEqual(await callsOf('none'), ['sage', 'mist']);
  });

  it('leaves the arrow keys to the document past the strip, and lets Tab leave it', async () => {
    await set('subset', 'azure');
    await page.focus(swatch('subset', 'azure'));
    const heard = page.evaluate(
      () =>
        new Promise((done) => {
          document.addEventListener('keydown', (event) => done(event.key), { once: true });
        })
    );
    await page.keyboard.press('ArrowRight');
    assert.equal(await heard, 'ArrowRight', 'a listener above the strip still hears the key');
    await page.keyboard.press('Tab');
    assert.equal(await active(), 'page button', 'Tab leaves the group');
  });
});

/** A computed `rgb(r, g, b)` in the space-separated form `contrast` reads. */
const spaced = (colour) => colour.replaceAll(',', ' ').replaceAll(/\s+/gu, ' ');

/** The strip's marks and ground tokens, read from the swatches and the style root in `theme`. */
async function marksIn(theme) {
  return page.evaluate(
    ([palette, grounds]) => {
      const root = document.querySelector(
        '[data-case="ltr"] .fabricate-tint-swatches'
      ).parentElement;
      root.setAttribute('data-fabricate-theme', palette);
      const style = getComputedStyle(root);
      const fills = [...root.querySelectorAll(':scope .fabricate-tint-swatch-fill')].map(
        (fill) => getComputedStyle(fill).backgroundColor
      );
      const ring = getComputedStyle(
        root.querySelector(':scope [aria-checked="true"] .fabricate-tint-swatch-fill')
      ).boxShadow;
      return {
        fills,
        ring: /^(rgb\([^)]+\))/u.exec(ring)?.[1] ?? ring,
        accent: style.getPropertyValue('--fab-accent').trim(),
        grounds: grounds.map((token) => style.getPropertyValue(token).trim()),
      };
    },
    [theme, GROUNDS]
  );
}

describe('the marks the published TintSwatches draws', () => {
  it('draws keyboard focus as the 2px accent outline inset 2px, clear of the swatch, and no fill', async () => {
    await set('ltr', 'rose');
    await page.focus('[data-before]');
    await page.keyboard.press('Tab');
    const focused = await page.$eval(swatch('ltr', 'rose'), (element) => {
      const style = getComputedStyle(element);
      const fill = element.firstElementChild.getBoundingClientRect();
      const edge = element.getBoundingClientRect();
      return {
        visible: element.matches(':focus-visible'),
        outline: `${style.outlineStyle} ${style.outlineWidth} ${style.outlineOffset}`,
        gap: fill.left - edge.left,
        size: [edge.width, edge.height],
        transition: style.transitionDuration,
      };
    });
    assert.ok(focused.visible);
    assert.equal(focused.outline, 'solid 2px -2px');
    assert.equal(focused.gap, 3, 'the swatch sits 3px in, a pixel clear of the 2px outline');
    assert.equal(focused.size[1], 28);
    assert.ok(focused.size[0] >= 44, `each cell is at least 44px wide: ${focused.size[0]}`);
    assert.equal(focused.transition, '0s');
  });

  it('draws hover as an accent ring 2px wide and 1px outside the edge, and never fills the swatch', async () => {
    const rest = await page.$eval(
      swatch('ltr', 'mist'),
      (element) => getComputedStyle(element.firstElementChild).backgroundColor
    );
    await page.hover(swatch('ltr', 'mist'));
    const hovered = await page.$eval(swatch('ltr', 'mist'), (element) => {
      const ring = getComputedStyle(element, '::after');
      const edge = element.getBoundingClientRect();
      return {
        border: `${ring.borderTopStyle} ${ring.borderTopWidth}`,
        inset: ring.top,
        fill: getComputedStyle(element.firstElementChild).backgroundColor,
        width: edge.width,
      };
    });
    assert.deepEqual([hovered.border, hovered.inset], ['solid 2px', '-3px']);
    assert.equal(hovered.fill, rest, 'the swatch keeps its colour under the pointer');
    await page.mouse.move(0, 0);
  });

  it('rings the checked swatch at 3:1 on every tint and draws the accent marks at 3:1 on each ground, in all seven palettes', async (t) => {
    const lows = [];
    for (const palette of PALETTES) {
      const { fills, ring, accent, grounds } = await marksIn(palette);
      assert.equal(fills.length, 10);
      const ringRatios = fills.map((fill) => contrast(spaced(ring), spaced(fill)));
      const accentRatios = grounds.map((ground) => contrast(spaced(accent), spaced(ground)));
      lows.push(
        `${palette} ring ${Math.min(...ringRatios).toFixed(2)} accent ${Math.min(...accentRatios).toFixed(2)}`
      );
      assert.ok(Math.min(...ringRatios) >= 3, `${palette}: the checked ring on a tint`);
      assert.ok(Math.min(...accentRatios) >= 3, `${palette}: the accent on a ground`);
    }
    t.diagnostic(lows.join('; '));
  });

  it('keeps each tint and the checked ring under forced colours, and edges the checked swatch in Highlight', async () => {
    const forced = await open();
    try {
      await forced.emulateMedia({ forcedColors: 'active' });
      const read = await forced.$$eval('[data-case="ltr"] [role="radio"]', (radios) =>
        radios.map((radio) => {
          const fill = getComputedStyle(radio.firstElementChild);
          return {
            checked: radio.getAttribute('aria-checked'),
            fill: fill.backgroundColor,
            ring: fill.boxShadow,
            edge: getComputedStyle(radio).borderTopColor,
          };
        })
      );
      const highlight = await forced.evaluate(() => {
        const probe = document.createElement('i');
        probe.style.color = 'Highlight';
        document.body.append(probe);
        const value = getComputedStyle(probe).color;
        probe.remove();
        return value;
      });
      assert.equal(new Set(read.map(({ fill }) => fill)).size, 10, 'ten tints, not the backplate');
      const checked = read.find(({ checked }) => checked === 'true');
      assert.match(checked.ring, /inset/u, 'the checked ring is kept');
      assert.equal(checked.edge, highlight, 'the checked edge is the system highlight');
      assert.ok(
        read.filter(({ checked }) => checked === 'false').every(({ ring }) => ring === 'none'),
        'no other swatch is ringed'
      );
    } finally {
      await forced.close();
    }
  });
});

describe('the View Lab swatch case over its own fixture', () => {
  it('reaches its step, its expected selector and its containment in Chromium', async () => {
    const viewCase = getCaseById('manager-published-tint-swatches-specimen');
    const lab = '[data-lab]';
    const scoped = (selector) => `${lab} ${selector}`;
    for (const step of viewCase.steps) {
      await page.locator(scoped(step.selector)).first().press(step.press);
    }
    const expect = viewCase.expectSelector;
    assert.equal(await page.locator(scoped(expect)).count(), 1, `${expect} matches once`);
    for (const { container, target } of viewCase.expectContained) {
      if (container === '.window-content') continue;
      const [outer, inner] = await Promise.all([
        page.locator(scoped(container)).boundingBox(),
        page.locator(scoped(target)).boundingBox(),
      ]);
      assert.ok(
        inner.x >= outer.x &&
          inner.y >= outer.y &&
          inner.x + inner.width <= outer.x + outer.width &&
          inner.y + inner.height <= outer.y + outer.height,
        `${target} lies inside ${container}`
      );
    }
    const ground = await page.locator(scoped('[data-lab-tint-swatches-ground]')).boundingBox();
    const { width, height } = viewCase.position;
    assert.ok(
      ground.width <= width - 40 && ground.height <= height - 80,
      `the ${ground.width}x${ground.height} ground fits the ${width}x${height} window's content`
    );
  });
});
