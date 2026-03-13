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
