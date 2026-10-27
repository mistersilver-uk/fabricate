/**
 * Issue 2298: every `.manager-kicker` shares one ink, `--fab-text-muted`, which clears 4.5:1 in all
 * seven themes on each ground a manager panel head sits on, where subtle fell short at 8.5px.
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

const SHEET = 'styles/fabricate.css';
const corpus = collectStyleCorpus();
const sheet = rulesIn(corpus[SHEET]);
const themes = themePalettes(sheet);
const INK = '.fabricate-manager .manager-kicker';

test('the manager kicker inks muted and no other rule recolours it', () => {
  assert.equal(declaredToken(sheet, INK, 'color', SHEET), '--fab-text-muted');
  const recolouring = Object.entries(corpus).flatMap(([file, css]) =>
    rulesIn(css).flatMap((rule) =>
      propertiesOf(rule).has('color')
        ? splitSelectorList(rule.selector)
            .filter((selector) => /\.manager-kicker(?![\w-])/u.test(selector.split(/\s+/u).at(-1)))
            .map((selector) => `${file}: ${selector}`)
        : []
    )
  );
  assert.deepEqual(
    recolouring.filter((entry) => !entry.endsWith(INK)),
    []
  );
});

test('the manager kicker clears 4.5:1 on each ground a panel head sits on, in every theme', () => {
  for (const ground of ['--fab-bg-0', '--fab-bg-1', '--fab-bg-2', '--fab-surface']) {
    assert.deepEqual(shortfalls(themes, '--fab-text-muted', [ground]), [], ground);
  }
  assert.notDeepEqual(
    shortfalls(themes, '--fab-text-subtle', ['--fab-bg-1']),
    [],
    'subtle falls short on the tools aside'
  );
});
