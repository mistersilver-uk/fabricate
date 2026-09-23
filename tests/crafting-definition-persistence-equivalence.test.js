/**
 * Issue 1089 — the persistence seam must be INVISIBLE. 1. Write shape** (checked-in golden,
 * recorded from a pre-seam tree).
 */

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, it, before } from 'node:test';

import {
  runCraftingDefinitionWriteScenario,
  summarizeWriteShape,
} from './helpers/craftingDefinitionWriteScenario.js';

const goldenShape = JSON.parse(
  readFileSync(
    new URL('./fixtures/craftingDefinitionWriteShape.golden.json', import.meta.url),
    'utf8'
  )
);

const { RecipeManager } = await import('../src/systems/RecipeManager.js');
const { CraftingSystemManager } = await import('../src/systems/CraftingSystemManager.js');

/** One scenario run shared by all three parts; each asserts a different axis of it. */
let run;

before(async () => {
  run = await runCraftingDefinitionWriteScenario({ RecipeManager, CraftingSystemManager });
});

describe('persistence equivalence part 1 — write shape (issue 1089)', () => {
  it('issues the same writes, in the same order, against the same keys as the pre-seam tree', () => {
    const shape = summarizeWriteShape(run);

    assert.deepEqual(
      shape.steps,
      goldenShape.steps,
      'the scenario itself drifted; regenerate the golden deliberately rather than editing it to match'
    );

    assert.equal(
      shape.writeCount,
      goldenShape.writeCount,
      `the number of persistence writes changed (${goldenShape.writeCount} before, ${shape.writeCount} now). If a PR deliberately changed write counts this fixture SHOULD be red — re-record it from a pre-seam tree and say so.`
    );

    assert.deepEqual(
      shape.writes,
      goldenShape.writes,
      'the order of writes, or the setting each targets, changed'
    );
  });

  it('is not vacuous: the scenario provokes a substantial number of writes', () => {
    assert.ok(
      goldenShape.writeCount >= 15,
      `the golden records only ${goldenShape.writeCount} writes; a scenario this thin cannot police write amplification`
    );
  });
});

describe('persistence equivalence part 2 — payload differential (issue 1089)', () => {
  it('writes exactly what the pre-seam expression would have written, every time', () => {
    const { failures } = run.differential;
    assert.deepEqual(
      failures.map((failure) => `write ${failure.index} to "${failure.key}"`),
      [],
      failures.length === 0
        ? ''
        : `the adapter wrote something other than the manager's live corpus.\n` +
          `first divergence at write ${failures[0].index} ("${failures[0].key}"):\n` +
          `  expected (live map): ${failures[0].expected.slice(0, 300)}\n` +
          `  actually written   : ${failures[0].written.slice(0, 300)}`
    );
  });

  it('checked every write rather than silently skipping them', () => {
    // The differential is only meaningful if the expectation was actually computed.
    // An unbound manager, or a key it does not recognise, would skip silently.
    assert.equal(
      run.differential.checked,
      run.differential.total,
      'some writes were not payload-checked; the differential would pass while observing nothing'
    );
    assert.ok(run.differential.total > 0, 'no writes were observed at all');
  });
});

describe('persistence equivalence part 3 — round trip (issue 1089)', () => {
  it('re-hydrates and re-serializes the recipe corpus to exactly what was persisted', () => {
    assert.deepEqual(
      run.roundTrip.recipes.reserialized,
      run.roundTrip.recipes.persisted,
      'the persisted recipes do not survive a hydrate/serialize cycle unchanged'
    );
  });

  it('re-hydrates and re-serializes the crafting-system corpus to exactly what was persisted', () => {
    assert.deepEqual(
      run.roundTrip.craftingSystems.reserialized,
      run.roundTrip.craftingSystems.persisted,
      'the persisted crafting systems do not survive a hydrate/serialize cycle unchanged — every normalizer is a whitelist rebuild, so a key it stops emitting is dropped on the next save'
    );
  });

  it('reports no change on reload, the managers own independent signal', () => {
    assert.equal(
      run.roundTrip.recipes.reportedChange,
      false,
      'RecipeManager.reload() saw the persisted corpus differ from the in-memory one'
    );
    assert.equal(
      run.roundTrip.craftingSystems.reportedChange,
      false,
      'CraftingSystemManager.reload() saw the persisted corpus differ from the in-memory one'
    );
  });

  it('is not vacuous: the round trip ran against a populated corpus', () => {
    assert.ok(
      run.roundTrip.craftingSystems.persisted.length > 0,
      'no crafting systems were persisted, so the round trip compared two empty arrays'
    );
    assert.ok(
      run.roundTrip.recipes.persisted.length > 0,
      'no recipes were persisted, so the round trip compared two empty arrays'
    );
  });
});
