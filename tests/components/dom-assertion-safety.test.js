import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { inspect } from 'node:util';
import { assertNoElement, setupDOM, teardownDOM } from '../helpers/svelte-dom.js';

// The options `node:assert` renders a failed assertion's operands with. `depth: 1000` and
// `getters: true` are the dangerous pair: a happy-dom element's own enumerable state reaches
// its children, its parents and its owner document, so the rendered string grows without bound.
const ASSERT_INSPECT_OPTIONS = {
  compact: false,
  customInspect: false,
  maxArrayLength: Infinity,
  showHidden: false,
  showProxy: false,
  sorted: true,
  getters: true,
};

function buildChain(depth) {
  const root = document.createElement('div');
  document.body.appendChild(root);
  let cursor = root;
  for (let index = 0; index < depth; index += 1) {
    const child = document.createElement('div');
    child.setAttribute('data-depth', String(index));
    cursor.appendChild(child);
    cursor = child;
  }
  return root;
}

describe('assertNoElement keeps a failing DOM assertion bounded', () => {
  before(setupDOM);
  after(teardownDOM);

  it('states the case for the helper: inspecting a happy-dom node explodes with depth', () => {
    // Twelve nodes. `node:assert` renders at depth 1000, so this curve is why handing a live
    // element to `assert.equal(element, null)` can take a machine down when it FAILS — which
    // is precisely while someone is developing a regression.
    const element = buildChain(12).querySelector('[data-depth="5"]');
    const sizes = [2, 4, 6].map(
      (depth) => inspect(element, { ...ASSERT_INSPECT_OPTIONS, depth }).length
    );

    assert.ok(
      sizes[1] > sizes[0] * 2 && sizes[2] > sizes[1] * 2,
      `each depth level should more than double the rendered size, got ${sizes.join(' -> ')}`
    );
  });

  it('passes silently when the selector matches nothing', () => {
    assertNoElement(buildChain(3), '[data-depth="99"]');
  });

  it('reports the offending element in constant space when the selector DOES match', () => {
    const root = buildChain(12);

    assert.throws(
      () => assertNoElement(root, '[data-depth="5"]', 'nothing should match'),
      (error) => {
        assert.match(error.message, /nothing should match/);
        assert.match(
          error.message,
          /<div data-depth="5">/,
          'the failure must still name the element it found'
        );
        assert.ok(
          error.message.length < 2000,
          `a failure message must stay small, got ${error.message.length} characters`
        );
        return true;
      }
    );
  });
});
