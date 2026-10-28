/**
 * Tab and Escape on an `IconPicker` and a `Select` inside the shared `Modal` (issues 2598, 2676,
 * 2677), in a real browser in the manager and the player-app hosts: Tab in the icon list's query
 * field moves on from its trigger rather than to the page behind the dialog, Tab and Shift+Tab on an
 * open select close it as focus moves, a copy of Foundry's `KeyboardManager#hasFocus` answers true
 * as each Tab reaches the window, Escape on a closed trigger closes the dialog once, and Tab from a
 * set picker's query field reaches its footer rather than its scrolling list, and in a dialog that
 * traps focus a Tab from that footer, the set picker being the dialog's last control, wraps to its
 * close control (issue 2699).
 * Limit: Chromium only; Foundry's Electron client is not measured here.
 */
import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';

import { createViteFixtureServer } from '../helpers/vite-fixture-server.js';

const fixtureServer = createViteFixtureServer({ styleMountPrefix: '/@overlay-host-styles/' });

const DIALOG = '[data-manager-modal]';
const ICON_TRIGGER = `${DIALOG} .essence-icon-picker-trigger`;
const ICON_PANEL = '.fabricate-icon-picker-popover';
const SELECT_TRIGGER = `${DIALOG} .fabricate-select-trigger`;
const SELECT_PANEL = '.fabricate-select-popover';

before(async () => {
  await fixtureServer.start();
});

after(async () => {
  await fixtureServer.stop();
});

const frames = (page) =>
  page.evaluate(
    () => new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(done)))
  );

/**
 * The dialog fixture in `host`, with a window bubble `keydown` listener recording each key but Shift
 * and what a copy of `KeyboardManager#hasFocus` answers then: an input, select or textarea, a
 * content-editable node, a button in a form, or an element whose `data-keyboard-focus` is `""` or
 * `"true"`, as `.agents/docs/foundry-and-architecture.md` reads it from Foundry 13.351 and 14.365.
 */
async function openFixture(host, trap = false) {
  const page = await fixtureServer.newPage({ viewport: { width: 1280, height: 800 } });
  await page.goto(
    fixtureServer.url(
      `/tests/fixtures/overlay-host/index.html?host=${host}&component=modal-picker&trap=${trap ? 1 : 0}`
    ),
    { waitUntil: 'load' }
  );
  await page.waitForFunction(() => globalThis.__overlayHostFixtureReady === true);
  await page.waitForSelector(ICON_TRIGGER);
  await page.evaluate(() => {
    const hasFocus = () => {
      const focused = document.activeElement;
      if (!(focused instanceof HTMLElement)) return false;
      const mark = focused.dataset.keyboardFocus;
      if (mark === 'false') return false;
      if (mark === '' || mark === 'true' || focused.isContentEditable) return true;
      if (['INPUT', 'SELECT', 'TEXTAREA'].includes(focused.tagName)) return true;
      return focused.tagName === 'BUTTON' && Boolean(focused.form);
    };
    document.body.dataset.heard = '[]';
    globalThis.addEventListener('keydown', (event) => {
      if (event.key === 'Shift') return;
      const heard = JSON.parse(document.body.dataset.heard);
      heard.push({ key: event.key, hasFocus: hasFocus() });
      document.body.dataset.heard = JSON.stringify(heard);
    });
  });
  return page;
}

/** Where focus is, the open panels, the select's state, the closes, and what the window heard. */
const state = (page) =>
  page.evaluate(
    ({ icon, iconPanel, select, selectPanel }) => {
      const active = document.activeElement;
      const name = () => {
        if (active === document.querySelector(icon)) return 'icon-trigger';
        if (active === document.querySelector(select)) return 'select-trigger';
        if (active?.closest(iconPanel)) return 'icon-field';
        for (const hook of ['before', 'after', 'pageAfter']) {
          if (active?.dataset?.[hook] !== undefined) return hook;
        }
        return active?.tagName ?? 'none';
      };
      return {
        focus: name(),
        insideDialog: Boolean(active?.closest('[data-manager-modal]')),
        iconOpen: Boolean(document.querySelector(iconPanel)),
        selectOpen: Boolean(document.querySelector(selectPanel)),
        expanded: document.querySelector(select).getAttribute('aria-expanded'),
        closes: Number(document.body.dataset.modalCloses),
        heard: JSON.parse(document.body.dataset.heard),
      };
    },
    { icon: ICON_TRIGGER, iconPanel: ICON_PANEL, select: SELECT_TRIGGER, selectPanel: SELECT_PANEL }
  );

/** Opens the icon list from its trigger by Enter, with focus in its query field. */
async function openIconByEnter(page) {
  await page.focus(ICON_TRIGGER);
  await page.keyboard.press('Enter');
  await page.waitForSelector(`${ICON_PANEL} input`);
  await frames(page);
  assert.equal((await state(page)).focus, 'icon-field', 'the query field holds focus');
  await page.evaluate(() => {
    document.body.dataset.heard = '[]';
  });
}

/** Opens the select's list from its trigger by ArrowDown, with focus kept on the trigger. */
async function openSelectByArrow(page) {
  await page.focus(SELECT_TRIGGER);
  await page.keyboard.press('ArrowDown');
  await page.waitForSelector(SELECT_PANEL);
  await frames(page);
  await page.evaluate(() => {
    document.body.dataset.heard = '[]';
  });
}

async function pressAndSettle(page, key) {
  await page.keyboard.press(key);
  await frames(page);
  return state(page);
}

for (const host of ['manager', 'app']) {
  describe(`a picker inside the shared Modal in the ${host} host`, () => {
    it('R1: Tab in the icon query field closes the list and moves on to the Select inside the dialog', async () => {
      const page = await openFixture(host);
      try {
        await openIconByEnter(page);
        const after = await pressAndSettle(page, 'Tab');
        assert.equal(after.iconOpen, false, 'the list is closed');
        assert.equal(after.focus, 'select-trigger', 'focus is on the next control in the dialog');
        assert.equal(after.insideDialog, true);
        assert.equal(after.closes, 0, 'the dialog stays open');
        assert.deepEqual(after.heard, [{ key: 'Tab', hasFocus: true }]);
      } finally {
        await page.close();
      }
    });

    it('R2: Shift+Tab in the icon query field closes the list onto its trigger', async () => {
      const page = await openFixture(host);
      try {
        await openIconByEnter(page);
        const after = await pressAndSettle(page, 'Shift+Tab');
        assert.equal(after.iconOpen, false, 'the list is closed');
        assert.equal(after.focus, 'icon-trigger');
        assert.equal(after.closes, 0);
        assert.deepEqual(after.heard, [{ key: 'Tab', hasFocus: true }]);
      } finally {
        await page.close();
      }
    });

    it('R3: Tab on an open Select closes its list and moves on to the next control', async () => {
      const page = await openFixture(host);
      try {
        await openSelectByArrow(page);
        const after = await pressAndSettle(page, 'Tab');
        assert.equal(after.selectOpen, false, 'the list is closed');
        assert.equal(after.expanded, 'false');
        assert.equal(after.focus, 'after');
        assert.equal(after.closes, 0);
        assert.deepEqual(after.heard, [{ key: 'Tab', hasFocus: true }]);
      } finally {
        await page.close();
      }
    });

    it('R4: Shift+Tab on an open Select closes its list and moves back to the IconPicker trigger', async () => {
      const page = await openFixture(host);
      try {
        await openSelectByArrow(page);
        const after = await pressAndSettle(page, 'Shift+Tab');
        assert.equal(after.selectOpen, false, 'the list is closed');
        assert.equal(after.expanded, 'false');
        assert.equal(after.focus, 'icon-trigger');
        assert.equal(after.closes, 0);
        assert.deepEqual(after.heard, [{ key: 'Tab', hasFocus: true }]);
      } finally {
        await page.close();
      }
    });

    it('R6: Tab in a set picker’s query field reaches its footer, not its scrolling list', async () => {
      const page = await openFixture(host);
      try {
        await page.focus(`${DIALOG} .fabricate-set-picker .fabricate-picker > button`);
        await page.keyboard.press('Enter');
        await page.waitForSelector('.fabricate-set-picker-popover input');
        await frames(page);
        const scrolls = await page.evaluate(() => {
          const list = document.querySelector('.fabricate-set-picker-popover [role="listbox"]');
          return list.scrollHeight > list.clientHeight;
        });
        assert.equal(scrolls, true, 'the list overflows, so a browser could make it a tab stop');
        await pressAndSettle(page, 'Tab');
        const landed = await page.evaluate(() => ({
          clear: document.activeElement?.matches('[data-set-picker-clear]') ?? false,
          open: Boolean(document.querySelector('.fabricate-set-picker-popover')),
        }));
        assert.deepEqual(landed, { clear: true, open: true });
      } finally {
        await page.close();
      }
    });

    it('R7: Tab from the last stop of a set picker that is a trapping dialog’s last control wraps to its close control', async () => {
      const page = await openFixture(host, true);
      try {
        await page.focus(`${DIALOG} .fabricate-set-picker .fabricate-picker > button`);
        await page.keyboard.press('Enter');
        await page.waitForSelector('.fabricate-set-picker-popover input');
        await frames(page);
        await pressAndSettle(page, 'Tab');
        const onClear = await page.evaluate(
          () => document.activeElement?.matches('[data-set-picker-clear]') ?? false
        );
        assert.equal(onClear, true, 'Clear all is the panel’s last enabled stop');
        await pressAndSettle(page, 'Tab');
        const landed = await page.evaluate(() => ({
          close: document.activeElement?.matches('[data-manager-modal-close]') ?? false,
          open: Boolean(document.querySelector('.fabricate-set-picker-popover')),
          closes: Number(document.body.dataset.modalCloses),
        }));
        assert.deepEqual(landed, { close: true, open: false, closes: 0 });
      } finally {
        await page.close();
      }
    });

    it('R5: Escape on each closed trigger closes the dialog once per press (issue 2677)', async () => {
      const page = await openFixture(host);
      try {
        for (const [trigger, closes] of [
          [ICON_TRIGGER, 1],
          [SELECT_TRIGGER, 2],
        ]) {
          await page.focus(trigger);
          const after = await pressAndSettle(page, 'Escape');
          assert.equal(after.closes, closes, `${trigger}: onClose is called once`);
        }
      } finally {
        await page.close();
      }
    });
  });
}
