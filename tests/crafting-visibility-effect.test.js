/**
 * Tests for the crafting visibility matrix contract
 * (src/ui/svelte/apps/manager/crafting/craftingVisibility.js): the flat
 * `visibilityMode` enum → conditional-surface flags + summary i18n key, plus the
 * unknown→knowledge fallback and freshness (no shared reference) guarantees.
 *
 * node:test + node:assert/strict. Pure, dependency-free module.
 */
import test from 'node:test';
import assert from 'node:assert/strict';

import {
  VISIBILITY_MODES,
  craftingEffect,
} from '../src/ui/svelte/apps/manager/crafting/craftingVisibility.js';

test('VISIBILITY_MODES lists the four modes in canonical order', () => {
  assert.deepEqual(VISIBILITY_MODES, ['global', 'restricted', 'item', 'knowledge']);
});

test('global shows nothing conditional', () => {
  assert.deepEqual(craftingEffect('global'), {
    showAccess: false,
    showBooksScrolls: false,
    showLimitedUse: false,
    showLearningLimits: false,
    summaryKey: 'FABRICATE.Admin.Manager.Crafting.Effect.SummaryGlobal',
  });
});

test('restricted shows only Access', () => {
  assert.deepEqual(craftingEffect('restricted'), {
    showAccess: true,
    showBooksScrolls: false,
    showLimitedUse: false,
    showLearningLimits: false,
    summaryKey: 'FABRICATE.Admin.Manager.Crafting.Effect.SummaryRestricted',
  });
});

test('item shows Books & Scrolls + Limited Use', () => {
  assert.deepEqual(craftingEffect('item'), {
    showAccess: false,
    showBooksScrolls: true,
    showLimitedUse: true,
    showLearningLimits: false,
    summaryKey: 'FABRICATE.Admin.Manager.Crafting.Effect.SummaryItem',
  });
});

test('knowledge shows Books & Scrolls + Learning Limits', () => {
  assert.deepEqual(craftingEffect('knowledge'), {
    showAccess: false,
    showBooksScrolls: true,
    showLimitedUse: false,
    showLearningLimits: true,
    summaryKey: 'FABRICATE.Admin.Manager.Crafting.Effect.SummaryKnowledge',
  });
});

test('an unknown mode falls back to the knowledge effect', () => {
  const knowledge = craftingEffect('knowledge');
  for (const bad of ['', 'nope', 'GLOBAL', undefined, null, 0, {}]) {
    assert.deepEqual(craftingEffect(bad), knowledge, `fallback for ${JSON.stringify(bad)}`);
  }
});

test('every declared mode resolves to a defined effect with a summary key', () => {
  for (const mode of VISIBILITY_MODES) {
    const effect = craftingEffect(mode);
    assert.equal(typeof effect.summaryKey, 'string');
    assert.ok(effect.summaryKey.length > 0);
    for (const flag of ['showAccess', 'showBooksScrolls', 'showLimitedUse', 'showLearningLimits']) {
      assert.equal(typeof effect[flag], 'boolean', `${mode}.${flag} is a boolean`);
    }
  }
});

test('returns a fresh object each call (no shared internal reference)', () => {
  const a = craftingEffect('item');
  const b = craftingEffect('item');
  assert.notEqual(a, b);
  a.showBooksScrolls = false;
  assert.equal(craftingEffect('item').showBooksScrolls, true, 'mutation does not leak');
});
