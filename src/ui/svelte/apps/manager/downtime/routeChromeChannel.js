import { normalizeRouteChrome } from '../../../../managerExtensions.js';

/**
 * The runtime side of the Manager's World navigation seam.
 *
 * WHAT PROBLEM THIS SOLVES. A provider's route chrome used to be fixed at registration: a
 * tab's `title`, `subtitle`, `breadcrumb`, `actionsLabel` and `actions` were read once and
 * never again. That is enough for a companion whose tab is one screen, and wrong for one
 * whose tab is a LIST that drills into an EDITOR — the editor needs its own name, its own
 * artwork, an "Unsaved" chip and Back/Delete/Save controls, all in the page header where
 * every Fabricate editor puts them. The only way to restate chrome was to re-register the
 * provider, which flashes Core's preview through the gap and remounts the companion,
 * destroying the very editor state the header is describing.
 *
 * WHY A CHANNEL AND NOT A CONTEXT FIELD. The mount context is frozen and stays frozen, and
 * its identity is what the host's mount effect keys a remount on. A mutable chrome field
 * would break the freeze; a NEW context carrying new chrome would remount. So the context
 * carries FUNCTIONS — `setRouteChrome` and `onRouteReselect` — whose writes land here, and
 * Core re-renders its header from this channel without the context identity moving at all.
 *
 * WHY THIS IS A PLAIN LEAF. It imports no Svelte and no Foundry global, so the whole
 * lifecycle — liveness, replacement, per-mount scoping, fault containment — is unit-testable
 * without mounting a component tree. The one reactive edge is `onChange`, which the Manager
 * root points at a `$state` assignment.
 *
 * WHY LIVENESS IS KEYED ON THE CONTEXT OBJECT. A companion may retain a context after its
 * mount has ended (a pending promise, a stray listener) and call `setRouteChrome` from it.
 * The context object is already minted once per mount — Core replaces it, never mutates it,
 * whenever anything a mount depends on changes — so it is the identity that was already
 * available, and comparing against it means a stale mount writes nothing rather than
 * repainting whatever screen the GM has since navigated to.
 */

/**
 * The frozen channel a Manager root owns for its Downtime surface.
 *
 * @typedef {object} RouteChromeChannel
 * @property {(context: object) => void} beginMount Adopt `context` as the live mount and
 *   clear any chrome and reselect handler the previous one left behind.
 * @property {(context: object) => void} endMount Release `context` if it is the live mount.
 * @property {(caller: object, chrome: object|null) => boolean} setChrome Validate and store
 *   one chrome update on behalf of `caller`.
 * @property {(caller: object, handler: () => void) => (() => void)} onReselect Register
 *   `caller`'s re-activation handler and return an idempotent unsubscribe.
 * @property {() => boolean} reselect Invoke the live handler, contained.
 * @property {object|null} chrome The chrome Core should render, or `null` for the tab's own.
 */

/**
 * Create one Downtime route-chrome channel.
 *
 * @param {object} [options] Injectable edges.
 * @param {(chrome: object|null) => void} [options.onChange] Called with the chrome Core must
 *   render whenever it changes, and only when it changes.
 * @param {(...args: unknown[]) => void} [options.reportError] Sink for a throwing handler.
 * @returns {RouteChromeChannel} Frozen channel.
 */
export function createRouteChromeChannel({
  onChange = () => {},
  // Read through `console` at CALL time rather than defaulting to the bare `console.error`
  // reference. A channel is created once, when the Manager root initialises, so a captured
  // reference would pin whatever `console.error` was at that instant — which is what makes a
  // later swap (a test harness, a Foundry log wrapper, a debugging shim) silently ineffective
  // against this one sink while working everywhere else.
  reportError = (...args) => console.error(...args),
} = {}) {
  // The context object of the mount currently on screen, or null between mounts.
  let liveContext = null;
  let chrome = null;
  let reselectHandler = null;

  function publish(next) {
    // Guarded so a mount that sets no chrome — the common case, and every shipped companion
    // today — never republishes `null` over `null` and never wakes the header's readers.
    if (chrome === next) return;
    chrome = next;
    onChange(chrome);
  }

  function isLive(caller) {
    return liveContext !== null && caller === liveContext;
  }

  function release() {
    liveContext = null;
    reselectHandler = null;
    publish(null);
  }

  return Object.freeze({
    beginMount(context) {
      // A fresh mount starts from the tab's REGISTERED chrome, always. Carrying the previous
      // mount's chrome across would mean a GM who left a companion's editor open, switched
      // tab and came back would arrive on a list screen still wearing the editor's title,
      // artwork, Unsaved chip and Save button — describing state the remount just discarded.
      reselectHandler = null;
      liveContext = context ?? null;
      publish(null);
    },

    endMount(context) {
      if (!isLive(context)) return;
      release();
    },

    setChrome(caller, next) {
      // Validate FIRST and unconditionally, so a malformed update is refused with the same
      // message whoever sent it, and so a refusal can never leave half of one applied. The
      // `TypeError` travels back to the companion's own call stack, which is where a
      // programming error belongs; Core's state is untouched either way.
      const normalized = normalizeRouteChrome(next);
      if (!isLive(caller)) return false;
      publish(normalized);
      return true;
    },

    onReselect(caller, handler) {
      if (typeof handler !== 'function') {
        throw new TypeError('Fabricate World navigation onRouteReselect requires a function');
      }
      if (!isLive(caller)) return () => {};
      reselectHandler = handler;
      let subscribed = true;
      return () => {
        if (!subscribed) return;
        subscribed = false;
        // Only clear a handler that is still this one: a later `onRouteReselect` replaced it,
        // and an unsubscribe held over that replacement must not evict the newer handler.
        if (reselectHandler === handler) reselectHandler = null;
      };
    },

    reselect() {
      const handler = reselectHandler;
      if (!handler) return false;
      try {
        handler();
        return true;
      } catch (error) {
        // Core invokes this one, so Core contains it: a companion that throws while popping
        // its own drill-down must not take the Manager's rail click down with it.
        reportError('Fabricate | Downtime route re-activation handler failed:', error);
        return false;
      }
    },

    get chrome() {
      return chrome;
    },
  });
}
