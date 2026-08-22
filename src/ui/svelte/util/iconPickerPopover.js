const DEFAULT_LAYOUT_OPTIONS = Object.freeze({
  minWidth: 260,
  maxWidth: 360,
  gap: 6,
  viewportMargin: 16,
  preferredMaxHeight: 380,
  minUsableHeight: 160,
  horizontalAlign: 'right'
});

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}


/**
 * The options list's own max height, floored to a WHOLE number of rows (issue 1280).
 *
 * The popover's `maxHeight` is derived from the viewport, so the space left for the list after
 * the search field and the popover's padding is an arbitrary number of pixels. Left to fill it,
 * the list slices its last row in half at the viewport edge, and the slice sits directly against
 * the popover's bottom padding — which reads as a rendering fault rather than as "more below".
 *
 * Flooring is deliberately silent about the leftover pixels: they stay as popover padding, which
 * is where a reader expects slack. Returning `null` when the caller supplies no measurements is
 * what keeps this back-compatible — a caller that does not measure rows gets the previous
 * behaviour rather than a guessed height.
 *
 * @param {number} maxHeight The popover's own max height.
 * @param {object} options `rowPitch` (row height + the gap between rows) and `chromeHeight`
 *   (everything in the popover that is not the list: its padding, the search field, the gap).
 * @returns {number|null} The list's max height, or `null` when it cannot be derived.
 */
function floorListToWholeRows(maxHeight, options) {
  const rowPitch = Number(options?.rowPitch) || 0;
  const chromeHeight = Number(options?.chromeHeight) || 0;
  if (rowPitch <= 0) return null;

  const available = maxHeight - chromeHeight;
  // A popover too short for even one row still shows one, clipped: refusing to render the list
  // at all would be a worse answer than a cramped one, and the caller cannot open a picker with
  // no options in it.
  const rows = Math.max(1, Math.floor(available / rowPitch));
  // `rows` pitches minus the trailing gap: N rows carry only N-1 gaps between them, so keeping
  // the last gap would reintroduce exactly the sliver this exists to remove.
  const trailingGap = Number(options?.rowGap) || 0;
  return Math.max(0, rows * rowPitch - trailingGap);
}

export function computeIconPickerPopoverLayout(triggerRect, viewport, options = {}) {
  const resolvedRect = triggerRect && typeof triggerRect === 'object' ? triggerRect : null;
  const viewportWidth = Number(viewport?.width) || 0;
  const viewportHeight = Number(viewport?.height) || 0;

  if (!resolvedRect || viewportWidth <= 0 || viewportHeight <= 0) return null;

  const gap = Number(options.gap) || DEFAULT_LAYOUT_OPTIONS.gap;
  const viewportMargin = Number(options.viewportMargin) || DEFAULT_LAYOUT_OPTIONS.viewportMargin;
  const preferredMaxHeight = Number(options.preferredMaxHeight) || DEFAULT_LAYOUT_OPTIONS.preferredMaxHeight;
  const minUsableHeight = Number(options.minUsableHeight) || DEFAULT_LAYOUT_OPTIONS.minUsableHeight;
  const requestedMinWidth = Number(options.minWidth) || DEFAULT_LAYOUT_OPTIONS.minWidth;
  const requestedMaxWidth = Number(options.maxWidth) || DEFAULT_LAYOUT_OPTIONS.maxWidth;
  const horizontalAlign = options.horizontalAlign === 'left' ? 'left' : DEFAULT_LAYOUT_OPTIONS.horizontalAlign;
  const requestedMinLeft = Number.isFinite(Number(options.minLeft))
    ? Number(options.minLeft)
    : viewportMargin;
  const requestedMaxRight = Number.isFinite(Number(options.maxRight))
    ? Number(options.maxRight)
    : viewportWidth - viewportMargin;
  const minLeft = clamp(requestedMinLeft, 0, Math.max(0, viewportWidth - viewportMargin));
  const maxRight = clamp(
    requestedMaxRight,
    minLeft,
    Math.max(minLeft, viewportWidth - viewportMargin)
  );

  const availableWidth = Math.max(0, maxRight - minLeft);
  if (availableWidth <= 0) return null;

  const minWidth = Math.min(requestedMinWidth, availableWidth);
  const maxWidth = Math.max(minWidth, Math.min(requestedMaxWidth, availableWidth));
  const triggerWidth = Math.max(0, Number(resolvedRect.width) || 0);
  const width = clamp(Math.max(triggerWidth, minWidth), minWidth, maxWidth);

  const triggerLeft = Number(resolvedRect.left) || 0;
  const triggerRight = Number(resolvedRect.right) || 0;
  const triggerTop = Number(resolvedRect.top) || 0;
  const triggerBottom = Number(resolvedRect.bottom) || 0;
  const maxLeft = Math.max(minLeft, maxRight - width);
  const preferredLeft = horizontalAlign === 'left'
    ? triggerLeft
    : triggerRight - width;

  const left = clamp(preferredLeft, minLeft, maxLeft);

  const spaceBelow = Math.max(0, viewportHeight - triggerBottom - gap - viewportMargin);
  const spaceAbove = Math.max(0, triggerTop - gap - viewportMargin);
  const placement = spaceBelow < minUsableHeight && spaceAbove > spaceBelow ? 'top' : 'bottom';
  const availableHeight = placement === 'top' ? spaceAbove : spaceBelow;
  const fallbackHeight = Math.max(spaceAbove, spaceBelow);
  const maxHeight = Math.min(
    preferredMaxHeight,
    Math.max(availableHeight, Math.min(minUsableHeight, fallbackHeight))
  );

  const listMaxHeight = floorListToWholeRows(maxHeight, options);

  if (placement === 'top') {
    return {
      placement,
      left,
      width,
      bottom: Math.max(viewportMargin, viewportHeight - triggerTop + gap),
      maxHeight,
      listMaxHeight
    };
  }

  return {
    placement,
    left,
    width,
    top: Math.max(viewportMargin, triggerBottom + gap),
    maxHeight,
    listMaxHeight
  };
}
