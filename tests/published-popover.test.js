/**
 * The published `Popover`'s layout and its place in the seam (issue 2861), with no Svelte: the
 * placement it takes for an anchor in a host, the flip, the clamp and the height cap; the closed
 * placement set; and an older Fabricate, whose manifest has no `Popover`, refusing the entry by
 * name and describing nothing, where this one describes it.
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { PUBLISHED_COMPONENT_MANIFEST } from '../src/ui/publishedComponentManifest.js';
import { createPublishedComponents } from '../src/ui/publishedComponentSeam.js';
import {
  POPOVER_GAP,
  POPOVER_MARGIN,
  POPOVER_PLACEMENTS,
  computePopoverLayout,
  popoverPlacement,
} from '../src/ui/svelte/util/popoverLayout.js';

const HOST = Object.freeze({ left: 100, top: 50, width: 800, height: 600 });
const PANEL = Object.freeze({ width: 240, height: 150 });

/** An anchor 96 by 32 at `x`, `y` inside the host, as a viewport box. */
const anchorAt = (x, y) => ({
  left: HOST.left + x,
  top: HOST.top + y,
  right: HOST.left + x + 96,
  bottom: HOST.top + y + 32,
  width: 96,
  height: 32,
});

const layout = (anchor, options = {}, panel = PANEL, host = HOST) =>
  computePopoverLayout(anchor, panel, host, {}, options, { innerWidth: 0, innerHeight: 0 });

describe('the popover layout', () => {
  it('places bottom-start below the anchor at its left edge, in host coordinates', () => {
    assert.deepEqual(layout(anchorAt(40, 40)), {
      placement: 'bottom',
      left: 40,
      top: 40 + 32 + POPOVER_GAP,
      maxHeight: 600 - POPOVER_MARGIN - (40 + 32) - POPOVER_GAP,
    });
  });

  it('flips bottom-start above an anchor with no room below, and top-start below one with none above', () => {
    const low = layout(anchorAt(40, 520));
    assert.equal(low.placement, 'top');
    assert.equal(low.bottom, 600 - 520 + POPOVER_GAP);
    const high = layout(anchorAt(40, 20), { placement: 'top-start' });
    assert.equal(high.placement, 'bottom');
    assert.equal(high.top, 20 + 32 + POPOVER_GAP);
    assert.equal(layout(anchorAt(40, 300), { placement: 'top-start' }).placement, 'top');
  });

  it('keeps the stated side when neither fits but it has the more room, capping the height to it', () => {
    const tall = { width: 240, height: 900 };
    const placed = layout(anchorAt(40, 260), {}, tall);
    assert.equal(placed.placement, 'bottom', 'more room below');
    assert.equal(placed.maxHeight, 600 - POPOVER_MARGIN - (260 + 32) - POPOVER_GAP);
    assert.equal(layout(anchorAt(40, 320), {}, tall).placement, 'top', 'more room above');
  });

  it('reads the uncapped content height, so a capped panel still flips', () => {
    const capped = { width: 240, height: 60 };
    assert.equal(layout(anchorAt(40, 480), {}, capped).placement, 'bottom', 'by its box alone');
    assert.equal(layout(anchorAt(40, 480), { contentHeight: 150 }, capped).placement, 'top');
  });

  it('lines the end edge up for -end, and clamps both edges 8px inside the host', () => {
    assert.equal(layout(anchorAt(400, 40), { placement: 'bottom-end' }).left, 400 + 96 - 240);
    assert.equal(layout(anchorAt(760, 40)).left, 800 - POPOVER_MARGIN - 240);
    assert.equal(layout(anchorAt(10, 40), { placement: 'bottom-end' }).left, POPOVER_MARGIN);
  });

  it('keeps the panel whole inside a host with no room on either side, as for an anchor taller than its host', () => {
    const tallAnchor = { left: 140, top: 40, right: 236, bottom: 640, width: 96, height: 600 };
    const placed = layout(tallAnchor, {}, { width: 240, height: 150 });
    assert.equal(placed.maxHeight, 150, 'its own height, not the room beside the anchor');
    assert.ok(placed.top + placed.maxHeight <= HOST.height - POPOVER_MARGIN, 'inside the host');
    assert.ok(placed.top >= POPOVER_MARGIN);
    const huge = layout(tallAnchor, {}, { width: 240, height: 900 });
    assert.equal(huge.maxHeight, HOST.height - 2 * POPOVER_MARGIN, 'capped at the host');
  });

  it('measures a host that reports no size by its window, and answers null with no window either', () => {
    const view = { innerWidth: 1280, innerHeight: 800 };
    const zero = { left: 0, top: 0, width: 0, height: 0 };
    const anchor = { left: 40, top: 40, right: 136, bottom: 72, width: 96, height: 32 };
    assert.equal(computePopoverLayout(anchor, PANEL, zero, {}, {}, view).top, 72 + POPOVER_GAP);
    assert.equal(computePopoverLayout(anchor, PANEL, zero, {}, {}, {}), null);
    assert.equal(computePopoverLayout(null, PANEL, HOST, {}, {}, view), null);
  });
});

describe('the popover placement set', () => {
  it('is four values, any other drawing bottom-start, nothing coerced', () => {
    assert.deepEqual(POPOVER_PLACEMENTS, ['bottom-start', 'bottom-end', 'top-start', 'top-end']);
    for (const value of POPOVER_PLACEMENTS) assert.equal(popoverPlacement(value), value);
    for (const value of ['top', 'left', 'BOTTOM-END', '', null, 2, { placement: 'top-end' }]) {
      assert.equal(popoverPlacement(value), 'bottom-start', JSON.stringify(value));
    }
  });
});

describe('an older Fabricate and the Popover entry', () => {
  const ready = () => true;
  const target = () => ({ nodeType: 1, ownerDocument: {}, closest: () => null, firstChild: null });

  it('is refused by name, and described as nothing, by a seam whose manifest has no Popover', () => {
    const older = createPublishedComponents({
      table: PUBLISHED_COMPONENT_MANIFEST.filter((entry) => entry.name !== 'Popover'),
      isReady: ready,
    });
    const lazy = PUBLISHED_COMPONENT_MANIFEST.filter((entry) => entry.lazy === true);
    older.register({
      components: {},
      loaders: Object.fromEntries(lazy.map(({ path }) => [path, async () => null])),
    });
    const { publicApi } = older;
    assert.equal(publicApi.describe('Popover'), null);
    assert.ok(!publicApi.components.includes('Popover'));
    assert.throws(
      () =>
        publicApi.mount('Popover', {
          target: target(),
          props: { anchorId: 'cell', ariaLabel: 'Adjust', onClose() {} },
        }),
      { name: 'TypeError', message: 'Fabricate | published components: "Popover" is not published' }
    );
  });

  it('is described by this one at version 1, opening an overlay, with its eight keys', () => {
    const { publicApi } = createPublishedComponents({ isReady: ready });
    const described = publicApi.describe('Popover');
    assert.equal(described.version, 1);
    assert.equal(described.overlays, true);
    assert.equal(described.root, 'any');
    assert.deepEqual(Object.keys(described.props), [
      'open',
      'anchorId',
      'placement',
      'title',
      'ariaLabel',
      'closeOnOutsideClick',
      'onClose',
      'body',
    ]);
    assert.deepEqual(
      Object.entries(described.props)
        .filter(([, spec]) => spec.required)
        .map(([key]) => key),
      ['anchorId', 'title', 'onClose']
    );
  });
});
