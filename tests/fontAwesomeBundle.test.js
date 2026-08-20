/**
 * The catalogue generator's reading of Foundry's Font Awesome bundle.
 *
 * The committed catalogue is the artifact; this covers the derivation, because CI has no Foundry
 * install and cannot rerun the generator. Everything under test here is pure and fed a fixture
 * cut in the shape of the real stylesheet — the woff2 reader is the one function that is not, and
 * it is exercised by running the generator rather than by a synthetic font.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  buildIconCatalogue,
  countLeadingTokens,
  iconLabelFor,
  parseFontAwesomeRelease,
  parseGlyphCodepoint,
  parseIconGlyphRules,
  preferredIconName
} from '../scripts/lib/fontAwesomeBundle.js';

const BACKSLASH = '\\';

// Cut in the shape of the real file: a banner, utility classes that look like icon classes but
// assign no glyph, a multi-name rule, a hex escape and a literal-character escape.
const STYLESHEET_FIXTURE = [
  '/*!',
  ' * Font Awesome Pro 7.2.0 by @fontawesome - https://fontawesome.com',
  ' */',
  '.fa-solid,.fa-regular,.fa-brands{font-family:"Font Awesome 7 Pro"}',
  '.fa-spin{animation-name:fa-spin}',
  `.fa-candle-holder{--fa:"${BACKSLASH}f6bc"}`,
  `.fa-baby-carriage,.fa-carriage-baby{--fa:"${BACKSLASH}f77d"}`,
  `.fa-cog,.fa-gear{--fa:"${BACKSLASH}f013"}`,
  `.fa-gears{--fa:"${BACKSLASH}f085"}`,
  `.fa-github{--fa:"${BACKSLASH}f09b"}`,
  `.fa-plus{--fa:"${BACKSLASH}+"}`,
  `.fa-0{--fa:"${BACKSLASH}30 "}`
].join('');

const CANDLE_HOLDER = 0xf6bc;
const BABY_CARRIAGE = 0xf77d;
const GEAR = 0xf013;
const GEARS = 0xf085;
const GITHUB = 0xf09b;
const PLUS = 0x2b;
const ZERO = 0x30;
const NEWLINE = 0xa;

describe('reading the Font Awesome bundle Foundry ships', () => {
  // Measured rather than assumed, because the catalogue describes one Foundry release's font and
  // the whole defect this replaces was a catalogue describing a font nobody was loading.
  it('reads the edition and version out of the banner', () => {
    assert.deepEqual(parseFontAwesomeRelease(STYLESHEET_FIXTURE), {
      edition: 'Pro',
      version: '7.2.0'
    });
  });

  it('refuses a stylesheet with no banner rather than guessing a release', () => {
    assert.throws(() => parseFontAwesomeRelease('.fa-gear{--fa:"x"}'), /no Font Awesome banner/);
  });

  // Font Awesome 7 assigns a glyph with the `--fa` custom property rather than a `content` rule, so
  // a `::before` scrape finds almost nothing. The utility classes match the same selector shape and
  // must fall out by construction, because they assign no glyph.
  it('finds only the rules that assign a glyph, never the utility classes', () => {
    const rules = parseIconGlyphRules(STYLESHEET_FIXTURE);
    const names = rules.flatMap((rule) => rule.names);

    assert.equal(rules.length, 7);
    assert.ok(names.includes('candle-holder'));
    assert.ok(!names.includes('spin'), 'an animation utility is not an icon');
    assert.ok(!names.includes('solid'), 'a family class is not an icon');
  });

  it('keeps every name a rule gives one glyph', () => {
    const rules = parseIconGlyphRules(STYLESHEET_FIXTURE);
    const carriage = rules.find((rule) => rule.codepoint === BABY_CARRIAGE);

    assert.deepEqual(carriage.names, ['baby-carriage', 'carriage-baby']);
  });

  // `\f6bc` is a codepoint; `\+` is the character `+`. Reading the second as hex is what drops
  // `plus`, `asterisk` and every other punctuation-escaped icon out of the catalogue silently.
  it('tells a hex escape from a literal-character escape', () => {
    assert.equal(parseGlyphCodepoint(`${BACKSLASH}f6bc`), CANDLE_HOLDER);
    assert.equal(parseGlyphCodepoint(`${BACKSLASH}+`), PLUS);
    assert.equal(parseGlyphCodepoint('A'), 0x41);
  });

  // CSS Syntax §4.3.7 lets an escape end at a single whitespace instead of at six digits, and
  // that is how the bundle spells `.fa-0` through `.fa-9`: `"\30 "`. Reading the terminator as
  // part of the value fails the hex test and falls through to the first DIGIT CHARACTER's own
  // codepoint, so all ten digits come back as `0x33`. They still reach the catalogue today only
  // because `0x33` happens to sit in the classic face and not in brands — and the codepoint is
  // the ONLY input to that filter, so ten icons' membership is currently decided by accident.
  it('ends a hex escape at its whitespace terminator rather than reading the terminator', () => {
    assert.equal(parseGlyphCodepoint(`${BACKSLASH}30 `), ZERO);
    assert.equal(parseGlyphCodepoint(`${BACKSLASH}39 `), 0x39);
  });

  // `\a` is U+000A, not the letter `a`: a hex escape is one to six digits, and a lower bound of
  // two reads a legal single-digit escape as a literal character.
  it('reads a single-digit hex escape as hex', () => {
    assert.equal(parseGlyphCodepoint(`${BACKSLASH}a`), NEWLINE);
  });
});

describe('choosing which of a glyph names the vocabulary offers', () => {
  const counts = countLeadingTokens([
    'gear',
    'gears',
    'gear-code',
    'cog',
    'cogs',
    'tower-broadcast',
    'tower-cell',
    'tower-observation',
    'broadcast-tower',
    'clock',
    'clock-four',
    'fire',
    'fire-flame-curved',
    'fire-alt',
    'comment',
    'comment-alt-dots',
    'comment-lines',
    'comment-check',
    'message-dots'
  ]);

  // `-alt` retires a spelling wherever it sits in the name, not only at the end. Font Awesome's
  // `comment` family is far larger than its `message` family, so without the retired rule the
  // family tie-break below would offer `comment-alt-dots` — a label reading "Comment Alt Dots".
  it('drops a retired-variant spelling, including one buried mid-name', () => {
    assert.equal(preferredIconName(['fire-alt', 'fire-flame-curved'], counts), 'fire-flame-curved');
    assert.equal(preferredIconName(['comment-alt-dots', 'message-dots'], counts), 'message-dots');
  });

  // The glyph a family is named after keeps its plain name. `clock-four` is four o'clock only in
  // the sense that every clock face is drawn at some hour.
  it('prefers the shorter name when one extends the other token for token', () => {
    assert.equal(preferredIconName(['clock', 'clock-four'], counts), 'clock');
  });

  it('prefers the name whose leading token names the larger family', () => {
    assert.equal(preferredIconName(['broadcast-tower', 'tower-broadcast'], counts), 'tower-broadcast');
    assert.equal(preferredIconName(['cog', 'gear'], counts), 'gear');
  });

  // The bundle sorts every multi-name selector list alphabetically, so the stylesheet's order
  // carries no information about which name came first and the result must not depend on it.
  it('gives the same answer whatever order the stylesheet listed the names in', () => {
    assert.equal(
      preferredIconName(['gear', 'cog'], counts),
      preferredIconName(['cog', 'gear'], counts)
    );
  });

  // Derived rather than authored: three and a half thousand hand-written captions would drift from
  // their codes, and a caption that disagrees with the name a GM typed is worse than a plain one.
  it('derives a Title-Cased label from the offered name', () => {
    assert.equal(iconLabelFor('candle-holder'), 'Candle Holder');
    assert.equal(iconLabelFor('arrow-down-1-9'), 'Arrow Down 1 9');
    assert.equal(iconLabelFor('a'), 'A');
  });
});

describe('building the catalogue', () => {
  const classicCodepoints = new Set([CANDLE_HOLDER, BABY_CARRIAGE, GEAR, GEARS, PLUS, ZERO]);
  const brandCodepoints = new Set([GITHUB]);

  it('keeps one entry per glyph, sorted by the offered name, with the rest as aliases', () => {
    const catalogue = buildIconCatalogue({
      cssText: STYLESHEET_FIXTURE,
      classicCodepoints,
      brandCodepoints
    });

    // `0` is here because its rule is written `--fa:"\30 "`. Misreading that escape hands the
    // filter `0x33`, which this fixture's classic face does not carry, and the digit silently
    // leaves the catalogue — which is the whole defect, seen end to end.
    assert.deepEqual(
      catalogue.map((entry) => entry.iconCode),
      ['0', 'baby-carriage', 'candle-holder', 'gear', 'gears', 'plus']
    );
    assert.deepEqual(
      catalogue.find((entry) => entry.iconCode === 'gear').aliases,
      ['cog'],
      'the names a glyph is not offered under stay on its entry'
    );
  });

  // A logo is exactly a glyph only the brands face draws, which is measurable. The block of
  // company names this replaces was not: it could only ever exclude the brands somebody had
  // noticed.
  it('excludes a glyph the brands face draws', () => {
    const catalogue = buildIconCatalogue({
      cssText: STYLESHEET_FIXTURE,
      classicCodepoints,
      brandCodepoints
    });

    assert.ok(!catalogue.some((entry) => entry.iconCode === 'github'));
  });

  // A name the stylesheet declares whose codepoint no classic face carries would fall back to a
  // text glyph rather than draw an icon, so it is not in the catalogue however plausible it reads.
  it('excludes a declared name the classic face does not actually carry', () => {
    const catalogue = buildIconCatalogue({
      cssText: STYLESHEET_FIXTURE,
      classicCodepoints: new Set([CANDLE_HOLDER]),
      brandCodepoints
    });

    assert.deepEqual(
      catalogue.map((entry) => entry.iconCode),
      ['candle-holder']
    );
  });
});
