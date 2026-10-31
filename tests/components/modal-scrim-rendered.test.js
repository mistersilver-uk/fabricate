/**
 * The shared `Modal`'s `scrim` (issue 2859) in a real browser under the real sheet in
 * `layer(modules)`: `'dim'` draws a fixed scrim just before the dialog in its host, covering the
 * box the dialog is centred in, the viewport for the Manager root, a player-app root, a plain
 * region and the standalone layer, and a `contain: layout` region's own box; it lies over the
 * window and a companion layer of lower `z-index`, under the dialog and under a Foundry window
 * stacked above, takes the pointer from the window behind, and leaves the dialog's own pixels
 * unchanged. A press on it closes only with `closeOnOutsideClick`, a drag from inside never does,
 * and where `onClose` closes the dialog the press's `mouseup` lands behind it with no `click`; a
 * wheel over it does not scroll a scrolling host, whose content the scrim and the dialog scroll
 * with. It is outside the accessibility tree and takes no focus; Tab reaches the dimmed controls
 * without a trap and not with one. It never fades, and under forced colours it is `Canvas` at its
 * own opacity under the dialog's 1px system-text edge.
 * Limit: Chromium only; Foundry 14's own window chrome is not loaded, so a Foundry window is the
 * fixture's `.application` stand-in.
 */
import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';

import { createViteFixtureServer } from '../helpers/vite-fixture-server.js';

const fixtureServer = createViteFixtureServer({ styleMountPrefix: '/@overlay-host-styles/' });

const DIALOG = '[data-manager-modal]';
const SCRIM = '[data-manager-modal-scrim]';
const VIEWPORT = Object.freeze({ width: 1280, height: 800 });
const VIEWPORT_BOX = Object.freeze({ x: 0, y: 0, width: 1280, height: 800 });

before(async () => {
  await fixtureServer.start();
});

after(async () => {
  await fixtureServer.stop();
});

/** The fixture with the dialog open over the sheet in `layer(modules)`, with `query` appended. */
async function openDialog(query, options = {}) {
  const page = await fixtureServer.newPage({ viewport: VIEWPORT, ...options });
  await page.goto(
    fixtureServer.url(
      `/tests/fixtures/overlay-host/index.html?component=modal&layer=modules${query}`
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

/** Runs `body(page)` against a page opened with `query`, closing the page after. */
async function inFixture(query, body, options = {}) {
  const page = await openDialog(query, options);
  try {
    return await body(page);
  } finally {
    await page.close();
  }
}

/** Where the scrim sits and what the pointer hits at each named point of the page. */
function layout() {
  const dialog = document.querySelector('[data-manager-modal]');
  const scrim = document.querySelector('[data-manager-modal-scrim]');
  const box = (element) => {
    const { x, y, width, height } = element.getBoundingClientRect();
    return { x, y, width, height };
  };
  const centre = (element) => {
    const { x, y, width, height } = element.getBoundingClientRect();
    return [x + width / 2, y + height / 2];
  };
  const name = (node) => {
    if (!node) return null;
    if (node === scrim) return 'scrim';
    if (dialog.contains(node)) return 'dialog';
    if (node.closest('[data-window-above]')) return 'window above';
    if (node.closest('[data-behind]')) return 'window behind';
    if (node.closest('[data-companion-layer]')) return 'companion layer';
    return 'page';
  };
  const behind = document.querySelector('[data-behind="Recipes"]');
  const region = document.querySelector('[data-region]');
  const points = {
    dialog: centre(dialog),
    corner: [4, 4],
    ...(behind && { behind: centre(behind) }),
    ...(document.querySelector('[data-window-above]') && { above: [1260, 400] }),
    ...(region && {
      region: [region.getBoundingClientRect().x + 6, region.getBoundingClientRect().y + 6],
    }),
  };
  return {
    scrim: scrim && {
      box: box(scrim),
      beforeDialog: scrim.nextElementSibling === dialog,
      host: scrim.parentElement.matches('[style*="display: contents"]')
        ? scrim.parentElement.parentElement.className
        : scrim.parentElement.className,
      zIndex: getComputedStyle(scrim).zIndex,
      position: getComputedStyle(scrim).position,
    },
    dialogZ: getComputedStyle(dialog).zIndex,
    dialogCentre: points.dialog,
    region: region && { ...box(region), clientWidth: region.clientWidth },
    hits: Object.fromEntries(
      Object.entries(points).map(([key, [x, y]]) => [key, name(document.elementFromPoint(x, y))])
    ),
  };
}

const read = (query) => inFixture(query, (page) => page.evaluate(layout));

describe('where the Modal scrim is drawn', () => {
  it('draws it in the Manager root, over the whole viewport and the window behind, under the dialog and a window stacked above', async () => {
    const drawn = await read('&scrim=dim&busy=1&stack=1');
    assert.deepEqual(drawn.scrim, {
      box: VIEWPORT_BOX,
      beforeDialog: true,
      host: 'fabricate-manager',
      zIndex: drawn.dialogZ,
      position: 'fixed',
    });
    assert.deepEqual(drawn.hits, {
      dialog: 'dialog',
      corner: 'scrim',
      behind: 'scrim',
      above: 'window above',
    });
  });

  it('draws nothing over the window without a scrim, the baseline the hits above are judged against', async () => {
    const drawn = await read('&busy=1&stack=1');
    assert.equal(drawn.scrim, null);
    assert.deepEqual(drawn.hits, {
      dialog: 'dialog',
      corner: 'page',
      behind: 'window behind',
      above: 'window above',
    });
  });

  it('draws it in a player-app root over the viewport too', async () => {
    const drawn = await read('&host=app&scrim=dim&busy=1');
    assert.equal(drawn.scrim.host, 'application fabricate fabricate-app');
    assert.deepEqual(drawn.scrim.box, VIEWPORT_BOX);
    assert.deepEqual(drawn.hits, { dialog: 'dialog', corner: 'scrim', behind: 'scrim' });
  });

  it('covers exactly a contain: layout region, the box the dialog is centred in, over its companion layer', async () => {
    const drawn = await read('&scrim=dim&region=contain');
    const { box } = drawn.scrim;
    assert.equal(drawn.scrim.beforeDialog, true);
    assert.equal(drawn.scrim.host, '', 'in the chain’s container in the region');
    assert.equal(box.width, drawn.region.clientWidth, 'the region’s padding box');
    assert.ok(box.x > drawn.region.x && box.x - drawn.region.x <= 1);
    const [cx, cy] = drawn.dialogCentre;
    assert.ok(Math.abs(cx - (box.x + box.width / 2)) <= 1, 'the dialog is centred in it');
    assert.ok(Math.abs(cy - (box.y + box.height / 2)) <= 1, 'the dialog is centred in it');
    assert.deepEqual(drawn.hits, { dialog: 'dialog', corner: 'page', region: 'scrim' });
  });

  it('covers the viewport from a plain region, where the dialog is centred in the viewport', async () => {
    const drawn = await read('&scrim=dim&region=plain');
    assert.deepEqual(drawn.scrim.box, VIEWPORT_BOX);
    assert.deepEqual(drawn.hits, { dialog: 'dialog', corner: 'scrim', region: 'scrim' });
  });

  it('takes the pointer on the standalone layer, which passes it to the page without a scrim', async () => {
    const dimmed = await read('&scrim=dim&standalone=1');
    assert.equal(dimmed.scrim.host, 'fabricate fabricate-standalone-overlay');
    assert.deepEqual(dimmed.scrim.box, VIEWPORT_BOX);
    assert.deepEqual(dimmed.hits, { dialog: 'dialog', corner: 'scrim' });
    const plain = await read('&standalone=1');
    assert.deepEqual(plain.hits, { dialog: 'dialog', corner: 'page' });
  });

  for (const value of ['dim%20', 'DIM', 'true', 'none']) {
    it(`draws no scrim for ${decodeURIComponent(value)}`, async () => {
      assert.equal((await read(`&scrim=${value}`)).scrim, null);
    });
  }
});

/**
 * Whether the point near the scrolling region's corner hit the scrim or the companion's layer
 * before a real wheel there, and the region's `scrollTop` after it.
 */
async function wheeled(page) {
  const { hit, x, y } = await page.$eval('[data-region]', (region) => {
    const box = region.getBoundingClientRect();
    const [px, py] = [box.x + 12, box.y + 12];
    const node = document.elementFromPoint(px, py);
    return {
      hit: Boolean(node?.matches('[data-manager-modal-scrim], [data-companion-layer]')),
      x: px,
      y: py,
    };
  });
  await page.mouse.move(x, y);
  await page.mouse.wheel(0, 400);
  await page.evaluate(
    () => new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(done)))
  );
  await page.waitForTimeout(200);
  return { hit, scrollTop: await page.$eval('[data-region]', (region) => region.scrollTop) };
}

describe('the Modal scrim over a region that scrolls', () => {
  it('scrolls the region under a wheel without a scrim, the baseline', async () => {
    const after = await inFixture('&region=scroll', wheeled);
    assert.equal(after.hit, true, 'the wheel is over the region');
    assert.ok(after.scrollTop > 0, `the region scrolled to ${after.scrollTop}`);
  });

  it('holds the region still under a wheel over the scrim', async () => {
    const after = await inFixture('&region=scroll&scrim=dim', wheeled);
    assert.deepEqual(after, { hit: true, scrollTop: 0 });
  });

  it('scrolls the scrim and the dialog with the region’s content when the region scrolls', async () => {
    const moved = await inFixture('&region=scroll&scrim=dim', (page) =>
      page.evaluate(() => {
        const tops = () =>
          ['[data-manager-modal-scrim]', '[data-manager-modal]'].map(
            (selector) => document.querySelector(selector).getBoundingClientRect().top
          );
        const before = tops();
        document.querySelector('[data-region]').scrollTop = 100;
        return tops().map((top, index) => before[index] - top);
      })
    );
    assert.deepEqual(moved, [100, 100]);
  });
});

/** The `[r, g, b]` Chromium paints at the viewport pixel `x`, `y`. */
async function pixelAt(page, x, y) {
  const shot = await page.screenshot({ clip: { x, y, width: 1, height: 1 } });
  return page.evaluate(
    async (bytes) => {
      const blob = new Blob([new Uint8Array(bytes)], { type: 'image/png' });
      const image = await createImageBitmap(blob);
      const canvas = document.createElement('canvas');
      canvas.width = 1;
      canvas.height = 1;
      const context = canvas.getContext('2d', { willReadFrequently: true });
      context.drawImage(image, 0, 0);
      return [...context.getImageData(0, 0, 1, 1).data].slice(0, 3);
    },
    [...shot]
  );
}

/** A pixel of the window behind, right of its buttons, and one of the dialog's body. */
const paintPoints = (page) =>
  page.evaluate(() => {
    const row = document.querySelector('[data-behind="row"]').getBoundingClientRect();
    const body = document.querySelector('.manager-modal-body').getBoundingClientRect();
    return {
      behind: [Math.round(row.right - 12), Math.round(row.y + row.height / 2)],
      dialog: [Math.round(body.x + 6), Math.round(body.y + 6)],
    };
  });

describe('what the Modal scrim paints', () => {
  it('dims the window behind by the scrim’s own colour and leaves the dialog’s pixels unchanged', async () => {
    const plain = await inFixture('&busy=1', async (page) => {
      const points = await paintPoints(page);
      return {
        points,
        behind: await pixelAt(page, ...points.behind),
        dialog: await pixelAt(page, ...points.dialog),
      };
    });
    const dimmed = await inFixture('&busy=1&scrim=dim', async (page) => ({
      colour: await page.$eval(SCRIM, (scrim) => getComputedStyle(scrim).backgroundColor),
      behind: await pixelAt(page, ...plain.points.behind),
      dialog: await pixelAt(page, ...plain.points.dialog),
    }));
    const [r, g, b, alpha] = dimmed.colour.match(/[\d.]+/gu).map(Number);
    assert.ok(alpha > 0.5, `a scrim that dims: ${dimmed.colour}`);
    const expected = plain.behind.map(
      (channel, index) => channel * (1 - alpha) + [r, g, b][index] * alpha
    );
    for (const [index, channel] of dimmed.behind.entries()) {
      assert.ok(
        Math.abs(channel - expected[index]) <= 1.5,
        `the window behind is ${dimmed.behind}, ${plain.behind} under ${dimmed.colour}`
      );
    }
    assert.notDeepEqual(dimmed.behind, plain.behind, 'the window behind is dimmed');
    assert.deepEqual(dimmed.dialog, plain.dialog, 'the dialog is drawn above the scrim');
  });

  for (const reducedMotion of ['no-preference', 'reduce']) {
    it(`draws the scrim at full strength from its first frame with no fade, under ${reducedMotion} motion`, async () => {
      const motion = await inFixture(
        '&scrim=dim',
        (page) =>
          page.$eval(SCRIM, (scrim) => {
            const style = getComputedStyle(scrim);
            return {
              animations: scrim.getAnimations().length,
              animation: style.animationName,
              transition: style.transitionDuration,
              opacity: style.opacity,
            };
          }),
        { reducedMotion }
      );
      assert.deepEqual(motion, {
        animations: 0,
        animation: 'none',
        transition: '0s',
        opacity: '1',
      });
    });
  }

  it('keeps a 1px system-text edge on the dialog above the scrim under forced colours', async () => {
    const forced = await inFixture('&scrim=dim&busy=1', async (page) => {
      await page.emulateMedia({ forcedColors: 'active' });
      await page.evaluate(
        () => new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(done)))
      );
      const read = await page.$eval(DIALOG, (dialog) => {
        const system = (colour) => {
          const probe = document.createElement('span');
          probe.style.color = colour;
          document.body.append(probe);
          const computed = getComputedStyle(probe).color;
          probe.remove();
          return computed;
        };
        const canvasText = system('CanvasText');
        const style = getComputedStyle(dialog);
        const { x, y, width } = dialog.getBoundingClientRect();
        const scrim = document.querySelector('[data-manager-modal-scrim]');
        return {
          canvasText,
          canvas: system('Canvas'),
          edges: ['Top', 'Right', 'Bottom', 'Left'].map((side) => [
            style[`border${side}Style`],
            style[`border${side}Width`],
            style[`border${side}Color`],
          ]),
          scrim: getComputedStyle(scrim).backgroundColor,
          edgePoint: [Math.round(x + width / 2), Math.floor(y)],
          outsidePoint: [Math.round(x + width / 2), Math.floor(y) - 3],
          edgeHit: dialog.contains(document.elementFromPoint(x + width / 2, y + 0.5)),
        };
      });
      return {
        ...read,
        edge: await pixelAt(page, ...read.edgePoint),
        outside: await pixelAt(page, ...read.outsidePoint),
      };
    });
    for (const edge of forced.edges) assert.deepEqual(edge, ['solid', '1px', forced.canvasText]);
    assert.equal(forced.edgeHit, true, 'the edge is drawn above the scrim');
    const channels = (colour) => colour.match(/[\d.]+/gu).map(Number);
    const [r, g, b, alpha] = channels(forced.scrim);
    assert.deepEqual(
      [r, g, b],
      channels(forced.canvas).slice(0, 3),
      'the scrim is drawn in Canvas'
    );
    assert.equal(alpha, 0.78, `the scrim keeps its opacity: ${forced.scrim}`);
    assert.notDeepEqual([r, g, b], channels(forced.canvasText), 'not in the edge’s colour');
    const apart = forced.edge.reduce(
      (sum, channel, index) => sum + Math.abs(channel - forced.outside[index]),
      0
    );
    assert.ok(apart > 300, `the edge ${forced.edge} stands off the scrim ${forced.outside}`);
  });
});

/** What a press at `[x, y]`, or a drag from `from` to `to`, did: closes, focus and window clicks. */
async function pressed(page, from, to = from) {
  await page.evaluate(() => {
    document.body.dataset.behindClicks = '0';
    for (const button of document.querySelectorAll('[data-behind] button')) {
      button.addEventListener('click', () => {
        document.body.dataset.behindClicks = String(Number(document.body.dataset.behindClicks) + 1);
      });
    }
    document.activeElement.dataset.focusedBefore = '';
    const named = (node) =>
      node?.closest?.('[data-behind]')?.dataset.behind ??
      (node?.closest?.('[data-manager-modal-scrim]') ? 'scrim' : node?.nodeName.toLowerCase());
    document.body.dataset.ups = '';
    for (const type of ['mouseup', 'click']) {
      document.addEventListener(
        type,
        (event) => {
          document.body.dataset.ups += `${type}:${named(event.target)} `;
        },
        { capture: true }
      );
    }
  });
  await page.mouse.move(...from);
  await page.mouse.down();
  await page.mouse.move(...to, { steps: 4 });
  await page.mouse.up();
  return page.evaluate(() => ({
    closes: document.body.dataset.modalCloses,
    behindClicks: document.body.dataset.behindClicks,
    focusKept: document.activeElement.matches('[data-focused-before]'),
    dialogs: document.querySelectorAll('[data-manager-modal], [data-manager-modal-scrim]').length,
    ups: document.body.dataset.ups.trim(),
  }));
}

const centreOf = (page, selector) =>
  page.$eval(selector, (element) => {
    const { x, y, width, height } = element.getBoundingClientRect();
    return [x + width / 2, y + height / 2];
  });

describe('a press on the Modal scrim', () => {
  it('calls onClose once with closeOnOutsideClick, and the window behind hears nothing', async () => {
    const result = await inFixture('&scrim=dim&busy=1&trap=1', async (page) =>
      pressed(page, await centreOf(page, '[data-behind="Recipes"]'))
    );
    assert.deepEqual(result, {
      closes: '1',
      behindClicks: '0',
      focusKept: true,
      dialogs: 2,
      ups: 'mouseup:scrim click:scrim',
    });
  });

  it('calls nothing and keeps focus in the dialog with closeOnOutsideClick false', async () => {
    const result = await inFixture('&scrim=dim&busy=1&trap=1&outside=off', async (page) =>
      pressed(page, await centreOf(page, '[data-behind="Recipes"]'))
    );
    assert.deepEqual(result, {
      closes: '0',
      behindClicks: '0',
      focusKept: true,
      dialogs: 2,
      ups: 'mouseup:scrim click:scrim',
    });
  });

  it('reaches the window behind at the same point without a scrim, so the point is a control', async () => {
    const result = await inFixture('&busy=1&trap=1&outside=off', async (page) =>
      pressed(page, await centreOf(page, '[data-behind="Recipes"]'))
    );
    assert.deepEqual(result, {
      closes: '0',
      behindClicks: '1',
      focusKept: false,
      dialogs: 1,
      ups: 'mouseup:Recipes click:Recipes',
    });
  });

  it('removes the dialog and the scrim at mousedown when onClose closes it, so the mouseup lands behind and no click follows', async () => {
    const result = await inFixture('&scrim=dim&busy=1&trap=1&closes=1', async (page) =>
      pressed(page, await centreOf(page, '[data-behind="Recipes"]'))
    );
    const { closes, behindClicks, dialogs, ups } = result;
    assert.deepEqual(
      { closes, behindClicks, dialogs, ups },
      {
        closes: '1',
        behindClicks: '0',
        dialogs: 0,
        ups: 'mouseup:Recipes',
      }
    );
  });

  it('calls nothing for a drag that starts inside the dialog and ends on the scrim', async () => {
    const result = await inFixture('&scrim=dim&busy=1&trap=1', async (page) =>
      pressed(page, await centreOf(page, '[data-modal-text]'), [6, 6])
    );
    assert.equal(result.closes, '0');
    assert.equal(result.behindClicks, '0');
  });
});

/** Whether Chromium's accessibility tree ignores the scrim, and the dialog's `modal` state. */
async function axState(page) {
  const client = await page.context().newCDPSession(page);
  try {
    const { root } = await client.send('DOM.getDocument', { depth: -1 });
    const { nodeId } = await client.send('DOM.querySelector', {
      nodeId: root.nodeId,
      selector: SCRIM,
    });
    const scrim = await client.send('Accessibility.getPartialAXTree', {
      nodeId,
      fetchRelatives: false,
    });
    const { nodes } = await client.send('Accessibility.getFullAXTree');
    const dialog = nodes.find((node) => node.role?.value === 'dialog');
    return {
      scrimIgnored: scrim.nodes[0]?.ignored === true,
      modal:
        dialog.properties?.find((property) => property.name === 'modal')?.value?.value ?? false,
    };
  } finally {
    await client.detach();
  }
}

describe('the Modal scrim and the keyboard', () => {
  it('is ignored by the accessibility tree, and the dimmed dialog is modal only with trapFocus', async () => {
    assert.deepEqual(await inFixture('&scrim=dim', axState), {
      scrimIgnored: true,
      modal: false,
    });
    assert.deepEqual(await inFixture('&scrim=dim&trap=1', axState), {
      scrimIgnored: true,
      modal: true,
    });
  });

  it('takes no focus, and stays out of a trap, which keeps Tab inside a dimmed dialog as in any other (a regression guard)', async () => {
    const walk = await inFixture('&scrim=dim&busy=1&trap=1', async (page) => {
      const scrimFocus = await page.$eval(SCRIM, (scrim) => {
        const before = document.activeElement;
        scrim.focus();
        return { kept: document.activeElement === before, tabIndex: scrim.tabIndex };
      });
      const stops = [];
      for (let step = 0; step < 6; step += 1) {
        await page.keyboard.press(step % 2 ? 'Shift+Tab' : 'Tab');
        await page.keyboard.press('Tab');
        stops.push(
          await page.evaluate(() => {
            const active = document.activeElement;
            if (active.closest('[data-manager-modal]')) return 'dialog';
            return active.closest('[data-behind]') ? 'window behind' : active.tagName;
          })
        );
      }
      return { scrimFocus, stops };
    });
    assert.deepEqual(walk.scrimFocus, { kept: true, tabIndex: -1 });
    assert.deepEqual(new Set(walk.stops), new Set(['dialog']));
  });

  it('lets Tab reach the dimmed controls behind the scrim without trapFocus', async () => {
    const reached = await inFixture('&scrim=dim&busy=1', async (page) => {
      await page.keyboard.press('Tab');
      return page.evaluate(() => document.activeElement.closest('[data-behind]')?.dataset.behind);
    });
    assert.equal(reached, 'Recipes');
  });
});
