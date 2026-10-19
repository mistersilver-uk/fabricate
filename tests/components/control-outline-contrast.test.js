/** Issues 2047 and 2492: an unchecked selection control's outline and a switch's off face are one token each, 3:1 on their surface. */
import assert from 'node:assert/strict';
import test from 'node:test';

import {
  collectStyleCorpus,
  declarationsIn,
  rulesIn,
  splitSelectorList,
} from '../helpers/styleBlockScan.js';
import {
  contrast,
  declaredToken,
  mix,
  propertiesOf,
  shortfalls,
  stackGround,
  themePalettes,
} from '../helpers/themePaletteContrast.js';

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

/** The switch's off face, read from the rule that declares it (issue 2492). */
const SWITCH = '.fabricate-toggle.fabricate-toggle';
const SWITCH_OFF = `${SWITCH}.is-off`;
const SWITCH_ON = `${SWITCH}.is-on`;
const restingRules = sheetRules.filter((rule) => !rule.context);
const declaredOn = (selector, property) => declaredToken(restingRules, selector, property);

/** The four grounds a switch sits on, top first: the three fills and a card over `--fab-bg-2`. */
const SWITCH_GROUNDS = Object.freeze([
  ['--fab-bg-0'],
  ['--fab-bg-1'],
  ['--fab-bg-2'],
  ['--fab-surface-soft', '--fab-bg-2'],
]);

/** `token`, or the palette token its one owner rule aliases it to, as `--fab-control-outline` is. */
function paletteToken(token, themes) {
  if ([...themes.values()].every((tokens) => tokens.has(token))) return token;
  const owner = restingRules.find((rule) => propertiesOf(rule).has(token));
  const alias = propertiesOf(owner)
    .get(token)
    .match(/^var\((--fab-[\w-]+)\)$/u)?.[1];
  assert.ok(alias, `${token} is neither a palette token nor one alias of one`);
  return paletteToken(alias, themes);
}

/** The single declaration of `property` on the rule listing `selector`. */
const declarationOf = (selector, property) =>
  propertiesOf(
    restingRules.find((rule) => splitSelectorList(rule.selector).includes(selector))
  ).get(property);

test('the switch paints its track and knob from the family properties, its fill clipped', () => {
  const track = '.fabricate-toggle .manager-status-toggle-track';
  assert.equal(declarationOf(track, 'border'), '1px solid var(--fab-toggle-track-border)');
  assert.equal(declarationOf(track, 'background'), 'var(--fab-toggle-track)');
  assert.equal(
    declarationOf(track, 'background-clip'),
    'padding-box',
    'the edge reads on the ground'
  );
  const knob = '.fabricate-toggle .manager-status-toggle-knob';
  assert.equal(declarationOf(knob, 'background'), 'var(--fab-toggle-knob)');
});

test('the off switch draws its edge and its knob at 3:1 on every ground, in every palette', () => {
  const themes = themePalettes(sheetRules);
  const edge = paletteToken(declaredOn(SWITCH_OFF, '--fab-toggle-track-border'), themes);
  const knob = paletteToken(declaredOn(SWITCH_OFF, '--fab-toggle-knob'), themes);
  const fill = declaredOn(SWITCH_OFF, '--fab-toggle-track');
  assert.deepEqual(
    [edge, knob, fill],
    ['--fab-text-subtle', '--fab-text-muted', '--fab-surface-soft']
  );
  const short = SWITCH_GROUNDS.flatMap((ground) => [
    ...shortfalls(themes, edge, ground, 3),
    ...shortfalls(themes, knob, [fill, ...ground], 3),
  ]);
  assert.deepEqual(short, [], 'an off switch would be under WCAG 1.4.11');
});

test('the off switch’s hover edge and the on knob hold 3:1, in every palette', () => {
  const hover = restingRules.find((rule) =>
    splitSelectorList(rule.selector).some((selector) => selector.startsWith(`${SWITCH_OFF}:not(`))
  );
  const face = propertiesOf(hover);
  assert.deepEqual([...face.keys()], ['border-color'], 'an off switch hovers on its edge alone');
  const [, share, lift] = face
    .get('border-color')
    .match(
      /^color-mix\(in srgb, var\(--fab-toggle-track-border\) (\d+)%, var\((--fab-[\w-]+)\)\)$/u
    );
  const themes = themePalettes(sheetRules);
  const edge = paletteToken(declaredOn(SWITCH_OFF, '--fab-toggle-track-border'), themes);
  const ink = paletteToken(declaredOn(SWITCH, lift), themes);
  const onKnob = declaredOn(SWITCH_ON, '--fab-toggle-knob');
  const onTrack = declaredOn(SWITCH_ON, '--fab-toggle-track');
  const short = [];
  for (const [theme, tokens] of themes) {
    const hovered = mix(tokens.get(edge), tokens.get(ink), Number(share) / 100);
    for (const ground of SWITCH_GROUNDS) {
      const ratio = contrast(hovered, stackGround(tokens, ground));
      if (ratio < 3)
        short.push(`${theme}: hovered edge on ${ground.join(' over ')} ${ratio.toFixed(2)}:1`);
    }
    const ratio = contrast(tokens.get(onKnob), tokens.get(onTrack));
    if (ratio < 3) short.push(`${theme}: ${onKnob} on ${onTrack} ${ratio.toFixed(2)}:1`);
  }
  assert.deepEqual(short, []);
});
