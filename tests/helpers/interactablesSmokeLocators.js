/**
 * The Foundry smoke harness read as the OTHER END of a hand-maintained mirror (issue 1520).
 *
 * ── WHY THIS FILE EXISTS ──────────────────────────────────────────────────────────────────
 * Nothing statically tied a locator string in `scripts/foundry-test-run.mjs` to a class or an
 * attribute a Svelte root actually emits, and the smoke CANNOT RUN IN CI. So a conversion that
 * moved one of those hooks off the DOM was invisible to `npm test` and surfaced, weeks later, as
 * a click timeout in a capture run - by which time the change that caused it was several
 * branches back. Bringing three windows onto shared primitives is exactly the change that moves
 * them: a hook that used to be written on the element beside its label now reaches the DOM
 * through a primitive's rest spread, its `triggerData` map or its `dataAttr` prop.
 *
 * `tests/helpers/stepperSourceContract.js` and
 * `tests/components/foundry-manager-rail-hooks.test.js` are the shipped precedent for this
 * shape: read the harness, extract what it addresses, and assert the product still writes it.
 *
 * ── TWO RULES THE MATCHING OBEYS, BOTH LEARNED THE HARD WAY ───────────────────────────────
 * TOKEN-TERMINATED, NOT `includes`. Every hook here is a PREFIX of a longer name one edit away -
 * `data-interactable-node-respawn` of `data-interactable-node-respawn-policy` - so a substring
 * test stays GREEN on a hook that has been renamed rather than kept. Proved by mutation: renaming
 * `data-interactable-node-respawn` to `...-respawn-x` left the substring form passing. The
 * terminator is `(?![a-z-])`.
 *
 * A FLOOR ON THE COUNT. A `for...of` over an empty array asserts nothing and reports success, so
 * a harness rewrite that stopped locating anything - or a regex that stopped matching - would
 * leave every clause built on this vacuous while reading as a healthy guard.
 *
 * ── SCOPED BY PREFIX, NOT POOLED ──────────────────────────────────────────────────────────
 * Each window's hooks are asserted against ITS OWN root rather than against the union of the
 * three. A pooled check would go green on a hook the config panel writes while the manager's own
 * copy of it had been deleted, which is precisely the drift this file is for.
 */
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';

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
 * Every distinct `data-*` attribute name in a source that starts with `prefix`.
 *
 * @param {string} source The text to scan.
 * @param {string} prefix e.g. `data-interactable-manager-`.
 * @returns {string[]} Sorted, de-duplicated attribute names.
 */
export function dataHooksMatching(source, prefix) {
  const pattern = new RegExp(`${prefix}[a-z-]*[a-z]`, 'g');
  return [...new Set(source.match(pattern) ?? [])].sort();
}

/**
 * Every distinct class token in a source that starts with `prefix`.
 *
 * @param {string} source The text to scan.
 * @param {string} prefix e.g. `fab-im-`.
 * @returns {string[]} Sorted, de-duplicated class tokens.
 */
export function classTokensMatching(source, prefix) {
  const pattern = new RegExp(`${prefix}[a-z-]*[a-z]`, 'g');
  return [...new Set(source.match(pattern) ?? [])].sort();
}

/**
 * Assert every locator string is still written by the root that is supposed to emit it.
 *
 * @param {object} params
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
  for (const locator of locators) {
    assert.ok(
      new RegExp(`${locator}(?![a-z-])`).test(rootSource),
      `${locator} is still written by ${root}`
    );
  }
}
