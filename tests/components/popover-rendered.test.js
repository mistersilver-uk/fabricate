/**
 * The published `Popover` (issue 2861) in a real browser, mounted through the real seam under the
 * module sheet: it opens on the side it states while its content fits, flips to the other side at
 * either viewport edge, lines its start or end edge up with the anchor's, is clamped 8px inside
 * the viewport, caps its height to the room it takes and scrolls inside, and follows its anchor as
 * a scroller scrolls and the window resizes. It is drawn in the Manager's root, above a published
 * `Modal` it was opened inside, under a `Select` list opened inside it, and in a Fabricate window
 * in a window `window.open` opened, as Foundry 14 detaches one. Focus enters it, Tab wraps, Escape
 * and an outside press close it, focus returns to the anchor from inside and stays where an
 * outside press put it. Chromium's tree reads it as a named dialog; it never animates; under
 * forced colours its edge is painted in the system text colour.
 * Limit: Chromium only; Foundry 14's own window chrome is not loaded, so a Foundry window is the
 * fixture's `.application` stand-in, and screen-reader speech is not observed.
 */
import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';

import { chromiumAxNode } from '../helpers/chromiumAxNode.js';
import { createViteFixtureServer } from '../helpers/vite-fixture-server.js';

const server = createViteFixtureServer({ styleMountPrefix: '/@popover-styles/' });
const VIEWPORT = Object.freeze({ width: 1280, height: 800 });
const PANEL = '.fabricate-popover';
const ANCHOR = '#fixture-anchor';
const GAP = 6;
const MARGIN = 8;

before(() => server.start());
after(() => server.stop());

const twoFrames = (page) =>
  page.evaluate(
    () => new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(done)))
  );

/** The fixture opened with `query`, past its mount and two frames. */
async function open(query, options = {}) {
  const page = await server.newPage({ viewport: VIEWPORT, ...options });
  const errors = [];
  page.on('pageerror', (error) => {
    errors.push(String(error));
  });
  await page.goto(server.url(`/tests/fixtures/popover/index.html?${query}`));
  if (!query.includes('host=detached')) {
    await page.waitForFunction(() => globalThis.__popoverReady === true);
    await twoFrames(page);
  }
  page.errors = errors;
  return page;
}

/** Runs `body(page)` on the fixture opened with `query`, then closes the page. */
async function inFixture(query, body, options = {}) {
  const page = await open(query, options);
  try {
    const answer = await body(page);
    assert.deepEqual(page.errors, [], 'no page error');
    return answer;
  } finally {
    await page.close();
  }
}

/** The panel's and the anchor's viewport boxes, and the panel body's scroll and client heights. */
function readBoxes() {
  const box = (element) => {
    if (!element) return null;
    const { left, top, right, bottom, width, height } = element.getBoundingClientRect();
    return { left, top, right, bottom, width, height };
  };
  const panel = document.querySelector('.fabricate-popover');
  const scroller = panel?.querySelector('.fabricate-popover-body');
  return {
    panel: box(panel),
    anchor: box(document.querySelector('#fixture-anchor')),
    scroll: scroller && [scroller.scrollHeight, scroller.clientHeight],
    host: panel?.parentElement?.parentElement?.className ?? null,
  };
}

const boxes = (page) => page.evaluate(readBoxes);
const closes = (page) => page.evaluate(() => Number(document.body.dataset.closes));
const near = (actual, expected, what) =>
  assert.ok(Math.abs(actual - expected) <= 0.5, `${what}: ${actual} is not ${expected}`);

describe('where the published Popover is placed on the standalone layer', () => {
  it('opens below a cell with room, its start edge on the anchor’s', () =>
    inFixture('host=companion&ax=40&ay=40', async (page) => {
      const { panel, anchor, host } = await boxes(page);
      assert.equal(host, 'fabricate fabricate-standalone-overlay');
      near(panel.top, anchor.bottom + GAP, 'below the anchor');
      near(panel.left, anchor.left, 'start edge');
    }));

  it('flips above a cell at the viewport’s foot', () =>
    inFixture('host=companion&ax=40&ay=740', async (page) => {
      const { panel, anchor } = await boxes(page);
      near(panel.bottom, anchor.top - GAP, 'above the anchor');
    }));

  it('opens above for top-start with room, and flips below at the viewport’s head', async () => {
    await inFixture('host=companion&ax=40&ay=400&placement=top-start', async (page) => {
      const { panel, anchor } = await boxes(page);
      near(panel.bottom, anchor.top - GAP, 'above the anchor');
    });
    await inFixture('host=companion&ax=40&ay=20&placement=top-start', async (page) => {
      const { panel, anchor } = await boxes(page);
      near(panel.top, anchor.bottom + GAP, 'flipped below');
    });
  });

  it('lines its end edge up with the anchor’s for bottom-end and top-end', async () => {
    for (const placement of ['bottom-end', 'top-end']) {
      await inFixture(`host=companion&ax=600&ay=400&placement=${placement}`, async (page) => {
        const { panel, anchor } = await boxes(page);
        near(panel.right, anchor.right, `${placement} end edge`);
      });
    }
  });

  it('is clamped 8px inside the viewport’s right and left edges', async () => {
    await inFixture('host=companion&ax=1240&ay=40', async (page) => {
      const { panel } = await boxes(page);
      near(panel.right, VIEWPORT.width - MARGIN, 'right edge');
    });
    await inFixture('host=companion&ax=-60&ay=40&placement=bottom-end', async (page) => {
      const { panel } = await boxes(page);
      near(panel.left, MARGIN, 'left edge');
    });
  });

  it('draws bottom-start for a placement outside the set', () =>
    inFixture('host=companion&ax=40&ay=400&placement=left', async (page) => {
      const { panel, anchor } = await boxes(page);
      near(panel.top, anchor.bottom + GAP, 'below');
      near(panel.left, anchor.left, 'start edge');
    }));

  it('takes the side with more room for content taller than either, capped there and scrolling inside', () =>
    inFixture('host=companion&content=tall&ax=40&ay=380', async (page) => {
      const { panel, anchor, scroll } = await boxes(page);
      near(panel.top, anchor.bottom + GAP, 'below, the side with more room');
      near(panel.bottom, VIEWPORT.height - MARGIN, 'capped at the margin');
      assert.ok(scroll[0] > scroll[1], `the body scrolls: ${scroll}`);
    }));
});

describe('the published Popover follows its anchor', () => {
  it('is placed again when an update changes its placement, and when its content outgrows the room below', () =>
    inFixture('host=companion&ax=40&ay=500', async (page) => {
      const before = await boxes(page);
      near(before.panel.top, before.anchor.bottom + GAP, 'below to begin with');
      await page.evaluate(() => globalThis.__popover.update({ placement: 'top-start' }));
      await twoFrames(page);
      const above = await boxes(page);
      near(above.panel.bottom, above.anchor.top - GAP, 'above once placement says so');
      await page.evaluate(() => globalThis.__popover.update({ placement: 'bottom-start' }));
      await twoFrames(page);
      near((await boxes(page)).panel.top, before.anchor.bottom + GAP, 'below again');
      await page.evaluate(() => {
        const slot = globalThis.__popover.handle.slot('body');
        for (let line = 1; line <= 20; line += 1) slot.append(document.createElement('p'));
        for (const line of slot.querySelectorAll('p')) line.textContent = 'A line of notes';
      });
      await twoFrames(page);
      const grown = await boxes(page);
      near(grown.panel.bottom, grown.anchor.top - GAP, 'flipped above as its content grew');
    }));

  it('moves with its anchor when the Manager’s scroller scrolls', () =>
    inFixture('host=manager&ax=40&ay=200', async (page) => {
      const before = await boxes(page);
      assert.equal(before.host, 'fabricate-manager');
      await page.evaluate(() => {
        document.querySelector('[data-fixture-scroller]').scrollTop = 100;
      });
      await twoFrames(page);
      const after = await boxes(page);
      near(after.anchor.top, before.anchor.top - 100, 'the anchor scrolled');
      near(after.panel.top, after.anchor.bottom + GAP, 'and the panel with it');
    }));

  it('flips above once a resize leaves it no room below', () =>
    inFixture('host=companion&ax=40&ay=500', async (page) => {
      const before = await boxes(page);
      near(before.panel.top, before.anchor.bottom + GAP, 'below at 800px');
      await page.setViewportSize({ width: 1280, height: 600 });
      await twoFrames(page);
      const after = await boxes(page);
      near(after.panel.bottom, after.anchor.top - GAP, 'above at 600px');
    }));
});

/** Where the pointer lands at the centre of `selector`, named by the part it is in. */
function hitAt(selector) {
  const element = document.querySelector(selector);
  const { left, top, width, height } = element.getBoundingClientRect();
  const hit = document.elementFromPoint(left + width / 2, top + height / 2);
  if (hit?.closest('[role="listbox"]')) return 'list';
  if (hit?.closest('.fabricate-popover')) return 'popover';
  if (hit?.closest('.fabricate-modal')) return 'dialog';
  return hit?.localName ?? null;
}

describe('the published Popover’s stacking', () => {
  it('is drawn above a published Modal it was opened inside, in the Manager root', () =>
    inFixture('host=modal&ay=0', async (page) => {
      const { host } = await boxes(page);
      assert.equal(host, 'fabricate-manager');
      const order = await page.evaluate(() => {
        const z = (selector) => getComputedStyle(document.querySelector(selector)).zIndex;
        return [z('.fabricate-modal'), z('.fabricate-popover')];
      });
      assert.deepEqual(order, ['100', '4000']);
      assert.equal(await page.evaluate(hitAt, PANEL), 'popover');
    }));

  it('draws a Select list opened inside it above it, and a press there chooses without closing the popover', () =>
    inFixture('host=manager&ax=40&ay=40&content=select', async (page) => {
      await page.click(`${PANEL} [data-fixture-select] button`);
      await twoFrames(page);
      assert.equal(
        await page.evaluate(hitAt, '[role="listbox"] [role="option"]:nth-child(2)'),
        'list'
      );
      await page.click('[role="listbox"] [role="option"]:nth-child(2)');
      await twoFrames(page);
      assert.equal(await closes(page), 0, 'onClose was not called');
      assert.ok(await page.$(PANEL), 'the popover is still drawn');
      assert.match(await page.textContent(`${PANEL} [data-fixture-select] button`), /Long rest/u);
    }));
});

describe('the published Popover in a Foundry 14 detached window', () => {
  it('finds its anchor and draws its panel in the detached window, and closes and returns focus there', () =>
    inFixture('host=detached', async (page) => {
      const [popup] = await Promise.all([
        page.waitForEvent('popup'),
        page.click('[data-fixture-open-detached]'),
      ]);
      await page.waitForFunction(() => globalThis.__popoverReady === true);
      await popup.setViewportSize({ width: 1100, height: 760 });
      await twoFrames(popup);
      assert.equal(await page.$(PANEL), null, 'nothing is drawn in the opener');
      const drawn = await popup.evaluate(readBoxes);
      assert.equal(
        drawn.host,
        'application fabricate fabricate-app',
        'the detached window’s frame'
      );
      // The frame's 1px border: its box is measured from the border edge and contains the panel
      // from the padding edge, as for every overlay hosted by a bordered window frame.
      const frameBorder = 1;
      near(drawn.panel.top, drawn.anchor.bottom + GAP + frameBorder, 'below its anchor there');
      near(drawn.panel.left, drawn.anchor.left + frameBorder, 'start edge');
      const focused = () => popup.evaluate(() => document.activeElement?.dataset.fixtureValue);
      assert.equal(await focused(), '', 'focus moved into its first control');
      await popup.keyboard.press('Escape');
      await twoFrames(popup);
      assert.equal(await popup.evaluate(() => document.body.dataset.closes), '1');
      assert.equal(await popup.$(PANEL), null, 'closed');
      assert.equal(
        await popup.evaluate(() => document.activeElement?.id),
        'fixture-anchor',
        'focus is back on the anchor'
      );
    }));
});

const activeHook = (page) =>
  page.evaluate(() => {
    const active = document.activeElement;
    if (!active || active === document.body) return 'page';
    if (active.id === 'fixture-anchor') return 'anchor';
    if (active.matches('[data-popover-body]')) return 'body';
    return (
      active.dataset.fixtureDelta ??
      (active.dataset.fixtureValue === '' ? 'value' : null) ??
      (active.dataset.fixtureReason === '' ? 'reason' : active.localName)
    );
  });

describe('the published Popover’s keyboard and focus model', () => {
  it('moves focus to its first control, wraps Tab and Shift+Tab, and returns focus to the anchor on Escape', () =>
    inFixture('host=companion', async (page) => {
      assert.equal(await activeHook(page), 'value');
      const order = [];
      for (let step = 0; step < 8; step += 1) {
        await page.keyboard.press('Tab');
        order.push(await activeHook(page));
      }
      assert.deepEqual(order, ['−5', '−2', '−1', '+1', '+2', '+5', 'reason', 'value']);
      await page.keyboard.press('Shift+Tab');
      assert.equal(await activeHook(page), 'reason', 'Shift+Tab from the first wraps to the last');
      await page.keyboard.press('Escape');
      await twoFrames(page);
      assert.equal(await closes(page), 1);
      assert.equal(await page.$(PANEL), null);
      assert.equal(await activeHook(page), 'anchor');
      assert.ok(await page.$eval(ANCHOR, (anchor) => anchor.matches(':focus-visible')));
      await page.keyboard.press('Enter');
      await twoFrames(page);
      assert.equal(await activeHook(page), 'value', 'the companion’s toggle reopened it');
    }));

  it('closes on an outside press and leaves focus where the press put it, and a press on the anchor is the companion’s toggle', async () => {
    await inFixture('host=companion', async (page) => {
      await page.mouse.click(900, 600);
      await twoFrames(page);
      assert.equal(await closes(page), 1, 'an outside press');
      assert.equal(await activeHook(page), 'page', 'focus is not taken back to the anchor');
    });
    await inFixture('host=companion', async (page) => {
      await page.click(ANCHOR);
      await twoFrames(page);
      assert.equal(await closes(page), 0, 'the anchor is no outside press');
      assert.equal(await page.$(PANEL), null, 'the companion’s own toggle closed it');
    });
    await inFixture('host=companion&outside=0', async (page) => {
      await page.mouse.click(900, 600);
      await twoFrames(page);
      assert.equal(await closes(page), 0, 'closeOnOutsideClick false');
      assert.ok(await page.$(PANEL));
    });
  });
});

describe('the published Popover in Chromium’s accessibility tree', () => {
  it('is a dialog named by ariaLabel, or by its title heading', async () => {
    await inFixture('host=companion', async (page) => {
      const node = await chromiumAxNode(page, PANEL);
      assert.deepEqual([node.role, node.name, node.ignored], ['dialog', 'Adjust Strength', false]);
    });
    await inFixture('host=companion&label=title', async (page) => {
      const node = await chromiumAxNode(page, PANEL);
      assert.deepEqual([node.role, node.name], ['dialog', 'Strength']);
      assert.ok(
        node.descendants.some(({ role }) => role === 'heading'),
        'the heading'
      );
    });
  });
});

describe('the published Popover under reduced motion and forced colours', () => {
  it('runs no animation or transition as it opens, with and without reduced motion', async () => {
    for (const reducedMotion of ['no-preference', 'reduce']) {
      await inFixture(
        'host=companion&open=0',
        async (page) => {
          const read = await page.evaluate(async () => {
            const { update } = globalThis.__popover;
            update({ open: true });
            await new Promise((done) => requestAnimationFrame(done));
            const panel = document.querySelector('.fabricate-popover');
            const style = getComputedStyle(panel);
            return {
              animations: document.getAnimations().length,
              transition: style.transitionDuration,
              animation: style.animationName,
            };
          });
          assert.deepEqual(
            read,
            { animations: 0, transition: '0s', animation: 'none' },
            reducedMotion
          );
        },
        { reducedMotion }
      );
    }
  });

  for (const colorScheme of ['dark', 'light']) {
    it(`paints its edge in the system text colour over the system ground, ${colorScheme} forced palette`, () =>
      inFixture(
        'host=companion&ax=40&ay=40&content=empty',
        async (page) => {
          const { panel } = await boxes(page);
          const read = await page.evaluate(() => {
            const style = getComputedStyle(document.querySelector('.fabricate-popover'));
            const probe = document.createElement('span');
            probe.style.color = 'CanvasText';
            document.body.append(probe);
            const system = getComputedStyle(probe).color;
            probe.remove();
            return { edge: style.borderTopColor, shadow: style.boxShadow, system };
          });
          const x = Math.round(panel.left + panel.width / 2);
          const edge = await pixelAt(page, x, Math.floor(panel.top));
          const inside = await pixelAt(page, x, Math.floor(panel.top) + 12);
          assert.equal(read.shadow, 'none');
          assert.equal(read.edge, read.system, 'the edge is the system text colour');
          assert.deepEqual(edge, channels(read.system), `the edge pixel is ${read.system}`);
          assert.notDeepEqual(edge, inside, 'the edge differs from the ground inside it');
        },
        { forcedColors: 'active', colorScheme }
      ));
  }
});

/** `[r, g, b]` of a computed `rgb()` colour. */
function channels(value) {
  return value.match(/\d+/gu).slice(0, 3).map(Number);
}

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

/** The panel's computed visibility, or `null` with no panel. */
const visibility = (page) =>
  page.evaluate(() => {
    const panel = document.querySelector('.fabricate-popover');
    return panel ? getComputedStyle(panel).visibility : null;
  });

describe('Escape on the published Popover, judged as the key goes down', () => {
  for (const [content, picker] of [
    ['select', 'a published Select'],
    ['picker', 'a published IconPicker'],
  ]) {
    it(`closes from ${picker}'s trigger, which stops every key it does not use, and returns focus to the anchor`, () =>
      inFixture(`host=companion&content=${content}`, async (page) => {
        assert.equal(await activeHook(page), 'button', `focus entered on ${picker}'s trigger`);
        await page.keyboard.press('Escape');
        await twoFrames(page);
        assert.equal(await closes(page), 1);
        assert.equal(await page.$(PANEL), null);
        assert.equal(await activeHook(page), 'anchor');
      }));
  }

  it('leaves the first Escape to an open Select list, and closes on the second', () =>
    inFixture('host=companion&content=select', async (page) => {
      await page.keyboard.press('Enter');
      await twoFrames(page);
      assert.ok(await page.$('[role="listbox"]'), 'the list is open');
      await page.keyboard.press('Escape');
      await twoFrames(page);
      assert.equal(await page.$('[role="listbox"]'), null, 'the list closed');
      assert.equal(await closes(page), 0, 'the popover stayed');
      await page.keyboard.press('Escape');
      await twoFrames(page);
      assert.equal(await closes(page), 1, 'the second Escape closes it');
    }));

  it('closes on Escape on the anchor, as after a press outside that closeOnOutsideClick false keeps open', () =>
    inFixture('host=companion&outside=0', async (page) => {
      await page.mouse.click(900, 600);
      await twoFrames(page);
      assert.ok(await page.$(PANEL), 'still open');
      await page.focus(ANCHOR);
      await page.keyboard.press('Escape');
      await twoFrames(page);
      assert.equal(await closes(page), 1);
    }));

  it('closes a popover opened inside a published Modal and leaves the dialog open, whose own Escape is the next', () =>
    inFixture('host=modal&ay=0', async (page) => {
      assert.equal(await activeHook(page), 'value');
      await page.keyboard.press('Escape');
      await twoFrames(page);
      const after = () =>
        page.evaluate(() => ({
          popover: Number(document.body.dataset.closes),
          modal: Number(document.body.dataset.modalCloses ?? 0),
          dialog: Boolean(document.querySelector('.fabricate-modal')),
        }));
      assert.deepEqual(await after(), { popover: 1, modal: 0, dialog: true });
      assert.equal(await activeHook(page), 'anchor');
      await page.keyboard.press('Escape');
      await twoFrames(page);
      assert.deepEqual((await after()).modal, 1, 'with the popover closed, Escape is the dialog’s');
    }));
});

describe('the published Popover’s Tab entry and focus on a redraw', () => {
  it('moves focus into the panel on Tab from the anchor, the panel drawn at the end of the page', () =>
    inFixture('host=companion', async (page) => {
      const away = await page.evaluate(() => {
        const anchor = document.querySelector('#fixture-anchor');
        const after = document.querySelector('[data-fixture-after]');
        const panel = document.querySelector('.fabricate-popover');
        const before = (a, b) =>
          Boolean(a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING);
        return before(anchor, after) && before(after, panel);
      });
      assert.ok(away, 'a control of the companion’s stands between the anchor and the panel');
      await page.focus(ANCHOR);
      await page.keyboard.press('Tab');
      assert.equal(await activeHook(page), 'value');
    }));

  it('leaves focus on a control the user moved to while the anchor was gone', () =>
    inFixture('host=companion', async (page) => {
      assert.equal(await activeHook(page), 'value');
      await page.evaluate(() => {
        const anchor = document.querySelector('#fixture-anchor');
        globalThis.__popover.parked = anchor.parentElement;
        anchor.remove();
      });
      await twoFrames(page);
      assert.equal(await page.$(PANEL), null, 'undrawn');
      await page.focus('[data-fixture-open-detached]');
      await page.evaluate(() => globalThis.__popover.parked.prepend(globalThis.__popover.anchor));
      await twoFrames(page);
      await twoFrames(page);
      assert.ok(await page.$(PANEL), 'drawn again');
      assert.equal(await activeHook(page), 'button', 'focus stayed on the control the user chose');
    }));

  it('focuses an overflowing body with no control, which the keyboard scrolls, ringed inside its edge', () =>
    inFixture('host=companion&content=tall&ax=40&ay=380', async (page) => {
      assert.equal(await activeHook(page), 'body');
      const scrolled = () =>
        page.evaluate(() => document.querySelector('[data-popover-body]').scrollTop);
      assert.equal(await page.$eval('[data-popover-body]', (body) => body.tabIndex), 0);
      const tops = [await scrolled()];
      for (const key of ['ArrowDown', 'PageDown', 'End']) {
        await page.keyboard.press(key);
        await twoFrames(page);
        tops.push(await scrolled());
      }
      assert.ok(tops[1] > tops[0] && tops[2] > tops[1] && tops[3] > tops[2], `scrolled: ${tops}`);
      await page.keyboard.press('Tab');
      const ring = await page.$eval('[data-popover-body]', (body) => {
        const style = getComputedStyle(body);
        return [
          body.matches(':focus-visible'),
          style.outlineStyle,
          style.outlineWidth,
          style.outlineOffset,
        ];
      });
      assert.deepEqual(ring, [true, 'solid', '2px', '-2px']);
    }));
});

describe('the published Popover follows a moved, scrolled or oversized anchor', () => {
  it('is placed again when the anchor moves through a style change of the companion’s', () =>
    inFixture('host=companion&ax=40&ay=40', async (page) => {
      await page.evaluate(() => {
        globalThis.__popover.anchor.style.left = '300px';
      });
      await twoFrames(page);
      await twoFrames(page);
      const { panel, anchor } = await boxes(page);
      near(anchor.left, 300, 'the anchor moved');
      near(panel.left, anchor.left, 'and the panel with it');
    }));

  it('is hidden while its scroller scrolls the anchor away, calling nothing, and shows on its return', () =>
    inFixture('host=manager&ax=40&ay=40', async (page) => {
      const scrollTo = (top) =>
        page.evaluate((value) => {
          document.querySelector('[data-fixture-scroller]').scrollTop = value;
        }, top);
      assert.equal(await visibility(page), 'visible');
      await scrollTo(400);
      await twoFrames(page);
      assert.equal(await visibility(page), 'hidden', 'hidden with its anchor out of view');
      await scrollTo(0);
      await twoFrames(page);
      assert.equal(await visibility(page), 'visible', 'shown again');
      assert.equal(await closes(page), 0);
    }));

  it('keeps its own height inside the viewport beside an anchor taller than the room around it', () =>
    inFixture('host=companion&ax=40&ay=4&ah=792', async (page) => {
      const { panel } = await boxes(page);
      assert.ok(panel.height > 100, `the panel keeps its content: ${panel.height}px`);
      assert.ok(panel.top >= MARGIN - 0.5 && panel.bottom <= VIEWPORT.height - MARGIN + 0.5);
    }));
});

describe('the published Popover in a companion’s modal dialog', () => {
  it('draws, takes the pointer and closes on Escape with an overlayHost inside the dialog, which stays open', () =>
    inFixture('host=dialog&dialogHost=1', async (page) => {
      assert.ok(
        await page.evaluate(() =>
          document
            .querySelector('[data-fixture-dialog-pane]')
            .contains(document.querySelector('.fabricate-popover'))
        )
      );
      assert.equal(await page.evaluate(hitAt, PANEL), 'popover');
      assert.equal(await activeHook(page), 'value');
      await page.keyboard.press('Escape');
      await twoFrames(page);
      const state = await page.evaluate(() => ({
        closes: Number(document.body.dataset.closes),
        dialogCloses: Number(document.body.dataset.dialogCloses),
        open: document.querySelector('[data-fixture-dialog]').open,
      }));
      assert.deepEqual(state, { closes: 1, dialogCloses: 0, open: true });
    }));

  // A pinned known limit (issue 2884): with no overlayHost the panel is on the standalone layer,
  // under the dialog's top layer, so the pointer cannot reach it; the docs forbid this mount.
  it('known limit: with no overlayHost the panel is drawn under the modal dialog and takes no pointer', () =>
    inFixture('host=dialog', async (page) => {
      const { host } = await boxes(page);
      assert.equal(host, 'fabricate fabricate-standalone-overlay');
      assert.notEqual(await page.evaluate(hitAt, PANEL), 'popover');
    }));
});
