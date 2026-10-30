/**
 * Issue 2814: the `SegmentedControl` `compact` and `field` tracks paint `--fab-bg-1`, and on that
 * track, and bare in the `pill` shape on each ground the group names, the selected segment's ink and
 * the unselected segments' `--fab-text-muted` clear 4.5:1 in all seven themes under each published
 * tone but the soft accent one in the `pill` shape, which falls short on `--fab-bg-2`; under forced
 * colors the selected state is the weight alone, 600 against 500, and nothing here checks forced
 * colors beyond that weight. Read off the rules.
 */
import assert from 'node:assert/strict';
import test from 'node:test';

import { readStylesheet } from '../../scripts/lib/stylesheetSource.js';
import { splitSelectorList, collectStyleCorpus, rulesIn } from '../helpers/styleBlockScan.js';
import {
  declaredToken,
  propertiesOf,
  shortfalls,
  themePalettes,
} from '../helpers/themePaletteContrast.js';

const SEGMENTED = 'src/ui/svelte/components/SegmentedControl.svelte';
const corpus = collectStyleCorpus();
const themes = themePalettes(rulesIn(corpus['styles/fabricate.css']));
const rules = rulesIn(corpus[SEGMENTED]);
const token = (selector, property) => declaredToken(rules, selector, property, SEGMENTED);
const GROUNDS = ['--fab-bg-0', '--fab-bg-1', '--fab-surface', '--fab-bg-2'];
const RUNGS = ['compact', 'field'];

const track = (rung) => `.manager-segmented.is-${rung}`;
/** The selected segment's rule on a track, or the shared one, whichever declares `property`. */
const activeFor = (rung, property) => {
  const own = `${track(rung)} .manager-segment.is-active`;
  const declares = (selector) =>
    rules.some(
      (rule) =>
        splitSelectorList(rule.selector).includes(selector) && propertiesOf(rule).has(property)
    );
  return declares(own) ? own : '.manager-segment.is-active';
};
const weightOf = (selector) => {
  const found = rules
    .filter((rule) => splitSelectorList(rule.selector).includes(selector))
    .map((rule) => propertiesOf(rule).get('font-weight'))
    .filter(Boolean);
  assert.equal(found.length, 1, `${selector} declares one font-weight`);
  return found[0];
};

for (const rung of RUNGS) {
  test(`the ${rung} track paints --fab-bg-1, a ground the group names`, () => {
    const fill = token(track(rung), 'background');
    assert.equal(fill, '--fab-bg-1');
    assert.ok(GROUNDS.includes(fill));
  });

  test(`the ${rung} track's padding is 4px, so a 2px ring at a 2px offset ends at the track's inner edge`, () => {
    const padding = token(track(rung), 'padding');
    const resolved = new RegExp(String.raw`${padding}:\s*(\d+)px`, 'u').exec(readStylesheet());
    assert.equal(resolved?.[1], '4');
  });

  test(`the ${rung} track's selected segment inks --fab-text on its raised tile over the track`, () => {
    const fill = token(activeFor(rung, 'background'), 'background');
    const ink = token(activeFor(rung, 'color'), 'color');
    assert.deepEqual([fill, ink], ['--fab-surface-active', '--fab-text']);
    assert.deepEqual(shortfalls(themes, ink, [fill, token(track(rung), 'background')]), []);
  });

  test(`the ${rung} track carries the selected state in weight, 600 against 500, as forced colors strip the fills`, () => {
    assert.equal(weightOf(activeFor(rung, 'font-weight')), '600');
    assert.equal(weightOf(`${track(rung)} .manager-segment:not(.is-active)`), '500');
  });

  test(`the ${rung} track under each tone inks its selected segment on its fill over the track`, () => {
    const well = token(track(rung), 'background');
    for (const tone of ['accent', 'accent-soft', 'info']) {
      const chosen = `.manager-segmented.is-${tone} .manager-segment.is-active`;
      const [fill, ink] = [token(chosen, 'background'), token(chosen, 'color')];
      assert.deepEqual(shortfalls(themes, ink, [fill, well]), [], `${tone} on the track`);
    }
  });

  test(`the ${rung} track keeps an info option's tint legible inside an accent track`, () => {
    const well = token(track(rung), 'background');
    for (const tone of ['accent', 'accent-soft']) {
      const chosen = `.manager-segmented.is-${tone} .manager-segment.is-active.is-info`;
      const [fill, ink] = [token(chosen, 'background'), token(chosen, 'color')];
      assert.deepEqual(shortfalls(themes, ink, [fill, well]), [], tone);
      for (const ground of GROUNDS) {
        assert.deepEqual(shortfalls(themes, ink, [fill, ground]), [], `${tone} pill on ${ground}`);
      }
    }
  });

  test(`the ${rung} track's idle segment inks muted on the track and, bare in the pill shape, on each ground`, () => {
    const idle = `${track(rung)} .manager-segment:not(.is-active)`;
    assert.equal(token(idle, 'color'), '--fab-text-muted');
    assert.deepEqual(
      shortfalls(themes, '--fab-text-muted', [token(track(rung), 'background')]),
      []
    );
    for (const ground of GROUNDS) {
      assert.deepEqual(shortfalls(themes, '--fab-text-muted', [ground]), [], ground);
    }
  });
}

test('a field track edges its selected segment in the accent border and a compact one has no edge of its own', () => {
  assert.equal(token(activeFor('field', 'border-color'), 'border-color'), '--fab-accent-border');
  assert.equal(activeFor('compact', 'border-color'), '.manager-segment.is-active');
});

// The pill shape drops the track's fill, so a density changes nothing there: the soft accent tone's
// ink falls short of 4.5:1 on --fab-bg-2 in two themes, a gap of the published tone and shape.
test('the soft accent tone in the pill shape falls short on --fab-bg-2 in two themes and clears every other ground', () => {
  const chosen = '.manager-segmented.is-accent-soft .manager-segment.is-active';
  const [fill, ink] = [token(chosen, 'background'), token(chosen, 'color')];
  for (const ground of GROUNDS) {
    const short = shortfalls(themes, ink, [fill, ground]);
    assert.equal(short.length, ground === '--fab-bg-2' ? 2 : 0, ground);
  }
});
