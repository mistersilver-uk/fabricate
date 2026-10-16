/**
 * Issue 2483: `--fab-text-muted` clears 4.5:1 on the five grounds hints and captions sit on, in all
 * seven themes, and `--fab-text-secondary` still reads at least 1.3:1 above it on the soft well.
 * The step is the two inks' contrast ratios divided, on the same flattened ground.
 */
import assert from 'node:assert/strict';
import test from 'node:test';

import { collectStyleCorpus, rulesIn } from '../helpers/styleBlockScan.js';
import {
  contrast,
  shortfalls,
  stackGround,
  themePalettes,
} from '../helpers/themePaletteContrast.js';

const themes = themePalettes(rulesIn(collectStyleCorpus()['styles/fabricate.css']));
const SOFT = ['--fab-surface-soft', '--fab-bg-2'];
const STEP = 1.3;

for (const stack of [
  SOFT,
  ['--fab-bg-1'],
  ['--fab-bg-2'],
  ['--fab-danger-soft', '--fab-bg-1'],
  ['--fab-surface-raised', '--fab-bg-1'],
]) {
  test(`muted ink clears 4.5:1 on ${stack.join(' over ')} in every palette`, () => {
    assert.deepEqual(shortfalls(themes, '--fab-text-muted', stack), []);
  });
}

test(`secondary ink reads at least ${STEP}:1 above muted on the soft well in every palette`, () => {
  assert.equal(themes.size, 7, `the sheet declares ${themes.size} palettes, not seven`);
  const collapsed = [...themes].flatMap(([theme, tokens]) => {
    const ground = stackGround(tokens, SOFT);
    const step =
      contrast(tokens.get('--fab-text-secondary'), ground) /
      contrast(tokens.get('--fab-text-muted'), ground);
    return step < STEP
      ? [`${theme}: secondary over muted on ${SOFT.join(' over ')} ${step.toFixed(2)}:1`]
      : [];
  });
  assert.deepEqual(collapsed, []);
});
