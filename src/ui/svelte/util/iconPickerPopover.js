const DEFAULT_LAYOUT_OPTIONS = Object.freeze({
  minWidth: 260,
  maxWidth: 360,
  gap: 6,
  viewportMargin: 16,
  preferredMaxHeight: 380,
  minUsableHeight: 160
});

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
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

  const availableWidth = Math.max(0, viewportWidth - (viewportMargin * 2));
  if (availableWidth <= 0) return null;

  const minWidth = Math.min(requestedMinWidth, availableWidth);
  const maxWidth = Math.max(minWidth, Math.min(requestedMaxWidth, availableWidth));
  const triggerWidth = Math.max(0, Number(resolvedRect.width) || 0);
  const width = clamp(Math.max(triggerWidth, minWidth), minWidth, maxWidth);

  const triggerRight = Number(resolvedRect.right) || 0;
  const triggerTop = Number(resolvedRect.top) || 0;
  const triggerBottom = Number(resolvedRect.bottom) || 0;

  const left = clamp(
    triggerRight - width,
    viewportMargin,
    Math.max(viewportMargin, viewportWidth - viewportMargin - width)
  );

  const spaceBelow = Math.max(0, viewportHeight - triggerBottom - gap - viewportMargin);
  const spaceAbove = Math.max(0, triggerTop - gap - viewportMargin);
  const placement = spaceBelow < minUsableHeight && spaceAbove > spaceBelow ? 'top' : 'bottom';
  const availableHeight = placement === 'top' ? spaceAbove : spaceBelow;
  const fallbackHeight = Math.max(spaceAbove, spaceBelow);
  const maxHeight = Math.min(
    preferredMaxHeight,
    Math.max(availableHeight, Math.min(minUsableHeight, fallbackHeight))
  );

  if (placement === 'top') {
    return {
      placement,
      left,
      width,
      bottom: Math.max(viewportMargin, viewportHeight - triggerTop + gap),
      maxHeight
    };
  }

  return {
    placement,
    left,
    width,
    top: Math.max(viewportMargin, triggerBottom + gap),
    maxHeight
  };
}
