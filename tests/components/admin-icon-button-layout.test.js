import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const cssPath = resolve(__dirname, '../../styles/fabricate.css');
const css = readFileSync(cssPath, 'utf8');

test('admin icon-only buttons normalize their box model against host button defaults', () => {
  const match = css.match(
    /\.fabricate-admin \.admin-sidebar-header button,\s*\.fabricate-admin \.essence-definition-row button,\s*\.fabricate-admin \.token-list \.token button,\s*\.fabricate-admin \.system-item-card \.item-source-button,\s*\.fabricate-admin \.system-item-card \.item-actions button \{[\s\S]*?\}/
  );

  assert.ok(match, 'shared admin icon-button selector block should exist');
  const block = match[0];

  assert.ok(block.includes('appearance: none;'), 'icon-only admin buttons should clear host button appearance');
  assert.ok(block.includes('-webkit-appearance: none;'), 'icon-only admin buttons should clear WebKit host button appearance');
  assert.ok(block.includes('box-sizing: border-box;'), 'icon-only admin buttons should use border-box sizing');
  assert.ok(block.includes('min-width: 0;'), 'icon-only admin buttons should clear host min-width defaults');
  assert.ok(block.includes('min-height: 0;'), 'icon-only admin buttons should clear host min-height defaults');
  assert.ok(block.includes('padding: 0;'), 'icon-only admin buttons should clear host padding defaults');
  assert.ok(block.includes('display: inline-flex;'), 'icon-only admin buttons should use inline-flex centering');
  assert.ok(block.includes('align-items: center;'), 'icon-only admin buttons should vertically center icons');
  assert.ok(block.includes('justify-content: center;'), 'icon-only admin buttons should horizontally center icons');
  assert.ok(block.includes('line-height: 1;'), 'icon-only admin buttons should not inherit stretched line-height');
  assert.ok(block.includes('flex: 0 0 auto;'), 'icon-only admin buttons should keep their intended fixed size');
});

test('feature token remove buttons preserve circular geometry', () => {
  const match = css.match(/\.fabricate-admin \.token-list \.token button \{[\s\S]*?\}/);

  assert.ok(match, 'token remove button selector should exist');
  const block = match[0];

  assert.ok(block.includes('width: 20px;'), 'token remove buttons should keep a fixed width');
  assert.ok(block.includes('height: 20px;'), 'token remove buttons should keep a fixed height');
  assert.ok(block.includes('aspect-ratio: 1 / 1;'), 'token remove buttons should preserve a square footprint');
  assert.ok(block.includes('border-radius: 50%;'), 'token remove buttons should render as circles');
});
