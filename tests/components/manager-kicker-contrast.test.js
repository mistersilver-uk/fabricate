/**
 * Issue 2298: every `.manager-kicker` shares one ink, `--fab-text-muted`, which clears 4.5:1 in all
 * seven themes on each ground a manager panel head sits on, where subtle fell short at 8.5px.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import test from 'node:test';

import { listSvelteComponents } from '../../scripts/lib/svelteComponentFiles.js';
import { byCodePoint } from '../helpers/codePointOrder.js';
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

/** The classes a template writes beside `manager-kicker` on one element, read from `class="..."`. */
function companionClasses() {
  const found = new Set();
  const root = resolve(import.meta.dirname, '../../src');
  for (const file of listSvelteComponents(root)) {
    for (const [, list] of readFileSync(file, 'utf8').matchAll(/class="([^"]*)"/gu)) {
      const classes = list.split(/\s+/u);
      if (classes.includes('manager-kicker')) {
        for (const name of classes) found.add(name);
      }
    }
  }
  return [...found].sort(byCodePoint);
}

/** The compounds a selector's subject can be: its last compound, with `:is()` and `:where()` expanded. */
function subjects(selector) {
  const compound = selector
    .trim()
    .split(/\s*[\s>+~]\s*(?![^(]*\))/u)
    .at(-1);
  const inner = compound.match(/:(?:is|where)\(([^)]*)\)/u);
  if (!inner) return [compound];
  const rest = compound.replace(inner[0], '');
  return splitSelectorList(inner[1]).flatMap((alternative) => subjects(alternative + rest));
}

/** Each `file: selector` whose subject carries one of `names` and which declares `property`. */
function rulesDeclaring(property, names) {
  return Object.entries(corpus).flatMap(([file, css]) =>
    rulesIn(css).flatMap((rule) =>
      propertiesOf(rule).has(property)
        ? splitSelectorList(rule.selector)
            .filter((selector) =>
              subjects(selector).some((subject) =>
                names.some((name) => new RegExp(String.raw`\.${name}(?![\w-])`, 'u').test(subject))
              )
            )
            .map((selector) => `${file}: ${selector}`)
        : []
    )
  );
}

test('the manager kicker inks muted and no other rule recolours it or fades it', () => {
  assert.equal(declaredToken(sheet, INK, 'color', SHEET), '--fab-text-muted');
  const names = companionClasses();
  assert.ok(
    names.includes('manager-kicker') && names.length > 1,
    'the markup scan found companions'
  );
  for (const property of ['color', 'opacity']) {
    const restated = rulesDeclaring(property, names).filter(
      (entry) => !(property === 'color' && entry.endsWith(`: ${INK}`))
    );
    assert.deepEqual(restated, [], `a rule restates the kicker's ${property}`);
  }
});

// The grounds a manager panel head sits on are bg-0, bg-1, bg-2 and the surface; bg-3 and
// surface-active are not kicker grounds, so muted is not asked to clear them.
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
