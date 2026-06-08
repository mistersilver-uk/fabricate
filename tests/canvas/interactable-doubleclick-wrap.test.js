/**
 * Fix 3 — the V13 Token `_onClickLeft2` double-click wrap.
 *
 * In Foundry V13 a double-click on a Token runs `Token#_onClickLeft2`, which opens
 * the backing actor sheet (GM) or no-ops (player). A Fabricate interactable token
 * is backed by a shared actor, so the default leaks that sheet. We wrap the V13
 * handler once: interactable tokens route to the Fabricate dispatcher and SUPPRESS
 * the default (both GM and player); other tokens delegate to the original.
 *
 * The PURE decision ({@link decideInteractableDoubleClick}) is tested directly.
 * The install + suppress/delegate behaviour is tested against a fake Token class
 * with a spy `_onClickLeft2`, asserting interactable ⇒ dispatch + original NOT
 * called, and non-interactable ⇒ original called with the right `this`.
 */

import test from 'node:test';
import assert from 'node:assert/strict';

import { decideInteractableDoubleClick } from '../../src/canvas/interactableDoubleClickWrap.js';
import { InteractableManager } from '../../src/canvas/InteractableManager.js';

// --- pure decision ----------------------------------------------------------

test('decideInteractableDoubleClick → "dispatch" for an interactable token', () => {
  const decision = decideInteractableDoubleClick({ flags: { fabricate: { isInteractable: true } } }, () => true);
  assert.equal(decision, 'dispatch');
});

test('decideInteractableDoubleClick → "delegate" for a non-interactable token', () => {
  const decision = decideInteractableDoubleClick({ flags: {} }, () => false);
  assert.equal(decision, 'delegate');
});

test('decideInteractableDoubleClick → "delegate" when no predicate is supplied (defensive)', () => {
  assert.equal(decideInteractableDoubleClick({}, undefined), 'delegate');
});

// --- install + suppress/delegate behaviour against a fake V13 Token ----------

const GLOBAL_KEYS = ['foundry', 'CONFIG', 'Token'];

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
 * A fake V13 Token class exposing the wrapped method. `originalCalls` records
 * each delegation (with the bound `this`) so we can prove suppression.
 */
function makeFakeTokenClass(originalCalls) {
  return class FakeToken {
    constructor(document) { this.document = document; }
    _onClickLeft2(...args) { originalCalls.push({ self: this, args }); }
  };
}

function interactableDoc() {
  return { flags: { fabricate: { isInteractable: true, interactableType: 'tool', sourceUuid: 'Fabricate.sysA.tool.tool-1' } } };
}
function plainDoc() {
  return { flags: {} };
}

test('install wraps Token#_onClickLeft2 once and routes an interactable double-click to dispatch (original NOT called)', () => {
  const saved = snapshot();
  try {
    const originalCalls = [];
    const FakeToken = makeFakeTokenClass(originalCalls);
    globalThis.foundry = { canvas: { placeables: { Token: FakeToken } } };

    // Capture the manager dispatch.
    const dispatched = [];
    const realOnDoubleClick = InteractableManager.instance._onDoubleClick;
    InteractableManager.instance._onDoubleClick = (doc) => dispatched.push(doc);

    try {
      const manager = new InteractableManager();
      manager.register(); // installs the wrap on FakeToken.prototype
      manager.register(); // idempotent — must not double-wrap.

      const token = new FakeToken(interactableDoc());
      token._onClickLeft2({ type: 'dblclick' });

      assert.equal(dispatched.length, 1, 'an interactable double-click dispatches to the Fabricate handler');
      assert.equal(dispatched[0], token.document, 'the token document is routed');
      assert.equal(originalCalls.length, 0, 'the V13 default is SUPPRESSED (no actor sheet) for an interactable token');
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
    const FakeToken = makeFakeTokenClass(originalCalls);
    globalThis.foundry = { canvas: { placeables: { Token: FakeToken } } };

    const dispatched = [];
    const realOnDoubleClick = InteractableManager.instance._onDoubleClick;
    InteractableManager.instance._onDoubleClick = (doc) => dispatched.push(doc);

    try {
      const manager = new InteractableManager();
      manager.register();

      const token = new FakeToken(plainDoc());
      const event = { type: 'dblclick' };
      token._onClickLeft2(event);

      assert.equal(dispatched.length, 0, 'a plain token does not route to the Fabricate dispatcher');
      assert.equal(originalCalls.length, 1, 'the original V13 handler is invoked');
      assert.equal(originalCalls[0].self, token, 'the original is called with the Token as `this`');
      assert.deepEqual(originalCalls[0].args, [event], 'the original receives the forwarded event args');
    } finally {
      InteractableManager.instance._onDoubleClick = realOnDoubleClick;
    }
  } finally {
    restore(saved);
  }
});

test('install resolves the Token class from CONFIG.Token.objectClass when foundry.canvas is absent', () => {
  const saved = snapshot();
  try {
    const originalCalls = [];
    const FakeToken = makeFakeTokenClass(originalCalls);
    globalThis.CONFIG = { Token: { objectClass: FakeToken } };

    const manager = new InteractableManager();
    manager.register();

    const token = new FakeToken(plainDoc());
    token._onClickLeft2();
    assert.equal(originalCalls.length, 1, 'the wrap installed on the CONFIG-resolved class and delegates plain tokens');
  } finally {
    restore(saved);
  }
});

test('install prefers the ACTIVE CONFIG.Token.objectClass subclass over the base foundry placeable class', () => {
  const saved = snapshot();
  try {
    // The base placeable class (foundry.canvas.placeables.Token) is present...
    const baseCalls = [];
    const BaseToken = makeFakeTokenClass(baseCalls);
    globalThis.foundry = { canvas: { placeables: { Token: BaseToken } } };

    // ...and a game system's ACTIVE Token subclass overrides _onClickLeft2 with
    // its OWN method that does NOT call super (the leak repro). The wrap must
    // bind to THIS most-derived class, not the base, so it can suppress.
    const subclassCalls = [];
    class SystemToken extends BaseToken {
      constructor(document) { super(document); }
      // Own override — would bypass a base-class wrap and leak the actor sheet.
      _onClickLeft2(...args) { subclassCalls.push({ self: this, args }); }
    }
    globalThis.CONFIG = { Token: { objectClass: SystemToken } };

    const dispatched = [];
    const realOnDoubleClick = InteractableManager.instance._onDoubleClick;
    InteractableManager.instance._onDoubleClick = (doc) => dispatched.push(doc);

    try {
      const manager = new InteractableManager();
      manager.register();

      // The subclass's OWN method must be the one intercepted.
      assert.notEqual(
        SystemToken.prototype._onClickLeft2,
        BaseToken.prototype._onClickLeft2,
        'the wrap replaced the subclass method, not the (untouched) base method'
      );

      // An interactable token via the active subclass is dispatched + suppressed
      // even though its own override never calls super.
      const interactableToken = new SystemToken(interactableDoc());
      interactableToken._onClickLeft2({ type: 'dblclick' });
      assert.equal(dispatched.length, 1, 'the interactable double-click routes to dispatch via the subclass wrap');
      assert.equal(subclassCalls.length, 0, 'the subclass override is SUPPRESSED for an interactable token');

      // A plain token via the active subclass delegates to the subclass override.
      const plainToken = new SystemToken(plainDoc());
      plainToken._onClickLeft2({ type: 'dblclick' });
      assert.equal(subclassCalls.length, 1, 'a plain token delegates to the subclass override');
      assert.equal(subclassCalls[0].self, plainToken, 'the subclass override keeps the correct `this`');

      // The base class was never wrapped.
      const baseToken = new BaseToken(interactableDoc());
      baseToken._onClickLeft2({ type: 'dblclick' });
      assert.equal(dispatched.length, 1, 'the base class is untouched (no extra dispatch)');
      assert.equal(baseCalls.length, 1, 'the base method runs unwrapped');
    } finally {
      InteractableManager.instance._onDoubleClick = realOnDoubleClick;
    }
  } finally {
    restore(saved);
  }
});

test('install is a no-op (no throw) when no Token class is available', () => {
  const saved = snapshot();
  try {
    delete globalThis.foundry;
    delete globalThis.CONFIG;
    delete globalThis.Token;
    const manager = new InteractableManager();
    assert.doesNotThrow(() => manager.register(), 'register tolerates a missing Token class');
  } finally {
    restore(saved);
  }
});
