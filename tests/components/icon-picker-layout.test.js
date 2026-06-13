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

  assert.ok(block.includes('grid-template-columns: 28px minmax(0, 1fr);'), 'option rows should reserve a fixed icon column');
  assert.ok(block.includes('padding: var(--fab-space-1) var(--fab-space-2);'), 'option rows should use compact row padding');
  assert.ok(block.includes('min-height: 34px;'), 'option rows should preserve a stable row height');
});

test('essence icon picker trigger shares the option icon column and padding', () => {
  const match = css.match(/\.fabricate-manager \.essence-icon-picker-trigger \{[\s\S]*?\}/);

  assert.ok(match, 'icon picker trigger block should exist');
  const block = match[0];

  assert.ok(
    block.includes('grid-template-columns: 28px minmax(0, 1fr) 16px;'),
    'trigger should share the 28px icon column with option rows'
  );
  assert.ok(
    block.includes('padding: var(--fab-space-1) var(--fab-space-2);'),
    'trigger should use the same compact padding as picker rows'
  );
});
