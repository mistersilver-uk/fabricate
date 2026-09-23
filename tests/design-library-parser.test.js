/** Fixture proof for `tests/helpers/designLibrary.js`. */
import assert from 'node:assert/strict';
import test from 'node:test';

import { Window } from 'happy-dom';

import { parseDesignLibrary, primitiveNamesIn } from './helpers/designLibrary.js';

/** A design library in miniature, carrying one instance of each hazard. */
const FIXTURE = [
  '<!doctype html><html><head>',
  '<style>.spec-head{display:flex}.spec-head h4{margin:0}.spec-head .why{font-size:12px}</style>',
  '</head><body>',
  '<div class="spec" data-status="shipped" data-status-Anchored="shipped">',
  '<div class="spec-head"><h4>&lt;Anchored&gt;</h4><span class="st st-shipped">shipped</span>',
  '<p class="why">Its dense variant exists only for <code>&lt;CitedInWhy&gt;</code>.</p></div></div>',
  '<div class="spec" data-status="divergent" data-status-Alpha="divergent" data-status-Beta="shipped">',
  '<div class="spec-head"><h4>&lt;Alpha&gt; &lt;Beta&gt;</h4>',
  '<span class="st st-divergent">Alpha &middot; divergent</span>',
  '<span class="st st-shipped">Beta &middot; shipped</span></div></div>',
  '<div class="spec" data-status="prose"><div class="spec-head"><h4>Depth &amp; interaction</h4>',
  '</div></div>',
  '<section id="ruledout"><span class="k-mono">&lt;Declined&gt;</span>',
  '<p class="k-hint">Composes out of members already in the set.</p></section>',
  '</body></html>',
].join('');

/** The same fixture with every status attribute stripped, and nothing else changed. */
const UNDECLARED_FIXTURE = FIXTURE.replaceAll(/ data-status(-[A-Za-z]+)?="[a-z]+"/g, '');

const parsed = parseDesignLibrary(FIXTURE);

/**
 * The names a `spec-head` DIV-scoped parser would yield from the fixture — the mistake, run.
 *
 * @returns {string[]} names, duplicates included
 */
function namesUnderDivScoping() {
  const window = new Window();
  window.document.write(FIXTURE);
  const names = [...window.document.querySelectorAll('div.spec-head')].flatMap((block) =>
    primitiveNamesIn(block.textContent)
  );
  window.close();
  return names;
}

test('the fixture actually contains each hazard, so the exclusions below are not vacuous', () => {
  assert.ok(FIXTURE.includes('.spec-head'), 'no stylesheet mention of the class to be ignored');
  assert.ok(FIXTURE.includes('&lt;CitedInWhy&gt;'), 'no citation inside a spec-head div');
  assert.ok(FIXTURE.includes('&lt;Declined&gt;'), 'no name-shaped token outside a spec-head div');
  assert.deepEqual(
    namesUnderDivScoping(),
    ['Anchored', 'CitedInWhy', 'Alpha', 'Beta'],
    'div scoping no longer picks the why citation up, so it is no longer the mistake this ' +
      'fixture discriminates against and the fixture needs rebuilding'
  );
});

test('the anchor is the h4, so a citation in the entry’s own why is not an entry', () => {
  assert.deepEqual(parsed.names, ['Alpha', 'Anchored', 'Beta']);
  assert.equal(parsed.nameOccurrences, 3);
  assert.ok(
    parsed.fileWideNames.includes('CitedInWhy'),
    'the citation vanished entirely; the parser must still SEE it, and place it outside the set'
  );
  assert.ok(parsed.namesOutsideHeadings.includes('CitedInWhy'));
});

test('a name-shaped token outside every spec-head is not an entry', () => {
  assert.ok(!parsed.names.includes('Declined'), 'the ruled-out register entered the set');
  assert.deepEqual(parsed.namesOutsideHeadings, ['CitedInWhy', 'Declined']);
  assert.deepEqual(parsed.fileWideNames, ['Alpha', 'Anchored', 'Beta', 'CitedInWhy', 'Declined']);
});

test('blocks are elements, not occurrences of the class name in the stylesheet', () => {
  assert.equal(parsed.blockCount, 3, 'the three stylesheet rules were counted as blocks');
  assert.equal(parsed.headingCount, 3);
});

test('headings are reported decoded, which is what the census pins', () => {
  assert.deepEqual(parsed.headings, ['<Anchored>', '<Alpha> <Beta>', 'Depth & interaction']);
  assert.deepEqual(parsed.nonPrimitiveHeadings, ['Depth & interaction']);
});

test('a block reports its own status and each of its names against a per-name status', () => {
  assert.deepEqual(
    parsed.blocks.map((block) => block.status),
    ['shipped', 'divergent', 'prose'],
    'a block no longer reports the `data-status` its own element carries'
  );
  assert.deepEqual(parsed.blocks[0].perNameStatus, { Anchored: 'shipped' });
  assert.deepEqual(
    parsed.blocks[0].names,
    ['Anchored'],
    'the per-name record is keyed on the heading names, so it inherits the h4 anchor rather ' +
      'than re-deriving one'
  );
});

test('a heading naming two primitives gives each name its own status', () => {
  // The shape the coverage gate's roll-up reads, and the one the corpus cannot show: every library
  // block there declares one value across all of its names, so a parser that dropped the second
  // name, or answered both names from the block attribute, would still satisfy that gate.
  assert.deepEqual(parsed.blocks[1].names, ['Alpha', 'Beta']);
  assert.deepEqual(parsed.blocks[1].perNameStatus, { Alpha: 'divergent', Beta: 'shipped' });
  assert.equal(
    parsed.blocks[1].status,
    'divergent',
    'the block carries the weaker of the two values, which is the relation the coverage gate ' +
      'derives rather than trusts — report it as written and it can be checked'
  );
});

test('the per-name lookup folds case, because the DOM does', () => {
  // The fixture writes `data-status-Anchored`.
  assert.ok(
    FIXTURE.includes('data-status-Anchored='),
    'the fixture no longer writes the attribute in the name’s own case, so this proves nothing'
  );
  assert.equal(parsed.blocks[0].perNameStatus.Anchored, 'shipped');
});

test('a block that declares no status reports null, and is not defaulted', () => {
  assert.ok(
    !UNDECLARED_FIXTURE.includes('data-status'),
    'the stripped fixture still carries a status attribute, so the substitution missed'
  );
  assert.equal(
    [...FIXTURE.matchAll(/ data-status(-[A-Za-z]+)?="/g)].length,
    6,
    'the substitution above is characterised by what it removes, so the count it removes is ' +
      'stated here: three block statuses and three per-name statuses'
  );
  const undeclared = parseDesignLibrary(UNDECLARED_FIXTURE);
  assert.deepEqual(
    undeclared.blocks.map((block) => block.status),
    [null, null, null],
    'a missing status was answered with a value nobody wrote, which is the defect the coverage ' +
      'gate reads this field to catch'
  );
  assert.deepEqual(undeclared.blocks[0].perNameStatus, { Anchored: null });
});

test('the chip beside the h4 is not part of the heading a block reports', () => {
  // The whole reason the chip is a SIBLING of the `h4`.
  assert.ok(
    FIXTURE.includes('<span class="st st-shipped">shipped</span>'),
    'the fixture has no chip'
  );
  assert.deepEqual(
    parsed.blocks.map((block) => block.heading),
    ['<Anchored>', '<Alpha> <Beta>', 'Depth & interaction'],
    'a block no longer reports the text of its own heading, so nothing can compare that text ' +
      'against the names the heading yields'
  );
  assert.equal(parsed.nameOccurrences, 3, 'the chip contributed a name-shaped token');
});
