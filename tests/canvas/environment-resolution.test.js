/**
 * Pure-decision coverage for the on-drop environment-resolution precedence
 * (Phase 6): Scene Region auto-detect → task default → GM dialog, with the Alt
 * override forcing the dialog. The region hit-test and the dialog are seams
 * supplied by the caller, so this exercises only the decision.
 */

import test from 'node:test';
import assert from 'node:assert/strict';

import { resolveDropEnvironment } from '../../src/canvas/environmentResolution.js';

const ALL_EXIST = () => true;

test('tier 1 — a single flagged region containing the point wins (no dialog, notify)', () => {
  const out = resolveDropEnvironment({
    regionEnvironmentIds: ['env-region'],
    defaultEnvironmentId: 'env-default',
    environmentExists: ALL_EXIST
  });
  assert.deepEqual(out, { source: 'region', environmentId: 'env-region', needsDialog: false, notify: true });
});

test('tier 2 — no region hit falls through to the task default (no dialog, no notify)', () => {
  const out = resolveDropEnvironment({
    regionEnvironmentIds: [],
    defaultEnvironmentId: '  env-default  ',
    environmentExists: ALL_EXIST
  });
  assert.deepEqual(out, { source: 'taskDefault', environmentId: 'env-default', needsDialog: false, notify: false });
});

test('tier 3 — neither region nor default ⇒ dialog', () => {
  const out = resolveDropEnvironment({ regionEnvironmentIds: [], defaultEnvironmentId: null, environmentExists: ALL_EXIST });
  assert.deepEqual(out, { source: 'dialog', environmentId: null, needsDialog: true, notify: false });
});

test('Alt override forces the dialog, bypassing region and default', () => {
  const out = resolveDropEnvironment({
    regionEnvironmentIds: ['env-region'],
    defaultEnvironmentId: 'env-default',
    forceDialog: true,
    environmentExists: ALL_EXIST
  });
  assert.deepEqual(out, { source: 'dialog', environmentId: null, needsDialog: true, notify: false });
});

test('ambiguous region hits (multiple flagged regions) fall through to the dialog', () => {
  const out = resolveDropEnvironment({
    regionEnvironmentIds: ['env-a', 'env-b'],
    defaultEnvironmentId: 'env-default',
    environmentExists: ALL_EXIST
  });
  assert.equal(out.source, 'dialog', 'ambiguity is resolved by the GM, not the task default');
  assert.equal(out.needsDialog, true);
});

test('duplicate region ids collapse to a single unambiguous hit', () => {
  const out = resolveDropEnvironment({
    regionEnvironmentIds: ['env-a', 'env-a'],
    environmentExists: ALL_EXIST
  });
  assert.deepEqual(out, { source: 'region', environmentId: 'env-a', needsDialog: false, notify: true });
});

test('a stale region id (no matching environment) is ignored, falling through', () => {
  const out = resolveDropEnvironment({
    regionEnvironmentIds: ['env-gone'],
    defaultEnvironmentId: 'env-default',
    environmentExists: (id) => id === 'env-default'
  });
  assert.deepEqual(out, { source: 'taskDefault', environmentId: 'env-default', needsDialog: false, notify: false });
});

test('a stale task default (no matching environment) falls through to the dialog', () => {
  const out = resolveDropEnvironment({
    regionEnvironmentIds: [],
    defaultEnvironmentId: 'env-gone',
    environmentExists: (id) => id === 'env-real'
  });
  assert.deepEqual(out, { source: 'dialog', environmentId: null, needsDialog: true, notify: false });
});
