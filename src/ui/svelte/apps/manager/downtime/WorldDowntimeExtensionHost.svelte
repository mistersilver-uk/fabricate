<script>
  import { onDestroy, onMount, tick } from 'svelte';
  import WorldDowntimePreview from './WorldDowntimePreview.svelte';
  import { WORLD_DOWNTIME_PREVIEW_PROVIDER } from './worldDowntimePreviewProvider.js';
  import WorldDowntimeTabs from './WorldDowntimeTabs.svelte';
  import { MANAGER_HOOKS } from '../../../../../config/hooks.js';
  import { emitManagerHook, WORLD_DOWNTIME_SURFACE_ID } from '../../../../managerExtensions.js';

  // `activeTabId` is bindable because the selected preview is no longer private to this
  // host: the route's title, subtitle and breadcrumb leaf all name it, and the rail's
  // Downtime sub-items are a second trigger for the same navigation as the tab strip. One
  // owner, two triggers — binding keeps the shell authoritative while letting the host read
  // and drive it. Unbound (the direct-mount tests), it is ordinary local state.
  //
  // `provider` is a PROP rather than a subscription of this host's own. The rail renders the
  // active tab set while this host is unmounted, and a mount fault has to move the rail as
  // well as the panel, so exactly one component may own "which provider is live" — and it
  // has to be the shell. This host owns the mount lifecycle and nothing else.
  let {
    provider = null,
    tabs = WORLD_DOWNTIME_PREVIEW_PROVIDER.tabs,
    context = Object.freeze({}),
    reportError = console.error,
    emitHook = emitManagerHook,
    surfaceId = WORLD_DOWNTIME_SURFACE_ID,
    route = 'world-downtime',
    onProviderFault = () => {},
    activeTabId = $bindable('tracking'),
  } = $props();
  const coreFallback = $derived(provider == null);
  let extensionTarget = $state(null);
  let shell = $state(null);
  let activeMount = null;
  // Plain locals, deliberately not `$state`: they record what has already been OBSERVED so
  // an effect can tell a real change from a re-run, and making them reactive would make
  // each effect its own dependency.
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

  $effect(() => {
    // Track the swap this recovery belongs to.
    void provider;
    if (!recoverFocus) return;
    recoverFocus = false;
    tick().then(() => shell?.querySelector?.(`#world-downtime-tab-${activeTabId}`)?.focus?.());
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
    try {
      const result = activeProvider.mount({ target, tabId, context: mountContext });
      if (result !== undefined && typeof result !== 'function') {
        throw new TypeError(
          'World navigation provider mount must return a cleanup function or nothing'
        );
      }
      activeMount = { target, cleanup: result ?? null };
    } catch (error) {
      target.replaceChildren();
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
    <WorldDowntimeTabs {tabs} {activeTabId} onSelect={selectTab} coreFallback />
  {:else}
    <WorldDowntimeTabs {tabs} {activeTabId} onSelect={selectTab} />
    <div class="downtime-extension-panels">
      {#each tabs as tab (tab.id)}
        <div
          id={`world-downtime-panel-${tab.id}`}
          role="tabpanel"
          tabindex="0"
          aria-labelledby={`world-downtime-tab-${tab.id}`}
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
    The workspace surface is a step DARKER than a card, not lighter. The design's ladder runs
    backdrop -> frame (`--fab-bg-1`) -> cards (`--fab-bg-2`), and the Manager's default main
    pane paints `--fab-bg-2` — which inverts it, leaving this route's cards reading as wells
    cut into a lighter pane instead of panels raised off a darker one. The host states its own
    surface so the preview's cards, the board's rows and a companion's panel all sit on the
    one the design draws.
  */
  .downtime-host {
    display: grid;
    grid-template-rows: auto minmax(0, 1fr);
    min-width: 0;
    min-height: 0;
    height: 100%;
    background: var(--fab-bg-1);
    overflow: hidden;
  }

  .downtime-host.core-fallback {
    grid-template-rows: minmax(0, 1fr) auto;
  }

  .downtime-preview-scroll,
  .downtime-extension-panels {
    min-width: 0;
    min-height: 0;
    overflow: auto;
  }

  /*
    The host states NO inset of its own. The design puts the pane's whole inset on the block
    that holds the stacks, and splitting it between a host and a panel doubled it — a 20px
    left gutter in the design was landing at 34px on screen, on every side, with nothing
    measuring the sum. Each row below owns its own margin instead.
  */
  .downtime-extension-panels {
    padding: 12px 20px 24px;
  }

  .downtime-extension-target {
    min-width: 0;
    min-height: 0;
  }
</style>
