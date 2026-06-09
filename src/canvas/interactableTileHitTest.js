/**
 * Pure hit-test for canvas Interactable tiles.
 *
 * A Foundry Tile placeable's pointer events are gated by its ancestor
 * tiles-layer container — for a player (and on a non-active control layer) PIXI
 * does not route pointer events down into the tiles layer, so a per-placeable
 * `pointerdown`/`_onClickLeft2` listener never fires. Monk's Active Tiles solves
 * this with a CANVAS-STAGE-level pointer handler that hit-tests tiles itself
 * rather than relying on per-placeable listeners.
 *
 * This module is the PURE half of that approach: given a world-space point and a
 * list of tile-shaped records, decide which interactable tile (if any) the point
 * falls within. The Foundry edge (the `canvas.stage` pointer listener, deriving
 * the scene point, iterating `canvas.tiles.placeables`) lives in
 * `InteractableManager.js`; this decision is unit-testable in isolation.
 *
 * Rotation is intentionally ignored for now: tiles are hit-tested against their
 * axis-aligned `x/y/width/height` bounds. Overlapping interactable tiles resolve
 * to the TOP-MOST (last in iteration order — Foundry draws later placeables on
 * top), matching what a user expects to click.
 */

/**
 * Is `point` inside the axis-aligned rectangle `[x, x+width) × [y, y+height)`?
 * Defensive against non-finite inputs (treated as a miss). The left/top edges are
 * inclusive and the right/bottom edges exclusive so adjacent tiles do not both
 * claim a shared boundary pixel.
 *
 * @param {{x: number, y: number}} point
 * @param {{x: number, y: number, width: number, height: number}} rect
 * @returns {boolean}
 */
function pointInRect(point, rect) {
  const px = Number(point?.x);
  const py = Number(point?.y);
  const rx = Number(rect?.x);
  const ry = Number(rect?.y);
  const rw = Number(rect?.width);
  const rh = Number(rect?.height);
  if (![px, py, rx, ry, rw, rh].every(Number.isFinite)) return false;
  if (rw <= 0 || rh <= 0) return false;
  return px >= rx && px < rx + rw && py >= ry && py < ry + rh;
}

/**
 * Find the top-most interactable tile whose bounds contain `point`.
 *
 * Each `tile` record is shaped `{ document, isInteractable, x, y, width, height }`
 * — `document` is the value returned on a hit (so the caller can dispatch the
 * double-click); `isInteractable` gates whether the tile participates at all; and
 * `x/y/width/height` are the tile's scene-space bounds. `x/y/width/height` fall
 * back to the same fields on `document` when omitted, so a caller may pass the
 * live placeable's `{ document }` directly.
 *
 * Iteration order is assumed to be back-to-front (Foundry's
 * `canvas.tiles.placeables` order), so a later match wins — the returned document
 * is the LAST interactable tile that contains the point.
 *
 * @param {{x: number, y: number}} point  World/scene-space click point.
 * @param {Array<{document?: object, isInteractable?: boolean, x?: number,
 *   y?: number, width?: number, height?: number}>} tiles
 * @returns {object|null} The hit tile's `document` (top-most), or null on a miss.
 */
export function interactableTileAtPoint(point, tiles) {
  if (!point || !Array.isArray(tiles)) return null;
  let hit = null;
  for (const tile of tiles) {
    if (!tile || tile.isInteractable !== true) continue;
    const rect = {
      x: tile.x ?? tile.document?.x,
      y: tile.y ?? tile.document?.y,
      width: tile.width ?? tile.document?.width,
      height: tile.height ?? tile.document?.height
    };
    if (pointInRect(point, rect)) {
      hit = tile.document ?? null;
    }
  }
  return hit;
}
