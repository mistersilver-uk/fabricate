import test from 'node:test';
import assert from 'node:assert/strict';

import { toolBreakageChanceColor } from '../src/ui/svelte/util/chanceColorScale.js';

test('tool breakage chance continuously interpolates through the shared risk palette', () => {
  assert.equal(toolBreakageChanceColor(0), 'var(--fab-success)');
  assert.match(
    toolBreakageChanceColor(25),
    /^color-mix\(in srgb, var\(--fab-success\) .+%, var\(--fab-warning\) .+%\)$/
  );
  assert.match(
    toolBreakageChanceColor(50),
    /^color-mix\(in srgb, var\(--fab-warning\) .+%, var\(--fab-badge-gold\) .+%\)$/
  );
  assert.match(
    toolBreakageChanceColor(75),
    /^color-mix\(in srgb, var\(--fab-badge-gold\) .+%, var\(--fab-danger\) .+%\)$/
  );
  assert.equal(toolBreakageChanceColor(100), 'var(--fab-danger)');
});

test('tool breakage chance clamps raw form values before resolving a colour', () => {
  assert.equal(toolBreakageChanceColor(-1), 'var(--fab-success)');
  assert.equal(toolBreakageChanceColor(101), 'var(--fab-danger)');
  assert.equal(toolBreakageChanceColor('not-a-number'), 'var(--fab-success)');
});
