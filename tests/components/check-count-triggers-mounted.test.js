/**
 * Issue 2006 — a routed counting check's Botch preset, authored through the real routed editor,
 * targets the tier the engine ranks lowest, whatever order the tiers were authored in.
 */
import { after, afterEach, before, it } from 'node:test';
import assert from 'node:assert/strict';
import { resolve } from 'node:path';

import {
  CHECK_EDITOR_COMPILED_MODULES,
  CHECK_EDITOR_RAW_MODULES,
} from '../helpers/checksHarnessModules.js';
import { createMountedComponentHarness } from '../helpers/svelte-component-harness.js';

const harness = createMountedComponentHarness({
  repoRoot: resolve(import.meta.dirname, '../..'),
  tmpPrefix: 'fabricate-check-count-triggers-',
  rawModules: CHECK_EDITOR_RAW_MODULES,
  compiledModules: CHECK_EDITOR_COMPILED_MODULES,
  componentPath: 'src/ui/svelte/apps/manager/checks/CraftingCheckEditor.svelte',
});

before(() => harness.setup());
after(() => harness.teardown());
afterEach(() => harness.remount());

const COUNT = {
  product: 'count',
  direction: 'under',
  pool: { die: 10, cancel: { enabled: true, faces: { kind: 'worst', value: null } } },
};

/** A routed count check whose tiers are authored best-first, so authored order is not rank. */
const routedCheck = (type) => ({
  rollFormula: '1d20',
  dc: 2,
  type,
  evaluation: COUNT,
  relativeOutcomes: [
    { id: 'fine', name: 'Fine', dc: 2, success: true },
    { id: 'ruined', name: 'Ruined', dc: -2, success: false },
    { id: 'success', name: 'Success', dc: 0, success: true },
  ],
  fixedOutcomes: [
    { id: 'high', name: 'High', start: 4, end: 9, success: true },
    { id: 'low', name: 'Low', start: -9, end: 0, success: false },
  ],
  checkBreakage: { triggers: [] },
});

async function authorBotch(type) {
  const emitted = [];
  const root = await harness.mount({
    value: routedCheck(type),
    section: 'triggers',
    onChange: (patch) => emitted.push(patch),
  });
  const botch = root.querySelector('[data-rule-row-preset="botch"]');
  assert.ok(Boolean(botch), 'a cancelling routed count check offers Botch');
  botch.click();
  return emitted.at(-1).checkBreakage.triggers.at(-1);
}

it('targets the lowest-ranked relative tier, not the first authored', async () => {
  const trigger = await authorBotch('relative');
  assert.deepEqual(trigger.condition, { type: 'rollTotal', operator: '<', value: 0 });
  assert.deepEqual(trigger.tierStep, { mode: 'target', steps: 1, tierId: 'ruined' });
});

it('targets the lowest fixed range on a fixed-range check', async () => {
  const trigger = await authorBotch('fixed');
  assert.equal(trigger.tierStep.tierId, 'low');
});
