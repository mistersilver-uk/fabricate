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
 * carries FUNCTIONS — `setRouteChrome`, `onRouteReselect` and `onBeforeNavigate` — whose
 * writes land here, and Core re-renders its header from this channel without the context
 * identity moving at all.
 *
 * WHY THE NAVIGATION GUARD LIVES HERE TOO, in a file named after chrome. Every one of these
 * three channels is scoped to ONE MOUNT and dies with it, and that liveness rule — keyed on
 * the context object Core mints per mount — is the whole substance of this module. A guard
 * kept anywhere else would need its own copy of that rule, agreeing with this one today and
 * undetectable the day one of them learns about a lifecycle path the other does not.
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
 * @property {(caller: object, handler: Function) => (() => void)} onBeforeNavigate Register
 *   `caller`'s navigation guard and return an idempotent unsubscribe.
 * @property {(reason: string) => (undefined|boolean|Promise<boolean>)} confirmNavigation Ask
 *   the live mount's guard whether one navigation may proceed. `undefined` means there is
 *   nothing to ask.
 * @property {object|null} chrome The chrome Core should render, or `null` for the tab's own.
 */

/**
 * The message Core logs when a companion's navigation guard fails.
 *
 * ONE constant because both failure modes report through it: a synchronous throw and a
 * rejected promise are the same defect wearing two shapes, and a companion reading its log
 * should not have to know which shape its guard produced to find the line.
 */
const GUARD_FAILURE = 'Fabricate | Downtime navigation guard failed:';

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
  let navigateHandler = null;
  // The in-flight guard answer, shared by every navigation that arrives while it is pending.
  // See `confirmNavigation` for why it is shared rather than refused or re-asked.
  let pendingNavigation = null;

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
    navigateHandler = null;
    // A navigation still waiting on the old mount's dialog keeps the promise it was already
    // handed; what must not survive is the VARIABLE, or the next mount's first navigation
    // would be answered by a prompt describing a screen that no longer exists.
    pendingNavigation = null;
    publish(null);
  }

  function reportGuardFailure(error) {
    reportError(GUARD_FAILURE, error);
  }

  return Object.freeze({
    beginMount(context) {
      // A fresh mount starts from the tab's REGISTERED chrome, always. Carrying the previous
      // mount's chrome across would mean a GM who left a companion's editor open, switched
      // tab and came back would arrive on a list screen still wearing the editor's title,
      // artwork, Unsaved chip and Save button — describing state the remount just discarded.
      reselectHandler = null;
      navigateHandler = null;
      pendingNavigation = null;
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

    onBeforeNavigate(caller, handler) {
      if (typeof handler !== 'function') {
        throw new TypeError('Fabricate World navigation onBeforeNavigate requires a function');
      }
      if (!isLive(caller)) return () => {};
      navigateHandler = handler;
      let subscribed = true;
      return () => {
        if (!subscribed) return;
        subscribed = false;
        // Same replacement rule as `onReselect`: an unsubscribe held across a later
        // registration must not evict the handler that replaced it.
        if (navigateHandler === handler) navigateHandler = null;
      };
    },

    confirmNavigation(reason) {
      // `undefined` — deliberately NOT `true` — is the answer when there is nothing to ask,
      // and it IS the compatibility guarantee. It lets every caller run the exact code path it
      // ran before this channel existed: no extra `await`, no extra microtask, no reordering,
      // for the companion that never registers a guard and for every Core route.
      if (!navigateHandler) return undefined;
      // RE-ENTRANCY. A guard is expected to await a dialog, and a second navigation can arrive
      // while that dialog is open — a rail click, then the window's close button. Calling the
      // handler again would stack a second dialog on top of the first; answering the second
      // navigation `false` outright would hand the GM a dead click with nothing to explain it.
      // So the pending answer is SHARED: the GM's one decision resolves both navigations, and
      // each caller then runs its own continuation. This is the same de-duplication
      // `confirmDiscardDirtyToolsDraft` already applies to Core's own concurrent prompt.
      if (pendingNavigation) return pendingNavigation;
      let result;
      try {
        result = navigateHandler(Object.freeze({ reason }));
      } catch (error) {
        // A THROWN GUARD ALLOWS THE NAVIGATION, contained and reported. The alternative —
        // reading a throw as a veto — lets one companion defect leave the GM in a Manager they
        // cannot close and a rail that does nothing, recoverable only by reloading Foundry.
        // Allowing costs strictly less: it degrades to the behaviour that shipped before this
        // seam existed, where a screen exit neither wrote nor discarded a companion's draft.
        reportGuardFailure(error);
        return undefined;
      }
      // Only an explicit `false` vetoes. An omitted return, `undefined`, `true` or anything
      // else allows, so a handler written to OBSERVE a navigation cannot accidentally trap the
      // GM by forgetting to return. This is the same `=== false` reading every Core guard uses.
      if (!result || typeof result.then !== 'function') return result !== false;
      const settled = Promise.resolve(result).then(
        (value) => value !== false,
        (error) => {
          // A rejection is the same defect as a throw and gets the same ruling.
          reportGuardFailure(error);
          return true;
        }
      );
      pendingNavigation = settled;
      settled.finally(() => {
        if (pendingNavigation === settled) pendingNavigation = null;
      });
      return settled;
    },

    get chrome() {
      return chrome;
    },
  });
}
