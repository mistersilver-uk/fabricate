/**
 * Issue 2006 — the player check card states a count check's successes needed beside its pool line,
 * in the shipped copy, and never a DC.
 */
import { describe, it, before, after, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  CHECK_CARD_COMPILED_MODULES,
  createMountedComponentHarness,
} from '../helpers/svelte-component-harness.js';
import { FOUNDRY_BRIDGE_RAW_MODULES } from '../helpers/foundryBridgeModules.js';
import { shippedLocalize } from '../helpers/checkEvidenceFixtures.js';
import { fill } from '../../src/utils/fillPlaceholders.js';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const CHECK_CARD = 'src/ui/svelte/apps/crafting/detail/CraftingCheckCard.svelte';
const harness = createMountedComponentHarness({
  repoRoot,
  tmpPrefix: 'fabricate-check-card-count-',
  rawModules: [...FOUNDRY_BRIDGE_RAW_MODULES],
  compiledModules: [...CHECK_CARD_COMPILED_MODULES],
  componentPath: CHECK_CARD,
  rootClass: 'fabricate fabricate-app',
});

const card = (extra) => ({
  dc: null,
  rollFormula: '(@skills.smith.rank)d10 · each ≥ 8',
  resolvedFormula: '4d10 · each ≥ 8',
  formulaResolved: true,
  usable: true,
  mandatory: true,
  ...extra,
});

describe('CraftingCheckCard successes needed', () => {
  before(async () => {
    await harness.setup();
    globalThis.game.i18n.localize = shippedLocalize;
    globalThis.game.i18n.format = (key, data) => fill(shippedLocalize(key), data);
  });
  after(harness.teardown);
  afterEach(harness.remount);

  it('states the count beside the pool line, singular at one, and names no DC', async () => {
    const root = await harness.mount({ check: card({ successesNeeded: 3 }) });
    const needed = root.querySelector('[data-check-successes-needed]');
    assert.equal(needed.textContent.trim(), '3 successes needed');
    assert.equal(needed.dataset.checkSuccessesNeeded, '3');
    assert.equal(root.querySelector('[data-check-formula] .fabricate-info-strip-value').textContent, '4d10 · each ≥ 8');
    assert.ok(!root.querySelector('[data-check-dc]'), 'a count check has no DC chip');
    harness.remount();
    const one = await harness.mount({ check: card({ successesNeeded: 1 }) });
    assert.equal(one.querySelector('[data-check-successes-needed]').textContent.trim(), '1 success needed');
    harness.remount();
    const zero = await harness.mount({ check: card({ successesNeeded: 0 }) });
    assert.equal(zero.querySelector('[data-check-successes-needed]').textContent.trim(), '0 successes needed');
  });

  it('states nothing where the descriptor names no count', async () => {
    const root = await harness.mount({ check: card({ dc: 15, rollFormula: '1d20 + 3', resolvedFormula: null }) });
    assert.ok(!root.querySelector('[data-check-successes-needed]'));
    assert.ok(Boolean(root.querySelector('[data-check-dc]')), 'positive control: the DC renders');
  });
});
