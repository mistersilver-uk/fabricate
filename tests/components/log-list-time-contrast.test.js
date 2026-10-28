/**
 * Issue 2257 D13: a log entry's time clears 4.5:1 on every ground the journal's Finished list draws
 * it on, in all seven themes: muted at rest, secondary on the raised hover ground.
 * Issue 2342: a hovered failed entry keeps its danger ground, raised, and its time clears 4.5:1 there.
 */
import assert from 'node:assert/strict';
import test from 'node:test';

import { collectStyleCorpus, rulesIn, splitSelectorList } from '../helpers/styleBlockScan.js';
import {
  contrast,
  flatten,
  mix,
  propertiesOf,
  themePalettes,
} from '../helpers/themePaletteContrast.js';

const LOG_LIST = 'src/ui/svelte/components/LogList.svelte';
const JOURNAL = 'src/ui/svelte/apps/journal/JournalView.svelte';
const corpus = collectStyleCorpus();
const themes = themePalettes(rulesIn(corpus['styles/fabricate.css']));

/** The palette token `file` paints `property` with on the rule listing `selector`. */
function paint(file, selector, property) {
  const [value, ...more] = rulesIn(corpus[file])
    .filter((rule) => splitSelectorList(rule.selector).includes(selector))
    .map((rule) => propertiesOf(rule).get(property))
    .filter(Boolean);
  assert.ok(value && more.length === 0, `${file} paints ${property} on ${selector} once`);
  return value.match(/^var\((--fab-[\w-]+)\)$/u)?.[1] ?? assert.fail(`${value} is not a token`);
}

const ENTRY = '.fab-log-list-entry';
const HOVERED = '.fab-log-list-entry.is-open:not(.is-selected):hover';
/** The list sits on the browse column, or on the journal's own ground once the view stacks. */
const HOSTS = [
  paint(JOURNAL, '.journal-browse', 'background'),
  paint(JOURNAL, '.journal-view-container', 'background'),
];

/** `theme: ratio` for each theme where `ink` on `entryGround`, over either host, is under 4.5:1. */
function under(ink, entryGround) {
  assert.equal(themes.size, 7, `the sheet declares ${themes.size} palettes, not seven`);
  return [...themes].flatMap(([theme, tokens]) =>
    HOSTS.map((host) =>
      contrast(tokens.get(ink), flatten(tokens.get(entryGround), tokens.get(host)))
    )
      .filter((ratio) => ratio < 4.5)
      .map((ratio) => `${theme}: ${ratio.toFixed(2)}:1`)
  );
}

test('the time is muted, and clears 4.5:1 on a resting, selected and failed entry', () => {
  const ink = paint(LOG_LIST, '.fab-log-list-when', 'color');
  assert.equal(ink, '--fab-text-muted');
  assert.deepEqual(under(ink, paint(LOG_LIST, ENTRY, 'background')), []);
  assert.deepEqual(under(ink, paint(LOG_LIST, `${ENTRY}.is-danger`, 'background')), []);
  const selectedGrounds = rulesIn(corpus[LOG_LIST]).filter(
    (rule) =>
      splitSelectorList(rule.selector).some((selector) =>
        selector.replaceAll(/:not\([^)]*\)/gu, '').includes('.is-selected')
      ) && propertiesOf(rule).has('background')
  );
  assert.deepEqual(selectedGrounds, [], 'a selected entry keeps the resting ground');
});

test('a hovered entry raises its ground, and its time takes secondary and clears 4.5:1 there', () => {
  const raised = paint(LOG_LIST, HOVERED, 'background');
  const ink = paint(LOG_LIST, `${HOVERED} .fab-log-list-when`, 'color');
  assert.equal(ink, '--fab-text-secondary');
  assert.deepEqual(under(ink, raised), []);
});

const DANGER_HOVERED = '.fab-log-list-entry.is-danger.is-open:not(.is-selected):hover';
const RAISED_DANGER =
  /^color-mix\(in srgb, var\((--fab-[\w-]+)\) (\d+)%, var\((--fab-[\w-]+)\)\)$/u;

/** The tint, its share and the raised ground of the hovered failed entry's `color-mix()`. */
function raisedDanger() {
  const [value, ...more] = rulesIn(corpus[LOG_LIST])
    .filter((rule) => splitSelectorList(rule.selector).includes(DANGER_HOVERED))
    .map((rule) => propertiesOf(rule).get('background'));
  assert.ok(value && more.length === 0, 'the hovered failed entry paints its background once');
  const [, tint, share, raised] = RAISED_DANGER.exec(value) ?? assert.fail(`${value} is not a mix`);
  return { tint, share: Number(share), raised };
}

test('a hovered failed entry mixes its danger ground with the raised one, and outranks the neutral hover', () => {
  const { tint, share, raised } = raisedDanger();
  assert.equal(tint, paint(LOG_LIST, `${ENTRY}.is-danger`, 'background'));
  assert.equal(raised, paint(LOG_LIST, HOVERED, 'background'));
  assert.ok(share > 50, 'the danger tint is the larger share');
});

test('the time on a hovered failed entry takes secondary and clears 4.5:1 on its raised danger ground', () => {
  const { tint, share, raised } = raisedDanger();
  const ink = paint(LOG_LIST, `${HOVERED} .fab-log-list-when`, 'color');
  assert.equal(ink, '--fab-text-secondary');
  const shortfalls = [...themes].flatMap(([theme, tokens]) =>
    HOSTS.map((host) =>
      contrast(
        tokens.get(ink),
        flatten(mix(tokens.get(tint), tokens.get(raised), share / 100), tokens.get(host))
      )
    )
      .filter((ratio) => ratio < 4.5)
      .map((ratio) => `${theme}: ${ratio.toFixed(2)}:1`)
  );
  assert.deepEqual(shortfalls, []);
});
