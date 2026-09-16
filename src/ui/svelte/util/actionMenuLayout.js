/**
 * Where a portaled ACTION MENU panel sits, in the coordinates of the host it was portaled into
 * (issue 1477).
 *
 * ── WHY NOT `computeIconPickerPopoverLayout` ────────────────────────────────────────────────
 * The picker layout DECIDES THE PANEL'S WIDTH: it clamps `max(triggerWidth, minWidth)` between a
 * caller's min and max and returns that number, which every picker then writes as an inline
 * `width`. A picker wants that, because its panel is a fixed-width list of options that must not
 * jitter as a query filters it.
 *
 * An overflow menu is the opposite shape. Its width is the width of its longest verb — `width:
 * max-content` between a 176px floor and a 260px cap, which is what `.manager-environment-comp-menu`
 * has always been — and the four converted menus offer between two and four verbs of very
 * different lengths. Routing them through the picker layout would have pinned every one of them to
 * the 176px floor, because the trigger is a 34px icon button and `max(34, 176)` is 176. That is a
 * visible narrowing of four shipped menus, dressed up as reuse.
 *
 * So this takes the panel's ALREADY-MEASURED box as an input rather than computing a width. The
 * component renders the panel unpositioned for one frame, measures it, and calls this — which is
 * why the returned geometry is expressed as `right` rather than `left`. A `position: absolute`
 * panel with `right` set and `left: auto` still sizes to `max-content` and still grows leftwards
 * from the trigger's right edge, exactly as `right: 0` inside the old relatively positioned wrapper
 * did. Setting `left` instead would fix the box and defeat `max-content`.
 *
 * ── THE HOST IS THE ORIGIN, ALWAYS ──────────────────────────────────────────────────────────
 * Every value returned is relative to `host`, and the caller MUST portal the panel into the same
 * element it measured as `host`. `src/ui/svelte/util/overlayHost.js` records at length what happens
 * when the coordinate origin and the portal target are allowed to disagree: byte-identical markup,
 * a panel in the wrong place, and nothing in the repository able to see it.
 */

/**
 * @typedef {{left: number, top: number, right: number, bottom: number, width: number,
 *   height: number}} LayoutBox
 */

/** Clamp `value` into `[min, max]`, tolerating an inverted range by preferring `min`. */
function clamp(value, min, max) {
  return Math.max(min, Math.min(value, max));
}

/**
 * The panel's placement, in host coordinates.
 *
 * @param {LayoutBox|null} trigger The trigger button's viewport box.
 * @param {{width: number, height: number}|null} panel The panel's own measured size.
 * @param {LayoutBox|null} host The overlay host's viewport box.
 * @param {object} [options]
 * @param {number} [options.gap] Space between the trigger and the panel. Defaults to 4, which is
 *   the `top: calc(100% + 4px)` the hand-rolled menus used.
 * @param {number} [options.margin] Minimum distance from the host's own edges.
 * @returns {{placement: 'top'|'bottom', right: number, top: number|null, bottom: number|null}|null}
 *   `null` when anything needed is missing, in which case the caller leaves the panel unpositioned
 *   rather than writing a guessed box.
 */
export function computeActionMenuLayout(trigger, panel, host, options = {}) {
  if (!trigger || !panel || !host) return null;
  const hostWidth = Number(host.width) || 0;
  const hostHeight = Number(host.height) || 0;
  if (hostWidth <= 0 || hostHeight <= 0) return null;

  const gap = Number.isFinite(Number(options.gap)) ? Number(options.gap) : 4;
  const margin = Number.isFinite(Number(options.margin)) ? Number(options.margin) : 8;

  const panelWidth = Math.max(0, Number(panel.width) || 0);
  const panelHeight = Math.max(0, Number(panel.height) || 0);

  // Right-aligned to the trigger, which is where these menus have always opened: they hang off a
  // kebab at the END of a row's action cluster, so growing rightwards would push them off the row.
  const alignedRight = hostWidth - (Number(trigger.right) || 0) + (Number(host.left) || 0);
  // The panel's left edge is `hostWidth - right - panelWidth`, so keeping it inside the host is an
  // UPPER bound on `right`. When the panel is wider than the host that bound falls below `margin`
  // and the lower bound wins — an overflowing menu is pinned to the host's right margin rather
  // than being pushed off its left edge, because the verbs are read from the left.
  const right = clamp(alignedRight, margin, Math.max(margin, hostWidth - margin - panelWidth));

  const triggerTop = (Number(trigger.top) || 0) - (Number(host.top) || 0);
  const triggerBottom = (Number(trigger.bottom) || 0) - (Number(host.top) || 0);

  const fitsBelow = triggerBottom + gap + panelHeight <= hostHeight - margin;
  const fitsAbove = triggerTop - gap - panelHeight >= margin;
  const placement = fitsBelow || !fitsAbove ? 'bottom' : 'top';

  if (placement === 'top') {
    return { placement, right, top: null, bottom: Math.max(margin, hostHeight - triggerTop + gap) };
  }
  return { placement, right, top: Math.max(margin, triggerBottom + gap), bottom: null };
}
