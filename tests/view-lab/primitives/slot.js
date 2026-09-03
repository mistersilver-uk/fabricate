/**
 * What a live slot IS: the production window subtree one specimen is painted inside, and how big
 * a row asked that subtree to be.
 *
 * ── THIS USED TO BUILD A SUBTREE OF THE SHARED PAGE; NOW IT BUILDS A DOCUMENT'S WHOLE BODY ──────
 *
 * Every live specimen is its own `<iframe>` now (issue 1487), each running `specimen.html` /
 * `specimenMount.js` as an isolated document that carries the full production cascade —
 * `foundry2.css` UNLAYERED, Font Awesome and `styles/fabricate.css` layered, exactly as
 * `index.html` and `primitives.html` load them. The library's own reference page therefore loads
 * NO Foundry stylesheet at all, which is the whole fix: `foundry2.css` can no longer reach the 948
 * elements the library draws by hand, because it is never linked into that document.
 *
 * This module used to build a `display: contents` wrapper that a shared `page.css` scoped with
 * `@scope … to (.pl-live)` so the library's own kit CSS could not reach in. That machinery is
 * GONE, not repurposed — an iframe is a separate document with its own CSSOM, so the library's
 * rules cannot cross into it regardless of any scoping, the same way `foundry2.css` cannot leak
 * out of it. What is left here is only the part that was never about scoping: reading a row's
 * declared `slot` box, and building the four-element window subtree every specimen still needs to
 * be painted correctly against the harvested chrome — see `mount.js`'s docblock for the four
 * specific things a bare root loses without it.
 *
 * ── BOTH SHAPES CARRY THE SAME FOUR ELEMENTS, AND THAT IS STILL NOT NEGOTIABLE ────────────────
 *
 * `.application.fabricate.crafting-system-manager > section.window-content > .fabricate-manager`,
 * every time — now as the entire body of one specimen's own document. What a row chooses is still
 * only whether those elements generate BOXES:
 *
 *   DEFAULT (no `slot`)  `display: contents`, applied by `specimenFrame.css` inside the iframe
 *                        rather than by a page-wide `page.css`. The mounted component's own root
 *                        is what the iframe's body lays out, and — because that root is wrapped in
 *                        `LiveSpecimen.svelte`'s `.pl-specimen`, itself an `inline-block` — the
 *                        DOCUMENT shrink-wraps to exactly the specimen's natural size. `mount.js`
 *                        measures that (see its own docblock) and sizes the `<iframe>` element to
 *                        match, so a live control still stands where the drawing it replaced stood
 *                        with no window chrome around it.
 *
 *   BOXED (`slot`)       the same subtree, generating real boxes at the size the row declares. See
 *                        below for why the box is still declared rather than measured.
 *
 * ── WHY A BOXED SLOT IS STILL DECLARED RATHER THAN MEASURED ───────────────────────────────────
 *
 * `styles/fabricate.css:1439` puts `container-type: inline-size` on `.fabricate-manager`, and an
 * inline-size container is INLINE-SIZE CONTAINED — its own width is computed as if it had no
 * contents. A boxed slot left to size itself from its specimen therefore measures ZERO. That was
 * true when the box lived in a shared page and it is equally true of an iframe's own body: nothing
 * about isolating the document changes what a query container is. So a boxed row still STATES the
 * pane it needs, and every catalogue row that declares one now states BOTH `width` and `height` —
 * an isolated iframe has no surrounding library layout to inherit an omitted dimension from the
 * way a subtree of the shared page once could, so "the `.unit`'s own width" is no longer an
 * available fallback and the row has to say it explicitly instead.
 */

/** The declared box, as custom properties `specimenFrame.css` reads. */
const SIZE_PROPERTIES = Object.freeze({
  width: '--pl-slot-inline-size',
  height: '--pl-slot-block-size',
});

/**
 * Read a row's `slot` declaration.
 *
 * REFUSES an unrecognised key rather than ignoring it, because every way of getting this wrong is
 * silent on the page: `{"heigth": 320}` boxes the slot, leaves its block size unset, and the
 * manager's own `overflow: clip` then swallows the very overlay the row was written to show. A
 * typo that costs a comparison here costs a reader a rendering-fault hunt otherwise.
 *
 * @param {object} row A catalogue row.
 * @returns {{width?: number, height?: number}|null} The declared box, or null for a default slot.
 * @throws {Error} When `slot` is present but is not a box this page can build.
 */
export function readSlotBox(row) {
  const declared = row.slot;
  if (declared === undefined) return null;
  if (declared === null || typeof declared !== 'object' || Array.isArray(declared)) {
    throw new TypeError('`slot` must be an object of CSS pixel sizes, e.g. {"height": 320}');
  }
  const box = {};
  for (const [key, value] of Object.entries(declared)) {
    if (!(key in SIZE_PROPERTIES)) {
      throw new Error(`\`slot\` has no \`${key}\`; it takes \`width\` and \`height\`, in CSS px`);
    }
    if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) {
      throw new TypeError(`\`slot.${key}\` must be a positive number of CSS pixels`);
    }
    box[key] = value;
  }
  return box;
}

/**
 * Build one specimen's window subtree — the whole body of its iframe document.
 *
 * @param {object} chrome The two attribute names the frame carries.
 * @param {string} chrome.themeAttribute `FABRICATE_THEME_ATTRIBUTE`.
 * @param {string} chrome.themeId The theme to put in scope on the subtree.
 * @returns {{frame: HTMLElement, root: HTMLElement}} `frame` is the `.application` element (append
 *   it to `document.body`); `root` is the `.fabricate-manager` to mount the component into.
 */
export function buildSpecimenFrame({ themeAttribute, themeId }) {
  const frame = document.createElement('div');
  frame.className = 'application fabricate crafting-system-manager';
  frame.setAttribute(themeAttribute, themeId);
  const content = document.createElement('section');
  content.className = 'window-content';
  const root = document.createElement('div');
  root.className = 'fabricate-manager';
  content.append(root);
  frame.append(content);
  return { frame, root };
}

/**
 * Apply a declared box to a specimen's `.application`, and mark the document boxed.
 *
 * @param {object} box The result of {@link readSlotBox}, non-null.
 * @param {HTMLElement} frame The `.application` element {@link buildSpecimenFrame} returned.
 */
export function applySlotBox(box, frame) {
  document.body.classList.add('pl-boxed');
  for (const [key, property] of Object.entries(SIZE_PROPERTIES)) {
    if (box[key] !== undefined) frame.style.setProperty(property, `${box[key]}px`);
  }
}

/**
 * Report a boxed slot whose `.application` did not end up with a box.
 *
 * Read AFTER layout, from the element itself, rather than derived from the declaration — the
 * declaration is exactly the thing that can be wrong. Both dimensions are now required on a boxed
 * row (see the module docblock), so a collapse here means the CSS custom property was not applied,
 * not that a dimension was legitimately omitted.
 *
 * @param {object} row The catalogue row, for the message.
 * @param {Element} frame The specimen's `.application`.
 * @returns {string|null} The failure, or null when the slot has a box.
 */
export function describeCollapsedSlot(row, frame) {
  const rect = frame.getBoundingClientRect();
  if (rect.width > 0 && rect.height > 0) return null;
  return (
    `${row.spec} / ${row.path}: its boxed slot measured ` +
    `${Math.round(rect.width)}x${Math.round(rect.height)}. ` +
    'A `.fabricate-manager` is an inline-size CONTAINER, so it is sized as if it had no ' +
    "contents and cannot shrink-wrap its specimen: check the row's `slot` declaration."
  );
}
