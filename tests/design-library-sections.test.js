/** Fixture proof for `tests/helpers/designLibrarySections.js` (issue 1487). */
import assert from 'node:assert/strict';
import test from 'node:test';

import { parseDesignLibrary } from './helpers/designLibrary.js';
import { readLibrarySections } from './helpers/designLibrarySections.js';

/**
 * `<Anchored>` sits inside `section#controls`, the prose entry inside no section, and
 * `section#ruledout` follows both. The first section gives `controls` twice, the last gives
 * `ruledout` twice and a position-tracking walk gives `controls` twice; only each heading's own
 * ancestor gives `controls` then `null`.
 */
const FIXTURE = [
  '<!doctype html><html><head><style>section{display:block}</style></head><body>',
  '<section id="controls">',
  '<div class="sec-head"><span class="num">06</span><h2>Controls &amp; inputs</h2></div>',
  '<p class="lede">Every API\n  below.</p>',
  '<div class="spec"><div class="spec-head"><h4>&lt;Anchored&gt;</h4>',
  '<p class="why">Cites <code>&lt;CitedInWhy&gt;</code>.</p></div></div>',
  '</section>',
  '<div class="spec"><div class="spec-head"><h4>Depth &amp; interaction</h4></div></div>',
  '<section id="ruledout"><span class="k-mono">&lt;Declined&gt;</span></section>',
  '</body></html>',
].join('');

const read = readLibrarySections(FIXTURE);

test('each heading reports its own enclosing section, or nothing', () => {
  assert.ok(FIXTURE.includes('id="controls"'), 'no enclosing section for the anchored entry');
  assert.ok(FIXTURE.includes('id="ruledout"'), 'no second section, so a constant answer passes');
  assert.deepEqual(read.headingSections, ['controls', null]);
});

test('the section list is positional against the parser’s headings', () => {
  const { headings } = parseDesignLibrary(FIXTURE);
  assert.deepEqual(headings, ['<Anchored>', 'Depth & interaction']);
  assert.equal(
    read.headingSections.length,
    headings.length,
    'a length mismatch silently reassigns every entry after the gap to another section'
  );
});

test('a section reports its number, decoded title and ledes, and null where it draws no head', () => {
  assert.deepEqual(read.sections, [
    { id: 'controls', number: '06', title: 'Controls & inputs', ledes: ['Every API below.'] },
    { id: 'ruledout', number: null, title: null, ledes: [] },
  ]);
});

test('a nested .sec-head, .num or .lede cannot stand in for the section’s own', () => {
  const { sections } = readLibrarySections(
    [
      '<body><section id="outer">',
      '<div class="spec"><div class="sec-head"><span class="num">99</span><h2>Nested</h2></div>',
      '<p class="lede">Nested</p></div>',
      '<div class="sec-head"><span class="num">07</span><h2>Own</h2></div>',
      '</section></body>',
    ].join('')
  );
  assert.deepEqual(sections, [{ id: 'outer', number: '07', title: 'Own', ledes: [] }]);
});
