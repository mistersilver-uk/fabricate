/**
 * The published `SearchField`'s `density` and `countLabel` (issue 2849): each published density
 * writes its class on the shell and an update removes it in the same root; a value outside its set
 * draws the default shell, and the seam withholds `'compact'`, so it never draws the compact box;
 * and the count is a polite status region after the input, drawn empty without a count, whose text
 * an update writes, changes and empties in place, never touched by an update that leaves it as it is.
 * Limit: happy-dom runs no screen reader, so what is announced is read off the region's role and
 * the mutations a `MutationObserver` records in it; the drawn heights are
 * `search-field-forms-rendered.test.js`'s.
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { PUBLISHED_COMPONENT_MANIFEST } from '../../src/ui/publishedComponentManifest.js';
import { WITHHELD_VALUES } from '../../src/ui/publishedComponentProps.js';
import { settle } from '../helpers/publishedComponentModules.js';
import { publishedEntrySeam } from '../helpers/publishedEntrySeam.js';

const { ui, mountEntry, freshTarget } = publishedEntrySeam('fabricate-published-search-forms-');
const NAMED = Object.freeze({ ariaLabel: 'Search components', placeholder: 'Name or tag' });
const REFUSAL = 'Fabricate | published components: ';

/** A search field mounted with `props` over its name: its handle and its parts as drawn now. */
function mountSearch(props = {}) {
  const { target, handle } = mountEntry('SearchField', { ...NAMED, ...props });
  return {
    target,
    handle,
    shell: () => target.querySelector('.fabricate-search'),
    input: () => target.querySelector('input'),
    region: () => target.querySelector('.fabricate-search-count'),
  };
}

/** Records every mutation inside `node` from now until the returned function is called. */
function watch(node) {
  const records = [];
  const observer = new MutationObserver((batch) => {
    records.push(...batch);
  });
  observer.observe(node, { subtree: true, childList: true, characterData: true, attributes: true });
  return () => {
    records.push(...observer.takeRecords());
    observer.disconnect();
    return records;
  };
}

describe('the published SearchField describes its new keys', () => {
  it('lists density as an optional data key and countLabel as an optional text key', () => {
    const { props } = ui().describe('SearchField');
    assert.deepEqual(props.density, { kind: 'data', required: false });
    assert.deepEqual(props.countLabel, { kind: 'text', required: false });
  });

  it('still refuses label and size, which it does not publish', () => {
    for (const key of ['label', 'size']) {
      const target = freshTarget();
      assert.throws(() => ui().mount('SearchField', { target, props: { ...NAMED, [key]: 'x' } }), {
        name: 'TypeError',
        message: `${REFUSAL}"${key}" is not a data attribute`,
      });
    }
  });
});

describe('the published SearchField density', () => {
  for (const [density, written] of [
    ['toolbar', 'is-density-toolbar'],
    ['inline', 'is-density-inline'],
  ]) {
    it(`writes ${written} for '${density}', and an update without it draws the default shell in the same root`, async () => {
      const { handle, shell, input } = mountSearch({ density });
      await settle();
      const root = shell();
      const control = input();
      assert.equal(root.className, `fabricate-search ${written}`);
      control.focus();
      assert.equal(handle.update(NAMED), true);
      await settle();
      assert.ok(shell() === root && input() === control, 'the same shell and input');
      assert.equal(root.className, 'fabricate-search', 'the default writes no class');
      assert.ok(document.activeElement === control, 'and the input keeps focus');
      handle.destroy();
    });
  }

  for (const density of ['default', 'compact', 'Toolbar', 'form', 34, null]) {
    it(`draws the default shell for ${JSON.stringify(density)}, never the compact one`, async () => {
      const { handle, shell } = mountSearch({ density });
      await settle();
      assert.equal(shell().className, 'fabricate-search');
      handle.destroy();
    });
  }

  it('withholds only values of a published data key', () => {
    assert.deepEqual(WITHHELD_VALUES, ['SearchField.density.compact']);
    for (const withheld of WITHHELD_VALUES) {
      const [name, key] = withheld.split('.');
      const entry = PUBLISHED_COMPONENT_MANIFEST.find((candidate) => candidate.name === name);
      assert.equal(entry?.props[key]?.kind, 'data', withheld);
    }
  });

  it("withholds 'compact' on an update too, from a field drawn at another density", async () => {
    const { handle, shell } = mountSearch({ density: 'toolbar' });
    await settle();
    assert.equal(handle.update({ ...NAMED, density: 'compact' }), true);
    await settle();
    assert.equal(shell().className, 'fabricate-search');
    handle.destroy();
  });
});

describe('the published SearchField countLabel', () => {
  it('draws the count after the input in a status region, holding its text once mount returns', async () => {
    const { handle, shell, input, region } = mountSearch({ countLabel: '12 found' });
    assert.equal(region()?.textContent, '12 found', 'the region is drawn with its text');
    await settle();
    assert.equal(region().getAttribute('role'), 'status', 'a polite, atomic live region');
    assert.ok(region().parentElement === shell(), 'inside the shell');
    assert.ok(input().nextElementSibling === region(), 'after the input');
    assert.equal(
      input().getAttribute('aria-label'),
      NAMED.ariaLabel,
      'the name is ariaLabel alone'
    );
    assert.ok(!input().hasAttribute('aria-describedby'), 'the count describes nothing');
    handle.destroy();
  });

  it('changes its text in place on an update, inside the same region', async () => {
    const { handle, region } = mountSearch({ countLabel: '12 found' });
    await settle();
    const drawn = region();
    const stop = watch(drawn);
    assert.equal(handle.update({ ...NAMED, countLabel: '3 found' }), true);
    await settle();
    const records = stop();
    assert.ok(region() === drawn, 'the same region');
    assert.equal(drawn.textContent, '3 found');
    assert.ok(records.length > 0, 'a change the region reports');
    assert.ok(
      records.every(({ type }) => type !== 'attributes'),
      'only its text changed, never its role'
    );
    handle.destroy();
  });

  it('is neither redrawn nor changed by an update that passes the same count, or by a typed query', async () => {
    const { handle, shell, region, input } = mountSearch({ countLabel: '12 found' });
    await settle();
    const drawn = region();
    const stop = watch(shell());
    assert.equal(
      handle.update({
        ...NAMED,
        countLabel: '12 found',
        placeholder: 'Any tag',
        density: 'toolbar',
      }),
      true
    );
    await settle();
    input().value = 'iron';
    input().dispatchEvent(new globalThis.Event('input', { bubbles: true }));
    await settle();
    const touched = stop().filter(
      ({ target, addedNodes, removedNodes }) =>
        drawn.contains(target) ||
        [...addedNodes, ...removedNodes].some((node) => node === drawn || node.contains?.(drawn))
    );
    assert.ok(region() === drawn, 'the same region');
    assert.deepEqual(touched, [], 'nothing in the region moved, so nothing is announced');
    handle.destroy();
  });

  it('draws its text as text, never as markup', async () => {
    const { handle, region } = mountSearch({ countLabel: '<b>12</b> found' });
    await settle();
    assert.equal(region().textContent, '<b>12</b> found');
    assert.ok(!region().querySelector('b'), 'no element was parsed');
    handle.destroy();
  });

  it("empties the same region on an update that drops it or passes '', and writes the next count into it", async () => {
    const { handle, region } = mountSearch({ countLabel: '12 found' });
    await settle();
    const drawn = region();
    for (const dropped of [{}, { countLabel: '' }]) {
      assert.equal(handle.update({ ...NAMED, countLabel: '1 found' }), true);
      await settle();
      assert.equal(handle.update({ ...NAMED, ...dropped }), true);
      await settle();
      assert.ok(region() === drawn, `the same region for ${JSON.stringify(dropped)}`);
      assert.equal(drawn.textContent, '', 'emptied');
    }
    const stop = watch(drawn);
    assert.equal(handle.update({ ...NAMED, countLabel: '0 found' }), true);
    await settle();
    assert.ok(region() === drawn, 'the count after none is written into the live region');
    assert.equal(drawn.textContent, '0 found');
    assert.ok(stop().length > 0, 'a change inside the region');
    handle.destroy();
  });

  it('draws an empty status region without a count, after the glyph and the input', async () => {
    const { handle, shell, region } = mountSearch();
    await settle();
    assert.deepEqual(
      [...shell().children].map((child) => child.localName),
      ['i', 'input', 'span'],
      'the glyph, the input and the region'
    );
    assert.equal(region().getAttribute('role'), 'status');
    assert.equal(region().textContent, '');
    assert.equal(region().children.length, 0, 'no element in it, so the sheet reads it as empty');
    handle.destroy();
  });
});
