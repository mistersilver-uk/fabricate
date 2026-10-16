/**
 * One specimen's production window subtree, `.application > .window-content > .fabricate-manager`,
 * and the box a row's `slot` declares for it. A default row leaves the subtree at
 * `display: contents`; a boxed row states its size, because `.fabricate-manager` is an inline-size
 * container that measures zero when left to size itself.
 */

/** The declared box, as custom properties `specimenFrame.css` reads. */
const SIZE_PROPERTIES = Object.freeze({
  width: '--pl-slot-inline-size',
  height: '--pl-slot-block-size',
});

/**
 * Read a row's `slot` declaration, refusing an unrecognised key rather than ignoring a typo.
 *
 * @param {object} row A catalogue row.
 * @returns {{width?: number, height?: number}|null} The declared box, or null for a default slot.
 * @throws {Error} When `slot` is present but is not a box this page can build.
 */
export function readSlotBox(row) {
  const declared = row.slot;
  if (declared === undefined) return null;
  if (declared === null || typeof declared !== 'object' || Array.isArray(declared)) {
    throw new TypeError(
      '`slot` must be an object of CSS pixel sizes, e.g. {"width": 300, "height": 320}'
    );
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
 * Read a row's `inset`: the padding of the region the primitive is placed in, for one whose edges
 * bleed into it by design (the bulk panel's dock bleeds by the inspector rail's padding).
 *
 * @param {object} row A catalogue row.
 * @returns {number} The inset in CSS px, or 0 when the row declares none.
 * @throws {Error} When `inset` is not a positive number of CSS pixels, or the row also has a
 *   boxed `slot`, where it would be silently ignored.
 */
export function readSlotInset(row) {
  const { inset } = row;
  if (inset === undefined) return 0;
  if (row.slot !== undefined) {
    throw new Error(
      '`inset` pads the wrapper of a default slot and does nothing in a boxed `slot`: ' +
        'drop one, or size the boxed slot to include the region padding'
    );
  }
  if (typeof inset !== 'number' || !Number.isFinite(inset) || inset <= 0) {
    throw new TypeError('`inset` must be a positive number of CSS pixels');
  }
  return inset;
}

/** The `.application` classes of the shipped window a specimen stands in (row `window`). */
const WINDOW_CLASSES = Object.freeze({
  manager: 'application fabricate crafting-system-manager',
  player: 'application fabricate fabricate-app',
});

/** A row's `window`, `manager` by default; an unknown one is refused. */
export function readSlotWindow(row) {
  const { window: windowName = 'manager' } = row;
  if (!Object.hasOwn(WINDOW_CLASSES, windowName)) {
    throw new Error(
      `\`window\` ${JSON.stringify(windowName)} is not a window a specimen stands in; it takes ` +
        Object.keys(WINDOW_CLASSES).join(' or ')
    );
  }
  return windowName;
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
export function buildSpecimenFrame({ themeAttribute, themeId, windowName = 'manager' }) {
  const frame = document.createElement('div');
  frame.className = WINDOW_CLASSES[windowName];
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
 * Report a boxed slot whose `.application` measured no box after layout.
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
    'A `.fabricate-manager` is an inline-size container, so it is sized as if it had no ' +
    "contents and cannot shrink-wrap its specimen: check the row's `slot` declaration."
  );
}
