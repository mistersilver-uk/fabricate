<!-- Svelte 5 runes mode -->
<!--
  The player window's companion mount host.

  It owns ONE thing: the lifecycle of a registered player navigation provider's mount into a
  Core-owned target (issue 1198). It does not own which provider is live, which tab is
  active, or what happens after a fault — all three belong to `FabricateAppRoot`, which is
  the player window's single subscriber and the only component that can move the nav rail as
  well as the panel. This host takes `provider`, `surfaceId` and `tabId` as props for exactly
  that reason, mirroring `WorldDowntimeExtensionHost` on the Manager side.

  Its element is a BARE div and deliberately declares nothing but its own height: no padding,
  no background, no scroller (`.fabricate-app-content` already scrolls, and a second scroller
  produces a nested double scroll) and no `container-type` (which implies `contain: layout`
  and would silently make this element the containing block for a companion's fixed-position
  popovers). A companion that wants container queries declares one on its own root, whose
  inline size is this element's.
-->
<script>
  import { onDestroy, onMount } from 'svelte';
  import { PLAYER_HOOKS } from '../../../config/hooks.js';
  import { emitPlayerHook } from '../../playerExtensions.js';

  let {
    provider = null,
    surfaceId = '',
    tabId = '',
    context = Object.freeze({}),
    reportError = console.error,
    emitHook = emitPlayerHook,
    onProviderFault = () => {},
  } = $props();

  let extensionTarget = $state(null);
  // Plain locals, deliberately not `$state`: `activeMount` is the live cleanup handle and
  // `announcedTabId` records what has already been OBSERVED, so making either reactive would
  // make each effect its own dependency.
  let activeMount = null;
  let announcedTabId = null;

  const MOUNTED_ATTRIBUTE = 'data-player-extension-mounted';
  const MOUNTED_TAB_ATTRIBUTE = 'data-player-extension-tab';

  /**
   * Stamp — or unstamp — the success marker on the mount target.
   *
   * Written imperatively rather than bound in the template ON PURPOSE. The stamp means "a
   * companion is mounted in this element RIGHT NOW", and a template binding is applied on the
   * next render, so a cleared target would keep claiming a mount for one flush — including
   * across `disposeBeforeRemoval()`, after which there is no next render at all. The View
   * Lab's readiness assertion reads this attribute, so a stamp that can outlive its mount is
   * a frame that publishes an empty companion panel and still passes its capture.
   *
   * @param {HTMLElement} target Core-owned mount target.
   * @param {string|null} tabId Mounted tab id, or `null` to clear the stamp.
   */
  function stampMounted(target, tabId) {
    if (tabId === null) {
      target.removeAttribute(MOUNTED_ATTRIBUTE);
      target.removeAttribute(MOUNTED_TAB_ATTRIBUTE);
      return;
    }
    target.setAttribute(MOUNTED_ATTRIBUTE, surfaceId);
    target.setAttribute(MOUNTED_TAB_ATTRIBUTE, tabId);
  }

  // `surfaceId` and `providerId` are always equal on the player side — a player surface id IS
  // the registering provider's own id, because Core has no player route of its own to name a
  // surface independently. Both are carried so this payload is shape-identical to the
  // Manager seam's. There is no `coreFallback` field: Core renders no content in a
  // provider's place here, so a tab exists only while its provider does.
  function surfacePayload(extra = {}) {
    return Object.freeze({
      schemaVersion: 1,
      surface: 'player',
      surfaceId,
      tabId,
      providerId: provider?.id ?? null,
      ...extra,
    });
  }

  // THE single cleanup path, reached from the mount effect's teardown return (which is also
  // the tab switch and the provider swap), from `onDestroy`, and from the exported
  // `disposeBeforeRemoval()` the application shell calls while the target is still connected.
  // Cleanup runs inside `try` and the target is cleared in `finally`, so a companion that
  // throws on the way out still has its content removed.
  function disposeActiveMount() {
    const mounted = activeMount;
    if (!mounted) return;
    activeMount = null;
    stampMounted(mounted.target, null);
    try {
      mounted.cleanup?.();
    } catch (error) {
      reportError('Fabricate | Player extension cleanup failed:', error);
    } finally {
      mounted.target.replaceChildren();
    }
  }

  /**
   * Run the active mount's cleanup while this host's target is still connected.
   *
   * TWO callers, one per family of removal. `SvelteFabricateApp.close()` calls the shell's
   * exported disposal, which reaches this, immediately before awaiting `super.close(options)`.
   * `FabricateAppRoot`'s surface `$effect.pre` calls it directly when the live surface id is
   * about to change or clear — which is the tab leaving a companion route, the tab moving to a
   * different companion surface, and the active provider unregistering under its own live tab.
   *
   * The ordering is not a preference in either case: `unmount()` destroys the root effect,
   * `destroy_effect` removes the effect's DOM BEFORE running teardowns, and `onDestroy` is
   * itself a teardown, so every `onDestroy` below runs against an already-detached tree. The
   * `onDestroy` net is a leak net, never a connected-target path — `tests/components/
   * player-extension-host-mounted.test.js` pins that it reports `connected: false`.
   *
   * Idempotent, so a caller reaching this before the host's own teardown does not change the
   * "exactly once" count.
   */
  export function disposeBeforeRemoval() {
    disposeActiveMount();
  }

  $effect(() => {
    const target = extensionTarget;
    const activeProvider = provider;
    const activeTabId = tabId;
    const mountContext = context;
    if (!target || !activeProvider) return;
    // The shell normalizes the active route onto the new tab set, so for one render the id
    // and the provider can disagree. Never ask a companion to mount a tab it does not declare.
    if (!activeProvider.tabs?.some((tab) => tab.id === activeTabId)) return;

    target.replaceChildren();
    try {
      const result = activeProvider.mount({ target, tabId: activeTabId, context: mountContext });
      if (result !== undefined && typeof result !== 'function') {
        throw new TypeError(
          'Player navigation provider mount must return a cleanup function or nothing'
        );
      }
      activeMount = { target, cleanup: result ?? null };
      stampMounted(target, activeTabId);
    } catch (error) {
      // Containment, not healing: partial content goes, the fault is reported, and the
      // decision about what the user sees next is the SHELL's — which is what keeps the
      // faulted surface's rail entries in place and the active tab where the user put it.
      target.replaceChildren();
      stampMounted(target, null);
      reportError('Fabricate | Player extension mount failed:', error);
      onProviderFault(activeProvider);
    }

    return disposeActiveMount;
  });

  // Build the payload, commit the state transition, THEN emit. `Hooks.callAll` is
  // synchronous, so a listener that re-enters the registry or calls
  // `context.requestRemount()` must find this host already settled.
  $effect(() => {
    const nextTabId = tabId;
    if (announcedTabId === nextTabId) return;
    const previousTabId = announcedTabId;
    announcedTabId = nextTabId;
    // The first observation is this surface's own mount, which `SURFACE_MOUNTED` reports.
    if (previousTabId === null) return;
    emitHook(PLAYER_HOOKS.SURFACE_TAB_CHANGED, surfacePayload({ previousTabId }));
  });

  onMount(() => emitHook(PLAYER_HOOKS.SURFACE_MOUNTED, surfacePayload()));

  onDestroy(() => {
    const payload = surfacePayload();
    disposeActiveMount();
    emitHook(PLAYER_HOOKS.SURFACE_UNMOUNTED, payload);
  });
</script>

<!-- The mount target. Its success stamp is written by `stampMounted` rather than bound here;
     see that function's docblock for why a template binding would be wrong. -->
<div class="player-extension-target" bind:this={extensionTarget}></div>

<style>
  /*
    Exactly this and nothing else — see the component docblock. `height: 100%` because a bare
    div has auto height and every Core view root uses `height: 100%; min-height: 0`, so a
    companion root copying that pattern would resolve against `auto` and silently fall back to
    CONTENT height. That is not a collapse — the root still renders whatever it contains — but
    it is not the full-height box the companion asked for either, and nothing reports it.
  */
  .player-extension-target {
    height: 100%;
    min-height: 0;
  }
</style>
