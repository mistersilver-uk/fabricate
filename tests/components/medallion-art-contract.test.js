/** A MEDALLION THAT CARRIES ART SAYS WHAT THE ART IS FOR (issue 1506). */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { SOURCES } from '../helpers/primitiveAdoptionContract.js';
import { openingTagsNamed } from '../helpers/svelteTagScan.js';

/** The published name, and the alias it replaced. */
const ART = 'art';
const DEPRECATED_ALIAS = 'src';

/** THE THIRD WAY A CALL SITE PASSES ART, and the reason this is not just an attribute scan. */
const ART_RESOLVER = 'resolveCraftingArt(';

/** EVERY MEDALLION RENDER SITE IN `src/`, PINNED, so no clause below can pass over nothing. */
// #1648: RunDetail -1, StepDetails -2, ChoiceOptionList +1.
const MEDALLION_SITES = 84;

/** How many of them bind artwork at all. The rest are glyph-only and `alt` is moot for them. */
const ART_BEARING_SITES = 66;

/** `<Medallion …>` opening tags in `src/`, as `{ path, tag }`. */
const TAGS = Object.entries(SOURCES).flatMap(([path, source]) =>
  openingTagsNamed(source, 'Medallion').map((tag) => ({ path, tag }))
);

/**
 * Does this tag name `prop`, in either binding form?
 *
 * @param {string} tag one opening tag's source text
 * @param {string} prop the prop name
 * @returns {boolean}
 */
function names(tag, prop) {
  return (
    new RegExp(String.raw`(?<![\w-])${prop}=`).test(tag) ||
    new RegExp(String.raw`\{\s*${prop}\s*\}`).test(tag)
  );
}

/**
 * Does this tag pass artwork, by any of the three routes a call site has?
 *
 * @param {string} tag one opening tag's source text
 * @returns {boolean}
 */
function bindsArt(tag) {
  return names(tag, ART) || names(tag, DEPRECATED_ALIAS) || tag.includes(ART_RESOLVER);
}

describe('1506 the medallion art contract — its domain', () => {
  it('is every render site in `src/`, counted so the clauses below cannot be vacuous', () => {
    assert.equal(
      TAGS.length,
      MEDALLION_SITES,
      'the medallion render-site census moved. That is not itself wrong — this change converted ' +
        'two retired crafting tiles into it — but the count is what keeps the negative clauses ' +
        'below honest, so it is re-measured deliberately rather than left to drift.'
    );
    assert.equal(
      TAGS.filter(({ tag }) => bindsArt(tag)).length,
      ART_BEARING_SITES,
      'the art-bearing population moved; the rest of the sites are glyph-only, where `alt` is moot'
    );
  });
});

describe('1506 the medallion art contract — `alt` is a decision, not a default', () => {
  it('is named at every call site that passes artwork, in either spelling', () => {
    const silent = TAGS.filter(({ tag }) => bindsArt(tag) && !names(tag, 'alt')).map(
      ({ path, tag }) => `${path}: ${tag.replaceAll(/\s+/g, ' ')}`
    );

    assert.deepEqual(
      silent,
      [],
      'a medallion passing artwork must say what the artwork is for. `alt=""` is the right answer ' +
        'wherever the record name is adjacent text, which is every shipped site — but it has to ' +
        'be WRITTEN, because an absent attribute is an author who never asked the question.'
    );
  });

  it('cannot be escaped by reaching for the deprecated alias, and the alias is unused', () => {
    // The clause above already covers the alias.
    assert.deepEqual(
      TAGS.filter(({ tag }) => names(tag, DEPRECATED_ALIAS)).map(({ path }) => path),
      [],
      'no site in `src/` spells the deprecated `src` alias; they were all renamed with the prop'
    );
  });

  it('reads a tag it has never seen, in both directions', () => {
    // THE DISCRIMINATION CLAUSE. Both clauses above are negatives over a corpus whose whole point
    // is that it contains no positive case, so a detector that had silently stopped matching
    // would report clean and read exactly like a completed conversion. It is therefore driven
    // over sources with a KNOWN answer.
    const fixture = [
      '<Medallion art={row.img} icon="fas fa-cube" size={40} />',
      '<Medallion src={row.img} size={40} />',
      '<Medallion art={row.img} alt="" size={40} />',
      '<Medallion {art} {alt} size={40} />',
      '<Medallion {...resolveCraftingArt(row.img)} size={40} />',
      '<Medallion icon="fas fa-cube" size={40} />',
    ].join('\n');
    const tags = openingTagsNamed(fixture, 'Medallion');
    assert.equal(tags.length, 6, 'the tag reader finds every call in the fixture');
    assert.deepEqual(
      tags.map(
        (tag) => `${bindsArt(tag) ? 'art' : 'glyph'}/${names(tag, 'alt') ? 'alt' : 'silent'}`
      ),
      ['art/silent', 'art/silent', 'art/alt', 'art/alt', 'art/silent', 'glyph/silent'],
      'the detector reads the shorthand binding as well as the attribute one, reads the ' +
        'deprecated alias as artwork, and reads a spread of the shared resolver as artwork — ' +
        'the three ways a silent site would otherwise escape'
    );
  });
});
