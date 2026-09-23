// Where a portaled ACTION MENU panel sits, in host coordinates (issue 1477). The panel's box is an
// INPUT the caller measured; the geometry comes back as `right`, not `left`, because with
// `left: auto` the panel still sizes to `max-content` and grows leftwards from the trigger.
// Every value is relative to `host`, which the caller MUST also portal into (`util/overlayHost.js`).

// Clamp `value` into `[min, max]`, tolerating an inverted range by preferring `min`.
function clamp(value, min, max) {
  return Math.max(min, Math.min(value, max));
}

// `null` when anything needed is missing; the caller then leaves the panel unpositioned.
export function computeActionMenuLayout(trigger, panel, host, options = {}) {
  if (!trigger || !panel || !host) return null;
  const hostWidth = Number(host.width) || 0;
  const hostHeight = Number(host.height) || 0;
  if (hostWidth <= 0 || hostHeight <= 0) return null;

  const gap = Number.isFinite(Number(options.gap)) ? Number(options.gap) : 4;
  const margin = Number.isFinite(Number(options.margin)) ? Number(options.margin) : 8;

  const panelWidth = Math.max(0, Number(panel.width) || 0);
  const panelHeight = Math.max(0, Number(panel.height) || 0);

  // Right-aligned: these menus hang off a kebab at the END of a row, so growing right leaves it.
  const alignedRight = hostWidth - (Number(trigger.right) || 0) + (Number(host.left) || 0);
  // Keeping the panel's left edge inside the host is an UPPER bound on `right`. A panel wider than
  // the host drives that bound below `margin`, so the lower bound wins and the menu is pinned to
  // the host's right margin rather than pushed off its left edge — the verbs are read from the left.
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
