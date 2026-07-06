/**
 * Detection seam for Foundry's native manual roll-fulfilment dialog (issue #513).
 *
 * On the interactive check-roll path Fabricate defers to Foundry's own roll
 * machinery so a client configured for manual roll fulfilment can enter their
 * physical roll (and roll mode / Dice So Nice are honoured through Foundry). But a
 * DISMISSED manual-fulfilment `RollResolver` **resolves — it never rejects** — and
 * silently fills every unfilled die with `term.randomFace()` (ordinary digital
 * PRNG). A `try/catch` around `evaluate()` therefore cannot see a cancel; detection
 * must read state off the resolver.
 *
 * {@link buildFabricateRollClass} returns — LAZILY, at call time — a local
 * `FabricateRoll extends globalThis.Roll` whose static `resolverImplementation`
 * getter wraps `super.resolverImplementation` in a `RollResolver` subclass that
 * records submit-vs-dismiss. The class expression is built lazily because
 * `globalThis.Roll` is a Foundry runtime global that does not exist headless — a
 * top-level `class extends globalThis.Roll` would throw at module load.
 *
 * `FabricateRoll` is instantiated LOCALLY only. It is NEVER registered on
 * `CONFIG.Dice.rolls` / `Roll.defaultImplementation`, so other modules' rolls are
 * unaffected. Because a chat message serializes the roll's class name, and
 * `FabricateRoll` is deliberately absent from `CONFIG.Dice.rolls`, its
 * {@link toJSON} override re-labels the serialized `class` as the registered default
 * implementation's name so a posted message round-trips through `Roll.fromData` on
 * every client (and Dice So Nice animates) without an "Unable to recreate
 * FabricateRoll instance" throw (Bug 2).
 */

/** The `cancelledReason` a native-dialog dismissal threads through the runners. */
export const NATIVE_ROLL_DIALOG_DISMISSED = 'nativeRollDialogDismissed';

/**
 * Build (lazily, at call time) the local `FabricateRoll` subclass over the current
 * `globalThis.Roll`. Returns a fresh class each call so a swapped `globalThis.Roll`
 * (e.g. a test stub, or a module re-registering the default implementation) is
 * always honoured; a check roll is not a hot path, so the per-call class build is
 * negligible.
 *
 * @returns {Function} A `Roll` subclass. Instantiate locally; never register it.
 * @throws {Error} When `globalThis.Roll` is unavailable (headless / non-Foundry).
 */
export function buildFabricateRollClass() {
  const Roll = globalThis.Roll;
  if (typeof Roll !== 'function') {
    throw new TypeError('Fabricate | Cannot build FabricateRoll: globalThis.Roll is unavailable');
  }

  return class FabricateRoll extends Roll {
    static get resolverImplementation() {
      // Wrap (do not replace) the method-specific resolver so DSN / hardware
      // resolvers registered per fulfilment method are preserved.
      const Base = super.resolverImplementation;
      return class FabricateRollResolver extends Base {
        // Set on a genuine submit AND on `_checkDone`'s `requestSubmit` for
        // auto-completing hardware / DSN resolvers — both route through
        // `_onSubmitForm` per the RollResolver contract, so third-party hardware
        // resolvers (Pixels / GoDice) are recorded as submits, not dismissals.
        fabricateSubmitted = false;

        async _onSubmitForm(formConfig, event) {
          this.fabricateSubmitted = true;
          return super._onSubmitForm(formConfig, event);
        }

        /**
         * A dismiss counts ONLY when the fulfilment dialog was actually PRESENTED
         * (there was an externally-fulfillable term) and the form was never
         * submitted. `fulfillable.size` — NOT `rendered === false` — is the positive
         * "dialog was presented" signal:
         *
         * - default-digital client → `fulfillable.size === 0` → NOT dismissed (the
         *   resolver exists but nothing was presented; rolls exactly as the
         *   automated path);
         * - manual-fulfilment submit → `fabricateSubmitted === true` → NOT dismissed;
         * - manual-fulfilment dismiss → `size > 0 && !submitted` → dismissed.
         *
         * (`rendered` carries no positive signal: it is `false` for a digital client
         * that never rendered AND `false` after a genuine submit's `close()`.)
         */
        get fabricateDismissed() {
          const fulfillable = this.fulfillable;
          const size = fulfillable && typeof fulfillable.size === 'number' ? fulfillable.size : 0;
          return size > 0 && this.fabricateSubmitted === false;
        }
      };
    }

    /**
     * Re-label the serialized `class` as the REGISTERED default implementation's
     * name (Bug 2). `FabricateRoll` is never in `CONFIG.Dice.rolls`, so serializing
     * `class: "FabricateRoll"` would make every client's `Roll.fromData` throw
     * "Unable to recreate FabricateRoll instance" (breaking the chat card + DSN).
     * The detection instance stays `FabricateRoll`; only its serialized form is
     * re-labelled, so the SAME evaluated instance can be posted to chat.
     */
    toJSON() {
      const data = super.toJSON();
      const registered = globalThis.CONFIG?.Dice?.rolls?.[0] ?? globalThis.Roll;
      if (registered?.name) data.class = registered.name;
      return data;
    }
  };
}

/**
 * Construct a local `FabricateRoll` for the given formula / roll data. Convenience
 * over {@link buildFabricateRollClass} for the interactive evaluate path.
 *
 * @param {string} formula
 * @param {object} [data]
 * @returns {object} An unevaluated `FabricateRoll` instance (call `.evaluate()`).
 */
export function createFabricateRoll(formula, data) {
  const FabricateRoll = buildFabricateRollClass();
  return new FabricateRoll(formula, data);
}
