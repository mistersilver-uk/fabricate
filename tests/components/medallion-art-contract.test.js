/**
 * A MEDALLION THAT CARRIES ART SAYS WHAT THE ART IS FOR (issue 1506).
 *
 * ── THE RENAME, AND THE HOLE IT WOULD OTHERWISE LEAVE ───────────────────────────────────────
 * The tile's image prop was `src`, which is an ELEMENT's attribute name; the design system
 * publishes it as `art`, which is what a record's artwork is. Issue 1506 takes the published
 * name and keeps `src` as a deprecated alias for one release, so an out-of-tree caller is not
 * broken by a rename it never saw. An alias is also an ESCAPE HATCH: a contract asked only of
 * `art` is a contract any caller can step around by spelling the old name, so both spellings are
 * the domain of the clause below, and a second clause pins that no shipped site uses the alias
 * at all — the alias exists for callers this repository cannot see.
 *
 * ── WHY `alt` IS "EXPLICITLY PASSED" AND NOT "REQUIRED TO BE NON-EMPTY" ─────────────────────
 * `alt=""` is the CORRECT value at every shipped site: each renders the record's own name as
 * adjacent text, so alt text would be a second reading of the same word to a screen reader. What
 * is not correct is silence — a tile whose author never considered the question. So the contract
 * is that the DECISION WAS TAKEN, spelled as an `alt` attribute with whatever value the site
 * needs. Worded as "must be non-empty" it would push an author into writing redundant alt text
 * beside a visible name on every browse row, which is worse for the reader it is meant to serve.
 *
 * ── WHY A SOURCE SCAN AND NOT A RUNTIME THROW ───────────────────────────────────────────────
 * A primitive that threw on a missing `alt` would fail at the one moment nobody is watching —
 * inside a GM's Foundry session, on a screen a mounted suite does not reach — and would make the
 * tile's own render depend on a caller's discipline. The failure this guards is a call site that
 * was never written, which is a fact about `src/` and is answerable by reading it.
 *
 * The scan is `openingTagsNamed`, the shared depth-aware tag reader, rather than a `[^<>]*`
 * regular expression: practically every call site here passes an expression attribute, and a
 * `>` inside one truncates a naive match half way through the attribute list — which would not
 * fail this clause but would make it report clean over half a tag.
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { SOURCES } from '../helpers/primitiveAdoptionContract.js';
import { openingTagsNamed } from '../helpers/svelteTagScan.js';

/** The published name, and the alias it replaced. */
const ART = 'art';
const DEPRECATED_ALIAS = 'src';

/**
 * THE THIRD WAY A CALL SITE PASSES ART, and the reason this is not just an attribute scan.
 *
 * The thirty-two converted crafting tiles do not write `art=` at all: they spread the shared art
 * resolver, `<Medallion {...resolveCraftingArt(row.img)} alt="" size={30} />`, because the choice
 * between a record's own image, Foundry's item-bag sentinel, a fallback glyph and the house
 * blueprint is one decision and belongs in one place. A scan that read attributes alone would
 * report thirty-two art-bearing tiles as glyph-only and exempt every one of them from the clause
 * below — the largest hole this contract could have, and a silent one.
 *
 * The spread counts because the resolver's return ALWAYS carries an `art` key, in both branches,
 * which `crafting-art-resolution.test.js` pins directly.
 */
const ART_RESOLVER = 'resolveCraftingArt(';

/**
 * EVERY MEDALLION RENDER SITE IN `src/`, PINNED, so no clause below can pass over nothing.
 *
 * A negative clause — "no art-bearing tile is silent about `alt`" — is satisfied by a tree with
 * no art-bearing tiles in it, which is exactly what a scan that stopped matching would produce.
 * So the population is counted, not just quantified over.
 *
 * Every shipped file imports the component under this one name (measured: twenty importers, two
 * specifier depths, one local name), which is what makes a tag-name scan the whole population
 * rather than most of it.
 */
const MEDALLION_SITES = 65;

/** How many of them bind artwork at all. The rest are glyph-only and `alt` is moot for them. */
const ART_BEARING_SITES = 52;

/** `<Medallion …>` opening tags in `src/`, as `{ path, tag }`. */
const TAGS = Object.entries(SOURCES).flatMap(([path, source]) =>
  openingTagsNamed(source, 'Medallion').map((tag) => ({ path, tag }))
);

/**
 * Does this tag name `prop`, in either binding form?
 *
 * Both forms are read because Svelte's shorthand `{tint}` is invisible to a `tint=` scan, and a
 * census of this component built on `tint=` alone undercounted its tinted sites by one for the
 * whole of issue 1506's planning.
 *
 * The lookbehind is `(?<![\w-])` rather than `\b`, because `\b` matches before a hyphen and after
 * a letter: a `\b`-anchored `alt=` pattern would read `data-alt=` as this attribute, and a
 * `src=`-anchored one would read any future `*src=` prop as the alias.
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
    // The clause above already covers the alias; this one covers the alias itself. It exists for
    // callers outside this repository for ONE release, so a shipped site adopting it would be a
    // second first-class name for one prop — and the deletion that ends the deprecation would
    // then break the tree it was introduced to protect.
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
    // Assembled from single-quoted lines rather than written as one template literal, because a
    // Svelte expression attribute and a template placeholder are spelled the same way.
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
