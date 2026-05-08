/**
 * Layout-contract tests for the V2 CraftingView two-column structure.
 * Regression guard: the body grid must declare two tracks at normal width
 * and a single track at narrow container widths (≤1180px).
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

test('CraftingView: body grid declares two columns at normal width', () => {
  const styleMatch = source.match(/<style>([\s\S]*?)<\/style>/);
  assert.ok(styleMatch);
  const block = extractBlock(styleMatch[1], '.crafting-view__body');
  assert.ok(block, '.crafting-view__body rule must exist');
  assert.match(block, /display\s*:\s*grid/, 'body must be a grid container');
  assert.match(
    block,
    /grid-template-columns\s*:\s*minmax\(0,\s*1fr\)\s+minmax\(360px,\s*420px\)/,
    'body must declare 1fr / 360-420px tracks at normal width'
  );
});

test('CraftingView: container query collapses body to a single column at ≤1180px', () => {
  const styleMatch = source.match(/<style>([\s\S]*?)<\/style>/);
  const scoped = styleMatch[1];
  assert.match(
    scoped,
    /@container actor-app \(max-width:\s*1180px\)/,
    'must declare a container query at 1180px breakpoint'
  );
  // Find the @container rule's first inner block and verify it switches
  // grid-template-columns to a single track.
  const cqIdx = scoped.indexOf('@container actor-app (max-width: 1180px)');
  const cqBlockStart = scoped.indexOf('{', cqIdx);
  const cqInner = scoped.slice(cqBlockStart, cqBlockStart + 400);
  assert.match(cqInner, /grid-template-columns\s*:\s*1fr/, 'body must collapse to 1fr in the narrow container query');
});

test('CraftingView: left column hosts run bands, shopping list, toolbar, table, and pagination inside .crafting-view__main', () => {
  // Verify that all five surfaces live inside .crafting-view__main, not as
  // siblings above it. Easy structural check: <RunBands> must appear AFTER
  // the opening of `<div class="crafting-view__main">` and BEFORE the
  // matching close tag.
  const mainIdx = source.indexOf('<div class="crafting-view__main">');
  assert.ok(mainIdx > 0, 'crafting-view__main wrapper must exist');
  const inspectorIdx = source.indexOf('<div class="crafting-view__inspector">');
  assert.ok(inspectorIdx > mainIdx, 'inspector div should appear after the main column');

  const mainSlice = source.slice(mainIdx, inspectorIdx);
  assert.match(mainSlice, /<RunBands\b/, 'RunBands must live inside .crafting-view__main');
  assert.match(mainSlice, /<ShoppingListPanel\b/, 'ShoppingListPanel must live inside .crafting-view__main');
  assert.match(mainSlice, /<RecipeTable\b/, 'RecipeTable must live inside .crafting-view__main');
  assert.match(mainSlice, /<Pagination\b/, 'Recipe-table Pagination must live inside .crafting-view__main');
  assert.match(mainSlice, /class="crafting-view__toolbar"/, 'Search/filter toolbar must live inside .crafting-view__main');
});

test('CraftingView: SelectedRecipeInspector lives in a full-height right-column wrapper', () => {
  assert.match(source, /<div class="crafting-view__inspector">[\s\S]*?<SelectedRecipeInspector/, 'inspector must be wrapped by .crafting-view__inspector');
  const styleMatch = source.match(/<style>([\s\S]*?)<\/style>/);
  const block = extractBlock(styleMatch[1], '.crafting-view__inspector');
  assert.ok(block, '.crafting-view__inspector rule must exist');
  assert.match(block, /align-self\s*:\s*stretch/, 'inspector must stretch to the body grid height');
  assert.match(block, /overflow-y\s*:\s*auto/, 'inspector must scroll internally so the column never overflows');
});

test('CraftingView: wires RunBands collapse + per-band pagination to the store', () => {
  assert.match(source, /\bonToggleExpanded\s*=\s*\{store\.toggleRunBandsExpanded\}/, 'must wire collapse toggle');
  assert.match(source, /\bonActiveRunPageChange\s*=\s*\{store\.setActiveRunPageIndex\}/, 'must wire active-run page changes');
  assert.match(source, /\bonHistoryPageChange\s*=\s*\{store\.setHistoryPageIndex\}/, 'must wire history page changes');
  assert.match(source, /\bexpanded\s*=\s*\{\$runBandsExpanded\}/, 'must subscribe to runBandsExpanded');
});
