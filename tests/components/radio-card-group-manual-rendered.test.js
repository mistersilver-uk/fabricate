/**
 * Issue 2889 — the published `RadioCardGroup`'s `activation: 'manual'` on Fabricate's real runtime
 * in Chromium, mounted through the page-session seam by `tests/fixtures/radio-card-manual/mount.js`
 * under a Vite dev server: the arrow keys, Home and End move focus and choose nothing, Space, Enter
 * and a press choose once, Enter submits no form, right-to-left swaps left and right, the one Tab
 * stop, the accessibility tree, and a focus ring told from the checked radio by shape under forced
 * colours and reduced motion; the automatic group beside it checks on the arrow keys as before.
 */
import assert from 'node:assert/strict';
import { after, before, beforeEach, describe, it } from 'node:test';

import { chromiumAxNode, chromiumAxState } from '../helpers/chromiumAxNode.js';
import { createViteFixtureServer } from '../helpers/vite-fixture-server.js';

const fixtureServer = createViteFixtureServer({ styleMountPrefix: '/@radio-card-manual-styles/' });
let page;

before(async () => {
  await fixtureServer.start();
  page = await fixtureServer.newPage({ viewport: { width: 600, height: 1400 } });
  await page.goto(fixtureServer.url('/tests/fixtures/radio-card-manual/index.html'), {
    waitUntil: 'load',
  });
  await page.waitForFunction(() => globalThis.__radioCardsReady === true);
});

after(async () => {
  await fixtureServer.stop();
});

beforeEach(async () => {
  await page.emulateMedia({ forcedColors: 'none', reducedMotion: 'no-preference' });
  await page.evaluate(() => {
    for (const key of Object.keys(globalThis.__radioCards.calls))
      globalThis.__radioCards.reset(key);
  });
});

const radioOf = (key, value) => `[data-case="${key}"] input[type="radio"][value="${value}"]`;
const callsOf = (key) => page.evaluate((id) => [...globalThis.__radioCards.calls[id]], key);
const submitsOf = (key) => page.evaluate((id) => globalThis.__radioCards.submits[id], key);
const checkedOf = (key) =>
  page.$$eval(`[data-case="${key}"] input[type="radio"]:checked`, (nodes) =>
    nodes.map((node) => node.value)
  );
const active = () =>
  page.evaluate(() => {
    const element = document.activeElement;
    const key = element.closest('[data-case]')?.dataset.case ?? 'page';
    return `${key} ${element.value || Object.keys(element.dataset)[0] || element.localName}`;
  });

/** Presses each key in turn, returning where focus is after each. */
async function walk(keys) {
  const reached = [];
  for (const key of keys) {
    await page.keyboard.press(key);
    reached.push(await active());
  }
  return reached;
}

describe('a manual RadioCardGroup on the keyboard, in Chromium', () => {
  it('moves focus on the arrow keys, skipping the disabled option and wrapping, and chooses nothing', async () => {
    await page.focus(radioOf('manual', 'hold'));
    const reached = await walk(['ArrowRight', 'ArrowRight', 'ArrowDown', 'ArrowLeft', 'ArrowUp']);
    assert.deepEqual(reached, [
      'manual queue',
      'manual drop',
      'manual hold',
      'manual drop',
      'manual queue',
    ]);
    assert.deepEqual(await callsOf('manual'), []);
    assert.deepEqual(await checkedOf('manual'), ['hold']);
  });

  it('moves focus to the first and last enabled radio on Home and End', async () => {
    await page.focus(radioOf('manual', 'queue'));
    assert.deepEqual(await walk(['End', 'Home']), ['manual drop', 'manual hold']);
    assert.deepEqual(await callsOf('manual'), []);
  });

  it('chooses nothing on an arrow key with Ctrl, Alt or Shift held', async () => {
    await page.focus(radioOf('manual', 'hold'));
    for (const key of ['Control+ArrowRight', 'Alt+ArrowRight', 'Shift+ArrowRight']) {
      await page.keyboard.press(key);
    }
    assert.deepEqual(await callsOf('manual'), []);
    assert.deepEqual(await checkedOf('manual'), ['hold']);
  });

  for (const key of ['Space', 'Enter']) {
    it(`chooses the focused option once on ${key}, and submits no form`, async () => {
      await page.focus(radioOf('manual', 'hold'));
      await page.keyboard.press('ArrowRight');
      await page.keyboard.press(key);
      assert.deepEqual(await callsOf('manual'), ['queue']);
      assert.deepEqual(await checkedOf('manual'), ['queue']);
      assert.equal(await active(), 'manual queue', 'focus stays on the chosen radio');
      await page.keyboard.press(key);
      assert.deepEqual(await callsOf('manual'), ['queue'], 'the checked radio calls nothing');
      assert.equal(await submitsOf('manual'), 0);
    });
  }

  it('chooses once on a press', async () => {
    await page.click(`[data-case="manual"] [data-radio-card-option="drop"]`);
    assert.deepEqual(await callsOf('manual'), ['drop']);
  });

  it('swaps ArrowLeft and ArrowRight under right-to-left', async () => {
    await page.focus(radioOf('rtl', 'hold'));
    assert.deepEqual(await walk(['ArrowLeft', 'ArrowRight', 'ArrowDown']), [
      'rtl queue',
      'rtl hold',
      'rtl queue',
    ]);
    assert.deepEqual(await callsOf('rtl'), []);
  });

  it('is one Tab stop, on the checked radio, wherever the arrow keys left focus', async () => {
    await page.focus(`[data-case="manual"] [data-before]`);
    assert.deepEqual(await walk(['Tab']), ['manual hold']);
    assert.deepEqual(await walk(['ArrowRight', 'Tab']), ['manual queue', 'manual after']);
    assert.deepEqual(await walk(['Shift+Tab']), ['manual hold']);
    assert.deepEqual(await callsOf('manual'), []);
  });

  it('is one Tab stop with no option chosen, first on the first enabled radio, then where focus left the group', async () => {
    await page.focus(`[data-case="unchosen"] [data-before]`);
    assert.deepEqual(await walk(['Tab', 'ArrowRight', 'Tab']), [
      'unchosen hold',
      'unchosen queue',
      'unchosen after',
    ]);
    assert.deepEqual(await walk(['Shift+Tab']), ['unchosen queue']);
    assert.deepEqual(await callsOf('unchosen'), []);
  });
});

describe('the automatic RadioCardGroup beside it, in Chromium', () => {
  it('checks the radio each arrow key reaches and calls onChange for each', async () => {
    await page.focus(radioOf('automatic', 'hold'));
    assert.deepEqual(await walk(['ArrowRight', 'ArrowRight']), [
      'automatic queue',
      'automatic drop',
    ]);
    assert.deepEqual(await callsOf('automatic'), ['queue', 'drop']);
    assert.deepEqual(await checkedOf('automatic'), ['drop']);
  });
});

describe('a manual RadioCardGroup in the accessibility tree', () => {
  it('is a group named by its legend, of radios named by their labels', async () => {
    const tree = await chromiumAxNode(page, '[data-case="manual"] fieldset');
    assert.equal(tree.role, 'group');
    // The sheet's legend is upper-cased, and Chromium names the group by its rendered text.
    assert.equal(tree.name, 'PENDING STEP, MANUAL');
    assert.deepEqual(
      tree.descendants.filter(({ role }) => role === 'radio').map(({ name }) => name),
      ['Hold', 'Queue', 'Limited', 'Drop']
    );
  });

  it('states the focused radio unchecked until Space chooses it', async () => {
    await page.focus(radioOf('manual', 'hold'));
    await page.keyboard.press('ArrowRight');
    const reached = await chromiumAxState(page, radioOf('manual', 'queue'));
    assert.equal(reached.role, 'radio');
    assert.equal(reached.name, 'Queue');
    assert.equal(reached.focused, true);
    assert.equal(reached.checked, 'false');
    assert.equal((await chromiumAxState(page, radioOf('manual', 'hold'))).checked, 'true');
    await page.keyboard.press('Space');
    assert.equal((await chromiumAxState(page, radioOf('manual', 'queue'))).checked, 'true');
  });
});

/** The focused radio's and the checked radio's ring and border, after one ArrowRight. */
async function faces() {
  await page.focus(radioOf('manual', 'hold'));
  await page.keyboard.press('ArrowRight');
  const read = (selector) =>
    page.$eval(selector, (node) => {
      const style = getComputedStyle(node);
      const card = node.closest('[data-radio-card-option]');
      return {
        outline:
          style.outlineStyle === 'none'
            ? 'none'
            : `${style.outlineStyle} ${style.outlineWidth} ${style.outlineOffset}`,
        border: style.borderTopWidth,
        chosen: card.classList.contains('is-active'),
        transition: style.transitionDuration,
        cardTransition: getComputedStyle(card).transitionDuration,
      };
    });
  return {
    focused: await read(radioOf('manual', 'queue')),
    checked: await read(radioOf('manual', 'hold')),
  };
}

describe('the focus ring and the checked radio of a manual group', () => {
  it('differ by shape: a 2px ring 2px clear on the focused radio, a 4px edge on the checked one', async () => {
    const { focused, checked } = await faces();
    assert.deepEqual(focused, {
      outline: 'solid 2px 2px',
      border: '1px',
      chosen: false,
      transition: '0s',
      cardTransition: '0s',
    });
    assert.deepEqual(checked, {
      outline: 'none',
      border: '4px',
      chosen: true,
      transition: '0s',
      cardTransition: '0s',
    });
  });

  it('keeps both shapes under forced colours and reduced motion', async () => {
    await page.emulateMedia({ forcedColors: 'active', reducedMotion: 'reduce' });
    const { focused, checked } = await faces();
    assert.equal(focused.outline, 'solid 2px 2px');
    assert.equal(focused.border, '1px');
    assert.equal(checked.outline, 'none');
    assert.equal(checked.border, '4px');
    assert.deepEqual(await callsOf('manual'), [], 'and the arrow key chose nothing');
  });
});
