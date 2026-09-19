/**
 * The manager's route-exit guard table and its driver (issue 1705). The mounted suites pin every
 * row through the real shell; this file pins the table — its order, its short-circuit, its three
 * skip shapes, its per-row default, and its synchronous answer.
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  ROUTE_EXIT_GUARDS,
  buildRouteExitGuards,
  confirmRouteExitGuards,
  runRouteExitGuard,
} from '../src/ui/svelte/apps/manager/routeExitGuards.js';

/** The cascade's order, written out rather than derived, so a reordering fails here. */
const CASCADE = [
  'world-essence-entry',
  'world-tool-entry',
  'world-component-entry',
  'environment-edit',
  'essence-edit',
  'recipe-edit',
  'recipe-item-edit',
  'component-edit',
  'gathering-task-edit',
  'gathering-event-edit',
  'tool-edit',
  'checks',
  'system-edit',
];

/** A row nothing prompts: inactive, clean, and answering `true` whatever it is asked. */
function inertRow(guard, calls) {
  const shared = {
    active: () => false,
    subject: () => '',
    family: () => false,
    isDirty: () => false,
    confirm: () => undefined,
  };
  if (guard.finish === 'scoped-entry') {
    return {
      ...shared,
      save: () => {
        calls.push([guard.view, 'save']);
        return true;
      },
      discard: () => calls.push([guard.view, 'discard']),
    };
  }
  return {
    ...shared,
    finish: (action, nextView) => {
      calls.push([guard.view, 'finish', action, nextView]);
      return true;
    },
  };
}

/** The thirteen inert rows, with the named ones replaced by what a case is about. */
function contextOf(overrides = {}, calls = []) {
  const context = {};
  for (const guard of ROUTE_EXIT_GUARDS) {
    context[guard.view] = { ...inertRow(guard, calls), ...(overrides[guard.view] ?? {}) };
  }
  return context;
}

function rowFor(rows, view) {
  const row = rows.find((candidate) => candidate.view === view);
  assert.ok(Boolean(row), `the table carries a \`${view}\` row`);
  return row;
}

const prompting = (extra) => ({ active: () => true, isDirty: () => true, ...extra });

/** How many sequential microtask turns pass before a cascade answer settles. */
async function microtaskDepthOf(result) {
  let settled = false;
  result.then(() => {
    settled = true;
  });
  let turns = 0;
  while (!settled && turns < 500) {
    turns += 1;
    await Promise.resolve();
  }
  return turns;
}

describe('the route-exit guard table', () => {
  it('carries the thirteen guarded routes in the cascade order', () => {
    const rows = buildRouteExitGuards(contextOf());
    assert.deepEqual(
      rows.map((row) => row.view),
      CASCADE,
      'the world entry editors are asked first and system-details last'
    );
    assert.equal(ROUTE_EXIT_GUARDS.length, CASCADE.length);
  });

  it('refuses to build a table a context has left a hole in', () => {
    const context = contextOf();
    delete context['tool-edit'];
    assert.throws(() => buildRouteExitGuards(context), /no route-exit guard is wired for/);
  });

  it('answers a raw `true` while every row is inactive, never a promise', () => {
    const result = confirmRouteExitGuards(buildRouteExitGuards(contextOf()), 'systems');
    // `assert.ok` would pass on a promise, and a promise reads as approval at the four call sites
    // that consume this answer as a boolean.
    assert.strictEqual(result, true);
    assert.equal(typeof result.then, 'undefined');
  });

  it('answers a raw `true` for a skipped row, never a promise, row by row', () => {
    // Row by row because an all-skipped whole table is unconstructible: the skip shapes answer to
    // different destinations, and no one `(nextView, nextRouteId)` pair waives all ten at once.
    const calls = [];
    const overrides = {};
    for (const { view, skip } of ROUTE_EXIT_GUARDS) {
      if (skip !== 'none')
        overrides[view] = prompting({ subject: () => 'subject-1', family: () => true });
    }
    const rows = buildRouteExitGuards(contextOf(overrides, calls)).filter((row) => row.skip);
    assert.equal(rows.length, 10, 'every skip shape waives a re-entry that keeps its subject');
    for (const row of rows) {
      const answer = runRouteExitGuard(row, row.view, 'subject-1');
      assert.strictEqual(answer, true, `${row.view} waives its own re-entry`);
      assert.equal(typeof answer.then, 'undefined', `${row.view} answered with a promise`);
    }
    assert.deepEqual(calls, [], 'and a waived row reaches no finisher, so nothing was saved');
  });

  it('hands the destination subject to every row, not only to the first that reads one', () => {
    const calls = [];
    const rows = buildRouteExitGuards(
      contextOf({ 'essence-edit': prompting({ subject: () => 'e1' }) }, calls)
    );
    const result = confirmRouteExitGuards(rows, 'essence-edit', 'e1');
    assert.strictEqual(result, true, 'a dirty essence row waives a re-entry on the same essence');
    assert.deepEqual(calls, [], 'so it never prompted: a withheld subject would prompt here');
  });

  it('stops at the first refusal and asks no later row', () => {
    const calls = [];
    const context = contextOf(
      {
        'recipe-edit': prompting({ confirm: () => 'cancel', finish: () => false }),
        'component-edit': prompting({ confirm: () => 'discard' }),
        'system-edit': prompting({ confirm: () => 'discard' }),
      },
      calls
    );
    const result = confirmRouteExitGuards(buildRouteExitGuards(context), 'systems');
    assert.strictEqual(result, false);
    assert.deepEqual(
      calls.map(([view]) => view),
      [],
      'the refusing row answered from its own finisher and no later row was asked'
    );
  });
});

describe('the three skip shapes', () => {
  const subjectRows = ROUTE_EXIT_GUARDS.filter((guard) => guard.skip === 'subject');
  const sameViewRows = ROUTE_EXIT_GUARDS.filter((guard) => guard.skip === 'same-view');

  it('waives a same-view navigation that keeps the same subject, and nothing else', () => {
    assert.equal(subjectRows.length, 5);
    const overrides = {};
    for (const { view } of subjectRows) overrides[view] = { subject: () => 'subject-1' };
    const rows = buildRouteExitGuards(contextOf(overrides));
    for (const { view } of subjectRows) {
      const { skip } = rowFor(rows, view);
      assert.equal(skip(view, 'subject-1'), true, `${view} waives a re-entry on the same subject`);
      assert.equal(skip(view, 'subject-2'), false, `${view} guards a move to another subject`);
      assert.equal(skip(view, ''), false, `${view} guards a caller that states no subject`);
      assert.equal(skip('systems', 'subject-1'), false, `${view} guards a move off the route`);
    }
    // And a row holding no subject waives nothing, rather than matching the caller that states
    // none: every navigation off these routes passes one, and the floor is what separates them.
    const unheld = buildRouteExitGuards(contextOf({ 'essence-edit': { subject: () => '' } }));
    assert.equal(rowFor(unheld, 'essence-edit').skip('essence-edit', ''), false);
  });

  it('waives a same-view navigation on the view token alone for the four rows that must', () => {
    assert.equal(sameViewRows.length, 4);
    const rows = buildRouteExitGuards(contextOf());
    for (const { view } of sameViewRows) {
      const { skip } = rowFor(rows, view);
      // Load-bearing, not vestigial: without it the validation-blocker link prompts the GM on
      // re-entry into the route they are already on.
      assert.equal(skip(view, ''), true, `${view} waives a same-token re-entry`);
      assert.equal(skip(view, 'subject-1'), true, `${view} waives it whatever the subject`);
      assert.equal(skip('systems', ''), false, `${view} guards a move off the route`);
    }
  });

  it('waives the whole checks family rather than one view token', () => {
    const family = (nextView) => String(nextView).startsWith('checks');
    const rows = buildRouteExitGuards(contextOf({ checks: { family } }));
    const { skip } = rowFor(rows, 'checks');
    assert.equal(skip('checks-crafting', ''), true, 'a sibling checks tab is the same route');
    assert.equal(skip('systems', ''), false, 'leaving the family is guarded');
  });

  it('gives the three issue-676 rows no skip at all', () => {
    const rows = buildRouteExitGuards(contextOf());
    for (const view of ['component-edit', 'gathering-task-edit', 'gathering-event-edit']) {
      assert.equal(rowFor(rows, view).skip, undefined, `${view} waives no navigation`);
    }
  });

  it('prompts a component-edit re-entry where the recipe sibling does not (issue 676)', () => {
    /** Which rows reached their finisher when the GM re-enters the route they are already on. */
    function promptedOnReEntry(view) {
      const calls = [];
      const context = contextOf({ [view]: prompting({ confirm: () => 'discard' }) }, calls);
      confirmRouteExitGuards(buildRouteExitGuards(context), view);
      return calls.map(([prompted]) => prompted);
    }
    assert.deepEqual(promptedOnReEntry('component-edit'), ['component-edit']);
    assert.deepEqual(promptedOnReEntry('recipe-edit'), [], 'the recipe editor waives its own');
  });
});

describe('the prompt each row raises', () => {
  it('gives each row its own missing-helper default, which is not uniform', () => {
    const seen = [];
    for (const guard of ROUTE_EXIT_GUARDS) {
      const calls = [];
      const rows = buildRouteExitGuards(
        contextOf({ [guard.view]: prompting({ confirm: () => undefined }) }, calls)
      );
      const answer = runRouteExitGuard(rowFor(rows, guard.view), 'systems');
      if (guard.finish === 'scoped-entry') {
        // The shared scoped-entry finisher's default branch discards and allows.
        assert.deepEqual(calls, [[guard.view, 'discard']], `${guard.view} discards on no helper`);
        assert.equal(answer, true, `${guard.view} allows the navigation on no helper`);
        seen.push([guard.view, undefined]);
        continue;
      }
      assert.equal(calls.length, 1, `${guard.view} reached its finisher once`);
      assert.deepEqual(
        calls[0].slice(1),
        ['finish', guard.missing, 'systems'],
        `${guard.view} defaults to its own action, and is told where the GM is going`
      );
      seen.push([guard.view, guard.missing]);
    }
    assert.equal(seen.length, 13);
    assert.deepEqual(
      seen.filter(([, missing]) => missing === false).map(([view]) => view),
      [
        'essence-edit',
        'recipe-edit',
        'recipe-item-edit',
        'component-edit',
        'gathering-task-edit',
        'gathering-event-edit',
      ],
      'six rows block on a missing helper and the other seven do not'
    );
    assert.deepEqual(
      seen.filter(([, missing]) => missing === 'cancel').map(([view]) => view),
      ['system-edit']
    );
  });

  it('relays a promised answer to the finisher without normalising it', async () => {
    const calls = [];
    const rows = buildRouteExitGuards(
      contextOf(
        { 'essence-edit': prompting({ confirm: () => Promise.resolve('save') }) },
        calls
      )
    );
    const answer = await confirmRouteExitGuards(rows, 'systems');
    assert.equal(answer, true);
    assert.deepEqual(
      calls,
      [['essence-edit', 'finish', 'save', 'systems']],
      'the finisher is told where the GM is going, which is what the two gathering rows move to'
    );
  });

  it('carries both finisher polarities unchanged, because the driver decides nothing', () => {
    // The eight editor rows stop on `'cancel' | false` and discard on anything else; checks and
    // tools allow only `'save'` and `'discard' | true`.
    const stopsOnCancel = (action) => !(action === 'cancel' || action === false);
    const allowsNamedOnly = (action) => action === 'save' || action === 'discard' || action === true;
    const rows = buildRouteExitGuards(
      contextOf({
        'recipe-edit': prompting({ confirm: () => 'reload', finish: stopsOnCancel }),
        checks: prompting({ confirm: () => 'reload', finish: allowsNamedOnly }),
      })
    );
    assert.equal(runRouteExitGuard(rowFor(rows, 'recipe-edit'), 'systems'), true);
    assert.equal(runRouteExitGuard(rowFor(rows, 'checks'), 'systems'), false);
  });

  it('runs the work a clean row still has, rather than answering `true` over it', () => {
    const calls = [];
    const rows = buildRouteExitGuards(
      contextOf({
        'tool-edit': {
          active: () => true,
          isDirty: () => false,
          whenClean: (nextView) => {
            calls.push(['tool-edit', 'whenClean', nextView]);
            return true;
          },
        },
      })
    );
    assert.equal(runRouteExitGuard(rowFor(rows, 'tool-edit'), 'tools'), true);
    assert.deepEqual(calls, [['tool-edit', 'whenClean', 'tools']]);
  });
});

describe('the rows whose cancel no mounted suite reaches', () => {
  // `manager-world-scope-mounted.js` and `manager-components-mounted.js` drive these four rows'
  // save and discard; the cancel that keeps the GM on the editor is pinned only here.
  const partlyCovered = [
    'world-essence-entry',
    'world-tool-entry',
    'world-component-entry',
    'component-edit',
  ];

  /** The save/discard/cancel triple, for a row whose dirty path nothing else exercises. */
  function tripleFor(view, action) {
    const calls = [];
    const row = { active: () => true, isDirty: () => true, confirm: () => action };
    if (view === 'component-edit') {
      // The component editor's own finisher shape, which is the eight-row polarity.
      row.finish = (answer) => {
        if (answer === 'cancel' || answer === false) return false;
        if (answer === 'save') {
          calls.push([view, 'save']);
          return true;
        }
        calls.push([view, 'discard']);
        return true;
      };
    }
    const rows = buildRouteExitGuards(contextOf({ [view]: row }, calls));
    return { calls, answer: confirmRouteExitGuards(rows, 'systems') };
  }

  for (const view of partlyCovered) {
    it(`saves, discards and cancels a dirty ${view} exit`, () => {
      const saved = tripleFor(view, 'save');
      assert.equal(saved.answer, true, 'a saved exit proceeds');
      assert.deepEqual(saved.calls, [[view, 'save']], 'save reaches the save of this row alone');

      const discarded = tripleFor(view, 'discard');
      assert.equal(discarded.answer, true, 'a discarded exit proceeds');
      assert.deepEqual(discarded.calls, [[view, 'discard']], 'discard reaches its own discard');

      const cancelled = tripleFor(view, 'cancel');
      assert.strictEqual(cancelled.answer, false, 'a cancelled exit stays put');
      assert.deepEqual(cancelled.calls, [], 'neither the save nor the discard ran');
    });
  }
});

describe('the microtask cost of a dirty exit', () => {
  it('settles inside the drain the mounted suites use, wherever the dirty row sits', async () => {
    // `settleRouteExit` in `tests/components/manager-mounted-shared.js` drains 24 turns. Exactly
    // one row can be active — twelve compare the single `activeView` token and the checks row
    // reads a `currentView` derived from it — so this IS the reachable worst case; a synthetic
    // thirteen-dirty-row table costs about 59 turns, which no state of the shell reaches.
    for (const guard of ROUTE_EXIT_GUARDS) {
      const { view } = guard;
      const context = contextOf({
        [view]: prompting({
          confirm: () => Promise.resolve('discard'),
          finish: () => Promise.resolve(true),
          save: () => Promise.resolve(true),
        }),
      });
      const result = confirmRouteExitGuards(buildRouteExitGuards(context), 'systems');
      const depth = await microtaskDepthOf(result);
      // Each position costs the same, whichever row is dirty: a shared finisher resolves one turn
      // sooner than a row's own async one, and no row pays for the twelve it is asked beside.
      assert.equal(
        depth,
        guard.finish === 'scoped-entry' ? 3 : 5,
        `a dirty ${view} exit settles in ${depth} turns, against the 24 drained`
      );
    }
  });
});
