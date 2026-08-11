/**
 * The two in-page routines both halves of the harness need, as SOURCE STRINGS.
 *
 * They are strings because they have to cross into `page.evaluate`, where nothing from this
 * module's scope exists. Keeping them here rather than duplicating them in the extractor and
 * the comparator is what makes "the prototype and the subject were measured the same way" a
 * fact rather than a hope.
 */

/**
 * Walk to the nearest ancestor that actually PAINTS a background.
 *
 * Without this, a pane that inherits its surface reports `rgba(0, 0, 0, 0)` on BOTH sides and
 * the comparison passes on any background whatsoever — a vacuous assertion that looks like
 * coverage. Regions opt in with `effectiveBackground: true`.
 */
export const PAINTED_BACKGROUND_SOURCE = `
function paintedBackground(el) {
  let node = el;
  while (node) {
    const bg = getComputedStyle(node).backgroundColor;
    if (bg && bg !== 'rgba(0, 0, 0, 0)' && bg !== 'transparent') return bg;
    node = node.parentElement;
  }
  return 'rgba(0, 0, 0, 0)';
}`;

/**
 * Read one element's declared property set.
 *
 * @param {object} options Region spec.
 * @returns {string} Source for an in-page `readRegion(el, groups, propertyGroups, effective)`.
 */
export const READ_REGION_SOURCE = `
function readRegion(el, groups, propertyGroups, effective) {
  const cs = getComputedStyle(el);
  const props = {};
  for (const group of groups) {
    for (const prop of propertyGroups[group]) {
      props[prop] =
        prop === 'backgroundColor' && effective ? paintedBackground(el) : cs[prop];
    }
  }
  return props;
}`;

/**
 * The DANGER-FAMILY SWEEP, and its generalisation.
 *
 * A per-region list can only ever catch a colour on a region someone thought to NAME. This is
 * the complement: given a set of chrome selectors and a set of forbidden colour substrings, it
 * reports every border, outline and scrollbar on those elements that paints one. In this
 * repository it caught two full-height crimson rules at a pane's edges — Foundry core's
 * scrollbar showing through because nothing had ever selected a token for it — which every
 * named region passed straight over.
 */
export const CHROME_SWEEP_SOURCE = `
function chromeSweep(selectors, forbidden) {
  const found = [];
  for (const selector of selectors) {
    for (const el of document.querySelectorAll(selector)) {
      const cs = getComputedStyle(el);
      for (const side of ['Top', 'Right', 'Bottom', 'Left']) {
        const width = cs['border' + side + 'Width'];
        const color = cs['border' + side + 'Color'];
        if (width !== '0px' && forbidden.some((rgb) => color.includes(rgb))) {
          found.push(selector + ' border-' + side.toLowerCase() + ': ' + width + ' ' + color);
        }
      }
      if (cs.outlineWidth !== '0px' && forbidden.some((rgb) => cs.outlineColor.includes(rgb))) {
        found.push(selector + ' outline: ' + cs.outlineWidth + ' ' + cs.outlineColor);
      }
      if (forbidden.some((rgb) => cs.scrollbarColor.includes(rgb))) {
        found.push(selector + ' scrollbar-color: ' + cs.scrollbarColor);
      }
    }
  }
  return found;
}`;

/** Everything an evaluate block needs, in one string. */
export const IN_PAGE_PRELUDE = [
  PAINTED_BACKGROUND_SOURCE,
  READ_REGION_SOURCE,
  CHROME_SWEEP_SOURCE,
].join('\n');
