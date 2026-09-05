/**
 * The merge predicate of `scripts/lib/stylesheetSelectorCensus.js`, proved on a synthetic corpus.
 *
 * WHY SYNTHETIC, AND WHY THIS FILE IS NOT OPTIONAL. The helper's customer is issue 1501, which ran
 * it over `styles/fabricate.css` and found ZERO mergeable pairs — because zero selector LISTS
 * repeat in the same at-context at all. That is a real measurement and a useless specification: a
 * predicate that returned nothing, a walk that matched nothing, and a census that never got past
 * its first filter all produce the identical report. So every branch the sheet could not exercise
 * is exercised here, against inputs written to exercise it, where a wrong answer is a failing
 * assertion rather than a quietly empty list. The same argument
 * `tests/stylesheet-live-classes.test.js` makes for the liveness rules, and this file follows its
 * shape: one table of `{id, css}` rows with the expectations as data on the row.
 *
 * ── THE THREE ROWS CHOSEN BY MUTATION RATHER THAN BY TASTE ──────────────────────────────
 * Most of the table below reads like documentation. Three rows do not, and they are here because
 * deleting the branch each one covers leaves EVERY OTHER ROW GREEN:
 *
 *   - LONGHAND EXPANSION, in BOTH directions. `background` against `background-color` and
 *     `background-color` against `background` are both real conflicts, and a `property === property`
 *     implementation sees neither. One direction alone is not enough: an implementation that
 *     expanded only the intervening rule's property passes the first and fails the second.
 *   - THE UNCONDITIONAL `!important` BLOCK. An `!important` declaration wins from anywhere in the
 *     sheet, so it has to bypass the admission gates entirely. Its row pairs with a control that
 *     removes only the `!important` and merges, so the row cannot pass because the blocker was
 *     admitted for some other reason.
 *   - COMMENT STRIPPING. `ruleBlocks` returns offsets into the ORIGINAL text, so a caller slicing
 *     its own declarations gets the comments too unless it strips first. A commented-out
 *     declaration read as live is a FALSE `BLOCKED BY`, which is a silently deferred adoption
 *     rather than a loud failure — the one error shape a zero-merge measurement cannot reveal.
 *
 * ── THE CENSUS AND THE MERGE PREDICATE ARE DIFFERENT QUESTIONS ──────────────────────────
 * `selectorAppearances` counts every selector-list MEMBER; `identicalListPairs` pairs rules whose
 * whole LIST matches. The `shared between two lists` row is the one that separates them: the
 * census reports `.a .b` twice and the merge predicate reports no candidate at all. That is the
 * shape almost all of the real sheet's repetition takes, so a reader who conflates the two figures
 * concludes there are 119 merges waiting to be done.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import {
  censusBlockerWalk,
  censusRules,
  formatSpecificity,
  identicalListPairs,
  mergeVerdict,
  scopedBlockerWalk,
  selectorAppearances,
  specificityOf,
} from '../scripts/lib/stylesheetSelectorCensus.js';

const REPOSITORY = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');

/**
 * The census's WHOLE script surface, not the one module that happened to hold the defect.
 *
 * A property stated of one file is a property one file has. All three of these are read by the
 * same author working on the same census — the predicate, the liveness rules it shares, and the
 * command-line entry point that prints the report — and all three sit in the `lint` and
 * `format:check` globs, which say nothing about control bytes. Naming one leaves the identical
 * defect free to land next door, where the gate is not looking.
 */
const SEARCHABLE_MODULES = Object.freeze([
  'scripts/lib/stylesheetSelectorCensus.js',
  'scripts/lib/stylesheetLiveClasses.js',
  'scripts/stylesheet-selector-census.mjs',
]);

/**
 * The census's sources have to stay searchable, and only a byte-level assertion can say they are.
 *
 * A raw control character used as a key separator is behaviourally perfect and invisible in every
 * review: `git` still diffs the file as text, prettier and eslint round-trip it, and the module's
 * own tests pass. What it costs is `grep`, `rg` and `file`, all of which classify a file holding
 * one NUL as binary and report a match without the line — in a repository whose whole workflow is
 * grep-driven, that is a module nobody can navigate. The separator is spelled as an escape instead,
 * which is the same character at runtime and ordinary text on disk.
 */
test('the census sources carry no control characters, so grep can read them', () => {
  for (const module of SEARCHABLE_MODULES) {
    const source = readFileSync(path.join(REPOSITORY, module), 'utf8');
    // eslint-disable-next-line no-control-regex -- the point of the gate is to find control bytes
    const found = [...source.matchAll(/[\u{0}-\u{8}\u{B}\u{C}\u{E}-\u{1F}]/gu)].map(
      (match) =>
        String.raw`\u${match[0].codePointAt(0).toString(16).padStart(4, '0')} at offset ${match.index}`
    );
    assert.deepEqual(found, [], `a control byte in ${module} makes it binary to grep, rg and file`);
  }
});

/** One rule block, written over as many lines as it has declarations, so a line citation is real. */
const block = (selector, ...declarations) => [
  `${selector} {`,
  ...declarations.map((declaration) => `  ${declaration}`),
  '}',
];

/** A stylesheet from blocks, each separated from the next by the newline `block` already implies. */
const sheet = (...blocks) => blocks.flat().join('\n');

/**
 * One synthetic stylesheet per row, with the verdict the predicate must reach on it.
 *
 * `pairs` is how many rule pairs satisfy (a) and (b) — the only pairs a merge could act on.
 * `verdicts` is one `"<verdict>: <reason>"` string per pair, in order, asserted WHOLE: the reason
 * carries the blocking property as the author wrote it and the line it was written on, and both
 * are what a reader checks the finding against. `repeated` is what the CENSUS says about the same
 * corpus, keyed `(at-context, selector)`, which is a different question and often a different
 * answer.
 */
const MERGE_ROWS = [
  {
    id: 'a pair with nothing between it merges at R2’s position',
    css: sheet(block('.a .b', 'color: red;'), block('.a .b', 'background-color: blue;')),
    pairs: 1,
    verdicts: ["MERGED: merged at R2's position, line 4"],
    repeated: ['.a .b x2'],
  },
  {
    id: 'the same pair split across two at-contexts is not a candidate (a)',
    css: sheet(block('.a .b', 'color: red;'), [
      '@media (min-width: 10px) {',
      '  .a .b {',
      '    color: blue;',
      '  }',
      '}',
    ]),
    pairs: 0,
    verdicts: [],
    forced: { earlier: 0, later: 1, verdict: 'BLOCKED: at-context differs (a)' },
    repeated: [],
    bareRepeated: ['.a .b x2'],
    because:
      'two rules under different conditions are never the same rule, so they are not candidates ' +
      'at all — and the census, keyed WITH the at-context, does not count them as one selector ' +
      'either, which is the keying the repetition ratchet uses. Keyed on the selector alone it ' +
      'does, which is why both figures are published',
  },
  {
    id: 'a nested at-context is reported outermost first',
    css: sheet([
      '@supports (display: grid) {',
      '  @media (min-width: 10px) {',
      '    .a .b {',
      '      color: red;',
      '    }',
      '  }',
      '}',
    ]),
    pairs: 0,
    verdicts: [],
    repeated: [],
    atContexts: [['@supports (display: grid)', '@media (min-width: 10px)']],
    because:
      'the chain is the merge predicate’s (a) clause, and `outermost first` is the documented ' +
      'order — reversed, every single-level corpus row and the whole sheet stay green, because ' +
      'the sheet has no rule nested two at-rules deep',
  },
  {
    id: 'a selector shared between two DIFFERENT lists is out of scope (b)',
    css: sheet(block('.a .b, .c', 'color: red;'), block('.a .b, .d', 'color: blue;')),
    pairs: 0,
    verdicts: [],
    forced: { earlier: 0, later: 1, verdict: 'BLOCKED: selector lists differ (b)' },
    repeated: ['.a .b x2'],
    because:
      'this is the shape almost all of the real sheet’s repetition takes. Splitting a shared list ' +
      'to lift one member out moves that member through the cascade and manufactures the ' +
      'duplicate list `no-duplicate-selectors` rejects, so it is not a merge at all',
  },
  {
    id: 'an intervening SHORTHAND blocks a pair declaring the LONGHAND (c)',
    css: sheet(
      block('.a .b', 'background-color: red;'),
      block('.a .c .d', 'background: blue;'),
      block('.a .b', 'background-color: green;')
    ),
    pairs: 1,
    verdicts: ['BLOCKED: BLOCKED BY background @5'],
    repeated: ['.a .b x2'],
    because:
      '`background` sets `background-color`, so a `property === property` implementation reports ' +
      'this pair as mergeable and moves a declaration past a rule that overrides it',
  },
  {
    id: 'an intervening LONGHAND blocks a pair declaring the SHORTHAND (c)',
    css: sheet(
      block('.a .b', 'background: red;'),
      block('.a .c .d', 'background-color: blue;'),
      block('.a .b', 'background: green;')
    ),
    pairs: 1,
    verdicts: ['BLOCKED: BLOCKED BY background-color @5'],
    repeated: ['.a .b x2'],
    because:
      'the reverse direction, and it is a separate row because an implementation that expanded ' +
      'only ONE side of the comparison passes the row above and fails this one',
  },
  {
    id: 'an intervening rule declaring an unrelated property does not block',
    css: sheet(
      block('.a .b', 'background-color: red;'),
      block('.a .c .d', 'color: blue;'),
      block('.a .b', 'background-color: green;')
    ),
    pairs: 1,
    verdicts: ["MERGED: merged at R2's position, line 7"],
    repeated: ['.a .b x2'],
    because:
      'the control for the two rows above: the same shape, the same shared `.a` token, and only ' +
      'the property changed — so their BLOCKED verdicts are earned by the property test rather ' +
      'than by anything else about the corpus',
  },
  {
    id: 'an intervening rule that ties on specificity blocks even sharing no token',
    css: sheet(
      block('.a .b', 'background-color: red;'),
      block('.x .y', 'background-color: blue;'),
      block('.a .b', 'background-color: green;')
    ),
    pairs: 1,
    verdicts: ['BLOCKED: BLOCKED BY background-color @5'],
    repeated: ['.a .b x2'],
    because:
      'equal specificity is the ONE case in which source order decides the winner, so a rule that ' +
      'shares no class, type, id or attribute with the pair can still flip it — `.a .b` and ' +
      '`.x .y` both match `<div class="a x"><div class="b y">`',
  },
  {
    id: 'an intervening rule below the pair on specificity does not block',
    css: sheet(
      block('.a .b', 'background-color: red;'),
      block('.x', 'background-color: blue;'),
      block('.a .b', 'background-color: green;')
    ),
    pairs: 1,
    verdicts: ["MERGED: merged at R2's position, line 7"],
    repeated: ['.a .b x2'],
    because:
      'the control for the row above: a rule that loses on specificity loses in BOTH orders, so ' +
      'moving a declaration past it cannot change paint',
  },
  {
    id: 'an intervening !important blocks unconditionally, from outside every admission gate',
    css: sheet(
      block('.a .b', 'background-color: red;'),
      block('#z', 'background-color: blue !important;'),
      block('.a .b', 'background-color: green;')
    ),
    pairs: 1,
    verdicts: ['BLOCKED: BLOCKED BY background-color @5'],
    repeated: ['.a .b x2'],
    because:
      '`#z` shares no token with the pair and is ABOVE it on specificity, so neither admission ' +
      'clause reaches it — an implementation that gated `!important` on admission, or on the ' +
      'band, calls this pair mergeable',
  },
  {
    id: 'the same rule without !important does not block',
    css: sheet(
      block('.a .b', 'background-color: red;'),
      block('#z', 'background-color: blue;'),
      block('.a .b', 'background-color: green;')
    ),
    pairs: 1,
    verdicts: ["MERGED: merged at R2's position, line 7"],
    repeated: ['.a .b x2'],
    because:
      'the control for the row above, differing from it by the word `!important` alone. Without ' +
      'it the row above could be passing because `#z` was admitted for some other reason',
  },
  {
    id: 'a COMMENTED-OUT declaration is not a blocker',
    css: sheet(
      block('.a .b', 'background-color: red;'),
      block('.a .c .d', 'color: blue;', '/* border-color: red;', '   background-color: blue; */'),
      block('.a .b', 'background-color: green;')
    ),
    pairs: 1,
    verdicts: ["MERGED: merged at R2's position, line 9"],
    repeated: ['.a .b x2'],
    because:
      '`ruleBlocks` returns offsets into the ORIGINAL text and no body at all, so a caller that ' +
      'slices its own declaration text without `stripCssComments` reads this comment as a live ' +
      'declaration and reports a false BLOCKED — a silently deferred adoption rather than a ' +
      'failure anyone sees. The comment holds TWO declarations deliberately: a declaration ' +
      'scanner splits at `;`, so a single commented declaration still carries its `/*` into the ' +
      'property name and is rejected as malformed whether or not comments were stripped, and a ' +
      'one-line comment would leave this row unable to fail',
  },
  {
    id: 'the same declarations uncommented do block',
    css: sheet(
      block('.a .b', 'background-color: red;'),
      block('.a .c .d', 'color: blue;', 'border-color: red;', 'background-color: blue;'),
      block('.a .b', 'background-color: green;')
    ),
    pairs: 1,
    verdicts: ['BLOCKED: BLOCKED BY background-color @7'],
    repeated: ['.a .b x2'],
    because:
      'the control for the row above: the identical corpus with the comment delimiters removed, ' +
      'so that row’s MERGED cannot be an artefact of a corpus nothing could block',
  },
];

/** Every repeated selector of one corpus, as `"<selector> x<appearances>"`, in first-line order. */
function repeatedIn(rules, options = {}) {
  return [...selectorAppearances(rules, options).values()]
    .filter((entry) => entry.appearances.length > 1)
    .map((entry) => `${entry.selector} x${entry.appearances.length}`);
}

test('every merge rule holds on its synthetic row', () => {
  for (const row of MERGE_ROWS) {
    const rules = censusRules(row.css);
    const pairs = identicalListPairs(rules);
    const why = row.because ?? '';

    assert.equal(pairs.length, row.pairs, `${row.id}: candidate-pair count — ${why}`);
    assert.deepEqual(
      pairs.map((pair) => {
        const verdict = mergeVerdict(rules, pair.earlier, pair.later);
        return `${verdict.verdict}: ${verdict.reason}`;
      }),
      row.verdicts,
      `${row.id}: verdict — ${why}`
    );
    if (row.forced) {
      // (a) AND (b) DISQUALIFY A PAIR BEFORE IT IS A PAIR, so neither branch of `mergeVerdict` is
      // reachable through `identicalListPairs` and both would otherwise be dead code proved by
      // nothing. Asked directly, the predicate has to say which clause refused, and say it in the
      // words the census report prints.
      const { earlier, later, verdict } = row.forced;
      const forced = mergeVerdict(rules, earlier, later);
      assert.equal(
        `${forced.verdict}: ${forced.reason}`,
        verdict,
        `${row.id}: the clause that refuses the pair — ${why}`
      );
    }
    if (row.atContexts) {
      assert.deepEqual(
        rules.map((rule) => rule.atContext),
        row.atContexts,
        `${row.id}: the enclosing at-rule chain — ${why}`
      );
    }
    assert.deepEqual(repeatedIn(rules), row.repeated, `${row.id}: census repetition — ${why}`);
    if (row.bareRepeated) {
      assert.deepEqual(
        repeatedIn(rules, { keyByAtContext: false }),
        row.bareRepeated,
        `${row.id}: census repetition keyed on the selector alone — ${why}`
      );
    }
  }
});

test('the table is alive, so the loop above cannot pass by iterating nothing', () => {
  assert.ok(MERGE_ROWS.length >= 12, 'the synthetic corpus lost rows');
  assert.equal(
    MERGE_ROWS.filter((row) => row.verdicts.some((verdict) => verdict.startsWith('MERGED'))).length,
    5,
    'a table with no MERGED row is satisfied by a predicate that blocks everything'
  );
  assert.equal(
    MERGE_ROWS.filter((row) => row.verdicts.some((verdict) => verdict.includes('BLOCKED BY')))
      .length,
    5,
    'a table with no BLOCKED BY row is satisfied by a walk that finds nothing'
  );
});

/**
 * The corpus criterion 5's two walks disagree about.
 *
 * `.intruder` is (0,3,0) — inside the closed band between the donor's (0,4,0) and the utility's
 * (0,2,0), and equal to NEITHER endpoint, so the census walk can only admit it through the
 * `.fabricate-manager` ancestor token the donor shares with it. Over an interval of ten thousand
 * lines that clause is what makes the census walk useless for an adoption: the shared ancestor is
 * the manager root, and the whole manager sheet is a blocker.
 */
const SCOPED_CSS = sheet(
  block('.fabricate-manager .panel .card .donor', 'overflow: hidden;'),
  block('.fabricate-manager .panel .intruder', 'overflow: visible;'),
  block('.fabricate .fab-truncate', 'overflow: hidden;')
);

/** The same corpus with the intervening rule moved BELOW the band and given a matchable subject. */
const OUT_OF_BAND_CSS = sheet(
  block('.fabricate-manager .panel .card .donor', 'overflow: hidden;'),
  block('.fabricate-manager > *', 'overflow: visible;'),
  block('.fabricate .fab-truncate', 'overflow: hidden;')
);

/**
 * The same corpus with a MULTI-MEMBER intervening rule, one member in the band and one above it.
 *
 * `.fabricate-manager .donor` is (0,2,0) — inside the band and equal to its low endpoint — and its
 * subject is a class the donor element carries. `.fabricate-manager .panel .card .other.is-open` is
 * (0,5,0), ABOVE the band's high endpoint. A walk that bands the rule on its highest member reads
 * the pair as (0,5,0), skips it, and clears an adoption a live rule overrides.
 */
const MULTI_MEMBER_CSS = sheet(
  block('.fabricate-manager .panel .card .donor', 'overflow: hidden;'),
  block(
    '.fabricate-manager .donor, .fabricate-manager .panel .card .other.is-open',
    'overflow: visible;'
  ),
  block('.fabricate .fab-truncate', 'overflow: hidden;')
);

/** The control: the same two-member shape with the IN-BAND member's subject changed to a stranger. */
const MULTI_MEMBER_STRANGER_CSS = sheet(
  block('.fabricate-manager .panel .card .donor', 'overflow: hidden;'),
  block(
    '.fabricate-manager .stranger, .fabricate-manager .panel .card .other.is-open',
    'overflow: visible;'
  ),
  block('.fabricate .fab-truncate', 'overflow: hidden;')
);

/**
 * The scoped walk over one corpus, from the donor at index 0 to the utility at index 2.
 *
 * `reversed` passes the SAME interval with its endpoints the other way round, which is how a caller
 * naming the donor first and the utility second writes it when the utility precedes the donor in
 * the sheet.
 */
function scopedWalk(css, classes, { reversed = false } = {}) {
  const rules = censusRules(css);
  return scopedBlockerWalk({
    rules,
    from: reversed ? 2 : 0,
    to: reversed ? 0 : 2,
    declarations: rules[0].declarations,
    band: [rules[0].specificity, rules[2].specificity],
    element: { classes },
  });
}

test('the scoped walk clears what the census walk blocks on a shared ancestor token', () => {
  const rules = censusRules(SCOPED_CSS);
  assert.deepEqual(
    rules.map((rule) => formatSpecificity(rule.specificity)),
    ['(0,4,0)', '(0,3,0)', '(0,2,0)'],
    'the intruder must sit strictly inside the band and equal neither endpoint, or the census ' +
      'walk would admit it on specificity and the token clause would not be under test'
  );

  const census = censusBlockerWalk(rules, 0, 2);
  assert.ok(census.blocked, 'the census walk admits on the shared `.fabricate-manager` token');
  assert.equal(census.blockers[0].property, 'overflow');
  assert.equal(census.blockers[0].line, 5);

  assert.ok(
    !scopedWalk(SCOPED_CSS, ['donor', 'panel', 'card']).blocked,
    'the scoped walk asks the narrower question the adoption actually turns on — can this rule ' +
      'style THIS element — and `.intruder` is not a class the donor element carries'
  );
  assert.ok(
    scopedWalk(SCOPED_CSS, ['donor', 'panel', 'card', 'intruder']).blocked,
    'the same walk against an element that DOES carry the class must block, or the clearance ' +
      'above is a walk that never blocks rather than a class-list test'
  );
});

test('the scoped walk clears a blocker outside the closed specificity band', () => {
  const rules = censusRules(OUT_OF_BAND_CSS);
  assert.deepEqual(
    rules.map((rule) => formatSpecificity(rule.specificity)),
    ['(0,4,0)', '(0,1,0)', '(0,2,0)'],
    'the intervening rule sits BELOW the band, so it loses in both orders'
  );
  assert.ok(
    censusBlockerWalk(rules, 0, 2).blocked,
    'the census walk still blocks on the shared ancestor token, so the clearance below is the ' +
      'band clause rather than the corpus'
  );
  assert.ok(
    !scopedWalk(OUT_OF_BAND_CSS, ['donor', 'panel', 'card']).blocked,
    'a universal subject is admitted whatever the element carries, so this row can only be ' +
      'cleared by the band — which is the clause that makes a ten-thousand-line walk tractable'
  );
});

test('the scoped walk bands a multi-member rule per member, not on its highest member', () => {
  const rules = censusRules(MULTI_MEMBER_CSS);
  assert.deepEqual(
    rules.map((rule) => formatSpecificity(rule.specificity)),
    ['(0,4,0)', '(0,5,0)', '(0,2,0)'],
    'the intervening rule as a whole must sit ABOVE the band, or a walk banding it on its ' +
      'highest member would admit it anyway and this row would prove nothing'
  );
  assert.deepEqual(
    rules[1].selectors.map((selector) => formatSpecificity(specificityOf(selector))),
    ['(0,2,0)', '(0,5,0)'],
    'while its FIRST member is inside the band, at the utility’s own specificity'
  );

  assert.ok(
    scopedWalk(MULTI_MEMBER_CSS, ['donor', 'panel', 'card']).blocked,
    'an in-band member whose subject the donor element carries overrides the moved declaration ' +
      'wherever it lands, so the adoption is blocked — a walk that tests the band on the list’s ' +
      'highest member and the subject per member asks its two questions of different selectors ' +
      'and reports a clean adoption'
  );
  assert.ok(
    !scopedWalk(MULTI_MEMBER_STRANGER_CSS, ['donor', 'panel', 'card']).blocked,
    'the control for the row above: the same two-member shape with the in-band member’s subject ' +
      'changed to a class the element does not carry, so the block above is earned by the ' +
      'subject test rather than by any multi-member rule blocking'
  );
});

test('the scoped walk reads the same interval with its endpoints in either order', () => {
  const classes = ['donor', 'panel', 'card', 'intruder'];
  const forward = scopedWalk(SCOPED_CSS, classes);
  const reversed = scopedWalk(SCOPED_CSS, classes, { reversed: true });

  assert.ok(
    forward.blocked,
    'the forward walk finds the intruder, so the comparison has a subject'
  );
  assert.deepEqual(
    reversed.blockers.map((blocker) => `${blocker.property} @${blocker.line}`),
    forward.blockers.map((blocker) => `${blocker.property} @${blocker.line}`),
    'a walk that iterates from the first argument upwards examines NOTHING when the endpoints ' +
      'arrive reversed and returns the unblocked shape — a clean bill of health indistinguishable ' +
      'from a real one, which is what a caller gets whenever the utility precedes the donor'
  );
});
