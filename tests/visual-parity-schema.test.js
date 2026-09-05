import assert from 'node:assert/strict';
import test from 'node:test';

import {
  inventoryCoverageProblems,
  inventoryRootProblems,
} from '../scripts/visual-parity/lib/inventory.js';
import {
  ALIGNABLE_EDGES,
  EDGE_TOLERANCE_PX,
  MAX_TOLERANCE_PX,
  alignmentProblems,
  classifyDifference,
  edgeSpread,
  locatorProblems,
  sharedEdges,
  toleranceProblems,
} from '../scripts/visual-parity/lib/schema.js';
import { subjectProblems } from '../scripts/visual-parity/lib/subject.js';

// The visual-parity harness runs locally and never in CI, so the parts of it that CAN be
// tested in the Node runner are the pure ones: the rules that keep a spec honest. Everything
// here is a rule that has already cost a round, stated as an assertion.
//
// `alignments` and `locatorProblems` are both from the same rework (issue 1096 follow-up): the
// first is the class of defect a per-region measurement cannot express, and the second is what
// made a locator DATA instead of JavaScript reconstituted in the page with `new Function`.

const SPEC = () => ({
  screens: ['roll'],
  regions: [
    { name: 'card-body', screen: 'roll', groups: ['box'], locator: '.card .body' },
    { name: 'tier-body', screen: 'roll', groups: ['box'], locator: '.tiers .body' },
    { name: 'rail', screen: 'roll', measuredOn: 'inspector', groups: ['box'], locator: '.rail' },
  ],
  alignments: [
    { name: 'bodies', screen: 'roll', edges: ['left', 'right'], regions: ['card-body', 'tier-body'] },
  ],
});

test('an alignment group is the rule a per-region measurement cannot express', async (subtests) => {
  await subtests.test('a well-formed group has no problems', () => {
    assert.deepEqual(alignmentProblems(SPEC()), []);
  });

  await subtests.test('a group naming an undeclared region fails', () => {
    const spec = SPEC();
    spec.alignments[0].regions = ['card-body', 'no-such-region'];
    assert.ok(
      alignmentProblems(spec).some((problem) => problem.includes('"no-such-region" is not declared')),
      'a group that names nothing measurable must fail rather than assert nothing'
    );
  });

  await subtests.test('a group whose members are measured on different screens fails', () => {
    const spec = SPEC();
    spec.alignments[0].regions = ['card-body', 'rail'];
    assert.ok(
      alignmentProblems(spec).some((problem) =>
        problem.includes('never on screen together share no edge')
      ),
      'two boxes that were never on screen at once cannot share an edge'
    );
  });

  await subtests.test('a group needs two regions and a known edge', () => {
    const spec = SPEC();
    spec.alignments = [
      { name: 'lonely', screen: 'roll', edges: ['bottom'], regions: ['card-body'] },
    ];
    const problems = alignmentProblems(spec);
    assert.ok(
      problems.some((problem) => problem.includes('at least two regions')),
      'one box shares an edge with nothing'
    );
    assert.ok(
      problems.some((problem) => problem.includes(`not one of ${ALIGNABLE_EDGES.join(', ')}`)),
      'an unknown edge would silently assert nothing'
    );
  });

  await subtests.test('`top` is alignable and `bottom` is not, and the difference is stated', () => {
    // Two cards drawn SIDE BY SIDE in one grid row share a top edge, and a row gap or a stray
    // `margin-top` on one of them is an ancestor-owned inset of exactly the class this rule
    // exists for. A shared BOTTOM edge is not the same claim: two cards in a row end at
    // different heights because their CONTENT differs, which is a fact about the world's data.
    assert.ok(ALIGNABLE_EDGES.includes('top'));
    assert.ok(!ALIGNABLE_EDGES.includes('bottom'));
    const spec = SPEC();
    spec.alignments = [
      { name: 'card-tops', screen: 'roll', edges: ['top'], regions: ['card-body', 'tier-body'] },
    ];
    assert.deepEqual(alignmentProblems(spec), []);
  });
});

test('edge agreement is measured, not assumed', async (subtests) => {
  await subtests.test('boxes within the tolerance share the edge', () => {
    const edges = {
      'card-body': { left: 464, right: 1366 },
      'tier-body': { left: 464.3, right: 1366 },
    };
    assert.deepEqual(sharedEdges(edges, ['left', 'right']), { left: true, right: true });
  });

  await subtests.test('the 12px inset that motivated the rule is NOT within the tolerance', () => {
    // The shipped defect: `CraftingCheckEditor` wrapped its tier list in the bare
    // `.manager-inspector-card` shell, whose 12px padding inset every tier row past the
    // Difficulty card's content above it. Every region on that screen still measured right.
    const edges = {
      'roll-card-body': { left: 464, right: 1366 },
      'roll-tier-inset': { left: 476, right: 1354 },
    };
    assert.deepEqual(sharedEdges(edges, ['left', 'right']), { left: false, right: false });
    const spread = edgeSpread(edges, 'left');
    assert.equal(spread.delta, 12);
    assert.equal(spread.high, 'roll-tier-inset', 'the report names the box that moved');
    assert.equal(spread.low, 'roll-card-body', 'and the box it should have lined up with');
  });

  await subtests.test('a row gap one card does not share is reported on the top edge', () => {
    // The vertical half of the same defect: the prototype lays a Category card and a Tags card
    // out with level tops, and a subject that gives one of them 8px of its own margin measures
    // every property inside both cards correctly and still draws a staggered row.
    const edges = {
      'rules-category-card': { left: 24, right: 520, top: 196 },
      'rules-tags-card': { left: 536, right: 1032, top: 204 },
    };
    assert.deepEqual(sharedEdges(edges, ['top']), { top: false });
    const spread = edgeSpread(edges, 'top');
    assert.equal(spread.delta, 8);
    assert.equal(spread.high, 'rules-tags-card', 'the report names the card that dropped');
  });

  await subtests.test('the tolerance is sub-pixel, an order below the smallest spacing token', () => {
    assert.ok(EDGE_TOLERANCE_PX < 4, 'a tolerance a spacing mistake can hide under gates nothing');
  });
});

test('a locator is DATA, and the schema refuses anything else', async (subtests) => {
  await subtests.test('a CSS selector and a well-formed step list both pass', () => {
    assert.deepEqual(locatorProblems('.manager-checks-card', 'region x'), []);
    assert.deepEqual(
      locatorProblems(
        [
          { op: 'select', css: 'div.sc' },
          { op: 'where', rect: { minWidth: 301 } },
          { op: 'child', index: -1 },
        ],
        'region x'
      ),
      []
    );
  });

  await subtests.test('an unknown op fails rather than throwing inside the page', () => {
    const problems = locatorProblems([{ op: 'evaluate', code: 'alert(1)' }], 'region x');
    assert.ok(
      problems.some((problem) => problem.includes('a locator is data, never an expression')),
      'the closed vocabulary is what stops a fixture expressing code'
    );
  });

  await subtests.test('a filter key nothing reads fails, because it would widen the locator', () => {
    const problems = locatorProblems([{ op: 'where', txt: { equals: 'Difficulty' } }], 'region x');
    assert.ok(
      problems.some((problem) => problem.includes('which no filter reads')),
      'a mistyped predicate matches everything, which is worse than matching nothing'
    );
  });

  await subtests.test('an empty locator fails', () => {
    assert.equal(locatorProblems([], 'region x').length, 1);
    assert.equal(locatorProblems('   ', 'region x').length, 1);
  });
});

test('the subject is the real app, and a spec still carrying the mirror fails', async (subtests) => {
  await subtests.test('open and navigate are required', () => {
    const problems = subjectProblems({ subject: {} });
    assert.equal(problems.length, 2, 'both halves of "boot it and drive it" are required');
    assert.ok(problems.some((problem) => problem.includes('spec.subject.open')));
    assert.ok(problems.some((problem) => problem.includes('spec.subject.navigate')));
  });

  await subtests.test('a retired markup mirror is named rather than ignored', () => {
    // A mirror does not fail; it drifts. This one drifted into modelling a component that was
    // never broken, so a spec that still carries one must say so out loud.
    const problems = subjectProblems({
      subject: { open() {}, navigate() {}, screens: { roll: () => '<div></div>' } },
    });
    assert.equal(problems.length, 1);
    assert.ok(problems[0].includes('RETIRED markup mirror'));
  });

  await subtests.test('a live subject passes', () => {
    assert.deepEqual(subjectProblems({ subject: { open() {}, navigate() {} } }), []);
  });
});

test('an inventory root may be a SET, and a set states its pane', async (subtests) => {
  const PANE = 'main.manager-main';

  await subtests.test('a single locator is still a root, and needs no pane', () => {
    assert.deepEqual(inventoryRootProblems('main.manager-main', 'root'), []);
    assert.deepEqual(
      inventoryRootProblems([{ op: 'select', css: 'main' }], 'root'),
      [],
      'a step list is a locator like any other'
    );
  });

  await subtests.test('a well-formed set with a pane passes', () => {
    assert.deepEqual(
      inventoryRootProblems(
        { parts: ['header.manager-header', 'main.manager-main', 'aside.manager-inspector'] },
        'root',
        PANE
      ),
      []
    );
  });

  await subtests.test('a set with no pane fails, because the first part would set the floor', () => {
    // The rule the runtime test measures: this product's header band is 1398px and its content
    // column 878px, so deriving the pane from the first part makes the ORDER of a list decide
    // the card floor. A default nobody chose is the whole class of defect the declared pane
    // closed, and a set re-opens it unless the pane is required.
    const problems = inventoryRootProblems({ parts: ['header', 'main'] }, 'root');
    assert.equal(problems.length, 1);
    assert.match(problems[0], /root SET must declare its pane/);
  });

  await subtests.test('an empty set fails rather than enumerating nothing', () => {
    const problems = inventoryRootProblems({ parts: [] }, 'root', PANE);
    assert.equal(problems.length, 1);
    assert.match(problems[0], /non-empty/);
  });

  await subtests.test('every part is checked as the locator it is', () => {
    const problems = inventoryRootProblems(
      { parts: ['header', [{ op: 'summon', css: 'main' }]] },
      'root',
      PANE
    );
    assert.equal(problems.length, 1);
    assert.match(problems[0], /root part 1: step 0 has op "summon"/);
  });
});

test('the ONE relaxation of exact equality is a unit conversion, and it is bounded', async (subtests) => {
  const TOLERANCES = { fontSize: { px: 0.15, reason: 'x'.repeat(40) } };

  await subtests.test('the rem-vs-px cluster this exists for is classified as rounding', () => {
    // The four real pairs from the round-2 logs: 0.72rem, 0.53rem, 0.63rem and 0.844rem against
    // the reference's absolute px.
    for (const [actual, expected] of [
      ['11.52px', '11.5px'],
      ['8.496px', '8.5px'],
      ['10.08px', '10px'],
      ['13.504px', '13.5px'],
    ]) {
      const verdict = classifyDifference('fontSize', actual, expected, TOLERANCES);
      assert.equal(verdict.verdict, 'rounding', `${actual} vs ${expected}`);
      assert.ok(verdict.delta <= 0.15, 'the reported delta is the measured one');
    }
  });

  await subtests.test('0.2px STILL REPORTS — the band cannot absorb a decision', () => {
    // The rule the whole mechanism turns on. A quarter of one half-point type step is a decision
    // somebody made, and the band is three times narrower than the smallest step any published
    // scale takes.
    assert.equal(classifyDifference('fontSize', '11.7px', '11.5px', TOLERANCES).verdict, 'drift');
    assert.equal(classifyDifference('fontSize', '11.52px', '11px', TOLERANCES).verdict, 'drift');
    assert.equal(classifyDifference('fontSize', '11.52px', '12px', TOLERANCES).verdict, 'drift');
  });

  await subtests.test('a property with no declared tolerance is exact, as it always was', () => {
    assert.equal(classifyDifference('paddingTop', '11.52px', '11.5px', TOLERANCES).verdict, 'drift');
    assert.equal(classifyDifference('fontSize', '11.52px', '11.5px', {}).verdict, 'drift');
    assert.equal(classifyDifference('fontSize', '11.5px', '11.5px', {}).verdict, 'same');
  });

  await subtests.test('a value that is not a plain px length is never rounding', () => {
    // There is no delta to be under a tolerance, so a colour or a keyword falls straight through
    // — otherwise a `normal`/`0px` pair or a two-part value could be absorbed by arithmetic that
    // never ran on it.
    const colours = { color: { px: 0.15, reason: 'x'.repeat(40) } };
    assert.equal(classifyDifference('color', 'rgb(1, 2, 3)', 'rgb(1, 2, 4)', colours).verdict, 'drift');
    const spacing = { letterSpacing: { px: 0.15, reason: 'x'.repeat(40) } };
    assert.equal(classifyDifference('letterSpacing', 'normal', '0.1px', spacing).verdict, 'drift');
  });

  await subtests.test('a tolerance is validated exactly as an exemption is', () => {
    const reason = 'x'.repeat(40);
    assert.deepEqual(toleranceProblems({ tolerances: { fontSize: { px: 0.15, reason } } }), []);

    const capped = toleranceProblems({ tolerances: { fontSize: { px: MAX_TOLERANCE_PX, reason } } });
    assert.equal(capped.length, 1);
    assert.match(capped[0], /at or over the 0.5px cap/);

    const unmeasured = toleranceProblems({ tolerances: { zIndex: { px: 0.1, reason } } });
    assert.equal(unmeasured.length, 1);
    assert.match(unmeasured[0], /no property group measures it/);

    const unreasoned = toleranceProblems({ tolerances: { fontSize: { px: 0.1, reason: 'noise' } } });
    assert.equal(unreasoned.length, 1);
    assert.match(unreasoned[0], /needs a stated reason/);

    const unnumbered = toleranceProblems({ tolerances: { fontSize: { px: 0, reason } } });
    assert.equal(unnumbered.length, 1);
    assert.match(unnumbered[0], /positive `px` number/);
  });
});

test('a screen the subject cannot show yet is stated, not fatal', async (subtests) => {
  const spec = (screenExtras) => ({
    screens: ['roll'],
    inventory: { roots: { roll: { prototype: '.p', subject: '.s', ...screenExtras } } },
  });

  await subtests.test('a root with a stated reason passes', () => {
    // WHY THE CHANNEL EXISTS AT ALL: a closed screen set legitimately runs ahead of the product
    // — a route that exists as a placeholder while the PR that owes it is open — and without
    // this the first such screen threw a raw Playwright error and killed the whole run. That is
    // not cosmetic: the stale-exemption check runs ONLY on a full pass, so for as long as one
    // screen aborted the run, no exemption in the spec was ever checked for outliving its
    // difference. On this spec, the first full pass after this landed rejected two.
    assert.deepEqual(inventoryCoverageProblems(spec({ unreachable: 'x'.repeat(40) })), []);
  });

  await subtests.test('a reason under the floor fails, exactly as every other reason does', () => {
    const problems = inventoryCoverageProblems(spec({ unreachable: 'later' }));
    assert.equal(problems.length, 1);
    assert.match(problems[0], /unreachable note needs a stated reason/);
  });

  await subtests.test('a root with no note is unaffected', () => {
    assert.deepEqual(inventoryCoverageProblems(spec({})), []);
  });
});
