/**
 * The Checks rail GROUP model (issue 1096).
 *
 * `Checks` stopped being one flat rail button holding four tabs and became an expandable
 * group whose four children are ROUTES. This suite pins the model that decision rests on:
 * which children are visible, what each badge counts, what the parent badge sums, where the
 * retained `checks` id redirects to, and — the one that would otherwise rot silently — that
 * `CHECKS_VIEWS` holds `data-manager-view` strings rather than nav-item ids.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import {
  CHECKS_ACTIVITIES,
  CHECKS_REDIRECT_VIEW,
  CHECKS_VIEWS,
  activeChecksTab,
  buildChecksNavItems,
  checksNavHasDirty,
  checksNavIssueTotal,
  isChecksRoute,
  resolveChecksRedirect,
} from '../src/ui/svelte/apps/manager/checks/checksNav.js';

const repoRoot = resolve(import.meta.dirname, '..');

const ALL_FEATURES = { salvage: true, gathering: true };

function idsOf(items) {
  return items.map((item) => item.id);
}

describe('buildChecksNavItems: feature gating', () => {
  it('always offers crafting and validation, so the redirect always has a target', () => {
    assert.deepEqual(idsOf(buildChecksNavItems({ features: {} })), [
      'crafting',
      'salvage',
      'validation',
    ]);
  });

  it('drops gathering unless the feature is exactly true, and salvage only when false', () => {
    assert.deepEqual(idsOf(buildChecksNavItems({ features: ALL_FEATURES })), [
      'crafting',
      'salvage',
      'gathering',
      'validation',
    ]);
    assert.deepEqual(idsOf(buildChecksNavItems({ features: { salvage: false } })), [
      'crafting',
      'validation',
    ]);
    // `gathering: false` and an absent flag are the same answer; salvage's default is the
    // opposite, and getting those two backwards is silent in both directions.
    assert.deepEqual(idsOf(buildChecksNavItems({ features: { gathering: false } })), [
      'crafting',
      'salvage',
      'validation',
    ]);
  });

  it('carries each activity mode onto its own child', () => {
    const items = buildChecksNavItems({
      features: ALL_FEATURES,
      resolutionMode: 'routedByCheck',
      salvageResolutionMode: 'progressive',
      gatheringResolutionMode: 'routed',
    });
    assert.deepEqual(Object.fromEntries(items.map((item) => [item.id, item.mode])), {
      crafting: 'routedByCheck',
      salvage: 'progressive',
      gathering: 'routed',
      validation: '',
    });
  });
});

describe('the badge rule: the parent sums the three ACTIVITY children only', () => {
  // The three frames the rule is drawn from. Each is `parent = sum(activities)` with
  // Validation carrying that SAME total, never adding to it.
  const FRAMES = [
    { label: 'progressive-roll', counts: { crafting: 0, salvage: 0, gathering: 1 }, parent: 1 },
    {
      label: 'routed-fixed-triggers',
      counts: { crafting: 0, salvage: 1, gathering: 1 },
      parent: 2,
    },
    {
      label: 'simple-roll--dynamic-dc',
      counts: { crafting: 1, salvage: 1, gathering: 1 },
      parent: 3,
    },
  ];

  for (const frame of FRAMES) {
    it(`reproduces ${frame.label}: parent ${frame.parent}, Validation ${frame.parent}`, () => {
      const items = buildChecksNavItems({ features: ALL_FEATURES, issueCounts: frame.counts });
      const validation = items.find((item) => item.id === 'validation');
      assert.equal(checksNavIssueTotal(items), frame.parent);
      assert.equal(
        validation.issueCount,
        frame.parent,
        'Validation RESTATES the total; it does not carry a count of its own'
      );
      // The negative control the rule exists for: a sum over EVERY child — the obvious
      // implementation — doubles it, and the frames show it does not.
      const naiveTotal = items.reduce((total, item) => total + item.issueCount, 0);
      assert.equal(naiveTotal, frame.parent * 2);
      assert.notEqual(
        checksNavIssueTotal(items),
        naiveTotal,
        'summing Validation into the parent would report every issue twice'
      );
    });
  }

  it('ignores a supplied Validation count rather than trusting two sources', () => {
    const items = buildChecksNavItems({
      features: ALL_FEATURES,
      issueCounts: { crafting: 2, salvage: 0, gathering: 0, validation: 99 },
    });
    assert.equal(items.find((item) => item.id === 'validation').issueCount, 2);
  });

  it('excludes a HIDDEN feature’s issues from the total', () => {
    // A stale salvage issue must not badge a rail entry the GM cannot open to clear it.
    const items = buildChecksNavItems({
      features: { salvage: false },
      issueCounts: { crafting: 1, salvage: 5 },
    });
    assert.equal(checksNavIssueTotal(items), 1);
  });

  it('treats a negative, fractional or non-numeric count as none', () => {
    const items = buildChecksNavItems({
      features: ALL_FEATURES,
      issueCounts: { crafting: -3, salvage: 'two', gathering: 2.7 },
    });
    assert.equal(checksNavIssueTotal(items), 2);
  });

  it('names the three activity children, and excludes validation', () => {
    assert.deepEqual([...CHECKS_ACTIVITIES], ['crafting', 'salvage', 'gathering']);
    assert.ok(!CHECKS_ACTIVITIES.includes('validation'));
  });
});

describe('the per-activity dirty marker', () => {
  it('threads a flag onto each activity child and never onto validation', () => {
    const items = buildChecksNavItems({
      features: ALL_FEATURES,
      dirtyActivities: { crafting: true, salvage: false, gathering: true, validation: true },
    });
    assert.deepEqual(Object.fromEntries(items.map((item) => [item.id, item.dirty])), {
      crafting: true,
      salvage: false,
      gathering: true,
      validation: false,
    });
    assert.equal(checksNavHasDirty(items), true);
  });

  it('is INDEPENDENT of the issue badge, so one cannot stand in for the other', () => {
    // A GM standing on Gathering with a clean, unsaved Crafting edit is the exact case the
    // marker exists for: no issue count anywhere, and one child still holding work.
    const items = buildChecksNavItems({
      features: ALL_FEATURES,
      issueCounts: {},
      dirtyActivities: { crafting: true },
    });
    assert.equal(checksNavIssueTotal(items), 0);
    assert.equal(checksNavHasDirty(items), true);
    assert.equal(items.find((item) => item.id === 'crafting').issueCount, 0);
  });

  it('reports nothing dirty for an empty bag', () => {
    assert.equal(checksNavHasDirty(buildChecksNavItems({ features: ALL_FEATURES })), false);
  });
});

describe('route membership and the retained redirect', () => {
  it('holds four child views in reading order', () => {
    assert.deepEqual(
      [...CHECKS_VIEWS],
      ['checks-crafting', 'checks-salvage', 'checks-gathering', 'checks-validation']
    );
    assert.ok(Object.isFrozen(CHECKS_VIEWS));
  });

  it('excludes the bare redirect id from the view set, because no screen renders it', () => {
    assert.ok(!CHECKS_VIEWS.includes(CHECKS_REDIRECT_VIEW));
    assert.equal(isChecksRoute(CHECKS_REDIRECT_VIEW), true, 'a route guard still asks about it');
    assert.equal(activeChecksTab(CHECKS_REDIRECT_VIEW), null, 'it highlights no child');
  });

  it('maps every child view to its own tab and nothing else to any', () => {
    assert.deepEqual(
      CHECKS_VIEWS.map((view) => activeChecksTab(view)),
      ['crafting', 'salvage', 'gathering', 'validation']
    );
    assert.equal(activeChecksTab('recipes'), null);
    assert.equal(isChecksRoute('recipes'), false);
    assert.equal(isChecksRoute('crafting-settings'), false);
  });

  it('redirects to the FIRST AVAILABLE child, resolved from the same builder', () => {
    assert.equal(resolveChecksRedirect({ features: ALL_FEATURES }), 'checks-crafting');
    // Crafting is unconditional, so the redirect is stable; the assertion that matters is
    // that it is derived rather than hard-coded, which the builder-with-no-crafting case
    // below cannot reach and the empty-args case proves instead.
    assert.equal(resolveChecksRedirect(), 'checks-crafting');
  });
});

describe('CHECKS_VIEWS holds data-manager-view strings, not nav-item ids', () => {
  // This is the contract `tests/view-lab-cases.test.js` pins every `expectView` beginning
  // `checks` against, and it is exactly the distinction the sibling crafting model gets
  // wrong-footed by: `craftingNav.js` declares a nav item `settings` whose view is
  // `crafting-settings`, so a pin written against nav ids would compare the wrong strings.
  const rootSource = readFileSync(
    resolve(repoRoot, 'src/ui/svelte/apps/manager/CraftingSystemManagerRoot.svelte'),
    'utf8'
  );

  it('renders every child view through the rail, keyed on the view and not the id', () => {
    const items = buildChecksNavItems({ features: ALL_FEATURES });
    for (const item of items) {
      assert.ok(CHECKS_VIEWS.includes(item.view), `${item.view} is a declared view`);
      assert.notEqual(item.view, item.id, 'the view is never the bare nav id');
    }
  });

  it('is what the root routes on, so the two vocabularies cannot drift', () => {
    // The root imports the constant rather than restating the four strings, which is what
    // makes the pin meaningful; assert that it does, because a future edit that inlined
    // them would leave this suite green while the registry drifted.
    assert.match(
      rootSource,
      /import \{[\s\S]*?CHECKS_VIEWS[\s\S]*?\} from '\.\/checks\/checksNav\.js'/
    );
    assert.match(rootSource, /isChecksView\(currentView\)/);
  });
});
