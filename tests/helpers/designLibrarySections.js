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

/**
 * @typedef {object} ShippedApiGroup
 * @property {string} heading The `<h5>` text of the API section.
 * @property {string[]} files The `.svelte` files its SHIPPED line cites as the source of the rows.
 * @property {string[]} names The prop names the rows' leading `<b>` runs claim.
 */

/** A `<b>` run opening an `<li>`, with the `<b>` runs a `·` chains onto it. */
const LEADING_NAMES = /^\s*<b>[^]*?<\/b>(?:\s*(?:·|&middot;)\s*<b>[^]*?<\/b>)*/;

/** Files whose SHIPPED line names a second source the first-`.svelte` rule would miss. */
const EXTRA_SOURCE_FILES = new Map([
  ['BulkSelectionToolbar.svelte', ['BulkEditPanelShell.svelte']],
  ['RuleRow.svelte', ['RuleSentence.svelte']],
]);

/** The source files a SHIPPED hint row reads its props from, or `null` when `row` opens no group. */
function shippedSourceFiles(row) {
  if (!row.classList.contains('k-hint')) return null;
  if (!/SHIPPED/.test(row.querySelector('b')?.textContent)) return null;
  const first = [...row.querySelectorAll('code')]
    .map((code) => code.textContent.trim())
    .find((code) => code.endsWith('.svelte'));
  if (!first) return null;
  const file = first.replace(/^components\//, '');
  return [file, ...(EXTRA_SOURCE_FILES.get(file) ?? [])];
}

/** The prop names a row's LEADING `<b>` run claims; `<b>icon</b>: …` labels a variant, not a prop. */
function rowPropClaims(markup) {
  const run = LEADING_NAMES.exec(markup)?.[0] ?? '';
  if (markup[run.length] === ':') return [];
  return [...run.matchAll(/<b>([^<]*)<\/b>/g)].flatMap((bold) =>
    bold[1].split(/·|&middot;/).map((name) => name.trim())
  );
}

/**
 * Every SHIPPED group of every `<h5>…API</h5>` section. A SHIPPED `<li class="k-hint">` opens a
 * group; the `<li>` rows after it, up to the next SHIPPED line, are its rows. Only each row's
 * LEADING `<b>` run is a prop claim: the other `<b>` tags carry values and phrases.
 *
 * @param {string} html The library's markup.
 * @returns {ShippedApiGroup[]} Groups in document order.
 */
export function readShippedApiGroups(html) {
  const window = new Window();
  const { document } = window;
  document.write(html);
  const groups = [];
  for (const heading of document.querySelectorAll('h5')) {
    const text = heading.textContent.trim();
    if (!/\bAPI$/.test(text)) continue;
    let group = null;
    for (const row of heading.nextElementSibling?.querySelectorAll(':scope > li') ?? []) {
      const files = shippedSourceFiles(row);
      if (files) {
        group = { heading: text, files, names: [], text: '' };
        groups.push(group);
      } else if (group && !row.classList.contains('k-hint')) {
        group.text += ` ${row.textContent}`;
        group.names.push(...rowPropClaims(row.innerHTML));
      }
    }
  }
  window.close();
  return groups;
}
