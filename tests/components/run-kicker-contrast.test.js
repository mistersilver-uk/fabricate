/**
 * Issue 2257 D22: the run bar's and run progress's kickers are `Kicker`, whose ink clears 4.5:1 on
 * the run ground, the detail pane's `--fab-surface`, in all seven themes. The containers between
 * the pane and the kickers are named by hand from `RunDetail.svelte`'s nesting, and no stylesheet
 * may paint one, so the pane stays the ground the kickers are read on.
 */
import assert from 'node:assert/strict';
import test from 'node:test';

import { collectStyleCorpus, rulesIn, splitSelectorList } from '../helpers/styleBlockScan.js';
import {
  declaredToken,
  propertiesOf,
  shortfalls,
  themePalettes,
} from '../helpers/themePaletteContrast.js';

const KICKER = 'src/ui/svelte/components/Kicker.svelte';
const JOURNAL_VIEW = 'src/ui/svelte/apps/journal/JournalView.svelte';
const corpus = collectStyleCorpus();
const themes = themePalettes(rulesIn(corpus['styles/fabricate.css']));

const token = (file, selector, property) =>
  declaredToken(rulesIn(corpus[file]), selector, property, file);

const BETWEEN_PANE_AND_KICKERS = [
  '.journal-detail',
  '.journal-detail-state',
  '.journal-detail-header',
  '.journal-actions',
  '.journal-detail-stages',
  '.fab-run-action-bar',
  '.fab-run-action-completion',
  '.fab-run-progress',
  '.fab-run-progress-heading',
  '.fab-run-progress-label',
];

/** Whether `selector`'s subject, its last compound, carries `className`. */
function subjectCarries(selector, className) {
  const subject = selector.split(/\s*[\s>+~]\s*(?![^(]*\))/u).at(-1);
  return new RegExp(String.raw`\.${className.slice(1)}(?![\w-])`, 'u').test(subject);
}

test('no stylesheet paints a container between the detail pane and the run kickers', () => {
  const painted = Object.entries(corpus).flatMap(([file, css]) =>
    rulesIn(css).flatMap((rule) => {
      const properties = propertiesOf(rule);
      if (!properties.has('background') && !properties.has('background-color')) return [];
      return splitSelectorList(rule.selector)
        .filter((selector) =>
          BETWEEN_PANE_AND_KICKERS.some((container) => subjectCarries(selector, container))
        )
        .map((selector) => `${file}: ${selector}`);
    })
  );
  assert.deepEqual(painted, []);
});

test('the run kickers clear 4.5:1 on the detail pane in every theme', () => {
  const ground = token(JOURNAL_VIEW, '.journal-detail-pane', 'background');
  assert.equal(ground, '--fab-surface');
  assert.deepEqual(shortfalls(themes, token(KICKER, '.fab-kicker', 'color'), [ground]), []);
});
