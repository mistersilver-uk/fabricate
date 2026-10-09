/**
 * The spacing scale is a rule the product can be checked against (issue 1448).
 * `openspec/specs/ui-visual-style/spec.md` has made the 4px spacing scale normative under its
 * "Spacing scale" section since the design system landed — padding, margin and gap "must derive
 * from a shared 4px-based spacing scale ... rather than from raw pixel literals" — and NOTHING
 * checked it. Worse, half the corpus could not have been checked by the tool that would normally
 * do it: `npm run lint:css` globs `styles/**` and Svelte scoped `<style>` blocks are not in it,
 * so the 1642 spacing declarations most likely to drift were entirely unlinted. Measured against
 * that silence: 932 raw literals across 620 (file, property, value) keys in 115 files.
 * -- WHAT MAKES THIS NOT VACUOUS -----------------------------------------------------------
 * An absence gate over an empty corpus passes forever. Five independent controls stand against
 * that, and they are independent on purpose rather than five spellings of one floor:
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';

import {
  STYLE_CORPUS,
  assertGateCases,
  checkGate,
  emptyMarkerFailure,
  exemptAt,
  gateOver,
  styleCorpusOf,
  workingTree,
} from '../helpers/designSystemRatchet.js';
import { repoRoot } from '../helpers/sourceScan.js';
import {
  MAX_VAR_CHAIN_DEPTH,
  pixelValuesIn,
  scanPixelDeclarations,
  varReferencesIn,
} from '../helpers/styleBlockScan.js';

import {
  CLEARANCE_MAXIMUM,
  CLEARANCE_MINIMUM,
  FLOOR_REFERENCE_STYLESHEET_SPACING_DECLARATIONS,
  FLOOR_REFERENCE_SVELTE_SPACING_DECLARATIONS,
  HAIRLINE_MAGNITUDE,
  SCANNED_SPACING_PROPERTIES,
  SPACING_SCALE_PREFIX,
  isExemptSpacingPixels,
  isSpacingScaleToken,
} from './spacing-known-literals.js';
import {
  inSvelteScope,
  offScaleLengthsIn,
  scaleOf,
  spacingContext,
} from './spacing-scale-classifier.js';

/** Floors with deliberate headroom below the roughly 1445 and 1642 they were chosen against. */
const STYLESHEET_SPACING_DECLARATION_FLOOR = 1289;
const SVELTE_SPACING_DECLARATION_FLOOR = 1450;

/** The spacing declarations of one side's style corpus, with the published scale held opaque. */
const scanSpacing = (corpus, accept, opaqueProperty = isSpacingScaleToken) =>
  scanPixelDeclarations({ corpus, properties: SCANNED_SPACING_PROPERTIES, accept, opaqueProperty });

/** Every literal the spec does not exempt, as the debt. */
const rawSpacing = (corpus) => scanSpacing(corpus, (pixels) => !isExemptSpacingPixels(pixels));

/** The corpus is walked once, lazily, so a walk failure is reported as a test. */
let cached = null;
function scan() {
  if (cached === null) {
    const { readFile, listFiles } = workingTree(STYLE_CORPUS);
    const styleCorpus = styleCorpusOf(readFile, listFiles());
    const corpus = styleCorpus.styles;
    cached = {
      corpus,
      // Each declaration with its rule's selector and its own line, for the sheet's absolute check.
      styleCorpus,
      raw: rawSpacing(corpus),
      // The complement, over the same corpus and the same definitions.
      exempt: scanSpacing(corpus, isExemptSpacingPixels),
      // Control 3's other half: nothing held opaque, so every scale token resolves to its own
      // pixel value and this must find strictly more.
      resolved: scanSpacing(
        corpus,
        () => true,
        () => false
      ),
    };
  }
  return cached;
}

/** One side's raw spacing literals, one site per occurrence, netting a move within a file. */
const SPACING_GATE = gateOver([STYLE_CORPUS], (readFile, files) =>
  rawSpacing(styleCorpusOf(readFile, files).styles).occurrences.map((record) => ({
    file: record.file,
    line: record.line,
    id: `${record.property} ${record.value}px`,
    value: `${record.value}px`,
  }))
);

/** `styles/**` on one side, Svelte scoped blocks on the other. */
const isStylesheet = (record) => record.file.startsWith('styles/');

/** The `### Spacing scale` section that owns the rule, so a fragment cannot match elsewhere. */
function spacingRequirement() {
  const spec = readFileSync(join(repoRoot, 'openspec/specs/ui-visual-style/spec.md'), 'utf8');
  const heading = '### Spacing scale';
  const start = spec.indexOf(heading);
  assert.ok(
    start !== -1,
    'the ui-visual-style spec no longer carries a "Spacing scale" section. This gate exists only ' +
      'to enforce that rule — if it has been renamed, retarget this test; if it has been dropped, ' +
      'delete this gate deliberately rather than leaving it policing a rule the specs no longer ' +
      'make.'
  );
  const end = spec.indexOf('\n### ', start + heading.length);
  return spec.slice(start, end === -1 ? spec.length : end);
}

test('the spacing scale this gate enforces is still the spec’s', () => {
  const requirement = spacingRequirement();

  assert.ok(
    requirement.includes('must derive from a shared 4px-based spacing scale'),
    'the spec no longer states the spacing scale as the source of padding, margin and gap'
  );
  assert.ok(
    requirement.includes('rather than from raw pixel literals'),
    'the spec no longer prohibits raw pixel literals, so this gate is banning them on its own ' +
      'authority'
  );

  // The exemptions, asserted FROM this gate's own constants.
  assert.ok(
    requirement.includes('Documented literal exemptions that must NOT be tokenized'),
    'the spec no longer documents any literal exemption, so the two predicates in ' +
      '`spacing-known-literals.js` are permissions nothing published grants'
  );
  assert.ok(
    requirement.includes(`\`${HAIRLINE_MAGNITUDE}px\` hairlines`),
    `the spec no longer exempts ${HAIRLINE_MAGNITUDE}px hairlines`
  );
  assert.ok(
    requirement.includes(`\`-${HAIRLINE_MAGNITUDE}px\` overlap bleeds`),
    `the spec no longer exempts -${HAIRLINE_MAGNITUDE}px overlap bleeds. The predicate is written ` +
      'on the ABSOLUTE value precisely because the spec exempts both signs, and the scanner is ' +
      'sign-blind — see the docblock in `spacing-known-literals.js`.'
  );
  assert.ok(
    requirement.includes(`${CLEARANCE_MINIMUM}–${CLEARANCE_MAXIMUM}px range`),
    `the spec no longer exempts the ${CLEARANCE_MINIMUM}-${CLEARANCE_MAXIMUM}px clearance band ` +
      'as this gate spells it. A band widened in the spec and here at once is a decision; a band ' +
      'widened in only one of them is a bug, and this is the half that catches the quiet one.'
  );
  assert.ok(
    requirement.includes(SPACING_SCALE_PREFIX),
    `the spec no longer names any \`${SPACING_SCALE_PREFIX}\` token, so nothing published says ` +
      'which indirection this scan is entitled to hold opaque'
  );
});

test('every spacing property spelling is scanned, including the logical longhands', () => {
  const scanned = new Set(SCANNED_SPACING_PROPERTIES);

  // The logical longhands contribute ZERO occurrences today.
  // structural guard: no base comparison would notice them being dropped from the list, and
  // a rewrite that switched `padding-left` for `padding-inline-start` would then walk straight
  // around the gate carrying its literals with it.
  const missing = [];
  for (const family of ['padding', 'margin']) {
    for (const side of ['block', 'inline']) {
      for (const suffix of ['', '-start', '-end']) {
        const property = `${family}-${side}${suffix}`;
        if (!scanned.has(property)) missing.push(property);
      }
    }
  }
  for (const family of ['scroll-padding', 'scroll-margin']) {
    for (const suffix of ['', '-top', '-right', '-bottom', '-left']) {
      if (!scanned.has(`${family}${suffix}`)) missing.push(`${family}${suffix}`);
    }
    for (const side of ['block', 'inline']) {
      for (const suffix of ['', '-start', '-end']) {
        if (!scanned.has(`${family}-${side}${suffix}`)) missing.push(`${family}-${side}${suffix}`);
      }
    }
  }
  for (const property of ['row-gap', 'column-gap', 'border-spacing']) {
    if (!scanned.has(property)) missing.push(property);
  }

  assert.deepEqual(
    missing,
    [],
    'a spacing property spelling has been dropped from SCANNED_SPACING_PROPERTIES. Each one is a ' +
      'way to write the same declaration, so an unscanned spelling is a rename away from being a ' +
      'bypass:\n  ' +
      missing.join('\n  ')
  );
});

test('both stylesheet corpora are still being scanned', () => {
  const { corpus, raw } = scan();
  const stylesheet = raw.declarations.filter(isStylesheet).length;
  const svelte = raw.declarations.length - stylesheet;

  assert.ok(
    stylesheet >= STYLESHEET_SPACING_DECLARATION_FLOOR,
    `only ${stylesheet} spacing declarations found under styles/, against roughly ` +
      `${FLOOR_REFERENCE_STYLESHEET_SPACING_DECLARATIONS} when the floor of ` +
      `${STYLESHEET_SPACING_DECLARATION_FLOOR} was set. The global sheet has not shrunk by a ` +
      'tenth — the scan has stopped reading it.'
  );
  assert.ok(
    svelte >= SVELTE_SPACING_DECLARATION_FLOOR,
    `only ${svelte} spacing declarations found in Svelte <style> blocks, against roughly ` +
      `${FLOOR_REFERENCE_SVELTE_SPACING_DECLARATIONS} when the floor of ` +
      `${SVELTE_SPACING_DECLARATION_FLOOR} was set. This is the corpus stylelint cannot reach, so ` +
      'nothing else in the repository would notice: the likely cause is the `<style>` ' +
      'extractor, not 200 deleted components. A broken extractor makes this gate report ' +
      'a CLEANER tree, which is why the floor is stated per corpus rather than over the total.'
  );
  assert.ok(
    Object.keys(corpus).length > 150,
    `only ${Object.keys(corpus).length} files contributed any CSS at all`
  );
});

test('the published spacing scale is still in use in BOTH corpora', () => {
  const { raw } = scan();

  // A population this gate is NOT asserting the absence of, so it survives the debt being paid
  // down to zero and still notices a corpus that has stopped being read.
  const referencing = { stylesheet: 0, svelte: 0 };
  const names = new Set();
  for (const declaration of raw.declarations) {
    const scaleNames = varReferencesIn(declaration.value)
      .map((reference) => reference.name)
      .filter(isSpacingScaleToken);
    if (scaleNames.length === 0) continue;
    for (const name of scaleNames) names.add(name);
    if (isStylesheet(declaration)) referencing.stylesheet += 1;
    else referencing.svelte += 1;
  }

  // THE FILTER IS WHAT MAKES THIS A CONTROL ON THE SCALE rather than on `var()` in general.
  assert.ok(
    [...names].every(isSpacingScaleToken),
    `a name counted here is not a \`${SPACING_SCALE_PREFIX}\` token, so "the scale is in use" is ` +
      'being decided by some other custom property'
  );

  assert.ok(
    referencing.stylesheet > 0 && referencing.svelte > 0,
    `the published scale is referenced by ${referencing.stylesheet} spacing declarations under ` +
      `styles/ and ${referencing.svelte} in Svelte <style> blocks. A zero on either side means ` +
      'that corpus is not being read, or its `var()` references are no longer being parsed — ' +
      'and the second of those makes this gate hold the scale opaque for nothing.'
  );
});

test('var() resolution is running, and the published scale is what it holds opaque', () => {
  const { raw, resolved } = scan();

  assert.ok(
    resolved.maxDepth >= 1,
    'with every definition visible, no spacing declaration resolved through a single `var()`, so ' +
      'resolution is inert. A text-only scan passes every other assertion in this file while ' +
      'making the cheapest way to pay this ratchet down "move the literal into a private token" ' +
      '— the pixel does not move and the gate goes green.'
  );
  assert.ok(
    resolved.occurrences.length > raw.occurrences.length,
    `resolving with the scale visible found ${resolved.occurrences.length} occurrences and ` +
      `holding it opaque found ${raw.occurrences.length}. Holding it opaque must find strictly ` +
      'fewer: the difference IS the sanctioned population, every `padding: ' +
      `var(${SPACING_SCALE_PREFIX}-3)` +
      ') in the product. Equal numbers mean `opaqueProperty` is not reaching the resolver, and ' +
      'this gate has started counting correct token use as debt.'
  );
  assert.ok(
    raw.maxDepth < MAX_VAR_CHAIN_DEPTH,
    `the deepest var() chain is now ${raw.maxDepth}, at the cap of ${MAX_VAR_CHAIN_DEPTH}`
  );
  assert.deepEqual(
    [...raw.capReached, ...resolved.capReached],
    [],
    'these declarations hit the resolution depth cap, so their candidate sets are INCOMPLETE and ' +
      'a literal beyond the cap reads as absent:\n  ' +
      [...raw.capReached, ...resolved.capReached].join('\n  ')
  );
});

test('both documented exemptions are live, and nothing else is exempt', () => {
  const { exempt } = scan();

  const hairlines = exempt.occurrences.filter(
    (record) => Math.abs(record.value) === HAIRLINE_MAGNITUDE
  );
  const clearances = exempt.occurrences.filter(
    (record) =>
      Math.abs(record.value) >= CLEARANCE_MINIMUM && Math.abs(record.value) <= CLEARANCE_MAXIMUM
  );

  assert.ok(
    hairlines.length > 0,
    `no ${HAIRLINE_MAGNITUDE}px spacing literal is exempt any more. Either the corpus has lost ` +
      'every hairline — which it has not — or the predicate has stopped matching them, in which ' +
      'case they are about to arrive as new debt on someone else’s change.'
  );
  assert.ok(
    clearances.length > 0,
    `no literal in the ${CLEARANCE_MINIMUM}-${CLEARANCE_MAXIMUM}px band is exempt any more, for ` +
      'the same reasons'
  );

  // The two bands are the WHOLE exemption. A predicate widened to swallow a third band would
  // otherwise show up only as a heap of shrunk entries, which reads like debt paid down.
  const stray = exempt.occurrences.filter(
    (record) => !hairlines.includes(record) && !clearances.includes(record)
  );
  assert.deepEqual(
    stray.map((record) => `${record.file}:${record.line} ${record.property} ${record.value}px`),
    [],
    'a value outside both documented bands is being treated as exempt, so the predicate has been ' +
      'widened past what `openspec/specs/ui-visual-style/spec.md` publishes'
  );
});

/**
 * What this ratchet does not see: a value a component computes in script and writes into a `style`
 * attribute, as `components/Medallion` writes `width`/`height` from its own `size` prop. That is a
 * size rather than spacing, so it is not this ratchet's debt; it is named because closing the gap
 * would mean resolving a token through Svelte markup and a JS prop default, a different scanner
 * from this one, and the control-height ladder records the same blind spot. So "no new raw spacing
 * literal has been introduced" is a claim about what the two stylesheet corpora declare;
 * `spacing-scale-markup.test.js` holds the Svelte markup's static styles.
 */
test('no new raw spacing literal has been introduced', (t) => {
  checkGate(
    t,
    SPACING_GATE,
    'Padding, margin and gap MUST derive from the published spacing scale — see the "Spacing ' +
      'scale" section of `openspec/specs/ui-visual-style/spec.md`. Use the numeric tokens ' +
      `(\`${SPACING_SCALE_PREFIX}-1\` through \`${SPACING_SCALE_PREFIX}-6\`, plus ` +
      `\`${SPACING_SCALE_PREFIX}-2xs\` and \`${SPACING_SCALE_PREFIX}-chip\`); the literals the ` +
      'base commit already carries are debt owed, not a permission to add to it. The nearest ' +
      'step is almost always right. The spec exempts exactly two things and this gate already ' +
      'applies both, so a value outside them needs a token; a ' +
      '`ratchet-exempt(design-system): <reason>` marker is for a value that genuinely is not ' +
      'spacing.'
  );
});

test('no raw spacing literal has been laundered into a private token', () => {
  const { raw } = scan();

  // This is what closes the ratchet's cheapest escape. Rewrite `padding: 8px` as
  // `--inset: 8px; padding: var(--inset)` and the file, property, value and COUNT are all
  // unchanged — only the text moves. Resolution is what keeps the occurrence findable at all;
  // this is what keeps it from being reported as unchanged while the debt was laundered.
  const laundered = raw.occurrences
    .filter((record) => !pixelValuesIn(record.raw).includes(record.value))
    .map(
      (record) =>
        `${record.file}:${record.line} ${record.property} ${record.value}px\n      raw:      ` +
        `${record.raw}\n      resolved: ${record.resolved}`
    );

  assert.deepEqual(
    laundered,
    [],
    'a raw spacing literal has been moved into a custom property and read back. The debt has NOT ' +
      'been paid — the gap is still that many pixels wide — and the count above did not move ' +
      `because the scan resolves \`var()\`. Use a published \`${SPACING_SCALE_PREFIX}\` token, ` +
      'which this scan holds opaque precisely because deriving from the scale is what the spec ' +
      'asks for:\n  ' +
      laundered.join('\n  ')
  );
});

/* ───────────────────────── the sheet is on the scale (issue 1523) ───────────────────────── */

const SHEET = 'styles/fabricate.css';

/** One declaration's identity for the player list: its at-rule context, selector and property. */
const playerKey = ({ context, selector, property }) =>
  `${context === undefined || context === '' ? '' : `${context} `}${selector} { ${property} }`;

/**
 * Sheet declarations the absolute check reads past, each by at-rule context, selector and
 * property, so the same rule under an `@media` is a different key and fails. An entry that no
 * longer carries an off-scale length is stale and fails, and a test below pins the list empty.
 */
const PLAYER_SHEET_RULES = Object.freeze([]);

/** The positioning offsets, which `ui-visual-style` rules are NOT spacing-scale members. */
const POSITION_OFFSET =
  /^(?:top|right|bottom|left|inset(?:-(?:block|inline)(?:-(?:start|end))?)?)$/iu;

test('the off-scale classifier reads tokens, exemptions, private tokens and other units', () => {
  const definitions = new Map([['--inset', ['13px']]]);
  const scale = scaleOf(
    new Map([
      ['--fab-space-1', ['4px']],
      ['--fab-space-2', ['8px']],
      ['--fab-space-3', ['12px']],
      ['--fab-space-4', ['16px']],
      ['--fab-space-2xs', ['2px']],
      ['--fab-space-chip', ['6px']],
    ])
  );
  const probes = {
    '14px': ['14px'],
    'var(--fab-space-3)': [],
    '1px var(--fab-space-chip)': [],
    'calc(-1 * var(--fab-space-2))': [],
    '36px 0 0': [],
    '0 auto': [],
    'var(--inset)': ['13px'],
    '0.15rem': ['0.15rem'],
    '0 0.4em': ['0.4em'],
    '-0.5em 0': ['0.5em'],
    '10dvh': ['10dvh'],
    '2pt': ['2pt'],
    '4cqw 0': ['4cqw'],
    'calc(1px + 1px)': ['1px in calc()'],
    'calc(1px * 13)': ['1px in calc()', 'calc() = 13px'],
    'min(1px, 100%)': ['100%', '1px in min()'],
    'calc(var(--fab-space-2) * -1)': [],
    'var(--fab-space-2xs)': [],
    'calc(var(--fab-space-3) + var(--fab-space-2xs))': ['calc() = 14px'],
    '0 calc(var(--fab-space-chip) / 2)': ['calc() = 3px'],
    'calc(var(--fab-space-2) * 2 + var(--fab-space-3))': ['calc() = 28px'],
    'calc(var(--fab-space-2) + var(--fab-space-1))': [],
    'calc(-1 * (var(--fab-space-3) + var(--fab-space-2xs)))': ['calc() = -14px'],
    'calc(100% - var(--fab-space-2))': ['100%'],
  };
  for (const [value, expected] of Object.entries(probes)) {
    assert.deepEqual(offScaleLengthsIn(value, definitions, scale), expected, value);
  }
});

/**
 * The corpora the absolute checks hold, each with floors that prove it is still being read. The
 * Svelte floors sit above what the manager and component roots alone carry, so a scope that stops
 * reading the player apps fails them.
 */
const ABSOLUTE_SCOPES = Object.freeze([
  {
    label: SHEET,
    includes: (file) => file === SHEET,
    player: PLAYER_SHEET_RULES,
    floors: { spacing: STYLESHEET_SPACING_DECLARATION_FLOOR, offsets: 40, sizes: 400 },
  },
  {
    label: 'Svelte',
    includes: inSvelteScope,
    player: [],
    floors: { spacing: SVELTE_SPACING_DECLARATION_FLOOR, offsets: 40, sizes: 1350 },
  },
]);

/** The declarations of `properties` (a predicate) in one scope. */
const scopeDeclarations = (styleCorpus, scope, properties) =>
  styleCorpus.declarations.filter(
    (declaration) =>
      scope.includes(declaration.file) && properties(declaration.property.toLowerCase())
  );

const SCANNED_SPACING = new Set(SCANNED_SPACING_PROPERTIES);

/**
 * One scope's unmarked spacing declarations, those off the scale with their lengths, and the
 * player keys that matched.
 */
function offScaleSpacing(styleCorpus, scope) {
  const { definitions, scale } = spacingContext(styleCorpus);
  const declarations = scopeDeclarations(styleCorpus, scope, (property) =>
    SCANNED_SPACING.has(property)
  ).filter(
    (declaration) =>
      !exemptAt(declaration.file, styleCorpus.sources[declaration.file], declaration.at)
  );
  const offScale = [];
  const playerResidue = new Set();
  for (const declaration of declarations) {
    const lengths = offScaleLengthsIn(declaration.value, definitions, scale);
    if (lengths.length === 0) continue;
    const key = playerKey(declaration);
    if (scope.player.includes(key)) playerResidue.add(key);
    else offScale.push({ ...declaration, lengths });
  }
  return { declarations, offScale, playerResidue };
}

for (const scope of ABSOLUTE_SCOPES) {
  test(`no spacing length in ${scope.label} is off the scale, outside its player rules`, () => {
    const { declarations, offScale, playerResidue } = offScaleSpacing(scan().styleCorpus, scope);
    assert.ok(
      declarations.length >= scope.floors.spacing,
      `only ${declarations.length} spacing declarations read in ${scope.label}, so this check ` +
        'is not reading it'
    );

    const failures = offScale.map(
      ({ file, at, selector, property, value, lengths }) =>
        `${file}:${at} ${selector}\n      ${property}: ${value} (${lengths.join(', ')})`
    );
    assert.deepEqual(
      failures,
      [],
      `a spacing length in ${scope.label} is off the published scale. Snap it to the nearest ` +
        `\`${SPACING_SCALE_PREFIX}-*\` member and write the token; a tie goes to the main 4px ` +
        'rung against a fine one, and up between two main rungs. A derived alignment that ' +
        'cannot snap carries a reasoned `ratchet-exempt(design-system)` marker:\n  ' +
        failures.join('\n  ')
    );
    assert.deepEqual(
      scope.player.filter((selector) => !playerResidue.has(selector)),
      [],
      'a PLAYER_SHEET_RULES entry no longer carries an off-scale length (or its selector, ' +
        'property or at-rule changed); delete the entry so the list cannot exempt what replaces it'
    );
  });
}

test('the player list is pinned, so growing it is a reviewed edit of this pin', () => {
  assert.deepEqual(
    [...PLAYER_SHEET_RULES],
    [],
    'PLAYER_SHEET_RULES changed. It exempts declarations from the scale and is empty now the ' +
      'player apps are on it, so an addition must edit this pin on purpose'
  );
});

/** The sizing properties, which MUST NOT derive from the spacing scale (ui-visual-style spec). */
const SIZE_PROPERTY =
  /^(?:width|height|inline-size|block-size|(?:min|max)-(?:width|height|inline-size|block-size)|flex-basis|flex)$/iu;

/** The selector a player-list key names, for the offsets check, which reads a whole rule. */
const selectorOfKey = (key) => key.replace(/^.*?(\.fabricate)/u, '$1').replace(/ \{.*$/u, '');

/** Each declaration in `declarations` that reads a `--fab-space-*` token, as a failure line. */
const readingScale = (declarations) =>
  declarations
    .filter((declaration) =>
      varReferencesIn(declaration.value).some((reference) => isSpacingScaleToken(reference.name))
    )
    .map(
      (declaration) =>
        `${declaration.file}:${declaration.at} ${declaration.selector} ` +
        `${declaration.property}: ${declaration.value}`
    );

for (const scope of ABSOLUTE_SCOPES) {
  test(`no width, height or flex basis in ${scope.label} reads the spacing scale`, () => {
    const { styleCorpus } = scan();
    const sizes = scopeDeclarations(styleCorpus, scope, (property) => SIZE_PROPERTY.test(property));
    assert.ok(
      sizes.length >= scope.floors.sizes,
      `only ${sizes.length} size declarations read in ${scope.label}`
    );

    // A named derived token (`--fab-icon-picker-row`, computed from its chip) is the spec's own
    // example of a size that may be built from the scale; it is DEFINED on a custom property,
    // which this check does not read, and used by name, which carries no `--fab-space-*`.
    const reading = readingScale(sizes);
    assert.deepEqual(
      reading,
      [],
      'a width, height, min/max size or flex basis derives from the spacing scale. ' +
        '`ui-visual-style` rules sizes out of the scale, so write the size as a literal or as a ' +
        'named derived token:\n  ' +
        reading.join('\n  ')
    );
  });

  test(`no positioning offset in ${scope.label} reads the spacing scale`, () => {
    const { styleCorpus } = scan();
    const offsets = scopeDeclarations(styleCorpus, scope, (property) =>
      POSITION_OFFSET.test(property)
    );
    assert.ok(
      offsets.length >= scope.floors.offsets,
      `only ${offsets.length} offsets read in ${scope.label}`
    );

    const playerSelectors = new Set(scope.player.map(selectorOfKey));
    const reading = readingScale(
      offsets.filter((declaration) => !playerSelectors.has(declaration.selector))
    );
    assert.deepEqual(
      reading,
      [],
      'a positioning offset reads the spacing scale. `ui-visual-style` rules offsets out of the ' +
        'scale, so write the offset as a literal:\n  ' +
        reading.join('\n  ')
    );
  });
}

/* ───────────────────────── proofs against throwaway repositories ───────────────────────── */

const PROBE = 'src/ui/svelte/Probe.svelte';
const REASON = 'ratchet-exempt(design-system): the probe needs it';

const sheetWith = (...lines) =>
  [
    `:root { ${SPACING_SCALE_PREFIX}-2: 8px; }`,
    '.fabricate .a { padding: 12px; gap: var(--fab-space-2); }',
    ...lines,
    '',
  ].join('\n');

const probeWith = (...rules) =>
  [
    '<div class="probe"></div>',
    '<style>',
    '  .probe { margin: 6px; }',
    ...rules,
    '</style>',
    '',
  ].join('\n');

const WIRING_BASE = Object.freeze({
  [SHEET]: sheetWith(),
  [PROBE]: probeWith(),
  'README.md': 'unrelated\n',
});

const spacing = (file, id) => `${file}: ${id}`;

test('the spacing gate fails a new literal and a grown one, and nothing the spec allows', (t) => {
  assertGateCases(t, SPACING_GATE, WIRING_BASE, [
    {
      head: { [SHEET]: sheetWith('.fabricate .b { padding: 13px; }') },
      failures: [`${spacing(SHEET, 'padding 13px')} is new (1)`],
    },
    {
      head: { [PROBE]: probeWith('  .probe-b { margin: 6px; }') },
      failures: [`${spacing(PROBE, 'margin 6px')} rose from 1 to 2`],
    },
    {
      head: {
        [SHEET]: sheetWith(
          '.fabricate .c { margin: -1px; padding: 36px; gap: var(--fab-space-2); }'
        ),
      },
      failures: [],
    },
    {
      head: { [SHEET]: sheetWith().replace('padding: 12px', 'padding-block: 12px') },
      failures: [],
    },
    { head: { 'README.md': 'changed\n' }, skipped: 'corpus-unchanged' },
  ]);
});

test('a literal moved into a private token is still counted, at its resolved value', (t) => {
  assertGateCases(t, SPACING_GATE, WIRING_BASE, [
    {
      head: {
        [SHEET]: sheetWith(':root { --inset: 13px; }', '.fabricate .b { padding: var(--inset); }'),
      },
      failures: [`${spacing(SHEET, 'padding 13px')} is new (1)`],
    },
  ]);
});

test('a reasoned marker at the declaration exempts it, and an empty one fails', (t) => {
  const offender = '.fabricate .b { padding: 13px; }';
  assertGateCases(t, SPACING_GATE, WIRING_BASE, [
    { head: { [SHEET]: sheetWith(`/* ${REASON} */`, offender) }, failures: [] },
    {
      head: { [PROBE]: probeWith(`  /* ${REASON} */`, '  .probe-b { margin: 6px; }') },
      failures: [],
    },
    {
      head: { [SHEET]: sheetWith('/* ratchet-exempt(design-system): */', offender) },
      failures: [
        `${spacing(SHEET, 'padding 13px')} is new (1); its ratchet-exempt marker gives no reason`,
        emptyMarkerFailure(SHEET, 3),
      ],
    },
  ]);
});

/** The Svelte scope's off-scale check as a gate, so a throwaway repository can prove its paths. */
const SVELTE_OFF_SCALE_GATE = gateOver([STYLE_CORPUS], (readFile, files) =>
  offScaleSpacing(
    styleCorpusOf(readFile, files),
    ABSOLUTE_SCOPES.find((scope) => scope.includes === inSvelteScope)
  ).offScale.map(({ file, at, property, lengths }) => ({
    file,
    line: at,
    id: `${property} ${lengths}`,
  }))
);

test('the Svelte scope reads manager, components and every player app', (t) => {
  const offender = '<div class="p"></div>\n<style>\n  .p { padding: 13px; }\n</style>\n';
  const fails = (file) => ({
    head: { [file]: offender },
    failures: [`${spacing(file, 'padding 13px')} is new (1)`],
  });
  assertGateCases(t, SVELTE_OFF_SCALE_GATE, WIRING_BASE, [
    fails('src/ui/svelte/apps/manager/Probe.svelte'),
    fails('src/ui/svelte/apps/manager/new-area/Probe.svelte'),
    fails('src/ui/svelte/components/Probe.svelte'),
    fails('src/ui/svelte/apps/crafting/Probe.svelte'),
    fails('src/ui/svelte/apps/InteractableProbe.svelte'),
  ]);
});
