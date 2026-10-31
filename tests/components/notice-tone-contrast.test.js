/**
 * Issue 2847: the published `Notice`'s contrast at all five tones, `accent` among them, read from
 * its own rules over the seven themes, as the ui-extension-points "Notice" group states it: the
 * title, the detail, the action's label and the dismiss glyph at rest and under the pointer, the
 * button tile, and the accent ring, over `--fab-bg-0`, `--fab-bg-1`, `--fab-surface`, `--fab-bg-2`
 * and `--fab-bg-3`.
 */
import assert from 'node:assert/strict';
import test from 'node:test';

import { collectStyleCorpus, rulesIn, splitSelectorList } from '../helpers/styleBlockScan.js';
import {
  contrast,
  declaredToken,
  propertiesOf,
  shortfalls,
  stackGround,
  themePalettes,
} from '../helpers/themePaletteContrast.js';

const NOTICE = 'src/ui/svelte/components/Notice.svelte';
const corpus = collectStyleCorpus();
const themes = themePalettes(rulesIn(corpus['styles/fabricate.css']));
const rules = rulesIn(corpus[NOTICE]);
const token = (selector, property) => declaredToken(rules, selector, property, NOTICE);

const TONES = ['danger', 'warning', 'info', 'success', 'accent'];
const FOUR = ['--fab-bg-0', '--fab-bg-1', '--fab-surface', '--fab-bg-2'];
const BG3 = '--fab-bg-3';

/** `danger` is the unmodified notice, and every other tone restates the fill and the title. */
const fillOf = (tone) =>
  token(tone === 'danger' ? '.fab-notice' : `.fab-notice.is-${tone}`, 'background');
const titleInk = (tone) =>
  token(
    tone === 'danger' ? '.fab-notice-title' : `.fab-notice.is-${tone} .fab-notice-title`,
    'color'
  );

/** `ink` over `stack` on each of `grounds` at each tone, as the helper's shortfall lines. */
const under = (ink, layers, grounds, floor = 4.5) =>
  TONES.flatMap((tone) =>
    grounds.flatMap((ground) =>
      shortfalls(themes, ink(tone), [...layers, fillOf(tone), ground], floor)
    )
  );

/** The least reading of `ink` over `layers` on `ground` across the five tones and seven themes. */
const least = (ink, layers, ground) =>
  Math.min(
    ...TONES.flatMap((tone) =>
      [...themes.values()].map((tokens) =>
        contrast(tokens.get(ink), stackGround(tokens, [...layers, fillOf(tone), ground]))
      )
    )
  ).toFixed(2);

const REST = ['--fab-text-secondary', ['--fab-surface-soft']];
const HOVER = ['--fab-text', ['--fab-surface-raised']];

test('each tone paints its own fill, and its title in its own -text ink', () => {
  for (const tone of TONES) {
    assert.equal(fillOf(tone), `--fab-${tone}-soft`, tone);
    assert.equal(titleInk(tone), `--fab-${tone}-text`, tone);
  }
});

test('the title clears 4.5:1 at every tone on the four grounds, and not on --fab-bg-3', () => {
  assert.deepEqual(under(titleInk, [], FOUR), []);
  for (const tone of TONES) {
    assert.notDeepEqual(shortfalls(themes, titleInk(tone), [fillOf(tone), BG3]), [], tone);
  }
});

test('the detail is muted, clears 4.5:1 everywhere only at danger, and falls short where stated', () => {
  assert.equal(token('.fab-notice-detail', 'color'), '--fab-text-muted');
  const at = (tone, ground) => shortfalls(themes, '--fab-text-muted', [fillOf(tone), ground]);
  for (const ground of ['--fab-bg-0', '--fab-bg-1', '--fab-surface']) {
    assert.deepEqual(at('danger', ground), [], ground);
  }
  for (const tone of TONES) {
    if (tone === 'danger') continue;
    const short = at(tone, '--fab-bg-1').map((line) => line.split(':', 1)[0]);
    assert.ok(short.includes('fabricate') && short.length <= 4, `${tone}: ${short}`);
  }
  for (const tone of TONES) {
    assert.notDeepEqual(at(tone, '--fab-bg-2'), [], tone);
    assert.notDeepEqual(at(tone, BG3), [], tone);
  }
});

test('the action label clears 4.5:1 at rest and under the pointer on the four grounds, not on --fab-bg-3', () => {
  assert.deepEqual(
    [token('.fab-notice-button', 'color'), token('.fab-notice-button', 'background')],
    ['--fab-text-secondary', '--fab-surface-soft']
  );
  assert.deepEqual(
    [token('.fab-notice-button:hover', 'color'), token('.fab-notice-button:hover', 'background')],
    ['--fab-text', '--fab-surface-raised']
  );
  for (const [ink, layers] of [REST, HOVER]) {
    assert.deepEqual(
      under(() => ink, layers, FOUR),
      [],
      ink
    );
    assert.ok(under(() => ink, layers, [BG3]).length > 0, ink);
  }
});

test('the dismiss glyph clears 3:1 on the four grounds, at the least figures the spec states', () => {
  const [rest, hover] = [REST, HOVER].map(
    ([ink, layers]) =>
      (ground) =>
        least(ink, layers, ground)
  );
  for (const [ink, layers] of [REST, HOVER]) {
    assert.deepEqual(
      under(() => ink, layers, FOUR, 3),
      [],
      ink
    );
  }
  assert.deepEqual(
    ['--fab-bg-0', '--fab-bg-1', '--fab-surface', '--fab-bg-2', BG3].map((ground) => [
      rest(ground),
      hover(ground),
    ]),
    [
      ['5.81', '6.94'],
      ['5.36', '6.42'],
      ['5.36', '6.42'],
      ['4.53', '5.87'],
      ['2.55', '3.39'],
    ]
  );
});

test("the button's tile is under 3:1 against the notice's fill in every theme", () => {
  for (const tone of TONES) {
    for (const ground of FOUR) {
      for (const tokens of themes.values()) {
        const fill = stackGround(tokens, [fillOf(tone), ground]);
        const ratio = contrast(tokens.get('--fab-surface-soft'), fill);
        assert.ok(ratio < 3, `${tone} over ${ground}: ${ratio.toFixed(2)}:1`);
      }
    }
  }
});

test('the keyboard ring is the accent and clears 3:1 on the fill over the four grounds', () => {
  const ring = rules.find((rule) =>
    splitSelectorList(rule.selector).includes('.fab-notice-button:focus-visible')
  );
  assert.equal(propertiesOf(ring).get('outline'), '2px solid var(--fab-accent)');
  assert.deepEqual(
    under(() => '--fab-accent', [], FOUR, 3),
    []
  );
});
