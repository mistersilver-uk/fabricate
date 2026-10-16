/**
 * Where an action menu's panel sits against its trigger (issue 1773): the end edge by default, for
 * a kebab at a row's end, which every existing caller keeps; the start edge on request, for an
 * adder at a list's start; and either clamped inside the host.
 */
import assert from 'node:assert/strict';
import test from 'node:test';

import { computeActionMenuLayout } from '../src/ui/svelte/util/actionMenuLayout.js';

const HOST = Object.freeze({ left: 100, top: 0, width: 800, height: 600 });
const PANEL = Object.freeze({ width: 150, height: 120 });
const box = (left, top, width, height) => ({
  left,
  top,
  width,
  height,
  right: left + width,
  bottom: top + height,
});

/** The panel's left and right edges in page coordinates, from the layout's `right`. */
function edges(layout) {
  const right = HOST.left + HOST.width - layout.right;
  return { left: right - PANEL.width, right };
}

test('the default lines the panel up with the trigger’s end edge, as every existing caller has it', () => {
  const trigger = box(500, 40, 76, 30);
  const byDefault = computeActionMenuLayout(trigger, PANEL, HOST);
  assert.equal(edges(byDefault).right, trigger.right, 'the panel ends where the trigger ends');
  assert.deepEqual(computeActionMenuLayout(trigger, PANEL, HOST, { align: 'end' }), byDefault);
  assert.deepEqual(
    computeActionMenuLayout(trigger, PANEL, HOST, { align: 'sideways' }),
    byDefault,
    'an unknown alignment is the default'
  );
});

test('start lines the panel up with the trigger’s start edge, so it never reaches back past it', () => {
  const trigger = box(176, 40, 76, 30);
  const layout = computeActionMenuLayout(trigger, PANEL, HOST, { align: 'start' });
  assert.equal(edges(layout).left, trigger.left, 'the panel starts where the trigger starts');
  assert.equal(layout.placement, 'bottom');
  assert.equal(layout.top, trigger.bottom + 4);
  const ended = edges(computeActionMenuLayout(trigger, PANEL, HOST));
  assert.ok(ended.left < trigger.left, 'CONTROL: end-aligned, the same panel spills left of it');
});

test('start is clamped inside the host like end, so a trigger near the right edge stays in it', () => {
  const trigger = box(820, 40, 76, 30);
  const layout = computeActionMenuLayout(trigger, PANEL, HOST, { align: 'start' });
  assert.equal(layout.right, 8, 'held at the host’s right margin');
  assert.ok(edges(layout).left < trigger.left, 'shifted left only as far as the margin needs');
});
