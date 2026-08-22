import assert from 'node:assert/strict';
import test from 'node:test';

import {
  ALIGNABLE_EDGES,
  EDGE_TOLERANCE_PX,
  alignmentProblems,
  edgeSpread,
  locatorProblems,
  sharedEdges,
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
      { name: 'lonely', screen: 'roll', edges: ['top'], regions: ['card-body'] },
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
