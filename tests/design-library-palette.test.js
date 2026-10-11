/**
 * Issue 2371 — the design library's palette declares every `--fab-*` token its drawings read, at the
 * shipped `fabricate` theme's value, so the raw page paints what the product paints. Only the page's
 * CSS is read: its `<style>` blocks and `style` attributes, never the prose that names a token.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import test from 'node:test';

import { Window } from 'happy-dom';

import { readDesignLibrary } from './helpers/designLibrary.js';
import {
  declarationsIn,
  rulesIn,
  splitSelectorList,
  stripCssComments,
} from './helpers/styleBlockScan.js';

const SHEET = resolve(import.meta.dirname, '../styles/fabricate.css');
/** The page names its own face stacks, as its `:root` comment says. */
const EXEMPT = new Set(['--fab-font-serif', '--fab-font-mono']);
const PALETTE_ROOTS = new Set([':root', '.fabricate[data-fabricate-theme="fabricate"]']);
const REFERENCE = /var\(\s*(--fab-[\w-]+)\s*\)/gu;

const normalise = (value) => value.replaceAll(/\s+/gu, '').toLowerCase();
const fabTokens = (declarations) =>
  declarations.filter(({ property }) => property.startsWith('--fab-'));

/** The page's CSS: each `<style>` block's comment-free text and each `style` attribute. */
function readPage(html) {
  const window = new Window();
  window.document.write(html);
  const sheets = [...window.document.querySelectorAll('style')].map((style) =>
    stripCssComments(style.textContent)
  );
  const inline = [...window.document.querySelectorAll('[style]')].map((element) =>
    element.getAttribute('style')
  );
  window.close();
  return { sheets, inline, rules: sheets.flatMap((css) => rulesIn(css)) };
}

/** Every token the page declares, in any rule or inline style, and every one it reads bare. */
function tokenUse({ sheets, inline, rules }) {
  const declared = new Set(
    fabTokens([
      ...rules.flatMap((rule) => declarationsIn('', rule.body)),
      ...inline.flatMap((style) => declarationsIn('', style)),
    ]).map(({ property }) => property)
  );
  const referenced = new Set(
    [...sheets, ...inline].flatMap((css) => [...css.matchAll(REFERENCE)].map(([, token]) => token))
  );
  return { declared, referenced, undeclared: [...referenced].filter((t) => !declared.has(t)) };
}

/** A token's value on the rules whose selector list names a palette root, in cascade order. */
function rootValues(rules, roots) {
  const values = new Map();
  for (const rule of rules) {
    const named = splitSelectorList(rule.selector).some((selector) => roots.has(selector));
    if (rule.context !== '' || !named) continue;
    for (const { property, value } of fabTokens(declarationsIn('', rule.body))) {
      values.set(property, value);
    }
  }
  return values;
}

const page = readPage(readDesignLibrary());

test('every token the page reads without a fallback is declared on the page', () => {
  const { declared, referenced, undeclared } = tokenUse(page);
  assert.ok(declared.size > 0, 'the page declares no --fab-* token');
  assert.ok(referenced.size > 0, 'the page reads no --fab-* token');
  assert.deepEqual(undeclared, [], 'the page reads tokens its palette never declares');
});

test('a synthetic undeclared reference fails, while a fallback and prose do not', () => {
  const html = readDesignLibrary().replace(
    '</body>',
    '<p style="color:var(--fab-probe-missing)">var(--fab-probe-prose)</p>' +
      '<p style="color:var(--fab-probe-fallback, red)"></p></body>'
  );
  assert.notEqual(html, readDesignLibrary(), 'the control markup was not injected');
  const { undeclared } = tokenUse(readPage(html));
  assert.ok(undeclared.includes('--fab-probe-missing'));
  assert.ok(!undeclared.includes('--fab-probe-prose'));
  assert.ok(!undeclared.includes('--fab-probe-fallback'));
});

test("every :root token the sheet's palette also declares carries the sheet's value", () => {
  const drawn = rootValues(page.rules, new Set([':root']));
  const shipped = rootValues(rulesIn(stripCssComments(readFileSync(SHEET, 'utf8'))), PALETTE_ROOTS);
  const shared = [...drawn.keys()].filter((token) => shipped.has(token) && !EXEMPT.has(token));
  assert.ok(shared.length > 0, 'the page and the sheet share no palette token');
  const differing = shared
    .filter((token) => normalise(drawn.get(token)) !== normalise(shipped.get(token)))
    .map((token) => `${token}: ${drawn.get(token)} (shipped ${shipped.get(token)})`);
  assert.deepEqual(differing, []);
});
