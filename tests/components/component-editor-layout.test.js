import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const componentPath = resolve(__dirname, '../../src/ui/svelte/apps/ComponentEditorRoot.svelte');
const source = readFileSync(componentPath, 'utf8');

test('component editor essence cards render quantity, icon, and name inline', () => {
  const quantityIndex = source.indexOf('class="essence-quantity-input"');
  const iconIndex = source.indexOf('class="essence-icon"');
  const nameIndex = source.indexOf('class="essence-name"');

  assert.notEqual(quantityIndex, -1, 'quantity input should exist');
  assert.notEqual(iconIndex, -1, 'essence icon should exist');
  assert.notEqual(nameIndex, -1, 'essence name should exist');
  assert.ok(quantityIndex < iconIndex, 'quantity input should appear before the icon');
  assert.ok(iconIndex < nameIndex, 'essence icon should appear before the name');
});

test('component editor essence cards use compact two-column grid styling by default', () => {
  assert.ok(
    source.includes('grid-template-columns: repeat(2, minmax(0, 1fr));'),
    'essence grid should default to two columns'
  );
  assert.ok(
    source.includes('grid-template-columns: auto auto auto 1fr auto;'),
    'essence card should keep controls and content on one inline row'
  );
  assert.ok(
    source.includes('width: 24px;'),
    'essence step controls should use smaller buttons'
  );
});
