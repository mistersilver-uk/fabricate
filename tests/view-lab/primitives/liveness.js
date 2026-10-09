/**
 * How a live specimen stands against its drawing (issue 1487), by its name's per-name status
 * (`spec.md`, "Every entry carries a status"): a `shipped` name replaces the drawing, and a `target`
 * or `divergent` one stands beside it, because the drawing is the authority. A name no row stands
 * up keeps its drawing alone.
 */

export const REPLACE = 'replace';
export const BESIDE = 'beside';
export const DRAWING = 'drawing';

/**
 * The label on a specimen standing beside its drawing: a neutral chip that says "live", not the
 * green `st-shipped`, which would contradict the entry's own `target` status chip.
 */
export const LIVE_LABEL_CLASS = 'st st-prose pl-live-label';
export const LIVE_LABEL_TEXT = 'live';

/** A row's `partial` qualifier; its chip in place, with no label to sit in; a pair given a row. */
export const PARTIAL_CLASS = 'pl-live-partial';
export const PARTIAL_CAPTION_CLASS = 'st st-prose pl-live-caption';
export const ROW_CLASS = 'pl-live-row';

const MODE_BY_STATUS = Object.freeze({ shipped: REPLACE, target: BESIDE, divergent: BESIDE });

/**
 * @param {string|null} status A per-name status.
 * @returns {string|null} The mode a specimen of that name takes, or null for no live status.
 */
export function livenessFor(status) {
  return Object.hasOwn(MODE_BY_STATUS, status) ? MODE_BY_STATUS[status] : null;
}

/**
 * @param {{path: string, library: string|null}[]} manifestRows Both manifest tables.
 * @returns {Map<string, string[]>} Component path to the library names it ships, brackets dropped.
 */
export function libraryNamesByPath(manifestRows) {
  const names = new Map();
  for (const { path, library } of manifestRows) {
    if (library === null) continue;
    names.set(path, [...(names.get(path) ?? []), library.slice(1, -1)]);
  }
  return names;
}

/** The `.spec` attribute holding one name's status; the DOM folds attribute case. */
function statusAttribute(name) {
  return `data-status-${name.toLowerCase()}`;
}

/**
 * Decide one row's liveness. Its name is the library name its `path` ships; the status is read
 * off the row's own entry when that entry names it, otherwise off the entry that does.
 *
 * @param {Element} block The row's own `.spec`.
 * @param {Iterable<Element>} blocks Every `.spec` in the library.
 * @param {string[]} names The library names the row's component ships.
 * @returns {{name: string, mode: string}|{problem: string}} The decision, or why there is none.
 */
export function decideLiveness(block, blocks, names) {
  if (names.length === 0) {
    return { problem: 'its component ships no library name, so no status decides its liveness' };
  }
  const own = names.find((name) => block.hasAttribute(statusAttribute(name)));
  if (own === undefined && names.length > 1) {
    return {
      problem:
        `its component ships ${names.map((name) => `<${name}>`).join(' and ')} and this entry ` +
        'declares a status for none of them, so no one name decides its liveness',
    };
  }
  const name = own ?? names[0];
  const attribute = statusAttribute(name);
  const source = own ? block : [...blocks].find((candidate) => candidate.hasAttribute(attribute));
  const status = source?.getAttribute(attribute) ?? null;
  const mode = livenessFor(status);
  if (mode === null) {
    return {
      problem: `<${name}> declares status ${JSON.stringify(status)}, which has no liveness`,
    };
  }
  return { name, mode };
}

/**
 * Put a specimen where its drawing stood, or, beside, after the kept drawing under a label; a row's
 * `partial` rides in that label, or in place in a caption chip. `spansRow` is `spansTheRow`'s.
 */
export function placeSpecimen(slot, iframe, document, { spansRow = false } = {}) {
  const partial = slot.row?.partial;
  let lead = null;
  if (slot.mode === BESIDE) {
    lead = document.createElement('span');
    lead.className = LIVE_LABEL_CLASS;
    lead.textContent = LIVE_LABEL_TEXT;
  } else if (partial) {
    lead = document.createElement('span');
    lead.className = PARTIAL_CAPTION_CLASS;
  }
  if (lead && partial) {
    const qualifier = document.createElement('span');
    qualifier.className = PARTIAL_CLASS;
    qualifier.textContent = partial;
    lead.append(qualifier);
  }
  if (lead && spansRow) for (const element of [lead, iframe]) element.classList.add(ROW_CLASS);
  const placed = lead ? [lead, iframe] : [iframe];
  if (slot.mode === BESIDE) slot.host.after(...placed);
  else slot.host.replaceWith(...placed);
}
