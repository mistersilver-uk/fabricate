import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  findLabInjectedContentWidthLosses,
  measureWithoutLabStyles,
} from './view-lab/labInjectedLayoutGuard.js';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const mountSource = readFileSync(resolve(root, 'tests/view-lab/mount.js'), 'utf8');

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

test('View Lab passes its installed stylesheet through the A/B guard before ready', () => {
  const installedAt = mountSource.indexOf('const determinismStyle = installDeterminismStyles();');
  const settledAt = mountSource.indexOf('await settle([built.frame], mounted?.services ?? null);');
  const guardAt = mountSource.indexOf('assertNoLabInducedClipping(built.frame, determinismStyle);');
  const readyAt = mountSource.indexOf(
    'document.body.setAttribute(READY_ATTRIBUTE, params.caseId ?? params.appId);'
  );

  assert.ok(installedAt >= 0, 'installs the determinism stylesheet');
  assert.ok(settledAt >= 0, 'settles the populated frame');
  assert.ok(guardAt > settledAt, 'runs the guard after the populated frame settles');
  assert.ok(guardAt > installedAt, 'passes the installed stylesheet to the A/B guard');
  assert.ok(readyAt > guardAt, 'does not signal capture readiness before the guard succeeds');
});
