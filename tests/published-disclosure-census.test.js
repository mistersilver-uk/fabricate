/**
 * The module sheet and every component style against the published `Disclosure` (issue 2862): the
 * selectors that name its root class, which of them a published card can match, where those sit,
 * what they draw on its head and its keyboard ring, and that no other rule names its parts; then
 * its inks as token arithmetic over the seven palettes, the figures its group states.
 * Limit: the census shares `published-component-manifest.test.js`'s sheet-reach limits; the
 * rendered suite reads the same inks off the real cascade.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, it } from 'node:test';

import { readStylesheet } from '../scripts/lib/stylesheetSource.js';
import { FOCUSABLE_CONTENT } from '../src/ui/svelte/actions/watchFocusable.js';

import { templateOf } from './helpers/apiConvention.js';
import {
  BARE_BUTTON_ANCESTORS,
  BARE_BUTTON_RULES,
  bareButtonSelectors,
  entryNamed,
  partFaults,
  placementFaults,
  shippedCensus,
  syntheticCensus,
} from './helpers/publishedComponentCensus.js';
import { byName, everyStylesheet } from './helpers/publishedComponentGate.js';
import { rulesIn, stripCssComments } from './helpers/styleBlockScan.js';
import { contrast, stackGround, themePalettes } from './helpers/themePaletteContrast.js';

/** The published card's root: `open` writes `is-open` beside it, and no ancestor is pinned. */
const DISCLOSURE = Object.freeze({
  root: 'fabricate-disclosure',
  writable: new Set(['is-open']),
  ancestors: new Set(),
  drawsChildren: true,
  disables: true,
});

const SHEET = 'styles/fabricate-manager-rail-gathering.css';
const HEAD = '.fabricate-disclosure.fabricate-disclosure .fabricate-disclosure-head';
const DISABLED = `${HEAD}[aria-disabled='true']`;

/** The sheet rules that draw a published card, each through its doubled root. */
const FAMILY_RULES = Object.freeze(
  [
    '.fabricate-disclosure.fabricate-disclosure',
    '.fabricate-disclosure.fabricate-disclosure > .fabricate-disclosure-heading',
    HEAD,
    '.fabricate-disclosure.fabricate-disclosure.is-open .fabricate-disclosure-head',
    `${HEAD}:not([aria-disabled='true']):hover`,
    `${HEAD}:focus-visible`,
    DISABLED,
    '.fabricate-disclosure.fabricate-disclosure .fabricate-disclosure-content',
    '.fabricate-disclosure.fabricate-disclosure .fabricate-disclosure-chevron',
    '.fabricate-disclosure.fabricate-disclosure.is-open .fabricate-disclosure-chevron',
    '.fabricate-disclosure.fabricate-disclosure > .fabricate-disclosure-body',
    '.fabricate-disclosure.fabricate-disclosure > .fabricate-disclosure-body[hidden]',
    '.fabricate-disclosure.fabricate-disclosure .fabricate-disclosure-chevron',
    `${DISABLED} > .fabricate-disclosure-chevron`,
    DISABLED,
    `${HEAD}:focus-visible`,
  ].map((selector) => `${SHEET}: ${selector}`)
);

const PARTS = Object.freeze([
  'fabricate-disclosure-heading',
  'fabricate-disclosure-head',
  'fabricate-disclosure-content',
  'fabricate-disclosure-chevron',
  'fabricate-disclosure-body',
]);

const writtenOf = (census) => census.map(({ written }) => written).sort(byName);
const reachingOf = (census) => census.filter(({ safe }) => !safe);
/** The head button, which a bare `button` rule reaches unless it names a class the head lacks. */
const HEAD_BUTTON = Object.freeze({ writable: new Set(['fabricate-disclosure-head']) });
const bareIn = (sheets) =>
  sheets.flatMap(([file, css]) =>
    bareButtonSelectors(file, css, HEAD_BUTTON, BARE_BUTTON_ANCESTORS)
  );

describe('the module sheet and every component style against the published Disclosure', () => {
  it('reaches a published card through its sixteen family rules alone, and none can be kept off it', () => {
    const census = shippedCensus(DISCLOSURE, 'Disclosure');
    assert.deepEqual(writtenOf(census), [...FAMILY_RULES].sort(byName));
    assert.deepEqual(
      census.filter(({ safe }) => safe).map(({ written }) => written),
      [],
      'every rule naming the root reaches a published card'
    );
    assert.deepEqual(
      [Object.keys(entryNamed('Disclosure').props), entryNamed('Disclosure').root],
      [['open', 'onToggle', 'level', 'disabled', 'head', 'body'], 'any'],
      'a published key that writes a class, or a wider root, reopens the census'
    );
  });

  it('draws a published card alike under any ancestor', () => {
    assert.deepEqual(placementFaults(shippedCensus(DISCLOSURE, 'Disclosure'), DISCLOSURE, []), []);
  });

  it('names its parts only through its root', () => {
    assert.deepEqual(partFaults(everyStylesheet(), PARTS, DISCLOSURE), []);
  });

  it('declares one keyboard ring on the head, inset, and strips no ring or shadow elsewhere', () => {
    const census = shippedCensus(DISCLOSURE, 'Disclosure');
    const declares = (property) =>
      census
        .filter(({ rule }) =>
          rule.block.children.some(
            (node) => node.type === 'Declaration' && node.property === property
          )
        )
        .map(({ written }) => written);
    assert.deepEqual(declares('outline'), [`${SHEET}: ${HEAD}:focus-visible`]);
    assert.deepEqual(declares('outline-offset'), [`${SHEET}: ${HEAD}:focus-visible`]);
    assert.deepEqual(declares('box-shadow'), [], 'no rule of the family draws or strips a shadow');
  });
});

describe('the module sheet against the published Disclosure head, a bare button', () => {
  it('takes the four module rules a bare button takes, and no other', () => {
    assert.deepEqual(
      writtenOf(reachingOf(bareIn(everyStylesheet()))),
      [...BARE_BUTTON_RULES].sort(byName)
    );
  });

  it('names a new bare button rule an app root reaches', () => {
    const { css } = templateOf(
      'sheet.css',
      '<style>.fabricate-app button { min-height: 30px }</style>'
    ).ast;
    assert.deepEqual(writtenOf(reachingOf(bareIn([['sheet.css', css]]))), [
      'sheet.css: .fabricate-app button',
    ]);
  });
});

describe('the disclosure census, synthetic', () => {
  const reachingIn = (css) =>
    syntheticCensus(DISCLOSURE, `${css} { gap: 0 }`)
      .filter(({ safe }) => !safe)
      .map(({ written }) => written);

  it('admits a selector that needs a class no published key writes', () => {
    assert.deepEqual(reachingIn('.fabricate-disclosure.is-wide'), []);
  });

  for (const selector of [
    '.fabricate-disclosure',
    '.fabricate-disclosure.is-open',
    '.fabricate-manager .fabricate-disclosure',
    ".fabricate-disclosure .fabricate-disclosure-head[aria-disabled='true']",
  ]) {
    it(`refuses ${selector}, which nothing keeps off a published card`, () => {
      assert.deepEqual(reachingIn(selector), [`sheet.css: ${selector}`]);
    });
  }

  it('names a part reached without the root', () => {
    const { css } = templateOf(
      'sheet.css',
      '<style>.fabricate .fabricate-disclosure-chevron { gap: 0 }</style>'
    ).ast;
    assert.deepEqual(partFaults([['sheet.css', css]], PARTS, DISCLOSURE), [
      'sheet.css: .fabricate .fabricate-disclosure-chevron',
    ]);
  });
});

describe('the published Disclosure’s inks, as token arithmetic over the seven palettes', () => {
  const themes = themePalettes(rulesIn(stripCssComments(readStylesheet())));
  const GROUNDS = ['--fab-bg-0', '--fab-bg-1', '--fab-surface', '--fab-bg-2'];
  const ratios = (ink, stack) =>
    [...themes].map(([, tokens]) => contrast(tokens.get(ink), stackGround(tokens, stack)));
  const range = (values) => [Math.min(...values), Math.max(...values)].map((v) => v.toFixed(2));

  it('states the figures its group states: the chevron, the ring and the head’s ink on the card and its hover fill', () => {
    const fill = ['--fab-bg-2'];
    const hover = ['--fab-surface-raised', '--fab-bg-2'];
    assert.equal(themes.size, 7);
    assert.deepEqual(range(ratios('--fab-text-muted', fill)), ['4.99', '8.38'], 'chevron');
    assert.deepEqual(range(ratios('--fab-text-muted', hover)), ['4.33', '7.11'], 'chevron, hover');
    assert.deepEqual(range(ratios('--fab-accent', fill)), ['5.19', '9.35'], 'ring');
    assert.deepEqual(range(ratios('--fab-accent', hover)), ['4.18', '7.89'], 'ring, hover');
    assert.deepEqual(range(ratios('--fab-text', hover)), ['8.14', '13.43'], 'ink, hover');
    const edges = GROUNDS.flatMap((ground) => ratios('--fab-border', [ground]));
    assert.deepEqual(range(edges), ['1.26', '1.53'], 'the edge against each ground');
  });
});

/** Each selector `FOCUSABLE_CONTENT` holds, and the words the contract names it by. */
const REFUSED_PHRASES = Object.freeze({
  'a[href]': 'a link',
  'area[href]': 'an image map area with an `href`',
  'audio[controls]': 'an `audio` or `video` with `controls`',
  button: 'a button',
  details: 'a `details` or `summary`',
  embed: 'an `iframe`, `embed` or `object`',
  iframe: 'an `iframe`, `embed` or `object`',
  'img[usemap]': 'an `img` with a `usemap`',
  'input:not([type="hidden"])': 'an input that is not hidden',
  label: 'a `label`',
  object: 'an `iframe`, `embed` or `object`',
  select: 'a `select`',
  summary: 'a `details` or `summary`',
  textarea: 'a `textarea`',
  'video[controls]': 'an `audio` or `video` with `controls`',
  '[tabindex]': 'any element with a `tabindex`',
  '[contenteditable]:not([contenteditable="false"])': 'that is `contenteditable`',
});

const REFUSAL_LEAD = 'The elements it refuses are ';
const repoRoot = resolve(import.meta.dirname, '..');
/** The one line of `file` that states what the head refuses, trimmed. */
function refusalLine(file) {
  const lines = readFileSync(resolve(repoRoot, file), 'utf8')
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.startsWith(REFUSAL_LEAD));
  assert.equal(lines.length, 1, `${file} states the refused elements once`);
  return lines[0];
}
const ticked = (text) => new Set(text.match(/`[^`]+`/gu));

describe('the head rule as the contract states it', () => {
  it('names each selector the watch refuses, in the docs and the spec alike, and no other', () => {
    assert.deepEqual(Object.keys(REFUSED_PHRASES), FOCUSABLE_CONTENT.split(', '));
    const phrases = new Set(Object.values(REFUSED_PHRASES));
    const named = new Set([...phrases].flatMap((phrase) => [...ticked(phrase)]));
    for (const file of ['docs/api/index.md', 'openspec/specs/ui-extension-points/spec.md']) {
      const line = refusalLine(file);
      for (const phrase of phrases) assert.ok(line.includes(phrase), `${file} names ${phrase}`);
      const [refused] = line.split('; it reads');
      assert.deepEqual(ticked(refused), named, `${file} names no element the watch admits`);
    }
  });
});
