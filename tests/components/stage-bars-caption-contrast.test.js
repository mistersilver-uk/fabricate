/**
 * Issue 2455: `StageBars`' caption, the one text it draws, clears 4.5:1 in all seven themes on the
 * grounds a numbered group is drawn on: the run ground, the detail pane's `--fab-surface`, and the
 * two app grounds a published group sits on in a companion's window.
 */
import assert from 'node:assert/strict';
import test from 'node:test';

import { collectStyleCorpus, rulesIn } from '../helpers/styleBlockScan.js';
import { declaredToken, shortfalls, themePalettes } from '../helpers/themePaletteContrast.js';

const STAGE_BARS = 'src/ui/svelte/components/StageBars.svelte';
const corpus = collectStyleCorpus();
const themes = themePalettes(rulesIn(corpus['styles/fabricate.css']));
const ink = declaredToken(
  rulesIn(corpus[STAGE_BARS]),
  '.fab-stage-bars-caption',
  'color',
  STAGE_BARS
);

test('the stage caption inks --fab-text-muted', () => {
  assert.equal(ink, '--fab-text-muted');
});

for (const ground of ['--fab-surface', '--fab-bg-1', '--fab-bg-2']) {
  test(`the stage caption clears 4.5:1 on ${ground} in every theme`, () => {
    assert.deepEqual(shortfalls(themes, ink, [ground]), []);
  });
}
