/**
 * The V13 interaction-permission wrap + the Tile hover wrap for canvas
 * interactable TILES.
 *
 * The double-click is NO LONGER delivered through an `_onClickLeft2` wrap — for a
 * non-controllable tile placeable the MouseInteractionManager click-sequence
 * never runs `_onClickLeft2` (hover DOES fire). The double-click is delivered by a
 * raw PIXI pointer listener with our own detection (covered in
 * `interactable-tile-interactivity.test.js`). What remains here:
 *
 *  - the PURE permission decision {@link shouldPermitInteractableAction} (permits
 *    hover on interactable tiles only; never clickLeft2 anymore);
 *  - the install resolving the V13 Tile / MouseInteractionManager classes
 *    defensively and the permission gate permitting/delegating against a fake
 *    MouseInteractionManager;
 *  - the hover wrap installing on the resolved Tile class.
 */

import test from 'node:test';
import assert from 'node:assert/strict';

import { shouldPermitInteractableAction } from '../../src/canvas/interactableDoubleClickWrap.js';
import { InteractableManager } from '../../src/canvas/InteractableManager.js';

// --- pure permission decision -----------------------------------------------

test('shouldPermitInteractableAction permits hover on an interactable tile', () => {
  const yes = () => true;
  assert.equal(shouldPermitInteractableAction('hoverIn', { flags: {} }, yes), true);
  assert.equal(shouldPermitInteractableAction('hoverOut', { flags: {} }, yes), true);
});

test('shouldPermitInteractableAction NO LONGER permits clickLeft2 (delivered by the raw pointer listener)', () => {
  assert.equal(shouldPermitInteractableAction('clickLeft2', { flags: {} }, () => true), null);
});

test('shouldPermitInteractableAction delegates (null) for a non-interactable placeable', () => {
  assert.equal(shouldPermitInteractableAction('hoverIn', { flags: {} }, () => false), null);
});

test('shouldPermitInteractableAction delegates (null) for a non-permitted action even on an interactable tile', () => {
  assert.equal(shouldPermitInteractableAction('clickLeft1', { flags: {} }, () => true), null);
  assert.equal(shouldPermitInteractableAction('dragLeftStart', { flags: {} }, () => true), null);
});

test('shouldPermitInteractableAction delegates (null) when no predicate is supplied (defensive)', () => {
  assert.equal(shouldPermitInteractableAction('hoverIn', { flags: {} }, undefined), null);
});

// --- install + hover/permission wraps against a fake V13 Tile ----------------

const GLOBAL_KEYS = ['foundry', 'CONFIG', 'Tile', 'MouseInteractionManager'];

function snapshot() {
  const saved = {};
  for (const key of GLOBAL_KEYS) saved[key] = globalThis[key];
  return saved;
}
function restore(saved) {
  for (const key of GLOBAL_KEYS) {
    if (saved[key] === undefined) delete globalThis[key];
    else globalThis[key] = saved[key];
  }
}

/**
 * A fake V13 Tile class exposing the wrapped hover handlers. `hoverCalls` records
 * each `_onHoverIn` delegation (with the bound `this`) so we can prove the wrap
 * delegates to the original. `_onClickLeft2` is present so a Tile placeable shape
 * is realistic, but it is NOT wrapped anymore.
 */
function makeFakeTileClass(hoverCalls) {
  return class FakeTile {
    constructor(document) { this.document = document; }
    _onClickLeft2() {}
    _onHoverIn(...args) { hoverCalls.push({ self: this, args }); }
    _onHoverOut() {}
  };
}

function interactableDoc() {
  return { flags: { fabricate: { isInteractable: true, interactableType: 'tool', sourceUuid: 'Fabricate.sysA.tool.tool-1' } } };
}
function plainDoc() {
  return { flags: {} };
}

test('install wraps Tile#_onHoverIn once and shows the tooltip for an interactable tile (idempotent)', () => {
  const saved = snapshot();
  try {
    const hoverCalls = [];
    const FakeTile = makeFakeTileClass(hoverCalls);
    globalThis.foundry = { canvas: { placeables: { Tile: FakeTile } } };

    const tooltips = [];
    const realShow = InteractableManager.instance._showTooltip;
    InteractableManager.instance._showTooltip = (placeable) => tooltips.push(placeable);

    try {
      const manager = new InteractableManager();
      manager.register();
      manager.register(); // idempotent — must not double-wrap.

      const tile = new FakeTile(interactableDoc());
      tile._onHoverIn({ type: 'pointerover' });

      assert.equal(hoverCalls.length, 1, 'the original hover handler is still invoked');
      assert.equal(hoverCalls[0].self, tile, 'with the Tile as `this`');
      assert.equal(tooltips.length, 1, 'an interactable hover shows the tooltip');
      assert.equal(tooltips[0], tile, 'the placeable is routed to the tooltip');
    } finally {
      InteractableManager.instance._showTooltip = realShow;
    }
  } finally {
    restore(saved);
  }
});

test('a non-interactable hover delegates to the original handler without showing a tooltip', () => {
  const saved = snapshot();
  try {
    const hoverCalls = [];
    const FakeTile = makeFakeTileClass(hoverCalls);
    globalThis.foundry = { canvas: { placeables: { Tile: FakeTile } } };

    const tooltips = [];
    const realShow = InteractableManager.instance._showTooltip;
    InteractableManager.instance._showTooltip = (placeable) => tooltips.push(placeable);

    try {
      const manager = new InteractableManager();
      manager.register();

      const tile = new FakeTile(plainDoc());
      tile._onHoverIn({ type: 'pointerover' });

      assert.equal(hoverCalls.length, 1, 'the original hover handler runs for a plain tile');
      assert.equal(tooltips.length, 0, 'no tooltip is shown for a plain tile');
    } finally {
      InteractableManager.instance._showTooltip = realShow;
    }
  } finally {
    restore(saved);
  }
});

test('install resolves the Tile class from CONFIG.Tile.objectClass when foundry.canvas is absent', () => {
  const saved = snapshot();
  try {
    const hoverCalls = [];
    const FakeTile = makeFakeTileClass(hoverCalls);
    globalThis.CONFIG = { Tile: { objectClass: FakeTile } };

    const manager = new InteractableManager();
    manager.register();

    const tile = new FakeTile(plainDoc());
    tile._onHoverIn();
    assert.equal(hoverCalls.length, 1, 'the hover wrap installed on the CONFIG-resolved class and delegates plain tiles');
  } finally {
    restore(saved);
  }
});

test('install prefers the ACTIVE CONFIG.Tile.objectClass subclass over the base foundry placeable class', () => {
  const saved = snapshot();
  try {
    const baseCalls = [];
    const BaseTile = makeFakeTileClass(baseCalls);
    globalThis.foundry = { canvas: { placeables: { Tile: BaseTile } } };

    const subclassCalls = [];
    class SystemTile extends BaseTile {
      constructor(document) { super(document); }
      _onHoverIn(...args) { subclassCalls.push({ self: this, args }); }
    }
    globalThis.CONFIG = { Tile: { objectClass: SystemTile } };

    const manager = new InteractableManager();
    manager.register();

    assert.notEqual(
      SystemTile.prototype._onHoverIn,
      BaseTile.prototype._onHoverIn,
      'the wrap replaced the subclass hover method, not the (untouched) base method'
    );

    const plainTile = new SystemTile(plainDoc());
    plainTile._onHoverIn({ type: 'pointerover' });
    assert.equal(subclassCalls.length, 1, 'a plain tile delegates to the subclass override');
    assert.equal(subclassCalls[0].self, plainTile, 'the subclass override keeps the correct `this`');
  } finally {
    restore(saved);
  }
});

test('install is a no-op (no throw) when no Tile class is available', () => {
  const saved = snapshot();
  try {
    delete globalThis.foundry;
    delete globalThis.CONFIG;
    delete globalThis.Tile;
    delete globalThis.MouseInteractionManager;
    const manager = new InteractableManager();
    assert.doesNotThrow(() => manager.register(), 'register tolerates a missing Tile class');
  } finally {
    restore(saved);
  }
});

// --- the MouseInteractionManager#can permission wrap -------------------------

test('the permission wrap permits hover on an interactable tile and delegates otherwise', () => {
  const saved = snapshot();
  try {
    const FakeTile = makeFakeTileClass([]);
    globalThis.foundry = { canvas: { placeables: { Tile: FakeTile } } };

    const originalCanCalls = [];
    class FakeMouseInteractionManager {
      constructor(object) { this.object = object; }
      can(action, event) { originalCanCalls.push({ action, event, self: this }); return false; }
    }
    globalThis.MouseInteractionManager = FakeMouseInteractionManager;

    const manager = new InteractableManager();
    manager.register();

    // An interactable tile: hoverIn is permitted WITHOUT calling the original.
    const interactiveMgr = new FakeMouseInteractionManager(new FakeTile(interactableDoc()));
    assert.equal(interactiveMgr.can('hoverIn'), true, 'hoverIn is permitted for an interactable tile');
    assert.equal(originalCanCalls.length, 0, 'the original gate is not consulted when we permit');

    // clickLeft2 is NO LONGER permitted here — it delegates to the original.
    assert.equal(interactiveMgr.can('clickLeft2'), false, 'clickLeft2 delegates to the (denying) original');
    assert.equal(originalCanCalls.length, 1, 'the original gate decided clickLeft2');

    // A plain placeable always delegates.
    const plainMgr = new FakeMouseInteractionManager(new FakeTile(plainDoc()));
    assert.equal(plainMgr.can('hoverIn'), false, 'a plain placeable delegates to the original gate');
    assert.equal(originalCanCalls.length, 2);
  } finally {
    restore(saved);
  }
});
