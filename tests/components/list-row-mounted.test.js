/**
 * Issue 1778 — `<ListRow>`. The dense read-only form is pinned first, as markup over a fixture
 * matrix and as the sheet's dense rules, so the selectable form provably leaves it unchanged.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { after, afterEach, before, describe, it } from 'node:test';

import { createRawSnippet } from '../../node_modules/svelte/src/index-client.js';
import { createMountedComponentHarness } from '../helpers/svelte-component-harness.js';

const repoRoot = resolve(import.meta.dirname, '../..');
const component = (name) => `src/ui/svelte/components/${name}.svelte`;

const harness = createMountedComponentHarness({
  repoRoot,
  tmpPrefix: 'fabricate-list-row-form-',
  compiledModules: ['Medallion', 'ListRow'].map(component),
  componentPath: component('ListRow'),
  rootClass: 'fabricate fabricate-app',
});

const snippet = (html) => createRawSnippet(() => ({ render: () => html }));

/**
 * Rendered markup: elements, attributes in emitted order and text. Svelte's comment anchors and
 * whitespace-only text runs are dropped (neither renders inside the flex root), as is a scoping
 * hash, which belongs to the Medallion's stylesheet rather than to this row.
 */
function serialize(node) {
  if (node.nodeType === 3) return node.textContent.trim() === '' ? '' : node.textContent;
  if (node.nodeType !== 1) return '';
  const attributes = [...node.attributes]
    .map(({ name, value }) => {
      const kept = name === 'class' ? value.replaceAll(/\s*svelte-[a-z0-9]+/g, '').trim() : value;
      return ` ${name}="${kept}"`;
    })
    .join('');
  const tag = node.tagName.toLowerCase();
  return `<${tag}${attributes}>${[...node.childNodes].map(serialize).join('')}</${tag}>`;
}

const GLYPH =
  '<span class="fab-medallion" data-medallion="glyph" style="width: 22px; height: 22px;">';
const BOX = `${GLYPH}<i aria-hidden="true" class="fas fa-box"></i></span>`;
const NAME = (name) => `<span class="fabricate-list-row-name" title="${name}">${name}</span>`;

/** The dense matrix: every read-only prop the shipped form takes, and no prop the form adds. */
const DENSE_MATRIX = Object.freeze([
  [
    'name only',
    { name: 'Iron Ingot' },
    `<div class="fabricate-list-row" data-list-row="dense">${BOX}${NAME('Iron Ingot')}</div>`,
  ],
  [
    'art, quantity, detail and trailing',
    {
      name: 'Steel Ingot',
      art: 'icons/svg/item-bag.svg',
      quantity: '×2',
      detail: 'Stage 1',
      trailing: snippet('<span class="probe-trailing">42%</span>'),
    },
    '<div class="fabricate-list-row" data-list-row="dense">' +
      '<span class="fab-medallion" data-medallion="image" style="width: 22px; height: 22px;">' +
      '<img class="fab-medallion-img" src="icons/svg/item-bag.svg" alt=""></img></span>' +
      NAME('Steel Ingot') +
      '<span class="fabricate-list-row-detail">Stage 1</span>' +
      '<span class="fabricate-list-row-quantity">×2</span>' +
      '<span class="probe-trailing">42%</span></div>',
  ],
  [
    'a tinted glyph',
    { name: 'Ironwort', icon: 'fas fa-leaf', tint: 'sage', quantity: 3 },
    '<div class="fabricate-list-row" data-list-row="dense">' +
      '<span class="fab-medallion" data-medallion="glyph" data-medallion-tint="sage" ' +
      'style="width: 22px; height: 22px; --fab-medallion-tint: var(--fab-tag-sage);">' +
      '<i aria-hidden="true" class="fas fa-leaf"></i></span>' +
      NAME('Ironwort') +
      '<span class="fabricate-list-row-quantity">3</span></div>',
  ],
  [
    'tone neutral',
    { name: 'Copper', tone: 'neutral', quantity: '×1' },
    `<div class="fabricate-list-row" data-list-row="dense">${BOX}${NAME('Copper')}` +
      '<span class="fabricate-list-row-quantity">×1</span></div>',
  ],
  [
    'tone positive at a zero quantity',
    { name: 'Copper', tone: 'positive', quantity: 0 },
    `<div class="fabricate-list-row is-positive" data-list-row="dense">${BOX}${NAME('Copper')}` +
      '<span class="fabricate-list-row-quantity">0</span></div>',
  ],
  [
    'muted with no quantity',
    { name: 'Tin', muted: true, quantity: null, detail: 'Not recorded' },
    `<div class="fabricate-list-row is-muted" data-list-row="dense">${BOX}${NAME('Tin')}` +
      '<span class="fabricate-list-row-detail">Not recorded</span></div>',
  ],
  [
    'truncateName',
    { name: 'A very long material name', truncateName: true, detail: 'Consumed' },
    `<div class="fabricate-list-row is-truncated" data-list-row="dense">${BOX}` +
      NAME('A very long material name') +
      '<span class="fabricate-list-row-detail" title="Consumed">Consumed</span></div>',
  ],
  [
    'class and a root hook',
    { name: 'Bronze', class: 'probe-caller', 'data-probe-row': 'b1' },
    '<div class="fabricate-list-row probe-caller" data-probe-row="b1" data-list-row="dense">' +
      `${BOX}${NAME('Bronze')}</div>`,
  ],
]);

/** The sheet's dense rules exactly as issue 1648 shipped them, before the selectable form. */
const DENSE_CSS = [
  '.fabricate-list-row {',
  '  display: flex;',
  '  align-items: center;',
  '  min-width: 0;',
  '  gap: var(--fab-space-2);',
  '  padding: var(--fab-space-2) var(--fab-space-3);',
  '  border: 1px solid var(--fab-border);',
  '  border-radius: 9px;',
  '  background: var(--fab-bg-1);',
  '  color: var(--fab-text-subtle);',
  '  font-size: 10.5px;',
  '}',
  '',
  '.fabricate-list-row .fabricate-list-row-name {',
  '  min-width: 0;',
  '  flex: 1 1 auto;',
  '  color: var(--fab-text);',
  '  font-family: var(--font-primary, sans-serif);',
  '  font-size: 12px;',
  '  font-weight: 600;',
  '  overflow-wrap: anywhere;',
  '}',
  '',
  '.fabricate-list-row .fabricate-list-row-quantity {',
  '  flex: 0 0 auto;',
  '  font-family: var(--fab-font-mono);',
  '  font-weight: 500;',
  '  font-variant-numeric: tabular-nums;',
  '}',
  '',
  '.fabricate-list-row.is-truncated .fabricate-list-row-name,',
  '.fabricate-list-row.is-truncated .fabricate-list-row-detail {',
  '  overflow: hidden;',
  '  text-overflow: ellipsis;',
  '  white-space: nowrap;',
  '}',
  '',
  '.fabricate-list-row.is-truncated .fabricate-list-row-detail {',
  '  flex: 0 1 50%;',
  '}',
  '',
  '.fabricate-list-row .fabricate-list-row-detail {',
  '  min-width: 0;',
  '  overflow-wrap: anywhere;',
  '}',
  '',
  '.fabricate-list-row.is-positive {',
  '  border-color: var(--fab-success-border);',
  '  background: var(--fab-success-soft);',
  '}',
  '',
  '.fabricate-list-row.is-muted {',
  '  border-style: dashed;',
  '}',
  '',
  '.fabricate-list-row.is-muted .fabricate-list-row-name {',
  '  color: var(--fab-text-subtle);',
  '}',
].join('\n');

/** The classes the dense matrix emits on the row and its own children. */
const DENSE_CLASSES = new Set([
  'fabricate-list-row',
  'fabricate-list-row-name',
  'fabricate-list-row-detail',
  'fabricate-list-row-quantity',
  'is-positive',
  'is-muted',
  'is-truncated',
]);

const SHEET_PATH = resolve(repoRoot, 'styles/fabricate.css');
const SHEET = readFileSync(SHEET_PATH, 'utf8').replaceAll('\r\n', '\n');

/** Every sheet rule's selector list that names the row family, comments stripped. */
const familySelectors = (sheet) =>
  sheet
    .replaceAll(/\/\*[\s\S]*?\*\//g, '')
    .split('}')
    .flatMap((block) => {
      const selector = block.slice(0, block.indexOf('{')).trim();
      if (!selector.includes('.fabricate-list-row')) return [];
      return selector.split(',').map((part) => part.trim());
    });

/** A selector the dense matrix could match: every class it names is one a dense row emits. */
const reachesDense = (selector) =>
  [...selector.matchAll(/\.([\w-]+)/g)].every(([, name]) => DENSE_CLASSES.has(name)) &&
  !/\[|:has\(/.test(selector);

describe('ListRow dense form is unchanged (issue 1778)', () => {
  before(() => harness.setup());
  afterEach(() => harness.remount());
  after(() => harness.teardown());

  for (const [label, props, markup] of DENSE_MATRIX) {
    it(`renders the pinned dense markup: ${label}`, async () => {
      const target = await harness.mount(props);
      const rows = target.querySelectorAll('[data-list-row]');
      assert.equal(rows.length, 1, 'one row');
      assert.equal(serialize(rows[0]), markup);
    });
  }

  it('keeps the dense rules of the sheet byte for byte, once', () => {
    assert.ok(SHEET.includes(DENSE_CSS), 'the dense block is present and unchanged');
    assert.equal(SHEET.indexOf(DENSE_CSS), SHEET.lastIndexOf(DENSE_CSS), 'and written once');
  });

  it('adds no rule outside the pinned block that a dense row could match', () => {
    const reaching = familySelectors(SHEET.replace(DENSE_CSS, '')).filter(reachesDense);
    assert.deepEqual(reaching, [], 'a new rule must name a class or state the dense row never has');
    assert.ok(reachesDense('.fabricate-list-row.is-muted'), 'the probe recognises a dense rule');
    assert.ok(!reachesDense('.fabricate-list-row.is-card'), 'and a form-only one');
  });
});
