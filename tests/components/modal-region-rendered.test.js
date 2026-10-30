/**
 * The shared `Modal`'s width rungs, header glyph and placement in a companion's region (issue 2818),
 * in a real browser under the real sheet: `size` draws 500px, 560px and 620px and nothing else,
 * clamped to the browser window; `icon` draws a hidden glyph before the title; and a dialog hosted
 * in a region through the real overlay chain draws no scrim, is centred in the region only where
 * the region makes itself the containing block of fixed content (`contain: layout`, a `transform`;
 * not `position: relative`, nor `container-type: inline-size` as the Manager's root sets) and
 * otherwise in the viewport,
 * sits above a companion layer of lower `z-index`, and keeps its width and height caps from the
 * viewport rather than the region.
 * Limit: Chromium only; Font Awesome's webfonts are not loaded, so the glyph's own box is unmeasured.
 */
import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';

import { createViteFixtureServer } from '../helpers/vite-fixture-server.js';

const fixtureServer = createViteFixtureServer({ styleMountPrefix: '/@overlay-host-styles/' });

const DIALOG = '[data-manager-modal]';
const DESKTOP = Object.freeze({ width: 1280, height: 800 });

before(async () => {
  await fixtureServer.start();
});

after(async () => {
  await fixtureServer.stop();
});

/** The fixture with the dialog open over the sheet in `layer(modules)`, with `query` appended. */
async function openDialog(query, viewport) {
  const page = await fixtureServer.newPage({ viewport });
  await page.goto(
    fixtureServer.url(
      `/tests/fixtures/overlay-host/index.html?host=app&component=modal&layer=modules&frameLeft=40&frameTop=40${query}`
    ),
    { waitUntil: 'load' }
  );
  await page.waitForFunction(() => globalThis.__overlayHostFixtureReady === true);
  await page.waitForSelector(DIALOG);
  await page.evaluate(
    () => new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(done)))
  );
  return page;
}

/** Runs `read` against a page opened with `query`, closing the page after. */
async function inFixture(query, read, viewport = DESKTOP) {
  const page = await openDialog(query, viewport);
  try {
    return await page.evaluate(read);
  } finally {
    await page.close();
  }
}

const dialogWidth = () =>
  document.querySelector('[data-manager-modal]').getBoundingClientRect().width;

describe('the Modal width rungs', () => {
  for (const [query, width] of [
    ['', 560],
    ['&size=md', 560],
    ['&size=sm', 500],
    ['&size=lg', 620],
    ['&size=huge', 560],
    ['&size=constructor', 560],
  ]) {
    it(`draws ${width}px for ${query || 'no size'}`, async () => {
      assert.equal(await inFixture(query, dialogWidth), width);
    });
  }

  it('clamps a rung to the browser window, 48px short of its width', async () => {
    const width = await inFixture('&size=lg', dialogWidth, { width: 520, height: 800 });
    assert.equal(width, 472);
  });
});

describe('the Modal header glyph', () => {
  const header = () => {
    const band = document.querySelector('.manager-modal-header');
    const glyph = band.querySelector('.manager-modal-icon');
    const heading = band.querySelector('.manager-modal-heading');
    return {
      glyph: glyph && {
        classes: glyph.className.split(' ').filter((name) => !name.startsWith('svelte-')),
        hidden: glyph.getAttribute('aria-hidden'),
        beforeHeading: glyph.getBoundingClientRect().right <= heading.getBoundingClientRect().left,
        ink: getComputedStyle(glyph).color,
      },
      children: [...band.children].map((child) => child.tagName.toLowerCase()),
      title: getComputedStyle(band.querySelector('.manager-modal-title')).color,
    };
  };

  it('draws a hidden glyph before the heading and ahead of the close control', async () => {
    const read = await inFixture('&icon=fas%20fa-plus', header);
    assert.deepEqual(read.glyph.classes, ['manager-modal-icon', 'fas', 'fa-plus']);
    assert.equal(read.glyph.hidden, 'true');
    assert.equal(read.glyph.beforeHeading, true);
    assert.deepEqual(read.children.slice(0, 2), ['i', 'div']);
    assert.notEqual(read.glyph.ink, read.title, 'the glyph is inked by the accent, not the title');
  });

  it('draws no glyph, and no empty slot, without an icon', async () => {
    const read = await inFixture('', header);
    assert.equal(read.glyph, null);
    assert.deepEqual(read.children, ['div', 'button']);
  });
});

/** The dialog and the region in viewport pixels, the point under the region's corner and the dialog's centre. */
function placement() {
  const box = (element) => {
    const { x, y, width, height } = element.getBoundingClientRect();
    return { x, y, width, height, cx: x + width / 2, cy: y + height / 2 };
  };
  const dialog = document.querySelector('[data-manager-modal]');
  const region = document.querySelector('[data-region]');
  const layer = region.querySelector('[data-companion-layer]');
  const corner = document.elementFromPoint(
    region.getBoundingClientRect().x + 6,
    region.getBoundingClientRect().y + 6
  );
  const middle = box(dialog);
  return {
    dialog: middle,
    region: box(region),
    viewport: { cx: innerWidth / 2, cy: innerHeight / 2 },
    cornerIsLayer: corner === layer,
    centreIsDialog: dialog.contains(document.elementFromPoint(middle.cx, middle.cy)),
    hostedIn: dialog.parentElement.parentElement === region,
    overlayBoxes: [...document.querySelectorAll('[data-manager-modal-overlay]')].map(
      (overlay) => getComputedStyle(overlay).display
    ),
  };
}

const near = (actual, expected) => Math.abs(actual - expected) <= 1;

describe('the Modal hosted in a companion region through the overlayHost option', () => {
  for (const kind of ['contain', 'transform']) {
    it(`centres the dialog in a region that makes itself the containing block, by ${kind}`, async () => {
      const read = await inFixture(`&region=${kind}`, placement);
      assert.equal(read.hostedIn, true, 'the chain drew the dialog in the region');
      assert.ok(near(read.dialog.cx, read.region.cx), `x ${read.dialog.cx} in ${read.region.cx}`);
      assert.ok(near(read.dialog.cy, read.region.cy), `y ${read.dialog.cy} in ${read.region.cy}`);
    });
  }

  for (const kind of ['plain', 'container']) {
    it(`centres the dialog in the viewport, not the region, for a ${kind} region, which makes no containing block`, async () => {
      const read = await inFixture(`&region=${kind}`, placement);
      assert.equal(read.hostedIn, true, 'the chain drew the dialog in the region');
      assert.ok(
        near(read.dialog.cx, read.viewport.cx),
        `x ${read.dialog.cx} in ${read.viewport.cx}`
      );
      assert.ok(
        near(read.dialog.cy, read.viewport.cy),
        `y ${read.dialog.cy} in ${read.viewport.cy}`
      );
      assert.ok(Math.abs(read.dialog.cx - read.region.cx) > 100, 'the region is not its centre');
    });
  }

  for (const kind of ['plain', 'contain']) {
    it(`draws no scrim and lies above a companion layer of lower z-index, in a ${kind} region`, async () => {
      const read = await inFixture(`&region=${kind}`, placement);
      assert.equal(read.cornerIsLayer, true, 'the companion layer is the topmost at the corner');
      assert.equal(read.centreIsDialog, true, 'the dialog is topmost over the companion layer');
      assert.deepEqual(read.overlayBoxes, ['contents'], 'the dialog’s marker element has no box');
    });
  }

  it('keeps the width cap from the viewport, not the region', async () => {
    const read = await inFixture('&region=contain&size=lg', placement, { width: 520, height: 800 });
    assert.equal(read.dialog.width, 472, 'a 700px region does not widen the 520px viewport’s cap');
  });

  it('keeps the height cap from the viewport, so a short region clips a tall dialog', async () => {
    const read = await inFixture(
      '&region=contain',
      () => {
        const dialog = document.querySelector('[data-manager-modal]');
        dialog.querySelector('.manager-modal-body').style.height = '900px';
        return {
          dialog: dialog.getBoundingClientRect().height,
          region: document.querySelector('[data-region]').getBoundingClientRect().height,
        };
      },
      DESKTOP
    );
    assert.equal(read.dialog, 640, 'min(640px, 100vh − 64px) at 800px');
    assert.ok(read.dialog > read.region, `${read.dialog} exceeds the region’s ${read.region}`);
  });

  it('caps the height at the viewport height less 64px when the window is short', async () => {
    const read = await inFixture(
      '&region=contain',
      () => {
        const dialog = document.querySelector('[data-manager-modal]');
        dialog.querySelector('.manager-modal-body').style.height = '900px';
        return dialog.getBoundingClientRect().height;
      },
      { width: DESKTOP.width, height: 500 }
    );
    assert.equal(read, 436, 'min(640px, 100vh − 64px) at 500px');
  });
});
