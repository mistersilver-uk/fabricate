// Where a `Popover` panel sits, in host coordinates (issue 2861): `anchoredPopover`'s `layout`,
// handed the anchor's and the panel's viewport boxes, the host's box and the panel's own window.
// The panel takes the stated side while its content fits there or that side has the more room,
// else the other, and its height is capped to the side it takes, so a taller panel scrolls inside.

export const POPOVER_PLACEMENTS = Object.freeze([
  'bottom-start',
  'bottom-end',
  'top-start',
  'top-end',
]);

/** The gap between the anchor and the panel, and the inset the panel keeps from its host's edges. */
export const POPOVER_GAP = 6;
export const POPOVER_MARGIN = 8;

/** Below this much room on either side the panel keeps its own height, up to its host's, instead. */
export const POPOVER_MIN_ROOM = 48;

/** `value` when it is one of the placements, else `'bottom-start'`: nothing is coerced. */
export function popoverPlacement(value) {
  return POPOVER_PLACEMENTS.includes(value) ? value : POPOVER_PLACEMENTS[0];
}

const clamp = (value, min, max) => Math.max(min, Math.min(value, max));

/**
 * `{ placement, left, top | bottom, maxHeight }`, or `null` when a box is missing or the host has no
 * size. `options.placement` is the stated placement and `options.contentHeight` the panel's own
 * height uncapped; `start` is the anchor's left edge and `end` its right one.
 */
export function computePopoverLayout(
  anchor,
  panel,
  host,
  _bounds,
  options = {},
  view = globalThis
) {
  if (!anchor || !panel || !host) return null;
  const width = Number(host.width) || Number(view?.innerWidth) || 0;
  const height = Number(host.height) || Number(view?.innerHeight) || 0;
  if (width <= 0 || height <= 0) return null;

  const [side, align] = popoverPlacement(options.placement).split('-');
  const anchorTop = anchor.top - (Number(host.top) || 0);
  const anchorBottom = anchor.bottom - (Number(host.top) || 0);
  const anchorLeft = anchor.left - (Number(host.left) || 0);
  const anchorRight = anchor.right - (Number(host.left) || 0);

  const panelWidth = Math.min(Number(panel.width) || 0, width - 2 * POPOVER_MARGIN);
  const panelHeight = Math.max(Number(options.contentHeight) || 0, Number(panel.height) || 0);
  const room = {
    bottom: height - POPOVER_MARGIN - anchorBottom - POPOVER_GAP,
    top: anchorTop - POPOVER_GAP - POPOVER_MARGIN,
  };
  const other = side === 'top' ? 'bottom' : 'top';
  const placement = panelHeight <= room[side] || room[side] >= room[other] ? side : other;
  // A host with no usable room on either side keeps the panel whole, overlapping the anchor, rather
  // than collapsing it to its edge.
  const cramped = Math.max(room.top, room.bottom) < POPOVER_MIN_ROOM;
  const usable = cramped ? Math.min(panelHeight, height - 2 * POPOVER_MARGIN) : room[placement];
  const maxHeight = Math.floor(clamp(usable, 0, height - 2 * POPOVER_MARGIN));

  const wanted = align === 'end' ? anchorRight - panelWidth : anchorLeft;
  const left = clamp(
    wanted,
    POPOVER_MARGIN,
    Math.max(POPOVER_MARGIN, width - POPOVER_MARGIN - panelWidth)
  );
  const edge = (value) =>
    clamp(value, POPOVER_MARGIN, Math.max(POPOVER_MARGIN, height - POPOVER_MARGIN - maxHeight));

  if (placement === 'top') {
    return { placement, left, bottom: edge(height - anchorTop + POPOVER_GAP), maxHeight };
  }
  return { placement, left, top: edge(anchorBottom + POPOVER_GAP), maxHeight };
}
