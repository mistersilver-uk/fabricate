/** `Callout`'s `items` mounted (issue 1521): the folded explainer's glyph-led points. */
import assert from 'node:assert/strict';
import { resolve } from 'node:path';
import { after, afterEach, before, describe, it } from 'node:test';

import { createMountedComponentHarness } from '../helpers/svelte-component-harness.js';

const CALLOUT_PATH = 'src/ui/svelte/components/Callout.svelte';

const harness = createMountedComponentHarness({
  repoRoot: resolve(import.meta.dirname, '../..'),
  tmpPrefix: 'fabricate-callout-items-',
  compiledModules: [CALLOUT_PATH],
  componentPath: CALLOUT_PATH,
});

before(() => harness.setup());
after(() => harness.teardown());
afterEach(() => harness.remount());

const ITEMS = [
  { icon: 'fas fa-cubes', lead: 'Something an item has.', text: 'Tags say what it is.' },
  { icon: 'fas fa-code', lead: 'Can rewrite the result.', text: '' },
];

describe('Callout items', () => {
  it('renders each item as its glyph, its lead and its non-empty text in a note', async () => {
    const root = await harness.mount({ text: 'Body', items: ITEMS, 'data-x': true });
    const note = root.querySelector('[data-x]');
    assert.ok(Boolean(note), 'the hook lands on the root');
    assert.equal(note.tagName, 'DIV', 'items alone make the root structured');
    assert.equal(note.getAttribute('role'), 'note');
    assert.equal(note.getAttribute('data-x'), 'true');

    const rows = [
      ...note.querySelectorAll(':scope .manager-callout-items > .manager-callout-item'),
    ];
    assert.equal(rows.length, 2, 'one row per item');
    assert.equal(note.querySelector('.manager-callout-items').getAttribute('role'), 'list');
    for (const [index, row] of rows.entries()) {
      assert.equal(row.getAttribute('role'), 'listitem');
      const glyph = row.querySelector(':scope > i');
      for (const token of ITEMS[index].icon.split(' ')) {
        assert.ok(glyph.classList.contains(token), `the item glyph wears ${token}`);
      }
      assert.equal(glyph.getAttribute('aria-hidden'), 'true');
      assert.equal(
        row.querySelector('.manager-callout-item-lead').textContent,
        ITEMS[index].lead,
        'the lead renders'
      );
    }
    assert.equal(
      rows[0].querySelector(':scope > span').textContent,
      'Something an item has. Tags say what it is.',
      'the lead and its text read as one sentence pair, one space apart'
    );
    assert.ok(
      !rows[1].querySelector('.manager-callout-item-text'),
      'an empty text renders no line'
    );
  });

  it('keeps the plain paragraph when there are no items', async () => {
    const root = await harness.mount({ text: 'Body', 'data-x': true });
    const note = root.querySelector('[data-x]');
    assert.equal(note.tagName, 'P', 'no title, actions or items is the plain form');
    assert.ok(!note.querySelector('.manager-callout-items'), 'and draws no list');
  });
});
