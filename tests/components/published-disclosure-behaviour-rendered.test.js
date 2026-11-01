/**
 * Issue 2862 — the published `Disclosure` on Fabricate's real runtime in Chromium, mounted through
 * the page-session seam by `tests/fixtures/disclosure/mount.js` under a Vite dev server: what Enter,
 * Space and a held Enter call, a disabled head's Tab stop and focus, focus kept when an update
 * disables the focused head, and focus dropped to the page when an update closes a body that holds
 * it, as the group warns.
 */
import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';

import { createViteFixtureServer } from '../helpers/vite-fixture-server.js';

const fixtureServer = createViteFixtureServer({ styleMountPrefix: '/@disclosure-styles/' });
let page;

before(async () => {
  await fixtureServer.start();
  page = await fixtureServer.newPage({ viewport: { width: 600, height: 600 } });
  await page.goto(fixtureServer.url('/tests/fixtures/disclosure/index.html'), {
    waitUntil: 'load',
  });
  await page.waitForFunction(() => globalThis.__disclosureReady === true);
});

after(async () => {
  await fixtureServer.stop();
});

const headOf = (key) => `[data-case="${key}"] .fabricate-disclosure-head`;
const callsOf = (key) => page.evaluate((id) => [...globalThis.__disclosure.calls[id]], key);
const update = (key, props) =>
  page.evaluate(([id, next]) => globalThis.__disclosure.update(id, next), [key, props]);
/** Past two frames, so Chromium's focus fix-up after a style change has run. */
const frames = () =>
  page.evaluate(
    () => new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(done)))
  );
const active = () =>
  page.evaluate(() => {
    const element = document.activeElement;
    const key = element.closest('[data-case]')?.dataset.case ?? 'page';
    return `${key} ${element.localName}`;
  });

describe('the published Disclosure on the keyboard, on the real runtime', () => {
  it('calls onToggle once for Enter, once for Space, and on each repeat of a held Enter', async () => {
    await page.focus(headOf('closed'));
    await page.keyboard.press('Enter');
    assert.deepEqual(await callsOf('closed'), [true], 'Enter asks to open');
    await page.keyboard.press('Space');
    assert.deepEqual(await callsOf('closed'), [true, true], 'Space asks to open');
    await page.keyboard.down('Enter');
    await page.keyboard.down('Enter');
    await page.keyboard.down('Enter');
    await page.keyboard.up('Enter');
    assert.deepEqual(await callsOf('closed'), [true, true, true, true, true], 'one per repeat');
  });

  it('keeps a disabled head in the Tab order and calls nothing for a press, Enter or Space', async () => {
    await page.focus('[data-before]');
    const order = [];
    for (let step = 0; step < 4; step += 1) {
      await page.keyboard.press('Tab');
      order.push(await active());
    }
    assert.deepEqual(order, ['closed button', 'open button', 'open input', 'disabled button']);
    assert.equal(
      await page.$eval(headOf('disabled'), (head) => [head.disabled, head.ariaDisabled].join(',')),
      'false,true'
    );
    await page.keyboard.press('Enter');
    await page.keyboard.press('Space');
    // A real pointer press; Playwright would otherwise wait on an aria-disabled element.
    await page.click(headOf('disabled'), { force: true });
    assert.deepEqual(await callsOf('disabled'), []);
  });

  it('keeps focus on the head when an update disables it, and asks for nothing until enabled again', async () => {
    await page.focus(headOf('open'));
    await update('open', { open: true, disabled: true });
    await frames();
    assert.equal(await active(), 'open button', 'focus stays on the head');
    await page.keyboard.press('Enter');
    assert.deepEqual(await callsOf('open'), []);
    await update('open', { open: true });
    await frames();
    await page.keyboard.press('Enter');
    assert.deepEqual(await callsOf('open'), [false], 'enabled again, it asks to close');
  });

  it('drops focus to the page when an update closes a body that holds it, as its group warns', async () => {
    const field = '[data-case="open"] .fabricate-disclosure-body input';
    await page.focus(field);
    await page.fill(field, 'Owes us two favours');
    await update('open', { open: false });
    await frames();
    assert.equal(await active(), 'page body');
    await update('open', { open: true });
    await frames();
    assert.equal(await page.inputValue(field), 'Owes us two favours', 'the field kept its value');
  });
});
