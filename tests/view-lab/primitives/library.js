/**
 * Read `openspec/specs/design-system/library.html` in the browser, for its structure and its prose.
 *
 * ── WHY THE LAB PARSES THE LIBRARY INSTEAD OF COPYING IT ──────────────────────────────────────
 *
 * The lab needs three things the library already states: which section a primitive belongs to, what
 * that section is called, and the sentence under each entry saying what the primitive is for. The
 * obvious move is to copy all three into the catalogue as fields.
 *
 * They would then be a SECOND copy of normative content, and this project has measured what happens
 * to those. `scripts/lib/designSystemPrimitives.js` records a caller list that was prose for as long
 * as it existed and was wrong in four places the day it was checked, and a claim about the
 * stylesheet that was already false thirteen minutes before the row repeating it merged. Every gate
 * passed on all of them. A blurb copied out of `library.html` is exactly that shape: nothing can
 * tell it has stopped matching, and the lab would go on displaying a description of a primitive that
 * changed.
 *
 * Parsing the file at load time means there is no copy. A section rename, a reworded `p.why`, a
 * primitive moved from Controls to Pickers — all of it reaches the lab on the next page load with
 * no edit here, and none of it can drift because there is nothing to drift from.
 *
 * ── THE ANCHOR IS THE ONE `tests/helpers/designLibrary.js` USES ───────────────────────────────
 *
 * `div.spec-head > h4`, evaluated by a real HTML parser, with names written `&lt;Name&gt;`. That
 * helper's docblock records the three near-misses this deliberately does not repeat: a file-wide
 * scan reports section 15's nine ruled-out candidates as members, the `spec-head` DIV rather than
 * its `h4` picks up the one `p.why` that cites another primitive by name, and a `data-primitive`
 * attribute is thirty mechanical edits to a hand-authored file. Using the same anchor in both
 * readers is the point: the lab and the gate must be looking at the same set, or the gate is
 * checking something the page does not show.
 *
 * ── WHY IT IS FETCHED FROM `/@design-library/` AND NOT FROM ITS REPOSITORY PATH ───────────────
 *
 * Vite applies its HTML transform to any `.html` under the dev root, which injects the client
 * script and rewrites asset URLs. None of that breaks the parse, but it means the lab would be
 * reading a REWRITTEN copy of a spec artifact, and a transform that changes one day would look like
 * the library changing. The `staticMount` in `tests/view-lab/vite.config.js` serves the bytes on
 * disk, the same way the harvested chrome and the raw stylesheet are served, and for the same
 * reason.
 */

const LIBRARY_URL = '/@design-library/library.html';

/** Matches a primitive name as the library writes it. Same shape as `designLibrary.js`. */
const NAME_PATTERN = /<([A-Z][A-Za-z\d]*)>/g;

/**
 * Fetch and index the library.
 *
 * @returns {Promise<{
 *   sections: {id: string, num: string, title: string, lede: string}[],
 *   sectionOf: Map<string, string>,
 *   whyOf: Map<string, string>,
 *   names: string[]
 * }>} The section list in document order, each primitive name's section id, each name's entry
 *   prose, and every name the file enumerates.
 */
export async function readLibrary() {
  const response = await fetch(LIBRARY_URL);
  if (!response.ok) throw new Error(`could not read the design library (${response.status})`);
  const document_ = new DOMParser().parseFromString(await response.text(), 'text/html');

  const sections = [...document_.querySelectorAll(':scope main section[id]')].map((section) => ({
    id: section.id,
    num: text(section.querySelector(':scope .sec-head .num')),
    title: text(section.querySelector(':scope .sec-head h2')),
    lede: text(section.querySelector(':scope > .lede')),
  }));

  const sectionOf = new Map();
  const whyOf = new Map();
  const names = [];
  for (const heading of document_.querySelectorAll(':scope div.spec-head > h4')) {
    const sectionId = heading.closest('section[id]')?.id ?? null;
    const why = text(heading.parentElement.querySelector(':scope p.why'));
    for (const name of namesIn(heading.textContent ?? '')) {
      names.push(name);
      if (sectionId) sectionOf.set(name, sectionId);
      if (why) whyOf.set(name, why);
    }
  }

  return { sections, sectionOf, whyOf, names };
}

/**
 * Every `<Name>` in a string, in order.
 *
 * @param {string} source Decoded text.
 * @returns {string[]} Bare names, angle brackets stripped.
 */
export function namesIn(source) {
  return [...source.matchAll(NAME_PATTERN)].map((match) => match[1]);
}

function text(node) {
  return (node?.textContent ?? '').replaceAll(/\s+/g, ' ').trim();
}
