/** Issue 2358: the Stepper's unset placeholder reads muted and clears 4.5:1 on each ground a stepper sits on, in every theme. */
import assert from 'node:assert/strict';
import test from 'node:test';

import { Window } from 'happy-dom';

import { readDesignLibrary } from '../helpers/designLibrary.js';
import { collectStyleCorpus, rulesIn } from '../helpers/styleBlockScan.js';
import { declaredToken, shortfalls, themePalettes } from '../helpers/themePaletteContrast.js';

const STEPPER = 'src/ui/svelte/components/Stepper.svelte';
const corpus = collectStyleCorpus();
const stepper = rulesIn(corpus[STEPPER]);
const themes = themePalettes(rulesIn(corpus['styles/fabricate.css']));

const PLACEHOLDER = '.fab-stepper-input:not(:focus-visible)::placeholder';

/** The inline `color` of the library's `at min · unset` drawing. */
function drawnUnsetInk() {
  const { document } = new Window();
  document.write(readDesignLibrary());
  const unit = [...document.querySelectorAll('.unit')].find(
    (candidate) => candidate.querySelector('.cap')?.textContent === 'at min · unset'
  );
  assert.ok(unit, 'the library draws no at-min unset unit');
  return unit.querySelector(':scope .k-step input').style.getPropertyValue('color');
}

test('the unset placeholder inks muted and the library draws the shipped ink', () => {
  const ink = declaredToken(stepper, PLACEHOLDER, 'color', STEPPER);
  assert.equal(ink, '--fab-text-muted');
  assert.equal(drawnUnsetInk(), `var(${ink})`);
});

test('the placeholder clears 4.5:1 on the stepper well over each ground it sits on', () => {
  const ink = declaredToken(stepper, PLACEHOLDER, 'color', STEPPER);
  const well = declaredToken(stepper, '.fab-stepper', 'background', STEPPER);
  for (const ground of ['--fab-bg-1', '--fab-bg-2', '--fab-surface']) {
    assert.deepEqual(shortfalls(themes, ink, [well, ground]), [], ground);
  }
  assert.notDeepEqual(
    shortfalls(themes, '--fab-text-subtle', [well, '--fab-bg-2']),
    [],
    'subtle falls short there, so muted is the floor'
  );
});
