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
 */
const FIXTURE = [
  '<!doctype html><html><head>',
  '<style>.spec-head{display:flex}.spec-head h4{margin:0}.spec-head .why{font-size:12px}</style>',
  '</head><body>',
  '<div class="spec"><div class="spec-head"><h4>&lt;Anchored&gt;</h4>',
  '<p class="why">Its dense variant exists only for <code>&lt;CitedInWhy&gt;</code>.</p></div></div>',
  '<div class="spec"><div class="spec-head"><h4>Depth &amp; interaction</h4></div></div>',
  '<section id="ruledout"><span class="k-mono">&lt;Declined&gt;</span>',
  '<p class="k-hint">Composes out of members already in the set.</p></section>',
  '</body></html>',
].join('');

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
    ['Anchored', 'CitedInWhy'],
    'div scoping no longer picks the why citation up, so it is no longer the mistake this ' +
      'fixture discriminates against and the fixture needs rebuilding'
  );
});

test('the anchor is the h4, so a citation in the entry’s own why is not an entry', () => {
  assert.deepEqual(parsed.names, ['Anchored']);
  assert.equal(parsed.nameOccurrences, 1);
  assert.ok(
    parsed.fileWideNames.includes('CitedInWhy'),
    'the citation vanished entirely; the parser must still SEE it, and place it outside the set'
  );
  assert.ok(parsed.namesOutsideHeadings.includes('CitedInWhy'));
});

test('a name-shaped token outside every spec-head is not an entry', () => {
  assert.ok(!parsed.names.includes('Declined'), 'the ruled-out register entered the set');
  assert.deepEqual(parsed.namesOutsideHeadings, ['CitedInWhy', 'Declined']);
  assert.deepEqual(parsed.fileWideNames, ['Anchored', 'CitedInWhy', 'Declined']);
});

test('blocks are elements, not occurrences of the class name in the stylesheet', () => {
  assert.equal(parsed.blockCount, 2, 'the three stylesheet rules were counted as blocks');
  assert.equal(parsed.headingCount, 2);
});

test('headings are reported decoded, which is what the census pins', () => {
  assert.deepEqual(parsed.headings, ['<Anchored>', 'Depth & interaction']);
  assert.deepEqual(parsed.nonPrimitiveHeadings, ['Depth & interaction']);
});
