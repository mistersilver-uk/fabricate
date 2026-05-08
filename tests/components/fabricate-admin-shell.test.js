/**
 * Regression guard for the legacy admin's V2 shell migration.
 * Asserts the .fabricate-admin shell uses --fab-* tokens for the surface
 * background, focus outline, and primary tab/system-list active states.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const css = readFileSync(resolve(__dirname, '../../styles/fabricate.css'), 'utf8');

function extractBlock(selector) {
  const idx = css.indexOf(selector);
  if (idx === -1) return null;
  const blockStart = css.indexOf('{', idx);
  if (blockStart === -1) return null;
  const blockEnd = css.indexOf('}', blockStart);
  if (blockEnd === -1) return null;
  return css.slice(blockStart, blockEnd);
}

test('legacy admin shell .fabricate-admin uses --fab-* shell tokens', () => {
  const block = extractBlock('.fabricate-admin {');
  assert.ok(block, '.fabricate-admin rule must exist');
  assert.match(block, /background:\s*var\(--fab-bg-1\)/, 'shell must declare opaque V2 background');
  assert.match(block, /color:\s*var\(--fab-text\)/, 'shell must declare V2 text colour');
});

test('legacy admin shell adds standardized focus outline', () => {
  const block = extractBlock('.fabricate-admin button:focus-visible');
  assert.ok(block, 'focus-visible rule must exist for admin shell descendants');
  assert.match(block, /outline:\s*2px solid var\(--fab-accent\)/, 'must use --fab-accent for focus outline');
  assert.match(block, /outline-offset:\s*2px/, 'must declare matching outline-offset');
});

test('admin tab active state uses --fab-accent tone, not legacy --fabricate-primary', () => {
  const block = extractBlock('.fabricate-admin .admin-tabs button.active');
  assert.ok(block, '.admin-tabs button.active rule must exist');
  assert.match(block, /background:\s*var\(--fab-accent-soft\)/, 'active tab must use accent-soft tone');
  assert.match(block, /color:\s*var\(--fab-accent\)/, 'active tab text must use --fab-accent');
  assert.ok(!block.includes('--fabricate-primary'), 'active tab must not reference legacy --fabricate-primary');
});

test('admin system list active row uses --fab-accent tone', () => {
  const block = extractBlock('.fabricate-admin .admin-system-list li.active .system-link');
  assert.ok(block, 'active system link rule must exist');
  assert.match(block, /var\(--fab-accent-soft\)/, 'must use accent-soft background');
  assert.match(block, /var\(--fab-accent\)/, 'must use accent text + border');
  assert.ok(!block.includes('--fabricate-primary'), 'must not reference legacy --fabricate-primary');
});

test('system-item-card uses V2 panel chrome', () => {
  const block = extractBlock('.fabricate-admin .system-item-card {');
  assert.ok(block, '.system-item-card rule must exist');
  assert.match(block, /border:\s*1px solid var\(--fab-border\)/, 'card must use --fab-border');
  assert.match(block, /background:\s*var\(--fab-surface-soft\)/, 'card must use --fab-surface-soft');
  assert.match(block, /border-radius:\s*var\(--fab-v2-radius-panel\)/, 'card must use V2 panel radius');
});

test('admin token list uses semantic tone tokens', () => {
  const block = extractBlock('.fabricate-admin .token-list .token {');
  assert.ok(block, '.token-list .token rule must exist');
  assert.match(block, /var\(--fab-info-soft\)|var\(--fab-info\)/, 'token must use --fab-info tone');
  assert.ok(!block.includes('rgba(120, 160, 255'), 'token must not use the legacy hard-coded rgba blue');
});
