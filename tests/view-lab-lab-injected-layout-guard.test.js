import assert from 'node:assert/strict';
import test from 'node:test';

import {
  findLabInjectedContentWidthLosses,
  measureWithoutLabStyles,
} from './view-lab/labInjectedLayoutGuard.js';

test('findLabInjectedContentWidthLosses reports width lost only while the lab stylesheet is enabled', () => {
  const element = {};

  assert.deepEqual(
    findLabInjectedContentWidthLosses(
      [{ element, boxWidth: 100, clientWidth: 90 }],
      [{ element, boxWidth: 100, clientWidth: 100 }]
    ),
    [{ element, boxWidth: 100, clientWidth: 90, lost: 10 }]
  );
});

test('findLabInjectedContentWidthLosses ignores an equal native scrollbar reservation', () => {
  const element = {};

  assert.deepEqual(
    findLabInjectedContentWidthLosses(
      [{ element, boxWidth: 906, clientWidth: 896 }],
      [{ element, boxWidth: 906, clientWidth: 896 }]
    ),
    []
  );
});

test('findLabInjectedContentWidthLosses permits one pixel of measurement rounding', () => {
  const element = {};

  assert.deepEqual(
    findLabInjectedContentWidthLosses(
      [{ element, boxWidth: 100, clientWidth: 99 }],
      [{ element, boxWidth: 100, clientWidth: 100 }]
    ),
    []
  );
});

test('measureWithoutLabStyles restores the lab stylesheet after a measurement failure', () => {
  const styleSheet = { disabled: false };

  assert.throws(
    () =>
      measureWithoutLabStyles(styleSheet, () => {
        assert.equal(styleSheet.disabled, true);
        throw new Error('simulated measurement failure');
      }),
    /simulated measurement failure/
  );
  assert.equal(styleSheet.disabled, false);
});
