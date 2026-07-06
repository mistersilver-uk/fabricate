/**
 * Unit tests for the native roll-dialog detection seam (issue #513):
 * `src/systems/fabricateRoll.js`.
 *
 * Covers:
 *  T1 — the `FabricateRoll` resolver subclass records submit-vs-dismiss, with
 *       `fabricateDismissed` keyed on `fulfillable.size` (NOT `rendered`): a manual
 *       submit and a never-presented digital roll both report NOT dismissed; only a
 *       presented-then-not-submitted dialog reports dismissed.
 *  Bug 2 — `FabricateRoll#toJSON` re-labels the serialized `class` as the registered
 *       default implementation's name so a posted message round-trips through
 *       `Roll.fromData` (it is deliberately never in `CONFIG.Dice.rolls`).
 *  T6 — a serialization round-trip driven through `evaluateCheckRoll`'s interactive
 *       path: the instance handed to `toMessage` serializes with a REGISTERED class
 *       name and deserializes without an "Unable to recreate" throw.
 */
import test from 'node:test';
import assert from 'node:assert/strict';

import { buildFabricateRollClass, NATIVE_ROLL_DIALOG_DISMISSED } from '../src/systems/fabricateRoll.js';
import { evaluateCheckRoll } from '../src/systems/checkRoll.js';

// ---------------------------------------------------------------------------
// Shared stub helpers (kept in one place to stay under the Sonar new-code
// duplication threshold across the resolver-state cases).
// ---------------------------------------------------------------------------

/**
 * A minimal Base `RollResolver` the stubbed `globalThis.Roll` hands back from its
 * static `resolverImplementation` getter. Exposes `_onSubmitForm` (which the
 * subclass overrides + `super`-calls) and a settable `fulfillable` set so a test can
 * construct any of the three resolver states directly.
 */
class BaseResolver {
  submitFormCalls = 0;
  constructor(fulfillable = new Set()) {
    this.fulfillable = fulfillable;
  }
  async _onSubmitForm() {
    this.submitFormCalls += 1;
    return { submitted: true };
  }
}

/** Install a `globalThis.Roll` stub exposing `static resolverImplementation`. */
function installRollStub() {
  globalThis.Roll = class StubRoll {
    static get resolverImplementation() {
      return BaseResolver;
    }
  };
}

function clearRollStub() {
  delete globalThis.Roll;
  delete globalThis.CONFIG;
}

/** Build a `FabricateRoll` resolver instance in the given `fulfillable` state. */
function makeResolver(fulfillableIds = []) {
  const FabricateRoll = buildFabricateRollClass();
  const ResolverClass = FabricateRoll.resolverImplementation;
  return new ResolverClass(new Set(fulfillableIds));
}

// ---------------------------------------------------------------------------
// T1 — three resolver states
// ---------------------------------------------------------------------------

test('T1: a submitted manual-fulfilment resolver is NOT dismissed', async () => {
  installRollStub();
  try {
    const resolver = makeResolver(['d20']); // presented (a fulfillable term)…
    await resolver._onSubmitForm({}, {}); // …then submitted
    assert.equal(resolver.fabricateSubmitted, true, '_onSubmitForm sets fabricateSubmitted');
    assert.equal(resolver.submitFormCalls, 1, 'super._onSubmitForm was invoked');
    assert.equal(resolver.fabricateDismissed, false, 'a submit is not a dismissal');
  } finally {
    clearRollStub();
  }
});

test('T1: a presented-but-not-submitted resolver IS dismissed', () => {
  installRollStub();
  try {
    const resolver = makeResolver(['d20']); // presented, never submitted
    assert.equal(resolver.fabricateSubmitted, false);
    assert.equal(resolver.fabricateDismissed, true, 'presented + not submitted → dismissed');
  } finally {
    clearRollStub();
  }
});

test('T1: a never-presented digital resolver (fulfillable.size 0) is NOT dismissed', () => {
  installRollStub();
  try {
    // Constructed in the digital state (empty fulfillable), NOT relying on an
    // undefined `_resolver` — a default-digital client must roll exactly as today.
    const resolver = makeResolver([]);
    assert.equal(resolver.fabricateSubmitted, false);
    assert.equal(resolver.fabricateDismissed, false, 'no presented dialog → not a dismissal');
  } finally {
    clearRollStub();
  }
});

// ---------------------------------------------------------------------------
// Bug 2 — serialized class name is re-labelled to the registered default
// ---------------------------------------------------------------------------

test('Bug 2: FabricateRoll#toJSON emits the registered CONFIG.Dice.rolls[0] class name', () => {
  class RegisteredRoll {
    static get resolverImplementation() {
      return BaseResolver;
    }
    toJSON() {
      return { class: this.constructor.name, formula: '1d20', terms: [] };
    }
  }
  globalThis.Roll = RegisteredRoll;
  globalThis.CONFIG = { Dice: { rolls: [RegisteredRoll] } };
  try {
    const FabricateRoll = buildFabricateRollClass();
    const instance = new FabricateRoll();
    const data = instance.toJSON();
    assert.equal(
      data.class,
      'RegisteredRoll',
      'the serialized class is the registered default, not "FabricateRoll"'
    );
    assert.notEqual(data.class, 'FabricateRoll');
  } finally {
    clearRollStub();
  }
});

test('Bug 2: with no CONFIG.Dice.rolls, toJSON falls back to globalThis.Roll name', () => {
  class PlainRoll {
    toJSON() {
      return { class: this.constructor.name };
    }
  }
  globalThis.Roll = PlainRoll;
  try {
    const FabricateRoll = buildFabricateRollClass();
    assert.equal(new FabricateRoll().toJSON().class, 'PlainRoll');
  } finally {
    clearRollStub();
  }
});

// ---------------------------------------------------------------------------
// T6 — serialization round-trip driven through evaluateCheckRoll's interactive
// path (the actual wiring, not a hand-built fixture).
// ---------------------------------------------------------------------------

test('T6: a posted interactive check roll serializes with a registered class name and round-trips', async () => {
  let posted = null;
  // A registered Roll whose fromData mimics Foundry: it throws unless the payload's
  // `class` is its own registered name (the "Unable to recreate" failure mode).
  class RegisteredRoll {
    constructor(formula, data) {
      this.formula = formula;
      this.data = data;
      this.total = 12;
      this.dice = [];
    }
    static get resolverImplementation() {
      return BaseResolver;
    }
    static replaceFormulaData(formula) {
      return String(formula);
    }
    static validate() {
      return true;
    }
    static fromData(data) {
      if (data.class !== 'RegisteredRoll') {
        throw new Error(`Unable to recreate ${data.class} instance`);
      }
      return Object.assign(new RegisteredRoll(data.formula), data);
    }
    async evaluate() {
      // No _resolver.fabricateDismissed → not a dismissal (digital-equivalent).
      return this;
    }
    toJSON() {
      return { class: this.constructor.name, formula: this.formula, terms: [] };
    }
    async toMessage(messageData, options) {
      posted = this;
      return { id: 'msg' };
    }
  }
  globalThis.Roll = RegisteredRoll;
  globalThis.CONFIG = { Dice: { rolls: [RegisteredRoll] } };
  globalThis.ChatMessage = { create: async () => ({ id: 'm' }) };
  try {
    const result = await evaluateCheckRoll('1d20', { getRollData: () => ({}) }, {
      interactive: true,
      flavor: 'Iron Sword — Crafting check',
      speaker: { alias: 'Tinker' },
    });
    assert.equal(result.cancelled, undefined, 'a digital-equivalent interactive roll is not cancelled');
    assert.ok(posted, 'the roll was posted to chat');
    // The posted instance is the FabricateRoll detection instance…
    assert.equal(posted.constructor.name, 'FabricateRoll', 'the same evaluated instance is posted');
    // …but its serialized class is the REGISTERED name, so fromData does not throw.
    const serialized = posted.toJSON();
    assert.equal(serialized.class, 'RegisteredRoll');
    assert.doesNotThrow(() => RegisteredRoll.fromData(serialized), 'round-trips without "Unable to recreate"');
  } finally {
    clearRollStub();
    delete globalThis.ChatMessage;
  }
});

test('the dismissal reason constant is the documented value', () => {
  assert.equal(NATIVE_ROLL_DIALOG_DISMISSED, 'nativeRollDialogDismissed');
});
