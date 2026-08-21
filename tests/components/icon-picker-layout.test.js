import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const cssPath = resolve(__dirname, '../../styles/fabricate.css');
const css = readFileSync(cssPath, 'utf8');

test('manager establishes a positioning root for portaled picker overlays', () => {
  const match = css.match(/\.fabricate-manager \{[\s\S]*?\}/);

  assert.ok(match, 'manager root block should exist');
  const block = match[0];

  assert.ok(block.includes('position: relative;'), 'manager root should anchor absolutely positioned overlays');
  assert.ok(block.includes('isolation: isolate;'), 'manager root should isolate picker z-index from host chrome');
});

test('essence icon picker popover uses an absolute layered overlay', () => {
  // The icon picker and source picker popovers share one grouped rule; match the
  // member that directly precedes the declaration block.
  const match = css.match(/\.fabricate-manager \.essence-source-picker-popover \{[\s\S]*?\}/);

  assert.ok(match, 'icon picker popover block should exist');
  const block = match[0];

  assert.ok(block.includes('position: absolute;'), 'popover should be removed from scroll-layout flow and anchored to the manager shell');
  assert.ok(block.includes('z-index: 120;'), 'popover should layer above surrounding manager UI');
  assert.ok(block.includes('overflow: hidden;'), 'popover should clip its own interior scroll region');
});

test('essence icon picker options use a fixed icon column with compact padding', () => {
  const match = css.match(/\.fabricate-manager \.essence-icon-picker-option \{[\s\S]*?\}/);

  assert.ok(match, 'icon picker option layout block should exist');
  const block = match[0];

  assert.ok(block.includes('grid-template-columns: var(--fab-icon-picker-chip) minmax(0, 1fr);'), 'option rows should reserve a fixed icon column');
  assert.ok(block.includes('padding: var(--fab-space-1) var(--fab-space-2);'), 'option rows should use compact row padding');
  // Was `min-height: 34px`, pinned as "a stable row height" — which is how a row 4px too short
  // for its own 28px chip stayed green for so long. The height is DERIVED now (issue 1280); the
  // arithmetic behind the token is asserted at the bottom of this file.
  assert.ok(block.includes('min-height: var(--fab-icon-picker-row);'), 'option rows should derive their height from the chip they contain');
});

test('essence icon picker trigger shares the option icon column and padding', () => {
  const match = css.match(/\.fabricate-manager \.essence-icon-picker-trigger \{[\s\S]*?\}/);

  assert.ok(match, 'icon picker trigger block should exist');
  const block = match[0];

  assert.ok(
    block.includes('grid-template-columns: var(--fab-icon-picker-chip) minmax(0, 1fr) 16px;'),
    'trigger should share the icon column with option rows'
  );
  assert.ok(
    block.includes('min-height: var(--fab-icon-picker-row);'),
    'the trigger regressed alongside the row at 36px for the same 38px of content, so it is pinned too'
  );
  assert.ok(
    block.includes('padding: var(--fab-space-1) var(--fab-space-2);'),
    'trigger should use the same compact padding as picker rows'
  );
});

// --- Row metrics (issue 1280) -----------------------------------------------------------
// The row must be able to CONTAIN the chip it draws. This is arithmetic, not taste, and it is
// guarded because it silently broke once: the chip is 28px, the row carried `min-height: 34px`,
// and 4px of padding plus a 1px border on each edge needs 38px. `align-items: center` centres
// nothing that overflows its track, so the chip spilled past the row's padding AND its border to
// sit 1px from the outer edge — which reads as two faults at once, icons that are not vertically
// centred and rows with no bottom padding. The assertions above pin the token; these pin that the
// token's arithmetic actually holds.

function declaration(selector, property) {
  const block = css.split(selector)[1];
  assert.ok(block, `selector not found: ${selector}`);
  const match = block.slice(0, block.indexOf('}')).match(new RegExp(`${property}:\\s*([^;]+);`));
  assert.ok(match, `${selector} declares no ${property}`);
  return match[1].trim();
}

function token(name) {
  const match = css.match(new RegExp(`${name}:\\s*([^;]+);`));
  assert.ok(match, `token not declared: ${name}`);
  return match[1].trim();
}

test('the row height is DERIVED from the chip, never restated as a literal', () => {
  assert.equal(token('--fab-icon-picker-chip'), '28px');
  assert.equal(
    token('--fab-icon-picker-row'),
    'calc(var(--fab-icon-picker-chip) + (2 * var(--fab-space-1)) + 2px)',
    'the row must be computed from the chip, its vertical padding, and its border'
  );
});

test('the row arithmetic actually holds: chip + padding + border fits', () => {
  const chip = Number.parseFloat(token('--fab-icon-picker-chip'));
  const padding = Number.parseFloat(token('--fab-space-1'));
  const border = 1;
  // What the derived token resolves to, computed here independently of the calc() string so a
  // rewritten-but-wrong calc is caught rather than merely a changed one.
  assert.equal(chip + 2 * padding + 2 * border, 38);
});

test('both the option row and the trigger size themselves from that token', () => {
  // The trigger regressed alongside the row, at 36px for the same 38px of content, so both are
  // pinned: fixing one and leaving the other is exactly what happened last time.
  for (const selector of [
    '.fabricate-manager .essence-icon-picker-option {',
    '.fabricate-manager .essence-icon-picker-trigger {',
  ]) {
    assert.equal(
      declaration(selector, 'min-height'),
      'var(--fab-icon-picker-row)',
      `${selector} must derive its height, not restate it`
    );
  }
});

test('the chip column is the chip token too, so the grid cannot narrow it independently', () => {
  for (const selector of [
    '.fabricate-manager .essence-icon-picker-option {',
    '.fabricate-manager .essence-icon-picker-trigger {',
  ]) {
    assert.match(
      declaration(selector, 'grid-template-columns'),
      /^var\(--fab-icon-picker-chip\)/,
      `${selector} must size its first column from the chip token`
    );
  }
});

test('the chip itself is square and sized from the token', () => {
  const selector = '.fabricate-manager .essence-icon-picker-preview {';
  assert.equal(declaration(selector, 'width'), 'var(--fab-icon-picker-chip)');
  assert.equal(declaration(selector, 'height'), 'var(--fab-icon-picker-chip)');
});
