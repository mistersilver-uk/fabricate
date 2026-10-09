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
// #1648: RunDetail -1, StepDetails -2, ChoiceOptionList +1. #2080: the simulator's number tile and
// its result-card icon +2. #2006: the count face tile -1, now the shared DiceTiles' own tile.
// #1518: the recipe, inventory and run identity tiles -3, PlayerDetailHeader's one tile +1; the
// retired RequirementTile's two -2, its slots now the shared SlotTile's one site; the option
// selector's option tiles -2, now the chooser's alternatives. Issue 1773: the output, outcome-tier
// and roll-result award pills -3, now the shared AwardPill's one site. Issue 1782: the recipe-item
// contents tab's linked-recipe row -1, its members now `SetPicker` tokens. Issue 1644: the crafting
// pool's carrier tile -1, now the shared EssencePool's source tile; the routed salvage result
// pill -1, now the shared ladder's `ListRow`; the gathering drop row's tile -1, its drops now the
// shared YieldScale's rows; the held-stack picker's tile -1, its stacks now the shared
// ChoiceOptionList's one site. Issue 1778: ListRow's mark +3, one literal tag per art rung (22,
// 26, 30, 38); RunCard's tile -1, now that row's 30px mark; the ingredient routes' product tile -1,
// now the dense row's 22px mark; the alchemy known-recipe and discipline card tiles -2, now that
// row's 38px mark. The count is every `<Medallion` opening tag in `src/`; a branched pair is two.
const MEDALLION_SITES = 72;

/** How many of them bind artwork at all. The rest are glyph-only and `alt` is moot for them. */
const ART_BEARING_SITES = 55;

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
