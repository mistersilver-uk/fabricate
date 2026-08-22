import test from 'node:test';
import assert from 'node:assert/strict';

import { computeIconPickerPopoverLayout } from '../src/ui/svelte/util/iconPickerPopover.js';

test('icon picker popover right-aligns with the trigger when viewport space is available', () => {
  const layout = computeIconPickerPopoverLayout(
    { top: 120, bottom: 152, left: 220, right: 420, width: 200, height: 32 },
    { width: 1280, height: 900 }
  );

  assert.ok(layout, 'layout should be returned for a valid trigger rect');
  assert.equal(layout.placement, 'bottom');
  assert.equal(layout.left, 160);
  assert.equal(layout.width, 260);
  assert.equal(layout.top, 158);
  assert.equal(layout.maxHeight, 380);
});

test('icon picker popover clamps to the viewport edge instead of overflowing left', () => {
  const layout = computeIconPickerPopoverLayout(
    { top: 80, bottom: 112, left: 20, right: 140, width: 120, height: 32 },
    { width: 960, height: 720 }
  );

  assert.ok(layout, 'layout should be returned for a narrow trigger');
  assert.equal(layout.left, 16);
  assert.equal(layout.width, 260);
});

test('icon picker popover can left-align with the trigger for inline icon-only pickers', () => {
  const layout = computeIconPickerPopoverLayout(
    { top: 120, bottom: 154, left: 304, right: 338, width: 34, height: 34 },
    { width: 1280, height: 900 },
    { horizontalAlign: 'left' }
  );

  assert.ok(layout, 'layout should be returned for an inline icon picker');
  assert.equal(layout.left, 304);
  assert.equal(layout.width, 260);
  assert.equal(layout.top, 160);
});

test('icon picker popover respects a custom editor-pane left boundary', () => {
  const layout = computeIconPickerPopoverLayout(
    { top: 120, bottom: 154, left: 304, right: 338, width: 34, height: 34 },
    { width: 1024, height: 768 },
    { minLeft: 280, maxRight: 960 }
  );

  assert.ok(layout, 'layout should be returned when custom horizontal bounds are provided');
  assert.equal(layout.left, 280);
  assert.equal(layout.width, 260);
});

test('icon picker popover flips above the trigger when there is not enough room below', () => {
  const layout = computeIconPickerPopoverLayout(
    { top: 700, bottom: 732, left: 540, right: 720, width: 180, height: 32 },
    { width: 1280, height: 800 }
  );

  assert.ok(layout, 'layout should be returned for a lower trigger');
  assert.equal(layout.placement, 'top');
  assert.equal(layout.left, 460);
  assert.equal(layout.bottom, 106);
  assert.equal(layout.maxHeight, 380);
});

test('icon picker popover width shrinks to fit very small viewports', () => {
  const layout = computeIconPickerPopoverLayout(
    { top: 120, bottom: 152, left: 40, right: 200, width: 160, height: 32 },
    { width: 240, height: 640 }
  );

  assert.ok(layout, 'layout should be returned when some viewport width exists');
  assert.equal(layout.width, 208);
  assert.equal(layout.left, 16);
});

// --- Whole-row flooring (issue 1280) ----------------------------------------------------
// The popover's max height comes from the viewport, so the space left for the list after the
// search field and the popover's padding is an arbitrary number of pixels. Filling it slices the
// last row in half against the popover's bottom padding, which reads as a rendering fault rather
// than as "more below". These pin the floor, and pin that a caller which measures nothing keeps
// the previous behaviour rather than getting a guessed height.

const TRIGGER = { top: 120, bottom: 152, left: 220, right: 420, width: 200, height: 32 };
const VIEWPORT = { width: 1280, height: 900 };
// A 38px row and a 6px gap between rows; 12px popover padding top and bottom, an 8px flex gap,
// and a 35px search field.
const METRICS = { rowPitch: 44, rowGap: 6, chromeHeight: 67 };

test('the list height is null when the caller measured no rows', () => {
  const layout = computeIconPickerPopoverLayout(TRIGGER, VIEWPORT);

  assert.equal(
    layout.listMaxHeight,
    null,
    'a caller that cannot measure a row must keep the previous fill behaviour'
  );
  assert.equal(layout.maxHeight, 380, 'and the popover itself is unaffected');
});

test('the list height floors to whole rows, carrying one fewer gap than rows', () => {
  const layout = computeIconPickerPopoverLayout(TRIGGER, VIEWPORT, METRICS);
  const available = layout.maxHeight - METRICS.chromeHeight;

  assert.equal(layout.listMaxHeight, 302, '7 rows: 7 * 44 - 6');
  assert.equal(
    (layout.listMaxHeight + METRICS.rowGap) % METRICS.rowPitch,
    0,
    'the height must be an exact number of pitches'
  );
  assert.ok(
    layout.listMaxHeight <= available,
    `flooring must never exceed the space available (${layout.listMaxHeight} > ${available})`
  );
});

test('the list keeps ONE row when the popover is too short for even one', () => {
  // Refusing to render the list at all would be a worse answer than a cramped one: the caller
  // cannot open a picker with no options in it.
  const layout = computeIconPickerPopoverLayout(TRIGGER, { width: 1280, height: 210 }, METRICS);

  assert.equal(layout.listMaxHeight, 38, 'one row, minus its absent trailing gap');
});

test('a zero or absent row pitch is treated as "not measured", not as a division by zero', () => {
  for (const rowPitch of [0, -10, Number.NaN, undefined]) {
    const layout = computeIconPickerPopoverLayout(TRIGGER, VIEWPORT, { ...METRICS, rowPitch });
    assert.equal(layout.listMaxHeight, null, `rowPitch ${String(rowPitch)} should not floor`);
  }
});

test('the flooring rides both placements, since either can be the short one', () => {
  // A trigger near the bottom flips the popover above it; the list still must not slice a row.
  const flipped = computeIconPickerPopoverLayout(
    { top: 820, bottom: 852, left: 220, right: 420, width: 200, height: 32 },
    VIEWPORT,
    METRICS
  );

  assert.equal(flipped.placement, 'top');
  assert.equal(
    (flipped.listMaxHeight + METRICS.rowGap) % METRICS.rowPitch,
    0,
    'a flipped popover floors too'
  );
});
