/**
 * Source-contract tests for the V2 RunBands collapsible chrome and per-band
 * pagination wiring.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const source = readFileSync(
  resolve(__dirname, '../../src/ui/svelte/apps/actor-app/RunBands.svelte'),
  'utf8'
);

test('RunBands: imports the shared Pagination component', () => {
  assert.match(
    source,
    /import Pagination from ['"]\.\.\/\.\.\/components\/Pagination\.svelte['"]/,
    'must import the shared Pagination component'
  );
});

test('RunBands: declares collapsible header markup with aria-expanded toggle', () => {
  assert.match(source, /class="run-bands"/, 'root section uses .run-bands class');
  assert.match(source, /class="run-bands__toggle"/, 'collapse toggle uses .run-bands__toggle class');
  assert.match(source, /aria-expanded=\{expanded\}/, 'toggle must reflect aria-expanded state');
});

test('RunBands: renders columns inside a class:run-bands--collapsed-aware section that only expands when expanded', () => {
  assert.match(source, /class:run-bands--collapsed=\{!expanded\}/, 'must toggle collapsed modifier class');
  assert.match(source, /\{#if expanded\}/, 'columns must be gated on the expanded prop');
});

test('RunBands: declares props for collapse + per-band pagination', () => {
  assert.match(source, /\bexpanded\s*=\s*true\b/, 'expanded prop defaults to true');
  assert.match(source, /\bactiveRunPageIndex\s*=\s*0\b/, 'activeRunPageIndex prop defaults to 0');
  assert.match(source, /\bhistoryPageIndex\s*=\s*0\b/, 'historyPageIndex prop defaults to 0');
  assert.match(source, /\bonToggleExpanded\s*=\s*\(\)\s*=>\s*\{\}/, 'onToggleExpanded is an optional callback');
  assert.match(source, /\bonActiveRunPageChange\s*=\s*\(\)\s*=>\s*\{\}/, 'onActiveRunPageChange is an optional callback');
  assert.match(source, /\bonHistoryPageChange\s*=\s*\(\)\s*=>\s*\{\}/, 'onHistoryPageChange is an optional callback');
});

test('RunBands: each column ends with its own <Pagination> footer', () => {
  // Two Pagination instances expected — one per band.
  const matches = source.match(/<Pagination\b/g) ?? [];
  assert.equal(matches.length, 2, 'must render two Pagination footers (one per band)');
});

test('RunBands: page slicing uses an internal $derived against the page index', () => {
  assert.match(source, /activeRunsPage\s*=\s*\$derived/, 'activeRunsPage is derived from activeRuns + activeRunPageIndex');
  assert.match(source, /runHistoryPage\s*=\s*\$derived/, 'runHistoryPage is derived from runHistory + historyPageIndex');
});

test('RunBands: keyed rows use run UI keys with fallback identity', () => {
  assert.match(source, /function runKey\(/, 'must centralize row key creation');
  assert.match(source, /run\?\.uiKey/, 'must prefer the store-provided UI key');
  assert.match(source, /\{#each activeRunsPage as run, index \(runKey\(run, index, 'active'\)\)\}/, 'active rows must use runKey');
  assert.match(source, /\{#each runHistoryPage as run, index \(runKey\(run, index, 'history'\)\)\}/, 'history rows must use runKey');
});

test('RunBands: scoped CSS uses --fab-* tokens, no legacy --fabricate-*', () => {
  const styleMatch = source.match(/<style>([\s\S]*?)<\/style>/);
  assert.ok(styleMatch, 'RunBands must have a scoped <style> block');
  const scoped = styleMatch[1];
  assert.ok(scoped.includes('var(--fab-border)'), 'must use --fab-border for chrome');
  assert.ok(!scoped.includes('--fabricate-primary'), 'must not reference legacy --fabricate-primary');
});
