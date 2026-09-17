import { requireNonEmptyString } from '../../../../extensionRegistry.js';
import { normalizeRouteChrome } from '../../../../managerExtensions.js';

/**
 * The runtime side of the Manager's World navigation seam. `openspec/specs/ui-integration/spec.md`
 * → "Downtime Preview and Premium Extension" is canonical for every rule below.
 *
 * A CHANNEL rather than a context field: the mount context is frozen and its identity keys a
 * remount, so a mutable chrome field would break the freeze and a new context would remount; the
 * context carries FUNCTIONS whose writes land here instead. All three channels are scoped to ONE
 * MOUNT and die with it, keyed on the context object Core mints per mount. That single liveness
 * rule is the whole substance of this module — which is why the navigation guard lives here too —
 * and it makes this a PLAIN LEAF whose one reactive edge is `onChange`.
 */

/**
 * @typedef {object} RouteChromeChannel The frozen channel a Manager root owns for Downtime.
 * @property {(context: object) => void} beginMount Adopt `context`, clearing the previous mount's.
 * @property {(context: object) => void} endMount Release `context` if it is the live mount.
 * @property {(caller: object, chrome: object|null) => boolean} setChrome Validate and store one update.
 * @property {(caller: object, handler: () => void) => (() => void)} onReselect Register `caller`'s
 *   re-activation handler; returns an idempotent unsubscribe.
 * @property {() => boolean} reselect Invoke the live handler, contained.
 * @property {boolean} canReselect Whether a live handler is registered right now.
 * @property {(caller: object, handler: Function) => (() => void)} onBeforeNavigate As `onReselect`,
 *   for the navigation guard.
 * @property {(reason: string) => (undefined|boolean|Promise<boolean>)} confirmNavigation Ask the
 *   live guard; `undefined` means there is nothing to ask.
 * @property {(caller: object, tabId: string) => (boolean|Promise<boolean>)} navigate Move the GM to
 *   one of the live mount's own tabs. `false` from a retired mount, and from inside a pending guard.
 * @property {object|null} chrome The chrome Core should render, or `null` for the tab's own.
 */

/**
 * The message Core logs when a guard fails. ONE constant: a synchronous throw and a rejected promise
 * are the same defect in two shapes, and a companion should not need to know which to find the line.
 */
const GUARD_FAILURE = 'Fabricate | Downtime navigation guard failed:';

/**
 * Create one Downtime route-chrome channel.
 *
 * @param {object} [options] Injectable edges.
 * @param {(chrome: object|null) => void} [options.onChange] The chrome Core must render, on change.
 * @param {(available: boolean) => void} [options.onReselectAvailable] Whether a live handler exists,
 *   on change. SEPARATE from `onChange`: chrome is what the header SAYS and this is what one of its
 *   controls can DO, and a tab crumb over a mount that registered no handler does nothing.
 * @param {(tabId: string) => (boolean|Promise<boolean>)} [options.onNavigate] Perform one
 *   companion-requested navigation. INJECTED: LIVENESS is this channel's, MEMBERSHIP and the move
 *   are Core's. The default refuses, so a channel with no host cannot navigate an absent GM.
 * @param {(...args: unknown[]) => void} [options.reportError] Sink for a throwing handler.
 * @returns {RouteChromeChannel} Frozen channel.
 */
export function createRouteChromeChannel({
  onChange = () => {},
  onReselectAvailable = () => {},
  onNavigate = () => false,
  // Read through `console` at CALL time: a channel is created once, so a captured reference would
  // pin whatever `console.error` was then and make a later swap silently ineffective here.
  reportError = (...args) => console.error(...args),
} = {}) {
  // The context object of the mount currently on screen, or null between mounts.
  let liveContext = null;
  let chrome = null;
  let reselectHandler = null;
  let navigateHandler = null;
  let pendingNavigation = null;
  // Whether a guard is being asked RIGHT NOW: `pendingNavigation` is still `null` through that
  // window, being assigned only after the handler returns.
  let askingGuard = false;

  // Every assignment goes through here, guarded on change, so a mount that registers no handler
  // never wakes the header's readers.
  function setReselectHandler(next) {
    if (reselectHandler === next) return;
    const was = reselectHandler !== null;
    reselectHandler = next;
    if (was !== (next !== null)) onReselectAvailable(next !== null);
  }

  function publish(next) {
    // Guarded, so a mount that sets no chrome never republishes `null` over `null`.
    if (chrome === next) return;
    chrome = next;
    onChange(chrome);
  }

  function isLive(caller) {
    return liveContext !== null && caller === liveContext;
  }

  function release() {
    liveContext = null;
    setReselectHandler(null);
    navigateHandler = null;
    // A navigation awaiting the old dialog keeps its promise; the VARIABLE must not survive, or the
    // next mount's first navigation would be answered by a prompt about a screen that is gone.
    pendingNavigation = null;
    publish(null);
  }

  function reportGuardFailure(error) {
    reportError(GUARD_FAILURE, error);
  }

  return Object.freeze({
    beginMount(context) {
      // A fresh mount starts from the tab's REGISTERED chrome, always: carrying the old mount's
      // across would dress a list screen in an editor's title, chip and Save button.
      setReselectHandler(null);
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
      // Validate FIRST and unconditionally, so a malformed update is refused with the same message
      // whoever sent it and the `TypeError` lands in the companion's own call stack.
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
      setReselectHandler(handler);
      let subscribed = true;
      return () => {
        if (!subscribed) return;
        subscribed = false;
        // Only clear a handler that is still this one, so a stale unsubscribe evicts nothing.
        if (reselectHandler === handler) setReselectHandler(null);
      };
    },

    reselect() {
      const handler = reselectHandler;
      if (!handler) return false;
      try {
        handler();
        return true;
      } catch (error) {
        // Core invokes it, so Core contains it: a throwing companion must not take the rail click.
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
        // Same replacement rule as `onReselect`.
        if (navigateHandler === handler) navigateHandler = null;
      };
    },

    confirmNavigation(reason) {
      // `undefined`, deliberately NOT `true`, when there is nothing to ask: it is what lets a caller
      // run its pre-channel path with no extra `await` or microtask.
      if (!navigateHandler) return undefined;
      // RE-ENTRANCY. A second navigation can arrive while the guard's dialog is open. Calling the
      // handler again would stack a second dialog; refusing outright would be a dead click. So the
      // pending answer is SHARED — one GM decision resolves both — as `confirmDiscardDirtyToolsDraft`
      // already does for Core's own concurrent prompt.
      if (pendingNavigation) return pendingNavigation;
      let result;
      // `finally`, not a pair of assignments: a THROWING guard must release this too, or one defect
      // would leave `navigateToTab` refusing for the rest of the mount.
      askingGuard = true;
      try {
        result = navigateHandler(Object.freeze({ reason }));
      } catch (error) {
        // A THROWN GUARD ALLOWS THE NAVIGATION, contained and reported. Reading a throw as a veto
        // would let one defect trap the GM in a Manager they cannot close; allowing degrades to the
        // behaviour that shipped before this seam existed.
        reportGuardFailure(error);
        return undefined;
      } finally {
        askingGuard = false;
      }
      // Only an explicit `false` vetoes — the same `=== false` reading every Core guard uses — so an
      // observing handler cannot trap the GM by forgetting to return.
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

    navigate(caller, tabId) {
      // Validated FIRST and unconditionally, for the reason `setChrome` states: a companion must not
      // be told its own defect is a dead mount.
      requireNonEmptyString(
        tabId,
        'Fabricate World navigation navigateToTab requires a non-empty tab id'
      );
      // A RETIRED MOUNT MOVES NOBODY: the same identity rule as `setChrome`, for higher stakes.
      if (!isLive(caller)) return false;
      // AND NEITHER DOES A MOUNT WHOSE OWN GUARD IS STILL BEING ASKED: not the de-duplication above,
      // because the companion is both asked and asking and its second question has a different
      // destination. The refused shape is a `navigateToTab` inside the guard body — always-redirect
      // re-enters unbounded, and conditional redirect commits the inner route before the outer veto
      // applies. So the answer is `false`, and a redirect is asked for AFTER the answer is given.
      if (askingGuard || pendingNavigation) return false;
      return onNavigate(tabId);
    },

    get chrome() {
      return chrome;
    },

    get canReselect() {
      return reselectHandler !== null;
    },
  });
}
