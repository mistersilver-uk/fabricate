/**
 * Fixture proof for `tests/helpers/designLibrary.js`.
 *
 * WHY A FIXTURE AND NOT THE CORPUS
 * --------------------------------
 * The parser anchors on `div.spec-head > h4`. The two mistakes it has to be immune to are widening
 * the anchor to the whole `spec-head` div — `p.why` sits inside it — and widening it to the whole
 * file, where section 15's nine declined candidates are written in the same `&lt;Name&gt;` notation
 * as the entries.
 *
 * Measured against the real library, the div-scoped mistake DOES currently red the occurrence floor
 * in `tests/design-system-coverage.test.js`: 59 against 58. But it reds for one reason only — the
 * `<SelectionBar>` entry's `why` happens to cite `<TintPicker>`, which is also a heading elsewhere.
 * That is a coincidence, not a detector. Reword or drop that one sentence and both scopings agree
 * on every corpus floor, at which point nothing distinguishes a correct parser from a contaminated
 * one. This fixture is the part that survives that reword, so it is authored to make each mistake
 * produce a DIFFERENT answer by construction rather than by luck.
 *
 * Each property below therefore carries its own negative control: it shows the fixture contains the
 * thing being excluded before asserting that the parser excluded it. Without that, every assertion
 * here would pass just as happily over a fixture with nothing to exclude.
 */
import assert from 'node:assert/strict';
import test from 'node:test';

import { Window } from 'happy-dom';

import { parseDesignLibrary, primitiveNamesIn } from './helpers/designLibrary.js';

/**
 * A design library in miniature, carrying one instance of each hazard.
 *
 * `<Anchored>` is an entry. `<CitedInWhy>` is a citation inside the entry's own `spec-head` div.
 * `<Declined>` stands for the section 15 register, outside any `spec-head`. The `<style>` block
 * mentions `.spec-head` the way the real page's stylesheet does, so a parser matching the literal
 * string rather than the element over-counts blocks. The prose heading carries an entity so the
 * decoding is exercised where it matters — the heading census pins these by text.
 *
 * `<Alpha> <Beta>` is the multi-name shape, and it is here because the CORPUS cannot supply it: no
 * library block is `divergent` today, and a block whose names all agree proves nothing about a
 * record that is kept per name. It carries two different statuses with the weaker of them on the
 * block, so the roll-up the coverage gate applies has a document to read.
 *
 * The chips are written in the page's own class form (`st st-<status>`) rather than in a shape
 * invented here, so a rule that stopped matching them would show up against this fixture too.
 */
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

/**
 * The same fixture with every status attribute stripped, and nothing else changed.
 *
 * The point of the properties below is that a MISSING status is reported as `null` rather than
 * defaulted, and a fixture that only ever carries them cannot show that. Derived from the fixture
 * by deletion so the two can never describe different documents.
 */
const UNDECLARED_FIXTURE = FIXTURE.replaceAll(/ data-status(-[A-Za-z]+)?="[a-z]+"/g, '');

const parsed = parseDesignLibrary(FIXTURE);

/**
 * The names a `spec-head` DIV-scoped parser would yield from the fixture — the mistake, run.
 *
 * Computed here rather than asserted as a literal so the control cannot drift away from the
 * fixture it is meant to characterise.
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
  // The fixture writes `data-status-Anchored`. Nothing may require an author to write the
  // attribute lowercased to be seen, because a name spelled `<ArtPathPicker>` is unreadable that
  // way and an unreadable attribute is one that gets typed wrong.
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
  // The whole reason the chip is a SIBLING of the `h4`. Inside one it would be read as heading
  // text, and for a NAMING heading nothing else notices: the census in
  // `tests/design-system-coverage.test.js` pins verbatim text for the PROSE headings alone, and a
  // chip yields no name, so every name-derived property answers exactly the same. `heading` is the
  // field that gate compares against the names, which is what makes the placement checkable.
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
