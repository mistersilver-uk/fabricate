/**
 * The parser for `openspec/specs/design-system/library.html`. And one stated LIMIT of the anchor,
 * which is not one of the three: a name written as literal markup, `<Whatsit>` rather than
 * `&lt;Whatsit&gt;`, is invisible to every count below.
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

/** A primitive name as the library writes it, once entity-decoded: `<Stepper>`, `<IconButton>`. */
const PRIMITIVE_NAME = /<([A-Z][A-Za-z0-9]*)>/g;

/**
 * Every primitive-shaped name in a decoded string, in order, WITH duplicates.
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
 * @property {string|null} heading its decoded `h4` text, or `null` when it holds no `h4`
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
 * @param {Element} block a `div.spec`
 */
function readBlock(block) {
  const heading = block.querySelector(':scope div.spec-head > h4');
  const names = heading === null ? [] : primitiveNamesIn(heading.textContent);
  return {
    status: block.getAttribute('data-status'),
    heading: heading === null ? null : heading.textContent,
    names,
    perNameStatus: Object.fromEntries(
      names.map((name) => [name, block.getAttribute(`data-status-${name.toLowerCase()}`)])
    ),
  };
}

/**
 * Parse a design-library document.
 *
 * @param {string} html the library's markup
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
