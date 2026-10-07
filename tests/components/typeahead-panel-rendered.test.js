/*
 * Where a typeahead combobox's suggestion list lands, measured in a real browser (issue 2157).
 * `tests/fixtures/typeahead-panel/` mounts each real component under an ancestor carrying the
 * product class that clips it, with the field on that ancestor's bottom edge. A list positioned
 * inside its own row is cut off there and lengthens the ancestor's scroll area; a list portalled to
 * the application root is hittable over the page and leaves the ancestor alone. Every assertion
 * reads the mounted DOM, and every clause stands on the preconditions `openList` asserts first.
 */
import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';

import { createViteFixtureServer } from '../helpers/vite-fixture-server.js';

/** Rounding tolerance for a fractional rect. */
const EPSILON = 0.5;
/** The panel's own floor, and the inset it keeps from each edge of its host. */
const MIN_PANEL_WIDTH = 220;
const HOST_INSET = 16;
/** The word every fixture name the suite wants listed begins with. */
const QUERY = 'iron';

/** A stand-in for Foundry's bundled artwork, which a real component may request. */
function foundryArtworkStub() {
  const svg =
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">' +
    '<rect width="64" height="64" fill="#6b7a8f"/></svg>';
  return {
    name: 'typeahead-panel-artwork',
    configureServer(server) {
      server.middlewares.use((request, response, next) => {
        if (!/\/icons\/.*\.(?:svg|webp|png)(?:\?|$)/u.test(request.url ?? '')) {
          return next();
        }
        response.setHeader('Content-Type', 'image/svg+xml; charset=utf-8');
        response.end(svg);
      });
    },
  };
}

const fixtureServer = createViteFixtureServer({
  styleMountPrefix: '/@typeahead-panel-styles/',
  extraPlugins: [foundryArtworkStub()],
});

before(async () => {
  await fixtureServer.start();
});

after(async () => {
  await fixtureServer.stop();
});

/** The panel's gap from its field, beneath it or flipped above it. */
const GAP = 4;

/** The viewport every page opens at, and the shorter one the resize clause moves to. */
const VIEWPORT = Object.freeze({ width: 1280, height: 800 });
const SHORTER = Object.freeze({ width: 1280, height: 700 });
const NARROWER = Object.freeze({ width: 1000, height: 800 });
/** A root narrower than the wide requirement field, so the panel's clamp to the root engages. */
const CLAMPING = Object.freeze({ width: 420, height: 800 });

/**
 * One row per shipped list. `field` is the closest ancestor of the input that is the field's
 * visual box, or `''` where the input is that box. `scrolls` is the ancestor the scroll clause
 * moves, which is the clipping ancestor itself unless that ancestor cannot scroll. `committed`
 * is where a family with no commit callback shows its choice. `resize` is the edge the resize
 * clause opens at and the viewport it moves to: a wrapped field rides the root's bottom edge, and
 * a field inside a whole mounted editor reflows down the page with the root's width instead, so
 * it starts near the top to stay inside the root.
 */
const FAMILIES = Object.freeze([
  Object.freeze({
    name: 'requirement',
    surface: 'the requirement row, under the recipe tab panel',
    clip: '.manager-editor-tab-panel',
    input: '[data-recipe-option-search]',
    field: '.manager-recipe-option-name-field',
    panel: '.manager-recipe-option-suggestions',
  }),
  Object.freeze({
    name: 'knowledge',
    surface: 'Required Knowledge, under the recipe-item tab panel',
    clip: '.manager-editor-tab-panel',
    input: '[data-recipe-item-required-knowledge-search]',
    field: '.fabricate-search',
    panel: '.fabricate-typeahead-list',
  }),
  Object.freeze({
    name: 'prerequisite',
    surface: 'Learning prerequisites, under the recipe-item tab panel',
    clip: '.manager-editor-tab-panel',
    input: '[data-recipe-item-character-prereq-search]',
    field: '.fabricate-search',
    panel: '.fabricate-typeahead-list',
  }),
  Object.freeze({
    name: 'modifier',
    surface: 'the character-modifier search, under the drop inspector scroller',
    clip: '.manager-drop-inspector-scroll',
    input: '[data-gathering-drop-character-modifier-search] input',
    field: '',
    panel: '.fabricate-typeahead-list',
  }),
  Object.freeze({
    name: 'task',
    surface: 'the component-tag search, under the task browser card',
    clip: '.manager-task-component-browser-card',
    scrolls: '.fixture-stage',
    committed: '[data-gathering-component-tag-pills]',
    resize: Object.freeze({ edge: 'scroller', viewport: NARROWER }),
    input: '[data-gathering-component-tag-search] input',
    field: '.manager-task-component-tag-search',
    panel: '.fabricate-typeahead-list',
  }),
]);

function twoFrames(page) {
  return page.evaluate(
    () => new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(done)))
  );
}

/** How many frames a panel may take to stop moving before the suite calls it unsettled. */
const SETTLE_FRAMES = 60;

/** The geometry every clause reads, taken in one pass so its rects are mutually consistent. */
function measure(page, family) {
  return page.evaluate(({ clip, input, field, panel, committed }) => {
    const rect = (node) => {
      const box = node.getBoundingClientRect();
      return {
        left: box.left,
        top: box.top,
        right: box.right,
        bottom: box.bottom,
        width: box.width,
        height: box.height,
      };
    };
    const inputNode = document.querySelector(input);
    const fieldNode = field ? inputNode.closest(field) : inputNode;
    const clipNode = document.querySelector(clip);
    const panelNode = document.querySelector(panel);
    const options = panelNode ? [...panelNode.querySelectorAll(':scope > button')] : [];
    const hit = (option) => {
      const box = option.getBoundingClientRect();
      const target = document.elementFromPoint(box.left + box.width / 2, box.top + box.height / 2);
      return target === option || option.contains(target);
    };
    return {
      field: rect(fieldNode),
      clip: rect(clipNode),
      clipOverflowY: getComputedStyle(clipNode).overflowY,
      clipScroll: { height: clipNode.scrollHeight, width: clipNode.scrollWidth },
      host: rect(document.querySelector('.fabricate-manager')),
      panel: panelNode ? rect(panelNode) : null,
      panelParentIsHost: Boolean(panelNode?.parentElement?.matches('.fabricate-manager')),
      panelScroll: panelNode
        ? {
            top: panelNode.scrollTop,
            height: panelNode.scrollHeight,
            client: panelNode.clientHeight,
          }
        : null,
      optionCount: options.length,
      options: options.map((option) => ({ ...rect(option), hit: hit(option) })),
      committed: committed
        ? (document.querySelector(committed)?.textContent ?? '').trim()
        : (document.documentElement.dataset.typeaheadCommitted ?? ''),
    };
  }, family);
}

/**
 * Open one family's list in the fixture and return the page with what it measured.
 *
 * @param {object} family a `FAMILIES` row
 * @param {object} [options]
 * @param {'scroller'|'host'} [options.edge] whether the field sits on its scroller's bottom edge
 *   with room in the root beneath, or on the root's own bottom edge
 * @param {number} [options.width] the stage width, which decides the field's
 * @param {number} [options.matching] how many names match the typed query
 * @param {object} [options.viewport] the page's viewport, which decides the root's width
 */
async function openList(
  family,
  { edge = 'scroller', width = 560, matching = 4, viewport = VIEWPORT } = {}
) {
  const page = await fixtureServer.newPage({ viewport });
  const consoleErrors = [];
  page.on('console', (message) => {
    if (message.type() === 'error') consoleErrors.push(message.text());
  });
  page.on('pageerror', (error) => {
    consoleErrors.push(String(error));
  });

  const query = `family=${family.name}&edge=${edge}&width=${width}&matching=${matching}`;
  await page.goto(fixtureServer.url(`/tests/fixtures/typeahead-panel/index.html?${query}`), {
    waitUntil: 'load',
  });
  await page.waitForFunction(() => document.documentElement.dataset.typeaheadReady === 'true');

  const closed = await measure(page, family);
  await page.focus(family.input);
  await page.keyboard.type(QUERY);
  await page.waitForSelector(family.panel);
  const open = await settledMeasure(page, family);

  // What every clause below stands on: without these a list that is not clipped proves nothing.
  assert.notEqual(
    open.clipOverflowY,
    'visible',
    `${family.clip} no longer clips, so this family measures nothing`
  );
  assert.ok(open.optionCount >= 3, `only ${open.optionCount} options rendered for "${QUERY}"`);
  if (edge === 'scroller') {
    assert.ok(
      open.clip.bottom - open.field.bottom < open.panel.height,
      `${family.clip} leaves ${open.clip.bottom - open.field.bottom}px beneath the field, which ` +
        `fits the ${open.panel.height}px list, so nothing here could be clipped`
    );
  }
  return { page, closed, open, consoleErrors };
}

/** The first measurement whose panel rect a further frame did not move. */
async function settledMeasure(page, family) {
  let previous = await measure(page, family);
  for (let frame = 0; frame < SETTLE_FRAMES; frame += 1) {
    await page.evaluate(() => new Promise((done) => requestAnimationFrame(done)));
    const next = await measure(page, family);
    if (JSON.stringify(next.panel) === JSON.stringify(previous.panel)) return next;
    previous = next;
  }
  throw new Error(`${family.panel} was still moving after ${SETTLE_FRAMES} frames`);
}

/** A real pointer click at the centre of one measured option. */
async function clickOption(page, option) {
  await page.mouse.click(option.left + option.width / 2, option.top + option.height / 2);
  await twoFrames(page);
}

function assertHittable(open, where) {
  for (const [label, option] of [
    ['first', open.options[0]],
    ['last', open.options.at(-1)],
  ]) {
    assert.equal(
      option.hit,
      true,
      `the ${label} option is not the element under its own centre ${where}`
    );
  }
}

function assertSharesLeftEdge(measured, when) {
  assert.ok(
    Math.abs(measured.panel.left - measured.field.left) <= EPSILON,
    `${when} the panel starts at ${measured.panel.left}px against a field at ${measured.field.left}px`
  );
}

/** The panel shares its field's left edge and sits one gap beneath it. */
function assertBeneathField(measured, when) {
  assertSharesLeftEdge(measured, when);
  const beneath = measured.panel.top - measured.field.bottom;
  assert.ok(
    Math.abs(beneath - GAP) <= EPSILON,
    `${when} the root has room below, and the panel is ${beneath}px beneath its field`
  );
}

/** The resize clause's looser form: one gap beneath the field or one gap above it. */
function assertBesideField(measured, when) {
  assertSharesLeftEdge(measured, when);
  const beneath = measured.panel.top - measured.field.bottom;
  const above = measured.field.top - measured.panel.bottom;
  assert.ok(
    Math.abs(beneath - GAP) <= EPSILON || Math.abs(above - GAP) <= EPSILON,
    `${when} the panel is ${beneath}px beneath its field and ${above}px above it, so it either ` +
      'covers the field or has left it'
  );
}

for (const family of FAMILIES) {
  describe(`typeahead suggestion list: ${family.surface}`, () => {
    it('(a) stands under a clipping ancestor with less room beneath the field than the list needs', async () => {
      const { page } = await openList(family);
      await page.close();
    });

    it('(b) is hittable over the page, and a pointer choice on the last option commits it', async () => {
      const { page, open } = await openList(family);
      try {
        assertHittable(open, 'beneath its scroller');
        await clickOption(page, open.options.at(-1));
        const after = await measure(page, family);
        assert.match(
          after.committed,
          /^iron-?plate$/u,
          'the last of the four listed names is the one a click on the last option commits'
        );
      } finally {
        await page.close();
      }
    });

    // Required Knowledge and the modifier list pass (c) either way: content beneath the field, or
    // a flip, already bounds the scroll area there, and (b) is the clause that tells them apart.
    it('(c) gives its scrolling ancestor no scroll area', async () => {
      const { page, closed, open } = await openList(family);
      await page.close();
      assert.deepEqual(
        open.clipScroll,
        closed.clipScroll,
        `opening the list changed ${family.clip}'s scroll area`
      );
    });

    it('(d) is a child of the application root, and logs nothing', async () => {
      const { page, open, consoleErrors } = await openList(family);
      await page.close();
      assert.equal(
        open.panelParentIsHost,
        true,
        'the panel is not portalled to .fabricate-manager'
      );
      assert.deepEqual(consoleErrors, []);
    });

    it('(e) shares its field’s left edge, is at least as wide, and never covers it', async () => {
      // The requirement row's field takes its width from the stage, so it is measured both under
      // the panel's floor and over it; the other fields state their own width.
      const stretches = family.name === 'requirement';
      const widths = stretches ? [420, 760] : [560];
      const fields = [];
      for (const width of widths) {
        const { page, open } = await openList(family, { width });
        await page.close();
        fields.push(open.field.width);
        assertBeneathField(open, `at ${width}px`);
        const expected = Math.min(
          Math.max(open.field.width, MIN_PANEL_WIDTH),
          open.host.width - 2 * HOST_INSET
        );
        assert.ok(
          Math.abs(open.panel.width - expected) <= EPSILON,
          `at ${width}px the panel is ${open.panel.width}px wide beside a ${open.field.width}px field`
        );
      }
      if (!stretches) return;
      const [narrow, wide] = fields;
      assert.ok(narrow < MIN_PANEL_WIDTH, `the ${narrow}px narrow field never reaches the floor`);
      assert.ok(wide > MIN_PANEL_WIDTH, `the ${wide}px wide field never leaves the floor`);
    });

    it('(f) follows its field when an ancestor scrolls', async () => {
      const { page, open } = await openList(family);
      try {
        await page.evaluate((selector) => {
          document.querySelector(selector).scrollTop -= 24;
        }, family.scrolls ?? family.clip);
        await twoFrames(page);
        const moved = await measure(page, family);
        assert.ok(
          Math.abs(moved.field.top - open.field.top) > 1,
          'the scroll did not move the field, so there was nothing to follow'
        );
        assert.ok(
          Math.abs(moved.panel.top - moved.field.top - (open.panel.top - open.field.top)) <=
            EPSILON,
          'the panel did not keep its offset from the field'
        );
      } finally {
        await page.close();
      }
    });

    it('(g) is placed again when the viewport resizes', async () => {
      const { edge, viewport } = family.resize ?? { edge: 'host', viewport: SHORTER };
      const { page, open } = await openList(family, { edge });
      try {
        await page.setViewportSize(viewport);
        await twoFrames(page);
        const moved = await measure(page, family);
        assert.ok(
          Math.abs(moved.field.top - open.field.top) > 1 ||
            Math.abs(moved.field.left - open.field.left) > 1,
          'the resize did not move the field, so there was nothing to follow'
        );
        assertBesideField(moved, 'after the resize');
      } finally {
        await page.close();
      }
    });

    it('(h) flips above a field on the root’s bottom edge, and is still hittable there', async () => {
      const { page, open } = await openList(family, { edge: 'host' });
      await page.close();
      assert.ok(
        open.panel.bottom <= open.field.top + EPSILON,
        `the panel ends at ${open.panel.bottom}px, under a field that starts at ${open.field.top}px`
      );
      assert.ok(open.panel.top >= open.host.top, 'the flipped panel runs off the top of the root');
      assertHittable(open, 'above its field');
    });
  });
}

describe('typeahead suggestion list: the root’s clamp', () => {
  const family = FAMILIES.find((entry) => entry.name === 'requirement');

  it('is no wider than the root less its insets, under a field that is', async () => {
    const { page, open } = await openList(family, { width: 760, viewport: CLAMPING });
    await page.close();
    const room = open.host.width - 2 * HOST_INSET;
    assert.ok(room < open.field.width, `the ${open.field.width}px field fits the ${room}px root`);
    assert.ok(
      Math.abs(open.panel.width - room) <= EPSILON,
      `the panel is ${open.panel.width}px wide in a root with ${room}px of room`
    );
    assert.ok(
      open.panel.left >= open.host.left + HOST_INSET - EPSILON &&
        open.panel.right <= open.host.right - HOST_INSET + EPSILON,
      'the clamped panel crosses the root’s inset'
    );
  });
});

/**
 * Each `Typeahead` family's own `listMaxHeight` and `optionHeight`, as its call site passes them
 * (issue 1782). The primitive hands the panel a `pitch` of the row plus its 2px gap and 10px of
 * chrome, so the panel is the cap floored to whole rows.
 */
const LONG_LISTS = Object.freeze([
  Object.freeze({ name: 'knowledge', cap: 148, optionHeight: 28 }),
  Object.freeze({ name: 'modifier', cap: 148, optionHeight: 30 }),
  Object.freeze({ name: 'task', cap: 132, optionHeight: 28 }),
]);

function flooredPanelHeight({ cap, optionHeight }) {
  const pitch = optionHeight + 2;
  return Math.floor((cap - 10) / pitch) * pitch - 2 + 10;
}

for (const list of LONG_LISTS) {
  const family = FAMILIES.find((entry) => entry.name === list.name);

  describe(`typeahead suggestion list: the panel’s own scroll, ${family.surface}`, () => {
    it('shows whole rows of a list longer than its cap, and scrolls the active option into view', async () => {
      const { page, open } = await openList(family, { matching: 9 });
      try {
        assert.equal(open.optionCount, 9);
        assert.ok(
          open.panelScroll.height > open.panelScroll.client,
          'nine options fit the panel, so it has nothing to scroll'
        );
        assert.equal(
          open.options[1].top - open.options[0].top,
          list.optionHeight + 2,
          'a row is not the `optionHeight` its call site passes, plus the gap'
        );
        assert.ok(
          Math.abs(open.panel.height - flooredPanelHeight(list)) <= EPSILON,
          `the panel is ${open.panel.height}px, not its ${list.cap}px cap floored to whole rows`
        );
        // The last row whose centre shows is whole. A following row may begin inside the panel's
        // own bottom padding, which is scrolled content's to cross and shows none of its label.
        const lastVisible = open.options.findLast(
          (option) => option.top + option.height / 2 < open.panel.bottom
        );
        assert.ok(
          lastVisible.bottom <= open.panel.bottom + EPSILON,
          `the panel slices a row: it ends at ${open.panel.bottom}px through a row ending at ${lastVisible.bottom}px`
        );

        for (let press = 0; press < 9; press += 1) await page.keyboard.press('ArrowDown');
        await twoFrames(page);
        const scrolled = await measure(page, family);
        const active = scrolled.options.at(-1);
        assert.ok(scrolled.panelScroll.top > 0, 'the panel did not scroll to its active option');
        assert.ok(
          active.top >= scrolled.panel.top - EPSILON &&
            active.bottom <= scrolled.panel.bottom + EPSILON,
          'the active option is outside the panel’s visible rows'
        );
      } finally {
        await page.close();
      }
    });
  });
}
