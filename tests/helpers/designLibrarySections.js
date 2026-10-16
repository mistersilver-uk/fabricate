/**
 * The sections of `openspec/specs/design-system/library.html` (issue 1487), kept apart from
 * `designLibrary.js` so that parser's facts stay as the design-system gates read them.
 */
import { Window } from 'happy-dom';

/**
 * @typedef {object} LibrarySection
 * @property {string} id The `section[id]`.
 * @property {string|null} number Its `.sec-head .num` text, `"08"`, or `null` when it has none.
 * @property {string|null} title Its `.sec-head h2` text, decoded.
 * @property {string[]} ledes Its own `p.lede` texts, whitespace-collapsed; a section may have none.
 */

/**
 * Read every section, and the section each `div.spec-head > h4` sits in.
 *
 * @param {string} html The library's markup.
 * @returns {{sections: LibrarySection[], headingSections: (string|null)[]}} Sections in document
 *   order; `headingSections` is positional against `parseDesignLibrary(html).headings`, `null`
 *   for a heading under no section.
 */
export function readLibrarySections(html) {
  const window = new Window();
  const { document } = window;
  document.write(html);
  const sections = [...document.querySelectorAll('section[id]')].map((section) => ({
    id: section.id,
    number: section.querySelector(':scope > .sec-head .num')?.textContent ?? null,
    title: section.querySelector(':scope > .sec-head h2')?.textContent ?? null,
    ledes: [...section.querySelectorAll(':scope > p.lede')].map((lede) =>
      lede.textContent.replaceAll(/\s+/g, ' ').trim()
    ),
  }));
  // Each heading's own nearest ancestor: a document walk tracking position answers differently.
  const headingSections = [...document.querySelectorAll('div.spec-head > h4')].map(
    (heading) => heading.closest('section[id]')?.id ?? null
  );
  window.close();
  return { sections, headingSections };
}
