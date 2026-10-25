/**
 * The shared `Modal`'s dialog element as a focus target (issues 2661, 2662), in a real browser
 * under the real sheet loaded in `layer(modules)` as Foundry loads it, so the component's unlayered
 * styles outrank it, in the manager and the player-app hosts, with and without `trapFocus`: a press
 * on its surface focuses it with no ring and its resting elevation, a later key draws no ring,
 * Escape is its own, Tab and Shift+Tab enter it at a control's ring, its width falls back to 560px,
 * and Chromium's accessibility tree names it modal only when it traps focus.
 * Limit: Chromium only; Foundry 14's Electron client is not measured here.
 */
import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';

import { createViteFixtureServer } from '../helpers/vite-fixture-server.js';

const fixtureServer = createViteFixtureServer({ styleMountPrefix: '/@overlay-host-styles/' });

const DIALOG = '[data-manager-modal]';
const CLOSE = '[data-manager-modal-close]';
const DONE = '[data-modal-done]';

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
 * The fixture with the dialog open in `host` over the sheet in `layer(modules)`, and
 * `<body data-heard>` recording bubbling window keydowns.
 */
async function openDialog(host, trap) {
  const page = await fixtureServer.newPage({ viewport: { width: 1280, height: 800 } });
  await page.goto(
    fixtureServer.url(
      `/tests/fixtures/overlay-host/index.html?host=${host}&component=modal&layer=modules&trap=${trap ? 1 : 0}`
    ),
    { waitUntil: 'load' }
  );
  await page.waitForFunction(() => globalThis.__overlayHostFixtureReady === true);
  await page.waitForSelector(DIALOG);
  const sheet = await page.evaluate(() => {
    const imports = [...document.styleSheets]
      .flatMap((entry) => [...entry.cssRules])
      .filter((rule) => rule instanceof CSSImportRule && rule.href.endsWith('fabricate.css'));
    return {
      flat: Boolean(document.querySelector('link[href$="fabricate.css"]')),
      layers: imports.map((rule) => rule.layerName),
      loaded: imports.every((rule) => rule.styleSheet.cssRules.length > 0),
    };
  });
  assert.deepEqual(sheet, { flat: false, layers: ['modules'], loaded: true });
  await page.evaluate(() => {
    document.body.dataset.heard = '';
    globalThis.addEventListener('keydown', (event) => {
      document.body.dataset.heard += `${event.key} `;
    });
  });
  await frames(page);
  return page;
}

/** Where focus is and what the dialog draws. */
const dialogState = (page) =>
  page.evaluate((selector) => {
    const dialog = document.querySelector(selector);
    const style = getComputedStyle(dialog);
    return {
      focused: document.activeElement === dialog,
      focusVisible: dialog.matches(':focus-visible'),
      boxShadow: style.boxShadow,
      outline: style.outlineStyle,
    };
  }, DIALOG);

/** A real pointer press at a point inside the header band, left of its heading. */
async function pressHeaderBand(page) {
  const band = await page.locator('.manager-modal-header').boundingBox();
  await page.mouse.click(band.x + 6, band.y + band.height / 2);
  await frames(page);
}

/** A real pointer press at a point inside the footer band, left of its button. */
async function pressFooterBand(page) {
  const band = await page.locator('.manager-modal-footer').boundingBox();
  await page.mouse.click(band.x + 10, band.y + band.height / 2);
  await frames(page);
}

/** A real pointer press on the body text. */
async function pressBodyText(page) {
  await page.locator('[data-modal-text]').click();
  await frames(page);
}

/** The dialog's `modal` state in Chromium's accessibility tree. */
async function axModal(page) {
  const client = await page.context().newCDPSession(page);
  try {
    const { nodes } = await client.send('Accessibility.getFullAXTree');
    const dialog = nodes.find((node) => node.role?.value === 'dialog');
    assert.ok(dialog, 'the accessibility tree holds the dialog');
    return dialog.properties?.find((property) => property.name === 'modal')?.value?.value ?? false;
  } finally {
    await client.detach();
  }
}

for (const host of ['manager', 'app']) {
  for (const trap of [false, true]) {
    describe(`the Modal dialog surface in the ${host} host with trapFocus ${trap}`, () => {
      for (const [label, pressSurface] of [
        ['the header band', pressHeaderBand],
        ['the body text', pressBodyText],
        ['the footer band', pressFooterBand],
      ]) {
        it(`focuses the dialog on a press on ${label}, with no ring and its resting elevation, also after a key and before one`, async () => {
          const page = await openDialog(host, trap);
          try {
            const rest = await dialogState(page);
            assert.notEqual(rest.boxShadow, 'none', 'the dialog rests elevated');
            assert.equal(rest.focused, false, 'the dialog is not focused at rest');

            await page.keyboard.press('Shift');
            await pressSurface(page);
            const pressed = await dialogState(page);
            assert.deepEqual(
              pressed,
              { ...rest, focused: true, focusVisible: false },
              'the press focuses the dialog and changes nothing it draws'
            );

            await page.keyboard.press('ArrowDown');
            await frames(page);
            const keyed = await dialogState(page);
            assert.equal(keyed.focused, true, 'focus stays on the dialog');
            assert.equal(keyed.focusVisible, true, 'the key makes its focus keyboard-visible');
            assert.equal(keyed.boxShadow, rest.boxShadow, 'a later key keeps the elevation');
            assert.equal(keyed.outline, 'none', 'and draws no ring');
          } finally {
            await page.close();
          }
        });
      }

      it('takes Escape on the dialog as its own, once, and no window keydown listener hears it', async () => {
        const page = await openDialog(host, trap);
        try {
          await pressHeaderBand(page);
          assert.equal((await dialogState(page)).focused, true);
          await page.keyboard.press('Escape');
          await frames(page);
          const { modalCloses, heard } = await page.evaluate(() => ({ ...document.body.dataset }));
          assert.deepEqual({ modalCloses, heard }, { modalCloses: '1', heard: '' });
        } finally {
          await page.close();
        }
      });

      for (const [key, control, label] of [
        ['Tab', CLOSE, 'the close control'],
        ['Shift+Tab', DONE, 'the last control'],
      ]) {
        it(`moves focus from the dialog to ${label} on ${key}, with its 2px ring`, async () => {
          const page = await openDialog(host, trap);
          try {
            await pressHeaderBand(page);
            await page.keyboard.press(key);
            await frames(page);
            const ring = await page.evaluate((selector) => {
              const target = document.querySelector(selector);
              const style = getComputedStyle(target);
              return {
                focused: document.activeElement === target,
                focusVisible: target.matches(':focus-visible'),
                outline: `${style.outlineWidth} ${style.outlineStyle}`,
              };
            }, control);
            assert.deepEqual(ring, { focused: true, focusVisible: true, outline: '2px solid' });
          } finally {
            await page.close();
          }
        });
      }

      it('keeps the 560px fallback width with no width prop', async () => {
        const page = await openDialog(host, trap);
        try {
          const box = await page.locator(DIALOG).boundingBox();
          assert.equal(box.width, 560);
        } finally {
          await page.close();
        }
      });

      it(`is ${trap ? '' : 'not '}modal in Chromium's accessibility tree`, async () => {
        const page = await openDialog(host, trap);
        try {
          assert.equal(await axModal(page), trap);
        } finally {
          await page.close();
        }
      });
    });
  }
}
