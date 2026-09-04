/**
 * The `--fab-*` namespace is ONE generation, and area scoping is spelled out (issue 1399).
 *
 * Three generations of custom property were live at once — `--fab-v2-*`, `--fab-editor-*` and
 * `--fab-mv2-*` — and nothing governed which one a new token joined. `--fab-editor-*` had twenty
 * names and zero readers. Twelve of the manager's seventeen were single-declaration aliases that
 * forwarded a foundation token unconditionally, so the layer re-themed nothing and bought one
 * live effect: a primitive shared between the manager and the player rendered correctly in the
 * manager and UNSTYLED in the player, silently, because an out-of-scope custom property makes the
 * declaration invalid at computed-value time rather than failing.
 *
 * `openspec/specs/design-system/spec.md` now states the rule. This file is the gate.
 *
 * ── THE GATE IS A RAW-TEXT SCAN, AND IT OWNS THE COMMENTS ────────────────────────────────
 * A code-only scan acquires a blind spot the moment it strips comments: a commented-out
 * declaration, and — far more likely — a file that goes on NAMING a retired generation in prose
 * that is false after the collapse. So this scans raw text, and the change that landed it rewrote
 * every prose site the same grep reaches. The consequence is worth stating plainly, because it is
 * a real cost: no comment under `src/` or `styles/` may record what a token used to be called.
 * The retirement note lives in the spec and in this file. Every prose site that must go on naming
 * a retired generation — `openspec/specs/**`, `tests/**`, `AGENTS.md`, `DOMAIN.md`,
 * `scripts/lib/viewLabCases.js`, `.agents/skills/**` — sits outside the scanned roots, so the
 * gate does not contradict its own spec text.
 *
 * ── FIVE TRAPS, EACH ONE MEASURED RATHER THAN REASONED ABOUT ────────────────────────────
 *   1. `--fab-v<N>-` does NOT match `--fab-mv2-`: the character before `v2` is `m`. Both shapes
 *      are therefore banned explicitly, not as one pattern with a wildcard in front of the `v`.
 *   2. THE EXTENSION LIST MUST INCLUDE `.js`. `collectWorkingTreeSources` takes an explicit list
 *      with no default, for the reason its own docstring gives — "the omitted extensions are
 *      exactly the ones a caller does not notice missing" — and this corpus proved it: a `.js`
 *      module returned `'var(--fab-mv2-accent)'` as a STRING LITERAL, which is the one channel a
 *      CSS-only pass cannot see.
 *   3. Falsification is a MATRIX, not one probe: 3 name shapes x {declaration, read} x
 *      {`.css`, `.svelte`, `.js`}. A single probe proves the regex compiles, not that the scan
 *      reaches the file the next mistake will be made in.
 *   4. A RULE'S SELECTOR IS A LIST, and `String#includes` over the whole list is satisfied by any
 *      ONE compound. `.fabricate-app .oops, .fabricate-manager .ok { … var(--fab-manager-…) }`
 *      is the motivating defect written as one rule, and a comma-joined rule shared between the
 *      two areas is the most likely way it recurs, because sharing primitives across areas is
 *      what the collapse was for. Every selector test here therefore runs per COMPOUND, and the
 *      area compound carries a right-hand boundary so `.fabricate-manager-widget` does not pass
 *      on a prefix collision. THE SPLIT THAT FINDS THOSE COMPOUNDS IS NOT `split(',')`: a comma
 *      inside `:is(…)` or inside `[data-x="a,b"]` is not a list separator. Measured: ELEVEN of
 *      the 5044 rules in the two shipped stylesheets carry the first shape, and all eleven are
 *      already `.fabricate-manager` rules — so the naive split sat one declaration away from
 *      reddening a rule that is entirely inside the area. The split is `splitSelectorList`,
 *      which cuts at depth zero only.
 *   5. A NON-VACUITY FLOOR MUST NOT BE WRITTEN AGAINST THE CONSTANT IT POLICES. Looping over
 *      `SCANNED_EXTENSIONS` to prove each extension arrived narrows the check in step with the
 *      list, and the file-count floor does not cover the gap because `.css` contributes exactly
 *      ONE of the 688 files — while `styles/fabricate.css` is where all 41 deleted declarations
 *      and all 13 forwarders lived, so it is the single file the ban most needs to reach. The
 *      floors below are hard-coded per extension for that reason.
 *
 * ── WHAT THIS GATE DOES NOT CLAIM ───────────────────────────────────────────────────────
 * It bans three NAME SHAPES. It does not and cannot stop a fourth generation being minted under
 * a name it does not match — `--fab-gen3-` passes here. The requirement in the spec is the rule;
 * this is the part of it a text scan can decide, and saying so is the point of the change that
 * added it.
 *
 * The area-scoping rule is likewise enforced by SHAPE and not by intent. The global sheet and the
 * Svelte scoped `<style>` are policed as CSS; the remaining channel is a token spelled into a
 * STRING — `chanceColorScale.js` is the one that actually happened, and a template's
 * `style="… var(--fab-manager-x)"` is the same mistake in a `.svelte` file's markup rather than
 * in its `<style>`. Test 5 scans both file kinds' raw text for the three USE shapes — a `var()`
 * read, a `name:` declaration, and a quoted property name, which is how the CSSOM pair
 * `setProperty('--fab-manager-x', v)` / `getPropertyValue('--fab-manager-x')` spells it — rather
 * than for the name alone. That is a deliberate departure from the raw-name scan test 1 uses:
 * `--fab-manager-` is a LIVE prefix, and twenty-nine comments under `src/` correctly name it to
 * tell a reader which properties a component may not reach. Banning the name would delete the
 * rule's own documentation, so the quote class stops at `'` and `"` and excludes the backtick
 * those comments use.
 *
 * WHAT REMAINS UNCOVERED is one channel and it is named rather than implied: a module that
 * assembles the name ACROSS ITS PREFIX — `'--fab-' + area + '-accent'`, or a template literal
 * interpolating inside `--fab-manager-` itself — is textually incomplete, and no text scan can
 * help that. A fragment that keeps the prefix WHOLE, `'--fab-manager-' + key`, is not in that
 * gap: the quoted shape sees it.
 */
import assert from 'node:assert/strict';
import test from 'node:test';

import { collectWorkingTreeSources } from './helpers/sourceScan.js';
import {
  STYLE_CORPUS_EXTENSIONS,
  STYLE_CORPUS_ROOTS,
  collectStyleCorpus,
  declarationsIn,
  rulesIn,
  splitSelectorList,
} from './helpers/styleBlockScan.js';

/** The roots the product ships from. Prose that must name a retired generation lives outside. */
const SCANNED_ROOTS = Object.freeze(['src', 'styles']);

/**
 * `.js` is load-bearing — see trap 2 in the header. `.svelte` carries both scoped CSS and the
 * template-literal `style=` channel; `.css` carries the global sheet.
 */
const SCANNED_EXTENSIONS = Object.freeze(['.css', '.svelte', '.js']);

/**
 * How many files of each extension the raw-text scan must actually reach, HARD-CODED — see trap 5.
 *
 * These are floors and not counts: `.svelte` and `.js` sit at 306 and 381 today and may move
 * freely. `.css` is `1` because `styles/fabricate.css` is the whole global sheet, which is also
 * exactly why the floor cannot be inferred from the corpus — one file out of 688 is invisible to
 * any total.
 */
const CORPUS_FLOORS = Object.freeze([
  { extension: '.css', minimum: 1 },
  { extension: '.svelte', minimum: 100 },
  { extension: '.js', minimum: 100 },
]);

/**
 * The three retired shapes, as RAW TEXT patterns rather than as `var()` reads, so a declaration,
 * a read and a bare mention in prose all match. `<N>` is any run of digits, so retiring `--fab-v2-`
 * does not leave `--fab-v3-` available.
 */
const RETIRED_NAME_SHAPES = Object.freeze([
  { label: '--fab-v<N>-', pattern: /--fab-v\d+-/g },
  { label: '--fab-mv<N>-', pattern: /--fab-mv\d+-/g },
  { label: '--fab-editor-', pattern: /--fab-editor-/g },
]);

/**
 * The fourteen foundation tokens the twelve manager colour aliases and the two `--fab-v2-*`
 * colour aliases were inlined onto.
 *
 * ── WHY THIS LIST NEEDS A GATE AT ALL ───────────────────────────────────────────────────
 * Custom-property substitution is LAZY AND SITE-LOCAL. `--fab-mv2-border: var(--fab-border)`
 * declared on `.fabricate-manager` resolved `var(--fab-border)` AT `.fabricate-manager` and
 * inherited the resolved value down; after the inline each reading element resolves it for
 * itself. The substitution point moved at 919 sites, so "the alias was declared once" does not
 * license the change on its own — what licenses it is that no inline target is redeclared on any
 * selector a descendant of `.fabricate-manager` can match. That was true when it was measured and
 * ONE new `--fab-border:` inside the manager would end it, silently and in the wrong direction.
 * It is the only one of the change's three premises a future edit can break, so it ships as an
 * assertion rather than as a paragraph in a pull request.
 *
 * The predicate is a declaring-selector ALLOW-LIST rather than "can match a descendant of
 * `.fabricate-manager`", which is undecidable from a selector string.
 */
const INLINE_TARGETS = Object.freeze([
  '--fab-bg-1',
  '--fab-bg-2',
  '--fab-bg-3',
  '--fab-surface-raised',
  '--fab-border',
  '--fab-border-strong',
  '--fab-text',
  '--fab-text-muted',
  '--fab-text-subtle',
  '--fab-accent',
  '--fab-info',
  '--fab-warning',
  '--fab-danger',
  '--fab-shadow-lg',
]);

/** `:root`, or one compound of a theme block's two-selector list. */
const THEME_ROOT_COMPOUND = /^(?::root|:root\[data-fabricate-theme="[^"]+"\]|\.fabricate\[data-fabricate-theme="[^"]+"\])$/;

/** The prefix for an area-scoped custom property, which must not be read outside its area. */
const AREA_SCOPED_PREFIX = '--fab-manager-';

/** The area every `--fab-manager-*` property is scoped to. */
const AREA_SELECTOR = '.fabricate-manager';

/**
 * One compound that puts a rule inside the area — see trap 4 for why the boundary is not optional.
 *
 * `(?![\w-])` is what separates `.fabricate-manager` from `.fabricate-manager-widget`: a class name
 * continues through word characters and hyphens, so anything else — end of string, whitespace, a
 * combinator, `[`, `.`, `:` — ends the name and means the compound really is the area. Derived from
 * `AREA_SELECTOR` rather than spelled again, so renaming the area cannot leave the two disagreeing.
 */
const AREA_COMPOUND = new RegExp(`${AREA_SELECTOR.replace(/\./gu, '\\.')}(?![\\w-])`, 'u');

/**
 * The three shapes that USE an area-scoped property, for the channels that are not CSS.
 *
 * A use rather than the bare name: see the closing paragraph of the header. The three are the CSS
 * read, the CSS declaration, and the CSSOM pair — `el.style.setProperty('--fab-manager-x', v)`
 * and `getComputedStyle(el).getPropertyValue('--fab-manager-x')`, which reach the same property
 * from JavaScript carrying neither a `var(` nor a trailing colon, so the first two shapes are
 * blind to them. Zero live occurrences today; it is one line of scan for a channel that is
 * textually complete, which is the only kind a text scan can decide at all.
 *
 * The quote class is `'` and `"` and deliberately NOT a backtick: twenty-nine comments under
 * `src/` write the prefix inside backticks in prose, to say which properties a component may not
 * reach, and banning that spelling would delete the rule's own documentation.
 */
const AREA_USE_SHAPES = Object.freeze([
  { label: 'read', pattern: new RegExp(`var\\(\\s*${AREA_SCOPED_PREFIX}`, 'u') },
  { label: 'declaration', pattern: new RegExp(`${AREA_SCOPED_PREFIX}[\\w-]*\\s*:`, 'u') },
  { label: 'CSSOM name', pattern: new RegExp(`['"]${AREA_SCOPED_PREFIX}`, 'u') },
]);

/**
 * The compounds of a selector LIST that FAIL `predicate` — trap 4.
 *
 * `rulesIn` reports a rule's whole selector list as one string, so any test written with
 * `String#includes` over that string is satisfied by one compound and blind to its siblings.
 * Both selector assertions in this file route through here so neither can drift back.
 *
 * THE SPLIT IS `splitSelectorList`, NOT `String#split(',')`, and the difference is a measured
 * false failure rather than a nicety: a comma inside a functional pseudo-class is an argument
 * separator, so `.fabricate-manager .x input:is([type="text"], [type="number"])` is ONE compound
 * that the naive split shreds into two, the second of which (`[type="number"])`) is not a
 * selector and matches nothing. Eleven live rules carry that shape and all eleven are already
 * `.fabricate-manager` rules, so the naive split sat one declaration away from reddening a rule
 * wholly inside the area — with advice ("if only one compound belongs to the manager, it is two
 * rules") that its author could not act on.
 *
 * It returns the failing compounds rather than a boolean so the caller can CITE them. A rule with
 * a five-item list and one offending item otherwise reports the whole list and leaves the reader
 * to find which item is meant.
 *
 * @param {string} selector A rule's whole selector list.
 * @param {(compound: string) => boolean} predicate
 * @returns {string[]} The compounds failing `predicate`, in source order.
 */
function compoundsFailing(selector, predicate) {
  return splitSelectorList(selector).filter((compound) => !predicate(compound));
}

/**
 * True when EVERY compound of a selector LIST satisfies `predicate` — trap 4.
 *
 * @param {string} selector A rule's whole selector list.
 * @param {(compound: string) => boolean} predicate
 * @returns {boolean}
 */
function everyCompound(selector, predicate) {
  return compoundsFailing(selector, predicate).length === 0;
}

/**
 * Every rule in BOTH shipped stylesheets — the global sheet and every Svelte scoped `<style>`.
 *
 * It reads both because the licence for the inline is a claim about the whole cascade, and
 * `styles/**` is the only half stylelint globs (`tests/helpers/styleBlockScan.js:4-7`), which
 * makes the scoped blocks the half most likely to drift. A walk of `styles/` alone left the
 * second premise-guard blind to 180 files: inserting `--fab-text-muted: rgb(255 0 0 / 50%)` into
 * a scoped block whose next line reads `color: var(--fab-text-muted)` was green.
 *
 * The roots and extensions are the SHARED constants rather than a list spelled again here.
 * Spelling them again dropped `.scss`, which `STYLE_CORPUS_EXTENSIONS` carries deliberately —
 * `lint:css` globs `styles/**\/*.{css,scss}`, so a future `.scss` file is gated by stylelint and
 * would have been invisible to this gate. Inert while the tree has none, and exactly the kind of
 * hand-copied list that stops being inert without anybody editing this file.
 */
let cachedRules = null;
function shippedStyleRules() {
  if (cachedRules === null) {
    const corpus = collectStyleCorpus({
      roots: [...STYLE_CORPUS_ROOTS],
      extensions: [...STYLE_CORPUS_EXTENSIONS],
    });
    cachedRules = Object.entries(corpus).flatMap(([file, css]) =>
      rulesIn(css).map((rule) => ({ ...rule, file }))
    );
  }
  return cachedRules;
}

/**
 * Floor {@link shippedStyleRules} on BOTH halves, so neither can silently stop contributing.
 *
 * Written as file counts rather than rule counts because the failure being guarded against is a
 * root or an extension dropping out of the walk, which takes one side to zero while the other
 * keeps every assertion below it green.
 */
function assertBothCorporaReached(rules) {
  const files = [...new Set(rules.map((rule) => rule.file))];
  const globalSheets = files.filter((file) => file.endsWith('.css')).length;
  const scopedBlocks = files.filter((file) => file.endsWith('.svelte')).length;
  assert.ok(
    globalSheets >= 1,
    'no `.css` file contributed a rule, so the global sheet — where all 41 deleted declarations ' +
      'and all 13 forwarders lived — is not being walked at all.'
  );
  assert.ok(
    scopedBlocks > 100,
    `only ${scopedBlocks} Svelte scoped blocks contributed a rule, against the ~180 this tree ` +
      'holds. That is the half stylelint never globs, so it is the half a gate must not lose.'
  );
}

test('no retired token generation survives anywhere under src/ or styles/', () => {
  const sources = collectWorkingTreeSources([...SCANNED_ROOTS], [...SCANNED_EXTENSIONS]);
  const files = Object.keys(sources);

  // NOT VACUOUS, and this is the whole reason the assertion below can be trusted: an absence
  // gate over an empty corpus passes forever. The per-extension floors are HARD-CODED rather
  // than derived from `SCANNED_EXTENSIONS` — see trap 5. A floor written as a loop over the
  // constant under test narrows itself when the constant narrows, and dropping `.css` costs the
  // total exactly one file out of 688 while blinding the gate to the entire global sheet.
  assert.ok(
    files.length > 600,
    `the scanned corpus fell to ${files.length} files, which is far below the ~690 this repository ` +
      'holds under `src/` and `styles/` at these three extensions. An absence gate over an empty ' +
      'corpus passes forever, so this is a broken scan rather than a clean tree.'
  );
  for (const { extension, minimum } of CORPUS_FLOORS) {
    const reached = files.filter((file) => file.endsWith(extension)).length;
    assert.ok(
      reached >= minimum,
      `only ${reached} ${extension} files reached the scan, against a floor of ${minimum}, so this ` +
        'gate is blind to that channel. `.css` is the global sheet, which every retired ' +
        'declaration and every forwarder lived in; `.js` is the channel that has actually ' +
        'happened, a module returning a token as a string literal, which no CSS-only pass can see.'
    );
  }

  const offences = [];
  for (const [file, source] of Object.entries(sources)) {
    for (const [index, text] of source.split('\n').entries()) {
      for (const { label, pattern } of RETIRED_NAME_SHAPES) {
        pattern.lastIndex = 0;
        if (pattern.test(text)) offences.push(`${file}:${index + 1} (${label}) ${text.trim()}`);
      }
    }
  }

  assert.deepEqual(
    offences,
    [],
    'the `--fab-v<N>-`, `--fab-mv<N>-` and `--fab-editor-` generations are RETIRED and must not ' +
      'be declared, read, or named in a comment under `src/` or `styles/` — see "The token ' +
      'namespace is one generation and names its purpose" in ' +
      '`openspec/specs/design-system/spec.md`. A surface that wants to name a colour it already ' +
      'gets from a foundation token reads that token directly; a forwarding alias hides it from ' +
      'every surface outside its own selector. Prose that must name a retired generation belongs ' +
      'in the spec or in a test, both outside these roots:\n  ' + offences.join('\n  ')
  );
});

test('every inline target is declared only at theme root', () => {
  const allRules = shippedStyleRules();
  assertBothCorporaReached(allRules);

  const declaring = new Map(INLINE_TARGETS.map((name) => [name, []]));
  for (const rule of allRules) {
    for (const declaration of declarationsIn(rule.file, rule.body)) {
      const held = declaring.get(declaration.property);
      if (held) held.push(rule);
    }
  }

  // Non-vacuity: seven theme blocks x fourteen tokens, all fourteen from the global sheet — the
  // Svelte half contributes ZERO today, which is the fact this assertion exists to keep true, so
  // the floor for that half is the file count in `assertBothCorporaReached` and not this total.
  // A drop here means the walker stopped finding the theme blocks, at which point the allow-list
  // below is satisfied by an empty set.
  const total = [...declaring.values()].reduce((sum, rules) => sum + rules.length, 0);
  assert.ok(
    total >= 90,
    `only ${total} declarations of the fourteen inline targets were found, against the 98 this ` +
      'sheet carries (seven theme blocks x fourteen). The allow-list assertion below is trivially ' +
      'satisfied by an empty set, so this is a broken walk rather than a tidied stylesheet.'
  );
  for (const [name, rules] of declaring) {
    assert.ok(rules.length > 0, `${name} is no longer declared anywhere, so it is not a foundation token`);
  }

  const offences = [];
  for (const [name, rules] of declaring) {
    for (const rule of rules) {
      if (everyCompound(rule.selector, (compound) => THEME_ROOT_COMPOUND.test(compound))) continue;
      offences.push(`${name} declared on \`${rule.selector}\` (${rule.file}:${rule.line})`);
    }
  }

  assert.deepEqual(
    offences,
    [],
    'a foundation token that twelve manager aliases and two app aliases were INLINED onto is ' +
      'declared somewhere other than `:root` or a theme block. Custom-property substitution is ' +
      'lazy and site-local: the inline moved the substitution point from `.fabricate-manager` to ' +
      'each reading element, and that is value-preserving only while every one of these fourteen ' +
      'resolves to the same text at both places. One redeclaration inside the manager breaks it ' +
      'silently, at hundreds of sites, in the direction nobody looks:\n  ' + offences.join('\n  ')
  );
});

test('a rule is cited at the line its own selector starts on', () => {
  // The two assertions above report `file:line`, and until this branch every rule was cited at
  // the PREVIOUS rule's `}` — in a Svelte file, where `maskNonStyleRegions` blanks the whole
  // template, at line 1 for every offence in the file. That was a one-flag fix inside `rulesIn`
  // (`preludeStarted` rather than `prelude === ''`) which only ever changes failure-message text,
  // so nothing above can see it regress. This is what sees it — and it now guards the walk for
  // every caller rather than only this file: issue 1497 moved `rulesIn` into
  // `tests/helpers/styleBlockScan.js` so the `:focus`, weight, shadow and radius gates could
  // reuse it rather than write a fresh walk that would reacquire exactly this defect.
  //
  // Written as an invariant over the whole corpus rather than as one hand-picked `file:line`
  // pair, which would rot on the next edit to that stylesheet: masking and comment stripping both
  // preserve offsets, so a rule's cited line must be a line of the file on disk that CONTAINS the
  // first token of that rule's selector. Whitespace collapsing cannot break the check, because
  // the first token has no whitespace in it by construction.
  const rules = shippedStyleRules();
  const sources = collectWorkingTreeSources([...STYLE_CORPUS_ROOTS], [...STYLE_CORPUS_EXTENSIONS]);

  const offences = [];
  let checked = 0;
  for (const rule of rules) {
    const [head] = rule.selector.split(/\s/u);
    if (head === undefined || head === '') continue;
    const cited = (sources[rule.file] ?? '').split('\n')[rule.line - 1];
    checked += 1;
    if (cited === undefined || !cited.includes(head)) {
      offences.push(`${rule.file}:${rule.line} \`${rule.selector}\` cites "${(cited ?? '').trim()}"`);
    }
  }

  assert.ok(
    checked > 1000,
    `only ${checked} rules were line-checked, against the ~4000 both stylesheets hold. An ` +
      'invariant asserted over an empty set passes forever.'
  );
  assert.deepEqual(
    offences,
    [],
    'a rule is reported at a line that does not hold the start of its selector, so every offence ' +
      'either of the assertions above prints sends its reader to the wrong place in a ' +
      '20,000-line stylesheet — or, for a Svelte scoped block, to line 1:\n  ' + offences.join('\n  ')
  );
});

test('an area-scoped manager property is declared and read only inside its area', () => {
  const allRules = shippedStyleRules();
  assertBothCorporaReached(allRules);
  const rules = allRules.filter((rule) => rule.body.includes(AREA_SCOPED_PREFIX));

  // Non-vacuity, and it is the reason this gate is written against the requirement's own words
  // rather than against a directory. The obvious proxy — "no file outside `apps/manager/**`
  // reads one" — is UNSATISFIABLE here: all of these properties are read from the global sheet,
  // which is outside that directory, so the proxy would red on 100% of its own population on
  // arrival. Manager CSS living in the global stylesheet is the design, not the defect.
  assert.ok(
    rules.length >= 10,
    `only ${rules.length} rules mention \`${AREA_SCOPED_PREFIX}\`, against the fourteen — carrying ` +
      'sixteen declaration and read sites — the global sheet holds. With none, the assertion ' +
      'below is vacuous.'
  );

  // THE TOP-LEVEL SPLIT IS EXERCISED BY THE LIVE CORPUS, not only by the fixtures in
  // `style-block-scan.test.js`. A rule whose naive `split(',')` yields more items than
  // `splitSelectorList` does is one this test would have shredded, and it would have been
  // reddened on a fragment the moment it declared an area-scoped property. A floor of ONE rather
  // than the eleven measured today, because the population is free to move and a count would
  // turn every unrelated stylesheet edit into a failure here.
  const shredded = allRules.filter(
    (rule) => rule.selector.split(',').length !== splitSelectorList(rule.selector).length
  );
  assert.ok(
    shredded.length >= 1,
    'no rule in either stylesheet carries a comma inside a functional pseudo-class or an ' +
      'attribute value any more, so nothing live exercises the top-level split and a regression ' +
      "to `String#split(',')` would go unnoticed here. Prove the split against a fixture instead."
  );

  // EVERY compound, with a boundary, and both halves are load-bearing — see trap 4. A rule whose
  // selector list is `.fabricate-app .oops, .fabricate-manager .ok` reads a manager property from
  // a player surface under its first compound, which is this change's motivating defect written
  // as one rule; and `.fabricate-manager-widget` is a different class that merely starts the same.
  const offences = rules.flatMap((rule) => {
    const outside = compoundsFailing(rule.selector, (compound) => AREA_COMPOUND.test(compound));
    if (outside.length === 0) return [];
    return [
      `${rule.file}:${rule.line} \`${rule.selector}\` — outside the area: \`${outside.join('`, `')}\``,
    ];
  });

  assert.deepEqual(
    offences,
    [],
    `\`${AREA_SCOPED_PREFIX}*\` is the prefix for an AREA-SCOPED custom property and must not be ` +
      `declared or read outside \`${AREA_SELECTOR}\` — by EVERY compound of the rule's selector ` +
      'list, because the cascade applies a comma-joined rule to each of them separately. Outside ' +
      'the area the property is undefined, the declaration is invalid at computed-value time, and ' +
      'the value falls back to inheritance — nothing fails, it just looks wrong. Each offence ' +
      'names the compounds that sit outside the area: where they are some of several, split the ' +
      'list so only the manager compound keeps this property; where they are the whole list, the ' +
      'rule is reading an area-scoped property from outside the area, and what it wants is a ' +
      'foundation token:\n  ' + offences.join('\n  ')
  );
});

test('no Svelte scoped style reaches an area-scoped manager property', () => {
  // A scoped `<style>` cannot guarantee its host renders under `.fabricate-manager`: a component
  // is placed in a directory, not in a DOM subtree, and `apps/manager/ComplicationSummaryRow` is
  // the standing counterexample — it lives under `apps/manager/` and is imported by two player
  // surfaces that render it under `.fabricate-app`. So the rule for `src/**` is stricter than the
  // rule for the global sheet, and it is a rule about SCOPED CSS rather than about a folder.
  //
  // `selection-checkbox-mounted.test.js` already asserts this shape for one component. This
  // generalises it rather than replacing it with something weaker: that suite reads the primitive
  // it is about and fails with that primitive's name on it.
  const corpus = collectStyleCorpus({ roots: ['src'], extensions: ['.svelte'] });
  const files = Object.keys(corpus);

  assert.ok(
    files.length > 100,
    `only ${files.length} Svelte scoped blocks reached the scan, against the ~180 this tree holds. ` +
      'An absence gate over an empty corpus passes forever.'
  );

  const offences = [];
  for (const [file, css] of Object.entries(corpus)) {
    for (const [index, text] of css.split('\n').entries()) {
      if (text.includes(AREA_SCOPED_PREFIX)) offences.push(`${file}:${index + 1} ${text.trim()}`);
    }
  }

  assert.deepEqual(
    offences,
    [],
    `a Svelte scoped \`<style>\` reads or declares a \`${AREA_SCOPED_PREFIX}*\` property. A ` +
      'component is placed in a directory, not in a DOM subtree, so its scoped CSS cannot ' +
      `guarantee that its host renders under \`${AREA_SELECTOR}\` — and where it does not, the ` +
      'property is undefined and the declaration silently falls back to inheritance. Read a ' +
      'foundation token, or move the rule into the global sheet under an area selector:\n  ' +
      offences.join('\n  ')
  );
});

test('no module or template under src/ spells an area-scoped manager property into a string', () => {
  // The CHANNEL THAT ACTUALLY HAPPENED, generalised. `chanceColorScale.js` returned
  // `'var(--fab-mv2-accent)'` as a string literal, and a `.js` module returning
  // `'var(--fab-manager-task-drop-grid)'` is the same mistake against a live prefix: tests 3 and 4
  // both read CSS, so neither can see it, and `--fab-manager-` is deliberately absent from
  // `RETIRED_NAME_SHAPES` because the prefix is the rule rather than the offence. A `.svelte`
  // TEMPLATE is the same channel — `style="… var(--fab-manager-x)"` sits outside every `<style>`
  // block, so `collectStyleCorpus` masks it away — which is why both extensions are scanned here.
  //
  // Scanned by USE SHAPE, not by name: twenty-nine comments under `src/` name the prefix in order
  // to say a component may NOT reach it, and a raw-name ban would delete the rule's own
  // documentation. `styles/` is excluded because the global sheet is where these properties
  // legitimately live; test 3 is what polices it.
  //
  // The three shapes are not the same as "prose is exempt", and the difference is measured: a
  // comment writing a CONCRETE name followed by a colon matches the declaration shape, and one
  // quoting a concrete name in straight quotes matches the CSSOM shape. Neither is live — all
  // twenty-nine use the backticked `--fab-manager-*` wildcard spelling — but the exemption is for
  // that spelling and not for comments as a class.
  const sources = collectWorkingTreeSources(['src'], ['.js', '.svelte']);
  const files = Object.keys(sources);

  for (const extension of ['.js', '.svelte']) {
    const reached = files.filter((file) => file.endsWith(extension)).length;
    assert.ok(
      reached > 100,
      `only ${reached} ${extension} files reached the scan, against the ~380 and ~306 this tree ` +
        'holds. An absence gate over an empty corpus passes forever.'
    );
  }

  const offences = [];
  for (const [file, source] of Object.entries(sources)) {
    for (const [index, text] of source.split('\n').entries()) {
      for (const { label, pattern } of AREA_USE_SHAPES) {
        if (pattern.test(text)) offences.push(`${file}:${index + 1} (${label}) ${text.trim()}`);
      }
    }
  }

  assert.deepEqual(
    offences,
    [],
    `a module or template under \`src/\` spells a \`${AREA_SCOPED_PREFIX}*\` property into a ` +
      'string. A JavaScript module and a Svelte template are placed in a directory, not in a DOM ' +
      `subtree, so neither can guarantee that the element it styles renders under ` +
      `\`${AREA_SELECTOR}\` — and where it does not, the property is undefined, the declaration is ` +
      'invalid at computed-value time, and the value falls back to inheritance. Return a ' +
      'foundation token, or put the rule in the global sheet under an area selector. Prose may ' +
      'still name the prefix, in the wildcard spelling the twenty-nine comments under `src/` ' +
      'use — `--fab-manager-*` — which matches none of the three shapes; a concrete name ' +
      'followed by a colon, or in straight quotes, does match wherever it is written:\n  ' +
      offences.join('\n  ')
  );
});
