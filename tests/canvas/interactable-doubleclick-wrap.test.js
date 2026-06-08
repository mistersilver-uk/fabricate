/**
 * The V13 Tile `_onClickLeft2` double-click wrap + the interaction-permission
 * wrap for canvas interactable TILES.
 *
 * In Foundry V13 a double-click on a placeable runs `PlaceableObject#_onClickLeft2`
 * (inherited by the Tile class). A Fabricate interactable is a TILE (no actor, no
 * sheet), so we wrap that handler: interactable tiles route to the Fabricate
 * dispatcher and SUPPRESS the default (both GM and player); other placeables
 * delegate to the original. Whether the interaction is even delivered is gated by
 * `MouseInteractionManager#can`, which we also wrap so a non-GM player's
 * double-click / hover is PERMITTED on interactable tiles only.
 *
 * The PURE decisions ({@link decideInteractableDoubleClick} /
 * {@link shouldPermitInteractableAction}) are tested directly. The install +
 * suppress/delegate behaviour is tested against a fake Tile class with a spy
 * `_onClickLeft2`.
 */

import test from 'node:test';
import assert from 'node:assert/strict';

import {
  decideInteractableDoubleClick,
  shouldPermitInteractableAction
} from '../../src/canvas/interactableDoubleClickWrap.js';
import { InteractableManager } from '../../src/canvas/InteractableManager.js';

// --- pure double-click decision ---------------------------------------------

test('decideInteractableDoubleClick → "dispatch" for an interactable tile', () => {
  const decision = decideInteractableDoubleClick({ flags: { fabricate: { isInteractable: true } } }, () => true);
  assert.equal(decision, 'dispatch');
});

test('decideInteractableDoubleClick → "delegate" for a non-interactable tile', () => {
  const decision = decideInteractableDoubleClick({ flags: {} }, () => false);
  assert.equal(decision, 'delegate');
});

test('decideInteractableDoubleClick → "delegate" when no predicate is supplied (defensive)', () => {
  assert.equal(decideInteractableDoubleClick({}, undefined), 'delegate');
});

// --- pure permission decision -----------------------------------------------

test('shouldPermitInteractableAction permits clickLeft2 + hover on an interactable tile', () => {
  const yes = () => true;
  assert.equal(shouldPermitInteractableAction('clickLeft2', { flags: {} }, yes), true);
  assert.equal(shouldPermitInteractableAction('hoverIn', { flags: {} }, yes), true);
  assert.equal(shouldPermitInteractableAction('hoverOut', { flags: {} }, yes), true);
});

test('shouldPermitInteractableAction delegates (null) for a non-interactable placeable', () => {
  assert.equal(shouldPermitInteractableAction('clickLeft2', { flags: {} }, () => false), null);
});

test('shouldPermitInteractableAction delegates (null) for a non-permitted action even on an interactable tile', () => {
  assert.equal(shouldPermitInteractableAction('clickLeft1', { flags: {} }, () => true), null);
  assert.equal(shouldPermitInteractableAction('dragLeftStart', { flags: {} }, () => true), null);
});

test('shouldPermitInteractableAction delegates (null) when no predicate is supplied (defensive)', () => {
  assert.equal(shouldPermitInteractableAction('clickLeft2', { flags: {} }, undefined), null);
});

// --- install + suppress/delegate behaviour against a fake V13 Tile -----------

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
 * A fake V13 Tile class exposing the wrapped methods. `originalCalls` records
 * each `_onClickLeft2` delegation (with the bound `this`) so we can prove
 * suppression. Hover handlers are present so the hover wrap installs cleanly.
 */
function makeFakeTileClass(originalCalls) {
  return class FakeTile {
    constructor(document) { this.document = document; }
    _onClickLeft2(...args) { originalCalls.push({ self: this, args }); }
    _onHoverIn() {}
    _onHoverOut() {}
  };
}

function interactableDoc() {
  return { flags: { fabricate: { isInteractable: true, interactableType: 'tool', sourceUuid: 'Fabricate.sysA.tool.tool-1' } } };
}
function plainDoc() {
  return { flags: {} };
}

test('install wraps Tile#_onClickLeft2 once and routes an interactable double-click to dispatch (original NOT called)', () => {
  const saved = snapshot();
  try {
    const originalCalls = [];
    const FakeTile = makeFakeTileClass(originalCalls);
    globalThis.foundry = { canvas: { placeables: { Tile: FakeTile } } };

    // Capture the manager dispatch.
    const dispatched = [];
    const realOnDoubleClick = InteractableManager.instance._onDoubleClick;
    InteractableManager.instance._onDoubleClick = (doc) => dispatched.push(doc);

    try {
      const manager = new InteractableManager();
      manager.register(); // installs the wrap on FakeTile.prototype
      manager.register(); // idempotent — must not double-wrap.

      const tile = new FakeTile(interactableDoc());
      tile._onClickLeft2({ type: 'dblclick' });

      assert.equal(dispatched.length, 1, 'an interactable double-click dispatches to the Fabricate handler');
      assert.equal(dispatched[0], tile.document, 'the tile document is routed');
      assert.equal(originalCalls.length, 0, 'the V13 default is SUPPRESSED for an interactable tile');
    } finally {
      InteractableManager.instance._onDoubleClick = realOnDoubleClick;
    }
  } finally {
    restore(saved);
  }
});

test('a non-interactable double-click delegates to the original V13 handler with the correct this/args', () => {
  const saved = snapshot();
  try {
    const originalCalls = [];
    const FakeTile = makeFakeTileClass(originalCalls);
    globalThis.foundry = { canvas: { placeables: { Tile: FakeTile } } };

    const dispatched = [];
    const realOnDoubleClick = InteractableManager.instance._onDoubleClick;
    InteractableManager.instance._onDoubleClick = (doc) => dispatched.push(doc);

    try {
      const manager = new InteractableManager();
      manager.register();

      const tile = new FakeTile(plainDoc());
      const event = { type: 'dblclick' };
      tile._onClickLeft2(event);

      assert.equal(dispatched.length, 0, 'a plain tile does not route to the Fabricate dispatcher');
      assert.equal(originalCalls.length, 1, 'the original V13 handler is invoked');
      assert.equal(originalCalls[0].self, tile, 'the original is called with the Tile as `this`');
      assert.deepEqual(originalCalls[0].args, [event], 'the original receives the forwarded event args');
    } finally {
      InteractableManager.instance._onDoubleClick = realOnDoubleClick;
    }
  } finally {
    restore(saved);
  }
});

test('install resolves the Tile class from CONFIG.Tile.objectClass when foundry.canvas is absent', () => {
  const saved = snapshot();
  try {
    const originalCalls = [];
    const FakeTile = makeFakeTileClass(originalCalls);
    globalThis.CONFIG = { Tile: { objectClass: FakeTile } };

    const manager = new InteractableManager();
    manager.register();

    const tile = new FakeTile(plainDoc());
    tile._onClickLeft2();
    assert.equal(originalCalls.length, 1, 'the wrap installed on the CONFIG-resolved class and delegates plain tiles');
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
      _onClickLeft2(...args) { subclassCalls.push({ self: this, args }); }
    }
    globalThis.CONFIG = { Tile: { objectClass: SystemTile } };

    const dispatched = [];
    const realOnDoubleClick = InteractableManager.instance._onDoubleClick;
    InteractableManager.instance._onDoubleClick = (doc) => dispatched.push(doc);

    try {
      const manager = new InteractableManager();
      manager.register();

      assert.notEqual(
        SystemTile.prototype._onClickLeft2,
        BaseTile.prototype._onClickLeft2,
        'the wrap replaced the subclass method, not the (untouched) base method'
      );

      const interactableTile = new SystemTile(interactableDoc());
      interactableTile._onClickLeft2({ type: 'dblclick' });
      assert.equal(dispatched.length, 1, 'the interactable double-click routes to dispatch via the subclass wrap');
      assert.equal(subclassCalls.length, 0, 'the subclass override is SUPPRESSED for an interactable tile');

      const plainTile = new SystemTile(plainDoc());
      plainTile._onClickLeft2({ type: 'dblclick' });
      assert.equal(subclassCalls.length, 1, 'a plain tile delegates to the subclass override');
      assert.equal(subclassCalls[0].self, plainTile, 'the subclass override keeps the correct `this`');

      const baseTile = new BaseTile(interactableDoc());
      baseTile._onClickLeft2({ type: 'dblclick' });
      assert.equal(dispatched.length, 1, 'the base class is untouched (no extra dispatch)');
      assert.equal(baseCalls.length, 1, 'the base method runs unwrapped');
    } finally {
      InteractableManager.instance._onDoubleClick = realOnDoubleClick;
    }
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

test('the permission wrap permits clickLeft2 on an interactable tile and delegates otherwise', () => {
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

    // An interactable tile: clickLeft2 is permitted WITHOUT calling the original.
    const interactiveMgr = new FakeMouseInteractionManager(new FakeTile(interactableDoc()));
    assert.equal(interactiveMgr.can('clickLeft2'), true, 'clickLeft2 is permitted for an interactable tile');
    assert.equal(originalCanCalls.length, 0, 'the original gate is not consulted when we permit');

    // A non-permitted action on an interactable tile delegates to the original.
    assert.equal(interactiveMgr.can('clickLeft1'), false, 'a non-permitted action delegates to the (denying) original');
    assert.equal(originalCanCalls.length, 1, 'the original gate decided the non-permitted action');

    // A plain placeable always delegates.
    const plainMgr = new FakeMouseInteractionManager(new FakeTile(plainDoc()));
    assert.equal(plainMgr.can('clickLeft2'), false, 'a plain placeable delegates to the original gate');
    assert.equal(originalCanCalls.length, 2);
  } finally {
    restore(saved);
  }
});
