/**
 * Issue 2321 — `<XrefList>`: a list named by its own kicker, whose rows are ListRow's dense row or,
 * for a row that opens, its selectable dense form.
 */
import assert from 'node:assert/strict';
import { resolve } from 'node:path';
import { after, afterEach, before, describe, it } from 'node:test';

import { createMountedComponentHarness } from '../helpers/svelte-component-harness.js';

const repoRoot = resolve(import.meta.dirname, '../..');
const component = (name) => `src/ui/svelte/components/${name}.svelte`;

const harness = createMountedComponentHarness({
  repoRoot,
  tmpPrefix: 'fabricate-xref-list-',
  compiledModules: ['Medallion', 'ListRow', 'Kicker', 'XrefList'].map(component),
  componentPath: component('XrefList'),
  rootClass: 'fabricate fabricate-app',
});

const ITEMS = Object.freeze([
  Object.freeze({
    id: 'r3',
    name: 'Carve Bone Idol',
    detail: 'Recipe',
    recipeId: 'r3',
    attrs: { 'data-probe-row': 'recipe' },
  }),
  Object.freeze({
    id: 'g1',
    name: 'Harvest Beast',
    icon: 'fas fa-leaf',
    detail: 'Gathering',
    opens: false,
    attrs: { 'data-probe-row': 'gathering' },
  }),
  Object.freeze({ name: 'Iron', quantity: '×6' }),
]);

const FOCUSABLE = 'button, a[href], input, select, textarea, [tabindex]';

describe('XrefList (issue 2321)', () => {
  before(() => harness.setup());
  afterEach(() => harness.remount());
  after(() => harness.teardown());

  it('names its list by the label it draws', async () => {
    const target = await harness.mount({ label: 'Required for', items: ITEMS });
    const list = target.querySelector('ul');
    const labelId = list.getAttribute('aria-labelledby');
    assert.ok(labelId, 'the list is labelled');
    const label = target.querySelector(`[id="${labelId}"]`);
    assert.ok(Boolean(label), 'and the id resolves');
    assert.equal(label.textContent.trim(), 'Required for');
    assert.ok(Boolean(label.querySelector('.fab-kicker')), 'drawn as the kicker');
    assert.equal(list.querySelectorAll(':scope > li').length, 3, 'one item per row');
  });

  it('renders no button when it is given no onOpen', async () => {
    const target = await harness.mount({ label: 'Sources', items: ITEMS });
    assert.equal(target.querySelectorAll(FOCUSABLE).length, 0, 'nothing is a control');
  });

  it('makes each opening row a focusable button that hands back the item, never pressed', async () => {
    const opened = [];
    const target = await harness.mount({
      label: 'Required for',
      items: ITEMS,
      onOpen: (item) => {
        opened.push(item);
      },
    });
    const buttons = [...target.querySelectorAll('button')];
    assert.equal(buttons.length, 2, 'every row but the one carrying `opens: false`');
    for (const button of buttons) {
      assert.equal(button.getAttribute('data-keyboard-focus'), 'true');
      assert.ok(!button.hasAttribute('aria-pressed'), 'no row is ever pressed');
    }
    buttons[0].click();
    buttons[1].click();
    assert.equal(opened.length, 2);
    assert.equal(opened[0], ITEMS[0], 'the item as passed, unknown keys and all');
    assert.equal(opened[0].recipeId, 'r3');
    assert.equal(opened[1], ITEMS[2]);
  });

  it('holds nothing focusable in a row carrying `opens: false`', async () => {
    const target = await harness.mount({ label: 'Required for', items: ITEMS, onOpen: () => {} });
    const row = target.querySelector('[data-probe-row="gathering"]');
    assert.ok(Boolean(row), 'the row renders');
    assert.equal(row.querySelectorAll(FOCUSABLE).length, 0);
  });

  it('draws detail and quantity as text, inside the button of an opening row', async () => {
    const target = await harness.mount({ label: 'Required for', items: ITEMS, onOpen: () => {} });
    const [recipe, quantity] = target.querySelectorAll('button');
    assert.equal(recipe.querySelector('.fabricate-list-row-detail')?.textContent, 'Recipe');
    assert.equal(recipe.textContent.trim().replaceAll(/\s+/g, ' '), 'Carve Bone Idol Recipe');
    assert.equal(quantity.querySelector('.fabricate-list-row-quantity')?.textContent, '×6');
    const still = target.querySelector('[data-probe-row="gathering"]');
    assert.equal(still.querySelector('.fabricate-list-row-detail')?.textContent, 'Gathering');
  });

  it('draws its label and no list with zero items', async () => {
    const target = await harness.mount({ label: 'Used by', items: [] });
    assert.ok(!target.querySelector('ul'), 'no list element');
    assert.equal(target.querySelector('.fab-kicker')?.textContent.trim(), 'Used by');
  });

  it('lands class and rest on the root, and an unset data-* is absent', async () => {
    const target = await harness.mount({
      label: 'Sources',
      items: ITEMS,
      class: 'probe-caller',
      'data-probe-list': 'sources',
      'data-probe-unset': undefined,
    });
    const root = target.firstElementChild;
    assert.deepEqual(
      [...root.classList].filter((name) => !name.startsWith('svelte-')),
      ['fab-xref-list', 'probe-caller']
    );
    assert.equal(root.getAttribute('data-probe-list'), 'sources');
    assert.ok(!root.hasAttribute('data-probe-unset'), 'an unset hook is not written');
  });

  it("lands an item's attrs on its row root, inside its own li", async () => {
    const target = await harness.mount({ label: 'Required for', items: ITEMS, onOpen: () => {} });
    for (const hook of ['recipe', 'gathering']) {
      const row = target.querySelector(`[data-probe-row="${hook}"]`);
      assert.ok(row.matches('[data-list-row]'), `${hook}: on the ListRow root`);
      assert.equal(row.parentElement.tagName, 'LI', `${hook}: the root is the item's child`);
    }
  });
});
