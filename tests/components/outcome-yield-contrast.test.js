/**
 * Issue 2257 D13–D15: the ladder's band and yield chips, and the scale's reading and pill, clear
 * 4.5:1 on each flattened ground they are drawn on, in all seven themes.
 */
import assert from 'node:assert/strict';
import test from 'node:test';

import { collectStyleCorpus, rulesIn, splitSelectorList } from '../helpers/styleBlockScan.js';
import { contrast, flatten, propertiesOf, themePalettes } from '../helpers/themePaletteContrast.js';

const SHEET = 'styles/fabricate.css';
const LADDER = 'src/ui/svelte/components/OutcomeLadder.svelte';
const SCALE = 'src/ui/svelte/components/YieldScale.svelte';
const CHIP = 'src/ui/svelte/components/Chip.svelte';
const corpus = collectStyleCorpus();
const themes = themePalettes(rulesIn(corpus[SHEET]));

/** The palette token `file` declares for `property` on the rule whose selector list holds `selector`. */
function token(file, selector, property) {
  const values = rulesIn(corpus[file])
    .filter((rule) => splitSelectorList(rule.selector).includes(selector))
    .map((rule) => propertiesOf(rule).get(property))
    .filter(Boolean);
  assert.equal(
    values.length,
    1,
    `${file} declares ${property} on ${selector} ${values.length} times`
  );
  const name = values[0].match(/^var\((--fab-[\w-]+)\)$/u)?.[1];
  assert.ok(name, `${file} ${selector} ${property} is not one palette token: ${values[0]}`);
  return name;
}

/** Every theme where `ink` measures under 4.5:1 on `stack`, its grounds listed top first. */
function shortfalls(ink, stack) {
  assert.equal(themes.size, 7, `the sheet declares ${themes.size} palettes, not seven`);
  const short = [];
  for (const [theme, tokens] of themes) {
    const ground = stack
      .slice(0, -1)
      .reduceRight((base, layer) => flatten(tokens.get(layer), base), tokens.get(stack.at(-1)));
    const ratio = contrast(tokens.get(ink), ground);
    if (ratio < 4.5)
      short.push(`${theme}: ${ink} on ${stack.join(' over ')} ${ratio.toFixed(2)}:1`);
  }
  return short;
}

const tierGround = () => token(LADDER, '.fab-outcome-tier', 'background');

test("the ladder's band clears 4.5:1 on its success and failure heads, and on the bare tier", () => {
  const band = token(LADDER, '.fab-outcome-band', 'color');
  assert.equal(band, '--fab-text-secondary');
  const success = token(LADDER, '.fab-outcome-tier-heading', 'background');
  assert.deepEqual(shortfalls(band, [success, tierGround()]), []);
  assert.deepEqual(shortfalls(band, [tierGround()]), []);
  const failed = token(LADDER, '.is-failure .fab-outcome-band', 'color');
  const failedHead = token(LADDER, '.is-failure .fab-outcome-tier-heading', 'background');
  assert.deepEqual(shortfalls(failed, [failedHead, tierGround()]), []);
});

test("the ladder's yield chip clears 4.5:1 for its name, quantity and members", () => {
  const ink = token(LADDER, '.fab-outcome-yield', 'color');
  assert.equal(ink, '--fab-text-secondary');
  const chip = token(LADDER, '.fab-outcome-yield', 'background');
  assert.deepEqual(shortfalls(ink, [chip, tierGround()]), []);
  const recoloured = rulesIn(corpus[LADDER]).filter(
    (rule) =>
      propertiesOf(rule).has('color') &&
      splitSelectorList(rule.selector).some((selector) =>
        /\.fab-outcome-yield-(?:name|quantity|detail)$/u.test(selector.trim())
      )
  );
  assert.deepEqual(
    recoloured.map((rule) => rule.selector),
    [],
    "the name, quantity and members inherit the chip's ink"
  );
});

const rowGround = () => token(SHEET, '.fabricate-list-row', 'background');
const clearedWash = () => token(SHEET, '.fabricate-list-row.is-positive', 'background');

test("the scale's sentence clears 4.5:1 in muted on its row and in secondary on a cleared row", () => {
  const reading = token(SCALE, '.fab-yield-reading', 'color');
  assert.equal(reading, '--fab-text-muted');
  assert.deepEqual(shortfalls(reading, [rowGround()]), []);
  const cleared = token(SCALE, '.fab-yield-row.is-cleared .fab-yield-reading', 'color');
  assert.equal(cleared, '--fab-text-secondary');
  assert.deepEqual(shortfalls(cleared, [clearedWash(), rowGround()]), []);
});

test("the scale's bare pill clears 4.5:1 on each ground its tone is drawn on", () => {
  const chip = (tone, property) => token(CHIP, `.manager-chip.is-${tone}`, property);
  const pillGround = token(CHIP, '.manager-chip', 'background');
  // A cleared row's pill takes the secondary tone; the neutral one measures under 4.5:1 there.
  assert.deepEqual(
    shortfalls(chip('secondary', 'color'), [
      chip('secondary', 'background'),
      clearedWash(),
      rowGround(),
    ]),
    []
  );
  assert.notDeepEqual(
    shortfalls(chip('neutral', 'color'), [pillGround, clearedWash(), rowGround()]),
    [],
    'the neutral ink falls short on the success wash, which is why the cleared pill is secondary'
  );
  assert.deepEqual(shortfalls(chip('neutral', 'color'), [pillGround, rowGround()]), []);
  assert.deepEqual(
    shortfalls(chip('positive', 'color'), [chip('positive', 'background'), rowGround()]),
    []
  );
});
