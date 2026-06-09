/**
 * Unit coverage for the PURE canvas-level double-click hit-test
 * `interactableTileAtPoint`.
 *
 * The canvas wiring (resolving the Canvas class, extracting the click point,
 * iterating `canvas.tiles.placeables`) is the thin Foundry edge in
 * `InteractableManager.js` (covered in `interactable-manager.test.js`). This
 * suite proves the decision: a point inside / outside a tile, overlapping tiles
 * resolving to the top-most (last) match, non-interactable tiles ignored, and an
 * empty / malformed list returning null.
 */

import test from 'node:test';
import assert from 'node:assert/strict';

import { interactableTileAtPoint } from '../../src/canvas/interactableTileHitTest.js';

function tile(id, { x, y, width, height, isInteractable = true } = {}) {
  return { document: { id }, isInteractable, x, y, width, height };
}

test('returns the tile whose bounds contain the point', () => {
  const t = tile('a', { x: 100, y: 100, width: 100, height: 100 });
  const hit = interactableTileAtPoint({ x: 150, y: 150 }, [t]);
  assert.equal(hit, t.document);
});

test('returns null when the point is outside every tile', () => {
  const t = tile('a', { x: 100, y: 100, width: 100, height: 100 });
  assert.equal(interactableTileAtPoint({ x: 50, y: 50 }, [t]), null);
  assert.equal(interactableTileAtPoint({ x: 250, y: 250 }, [t]), null);
});

test('treats the left/top edges as inclusive and right/bottom as exclusive', () => {
  const t = tile('a', { x: 0, y: 0, width: 100, height: 100 });
  assert.equal(interactableTileAtPoint({ x: 0, y: 0 }, [t]), t.document, 'top-left corner is a hit');
  assert.equal(interactableTileAtPoint({ x: 100, y: 50 }, [t]), null, 'right edge is exclusive');
  assert.equal(interactableTileAtPoint({ x: 50, y: 100 }, [t]), null, 'bottom edge is exclusive');
});

test('overlapping interactable tiles resolve to the TOP-MOST (last in order)', () => {
  const bottom = tile('bottom', { x: 0, y: 0, width: 200, height: 200 });
  const top = tile('top', { x: 50, y: 50, width: 100, height: 100 });
  // Foundry draws later placeables on top → last match wins where they overlap.
  const hit = interactableTileAtPoint({ x: 100, y: 100 }, [bottom, top]);
  assert.equal(hit, top.document, 'the top-most overlapping tile is chosen');
  // A point only inside the bottom tile still resolves to it.
  assert.equal(interactableTileAtPoint({ x: 10, y: 10 }, [bottom, top]), bottom.document);
});

test('ignores non-interactable tiles even when the point is inside them', () => {
  const plain = tile('plain', { x: 0, y: 0, width: 200, height: 200, isInteractable: false });
  assert.equal(interactableTileAtPoint({ x: 100, y: 100 }, [plain]), null);

  // A plain tile drawn ON TOP of an interactable one does NOT mask the hit.
  const interactable = tile('node', { x: 0, y: 0, width: 200, height: 200, isInteractable: true });
  const plainOnTop = tile('decor', { x: 0, y: 0, width: 200, height: 200, isInteractable: false });
  assert.equal(
    interactableTileAtPoint({ x: 100, y: 100 }, [interactable, plainOnTop]),
    interactable.document,
    'a non-interactable tile on top is skipped, not treated as a blocking hit'
  );
});

test('falls back to the document bounds when x/y/width/height are omitted on the record', () => {
  const record = { document: { id: 'd', x: 100, y: 100, width: 100, height: 100 }, isInteractable: true };
  assert.equal(interactableTileAtPoint({ x: 150, y: 150 }, [record]), record.document);
});

test('returns null for an empty list, a non-array, or a missing point', () => {
  assert.equal(interactableTileAtPoint({ x: 1, y: 1 }, []), null);
  assert.equal(interactableTileAtPoint({ x: 1, y: 1 }, null), null);
  assert.equal(interactableTileAtPoint(null, [tile('a', { x: 0, y: 0, width: 10, height: 10 })]), null);
});

test('ignores tiles with non-finite or non-positive dimensions (no false hit)', () => {
  const zero = tile('z', { x: 0, y: 0, width: 0, height: 0 });
  const nan = tile('n', { x: 0, y: 0, width: NaN, height: 100 });
  assert.equal(interactableTileAtPoint({ x: 0, y: 0 }, [zero, nan]), null);
});
