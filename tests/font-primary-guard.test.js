/**
 * Foundry declares `--font-primary` only under the ApplicationV1 `.app` root (issue 2312), so no
 * Fabricate window defines it. A `--font-primary` read is admitted only as the literal-ended
 * fallback of a `--font-body` read, `var(--font-body, var(--font-primary, sans-serif))`.
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { fontPrimaryReads, unguardedFontPrimaryReads } from './helpers/fontPrimaryReads.js';
import { literalStrings, walkNodes } from './helpers/moduleAst.js';
import { sourceAstEntriesUnder } from './helpers/parsedSource.js';
import { collectStyleCorpus } from './helpers/styleBlockScan.js';
import { parseComponent } from './helpers/svelteStructureContract.js';

const GUARDED = 'var(--font-body, var(--font-primary, sans-serif))';

/** Every string a component or module spells: literals, markup text and style declarations. */
function textsOf(ast) {
  const texts = literalStrings(ast);
  for (const node of walkNodes(ast)) {
    if (node.type === 'Text') texts.push(node.data);
    if (node.type === 'Declaration') texts.push(node.value);
  }
  return texts.join('\n');
}

/** `{ file, reads, unguarded }` for each stylesheet, style block, markup attribute and script. */
function shippedReads() {
  const styled = Object.entries(collectStyleCorpus());
  const sources = sourceAstEntriesUnder('src').map(([file, ast]) => [file, textsOf(ast)]);
  return [...styled, ...sources]
    .map(([file, text]) => ({
      file,
      reads: fontPrimaryReads(text),
      unguarded: unguardedFontPrimaryReads(text),
    }))
    .filter(({ reads }) => reads.length > 0);
}

const REFUSED = [
  ['bare', 'var(--font-primary)'],
  ['an empty fallback', 'var(--font-primary, )'],
  ['a variable fallback', 'var(--font-primary, var(--x))'],
  ['a variable ending in a literal', 'var(--font-primary, var(--x, serif))'],
  ['a literal fallback with no --font-body read', 'var(--font-primary, sans-serif)'],
  ['a tight literal fallback with no --font-body read', 'var(--font-primary,Arial)'],
  ['a --font-body fallback that is not a literal', 'var(--font-body, var(--font-primary))'],
  ['a quoted literal with no --font-body read', 'var(--font-primary, "A (b)")'],
  ['a CSS-wide keyword', 'var(--font-body, var(--font-primary, inherit))'],
  ['a CSS-wide keyword last', 'var(--font-body, var(--font-primary, serif, UNSET))'],
  ['a template hole', 'var(--font-body, var(--font-primary, ${face}))'],
  ['inner spaces', 'var( --font-primary )'],
  ['a newline after the opener', 'var(\n  --font-primary\n)'],
  ['an upper-case function name', 'VAR(--font-primary)'],
  ['spaces round the comma', 'var( --font-primary , sans-serif )'],
  ['a font shorthand', 'font: 12px/1 var(--font-primary)'],
  ['a family list', 'var(--font-primary), "Signika", sans-serif'],
  ['calc()', 'calc(var(--font-primary))'],
  ['an alias', '--face: var(--font-primary)'],
  ['a multi-line declaration', 'font-family:\n    var(--font-primary);'],
  [
    'a bare literal read beside a guarded one',
    `${GUARDED}; font-family: var(--font-primary, sans-serif)`,
  ],
  [
    'a --font-body read with another fallback',
    'var(--font-body, serif, var(--font-primary, serif))',
  ],
];

const ADMITTED = [
  ['the guarded form', GUARDED],
  ['the guarded form twice in one text', `${GUARDED}; font-family: ${GUARDED}`],
  ['the guarded form, spaced', 'var( --font-body , var( --font-primary , sans-serif ) )'],
  ['the guarded form with a quoted literal', 'var(--font-body, var(--font-primary, "A (b)"))'],
  ['a longer property name', 'var(--font-primary-alt, serif)'],
  ['a definition, which declares the variable', ':root { --font-primary: Arial; }'],
  ['a name that merely ends in var(', 'devar(--font-primary)'],
];

describe('the --font-primary read', () => {
  it('is admitted only as the literal-ended fallback of a --font-body read, in every shipped source', () => {
    const offenders = shippedReads().flatMap(({ file, unguarded }) =>
      unguarded.map((read) => `${file}: ${read}`)
    );
    assert.deepEqual([...new Set(offenders)], []);
  });

  for (const [shape, value] of REFUSED) {
    it(`is refused as ${shape}`, () => {
      assert.equal(unguardedFontPrimaryReads(value).length, 1, value);
    });
  }

  for (const [shape, value] of ADMITTED) {
    it(`is admitted as ${shape}`, () => {
      assert.deepEqual(unguardedFontPrimaryReads(value), [], value);
    });
  }

  it('is refused in a Svelte file’s markup attribute, directive and script', () => {
    const offenders = (source) => unguardedFontPrimaryReads(textsOf(parseComponent(source)));
    assert.equal(offenders('<div style="font-family: var(--font-primary)"></div>').length, 1);
    assert.equal(offenders('<div style:font-family="var(--font-primary)"></div>').length, 1);
    assert.equal(
      offenders('<script>const face = `var(--font-primary)`;</script><div></div>').length,
      1
    );
    assert.equal(offenders('<style>.a { font-family: var(--font-primary); }</style>').length, 1);
    assert.deepEqual(offenders(`<div style="font-family: ${GUARDED}"></div>`), []);
  });

  it('is scanned in a stylesheet, a Svelte file and a JS string', () => {
    const files = shippedReads().map(({ file }) => file);
    assert.deepEqual(
      [
        files.filter((file) => file.endsWith('.css')).length,
        files.filter((file) => file.endsWith('.svelte')).length,
        files.filter((file) => file.endsWith('overlayHost.js')).length,
      ].map((count) => count > 0),
      [true, true, true]
    );
  });
});
