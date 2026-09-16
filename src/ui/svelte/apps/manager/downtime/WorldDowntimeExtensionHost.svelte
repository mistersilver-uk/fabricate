<script>
  import { onDestroy, onMount, tick } from 'svelte';
  import WorldDowntimePreview from './WorldDowntimePreview.svelte';
  import { WORLD_DOWNTIME_PREVIEW_PROVIDER } from './worldDowntimePreviewProvider.js';
  import WorldDowntimeTabs from './WorldDowntimeTabs.svelte';
  import { MANAGER_HOOKS } from '../../../../../config/hooks.js';
  import { emitManagerHook, WORLD_DOWNTIME_SURFACE_ID } from '../../../../managerExtensions.js';

  // `activeTabId` is bindable because the route header, the rail's Downtime sub-items and Core's
  // own strip all name or drive it: one owner, several triggers. Unbound, it is local state.
  //
  // `provider` is a PROP, not a subscription: the rail renders the tab set while this host is
  // unmounted, so the shell owns "which provider is live" and this host owns the mount lifecycle.
  let {
    provider = null,
    tabs = WORLD_DOWNTIME_PREVIEW_PROVIDER.tabs,
    context = Object.freeze({}),
    reportError = console.error,
    emitHook = emitManagerHook,
    surfaceId = WORLD_DOWNTIME_SURFACE_ID,
    route = 'world-downtime',
    onProviderFault = () => {},
    // The runtime route-chrome channel. A mount boundary is exactly what scopes a chrome update, so
    // the two calls bracketing `provider.mount` are made here, where a mount is observable at all.
    // Optional, like `emitHook`: the direct-mount tests drive this component without a shell.
    chromeChannel = null,
    // The element that NAMES each companion screen: the visible label in the rail's Downtime
    // sub-item, whose id Root owns — so Root passes the function it stamps the rail with. REQUIRED
    // with no default, since a default would BE the hand-maintained mirror this prop avoids. The
    // label id lives inside `{#if railGroupExpanded.worldDowntime}`, so the name needs the lock.
    navLabelId,
    activeTabId = $bindable('tracking'),
  } = $props();
  const coreFallback = $derived(provider == null);
  let extensionTarget = $state(null);
  let shell = $state(null);
  let activeMount = null;
  // Plain locals, deliberately not `$state`: they record what has been OBSERVED, and making them
  // reactive would make each effect its own dependency.
  let observedProvider;
  let providerObserved = false;
  let recoverFocus = false;
  let announcedTabId = null;

  function surfacePayload(extra = {}) {
    return Object.freeze({
      schemaVersion: 1,
      surfaceId,
      route,
      tabId: activeTabId,
      providerId: provider?.id ?? null,
      coreFallback,
      ...extra,
    });
  }

  function disposeActiveMount() {
    const mountedProvider = activeMount;
    if (!mountedProvider) return;
    activeMount = null;
    // BEFORE the companion's own cleanup runs, so a cleanup that calls `setRouteChrome` on
    // its way out writes nothing: the mount whose chrome it would be describing is over.
    chromeChannel?.endMount(mountedProvider.context);
    try {
      mountedProvider.cleanup?.();
    } catch (error) {
      reportError('Fabricate | Downtime provider cleanup failed:', error);
    } finally {
      mountedProvider.target.replaceChildren();
    }
  }

  export function disposeBeforeRemoval() {
    disposeActiveMount();
  }

  function selectTab(tabId) {
    if (tabId === activeTabId) return;
    disposeActiveMount();
    activeTabId = tabId;
  }

  // `$effect.pre` runs BEFORE the DOM is updated, which is the only moment at which
  // `document.activeElement` still names the node the provider swap is about to remove.
  $effect.pre(() => {
    const nextProvider = provider;
    if (providerObserved && nextProvider === observedProvider) return;
    const hadProvider = providerObserved;
    providerObserved = true;
    observedProvider = nextProvider;
    recoverFocus = hadProvider && shell?.contains?.(document.activeElement) === true;
  });

  // MODE-AWARE, not one selector. Provider mode renders no tab strip, so `#world-downtime-tab-<id>`
  // resolves to nothing and optional chaining drops focus to `<body>` in silence. A combined
  // `panel, tab` selector looks equivalent and is not: `querySelector` returns the first DOCUMENT
  // match, and in core-fallback the panels carry that id AND precede the strip.
  $effect(() => {
    // Track the swap this recovery belongs to.
    void provider;
    const fallbackNow = coreFallback;
    if (!recoverFocus) return;
    recoverFocus = false;
    const selector = fallbackNow
      ? `#world-downtime-tab-${activeTabId}`
      : `#world-downtime-panel-${activeTabId}`;
    tick().then(() => shell?.querySelector?.(selector)?.focus?.());
  });

  $effect(() => {
    const tabId = activeTabId;
    if (announcedTabId === tabId) return;
    const previousTabId = announcedTabId;
    announcedTabId = tabId;
    // The first observation is the route's own mount, which `SURFACE_MOUNTED` reports.
    if (previousTabId === null) return;
    emitHook(MANAGER_HOOKS.SURFACE_TAB_CHANGED, surfacePayload({ previousTabId }));
  });

  $effect(() => {
    const target = extensionTarget;
    const activeProvider = provider;
    const tabId = activeTabId;
    const mountContext = context;
    if (!target || !activeProvider) return;
    // The shell normalizes `activeTabId` onto the new tab set, so for one render the id and
    // the provider can disagree. Never ask a companion to mount a tab it does not declare.
    if (!activeProvider.tabs.some((tab) => tab.id === tabId)) return;

    target.replaceChildren();
    // Adopted BEFORE `mount`: a companion states its chrome from inside its own mount, and a
    // channel opened afterwards would refuse that first call as coming from an unknown context.
    chromeChannel?.beginMount(mountContext);
    try {
      const result = activeProvider.mount({ target, tabId, context: mountContext });
      if (result !== undefined && typeof result !== 'function') {
        throw new TypeError(
          'World navigation provider mount must return a cleanup function or nothing'
        );
      }
      activeMount = { target, cleanup: result ?? null, context: mountContext };
    } catch (error) {
      target.replaceChildren();
      // `activeMount` was never set, so `disposeActiveMount` releases nothing: without this a
      // faulted mount's chrome would outlive it and dress Core's own fallback preview.
      chromeChannel?.endMount(mountContext);
      reportError('Fabricate | Downtime provider mount failed:', error);
      onProviderFault(activeProvider);
    }

    return disposeActiveMount;
  });

  onMount(() => emitHook(MANAGER_HOOKS.SURFACE_MOUNTED, surfacePayload()));

  onDestroy(() => {
    const payload = surfacePayload();
    disposeActiveMount();
    emitHook(MANAGER_HOOKS.SURFACE_UNMOUNTED, payload);
  });
</script>

<section
  class={`downtime-host ${coreFallback ? 'core-fallback' : ''}`}
  bind:this={shell}
  data-world-downtime-host
>
  {#if coreFallback}
    <div class="downtime-preview-scroll">
      {#each tabs as tab (tab.id)}
        <WorldDowntimePreview tabId={tab.id} hidden={tab.id !== activeTabId} />
      {/each}
    </div>
    <WorldDowntimeTabs {tabs} {activeTabId} onSelect={selectTab} />
  {:else}
    <!--
      NO TAB STRIP HERE: a provider's tabs ARE the rail's Downtime sub-items, so a strip would draw
      the same list twice and cost the companion 44px. Those sub-items are not a tablist, so a
      `role="tabpanel"` would be an orphan and each panel is a NAMED REGION instead — labelled by
      the VISIBLE LABEL inside its rail item rather than by the item, whose accessible name names
      an ACTION ("Open the downtime ledger") that a landmark would inherit whole.

      `tabindex="-1"`, not `0`: the focus stop existed to scroll a panel that no longer owns the
      scrolling. What is left is the programmatic focusability the provider-swap recovery needs.
    -->
    <div class="downtime-extension-panels">
      {#each tabs as tab (tab.id)}
        <div
          id={`world-downtime-panel-${tab.id}`}
          class="downtime-extension-panel"
          role="region"
          tabindex="-1"
          data-keyboard-focus="true"
          aria-labelledby={navLabelId(tab.id)}
          hidden={tab.id !== activeTabId}
        >
          {#if tab.id === activeTabId}
            <div
              class="downtime-extension-target"
              bind:this={extensionTarget}
              data-downtime-extension-panel={tab.id}
            ></div>
          {/if}
        </div>
      {/each}
    </div>
  {/if}
</section>

<style>
  /*
    The workspace surface is a step DARKER than a card: the ladder runs backdrop -> frame
    (`--fab-bg-1`) -> cards (`--fab-bg-2`), and the Manager's default main pane paints `--fab-bg-2`,
    which inverts it. The host states its own surface so every child sits on the one the design draws.

    ONE TRACK IN PROVIDER MODE is ONE DECISION WITH THE MARKUP ABOVE, not leftover tidiness. Grid
    auto-placement puts the single child in the FIRST track rather than skipping into a vacated
    `1fr`, so `auto minmax(0, 1fr)` collapsed the panels to content height beside an empty 700px
    track — and `target.clientHeight === panels.clientHeight` still read true, both having collapsed.
    Do not restore a second track without restoring a second child above it.
  */
  .downtime-host {
    display: grid;
    grid-template-rows: minmax(0, 1fr);
    min-width: 0;
    min-height: 0;
    height: 100%;
    background: var(--fab-bg-1);
    overflow: hidden;
  }

  .downtime-host.core-fallback {
    grid-template-rows: minmax(0, 1fr) auto;
  }

  /*
    THE FALLBACK SCROLLER. Core's panel scroller keeps working for any companion whose content
    overflows its root VISIBLY, full height included; it stops rescuing one that absorbs its own
    content, through a non-`visible` overflow or a definite-height flex/grid root that shrinks its
    children. Height alone does not remove the fallback.

    Measured at panel client height 707: auto-height root with a tall child scrolls (2550);
    definite-height flex column with a SHRINKABLE child does not (707, squashed to 671); the same
    with a non-shrinking child does (2526); definite `display: block` does (2526); a root with its
    own `overflow: auto` does not (707). A probe concluding "full height kills the scroller" has
    measured `flex-shrink: 1`, not height.
  */
  .downtime-preview-scroll,
  .downtime-extension-panels {
    min-width: 0;
    min-height: 0;
    overflow: auto;
  }

  /*
    THE COMPANION PANEL IS A BARE BOX, matching the player seam's target: full height, and no
    padding, background, scroller or containment. Core's old `12px 20px 24px` inset is gone, so a
    companion that relied on it must add its own.

    `height: 100%` at BOTH links is what makes the content box reachable: without it a companion
    root asking for `height: 100%` resolves against an auto-height ancestor and quietly gets CONTENT
    height. `.downtime-host` is already `height: 100%` and `.downtime-extension-panels` is its
    `minmax(0, 1fr)` row, so the chain is definite from the host down. It stays OPT-IN — reachable,
    never forced — and a companion setting no height renders at content height with the scroller.
  */
  .downtime-extension-panel {
    height: 100%;
    min-height: 0;
  }

  .downtime-extension-target {
    height: 100%;
    min-width: 0;
    min-height: 0;
  }
</style>
