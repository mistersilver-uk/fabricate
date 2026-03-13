import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const cssPath = resolve(__dirname, '../../styles/fabricate.css');
const css = readFileSync(cssPath, 'utf8');

test('essence icon picker popover uses a fixed high-z overlay layer', () => {
  const match = css.match(/\.fabricate-admin \.essence-icon-picker-popover \{[\s\S]*?\}/);

  assert.ok(match, 'icon picker popover block should exist');
  const block = match[0];

  assert.ok(block.includes('position: fixed;'), 'popover should be removed from scroll-layout flow');
  assert.ok(block.includes('z-index: 4000;'), 'popover should layer above surrounding admin UI');
  assert.ok(block.includes('overflow: hidden;'), 'popover should clip its own interior scroll region');
});

test('essence icon picker options keep visible 4px padding and flexible height', () => {
  const start = css.indexOf('.fabricate-admin .essence-icon-picker-option {\n  width: 100%;');

  assert.notEqual(start, -1, 'icon picker option layout block should exist');
  const end = css.indexOf('\n}', start);
  const block = css.slice(start, end + 2);

  assert.ok(block.includes('padding: 4px;'), 'option rows should render 4px padding on all sides');
  assert.ok(block.includes('min-height: 0;'), 'option rows should clear host min-height defaults');
  assert.ok(block.includes('height: auto;'), 'option rows should size to content plus padding');
  assert.ok(block.includes('box-sizing: border-box;'), 'option rows should keep padding inside the row box');
});
