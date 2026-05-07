/**
 * Layout-contract test for the Crafting view salvage band.
 * Regression guard: the band must declare a max-height + overflow-y so a
 * large salvage list cannot push the recipe table and inspector off-screen.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const source = readFileSync(
  resolve(__dirname, '../../src/ui/svelte/apps/actor-app/CraftingView.svelte'),
  'utf8'
);

function extractBlock(css, selector) {
  const idx = css.indexOf(selector);
  if (idx === -1) return null;
  const blockStart = css.indexOf('{', idx);
  if (blockStart === -1) return null;
  const blockEnd = css.indexOf('}', blockStart);
  if (blockEnd === -1) return null;
  return css.slice(blockStart, blockEnd);
}

test('CraftingView: .crafting-view__salvage-band declares max-height and overflow-y', () => {
  const styleMatch = source.match(/<style>([\s\S]*?)<\/style>/);
  assert.ok(styleMatch, 'CraftingView must have a scoped <style> block');
  const block = extractBlock(styleMatch[1], '.crafting-view__salvage-band');
  assert.ok(block, '.crafting-view__salvage-band rule must exist');
  assert.match(block, /max-height\s*:/, 'salvage band must cap its height to prevent overflow');
  assert.match(block, /overflow-y\s*:\s*auto/, 'salvage band must scroll internally');
});

test('CraftingView: salvage band header is sticky so it stays visible while scrolling', () => {
  const styleMatch = source.match(/<style>([\s\S]*?)<\/style>/);
  const block = extractBlock(styleMatch[1], '.crafting-view__salvage-band h4');
  assert.ok(block, '.crafting-view__salvage-band h4 rule must exist');
  assert.match(block, /position\s*:\s*sticky/, 'salvage band header must be sticky');
  assert.match(block, /top\s*:\s*0/, 'salvage band header must stick to the top of the band');
});
