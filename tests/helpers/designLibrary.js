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
 * And one stated LIMIT of the anchor, which is not one of the three: a name written as literal
 * markup, `<Whatsit>` rather than `&lt;Whatsit&gt;`, is invisible to every count below. The parser
 * resolves it into an unknown element, so it never reaches `textContent` as text, and the residue
 * check in `tests/design-system-coverage.test.js` cannot report it as an orphan citation. Recorded
 * rather than closed, because the failure announces itself: a citation written that way is invisible
 * to a READER too — it renders as nothing on the page — so it is caught by opening the file. The
 * alternative is scanning raw markup, which cannot tell a citation from an element the page
 * genuinely uses, and all 69 name-shaped tokens in the corpus are written as entities today.
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
 * @typedef {object} DesignLibraryBlock
 * @property {string|null} status the block's `data-status`, or `null` when it carries none
 * @property {string[]} names the primitive names its `h4` yields, in document order
 * @property {Record<string, string|null>} perNameStatus each of those names against its own
 *   `data-status-<Name>`, `null` where the block carries no attribute for it
 */

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
 * @property {DesignLibraryBlock[]} blocks one record per `div.spec`, in document order
 */

/**
 * One `div.spec`'s status record: the block's own declared status and its per-name statuses.
 *
 * THE ATTRIBUTES SIT ON `div.spec`, NOT ON THE `h4`. The heading census pins every heading's
 * `textContent` verbatim, so anything written inside the `h4` reds a pin that is about the
 * vocabulary rather than about statuses. The block element is the nearest ancestor that is not
 * pinned by text, and `blockCount` counts `div.spec-head` rather than `div.spec`, so an attribute
 * here moves no existing count either.
 *
 * A MISSING ATTRIBUTE READS AS `null` RATHER THAN AS A DEFAULT. `tests/design-system-coverage.test.js`
 * fails on an entry that declares no status, and a parser that substituted `'target'` for silence
 * would answer that gate with a value nobody wrote — the shape of unreachable configuration this
 * whole pair of files exists to make visible.
 *
 * THE PER-NAME LOOKUP IS LOWERCASED because HTML attribute names are case-insensitive: the source
 * writes `data-status-Button` so a reader can see which name it governs, and the parser stores it
 * back under `Button` so a consumer never has to know that the DOM folded the case.
 *
 * @param {Element} block a `div.spec`
 * @returns {DesignLibraryBlock}
 */
function readBlock(block) {
  const heading = block.querySelector('div.spec-head > h4');
  const names = heading === null ? [] : primitiveNamesIn(heading.textContent);
  return {
    status: block.getAttribute('data-status'),
    names,
    perNameStatus: Object.fromEntries(
      names.map((name) => [name, block.getAttribute(`data-status-${name.toLowerCase()}`)])
    ),
  };
}

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
  const blocks = [...document.querySelectorAll('div.spec')].map(readBlock);

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
    blocks,
  };
}
