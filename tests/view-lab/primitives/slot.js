/**
 * What a live slot IS: the production window subtree a specimen is painted inside, in the one of
 * its two shapes the catalogue row asked for.
 *
 * ── BOTH SHAPES CARRY THE SAME FOUR ELEMENTS, AND THAT IS NOT NEGOTIABLE ──────────────────────
 *
 * `.application.fabricate.crafting-system-manager > section.window-content > .fabricate-manager`,
 * every time. Each one supplies something a bare root loses, silently, against the harvested
 * chrome — `mount.js` names all four with their line numbers. What the row chooses is not WHICH
 * elements are there but whether they generate BOXES.
 *
 *   DEFAULT (no `slot`)  `display: contents`. The elements are in the DOM and in the inheritance
 *                        chain, but produce no boxes at all, so the component's own root is the
 *                        element the library's layout lays out and a live control stands exactly
 *                        where the drawing it replaced stood. That is what lets 52 Controls
 *                        specimens sit in a dense flex-wrapped stage with no window chrome
 *                        between them and the caption above them.
 *
 *   BOXED (`slot`)       the same subtree, generating real boxes at a size the row declares. This
 *                        is what an overlay or a container query needs, and `page.css` states in
 *                        full why the default cannot be widened to cover them.
 *
 * ── WHY THE BOX IS DECLARED RATHER THAN MEASURED ──────────────────────────────────────────────
 *
 * The tempting alternative is to give every slot a box that shrink-wraps its specimen, so nothing
 * has to be declared and nothing can be declared wrongly. It cannot work, and the reason is the
 * feature itself: `styles/fabricate.css:1439` puts `container-type: inline-size` on
 * `.fabricate-manager`, and an inline-size container is INLINE-SIZE CONTAINED — its own width is
 * computed as if it had no contents. A boxed slot left to size itself from its specimen therefore
 * measures ZERO and takes its `.unit` down with it (measured: the whole unit collapses to the
 * width of its caption). A query container's width has to arrive from outside, always. That is
 * not a lab artifact; it is what makes container queries answerable at all.
 *
 * So a boxed row states the pane it needs, and {@link describeCollapsedSlot} re-reads the box
 * after layout and reports one that did not materialise — because a zero-width query container
 * answers every breakpoint the same way and looks, on the page, like a specimen that simply
 * failed to draw.
 */

/** Marks a slot whose window subtree generates boxes. Read by `page.css`, written only here. */
export const BOXED_CLASS = 'pl-boxed';

/** The declared box, as custom properties `page.css` reads with an `auto` fallback. */
const SIZE_PROPERTIES = Object.freeze({
  width: '--pl-slot-inline-size',
  height: '--pl-slot-block-size',
});

/**
 * Read a row's `slot` declaration.
 *
 * REFUSES an unrecognised key rather than ignoring it, because every way of getting this wrong is
 * silent on the page: `{"heigth": 320}` boxes the slot, leaves its block size `auto`, and the
 * manager's `overflow: clip` then swallows the very overlay the row was written to show. A typo
 * that costs a comparison here costs a reader a rendering-fault hunt otherwise.
 *
 * @param {object} row A catalogue row.
 * @returns {{width?: number, height?: number}|null} The declared box, or null for a default slot.
 * @throws {Error} When `slot` is present but is not a box this page can build.
 */
function readSlotBox(row) {
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
 * Build one live slot: the production window subtree, ready for a specimen.
 *
 * @param {object} row The catalogue row, read for its optional `slot` box.
 * @param {object} chrome The two attribute names the frame carries.
 * @param {string} chrome.liveClass The class the `@scope` limit is keyed on.
 * @param {string} chrome.themeAttribute `FABRICATE_THEME_ATTRIBUTE`.
 * @param {string} chrome.themeId The theme to put in scope on the subtree.
 * @returns {{live: HTMLElement, root: HTMLElement, boxed: boolean}} The slot, the element to mount
 *   into, and whether this one generates boxes.
 * @throws {Error} When the row's `slot` declaration is not a box this page can build.
 */
export function createLiveSlot(row, { liveClass, themeAttribute, themeId }) {
  const box = readSlotBox(row);
  const live = document.createElement('div');
  live.className = box ? `${liveClass} ${BOXED_CLASS}` : liveClass;
  for (const [key, property] of Object.entries(SIZE_PROPERTIES)) {
    if (box?.[key] !== undefined) live.style.setProperty(property, `${box[key]}px`);
  }
  const frame = document.createElement('div');
  frame.className = 'application fabricate crafting-system-manager';
  frame.setAttribute(themeAttribute, themeId);
  const content = document.createElement('section');
  content.className = 'window-content';
  const root = document.createElement('div');
  root.className = 'fabricate-manager';
  content.append(root);
  frame.append(content);
  live.append(frame);
  return { live, root, boxed: Boolean(box) };
}

/**
 * Report a boxed slot whose manager root did not end up with a box.
 *
 * Read AFTER layout, from the element itself, rather than derived from the declaration — the
 * declaration is exactly the thing that can be wrong. An omitted `width` is legitimate and common
 * (the library's own `.unit` carries one, and a stretched slot should inherit it rather than
 * restate it), so the only way to know whether one arrived is to ask the box.
 *
 * @param {object} row The catalogue row, for the message.
 * @param {Element} root The slot's `.fabricate-manager`.
 * @returns {string|null} The failure, or null when the slot has a box.
 */
export function describeCollapsedSlot(row, root) {
  const rect = root.getBoundingClientRect();
  if (rect.width > 0 && rect.height > 0) return null;
  return (
    `${row.spec} / ${row.path}: its boxed slot measured ` +
    `${Math.round(rect.width)}x${Math.round(rect.height)}. ` +
    'A `.fabricate-manager` is an inline-size CONTAINER, so it is sized as if it had no ' +
    "contents and cannot shrink-wrap its specimen: state the missing dimension in the row's " +
    "`slot`, or place the row where the library's own layout supplies it."
  );
}
