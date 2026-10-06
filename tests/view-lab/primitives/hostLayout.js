/**
 * The Primitive Lab parent page's sizing decisions as plain functions over plain facts, so they
 * can be proved without a browser: what the replaced drawing says about its slot (`describeHost`)
 * and which reported sizes a specimen's `<iframe>` accepts (`createSizeGovernor`).
 */

/**
 * The most RESIZE reports one specimen may have applied after MOUNTED. A specimen settles within a
 * few (a late web font, a container query answering, a corrective frame or two); one still changing
 * past this is measuring something that depends on its own iframe's size, such as `100vh`.
 */
export const MAX_APPLIED_RESIZES = 40;

/**
 * What the drawing a row replaces says about its slot: whether it was block-level, so a block
 * specimen fills that slot rather than shrink-wrapping, and how wide the slot is. A drawing its
 * container stretched leaves the width to the page; one sized by its own content keeps its width,
 * because a percentage in a shrink-to-fit container resolves against nothing the drawing set. A
 * host that drew no width (a `display: contents` host has a zero rect) is left to the page.
 *
 * @param {object} facts What the live drawing measured.
 * @param {string} facts.display The drawing's computed `display`.
 * @param {string} facts.maxWidth The drawing's computed `max-width`.
 * @param {number} facts.drawnWidth The drawing's rendered border-box width.
 * @param {number} facts.availableWidth The parent's content-box width.
 * @returns {{fill: boolean, inlineSize: string, maxInlineSize: string, presize: string}} The
 *   slot's inline facts; `presize` is the width the iframe takes before the specimen first lays
 *   out, so its first report is already at its final width, or `''` for none.
 */
export function describeHost({ display, maxWidth, drawnWidth, availableWidth }) {
  const fill = !display.startsWith('inline');
  const drawn = drawnWidth > 0;
  const stretched = !drawn || Math.abs(drawnWidth - availableWidth) < 1;
  const width = drawn ? `${Math.ceil(drawnWidth)}px` : '';
  return {
    fill,
    inlineSize: stretched ? '' : width,
    maxInlineSize: maxWidth,
    // A stretched drawing took the whole column, so the specimen is presized to that column.
    presize: fill && drawn ? width : '',
  };
}

/**
 * Decide, per specimen, which reports to apply. An identical report is a no-op, and the number of
 * applied RESIZEs is capped, so a self-referential height cannot run away.
 *
 * @param {number} [limit] The most RESIZEs to apply.
 * @returns {(report: {width: number, height: number, fill?: boolean}, kind: 'mounted'|'resize')
 *   => 'apply'|'same'|'runaway'} The decision for one report.
 */
export function createSizeGovernor(limit = MAX_APPLIED_RESIZES) {
  let last = null;
  let resizes = 0;
  return (report, kind) => {
    const key = `${report.width}x${report.height}:${report.fill === true}`;
    if (key === last) return 'same';
    if (kind === 'resize') {
      if (resizes >= limit) return 'runaway';
      resizes += 1;
    }
    last = key;
    return 'apply';
  };
}
