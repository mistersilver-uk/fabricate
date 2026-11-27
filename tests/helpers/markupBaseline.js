/**
 * A caller's rendered markup held against the copy recorded before a primitive gained a prop.
 * Svelte's block anchors, inter-tag whitespace, per-instance ids and the scoped-style hash, which
 * any edit to a style block moves, are not part of what a caller draws, so they are normalized.
 * `WRITE_BASELINE=1` records the file instead of comparing.
 */
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';

export function normalizedMarkup(root) {
  return root.innerHTML
    .replaceAll('<!---->', '')
    .replaceAll(/>\s+</g, '><')
    .replaceAll(/\bsvelte-[a-z0-9]+\b/g, 'svelte-hash')
    .replaceAll(/\bc\d+(?=[-"\s])/g, 'cN');
}

export function assertMatchesBaseline(path, found) {
  if (process.env.WRITE_BASELINE) writeFileSync(path, `${JSON.stringify(found, null, 2)}\n`);
  assert.deepEqual(found, JSON.parse(readFileSync(path, 'utf8')));
}
