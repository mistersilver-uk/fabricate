/**
 * Canvas-native hover label for an interactable Tile.
 *
 * A Tile has no DOM `.element` and no nameplate, so the prior approach of
 * handing a PIXI object to the DOM `TooltipManager.activate(...)` could not work
 * (it expects an HTMLElement and mis-positions / throws). Instead we render a
 * PIXI text label as a CHILD of the tile placeable — mimicking a Token
 * nameplate — directly on the canvas. This renders for players too (hover is
 * permitted by the interaction wrap) and avoids the DOM-element problem entirely.
 *
 * The text content is the pure {@link interactableTooltipText} (resolved by the
 * caller); this module is the thin PIXI draw edge: create a `PreciseText`/`Text`
 * child, position it above the tile bounds, and add/remove it on hover in/out.
 * Defensive + idempotent: probes for the PIXI text classes and the placeable's
 * `addChild`/`removeChild`; no-throw if the build differs.
 */

/** Property under which the label PIXI object is stashed on the placeable. */
const LABEL_KEY = '_fabricateTileLabel';

/**
 * Resolve a PIXI text constructor from the live build, preferring Foundry's
 * double-resolution `PreciseText` (sharper on the canvas), then a bare
 * `PIXI.Text`.
 *
 * @returns {Function|null}
 */
function resolveTextClass() {
  const candidates = [globalThis.PreciseText, globalThis.PIXI?.Text];
  for (const candidate of candidates) {
    if (typeof candidate === 'function') return candidate;
  }
  return null;
}

/**
 * Build the text style for the label, preferring `PreciseText.getTextStyle()`
 * (the canvas default merged with our overrides) and falling back to a plain
 * `PIXI.TextStyle` / a style-shaped object. Modest, readable-on-map styling:
 * white fill, dark stroke, drop shadow.
 *
 * @returns {object|undefined} A style instance/object, or `undefined` to let the
 *   text class use its own default.
 */
function buildLabelStyle() {
  const overrides = {
    fontSize: 24,
    fill: '#ffffff',
    stroke: '#111111',
    strokeThickness: 4,
    dropShadow: true,
    dropShadowColor: '#000000',
    dropShadowBlur: 2,
    dropShadowDistance: 0,
    align: 'center'
  };
  const PreciseTextClass = globalThis.PreciseText;
  if (typeof PreciseTextClass?.getTextStyle === 'function') {
    try {
      return PreciseTextClass.getTextStyle(overrides);
    } catch (_err) { /* fall through to a plain style. */ }
  }
  const TextStyleClass = globalThis.PIXI?.TextStyle;
  if (typeof TextStyleClass === 'function') {
    try {
      return new TextStyleClass(overrides);
    } catch (_err) { /* fall through. */ }
  }
  return overrides;
}

/**
 * Position the label above the tile, horizontally centered. The placeable's
 * local origin is the tile top-left (document x/y is the container position), so
 * we center over the tile width and sit just above the top edge. Falls back to
 * the origin when no width is resolvable.
 *
 * @param {object} placeable  The Tile placeable.
 * @param {object} label      The PIXI text child.
 * @returns {void}
 */
function positionLabel(placeable, label) {
  const width = Number(
    placeable?.document?.width
    ?? placeable?.bounds?.width
    ?? placeable?.width
    ?? 0
  );
  // Anchor the text at its bottom-center so it floats above the tile edge.
  try {
    if (label.anchor && typeof label.anchor.set === 'function') {
      label.anchor.set(0.5, 1);
    }
  } catch (_err) { /* tolerate missing anchor. */ }
  const centerX = Number.isFinite(width) && width > 0 ? width / 2 : 0;
  try {
    if (label.position && typeof label.position.set === 'function') {
      label.position.set(centerX, -4);
    } else {
      label.x = centerX;
      label.y = -4;
    }
  } catch (_err) { /* tolerate. */ }
}

/**
 * Show a canvas-native hover label with `text` above the interactable tile.
 * Idempotent: an existing label has its text updated and is repositioned rather
 * than re-created. No-op (and removes any stale label) when `text` is empty or
 * the PIXI text class is unavailable.
 *
 * @param {object} placeable  The Tile placeable being hovered.
 * @param {string} text       The label text (already resolved by the caller).
 * @returns {object|null} The label PIXI object, or null when nothing was shown.
 */
export function showInteractableTileLabel(placeable, text) {
  if (!placeable) return null;
  const label = String(text ?? '').trim();
  if (!label) {
    hideInteractableTileLabel(placeable);
    return null;
  }

  const existing = placeable[LABEL_KEY];
  if (existing) {
    try { existing.text = label; } catch (_err) { /* tolerate. */ }
    positionLabel(placeable, existing);
    try { existing.visible = true; } catch (_err) { /* tolerate. */ }
    return existing;
  }

  const TextClass = resolveTextClass();
  if (typeof TextClass !== 'function') return null;
  if (typeof placeable.addChild !== 'function') return null;

  let pixiText;
  try {
    pixiText = new TextClass(label, buildLabelStyle());
  } catch (_err) {
    return null;
  }
  // Float above the tile and never intercept pointer events meant for the tile.
  try { pixiText.eventMode = 'none'; } catch (_err) { /* tolerate. */ }
  try { pixiText.interactive = false; } catch (_err) { /* tolerate. */ }
  try { pixiText.zIndex = 100; } catch (_err) { /* tolerate. */ }
  positionLabel(placeable, pixiText);

  try {
    placeable.addChild(pixiText);
  } catch (_err) {
    return null;
  }
  try { placeable[LABEL_KEY] = pixiText; } catch (_err) { /* tolerate frozen. */ }
  return pixiText;
}

/**
 * Remove the hover label from a tile leaving hover (or being torn down).
 * Idempotent + no-throw.
 *
 * @param {object} placeable
 * @returns {void}
 */
export function hideInteractableTileLabel(placeable) {
  const label = placeable?.[LABEL_KEY];
  if (!label) return;
  try {
    if (typeof placeable.removeChild === 'function') placeable.removeChild(label);
  } catch (_err) { /* tolerate. */ }
  try {
    if (typeof label.destroy === 'function') label.destroy({ children: true });
  } catch (_err) { /* tolerate. */ }
  try { delete placeable[LABEL_KEY]; } catch (_err) { /* tolerate. */ }
}
