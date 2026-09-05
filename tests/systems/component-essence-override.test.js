/**
 * The override rule's OWN branches, driven directly through its seams (issue 1371 r20-store3).
 *
 * ── WHY THIS FILE EXISTS BESIDE THE TWO COMPOSITION SUITES ────────────────────────────────────
 * `tests/component-category-normalization.test.js` drives the rule through the standalone editor's
 * save and `tests/stores/admin-store-component-scope.test.js` drives it through the store, so the
 * COMPOSITION is well covered. Its own guards were not: the quality engineer's round-6 mutation run
 * deleted each of the two `Object.hasOwn` short-circuits and each of the two degradation catches
 * and got `tests 932, pass 932` every time (R3, R6). What the deleted guards were holding back is a
 * durable, replicated `inherit.essences: false` write on a bulk edit that staged only `category`
 * and on a save that named only `name`.
 *
 * The seams are HAND-WRITTEN here rather than composed from a real store, which is the point: the
 * rule is a pure decision over three functions, so each branch is one call and a spy list, and a
 * branch that is only reachable from a refused Foundry setting write (or a corpus read that throws)
 * is as cheap to drive as the happy path.
 */

import assert from 'node:assert/strict';
import test from 'node:test';

import { createComponentEssenceOverride } from '../../src/systems/componentEssenceOverride.js';

/**
 * The rule over one `(ingot, sys1)` pair, with every seam recorded.
 *
 * The default corpus is the state the `1.32.0` election leaves behind and the one every finding is
 * about: a membership record with no `inherit` map (which READS as inheriting) over a world default
 * that AUTHORED `essences`.
 *
 * @param {object} [options]
 * @param {object|null} [options.corpus] the published component-scope corpus, or a thrower.
 * @param {boolean} [options.corpusThrows]
 * @param {boolean} [options.resolvedThrows]
 * @param {unknown} [options.resolved] what the read union answers for the pair.
 * @param {boolean|Error} [options.flagWrite] `true` accepts, `false` refuses, an Error rejects.
 * @returns {{override: object, switchWrites: Array<[string, string, boolean]>}}
 */
function makeOverride({
  corpus,
  corpusThrows = false,
  resolvedThrows = false,
  resolved = { fire: 2 },
  flagWrite = true,
} = {}) {
  const switchWrites = [];
  const override = createComponentEssenceOverride({
    readComponentScope: () => {
      if (corpusThrows) throw new Error('the component scope store is unreadable');
      return (
        corpus ?? {
          entities: [{ id: 'ingot' }],
          defaults: [{ id: 'ingot', essences: { fire: 2 } }],
          membership: [{ entityId: 'ingot', systemId: 'sys1' }],
        }
      );
    },
    readResolvedEssences: () => {
      if (resolvedThrows) throw new Error('the read union is unavailable');
      return resolved;
    },
    setEssenceInheritance: async (componentId, systemId, inherit) => {
      switchWrites.push([componentId, systemId, inherit]);
      if (flagWrite instanceof Error) throw flagWrite;
      return flagWrite;
    },
  });
  return { override, switchWrites };
}

// ---------------------------------------------------------------------------
// R3 — the two "don't touch what the GM didn't" guards
// ---------------------------------------------------------------------------

test('1371 r20: a cohort edit with NO essences axis is returned untouched and moves no switch', async () => {
  // Deleting `cohortFor`'s `Object.hasOwn(edit, 'essences')` short-circuit left 932 tests green
  // while a category-only bulk edit flipped `inherit.essences` on every inheriting pair in the
  // selection — a durable world-setting write on an axis nobody touched.
  for (const edit of [{ category: 'Raw Materials' }, { addTags: ['fuel'] }, {}]) {
    const { override, switchWrites } = makeOverride();
    const cohort = await override.cohortFor('sys1', ['ingot'], edit);
    assert.deepEqual(cohort.writable, ['ingot'], `every pair stays writable for ${JSON.stringify(edit)}`);
    assert.deepEqual(cohort.refused, []);
    assert.deepEqual(cohort.flipped, []);
    assert.deepEqual(switchWrites, [], 'and no switch was written at all');
  }
});

test('1371 r20: updates with NO essences key are returned untouched and move no switch', async () => {
  // The `updatesFor` twin of the above: a rename, a description edit or an image swap names no
  // essence axis and must not opt the pair out of the world map.
  const { override, switchWrites } = makeOverride();
  const updates = { name: 'Bar', description: 'A bar of iron' };
  const { staged, flipped } = await override.updatesFor('sys1', 'ingot', updates);
  assert.equal(staged, updates, 'the caller’s own object is handed straight back');
  assert.deepEqual(flipped, []);
  assert.deepEqual(switchWrites, [], 'and no switch was written at all');
});

test('1371 r20: an EMPTY staged essence map is still an essence axis, so it overrides', async () => {
  // `{essences: {}}` is "strip every essence", not "nothing staged". A truthiness test here would
  // silently drop one of the bulk panel's ordinary operations.
  const { override, switchWrites } = makeOverride();
  const cohort = await override.cohortFor('sys1', ['ingot'], { essences: {} });
  assert.deepEqual(cohort.writable, ['ingot']);
  assert.deepEqual(switchWrites, [['ingot', 'sys1', false]]);
});

// ---------------------------------------------------------------------------
// R6 — the two degradation catches
// ---------------------------------------------------------------------------

test('1371 r20: a corpus read that THROWS degrades to "nothing is shadowed"', async () => {
  const { override, switchWrites } = makeOverride({ corpusThrows: true });
  const cohort = await override.cohortFor('sys1', ['ingot'], { essences: { fire: 4 } });
  assert.deepEqual(cohort.writable, ['ingot'], 'the write is what it always was');
  assert.deepEqual(cohort.refused, []);
  const { staged } = await override.updatesFor('sys1', 'ingot', { essences: { fire: 4 } });
  assert.deepEqual(staged, { essences: { fire: 4 } });
  assert.deepEqual(switchWrites, [], 'and an unreadable corpus spends no world-setting write');
});

test('1371 r20: a read union that THROWS declines the exemption rather than escaping', async () => {
  // The safe direction: with no resolved map to compare against, the staged map is treated as
  // AUTHORED, so the switch moves before the values land and nothing is written into a shadow.
  const { override, switchWrites } = makeOverride({ resolvedThrows: true });
  const { staged, flipped } = await override.updatesFor('sys1', 'ingot', {
    essences: { fire: 2 },
  });
  assert.deepEqual(staged, { essences: { fire: 2 } });
  assert.deepEqual(flipped, ['ingot']);
  assert.deepEqual(switchWrites, [['ingot', 'sys1', false]]);
});

// ---------------------------------------------------------------------------
// Reviewer round 6, finding 7 — the flip fires only where the write is shadowed
// ---------------------------------------------------------------------------

test('1371 r20: an UNAUTHORED world section is not shadowing anything, so no switch moves', async () => {
  // `applyInheritedSections` skips an `undefined` world value, so this pair already resolves its
  // own row. Flipping here opted it out of a world default it had not yet received — and
  // `ComponentEditView` withholds the inherit offer in exactly this state, so the GM could neither
  // see nor reverse it.
  const corpus = {
    entities: [{ id: 'ingot' }],
    defaults: [{ id: 'ingot', category: 'Raw Materials' }],
    membership: [{ entityId: 'ingot', systemId: 'sys1' }],
  };
  const { override, switchWrites } = makeOverride({ corpus });
  const cohort = await override.cohortFor('sys1', ['ingot'], { essences: { fire: 4 } });
  assert.deepEqual(cohort.writable, ['ingot']);
  const { staged } = await override.updatesFor('sys1', 'ingot', { essences: { fire: 4 } });
  assert.deepEqual(staged, { essences: { fire: 4 } });
  assert.deepEqual(switchWrites, [], 'nothing shadows the write, so nothing had to move');
});

test('1371 r20: an AUTHORED but EMPTY world map IS shadowing, so the switch moves', async () => {
  // `{}` is an authored "this component carries no essences" — a value an inheriting system takes.
  // Absence is the only absence.
  const corpus = {
    entities: [{ id: 'ingot' }],
    defaults: [{ id: 'ingot', essences: {} }],
    membership: [{ entityId: 'ingot', systemId: 'sys1' }],
  };
  const { override, switchWrites } = makeOverride({ corpus });
  const cohort = await override.cohortFor('sys1', ['ingot'], { essences: { fire: 4 } });
  assert.deepEqual(cohort.writable, ['ingot']);
  assert.deepEqual(switchWrites, [['ingot', 'sys1', false]]);
});

test('1371 r20: a pair with no membership record, and one already overriding, move no switch', async () => {
  const corpus = {
    entities: [{ id: 'ingot' }, { id: 'coal' }],
    defaults: [
      { id: 'ingot', essences: { fire: 2 } },
      { id: 'coal', essences: { fire: 9 } },
    ],
    membership: [{ entityId: 'coal', systemId: 'sys1', inherit: { essences: false } }],
  };
  const { override, switchWrites } = makeOverride({ corpus });
  const cohort = await override.cohortFor('sys1', ['ingot', 'coal'], { essences: { fire: 4 } });
  assert.deepEqual(cohort.writable, ['ingot', 'coal']);
  assert.deepEqual(switchWrites, []);
});

// ---------------------------------------------------------------------------
// Reviewer round 6, finding 1 — the baseline the editor was seeded from
// ---------------------------------------------------------------------------

test('1371 r20: a save that restates the STATED BASELINE writes no essences, whatever the union says', async () => {
  // The defect this closes: an editor seeded from the PERSISTED row sends that row back on a save
  // that touched only a tag. Compared against the resolved map it DIFFERS, so the rule read it as
  // an authored override, flipped the switch and pinned the dormant map. Compared against the
  // baseline the editor was actually seeded from it is a restatement, which is what it is.
  const { override, switchWrites } = makeOverride({ resolved: { fire: 2 } });
  const { staged, flipped } = await override.updatesFor(
    'sys1',
    'ingot',
    { tags: ['bar'], essences: { iron: 3 } },
    { baseline: { iron: 3 } }
  );
  assert.deepEqual(staged, { tags: ['bar'] }, 'the essence key is dropped, the tag survives');
  assert.deepEqual(flipped, []);
  assert.deepEqual(switchWrites, [], 'and the switch is left exactly where the GM left it');
});

test('1371 r20: a staged map that DIFFERS from the stated baseline is a real override', async () => {
  const { override, switchWrites } = makeOverride({ resolved: { iron: 3 } });
  const { staged, flipped } = await override.updatesFor(
    'sys1',
    'ingot',
    { essences: { iron: 4 } },
    { baseline: { iron: 3 } }
  );
  assert.deepEqual(staged, { essences: { iron: 4 } });
  assert.deepEqual(flipped, ['ingot']);
  assert.deepEqual(switchWrites, [['ingot', 'sys1', false]]);
});

test('1371 r20: with NO baseline stated the resolved map is the fallback', async () => {
  const { override, switchWrites } = makeOverride({ resolved: { fire: 2 } });
  const { staged } = await override.updatesFor('sys1', 'ingot', { essences: { fire: 2 } });
  assert.deepEqual(staged, {}, 'a restatement of the resolved map authors nothing');
  assert.deepEqual(switchWrites, []);
});

// ---------------------------------------------------------------------------
// Reviewer round 6, findings 5 and 6 — refusal reporting and rollback
// ---------------------------------------------------------------------------

test('1371 r20: a REFUSED flag write reports the pair rather than swallowing it', async () => {
  for (const flagWrite of [false, new Error('The requested Setting update was refused')]) {
    const { override, switchWrites } = makeOverride({ flagWrite });
    const cohort = await override.cohortFor('sys1', ['ingot'], { essences: { fire: 4 } });
    assert.deepEqual(cohort.writable, [], 'the pair may not take the essence axis');
    assert.deepEqual(cohort.refused, ['ingot'], 'and the caller is TOLD, so it can write the rest');
    assert.deepEqual(cohort.flipped, [], 'nothing moved, so there is nothing to roll back');
    assert.equal(switchWrites.length, 1, 'exactly one attempt, not a retry loop');
  }
});

test('1371 r20: a refused single save refuses the whole write and flips nothing', async () => {
  const { override } = makeOverride({ flagWrite: false });
  const { staged, flipped } = await override.updatesFor('sys1', 'ingot', {
    essences: { fire: 4 },
  });
  assert.equal(staged, null);
  assert.deepEqual(flipped, []);
});

test('1371 r20: rollback puts every flipped switch back ON', async () => {
  const corpus = {
    entities: [{ id: 'ingot' }, { id: 'coal' }],
    defaults: [
      { id: 'ingot', essences: { fire: 2 } },
      { id: 'coal', essences: { fire: 9 } },
    ],
    membership: [
      { entityId: 'ingot', systemId: 'sys1' },
      { entityId: 'coal', systemId: 'sys1' },
    ],
  };
  const { override, switchWrites } = makeOverride({ corpus });
  const cohort = await override.cohortFor('sys1', ['ingot', 'coal'], { essences: { fire: 4 } });
  assert.deepEqual(cohort.flipped, ['ingot', 'coal']);
  await override.rollback('sys1', cohort.flipped);
  assert.deepEqual(switchWrites, [
    ['ingot', 'sys1', false],
    ['coal', 'sys1', false],
    ['ingot', 'sys1', true],
    ['coal', 'sys1', true],
  ]);
});

test('1371 r20: a rollback whose own write is refused reports nothing and throws nothing', async () => {
  // Best effort by construction: the caller is already reporting a failure, and a rollback that
  // cannot land leaves the pair exactly where the un-rolled-back write would have.
  const { override, switchWrites } = makeOverride({
    flagWrite: new Error('The requested Setting update was refused'),
  });
  await override.rollback('sys1', ['ingot']);
  assert.deepEqual(switchWrites, [['ingot', 'sys1', true]]);
});
