/**
 * The recipe editor's set and group drafts (issue 2511): default names, the bare-render decision,
 * the duplicate edit and the sole-entry write, plus the one draft-id mint every editor shares.
 */
import assert from 'node:assert/strict';
import { afterEach, describe, it } from 'node:test';

import {
  defaultSetName,
  duplicateIngredientSet,
  rendersBare,
  setDisplayName,
  withSoleEntry,
} from '../src/ui/svelte/apps/manager/recipe/setDrafts.js';
import { newDraftId } from '../src/ui/svelte/util/draftId.js';

const sequence = (...ids) => {
  const queue = [...ids];
  return () => queue.shift();
};

describe('newDraftId', () => {
  const originalFoundry = globalThis.foundry;
  afterEach(() => {
    Object.assign(globalThis, { foundry: originalFoundry });
  });

  it("uses Foundry's randomID when it is loaded", () => {
    Object.assign(globalThis, { foundry: { utils: { randomID: () => 'foundry-id' } } });
    assert.equal(newDraftId(), 'foundry-id');
  });

  it('falls back to a 16-character slice of a UUID off Foundry', () => {
    Object.assign(globalThis, { foundry: undefined });
    const id = newDraftId();
    assert.match(id, /^[0-9a-f]{16}$/);
    assert.notEqual(newDraftId(), id);
  });
});

describe('set names', () => {
  it('numbers a default name from one', () => {
    assert.equal(defaultSetName(0), 'Set 1');
    assert.equal(defaultSetName(2), 'Set 3');
  });

  it('shows the trimmed name, else the default', () => {
    assert.equal(setDisplayName({ name: '  Ore route ' }, 0), 'Ore route');
    assert.equal(setDisplayName({ name: ' \t ' }, 1), 'Set 2');
    assert.equal(setDisplayName({}, 0), 'Set 1');
    assert.equal(setDisplayName(null, 3), 'Set 4');
  });
});

describe('rendersBare', () => {
  it('renders none or one entry bare, and more with chrome', () => {
    assert.equal(rendersBare(0), true);
    assert.equal(rendersBare(1), true);
    assert.equal(rendersBare(2), false);
  });

  it('never renders a routed scope bare', () => {
    assert.equal(rendersBare(0, { routed: true }), false);
    assert.equal(rendersBare(1, { routed: true }), false);
  });
});

describe('duplicateIngredientSet', () => {
  const SOURCE = Object.freeze({
    id: 's1',
    name: 'Ore route',
    resultGroupId: 'g1',
    resultMapping: ['g1', 'g2'],
    ingredientGroups: [
      { id: 'ig1', options: [{ componentId: 'ore', quantity: 2 }] },
      { id: 'ig2', options: [{ componentId: 'coal', quantity: 1 }] },
    ],
    toolIds: ['t1'],
  });

  it('re-mints the set id then each group id, and drops the routing', () => {
    const copy = duplicateIngredientSet(SOURCE, sequence('s2', 'ig3', 'ig4'));
    assert.deepEqual(copy, {
      id: 's2',
      name: 'Ore route (Copy)',
      resultGroupId: null,
      resultMapping: [],
      ingredientGroups: [
        { id: 'ig3', options: [{ componentId: 'ore', quantity: 2 }] },
        { id: 'ig4', options: [{ componentId: 'coal', quantity: 1 }] },
      ],
      toolIds: ['t1'],
    });
  });

  it('shares no reference with the source', () => {
    const copy = duplicateIngredientSet(SOURCE, sequence('s2', 'ig3', 'ig4'));
    copy.ingredientGroups[0].options[0].quantity = 9;
    copy.toolIds.push('t2');
    assert.equal(SOURCE.ingredientGroups[0].options[0].quantity, 2);
    assert.deepEqual(SOURCE.toolIds, ['t1']);
  });

  it('leaves an unnamed copy unnamed and tolerates a set with no groups', () => {
    const copy = duplicateIngredientSet({ id: 's1', name: '  ' }, sequence('s2'));
    assert.equal(copy.name, '');
    assert.deepEqual(copy.ingredientGroups, []);
    assert.equal(copy.id, 's2');
  });
});

describe('withSoleEntry', () => {
  it('spreads the edit over the existing entry and keeps its id', () => {
    const entries = [{ id: 'g1', name: 'Kept', results: [], extra: true }];
    assert.deepEqual(withSoleEntry(entries, { id: 'other', results: [{ id: 'r1' }] }), [
      { id: 'g1', name: 'Kept', results: [{ id: 'r1' }], extra: true },
    ]);
  });

  it("takes the edit's id when the existing entry has none", () => {
    assert.deepEqual(withSoleEntry([{ name: 'Draft' }], { id: 'next', results: [] }), [
      { id: 'next', name: 'Draft', results: [] },
    ]);
  });

  it('mints an id when neither carries one, including with no entry at all', () => {
    assert.deepEqual(withSoleEntry([], { results: [] }, () => 'minted'), [
      { id: 'minted', results: [] },
    ]);
    assert.deepEqual(withSoleEntry(undefined, { ingredientGroups: [] }, () => 'minted'), [
      { id: 'minted', ingredientGroups: [] },
    ]);
  });

  it('writes only the first entry', () => {
    const entries = [{ id: 'g1' }, { id: 'g2' }];
    assert.deepEqual(withSoleEntry(entries, { name: 'One' }), [{ id: 'g1', name: 'One' }]);
  });
});
