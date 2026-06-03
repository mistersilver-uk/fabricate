import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { resolveDefaultSelection } from '../../src/ui/svelte/apps/gathering/selectionDefault.js';

function env(overrides = {}) {
  return { id: 'env-a', locked: false, ...overrides };
}

describe('resolveDefaultSelection', () => {
  it('preserves a still-valid non-locked selection on re-fetch (does not reset to first)', () => {
    const list = [
      env({ id: 'env-a' }),
      env({ id: 'env-b' })
    ];
    // selectedId points at the SECOND (non-locked) env; it must survive, not
    // get clobbered back to the first.
    assert.equal(resolveDefaultSelection(list, 'env-b'), 'env-b');
  });

  it('defaults to the first non-locked env when selection is null', () => {
    const list = [env({ id: 'env-a' }), env({ id: 'env-b' })];
    assert.equal(resolveDefaultSelection(list, null), 'env-a');
  });

  it('skips a leading locked env and selects the first non-locked one', () => {
    const list = [
      env({ id: 'env-locked', locked: true }),
      env({ id: 'env-open' })
    ];
    assert.equal(resolveDefaultSelection(list, null), 'env-open');
  });

  it('returns null when every env is locked', () => {
    const list = [
      env({ id: 'env-1', locked: true }),
      env({ id: 'env-2', locked: true })
    ];
    assert.equal(resolveDefaultSelection(list, null), null);
  });

  it('returns null for an empty list', () => {
    assert.equal(resolveDefaultSelection([], 'env-a'), null);
  });

  it('returns null for a non-array environments value', () => {
    assert.equal(resolveDefaultSelection(null, 'env-a'), null);
    assert.equal(resolveDefaultSelection(undefined, null), null);
  });

  it('falls through to the first non-locked env when selectedId points at a now-locked env', () => {
    const list = [
      env({ id: 'env-open' }),
      env({ id: 'env-was-open', locked: true })
    ];
    // The user had selected env-was-open; it is now locked, so the selection is
    // replaced with the first selectable env.
    assert.equal(resolveDefaultSelection(list, 'env-was-open'), 'env-open');
  });

  it('falls through to the first non-locked env when selectedId is absent from the list', () => {
    const list = [env({ id: 'env-open' }), env({ id: 'env-other' })];
    assert.equal(resolveDefaultSelection(list, 'env-gone'), 'env-open');
  });

  it('returns null when selectedId is absent and all remaining envs are locked', () => {
    const list = [
      env({ id: 'env-1', locked: true }),
      env({ id: 'env-2', locked: true })
    ];
    assert.equal(resolveDefaultSelection(list, 'env-gone'), null);
  });
});
