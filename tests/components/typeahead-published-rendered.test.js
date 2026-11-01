/**
 * The published `Typeahead` in Chromium (issue 2860), mounted live through a fresh seam on the
 * adapter's own runtime by `tests/fixtures/published-typeahead/`: the list's box against the field
 * beneath it, flipped above it at the viewport's foot, at its floor beside a narrow field and at
 * its height cap; hittable over a clipping, isolating ancestor in a Fabricate window, a Manager
 * root, a companion's window and a same-origin frame standing in for a detached window; the
 * keyboard model with real keys, focus held in the field and the active row scrolled into view;
 * the accessibility tree; the rings and the error face; reduced motion; and forced colours read
 * off the painted pixels in a dark and a light palette.
 * Limit: Chromium only, and Foundry's own window chrome is not loaded, so a window is the
 * fixture's `.application` stand-in; no screen reader runs, so an announcement is not heard.
 */
import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';

import { createViteFixtureServer } from '../helpers/vite-fixture-server.js';

const fixtureServer = createViteFixtureServer({
  styleMountPrefix: '/@published-typeahead-styles/',
});
const VIEWPORT = Object.freeze({ width: 1280, height: 800 });
const GAP = 4;
const FLOOR = 220;
const EPSILON = 0.5;

before(async () => {
  await fixtureServer.start();
});

after(async () => {
  await fixtureServer.stop();
});

/** A page with one typeahead open on `scene`, as `mount.js` reads it. */
async function opened(scene = {}, options = {}) {
  const page = await fixtureServer.newPage({ viewport: VIEWPORT, ...options });
  await page.goto(fixtureServer.url('/tests/fixtures/published-typeahead/index.html'));
  await page.waitForFunction(() => globalThis.__typeaheadReady === true);
  await page.evaluate((given) => globalThis.__typeahead.open(given), scene);
  const frame = scene.kind === 'detached' ? page.frames()[1] : page.mainFrame();
  await frame.waitForSelector('input[role="combobox"]');
  return { page, frame };
}

async function within(scene, body, options = {}) {
  const { page, frame } = await opened(scene, options);
  try {
    return await body(page, frame);
  } finally {
    await page.close();
  }
}

const settled = (page) =>
  page.evaluate(
    () => new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(done)))
  );

/** Types `text` into the field with real keys and waits for the list or the note to settle. */
async function typeInto(page, frame, text) {
  await frame.locator('input').focus();
  await page.keyboard.type(text);
  await settled(page);
}

/** The field's shell, the list and its rows, as boxes in the frame's own viewport. */
function geometry() {
  const box = (element) => {
    if (!element) return null;
    const { left, right, top, bottom, width, height } = element.getBoundingClientRect();
    return { left, right, top, bottom, width, height };
  };
  const list = document.querySelector('[role="listbox"]');
  const rows = [...document.querySelectorAll('[role="option"]')];
  const centre = list && box(list);
  const hit =
    centre &&
    document
      .elementFromPoint(centre.left + centre.width / 2, centre.top + 20)
      ?.closest('[role="option"]');
  const contained = (outer, inner) =>
    inner.top >= outer.top - 0.5 &&
    inner.bottom <= outer.bottom + 0.5 &&
    inner.left >= outer.left - 0.5 &&
    inner.right <= outer.right + 0.5;
  return {
    shell: box(document.querySelector('.fabricate-search')),
    control: box(document.querySelector('.fabricate-typeahead-control')),
    message: box(document.querySelector('.fabricate-typeahead-error')),
    list: box(list),
    linesHeld: rows.every((row) =>
      contained(box(row), box(row.querySelector('.fabricate-typeahead-option-lines')))
    ),
    overlaps: rows.slice(1).filter((row, index) => box(row).top < box(rows[index]).bottom - 0.5)
      .length,
    wrapped: rows.some(
      (row) =>
        row.querySelector('.fabricate-typeahead-option-label').getBoundingClientRect().height > 20
    ),
    maxHeight: list && getComputedStyle(list).maxHeight,
    scrolls: list ? list.scrollHeight > list.clientHeight : null,
    rows: rows.map(box),
    hit: Boolean(hit),
    host:
      list?.closest('.fabricate-standalone-overlay, .fabricate-app, .fabricate-manager')
        ?.className ?? null,
  };
}

const read = (frame) => frame.evaluate(geometry);

/**
 * A window's 1px border: an application root's list is placed against its padding box, so it lies
 * that far right of, or below, where the field's border box would put it.
 */
const BORDER = 1 + EPSILON;
const WIDE = Object.freeze({ width: 600, height: 420 });

describe('the published Typeahead list, placed', () => {
  it('lies beneath the field on its left edge at the field’s width, capped at 228px and scrolling, hittable over a clipping ancestor', async () => {
    await within({ kind: 'app', box: WIDE }, async (page, frame) => {
      await typeInto(page, frame, 'iron');
      const drawn = await read(frame);
      assert.ok(Math.abs(drawn.list.left - drawn.shell.left) <= BORDER, 'the field’s left edge');
      assert.ok(Math.abs(drawn.list.width - drawn.shell.width) <= EPSILON, 'the field’s width');
      assert.ok(Math.abs(drawn.list.top - (drawn.shell.bottom + GAP)) <= BORDER, 'beneath it');
      assert.ok(Math.abs(drawn.list.height - 228) <= EPSILON, `capped: ${drawn.list.height}`);
      assert.equal(drawn.scrolls, true, 'twelve rows scroll inside the cap');
      assert.ok(drawn.hit, 'a row takes the pointer over the field’s clipping, isolating ancestor');
      assert.equal(drawn.host, 'application fabricate fabricate-app');
      for (const row of drawn.rows) assert.ok(row.height >= 28, `at least 28px: ${row.height}`);
    });
  });

  for (const [query, claim, box] of [
    ['iron', 'its two-line rows', WIDE],
    ['moon', 'a wrapped long label over its detail', { width: 360, height: 420 }],
  ]) {
    it(`holds ${claim} inside each row under Foundry core's button rule, no row overlapping the next`, async () => {
      await within({ kind: 'app', box }, async (page, frame) => {
        await typeInto(page, frame, query);
        const drawn = await read(frame);
        assert.ok(drawn.rows.length >= 2, 'rows are listed');
        assert.equal(drawn.linesHeld, true, 'each row’s border box holds its lines');
        assert.equal(drawn.overlaps, 0, 'no row overlaps the next');
        if (query === 'moon') assert.equal(drawn.wrapped, true, 'the long label wraps');
      });
    });
  }

  it('opens below the error message, at the control’s width, while an error shows', async () => {
    await within(
      { kind: 'app', box: WIDE, props: { error: 'Choose a reward from the list.' } },
      async (page, frame) => {
        await typeInto(page, frame, 'iron');
        const drawn = await read(frame);
        assert.ok(
          drawn.message.bottom <= drawn.control.bottom + EPSILON,
          'the message is in the column'
        );
        assert.ok(
          Math.abs(drawn.list.top - (drawn.control.bottom + GAP)) <= BORDER,
          'beneath the column'
        );
        assert.ok(drawn.list.top >= drawn.message.bottom, 'so it covers no part of the message');
      }
    );
  });

  it('flips above the field where its window has no room beneath it', async () => {
    await within({ kind: 'app', box: { height: 700, offset: 620 } }, async (page, frame) => {
      await typeInto(page, frame, 'iron');
      const drawn = await read(frame);
      assert.ok(Math.abs(drawn.list.bottom - (drawn.shell.top - GAP)) <= BORDER, 'above it');
      assert.ok(Math.abs(drawn.list.height - 228) <= EPSILON);
      assert.ok(drawn.hit);
    });
  });

  it('keeps a short list beneath a field that a full one flips away from', async () => {
    for (const [query, below] of [
      ['copper', true],
      ['iron', false],
    ]) {
      await within({ kind: 'app', box: { height: 700, offset: 580 } }, async (page, frame) => {
        await typeInto(page, frame, query);
        const drawn = await read(frame);
        assert.equal(drawn.list.top > drawn.shell.bottom, below, query);
      });
    }
  });

  it('flips above the field at the viewport’s foot on the standalone layer', async () => {
    await within({ kind: 'companion', box: { top: 700, height: 100 } }, async (page, frame) => {
      await typeInto(page, frame, 'iron');
      const drawn = await read(frame);
      assert.ok(Math.abs(drawn.list.bottom - (drawn.shell.top - GAP)) <= EPSILON, 'above it');
      assert.ok(Math.abs(drawn.list.left - drawn.shell.left) <= EPSILON);
    });
  });

  it('takes its 220px floor beside a field narrower than it', async () => {
    await within({ kind: 'companion', box: { width: 200 } }, async (page, frame) => {
      await typeInto(page, frame, 'iron');
      const drawn = await read(frame);
      assert.ok(drawn.shell.width < FLOOR, `a narrow field: ${drawn.shell.width}`);
      assert.ok(Math.abs(drawn.list.width - FLOOR) <= EPSILON);
      assert.ok(Math.abs(drawn.list.left - drawn.shell.left) <= EPSILON);
    });
  });

  for (const [kind, host, slack] of [
    ['manager', 'application fabricate fabricate-manager', BORDER],
    ['companion', 'fabricate fabricate-standalone-overlay', EPSILON],
    ['detached', 'fabricate fabricate-standalone-overlay', EPSILON],
  ]) {
    it(`is placed and hittable the same in a ${kind} window`, async () => {
      await within({ kind, box: WIDE }, async (page, frame) => {
        await typeInto(page, frame, 'iron');
        const drawn = await read(frame);
        assert.equal(drawn.host, host);
        assert.ok(Math.abs(drawn.list.left - drawn.shell.left) <= slack);
        assert.ok(Math.abs(drawn.list.width - drawn.shell.width) <= EPSILON);
        assert.ok(Math.abs(drawn.list.top - (drawn.shell.bottom + GAP)) <= slack);
        assert.ok(drawn.hit, 'a row takes the pointer');
        if (kind === 'detached') {
          const outer = await page.evaluate(
            () => document.querySelectorAll('[role="listbox"]').length
          );
          assert.equal(outer, 0, 'nothing in the main document');
        }
      });
    });
  }
});

/** The field's active row by `aria-activedescendant`, and whether the field holds focus. */
function cursor() {
  const input = document.querySelector('input');
  const id = input.getAttribute('aria-activedescendant');
  const row = id ? document.querySelector(`[id="${id}"]`) : null;
  const list = document.querySelector('[role="listbox"]');
  const inView = (() => {
    if (!row || !list) return null;
    const [r, l] = [row.getBoundingClientRect(), list.getBoundingClientRect()];
    return r.top >= l.top - 0.5 && r.bottom <= l.bottom + 0.5;
  })();
  return {
    label: row?.querySelector('.fabricate-typeahead-option-label')?.textContent ?? null,
    focused: document.activeElement === input,
    inView,
    expanded: input.getAttribute('aria-expanded'),
    query: input.value,
  };
}

describe('the published Typeahead countLabel, in Chromium', () => {
  it('draws the count inside the field after the input, on one line in the muted ink', async () => {
    await within(
      { kind: 'app', box: WIDE, props: { countLabel: '4 more, keep typing' } },
      async (page, frame) => {
        const drawn = await frame.evaluate(() => {
          const box = (element) => element.getBoundingClientRect();
          const shell = document.querySelector('.fabricate-search');
          const count = shell.querySelector('.fabricate-search-count');
          const input = shell.querySelector('input');
          const probe = document.createElement('i');
          probe.style.color = 'var(--fab-text-muted)';
          shell.append(probe);
          const muted = getComputedStyle(probe).color;
          probe.remove();
          return {
            after: box(count).left >= box(input).right - 0.5,
            inside: box(count).right <= box(shell).right && box(count).top >= box(shell).top,
            oneLine: box(count).height < 20,
            ink: getComputedStyle(count).color === muted,
            text: count.textContent,
          };
        });
        assert.deepEqual(drawn, {
          after: true,
          inside: true,
          oneLine: true,
          ink: true,
          text: '4 more, keep typing',
        });
      }
    );
  });
});

describe('the published Typeahead keyboard, in Chromium', () => {
  it('moves the active row with the arrows, scrolls it into view, keeps focus in the field and chooses on Enter', async () => {
    await within({ kind: 'app', box: WIDE }, async (page, frame) => {
      await typeInto(page, frame, 'iron');
      await page.keyboard.press('ArrowDown');
      await page.keyboard.press('ArrowDown');
      assert.deepEqual(await frame.evaluate(cursor), {
        label: 'Iron ore',
        focused: true,
        inView: true,
        expanded: 'true',
        query: 'iron',
      });
      await page.keyboard.press('ArrowUp');
      await page.keyboard.press('ArrowUp');
      const last = await frame.evaluate(cursor);
      assert.equal(last.label, 'Iron filing 9', 'wrapped to the last row');
      assert.equal(last.inView, true, 'scrolled into the list’s view');
      await page.keyboard.press('Enter');
      const calls = await page.evaluate(() => globalThis.__typeahead.calls.change);
      assert.deepEqual(calls, ['iron-8']);
    });
  });

  it('leaves the active row where it is under the pointer, and a click chooses with focus kept', async () => {
    await within({ kind: 'app', box: WIDE }, async (page, frame) => {
      await typeInto(page, frame, 'iron');
      await page.keyboard.press('ArrowDown');
      const row = frame.locator('[role="option"]').nth(2);
      await row.hover();
      assert.equal((await frame.evaluate(cursor)).label, 'Iron ingot', 'hover moves no cursor');
      await row.click();
      await settled(page);
      assert.equal((await frame.evaluate(cursor)).focused, true, 'the field keeps focus');
      assert.deepEqual(await page.evaluate(() => globalThis.__typeahead.calls.change), [7]);
    });
  });

  it('closes an open list on Escape keeping the text, then empties it, reports free text on Enter with none active, and Tab leaves without a choice', async () => {
    await within({ kind: 'app', box: WIDE, props: { allowFree: true } }, async (page, frame) => {
      await typeInto(page, frame, 'mithril');
      await page.keyboard.press('Enter');
      await page.keyboard.press('Escape');
      assert.equal((await frame.evaluate(cursor)).query, '', 'with nothing shown Escape empties');
      await typeInto(page, frame, 'iron');
      assert.equal((await frame.evaluate(cursor)).expanded, 'true', 'the list is open');
      await page.keyboard.press('Escape');
      const closed = await frame.evaluate(cursor);
      assert.deepEqual([closed.query, closed.expanded], ['iron', 'false'], 'closed, text kept');
      await page.keyboard.press('Escape');
      const cleared = await frame.evaluate(cursor);
      assert.equal(cleared.query, '');
      assert.equal(cleared.expanded, 'false');
      await typeInto(page, frame, 'iron');
      await page.keyboard.press('ArrowDown');
      await page.keyboard.press('Tab');
      await settled(page);
      const left = await frame.evaluate(cursor);
      assert.equal(left.focused, false, 'Tab moves focus');
      assert.equal(left.expanded, 'false', 'and the list closes');
      const calls = await page.evaluate(() => globalThis.__typeahead.calls);
      assert.deepEqual(calls.free, ['mithril']);
      assert.deepEqual(calls.change, []);
    });
  });

  it('works the same in a detached window stand-in', async () => {
    await within({ kind: 'detached', box: WIDE }, async (page, frame) => {
      await typeInto(page, frame, 'iron');
      await page.keyboard.press('ArrowDown');
      await page.keyboard.press('Enter');
      assert.deepEqual(await page.evaluate(() => globalThis.__typeahead.calls.change), [
        'iron-ingot',
      ]);
      assert.equal((await frame.evaluate(cursor)).focused, true);
    });
  });
});

describe('the published Typeahead accessibility tree', () => {
  it('exposes a named, expanded combobox owning a named listbox whose active row is selected and current row checked', async () => {
    await within({ kind: 'app', box: WIDE, props: { value: 7 } }, async (page, frame) => {
      await typeInto(page, frame, 'iron');
      await page.keyboard.press('ArrowDown');
      const snapshot = await frame.locator('body').ariaSnapshot();
      assert.match(snapshot, /- combobox "Find a reward" \[expanded\]: iron/u);
      assert.match(snapshot, /- listbox "Find a reward":/u);
      assert.match(snapshot, /- option "Iron ingot Metal · 3 in stock" \[selected\]/u);
      assert.match(snapshot, /- option "Ironwood plank Timber" \[checked\]/u);
      assert.doesNotMatch(snapshot, /- option "Iron ore" \[(?:checked|selected)\]/u);
    });
  });

  it('exposes the no-match line through the status region beside the field, and no listbox', async () => {
    await within(
      { kind: 'app', box: WIDE, props: { emptyLabel: 'Nothing matches.' } },
      async (page, frame) => {
        await typeInto(page, frame, 'mithril');
        const snapshot = await frame.locator('body').ariaSnapshot();
        assert.match(snapshot, /- status: Nothing matches\./u);
        assert.doesNotMatch(snapshot, /listbox/u);
        assert.match(snapshot, /- combobox "Find a reward": mithril/u, 'collapsed');
      }
    );
  });
});

/** The painted figures the states change: the shell's edge and fill, the rows' rings, the message. */
function faces() {
  const style = (element) => (element ? getComputedStyle(element) : null);
  const shell = document.querySelector('.fabricate-search');
  const rows = [...document.querySelectorAll('[role="option"]')];
  const active = rows.find((row) => row.getAttribute('aria-selected') === 'true');
  const idle = rows.find((row) => row.getAttribute('aria-selected') === 'false');
  const probe = (token) => {
    const node = document.createElement('i');
    node.style.color = `var(${token})`;
    shell.closest('.fabricate, .application').append(node);
    const value = getComputedStyle(node).color;
    node.remove();
    return value;
  };
  return {
    edge: style(shell).borderTopColor,
    fill: style(shell).backgroundColor,
    placeholder: getComputedStyle(document.querySelector('input'), '::placeholder').color,
    activeRing: active && `${style(active).outlineStyle} ${style(active).outlineWidth}`,
    activeRingColour: active && style(active).outlineColor,
    idleRing: idle && style(idle).outlineStyle,
    message: style(document.querySelector('.fabricate-typeahead-error'))?.color ?? null,
    detail: style(document.querySelector('.fabricate-typeahead-option-detail'))?.color ?? null,
    tokens: Object.fromEntries(
      [
        '--fab-accent',
        '--fab-danger-border',
        '--fab-danger-soft',
        '--fab-danger-text',
        '--fab-text-secondary',
      ].map((token) => [token, probe(token)])
    ),
    motion: [document.querySelector('[role="listbox"]'), ...rows]
      .filter(Boolean)
      .map((node) => [node.getAnimations().length, style(node).transitionDuration]),
  };
}

describe('the published Typeahead states, painted', () => {
  it('draws the cursor as a 2px accent ring the idle rows lack', async () => {
    await within({ kind: 'app', box: WIDE }, async (page, frame) => {
      await typeInto(page, frame, 'iron');
      await page.keyboard.press('ArrowDown');
      const drawn = await frame.evaluate(faces);
      assert.equal(drawn.activeRing, 'solid 2px');
      assert.equal(drawn.activeRingColour, drawn.tokens['--fab-accent']);
      assert.equal(drawn.idleRing, 'none');
      assert.equal(drawn.detail, drawn.tokens['--fab-text-secondary']);
    });
  });

  it('draws the error face at rest, the lit border while focused, and the message in the danger text ink', async () => {
    await within(
      { kind: 'app', box: WIDE, props: { error: 'Choose a reward from the list.' } },
      async (page, frame) => {
        const rest = await frame.evaluate(faces);
        assert.equal(rest.edge, rest.tokens['--fab-danger-border']);
        assert.equal(rest.fill, rest.tokens['--fab-danger-soft']);
        assert.equal(rest.message, rest.tokens['--fab-danger-text']);
        assert.equal(rest.placeholder, rest.tokens['--fab-text-secondary']);
        await frame.locator('input').focus();
        const focused = await frame.evaluate(faces);
        assert.equal(focused.edge, focused.tokens['--fab-accent'], 'focus outranks the error edge');
        assert.equal(focused.fill, rest.tokens['--fab-danger-soft'], 'and keeps the fill');
      }
    );
  });

  it('draws the default shell’s edge and fill without an error, the baseline those differ from', async () => {
    await within({ kind: 'app', box: WIDE }, async (page, frame) => {
      const rest = await frame.evaluate(faces);
      assert.notEqual(rest.edge, rest.tokens['--fab-danger-border']);
      assert.notEqual(rest.fill, rest.tokens['--fab-danger-soft']);
    });
  });

  it('runs no animation or transition on the list or its rows under reduced motion', async () => {
    await within(
      { kind: 'app', box: WIDE },
      async (page, frame) => {
        await typeInto(page, frame, 'iron');
        await page.keyboard.press('ArrowDown');
        const { motion } = await frame.evaluate(faces);
        assert.ok(motion.length > 1);
        for (const [animations, duration] of motion) {
          assert.equal(animations, 0);
          assert.equal(duration, '0s');
        }
      },
      { reducedMotion: 'reduce' }
    );
  });
});

/** The RGBA of every pixel in `clip`, decoded in the page from a screenshot of it. */
async function pixelsOf(page, clip) {
  const png = await page.screenshot({ clip, type: 'png' });
  return page.evaluate(
    async (bytes) => {
      const blob = new Blob([new Uint8Array(bytes)], { type: 'image/png' });
      const image = await createImageBitmap(blob);
      const canvas = document.createElement('canvas');
      canvas.width = image.width;
      canvas.height = image.height;
      const context = canvas.getContext('2d');
      context.drawImage(image, 0, 0);
      return [...context.getImageData(0, 0, canvas.width, canvas.height).data];
    },
    [...png]
  );
}

/** `colour`, an `rgb()` or `rgba()` string, composited over the opaque `ground`, as channels. */
function over(colour, ground) {
  const [r, g, b, a = 1] = colour.match(/[\d.]+/gu).map(Number);
  const base = ground.match(/[\d.]+/gu).map(Number);
  return [r, g, b].map((value, index) => value * a + base[index] * (1 - a));
}

/** How many pixels of `data` lie nearer `ink` than `ground`, each an `rgb()` string: the inked ones. */
function countInked(data, ink, ground) {
  const [a, b] = [over(ink, ground), over(ground, ground)];
  const distance = (at, to) =>
    Math.abs(data[at] - to[0]) + Math.abs(data[at + 1] - to[1]) + Math.abs(data[at + 2] - to[2]);
  let count = 0;
  for (let at = 0; at < data.length; at += 4) if (distance(at, a) < distance(at, b)) count += 1;
  return count;
}

/** How many pixels of `data` are within 24 summed over the channels of `colour` over `ground`. */
function countNear(data, colour, ground) {
  const [r, g, b] = over(colour, ground);
  let count = 0;
  for (let at = 0; at < data.length; at += 4) {
    if (Math.abs(data[at] - r) + Math.abs(data[at + 1] - g) + Math.abs(data[at + 2] - b) < 24)
      count += 1;
  }
  return count;
}

/** Each row's box, the tick's, and the system colours a probe computes under forced colours. */
function forcedBoxes() {
  const rect = (element) => {
    const { x, y, width, height } = element.getBoundingClientRect();
    return { x, y, width, height };
  };
  const probe = (colour) => {
    const node = document.createElement('i');
    node.style.color = colour;
    document.body.append(node);
    const value = getComputedStyle(node).color;
    node.remove();
    return value;
  };
  const rows = [...document.querySelectorAll('[role="option"]')];
  return {
    rows: rows.map(rect),
    tick: rect(document.querySelector('.fabricate-typeahead-option-tick')),
    highlight: probe('Highlight'),
    canvasText: probe('CanvasText'),
    canvas: getComputedStyle(document.querySelector('[role="listbox"]')).backgroundColor,
  };
}

describe('the published Typeahead under forced colours', () => {
  for (const colorScheme of ['dark', 'light']) {
    it(`rings the cursor in the system highlight and keeps the current row’s tick, in the ${colorScheme} palette`, async () => {
      await within(
        { kind: 'companion', box: WIDE, props: { value: 'iron-ore' } },
        async (page, frame) => {
          await typeInto(page, frame, 'iron');
          await page.keyboard.press('ArrowDown');
          await settled(page);
          const boxes = await frame.evaluate(forcedBoxes);
          const band = (row) => ({ x: row.x, y: row.y, width: row.width, height: 2 });
          const active = await pixelsOf(page, band(boxes.rows[0]));
          const idle = await pixelsOf(page, band(boxes.rows[2]));
          assert.ok(
            countNear(active, boxes.highlight, boxes.canvas) > boxes.rows[0].width / 2,
            'the cursor row’s top edge is painted in Highlight'
          );
          assert.equal(countNear(idle, boxes.highlight, boxes.canvas), 0, 'an idle row’s is not');
          const tick = await pixelsOf(page, boxes.tick);
          const sameColumn = await pixelsOf(page, { ...boxes.tick, y: boxes.rows[2].y + 6 });
          assert.ok(
            countInked(tick, boxes.canvasText, boxes.canvas) > 4,
            'the tick is inked in the text colour'
          );
          assert.equal(
            countInked(sameColumn, boxes.canvasText, boxes.canvas),
            0,
            'and no tick is drawn on a row that is not current'
          );
        },
        { forcedColors: 'active', colorScheme }
      );
    });
  }
});
