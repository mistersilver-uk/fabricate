/**
 * Issue 2463 — the library's `.k-step` kit declares the geometry, type and states `Stepper` ships,
 * and the `<Stepper>` entry draws one unit per catalogue row. Declared values only: a computed
 * value or a box is `stepper-type-rendered.test.js`'s.
 */
import assert from 'node:assert/strict';
import { resolve } from 'node:path';
import test from 'node:test';

import { Window } from 'happy-dom';

import { catalogueEntries } from '../../scripts/lib/primitiveLabSmoke.js';
import { byCodePoint } from '../helpers/codePointOrder.js';
import { readDesignLibrary } from '../helpers/designLibrary.js';
import {
  collectStyleCorpus,
  rulesIn,
  splitSelectorList,
  stripCssComments,
} from '../helpers/styleBlockScan.js';
import { propertiesOf } from '../helpers/themePaletteContrast.js';
import { specBlocks, unitsOf } from '../view-lab/primitives/library.js';

const repoRoot = resolve(import.meta.dirname, '../..');
const STEPPER = 'src/ui/svelte/components/Stepper.svelte';
const ENTRY = '<Stepper>';
const COMPOSITE = 'composite vertical · duration';

const { document } = new Window();
document.write(readDesignLibrary());
const kit = [...document.querySelectorAll('style')].flatMap((style) =>
  rulesIn(stripCssComments(style.textContent))
);
const shipped = rulesIn(collectStyleCorpus()[STEPPER]);
const entry = specBlocks(document.body).get(ENTRY);
const units = unitsOf(entry);

const rulesListing = (rules, selector) =>
  rules.filter((rule) => splitSelectorList(rule.selector).includes(selector));

/** The declarations of the one rule in `rules` whose selector list holds `selector`. */
function declared(rules, selector) {
  const found = rulesListing(rules, selector);
  assert.equal(found.length, 1, `${selector} is declared ${found.length} times`);
  return propertiesOf(found[0]);
}

/** Each `[drawn property, shipped property]` pair declares one value in the kit and the component. */
function assertPairs(drawnSelector, shippedSelector, pairs) {
  const drawn = declared(kit, drawnSelector);
  const live = declared(shipped, shippedSelector);
  for (const [property, shippedProperty = property] of pairs) {
    const value = live.get(shippedProperty);
    assert.ok(value, `${shippedSelector} declares no ${shippedProperty}`);
    assert.equal(
      drawn.get(property),
      value,
      `${drawnSelector} ${property} against ${shippedSelector} ${shippedProperty}`
    );
  }
}

test('the kit value declares the shipped type and box', () => {
  assertPairs('.k-step input', '.fab-stepper-input', [
    ['font-family'],
    ['font-size'],
    ['font-weight'],
    ['font-variant-numeric'],
    ['width'],
    ['height'],
  ]);
});

test('the kit adjunct declares the shipped box, corner and glyph at both densities', () => {
  assertPairs('.k-step button', '.fab-stepper-adjunct', [['width'], ['height'], ['border-radius']]);
  assertPairs('.k-step .i', '.fab-stepper-adjunct', [
    ['width', 'font-size'],
    ['height', 'font-size'],
  ]);
  assertPairs(
    '.k-step.comfy button',
    '.fab-stepper.is-comfortable:not(.is-vertical) .fab-stepper-adjunct',
    [['width'], ['height']]
  );
});

test('the kit group declares the shipped gap, padding, edge and ground', () => {
  assertPairs('.k-step', '.fab-stepper', [
    ['gap'],
    ['padding'],
    ['border'],
    ['border-radius'],
    ['background'],
  ]);
});

test('the composite and the standalone vertical unit share the shipped vertical rules', () => {
  for (const part of ['', ' button', ' .i', ' input']) {
    const [rule, ...others] = rulesListing(kit, `.k-stepset .k-step${part}`);
    assert.ok(rule && others.length === 0, `one kit rule draws the composite's${part || ' group'}`);
    assert.deepEqual(splitSelectorList(rule.selector), [
      `.k-stepset .k-step${part}`,
      `.k-step.vert${part}`,
    ]);
  }
  assertPairs('.k-step.vert', '.fab-stepper.is-vertical', [
    ['flex-direction'],
    ['gap'],
    ['padding'],
    ['border'],
    ['background'],
  ]);
  const adjunct = '.fab-stepper.is-vertical .fab-stepper-adjunct';
  assertPairs('.k-step.vert button', adjunct, [['width'], ['height'], ['border-radius']]);
  assertPairs('.k-step.vert .i', adjunct, [
    ['width', 'font-size'],
    ['height', 'font-size'],
  ]);
  assertPairs('.k-step.vert input', '.fab-stepper.is-vertical .fab-stepper-input', [
    ['width'],
    ['height'],
    ['font-size'],
  ]);
});

test('the kit states declare the shipped hover, limit and disabled inks', () => {
  const hovers = kit
    .flatMap((rule) => splitSelectorList(rule.selector))
    .filter((selector) => /\.k-step\b.*:hover/u.test(selector));
  assert.deepEqual(hovers, ['.k-step button:not(.dis):hover'], 'a dimmed button takes no hover');
  assertPairs(hovers[0], '.fab-stepper-adjunct:hover:not(:disabled)', [['color'], ['background']]);
  assertPairs('.k-step button.dis', '.fab-stepper-adjunct:disabled', [['color'], ['cursor']]);
  const drawn = units.get('disabled').querySelector(':scope .k-step').style;
  assert.equal(
    Number(drawn.getPropertyValue('opacity')),
    Number(declared(shipped, '.fab-stepper.is-disabled').get('opacity'))
  );
});

test('the entry draws one unit per catalogue row, beside the composite', () => {
  const caps = catalogueEntries(repoRoot)
    .filter(({ row }) => row.spec === ENTRY)
    .map(({ row }) => row.cap);
  assert.ok(caps.length > 0, 'the catalogue holds no Stepper row');
  assert.deepEqual([...units.keys()].sort(byCodePoint), [...caps, COMPOSITE].sort(byCodePoint));
});

test('the unset unit draws a live decrement, and nothing draws a rail', () => {
  const unset = units.get('at min · unset');
  assert.equal(unset.querySelectorAll(':scope .k-step button').length, 2);
  assert.equal(unset.querySelectorAll(':scope .k-step button.dis').length, 0);
  assert.equal(document.querySelectorAll('.k-step .rail').length, 0);
  assert.deepEqual(
    kit.filter((rule) => /\.k-step\b.*\.rail\b/u.test(rule.selector)).map((rule) => rule.selector),
    []
  );
});

test('the entry’s chip reads its declared status', () => {
  const status = entry.getAttribute('data-status');
  assert.ok(status, 'the entry declares no status');
  assert.equal(entry.getAttribute('data-status-stepper'), status);
  const chip = entry.querySelector(':scope .spec-head > .st');
  assert.equal(chip.className, `st st-${status}`);
  assert.equal(chip.textContent, status);
});
