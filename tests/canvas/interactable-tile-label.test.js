/**
 * Unit coverage for the canvas-native PIXI hover-LABEL edge.
 *
 * The PURE tooltip-text decision is `interactableTooltipText`
 * (`interactable-tooltip.test.js`). This suite proves the thin PIXI draw edge:
 * a text child is created, positioned above the tile, and added on hover-in;
 * removed on hover-out; idempotent (text updated, not duplicated); and no-throw
 * when the PIXI text class is unavailable. Driven with a FAKE placeable + a fake
 * `globalThis.PIXI.Text` (no live canvas). Real rendering is a test:foundry
 * concern.
 */

import test from 'node:test';
import assert from 'node:assert/strict';

import {
  showInteractableTileLabel,
  hideInteractableTileLabel
} from '../../src/canvas/interactableTileLabel.js';

function withFakePixi(run) {
  const savedPixi = globalThis.PIXI;
  const savedPrecise = globalThis.PreciseText;
  class FakeText {
    constructor(text, style) {
      this.text = text;
      this.style = style;
      this.visible = true;
      this.anchor = { _x: 0, _y: 0, set(x, y) { this._x = x; this._y = y; } };
      this.position = { x: 0, y: 0, set(x, y) { this.x = x; this.y = y; } };
      this.destroyed = false;
    }
    destroy() { this.destroyed = true; }
  }
  class FakeTextStyle {
    constructor(opts) { Object.assign(this, opts); }
  }
  globalThis.PIXI = { Text: FakeText, TextStyle: FakeTextStyle };
  delete globalThis.PreciseText; // exercise the PIXI.Text fallback path.
  try {
    return run(FakeText);
  } finally {
    if (savedPixi === undefined) delete globalThis.PIXI; else globalThis.PIXI = savedPixi;
    if (savedPrecise === undefined) delete globalThis.PreciseText; else globalThis.PreciseText = savedPrecise;
  }
}

function fakeTile() {
  const children = [];
  return {
    document: { width: 200 },
    children,
    addChild(child) { children.push(child); return child; },
    removeChild(child) {
      const i = children.indexOf(child);
      if (i >= 0) children.splice(i, 1);
    }
  };
}

test('shows a PIXI text label above the tile on hover-in', () => {
  withFakePixi(() => {
    const tile = fakeTile();
    const label = showInteractableTileLabel(tile, 'Iron Vein');

    assert.ok(label, 'a label is created');
    assert.equal(label.text, 'Iron Vein');
    assert.equal(tile.children.length, 1, 'the label is added as a child');
    assert.equal(tile.children[0], label);
    // Centered horizontally over the 200-wide tile, floating just above the top.
    assert.equal(label.position.x, 100);
    assert.ok(label.position.y < 0, 'sits above the tile top edge');
    assert.equal(label.anchor._x, 0.5, 'bottom-center anchored');
    assert.equal(label.anchor._y, 1);
  });
});

test('updates the existing label text and does not duplicate on re-hover', () => {
  withFakePixi(() => {
    const tile = fakeTile();
    const first = showInteractableTileLabel(tile, 'Iron Vein');
    const second = showInteractableTileLabel(tile, 'Copper Vein');

    assert.equal(first, second, 'reuses the same label object');
    assert.equal(second.text, 'Copper Vein', 'text is updated in place');
    assert.equal(tile.children.length, 1, 'no duplicate child is added');
  });
});

test('removes the label on hover-out', () => {
  withFakePixi(() => {
    const tile = fakeTile();
    const label = showInteractableTileLabel(tile, 'Iron Vein');
    hideInteractableTileLabel(tile);

    assert.equal(tile.children.length, 0, 'the label child is removed');
    assert.equal(label.destroyed, true, 'the label is destroyed');
  });
});

test('empty text shows nothing (and clears any stale label)', () => {
  withFakePixi(() => {
    const tile = fakeTile();
    showInteractableTileLabel(tile, 'Iron Vein');
    const result = showInteractableTileLabel(tile, '   ');

    assert.equal(result, null, 'no label for empty text');
    assert.equal(tile.children.length, 0, 'the stale label is cleared');
  });
});

test('hover-out is idempotent and no-throw when no label exists', () => {
  const tile = fakeTile();
  assert.doesNotThrow(() => hideInteractableTileLabel(tile));
  assert.doesNotThrow(() => hideInteractableTileLabel(null));
});

test('no-throw and no label when the PIXI text class is unavailable', () => {
  const savedPixi = globalThis.PIXI;
  const savedPrecise = globalThis.PreciseText;
  delete globalThis.PIXI;
  delete globalThis.PreciseText;
  try {
    const tile = fakeTile();
    const result = showInteractableTileLabel(tile, 'Iron Vein');
    assert.equal(result, null);
    assert.equal(tile.children.length, 0);
  } finally {
    if (savedPixi === undefined) delete globalThis.PIXI; else globalThis.PIXI = savedPixi;
    if (savedPrecise === undefined) delete globalThis.PreciseText; else globalThis.PreciseText = savedPrecise;
  }
});

test('prefers the legacy global PreciseText when available', () => {
  const savedPixi = globalThis.PIXI;
  const savedPrecise = globalThis.PreciseText;
  let usedPrecise = false;
  class FakePrecise {
    static getTextStyle(opts) { return { ...opts, _precise: true }; }
    constructor(text) { usedPrecise = true; this.text = text; this.anchor = { set() {} }; this.position = { set() {} }; }
  }
  globalThis.PIXI = { Text: class { constructor() { this.anchor = { set() {} }; this.position = { set() {} }; } } };
  globalThis.PreciseText = FakePrecise;
  try {
    const tile = fakeTile();
    showInteractableTileLabel(tile, 'Iron Vein');
    assert.equal(usedPrecise, true, 'PreciseText is preferred over PIXI.Text');
  } finally {
    if (savedPixi === undefined) delete globalThis.PIXI; else globalThis.PIXI = savedPixi;
    if (savedPrecise === undefined) delete globalThis.PreciseText; else globalThis.PreciseText = savedPrecise;
  }
});

test('prefers the V13-namespaced PreciseText (foundry.canvas.containers) over the legacy global', () => {
  const savedPixi = globalThis.PIXI;
  const savedPrecise = globalThis.PreciseText;
  const savedFoundry = globalThis.foundry;
  let usedNamespaced = false;
  let usedLegacy = false;
  class NamespacedPrecise {
    static getTextStyle(opts) { return { ...opts, _namespaced: true }; }
    constructor(text, style) { usedNamespaced = true; this.text = text; this.style = style; this.anchor = { set() {} }; this.position = { set() {} }; }
  }
  class LegacyPrecise {
    static getTextStyle(opts) { return { ...opts, _legacy: true }; }
    constructor(text, style) { usedLegacy = true; this.text = text; this.style = style; this.anchor = { set() {} }; this.position = { set() {} }; }
  }
  globalThis.PIXI = { Text: class { constructor() { this.anchor = { set() {} }; this.position = { set() {} }; } } };
  // Both present: the V13 namespace must win over the deprecated global.
  globalThis.foundry = { canvas: { containers: { PreciseText: NamespacedPrecise } } };
  globalThis.PreciseText = LegacyPrecise;
  try {
    const tile = fakeTile();
    const label = showInteractableTileLabel(tile, 'Iron Vein');
    assert.equal(usedNamespaced, true, 'the V13-namespaced PreciseText is preferred');
    assert.equal(usedLegacy, false, 'the deprecated global PreciseText is NOT used');
    assert.equal(label.style?._namespaced, true, 'the style also resolves via the namespaced getTextStyle');
  } finally {
    if (savedPixi === undefined) delete globalThis.PIXI; else globalThis.PIXI = savedPixi;
    if (savedPrecise === undefined) delete globalThis.PreciseText; else globalThis.PreciseText = savedPrecise;
    if (savedFoundry === undefined) delete globalThis.foundry; else globalThis.foundry = savedFoundry;
  }
});
