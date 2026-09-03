/**
 * Read `openspec/specs/design-system/library.html` in the browser, and hand back the page it
 * already is.
 *
 * ── THE PAGE IS THE LIBRARY, RE-RENDERED ──────────────────────────────────────────────────────
 *
 * Not a page ABOUT the library, and not a page derived from it. The `main`, the `nav.rail`, the
 * prose, every `.spec` block, every `.cap`, both `.notes` columns and every `.delta` are the
 * library's own nodes, adopted into this document unchanged. `inject.js` then empties the
 * hand-drawn specimens the catalogue has a mapping for and mounts the real component in their
 * place. Everything else — including every specimen for a primitive that is not built — renders
 * exactly as authored.
 *
 * That is the whole value proposition, and it is worth stating why the previous shape lost it. A
 * workbench with a rail, a knob panel and a props table is a Storybook: it can show you one
 * primitive at a time, driven, and it cannot show you the thing the library is FOR — every variant
 * of a primitive at once, each captioned with the geometry it is supposed to have, beside the
 * canonical spec and the recorded divergences. Reference material is dense and scannable or it is
 * not reference material.
 *
 * ── AND ITS CSS IS THE LIBRARY'S OWN, MINUS THE PALETTE ───────────────────────────────────────
 *
 * `pageStyles()` returns the library's `<style>` text with the `--fab-*` declarations removed from
 * its `:root` block, so `styles/fabricate.css` supplies them instead. That is deliberate and it is
 * half the point of the exercise: the library hardcodes a copy of the shipped palette, and a copy
 * cannot be checked. Serving the page against the SHIPPED tokens makes any drift between the two
 * visible — the page changes colour — instead of leaving it to a reader diffing two files.
 *
 * The four page-local names in that block are kept, because they are not tokens and never were:
 * `--page-ui-face` is the HOST-OWNED interface face the ui-integration spec deliberately leaves
 * untokenized, `--page-premium` / `--page-premium-soft` are a canonical mark with no shipped token
 * behind it, and `--measure` is a prose measure. The library's own comments say so at each one.
 *
 * ── THE `@scope` WRAPPER IS WHAT KEEPS THE TWO CASCADES APART ─────────────────────────────────
 *
 * The library's kit is written for a page that contains nothing but drawings, so it carries
 * `* { margin: 0; padding: 0 }`, a global `:focus-visible` that restates `border-radius`, and
 * element rules for `a`, `p`, `code` and `h1`–`h5`. All of it is UNLAYERED, and unlayered beats
 * every layer — including `foundry2.css`, which is layered end to end, and `styles/fabricate.css`
 * at `layer(modules)`. Injected as-is, those rules would reach into the mounted specimens and
 * repaint them under a cascade production does not have, which is the one failure this page cannot
 * survive: it would look authoritative and be wrong.
 *
 * `@scope (body.pl-library) to (.pl-live)` is exactly the tool for that. Donut scoping means every
 * library rule applies to the page and stops at the boundary of each live slot, so a specimen is
 * painted by `foundry2.css`, Font Awesome, `styles/fabricate.css` and its own component block and
 * by nothing else — which is what production does. Scoping changes no specificity, and every rule
 * in the block shares one scoping root, so proximity cannot reorder them against each other: the
 * page cascades exactly as the standalone file does.
 *
 * ONE REWRITE IS NEEDED FOR THAT TO HOLD. A scoped selector is implicitly relative to `:scope`, so
 * a bare `body { … }` inside the block would mean `:scope body` and match nothing — silently
 * dropping the page background, ink, face, size and leading. The scoping root IS the body, so that
 * one selector becomes `:scope`.
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

/** The class the page puts on `<body>`, and the `@scope` root every library rule hangs off. */
export const PAGE_CLASS = 'pl-library';

/** The class on each injected live slot, and the `@scope` limit the library's rules stop at. */
export const LIVE_CLASS = 'pl-live';

/** Matches a primitive name as the library writes it. Same shape as `designLibrary.js`. */
const NAME_PATTERN = /<([A-Z][A-Za-z\d]*)>/g;

/**
 * Fetch the library, and hand back the nodes and the stylesheet that draw it.
 *
 * @returns {Promise<{body: HTMLElement, css: string}>} The library's own `<body>`, still owned by
 *   the parsed document (adopt it), and the page stylesheet ready to inject.
 * @throws {Error} When the library cannot be read, because a page with no library is not a
 *   degraded page — it is a blank one, and it must say why rather than render nothing.
 */
export async function readLibrary() {
  const response = await fetch(LIBRARY_URL);
  if (!response.ok) throw new Error(`could not read the design library (${response.status})`);
  const parsed = new DOMParser().parseFromString(await response.text(), 'text/html');
  return { body: parsed.body, css: pageStyles(parsed) };
}

/**
 * The library's own stylesheet, de-palettised and scoped to the page.
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
 * Drop the `--fab-*` declarations from the library's `:root` block, and re-home what is left.
 *
 * TWO EDITS, AND THE SECOND IS NOT OPTIONAL. Removing the palette is the point of the exercise:
 * the same names are READ throughout the kit and every read has to keep resolving — against
 * `styles/fabricate.css` now rather than against the copy, so any drift between the two becomes
 * visible on the page instead of waiting for someone to diff two files.
 *
 * But the block also declares four names that are NOT tokens and never were, and they have to
 * survive: `--page-ui-face` is the HOST-OWNED interface face the ui-integration spec deliberately
 * leaves untokenized, `--page-premium` / `--page-premium-soft` are a canonical mark with no shipped
 * token behind it, and `--measure` is a prose measure. The library's own comments say so at each
 * one.
 *
 * SURVIVING MEANS MOVING. Inside `@scope`, a selector is implicitly relative to `:scope`, so this
 * rule would become `:scope :root` and match nothing at all — `body` is a DESCENDANT of `html`,
 * never an ancestor. That is measured rather than reasoned about, and it is silent: the page
 * rendered with `font-family: var(--page-ui-face)` invalid at computed-value time, falling back to
 * the UA serif, and with `p { max-width: var(--measure) }` a no-op, so every paragraph on a
 * reference page about typography ran the full width of the window. The scoping root IS the body
 * and every element on the page descends from it, so `:scope` is where these four belong.
 *
 * A declaration's value cannot contain a `;` (the library writes colours as `rgb(… / …)` and font
 * stacks as comma lists), so the terminator is unambiguous and this needs no CSS parser.
 *
 * @param {string} css The library's authored CSS.
 * @returns {string} The same CSS with the shipped palette gone and the page-local names re-homed.
 */
function withoutShippedTokens(css) {
  return css.replace(/:root\{[\s\S]*?\n\}/, (block) =>
    block.replace(/^:root\{/, ':scope{').replaceAll(/--fab-[\w-]+:[^;]*;/g, '')
  );
}

/**
 * Rewrite the library's `body` rule to address the scoping root.
 *
 * See the header: inside `@scope`, a bare `body` selector is relative to `:scope` and therefore
 * matches nothing at all. The rule carries the page background, ink, interface face, size and
 * leading, so losing it is not subtle — but it IS silent, which is why this is a rewrite rather
 * than a note.
 *
 * @param {string} css The library's authored CSS.
 * @returns {string} The same CSS with its one `body` rule addressing `:scope`.
 */
function asScopeRoot(css) {
  return css.replace(/(^|\})\s*body\s*\{/, '$1\n:scope{');
}

/**
 * Index the rendered library's entries by the name its heading carries.
 *
 * `div.spec-head > h4`, which is the anchor `tests/helpers/designLibrary.js` uses and the anchor
 * the coverage gate uses. Its docblock records the three near-misses this deliberately does not
 * repeat: a file-wide scan reports section 15's nine ruled-out candidates as members, the
 * `spec-head` DIV rather than its `h4` picks up the one `p.why` that cites another primitive by
 * name, and a `data-primitive` attribute is thirty mechanical edits to a hand-authored file. The
 * lab and the gate must be looking at the same set, or the gate is checking something the page
 * does not show.
 *
 * The KEY is the heading's whole decoded text — `"<Button> <IconButton>"` — rather than one
 * primitive name, because an entry documents the set of names in its heading and a catalogue row
 * has to address the ENTRY.
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

/**
 * Every `<Name>` in a string, in order.
 *
 * @param {string} source Decoded text.
 * @returns {string[]} Bare names, angle brackets stripped.
 */
export function namesIn(source) {
  return [...source.matchAll(NAME_PATTERN)].map((match) => match[1]);
}

/**
 * Collapse whitespace the way both the library's authors and a catalogue row spell it.
 *
 * @param {string|null|undefined} source Raw text content.
 * @returns {string} One-line, trimmed text.
 */
export function normalize(source) {
  return (source ?? '').replaceAll(/\s+/g, ' ').trim();
}
