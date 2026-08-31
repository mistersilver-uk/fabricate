/**
 * Direct proof for the CSS declaration scanner in `tests/helpers/styleBlockScan.js` (issue 1391).
 *
 * The gate that consumes it — `tests/components/control-height-ladder.test.js` — can only assert
 * a TOTAL, and a total cannot tell a subtly wrong scanner from a right one on the days the two
 * happen to agree. Every correctness property this scanner has lives here instead, because each
 * of them was got wrong at least once while it was being built:
 *
 *   - `min-height: 240px` matched as `40px`, on a substring. Fourteen phantom occurrences.
 *   - a CSS comment mentioning `40px` was counted as a declaration.
 *   - a `<style>` named in Svelte docblock PROSE opened a scanned block that never closed, so a
 *     naive extractor read from that line to end of file as CSS.
 *   - one-level `var()` resolution reddened a declaration reading a token at one hop and
 *     SILENTLY PASSED two derived from the same token at two.
 *   - substituting a definition for `var(--x, 36px)` DELETED the fallback, and with it a real
 *     occurrence.
 *   - the declaration pattern was widened to read `HEIGHT:`, and the scan then dropped it
 *     against an all-lowercase property list one line later, so the widening reached nothing.
 *
 * None of those is hypothetical and none was caught by reading the code. Each was caught by
 * reading output, so each is pinned here.
 *
 * ── WHY THE FIXTURES ARE STRINGS, AND WHY ONE OF THEM IS NOT ────────────────────────────
 * `UI_PATH_PATTERN` in `scripts/lib/viewLabCases.js` is `/^(src\/ui\/|styles\/)|\.(svelte|css)$/`,
 * and the second alternation is NOT anchored to a directory — so `isUiFile` returns true for
 * `tests/fixtures/anything.svelte`. A COMMITTED fixture with either extension would arm the
 * screenshot-evidence gate for a change that renders nothing at all. Helper proofs therefore take
 * source as strings.
 *
 * One proof cannot: `the scan reaches a value written only into a token` is end to end by
 * definition — it exists to show that the filesystem walker, the Svelte `<style>` extractor and
 * the resolver feed ONE definition namespace, so a token declared in a `.css` resolves inside a
 * `.svelte` block. It used to point at the real tree, where `styles/fabricate.css` declared a
 * 40px thumbnail token that `BooksScrollsView.svelte` read. Issue 1399 inlined that pair with the
 * rest of the legacy token generations, and the tree now holds no token-mediated retired height
 * at all — so the capability had to stop depending on the corpus happening to contain one.
 *
 * It is therefore built as REAL FILES in a tmpdir and read through `collectStyleCorpus`, which
 * already takes `roots`. `scanPixelValues` would accept an in-memory `{path: text}` object, and
 * that is the cheap version to refuse: it bypasses `collectWorkingTreeSources`, `styleTextFor`
 * and `maskNonStyleRegions` entirely, and would replace an end-to-end capability proof with a
 * resolver-only one. A tmpdir root is never reached by `isUiFile` and is never committed, so it
 * costs nothing the string fixtures were avoiding.
 *
 * `tests/helpers/` is outside the `npm test` glob and `tests/*.test.js` is inside it, which is
 * why this file exists at all — the same arrangement, for the same reason, as
 * `tests/source-scan.test.js`.
 */
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import { byCodePoint } from './helpers/ratchetBaseline.js';
import { collectWorkingTreeSources, repoRoot } from './helpers/sourceScan.js';
import {
  MAX_VAR_CHAIN_DEPTH,
  collectCustomProperties,
  collectStyleCorpus,
  declarationsIn,
  maskNonStyleRegions,
  pixelValuesIn,
  resolveValueCandidates,
  scanPixelValues,
  stripCssComments,
  styleTextFor,
  varReferencesIn,
} from './helpers/styleBlockScan.js';

/** A `{ name: [definition, …] }` literal as the resolver wants it. */
const definitions = (entries) => new Map(Object.entries(entries));

/** The candidate texts for one value, as a sorted array, which is what assertions compare. */
const candidatesFor = (value, defined) =>
  resolveValueCandidates(value, definitions(defined)).candidates.sort(byCodePoint);

test('a comment is blanked, and its offsets are kept', () => {
  const css = ['.a {', '  /* the 40px rung is retired */', '  height: 28px;', '}'].join('\n');
  const stripped = stripCssComments(css);

  assert.equal(stripped.length, css.length, 'stripping must not move a single character');
  assert.equal(stripped.split('\n').length, css.split('\n').length);
  assert.deepEqual(pixelValuesIn(stripped), [28], 'the comment named a value it does not set');
  assert.equal(declarationsIn('a.css', stripped)[0].line, 3, 'the line number must survive');

  // A comment spanning lines keeps every newline, or every line number below it slides up.
  const across = stripCssComments('.a {\n/* one\ntwo\nthree */\nheight: 30px;\n}');
  assert.equal(declarationsIn('a.css', across).at(-1).line, 5);

  // The CALL SITE, not the function. Every assertion above reaches `stripCssComments` directly,
  // so deleting the call from `styleTextFor` leaves all of them green — which is how that call
  // shipped unproven while its sibling `maskNonStyleRegions(source)`, on the line above it, was
  // proved by `the ManagerButton prose trap stays shut`. This goes through `styleTextFor`.
  //
  // The mechanism is live in the corpus rather than hypothetical: with stripping disabled the
  // scan picks up commented-out declarations, `apps/manager/Chip.svelte:187` among them, whose
  // interior `{` gives DECLARATION a real boundary to anchor on. None of them carries a RETIRED
  // value today, so a corpus-level guard would be vacuous and this has to be a composition
  // assertion.
  const superseded = '/* superseded: .old-toolbar { min-height: 40px; } */\n.a { height: 28px; }';
  assert.deepEqual(
    declarationsIn('a.css', styleTextFor('a.css', superseded)).map(
      (entry) => `${entry.property}:${entry.value}`
    ),
    ['height:28px'],
    'styleTextFor must APPLY the stripping, not merely be defined next to it: a declaration ' +
      'commented out is not a declaration, and a retired value inside one is documentation'
  );
});

test('a pixel literal matches on a numeric boundary, never a substring', () => {
  // The original defect, exactly: 240 is one value, not a 40 with a 2 in front of it.
  assert.deepEqual(pixelValuesIn('min-height: 240px'), [240]);
  assert.deepEqual(pixelValuesIn('height: 1440px'), [1440]);
  assert.deepEqual(pixelValuesIn('height: 1.40px'), [1.4]);
  assert.deepEqual(pixelValuesIn('height: 40px'), [40]);
  assert.deepEqual(pixelValuesIn('calc(40px + 240px)'), [40, 240]);
  assert.deepEqual(pixelValuesIn('height: 40pxx'), [], 'a trailing letter is not the unit');

  // ── THE LOOKBEHIND ──────────────────────────────────────────────────────────────────────
  // `240px` above is protected by greediness alone — delete the lookbehind and it stays correct,
  // so asserting it proves nothing about the boundary. These two are the ONLY shapes measured to
  // flip when the lookbehind is deleted, and they cover a half of `[\w.]` each. Chosen by
  // deleting it and reading which assertions reddened, not by reasoning about the pattern:
  // reasoning is how the earlier draft came to credit it with a case it does not guard.
  assert.deepEqual(
    pixelValuesIn('background: url(icon40px.svg)'),
    [],
    'a number glued to a word is part of that word, not a length'
  );
  assert.deepEqual(
    pixelValuesIn('background: url(sprite.40px.png)'),
    [],
    'a number glued to a DOT is part of that filename; without the lookbehind it reads as ' +
      'four tenths of a pixel, because the `\\.\\d+` branch matches from the dot'
  );

  // ── THE `\.\d+` BRANCH ──────────────────────────────────────────────────────────────────
  // This is the branch's proof, not the lookbehind's. Measured across all three variants,
  // `.40px` yields 0.4 shipped AND with the lookbehind deleted; delete the branch instead and
  // it yields nothing at all. `.4px` is valid CSS, and a length the scanner cannot see is the
  // one direction of error this gate cannot afford.
  assert.deepEqual(
    pixelValuesIn('height: .40px'),
    [0.4],
    'a leading-dot decimal is four tenths of a pixel, not forty of them and not nothing'
  );

  // ── UNITS ARE CASE-INSENSITIVE ──────────────────────────────────────────────────────────
  // `40PX` is forty pixels by the CSS grammar. The corpus holds none today, which is exactly
  // why nothing else would notice: the bypass costs one keystroke and it sits in the Svelte
  // half stylelint cannot reach. Nothing downstream re-filters the unit, so this one assertion
  // does cover the whole scan — unlike the property casing, which needs the composition proof
  // in `an uppercase property name survives the whole scan, not just the extraction`.
  assert.deepEqual(pixelValuesIn('height: 40PX'), [40], 'a CSS unit is ASCII case-insensitive');

  // ── PINNED LIMIT: THE MATCHER IS SIGN-BLIND ─────────────────────────────────────────────
  // `-8px` tallies as `8px` because a `-` is neither `\w` nor `.`, so the lookbehind does not
  // exclude it. Unreachable for heights — no control is negative pixels tall — but ordinary for
  // the spacing gate that comes next. Pinned so that making it sign-aware is a deliberate edit
  // here rather than a surprise in a baseline.
  assert.deepEqual(
    pixelValuesIn('margin: -8px auto'),
    [8],
    'a negative length reads as its magnitude. A spacing gate that must tell -8px from 8px has ' +
      'to change PIXEL_LITERAL, not assume this'
  );
});

test('a declaration is read only at a real declaration boundary', () => {
  const css = '.a { line-height: 40px; height: 32px; --fab-x-height: 36px; }';
  const found = declarationsIn('a.css', css);

  assert.deepEqual(
    found.map((entry) => entry.property),
    ['line-height', 'height', '--fab-x-height'],
    '`height` must not be read out of `line-height`, and a token must keep its own name'
  );

  // A breakpoint sits inside parentheses, never after `;`, `{` or `}` — and a breakpoint is not
  // a control height, so it must not enter the corpus at all.
  const media = declarationsIn('a.css', '@media (min-height: 400px) { .a { height: 30px; } }');
  assert.deepEqual(
    media.map((entry) => `${entry.property}:${entry.value}`),
    ['height:30px']
  );
});

test('an uppercase property name survives the whole scan, not just the extraction', () => {
  // EXTRACTION IS NOT SELECTION, and asserting the first as though it were the second is how the
  // property-name widening shipped inert. `DECLARATION` was widened to `[a-zA-Z]` so a `HEIGHT:`
  // could not evade the gate, and it does read the name perfectly — after which
  // `scanPixelValues` dropped it against an all-lowercase property list one line later.
  // Measured end to end BEFORE the fold: `height: 40px` and `height: 40PX` scored one occurrence
  // each, `HEIGHT: 40px` and `MIN-HEIGHT: 36px` scored ZERO. The pattern was right and the gate
  // still had the one-keystroke bypass the widening was written to close.
  //
  // Every assertion here therefore goes through `scanPixelValues`. The `declarationsIn`
  // assertion that used to stand in for this one is green under that defect, which is the same
  // helper-level-pass-presented-as-composition shape the `stripCssComments` call site had.
  const occurrences = (css, properties, values) =>
    scanPixelValues({ corpus: { 'a.css': css }, properties, values }).occurrences;

  assert.deepEqual(
    occurrences('.a { HEIGHT: 40PX; }', ['height'], [40]).map(
      (record) => `${record.property}:${record.value}`
    ),
    ['HEIGHT:40'],
    'an uppercase property and an uppercase unit must both reach the scan, and the record must ' +
      'keep the name AS AUTHORED: a HEIGHT row then arrives at the ratchet as an unbaselined ' +
      'key and reds, rather than silently inflating the count of the `height` row it is not'
  );
  assert.equal(
    occurrences('.a { MIN-HEIGHT: 36px; }', ['min-height'], [36]).length,
    1,
    'a hyphenated property must fold too; the extractor reads it either way, so only the ' +
      'property match can lose it'
  );
  assert.equal(
    occurrences('.a { height: 40px; }', ['HEIGHT'], [40]).length,
    1,
    'the fold is on BOTH sides — a caller naming a property in upper case is asking for the ' +
      'same property, and half a fold is a bypass with the sides swapped'
  );

  // Custom property names are NOT folded, which is the spec's own rule rather than an omission:
  // `--Foo` and `--foo` are two properties, and folding them would make a gate scanning one of
  // them silently answer about both.
  assert.equal(occurrences('.a { --Foo: 40px; }', ['--Foo'], [40]).length, 1);
  assert.equal(
    occurrences('.a { --Foo: 40px; }', ['--foo'], [40]).length,
    0,
    'a custom property name is case-SENSITIVE, so the fold must not reach it'
  );
});

test('a <style> opener must be the whole line, and prose naming one opens nothing', () => {
  const svelte = [
    '<script>',
    "  // a scoped `<style>` is what this component deliberately does not have",
    '  export let height = 40;',
    '</script>',
    '',
    '<div class="thing">{height}</div>',
    '',
    '<style>',
    '  .thing {',
    '    height: 36px;',
    '  }',
    '</style>',
  ].join('\n');
  const css = maskNonStyleRegions(svelte);

  assert.equal(css.length, svelte.length, 'masking must not move a single character');
  assert.deepEqual(pixelValuesIn(css), [36], 'only the real block contributes');
  assert.deepEqual(
    declarationsIn('a.svelte', css).map((entry) => `${entry.line}:${entry.property}`),
    ['10:height'],
    'the declaration keeps the line it has in the file on disk'
  );
  assert.ok(
    !css.includes('export let height'),
    'markup and script must be masked out, or a JS default reads as a CSS value'
  );
});

test('the ManagerButton prose trap stays shut', () => {
  // A PINNED proof against the real tree rather than a fixture of it. This file mentions
  // `<style>` twice in docblock prose — explaining that it has none — and carries no closing tag
  // anywhere in its 268 lines, so a naive `indexOf('<style')` reads from line 70 to EOF as CSS.
  // It is inert today only because that prose happens to hold no CSS-shaped text, which is
  // exactly why it needs a test rather than luck.
  const file = 'src/ui/svelte/components/ManagerButton.svelte';
  const source = readFileSync(join(repoRoot, file), 'utf8');

  assert.ok(source.includes('<style'), `${file} no longer names <style> in prose; retarget this`);
  assert.ok(!source.includes('</style>'), `${file} has gained a real scoped block; retarget this`);
  assert.equal(
    styleTextFor(file, source).trim(),
    '',
    'a file with no scoped block must contribute no CSS. A naive extractor reads its docblock ' +
      'prose, and everything below it, as a stylesheet.'
  );
  assert.ok(
    !(file in collectStyleCorpus()),
    'a file contributing nothing must not appear in the corpus at all, or the gate can cite it'
  );
});

test('every Svelte file carrying a real block is in the corpus, and only those', () => {
  // The line anchor's COST, which nothing pinned until now. A block whose opener is not alone on
  // its line contributes zero — one `<style lang="postcss">.a{height:36px}</style>` would drop a
  // whole component's CSS out of the gate, arrive with no baseline row and red nothing, which is
  // the failure shape this whole scanner exists to avoid. Measured today: 180 openers, 180
  // closers, 180 contributing files, no mismatch in either direction.
  const carriesBlock = Object.entries(collectWorkingTreeSources(['src'], ['.svelte']))
    .filter(([, source]) => source.includes('</style>'))
    .map(([file]) => file)
    .sort(byCodePoint);
  const contributes = Object.keys(collectStyleCorpus())
    .filter((file) => file.endsWith('.svelte'))
    .sort(byCodePoint);

  assert.ok(
    carriesBlock.length > 150,
    `only ${carriesBlock.length} Svelte files carry a scoped block; retarget this proof`
  );
  assert.deepEqual(
    contributes,
    carriesBlock,
    'a Svelte file with a closing </style> must contribute CSS, and only such a file may. A ' +
      'file missing from the corpus has had its block silently dropped by the line-anchored ' +
      'extractor — almost certainly an opener sharing its line with something else.'
  );
});

test('var() resolution runs to a fixed point, not one level', () => {
  // The chain `styles/fabricate.css` actually ships: a token, a token derived from it through a
  // calc(), and readers at one hop and at two. Under one-level resolution the two-hop readers
  // keep an unresolved `var()` and pass while the one-hop reader reds — one edit, two silent
  // passes and an inconsistency nobody would think to look for.
  const defined = definitions({
    '--chip': ['36px'],
    '--row': ['calc(var(--chip) + (2 * var(--space)) + 2px)'],
    '--space': ['4px'],
  });

  const oneHop = resolveValueCandidates('var(--chip)', defined);
  assert.equal(oneHop.depth, 1);
  assert.ok(oneHop.candidates.includes('36px'));

  const twoHop = resolveValueCandidates('var(--row)', defined);
  assert.equal(twoHop.depth, 2, 'depth counts hops along the chain, not substitutions');
  assert.ok(
    twoHop.candidates.includes('calc(36px + (2 * 4px) + 2px)'),
    'the fixed point must manufacture the literal the source line does not contain'
  );
  assert.deepEqual(
    twoHop.candidates.flatMap(pixelValuesIn).filter((value) => value === 36),
    [36],
    'a two-hop reader must see the value a one-hop reader sees'
  );

  // The general escape, which survives any fixed number of levels: --a: 36px; --b: var(--a).
  const chained = candidatesFor('var(--b)', { '--a': ['36px'], '--b': ['var(--a)'] });
  assert.ok(chained.includes('36px'));
});

test('resolution unions the raw text with the resolved text', () => {
  // Substitution is not monotone. `Stepper.svelte:355` is
  // `height: var(--fab-stepper-fill-height, 36px)`, the token is defined four times in the real
  // corpus and NONE of them is 36px, so replacing the reference by a definition deletes the
  // fallback and with it a real occurrence — the count drops to 85 and a baselined row vanishes.
  const found = candidatesFor('var(--fill, 36px)', { '--fill': ['28px', '34px'] });

  assert.deepEqual(found, ['28px', '34px', '36px', 'var(--fill, 36px)']);
  assert.ok(found.includes('var(--fill, 36px)'), 'the raw text is always a candidate');
  assert.ok(found.includes('36px'), 'the fallback is a candidate');
  assert.ok(found.includes('28px'), 'so is every definition');

  // A name defined more than once contributes EVERY distinct definition, because CSS decides
  // between them by cascade and specificity and a text scanner has neither.
  assert.deepEqual(candidatesFor('var(--x)', { '--x': ['32px', '30px', '32px'] }), [
    '30px',
    '32px',
    'var(--x)',
  ]);

  // An undefined name with no fallback resolves to nothing and terminates rather than looping.
  assert.deepEqual(candidatesFor('var(--absent)', {}), ['var(--absent)']);
});

test('a var() cycle terminates, and a chain past the cap is reported rather than hidden', () => {
  const cyclic = resolveValueCandidates(
    'var(--a)',
    definitions({ '--a': ['var(--b)'], '--b': ['var(--a)'] })
  );
  assert.ok(cyclic.candidates.length <= 2, 'a cycle must close on the visited set');
  assert.equal(cyclic.capReached, false, 'a cycle is closed by the visited set, not by the cap');

  const deep = definitions({
    '--a': ['36px'],
    '--b': ['var(--a)'],
    '--c': ['var(--b)'],
    '--d': ['var(--c)'],
  });
  const capped = resolveValueCandidates('var(--d)', deep, { maxDepth: 2 });
  assert.equal(capped.capReached, true, 'a truncated candidate set must SAY it is truncated');
  assert.ok(
    !capped.candidates.includes('36px'),
    'the point of reporting it: the value beyond the cap reads as absent'
  );
  assert.equal(resolveValueCandidates('var(--d)', deep).capReached, false);
  assert.ok(resolveValueCandidates('var(--d)', deep).candidates.includes('36px'));
  assert.ok(MAX_VAR_CHAIN_DEPTH > 4, 'the default cap must leave real slack over this corpus');
});

test('a var() reference is parsed with its fallback, brackets and all', () => {
  const nested = varReferencesIn('calc(var(--a) + var(--b, calc(var(--c) + 2px)))');
  assert.deepEqual(
    nested.map((reference) => reference.name),
    ['--a', '--b'],
    'only outermost references are returned; a fallback is expanded on the next round'
  );
  assert.equal(nested[1].fallback, 'calc(var(--c) + 2px)');
  assert.equal(varReferencesIn('var(--a)')[0].fallback, null);
  assert.deepEqual(varReferencesIn('height: 40px'), []);
});

test('the real corpus is both stylesheets, and its custom properties come from both', () => {
  const corpus = collectStyleCorpus();
  const files = Object.keys(corpus);

  assert.ok(
    files.includes('styles/fabricate.css'),
    'the global sheet must be in the corpus — it holds most of the declarations'
  );
  assert.ok(
    files.some((file) => file.startsWith('src/') && file.endsWith('.svelte')),
    'Svelte scoped blocks must be in the corpus — they are the half stylelint cannot reach'
  );

  // ONE definition namespace, fed by both walkers — asserted structurally rather than by naming
  // a token. Naming one is how this assertion came to pin a legacy token that issue 1399 then
  // deleted; a property of the corpus cannot be retired out from under the check.
  const stylesheetOnly = collectCustomProperties({
    'styles/fabricate.css': corpus['styles/fabricate.css'],
  });
  const svelteOnly = collectCustomProperties(
    Object.fromEntries(Object.entries(corpus).filter(([file]) => file.startsWith('src/')))
  );
  const defined = collectCustomProperties(corpus);

  assert.ok(stylesheetOnly.size > 0, 'the global sheet declares custom properties');
  assert.ok(svelteOnly.size > 0, 'Svelte scoped blocks declare custom properties too');

  // THOSE TWO FLOORS ARE THE CHECK. `defined ⊇ stylesheetOnly` and `defined ⊇ svelteOnly` hold
  // BY CONSTRUCTION — `defined` is built over a superset of each input — so the two containment
  // loops that stood here could not fail in any tree, and they have been removed rather than
  // left reading as verification. What can fail is a walker going quiet: either half dropping to
  // zero satisfies every downstream absence gate built on this corpus.
  //
  // The one MERGE property a text scan can get wrong is discarding a repeat definition, which is
  // why the name below is asserted rather than the map's shape. `--fab-stepper-fill-height` is
  // declared at two different heights, and a merge that overwrote instead of appending would
  // leave one — silently making `resolveValueCandidates` certain where it should be ambiguous.
  assert.ok(
    (defined.get('--fab-stepper-fill-height') ?? []).length > 1,
    'a token defined at more than one height must keep every definition'
  );
});

test('the scan reaches a value written only into a token', () => {
  // END TO END over a synthetic corpus of REAL FILES (issue 1399 — see the fixture note in the
  // header for why it is no longer the real tree, and why an in-memory corpus will not do).
  //
  // The `.svelte` block carries NO pixel literal on the declaring line: the 40 lives only in a
  // `.css` in the same corpus. A text-only scan cannot see it, and with a text-only scan the
  // cheapest way to pay a ratchet down would be to move the literal into a token and leave the
  // pixel exactly where it is.
  //
  // Both files are load-bearing. The `.css` proves a stylesheet root is walked and read whole;
  // the `.svelte` proves `maskNonStyleRegions` runs, because the markup above its block carries
  // `height: 36px` as PROSE which must NOT be scanned — so the assertion on the matched values
  // fails if the mask is dropped, rather than only the assertion on the resolved text.
  //
  // The SEMICOLON in that prose is doing the work. `DECLARATION` requires `^` or one of `;{}`
  // before a property name, so the earlier wording — "docblock writes height: 36px in PROSE" —
  // could never have matched with the mask off either, and the trap it claimed to set was shut
  // from both sides. Do not tidy the punctuation away.
  const root = mkdtempSync(join(tmpdir(), 'fabricate-style-corpus-'));
  try {
    writeFileSync(join(root, 'tokens.css'), ':root {\n  --fixture-thumb: 40px;\n}\n');
    writeFileSync(
      join(root, 'Reader.svelte'),
      [
        '<!-- Prose, outside any style block; height: 36px is not a declaration here. -->',
        '<div class="thumb"></div>',
        '',
        '<style>',
        '  .thumb {',
        '    height: var(--fixture-thumb);',
        '  }',
        '</style>',
        '',
      ].join('\n')
    );

    const corpus = collectStyleCorpus({ roots: [root], extensions: ['.svelte', '.css'] });
    const files = Object.keys(corpus);
    assert.equal(files.length, 2, `the fixture corpus must hold both files, got ${files.join(', ')}`);

    const { occurrences } = scanPixelValues({ corpus, properties: ['height'], values: [36, 40] });

    assert.deepEqual(
      occurrences.map((record) => record.value),
      [40],
      'the 36px in the Svelte docblock prose is not a declaration and must not be scanned'
    );
    const [indirect] = occurrences;
    assert.ok(indirect.file.endsWith('Reader.svelte'), 'the hit belongs to the Svelte reader');
    assert.equal(indirect.raw, 'var(--fixture-thumb)');
    assert.equal(indirect.resolved, '40px');
    assert.ok(!/\d+px/.test(indirect.raw), 'the source line carries no pixel literal to match');
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
