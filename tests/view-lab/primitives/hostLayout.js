/** The Primitive Lab page's sizing decisions as plain functions, provable without a browser. */

/** The most RESIZEs one specimen may apply; past this its size depends on its own iframe (`100vh`). */
export const MAX_APPLIED_RESIZES = 40;

/**
 * What the replaced drawing says about its slot. A block drawing's specimen fills the slot; a
 * stretched or zero-width (`display: contents`) drawing leaves the width to the page, and one sized
 * by its own content keeps that width.
 *
 * @param {object} facts What the live drawing measured.
 * @param {string} facts.display The drawing's computed `display`.
 * @param {string} facts.maxWidth The drawing's computed `max-width`.
 * @param {number} facts.drawnWidth The drawing's rendered border-box width.
 * @param {number} facts.availableWidth The parent's content-box width.
 * @param {number} [facts.inset] The row's `inset`. A drawing that caps its own width drew the region
 *   the primitive sits in, so its width already holds the inset; one with no cap drew the primitive
 *   alone, so its slot adds the inset on both sides and the padded specimen still fits.
 * @returns {{fill: boolean, inlineSize: string, maxInlineSize: string, presize: string}} The
 *   slot's inline facts; `presize` is the width the iframe takes before the specimen first lays
 *   out, so its first report is already at its final width, or `''` for none.
 */
export function describeHost({ display, maxWidth, drawnWidth, availableWidth, inset = 0 }) {
  const fill = !display.startsWith('inline');
  const drawn = drawnWidth > 0;
  const stretched = !drawn || Math.abs(drawnWidth - availableWidth) < 1;
  const around = maxWidth === 'none' ? 2 * inset : 0;
  const width = drawn ? `${Math.ceil(drawnWidth) + around}px` : '';
  return {
    fill,
    inlineSize: stretched ? '' : width,
    maxInlineSize: maxWidth,
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
