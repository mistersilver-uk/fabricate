/**
 * Foundry declares `--font-primary` only under the ApplicationV1 `.app` root (issue 2312), so a
 * read with no literal-ended fallback is invalid at computed-value time in every Fabricate window.
 * A face is stated as `var(--font-body, var(--font-primary, sans-serif))`.
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { fontPrimaryReads, unguardedFontPrimaryReads } from './helpers/fontPrimaryReads.js';
import { literalStrings } from './helpers/moduleAst.js';
import { sourceAstEntriesUnder } from './helpers/parsedSource.js';
import { collectStyleCorpus } from './helpers/styleBlockScan.js';

const GUARDED = 'var(--font-body, var(--font-primary, sans-serif))';

/** `{ file, reads }` for each stylesheet, Svelte style block and JS string literal with a read. */
function shippedReads() {
  const styled = Object.entries(collectStyleCorpus());
  const inline = sourceAstEntriesUnder('src')
    .filter(([file]) => !file.endsWith('.svelte'))
    .map(([file, ast]) => [file, literalStrings(ast).join('\n')]);
  return [...styled, ...inline]
    .map(([file, text]) => ({ file, reads: fontPrimaryReads(text) }))
    .filter(({ reads }) => reads.length > 0);
}

describe('the --font-primary read', () => {
  it('is guarded by a literal-ended fallback in every shipped stylesheet, style block and inline face', () => {
    const offenders = shippedReads().flatMap(({ file, reads }) =>
      reads
        .filter((read) => unguardedFontPrimaryReads(read).length > 0)
        .map((read) => `${file}: ${read}`)
    );
    assert.deepEqual(offenders, []);
  });

  it('is found where it is bare, or where its fallback ends in another variable', () => {
    for (const value of [
      'var(--font-primary)',
      'var(--font-primary, )',
      'var(--font-primary, var(--x))',
      'var(--font-body, var(--font-primary))',
    ]) {
      assert.equal(unguardedFontPrimaryReads(value).length, 1, value);
    }
  });

  it('is admitted where its fallback ends in a literal', () => {
    for (const value of [GUARDED, 'var(--font-primary, sans-serif)', 'var(--font-primary,Arial)']) {
      assert.deepEqual(unguardedFontPrimaryReads(value), [], value);
    }
  });

  it('is not read from a definition, which declares the variable', () => {
    assert.deepEqual(unguardedFontPrimaryReads(':root { --font-primary: Arial; }'), []);
  });

  it('is scanned in a stylesheet, a Svelte style block and a JS string', () => {
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
