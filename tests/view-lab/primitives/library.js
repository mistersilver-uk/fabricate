/**
 * Read `openspec/specs/design-system/library.html` in the browser and hand back its own body and
 * stylesheet, which the Primitive Lab renders as the page (issue 1487). The stylesheet loses its
 * `--fab-*` palette, so `styles/fabricate.css` supplies the shipped tokens and any drift shows.
 * It is fetched through the raw `/@design-library/` mount, never Vite's HTML transform.
 */

const LIBRARY_URL = '/@design-library/library.html';

/** The class the page puts on `<body>`, and the `@scope` root every library rule hangs off. */
export const PAGE_CLASS = 'pl-library';

/** The class on each injected live slot, and the `@scope` limit the library's rules stop at. */
export const LIVE_CLASS = 'pl-live';

/**
 * Fetch the library, and hand back the nodes and the stylesheet that draw it.
 *
 * @returns {Promise<{body: HTMLElement, css: string}>} The library's `<body>`, still owned by the
 *   parsed document (adopt it), and the page stylesheet ready to inject.
 * @throws {Error} When the library cannot be read.
 */
export async function readLibrary() {
  const response = await fetch(LIBRARY_URL);
  if (!response.ok) throw new Error(`could not read the design library (${response.status})`);
  const parsed = new DOMParser().parseFromString(await response.text(), 'text/html');
  return { body: parsed.body, css: pageStyles(parsed) };
}

/**
 * The library's stylesheet, de-palettised and wrapped in `@scope (body.pl-library) to (.pl-live)`
 * so its unlayered kit rules stop at every live slot.
 *
 * @param {Document} parsed The parsed library.
 * @returns {string} CSS text for a single `<style>` element.
 */
export function pageStyles(parsed) {
  const authored = [...parsed.head.querySelectorAll(':scope style')]
    .map((element) => element.textContent ?? '')
    .join('\n');
  const scoped = asScopeRoot(withoutShippedTokens(authored));
  return `@scope (body.${PAGE_CLASS}) to (.${LIVE_CLASS}) {\n${scoped}\n}\n`;
}

/**
 * Drop the `--fab-*` declarations from the library's `:root` block and move the page-local names
 * it keeps (`--page-*`, `--measure`) onto `:scope`, since `:scope :root` would match nothing.
 */
function withoutShippedTokens(css) {
  return css.replace(/:root\{[\s\S]*?\n\}/, (block) =>
    block.replace(/^:root\{/, ':scope{').replaceAll(/--fab-[\w-]+:[^;]*;/g, '')
  );
}

/** Rewrite the library's one `body` rule to `:scope`, which a scoped bare `body` cannot match. */
function asScopeRoot(css) {
  return css.replace(/(^|\})\s*body\s*\{/, '$1\n:scope{');
}

/**
 * Index the rendered library's entries by their decoded `div.spec-head > h4` text — the anchor
 * `tests/helpers/designLibrary.js` and the coverage gate use — since a row addresses the entry.
 *
 * @param {ParentNode} root The rendered library.
 * @returns {Map<string, Element>} Heading text to its `.spec` block, in document order.
 */
export function specBlocks(root) {
  const blocks = new Map();
  for (const heading of root.querySelectorAll(':scope div.spec-head > h4')) {
    const block = heading.closest('.spec');
    if (block) blocks.set(normalize(heading.textContent), block);
  }
  return blocks;
}

/**
 * Index one entry's captioned specimen groups.
 *
 * @param {Element} block A `.spec`.
 * @returns {Map<string, Element>} Caption text to its `.unit`, in document order.
 */
export function unitsOf(block) {
  const units = new Map();
  for (const unit of block.querySelectorAll(':scope .unit')) {
    const caption = unit.querySelector(':scope > .cap');
    if (caption) units.set(normalize(caption.textContent), unit);
  }
  return units;
}

/** Collapse whitespace the way both the library and a catalogue row spell it. */
export function normalize(source) {
  return (source ?? '').replaceAll(/\s+/g, ' ').trim();
}
