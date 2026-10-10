/**
 * Issue 2257 D13, D14: the ladder's band and yield chips clear 4.5:1 on each flattened ground they
 * are drawn on, in all seven themes.
 */
import assert from 'node:assert/strict';
import test from 'node:test';

import { collectStyleCorpus, rulesIn, splitSelectorList } from '../helpers/styleBlockScan.js';
import { contrast, flatten, propertiesOf, themePalettes } from '../helpers/themePaletteContrast.js';

const SHEET = 'styles/fabricate.css';
const LADDER = 'src/ui/svelte/components/OutcomeLadder.svelte';
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
});

