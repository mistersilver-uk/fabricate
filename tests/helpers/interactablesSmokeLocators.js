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
 * ── THREE RULES THE MATCHING OBEYS, ALL LEARNED THE HARD WAY ──────────────────────────────
 * THE CORPUS IS THE EMITTING HALF, NOT THE FILE. A window's classes appear twice - on the
 * element and as the selector painting it - so a whole-file scan reports a DELETED class
 * attribute as emitted. See {@link emittingHalfOf} for the mutation that proved it.
 *
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
 * Order two lowercase hook / class tokens, explicitly.
 *
 * A bare `.sort()` compares UTF-16 code units, which is right for these tokens only by
 * accident of their being ASCII - and the accident is one non-ASCII hook away from ending.
 * SonarCloud flags the bare form (`javascript:S2871`), so an explicit comparator is required
 * rather than preferred.
 *
 * IT IS `byCodePoint` RATHER THAN A PINNED `localeCompare`, and the correction is this
 * repository's own rule rather than a taste (issue 1520 review). `tests/helpers/ratchetBaseline.js`
 * forbids `localeCompare` for exactly this job - an ordering a suite compares with
 * `assert.deepEqual` - because the result is locale-dependent and "a baseline could sort
 * differently on two machines and produce a diff nobody authored". Pinning the locale argument
 * does NOT close that: the collation still comes from the runner's ICU build, which a CI image
 * upgrade can change under an unchanged locale. The shared comparator is re-exported here rather
 * than wrapped, so this file's callers name one function and there is one implementation.
 *
 * @type {(left: string, right: string) => number}
 */
export const byTokenName = byCodePoint;

/**
 * Every distinct lowercase token in a source that starts with `prefix`.
 *
 * A `data-*` attribute name and a class token are the SAME lexical shape - lowercase letters
 * and hyphens, terminated by a letter - so one scan answers for both, and the prefix the
 * caller passes is what says which is being read. It is a regex FRAGMENT, not a literal, so a
 * caller can scope one family away from a sibling that shares its stem.
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
 * scoped `<style>` block and every comment removed.
 *
 * WHY THE WHOLE FILE IS THE WRONG CORPUS, proved by mutation (issue 1520 review). A window's own
 * class names are written TWICE - once on the element and once as the selector of the scoped rule
 * that paints it - so "the file contains `fab-im-row`" is true while nothing renders it. Deleting
 * ` class="fab-im-row"` and ` class="fab-im-empty"` from the Manage panel's markup, leaving
 * `.fab-im-row {` and `.fab-im-empty {` in its `<style>` block, left this file's own clause and
 * the whole View Lab suite green - while the smoke's `rowCount < 3` throw would fire, its
 * `.fab-im-empty` wait would time out, and both manager capture cases would fail their
 * `expectSelector`, which fails the capture WHOLE and publishes nothing.
 *
 * A RENAME was already caught, and only by a different clause: the residue census in
 * `interactablesWindowContract.js` is an exact `deepEqual`, so a renamed class changes the set. A
 * DELETION does not change it, because the surviving rule keeps the name in the census.
 *
 * Comments go for the same reason one step removed: a docblock that names a class is prose about
 * the element, not the element. Both of this family's windows carry paragraphs naming their own
 * hooks, and one of them is a paragraph explaining that a hook must not be named in prose.
 *
 * `//` is stripped only at the head of a line, so a `https://` inside a string survives.
 *
 * @param {string} rootSource A Svelte root's whole source text.
 * @returns {string} The part of it that can carry an attribute or a class.
 */
export function emittingHalfOf(rootSource) {
  return rootSource
    .replace(/<style[\s\S]*?<\/style>/g, '')
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^[ \t]*\/\/.*$/gm, '');
}

/**
 * Assert every locator string is still written by the root that is supposed to emit it.
 *
 * The scan runs over {@link emittingHalfOf} rather than the whole file, which is what makes the
 * assertion's own sentence true; see that function for the mutation that proved it was not.
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
  const emitting = emittingHalfOf(rootSource);
  for (const locator of locators) {
    assert.ok(
      new RegExp(`${locator}(?![a-z-])`).test(emitting),
      `${locator} is still written by ${root} - in its markup or script, not merely somewhere in ` +
        'the file: a scoped style rule or a comment naming it does not put it on an element'
    );
  }
}
