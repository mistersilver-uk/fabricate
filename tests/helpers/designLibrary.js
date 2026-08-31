/**
 * The parser for `openspec/specs/design-system/library.html`.
 *
 * WHY THIS EXISTS
 * ---------------
 * `openspec/specs/design-system/spec.md` says the shared primitive set is the set the library
 * enumerates, and `AGENTS.md` prohibits adding a component under `src/ui/svelte/components/`
 * without recording it there. Both sentences are only enforceable if something can READ the
 * enumeration. Nothing could: `library.html` is a hand-authored HTML page, and the one existing
 * reader (`tests/design-system-primitives.test.js`, "every recorded library name is spelled as
 * library.html spells it") does a whole-file `includes()`, which cannot tell an ENTRY from a
 * CITATION. A manifest row naming a ruled-out primitive passes that guard today.
 *
 * THE ANCHOR, AND THE THREE THINGS IT IS NOT
 * ------------------------------------------
 * A primitive's entry is the `<h4>` of a `div.spec-head`, and its name is written `&lt;Name&gt;`.
 * The anchor is therefore `div.spec-head > h4`, evaluated by a real HTML parser rather than
 * approximated, so that `>` means what CSS means by it. Three near-misses were rejected:
 *
 *   - A FILE-WIDE scan. Section 15 writes nine declined candidates in exactly the same notation,
 *     so a file-wide scan reports the ruled-out register as part of the set — the opposite of what
 *     that section says.
 *   - The `spec-head` DIV rather than its `h4`. `p.why` sits INSIDE that div, and one already
 *     carries the notation: the `<SelectionBar>` entry cites `<TintPicker>` in its `why`. The
 *     divergence is real but it is one accidental citation deep, which is why
 *     `tests/design-library-parser.test.js` proves the scoping against a fixture rather than
 *     trusting the corpus to keep distinguishing the two.
 *   - A new `data-primitive` attribute. Thirty mechanical edits to a hand-authored file, with
 *     nothing able to prove they landed on the right headings, is a new drift surface rather than
 *     a smaller one.
 *
 * DECODED TEXT, NOT RAW MARKUP
 * ----------------------------
 * Every string this module yields is the DECODED text of the element: `&lt;Stepper&gt;` becomes
 * `<Stepper>`, `Depth &amp; interaction` becomes `Depth & interaction`, and
 * `Simple and alchemy &mdash; …` becomes `Simple and alchemy — …`. Consumers that pin heading text
 * therefore pin what a reader sees, not how it happens to be escaped, and re-spelling `&mdash;` as
 * a literal em dash — an encoding change that alters nothing a reader reads — does not red a pin.
 * The corpus mixes all three encodings today (three headings carry entities, four carry a raw
 * U+00B7), so the alternative would pin an inconsistency rather than a fact.
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { Window } from 'happy-dom';

const REPO_ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

/** The visual library, as the capability's own prose names it. */
export const DESIGN_LIBRARY_PATH = path.join(
  REPO_ROOT,
  'openspec/specs/design-system/library.html'
);

/**
 * A primitive name as the library writes it, once entity-decoded: `<Stepper>`, `<IconButton>`.
 *
 * Deliberately narrow. A leading capital and no separators is what every one of the 58 entries and
 * all nine name-shaped ruled-out candidates use, and widening it to accept `<foo>` would sweep in
 * the ordinary HTML element names the page's prose mentions.
 */
const PRIMITIVE_NAME = /<([A-Z][A-Za-z0-9]*)>/g;

/**
 * Every primitive-shaped name in a decoded string, in order, WITH duplicates.
 *
 * Occurrences rather than a set, because the count is what proves no entry names the same
 * primitive twice.
 *
 * @param {string} text decoded text, not markup
 * @returns {string[]} names without their angle brackets
 */
export function primitiveNamesIn(text) {
  return [...text.matchAll(PRIMITIVE_NAME)].map((match) => match[1]);
}

/** @returns {string} the library's source, read as UTF-8 */
export function readDesignLibrary() {
  return readFileSync(DESIGN_LIBRARY_PATH, 'utf8');
}

/** @param {string[]} values @returns {string[]} distinct, in code-point order */
function distinct(values) {
  return [...new Set(values)].sort((left, right) => (left < right ? -1 : Number(left > right)));
}

/**
 * @typedef {object} DesignLibrary
 * @property {number} blockCount every `div.spec-head` on the page
 * @property {number} headingCount every `div.spec-head > h4`; equal to `blockCount` when the
 *   one-heading-per-block relation holds, which is the only reason both are reported
 * @property {string[]} headings decoded `h4` text, in document order
 * @property {string[]} nonPrimitiveHeadings the headings that name no primitive — section prose
 * @property {string[]} names distinct primitive names, in code-point order
 * @property {number} nameOccurrences total names across all headings, duplicates included
 * @property {string[]} fileWideNames distinct primitive-shaped names ANYWHERE on the page
 * @property {string[]} namesOutsideHeadings `fileWideNames` that no heading yields
 */

/**
 * Parse a design-library document.
 *
 * Takes markup rather than reading the file itself, so the fixture test can hand it a document
 * built to isolate one scoping decision. That separation is the point: a parser that could only
 * ever be run against the real corpus can only be checked against whatever the corpus happens to
 * contain today.
 *
 * @param {string} html the library's markup
 * @returns {DesignLibrary}
 */
export function parseDesignLibrary(html) {
  const window = new Window();
  const { document } = window;
  document.write(html);

  const blockCount = document.querySelectorAll('div.spec-head').length;
  const headingElements = [...document.querySelectorAll('div.spec-head > h4')];
  const headings = headingElements.map((heading) => heading.textContent);
  const occurrences = headings.flatMap((heading) => primitiveNamesIn(heading));
  const names = distinct(occurrences);
  const fileWideNames = distinct(primitiveNamesIn(document.documentElement.textContent));

  window.close();

  return {
    blockCount,
    headingCount: headingElements.length,
    headings,
    nonPrimitiveHeadings: headings.filter((heading) => primitiveNamesIn(heading).length === 0),
    names,
    nameOccurrences: occurrences.length,
    fileWideNames,
    namesOutsideHeadings: fileWideNames.filter((name) => !names.includes(name)),
  };
}
