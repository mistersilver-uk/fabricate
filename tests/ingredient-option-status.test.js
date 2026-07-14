import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { ingredientOptionStatus } from '../src/ui/svelte/util/ingredientOptionStatus.js';

describe('ingredientOptionStatus', () => {
  it('reports craftable when the set can be crafted', () => {
    const status = ingredientOptionStatus({ canCraft: true });
    assert.equal(status.token, 'craftable');
    assert.equal(status.tone, 'success');
  });

  it('craftable wins even if states look unsatisfied (canCraft is authoritative)', () => {
    const status = ingredientOptionStatus({
      canCraft: true,
      ingredientStates: [{ satisfied: false }],
      toolStates: [{ available: false }],
    });
    assert.equal(status.token, 'craftable');
  });

  it('reports blocked when a required tool is missing', () => {
    const status = ingredientOptionStatus({
      canCraft: false,
      toolStates: [{ name: 'Hammer', available: false }],
      ingredientStates: [{ satisfied: false }],
    });
    assert.equal(status.token, 'blocked');
    assert.equal(status.tone, 'danger');
  });

  it('reports blocked from the missing.tools list too', () => {
    const status = ingredientOptionStatus({
      canCraft: false,
      missing: { tools: [{ name: 'Anvil' }] },
    });
    assert.equal(status.token, 'blocked');
  });

  it('reports missing N counting unsatisfied ingredients and essences', () => {
    const status = ingredientOptionStatus({
      canCraft: false,
      ingredientStates: [{ satisfied: true }, { satisfied: false }, { satisfied: false }],
      essenceStates: [{ satisfied: false }],
      toolStates: [{ available: true }],
    });
    assert.equal(status.token, 'missing');
    assert.equal(status.tone, 'warning');
    assert.equal(status.count, 3, '2 ingredients + 1 essence short');
  });

  it('treats a null craftability as blocked', () => {
    assert.equal(ingredientOptionStatus(null).token, 'blocked');
  });
});
