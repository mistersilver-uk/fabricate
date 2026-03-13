import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const cssPath = resolve(__dirname, '../../styles/fabricate.css');
const css = readFileSync(cssPath, 'utf8');

test('fabricate admin establishes a positioning root for portaled picker overlays', () => {
  const match = css.match(/\.fabricate-admin \{[\s\S]*?\}/);

  assert.ok(match, 'fabricate admin root block should exist');
  const block = match[0];

  assert.ok(block.includes('position: relative;'), 'admin root should anchor absolutely positioned overlays');
  assert.ok(block.includes('isolation: isolate;'), 'admin root should isolate picker z-index from host chrome');
});

test('essence icon picker popover uses an absolute high-z overlay layer', () => {
  const match = css.match(/\.fabricate-admin \.essence-icon-picker-popover \{[\s\S]*?\}/);

  assert.ok(match, 'icon picker popover block should exist');
  const block = match[0];

  assert.ok(block.includes('position: absolute;'), 'popover should be removed from scroll-layout flow and anchored to the admin shell');
  assert.ok(block.includes('z-index: 4000;'), 'popover should layer above surrounding admin UI');
  assert.ok(block.includes('overflow: hidden;'), 'popover should clip its own interior scroll region');
});

test('essence icon picker options keep visible 4px padding and flexible height', () => {
  const start = css.indexOf('.fabricate-admin .essence-icon-picker-options button.essence-icon-picker-option {\n  width: 100%;');

  assert.notEqual(start, -1, 'icon picker option layout block should exist');
  const end = css.indexOf('\n}', start);
  const block = css.slice(start, end + 2);

  assert.ok(block.includes('padding: 4px !important;'), 'option rows should render 4px padding on all sides even against host button defaults');
  assert.ok(block.includes('min-height: 32px !important;'), 'option rows should preserve the padded row height against host button defaults');
  assert.ok(block.includes('height: auto !important;'), 'option rows should size to content plus padding');
  assert.ok(block.includes('box-sizing: border-box;'), 'option rows should keep padding inside the row box');
});
