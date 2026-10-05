import assert from 'node:assert/strict';
import test from 'node:test';
import { Window } from 'happy-dom';

import { accessibleNameOf } from '../src/ui/svelte/apps/manager/validationAnnouncement.js';

/** A detached document whose body holds `markup`, and the element `#target` within it. */
function target(markup) {
  const window = new Window();
  window.document.body.innerHTML = markup;
  return { root: window.document, element: window.document.getElementById('target') };
}

test('a multi-id aria-labelledby reads every id in order, joined by single spaces', () => {
  const { root, element } = target(
    '<span id="a"> Salvage </span><span id="b">Results</span><button id="target" aria-labelledby="a b"></button>'
  );
  assert.equal(accessibleNameOf(root, element), 'Salvage Results');
});

test('an absent or empty id in an aria-labelledby list contributes nothing', () => {
  const { root, element } = target(
    '<span id="a">Salvage</span><span id="empty"> </span><button id="target" aria-labelledby="missing a empty"></button>'
  );
  assert.equal(accessibleNameOf(root, element), 'Salvage');
});

test('aria-label outranks aria-labelledby, which outranks a label and a title', () => {
  const both = target(
    '<span id="a">From the list</span><button id="target" aria-label="Own name" aria-labelledby="a"></button>'
  );
  assert.equal(accessibleNameOf(both.root, both.element), 'Own name');
  const listed = target(
    '<span id="a">From the list</span><label for="target">From a label</label><input id="target" aria-labelledby="a" title="From a title">'
  );
  assert.equal(accessibleNameOf(listed.root, listed.element), 'From the list');
});
