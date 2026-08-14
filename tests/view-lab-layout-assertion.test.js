import assert from 'node:assert/strict';
import test from 'node:test';

import { assertViewLabLayout } from '../scripts/lib/viewLabLayoutAssertion.js';

const EXPECTATION = {
  containerSelector: '.layout-container',
  gridSelector: '.layout-grid',
  maxContentBoxInlineSize: 960,
};

function element({ width, padding = 0, border = 0, gridTemplateColumns = 'none' }) {
  return {
    getBoundingClientRect: () => ({ width }),
    computedStyle: {
      paddingLeft: `${padding}px`,
      paddingRight: `${padding}px`,
      borderLeftWidth: `${border}px`,
      borderRightWidth: `${border}px`,
      gridTemplateColumns,
    },
  };
}

function frame(elements) {
  return {
    locator(selector) {
      const target = elements[selector];
      return {
        count: async () => (target ? 1 : 0),
        evaluate: async (callback) => {
          const previous = globalThis.getComputedStyle;
          globalThis.getComputedStyle = (node) => node.computedStyle;
          try {
            return callback(target);
          } finally {
            globalThis.getComputedStyle = previous;
          }
        },
      };
    },
  };
}

function layoutFrame({ containerWidth = 960, padding = 0, border = 0, columns = '960px' } = {}) {
  return frame({
    '.layout-container': element({ width: containerWidth, padding, border }),
    '.layout-grid': element({ width: containerWidth, gridTemplateColumns: columns }),
  });
}

test('accepts an exact 960px content box and one resolved grid track', async () => {
  await assert.doesNotReject(assertViewLabLayout(layoutFrame(), EXPECTATION, 'exact-boundary'));
});

test('rejects a content box wider than the declared maximum', async () => {
  await assert.rejects(
    assertViewLabLayout(layoutFrame({ containerWidth: 961 }), EXPECTATION, 'over-width'),
    /content-box inline size 961px exceeds 960px/
  );
});

test('measures the content box rather than the padded and bordered border box', async () => {
  await assert.doesNotReject(
    assertViewLabLayout(
      layoutFrame({ containerWidth: 984, padding: 10, border: 2 }),
      EXPECTATION,
      'content-box'
    )
  );
});

test('rejects multi-track and none computed grids', async () => {
  await assert.rejects(
    assertViewLabLayout(layoutFrame({ columns: '480px 480px' }), EXPECTATION, 'multi-track'),
    /exactly one resolved grid track/
  );
  await assert.rejects(
    assertViewLabLayout(layoutFrame({ columns: 'none' }), EXPECTATION, 'none'),
    /resolved to "none"/
  );
});

test('rejects missing container and grid selectors', async () => {
  await assert.rejects(
    assertViewLabLayout(frame({}), EXPECTATION, 'missing-container'),
    /container selector ".layout-container" was not found/
  );
  await assert.rejects(
    assertViewLabLayout(
      frame({ '.layout-container': element({ width: 960 }) }),
      EXPECTATION,
      'missing-grid'
    ),
    /grid selector ".layout-grid" was not found/
  );
});
