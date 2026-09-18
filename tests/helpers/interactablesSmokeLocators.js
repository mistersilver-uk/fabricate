/** The Foundry smoke harness read as the OTHER END of a hand-maintained mirror (issue 1520). */
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';

import { byCodePoint } from './ratchetBaseline.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

/** The Foundry smoke harness, whole. Read once; every consumer reads the same text. */
export const SMOKE_SOURCE = readFileSync(
  resolve(__dirname, '../../scripts/foundry-test-run.mjs'),
  'utf8'
);

/**
 * Read a Svelte root's source by repository-relative path.
 *
 * @param {string} relativePath e.g. `src/ui/svelte/apps/InteractableBrowserRoot.svelte`.
 * @returns {string} The file's text.
 */
export function readRootSource(relativePath) {
  return readFileSync(resolve(__dirname, '../..', relativePath), 'utf8');
}

/**
 * Order two lowercase hook / class tokens, explicitly. A bare `.sort()` compares UTF-16 code units,
 * which is right for these tokens only by accident of their being ASCII - and the accident is one
 * non-ASCII hook away from ending (issue 1520).
 */
export const byTokenName = byCodePoint;

/**
 * Every distinct lowercase token in a source that starts with `prefix`.
 *
 * @param {string} source The text to scan.
 * @param {string} prefix e.g. `data-interactable-manager-`, `fab-im-`.
 * @returns {string[]} Sorted, de-duplicated tokens.
 */
export function prefixedTokensIn(source, prefix) {
  const pattern = new RegExp(`${prefix}[a-z-]*[a-z]`, 'g');
  return [...new Set(source.match(pattern) ?? [])].sort(byTokenName);
}

/**
 * The half of a `.svelte` source that can put a token on an ELEMENT: markup and script, with the
 * scoped `<style>` block and every comment removed (issue 1520).
 *
 * @param {string} rootSource A Svelte root's whole source text.
 * @returns {string} The part of it that can carry an attribute or a class.
 */
export function emittingHalfOf(rootSource) {
  return rootSource
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^[ \t]*\/\/.*$/gm, '')
    .replace(/^<style[^>]*>[\s\S]*?^<\/style>/gm, '');
}

/**
 * Assert every locator string is still written by the root that is supposed to emit it.
 *
 * @param {string[]} params.locators The strings the harness addresses.
 * @param {string} params.rootSource The root's own source text.
 * @param {number} params.floor The smallest count that is not a broken scan.
 * @param {string} params.what A noun phrase for the failure messages.
 * @param {string} params.root A path, for the failure messages.
 */
export function assertLocatorsEmitted({ locators, rootSource, floor, what, root }) {
  assert.ok(
    locators.length >= floor,
    `the smoke locates ${locators.length} ${what}, expected at least ${floor} - ` +
      'a scan that matches nothing would leave every clause below vacuous'
  );
  const emitting = emittingHalfOf(rootSource);
  for (const locator of locators) {
    assert.ok(
      new RegExp(`${locator}(?![a-z-])`).test(emitting),
      `${locator} is still written by ${root} - in its markup or script, not merely somewhere in ` +
        'the file: a scoped style rule or a comment naming it does not put it on an element'
    );
  }
}
