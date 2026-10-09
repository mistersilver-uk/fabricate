/** Issue 2047: an unchecked selection control's outline is one token, 3:1 on its surface. */
import assert from 'node:assert/strict';
import test from 'node:test';

import {
  collectStyleCorpus,
  declarationsIn,
  rulesIn,
  splitSelectorList,
} from '../helpers/styleBlockScan.js';
import { contrast, propertiesOf, themePalettes } from '../helpers/themePaletteContrast.js';

const TOKEN = '--fab-control-outline';
const SHEET = 'styles/fabricate.css';
const corpus = collectStyleCorpus();
const sheetRules = rulesIn(corpus[SHEET]);

/** The grounds an outline is drawn against: the fills `--fab-bg-0` and `--fab-bg-1` and the card. */
const SURFACES = Object.freeze(['--fab-bg-0', '--fab-bg-1', '--fab-bg-2']);

/** An unchecked radio ring or checkbox box at rest: the compound a `border` is declared on. */
const OUTLINE_COMPOUND = /(?:input\[type='radio'\]|\.fab-selection-check)$/u;

test('the outline token is declared once, outside every palette, on every themed root', () => {
  const sites = Object.entries(corpus).flatMap(([file, css]) =>
    declarationsIn(file, css).filter(({ property }) => property === TOKEN)
  );
  assert.deepEqual(
    sites.map(({ file, value }) => [file, value]),
    [[SHEET, 'var(--fab-text-subtle)']]
  );
  const owner = sheetRules.find((rule) => propertiesOf(rule).has(TOKEN));
  assert.deepEqual(splitSelectorList(owner.selector), [
    ':root',
    '.fabricate[data-fabricate-theme]',
  ]);
});

test('the outline clears 3:1 on every surface a control draws it against, in every palette', () => {
  const themes = themePalettes(sheetRules);
  assert.equal(themes.size, 7, `the sheet declares ${themes.size} palettes, not seven`);
  const short = [];
  for (const [theme, tokens] of themes) {
    for (const surface of SURFACES) {
      const ratio = contrast(tokens.get('--fab-text-subtle'), tokens.get(surface));
      if (ratio < 3) short.push(`${theme} on ${surface}: ${ratio.toFixed(2)}:1`);
    }
  }
  assert.deepEqual(short, [], 'an unchecked selection control would be under WCAG 1.4.11');
});

test('every unchecked radio ring and checkbox box outlines with the token', () => {
  const outlines = [];
  for (const [file, css] of Object.entries(corpus)) {
    for (const rule of rulesIn(css)) {
      const outlined = splitSelectorList(rule.selector).some((s) => OUTLINE_COMPOUND.test(s));
      if (!outlined) continue;
      for (const { property, value } of declarationsIn(file, rule.body)) {
        if (property === 'border' && /solid/u.test(value)) {
          outlines.push({ file, selector: rule.selector, value });
        }
      }
    }
  }
  assert.ok(outlines.length >= 5, `only ${outlines.length} outline sites found; the reader broke`);
  assert.deepEqual(
    outlines.filter(({ value }) => !value.includes(`var(${TOKEN})`)),
    [],
    `an unchecked selection control outlines with something other than ${TOKEN}`
  );
});

/** The resting compound of an unchecked control, size modifiers included, never a state. */
const RESTING_COMPOUND = /(?:input\[type='radio'\]|\.fab-selection-check(?:\.is-(?:sm|md|lg))?)$/u;

test('a filled unchecked control clips its fill, so the outline composites over the surround', () => {
  const filled = [];
  for (const [file, css] of Object.entries(corpus)) {
    for (const rule of rulesIn(css)) {
      const resting = splitSelectorList(rule.selector).some((s) => RESTING_COMPOUND.test(s));
      const properties = propertiesOf(rule);
      const fill = properties.get('background');
      if (!resting || !fill || fill === 'transparent') continue;
      filled.push({ file, selector: rule.selector, clip: properties.get('background-clip') });
    }
  }
  assert.equal(filled.length, 3, `expected the three filled controls, found ${filled.length}`);
  assert.deepEqual(
    filled.filter(({ clip }) => clip !== 'padding-box'),
    [],
    'a filled control lets its fill run under the outline, so the outline reads over its own fill'
  );
});
