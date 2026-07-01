import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  craftingRecipeStatus,
  CRAFTING_RECIPE_STATUS_PRESENTATION,
} from '../src/ui/svelte/util/craftingRecipeStatus.js';
import { CRAFTING_BROWSE_STATUS } from '../src/systems/CraftingListingBuilder.js';

const EXPECTED = {
  [CRAFTING_BROWSE_STATUS.AVAILABLE]: {
    tone: 'success',
    labelKey: 'FABRICATE.App.Crafting.Status.Available',
  },
  [CRAFTING_BROWSE_STATUS.LOCKED]: {
    tone: 'neutral',
    labelKey: 'FABRICATE.App.Crafting.Status.Locked',
  },
  [CRAFTING_BROWSE_STATUS.UNKNOWN]: {
    tone: 'info',
    labelKey: 'FABRICATE.App.Crafting.Status.Unknown',
  },
  [CRAFTING_BROWSE_STATUS.EXHAUSTED]: {
    tone: 'warning',
    labelKey: 'FABRICATE.App.Crafting.Status.Exhausted',
  },
  [CRAFTING_BROWSE_STATUS.MISSING_MATERIALS]: {
    tone: 'danger',
    labelKey: 'FABRICATE.App.Crafting.Status.MissingMaterials',
  },
  [CRAFTING_BROWSE_STATUS.DISCOVERY]: {
    tone: 'info',
    labelKey: 'FABRICATE.App.Crafting.Status.Discovery',
  },
};

describe('craftingRecipeStatus', () => {
  for (const [status, expected] of Object.entries(EXPECTED)) {
    it(`maps ${status} to its tone/icon/labelKey`, () => {
      const descriptor = craftingRecipeStatus(status);
      assert.equal(descriptor.tone, expected.tone);
      assert.equal(descriptor.labelKey, expected.labelKey);
      assert.equal(typeof descriptor.icon, 'string');
      assert.ok(descriptor.icon.length > 0, 'icon is a non-empty class string');
    });
  }

  it('falls back to the neutral "unknown" descriptor for an unrecognized status', () => {
    const descriptor = craftingRecipeStatus('not-a-real-status');
    assert.equal(descriptor.labelKey, 'FABRICATE.App.Crafting.Status.Unknown');
  });

  it('returns frozen descriptors (presentation is immutable)', () => {
    const descriptor = craftingRecipeStatus(CRAFTING_BROWSE_STATUS.AVAILABLE);
    assert.ok(Object.isFrozen(descriptor));
  });

  it('drift guard: every presentation key is a real CRAFTING_BROWSE_STATUS value', () => {
    const validStatuses = new Set(Object.values(CRAFTING_BROWSE_STATUS));
    for (const status of Object.keys(CRAFTING_RECIPE_STATUS_PRESENTATION)) {
      assert.ok(
        validStatuses.has(status),
        `presentation key "${status}" is not a CRAFTING_BROWSE_STATUS value`
      );
    }
  });

  it('drift guard: every CRAFTING_BROWSE_STATUS value has a presentation entry', () => {
    for (const status of Object.values(CRAFTING_BROWSE_STATUS)) {
      assert.ok(
        CRAFTING_RECIPE_STATUS_PRESENTATION[status],
        `status "${status}" has no presentation entry`
      );
    }
  });
});
