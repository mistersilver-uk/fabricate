/**
 * Issue 2559: the gathering task row's callout chips clear 4.5:1 on the row's rest, selected and
 * hovered grounds, in all seven themes. The chips' classes are read from a mounted row and their
 * ink and ground from `Chip`'s own rules, so a callout that stops composing the opaque ground fails.
 */
import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';

import { BLOCKED_TASK, GATHERING_TASK_ROW_HARNESS } from '../helpers/gatheringTaskRowHarness.js';
import { collectStyleCorpus, declarationsIn, rulesIn } from '../helpers/styleBlockScan.js';
import { createMountedComponentHarness } from '../helpers/svelte-component-harness.js';
import {
  PANE_GROUNDS,
  contrast,
  stackGround,
  themePalettes,
} from '../helpers/themePaletteContrast.js';

const CHIP = 'src/ui/svelte/components/Chip.svelte';
const corpus = collectStyleCorpus();
const themes = themePalettes(rulesIn(corpus['styles/fabricate.css']));
const chipRules = rulesIn(corpus[CHIP]);

const harness = createMountedComponentHarness({
  ...GATHERING_TASK_ROW_HARNESS,
  tmpPrefix: 'fabricate-callout-contrast-',
});

/** The grounds a row paints, over each pane ground it can sit on; the rest ground is opaque. */
const ROW_GROUNDS = Object.freeze({
  rest: [['--fab-bg-1']],
  selected: PANE_GROUNDS.map((pane) => ['--fab-surface-active', pane]),
  hover: PANE_GROUNDS.map((pane) => ['--fab-surface-raised', pane]),
});

/** Whether a Chip selector (`.a.b` or `.a.b:is(.c, .d)`) matches an element carrying `classes`. */
function selectorSpecificity(selector, classes) {
  const match = selector.match(/^((?:\.[\w-]+)+)(?::is\(([^)]*)\))?$/u);
  if (!match) return -1;
  const own = match[1].split('.').filter(Boolean);
  if (own.some((name) => !classes.has(name))) return -1;
  if (!match[2]) return own.length;
  const any = match[2].split(',').map((part) => part.trim().replace(/^\./u, ''));
  return any.some((name) => classes.has(name)) ? own.length + 1 : -1;
}

/** The token one property resolves to on a Chip carrying `classes`: highest specificity, then last. */
function chipToken(classes, property) {
  let best = { specificity: -1, token: null };
  for (const rule of chipRules) {
    for (const part of rule.selector.split(',')) {
      const specificity = selectorSpecificity(part.trim(), classes);
      if (specificity < best.specificity || specificity < 0) continue;
      const declared = declarationsIn('', rule.body).find((entry) => entry.property === property);
      const token = declared?.value.match(/^var\((--fab-[\w-]+)\)$/u)?.[1];
      if (token) best = { specificity, token };
    }
  }
  assert.ok(best.token, `no ${property} token for .${[...classes].join('.')}`);
  return best.token;
}

/** Every theme where the chip's ink falls under 4.5:1 on its ground over a row ground. */
function shortfallsFor(classes) {
  const ink = chipToken(classes, 'color');
  const ground = chipToken(classes, 'background');
  const failed = [];
  for (const [state, stacks] of Object.entries(ROW_GROUNDS)) {
    for (const stack of stacks) {
      for (const [theme, tokens] of themes) {
        const ratio = contrast(tokens.get(ink), stackGround(tokens, [ground, ...stack]));
        if (ratio < 4.5) {
          failed.push(
            `${theme}: ${ink} on ${ground} over ${stack.join(' over ')} (${state}) ${ratio.toFixed(2)}:1`
          );
        }
      }
    }
  }
  return failed;
}

let chips;

before(async () => {
  await harness.setup();
  const target = await harness.mount({ task: BLOCKED_TASK });
  chips = [...target.querySelectorAll(':scope [data-gathering-callouts] > *')].map(
    (chip) => new Set(chip.getAttribute('class').split(/\s+/u))
  );
});

after(() => harness.teardown());

describe('gathering task row callout contrast (issue 2559)', () => {
  it('draws a neutral and a warning callout to measure', () => {
    assert.equal(themes.size, 7, 'the sheet declares seven palettes');
    assert.equal(chips.length, 2);
    assert.ok(chips[0].has('is-neutral') && chips[1].has('is-warning'));
  });

  it('clears 4.5:1 for the neutral callout on the rest, selected and hovered grounds', () => {
    assert.deepEqual(shortfallsFor(chips[0]), []);
  });

  it('clears 4.5:1 for the warning callout on the rest, selected and hovered grounds', () => {
    assert.deepEqual(shortfallsFor(chips[1]), []);
  });
});
